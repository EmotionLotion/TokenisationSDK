/**
 * Usage Tracking Middleware
 *
 * Express middleware that records API usage for every request.
 * Captures:
 * - Endpoint and HTTP method
 * - Response status code
 * - Response time
 * - Request/response sizes
 *
 * Also provides quota enforcement middleware.
 *
 * @packageDocumentation
 */

import { Request, Response, NextFunction } from 'express';
import { usageService } from '../services/usage.service.js';
import { billingService } from '../services/billing.service.js';
import { logger } from './logger.js';
import { type ApiKeyRequest } from './auth.js';

// ============================================================================
// USAGE TRACKING MIDDLEWARE
// ============================================================================

/**
 * Middleware to track API usage
 * Should be applied after authentication middleware so orgId is available
 */
export function usageMiddleware() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const startTime = Date.now();
    const requestSize = parseInt(req.headers['content-length'] || '0', 10);

    // Store original end function
    const originalEnd = res.end;
    let responseSize = 0;

    // Override end to capture response size
    res.end = function(this: Response, chunk?: any, encoding?: BufferEncoding | (() => void), cb?: () => void): Response {
      if (chunk) {
        responseSize = Buffer.byteLength(chunk);
      }
      return (originalEnd as Function).call(this, chunk, encoding, cb) as Response;
    } as typeof res.end;

    // Capture when response finishes
    res.on('finish', async () => {
      try {
        // Get orgId from request (set by auth middleware)
        const apiKeyReq = req as ApiKeyRequest;
        const orgId = apiKeyReq.apiKey?.orgId;

        if (!orgId) {
          // No org context, skip tracking (probably a public endpoint)
          return;
        }

        // Normalize endpoint (remove IDs for aggregation)
        const endpoint = normalizeEndpoint(req.path);

        await usageService.recordUsage({
          orgId,
          endpoint,
          method: req.method,
          statusCode: res.statusCode,
          responseTimeMs: Date.now() - startTime,
          requestSize,
          responseSize,
        });
      } catch (error) {
        // Don't fail the request if usage tracking fails
        logger.error('Failed to record usage', { error });
      }
    });

    next();
  };
}

// ============================================================================
// QUOTA ENFORCEMENT MIDDLEWARE
// ============================================================================

/**
 * Middleware to enforce API quota limits
 * Returns 429 Too Many Requests if quota is exceeded
 */
export function quotaEnforcementMiddleware(resource: string = 'api_calls') {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const apiKeyReq = req as ApiKeyRequest;
      const orgId = apiKeyReq.apiKey?.orgId;

      if (!orgId) {
        // No org context, skip quota check
        return next();
      }

      const withinQuota = await billingService.enforceQuota(orgId, resource);

      if (!withinQuota) {
        const quotaStatus = await usageService.checkQuota(orgId, resource);

        logger.warn('Quota exceeded', {
          metadata: {
            orgId,
            resource,
            limit: quotaStatus.limit,
            used: quotaStatus.used,
          },
        });

        res.status(429).json({
          error: 'quota_exceeded',
          message: `You have exceeded your ${resource} quota for this billing period`,
          quota: {
            resource,
            limit: quotaStatus.limit,
            used: quotaStatus.used,
            resetAt: quotaStatus.periodEnd.toISOString(),
          },
          upgrade_url: '/billing/upgrade',
        });
        return;
      }

      next();
    } catch (error) {
      // Don't fail request if quota check fails, let it through
      logger.error('Quota enforcement error', { error });
      next();
    }
  };
}

// ============================================================================
// BILLING STATUS MIDDLEWARE
// ============================================================================

/**
 * Middleware to check if org has active billing
 * Blocks suspended/cancelled accounts from making API calls
 */
export function billingStatusMiddleware() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const apiKeyReq = req as ApiKeyRequest;
      const orgId = apiKeyReq.apiKey?.orgId;

      if (!orgId) {
        return next();
      }

      const billingInfo = await billingService.getBillingInfo(orgId);

      if (billingInfo?.status === 'suspended') {
        res.status(402).json({
          error: 'billing_suspended',
          message: 'Your account has been suspended. Please contact support or update your payment method.',
          support_url: '/support',
        });
        return;
      }

      if (billingInfo?.status === 'cancelled') {
        res.status(402).json({
          error: 'billing_cancelled',
          message: 'Your account has been cancelled. Please reactivate to continue using the API.',
          reactivate_url: '/billing/reactivate',
        });
        return;
      }

      next();
    } catch (error) {
      logger.error('Billing status check error', { error });
      next();
    }
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Normalize endpoint paths for aggregation
 * Replaces UUIDs and numeric IDs with placeholders
 */
function normalizeEndpoint(path: string): string {
  // Remove query string
  const pathOnly = path.split('?')[0];

  // Remove trailing slash
  let normalized = pathOnly.replace(/\/$/, '');

  // Replace UUIDs
  normalized = normalized.replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    ':id'
  );

  // Replace numeric IDs in path segments
  normalized = normalized.replace(/\/\d+(?=\/|$)/g, '/:id');

  // Replace hex strings that look like IDs (e.g., wallet addresses, tx hashes)
  normalized = normalized.replace(/\/0x[0-9a-f]{40,}/gi, '/:address');

  return normalized;
}

// ============================================================================
// COMBINED MIDDLEWARE FACTORY
// ============================================================================

/**
 * Factory function to create all usage-related middleware
 */
export function createUsageMiddleware(options: {
  trackUsage?: boolean;
  enforceQuota?: boolean;
  checkBillingStatus?: boolean;
  quotaResource?: string;
} = {}) {
  const {
    trackUsage = true,
    enforceQuota = true,
    checkBillingStatus = true,
    quotaResource = 'api_calls',
  } = options;

  const middlewares: Array<(req: Request, res: Response, next: NextFunction) => Promise<void>> = [];

  if (trackUsage) {
    middlewares.push(usageMiddleware());
  }

  if (checkBillingStatus) {
    middlewares.push(billingStatusMiddleware());
  }

  if (enforceQuota) {
    middlewares.push(quotaEnforcementMiddleware(quotaResource));
  }

  // Return a combined middleware
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    let index = 0;

    const runNext = async (): Promise<void> => {
      if (index < middlewares.length) {
        const middleware = middlewares[index];
        index++;
        await middleware(req, res, runNext);
      } else {
        next();
      }
    };

    await runNext();
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  normalizeEndpoint,
};
