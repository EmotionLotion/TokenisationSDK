import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
// ============================================================================
// Types & Interfaces
// ============================================================================

export interface RequestWithContext extends Request {
  requestId?: string;
  startTime?: number;
  rateLimitInfo?: {
    limit: number;
    remaining: number;
    reset: number;
  };
}

// ============================================================================
// Request ID Middleware
// ============================================================================

/**
 * Injects a unique request ID into each request.
 * If X-Request-ID header is provided, it uses that; otherwise generates a new one.
 */
export function requestIdMiddleware(
  req: RequestWithContext,
  res: Response,
  next: NextFunction
): void {
  // Use existing request ID from header or generate new one
  const requestId = (req.headers['x-request-id'] as string) || randomUUID();

  // Attach to request object
  req.requestId = requestId;
  req.startTime = Date.now();

  // Set response header
  res.setHeader('X-Request-ID', requestId);

  // Continue
  next();
}

// ============================================================================
// Request Timeout Middleware
// ============================================================================

/**
 * Adds a timeout to requests.
 */
export function requestTimeout(timeoutMs: number = 30000) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Set timeout
    const timeout = setTimeout(() => {
      if (!res.headersSent) {
        res.status(504).json({
          error: {
            message: 'Request timeout',
            code: 'REQUEST_TIMEOUT',
          },
        });
      }
    }, timeoutMs);

    // Clear timeout when response finishes
    res.on('finish', () => clearTimeout(timeout));
    res.on('close', () => clearTimeout(timeout));

    next();
  };
}

// ============================================================================
// Request Size Validation
// ============================================================================

/**
 * Validates request body size.
 */
export function maxRequestSize(maxSizeBytes: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const contentLength = parseInt(req.headers['content-length'] || '0');

    if (contentLength > maxSizeBytes) {
      res.status(413).json({
        error: {
          message: `Request body too large. Maximum size is ${Math.round(maxSizeBytes / 1024 / 1024)}MB`,
          code: 'PAYLOAD_TOO_LARGE',
        },
      });
      return;
    }

    next();
  };
}

// ============================================================================
// Security Headers Middleware
// ============================================================================

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const IS_STAGING = process.env.NODE_ENV === 'staging';
const ENFORCE_HTTPS = IS_PRODUCTION || IS_STAGING || process.env.ENFORCE_HTTPS === 'true';

/**
 * Adds comprehensive security headers.
 */
export function securityHeaders(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');

  // XSS Protection (for older browsers)
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Referrer policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Content-Security-Policy for API responses
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");

  // Permissions-Policy (restrict browser features)
  res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=()');

  // HTTP Strict Transport Security (production only)
  if (ENFORCE_HTTPS) {
    // 1 year max-age, include subdomains, allow preload
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }

  // Cache-Control for API responses (prevent caching of sensitive data)
  if (!res.getHeader('Cache-Control')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }

  // Don't reveal server info
  res.removeHeader('X-Powered-By');
  res.removeHeader('Server');

  next();
}

// ============================================================================
// CORS Preflight Handler
// ============================================================================

/**
 * Parse allowed origins from environment or config
 */
function parseAllowedOrigins(): string[] {
  const envOrigin = process.env.CORS_ORIGIN;
  if (!envOrigin) return [];

  // Support comma-separated origins
  return envOrigin.split(',').map(o => o.trim()).filter(Boolean);
}

/**
 * Validates if an origin is allowed.
 * In production, only explicitly whitelisted origins are allowed.
 */
function isOriginAllowed(origin: string, allowedOrigins: string[]): boolean {
  if (!origin) return false;

  // Never allow wildcard in production
  if ((IS_PRODUCTION || IS_STAGING) && allowedOrigins.includes('*')) {
    return false;
  }

  // Check explicit whitelist
  if (allowedOrigins.includes(origin)) return true;

  // Check wildcard only in development
  if (!IS_PRODUCTION && !IS_STAGING && allowedOrigins.includes('*')) return true;

  // Support pattern matching for subdomains (e.g., *.example.com)
  for (const allowed of allowedOrigins) {
    if (allowed.startsWith('*.')) {
      const domain = allowed.slice(2);
      try {
        const originUrl = new URL(origin);
        if (originUrl.hostname.endsWith(domain) || originUrl.hostname === domain.slice(1)) {
          return true;
        }
      } catch {
        // Invalid URL, skip
      }
    }
  }

  return false;
}

