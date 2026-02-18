/**
 * Proof of Funds Service — "VaultProof"
 *
 * DECO/zkTLS + ZKP for institutional accreditation without exposing balances.
 * Enables privacy-preserving proof that a party holds sufficient funds,
 * upgrading their verification level upon successful verification.
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

export type ProofStatus = 'initiated' | 'attestation_pending' | 'attested' | 'verifying' | 'verified' | 'failed' | 'expired';
export type ProofProvider = 'bank_api' | 'exchange_api' | 'custodian_api' | 'defi_protocol';

export interface FundProof {
  id: string;
  orgId: string;
  partyId: string;
  threshold: number;
  currency: string;
  provider: ProofProvider;
  status: ProofStatus;
  decoSessionId: string | null;
  zkProofHash: string | null;
  attestationData: AttestationData | null;
  verificationLevel: string | null;
  verifiedAt: string | null;
  expiresAt: string;
  createdAt: string;
}

export interface AttestationData {
  provider: string;
  sessionId: string;
  commitment: string;
  proofType: string;
  publicInputs: string[];
  timestamp: string;
}

export interface InitiateProofInput {
  partyId: string;
  threshold: number;
  currency: string;
  provider: ProofProvider;
}

export interface SubmitAttestationInput {
  proofId: string;
  attestation: AttestationData;
  zkProof: string;
}

export interface VerifyProofResult {
  proof: FundProof;
  verificationUpgraded: boolean;
  newLevel: string;
}

// ============================================================================
// Initialisation
// ============================================================================

let _initialised = false;

export async function ensureTables(): Promise<void> {
  if (_initialised) return;

  logger.info('ProofOfFundsService: initialising tables');

  await rawQuery(`
    CREATE TABLE IF NOT EXISTS fund_proofs (
      id                  TEXT PRIMARY KEY,
      org_id              TEXT NOT NULL,
      party_id            TEXT NOT NULL,
      threshold           REAL NOT NULL,
      currency            TEXT NOT NULL DEFAULT 'USD',
      provider            TEXT NOT NULL DEFAULT 'bank_api',
      status              TEXT NOT NULL DEFAULT 'initiated',
      deco_session_id     TEXT,
      zk_proof_hash       TEXT,
      attestation_data    TEXT,
      verification_level  TEXT,
      verified_at         TEXT,
      expires_at          TEXT NOT NULL,
      created_at          TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await rawQuery(`CREATE INDEX IF NOT EXISTS idx_fp_org ON fund_proofs (org_id, status)`);
  await rawQuery(`CREATE INDEX IF NOT EXISTS idx_fp_party ON fund_proofs (party_id, status)`);

  _initialised = true;
  logger.info('ProofOfFundsService: tables ready');
}

// ============================================================================
// Service Methods
// ============================================================================

/**
 * Initiate a proof-of-funds request.
 * Creates a DECO session and returns the proof record for client-side attestation flow.
 */
export async function initiateProof(
  orgId: string,
  input: InitiateProofInput,
): Promise<FundProof> {
  await ensureTables();

  const id = randomUUID();
  const decoSessionId = `deco_${randomUUID().slice(0, 12)}`;
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24h expiry

  await rawQuery(
    `INSERT INTO fund_proofs
       (id, org_id, party_id, threshold, currency, provider, status, deco_session_id, zk_proof_hash, attestation_data, verification_level, verified_at, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'initiated', ?, NULL, NULL, NULL, NULL, ?, ?)`,
    [id, orgId, input.partyId, input.threshold, input.currency, input.provider, decoSessionId, expiresAt, now],
  );

  logger.info('ProofOfFundsService: proof initiated', {
    proofId: id, partyId: input.partyId, threshold: input.threshold, currency: input.currency,
  });

  return {
    id, orgId, partyId: input.partyId,
    threshold: input.threshold, currency: input.currency,
    provider: input.provider, status: 'initiated',
    decoSessionId, zkProofHash: null,
    attestationData: null, verificationLevel: null,
    verifiedAt: null, expiresAt, createdAt: now,
  };
}

/**
 * Submit DECO attestation and ZK proof after client-side flow completes.
 */
export async function submitAttestation(
  orgId: string,
  input: SubmitAttestationInput,
): Promise<FundProof> {
  await ensureTables();

  const rows = await rawQuery<any>(
    `SELECT * FROM fund_proofs WHERE id = ? AND org_id = ? AND status = 'initiated' LIMIT 1`,
    [input.proofId, orgId],
  );
  if (rows.length === 0) throw new Error(`Proof ${input.proofId} not found or not in initiated state`);

  await rawQuery(
    `UPDATE fund_proofs SET status = 'attested', attestation_data = ?, zk_proof_hash = ? WHERE id = ?`,
    [JSON.stringify(input.attestation), input.zkProof, input.proofId],
  );

  logger.info('ProofOfFundsService: attestation submitted', { proofId: input.proofId });

  const proof = mapProofRow(rows[0]);
  return {
    ...proof,
    status: 'attested',
    attestationData: input.attestation,
    zkProofHash: input.zkProof,
  };
}

