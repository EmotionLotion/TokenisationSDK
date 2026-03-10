import { db, schema } from '../config/database.js';
import { eq, and, lt, desc } from 'drizzle-orm';
import { createHash } from 'crypto';
import { ConflictError, ValidationError } from '../middleware/errorHandler.js';
import { logger } from '../middleware/logger.js';

const { idempotencyKeys } = schema;

// ============================================================================
// Types & Interfaces
// ============================================================================

import type { Request, Response, NextFunction } from 'express';
import type { ApiKeyRequest } from '../middleware/auth.js';

export interface IdempotencyRecord {
  id: string;
  orgId: string;
  key: string;
  requestHash: string;
  statusCode: number | null;
  responseBody: unknown;
  status: string;
  expiresAt: Date | null;
  completedAt: Date | null;
  error: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface IdempotencyOptions {
  key: string;
  orgId: string;
  requestBody: unknown;
  ttlMs?: number;
}

export interface ExecuteResult<T> {
  result: T;
  wasIdempotent: boolean;
  idempotencyKey: string;
}

/** Extended request type with idempotency tracking data */
export interface IdempotentRequest extends ApiKeyRequest {
  idempotencyRecordId?: string;
  idempotencyKey?: string;
}

// ============================================================================
// Idempotency Key Management
// ============================================================================

/**
 * Generates a hash of the request body for comparison.
 */
function hashRequestBody(body: unknown): string {
  // Must match the global idempotency middleware's hash (middleware/idempotency.ts)
  const serialised = body && Object.keys(body as object).length > 0
    ? JSON.stringify(body)
    : '';
  return createHash('sha256').update(serialised).digest('hex');
}

/**
 * Checks if an idempotency key already exists and returns the cached response.
 * If not, creates a new record in 'processing' state.
 */
export async function checkIdempotencyKey(options: IdempotencyOptions): Promise<{
  exists: boolean;
  record?: IdempotencyRecord;
}> {
  const { key, orgId, requestBody, ttlMs = 24 * 60 * 60 * 1000 } = options;

  // Validate key format
  if (!key || key.length < 8 || key.length > 64) {
    throw new ValidationError('Idempotency key must be 8-64 characters');
  }

  const requestHash = hashRequestBody(requestBody);

  // Check for existing record
  const existing = await db.query.idempotencyKeys.findFirst({
    where: and(
      eq(idempotencyKeys.orgId, orgId),
      eq(idempotencyKeys.key, key)
    ),
  });

  if (existing) {
    // Check if request body matches
    if (existing.requestHash !== requestHash) {
      throw new ConflictError(
        'Idempotency key already used with different request body'
      );
    }

    // Check if expired
    if (existing.expiresAt && existing.expiresAt < new Date()) {
      // Expired, delete and allow retry
      await db.delete(idempotencyKeys).where(eq(idempotencyKeys.id, existing.id));
    } else if (existing.status === 'completed') {
      // Return cached response
      return { exists: true, record: existing as IdempotencyRecord };
    } else if (existing.status === 'processing') {
      // Another request is processing
      throw new ConflictError(
        'Request with this idempotency key is still being processed'
      );
    } else if (existing.status === 'failed') {
      // Previous attempt failed, allow retry
      await db.delete(idempotencyKeys).where(eq(idempotencyKeys.id, existing.id));
    }
  }

  // Create new record
  const expiresAt = new Date(Date.now() + ttlMs);

  const [record] = await db.insert(idempotencyKeys).values({
    orgId,
    key,
    requestHash,
    status: 'processing',
    statusCode: 0,
    responseBody: {},
    expiresAt,
  }).returning();

  return { exists: false, record: record as IdempotencyRecord };
}

/**
 * Marks an idempotency key as completed with the response.
 */
export async function completeIdempotencyKey(
  id: string,
  statusCode: number,
  responseBody: Record<string, unknown>
): Promise<void> {
  await db.update(idempotencyKeys)
    .set({
      status: 'completed',
      statusCode,
      responseBody,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(idempotencyKeys.id, id));
}

/**
 * Marks an idempotency key as failed.
 */
export async function failIdempotencyKey(id: string, errorMessage: string): Promise<void> {
  await db.update(idempotencyKeys)
    .set({
      status: 'failed',
      error: errorMessage,
      updatedAt: new Date(),
    })
    .where(eq(idempotencyKeys.id, id));
}

/**
 * Executes an operation with idempotency guarantees.
 */
export async function executeWithIdempotency<T>(
  options: IdempotencyOptions,
  operation: () => Promise<{ statusCode: number; body: T }>
): Promise<ExecuteResult<T>> {
  const { exists, record } = await checkIdempotencyKey(options);

  if (exists && record) {
    // Return cached response
    return {
      result: record.responseBody as T,
      wasIdempotent: true,
      idempotencyKey: options.key,
    };
  }

  if (!record) {
    throw new Error('Failed to create idempotency record');
  }

  try {
    // Execute the operation
    const { statusCode, body } = await operation();

    // Save the response
    await completeIdempotencyKey(record.id, statusCode, body as Record<string, unknown>);

    return {
      result: body,
      wasIdempotent: false,
      idempotencyKey: options.key,
    };
  } catch (error) {
    // Mark as failed
    await failIdempotencyKey(
      record.id,
      error instanceof Error ? error.message : 'Unknown error'
    );
    throw error;
  }
}

// ============================================================================
// Cleanup
// ============================================================================

/**
 * Removes expired idempotency keys.
 */
export async function cleanupExpiredKeys(): Promise<{ deleted: number }> {
  const now = new Date();

  const result = await db.delete(idempotencyKeys)
    .where(lt(idempotencyKeys.expiresAt, now))
    .returning();

  return { deleted: result.length };
}

/**
 * Gets idempotency key statistics for an organization.
 */
export async function getIdempotencyStats(orgId: string): Promise<{
  total: number;
  processing: number;
  completed: number;
  failed: number;
}> {
  const records = await db.select()
    .from(idempotencyKeys)
    .where(eq(idempotencyKeys.orgId, orgId));

  const stats = {
    total: records.length,
    processing: 0,
    completed: 0,
    failed: 0,
  };

  for (const record of records) {
    if (record.status === 'processing') stats.processing++;
    else if (record.status === 'completed') stats.completed++;
    else if (record.status === 'failed') stats.failed++;
  }

  return stats;
}

// ============================================================================
// Idempotency Middleware Helper
// ============================================================================

interface IdempotencyMiddlewareOptions {
  /** Operation name for logging */
  operation: string;
  /** If true, reject requests without an idempotency key */
  required?: boolean;
}

/**
 * Express middleware for idempotency key handling.
 *
 * @param options Configuration options or just operation name for backwards compatibility
 */
export function idempotencyMiddleware(options: string | IdempotencyMiddlewareOptions) {
  const config: IdempotencyMiddlewareOptions = typeof options === 'string'
    ? { operation: options, required: false }
    : options;

  return async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    const idempotencyKey = req.headers['idempotency-key'] as string;

    if (!idempotencyKey) {
      if (config.required) {
        // Idempotency key is required for this operation
        return res.status(400).json({
          error: 'Idempotency-Key header is required for this operation',
          code: 'IDEMPOTENCY_KEY_REQUIRED',
          operation: config.operation,
        });
      }
      // No idempotency key provided, continue normally
      return next();
    }

    if (!req.apiKey) {
      return next(new ValidationError('API key required for idempotent requests'));
    }

    try {
      const { exists, record } = await checkIdempotencyKey({
        key: idempotencyKey,
        orgId: req.apiKey.orgId,
        requestBody: req.body,
      });

      if (exists && record) {
        // Return cached response
        res.setHeader('Idempotency-Key', idempotencyKey);
        res.setHeader('Idempotent-Replayed', 'true');
        return res.status(record.statusCode || 200).json(record.responseBody);
      }

      // Store record ID for later completion
      const idempotentReq = req as IdempotentRequest;
      idempotentReq.idempotencyRecordId = record?.id;
      idempotentReq.idempotencyKey = idempotencyKey;

      // Wrap res.json to capture response
      const originalJson = res.json.bind(res);
      res.json = function (body: unknown) {
        const recordId = idempotentReq.idempotencyRecordId;
        if (recordId) {
          completeIdempotencyKey(recordId, res.statusCode, body as Record<string, unknown>).catch(err => {
            logger.error('Failed to save idempotency response', { error: err as Error });
          });
        }
        res.setHeader('Idempotency-Key', idempotencyKey);
        return originalJson(body);
      };

      next();
    } catch (error) {
      next(error);
    }
  };
}

// ============================================================================
// Distributed Lock (Simple DB-based implementation)
// ============================================================================

const locks = new Map<string, { expiresAt: Date; owner: string }>();

/**
 * Acquires a distributed lock.
 */
export async function acquireLock(
  lockKey: string,
  owner: string,
  ttlMs: number = 30000
): Promise<boolean> {
  const existing = locks.get(lockKey);

  if (existing) {
    // Check if expired
    if (existing.expiresAt > new Date()) {
      return false; // Lock held by another owner
    }
    // Lock expired, can be acquired
  }

  locks.set(lockKey, {
    expiresAt: new Date(Date.now() + ttlMs),
    owner,
  });

  return true;
}

/**
 * Releases a distributed lock.
 */
export function releaseLock(lockKey: string, owner: string): boolean {
  const existing = locks.get(lockKey);

  if (!existing || existing.owner !== owner) {
    return false;
  }

  locks.delete(lockKey);
  return true;
}

/**
 * Extends a lock's TTL.
 */
export function extendLock(lockKey: string, owner: string, ttlMs: number): boolean {
  const existing = locks.get(lockKey);

  if (!existing || existing.owner !== owner) {
    return false;
  }

  existing.expiresAt = new Date(Date.now() + ttlMs);
  return true;
}

/**
 * Executes an operation with a distributed lock.
 */
export async function withLock<T>(
  lockKey: string,
  operation: () => Promise<T>,
  options: { ttlMs?: number; retries?: number; retryDelayMs?: number } = {}
): Promise<T> {
  const { ttlMs = 30000, retries = 3, retryDelayMs = 100 } = options;
  const owner = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  let attempts = 0;

  while (attempts < retries) {
    const acquired = await acquireLock(lockKey, owner, ttlMs);

    if (acquired) {
      try {
        return await operation();
      } finally {
        releaseLock(lockKey, owner);
      }
    }

    attempts++;
    if (attempts < retries) {
      await new Promise(resolve => setTimeout(resolve, retryDelayMs * attempts));
    }
  }

  throw new ConflictError(`Failed to acquire lock for ${lockKey} after ${retries} attempts`);
}
