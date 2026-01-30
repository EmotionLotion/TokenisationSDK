/**
 * useProject - Hook for project management via ProjectsModule.
 */

import { useState, useCallback } from 'react';
import { useTokenisation } from '../context/TokenisationContext.js';

// ============================================================================
// Types
// ============================================================================

export interface ProjectData {
  id: string;
  name: string;
  description?: string | null;
  jurisdiction: string;
  assetType: string;
  status: string;
  settings: Record<string, unknown>;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}

export interface UseProjectReturn {
  create: (params: { name: string; description?: string; jurisdiction: string; assetType: string; metadata?: Record<string, unknown> }) => Promise<ProjectData>;
  get: (projectId: string) => Promise<ProjectData | null>;
  list: (params?: { status?: string; limit?: number; offset?: number }) => Promise<ProjectData[]>;
  update: (projectId: string, params: { name?: string; description?: string; status?: string; metadata?: Record<string, unknown> }) => Promise<ProjectData>;
  loading: boolean;
  error: Error | null;
}

// ============================================================================
// Hook
// ============================================================================

export function useProject(): UseProjectReturn {
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

  const create = useCallback(
    (params: { name: string; description?: string; jurisdiction: string; assetType: string; metadata?: Record<string, unknown> }) =>
      wrapAsync(async () => {
        const result = await modules.projects.create(params as any);
        return (result as any).data;
      }),
    [modules.projects, wrapAsync],
  );

  const get = useCallback(
    (projectId: string) =>
      wrapAsync(async () => {
        const result = await modules.projects.get(projectId);
        return (result as any).data ?? null;
      }),
    [modules.projects, wrapAsync],
  );

  const list = useCallback(
    (params?: { status?: string; limit?: number; offset?: number }) =>
      wrapAsync(async () => {
        const result = await modules.projects.list(params as any);
        return (result as any).data ?? [];
      }),
    [modules.projects, wrapAsync],
  );

  const update = useCallback(
    (projectId: string, params: { name?: string; description?: string; status?: string; metadata?: Record<string, unknown> }) =>
      wrapAsync(async () => {
        const result = await modules.projects.update(projectId, params as any);
        return (result as any).data;
      }),
    [modules.projects, wrapAsync],
  );

  return {
    create, get, list, update,
    loading, error,
  };
}
