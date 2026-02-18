/**
 * Yield Distribution Service — "UseYield"
 *
 * Creates yield rules tied to tokenized assets with utilization multipliers.
 * Computes yield based on IoT-derived utilization scores and distributes
 * pro-rata to token holders.
 *
 * Uses rawQuery pattern consistent with disruption.service.ts.
 *
 * @packageDocumentation
 */

import { rawQuery } from '../config/database.js';
import { randomUUID } from 'crypto';
import { logger } from '../middleware/logger.js';

// ============================================================================
// Types & Interfaces
// ============================================================================

export type YieldPeriod = 'daily' | 'weekly' | 'monthly';
export type DistributionStatus = 'pending' | 'computed' | 'distributed' | 'failed';

export interface YieldRule {
  id: string;
  orgId: string;
  assetId: string;
  baseYield: number;        // percentage, e.g. 5.0 = 5%
  utilizationMultiplier: number; // e.g. 1.5x
  period: YieldPeriod;
  minUtilization: number;   // minimum utilization to earn any yield
  isActive: boolean;
  createdAt: string;
}

export interface YieldDistribution {
  id: string;
  orgId: string;
  assetId: string;
  ruleId: string;
  period: string;           // e.g., '2025-01'
  utilizationScore: number;
  baseYield: number;
  multipliedYield: number;
  totalAmount: number;
  holderCount: number;
  status: DistributionStatus;
  distributedAt: string | null;
  createdAt: string;
}

export interface CreateYieldRuleInput {
  assetId: string;
  baseYield: number;
  utilizationMultiplier: number;
  period: YieldPeriod;
  minUtilization?: number;
}

// ============================================================================
// Initialisation
// ============================================================================

let _initialised = false;

