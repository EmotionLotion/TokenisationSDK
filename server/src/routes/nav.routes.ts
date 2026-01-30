/**
 * NAV (Net Asset Value) Routes
 *
 * Endpoints for retrieving, calculating, and managing NAV data for tokenised assets.
 * Includes a CRE webhook callback endpoint for receiving oracle-computed NAV results.
 *
 * @packageDocumentation
 */

import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as navService from '../services/nav.service.js';
import { ValidationError, NotFoundError } from '../middleware/errorHandler.js';
import { apiKeyMiddleware, type ApiKeyRequest } from '../middleware/auth.js';

export const navRouter = Router();

// ============================================================================
// Validation Schemas
// ============================================================================

const navHistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  source: z.enum(['cre_workflow', 'manual', 'api']).optional(),
});

const manualValuationSchema = z.object({
  totalAssetValue: z.string().regex(/^\d+$/, 'Must be a non-negative integer string'),
  liabilities: z.string().regex(/^\d+$/).optional(),
  currency: z.string().min(1).max(10).optional(),
  decimals: z.number().int().min(0).max(36).optional(),
  reason: z.string().max(1000).optional(),
  sources: z.array(z.object({
    name: z.string().min(1).max(256),
    value: z.string().regex(/^\d+$/),
    weight: z.number().min(0).max(1),
  })).optional(),
});

const creCallbackSchema = z.object({
  assetId: z.string().min(1),
  navPerToken: z.string(),
  totalAssetValue: z.string(),
  liabilities: z.string(),
  netAssetValue: z.string(),
  totalSupply: z.string(),
  currency: z.string(),
  decimals: z.number().int(),
  valuationSources: z.array(z.object({
    name: z.string(),
    value: z.string(),
    weight: z.number(),
    timestamp: z.number(),
  })),
  computedAt: z.string(),
  txHash: z.string().optional(),
});

// ============================================================================
// Routes
// ============================================================================

/**
 * GET /api/v1/assets/:assetId/nav
 * Retrieve the current (most recent) NAV for an asset.
 */
navRouter.get(
  '/:assetId/nav',
  apiKeyMiddleware,
  async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.apiKey) {
        throw new ValidationError('API key required');
      }

      const { assetId } = req.params;
      const record = await navService.getCurrentNAV(req.apiKey.orgId, assetId);

      if (!record) {
        throw new NotFoundError(`No NAV record found for asset ${assetId}`);
      }

      // Fetch valuation sources for the current record
      const sources = await navService.getValuationSources(record.id);

      res.json({
        nav: record,
        valuationSources: sources,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/assets/:assetId/nav/history
 * Retrieve paginated NAV history for an asset.
 */
navRouter.get(
  '/:assetId/nav/history',
  apiKeyMiddleware,
  async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.apiKey) {
        throw new ValidationError('API key required');
      }

      const { assetId } = req.params;

      const queryResult = navHistoryQuerySchema.safeParse(req.query);
      if (!queryResult.success) {
        throw new ValidationError(
          queryResult.error.errors
            .map((e) => `${e.path.join('.')}: ${e.message}`)
            .join(', ')
        );
      }

      const { records, total, page, limit } = await navService.getNAVHistory(
        req.apiKey.orgId,
        assetId,
        queryResult.data
      );

      res.json({
        records,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/assets/:assetId/nav/valuations
 * Submit a manual valuation override and compute NAV.
 */
navRouter.post(
  '/:assetId/nav/valuations',
  apiKeyMiddleware,
  async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.apiKey) {
        throw new ValidationError('API key required');
      }

      const { assetId } = req.params;

      const parseResult = manualValuationSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new ValidationError(
          parseResult.error.errors
            .map((e) => `${e.path.join('.')}: ${e.message}`)
            .join(', ')
        );
      }

      const record = await navService.addManualValuation(
        req.apiKey.orgId,
        assetId,
        parseResult.data
      );

      res.status(201).json({ nav: record });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/assets/:assetId/nav/callback
 * CRE webhook callback endpoint. Receives NAV results computed by the
 * Chainlink Runtime Environment workflow.
 *
 * Authenticated via x-api-key header. The CRE workflow sends this header
 * with the configured callback API key.
 */
navRouter.post(
  '/:assetId/nav/callback',
  apiKeyMiddleware,
  async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.apiKey) {
        throw new ValidationError('API key required');
      }

      const { assetId } = req.params;

      const parseResult = creCallbackSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new ValidationError(
          parseResult.error.errors
            .map((e) => `${e.path.join('.')}: ${e.message}`)
            .join(', ')
        );
      }

      // Verify the assetId in the URL matches the payload
      if (parseResult.data.assetId !== assetId) {
        throw new ValidationError(
          `Asset ID mismatch: URL says "${assetId}" but payload says "${parseResult.data.assetId}"`
        );
      }

      const record = await navService.processCallback(
        req.apiKey.orgId,
        assetId,
        parseResult.data
      );

      res.status(201).json({
        nav: record,
        message: 'NAV callback processed successfully',
      });
    } catch (error) {
      next(error);
    }
  }
);
