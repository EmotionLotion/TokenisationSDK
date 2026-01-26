import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as eventbusService from '../services/eventbus.service.js';
import { ValidationError } from '../middleware/errorHandler.js';
import { apiKeyMiddleware, type ApiKeyRequest } from '../middleware/auth.js';

export const eventbusRouter = Router();

// ============================================================================
// Validation Schemas
// ============================================================================

const publishEventSchema = z.object({
  topic: z.string().min(1).max(255),
  payload: z.record(z.unknown()),
  delayMs: z.number().int().nonnegative().optional(),
  deduplicationKey: z.string().max(255).optional(),
});

const publishBatchSchema = z.object({
  events: z.array(publishEventSchema).min(1).max(100),
});

const startProcessingSchema = z.object({
  batchSize: z.number().int().min(1).max(1000).optional(),
  pollingInterval: z.number().int().min(100).max(60000).optional(),
});

// ============================================================================
// Event Publishing Routes
// ============================================================================

// Publish single event
eventbusRouter.post('/publish', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const input = publishEventSchema.parse(req.body);
    const event = await eventbusService.publish({
      ...input,
      orgId: req.apiKey.orgId,
    });

    res.status(201).json(event);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new ValidationError(error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')));
    } else {
      next(error);
    }
  }
});

// Publish batch of events
eventbusRouter.post('/publish/batch', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const { events } = publishBatchSchema.parse(req.body);
    const results = await eventbusService.publishBatch(
      events.map(e => ({ ...e, orgId: req.apiKey!.orgId }))
    );

    res.status(201).json({ data: results, count: results.length });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new ValidationError(error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')));
    } else {
      next(error);
    }
  }
});

// ============================================================================
// Event Query Routes
// ============================================================================

// List events
eventbusRouter.get('/events', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const { topic, status, startDate, endDate, limit, offset } = req.query;

    const events = await eventbusService.listEvents(req.apiKey.orgId, {
      topic: topic as string | undefined,
      status: status as eventbusService.EventStatus | undefined,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    });

    res.json({ data: events, count: events.length });
  } catch (error) {
    next(error);
  }
});

// Get specific event
eventbusRouter.get('/events/:id', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const event = await eventbusService.getEvent(req.params.id, req.apiKey.orgId);
    res.json(event);
  } catch (error) {
    next(error);
  }
});

// Delete event
eventbusRouter.delete('/events/:id', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    await eventbusService.deleteEvent(req.params.id, req.apiKey.orgId);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Dead Letter Queue Routes
// ============================================================================

// Get DLQ events
eventbusRouter.get('/dlq', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const { limit } = req.query;
    const events = await eventbusService.getDeadLetterQueue(
      req.apiKey.orgId,
      limit ? parseInt(limit as string) : undefined
    );

    res.json({ data: events, count: events.length });
  } catch (error) {
    next(error);
  }
});

// Retry single event from DLQ
eventbusRouter.post('/events/:id/retry', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const event = await eventbusService.retryEvent(req.params.id, req.apiKey.orgId);
    res.json(event);
  } catch (error) {
    next(error);
  }
});

// Retry all DLQ events
eventbusRouter.post('/dlq/retry-all', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const result = await eventbusService.retryAllDlq(req.apiKey.orgId);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Processing Control Routes
// ============================================================================

// Start processing
eventbusRouter.post('/processing/start', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const config = startProcessingSchema.parse(req.body);

    // Start processing in background
    eventbusService.startProcessing(config).catch(err => {
      console.error('Event processing stopped with error:', err);
    });

    res.json({
      success: true,
      message: 'Event processing started',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new ValidationError(error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')));
    } else {
      next(error);
    }
  }
});

// Stop processing
eventbusRouter.post('/processing/stop', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    eventbusService.stopProcessing();

    res.json({
      success: true,
      message: 'Event processing stopped',
    });
  } catch (error) {
    next(error);
  }
});

// Get processing status
eventbusRouter.get('/processing/status', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    res.json({
      isProcessing: eventbusService.isProcessing(),
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Statistics Routes
// ============================================================================

// Get event statistics
eventbusRouter.get('/stats', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const stats = await eventbusService.getEventStats(req.apiKey.orgId);
    res.json(stats);
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Maintenance Routes
// ============================================================================

// Purge old processed events
eventbusRouter.post('/purge', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const { olderThanDays } = req.body;
    if (!olderThanDays || typeof olderThanDays !== 'number' || olderThanDays < 1) {
      throw new ValidationError('olderThanDays must be a positive number');
    }

    const olderThan = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
    const result = await eventbusService.purgeProcessedEvents(req.apiKey.orgId, olderThan);

    res.json(result);
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Topics Reference
// ============================================================================

// List available topics
eventbusRouter.get('/topics', async (_req, res) => {
  res.json({ topics: eventbusService.TOPICS });
});
