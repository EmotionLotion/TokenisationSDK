/**
 * Redis Idempotency Storage
 *
 * Production-ready Redis adapter for idempotency key storage.
 * Provides atomic operations and automatic TTL-based expiration.
 *
 * @example
 * ```typescript
 * import Redis from 'ioredis';
 *
 * const redis = new Redis(process.env.REDIS_URL);
 * const storage = new RedisIdempotencyStorage(redis);
 *
 * const idempotency = new IdempotencyManager({ storage });
 * ```
 */

import type { IIdempotencyStorage, IdempotencyRecord } from '../core/Idempotency.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Redis client interface (compatible with ioredis)
 */
export interface RedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ...args: (string | number)[]): Promise<string | null>;
  del(key: string): Promise<number>;
  keys(pattern: string): Promise<string[]>;
  ttl(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  setnx(key: string, value: string): Promise<number>;
  exists(key: string): Promise<number>;
  eval(script: string, numkeys: number, ...args: (string | number)[]): Promise<unknown>;
}

/**
 * Configuration for Redis idempotency storage
 */
export interface RedisIdempotencyStorageConfig {
  /** Key prefix for namespacing */
  keyPrefix?: string;
  /** Default TTL in seconds (default: 86400 = 24 hours) */
  defaultTtlSeconds?: number;
  /** Whether to use JSON for serialization (default: true) */
  useJson?: boolean;
}

// ============================================================================
// REDIS IDEMPOTENCY STORAGE
// ============================================================================

/**
 * Redis-backed idempotency storage
 *
 * Features:
 * - Atomic lock acquisition using SETNX
 * - Automatic TTL-based expiration
 * - JSON serialization for complex results
 * - Lua scripts for atomic operations
 */
export class RedisIdempotencyStorage implements IIdempotencyStorage {
  private redis: RedisClient;
  private keyPrefix: string;
  private defaultTtlSeconds: number;
  private useJson: boolean;

  constructor(redis: RedisClient, config: RedisIdempotencyStorageConfig = {}) {
    this.redis = redis;
    this.keyPrefix = config.keyPrefix ?? 'idempotency:';
    this.defaultTtlSeconds = config.defaultTtlSeconds ?? 86400; // 24 hours
    this.useJson = config.useJson ?? true;
  }

  /**
   * Get an existing record
   */
  async get<T>(key: string): Promise<IdempotencyRecord<T> | null> {
    const fullKey = this.makeKey(key);
    const data = await this.redis.get(fullKey);

    if (!data) {
      return null;
    }

    try {
      const record = this.useJson ? JSON.parse(data) : data;

      // Check expiration
      if (new Date(record.expiresAt) < new Date()) {
        await this.redis.del(fullKey);
        return null;
      }

      return record as IdempotencyRecord<T>;
    } catch {
      // Invalid data, delete it
      await this.redis.del(fullKey);
      return null;
    }
  }

  /**
   * Create a new pending record (returns false if already exists)
   * Uses SETNX for atomic lock acquisition
   */
  async create(key: string, expiresAt: string, requestHash?: string): Promise<boolean> {
    const fullKey = this.makeKey(key);
    const ttlSeconds = this.calculateTtl(expiresAt);

    const record: IdempotencyRecord = {
      key,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
      expiresAt,
      requestHash,
    };

    const serialized = this.useJson ? JSON.stringify(record) : String(record);

    // Use Lua script for atomic create with TTL
    const script = `
      local existing = redis.call('GET', KEYS[1])
      if existing then
        local record = cjson.decode(existing)
        local expiresAt = record.expiresAt
        if expiresAt then
          local now = os.time()
          local expires = tonumber(string.sub(expiresAt, 1, 10))
          if expires and expires < now then
            redis.call('DEL', KEYS[1])
          else
            return 0
          end
        else
          return 0
        end
      end
      redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2])
      return 1
    `;

    try {
      const result = await this.redis.eval(script, 1, fullKey, serialized, ttlSeconds);
      return result === 1;
    } catch {
      // Fallback to simple SETNX if Lua is not available
      const result = await this.redis.setnx(fullKey, serialized);
      if (result === 1) {
        await this.redis.expire(fullKey, ttlSeconds);
        return true;
      }
      return false;
    }
  }

  /**
   * Update record with result
   */
  async complete<T>(key: string, result: T): Promise<void> {
    const fullKey = this.makeKey(key);
    const existingData = await this.redis.get(fullKey);

    if (!existingData) {
      throw new Error(`Idempotency record not found: ${key}`);
    }

    const record = this.useJson
      ? (JSON.parse(existingData) as IdempotencyRecord<T>)
      : (existingData as unknown as IdempotencyRecord<T>);

    record.status = 'COMPLETED';
    record.result = result;
    record.completedAt = new Date().toISOString();

    const ttlSeconds = this.calculateTtl(record.expiresAt);
    const serialized = this.useJson ? JSON.stringify(record) : String(record);

    await this.redis.set(fullKey, serialized, 'EX', ttlSeconds);
  }

