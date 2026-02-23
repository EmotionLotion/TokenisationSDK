/**
 * Escrow Module (Thin API Client)
 *
 * A Stripe-like thin REST wrapper for escrow operations.
 * This module delegates all business logic to the backend server
 * and does not maintain local state.
 *
 * For offline/local escrow operations, see offline/EscrowEngine.ts
 */

import type { HttpClient } from '../utils/http.js';
import type { PaginatedResponse } from '../types.js';
import {
  validate,
  UUIDSchema,
} from './validation.js';
import {
  CreateEscrowInputSchema,
  FundEscrowInputSchema,
  ReleaseEscrowInputSchema,
  RaiseDisputeInputSchema,
  ResolveDisputeInputSchema,
  CreateMilestoneInputSchema,
  SubmitMilestoneEvidenceInputSchema,
  ApproveMilestoneInputSchema,
  ListEscrowsParamsSchema,
  type CreateEscrowInput,
  type FundEscrowInput,
  type ReleaseEscrowInput,
  type RaiseDisputeInput,
  type ResolveDisputeInput,
  type CreateMilestoneInput,
  type SubmitMilestoneEvidenceInput,
  type ApproveMilestoneInput,
  type ListEscrowsParams,
} from './validation-governance.js';

// ============================================================================
// Types
// ============================================================================

export type EscrowType =
  | 'SIMPLE'
  | 'TIME_LOCKED'
  | 'MILESTONE'
  | 'MULTI_SIG'
  | 'ATOMIC_SWAP'
  | 'CONDITIONAL'
  | 'DISPUTE';

export type EscrowStatus =
  | 'DRAFT'
  | 'FUNDED'
  | 'ACTIVE'
  | 'PENDING_RELEASE'
  | 'PARTIALLY_RELEASED'
  | 'RELEASED'
  | 'REFUNDED'
  | 'DISPUTED'
  | 'EXPIRED'
  | 'CANCELLED';

export type EscrowPartyRole =
  | 'DEPOSITOR'
  | 'BENEFICIARY'
  | 'ARBITER'
  | 'ORACLE'
  | 'APPROVER';

export type ReleaseConditionType =
  | 'TIME'
  | 'SIGNATURE'
  | 'ORACLE'
  | 'MILESTONE'
  | 'MULTI_SIG'
  | 'EXTERNAL'
  | 'CUSTOM';

export type MilestoneStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'REJECTED';

export interface EscrowParty {
  partyId: string;
  address?: string;
  role: EscrowPartyRole;
  depositedAmount?: string;
  receiveAmount?: string;
  hasSigned: boolean;
  signedAt?: string;
}

export interface ReleaseCondition {
  id: string;
  type: ReleaseConditionType;
  description: string;
  isMet: boolean;
  metAt?: string;
  parameters: Record<string, unknown>;
  releasePercentage: number;
  order: number;
  required: boolean;
}

export interface TxRecord {
  action: string;
  hash: string;
  timestamp: string;
}

export interface Escrow {
  id: string;
  type: EscrowType;
  status: EscrowStatus;
  title: string;
  description?: string;
  assetId: string;
  amount: string;
  currency: string;
  parties: EscrowParty[];
  conditions: ReleaseCondition[];
  requiredConditions?: number;
  releasedAmount: string;
  refundedAmount: string;
  expiresAt?: string;
  disputeDeadline?: string;
  feePercentage: number;
  feeRecipient?: string;
  txHashes: TxRecord[];
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface MilestoneEvidence {
  type: string;
  uri: string;
  submittedAt: string;
  submittedBy: string;
}

export interface MilestoneApproval {
  approverId: string;
  approved: boolean;
  timestamp: string;
  comments?: string;
}

export interface Milestone {
  id: string;
  escrowId: string;
  title: string;
  description?: string;
  amount: string;
  percentage: number;
  order: number;
  status: MilestoneStatus;
  evidence: MilestoneEvidence[];
  approvals: MilestoneApproval[];
  dueDate?: string;
  completedAt?: string;
}

export interface DisputeResolution {
  decision: 'RELEASE' | 'REFUND' | 'SPLIT';
  splitPercentage?: number;
  resolvedBy: string;
  timestamp: string;
}

// ============================================================================
// Escrow Module
// ============================================================================

export class EscrowModule {
  constructor(private http: HttpClient) {}

  // ============================================
  // Escrow Management
  // ============================================

  /**
   * Create a new escrow.
   */
  async create(input: CreateEscrowInput): Promise<Escrow> {
    const validated = validate(CreateEscrowInputSchema, input);
    const response = await this.http.post<Escrow>('/api/v1/escrow', validated);
    return response.data;
  }

  /**
   * Get an escrow by ID.
   */
  async get(escrowId: string): Promise<Escrow> {
    const validatedId = validate(UUIDSchema, escrowId);
    const response = await this.http.get<Escrow>(`/api/v1/escrow/${validatedId}`);
    return response.data;
  }

  /**
   * List escrows with optional filters.
   */
  async list(params?: ListEscrowsParams): Promise<PaginatedResponse<Escrow>> {
    const validated = params ? validate(ListEscrowsParamsSchema, params) : undefined;
    return this.http.list<Escrow>(
      '/api/v1/escrow',
      validated as Record<string, string | number | boolean | undefined>
    );
  }

