/**
 * Audit Log Persistence
 *
 * Immutable audit trail for all operations with:
 * - Tamper-evident logging
 * - Multiple storage backends
 * - Compliance-ready exports
 * - Query and search capabilities
 */

import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';
import { ok, err, type Result } from '../core/types.js';
import type { IDatabaseAdapter, QueryOptions, WhereClause, DatabaseRecord } from '../storage/DatabaseAdapter.js';

// ============================================================================
// TYPES
// ============================================================================

export enum AuditAction {
  // Asset lifecycle
  ASSET_CREATED = 'ASSET_CREATED',
  ASSET_UPDATED = 'ASSET_UPDATED',
  ASSET_STATE_CHANGED = 'ASSET_STATE_CHANGED',
  ASSET_VERIFIED = 'ASSET_VERIFIED',
  ASSET_ACTIVATED = 'ASSET_ACTIVATED',
  ASSET_FROZEN = 'ASSET_FROZEN',
  ASSET_UNFROZEN = 'ASSET_UNFROZEN',
  ASSET_RETIRED = 'ASSET_RETIRED',

  // Token operations
  TOKEN_MINTED = 'TOKEN_MINTED',
  TOKEN_BURNED = 'TOKEN_BURNED',
  TOKEN_TRANSFERRED = 'TOKEN_TRANSFERRED',
  TOKEN_TRANSFER_BLOCKED = 'TOKEN_TRANSFER_BLOCKED',

  // Party/Investor operations
  PARTY_CREATED = 'PARTY_CREATED',
  PARTY_UPDATED = 'PARTY_UPDATED',
  PARTY_KYC_SUBMITTED = 'PARTY_KYC_SUBMITTED',
  PARTY_KYC_APPROVED = 'PARTY_KYC_APPROVED',
  PARTY_KYC_REJECTED = 'PARTY_KYC_REJECTED',
  PARTY_ACCREDITED = 'PARTY_ACCREDITED',
  PARTY_WALLET_ADDED = 'PARTY_WALLET_ADDED',
  PARTY_WALLET_REMOVED = 'PARTY_WALLET_REMOVED',

  // Compliance
  COMPLIANCE_CHECK_PASSED = 'COMPLIANCE_CHECK_PASSED',
  COMPLIANCE_CHECK_FAILED = 'COMPLIANCE_CHECK_FAILED',
  POLICY_CREATED = 'POLICY_CREATED',
  POLICY_UPDATED = 'POLICY_UPDATED',
  POLICY_ATTACHED = 'POLICY_ATTACHED',
  POLICY_DETACHED = 'POLICY_DETACHED',

  // Custody
  CUSTODY_ARRANGEMENT_CREATED = 'CUSTODY_ARRANGEMENT_CREATED',
  RECOVERY_INITIATED = 'RECOVERY_INITIATED',
  RECOVERY_APPROVED = 'RECOVERY_APPROVED',
  RECOVERY_REJECTED = 'RECOVERY_REJECTED',
  RECOVERY_EXECUTED = 'RECOVERY_EXECUTED',
  OVERRIDE_REQUESTED = 'OVERRIDE_REQUESTED',
  OVERRIDE_APPROVED = 'OVERRIDE_APPROVED',
  OVERRIDE_EXECUTED = 'OVERRIDE_EXECUTED',

  // Admin/System
  CONFIG_CHANGED = 'CONFIG_CHANGED',
  API_KEY_CREATED = 'API_KEY_CREATED',
  API_KEY_REVOKED = 'API_KEY_REVOKED',
  USER_LOGIN = 'USER_LOGIN',
  USER_LOGOUT = 'USER_LOGOUT',
  PERMISSION_GRANTED = 'PERMISSION_GRANTED',
  PERMISSION_REVOKED = 'PERMISSION_REVOKED',
}

export interface AuditEntry extends DatabaseRecord {
  /** Unique entry ID */
  id: string;
  /** Action type */
  action: AuditAction;
  /** Actor who performed the action */
  actorId: string;
  /** Actor type (user, system, api_key) */
  actorType: 'user' | 'system' | 'api_key' | 'service';
  /** Resource type */
  resourceType: string;
  /** Resource ID */
  resourceId: string;
  /** Action details */
  details: Record<string, unknown>;
  /** Previous state (for changes) */
  previousState?: Record<string, unknown>;
  /** New state (for changes) */
  newState?: Record<string, unknown>;
  /** IP address (if applicable) */
  ipAddress?: string;
  /** User agent (if applicable) */
  userAgent?: string;
  /** Request ID for correlation */
  requestId?: string;
  /** Hash of previous entry (chain) */
  previousHash?: string;
  /** Hash of this entry */
  hash: string;
  /** Timestamp */
  timestamp: string;
  /** Created at */
  createdAt: string;
  /** Updated at */
  updatedAt: string;
}

