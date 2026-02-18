/**
 * Prediction Market Service — "FlightBet"
 *
 * Flight delay prediction markets using CRE oracle + Gemini AI settlement.
 * Users create markets on flight outcomes and place bets. Settlements
 * distribute winnings pro-rata to correct-outcome bettors.
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

export type MarketOutcome = 'on-time' | 'delayed-15' | 'delayed-60' | 'cancelled';
export type MarketStatus = 'open' | 'closed' | 'settled' | 'voided';
export type BetStatus = 'active' | 'won' | 'lost' | 'refunded';

export interface PredictionMarket {
  id: string;
  orgId: string;
  flightNumber: string;
  departureDate: string;
  thresholds: Record<string, number>;
  closesAt: string;
  status: MarketStatus;
  totalPool: number;
  outcomePools: Record<MarketOutcome, number>;
  actualOutcome: MarketOutcome | null;
  oracleProof: string | null;
  settledAt: string | null;
  createdAt: string;
}

export interface MarketBet {
  id: string;
  orgId: string;
  marketId: string;
  partyId: string;
  outcome: MarketOutcome;
  amount: number;
  potentialPayout: number;
  actualPayout: number;
  status: BetStatus;
  createdAt: string;
}

export interface CreateMarketInput {
  flightNumber: string;
  departureDate: string;
  thresholds: Record<string, number>;
  closesAt: string;
}

export interface PlaceBetInput {
  marketId: string;
  partyId: string;
  outcome: MarketOutcome;
  amount: number;
}

export interface SettleMarketInput {
  marketId: string;
  actualOutcome: MarketOutcome;
  oracleProof: string;
}

// ============================================================================
// Initialisation
// ============================================================================

let _initialised = false;

export async function ensureTables(): Promise<void> {
  if (_initialised) return;

  logger.info('PredictionMarketService: initialising tables');

  await rawQuery(`
    CREATE TABLE IF NOT EXISTS prediction_markets (
      id                TEXT PRIMARY KEY,
      org_id            TEXT NOT NULL,
      flight_number     TEXT NOT NULL,
      departure_date    TEXT NOT NULL,
      thresholds        TEXT NOT NULL DEFAULT '{}',
      closes_at         TEXT NOT NULL,
      status            TEXT NOT NULL DEFAULT 'open',
      total_pool        REAL NOT NULL DEFAULT 0,
      outcome_pools     TEXT NOT NULL DEFAULT '{}',
      actual_outcome    TEXT,
      oracle_proof      TEXT,
      settled_at        TEXT,
      created_at        TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await rawQuery(`
    CREATE TABLE IF NOT EXISTS market_bets (
      id                TEXT PRIMARY KEY,
      org_id            TEXT NOT NULL,
      market_id         TEXT NOT NULL,
      party_id          TEXT NOT NULL,
      outcome           TEXT NOT NULL,
      amount            REAL NOT NULL,
      potential_payout  REAL NOT NULL DEFAULT 0,
      actual_payout     REAL NOT NULL DEFAULT 0,
      status            TEXT NOT NULL DEFAULT 'active',
      created_at        TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await rawQuery(`CREATE INDEX IF NOT EXISTS idx_pm_org ON prediction_markets (org_id, status)`);
  await rawQuery(`CREATE INDEX IF NOT EXISTS idx_pm_flight ON prediction_markets (flight_number, departure_date)`);
  await rawQuery(`CREATE INDEX IF NOT EXISTS idx_mb_market ON market_bets (market_id, outcome)`);
  await rawQuery(`CREATE INDEX IF NOT EXISTS idx_mb_party ON market_bets (party_id, status)`);

  _initialised = true;
  logger.info('PredictionMarketService: tables ready');
}

// ============================================================================
// Service Methods
// ============================================================================

/**
 * Create a new prediction market for a flight.
 */
export async function createMarket(
  orgId: string,
  input: CreateMarketInput,
): Promise<PredictionMarket> {
  await ensureTables();

  const id = randomUUID();
  const now = new Date().toISOString();
  const defaultPools: Record<MarketOutcome, number> = {
    'on-time': 0,
    'delayed-15': 0,
    'delayed-60': 0,
    'cancelled': 0,
  };

  await rawQuery(
    `INSERT INTO prediction_markets
       (id, org_id, flight_number, departure_date, thresholds, closes_at, status, total_pool, outcome_pools, actual_outcome, oracle_proof, settled_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'open', 0, ?, NULL, NULL, NULL, ?)`,
    [
      id, orgId, input.flightNumber, input.departureDate,
      JSON.stringify(input.thresholds), input.closesAt,
      JSON.stringify(defaultPools), now,
    ],
  );

  logger.info('PredictionMarketService: market created', { marketId: id, flight: input.flightNumber });

  return {
    id,
    orgId,
    flightNumber: input.flightNumber,
    departureDate: input.departureDate,
    thresholds: input.thresholds,
    closesAt: input.closesAt,
    status: 'open',
    totalPool: 0,
    outcomePools: defaultPools,
    actualOutcome: null,
    oracleProof: null,
    settledAt: null,
    createdAt: now,
  };
}