  /**
   * Fund an escrow.
   */
  async fund(escrowId: string, input: FundEscrowInput): Promise<Escrow> {
    const validatedId = validate(UUIDSchema, escrowId);
    const validated = validate(FundEscrowInputSchema, input);
    const response = await this.http.post<Escrow>(
      `/api/v1/escrow/${validatedId}/fund`,
      validated
    );
    return response.data;
  }

  /**
   * Sign/approve an escrow.
   */
  async sign(escrowId: string): Promise<Escrow> {
    const validatedId = validate(UUIDSchema, escrowId);
    const response = await this.http.post<Escrow>(
      `/api/v1/escrow/${validatedId}/sign`
    );
    return response.data;
  }

  /**
   * Check and update release conditions.
   */
  async checkConditions(escrowId: string): Promise<Escrow> {
    const validatedId = validate(UUIDSchema, escrowId);
    const response = await this.http.post<Escrow>(
      `/api/v1/escrow/${validatedId}/check-conditions`
    );
    return response.data;
  }

  /**
   * Release escrow funds.
   */
  async release(escrowId: string, input?: ReleaseEscrowInput): Promise<Escrow> {
    const validatedId = validate(UUIDSchema, escrowId);
    const validated = input ? validate(ReleaseEscrowInputSchema, input) : undefined;
    const response = await this.http.post<Escrow>(
      `/api/v1/escrow/${validatedId}/release`,
      validated
    );
    return response.data;
  }

  /**
   * Refund an escrow.
   */
  async refund(escrowId: string, reason?: string): Promise<Escrow> {
    const validatedId = validate(UUIDSchema, escrowId);
    const response = await this.http.post<Escrow>(
      `/api/v1/escrow/${validatedId}/refund`,
      { reason }
    );
    return response.data;
  }

  /**
   * Cancel an escrow.
   */
  async cancel(escrowId: string, reason?: string): Promise<Escrow> {
    const validatedId = validate(UUIDSchema, escrowId);
    const response = await this.http.post<Escrow>(
      `/api/v1/escrow/${validatedId}/cancel`,
      { reason }
    );
    return response.data;
  }

  // ============================================
  // Disputes
  // ============================================

  /**
   * Raise a dispute on an escrow.
   */
  async dispute(escrowId: string, input: RaiseDisputeInput): Promise<Escrow> {
    const validatedId = validate(UUIDSchema, escrowId);
    const validated = validate(RaiseDisputeInputSchema, input);
    const response = await this.http.post<Escrow>(
      `/api/v1/escrow/${validatedId}/dispute`,
      validated
    );
    return response.data;
  }

  /**
   * Resolve a dispute (arbiter only).
   */
  async resolveDispute(escrowId: string, input: ResolveDisputeInput): Promise<Escrow> {
    const validatedId = validate(UUIDSchema, escrowId);
    const validated = validate(ResolveDisputeInputSchema, input);
    const response = await this.http.post<Escrow>(
      `/api/v1/escrow/${validatedId}/resolve-dispute`,
      validated
    );
    return response.data;
  }

  // ============================================
  // Milestones
  // ============================================

  /**
   * Add a milestone to an escrow.
   */
  async addMilestone(escrowId: string, input: CreateMilestoneInput): Promise<Milestone> {
    const validatedId = validate(UUIDSchema, escrowId);
    const validated = validate(CreateMilestoneInputSchema, input);
    const response = await this.http.post<Milestone>(
      `/api/v1/escrow/${validatedId}/milestones`,
      validated
    );
    return response.data;
  }

  /**
   * Get milestones for an escrow.
   */
  async getMilestones(escrowId: string): Promise<Milestone[]> {
    const validatedId = validate(UUIDSchema, escrowId);
    const response = await this.http.get<{ data: Milestone[] }>(
      `/api/v1/escrow/${validatedId}/milestones`
    );
    return response.data.data;
  }

  /**
   * Get a specific milestone.
   */
  async getMilestone(escrowId: string, milestoneId: string): Promise<Milestone> {
    const validatedEscrowId = validate(UUIDSchema, escrowId);
    const validatedMilestoneId = validate(UUIDSchema, milestoneId);
    const response = await this.http.get<Milestone>(
      `/api/v1/escrow/${validatedEscrowId}/milestones/${validatedMilestoneId}`
    );
    return response.data;
  }

  /**
   * Submit evidence for a milestone.
   */
  async submitMilestoneEvidence(
    escrowId: string,
    milestoneId: string,
    input: SubmitMilestoneEvidenceInput
  ): Promise<Milestone> {
    const validatedEscrowId = validate(UUIDSchema, escrowId);
    const validatedMilestoneId = validate(UUIDSchema, milestoneId);
    const validated = validate(SubmitMilestoneEvidenceInputSchema, input);
    const response = await this.http.post<Milestone>(
      `/api/v1/escrow/${validatedEscrowId}/milestones/${validatedMilestoneId}/evidence`,
      validated
    );
    return response.data;
  }

  /**
   * Approve or reject a milestone.
   */
  async approveMilestone(
    escrowId: string,
    milestoneId: string,
    input: ApproveMilestoneInput
  ): Promise<Milestone> {
    const validatedEscrowId = validate(UUIDSchema, escrowId);
    const validatedMilestoneId = validate(UUIDSchema, milestoneId);
    const validated = validate(ApproveMilestoneInputSchema, input);
    const response = await this.http.post<Milestone>(
      `/api/v1/escrow/${validatedEscrowId}/milestones/${validatedMilestoneId}/approve`,
      validated
    );
    return response.data;
  }
}