export interface AuditQueryOptions extends QueryOptions {
  /** Filter by action types */
  actions?: AuditAction[];
  /** Filter by actor ID */
  actorId?: string;
  /** Filter by resource type */
  resourceType?: string;
  /** Filter by resource ID */
  resourceId?: string;
  /** Filter by date range */
  fromDate?: string;
  toDate?: string;
}

// ============================================================================
// AUDIT LOG SERVICE
// ============================================================================

export class AuditLogService {
  private db: IDatabaseAdapter;
  private collection: string;
  private lastHash?: string;

  constructor(db: IDatabaseAdapter, collection: string = 'audit_log') {
    this.db = db;
    this.collection = collection;
  }

  /**
   * Initialize the audit log (load last hash)
   */
  async initialize(): Promise<void> {
    const result = await this.db.find<AuditEntry>(this.collection, undefined, {
      orderBy: 'createdAt',
      orderDirection: 'desc',
      limit: 1,
    });

    if (result.success && result.data.length > 0) {
      this.lastHash = result.data[0].hash;
    }
  }

  /**
   * Log an audit entry
   */
  async log(params: {
    action: AuditAction;
    actorId: string;
    actorType: 'user' | 'system' | 'api_key' | 'service';
    resourceType: string;
    resourceId: string;
    details?: Record<string, unknown>;
    previousState?: Record<string, unknown>;
    newState?: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
    requestId?: string;
  }): Promise<Result<AuditEntry, string>> {
    const timestamp = new Date().toISOString();

    // Create entry without hash first
    const entryData = {
      action: params.action,
      actorId: params.actorId,
      actorType: params.actorType,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      details: params.details ?? {},
      previousState: params.previousState,
      newState: params.newState,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      requestId: params.requestId,
      previousHash: this.lastHash,
      timestamp,
    };

    // Calculate hash (includes previous hash for chain integrity)
    const hash = this.calculateHash(entryData);

    const entry: Omit<AuditEntry, 'id' | 'createdAt' | 'updatedAt'> = {
      ...entryData,
      hash,
    };

    const result = await this.db.insert<AuditEntry>(this.collection, entry);

    if (result.success) {
      this.lastHash = hash;
    }

    return result;
  }

  /**
   * Query audit entries
   */
  async query(options: AuditQueryOptions = {}): Promise<Result<AuditEntry[], string>> {
    const where: WhereClause = {};

    if (options.actions && options.actions.length > 0) {
      where.action = { $in: options.actions };
    }

    if (options.actorId) {
      where.actorId = options.actorId;
    }

    if (options.resourceType) {
      where.resourceType = options.resourceType;
    }

    if (options.resourceId) {
      where.resourceId = options.resourceId;
    }

    if (options.fromDate) {
      where.timestamp = { ...where.timestamp as object, $gte: options.fromDate };
    }

    if (options.toDate) {
      where.timestamp = { ...where.timestamp as object, $lte: options.toDate };
    }

    return this.db.find<AuditEntry>(this.collection, where, {
      orderBy: options.orderBy ?? 'createdAt',
      orderDirection: options.orderDirection ?? 'desc',
      limit: options.limit,
      offset: options.offset,
    });
  }

  /**
   * Get audit trail for a specific resource
   */
  async getResourceHistory(
    resourceType: string,
    resourceId: string,
    limit?: number
  ): Promise<Result<AuditEntry[], string>> {
    return this.query({
      resourceType,
      resourceId,
      limit,
      orderBy: 'createdAt',
      orderDirection: 'desc',
    });
  }

  /**
   * Get audit trail for an actor
   */
  async getActorHistory(
    actorId: string,
    limit?: number
  ): Promise<Result<AuditEntry[], string>> {
    return this.query({
      actorId,
      limit,
      orderBy: 'createdAt',
      orderDirection: 'desc',
    });
  }

  /**
   * Verify chain integrity
   */
  async verifyIntegrity(fromDate?: string, toDate?: string): Promise<Result<{
    valid: boolean;
    entriesChecked: number;
    firstInvalidEntry?: string;
  }, string>> {
    const result = await this.query({
      fromDate,
      toDate,
      orderBy: 'createdAt',
      orderDirection: 'asc',
      limit: 10000, // Process in chunks for large datasets
    });

    if (!result.success) {
      return err(result.error);
    }

    let previousHash: string | undefined;
    let entriesChecked = 0;

    for (const entry of result.data) {
      // Verify hash
      const expectedHash = this.calculateHash({
        action: entry.action,
        actorId: entry.actorId,
        actorType: entry.actorType,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId,
        details: entry.details,
        previousState: entry.previousState,
        newState: entry.newState,
        ipAddress: entry.ipAddress,
        userAgent: entry.userAgent,
        requestId: entry.requestId,
        previousHash: entry.previousHash,
        timestamp: entry.timestamp,
      });

      if (entry.hash !== expectedHash) {
        return ok({
          valid: false,
          entriesChecked,
          firstInvalidEntry: entry.id,
        });
      }

      // Verify chain
      if (previousHash && entry.previousHash !== previousHash) {
        return ok({
          valid: false,
          entriesChecked,
          firstInvalidEntry: entry.id,
        });
      }

      previousHash = entry.hash;
      entriesChecked++;
    }

    return ok({
      valid: true,
      entriesChecked,
    });
  }

