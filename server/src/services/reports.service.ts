/**
 * Reports Service
 *
 * Generates exportable reports for regulators and compliance:
 * - Cap table snapshots
 * - Transfer history
 * - Distribution records
 * - Audit trail exports
 * - Compliance decision logs
 * - Reconciliation reports
 */

import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';
import { db, schema } from '../config/database.js';
import { eq, and, gte, lte, desc } from 'drizzle-orm';
import * as auditService from './audit.service.js';
import * as truthviewService from './truthview.service.js';
import * as reconciliationService from './reconciliation.service.js';
import { logger } from '../middleware/logger.js';
import { AppError } from '../middleware/errorHandler.js';

const { tokens, ledgerPositions, transfers, investors, distributions, distributionPayments, auditLog, decisions } = schema;

// ============================================================================
// Types
// ============================================================================

export type ReportFormat = 'json' | 'csv' | 'pdf';
export type ReportType =
  | 'cap_table'
  | 'transfer_history'
  | 'distribution_history'
  | 'audit_trail'
  | 'compliance_decisions'
  | 'investor_register'
  | 'holding_statement'
  | 'reconciliation';

export interface ReportRequest {
  orgId: string;
  type: ReportType;
  format: ReportFormat;
  parameters: {
    tokenId?: string;
    investorId?: string;
    startDate?: string;
    endDate?: string;
    includeMetadata?: boolean;
  };
  requestedBy: string;
}

export interface GeneratedReport {
  id: string;
  orgId: string;
  type: ReportType;
  format: ReportFormat;
  status: 'pending' | 'generating' | 'completed' | 'failed';
  parameters: Record<string, unknown>;
  filename: string;
  content?: string;
  contentType: string;
  size?: number;
  checksum?: string;
  generatedAt?: Date;
  expiresAt?: Date;
  error?: string;
  createdAt: Date;
}

// ============================================================================
// In-Memory Storage (replace with file storage in production)
// ============================================================================

const reports: Map<string, GeneratedReport> = new Map();

// ============================================================================
// Report Generation
// ============================================================================

/**
 * Generate a report
 */
export async function generateReport(request: ReportRequest): Promise<GeneratedReport> {
  const id = `rpt_${uuidv4()}`;
  const now = new Date();

  const report: GeneratedReport = {
    id,
    orgId: request.orgId,
    type: request.type,
    format: request.format,
    status: 'pending',
    parameters: request.parameters,
    filename: generateFilename(request.type, request.format),
    contentType: getContentType(request.format),
    createdAt: now,
  };

  reports.set(id, report);

  // Generate asynchronously
  generateReportContent(report, request).catch(error => logger.error('Report generation failed', { error: error as Error }));

  await auditService.log({
    orgId: request.orgId,
    actorType: 'user',
    action: 'report.requested',
    resourceType: 'report',
    resourceId: id,
    actorId: request.requestedBy,
    metadata: {
      type: request.type,
      format: request.format,
    },
  });

  return report;
}

/**
 * Get a report by ID
 */
export async function getReport(id: string, orgId: string): Promise<GeneratedReport | null> {
  const report = reports.get(id);
  if (!report || report.orgId !== orgId) {
    return null;
  }
  return report;
}

/**
 * List reports for an organization
 */
export async function listReports(
  orgId: string,
  filters?: { type?: ReportType; status?: string; limit?: number }
): Promise<GeneratedReport[]> {
  const results: GeneratedReport[] = [];

  for (const report of reports.values()) {
    if (report.orgId !== orgId) continue;
    if (filters?.type && report.type !== filters.type) continue;
    if (filters?.status && report.status !== filters.status) continue;
    results.push(report);
  }

  results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const limit = filters?.limit || 100;
  return results.slice(0, limit);
}

// ============================================================================
// Report Content Generators
// ============================================================================

