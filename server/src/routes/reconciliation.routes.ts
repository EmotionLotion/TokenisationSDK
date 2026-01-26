/**
 * Reconciliation API Routes
 *
 * Chain vs. books reconciliation endpoints
 */

import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ValidationError } from '../middleware/errorHandler.js';
import { apiKeyMiddleware, type ApiKeyRequest } from '../middleware/auth.js';
import * as reconciliationService from '../services/reconciliation.service.js';

export const reconciliationRouter = Router();

// ============================================================================
// Schemas
// ============================================================================

const startReconciliationSchema = z.object({
  tokenId: z.string().optional(),
  autoResolve: z.boolean().optional().default(false),
  tolerancePercentage: z.number().min(0).max(100).optional().default(0.0001),
  notifyOnDiscrepancy: z.boolean().optional().default(true),
  notifyThreshold: z.enum(['low', 'medium', 'high', 'critical']).optional().default('medium'),
});

const resolveDiscrepancySchema = z.object({
  resolution: z.string().min(1).max(500),
  correctedBalance: z.string().regex(/^\d+$/).optional(),
});

const scheduleReconciliationSchema = z.object({
  cronExpression: z.string().min(1).max(100),
  tokenId: z.string().optional(),
  autoResolve: z.boolean().optional(),
  tolerancePercentage: z.number().optional(),
  notifyOnDiscrepancy: z.boolean().optional(),
  notifyThreshold: z.enum(['low', 'medium', 'high', 'critical']).optional(),
});

// ============================================================================
// Reconciliation Job Endpoints
// ============================================================================

/**
 * @openapi
 * /api/v1/reconciliation/jobs:
 *   post:
 *     tags: [Reconciliation]
 *     summary: Start a new reconciliation job
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               tokenId: { type: string }
 *               autoResolve: { type: boolean }
 *               tolerancePercentage: { type: number }
 */
reconciliationRouter.post(
  '/jobs',
  apiKeyMiddleware,
  async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.apiKey) throw new ValidationError('API key required');

      const input = startReconciliationSchema.parse(req.body);

      const job = await reconciliationService.startReconciliation(
        req.apiKey.orgId,
        input.tokenId,
        {
          autoResolve: input.autoResolve,
          tolerancePercentage: input.tolerancePercentage,
          notifyOnDiscrepancy: input.notifyOnDiscrepancy,
          notifyThreshold: input.notifyThreshold,
        }
      );

      res.status(202).json(job);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @openapi
 * /api/v1/reconciliation/jobs:
 *   get:
 *     tags: [Reconciliation]
 *     summary: List reconciliation jobs
 *     parameters:
 *       - name: status
 *         in: query
 *         schema: { type: string, enum: [pending, in_progress, completed, failed] }
 *       - name: limit
 *         in: query
 *         schema: { type: integer }
 */
