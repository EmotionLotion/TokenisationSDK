/**
 * useCapTable - Hook for fetching cap table data (Gap 11).
 *
 * Retrieves holder balances and ownership percentages for a given token.
 * Supports auto-refresh at a configurable interval.
 *
 * @example
 * ```tsx
 * function CapTableView({ tokenId }: { tokenId: string }) {
 *   const { data, loading, error, refresh } = useCapTable(tokenId, {
 *     autoRefresh: true,
 *     intervalMs: 30_000,
 *   });
 *
 *   if (loading) return <p>Loading...</p>;
 *   if (error) return <p>Error: {error.message}</p>;
 *
 *   return (
 *     <table>
 *       <thead><tr><th>Holder</th><th>Balance</th><th>%</th></tr></thead>
 *       <tbody>
 *         {data?.holders.map((h) => (
 *           <tr key={h.address}>
 *             <td>{h.address}</td>
 *             <td>{h.balance}</td>
 *             <td>{h.percentage}</td>
 *           </tr>
 *         ))}
 *       </tbody>
 *     </table>
 *   );
 * }
 * ```
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTokenisation } from '../context/TokenisationContext.js';

// ============================================================================
// Types
// ============================================================================

export interface CapTableHolder {
  address: string;
  name?: string;
  investorId?: string;
  balance: string;
  percentage: number;
}

export interface CapTableData {
  tokenId: string;
  tokenName?: string;
  totalSupply: string;
  holders: CapTableHolder[];
  asOfDate: string;
}

export interface UseCapTableOptions {
  /** Enable automatic periodic refresh (default: false) */
  autoRefresh?: boolean;
  /** Refresh interval in milliseconds (default: 60000) */
  intervalMs?: number;
  /** Disable the hook entirely */
  disabled?: boolean;
}

export interface UseCapTableReturn {
  /** Cap table data */
  data: CapTableData | null;
  /** Whether the initial or refresh fetch is in progress */
  loading: boolean;
  /** Last error, if any */
  error: Error | null;
  /** Manually trigger a refresh */
  refresh: () => void;
}

// ============================================================================
// Hook
// ============================================================================

const DEFAULT_INTERVAL_MS = 60_000;

export function useCapTable(
  tokenId: string | undefined,
  options?: UseCapTableOptions,
): UseCapTableReturn {
  const { api } = useTokenisation();

  const [data, setData] = useState<CapTableData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const cancelledRef = useRef(false);

  const {
    autoRefresh = false,
    intervalMs = DEFAULT_INTERVAL_MS,
    disabled = false,
  } = options ?? {};

  const fetchCapTable = useCallback(async () => {
    if (!tokenId || disabled) return;

    cancelledRef.current = false;

    setLoading(true);
    setError(null);

    try {
      const result = await api.get<CapTableData>(
        '/api/v1/ledger/cap-table/' + encodeURIComponent(tokenId),
      );

      if (!cancelledRef.current) {
        setData(result.data);
      }
    } catch (err) {
      if (cancelledRef.current) return;
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
    } finally {
      if (!cancelledRef.current) {
        setLoading(false);
      }
    }
  }, [tokenId, disabled, api]);

  // Fetch on mount and when tokenId changes
  useEffect(() => {
    fetchCapTable();
  }, [fetchCapTable]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh || disabled || intervalMs <= 0) return;

    const interval = setInterval(() => {
      fetchCapTable();
    }, intervalMs);

    return () => clearInterval(interval);
  }, [autoRefresh, disabled, intervalMs, fetchCapTable]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  return {
    data,
    loading,
    error,
    refresh: fetchCapTable,
  };
}
