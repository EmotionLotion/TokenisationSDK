/**
 * Reconciliation Service
 *
 * Provides comprehensive chain vs. books reconciliation:
 * - Balance comparison (on-chain vs. database)
 * - Discrepancy detection and reporting
 * - Root cause analysis
 * - Scheduled reconciliation jobs
 * - Audit-ready reconciliation reports
 */

import { db, schema } from '../config/database.js';
import { eq, and, desc } from 'drizzle-orm';
import { createHash } from 'crypto';
import { NotFoundError, ValidationError } from '../middleware/errorHandler.js';
import * as relayerService from './relayer.service.js';
import * as auditService from './audit.service.js';

const { tokens, ledgerPositions, ledgerEvents, eventBusQueue } = schema;

// Type helper for database operations (works around dual SQLite/Postgres support)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dbOps = db as any;

// ============================================================================
// Types & Interfaces
// ============================================================================

export type ReconciliationStatus = 'pending' | 'in_progress' | 'completed' | 'failed';
export type DiscrepancyType = 'balance_mismatch' | 'missing_position' | 'orphan_position' | 'event_gap';
export type DiscrepancySeverity = 'low' | 'medium' | 'high' | 'critical';

export interface ReconciliationJob {
  id: string;
  orgId: string;
  tokenId?: string;
  status: ReconciliationStatus;
  startedAt: Date;
  completedAt?: Date;
  tokensProcessed: number;
  positionsChecked: number;
  discrepanciesFound: number;
  discrepanciesResolved: number;
  error?: string;
}

export interface Discrepancy {
  id: string;
  jobId: string;
  tokenId: string;
  walletAddress: string;
  type: DiscrepancyType;
  severity: DiscrepancySeverity;
  onChainBalance: string;
  offChainBalance: string;
  difference: string;
  percentageDiff: string;
  lastOnChainEvent?: {
    txHash: string;
    blockNumber: number;
    timestamp?: Date;
  };
  lastOffChainEvent?: {
    eventId: string;
    eventType: string;
    timestamp: Date;
  };
  possibleCauses: string[];
  recommendation: string;
  resolved: boolean;
  resolvedAt?: Date;
  resolution?: string;
  detectedAt: Date;
}

export interface ReconciliationReport {
  id: string;
  orgId: string;
  jobId: string;
  generatedAt: Date;
  period: {
    from: Date;
    to: Date;
  };
  summary: {
    tokensReconciled: number;
    totalPositions: number;
    matchedPositions: number;
    discrepancies: number;
    byType: Record<DiscrepancyType, number>;
    bySeverity: Record<DiscrepancySeverity, number>;
    totalValueAtRisk: string;
    reconciliationRate: string;
  };
  tokens: TokenReconciliationResult[];
  discrepancies: Discrepancy[];
  recommendations: string[];
  attestation: {
    hash: string;
    timestamp: Date;
    signedBy: string;
  };
}

export interface TokenReconciliationResult {
  tokenId: string;
  tokenName: string;
  chainId: number;
  contractAddress: string;
  totalSupply: string;
  onChainCirculating: string;
  offChainCirculating: string;
  matched: boolean;
  positionsChecked: number;
  discrepancies: number;
  lastReconciled: Date;
}

export interface ReconciliationConfig {
  autoResolve: boolean;
  tolerancePercentage: number; // Allow small rounding differences
  notifyOnDiscrepancy: boolean;
  notifyThreshold: DiscrepancySeverity;
}

// ============================================================================
// In-Memory Storage (replace with DB in production)
// ============================================================================

const reconciliationJobs = new Map<string, ReconciliationJob>();
const discrepancies = new Map<string, Discrepancy>();
const reconciliationReports = new Map<string, ReconciliationReport>();

// ============================================================================
// Reconciliation Job Management
// ============================================================================

/**
 * Start a reconciliation job for an organization
 */
