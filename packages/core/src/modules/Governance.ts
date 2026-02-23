/**
 * Governance Module
 *
 * Handles voting, proposals, and DAO governance for tokenized assets.
 * Supports multiple voting strategies and execution mechanisms.
 */

import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { BaseEvent, EventType } from '../core/types.js';
import { StateMachine, GOVERNANCE_LIFECYCLE } from '../core/StateMachine.js';
import { ValidationError, SDKError, ErrorCode } from '../errors/index.js';

// ============================================================================
// TYPES AND SCHEMAS
// ============================================================================

/**
 * Proposal type
 */
export enum ProposalType {
  /** General governance proposal */
  GENERAL = 'GENERAL',

  /** Parameter change */
  PARAMETER_CHANGE = 'PARAMETER_CHANGE',

  /** Treasury spending */
  TREASURY = 'TREASURY',

  /** Upgrade proposal */
  UPGRADE = 'UPGRADE',

  /** Emergency action */
  EMERGENCY = 'EMERGENCY',

  /** Add/remove member */
  MEMBERSHIP = 'MEMBERSHIP',

  /** Custom action */
  CUSTOM = 'CUSTOM',
}

/**
 * Vote type
 */
export enum VoteType {
  FOR = 'FOR',
  AGAINST = 'AGAINST',
  ABSTAIN = 'ABSTAIN',
}

/**
 * Voting strategy
 */
export enum VotingStrategy {
  /** One token = one vote */
  TOKEN_WEIGHTED = 'TOKEN_WEIGHTED',

  /** One address = one vote */
  ONE_PERSON_ONE_VOTE = 'ONE_PERSON_ONE_VOTE',

  /** Quadratic voting (cost = votes^2) */
  QUADRATIC = 'QUADRATIC',

  /** Conviction voting (time-weighted) */
  CONVICTION = 'CONVICTION',

  /** Ranked choice */
  RANKED_CHOICE = 'RANKED_CHOICE',

  /** Approval voting (vote for multiple) */
  APPROVAL = 'APPROVAL',
}

/**
 * Quorum type
 */
export enum QuorumType {
  /** Percentage of total supply */
  PERCENTAGE = 'PERCENTAGE',

  /** Fixed number of votes */
  FIXED = 'FIXED',

  /** Percentage of participation */
  PARTICIPATION = 'PARTICIPATION',
}

/**
 * Governance configuration schema
 */
export const GovernanceConfigSchema = z.object({
  /** Asset ID this governance is for */
  assetId: z.string().uuid(),

  /** Voting strategy */
  votingStrategy: z.nativeEnum(VotingStrategy),

  /** Quorum type */
  quorumType: z.nativeEnum(QuorumType),

  /** Quorum value (percentage or fixed amount) */
  quorumValue: z.number().positive(),

  /** Voting period in seconds */
  votingPeriodSeconds: z.number().positive(),

  /** Execution delay in seconds (timelock) */
  executionDelaySeconds: z.number().nonnegative(),

  /** Minimum tokens required to create proposal */
  proposalThreshold: z.string(),

  /** Whether votes can be delegated */
  allowDelegation: z.boolean().default(true),

  /** Maximum active proposals per user */
  maxActiveProposalsPerUser: z.number().positive().default(5),

  /** Required approval percentage (for non-quorum votes) */
  approvalThreshold: z.number().min(0).max(100).default(50),

  /** Whether proposals require a second */
  requireSecond: z.boolean().default(false),

  /** Grace period after voting ends (seconds) */
  gracePeriodSeconds: z.number().nonnegative().default(0),

  /** Custom parameters */
  parameters: z.record(z.unknown()).optional(),
});

export type GovernanceConfig = z.infer<typeof GovernanceConfigSchema>;

/**
 * Proposal schema
 */
