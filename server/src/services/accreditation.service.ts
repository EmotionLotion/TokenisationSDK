/**
 * Accreditation Verification Service (Gap 17)
 *
 * Manages investor accreditation workflows including submission,
 * review, verification, rejection, and expiry checks.
 * Uses rawQuery for direct SQL access, consistent with existing service patterns.
 */

import { rawQuery } from '../config/database.js';
import { randomUUID } from 'crypto';
import { NotFoundError, ValidationError } from '../middleware/errorHandler.js';
import { logger } from '../middleware/logger.js';

// ============================================================================
// Types
// ============================================================================

export type AccreditationType =
  | 'self_certification'
  | 'income_verification'
  | 'net_worth'
  | 'professional_certificate'
  | 'third_party';

export type AccreditationStatus =
  | 'submitted'
  | 'in_review'
  | 'verified'
  | 'rejected'
  | 'expired';

export interface AccreditationSubmission {
  id: string;
  orgId: string;
  investorId: string;
  type: AccreditationType;
  evidenceRefs: string[];
  status: AccreditationStatus;
  reviewerNotes: string | null;
  verifiedBy: string | null;
  verifiedAt: string | null;
  expiresAt: string | null;
  rejectedBy: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

interface AccreditationRow {
  id: string;
  org_id: string;
  investor_id: string;
  type: string;
  evidence_refs: string;
  status: string;
  reviewer_notes: string | null;
  verified_by: string | null;
  verified_at: string | null;
  expires_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  metadata: string;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Schema Initialization
// ============================================================================

/**
 * Ensure the accreditation_submissions table exists.
 * This is called lazily on first use; production deployments should run
 * migrations instead.
 */
let tableInitialized = false;

async function ensureTable(): Promise<void> {
  if (tableInitialized) return;

  await rawQuery(`
    CREATE TABLE IF NOT EXISTS accreditation_submissions (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL,
      investor_id TEXT NOT NULL,
      type TEXT NOT NULL,
      evidence_refs TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'submitted',
      reviewer_notes TEXT,
      verified_by TEXT,
      verified_at TEXT,
      expires_at TEXT,
      rejected_by TEXT,
      rejected_at TEXT,
      rejection_reason TEXT,
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Indexes for common queries
  await rawQuery(`
    CREATE INDEX IF NOT EXISTS idx_accreditation_org_investor
    ON accreditation_submissions(org_id, investor_id)
  `);
  await rawQuery(`
    CREATE INDEX IF NOT EXISTS idx_accreditation_status
    ON accreditation_submissions(status)
  `);
  await rawQuery(`
    CREATE INDEX IF NOT EXISTS idx_accreditation_expires
    ON accreditation_submissions(expires_at)
  `);

  tableInitialized = true;
}

// ============================================================================
// Row Mapping
// ============================================================================

function rowToSubmission(row: AccreditationRow): AccreditationSubmission {
  return {
    id: row.id,
    orgId: row.org_id,
    investorId: row.investor_id,
    type: row.type as AccreditationType,
    evidenceRefs: safeParseJson<string[]>(row.evidence_refs, []),
    status: row.status as AccreditationStatus,
    reviewerNotes: row.reviewer_notes,
    verifiedBy: row.verified_by,
    verifiedAt: row.verified_at,
    expiresAt: row.expires_at,
    rejectedBy: row.rejected_by,
    rejectedAt: row.rejected_at,
    rejectionReason: row.rejection_reason,
    metadata: safeParseJson<Record<string, unknown>>(row.metadata, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function safeParseJson<T>(value: string | T, fallback: T): T {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value ?? fallback;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Submit a new accreditation application.
 */
export async function submitAccreditation(
  orgId: string,
  investorId: string,
  type: AccreditationType,
  evidenceRefs: string[],
  metadata?: Record<string, unknown>,
): Promise<AccreditationSubmission> {
  await ensureTable();

  const validTypes: AccreditationType[] = [
    'self_certification',
    'income_verification',
    'net_worth',
    'professional_certificate',
    'third_party',
  ];
  if (!validTypes.includes(type)) {
    throw new ValidationError(`Invalid accreditation type: ${type}`);
  }

  if (!evidenceRefs || evidenceRefs.length === 0) {
    throw new ValidationError('At least one evidence reference is required');
  }

  // Check that investor exists
  const investorRows = await rawQuery(
    'SELECT id FROM investors WHERE id = $1 AND org_id = $2 LIMIT 1',
    [investorId, orgId],
  );
  if (!investorRows || investorRows.length === 0) {
    throw new NotFoundError('Investor not found');
  }

  const id = randomUUID();
  const now = new Date().toISOString();

  await rawQuery(
    `INSERT INTO accreditation_submissions
       (id, org_id, investor_id, type, evidence_refs, status, metadata, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, 'submitted', $6, $7, $7)`,
    [
      id,
      orgId,
      investorId,
      type,
      JSON.stringify(evidenceRefs),
      JSON.stringify(metadata ?? {}),
      now,
    ],
  );

  logger.info('Accreditation submitted', { id, investorId, type, orgId });

  return fetchSubmission(id, orgId);
}

/**
 * Move a submission into review status.
 */
export async function reviewAccreditation(
  submissionId: string,
  orgId: string,
): Promise<AccreditationSubmission> {
  await ensureTable();

  const submission = await fetchSubmission(submissionId, orgId);

  if (submission.status !== 'submitted') {
    throw new ValidationError(
      `Cannot review submission in status: ${submission.status}`,
    );
  }

  const now = new Date().toISOString();
  await rawQuery(
    `UPDATE accreditation_submissions
     SET status = 'in_review', updated_at = $1
     WHERE id = $2 AND org_id = $3`,
    [now, submissionId, orgId],
  );

  logger.info('Accreditation moved to review', { submissionId, orgId });
  return fetchSubmission(submissionId, orgId);
}

/**
 * Verify (approve) an accreditation submission.
 * Sets status to 'verified', computes expiresAt (1 year),
 * and updates the investor's accredited_status.
 */
export async function verifyAccreditation(
  submissionId: string,
  orgId: string,
  verifiedBy: string,
): Promise<AccreditationSubmission> {
  await ensureTable();

  const submission = await fetchSubmission(submissionId, orgId);

  if (submission.status !== 'submitted' && submission.status !== 'in_review') {
    throw new ValidationError(
      `Cannot verify submission in status: ${submission.status}`,
    );
  }

  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setFullYear(expiresAt.getFullYear() + 1);

  await rawQuery(
    `UPDATE accreditation_submissions
     SET status = 'verified',
         verified_by = $1,
         verified_at = $2,
         expires_at = $3,
         updated_at = $2
     WHERE id = $4 AND org_id = $5`,
    [
      verifiedBy,
      now.toISOString(),
      expiresAt.toISOString(),
      submissionId,
      orgId,
    ],
  );

  // Update investor accredited status
  await rawQuery(
    `UPDATE investors
     SET accredited_status = 'verified',
         accredited_verified_at = $1,
         accredited_expires_at = $2,
         updated_at = $1
     WHERE id = $3 AND org_id = $4`,
    [now.toISOString(), expiresAt.toISOString(), submission.investorId, orgId],
  );

  logger.info('Accreditation verified', {
    submissionId,
    investorId: submission.investorId,
    verifiedBy,
    expiresAt: expiresAt.toISOString(),
  });

  return fetchSubmission(submissionId, orgId);
}

/**
 * Reject an accreditation submission.
 */
export async function rejectAccreditation(
  submissionId: string,
  orgId: string,
  rejectedBy: string,
  reason: string,
): Promise<AccreditationSubmission> {
  await ensureTable();

  const submission = await fetchSubmission(submissionId, orgId);

  if (submission.status !== 'submitted' && submission.status !== 'in_review') {
    throw new ValidationError(
      `Cannot reject submission in status: ${submission.status}`,
    );
  }

  if (!reason || reason.trim().length === 0) {
    throw new ValidationError('Rejection reason is required');
  }

  const now = new Date().toISOString();

  await rawQuery(
    `UPDATE accreditation_submissions
     SET status = 'rejected',
         rejected_by = $1,
         rejected_at = $2,
         rejection_reason = $3,
         updated_at = $2
     WHERE id = $4 AND org_id = $5`,
    [rejectedBy, now, reason, submissionId, orgId],
  );

  // Update investor accredited status
  await rawQuery(
    `UPDATE investors
     SET accredited_status = 'rejected',
         updated_at = $1
     WHERE id = $2 AND org_id = $3`,
    [now, submission.investorId, orgId],
  );

  logger.info('Accreditation rejected', {
    submissionId,
    investorId: submission.investorId,
    rejectedBy,
    reason,
  });

  return fetchSubmission(submissionId, orgId);
}

/**
 * Get the latest accreditation submission for an investor.
 */
export async function getAccreditation(
  investorId: string,
  orgId: string,
): Promise<AccreditationSubmission> {
  await ensureTable();

  const rows = await rawQuery<AccreditationRow>(
    `SELECT * FROM accreditation_submissions
     WHERE investor_id = $1 AND org_id = $2
     ORDER BY created_at DESC
     LIMIT 1`,
    [investorId, orgId],
  );

  if (!rows || rows.length === 0) {
    throw new NotFoundError('No accreditation submission found for this investor');
  }

  return rowToSubmission(rows[0]);
}

/**
 * Check for expired verified accreditations and revert investor status.
 * This should be called periodically by a scheduler/cron job.
 */
export async function checkExpiry(
  orgId: string,
): Promise<Array<{ submissionId: string; investorId: string; expiredAt: string }>> {
  await ensureTable();

  const now = new Date().toISOString();

  // Find all verified submissions that have expired
  const expiredRows = await rawQuery<AccreditationRow>(
    `SELECT * FROM accreditation_submissions
     WHERE org_id = $1
       AND status = 'verified'
       AND expires_at IS NOT NULL
       AND expires_at <= $2`,
    [orgId, now],
  );

  if (!expiredRows || expiredRows.length === 0) {
    return [];
  }

  const results: Array<{ submissionId: string; investorId: string; expiredAt: string }> = [];

  for (const row of expiredRows) {
    // Mark submission as expired
    await rawQuery(
      `UPDATE accreditation_submissions
       SET status = 'expired', updated_at = $1
       WHERE id = $2 AND org_id = $3`,
      [now, row.id, orgId],
    );

    // Revert investor accredited status
    await rawQuery(
      `UPDATE investors
       SET accredited_status = 'expired',
           updated_at = $1
       WHERE id = $2 AND org_id = $3`,
      [now, row.investor_id, orgId],
    );

    results.push({
      submissionId: row.id,
      investorId: row.investor_id,
      expiredAt: row.expires_at!,
    });

    logger.info('Accreditation expired', {
      submissionId: row.id,
      investorId: row.investor_id,
      expiredAt: row.expires_at,
    });
  }

  logger.info('Accreditation expiry check completed', {
    orgId,
    expiredCount: results.length,
  });

  return results;
}

// ============================================================================
// Internal Helpers
// ============================================================================

async function fetchSubmission(
  submissionId: string,
  orgId: string,
): Promise<AccreditationSubmission> {
  const rows = await rawQuery<AccreditationRow>(
    `SELECT * FROM accreditation_submissions
     WHERE id = $1 AND org_id = $2
     LIMIT 1`,
    [submissionId, orgId],
  );

  if (!rows || rows.length === 0) {
    throw new NotFoundError('Accreditation submission not found');
  }

  return rowToSubmission(rows[0]);
}
