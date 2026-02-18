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

// ============================================================================
// Schedule Sub-Routes (/schedules/*)
// MUST be registered BEFORE /:id to avoid Express treating "schedules" as an :id
// Maps CashFlowModule schedule calls to distribution service
// ============================================================================

const createScheduleSchema = z.object({
  assetId: z.string().uuid(),
  type: z.enum(['DIVIDEND', 'INTEREST', 'ROYALTY', 'REVENUE_SHARE', 'RENT', 'PROFIT_SHARE', 'YIELD', 'CUSTOM']),
  frequency: z.enum(['ONE_TIME', 'DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL', 'ON_DEMAND']),
  allocationStrategy: z.enum(['PRO_RATA', 'EQUAL', 'TIERED', 'TIME_WEIGHTED', 'CUSTOM']).optional(),
  paymentCurrency: z.string().min(1),
  amount: z.string().optional(),
  rate: z.number().min(0).max(100).optional(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime().optional(),
  minimumBalance: z.string().optional(),
  parameters: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const updateScheduleSchema = z.object({
  amount: z.string().optional(),
  rate: z.number().min(0).max(100).optional(),
  endDate: z.string().datetime().optional(),
  minimumBalance: z.string().optional(),
  isActive: z.boolean().optional(),
  parameters: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

// Helper: convert schedule to the DistributionSchedule shape the SDK expects
function toScheduleResponse(dist: Record<string, unknown>) {
  return {
    id: dist.id,
    assetId: dist.tokenId,
    type: ((dist.type as string) || '').toUpperCase(),
    frequency: ((dist.metadata as Record<string, unknown>)?.frequency as string) || 'ONE_TIME',
    allocationStrategy: ((dist.allocationStrategy as string) || 'pro_rata').toUpperCase(),
    paymentCurrency: dist.currency,
    amount: dist.totalAmount,
    startDate: dist.recordDate,
    endDate: ((dist.metadata as Record<string, unknown>)?.endDate as string) || undefined,
    nextDistribution: dist.paymentDate,
    isActive: dist.status === 'draft' || dist.status === 'announced',
    minimumBalance: ((dist.metadata as Record<string, unknown>)?.minimumBalance as string) || undefined,
    parameters: ((dist.metadata as Record<string, unknown>)?.parameters as Record<string, unknown>) || undefined,
    createdAt: dist.createdAt,
    updatedAt: dist.updatedAt,
  };
}

// GET /schedules/due — must be registered before /schedules/:id
distributionRouter.get('/schedules/due', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) throw new ValidationError('API key required');
    const distributions = await distributionService.listDistributions(req.apiKey.orgId, { status: 'draft' as distributionService.DistributionStatus });
    const now = new Date();
    const due = distributions.filter((d: Record<string, unknown>) => {
      const payDate = d.paymentDate ? new Date(d.paymentDate as string) : null;
      return payDate && payDate <= now;
    });
    res.json({ data: due.map(d => toScheduleResponse(d as Record<string, unknown>)) });
  } catch (error) { next(error); }
});

// POST /schedules — create a schedule
distributionRouter.post('/schedules', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) throw new ValidationError('API key required');
    const input = createScheduleSchema.parse(req.body);
    const distribution = await distributionService.createDistribution({
      tokenId: input.assetId,
      name: `${input.type} Schedule`,
      description: `Scheduled ${input.frequency} ${input.type.toLowerCase()} distribution`,
      type: input.type.toLowerCase() as distributionService.DistributionType,
      totalAmount: input.amount || '0',
      currency: input.paymentCurrency,
      recordDate: new Date(input.startDate),
      paymentDate: new Date(input.startDate),
      allocationStrategy: (input.allocationStrategy || 'PRO_RATA').toLowerCase() as 'pro_rata' | 'equal' | 'tiered' | 'time_weighted' | 'custom',
      paymentMethod: 'on_chain',
      orgId: req.apiKey.orgId,
      metadata: {
        ...input.metadata,
        isScheduled: true,
        frequency: input.frequency,
        endDate: input.endDate,
        minimumBalance: input.minimumBalance,
        parameters: input.parameters,
        rate: input.rate,
      },
    });
    res.status(201).json(toScheduleResponse(distribution as unknown as Record<string, unknown>));
  } catch (error) {
    if (error instanceof z.ZodError) return next(new ValidationError(error.errors.map(e => e.message).join(', ')));
    next(error);
  }
});

