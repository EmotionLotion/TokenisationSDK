import { db, schema } from '../config/database.js';
import { eq, and, desc, lt, inArray, sql, gte } from 'drizzle-orm';
import type { PostgresJsTransaction } from 'drizzle-orm/postgres-js';
import { NotFoundError, ValidationError, ConflictError } from '../middleware/errorHandler.js';
import * as auditService from './audit.service.js';
import { emitEvent } from './domainEvents.service.js';
import { getRequestContext, runWithContext, createSystemContext } from '../middleware/context.js';
import { logger } from '../middleware/logger.js';

const {
  offerings,
  allocations,
  tokens,
  investors,
  investorWallets,
  ledgerPositions,
  ledgerEvents,
  issuances,
  decisions,
} = schema;

// ============================================================================
// Types & State Machine
// ============================================================================

export type OfferingStatus =
  | 'draft'
  | 'scheduled'
  | 'open'
  | 'paused'
  | 'closed'
  | 'settled'
  | 'cancelled';

export type AllocationStatus =
  | 'pending_kyc'
  | 'kyc_verified'
  | 'compliance_pending'
  | 'approved'
  | 'rejected'
  | 'mint_queued'
  | 'minting'
  | 'confirmed'
  | 'failed'
  | 'cancelled';

// Valid state transitions
const OFFERING_TRANSITIONS: Record<OfferingStatus, OfferingStatus[]> = {
  draft: ['scheduled', 'open', 'cancelled'],
  scheduled: ['open', 'paused', 'cancelled'],
  open: ['paused', 'closed'],
  paused: ['open', 'closed', 'cancelled'],
  closed: ['settled'],
  settled: [], // Terminal state
  cancelled: [], // Terminal state
};

const ALLOCATION_TRANSITIONS: Record<AllocationStatus, AllocationStatus[]> = {
  pending_kyc: ['kyc_verified', 'cancelled'],
  kyc_verified: ['compliance_pending', 'cancelled'],
  compliance_pending: ['approved', 'rejected', 'cancelled'],
  approved: ['mint_queued', 'cancelled'],
  rejected: [], // Terminal state (can be re-submitted as new allocation)
  mint_queued: ['minting', 'cancelled'],
  minting: ['confirmed', 'failed'],
  confirmed: [], // Terminal state
  failed: ['mint_queued'], // Can retry
  cancelled: [], // Terminal state
};

function validateOfferingTransition(current: OfferingStatus, target: OfferingStatus): void {
  const allowed = OFFERING_TRANSITIONS[current];
  if (!allowed || !allowed.includes(target)) {
    throw new ValidationError(`Invalid offering state transition: ${current} -> ${target}`);
  }
}

function validateAllocationTransition(current: AllocationStatus, target: AllocationStatus): void {
  const allowed = ALLOCATION_TRANSITIONS[current];
  if (!allowed || !allowed.includes(target)) {
    throw new ValidationError(`Invalid allocation state transition: ${current} -> ${target}`);
  }
}

// ============================================================================
// Offering Management
// ============================================================================

export interface CreateOfferingInput {
  tokenId: string;
  name: string;
  description?: string;
  hardCap: string;
  softCap?: string;
  minInvestment: string;
  maxInvestment?: string;
  pricePerToken: string;
  currency: string;
  startDate?: Date;
  endDate?: Date;
  metadata?: Record<string, unknown>;
}