/**
 * Verify a ZK proof and upgrade the party's verification level.
 */
export async function verifyProof(
  orgId: string,
  proofId: string,
): Promise<VerifyProofResult> {
  await ensureTables();

  const rows = await rawQuery<any>(
    `SELECT * FROM fund_proofs WHERE id = ? AND org_id = ? AND status = 'attested' LIMIT 1`,
    [proofId, orgId],
  );
  if (rows.length === 0) throw new Error(`Proof ${proofId} not found or not in attested state`);

  const proof = mapProofRow(rows[0]);
  const now = new Date().toISOString();

  // Simulate ZK proof verification (in production, this would verify the actual proof)
  const isValid = proof.zkProofHash && proof.attestationData;

  if (!isValid) {
    await rawQuery(
      `UPDATE fund_proofs SET status = 'failed' WHERE id = ?`,
      [proofId],
    );
    return {
      proof: { ...proof, status: 'failed' },
      verificationUpgraded: false,
      newLevel: proof.verificationLevel || 'none',
    };
  }

  // Determine new verification level based on threshold
  const newLevel = proof.threshold >= 1_000_000 ? 'accredited_investor'
    : proof.threshold >= 100_000 ? 'qualified_purchaser'
    : 'verified';

  await rawQuery(
    `UPDATE fund_proofs SET status = 'verified', verification_level = ?, verified_at = ? WHERE id = ?`,
    [newLevel, now, proofId],
  );

  logger.info('ProofOfFundsService: proof verified', { proofId, newLevel });

  return {
    proof: { ...proof, status: 'verified', verificationLevel: newLevel, verifiedAt: now },
    verificationUpgraded: true,
    newLevel,
  };
}

/**
 * Get a single proof by ID.
 */
export async function getProof(proofId: string): Promise<FundProof | null> {
  await ensureTables();

  const rows = await rawQuery<any>(
    `SELECT * FROM fund_proofs WHERE id = ? LIMIT 1`,
    [proofId],
  );
  if (rows.length === 0) return null;
  return mapProofRow(rows[0]);
}

/**
 * List proofs for an organisation.
 */
export async function listProofs(
  orgId: string,
  filters?: { status?: ProofStatus; partyId?: string; limit?: number; offset?: number },
): Promise<{ data: FundProof[]; count: number }> {
  await ensureTables();

  const limit = filters?.limit ?? 50;
  const offset = filters?.offset ?? 0;
  const conditions: string[] = ['org_id = ?'];
  const params: unknown[] = [orgId];

  if (filters?.status) { conditions.push('status = ?'); params.push(filters.status); }
  if (filters?.partyId) { conditions.push('party_id = ?'); params.push(filters.partyId); }

  const where = conditions.join(' AND ');

  const rows = await rawQuery<any>(
    `SELECT * FROM fund_proofs WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );

  const countRows = await rawQuery<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM fund_proofs WHERE ${where}`,
    params,
  );

  return {
    data: rows.map(mapProofRow),
    count: countRows[0]?.cnt ?? 0,
  };
}

// ============================================================================
// Internal Helpers
// ============================================================================

function mapProofRow(row: any): FundProof {
  let attestationData: AttestationData | null = null;

  try {
    const raw = row.attestation_data ?? row.attestationData ?? null;
    attestationData = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : null;
  } catch { /* ignore */ }

  return {
    id: row.id,
    orgId: row.org_id ?? row.orgId,
    partyId: row.party_id ?? row.partyId,
    threshold: row.threshold ?? 0,
    currency: row.currency ?? 'USD',
    provider: (row.provider as ProofProvider) ?? 'bank_api',
    status: (row.status as ProofStatus) ?? 'initiated',
    decoSessionId: row.deco_session_id ?? row.decoSessionId ?? null,
    zkProofHash: row.zk_proof_hash ?? row.zkProofHash ?? null,
    attestationData,
    verificationLevel: row.verification_level ?? row.verificationLevel ?? null,
    verifiedAt: row.verified_at ?? row.verifiedAt ?? null,
    expiresAt: row.expires_at ?? row.expiresAt,
    createdAt: row.created_at ?? row.createdAt,
  };
}
