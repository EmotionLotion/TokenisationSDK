/**
 * Resilience Layer
 *
 * Production-grade resilience patterns for external API calls:
 * - Retry with exponential backoff
 * - Circuit breaker
 * - Timeout handling
 * - Bulkhead isolation
 *
 * @example
 * ```typescript
 * const resilient = new ResilientClient({
 *   retry: { maxAttempts: 3, baseDelayMs: 1000 },
 *   circuitBreaker: { failureThreshold: 5, resetTimeoutMs: 30000 },
 *   timeout: 10000,
 * });
 *
 * const result = await resilient.execute(
 *   () => fetch('https://api.stripe.com/v1/charges'),
 *   { operationName: 'stripe.createCharge' }
 * );
 * ```
 */

import { ok, err, type Result } from './types.js';

// ============================================================================
// TYPES
// ============================================================================

export interface RetryConfig {
  /** Maximum number of attempts (default: 3) */
  maxAttempts: number;
  /** Base delay in ms (default: 1000) */
  baseDelayMs: number;
  /** Maximum delay in ms (default: 30000) */
  maxDelayMs: number;
  /** Exponential backoff multiplier (default: 2) */
  multiplier: number;
  /** Jitter factor 0-1 (default: 0.1) */
  jitter: number;
  /** Retryable error codes */
  retryableErrors: Set<string>;
  /** Retryable HTTP status codes */
  retryableStatuses: Set<number>;
}

export interface CircuitBreakerConfig {
  /** Number of failures before opening (default: 5) */
  failureThreshold: number;
  /** Time in ms before attempting reset (default: 30000) */
  resetTimeoutMs: number;
  /** Number of successes needed to close (default: 2) */
  successThreshold: number;
  /** Percentage of requests to allow in half-open (default: 0.5) */
  halfOpenRequestPercentage: number;
}

export interface ResilientClientConfig {
  retry?: Partial<RetryConfig>;
  circuitBreaker?: Partial<CircuitBreakerConfig>;
  /** Request timeout in ms (default: 30000) */
  timeout?: number;
  /** Name for logging/metrics */
  serviceName?: string;
  /** Event handlers */
  onRetry?: (attempt: number, error: Error, nextDelayMs: number) => void;
  onCircuitOpen?: (failures: number) => void;
  onCircuitClose?: () => void;
  onTimeout?: (operationName: string, timeoutMs: number) => void;
}

export interface ExecuteOptions {
  /** Operation name for logging */
  operationName: string;
  /** Override timeout for this call */
  timeout?: number;
  /** Skip circuit breaker check */
  bypassCircuitBreaker?: boolean;
  /** Custom retry predicate */
  shouldRetry?: (error: Error, attempt: number) => boolean;
}

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

// ============================================================================
// DEFAULT CONFIGS
// ============================================================================

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  multiplier: 2,
  jitter: 0.1,
  retryableErrors: new Set([
    'ECONNRESET',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'ENOTFOUND',
    'EAI_AGAIN',
    'NETWORK_ERROR',
  ]),
  retryableStatuses: new Set([
    408, // Request Timeout
    429, // Too Many Requests
    500, // Internal Server Error
    502, // Bad Gateway
    503, // Service Unavailable
    504, // Gateway Timeout
  ]),
};

const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  resetTimeoutMs: 30000,
  successThreshold: 2,
  halfOpenRequestPercentage: 0.5,
};