export async function createOffering(
  orgId: string,
  input: CreateOfferingInput
): Promise<schema.Offering> {
  // Validate token exists and is active
  const token = await db.query.tokens.findFirst({
    where: and(eq(tokens.id, input.tokenId), eq(tokens.orgId, orgId)),
  });

  if (!token) {
    throw new NotFoundError('Token not found');
  }

  if (token.status !== 'active') {
    throw new ValidationError('Token must be active to create an offering');
  }

  // Validate amounts are positive integers (smallest units)
  validateAmount(input.hardCap, 'hardCap');
  validateAmount(input.minInvestment, 'minInvestment');
  validateAmount(input.pricePerToken, 'pricePerToken');
  if (input.softCap) validateAmount(input.softCap, 'softCap');
  if (input.maxInvestment) validateAmount(input.maxInvestment, 'maxInvestment');

  const ctx = getRequestContext();

  const [offering] = await db.transaction(async (tx) => {
    const [newOffering] = await tx.insert(offerings).values({
      orgId,
      tokenId: input.tokenId,
      name: input.name,
      description: input.description,
      hardCap: input.hardCap,
      softCap: input.softCap,
      minInvestment: input.minInvestment,
      maxInvestment: input.maxInvestment,
      pricePerToken: input.pricePerToken,
      currency: input.currency,
      startDate: input.startDate,
      endDate: input.endDate,
      status: 'draft',
      totalRaised: '0',
      totalAllocations: 0,
      metadata: input.metadata || {},
    }).returning();

    await emitEvent(tx, {
      orgId,
      eventType: 'offering.created',
      aggregateType: 'offering',
      aggregateId: newOffering.id,
      payload: {
        offeringId: newOffering.id,
        tokenId: input.tokenId,
        name: input.name,
        hardCap: input.hardCap,
      },
    });

    return [newOffering];
  });

  await auditService.log({
    orgId,
    actorId: ctx?.actorId,
    actorType: ctx?.actorType || 'system',
    action: 'create',
    resourceType: 'offering',
    resourceId: offering.id,
    description: `Created offering: ${input.name}`,
    metadata: { tokenId: input.tokenId },
    ipAddress: ctx?.ip,
    userAgent: ctx?.userAgent,
  });

  return offering;
}

export async function updateOfferingStatus(
  offeringId: string,
  orgId: string,
  newStatus: OfferingStatus
): Promise<schema.Offering> {
  const offering = await db.query.offerings.findFirst({
    where: and(eq(offerings.id, offeringId), eq(offerings.orgId, orgId)),
  });

  if (!offering) {
    throw new NotFoundError('Offering not found');
  }

  validateOfferingTransition(offering.status as OfferingStatus, newStatus);

  const ctx = getRequestContext();

  const [updated] = await db.transaction(async (tx) => {
    const [result] = await tx.update(offerings)
      .set({
        status: newStatus,
        updatedAt: new Date(),
      })
      .where(and(eq(offerings.id, offeringId), eq(offerings.orgId, orgId)))
      .returning();

    await emitEvent(tx, {
      orgId,
      eventType: `offering.${newStatus}`,
      aggregateType: 'offering',
      aggregateId: offeringId,
      payload: {
        offeringId,
        previousStatus: offering.status,
        newStatus,
      },
    });

    return [result];
  });

  await auditService.log({
    orgId,
    actorId: ctx?.actorId,
    actorType: ctx?.actorType || 'system',
    action: 'update',
    resourceType: 'offering',
    resourceId: offeringId,
    description: `Offering status changed: ${offering.status} -> ${newStatus}`,
    metadata: { previousStatus: offering.status, newStatus },
    ipAddress: ctx?.ip,
    userAgent: ctx?.userAgent,
  });

  return updated;
}

// ============================================================================
// Allocation Management
// ============================================================================

export interface CreateAllocationInput {
  offeringId: string;
  investorId: string;
  walletAddress: string;
  amount: string; // Token amount
  investmentAmount: string; // Payment amount
  currency: string;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
}

