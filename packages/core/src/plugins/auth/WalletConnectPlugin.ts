/**
 * WalletConnect Plugin
 *
 * Provides WalletConnect v2 integration for SIWE authentication.
 * Enables connection to mobile wallets and other WalletConnect-compatible wallets.
 */

import type { WalletConnection } from './SIWEAuthPlugin.js';
import { AuthenticationError, ErrorCode } from '../../errors/index.js';

/**
 * WalletConnect Universal Provider module type (dynamic import)
 */
interface UniversalProviderModule {
  UniversalProvider: {
    init: (opts: unknown) => Promise<UniversalProvider>;
  };
}

/**
 * WalletConnect Modal module type (dynamic import)
 */
interface WalletConnectModalModule {
  WalletConnectModal: new (opts: { projectId: string }) => WCModal;
}

/**
 * WalletConnect session namespace
 */
interface SessionNamespace {
  accounts: string[];
  methods: string[];
  events: string[];
  chains?: string[];
}

/**
 * WalletConnect session
 */
interface WCSession {
  topic: string;
  namespaces: Record<string, SessionNamespace>;
  peer: {
    metadata: {
      name: string;
      description: string;
      url: string;
      icons: string[];
    };
  };
}

/**
 * Universal Provider interface (from @walletconnect/universal-provider)
 */
interface UniversalProvider {
  connect: (opts: { namespaces: Record<string, unknown> }) => Promise<WCSession>;
  disconnect: () => Promise<void>;
  request: <T>(args: { method: string; params?: unknown[] }, chain?: string) => Promise<T>;
  on: (event: string, callback: (...args: unknown[]) => void) => void;
  off: (event: string, callback: (...args: unknown[]) => void) => void;
  session: WCSession | null;
  setDefaultChain: (chain: string) => void;
}

/**
 * WalletConnect Modal interface
 */
interface WCModal {
  openModal: (opts: { uri: string }) => Promise<void>;
  closeModal: () => void;
  subscribeModal: (callback: (state: { open: boolean }) => void) => () => void;
}

/**
 * WalletConnect plugin configuration
 */
export interface WalletConnectPluginConfig {
  /** WalletConnect project ID (required, get from cloud.walletconnect.com) */
  projectId: string;

  /** Application metadata */
  metadata?: {
    name: string;
    description: string;
    url: string;
    icons: string[];
  };

  /** Chain IDs to request (e.g., [1, 137] for Ethereum and Polygon) */
  chains?: number[];

  /** Optional chain IDs (user can choose to connect) */
  optionalChains?: number[];

  /** Methods to request */
  methods?: string[];

  /** Events to subscribe to */
  events?: string[];

  /** Show QR code modal */
  showQrModal?: boolean;

  /** Relay URL (defaults to WalletConnect relay) */
  relayUrl?: string;
}

/**
 * WalletConnect connection events
 */
export type WalletConnectEventType = 'accountsChanged' | 'chainChanged' | 'disconnect' | 'session_update';

/**
 * Default configuration
 */
const DEFAULT_METHODS = [
  'eth_sendTransaction',
  'eth_signTransaction',
  'eth_sign',
  'personal_sign',
  'eth_signTypedData',
  'eth_signTypedData_v4',
];

const DEFAULT_EVENTS = ['chainChanged', 'accountsChanged'];

/**
 * WalletConnectPlugin - WalletConnect v2 integration
 */
export class WalletConnectPlugin {
  readonly pluginId = 'walletconnect-wallet';

  private config: Required<
    Pick<WalletConnectPluginConfig, 'projectId' | 'chains' | 'methods' | 'events' | 'showQrModal'>
  > &
    WalletConnectPluginConfig;
  private provider: UniversalProvider | null = null;
  private modal: WCModal | null = null;
  private session: WCSession | null = null;
  private connectedAddress: string | null = null;
  private connectedChainId: number | null = null;
  private eventListeners: Map<WalletConnectEventType, Set<(...args: unknown[]) => void>> = new Map();

