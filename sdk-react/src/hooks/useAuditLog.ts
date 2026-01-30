/**
 * useAuditLog - Hook for fetching audit log entries (Gap 11).
 *
 * Retrieves paginated audit entries with filtering by action, resource type,
 * and date range. Supports cursor-based pagination and auto-refresh.
 *
 * @example
 * ```tsx
 * function AuditTrail() {
 *   const { entries, total, loading, loadMore, refresh } = useAuditLog(
 *     { action: 'transfer', startDate: '2025-01-01T00:00:00Z' },
 *     { autoRefresh: true, intervalMs: 30_000 },
 *   );
 *
 *   return (
 *     <div>
 *       <p>{total} entries</p>
 *       <ul>
 *         {entries.map((e) => (
 *           <li key={e.id}>{e.action} - {e.timestamp}</li>
 *         ))}
 *       </ul>
 *       <button onClick={loadMore} disabled={loading}>Load More</button>
 *     </div>
 *   );
 * }
 * ```
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTokenisation } from '../context/TokenisationContext.js';

// ============================================================================
// Types
// ============================================================================

export interface AuditEntry {
  id: string;
  action: string;
  actorId?: string;
  actorType?: string;
  resourceType?: string;
  resourceId?: string;
  orgId?: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
  ipAddress?: string;
}

export interface AuditLogFilters {
  /** Filter by action type (e.g. 'transfer', 'mint') */
  action?: string;
  /** Filter by resource type (e.g. 'token', 'investor') */
  resourceType?: string;
  /** Start date (ISO 8601) */
  startDate?: string;
  /** End date (ISO 8601) */
  endDate?: string;
  /** Filter by resource ID */
  resourceId?: string;
  /** Filter by actor ID */
  actorId?: string;
}

export interface UseAuditLogOptions {
  /** Page size (default: 25) */
  pageSize?: number;
  /** Enable automatic periodic refresh (default: false) */
  autoRefresh?: boolean;
  /** Refresh interval in milliseconds (default: 60000) */
  intervalMs?: number;
  /** Disable the hook entirely */
  disabled?: boolean;
}

export interface UseAuditLogReturn {
  /** Fetched audit entries (accumulated across pages) */
  entries: AuditEntry[];
  /** Total number of entries matching the filters */
  total: number;
  /** Whether a fetch is in progress */
  loading: boolean;
  /** Last error, if any */
  error: Error | null;
  /** Load the next page of results */
  loadMore: () => Promise<void>;
  /** Reset and refetch from the beginning */
  refresh: () => void;
}

// ============================================================================
// Hook
// ============================================================================

const DEFAULT_PAGE_SIZE = 25;
const DEFAULT_INTERVAL_MS = 60_000;

export function useAuditLog(
  filters?: AuditLogFilters,
  options?: UseAuditLogOptions,
): UseAuditLogReturn {
  const { api } = useTokenisation();

  const {
    pageSize = DEFAULT_PAGE_SIZE,
    autoRefresh = false,
    intervalMs = DEFAULT_INTERVAL_MS,
    disabled = false,
  } = options ?? {};

  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [offset, setOffset] = useState(0);

  const cancelledRef = useRef(false);

  // -------------------------------------------------------------------------
  // Build query params object
  // -------------------------------------------------------------------------

  const buildParams = useCallback(
    (currentOffset: number): Record<string, string> => {
      const params: Record<string, string> = {
        limit: String(pageSize),
        offset: String(currentOffset),
      };

      if (filters?.action) params.action = filters.action;
      if (filters?.resourceType) params.resourceType = filters.resourceType;
      if (filters?.resourceId) params.resourceId = filters.resourceId;
      if (filters?.actorId) params.actorId = filters.actorId;
      if (filters?.startDate) params.startDate = filters.startDate;
      if (filters?.endDate) params.endDate = filters.endDate;

      return params;
    },
    [filters, pageSize],
  );

  // -------------------------------------------------------------------------
  // Fetch
  // -------------------------------------------------------------------------

  const fetchEntries = useCallback(
    async (currentOffset: number, append: boolean) => {
      if (disabled) return;

      cancelledRef.current = false;

      setLoading(true);
      setError(null);

      try {
        const params = buildParams(currentOffset);
        const result = (await api.get<{ entries: AuditEntry[]; total: number }>(
          '/api/v1/audit',
          params,
        )).data;

        const newEntries = result.entries;
        const newTotal = result.total;

        if (!cancelledRef.current) {
          if (append) {
            setEntries((prev) => [...prev, ...newEntries]);
          } else {
            setEntries(newEntries);
          }
          setTotal(newTotal);
          setOffset(currentOffset + newEntries.length);
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
    },
    [disabled, api, buildParams],
  );

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  const loadMore = useCallback(async () => {
    if (loading || entries.length >= total) return;
    await fetchEntries(offset, true);
  }, [loading, entries.length, total, offset, fetchEntries]);

  const refresh = useCallback(() => {
    setOffset(0);
    setEntries([]);
    fetchEntries(0, false);
  }, [fetchEntries]);

  // Initial fetch on mount and when filters change
  useEffect(() => {
    setOffset(0);
    setEntries([]);
    fetchEntries(0, false);
  }, [fetchEntries]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh || disabled || intervalMs <= 0) return;

    const interval = setInterval(() => {
      fetchEntries(0, false);
    }, intervalMs);

    return () => clearInterval(interval);
  }, [autoRefresh, disabled, intervalMs, fetchEntries]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  return {
    entries,
    total,
    loading,
    error,
    loadMore,
    refresh,
  };
}
