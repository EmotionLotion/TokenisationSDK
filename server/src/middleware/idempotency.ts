/**
 * Idempotency Middleware
 *
 * Ensures safe retries for mutating API operations (POST, PUT, PATCH).
 * Clients supply an `Idempotency-Key` header; the middleware guarantees
 * that repeated requests with the same key and body return the original
 * response without re-executing side effects.
 *
 * Features:
 * - SHA-256 body hashing to detect mismatched replays (409 Conflict)
 * - 24-hour TTL on stored keys
 * - Transparent response capture via monkey-patched res.json()
 * - Scoped per organisation (orgId + key uniqueness)
 */

import { Request, Response, NextFunction } from 'express';
import { db, schema } from '../config/database.js';
import { eq, and } from 'drizzle-orm';
import { createHash, randomUUID } from 'crypto';
import { logger } from './logger.js';

// ============================================================================
// Constants
// ============================================================================

/** Methods that require idempotency protection. */
const IDEMPOTENT_METHODS = new Set(['POST', 'PUT', 'PATCH']);

/** Route prefix that this middleware applies to. */
const API_PREFIX = '/api/v1/';

/** Key lifetime in milliseconds (24 hours). */
const KEY_TTL_MS = 24 * 60 * 60 * 1000;

// ============================================================================
// Helpers
// ============================================================================

/**
 * Compute a deterministic SHA-256 hash of the request body.
 * Returns a fixed hash for empty / missing bodies so that
 * bodyless retries are still matched correctly.
 */
function hashBody(body: unknown): string {
  const serialised = body && Object.keys(body as object).length > 0
    ? JSON.stringify(body)
    : '';
  return createHash('sha256').update(serialised).digest('hex');
}

/**
 * Extract the organisation ID from the request.
 * Supports both API-key and JWT authenticated requests
 * as well as the dev-mode header.
 */
function extractOrgId(req: Request): string | undefined {
  const anyReq = req as any;
  return (
    anyReq.context?.orgId ??
    anyReq.apiKey?.orgId ??
    anyReq.user?.orgId ??
    (req.headers['x-dev-org-id'] as string | undefined)
  );
}

// ============================================================================
// Middleware Factory
// ============================================================================

/**
 * Creates an Express middleware that enforces idempotency on mutating
 * requests to the `/api/v1/` routes.
 *
 * @example
 * ```ts
 * import { idempotencyMiddleware } from './middleware/idempotency.js';
 * app.use(idempotencyMiddleware());
 * ```
 */
