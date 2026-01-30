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
import { useTokenisation } from '../context/index.js';

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
  const { config, wallet } = useTokenisation();

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

  const abortRef = useRef<AbortController | null>(null);

  // -------------------------------------------------------------------------
  // Build query string
  // -------------------------------------------------------------------------

  const buildQuery = useCallback(
    (currentOffset: number): string => {
      const params = new URLSearchParams();
      params.set('limit', String(pageSize));
      params.set('offset', String(currentOffset));

      if (filters?.action) params.set('action', filters.action);
      if (filters?.resourceType) params.set('resourceType', filters.resourceType);
      if (filters?.resourceId) params.set('resourceId', filters.resourceId);
      if (filters?.actorId) params.set('actorId', filters.actorId);
      if (filters?.startDate) params.set('startDate', filters.startDate);
      if (filters?.endDate) params.set('endDate', filters.endDate);

      return params.toString();
    },
    [filters, pageSize],
  );

  // -------------------------------------------------------------------------
  // Fetch
  // -------------------------------------------------------------------------

  const fetchEntries = useCallback(
    async (currentOffset: number, append: boolean) => {
      if (disabled || !config.apiUrl) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      setError(null);

      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (config.orgId) headers['X-Org-Id'] = config.orgId;
        if (wallet?.address) headers['X-Wallet-Address'] = wallet.address;

        const qs = buildQuery(currentOffset);
        const response = await fetch(`${config.apiUrl}/api/v1/audit?${qs}`, {
          headers,
          signal: controller.signal,
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || `Failed to fetch audit log: ${response.status}`);
        }

        const json = await response.json();
        const newEntries: AuditEntry[] = json.data?.entries ?? json.entries ?? json.data ?? [];
        const newTotal: number = json.data?.total ?? json.total ?? 0;

        if (!controller.signal.aborted) {
          if (append) {
            setEntries((prev) => [...prev, ...newEntries]);
          } else {
            setEntries(newEntries);
          }
          setTotal(newTotal);
          setOffset(currentOffset + newEntries.length);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        const e = err instanceof Error ? err : new Error(String(err));
        if (!controller.signal.aborted) {
          setError(e);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    },
    [disabled, config.apiUrl, config.orgId, wallet?.address, buildQuery],
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
      abortRef.current?.abort();
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
