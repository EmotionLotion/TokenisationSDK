import { db, schema } from '../config/database.js';
import { eq, and, desc, lt, or } from 'drizzle-orm';
import { NotFoundError, ValidationError, AppError } from '../middleware/errorHandler.js';
import * as complianceService from './compliance.service.js';
import * as relayerService from './relayer.service.js';
import { randomUUID } from 'crypto';
import { withSerializableTransaction, withRetryableTransaction } from '../utils/transaction.js';
import { logger } from '../middleware/logger.js';

const { transfers, settlements, tokens, investors, ledgerPositions, ledgerEvents, eventBusQueue } = schema;

// ============================================================================
// Types & Interfaces
// ============================================================================

export type TransferStatus =
  | 'created'
  | 'prechecked'
  | 'approved'
  | 'rejected'
  | 'signing'
  | 'submitted'
  | 'confirmed'
  | 'reconciled'
  | 'settled'
  | 'failed'
  | 'expired'
  | 'cancelled';

export interface CreateTransferInput {
  orgId: string;
  tokenId: string;
  fromWallet: string;
  toWallet: string;
  amount: string;
  fromInvestorId?: string;
  toInvestorId?: string;
  idempotencyKey?: string;
  expiresAt?: Date;
  metadata?: Record<string, unknown>;
}

export interface TransferResponse {
  id: string;
  orgId: string;
  tokenId: string;
  fromWallet: string;
  toWallet: string;
  amount: string;
  status: TransferStatus;
  decisionId?: string;
  txHash?: string;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Valid state transitions
const STATE_TRANSITIONS: Record<TransferStatus, TransferStatus[]> = {
  created: ['prechecked', 'rejected', 'failed', 'expired', 'cancelled'],
  prechecked: ['approved', 'rejected', 'failed', 'expired', 'cancelled'],
  approved: ['signing', 'rejected', 'failed', 'expired', 'cancelled'],
  signing: ['submitted', 'failed', 'expired', 'cancelled'],
  submitted: ['confirmed', 'failed', 'expired'],
  confirmed: ['reconciled', 'failed'],
  reconciled: ['settled', 'failed'],
  settled: [], // Terminal state
  rejected: [], // Terminal state
  failed: [], // Terminal state
  expired: [], // Terminal state
  cancelled: [], // Terminal state
};

// ============================================================================
// Transfer Service
// ============================================================================

export async function createTransfer(input: CreateTransferInput): Promise<TransferResponse> {
  const { orgId, tokenId, fromWallet, toWallet, amount, fromInvestorId, toInvestorId, idempotencyKey, expiresAt, metadata } = input;

  // Check idempotency
  if (idempotencyKey) {
    const existing = await db.query.transfers.findFirst({
      where: and(eq(transfers.orgId, orgId), eq(transfers.idempotencyKey, idempotencyKey)),
    });

    if (existing) {
      return formatTransferResponse(existing);
    }
  }

  // Verify token exists and is active
  const token = await db.query.tokens.findFirst({
    where: and(eq(tokens.id, tokenId), eq(tokens.orgId, orgId)),
  });

  if (!token) {
    throw new NotFoundError('Token not found');
  }

  if (token.status !== 'active') {
    throw new ValidationError(`Token is not active (status: ${token.status})`);
  }

  // Basic validation
  if (fromWallet.toLowerCase() === toWallet.toLowerCase()) {
    throw new ValidationError('Cannot transfer to the same wallet');
  }

  if (BigInt(amount) <= 0n) {
    throw new ValidationError('Amount must be positive');
  }

  // Set default expiry (24 hours)
  const transferExpiresAt = expiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000);

  // Create transfer record
  const [transfer] = await db.insert(transfers).values({
    orgId,
    tokenId,
    fromWallet: fromWallet.toLowerCase(),
    toWallet: toWallet.toLowerCase(),
    amount,
    fromInvestorId,
    toInvestorId,
    status: 'created',
    idempotencyKey,
    expiresAt: transferExpiresAt,
    metadata: metadata || {},
  }).returning();

  // Emit event to event bus
  await emitTransferEvent(transfer.id, orgId, 'transfer.requested', {
    transferId: transfer.id,
    tokenId,
    fromWallet,
    toWallet,
    amount,
  });

