/**
 * Admin Dashboard API
 *
 * Internal API for administrative operations:
 * - System health and metrics
 * - User and API key management
 * - Compliance reporting
 * - Asset/investor analytics
 */

import { ok, err, type Result } from '../core/types.js';
import { getObservability, InMemoryMetrics } from '../core/Observability.js';
import { getHealthCheck, type HealthReport } from '../services/HealthCheck.js';
import type { AuditLogService, AuditQueryOptions, AuditEntry, AuditAction } from '../audit/AuditLog.js';

// ============================================================================
// TYPES
// ============================================================================

export interface SystemStats {
  uptime: number;
  version: string;
  environment: string;
  health: HealthReport;
  metrics: {
    totalAssets: number;
    activeAssets: number;
    totalInvestors: number;
    verifiedInvestors: number;
    totalTransfers: number;
    transferVolume: string;
  };
}

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt?: string;
  expiresAt?: string;
  active: boolean;
  metadata?: Record<string, string>;
}

export interface CreateApiKeyParams {
  name: string;
  scopes: string[];
  expiresAt?: string;
  metadata?: Record<string, string>;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'operator' | 'viewer';
  permissions: string[];
  mfaEnabled: boolean;
  createdAt: string;
  lastLoginAt?: string;
  active: boolean;
}

export interface ComplianceReport {
  period: {
    from: string;
    to: string;
  };
  summary: {
    totalTransactions: number;
    blockedTransactions: number;
    complianceRate: number;
    kycApprovals: number;
    kycRejections: number;
    sanctionsFlags: number;
  };
  byJurisdiction: Record<string, {
    transactions: number;
    blocked: number;
    volume: string;
  }>;
  topViolations: Array<{
    type: string;
    count: number;
    percentage: number;
  }>;
  riskIndicators: Array<{
    indicator: string;
    severity: 'low' | 'medium' | 'high';
    count: number;
  }>;
}

export interface AssetAnalytics {
  assetId: string;
  period: { from: string; to: string };
  holders: {
    total: number;
    change: number;
    distribution: Array<{ range: string; count: number; percentage: number }>;
  };
  transfers: {
    count: number;
    volume: string;
    averageSize: string;
  };
  liquidity: {
    turnoverRate: number;
    averageHoldingDays: number;
  };
  compliance: {
    blockedTransfers: number;
    complianceRate: number;
  };
}

// ============================================================================
// ADMIN API SERVICE
// ============================================================================

export class AdminAPIService {
  private auditLog?: AuditLogService;
  private apiKeys: Map<string, ApiKey> = new Map();
  private users: Map<string, User> = new Map();
  private startTime: number;

  constructor(auditLog?: AuditLogService) {
    this.auditLog = auditLog;
    this.startTime = Date.now();
  }

  // ============================================================================
  // SYSTEM
  // ============================================================================

