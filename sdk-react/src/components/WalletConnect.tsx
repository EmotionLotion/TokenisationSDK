/**
 * WalletConnect Component - Connect Wallet Button
 *
 * A ready-to-use button component for connecting wallets.
 *
 * @example
 * ```tsx
 * import { WalletConnect } from '@tokenisation/sdk-react/components';
 *
 * function Header() {
 *   return (
 *     <nav>
 *       <WalletConnect
 *         onConnect={(wallet) => console.log('Connected:', wallet)}
 *         onDisconnect={() => console.log('Disconnected')}
 *       />
 *     </nav>
 *   );
 * }
 * ```
 */

import React, { useState, useCallback } from 'react';
import { useWallet } from '../hooks/useWallet.js';
import type { WalletConnection, WalletConnectOptions } from '../types/index.js';

// ============================================================================
// TYPES
// ============================================================================

export interface WalletConnectProps {
  /** Callback when wallet connects */
  onConnect?: (wallet: WalletConnection) => void;
  /** Callback when wallet disconnects */
  onDisconnect?: () => void;
  /** Callback on error */
  onError?: (error: Error) => void;
  /** Connection options */
  options?: WalletConnectOptions;
  /** Custom connect button text */
  connectText?: string;
  /** Custom disconnect button text */
  disconnectText?: string;
  /** Show address when connected */
  showAddress?: boolean;
  /** Show balance when connected */
  showBalance?: boolean;
  /** Custom class name */
  className?: string;
  /** Custom styles */
  style?: React.CSSProperties;
  /** Custom button styles */
  buttonStyle?: React.CSSProperties;
  /** Disabled state */
  disabled?: boolean;
  /** Render custom connected state */
  renderConnected?: (props: {
    address: string;
    balance: string | null;
    ensName: string | null;
    disconnect: () => void;
  }) => React.ReactNode;
  /** Render custom disconnected state */
  renderDisconnected?: (props: {
    connect: () => void;
    loading: boolean;
  }) => React.ReactNode;
}

// ============================================================================
// DEFAULT STYLES
// ============================================================================

const defaultStyles: Record<string, React.CSSProperties> = {
  container: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
  },
  button: {
    padding: '10px 20px',
    fontSize: '14px',
    fontWeight: 500,
    borderRadius: '8px',
    border: 'none',
    cursor: 'pointer',
    backgroundColor: '#3b82f6',
    color: 'white',
    transition: 'background-color 0.2s',
  },
  buttonDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },
  buttonHover: {
    backgroundColor: '#2563eb',
  },
  address: {
    fontFamily: 'monospace',
    fontSize: '14px',
    color: '#374151',
  },
  balance: {
    fontSize: '12px',
    color: '#6b7280',
  },
  connectedContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '8px 16px',
    backgroundColor: '#f3f4f6',
    borderRadius: '8px',
  },
};

// ============================================================================
// HELPERS
// ============================================================================

function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function WalletConnect({
  onConnect,
  onDisconnect,
  onError,
  options: _options,
  connectText = 'Connect Wallet',
  disconnectText = 'Disconnect',
  showAddress = true,
  showBalance = true,
  className,
  style,
  buttonStyle,
  disabled,
  renderConnected,
  renderDisconnected,
}: WalletConnectProps) {
  const {
    address,
    balance,
    ensName,
    isConnected,
    connect,
    disconnect,
    loading,
    error,
  } = useWallet();

  const [isHovered, setIsHovered] = useState(false);

  // Handle connect
  const handleConnect = useCallback(async () => {
    try {
      await connect();
      if (address) {
        onConnect?.({
          address,
          chainId: 0, // Will be updated by context
          provider: 'unknown',
          isConnected: true,
        });
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      onError?.(error);
    }
  }, [connect, address, onConnect, onError]);

  // Handle disconnect
  const handleDisconnect = useCallback(async () => {
    try {
      await disconnect();
      onDisconnect?.();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      onError?.(error);
    }
  }, [disconnect, onDisconnect, onError]);

  // Render connected state
  if (isConnected && address) {
    if (renderConnected) {
      return (
        <div className={className} style={style}>
          {renderConnected({
            address,
            balance,
            ensName,
            disconnect: handleDisconnect,
          })}
        </div>
      );
    }

    return (
      <div
        className={className}
        style={{ ...defaultStyles.container, ...style }}
      >
        <div style={defaultStyles.connectedContainer}>
          {showAddress && (
            <span style={defaultStyles.address}>
              {ensName || truncateAddress(address)}
            </span>
          )}
          {showBalance && balance && (
            <span style={defaultStyles.balance}>{balance} ETH</span>
          )}
          <button
            onClick={handleDisconnect}
            disabled={loading || disabled}
            style={{
              ...defaultStyles.button,
              backgroundColor: '#6b7280',
              padding: '6px 12px',
              fontSize: '12px',
              ...(loading || disabled ? defaultStyles.buttonDisabled : {}),
              ...buttonStyle,
            }}
          >
            {disconnectText}
          </button>
        </div>
      </div>
    );
  }

  // Render disconnected state
  if (renderDisconnected) {
    return (
      <div className={className} style={style}>
        {renderDisconnected({
          connect: handleConnect,
          loading,
        })}
      </div>
    );
  }

  return (
    <div className={className} style={{ ...defaultStyles.container, ...style }}>
      <button
        onClick={handleConnect}
        disabled={loading || disabled}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{
          ...defaultStyles.button,
          ...(isHovered && !disabled && !loading ? defaultStyles.buttonHover : {}),
          ...(loading || disabled ? defaultStyles.buttonDisabled : {}),
          ...buttonStyle,
        }}
      >
        {loading ? 'Connecting...' : connectText}
      </button>
      {error && (
        <span style={{ color: '#ef4444', fontSize: '12px' }}>{error.message}</span>
      )}
    </div>
  );
}
