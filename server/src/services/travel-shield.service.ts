/**
 * Travel Shield Service — "TravelShield"
 *
 * AI agent + parametric insurance + CCIP cross-chain for automatic rebooking.
 * Tokenized travel insurance policies that auto-trigger claims on disruption
 * and execute AI-powered rebooking with cross-chain settlement.
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

export type PolicyStatus = 'active' | 'claim_triggered' | 'rebooking' | 'settled' | 'expired' | 'cancelled';
export type CoverageTier = 'basic' | 'standard' | 'premium';
export type DisruptionType = 'delay' | 'cancellation' | 'diversion' | 'missed_connection';
export type ClaimStatus = 'pending' | 'approved' | 'rejected' | 'paid';
export type RebookingPhase = 'detecting' | 'claiming' | 'searching' | 'rebooking' | 'settling' | 'complete';

export interface TravelPolicy {
  id: string;
  orgId: string;
  partyId: string;
  ticketId: string;
  flightNumber: string;
  departureDate: string;
  coverage: CoverageTier;
  premium: number;
  maxPayout: number;
  status: PolicyStatus;
  claimId: string | null;
  rebookingPhase: RebookingPhase | null;
  disruptionType: DisruptionType | null;
  severity: number;
  aiReasoning: string | null;
  alternativeFlights: AlternativeOption[];
  selectedOption: AlternativeOption | null;
  ccipTxHash: string | null;
  settledAt: string | null;
  createdAt: string;
}

export interface AlternativeOption {
  flightNumber: string;
  departureTime: string;
  arrivalTime: string;
  price: number;
  airline: string;
  score: number;
  reasoning: string;
}

export interface CreatePolicyInput {
  partyId: string;
  ticketId: string;
  flightNumber: string;
  departureDate: string;
  coverage: CoverageTier;
  premium: number;
}

export interface TriggerClaimInput {
  policyId: string;
  disruptionType: DisruptionType;
  severity: number;
}

export interface ExecuteRebookingInput {
  policyId: string;
  alternatives: AlternativeOption[];
  selectedOption: AlternativeOption;
}

// ============================================================================
// Constants
// ============================================================================

const COVERAGE_MULTIPLIERS: Record<CoverageTier, number> = {
  basic: 2,
  standard: 5,
  premium: 10,
};

// ============================================================================
// Initialisation
// ============================================================================

let _initialised = false;

export async function ensureTables(): Promise<void> {
  if (_initialised) return;

  logger.info('TravelShieldService: initialising tables');

  await rawQuery(`
    CREATE TABLE IF NOT EXISTS travel_policies (
      id                  TEXT PRIMARY KEY,
      org_id              TEXT NOT NULL,
      party_id            TEXT NOT NULL,
      ticket_id           TEXT NOT NULL,
      flight_number       TEXT NOT NULL,
      departure_date      TEXT NOT NULL,
      coverage            TEXT NOT NULL DEFAULT 'basic',
      premium             REAL NOT NULL DEFAULT 0,
      max_payout          REAL NOT NULL DEFAULT 0,
      status              TEXT NOT NULL DEFAULT 'active',
      claim_id            TEXT,
      rebooking_phase     TEXT,
      disruption_type     TEXT,
      severity            REAL NOT NULL DEFAULT 0,
      ai_reasoning        TEXT,
      alternative_flights TEXT NOT NULL DEFAULT '[]',
      selected_option     TEXT,
      ccip_tx_hash        TEXT,
      settled_at          TEXT,
      created_at          TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await rawQuery(`CREATE INDEX IF NOT EXISTS idx_tp_org ON travel_policies (org_id, status)`);
  await rawQuery(`CREATE INDEX IF NOT EXISTS idx_tp_flight ON travel_policies (flight_number, departure_date)`);
  await rawQuery(`CREATE INDEX IF NOT EXISTS idx_tp_party ON travel_policies (party_id)`);

  _initialised = true;
  logger.info('TravelShieldService: tables ready');
}

// ============================================================================
// Service Methods
// ============================================================================

/**
 * Create a parametric insurance policy for a flight ticket.
 */
