/**
 * Governance Module (Thin API Client)
 *
 * A Stripe-like thin REST wrapper for governance operations.
 * This module delegates all business logic to the backend server
 * and does not maintain local state.
 *
 * For offline/local governance operations, see offline/GovernanceEngine.ts
 */

import type { HttpClient } from '../utils/http.js';
import type { PaginatedResponse } from '../types.js';
import {
  validate,
  UUIDSchema,
  PaginationSchema,
} from './validation.js';
import {
  CreateProposalInputSchema,
  UpdateProposalInputSchema,
  CastVoteInputSchema,
  DelegateInputSchema,
  ListProposalsParamsSchema,
  ListVotesParamsSchema,
  ConfigureGovernanceInputSchema,
  type CreateProposalInput,
  type UpdateProposalInput,
  type CastVoteInput,
  type DelegateInput,
  type ListProposalsParams,
  type ListVotesParams,
  type ConfigureGovernanceInput,
} from './validation-governance.js';

// ============================================================================
// Types
// ============================================================================

export type ProposalType =
  | 'GENERAL'
  | 'PARAMETER_CHANGE'
  | 'TREASURY'
  | 'UPGRADE'
  | 'EMERGENCY'
  | 'MEMBERSHIP'
  | 'CUSTOM';

export type ProposalState =
  | 'PENDING'
  | 'ACTIVE_VOTING'
  | 'PASSED'
  | 'REJECTED'
  | 'QUEUED'
  | 'EXECUTED'
  | 'CANCELLED'
  | 'EXPIRED';

export type VoteType = 'FOR' | 'AGAINST' | 'ABSTAIN';

export type VotingStrategy =
  | 'TOKEN_WEIGHTED'
  | 'ONE_PERSON_ONE_VOTE'
  | 'QUADRATIC'
  | 'CONVICTION'
  | 'RANKED_CHOICE'
  | 'APPROVAL';

export type QuorumType = 'PERCENTAGE' | 'FIXED' | 'PARTICIPATION';

export interface ProposalAction {
  target: string;
  calldata: string;
  value: string;
  description?: string;
}

export interface VoteRecord {
  id: string;
  proposalId: string;
  voterId: string;
  voterAddress?: string;
  voteType: VoteType;
  weight: string;
  reason?: string;
  createdAt: string;
}

export interface VoteTally {
  for: string;
  against: string;
  abstain: string;
  total: string;
}

export interface Proposal {
  id: string;
  assetId: string;
  type: ProposalType;
  title: string;
  description: string;
  proposerId: string;
  state: ProposalState;
  actions: ProposalAction[];
  votes: VoteTally;
  snapshotAt: string;
  votingStartsAt: string;
  votingEndsAt: string;
  executionTime?: string;
  seconded: boolean;
  seconderId?: string;
  ipfsHash?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Delegation {
  id: string;
  assetId: string;
  delegatorId: string;
  delegateId: string;
  weight?: string;
  isActive: boolean;
  createdAt: string;
  expiresAt?: string;
}

export interface GovernanceConfig {
  id: string;
  assetId: string;
  votingStrategy: VotingStrategy;
  quorumType: QuorumType;
  quorumValue: number;
  votingPeriodSeconds: number;
  executionDelaySeconds: number;
  proposalThreshold: string;
  allowDelegation: boolean;
  maxActiveProposalsPerUser: number;
  approvalThreshold: number;
  requireSecond: boolean;
  gracePeriodSeconds: number;
  createdAt: string;
  updatedAt: string;
}

export interface VotingPower {
  assetId: string;
  voterId: string;
  ownPower: string;
  delegatedPower: string;
  totalPower: string;
  snapshotAt: string;
}

export interface ExecutionResult {
  proposalId: string;
  executedAt: string;
  txHash?: string;
  actionsExecuted: number;
  success: boolean;
  error?: string;
}

// ============================================================================
// Governance Module
// ============================================================================

export class GovernanceModule {
  constructor(private http: HttpClient) {}

