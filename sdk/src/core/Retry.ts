/**
 * Retry & Error Handling Module
 *
 * Production-grade retry logic with:
 * - Exponential backoff
 * - Jitter to prevent thundering herd
 * - Circuit breaker pattern
 * - Configurable retry strategies
 */

import { ok, err, type Result } from './types.js';

// ============================================================================
// TYPES
// ============================================================================

export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxAttempts?: number;
  /** Initial delay in ms (default: 1000) */
  initialDelayMs?: number;
  /** Maximum delay in ms (default: 30000) */
  maxDelayMs?: number;
  /** Backoff multiplier (default: 2) */
  backoffMultiplier?: number;
  /** Add random jitter to prevent thundering herd (default: true) */
  jitter?: boolean;
  /** Jitter factor 0-1 (default: 0.2) */
  jitterFactor?: number;
  /** Timeout for each attempt in ms (default: 30000) */
  timeoutMs?: number;
  /** Function to determine if error is retryable */
  isRetryable?: (error: Error) => boolean;
  /** Called before each retry */
  onRetry?: (attempt: number, error: Error, delayMs: number) => void;
}

export interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
  attempts: number;
  totalTimeMs: number;
}

export interface CircuitBreakerOptions {
  /** Number of failures before opening circuit (default: 5) */
  failureThreshold?: number;
  /** Time to wait before attempting to close circuit in ms (default: 60000) */
  resetTimeoutMs?: number;
  /** Number of successful calls in half-open state to close circuit (default: 3) */
  successThreshold?: number;
  /** Called when circuit state changes */
  onStateChange?: (state: CircuitState) => void;
}

export enum CircuitState {
  CLOSED = 'CLOSED',       // Normal operation
  OPEN = 'OPEN',           // Failing, reject all calls
  HALF_OPEN = 'HALF_OPEN', // Testing if service recovered
}

// ============================================================================
// DEFAULT RETRYABLE ERRORS
// ============================================================================

const RETRYABLE_ERROR_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EPIPE',
  'EHOSTUNREACH',
  'ENETUNREACH',
]);

const RETRYABLE_HTTP_STATUS = new Set([
  408, // Request Timeout
  429, // Too Many Requests
  500, // Internal Server Error
  502, // Bad Gateway
  503, // Service Unavailable
  504, // Gateway Timeout
]);

export function isRetryableError(error: Error): boolean {
  // Check error code
  if ('code' in error && typeof error.code === 'string') {
    if (RETRYABLE_ERROR_CODES.has(error.code)) return true;
  }

  // Check HTTP status
  if ('status' in error && typeof error.status === 'number') {
    if (RETRYABLE_HTTP_STATUS.has(error.status)) return true;
  }

  // Check for rate limiting
  if (error.message.toLowerCase().includes('rate limit')) return true;
  if (error.message.toLowerCase().includes('too many requests')) return true;

  // Check for temporary failures
  if (error.message.toLowerCase().includes('temporarily unavailable')) return true;
  if (error.message.toLowerCase().includes('try again')) return true;

  return false;
}

// ============================================================================
// RETRY FUNCTION
// ============================================================================

const DEFAULT_RETRY_OPTIONS: Required<Omit<RetryOptions, 'onRetry' | 'isRetryable'>> = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitter: true,
  jitterFactor: 0.2,
  timeoutMs: 30000,
};

