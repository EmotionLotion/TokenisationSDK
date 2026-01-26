/**
 * MetaMask Wallet Plugin
 *
 * Provides MetaMask browser wallet integration for SIWE authentication.
 * Handles wallet detection, connection, signing, and chain switching.
 */

import type { WalletConnection } from './SIWEAuthPlugin.js';

/**
 * Ethereum provider interface (window.ethereum)
 */
interface EthereumProvider {
  isMetaMask?: boolean;
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on: (event: string, callback: (...args: unknown[]) => void) => void;
  removeListener: (event: string, callback: (...args: unknown[]) => void) => void;
}

/**
 * MetaMask plugin configuration
 */
export interface MetaMaskPluginConfig {
  /** Target chain ID (hex string, e.g., '0x1' for mainnet) */
  chainId?: string;

  /** Auto-switch to target chain if connected to different chain */
  autoSwitchChain?: boolean;
}

/**
 * Chain configuration for adding new chains
 */
export interface ChainParams {
  chainId: string;
  chainName: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  rpcUrls: string[];
  blockExplorerUrls?: string[];
}

/**
 * MetaMask connection events
 */
export type MetaMaskEventType = 'accountsChanged' | 'chainChanged' | 'disconnect';

/**
 * MetaMaskPlugin - Browser wallet integration
 */
export class MetaMaskPlugin {
  readonly pluginId = 'metamask-wallet';

  private config: MetaMaskPluginConfig;
  private provider: EthereumProvider | null = null;
  private connectedAddress: string | null = null;
  private connectedChainId: number | null = null;
  private eventListeners: Map<MetaMaskEventType, Set<(...args: unknown[]) => void>> = new Map();
  private boundHandlers: Map<string, (...args: unknown[]) => void> = new Map();

  constructor(config: MetaMaskPluginConfig = {}) {
    this.config = {
      autoSwitchChain: true,
      ...config,
    };
  }

  /**
   * Check if MetaMask is installed
   */
  isInstalled(): boolean {
    if (typeof window === 'undefined') {
      return false;
    }

    const ethereum = (window as { ethereum?: EthereumProvider }).ethereum;
    return Boolean(ethereum?.isMetaMask);
  }

  /**
   * Start MetaMask onboarding (install prompt)
   * Uses @metamask/onboarding package if available
   */
  async startOnboarding(): Promise<void> {
    if (this.isInstalled()) {
      return;
    }

    try {
      // Dynamically import onboarding to avoid bundle issues if not installed
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const onboardingModule = await import('@metamask/onboarding' as any);
      const MetaMaskOnboarding = onboardingModule.default;
      const onboarding = new MetaMaskOnboarding();
      onboarding.startOnboarding();
    } catch {
      // Fallback: open MetaMask download page
      if (typeof window !== 'undefined') {
        window.open('https://metamask.io/download/', '_blank');
      }
    }
  }

  /**
   * Connect to MetaMask wallet
   * Returns a WalletConnection compatible with SIWEAuthPlugin
   */
  async connect(): Promise<WalletConnection> {
    if (!this.isInstalled()) {
      throw new Error('MetaMask is not installed');
    }

    const ethereum = (window as { ethereum?: EthereumProvider }).ethereum!;
    this.provider = ethereum;

    // Request account access
    const accounts = await ethereum.request({
      method: 'eth_requestAccounts',
    }) as string[];

    if (!accounts || accounts.length === 0) {
      throw new Error('No accounts found');
    }

    this.connectedAddress = accounts[0];

    // Get chain ID
    const chainIdHex = await ethereum.request({
      method: 'eth_chainId',
    }) as string;

    this.connectedChainId = parseInt(chainIdHex, 16);

    // Auto-switch chain if configured
    if (this.config.autoSwitchChain && this.config.chainId) {
      const targetChainId = parseInt(this.config.chainId, 16);
      if (this.connectedChainId !== targetChainId) {
        await this.switchChain(this.config.chainId);
        this.connectedChainId = targetChainId;
      }
    }

    // Set up event listeners
    this.setupEventListeners();

    // Return WalletConnection interface for SIWE
    return this.getWalletConnection();
  }

  /**
   * Get current wallet connection
   */
  getWalletConnection(): WalletConnection {
    if (!this.connectedAddress || !this.connectedChainId || !this.provider) {
      throw new Error('Not connected to MetaMask');
    }

    const provider = this.provider;
    const address = this.connectedAddress;

    return {
      address,
      chainId: this.connectedChainId,
      signMessage: async (message: string): Promise<string> => {
        const signature = await provider.request({
          method: 'personal_sign',
          params: [message, address],
        });
        return signature as string;
      },
    };
  }

  /**
   * Disconnect from MetaMask
   */
  disconnect(): void {
    this.removeEventListeners();
    this.connectedAddress = null;
    this.connectedChainId = null;
    this.provider = null;
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
    return Boolean(this.connectedAddress && this.provider);
  }