  /**
   * Export audit log to CSV
   */
  async exportToCSV(options: AuditQueryOptions = {}): Promise<Result<string, string>> {
    const result = await this.query(options);

    if (!result.success) {
      return err(result.error);
    }

    const headers = [
      'id',
      'timestamp',
      'action',
      'actorId',
      'actorType',
      'resourceType',
      'resourceId',
      'details',
      'ipAddress',
      'requestId',
      'hash',
    ];

    const rows = result.data.map(entry => [
      entry.id,
      entry.timestamp,
      entry.action,
      entry.actorId,
      entry.actorType,
      entry.resourceType,
      entry.resourceId,
      JSON.stringify(entry.details),
      entry.ipAddress ?? '',
      entry.requestId ?? '',
      entry.hash,
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
    ].join('\n');

    return ok(csv);
  }

  /**
   * Export audit log to JSON Lines format
   */
  async exportToJSONL(options: AuditQueryOptions = {}): Promise<Result<string, string>> {
    const result = await this.query(options);

    if (!result.success) {
      return err(result.error);
    }

    const jsonl = result.data.map(entry => JSON.stringify(entry)).join('\n');
    return ok(jsonl);
  }

  /**
   * Get audit statistics
   */
  async getStats(fromDate?: string, toDate?: string): Promise<Result<{
    totalEntries: number;
    byAction: Record<string, number>;
    byActorType: Record<string, number>;
    byResourceType: Record<string, number>;
  }, string>> {
    const result = await this.query({ fromDate, toDate, limit: 100000 });

    if (!result.success) {
      return err(result.error);
    }

    const stats = {
      totalEntries: result.data.length,
      byAction: {} as Record<string, number>,
      byActorType: {} as Record<string, number>,
      byResourceType: {} as Record<string, number>,
    };

    for (const entry of result.data) {
      stats.byAction[entry.action] = (stats.byAction[entry.action] ?? 0) + 1;
      stats.byActorType[entry.actorType] = (stats.byActorType[entry.actorType] ?? 0) + 1;
      stats.byResourceType[entry.resourceType] = (stats.byResourceType[entry.resourceType] ?? 0) + 1;
    }

    return ok(stats);
  }

  /**
   * Calculate tamper-evident hash
   */
  private calculateHash(data: Record<string, unknown>): string {
    const hashInput = JSON.stringify(data, Object.keys(data).sort());
    return createHash('sha256').update(hashInput).digest('hex');
  }
}

// ============================================================================
// AUDIT LOG MIDDLEWARE
// ============================================================================

export interface AuditContext {
  actorId: string;
  actorType: 'user' | 'system' | 'api_key' | 'service';
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
}

/**
 * Create audit log helper bound to a context
 */
export function createAuditLogger(
  service: AuditLogService,
  context: AuditContext
) {
  return {
    log: (params: {
      action: AuditAction;
      resourceType: string;
      resourceId: string;
      details?: Record<string, unknown>;
      previousState?: Record<string, unknown>;
      newState?: Record<string, unknown>;
    }) => service.log({
      ...params,
      ...context,
    }),

    logAssetCreated: (assetId: string, details: Record<string, unknown>) =>
      service.log({
        action: AuditAction.ASSET_CREATED,
        resourceType: 'asset',
        resourceId: assetId,
        details,
        newState: details,
        ...context,
      }),

    logAssetStateChanged: (assetId: string, fromState: string, toState: string) =>
      service.log({
        action: AuditAction.ASSET_STATE_CHANGED,
        resourceType: 'asset',
        resourceId: assetId,
        details: { fromState, toState },
        previousState: { state: fromState },
        newState: { state: toState },
        ...context,
      }),

    logTokenMinted: (assetId: string, to: string, amount: string) =>
      service.log({
        action: AuditAction.TOKEN_MINTED,
        resourceType: 'token',
        resourceId: assetId,
        details: { to, amount },
        ...context,
      }),

    logTokenTransferred: (assetId: string, from: string, to: string, amount: string) =>
      service.log({
        action: AuditAction.TOKEN_TRANSFERRED,
        resourceType: 'token',
        resourceId: assetId,
        details: { from, to, amount },
        ...context,
      }),

    logComplianceCheck: (passed: boolean, assetId: string, details: Record<string, unknown>) =>
      service.log({
        action: passed ? AuditAction.COMPLIANCE_CHECK_PASSED : AuditAction.COMPLIANCE_CHECK_FAILED,
        resourceType: 'compliance',
        resourceId: assetId,
        details,
        ...context,
      }),
  };
}

export default AuditLogService;
