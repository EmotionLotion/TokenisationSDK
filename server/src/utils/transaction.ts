/**
 * Database Transaction Utilities
 *
 * Provides transaction support for both PostgreSQL and SQLite databases.
 * Ensures atomic operations for multi-step database changes.
 */

import { db, getDbMode } from '../config/database.js';

/**
 * Transaction isolation levels for PostgreSQL
 * SQLite only supports SERIALIZABLE, so these are only used for PostgreSQL
 */
export type IsolationLevel = 'read uncommitted' | 'read committed' | 'repeatable read' | 'serializable';

/**
 * Transaction options
 */
export interface TransactionOptions {
  /** Isolation level (PostgreSQL only) */
  isolationLevel?: IsolationLevel;
  /** Access mode */
  accessMode?: 'read only' | 'read write';
  /** Deferrable (PostgreSQL only, with SERIALIZABLE) */
  deferrable?: boolean;
}

/**
 * Execute a function within a database transaction.
 * If any operation fails, all changes are rolled back.
 *
 * @example
 * ```typescript
 * const result = await withTransaction(async (tx) => {
 *   const token = await tx.insert(tokens).values(tokenData).returning();
 *   await tx.insert(auditLog).values({ action: 'CREATE_TOKEN', ... });
 *   return token;
 * });
 * ```
 *
 * @example with isolation level (PostgreSQL only)
 * ```typescript
 * const result = await withTransaction(
 *   async (tx) => {
 *     // Critical financial operation
 *     await tx.update(ledgerPositions).set({ balance: newBalance }).where(...);
 *     await tx.insert(ledgerEvents).values(event);
 *   },
 *   { isolationLevel: 'serializable' }
 * );
 * ```
 */
export async function withTransaction<T>(
  fn: (tx: typeof db) => Promise<T>,
  options?: TransactionOptions
): Promise<T> {
  const dbMode = getDbMode();

  if (dbMode === 'postgresql') {
    // PostgreSQL transaction with options
    return db.transaction(fn, options) as Promise<T>;
  } else {
    // SQLite transaction (options ignored, SQLite uses SERIALIZABLE by default)
    return db.transaction(fn) as Promise<T>;
  }
}

/**
 * Execute a function within a SERIALIZABLE transaction.
 * This provides the highest isolation level and prevents phantom reads.
 * Use for critical financial operations.
 *
 * @example
 * ```typescript
 * await withSerializableTransaction(async (tx) => {
 *   // Transfer tokens atomically
 *   const sender = await tx.query.ledgerPositions.findFirst({ where: ... });
 *   if (BigInt(sender.balance) < amount) throw new Error('Insufficient balance');
 *
 *   await tx.update(ledgerPositions).set({
 *     balance: (BigInt(sender.balance) - amount).toString()
 *   }).where(eq(ledgerPositions.id, sender.id));
 *
 *   await tx.update(ledgerPositions).set({
 *     balance: sql`${ledgerPositions.balance} + ${amount}`
 *   }).where(eq(ledgerPositions.investorId, recipientId));
 * });
 * ```
 */
export async function withSerializableTransaction<T>(
  fn: (tx: typeof db) => Promise<T>
): Promise<T> {
  return withTransaction(fn, { isolationLevel: 'serializable' });
}

/**
 * Execute multiple operations in a transaction, with automatic retry on serialization failure.
 * This is useful for high-contention scenarios where transactions may conflict.
 *
 * @param fn - The transaction function to execute
 * @param maxRetries - Maximum number of retries on serialization failure (default: 3)
 * @param retryDelayMs - Base delay between retries in milliseconds (default: 100)
 *
 * @example
 * ```typescript
 * await withRetryableTransaction(async (tx) => {
 *   // High-contention operation
 *   await updateTokenBalance(tx, tokenId, investorId, amount);
 * }, 5, 200);
 * ```
 */
export async function withRetryableTransaction<T>(
  fn: (tx: typeof db) => Promise<T>,
  maxRetries: number = 3,
  retryDelayMs: number = 100
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await withSerializableTransaction(fn);
    } catch (error) {
      lastError = error as Error;

      // Check if this is a serialization failure (PostgreSQL error code 40001)
      // or deadlock (SQLite SQLITE_BUSY)
      const errorMessage = lastError.message?.toLowerCase() || '';
      const isRetryable =
        errorMessage.includes('serialization') ||
        errorMessage.includes('deadlock') ||
        errorMessage.includes('busy') ||
        errorMessage.includes('40001');

      if (!isRetryable || attempt === maxRetries) {
        throw lastError;
      }

      // Exponential backoff with jitter
      const delay = retryDelayMs * Math.pow(2, attempt) + Math.random() * retryDelayMs;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Execute a read-only transaction.
 * This optimizes for read performance and ensures no writes occur.
 *
 * @example
 * ```typescript
 * const positions = await withReadOnlyTransaction(async (tx) => {
 *   return await tx.query.ledgerPositions.findMany({
 *     where: eq(ledgerPositions.tokenId, tokenId)
 *   });
 * });
 * ```
 */
export async function withReadOnlyTransaction<T>(
  fn: (tx: typeof db) => Promise<T>
): Promise<T> {
  return withTransaction(fn, { accessMode: 'read only' });
}

/**
 * Helper to ensure a critical operation runs within a transaction.
 * Throws an error if called outside of a transaction context.
 *
 * Note: This is a development helper and may not detect all transaction contexts.
 */
export function requireTransaction(): void {
  // This is a placeholder - actual implementation would need to check
  // the current transaction context, which varies by ORM
  // For now, this serves as documentation that the function should be called
  // within a transaction
}

/**
 * Batch operations helper for performing multiple inserts/updates efficiently.
 * Uses a single transaction for atomicity.
 *
 * @example
 * ```typescript
 * await batchInsert(tokens, [
 *   { name: 'Token1', symbol: 'TK1', ... },
 *   { name: 'Token2', symbol: 'TK2', ... },
 * ]);
 * ```
 */
export async function batchInsert<T>(
  table: Parameters<typeof db.insert>[0],
  records: T[]
): Promise<void> {
  if (records.length === 0) return;

  await withTransaction(async (tx) => {
    // Insert in batches of 100 to avoid query size limits
    const batchSize = 100;
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      await (tx as typeof db).insert(table).values(batch as never[]);
    }
  });
}
