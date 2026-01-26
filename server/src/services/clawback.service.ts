import { db, schema } from '../config/database.js';
import { eq, and, desc } from 'drizzle-orm';
import { NotFoundError, ValidationError, ForbiddenError } from '../middleware/errorHandler.js';
import * as auditService from './audit.service.js';
import * as domainEvents from './domainEvents.service.js';
import * as evidenceService from './evidence.service.js';
import { requireRequestContext, getActorId } from '../middleware/context.js';
import type { ContextRequest } from '../middleware/context.js';

const { clawbacks, complianceApprovals, tokens, investors, decisions, ledgerPositions } = schema;

// ============================================================================
// Types & Constants
// ============================================================================

export type ClawbackStatus =
  | 'requested'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'executing'
  | 'confirmed'
  | 'failed'
  | 'cancelled';

export type ClawbackReasonCode =
  | 'COURT_ORDER'
  | 'REGULATORY'
  | 'FRAUD'
  | 'AML'
  | 'SANCTIONS'
  | 'ERROR_CORRECTION'
  | 'DECEASED_HOLDER'
  | 'OTHER';

export const CLAWBACK_REASON_CODES: ClawbackReasonCode[] = [
  'COURT_ORDER',
  'REGULATORY',
  'FRAUD',
  'AML',
  'SANCTIONS',
  'ERROR_CORRECTION',
  'DECEASED_HOLDER',
  'OTHER',
];

// State machine transitions
const VALID_TRANSITIONS: Record<ClawbackStatus, ClawbackStatus[]> = {
  requested: ['pending_approval', 'cancelled'],
  pending_approval: ['approved', 'rejected', 'cancelled'],
  approved: ['executing', 'cancelled'],
  rejected: [], // Terminal state
  executing: ['confirmed', 'failed'],
  confirmed: [], // Terminal state
  failed: ['requested'], // Can retry
  cancelled: [], // Terminal state
};

// ============================================================================
// Clawback Request
// ============================================================================

export interface RequestClawbackInput {
  orgId: string;
  tokenId: string;
  fromWallet: string;
  toWallet: string;
  amount: string; // In smallest units (BigInt as string)
  reason: string;
  reasonCode: ClawbackReasonCode;
  legalReference?: string;
  metadata?: Record<string, unknown>;
  idempotencyKey?: string;
}

/**
 * Request a clawback - this requires compliance approval before execution.
 */
export async function requestClawback(
  input: RequestClawbackInput,
  requesterId: string
): Promise<typeof clawbacks.$inferSelect> {
  // Validate reason code
  if (!CLAWBACK_REASON_CODES.includes(input.reasonCode)) {
    throw new ValidationError(`Invalid reason code. Must be one of: ${CLAWBACK_REASON_CODES.join(', ')}`);
  }

  // Validate token exists and is active
  const token = await db.query.tokens.findFirst({
    where: and(eq(tokens.id, input.tokenId), eq(tokens.orgId, input.orgId)),
  });

  if (!token) {
    throw new NotFoundError('Token not found');
  }

  if (token.status === 'frozen') {
    throw new ValidationError('Cannot clawback from a frozen token');
  }

  // Check if from wallet has sufficient balance
  const position = await db.query.ledgerPositions.findFirst({
    where: and(
      eq(ledgerPositions.tokenId, input.tokenId),
      eq(ledgerPositions.walletAddress, input.fromWallet.toLowerCase())
    ),
  });

  if (!position || BigInt(position.balance) < BigInt(input.amount)) {
    throw new ValidationError('Insufficient balance for clawback');
  }

  // Create clawback request within transaction
  return await db.transaction(async (tx) => {
    const [clawback] = await tx.insert(clawbacks).values({
      orgId: input.orgId,
      tokenId: input.tokenId,
      fromWallet: input.fromWallet.toLowerCase(),
      toWallet: input.toWallet.toLowerCase(),
      amount: input.amount,
      reason: input.reason,
      reasonCode: input.reasonCode,
      legalReference: input.legalReference,
      status: 'requested',
      requestedBy: requesterId,
      requestedAt: new Date(),
      idempotencyKey: input.idempotencyKey,
      metadata: input.metadata || {},
    }).returning();

    // Emit domain event
    await domainEvents.emitEvent(tx, {
      eventType: domainEvents.EVENT_TYPES.CLAWBACK_REQUESTED,
      aggregateType: 'clawback',
      aggregateId: clawback.id,
      orgId: input.orgId,
      payload: {
        clawbackId: clawback.id,
        tokenId: input.tokenId,
        fromWallet: input.fromWallet,
        toWallet: input.toWallet,
        amount: input.amount,
        reason: input.reason,
        reasonCode: input.reasonCode,
        requestedBy: requesterId,
      },
    });

    // Audit log
    await auditService.log({
      orgId: input.orgId,
      actorId: requesterId,
      actorType: 'user',
      action: 'clawback_requested',
      resourceType: 'clawback',
      resourceId: clawback.id,
      metadata: {
        tokenId: input.tokenId,
        fromWallet: input.fromWallet,
        toWallet: input.toWallet,
        amount: input.amount,
        reasonCode: input.reasonCode,
      },
    });

    return clawback;
  });
}

