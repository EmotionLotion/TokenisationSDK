import { db, schema } from '../config/database.js';
import { eq, and, desc } from 'drizzle-orm';
import { NotFoundError, ValidationError } from '../middleware/errorHandler.js';
import * as auditService from './audit.service.js';
import { withRetryableTransaction } from '../utils/transaction.js';

const { corporateActions, corporateActionEntitlements, tokens, ledgerPositions, eventBusQueue } = schema;

// ============================================================================
// Types
// ============================================================================

export type CorporateActionType = 'split' | 'reverse_split' | 'conversion' | 'merger' | 'spinoff' | 'name_change';
export type CorporateActionStatus = 'announced' | 'approved' | 'processing' | 'completed' | 'cancelled';

export interface CreateSplitInput {
  orgId: string;
  tokenId: string;
  name: string;
  description?: string;
  ratio: string; // e.g., "2:1" means 2 new for 1 old
  recordDate: Date;
  effectiveDate: Date;
  metadata?: Record<string, unknown>;
}

export interface CreateReverseSplitInput {
  orgId: string;
  tokenId: string;
  name: string;
  description?: string;
  ratio: string; // e.g., "1:4" means 1 new for 4 old
  recordDate: Date;
  effectiveDate: Date;
  metadata?: Record<string, unknown>;
}

export interface CreateConversionInput {
  orgId: string;
  tokenId: string;
  name: string;
  description?: string;
  newTokenId: string;
  conversionRate: string; // e.g., "1.5" means 1.5 new tokens per old
  recordDate: Date;
  effectiveDate: Date;
  metadata?: Record<string, unknown>;
}

export interface EntitlementSummary {
  corporateActionId: string;
  type: CorporateActionType;
  totalEntitlements: number;
  entitlements: Array<{
    investorId: string;
    walletAddress: string;
    originalBalance: string;
    newBalance: string;
    fractionalAmount?: string;
  }>;
}

// ============================================================================
// Corporate Action Creation
// ============================================================================

export async function createSplit(input: CreateSplitInput) {
  const token = await db.query.tokens.findFirst({
    where: and(eq(tokens.id, input.tokenId), eq(tokens.orgId, input.orgId)),
  });
  if (!token) throw new NotFoundError('Token not found');

  const [newShares, oldShares] = input.ratio.split(':').map(Number);
  if (!newShares || !oldShares || oldShares <= 0) {
    throw new ValidationError('Invalid split ratio format. Use "X:Y" format (e.g., "2:1")');
  }

  const multiplier = newShares / oldShares;

  const [action] = await db.insert(corporateActions).values({
    orgId: input.orgId,
    tokenId: input.tokenId,
    type: 'split',
    name: input.name,
    description: input.description,
    parameters: { ratio: input.ratio, multiplier, newShares, oldShares },
    announcementDate: new Date().toISOString(),
    recordDate: input.recordDate.toISOString(),
    effectiveDate: input.effectiveDate.toISOString(),
    status: 'announced',
    metadata: input.metadata || {},
  }).returning();

  await db.insert(eventBusQueue).values({
    orgId: input.orgId,
    topic: 'corporate_action.announced',
    payload: { actionId: action.id, type: 'split', ratio: input.ratio },
  });

  await auditService.logSystemAction(input.orgId, 'corporate_action_created', 'corporate_action', action.id,
    `Stock split ${input.ratio} announced`, { type: 'split', ratio: input.ratio });

  return action;
}