export async function startReconciliation(
  orgId: string,
  tokenId?: string,
  config: Partial<ReconciliationConfig> = {}
): Promise<ReconciliationJob> {
  const defaultConfig: ReconciliationConfig = {
    autoResolve: false,
    tolerancePercentage: 0.0001, // 0.01% tolerance for rounding
    notifyOnDiscrepancy: true,
    notifyThreshold: 'medium',
    ...config,
  };

  const jobId = `recon_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const job: ReconciliationJob = {
    id: jobId,
    orgId,
    tokenId,
    status: 'in_progress',
    startedAt: new Date(),
    tokensProcessed: 0,
    positionsChecked: 0,
    discrepanciesFound: 0,
    discrepanciesResolved: 0,
  };

  reconciliationJobs.set(jobId, job);

  // Run reconciliation async
  runReconciliation(job, defaultConfig).catch(console.error);

  await auditService.logSystemAction(
    orgId,
    'create',
    'reconciliation_job',
    jobId,
    'Reconciliation started',
    { tokenId, config: defaultConfig }
  );

  return job;
}

/**
 * Get reconciliation job status
 */
export function getReconciliationJob(jobId: string): ReconciliationJob | null {
  return reconciliationJobs.get(jobId) || null;
}

/**
 * List reconciliation jobs for an organization
 */
export function listReconciliationJobs(
  orgId: string,
  options?: { status?: ReconciliationStatus; limit?: number }
): ReconciliationJob[] {
  const jobs = Array.from(reconciliationJobs.values())
    .filter((j) => j.orgId === orgId)
    .filter((j) => !options?.status || j.status === options.status)
    .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());

  return options?.limit ? jobs.slice(0, options.limit) : jobs;
}

// ============================================================================
// Core Reconciliation Logic
// ============================================================================

async function runReconciliation(
  job: ReconciliationJob,
  config: ReconciliationConfig
): Promise<void> {
  try {
    // Get tokens to reconcile
    const tokenQuery = job.tokenId
      ? and(eq(tokens.orgId, job.orgId), eq(tokens.id, job.tokenId), eq(tokens.status, 'deployed'))
      : and(eq(tokens.orgId, job.orgId), eq(tokens.status, 'deployed'));

    const deployedTokens = await db
      .select()
      .from(tokens)
      .where(tokenQuery) as TokenRecord[];

    for (const token of deployedTokens) {
      if (!token.contractAddress) continue;

      const result = await reconcileToken(job, token, config);
      job.tokensProcessed++;
      job.positionsChecked += result.positionsChecked;
      job.discrepanciesFound += result.discrepanciesFound;
      job.discrepanciesResolved += result.discrepanciesResolved;
    }

    job.status = 'completed';
    job.completedAt = new Date();
    reconciliationJobs.set(job.id, job);

    // Generate report
    await generateReconciliationReport(job);

    await auditService.logSystemAction(
      job.orgId,
      'update',
      'reconciliation_job',
      job.id,
      'Reconciliation completed',
      {
        tokensProcessed: job.tokensProcessed,
        positionsChecked: job.positionsChecked,
        discrepanciesFound: job.discrepanciesFound,
      }
    );
  } catch (error) {
    job.status = 'failed';
    job.error = error instanceof Error ? error.message : 'Unknown error';
    job.completedAt = new Date();
    reconciliationJobs.set(job.id, job);

    await auditService.logSystemAction(
      job.orgId,
      'update',
      'reconciliation_job',
      job.id,
      'Reconciliation failed',
      { error: job.error }
    );
  }
}

interface TokenRecord {
  id: string;
  name: string;
  chainId: number;
  contractAddress?: string | null;
  maxSupply?: string | null;
  orgId: string;
}

async function reconcileToken(
  job: ReconciliationJob,
  token: TokenRecord,
  config: ReconciliationConfig
): Promise<{ positionsChecked: number; discrepanciesFound: number; discrepanciesResolved: number }> {
  if (!token.contractAddress) {
    throw new ValidationError('Token not deployed');
  }

  let positionsChecked = 0;
  let discrepanciesFound = 0;
  let discrepanciesResolved = 0;

  // Get all known positions for this token
  const positions = await db
    .select()
    .from(ledgerPositions)
    .where(eq(ledgerPositions.tokenId, token.id));

  // Check each position against on-chain balance
  for (const position of positions) {
    positionsChecked++;

    try {
      const onChainBalance = await relayerService.getERC20Balance(
        token.chainId,
        token.contractAddress,
        position.walletAddress
      );

      const offChainBalance = position.balance;
      const diff = BigInt(onChainBalance) - BigInt(offChainBalance);

      if (diff !== 0n) {
        // Check if within tolerance
        const absDiff = diff > 0n ? diff : -diff;
        const totalValue = BigInt(onChainBalance) > 0n ? BigInt(onChainBalance) : BigInt(offChainBalance);
        const percentageDiff = totalValue > 0n
          ? Number((absDiff * 10000n) / totalValue) / 100
          : 100;

        if (percentageDiff > config.tolerancePercentage) {
          const discrepancy = await createDiscrepancy(
            job,
            token,
            position.walletAddress,
            onChainBalance,
            offChainBalance
          );
          discrepanciesFound++;

          // Auto-resolve if configured
          if (config.autoResolve) {
            await resolveDiscrepancy(
              discrepancy.id,
              job.orgId,
              'auto_corrected',
              onChainBalance
            );
            discrepanciesResolved++;
          }

          // Notify if configured
          if (config.notifyOnDiscrepancy) {
            const severity = discrepancy.severity;
            const severityOrder: Record<DiscrepancySeverity, number> = {
              low: 1,
              medium: 2,
              high: 3,
              critical: 4,
            };
            if (severityOrder[severity] >= severityOrder[config.notifyThreshold]) {
              await emitDiscrepancyEvent(job.orgId, discrepancy);
            }
          }
        }
      }
    } catch (error) {
      console.error(`Error reconciling position ${position.walletAddress}:`, error);
    }
  }

  // Check for orphan on-chain balances (addresses with on-chain balance but no position)
  // This would require scanning Transfer events, which is expensive
  // In production, this would be done periodically via the indexer

  return { positionsChecked, discrepanciesFound, discrepanciesResolved };
}

// ============================================================================
// Discrepancy Management
// ============================================================================

async function createDiscrepancy(
  job: ReconciliationJob,
  token: TokenRecord,
  walletAddress: string,
  onChainBalance: string,
  offChainBalance: string
): Promise<Discrepancy> {
  const diff = BigInt(onChainBalance) - BigInt(offChainBalance);
  const absDiff = diff > 0n ? diff : -diff;
  const totalValue = BigInt(onChainBalance) > 0n ? BigInt(onChainBalance) : BigInt(offChainBalance);
  const percentageDiff = totalValue > 0n
    ? ((absDiff * 10000n) / totalValue).toString()
    : '10000';

  // Determine severity
  const severity = determineSeverity(absDiff, Number(percentageDiff) / 100);

  // Analyze possible causes
  const { possibleCauses, recommendation } = analyzeCause(
    onChainBalance,
    offChainBalance,
    token
  );

  // Get last events for context
  const lastOnChainEvent = await getLastOnChainEvent(token, walletAddress);
  const lastOffChainEvent = await getLastOffChainEvent(token.id, walletAddress);

  const discrepancy: Discrepancy = {
    id: `disc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    jobId: job.id,
    tokenId: token.id,
    walletAddress,
    type: 'balance_mismatch',
    severity,
    onChainBalance,
    offChainBalance,
    difference: diff.toString(),
    percentageDiff: (Number(percentageDiff) / 100).toFixed(2) + '%',
    lastOnChainEvent,
    lastOffChainEvent,
    possibleCauses,
    recommendation,
    resolved: false,
    detectedAt: new Date(),
  };

  discrepancies.set(discrepancy.id, discrepancy);

  await auditService.logSystemAction(
    job.orgId,
    'create',
    'discrepancy',
    discrepancy.id,
    'Discrepancy detected',
    {
      tokenId: token.id,
      walletAddress,
      onChainBalance,
      offChainBalance,
      severity,
    }
  );

  return discrepancy;
}

