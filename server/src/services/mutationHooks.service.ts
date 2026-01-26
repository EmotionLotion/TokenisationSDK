import { db, schema } from '../config/database.js';
import { eq, and, inArray, SQL } from 'drizzle-orm';
import type { PgTable, PgColumn } from 'drizzle-orm/pg-core';
import type { PostgresJsTransaction } from 'drizzle-orm/postgres-js';
import * as auditService from './audit.service.js';
import { getRequestContext } from '../middleware/context.js';
import { createHash } from 'crypto';

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface MutationDiff {
  field: string;
  before: unknown;
  after: unknown;
}

export interface MutationRecord {
  /** Unique mutation ID */
  id: string;
  /** When the mutation occurred */
  timestamp: string;
  /** Type of mutation */
  operation: 'insert' | 'update' | 'delete';
  /** Table affected */
  table: string;
  /** Primary key of affected row */
  resourceId: string;
  /** Organization context */
  orgId: string;
  /** Actor who performed the mutation */
  actorId?: string;
  /** Type of actor */
  actorType: 'user' | 'api_key' | 'system' | 'webhook';
  /** IP address of requester */
  ipAddress?: string;
  /** User agent of requester */
  userAgent?: string;
  /** Request ID for correlation */
  requestId?: string;
  /** Field-level diff (for updates) */
  diff?: MutationDiff[];
  /** Full before state (for updates/deletes) */
  beforeState?: Record<string, unknown>;
  /** Full after state (for inserts/updates) */
  afterState?: Record<string, unknown>;
  /** Hash of the mutation for verification */
  mutationHash: string;
}

type TableConfig = {
  idColumn: string;
  orgColumn?: string;
  sensitiveFields?: string[];
  skipAudit?: boolean;
};

// ============================================================================
// Configuration
// ============================================================================

/**
 * Table-specific configuration for mutation hooks.
 * Defines which column is the primary key, org column, and sensitive fields to redact.
 */
const TABLE_CONFIGS: Record<string, TableConfig> = {
  investors: { idColumn: 'id', orgColumn: 'orgId', sensitiveFields: ['piiRef'] },
  investorWallets: { idColumn: 'id', orgColumn: 'orgId' },
  kycSessions: { idColumn: 'id', orgColumn: 'orgId', sensitiveFields: ['rawResult'] },
  tokens: { idColumn: 'id', orgColumn: 'orgId' },
  transfers: { idColumn: 'id', orgColumn: 'orgId' },
  issuances: { idColumn: 'id', orgColumn: 'orgId' },
  redemptions: { idColumn: 'id', orgColumn: 'orgId' },
  decisions: { idColumn: 'id', orgColumn: 'orgId' },
  policies: { idColumn: 'id', orgColumn: 'orgId' },
  policyVersions: { idColumn: 'id', orgColumn: 'orgId' },
  webhookEndpoints: { idColumn: 'id', orgColumn: 'orgId', sensitiveFields: ['secret'] },
  apiKeys: { idColumn: 'id', orgColumn: 'orgId', sensitiveFields: ['keyHash', 'secretHash'] },
  distributions: { idColumn: 'id', orgColumn: 'orgId' },
  distributionPayouts: { idColumn: 'id', orgColumn: 'orgId' },
  corporateActions: { idColumn: 'id', orgColumn: 'orgId' },
  clawbacks: { idColumn: 'id', orgColumn: 'orgId' },
  complianceApprovals: { idColumn: 'id', orgColumn: 'orgId' },
  offerings: { idColumn: 'id', orgColumn: 'orgId' },
  allocations: { idColumn: 'id', orgColumn: 'orgId' },
  ledgerPositions: { idColumn: 'id', orgColumn: 'orgId' },
  ledgerEvents: { idColumn: 'id', orgColumn: 'orgId' },
  // Skip audit log itself to prevent recursion
  auditLog: { idColumn: 'id', orgColumn: 'orgId', skipAudit: true },
  domainEventsOutbox: { idColumn: 'id', orgColumn: 'orgId', skipAudit: true },
};

// ============================================================================
// Mutation Hook Implementation
// ============================================================================

/**
 * Wraps an insert operation with automatic audit logging.
 * Captures the after state and creates an audit entry.
 */