  constructor(config: WalletConnectPluginConfig) {
    if (!config.projectId) {
      throw new AuthenticationError('WalletConnect projectId is required', ErrorCode.INVALID_ARGUMENT, {
        details: { field: 'projectId' },
      });
    }

    this.config = {
      chains: [1], // Default to Ethereum mainnet
      optionalChains: [],
      methods: DEFAULT_METHODS,
      events: DEFAULT_EVENTS,
      showQrModal: true,
      metadata: {
        name: 'AHOY Platform',
        description: 'Real World Asset Tokenization Platform',
        url: typeof window !== 'undefined' ? window.location.origin : 'https://localhost',
        icons: [],
      },
      ...config,
    };
  }

  /**
   * Initialize the provider (lazy loading)
   */
  private async initProvider(): Promise<UniversalProvider> {
    if (this.provider) {
      return this.provider;
    }

    try {
      // Dynamically import to avoid SSR issues
      // Use string concatenation to prevent TypeScript from analyzing the import
      const modulePath = '@walletconnect' + '/universal-provider';
      const providerModule = await import(/* webpackIgnore: true */ modulePath) as UniversalProviderModule;
      const UniversalProviderClass = providerModule.UniversalProvider;

      this.provider = await UniversalProviderClass.init({
        projectId: this.config.projectId,
        metadata: this.config.metadata,
        relayUrl: this.config.relayUrl,
      });

      // Set up event handlers
      this.setupProviderEvents();

      return this.provider;
    } catch (error) {
      throw new AuthenticationError(
        `Failed to initialize WalletConnect provider: ${error instanceof Error ? error.message : String(error)}`,
        ErrorCode.INTERNAL,
        { cause: error instanceof Error ? error : undefined }
      );
    }
  }

  /**
   * Initialize the QR modal (lazy loading)
   */
  private async initModal(): Promise<WCModal> {
    if (this.modal) {
      return this.modal;
    }

    try {
      // Use string concatenation to prevent TypeScript from analyzing the import
      const modalPath = '@walletconnect' + '/modal';
      const modalModule = await import(/* webpackIgnore: true */ modalPath) as WalletConnectModalModule;
      const WalletConnectModal = modalModule.WalletConnectModal;

      this.modal = new WalletConnectModal({
        projectId: this.config.projectId,
      });

      return this.modal;
    } catch (error) {
      throw new AuthenticationError(
        `Failed to initialize WalletConnect modal: ${error instanceof Error ? error.message : String(error)}`,
        ErrorCode.INTERNAL,
        { cause: error instanceof Error ? error : undefined }
      );
    }
  }

  /**
   * Connect to a wallet via WalletConnect
   * Returns a WalletConnection compatible with SIWEAuthPlugin
   */
  async connect(): Promise<WalletConnection> {
    const provider = await this.initProvider();

    // Build required namespaces
    const chains = this.config.chains.map((id) => `eip155:${id}`);
    const optionalChains = (this.config.optionalChains || []).map((id) => `eip155:${id}`);

    const namespaces = {
      eip155: {
        methods: this.config.methods,
        chains,
        events: this.config.events,
        ...(optionalChains.length > 0 && { optionalChains }),
      },
    };

    // Connect and show QR modal if enabled
    if (this.config.showQrModal) {
      const modal = await this.initModal();

      // Handle connection with modal
      const connectPromise = provider.connect({ namespaces });

      // Listen for URI to show in modal
      provider.on('display_uri', async (uri: unknown) => {
        await modal.openModal({ uri: uri as string });
      });

      try {
        this.session = await connectPromise;
        modal.closeModal();
      } catch (error) {
        modal.closeModal();
        throw error;
      }
    } else {
      this.session = await provider.connect({ namespaces });
    }

    if (!this.session) {
      throw new AuthenticationError('Failed to establish WalletConnect session', ErrorCode.UNAUTHENTICATED, {
        details: { reason: 'session_failed' },
      });
    }

    // Extract connected account and chain
    const eip155Namespace = this.session.namespaces.eip155;
    if (!eip155Namespace || eip155Namespace.accounts.length === 0) {
      throw new AuthenticationError('No accounts found in session', ErrorCode.UNAUTHENTICATED, {
        details: { reason: 'no_accounts' },
      });
    }

    // Parse CAIP-10 account format: eip155:chainId:address
    const [, chainIdStr, address] = eip155Namespace.accounts[0].split(':');
    this.connectedAddress = address;
    this.connectedChainId = parseInt(chainIdStr, 10);

    // Set default chain for requests
    provider.setDefaultChain(`eip155:${this.connectedChainId}`);

    return this.getWalletConnection();
  }

