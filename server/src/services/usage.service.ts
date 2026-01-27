/**
 * Usage Tracking Service
 *
 * Provides API usage metering capabilities:
 * - Record API usage per request
 * - Aggregate usage for billing periods
 * - Track quota consumption
 * - Generate usage reports
 *
 * @packageDocumentation
 */

import { db } from '../config/database.js';
import { usageRecords, usageQuotas, orgs } from '../db/schema.js';
import { eq, and, sql, between, gte, lte, sum } from 'drizzle-orm';
import { logger } from '../middleware/logger.js';

// ============================================================================
// TYPES
// ============================================================================

export interface UsageRecordInput {
  orgId: string;
  endpoint: string;
  method: string;
  statusCode: number;
  responseTimeMs: number;
  requestSize: number;
  responseSize: number;
}

export interface UsageReport {
  orgId: string;
  period: {
    start: Date;
    end: Date;
  };
  summary: {
    totalCalls: number;
    totalErrors: number;
    avgResponseTimeMs: number;
    totalRequestBytes: number;
    totalResponseBytes: number;
  };
  byEndpoint: Array<{
    endpoint: string;
    method: string;
    callCount: number;
    errorCount: number;
    avgResponseTimeMs: number;
  }>;
  dailyBreakdown: Array<{
    date: string;
    callCount: number;
    errorCount: number;
  }>;
}

export interface QuotaStatus {
  resource: string;
  limit: number;
  used: number;
  remaining: number;
  periodStart: Date;
  periodEnd: Date;
  percentUsed: number;
  isExceeded: boolean;
}

export interface DailyUsageAggregate {
  date: string;
  endpoint: string;
  method: string;
  callCount: number;
  errorCount: number;
  totalResponseTimeMs: number;
  totalRequestBytes: number;
  totalResponseBytes: number;
}

// ============================================================================
// USAGE SERVICE CLASS
// ============================================================================

export class UsageService {
  // In-memory buffer for batching writes (improves performance)
  private usageBuffer: Map<string, DailyUsageAggregate> = new Map();
  private flushInterval: NodeJS.Timeout | null = null;
  private readonly FLUSH_INTERVAL_MS = 10000; // 10 seconds
  private readonly MAX_BUFFER_SIZE = 1000;

  constructor() {
    // Start the periodic flush
    this.startPeriodicFlush();
  }

  /**
   * Record a single API usage event
   * Buffers writes for performance
   */
  async recordUsage(params: UsageRecordInput): Promise<void> {
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const key = `${params.orgId}:${date}:${params.endpoint}:${params.method}`;

    let aggregate = this.usageBuffer.get(key);
    if (!aggregate) {
      aggregate = {
        date,
        endpoint: params.endpoint,
        method: params.method,
        callCount: 0,
        errorCount: 0,
        totalResponseTimeMs: 0,
        totalRequestBytes: 0,
        totalResponseBytes: 0,
      };
      this.usageBuffer.set(key, aggregate);
    }

    aggregate.callCount++;
    aggregate.totalResponseTimeMs += params.responseTimeMs;
    aggregate.totalRequestBytes += params.requestSize;
    aggregate.totalResponseBytes += params.responseSize;

    if (params.statusCode >= 400) {
      aggregate.errorCount++;
    }

    // Flush if buffer is full
    if (this.usageBuffer.size >= this.MAX_BUFFER_SIZE) {
      await this.flushBuffer();
    }

    // Also increment quota usage (real-time for enforcement)
    await this.incrementQuotaUsage(params.orgId, 'api_calls', 1);
  }

  /**
   * Get usage for a billing period
   */
  async getUsage(orgId: string, startDate: Date, endDate: Date): Promise<UsageReport> {
    // Flush buffer first to ensure we have latest data
    await this.flushBuffer();

    const startStr = startDate.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];

    // Query usage records
    const records = await db
      .select()
      .from(usageRecords)
      .where(
        and(
          eq(usageRecords.orgId, orgId),
          gte(usageRecords.date, startStr),
          lte(usageRecords.date, endStr)
        )
      );

    // Calculate summary
    const summary = {
      totalCalls: 0,
      totalErrors: 0,
      totalResponseTimeMs: 0,
      totalRequestBytes: 0,
      totalResponseBytes: 0,
    };

    const byEndpointMap = new Map<string, {
      endpoint: string;
      method: string;
      callCount: number;
      errorCount: number;
      totalResponseTimeMs: number;
    }>();

    const dailyMap = new Map<string, { callCount: number; errorCount: number }>();

