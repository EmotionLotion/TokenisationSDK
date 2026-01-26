import { db, schema } from '../config/database.js';
import { eq, and, desc, sql } from 'drizzle-orm';
import { NotFoundError, ValidationError } from '../middleware/errorHandler.js';
import * as auditService from './audit.service.js';
import * as domainEvents from './domainEvents.service.js';
import { withRetryableTransaction } from '../utils/transaction.js';
import { logger } from '../middleware/logger.js';

const { distributions, distributionPayments, tokens, investors, ledgerPositions, eventBusQueue, capTableSnapshots } = schema;

// ============================================================================
// CRITICAL: All amounts are stored in SMALLEST UNITS (BigInt as string)
// No decimal/floating point math in DB - use integer arithmetic only!
// Example: For USDC (6 decimals), 1000000 = $1.00
// ============================================================================

// ============================================================================
// Types
// ============================================================================

export type DistributionType = 'dividend' | 'interest' | 'royalty' | 'revenue_share' | 'rent' | 'profit_share' | 'yield' | 'custom';
export type DistributionStatus = 'draft' | 'announced' | 'snapshot_taken' | 'approved' | 'processing' | 'completed' | 'cancelled';
export type AllocationStrategy = 'pro_rata' | 'equal' | 'tiered' | 'time_weighted' | 'custom';
export type PaymentMethod = 'on_chain' | 'bank_transfer' | 'mixed';

// Rounding policy for distribution calculations
export type RoundingPolicy = 'round_down' | 'round_up' | 'round_half_up' | 'accumulate_remainder';

// ============================================================================
// Amount Validation (CRITICAL - No decimals allowed!)
// ============================================================================

/**
 * Validate that an amount is a valid BigInt string (no decimals).
 * All amounts must be in smallest units.
 */
function validateSmallestUnits(value: string, fieldName: string): void {
  if (!/^-?\d+$/.test(value)) {
    throw new ValidationError(
      `${fieldName} must be in smallest units (integer string, no decimals). ` +
      `Got: "${value}". For USDC, use 1000000 for $1.00.`
    );
  }
  try {
    BigInt(value);
  } catch {
    throw new ValidationError(`${fieldName} is not a valid integer: ${value}`);
  }
}

/**
 * Convert human-readable amount to smallest units.
 * Use this helper when accepting user input.
 */
export function toSmallestUnits(amount: number | string, decimals: number): string {
  const str = typeof amount === 'number' ? amount.toString() : amount;
  const [intPart, decPart = ''] = str.split('.');
  const paddedDec = decPart.padEnd(decimals, '0').slice(0, decimals);
  return BigInt(intPart + paddedDec).toString();
}

/**
 * Convert smallest units to human-readable amount.
 * Use this helper for display purposes only.
 */
export function fromSmallestUnits(smallest: string, decimals: number): string {
  const value = BigInt(smallest);
  const divisor = 10n ** BigInt(decimals);
  const intPart = value / divisor;
  const decPart = (value % divisor).toString().padStart(decimals, '0');
  return decPart === '0'.repeat(decimals)
    ? intPart.toString()
    : `${intPart}.${decPart.replace(/0+$/, '')}`;
}

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
        approvedAt: new Date(),
        updatedAt: new Date(),
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
    .set({ status: 'processing', updatedAt: new Date() })
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
    .set({ paidRecipients: processedCount, totalPaid: totalPaid.toString(), updatedAt: new Date() })
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
    .set({ status: 'completed', txHash: confirmation.txHash, bankReference: confirmation.bankReference, completedAt: new Date() })
    .where(eq(distributionPayments.id, paymentId))
    .returning();

  const remainingPayments = await db.select().from(distributionPayments)
    .where(and(eq(distributionPayments.distributionId, payment.distributionId), eq(distributionPayments.status, 'pending')));
  const processingPayments = await db.select().from(distributionPayments)
    .where(and(eq(distributionPayments.distributionId, payment.distributionId), eq(distributionPayments.status, 'processing')));

  if (remainingPayments.length === 0 && processingPayments.length === 0) {
    await db.update(distributions).set({ status: 'completed', updatedAt: new Date() }).where(eq(distributions.id, payment.distributionId));
    await db.insert(eventBusQueue).values({ orgId, topic: 'distribution.completed', payload: { distributionId: payment.distributionId } });
  }

  const completedPayments = await db.select().from(distributionPayments)
    .where(and(eq(distributionPayments.distributionId, payment.distributionId), eq(distributionPayments.status, 'completed')));
  const totalPaid = completedPayments.reduce((sum, p) => sum + BigInt(p.paymentAmount), 0n);

  await db.update(distributions)
    .set({ paidRecipients: completedPayments.length, totalPaid: totalPaid.toString(), updatedAt: new Date() })
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
    .set({ status: 'cancelled', updatedAt: new Date() })
    .where(eq(distributions.id, distributionId))
    .returning();

  await db.insert(eventBusQueue).values({ orgId, topic: 'distribution.cancelled', payload: { distributionId, reason } });
  await auditService.logSystemAction(orgId, 'distribution_cancelled', 'distribution', distributionId, `Distribution cancelled: ${reason}`, { reason });

  return updated;
}