export async function trackedInsert<T extends Record<string, unknown>>(
  tx: typeof db | PostgresJsTransaction<any, any>,
  tableName: keyof typeof schema,
  values: T | T[],
  options?: { skipAudit?: boolean }
): Promise<T[]> {
  const config = TABLE_CONFIGS[tableName];
  const tableRef = (schema as any)[tableName] as PgTable;

  if (!tableRef) {
    throw new Error(`Unknown table: ${tableName}`);
  }

  // Perform the insert
  const result = await (tx as any).insert(tableRef).values(values).returning();

  // Skip audit if configured or requested
  if (config?.skipAudit || options?.skipAudit) {
    return result;
  }

  // Get request context for actor info
  const ctx = getRequestContext();

  // Create audit entries for each inserted row
  const auditPromises = result.map(async (row: Record<string, unknown>) => {
    const orgId = config?.orgColumn ? (row[config.orgColumn] as string) : (row.orgId as string);
    const resourceId = config?.idColumn ? (row[config.idColumn] as string) : (row.id as string);

    if (!orgId) return; // Skip if no org context

    const sanitizedState = sanitizeState(row, config?.sensitiveFields);
    const mutation = createMutationRecord({
      operation: 'insert',
      table: tableName,
      resourceId,
      orgId,
      afterState: sanitizedState,
      ctx,
    });

    await auditService.log({
      orgId,
      actorId: ctx?.actorId,
      actorType: ctx?.actorType || 'system',
      action: 'create',
      resourceType: getResourceType(tableName),
      resourceId,
      description: `Created ${tableName} record`,
      metadata: {
        mutationId: mutation.id,
        afterState: sanitizedState,
        requestId: ctx?.requestId,
      },
      ipAddress: ctx?.ip,
      userAgent: ctx?.userAgent,
    });
  });

  await Promise.all(auditPromises);
  return result;
}

/**
 * Wraps an update operation with automatic audit logging.
 * Captures before/after state and creates a diff.
 */
export async function trackedUpdate<T extends Record<string, unknown>>(
  tx: typeof db | PostgresJsTransaction<any, any>,
  tableName: keyof typeof schema,
  whereConditions: SQL,
  updates: Partial<T>,
  options?: { skipAudit?: boolean }
): Promise<T[]> {
  const config = TABLE_CONFIGS[tableName];
  const tableRef = (schema as any)[tableName] as PgTable;

  if (!tableRef) {
    throw new Error(`Unknown table: ${tableName}`);
  }

  // First, capture the before state
  const beforeRows = await (tx as any)
    .select()
    .from(tableRef)
    .where(whereConditions);

  // Perform the update
  const result = await (tx as any)
    .update(tableRef)
    .set(updates)
    .where(whereConditions)
    .returning();

  // Skip audit if configured or requested
  if (config?.skipAudit || options?.skipAudit || beforeRows.length === 0) {
    return result;
  }

  // Get request context for actor info
  const ctx = getRequestContext();

  // Create audit entries for each updated row
  const auditPromises = result.map(async (afterRow: Record<string, unknown>, index: number) => {
    const beforeRow = beforeRows[index] || {};
    const orgId = config?.orgColumn ? (afterRow[config.orgColumn] as string) : (afterRow.orgId as string);
    const resourceId = config?.idColumn ? (afterRow[config.idColumn] as string) : (afterRow.id as string);

    if (!orgId) return;

    const sanitizedBefore = sanitizeState(beforeRow, config?.sensitiveFields);
    const sanitizedAfter = sanitizeState(afterRow, config?.sensitiveFields);
    const diff = computeDiff(sanitizedBefore, sanitizedAfter);

    if (diff.length === 0) return; // No actual changes

    const mutation = createMutationRecord({
      operation: 'update',
      table: tableName,
      resourceId,
      orgId,
      beforeState: sanitizedBefore,
      afterState: sanitizedAfter,
      diff,
      ctx,
    });

    await auditService.log({
      orgId,
      actorId: ctx?.actorId,
      actorType: ctx?.actorType || 'system',
      action: 'update',
      resourceType: getResourceType(tableName),
      resourceId,
      description: `Updated ${tableName}: ${diff.map(d => d.field).join(', ')}`,
      metadata: {
        mutationId: mutation.id,
        diff,
        beforeState: sanitizedBefore,
        afterState: sanitizedAfter,
        requestId: ctx?.requestId,
      },
      ipAddress: ctx?.ip,
      userAgent: ctx?.userAgent,
    });
  });

  await Promise.all(auditPromises);
  return result;
}