  return formatTransferResponse(transfer);
}

export async function getTransfer(id: string, orgId: string): Promise<TransferResponse> {
  const transfer = await db.query.transfers.findFirst({
    where: and(eq(transfers.id, id), eq(transfers.orgId, orgId)),
  });

  if (!transfer) {
    throw new NotFoundError('Transfer not found');
  }

  return formatTransferResponse(transfer);
}

export async function listTransfers(orgId: string, params: {
  tokenId?: string;
  status?: string;
  fromWallet?: string;
  toWallet?: string;
  limit?: number;
  offset?: number;
} = {}) {
  const { tokenId, status, fromWallet, toWallet, limit = 50, offset = 0 } = params;

  const conditions = [eq(transfers.orgId, orgId)];
  if (tokenId) conditions.push(eq(transfers.tokenId, tokenId));
  if (status) conditions.push(eq(transfers.status, status));
  if (fromWallet) conditions.push(eq(transfers.fromWallet, fromWallet.toLowerCase()));
  if (toWallet) conditions.push(eq(transfers.toWallet, toWallet.toLowerCase()));

  const results = await db.select()
    .from(transfers)
    .where(and(...conditions))
    .orderBy(desc(transfers.createdAt))
    .limit(limit)
    .offset(offset);

  return results.map(formatTransferResponse);
}

// ============================================================================
// Transfer Saga State Machine
// ============================================================================

async function transitionTransfer(
  transfer: typeof transfers.$inferSelect,
  toStatus: TransferStatus,
  updates: Partial<typeof transfers.$inferInsert> = {}
): Promise<typeof transfers.$inferSelect> {
  const currentStatus = transfer.status as TransferStatus;

  if (!STATE_TRANSITIONS[currentStatus].includes(toStatus)) {
    throw new ValidationError(
      `Invalid state transition: ${currentStatus} -> ${toStatus}. ` +
      `Allowed: ${STATE_TRANSITIONS[currentStatus].join(', ') || 'none'}`
    );
  }

  const [updated] = await db.update(transfers)
    .set({
      ...updates,
      status: toStatus,
      updatedAt: new Date(),
    })
    .where(eq(transfers.id, transfer.id))
    .returning();

  return updated;
}

// Step 1: Precheck - Run compliance evaluation
export async function precheckTransfer(id: string, orgId: string): Promise<TransferResponse> {
  const transfer = await db.query.transfers.findFirst({
    where: and(eq(transfers.id, id), eq(transfers.orgId, orgId)),
  });

  if (!transfer) {
    throw new NotFoundError('Transfer not found');
  }

  if (transfer.status !== 'created') {
    throw new ValidationError(`Transfer cannot be prechecked from status: ${transfer.status}`);
  }

  // Check expiry
  if (transfer.expiresAt && new Date() > transfer.expiresAt) {
    const expired = await transitionTransfer(transfer, 'expired');
    await emitTransferEvent(id, orgId, 'transfer.expired', { transferId: id });
    return formatTransferResponse(expired);
  }

  try {
    // Run compliance check
    const decision = await complianceService.evaluateTransfer({
      orgId,
      tokenId: transfer.tokenId,
      fromWallet: transfer.fromWallet,
      toWallet: transfer.toWallet,
      amount: transfer.amount,
      fromInvestorId: transfer.fromInvestorId || undefined,
      toInvestorId: transfer.toInvestorId || undefined,
    });

    if (decision.result === 'deny') {
      // Compliance rejected
      const rejected = await transitionTransfer(transfer, 'rejected', {
        decisionId: decision.id,
        error: decision.reasons.map(r => r.message).join('; '),
      });

      await emitTransferEvent(id, orgId, 'transfer.rejected', {
        transferId: id,
        decisionId: decision.id,
        reasons: decision.reasons,
      });

      return formatTransferResponse(rejected);
    }

    // Compliance passed — now do belt-and-suspenders on-chain check
    const token = await db.query.tokens.findFirst({
      where: and(eq(tokens.id, transfer.tokenId), eq(tokens.orgId, orgId)),
    });

    if (token?.address && token?.chainId) {
      try {
        const onChainAllowed = await relayerService.canTransfer(
          token.chainId,
          token.address,
          transfer.fromWallet,
          transfer.toWallet,
          transfer.amount,
        );

        if (!onChainAllowed) {
          const rejected = await transitionTransfer(transfer, 'rejected', {
            decisionId: decision.id,
            error: 'On-chain canTransfer() check returned false — transfer blocked by smart contract compliance module',
          });

          await emitTransferEvent(id, orgId, 'transfer.rejected', {
            transferId: id,
            decisionId: decision.id,
            reasons: [{ code: 'ON_CHAIN_REJECTED', message: 'Smart contract compliance module blocked the transfer' }],
          });

          return formatTransferResponse(rejected);
        }
      } catch (error) {
        // On-chain check failed (network error, contract not deployed, etc.)
        // The off-chain compliance engine already passed, so log warning but don't block
        logger.warn('On-chain canTransfer() view call failed, proceeding with off-chain approval', {
          metadata: {
            transferId: id,
            tokenAddress: token.address,
            chainId: token.chainId,
            error: error instanceof Error ? error.message : 'Unknown error',
          },
        });
      }
    }

    // All checks passed
    const prechecked = await transitionTransfer(transfer, 'prechecked', {
      decisionId: decision.id,
    });

    await emitTransferEvent(id, orgId, 'transfer.prechecked', {
      transferId: id,
      decisionId: decision.id,
    });

    return formatTransferResponse(prechecked);
  } catch (error) {
    // Mark as failed on error
    const failed = await transitionTransfer(transfer, 'failed', {
      error: error instanceof Error ? error.message : 'Precheck failed',
    });

    return formatTransferResponse(failed);
  }
}

