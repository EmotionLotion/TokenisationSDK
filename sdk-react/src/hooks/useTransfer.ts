/**
 * useTransfer - Hook for transfer operations via TransfersModule.
 */

import { useState, useCallback } from 'react';
import { useTokenisation } from '../context/TokenisationContext.js';

// ============================================================================
// Types
// ============================================================================

export interface TransferData {
  id: string;
  tokenId: string;
  fromWallet: string;
  toWallet: string;
  amount: string;
  status: string;
  txHash?: string | null;
  createdAt: string;
  [key: string]: unknown;
}

export interface CreateTransferParams {
  tokenId: string;
  fromWallet: string;
  toWallet: string;
  amount: string;
  chainId?: number;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
}

export interface TransferPreflightResult {
  allowed: boolean;
  reasons?: string[];
  estimatedGas?: string;
}

export interface UseTransferReturn {
  create: (params: CreateTransferParams) => Promise<TransferData>;
  list: (params?: { tokenId?: string; status?: string; limit?: number; offset?: number }) => Promise<TransferData[]>;
  get: (transferId: string) => Promise<TransferData | null>;
  cancel: (transferId: string) => Promise<void>;
  retry: (transferId: string) => Promise<TransferData>;
  validate: (params: CreateTransferParams) => Promise<TransferPreflightResult>;
  preflight: (params: CreateTransferParams) => Promise<TransferPreflightResult>;
  getWalletHistory: (walletAddress: string, params?: { limit?: number }) => Promise<TransferData[]>;
  getTokenHistory: (tokenId: string, params?: { limit?: number }) => Promise<TransferData[]>;
  createBatch: (transfers: CreateTransferParams[]) => Promise<TransferData[]>;
  loading: boolean;
  error: Error | null;
}

// ============================================================================
// Hook
// ============================================================================

export function useTransfer(): UseTransferReturn {
  const { modules, api } = useTokenisation();
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
    (params: CreateTransferParams) =>
      wrapAsync(async () => {
        const result = await modules.transfers.create(params as any);
        return result as any;
      }),
    [modules.transfers, wrapAsync],
  );

  const list = useCallback(
    (params?: { tokenId?: string; status?: string; limit?: number; offset?: number }) =>
      wrapAsync(async () => {
        const result = await modules.transfers.list(params as any);
        return (result as any).data ?? [];
      }),
    [modules.transfers, wrapAsync],
  );

  const get = useCallback(
    (transferId: string) =>
      wrapAsync(async () => {
        const result = await modules.transfers.get(transferId);
        return (result as any) ?? null;
      }),
    [modules.transfers, wrapAsync],
  );

  const cancel = useCallback(
    (transferId: string) =>
      wrapAsync(async () => {
        await modules.transfers.cancel(transferId);
      }),
    [modules.transfers, wrapAsync],
  );

  const retry = useCallback(
    (transferId: string) =>
      wrapAsync(async () => {
        const result = await modules.transfers.retry(transferId);
        return result as any;
      }),
    [modules.transfers, wrapAsync],
  );

  const validate = useCallback(
    (params: CreateTransferParams) =>
      wrapAsync(async () => {
        const result = await (modules.transfers as any).validate(params);
        return result as any;
      }),
    [modules.transfers, wrapAsync],
  );

  const preflight = useCallback(
    (params: CreateTransferParams) =>
      wrapAsync(async () => {
        const result = await (modules.transfers as any).preflight(params);
        return result as any;
      }),
    [modules.transfers, wrapAsync],
  );

  const getWalletHistory = useCallback(
    (walletAddress: string, params?: { limit?: number }) =>
      wrapAsync(async () => {
        const result = await api.get<{ data: TransferData[] }>(
          `/api/v1/transfers/wallet/${walletAddress}`,
          params as any,
        );
        return result.data.data ?? [];
      }),
    [api, wrapAsync],
  );

  const getTokenHistory = useCallback(
    (tokenId: string, params?: { limit?: number }) =>
      wrapAsync(async () => {
        const result = await api.get<{ data: TransferData[] }>(
          `/api/v1/transfers/token/${tokenId}`,
          params as any,
        );
        return result.data.data ?? [];
      }),
    [api, wrapAsync],
  );

  const createBatch = useCallback(
    (transfers: CreateTransferParams[]) =>
      wrapAsync(async () => {
        const result = await api.post<{ data: TransferData[] }>(
          '/api/v1/transfers/batch',
          { transfers },
        );
        return result.data.data ?? [];
      }),
    [api, wrapAsync],
  );

  return {
    create, list, get, cancel, retry, validate, preflight,
    getWalletHistory, getTokenHistory, createBatch,
    loading, error,
  };
}
