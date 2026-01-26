import { db, schema } from '../config/database.js';
import { eq, and, desc, gte, lte, sql } from 'drizzle-orm';
import { createHash } from 'crypto';
import { NotFoundError, ValidationError } from '../middleware/errorHandler.js';

const { auditLog } = schema;

// ============================================================================
// Types & Interfaces
// ============================================================================

export type AuditAction =
  | 'create' | 'read' | 'update' | 'delete'
  | 'login' | 'logout' | 'login_failed'
  | 'api_key_created' | 'api_key_revoked'
  | 'policy_created' | 'policy_updated' | 'policy_activated'
  | 'decision_created' | 'decision_approved' | 'decision_rejected'
  | 'transfer_created' | 'transfer_approved' | 'transfer_cancelled' | 'transfer_settled'
  | 'token_deployed' | 'token_issued' | 'token_redeemed' | 'token_frozen' | 'token_unfrozen'
  | 'webhook_created' | 'webhook_delivered' | 'webhook_failed'
  | 'dld_title_registered' | 'dld_title_verified' | 'dld_event_processed'
  | 'compliance_check_passed' | 'compliance_check_failed'
  | 'investor_kyc_started' | 'investor_kyc_approved' | 'investor_kyc_rejected'
  | 'document_uploaded' | 'document_verified' | 'document_rejected';

export type AuditResourceType =
  | 'org' | 'user' | 'role' | 'api_key'
  | 'project' | 'document'
  | 'investor' | 'kyc_session'
  | 'policy' | 'decision'
  | 'token' | 'transfer' | 'issuance' | 'redemption'
  | 'webhook_endpoint' | 'webhook_delivery'
  | 'dld_title' | 'dld_event'
  | 'ledger_position' | 'cap_table_snapshot';

