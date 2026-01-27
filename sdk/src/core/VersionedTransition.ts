import { createHash } from 'crypto';

// ============================================================================
// Versioned State Transitions - Full audit trail with who/why/when
// ============================================================================

/**
 * Actor types that can trigger transitions
 */
export type TransitionActorType = 'user' | 'api_key' | 'system' | 'webhook';

/**
 * Subject types that can have state transitions
 */
export type TransitionSubjectType = 'asset' | 'token' | 'investor' | 'transfer';

/**
 * Request to perform a versioned state transition
 */
export interface VersionedTransitionRequest {
  /** Subject being transitioned */
  subjectType: TransitionSubjectType;
  subjectId: string;

  /** For convenience, can also specify asset/token ID directly */
  assetId?: string;
  tokenId?: string;

  /** State change */
  fromState: string;
  toState: string;

  /** Actor information (who) */
  actorId: string;
  actorType: TransitionActorType;
  actorName?: string;
  actorIp?: string;

  /** Justification (why) */
  reason: string;
  justification?: string;

  /** Compliance linkage */
  decisionReceiptId?: string;
  complianceResult?: 'allow' | 'deny' | 'override';

  /** Request context */
  requestId?: string;
  traceId?: string;

  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Recorded state transition with full audit data
 */
export interface StateTransitionRecord {
  id: string;
  orgId: string;

  /** Subject */
  subjectType: TransitionSubjectType;
  subjectId: string;
  assetId?: string;
  tokenId?: string;

  /** State change */
  previousState: string;
  newState: string;

  /** Versioning */
  version: number;
  previousTransitionId?: string;

  /** Actor (who) */
  triggeredById: string;
  triggeredByType: TransitionActorType;
  triggeredByName?: string;
  triggeredByIp?: string;

  /** Justification (why) */
  reason: string;
  justification?: string;

  /** Compliance */
  decisionReceiptId?: string;
  complianceResult?: string;

  /** Hash chain (tamper-evidence) */
  transitionHash: string;
  previousTransitionHash?: string;

  /** Context */
  requestId?: string;
  traceId?: string;

  /** Timing (when) */
  executedAt: Date;
  createdAt: Date;

  /** Metadata */
  metadata: Record<string, unknown>;
}

/**
 * Result of a transition operation
 */
export interface TransitionResult {
  success: boolean;
  transition?: StateTransitionRecord;
  error?: TransitionError;
}

/**
 * Transition error
 */
export interface TransitionError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Options for querying transitions
 */
export interface TransitionQueryOptions {
  subjectId?: string;
  subjectType?: TransitionSubjectType;
  assetId?: string;
  tokenId?: string;
  actorId?: string;
  actorType?: TransitionActorType;
  fromState?: string;
  toState?: string;
  fromDate?: Date;
  toDate?: Date;
  limit?: number;
  offset?: number;
}

/**
 * Transition store interface
 */
export interface ITransitionStore {
  /** Append a new transition */
  append(record: Omit<StateTransitionRecord, 'id' | 'createdAt'>): Promise<StateTransitionRecord>;

  /** Get the last transition for a subject */
  getLastTransition(subjectId: string): Promise<StateTransitionRecord | null>;

  /** Get all transitions for a subject */
  getTransitions(subjectId: string, options?: { limit?: number; offset?: number }): Promise<StateTransitionRecord[]>;

  /** Query transitions with filters */
  query(options: TransitionQueryOptions): Promise<StateTransitionRecord[]>;

  /** Verify hash chain integrity */
  verifyChain(subjectId: string): Promise<ChainVerificationResult>;
}

/**
 * Chain verification result
 */
export interface ChainVerificationResult {
  valid: boolean;
  subjectId: string;
  totalTransitions: number;
  verifiedTransitions: number;
  firstInvalidTransitionId?: string;
  error?: string;
}

// ============================================================================
// Versioned Transition Manager
// ============================================================================

/**
 * Manager for versioned state transitions
 */
export class VersionedTransitionManager {
  private store: ITransitionStore;

