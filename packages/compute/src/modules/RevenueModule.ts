/**
 * RevenueModule - SDK module for compute revenue tracking and distribution.
 *
 * Tracks revenue from GPU rentals (spot, reserved, contract),
 * computes net income, and manages distribution to token holders.
 *
 * Server routes mounted at /api/v1/compute/revenue.
 */

import type { HttpClient } from '@tokenisation/core';
import { parseOrThrow, recordRevenueInputSchema, distributionRequestInputSchema } from '../validation/compute.js';

// ============================================================================
// Types
// ============================================================================

export type RevenueSource = 'spot' | 'reserved' | 'contract' | 'inference' | 'training' | 'other';

export interface RevenueRecord {
  id: string;
  assetId: string;
  nodeId?: string;
  source: RevenueSource;
  amount: string;
  currency: string;
  period: string;
  jobId?: string;
  clientId?: string;
  gpuHoursConsumed?: number;
  metadata?: Record<string, unknown>;
  recordedAt: string;
}

export interface RevenueSummary {
  assetId: string;
  period: string;
  totalRevenue: string;
  revenueBySource: Record<RevenueSource, string>;
  totalOperatingCosts: string;
  netIncome: string;
  totalGpuHours: number;
  effectiveRate: string;
  currency: string;
}

export interface Distribution {
  id: string;
  assetId: string;
  period: string;
  totalRevenue: string;
  operatingCosts: string;
  distributableAmount: string;
  currency: string;
  status: 'pending' | 'approved' | 'distributing' | 'completed' | 'failed';
  tokenHolders: number;
  amountPerToken?: string;
  initiatedAt: string;
  completedAt?: string;
}

// ============================================================================
// Module
// ============================================================================

export class RevenueModule {
  constructor(private http: HttpClient) {}

  /**
   * Record a revenue event for an asset.
   */
  async record(assetId: string, input: {
    source: RevenueSource;
    amount: string;
    currency?: string;
    period: string;
    jobId?: string;
    clientId?: string;
    gpuHoursConsumed?: number;
    metadata?: Record<string, unknown>;
  }): Promise<RevenueRecord> {
    const validated = parseOrThrow(recordRevenueInputSchema, input, 'RecordRevenue');
    const response = await this.http.post<{ revenue: RevenueRecord }>(
      `/api/v1/compute/${encodeURIComponent(assetId)}/revenue`,
      validated,
    );
    return response.data.revenue;
  }

  /**
   * List revenue records for an asset.
   */
  async list(assetId: string, params?: {
    source?: RevenueSource;
    period?: string;
    from?: string;
    to?: string;
    limit?: number;
    offset?: number;
  }): Promise<RevenueRecord[]> {
    const response = await this.http.get<{ records: RevenueRecord[]; count: number }>(
      `/api/v1/compute/${encodeURIComponent(assetId)}/revenue`,
      params as Record<string, string | number | boolean | undefined>,
    );
    return response.data.records;
  }

  /**
   * Get revenue summary for a period.
   */
  async getSummary(assetId: string, period: string): Promise<RevenueSummary> {
    const response = await this.http.get<RevenueSummary>(
      `/api/v1/compute/${encodeURIComponent(assetId)}/revenue/summary`,
      { period },
    );
    return response.data;
  }

  /**
   * Initiate a distribution for a period.
   */
  async initiateDistribution(assetId: string, input: {
    period: string;
    totalRevenue: string;
    operatingCosts: string;
    currency?: string;
  }): Promise<Distribution> {
    const validated = parseOrThrow(distributionRequestInputSchema, input, 'InitiateDistribution');
    const response = await this.http.post<{ distribution: Distribution }>(
      `/api/v1/compute/${encodeURIComponent(assetId)}/distributions`,
      validated,
    );
    return response.data.distribution;
  }

  /**
   * List distributions for an asset.
   */
  async listDistributions(assetId: string, params?: {
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<Distribution[]> {
    const response = await this.http.get<{ distributions: Distribution[]; count: number }>(
      `/api/v1/compute/${encodeURIComponent(assetId)}/distributions`,
      params as Record<string, string | number | boolean | undefined>,
    );
    return response.data.distributions;
  }

  /**
   * Get a specific distribution.
   */
  async getDistribution(distributionId: string): Promise<Distribution> {
    const response = await this.http.get<{ distribution: Distribution }>(
      `/api/v1/compute/distributions/${encodeURIComponent(distributionId)}`,
    );
    return response.data.distribution;
  }
}