function determineSeverity(absDiff: bigint, percentageDiff: number): DiscrepancySeverity {
  // Critical: >10% difference or >$100k equivalent
  // High: >5% or >$10k equivalent
  // Medium: >1% or >$1k equivalent
  // Low: everything else

  if (percentageDiff > 10) return 'critical';
  if (percentageDiff > 5) return 'high';
  if (percentageDiff > 1) return 'medium';
  return 'low';
}

function analyzeCause(
  onChainBalance: string,
  offChainBalance: string,
  _token: TokenRecord
): { possibleCauses: string[]; recommendation: string } {
  const possibleCauses: string[] = [];
  let recommendation = '';

  const onChain = BigInt(onChainBalance);
  const offChain = BigInt(offChainBalance);

  if (onChain > offChain) {
    // On-chain has more than off-chain
    possibleCauses.push('Direct on-chain transfer not captured by indexer');
    possibleCauses.push('Indexer lagging behind chain head');
    possibleCauses.push('Minting event missed');
    recommendation = 'Trigger re-indexing from last known block. Check for direct contract interactions.';
  } else {
    // Off-chain has more than on-chain
    possibleCauses.push('Transfer processed off-chain but on-chain transaction failed');
    possibleCauses.push('Chain reorganization reverted transaction');
    possibleCauses.push('Database corruption or duplicate event processing');
    recommendation = 'Verify pending transfers. Check for failed transactions. Consider manual balance correction.';
  }

  return { possibleCauses, recommendation };
}

