/**
 * useTokens Hook
 *
 * Hook for managing tokenized assets in React Native.
 * Provides token listing, balance checking, and transfer functionality.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTokenisation } from '../context/TokenisationProvider.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Token information
 */
export interface Token {
  id: string;
  name: string;
  symbol: string;
  decimals: number;
  contractAddress: string | null;
  chainId: number;
  totalSupply: string;
  status: 'draft' | 'deployed' | 'active' | 'paused' | 'frozen';
  metadata?: Record<string, unknown>;
}

/**
 * Token holding/position
 */
export interface TokenHolding {
  tokenId: string;
  token: Token;
  balance: string;
  balanceFormatted: string;
  lockedBalance: string;
  availableBalance: string;
  vestingSchedule?: VestingSchedule;
}

/**
 * Vesting schedule for locked tokens
 */
export interface VestingSchedule {
  totalAmount: string;
  releasedAmount: string;
  startDate: string;
  endDate: string;
  cliffDate?: string;
  nextReleaseDate?: string;
  nextReleaseAmount?: string;
}

/**
 * Transfer request
 */
export interface TransferRequest {
  tokenId: string;
  toAddress: string;
  amount: string;
  memo?: string;
}

/**
 * Transfer result
 */
export interface TransferResult {
  transferId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  transactionHash?: string;
  error?: string;
}

/**
 * Hook options
 */
export interface UseTokensOptions {
  /** Auto-refresh interval in milliseconds (0 to disable) */
  refreshInterval?: number;
  /** Filter by chain ID */
  chainId?: number;
  /** Include only active tokens */
  activeOnly?: boolean;
}

/**
 * Return type for useTokens hook
 */
export interface UseTokensReturn {
  // State
  tokens: Token[];
  holdings: TokenHolding[];
  isLoading: boolean;
  error: Error | null;

  // Actions
  refresh: () => Promise<void>;
  getToken: (tokenId: string) => Promise<Token | null>;
  getHolding: (tokenId: string) => TokenHolding | undefined;
  transfer: (request: TransferRequest) => Promise<TransferResult>;

  // Computed
  totalValue: string;
  hasTokens: boolean;
}

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

/**
 * Hook for token management
 *
 * @example
 * ```tsx
 * function PortfolioScreen() {
 *   const {
 *     holdings,
 *     isLoading,
 *     refresh,
 *     transfer,
 *   } = useTokens({ refreshInterval: 30000 });
 *
 *   if (isLoading) return <ActivityIndicator />;
 *
 *   return (
 *     <FlatList
 *       data={holdings}
 *       renderItem={({ item }) => (
 *         <TokenCard
 *           token={item.token}
 *           balance={item.balanceFormatted}
 *         />
 *       )}
 *       onRefresh={refresh}
 *     />
 *   );
 * }
 * ```
 */
export function useTokens(options: UseTokensOptions = {}): UseTokensReturn {
  const { refreshInterval = 0, chainId, activeOnly = false } = options;

  const { client, wallet, config } = useTokenisation();

  const [tokens, setTokens] = useState<Token[]>([]);
  const [holdings, setHoldings] = useState<TokenHolding[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Fetch tokens and holdings
  const fetchData = useCallback(async () => {
    if (!client || !wallet.isConnected || !wallet.address) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // In a real implementation, this would call the API:
      // const tokensResponse = await client.tokens.list({ chainId, status: activeOnly ? 'active' : undefined });
      // const holdingsResponse = await client.holdings.list({ wallet: wallet.address });

      // Mock data for now
      const mockTokens: Token[] = [
        {
          id: 'tok_1',
          name: 'Example Property Token',
          symbol: 'EPT',
          decimals: 18,
          contractAddress: '0x' + '1'.repeat(40),
          chainId: wallet.chainId || 1,
          totalSupply: '1000000000000000000000',
          status: 'active',
        },
        {
          id: 'tok_2',
          name: 'Real Estate Fund',
          symbol: 'REF',
          decimals: 18,
          contractAddress: '0x' + '2'.repeat(40),
          chainId: wallet.chainId || 1,
          totalSupply: '5000000000000000000000',
          status: 'active',
        },
      ];

      const mockHoldings: TokenHolding[] = mockTokens.map(token => ({
        tokenId: token.id,
        token,
        balance: '100000000000000000000',
        balanceFormatted: '100.00',
        lockedBalance: '0',
        availableBalance: '100000000000000000000',
      }));

      // Apply filters
      let filteredTokens = mockTokens;
      if (chainId) {
        filteredTokens = filteredTokens.filter(t => t.chainId === chainId);
      }
      if (activeOnly) {
        filteredTokens = filteredTokens.filter(t => t.status === 'active');
      }

      setTokens(filteredTokens);
      setHoldings(mockHoldings.filter(h => filteredTokens.some(t => t.id === h.tokenId)));

      if (config.debug) {
        console.log('[Tokenisation] Fetched tokens:', filteredTokens.length);
      }
    } catch (err) {
      const fetchError = err instanceof Error ? err : new Error('Failed to fetch tokens');
      setError(fetchError);

      if (config.debug) {
        console.error('[Tokenisation] Token fetch error:', err);
      }
    } finally {
      setIsLoading(false);
    }
  }, [client, wallet.isConnected, wallet.address, wallet.chainId, chainId, activeOnly, config.debug]);

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh
  useEffect(() => {
    if (refreshInterval > 0) {
      const interval = setInterval(fetchData, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [refreshInterval, fetchData]);

  // Get single token
  const getToken = useCallback(async (tokenId: string): Promise<Token | null> => {
    const cached = tokens.find(t => t.id === tokenId);
    if (cached) return cached;

    if (!client) return null;

    try {
      // In a real implementation: const token = await client.tokens.get(tokenId);
      return null;
    } catch {
      return null;
    }
  }, [client, tokens]);

  // Get holding for a token
  const getHolding = useCallback((tokenId: string): TokenHolding | undefined => {
    return holdings.find(h => h.tokenId === tokenId);
  }, [holdings]);

  // Transfer tokens
  const transfer = useCallback(async (request: TransferRequest): Promise<TransferResult> => {
    if (!client || !wallet.isConnected || !wallet.address) {
      throw new Error('Wallet not connected');
    }

    try {
      if (config.debug) {
        console.log('[Tokenisation] Initiating transfer:', request);
      }

      // In a real implementation, this would:
      // 1. Validate the transfer request
      // 2. Check compliance requirements
      // 3. Submit the transfer to the API
      // 4. Sign the transaction if needed
      // 5. Return the result

      // Mock implementation
      await new Promise(resolve => setTimeout(resolve, 2000));

      return {
        transferId: `xfer_${Date.now()}`,
        status: 'pending',
      };
    } catch (err) {
      const transferError = err instanceof Error ? err.message : 'Transfer failed';
      return {
        transferId: '',
        status: 'failed',
        error: transferError,
      };
    }
  }, [client, wallet.isConnected, wallet.address, config.debug]);

  // Computed: total value (would need price data in real implementation)
  const totalValue = useMemo(() => {
    // Placeholder - would calculate based on token prices
    return '0.00';
  }, [holdings]);

  // Computed: has tokens
  const hasTokens = useMemo(() => holdings.length > 0, [holdings]);

  return {
    // State
    tokens,
    holdings,
    isLoading,
    error,

    // Actions
    refresh: fetchData,
    getToken,
    getHolding,
    transfer,

    // Computed
    totalValue,
    hasTokens,
  };
}

export default useTokens;
