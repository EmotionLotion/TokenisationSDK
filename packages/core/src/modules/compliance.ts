import type { HttpClient } from '../utils/http.js';
import type { Policy, ComplianceDecision, PaginatedResponse } from '../types.js';
import {
  validate,
  CreatePolicyWithRulesInputSchema,
  UpdatePolicyWithRulesInputSchema,
  ListPoliciesParamsSchema,
  CheckComplianceEntityInputSchema,
  CreatePolicyVersionInputSchema,
  ComplianceOverrideInputSchema,
  ListDecisionsParamsSchema,
  UUIDSchema,
} from './validation.js';

// ============================================================================
// Compliance Module
// ============================================================================

export interface CreatePolicyInput {
  name: string;
  description?: string;
  jurisdiction: string;
  rules: PolicyRuleInput[];
  metadata?: Record<string, unknown>;
}

export interface PolicyRuleInput {
  type: string;
  parameters: Record<string, unknown>;
  enabled?: boolean;
}

export interface UpdatePolicyInput {
  name?: string;
  description?: string;
  rules?: PolicyRuleInput[];
  metadata?: Record<string, unknown>;
}

export interface ListPoliciesParams {
  status?: 'draft' | 'active' | 'archived';
  jurisdiction?: string;
  limit?: number;
  offset?: number;
}

export interface CheckComplianceInput {
  entityType: 'transfer' | 'issuance' | 'redemption' | 'investor';
  entityId: string;
  context?: Record<string, unknown>;
}

export interface ComplianceCheckResult {
  policyId: string;
  decision: 'approved' | 'rejected' | 'pending_review';
  reasons: string[];
  details: Array<{
    ruleName: string;
    passed: boolean;
    message: string;
  }>;
}

export interface OverrideDecisionInput {
  decision: 'approved' | 'rejected';
  reason: string;
}

export class ComplianceModule {
  constructor(private http: HttpClient) {}

  // ============================================================================
  // Policy Management
  // ============================================================================

  /**
   * Creates a new compliance policy.
   */
  async createPolicy(input: CreatePolicyInput): Promise<Policy> {
    const validated = validate(CreatePolicyWithRulesInputSchema, input);
    const response = await this.http.post<Policy>('/api/v1/compliance/policies', validated);
    return response.data;
  }

  /**
   * Retrieves a policy by ID.
   */
  async getPolicy(id: string): Promise<Policy> {
    const validatedId = validate(UUIDSchema, id);
    const response = await this.http.get<Policy>(`/api/v1/compliance/policies/${validatedId}`);
    return response.data;
  }

  /**
   * Lists policies with optional filters.
   */
  async listPolicies(params?: ListPoliciesParams): Promise<PaginatedResponse<Policy>> {
    const validated = params ? validate(ListPoliciesParamsSchema, params) : undefined;
    return this.http.list<Policy>('/api/v1/compliance/policies', validated as Record<string, string | number | boolean | undefined>);
  }

  /**
   * Updates a policy.
   */
  async updatePolicy(id: string, input: UpdatePolicyInput): Promise<Policy> {
    const validatedId = validate(UUIDSchema, id);
    const validated = validate(UpdatePolicyWithRulesInputSchema, input);
    const response = await this.http.patch<Policy>(`/api/v1/compliance/policies/${validatedId}`, validated);
    return response.data;
  }

  /**
   * Activates a policy.
   */
  async activatePolicy(id: string): Promise<Policy> {
    const validatedId = validate(UUIDSchema, id);
    const response = await this.http.post<Policy>(`/api/v1/compliance/policies/${validatedId}/activate`);
    return response.data;
  }

  /**
   * Archives a policy.
   */
  async archivePolicy(id: string): Promise<Policy> {
    const validatedId = validate(UUIDSchema, id);
    const response = await this.http.post<Policy>(`/api/v1/compliance/policies/${validatedId}/archive`);
    return response.data;
  }

  /**
   * Creates a new version of a policy.
   */
  async createPolicyVersion(id: string, input: { rules: PolicyRuleInput[]; changelog?: string }): Promise<Policy> {
    const validatedId = validate(UUIDSchema, id);
    const validated = validate(CreatePolicyVersionInputSchema, input);
    const response = await this.http.post<Policy>(`/api/v1/compliance/policies/${validatedId}/versions`, validated);
    return response.data;
  }

  // ============================================================================
  // Compliance Checks
  // ============================================================================

  /**
   * Checks compliance for an entity against a policy.
   */
  async check(policyId: string, input: CheckComplianceInput): Promise<ComplianceCheckResult> {
    const validatedPolicyId = validate(UUIDSchema, policyId);
    const validated = validate(CheckComplianceEntityInputSchema, input);
    const response = await this.http.post<ComplianceCheckResult>(`/api/v1/compliance/policies/${validatedPolicyId}/check`, validated);
    return response.data;
  }

  /**
   * Simulates a compliance check without creating a decision record.
   */
  async simulate(policyId: string, input: CheckComplianceInput): Promise<ComplianceCheckResult> {
    const validatedPolicyId = validate(UUIDSchema, policyId);
    const validated = validate(CheckComplianceEntityInputSchema, input);
    const response = await this.http.post<ComplianceCheckResult>(`/api/v1/compliance/policies/${validatedPolicyId}/simulate`, validated);
    return response.data;
  }

  // ============================================================================
  // Decision Management
  // ============================================================================

  /**
   * Gets a decision by ID.
   */
  async getDecision(id: string): Promise<ComplianceDecision> {
    const validatedId = validate(UUIDSchema, id);
    const response = await this.http.get<ComplianceDecision>(`/api/v1/compliance/decisions/${validatedId}`);
    return response.data;
  }

  /**
   * Lists decisions with optional filters.
   */
  async listDecisions(params?: {
    policyId?: string;
    entityType?: 'transfer' | 'issuance' | 'redemption' | 'investor';
    decision?: 'approved' | 'rejected' | 'pending_review';
    fromDate?: string;
    toDate?: string;
    limit?: number;
    offset?: number;
  }): Promise<PaginatedResponse<ComplianceDecision>> {
    const validated = params ? validate(ListDecisionsParamsSchema, params) : undefined;
    return this.http.list<ComplianceDecision>('/api/v1/compliance/decisions', validated as Record<string, string | number | boolean | undefined>);
  }

  /**
   * Overrides a decision (admin only).
   */
  async overrideDecision(id: string, input: OverrideDecisionInput): Promise<ComplianceDecision> {
    const validatedId = validate(UUIDSchema, id);
    const validated = validate(ComplianceOverrideInputSchema, input);
    const response = await this.http.post<ComplianceDecision>(`/api/v1/compliance/decisions/${validatedId}/override`, validated);
    return response.data;
  }

  // ============================================================================
  // Rule Types Reference
  // ============================================================================

  /**
   * Gets available rule types and their parameters.
   */
  async getRuleTypes(): Promise<Array<{
    type: string;
    description: string;
    parameters: Array<{
      name: string;
      type: string;
      required: boolean;
      description: string;
    }>;
  }>> {
    const response = await this.http.get<Array<{
      type: string;
      description: string;
      parameters: Array<{
        name: string;
        type: string;
        required: boolean;
        description: string;
      }>;
    }>>('/api/v1/compliance/rule-types');
    return response.data;
  }
}