// Step 2: Approve - Manual or automatic approval
export async function approveTransfer(id: string, orgId: string, approvedBy?: string): Promise<TransferResponse> {
  const transfer = await db.query.transfers.findFirst({
    where: and(eq(transfers.id, id), eq(transfers.orgId, orgId)),
  });

  if (!transfer) {
    throw new NotFoundError('Transfer not found');
  }

  if (transfer.status !== 'prechecked') {
    throw new ValidationError(`Transfer cannot be approved from status: ${transfer.status}`);
  }

  // Check expiry
  if (transfer.expiresAt && new Date() > transfer.expiresAt) {
    const expired = await transitionTransfer(transfer, 'expired');
    return formatTransferResponse(expired);
  }

  const approved = await transitionTransfer(transfer, 'approved', {
    metadata: {
      ...(transfer.metadata as Record<string, unknown> || {}),
      approvedBy,
      approvedAt: new Date(),
    },
  });

  await emitTransferEvent(id, orgId, 'transfer.approved', {
    transferId: id,
    approvedBy,
  });

  return formatTransferResponse(approved);
}

// Step 3: Cancel - Cancel a pending transfer
export async function cancelTransfer(id: string, orgId: string, reason?: string): Promise<TransferResponse> {
  const transfer = await db.query.transfers.findFirst({
    where: and(eq(transfers.id, id), eq(transfers.orgId, orgId)),
  });

  if (!transfer) {
    throw new NotFoundError('Transfer not found');
  }

  const cancellableStatuses: TransferStatus[] = ['created', 'prechecked', 'approved', 'signing'];
  if (!cancellableStatuses.includes(transfer.status as TransferStatus)) {
    throw new ValidationError(`Transfer cannot be cancelled from status: ${transfer.status}`);
  }

  const cancelled = await transitionTransfer(transfer, 'cancelled', {
    error: reason || 'Cancelled by user',
  });

  await emitTransferEvent(id, orgId, 'transfer.cancelled', {
    transferId: id,
    reason,
  });

  return formatTransferResponse(cancelled);
}

