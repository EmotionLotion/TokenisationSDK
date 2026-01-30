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
  const { api, currentParty } = useTokenisation();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Check transfer compliance
  const checkTransfer = useCallback(
    async (params: TransferCheckParams): Promise<ComplianceCheckResult> => {
      setLoading(true);
      setError(null);

      try {
        const result = (await api.post<ComplianceCheckResult>(
          '/api/v1/compliance/check/transfer',
          {
            ...params,
            actorId: currentParty?.id,
          },
        )).data;

        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [api, currentParty]
  );

  // Check mint compliance
  const checkMint = useCallback(
    async (params: MintCheckParams): Promise<ComplianceCheckResult> => {
      setLoading(true);
      setError(null);

      try {
        const result = (await api.post<ComplianceCheckResult>(
          '/api/v1/compliance/check/mint',
          {
            ...params,
            actorId: currentParty?.id,
          },
        )).data;

        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [api, currentParty]
  );

  // Check arbitrary action
  const checkAction = useCallback(
    async (action: ComplianceAction, context: Record<string, unknown>): Promise<ComplianceCheckResult> => {
      setLoading(true);
      setError(null);

      try {
        const result = (await api.post<ComplianceCheckResult>(
          '/api/v1/compliance/check',
          {
            action,
            context: {
              ...context,
              actorId: currentParty?.id,
            },
          },
        )).data;

        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [api, currentParty]
  );

  // Get receipts for asset
  const getReceipts = useCallback(
    async (assetId: string): Promise<DecisionReceipt[]> => {
      setLoading(true);
      setError(null);

      try {
        const result = (await api.get<{ receipts: DecisionReceipt[] }>(
          '/api/v1/compliance/receipts',
          { assetId },
        )).data;
        return result.receipts;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        return [];
      } finally {
        setLoading(false);
      }
    },
    [api]
  );

  // Get specific receipt
  const getReceipt = useCallback(
    async (receiptId: string): Promise<DecisionReceipt | null> => {
      setLoading(true);
      setError(null);

      try {
        const result = (await api.get<{ receipt: DecisionReceipt }>(
          `/api/v1/compliance/receipts/${receiptId}`,
        )).data;
        return result.receipt;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [api]
  );

  // Verify receipt
  const verifyReceipt = useCallback(
    async (receiptId: string): Promise<ReceiptVerification> => {
      setLoading(true);
      setError(null);

      try {
        const result = (await api.get<ReceiptVerification>(
          `/api/v1/compliance/receipts/${receiptId}/verify`,
        )).data;
        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [api]
  );

  // Verify receipt chain
  const verifyReceiptChain = useCallback(
    async (assetId: string): Promise<{ valid: boolean; brokenAt?: string }> => {
      setLoading(true);
      setError(null);

      try {
        const result = (await api.get<{ valid: boolean; brokenAt?: string }>(
          '/api/v1/compliance/receipts/chain/verify',
          { assetId },
        )).data;
        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [api]
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