// ============================================================================
// Record Date Cap Table Snapshot
// ============================================================================

export interface SnapshotResult {
  snapshotId: string;
  recordDate: Date;
  totalHolders: number;
  totalTokens: string;
  positions: Array<{
    investorId: string | null;
    walletAddress: string;
    balance: string;
  }>;
}

/**
 * Take a cap table snapshot at the record date.
 * This captures the exact token positions for distribution calculation.
 * The snapshot is immutable and provides audit evidence.
 */
export async function takeRecordDateSnapshot(
  distributionId: string,
  orgId: string
): Promise<SnapshotResult> {
  const distribution = await getDistribution(distributionId, orgId);

  if (distribution.status !== 'draft' && distribution.status !== 'announced') {
    throw new ValidationError(
      `Cannot take snapshot for distribution in ${distribution.status} status. ` +
      `Must be 'draft' or 'announced'.`
    );
  }

  return await db.transaction(async (tx) => {
    // Get all positions for this token
    const positions = await tx.select({
      investorId: ledgerPositions.investorId,
      walletAddress: ledgerPositions.walletAddress,
      balance: ledgerPositions.balance,
    })
      .from(ledgerPositions)
      .where(and(
        eq(ledgerPositions.tokenId, distribution.tokenId),
        eq(ledgerPositions.orgId, orgId)
      ));

    // Filter out zero balances
    const nonZeroPositions = positions.filter(p => BigInt(p.balance) > 0n);

    if (nonZeroPositions.length === 0) {
      throw new ValidationError('No token holders found at record date');
    }

    // Calculate total tokens held
    const totalTokens = nonZeroPositions.reduce(
      (sum, p) => sum + BigInt(p.balance),
      0n
    ).toString();

    // Create immutable snapshot
    const snapshotData = {
      distributionId,
      recordDate: distribution.recordDate,
      capturedAt: new Date(),
      totalHolders: nonZeroPositions.length,
      totalTokens,
      positions: nonZeroPositions.map(p => ({
        investorId: p.investorId,
        walletAddress: p.walletAddress,
        balance: p.balance,
      })),
    };

    // Store snapshot in cap_table_snapshots table
    const [snapshot] = await tx.insert(capTableSnapshots).values({
      orgId,
      tokenId: distribution.tokenId,
      asOf: distribution.recordDate,
      snapshot: snapshotData as any,
      totalHolders: nonZeroPositions.length,
      totalSupply: totalTokens,
      generatedBy: 'distribution_record_date',
      metadata: {
        distributionId,
        distributionName: distribution.name,
        triggerType: 'distribution_record_date',
      },
    }).returning();

    // Update distribution with snapshot reference
    await tx.update(distributions)
      .set({
        status: 'snapshot_taken',
        snapshotData: snapshotData as any,
        totalRecipients: nonZeroPositions.length,
        updatedAt: new Date(),
      })
      .where(eq(distributions.id, distributionId));

    // Emit domain event
    await domainEvents.emitEvent(tx, {
      eventType: 'distribution.snapshot_taken',
      aggregateType: 'distribution',
      aggregateId: distributionId,
      orgId,
      payload: {
        distributionId,
        snapshotId: snapshot.id,
        totalHolders: nonZeroPositions.length,
        totalTokens,
        recordDate: distribution.recordDate,
      },
    });

    // Audit log
    await auditService.log({
      orgId,
      actorType: 'system',
      action: 'distribution_snapshot_taken',
      resourceType: 'distribution',
      resourceId: distributionId,
      description: `Cap table snapshot taken with ${nonZeroPositions.length} holders`,
      metadata: {
        snapshotId: snapshot.id,
        totalHolders: nonZeroPositions.length,
        totalTokens,
      },
    });

    return {
      snapshotId: snapshot.id,
      recordDate: distribution.recordDate,
      totalHolders: nonZeroPositions.length,
      totalTokens,
      positions: nonZeroPositions,
    };
  });
}

