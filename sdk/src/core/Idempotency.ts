/**
 * Idempotency Layer
 *
 * Ensures operations are safely retryable without side effects.
 * Critical for payment processing and state mutations.
 *
 * @example
 * ```typescript
 * const idempotency = new IdempotencyManager({
 *   storage: new MemoryIdempotencyStorage(),
 *   ttlMs: 24 * 60 * 60 * 1000, // 24 hours
 * });
 *
 * // First call executes
 * const result1 = await idempotency.execute(
 *   'payment-123',
 *   () => stripe.createCharge({ amount: 1000 })
 * );
 *
 * // Second call with same key returns cached result
 * const result2 = await idempotency.execute(
 *   'payment-123',
 *   () => stripe.createCharge({ amount: 1000 }) // Not executed
 * );
 * ```
 */

import { v4 as uuidv4 } from 'uuid';
import { ok, err, type Result } from './types.js';

// ============================================================================
// TYPES
// ============================================================================

export interface IdempotencyRecord<T = unknown> {
  key: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  result?: T;
  error?: string;
  createdAt: string;
  completedAt?: string;
  expiresAt: string;
  /** Hash of request parameters for validation */
  requestHash?: string;
  /** Metadata for debugging */
  metadata?: Record<string, unknown>;
}

export interface IIdempotencyStorage {
  /**
   * Get an existing record
   */
  get<T>(key: string): Promise<IdempotencyRecord<T> | null>;

  /**
   * Create a new pending record (returns false if already exists)
   */
  create(key: string, expiresAt: string, requestHash?: string): Promise<boolean>;

  /**
   * Update record with result
   */
  complete<T>(key: string, result: T): Promise<void>;

  /**
   * Update record with error
   */
  fail(key: string, error: string): Promise<void>;

  /**
   * Delete a record
   */
  delete(key: string): Promise<void>;

  /**
   * Clean up expired records
   */
  cleanup(): Promise<number>;
}

export interface IdempotencyManagerConfig {
  /** Storage backend */
  storage: IIdempotencyStorage;
  /** Time-to-live for idempotency keys in ms (default: 24 hours) */
  ttlMs?: number;
  /** Lock timeout for pending operations in ms (default: 30 seconds) */
  lockTimeoutMs?: number;
  /** Polling interval when waiting for pending operation (default: 100ms) */
  pollIntervalMs?: number;
  /** Maximum time to wait for pending operation (default: 60 seconds) */
  maxWaitMs?: number;
}

// ============================================================================
// MEMORY STORAGE (for testing/development)
// ============================================================================

export class MemoryIdempotencyStorage implements IIdempotencyStorage {
  private records = new Map<string, IdempotencyRecord>();

  async get<T>(key: string): Promise<IdempotencyRecord<T> | null> {
    const record = this.records.get(key);
    if (!record) return null;

    // Check expiration
    if (new Date(record.expiresAt) < new Date()) {
      this.records.delete(key);
      return null;
    }

    return record as IdempotencyRecord<T>;
  }

  async create(key: string, expiresAt: string, requestHash?: string): Promise<boolean> {
    if (this.records.has(key)) {
      const existing = this.records.get(key)!;
      // Check if expired
      if (new Date(existing.expiresAt) < new Date()) {
        this.records.delete(key);
      } else {
        return false;
      }
    }

    this.records.set(key, {
      key,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
      expiresAt,
      requestHash,
    });

    return true;
  }

  async complete<T>(key: string, result: T): Promise<void> {
    const record = this.records.get(key);
    if (record) {
      record.status = 'COMPLETED';
      record.result = result;
      record.completedAt = new Date().toISOString();
    }
  }

  async fail(key: string, error: string): Promise<void> {
    const record = this.records.get(key);
    if (record) {
      record.status = 'FAILED';
      record.error = error;
      record.completedAt = new Date().toISOString();
    }
  }

  async delete(key: string): Promise<void> {
    this.records.delete(key);
  }

  async cleanup(): Promise<number> {
    const now = new Date();
    let cleaned = 0;

    for (const [key, record] of this.records) {
      if (new Date(record.expiresAt) < now) {
        this.records.delete(key);
        cleaned++;
      }
    }

    return cleaned;
  }

  // Test helper
  getAll(): Map<string, IdempotencyRecord> {
    return new Map(this.records);
  }
}

// ============================================================================
// IDEMPOTENCY MANAGER
// ============================================================================

export class IdempotencyManager {
  private storage: IIdempotencyStorage;
  private ttlMs: number;
  private lockTimeoutMs: number;
  private pollIntervalMs: number;
  private maxWaitMs: number;

  constructor(config: IdempotencyManagerConfig) {
    this.storage = config.storage;
    this.ttlMs = config.ttlMs ?? 24 * 60 * 60 * 1000; // 24 hours
    this.lockTimeoutMs = config.lockTimeoutMs ?? 30000; // 30 seconds
    this.pollIntervalMs = config.pollIntervalMs ?? 100;
    this.maxWaitMs = config.maxWaitMs ?? 60000; // 60 seconds
  }

