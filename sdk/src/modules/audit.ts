import type { HttpClient } from '../utils/http.js';
import type { AuditLogEntry, PaginatedResponse } from '../types.js';
import { validate } from './validation.js';
import { z } from 'zod';

// ============================================================================
// Validation Schemas
// ============================================================================

const ListAuditLogsParamsSchema = z.object({
  actorId: z.string().uuid().optional(),
  actorType: z.enum(['user', 'api_key', 'system', 'webhook']).optional(),
  action: z.string().optional(),
  resourceType: z.string().optional(),
  resourceId: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  limit: z.number().int().min(1).max(1000).optional(),
  offset: z.number().int().min(0).optional(),
});

const UUIDSchema = z.string().uuid();

// ============================================================================
// Types
// ============================================================================

export interface ListAuditLogsParams {
  /** Filter by actor ID */
  actorId?: string;
  /** Filter by actor type */
  actorType?: 'user' | 'api_key' | 'system' | 'webhook';
  /** Filter by action */
  action?: string;
  /** Filter by resource type (investor, token, transfer, etc.) */
  resourceType?: string;
  /** Filter by resource ID */
  resourceId?: string;
  /** Filter entries after this date */
  startDate?: string;
  /** Filter entries before this date */
  endDate?: string;
  /** Maximum results */
  limit?: number;
  /** Pagination offset */
  offset?: number;
}

export interface AuditStats {
  totalEntries: number;
  byAction: Record<string, number>;
  byResourceType: Record<string, number>;
  byActorType: Record<string, number>;
}

export interface ChainVerificationResult {
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
}

export interface EntryVerificationResult {
  valid: boolean;
  entry: AuditLogEntry;
  expectedHash: string;
  actualHash: string;
}

export interface EvidencePack {
  id: string;
  generatedAt: string;
  type: string;
  version: string;
  subject: {
    type: string;
    id: string;
    name?: string;
  };
  organization: {
    id: string;
    name?: string;
  };
  data: Record<string, unknown>;
  auditTrail: AuditLogEntry[];
  attestation: {
    contentHash: string;
    algorithm: string;
    attestedAt: string;
    signature?: string;
  };
}

// ============================================================================
// Audit Module
// ============================================================================

/**
 * Audit module for accessing tamper-evident audit logs and generating evidence packs.
 *
 * Features:
 * - Tamper-evident hash chain for all audit entries
 * - Chain integrity verification
 * - Evidence pack generation for compliance
 * - Export functionality for regulators
 *
 * @example
 * ```typescript
 * // Get audit history for an investor
 * const logs = await client.audit.list({
 *   resourceType: 'investor',
 *   resourceId: investorId
 * });
 *
 * // Generate evidence pack for compliance
 * const pack = await client.audit.generateInvestorEvidencePack(investorId);
 * ```
 */
export class AuditModule {
  constructor(private http: HttpClient) {}

  // ============================================================================
  // Audit Log Queries
  // ============================================================================

  /**
   * Lists audit log entries with optional filters.
   *
   * @example
   * ```typescript
   * // Get all transfer-related audit entries
   * const logs = await client.audit.list({
   *   resourceType: 'transfer',
   *   limit: 50
   * });
   *
   * // Get entries by a specific user
   * const userLogs = await client.audit.list({
   *   actorType: 'user',
   *   actorId: userId
   * });
   * ```
   */
  async list(params?: ListAuditLogsParams): Promise<PaginatedResponse<AuditLogEntry>> {
    const validated = params ? validate(ListAuditLogsParamsSchema, params) : undefined;
    return this.http.list<AuditLogEntry>(
      '/api/v1/audit',
      validated as Record<string, string | number | boolean | undefined>
    );
  }

  /**
   * Gets a specific audit log entry by ID.
   */
  async get(id: string): Promise<AuditLogEntry> {
    const validatedId = validate(UUIDSchema, id);
    const response = await this.http.get<AuditLogEntry>(`/api/v1/audit/${validatedId}`);
    return response.data;
  }

  /**
   * Gets audit history for a specific resource.
   *
   * @example
   * ```typescript
   * const history = await client.audit.getResourceHistory('investor', investorId);
   * ```
   */
  async getResourceHistory(
    resourceType: string,
    resourceId: string,
    params?: { limit?: number; offset?: number }
  ): Promise<PaginatedResponse<AuditLogEntry>> {
    const validatedId = validate(UUIDSchema, resourceId);
    return this.list({
      resourceType,
      resourceId: validatedId,
      ...params,
    });
  }

  // ============================================================================
  // Integrity Verification
  // ============================================================================

  /**
   * Verifies the integrity of a single audit log entry.
   * Checks that the stored hash matches the computed hash.
   *
   * @example
   * ```typescript
   * const result = await client.audit.verifyEntry(entryId);
   * if (!result.valid) {
   *   console.error('Audit entry has been tampered with!');
   * }
   * ```
   */
  async verifyEntry(id: string): Promise<EntryVerificationResult> {
    const validatedId = validate(UUIDSchema, id);
    const response = await this.http.get<EntryVerificationResult>(`/api/v1/audit/${validatedId}/verify`);
    return response.data;
  }