// ============================================================================
// Precise Distribution Calculation (Integer Math Only)
// ============================================================================

export interface PreciseCalculationResult {
  distributionId: string;
  amountPerToken: string; // In smallest units
  totalDistributed: string;
  remainder: string; // Undistributed due to rounding
  roundingPolicy: RoundingPolicy;
  payments: Array<{
    investorId: string | null;
    walletAddress: string;
    tokenBalance: string;
    paymentAmount: string;
  }>;
}

/**
 * Calculate distribution payments using pure integer arithmetic.
 * No floating point operations - uses BigInt for precision.
 *
 * @param roundingPolicy How to handle fractional amounts
 */
export async function calculatePrecisePayments(
  distributionId: string,
  orgId: string,
  roundingPolicy: RoundingPolicy = 'round_down'
): Promise<PreciseCalculationResult> {
  const distribution = await getDistribution(distributionId, orgId);

  if (distribution.status !== 'snapshot_taken' && distribution.status !== 'announced') {
    throw new ValidationError(
      `Cannot calculate payments for distribution in ${distribution.status} status. ` +
      `Must have snapshot taken first.`
    );
  }

  // Get snapshot data
  const snapshotData = distribution.snapshotData as {
    positions: Array<{ investorId: string | null; walletAddress: string; balance: string }>;
    totalTokens: string;
  };

  if (!snapshotData?.positions?.length) {
    throw new ValidationError('No snapshot data available. Take a snapshot first.');
  }

  const totalAmount = BigInt(distribution.totalAmount);
  const totalTokens = BigInt(snapshotData.totalTokens);

  if (totalTokens === 0n) {
    throw new ValidationError('Total tokens is zero - cannot distribute');
  }

  // Calculate per-token amount using high precision intermediate
  // We use 36 decimal precision to avoid overflow while maintaining accuracy
  const PRECISION = 10n ** 36n;
  const amountPerTokenPrecise = (totalAmount * PRECISION) / totalTokens;

  // Calculate individual payments
  const payments: PreciseCalculationResult['payments'] = [];
  let totalDistributed = 0n;

  for (const position of snapshotData.positions) {
    const balance = BigInt(position.balance);

    // Calculate payment: (balance * totalAmount) / totalTokens
    // Using high precision to minimize rounding errors
    let payment = (balance * amountPerTokenPrecise) / PRECISION;

    // Apply rounding policy
    const remainder = (balance * amountPerTokenPrecise) % PRECISION;
    if (remainder > 0n) {
      switch (roundingPolicy) {
        case 'round_up':
          payment += 1n;
          break;
        case 'round_half_up':
          if (remainder * 2n >= PRECISION) {
            payment += 1n;
          }
          break;
        case 'round_down':
        case 'accumulate_remainder':
        default:
          // No adjustment - default behavior
          break;
      }
    }

    payments.push({
      investorId: position.investorId,
      walletAddress: position.walletAddress,
      tokenBalance: position.balance,
      paymentAmount: payment.toString(),
    });

    totalDistributed += payment;
  }

  // Calculate remainder
  const distributionRemainder = totalAmount - totalDistributed;

  // Verify no over-distribution (critical check)
  if (totalDistributed > totalAmount && roundingPolicy !== 'round_up') {
    logger.error('Distribution calculation error: over-distribution detected', {
      metadata: {
        distributionId,
        totalAmount: totalAmount.toString(),
        totalDistributed: totalDistributed.toString(),
        difference: (totalDistributed - totalAmount).toString(),
      },
    });
    throw new ValidationError('Calculation error: distributed more than available');
  }

  return {
    distributionId,
    amountPerToken: (amountPerTokenPrecise / (PRECISION / (10n ** 18n))).toString(),
    totalDistributed: totalDistributed.toString(),
    remainder: distributionRemainder.toString(),
    roundingPolicy,
    payments,
  };
}

