/**
 * GPUNodeModule - SDK module for GPU node management.
 *
 * Provides node registration, status management, health checks,
 * and hardware inventory for tokenized compute infrastructure.
 *
 * Server routes mounted at /api/v1/compute/nodes.
 */

import type { HttpClient } from '@tokenisation/core';
import { parseOrThrow, registerNodeInputSchema, updateNodeInputSchema } from '../validation/compute.js';

// ============================================================================
// Types
// ============================================================================

export type NodeStatus = 'provisioning' | 'benchmarking' | 'online' | 'offline' | 'maintenance' | 'degraded' | 'decommissioned';

export interface GPUNode {
  id: string;
  assetId: string;
  name: string;
  gpuModel: string;
  gpuCount: number;
  vramPerGpuGB: number;
  interconnect: string;
  datacenterName: string;
  datacenterTier: number;
  datacenterLocation: string;
  datacenterCertifications: string[];
  acquisitionCostUsd: string;
  acquisitionDate: string;
  estimatedUsefulLifeMonths: number;
  spotPricePerHourUsd?: string;
  monthlyOperatingCostUsd?: string;
  status: NodeStatus;
  uptimePercent?: number;
  lastHealthCheck?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface NodeHealthCheck {
  nodeId: string;
  status: 'healthy' | 'warning' | 'critical' | 'unreachable';
  gpuUtilization: number;
  memoryUtilization: number;
  temperatureCelsius: number;
  powerDrawWatts: number;
  uptimeSeconds: number;
  errorCount: number;
  checkedAt: string;
}

export interface NodeSummary {
  totalNodes: number;
  onlineNodes: number;
  offlineNodes: number;
  degradedNodes: number;
  totalGPUs: number;
  totalVRAMTB: number;
  averageUtilization: number;
  averageUptime: number;
}

// ============================================================================
// Module
// ============================================================================

export class GPUNodeModule {
  constructor(private http: HttpClient) {}

  /**
   * Register a new GPU node.
   */
  async register(assetId: string, input: {
    name: string;
    gpuModel: string;
    gpuCount: number;
    vramPerGpuGB: number;
    interconnect: string;
    datacenterName: string;
    datacenterTier: number;
    datacenterLocation: string;
    datacenterCertifications?: string[];
    acquisitionCostUsd: string;
    acquisitionDate: string;
    estimatedUsefulLifeMonths: number;
    metadata?: Record<string, unknown>;
  }): Promise<GPUNode> {
    const validated = parseOrThrow(registerNodeInputSchema, input, 'RegisterNode');
    const response = await this.http.post<{ node: GPUNode }>(
      `/api/v1/compute/${encodeURIComponent(assetId)}/nodes`,
      validated,
    );
    return response.data.node;
  }

  /**
   * List all nodes for an asset.
   */
  async list(assetId: string, params?: {
    status?: NodeStatus;
    limit?: number;
    offset?: number;
  }): Promise<GPUNode[]> {
    const response = await this.http.get<{ nodes: GPUNode[]; count: number }>(
      `/api/v1/compute/${encodeURIComponent(assetId)}/nodes`,
      params as Record<string, string | number | boolean | undefined>,
    );
    return response.data.nodes;
  }

  /**
   * Get a specific node.
   */
  async get(nodeId: string): Promise<GPUNode> {
    const response = await this.http.get<{ node: GPUNode }>(
      `/api/v1/compute/nodes/${encodeURIComponent(nodeId)}`,
    );
    return response.data.node;
  }

  /**
   * Update a node's configuration or status.
   */
  async update(nodeId: string, input: {
    name?: string;
    status?: 'online' | 'offline' | 'maintenance' | 'decommissioned';
    spotPricePerHourUsd?: string;
    monthlyOperatingCostUsd?: string;
    metadata?: Record<string, unknown>;
  }): Promise<GPUNode> {
    const validated = parseOrThrow(updateNodeInputSchema, input, 'UpdateNode');
    const response = await this.http.patch<{ node: GPUNode }>(
      `/api/v1/compute/nodes/${encodeURIComponent(nodeId)}`,
      validated,
    );
    return response.data.node;
  }

  /**
   * Get the latest health check for a node.
   */
  async getHealth(nodeId: string): Promise<NodeHealthCheck> {
    const response = await this.http.get<NodeHealthCheck>(
      `/api/v1/compute/nodes/${encodeURIComponent(nodeId)}/health`,
    );
    return response.data;
  }

  /**
   * Get an aggregate summary across all nodes for an asset.
   */
  async getSummary(assetId: string): Promise<NodeSummary> {
    const response = await this.http.get<{ summary: NodeSummary }>(
      `/api/v1/compute/${encodeURIComponent(assetId)}/summary`,
    );
    return response.data.summary;
  }
}
