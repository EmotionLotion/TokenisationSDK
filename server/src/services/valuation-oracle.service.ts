/**
 * Valuation Oracle Service
 *
 * Provides inbound property valuation feeds that integrate with NAV calculation:
 * - Manages external valuation feed registrations (Zillow, Redfin, CBRE, JLL, etc.)
 * - Ingests appraisals from multiple providers and methodologies
 * - Recalculates NAV from weighted appraisal data and persists to nav_history
 * - Processes inbound webhooks with provider-specific payload normalisation
 *
 * @packageDocumentation
 */

import { randomUUID } from 'crypto';
import { rawQuery } from '../config/database.js';
import { logger } from '../middleware/logger.js';

// ============================================================================
// TYPES
// ============================================================================

export type FeedProvider =
  | 'zillow'
  | 'redfin'
  | 'cbre'
  | 'jll'
  | 'cushman_wakefield'
  | 'manual';

export type FeedStatus = 'active' | 'paused' | 'error' | 'removed';

export type AppraisalMethodology =
  | 'comparable_sales'
  | 'income_capitalization'
  | 'cost_approach'
  | 'dcf';

export interface ValuationFeed {
  id: string;
  orgId: string;
  assetId: string;
  provider: FeedProvider;
  feedUrl: string | null;
  apiKey: string | null;
  pollingIntervalSeconds: number;
  lastPolledAt: string | null;
  status: FeedStatus;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ValuationAppraisal {
  id: string;
  orgId: string;
  assetId: string;
  feedId: string | null;
  provider: FeedProvider;
  appraiserName: string | null;
  appraisalDate: string;
  marketValue: string;
  replacementValue: string | null;
  incomeValue: string | null;
  methodology: AppraisalMethodology;
  confidenceScore: number;
  currency: string;
  reportUrl: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface RegisterFeedInput {
  assetId: string;
  provider: FeedProvider;
  feedUrl?: string;
  apiKey?: string;
  pollingIntervalSeconds?: number;
  metadata?: Record<string, unknown>;
}

export interface IngestAppraisalInput {
  assetId: string;
  feedId?: string;
  provider: FeedProvider;
  appraiserName?: string;
  appraisalDate?: string;
  marketValue: string;
  replacementValue?: string;
  incomeValue?: string;
  methodology: AppraisalMethodology;
  confidenceScore?: number;
  currency?: string;
  reportUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface AppraisalFilters {
  provider?: FeedProvider;
  methodology?: AppraisalMethodology;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export interface FeedUpdateInput {
  feedUrl?: string;
  apiKey?: string;
  pollingIntervalSeconds?: number;
  status?: 'active' | 'paused';
  metadata?: Record<string, unknown>;
}

// ============================================================================
// SCHEMA INITIALISATION
// ============================================================================

let tablesInitialised = false;

/**
 * Ensure the valuation_feeds and valuation_appraisals tables exist.
 * Called lazily on first service method invocation.
 */
async function ensureTables(): Promise<void> {
  if (tablesInitialised) return;

  try {
    await rawQuery(`
      CREATE TABLE IF NOT EXISTS valuation_feeds (
        id TEXT PRIMARY KEY,
        org_id TEXT NOT NULL,
        asset_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        feed_url TEXT,
        api_key TEXT,
        polling_interval_seconds INTEGER NOT NULL DEFAULT 3600,
        last_polled_at TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        metadata TEXT NOT NULL DEFAULT '{}',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await rawQuery(`
      CREATE INDEX IF NOT EXISTS idx_valuation_feeds_org_asset
        ON valuation_feeds(org_id, asset_id)
    `);

    await rawQuery(`
      CREATE INDEX IF NOT EXISTS idx_valuation_feeds_status
        ON valuation_feeds(status)
    `);

    await rawQuery(`
      CREATE TABLE IF NOT EXISTS valuation_appraisals (
        id TEXT PRIMARY KEY,
        org_id TEXT NOT NULL,
        asset_id TEXT NOT NULL,
        feed_id TEXT,
        provider TEXT NOT NULL,
        appraiser_name TEXT,
        appraisal_date TEXT NOT NULL,
        market_value TEXT NOT NULL,
        replacement_value TEXT,
        income_value TEXT,
        methodology TEXT NOT NULL,
        confidence_score INTEGER NOT NULL DEFAULT 50,
        currency TEXT NOT NULL DEFAULT 'USD',
        report_url TEXT,
        metadata TEXT NOT NULL DEFAULT '{}',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await rawQuery(`
      CREATE INDEX IF NOT EXISTS idx_valuation_appraisals_org_asset
        ON valuation_appraisals(org_id, asset_id, appraisal_date)
    `);

    await rawQuery(`
      CREATE INDEX IF NOT EXISTS idx_valuation_appraisals_feed
        ON valuation_appraisals(feed_id)
    `);

    tablesInitialised = true;
    logger.info('Valuation oracle tables initialised');
  } catch (error) {
    logger.error('Failed to initialise valuation oracle tables', { error: error as Error });
    throw error;
  }
}

// ============================================================================
// FEED MANAGEMENT
// ============================================================================

/**
 * Register a new valuation feed source for an asset.
 */
export async function registerFeed(
  orgId: string,
  input: RegisterFeedInput
): Promise<ValuationFeed> {
  await ensureTables();

  const id = randomUUID();
  const now = new Date().toISOString();
  const metadata = JSON.stringify(input.metadata ?? {});
  const pollingInterval = input.pollingIntervalSeconds ?? 3600;

  await rawQuery(
    `INSERT INTO valuation_feeds
       (id, org_id, asset_id, provider, feed_url, api_key,
        polling_interval_seconds, status, metadata, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      id, orgId, input.assetId, input.provider,
      input.feedUrl ?? null, input.apiKey ?? null,
      pollingInterval, 'active', metadata, now, now,
    ]
  );

  logger.info('Valuation feed registered', {
    feedId: id, orgId, assetId: input.assetId, provider: input.provider,
  });

  return {
    id, orgId, assetId: input.assetId,
    provider: input.provider as FeedProvider,
    feedUrl: input.feedUrl ?? null,
    apiKey: input.apiKey ?? null,
    pollingIntervalSeconds: pollingInterval,
    lastPolledAt: null,
    status: 'active',
    metadata: input.metadata ?? {},
    createdAt: now, updatedAt: now,
  };
}

/**
 * List valuation feeds for an organisation, optionally filtered by asset.
 */
export async function listFeeds(
  orgId: string,
  assetId?: string
): Promise<ValuationFeed[]> {
  await ensureTables();

  let sql = `SELECT * FROM valuation_feeds WHERE org_id = $1 AND status != 'removed'`;
  const params: unknown[] = [orgId];

  if (assetId) {
    sql += ` AND asset_id = $2`;
    params.push(assetId);
  }
  sql += ` ORDER BY created_at DESC`;

  const rows = await rawQuery<Record<string, unknown>>(sql, params);
  return rows.map(mapRowToFeed);
}

/**
 * Update a feed's configuration (polling interval, status, URL, etc.).
 */
export async function updateFeed(
  orgId: string,
  feedId: string,
  updates: FeedUpdateInput
): Promise<ValuationFeed | null> {
  await ensureTables();

  const setClauses: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (updates.feedUrl !== undefined) {
    setClauses.push(`feed_url = $${paramIdx++}`);
    params.push(updates.feedUrl);
  }
  if (updates.apiKey !== undefined) {
    setClauses.push(`api_key = $${paramIdx++}`);
    params.push(updates.apiKey);
  }
  if (updates.pollingIntervalSeconds !== undefined) {
    setClauses.push(`polling_interval_seconds = $${paramIdx++}`);
    params.push(updates.pollingIntervalSeconds);
  }
  if (updates.status !== undefined) {
    setClauses.push(`status = $${paramIdx++}`);
    params.push(updates.status);
  }
  if (updates.metadata !== undefined) {
    setClauses.push(`metadata = $${paramIdx++}`);
    params.push(JSON.stringify(updates.metadata));
  }

  if (setClauses.length === 0) {
    const existing = await rawQuery<Record<string, unknown>>(
      `SELECT * FROM valuation_feeds WHERE id = $1 AND org_id = $2`,
      [feedId, orgId]
    );
    return existing.length > 0 ? mapRowToFeed(existing[0]) : null;
  }

  setClauses.push(`updated_at = $${paramIdx++}`);
  params.push(new Date().toISOString());

  params.push(feedId, orgId);
  const sql = `UPDATE valuation_feeds SET ${setClauses.join(', ')}
    WHERE id = $${paramIdx++} AND org_id = $${paramIdx}
    RETURNING *`;

  const rows = await rawQuery<Record<string, unknown>>(sql, params);
  if (rows.length === 0) return null;

  logger.info('Valuation feed updated', { feedId, orgId });
  return mapRowToFeed(rows[0]);
}

/**
 * Soft-delete a feed by setting its status to 'removed'.
 */
export async function removeFeed(
  orgId: string,
  feedId: string
): Promise<boolean> {
  await ensureTables();

  const now = new Date().toISOString();
  const rows = await rawQuery<Record<string, unknown>>(
    `UPDATE valuation_feeds SET status = 'removed', updated_at = $1
     WHERE id = $2 AND org_id = $3 AND status != 'removed'
     RETURNING id`,
    [now, feedId, orgId]
  );

  if (rows.length > 0) {
    logger.info('Valuation feed removed', { feedId, orgId });
    return true;
  }
  return false;
}

// ============================================================================
// APPRAISAL INGESTION
// ============================================================================

/**
 * Ingest an appraisal from any valuation provider.
 * After inserting, triggers NAV recalculation from recent appraisals.
 */
export async function ingestAppraisal(
  orgId: string,
  input: IngestAppraisalInput
): Promise<ValuationAppraisal> {
  await ensureTables();

  const id = randomUUID();
  const now = new Date().toISOString();
  const appraisalDate = input.appraisalDate ?? now;
  const confidence = Math.max(0, Math.min(100, input.confidenceScore ?? 50));
  const currency = input.currency ?? 'USD';
  const metadata = JSON.stringify(input.metadata ?? {});

  await rawQuery(
    `INSERT INTO valuation_appraisals
       (id, org_id, asset_id, feed_id, provider, appraiser_name,
        appraisal_date, market_value, replacement_value, income_value,
        methodology, confidence_score, currency, report_url, metadata, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
    [
      id, orgId, input.assetId, input.feedId ?? null, input.provider,
      input.appraiserName ?? null, appraisalDate, input.marketValue,
      input.replacementValue ?? null, input.incomeValue ?? null,
      input.methodology, confidence, currency,
      input.reportUrl ?? null, metadata, now,
    ]
  );

  logger.info('Appraisal ingested', {
    appraisalId: id, orgId, assetId: input.assetId,
    provider: input.provider, methodology: input.methodology,
    marketValue: input.marketValue,
  });

  const appraisal: ValuationAppraisal = {
    id, orgId, assetId: input.assetId,
    feedId: input.feedId ?? null,
    provider: input.provider as FeedProvider,
    appraiserName: input.appraiserName ?? null,
    appraisalDate,
    marketValue: input.marketValue,
    replacementValue: input.replacementValue ?? null,
    incomeValue: input.incomeValue ?? null,
    methodology: input.methodology,
    confidenceScore: confidence,
    currency,
    reportUrl: input.reportUrl ?? null,
    metadata: input.metadata ?? {},
    createdAt: now,
  };

  // Trigger NAV recalculation from recent appraisals
  await updateNAVFromAppraisals(orgId, input.assetId);

  return appraisal;
}

/**
 * List appraisals for an asset with optional filters.
 */
export async function listAppraisals(
  orgId: string,
  assetId: string,
  filters: AppraisalFilters = {}
): Promise<{ appraisals: ValuationAppraisal[]; total: number; page: number; limit: number }> {
  await ensureTables();

  const page = filters.page ?? 1;
  const limit = Math.min(filters.limit ?? 20, 100);
  const offset = (page - 1) * limit;

  const conditions: string[] = ['org_id = $1', 'asset_id = $2'];
  const params: unknown[] = [orgId, assetId];
  let paramIdx = 3;

  if (filters.provider) {
    conditions.push(`provider = $${paramIdx++}`);
    params.push(filters.provider);
  }
  if (filters.methodology) {
    conditions.push(`methodology = $${paramIdx++}`);
    params.push(filters.methodology);
  }
  if (filters.from) {
    conditions.push(`appraisal_date >= $${paramIdx++}`);
    params.push(filters.from);
  }
  if (filters.to) {
    conditions.push(`appraisal_date <= $${paramIdx++}`);
    params.push(filters.to);
  }

  const where = conditions.join(' AND ');

  const countRows = await rawQuery<{ count: number }>(
    `SELECT COUNT(*) as count FROM valuation_appraisals WHERE ${where}`,
    params
  );
  const total = Number(countRows[0]?.count ?? 0);

  const dataParams = [...params, limit, offset];
  const rows = await rawQuery<Record<string, unknown>>(
    `SELECT * FROM valuation_appraisals
     WHERE ${where}
     ORDER BY appraisal_date DESC
     LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
    dataParams
  );

  return { appraisals: rows.map(mapRowToAppraisal), total, page, limit };
}

/**
 * Get the most recent appraisal for an asset.
 */
export async function getLatestAppraisal(
  orgId: string,
  assetId: string
): Promise<ValuationAppraisal | null> {
  await ensureTables();

  const rows = await rawQuery<Record<string, unknown>>(
    `SELECT * FROM valuation_appraisals
     WHERE org_id = $1 AND asset_id = $2
     ORDER BY appraisal_date DESC
     LIMIT 1`,
    [orgId, assetId]
  );

  return rows.length > 0 ? mapRowToAppraisal(rows[0]) : null;
}

// ============================================================================
// NAV RECALCULATION
// ============================================================================

/**
 * Calculate a weighted average from recent appraisals (within 90 days),
 * grouped by methodology, and insert the result into nav_history.
 *
 * Weighting strategy:
 * - Each methodology group contributes equally to the final value.
 * - Within a methodology group, appraisals are weighted by confidence score.
 * - Only appraisals from the last 90 days are considered.
 */
export async function updateNAVFromAppraisals(
  orgId: string,
  assetId: string
): Promise<void> {
  await ensureTables();

  const cutoffDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  const rows = await rawQuery<{
    methodology: string;
    market_value: string;
    confidence_score: number;
  }>(
    `SELECT methodology, market_value, confidence_score
     FROM valuation_appraisals
     WHERE org_id = $1 AND asset_id = $2 AND appraisal_date >= $3
     ORDER BY methodology, appraisal_date DESC`,
    [orgId, assetId, cutoffDate]
  );

  if (rows.length === 0) {
    logger.debug('No recent appraisals found for NAV recalculation', { orgId, assetId });
    return;
  }

  // Group by methodology and compute confidence-weighted average per group
  const groups = new Map<string, { totalWeightedValue: number; totalWeight: number }>();

  for (const row of rows) {
    const value = parseFloat(row.market_value);
    const weight = Math.max(1, row.confidence_score);

    if (isNaN(value) || value <= 0) continue;

    const existing = groups.get(row.methodology);
    if (existing) {
      existing.totalWeightedValue += value * weight;
      existing.totalWeight += weight;
    } else {
      groups.set(row.methodology, {
        totalWeightedValue: value * weight,
        totalWeight: weight,
      });
    }
  }

  if (groups.size === 0) {
    logger.warn('All appraisals had invalid values; skipping NAV update', { orgId, assetId });
    return;
  }

  // Equal weight per methodology group, then average across groups
  let totalAssetValue = 0;
  for (const group of groups.values()) {
    totalAssetValue += group.totalWeightedValue / group.totalWeight;
  }
  totalAssetValue = totalAssetValue / groups.size;

  // Round to integer string for consistency with nav.service.ts BigInt handling
  const totalAssetValueStr = Math.round(totalAssetValue).toString();

  // Read current total supply and liabilities from the most recent NAV record
  const latestNav = await rawQuery<{ total_supply: string; liabilities: string; currency: string; decimals: number }>(
    `SELECT total_supply, liabilities, currency, decimals FROM nav_history
     WHERE org_id = $1 AND asset_id = $2
     ORDER BY computed_at DESC LIMIT 1`,
    [orgId, assetId]
  );

  const totalSupply = latestNav[0]?.total_supply ?? '0';
  const liabilities = latestNav[0]?.liabilities ?? '0';
  const currency = latestNav[0]?.currency ?? 'USD';
  const decimals = latestNav[0]?.decimals ?? 18;

  // Compute NAV using BigInt arithmetic (matching nav.service.ts pattern)
  const totalAssetBig = BigInt(totalAssetValueStr);
  const liabilitiesBig = BigInt(liabilities);
  const supplyBig = BigInt(totalSupply || '1');

  const netAssetValue = totalAssetBig > liabilitiesBig
    ? totalAssetBig - liabilitiesBig
    : 0n;

  const scaleFactor = 10n ** BigInt(decimals);
  const navPerToken = supplyBig > 0n
    ? (netAssetValue * scaleFactor) / supplyBig
    : 0n;

  const id = randomUUID();
  const now = new Date().toISOString();

  await rawQuery(
    `INSERT INTO nav_history
       (id, org_id, asset_id, nav_per_token, total_asset_value, liabilities,
        net_asset_value, total_supply, currency, decimals, source, tx_hash, computed_at, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [
      id, orgId, assetId, navPerToken.toString(),
      totalAssetValueStr, liabilities, netAssetValue.toString(),
      totalSupply, currency, decimals,
      'api', null, now, now,
    ]
  );

  logger.info('NAV updated from appraisal oracle', {
    navRecordId: id, orgId, assetId,
    totalAssetValue: totalAssetValueStr,
    netAssetValue: netAssetValue.toString(),
    navPerToken: navPerToken.toString(),
    methodologyGroups: groups.size,
    appraisalCount: rows.length,
  });
}

// ============================================================================
// WEBHOOK PROCESSING
// ============================================================================

/**
 * Process an inbound webhook from a valuation provider.
 * Normalises provider-specific payloads and ingests as an appraisal.
 */
export async function processWebhook(
  orgId: string,
  provider: FeedProvider,
  payload: Record<string, unknown>
): Promise<ValuationAppraisal> {
  await ensureTables();

  logger.info('Processing valuation webhook', { orgId, provider });

  let normalised: IngestAppraisalInput;

  switch (provider) {
    case 'cbre':
      normalised = normaliseCBREPayload(payload);
      break;
    case 'jll':
      normalised = normaliseJLLPayload(payload);
      break;
    case 'cushman_wakefield':
      normalised = normaliseCushmanPayload(payload);
      break;
    default:
      normalised = normaliseGenericPayload(provider, payload);
      break;
  }

  return ingestAppraisal(orgId, normalised);
}

// ============================================================================
// PROVIDER PAYLOAD NORMALISATION
// ============================================================================

/**
 * Normalise CBRE webhook payload.
 *
 * Expected shape:
 * {
 *   property_id: string,
 *   valuation: { market_value: number, replacement_cost: number, income_approach: number },
 *   methodology: string,
 *   appraiser: { name: string },
 *   effective_date: string,
 *   confidence: number,
 *   currency_code: string,
 *   report_link: string,
 *   feed_reference: string
 * }
 */
function normaliseCBREPayload(payload: Record<string, unknown>): IngestAppraisalInput {
  const valuation = (payload.valuation ?? {}) as Record<string, unknown>;
  const appraiser = (payload.appraiser ?? {}) as Record<string, unknown>;

  return {
    assetId: String(payload.property_id ?? ''),
    feedId: payload.feed_reference ? String(payload.feed_reference) : undefined,
    provider: 'cbre',
    appraiserName: appraiser.name ? String(appraiser.name) : undefined,
    appraisalDate: payload.effective_date ? String(payload.effective_date) : undefined,
    marketValue: String(valuation.market_value ?? '0'),
    replacementValue: valuation.replacement_cost ? String(valuation.replacement_cost) : undefined,
    incomeValue: valuation.income_approach ? String(valuation.income_approach) : undefined,
    methodology: mapMethodology(String(payload.methodology ?? 'comparable_sales')),
    confidenceScore: typeof payload.confidence === 'number' ? payload.confidence : undefined,
    currency: payload.currency_code ? String(payload.currency_code) : undefined,
    reportUrl: payload.report_link ? String(payload.report_link) : undefined,
    metadata: { rawProvider: 'cbre', originalPayload: payload },
  };
}

/**
 * Normalise JLL webhook payload.
 *
 * Expected shape:
 * {
 *   asset: { id: string, type: string },
 *   assessment: { fair_market_value: number, cost_value: number, income_value: number },
 *   method: string,
 *   assessor: string,
 *   date: string,
 *   confidence_pct: number,
 *   ccy: string,
 *   document_url: string,
 *   source_feed_id: string
 * }
 */
function normaliseJLLPayload(payload: Record<string, unknown>): IngestAppraisalInput {
  const asset = (payload.asset ?? {}) as Record<string, unknown>;
  const assessment = (payload.assessment ?? {}) as Record<string, unknown>;

  return {
    assetId: String(asset.id ?? ''),
    feedId: payload.source_feed_id ? String(payload.source_feed_id) : undefined,
    provider: 'jll',
    appraiserName: payload.assessor ? String(payload.assessor) : undefined,
    appraisalDate: payload.date ? String(payload.date) : undefined,
    marketValue: String(assessment.fair_market_value ?? '0'),
    replacementValue: assessment.cost_value ? String(assessment.cost_value) : undefined,
    incomeValue: assessment.income_value ? String(assessment.income_value) : undefined,
    methodology: mapMethodology(String(payload.method ?? 'comparable_sales')),
    confidenceScore: typeof payload.confidence_pct === 'number' ? payload.confidence_pct : undefined,
    currency: payload.ccy ? String(payload.ccy) : undefined,
    reportUrl: payload.document_url ? String(payload.document_url) : undefined,
    metadata: { rawProvider: 'jll', originalPayload: payload },
  };
}

/**
 * Normalise Cushman & Wakefield webhook payload.
 *
 * Expected shape:
 * {
 *   ref: { property_id: string, feed_id: string },
 *   results: { market: number, replacement: number, noi_based: number },
 *   approach: string,
 *   surveyor: { full_name: string },
 *   valuation_date: string,
 *   reliability_score: number,
 *   currency: string,
 *   report: { url: string }
 * }
 */
function normaliseCushmanPayload(payload: Record<string, unknown>): IngestAppraisalInput {
  const ref = (payload.ref ?? {}) as Record<string, unknown>;
  const results = (payload.results ?? {}) as Record<string, unknown>;
  const surveyor = (payload.surveyor ?? {}) as Record<string, unknown>;
  const report = (payload.report ?? {}) as Record<string, unknown>;

  return {
    assetId: String(ref.property_id ?? ''),
    feedId: ref.feed_id ? String(ref.feed_id) : undefined,
    provider: 'cushman_wakefield',
    appraiserName: surveyor.full_name ? String(surveyor.full_name) : undefined,
    appraisalDate: payload.valuation_date ? String(payload.valuation_date) : undefined,
    marketValue: String(results.market ?? '0'),
    replacementValue: results.replacement ? String(results.replacement) : undefined,
    incomeValue: results.noi_based ? String(results.noi_based) : undefined,
    methodology: mapMethodology(String(payload.approach ?? 'comparable_sales')),
    confidenceScore: typeof payload.reliability_score === 'number' ? payload.reliability_score : undefined,
    currency: payload.currency ? String(payload.currency) : undefined,
    reportUrl: report.url ? String(report.url) : undefined,
    metadata: { rawProvider: 'cushman_wakefield', originalPayload: payload },
  };
}

/**
 * Normalise a generic/simple webhook payload for providers without specific handling.
 * Expects a flat or minimally nested JSON with standard field names.
 */
function normaliseGenericPayload(
  provider: FeedProvider,
  payload: Record<string, unknown>
): IngestAppraisalInput {
  return {
    assetId: String(payload.assetId ?? payload.asset_id ?? payload.property_id ?? ''),
    feedId: payload.feedId ? String(payload.feedId) : undefined,
    provider,
    appraiserName: payload.appraiserName ? String(payload.appraiserName) : undefined,
    appraisalDate: payload.appraisalDate
      ? String(payload.appraisalDate)
      : payload.date ? String(payload.date) : undefined,
    marketValue: String(payload.marketValue ?? payload.market_value ?? payload.value ?? '0'),
    replacementValue: payload.replacementValue ? String(payload.replacementValue) : undefined,
    incomeValue: payload.incomeValue ? String(payload.incomeValue) : undefined,
    methodology: mapMethodology(
      String(payload.methodology ?? payload.method ?? 'comparable_sales')
    ),
    confidenceScore: typeof payload.confidenceScore === 'number'
      ? payload.confidenceScore
      : typeof payload.confidence === 'number' ? payload.confidence : undefined,
    currency: payload.currency ? String(payload.currency) : undefined,
    reportUrl: payload.reportUrl ? String(payload.reportUrl) : undefined,
    metadata: { rawProvider: provider, originalPayload: payload },
  };
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

/** Map various methodology string representations to our canonical enum values. */
function mapMethodology(raw: string): AppraisalMethodology {
  const normalised = raw.toLowerCase().replace(/[\s-]+/g, '_');

  const mapping: Record<string, AppraisalMethodology> = {
    comparable_sales: 'comparable_sales',
    sales_comparison: 'comparable_sales',
    market_comparison: 'comparable_sales',
    comparables: 'comparable_sales',
    income_capitalization: 'income_capitalization',
    income_capitalisation: 'income_capitalization',
    income_approach: 'income_capitalization',
    direct_capitalization: 'income_capitalization',
    cap_rate: 'income_capitalization',
    cost_approach: 'cost_approach',
    replacement_cost: 'cost_approach',
    cost: 'cost_approach',
    dcf: 'dcf',
    discounted_cash_flow: 'dcf',
    discounted_cashflow: 'dcf',
  };

  return mapping[normalised] ?? 'comparable_sales';
}

function mapRowToFeed(row: Record<string, unknown>): ValuationFeed {
  let metadata: Record<string, unknown> = {};
  try {
    metadata = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : (row.metadata as Record<string, unknown>) ?? {};
  } catch { /* default to empty */ }

  return {
    id: row.id as string,
    orgId: row.org_id as string,
    assetId: row.asset_id as string,
    provider: row.provider as FeedProvider,
    feedUrl: (row.feed_url as string) ?? null,
    apiKey: (row.api_key as string) ?? null,
    pollingIntervalSeconds: (row.polling_interval_seconds as number) ?? 3600,
    lastPolledAt: (row.last_polled_at as string) ?? null,
    status: row.status as FeedStatus,
    metadata,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function mapRowToAppraisal(row: Record<string, unknown>): ValuationAppraisal {
  let metadata: Record<string, unknown> = {};
  try {
    metadata = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : (row.metadata as Record<string, unknown>) ?? {};
  } catch { /* default to empty */ }

  return {
    id: row.id as string,
    orgId: row.org_id as string,
    assetId: row.asset_id as string,
    feedId: (row.feed_id as string) ?? null,
    provider: row.provider as FeedProvider,
    appraiserName: (row.appraiser_name as string) ?? null,
    appraisalDate: row.appraisal_date as string,
    marketValue: row.market_value as string,
    replacementValue: (row.replacement_value as string) ?? null,
    incomeValue: (row.income_value as string) ?? null,
    methodology: row.methodology as AppraisalMethodology,
    confidenceScore: (row.confidence_score as number) ?? 50,
    currency: (row.currency as string) ?? 'USD',
    reportUrl: (row.report_url as string) ?? null,
    metadata,
    createdAt: row.created_at as string,
  };
}
