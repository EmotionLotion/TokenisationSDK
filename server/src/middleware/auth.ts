import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UnauthorizedError } from './errorHandler.js';
import { logger } from './logger.js';

// ============================================================================
// SECURITY CONFIGURATION
// ============================================================================

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const IS_STAGING = process.env.NODE_ENV === 'staging';
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_ISSUER = process.env.JWT_ISSUER || 'tokenisation-api';
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || 'tokenisation-sdk';
const MIN_SECRET_LENGTH = 32;

/**
 * CRITICAL: Dev mode auth bypass
 * This should NEVER be enabled in production or staging environments.
 * Even in development, use with extreme caution.
 */
const DEV_MODE = !IS_PRODUCTION && !IS_STAGING && process.env.AUTH_DEV_MODE === 'true';

/**
 * Allowed IP addresses for dev mode bypass (localhost only by default)
 * Can be extended via AUTH_DEV_ALLOWED_IPS environment variable
 */
const DEV_ALLOWED_IPS = new Set([
  '127.0.0.1',
  '::1',
  '::ffff:127.0.0.1',
  'localhost',
  ...(process.env.AUTH_DEV_ALLOWED_IPS?.split(',').map(ip => ip.trim()) || []),
]);

/**
 * Allowed dev org IDs (restricted set for safety)
 * Can be extended via AUTH_DEV_ALLOWED_ORGS environment variable
 */
const DEV_ALLOWED_ORGS = new Set([
  'dev-org',
  'test-org',
  'demo-org',
  ...(process.env.AUTH_DEV_ALLOWED_ORGS?.split(',').map(org => org.trim()) || []),
]);

// Security validation at startup
if (IS_PRODUCTION || IS_STAGING) {
  if (!JWT_SECRET) {
    logger.error('FATAL: JWT_SECRET environment variable is required in production/staging');
    process.exit(1);
  }
  if (JWT_SECRET.length < MIN_SECRET_LENGTH) {
    logger.error(`FATAL: JWT_SECRET must be at least ${MIN_SECRET_LENGTH} characters in production/staging`);
    process.exit(1);
  }
  if (DEV_MODE) {
    logger.error('FATAL: AUTH_DEV_MODE cannot be enabled in production or staging');
    process.exit(1);
  }
} else {
  // Development mode warnings
  if (!JWT_SECRET) {
    logger.warn('WARNING: JWT_SECRET not set. Using insecure development secret.');
  }
  if (DEV_MODE) {
    logger.warn('WARNING: AUTH_DEV_MODE is enabled. This bypasses all authentication!');
    logger.warn(`         Allowed IPs: ${Array.from(DEV_ALLOWED_IPS).join(', ')}`);
    logger.warn(`         Allowed orgs: ${Array.from(DEV_ALLOWED_ORGS).join(', ')}`);
  }
}

// Use provided secret or generate a dev-only secret (never in production)
const EFFECTIVE_JWT_SECRET = JWT_SECRET || 'INSECURE_DEV_SECRET_DO_NOT_USE_IN_PRODUCTION';

// Track dev mode usage for audit purposes
const devModeUsageLog: Array<{ timestamp: Date; ip: string; orgId?: string; partyId?: string }> = [];
const MAX_DEV_USAGE_LOG = 1000;

function logDevModeUsage(ip: string, orgId?: string, partyId?: string): void {
  if (devModeUsageLog.length >= MAX_DEV_USAGE_LOG) {
    devModeUsageLog.shift();
  }
  devModeUsageLog.push({ timestamp: new Date(), ip, orgId, partyId });
  logger.warn('DEV_MODE auth bypass used', { metadata: { ip, orgId, partyId } });
}

export function getDevModeUsageLog(): typeof devModeUsageLog {
  return [...devModeUsageLog];
}

export interface JwtPayload {
  partyId: string;
  address: string;
  iat: number;
  exp: number;
  iss?: string;
  aud?: string;
}

export interface ApiKeyPayload {
  orgId: string;
  scopes: string[];
  keyId: string;
}

export interface AuthRequest extends Request {
  user?: JwtPayload;
}

export interface ApiKeyRequest extends Request {
  apiKey?: ApiKeyPayload;
  user?: JwtPayload;
}

/**
 * Get client IP from request, handling proxies
 */
function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || req.ip || 'unknown';
}

/**
 * Check if client IP is allowed for dev mode
 */
function isDevIpAllowed(req: Request): boolean {
  const clientIp = getClientIp(req);
  return DEV_ALLOWED_IPS.has(clientIp);
}

/**
 * Check if org ID is allowed for dev mode
 */
function isDevOrgAllowed(orgId: string): boolean {
  // Allow any org ID that starts with 'dev-', 'test-', or 'demo-'
  if (orgId.startsWith('dev-') || orgId.startsWith('test-') || orgId.startsWith('demo-')) {
    return true;
  }
  return DEV_ALLOWED_ORGS.has(orgId);
}