export async function createAllocation(
  orgId: string,
  input: CreateAllocationInput
): Promise<schema.Allocation> {
  // Validate offering exists and is open
  const offering = await db.query.offerings.findFirst({
    where: and(eq(offerings.id, input.offeringId), eq(offerings.orgId, orgId)),
  });

  if (!offering) {
    throw new NotFoundError('Offering not found');
  }

  if (offering.status !== 'open') {
    throw new ValidationError('Offering is not open for allocations');
  }

  // Validate investor
  const investor = await db.query.investors.findFirst({
    where: and(eq(investors.id, input.investorId), eq(investors.orgId, orgId)),
  });

  if (!investor) {
    throw new NotFoundError('Investor not found');
  }

  // Validate amounts
  validateAmount(input.amount, 'amount');
  validateAmount(input.investmentAmount, 'investmentAmount');

  // Check min/max investment limits
  const investmentBig = BigInt(input.investmentAmount);
  if (offering.minInvestment) {
    const minBig = BigInt(offering.minInvestment);
    if (investmentBig < minBig) {
      throw new ValidationError(`Investment amount ${input.investmentAmount} is below minimum ${offering.minInvestment}`);
    }
  }

  if (offering.maxInvestment) {
    const maxBig = BigInt(offering.maxInvestment);
    if (investmentBig > maxBig) {
      throw new ValidationError(`Investment amount ${input.investmentAmount} exceeds maximum ${offering.maxInvestment}`);
    }
  }

  // Check hard cap
  const currentRaised = BigInt(offering.totalRaised || '0');
  const hardCap = BigInt(offering.hardCap);
  if (currentRaised + investmentBig > hardCap) {
    throw new ValidationError('Investment would exceed offering hard cap');
  }

  // Determine initial status based on investor KYC
  const initialStatus: AllocationStatus = investor.status === 'active' ? 'kyc_verified' : 'pending_kyc';

  const ctx = getRequestContext();

  const [allocation] = await db.transaction(async (tx) => {
    // Check idempotency
    if (input.idempotencyKey) {
      const existing = await tx.query.allocations.findFirst({
        where: and(
          eq(allocations.orgId, orgId),
          eq(allocations.idempotencyKey, input.idempotencyKey)
        ),
      });
      if (existing) {
        return [existing];
      }
    }

    // Create allocation
    const [newAllocation] = await tx.insert(allocations).values({
      orgId,
      offeringId: input.offeringId,
      investorId: input.investorId,
      walletAddress: input.walletAddress,
      amount: input.amount,
      investmentAmount: input.investmentAmount,
      currency: input.currency,
      status: initialStatus,
      idempotencyKey: input.idempotencyKey,
      metadata: input.metadata || {},
    }).returning();

    // Update offering totals
    await tx.update(offerings)
      .set({
        totalRaised: (currentRaised + investmentBig).toString(),
        totalAllocations: sql`${offerings.totalAllocations} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(offerings.id, input.offeringId));

    await emitEvent(tx, {
      orgId,
      eventType: 'allocation.created',
      aggregateType: 'allocation',
      aggregateId: newAllocation.id,
      payload: {
        allocationId: newAllocation.id,
        offeringId: input.offeringId,
        investorId: input.investorId,
        amount: input.amount,
        status: initialStatus,
      },
    });

    return [newAllocation];
  });

  await auditService.log({
    orgId,
    actorId: ctx?.actorId,
    actorType: ctx?.actorType || 'system',
    action: 'create',
    resourceType: 'allocation',
    resourceId: allocation.id,
    description: `Created allocation for investor ${input.investorId}`,
    metadata: {
      offeringId: input.offeringId,
      amount: input.amount,
      investmentAmount: input.investmentAmount,
    },
    ipAddress: ctx?.ip,
    userAgent: ctx?.userAgent,
  });

  return allocation;
}

export async function updateAllocationStatus(
  allocationId: string,
  orgId: string,
  newStatus: AllocationStatus,
  options?: {
    rejectionReason?: string;
    txHash?: string;
    txBlock?: number;
  }
): Promise<schema.Allocation> {
  const allocation = await db.query.allocations.findFirst({
    where: and(eq(allocations.id, allocationId), eq(allocations.orgId, orgId)),
  });

  if (!allocation) {
    throw new NotFoundError('Allocation not found');
  }

  validateAllocationTransition(allocation.status as AllocationStatus, newStatus);

  const ctx = getRequestContext();

  const updateData: Partial<schema.Allocation> = {
    status: newStatus,
    updatedAt: new Date(),
  };

  if (options?.rejectionReason) {
    updateData.rejectionReason = options.rejectionReason;
  }
  if (options?.txHash) {
    updateData.txHash = options.txHash;
  }
  if (options?.txBlock) {
    updateData.txBlock = options.txBlock;
  }

  // Set timestamps based on status
  if (newStatus === 'approved') {
    updateData.approvedAt = new Date();
  } else if (newStatus === 'confirmed') {
    updateData.confirmedAt = new Date();
  } else if (newStatus === 'rejected') {
    updateData.rejectedAt = new Date();
  }

  const [updated] = await db.transaction(async (tx) => {
    const [result] = await tx.update(allocations)
      .set(updateData)
      .where(and(eq(allocations.id, allocationId), eq(allocations.orgId, orgId)))
      .returning();

    await emitEvent(tx, {
      orgId,
      eventType: `allocation.${newStatus}`,
      aggregateType: 'allocation',
      aggregateId: allocationId,
      payload: {
        allocationId,
        previousStatus: allocation.status,
        newStatus,
        ...options,
      },
    });

    return [result];
  });

  await auditService.log({
    orgId,
    actorId: ctx?.actorId,
    actorType: ctx?.actorType || 'system',
    action: 'update',
    resourceType: 'allocation',
    resourceId: allocationId,
    description: `Allocation status changed: ${allocation.status} -> ${newStatus}`,
    metadata: { previousStatus: allocation.status, newStatus, ...options },
    ipAddress: ctx?.ip,
    userAgent: ctx?.userAgent,
  });

  return updated;
}

// ============================================================================
// Mint Queue Management
// ============================================================================

export interface MintQueueEntry {
  allocationId: string;
  tokenId: string;
  toWallet: string;
  amount: string;
  investorId: string;
  offeringId: string;
}

/**
 * Gets all allocations ready for minting (approved status).
 */
export async function getMintQueue(orgId: string): Promise<MintQueueEntry[]> {
  const approved = await db.select({
    allocationId: allocations.id,
    tokenId: offerings.tokenId,
    toWallet: allocations.walletAddress,
    amount: allocations.amount,
    investorId: allocations.investorId,
    offeringId: allocations.offeringId,
  })
    .from(allocations)
    .innerJoin(offerings, eq(allocations.offeringId, offerings.id))
    .where(and(
      eq(allocations.orgId, orgId),
      eq(allocations.status, 'approved')
    ))
    .orderBy(allocations.createdAt);

  return approved;
}

/**
 * Moves an allocation to mint_queued status before submitting to chain.
 */
export async function queueForMint(
  allocationId: string,
  orgId: string
): Promise<schema.Allocation> {
  return updateAllocationStatus(allocationId, orgId, 'mint_queued');
}

/**
 * Marks allocation as minting after tx is submitted.
 */
export async function markMinting(
  allocationId: string,
  orgId: string,
  txHash: string
): Promise<schema.Allocation> {
  return updateAllocationStatus(allocationId, orgId, 'minting', { txHash });
}

/**
 * Confirms a mint after chain confirmation.
 * Creates ledger entries for the new position.
 */
export async function confirmMint(
  allocationId: string,
  orgId: string,
  txHash: string,
  txBlock: number
): Promise<schema.Allocation> {
  const allocation = await db.query.allocations.findFirst({
    where: and(eq(allocations.id, allocationId), eq(allocations.orgId, orgId)),
  });

  if (!allocation) {
    throw new NotFoundError('Allocation not found');
  }

  const offering = await db.query.offerings.findFirst({
    where: eq(offerings.id, allocation.offeringId),
  });

  if (!offering) {
    throw new NotFoundError('Offering not found');
  }

  const ctx = getRequestContext();

  const updated = await db.transaction(async (tx) => {
    // Update allocation status
    const [result] = await tx.update(allocations)
      .set({
        status: 'confirmed',
        txHash,
        txBlock,
        confirmedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(allocations.id, allocationId), eq(allocations.orgId, orgId)))
      .returning();

    // Create issuance record
    await tx.insert(issuances).values({
      orgId,
      tokenId: offering.tokenId,
      investorId: allocation.investorId,
      toWallet: allocation.walletAddress,
      amount: allocation.amount,
      status: 'confirmed',
      txHash,
      txBlock,
      confirmedAt: new Date(),
      metadata: { allocationId, offeringId: allocation.offeringId },
    });

    // Update or create ledger position
    const existingPosition = await tx.query.ledgerPositions.findFirst({
      where: and(
        eq(ledgerPositions.tokenId, offering.tokenId),
        eq(ledgerPositions.investorId, allocation.investorId),
        eq(ledgerPositions.orgId, orgId)
      ),
    });

    if (existingPosition) {
      const newBalance = (BigInt(existingPosition.balance) + BigInt(allocation.amount)).toString();
      await tx.update(ledgerPositions)
        .set({ balance: newBalance, updatedAt: new Date() })
        .where(eq(ledgerPositions.id, existingPosition.id));
    } else {
      await tx.insert(ledgerPositions).values({
        orgId,
        tokenId: offering.tokenId,
        investorId: allocation.investorId,
        walletAddress: allocation.walletAddress,
        balance: allocation.amount,
      });
    }

    // Create ledger event
    await tx.insert(ledgerEvents).values({
      orgId,
      tokenId: offering.tokenId,
      investorId: allocation.investorId,
      eventType: 'issuance',
      delta: allocation.amount,
      ref: allocationId,
      refType: 'allocation',
      txHash,
      txBlock,
    });

    await emitEvent(tx, {
      orgId,
      eventType: 'allocation.confirmed',
      aggregateType: 'allocation',
      aggregateId: allocationId,
      payload: {
        allocationId,
        tokenId: offering.tokenId,
        investorId: allocation.investorId,
        amount: allocation.amount,
        txHash,
        txBlock,
      },
    });

    return result;
  });

  await auditService.log({
    orgId,
    actorId: ctx?.actorId || 'system',
    actorType: ctx?.actorType || 'system',
    action: 'token_issued',
    resourceType: 'allocation',
    resourceId: allocationId,
    description: `Mint confirmed for allocation ${allocationId}`,
    metadata: { txHash, txBlock, amount: allocation.amount },
    ipAddress: ctx?.ip,
    userAgent: ctx?.userAgent,
  });

  return updated;
}

/**
 * Marks mint as failed. Can be retried later.
 */
export async function failMint(
  allocationId: string,
  orgId: string,
  reason: string
): Promise<schema.Allocation> {
  const allocation = await db.query.allocations.findFirst({
    where: and(eq(allocations.id, allocationId), eq(allocations.orgId, orgId)),
  });

  if (!allocation) {
    throw new NotFoundError('Allocation not found');
  }

  const retryCount = ((allocation.metadata as any)?.retryCount || 0) + 1;

  const [updated] = await db.update(allocations)
    .set({
      status: 'failed',
      rejectionReason: reason,
      metadata: { ...(allocation.metadata as object), retryCount },
      updatedAt: new Date(),
    })
    .where(and(eq(allocations.id, allocationId), eq(allocations.orgId, orgId)))
    .returning();

  return updated;
}

// ============================================================================
// Chain Reconciliation Worker
// ============================================================================

export interface ChainEvent {
  txHash: string;
  blockNumber: number;
  eventType: 'transfer' | 'mint' | 'burn';
  tokenAddress: string;
  from: string;
  to: string;
  amount: string;
  logIndex: number;
}

export interface ReconciliationResult {
  processed: number;
  confirmed: number;
  failed: number;
  reorged: number;
  errors: string[];
}

/**
 * Reconcile ledger with on-chain events.
 * Called by chain listener when new blocks are confirmed.
 */
export async function reconcileChainEvents(
  orgId: string,
  events: ChainEvent[],
  confirmedBlockNumber: number
): Promise<ReconciliationResult> {
  const result: ReconciliationResult = {
    processed: 0,
    confirmed: 0,
    failed: 0,
    reorged: 0,
    errors: [],
  };

  // Create system context for background operations
  const systemCtx = createSystemContext(orgId, `reconcile_${Date.now()}`);

  await runWithContext(systemCtx, async () => {
    // Process mint events for allocations
    for (const event of events) {
      try {
        result.processed++;

        if (event.eventType === 'mint') {
          // Find allocation by txHash
          const allocation = await db.query.allocations.findFirst({
            where: and(
              eq(allocations.orgId, orgId),
              eq(allocations.txHash, event.txHash),
              eq(allocations.status, 'minting')
            ),
          });

          if (allocation) {
            await confirmMint(allocation.id, orgId, event.txHash, event.blockNumber);
            result.confirmed++;
          }
        }

        // Handle transfer events for transfers table
        if (event.eventType === 'transfer') {
          const { transfers } = schema;
          const transfer = await db.query.transfers.findFirst({
            where: and(
              eq(transfers.orgId, orgId),
              eq(transfers.txHash, event.txHash),
              eq(transfers.status, 'pending_confirmation')
            ),
          });

          if (transfer) {
            await db.update(transfers)
              .set({
                status: 'confirmed',
                txBlock: event.blockNumber,
                confirmedAt: new Date(),
                updatedAt: new Date(),
              })
              .where(eq(transfers.id, transfer.id));
            result.confirmed++;
          }
        }
      } catch (error) {
        result.errors.push(`Event ${event.txHash}: ${(error as Error).message}`);
        result.failed++;
      }
    }

    // Check for reorgs - find pending confirmations that are now behind confirmed block
    const potentialReorgs = await db.select()
      .from(allocations)
      .where(and(
        eq(allocations.orgId, orgId),
        eq(allocations.status, 'confirmed'),
        lt(allocations.txBlock, confirmedBlockNumber - 12) // Assume 12 block finality
      ));

    // In production, would verify these txs still exist on chain
    // For now, just log potential issues
    if (potentialReorgs.length > 0) {
      result.reorged = potentialReorgs.length;
    }
  });

  return result;
}

/**
 * Start the chain reconciliation worker.
 * In production, this would connect to chain RPC and process events.
 */
let reconciliationInterval: NodeJS.Timeout | null = null;

export function startChainReconciliationWorker(config: {
  pollIntervalMs?: number;
  orgIds?: string[];
} = {}): void {
  const { pollIntervalMs = 15000, orgIds = [] } = config;

  if (reconciliationInterval) {
    logger.info('[ChainReconciliation] Worker already running');
    return;
  }

  logger.info('[ChainReconciliation] Starting worker with poll interval', { metadata: { pollIntervalMs } });

  reconciliationInterval = setInterval(async () => {
    try {
      // In production, would:
      // 1. Get latest confirmed block from chain
      // 2. Query chain for Transfer/Mint events
      // 3. Call reconcileChainEvents for each org

      // For each org, check for stuck minting allocations
      for (const orgId of orgIds) {
        const stuckAllocations = await db.select()
          .from(allocations)
          .where(and(
            eq(allocations.orgId, orgId),
            eq(allocations.status, 'minting'),
            lt(allocations.updatedAt, new Date(Date.now() - 60 * 60 * 1000)) // Stuck for 1 hour
          ));

        for (const allocation of stuckAllocations) {
          logger.info(`[ChainReconciliation] Stuck allocation detected: ${allocation.id}`);
          // Would check chain status and either confirm or fail
        }
      }
    } catch (error) {
      logger.error('[ChainReconciliation] Worker error', { error: error as Error });
    }
  }, pollIntervalMs);
}

export function stopChainReconciliationWorker(): void {
  if (reconciliationInterval) {
    clearInterval(reconciliationInterval);
    reconciliationInterval = null;
    logger.info('[ChainReconciliation] Worker stopped');
  }
}

// ============================================================================
// Offering Settlement
// ============================================================================

/**
 * Settle an offering after all allocations are processed.
 * Updates offering status and creates summary records.
 */
export async function settleOffering(
  offeringId: string,
  orgId: string
): Promise<schema.Offering> {
  const offering = await db.query.offerings.findFirst({
    where: and(eq(offerings.id, offeringId), eq(offerings.orgId, orgId)),
  });

  if (!offering) {
    throw new NotFoundError('Offering not found');
  }

  if (offering.status !== 'closed') {
    throw new ValidationError('Offering must be closed before settlement');
  }

  // Check all allocations are in terminal states
  const pendingAllocations = await db.select({ count: sql<number>`count(*)` })
    .from(allocations)
    .where(and(
      eq(allocations.offeringId, offeringId),
      inArray(allocations.status, ['pending_kyc', 'kyc_verified', 'compliance_pending', 'approved', 'mint_queued', 'minting'])
    ));

  if (Number(pendingAllocations[0].count) > 0) {
    throw new ValidationError('Cannot settle offering with pending allocations');
  }

  return updateOfferingStatus(offeringId, orgId, 'settled');
}

// ============================================================================
// Helper Functions
// ============================================================================

function validateAmount(value: string, fieldName: string): void {
  if (!/^\d+$/.test(value)) {
    throw new ValidationError(`${fieldName} must be a positive integer (smallest units only)`);
  }
  if (BigInt(value) <= 0) {
    throw new ValidationError(`${fieldName} must be positive`);
  }
}

// ============================================================================
// Query Functions
// ============================================================================

export async function getOffering(offeringId: string, orgId: string): Promise<schema.Offering> {
  const offering = await db.query.offerings.findFirst({
    where: and(eq(offerings.id, offeringId), eq(offerings.orgId, orgId)),
  });

  if (!offering) {
    throw new NotFoundError('Offering not found');
  }

  return offering;
}

export async function listOfferings(
  orgId: string,
  options?: {
    status?: OfferingStatus;
    tokenId?: string;
    limit?: number;
    offset?: number;
  }
): Promise<schema.Offering[]> {
  const conditions = [eq(offerings.orgId, orgId)];

  if (options?.status) {
    conditions.push(eq(offerings.status, options.status));
  }
  if (options?.tokenId) {
    conditions.push(eq(offerings.tokenId, options.tokenId));
  }

  return db.select()
    .from(offerings)
    .where(and(...conditions))
    .orderBy(desc(offerings.createdAt))
    .limit(options?.limit || 50)
    .offset(options?.offset || 0);
}

export async function getAllocation(allocationId: string, orgId: string): Promise<schema.Allocation> {
  const allocation = await db.query.allocations.findFirst({
    where: and(eq(allocations.id, allocationId), eq(allocations.orgId, orgId)),
  });

  if (!allocation) {
    throw new NotFoundError('Allocation not found');
  }

  return allocation;
}

export async function listAllocations(
  orgId: string,
  options?: {
    offeringId?: string;
    investorId?: string;
    status?: AllocationStatus;
    limit?: number;
    offset?: number;
  }
): Promise<schema.Allocation[]> {
  const conditions = [eq(allocations.orgId, orgId)];

  if (options?.offeringId) {
    conditions.push(eq(allocations.offeringId, options.offeringId));
  }
  if (options?.investorId) {
    conditions.push(eq(allocations.investorId, options.investorId));
  }
  if (options?.status) {
    conditions.push(eq(allocations.status, options.status));
  }

  return db.select()
    .from(allocations)
    .where(and(...conditions))
    .orderBy(desc(allocations.createdAt))
    .limit(options?.limit || 50)
    .offset(options?.offset || 0);
}