  // ============================================
  // Configuration
  // ============================================

  /**
   * Configure governance for an asset.
   */
  async configure(assetId: string, input: ConfigureGovernanceInput): Promise<GovernanceConfig> {
    const validatedAssetId = validate(UUIDSchema, assetId);
    const validated = validate(ConfigureGovernanceInputSchema, input);
    const response = await this.http.post<GovernanceConfig>(
      `/api/v1/governance/${validatedAssetId}/configure`,
      validated
    );
    return response.data;
  }

  /**
   * Get governance configuration for an asset.
   */
  async getConfig(assetId: string): Promise<GovernanceConfig> {
    const validatedAssetId = validate(UUIDSchema, assetId);
    const response = await this.http.get<GovernanceConfig>(
      `/api/v1/governance/${validatedAssetId}/config`
    );
    return response.data;
  }

  /**
   * Update governance configuration.
   */
  async updateConfig(
    assetId: string,
    input: Partial<ConfigureGovernanceInput>
  ): Promise<GovernanceConfig> {
    const validatedAssetId = validate(UUIDSchema, assetId);
    const response = await this.http.patch<GovernanceConfig>(
      `/api/v1/governance/${validatedAssetId}/config`,
      input
    );
    return response.data;
  }

  // ============================================
  // Proposals
  // ============================================

  /**
   * Create a new proposal.
   */
  async createProposal(input: CreateProposalInput): Promise<Proposal> {
    const validated = validate(CreateProposalInputSchema, input);
    const response = await this.http.post<Proposal>(
      '/api/v1/governance/proposals',
      validated
    );
    return response.data;
  }

  /**
   * Get a proposal by ID.
   */
  async getProposal(proposalId: string): Promise<Proposal> {
    const validatedId = validate(UUIDSchema, proposalId);
    const response = await this.http.get<Proposal>(
      `/api/v1/governance/proposals/${validatedId}`
    );
    return response.data;
  }

  /**
   * Update a proposal (only while in PENDING state).
   */
  async updateProposal(proposalId: string, input: UpdateProposalInput): Promise<Proposal> {
    const validatedId = validate(UUIDSchema, proposalId);
    const validated = validate(UpdateProposalInputSchema, input);
    const response = await this.http.patch<Proposal>(
      `/api/v1/governance/proposals/${validatedId}`,
      validated
    );
    return response.data;
  }

  /**
   * List proposals with optional filters.
   */
  async listProposals(params?: ListProposalsParams): Promise<PaginatedResponse<Proposal>> {
    const validated = params ? validate(ListProposalsParamsSchema, params) : undefined;
    return this.http.list<Proposal>(
      '/api/v1/governance/proposals',
      validated as Record<string, string | number | boolean | undefined>
    );
  }

  /**
   * Second a proposal (if seconding is required).
   */
  async secondProposal(proposalId: string): Promise<Proposal> {
    const validatedId = validate(UUIDSchema, proposalId);
    const response = await this.http.post<Proposal>(
      `/api/v1/governance/proposals/${validatedId}/second`
    );
    return response.data;
  }

  /**
   * Cancel a proposal.
   */
  async cancelProposal(proposalId: string, reason?: string): Promise<Proposal> {
    const validatedId = validate(UUIDSchema, proposalId);
    const response = await this.http.post<Proposal>(
      `/api/v1/governance/proposals/${validatedId}/cancel`,
      { reason }
    );
    return response.data;
  }

  /**
   * Finalize voting and determine outcome.
   */
  async finalizeProposal(proposalId: string): Promise<Proposal> {
    const validatedId = validate(UUIDSchema, proposalId);
    const response = await this.http.post<Proposal>(
      `/api/v1/governance/proposals/${validatedId}/finalize`
    );
    return response.data;
  }

