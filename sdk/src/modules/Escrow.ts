/**
 * Escrow Module
 *
 * Handles conditional transfers, escrow agreements, and atomic swaps.
 * Supports multiple release conditions and multi-party escrows.
 */

import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { BaseEvent, EventType } from '../core/types.js';
import { ValidationError, SDKError, ErrorCode } from '../errors/index.js';

// ============================================================================
// TYPES AND SCHEMAS
// ============================================================================

/**
 * Escrow type
 */
export enum EscrowType {
  /** Simple escrow between two parties */
  SIMPLE = 'SIMPLE',

  /** Time-locked escrow */
  TIME_LOCKED = 'TIME_LOCKED',

  /** Milestone-based escrow */
  MILESTONE = 'MILESTONE',

  /** Multi-signature escrow */
  MULTI_SIG = 'MULTI_SIG',

  /** Atomic swap */
  ATOMIC_SWAP = 'ATOMIC_SWAP',

  /** Conditional (oracle-based) */
  CONDITIONAL = 'CONDITIONAL',

  /** Dispute resolution escrow */
  DISPUTE = 'DISPUTE',
}

/**
 * Escrow status
 */
export enum EscrowStatus {
  DRAFT = 'DRAFT',
  FUNDED = 'FUNDED',
  ACTIVE = 'ACTIVE',
  PENDING_RELEASE = 'PENDING_RELEASE',
  PARTIALLY_RELEASED = 'PARTIALLY_RELEASED',
  RELEASED = 'RELEASED',
  REFUNDED = 'REFUNDED',
  DISPUTED = 'DISPUTED',
  EXPIRED = 'EXPIRED',
  CANCELLED = 'CANCELLED',
}

/**
 * Release condition type
 */
export enum ReleaseConditionType {
  /** Time-based (after date) */
  TIME = 'TIME',

  /** Signature from party */
  SIGNATURE = 'SIGNATURE',

  /** Oracle data condition */
  ORACLE = 'ORACLE',

  /** Milestone completion */
  MILESTONE = 'MILESTONE',

  /** Multi-sig threshold */
  MULTI_SIG = 'MULTI_SIG',

  /** External approval */
  EXTERNAL = 'EXTERNAL',

  /** Custom condition */
  CUSTOM = 'CUSTOM',
}

/**
 * Release condition schema
 */
export const ReleaseConditionSchema = z.object({
  /** Condition ID */
  id: z.string().uuid(),

  /** Condition type */
  type: z.nativeEnum(ReleaseConditionType),

  /** Description */
  description: z.string(),

  /** Whether this condition is met */
  isMet: z.boolean().default(false),

  /** When condition was met */
  metAt: z.string().datetime().optional(),

  /** Condition parameters */
  parameters: z.record(z.unknown()),

  /** Percentage of funds this condition releases */
  releasePercentage: z.number().min(0).max(100).default(100),

  /** Order in which conditions must be met (0 = any order) */
  order: z.number().nonnegative().default(0),

  /** Whether this is a required condition */
  required: z.boolean().default(true),
});

export type ReleaseCondition = z.infer<typeof ReleaseConditionSchema>;

/**
 * Escrow party schema
 */
export const EscrowPartySchema = z.object({
  /** Party ID */
  partyId: z.string(),

  /** Party address (for blockchain) */
  address: z.string().optional(),

  /** Role in escrow */
  role: z.enum(['DEPOSITOR', 'BENEFICIARY', 'ARBITER', 'ORACLE', 'APPROVER']),

  /** Amount deposited (for depositors) */
  depositedAmount: z.string().optional(),

  /** Amount to receive (for beneficiaries) */
  receiveAmount: z.string().optional(),

  /** Whether party has signed/approved */
  hasSigned: z.boolean().default(false),

  /** Signature timestamp */
  signedAt: z.string().datetime().optional(),
});

export type EscrowParty = z.infer<typeof EscrowPartySchema>;

/**
 * Escrow schema
 */