export interface CreateAuditLogInput {
  orgId: string;
  actorId?: string;
  actorType: 'user' | 'api_key' | 'system' | 'webhook';
  action: AuditAction | string;
  resourceType: AuditResourceType | string;
  resourceId: string;
  description?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export interface AuditLogEntry {
  id: string;
  orgId: string;
  actorId: string | null;
  actorType: string;
  action: string;
  resourceType: string;
  resourceId: string;
  description: string | null;
  metadata: Record<string, unknown>;
  prevHash: string;
  entryHash: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
}

// ============================================================================
// Hash Chain Functions
// ============================================================================

/**
 * Computes SHA-256 hash for an audit log entry.
 * The hash includes all immutable fields plus the previous hash,
 * creating a tamper-evident chain.
 */
function computeEntryHash(entry: {
  id: string;
  orgId: string;
  actorId: string | null;
  actorType: string;
  action: string;
  resourceType: string;
  resourceId: string;
  description: string | null;
  metadata: Record<string, unknown>;
  prevHash: string;
  createdAt: Date;
}): string {
  const payload = JSON.stringify({
    id: entry.id,
    orgId: entry.orgId,
    actorId: entry.actorId,
    actorType: entry.actorType,
    action: entry.action,
    resourceType: entry.resourceType,
    resourceId: entry.resourceId,
    description: entry.description,
    metadata: entry.metadata,
    prevHash: entry.prevHash,
    createdAt: entry.createdAt.toISOString(),
  });

  return createHash('sha256').update(payload).digest('hex');
}

/**
 * Gets the hash of the last audit log entry for an organization.
 * Returns a genesis hash if no entries exist.
 */
async function getLastEntryHash(orgId: string): Promise<string> {
  const lastEntry = await db.query.auditLog.findFirst({
    where: eq(auditLog.orgId, orgId),
    orderBy: desc(auditLog.createdAt),
  });

  if (!lastEntry) {
    // Genesis hash for first entry
    return createHash('sha256').update(`genesis:${orgId}`).digest('hex');
  }

  return lastEntry.entryHash;
}

// ============================================================================
// Audit Log Operations
// ============================================================================

/**
 * Creates a new audit log entry with hash chain integrity.
 */
export async function log(input: CreateAuditLogInput): Promise<AuditLogEntry> {
  // Get the previous hash
  const prevHash = await getLastEntryHash(input.orgId);

  // Create the entry without hash first (to get the ID)
  const [entry] = await db.insert(auditLog).values({
    orgId: input.orgId,
    actorId: input.actorId,
    actorType: input.actorType,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    description: input.description,
    metadata: input.metadata || {},
    prevHash,
    entryHash: '', // Will update immediately
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
  }).returning();

  // Compute the entry hash
  const entryHash = computeEntryHash({
    id: entry.id,
    orgId: entry.orgId,
    actorId: entry.actorId,
    actorType: entry.actorType,
    action: entry.action,
    resourceType: entry.resourceType,
    resourceId: entry.resourceId,
    description: entry.description,
    metadata: entry.metadata as Record<string, unknown>,
    prevHash: entry.prevHash,
    createdAt: entry.createdAt,
  });

  // Update with the computed hash
  const [updated] = await db.update(auditLog)
    .set({ entryHash })
    .where(eq(auditLog.id, entry.id))
    .returning();

  return updated as AuditLogEntry;
}

/**
 * Retrieves audit log entries with filtering.
 */
export async function getAuditLog(orgId: string, params: {
  actorId?: string;
  actorType?: string;
  action?: string;
  resourceType?: string;
  resourceId?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
} = {}): Promise<AuditLogEntry[]> {
  const {
    actorId,
    actorType,
    action,
    resourceType,
    resourceId,
    startDate,
    endDate,
    limit = 100,
    offset = 0,
  } = params;

  const conditions = [eq(auditLog.orgId, orgId)];

  if (actorId) conditions.push(eq(auditLog.actorId, actorId));
  if (actorType) conditions.push(eq(auditLog.actorType, actorType));
  if (action) conditions.push(eq(auditLog.action, action));
  if (resourceType) conditions.push(eq(auditLog.resourceType, resourceType));
  if (resourceId) conditions.push(eq(auditLog.resourceId, resourceId));
  if (startDate) conditions.push(gte(auditLog.createdAt, startDate));
  if (endDate) conditions.push(lte(auditLog.createdAt, endDate));

  const results = await db.select()
    .from(auditLog)
    .where(and(...conditions))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit)
    .offset(offset);

  return results as AuditLogEntry[];
}

/**
 * Gets a specific audit log entry by ID.
 */
export async function getAuditLogEntry(id: string, orgId: string): Promise<AuditLogEntry> {
  const entry = await db.query.auditLog.findFirst({
    where: and(eq(auditLog.id, id), eq(auditLog.orgId, orgId)),
  });

  if (!entry) {
    throw new NotFoundError('Audit log entry not found');
  }

  return entry as AuditLogEntry;
}

/**
 * Verifies the integrity of a single audit log entry.
 */
export async function verifyEntry(id: string, orgId: string): Promise<{
  valid: boolean;
  entry: AuditLogEntry;
  expectedHash: string;
  actualHash: string;
}> {
  const entry = await getAuditLogEntry(id, orgId);

  const expectedHash = computeEntryHash({
    id: entry.id,
    orgId: entry.orgId,
    actorId: entry.actorId,
    actorType: entry.actorType,
    action: entry.action,
    resourceType: entry.resourceType,
    resourceId: entry.resourceId,
    description: entry.description,
    metadata: entry.metadata,
    prevHash: entry.prevHash,
    createdAt: entry.createdAt,
  });

  return {
    valid: expectedHash === entry.entryHash,
    entry,
    expectedHash,
    actualHash: entry.entryHash,
  };
}

/**
 * Verifies the integrity of the entire audit log chain for an organization.
 * Returns the first broken link if any.
 */
