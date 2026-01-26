/**
 * API Client for backend communication
 *
 * Handles:
 * - Authentication headers
 * - Request/response transformation
 * - Error handling
 * - Retry logic
 * - Rate limiting
 */

export interface ApiClientConfig {
  baseUrl: string;
  publishableKey: string;
  getToken: () => string | null;
  onAuthError?: () => void;
  debug?: boolean;
  timeout?: number;
  retries?: number;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  status: number;
}

export class ApiClientError extends Error {
  code: string;
  status: number;
  details?: Record<string, unknown>;

  constructor(error: ApiError) {
    super(error.message);
    this.name = 'ApiClientError';
    this.code = error.code;
    this.status = error.status;
    this.details = error.details;
  }
}

export class ApiClient {
  private config: ApiClientConfig;
  private abortControllers: Map<string, AbortController> = new Map();

  constructor(config: ApiClientConfig) {
    this.config = {
      timeout: 30000,
      retries: 3,
      ...config,
    };
  }

  private log(...args: unknown[]): void {
    if (this.config.debug) {
      console.log('[Tokenisation:API]', ...args);
    }
  }

  private async request<T>(
    method: string,
    path: string,
    data?: unknown,
    options: { signal?: AbortSignal; skipAuth?: boolean } = {}
  ): Promise<T> {
    const url = `${this.config.baseUrl}${path}`;
    const token = this.config.getToken();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Publishable-Key': this.config.publishableKey,
    };

    if (token && !options.skipAuth) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const requestInit: RequestInit = {
      method,
      headers,
      signal: options.signal,
    };

    if (data && method !== 'GET') {
      requestInit.body = JSON.stringify(data);
    }

    this.log(`${method} ${path}`, data ? { body: data } : '');

    let lastError: Error | null = null;
    const maxRetries = method === 'GET' ? this.config.retries! : 1;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

        const response = await fetch(url, {
          ...requestInit,
          signal: options.signal || controller.signal,
        });

        clearTimeout(timeoutId);

        // Parse response
        const contentType = response.headers.get('content-type');
        let responseData: any;

        if (contentType?.includes('application/json')) {
          responseData = await response.json();
        } else {
          responseData = await response.text();
        }

        // Handle errors
        if (!response.ok) {
          const error: ApiError = {
            code: responseData?.error?.code || 'UNKNOWN_ERROR',
            message: responseData?.error?.message || `HTTP ${response.status}`,
            details: responseData?.error?.details,
            status: response.status,
          };

          // Handle auth errors
          if (response.status === 401) {
            this.config.onAuthError?.();
          }

          throw new ApiClientError(error);
        }