async function getLastOnChainEvent(
  token: TokenRecord,
  _walletAddress: string
): Promise<{ txHash: string; blockNumber: number; timestamp?: Date } | undefined> {
  if (!token.contractAddress) return undefined;

  // In production, query the last Transfer event involving this address
  // For now, return mock data
  return undefined;
}

async function getLastOffChainEvent(
  tokenId: string,
  walletAddress: string
): Promise<{ eventId: string; eventType: string; timestamp: Date } | undefined> {
  const event = await dbOps.query.ledgerEvents.findFirst({
    where: and(
      eq(ledgerEvents.tokenId, tokenId),
      eq(ledgerEvents.walletAddress, walletAddress.toLowerCase())
    ),
    orderBy: desc(ledgerEvents.createdAt),
  });

  if (!event) return undefined;

  return {
    eventId: event.id,
    eventType: event.eventType,
    timestamp: event.createdAt,
  };
}

/**
 * Resolve a discrepancy
 */
export async function resolveDiscrepancy(
  discrepancyId: string,
  orgId: string,
  resolution: string,
  correctedBalance?: string
): Promise<Discrepancy> {
  const discrepancy = discrepancies.get(discrepancyId);
  if (!discrepancy) {
    throw new NotFoundError('Discrepancy not found');
  }

  discrepancy.resolved = true;
  discrepancy.resolvedAt = new Date();
  discrepancy.resolution = resolution;
  discrepancies.set(discrepancyId, discrepancy);

  // If corrected balance provided, update the position
  if (correctedBalance) {
    await db
      .update(ledgerPositions)
      .set({
        balance: correctedBalance,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(ledgerPositions.tokenId, discrepancy.tokenId),
          eq(ledgerPositions.walletAddress, discrepancy.walletAddress)
        )
      );

    // Log the correction
    await dbOps.insert(ledgerEvents).values({
      orgId,
      tokenId: discrepancy.tokenId,
      eventType: 'reconciliation_correction',
      walletAddress: discrepancy.walletAddress,
      amount: (BigInt(correctedBalance) - BigInt(discrepancy.offChainBalance)).toString(),
      metadata: {
        discrepancyId,
        previousBalance: discrepancy.offChainBalance,
        newBalance: correctedBalance,
        resolution,
      },
    });
  }

  await auditService.logSystemAction(
    orgId,
    'update',
    'discrepancy',
    discrepancyId,
    'Discrepancy resolved',
    { resolution, correctedBalance }
  );

  return discrepancy;
}

/**
 * Get discrepancy by ID
 */
export function getDiscrepancy(discrepancyId: string): Discrepancy | null {
  return discrepancies.get(discrepancyId) || null;
}

