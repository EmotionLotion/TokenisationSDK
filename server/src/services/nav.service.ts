/**
 * NAV (Net Asset Value) Service
 *
 * Provides NAV calculation, storage, and retrieval for tokenised assets:
 * - Stores NAV history in a `nav_history` table (raw SQL, not in Drizzle schema)
 * - Stores valuation sources in a `valuation_sources` table
 * - Processes callbacks from the CRE NAV calculation workflow
 * - Supports manual valuation overrides
 *
 * @packageDocumentation
 */

import { randomUUID } from 'crypto';
import { rawQuery, execStatement } from '../config/database.js';
import { logger } from '../middleware/logger.js';

// ============================================================================
// TYPES
// ============================================================================

export interface NAVRecord {
  id: string;
  orgId: string;
  assetId: string;
  navPerToken: string;
  totalAssetValue: string;
  liabilities: string;
  netAssetValue: string;
  totalSupply: string;
  currency: string;
  decimals: number;
  source: 'cre_workflow' | 'manual' | 'api';
  txHash: string | null;
  computedAt: string;
  createdAt: string;
}

export interface ValuationSource {
  id: string;
  orgId: string;
  assetId: string;
  navRecordId: string;
  sourceName: string;
  value: string;
  weight: number;
  timestamp: number;
  createdAt: string;
}

export interface NAVHistoryQuery {
  page?: number;
  limit?: number;
  from?: string;
  to?: string;
  source?: 'cre_workflow' | 'manual' | 'api';
}

export interface ManualValuationInput {
  totalAssetValue: string;
  liabilities?: string;
  currency?: string;
  decimals?: number;
  reason?: string;
  sources?: Array<{
    name: string;
    value: string;
    weight: number;
  }>;
}

export interface CRECallbackPayload {
  assetId: string;
  navPerToken: string;
  totalAssetValue: string;
  liabilities: string;
  netAssetValue: string;
  totalSupply: string;
  currency: string;
  decimals: number;
  valuationSources: Array<{
    name: string;
    value: string;
    weight: number;
    timestamp: number;
  }>;
  computedAt: string;
  txHash?: string;
}

// ============================================================================
// SCHEMA INITIALISATION
// ============================================================================

let tablesInitialised = false;

/**
 * Ensure the nav_history and valuation_sources tables exist.
 * Called lazily on first service method invocation.
 */
