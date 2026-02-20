import type { TokenizationSDKConfig, ApiError, ApiResponse, PaginatedResponse } from '../types.js';

// ============================================================================
// HTTP Client for SDK
// ============================================================================

export interface RequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  headers?: Record<string, string>;
  idempotencyKey?: string;
}

export interface HttpClientConfig {
  baseUrl: string;
  apiKey: string;
  timeout: number;
  retry: {
    maxRetries: number;
    retryDelay: number;
    retryOn: number[];
  };
  defaultHeaders?: Record<string, string>;
}

export class HttpClient {
  private config: HttpClientConfig;

  constructor(sdkConfig: TokenizationSDKConfig) {
    this.config = {
      baseUrl: sdkConfig.baseUrl || 'https://api.tokenisation.io',
      apiKey: sdkConfig.apiKey,
      timeout: sdkConfig.timeout || 30000,
      retry: {
        maxRetries: sdkConfig.retry?.maxRetries ?? 3,
        retryDelay: sdkConfig.retry?.retryDelay ?? 1000,
        retryOn: sdkConfig.retry?.retryOn ?? [408, 429, 500, 502, 503, 504],
      },
      defaultHeaders: sdkConfig.defaultHeaders,
    };
  }

  /**
   * Makes an HTTP request with retry logic.
   */
  async request<T>(options: RequestOptions): Promise<ApiResponse<T>> {
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
        });

        // Extract request ID from response headers
        const requestId = response.headers.get('X-Request-ID') || '';
        const idempotencyKey = response.headers.get('Idempotency-Key') || undefined;

        // Check if response is OK
        if (!response.ok) {
          const errorBody = await response.json().catch(() => ({})) as ApiError;

          // Check if we should retry
          if (this.config.retry.retryOn.includes(response.status) && retries < this.config.retry.maxRetries) {
            retries++;
            const delay = this.getRetryDelay(response, retries);
            await this.sleep(delay);
            continue;
          }

          throw new TokenizationError(
            errorBody.error?.message || `Request failed with status ${response.status}`,
            errorBody.error?.code || 'REQUEST_FAILED',
            response.status,
            requestId,
            errorBody.error?.details
          );
        }

        // Parse response
        const data = await response.json() as T;

        return {
          data,
          requestId,
          idempotencyKey,
        };
      } catch (error) {
        if (error instanceof TokenizationError) {
          throw error;
        }

        lastError = error as Error;

        // Retry on network errors
        if (retries < this.config.retry.maxRetries) {
          retries++;
          const delay = this.config.retry.retryDelay * Math.pow(2, retries - 1);
          await this.sleep(delay);
          continue;
        }

        throw new TokenizationError(
          lastError.message || 'Network error',
          'NETWORK_ERROR',
          0,
          '',
          { originalError: lastError.name }
        );
      }
    }

    throw new TokenizationError(
      lastError?.message || 'Max retries exceeded',
      'MAX_RETRIES_EXCEEDED',
      0,
      ''
    );
  }

  /**
   * Convenience methods for common HTTP verbs.
   */
  async get<T>(path: string, query?: RequestOptions['query']): Promise<ApiResponse<T>> {
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

  async delete<T>(path: string, query?: RequestOptions['query']): Promise<ApiResponse<T>> {
    return this.request<T>({ method: 'DELETE', path, query });
  }

  /**
   * Paginated list helper.
   */
  async list<T>(path: string, query?: RequestOptions['query']): Promise<PaginatedResponse<T>> {
    const response = await this.get<PaginatedResponse<T>>(path, query);
    return response.data;
  }

  /**
   * Builds the full URL with query parameters.
   */
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

  /**
   * Builds request headers.
   */
  private buildHeaders(custom?: Record<string, string>, idempotencyKey?: string): Record<string, string> {
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.config.apiKey}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': '@tokenisation/sdk/1.0.0',
      ...this.config.defaultHeaders,
      ...custom,
    };

    if (idempotencyKey) {
      headers['Idempotency-Key'] = idempotencyKey;
    }

    return headers;
  }

  /**
   * Fetch with timeout support.
   */
  private async fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      return await fetch(url, {
        ...options,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Calculate retry delay, respecting Retry-After header on 429/503.
   */
  private getRetryDelay(response: Response, retryCount: number): number {
    const retryAfter = response.headers.get('Retry-After');
    if (retryAfter && (response.status === 429 || response.status === 503)) {
      const seconds = Number(retryAfter);
      if (!Number.isNaN(seconds) && seconds > 0) {
        return seconds * 1000;
      }
      // Try HTTP-date format
      const date = Date.parse(retryAfter);
      if (!Number.isNaN(date)) {
        const delay = date - Date.now();
        if (delay > 0) return delay;
      }
    }
    return this.config.retry.retryDelay * Math.pow(2, retryCount - 1);
  }

  /**
   * Sleep helper for retry delays.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Custom Error Class
// ============================================================================

export class TokenizationError extends Error {
  code: string;
  statusCode: number;
  requestId: string;
  details?: Record<string, unknown>;

  constructor(
    message: string,
    code: string,
    statusCode: number,
    requestId: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'TokenizationError';
    this.code = code;
    this.statusCode = statusCode;
    this.requestId = requestId;
    this.details = details;
  }
}