// ============================================================================
// CIRCUIT BREAKER
// ============================================================================

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime = 0;
  private config: CircuitBreakerConfig;
  private onOpen?: (failures: number) => void;
  private onClose?: () => void;

  constructor(
    config: Partial<CircuitBreakerConfig> = {},
    callbacks?: { onOpen?: (failures: number) => void; onClose?: () => void }
  ) {
    this.config = { ...DEFAULT_CIRCUIT_BREAKER_CONFIG, ...config };
    this.onOpen = callbacks?.onOpen;
    this.onClose = callbacks?.onClose;
  }

  getState(): CircuitState {
    if (this.state === 'OPEN') {
      const timeSinceFailure = Date.now() - this.lastFailureTime;
      if (timeSinceFailure >= this.config.resetTimeoutMs) {
        this.state = 'HALF_OPEN';
        this.successCount = 0;
      }
    }
    return this.state;
  }

  canExecute(): boolean {
    const state = this.getState();
    if (state === 'CLOSED') return true;
    if (state === 'OPEN') return false;
    // HALF_OPEN: allow percentage of requests
    return Math.random() < this.config.halfOpenRequestPercentage;
  }

  recordSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      if (this.successCount >= this.config.successThreshold) {
        this.state = 'CLOSED';
        this.failureCount = 0;
        this.onClose?.();
      }
    } else {
      this.failureCount = 0;
    }
  }

  recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === 'HALF_OPEN') {
      this.state = 'OPEN';
      this.onOpen?.(this.failureCount);
    } else if (this.failureCount >= this.config.failureThreshold) {
      this.state = 'OPEN';
      this.onOpen?.(this.failureCount);
    }
  }

  reset(): void {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = 0;
  }

  getStats(): { state: CircuitState; failureCount: number; successCount: number } {
    return {
      state: this.getState(),
      failureCount: this.failureCount,
      successCount: this.successCount,
    };
  }
}

// ============================================================================
// RESILIENT CLIENT
// ============================================================================

export class ResilientClient {
  private retryConfig: RetryConfig;
  private circuitBreaker: CircuitBreaker;
  private timeout: number;
  private serviceName: string;
  private onRetry?: (attempt: number, error: Error, nextDelayMs: number) => void;
  private onTimeout?: (operationName: string, timeoutMs: number) => void;

