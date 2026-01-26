import { db, schema } from '../config/database.js';
import { eq, and, desc } from 'drizzle-orm';
import { NotFoundError, ValidationError } from '../middleware/errorHandler.js';
import * as auditService from './audit.service.js';
import { withRetryableTransaction } from '../utils/transaction.js';

const { distributions, distributionPayments, tokens, investors, ledgerPositions, eventBusQueue } = schema;

// ============================================================================
// Types
// ============================================================================

export type DistributionType = 'dividend' | 'interest' | 'royalty' | 'revenue_share' | 'rent' | 'profit_share' | 'yield' | 'custom';
export type DistributionStatus = 'draft' | 'announced' | 'approved' | 'processing' | 'completed' | 'cancelled';
export type AllocationStrategy = 'pro_rata' | 'equal' | 'tiered' | 'time_weighted' | 'custom';
export type PaymentMethod = 'on_chain' | 'bank_transfer' | 'mixed';

export interface CreateDistributionInput {
  orgId: string;
  tokenId: string;
  name: string;
  description?: string;
  type: DistributionType;
  totalAmount: string;
  currency: string;
  recordDate: Date;
  paymentDate: Date;
  exDividendDate?: Date;
  allocationStrategy?: AllocationStrategy;
  paymentMethod: PaymentMethod;
  metadata?: Record<string, unknown>;
}

export interface DistributionSummary {
  distributionId: string;
  totalAmount: string;
  totalRecipients: number;
  amountPerToken: string;
  payments: Array<{
    investorId: string;
    walletAddress: string | null;
    tokenBalance: string;
    paymentAmount: string;
    paymentMethod: string;
  }>;
}

// ============================================================================
// Distribution Management
// ============================================================================

export async function createDistribution(input: CreateDistributionInput) {
  const token = await db.query.tokens.findFirst({
    where: and(eq(tokens.id, input.tokenId), eq(tokens.orgId, input.orgId)),
  });
  if (!token) {
    throw new NotFoundError('Token not found');
  }

  if (!/^\d+$/.test(input.totalAmount) || BigInt(input.totalAmount) <= 0n) {
    throw new ValidationError('Total amount must be a positive integer string');
  }

  if (input.paymentDate < input.recordDate) {
    throw new ValidationError('Payment date must be on or after record date');
  }

  const [distribution] = await db.insert(distributions).values({
    orgId: input.orgId,
    tokenId: input.tokenId,
    name: input.name,
    description: input.description,
    type: input.type,
    totalAmount: input.totalAmount,
    currency: input.currency,
    amountPerToken: '0',
    recordDate: input.recordDate.toISOString(),
    paymentDate: input.paymentDate.toISOString(),
    exDividendDate: input.exDividendDate?.toISOString(),
    allocationStrategy: input.allocationStrategy || 'pro_rata',
    paymentMethod: input.paymentMethod,
    status: 'draft',
    metadata: input.metadata || {},
  }).returning();

  await db.insert(eventBusQueue).values({
    orgId: input.orgId,
    topic: 'distribution.created',
    payload: { distributionId: distribution.id, tokenId: input.tokenId, type: input.type },
  });

  await auditService.logSystemAction(
    input.orgId,
    'distribution_created',
    'distribution',
    distribution.id,
    `Distribution "${input.name}" created for ${input.totalAmount} ${input.currency}`,
    { tokenId: input.tokenId, type: input.type }
  );

  return distribution;
}

export async function getDistribution(id: string, orgId: string) {
  const distribution = await db.query.distributions.findFirst({
    where: and(eq(distributions.id, id), eq(distributions.orgId, orgId)),
  });

  if (!distribution) {
    throw new NotFoundError('Distribution not found');
  }

  return distribution;
}

export async function listDistributions(orgId: string, params: {
  tokenId?: string;
  status?: DistributionStatus;
  type?: DistributionType;
  limit?: number;
  offset?: number;
} = {}) {
  const { tokenId, status, type, limit = 50, offset = 0 } = params;

  const conditions = [eq(distributions.orgId, orgId)];
  if (tokenId) conditions.push(eq(distributions.tokenId, tokenId));
  if (status) conditions.push(eq(distributions.status, status));
  if (type) conditions.push(eq(distributions.type, type));

  return db.select()
    .from(distributions)
    .where(and(...conditions))
    .orderBy(desc(distributions.createdAt))
    .limit(limit)
    .offset(offset);
}