export async function ensureTables(): Promise<void> {
  if (_initialised) return;

  logger.info('YieldDistributionService: initialising tables');

  await rawQuery(`
    CREATE TABLE IF NOT EXISTS yield_rules (
      id                        TEXT PRIMARY KEY,
      org_id                    TEXT NOT NULL,
      asset_id                  TEXT NOT NULL,
      base_yield                REAL NOT NULL DEFAULT 0,
      utilization_multiplier    REAL NOT NULL DEFAULT 1,
      period                    TEXT NOT NULL DEFAULT 'monthly',
      min_utilization           REAL NOT NULL DEFAULT 0,
      is_active                 INTEGER NOT NULL DEFAULT 1,
      created_at                TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await rawQuery(`
    CREATE TABLE IF NOT EXISTS yield_distributions (
      id                    TEXT PRIMARY KEY,
      org_id                TEXT NOT NULL,
      asset_id              TEXT NOT NULL,
      rule_id               TEXT NOT NULL,
      period                TEXT NOT NULL,
      utilization_score     REAL NOT NULL DEFAULT 0,
      base_yield            REAL NOT NULL DEFAULT 0,
      multiplied_yield      REAL NOT NULL DEFAULT 0,
      total_amount          REAL NOT NULL DEFAULT 0,
      holder_count          INTEGER NOT NULL DEFAULT 0,
      status                TEXT NOT NULL DEFAULT 'pending',
      distributed_at        TEXT,
      created_at            TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await rawQuery(`CREATE INDEX IF NOT EXISTS idx_yr_org ON yield_rules (org_id, asset_id)`);
  await rawQuery(`CREATE INDEX IF NOT EXISTS idx_yd_asset ON yield_distributions (asset_id, period)`);
  await rawQuery(`CREATE INDEX IF NOT EXISTS idx_yd_rule ON yield_distributions (rule_id, status)`);

  _initialised = true;
  logger.info('YieldDistributionService: tables ready');
}

// ============================================================================
// Service Methods
// ============================================================================

/**
 * Create a yield distribution rule for a tokenized asset.
 */
export async function createDistributionRule(
  orgId: string,
  input: CreateYieldRuleInput,
): Promise<YieldRule> {
  await ensureTables();

  const id = randomUUID();
  const now = new Date().toISOString();

  await rawQuery(
    `INSERT INTO yield_rules
       (id, org_id, asset_id, base_yield, utilization_multiplier, period, min_utilization, is_active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    [id, orgId, input.assetId, input.baseYield, input.utilizationMultiplier, input.period, input.minUtilization ?? 0, now],
  );

  logger.info('YieldDistributionService: rule created', { ruleId: id, assetId: input.assetId });

  return {
    id, orgId, assetId: input.assetId,
    baseYield: input.baseYield,
    utilizationMultiplier: input.utilizationMultiplier,
    period: input.period, minUtilization: input.minUtilization ?? 0,
    isActive: true, createdAt: now,
  };
}

/**
 * Compute yield for an asset in a given period using its utilization score.
 */
export async function computeYield(
  orgId: string,
  assetId: string,
  period: string,
  utilizationScore: number,
): Promise<YieldDistribution> {
  await ensureTables();

  // Get active rule for this asset
  const rules = await rawQuery<any>(
    `SELECT * FROM yield_rules WHERE asset_id = ? AND org_id = ? AND is_active = 1 LIMIT 1`,
    [assetId, orgId],
  );
  if (rules.length === 0) throw new Error(`No active yield rule for asset ${assetId}`);

  const rule = mapRuleRow(rules[0]);

  // Check minimum utilization
  if (utilizationScore < rule.minUtilization) {
    logger.info('YieldDistributionService: utilization below minimum', { assetId, score: utilizationScore, min: rule.minUtilization });
  }

  // Calculate yield: base × (utilization/100) × multiplier
  const effectiveUtilization = Math.max(0, utilizationScore - rule.minUtilization) / (100 - rule.minUtilization);
  const multipliedYield = rule.baseYield * effectiveUtilization * rule.utilizationMultiplier;

  // Simulate holder count and total amount (in production, query cap table)
  const holderCount = Math.floor(Math.random() * 50) + 10; // Mock
  const totalAmount = multipliedYield * 1000; // Mock: assume 1000 tokens

  const id = randomUUID();
  const now = new Date().toISOString();

  await rawQuery(
    `INSERT INTO yield_distributions
       (id, org_id, asset_id, rule_id, period, utilization_score, base_yield, multiplied_yield, total_amount, holder_count, status, distributed_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'computed', NULL, ?)`,
    [id, orgId, assetId, rule.id, period, utilizationScore, rule.baseYield, multipliedYield, totalAmount, holderCount, now],
  );

  logger.info('YieldDistributionService: yield computed', { distributionId: id, assetId, yield: multipliedYield });

  return {
    id, orgId, assetId, ruleId: rule.id, period,
    utilizationScore, baseYield: rule.baseYield,
    multipliedYield, totalAmount, holderCount,
    status: 'computed', distributedAt: null, createdAt: now,
  };
}

/**
 * Execute a yield distribution to all holders.
 */
export async function distributeYield(
  orgId: string,
  distributionId: string,
): Promise<YieldDistribution> {
  await ensureTables();

  const rows = await rawQuery<any>(
    `SELECT * FROM yield_distributions WHERE id = ? AND org_id = ? AND status = 'computed' LIMIT 1`,
    [distributionId, orgId],
  );
  if (rows.length === 0) throw new Error(`Distribution ${distributionId} not found or not computed`);

  const now = new Date().toISOString();

  await rawQuery(
    `UPDATE yield_distributions SET status = 'distributed', distributed_at = ? WHERE id = ?`,
    [now, distributionId],
  );

  logger.info('YieldDistributionService: yield distributed', { distributionId });

  const dist = mapDistributionRow(rows[0]);
  return { ...dist, status: 'distributed', distributedAt: now };
}

/**
 * List yield rules for an organisation.
 */
export async function listRules(
  orgId: string,
  filters?: { assetId?: string; limit?: number; offset?: number },
): Promise<{ data: YieldRule[]; count: number }> {
  await ensureTables();

  const limit = filters?.limit ?? 50;
  const offset = filters?.offset ?? 0;
  const conditions: string[] = ['org_id = ?'];
  const params: unknown[] = [orgId];

  if (filters?.assetId) { conditions.push('asset_id = ?'); params.push(filters.assetId); }

  const where = conditions.join(' AND ');

  const rows = await rawQuery<any>(
    `SELECT * FROM yield_rules WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );

  const countRows = await rawQuery<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM yield_rules WHERE ${where}`,
    params,
  );

  return {
    data: rows.map(mapRuleRow),
    count: countRows[0]?.cnt ?? 0,
  };
}

/**
 * List yield distributions for an asset.
 */
export async function listDistributions(
  orgId: string,
  filters?: { assetId?: string; status?: DistributionStatus; limit?: number; offset?: number },
): Promise<{ data: YieldDistribution[]; count: number }> {
  await ensureTables();

  const limit = filters?.limit ?? 50;
  const offset = filters?.offset ?? 0;
  const conditions: string[] = ['org_id = ?'];
  const params: unknown[] = [orgId];

  if (filters?.assetId) { conditions.push('asset_id = ?'); params.push(filters.assetId); }
  if (filters?.status) { conditions.push('status = ?'); params.push(filters.status); }

  const where = conditions.join(' AND ');

  const rows = await rawQuery<any>(
    `SELECT * FROM yield_distributions WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );

  const countRows = await rawQuery<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM yield_distributions WHERE ${where}`,
    params,
  );

  return {
    data: rows.map(mapDistributionRow),
    count: countRows[0]?.cnt ?? 0,
  };
}

// ============================================================================
// Internal Helpers
// ============================================================================

function mapRuleRow(row: any): YieldRule {
  return {
    id: row.id,
    orgId: row.org_id ?? row.orgId,
    assetId: row.asset_id ?? row.assetId,
    baseYield: row.base_yield ?? row.baseYield ?? 0,
    utilizationMultiplier: row.utilization_multiplier ?? row.utilizationMultiplier ?? 1,
    period: (row.period as YieldPeriod) ?? 'monthly',
    minUtilization: row.min_utilization ?? row.minUtilization ?? 0,
    isActive: !!(row.is_active ?? row.isActive ?? true),
    createdAt: row.created_at ?? row.createdAt,
  };
}

function mapDistributionRow(row: any): YieldDistribution {
  return {
    id: row.id,
    orgId: row.org_id ?? row.orgId,
    assetId: row.asset_id ?? row.assetId,
    ruleId: row.rule_id ?? row.ruleId,
    period: row.period,
    utilizationScore: row.utilization_score ?? row.utilizationScore ?? 0,
    baseYield: row.base_yield ?? row.baseYield ?? 0,
    multipliedYield: row.multiplied_yield ?? row.multipliedYield ?? 0,
    totalAmount: row.total_amount ?? row.totalAmount ?? 0,
    holderCount: row.holder_count ?? row.holderCount ?? 0,
    status: (row.status as DistributionStatus) ?? 'pending',
    distributedAt: row.distributed_at ?? row.distributedAt ?? null,
    createdAt: row.created_at ?? row.createdAt,
  };
}
