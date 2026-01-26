import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as evidenceService from '../services/evidence.service.js';
import * as regulatoryPackService from '../services/regulatoryPack.service.js';
import { generateEvidencePackHtml, generateRegulatoryPackHtml, exportEvidencePack } from '../services/pdfExport.service.js';
import { apiKeyMiddleware } from '../middleware/auth.js';
import { ValidationError } from '../middleware/errorHandler.js';
import type { ContextRequest } from '../middleware/context.js';

const router = Router();

// ============================================================================
// Validation Schemas
// ============================================================================

const exportFormatSchema = z.enum(['json', 'html', 'text']);

const regulatoryPackOptionsSchema = z.object({
  asOfDate: z.string().datetime().optional(),
  includeAllTransfers: z.boolean().optional(),
  includeIdentityDetails: z.boolean().optional(),
  limit: z.number().int().positive().max(10000).optional(),
  format: z.enum(['json', 'html']).optional(),
});

// ============================================================================
// Evidence Pack Routes
// ============================================================================

/**
 * GET /evidence/investor/:id - Generate investor evidence pack
 */
router.get('/evidence/investor/:id', apiKeyMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ctxReq = req as ContextRequest;
    const orgId = ctxReq.apiKey?.orgId;
    if (!orgId) {
      throw new ValidationError('Organization ID required');
    }

    const format = req.query.format ? exportFormatSchema.parse(req.query.format) : 'json';
    const pack = await evidenceService.generateInvestorPack(req.params.id, orgId);

    sendExportResponse(res, pack, format, 'investor');
  } catch (error) {
    next(error);
  }
});

/**
 * GET /evidence/transfer/:id - Generate transfer evidence pack
 */
router.get('/evidence/transfer/:id', apiKeyMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ctxReq = req as ContextRequest;
    const orgId = ctxReq.apiKey?.orgId;
    if (!orgId) {
      throw new ValidationError('Organization ID required');
    }

    const format = req.query.format ? exportFormatSchema.parse(req.query.format) : 'json';
    const pack = await evidenceService.generateTransferPack(req.params.id, orgId);

    sendExportResponse(res, pack, format, 'transfer');
  } catch (error) {
    next(error);
  }
});

/**
 * GET /evidence/token/:id - Generate token evidence pack
 */
router.get('/evidence/token/:id', apiKeyMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ctxReq = req as ContextRequest;
    const orgId = ctxReq.apiKey?.orgId;
    if (!orgId) {
      throw new ValidationError('Organization ID required');
    }

    const format = req.query.format ? exportFormatSchema.parse(req.query.format) : 'json';
    const pack = await evidenceService.generateTokenPack(req.params.id, orgId);

    sendExportResponse(res, pack, format, 'token');
  } catch (error) {
    next(error);
  }
});

/**
 * GET /evidence/kyc/:investorId - Generate KYC evidence pack
 */
router.get('/evidence/kyc/:investorId', apiKeyMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ctxReq = req as ContextRequest;
    const orgId = ctxReq.apiKey?.orgId;
    if (!orgId) {
      throw new ValidationError('Organization ID required');
    }

    const format = req.query.format ? exportFormatSchema.parse(req.query.format) : 'json';
    const pack = await evidenceService.generateKycPack(req.params.investorId, orgId);

    sendExportResponse(res, pack, format, 'kyc');
  } catch (error) {
    next(error);
  }
});

/**
 * GET /evidence/clawback/:id - Generate clawback evidence pack
 */
router.get('/evidence/clawback/:id', apiKeyMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ctxReq = req as ContextRequest;
    const orgId = ctxReq.apiKey?.orgId;
    if (!orgId) {
      throw new ValidationError('Organization ID required');
    }

    const format = req.query.format ? exportFormatSchema.parse(req.query.format) : 'json';
    const pack = await evidenceService.generateClawbackPack(req.params.id, orgId);

    sendExportResponse(res, pack, format, 'clawback');
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Regulatory Pack Routes
// ============================================================================

/**
 * GET /regulatory/token/:id - Generate regulatory pack for a token
 */
router.get('/regulatory/token/:id', apiKeyMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ctxReq = req as ContextRequest;
    const orgId = ctxReq.apiKey?.orgId;
    if (!orgId) {
      throw new ValidationError('Organization ID required');
    }

    const options = regulatoryPackOptionsSchema.parse(req.query);
    const pack = await regulatoryPackService.generateRegulatoryPack(req.params.id, orgId, {
      asOfDate: options.asOfDate ? new Date(options.asOfDate) : undefined,
      includeAllTransfers: options.includeAllTransfers,
      includeIdentityDetails: options.includeIdentityDetails,
      limit: options.limit,
    });

    const format = options.format || 'json';
    if (format === 'html') {
      const html = generateRegulatoryPackHtml(pack);
      res.setHeader('Content-Type', 'text/html');
      res.setHeader('Content-Disposition', `attachment; filename="regulatory_pack_${req.params.id}.html"`);
      res.send(html);
    } else {
      res.json({
        success: true,
        data: pack,
      });
    }
  } catch (error) {
    next(error);
  }
});

/**
 * GET /regulatory/token/:id/point-in-time - Reconstruct token state at a point in time
 */
router.get('/regulatory/token/:id/point-in-time', apiKeyMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ctxReq = req as ContextRequest;
    const orgId = ctxReq.apiKey?.orgId;
    if (!orgId) {
      throw new ValidationError('Organization ID required');
    }

    const targetDate = z.string().datetime().parse(req.query.targetDate);
    const state = await regulatoryPackService.reconstructStateAtTime(
      req.params.id,
      orgId,
      new Date(targetDate)
    );

    res.json({
      success: true,
      data: state,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /regulatory/token/:id/export - Export regulatory pack with custom options
 */
router.post('/regulatory/token/:id/export', apiKeyMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ctxReq = req as ContextRequest;
    const orgId = ctxReq.apiKey?.orgId;
    if (!orgId) {
      throw new ValidationError('Organization ID required');
    }

    const options = regulatoryPackOptionsSchema.parse(req.body);
    const result = await regulatoryPackService.exportRegulatoryPackJson(req.params.id, orgId, {
      asOfDate: options.asOfDate ? new Date(options.asOfDate) : undefined,
      includeAllTransfers: options.includeAllTransfers,
      includeIdentityDetails: options.includeIdentityDetails,
      limit: options.limit,
    });

    res.setHeader('Content-Type', result.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(result.content);
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Helper Functions
// ============================================================================

function sendExportResponse(
  res: Response,
  pack: evidenceService.EvidencePack,
  format: 'json' | 'html' | 'text',
  type: string
): void {
  const exported = exportEvidencePack(pack, format);

  if (format === 'json') {
    res.json({
      success: true,
      data: pack,
      exportInfo: {
        filename: exported.filename,
        contentHash: exported.contentHash,
      },
    });
  } else {
    res.setHeader('Content-Type', exported.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${exported.filename}"`);
    res.setHeader('X-Content-Hash', exported.contentHash);
    res.send(exported.content);
  }
}

export const exportRouter = router;