export async function calculatePayments(distributionId: string, orgId: string): Promise<DistributionSummary> {
  const distribution = await getDistribution(distributionId, orgId);

  const positions = await db.select()
    .from(ledgerPositions)
    .where(eq(ledgerPositions.tokenId, distribution.tokenId));

  const holders = positions.filter(p => BigInt(p.balance) > 0n);

  if (holders.length === 0) {
    throw new ValidationError('No token holders found for distribution');
  }

  const totalSupplyHeld = holders.reduce((sum, h) => sum + BigInt(h.balance), 0n);
  const totalAmount = BigInt(distribution.totalAmount);
  const amountPerToken = (totalAmount * BigInt(10 ** 18)) / totalSupplyHeld;

  const payments = holders.map(holder => {
    let paymentAmount: bigint;

    switch (distribution.allocationStrategy) {
      case 'pro_rata':
        paymentAmount = (BigInt(holder.balance) * amountPerToken) / BigInt(10 ** 18);
        break;
      case 'equal':
        paymentAmount = totalAmount / BigInt(holders.length);
        break;
      default:
        paymentAmount = (BigInt(holder.balance) * amountPerToken) / BigInt(10 ** 18);
    }

    return {
      investorId: holder.investorId,
      walletAddress: holder.walletAddress,
      tokenBalance: holder.balance,
      paymentAmount: paymentAmount.toString(),
      paymentMethod: distribution.paymentMethod,
    };
  });

  return {
    distributionId,
    totalAmount: distribution.totalAmount,
    totalRecipients: payments.length,
    amountPerToken: amountPerToken.toString(),
    payments,
  };
}