        this.log(`${method} ${path} -> ${response.status}`, responseData);
        return responseData as T;
      } catch (error: any) {
        lastError = error;

        // Don't retry on these errors
        if (
          error instanceof ApiClientError ||
          error.name === 'AbortError' ||
          attempt === maxRetries - 1
        ) {
          throw error;
        }

        // Exponential backoff
        await new Promise((resolve) =>
          setTimeout(resolve, Math.pow(2, attempt) * 100)
        );
      }
    }

    throw lastError;
  }

  // HTTP Methods
  async get<T = any>(path: string, options?: { signal?: AbortSignal }): Promise<T> {
    return this.request<T>('GET', path, undefined, options);
  }

  async post<T = any>(path: string, data?: unknown, options?: { signal?: AbortSignal }): Promise<T> {
    return this.request<T>('POST', path, data, options);
  }

  async patch<T = any>(path: string, data?: unknown, options?: { signal?: AbortSignal }): Promise<T> {
    return this.request<T>('PATCH', path, data, options);
  }

  async delete<T = any>(path: string, options?: { signal?: AbortSignal }): Promise<T> {
    return this.request<T>('DELETE', path, undefined, options);
  }

  // Cancel a specific request
  cancel(requestId: string): void {
    const controller = this.abortControllers.get(requestId);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(requestId);
    }
  }

  // Cancel all pending requests
  cancelAll(): void {
    this.abortControllers.forEach((controller) => controller.abort());
    this.abortControllers.clear();
  }

  // ============================================
  // Domain-specific API methods
  // ============================================

  // Auth
  auth = {
    getNonce: (address: string) =>
      this.post<{ nonce: string; expiresAt: string }>('/auth/siwe/nonce', { address }),

    verify: (message: string, signature: string) =>
      this.post<{ token: string; refreshToken: string; party: any }>('/auth/siwe/verify', {
        message,
        signature,
      }),

    me: () => this.get<{ party: any; wallets: any[] }>('/auth/me'),

    refresh: (refreshToken: string) =>
      this.post<{ token: string; refreshToken: string }>('/auth/refresh', { refreshToken }),

    logout: () => this.post('/auth/logout'),
  };

  // Parties (Identities)
  parties = {
    list: (params?: { page?: number; limit?: number }) =>
      this.get<{ parties: any[]; total: number }>(`/parties${this.buildQuery(params)}`),

    get: (id: string) => this.get<any>(`/parties/${id}`),

    create: (data: {
      name: string;
      type: 'INDIVIDUAL' | 'ORGANIZATION';
      roles: string[];
      jurisdiction: string;
    }) => this.post<any>('/parties', data),

    update: (id: string, data: Partial<{ name: string; metadata: any }>) =>
      this.patch<any>(`/parties/${id}`, data),

    setKyc: (
      id: string,
      data: { verified: boolean; verificationLevel?: string; expiryDate?: string }
    ) => this.post<any>(`/parties/${id}/kyc`, data),

    freeze: (id: string, reason?: string) =>
      this.post<any>(`/parties/${id}/freeze`, { reason }),

    unfreeze: (id: string) => this.post<any>(`/parties/${id}/unfreeze`),
  };

  // Assets
  assets = {
    list: (params?: { state?: string; rightType?: string; page?: number; limit?: number }) =>
      this.get<{ assets: any[]; total: number }>(`/assets${this.buildQuery(params)}`),

    get: (id: string) => this.get<{ asset: any; balances: any }>(`/assets/${id}`),

    create: (data: {
      name: string;
      description?: string;
      rightType: string;
      jurisdiction: { countryCode: string };
      transferabilityRules?: any;
      metadata?: any;
    }) => this.post<any>('/assets', data),

    transition: (id: string, toState: string) =>
      this.post<{ asset: any; event: any }>(`/assets/${id}/transition`, { toState }),
  };

  // Tokens
  tokens = {
    balances: (assetId: string) =>
      this.get<{ balances: any; totalSupply: string }>(`/tokens/${assetId}/balances`),

    balance: (assetId: string, holderId: string) =>
      this.get<{ balance: string }>(`/tokens/${assetId}/balances/${holderId}`),

    mint: (assetId: string, to: string, amount: string) =>
      this.post<{ success: boolean; balance: string; event: any }>(`/tokens/${assetId}/mint`, {
        to,
        amount,
      }),

    transfer: (assetId: string, from: string, to: string, amount: string) =>
      this.post<{ success: boolean; fromBalance: string; toBalance: string; event: any }>(
        `/tokens/${assetId}/transfer`,
        { from, to, amount }
      ),

    burn: (assetId: string, from: string, amount: string) =>
      this.post<{ success: boolean; balance: string; event: any }>(`/tokens/${assetId}/burn`, {
        from,
        amount,
      }),
  };

  // Events
  events = {
    list: (params?: { assetId?: string; type?: string; limit?: number }) =>
      this.get<{ events: any[]; total: number }>(`/events${this.buildQuery(params)}`),

    get: (id: string) => this.get<any>(`/events/${id}`),
  };

  // Helper to build query string
  private buildQuery(params?: Record<string, any>): string {
    if (!params) return '';
    const entries = Object.entries(params).filter(([_, v]) => v !== undefined);
    if (entries.length === 0) return '';
    return '?' + entries.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  }
}