export function idempotencyMiddleware() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // ---------------------------------------------------------------
    // 1. Guard: only intercept mutating methods on /api/v1/ routes
    // ---------------------------------------------------------------
    if (!IDEMPOTENT_METHODS.has(req.method) || !req.path.startsWith(API_PREFIX)) {
      return next();
    }

    const idempotencyKey = req.headers['idempotency-key'] as string | undefined;

    // If no key supplied, let the request through without idempotency.
    if (!idempotencyKey) {
      return next();
    }

    const orgId = extractOrgId(req);
    if (!orgId) {
      logger.warn('[Idempotency] Request has Idempotency-Key but no orgId; skipping idempotency check.', {
        metadata: { idempotencyKey, method: req.method, path: req.path },
      });
      return next();
    }

    const requestHash = hashBody(req.body);

    try {
      // ---------------------------------------------------------------
      // 2. Look up existing key for this org
      // ---------------------------------------------------------------
      const [existing] = await db
        .select()
        .from(schema.idempotencyKeys)
        .where(
          and(
            eq(schema.idempotencyKeys.orgId, orgId),
            eq(schema.idempotencyKeys.key, idempotencyKey),
          ),
        )
        .limit(1);

      if (existing) {
        // ----- Check expiry -----
        if (existing.expiresAt && new Date(existing.expiresAt) < new Date()) {
          // Expired key – delete it and treat as new request
          await db
            .delete(schema.idempotencyKeys)
            .where(eq(schema.idempotencyKeys.id, existing.id));

          logger.debug('[Idempotency] Expired key deleted; treating as new request.', {
            metadata: { idempotencyKey, orgId },
          });
          // Fall through to create a new record below
        } else {
          // ----- Body mismatch → 409 Conflict -----
          if (existing.requestHash !== requestHash) {
            logger.warn('[Idempotency] Request body hash mismatch for existing key.', {
              metadata: { idempotencyKey, orgId },
            });
            res.status(409).json({
              error: {
                message: 'Idempotency-Key has already been used with a different request body.',
                code: 'IDEMPOTENCY_CONFLICT',
              },
            });
            return;
          }

          // ----- Already completed → return cached response -----
          if (existing.status === 'completed' && existing.responseBody !== null && existing.statusCode !== null) {
            logger.info('[Idempotency] Returning cached response for idempotent request.', {
              metadata: { idempotencyKey, orgId, statusCode: existing.statusCode },
            });
            res.setHeader('Idempotent-Replayed', 'true');
            res.status(existing.statusCode).json(existing.responseBody);
            return;
          }

          // ----- Failed → return cached error response if available -----
          if (existing.status === 'failed') {
            if (existing.responseBody !== null && existing.statusCode !== null) {
              logger.info('[Idempotency] Returning cached error response.', {
                metadata: { idempotencyKey, orgId, statusCode: existing.statusCode },
              });
              res.setHeader('Idempotent-Replayed', 'true');
              res.status(existing.statusCode).json(existing.responseBody);
              return;
            }
            // No cached response for failed request – delete and retry
            await db
              .delete(schema.idempotencyKeys)
              .where(eq(schema.idempotencyKeys.id, existing.id));
            // Fall through to create new record
          }

          // ----- Still processing (pending / processing) -----
          if (existing.status === 'pending' || existing.status === 'processing') {
            res.status(409).json({
              error: {
                message: 'A request with this Idempotency-Key is already being processed.',
                code: 'IDEMPOTENCY_IN_PROGRESS',
              },
            });
            return;
          }
        }
      }

      // ---------------------------------------------------------------
      // 3. Create a new idempotency record
      // ---------------------------------------------------------------
      const expiresAt = new Date(Date.now() + KEY_TTL_MS);

      const [record] = await db
        .insert(schema.idempotencyKeys)
        .values({
          orgId,
          key: idempotencyKey,
          requestHash,
          status: 'processing',
          expiresAt,
        })
        .returning();

      logger.debug('[Idempotency] Created idempotency record.', {
        metadata: { idempotencyKey, orgId, recordId: record.id },
      });

      // ---------------------------------------------------------------
      // 4. Monkey-patch res.json() to capture the response
      // ---------------------------------------------------------------
      const originalJson = res.json.bind(res);
      const recordId = record.id;

      res.json = function patchedJson(body?: any): Response {
        // Capture status code and body, then persist asynchronously.
        const statusCode = res.statusCode;
        const isError = statusCode >= 400;

        // Fire-and-forget persistence – do not block the response.
        (async () => {
          try {
            await db
              .update(schema.idempotencyKeys)
              .set({
                status: isError ? 'failed' : 'completed',
                responseBody: body ?? null,
                statusCode,
                error: isError ? (body?.error?.message ?? null) : null,
                completedAt: new Date(),
                updatedAt: new Date(),
              })
              .where(eq(schema.idempotencyKeys.id, recordId));
          } catch (persistError) {
            logger.error('[Idempotency] Failed to persist response for idempotency record.', {
              error: persistError as Error,
              metadata: { idempotencyKey, orgId, recordId },
            });
          }
        })();

        return originalJson(body);
      } as typeof res.json;

      next();
    } catch (error) {
      // Idempotency failures should not block the request pipeline.
      logger.error('[Idempotency] Unexpected error in idempotency middleware.', {
        error: error as Error,
        metadata: { idempotencyKey, orgId, method: req.method, path: req.path },
      });
      next();
    }
  };
}
