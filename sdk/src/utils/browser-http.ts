/**
 * Browser HTTP Client
 *
 * Browser-compatible HTTP client that mirrors the core HttpClient pattern
 * (retry logic, idempotency, /api/v1/ paths) but supports JWT Bearer auth
 * from SIWE login instead of API-key auth.
 *
 * Used by sdk-react's TokenisationContext to provide a shared API client.
 */

import type { ApiResponse, PaginatedResponse } from '../types.js';

// ============================================================================
// Config
// ============================================================================

export interface BrowserHttpClientConfig {
  /** API base URL (e.g. https://api.tokenisation.io) */
  baseUrl: string;
  /** Optional publishable key for public endpoints */
  publishableKey?: string;
  /** Callback to retrieve the current JWT access token */
  getAccessToken: () => string | null;
  /** Called on 401 responses */
  onAuthError?: () => void;
  /** Organization ID for multi-tenant requests */
  orgId?: string;
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Retry configuration */
  retry?: {
    maxRetries: number;
    retryDelay: number;
    retryOn?: number[];
  };
}

// ============================================================================
// Request Options
// ============================================================================

export interface BrowserRequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  headers?: Record<string, string>;
  idempotencyKey?: string;
  signal?: AbortSignal;
}

// ============================================================================
// Error Class
// ============================================================================

export class BrowserHttpError extends Error {
  code: string;
  statusCode: number;
  requestId: string;
  details?: Record<string, unknown>;

  constructor(
    message: string,
    code: string,
    statusCode: number,
    requestId: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'BrowserHttpError';
    this.code = code;
    this.statusCode = statusCode;
    this.requestId = requestId;
    this.details = details;
  }
}

// ============================================================================
// Client
// ============================================================================

export class BrowserHttpClient {
  private config: {
    baseUrl: string;
    publishableKey?: string;
    getAccessToken: () => string | null;
    onAuthError?: () => void;
    orgId?: string;
    timeout: number;
    retry: {
      maxRetries: number;
      retryDelay: number;
      retryOn: number[];
    };
  };

  constructor(config: BrowserHttpClientConfig) {
    this.config = {
      baseUrl: config.baseUrl,
      publishableKey: config.publishableKey,
      getAccessToken: config.getAccessToken,
      onAuthError: config.onAuthError,
      orgId: config.orgId,
      timeout: config.timeout ?? 30000,
      retry: {
        maxRetries: config.retry?.maxRetries ?? 3,
        retryDelay: config.retry?.retryDelay ?? 1000,
        retryOn: config.retry?.retryOn ?? [408, 429, 500, 502, 503, 504],
      },
    };
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  async request<T>(options: BrowserRequestOptions): Promise<ApiResponse<T>> {
    const url = this.buildUrl(options.path, options.query);
    const headers = this.buildHeaders(options.headers, options.idempotencyKey);

    let lastError: Error | null = null;
    let retries = 0;

    while (retries <= this.config.retry.maxRetries) {
      try {
        const response = await this.fetchWithTimeout(url, {
          method: options.method,
          headers,
          body: options.body ? JSON.stringify(options.body) : undefined,
          signal: options.signal,
        });

        const requestId = response.headers.get('X-Request-ID') || '';
        const idempotencyKey = response.headers.get('Idempotency-Key') || undefined;

        if (!response.ok) {
          // Handle 401 auth errors
          if (response.status === 401) {
            this.config.onAuthError?.();
          }

          const errorBody = await response.json().catch(() => ({})) as {
            error?: { message?: string; code?: string; details?: Record<string, unknown> };
          };

          if (
            this.config.retry.retryOn.includes(response.status) &&
            retries < this.config.retry.maxRetries
          ) {
            retries++;
            const delay = this.config.retry.retryDelay * Math.pow(2, retries - 1);
            await this.sleep(delay);
            continue;
          }

          throw new BrowserHttpError(
            errorBody.error?.message || `Request failed with status ${response.status}`,
            errorBody.error?.code || 'REQUEST_FAILED',
            response.status,
            requestId,
            errorBody.error?.details,
          );
        }

        const data = await response.json() as T;

        return {
          data,
          requestId,
          idempotencyKey,
        };
      } catch (error) {
        if (error instanceof BrowserHttpError) {
          throw error;
        }

        lastError = error as Error;

        if (retries < this.config.retry.maxRetries) {
          retries++;
          const delay = this.config.retry.retryDelay * Math.pow(2, retries - 1);
          await this.sleep(delay);
          continue;
        }

        throw new BrowserHttpError(
          lastError.message || 'Network error',
          'NETWORK_ERROR',
          0,
          '',
          { originalError: lastError.name },
        );
      }
    }

    throw new BrowserHttpError(
      lastError?.message || 'Max retries exceeded',
      'MAX_RETRIES_EXCEEDED',
      0,
      '',
    );
  }

  async get<T>(path: string, query?: BrowserRequestOptions['query']): Promise<ApiResponse<T>> {
    return this.request<T>({ method: 'GET', path, query });
  }

  async post<T>(path: string, body?: unknown, options?: { idempotencyKey?: string }): Promise<ApiResponse<T>> {
    const idempotencyKey = options?.idempotencyKey || crypto.randomUUID();
    return this.request<T>({ method: 'POST', path, body, idempotencyKey });
  }

  async put<T>(path: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>({ method: 'PUT', path, body });
  }

  async patch<T>(path: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>({ method: 'PATCH', path, body });
  }

  async delete<T>(path: string): Promise<ApiResponse<T>> {
    return this.request<T>({ method: 'DELETE', path });
  }

  async list<T>(path: string, query?: BrowserRequestOptions['query']): Promise<PaginatedResponse<T>> {
    const response = await this.get<PaginatedResponse<T>>(path, query);
    return response.data;
  }

  // --------------------------------------------------------------------------
  // Internal
  // --------------------------------------------------------------------------

  private buildUrl(path: string, query?: Record<string, string | number | boolean | undefined>): string {
    const url = new URL(path, this.config.baseUrl);

    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) {
          url.searchParams.append(key, String(value));
        }
      }
    }

    return url.toString();
  }

  private buildHeaders(custom?: Record<string, string>, idempotencyKey?: string): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    // JWT Bearer auth
    const token = this.config.getAccessToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // Publishable key for public endpoints
    if (this.config.publishableKey) {
      headers['X-Publishable-Key'] = this.config.publishableKey;
    }

    // Org ID for multi-tenant
    if (this.config.orgId) {
      headers['X-Org-Id'] = this.config.orgId;
    }

    if (idempotencyKey) {
      headers['Idempotency-Key'] = idempotencyKey;
    }

    return { ...headers, ...custom };
  }

  private async fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      // Merge abort signals if an external signal is provided
      const externalSignal = options.signal;
      if (externalSignal) {
        externalSignal.addEventListener('abort', () => controller.abort());
      }

      return await fetch(url, {
        ...options,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