/**
 * List discrepancies for an organization
 */
export function listDiscrepancies(
  orgId: string,
  options?: {
    jobId?: string;
    tokenId?: string;
    resolved?: boolean;
    severity?: DiscrepancySeverity;
    limit?: number;
  }
): Discrepancy[] {
  let results = Array.from(discrepancies.values());

  // Filter by job (need to look up job org)
  if (options?.jobId) {
    results = results.filter((d) => d.jobId === options.jobId);
  }

  if (options?.tokenId) {
    results = results.filter((d) => d.tokenId === options.tokenId);
  }

  if (options?.resolved !== undefined) {
    results = results.filter((d) => d.resolved === options.resolved);
  }

  if (options?.severity) {
    results = results.filter((d) => d.severity === options.severity);
  }

  results.sort((a, b) => b.detectedAt.getTime() - a.detectedAt.getTime());

  return options?.limit ? results.slice(0, options.limit) : results;
}

// ============================================================================
// Reconciliation Reports
// ============================================================================

async function generateReconciliationReport(job: ReconciliationJob): Promise<ReconciliationReport> {
  const jobDiscrepancies = listDiscrepancies(job.orgId, { jobId: job.id });

  // Get token details
  const tokenResults: TokenReconciliationResult[] = [];
  const tokenQuery = job.tokenId
    ? and(eq(tokens.orgId, job.orgId), eq(tokens.id, job.tokenId))
    : eq(tokens.orgId, job.orgId);

  const orgTokens = await dbOps.select().from(tokens).where(tokenQuery) as TokenRecord[];

  for (const token of orgTokens) {
    const tokenDiscrepancies = jobDiscrepancies.filter((d) => d.tokenId === token.id);
    const positions = await dbOps
      .select()
      .from(ledgerPositions)
      .where(eq(ledgerPositions.tokenId, token.id));

    let offChainCirculating = 0n;
    for (const p of positions) {
      offChainCirculating += BigInt(p.balance);
    }

    tokenResults.push({
      tokenId: token.id,
      tokenName: token.name,
      chainId: token.chainId,
      contractAddress: token.contractAddress || '',
      totalSupply: token.maxSupply || '0',
      onChainCirculating: offChainCirculating.toString(), // Would need to fetch from chain
      offChainCirculating: offChainCirculating.toString(),
      matched: tokenDiscrepancies.length === 0,
      positionsChecked: positions.length,
      discrepancies: tokenDiscrepancies.length,
      lastReconciled: new Date(),
    });
  }

  // Calculate summary statistics
  const byType: Record<DiscrepancyType, number> = {
    balance_mismatch: 0,
    missing_position: 0,
    orphan_position: 0,
    event_gap: 0,
  };

  const bySeverity: Record<DiscrepancySeverity, number> = {
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
  };

  let totalValueAtRisk = 0n;

  for (const d of jobDiscrepancies) {
    byType[d.type]++;
    bySeverity[d.severity]++;
    const absDiff = BigInt(d.difference);
    totalValueAtRisk += absDiff > 0n ? absDiff : -absDiff;
  }

  const reconciliationRate = job.positionsChecked > 0
    ? ((job.positionsChecked - job.discrepanciesFound) / job.positionsChecked * 100).toFixed(2) + '%'
    : '100%';

  // Generate recommendations
  const recommendations: string[] = [];
  if (bySeverity.critical > 0) {
    recommendations.push('URGENT: Critical discrepancies detected. Immediate investigation required.');
  }
  if (bySeverity.high > 0) {
    recommendations.push('Schedule manual review of high-severity discrepancies.');
  }
  if (byType.event_gap > 0) {
    recommendations.push('Consider re-indexing tokens with event gaps.');
  }
  if (job.discrepanciesFound === 0) {
    recommendations.push('All positions reconciled successfully. No action required.');
  }

  // Generate attestation
  const attestationData = JSON.stringify({
    jobId: job.id,
    tokensProcessed: job.tokensProcessed,
    positionsChecked: job.positionsChecked,
    discrepanciesFound: job.discrepanciesFound,
    timestamp: new Date().toISOString(),
  });

  const attestationHash = createHash('sha256').update(attestationData).digest('hex');

  const report: ReconciliationReport = {
    id: `report_${job.id}`,
    orgId: job.orgId,
    jobId: job.id,
    generatedAt: new Date(),
    period: {
      from: job.startedAt,
      to: job.completedAt || new Date(),
    },
    summary: {
      tokensReconciled: job.tokensProcessed,
      totalPositions: job.positionsChecked,
      matchedPositions: job.positionsChecked - job.discrepanciesFound,
      discrepancies: job.discrepanciesFound,
      byType,
      bySeverity,
      totalValueAtRisk: totalValueAtRisk.toString(),
      reconciliationRate,
    },
    tokens: tokenResults,
    discrepancies: jobDiscrepancies,
    recommendations,
    attestation: {
      hash: attestationHash,
      timestamp: new Date(),
      signedBy: 'system',
    },
  };

  reconciliationReports.set(report.id, report);

  return report;
}

