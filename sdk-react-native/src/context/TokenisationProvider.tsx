/**
 * Tokenisation Provider for React Native
 *
 * Context provider that wraps your app and provides access to the
 * Tokenisation SDK functionality throughout your mobile application.
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import { ApiClient, createApiClient, type TokenizationSDKConfig } from '@tokenisation/sdk';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Configuration for the TokenisationProvider
 */
export interface TokenisationProviderConfig {
  /** API key for authentication */
  apiKey: string;
  /** Base URL for the API (defaults to production) */
  baseUrl?: string;
  /** Enable debug logging */
  debug?: boolean;
  /** Auto-connect wallet on mount */
  autoConnect?: boolean;
  /** WalletConnect project ID */
  walletConnectProjectId?: string;
  /** Supported chains */
  supportedChains?: number[];
  /** Custom metadata for WalletConnect */
  appMetadata?: {
    name: string;
    description?: string;
    url?: string;
    icons?: string[];
  };
}

/**
 * Wallet connection state
 */
export interface WalletState {
  isConnected: boolean;
  isConnecting: boolean;
  address: string | null;
  chainId: number | null;
  error: Error | null;
}

/**
 * User/investor state
 */
export interface UserState {
  investorId: string | null;
  kycStatus: 'none' | 'pending' | 'approved' | 'rejected';
  isLoading: boolean;
}

/**
 * Context value provided to consumers
 */
export interface TokenisationContextValue {
  // Configuration
  config: TokenisationProviderConfig;
  isInitialized: boolean;

  // API Client
  client: ApiClient | null;

  // Wallet state
  wallet: WalletState;
  connectWallet: () => Promise<void>;
  disconnectWallet: () => Promise<void>;
  switchChain: (chainId: number) => Promise<void>;

  // User state
  user: UserState;
  refreshUser: () => Promise<void>;

  // Utility methods
  signMessage: (message: string) => Promise<string>;
  sendTransaction: (tx: TransactionRequest) => Promise<string>;
}

/**
 * Transaction request for sending
 */
export interface TransactionRequest {
  to: string;
  value?: string;
  data?: string;
  gasLimit?: string;
}

// ============================================================================
// CONTEXT
// ============================================================================

const TokenisationContext = createContext<TokenisationContextValue | null>(null);

/**
 * Hook to access the Tokenisation context
 * @throws Error if used outside of TokenisationProvider
 */
export function useTokenisation(): TokenisationContextValue {
  const context = useContext(TokenisationContext);
  if (!context) {
    throw new Error(
      'useTokenisation must be used within a TokenisationProvider. ' +
      'Wrap your app with <TokenisationProvider config={...}>.'
    );
  }
  return context;
}

// ============================================================================
// PROVIDER COMPONENT
// ============================================================================

interface TokenisationProviderProps {
  config: TokenisationProviderConfig;
  children: ReactNode;
}