export async function createPolicy(
  orgId: string,
  input: CreatePolicyInput,
): Promise<TravelPolicy> {
  await ensureTables();

  const id = randomUUID();
  const now = new Date().toISOString();
  const maxPayout = input.premium * COVERAGE_MULTIPLIERS[input.coverage];

  await rawQuery(
    `INSERT INTO travel_policies
       (id, org_id, party_id, ticket_id, flight_number, departure_date, coverage, premium, max_payout, status, claim_id, rebooking_phase, disruption_type, severity, ai_reasoning, alternative_flights, selected_option, ccip_tx_hash, settled_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', NULL, NULL, NULL, 0, NULL, '[]', NULL, NULL, NULL, ?)`,
    [id, orgId, input.partyId, input.ticketId, input.flightNumber, input.departureDate, input.coverage, input.premium, maxPayout, now],
  );

  logger.info('TravelShieldService: policy created', { policyId: id, flight: input.flightNumber, coverage: input.coverage });

  return {
    id, orgId, partyId: input.partyId, ticketId: input.ticketId,
    flightNumber: input.flightNumber, departureDate: input.departureDate,
    coverage: input.coverage, premium: input.premium, maxPayout,
    status: 'active', claimId: null, rebookingPhase: null,
    disruptionType: null, severity: 0, aiReasoning: null,
    alternativeFlights: [], selectedOption: null,
    ccipTxHash: null, settledAt: null, createdAt: now,
  };
}

/**
 * Auto-trigger a claim when disruption is detected.
 */
export async function triggerClaim(
  orgId: string,
  input: TriggerClaimInput,
): Promise<TravelPolicy> {
  await ensureTables();

  const rows = await rawQuery<any>(
    `SELECT * FROM travel_policies WHERE id = ? AND org_id = ? AND status = 'active' LIMIT 1`,
    [input.policyId, orgId],
  );
  if (rows.length === 0) throw new Error(`Policy ${input.policyId} not found or not active`);

  const claimId = randomUUID();

  await rawQuery(
    `UPDATE travel_policies SET status = 'claim_triggered', claim_id = ?, disruption_type = ?, severity = ?, rebooking_phase = 'detecting' WHERE id = ?`,
    [claimId, input.disruptionType, input.severity, input.policyId],
  );

  logger.info('TravelShieldService: claim triggered', { policyId: input.policyId, claimId, disruption: input.disruptionType });

  const policy = mapPolicyRow(rows[0]);
  return {
    ...policy,
    status: 'claim_triggered',
    claimId,
    disruptionType: input.disruptionType,
    severity: input.severity,
    rebookingPhase: 'detecting',
  };
}

/**
 * Execute AI-powered rebooking. The AI selects the best option from alternatives,
 * simulates CCIP cross-chain payment, and settles the policy.
 */
export async function executeRebooking(
  orgId: string,
  input: ExecuteRebookingInput,
): Promise<TravelPolicy> {
  await ensureTables();

  const rows = await rawQuery<any>(
    `SELECT * FROM travel_policies WHERE id = ? AND org_id = ? AND status = 'claim_triggered' LIMIT 1`,
    [input.policyId, orgId],
  );
  if (rows.length === 0) throw new Error(`Policy ${input.policyId} not found or claim not triggered`);

  const policy = mapPolicyRow(rows[0]);
  const now = new Date().toISOString();

  // Simulate AI reasoning
  const aiReasoning = `Selected ${input.selectedOption.flightNumber} (score: ${input.selectedOption.score}/100). ${input.selectedOption.reasoning}. Cost: $${input.selectedOption.price} within max payout of $${policy.maxPayout}.`;

  // Simulate CCIP cross-chain tx hash
  const ccipTxHash = `0x${randomUUID().replace(/-/g, '')}`;

  await rawQuery(
    `UPDATE travel_policies
     SET status = 'settled', rebooking_phase = 'complete', ai_reasoning = ?,
         alternative_flights = ?, selected_option = ?, ccip_tx_hash = ?, settled_at = ?
     WHERE id = ?`,
    [
      aiReasoning, JSON.stringify(input.alternatives),
      JSON.stringify(input.selectedOption), ccipTxHash, now, input.policyId,
    ],
  );

  logger.info('TravelShieldService: rebooking executed', {
    policyId: input.policyId, newFlight: input.selectedOption.flightNumber, ccipTxHash,
  });

  return {
    ...policy,
    status: 'settled',
    rebookingPhase: 'complete',
    aiReasoning,
    alternativeFlights: input.alternatives,
    selectedOption: input.selectedOption,
    ccipTxHash,
    settledAt: now,
  };
}