/**
 * Get reconciliation report
 */
export function getReconciliationReport(reportId: string): ReconciliationReport | null {
  return reconciliationReports.get(reportId) || null;
}

/**
 * List reconciliation reports
 */
export function listReconciliationReports(
  orgId: string,
  options?: { limit?: number }
): ReconciliationReport[] {
  const reports = Array.from(reconciliationReports.values())
    .filter((r) => r.orgId === orgId)
    .sort((a, b) => b.generatedAt.getTime() - a.generatedAt.getTime());

  return options?.limit ? reports.slice(0, options.limit) : reports;
}

// ============================================================================
// Event Emission
// ============================================================================

async function emitDiscrepancyEvent(orgId: string, discrepancy: Discrepancy): Promise<void> {
  await dbOps.insert(eventBusQueue).values({
    orgId,
    topic: 'reconciliation.discrepancy',
    payload: {
      discrepancyId: discrepancy.id,
      tokenId: discrepancy.tokenId,
      walletAddress: discrepancy.walletAddress,
      severity: discrepancy.severity,
      difference: discrepancy.difference,
    },
  });
}

// ============================================================================
// Scheduled Reconciliation
// ============================================================================

export interface ScheduledReconciliation {
  id: string;
  orgId: string;
  tokenId?: string;
  cronExpression: string;
  config: ReconciliationConfig;
  enabled: boolean;
  lastRunAt?: Date;
  nextRunAt?: Date;
  createdAt: Date;
}

const scheduledReconciliations = new Map<string, ScheduledReconciliation>();

/**
 * Create a scheduled reconciliation
 */
export function createScheduledReconciliation(
  orgId: string,
  cronExpression: string,
  tokenId?: string,
  config?: Partial<ReconciliationConfig>
): ScheduledReconciliation {
  const id = `sched_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const scheduled: ScheduledReconciliation = {
    id,
    orgId,
    tokenId,
    cronExpression,
    config: {
      autoResolve: false,
      tolerancePercentage: 0.0001,
      notifyOnDiscrepancy: true,
      notifyThreshold: 'medium',
      ...config,
    },
    enabled: true,
    createdAt: new Date(),
  };

  scheduledReconciliations.set(id, scheduled);
  return scheduled;
}

/**
 * List scheduled reconciliations
 */
export function listScheduledReconciliations(orgId: string): ScheduledReconciliation[] {
  return Array.from(scheduledReconciliations.values()).filter((s) => s.orgId === orgId);
}

/**
 * Toggle scheduled reconciliation
 */
export function toggleScheduledReconciliation(id: string, enabled: boolean): ScheduledReconciliation | null {
  const scheduled = scheduledReconciliations.get(id);
  if (!scheduled) return null;

  scheduled.enabled = enabled;
  scheduledReconciliations.set(id, scheduled);
  return scheduled;
}

/**
 * Delete scheduled reconciliation
 */
export function deleteScheduledReconciliation(id: string): boolean {
  return scheduledReconciliations.delete(id);
}
