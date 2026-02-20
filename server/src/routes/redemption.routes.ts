/**
 * Redemption Routes
 *
 * Endpoints for the full token redemption workflow:
 * request -> validate -> price -> approve/reject -> execute (burn + payout)
 */

import { Router, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import * as redemptionService from '../services/redemption.service.js';
import { apiKeyMiddleware, type ApiKeyRequest } from '../middleware/auth.js';
import { requireScope } from '../middleware/scopeGuard.js';
import { ValidationError } from '../middleware/errorHandler.js';

export const redemptionRouter = Router();

// ============================================================================
// Validation Schemas
// ============================================================================

const requestRedemptionSchema = z.object({
  investorId: z.string().uuid(),
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address'),
  amount: z.string().min(1).regex(/^\d+$/, 'Amount must be a positive integer string'),
  reason: z.string().max(1024).optional(),
});

const rejectRedemptionSchema = z.object({
  reason: z.string().min(1).max(2048, 'Reason must be at most 2048 characters'),
});

const listRedemptionsQuerySchema = z.object({
  status: z.enum([
    'requested', 'validated', 'priced', 'approved',
    'burning', 'burned', 'disbursing', 'completed',
    'rejected', 'failed',
  ]).optional(),
  investorId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

// ============================================================================
// Token-scoped Redemption Routes
// ============================================================================

/**
 * POST /api/v1/tokens/:tokenId/redeem
 *
 * Request a redemption for a specific token.
 */
redemptionRouter.post(
  '/tokens/:tokenId/redeem',
  apiKeyMiddleware,
  requireScope('write'),
  async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.apiKey) {
        throw new ValidationError('API key required');
      }

      const body = requestRedemptionSchema.parse(req.body);

      const redemption = await redemptionService.requestRedemption(
        req.apiKey.orgId,
        req.params.tokenId,
        body.investorId,
        body.walletAddress,
        body.amount,
        body.reason
      );

      res.status(201).json({
        success: true,
        data: redemption,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        next(new ValidationError(error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')));
      } else {
        next(error);
      }
    }
  }
);

/**
 * GET /api/v1/tokens/:tokenId/redemptions
 *
 * List redemptions for a specific token.
 */
redemptionRouter.get(
  '/tokens/:tokenId/redemptions',
  apiKeyMiddleware,
  requireScope('read'),
  async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.apiKey) {
        throw new ValidationError('API key required');
      }

      const filters = listRedemptionsQuerySchema.parse(req.query);

      const result = await redemptionService.listRedemptions(
        req.apiKey.orgId,
        req.params.tokenId,
        {
          status: filters.status as redemptionService.RedemptionStatus | undefined,
          investorId: filters.investorId,
          limit: filters.limit,
          offset: filters.offset,
        }
      );

      res.json({
        success: true,
        data: result.data,
        count: result.count,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        next(new ValidationError(error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')));
      } else {
        next(error);
      }
    }
  }
);

// ============================================================================
// Redemption Lifecycle Routes
// ============================================================================

/**
 * GET /api/v1/redemptions/:id
 *
 * Get redemption details by ID.
 */
redemptionRouter.get(
  '/redemptions/:id',
  apiKeyMiddleware,
  requireScope('read'),
  async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.apiKey) {
        throw new ValidationError('API key required');
      }

      const redemption = await redemptionService.getRedemption(req.params.id, req.apiKey.orgId);

      res.json({
        success: true,
        data: redemption,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PATCH /api/v1/redemptions/:id/approve
 *
 * Approve a priced redemption. The redemption must be in 'priced' status.
 * If the redemption is in 'requested' or 'validated' status, it will be
 * automatically advanced through validation and pricing first.
 */
redemptionRouter.patch(
  '/redemptions/:id/approve',
  apiKeyMiddleware,
  requireScope('admin'),
  async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.apiKey) {
        throw new ValidationError('API key required');
      }

      const redemptionId = req.params.id;
      const approvedBy = req.apiKey.keyId || req.apiKey.orgId;

      // Check current status and auto-advance if needed
      let redemption = await redemptionService.getRedemption(redemptionId, req.apiKey.orgId);

      if (redemption.status === 'requested') {
        redemption = await redemptionService.validateRedemption(redemptionId);
      }

      if (redemption.status === 'validated') {
        redemption = await redemptionService.priceRedemption(redemptionId);
      }

      if (redemption.status !== 'priced') {
        throw new ValidationError(
          `Redemption cannot be approved from status: ${redemption.status}`
        );
      }

      const approved = await redemptionService.approveRedemption(redemptionId, approvedBy);

      res.json({
        success: true,
        data: approved,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PATCH /api/v1/redemptions/:id/reject
 *
 * Reject a redemption request. Requires a reason in the body.
 */
redemptionRouter.patch(
  '/redemptions/:id/reject',
  apiKeyMiddleware,
  requireScope('admin'),
  async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.apiKey) {
        throw new ValidationError('API key required');
      }

      const body = rejectRedemptionSchema.parse(req.body);
      const rejectedBy = req.apiKey.keyId || req.apiKey.orgId;

      const rejected = await redemptionService.rejectRedemption(
        req.params.id,
        rejectedBy,
        body.reason
      );

      res.json({
        success: true,
        data: rejected,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        next(new ValidationError(error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')));
      } else {
        next(error);
      }
    }
  }
);

/**
 * POST /api/v1/redemptions/:id/execute
 *
 * Execute an approved redemption: burn tokens on-chain and initiate disbursement.
 * The redemption must be in 'approved' status.
 */
redemptionRouter.post(
  '/redemptions/:id/execute',
  apiKeyMiddleware,
  requireScope('admin'),
  async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.apiKey) {
        throw new ValidationError('API key required');
      }

      // Verify the redemption belongs to this org
      await redemptionService.getRedemption(req.params.id, req.apiKey.orgId);

      const result = await redemptionService.executeRedemption(req.params.id);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
);