  /**
   * Get system statistics
   */
  async getSystemStats(): Promise<Result<SystemStats, string>> {
    try {
      const health = await getHealthCheck().check();

      return ok({
        uptime: Date.now() - this.startTime,
        version: process.env.npm_package_version ?? '1.0.0',
        environment: process.env.NODE_ENV ?? 'development',
        health,
        metrics: {
          totalAssets: 0, // Would come from database
          activeAssets: 0,
          totalInvestors: 0,
          verifiedInvestors: 0,
          totalTransfers: 0,
          transferVolume: '0',
        },
      });
    } catch (error) {
      return err(`Failed to get system stats: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get metrics in Prometheus format
   */
  getPrometheusMetrics(): string {
    const obs = getObservability();
    const metrics = obs.metrics;

    if (metrics instanceof InMemoryMetrics) {
      return metrics.toPrometheusFormat();
    }

    return '# No metrics available\n';
  }

  // ============================================================================
  // API KEYS
  // ============================================================================

  /**
   * Create a new API key
   */
  async createApiKey(params: CreateApiKeyParams): Promise<Result<{ key: ApiKey; secret: string }, string>> {
    const id = this.generateId();
    const secret = this.generateApiKeySecret();
    const prefix = secret.substring(0, 8);

    const apiKey: ApiKey = {
      id,
      name: params.name,
      prefix,
      scopes: params.scopes,
      createdAt: new Date().toISOString(),
      expiresAt: params.expiresAt,
      active: true,
      metadata: params.metadata,
    };

    this.apiKeys.set(id, apiKey);

    // Log audit event
    if (this.auditLog) {
      await this.auditLog.log({
        action: 'API_KEY_CREATED' as AuditAction,
        actorId: 'system',
        actorType: 'system',
        resourceType: 'api_key',
        resourceId: id,
        details: { name: params.name, scopes: params.scopes },
      });
    }

    return ok({ key: apiKey, secret });
  }

  /**
   * List all API keys
   */
  async listApiKeys(): Promise<Result<ApiKey[], string>> {
    return ok(Array.from(this.apiKeys.values()));
  }

  /**
   * Revoke an API key
   */
  async revokeApiKey(id: string): Promise<Result<void, string>> {
    const key = this.apiKeys.get(id);
    if (!key) {
      return err(`API key not found: ${id}`);
    }

    key.active = false;
    this.apiKeys.set(id, key);

    if (this.auditLog) {
      await this.auditLog.log({
        action: 'API_KEY_REVOKED' as AuditAction,
        actorId: 'system',
        actorType: 'system',
        resourceType: 'api_key',
        resourceId: id,
        details: { name: key.name },
      });
    }

    return ok(undefined);
  }

  // ============================================================================
  // USERS
  // ============================================================================

  /**
   * Create a user
   */
  async createUser(params: {
    email: string;
    name: string;
    role: 'admin' | 'operator' | 'viewer';
    permissions?: string[];
  }): Promise<Result<User, string>> {
    const id = this.generateId();

    const user: User = {
      id,
      email: params.email,
      name: params.name,
      role: params.role,
      permissions: params.permissions ?? this.getDefaultPermissions(params.role),
      mfaEnabled: false,
      createdAt: new Date().toISOString(),
      active: true,
    };

    this.users.set(id, user);

    return ok(user);
  }

  /**
   * List all users
   */
  async listUsers(): Promise<Result<User[], string>> {
    return ok(Array.from(this.users.values()));
  }

  /**
   * Update user permissions
   */
  async updateUserPermissions(
    userId: string,
    permissions: string[]
  ): Promise<Result<User, string>> {
    const user = this.users.get(userId);
    if (!user) {
      return err(`User not found: ${userId}`);
    }

    user.permissions = permissions;
    this.users.set(userId, user);

    return ok(user);
  }

  /**
   * Deactivate a user
   */
  async deactivateUser(userId: string): Promise<Result<void, string>> {
    const user = this.users.get(userId);
    if (!user) {
      return err(`User not found: ${userId}`);
    }

    user.active = false;
    this.users.set(userId, user);

    return ok(undefined);
  }

  // ============================================================================
  // AUDIT LOG
  // ============================================================================

  /**
   * Query audit log
   */
  async queryAuditLog(options: AuditQueryOptions): Promise<Result<AuditEntry[], string>> {
    if (!this.auditLog) {
      return err('Audit log not configured');
    }

    return this.auditLog.query(options);
  }

  /**
   * Export audit log
   */
  async exportAuditLog(
    format: 'csv' | 'jsonl',
    options: AuditQueryOptions
  ): Promise<Result<string, string>> {
    if (!this.auditLog) {
      return err('Audit log not configured');
    }

    if (format === 'csv') {
      return this.auditLog.exportToCSV(options);
    } else {
      return this.auditLog.exportToJSONL(options);
    }
  }

  /**
   * Verify audit log integrity
   */
  async verifyAuditLogIntegrity(
    fromDate?: string,
    toDate?: string
  ): Promise<Result<{ valid: boolean; entriesChecked: number }, string>> {
    if (!this.auditLog) {
      return err('Audit log not configured');
    }

    return this.auditLog.verifyIntegrity(fromDate, toDate);
  }

  // ============================================================================
  // COMPLIANCE REPORTING
  // ============================================================================

  /**
   * Generate compliance report
   */
  async generateComplianceReport(
    from: string,
    to: string
  ): Promise<Result<ComplianceReport, string>> {
    // In production, this would query the database
    const report: ComplianceReport = {
      period: { from, to },
      summary: {
        totalTransactions: 0,
        blockedTransactions: 0,
        complianceRate: 100,
        kycApprovals: 0,
        kycRejections: 0,
        sanctionsFlags: 0,
      },
      byJurisdiction: {},
      topViolations: [],
      riskIndicators: [],
    };

    // Would aggregate from audit log and transaction data
    if (this.auditLog) {
      const stats = await this.auditLog.getStats(from, to);
      if (stats.success) {
        // Populate report from audit stats
        const { byAction } = stats.data;
        report.summary.totalTransactions =
          (byAction['TOKEN_TRANSFERRED'] ?? 0) +
          (byAction['TOKEN_MINTED'] ?? 0);
        report.summary.blockedTransactions = byAction['TOKEN_TRANSFER_BLOCKED'] ?? 0;
        report.summary.kycApprovals = byAction['PARTY_KYC_APPROVED'] ?? 0;
        report.summary.kycRejections = byAction['PARTY_KYC_REJECTED'] ?? 0;

        if (report.summary.totalTransactions > 0) {
          report.summary.complianceRate = Math.round(
            ((report.summary.totalTransactions - report.summary.blockedTransactions) /
              report.summary.totalTransactions) * 100
          );
        }
      }
    }

    return ok(report);
  }

  // ============================================================================
  // ANALYTICS
  // ============================================================================

  /**
   * Get asset analytics
   */
  async getAssetAnalytics(
    assetId: string,
    from: string,
    to: string
  ): Promise<Result<AssetAnalytics, string>> {
    // In production, this would query the database and indexing engine
    const analytics: AssetAnalytics = {
      assetId,
      period: { from, to },
      holders: {
        total: 0,
        change: 0,
        distribution: [],
      },
      transfers: {
        count: 0,
        volume: '0',
        averageSize: '0',
      },
      liquidity: {
        turnoverRate: 0,
        averageHoldingDays: 0,
      },
      compliance: {
        blockedTransfers: 0,
        complianceRate: 100,
      },
    };

    return ok(analytics);
  }

  /**
   * Get platform-wide analytics
   */
  async getPlatformAnalytics(
    from: string,
    to: string
  ): Promise<Result<{
    assets: { total: number; active: number; frozen: number };
    investors: { total: number; verified: number; pending: number };
    transfers: { count: number; volume: string; blocked: number };
    trends: Array<{ date: string; transfers: number; volume: string }>;
  }, string>> {
    return ok({
      assets: { total: 0, active: 0, frozen: 0 },
      investors: { total: 0, verified: 0, pending: 0 },
      transfers: { count: 0, volume: '0', blocked: 0 },
      trends: [],
    });
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private generateId(): string {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }

  private generateApiKeySecret(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = 'sk_';
    for (let i = 0; i < 48; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  private getDefaultPermissions(role: 'admin' | 'operator' | 'viewer'): string[] {
    switch (role) {
      case 'admin':
        return ['*'];
      case 'operator':
        return [
          'assets:read', 'assets:write',
          'investors:read', 'investors:write',
          'transfers:read', 'transfers:write',
          'compliance:read',
          'audit:read',
        ];
      case 'viewer':
        return [
          'assets:read',
          'investors:read',
          'transfers:read',
          'compliance:read',
        ];
    }
  }
}

// ============================================================================
// EXPRESS ROUTER FACTORY
// ============================================================================

export interface AdminRouterConfig {
  adminApi: AdminAPIService;
  authMiddleware: (
    req: unknown,
    res: unknown,
    next: () => void
  ) => void;
  requirePermission: (
    permission: string
  ) => (req: unknown, res: unknown, next: () => void) => void;
}

/**
 * Create Express router for admin API
 *
 * Usage:
 * ```typescript
 * import { Router } from 'express';
 * import { createAdminRouter, AdminAPIService } from '@tokenisation/sdk';
 *
 * const adminApi = new AdminAPIService(auditLog);
 * const router = createAdminRouter({
 *   adminApi,
 *   authMiddleware: requireAuth,
 *   requirePermission: checkPermission,
 * });
 *
 * app.use('/admin', router);
 * ```
 */
export function createAdminRouterHandlers(config: AdminRouterConfig) {
  const { adminApi, authMiddleware, requirePermission } = config;

  return {
    // System
    getSystemStats: [
      authMiddleware,
      requirePermission('system:read'),
      async (_req: unknown, res: { json: (data: unknown) => void; status: (code: number) => { json: (data: unknown) => void } }) => {
        const result = await adminApi.getSystemStats();
        if (result.success) {
          res.json(result.data);
        } else {
          res.status(500).json({ error: result.error });
        }
      },
    ],

    getMetrics: [
      authMiddleware,
      requirePermission('metrics:read'),
      (_req: unknown, res: { type: (t: string) => void; send: (data: string) => void }) => {
        res.type('text/plain');
        res.send(adminApi.getPrometheusMetrics());
      },
    ],

    // API Keys
    listApiKeys: [
      authMiddleware,
      requirePermission('api_keys:read'),
      async (_req: unknown, res: { json: (data: unknown) => void }) => {
        const result = await adminApi.listApiKeys();
        res.json(result.success ? result.data : { error: result.error });
      },
    ],

    createApiKey: [
      authMiddleware,
      requirePermission('api_keys:write'),
      async (req: { body: CreateApiKeyParams }, res: { json: (data: unknown) => void; status: (code: number) => { json: (data: unknown) => void } }) => {
        const result = await adminApi.createApiKey(req.body);
        if (result.success) {
          res.json(result.data);
        } else {
          res.status(400).json({ error: result.error });
        }
      },
    ],

    revokeApiKey: [
      authMiddleware,
      requirePermission('api_keys:write'),
      async (req: { params: { id: string } }, res: { json: (data: unknown) => void; status: (code: number) => { json: (data: unknown) => void } }) => {
        const result = await adminApi.revokeApiKey(req.params.id);
        if (result.success) {
          res.json({ success: true });
        } else {
          res.status(400).json({ error: result.error });
        }
      },
    ],

    // Audit Log
    queryAuditLog: [
      authMiddleware,
      requirePermission('audit:read'),
      async (req: { query: AuditQueryOptions }, res: { json: (data: unknown) => void }) => {
        const result = await adminApi.queryAuditLog(req.query);
        res.json(result.success ? result.data : { error: result.error });
      },
    ],

    exportAuditLog: [
      authMiddleware,
      requirePermission('audit:export'),
      async (req: { query: { format?: string } & AuditQueryOptions }, res: { type: (t: string) => void; send: (data: string) => void; status: (code: number) => { json: (data: unknown) => void } }) => {
        const format = (req.query.format as 'csv' | 'jsonl') ?? 'csv';
        const result = await adminApi.exportAuditLog(format, req.query);
        if (result.success) {
          res.type(format === 'csv' ? 'text/csv' : 'application/jsonl');
          res.send(result.data);
        } else {
          res.status(400).json({ error: result.error });
        }
      },
    ],

    // Compliance
    getComplianceReport: [
      authMiddleware,
      requirePermission('compliance:read'),
      async (req: { query: { from: string; to: string } }, res: { json: (data: unknown) => void }) => {
        const { from, to } = req.query;
        const result = await adminApi.generateComplianceReport(from, to);
        res.json(result.success ? result.data : { error: result.error });
      },
    ],

    // Analytics
    getAssetAnalytics: [
      authMiddleware,
      requirePermission('analytics:read'),
      async (req: { params: { assetId: string }; query: { from: string; to: string } }, res: { json: (data: unknown) => void }) => {
        const { assetId } = req.params;
        const { from, to } = req.query;
        const result = await adminApi.getAssetAnalytics(assetId, from, to);
        res.json(result.success ? result.data : { error: result.error });
      },
    ],

    getPlatformAnalytics: [
      authMiddleware,
      requirePermission('analytics:read'),
      async (req: { query: { from: string; to: string } }, res: { json: (data: unknown) => void }) => {
        const { from, to } = req.query;
        const result = await adminApi.getPlatformAnalytics(from, to);
        res.json(result.success ? result.data : { error: result.error });
      },
    ],
  };
}

export default AdminAPIService;