export async function createReverseSplit(input: CreateReverseSplitInput) {
  const token = await db.query.tokens.findFirst({
    where: and(eq(tokens.id, input.tokenId), eq(tokens.orgId, input.orgId)),
  });
  if (!token) throw new NotFoundError('Token not found');

  const [newShares, oldShares] = input.ratio.split(':').map(Number);
  if (!newShares || !oldShares || oldShares <= 0) {
    throw new ValidationError('Invalid ratio format. Use "X:Y" format (e.g., "1:4")');
  }

  const multiplier = newShares / oldShares;

  const [action] = await db.insert(corporateActions).values({
    orgId: input.orgId,
    tokenId: input.tokenId,
    type: 'reverse_split',
    name: input.name,
    description: input.description,
    parameters: { ratio: input.ratio, multiplier, newShares, oldShares },
    announcementDate: new Date().toISOString(),
    recordDate: input.recordDate.toISOString(),
    effectiveDate: input.effectiveDate.toISOString(),
    status: 'announced',
    metadata: input.metadata || {},
  }).returning();

  await db.insert(eventBusQueue).values({
    orgId: input.orgId,
    topic: 'corporate_action.announced',
    payload: { actionId: action.id, type: 'reverse_split', ratio: input.ratio },
  });

  await auditService.logSystemAction(input.orgId, 'corporate_action_created', 'corporate_action', action.id,
    `Reverse split ${input.ratio} announced`, { type: 'reverse_split', ratio: input.ratio });

  return action;
}

export async function createConversion(input: CreateConversionInput) {
  const oldToken = await db.query.tokens.findFirst({
    where: and(eq(tokens.id, input.tokenId), eq(tokens.orgId, input.orgId)),
  });
  if (!oldToken) throw new NotFoundError('Source token not found');

  const newToken = await db.query.tokens.findFirst({
    where: and(eq(tokens.id, input.newTokenId), eq(tokens.orgId, input.orgId)),
  });
  if (!newToken) throw new NotFoundError('Target token not found');

  const conversionRate = parseFloat(input.conversionRate);
  if (isNaN(conversionRate) || conversionRate <= 0) {
    throw new ValidationError('Invalid conversion rate');
  }

  const [action] = await db.insert(corporateActions).values({
    orgId: input.orgId,
    tokenId: input.tokenId,
    type: 'conversion',
    name: input.name,
    description: input.description,
    parameters: { conversionRate: input.conversionRate, newTokenId: input.newTokenId },
    announcementDate: new Date().toISOString(),
    recordDate: input.recordDate.toISOString(),
    effectiveDate: input.effectiveDate.toISOString(),
    newTokenId: input.newTokenId,
    status: 'announced',
    metadata: input.metadata || {},
  }).returning();

  await db.insert(eventBusQueue).values({
    orgId: input.orgId,
    topic: 'corporate_action.announced',
    payload: { actionId: action.id, type: 'conversion', conversionRate: input.conversionRate },
  });

  await auditService.logSystemAction(input.orgId, 'corporate_action_created', 'corporate_action', action.id,
    `Token conversion announced at rate ${input.conversionRate}`, { type: 'conversion', conversionRate: input.conversionRate });

  return action;
}

// ============================================================================
// Query Functions
// ============================================================================

export async function getCorporateAction(id: string, orgId: string) {
  const action = await db.query.corporateActions.findFirst({
    where: and(eq(corporateActions.id, id), eq(corporateActions.orgId, orgId)),
  });
  if (!action) throw new NotFoundError('Corporate action not found');
  return action;
}

export async function listCorporateActions(orgId: string, params: {
  tokenId?: string;
  type?: CorporateActionType;
  status?: CorporateActionStatus;
  limit?: number;
  offset?: number;
} = {}) {
  const { tokenId, type, status, limit = 50, offset = 0 } = params;

  const conditions = [eq(corporateActions.orgId, orgId)];
  if (tokenId) conditions.push(eq(corporateActions.tokenId, tokenId));
  if (type) conditions.push(eq(corporateActions.type, type));
  if (status) conditions.push(eq(corporateActions.status, status));

  return db.select().from(corporateActions).where(and(...conditions))
    .orderBy(desc(corporateActions.createdAt)).limit(limit).offset(offset);
}

// ============================================================================
// Approval & Calculation
// ============================================================================

