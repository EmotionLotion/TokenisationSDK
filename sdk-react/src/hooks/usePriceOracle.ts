/**
 * usePriceOracle Hook - Real-Time Asset Valuation via Price Feeds
 *
 * Provides real-time price data by polling backend oracle endpoints,
 * with optional historical price data and staleness detection.
 *
 * @example
 * ```tsx
 * function AssetPrice({ assetId }: { assetId: string }) {
 *   const { price, history, loading, isStale, refresh } = usePriceOracle(assetId, {
 *     pollInterval: 15000,
 *     includeHistory: true,
 *     historyPeriod: '24h',
 *   });
 *
 *   if (loading) return <span>Loading...</span>;
 *   if (!price) return <span>No price data</span>;
 *
 *   return (
 *     <div>
 *       <span>${price.currentPrice}</span>
 *       <span className={price.change24h >= 0 ? 'green' : 'red'}>
 *         {price.changePercent24h.toFixed(2)}%
 *       </span>
 *       {isStale && <span>Price data may be outdated</span>}
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

export interface PriceData {
  assetId: string;
  currentPrice: number;
  previousPrice: number;
  change24h: number;
  changePercent24h: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  marketCap?: number;
  lastUpdated: string;
  source: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface PriceHistoryPoint {
  timestamp: string;
  price: number;
  volume?: number;
}

export interface UsePriceOracleOptions {
  /** Polling interval in milliseconds. Default: 30000 */
  pollInterval?: number;
  /** Whether to fetch historical price data. Default: false */
  includeHistory?: boolean;
  /** Time period for history data. Default: '24h' */
  historyPeriod?: '1h' | '24h' | '7d' | '30d' | '1y';
}

export interface UsePriceOracleReturn {
  /** Current price data for the asset */
  price: PriceData | null;
  /** Historical price points */
  history: PriceHistoryPoint[];
  /** Loading state */
  loading: boolean;
  /** Error state */
  error: Error | null;
  /** Force an immediate re-fetch of price data */
  refresh: () => Promise<void>;
  /** True if no successful update has been received in 2x the poll interval */
  isStale: boolean;
}

// ============================================================================
// HOOK
// ============================================================================

export function usePriceOracle(
  assetId: string,
  options?: UsePriceOracleOptions
): UsePriceOracleReturn {
  const { config, wallet } = useTokenisation();

  const pollInterval = options?.pollInterval ?? 30000;
  const includeHistory = options?.includeHistory ?? false;
  const historyPeriod = options?.historyPeriod ?? '24h';

  const [price, setPrice] = useState<PriceData | null>(null);
  const [history, setHistory] = useState<PriceHistoryPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [isStale, setIsStale] = useState(false);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const staleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastUpdateRef = useRef<number>(0);

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

  // Fetch current price data
  const fetchPrice = useCallback(async () => {
    if (!assetId) return;

    try {
      const result = await apiCall<PriceData>(
        `/api/v1/oracle/price/${assetId}`
      );
      setPrice(result);
      setError(null);
      resetStaleTimer();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
    }
  }, [assetId, apiCall, resetStaleTimer]);

  // Fetch price history
  const fetchHistory = useCallback(async () => {
    if (!assetId || !includeHistory) return;

    try {
      const result = await apiCall<{ history: PriceHistoryPoint[] }>(
        `/api/v1/oracle/price/${assetId}/history?period=${historyPeriod}`
      );
      setHistory(result.history);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
    }
  }, [assetId, includeHistory, historyPeriod, apiCall]);

  // Refresh: forces immediate re-fetch of all data
  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      await Promise.all([fetchPrice(), fetchHistory()]);
    } finally {
      setLoading(false);
    }
  }, [fetchPrice, fetchHistory]);

  // Initial fetch and polling setup
  useEffect(() => {
    if (!assetId) return;

    // Initial fetch
    setLoading(true);
    Promise.all([fetchPrice(), fetchHistory()]).finally(() => {
      setLoading(false);
    });

    // Set up polling interval
    intervalRef.current = setInterval(() => {
      fetchPrice();
      if (includeHistory) {
        fetchHistory();
      }
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
  }, [assetId, pollInterval, includeHistory, fetchPrice, fetchHistory]);

  return {
    price,
    history,
    loading,
    error,
    refresh,
    isStale,
  };
}
