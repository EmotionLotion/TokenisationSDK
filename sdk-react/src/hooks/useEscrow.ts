/**
 * useEscrow - Hook for escrow operations via EscrowModule.
 */

import { useState, useCallback } from 'react';
import { useTokenisation } from '../context/TokenisationContext.js';

// ============================================================================
// Types
// ============================================================================

export interface EscrowData {
  id: string;
  type: string;
  status: string;
  amount: string;
  depositor: string;
  beneficiary: string;
  arbiter?: string;
  createdAt: string;
  [key: string]: unknown;
}

export interface UseEscrowReturn {
  createEscrow: (params: {
    type: string;
    amount: string;
    depositor: string;
    beneficiary: string;
    arbiter?: string;
    conditions?: any[];
    metadata?: Record<string, unknown>;
  }) => Promise<EscrowData>;
  getEscrow: (escrowId: string) => Promise<EscrowData | null>;
  listEscrows: (params?: { status?: string; limit?: number }) => Promise<EscrowData[]>;
  releaseEscrow: (escrowId: string) => Promise<EscrowData>;
  disputeEscrow: (escrowId: string, reason: string) => Promise<EscrowData>;
  loading: boolean;
  error: Error | null;
}

// ============================================================================
// Hook
// ============================================================================

export function useEscrow(): UseEscrowReturn {
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

  const createEscrow = useCallback(
    (params: {
      type: string; amount: string; depositor: string;
      beneficiary: string; arbiter?: string; conditions?: any[];
      metadata?: Record<string, unknown>;
    }) =>
      wrapAsync(async () => {
        const result = await modules.escrow.create(params as any);
        return (result as any).data;
      }),
    [modules.escrow, wrapAsync],
  );

  const getEscrow = useCallback(
    (escrowId: string) =>
      wrapAsync(async () => {
        const result = await modules.escrow.get(escrowId);
        return (result as any).data ?? null;
      }),
    [modules.escrow, wrapAsync],
  );

  const listEscrows = useCallback(
    (params?: { status?: string; limit?: number }) =>
      wrapAsync(async () => {
        const result = await modules.escrow.list(params as any);
        return (result as any).data ?? [];
      }),
    [modules.escrow, wrapAsync],
  );

  const releaseEscrow = useCallback(
    (escrowId: string) =>
      wrapAsync(async () => {
        const result = await modules.escrow.release(escrowId);
        return (result as any).data;
      }),
    [modules.escrow, wrapAsync],
  );

  const disputeEscrow = useCallback(
    (escrowId: string, reason: string) =>
      wrapAsync(async () => {
        const result = await modules.escrow.dispute(escrowId, { reason } as any);
        return (result as any).data;
      }),
    [modules.escrow, wrapAsync],
  );

  return {
    createEscrow, getEscrow, listEscrows, releaseEscrow, disputeEscrow,
    loading, error,
  };
}
