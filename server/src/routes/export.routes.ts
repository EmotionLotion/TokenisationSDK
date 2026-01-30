import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as evidenceService from '../services/evidence.service.js';
import * as regulatoryPackService from '../services/regulatoryPack.service.js';
import * as auditService from '../services/audit.service.js';
import * as ledgerService from '../services/ledger.service.js';
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

const csvDateFilterSchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

// ============================================================================
// CSV Helpers
// ============================================================================

/**
 * Escape a value for safe inclusion in a CSV cell.
 * Wraps the value in double-quotes if it contains commas, quotes, or newlines.
 */
function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Convert an array of objects to a CSV string.
 */
function toCsv(rows: Record<string, unknown>[], columns?: string[]): string {
  if (rows.length === 0) return '';

  const headers = columns ?? Object.keys(rows[0]);
  const headerLine = headers.map(csvEscape).join(',');

  const dataLines = rows.map((row) =>
    headers.map((h) => csvEscape(row[h])).join(','),
  );

  return [headerLine, ...dataLines].join('\r\n');
}

function sendCsv(res: Response, csv: string, filename: string): void {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
}

// ============================================================================
// CSV Export Routes
// ============================================================================

/**
 * GET /cap-table/:tokenId - CSV export of cap table
 */
router.get('/cap-table/:tokenId', apiKeyMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ctxReq = req as ContextRequest;
    const orgId = ctxReq.apiKey?.orgId;
    if (!orgId) {
      throw new ValidationError('Organization ID required');
    }

    const tokenId = req.params.tokenId;
    const capTable = await ledgerService.getCapTable(tokenId, orgId);

    const rows = (capTable.holders ?? capTable.positions ?? []).map((holder: Record<string, unknown>) => ({
      address: holder.walletAddress ?? holder.address ?? '',
      investorId: holder.investorId ?? '',
      name: holder.name ?? '',
      balance: holder.balance ?? '0',
      percentage: holder.percentage ?? '',
      frozenBalance: holder.frozenBalance ?? '0',
      lastUpdated: holder.lastEventAt ?? holder.updatedAt ?? '',
    }));

    const columns = ['address', 'investorId', 'name', 'balance', 'percentage', 'frozenBalance', 'lastUpdated'];
    const csv = toCsv(rows, columns);
    const filename = `cap-table_${tokenId}_${new Date().toISOString().slice(0, 10)}.csv`;

    sendCsv(res, csv, filename);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /audit - CSV export of audit trail with date filters
 */
router.get('/audit', apiKeyMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ctxReq = req as ContextRequest;
    const orgId = ctxReq.apiKey?.orgId;
    if (!orgId) {
      throw new ValidationError('Organization ID required');
    }

    const { startDate, endDate } = req.query;

    const entries = await auditService.getAuditLog(orgId, {
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      limit: 10000,
    });

    const rows = (Array.isArray(entries) ? entries : []).map((entry: Record<string, unknown>) => ({
      id: entry.id ?? '',
      timestamp: entry.timestamp ?? entry.createdAt ?? '',
      action: entry.action ?? '',
      actorId: entry.actorId ?? '',
      actorType: entry.actorType ?? '',
      resourceType: entry.resourceType ?? '',
      resourceId: entry.resourceId ?? '',
      ipAddress: entry.ipAddress ?? '',
      details: entry.metadata ? JSON.stringify(entry.metadata) : '',
    }));

    const columns = ['id', 'timestamp', 'action', 'actorId', 'actorType', 'resourceType', 'resourceId', 'ipAddress', 'details'];
    const csv = toCsv(rows, columns);

    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `audit-log_${dateStr}.csv`;

    sendCsv(res, csv, filename);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /transactions/:tokenId - CSV export of transactions for a token
 */
router.get('/transactions/:tokenId', apiKeyMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ctxReq = req as ContextRequest;
    const orgId = ctxReq.apiKey?.orgId;
    if (!orgId) {
      throw new ValidationError('Organization ID required');
    }

    const tokenId = req.params.tokenId;
    const { startDate, endDate } = req.query;

    const events = await ledgerService.getLedgerEvents(tokenId, orgId, {
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      limit: 10000,
    });

    const rows = (Array.isArray(events) ? events : []).map((evt: Record<string, unknown>) => ({
      id: evt.id ?? '',
      timestamp: evt.createdAt ?? '',
      eventType: evt.eventType ?? '',
      fromWallet: evt.fromWallet ?? '',
      toWallet: evt.toWallet ?? '',
      amount: evt.delta ?? '',
      txHash: evt.txHash ?? '',
      blockNumber: evt.txBlock ?? '',
      balanceBefore: evt.balanceBefore ?? '',
      balanceAfter: evt.balanceAfter ?? '',
      ref: evt.ref ?? '',
      refType: evt.refType ?? '',
    }));

    const columns = [
      'id', 'timestamp', 'eventType', 'fromWallet', 'toWallet',
      'amount', 'txHash', 'blockNumber', 'balanceBefore', 'balanceAfter',
      'ref', 'refType',
    ];
    const csv = toCsv(rows, columns);

    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `transactions_${tokenId}_${dateStr}.csv`;

    sendCsv(res, csv, filename);
  } catch (error) {
    next(error);
  }
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