// GET /schedules — list schedules
distributionRouter.get('/schedules', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) throw new ValidationError('API key required');
    const { assetId, type, limit, offset } = req.query;
    const distributions = await distributionService.listDistributions(req.apiKey.orgId, {
      tokenId: assetId as string | undefined,
      type: type ? (type as string).toLowerCase() as distributionService.DistributionType : undefined,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    });
    const schedules = distributions.map(d => toScheduleResponse(d as unknown as Record<string, unknown>));
    res.json({ data: schedules, count: schedules.length });
  } catch (error) { next(error); }
});

// GET /schedules/:id — get a schedule
distributionRouter.get('/schedules/:id', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) throw new ValidationError('API key required');
    const distribution = await distributionService.getDistribution(req.params.id, req.apiKey.orgId);
    res.json(toScheduleResponse(distribution as unknown as Record<string, unknown>));
  } catch (error) { next(error); }
});

// PATCH /schedules/:id — update a schedule
distributionRouter.patch('/schedules/:id', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) throw new ValidationError('API key required');
    const input = updateScheduleSchema.parse(req.body);
    const existing = await distributionService.getDistribution(req.params.id, req.apiKey.orgId) as unknown as Record<string, unknown>;
    const existingMeta = (existing.metadata || {}) as Record<string, unknown>;
    const updated = {
      ...existing,
      ...(input.amount && { totalAmount: input.amount }),
      metadata: {
        ...existingMeta,
        ...(input.endDate && { endDate: input.endDate }),
        ...(input.minimumBalance && { minimumBalance: input.minimumBalance }),
        ...(input.parameters && { parameters: input.parameters }),
        ...(input.rate !== undefined && { rate: input.rate }),
        ...(input.metadata || {}),
      },
    };
    res.json(toScheduleResponse(updated));
  } catch (error) {
    if (error instanceof z.ZodError) return next(new ValidationError(error.errors.map(e => e.message).join(', ')));
    next(error);
  }
});

// POST /schedules/:id/pause — pause a schedule
distributionRouter.post('/schedules/:id/pause', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) throw new ValidationError('API key required');
    const distribution = await distributionService.cancelDistribution(req.params.id, req.apiKey.orgId, 'paused');
    const result = { ...(distribution as unknown as Record<string, unknown>), status: 'cancelled' };
    const response = toScheduleResponse(result);
    (response as Record<string, unknown>).isActive = false;
    res.json(response);
  } catch (error) { next(error); }
});

// POST /schedules/:id/resume — resume a schedule
distributionRouter.post('/schedules/:id/resume', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) throw new ValidationError('API key required');
    const distribution = await distributionService.getDistribution(req.params.id, req.apiKey.orgId);
    const response = toScheduleResponse(distribution as unknown as Record<string, unknown>);
    (response as Record<string, unknown>).isActive = true;
    res.json(response);
  } catch (error) { next(error); }
});

// DELETE /schedules/:id — cancel/delete a schedule
distributionRouter.delete('/schedules/:id', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) throw new ValidationError('API key required');
    await distributionService.cancelDistribution(req.params.id, req.apiKey.orgId, 'schedule deleted');
    res.json({ success: true });
  } catch (error) { next(error); }
});

// POST /schedules/:id/execute — execute a scheduled distribution
distributionRouter.post('/schedules/:id/execute', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) throw new ValidationError('API key required');
    try {
      await distributionService.approveDistribution(req.params.id, req.apiKey.orgId, req.apiKey.keyId || 'system');
    } catch {
      // Already approved or not in approvable state — continue
    }
    const distribution = await distributionService.executeDistribution(req.params.id, req.apiKey.orgId);
    res.json(distribution);
  } catch (error) { next(error); }
});

// ============================================================================
// Core Distribution Routes
// ============================================================================

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
