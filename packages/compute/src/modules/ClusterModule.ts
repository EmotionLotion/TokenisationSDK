/**
 * ClusterModule - SDK module for GPU cluster management.
 *
 * Groups GPU nodes into logical clusters for distributed
 * training, inference serving, and multi-node workloads.
 *
 * Server routes mounted at /api/v1/compute/clusters.
 */

import type { HttpClient } from '@tokenisation/core';
import { parseOrThrow, createClusterInputSchema, updateClusterInputSchema } from '../validation/compute.js';

// ============================================================================
// Types
// ============================================================================

export interface GPUCluster {
  id: string;
  assetId: string;
  name: string;
  description?: string;
  nodeIds: string[];
  nodeCount: number;
  totalGPUs: number;
  totalVRAMTB: number;
  networkTopology?: string;
  status: 'provisioning' | 'active' | 'degraded' | 'inactive';
  aggregateUtilization?: number;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ClusterPerformance {
  clusterId: string;
  averageUtilization: number;
  peakUtilization: number;
  totalGPUHours: number;
  activeJobs: number;
  averageJobLatencyMs: number;
  period: string;
  measuredAt: string;
}

// ============================================================================
// Module
// ============================================================================

export class ClusterModule {
  constructor(private http: HttpClient) {}

  /**
   * Create a new cluster from existing nodes.
   */
  async create(assetId: string, input: {
    name: string;
    nodeIds: string[];
    description?: string;
    networkTopology?: 'mesh' | 'ring' | 'star' | 'fat-tree';
    metadata?: Record<string, unknown>;
  }): Promise<GPUCluster> {
    const validated = parseOrThrow(createClusterInputSchema, input, 'CreateCluster');
    const response = await this.http.post<{ cluster: GPUCluster }>(
      `/api/v1/compute/${encodeURIComponent(assetId)}/clusters`,
      validated,
    );
    return response.data.cluster;
  }

  /**
   * List all clusters for an asset.
   */
  async list(assetId: string): Promise<GPUCluster[]> {
    const response = await this.http.get<{ clusters: GPUCluster[]; count: number }>(
      `/api/v1/compute/${encodeURIComponent(assetId)}/clusters`,
    );
    return response.data.clusters;
  }

  /**
   * Get a specific cluster.
   */
  async get(clusterId: string): Promise<GPUCluster> {
    const response = await this.http.get<{ cluster: GPUCluster }>(
      `/api/v1/compute/clusters/${encodeURIComponent(clusterId)}`,
    );
    return response.data.cluster;
  }

  /**
   * Update a cluster (add/remove nodes, rename).
   */
  async update(clusterId: string, input: {
    name?: string;
    addNodeIds?: string[];
    removeNodeIds?: string[];
    description?: string;
    metadata?: Record<string, unknown>;
  }): Promise<GPUCluster> {
    const validated = parseOrThrow(updateClusterInputSchema, input, 'UpdateCluster');
    const response = await this.http.patch<{ cluster: GPUCluster }>(
      `/api/v1/compute/clusters/${encodeURIComponent(clusterId)}`,
      validated,
    );
    return response.data.cluster;
  }

  /**
   * Delete a cluster (does not delete underlying nodes).
   */
  async delete(clusterId: string): Promise<{ success: boolean }> {
    const response = await this.http.delete<{ success: boolean }>(
      `/api/v1/compute/clusters/${encodeURIComponent(clusterId)}`,
    );
    return response.data;
  }

  /**
   * Get cluster performance metrics.
   */
  async getPerformance(clusterId: string, params?: {
    period?: string;
    from?: string;
    to?: string;
  }): Promise<ClusterPerformance> {
    const response = await this.http.get<ClusterPerformance>(
      `/api/v1/compute/clusters/${encodeURIComponent(clusterId)}/performance`,
      params as Record<string, string | number | boolean | undefined>,
    );
    return response.data;
  }
}