  /**
   * Execute an operation idempotently
   */
  async execute<T>(
    idempotencyKey: string,
    operation: () => Promise<T>,
    options?: {
      /** Hash of request params to detect mismatched retries */
      requestHash?: string;
      /** Metadata for debugging */
      metadata?: Record<string, unknown>;
    }
  ): Promise<Result<T, string>> {
    const expiresAt = new Date(Date.now() + this.ttlMs).toISOString();

    // Try to get existing record
    const existing = await this.storage.get<T>(idempotencyKey);

    if (existing) {
      // Validate request hash if provided
      if (options?.requestHash && existing.requestHash !== options.requestHash) {
        return err(
          `Idempotency key '${idempotencyKey}' already used with different parameters`
        );
      }

      // If completed, return cached result
      if (existing.status === 'COMPLETED') {
        return ok(existing.result as T);
      }

      // If failed, return cached error
      if (existing.status === 'FAILED') {
        return err(existing.error || 'Previous operation failed');
      }

      // If pending, wait for completion
      if (existing.status === 'PENDING') {
        return this.waitForCompletion<T>(idempotencyKey);
      }
    }

    // Try to create new record (acquire lock)
    const created = await this.storage.create(idempotencyKey, expiresAt, options?.requestHash);

    if (!created) {
      // Another process got the lock, wait for completion
      return this.waitForCompletion<T>(idempotencyKey);
    }

    // Execute the operation
    try {
      const result = await operation();
      await this.storage.complete(idempotencyKey, result);
      return ok(result);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.storage.fail(idempotencyKey, errorMessage);
      return err(errorMessage);
    }
  }

  /**
   * Generate an idempotency key from operation parameters
   */
  generateKey(prefix: string, ...params: unknown[]): string {
    const hash = this.hashParams(params);
    return `${prefix}:${hash}`;
  }

  /**
   * Generate a unique idempotency key
   */
  generateUniqueKey(prefix: string): string {
    return `${prefix}:${uuidv4()}`;
  }

  /**
   * Check if an operation has already been executed
   */
  async hasExecuted(idempotencyKey: string): Promise<boolean> {
    const record = await this.storage.get(idempotencyKey);
    return record?.status === 'COMPLETED';
  }

  /**
   * Get the result of a previous execution
   */
  async getResult<T>(idempotencyKey: string): Promise<Result<T | null, string>> {
    const record = await this.storage.get<T>(idempotencyKey);

    if (!record) {
      return ok(null);
    }

    if (record.status === 'COMPLETED') {
      return ok(record.result as T);
    }

    if (record.status === 'FAILED') {
      return err(record.error || 'Previous operation failed');
    }

    return ok(null); // Still pending
  }

  /**
   * Invalidate an idempotency key (use carefully)
   */
  async invalidate(idempotencyKey: string): Promise<void> {
    await this.storage.delete(idempotencyKey);
  }

  /**
   * Clean up expired records
   */
  async cleanup(): Promise<number> {
    return this.storage.cleanup();
  }

  private async waitForCompletion<T>(key: string): Promise<Result<T, string>> {
    const startTime = Date.now();

    while (Date.now() - startTime < this.maxWaitMs) {
      await this.sleep(this.pollIntervalMs);

      const record = await this.storage.get<T>(key);

      if (!record) {
        return err(`Idempotency record '${key}' disappeared`);
      }

      if (record.status === 'COMPLETED') {
        return ok(record.result as T);
      }

      if (record.status === 'FAILED') {
        return err(record.error || 'Operation failed');
      }

      // Check for stale pending (lock timeout)
      const createdAt = new Date(record.createdAt).getTime();
      if (Date.now() - createdAt > this.lockTimeoutMs) {
        // Stale lock, delete and let caller retry
        await this.storage.delete(key);
        return err(`Operation '${key}' timed out (stale lock)`);
      }
    }

    return err(`Timed out waiting for operation '${key}' to complete`);
  }

  private hashParams(params: unknown[]): string {
    const str = JSON.stringify(params);
    // Simple hash function (FNV-1a)
    let hash = 2166136261;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = (hash * 16777619) >>> 0;
    }
    return hash.toString(16);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================================================
// DECORATORS / HELPERS
// ============================================================================

/**
 * Create an idempotent wrapper for a function
 */
export function withIdempotency<TArgs extends unknown[], TResult>(
  manager: IdempotencyManager,
  keyPrefix: string,
  fn: (...args: TArgs) => Promise<TResult>
): (...args: TArgs) => Promise<Result<TResult, string>> {
  return async (...args: TArgs): Promise<Result<TResult, string>> => {
    const key = manager.generateKey(keyPrefix, ...args);
    return manager.execute(key, () => fn(...args));
  };
}

/**
 * Idempotency key builder for common patterns
 */
export const IdempotencyKeys = {
  payment: (payerId: string, referenceId: string, amount: string) =>
    `payment:${payerId}:${referenceId}:${amount}`,

  transfer: (assetId: string, from: string, to: string, amount: string, nonce: number) =>
    `transfer:${assetId}:${from}:${to}:${amount}:${nonce}`,

  mint: (assetId: string, to: string, amount: string, nonce: number) =>
    `mint:${assetId}:${to}:${amount}:${nonce}`,

  burn: (assetId: string, from: string, amount: string, nonce: number) =>
    `burn:${assetId}:${from}:${amount}:${nonce}`,

  kyc: (subjectId: string, level: string) =>
    `kyc:${subjectId}:${level}`,

  claim: (identityId: string, claimType: string, issuedAt: string) =>
    `claim:${identityId}:${claimType}:${issuedAt}`,

  webhook: (providerId: string, eventId: string) =>
    `webhook:${providerId}:${eventId}`,
};

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Create a default idempotency manager with memory storage
 */
export function createIdempotencyManager(
  config?: Partial<IdempotencyManagerConfig>
): IdempotencyManager {
  return new IdempotencyManager({
    storage: config?.storage ?? new MemoryIdempotencyStorage(),
    ttlMs: config?.ttlMs,
    lockTimeoutMs: config?.lockTimeoutMs,
    pollIntervalMs: config?.pollIntervalMs,
    maxWaitMs: config?.maxWaitMs,
  });
}
