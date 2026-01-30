/**
 * useDLD - Hook for Dubai Land Department operations via DLDModule.
 */

import { useState, useCallback } from 'react';
import { useTokenisation } from '../context/TokenisationContext.js';

// ============================================================================
// Types
// ============================================================================

export interface TitleDeedData {
  id: string;
  externalTitleDeedId: string;
  assetId?: string | null;
  status: string;
  snapshot: Record<string, unknown>;
  flags: string[];
  lastSyncAt?: string | null;
  [key: string]: unknown;
}

export interface UseDLDReturn {
  registerTitle: (params: { externalTitleDeedId: string; assetId?: string; metadata?: Record<string, unknown> }) => Promise<TitleDeedData>;
  verifyTitle: (titleId: string) => Promise<TitleDeedData>;
  getTitle: (titleId: string) => Promise<TitleDeedData | null>;
  listTitles: (params?: { status?: string; assetId?: string; limit?: number }) => Promise<TitleDeedData[]>;
  loading: boolean;
  error: Error | null;
}

// ============================================================================
// Hook
// ============================================================================

export function useDLD(): UseDLDReturn {
  const { modules } = useTokenisation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const wrapAsync = useCallback(
    async <T>(fn: () => Promise<T>): Promise<T> => {
      setLoading(true);
      setError(null);
      try {
        return await fn();
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        setError(e);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const registerTitle = useCallback(
    (params: { externalTitleDeedId: string; assetId?: string; metadata?: Record<string, unknown> }) =>
      wrapAsync(async () => {
        const result = await modules.dld.verify(params as any);
        return result as any;
      }),
    [modules.dld, wrapAsync],
  );

  const verifyTitle = useCallback(
    (titleId: string) =>
      wrapAsync(async () => {
        const result = await modules.dld.getTitleDeed(titleId);
        return result as any;
      }),
    [modules.dld, wrapAsync],
  );

  const getTitle = useCallback(
    (titleId: string) =>
      wrapAsync(async () => {
        const result = await modules.dld.getProperty(titleId);
        return result as any;
      }),
    [modules.dld, wrapAsync],
  );

  const listTitles = useCallback(
    (params?: { status?: string; assetId?: string; limit?: number }) =>
      wrapAsync(async () => {
        const result = await modules.dld.searchProperties(params as any);
        return (result as any).data ?? [];
      }),
    [modules.dld, wrapAsync],
  );

  return {
    registerTitle, verifyTitle, getTitle, listTitles,
    loading, error,
  };
}