  constructor(store: ITransitionStore) {
    this.store = store;
  }

  /**
   * Execute a versioned transition
   */
  async transition(
    orgId: string,
    request: VersionedTransitionRequest
  ): Promise<TransitionResult> {
    try {
      // Get previous transition for versioning
      const previousTransition = await this.store.getLastTransition(request.subjectId);
      const version = (previousTransition?.version || 0) + 1;

      // Verify state is valid (from state must match current state)
      if (previousTransition && previousTransition.newState !== request.fromState) {
        return {
          success: false,
          error: {
            code: 'INVALID_STATE_TRANSITION',
            message: `Cannot transition from '${request.fromState}' - current state is '${previousTransition.newState}'`,
            details: {
              currentState: previousTransition.newState,
              requestedFromState: request.fromState,
            },
          },
        };
      }

      // Build transition record
      const record: Omit<StateTransitionRecord, 'id' | 'createdAt'> = {
        orgId,
        subjectType: request.subjectType,
        subjectId: request.subjectId,
        assetId: request.assetId,
        tokenId: request.tokenId,
        previousState: request.fromState,
        newState: request.toState,
        version,
        previousTransitionId: previousTransition?.id,
        triggeredById: request.actorId,
        triggeredByType: request.actorType,
        triggeredByName: request.actorName,
        triggeredByIp: request.actorIp,
        reason: request.reason,
        justification: request.justification,
        decisionReceiptId: request.decisionReceiptId,
        complianceResult: request.complianceResult,
        transitionHash: '', // Will be computed
        previousTransitionHash: previousTransition?.transitionHash,
        requestId: request.requestId,
        traceId: request.traceId,
        executedAt: new Date(),
        metadata: request.metadata || {},
      };

      // Compute hash for tamper-evidence
      record.transitionHash = this.computeTransitionHash(record);

      // Store transition
      const storedRecord = await this.store.append(record);

      return {
        success: true,
        transition: storedRecord,
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'TRANSITION_ERROR',
          message: (error as Error).message,
        },
      };
    }
  }

  /**
   * Get full transition history for a subject
   */
  async getHistory(subjectId: string): Promise<StateTransitionRecord[]> {
    return this.store.getTransitions(subjectId);
  }

  /**
   * Get the last transition for a subject
   */
  async getLastTransition(subjectId: string): Promise<StateTransitionRecord | null> {
    return this.store.getLastTransition(subjectId);
  }

  /**
   * Query transitions with filters
   */
  async query(options: TransitionQueryOptions): Promise<StateTransitionRecord[]> {
    return this.store.query(options);
  }

  /**
   * Find who approved a specific state for a subject
   */
  async findApprover(
    subjectId: string,
    state: string
  ): Promise<{
    actorId: string;
    actorType: TransitionActorType;
    actorName?: string;
    executedAt: Date;
    reason: string;
  } | null> {
    const transitions = await this.store.getTransitions(subjectId);

    // Find the transition that resulted in the specified state
    const transition = transitions.find(t => t.newState === state);

    if (!transition) {
      return null;
    }

    return {
      actorId: transition.triggeredById,
      actorType: transition.triggeredByType,
      actorName: transition.triggeredByName,
      executedAt: transition.executedAt,
      reason: transition.reason,
    };
  }

  /**
   * Verify the hash chain integrity for a subject
   */
  async verifyChain(subjectId: string): Promise<ChainVerificationResult> {
    return this.store.verifyChain(subjectId);
  }

  /**
   * Compute hash for a transition record
   */
  private computeTransitionHash(record: Omit<StateTransitionRecord, 'id' | 'createdAt'>): string {
    const hashInput = JSON.stringify({
      orgId: record.orgId,
      subjectType: record.subjectType,
      subjectId: record.subjectId,
      previousState: record.previousState,
      newState: record.newState,
      version: record.version,
      triggeredById: record.triggeredById,
      triggeredByType: record.triggeredByType,
      reason: record.reason,
      executedAt: record.executedAt.toISOString(),
      previousTransitionHash: record.previousTransitionHash || '',
    });

    return createHash('sha256').update(hashInput).digest('hex');
  }
}

