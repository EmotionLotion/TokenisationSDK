import { Request, Response, NextFunction } from 'express';
import { logger } from './logger.js';
import * as auditService from '../services/audit.service.js';

// ============================================================================
// Types & Constants
// ============================================================================

/**
 * HTTP methods that are considered mutations and should be audited.
 */
const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * HTTP methods that should be skipped (read-only / preflight).
 */
const SKIP_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Map HTTP method to audit action.
 */
const METHOD_ACTION_MAP: Record<string, string> = {
  POST: 'create',
  PUT: 'update',
  PATCH: 'update',
  DELETE: 'delete',
};

/**
 * Sensitive fields to strip from request body before logging.
 */
const SENSITIVE_FIELDS = new Set([
  'password',
  'passwordHash',
  'password_hash',
  'secret',
  'client_secret',
  'clientSecret',
  'apiKey',
  'api_key',
  'apiSecret',
  'api_secret',
  'token',
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
  'authorization',
  'privateKey',
  'private_key',
  'mnemonic',
  'seed',
  'seedPhrase',
  'seed_phrase',
  'pin',
  'otp',
  'ssn',
  'creditCard',
  'credit_card',
  'cardNumber',
  'card_number',
  'cvv',
  'cvc',
]);

/**
 * API version prefix to match for audit trail.
 */
const API_PREFIX = '/api/v1/';

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Sanitizes the request body by replacing sensitive fields with '[REDACTED]'.
 * Performs a shallow clone to avoid mutating the original body.
 */