    for (const record of records) {
      summary.totalCalls += record.callCount;
      summary.totalErrors += record.errorCount;
      summary.totalResponseTimeMs += record.totalResponseTimeMs;
      summary.totalRequestBytes += Number(record.totalRequestBytes);
      summary.totalResponseBytes += Number(record.totalResponseBytes);

      // Aggregate by endpoint
      const endpointKey = `${record.method}:${record.endpoint}`;
      const existing = byEndpointMap.get(endpointKey);
      if (existing) {
        existing.callCount += record.callCount;
        existing.errorCount += record.errorCount;
        existing.totalResponseTimeMs += record.totalResponseTimeMs;
      } else {
        byEndpointMap.set(endpointKey, {
          endpoint: record.endpoint,
          method: record.method,
          callCount: record.callCount,
          errorCount: record.errorCount,
          totalResponseTimeMs: record.totalResponseTimeMs,
        });
      }

      // Aggregate by day
      const dateStr = record.date;
      const dailyExisting = dailyMap.get(dateStr);
      if (dailyExisting) {
        dailyExisting.callCount += record.callCount;
        dailyExisting.errorCount += record.errorCount;
      } else {
        dailyMap.set(dateStr, {
          callCount: record.callCount,
          errorCount: record.errorCount,
        });
      }
    }

    return {
      orgId,
      period: { start: startDate, end: endDate },
      summary: {
        totalCalls: summary.totalCalls,
        totalErrors: summary.totalErrors,
        avgResponseTimeMs: summary.totalCalls > 0
          ? Math.round(summary.totalResponseTimeMs / summary.totalCalls)
          : 0,
        totalRequestBytes: summary.totalRequestBytes,
        totalResponseBytes: summary.totalResponseBytes,
      },
      byEndpoint: Array.from(byEndpointMap.values()).map(e => ({
        endpoint: e.endpoint,
        method: e.method,
        callCount: e.callCount,
        errorCount: e.errorCount,
        avgResponseTimeMs: e.callCount > 0
          ? Math.round(e.totalResponseTimeMs / e.callCount)
          : 0,
      })).sort((a, b) => b.callCount - a.callCount),
      dailyBreakdown: Array.from(dailyMap.entries())
        .map(([date, data]) => ({ date, ...data }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    };
  }

  /**
   * Check quota status for a resource
   */
  async checkQuota(orgId: string, resource: string): Promise<QuotaStatus> {
    const now = new Date();

    const quota = await db.query.usageQuotas.findFirst({
      where: and(
        eq(usageQuotas.orgId, orgId),
        eq(usageQuotas.resource, resource),
        lte(usageQuotas.periodStart, now),
        gte(usageQuotas.periodEnd, now)
      ),
    });

    if (!quota) {
      // No quota set - unlimited
      return {
        resource,
        limit: -1, // -1 means unlimited
        used: 0,
        remaining: -1,
        periodStart: now,
        periodEnd: now,
        percentUsed: 0,
        isExceeded: false,
      };
    }

    const remaining = Math.max(0, quota.limitValue - quota.usedValue);
    const percentUsed = quota.limitValue > 0
      ? Math.round((quota.usedValue / quota.limitValue) * 100)
      : 0;

    return {
      resource,
      limit: quota.limitValue,
      used: quota.usedValue,
      remaining,
      periodStart: quota.periodStart,
      periodEnd: quota.periodEnd,
      percentUsed,
      isExceeded: quota.usedValue >= quota.limitValue,
    };
  }

  /**
   * Initialize quota for an organization
   */
  async initializeQuotas(orgId: string, quotas: Record<string, number>): Promise<void> {
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1); // Start of month
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59); // End of month

