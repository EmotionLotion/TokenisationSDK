/**
 * useGasEstimate - React hook for real-time gas estimation.
 *
 * Fetches gas estimates from the server, auto-refreshes every 15 seconds,
 * and debounces rapid parameter changes.
 *
 * @example
 * ```tsx
 * function TransferConfirm({ chainId }: { chainId: number }) {
 *   const { estimate, isLoading, error } = useGasEstimate({
 *     chainId,
 *     operation: 'transfer',
 *   });
 *
 *   if (isLoading) return <span>Estimating fee...</span>;
 *   if (error) return <span>Fee estimation unavailable</span>;
 *   return <span>Estimated fee: {estimate?.displayCost}</span>;
 * }
 * ```
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTokenisation } from '../context/TokenisationContext.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GasOperation = 'mint' | 'transfer' | 'redeem' | 'approve';

export interface GasEstimateResult {
  chainId: number;
  chainName: string;
  nativeSymbol: string;
  gasLimit: string;
  gasPrice: string;
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
  estimatedCostWei: string;
  estimatedCostNative: string;
  displayCost: string;
  gasPriceGwei: string;
  cached: boolean;
  timestamp: string;
}

export interface UseGasEstimateOptions {
  /** Chain ID to estimate for */
  chainId: number;
  /** Operation type (default: 'transfer') */
  operation?: GasOperation;
  /** Contract address for more accurate estimates */
  contractAddress?: string;
  /** Auto-refresh interval in ms (default: 15000). Set 0 to disable. */
  refreshInterval?: number;
  /** Disable the hook (no fetching) */
  disabled?: boolean;
}

export interface UseGasEstimateReturn {
  /** The current gas estimate */
  estimate: GasEstimateResult | null;
  /** Whether a fetch is in progress */
  isLoading: boolean;
  /** Last error, if any */
  error: Error | null;
  /** Manually trigger a refresh */
  refresh: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_REFRESH_INTERVAL = 15_000;
const DEBOUNCE_MS = 500;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useGasEstimate(options: UseGasEstimateOptions): UseGasEstimateReturn {
  const { api, isInitialized } = useTokenisation();

  const [estimate, setEstimate] = useState<GasEstimateResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);

  const {
    chainId,
    operation = 'transfer',
    contractAddress,
    refreshInterval = DEFAULT_REFRESH_INTERVAL,
    disabled = false,
  } = options;

  const fetchEstimate = useCallback(async () => {
    if (!isInitialized || disabled || !chainId) return;

    cancelledRef.current = false;

    setIsLoading(true);
    setError(null);

    try {
      const params: Record<string, string> = {
        chainId: String(chainId),
        operation,
      };
      if (contractAddress) params.to = contractAddress;

      const response = await api.get<{
        chainId: number;
        chainName: string;
        nativeSymbol: string;
        gasLimit: string;
        gasPrice: string;
        maxFeePerGas: string;
        maxPriorityFeePerGas: string;
        estimatedCostWei: string;
        estimatedCostNative: string;
        timestamp: string;
        cached?: boolean;
      }>('/api/v1/gas/estimate', params);

      const data = response.data;

      const result: GasEstimateResult = {
        chainId: data.chainId,
        chainName: data.chainName,
        nativeSymbol: data.nativeSymbol,
        gasLimit: data.gasLimit,
        gasPrice: data.gasPrice,
        maxFeePerGas: data.maxFeePerGas,
        maxPriorityFeePerGas: data.maxPriorityFeePerGas,
        estimatedCostWei: data.estimatedCostWei,
        estimatedCostNative: data.estimatedCostNative,
        displayCost: `${data.estimatedCostNative} ${data.nativeSymbol}`,
        gasPriceGwei: weiToGwei(data.gasPrice),
        cached: data.cached ?? false,
        timestamp: data.timestamp,
      };

      if (!cancelledRef.current) {
        setEstimate(result);
      }
    } catch (err) {
      if (cancelledRef.current) return;
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
    } finally {
      if (!cancelledRef.current) {
        setIsLoading(false);
      }
    }
  }, [isInitialized, disabled, api, chainId, operation, contractAddress]);

  // Debounced fetch on param changes
  useEffect(() => {
    if (disabled) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      fetchEstimate();
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [fetchEstimate, disabled]);

  // Auto-refresh interval
  useEffect(() => {
    if (disabled || refreshInterval <= 0) return;

    const interval = setInterval(() => {
      fetchEstimate();
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [fetchEstimate, refreshInterval, disabled]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  return {
    estimate,
    isLoading,
    error,
    refresh: fetchEstimate,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function weiToGwei(wei: string): string {
  try {
    const value = BigInt(wei);
    const gwei = Number(value) / 1e9;
    return gwei.toFixed(2);
  } catch {
    return '0.00';
  }
}
