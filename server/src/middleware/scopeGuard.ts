/**
 * Scope Guard Middleware
 *
 * Enforces scope-based authorization on routes.
 * API keys must include the required scope (or 'admin') to proceed.
 */

import { Response, NextFunction } from 'express';
import { UnauthorizedError } from './errorHandler.js';
import type { ApiKeyRequest } from './auth.js';

/**
 * Returns middleware that checks the request's API key scopes.
 * The 'admin' scope grants access to all routes.
 */
export function requireScope(scope: string) {
  return (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    if (!req.apiKey?.scopes?.includes(scope) && !req.apiKey?.scopes?.includes('admin')) {
      return next(new UnauthorizedError(`Requires '${scope}' scope`));
    }
    next();
  };
}