/**
 * Wraps a delete operation with automatic audit logging.
 * Captures the before state.
 */
export async function trackedDelete<T extends Record<string, unknown>>(
  tx: typeof db | PostgresJsTransaction<any, any>,
  tableName: keyof typeof schema,
  whereConditions: SQL,
  options?: { skipAudit?: boolean }
): Promise<T[]> {
  const config = TABLE_CONFIGS[tableName];
  const tableRef = (schema as any)[tableName] as PgTable;

  if (!tableRef) {
    throw new Error(`Unknown table: ${tableName}`);
  }

  // First, capture the before state
  const beforeRows = await (tx as any)
    .select()
    .from(tableRef)
    .where(whereConditions);

  // Perform the delete
  const result = await (tx as any)
    .delete(tableRef)
    .where(whereConditions)
    .returning();

  // Skip audit if configured or requested
  if (config?.skipAudit || options?.skipAudit || beforeRows.length === 0) {
    return result;
  }

  // Get request context for actor info
  const ctx = getRequestContext();

  // Create audit entries for each deleted row
  const auditPromises = beforeRows.map(async (beforeRow: Record<string, unknown>) => {
    const orgId = config?.orgColumn ? (beforeRow[config.orgColumn] as string) : (beforeRow.orgId as string);
    const resourceId = config?.idColumn ? (beforeRow[config.idColumn] as string) : (beforeRow.id as string);

    if (!orgId) return;

    const sanitizedBefore = sanitizeState(beforeRow, config?.sensitiveFields);

    const mutation = createMutationRecord({
      operation: 'delete',
      table: tableName,
      resourceId,
      orgId,
      beforeState: sanitizedBefore,
      ctx,
    });

    await auditService.log({
      orgId,
      actorId: ctx?.actorId,
      actorType: ctx?.actorType || 'system',
      action: 'delete',
      resourceType: getResourceType(tableName),
      resourceId,
      description: `Deleted ${tableName} record`,
      metadata: {
        mutationId: mutation.id,
        beforeState: sanitizedBefore,
        requestId: ctx?.requestId,
      },
      ipAddress: ctx?.ip,
      userAgent: ctx?.userAgent,
    });
  });

  await Promise.all(auditPromises);
  return result;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Creates a mutation record with hash for verification.
 */
function createMutationRecord(params: {
  operation: 'insert' | 'update' | 'delete';
  table: string;
  resourceId: string;
  orgId: string;
  beforeState?: Record<string, unknown>;
  afterState?: Record<string, unknown>;
  diff?: MutationDiff[];
  ctx?: ReturnType<typeof getRequestContext>;
}): MutationRecord {
  const timestamp = new Date();
  const id = `mut_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

  const record: MutationRecord = {
    id,
    timestamp,
    operation: params.operation,
    table: params.table,
    resourceId: params.resourceId,
    orgId: params.orgId,
    actorId: params.ctx?.actorId,
    actorType: params.ctx?.actorType || 'system',
    ipAddress: params.ctx?.ip,
    userAgent: params.ctx?.userAgent,
    requestId: params.ctx?.requestId,
    diff: params.diff,
    beforeState: params.beforeState,
    afterState: params.afterState,
    mutationHash: '',
  };

  // Compute hash of the mutation for verification
  record.mutationHash = createHash('sha256')
    .update(JSON.stringify({
      id: record.id,
      timestamp: record.timestamp,
      operation: record.operation,
      table: record.table,
      resourceId: record.resourceId,
      diff: record.diff,
    }))
    .digest('hex');

  return record;
}

/**
 * Computes the field-level diff between two states.
 */
function computeDiff(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): MutationDiff[] {
  const diff: MutationDiff[] = [];
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);

  for (const key of allKeys) {
    const beforeVal = before[key];
    const afterVal = after[key];

    // Skip if values are identical (deep comparison for objects)
    if (JSON.stringify(beforeVal) === JSON.stringify(afterVal)) {
      continue;
    }

    // Skip timestamp fields that auto-update
    if (key === 'updatedAt' || key === 'modifiedAt') {
      continue;
    }

    diff.push({
      field: key,
      before: beforeVal,
      after: afterVal,
    });
  }

  return diff;
}

/**
 * Sanitizes state by redacting sensitive fields.
 */
function sanitizeState(
  state: Record<string, unknown>,
  sensitiveFields?: string[]
): Record<string, unknown> {
  const sanitized = { ...state };

  // Always redact these fields
  const defaultSensitive = ['password', 'passwordHash', 'secret', 'secretHash', 'privateKey'];
  const allSensitive = [...defaultSensitive, ...(sensitiveFields || [])];

  for (const field of allSensitive) {
    if (field in sanitized) {
      sanitized[field] = '[REDACTED]';
    }
  }

  return sanitized;
}

/**
 * Maps table names to audit resource types.
 */
function getResourceType(tableName: string): auditService.AuditResourceType | string {
  const mapping: Record<string, auditService.AuditResourceType | string> = {
    investors: 'investor',
    investorWallets: 'investor',
    kycSessions: 'kyc_session',
    tokens: 'token',
    transfers: 'transfer',
    issuances: 'issuance',
    redemptions: 'redemption',
    decisions: 'decision',
    policies: 'policy',
    policyVersions: 'policy',
    webhookEndpoints: 'webhook_endpoint',
    apiKeys: 'api_key',
    distributions: 'distribution',
    distributionPayouts: 'distribution',
    corporateActions: 'corporate_action',
    clawbacks: 'clawback',
    complianceApprovals: 'compliance_approval',
    offerings: 'offering',
    allocations: 'allocation',
    ledgerPositions: 'ledger_position',
    ledgerEvents: 'ledger_event',
  };

  return mapping[tableName] || tableName;
}

// ============================================================================
// Transaction Wrapper with Automatic Hooks
// ============================================================================

export interface TrackedTransaction {
  insert: typeof trackedInsert;
  update: typeof trackedUpdate;
  delete: typeof trackedDelete;
  raw: typeof db; // Access to raw db for reads
}

/**
 * Creates a transaction with tracked mutations.
 * All inserts, updates, and deletes within this transaction are automatically audited.
 */
export async function withTrackedTransaction<T>(
  callback: (ttx: TrackedTransaction, tx: PostgresJsTransaction<any, any>) => Promise<T>
): Promise<T> {
  return db.transaction(async (tx) => {
    const ttx: TrackedTransaction = {
      insert: (tableName, values, options) => trackedInsert(tx, tableName, values, options),
      update: (tableName, where, updates, options) => trackedUpdate(tx, tableName, where, updates, options),
      delete: (tableName, where, options) => trackedDelete(tx, tableName, where, options),
      raw: tx as any,
    };

    return callback(ttx, tx);
  });
}

// ============================================================================
// Audit Query Helpers
// ============================================================================

/**
 * Gets the mutation history for a specific resource.
 */
export async function getMutationHistory(
  orgId: string,
  resourceType: string,
  resourceId: string,
  options?: {
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }
): Promise<auditService.AuditLogEntry[]> {
  return auditService.getAuditLog(orgId, {
    resourceType,
    resourceId,
    startDate: options?.startDate,
    endDate: options?.endDate,
    limit: options?.limit || 100,
  });
}

/**
 * Reconstructs the state of a resource at a specific point in time.
 * Works by applying mutations in reverse from current state.
 */
export async function reconstructStateAtTime(
  orgId: string,
  resourceType: string,
  resourceId: string,
  targetTime: Date
): Promise<Record<string, unknown> | null> {
  // Get all mutations after the target time (in reverse chronological order)
  const futureAuditLogs = await auditService.getAuditLog(orgId, {
    resourceType,
    resourceId,
    startDate: targetTime,
    limit: 1000,
  });

  if (futureAuditLogs.length === 0) {
    // No changes after target time - current state IS the target state
    return null; // Caller should fetch current state
  }

  // Find the mutation closest to (but after) the target time
  const sortedLogs = futureAuditLogs.sort((a, b) =>
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  // Get the before state from the first mutation after target time
  const firstAfterTarget = sortedLogs[0];
  const beforeState = (firstAfterTarget.metadata as any)?.beforeState;

  if (!beforeState) {
    // If this was a create, there was no before state
    if (firstAfterTarget.action === 'create') {
      return null; // Resource didn't exist at target time
    }
    return null;
  }

  return beforeState;
}
