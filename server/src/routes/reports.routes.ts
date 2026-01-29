/**
 * Reports API Routes
 *
 * Endpoints for generating and downloading compliance reports.
 */

import { Router, Request, Response, NextFunction } from 'express';
import * as reportsService from '../services/reports.service.js';
import { ValidationError, NotFoundError } from '../middleware/errorHandler.js';

const router = Router();

/**
 * POST /v1/reports
 * Generate a new report
 */
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = (req as any).apiKey?.orgId || req.headers['x-org-id'] as string || 'default-org';
    const userId = (req as any).apiKey?.keyId || req.headers['x-user-id'] as string || 'system';
    const { type, format, parameters } = req.body;

    if (!type) {
      throw new ValidationError('Report type is required');
    }

    const validTypes = [
      'cap_table',
      'transfer_history',
      'distribution_history',
      'audit_trail',
      'compliance_decisions',
      'investor_register',
      'holding_statement',
    ];

    if (!validTypes.includes(type)) {
      throw new ValidationError(`Invalid report type. Must be one of: ${validTypes.join(', ')}`);
    }

    const validFormats = ['json', 'csv', 'pdf'];
    const reportFormat = format || 'json';

    if (!validFormats.includes(reportFormat)) {
      throw new ValidationError(`Invalid format. Must be one of: ${validFormats.join(', ')}`);
    }

    const report = await reportsService.generateReport({
      orgId,
      type,
      format: reportFormat,
      parameters: parameters || {},
      requestedBy: userId,
    });

    res.status(202).json(report);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /v1/reports
 * List generated reports
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = (req as any).apiKey?.orgId || req.headers['x-org-id'] as string || 'default-org';
    const { type, status, limit } = req.query;

    const reports = await reportsService.listReports(orgId, {
      type: type as reportsService.ReportType | undefined,
      status: status as string | undefined,
      limit: limit ? parseInt(limit as string) : undefined,
    });

    res.json({ data: reports, count: reports.length });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /v1/reports/:id
 * Get report metadata
 */
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = (req as any).apiKey?.orgId || req.headers['x-org-id'] as string || 'default-org';
    const { id } = req.params;

    const report = await reportsService.getReport(id, orgId);
    if (!report) {
      throw new NotFoundError('Report not found');
    }

    res.json(report);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /v1/reports/:id/download
 * Download report content
 */
router.get('/:id/download', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = (req as any).apiKey?.orgId || req.headers['x-org-id'] as string || 'default-org';
    const { id } = req.params;

    const report = await reportsService.getReport(id, orgId);
    if (!report) {
      throw new NotFoundError('Report not found');
    }

    if (report.status !== 'completed') {
      throw new ValidationError(`Report is not ready. Status: ${report.status}`);
    }

    if (!report.content) {
      throw new ValidationError('Report content not available');
    }

    res.setHeader('Content-Type', report.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${report.filename}"`);
    res.setHeader('X-Report-Checksum', report.checksum || '');

    res.send(report.content);
  } catch (error) {
    next(error);
  }
});

export default router;