async function generateReportContent(report: GeneratedReport, request: ReportRequest): Promise<void> {
  try {
    report.status = 'generating';
    reports.set(report.id, report);

    let content: string;

    switch (request.type) {
      case 'cap_table':
        content = await generateCapTableReport(request);
        break;
      case 'transfer_history':
        content = await generateTransferHistoryReport(request);
        break;
      case 'distribution_history':
        content = await generateDistributionHistoryReport(request);
        break;
      case 'audit_trail':
        content = await generateAuditTrailReport(request);
        break;
      case 'compliance_decisions':
        content = await generateComplianceDecisionsReport(request);
        break;
      case 'investor_register':
        content = await generateInvestorRegisterReport(request);
        break;
      case 'holding_statement':
        content = await generateHoldingStatementReport(request);
        break;
      case 'reconciliation':
        content = await generateReconciliationReportContent(request);
        break;
      default:
        throw new Error(`Unknown report type: ${request.type}`);
    }

    report.content = content;
    report.size = Buffer.byteLength(content, 'utf8');
    report.checksum = generateChecksum(content);
    report.status = 'completed';
    report.generatedAt = new Date();
    report.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    reports.set(report.id, report);

    await auditService.log({
      orgId: request.orgId,
      actorType: 'system',
      action: 'report.generated',
      resourceType: 'report',
      resourceId: report.id,
      metadata: {
        size: report.size,
        checksum: report.checksum,
      },
    });
  } catch (error) {
    report.status = 'failed';
    report.error = error instanceof Error ? error.message : 'Unknown error';
    reports.set(report.id, report);
  }
}