export const EscrowSchema = z.object({
  /** Unique escrow ID */
  id: z.string().uuid(),

  /** Escrow type */
  type: z.nativeEnum(EscrowType),

  /** Current status */
  status: z.nativeEnum(EscrowStatus),

  /** Title/description */
  title: z.string(),

  /** Detailed description */
  description: z.string().optional(),

  /** Asset ID being escrowed */
  assetId: z.string().uuid(),

  /** Token amount in escrow */
  amount: z.string(),

  /** Currency/token type */
  currency: z.string(),

  /** Parties involved */
  parties: z.array(EscrowPartySchema),

  /** Release conditions */
  conditions: z.array(ReleaseConditionSchema),

  /** How many conditions must be met (for OR logic) */
  requiredConditions: z.number().positive().optional(),

  /** Amount released so far */
  releasedAmount: z.string().default('0'),

  /** Amount refunded so far */
  refundedAmount: z.string().default('0'),

  /** Expiration date */
  expiresAt: z.string().datetime().optional(),

  /** Dispute deadline */
  disputeDeadline: z.string().datetime().optional(),

  /** Fee percentage */
  feePercentage: z.number().min(0).max(100).default(0),

  /** Fee recipient */
  feeRecipient: z.string().optional(),

  /** Transaction hashes */
  txHashes: z.array(z.object({
    action: z.string(),
    hash: z.string(),
    timestamp: z.string().datetime(),
  })).default([]),

  /** Metadata */
  metadata: z.record(z.unknown()).optional(),

  /** Created at */
  createdAt: z.string().datetime(),

  /** Updated at */
  updatedAt: z.string().datetime(),
});

export type Escrow = z.infer<typeof EscrowSchema>;

/**
 * Milestone schema
 */
export const MilestoneSchema = z.object({
  /** Milestone ID */
  id: z.string().uuid(),

  /** Escrow ID */
  escrowId: z.string().uuid(),

  /** Title */
  title: z.string(),

  /** Description */
  description: z.string().optional(),

  /** Amount released on completion */
  amount: z.string(),

  /** Percentage of total */
  percentage: z.number().min(0).max(100),

  /** Order */
  order: z.number().nonnegative(),

  /** Status */
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'REJECTED']),

  /** Evidence/proof */
  evidence: z.array(z.object({
    type: z.string(),
    uri: z.string(),
    submittedAt: z.string().datetime(),
    submittedBy: z.string(),
  })).default([]),

  /** Approvals */
  approvals: z.array(z.object({
    approverId: z.string(),
    approved: z.boolean(),
    timestamp: z.string().datetime(),
    comments: z.string().optional(),
  })).default([]),

  /** Due date */
  dueDate: z.string().datetime().optional(),

  /** Completed at */
  completedAt: z.string().datetime().optional(),
});

export type Milestone = z.infer<typeof MilestoneSchema>;

// ============================================================================
// ESCROW ENGINE
// ============================================================================

/**
 * Escrow Engine for managing escrow agreements
 */
export class EscrowEngine {
  private escrows: Map<string, Escrow> = new Map();
  private milestones: Map<string, Milestone[]> = new Map();
  private eventStore?: { append: (event: BaseEvent) => Promise<void> };
  private oracleProvider?: (conditionId: string, parameters: Record<string, unknown>) => Promise<boolean>;

  constructor(
    eventStore?: { append: (event: BaseEvent) => Promise<void> },
    oracleProvider?: (conditionId: string, parameters: Record<string, unknown>) => Promise<boolean>
  ) {
    this.eventStore = eventStore;
    this.oracleProvider = oracleProvider;
  }

  /**
   * Set oracle provider
   */
  setOracleProvider(
    provider: (conditionId: string, parameters: Record<string, unknown>) => Promise<boolean>
  ): void {
    this.oracleProvider = provider;
  }

  // ============================================
  // ESCROW MANAGEMENT
  // ============================================

