/**
 * Redis-backed Rate Limiting Middleware
 *
 * Production-ready rate limiting with Redis backend.
 * Falls back to in-memory storage when Redis is not available.
 *
 * Features:
 * - Sliding window rate limiting
 * - Distributed rate limiting via Redis
 * - Graceful degradation to in-memory
 * - Multiple limit tiers (standard, auth, heavy, burst)
 * - Customizable key generation
 */

import { Request, Response, NextFunction } from 'express';
import Redis from 'ioredis';

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface RateLimitConfig {
  /** Time window in milliseconds */
  windowMs: number;
  /** Maximum requests per window */
  maxRequests: number;
  /** Custom key generator function */
  keyGenerator?: (req: Request) => string;
  /** Skip failed requests from count */
  skipFailedRequests?: boolean;
  /** Skip successful requests from count */
  skipSuccessfulRequests?: boolean;
  /** Custom error message */
  message?: string;
  /** Prefix for Redis keys */
  keyPrefix?: string;
  /** Use sliding window algorithm (more accurate but more expensive) */
  slidingWindow?: boolean;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: number;
  retryAfterMs?: number;
}

export interface RequestWithRateLimit extends Request {
  rateLimitInfo?: RateLimitInfo;
  requestId?: string;
}

// ============================================================================
// Redis Connection
// ============================================================================

let redisClient: Redis | null = null;
let redisAvailable = false;
let redisConnectionAttempted = false;

/**
 * Get or create Redis client connection.
 * Returns null if Redis is not configured or unavailable.
 */
function getRedisClient(): Redis | null {
  if (redisConnectionAttempted) {
    return redisAvailable ? redisClient : null;
  }

  redisConnectionAttempted = true;

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    console.warn('[RateLimit] REDIS_URL not configured. Using in-memory rate limiting.');
    console.warn('[RateLimit] Warning: In-memory rate limiting does not work across multiple server instances.');
    return null;
  }

  try {
    redisClient = new Redis(redisUrl, {
      // Connection options
      retryStrategy: (times) => {
        if (times > 3) {
          console.error('[RateLimit] Redis connection failed after 3 attempts. Falling back to in-memory.');
          redisAvailable = false;
          return null; // Stop retrying
        }
        return Math.min(times * 100, 3000);
      },
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
      lazyConnect: false,
      // Timeouts
      connectTimeout: 5000,
      commandTimeout: 2000,
    });

    redisClient.on('connect', () => {
      console.log('[RateLimit] Redis connected successfully.');
      redisAvailable = true;
    });

    redisClient.on('error', (err) => {
      console.error('[RateLimit] Redis error:', err.message);
      redisAvailable = false;
    });

    redisClient.on('close', () => {
      console.warn('[RateLimit] Redis connection closed.');
      redisAvailable = false;
    });

    redisClient.on('reconnecting', () => {
      console.log('[RateLimit] Redis reconnecting...');
    });

    return redisClient;
  } catch (error) {
    console.error('[RateLimit] Failed to create Redis client:', error);
    return null;
  }
}

/**
 * Check if Redis is available for rate limiting.
 */
export function isRedisAvailable(): boolean {
  return redisAvailable;
}

/**
 * Gracefully close Redis connection.
 */
export async function closeRedisConnection(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    redisAvailable = false;
    redisConnectionAttempted = false;
  }
}

// ============================================================================
// In-Memory Fallback Store
// ============================================================================

const inMemoryStore = new Map<string, RateLimitEntry>();

// Clean up expired entries every minute
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of inMemoryStore.entries()) {
    if (entry.resetAt < now) {
      inMemoryStore.delete(key);
    }
  }
}, 60000);

// ============================================================================
// Rate Limit Implementation
// ============================================================================

/**
 * Default key generator - uses API key, org ID, or IP address.
 */
function defaultKeyGenerator(req: Request): string {
  // Try API key first (most specific)
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer sk_')) {
    // Use first 32 chars of API key as identifier
    return `apikey:${authHeader.substring(7, 39)}`;
  }

  // Try dev org ID (for development)
  const devOrgId = req.headers['x-dev-org-id'] as string;
  if (devOrgId) {
    return `org:${devOrgId}`;
  }

  // Try JWT user ID
  const user = (req as any).user;
  if (user?.partyId) {
    return `party:${user.partyId}`;
  }

  // Fall back to IP address
  const ip = req.ip
    || (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
    || req.socket.remoteAddress
    || 'unknown';

  return `ip:${ip}`;
}

/**
 * Increment rate limit counter using Redis.
 * Uses MULTI/EXEC for atomic operations.
 */