async function ensureTables(): Promise<void> {
  if (tablesInitialised) return;

  try {
    await execStatement(`
      CREATE TABLE IF NOT EXISTS nav_history (
        id TEXT PRIMARY KEY,
        org_id TEXT NOT NULL,
        asset_id TEXT NOT NULL,
        nav_per_token TEXT NOT NULL,
        total_asset_value TEXT NOT NULL,
        liabilities TEXT NOT NULL DEFAULT '0',
        net_asset_value TEXT NOT NULL,
        total_supply TEXT NOT NULL,
        currency TEXT NOT NULL DEFAULT 'USD',
        decimals INTEGER NOT NULL DEFAULT 18,
        source TEXT NOT NULL DEFAULT 'cre_workflow',
        tx_hash TEXT,
        computed_at TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await execStatement(`
      CREATE INDEX IF NOT EXISTS idx_nav_history_asset
        ON nav_history(asset_id, computed_at)
    `);

    await execStatement(`
      CREATE INDEX IF NOT EXISTS idx_nav_history_org_asset
        ON nav_history(org_id, asset_id)
    `);

    await execStatement(`
      CREATE TABLE IF NOT EXISTS valuation_sources (
        id TEXT PRIMARY KEY,
        org_id TEXT NOT NULL,
        asset_id TEXT NOT NULL,
        nav_record_id TEXT NOT NULL REFERENCES nav_history(id) ON DELETE CASCADE,
        source_name TEXT NOT NULL,
        value TEXT NOT NULL,
        weight REAL NOT NULL DEFAULT 1.0,
        timestamp INTEGER NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await execStatement(`
      CREATE INDEX IF NOT EXISTS idx_valuation_sources_nav_record
        ON valuation_sources(nav_record_id)
    `);

    tablesInitialised = true;
    logger.info('NAV service tables initialised');
  } catch (error) {
    logger.error('Failed to initialise NAV tables', { error: error as Error });
    throw error;
  }
}

// ============================================================================
// SERVICE METHODS
// ============================================================================

/**
 * Calculate NAV from raw inputs and persist the result.
 * Used for server-side calculation (as opposed to CRE-originated results).
 */
export async function calculateNAV(
  orgId: string,
  assetId: string,
  input: ManualValuationInput
): Promise<NAVRecord> {
  await ensureTables();

  const id = randomUUID();
  const now = new Date().toISOString();
  const decimals = input.decimals ?? 18;
  const currency = input.currency ?? 'USD';
  const liabilities = input.liabilities ?? '0';

  // Read current total supply from the most recent NAV record (fallback to '0')
  const latestRows = await rawQuery<{ total_supply: string }>(
    `SELECT total_supply FROM nav_history
     WHERE org_id = $1 AND asset_id = $2
     ORDER BY computed_at DESC LIMIT 1`,
    [orgId, assetId]
  );
  const totalSupply = latestRows[0]?.total_supply ?? '0';

  // Validate numeric strings before BigInt conversion
  if (!/^\d+$/.test(input.totalAssetValue)) throw new Error('Invalid totalAssetValue: must be a non-negative integer string');
  if (!/^\d+$/.test(liabilities)) throw new Error('Invalid liabilities: must be a non-negative integer string');
  const sanitizedSupply = totalSupply && /^\d+$/.test(totalSupply) ? totalSupply : '1';

  // Compute NAV
  const totalAssetBig = BigInt(input.totalAssetValue);
  const liabilitiesBig = BigInt(liabilities);
  const supplyBig = BigInt(sanitizedSupply); // avoid div-by-zero with validated fallback

  const netAssetValue = totalAssetBig > liabilitiesBig
    ? totalAssetBig - liabilitiesBig
    : 0n;

  const scaleFactor = 10n ** BigInt(decimals);
  const navPerToken = supplyBig > 0n
    ? (netAssetValue * scaleFactor) / supplyBig
    : 0n;

  const record: NAVRecord = {
    id,
    orgId,
    assetId,
    navPerToken: navPerToken.toString(),
    totalAssetValue: input.totalAssetValue,
    liabilities,
    netAssetValue: netAssetValue.toString(),
    totalSupply: totalSupply,
    currency,
    decimals,
    source: 'manual',
    txHash: null,
    computedAt: now,
    createdAt: now,
  };

  await execStatement(
    `INSERT INTO nav_history
       (id, org_id, asset_id, nav_per_token, total_asset_value, liabilities,
        net_asset_value, total_supply, currency, decimals, source, tx_hash, computed_at, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [
      record.id, record.orgId, record.assetId, record.navPerToken,
      record.totalAssetValue, record.liabilities, record.netAssetValue,
      record.totalSupply, record.currency, record.decimals,
      record.source, record.txHash, record.computedAt, record.createdAt,
    ]
  );

  // Persist valuation sources if provided
  if (input.sources && input.sources.length > 0) {
    for (const src of input.sources) {
      await execStatement(
        `INSERT INTO valuation_sources
           (id, org_id, asset_id, nav_record_id, source_name, value, weight, timestamp, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          randomUUID(), orgId, assetId, id,
          src.name, src.value, src.weight,
          Math.floor(Date.now() / 1000), now,
        ]
      );
    }
  }

  logger.info('NAV calculated manually', {
    assetId,
    navPerToken: record.navPerToken,
    source: 'manual',
  });

  return record;
}

/**
 * Get the most recent NAV record for an asset.
 */
export async function getCurrentNAV(
  orgId: string,
  assetId: string
): Promise<NAVRecord | null> {
  await ensureTables();

  const rows = await rawQuery<{
    id: string;
    org_id: string;
    asset_id: string;
    nav_per_token: string;
    total_asset_value: string;
    liabilities: string;
    net_asset_value: string;
    total_supply: string;
    currency: string;
    decimals: number;
    source: string;
    tx_hash: string | null;
    computed_at: string;
    created_at: string;
  }>(
    `SELECT * FROM nav_history
     WHERE org_id = $1 AND asset_id = $2
     ORDER BY computed_at DESC
     LIMIT 1`,
    [orgId, assetId]
  );

  if (rows.length === 0) return null;

  const row = rows[0];
  return mapRowToRecord(row);
}

/**
 * Get paginated NAV history for an asset.
 */