  /**
   * Create an escrow
   */
  createEscrow(params: {
    type: EscrowType;
    title: string;
    description?: string;
    assetId: string;
    amount: string;
    currency: string;
    parties: EscrowParty[];
    conditions?: ReleaseCondition[];
    requiredConditions?: number;
    expiresAt?: string;
    disputeDeadline?: string;
    feePercentage?: number;
    feeRecipient?: string;
    metadata?: Record<string, unknown>;
  }): Escrow {
    const now = new Date().toISOString();

    // Generate default conditions based on type
    let conditions = params.conditions || [];
    if (conditions.length === 0) {
      conditions = this.generateDefaultConditions(params.type, params.parties);
    }

    const escrow: Escrow = {
      id: uuidv4(),
      type: params.type,
      status: EscrowStatus.DRAFT,
      title: params.title,
      description: params.description,
      assetId: params.assetId,
      amount: params.amount,
      currency: params.currency,
      parties: params.parties,
      conditions,
      requiredConditions: params.requiredConditions,
      releasedAmount: '0',
      refundedAmount: '0',
      expiresAt: params.expiresAt,
      disputeDeadline: params.disputeDeadline,
      feePercentage: params.feePercentage || 0,
      feeRecipient: params.feeRecipient,
      txHashes: [],
      metadata: params.metadata,
      createdAt: now,
      updatedAt: now,
    };

    const validated = EscrowSchema.parse(escrow);
    this.escrows.set(validated.id, validated);

    return validated;
  }

  /**
   * Fund an escrow
   */
  async fundEscrow(
    escrowId: string,
    depositorId: string,
    amount: string,
    txHash?: string
  ): Promise<Escrow> {
    const escrow = this.escrows.get(escrowId);
    if (!escrow) {
      throw new SDKError(
        `Escrow not found: ${escrowId}`,
        ErrorCode.NOT_FOUND,
        { details: { escrowId } }
      );
    }

    if (escrow.status !== EscrowStatus.DRAFT && escrow.status !== EscrowStatus.FUNDED) {
      throw new SDKError(
        'Escrow cannot be funded in current state',
        ErrorCode.INVALID_STATE,
        { details: { escrowId, currentStatus: escrow.status } }
      );
    }

    const depositor = escrow.parties.find(
      p => p.partyId === depositorId && p.role === 'DEPOSITOR'
    );
    if (!depositor) {
      throw new ValidationError('Depositor not found in escrow parties', {
        field: 'depositorId',
        constraints: { validParty: 'DEPOSITOR' },
      });
    }

    depositor.depositedAmount = (
      BigInt(depositor.depositedAmount || '0') + BigInt(amount)
    ).toString();

    // Check if fully funded
    const totalDeposits = escrow.parties
      .filter(p => p.role === 'DEPOSITOR')
      .reduce((sum, p) => sum + BigInt(p.depositedAmount || '0'), 0n);

    if (totalDeposits >= BigInt(escrow.amount)) {
      escrow.status = EscrowStatus.ACTIVE;
    } else {
      escrow.status = EscrowStatus.FUNDED;
    }

    if (txHash) {
      escrow.txHashes.push({
        action: 'FUND',
        hash: txHash,
        timestamp: new Date().toISOString(),
      });
    }

    escrow.updatedAt = new Date().toISOString();

    // Emit event
    if (this.eventStore) {
      await this.eventStore.append({
        id: uuidv4(),
        type: EventType.ASSET_UPDATED,
        assetId: escrow.assetId,
        timestamp: escrow.updatedAt,
        actorId: depositorId,
        payload: {
          action: 'ESCROW_FUNDED',
          escrowId,
          amount,
          totalDeposits: totalDeposits.toString(),
        },
        eventVersion: 1,
      });
    }

    return escrow;
  }

  /**
   * Sign/approve escrow
   */
  async signEscrow(escrowId: string, partyId: string): Promise<Escrow> {
    const escrow = this.escrows.get(escrowId);
    if (!escrow) {
      throw new SDKError(
        `Escrow not found: ${escrowId}`,
        ErrorCode.NOT_FOUND,
        { details: { escrowId } }
      );
    }

    const party = escrow.parties.find(p => p.partyId === partyId);
    if (!party) {
      throw new ValidationError('Party not found in escrow', {
        field: 'partyId',
        constraints: { validParty: 'true' },
      });
    }

    party.hasSigned = true;
    party.signedAt = new Date().toISOString();
    escrow.updatedAt = new Date().toISOString();

    // Check signature conditions
    await this.checkSignatureConditions(escrow);

    return escrow;
  }