export async function calculateEntitlements(actionId: string, orgId: string): Promise<EntitlementSummary> {
  const action = await getCorporateAction(actionId, orgId);
  const params = action.parameters as Record<string, unknown>;

  const positions = await db.select().from(ledgerPositions)
    .where(eq(ledgerPositions.tokenId, action.tokenId));

  const holders = positions.filter(p => BigInt(p.balance) > 0n);

  const entitlements = holders.map(holder => {
    const originalBalance = BigInt(holder.balance);
    let newBalance: bigint;
    let fractionalAmount: bigint | undefined;

    switch (action.type) {
      case 'split':
      case 'reverse_split': {
        const multiplier = params.multiplier as number;
        const rawNewBalance = Number(originalBalance) * multiplier;
        newBalance = BigInt(Math.floor(rawNewBalance));
        const fractional = rawNewBalance - Math.floor(rawNewBalance);
        if (fractional > 0) {
          fractionalAmount = BigInt(Math.floor(fractional * 1e18));
        }
        break;
      }
      case 'conversion': {
        const rate = parseFloat(params.conversionRate as string);
        const rawNewBalance = Number(originalBalance) * rate;
        newBalance = BigInt(Math.floor(rawNewBalance));
        const fractional = rawNewBalance - Math.floor(rawNewBalance);
        if (fractional > 0) {
          fractionalAmount = BigInt(Math.floor(fractional * 1e18));
        }
        break;
      }
      default:
        newBalance = originalBalance;
    }

    return {
      investorId: holder.investorId,
      walletAddress: holder.walletAddress,
      originalBalance: originalBalance.toString(),
      newBalance: newBalance.toString(),
      fractionalAmount: fractionalAmount?.toString(),
    };
  });

  return {
    corporateActionId: actionId,
    type: action.type as CorporateActionType,
    totalEntitlements: entitlements.length,
    entitlements,
  };
}

export async function approveCorporateAction(actionId: string, orgId: string, approvedBy: string) {
  const action = await getCorporateAction(actionId, orgId);

  if (action.status !== 'announced') {
    throw new ValidationError(`Cannot approve action in ${action.status} status`);
  }

  const summary = await calculateEntitlements(actionId, orgId);

  await withRetryableTransaction(async (tx) => {
    for (const ent of summary.entitlements) {
      await tx.insert(corporateActionEntitlements).values({
        orgId,
        corporateActionId: actionId,
        investorId: ent.investorId,
        walletAddress: ent.walletAddress,
        originalBalance: ent.originalBalance,
        originalTokenId: action.tokenId,
        newBalance: ent.newBalance,
        newTokenId: action.newTokenId || action.tokenId,
        fractionalAmount: ent.fractionalAmount,
        status: 'pending',
      });
    }

    await tx.update(corporateActions).set({
      status: 'approved',
      totalEntitlements: summary.totalEntitlements,
      approvedBy,
      approvedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }).where(eq(corporateActions.id, actionId));
  }, 3, 100);

  await db.insert(eventBusQueue).values({
    orgId,
    topic: 'corporate_action.approved',
    payload: { actionId, totalEntitlements: summary.totalEntitlements },
  });

  await auditService.logSystemAction(orgId, 'corporate_action_approved', 'corporate_action', actionId,
    `Corporate action approved with ${summary.totalEntitlements} entitlements`, { approvedBy, totalEntitlements: summary.totalEntitlements });

  return getCorporateAction(actionId, orgId);
}

// ============================================================================
// Execution
// ============================================================================