export async function verifyChain(orgId: string, params: {
  batchSize?: number;
  startFrom?: Date;
} = {}): Promise<{
  valid: boolean;
  totalEntries: number;
  verifiedEntries: number;
  brokenAt?: {
    entryId: string;
    position: number;
    expectedPrevHash: string;
    actualPrevHash: string;
  };
  hashMismatch?: {
    entryId: string;
    position: number;
    expectedHash: string;
    actualHash: string;
  };
}> {
  const { batchSize = 1000, startFrom } = params;

  // Count total entries
  const countResult = await db.select({ count: sql<number>`count(*)` })
    .from(auditLog)
    .where(
      startFrom
        ? and(eq(auditLog.orgId, orgId), gte(auditLog.createdAt, startFrom))
        : eq(auditLog.orgId, orgId)
    );

  const totalEntries = Number(countResult[0].count);

  if (totalEntries === 0) {
    return { valid: true, totalEntries: 0, verifiedEntries: 0 };
  }

  let offset = 0;
  let verifiedEntries = 0;
  let expectedPrevHash = await getGenesisHash(orgId, startFrom);
  let previousEntry: AuditLogEntry | null = null;

  while (offset < totalEntries) {
    const conditions = [eq(auditLog.orgId, orgId)];
    if (startFrom) conditions.push(gte(auditLog.createdAt, startFrom));

    const batch = await db.select()
      .from(auditLog)
      .where(and(...conditions))
      .orderBy(auditLog.createdAt)
      .limit(batchSize)
      .offset(offset);

    for (const entry of batch) {
      const typedEntry = entry as AuditLogEntry;

      // Verify prev hash chain
      if (previousEntry !== null && typedEntry.prevHash !== previousEntry.entryHash) {
        return {
          valid: false,
          totalEntries,
          verifiedEntries,
          brokenAt: {
            entryId: typedEntry.id,
            position: verifiedEntries + 1,
            expectedPrevHash: previousEntry.entryHash,
            actualPrevHash: typedEntry.prevHash,
          },
        };
      }

      // Verify entry hash
      const computedHash = computeEntryHash({
        id: typedEntry.id,
        orgId: typedEntry.orgId,
        actorId: typedEntry.actorId,
        actorType: typedEntry.actorType,
        action: typedEntry.action,
        resourceType: typedEntry.resourceType,
        resourceId: typedEntry.resourceId,
        description: typedEntry.description,
        metadata: typedEntry.metadata,
        prevHash: typedEntry.prevHash,
        createdAt: typedEntry.createdAt,
      });

      if (computedHash !== typedEntry.entryHash) {
        return {
          valid: false,
          totalEntries,
          verifiedEntries,
          hashMismatch: {
            entryId: typedEntry.id,
            position: verifiedEntries + 1,
            expectedHash: computedHash,
            actualHash: typedEntry.entryHash,
          },
        };
      }

      previousEntry = typedEntry;
      verifiedEntries++;
    }

    offset += batchSize;
  }

  return { valid: true, totalEntries, verifiedEntries };
}

async function getGenesisHash(orgId: string, startFrom?: Date): Promise<string> {
  if (!startFrom) {
    return createHash('sha256').update(`genesis:${orgId}`).digest('hex');
  }

  // Get the entry just before startFrom
  const prevEntry = await db.query.auditLog.findFirst({
    where: and(
      eq(auditLog.orgId, orgId),
      lte(auditLog.createdAt, startFrom)
    ),
    orderBy: desc(auditLog.createdAt),
  });

  if (!prevEntry) {
    return createHash('sha256').update(`genesis:${orgId}`).digest('hex');
  }

  return prevEntry.entryHash;
}

/**
 * Gets audit statistics for an organization.
 */
