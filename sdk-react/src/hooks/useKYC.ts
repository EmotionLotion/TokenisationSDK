/**
 * useKYC Hook - KYC/AML Verification Flow
 *
 * Provides functionality for initiating and tracking KYC verification.
 *
 * @example
 * ```tsx
 * function KYCFlow() {
 *   const { initiateKYC, status, loading } = useKYC();
 *
 *   useEffect(() => {
 *     if (status === 'not_started') {
 *       initiateKYC('standard');
 *     }
 *   }, [status]);
 *
 *   return (
 *     <div>
 *       KYC Status: {status}
 *       {status === 'pending' && <p>Please complete verification in the popup</p>}
 *     </div>
 *   );
 * }
 * ```
 */

import { useState, useCallback, useEffect } from 'react';
import { useTokenisation } from '../context/TokenisationContext.js';
import type { KYCLevel, KYCStatus, KYCFormData } from '../types/index.js';

// ============================================================================
// TYPES
// ============================================================================

export interface KYCVerification {
  verificationId: string;
  level: KYCLevel;
  status: KYCStatus;
  jurisdiction?: string;
  accreditedInvestor?: boolean;
  isPEP?: boolean;
  sanctionsStatus?: 'clear' | 'flagged' | 'blocked';
  verifiedAt?: string;
  expiresAt?: string;
  rejectionReason?: string;
}

export interface KYCInitiateResult {
  success: boolean;
  verificationId?: string;
  verificationUrl?: string;
  sdkToken?: string;
  error?: string;
}

export interface UseKYCReturn {
  /** Initiate KYC verification */
  initiateKYC: (level: KYCLevel, prefill?: Partial<KYCFormData>) => Promise<KYCInitiateResult>;

  /** Get current verification status */
  getVerification: () => Promise<KYCVerification | null>;

  /** Check if user meets required KYC level */
  meetsLevel: (requiredLevel: KYCLevel) => boolean;

  /** Run sanctions screening */
  screenSanctions: () => Promise<{ status: 'clear' | 'flagged' | 'blocked'; matches?: unknown[] }>;

  /** Current KYC status */
  status: KYCStatus;

  /** Current KYC level */
  level: KYCLevel;

  /** Current verification details */
  verification: KYCVerification | null;

  /** Whether user is accredited investor */
  isAccredited: boolean;

  /** Loading state */
  loading: boolean;

  /** Error state */
  error: Error | null;

  /** Refresh status */
  refresh: () => Promise<void>;
}

// ============================================================================
// KYC LEVEL HIERARCHY
// ============================================================================

const KYC_LEVEL_HIERARCHY: Record<KYCLevel, number> = {
  none: 0,
  basic: 1,
  standard: 2,
  enhanced: 3,
  institutional: 4,
};

// ============================================================================
// HOOK
// ============================================================================

export function useKYC(): UseKYCReturn {
  const { api, config, wallet, currentParty } = useTokenisation();

  const [verification, setVerification] = useState<KYCVerification | null>(null);
  const [status, setStatus] = useState<KYCStatus>('not_started');
  const [level, setLevel] = useState<KYCLevel>('none');
  const [isAccredited, setIsAccredited] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Fetch current verification status
  const refresh = useCallback(async () => {
    if (!wallet?.address) return;

    setLoading(true);
    setError(null);

    try {
      const result = (await api.get<{ verification: KYCVerification | null }>(
        '/api/v1/kyc/status',
        { walletAddress: wallet.address },
      )).data;

      if (result.verification) {
        setVerification(result.verification);
        setStatus(result.verification.status);
        setLevel(result.verification.level);
        setIsAccredited(result.verification.accreditedInvestor || false);
      } else {
        setVerification(null);
        setStatus('not_started');
        setLevel('none');
        setIsAccredited(false);
      }
    } catch (err) {
      // No verification found is not an error
      setVerification(null);
      setStatus('not_started');
      setLevel('none');
    } finally {
      setLoading(false);
    }
  }, [wallet, api]);

  // Fetch on mount and wallet change
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Get current verification
  const getVerification = useCallback(async (): Promise<KYCVerification | null> => {
    await refresh();
    return verification;
  }, [refresh, verification]);

  // Initiate KYC
  const initiateKYC = useCallback(
    async (requestedLevel: KYCLevel, prefill?: Partial<KYCFormData>): Promise<KYCInitiateResult> => {
      setLoading(true);
      setError(null);

      try {
        if (!wallet?.address) {
          throw new Error('Wallet not connected');
        }

        const result = (await api.post<{
          success: boolean;
          verificationId?: string;
          verificationUrl?: string;
          sdkToken?: string;
          error?: string;
        }>('/api/v1/kyc/initiate', {
          walletAddress: wallet.address,
          level: requestedLevel,
          redirectUrl: window.location.href,
          webhookUrl: config.kyc?.webhookUrl,
          prefill: prefill
            ? {
                email: prefill.email,
                phone: prefill.phone,
                firstName: prefill.firstName,
                lastName: prefill.lastName,
                dateOfBirth: prefill.dateOfBirth,
                country: prefill.nationality,
              }
            : undefined,
        })).data;

        if (result.success && result.verificationUrl) {
          setStatus('pending');

          // Open KYC flow in popup or redirect
          if (config.kyc?.provider === 'custom') {
            // Partner handles custom flow
          } else {
            // Default: open in new window
            window.open(result.verificationUrl, 'kyc', 'width=600,height=800');
          }
        }

        return {
          success: result.success,
          verificationId: result.verificationId,
          verificationUrl: result.verificationUrl,
          sdkToken: result.sdkToken,
          error: result.error,
        };
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        return { success: false, error: error.message };
      } finally {
        setLoading(false);
      }
    },
    [api, config, wallet]
  );

  // Check if user meets required level
  const meetsLevel = useCallback(
    (requiredLevel: KYCLevel): boolean => {
      if (status !== 'approved') return false;
      return KYC_LEVEL_HIERARCHY[level] >= KYC_LEVEL_HIERARCHY[requiredLevel];
    },
    [status, level]
  );

  // Run sanctions screening
  const screenSanctions = useCallback(async (): Promise<{
    status: 'clear' | 'flagged' | 'blocked';
    matches?: unknown[];
  }> => {
    setLoading(true);
    setError(null);

    try {
      if (!wallet?.address) {
        throw new Error('Wallet not connected');
      }

      if (!currentParty) {
        throw new Error('KYC verification required for sanctions screening');
      }

      const result = (await api.post<{
        status: 'clear' | 'flagged' | 'blocked';
        matches?: unknown[];
      }>('/api/v1/kyc/sanctions/screen', {
        partyId: currentParty.id,
      })).data;

      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [api, wallet, currentParty]);

  return {
    initiateKYC,
    getVerification,
    meetsLevel,
    screenSanctions,
    status,
    level,
    verification,
    isAccredited,
    loading,
    error,
    refresh,
  };
}