export function authMiddleware(
  req: AuthRequest,
  _res: Response,
  next: NextFunction
): void {
  try {
    // In dev mode with AUTH_DEV_MODE=true, allow bypass with x-dev-party-id header
    if (DEV_MODE && req.headers['x-dev-party-id']) {
      // Verify IP is allowed
      if (!isDevIpAllowed(req)) {
        logger.warn('Dev mode bypass rejected: IP not allowed', { metadata: { ip: getClientIp(req) } });
        throw new UnauthorizedError('Dev mode not available from this IP');
      }

      const partyId = req.headers['x-dev-party-id'] as string;
      logDevModeUsage(getClientIp(req), undefined, partyId);

      req.user = {
        partyId,
        address: (req.headers['x-dev-address'] as string) || '0x0000000000000000000000000000000000000000',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      };
      return next();
    }

    const authHeader = req.headers.authorization;

    if (!authHeader) {
      throw new UnauthorizedError('No authorization header');
    }

    const [scheme, token] = authHeader.split(' ');

    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedError('Invalid authorization format');
    }

    const decoded = jwt.verify(token, EFFECTIVE_JWT_SECRET, {
      algorithms: ['HS256', 'HS384', 'HS512'],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    }) as JwtPayload;
    req.user = decoded;
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      next(new UnauthorizedError('Token expired'));
    } else if (error instanceof jwt.JsonWebTokenError) {
      next(new UnauthorizedError('Invalid token'));
    } else if (error instanceof jwt.NotBeforeError) {
      next(new UnauthorizedError('Token not yet valid'));
    } else {
      next(error);
    }
  }
}

export function optionalAuthMiddleware(
  req: AuthRequest,
  _res: Response,
  next: NextFunction
): void {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return next();
    }

    const [scheme, token] = authHeader.split(' ');

    if (scheme === 'Bearer' && token) {
      const decoded = jwt.verify(token, EFFECTIVE_JWT_SECRET, {
        algorithms: ['HS256', 'HS384', 'HS512'],
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
      }) as JwtPayload;
      req.user = decoded;
    }

    next();
  } catch {
    // Token invalid but optional, continue without user
    next();
  }
}

export function generateToken(payload: Omit<JwtPayload, 'iat' | 'exp' | 'iss' | 'aud'>): string {
  return jwt.sign(payload, EFFECTIVE_JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: (process.env.JWT_EXPIRES_IN || '1h') as jwt.SignOptions['expiresIn'],
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });
}

export function generateRefreshToken(payload: Omit<JwtPayload, 'iat' | 'exp' | 'iss' | 'aud'>): string {
  return jwt.sign(payload, EFFECTIVE_JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: (process.env.JWT_REFRESH_EXPIRES_IN || '7d') as jwt.SignOptions['expiresIn'],
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, EFFECTIVE_JWT_SECRET, {
    algorithms: ['HS256', 'HS384', 'HS512'],
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  }) as JwtPayload;
}

// API Key Authentication Middleware
// Validates API keys in the format: sk_test_xxx or sk_live_xxx
export async function apiKeyMiddleware(
  req: ApiKeyRequest,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // In dev mode, allow bypass FIRST (before any other auth checks)
    const DEV_MODE_LOCAL = !IS_PRODUCTION && !IS_STAGING && process.env.AUTH_DEV_MODE === 'true';
    if (DEV_MODE_LOCAL && req.headers['x-dev-org-id']) {
      // Verify IP is allowed
      if (!isDevIpAllowed(req)) {
        logger.warn('Dev mode bypass rejected: IP not allowed', { metadata: { ip: getClientIp(req) } });
        throw new UnauthorizedError('Dev mode not available from this IP');
      }

      const devOrgId = req.headers['x-dev-org-id'] as string;

      // Verify org ID is allowed
      if (!isDevOrgAllowed(devOrgId)) {
        logger.warn('Dev mode bypass rejected: org ID not allowed', { metadata: { orgId: devOrgId } });
        throw new UnauthorizedError('Dev mode not available for this org ID');
      }

      logDevModeUsage(getClientIp(req), devOrgId);

      // Ensure the dev org exists in the database
      const { ensureDevOrg } = await import('../services/iam.service.js');
      await ensureDevOrg(devOrgId);

      req.apiKey = {
        orgId: devOrgId,
        scopes: ['admin'],
        keyId: 'dev-key',
      };
      return next();
    }

    const authHeader = req.headers.authorization;

    // Check for API key in header
    if (authHeader && authHeader.startsWith('Bearer sk_')) {
      const apiKey = authHeader.slice(7); // Remove 'Bearer '

      // Dynamically import the IAM service to avoid circular dependency
      const { validateApiKey } = await import('../services/iam.service.js');

      const keyInfo = await validateApiKey(apiKey);
      req.apiKey = {
        orgId: keyInfo.orgId,
        scopes: keyInfo.scopes,
        keyId: keyInfo.keyId,
      };
      return next();
    }

    // Fall back to JWT auth if no API key
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7);

      // Check if it's a JWT (not an API key)
      if (!token.startsWith('sk_')) {
        const decoded = jwt.verify(token, EFFECTIVE_JWT_SECRET, {
          algorithms: ['HS256', 'HS384', 'HS512'],
          issuer: JWT_ISSUER,
          audience: JWT_AUDIENCE,
        }) as JwtPayload;
        req.user = decoded;
        return next();
      }
    }

    throw new UnauthorizedError('No valid authentication provided');
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      next(error);
    } else if (error instanceof jwt.TokenExpiredError) {
      next(new UnauthorizedError('Token expired'));
    } else if (error instanceof jwt.JsonWebTokenError) {
      next(new UnauthorizedError('Invalid token'));
    } else if (error instanceof jwt.NotBeforeError) {
      next(new UnauthorizedError('Token not yet valid'));
    } else {
      next(error);
    }
  }
}

// Combined middleware that accepts either API key or JWT
export async function combinedAuthMiddleware(
  req: ApiKeyRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  return apiKeyMiddleware(req, res, next);
}

/**
 * Check if dev mode is currently enabled
 */
export function isDevModeEnabled(): boolean {
  return DEV_MODE;
}