export async function getAuditStats(orgId: string, params: {
  startDate?: Date;
  endDate?: Date;
} = {}): Promise<{
  totalEntries: number;
  byAction: Record<string, number>;
  byResourceType: Record<string, number>;
  byActorType: Record<string, number>;
}> {
  const { startDate, endDate } = params;

  const conditions = [eq(auditLog.orgId, orgId)];
  if (startDate) conditions.push(gte(auditLog.createdAt, startDate));
  if (endDate) conditions.push(lte(auditLog.createdAt, endDate));

  // Total entries
  const countResult = await db.select({ count: sql<number>`count(*)` })
    .from(auditLog)
    .where(and(...conditions));

  const totalEntries = Number(countResult[0].count);

  // By action
  const actionStats = await db.select({
    action: auditLog.action,
    count: sql<number>`count(*)`,
  })
    .from(auditLog)
    .where(and(...conditions))
    .groupBy(auditLog.action);

  const byAction: Record<string, number> = {};
  for (const stat of actionStats) {
    byAction[stat.action] = Number(stat.count);
  }

  // By resource type
  const resourceStats = await db.select({
    resourceType: auditLog.resourceType,
    count: sql<number>`count(*)`,
  })
    .from(auditLog)
    .where(and(...conditions))
    .groupBy(auditLog.resourceType);

  const byResourceType: Record<string, number> = {};
  for (const stat of resourceStats) {
    byResourceType[stat.resourceType] = Number(stat.count);
  }

  // By actor type
  const actorStats = await db.select({
    actorType: auditLog.actorType,
    count: sql<number>`count(*)`,
  })
    .from(auditLog)
    .where(and(...conditions))
    .groupBy(auditLog.actorType);

  const byActorType: Record<string, number> = {};
  for (const stat of actorStats) {
    byActorType[stat.actorType] = Number(stat.count);
  }

  return {
    totalEntries,
    byAction,
    byResourceType,
    byActorType,
  };
}

// ============================================================================
// Convenience Logging Functions
// ============================================================================

/**
 * Log a user action.
 */
export async function logUserAction(
  orgId: string,
  userId: string,
  action: AuditAction | string,
  resourceType: AuditResourceType | string,
  resourceId: string,
  metadata?: Record<string, unknown>,
  request?: { ip?: string; userAgent?: string }
): Promise<AuditLogEntry> {
  return log({
    orgId,
    actorId: userId,
    actorType: 'user',
    action,
    resourceType,
    resourceId,
    metadata,
    ipAddress: request?.ip,
    userAgent: request?.userAgent,
  });
}

/**
 * Log an API key action.
 */
export async function logApiKeyAction(
  orgId: string,
  keyId: string,
  action: AuditAction | string,
  resourceType: AuditResourceType | string,
  resourceId: string,
  metadata?: Record<string, unknown>,
  request?: { ip?: string; userAgent?: string }
): Promise<AuditLogEntry> {
  return log({
    orgId,
    actorId: keyId,
    actorType: 'api_key',
    action,
    resourceType,
    resourceId,
    metadata,
    ipAddress: request?.ip,
    userAgent: request?.userAgent,
  });
}

/**
 * Log a system action.
 */
export async function logSystemAction(
  orgId: string,
  action: AuditAction | string,
  resourceType: AuditResourceType | string,
  resourceId: string,
  description?: string,
  metadata?: Record<string, unknown>
): Promise<AuditLogEntry> {
  return log({
    orgId,
    actorType: 'system',
    action,
    resourceType,
    resourceId,
    description,
    metadata,
  });
}

/**
 * Export audit log to JSON format.
 */
export async function exportAuditLog(orgId: string, params: {
  startDate?: Date;
  endDate?: Date;
  format?: 'json' | 'csv';
}): Promise<{ data: AuditLogEntry[]; format: string; exportedAt: string }> {
  const entries = await getAuditLog(orgId, {
    startDate: params.startDate,
    endDate: params.endDate,
    limit: 10000, // Max export size
  });

  return {
    data: entries,
    format: params.format || 'json',
    exportedAt: new Date().toISOString(),
  };
}