export const ProposalSchema = z.object({
  /** Unique proposal ID */
  id: z.string().uuid(),

  /** Governance asset ID */
  assetId: z.string().uuid(),

  /** Proposal type */
  type: z.nativeEnum(ProposalType),

  /** Title */
  title: z.string().min(1).max(256),

  /** Description (supports markdown) */
  description: z.string().max(10000),

  /** Proposer ID */
  proposerId: z.string(),

  /** Current state */
  state: z.string(),

  /** Actions to execute if passed */
  actions: z.array(z.object({
    target: z.string(),
    calldata: z.string(),
    value: z.string().default('0'),
    description: z.string().optional(),
  })),

  /** Vote tallies */
  votes: z.object({
    for: z.string(),
    against: z.string(),
    abstain: z.string(),
    total: z.string(),
  }),

  /** Individual votes */
  voteRecords: z.array(z.object({
    voterId: z.string(),
    voteType: z.nativeEnum(VoteType),
    weight: z.string(),
    reason: z.string().optional(),
    timestamp: z.string().datetime(),
  })),

  /** Snapshot block/timestamp for voting power */
  snapshotAt: z.string().datetime(),

  /** Voting start time */
  votingStartsAt: z.string().datetime(),

  /** Voting end time */
  votingEndsAt: z.string().datetime(),

  /** Execution time (after timelock) */
  executionTime: z.string().datetime().optional(),

  /** Whether seconded (if required) */
  seconded: z.boolean().default(false),

  /** Seconder ID */
  seconderId: z.string().optional(),

  /** IPFS hash for proposal document */
  ipfsHash: z.string().optional(),

  /** Created at */
  createdAt: z.string().datetime(),

  /** Updated at */
  updatedAt: z.string().datetime(),
});

export type Proposal = z.infer<typeof ProposalSchema>;

/**
 * Delegation schema
 */
export const DelegationSchema = z.object({
  /** Delegator ID */
  delegatorId: z.string(),

  /** Delegate ID */
  delegateId: z.string(),

  /** Asset ID */
  assetId: z.string().uuid(),

  /** Delegation weight (if partial) */
  weight: z.string().optional(),

  /** Whether delegation is active */
  isActive: z.boolean().default(true),

  /** Created at */
  createdAt: z.string().datetime(),

  /** Expires at */
  expiresAt: z.string().datetime().optional(),
});

export type Delegation = z.infer<typeof DelegationSchema>;

/**
 * Vote record
 */
export interface VoteRecord {
  voterId: string;
  voteType: VoteType;
  weight: string;
  reason?: string;
  timestamp: string;
}

// ============================================================================
// GOVERNANCE ENGINE
// ============================================================================

/**
 * Governance Engine for managing proposals and voting
 */
export class GovernanceEngine {
  private configs: Map<string, GovernanceConfig> = new Map();
  private proposals: Map<string, Proposal> = new Map();
  private delegations: Map<string, Delegation[]> = new Map();
  private stateMachine: StateMachine;
  private eventStore?: { append: (event: BaseEvent) => Promise<void> };
  private votingPowerProvider?: (
    assetId: string,
    voterId: string,
    snapshotAt: string
  ) => Promise<string>;

  constructor(
    eventStore?: { append: (event: BaseEvent) => Promise<void> },
    votingPowerProvider?: (assetId: string, voterId: string, snapshotAt: string) => Promise<string>
  ) {
    this.eventStore = eventStore;
    this.votingPowerProvider = votingPowerProvider;
    this.stateMachine = new StateMachine(GOVERNANCE_LIFECYCLE, eventStore);
  }

  /**
   * Set voting power provider
   */
  setVotingPowerProvider(
    provider: (assetId: string, voterId: string, snapshotAt: string) => Promise<string>
  ): void {
    this.votingPowerProvider = provider;
  }

  // ============================================
  // CONFIGURATION
  // ============================================

  /**
   * Configure governance for an asset
   */
  configure(config: GovernanceConfig): void {
    const validated = GovernanceConfigSchema.parse(config);
    this.configs.set(validated.assetId, validated);
  }

  /**
   * Get governance config for an asset
   */
  getConfig(assetId: string): GovernanceConfig | undefined {
    return this.configs.get(assetId);
  }

  /**
   * Update governance config
   */
  updateConfig(
    assetId: string,
    updates: Partial<Omit<GovernanceConfig, 'assetId'>>
  ): GovernanceConfig | null {
    const existing = this.configs.get(assetId);
    if (!existing) return null;

    const updated: GovernanceConfig = { ...existing, ...updates };
    const validated = GovernanceConfigSchema.parse(updated);
    this.configs.set(assetId, validated);

    return validated;
  }

  // ============================================
  // PROPOSALS
  // ============================================

