/**
 * InvestorTierModule - SDK module for per-tier investment limits and eligibility.
 *
 * Defines InvestorPlan with tier, min/maxInvestment, maxHoldingPercent, fees,
 * lockup, and accreditation requirements. Enforces VARA compliance.
 */

import type { HttpClient } from '../utils/http.js';
import { parseOrThrow, assignTierInputSchema, checkEligibilityInputSchema } from '../validation/real-estate.js';

// ============================================================================
// Types
// ============================================================================

export type InvestorTier = 'retail' | 'qualified' | 'professional' | 'institutional';

export interface InvestorPlan {
  id: string;
  assetId: string;
  tier: InvestorTier;
  name: string;
  minInvestment: number;
  maxInvestment: number;
  maxHoldingPercent: number;
  managementFeePercent: number;
  performanceFeePercent: number;
  lockupDays: number;
  accreditationRequired: boolean;
  accreditationTypes?: string[];
  currency: string;
  active: boolean;
}

export interface TierEligibilityResult {
  eligible: boolean;
  tier: InvestorTier;
  plan: InvestorPlan | null;
  violations: TierViolation[];
  maxAllowedAmount: number;
}

export interface TierViolation {
  rule: string;
  severity: 'BLOCK' | 'WARN';
  message: string;
  limit?: number;
  actual?: number;
}

export interface InvestorTierInfo {
  investorId: string;
  tier: InvestorTier;
  accreditationStatus: string;
  totalInvested: number;
  currency: string;
}

// ============================================================================
// Module
// ============================================================================

export class InvestorTierModule {
  constructor(private http: HttpClient) {}

  /**
   * Get all investment plans for an asset.
   */
  async getPlans(assetId: string): Promise<InvestorPlan[]> {
    const response = await this.http.get<{ data: InvestorPlan[] }>(
      `/api/v1/assets/${encodeURIComponent(assetId)}/plans`,
    );
    return response.data.data;
  }

  /**
   * Create or update an investment plan for an asset.
   */
  async createPlan(assetId: string, plan: Omit<InvestorPlan, 'id' | 'assetId'>): Promise<InvestorPlan> {
    const response = await this.http.post<{ data: InvestorPlan }>(
      `/api/v1/assets/${encodeURIComponent(assetId)}/plans`,
      plan,
    );
    return response.data.data;
  }

  /**
   * Check if an investor is eligible to invest a given amount.
   * Enforces VARA rules: min investment, max retail cap (BLOCK), holding limits.
   */
  async checkEligibility(
    assetId: string,
    investorId: string,
    amount: number,
  ): Promise<TierEligibilityResult> {
    const validated = parseOrThrow(checkEligibilityInputSchema, { investorId, amount }, 'CheckEligibility');
    const response = await this.http.post<{ data: TierEligibilityResult }>(
      `/api/v1/assets/${encodeURIComponent(assetId)}/check-eligibility`,
      validated,
    );
    return response.data.data;
  }

  /**
   * Assign a tier to an investor.
   */
  async assignTier(
    investorId: string,
    input: { tier: InvestorTier; accreditationStatus?: string; totalInvested?: number },
  ): Promise<InvestorTierInfo> {
    const validated = parseOrThrow(assignTierInputSchema, input, 'AssignTier');
    const response = await this.http.post<{ data: InvestorTierInfo }>(
      `/api/v1/investors/${encodeURIComponent(investorId)}/tier`,
      validated,
    );
    return response.data.data;
  }

  /**
   * Get the effective tier for an investor.
   */
  async getEffectiveTier(investorId: string): Promise<InvestorTierInfo> {
    const response = await this.http.get<{ data: InvestorTierInfo }>(
      `/api/v1/investors/${encodeURIComponent(investorId)}/tier`,
    );
    return response.data.data;
  }
}