export async function getNAVHistory(
  orgId: string,
  assetId: string,
  query: NAVHistoryQuery = {}
): Promise<{ records: NAVRecord[]; total: number; page: number; limit: number }> {
  await ensureTables();

  const page = query.page ?? 1;
  const limit = Math.min(query.limit ?? 20, 100);
  const offset = (page - 1) * limit;

  // Build WHERE conditions
  const conditions: string[] = ['org_id = $1', 'asset_id = $2'];
  const params: unknown[] = [orgId, assetId];
  let paramIdx = 3;

  if (query.from) {
    conditions.push(`computed_at >= $${paramIdx}`);
    params.push(query.from);
    paramIdx++;
  }
  if (query.to) {
    conditions.push(`computed_at <= $${paramIdx}`);
    params.push(query.to);
    paramIdx++;
  }
  if (query.source) {
    conditions.push(`source = $${paramIdx}`);
    params.push(query.source);
    paramIdx++;
  }

  const where = conditions.join(' AND ');

  // Count
  const countRows = await rawQuery<{ count: number }>(
    `SELECT COUNT(*) as count FROM nav_history WHERE ${where}`,
    params
  );
  const total = Number(countRows[0]?.count ?? 0);

  // Fetch page
  const dataParams = [...params, limit, offset];
  const rows = await rawQuery<Record<string, unknown>>(
    `SELECT * FROM nav_history
     WHERE ${where}
     ORDER BY computed_at DESC
     LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
    dataParams
  );

  const records = rows.map(mapRowToRecord);

  return { records, total, page, limit };
}

/**
 * Add a manual valuation override. Computes and persists NAV.
 */
export async function addManualValuation(
  orgId: string,
  assetId: string,
  input: ManualValuationInput
): Promise<NAVRecord> {
  return calculateNAV(orgId, assetId, input);
}

/**
 * Process a callback from the CRE NAV calculation workflow.
 * Persists the externally-computed NAV and its valuation sources.
 */
export async function processCallback(
  orgId: string,
  assetId: string,
  payload: CRECallbackPayload
): Promise<NAVRecord> {
  await ensureTables();

  const id = randomUUID();
  const now = new Date().toISOString();

  const record: NAVRecord = {
    id,
    orgId,
    assetId,
    navPerToken: payload.navPerToken,
    totalAssetValue: payload.totalAssetValue,
    liabilities: payload.liabilities,
    netAssetValue: payload.netAssetValue,
    totalSupply: payload.totalSupply,
    currency: payload.currency,
    decimals: payload.decimals,
    source: 'cre_workflow',
    txHash: payload.txHash ?? null,
    computedAt: payload.computedAt,
    createdAt: now,
  };

  await execStatement(
    `INSERT INTO nav_history
       (id, org_id, asset_id, nav_per_token, total_asset_value, liabilities,
        net_asset_value, total_supply, currency, decimals, source, tx_hash, computed_at, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [
      record.id, record.orgId, record.assetId, record.navPerToken,
      record.totalAssetValue, record.liabilities, record.netAssetValue,
      record.totalSupply, record.currency, record.decimals,
      record.source, record.txHash, record.computedAt, record.createdAt,
    ]
  );

  // Persist valuation sources
  if (payload.valuationSources && payload.valuationSources.length > 0) {
    for (const src of payload.valuationSources) {
      await execStatement(
        `INSERT INTO valuation_sources
           (id, org_id, asset_id, nav_record_id, source_name, value, weight, timestamp, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          randomUUID(), orgId, assetId, id,
          src.name, src.value, src.weight, src.timestamp, now,
        ]
      );
    }
  }

  logger.info('NAV callback processed from CRE workflow', {
    assetId,
    navPerToken: record.navPerToken,
    txHash: record.txHash,
    sourcesCount: payload.valuationSources?.length ?? 0,
  });

  return record;
}

/**
 * Get valuation sources for a specific NAV record.
 */
export async function getValuationSources(
  navRecordId: string
): Promise<ValuationSource[]> {
  await ensureTables();

  const rows = await rawQuery<{
    id: string;
    org_id: string;
    asset_id: string;
    nav_record_id: string;
    source_name: string;
    value: string;
    weight: number;
    timestamp: number;
    created_at: string;
  }>(
    `SELECT * FROM valuation_sources WHERE nav_record_id = $1 ORDER BY weight DESC`,
    [navRecordId]
  );

  return rows.map((row) => ({
    id: row.id,
    orgId: row.org_id,
    assetId: row.asset_id,
    navRecordId: row.nav_record_id,
    sourceName: row.source_name,
    value: row.value,
    weight: row.weight,
    timestamp: row.timestamp,
    createdAt: row.created_at,
  }));
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

function mapRowToRecord(row: Record<string, unknown>): NAVRecord {
  return {
    id: row.id as string,
    orgId: (row.org_id as string),
    assetId: (row.asset_id as string),
    navPerToken: (row.nav_per_token as string),
    totalAssetValue: (row.total_asset_value as string),
    liabilities: (row.liabilities as string),
    netAssetValue: (row.net_asset_value as string),
    totalSupply: (row.total_supply as string),
    currency: (row.currency as string),
    decimals: (row.decimals as number),
    source: (row.source as NAVRecord['source']),
    txHash: (row.tx_hash as string | null),
    computedAt: (row.computed_at as string),
    createdAt: (row.created_at as string),
  };
}