async function incrementRedis(
  client: Redis,
  key: string,
  windowMs: number,
  maxRequests: number,
  slidingWindow: boolean
): Promise<{ count: number; resetAt: number; allowed: boolean }> {
  const now = Date.now();
  const windowKey = slidingWindow
    ? key
    : `${key}:${Math.floor(now / windowMs)}`;

  if (slidingWindow) {
    // Sliding window using sorted set
    const windowStart = now - windowMs;
    const resetAt = now + windowMs;

    // Remove old entries and add new one atomically
    const multi = client.multi();
    multi.zremrangebyscore(windowKey, '-inf', windowStart.toString());
    multi.zadd(windowKey, now.toString(), `${now}:${Math.random()}`);
    multi.zcard(windowKey);
    multi.pexpire(windowKey, windowMs + 1000); // Extra second for safety

    const results = await multi.exec();
    if (!results) {
      throw new Error('Redis transaction failed');
    }

    const count = results[2]?.[1] as number || 0;
    return {
      count,
      resetAt,
      allowed: count <= maxRequests,
    };
  } else {
    // Fixed window using simple counter
    const resetAt = (Math.floor(now / windowMs) + 1) * windowMs;
    const ttlMs = Math.ceil((resetAt - now) / 1000) + 1;

    const multi = client.multi();
    multi.incr(windowKey);
    multi.expire(windowKey, ttlMs);

    const results = await multi.exec();
    if (!results) {
      throw new Error('Redis transaction failed');
    }

    const count = results[0]?.[1] as number || 0;
    return {
      count,
      resetAt,
      allowed: count <= maxRequests,
    };
  }
}

/**
 * Decrement rate limit counter using Redis.
 */
async function decrementRedis(
  client: Redis,
  key: string,
  windowMs: number,
  slidingWindow: boolean
): Promise<void> {
  const now = Date.now();
  const windowKey = slidingWindow
    ? key
    : `${key}:${Math.floor(now / windowMs)}`;

  if (slidingWindow) {
    // Remove the most recent entry
    const entries = await client.zrange(windowKey, -1, -1);
    if (entries.length > 0) {
      await client.zrem(windowKey, entries[0]);
    }
  } else {
    // Decrement counter
    await client.decr(windowKey);
  }
}

/**
 * Increment rate limit counter using in-memory store.
 */
function incrementInMemory(
  key: string,
  windowMs: number,
  maxRequests: number
): { count: number; resetAt: number; allowed: boolean } {
  const now = Date.now();

  let entry = inMemoryStore.get(key);
  if (!entry || entry.resetAt < now) {
    entry = {
      count: 0,
      resetAt: now + windowMs,
    };
    inMemoryStore.set(key, entry);
  }

  entry.count++;

  return {
    count: entry.count,
    resetAt: entry.resetAt,
    allowed: entry.count <= maxRequests,
  };
}

/**
 * Decrement rate limit counter using in-memory store.
 */
function decrementInMemory(key: string): void {
  const entry = inMemoryStore.get(key);
  if (entry) {
    entry.count = Math.max(0, entry.count - 1);
  }
}

// ============================================================================
// Rate Limiter Middleware Factory
// ============================================================================

/**
 * Create a rate limiting middleware.
 *
 * @example
 * ```typescript
 * // Standard rate limit
 * app.use('/api', createRateLimiter({
 *   windowMs: 60 * 1000, // 1 minute
 *   maxRequests: 100,
 * }));
 *
 * // Strict auth limit
 * app.use('/auth', createRateLimiter({
 *   windowMs: 60 * 1000,
 *   maxRequests: 10,
 *   keyPrefix: 'auth',
 *   message: 'Too many login attempts',
 * }));
 * ```
 */