// ============================================================================
// In-Memory Transition Store (for testing/development)
// ============================================================================

/**
 * In-memory implementation of transition store
 */
export class InMemoryTransitionStore implements ITransitionStore {
  private transitions: StateTransitionRecord[] = [];
  private idCounter = 0;

  async append(
    record: Omit<StateTransitionRecord, 'id' | 'createdAt'>
  ): Promise<StateTransitionRecord> {
    const fullRecord: StateTransitionRecord = {
      ...record,
      id: `txn_${++this.idCounter}`,
      createdAt: new Date(),
    };

    this.transitions.push(fullRecord);
    return fullRecord;
  }

  async getLastTransition(subjectId: string): Promise<StateTransitionRecord | null> {
    const subjectTransitions = this.transitions
      .filter(t => t.subjectId === subjectId)
      .sort((a, b) => b.version - a.version);

    return subjectTransitions[0] || null;
  }

  async getTransitions(
    subjectId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<StateTransitionRecord[]> {
    const subjectTransitions = this.transitions
      .filter(t => t.subjectId === subjectId)
      .sort((a, b) => a.version - b.version);

    const offset = options?.offset || 0;
    const limit = options?.limit || 100;

    return subjectTransitions.slice(offset, offset + limit);
  }

  async query(options: TransitionQueryOptions): Promise<StateTransitionRecord[]> {
    let filtered = this.transitions;

    if (options.subjectId) {
      filtered = filtered.filter(t => t.subjectId === options.subjectId);
    }
    if (options.subjectType) {
      filtered = filtered.filter(t => t.subjectType === options.subjectType);
    }
    if (options.assetId) {
      filtered = filtered.filter(t => t.assetId === options.assetId);
    }
    if (options.tokenId) {
      filtered = filtered.filter(t => t.tokenId === options.tokenId);
    }
    if (options.actorId) {
      filtered = filtered.filter(t => t.triggeredById === options.actorId);
    }
    if (options.actorType) {
      filtered = filtered.filter(t => t.triggeredByType === options.actorType);
    }
    if (options.fromState) {
      filtered = filtered.filter(t => t.previousState === options.fromState);
    }
    if (options.toState) {
      filtered = filtered.filter(t => t.newState === options.toState);
    }
    if (options.fromDate) {
      filtered = filtered.filter(t => t.executedAt >= options.fromDate!);
    }
    if (options.toDate) {
      filtered = filtered.filter(t => t.executedAt <= options.toDate!);
    }

    const offset = options.offset || 0;
    const limit = options.limit || 100;

    return filtered
      .sort((a, b) => b.executedAt.getTime() - a.executedAt.getTime())
      .slice(offset, offset + limit);
  }

  async verifyChain(subjectId: string): Promise<ChainVerificationResult> {
    const transitions = await this.getTransitions(subjectId);

    if (transitions.length === 0) {
      return {
        valid: true,
        subjectId,
        totalTransitions: 0,
        verifiedTransitions: 0,
      };
    }

    let previousHash: string | undefined;
    let verifiedCount = 0;

    for (const transition of transitions) {
      // Verify hash chain link
      if (transition.version > 1 && transition.previousTransitionHash !== previousHash) {
        return {
          valid: false,
          subjectId,
          totalTransitions: transitions.length,
          verifiedTransitions: verifiedCount,
          firstInvalidTransitionId: transition.id,
          error: `Hash chain broken at transition ${transition.id}`,
        };
      }

      previousHash = transition.transitionHash;
      verifiedCount++;
    }

    return {
      valid: true,
      subjectId,
      totalTransitions: transitions.length,
      verifiedTransitions: verifiedCount,
    };
  }
}