// ============================================================================
// Idempotent Payment Execution
// ============================================================================

/**
 * Execute distribution payments idempotently.
 * Safe to re-run - will not double-pay.
 */
export async function executePaymentsIdempotent(
  distributionId: string,
  orgId: string,
  options: {
    batchSize?: number;
    dryRun?: boolean;
  } = {}
): Promise<{
  processed: number;
  successful: number;
  skipped: number;
  failed: number;
  totalPaid: string;
}> {
  const { batchSize = 100, dryRun = false } = options;

  const distribution = await getDistribution(distributionId, orgId);

  if (distribution.status !== 'approved' && distribution.status !== 'processing') {
    throw new ValidationError(
      `Cannot execute payments for distribution in ${distribution.status} status`
    );
  }

  // Get pending payments only
  const pendingPayments = await db.select()
    .from(distributionPayments)
    .where(and(
      eq(distributionPayments.distributionId, distributionId),
      eq(distributionPayments.status, 'pending')
    ))
    .limit(batchSize);

  if (pendingPayments.length === 0) {
    // Check if all complete
    const anyRemaining = await db.select({ count: sql<number>`count(*)` })
      .from(distributionPayments)
      .where(and(
        eq(distributionPayments.distributionId, distributionId),
        eq(distributionPayments.status, 'pending')
      ));

    if (anyRemaining[0]?.count === 0) {
      // Mark distribution as completed
      if (!dryRun) {
        await db.update(distributions)
          .set({ status: 'completed', updatedAt: new Date() })
          .where(eq(distributions.id, distributionId));
      }
    }

    return {
      processed: 0,
      successful: 0,
      skipped: 0,
      failed: 0,
      totalPaid: '0',
    };
  }

  // Update distribution to processing
  if (distribution.status === 'approved' && !dryRun) {
    await db.update(distributions)
      .set({ status: 'processing', updatedAt: new Date() })
      .where(eq(distributions.id, distributionId));
  }

  let successful = 0;
  let failed = 0;
  let skipped = 0;
  let totalPaid = 0n;

  for (const payment of pendingPayments) {
    if (dryRun) {
      successful++;
      totalPaid += BigInt(payment.paymentAmount);
      continue;
    }

    try {
      // Check for idempotency - skip if already processed
      const current = await db.query.distributionPayments.findFirst({
        where: eq(distributionPayments.id, payment.id),
      });

      if (current?.status !== 'pending') {
        skipped++;
        continue;
      }

      // Mark as processing
      await db.update(distributionPayments)
        .set({ status: 'processing', updatedAt: new Date() })
        .where(and(
          eq(distributionPayments.id, payment.id),
          eq(distributionPayments.status, 'pending') // Optimistic locking
        ));

      // In production, this would call the chain service
      // For now, mark as processing (chain listener will confirm)

      successful++;
      totalPaid += BigInt(payment.paymentAmount);

      // Emit event
      await domainEvents.emitEvent(db, {
        eventType: domainEvents.EVENT_TYPES.DISTRIBUTION_PAYOUT_SENT,
        aggregateType: 'distribution',
        aggregateId: distributionId,
        orgId,
        payload: {
          paymentId: payment.id,
          investorId: payment.investorId,
          walletAddress: payment.walletAddress,
          amount: payment.paymentAmount,
          currency: distribution.currency,
        },
      });

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      await db.update(distributionPayments)
        .set({
          status: 'failed',
          error: errorMsg,
          updatedAt: new Date(),
        })
        .where(eq(distributionPayments.id, payment.id));

      failed++;

      logger.error(`Distribution payment failed: ${payment.id}`, {
        error: error instanceof Error ? error : new Error(errorMsg),
        metadata: { distributionId, paymentId: payment.id },
      });
    }
  }

  return {
    processed: pendingPayments.length,
    successful,
    skipped,
    failed,
    totalPaid: totalPaid.toString(),
  };
}
