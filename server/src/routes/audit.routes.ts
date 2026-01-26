import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as auditService from '../services/audit.service.js';
import { ValidationError } from '../middleware/errorHandler.js';
import { apiKeyMiddleware, type ApiKeyRequest } from '../middleware/auth.js';

export const auditRouter = Router();

// ============================================================================
// Validation Schemas
// ============================================================================

const queryParamsSchema = z.object({
  actorId: z.string().uuid().optional(),
  actorType: z.enum(['user', 'api_key', 'system', 'webhook']).optional(),
  action: z.string().optional(),
  resourceType: z.string().optional(),
  resourceId: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  limit: z.string().transform(v => parseInt(v)).optional(),
  offset: z.string().transform(v => parseInt(v)).optional(),
});

// ============================================================================
// Audit Log Routes
// ============================================================================

// Get audit log entries
auditRouter.get('/', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const {
      actorId,
      actorType,
      action,
      resourceType,
      resourceId,
      startDate,
      endDate,
      limit,
      offset,
    } = req.query;

    const entries = await auditService.getAuditLog(req.apiKey.orgId, {
      actorId: actorId as string | undefined,
      actorType: actorType as string | undefined,
      action: action as string | undefined,
      resourceType: resourceType as string | undefined,
      resourceId: resourceId as string | undefined,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    });

    res.json({ data: entries, count: entries.length });
  } catch (error) {
    next(error);
  }
});

// Get specific audit log entry
auditRouter.get('/:id', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const entry = await auditService.getAuditLogEntry(req.params.id, req.apiKey.orgId);
    res.json(entry);
  } catch (error) {
    next(error);
  }
});

// Verify a specific entry's integrity
auditRouter.get('/:id/verify', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const result = await auditService.verifyEntry(req.params.id, req.apiKey.orgId);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Verify entire audit chain integrity
auditRouter.post('/verify-chain', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const { batchSize, startFrom } = req.body;

    const result = await auditService.verifyChain(req.apiKey.orgId, {
      batchSize: batchSize ? parseInt(batchSize) : undefined,
      startFrom: startFrom ? new Date(startFrom) : undefined,
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Get audit statistics
auditRouter.get('/stats/summary', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const { startDate, endDate } = req.query;

    const stats = await auditService.getAuditStats(req.apiKey.orgId, {
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
    });

    res.json(stats);
  } catch (error) {
    next(error);
  }
});

// Export audit log
auditRouter.post('/export', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const { startDate, endDate, format } = req.body;

    const result = await auditService.exportAuditLog(req.apiKey.orgId, {
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      format: format || 'json',
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
});
