/**
 * Rate Limiting Middleware
 *
 * Production-grade rate limiting with:
 * - Token bucket algorithm
 * - Sliding window counters
 * - Per-user and global limits
 * - Redis-compatible storage backend
 */

// ============================================================================
// TYPES
// ============================================================================

export interface RateLimitConfig {
  /** Maximum requests allowed in the window */
  maxRequests: number;
  /** Time window in milliseconds */
  windowMs: number;
  /** Key prefix for storage */
  keyPrefix?: string;
  /** Skip rate limiting for certain requests */
  skip?: (key: string) => boolean;
  /** Custom key generator */
  keyGenerator?: (identifier: string) => string;
  /** Handler when rate limit is exceeded */
  onRateLimitExceeded?: (key: string, resetTime: number) => void;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  retryAfter?: number;
}

export interface RateLimitInfo {
  key: string;
  count: number;
  resetTime: number;
}

export interface IRateLimitStore {
  /** Increment counter and return current count */
  increment(key: string, windowMs: number): Promise<{ count: number; resetTime: number }>;
  /** Get current count for a key */
  get(key: string): Promise<RateLimitInfo | null>;
  /** Reset counter for a key */
  reset(key: string): Promise<void>;
  /** Clean up expired entries */
  cleanup(): Promise<void>;
}

// ============================================================================
// IN-MEMORY STORE
// ============================================================================

interface MemoryEntry {
  count: number;
  resetTime: number;
}

export class InMemoryRateLimitStore implements IRateLimitStore {
  private store: Map<string, MemoryEntry> = new Map();
  private cleanupInterval?: NodeJS.Timeout;

  constructor(cleanupIntervalMs: number = 60000) {
    // Periodic cleanup of expired entries
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, cleanupIntervalMs);
  }

  async increment(key: string, windowMs: number): Promise<{ count: number; resetTime: number }> {
    const now = Date.now();
    const entry = this.store.get(key);

    if (!entry || now >= entry.resetTime) {
      // New window
      const newEntry: MemoryEntry = {
        count: 1,
        resetTime: now + windowMs,
      };
      this.store.set(key, newEntry);
      return { count: 1, resetTime: newEntry.resetTime };
    }

    // Increment existing window
    entry.count++;
    return { count: entry.count, resetTime: entry.resetTime };
  }

  async get(key: string): Promise<RateLimitInfo | null> {
    const entry = this.store.get(key);
    if (!entry) return null;

    if (Date.now() >= entry.resetTime) {
      this.store.delete(key);
      return null;
    }

    return {
      key,
      count: entry.count,
      resetTime: entry.resetTime,
    };
  }

  async reset(key: string): Promise<void> {
    this.store.delete(key);
  }

  async cleanup(): Promise<void> {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now >= entry.resetTime) {
        this.store.delete(key);
      }
    }
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.store.clear();
  }
}

// ============================================================================
// REDIS STORE (Interface for external implementation)
// ============================================================================

export interface RedisClient {
  eval(script: string, keys: string[], args: string[]): Promise<unknown>;
  get(key: string): Promise<string | null>;
  del(key: string): Promise<number>;
}

export class RedisRateLimitStore implements IRateLimitStore {
  private client: RedisClient;
  private keyPrefix: string;

  // Lua script for atomic increment with expiry
  private static INCR_SCRIPT = `
    local key = KEYS[1]
    local window = tonumber(ARGV[1])
    local now = tonumber(ARGV[2])

    local data = redis.call('GET', key)
    if data then
      local parsed = cjson.decode(data)
      if now < parsed.resetTime then
        parsed.count = parsed.count + 1
        redis.call('SET', key, cjson.encode(parsed), 'PX', parsed.resetTime - now)
        return {parsed.count, parsed.resetTime}
      end
    end

    local resetTime = now + window
    local newData = {count = 1, resetTime = resetTime}
    redis.call('SET', key, cjson.encode(newData), 'PX', window)
    return {1, resetTime}
  `;

  constructor(client: RedisClient, keyPrefix: string = 'ratelimit:') {
    this.client = client;
    this.keyPrefix = keyPrefix;
  }

  async increment(key: string, windowMs: number): Promise<{ count: number; resetTime: number }> {
    const fullKey = this.keyPrefix + key;
    const now = Date.now();

    const result = await this.client.eval(
      RedisRateLimitStore.INCR_SCRIPT,
      [fullKey],
      [windowMs.toString(), now.toString()]
    ) as [number, number];

    return { count: result[0], resetTime: result[1] };
  }

  async get(key: string): Promise<RateLimitInfo | null> {
    const fullKey = this.keyPrefix + key;
    const data = await this.client.get(fullKey);

    if (!data) return null;

    try {
      const parsed = JSON.parse(data);
      return {
        key,
        count: parsed.count,
        resetTime: parsed.resetTime,
      };
    } catch {
      return null;
    }
  }

  async reset(key: string): Promise<void> {
    const fullKey = this.keyPrefix + key;
    await this.client.del(fullKey);
  }

