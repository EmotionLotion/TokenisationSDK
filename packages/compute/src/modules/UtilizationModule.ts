/**
 * UtilizationModule - SDK module for GPU utilization tracking.
 *
 * Provides real-time utilization reporting, history, SLA monitoring,
 * and fleet-wide utilization analytics.
 *
 * Server routes mounted at /api/v1/compute/utilization.
 */

import type { HttpClient } from '@tokenisation/core';
import { parseOrThrow, reportUtilizationInputSchema } from '../validation/compute.js';

// ============================================================================
// Types
// ============================================================================

export interface UtilizationSnapshot {
  id: string;
  nodeId: string;
  gpuUtilizationPercent: number;
  memoryUtilizationPercent: number;
  powerDrawWatts?: number;
  temperatureCelsius?: number;
  activeJobs?: number;
  reportedAt: string;
}

export interface UtilizationSummary {
  nodeId: string;
  period: string;
  averageGpuUtilization: number;
  peakGpuUtilization: number;
  averageMemoryUtilization: number;
  totalGpuHours: number;
  uptimePercent: number;
  slaCompliant: boolean;
  slaThreshold: number;
}

export interface FleetUtilization {
  assetId: string;
  totalNodes: number;
  activeNodes: number;
  averageUtilization: number;
  totalGpuHoursAvailable: number;
  totalGpuHoursConsumed: number;
  fleetEfficiency: number;
  period: string;
}

// ============================================================================
// Module
// ============================================================================

export class UtilizationModule {
  constructor(private http: HttpClient) {}

  /**
   * Report a utilization snapshot for a node.
   */
  async report(input: {
    nodeId: string;
    gpuUtilizationPercent: number;
    memoryUtilizationPercent: number;
    powerDrawWatts?: number;
    temperatureCelsius?: number;
    activeJobs?: number;
    reportedAt?: string;
  }): Promise<UtilizationSnapshot> {
    const validated = parseOrThrow(reportUtilizationInputSchema, input, 'ReportUtilization');
    const response = await this.http.post<{ snapshot: UtilizationSnapshot }>(
      '/api/v1/compute/utilization',
      validated,
    );
    return response.data.snapshot;
  }

  /**
   * Get latest utilization for a node.
   */
  async getCurrent(nodeId: string): Promise<UtilizationSnapshot> {
    const response = await this.http.get<{ snapshot: UtilizationSnapshot }>(
      `/api/v1/compute/nodes/${encodeURIComponent(nodeId)}/utilization/current`,
    );
    return response.data.snapshot;
  }

  /**
   * Get utilization history for a node.
   */
  async getHistory(nodeId: string, params?: {
    from?: string;
    to?: string;
    resolution?: 'minute' | 'hour' | 'day';
    limit?: number;
  }): Promise<UtilizationSnapshot[]> {
    const response = await this.http.get<{ snapshots: UtilizationSnapshot[]; count: number }>(
      `/api/v1/compute/nodes/${encodeURIComponent(nodeId)}/utilization/history`,
      params as Record<string, string | number | boolean | undefined>,
    );
    return response.data.snapshots;
  }

  /**
   * Get utilization summary for a period.
   */
  async getSummary(nodeId: string, period: string): Promise<UtilizationSummary> {
    const response = await this.http.get<UtilizationSummary>(
      `/api/v1/compute/nodes/${encodeURIComponent(nodeId)}/utilization/summary`,
      { period },
    );
    return response.data;
  }

  /**
   * Get fleet-wide utilization for an asset.
   */
  async getFleetUtilization(assetId: string, params?: {
    period?: string;
    from?: string;
    to?: string;
  }): Promise<FleetUtilization> {
    const response = await this.http.get<FleetUtilization>(
      `/api/v1/compute/${encodeURIComponent(assetId)}/utilization/fleet`,
      params as Record<string, string | number | boolean | undefined>,
    );
    return response.data;
  }
}
