/**
 * WalletRegistry Component - Wallet Binding Management
 *
 * Links browser/hardware wallets to verified on-chain identities.
 * Manages multiple wallet bindings per party with primary selection.
 *
 * @example
 * ```tsx
 * import { WalletRegistry } from '@tokenisation/sdk-react/components';
 *
 * function WalletManagement() {
 *   return (
 *     <WalletRegistry
 *       partyId="party-123"
 *       onBind={(binding) => console.log('Bound:', binding)}
 *       onUnbind={(addr) => console.log('Unbound:', addr)}
 *       maxWallets={5}
 *     />
 *   );
 * }
 * ```
 *
 * @example Render prop usage
 * ```tsx
 * <WalletRegistry partyId="party-123">
 *   {({ bindings, bind, unbind, loading }) => (
 *     <div>
 *       {bindings.map(b => <span key={b.id}>{b.walletAddress}</span>)}
 *       <button onClick={bind}>Bind Current Wallet</button>
 *     </div>
 *   )}
 * </WalletRegistry>
 * ```
 */

import React, { useState, useCallback, useEffect, type ReactNode } from 'react';
import { useTokenisation } from '../context/TokenisationContext.js';
import type { WalletConnection, WalletProvider, WalletConnectOptions, Party, KYCStatus } from '../types/index.js';

// ============================================================================
// TYPES
// ============================================================================

export interface WalletBinding {
  id: string;
  walletAddress: string;
  provider: string;
  chainId: number;
  partyId: string;
  label?: string;
  isPrimary: boolean;
  boundAt: string;
  lastUsed: string;
}

export interface WalletRegistryProps {
  partyId?: string;
  onBind?: (binding: WalletBinding) => void;
  onUnbind?: (walletAddress: string) => void;
  maxWallets?: number;
  children?: (state: WalletRegistryState) => ReactNode;
}

export interface WalletRegistryState {
  bindings: WalletBinding[];
  bind: (label?: string) => Promise<void>;
  unbind: (walletAddress: string) => Promise<void>;
  setPrimary: (walletAddress: string) => Promise<void>;
  loading: boolean;
  error: Error | null;
}

export interface UseWalletRegistryReturn {
  bindings: WalletBinding[];
  bind: (label?: string) => Promise<void>;
  unbind: (walletAddress: string) => Promise<void>;
  setPrimary: (walletAddress: string) => Promise<void>;
  loading: boolean;
  error: Error | null;
}

// ============================================================================
// DEFAULT STYLES
// ============================================================================

const defaultStyles: Record<string, React.CSSProperties> = {
  container: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    maxWidth: '480px',
  },
  heading: {
    fontSize: '16px',
    fontWeight: 600,
    marginBottom: '12px',
    color: '#111827',
  },
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  },
  listItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 12px',
    backgroundColor: '#f9fafb',
    borderRadius: '6px',
    border: '1px solid #e5e7eb',
  },
  listItemPrimary: {
    borderColor: '#3b82f6',
    backgroundColor: '#eff6ff',
  },
  addressInfo: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '2px',
  },
  address: {
    fontFamily: 'monospace',
    fontSize: '13px',
    color: '#374151',
  },
  label: {
    fontSize: '12px',
    color: '#6b7280',
  },
  primaryBadge: {
    fontSize: '11px',
    fontWeight: 600,
    color: '#3b82f6',
    backgroundColor: '#dbeafe',
    padding: '2px 6px',
    borderRadius: '4px',
    marginLeft: '6px',
  },
  actions: {
    display: 'flex',
    gap: '6px',
    alignItems: 'center',
  },
  smallButton: {
    padding: '4px 8px',
    fontSize: '12px',
    borderRadius: '4px',
    border: '1px solid #d1d5db',
    backgroundColor: 'white',
    cursor: 'pointer',
    color: '#374151',
  },
  removeButton: {
    padding: '4px 8px',
    fontSize: '12px',
    borderRadius: '4px',
    border: '1px solid #fca5a5',
    backgroundColor: '#fef2f2',
    cursor: 'pointer',
    color: '#dc2626',
  },
  bindButton: {
    marginTop: '12px',
    padding: '10px 20px',
    fontSize: '14px',
    fontWeight: 500,
    borderRadius: '8px',
    border: 'none',
    cursor: 'pointer',
    backgroundColor: '#3b82f6',
    color: 'white',
    width: '100%',
  },
  bindButtonDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },
  errorText: {
    color: '#dc2626',
    fontSize: '13px',
    marginTop: '8px',
  },
  emptyText: {
    fontSize: '14px',
    color: '#6b7280',
    padding: '16px 0',
    textAlign: 'center' as const,
  },
  labelInput: {
    display: 'flex',
    gap: '8px',
    marginTop: '8px',
  },
  input: {
    flex: 1,
    padding: '8px 10px',
    fontSize: '13px',
    borderRadius: '6px',
    border: '1px solid #d1d5db',
    outline: 'none',
  },
};

