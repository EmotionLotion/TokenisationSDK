/**
 * Tokenisation - Main entry point (Stripe Elements style)
 *
 * @example
 * ```typescript
 * import { Tokenisation } from '@tokenisation/ui-kit';
 *
 * // Initialize with your API key
 * const tokenisation = await Tokenisation.init({
 *   publishableKey: 'pk_live_xxx',
 *   apiUrl: 'https://api.yourplatform.com',
 *   theme: 'dark',
 * });
 *
 * // Use in your React app
 * <TokenisationProvider client={tokenisation}>
 *   <KYCModal />
 * </TokenisationProvider>
 * ```
 */

import { ApiClient, ApiClientConfig } from './ApiClient';
import { EventEmitter, TokenisationEvent } from './EventEmitter';
import { Theme, ThemeConfig, createTheme, defaultTheme } from './Theme';

export interface TokenisationConfig {
  /** Your publishable API key (pk_live_xxx or pk_test_xxx) */
  publishableKey: string;

  /** API base URL (defaults to production) */
  apiUrl?: string;

  /** Theme: 'light' | 'dark' | 'auto' | ThemeConfig */
  theme?: 'light' | 'dark' | 'auto' | ThemeConfig;

  /** Locale for i18n (default: 'en') */
  locale?: string;

  /** Custom fonts */
  fonts?: { family: string; src: string }[];

  /** Enable debug mode */
  debug?: boolean;
}

export interface TokenisationInstance {
  /** API client for backend calls */
  api: ApiClient;

  /** Event emitter for component events */
  events: EventEmitter;

  /** Current theme */
  theme: Theme;

  /** Configuration */
  config: TokenisationConfig;

  /** Ready state */
  isReady: boolean;

  /** Current authenticated user (if any) */
  user: AuthenticatedUser | null;

  /** Set theme dynamically */
  setTheme: (theme: 'light' | 'dark' | ThemeConfig) => void;

  /** Authenticate with wallet */
  authenticate: (walletAddress: string, signature: string, message: string) => Promise<AuthResult>;

  /** Logout */
  logout: () => Promise<void>;

  /** Destroy instance */
  destroy: () => void;
}

export interface AuthenticatedUser {
  id: string;
  address: string;
  name?: string;
  roles: string[];
  kycVerified: boolean;
  kycLevel?: string;
}

export interface AuthResult {
  success: boolean;
  user?: AuthenticatedUser;
  token?: string;
  error?: string;
}

class TokenisationClient implements TokenisationInstance {
  api: ApiClient;
  events: EventEmitter;
  theme: Theme;
  config: TokenisationConfig;
  isReady: boolean = false;
  user: AuthenticatedUser | null = null;

  private _token: string | null = null;

  constructor(config: TokenisationConfig) {
    this.config = config;

    // Validate publishable key
    if (!config.publishableKey) {
      throw new Error('Tokenisation: publishableKey is required');
    }

    if (!config.publishableKey.startsWith('pk_')) {
      throw new Error('Tokenisation: Invalid publishable key format. Expected pk_live_xxx or pk_test_xxx');
    }

    // Determine environment from key
    const isTest = config.publishableKey.startsWith('pk_test_');
    const defaultApiUrl = isTest
      ? 'http://localhost:3001'
      : 'https://api.tokenisation.io';

    // Initialize API client
    const apiConfig: ApiClientConfig = {
      baseUrl: config.apiUrl || defaultApiUrl,
      publishableKey: config.publishableKey,
      getToken: () => this._token,
      onAuthError: () => {
        this.user = null;
        this._token = null;
        this.events.emit('auth:logout', { reason: 'token_expired' });
      },
      debug: config.debug,
    };

    this.api = new ApiClient(apiConfig);

    // Initialize event emitter
    this.events = new EventEmitter();

    // Initialize theme
    this.theme = createTheme(config.theme || 'dark');

    // Debug logging
    if (config.debug) {
      console.log('[Tokenisation] Initialized', {
        environment: isTest ? 'test' : 'live',
        apiUrl: apiConfig.baseUrl,
      });
    }
  }

  async init(): Promise<void> {
    try {
      // Verify API key and fetch configuration
      const health = await this.api.get('/health');

      if (health.status !== 'ok') {
        throw new Error('API not available');
      }

      // Load stored auth token if available
      const storedToken = typeof window !== 'undefined'
        ? localStorage.getItem('tokenisation_auth_token')
        : null;

      if (storedToken) {
        this._token = storedToken;
        try {
          const { party } = await this.api.get('/auth/me');
          this.user = {
            id: party.id,
            address: party.wallets?.[0]?.address || '',
            name: party.name,
            roles: party.roles,
            kycVerified: party.kycVerified,
            kycLevel: party.verificationLevel,
          };
          this.events.emit('auth:restored', { user: this.user });
        } catch {
          // Token expired, clear it
          this._token = null;
          localStorage.removeItem('tokenisation_auth_token');
        }
      }

      this.isReady = true;
      this.events.emit('ready', { timestamp: Date.now() });

      if (this.config.debug) {
        console.log('[Tokenisation] Ready');
      }
    } catch (error: any) {
      this.events.emit('error', {
        type: 'init_failed',
        message: error.message,
      });
      throw error;
    }
  }

  setTheme(theme: 'light' | 'dark' | ThemeConfig): void {
    this.theme = createTheme(theme);
    this.events.emit('theme:changed', { theme: this.theme });
  }

  async authenticate(
    walletAddress: string,
    signature: string,
    message: string
  ): Promise<AuthResult> {
    try {
      const response = await this.api.post('/auth/siwe/verify', {
        message,
        signature,
      });

      this._token = response.token;
      this.user = {
        id: response.party.id,
        address: walletAddress,
        name: response.party.name,
        roles: response.party.roles,
        kycVerified: response.party.kycVerified,
        kycLevel: response.party.verificationLevel,
      };

      // Store token
      if (typeof window !== 'undefined') {
        localStorage.setItem('tokenisation_auth_token', response.token);
      }

      this.events.emit('auth:login', { user: this.user });

      return {
        success: true,
        user: this.user,
        token: response.token,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Authentication failed',
      };
    }
  }

  async logout(): Promise<void> {
    try {
      if (this._token) {
        await this.api.post('/auth/logout', {});
      }
    } catch {
      // Ignore logout errors
    } finally {
      this._token = null;
      this.user = null;
      if (typeof window !== 'undefined') {
        localStorage.removeItem('tokenisation_auth_token');
      }
      this.events.emit('auth:logout', { reason: 'user_initiated' });
    }
  }

  destroy(): void {
    this.events.removeAllListeners();
    this.isReady = false;
    if (this.config.debug) {
      console.log('[Tokenisation] Destroyed');
    }
  }
}

// Singleton instance
let instance: TokenisationInstance | null = null;

/**
 * Initialize Tokenisation (call once at app startup)
 */
export async function init(config: TokenisationConfig): Promise<TokenisationInstance> {
  if (instance) {
    console.warn('[Tokenisation] Already initialized. Call destroy() first to reinitialize.');
    return instance;
  }

  const client = new TokenisationClient(config);
  await client.init();
  instance = client;

  return instance;
}

/**
 * Get the current Tokenisation instance
 */
export function getInstance(): TokenisationInstance | null {
  return instance;
}

/**
 * Destroy the current instance
 */
export function destroy(): void {
  if (instance) {
    instance.destroy();
    instance = null;
  }
}

// Default export
export const Tokenisation = {
  init,
  getInstance,
  destroy,
};