  /**
   * Create a proposal
   */
  async createProposal(params: {
    assetId: string;
    type: ProposalType;
    title: string;
    description: string;
    proposerId: string;
    actions?: Proposal['actions'];
    ipfsHash?: string;
  }): Promise<Proposal> {
    const config = this.configs.get(params.assetId);
    if (!config) {
      throw new SDKError(
        `Governance not configured for asset: ${params.assetId}`,
        ErrorCode.NOT_FOUND,
        { details: { assetId: params.assetId } }
      );
    }

    // Check proposal threshold
    if (this.votingPowerProvider) {
      const power = await this.votingPowerProvider(
        params.assetId,
        params.proposerId,
        new Date().toISOString()
      );
      if (BigInt(power) < BigInt(config.proposalThreshold)) {
        throw new ValidationError('Insufficient voting power to create proposal', {
          field: 'proposerId',
          constraints: { minimumVotingPower: config.proposalThreshold },
        });
      }
    }

    // Check active proposal limit
    const activeProposals = this.getActiveProposals(params.assetId, params.proposerId);
    if (activeProposals.length >= config.maxActiveProposalsPerUser) {
      throw new ValidationError('Maximum active proposals reached', {
        field: 'proposerId',
        constraints: { maxActiveProposals: String(config.maxActiveProposalsPerUser) },
      });
    }

    const now = new Date();
    const snapshotAt = now.toISOString();
    const votingStartsAt = config.requireSecond
      ? now.toISOString() // Will update when seconded
      : now.toISOString();
    const votingEndsAt = new Date(
      now.getTime() + config.votingPeriodSeconds * 1000
    ).toISOString();

    const proposal: Proposal = {
      id: uuidv4(),
      assetId: params.assetId,
      type: params.type,
      title: params.title,
      description: params.description,
      proposerId: params.proposerId,
      state: config.requireSecond ? 'PENDING' : 'ACTIVE_VOTING',
      actions: params.actions || [],
      votes: {
        for: '0',
        against: '0',
        abstain: '0',
        total: '0',
      },
      voteRecords: [],
      snapshotAt,
      votingStartsAt,
      votingEndsAt,
      seconded: !config.requireSecond,
      ipfsHash: params.ipfsHash,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    const validated = ProposalSchema.parse(proposal);
    this.proposals.set(validated.id, validated);
    this.stateMachine.setState(validated.id, validated.state);

    // Emit event
    if (this.eventStore) {
      await this.eventStore.append({
        id: uuidv4(),
        type: EventType.ASSET_UPDATED,
        assetId: params.assetId,
        timestamp: now.toISOString(),
        actorId: params.proposerId,
        payload: {
          action: 'PROPOSAL_CREATED',
          proposalId: validated.id,
          type: params.type,
          title: params.title,
        },
        eventVersion: 1,
      });
    }

    return validated;
  }

  /**
   * Second a proposal
   */
  async secondProposal(proposalId: string, seconderId: string): Promise<Proposal | null> {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) return null;

    if (proposal.seconded) {
      throw new SDKError(
        'Proposal already seconded',
        ErrorCode.ALREADY_EXISTS,
        { details: { proposalId, seconderId: proposal.seconderId } }
      );
    }

    if (proposal.proposerId === seconderId) {
      throw new ValidationError('Proposer cannot second their own proposal', {
        field: 'seconderId',
        constraints: { mustNotEqual: 'proposerId' },
      });
    }

    const config = this.configs.get(proposal.assetId);
    if (!config) return null;

    const now = new Date();

    proposal.seconded = true;
    proposal.seconderId = seconderId;
    proposal.state = 'ACTIVE_VOTING';
    proposal.votingStartsAt = now.toISOString();
    proposal.votingEndsAt = new Date(
      now.getTime() + config.votingPeriodSeconds * 1000
    ).toISOString();
    proposal.updatedAt = now.toISOString();

    this.stateMachine.setState(proposalId, 'ACTIVE_VOTING');

    return proposal;
  }

  /**
   * Cast a vote
   */
  async castVote(
    proposalId: string,
    voterId: string,
    voteType: VoteType,
    reason?: string
  ): Promise<VoteRecord> {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) {
      throw new SDKError(
        `Proposal not found: ${proposalId}`,
        ErrorCode.NOT_FOUND,
        { details: { proposalId } }
      );
    }

    if (proposal.state !== 'ACTIVE_VOTING') {
      throw new SDKError(
        'Voting is not active for this proposal',
        ErrorCode.INVALID_STATE,
        { details: { proposalId, currentState: proposal.state } }
      );
    }

