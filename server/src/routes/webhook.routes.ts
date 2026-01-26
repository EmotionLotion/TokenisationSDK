import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as webhookService from '../services/webhook.service.js';
import { ValidationError } from '../middleware/errorHandler.js';
import { apiKeyMiddleware, type ApiKeyRequest } from '../middleware/auth.js';

export const webhookRouter = Router();

// ============================================================================
// Validation Schemas
// ============================================================================

const createEndpointSchema = z.object({
  url: z.string().url(),
  description: z.string().optional(),
  events: z.array(z.string().regex(/^[a-z_]+(\.[a-z_*]+)*$/, 'Invalid event pattern')),
  metadata: z.record(z.unknown()).optional(),
});

const updateEndpointSchema = z.object({
  url: z.string().url().optional(),
  description: z.string().optional(),
  events: z.array(z.string().regex(/^[a-z_]+(\.[a-z_*]+)*$/)).optional(),
  status: z.enum(['active', 'disabled']).optional(),
  metadata: z.record(z.unknown()).optional(),
});

// ============================================================================
// Endpoint Routes
// ============================================================================

// Create webhook endpoint
webhookRouter.post('/endpoints', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const input = createEndpointSchema.parse(req.body);
    const endpoint = await webhookService.createEndpoint({
      ...input,
      orgId: req.apiKey.orgId,
    });

    res.status(201).json({
      ...endpoint,
      warning: 'Save the webhook secret securely. It will not be shown again.',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new ValidationError(error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')));
    } else {
      next(error);
    }
  }
});

// List endpoints
webhookRouter.get('/endpoints', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const { status, limit, offset } = req.query;

    const endpoints = await webhookService.listEndpoints(req.apiKey.orgId, {
      status: status as string | undefined,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    });

    res.json({ data: endpoints, count: endpoints.length });
  } catch (error) {
    next(error);
  }
});

// Get endpoint by ID
webhookRouter.get('/endpoints/:id', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const endpoint = await webhookService.getEndpoint(req.params.id, req.apiKey.orgId);
    res.json(endpoint);
  } catch (error) {
    next(error);
  }
});

// Update endpoint
webhookRouter.patch('/endpoints/:id', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const input = updateEndpointSchema.parse(req.body);
    const endpoint = await webhookService.updateEndpoint(req.params.id, req.apiKey.orgId, input);

    res.json(endpoint);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new ValidationError(error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')));
    } else {
      next(error);
    }
  }
});

// Delete endpoint
webhookRouter.delete('/endpoints/:id', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const result = await webhookService.deleteEndpoint(req.params.id, req.apiKey.orgId);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Rotate endpoint secret
webhookRouter.post('/endpoints/:id/rotate-secret', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const result = await webhookService.rotateSecret(req.params.id, req.apiKey.orgId);

    res.json({
      ...result,
      warning: 'Save the new webhook secret securely. It will not be shown again.',
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Delivery Routes
// ============================================================================

// List deliveries
webhookRouter.get('/deliveries', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const { endpointId, status, eventType, limit, offset } = req.query;

    const deliveries = await webhookService.listDeliveries(req.apiKey.orgId, {
      endpointId: endpointId as string | undefined,
      status: status as string | undefined,
      eventType: eventType as string | undefined,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    });

    res.json({ data: deliveries, count: deliveries.length });
  } catch (error) {
    next(error);
  }
});

// Retry a failed delivery
webhookRouter.post('/deliveries/:id/retry', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const result = await webhookService.retryDelivery(req.params.id, req.apiKey.orgId);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Test & Utility Routes
// ============================================================================

// Send test event
webhookRouter.post('/test', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const { eventType, data } = req.body;

    if (!eventType) {
      throw new ValidationError('eventType is required');
    }

    const result = await webhookService.dispatchEvent(
      req.apiKey.orgId,
      eventType,
      data || { test: true, timestamp: new Date().toISOString() }
    );

    res.json(result);
  } catch (error) {
    next(error);
  }
});
