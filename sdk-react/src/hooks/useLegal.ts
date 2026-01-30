/**
 * useLegal - Hook for legal/KYC/AML operations via LegalModule.
 */

import { useState, useCallback } from 'react';
import { useTokenisation } from '../context/TokenisationContext.js';

// ============================================================================
// Types
// ============================================================================

export interface SanctionsResult {
  status: 'clear' | 'flagged' | 'blocked';
  matches?: unknown[];
}

export interface KYCStatusResult {
  investorId: string;
  status: string;
  provider?: string;
  verifiedAt?: string;
  expiresAt?: string;
  [key: string]: unknown;
}

export interface UseLegalReturn {
  screenSanctions: (investorId: string) => Promise<SanctionsResult>;
  getKYCStatus: (investorId: string) => Promise<KYCStatusResult | null>;
  initiateKYC: (investorId: string, params?: { provider?: string; level?: string; redirectUrl?: string }) => Promise<{ verificationUrl?: string; sessionId?: string }>;
  loading: boolean;
  error: Error | null;
}

// ============================================================================
// Hook
// ============================================================================

export function useLegal(): UseLegalReturn {
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

  const screenSanctions = useCallback(
    (investorId: string) =>
      wrapAsync(async () => {
        const result = await modules.legal.getVerificationStatus(investorId);
        return result as any;
      }),
    [modules.legal, wrapAsync],
  );

  const getKYCStatus = useCallback(
    (investorId: string) =>
      wrapAsync(async () => {
        const result = await modules.legal.getVerificationStatus(investorId);
        return (result as any).data ?? null;
      }),
    [modules.legal, wrapAsync],
  );

  const initiateKYC = useCallback(
    (investorId: string, _params?: { provider?: string; level?: string; redirectUrl?: string }) =>
      wrapAsync(async () => {
        const result = await modules.legal.initiateVerification(investorId);
        return result as any;
      }),
    [modules.legal, wrapAsync],
  );

  return {
    screenSanctions, getKYCStatus, initiateKYC,
    loading, error,
  };
}
