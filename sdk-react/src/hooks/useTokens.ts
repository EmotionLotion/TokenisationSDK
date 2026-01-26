/**
 * useTokens Hook - Token Minting, Burning, and Transfers
 *
 * Provides functionality for token operations on assets.
 *
 * @example
 * ```tsx
 * function TokenManager({ assetId }: { assetId: string }) {
 *   const { mint, transfer, burn, getBalance, loading } = useTokens(assetId);
 *
 *   const handleMint = async () => {
 *     const result = await mint('0x123...', '1000');
 *     if (result.success) {
 *       console.log('Tokens minted:', result.txHash);
 *     }
 *   };
 *
 *   return <button onClick={handleMint} disabled={loading}>Mint Tokens</button>;
 * }
 * ```
 */

import { useState, useCallback, useEffect } from 'react';
import { useTokenisation } from '../context/TokenisationContext.js';
import type { TokenInfo, PolicyDecision, DecisionReceipt } from '../types/index.js';

// ============================================================================
// TYPES
// ============================================================================

export interface TokenOperationResult {
  success: boolean;
  txHash?: string;
  decision?: PolicyDecision;
  receipt?: DecisionReceipt;
  error?: string;
}

export interface TokenBalance {
  address: string;
  balance: string;
  lockedBalance?: string;
  availableBalance?: string;
}

export interface TokenHolder {
  address: string;
  partyId?: string;
  balance: string;
  percentage: number;
}

export interface UseTokensReturn {
  /** Mint tokens to an address */
  mint: (toAddress: string, amount: string) => Promise<TokenOperationResult>;

  /** Transfer tokens between addresses */
  transfer: (fromAddress: string, toAddress: string, amount: string) => Promise<TokenOperationResult>;

  /** Burn tokens from an address */
  burn: (fromAddress: string, amount: string) => Promise<TokenOperationResult>;

  /** Get balance for an address */
  getBalance: (address: string) => Promise<TokenBalance | null>;

  /** Get all token holders */
  getHolders: () => Promise<TokenHolder[]>;

  /** Get token info */
  tokenInfo: TokenInfo | null;

  /** Total supply */
  totalSupply: string;

  /** Loading state */
  loading: boolean;

  /** Error state */
  error: Error | null;

  /** Refresh token data */
  refresh: () => Promise<void>;
}

// ============================================================================
// HOOK
// ============================================================================

export function useTokens(assetId: string): UseTokensReturn {
  const { config, wallet, currentParty } = useTokenisation();

  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
  const [totalSupply, setTotalSupply] = useState<string>('0');
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

  // Fetch token info on mount
  const refresh = useCallback(async () => {
    if (!assetId) return;

    setLoading(true);
    setError(null);

    try {
      const result = await apiCall<{
        token: TokenInfo;
        totalSupply: string;
      }>(`/api/v1/assets/${assetId}/token`);

      setTokenInfo(result.token);
      setTotalSupply(result.totalSupply);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
    } finally {
      setLoading(false);
    }
  }, [assetId, apiCall]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Mint tokens
  const mint = useCallback(
    async (toAddress: string, amount: string): Promise<TokenOperationResult> => {
      setLoading(true);
      setError(null);

      try {
        if (!wallet?.address) {
          throw new Error('Wallet not connected');
        }

        if (!currentParty) {
          throw new Error('KYC required for token operations');
        }

        const result = await apiCall<{
          success: boolean;
          txHash?: string;
          decision?: PolicyDecision;
          receipt?: DecisionReceipt;
          error?: string;
        }>(`/api/v1/assets/${assetId}/mint`, {
          method: 'POST',
          body: JSON.stringify({
            toAddress,
            amount,
            actorId: currentParty.id,
          }),
        });

        if (result.success) {
          // Refresh token data
          await refresh();
        }

        return {
          success: result.success,
          txHash: result.txHash,
          decision: result.decision,
          receipt: result.receipt,
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
    [assetId, wallet, currentParty, apiCall, refresh]
  );

  // Transfer tokens
  const transfer = useCallback(
    async (fromAddress: string, toAddress: string, amount: string): Promise<TokenOperationResult> => {
      setLoading(true);
      setError(null);

      try {
        if (!wallet?.address) {
          throw new Error('Wallet not connected');
        }

        if (!currentParty) {
          throw new Error('KYC required for token operations');
        }

        const result = await apiCall<{
          success: boolean;
          txHash?: string;
          decision?: PolicyDecision;
          receipt?: DecisionReceipt;
          error?: string;
        }>(`/api/v1/assets/${assetId}/transfer`, {
          method: 'POST',
          body: JSON.stringify({
            fromAddress,
            toAddress,
            amount,
            actorId: currentParty.id,
          }),
        });

        if (result.success) {
          await refresh();
        }

        return {
          success: result.success,
          txHash: result.txHash,
          decision: result.decision,
          receipt: result.receipt,
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
    [assetId, wallet, currentParty, apiCall, refresh]
  );

  // Burn tokens
  const burn = useCallback(
    async (fromAddress: string, amount: string): Promise<TokenOperationResult> => {
      setLoading(true);
      setError(null);

      try {
        if (!wallet?.address) {
          throw new Error('Wallet not connected');
        }

        if (!currentParty) {
          throw new Error('KYC required for token operations');
        }

        const result = await apiCall<{
          success: boolean;
          txHash?: string;
          decision?: PolicyDecision;
          receipt?: DecisionReceipt;
          error?: string;
        }>(`/api/v1/assets/${assetId}/burn`, {
          method: 'POST',
          body: JSON.stringify({
            fromAddress,
            amount,
            actorId: currentParty.id,
          }),
        });

        if (result.success) {
          await refresh();
        }

        return {
          success: result.success,
          txHash: result.txHash,
          decision: result.decision,
          receipt: result.receipt,
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
    [assetId, wallet, currentParty, apiCall, refresh]
  );

  // Get balance
  const getBalance = useCallback(
    async (address: string): Promise<TokenBalance | null> => {
      try {
        const result = await apiCall<{ balance: TokenBalance }>(
          `/api/v1/assets/${assetId}/balance/${address}`
        );
        return result.balance;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        return null;
      }
    },
    [assetId, apiCall]
  );

  // Get all holders
  const getHolders = useCallback(async (): Promise<TokenHolder[]> => {
    try {
      const result = await apiCall<{ holders: TokenHolder[] }>(
        `/api/v1/assets/${assetId}/holders`
      );
      return result.holders;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      return [];
    }
  }, [assetId, apiCall]);

  return {
    mint,
    transfer,
    burn,
    getBalance,
    getHolders,
    tokenInfo,
    totalSupply,
    loading,
    error,
    refresh,
  };
}
