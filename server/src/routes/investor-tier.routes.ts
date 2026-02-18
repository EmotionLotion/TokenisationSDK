/**
 * Investor Tier Routes
 *
 * REST endpoints for investor tier management and eligibility checking.
 * apiKeyMiddleware is applied at mount point in index.ts — not duplicated here.
 */

import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as tierService from '../services/investor-tier.service.js';
import { ValidationError } from '../middleware/errorHandler.js';
import { requireScope } from '../middleware/scopeGuard.js';
import type { ApiKeyRequest } from '../middleware/auth.js';

export const investorTierRouter = Router();

// GET /assets/:assetId/plans
investorTierRouter.get(
  '/assets/:assetId/plans',
  requireScope('read'),
  async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    try {
      const plans = await tierService.getPlans(req.params.assetId);
      res.json({ data: plans });
    } catch (error) {
      next(error);
    }
  },
);

// POST /assets/:assetId/plans
investorTierRouter.post(
  '/assets/:assetId/plans',
  requireScope('admin'),
  async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    try {
      const schema = z.object({
        tier: z.enum(['retail', 'qualified', 'professional', 'institutional']),
        name: z.string().min(1),
        minInvestment: z.number().min(0),
        maxInvestment: z.number().min(0),
        maxHoldingPercent: z.number().min(0).max(100),
        managementFeePercent: z.number().min(0),
        performanceFeePercent: z.number().min(0),
        lockupDays: z.number().min(0),
        accreditationRequired: z.boolean(),
        accreditationTypes: z.array(z.string()).optional(),
        currency: z.string().default('AED'),
        active: z.boolean().default(true),
      });
      const input = schema.parse(req.body);
      const plan = await tierService.createPlan(req.params.assetId, input);
      res.status(201).json({ data: plan });
    } catch (error) {
      if (error instanceof z.ZodError) {
        next(new ValidationError(error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')));
      } else {
        next(error);
      }
    }
  },
);

// POST /assets/:assetId/check-eligibility
investorTierRouter.post(
  '/assets/:assetId/check-eligibility',
  requireScope('read'),
  async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    try {
      const schema = z.object({
        investorId: z.string().min(1),
        amount: z.number().positive(),
      });
      const { investorId, amount } = schema.parse(req.body);
      const result = await tierService.checkTierEligibility(req.params.assetId, investorId, amount);
      res.json({ data: result });
    } catch (error) {
      if (error instanceof z.ZodError) {
        next(new ValidationError(error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')));
      } else {
        next(error);
      }
    }
  },
);

// GET /investors/:investorId/tier
investorTierRouter.get(
  '/investors/:investorId/tier',
  requireScope('read'),
  async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    try {
      const tierInfo = await tierService.getInvestorTierInfo(req.params.investorId);
      res.json({ data: tierInfo });
    } catch (error) {
      next(error);
    }
  },
);
