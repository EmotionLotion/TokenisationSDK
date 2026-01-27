/**
 * OAuth Token Manager
 *
 * Manages OAuth2 client credentials flow with automatic token refresh.
 * Provides a simple interface for SDK clients to obtain valid access tokens.
 *
 * Features:
 * - Automatic token refresh before expiry
 * - Thread-safe token refresh (prevents multiple simultaneous refreshes)
 * - Event callbacks for token lifecycle events
 * - Support for custom token endpoints
 *
 * @packageDocumentation
 */

import { EventEmitter } from 'events';

// ============================================================================
// TYPES
// ============================================================================

export interface OAuthTokenManagerConfig {
  /** OAuth2 client ID */
  clientId: string;

  /** OAuth2 client secret */
  clientSecret: string;

  /** Token endpoint URL */
  tokenEndpoint: string;

  /** Requested scopes (space-separated or array) */
  scopes?: string[] | string;

  /** Buffer time before expiry to trigger refresh (default: 60 seconds) */
  refreshBuffer?: number;

  /** Whether to automatically refresh tokens (default: true) */
  autoRefresh?: boolean;

  /** Custom fetch function (for testing or custom HTTP clients) */
  fetch?: typeof fetch;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
}

export interface OAuthTokenManagerEvents {
  'token:refreshed': (token: string) => void;
  'token:error': (error: Error) => void;
  'token:expired': () => void;
}

// ============================================================================
// OAUTH TOKEN MANAGER CLASS
// ============================================================================

export class OAuthTokenManager extends EventEmitter {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private expiresAt: Date | null = null;
  private scopes: string[];
  private refreshPromise: Promise<void> | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly config: Required<OAuthTokenManagerConfig>;

  constructor(config: OAuthTokenManagerConfig) {
    super();

    this.config = {
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      tokenEndpoint: config.tokenEndpoint,
      scopes: Array.isArray(config.scopes)
        ? config.scopes
        : config.scopes?.split(' ') || [],
      refreshBuffer: config.refreshBuffer ?? 60,
      autoRefresh: config.autoRefresh ?? true,
      fetch: config.fetch ?? globalThis.fetch.bind(globalThis),
    };

    this.scopes = this.config.scopes as string[];
  }

  /**
   * Get a valid access token
   * Automatically refreshes if the current token is expired or about to expire
   */
  async getAccessToken(): Promise<string> {
    // If we have a valid token, return it
    if (this.accessToken && this.isTokenValid()) {
      return this.accessToken;
    }

    // If a refresh is already in progress, wait for it
    if (this.refreshPromise) {
      await this.refreshPromise;
      return this.accessToken!;
    }

    // Need to get a new token
    await this.refresh();
    return this.accessToken!;
  }

  /**
   * Force a token refresh
   */
  async refresh(): Promise<void> {
    // Prevent multiple simultaneous refreshes
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.doRefresh();

    try {
      await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  /**
   * Revoke all tokens
   */
  async revoke(): Promise<void> {
    this.clearRefreshTimer();

    // Revoke refresh token if available
    if (this.refreshToken) {
      try {
        const revokeUrl = this.config.tokenEndpoint.replace('/token', '/revoke');
        await this.config.fetch(revokeUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            token: this.refreshToken,
            token_type_hint: 'refresh_token',
          }).toString(),
        });
      } catch (error) {
        // Ignore revocation errors
      }
    }

    this.accessToken = null;
    this.refreshToken = null;
    this.expiresAt = null;
  }

  /**
   * Check if the current token is valid (not expired)
   */
  isTokenValid(): boolean {
    if (!this.accessToken || !this.expiresAt) {
      return false;
    }

    const bufferMs = this.config.refreshBuffer * 1000;
    return new Date().getTime() < this.expiresAt.getTime() - bufferMs;
  }

  /**
   * Get the current token expiry time
   */
  getExpiresAt(): Date | null {
    return this.expiresAt;
  }

  /**
   * Get the currently granted scopes
   */
  getScopes(): string[] {
    return [...this.scopes];
  }

  /**
   * Register a callback for token refresh events
   */
  onTokenRefresh(callback: (token: string) => void): this {
    this.on('token:refreshed', callback);
    return this;
  }

  /**
   * Register a callback for token error events
   */
  onTokenError(callback: (error: Error) => void): this {
    this.on('token:error', callback);
    return this;
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.clearRefreshTimer();
    this.removeAllListeners();
    this.accessToken = null;
    this.refreshToken = null;
    this.expiresAt = null;
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private async doRefresh(): Promise<void> {
    try {
      let tokenResponse: TokenResponse;

      if (this.refreshToken) {
        // Use refresh token grant
        tokenResponse = await this.requestRefreshToken();
      } else {
        // Use client credentials grant
        tokenResponse = await this.requestClientCredentials();
      }

      this.accessToken = tokenResponse.access_token;
      this.refreshToken = tokenResponse.refresh_token || this.refreshToken;
      this.expiresAt = new Date(Date.now() + tokenResponse.expires_in * 1000);

      if (tokenResponse.scope) {
        this.scopes = tokenResponse.scope.split(' ');
      }

      this.emit('token:refreshed', this.accessToken);

      // Schedule next refresh
      if (this.config.autoRefresh) {
        this.scheduleRefresh(tokenResponse.expires_in);
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.emit('token:error', err);
      throw err;
    }
  }

  private async requestClientCredentials(): Promise<TokenResponse> {
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
    });

    if (this.config.scopes.length > 0) {
      body.set('scope', (this.config.scopes as string[]).join(' '));
    }

    const response = await this.config.fetch(this.config.tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'unknown_error' }));
      throw new Error(`OAuth token request failed: ${error.error_description || error.error}`);
    }

    return response.json();
  }

  private async requestRefreshToken(): Promise<TokenResponse> {
    const response = await this.config.fetch(this.config.tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: this.refreshToken!,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
      }).toString(),
    });

    if (!response.ok) {
      // If refresh token is invalid, try client credentials
      if (response.status === 400 || response.status === 401) {
        this.refreshToken = null;
        return this.requestClientCredentials();
      }

      const error = await response.json().catch(() => ({ error: 'unknown_error' }));
      throw new Error(`OAuth refresh failed: ${error.error_description || error.error}`);
    }

    return response.json();
  }

  private scheduleRefresh(expiresIn: number): void {
    this.clearRefreshTimer();

    // Refresh 60 seconds before expiry (or earlier if token is short-lived)
    const refreshIn = Math.max(1, expiresIn - this.config.refreshBuffer) * 1000;

    this.refreshTimer = setTimeout(async () => {
      try {
        await this.refresh();
      } catch (error) {
        // Error already emitted
      }
    }, refreshIn);

    // Don't prevent process exit
    if (this.refreshTimer.unref) {
      this.refreshTimer.unref();
    }
  }

  private clearRefreshTimer(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create an OAuth token manager instance
 */
export function createOAuthTokenManager(config: OAuthTokenManagerConfig): OAuthTokenManager {
  return new OAuthTokenManager(config);
}

// ============================================================================
// HTTP CLIENT INTEGRATION
// ============================================================================

/**
 * Create a fetch wrapper that automatically adds OAuth authorization headers
 */
export function createOAuthFetch(
  tokenManager: OAuthTokenManager,
  baseFetch: typeof fetch = globalThis.fetch.bind(globalThis)
): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const token = await tokenManager.getAccessToken();

    const headers = new Headers(init?.headers);
    headers.set('Authorization', `Bearer ${token}`);

    return baseFetch(input, {
      ...init,
      headers,
    });
  };
}
