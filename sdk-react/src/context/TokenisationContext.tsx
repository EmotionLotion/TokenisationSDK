/**
 * TokenisationContext - Main SDK Provider
 *
 * Wrap your app with <TokenisationProvider> to enable all SDK features.
 *
 * @example
 * ```tsx
 * import { TokenisationProvider } from '@tokenisation/sdk-react';
 *
 * function App() {
 *   return (
 *     <TokenisationProvider config={{ apiUrl: 'https://api.example.com' }}>
 *       <YourApp />
 *     </TokenisationProvider>
 *   );
 * }
 * ```
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';

import type {
  TokenisationConfig,
  TokenisationContextValue,
  TokenisationCallbacks,
  WalletConnection,
  WalletConnectOptions,
  Party,
} from '../types/index.js';

// ============================================================================
// CONTEXT
// ============================================================================

const TokenisationContext = createContext<TokenisationContextValue | null>(null);

// ============================================================================
// PROVIDER PROPS
// ============================================================================

export interface TokenisationProviderProps {
  /** SDK configuration */
  config: TokenisationConfig;
  /** Event callbacks */
  callbacks?: TokenisationCallbacks;
  /** Children components */
  children: ReactNode;
}

// ============================================================================
// PROVIDER COMPONENT
// ============================================================================