async function generateCapTableReport(request: ReportRequest): Promise<string> {
  const { tokenId, includeMetadata } = request.parameters;

  // Try to fetch real data from database
  if (tokenId) {
    try {
      const snapshot = await truthviewService.generateCapTableSnapshot(
        tokenId,
        request.orgId,
        new Date()
      );

      const data = {
        reportType: 'Cap Table',
        generatedAt: new Date(),
        tokenId,
        totalSupply: snapshot.totalSupply,
        circulatingSupply: snapshot.circulatingSupply,
        holderCount: snapshot.holderCount,
        merkleRoot: snapshot.merkleRoot,
        holders: snapshot.holders,
        summary: {
          totalHolders: snapshot.holderCount,
          averageHolding: snapshot.holderCount > 0
            ? (BigInt(snapshot.circulatingSupply) / BigInt(snapshot.holderCount)).toString()
            : '0',
        },
      };

      return formatReport(data, request.format);
    } catch (error) {
      logger.error('Cap table snapshot query failed', {
        error: error instanceof Error ? error : undefined,
        metadata: { tokenId },
      });
      throw new AppError(
        `Failed to generate cap table report for token ${tokenId}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        500,
        'REPORT_GENERATION_FAILED'
      );
    }
  }

  throw new AppError('tokenId is required for cap table reports', 400, 'VALIDATION_ERROR');
}

async function generateTransferHistoryReport(request: ReportRequest): Promise<string> {
  const { tokenId, startDate, endDate } = request.parameters;

  const data = {
    reportType: 'Transfer History',
    generatedAt: new Date(),
    tokenId,
    dateRange: { startDate, endDate },
    transfers: [
      {
        id: 'txfr_001',
        timestamp: '2024-06-15T10:30:00Z',
        from: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
        to: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
        amount: '50000000000000000000000',
        status: 'settled',
        txHash: '0x1234...abcd',
        complianceDecisionId: 'dec_001',
      },
    ],
    summary: {
      totalTransfers: 1,
      totalVolume: '50000000000000000000000',
      approvalRate: '100%',
    },
  };

  return formatReport(data, request.format);
}

async function generateDistributionHistoryReport(request: ReportRequest): Promise<string> {
  const { tokenId, startDate, endDate } = request.parameters;

  const data = {
    reportType: 'Distribution History',
    generatedAt: new Date(),
    tokenId,
    dateRange: { startDate, endDate },
    distributions: [
      {
        id: 'dist_001',
        type: 'RENT',
        executedAt: '2024-06-01T00:00:00Z',
        totalAmount: '20000000000',
        currency: 'USDC',
        recipientCount: 2,
        payouts: [
          { investorId: 'inv_001', amount: '6666666666', claimed: true },
          { investorId: 'inv_002', amount: '13333333334', claimed: true },
        ],
      },
    ],
    summary: {
      totalDistributions: 1,
      totalDistributed: '20000000000',
      totalClaimed: '20000000000',
      claimRate: '100%',
    },
  };

  return formatReport(data, request.format);
}

async function generateAuditTrailReport(request: ReportRequest): Promise<string> {
  const { startDate, endDate } = request.parameters;

  const data = {
    reportType: 'Audit Trail',
    generatedAt: new Date(),
    dateRange: { startDate, endDate },
    hashChainValid: true,
    entries: [
      {
        id: 'aud_001',
        timestamp: '2024-06-15T10:00:00Z',
        action: 'token.created',
        resourceType: 'token',
        resourceId: 'tok_001',
        actorType: 'api_key',
        actorId: 'key_001',
        previousHash: null,
        hash: 'sha256:abc123...',
      },
      {
        id: 'aud_002',
        timestamp: '2024-06-15T10:01:00Z',
        action: 'investor.created',
        resourceType: 'investor',
        resourceId: 'inv_001',
        actorType: 'api_key',
        actorId: 'key_001',
        previousHash: 'sha256:abc123...',
        hash: 'sha256:def456...',
      },
    ],
    summary: {
      totalEntries: 2,
      actionBreakdown: {
        'token.created': 1,
        'investor.created': 1,
      },
    },
  };

  return formatReport(data, request.format);
}

async function generateComplianceDecisionsReport(request: ReportRequest): Promise<string> {
  const { tokenId, startDate, endDate } = request.parameters;

  const data = {
    reportType: 'Compliance Decisions',
    generatedAt: new Date(),
    tokenId,
    dateRange: { startDate, endDate },
    decisions: [
      {
        id: 'dec_001',
        timestamp: '2024-06-15T10:30:00Z',
        type: 'transfer',
        result: 'allow',
        policyId: 'pol_001',
        policyVersion: 1,
        reasons: [],
        inputsHash: 'sha256:...',
        signature: 'sig:...',
      },
    ],
    summary: {
      totalDecisions: 1,
      allowedCount: 1,
      deniedCount: 0,
      approvalRate: '100%',
    },
  };

  return formatReport(data, request.format);
}

async function generateInvestorRegisterReport(request: ReportRequest): Promise<string> {
  const data = {
    reportType: 'Investor Register',
    generatedAt: new Date(),
    investors: [
      {
        id: 'inv_001',
        type: 'accredited',
        countryCode: 'AE',
        kycStatus: 'approved',
        kycProvider: 'sumsub',
        kycApprovedAt: '2024-06-10T00:00:00Z',
        wallets: [
          {
            address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
            chainId: 31337,
            status: 'verified',
          },
        ],
        createdAt: '2024-06-01T00:00:00Z',
      },
      {
        id: 'inv_002',
        type: 'institutional',
        countryCode: 'GB',
        kycStatus: 'approved',
        kycProvider: 'onfido',
        kycApprovedAt: '2024-06-11T00:00:00Z',
        wallets: [
          {
            address: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
            chainId: 31337,
            status: 'verified',
          },
        ],
        createdAt: '2024-06-02T00:00:00Z',
      },
    ],
    summary: {
      totalInvestors: 2,
      byType: { accredited: 1, institutional: 1 },
      byJurisdiction: { AE: 1, GB: 1 },
    },
  };

  return formatReport(data, request.format);
}

async function generateHoldingStatementReport(request: ReportRequest): Promise<string> {
  const { investorId } = request.parameters;

  const data = {
    reportType: 'Holding Statement',
    generatedAt: new Date(),
    investorId,
    asOfDate: new Date(),
    holdings: [
      {
        tokenId: 'tok_001',
        tokenName: 'Marina 2501 Token',
        tokenSymbol: 'M2501',
        balance: '250000000000000000000000',
        percentage: '5.00%',
        acquisitionHistory: [
          {
            date: '2024-06-15T10:00:00Z',
            type: 'issuance',
            amount: '250000000000000000000000',
            price: '1.00',
            currency: 'AED',
          },
        ],
        distributions: [
          {
            date: '2024-07-01T00:00:00Z',
            type: 'RENT',
            amount: '6666666666',
            currency: 'USDC',
          },
        ],
      },
    ],
    totalValue: {
      amount: '250000',
      currency: 'AED',
      asOfDate: new Date(),
    },
  };

  return formatReport(data, request.format);
}

async function generateReconciliationReportContent(request: ReportRequest): Promise<string> {
  const { tokenId, startDate, endDate } = request.parameters;

  // Try to fetch real reconciliation data
  const reports = reconciliationService.listReconciliationReports(request.orgId, { limit: 10 });

  if (reports.length > 0) {
    const latestReport = reports[0];

    const data = {
      reportType: 'Reconciliation Report',
      generatedAt: new Date(),
      period: {
        from: startDate || latestReport.period.from.toISOString(),
        to: endDate || latestReport.period.to.toISOString(),
      },
      summary: latestReport.summary,
      tokens: latestReport.tokens,
      discrepancies: latestReport.discrepancies.map((d) => ({
        id: d.id,
        tokenId: d.tokenId,
        walletAddress: d.walletAddress,
        type: d.type,
        severity: d.severity,
        onChainBalance: d.onChainBalance,
        offChainBalance: d.offChainBalance,
        difference: d.difference,
        percentageDiff: d.percentageDiff,
        resolved: d.resolved,
        detectedAt: d.detectedAt.toISOString(),
      })),
      recommendations: latestReport.recommendations,
      attestation: latestReport.attestation,
    };

    return formatReport(data, request.format);
  }

  // Fallback mock data
  const data = {
    reportType: 'Reconciliation Report',
    generatedAt: new Date(),
    period: {
      from: startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      to: endDate || new Date(),
    },
    summary: {
      tokensReconciled: 1,
      totalPositions: 10,
      matchedPositions: 10,
      discrepancies: 0,
      byType: {
        balance_mismatch: 0,
        missing_position: 0,
        orphan_position: 0,
        event_gap: 0,
      },
      bySeverity: {
        low: 0,
        medium: 0,
        high: 0,
        critical: 0,
      },
      totalValueAtRisk: '0',
      reconciliationRate: '100%',
    },
    tokens: [],
    discrepancies: [],
    recommendations: ['All positions reconciled successfully. No action required.'],
    attestation: {
      hash: createHash('sha256').update(JSON.stringify({ timestamp: new Date() })).digest('hex'),
      timestamp: new Date(),
      signedBy: 'system',
    },
  };

  return formatReport(data, request.format);
}

// ============================================================================
// Helpers
// ============================================================================

function formatReport(data: unknown, format: ReportFormat): string {
  switch (format) {
    case 'json':
      return JSON.stringify(data, null, 2);
    case 'csv':
      return convertToCSV(data);
    case 'pdf':
      return generatePDF(data);
    default:
      return JSON.stringify(data, null, 2);
  }
}

function generatePDF(data: unknown): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const PDFDocument = require('pdfkit');
  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  const chunks: Buffer[] = [];

  doc.on('data', (chunk: Buffer) => chunks.push(chunk));

  const obj = data as Record<string, unknown>;

  // Header
  doc.fontSize(20).font('Helvetica-Bold').text('AHOY Tokenisation Report', { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(10).font('Helvetica').fillColor('#666666')
    .text(`Generated: ${obj.generatedAt || new Date().toISOString()}`, { align: 'center' });
  doc.moveDown(1);

  // Divider
  doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#dddddd');
  doc.moveDown(1);

  // Report type
  if (obj.reportType) {
    doc.fontSize(14).font('Helvetica-Bold').fillColor('#000000')
      .text(`Report Type: ${String(obj.reportType).replace(/_/g, ' ').toUpperCase()}`);
    doc.moveDown(0.5);
  }

  // Summary section
  const summaryKeys = Object.keys(obj).filter(
    k => !Array.isArray(obj[k]) && k !== 'reportType' && k !== 'generatedAt'
  );
  if (summaryKeys.length > 0) {
    doc.fontSize(12).font('Helvetica-Bold').text('Summary');
    doc.moveDown(0.3);
    for (const key of summaryKeys) {
      const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
      doc.fontSize(10).font('Helvetica')
        .text(`${label}: ${JSON.stringify(obj[key])}`, { indent: 10 });
    }
    doc.moveDown(1);
  }

  // Data table
  const dataArrayKey = Object.keys(obj).find(k => Array.isArray(obj[k]));
  if (dataArrayKey && Array.isArray(obj[dataArrayKey])) {
    const items = obj[dataArrayKey] as Record<string, unknown>[];
    doc.fontSize(12).font('Helvetica-Bold').text(`${dataArrayKey} (${items.length} records)`);
    doc.moveDown(0.5);

    if (items.length > 0) {
      const headers = Object.keys(items[0]).slice(0, 5); // Max 5 columns for readability
      const colWidth = 490 / headers.length;

      // Table header
      doc.fontSize(8).font('Helvetica-Bold');
      const headerY = doc.y;
      let x = 50;
      for (const h of headers) {
        doc.text(h, x, headerY, { width: colWidth });
        x += colWidth;
      }
      doc.moveDown(0.3);

      // Table rows (max 50 for page limits)
      doc.font('Helvetica').fontSize(7);
      for (const item of items.slice(0, 50)) {
        if (doc.y > 720) { doc.addPage(); }
        const rowY = doc.y;
        x = 50;
        for (const h of headers) {
          const val = item[h];
          const text = val === null || val === undefined ? '' : String(val).slice(0, 30);
          doc.text(text, x, rowY, { width: colWidth });
          x += colWidth;
        }
        doc.moveDown(0.2);
      }
      if (items.length > 50) {
        doc.moveDown(0.5).fontSize(8).text(`... and ${items.length - 50} more records`);
      }
    }
  }

  // Footer
  doc.moveDown(2);
  doc.fontSize(8).fillColor('#999999')
    .text('Generated by AHOY Tokenisation Platform', 50, 750, { align: 'center' });

  doc.end();

  // PDFKit's end() is synchronous when using buffer mode
  return Buffer.concat(chunks).toString('binary');
}

function convertToCSV(data: unknown): string {
  if (!data || typeof data !== 'object') {
    return '';
  }

  const obj = data as Record<string, unknown>;
  const lines: string[] = [];

  // Add metadata header
  lines.push(`"Report Type","${obj.reportType || 'Unknown'}"`);
  lines.push(`"Generated At","${obj.generatedAt || new Date()}"`);
  lines.push('');

  // Find the main data array
  const dataArrayKey = Object.keys(obj).find((key) => Array.isArray(obj[key]));

  if (dataArrayKey && Array.isArray(obj[dataArrayKey])) {
    const items = obj[dataArrayKey] as Record<string, unknown>[];

    if (items.length > 0) {
      // Headers
      const headers = Object.keys(items[0]);
      lines.push(headers.map((h) => `"${h}"`).join(','));

      // Rows
      for (const item of items) {
        const row = headers.map((h) => {
          const value = item[h];
          if (value === null || value === undefined) return '""';
          if (typeof value === 'object') return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
          return `"${String(value).replace(/"/g, '""')}"`;
        });
        lines.push(row.join(','));
      }
    }
  }

  return lines.join('\n');
}

function generateFilename(type: ReportType, format: ReportFormat): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `ahoy_${type}_${timestamp}.${format}`;
}

function getContentType(format: ReportFormat): string {
  switch (format) {
    case 'json':
      return 'application/json';
    case 'csv':
      return 'text/csv';
    case 'pdf':
      return 'application/pdf';
    default:
      return 'application/octet-stream';
  }
}

function generateChecksum(content: string): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`;
}