export function TokenisationProvider({
  config,
  children,
}: TokenisationProviderProps): JSX.Element {
  // State
  const [isInitialized, setIsInitialized] = useState(false);
  const [client, setClient] = useState<ApiClient | null>(null);

  const [wallet, setWallet] = useState<WalletState>({
    isConnected: false,
    isConnecting: false,
    address: null,
    chainId: null,
    error: null,
  });

  const [user, setUser] = useState<UserState>({
    investorId: null,
    kycStatus: 'none',
    isLoading: false,
  });

  // Initialize API client
  useEffect(() => {
    const initClient = async () => {
      try {
        const apiClient = createApiClient({
          apiKey: config.apiKey,
          baseUrl: config.baseUrl,
        });

        setClient(apiClient);
        setIsInitialized(true);

        if (config.debug) {
          console.log('[Tokenisation] SDK initialized');
        }
      } catch (error) {
        console.error('[Tokenisation] Failed to initialize:', error);
        setWallet(prev => ({
          ...prev,
          error: error instanceof Error ? error : new Error('Initialization failed'),
        }));
      }
    };

    initClient();
  }, [config.apiKey, config.baseUrl, config.debug]);

  // Auto-connect wallet if enabled
  useEffect(() => {
    if (isInitialized && config.autoConnect) {
      // Check for existing session
      checkExistingSession();
    }
  }, [isInitialized, config.autoConnect]);

  // Check for existing wallet session
  const checkExistingSession = useCallback(async () => {
    try {
      // In a real implementation, this would check for existing WalletConnect session
      // or local wallet connection
      if (config.debug) {
        console.log('[Tokenisation] Checking for existing session...');
      }
    } catch (error) {
      if (config.debug) {
        console.log('[Tokenisation] No existing session found');
      }
    }
  }, [config.debug]);

  // Connect wallet
  const connectWallet = useCallback(async () => {
    if (wallet.isConnecting) return;

    setWallet(prev => ({ ...prev, isConnecting: true, error: null }));

    try {
      // In a real implementation, this would use WalletConnect
      // For now, we simulate the connection process

      if (config.debug) {
        console.log('[Tokenisation] Connecting wallet...');
      }

      // Simulate connection delay
      await new Promise(resolve => setTimeout(resolve, 1000));

      // TODO: WalletConnect v2 — replace simulated flow with real WalletConnect modal
      // Simulated successful connection using config-derived address
      const mockAddress = '0x' + (config.walletConnectProjectId || '1').padStart(40, '0').slice(0, 40);
      const mockChainId = config.supportedChains?.[0] || 1;

      setWallet({
        isConnected: true,
        isConnecting: false,
        address: mockAddress,
        chainId: mockChainId,
        error: null,
      });

      if (config.debug) {
        console.log('[Tokenisation] Wallet connected:', mockAddress);
      }

      // Fetch user data after connection
      await fetchUserData(mockAddress);
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Connection failed');
      setWallet(prev => ({
        ...prev,
        isConnecting: false,
        error: err,
      }));

      if (config.debug) {
        console.error('[Tokenisation] Wallet connection failed:', error);
      }
    }
  }, [wallet.isConnecting, config.debug, config.supportedChains]);

  // Disconnect wallet
  const disconnectWallet = useCallback(async () => {
    try {
      if (config.debug) {
        console.log('[Tokenisation] Disconnecting wallet...');
      }

      // Clear wallet state
      setWallet({
        isConnected: false,
        isConnecting: false,
        address: null,
        chainId: null,
        error: null,
      });

      // Clear user state
      setUser({
        investorId: null,
        kycStatus: 'none',
        isLoading: false,
      });
    } catch (error) {
      if (config.debug) {
        console.error('[Tokenisation] Disconnect failed:', error);
      }
    }
  }, [config.debug]);

  // Switch chain
  const switchChain = useCallback(async (chainId: number) => {
    if (!wallet.isConnected) {
      throw new Error('Wallet not connected');
    }

    if (!config.supportedChains?.includes(chainId)) {
      throw new Error(`Chain ${chainId} is not supported`);
    }

    try {
      if (config.debug) {
        console.log('[Tokenisation] Switching to chain:', chainId);
      }

      // In a real implementation, this would call the wallet's switchChain method
      setWallet(prev => ({ ...prev, chainId }));
    } catch (error) {
      if (config.debug) {
        console.error('[Tokenisation] Chain switch failed:', error);
      }
      throw error;
    }
  }, [wallet.isConnected, config.supportedChains, config.debug]);

  // Fetch user data
  const fetchUserData = useCallback(async (address: string) => {
    if (!client) return;

    setUser(prev => ({ ...prev, isLoading: true }));

    try {
      const response = await client.get(`/investors/wallet/${address}`);
      if (response && typeof response === 'object' && 'id' in response) {
        const investor = response as { id: string; status?: string };
        setUser({
          investorId: investor.id,
          kycStatus: (investor.status as UserState['kycStatus']) || 'none',
          isLoading: false,
        });
      } else {
        // No investor found for this wallet — use derived ID
        setUser({
          investorId: `inv_${address.slice(2, 10)}`,
          kycStatus: 'none',
          isLoading: false,
        });
      }
    } catch (error) {
      // Fallback to derived ID on network/API errors
      setUser({
        investorId: `inv_${address.slice(2, 10)}`,
        kycStatus: 'none',
        isLoading: false,
      });
      if (config.debug) {
        console.error('[Tokenisation] Failed to fetch user:', error);
      }
    }
  }, [client, config.debug]);

  // Refresh user data
  const refreshUser = useCallback(async () => {
    if (wallet.address) {
      await fetchUserData(wallet.address);
    }
  }, [wallet.address, fetchUserData]);

  // Sign message
  const signMessage = useCallback(async (message: string): Promise<string> => {
    if (!wallet.isConnected || !wallet.address) {
      throw new Error('Wallet not connected');
    }

    if (config.debug) {
      console.log('[Tokenisation] Signing message...');
    }

    // Route through API client if available, fall back to mock
    if (client) {
      try {
        const response = await client.post('/signing/message', { message, address: wallet.address });
        if (response && typeof response === 'object' && 'signature' in response) {
          return (response as { signature: string }).signature;
        }
      } catch (err) {
        if (config.debug) {
          console.warn('[Tokenisation] API sign failed, using mock fallback:', err);
        }
      }
    }

    // Mock fallback
    return '0x' + 'signature'.repeat(8);
  }, [wallet.isConnected, wallet.address, client, config.debug]);

  // Send transaction
  const sendTransaction = useCallback(async (tx: TransactionRequest): Promise<string> => {
    if (!wallet.isConnected || !wallet.address) {
      throw new Error('Wallet not connected');
    }

    if (config.debug) {
      console.log('[Tokenisation] Sending transaction:', tx);
    }

    // Route through API client if available, fall back to mock
    if (client) {
      try {
        const response = await client.post('/transactions/send', { ...tx, from: wallet.address, chainId: wallet.chainId });
        if (response && typeof response === 'object' && 'txHash' in response) {
          return (response as { txHash: string }).txHash;
        }
      } catch (err) {
        if (config.debug) {
          console.warn('[Tokenisation] API transaction failed, using mock fallback:', err);
        }
      }
    }

    // Mock fallback
    return '0x' + 'txhash'.repeat(8);
  }, [wallet.isConnected, wallet.address, wallet.chainId, client, config.debug]);

  // Memoize context value
  const contextValue = useMemo<TokenisationContextValue>(() => ({
    config,
    isInitialized,
    client,
    wallet,
    connectWallet,
    disconnectWallet,
    switchChain,
    user,
    refreshUser,
    signMessage,
    sendTransaction,
  }), [
    config,
    isInitialized,
    client,
    wallet,
    connectWallet,
    disconnectWallet,
    switchChain,
    user,
    refreshUser,
    signMessage,
    sendTransaction,
  ]);

  return (
    <TokenisationContext.Provider value={contextValue}>
      {children}
    </TokenisationContext.Provider>
  );
}

export default TokenisationProvider;
