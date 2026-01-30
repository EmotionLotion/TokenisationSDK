/**
 * useTransactionHistory Hook - Indexed Transaction History with Filters and Pagination
 *
 * Provides functionality for fetching transaction history with filtering
 * and automatic cursor-based pagination.
 *
 * @example
 * ```tsx
 * function TransactionList({ assetId }: { assetId: string }) {
 *   const { transactions, pagination, loading, loadMore, setFilters } =
 *     useTransactionHistory({ assetId }, 20);
 *
 *   return (
 *     <div>
 *       {transactions.map((tx) => (
 *         <div key={tx.id}>{tx.type} - {tx.amount}</div>
 *       ))}
 *       {pagination.hasMore && (
 *         <button onClick={loadMore} disabled={loading}>Load More</button>
 *       )}
 *     </div>
 *   );
 * }
 * ```
 */

import { useState, useCallback, useEffect } from 'react';
import { useTokenisation } from '../context/TokenisationContext.js';

// ============================================================================
// TYPES
// ============================================================================

export type TransactionType = 'mint' | 'transfer' | 'burn' | 'dividend' | 'redemption' | 'freeze' | 'unfreeze';

export interface Transaction {
  id: string;
  type: TransactionType;
  assetId: string;
  assetName?: string;
  fromAddress?: string;
  toAddress?: string;
  amount: string;
  txHash?: string;
  blockNumber?: number;
  status: 'pending' | 'confirmed' | 'failed';
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface TransactionFilters {
  assetId?: string;
  partyId?: string;
  type?: TransactionType | TransactionType[];
  status?: Transaction['status'];
  dateFrom?: string;
  dateTo?: string;
}

export interface PaginationState {
  cursor?: string;
  hasMore: boolean;
  total: number;
  pageSize: number;
}

export interface UseTransactionHistoryReturn {
  /** List of fetched transactions */
  transactions: Transaction[];

  /** Current pagination state */
  pagination: PaginationState;

  /** Loading state */
  loading: boolean;

  /** Error state */
  error: Error | null;

  /** Load the next page of transactions */
  loadMore: () => Promise<void>;

  /** Reset cursor and refetch from start */
  refresh: () => Promise<void>;

  /** Update filters (triggers a refresh) */
  setFilters: (filters: TransactionFilters) => void;

  /** Current active filters */
  filters: TransactionFilters;
}

// ============================================================================
// HOOK
// ============================================================================

const DEFAULT_PAGE_SIZE = 25;

export function useTransactionHistory(
  initialFilters?: TransactionFilters,
  pageSize: number = DEFAULT_PAGE_SIZE,
): UseTransactionHistoryReturn {
  const { config, wallet } = useTokenisation();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [filters, setFiltersState] = useState<TransactionFilters>(initialFilters ?? {});
  const [pagination, setPagination] = useState<PaginationState>({
    hasMore: false,
    total: 0,
    pageSize,
  });
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

  // Build query string from filters and pagination cursor
  const buildQueryString = useCallback(
    (cursor?: string): string => {
      const params = new URLSearchParams();

      params.set('pageSize', String(pageSize));

      if (cursor) {
        params.set('cursor', cursor);
      }

      if (filters.assetId) {
        params.set('assetId', filters.assetId);
      }

      if (filters.partyId) {
        params.set('partyId', filters.partyId);
      }

      if (filters.type) {
        if (Array.isArray(filters.type)) {
          filters.type.forEach((t) => params.append('type', t));
        } else {
          params.set('type', filters.type);
        }
      }

      if (filters.status) {
        params.set('status', filters.status);
      }

      if (filters.dateFrom) {
        params.set('dateFrom', filters.dateFrom);
      }

      if (filters.dateTo) {
        params.set('dateTo', filters.dateTo);
      }

      return params.toString();
    },
    [filters, pageSize]
  );

  // Fetch transactions (optionally appending to existing list)
  const fetchTransactions = useCallback(
    async (cursor?: string, append: boolean = false) => {
      setLoading(true);
      setError(null);

      try {
        const queryString = buildQueryString(cursor);
        const result = await apiCall<{
          transactions: Transaction[];
          cursor?: string;
          hasMore: boolean;
          total: number;
        }>(`/api/v1/transactions?${queryString}`);

        if (append) {
          setTransactions((prev) => [...prev, ...result.transactions]);
        } else {
          setTransactions(result.transactions);
        }

        setPagination({
          cursor: result.cursor,
          hasMore: result.hasMore,
          total: result.total,
          pageSize,
        });
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
      } finally {
        setLoading(false);
      }
    },
    [apiCall, buildQueryString, pageSize]
  );

  // Load next page
  const loadMore = useCallback(async () => {
    if (!pagination.hasMore || loading) return;

    await fetchTransactions(pagination.cursor, true);
  }, [pagination.hasMore, pagination.cursor, loading, fetchTransactions]);

  // Refresh from start
  const refresh = useCallback(async () => {
    await fetchTransactions(undefined, false);
  }, [fetchTransactions]);

  // Set filters and trigger refresh
  const setFilters = useCallback((newFilters: TransactionFilters) => {
    setFiltersState(newFilters);
  }, []);

  // Auto-fetch on mount and when filters change
  useEffect(() => {
    fetchTransactions(undefined, false);
  }, [fetchTransactions]);

  return {
    transactions,
    pagination,
    loading,
    error,
    loadMore,
    refresh,
    setFilters,
    filters,
  };
}
