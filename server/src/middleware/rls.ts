/**
 * Row Level Security (RLS) Middleware
 *
 * Sets the current organization context in PostgreSQL session for RLS policies.
 * Must be applied AFTER authentication middleware so orgId is available.
 *
 * @packageDocumentation
 */

import { Request, Response, NextFunction } from 'express';
import { pool, getDbMode } from '../config/database.js';
import { logger } from './logger.js';
import { type ApiKeyRequest } from './auth.js';

/** Track whether the SQLite RLS skip warning has been logged */
let _rlsWarningLogged = false;

/**
 * Middleware to set the current org_id in PostgreSQL session for RLS
 *
 * This middleware enables Row Level Security by setting a session variable
 * that PostgreSQL RLS policies use to filter rows by organization.
 *
 * Usage:
 *   app.use(apiKeyMiddleware);  // First: authenticate
 *   app.use(rlsMiddleware());   // Then: set RLS context
 */
export function rlsMiddleware() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Skip RLS for SQLite mode (SQLite doesn't support RLS)
    if (getDbMode() === 'sqlite') {
      if (!_rlsWarningLogged) {
        logger.warn('RLS middleware skipped — SQLite mode does not support Row-Level Security. All org data is accessible. Use PostgreSQL for multi-tenant isolation.');
        _rlsWarningLogged = true;
      }
      return next();
    }

    const apiKeyReq = req as ApiKeyRequest;
    const orgId = apiKeyReq.apiKey?.orgId;

    if (!orgId) {
      // No org context - RLS will block all tenant-scoped queries
      // This is correct behavior for unauthenticated requests
      return next();
    }

    // Store orgId for cleanup on response finish
    (req as any).__rlsOrgId = orgId;

    try {
      // Set the org_id in PostgreSQL session
      // This is used by RLS policies: org_id = app.current_org_id()
      if (pool) {
        const client = await pool.connect();
        try {
          await client.query(`SELECT app.set_current_org_id($1::uuid)`, [orgId]);

          // Store client reference for use in request handlers
          (req as any).__pgClient = client;

          // Clean up on response finish
          res.on('finish', async () => {
            try {
              // Clear the org context
              await client.query(`SELECT app.clear_current_org_id()`);
            } catch (error) {
              logger.error('Failed to clear RLS context', { error });
            } finally {
              client.release();
            }
          });

          // Also clean up on response close (client disconnect)
          res.on('close', () => {
            if (!(res as any).__rlsCleanedUp) {
              client.release();
              (res as any).__rlsCleanedUp = true;
            }
          });

        } catch (error) {
          client.release();
          throw error;
        }
      }

      next();
    } catch (error) {
      logger.error('Failed to set RLS context', { error, orgId });
      // Don't fail the request, but RLS will block tenant queries
      next();
    }
  };
}

/**
 * Utility function to set org context manually (for background jobs, etc.)
 */
export async function setOrgContext(orgId: string): Promise<void> {
  if (getDbMode() === 'sqlite' || !pool) {
    return;
  }

  const client = await pool.connect();
  try {
    await client.query(`SELECT app.set_current_org_id($1::uuid)`, [orgId]);
  } finally {
    client.release();
  }
}

/**
 * Utility function to clear org context manually
 */
export async function clearOrgContext(): Promise<void> {
  if (getDbMode() === 'sqlite' || !pool) {
    return;
  }

  const client = await pool.connect();
  try {
    await client.query(`SELECT app.clear_current_org_id()`);
  } finally {
    client.release();
  }
}

/**
 * Execute a function with a specific org context
 * Useful for background jobs or cross-org operations
 */
export async function withOrgContext<T>(
  orgId: string,
  fn: () => Promise<T>
): Promise<T> {
  if (getDbMode() === 'sqlite' || !pool) {
    return fn();
  }

  const client = await pool.connect();
  try {
    await client.query(`SELECT app.set_current_org_id($1::uuid)`, [orgId]);
    const result = await fn();
    return result;
  } finally {
    try {
      await client.query(`SELECT app.clear_current_org_id()`);
    } catch {
      // Ignore cleanup errors
    }
    client.release();
  }
}

/**
 * Bypass RLS for admin operations (use with caution!)
 * This should only be used for system-level operations like migrations
 */
export async function withBypassRLS<T>(fn: () => Promise<T>): Promise<T> {
  if (getDbMode() === 'sqlite' || !pool) {
    return fn();
  }

  // When no org context is set and the user has BYPASSRLS privilege,
  // they can see all rows. This is typically only for superusers.
  const client = await pool.connect();
  try {
    await client.query(`SELECT app.clear_current_org_id()`);
    const result = await fn();
    return result;
  } finally {
    client.release();
  }
}

export default rlsMiddleware;
