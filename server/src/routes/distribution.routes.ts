import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as distributionService from '../services/distribution.service.js';
import { ValidationError } from '../middleware/errorHandler.js';
import { apiKeyMiddleware, type ApiKeyRequest } from '../middleware/auth.js';

export const distributionRouter = Router();

// ============================================================================
// Validation Schemas
// ============================================================================

const distributionTypeEnum = z.enum([
  'DIVIDEND',
  'INTEREST',
  'ROYALTY',
  'REVENUE_SHARE',
  'RENT',
  'PROFIT_SHARE',
  'YIELD',
  'CUSTOM',
]);

const frequencyEnum = z.enum([
  'ONE_TIME',
  'DAILY',
  'WEEKLY',
  'BIWEEKLY',
  'MONTHLY',
  'QUARTERLY',
  'SEMI_ANNUAL',
  'ANNUAL',
  'ON_DEMAND',
]);

const allocationStrategyEnum = z.enum([
  'PRO_RATA',
  'EQUAL',
  'TIERED',
  'TIME_WEIGHTED',
  'CUSTOM',
]);

const statusEnum = z.enum([
  'SCHEDULED',
  'PROCESSING',
  'COMPLETED',
  'PARTIALLY_COMPLETED',
  'FAILED',
  'CANCELLED',
]);

const createScheduleSchema = z.object({
  tokenId: z.string().uuid(),
  type: distributionTypeEnum,
  frequency: frequencyEnum,
  allocationStrategy: allocationStrategyEnum.optional(),
  paymentCurrency: z.string().min(1).max(10),
  amount: z.string().regex(/^\d+$/, 'Must be a positive integer string').optional(),
  rate: z.number().min(0).max(100).optional(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime().optional(),
  minimumBalance: z.string().regex(/^\d+$/).optional(),
  parameters: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const updateScheduleSchema = z.object({
  type: distributionTypeEnum.optional(),
  frequency: frequencyEnum.optional(),
  allocationStrategy: allocationStrategyEnum.optional(),
  paymentCurrency: z.string().min(1).max(10).optional(),
  amount: z.string().regex(/^\d+$/).optional(),
  rate: z.number().min(0).max(100).optional(),
  endDate: z.string().datetime().optional(),
  minimumBalance: z.string().regex(/^\d+$/).optional(),
  parameters: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const executeDistributionSchema = z.object({
  amount: z.string().regex(/^\d+$/).optional(),
  snapshotAt: z.string().datetime().optional(),
  metadata: z.record(z.unknown()).optional(),
});

// ============================================================================
// Schedule Routes
// ============================================================================

/**
 * @openapi
 * /distributions/schedules:
 *   post:
 *     tags: [Distributions]
 *     summary: Create a distribution schedule
 *     description: Create a new recurring or one-time distribution schedule for a token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [tokenId, type, frequency, paymentCurrency, startDate]
 *             properties:
 *               tokenId:
 *                 type: string
 *                 format: uuid
 *               type:
 *                 type: string
 *                 enum: [DIVIDEND, INTEREST, ROYALTY, REVENUE_SHARE, RENT, PROFIT_SHARE, YIELD, CUSTOM]
 *               frequency:
 *                 type: string
 *                 enum: [ONE_TIME, DAILY, WEEKLY, BIWEEKLY, MONTHLY, QUARTERLY, SEMI_ANNUAL, ANNUAL, ON_DEMAND]
 *               allocationStrategy:
 *                 type: string
 *                 enum: [PRO_RATA, EQUAL, TIERED, TIME_WEIGHTED, CUSTOM]
 *               paymentCurrency:
 *                 type: string
 *               amount:
 *                 type: string
 *               rate:
 *                 type: number
 *               startDate:
 *                 type: string
 *                 format: date-time
 *               endDate:
 *                 type: string
 *                 format: date-time
 *               minimumBalance:
 *                 type: string
 *     responses:
 *       201:
 *         description: Schedule created successfully
 *   get:
 *     tags: [Distributions]
 *     summary: List distribution schedules
 *     parameters:
 *       - name: tokenId
 *         in: query
 *         schema:
 *           type: string
 *           format: uuid
 *       - name: type
 *         in: query
 *         schema:
 *           type: string
 *       - name: isActive
 *         in: query
 *         schema:
 *           type: boolean
 *       - name: limit
 *         in: query
 *         schema:
 *           type: integer
 *       - name: offset
 *         in: query
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: List of schedules
 */

// Create schedule
distributionRouter.post('/schedules', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const input = createScheduleSchema.parse(req.body);
    const schedule = await distributionService.createSchedule({
      ...input,
      orgId: req.apiKey.orgId,
    });

    res.status(201).json(schedule);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new ValidationError(error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')));
    } else {
      next(error);
    }
  }
});

// List schedules
distributionRouter.get('/schedules', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const { tokenId, type, isActive, limit, offset } = req.query;

    const schedules = await distributionService.listSchedules(req.apiKey.orgId, {
      tokenId: tokenId as string | undefined,
      type: type as distributionService.DistributionType | undefined,
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    });

    res.json({ data: schedules, count: schedules.length });
  } catch (error) {
    next(error);
  }
});

// Get due schedules (ready to execute)
distributionRouter.get('/schedules/due', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const schedules = await distributionService.getDueSchedules(req.apiKey.orgId);
    res.json({ data: schedules, count: schedules.length });
  } catch (error) {
    next(error);
  }
});

// Get schedule by ID
distributionRouter.get('/schedules/:id', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const schedule = await distributionService.getSchedule(req.params.id, req.apiKey.orgId);
    res.json(schedule);
  } catch (error) {
    next(error);
  }
});

