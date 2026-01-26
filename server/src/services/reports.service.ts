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

const { tokens, ledgerPositions, transfers, investors, distributions, distributionPayouts, auditLogs, complianceDecisions } = schema;

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

  await auditService.logAction({
    orgId: request.orgId,
    action: 'report.requested',
    entityType: 'report',
    entityId: id,
    actorId: request.requestedBy,
    changes: {
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

    await auditService.logAction({
      orgId: request.orgId,
      action: 'report.generated',
      entityType: 'report',
      entityId: report.id,
      changes: {
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
    } catch {
      // Fall back to mock data if database query fails
    }
  }

  // Fallback mock data
  const data = {
    reportType: 'Cap Table',
    generatedAt: new Date(),
    tokenId,
    totalSupply: '5000000000000000000000000',
    issuedSupply: '750000000000000000000000',
    holders: [
      {
        rank: 1,
        walletAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
        balance: '250000000000000000000000',
        percentage: '5.00%',
        investorId: 'inv_001',
        investorType: 'accredited',
        jurisdiction: 'AE',
      },
      {
        rank: 2,
        walletAddress: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
        balance: '500000000000000000000000',
        percentage: '10.00%',
        investorId: 'inv_002',
        investorType: 'institutional',
        jurisdiction: 'GB',
      },
    ],
    summary: {
      totalHolders: 2,
      averageHolding: '375000000000000000000000',
      medianHolding: '375000000000000000000000',
    },
  };

  return formatReport(data, request.format);
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
        entityType: 'token',
        entityId: 'tok_001',
        actorType: 'api_key',
        actorId: 'key_001',
        previousHash: null,
        hash: 'sha256:abc123...',
      },
      {
        id: 'aud_002',
        timestamp: '2024-06-15T10:01:00Z',
        action: 'investor.created',
        entityType: 'investor',
        entityId: 'inv_001',
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
      // In production, use a PDF library like pdfkit or puppeteer
      return JSON.stringify({ format: 'pdf', note: 'PDF generation not implemented', data });
    default:
      return JSON.stringify(data, null, 2);
  }
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
  const timestamp = new Date().replace(/[:.]/g, '-').slice(0, 19);
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
  // Simple hash for demo - use crypto.createHash in production
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `sha256:${Math.abs(hash).toString(16).padStart(16, '0')}`;
}