  /**
   * Get current wallet connection
   *
   * @returns WalletConnection for use with SIWE
   * @throws AuthenticationError if not connected
   */
  getWalletConnection(): WalletConnection {
    if (!this.connectedAddress || !this.connectedChainId || !this.provider) {
      throw new AuthenticationError('Not connected via WalletConnect', ErrorCode.UNAUTHENTICATED, {
        details: { reason: 'not_connected' },
      });
    }

    const provider = this.provider;
    const address = this.connectedAddress;
    const chainId = this.connectedChainId;

    return {
      address,
      chainId,
      signMessage: async (message: string): Promise<string> => {
        const signature = await provider.request<string>(
          {
            method: 'personal_sign',
            params: [message, address],
          },
          `eip155:${chainId}`
        );
        return signature;
      },
    };
  }

  /**
   * Disconnect from WalletConnect
   */
  async disconnect(): Promise<void> {
    if (this.provider) {
      try {
        await this.provider.disconnect();
      } catch {
        // Ignore disconnect errors
      }
    }

    this.session = null;
    this.connectedAddress = null;
    this.connectedChainId = null;
    this.emit('disconnect');
  }

  /**
   * Get connected address
   */
  getAddress(): string | null {
    return this.connectedAddress;
  }

  /**
   * Get connected chain ID
   */
  getChainId(): number | null {
    return this.connectedChainId;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return Boolean(this.session && this.connectedAddress);
  }

  /**
   * Get session metadata (connected wallet info)
   */
  getSessionMetadata(): { name: string; description: string; url: string; icons: string[] } | null {
    if (!this.session) {
      return null;
    }
    return this.session.peer.metadata;
  }

  /**
   * Switch to a different chain
   *
   * @param chainId - Chain ID to switch to
   * @throws AuthenticationError if not connected or chain not available
   */
  async switchChain(chainId: number): Promise<void> {
    if (!this.provider) {
      throw new AuthenticationError('Not connected via WalletConnect', ErrorCode.UNAUTHENTICATED);
    }

    const chainIdHex = `0x${chainId.toString(16)}`;

    try {
      await this.provider.request(
        {
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: chainIdHex }],
        },
        `eip155:${this.connectedChainId}`
      );