// Step 4: Sign - Prepare transaction for signing (custodial or return payload for non-custodial)
export async function signTransfer(
  id: string,
  orgId: string,
  mode: 'custodial' | 'non_custodial' = 'non_custodial'
): Promise<{ transfer: TransferResponse; txPayload?: object }> {
  const transfer = await db.query.transfers.findFirst({
    where: and(eq(transfers.id, id), eq(transfers.orgId, orgId)),
  });

  if (!transfer) {
    throw new NotFoundError('Transfer not found');
  }

  if (transfer.status !== 'approved') {
    throw new ValidationError(`Transfer cannot be signed from status: ${transfer.status}`);
  }

  // Check expiry
  if (transfer.expiresAt && new Date() > transfer.expiresAt) {
    const expired = await transitionTransfer(transfer, 'expired');
    return { transfer: formatTransferResponse(expired) };
  }

  // Get token for contract address
  const token = await db.query.tokens.findFirst({
    where: eq(tokens.id, transfer.tokenId),
  });

  if (!token || !token.address) {
    throw new ValidationError('Token contract not deployed');
  }

  // Build transaction payload
  const txPayload = {
    to: token.address,
    chainId: token.chainId,
    data: encodeTransferData(transfer.fromWallet, transfer.toWallet, transfer.amount),
    value: '0',
    // In production, would include gas estimation
    gasLimit: '100000',
  };

  const signing = await transitionTransfer(transfer, 'signing', {
    txPayload: txPayload as any,
    signedAt: new Date(),
  });

  if (mode === 'custodial') {
    // For custodial mode, the signer service would sign and submit
    // This is a placeholder - in production, call the Relayer service
    return {
      transfer: formatTransferResponse(signing),
      txPayload: { ...txPayload, requiresSignature: true },
    };
  }

  // For non-custodial, return payload for client to sign
  return {
    transfer: formatTransferResponse(signing),
    txPayload,
  };
}

// Step 5: Submit - Submit signed transaction
export async function submitTransfer(id: string, orgId: string, txHash: string): Promise<TransferResponse> {
  const transfer = await db.query.transfers.findFirst({
    where: and(eq(transfers.id, id), eq(transfers.orgId, orgId)),
  });

  if (!transfer) {
    throw new NotFoundError('Transfer not found');
  }

  if (transfer.status !== 'signing') {
    throw new ValidationError(`Transfer cannot be submitted from status: ${transfer.status}`);
  }

  // Validate tx hash format
  if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
    throw new ValidationError('Invalid transaction hash format');
  }

  // Wrap submission in transaction for atomicity
  const submitted = await withSerializableTransaction(async (tx) => {
    // Transition transfer status
    const currentStatus = transfer.status as TransferStatus;
    if (!STATE_TRANSITIONS[currentStatus].includes('submitted')) {
      throw new ValidationError(
        `Invalid state transition: ${currentStatus} -> submitted`
      );
    }

    const [updated] = await tx.update(transfers)
      .set({
        status: 'submitted',
        txHash,
        submittedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(transfers.id, transfer.id))
      .returning();

    // Create settlement record within same transaction
    const token = await tx.query.tokens.findFirst({
      where: eq(tokens.id, transfer.tokenId),
    });

    await tx.insert(settlements).values({
      orgId,
      transferId: id,
      txHash,
      chainId: token?.chainId || 1,
      finalityStatus: 'pending',
      requiredConfirmations: 12, // Configurable per chain
    });

    // Emit event within transaction
    await tx.insert(eventBusQueue).values({
      orgId,
      topic: 'transfer.submitted',
      eventId: `evt_${randomUUID().replace(/-/g, '')}`,
      payload: { transferId: id, txHash } as any,
      trace: { transferId: id, timestamp: new Date() } as any,
      status: 'pending',
    });

    return updated;
  });

  return formatTransferResponse(submitted);
}

