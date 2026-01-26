import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as indexerService from '../services/indexer.service.js';
import { ValidationError } from '../middleware/errorHandler.js';
import { apiKeyMiddleware, type ApiKeyRequest } from '../middleware/auth.js';

export const indexerRouter = Router();

// ============================================================================
// Validation Schemas
// ============================================================================

const startIndexerSchema = z.object({
  chainId: z.number().int().positive(),
  startBlock: z.number().int().nonnegative().optional(),
  pollingInterval: z.number().int().min(1000).optional(),
  confirmations: z.number().int().min(0).optional(),
  batchSize: z.number().int().min(1).max(100000).optional(),
});

const indexBlocksSchema = z.object({
  chainId: z.number().int().positive(),
  fromBlock: z.number().int().nonnegative(),
  toBlock: z.number().int().nonnegative(),
});

const reindexTokenSchema = z.object({
  fromBlock: z.number().int().nonnegative().optional(),
});

// ============================================================================
// Indexer Status Routes
// ============================================================================

// Get all indexer statuses
indexerRouter.get('/status', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const statuses = indexerService.getAllIndexerStatuses();
    res.json({ data: statuses });
  } catch (error) {
    next(error);
  }
});

// Get indexer status for a specific chain
indexerRouter.get('/status/:chainId', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const chainId = parseInt(req.params.chainId);
    const status = indexerService.getIndexerStatus(chainId);

    res.json(status);
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Indexer Control Routes
// ============================================================================

// Start indexer for a chain
indexerRouter.post('/start', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const config = startIndexerSchema.parse(req.body);

    await indexerService.startIndexer({
      chainId: config.chainId,
      startBlock: config.startBlock || 0,
      pollingInterval: config.pollingInterval || 12000, // 12 seconds default
      confirmations: config.confirmations || 3,
      batchSize: config.batchSize || 1000,
    });

    res.json({
      success: true,
      message: `Indexer started for chain ${config.chainId}`,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new ValidationError(error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')));
    } else {
      next(error);
    }
  }
});

// Stop indexer for a chain
indexerRouter.post('/stop/:chainId', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const chainId = parseInt(req.params.chainId);
    indexerService.stopIndexer(chainId);

    res.json({
      success: true,
      message: `Indexer stopped for chain ${chainId}`,
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Manual Indexing Routes
// ============================================================================

// Index specific block range
indexerRouter.post('/index', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const { chainId, fromBlock, toBlock } = indexBlocksSchema.parse(req.body);

    if (fromBlock > toBlock) {
      throw new ValidationError('fromBlock must be <= toBlock');
    }

    const result = await indexerService.indexBlocks(chainId, fromBlock, toBlock);

    res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new ValidationError(error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')));
    } else {
      next(error);
    }
  }
});

// Reindex a specific token
indexerRouter.post('/reindex/:tokenId', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const { fromBlock } = reindexTokenSchema.parse(req.body);

    const result = await indexerService.reindexToken(
      req.params.tokenId,
      req.apiKey.orgId,
      fromBlock
    );

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
// Reconciliation Routes
// ============================================================================

// Reconcile a specific token
indexerRouter.post('/reconcile/:tokenId', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const result = await indexerService.reconcileToken(
      req.params.tokenId,
      req.apiKey.orgId
    );

    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Reconcile all tokens for org
indexerRouter.post('/reconcile', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const result = await indexerService.reconcileAllTokens(req.apiKey.orgId);

    res.json(result);
  } catch (error) {
    next(error);
  }
});
