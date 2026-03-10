/**
 * BenchmarkModule - SDK module for hardware benchmark management.
 *
 * Provides benchmark submission, verification, and history tracking.
 * Benchmarks are required for hardware verification during the
 * BENCHMARKING lifecycle state.
 *
 * Server routes mounted at /api/v1/compute/benchmarks.
 */

import type { HttpClient } from '@tokenisation/core';
import { parseOrThrow, submitBenchmarkInputSchema } from '../validation/compute.js';

// ============================================================================
// Types
// ============================================================================

export type BenchmarkSuite = 'mlperf' | 'geekbench' | 'spec' | 'custom';
export type BenchmarkStatus = 'pending' | 'verified' | 'rejected' | 'expired';

export interface BenchmarkResult {
  id: string;
  nodeId: string;
  suite: BenchmarkSuite;
  score: number;
  rawResults?: Record<string, unknown>;
  runDurationSeconds?: number;
  softwareVersion?: string;
  status: BenchmarkStatus;
  verifiedBy?: string;
  verifiedAt?: string;
  metadata?: Record<string, unknown>;
  submittedAt: string;
  expiresAt: string;
}

export interface BenchmarkComparison {
  nodeId: string;
  currentScore: number;
  previousScore?: number;
  percentile: number;
  modelAverage: number;
  modelMedian: number;
  rank: number;
  totalNodes: number;
}

// ============================================================================
// Module
// ============================================================================

export class BenchmarkModule {
  constructor(private http: HttpClient) {}

  /**
   * Submit a benchmark result for a node.
   */
  async submit(input: {
    nodeId: string;
    suite: BenchmarkSuite;
    score: number;
    rawResults?: Record<string, unknown>;
    runDurationSeconds?: number;
    softwareVersion?: string;
    metadata?: Record<string, unknown>;
  }): Promise<BenchmarkResult> {
    const validated = parseOrThrow(submitBenchmarkInputSchema, input, 'SubmitBenchmark');
    const response = await this.http.post<{ benchmark: BenchmarkResult }>(
      '/api/v1/compute/benchmarks',
      validated,
    );
    return response.data.benchmark;
  }

  /**
   * Get a specific benchmark result.
   */
  async get(benchmarkId: string): Promise<BenchmarkResult> {
    const response = await this.http.get<{ benchmark: BenchmarkResult }>(
      `/api/v1/compute/benchmarks/${encodeURIComponent(benchmarkId)}`,
    );
    return response.data.benchmark;
  }

  /**
   * List benchmark results for a node.
   */
  async listForNode(nodeId: string, params?: {
    suite?: BenchmarkSuite;
    status?: BenchmarkStatus;
    limit?: number;
  }): Promise<BenchmarkResult[]> {
    const response = await this.http.get<{ benchmarks: BenchmarkResult[]; count: number }>(
      `/api/v1/compute/nodes/${encodeURIComponent(nodeId)}/benchmarks`,
      params as Record<string, string | number | boolean | undefined>,
    );
    return response.data.benchmarks;
  }

  /**
   * Get the latest verified benchmark for a node.
   */
  async getLatestVerified(nodeId: string): Promise<BenchmarkResult | null> {
    const response = await this.http.get<{ benchmark: BenchmarkResult | null }>(
      `/api/v1/compute/nodes/${encodeURIComponent(nodeId)}/benchmarks/latest`,
    );
    return response.data.benchmark;
  }

  /**
   * Compare a node's benchmark against fleet averages.
   */
  async compare(nodeId: string): Promise<BenchmarkComparison> {
    const response = await this.http.get<BenchmarkComparison>(
      `/api/v1/compute/nodes/${encodeURIComponent(nodeId)}/benchmarks/compare`,
    );
    return response.data;
  }
}
