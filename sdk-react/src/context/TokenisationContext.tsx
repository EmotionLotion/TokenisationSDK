/**
 * TokenisationContext - Main SDK Provider
 *
 * Wrap your app with <TokenisationProvider> to enable all SDK features.
 * Provides a shared BrowserHttpClient, SDK module instances, auth state,
 * and wallet signing capabilities.
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
  useRef,
  type ReactNode,
} from 'react';

import {
  BrowserHttpClient,
  ProjectsModule,
  InvestorsModule,
  TokensModule,
  TransfersModule,
  ComplianceModule,
  AssetsModule,
  EventsModule,
  WebhooksModule,
  AuditModule,
  GovernanceModule,
  EscrowModule,
  CashFlowModule,
  DLDModule,
  TicketsClient,
  ResaleModule,
  LegalModule,
} from '@tokenisation/sdk/client';

import type {
  TokenisationConfig,
  TokenisationContextValue,
  TokenisationCallbacks,
  WalletConnection,
  WalletConnectOptions,
  Party,
  SDKModules,
} from '../types/index.js';

import { EIP1193WalletAdapter } from '../utils/wallet-adapter.js';
import type { TransactionRequest } from '../utils/wallet-adapter.js';

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
  const [authToken, setAuthToken] = useState<string | null>(null);

  // Ref for auth token so BrowserHttpClient callback always has current value
  const authTokenRef = useRef<string | null>(null);
  authTokenRef.current = authToken;

  // Wallet adapter
  const walletAdapter = useMemo(() => new EIP1193WalletAdapter(), []);

  // BrowserHttpClient - shared across all hooks and modules
  const api = useMemo(() => {
    return new BrowserHttpClient({
      baseUrl: config.apiUrl,
      publishableKey: config.publishableKey,
      getAccessToken: () => authTokenRef.current,
      onAuthError: () => {
        setAuthToken(null);
        config.onAuthError?.();
      },
      orgId: config.orgId,
      timeout: 30000,
      retry: { maxRetries: 3, retryDelay: 1000 },
    });
  }, [config.apiUrl, config.publishableKey, config.orgId, config.onAuthError]);

  // SDK modules - instantiated once, sharing the same HTTP client
  const modules = useMemo<SDKModules>(() => {
    // All SDK modules accept an HttpClient-compatible object.
    // BrowserHttpClient provides the same interface (get/post/patch/delete/list).
    const http = api as any;
    return {
      projects: new ProjectsModule(http),
      assets: new AssetsModule(http),
      investors: new InvestorsModule(http),
      tokens: new TokensModule(http),
      transfers: new TransfersModule(http),
      compliance: new ComplianceModule(http),
      events: new EventsModule(http),
      webhooks: new WebhooksModule(http),
      audit: new AuditModule(http),
      governance: new GovernanceModule(http),
      escrow: new EscrowModule(http),
      cashflow: new CashFlowModule(http),
      dld: new DLDModule(http),
      tickets: new TicketsClient(http),
      resale: new ResaleModule(http),
      legal: new LegalModule(http),
    };
  }, [api]);

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

        // Check API health using the shared client
        try {
          await api.get('/health');
        } catch {
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
  }, [config, api]);

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
    setAuthToken(null);
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
        const response = await api.get<{ parties: Party[] }>(
          '/api/v1/parties',
          { walletAddress },
        );

        if (response.data.parties && response.data.parties.length > 0) {
          setCurrentParty(response.data.parties[0]);
          return;
        }

        // Party doesn't exist yet - that's okay, user needs to complete KYC
        setCurrentParty(null);
      } catch (err) {
        console.warn('[TokenisationSDK] Failed to fetch party:', err);
      }
    },
    [api]
  );

  // Wallet signing via EIP-1193
  const signMessage = useCallback(
    async (message: string): Promise<string> => {
      return walletAdapter.signMessage(message);
    },
    [walletAdapter]
  );

  const sendTransaction = useCallback(
    async (tx: TransactionRequest): Promise<string> => {
      return walletAdapter.sendTransaction(tx);
    },
    [walletAdapter]
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
      callbacks: callbacks ?? {},
      api,
      modules,
      authToken,
      setAuthToken,
      signMessage,
      sendTransaction,
    }),
    [
      config, isInitialized, wallet, currentParty,
      connectWallet, disconnectWallet, switchNetwork, callbacks,
      api, modules, authToken, signMessage, sendTransaction,
    ]
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
 *   const { wallet, connectWallet, modules, api } = useTokenisation();
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
