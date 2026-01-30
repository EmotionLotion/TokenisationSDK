/**
 * useTokens Hook - Token Minting, Burning, and Transfers
 *
 * Uses SDK modules from context instead of raw fetch.
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
  mint: (toAddress: string, amount: string) => Promise<TokenOperationResult>;
  transfer: (fromAddress: string, toAddress: string, amount: string) => Promise<TokenOperationResult>;
  burn: (fromAddress: string, amount: string) => Promise<TokenOperationResult>;
  getBalance: (address: string) => Promise<TokenBalance | null>;
  getHolders: () => Promise<TokenHolder[]>;
  tokenInfo: TokenInfo | null;
  totalSupply: string;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

// ============================================================================
// HOOK
// ============================================================================

export function useTokens(assetId: string): UseTokensReturn {
  const { api, modules, wallet, currentParty, callbacks } = useTokenisation();

  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
  const [totalSupply, setTotalSupply] = useState<string>('0');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Fetch token info on mount
  const refresh = useCallback(async () => {
    if (!assetId) return;

    setLoading(true);
    setError(null);

    try {
      const result = await api.get<{ token: TokenInfo; totalSupply: string }>(
        `/api/v1/assets/${assetId}/token`,
      );
      setTokenInfo(result.data.token);
      setTotalSupply(result.data.totalSupply);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
    } finally {
      setLoading(false);
    }
  }, [assetId, api]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Mint tokens via SDK module
  const mint = useCallback(
    async (toAddress: string, amount: string): Promise<TokenOperationResult> => {
      setLoading(true);
      setError(null);

      try {
        if (!wallet?.address) throw new Error('Wallet not connected');
        if (!currentParty) throw new Error('KYC required for token operations');

        const result = await modules.tokens.issue(assetId, {
          to: toAddress,
          amount,
        } as any);

        await refresh();
        return { success: true, txHash: (result as any).data?.txHash };
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        return { success: false, error: error.message };
      } finally {
        setLoading(false);
      }
    },
    [assetId, wallet, currentParty, modules.tokens, refresh]
  );

  // Transfer tokens
  const transfer = useCallback(
    async (fromAddress: string, toAddress: string, amount: string): Promise<TokenOperationResult> => {
      setLoading(true);
      setError(null);

      try {
        if (!wallet?.address) throw new Error('Wallet not connected');
        if (!currentParty) throw new Error('KYC required for token operations');

        const result = await modules.transfers.create({
          tokenId: assetId,
          fromWallet: fromAddress,
          toWallet: toAddress,
          amount,
        } as any);

        await refresh();

        callbacks?.onTransferSuccess?.({
          assetId,
          fromAddress,
          toAddress,
          amount,
          txHash: (result as any).data?.txHash,
          timestamp: new Date().toISOString(),
        });

        return { success: true, txHash: (result as any).data?.txHash };
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        return { success: false, error: error.message };
      } finally {
        setLoading(false);
      }
    },
    [assetId, wallet, currentParty, modules.transfers, refresh, callbacks]
  );

  // Burn tokens via SDK module
  const burn = useCallback(
    async (fromAddress: string, amount: string): Promise<TokenOperationResult> => {
      setLoading(true);
      setError(null);

      try {
        if (!wallet?.address) throw new Error('Wallet not connected');
        if (!currentParty) throw new Error('KYC required for token operations');

        const result = await modules.tokens.redeem(assetId, {
          from: fromAddress,
          amount,
        } as any);

        await refresh();
        return { success: true, txHash: (result as any).data?.txHash };
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        return { success: false, error: error.message };
      } finally {
        setLoading(false);
      }
    },
    [assetId, wallet, currentParty, modules.tokens, refresh]
  );

  // Get balance via SDK module
  const getBalance = useCallback(
    async (address: string): Promise<TokenBalance | null> => {
      try {
        const result = await modules.tokens.getBalance(assetId, address);
        return (result as any).data;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        return null;
      }
    },
    [assetId, modules.tokens]
  );

  // Get all holders via SDK module
  const getHolders = useCallback(async (): Promise<TokenHolder[]> => {
    try {
      const result = await modules.tokens.getCapTable(assetId);
      return (result as any).data?.holders ?? [];
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      return [];
    }
  }, [assetId, modules.tokens]);

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
