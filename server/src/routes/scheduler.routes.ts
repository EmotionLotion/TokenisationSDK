/**
 * Scheduler API Routes
 *
 * Admin endpoints for managing scheduled jobs and viewing run history.
 */

import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ValidationError } from '../middleware/errorHandler.js';
import { apiKeyMiddleware, type ApiKeyRequest } from '../middleware/auth.js';
import * as schedulerService from '../services/scheduler.service.js';

export const schedulerRouter = Router();

// ============================================================================
// Schemas
// ============================================================================

const createJobSchema = z.object({
  name: z.string().min(1).max(200),
  jobType: z.string().min(1).max(100),
  schedule: z.string().min(1).max(200),
  scheduleType: z.enum(['cron', 'interval']).optional(),
  payload: z.record(z.unknown()).optional(),
  nextRunAt: z.string().datetime().optional(),
  maxRetries: z.number().int().min(0).max(50).optional(),
  retryDelayMs: z.number().int().min(0).max(3600000).optional(),
  timeoutMs: z.number().int().min(1000).max(3600000).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const listJobsQuerySchema = z.object({
  status: z.enum(['active', 'paused', 'running']).optional(),
  jobType: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const listRunsQuerySchema = z.object({
  status: z.enum(['success', 'failure', 'running', 'skipped']).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

// ============================================================================
// GET /api/v1/scheduler/jobs - List all scheduled jobs
// ============================================================================

schedulerRouter.get(
  '/jobs',
  apiKeyMiddleware,
  async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.apiKey) throw new ValidationError('API key required');

      const query = listJobsQuerySchema.parse(req.query);

      const result = await schedulerService.listJobs({
        orgId: req.apiKey.orgId,
        status: query.status as schedulerService.JobStatus | undefined,
        jobType: query.jobType,
        limit: query.limit,
        offset: query.offset,
      });

      res.json({
        data: result.data,
        total: result.total,
        limit: query.limit || 50,
        offset: query.offset || 0,
      });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================================================
// POST /api/v1/scheduler/jobs - Create a new scheduled job
// ============================================================================

schedulerRouter.post(
  '/jobs',
  apiKeyMiddleware,
  async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.apiKey) throw new ValidationError('API key required');

      const input = createJobSchema.parse(req.body);

      const job = await schedulerService.registerJob({
        orgId: req.apiKey.orgId,
        name: input.name,
        jobType: input.jobType,
        schedule: input.schedule,
        scheduleType: input.scheduleType,
        payload: input.payload,
        nextRunAt: input.nextRunAt,
        maxRetries: input.maxRetries,
        retryDelayMs: input.retryDelayMs,
        timeoutMs: input.timeoutMs,
        metadata: input.metadata,
      });

      res.status(201).json(job);
    } catch (error) {
      next(error);
    }
  }
);

// ============================================================================
// GET /api/v1/scheduler/jobs/:id - Get job details
// ============================================================================

schedulerRouter.get(
  '/jobs/:id',
  apiKeyMiddleware,
  async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.apiKey) throw new ValidationError('API key required');

      const job = await schedulerService.getJob(req.params.id);
      if (!job || job.orgId !== req.apiKey.orgId) {
        return res.status(404).json({ error: 'Job not found' });
      }

      res.json(job);
    } catch (error) {
      next(error);
    }
  }
);

// ============================================================================
// PATCH /api/v1/scheduler/jobs/:id/pause - Pause a job
// ============================================================================

schedulerRouter.patch(
  '/jobs/:id/pause',
  apiKeyMiddleware,
  async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.apiKey) throw new ValidationError('API key required');

      // Verify ownership
      const existing = await schedulerService.getJob(req.params.id);
      if (!existing || existing.orgId !== req.apiKey.orgId) {
        return res.status(404).json({ error: 'Job not found' });
      }

      if (existing.status === 'paused') {
        return res.status(409).json({ error: 'Job is already paused' });
      }

      const job = await schedulerService.pauseJob(req.params.id);
      res.json(job);
    } catch (error) {
      next(error);
    }
  }
);

// ============================================================================
// PATCH /api/v1/scheduler/jobs/:id/resume - Resume a paused job
// ============================================================================

schedulerRouter.patch(
  '/jobs/:id/resume',
  apiKeyMiddleware,
  async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.apiKey) throw new ValidationError('API key required');

      // Verify ownership
      const existing = await schedulerService.getJob(req.params.id);
      if (!existing || existing.orgId !== req.apiKey.orgId) {
        return res.status(404).json({ error: 'Job not found' });
      }

      if (existing.status !== 'paused') {
        return res.status(409).json({ error: 'Job is not paused' });
      }

      const job = await schedulerService.resumeJob(req.params.id);
      res.json(job);
    } catch (error) {
      next(error);
    }
  }
);

// ============================================================================
// DELETE /api/v1/scheduler/jobs/:id - Delete a job
// ============================================================================

schedulerRouter.delete(
  '/jobs/:id',
  apiKeyMiddleware,
  async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.apiKey) throw new ValidationError('API key required');

      // Verify ownership
      const existing = await schedulerService.getJob(req.params.id);
      if (!existing || existing.orgId !== req.apiKey.orgId) {
        return res.status(404).json({ error: 'Job not found' });
      }

      await schedulerService.deleteJob(req.params.id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);

// ============================================================================
// GET /api/v1/scheduler/jobs/:id/runs - Get run history for a job
// ============================================================================

schedulerRouter.get(
  '/jobs/:id/runs',
  apiKeyMiddleware,
  async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.apiKey) throw new ValidationError('API key required');

      // Verify ownership
      const existing = await schedulerService.getJob(req.params.id);
      if (!existing || existing.orgId !== req.apiKey.orgId) {
        return res.status(404).json({ error: 'Job not found' });
      }

      const query = listRunsQuerySchema.parse(req.query);

      const result = await schedulerService.getJobRuns(req.params.id, {
        status: query.status as schedulerService.RunStatus | undefined,
        limit: query.limit,
        offset: query.offset,
      });

      res.json({
        data: result.data,
        total: result.total,
        limit: query.limit || 50,
        offset: query.offset || 0,
      });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================================================
// POST /api/v1/scheduler/jobs/:id/trigger - Manually trigger a job
// ============================================================================

schedulerRouter.post(
  '/jobs/:id/trigger',
  apiKeyMiddleware,
  async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.apiKey) throw new ValidationError('API key required');

      // Verify ownership
      const existing = await schedulerService.getJob(req.params.id);
      if (!existing || existing.orgId !== req.apiKey.orgId) {
        return res.status(404).json({ error: 'Job not found' });
      }

      const run = await schedulerService.triggerJob(req.params.id, `api:${req.apiKey.keyId}`);
      res.status(201).json(run);
    } catch (error) {
      next(error);
    }
  }
);

// ============================================================================
// GET /api/v1/scheduler/status - Scheduler health/status
// ============================================================================

schedulerRouter.get(
  '/status',
  apiKeyMiddleware,
  async (_req: ApiKeyRequest, res: Response, next: NextFunction) => {
    try {
      res.json({
        running: schedulerService.isRunning(),
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  }
);
