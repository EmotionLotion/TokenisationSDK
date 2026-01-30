/**
 * useInvestor - Hook for investor operations via InvestorsModule.
 */

import { useState, useCallback } from 'react';
import { useTokenisation } from '../context/TokenisationContext.js';

// ============================================================================
// Types
// ============================================================================

export interface InvestorData {
  id: string;
  email: string;
  name?: string | null;
  type: string;
  classification: string;
  status: string;
  kycStatus: string;
  jurisdiction: string;
  accredited: boolean;
  createdAt: string;
  [key: string]: unknown;
}

export interface UseInvestorReturn {
  create: (params: { email: string; name?: string; type?: string; jurisdiction: string; classification?: string }) => Promise<InvestorData>;
  get: (investorId: string) => Promise<InvestorData | null>;
  list: (params?: { status?: string; kycStatus?: string; limit?: number; offset?: number }) => Promise<InvestorData[]>;
  activate: (investorId: string) => Promise<InvestorData>;
  suspend: (investorId: string, reason?: string) => Promise<InvestorData>;
  addWallet: (investorId: string, params: { address: string; chainId: number; walletType?: string }) => Promise<any>;
  startKyc: (investorId: string, params?: { provider?: string; level?: string }) => Promise<{ verificationUrl?: string; sessionId?: string }>;
  approveKyc: (investorId: string) => Promise<InvestorData>;
  loading: boolean;
  error: Error | null;
}

// ============================================================================
// Hook
// ============================================================================

export function useInvestor(): UseInvestorReturn {
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

  const create = useCallback(
    (params: { email: string; name?: string; type?: string; jurisdiction: string; classification?: string }) =>
      wrapAsync(async () => {
        const result = await modules.investors.create(params as any);
        return (result as any).data;
      }),
    [modules.investors, wrapAsync],
  );

  const get = useCallback(
    (investorId: string) =>
      wrapAsync(async () => {
        const result = await modules.investors.get(investorId);
        return (result as any).data ?? null;
      }),
    [modules.investors, wrapAsync],
  );

  const list = useCallback(
    (params?: { status?: string; kycStatus?: string; limit?: number; offset?: number }) =>
      wrapAsync(async () => {
        const result = await modules.investors.list(params as any);
        return (result as any).data ?? [];
      }),
    [modules.investors, wrapAsync],
  );

  const activate = useCallback(
    (investorId: string) =>
      wrapAsync(async () => {
        const result = await modules.investors.activate(investorId);
        return (result as any).data;
      }),
    [modules.investors, wrapAsync],
  );

  const suspend = useCallback(
    (investorId: string, reason?: string) =>
      wrapAsync(async () => {
        const result = await modules.investors.suspend(investorId, reason as any);
        return (result as any).data;
      }),
    [modules.investors, wrapAsync],
  );

  const addWallet = useCallback(
    (investorId: string, params: { address: string; chainId: number; walletType?: string }) =>
      wrapAsync(async () => {
        const result = await modules.investors.addWallet(investorId, params as any);
        return (result as any).data;
      }),
    [modules.investors, wrapAsync],
  );

  const startKyc = useCallback(
    (investorId: string, params?: { provider?: string; level?: string }) =>
      wrapAsync(async () => {
        const result = await modules.investors.startKyc(investorId, params as any);
        return (result as any).data;
      }),
    [modules.investors, wrapAsync],
  );

  const approveKyc = useCallback(
    (investorId: string) =>
      wrapAsync(async () => {
        const result = await modules.investors.approveKyc(investorId);
        return (result as any).data;
      }),
    [modules.investors, wrapAsync],
  );

  return {
    create, get, list, activate, suspend, addWallet, startKyc, approveKyc,
    loading, error,
  };
}
