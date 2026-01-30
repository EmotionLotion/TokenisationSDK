/**
 * useTokenBalance Hook - Auto-Polling Token Balance
 *
 * Returns a human-readable token balance with automatic polling,
 * decimal conversion, and staleness detection.
 *
 * @example
 * ```tsx
 * function Balance({ assetId }: { assetId: string }) {
 *   const { balance, rawBalance, loading, isStale, refresh } = useTokenBalance(assetId, {
 *     pollInterval: 15000,
 *     decimals: 18,
 *   });
 *
 *   if (loading) return <span>Loading...</span>;
 *
 *   return (
 *     <div>
 *       <span>{balance ?? '0.00'}</span>
 *       {isStale && <span>Balance may be outdated</span>}
 *     </div>
 *   );
 * }
 * ```
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useTokenisation } from '../context/TokenisationContext.js';

// ============================================================================
// TYPES
// ============================================================================

export interface UseTokenBalanceOptions {
  /** Polling interval in milliseconds. Default: 15000 */
  pollInterval?: number;
  /** Token decimals for human-readable conversion. Default: 18 */
  decimals?: number;
}

export interface UseTokenBalanceReturn {
  /** Human-readable balance (e.g. "1500.00") */
  balance: string | null;
  /** Raw balance as BigInt string */
  rawBalance: string | null;
  /** Loading state */
  loading: boolean;
  /** Error state */
  error: Error | null;
  /** Force an immediate re-fetch */
  refresh: () => Promise<void>;
  /** True if no successful update in 2x poll interval */
  isStale: boolean;
}

// ============================================================================
// HELPERS
// ============================================================================

function formatBalance(rawBalance: string, decimals: number): string {
  const raw = rawBalance.replace(/^0x/, '');
  const value = BigInt(raw || '0');
  const divisor = BigInt(10) ** BigInt(decimals);
  const integerPart = value / divisor;
  const fractionalPart = value % divisor;

  const fractionalStr = fractionalPart.toString().padStart(decimals, '0').slice(0, 2);
  return `${integerPart.toString()}.${fractionalStr}`;
}

// ============================================================================
// HOOK
// ============================================================================

export function useTokenBalance(
  assetId: string,
  options?: UseTokenBalanceOptions
): UseTokenBalanceReturn {
  const { api, wallet } = useTokenisation();

  const pollInterval = options?.pollInterval ?? 15000;
  const decimals = options?.decimals ?? 18;

  const [balance, setBalance] = useState<string | null>(null);
  const [rawBalance, setRawBalance] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [isStale, setIsStale] = useState(false);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const staleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastUpdateRef = useRef<number>(0);

  // Reset the staleness timer after a successful fetch
  const resetStaleTimer = useCallback(() => {
    lastUpdateRef.current = Date.now();
    setIsStale(false);

    if (staleTimerRef.current) {
      clearTimeout(staleTimerRef.current);
    }

    staleTimerRef.current = setTimeout(() => {
      setIsStale(true);
    }, pollInterval * 2);
  }, [pollInterval]);

  // Fetch balance
  const fetchBalance = useCallback(async () => {
    if (!assetId || !wallet?.address) return;

    try {
      const result = (await api.get<{ balance: string }>(
        `/api/v1/assets/${assetId}/balance/${wallet.address}`,
      )).data;
      const raw = result.balance;
      setRawBalance(raw);
      setBalance(formatBalance(raw, decimals));
      setError(null);
      resetStaleTimer();
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
    }
  }, [assetId, wallet, api, decimals, resetStaleTimer]);

  // Refresh: forces immediate re-fetch
  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      await fetchBalance();
    } finally {
      setLoading(false);
    }
  }, [fetchBalance]);

  // Initial fetch and polling setup
  useEffect(() => {
    if (!assetId || !wallet?.address) return;

    // Initial fetch
    setLoading(true);
    fetchBalance().finally(() => {
      setLoading(false);
    });

    // Set up polling interval
    intervalRef.current = setInterval(() => {
      fetchBalance();
    }, pollInterval);

    // Cleanup on unmount or dependency change
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (staleTimerRef.current) {
        clearTimeout(staleTimerRef.current);
        staleTimerRef.current = null;
      }
    };
  }, [assetId, wallet?.address, pollInterval, fetchBalance]);

  return {
    balance,
    rawBalance,
    loading,
    error,
    refresh,
    isStale,
  };
}