/**
 * Place a bet on a market outcome.
 */
export async function placeBet(
  orgId: string,
  input: PlaceBetInput,
): Promise<MarketBet> {
  await ensureTables();

  // Verify market is open
  const markets = await rawQuery<any>(
    `SELECT * FROM prediction_markets WHERE id = ? AND org_id = ? AND status = 'open' LIMIT 1`,
    [input.marketId, orgId],
  );
  if (markets.length === 0) {
    throw new Error(`Market ${input.marketId} not found or not open`);
  }

  const market = mapMarketRow(markets[0]);

  // Check market hasn't closed
  if (new Date(market.closesAt) < new Date()) {
    throw new Error('Market betting period has closed');
  }

  const id = randomUUID();
  const now = new Date().toISOString();

  // Calculate potential payout based on current pool ratio
  const outcomePool = market.outcomePools[input.outcome] || 0;
  const otherPools = market.totalPool - outcomePool;
  const potentialPayout = outcomePool + input.amount > 0
    ? input.amount + (input.amount / (outcomePool + input.amount)) * otherPools
    : input.amount;

  await rawQuery(
    `INSERT INTO market_bets
       (id, org_id, market_id, party_id, outcome, amount, potential_payout, actual_payout, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'active', ?)`,
    [id, orgId, input.marketId, input.partyId, input.outcome, input.amount, potentialPayout, now],
  );

  // Update market pools
  const newOutcomePools = { ...market.outcomePools };
  newOutcomePools[input.outcome] = (newOutcomePools[input.outcome] || 0) + input.amount;

  await rawQuery(
    `UPDATE prediction_markets SET total_pool = total_pool + ?, outcome_pools = ? WHERE id = ?`,
    [input.amount, JSON.stringify(newOutcomePools), input.marketId],
  );

  logger.info('PredictionMarketService: bet placed', { betId: id, marketId: input.marketId, outcome: input.outcome, amount: input.amount });

  return {
    id,
    orgId,
    marketId: input.marketId,
    partyId: input.partyId,
    outcome: input.outcome,
    amount: input.amount,
    potentialPayout,
    actualPayout: 0,
    status: 'active',
    createdAt: now,
  };
}

/**
 * Settle a market with the actual outcome from CRE oracle.
 * Distributes winnings pro-rata to correct bettors.
 */
export async function settleMarket(
  orgId: string,
  input: SettleMarketInput,
): Promise<PredictionMarket & { winningBets: number; totalPaidOut: number }> {
  await ensureTables();

  const markets = await rawQuery<any>(
    `SELECT * FROM prediction_markets WHERE id = ? AND org_id = ? AND status IN ('open', 'closed') LIMIT 1`,
    [input.marketId, orgId],
  );
  if (markets.length === 0) {
    throw new Error(`Market ${input.marketId} not found or already settled`);
  }

  const market = mapMarketRow(markets[0]);
  const now = new Date().toISOString();

  // Get all bets for this market
  const allBets = await rawQuery<any>(
    `SELECT * FROM market_bets WHERE market_id = ? AND status = 'active'`,
    [input.marketId],
  );

  // Separate winners and losers
  const winningBets = allBets.filter((b: any) => (b.outcome === input.actualOutcome));
  const totalWinningAmount = winningBets.reduce((sum: number, b: any) => sum + (b.amount ?? 0), 0);

  let totalPaidOut = 0;

  // Distribute winnings pro-rata
  for (const bet of winningBets) {
    const share = totalWinningAmount > 0 ? (bet.amount / totalWinningAmount) : 0;
    const payout = share * market.totalPool;
    totalPaidOut += payout;

    await rawQuery(
      `UPDATE market_bets SET status = 'won', actual_payout = ? WHERE id = ?`,
      [payout, bet.id],
    );
  }

  // Mark losing bets
  const losingBetIds = allBets
    .filter((b: any) => b.outcome !== input.actualOutcome)
    .map((b: any) => b.id);

  if (losingBetIds.length > 0) {
    const placeholders = losingBetIds.map(() => '?').join(',');
    await rawQuery(
      `UPDATE market_bets SET status = 'lost' WHERE id IN (${placeholders})`,
      losingBetIds,
    );
  }

  // Update market status
  await rawQuery(
    `UPDATE prediction_markets SET status = 'settled', actual_outcome = ?, oracle_proof = ?, settled_at = ? WHERE id = ?`,
    [input.actualOutcome, input.oracleProof, now, input.marketId],
  );

  logger.info('PredictionMarketService: market settled', {
    marketId: input.marketId,
    outcome: input.actualOutcome,
    winningBets: winningBets.length,
    totalPaidOut,
  });

  return {
    ...market,
    status: 'settled',
    actualOutcome: input.actualOutcome,
    oracleProof: input.oracleProof,
    settledAt: now,
    winningBets: winningBets.length,
    totalPaidOut,
  };
}