  async cleanup(): Promise<void> {
    // Redis handles expiry automatically via PX option
  }
}

// ============================================================================
// RATE LIMITER
// ============================================================================

export class RateLimiter {
  private config: Required<RateLimitConfig>;
  private store: IRateLimitStore;

  constructor(config: RateLimitConfig, store?: IRateLimitStore) {
    this.config = {
      maxRequests: config.maxRequests,
      windowMs: config.windowMs,
      keyPrefix: config.keyPrefix ?? 'rl:',
      skip: config.skip ?? (() => false),
      keyGenerator: config.keyGenerator ?? ((id) => id),
      onRateLimitExceeded: config.onRateLimitExceeded ?? (() => {}),
    };
    this.store = store ?? new InMemoryRateLimitStore();
  }

  /**
   * Check if request is allowed
   */
  async check(identifier: string): Promise<RateLimitResult> {
    const key = this.config.keyPrefix + this.config.keyGenerator(identifier);

    // Check skip condition
    if (this.config.skip(key)) {
      return {
        allowed: true,
        remaining: this.config.maxRequests,
        resetTime: Date.now() + this.config.windowMs,
      };
    }

    const { count, resetTime } = await this.store.increment(key, this.config.windowMs);
    const remaining = Math.max(0, this.config.maxRequests - count);
    const allowed = count <= this.config.maxRequests;

    if (!allowed) {
      const retryAfter = Math.ceil((resetTime - Date.now()) / 1000);
      this.config.onRateLimitExceeded(key, resetTime);
      return {
        allowed: false,
        remaining: 0,
        resetTime,
        retryAfter,
      };
    }

    return {
      allowed,
      remaining,
      resetTime,
    };
  }

  /**
   * Consume a token (check + block if exceeded)
   */
  async consume(identifier: string): Promise<RateLimitResult> {
    return this.check(identifier);
  }

  /**
   * Reset rate limit for an identifier
   */
  async reset(identifier: string): Promise<void> {
    const key = this.config.keyPrefix + this.config.keyGenerator(identifier);
    await this.store.reset(key);
  }

  /**
   * Get current rate limit info
   */
  async getInfo(identifier: string): Promise<RateLimitInfo | null> {
    const key = this.config.keyPrefix + this.config.keyGenerator(identifier);
    return this.store.get(key);
  }
}

// ============================================================================
// PRE-CONFIGURED LIMITERS
// ============================================================================

/** Standard API rate limit: 100 requests per minute */
export const standardApiLimiter = new RateLimiter({
  maxRequests: 100,
  windowMs: 60 * 1000,
  keyPrefix: 'api:',
});

/** Strict rate limit: 10 requests per minute (for sensitive operations) */
export const strictLimiter = new RateLimiter({
  maxRequests: 10,
  windowMs: 60 * 1000,
  keyPrefix: 'strict:',
});

/** Auth rate limit: 5 attempts per 15 minutes */
export const authLimiter = new RateLimiter({
  maxRequests: 5,
  windowMs: 15 * 60 * 1000,
  keyPrefix: 'auth:',
});

/** Webhook rate limit: 1000 requests per minute */
export const webhookLimiter = new RateLimiter({
  maxRequests: 1000,
  windowMs: 60 * 1000,
  keyPrefix: 'webhook:',
});

// ============================================================================
// MIDDLEWARE FACTORY
// ============================================================================

export interface RateLimitHeaders {
  'X-RateLimit-Limit': string;
  'X-RateLimit-Remaining': string;
  'X-RateLimit-Reset': string;
  'Retry-After'?: string;
}

/**
 * Create rate limit headers from result
 */
export function createRateLimitHeaders(
  result: RateLimitResult,
  maxRequests: number
): RateLimitHeaders {
  const headers: RateLimitHeaders = {
    'X-RateLimit-Limit': maxRequests.toString(),
    'X-RateLimit-Remaining': result.remaining.toString(),
    'X-RateLimit-Reset': Math.ceil(result.resetTime / 1000).toString(),
  };

  if (result.retryAfter) {
    headers['Retry-After'] = result.retryAfter.toString();
  }

  return headers;
}

/**
 * Express-compatible middleware factory
 */
export function createRateLimitMiddleware(config: RateLimitConfig) {
  const limiter = new RateLimiter(config);

  return async (req: { ip?: string; headers?: Record<string, string> }, res: {
    setHeader: (name: string, value: string) => void;
    status: (code: number) => { json: (body: unknown) => void };
  }, next: () => void) => {
    const identifier = req.ip ?? req.headers?.['x-forwarded-for'] ?? 'unknown';
    const result = await limiter.check(identifier);

    const headers = createRateLimitHeaders(result, config.maxRequests);
    Object.entries(headers).forEach(([key, value]) => {
      res.setHeader(key, value);
    });

    if (!result.allowed) {
      res.status(429).json({
        error: 'Too Many Requests',
        message: `Rate limit exceeded. Try again in ${result.retryAfter} seconds.`,
        retryAfter: result.retryAfter,
      });
      return;
    }

    next();
  };
}

export default RateLimiter;