  /**
   * Verifies the integrity of the entire audit log chain.
   * Checks that all entries are properly linked and haven't been tampered with.
   *
   * @example
   * ```typescript
   * const result = await client.audit.verifyChain();
   * if (result.valid) {
   *   console.log(`Verified ${result.verifiedEntries} entries`);
   * } else {
   *   console.error('Chain broken at entry:', result.brokenAt?.entryId);
   * }
   * ```
   */
  async verifyChain(params?: {
    batchSize?: number;
    startFrom?: string;
  }): Promise<ChainVerificationResult> {
    const response = await this.http.post<ChainVerificationResult>('/api/v1/audit/verify-chain', params || {});
    return response.data;
  }

  // ============================================================================
  // Statistics & Export
  // ============================================================================

  /**
   * Gets audit statistics for the organization.
   *
   * @example
   * ```typescript
   * const stats = await client.audit.getStats();
   * console.log('Total entries:', stats.totalEntries);
   * console.log('By action:', stats.byAction);
   * ```
   */
  async getStats(params?: { startDate?: string; endDate?: string }): Promise<AuditStats> {
    const response = await this.http.get<AuditStats>('/api/v1/audit/stats/summary', {
      params: params as Record<string, string>,
    });
    return response.data;
  }

  /**
   * Exports audit log entries for a date range.
   *
   * @example
   * ```typescript
   * const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
   * const export = await client.audit.export({
   *   startDate: thirtyDaysAgo.toISOString(),
   *   format: 'json'
   * });
   * ```
   */
  async export(params?: {
    startDate?: string;
    endDate?: string;
    format?: 'json' | 'csv';
  }): Promise<{ data: AuditLogEntry[]; format: string; exportedAt: string }> {
    const response = await this.http.post<{ data: AuditLogEntry[]; format: string; exportedAt: string }>(
      '/api/v1/audit/export',
      params || {}
    );
    return response.data;
  }

  // ============================================================================
  // Evidence Packs
  // ============================================================================

  /**
   * Generates a comprehensive evidence pack for an investor.
   * Includes KYC history, wallets, holdings, transfers, and complete audit trail.
   *
   * Use this for:
   * - Regulatory examinations
   * - Due diligence requests
   * - Compliance audits
   *
   * @example
   * ```typescript
   * const pack = await client.audit.generateInvestorEvidencePack(investorId);
   *
   * // The pack includes cryptographic attestation
   * console.log('Content hash:', pack.attestation.contentHash);
   * ```
   */
  async generateInvestorEvidencePack(investorId: string): Promise<EvidencePack> {
    const validatedId = validate(UUIDSchema, investorId);
    const response = await this.http.get<EvidencePack>(`/api/v1/audit/evidence/investor/${validatedId}`);
    return response.data;
  }

  /**
   * Generates a comprehensive evidence pack for a transfer.
   * Includes compliance decisions, both parties' information, and timeline.
   *
   * @example
   * ```typescript
   * const pack = await client.audit.generateTransferEvidencePack(transferId);
   * console.log('Transfer timeline:', pack.data.timeline);
   * ```
   */
  async generateTransferEvidencePack(transferId: string): Promise<EvidencePack> {
    const validatedId = validate(UUIDSchema, transferId);
    const response = await this.http.get<EvidencePack>(`/api/v1/audit/evidence/transfer/${validatedId}`);
    return response.data;
  }

  /**
   * Generates a comprehensive evidence pack for a token.
   * Includes cap table, all issuances, redemptions, and transfers.
   *
   * @example
   * ```typescript
   * const pack = await client.audit.generateTokenEvidencePack(tokenId);
   * console.log('Cap table:', pack.data.capTable);
   * console.log('Total issuances:', pack.data.statistics.totalIssuances);
   * ```
   */
  async generateTokenEvidencePack(tokenId: string): Promise<EvidencePack> {
    const validatedId = validate(UUIDSchema, tokenId);
    const response = await this.http.get<EvidencePack>(`/api/v1/audit/evidence/token/${validatedId}`);
    return response.data;
  }

  /**
   * Generates a KYC-focused evidence pack for an investor.
   * Optimized for KYC compliance reporting.
   *
   * @example
   * ```typescript
   * const pack = await client.audit.generateKycEvidencePack(investorId);
   * console.log('KYC sessions:', pack.data.kycSessions);
   * console.log('Compliance timeline:', pack.data.complianceTimeline);
   * ```
   */
  async generateKycEvidencePack(investorId: string): Promise<EvidencePack> {
    const validatedId = validate(UUIDSchema, investorId);
    const response = await this.http.get<EvidencePack>(`/api/v1/audit/evidence/kyc/${validatedId}`);
    return response.data;
  }
}
