/**
 * Rate Limiter
 *
 * Token bucket algorithm implementation for rate limiting API calls.
 * Supports request queuing with configurable wait times.
 *
 * @example
 * ```typescript
 * const limiter = new RateLimiter({
 *   bucketSize: 100,
 *   refillRate: 100,
 *   refillIntervalMs: 1000,
 *   maxWaitMs: 30000,
 * });
 *
 * // Will wait if bucket is empty, up to maxWaitMs
 * await limiter.acquire();
 * await makeApiCall();
 * ```
 */

import { ok, err, type Result } from './types.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Rate limiter configuration
 */
export interface RateLimiterConfig {
  /** Maximum tokens in bucket (burst capacity) */
  bucketSize: number;
  /** Tokens added per refill interval */
  refillRate: number;
  /** Refill interval in milliseconds */
  refillIntervalMs: number;
  /** Maximum time to wait for a token (ms). 0 = reject immediately when empty */
  maxWaitMs?: number;
  /** Maximum queue size for waiting requests. 0 = unlimited */
  maxQueueSize?: number;
  /** Name for metrics/logging */
  name?: string;
}

/**
 * Rate limit event types
 */
export type RateLimitEventType = 'acquired' | 'queued' | 'rejected' | 'timeout';

/**
 * Rate limit event callback
 */
export type RateLimitEventCallback = (event: {
  type: RateLimitEventType;
  name: string;
  queueSize: number;
  availableTokens: number;
  waitTimeMs?: number;
}) => void;

/**
 * Rate limiter statistics
 */
export interface RateLimiterStats {
  name: string;
  availableTokens: number;
  queueSize: number;
  totalAcquired: number;
  totalQueued: number;
  totalRejected: number;
  totalTimeouts: number;
  averageWaitMs: number;
}

// ============================================================================
// RATE LIMITER
// ============================================================================

/**
 * Token bucket rate limiter with request queuing
 */
export class RateLimiter {
  private tokens: number;
  private lastRefillTime: number;
  private config: Required<RateLimiterConfig>;
  private queue: Array<{
    resolve: (acquired: boolean) => void;
    enqueuedAt: number;
    timeoutId: ReturnType<typeof setTimeout>;
  }> = [];
  private onEvent?: RateLimitEventCallback;
  private refillTimer?: ReturnType<typeof setInterval>;

  // Stats
  private totalAcquired = 0;
  private totalQueued = 0;
  private totalRejected = 0;
  private totalTimeouts = 0;
  private totalWaitMs = 0;
  private waitCount = 0;

  constructor(config: RateLimiterConfig, onEvent?: RateLimitEventCallback) {
    this.config = {
      bucketSize: config.bucketSize,
      refillRate: config.refillRate,
      refillIntervalMs: config.refillIntervalMs,
      maxWaitMs: config.maxWaitMs ?? 0,
      maxQueueSize: config.maxQueueSize ?? 0,
      name: config.name ?? 'default',
    };

    this.tokens = config.bucketSize;
    this.lastRefillTime = Date.now();
    this.onEvent = onEvent;

    // Start refill timer
    this.startRefillTimer();
  }

  /**
   * Acquire a token (rate limit slot)
   * Returns true if acquired, false if rejected/timed out
   */
  async acquire(): Promise<boolean> {
    // Refill tokens first
    this.refill();

    // Try to acquire immediately
    if (this.tokens >= 1) {
      this.tokens -= 1;
      this.totalAcquired++;
      this.emitEvent('acquired');
      return true;
    }

    // No tokens available - check if we should queue
    if (this.config.maxWaitMs === 0) {
      this.totalRejected++;
      this.emitEvent('rejected');
      return false;
    }

    // Check queue size limit
    if (this.config.maxQueueSize > 0 && this.queue.length >= this.config.maxQueueSize) {
      this.totalRejected++;
      this.emitEvent('rejected');
      return false;
    }

    // Queue the request
    return this.enqueue();
  }

  /**
   * Try to acquire without waiting
   * Returns true only if a token is immediately available
   */
  tryAcquire(): boolean {
    this.refill();

    if (this.tokens >= 1) {
      this.tokens -= 1;
      this.totalAcquired++;
      this.emitEvent('acquired');
      return true;
    }

    return false;
  }

  /**
   * Acquire with explicit timeout (overrides config.maxWaitMs)
   */
  async acquireWithTimeout(timeoutMs: number): Promise<Result<void, string>> {
    this.refill();

    if (this.tokens >= 1) {
      this.tokens -= 1;
      this.totalAcquired++;
      this.emitEvent('acquired');
      return ok(undefined);
    }

    if (timeoutMs === 0) {
      this.totalRejected++;
      this.emitEvent('rejected');
      return err('Rate limit exceeded');
    }

    const acquired = await this.enqueueWithTimeout(timeoutMs);
    if (acquired) {
      return ok(undefined);
    }
    return err('Rate limit timeout');
  }

  /**
   * Get current statistics
   */
  getStats(): RateLimiterStats {
    this.refill();
    return {
      name: this.config.name,
      availableTokens: this.tokens,
      queueSize: this.queue.length,
      totalAcquired: this.totalAcquired,
      totalQueued: this.totalQueued,
      totalRejected: this.totalRejected,
      totalTimeouts: this.totalTimeouts,
      averageWaitMs: this.waitCount > 0 ? this.totalWaitMs / this.waitCount : 0,
    };
  }

  /**
   * Get current token count
   */
  getAvailableTokens(): number {
    this.refill();
    return this.tokens;
  }

  /**
   * Get current queue size
   */
  getQueueSize(): number {
    return this.queue.length;
  }

