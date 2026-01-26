import { db, schema } from '../config/database.js';
import { eq, and, lt, desc, gte, inArray } from 'drizzle-orm';
import { NotFoundError, ValidationError } from '../middleware/errorHandler.js';
import * as eventbusService from './eventbus.service.js';
import * as auditService from './audit.service.js';

const { settlements, transfers, issuances, redemptions } = schema;

// ============================================================================
// Types & Interfaces
// ============================================================================

export type FinalityStatus = 'pending' | 'finalized' | 'reorged';

export interface SettlementRecord {
  id: string;
  orgId: string;
  transferId: string | null;
  issuanceId: string | null;
  redemptionId: string | null;
  txHash: string;
  chainId: number;
  finalityStatus: FinalityStatus;
  confirmedBlock: number | null;
  finalizedBlock: number | null;
  confirmations: number;
  requiredConfirmations: number;
  indexedAt: Date | null;
  finalizedAt: Date | null;
  reorgedAt: Date | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateSettlementInput {
  orgId: string;
  txHash: string;
  chainId: number;
  transferId?: string;
  issuanceId?: string;
  redemptionId?: string;
  confirmedBlock?: number;
  requiredConfirmations?: number;
  metadata?: Record<string, unknown>;
}

export interface SettlementQueryParams {
  finalityStatus?: FinalityStatus;
  chainId?: number;
  fromDate?: Date;
  toDate?: Date;
  limit?: number;
  offset?: number;
}

// Chain finality configurations (blocks required for finality)
export const CHAIN_FINALITY_CONFIG: Record<number, number> = {
  1: 12,        // Ethereum mainnet
  137: 256,     // Polygon
  42161: 1,     // Arbitrum (L2)
  10: 1,        // Optimism (L2)
  8453: 1,      // Base (L2)
  11155111: 6,  // Sepolia testnet
  80002: 32,    // Amoy testnet (Polygon)
};

// ============================================================================
// Settlement CRUD
// ============================================================================

/**
 * Creates a new settlement record for tracking transaction finality.
 */
export async function createSettlement(input: CreateSettlementInput): Promise<SettlementRecord> {
  const requiredConfirmations = input.requiredConfirmations
    ?? CHAIN_FINALITY_CONFIG[input.chainId]
    ?? 12;

  // Verify at least one reference is provided
  if (!input.transferId && !input.issuanceId && !input.redemptionId) {
    throw new ValidationError('Settlement must reference a transfer, issuance, or redemption');
  }

  // Check for duplicate by txHash
  const existing = await db.query.settlements.findFirst({
    where: and(
      eq(settlements.txHash, input.txHash),
      eq(settlements.chainId, input.chainId)
    ),
  });

  if (existing) {
    return existing as SettlementRecord;
  }

  const [settlement] = await db.insert(settlements).values({
    orgId: input.orgId,
    txHash: input.txHash,
    chainId: input.chainId,
    transferId: input.transferId,
    issuanceId: input.issuanceId,
    redemptionId: input.redemptionId,
    confirmedBlock: input.confirmedBlock,
    requiredConfirmations,
    confirmations: 0,
    finalityStatus: 'pending',
    indexedAt: input.confirmedBlock ? new Date() : null,
    metadata: input.metadata || {},
  }).returning();

  // Audit log
  await auditService.logAction({
    orgId: input.orgId,
    action: 'settlement.created',
    entityType: 'settlement',
    entityId: settlement.id,
    changes: {
      txHash: input.txHash,
      chainId: input.chainId,
      requiredConfirmations,
    },
  });

  return settlement as SettlementRecord;
}

/**
 * Gets a settlement by ID.
 */
export async function getSettlement(id: string, orgId: string): Promise<SettlementRecord> {
  const settlement = await db.query.settlements.findFirst({
    where: and(eq(settlements.id, id), eq(settlements.orgId, orgId)),
  });

  if (!settlement) {
    throw new NotFoundError('Settlement not found');
  }

  return settlement as SettlementRecord;
}

/**
 * Gets a settlement by transaction hash.
 */
export async function getSettlementByTxHash(
  txHash: string,
  chainId: number
): Promise<SettlementRecord | null> {
  const settlement = await db.query.settlements.findFirst({
    where: and(
      eq(settlements.txHash, txHash),
      eq(settlements.chainId, chainId)
    ),
  });

  return settlement as SettlementRecord | null;
}

/**
 * Lists settlements for an organization with optional filters.
 */
export async function listSettlements(
  orgId: string,
  params: SettlementQueryParams = {}
): Promise<SettlementRecord[]> {
  const { finalityStatus, chainId, fromDate, toDate, limit = 100, offset = 0 } = params;

  const conditions = [eq(settlements.orgId, orgId)];

  if (finalityStatus) {
    conditions.push(eq(settlements.finalityStatus, finalityStatus));
  }
  if (chainId) {
    conditions.push(eq(settlements.chainId, chainId));
  }
  if (fromDate) {
    conditions.push(gte(settlements.createdAt, fromDate));
  }
  if (toDate) {
    conditions.push(lt(settlements.createdAt, toDate));
  }

  const results = await db.select()
    .from(settlements)
    .where(and(...conditions))
    .orderBy(desc(settlements.createdAt))
    .limit(limit)
    .offset(offset);

  return results as SettlementRecord[];
}

// ============================================================================
// Finality Tracking
// ============================================================================

/**
 * Updates confirmation count for a settlement based on current block height.
 */
export async function updateConfirmations(
  id: string,
  currentBlock: number
): Promise<SettlementRecord> {
  const settlement = await db.query.settlements.findFirst({
    where: eq(settlements.id, id),
  });

  if (!settlement) {
    throw new NotFoundError('Settlement not found');
  }

  if (!settlement.confirmedBlock) {
    throw new ValidationError('Settlement has no confirmed block');
  }

  const confirmations = currentBlock - settlement.confirmedBlock;
  const wasFinalized = settlement.finalityStatus === 'finalized';
  const isNowFinalized = confirmations >= settlement.requiredConfirmations;

  const updateData: Record<string, unknown> = {
    confirmations: Math.max(0, confirmations),
    updatedAt: new Date(),
  };

  if (isNowFinalized && !wasFinalized) {
    updateData.finalityStatus = 'finalized';
    updateData.finalizedBlock = currentBlock;
    updateData.finalizedAt = new Date();
  }

  const [updated] = await db.update(settlements)
    .set(updateData)
    .where(eq(settlements.id, id))
    .returning();

  // Emit finality event if just finalized
  if (isNowFinalized && !wasFinalized) {
    await eventbusService.publish({
      orgId: settlement.orgId,
      topic: 'settlement.finalized',
      payload: {
        settlementId: id,
        txHash: settlement.txHash,
        chainId: settlement.chainId,
        confirmations,
        transferId: settlement.transferId,
        issuanceId: settlement.issuanceId,
        redemptionId: settlement.redemptionId,
      },
    });

    // Update related transfer/issuance/redemption status
    if (settlement.transferId) {
      await db.update(transfers)
        .set({ status: 'settled', updatedAt: new Date() })
        .where(eq(transfers.id, settlement.transferId));
    }

    await auditService.logAction({
      orgId: settlement.orgId,
      action: 'settlement.finalized',
      entityType: 'settlement',
      entityId: id,
      changes: {
        confirmations,
        finalizedBlock: currentBlock,
      },
    });
  }

  return updated as SettlementRecord;
}

/**
 * Marks a settlement as reorged (chain reorganization detected).
 */
export async function markAsReorged(
  id: string,
  reason: string
): Promise<SettlementRecord> {
  const settlement = await db.query.settlements.findFirst({
    where: eq(settlements.id, id),
  });

  if (!settlement) {
    throw new NotFoundError('Settlement not found');
  }

  const [updated] = await db.update(settlements)
    .set({
      finalityStatus: 'reorged',
      reorgedAt: new Date(),
      metadata: {
        ...(settlement.metadata as Record<string, unknown>),
        reorgReason: reason,
        previousStatus: settlement.finalityStatus,
      },
      updatedAt: new Date(),
    })
    .where(eq(settlements.id, id))
    .returning();

  // Emit reorg event
  await eventbusService.publish({
    orgId: settlement.orgId,
    topic: 'settlement.reorged',
    payload: {
      settlementId: id,
      txHash: settlement.txHash,
      chainId: settlement.chainId,
      reason,
      transferId: settlement.transferId,
      issuanceId: settlement.issuanceId,
      redemptionId: settlement.redemptionId,
    },
  });

  // Mark related transfer as failed if exists
  if (settlement.transferId) {
    await db.update(transfers)
      .set({
        status: 'failed',
        error: `Chain reorg detected: ${reason}`,
        updatedAt: new Date()
      })
      .where(eq(transfers.id, settlement.transferId));
  }

  await auditService.logAction({
    orgId: settlement.orgId,
    action: 'settlement.reorged',
    entityType: 'settlement',
    entityId: id,
    changes: { reason },
  });

  return updated as SettlementRecord;
}

/**
 * Batch update confirmations for all pending settlements on a chain.
 */
export async function updateChainConfirmations(
  chainId: number,
  currentBlock: number
): Promise<{ updated: number; finalized: number }> {
  // Get all pending settlements for this chain
  const pendingSettlements = await db.select()
    .from(settlements)
    .where(and(
      eq(settlements.chainId, chainId),
      eq(settlements.finalityStatus, 'pending')
    ));

  let updated = 0;
  let finalized = 0;

  for (const settlement of pendingSettlements) {
    if (settlement.confirmedBlock) {
      const result = await updateConfirmations(settlement.id, currentBlock);
      updated++;
      if (result.finalityStatus === 'finalized') {
        finalized++;
      }
    }
  }

  return { updated, finalized };
}

// ============================================================================
// Statistics
// ============================================================================

/**
 * Gets settlement statistics for an organization.
 */
export async function getSettlementStats(orgId: string): Promise<{
  total: number;
  pending: number;
  finalized: number;
  reorged: number;
  byChain: Record<number, { pending: number; finalized: number; reorged: number }>;
}> {
  const allSettlements = await db.select()
    .from(settlements)
    .where(eq(settlements.orgId, orgId));

  const stats = {
    total: allSettlements.length,
    pending: 0,
    finalized: 0,
    reorged: 0,
    byChain: {} as Record<number, { pending: number; finalized: number; reorged: number }>,
  };

  for (const s of allSettlements) {
    // Count by status
    if (s.finalityStatus === 'pending') stats.pending++;
    else if (s.finalityStatus === 'finalized') stats.finalized++;
    else if (s.finalityStatus === 'reorged') stats.reorged++;

    // Count by chain
    if (!stats.byChain[s.chainId]) {
      stats.byChain[s.chainId] = { pending: 0, finalized: 0, reorged: 0 };
    }
    if (s.finalityStatus === 'pending') stats.byChain[s.chainId].pending++;
    else if (s.finalityStatus === 'finalized') stats.byChain[s.chainId].finalized++;
    else if (s.finalityStatus === 'reorged') stats.byChain[s.chainId].reorged++;
  }

  return stats;
}

/**
 * Gets average finality time for an organization.
 */
export async function getAverageFinalityTime(
  orgId: string,
  chainId?: number
): Promise<{ averageMs: number; count: number }> {
  const conditions = [
    eq(settlements.orgId, orgId),
    eq(settlements.finalityStatus, 'finalized'),
  ];

  if (chainId) {
    conditions.push(eq(settlements.chainId, chainId));
  }

  const finalizedSettlements = await db.select()
    .from(settlements)
    .where(and(...conditions));

  if (finalizedSettlements.length === 0) {
    return { averageMs: 0, count: 0 };
  }

  let totalMs = 0;
  let count = 0;

  for (const s of finalizedSettlements) {
    if (s.indexedAt && s.finalizedAt) {
      totalMs += s.finalizedAt.getTime() - s.indexedAt.getTime();
      count++;
    }
  }

  return {
    averageMs: count > 0 ? Math.round(totalMs / count) : 0,
    count,
  };
}

// ============================================================================
// Cleanup
// ============================================================================

/**
 * Purges old finalized settlements.
 */
export async function purgeOldSettlements(
  orgId: string,
  olderThan: Date
): Promise<{ deleted: number }> {
  const result = await db.delete(settlements)
    .where(and(
      eq(settlements.orgId, orgId),
      eq(settlements.finalityStatus, 'finalized'),
      lt(settlements.finalizedAt, olderThan)
    ))
    .returning();

  return { deleted: result.length };
}
