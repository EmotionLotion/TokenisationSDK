import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as dldService from '../services/dld.service.js';
import { ValidationError } from '../middleware/errorHandler.js';
import { apiKeyMiddleware, type ApiKeyRequest } from '../middleware/auth.js';

export const dldRouter = Router();

// ============================================================================
// Validation Schemas
// ============================================================================

const registerTitleSchema = z.object({
  projectId: z.string().uuid(),
  dldTitleNumber: z.string().min(1),
  propertyType: z.enum(['land', 'building', 'unit']),
  emirate: z.string().default('dubai'),
  area: z.string().optional(),
  plotNumber: z.string().optional(),
  buildingName: z.string().optional(),
  unitNumber: z.string().optional(),
  propertyDetails: z.record(z.unknown()).optional(),
});

const updateTitleSchema = z.object({
  status: z.enum(['pending', 'verified', 'disputed', 'expired']).optional(),
  propertyDetails: z.record(z.unknown()).optional(),
});

const ingestEventSchema = z.object({
  dldTitleId: z.string().uuid(),
  eventType: z.enum([
    'title_registered',
    'title_transferred',
    'lien_added',
    'lien_removed',
    'dispute_filed',
    'dispute_resolved',
    'valuation_updated',
    'ownership_changed',
    'encumbrance_added',
    'encumbrance_removed',
  ]),
  eventData: z.record(z.unknown()),
  dldEventId: z.string().optional(),
  occurredAt: z.string().datetime().optional(),
});

const createSyncJobSchema = z.object({
  jobType: z.enum(['poll', 'reconcile', 'manual']),
  config: z.record(z.unknown()).optional(),
});

// ============================================================================
// Title Routes
// ============================================================================

// Register a new DLD title
dldRouter.post('/titles', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const input = registerTitleSchema.parse(req.body);
    const title = await dldService.registerTitle({
      ...input,
      orgId: req.apiKey.orgId,
    });

    res.status(201).json(title);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new ValidationError(error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')));
    } else {
      next(error);
    }
  }
});

// List titles
dldRouter.get('/titles', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const { projectId, status, limit, offset } = req.query;

    const titles = await dldService.listTitles(req.apiKey.orgId, {
      projectId: projectId as string | undefined,
      status: status as string | undefined,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    });

    res.json({ data: titles, count: titles.length });
  } catch (error) {
    next(error);
  }
});

// Get title by ID
dldRouter.get('/titles/:id', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const title = await dldService.getTitle(req.params.id, req.apiKey.orgId);
    res.json(title);
  } catch (error) {
    next(error);
  }
});

// Update title
dldRouter.patch('/titles/:id', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const input = updateTitleSchema.parse(req.body);
    const title = await dldService.updateTitle(req.params.id, req.apiKey.orgId, input);

    res.json(title);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new ValidationError(error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')));
    } else {
      next(error);
    }
  }
});

// Verify title against DLD
dldRouter.post('/titles/:id/verify', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const result = await dldService.verifyTitle(req.params.id, req.apiKey.orgId);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Get title events
dldRouter.get('/titles/:id/events', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const { limit, offset } = req.query;

    const events = await dldService.getTitleEvents(req.params.id, req.apiKey.orgId, {
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    });

    res.json({ data: events, count: events.length });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Event Ingestion Routes
// ============================================================================

// Ingest DLD event (webhook from DLD or manual)
dldRouter.post('/events', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const input = ingestEventSchema.parse(req.body);
    const event = await dldService.ingestEvent({
      ...input,
      orgId: req.apiKey.orgId,
      occurredAt: input.occurredAt ? new Date(input.occurredAt) : undefined,
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

// List events
dldRouter.get('/events', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const { titleId, eventType, processed, limit, offset } = req.query;

    const events = await dldService.listEvents(req.apiKey.orgId, {
      titleId: titleId as string | undefined,
      eventType: eventType as string | undefined,
      processed: processed === 'true' ? true : processed === 'false' ? false : undefined,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    });

    res.json({ data: events, count: events.length });
  } catch (error) {
    next(error);
  }
});

// Process a specific event
dldRouter.post('/events/:id/process', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const result = await dldService.processEvent(req.params.id, req.apiKey.orgId);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Sync Job Routes
// ============================================================================

// Create sync job
dldRouter.post('/sync-jobs', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const input = createSyncJobSchema.parse(req.body);
    const job = await dldService.createSyncJob({
      ...input,
      orgId: req.apiKey.orgId,
    });

    res.status(201).json(job);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new ValidationError(error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')));
    } else {
      next(error);
    }
  }
});

// List sync jobs
dldRouter.get('/sync-jobs', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const { status, jobType, limit, offset } = req.query;

    const jobs = await dldService.listSyncJobs(req.apiKey.orgId, {
      status: status as string | undefined,
      jobType: jobType as string | undefined,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    });

    res.json({ data: jobs, count: jobs.length });
  } catch (error) {
    next(error);
  }
});

// Execute sync job
dldRouter.post('/sync-jobs/:id/execute', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const result = await dldService.executeSyncJob(req.params.id, req.apiKey.orgId);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Lookup Routes
// ============================================================================

// Lookup title by DLD title number
dldRouter.get('/lookup/:dldTitleNumber', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const title = await dldService.lookupByDldTitleNumber(
      req.params.dldTitleNumber,
      req.apiKey.orgId
    );

    res.json(title);
  } catch (error) {
    next(error);
  }
});

// Check if title is clear (no disputes, liens, etc.)
dldRouter.get('/titles/:id/check-clear', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const result = await dldService.checkTitleClear(req.params.id, req.apiKey.orgId);
    res.json(result);
  } catch (error) {
    next(error);
  }
});