  /**
   * Switch to a different chain
   */
  async switchChain(chainId: string): Promise<void> {
    if (!this.provider) {
      throw new Error('Not connected to MetaMask');
    }

    try {
      await this.provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId }],
      });

      this.connectedChainId = parseInt(chainId, 16);
    } catch (error: unknown) {
      // Error code 4902 means chain is not added to MetaMask
      if ((error as { code?: number }).code === 4902) {
        throw new Error(`Chain ${chainId} is not added to MetaMask. Use addChain() first.`);
      }
      throw error;
    }
  }

  /**
   * Add a new chain to MetaMask
   */
  async addChain(params: ChainParams): Promise<void> {
    if (!this.provider) {
      throw new Error('Not connected to MetaMask');
    }

    await this.provider.request({
      method: 'wallet_addEthereumChain',
      params: [params],
    });
  }

  /**
   * Request permissions (for additional accounts)
   */
  async requestPermissions(): Promise<string[]> {
    if (!this.provider) {
      throw new Error('Not connected to MetaMask');
    }

    const permissions = await this.provider.request({
      method: 'wallet_requestPermissions',
      params: [{ eth_accounts: {} }],
    }) as Array<{ caveats: Array<{ value: string[] }> }>;

    // Extract accounts from permissions
    const accounts: string[] = [];
    for (const permission of permissions) {
      if (permission.caveats) {
        for (const caveat of permission.caveats) {
          if (caveat.value) {
            accounts.push(...caveat.value);
          }
        }
      }
    }

    return accounts;
  }

  /**
   * Get all permitted accounts
   */
  async getAccounts(): Promise<string[]> {
    if (!this.provider) {
      throw new Error('Not connected to MetaMask');
    }

    const accounts = await this.provider.request({
      method: 'eth_accounts',
    }) as string[];

    return accounts;
  }

  /**
   * Sign a typed data message (EIP-712)
   */
  async signTypedData(
    domain: Record<string, unknown>,
    types: Record<string, unknown>,
    value: Record<string, unknown>
  ): Promise<string> {
    if (!this.provider || !this.connectedAddress) {
      throw new Error('Not connected to MetaMask');
    }

    const data = {
      types,
      primaryType: Object.keys(types).find((k) => k !== 'EIP712Domain') || 'Message',
      domain,
      message: value,
    };

    const signature = await this.provider.request({
      method: 'eth_signTypedData_v4',
      params: [this.connectedAddress, JSON.stringify(data)],
    });

    return signature as string;
  }

  /**
   * Subscribe to events
   */
  on(event: MetaMaskEventType, callback: (...args: unknown[]) => void): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(callback);
  }

  /**
   * Unsubscribe from events
   */
  off(event: MetaMaskEventType, callback: (...args: unknown[]) => void): void {
    this.eventListeners.get(event)?.delete(callback);
  }

  /**
   * Emit an event
   */
  private emit(event: MetaMaskEventType, ...args: unknown[]): void {
    this.eventListeners.get(event)?.forEach((callback) => {
      try {
        callback(...args);
      } catch (e) {
        console.error(`Error in ${event} handler:`, e);
      }
    });
  }

  /**
   * Set up MetaMask event listeners
   */
  private setupEventListeners(): void {
    if (!this.provider) return;

    // Handle accounts changed
    const handleAccountsChanged = (accounts: unknown): void => {
      const accs = accounts as string[];
      if (accs.length === 0) {
        // User disconnected
        this.disconnect();
      } else {
        this.connectedAddress = accs[0];
        this.emit('accountsChanged', accs);
      }
    };

    // Handle chain changed
    const handleChainChanged = (chainId: unknown): void => {
      this.connectedChainId = parseInt(chainId as string, 16);
      this.emit('chainChanged', this.connectedChainId);
    };

    // Handle disconnect
    const handleDisconnect = (): void => {
      this.disconnect();
    };

    // Store bound handlers for cleanup
    this.boundHandlers.set('accountsChanged', handleAccountsChanged);
    this.boundHandlers.set('chainChanged', handleChainChanged);
    this.boundHandlers.set('disconnect', handleDisconnect);

    // Add listeners
    this.provider.on('accountsChanged', handleAccountsChanged);
    this.provider.on('chainChanged', handleChainChanged);
    this.provider.on('disconnect', handleDisconnect);
  }

  /**
   * Remove event listeners
   */
  private removeEventListeners(): void {
    if (!this.provider) return;

    for (const [event, handler] of this.boundHandlers) {
      this.provider.removeListener(event, handler);
    }

    this.boundHandlers.clear();
  }
}

/**
 * Factory function to create MetaMaskPlugin
 */
export function createMetaMaskPlugin(config?: MetaMaskPluginConfig): MetaMaskPlugin {
  return new MetaMaskPlugin(config);
}

export default MetaMaskPlugin;
