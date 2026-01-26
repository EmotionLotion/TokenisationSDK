import { Router, Response, NextFunction } from 'express';
import * as idempotencyService from '../services/idempotency.service.js';
import { ValidationError } from '../middleware/errorHandler.js';
import { apiKeyMiddleware, type ApiKeyRequest } from '../middleware/auth.js';

export const idempotencyRouter = Router();

// ============================================================================
// Statistics Routes
// ============================================================================

// Get idempotency key statistics
idempotencyRouter.get('/stats', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const stats = await idempotencyService.getIdempotencyStats(req.apiKey.orgId);
    res.json(stats);
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Cleanup Routes
// ============================================================================

// Cleanup expired keys
idempotencyRouter.post('/cleanup', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const result = await idempotencyService.cleanupExpiredKeys();
    res.json(result);
  } catch (error) {
    next(error);
  }
});