export function createRateLimiter(config: RateLimitConfig) {
  const {
    windowMs,
    maxRequests,
    keyGenerator = defaultKeyGenerator,
    skipFailedRequests = false,
    skipSuccessfulRequests = false,
    message = 'Too many requests, please try again later',
    keyPrefix = 'rl',
    slidingWindow = false,
  } = config;

  // Initialize Redis connection
  getRedisClient();

  return async (
    req: RequestWithRateLimit,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const baseKey = keyGenerator(req);
    const fullKey = `${keyPrefix}:${baseKey}`;

    try {
      let result: { count: number; resetAt: number; allowed: boolean };

      // Try Redis first, fall back to in-memory
      if (redisAvailable && redisClient) {
        try {
          result = await incrementRedis(
            redisClient,
            fullKey,
            windowMs,
            maxRequests,
            slidingWindow
          );
        } catch (redisError) {
          console.warn('[RateLimit] Redis error, falling back to in-memory:', redisError);
          result = incrementInMemory(fullKey, windowMs, maxRequests);
        }
      } else {
        result = incrementInMemory(fullKey, windowMs, maxRequests);
      }

      const { count, resetAt, allowed } = result;
      const remaining = Math.max(0, maxRequests - count);

      // Store rate limit info on request
      req.rateLimitInfo = {
        limit: maxRequests,
        remaining,
        reset: resetAt,
      };

      // Set rate limit headers
      res.setHeader('X-RateLimit-Limit', maxRequests.toString());
      res.setHeader('X-RateLimit-Remaining', remaining.toString());
      res.setHeader('X-RateLimit-Reset', Math.ceil(resetAt / 1000).toString());
      res.setHeader('X-RateLimit-Policy', `${maxRequests};w=${Math.ceil(windowMs / 1000)}`);

      if (!allowed) {
        const retryAfterMs = resetAt - Date.now();
        const retryAfterSec = Math.ceil(retryAfterMs / 1000);

        req.rateLimitInfo.retryAfterMs = retryAfterMs;
        res.setHeader('Retry-After', retryAfterSec.toString());

        res.status(429).json({
          error: {
            message,
            code: 'RATE_LIMIT_EXCEEDED',
            retryAfter: retryAfterSec,
            limit: maxRequests,
            windowMs,
          },
        });
        return;
      }

      // Handle skip options
      if (skipFailedRequests || skipSuccessfulRequests) {
        res.on('finish', async () => {
          const shouldDecrement =
            (skipFailedRequests && res.statusCode >= 400) ||
            (skipSuccessfulRequests && res.statusCode < 400);

          if (shouldDecrement) {
            try {
              if (redisAvailable && redisClient) {
                await decrementRedis(redisClient, fullKey, windowMs, slidingWindow);
              } else {
                decrementInMemory(fullKey);
              }
            } catch (error) {
              // Decrement errors are non-critical
              console.warn('[RateLimit] Failed to decrement counter:', error);
            }
          }
        });
      }

      next();
    } catch (error) {
      // Rate limiting errors should not block requests - log and continue
      console.error('[RateLimit] Unexpected error:', error);
      next();
    }
  };
}

// ============================================================================
// Pre-configured Rate Limiters
// ============================================================================

/**
 * Standard API rate limit: 1000 requests per minute.
 * Suitable for most API endpoints.
 */
export const standardRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 1000,
  keyPrefix: 'rl:std',
});

/**
 * Auth rate limit: 20 requests per minute.
 * Stricter limit for authentication endpoints to prevent brute force.
 */
export const authRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 20,
  keyPrefix: 'rl:auth',
  skipSuccessfulRequests: true, // Only count failed attempts
  message: 'Too many authentication attempts, please try again later',
});

/**
 * Heavy operation rate limit: 100 requests per minute.
 * For expensive operations like token deployment, bulk operations.
 */
export const heavyOperationRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 100,
  keyPrefix: 'rl:heavy',
  skipFailedRequests: true,
  message: 'Too many requests for this operation, please try again later',
});

/**
 * Burst rate limit: 50 requests per second.
 * Prevents request floods and DoS attempts.
 */
export const burstRateLimiter = createRateLimiter({
  windowMs: 1000,
  maxRequests: 50,
  keyPrefix: 'rl:burst',
  message: 'Request rate too high, please slow down',
});

/**
 * Write operation rate limit: 60 requests per minute.
 * For POST/PUT/DELETE operations that modify state.
 */
export const writeRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 60,
  keyPrefix: 'rl:write',
  skipFailedRequests: true,
  message: 'Too many write operations, please try again later',
});

/**
 * Transfer rate limit: 30 transfers per minute.
 * Specifically for token transfer operations.
 */
export const transferRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 30,
  keyPrefix: 'rl:transfer',
  slidingWindow: true, // More accurate for financial operations
  skipFailedRequests: true,
  message: 'Transfer rate limit exceeded, please try again later',
});

// ============================================================================
// Rate Limit Configuration Helper
// ============================================================================

export interface RateLimitTier {
  name: string;
  windowMs: number;
  maxRequests: number;
}

/**
 * Create rate limiters from tier configuration.
 * Useful for applying different limits to different subscription tiers.
 */
export function createTieredRateLimiter(tiers: Record<string, RateLimitTier>) {
  const limiters = new Map<string, ReturnType<typeof createRateLimiter>>();

  for (const [key, tier] of Object.entries(tiers)) {
    limiters.set(key, createRateLimiter({
      windowMs: tier.windowMs,
      maxRequests: tier.maxRequests,
      keyPrefix: `rl:tier:${key}`,
    }));
  }

  return (tierResolver: (req: Request) => string) => {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      const tierName = tierResolver(req);
      const limiter = limiters.get(tierName) || limiters.get('default');

      if (limiter) {
        return limiter(req as RequestWithRateLimit, res, next);
      }

      next();
    };
  };
}
