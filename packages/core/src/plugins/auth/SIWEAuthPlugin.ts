/**
 * SIWE Authentication Plugin
 *
 * Implements Sign-In with Ethereum (SIWE) for wallet-based authentication.
 * Works with wagmi/viem for wallet connections.
 */

import { SiweMessage } from 'siwe';
import type { ApiClient } from '../api/ApiClient.js';

export interface SIWEAuthConfig {
  apiClient: ApiClient;
  domain?: string;
  uri?: string;
  statement?: string;
}

export interface AuthSession {
  token: string;
  refreshToken: string;
  party: {
    id: string;
    name: string;
    type: string;
    roles: string[];
    jurisdiction: string;
    verificationLevel: string;
    kycVerified: boolean;
  };
  address: string;
  chainId: number;
  expiresAt: Date;
}

export interface WalletConnection {
  address: string;
  chainId: number;
  signMessage: (message: string) => Promise<string>;
}

export class SIWEAuthPlugin {
  readonly pluginId = 'siwe-auth';

  private client: ApiClient;
  private domain: string;
  private uri: string;
  private statement: string;
  private session: AuthSession | null = null;
  private onSessionChange: ((session: AuthSession | null) => void) | null = null;

  constructor(config: SIWEAuthConfig) {
    this.client = config.apiClient;
    this.domain = config.domain || (typeof window !== 'undefined' ? window.location.host : 'localhost');
    this.uri = config.uri || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
    this.statement = config.statement || 'Sign in to AHOY Platform to manage your tokenized assets.';
  }

  async signIn(wallet: WalletConnection): Promise<AuthSession> {
    // 1. Get nonce from server
    const { nonce, expiresAt } = await this.client.getNonce(wallet.address);

    // 2. Build SIWE message
    const message = new SiweMessage({
      domain: this.domain,
      address: wallet.address,
      statement: this.statement,
      uri: this.uri,
      version: '1',
      chainId: wallet.chainId,
      nonce,
      issuedAt: new Date().toISOString(),
      expirationTime: expiresAt,
    });

    const preparedMessage = message.prepareMessage();

    // 3. Sign message with wallet
    const signature = await wallet.signMessage(preparedMessage);

    // 4. Verify with server
    const response = await this.client.verifySiwe(preparedMessage, signature);

    // 5. Create session
    this.session = {
      token: response.token,
      refreshToken: response.refreshToken,
      party: response.party,
      address: wallet.address,
      chainId: wallet.chainId,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
    };

    // Notify listeners with frozen clone
    this.onSessionChange?.(Object.freeze({ ...this.session }));

    // Return frozen clone to prevent external mutation
    return Object.freeze({ ...this.session });
  }

  async signOut(): Promise<void> {
    if (this.session) {
      try {
        await this.client.logout();
      } catch {
        // Ignore logout errors
      }
    }

    this.session = null;
    this.onSessionChange?.(null);
  }

  async refreshSession(): Promise<AuthSession | null> {
    if (!this.session?.refreshToken) {
      return null;
    }

    try {
      const response = await this.client.refreshToken(this.session.refreshToken);

      this.session = {
        ...this.session,
        token: response.token,
        refreshToken: response.refreshToken,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      };

      // Notify listeners with frozen clone
      this.onSessionChange?.(Object.freeze({ ...this.session }));
      // Return frozen clone to prevent external mutation
      return Object.freeze({ ...this.session });
    } catch {
      // Refresh failed, clear session
      this.session = null;
      this.onSessionChange?.(null);
      return null;
    }
  }

  getSession(): AuthSession | null {
    if (!this.session) return null;
    // Return frozen clone to prevent external mutation
    return Object.freeze({ ...this.session });
  }

  getToken(): string | null {
    return this.session?.token || null;
  }

  isAuthenticated(): boolean {
    if (!this.session) return false;
    return new Date() < this.session.expiresAt;
  }

  onSessionChanged(callback: (session: AuthSession | null) => void): void {
    this.onSessionChange = callback;
  }

  // Restore session from storage
  restoreSession(session: AuthSession): void {
    // Clone input to prevent external mutation of internal state
    this.session = { ...session };
    // Notify listeners with frozen clone
    this.onSessionChange?.(Object.freeze({ ...this.session }));
  }

  // Get session for storage (without sensitive data)
  getSessionForStorage(): Omit<AuthSession, 'token' | 'refreshToken'> | null {
    if (!this.session) return null;
    // Filter both token and refreshToken - both are sensitive credentials
    const { token, refreshToken, ...rest } = this.session;
    return Object.freeze(rest);
  }

  // Build SIWE message without signing (for display)
  buildMessage(address: string, chainId: number, nonce: string): string {
    const message = new SiweMessage({
      domain: this.domain,
      address,
      statement: this.statement,
      uri: this.uri,
      version: '1',
      chainId,
      nonce,
      issuedAt: new Date().toISOString(),
    });

    return message.prepareMessage();
  }
}

// Factory function
export function createSIWEAuthPlugin(config: SIWEAuthConfig): SIWEAuthPlugin {
  return new SIWEAuthPlugin(config);
}

export default SIWEAuthPlugin;