  constructor(config: ResilientClientConfig = {}) {
    this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...config.retry };
    this.circuitBreaker = new CircuitBreaker(config.circuitBreaker, {
      onOpen: config.onCircuitOpen,
      onClose: config.onCircuitClose,
    });
    this.timeout = config.timeout ?? 30000;
    this.serviceName = config.serviceName ?? 'unknown';
    this.onRetry = config.onRetry;
    this.onTimeout = config.onTimeout;
  }

  /**
   * Execute an operation with retry and circuit breaker protection
   */
  async execute<T>(
    operation: () => Promise<T>,
    options: ExecuteOptions
  ): Promise<Result<T, string>> {
    // Check circuit breaker
    if (!options.bypassCircuitBreaker && !this.circuitBreaker.canExecute()) {
      return err(`Circuit breaker OPEN for ${this.serviceName}: ${options.operationName}`);
    }

    const timeoutMs = options.timeout ?? this.timeout;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.retryConfig.maxAttempts; attempt++) {
      try {
        const result = await this.executeWithTimeout(operation, timeoutMs, options.operationName);
        this.circuitBreaker.recordSuccess();
        return ok(result);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if we should retry
        const shouldRetry = options.shouldRetry
          ? options.shouldRetry(lastError, attempt)
          : this.isRetryable(lastError);

        if (!shouldRetry || attempt >= this.retryConfig.maxAttempts) {
          this.circuitBreaker.recordFailure();
          break;
        }

        // Calculate delay with exponential backoff and jitter
        const delay = this.calculateDelay(attempt);
        this.onRetry?.(attempt, lastError, delay);

        await this.sleep(delay);
      }
    }

    return err(
      `${options.operationName} failed after ${this.retryConfig.maxAttempts} attempts: ${lastError?.message}`
    );
  }

  /**
   * Execute a fetch request with resilience
   */
  async fetch(
    url: string,
    init: RequestInit,
    options: ExecuteOptions
  ): Promise<Result<Response, string>> {
    return this.execute(
      async () => {
        const response = await fetch(url, init);

        // Treat certain HTTP statuses as errors for retry purposes
        if (!response.ok && this.retryConfig.retryableStatuses.has(response.status)) {
          const error = new Error(`HTTP ${response.status}`);
          (error as NodeJS.ErrnoException).code = `HTTP_${response.status}`;
          throw error;
        }

        return response;
      },
      options
    );
  }

  getCircuitBreakerState(): CircuitState {
    return this.circuitBreaker.getState();
  }

  getCircuitBreakerStats(): { state: CircuitState; failureCount: number; successCount: number } {
    return this.circuitBreaker.getStats();
  }

  resetCircuitBreaker(): void {
    this.circuitBreaker.reset();
  }

  private async executeWithTimeout<T>(
    operation: () => Promise<T>,
    timeoutMs: number,
    operationName: string
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.onTimeout?.(operationName, timeoutMs);
        reject(new Error(`Operation timed out after ${timeoutMs}ms: ${operationName}`));
      }, timeoutMs);

      operation()
        .then((result) => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }

  private isRetryable(error: Error): boolean {
    // Check error code
    const code = (error as NodeJS.ErrnoException).code;
    if (code && this.retryConfig.retryableErrors.has(code)) {
      return true;
    }

    // Check for HTTP status in error code
    if (code?.startsWith('HTTP_')) {
      const status = parseInt(code.slice(5), 10);
      return this.retryConfig.retryableStatuses.has(status);
    }

    // Check error message for common patterns
    const message = error.message.toLowerCase();
    if (
      message.includes('timeout') ||
      message.includes('network') ||
      message.includes('connection') ||
      message.includes('econnreset') ||
      message.includes('socket hang up')
    ) {
      return true;
    }

    return false;
  }

  private calculateDelay(attempt: number): number {
    // Exponential backoff
    let delay = this.retryConfig.baseDelayMs * Math.pow(this.retryConfig.multiplier, attempt - 1);

    // Apply jitter
    const jitterRange = delay * this.retryConfig.jitter;
    delay += Math.random() * jitterRange * 2 - jitterRange;

    // Cap at max delay
    return Math.min(delay, this.retryConfig.maxDelayMs);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/**
 * Create a resilient client for payment providers
 */
export function createPaymentResilientClient(
  serviceName: string,
  callbacks?: {
    onRetry?: (attempt: number, error: Error, nextDelayMs: number) => void;
    onCircuitOpen?: (failures: number) => void;
  }
): ResilientClient {
  return new ResilientClient({
    serviceName,
    timeout: 30000,
    retry: {
      maxAttempts: 3,
      baseDelayMs: 1000,
      maxDelayMs: 10000,
    },
    circuitBreaker: {
      failureThreshold: 5,
      resetTimeoutMs: 60000,
    },
    onRetry: callbacks?.onRetry,
    onCircuitOpen: callbacks?.onCircuitOpen,
  });
}

/**
 * Create a resilient client for KYC providers
 */
export function createKYCResilientClient(
  serviceName: string,
  callbacks?: {
    onRetry?: (attempt: number, error: Error, nextDelayMs: number) => void;
    onCircuitOpen?: (failures: number) => void;
  }
): ResilientClient {
  return new ResilientClient({
    serviceName,
    timeout: 60000, // KYC can be slow
    retry: {
      maxAttempts: 2,
      baseDelayMs: 2000,
      maxDelayMs: 15000,
    },
    circuitBreaker: {
      failureThreshold: 3,
      resetTimeoutMs: 120000,
    },
    onRetry: callbacks?.onRetry,
    onCircuitOpen: callbacks?.onCircuitOpen,
  });
}

/**
 * Create a resilient client for blockchain RPC
 */
export function createBlockchainResilientClient(
  serviceName: string,
  callbacks?: {
    onRetry?: (attempt: number, error: Error, nextDelayMs: number) => void;
    onCircuitOpen?: (failures: number) => void;
  }
): ResilientClient {
  return new ResilientClient({
    serviceName,
    timeout: 15000,
    retry: {
      maxAttempts: 5,
      baseDelayMs: 500,
      maxDelayMs: 5000,
    },
    circuitBreaker: {
      failureThreshold: 10,
      resetTimeoutMs: 30000,
    },
    onRetry: callbacks?.onRetry,
    onCircuitOpen: callbacks?.onCircuitOpen,
  });
}