/**
 * Get a single policy by ID.
 */
export async function getPolicy(policyId: string): Promise<TravelPolicy | null> {
  await ensureTables();

  const rows = await rawQuery<any>(
    `SELECT * FROM travel_policies WHERE id = ? LIMIT 1`,
    [policyId],
  );
  if (rows.length === 0) return null;
  return mapPolicyRow(rows[0]);
}

/**
 * List policies for an organisation.
 */
export async function listPolicies(
  orgId: string,
  filters?: { status?: PolicyStatus; partyId?: string; flightNumber?: string; limit?: number; offset?: number },
): Promise<{ data: TravelPolicy[]; count: number }> {
  await ensureTables();

  const limit = filters?.limit ?? 50;
  const offset = filters?.offset ?? 0;
  const conditions: string[] = ['org_id = ?'];
  const params: unknown[] = [orgId];

  if (filters?.status) { conditions.push('status = ?'); params.push(filters.status); }
  if (filters?.partyId) { conditions.push('party_id = ?'); params.push(filters.partyId); }
  if (filters?.flightNumber) { conditions.push('flight_number = ?'); params.push(filters.flightNumber); }

  const where = conditions.join(' AND ');

  const rows = await rawQuery<any>(
    `SELECT * FROM travel_policies WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );

  const countRows = await rawQuery<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM travel_policies WHERE ${where}`,
    params,
  );

  return {
    data: rows.map(mapPolicyRow),
    count: countRows[0]?.cnt ?? 0,
  };
}

// ============================================================================
// Internal Helpers
// ============================================================================

function mapPolicyRow(row: any): TravelPolicy {
  let alternativeFlights: AlternativeOption[] = [];
  let selectedOption: AlternativeOption | null = null;

  try {
    const rawAlts = row.alternative_flights ?? row.alternativeFlights ?? '[]';
    alternativeFlights = typeof rawAlts === 'string' ? JSON.parse(rawAlts) : rawAlts;
  } catch { /* ignore */ }

  try {
    const rawSelected = row.selected_option ?? row.selectedOption ?? null;
    selectedOption = rawSelected ? (typeof rawSelected === 'string' ? JSON.parse(rawSelected) : rawSelected) : null;
  } catch { /* ignore */ }

  return {
    id: row.id,
    orgId: row.org_id ?? row.orgId,
    partyId: row.party_id ?? row.partyId,
    ticketId: row.ticket_id ?? row.ticketId,
    flightNumber: row.flight_number ?? row.flightNumber,
    departureDate: row.departure_date ?? row.departureDate,
    coverage: (row.coverage as CoverageTier) ?? 'basic',
    premium: row.premium ?? 0,
    maxPayout: row.max_payout ?? row.maxPayout ?? 0,
    status: (row.status as PolicyStatus) ?? 'active',
    claimId: row.claim_id ?? row.claimId ?? null,
    rebookingPhase: (row.rebooking_phase ?? row.rebookingPhase ?? null) as RebookingPhase | null,
    disruptionType: (row.disruption_type ?? row.disruptionType ?? null) as DisruptionType | null,
    severity: row.severity ?? 0,
    aiReasoning: row.ai_reasoning ?? row.aiReasoning ?? null,
    alternativeFlights,
    selectedOption,
    ccipTxHash: row.ccip_tx_hash ?? row.ccipTxHash ?? null,
    settledAt: row.settled_at ?? row.settledAt ?? null,
    createdAt: row.created_at ?? row.createdAt,
  };
}
