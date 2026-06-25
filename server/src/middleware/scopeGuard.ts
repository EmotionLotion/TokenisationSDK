/**
 * Scope Guard Middleware
 *
 * Enforces scope-based authorization on routes.
 * API keys must include the required scope (or 'admin') to proceed.
 */

import { Response, NextFunction } from 'express';
import { UnauthorizedError } from './errorHandler.js';
import type { ApiKeyRequest } from './auth.js';
import { permissionGranted, requiredPermission } from './permission.js';

/**
 * Returns middleware that authorizes the request against the API key's granted
 * permissions/scopes via the single permission matcher (see permission.ts).
 *
 * Backward compatible: `requireScope('read')` still works for keys carrying coarse
 * scopes like ['read','write']. It now ALSO honors rich role permission strings —
 * e.g. a key with ['read:*','write:tokens'] passes `requireScope('read')` and
 * `requireScope('write','tokens')`, which the previous exact-match guard wrongly denied.
 *
 * Optional `resource` enables resource-level checks: requireScope('write','compliance')
 * requires 'write:compliance' (granted by 'write:compliance', 'write', 'write:*', '*' or 'admin').
 *
 * '*' and 'admin' grant everything. An action never implies another action
 * (e.g. 'write' does not satisfy 'read').
 */
export function requireScope(action: string, resource?: string) {
  const required = requiredPermission(action, resource);
  return (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    if (!req.apiKey) {
      return next(new UnauthorizedError('No valid authentication provided'));
    }
    if (!permissionGranted(req.apiKey.scopes, required)) {
      return next(new UnauthorizedError(`Requires '${required}' permission`));
    }
    next();
  };
}