  /**
   * Check and update release conditions
   */
  async checkConditions(escrowId: string): Promise<Escrow> {
    const escrow = this.escrows.get(escrowId);
    if (!escrow) {
      throw new SDKError(
        `Escrow not found: ${escrowId}`,
        ErrorCode.NOT_FOUND,
        { details: { escrowId } }
      );
    }

    const now = new Date();

    for (const condition of escrow.conditions) {
      if (condition.isMet) continue;

      let isMet = false;

      switch (condition.type) {
        case ReleaseConditionType.TIME:
          const releaseTime = condition.parameters.releaseAt as string;
          if (releaseTime && now.toISOString() >= releaseTime) {
            isMet = true;
          }
          break;

        case ReleaseConditionType.SIGNATURE:
          const requiredSignerId = condition.parameters.signerId as string;
          const party = escrow.parties.find(p => p.partyId === requiredSignerId);
          isMet = party?.hasSigned ?? false;
          break;

        case ReleaseConditionType.ORACLE:
          if (this.oracleProvider) {
            isMet = await this.oracleProvider(condition.id, condition.parameters);
          }
          break;

        case ReleaseConditionType.MULTI_SIG:
          const threshold = (condition.parameters.threshold as number) || 2;
          const approverIds = (condition.parameters.approverIds as string[]) || [];
          const signedCount = escrow.parties.filter(
            p => approverIds.includes(p.partyId) && p.hasSigned
          ).length;
          isMet = signedCount >= threshold;
          break;

        case ReleaseConditionType.MILESTONE:
          const milestoneId = condition.parameters.milestoneId as string;
          const milestones = this.milestones.get(escrowId) || [];
          const milestone = milestones.find(m => m.id === milestoneId);
          isMet = milestone?.status === 'COMPLETED';
          break;
      }

      if (isMet) {
        condition.isMet = true;
        condition.metAt = now.toISOString();
      }
    }

    escrow.updatedAt = now.toISOString();

    // Check if ready for release
    if (this.canRelease(escrow)) {
      escrow.status = EscrowStatus.PENDING_RELEASE;
    }

    return escrow;
  }

  /**
   * Release escrow funds
   */
  async releaseEscrow(
    escrowId: string,
    releaserId: string,
    amount?: string,
    txHash?: string
  ): Promise<Escrow> {
    const escrow = this.escrows.get(escrowId);
    if (!escrow) {
      throw new SDKError(
        `Escrow not found: ${escrowId}`,
        ErrorCode.NOT_FOUND,
        { details: { escrowId } }
      );
    }

    if (!this.canRelease(escrow)) {
      throw new SDKError(
        'Release conditions not met',
        ErrorCode.INVALID_STATE,
        { details: { escrowId, conditions: escrow.conditions.map(c => ({ id: c.id, isMet: c.isMet })) } }
      );
    }

    const releaseAmount = amount || (
      BigInt(escrow.amount) - BigInt(escrow.releasedAmount)
    ).toString();

    const remaining = BigInt(escrow.amount) - BigInt(escrow.releasedAmount);
    if (BigInt(releaseAmount) > remaining) {
      throw new ValidationError('Release amount exceeds remaining balance', {
        field: 'amount',
        constraints: { maximum: remaining.toString() },
      });
    }

    escrow.releasedAmount = (
      BigInt(escrow.releasedAmount) + BigInt(releaseAmount)
    ).toString();

    if (BigInt(escrow.releasedAmount) >= BigInt(escrow.amount)) {
      escrow.status = EscrowStatus.RELEASED;
    } else {
      escrow.status = EscrowStatus.PARTIALLY_RELEASED;
    }

    if (txHash) {
      escrow.txHashes.push({
        action: 'RELEASE',
        hash: txHash,
        timestamp: new Date().toISOString(),
      });
    }

    escrow.updatedAt = new Date().toISOString();

    // Emit event
    if (this.eventStore) {
      await this.eventStore.append({
        id: uuidv4(),
        type: EventType.ASSET_UPDATED,
        assetId: escrow.assetId,
        timestamp: escrow.updatedAt,
        actorId: releaserId,
        payload: {
          action: 'ESCROW_RELEASED',
          escrowId,
          releaseAmount,
          totalReleased: escrow.releasedAmount,
        },
        eventVersion: 1,
      });
    }

    return escrow;
  }