reconciliationRouter.get(
  '/jobs',
  apiKeyMiddleware,
  async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.apiKey) throw new ValidationError('API key required');

      const status = req.query.status as reconciliationService.ReconciliationStatus | undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;

      const jobs = reconciliationService.listReconciliationJobs(req.apiKey.orgId, {
        status,
        limit,
      });

      res.json({
        data: jobs,
        count: jobs.length,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @openapi
 * /api/v1/reconciliation/jobs/{jobId}:
 *   get:
 *     tags: [Reconciliation]
 *     summary: Get reconciliation job status
 *     parameters:
 *       - name: jobId
 *         in: path
 *         required: true
 *         schema: { type: string }
 */
reconciliationRouter.get(
  '/jobs/:jobId',
  apiKeyMiddleware,
  async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.apiKey) throw new ValidationError('API key required');

      const job = reconciliationService.getReconciliationJob(req.params.jobId);
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
// Discrepancy Endpoints
// ============================================================================

/**
 * @openapi
 * /api/v1/reconciliation/discrepancies:
 *   get:
 *     tags: [Reconciliation]
 *     summary: List discrepancies
 *     parameters:
 *       - name: jobId
 *         in: query
 *         schema: { type: string }
 *       - name: tokenId
 *         in: query
 *         schema: { type: string }
 *       - name: resolved
 *         in: query
 *         schema: { type: boolean }
 *       - name: severity
 *         in: query
 *         schema: { type: string, enum: [low, medium, high, critical] }
 */
reconciliationRouter.get(
  '/discrepancies',
  apiKeyMiddleware,
  async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.apiKey) throw new ValidationError('API key required');

      const discrepancies = reconciliationService.listDiscrepancies(req.apiKey.orgId, {
        jobId: req.query.jobId as string | undefined,
        tokenId: req.query.tokenId as string | undefined,
        resolved: req.query.resolved === 'true' ? true : req.query.resolved === 'false' ? false : undefined,
        severity: req.query.severity as reconciliationService.DiscrepancySeverity | undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
      });

      res.json({
        data: discrepancies,
        count: discrepancies.length,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @openapi
 * /api/v1/reconciliation/discrepancies/{discrepancyId}:
 *   get:
 *     tags: [Reconciliation]
 *     summary: Get discrepancy details
 *     parameters:
 *       - name: discrepancyId
 *         in: path
 *         required: true
 *         schema: { type: string }
 */
reconciliationRouter.get(
  '/discrepancies/:discrepancyId',
  apiKeyMiddleware,
  async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.apiKey) throw new ValidationError('API key required');

      const discrepancy = reconciliationService.getDiscrepancy(req.params.discrepancyId);
      if (!discrepancy) {
        return res.status(404).json({ error: 'Discrepancy not found' });
      }

      res.json(discrepancy);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @openapi
 * /api/v1/reconciliation/discrepancies/{discrepancyId}/resolve:
 *   post:
 *     tags: [Reconciliation]
 *     summary: Resolve a discrepancy
 *     parameters:
 *       - name: discrepancyId
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [resolution]
 *             properties:
 *               resolution: { type: string }
 *               correctedBalance: { type: string }
 */
reconciliationRouter.post(
  '/discrepancies/:discrepancyId/resolve',
  apiKeyMiddleware,
  async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.apiKey) throw new ValidationError('API key required');

      const input = resolveDiscrepancySchema.parse(req.body);

      const discrepancy = await reconciliationService.resolveDiscrepancy(
        req.params.discrepancyId,
        req.apiKey.orgId,
        input.resolution,
        input.correctedBalance
      );

      res.json(discrepancy);
    } catch (error) {
      next(error);
    }
  }
);

// ============================================================================
// Report Endpoints
// ============================================================================

/**
 * @openapi
 * /api/v1/reconciliation/reports:
 *   get:
 *     tags: [Reconciliation]
 *     summary: List reconciliation reports
 *     parameters:
 *       - name: limit
 *         in: query
 *         schema: { type: integer }
 */
reconciliationRouter.get(
  '/reports',
  apiKeyMiddleware,
  async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.apiKey) throw new ValidationError('API key required');

      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;

      const reports = reconciliationService.listReconciliationReports(req.apiKey.orgId, {
        limit,
      });

      res.json({
        data: reports.map((r) => ({
          id: r.id,
          jobId: r.jobId,
          generatedAt: r.generatedAt,
          summary: r.summary,
        })),
        count: reports.length,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @openapi
 * /api/v1/reconciliation/reports/{reportId}:
 *   get:
 *     tags: [Reconciliation]
 *     summary: Get reconciliation report details
 *     parameters:
 *       - name: reportId
 *         in: path
 *         required: true
 *         schema: { type: string }
 */
reconciliationRouter.get(
  '/reports/:reportId',
  apiKeyMiddleware,
  async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.apiKey) throw new ValidationError('API key required');

      const report = reconciliationService.getReconciliationReport(req.params.reportId);
      if (!report || report.orgId !== req.apiKey.orgId) {
        return res.status(404).json({ error: 'Report not found' });
      }

      res.json(report);
    } catch (error) {
      next(error);
    }
  }
);