// Step 6: Confirm - Mark as confirmed (called by indexer)
export async function confirmTransfer(id: string, orgId: string, blockNumber: number): Promise<TransferResponse> {
  const transfer = await db.query.transfers.findFirst({
    where: and(eq(transfers.id, id), eq(transfers.orgId, orgId)),
  });

  if (!transfer) {
    throw new NotFoundError('Transfer not found');
  }

  if (transfer.status !== 'submitted') {
    throw new ValidationError(`Transfer cannot be confirmed from status: ${transfer.status}`);
  }

  // Wrap confirmation in transaction for atomicity
  const confirmed = await withSerializableTransaction(async (tx) => {
    // Transition transfer status
    const currentStatus = transfer.status as TransferStatus;
    if (!STATE_TRANSITIONS[currentStatus].includes('confirmed')) {
      throw new ValidationError(
        `Invalid state transition: ${currentStatus} -> confirmed`
      );
    }

    const [updated] = await tx.update(transfers)
      .set({
        status: 'confirmed',
        txBlock: blockNumber,
        confirmedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(transfers.id, transfer.id))
      .returning();

    // Update settlement within same transaction
    if (transfer.txHash) {
      await tx.update(settlements)
        .set({
          confirmedBlock: blockNumber,
          indexedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(settlements.txHash, transfer.txHash));
    }

    // Emit event within transaction
    await tx.insert(eventBusQueue).values({
      orgId,
      topic: 'transfer.confirmed',
      eventId: `evt_${randomUUID().replace(/-/g, '')}`,
      payload: { transferId: id, blockNumber } as any,
      trace: { transferId: id, timestamp: new Date() } as any,
      status: 'pending',
    });

    return updated;
  });

  return formatTransferResponse(confirmed);
}

// Step 7: Reconcile - Verify on-chain state matches
export async function reconcileTransfer(id: string, orgId: string): Promise<TransferResponse> {
  const transfer = await db.query.transfers.findFirst({
    where: and(eq(transfers.id, id), eq(transfers.orgId, orgId)),
  });

  if (!transfer) {
    throw new NotFoundError('Transfer not found');
  }

  if (transfer.status !== 'confirmed') {
    throw new ValidationError(`Transfer cannot be reconciled from status: ${transfer.status}`);
  }

  // In production, would verify on-chain balances match expected state
  // For now, we assume confirmed = reconciled

  const reconciled = await transitionTransfer(transfer, 'reconciled');

  return formatTransferResponse(reconciled);
}

// Step 8: Settle - Final settlement and ledger update
export async function settleTransfer(id: string, orgId: string): Promise<TransferResponse> {
  const transfer = await db.query.transfers.findFirst({
    where: and(eq(transfers.id, id), eq(transfers.orgId, orgId)),
  });

  if (!transfer) {
    throw new NotFoundError('Transfer not found');
  }

  if (transfer.status !== 'reconciled') {
    throw new ValidationError(`Transfer cannot be settled from status: ${transfer.status}`);
  }

  // Wrap entire settlement in a retryable transaction for atomicity
  // This ensures ledger updates, transfer status, and settlement status
  // are all updated together or rolled back on failure
  const settled = await withRetryableTransaction(async (tx) => {
    // Update ledger positions within this transaction
    await updateLedgerPositionsInTx(transfer, tx);

    // Transition transfer to settled
    const currentStatus = transfer.status as TransferStatus;
    if (!STATE_TRANSITIONS[currentStatus].includes('settled')) {
      throw new ValidationError(
        `Invalid state transition: ${currentStatus} -> settled. ` +
        `Allowed: ${STATE_TRANSITIONS[currentStatus].join(', ') || 'none'}`
      );
    }

    const [updated] = await tx.update(transfers)
      .set({
        status: 'settled',
        settledAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(transfers.id, transfer.id))
      .returning();

    // Finalize settlement record
    if (transfer.txHash) {
      await tx.update(settlements)
        .set({
          finalityStatus: 'finalized',
          finalizedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(settlements.txHash, transfer.txHash));
    }

    // Emit event within transaction (event is queued, will be processed later)
    await tx.insert(eventBusQueue).values({
      orgId,
      topic: 'transfer.settled',
      eventId: `evt_${randomUUID().replace(/-/g, '')}`,
      payload: { transferId: id } as any,
      trace: { transferId: id, timestamp: new Date() } as any,
      status: 'pending',
    });

    return updated;
  }, 3, 100);

  return formatTransferResponse(settled);
}

// ============================================================================
// Full Transfer Saga (automated flow)
// ============================================================================

export async function executeTransferSaga(
  input: CreateTransferInput,
  options: { autoApprove?: boolean; mode?: 'custodial' | 'non_custodial' } = {}
): Promise<{ transfer: TransferResponse; txPayload?: object }> {
  const { autoApprove = false, mode = 'non_custodial' } = options;

  // Step 1: Create
  const created = await createTransfer(input);

  // Step 2: Precheck
  const prechecked = await precheckTransfer(created.id, input.orgId);

  if (prechecked.status === 'rejected' || prechecked.status === 'failed' || prechecked.status === 'expired') {
    return { transfer: prechecked };
  }

  // Step 3: Approve (if auto-approve enabled)
  if (autoApprove) {
    const approved = await approveTransfer(prechecked.id, input.orgId, 'system');

    if (approved.status !== 'approved') {
      return { transfer: approved };
    }

    // Step 4: Sign
    return signTransfer(approved.id, input.orgId, mode);
  }

  return { transfer: prechecked };
}

// ============================================================================
// Ledger Updates
// ============================================================================

/**
 * Update ledger positions atomically within a transaction.
 * Can be called standalone or within a parent transaction context.
 *
 * @param transfer - The transfer record to process
 * @param txContext - Optional transaction context (if called from within another transaction)
 */
async function updateLedgerPositionsInTx(
  transfer: typeof transfers.$inferSelect,
  txContext: typeof db
) {
  const { orgId, tokenId, fromWallet, toWallet, amount } = transfer;

  // Update sender position
  const senderPosition = await txContext.query.ledgerPositions.findFirst({
    where: and(eq(ledgerPositions.tokenId, tokenId), eq(ledgerPositions.walletAddress, fromWallet)),
  });

  const senderBalanceBefore = senderPosition?.balance || '0';
  const senderBalanceAfter = (BigInt(senderBalanceBefore) - BigInt(amount)).toString();

  // Validate sender has sufficient balance
  if (BigInt(senderBalanceAfter) < 0n) {
    throw new ValidationError(`Insufficient balance: ${senderBalanceBefore} < ${amount}`);
  }

  if (senderPosition) {
    await txContext.update(ledgerPositions)
      .set({
        balance: senderBalanceAfter,
        lastEventRef: transfer.id,
        lastEventAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(ledgerPositions.id, senderPosition.id));
  }

  // Update receiver position
  const receiverPosition = await txContext.query.ledgerPositions.findFirst({
    where: and(eq(ledgerPositions.tokenId, tokenId), eq(ledgerPositions.walletAddress, toWallet)),
  });

  const receiverBalanceBefore = receiverPosition?.balance || '0';
  const receiverBalanceAfter = (BigInt(receiverBalanceBefore) + BigInt(amount)).toString();

  if (receiverPosition) {
    await txContext.update(ledgerPositions)
      .set({
        balance: receiverBalanceAfter,
        lastEventRef: transfer.id,
        lastEventAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(ledgerPositions.id, receiverPosition.id));
  } else {
    // Create new position for receiver
    await txContext.insert(ledgerPositions).values({
      orgId,
      tokenId,
      walletAddress: toWallet,
      investorId: transfer.toInvestorId,
      balance: receiverBalanceAfter,
      lastEventRef: transfer.id,
      lastEventAt: new Date(),
    });
  }

  // Create ledger events for both parties within the same transaction
  await txContext.insert(ledgerEvents).values([
    {
      orgId,
      eventType: 'transfer',
      tokenId,
      fromWallet,
      toWallet,
      delta: `-${amount}`, // Negative for sender
      ref: transfer.id,
      refType: 'transfer',
      balanceBefore: senderBalanceBefore,
      balanceAfter: senderBalanceAfter,
    },
    {
      orgId,
      eventType: 'transfer',
      tokenId,
      fromWallet,
      toWallet,
      delta: amount, // Positive for receiver
      ref: transfer.id,
      refType: 'transfer',
      balanceBefore: receiverBalanceBefore,
      balanceAfter: receiverBalanceAfter,
    },
  ]);
}

/**
 * Update ledger positions with automatic transaction wrapping.
 * Use this for standalone ledger updates outside of settleTransfer.
 */
async function updateLedgerPositions(transfer: typeof transfers.$inferSelect) {
  await withRetryableTransaction(
    async (tx) => updateLedgerPositionsInTx(transfer, tx),
    3,
    100
  );
}

// ============================================================================
// Helpers
// ============================================================================

function formatTransferResponse(transfer: typeof transfers.$inferSelect): TransferResponse {
  return {
    id: transfer.id,
    orgId: transfer.orgId,
    tokenId: transfer.tokenId,
    fromWallet: transfer.fromWallet,
    toWallet: transfer.toWallet,
    amount: transfer.amount,
    status: transfer.status as TransferStatus,
    decisionId: transfer.decisionId || undefined,
    txHash: transfer.txHash || undefined,
    error: transfer.error || undefined,
    createdAt: transfer.createdAt!,
    updatedAt: transfer.updatedAt!,
  };
}

function encodeTransferData(from: string, to: string, amount: string): string {
  // ERC20 transfer function signature: transfer(address,uint256)
  // In production, use ethers.js or viem to properly encode
  const transferSignature = '0xa9059cbb'; // keccak256('transfer(address,uint256)')[:8]

  // Pad address to 32 bytes
  const paddedTo = to.slice(2).padStart(64, '0');

  // Convert amount to hex and pad to 32 bytes
  const amountHex = BigInt(amount).toString(16).padStart(64, '0');

  return `${transferSignature}${paddedTo}${amountHex}`;
}

async function emitTransferEvent(transferId: string, orgId: string, topic: string, payload: object) {
  await db.insert(eventBusQueue).values({
    orgId,
    topic,
    eventId: `evt_${randomUUID().replace(/-/g, '')}`,
    payload: payload as any,
    trace: { transferId, timestamp: new Date() } as any,
    status: 'pending',
  });
}

// ============================================================================
// Expiry Handler (called by scheduler)
// ============================================================================

export async function expireStaleTransfers(): Promise<number> {
  const now = new Date();

  // Find all transfers that have expired
  const staleTransfers = await db.select()
    .from(transfers)
    .where(
      and(
        lt(transfers.expiresAt, now),
        or(
          eq(transfers.status, 'created'),
          eq(transfers.status, 'prechecked'),
          eq(transfers.status, 'approved'),
          eq(transfers.status, 'signing')
        )
      )
    );

  let expiredCount = 0;

  for (const transfer of staleTransfers) {
    try {
      await transitionTransfer(transfer, 'expired');
      await emitTransferEvent(transfer.id, transfer.orgId, 'transfer.expired', {
        transferId: transfer.id,
        expiredAt: now.toISOString(),
      });
      expiredCount++;
    } catch (error) {
      logger.error(`Failed to expire transfer ${transfer.id}`, { error: error as Error });
    }
  }

  return expiredCount;
}

// ============================================================================
// Compliance Check (without creating a transfer)
// ============================================================================

export interface ComplianceCheckInput {
  tokenId: string;
  fromWallet: string;
  toWallet: string;
  amount: string;
}

export interface ComplianceCheckResult {
  allowed: boolean;
  decision: 'allow' | 'deny' | 'review';
  reasons: string[];
  restrictions: string[];
}

export async function checkTransferCompliance(
  orgId: string,
  input: ComplianceCheckInput
): Promise<ComplianceCheckResult> {
  const { tokenId, fromWallet, toWallet, amount } = input;

  try {
    // Run compliance evaluation without persisting
    const decision = await complianceService.evaluateTransfer({
      orgId,
      tokenId,
      fromWallet,
      toWallet,
      amount,
    });

    // Extract reason messages from DecisionReason objects
    const reasonMessages = (decision.reasons || []).map(r =>
      typeof r === 'string' ? r : r.message || r.code || 'Unknown reason'
    );

    return {
      allowed: decision.result === 'allow',
      decision: decision.result as 'allow' | 'deny' | 'review',
      reasons: reasonMessages,
      restrictions: decision.requiredActions || [],
    };
  } catch (error) {
    // If compliance service fails, return a safe default
    logger.error('Compliance check failed', { error: error as Error });
    return {
      allowed: false,
      decision: 'deny',
      reasons: ['Compliance check failed: ' + (error instanceof Error ? error.message : 'Unknown error')],
      restrictions: [],
    };
  }
}
