/**
 * useCashFlow - Hook for cash flow / distribution operations via CashFlowModule.
 */

import { useState, useCallback } from 'react';
import { useTokenisation } from '../context/TokenisationContext.js';

// ============================================================================
// Types
// ============================================================================

export interface DistributionData {
  id: string;
  tokenId: string;
  type: string;
  amount: string;
  status: string;
  scheduledAt?: string;
  executedAt?: string;
  [key: string]: unknown;
}

export interface DistributionScheduleData {
  id: string;
  tokenId: string;
  frequency: string;
  nextDate: string;
  [key: string]: unknown;
}

export interface UseCashFlowReturn {
  createDistribution: (params: { tokenId: string; amount: string; type?: string; metadata?: Record<string, unknown> }) => Promise<DistributionData>;
  listDistributions: (params?: { tokenId?: string; status?: string; limit?: number }) => Promise<DistributionData[]>;
  getDistribution: (distributionId: string) => Promise<DistributionData | null>;
  claimDistribution: (distributionId: string) => Promise<{ success: boolean; amount?: string }>;
  getSchedule: (tokenId: string) => Promise<DistributionScheduleData | null>;
  loading: boolean;
  error: Error | null;
}

// ============================================================================
// Hook
// ============================================================================

export function useCashFlow(): UseCashFlowReturn {
  const { modules } = useTokenisation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const wrapAsync = useCallback(
    async <T>(fn: () => Promise<T>): Promise<T> => {
      setLoading(true);
      setError(null);
      try {
        return await fn();
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        setError(e);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const createDistribution = useCallback(
    (params: { tokenId: string; amount: string; type?: string; metadata?: Record<string, unknown> }) =>
      wrapAsync(async () => {
        const result = await modules.cashflow.scheduleDistribution(params as any);
        return result as any;
      }),
    [modules.cashflow, wrapAsync],
  );

  const listDistributions = useCallback(
    (params?: { tokenId?: string; status?: string; limit?: number }) =>
      wrapAsync(async () => {
        const result = await modules.cashflow.getDistributionHistory(params as any);
        return (result as any).data ?? [];
      }),
    [modules.cashflow, wrapAsync],
  );

  const getDistribution = useCallback(
    (distributionId: string) =>
      wrapAsync(async () => {
        const result = await modules.cashflow.getDistribution(distributionId);
        return (result as any).data ?? null;
      }),
    [modules.cashflow, wrapAsync],
  );

  const claimDistribution = useCallback(
    (distributionId: string) =>
      wrapAsync(async () => {
        const result = await modules.cashflow.claimPayout(distributionId);
        return result as any;
      }),
    [modules.cashflow, wrapAsync],
  );

  const getSchedule = useCallback(
    (tokenId: string) =>
      wrapAsync(async () => {
        const result = await modules.cashflow.getSchedule(tokenId);
        return (result as any).data ?? null;
      }),
    [modules.cashflow, wrapAsync],
  );

  return {
    createDistribution, listDistributions, getDistribution,
    claimDistribution, getSchedule,
    loading, error,
  };
}