  /**
   * Update record with error
   */
  async fail(key: string, error: string): Promise<void> {
    const fullKey = this.makeKey(key);
    const existingData = await this.redis.get(fullKey);

    if (!existingData) {
      throw new Error(`Idempotency record not found: ${key}`);
    }

    const record = this.useJson
      ? (JSON.parse(existingData) as IdempotencyRecord)
      : (existingData as unknown as IdempotencyRecord);

    record.status = 'FAILED';
    record.error = error;
    record.completedAt = new Date().toISOString();

    const ttlSeconds = this.calculateTtl(record.expiresAt);
    const serialized = this.useJson ? JSON.stringify(record) : String(record);

    await this.redis.set(fullKey, serialized, 'EX', ttlSeconds);
  }

  /**
   * Delete a record
   */
  async delete(key: string): Promise<void> {
    const fullKey = this.makeKey(key);
    await this.redis.del(fullKey);
  }

  /**
   * Clean up expired records
   * Note: Redis handles expiration automatically via TTL
   */
  async cleanup(): Promise<number> {
    // Redis handles cleanup automatically via TTL
    // This method is here for interface compliance
    // We can optionally scan for any records that might have been
    // created without proper TTL

    const pattern = `${this.keyPrefix}*`;
    const keys = await this.redis.keys(pattern);
    let cleaned = 0;

    const now = new Date();

    for (const key of keys) {
      const ttl = await this.redis.ttl(key);
      if (ttl === -1) {
        // No TTL set, check expiration manually
        const data = await this.redis.get(key);
        if (data) {
          try {
            const record = JSON.parse(data) as IdempotencyRecord;
            if (new Date(record.expiresAt) < now) {
              await this.redis.del(key);
              cleaned++;
            }
          } catch {
            // Invalid data, delete it
            await this.redis.del(key);
            cleaned++;
          }
        }
      }
    }

    return cleaned;
  }

  // ============================================================================
  // Additional Methods
  // ============================================================================

  /**
   * Check if a key exists
   */
  async exists(key: string): Promise<boolean> {
    const fullKey = this.makeKey(key);
    const count = await this.redis.exists(fullKey);
    return count > 0;
  }

  /**
   * Get remaining TTL in seconds
   */
  async getTtl(key: string): Promise<number> {
    const fullKey = this.makeKey(key);
    return this.redis.ttl(fullKey);
  }

  /**
   * Extend TTL of a record
   */
  async extendTtl(key: string, additionalSeconds: number): Promise<boolean> {
    const fullKey = this.makeKey(key);
    const currentTtl = await this.redis.ttl(fullKey);

    if (currentTtl <= 0) {
      return false;
    }

    await this.redis.expire(fullKey, currentTtl + additionalSeconds);
    return true;
  }

  /**
   * Get all keys matching a pattern
   */
  async getKeys(pattern: string = '*'): Promise<string[]> {
    const fullPattern = `${this.keyPrefix}${pattern}`;
    const keys = await this.redis.keys(fullPattern);
    return keys.map((key) => key.slice(this.keyPrefix.length));
  }

  /**
   * Get statistics about idempotency storage
   */
  async getStats(): Promise<{
    totalKeys: number;
    pendingCount: number;
    completedCount: number;
    failedCount: number;
  }> {
    const keys = await this.getKeys();
    let pending = 0;
    let completed = 0;
    let failed = 0;

    for (const key of keys) {
      const record = await this.get(key);
      if (record) {
        switch (record.status) {
          case 'PENDING':
            pending++;
            break;
          case 'COMPLETED':
            completed++;
            break;
          case 'FAILED':
            failed++;
            break;
        }
      }
    }

    return {
      totalKeys: keys.length,
      pendingCount: pending,
      completedCount: completed,
      failedCount: failed,
    };
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private makeKey(key: string): string {
    return `${this.keyPrefix}${key}`;
  }

  private calculateTtl(expiresAt: string): number {
    const expiresAtMs = new Date(expiresAt).getTime();
    const nowMs = Date.now();
    const ttlMs = expiresAtMs - nowMs;

    if (ttlMs <= 0) {
      return this.defaultTtlSeconds;
    }

    return Math.ceil(ttlMs / 1000);
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a Redis idempotency storage instance
 */
export function createRedisIdempotencyStorage(
  redis: RedisClient,
  config?: RedisIdempotencyStorageConfig
): RedisIdempotencyStorage {
  return new RedisIdempotencyStorage(redis, config);
}

export default RedisIdempotencyStorage;