    for (const [resource, limit] of Object.entries(quotas)) {
      await db.insert(usageQuotas).values({
        orgId,
        resource,
        periodStart,
        periodEnd,
        limitValue: limit,
        usedValue: 0,
      }).onConflictDoUpdate({
        target: [usageQuotas.orgId, usageQuotas.resource],
        set: { limitValue: limit, periodEnd },
      });
    }
  }

  /**
   * Increment quota usage
   */
  async incrementQuotaUsage(orgId: string, resource: string, amount: number = 1): Promise<boolean> {
    const now = new Date();

    const result = await db
      .update(usageQuotas)
      .set({
        usedValue: sql`${usageQuotas.usedValue} + ${amount}`,
      })
      .where(
        and(
          eq(usageQuotas.orgId, orgId),
          eq(usageQuotas.resource, resource),
          lte(usageQuotas.periodStart, now),
          gte(usageQuotas.periodEnd, now)
        )
      );

    return true;
  }

  /**
   * Reset quotas for a new billing period
   */
  async resetQuotasForPeriod(orgId: string, periodStart: Date, periodEnd: Date): Promise<void> {
    // Get current quotas to preserve limits
    const currentQuotas = await db.query.usageQuotas.findMany({
      where: eq(usageQuotas.orgId, orgId),
    });

    for (const quota of currentQuotas) {
      await db.insert(usageQuotas).values({
        orgId,
        resource: quota.resource,
        periodStart,
        periodEnd,
        limitValue: quota.limitValue,
        usedValue: 0,
      });
    }
  }

  /**
   * Get usage trends over time
   */
  async getUsageTrends(
    orgId: string,
    days: number = 30
  ): Promise<Array<{ date: string; calls: number; errors: number }>> {
    await this.flushBuffer();

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startStr = startDate.toISOString().split('T')[0];

    const records = await db
      .select({
        date: usageRecords.date,
        calls: sql<number>`SUM(${usageRecords.callCount})`,
        errors: sql<number>`SUM(${usageRecords.errorCount})`,
      })
      .from(usageRecords)
      .where(
        and(
          eq(usageRecords.orgId, orgId),
          gte(usageRecords.date, startStr)
        )
      )
      .groupBy(usageRecords.date)
      .orderBy(usageRecords.date);

    return records.map(r => ({
      date: r.date,
      calls: Number(r.calls) || 0,
      errors: Number(r.errors) || 0,
    }));
  }

  /**
   * Get top endpoints by usage
   */
  async getTopEndpoints(
    orgId: string,
    limit: number = 10,
    startDate?: Date,
    endDate?: Date
  ): Promise<Array<{ endpoint: string; method: string; calls: number; avgLatency: number }>> {
    await this.flushBuffer();

    const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate || new Date();

    const records = await db
      .select({
        endpoint: usageRecords.endpoint,
        method: usageRecords.method,
        calls: sql<number>`SUM(${usageRecords.callCount})`,
        totalTime: sql<number>`SUM(${usageRecords.totalResponseTimeMs})`,
      })
      .from(usageRecords)
      .where(
        and(
          eq(usageRecords.orgId, orgId),
          gte(usageRecords.date, start.toISOString().split('T')[0]),
          lte(usageRecords.date, end.toISOString().split('T')[0])
        )
      )
      .groupBy(usageRecords.endpoint, usageRecords.method)
      .orderBy(sql`SUM(${usageRecords.callCount}) DESC`)
      .limit(limit);

    return records.map(r => ({
      endpoint: r.endpoint,
      method: r.method,
      calls: Number(r.calls) || 0,
      avgLatency: r.calls > 0 ? Math.round(Number(r.totalTime) / Number(r.calls)) : 0,
    }));
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private startPeriodicFlush(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }

    this.flushInterval = setInterval(async () => {
      try {
        await this.flushBuffer();
      } catch (error) {
        logger.error('Failed to flush usage buffer', { error });
      }
    }, this.FLUSH_INTERVAL_MS);
  }

  /**
   * Flush the in-memory buffer to the database
   */
  async flushBuffer(): Promise<void> {
    if (this.usageBuffer.size === 0) {
      return;
    }

    const entries = Array.from(this.usageBuffer.entries());
    this.usageBuffer.clear();

    for (const [key, aggregate] of entries) {
      const [orgId, date, endpoint, method] = key.split(':');

      try {
        // Upsert usage record
        await db
          .insert(usageRecords)
          .values({
            orgId,
            date,
            endpoint,
            method,
            callCount: aggregate.callCount,
            errorCount: aggregate.errorCount,
            totalResponseTimeMs: aggregate.totalResponseTimeMs,
            totalRequestBytes: BigInt(aggregate.totalRequestBytes),
            totalResponseBytes: BigInt(aggregate.totalResponseBytes),
          })
          .onConflictDoUpdate({
            target: [usageRecords.orgId, usageRecords.date, usageRecords.endpoint, usageRecords.method],
            set: {
              callCount: sql`${usageRecords.callCount} + ${aggregate.callCount}`,
              errorCount: sql`${usageRecords.errorCount} + ${aggregate.errorCount}`,
              totalResponseTimeMs: sql`${usageRecords.totalResponseTimeMs} + ${aggregate.totalResponseTimeMs}`,
              totalRequestBytes: sql`${usageRecords.totalRequestBytes} + ${aggregate.totalRequestBytes}`,
              totalResponseBytes: sql`${usageRecords.totalResponseBytes} + ${aggregate.totalResponseBytes}`,
            },
          });
      } catch (error) {
        logger.error('Failed to upsert usage record', { error, key, aggregate });
      }
    }

    logger.debug(`Flushed ${entries.length} usage records to database`);
  }

  /**
   * Stop the periodic flush (for cleanup)
   */
  stop(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
  }
}

// Export singleton instance
export const usageService = new UsageService();