function calculateDelay(
  attempt: number,
  options: Required<Omit<RetryOptions, 'onRetry' | 'isRetryable'>>
): number {
  // Exponential backoff
  let delay = options.initialDelayMs * Math.pow(options.backoffMultiplier, attempt - 1);

  // Cap at max delay
  delay = Math.min(delay, options.maxDelayMs);

  // Add jitter
  if (options.jitter) {
    const jitterRange = delay * options.jitterFactor;
    delay = delay + (Math.random() * jitterRange * 2 - jitterRange);
  }

  return Math.floor(delay);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise
      .then(result => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch(error => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

/**
 * Retry an async operation with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<RetryResult<T>> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  const isRetryable = options.isRetryable ?? isRetryableError;
  const startTime = Date.now();
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      const result = await withTimeout(fn(), opts.timeoutMs);
      return {
        success: true,
        result,
        attempts: attempt,
        totalTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if we should retry
      const shouldRetry = attempt < opts.maxAttempts && isRetryable(lastError);

      if (!shouldRetry) {
        break;
      }

      // Calculate delay
      const delayMs = calculateDelay(attempt, opts);

      // Notify callback
      options.onRetry?.(attempt, lastError, delayMs);

      // Wait before retrying
      await sleep(delayMs);
    }
  }

  return {
    success: false,
    error: lastError,
    attempts: opts.maxAttempts,
    totalTimeMs: Date.now() - startTime,
  };
}

/**
 * Retry returning Result type
 */
export async function retryWithResult<T, E = string>(
  fn: () => Promise<Result<T, E>>,
  options: RetryOptions = {}
): Promise<Result<T, E | string>> {
  const result = await retry(async () => {
    const r = await fn();
    if (!r.success) {
      // Convert failed Result to Error for retry logic
      throw new Error(String(r.error));
    }
    return r.data;
  }, options);

  if (result.success && result.result !== undefined) {
    return ok(result.result);
  }

  return err(result.error?.message ?? 'Retry failed');
}

// ============================================================================
// CIRCUIT BREAKER
// ============================================================================

/**
 * Circuit Breaker Pattern
 *
 * Prevents cascading failures by failing fast when a service is down.
 * States:
 * - CLOSED: Normal operation, calls go through
 * - OPEN: Service is down, calls fail immediately
 * - HALF_OPEN: Testing if service recovered
 */
export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime?: number;
  private readonly options: Required<CircuitBreakerOptions>;

  constructor(options: CircuitBreakerOptions = {}) {
    this.options = {
      failureThreshold: options.failureThreshold ?? 5,
      resetTimeoutMs: options.resetTimeoutMs ?? 60000,
      successThreshold: options.successThreshold ?? 3,
      onStateChange: options.onStateChange ?? (() => {}),
    };
  }

  private setState(newState: CircuitState): void {
    if (this.state !== newState) {
      this.state = newState;
      this.options.onStateChange(newState);
    }
  }

  private shouldAttempt(): boolean {
    switch (this.state) {
      case CircuitState.CLOSED:
        return true;

      case CircuitState.OPEN:
        // Check if reset timeout has passed
        if (this.lastFailureTime &&
            Date.now() - this.lastFailureTime >= this.options.resetTimeoutMs) {
          this.setState(CircuitState.HALF_OPEN);
          this.successCount = 0;
          return true;
        }
        return false;

      case CircuitState.HALF_OPEN:
        return true;
    }
  }

  private recordSuccess(): void {
    this.failureCount = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.options.successThreshold) {
        this.setState(CircuitState.CLOSED);
      }
    }
  }

  private recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      // Any failure in half-open state opens the circuit
      this.setState(CircuitState.OPEN);
    } else if (this.failureCount >= this.options.failureThreshold) {
      this.setState(CircuitState.OPEN);
    }
  }

  /**
   * Execute a function through the circuit breaker
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.shouldAttempt()) {
      throw new CircuitOpenError('Circuit breaker is open');
    }

    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  /**
   * Get current circuit state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Get circuit statistics
   */
  getStats(): {
    state: CircuitState;
    failureCount: number;
    successCount: number;
    lastFailureTime?: number;
  } {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
    };
  }

  /**
   * Manually reset the circuit to closed state
   */
  reset(): void {
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = undefined;
    this.setState(CircuitState.CLOSED);
  }

  /**
   * Manually trip the circuit to open state
   */
  trip(): void {
    this.setState(CircuitState.OPEN);
    this.lastFailureTime = Date.now();
  }
}

export class CircuitOpenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CircuitOpenError';
  }
}

// ============================================================================
// RESILIENT CLIENT
// ============================================================================

export interface ResilientClientOptions extends RetryOptions, CircuitBreakerOptions {}

/**
 * Combines retry logic with circuit breaker for resilient API calls
 */
export class ResilientClient {
  private circuitBreaker: CircuitBreaker;
  private retryOptions: RetryOptions;

  constructor(options: ResilientClientOptions = {}) {
    this.circuitBreaker = new CircuitBreaker(options);
    this.retryOptions = options;
  }

  /**
   * Execute an operation with retry and circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const result = await retry(
      () => this.circuitBreaker.execute(fn),
      {
        ...this.retryOptions,
        isRetryable: (error) => {
          // Don't retry if circuit is open
          if (error instanceof CircuitOpenError) return false;
          return this.retryOptions.isRetryable?.(error) ?? isRetryableError(error);
        },
      }
    );

    if (result.success && result.result !== undefined) {
      return result.result;
    }

    throw result.error ?? new Error('Operation failed');
  }

  /**
   * Get circuit breaker state
   */
  getCircuitState(): CircuitState {
    return this.circuitBreaker.getState();
  }

  /**
   * Reset the circuit breaker
   */
  resetCircuit(): void {
    this.circuitBreaker.reset();
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Wrap a function with automatic retry
 */
export function withRetry<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  options?: RetryOptions
): T {
  return (async (...args: Parameters<T>) => {
    const result = await retry(() => fn(...args), options);
    if (result.success) return result.result;
    throw result.error;
  }) as T;
}

/**
 * Create a debounced async function
 */
export function debounceAsync<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  delayMs: number
): T {
  let timeoutId: NodeJS.Timeout | undefined;
  let pendingPromise: Promise<unknown> | undefined;

  return (async (...args: Parameters<T>) => {
    if (timeoutId) clearTimeout(timeoutId);

    return new Promise((resolve, reject) => {
      timeoutId = setTimeout(async () => {
        try {
          pendingPromise = fn(...args);
          const result = await pendingPromise;
          resolve(result);
        } catch (error) {
          reject(error);
        }
      }, delayMs);
    });
  }) as T;
}

/**
 * Create a throttled async function
 */
export function throttleAsync<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  intervalMs: number
): T {
  let lastCallTime = 0;
  let pendingPromise: Promise<unknown> | undefined;

  return (async (...args: Parameters<T>) => {
    const now = Date.now();
    const timeSinceLastCall = now - lastCallTime;

    if (timeSinceLastCall < intervalMs && pendingPromise) {
      return pendingPromise;
    }

    lastCallTime = now;
    pendingPromise = fn(...args);
    return pendingPromise;
  }) as T;
}

export default {
  retry,
  retryWithResult,
  isRetryableError,
  CircuitBreaker,
  CircuitOpenError,
  ResilientClient,
  withRetry,
  debounceAsync,
  throttleAsync,
};
