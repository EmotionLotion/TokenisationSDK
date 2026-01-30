/**
 * useConfig Hook - SDK Configuration Management
 *
 * Provides functionality for managing SDK configuration settings
 * including defaultCurrency, locale, and gasPreference. Syncs
 * with backend user/org profile settings.
 *
 * @example
 * ```tsx
 * function SettingsPanel() {
 *   const { config, updateConfig, resetConfig, loading } = useConfig();
 *
 *   const handleCurrencyChange = async (currency: string) => {
 *     await updateConfig({ defaultCurrency: currency });
 *   };
 *
 *   return (
 *     <div>
 *       <p>Currency: {config.defaultCurrency}</p>
 *       <p>Locale: {config.locale}</p>
 *       <p>Gas: {config.gasPreference}</p>
 *       <button onClick={resetConfig}>Reset to Defaults</button>
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

export interface SDKConfig {
  defaultCurrency: string;
  locale: string;
  gasPreference: 'low' | 'standard' | 'fast' | 'custom';
  customGasPrice?: string;
  slippageTolerance: number;
  autoApprove: boolean;
}

export interface UseConfigReturn {
  /** Current SDK configuration */
  config: SDKConfig;

  /** Get current configuration */
  getConfig: () => SDKConfig;

  /** Update configuration with partial values */
  updateConfig: (partial: Partial<SDKConfig>) => Promise<void>;

  /** Reset configuration to defaults */
  resetConfig: () => Promise<void>;

  /** Loading state */
  loading: boolean;

  /** Error state */
  error: Error | null;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const STORAGE_KEY = 'tokenisation-sdk-config';

const DEFAULT_CONFIG: SDKConfig = {
  defaultCurrency: 'USD',
  locale: 'en-US',
  gasPreference: 'standard',
  slippageTolerance: 0.5,
  autoApprove: false,
};

// ============================================================================
// HOOK
// ============================================================================

export function useConfig(): UseConfigReturn {
  const { config: sdkContext, wallet } = useTokenisation();

  const [sdkConfig, setSdkConfig] = useState<SDKConfig>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return { ...DEFAULT_CONFIG, ...JSON.parse(stored) };
      }
    } catch {
      // Ignore localStorage errors
    }
    return { ...DEFAULT_CONFIG };
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Helper for API calls
  const apiCall = useCallback(
    async <T>(endpoint: string, options?: RequestInit): Promise<T> => {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(sdkContext.orgId ? { 'X-Org-Id': sdkContext.orgId } : {}),
        ...(wallet?.address ? { 'X-Wallet-Address': wallet.address } : {}),
      };

      const response = await fetch(`${sdkContext.apiUrl}${endpoint}`, {
        ...options,
        headers: { ...headers, ...options?.headers },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `API error: ${response.status}`);
      }

      return response.json();
    },
    [sdkContext, wallet]
  );

  // Sync config to localStorage
  const persistConfig = useCallback((configToSave: SDKConfig) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(configToSave));
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  // Sync config to backend
  const syncToBackend = useCallback(
    async (configToSync: SDKConfig): Promise<void> => {
      try {
        await apiCall('/api/v1/config', {
          method: 'POST',
          body: JSON.stringify(configToSync),
        });
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        throw error;
      }
    },
    [apiCall]
  );

  // Load config from backend on mount
  useEffect(() => {
    if (!wallet?.address) return;

    let cancelled = false;

    const loadFromBackend = async () => {
      setLoading(true);
      setError(null);

      try {
        const result = await apiCall<{ config: Partial<SDKConfig> | null }>(
          '/api/v1/config'
        );

        if (!cancelled && result.config) {
          const merged = { ...DEFAULT_CONFIG, ...result.config };
          setSdkConfig(merged);
          persistConfig(merged);
        }
      } catch {
        // Backend config not available; keep local config
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadFromBackend();

    return () => {
      cancelled = true;
    };
  }, [wallet, apiCall, persistConfig]);

  // Get current config
  const getConfig = useCallback((): SDKConfig => {
    return { ...sdkConfig };
  }, [sdkConfig]);

  // Update config with partial values
  const updateConfig = useCallback(
    async (partial: Partial<SDKConfig>): Promise<void> => {
      setLoading(true);
      setError(null);

      try {
        const updated = { ...sdkConfig, ...partial };
        setSdkConfig(updated);
        persistConfig(updated);
        await syncToBackend(updated);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [sdkConfig, persistConfig, syncToBackend]
  );

  // Reset config to defaults
  const resetConfig = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      const defaults = { ...DEFAULT_CONFIG };
      setSdkConfig(defaults);
      persistConfig(defaults);
      await syncToBackend(defaults);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [persistConfig, syncToBackend]);

  return {
    config: sdkConfig,
    getConfig,
    updateConfig,
    resetConfig,
    loading,
    error,
  };
}