  /**
   * Refund escrow
   */
  async refundEscrow(
    escrowId: string,
    refunderId: string,
    reason?: string,
    txHash?: string
  ): Promise<Escrow> {
    const escrow = this.escrows.get(escrowId);
    if (!escrow) {
      throw new SDKError(
        `Escrow not found: ${escrowId}`,
        ErrorCode.NOT_FOUND,
        { details: { escrowId } }
      );
    }

    // Check if refund is allowed
    if (escrow.status === EscrowStatus.RELEASED) {
      throw new SDKError(
        'Cannot refund released escrow',
        ErrorCode.INVALID_STATE,
        { details: { escrowId, status: escrow.status } }
      );
    }

    // Check expiration
    if (escrow.expiresAt && new Date().toISOString() > escrow.expiresAt) {
      escrow.status = EscrowStatus.EXPIRED;
    }

    const remaining = BigInt(escrow.amount) - BigInt(escrow.releasedAmount);
    escrow.refundedAmount = remaining.toString();
    escrow.status = EscrowStatus.REFUNDED;

    if (txHash) {
      escrow.txHashes.push({
        action: 'REFUND',
        hash: txHash,
        timestamp: new Date().toISOString(),
      });
    }

    escrow.updatedAt = new Date().toISOString();

    // Emit event
    if (this.eventStore) {
      await this.eventStore.append({
        id: uuidv4(),
        type: EventType.ASSET_UPDATED,
        assetId: escrow.assetId,
        timestamp: escrow.updatedAt,
        actorId: refunderId,
        payload: {
          action: 'ESCROW_REFUNDED',
          escrowId,
          refundAmount: escrow.refundedAmount,
          reason,
        },
        eventVersion: 1,
      });
    }

    return escrow;
  }

  /**
   * Raise a dispute
   */
  async raiseDispute(
    escrowId: string,
    partyId: string,
    reason: string
  ): Promise<Escrow> {
    const escrow = this.escrows.get(escrowId);
    if (!escrow) {
      throw new SDKError(
        `Escrow not found: ${escrowId}`,
        ErrorCode.NOT_FOUND,
        { details: { escrowId } }
      );
    }

    const party = escrow.parties.find(p => p.partyId === partyId);
    if (!party) {
      throw new ValidationError('Party not in escrow', {
        field: 'partyId',
        constraints: { validParty: 'true' },
      });
    }

    if (escrow.disputeDeadline && new Date().toISOString() > escrow.disputeDeadline) {
      throw new SDKError(
        'Dispute deadline passed',
        ErrorCode.INVALID_STATE,
        { details: { escrowId, disputeDeadline: escrow.disputeDeadline } }
      );
    }

    escrow.status = EscrowStatus.DISPUTED;
    escrow.metadata = {
      ...escrow.metadata,
      dispute: {
        raisedBy: partyId,
        reason,
        timestamp: new Date().toISOString(),
      },
    };
    escrow.updatedAt = new Date().toISOString();

    return escrow;
  }

