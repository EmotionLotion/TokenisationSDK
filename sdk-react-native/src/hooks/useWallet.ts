/**
 * useWallet Hook
 *
 * Hook for wallet connection and management in React Native.
 * Provides WalletConnect integration for mobile apps.
 */

import { useCallback, useMemo } from 'react';
import { useTokenisation } from '../context/TokenisationProvider.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Wallet balance information
 */
export interface WalletBalance {
  /** Native token balance (e.g., ETH) */
  native: string;
  /** Native token symbol */
  nativeSymbol: string;
  /** Token balances */
  tokens: TokenBalance[];
}

/**
 * Individual token balance
 */
export interface TokenBalance {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  balance: string;
  balanceFormatted: string;
}

/**
 * Return type for useWallet hook
 */
export interface UseWalletReturn {
  // Connection state
  isConnected: boolean;
  isConnecting: boolean;
  address: string | null;
  shortAddress: string | null;
  chainId: number | null;
  chainName: string | null;
  error: Error | null;

  // Actions
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  switchChain: (chainId: number) => Promise<void>;
  signMessage: (message: string) => Promise<string>;

  // Utilities
  getBalance: () => Promise<WalletBalance>;
  isChainSupported: (chainId: number) => boolean;
}

// ============================================================================
// CHAIN CONFIGURATIONS
// ============================================================================

const CHAIN_NAMES: Record<number, string> = {
  1: 'Ethereum',
  5: 'Goerli',
  11155111: 'Sepolia',
  137: 'Polygon',
  80001: 'Mumbai',
  42161: 'Arbitrum',
  421613: 'Arbitrum Goerli',
  10: 'Optimism',
  420: 'Optimism Goerli',
  56: 'BNB Chain',
  97: 'BNB Testnet',
  43114: 'Avalanche',
  43113: 'Avalanche Fuji',
};

const NATIVE_SYMBOLS: Record<number, string> = {
  1: 'ETH',
  5: 'ETH',
  11155111: 'ETH',
  137: 'MATIC',
  80001: 'MATIC',
  42161: 'ETH',
  421613: 'ETH',
  10: 'ETH',
  420: 'ETH',
  56: 'BNB',
  97: 'BNB',
  43114: 'AVAX',
  43113: 'AVAX',
};

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

/**
 * Hook for wallet management
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const {
 *     isConnected,
 *     address,
 *     connect,
 *     disconnect,
 *   } = useWallet();
 *
 *   return (
 *     <View>
 *       {isConnected ? (
 *         <>
 *           <Text>Connected: {address}</Text>
 *           <Button onPress={disconnect} title="Disconnect" />
 *         </>
 *       ) : (
 *         <Button onPress={connect} title="Connect Wallet" />
 *       )}
 *     </View>
 *   );
 * }
 * ```
 */
export function useWallet(): UseWalletReturn {
  const {
    config,
    wallet,
    connectWallet,
    disconnectWallet,
    switchChain: switchChainBase,
    signMessage: signMessageBase,
  } = useTokenisation();

  // Format address for display
  const shortAddress = useMemo(() => {
    if (!wallet.address) return null;
    return `${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}`;
  }, [wallet.address]);

  // Get chain name
  const chainName = useMemo(() => {
    if (!wallet.chainId) return null;
    return CHAIN_NAMES[wallet.chainId] || `Chain ${wallet.chainId}`;
  }, [wallet.chainId]);

  // Check if chain is supported
  const isChainSupported = useCallback((chainId: number): boolean => {
    return config.supportedChains?.includes(chainId) ?? false;
  }, [config.supportedChains]);

  // Get wallet balance
  const getBalance = useCallback(async (): Promise<WalletBalance> => {
    if (!wallet.isConnected || !wallet.address || !wallet.chainId) {
      throw new Error('Wallet not connected');
    }

    // In a real implementation, this would:
    // 1. Query the RPC for native balance
    // 2. Query token contracts for ERC20 balances
    // For now, return mock data

    return {
      native: '0',
      nativeSymbol: NATIVE_SYMBOLS[wallet.chainId] || 'ETH',
      tokens: [],
    };
  }, [wallet.isConnected, wallet.address, wallet.chainId]);

  // Connect wrapper
  const connect = useCallback(async () => {
    await connectWallet();
  }, [connectWallet]);

  // Disconnect wrapper
  const disconnect = useCallback(async () => {
    await disconnectWallet();
  }, [disconnectWallet]);

  // Switch chain wrapper with validation
  const switchChain = useCallback(async (chainId: number) => {
    if (!isChainSupported(chainId)) {
      throw new Error(`Chain ${chainId} is not supported. Supported chains: ${config.supportedChains?.join(', ')}`);
    }
    await switchChainBase(chainId);
  }, [isChainSupported, switchChainBase, config.supportedChains]);

  // Sign message wrapper
  const signMessage = useCallback(async (message: string): Promise<string> => {
    return signMessageBase(message);
  }, [signMessageBase]);

  return {
    // State
    isConnected: wallet.isConnected,
    isConnecting: wallet.isConnecting,
    address: wallet.address,
    shortAddress,
    chainId: wallet.chainId,
    chainName,
    error: wallet.error,

    // Actions
    connect,
    disconnect,
    switchChain,
    signMessage,

    // Utilities
    getBalance,
    isChainSupported,
  };
}

export default useWallet;
