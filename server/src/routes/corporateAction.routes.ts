import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as corporateActionService from '../services/corporateAction.service.js';
import { ValidationError } from '../middleware/errorHandler.js';
import { apiKeyMiddleware, type ApiKeyRequest } from '../middleware/auth.js';

export const corporateActionRouter = Router();

const createSplitSchema = z.object({
  tokenId: z.string().uuid(),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  ratio: z.string().regex(/^\d+:\d+$/),
  recordDate: z.string().datetime(),
  effectiveDate: z.string().datetime(),
  metadata: z.record(z.unknown()).optional(),
});

const createConversionSchema = z.object({
  tokenId: z.string().uuid(),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  newTokenId: z.string().uuid(),
  conversionRate: z.string(),
  recordDate: z.string().datetime(),
  effectiveDate: z.string().datetime(),
  metadata: z.record(z.unknown()).optional(),
});

corporateActionRouter.post('/split', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) throw new ValidationError('API key required');
    const input = createSplitSchema.parse(req.body);
    const action = await corporateActionService.createSplit({
      ...input,
      orgId: req.apiKey.orgId,
      recordDate: new Date(input.recordDate),
      effectiveDate: new Date(input.effectiveDate),
    });
    res.status(201).json(action);
  } catch (error) {
    next(error);
  }
});

corporateActionRouter.post('/reverse-split', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) throw new ValidationError('API key required');
    const input = createSplitSchema.parse(req.body);
    const action = await corporateActionService.createReverseSplit({
      ...input,
      orgId: req.apiKey.orgId,
      recordDate: new Date(input.recordDate),
      effectiveDate: new Date(input.effectiveDate),
    });
    res.status(201).json(action);
  } catch (error) {
    next(error);
  }
});

corporateActionRouter.post('/conversion', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) throw new ValidationError('API key required');
    const input = createConversionSchema.parse(req.body);
    const action = await corporateActionService.createConversion({
      ...input,
      orgId: req.apiKey.orgId,
      recordDate: new Date(input.recordDate),
      effectiveDate: new Date(input.effectiveDate),
    });
    res.status(201).json(action);
  } catch (error) {
    next(error);
  }
});

corporateActionRouter.get('/', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) throw new ValidationError('API key required');
    const { tokenId, type, status, limit, offset } = req.query;
    const actions = await corporateActionService.listCorporateActions(req.apiKey.orgId, {
      tokenId: tokenId as string | undefined,
      type: type as corporateActionService.CorporateActionType | undefined,
      status: status as corporateActionService.CorporateActionStatus | undefined,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    });
    res.json({ data: actions, count: actions.length });
  } catch (error) { next(error); }
});

corporateActionRouter.get('/:id', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) throw new ValidationError('API key required');
    const action = await corporateActionService.getCorporateAction(req.params.id, req.apiKey.orgId);
    res.json(action);
  } catch (error) { next(error); }
});

corporateActionRouter.get('/:id/entitlements', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) throw new ValidationError('API key required');
    const summary = await corporateActionService.calculateEntitlements(req.params.id, req.apiKey.orgId);
    res.json(summary);
  } catch (error) { next(error); }
});

corporateActionRouter.post('/:id/approve', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) throw new ValidationError('API key required');
    const action = await corporateActionService.approveCorporateAction(req.params.id, req.apiKey.orgId, req.apiKey.keyId || 'system');
    res.json(action);
  } catch (error) { next(error); }
});

corporateActionRouter.post('/:id/execute', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) throw new ValidationError('API key required');
    const action = await corporateActionService.executeCorporateAction(req.params.id, req.apiKey.orgId, req.apiKey.keyId || 'system');
    res.json(action);
  } catch (error) { next(error); }
});

corporateActionRouter.post('/:id/cancel', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) throw new ValidationError('API key required');
    const { reason } = req.body;
    if (!reason) throw new ValidationError('reason is required');
    const action = await corporateActionService.cancelCorporateAction(req.params.id, req.apiKey.orgId, reason);
    res.json(action);
  } catch (error) { next(error); }
});

corporateActionRouter.get('/:id/entitlements/list', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) throw new ValidationError('API key required');
    const { status, limit, offset } = req.query;
    const entitlements = await corporateActionService.listEntitlements(req.params.id, req.apiKey.orgId, {
      status: status as string | undefined,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    });
    res.json({ data: entitlements, count: entitlements.length });
  } catch (error) { next(error); }
});