/**
 * Get a single market by ID.
 */
export async function getMarket(marketId: string): Promise<PredictionMarket | null> {
  await ensureTables();

  const rows = await rawQuery<any>(
    `SELECT * FROM prediction_markets WHERE id = ? LIMIT 1`,
    [marketId],
  );
  if (rows.length === 0) return null;
  return mapMarketRow(rows[0]);
}

/**
 * List markets for an organisation with optional filters.
 */
export async function listMarkets(
  orgId: string,
  filters?: { status?: MarketStatus; flightNumber?: string; limit?: number; offset?: number },
): Promise<{ data: PredictionMarket[]; count: number }> {
  await ensureTables();

  const limit = filters?.limit ?? 50;
  const offset = filters?.offset ?? 0;
  const conditions: string[] = ['org_id = ?'];
  const params: unknown[] = [orgId];

  if (filters?.status) {
    conditions.push('status = ?');
    params.push(filters.status);
  }
  if (filters?.flightNumber) {
    conditions.push('flight_number = ?');
    params.push(filters.flightNumber);
  }

  const where = conditions.join(' AND ');

  const rows = await rawQuery<any>(
    `SELECT * FROM prediction_markets WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );

  const countRows = await rawQuery<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM prediction_markets WHERE ${where}`,
    params,
  );

  return {
    data: rows.map(mapMarketRow),
    count: countRows[0]?.cnt ?? 0,
  };
}

/**
 * List bets for a specific market.
 */
export async function listBets(
  marketId: string,
  filters?: { partyId?: string; outcome?: MarketOutcome; limit?: number; offset?: number },
): Promise<{ data: MarketBet[]; count: number }> {
  await ensureTables();

  const limit = filters?.limit ?? 100;
  const offset = filters?.offset ?? 0;
  const conditions: string[] = ['market_id = ?'];
  const params: unknown[] = [marketId];

  if (filters?.partyId) {
    conditions.push('party_id = ?');
    params.push(filters.partyId);
  }
  if (filters?.outcome) {
    conditions.push('outcome = ?');
    params.push(filters.outcome);
  }

  const where = conditions.join(' AND ');

  const rows = await rawQuery<any>(
    `SELECT * FROM market_bets WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );

  const countRows = await rawQuery<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM market_bets WHERE ${where}`,
    params,
  );

  return {
    data: rows.map(mapBetRow),
    count: countRows[0]?.cnt ?? 0,
  };
}

// ============================================================================
// Internal Helpers
// ============================================================================

function mapMarketRow(row: any): PredictionMarket {
  let thresholds: Record<string, number> = {};
  let outcomePools: Record<MarketOutcome, number> = { 'on-time': 0, 'delayed-15': 0, 'delayed-60': 0, 'cancelled': 0 };

  try {
    const rawThresholds = row.thresholds ?? '{}';
    thresholds = typeof rawThresholds === 'string' ? JSON.parse(rawThresholds) : rawThresholds;
  } catch { /* ignore */ }

  try {
    const rawPools = row.outcome_pools ?? row.outcomePools ?? '{}';
    outcomePools = typeof rawPools === 'string' ? JSON.parse(rawPools) : rawPools;
  } catch { /* ignore */ }

  return {
    id: row.id,
    orgId: row.org_id ?? row.orgId,
    flightNumber: row.flight_number ?? row.flightNumber,
    departureDate: row.departure_date ?? row.departureDate,
    thresholds,
    closesAt: row.closes_at ?? row.closesAt,
    status: (row.status as MarketStatus) ?? 'open',
    totalPool: row.total_pool ?? row.totalPool ?? 0,
    outcomePools,
    actualOutcome: row.actual_outcome ?? row.actualOutcome ?? null,
    oracleProof: row.oracle_proof ?? row.oracleProof ?? null,
    settledAt: row.settled_at ?? row.settledAt ?? null,
    createdAt: row.created_at ?? row.createdAt,
  };
}

function mapBetRow(row: any): MarketBet {
  return {
    id: row.id,
    orgId: row.org_id ?? row.orgId,
    marketId: row.market_id ?? row.marketId,
    partyId: row.party_id ?? row.partyId,
    outcome: (row.outcome as MarketOutcome),
    amount: row.amount ?? 0,
    potentialPayout: row.potential_payout ?? row.potentialPayout ?? 0,
    actualPayout: row.actual_payout ?? row.actualPayout ?? 0,
    status: (row.status as BetStatus) ?? 'active',
    createdAt: row.created_at ?? row.createdAt,
  };
}