// Update schedule
distributionRouter.patch('/schedules/:id', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const input = updateScheduleSchema.parse(req.body);
    const schedule = await distributionService.updateSchedule(req.params.id, req.apiKey.orgId, input);

    res.json(schedule);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new ValidationError(error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')));
    } else {
      next(error);
    }
  }
});

// Pause schedule
distributionRouter.post('/schedules/:id/pause', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const schedule = await distributionService.pauseSchedule(req.params.id, req.apiKey.orgId);
    res.json(schedule);
  } catch (error) {
    next(error);
  }
});

// Resume schedule
distributionRouter.post('/schedules/:id/resume', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const schedule = await distributionService.resumeSchedule(req.params.id, req.apiKey.orgId);
    res.json(schedule);
  } catch (error) {
    next(error);
  }
});

// Delete schedule
distributionRouter.delete('/schedules/:id', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const result = await distributionService.deleteSchedule(req.params.id, req.apiKey.orgId);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Execute distribution for a schedule
distributionRouter.post('/schedules/:id/execute', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const input = executeDistributionSchema.parse(req.body);
    const distribution = await distributionService.executeDistribution(
      req.params.id,
      req.apiKey.orgId,
      input
    );

    res.status(201).json(distribution);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new ValidationError(error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')));
    } else {
      next(error);
    }
  }
});

// ============================================================================
// Distribution Event Routes
// ============================================================================

/**
 * @openapi
 * /distributions:
 *   get:
 *     tags: [Distributions]
 *     summary: List distribution events
 *     parameters:
 *       - name: tokenId
 *         in: query
 *         schema:
 *           type: string
 *           format: uuid
 *       - name: scheduleId
 *         in: query
 *         schema:
 *           type: string
 *           format: uuid
 *       - name: status
 *         in: query
 *         schema:
 *           type: string
 *       - name: type
 *         in: query
 *         schema:
 *           type: string
 *       - name: startDate
 *         in: query
 *         schema:
 *           type: string
 *           format: date-time
 *       - name: endDate
 *         in: query
 *         schema:
 *           type: string
 *           format: date-time
 *     responses:
 *       200:
 *         description: List of distribution events
 */

// List distributions
distributionRouter.get('/', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const { tokenId, scheduleId, status, type, startDate, endDate, limit, offset } = req.query;

    const distributions = await distributionService.listDistributions(req.apiKey.orgId, {
      tokenId: tokenId as string | undefined,
      scheduleId: scheduleId as string | undefined,
      status: status as distributionService.DistributionStatus | undefined,
      type: type as distributionService.DistributionType | undefined,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    });

    res.json({ data: distributions, count: distributions.length });
  } catch (error) {
    next(error);
  }
});

// Get distribution by ID
distributionRouter.get('/:id', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const distribution = await distributionService.getDistribution(req.params.id, req.apiKey.orgId);
    res.json(distribution);
  } catch (error) {
    next(error);
  }
});

// Complete distribution
distributionRouter.post('/:id/complete', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const { txHash } = req.body;
    const distribution = await distributionService.completeDistribution(
      req.params.id,
      req.apiKey.orgId,
      txHash
    );

    res.json(distribution);
  } catch (error) {
    next(error);
  }
});

// Fail distribution
distributionRouter.post('/:id/fail', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const { error } = req.body;
    if (!error) {
      throw new ValidationError('Error message is required');
    }

    const distribution = await distributionService.failDistribution(
      req.params.id,
      req.apiKey.orgId,
      error
    );

    res.json(distribution);
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Payout Routes
// ============================================================================

/**
 * @openapi
 * /distributions/{id}/payouts:
 *   get:
 *     tags: [Distributions]
 *     summary: Get payouts for a distribution
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: List of payouts
 */

// Get payouts for a distribution
distributionRouter.get('/:id/payouts', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const payouts = await distributionService.getPayouts(req.params.id, req.apiKey.orgId);
    res.json({ data: payouts, count: payouts.length });
  } catch (error) {
    next(error);
  }
});

// Claim a payout
distributionRouter.post('/:distributionId/payouts/:recipientId/claim', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const result = await distributionService.claimPayout(
      req.params.distributionId,
      req.params.recipientId,
      req.apiKey.orgId
    );

    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Get unclaimed payouts for a recipient
distributionRouter.get('/payouts/unclaimed/:recipientId', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const unclaimed = await distributionService.getUnclaimedPayouts(
      req.params.recipientId,
      req.apiKey.orgId
    );

    res.json({ data: unclaimed, count: unclaimed.length });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Analytics Routes
// ============================================================================

/**
 * @openapi
 * /distributions/analytics/summary/{tokenId}:
 *   get:
 *     tags: [Distributions]
 *     summary: Get distribution summary for a token
 *     parameters:
 *       - name: tokenId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Distribution summary
 */

// Get distribution summary for a token
distributionRouter.get('/analytics/summary/:tokenId', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const summary = await distributionService.getDistributionSummary(
      req.params.tokenId,
      req.apiKey.orgId
    );

    res.json(summary);
  } catch (error) {
    next(error);
  }
});

// Calculate yield for a token
distributionRouter.get('/analytics/yield/:tokenId', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const { periodDays } = req.query;
    const yieldData = await distributionService.calculateYield(
      req.params.tokenId,
      req.apiKey.orgId,
      periodDays ? parseInt(periodDays as string) : 365
    );

    res.json(yieldData);
  } catch (error) {
    next(error);
  }
});