    const now = new Date();
    if (now.toISOString() > proposal.votingEndsAt) {
      throw new SDKError(
        'Voting period has ended',
        ErrorCode.INVALID_STATE,
        { details: { proposalId, votingEndsAt: proposal.votingEndsAt } }
      );
    }

    // Check if already voted
    if (proposal.voteRecords.some(v => v.voterId === voterId)) {
      throw new SDKError(
        'Already voted on this proposal',
        ErrorCode.ALREADY_EXISTS,
        { details: { proposalId, voterId } }
      );
    }

    // Get voting power
    let weight = '1';
    if (this.votingPowerProvider) {
      weight = await this.votingPowerProvider(
        proposal.assetId,
        voterId,
        proposal.snapshotAt
      );

      // Add delegated power
      const delegatedPower = await this.getDelegatedPower(proposal.assetId, voterId, proposal.snapshotAt);
      weight = (BigInt(weight) + BigInt(delegatedPower)).toString();
    }

    const config = this.configs.get(proposal.assetId);
    if (config) {
      // Apply voting strategy
      weight = this.applyVotingStrategy(weight, config.votingStrategy);
    }

    const voteRecord: VoteRecord = {
      voterId,
      voteType,
      weight,
      reason,
      timestamp: now.toISOString(),
    };

    proposal.voteRecords.push(voteRecord);

    // Update tallies
    const weightBigInt = BigInt(weight);
    switch (voteType) {
      case VoteType.FOR:
        proposal.votes.for = (BigInt(proposal.votes.for) + weightBigInt).toString();
        break;
      case VoteType.AGAINST:
        proposal.votes.against = (BigInt(proposal.votes.against) + weightBigInt).toString();
        break;
      case VoteType.ABSTAIN:
        proposal.votes.abstain = (BigInt(proposal.votes.abstain) + weightBigInt).toString();
        break;
    }
    proposal.votes.total = (BigInt(proposal.votes.total) + weightBigInt).toString();
    proposal.updatedAt = now.toISOString();

    // Emit event
    if (this.eventStore) {
      await this.eventStore.append({
        id: uuidv4(),
        type: EventType.ASSET_UPDATED,
        assetId: proposal.assetId,
        timestamp: now.toISOString(),
        actorId: voterId,
        payload: {
          action: 'VOTE_CAST',
          proposalId,
          voteType,
          weight,
        },
        eventVersion: 1,
      });
    }