/**
 * Handles CORS preflight requests with strict validation.
 */
export function corsPreflightHandler(allowedOrigins: string[] = parseAllowedOrigins()) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const origin = req.headers.origin;

    if (req.method === 'OPTIONS') {
      if (origin && isOriginAllowed(origin, allowedOrigins)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Request-ID, Idempotency-Key, X-Dev-Org-Id, X-Dev-Party-Id');
        res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Vary', 'Origin');
        res.status(204).end();
        return;
      } else if (origin) {
        // Origin not allowed - return 403
        res.status(403).json({
          error: {
            message: 'Origin not allowed by CORS policy',
            code: 'CORS_NOT_ALLOWED',
          },
        });
        return;
      }
    }

    // Set CORS headers for non-preflight requests too
    if (origin && isOriginAllowed(origin, allowedOrigins)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Vary', 'Origin');
    }

    next();
  };
}

/**
 * Strict CORS middleware for production
 */
export function strictCors(allowedOrigins?: string[]) {
  const origins = allowedOrigins || parseAllowedOrigins();

  return (req: Request, res: Response, next: NextFunction): void => {
    const origin = req.headers.origin;

    // In production, reject requests without origin or from disallowed origins
    if (IS_PRODUCTION || IS_STAGING) {
      if (origin && !isOriginAllowed(origin, origins)) {
        res.status(403).json({
          error: {
            message: 'Origin not allowed',
            code: 'CORS_ORIGIN_REJECTED',
          },
        });
        return;
      }
    }

    next();
  };
}

// ============================================================================
// Request Validation Middleware
// ============================================================================

/**
 * Validates that Content-Type is application/json for POST/PUT/PATCH requests.
 */
export function validateContentType(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const methodsRequiringBody = ['POST', 'PUT', 'PATCH'];

  if (methodsRequiringBody.includes(req.method)) {
    const contentType = req.headers['content-type'];

    // Allow requests without body
    const contentLength = parseInt(req.headers['content-length'] || '0');
    if (contentLength === 0) {
      return next();
    }

    // Check content type
    if (!contentType || !contentType.includes('application/json')) {
      res.status(415).json({
        error: {
          message: 'Content-Type must be application/json',
          code: 'UNSUPPORTED_MEDIA_TYPE',
        },
      });
      return;
    }
  }

  next();
}

// ============================================================================
// Combined API Gateway Middleware
// ============================================================================

/**
 * Combined middleware that applies all API gateway features.
 */
export function apiGateway(options: {
  timeout?: number;
  maxBodySize?: number;
  enableSecurityHeaders?: boolean;
  allowedOrigins?: string[];
} = {}) {
  const {
    timeout = 30000,
    maxBodySize = 10 * 1024 * 1024, // 10MB default
    enableSecurityHeaders = true,
    allowedOrigins = ['*'],
  } = options;

  // Note: Rate limiting is handled by the Redis-backed middleware in rateLimit.ts
  const middlewares = [
    requestIdMiddleware,
    requestTimeout(timeout),
    maxRequestSize(maxBodySize),
    validateContentType,
  ];

  if (enableSecurityHeaders) {
    middlewares.push(securityHeaders);
  }

  return (req: Request, res: Response, next: NextFunction): void => {
    // Execute middlewares in sequence
    let index = 0;

    const runNext: NextFunction = (err?: unknown): void => {
      if (err) {
        return next(err);
      }

      if (index >= middlewares.length) {
        return next();
      }

      const middleware = middlewares[index++];
      try {
        middleware(req as RequestWithContext, res, runNext);
      } catch (error) {
        next(error);
      }
    };

    runNext();
  };
}
