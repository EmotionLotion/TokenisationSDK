import type { HttpClient } from '../utils/http.js';
import type { Policy, ComplianceDecision, PaginatedResponse } from '../types.js';

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
    const response = await this.http.post<Policy>('/api/v1/compliance/policies', input);
    return response.data;
  }

  /**
   * Retrieves a policy by ID.
   */
  async getPolicy(id: string): Promise<Policy> {
    const response = await this.http.get<Policy>(`/api/v1/compliance/policies/${id}`);
    return response.data;
  }

  /**
   * Lists policies with optional filters.
   */
  async listPolicies(params?: ListPoliciesParams): Promise<PaginatedResponse<Policy>> {
    return this.http.list<Policy>('/api/v1/compliance/policies', params as Record<string, string | number | boolean | undefined>);
  }

  /**
   * Updates a policy.
   */
  async updatePolicy(id: string, input: UpdatePolicyInput): Promise<Policy> {
    const response = await this.http.patch<Policy>(`/api/v1/compliance/policies/${id}`, input);
    return response.data;
  }

  /**
   * Activates a policy.
   */
  async activatePolicy(id: string): Promise<Policy> {
    const response = await this.http.post<Policy>(`/api/v1/compliance/policies/${id}/activate`);
    return response.data;
  }

  /**
   * Archives a policy.
   */
  async archivePolicy(id: string): Promise<Policy> {
    const response = await this.http.post<Policy>(`/api/v1/compliance/policies/${id}/archive`);
    return response.data;
  }

  /**
   * Creates a new version of a policy.
   */
  async createPolicyVersion(id: string, input: { rules: PolicyRuleInput[]; changelog?: string }): Promise<Policy> {
    const response = await this.http.post<Policy>(`/api/v1/compliance/policies/${id}/versions`, input);
    return response.data;
  }

  // ============================================================================
  // Compliance Checks
  // ============================================================================

  /**
   * Checks compliance for an entity against a policy.
   */
  async check(policyId: string, input: CheckComplianceInput): Promise<ComplianceCheckResult> {
    const response = await this.http.post<ComplianceCheckResult>(`/api/v1/compliance/policies/${policyId}/check`, input);
    return response.data;
  }

  /**
   * Simulates a compliance check without creating a decision record.
   */
  async simulate(policyId: string, input: CheckComplianceInput): Promise<ComplianceCheckResult> {
    const response = await this.http.post<ComplianceCheckResult>(`/api/v1/compliance/policies/${policyId}/simulate`, input);
    return response.data;
  }

  // ============================================================================
  // Decision Management
  // ============================================================================

  /**
   * Gets a decision by ID.
   */
  async getDecision(id: string): Promise<ComplianceDecision> {
    const response = await this.http.get<ComplianceDecision>(`/api/v1/compliance/decisions/${id}`);
    return response.data;
  }

  /**
   * Lists decisions with optional filters.
   */
  async listDecisions(params?: {
    policyId?: string;
    entityType?: string;
    decision?: 'approved' | 'rejected' | 'pending_review';
    fromDate?: string;
    toDate?: string;
    limit?: number;
    offset?: number;
  }): Promise<PaginatedResponse<ComplianceDecision>> {
    return this.http.list<ComplianceDecision>('/api/v1/compliance/decisions', params as Record<string, string | number | boolean | undefined>);
  }

  /**
   * Overrides a decision (admin only).
   */
  async overrideDecision(id: string, input: OverrideDecisionInput): Promise<ComplianceDecision> {
    const response = await this.http.post<ComplianceDecision>(`/api/v1/compliance/decisions/${id}/override`, input);
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