    return voteRecord;
  }

  /**
   * Finalize voting and determine outcome
   */
  async finalizeProposal(proposalId: string): Promise<Proposal> {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) {
      throw new SDKError(
        `Proposal not found: ${proposalId}`,
        ErrorCode.NOT_FOUND,
        { details: { proposalId } }
      );
    }

    if (proposal.state !== 'ACTIVE_VOTING') {
      throw new SDKError(
        'Proposal is not in voting state',
        ErrorCode.INVALID_STATE,
        { details: { proposalId, currentState: proposal.state } }
      );
    }

    const now = new Date();
    if (now.toISOString() < proposal.votingEndsAt) {
      throw new SDKError(
        'Voting period has not ended',
        ErrorCode.INVALID_STATE,
        { details: { proposalId, votingEndsAt: proposal.votingEndsAt } }
      );
    }

    const config = this.configs.get(proposal.assetId);
    if (!config) {
      throw new SDKError(
        'Governance config not found',
        ErrorCode.NOT_FOUND,
        { details: { assetId: proposal.assetId } }
      );
    }

    // Check quorum
    const quorumMet = this.checkQuorum(proposal, config);

    // Check approval threshold
    const totalVotingPower = BigInt(proposal.votes.for) + BigInt(proposal.votes.against);
    const forPercentage = totalVotingPower > 0n
      ? (BigInt(proposal.votes.for) * 100n) / totalVotingPower
      : 0n;
    const approved = Number(forPercentage) >= config.approvalThreshold;

    if (quorumMet && approved) {
      proposal.state = 'PASSED';
      if (config.executionDelaySeconds > 0) {
        proposal.executionTime = new Date(
          now.getTime() + config.executionDelaySeconds * 1000
        ).toISOString();
      }
    } else {
      proposal.state = 'REJECTED';
    }

    proposal.updatedAt = now.toISOString();
    this.stateMachine.setState(proposalId, proposal.state);

    return proposal;
  }

  /**
   * Queue proposal for execution
   */
  async queueProposal(proposalId: string): Promise<Proposal> {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) {
      throw new SDKError(
        `Proposal not found: ${proposalId}`,
        ErrorCode.NOT_FOUND,
        { details: { proposalId } }
      );
    }

    if (proposal.state !== 'PASSED') {
      throw new SDKError(
        'Proposal must be passed to queue',
        ErrorCode.INVALID_STATE,
        { details: { proposalId, currentState: proposal.state, requiredState: 'PASSED' } }
      );
    }

    const config = this.configs.get(proposal.assetId);
    if (!config) {
      throw new SDKError(
        'Governance config not found',
        ErrorCode.NOT_FOUND,
        { details: { assetId: proposal.assetId } }
      );
    }

    proposal.state = 'QUEUED';
    proposal.executionTime = new Date(
      Date.now() + config.executionDelaySeconds * 1000
    ).toISOString();
    proposal.updatedAt = new Date().toISOString();

    this.stateMachine.setState(proposalId, 'QUEUED');

    return proposal;
  }

  /**
   * Execute a proposal
   */
  async executeProposal(proposalId: string, executor: string): Promise<Proposal> {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) {
      throw new SDKError(
        `Proposal not found: ${proposalId}`,
        ErrorCode.NOT_FOUND,
        { details: { proposalId } }
      );
    }

    if (proposal.state !== 'QUEUED' && proposal.state !== 'PASSED') {
      throw new SDKError(
        'Proposal is not ready for execution',
        ErrorCode.INVALID_STATE,
        { details: { proposalId, currentState: proposal.state, requiredStates: ['QUEUED', 'PASSED'] } }
      );
    }

    const now = new Date();
    if (proposal.executionTime && now.toISOString() < proposal.executionTime) {
      throw new SDKError(
        'Timelock not expired',
        ErrorCode.INVALID_STATE,
        { details: { proposalId, executionTime: proposal.executionTime } }
      );
    }

    // Execute actions (placeholder - actual execution depends on chain)
    // In a real implementation, this would call smart contracts

    proposal.state = 'EXECUTED';
    proposal.updatedAt = now.toISOString();
    this.stateMachine.setState(proposalId, 'EXECUTED');

    // Emit event
    if (this.eventStore) {
      await this.eventStore.append({
        id: uuidv4(),
        type: EventType.ASSET_UPDATED,
        assetId: proposal.assetId,
        timestamp: now.toISOString(),
        actorId: executor,
        payload: {
          action: 'PROPOSAL_EXECUTED',
          proposalId,
          actionsExecuted: proposal.actions.length,
        },
        eventVersion: 1,
      });
    }

    return proposal;
  }

  /**
   * Cancel a proposal
   */
  async cancelProposal(proposalId: string, cancellerId: string, reason?: string): Promise<Proposal> {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) {
      throw new SDKError(
        `Proposal not found: ${proposalId}`,
        ErrorCode.NOT_FOUND,
        { details: { proposalId } }
      );
    }

    // Only proposer can cancel, or if voting hasn't started
    if (proposal.proposerId !== cancellerId && proposal.state !== 'PENDING') {
      throw new SDKError(
        'Only proposer can cancel',
        ErrorCode.UNAUTHORIZED,
        { details: { proposalId, cancellerId, proposerId: proposal.proposerId } }
      );
    }

    proposal.state = 'CANCELLED';
    proposal.updatedAt = new Date().toISOString();
    this.stateMachine.setState(proposalId, 'CANCELLED');

    return proposal;
  }

  // ============================================
  // DELEGATION
  // ============================================

  /**
   * Delegate voting power
   */
  async delegate(
    assetId: string,
    delegatorId: string,
    delegateId: string,
    expiresAt?: string
  ): Promise<Delegation> {
    const config = this.configs.get(assetId);
    if (!config || !config.allowDelegation) {
      throw new ValidationError('Delegation not allowed for this asset', {
        field: 'assetId',
        constraints: { allowDelegation: 'true' },
      });
    }

    if (delegatorId === delegateId) {
      throw new ValidationError('Cannot delegate to self', {
        field: 'delegateId',
        constraints: { mustNotEqual: 'delegatorId' },
      });
    }

    const delegation: Delegation = {
      delegatorId,
      delegateId,
      assetId,
      isActive: true,
      createdAt: new Date().toISOString(),
      expiresAt,
    };

    const validated = DelegationSchema.parse(delegation);

    const key = `${assetId}:${delegatorId}`;
    const existing = this.delegations.get(key) || [];
    // Remove any existing delegation to this delegate
    const filtered = existing.filter(d => d.delegateId !== delegateId);
    filtered.push(validated);
    this.delegations.set(key, filtered);

    return validated;
  }

  /**
   * Revoke delegation
   */
  async undelegate(assetId: string, delegatorId: string, delegateId?: string): Promise<boolean> {
    const key = `${assetId}:${delegatorId}`;
    const existing = this.delegations.get(key);
    if (!existing) return false;

    if (delegateId) {
      const filtered = existing.filter(d => d.delegateId !== delegateId);
      this.delegations.set(key, filtered);
    } else {
      this.delegations.delete(key);
    }

    return true;
  }

  /**
   * Get delegated power for a delegate
   */
  private async getDelegatedPower(
    assetId: string,
    delegateId: string,
    snapshotAt: string
  ): Promise<string> {
    if (!this.votingPowerProvider) return '0';

    let totalDelegated = 0n;

    for (const [key, delegations] of this.delegations.entries()) {
      if (!key.startsWith(assetId)) continue;

      for (const delegation of delegations) {
        if (!delegation.isActive) continue;
        if (delegation.delegateId !== delegateId) continue;
        if (delegation.expiresAt && delegation.expiresAt < snapshotAt) continue;

        const power = await this.votingPowerProvider(
          assetId,
          delegation.delegatorId,
          snapshotAt
        );
        totalDelegated += BigInt(power);
      }
    }

    return totalDelegated.toString();
  }

  // ============================================
  // UTILITIES
  // ============================================

  /**
   * Apply voting strategy to weight
   */
  private applyVotingStrategy(weight: string, strategy: VotingStrategy): string {
    const weightBigInt = BigInt(weight);

    switch (strategy) {
      case VotingStrategy.TOKEN_WEIGHTED:
        return weight;

      case VotingStrategy.ONE_PERSON_ONE_VOTE:
        return weightBigInt > 0n ? '1' : '0';

      case VotingStrategy.QUADRATIC:
        // sqrt approximation for bigint
        const sqrt = this.bigIntSqrt(weightBigInt);
        return sqrt.toString();

      default:
        return weight;
    }
  }

  /**
   * BigInt square root approximation
   */
  private bigIntSqrt(n: bigint): bigint {
    if (n < 0n) {
      throw new ValidationError('Square root of negative number', {
        field: 'n',
        constraints: { minimum: '0' },
      });
    }
    if (n < 2n) return n;

    let x = n;
    let y = (x + 1n) / 2n;

    while (y < x) {
      x = y;
      y = (x + n / x) / 2n;
    }

    return x;
  }

  /**
   * Check if quorum is met
   */
  private checkQuorum(proposal: Proposal, config: GovernanceConfig): boolean {
    const totalVotes = BigInt(proposal.votes.total);

    switch (config.quorumType) {
      case QuorumType.FIXED:
        return totalVotes >= BigInt(config.quorumValue);

      case QuorumType.PERCENTAGE:
        // Would need total supply - simplified for now
        return totalVotes > 0n;

      case QuorumType.PARTICIPATION:
        return proposal.voteRecords.length >= config.quorumValue;

      default:
        return true;
    }
  }

  /**
   * Get proposal by ID
   */
  getProposal(proposalId: string): Proposal | undefined {
    return this.proposals.get(proposalId);
  }

  /**
   * Get proposals for an asset
   */
  getProposals(assetId: string): Proposal[] {
    return Array.from(this.proposals.values()).filter(p => p.assetId === assetId);
  }

  /**
   * Get active proposals for a user
   */
  getActiveProposals(assetId: string, proposerId: string): Proposal[] {
    return this.getProposals(assetId).filter(
      p => p.proposerId === proposerId && !['EXECUTED', 'CANCELLED', 'REJECTED', 'EXPIRED'].includes(p.state)
    );
  }

  /**
   * Get voting power for a user
   */
  async getVotingPower(assetId: string, voterId: string): Promise<string> {
    const snapshotAt = new Date().toISOString();

    let power = '0';
    if (this.votingPowerProvider) {
      power = await this.votingPowerProvider(assetId, voterId, snapshotAt);
    }

    const delegatedPower = await this.getDelegatedPower(assetId, voterId, snapshotAt);

    return (BigInt(power) + BigInt(delegatedPower)).toString();
  }
}