  /**
   * Resolve a dispute
   */
  async resolveDispute(
    escrowId: string,
    arbiterId: string,
    decision: 'RELEASE' | 'REFUND' | 'SPLIT',
    splitPercentage?: number
  ): Promise<Escrow> {
    const escrow = this.escrows.get(escrowId);
    if (!escrow) {
      throw new SDKError(
        `Escrow not found: ${escrowId}`,
        ErrorCode.NOT_FOUND,
        { details: { escrowId } }
      );
    }

    if (escrow.status !== EscrowStatus.DISPUTED) {
      throw new SDKError(
        'Escrow is not in dispute',
        ErrorCode.INVALID_STATE,
        { details: { escrowId, currentStatus: escrow.status } }
      );
    }

    const arbiter = escrow.parties.find(
      p => p.partyId === arbiterId && p.role === 'ARBITER'
    );
    if (!arbiter) {
      throw new SDKError(
        'Only arbiter can resolve dispute',
        ErrorCode.UNAUTHORIZED,
        { details: { escrowId, arbiterId } }
      );
    }

    const remaining = BigInt(escrow.amount) - BigInt(escrow.releasedAmount);

    switch (decision) {
      case 'RELEASE':
        escrow.releasedAmount = escrow.amount;
        escrow.status = EscrowStatus.RELEASED;
        break;

      case 'REFUND':
        escrow.refundedAmount = remaining.toString();
        escrow.status = EscrowStatus.REFUNDED;
        break;

      case 'SPLIT':
        const releasePercent = splitPercentage || 50;
        const releaseAmount = (remaining * BigInt(releasePercent)) / 100n;
        escrow.releasedAmount = (
          BigInt(escrow.releasedAmount) + releaseAmount
        ).toString();
        escrow.refundedAmount = (remaining - releaseAmount).toString();
        escrow.status = EscrowStatus.RELEASED;
        break;
    }

    escrow.metadata = {
      ...escrow.metadata,
      resolution: {
        decision,
        splitPercentage,
        resolvedBy: arbiterId,
        timestamp: new Date().toISOString(),
      },
    };
    escrow.updatedAt = new Date().toISOString();

    return escrow;
  }

  // ============================================
  // MILESTONE MANAGEMENT
  // ============================================

  /**
   * Add milestone to escrow
   */
  addMilestone(params: {
    escrowId: string;
    title: string;
    description?: string;
    amount: string;
    percentage: number;
    order: number;
    dueDate?: string;
  }): Milestone {
    const escrow = this.escrows.get(params.escrowId);
    if (!escrow) {
      throw new SDKError(
        `Escrow not found: ${params.escrowId}`,
        ErrorCode.NOT_FOUND,
        { details: { escrowId: params.escrowId } }
      );
    }

    const milestone: Milestone = {
      id: uuidv4(),
      escrowId: params.escrowId,
      title: params.title,
      description: params.description,
      amount: params.amount,
      percentage: params.percentage,
      order: params.order,
      status: 'PENDING',
      evidence: [],
      approvals: [],
      dueDate: params.dueDate,
    };

    const validated = MilestoneSchema.parse(milestone);

    const existing = this.milestones.get(params.escrowId) || [];
    existing.push(validated);
    this.milestones.set(params.escrowId, existing);

    // Add condition for milestone
    escrow.conditions.push({
      id: uuidv4(),
      type: ReleaseConditionType.MILESTONE,
      description: `Milestone: ${params.title}`,
      isMet: false,
      parameters: { milestoneId: validated.id },
      releasePercentage: params.percentage,
      order: params.order,
      required: true,
    });

    return validated;
  }

  /**
   * Submit milestone evidence
   */
  submitMilestoneEvidence(
    escrowId: string,
    milestoneId: string,
    submitterId: string,
    evidence: { type: string; uri: string }
  ): Milestone {
    const milestones = this.milestones.get(escrowId);
    if (!milestones) {
      throw new SDKError(
        `No milestones for escrow: ${escrowId}`,
        ErrorCode.NOT_FOUND,
        { details: { escrowId } }
      );
    }

    const milestone = milestones.find(m => m.id === milestoneId);
    if (!milestone) {
      throw new SDKError(
        `Milestone not found: ${milestoneId}`,
        ErrorCode.NOT_FOUND,
        { details: { escrowId, milestoneId } }
      );
    }

    milestone.evidence.push({
      ...evidence,
      submittedAt: new Date().toISOString(),
      submittedBy: submitterId,
    });
    milestone.status = 'IN_PROGRESS';

    return milestone;
  }

  /**
   * Approve milestone
   */
  async approveMilestone(
    escrowId: string,
    milestoneId: string,
    approverId: string,
    approved: boolean,
    comments?: string
  ): Promise<Milestone> {
    const milestones = this.milestones.get(escrowId);
    if (!milestones) {
      throw new SDKError(
        `No milestones for escrow: ${escrowId}`,
        ErrorCode.NOT_FOUND,
        { details: { escrowId } }
      );
    }

    const milestone = milestones.find(m => m.id === milestoneId);
    if (!milestone) {
      throw new SDKError(
        `Milestone not found: ${milestoneId}`,
        ErrorCode.NOT_FOUND,
        { details: { escrowId, milestoneId } }
      );
    }

    milestone.approvals.push({
      approverId,
      approved,
      timestamp: new Date().toISOString(),
      comments,
    });

    if (approved) {
      milestone.status = 'COMPLETED';
      milestone.completedAt = new Date().toISOString();

      // Update escrow conditions
      await this.checkConditions(escrowId);
    } else {
      milestone.status = 'REJECTED';
    }

    return milestone;
  }