      this.connectedChainId = chainId;
      this.provider.setDefaultChain(`eip155:${chainId}`);
      this.emit('chainChanged', chainId);
    } catch (error: unknown) {
      // Error code 4902 means chain is not added
      if ((error as { code?: number }).code === 4902) {
        throw new AuthenticationError(
          `Chain ${chainId} is not supported by the connected wallet`,
          ErrorCode.INVALID_ARGUMENT,
          { details: { chainId, reason: 'chain_not_supported' }, cause: error instanceof Error ? error : undefined }
        );
      }
      throw error;
    }
  }

  /**
   * Send a transaction
   *
   * @param tx - Transaction parameters
   * @returns Transaction hash
   * @throws AuthenticationError if not connected
   */
  async sendTransaction(tx: {
    to: string;
    value?: string;
    data?: string;
    gas?: string;
    gasPrice?: string;
  }): Promise<string> {
    if (!this.provider || !this.connectedAddress) {
      throw new AuthenticationError('Not connected via WalletConnect', ErrorCode.UNAUTHENTICATED);
    }

    const txHash = await this.provider.request<string>(
      {
        method: 'eth_sendTransaction',
        params: [
          {
            from: this.connectedAddress,
            ...tx,
          },
        ],
      },
      `eip155:${this.connectedChainId}`
    );

    return txHash;
  }

  /**
   * Sign typed data (EIP-712)
   *
   * @param domain - EIP-712 domain
   * @param types - EIP-712 types
   * @param value - Message to sign
   * @returns Signature
   * @throws AuthenticationError if not connected
   */
  async signTypedData(
    domain: Record<string, unknown>,
    types: Record<string, unknown>,
    value: Record<string, unknown>
  ): Promise<string> {
    if (!this.provider || !this.connectedAddress) {
      throw new AuthenticationError('Not connected via WalletConnect', ErrorCode.UNAUTHENTICATED);
    }

    const data = {
      types,
      primaryType: Object.keys(types).find((k) => k !== 'EIP712Domain') || 'Message',
      domain,
      message: value,
    };

    const signature = await this.provider.request<string>(
      {
        method: 'eth_signTypedData_v4',
        params: [this.connectedAddress, JSON.stringify(data)],
      },
      `eip155:${this.connectedChainId}`
    );

    return signature;
  }

  /**
   * Subscribe to events
   */
  on(event: WalletConnectEventType, callback: (...args: unknown[]) => void): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(callback);
  }

  /**
   * Unsubscribe from events
   */
  off(event: WalletConnectEventType, callback: (...args: unknown[]) => void): void {
    this.eventListeners.get(event)?.delete(callback);
  }

  /**
   * Emit an event
   */
  private emit(event: WalletConnectEventType, ...args: unknown[]): void {
    this.eventListeners.get(event)?.forEach((callback) => {
      try {
        callback(...args);
      } catch (e) {
        console.error(`Error in ${event} handler:`, e);
      }
    });
  }

  /**
   * Set up provider event handlers
   */
  private setupProviderEvents(): void {
    if (!this.provider) return;

    // Handle session update
    this.provider.on('session_update', (...args: unknown[]) => {
      const event = args[0] as { topic: string; params: unknown };
      const { topic, params } = event;
      if (this.session && this.session.topic === topic) {
        const sessionParams = params as { namespaces: Record<string, SessionNamespace> };
        // Update session namespaces
        this.session.namespaces = sessionParams.namespaces;

        // Update connected account if changed
        const eip155Namespace = this.session.namespaces.eip155;
        if (eip155Namespace && eip155Namespace.accounts.length > 0) {
          const [, chainIdStr, address] = eip155Namespace.accounts[0].split(':');
          const newAddress = address;
          const newChainId = parseInt(chainIdStr, 10);

          if (newAddress !== this.connectedAddress) {
            this.connectedAddress = newAddress;
            this.emit('accountsChanged', [newAddress]);
          }

          if (newChainId !== this.connectedChainId) {
            this.connectedChainId = newChainId;
            this.emit('chainChanged', newChainId);
          }
        }

        this.emit('session_update', this.session);
      }
    });

    // Handle session delete (disconnect)
    this.provider.on('session_delete', () => {
      this.session = null;
      this.connectedAddress = null;
      this.connectedChainId = null;
      this.emit('disconnect');
    });
  }

  /**
   * Restore session from storage
   * Returns true if session was restored
   */
  async restoreSession(): Promise<boolean> {
    const provider = await this.initProvider();

    if (provider.session) {
      this.session = provider.session;

      // Extract connected account and chain
      const eip155Namespace = this.session.namespaces.eip155;
      if (eip155Namespace && eip155Namespace.accounts.length > 0) {
        const [, chainIdStr, address] = eip155Namespace.accounts[0].split(':');
        this.connectedAddress = address;
        this.connectedChainId = parseInt(chainIdStr, 10);
        return true;
      }
    }

    return false;
  }
}

/**
 * Factory function to create WalletConnectPlugin
 */
export function createWalletConnectPlugin(config: WalletConnectPluginConfig): WalletConnectPlugin {
  return new WalletConnectPlugin(config);
}

export default WalletConnectPlugin;