// ============================================================================
// Submit for Approval
// ============================================================================

/**
 * Submit a clawback request for compliance approval.
 */
export async function submitForApproval(
  clawbackId: string,
  orgId: string,
  options: {
    supportingDocs?: Array<{ uri: string; type: string; hash: string }>;
    requiredApprovers?: number;
    requiredRoles?: string[];
  } = {}
): Promise<typeof clawbacks.$inferSelect> {
  const clawback = await getClawback(clawbackId, orgId);

  validateTransition(clawback.status as ClawbackStatus, 'pending_approval');

  return await db.transaction(async (tx) => {
    // Create compliance approval request
    const [approval] = await tx.insert(complianceApprovals).values({
      orgId,
      operationType: 'clawback',
      operationRef: clawbackId,
      operationRefType: 'clawback',
      requestedBy: clawback.requestedBy!,
      reason: clawback.reason,
      supportingDocs: options.supportingDocs || [],
      requiredApprovers: options.requiredApprovers || 1,
      requiredRoles: options.requiredRoles || ['compliance_officer'],
      status: 'pending',
    }).returning();

    // Update clawback status
    const [updated] = await tx.update(clawbacks)
      .set({
        status: 'pending_approval',
        complianceApprovalId: approval.id,
        updatedAt: new Date(),
      })
      .where(eq(clawbacks.id, clawbackId))
      .returning();

    // Emit event
    await domainEvents.emitEvent(tx, {
      eventType: domainEvents.EVENT_TYPES.CLAWBACK_PENDING_APPROVAL,
      aggregateType: 'clawback',
      aggregateId: clawbackId,
      orgId,
      payload: {
        clawbackId,
        complianceApprovalId: approval.id,
        requiredApprovers: options.requiredApprovers || 1,
      },
    });

    return updated;
  });
}

// ============================================================================
// Approve/Reject
// ============================================================================

/**
 * Approve a clawback request (by compliance officer).
 */