  /**
   * Queue a passed proposal for execution (timelock).
   */
  async queueProposal(proposalId: string): Promise<Proposal> {
    const validatedId = validate(UUIDSchema, proposalId);
    const response = await this.http.post<Proposal>(
      `/api/v1/governance/proposals/${validatedId}/queue`
    );
    return response.data;
  }

  /**
   * Execute a queued/passed proposal.
   */
  async executeProposal(proposalId: string): Promise<ExecutionResult> {
    const validatedId = validate(UUIDSchema, proposalId);
    const response = await this.http.post<ExecutionResult>(
      `/api/v1/governance/proposals/${validatedId}/execute`
    );
    return response.data;
  }

  // ============================================
  // Voting
  // ============================================

  /**
   * Cast a vote on a proposal.
   */
  async castVote(proposalId: string, input: CastVoteInput): Promise<VoteRecord> {
    const validatedId = validate(UUIDSchema, proposalId);
    const validated = validate(CastVoteInputSchema, input);
    const response = await this.http.post<VoteRecord>(
      `/api/v1/governance/proposals/${validatedId}/votes`,
      validated
    );
    return response.data;
  }

  /**
   * Get a vote record.
   */
  async getVote(proposalId: string, voterId: string): Promise<VoteRecord> {
    const validatedProposalId = validate(UUIDSchema, proposalId);
    const response = await this.http.get<VoteRecord>(
      `/api/v1/governance/proposals/${validatedProposalId}/votes/${voterId}`
    );
    return response.data;
  }

  /**
   * List votes for a proposal.
   */
  async listVotes(
    proposalId: string,
    params?: ListVotesParams
  ): Promise<PaginatedResponse<VoteRecord>> {
    const validatedId = validate(UUIDSchema, proposalId);
    const validated = params ? validate(ListVotesParamsSchema, params) : undefined;
    return this.http.list<VoteRecord>(
      `/api/v1/governance/proposals/${validatedId}/votes`,
      validated as Record<string, string | number | boolean | undefined>
    );
  }

  /**
   * Get voting power for a user on an asset.
   */
  async getVotingPower(assetId: string, voterId: string): Promise<VotingPower> {
    const validatedAssetId = validate(UUIDSchema, assetId);
    const response = await this.http.get<VotingPower>(
      `/api/v1/governance/${validatedAssetId}/voting-power/${voterId}`
    );
    return response.data;
  }

  // ============================================
  // Delegation
  // ============================================

  /**
   * Delegate voting power.
   */
  async delegate(input: DelegateInput): Promise<Delegation> {
    const validated = validate(DelegateInputSchema, input);
    const response = await this.http.post<Delegation>(
      '/api/v1/governance/delegations',
      validated
    );
    return response.data;
  }

  /**
   * Revoke a delegation.
   */
  async undelegate(assetId: string, delegateId?: string): Promise<{ success: boolean }> {
    const validatedAssetId = validate(UUIDSchema, assetId);
    const query = delegateId ? { delegateId } : undefined;
    const response = await this.http.delete<{ success: boolean }>(
      `/api/v1/governance/${validatedAssetId}/delegations${query ? `?delegateId=${delegateId}` : ''}`
    );
    return response.data;
  }

  /**
   * Get delegations for a delegator.
   */
  async getDelegations(assetId: string, delegatorId: string): Promise<Delegation[]> {
    const validatedAssetId = validate(UUIDSchema, assetId);
    const response = await this.http.get<{ data: Delegation[] }>(
      `/api/v1/governance/${validatedAssetId}/delegations/${delegatorId}`
    );
    return response.data.data;
  }

  /**
   * Get delegates for an asset (users with delegated power).
   */
  async getDelegates(assetId: string): Promise<PaginatedResponse<Delegation>> {
    const validatedAssetId = validate(UUIDSchema, assetId);
    return this.http.list<Delegation>(
      `/api/v1/governance/${validatedAssetId}/delegates`
    );
  }
}
