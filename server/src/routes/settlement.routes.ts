import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as settlementService from '../services/settlement.service.js';
import { ValidationError } from '../middleware/errorHandler.js';
import { apiKeyMiddleware, type ApiKeyRequest } from '../middleware/auth.js';

export const settlementRouter = Router();

// ============================================================================
// Validation Schemas
// ============================================================================

const createSettlementSchema = z.object({
  txHash: z.string().length(66).regex(/^0x[a-fA-F0-9]{64}$/),
  chainId: z.number().int().positive(),
  transferId: z.string().uuid().optional(),
  issuanceId: z.string().uuid().optional(),
  redemptionId: z.string().uuid().optional(),
  confirmedBlock: z.number().int().positive().optional(),
  requiredConfirmations: z.number().int().positive().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const updateConfirmationsSchema = z.object({
  currentBlock: z.number().int().positive(),
});

const markReorgedSchema = z.object({
  reason: z.string().min(1).max(500),
});

const chainUpdateSchema = z.object({
  chainId: z.number().int().positive(),
  currentBlock: z.number().int().positive(),
});

// ============================================================================
// Settlement CRUD Routes
// ============================================================================

// Create a new settlement
settlementRouter.post('/', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const input = createSettlementSchema.parse(req.body);
    const settlement = await settlementService.createSettlement({
      ...input,
      orgId: req.apiKey.orgId,
    });

    res.status(201).json(settlement);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new ValidationError(error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')));
    } else {
      next(error);
    }
  }
});

// List settlements
settlementRouter.get('/', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const { finalityStatus, chainId, fromDate, toDate, limit, offset } = req.query;

    const settlements = await settlementService.listSettlements(req.apiKey.orgId, {
      finalityStatus: finalityStatus as settlementService.FinalityStatus | undefined,
      chainId: chainId ? parseInt(chainId as string) : undefined,
      fromDate: fromDate ? new Date(fromDate as string) : undefined,
      toDate: toDate ? new Date(toDate as string) : undefined,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    });

    res.json({ data: settlements, count: settlements.length });
  } catch (error) {
    next(error);
  }
});

// Get settlement by ID
settlementRouter.get('/:id', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const settlement = await settlementService.getSettlement(req.params.id, req.apiKey.orgId);
    res.json(settlement);
  } catch (error) {
    next(error);
  }
});

// Get settlement by transaction hash
settlementRouter.get('/tx/:txHash', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const { chainId } = req.query;
    if (!chainId) {
      throw new ValidationError('chainId query parameter is required');
    }

    const settlement = await settlementService.getSettlementByTxHash(
      req.params.txHash,
      parseInt(chainId as string)
    );

    if (!settlement) {
      return res.status(404).json({ error: 'Settlement not found' });
    }

    res.json(settlement);
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Finality Tracking Routes
// ============================================================================

// Update confirmations for a settlement
settlementRouter.post('/:id/confirmations', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const { currentBlock } = updateConfirmationsSchema.parse(req.body);
    const settlement = await settlementService.updateConfirmations(req.params.id, currentBlock);

    res.json(settlement);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new ValidationError(error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')));
    } else {
      next(error);
    }
  }
});

// Mark settlement as reorged
settlementRouter.post('/:id/reorg', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const { reason } = markReorgedSchema.parse(req.body);
    const settlement = await settlementService.markAsReorged(req.params.id, reason);

    res.json(settlement);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new ValidationError(error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')));
    } else {
      next(error);
    }
  }
});

// Batch update confirmations for all pending settlements on a chain
settlementRouter.post('/chain/update', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const { chainId, currentBlock } = chainUpdateSchema.parse(req.body);
    const result = await settlementService.updateChainConfirmations(chainId, currentBlock);

    res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new ValidationError(error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')));
    } else {
      next(error);
    }
  }
});

// ============================================================================
// Statistics Routes
// ============================================================================

// Get settlement statistics
settlementRouter.get('/stats/overview', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const stats = await settlementService.getSettlementStats(req.apiKey.orgId);
    res.json(stats);
  } catch (error) {
    next(error);
  }
});

// Get average finality time
settlementRouter.get('/stats/finality-time', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const { chainId } = req.query;
    const stats = await settlementService.getAverageFinalityTime(
      req.apiKey.orgId,
      chainId ? parseInt(chainId as string) : undefined
    );

    res.json(stats);
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Chain Configuration Routes
// ============================================================================

// Get chain finality configurations
settlementRouter.get('/chains/config', async (_req, res) => {
  res.json({ chains: settlementService.CHAIN_FINALITY_CONFIG });
});

// ============================================================================
// Maintenance Routes
// ============================================================================

// Purge old finalized settlements
settlementRouter.post('/purge', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const { olderThanDays } = req.body;
    if (!olderThanDays || typeof olderThanDays !== 'number' || olderThanDays < 1) {
      throw new ValidationError('olderThanDays must be a positive number');
    }

    const olderThan = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
    const result = await settlementService.purgeOldSettlements(req.apiKey.orgId, olderThan);

    res.json(result);
  } catch (error) {
    next(error);
  }
});