export async function approveDistribution(distributionId: string, orgId: string, approvedBy: string) {
  const distribution = await getDistribution(distributionId, orgId);

  if (distribution.status !== 'draft' && distribution.status !== 'announced') {
    throw new ValidationError(`Cannot approve distribution in ${distribution.status} status`);
  }

  const summary = await calculatePayments(distributionId, orgId);

  await withRetryableTransaction(async (tx) => {
    for (const payment of summary.payments) {
      await tx.insert(distributionPayments).values({
        orgId,
        distributionId,
        investorId: payment.investorId,
        walletAddress: payment.walletAddress,
        tokenBalance: payment.tokenBalance,
        paymentAmount: payment.paymentAmount,
        paymentMethod: payment.paymentMethod,
        status: 'pending',
      });
    }

    await tx.update(distributions)
      .set({
        status: 'approved',
        amountPerToken: summary.amountPerToken,
        totalRecipients: summary.totalRecipients,
        snapshotData: { holders: summary.payments },
        approvedBy,
        approvedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(distributions.id, distributionId));
  }, 3, 100);

  await db.insert(eventBusQueue).values({
    orgId,
    topic: 'distribution.approved',
    payload: { distributionId, totalRecipients: summary.totalRecipients },
  });

  await auditService.logSystemAction(orgId, 'distribution_approved', 'distribution', distributionId,
    `Distribution approved with ${summary.totalRecipients} recipients`, { approvedBy, totalRecipients: summary.totalRecipients });

  return getDistribution(distributionId, orgId);
}

export async function executeDistribution(distributionId: string, orgId: string) {
  const distribution = await getDistribution(distributionId, orgId);

  if (distribution.status !== 'approved') {
    throw new ValidationError(`Cannot execute distribution in ${distribution.status} status`);
  }

  await db.update(distributions)
    .set({ status: 'processing', updatedAt: new Date().toISOString() })
    .where(eq(distributions.id, distributionId));

  await db.insert(eventBusQueue).values({
    orgId,
    topic: 'distribution.execution.started',
    payload: { distributionId },
  });

  const payments = await db.select()
    .from(distributionPayments)
    .where(and(eq(distributionPayments.distributionId, distributionId), eq(distributionPayments.status, 'pending')));

  let processedCount = 0;
  let totalPaid = 0n;

  for (const payment of payments) {
    try {
      await db.update(distributionPayments)
        .set({ status: 'processing' })
        .where(eq(distributionPayments.id, payment.id));
      processedCount++;
      totalPaid += BigInt(payment.paymentAmount);
    } catch (error) {
      await db.update(distributionPayments)
        .set({ status: 'failed', error: error instanceof Error ? error.message : 'Unknown error' })
        .where(eq(distributionPayments.id, payment.id));
    }
  }

  await db.update(distributions)
    .set({ paidRecipients: processedCount, totalPaid: totalPaid.toString(), updatedAt: new Date().toISOString() })
    .where(eq(distributions.id, distributionId));

  await auditService.logSystemAction(orgId, 'distribution_execution_started', 'distribution', distributionId,
    `Distribution execution started for ${processedCount} payments`, { processedCount, totalPaid: totalPaid.toString() });

  return getDistribution(distributionId, orgId);
}

export async function confirmPayment(paymentId: string, orgId: string, confirmation: { txHash?: string; bankReference?: string }) {
  const payment = await db.query.distributionPayments.findFirst({
    where: and(eq(distributionPayments.id, paymentId), eq(distributionPayments.orgId, orgId)),
  });

  if (!payment) throw new NotFoundError('Payment not found');
  if (payment.status !== 'processing') throw new ValidationError(`Cannot confirm payment in ${payment.status} status`);

  const [updated] = await db.update(distributionPayments)
    .set({ status: 'completed', txHash: confirmation.txHash, bankReference: confirmation.bankReference, completedAt: new Date().toISOString() })
    .where(eq(distributionPayments.id, paymentId))
    .returning();

  const remainingPayments = await db.select().from(distributionPayments)
    .where(and(eq(distributionPayments.distributionId, payment.distributionId), eq(distributionPayments.status, 'pending')));
  const processingPayments = await db.select().from(distributionPayments)
    .where(and(eq(distributionPayments.distributionId, payment.distributionId), eq(distributionPayments.status, 'processing')));

  if (remainingPayments.length === 0 && processingPayments.length === 0) {
    await db.update(distributions).set({ status: 'completed', updatedAt: new Date().toISOString() }).where(eq(distributions.id, payment.distributionId));
    await db.insert(eventBusQueue).values({ orgId, topic: 'distribution.completed', payload: { distributionId: payment.distributionId } });
  }

  const completedPayments = await db.select().from(distributionPayments)
    .where(and(eq(distributionPayments.distributionId, payment.distributionId), eq(distributionPayments.status, 'completed')));
  const totalPaid = completedPayments.reduce((sum, p) => sum + BigInt(p.paymentAmount), 0n);

  await db.update(distributions)
    .set({ paidRecipients: completedPayments.length, totalPaid: totalPaid.toString(), updatedAt: new Date().toISOString() })
    .where(eq(distributions.id, payment.distributionId));

  return updated;
}

export async function listPayments(distributionId: string, orgId: string, params?: { status?: string; limit?: number; offset?: number }) {
  const { status, limit = 100, offset = 0 } = params || {};
  const conditions = [eq(distributionPayments.distributionId, distributionId), eq(distributionPayments.orgId, orgId)];
  if (status) conditions.push(eq(distributionPayments.status, status));

  return db.select().from(distributionPayments).where(and(...conditions)).orderBy(desc(distributionPayments.createdAt)).limit(limit).offset(offset);
}

export async function cancelDistribution(distributionId: string, orgId: string, reason: string) {
  const distribution = await getDistribution(distributionId, orgId);

  if (distribution.status === 'completed' || distribution.status === 'cancelled') {
    throw new ValidationError(`Cannot cancel distribution in ${distribution.status} status`);
  }

  await db.update(distributionPayments)
    .set({ status: 'failed', error: `Distribution cancelled: ${reason}` })
    .where(and(eq(distributionPayments.distributionId, distributionId), eq(distributionPayments.status, 'pending')));

  const [updated] = await db.update(distributions)
    .set({ status: 'cancelled', updatedAt: new Date().toISOString() })
    .where(eq(distributions.id, distributionId))
    .returning();

  await db.insert(eventBusQueue).values({ orgId, topic: 'distribution.cancelled', payload: { distributionId, reason } });
  await auditService.logSystemAction(orgId, 'distribution_cancelled', 'distribution', distributionId, `Distribution cancelled: ${reason}`, { reason });

  return updated;
}