export async function executeCorporateAction(actionId: string, orgId: string, executedBy: string) {
  const action = await getCorporateAction(actionId, orgId);

  if (action.status !== 'approved') {
    throw new ValidationError(`Cannot execute action in ${action.status} status`);
  }

  await db.update(corporateActions).set({ status: 'processing', updatedAt: new Date().toISOString() })
    .where(eq(corporateActions.id, actionId));

  const entitlements = await db.select().from(corporateActionEntitlements)
    .where(and(eq(corporateActionEntitlements.corporateActionId, actionId), eq(corporateActionEntitlements.status, 'pending')));

  let processedCount = 0;

  await withRetryableTransaction(async (tx) => {
    for (const ent of entitlements) {
      const targetTokenId = ent.newTokenId || action.tokenId;

      // Update or create position for new token
      const existingPosition = await tx.query.ledgerPositions.findFirst({
        where: and(eq(ledgerPositions.tokenId, targetTokenId), eq(ledgerPositions.walletAddress, ent.walletAddress.toLowerCase())),
      });

      if (action.type === 'conversion' && action.newTokenId) {
        // For conversions: zero out old position, credit new token
        await tx.update(ledgerPositions).set({ balance: '0', lastMovementAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
          .where(and(eq(ledgerPositions.tokenId, action.tokenId), eq(ledgerPositions.walletAddress, ent.walletAddress.toLowerCase())));

        if (existingPosition && existingPosition.tokenId === targetTokenId) {
          const newBalance = BigInt(existingPosition.balance) + BigInt(ent.newBalance || '0');
          await tx.update(ledgerPositions).set({ balance: newBalance.toString(), lastMovementAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
            .where(eq(ledgerPositions.id, existingPosition.id));
        } else {
          await tx.insert(ledgerPositions).values({
            orgId, tokenId: targetTokenId, investorId: ent.investorId, walletAddress: ent.walletAddress.toLowerCase(),
            balance: ent.newBalance || '0', lastMovementAt: new Date().toISOString(),
          });
        }
      } else {
        // For splits: update existing position
        await tx.update(ledgerPositions).set({ balance: ent.newBalance || '0', lastMovementAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
          .where(and(eq(ledgerPositions.tokenId, action.tokenId), eq(ledgerPositions.walletAddress, ent.walletAddress.toLowerCase())));
      }

      await tx.update(corporateActionEntitlements).set({ status: 'processed', processedAt: new Date().toISOString() })
        .where(eq(corporateActionEntitlements.id, ent.id));

      processedCount++;
    }

    await tx.update(corporateActions).set({
      status: 'completed',
      processedEntitlements: processedCount,
      executedBy,
      executedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }).where(eq(corporateActions.id, actionId));
  }, 3, 100);

  await db.insert(eventBusQueue).values({
    orgId,
    topic: 'corporate_action.completed',
    payload: { actionId, processedCount },
  });

  await auditService.logSystemAction(orgId, 'corporate_action_executed', 'corporate_action', actionId,
    `Corporate action executed: ${processedCount} positions updated`, { executedBy, processedCount });

  return getCorporateAction(actionId, orgId);
}

export async function listEntitlements(actionId: string, orgId: string, params?: { status?: string; limit?: number; offset?: number }) {
  const { status, limit = 100, offset = 0 } = params || {};
  const conditions = [eq(corporateActionEntitlements.corporateActionId, actionId), eq(corporateActionEntitlements.orgId, orgId)];
  if (status) conditions.push(eq(corporateActionEntitlements.status, status));

  return db.select().from(corporateActionEntitlements).where(and(...conditions)).orderBy(desc(corporateActionEntitlements.createdAt)).limit(limit).offset(offset);
}

export async function cancelCorporateAction(actionId: string, orgId: string, reason: string) {
  const action = await getCorporateAction(actionId, orgId);

  if (action.status === 'completed' || action.status === 'cancelled') {
    throw new ValidationError(`Cannot cancel action in ${action.status} status`);
  }

  await db.update(corporateActionEntitlements)
    .set({ status: 'failed', error: `Corporate action cancelled: ${reason}` })
    .where(and(eq(corporateActionEntitlements.corporateActionId, actionId), eq(corporateActionEntitlements.status, 'pending')));

  const [updated] = await db.update(corporateActions)
    .set({ status: 'cancelled', updatedAt: new Date().toISOString() })
    .where(eq(corporateActions.id, actionId))
    .returning();

  await db.insert(eventBusQueue).values({ orgId, topic: 'corporate_action.cancelled', payload: { actionId, reason } });
  await auditService.logSystemAction(orgId, 'corporate_action_cancelled', 'corporate_action', actionId, `Corporate action cancelled: ${reason}`, { reason });

  return updated;
}
