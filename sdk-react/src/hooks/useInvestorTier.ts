/**
 * useInvestorTier - React hook for investor tier management and eligibility.
 */

import { useState, useEffect, useCallback } from 'react';
import { useTokenisation } from '../context/TokenisationContext.js';

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
  violations: Array<{
    rule: string;
    severity: 'BLOCK' | 'WARN';
    message: string;
    limit?: number;
    actual?: number;
  }>;
  maxAllowedAmount: number;
}

export interface UseInvestorTierReturn {
  plans: InvestorPlan[];
  currentTier: InvestorTier | null;
  checkEligibility: (assetId: string, investorId: string, amount: number) => Promise<TierEligibilityResult>;
  loading: boolean;
  error: Error | null;
}

// ============================================================================
// Hook
// ============================================================================

export function useInvestorTier(assetId?: string): UseInvestorTierReturn {
  const { httpClient } = useTokenisation();
  const [plans, setPlans] = useState<InvestorPlan[]>([]);
  const [currentTier, setCurrentTier] = useState<InvestorTier | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Fetch plans when assetId changes
  useEffect(() => {
    if (!assetId || !httpClient) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    httpClient
      .get<{ data: InvestorPlan[] }>(`/api/v1/assets/${assetId}/plans`)
      .then((response) => {
        if (!cancelled) {
          setPlans(response.data.data);
          // Default to retail tier
          setCurrentTier('retail');
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)));
          // Fallback: set empty plans
          setPlans([]);
          setCurrentTier('retail');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [assetId, httpClient]);

  const checkEligibility = useCallback(
    async (checkAssetId: string, investorId: string, amount: number): Promise<TierEligibilityResult> => {
      if (!httpClient) {
        return {
          eligible: true,
          tier: 'retail',
          plan: null,
          violations: [],
          maxAllowedAmount: amount,
        };
      }

      const response = await httpClient.post<{ data: TierEligibilityResult }>(
        `/api/v1/assets/${checkAssetId}/check-eligibility`,
        { investorId, amount },
      );
      return response.data.data;
    },
    [httpClient],
  );

  return { plans, currentTier, checkEligibility, loading, error };
}