  // ============================================
  // UTILITIES
  // ============================================

  /**
   * Generate default conditions based on escrow type
   */
  private generateDefaultConditions(
    type: EscrowType,
    parties: EscrowParty[]
  ): ReleaseCondition[] {
    const conditions: ReleaseCondition[] = [];

    switch (type) {
      case EscrowType.SIMPLE:
        // Require beneficiary signature
        const beneficiary = parties.find(p => p.role === 'BENEFICIARY');
        const depositor = parties.find(p => p.role === 'DEPOSITOR');
        if (beneficiary) {
          conditions.push({
            id: uuidv4(),
            type: ReleaseConditionType.SIGNATURE,
            description: 'Depositor releases funds',
            isMet: false,
            parameters: { signerId: depositor?.partyId },
            releasePercentage: 100,
            order: 1,
            required: true,
          });
        }
        break;

      case EscrowType.TIME_LOCKED:
        conditions.push({
          id: uuidv4(),
          type: ReleaseConditionType.TIME,
          description: 'Time lock expires',
          isMet: false,
          parameters: { releaseAt: new Date(Date.now() + 86400000).toISOString() },
          releasePercentage: 100,
          order: 1,
          required: true,
        });
        break;

      case EscrowType.MULTI_SIG:
        const approverIds = parties
          .filter(p => p.role === 'APPROVER')
          .map(p => p.partyId);
        conditions.push({
          id: uuidv4(),
          type: ReleaseConditionType.MULTI_SIG,
          description: 'Multi-signature approval',
          isMet: false,
          parameters: { approverIds, threshold: Math.ceil(approverIds.length / 2) },
          releasePercentage: 100,
          order: 1,
          required: true,
        });
        break;
    }

    return conditions;
  }

  /**
   * Check signature-based conditions
   */
  private async checkSignatureConditions(escrow: Escrow): Promise<void> {
    for (const condition of escrow.conditions) {
      if (condition.type !== ReleaseConditionType.SIGNATURE) continue;
      if (condition.isMet) continue;

      const signerId = condition.parameters.signerId as string;
      const party = escrow.parties.find(p => p.partyId === signerId);

      if (party?.hasSigned) {
        condition.isMet = true;
        condition.metAt = new Date().toISOString();
      }
    }
  }

  /**
   * Check if escrow can be released
   */
  private canRelease(escrow: Escrow): boolean {
    if (escrow.status === EscrowStatus.RELEASED) return false;
    if (escrow.status === EscrowStatus.REFUNDED) return false;
    if (escrow.status === EscrowStatus.DISPUTED) return false;

    const requiredConditions = escrow.requiredConditions || escrow.conditions.length;
    const metConditions = escrow.conditions.filter(c => c.isMet).length;

    // Check if required conditions are met
    const requiredMet = escrow.conditions
      .filter(c => c.required)
      .every(c => c.isMet);

    return requiredMet && metConditions >= requiredConditions;
  }

  /**
   * Get escrow by ID
   */
  getEscrow(escrowId: string): Escrow | undefined {
    return this.escrows.get(escrowId);
  }

  /**
   * Get escrows for an asset
   */
  getEscrowsForAsset(assetId: string): Escrow[] {
    return Array.from(this.escrows.values()).filter(e => e.assetId === assetId);
  }

  /**
   * Get escrows for a party
   */
  getEscrowsForParty(partyId: string): Escrow[] {
    return Array.from(this.escrows.values()).filter(e =>
      e.parties.some(p => p.partyId === partyId)
    );
  }

  /**
   * Get milestones for escrow
   */
  getMilestones(escrowId: string): Milestone[] {
    return this.milestones.get(escrowId) || [];
  }
}