// ============================================================================
// Scheduled Reconciliation Endpoints
// ============================================================================

/**
 * @openapi
 * /api/v1/reconciliation/schedules:
 *   post:
 *     tags: [Reconciliation]
 *     summary: Create a scheduled reconciliation
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [cronExpression]
 *             properties:
 *               cronExpression: { type: string }
 *               tokenId: { type: string }
 */
reconciliationRouter.post(
  '/schedules',
  apiKeyMiddleware,
  async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.apiKey) throw new ValidationError('API key required');

      const input = scheduleReconciliationSchema.parse(req.body);

      const scheduled = reconciliationService.createScheduledReconciliation(
        req.apiKey.orgId,
        input.cronExpression,
        input.tokenId,
        {
          autoResolve: input.autoResolve,
          tolerancePercentage: input.tolerancePercentage,
          notifyOnDiscrepancy: input.notifyOnDiscrepancy,
          notifyThreshold: input.notifyThreshold,
        }
      );

      res.status(201).json(scheduled);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @openapi
 * /api/v1/reconciliation/schedules:
 *   get:
 *     tags: [Reconciliation]
 *     summary: List scheduled reconciliations
 */
reconciliationRouter.get(
  '/schedules',
  apiKeyMiddleware,
  async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.apiKey) throw new ValidationError('API key required');

      const schedules = reconciliationService.listScheduledReconciliations(req.apiKey.orgId);

      res.json({
        data: schedules,
        count: schedules.length,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @openapi
 * /api/v1/reconciliation/schedules/{scheduleId}:
 *   patch:
 *     tags: [Reconciliation]
 *     summary: Toggle scheduled reconciliation
 *     parameters:
 *       - name: scheduleId
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [enabled]
 *             properties:
 *               enabled: { type: boolean }
 */
reconciliationRouter.patch(
  '/schedules/:scheduleId',
  apiKeyMiddleware,
  async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.apiKey) throw new ValidationError('API key required');

      const enabled = z.boolean().parse(req.body.enabled);

      const scheduled = reconciliationService.toggleScheduledReconciliation(
        req.params.scheduleId,
        enabled
      );

      if (!scheduled) {
        return res.status(404).json({ error: 'Schedule not found' });
      }

      res.json(scheduled);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @openapi
 * /api/v1/reconciliation/schedules/{scheduleId}:
 *   delete:
 *     tags: [Reconciliation]
 *     summary: Delete scheduled reconciliation
 *     parameters:
 *       - name: scheduleId
 *         in: path
 *         required: true
 *         schema: { type: string }
 */
reconciliationRouter.delete(
  '/schedules/:scheduleId',
  apiKeyMiddleware,
  async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.apiKey) throw new ValidationError('API key required');

      const deleted = reconciliationService.deleteScheduledReconciliation(req.params.scheduleId);

      if (!deleted) {
        return res.status(404).json({ error: 'Schedule not found' });
      }

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);

// ============================================================================
// Quick Reconcile Endpoint
// ============================================================================

/**
 * @openapi
 * /api/v1/reconciliation/tokens/{tokenId}/quick:
 *   post:
 *     tags: [Reconciliation]
 *     summary: Quick reconciliation for a single token
 *     parameters:
 *       - name: tokenId
 *         in: path
 *         required: true
 *         schema: { type: string }
 */
reconciliationRouter.post(
  '/tokens/:tokenId/quick',
  apiKeyMiddleware,
  async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.apiKey) throw new ValidationError('API key required');

      const job = await reconciliationService.startReconciliation(
        req.apiKey.orgId,
        req.params.tokenId,
        {
          autoResolve: false,
          tolerancePercentage: 0.0001,
          notifyOnDiscrepancy: false,
          notifyThreshold: 'high',
        }
      );

      res.status(202).json({
        message: 'Reconciliation started',
        jobId: job.id,
      });
    } catch (error) {
      next(error);
    }
  }
);
