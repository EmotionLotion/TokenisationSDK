import { Request, Response, NextFunction } from 'express';
import type { ApiKeyRequest, JwtPayload, ApiKeyPayload } from './auth.js';
import { AsyncLocalStorage } from 'async_hooks';

// ============================================================================
// Request Context - Full tracing correlation
// ============================================================================

export interface RequestContext {
  requestId: string;
  orgId?: string;
  actorId?: string;
  actorType: 'user' | 'api_key' | 'system' | 'webhook';
  ip?: string;
  userAgent?: string;
  startTime: number;
  idempotencyKey?: string;
}

// AsyncLocalStorage for propagating context through async operations
const asyncContextStorage = new AsyncLocalStorage<RequestContext>();

/**
 * Gets the current request context from AsyncLocalStorage.
 * Returns undefined if no context is set.
 */
export function getRequestContext(): RequestContext | undefined {
  return asyncContextStorage.getStore();
}

/**
 * Gets the current request context, throwing if not available.
 */
export function requireRequestContext(): RequestContext {
  const ctx = asyncContextStorage.getStore();
  if (!ctx) {
    throw new Error('Request context not available - this should be called within a request handler');
  }
  return ctx;
}

/**
 * Runs a function with a specific request context.
 * Useful for workers and background jobs.
 */
export function runWithContext<T>(context: RequestContext, fn: () => T): T {
  return asyncContextStorage.run(context, fn);
}

/**
 * Creates a system context for background operations.
 */
export function createSystemContext(
  orgId: string,
  operationId: string
): RequestContext {
  return {
    requestId: operationId,
    orgId,
    actorId: 'system',
    actorType: 'system',
    startTime: Date.now(),
  };
}

// ============================================================================
// Extended Request Type
// ============================================================================

export interface ContextRequest extends ApiKeyRequest {
  context: RequestContext;
  apiKey?: ApiKeyPayload;
  user?: JwtPayload;
}

// ============================================================================
// Middleware
// ============================================================================

/**
 * Context middleware that establishes full request tracing.
 * Must be applied AFTER auth middleware so apiKey/user are available.
 */
export function contextMiddleware(
  req: ContextRequest,
  res: Response,
  next: NextFunction
): void {
  const requestId = (req.headers['x-request-id'] as string) ||
    `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

  // Determine actor information from auth
  let actorId: string | undefined;
  let actorType: RequestContext['actorType'] = 'system';
  let orgId: string | undefined;

  if (req.apiKey) {
    actorId = req.apiKey.keyId;
    actorType = 'api_key';
    orgId = req.apiKey.orgId;
  } else if (req.user) {
    actorId = req.user.partyId;
    actorType = 'user';
    // User's orgId would need to be looked up from party/user table
    // For now, check if it's in the JWT
    orgId = (req.user as any).orgId;
  }

  // Get idempotency key if present
  const idempotencyKey = req.headers['idempotency-key'] as string | undefined;

  // Build context
  const context: RequestContext = {
    requestId,
    orgId,
    actorId,
    actorType,
    ip: (req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress) as string,
    userAgent: req.headers['user-agent'],
    startTime: Date.now(),
    idempotencyKey,
  };

  // Attach to request
  req.context = context;

  // Set response headers for correlation
  res.setHeader('X-Request-ID', requestId);
  if (idempotencyKey) {
    res.setHeader('Idempotency-Key', idempotencyKey);
  }

  // Run the rest of the request within AsyncLocalStorage context
  asyncContextStorage.run(context, () => {
    next();
  });
}

/**
 * Helper to get org ID from request, throwing if not available.
 */
export function requireOrgId(req: ContextRequest): string {
  const orgId = req.context?.orgId || req.apiKey?.orgId;
  if (!orgId) {
    throw new Error('Organization ID not available in request context');
  }
  return orgId;
}

/**
 * Helper to get actor ID from request, defaulting to 'anonymous'.
 */
export function getActorId(req: ContextRequest): string {
  return req.context?.actorId || req.apiKey?.keyId || req.user?.partyId || 'anonymous';
}

// ============================================================================
// Logging Helpers
// ============================================================================

/**
 * Gets correlation IDs for logging from current context.
 */
export function getCorrelationIds(): {
  requestId?: string;
  orgId?: string;
  actorId?: string;
  actorType?: string;
} {
  const ctx = asyncContextStorage.getStore();
  if (!ctx) {
    return {};
  }
  return {
    requestId: ctx.requestId,
    orgId: ctx.orgId,
    actorId: ctx.actorId,
    actorType: ctx.actorType,
  };
}

/**
 * Creates a log metadata object with correlation IDs.
 */
export function withCorrelation(metadata: Record<string, unknown> = {}): Record<string, unknown> {
  const correlation = getCorrelationIds();
  return {
    ...correlation,
    ...metadata,
  };
}