function sanitizeBody(body: unknown): Record<string, unknown> | undefined {
  if (!body || typeof body !== 'object') {
    return undefined;
  }

  const sanitized: Record<string, unknown> = {};
  const source = body as Record<string, unknown>;

  for (const [key, value] of Object.entries(source)) {
    if (SENSITIVE_FIELDS.has(key)) {
      sanitized[key] = '[REDACTED]';
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      sanitized[key] = sanitizeBody(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Extracts the resource type from a URL path.
 *
 * Examples:
 *   /api/v1/tokens        -> 'token'
 *   /api/v1/tokens/:id    -> 'token'
 *   /api/v1/investors     -> 'investor'
 *   /api/v1/cap-tables    -> 'cap_table'
 *   /api/v1/webhook-endpoints -> 'webhook_endpoint'
 */
function extractResourceType(path: string): string {
  // Remove API prefix
  const stripped = path.replace(/^\/api\/v\d+\//, '');

  // Get the first path segment (the resource collection name)
  const segments = stripped.split('/').filter(Boolean);
  if (segments.length === 0) {
    return 'unknown';
  }

  let resource = segments[0];

  // Convert kebab-case to snake_case
  resource = resource.replace(/-/g, '_');

  // Remove trailing 's' to singularize (simple heuristic)
  if (resource.endsWith('ies')) {
    resource = resource.slice(0, -3) + 'y';
  } else if (resource.endsWith('ses')) {
    resource = resource.slice(0, -2);
  } else if (resource.endsWith('s') && !resource.endsWith('ss')) {
    resource = resource.slice(0, -1);
  }

  return resource;
}

/**
 * Extracts the resource ID from the URL path.
 * Assumes RESTful pattern: /api/v1/<resource>/<id>
 */
function extractResourceId(path: string, params: Record<string, string> | undefined): string {
  // First try to get ID from route params
  if (params) {
    const id = params.id || params.tokenId || params.investorId || params.projectId
      || params.policyId || params.transferId || params.webhookId || params.documentId;
    if (id) {
      return id;
    }
  }

  // Fall back to parsing from the URL path
  const stripped = path.replace(/^\/api\/v\d+\//, '');
  const segments = stripped.split('/').filter(Boolean);

  // Pattern: /resource/:id or /resource/:id/sub-resource
  if (segments.length >= 2) {
    return segments[1];
  }

  return '';
}

/**
 * Determines the actor type from the request context.
 */
function resolveActorType(req: Request): 'user' | 'api_key' | 'system' | 'webhook' {
  const apiKey = (req as any).apiKey;
  const user = (req as any).user;

  if (apiKey) {
    return 'api_key';
  }
  if (user) {
    return 'user';
  }
  return 'system';
}

/**
 * Resolves the actor ID from the request.
 */
function resolveActorId(req: Request): string | undefined {
  const apiKey = (req as any).apiKey;
  const user = (req as any).user;

  if (apiKey?.keyId) {
    return apiKey.keyId;
  }
  if (user?.partyId) {
    return user.partyId;
  }
  return undefined;
}

/**
 * Resolves the organization ID from the request.
 */
function resolveOrgId(req: Request): string | undefined {
  const apiKey = (req as any).apiKey;
  if (apiKey?.orgId) {
    return apiKey.orgId;
  }

  const devOrgHeader = req.headers['x-dev-org-id'];
  if (typeof devOrgHeader === 'string') {
    return devOrgHeader;
  }

  const user = (req as any).user;
  if (user?.orgId) {
    return user.orgId;
  }

  return undefined;
}

/**
 * Gets the client IP address from the request.
 */
function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || req.ip || 'unknown';
}

/**
 * Builds a human-readable description of the action.
 */
function buildDescription(method: string, resourceType: string, resourceId: string, statusCode: number): string {
  const action = METHOD_ACTION_MAP[method] || method.toLowerCase();
  const target = resourceId ? `${resourceType} ${resourceId}` : resourceType;
  const outcome = statusCode >= 400 ? 'failed' : 'succeeded';
  return `${action} ${target} - ${outcome} (${statusCode})`;
}

// ============================================================================
// Middleware
// ============================================================================

/**
 * Express middleware that automatically creates audit log entries for all
 * mutation operations (POST, PUT, PATCH, DELETE) on API v1 routes.
 *
 * This middleware is non-blocking: it fires the audit log call without
 * awaiting completion, catching and logging any errors silently.
 */
export function auditTrailMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Skip non-mutation methods
  if (SKIP_METHODS.has(req.method) || !MUTATION_METHODS.has(req.method)) {
    return next();
  }

  // Only audit /api/v1/ routes
  if (!req.path.startsWith(API_PREFIX)) {
    return next();
  }

  // Capture request data before the response is sent
  const method = req.method;
  const path = req.path;
  const body = req.body ? sanitizeBody(req.body) : undefined;
  const ipAddress = getClientIp(req);
  const userAgent = (req.headers['user-agent'] as string) || undefined;

  // Use res.on('finish') to capture the response status after completion
  res.on('finish', () => {
    const orgId = resolveOrgId(req);
    if (!orgId) {
      logger.warn('Audit trail: skipping log — no orgId found on request', {
        metadata: { method, path },
      });
      return;
    }

    const actorType = resolveActorType(req);
    const actorId = resolveActorId(req);
    const resourceType = extractResourceType(path);
    const resourceId = extractResourceId(path, req.params);
    const action = METHOD_ACTION_MAP[method] || method.toLowerCase();
    const statusCode = res.statusCode;
    const description = buildDescription(method, resourceType, resourceId, statusCode);

    // Fire-and-forget: do not await, catch errors silently
    auditService.log({
      orgId,
      actorId,
      actorType,
      action,
      resourceType,
      resourceId: resourceId || 'N/A',
      description,
      metadata: {
        httpMethod: method,
        path,
        statusCode,
        requestBody: body,
      },
      ipAddress,
      userAgent,
    }).catch((err) => {
      logger.error('Audit trail: failed to write audit log', {
        error: err,
        metadata: { method, path, orgId, resourceType },
      });
    });
  });

  next();
}

// ============================================================================
// Direct Logging Function
// ============================================================================

/**
 * Convenience function for logging audit events directly from middleware
 * or other non-service code. Wraps the audit service with fire-and-forget
 * semantics and error handling.
 */
export function logFromMiddleware(params: {
  orgId: string;
  actorId?: string;
  actorType: 'user' | 'api_key' | 'system' | 'webhook';
  action: string;
  resourceType: string;
  resourceId: string;
  description?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}): void {
  auditService.log(params).catch((err) => {
    logger.error('Audit trail (logFromMiddleware): failed to write audit log', {
      error: err,
      metadata: {
        action: params.action,
        resourceType: params.resourceType,
        orgId: params.orgId,
      },
    });
  });
}
