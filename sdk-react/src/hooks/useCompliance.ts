/**
 * useCompliance Hook - Compliance Checking and Decision Receipts
 *
 * Provides functionality for checking compliance and viewing audit trails.
 *
 * @example
 * ```tsx
 * function TransferChecker() {
 *   const { checkTransfer, loading } = useCompliance();
 *
 *   const handleCheck = async () => {
 *     const result = await checkTransfer({
 *       assetId: 'asset-123',
 *       fromAddress: '0x123...',
 *       toAddress: '0x456...',
 *       amount: '100',
 *     });
 *
 *     if (result.decision.result === 'ALLOW') {
 *       console.log('Transfer is allowed');
 *     } else {
 *       console.log('Transfer blocked:', result.decision.violations);
 *     }
 *   };
 *
 *   return <button onClick={handleCheck}>Check Compliance</button>;
 * }
 * ```
 */

import { useState, useCallback } from 'react';
import { useTokenisation } from '../context/TokenisationContext.js';
import type {
  PolicyDecision,
  DecisionReceipt,
  ComplianceAction,
} from '../types/index.js';

// ============================================================================
// TYPES
// ============================================================================

export interface ComplianceCheckResult {
  decision: PolicyDecision;
  receipt: DecisionReceipt;
}

export interface TransferCheckParams {
  assetId: string;
  fromAddress: string;
  toAddress: string;
  amount: string;
}

export interface MintCheckParams {
  assetId: string;
  toAddress: string;
  amount: string;
}

export interface ReceiptVerification {
  receiptId: string;
  valid: boolean;
  signatureValid: boolean;
  hashValid: boolean;
  chainValid: boolean;
  policyHashValid: boolean;
  issues: string[];
}

export interface UseComplianceReturn {
  /** Check if a transfer would be allowed */
  checkTransfer: (params: TransferCheckParams) => Promise<ComplianceCheckResult>;

  /** Check if minting would be allowed */
  checkMint: (params: MintCheckParams) => Promise<ComplianceCheckResult>;

  /** Check arbitrary compliance action */
  checkAction: (action: ComplianceAction, context: Record<string, unknown>) => Promise<ComplianceCheckResult>;

  /** Get decision receipts for an asset */
  getReceipts: (assetId: string) => Promise<DecisionReceipt[]>;

  /** Get a specific receipt */
  getReceipt: (receiptId: string) => Promise<DecisionReceipt | null>;

  /** Verify a receipt's integrity */
  verifyReceipt: (receiptId: string) => Promise<ReceiptVerification>;

  /** Verify the entire receipt chain for an asset */
  verifyReceiptChain: (assetId: string) => Promise<{ valid: boolean; brokenAt?: string }>;

  /** Loading state */
  loading: boolean;

  /** Error state */
  error: Error | null;
}

// ============================================================================
// HOOK
// ============================================================================

export function useCompliance(): UseComplianceReturn {
  const { config, wallet, currentParty } = useTokenisation();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Helper for API calls
  const apiCall = useCallback(
    async <T>(endpoint: string, options?: RequestInit): Promise<T> => {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(config.orgId ? { 'X-Org-Id': config.orgId } : {}),
        ...(wallet?.address ? { 'X-Wallet-Address': wallet.address } : {}),
      };

      const response = await fetch(`${config.apiUrl}${endpoint}`, {
        ...options,
        headers: { ...headers, ...options?.headers },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `API error: ${response.status}`);
      }

      return response.json();
    },
    [config, wallet]
  );

  // Check transfer compliance
  const checkTransfer = useCallback(
    async (params: TransferCheckParams): Promise<ComplianceCheckResult> => {
      setLoading(true);
      setError(null);

      try {
        const result = await apiCall<ComplianceCheckResult>(
          '/api/v1/compliance/check/transfer',
          {
            method: 'POST',
            body: JSON.stringify({
              ...params,
              actorId: currentParty?.id,
            }),
          }
        );

        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [apiCall, currentParty]
  );

  // Check mint compliance
  const checkMint = useCallback(
    async (params: MintCheckParams): Promise<ComplianceCheckResult> => {
      setLoading(true);
      setError(null);

      try {
        const result = await apiCall<ComplianceCheckResult>(
          '/api/v1/compliance/check/mint',
          {
            method: 'POST',
            body: JSON.stringify({
              ...params,
              actorId: currentParty?.id,
            }),
          }
        );

        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [apiCall, currentParty]
  );

  // Check arbitrary action
  const checkAction = useCallback(
    async (action: ComplianceAction, context: Record<string, unknown>): Promise<ComplianceCheckResult> => {
      setLoading(true);
      setError(null);

      try {
        const result = await apiCall<ComplianceCheckResult>(
          '/api/v1/compliance/check',
          {
            method: 'POST',
            body: JSON.stringify({
              action,
              context: {
                ...context,
                actorId: currentParty?.id,
              },
            }),
          }
        );

        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [apiCall, currentParty]
  );

  // Get receipts for asset
  const getReceipts = useCallback(
    async (assetId: string): Promise<DecisionReceipt[]> => {
      setLoading(true);
      setError(null);

      try {
        const result = await apiCall<{ receipts: DecisionReceipt[] }>(
          `/api/v1/compliance/receipts?assetId=${assetId}`
        );
        return result.receipts;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        return [];
      } finally {
        setLoading(false);
      }
    },
    [apiCall]
  );

  // Get specific receipt
  const getReceipt = useCallback(
    async (receiptId: string): Promise<DecisionReceipt | null> => {
      setLoading(true);
      setError(null);

      try {
        const result = await apiCall<{ receipt: DecisionReceipt }>(
          `/api/v1/compliance/receipts/${receiptId}`
        );
        return result.receipt;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [apiCall]
  );

  // Verify receipt
  const verifyReceipt = useCallback(
    async (receiptId: string): Promise<ReceiptVerification> => {
      setLoading(true);
      setError(null);

      try {
        const result = await apiCall<ReceiptVerification>(
          `/api/v1/compliance/receipts/${receiptId}/verify`
        );
        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [apiCall]
  );

  // Verify receipt chain
  const verifyReceiptChain = useCallback(
    async (assetId: string): Promise<{ valid: boolean; brokenAt?: string }> => {
      setLoading(true);
      setError(null);

      try {
        const result = await apiCall<{ valid: boolean; brokenAt?: string }>(
          `/api/v1/compliance/receipts/chain/verify?assetId=${assetId}`
        );
        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [apiCall]
  );

  return {
    checkTransfer,
    checkMint,
    checkAction,
    getReceipts,
    getReceipt,
    verifyReceipt,
    verifyReceiptChain,
    loading,
    error,
  };
}
