/**
 * Exit Window Routes
 *
 * apiKeyMiddleware is applied at mount point in index.ts — not duplicated here.
 */

import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as exitWindowService from '../services/exit-window.service.js';
import { ValidationError } from '../middleware/errorHandler.js';
import { requireScope } from '../middleware/scopeGuard.js';
import type { ApiKeyRequest } from '../middleware/auth.js';

export const exitWindowRouter = Router();

exitWindowRouter.get('/assets/:assetId/exit-windows', requireScope('read'), async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try { res.json({ data: await exitWindowService.getWindows(req.params.assetId) }); } catch (error) { next(error); }
});

exitWindowRouter.get('/assets/:assetId/exit-windows/current', requireScope('read'), async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try { res.json({ data: await exitWindowService.getCurrentWindow(req.params.assetId) }); } catch (error) { next(error); }
});

exitWindowRouter.get('/assets/:assetId/exit-windows/next', requireScope('read'), async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try { res.json({ data: await exitWindowService.getNextWindow(req.params.assetId) }); } catch (error) { next(error); }
});

exitWindowRouter.put('/assets/:assetId/exit-schedule', requireScope('admin'), async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const input = z.object({
      frequency: z.enum(['monthly', 'quarterly', 'semi-annually', 'annually']),
      windowDurationDays: z.number().int().min(1).max(90),
      maxRedemptionPercent: z.number().min(0).max(100),
      noticePeriodDays: z.number().int().min(0),
    }).parse(req.body);
    const schedule = await exitWindowService.createSchedule(req.params.assetId, input);
    res.json({ data: schedule });
  } catch (error) {
    if (error instanceof z.ZodError) next(new ValidationError(error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')));
    else next(error);
  }
});

exitWindowRouter.post('/assets/:assetId/exit-windows/redeem', requireScope('write'), async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const { investorId, amount } = z.object({ investorId: z.string().min(1), amount: z.number().positive() }).parse(req.body);
    const request = await exitWindowService.requestRedemptionInWindow(req.params.assetId, investorId, amount);
    res.status(201).json({ data: request });
  } catch (error) {
    if (error instanceof z.ZodError) next(new ValidationError(error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')));
    else next(error);
  }
});
