import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as distributionService from '../services/distribution.service.js';
import { ValidationError } from '../middleware/errorHandler.js';
import { apiKeyMiddleware, type ApiKeyRequest } from '../middleware/auth.js';

export const distributionRouter = Router();

const createDistributionSchema = z.object({
  tokenId: z.string().uuid(),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  type: z.enum(['dividend', 'interest', 'royalty', 'revenue_share', 'rent', 'profit_share', 'yield', 'custom']),
  totalAmount: z.string().regex(/^\d+$/),
  currency: z.string().min(1).max(10),
  recordDate: z.string().datetime(),
  paymentDate: z.string().datetime(),
  exDividendDate: z.string().datetime().optional(),
  allocationStrategy: z.enum(['pro_rata', 'equal', 'tiered', 'time_weighted', 'custom']).optional(),
  paymentMethod: z.enum(['on_chain', 'bank_transfer', 'mixed']),
  metadata: z.record(z.unknown()).optional(),
});

distributionRouter.post('/', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) throw new ValidationError('API key required');
    const input = createDistributionSchema.parse(req.body);
    const distribution = await distributionService.createDistribution({
      ...input,
      orgId: req.apiKey.orgId,
      recordDate: new Date(input.recordDate),
      paymentDate: new Date(input.paymentDate),
      exDividendDate: input.exDividendDate ? new Date(input.exDividendDate) : undefined,
    });
    res.status(201).json(distribution);
  } catch (error) {
    next(error);
  }
});

distributionRouter.get('/', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) throw new ValidationError('API key required');
    const { tokenId, status, type, limit, offset } = req.query;
    const distributions = await distributionService.listDistributions(req.apiKey.orgId, {
      tokenId: tokenId as string | undefined,
      status: status as distributionService.DistributionStatus | undefined,
      type: type as distributionService.DistributionType | undefined,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    });
    res.json({ data: distributions, count: distributions.length });
  } catch (error) { next(error); }
});

distributionRouter.get('/:id', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) throw new ValidationError('API key required');
    const distribution = await distributionService.getDistribution(req.params.id, req.apiKey.orgId);
    res.json(distribution);
  } catch (error) { next(error); }
});

distributionRouter.get('/:id/calculate', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) throw new ValidationError('API key required');
    const summary = await distributionService.calculatePayments(req.params.id, req.apiKey.orgId);
    res.json(summary);
  } catch (error) { next(error); }
});

distributionRouter.post('/:id/approve', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) throw new ValidationError('API key required');
    const distribution = await distributionService.approveDistribution(req.params.id, req.apiKey.orgId, req.apiKey.keyId || 'system');
    res.json(distribution);
  } catch (error) { next(error); }
});

distributionRouter.post('/:id/execute', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) throw new ValidationError('API key required');
    const distribution = await distributionService.executeDistribution(req.params.id, req.apiKey.orgId);
    res.json(distribution);
  } catch (error) { next(error); }
});

distributionRouter.post('/:id/cancel', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) throw new ValidationError('API key required');
    const { reason } = req.body;
    if (!reason) throw new ValidationError('reason is required');
    const distribution = await distributionService.cancelDistribution(req.params.id, req.apiKey.orgId, reason);
    res.json(distribution);
  } catch (error) { next(error); }
});

distributionRouter.get('/:id/payments', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) throw new ValidationError('API key required');
    const { status, limit, offset } = req.query;
    const payments = await distributionService.listPayments(req.params.id, req.apiKey.orgId, {
      status: status as string | undefined,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    });
    res.json({ data: payments, count: payments.length });
  } catch (error) { next(error); }
});

distributionRouter.post('/payments/:paymentId/confirm', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) throw new ValidationError('API key required');
    const { txHash, bankReference } = req.body;
    if (!txHash && !bankReference) throw new ValidationError('txHash or bankReference is required');
    const payment = await distributionService.confirmPayment(req.params.paymentId, req.apiKey.orgId, { txHash, bankReference });
    res.json(payment);
  } catch (error) { next(error); }
});