  /**
   * Reset the rate limiter to full capacity
   */
  reset(): void {
    this.tokens = this.config.bucketSize;
    this.lastRefillTime = Date.now();

    // Clear queue - reject all waiting requests
    for (const item of this.queue) {
      clearTimeout(item.timeoutId);
      item.resolve(false);
    }
    this.queue = [];
  }

  /**
   * Stop the rate limiter (clean up timers)
   */
  stop(): void {
    if (this.refillTimer) {
      clearInterval(this.refillTimer);
      this.refillTimer = undefined;
    }
    this.reset();
  }

  /**
   * Refill tokens based on elapsed time
   */
  private refill(): void {
    const now = Date.now();
    const elapsedMs = now - this.lastRefillTime;
    const intervalsElapsed = Math.floor(elapsedMs / this.config.refillIntervalMs);

    if (intervalsElapsed > 0) {
      const tokensToAdd = intervalsElapsed * this.config.refillRate;
      this.tokens = Math.min(this.config.bucketSize, this.tokens + tokensToAdd);
      this.lastRefillTime = now - (elapsedMs % this.config.refillIntervalMs);

      // Process queue if we have tokens
      this.processQueue();
    }
  }

  /**
   * Start the refill timer
   */
  private startRefillTimer(): void {
    this.refillTimer = setInterval(() => {
      this.refill();
    }, this.config.refillIntervalMs);

    // Prevent timer from blocking process exit
    if (this.refillTimer.unref) {
      this.refillTimer.unref();
    }
  }

  /**
   * Enqueue a request to wait for a token
   */
  private enqueue(): Promise<boolean> {
    return this.enqueueWithTimeout(this.config.maxWaitMs);
  }

  /**
   * Enqueue with specific timeout
   */
  private enqueueWithTimeout(timeoutMs: number): Promise<boolean> {
    this.totalQueued++;
    const enqueuedAt = Date.now();

    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        // Remove from queue
        const index = this.queue.findIndex((item) => item.timeoutId === timeoutId);
        if (index !== -1) {
          this.queue.splice(index, 1);
          this.totalTimeouts++;
          this.emitEvent('timeout');
          resolve(false);
        }
      }, timeoutMs);

      this.queue.push({ resolve, enqueuedAt, timeoutId });
      this.emitEvent('queued');
    });
  }

  /**
   * Process queued requests when tokens become available
   */
  private processQueue(): void {
    while (this.tokens >= 1 && this.queue.length > 0) {
      const item = this.queue.shift()!;
      clearTimeout(item.timeoutId);

      this.tokens -= 1;
      this.totalAcquired++;

      const waitMs = Date.now() - item.enqueuedAt;
      this.totalWaitMs += waitMs;
      this.waitCount++;

      this.emitEvent('acquired', waitMs);
      item.resolve(true);
    }
  }

  /**
   * Emit rate limit event
   */
  private emitEvent(type: RateLimitEventType, waitTimeMs?: number): void {
    if (this.onEvent) {
      this.onEvent({
        type,
        name: this.config.name,
        queueSize: this.queue.length,
        availableTokens: this.tokens,
        waitTimeMs,
      });
    }
  }
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/**
 * Default rate limiter configs for common providers
 */
export const RATE_LIMITER_PRESETS = {
  stripe: {
    bucketSize: 100,
    refillRate: 100,
    refillIntervalMs: 1000,
    maxWaitMs: 30000,
    maxQueueSize: 1000,
    name: 'stripe',
  } satisfies RateLimiterConfig,

  circle: {
    bucketSize: 50,
    refillRate: 50,
    refillIntervalMs: 1000,
    maxWaitMs: 30000,
    maxQueueSize: 500,
    name: 'circle',
  } satisfies RateLimiterConfig,

  blockchain: {
    bucketSize: 10,
    refillRate: 5,
    refillIntervalMs: 1000,
    maxWaitMs: 60000,
    maxQueueSize: 100,
    name: 'blockchain',
  } satisfies RateLimiterConfig,

  kyc: {
    bucketSize: 20,
    refillRate: 10,
    refillIntervalMs: 1000,
    maxWaitMs: 30000,
    maxQueueSize: 200,
    name: 'kyc',
  } satisfies RateLimiterConfig,
};

/**
 * Create a rate limiter for Stripe API
 */
export function createStripeRateLimiter(
  onEvent?: RateLimitEventCallback,
  overrides?: Partial<RateLimiterConfig>
): RateLimiter {
  return new RateLimiter(
    { ...RATE_LIMITER_PRESETS.stripe, ...overrides },
    onEvent
  );
}

/**
 * Create a rate limiter for Circle API
 */
export function createCircleRateLimiter(
  onEvent?: RateLimitEventCallback,
  overrides?: Partial<RateLimiterConfig>
): RateLimiter {
  return new RateLimiter(
    { ...RATE_LIMITER_PRESETS.circle, ...overrides },
    onEvent
  );
}

/**
 * Create a rate limiter for blockchain RPC calls
 */
export function createBlockchainRateLimiter(
  onEvent?: RateLimitEventCallback,
  overrides?: Partial<RateLimiterConfig>
): RateLimiter {
  return new RateLimiter(
    { ...RATE_LIMITER_PRESETS.blockchain, ...overrides },
    onEvent
  );
}

/**
 * Create a rate limiter for KYC providers
 */
export function createKYCRateLimiter(
  onEvent?: RateLimitEventCallback,
  overrides?: Partial<RateLimiterConfig>
): RateLimiter {
  return new RateLimiter(
    { ...RATE_LIMITER_PRESETS.kyc, ...overrides },
    onEvent
  );
}

export default RateLimiter;
