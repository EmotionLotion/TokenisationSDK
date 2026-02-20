/**
 * Data Retention & GDPR Compliance Service
 *
 * Handles:
 * - Configurable data retention policies per data category
 * - Automated PII cleanup for expired records
 * - GDPR deletion request handling (Right to Erasure)
 * - Data export for portability requests (Right to Data Portability)
 */

import { db, schema, rawQuery } from '../config/database.js';
import { eq, and, lte, sql } from 'drizzle-orm';
import { logger } from '../middleware/logger.js';
import { randomUUID, createHash } from 'crypto';
import { NotFoundError, ValidationError } from '../middleware/errorHandler.js';

// ============================================================================
// Types & Configuration
// ============================================================================

export interface RetentionPolicy {
  category: string;
  retentionDays: number;
  description: string;
  piiFields: string[];
  tableName: string;
  timestampColumn: string;
  orgScoped: boolean;
}

export type DeletionRequestStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'rejected';

export interface DeletionRequest {
  id: string;
  orgId: string;
  subjectId: string;        // The investor/user ID requesting deletion
  subjectEmail: string;
  requestType: 'erasure' | 'portability';
  status: DeletionRequestStatus;
  reason: string | null;
  processedAt: string | null;
  processedBy: string | null;
  deletionLog: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/**
 * Default retention policies.
 * These can be overridden via environment or database configuration.
 */
const DEFAULT_RETENTION_POLICIES: RetentionPolicy[] = [
  {
    category: 'kyc_sessions',
    retentionDays: 365 * 5,  // 5 years (regulatory requirement)
    description: 'KYC verification records — retained for AML compliance',
    piiFields: ['first_name', 'last_name', 'date_of_birth', 'nationality', 'document_number'],
    tableName: 'kyc_sessions',
    timestampColumn: 'created_at',
    orgScoped: true,
  },
  {
    category: 'audit_logs',
    retentionDays: 365 * 7,  // 7 years (financial audit requirement)
    description: 'Audit trail — retained for regulatory compliance',
    piiFields: ['ip_address', 'user_agent'],
    tableName: 'audit_log',
    timestampColumn: 'created_at',
    orgScoped: true,
  },
  {
    category: 'sessions',
    retentionDays: 90,       // 90 days
    description: 'User sessions — cleaned up after expiry',
    piiFields: ['wallet_address', 'refresh_token_hash'],
    tableName: 'sessions',
    timestampColumn: 'created_at',
    orgScoped: false,
  },
  {
    category: 'webhook_deliveries',
    retentionDays: 180,      // 6 months
    description: 'Webhook delivery logs',
    piiFields: [],
    tableName: 'webhook_deliveries',
    timestampColumn: 'created_at',
    orgScoped: true,
  },
  {
    category: 'event_bus',
    retentionDays: 30,       // 30 days
    description: 'Internal event bus messages',
    piiFields: [],
    tableName: 'event_bus_queue',
    timestampColumn: 'created_at',
    orgScoped: true,
  },
];

// ============================================================================
// Table Initialization
// ============================================================================

let _initialized = false;

async function ensureTable(): Promise<void> {
  if (_initialized) return;

  await rawQuery(`
    CREATE TABLE IF NOT EXISTS gdpr_deletion_requests (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      subject_email TEXT NOT NULL,
      request_type TEXT NOT NULL DEFAULT 'erasure',
      status TEXT NOT NULL DEFAULT 'pending',
      reason TEXT,
      processed_at TEXT,
      processed_by TEXT,
      deletion_log TEXT DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await rawQuery(`CREATE INDEX IF NOT EXISTS idx_gdpr_org ON gdpr_deletion_requests (org_id, status)`);
  await rawQuery(`CREATE INDEX IF NOT EXISTS idx_gdpr_subject ON gdpr_deletion_requests (subject_id)`);

  _initialized = true;
}

// ============================================================================
// Retention Policy Management
// ============================================================================

/**
 * Get all configured retention policies.
 */
export function getRetentionPolicies(): RetentionPolicy[] {
  // In production, these could be loaded from database
  return [...DEFAULT_RETENTION_POLICIES];
}

/**
 * Run automated PII cleanup based on retention policies.
 * Should be called by a scheduled job (e.g., daily).
 */
export async function runRetentionCleanup(orgId?: string): Promise<{
  policiesProcessed: number;
  totalRecordsCleaned: number;
  details: Array<{ category: string; recordsCleaned: number; errors?: string }>;
}> {
  const policies = getRetentionPolicies();
  const details: Array<{ category: string; recordsCleaned: number; errors?: string }> = [];
  let totalRecordsCleaned = 0;

  for (const policy of policies) {
    try {
      const cutoffDate = new Date(Date.now() - policy.retentionDays * 24 * 60 * 60 * 1000).toISOString();

      let recordsCleaned = 0;

      if (policy.piiFields.length > 0) {
        // Anonymize PII fields instead of deleting (preserve record for audit)
        const setClause = policy.piiFields
          .map(field => `${field} = '[REDACTED]'`)
          .join(', ');

        const conditions = [`${policy.timestampColumn} < ?`];
        const params: unknown[] = [cutoffDate];

        if (policy.orgScoped && orgId) {
          conditions.push('org_id = ?');
          params.push(orgId);
        }

        // Only anonymize records that haven't been redacted yet
        conditions.push(`${policy.piiFields[0]} != '[REDACTED]'`);

        const result = await rawQuery(
          `UPDATE ${policy.tableName} SET ${setClause}, updated_at = datetime('now') WHERE ${conditions.join(' AND ')}`,
          params
        );

        recordsCleaned = Array.isArray(result) ? result.length : 0;
      } else {
        // No PII fields — safe to delete old records entirely
        const conditions = [`${policy.timestampColumn} < ?`];
        const params: unknown[] = [cutoffDate];

        if (policy.orgScoped && orgId) {
          conditions.push('org_id = ?');
          params.push(orgId);
        }

        await rawQuery(
          `DELETE FROM ${policy.tableName} WHERE ${conditions.join(' AND ')}`,
          params
        );
      }

      details.push({ category: policy.category, recordsCleaned });
      totalRecordsCleaned += recordsCleaned;

      logger.info(`[DataRetention] Cleaned ${policy.category}`, {
        metadata: { recordsCleaned, cutoffDate, orgId },
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'unknown';
      details.push({ category: policy.category, recordsCleaned: 0, errors: errorMsg });
      logger.warn(`[DataRetention] Failed to clean ${policy.category}`, {
        metadata: { error: errorMsg, orgId },
      });
    }
  }

  return { policiesProcessed: policies.length, totalRecordsCleaned, details };
}

// ============================================================================
// GDPR Deletion Requests (Right to Erasure)
// ============================================================================

/**
 * Submit a GDPR deletion request.
 */
export async function submitDeletionRequest(
  orgId: string,
  subjectId: string,
  subjectEmail: string,
  requestType: 'erasure' | 'portability' = 'erasure',
  reason?: string
): Promise<DeletionRequest> {
  await ensureTable();

  const id = `gdpr_${randomUUID().replace(/-/g, '')}`;
  const now = new Date().toISOString();

  await rawQuery(
    `INSERT INTO gdpr_deletion_requests
      (id, org_id, subject_id, subject_email, request_type, status, reason, deletion_log, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'pending', ?, '{}', ?, ?)`,
    [id, orgId, subjectId, subjectEmail, requestType, reason || null, now, now]
  );

  logger.info('[DataRetention] GDPR deletion request submitted', {
    metadata: { requestId: id, orgId, subjectId, requestType },
  });

  return findDeletionRequest(id, orgId);
}

/**
 * Process a GDPR erasure request.
 * Anonymizes all PII for the subject across all tables.
 */
export async function processDeletionRequest(
  requestId: string,
  orgId: string,
  processedBy: string
): Promise<DeletionRequest> {
  await ensureTable();

  const request = await findDeletionRequest(requestId, orgId);

  if (request.status !== 'pending') {
    throw new ValidationError(`Request is already ${request.status}`);
  }

  // Update to processing
  await rawQuery(
    `UPDATE gdpr_deletion_requests SET status = 'processing', updated_at = datetime('now') WHERE id = ?`,
    [requestId]
  );

  const deletionLog: Record<string, unknown> = {};

  try {
    // Anonymize investor records
    try {
      await rawQuery(
        `UPDATE investors SET
          name = '[REDACTED]', email = '[REDACTED]',
          wallet_address = '[REDACTED]', metadata = '{"gdpr_redacted": true}',
          updated_at = datetime('now')
         WHERE id = ? AND org_id = ?`,
        [request.subjectId, orgId]
      );
      deletionLog['investors'] = 'anonymized';
    } catch (err) {
      deletionLog['investors'] = `error: ${err instanceof Error ? err.message : 'unknown'}`;
    }

    // Anonymize KYC sessions
    try {
      await rawQuery(
        `UPDATE kyc_sessions SET
          first_name = '[REDACTED]', last_name = '[REDACTED]',
          date_of_birth = '[REDACTED]', nationality = '[REDACTED]',
          updated_at = datetime('now')
         WHERE investor_id = ? AND org_id = ?`,
        [request.subjectId, orgId]
      );
      deletionLog['kyc_sessions'] = 'anonymized';
    } catch (err) {
      deletionLog['kyc_sessions'] = `error: ${err instanceof Error ? err.message : 'unknown'}`;
    }

    // Anonymize sessions
    try {
      await rawQuery(
        `DELETE FROM sessions WHERE party_id = ?`,
        [request.subjectId]
      );
      deletionLog['sessions'] = 'deleted';
    } catch (err) {
      deletionLog['sessions'] = `error: ${err instanceof Error ? err.message : 'unknown'}`;
    }

    // Note: Audit logs and financial records are retained for regulatory compliance
    // but PII within them is anonymized
    try {
      await rawQuery(
        `UPDATE audit_log SET
          ip_address = '[REDACTED]', user_agent = '[REDACTED]',
          metadata = json_set(COALESCE(metadata, '{}'), '$.gdpr_redacted', 'true')
         WHERE actor_id = ? AND org_id = ?`,
        [request.subjectId, orgId]
      );
      deletionLog['audit_log'] = 'pii_anonymized';
    } catch (err) {
      deletionLog['audit_log'] = `error: ${err instanceof Error ? err.message : 'unknown'}`;
    }

    // Mark as completed
    const now = new Date().toISOString();
    await rawQuery(
      `UPDATE gdpr_deletion_requests SET
        status = 'completed', processed_at = ?, processed_by = ?,
        deletion_log = ?, updated_at = ?
       WHERE id = ?`,
      [now, processedBy, JSON.stringify(deletionLog), now, requestId]
    );

    logger.info('[DataRetention] GDPR deletion request completed', {
      metadata: { requestId, subjectId: request.subjectId, deletionLog },
    });
  } catch (err) {
    await rawQuery(
      `UPDATE gdpr_deletion_requests SET
        status = 'failed', deletion_log = ?, updated_at = datetime('now')
       WHERE id = ?`,
      [JSON.stringify({ ...deletionLog, finalError: err instanceof Error ? err.message : 'unknown' }), requestId]
    );

    throw err;
  }

  return findDeletionRequest(requestId, orgId);
}

/**
 * Export all data for a subject (Right to Data Portability).
 */
export async function exportSubjectData(
  orgId: string,
  subjectId: string
): Promise<Record<string, unknown>> {
  const data: Record<string, unknown> = {
    exportedAt: new Date().toISOString(),
    subjectId,
    orgId,
  };

  // Investor profile
  try {
    const investors = await rawQuery(
      'SELECT * FROM investors WHERE id = ? AND org_id = ?',
      [subjectId, orgId]
    );
    data['profile'] = investors[0] || null;
  } catch { /* table may not exist */ }

  // KYC sessions
  try {
    const kyc = await rawQuery(
      'SELECT * FROM kyc_sessions WHERE investor_id = ? AND org_id = ?',
      [subjectId, orgId]
    );
    data['kycSessions'] = kyc;
  } catch { /* table may not exist */ }

  // Transfers
  try {
    const transfers = await rawQuery(
      'SELECT * FROM transfers WHERE (from_investor_id = ? OR to_investor_id = ?) AND org_id = ?',
      [subjectId, subjectId, orgId]
    );
    data['transfers'] = transfers;
  } catch { /* table may not exist */ }

  // Ledger positions
  try {
    const positions = await rawQuery(
      'SELECT * FROM ledger_positions WHERE investor_id = ? AND org_id = ?',
      [subjectId, orgId]
    );
    data['positions'] = positions;
  } catch { /* table may not exist */ }

  // Distributions received
  try {
    const distributions = await rawQuery(
      'SELECT * FROM distributions WHERE investor_id = ? AND org_id = ?',
      [subjectId, orgId]
    );
    data['distributions'] = distributions;
  } catch { /* table may not exist */ }

  return data;
}

/**
 * List GDPR deletion requests.
 */
export async function listDeletionRequests(
  orgId: string,
  filters?: { status?: DeletionRequestStatus; limit?: number; offset?: number }
): Promise<{ data: DeletionRequest[]; count: number }> {
  await ensureTable();

  const conditions = ['org_id = ?'];
  const params: unknown[] = [orgId];

  if (filters?.status) {
    conditions.push('status = ?');
    params.push(filters.status);
  }

  const where = conditions.join(' AND ');
  const limit = filters?.limit ?? 50;
  const offset = filters?.offset ?? 0;

  const rows = await rawQuery(
    `SELECT * FROM gdpr_deletion_requests WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const countRows = await rawQuery<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM gdpr_deletion_requests WHERE ${where}`,
    params
  );

  return {
    data: (rows || []).map(mapRow),
    count: countRows[0]?.cnt ?? 0,
  };
}

// ============================================================================
// Helpers
// ============================================================================

async function findDeletionRequest(id: string, orgId: string): Promise<DeletionRequest> {
  const rows = await rawQuery(
    'SELECT * FROM gdpr_deletion_requests WHERE id = ? AND org_id = ? LIMIT 1',
    [id, orgId]
  );

  if (!rows || rows.length === 0) {
    throw new NotFoundError('GDPR deletion request not found');
  }

  return mapRow(rows[0]);
}

function mapRow(row: any): DeletionRequest {
  return {
    id: row.id,
    orgId: row.org_id,
    subjectId: row.subject_id,
    subjectEmail: row.subject_email,
    requestType: row.request_type,
    status: row.status,
    reason: row.reason || null,
    processedAt: row.processed_at || null,
    processedBy: row.processed_by || null,
    deletionLog: typeof row.deletion_log === 'string' ? JSON.parse(row.deletion_log) : (row.deletion_log || {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
