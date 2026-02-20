import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as vestingService from '../services/vesting.service.js';
import { ValidationError } from '../middleware/errorHandler.js';
import { apiKeyMiddleware, type ApiKeyRequest } from '../middleware/auth.js';
import { requireScope } from '../middleware/scopeGuard.js';

export const vestingRouter = Router();

const createScheduleSchema = z.object({
  tokenId: z.string().uuid(),
  investorId: z.string().uuid(),
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  totalAmount: z.string().regex(/^\d+$/),
  vestingType: z.enum(['linear', 'cliff', 'cliff_then_linear', 'milestone', 'graded']),
  grantDate: z.string().datetime(),
  startDate: z.string().datetime(),
  cliffDate: z.string().datetime().optional(),
  endDate: z.string().datetime(),
  cliffMonths: z.number().int().min(0).optional(),
  vestingMonths: z.number().int().min(1),
  cliffAmount: z.string().regex(/^\d+$/).optional(),
  gradedSchedule: z.array(z.object({ monthsFromGrant: z.number(), cumulativePercent: z.number() })).optional(),
  metadata: z.record(z.unknown()).optional(),
});

vestingRouter.post('/schedules', apiKeyMiddleware, requireScope('write'), async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) throw new ValidationError('API key required');
    const input = createScheduleSchema.parse(req.body);
    const schedule = await vestingService.createSchedule({
      ...input,
      orgId: req.apiKey.orgId,
      grantDate: new Date(input.grantDate),
      startDate: new Date(input.startDate),
      cliffDate: input.cliffDate ? new Date(input.cliffDate) : undefined,
      endDate: new Date(input.endDate),
    });
    res.status(201).json(schedule);
  } catch (error) {
    next(error);
  }
});

vestingRouter.get('/schedules', apiKeyMiddleware, requireScope('read'), async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) throw new ValidationError('API key required');
    const { tokenId, investorId, status, limit, offset } = req.query;
    const schedules = await vestingService.listSchedules(req.apiKey.orgId, {
      tokenId: tokenId as string | undefined,
      investorId: investorId as string | undefined,
      status: status as vestingService.VestingStatus | undefined,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    });
    res.json({ data: schedules, count: schedules.length });
  } catch (error) { next(error); }
});

vestingRouter.get('/schedules/:id', apiKeyMiddleware, requireScope('read'), async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) throw new ValidationError('API key required');
    const schedule = await vestingService.getSchedule(req.params.id, req.apiKey.orgId);
    res.json(schedule);
  } catch (error) { next(error); }
});

vestingRouter.get('/schedules/:id/calculate', apiKeyMiddleware, requireScope('read'), async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) throw new ValidationError('API key required');
    const asOfDate = req.query.asOfDate ? new Date(req.query.asOfDate as string) : undefined;
    const calculation = await vestingService.calculateVestedAmount(req.params.id, req.apiKey.orgId, asOfDate);
    res.json(calculation);
  } catch (error) { next(error); }
});

vestingRouter.post('/schedules/:id/release', apiKeyMiddleware, requireScope('write'), async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) throw new ValidationError('API key required');
    const release = await vestingService.releaseVestedTokens(req.params.id, req.apiKey.orgId);
    res.status(201).json(release);
  } catch (error) { next(error); }
});

vestingRouter.post('/schedules/:id/terminate', apiKeyMiddleware, requireScope('admin'), async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) throw new ValidationError('API key required');
    const { terminationType } = req.body;
    if (!terminationType) throw new ValidationError('terminationType is required');
    const schedule = await vestingService.terminateSchedule(req.params.id, req.apiKey.orgId, terminationType, req.apiKey.keyId || 'system');
    res.json(schedule);
  } catch (error) { next(error); }
});

vestingRouter.post('/schedules/:id/accelerate', apiKeyMiddleware, requireScope('admin'), async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) throw new ValidationError('API key required');
    const { accelerationPercent, reason } = req.body;
    if (accelerationPercent === undefined || !reason) throw new ValidationError('accelerationPercent and reason are required');
    const schedule = await vestingService.accelerateVesting(req.params.id, req.apiKey.orgId, accelerationPercent, reason, req.apiKey.keyId || 'system');
    res.json(schedule);
  } catch (error) { next(error); }
});

vestingRouter.get('/schedules/:id/releases', apiKeyMiddleware, requireScope('read'), async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) throw new ValidationError('API key required');
    const releases = await vestingService.listReleases(req.params.id, req.apiKey.orgId);
    res.json({ data: releases, count: releases.length });
  } catch (error) { next(error); }
});

vestingRouter.post('/schedules/:scheduleId/milestones', apiKeyMiddleware, requireScope('write'), async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) throw new ValidationError('API key required');
    const { name, description, vestingPercent, targetDate, metadata } = req.body;
    if (!name || vestingPercent === undefined) throw new ValidationError('name and vestingPercent are required');
    const milestone = await vestingService.createMilestone({
      orgId: req.apiKey.orgId,
      scheduleId: req.params.scheduleId,
      name, description, vestingPercent,
      targetDate: targetDate ? new Date(targetDate) : undefined,
      metadata,
    });
    res.status(201).json(milestone);
  } catch (error) { next(error); }
});

vestingRouter.get('/schedules/:scheduleId/milestones', apiKeyMiddleware, requireScope('read'), async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) throw new ValidationError('API key required');
    const milestones = await vestingService.listMilestones(req.params.scheduleId, req.apiKey.orgId);
    res.json({ data: milestones, count: milestones.length });
  } catch (error) { next(error); }
});

vestingRouter.post('/milestones/:id/complete', apiKeyMiddleware, requireScope('admin'), async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) throw new ValidationError('API key required');
    const milestone = await vestingService.completeMilestone(req.params.id, req.apiKey.orgId, req.apiKey.keyId || 'system');
    res.json(milestone);
  } catch (error) { next(error); }
});