export async function approveClawback(
  clawbackId: string,
  orgId: string,
  approverId: string,
  comment?: string
): Promise<typeof clawbacks.$inferSelect> {
  const clawback = await getClawback(clawbackId, orgId);

  validateTransition(clawback.status as ClawbackStatus, 'approved');

  return await db.transaction(async (tx) => {
    // Update compliance approval
    if (clawback.complianceApprovalId) {
      const approval = await tx.query.complianceApprovals.findFirst({
        where: eq(complianceApprovals.id, clawback.complianceApprovalId),
      });

      if (approval) {
        const existingApprovals = (approval.approvals as any[]) || [];
        await tx.update(complianceApprovals)
          .set({
            approvals: [...existingApprovals, {
              userId: approverId,
              timestamp: new Date(),
              comment,
            }],
            status: 'approved',
            finalizedBy: approverId,
            finalizedAt: new Date(),
            finalDecision: 'approved',
            updatedAt: new Date(),
          })
          .where(eq(complianceApprovals.id, clawback.complianceApprovalId));
      }
    }

    // Update clawback
    const [updated] = await tx.update(clawbacks)
      .set({
        status: 'approved',
        approvedBy: approverId,
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(clawbacks.id, clawbackId))
      .returning();

    // Emit event
    await domainEvents.emitEvent(tx, {
      eventType: domainEvents.EVENT_TYPES.CLAWBACK_APPROVED,
      aggregateType: 'clawback',
      aggregateId: clawbackId,
      orgId,
      payload: {
        clawbackId,
        approvedBy: approverId,
        comment,
      },
    });

    // Audit log
    await auditService.log({
      orgId,
      actorId: approverId,
      actorType: 'user',
      action: 'clawback_approved',
      resourceType: 'clawback',
      resourceId: clawbackId,
      metadata: { comment },
    });

    return updated;
  });
}

/**
 * Reject a clawback request.
 */
export async function rejectClawback(
  clawbackId: string,
  orgId: string,
  rejectorId: string,
  reason: string
): Promise<typeof clawbacks.$inferSelect> {
  const clawback = await getClawback(clawbackId, orgId);

  validateTransition(clawback.status as ClawbackStatus, 'rejected');

  return await db.transaction(async (tx) => {
    // Update compliance approval
    if (clawback.complianceApprovalId) {
      const approval = await tx.query.complianceApprovals.findFirst({
        where: eq(complianceApprovals.id, clawback.complianceApprovalId),
      });

      if (approval) {
        const existingRejections = (approval.rejections as any[]) || [];
        await tx.update(complianceApprovals)
          .set({
            rejections: [...existingRejections, {
              userId: rejectorId,
              timestamp: new Date(),
              reason,
            }],
            status: 'rejected',
            finalizedBy: rejectorId,
            finalizedAt: new Date(),
            finalDecision: 'rejected',
            updatedAt: new Date(),
          })
          .where(eq(complianceApprovals.id, clawback.complianceApprovalId));
      }
    }

    // Update clawback
    const [updated] = await tx.update(clawbacks)
      .set({
        status: 'rejected',
        rejectedBy: rejectorId,
        rejectedAt: new Date(),
        rejectionReason: reason,
        updatedAt: new Date(),
      })
      .where(eq(clawbacks.id, clawbackId))
      .returning();

    // Emit event
    await domainEvents.emitEvent(tx, {
      eventType: domainEvents.EVENT_TYPES.CLAWBACK_REJECTED,
      aggregateType: 'clawback',
      aggregateId: clawbackId,
      orgId,
      payload: {
        clawbackId,
        rejectedBy: rejectorId,
        reason,
      },
    });

    // Audit log
    await auditService.log({
      orgId,
      actorId: rejectorId,
      actorType: 'user',
      action: 'clawback_rejected',
      resourceType: 'clawback',
      resourceId: clawbackId,
      metadata: { reason },
    });

    return updated;
  });
}

// ============================================================================
// Execute Clawback (On-chain)
// ============================================================================

export interface ExecuteClawbackResult {
  clawback: typeof clawbacks.$inferSelect;
  txHash: string;
}

/**
 * Execute an approved clawback on-chain.
 * This function should be called by the relayer service.
 */
export async function executeClawback(
  clawbackId: string,
  orgId: string,
  executorId: string
): Promise<typeof clawbacks.$inferSelect> {
  const clawback = await getClawback(clawbackId, orgId);

  // Must be approved
  if (clawback.status !== 'approved') {
    throw new ValidationError('Clawback must be approved before execution');
  }

  validateTransition(clawback.status as ClawbackStatus, 'executing');

  // Get token for contract interaction
  const token = await db.query.tokens.findFirst({
    where: eq(tokens.id, clawback.tokenId),
  });

  if (!token || !token.address) {
    throw new ValidationError('Token not deployed');
  }

  return await db.transaction(async (tx) => {
    // Mark as executing
    const [updated] = await tx.update(clawbacks)
      .set({
        status: 'executing',
        executedBy: executorId,
        executedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(clawbacks.id, clawbackId))
      .returning();

    // Emit event
    await domainEvents.emitEvent(tx, {
      eventType: domainEvents.EVENT_TYPES.CLAWBACK_EXECUTING,
      aggregateType: 'clawback',
      aggregateId: clawbackId,
      orgId,
      payload: {
        clawbackId,
        tokenAddress: token.address,
        fromWallet: clawback.fromWallet,
        toWallet: clawback.toWallet,
        amount: clawback.amount,
        executedBy: executorId,
      },
    });

    return updated;
  });

  // Note: The actual on-chain transaction would be handled by the relayer service
  // which would call confirmClawback() or failClawback() after the tx is mined
}

/**
 * Confirm a clawback after on-chain execution.
 */
export async function confirmClawback(
  clawbackId: string,
  orgId: string,
  txHash: string,
  txBlock: number
): Promise<typeof clawbacks.$inferSelect> {
  const clawback = await getClawback(clawbackId, orgId);

  validateTransition(clawback.status as ClawbackStatus, 'confirmed');

  return await db.transaction(async (tx) => {
    // Generate evidence pack
    const evidencePack = await evidenceService.generateClawbackPack(clawbackId, orgId);

    // Update clawback
    const [updated] = await tx.update(clawbacks)
      .set({
        status: 'confirmed',
        txHash,
        txBlock,
        confirmedAt: new Date(),
        evidencePackId: evidencePack.id,
        updatedAt: new Date(),
      })
      .where(eq(clawbacks.id, clawbackId))
      .returning();

    // Emit event
    await domainEvents.emitEvent(tx, {
      eventType: domainEvents.EVENT_TYPES.CLAWBACK_CONFIRMED,
      aggregateType: 'clawback',
      aggregateId: clawbackId,
      orgId,
      payload: {
        clawbackId,
        txHash,
        txBlock,
        evidencePackId: evidencePack.id,
      },
    });

    // Audit log
    await auditService.log({
      orgId,
      actorType: 'system',
      action: 'clawback_confirmed',
      resourceType: 'clawback',
      resourceId: clawbackId,
      metadata: {
        txHash,
        txBlock,
        evidencePackId: evidencePack.id,
      },
    });

    return updated;
  });
}

/**
 * Mark a clawback as failed.
 */
export async function failClawback(
  clawbackId: string,
  orgId: string,
  error: string,
  txHash?: string
): Promise<typeof clawbacks.$inferSelect> {
  const clawback = await getClawback(clawbackId, orgId);

  validateTransition(clawback.status as ClawbackStatus, 'failed');

  return await db.transaction(async (tx) => {
    const [updated] = await tx.update(clawbacks)
      .set({
        status: 'failed',
        error,
        txHash,
        updatedAt: new Date(),
      })
      .where(eq(clawbacks.id, clawbackId))
      .returning();

    // Emit event
    await domainEvents.emitEvent(tx, {
      eventType: domainEvents.EVENT_TYPES.CLAWBACK_FAILED,
      aggregateType: 'clawback',
      aggregateId: clawbackId,
      orgId,
      payload: {
        clawbackId,
        error,
        txHash,
      },
    });

    return updated;
  });
}

/**
 * Cancel a clawback request.
 */
export async function cancelClawback(
  clawbackId: string,
  orgId: string,
  cancelledBy: string,
  reason: string
): Promise<typeof clawbacks.$inferSelect> {
  const clawback = await getClawback(clawbackId, orgId);

  validateTransition(clawback.status as ClawbackStatus, 'cancelled');

  return await db.transaction(async (tx) => {
    const [updated] = await tx.update(clawbacks)
      .set({
        status: 'cancelled',
        metadata: {
          ...(clawback.metadata as Record<string, unknown> || {}),
          cancelledBy,
          cancelledAt: new Date(),
          cancellationReason: reason,
        },
        updatedAt: new Date(),
      })
      .where(eq(clawbacks.id, clawbackId))
      .returning();

    // Audit log
    await auditService.log({
      orgId,
      actorId: cancelledBy,
      actorType: 'user',
      action: 'clawback_cancelled',
      resourceType: 'clawback',
      resourceId: clawbackId,
      metadata: { reason },
    });

    return updated;
  });
}

// ============================================================================
// Query Functions
// ============================================================================

export async function getClawback(
  id: string,
  orgId: string
): Promise<typeof clawbacks.$inferSelect> {
  const clawback = await db.query.clawbacks.findFirst({
    where: and(eq(clawbacks.id, id), eq(clawbacks.orgId, orgId)),
  });

  if (!clawback) {
    throw new NotFoundError('Clawback not found');
  }

  return clawback;
}

export async function listClawbacks(
  orgId: string,
  options: {
    tokenId?: string;
    status?: ClawbackStatus;
    limit?: number;
    offset?: number;
  } = {}
): Promise<Array<typeof clawbacks.$inferSelect>> {
  const { tokenId, status, limit = 50, offset = 0 } = options;

  const conditions = [eq(clawbacks.orgId, orgId)];
  if (tokenId) conditions.push(eq(clawbacks.tokenId, tokenId));
  if (status) conditions.push(eq(clawbacks.status, status));

  return db.select()
    .from(clawbacks)
    .where(and(...conditions))
    .orderBy(desc(clawbacks.createdAt))
    .limit(limit)
    .offset(offset);
}

// ============================================================================
// Helpers
// ============================================================================

function validateTransition(currentStatus: ClawbackStatus, targetStatus: ClawbackStatus): void {
  const validTargets = VALID_TRANSITIONS[currentStatus];

  if (!validTargets.includes(targetStatus)) {
    throw new ValidationError(
      `Cannot transition from '${currentStatus}' to '${targetStatus}'. ` +
      `Valid transitions: ${validTargets.join(', ') || 'none (terminal state)'}`
    );
  }
}