export function TokenisationProvider({
  config,
  callbacks,
  children,
}: TokenisationProviderProps) {
  // State
  const [isInitialized, setIsInitialized] = useState(false);
  const [wallet, setWallet] = useState<WalletConnection | null>(null);
  const [currentParty, setCurrentParty] = useState<Party | null>(null);
  const [error, setError] = useState<Error | null>(null);

  // Initialize SDK on mount
  useEffect(() => {
    async function initialize() {
      try {
        if (config.debug) {
          console.log('[TokenisationSDK] Initializing with config:', config);
        }

        // Validate config
        if (!config.apiUrl) {
          throw new Error('apiUrl is required in TokenisationConfig');
        }

        // Check API health
        const healthCheck = await fetch(`${config.apiUrl}/health`).catch(() => null);
        if (!healthCheck?.ok) {
          console.warn('[TokenisationSDK] API health check failed, continuing anyway');
        }

        setIsInitialized(true);

        if (config.debug) {
          console.log('[TokenisationSDK] Initialized successfully');
        }
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        console.error('[TokenisationSDK] Initialization failed:', error);
      }
    }

    initialize();
  }, [config]);

  // Connect wallet
  const connectWallet = useCallback(
    async (options?: WalletConnectOptions): Promise<WalletConnection> => {
      if (config.debug) {
        console.log('[TokenisationSDK] Connecting wallet with options:', options);
      }

      try {
        // Check for ethereum provider
        const ethereum = (window as any).ethereum;
        if (!ethereum) {
          throw new Error('No wallet provider found. Please install MetaMask or another wallet.');
        }

        // Request accounts
        const accounts = await ethereum.request({
          method: 'eth_requestAccounts',
        });

        if (!accounts || accounts.length === 0) {
          throw new Error('No accounts returned from wallet');
        }

        // Get chain ID
        const chainIdHex = await ethereum.request({ method: 'eth_chainId' });
        const chainId = parseInt(chainIdHex, 16);

        // Check required chain
        if (options?.requiredChainId && chainId !== options.requiredChainId) {
          await switchNetwork(options.requiredChainId);
        }

        // Determine provider name
        let provider: string = 'unknown';
        if (ethereum.isMetaMask) provider = 'metamask';
        else if (ethereum.isCoinbaseWallet) provider = 'coinbase';
        else if (ethereum.isPhantom) provider = 'phantom';

        const connection: WalletConnection = {
          address: accounts[0],
          chainId,
          provider,
          isConnected: true,
        };

        setWallet(connection);
        callbacks?.onWalletConnect?.(connection);

        // Try to fetch/create party record for this wallet
        await fetchOrCreateParty(accounts[0]);

        if (config.debug) {
          console.log('[TokenisationSDK] Wallet connected:', connection);
        }

        return connection;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        console.error('[TokenisationSDK] Wallet connection failed:', error);
        throw error;
      }
    },
    [config, callbacks]
  );

  // Disconnect wallet
  const disconnectWallet = useCallback(async (): Promise<void> => {
    if (config.debug) {
      console.log('[TokenisationSDK] Disconnecting wallet');
    }

    setWallet(null);
    setCurrentParty(null);
    callbacks?.onWalletDisconnect?.();
  }, [config, callbacks]);

  // Switch network
  const switchNetwork = useCallback(
    async (chainId: number): Promise<void> => {
      const ethereum = (window as any).ethereum;
      if (!ethereum) {
        throw new Error('No wallet provider found');
      }

      try {
        await ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: `0x${chainId.toString(16)}` }],
        });

        // Update wallet state
        if (wallet) {
          setWallet({ ...wallet, chainId });
        }
      } catch (err: any) {
        // Chain not added, try to add it
        if (err.code === 4902) {
          const networkConfig = config.networks?.find((n) => n.chainId === chainId);
          if (networkConfig) {
            await ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [
                {
                  chainId: `0x${chainId.toString(16)}`,
                  chainName: networkConfig.name,
                  rpcUrls: [networkConfig.rpcUrl],
                  blockExplorerUrls: networkConfig.blockExplorerUrl
                    ? [networkConfig.blockExplorerUrl]
                    : undefined,
                },
              ],
            });
          } else {
            throw new Error(`Network with chainId ${chainId} not configured`);
          }
        } else {
          throw err;
        }
      }
    },
    [config, wallet]
  );

  // Fetch or create party record for wallet
  const fetchOrCreateParty = useCallback(
    async (walletAddress: string): Promise<void> => {
      try {
        // Try to fetch existing party
        const response = await fetch(
          `${config.apiUrl}/api/v1/parties?walletAddress=${walletAddress}`,
          {
            headers: config.orgId ? { 'X-Org-Id': config.orgId } : {},
          }
        );

        if (response.ok) {
          const data = await response.json();
          if (data.parties && data.parties.length > 0) {
            setCurrentParty(data.parties[0]);
            return;
          }
        }

        // Party doesn't exist yet - that's okay, user needs to complete KYC
        setCurrentParty(null);
      } catch (err) {
        console.warn('[TokenisationSDK] Failed to fetch party:', err);
      }
    },
    [config]
  );

  // Listen for wallet events
  useEffect(() => {
    const ethereum = (window as any).ethereum;
    if (!ethereum) return;

    const handleAccountsChanged = (accounts: string[]) => {
      if (accounts.length === 0) {
        disconnectWallet();
      } else if (wallet && accounts[0] !== wallet.address) {
        setWallet({ ...wallet, address: accounts[0] });
        fetchOrCreateParty(accounts[0]);
      }
    };

    const handleChainChanged = (chainIdHex: string) => {
      const chainId = parseInt(chainIdHex, 16);
      if (wallet) {
        setWallet({ ...wallet, chainId });
      }
    };

    ethereum.on('accountsChanged', handleAccountsChanged);
    ethereum.on('chainChanged', handleChainChanged);

    return () => {
      ethereum.removeListener('accountsChanged', handleAccountsChanged);
      ethereum.removeListener('chainChanged', handleChainChanged);
    };
  }, [wallet, disconnectWallet, fetchOrCreateParty]);

  // Context value
  const contextValue = useMemo<TokenisationContextValue>(
    () => ({
      config,
      isInitialized,
      wallet,
      currentParty,
      connectWallet,
      disconnectWallet,
      switchNetwork,
    }),
    [config, isInitialized, wallet, currentParty, connectWallet, disconnectWallet, switchNetwork]
  );

  // Show error state
  if (error) {
    return (
      <div style={{ color: 'red', padding: '20px' }}>
        Tokenisation SDK initialization failed: {error.message}
      </div>
    );
  }

  return (
    <TokenisationContext.Provider value={contextValue}>
      {children}
    </TokenisationContext.Provider>
  );
}

// ============================================================================
// HOOK
// ============================================================================

/**
 * Access the Tokenisation SDK context
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { wallet, connectWallet } = useTokenisation();
 *
 *   return (
 *     <button onClick={() => connectWallet()}>
 *       {wallet ? wallet.address : 'Connect Wallet'}
 *     </button>
 *   );
 * }
 * ```
 */
export function useTokenisation(): TokenisationContextValue {
  const context = useContext(TokenisationContext);

  if (!context) {
    throw new Error('useTokenisation must be used within a TokenisationProvider');
  }

  return context;
}

// ============================================================================
// EXPORTS
// ============================================================================

export { TokenisationContext };