// ============================================================================
// HELPERS
// ============================================================================

function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// ============================================================================
// HOOK
// ============================================================================

export function useWalletRegistry(partyId?: string): UseWalletRegistryReturn {
  const { config, wallet, currentParty } = useTokenisation();

  const resolvedPartyId = partyId || currentParty?.id;

  const [bindings, setBindings] = useState<WalletBinding[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Helper for API calls
  const apiCall = useCallback(
    async <T,>(endpoint: string, options?: RequestInit): Promise<T> => {
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

  // Fetch bindings
  const fetchBindings = useCallback(async () => {
    if (!resolvedPartyId) return;

    setLoading(true);
    setError(null);

    try {
      const result = await apiCall<{ bindings: WalletBinding[] }>(
        `/api/v1/wallets/bindings?partyId=${encodeURIComponent(resolvedPartyId)}`
      );
      setBindings(result.bindings || []);
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      setBindings([]);
    } finally {
      setLoading(false);
    }
  }, [resolvedPartyId, apiCall]);

  // Fetch on mount and when partyId changes
  useEffect(() => {
    fetchBindings();
  }, [fetchBindings]);

  // Bind current wallet
  const bind = useCallback(
    async (label?: string): Promise<void> => {
      if (!wallet?.isConnected || !wallet.address) {
        throw new Error('Wallet is not connected. Please connect a wallet first.');
      }

      if (!resolvedPartyId) {
        throw new Error('No party ID available. Please complete identity verification first.');
      }

      if (!currentParty) {
        throw new Error('No party record found. Please complete KYC verification first.');
      }

      const kycStatus = currentParty.kycStatus as KYCStatus | undefined;
      if (kycStatus && kycStatus !== 'approved') {
        throw new Error(
          `KYC verification is required before binding a wallet. Current status: ${kycStatus}`
        );
      }

      setLoading(true);
      setError(null);

      try {
        const result = await apiCall<{ binding: WalletBinding }>(
          '/api/v1/wallets/bind',
          {
            method: 'POST',
            body: JSON.stringify({
              walletAddress: wallet.address,
              provider: wallet.provider,
              chainId: wallet.chainId,
              partyId: resolvedPartyId,
              label,
            }),
          }
        );

        setBindings((prev) => [...prev, result.binding]);
        return;
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        setError(e);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [wallet, resolvedPartyId, currentParty, apiCall]
  );

  // Unbind a wallet
  const unbind = useCallback(
    async (walletAddress: string): Promise<void> => {
      setLoading(true);
      setError(null);

      try {
        await apiCall<{ success: boolean }>(
          `/api/v1/wallets/bind/${encodeURIComponent(walletAddress)}`,
          { method: 'DELETE' }
        );

        setBindings((prev) => prev.filter((b) => b.walletAddress !== walletAddress));
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        setError(e);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [apiCall]
  );

  // Set a wallet as primary
  const setPrimary = useCallback(
    async (walletAddress: string): Promise<void> => {
      setLoading(true);
      setError(null);

      try {
        await apiCall<{ success: boolean }>(
          `/api/v1/wallets/bind/${encodeURIComponent(walletAddress)}/primary`,
          { method: 'PUT' }
        );

        setBindings((prev) =>
          prev.map((b) => ({
            ...b,
            isPrimary: b.walletAddress === walletAddress,
          }))
        );
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        setError(e);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [apiCall]
  );

  return { bindings, bind, unbind, setPrimary, loading, error };
}

// ============================================================================
// COMPONENT
// ============================================================================

export function WalletRegistry({
  partyId,
  onBind,
  onUnbind,
  maxWallets = 5,
  children,
}: WalletRegistryProps) {
  const { wallet, currentParty } = useTokenisation();
  const { bindings, bind, unbind, setPrimary, loading, error } = useWalletRegistry(partyId);

  const [labelInput, setLabelInput] = useState('');
  const [showLabelInput, setShowLabelInput] = useState(false);
  const [localError, setLocalError] = useState<Error | null>(null);

  const displayError = localError || error;
  const canBind =
    wallet?.isConnected &&
    wallet.address &&
    currentParty?.kycStatus === 'approved' &&
    bindings.length < maxWallets &&
    !bindings.some((b) => b.walletAddress === wallet.address);

  // Handle bind
  const handleBind = useCallback(
    async (label?: string) => {
      setLocalError(null);
      try {
        await bind(label);
        setShowLabelInput(false);
        setLabelInput('');

        // Notify parent -- find the newly added binding
        if (onBind && wallet?.address) {
          const newBinding = bindings.find((b) => b.walletAddress === wallet.address);
          if (newBinding) {
            onBind(newBinding);
          }
        }
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        setLocalError(e);
      }
    },
    [bind, onBind, wallet, bindings]
  );

  // Handle unbind
  const handleUnbind = useCallback(
    async (walletAddress: string) => {
      setLocalError(null);
      try {
        await unbind(walletAddress);
        onUnbind?.(walletAddress);
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        setLocalError(e);
      }
    },
    [unbind, onUnbind]
  );

  // Handle set primary
  const handleSetPrimary = useCallback(
    async (walletAddress: string) => {
      setLocalError(null);
      try {
        await setPrimary(walletAddress);
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        setLocalError(e);
      }
    },
    [setPrimary]
  );

  // Render prop path
  const state: WalletRegistryState = {
    bindings,
    bind: handleBind,
    unbind: handleUnbind,
    setPrimary: handleSetPrimary,
    loading,
    error: displayError,
  };

  if (children) {
    return <>{children(state)}</>;
  }

  // Default UI
  return (
    <div style={defaultStyles.container}>
      <div style={defaultStyles.heading}>Bound Wallets</div>

      {bindings.length === 0 && !loading && (
        <div style={defaultStyles.emptyText}>No wallets bound yet.</div>
      )}

      {bindings.length > 0 && (
        <div style={defaultStyles.list}>
          {bindings.map((binding) => (
            <div
              key={binding.id}
              style={{
                ...defaultStyles.listItem,
                ...(binding.isPrimary ? defaultStyles.listItemPrimary : {}),
              }}
            >
              <div style={defaultStyles.addressInfo}>
                <span style={defaultStyles.address}>
                  {truncateAddress(binding.walletAddress)}
                  {binding.isPrimary && (
                    <span style={defaultStyles.primaryBadge}>Primary</span>
                  )}
                </span>
                <span style={defaultStyles.label}>
                  {binding.label || binding.provider} &middot; Chain {binding.chainId}
                </span>
              </div>
              <div style={defaultStyles.actions}>
                {!binding.isPrimary && (
                  <button
                    style={defaultStyles.smallButton}
                    onClick={() => handleSetPrimary(binding.walletAddress)}
                    disabled={loading}
                  >
                    Set Primary
                  </button>
                )}
                <button
                  style={defaultStyles.removeButton}
                  onClick={() => handleUnbind(binding.walletAddress)}
                  disabled={loading}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {!showLabelInput && (
        <button
          style={{
            ...defaultStyles.bindButton,
            ...(!canBind || loading ? defaultStyles.bindButtonDisabled : {}),
          }}
          disabled={!canBind || loading}
          onClick={() => setShowLabelInput(true)}
        >
          {loading
            ? 'Processing...'
            : !wallet?.isConnected
              ? 'Connect Wallet to Bind'
              : currentParty?.kycStatus !== 'approved'
                ? 'Complete KYC to Bind'
                : bindings.length >= maxWallets
                  ? `Max Wallets Reached (${maxWallets})`
                  : bindings.some((b) => b.walletAddress === wallet?.address)
                    ? 'Wallet Already Bound'
                    : 'Bind Current Wallet'}
        </button>
      )}

      {showLabelInput && (
        <div style={defaultStyles.labelInput}>
          <input
            style={defaultStyles.input}
            type="text"
            placeholder="Label (optional, e.g. 'Hardware Wallet')"
            value={labelInput}
            onChange={(e) => setLabelInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleBind(labelInput || undefined);
              }
            }}
          />
          <button
            style={{ ...defaultStyles.smallButton, backgroundColor: '#3b82f6', color: 'white', border: 'none' }}
            onClick={() => handleBind(labelInput || undefined)}
            disabled={loading}
          >
            {loading ? '...' : 'Bind'}
          </button>
          <button
            style={defaultStyles.smallButton}
            onClick={() => {
              setShowLabelInput(false);
              setLabelInput('');
            }}
            disabled={loading}
          >
            Cancel
          </button>
        </div>
      )}

      {displayError && (
        <div style={defaultStyles.errorText}>{displayError.message}</div>
      )}

      {bindings.length > 0 && (
        <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '8px' }}>
          {bindings.length} of {maxWallets} wallet{maxWallets !== 1 ? 's' : ''} bound
        </div>
      )}
    </div>
  );
}
