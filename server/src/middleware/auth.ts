import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UnauthorizedError } from './errorHandler.js';

export interface JwtPayload {
  partyId: string;
  address: string;
  iat: number;
  exp: number;
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

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const DEV_MODE = process.env.NODE_ENV !== 'production' && process.env.AUTH_DEV_MODE === 'true';

export function authMiddleware(
  req: AuthRequest,
  _res: Response,
  next: NextFunction
): void {
  try {
    // In dev mode with AUTH_DEV_MODE=true, allow bypass with x-dev-party-id header
    if (DEV_MODE && req.headers['x-dev-party-id']) {
      req.user = {
        partyId: req.headers['x-dev-party-id'] as string,
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

    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    req.user = decoded;
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      next(new UnauthorizedError('Token expired'));
    } else if (error instanceof jwt.JsonWebTokenError) {
      next(new UnauthorizedError('Invalid token'));
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
      const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
      req.user = decoded;
    }

    next();
  } catch {
    // Token invalid but optional, continue without user
    next();
  }
}

export function generateToken(payload: Omit<JwtPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '1h',
  });
}

export function generateRefreshToken(payload: Omit<JwtPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
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
    const DEV_MODE_LOCAL = process.env.NODE_ENV !== 'production' && process.env.AUTH_DEV_MODE === 'true';
    if (DEV_MODE_LOCAL && req.headers['x-dev-org-id']) {
      req.apiKey = {
        orgId: req.headers['x-dev-org-id'] as string,
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
        const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
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
