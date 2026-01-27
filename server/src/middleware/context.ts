import { Request, Response, NextFunction } from 'express';
import type { ApiKeyRequest, JwtPayload, ApiKeyPayload } from './auth.js';
import { AsyncLocalStorage } from 'async_hooks';
import {
  TenantContext,
  runWithTenant,
  TenantContextError,
  type ActorType,
} from '../context/TenantContext.js';
import { pool, getDbMode } from '../config/database.js';
import { logger } from './logger.js';

// ============================================================================
// Request Context - Full tracing correlation (legacy, for backwards compatibility)
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

// Re-export TenantContext utilities for convenience
export { TenantContext, runWithTenant, TenantContextError };

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
    orgId = req.user.orgId;
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

// ============================================================================
// PostgreSQL Row Level Security (RLS) Context
// ============================================================================

/**
 * Sets PostgreSQL session variable for RLS policies.
 * This must be called at the start of each request with the tenant's org_id.
 */
async function setPostgresOrgContext(orgId: string): Promise<(() => Promise<void>) | null> {
  // Skip for SQLite mode (doesn't support RLS)
  if (getDbMode() === 'sqlite' || !pool) {
    return null;
  }

  try {
    const client = await pool.connect();
    await client.query(`SELECT app.set_current_org_id($1::uuid)`, [orgId]);

    // Return cleanup function
    return async () => {
      try {
        await client.query(`SELECT app.clear_current_org_id()`);
      } catch (error) {
        logger.error('Failed to clear RLS context', { error });
      } finally {
        client.release();
      }
    };
  } catch (error) {
    // Log but don't fail - RLS will block queries if context isn't set
    logger.warn('Failed to set PostgreSQL RLS context', { error, orgId });
    return null;
  }
}

// ============================================================================
// Tenant Context Middleware - Enterprise-grade multi-tenant isolation
// ============================================================================

/**
 * Tenant context middleware that enforces orgId presence.
 *
 * This middleware MUST be applied AFTER auth middleware so that
 * apiKey/user information is available to determine the orgId.
 *
 * It creates a TenantContext that propagates through async operations
 * and ensures all database operations are scoped to the correct tenant.
 *
 * @throws 403 if no orgId can be determined from the request
 */
export function tenantContextMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Cast to ContextRequest to access apiKey/user added by auth middleware
  const contextReq = req as ContextRequest;

  const requestId = (req.headers['x-request-id'] as string) ||
    `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

  // Determine actor information from auth
  let actorId: string;
  let actorType: ActorType;
  let orgId: string | undefined;
  let permissions: string[] = [];

  if (contextReq.apiKey) {
    actorId = contextReq.apiKey.keyId;
    actorType = 'api_key';
    orgId = contextReq.apiKey.orgId;
    permissions = contextReq.apiKey.scopes || [];
  } else if (contextReq.user) {
    actorId = contextReq.user.partyId;
    actorType = 'user';
    orgId = contextReq.user.orgId;
    // User permissions would typically be loaded from the database
    permissions = (contextReq.user as any).permissions || [];
  } else {
    actorId = 'anonymous';
    actorType = 'system';
  }

  // CRITICAL: Enforce orgId presence for tenant isolation
  if (!orgId) {
    const error: TenantContextError = new TenantContextError(
      'Organization context required. Provide valid authentication with orgId.',
      'ORG_ID_REQUIRED'
    );
    res.status(403).json({
      error: {
        message: error.message,
        code: error.code,
      },
    });
    return;
  }

  // Create the tenant context
  const tenantCtx = TenantContext.create({
    orgId,
    actorId,
    actorType,
    requestId,
    permissions,
    metadata: {
      ip: (req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress) as string,
      userAgent: req.headers['user-agent'],
      idempotencyKey: req.headers['idempotency-key'] as string | undefined,
    },
  });

  // Also build legacy RequestContext for backwards compatibility
  const legacyContext: RequestContext = {
    requestId,
    orgId,
    actorId,
    actorType,
    ip: tenantCtx.metadata.ip as string,
    userAgent: tenantCtx.metadata.userAgent as string,
    startTime: tenantCtx.createdAt,
    idempotencyKey: tenantCtx.metadata.idempotencyKey as string | undefined,
  };

  // Attach to request for backwards compatibility
  contextReq.context = legacyContext;

  // Set response headers for correlation
  res.setHeader('X-Request-ID', requestId);
  res.setHeader('X-Org-ID', orgId);
  const idempotencyKey = req.headers['idempotency-key'] as string | undefined;
  if (idempotencyKey) {
    res.setHeader('Idempotency-Key', idempotencyKey);
  }

  // Set PostgreSQL RLS context for tenant isolation at the database level
  setPostgresOrgContext(orgId).then((cleanup) => {
    // Register cleanup on response finish
    if (cleanup) {
      res.on('finish', cleanup);
      res.on('close', cleanup);
    }

    // Run the rest of the request within BOTH contexts:
    // 1. TenantContext (new) via runWithTenant
    // 2. RequestContext (legacy) via asyncContextStorage
    runWithTenant(tenantCtx, () => {
      asyncContextStorage.run(legacyContext, () => {
        next();
      });
    });
  }).catch((error) => {
    logger.error('Failed to set RLS context', { error, orgId });
    // Continue without RLS - database policies will block unauthorized access
    runWithTenant(tenantCtx, () => {
      asyncContextStorage.run(legacyContext, () => {
        next();
      });
    });
  });
}

/**
 * Optional tenant context middleware that does NOT require orgId.
 * Use this for public endpoints that may or may not have authentication.
 */
export function optionalTenantContextMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Cast to ContextRequest to access apiKey/user added by auth middleware
  const contextReq = req as ContextRequest;

  const requestId = (req.headers['x-request-id'] as string) ||
    `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

  // Determine actor information from auth
  let actorId: string = 'anonymous';
  let actorType: ActorType = 'system';
  let orgId: string | undefined;

  if (contextReq.apiKey) {
    actorId = contextReq.apiKey.keyId;
    actorType = 'api_key';
    orgId = contextReq.apiKey.orgId;
  } else if (contextReq.user) {
    actorId = contextReq.user.partyId;
    actorType = 'user';
    orgId = contextReq.user.orgId;
  }

  // Build legacy context (always)
  const legacyContext: RequestContext = {
    requestId,
    orgId,
    actorId,
    actorType,
    ip: (req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress) as string,
    userAgent: req.headers['user-agent'],
    startTime: Date.now(),
    idempotencyKey: req.headers['idempotency-key'] as string | undefined,
  };

  contextReq.context = legacyContext;
  res.setHeader('X-Request-ID', requestId);
  if (orgId) {
    res.setHeader('X-Org-ID', orgId);
  }

  // If we have an orgId, also create TenantContext and set RLS
  if (orgId) {
    const tenantCtx = TenantContext.create({
      orgId,
      actorId,
      actorType,
      requestId,
      permissions: [],
    });

    // Set PostgreSQL RLS context
    setPostgresOrgContext(orgId).then((cleanup) => {
      if (cleanup) {
        res.on('finish', cleanup);
        res.on('close', cleanup);
      }

      runWithTenant(tenantCtx, () => {
        asyncContextStorage.run(legacyContext, () => {
          next();
        });
      });
    }).catch(() => {
      runWithTenant(tenantCtx, () => {
        asyncContextStorage.run(legacyContext, () => {
          next();
        });
      });
    });
  } else {
    // No tenant context, just legacy context
    asyncContextStorage.run(legacyContext, () => {
      next();
    });
  }
}
