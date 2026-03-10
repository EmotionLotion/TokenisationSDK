/**
 * HardwareConditionEvaluator - GPU hardware condition evaluator
 *
 * Evaluates custom conditions for GPU compute lifecycle transitions:
 * - HARDWARE_BENCHMARK_PASSED: Minimum benchmark score met
 * - DATACENTER_VERIFIED: Datacenter tier and certifications verified
 * - NODE_ONLINE_AND_OPERATIONAL: Node is online and passing health checks
 * - NODE_DECOMMISSIONED: Node hardware has been decommissioned
 * - SLA_COMPLIANT: Node meets uptime SLA requirements
 */

import type {
  ICustomConditionEvaluator,
  CustomConditionContext,
  CustomConditionResult,
} from '@tokenisation/core';
import type { BenchmarkModule, BenchmarkResult } from '../modules/BenchmarkModule.js';
import type { GPUNodeModule, GPUNode, NodeHealthCheck } from '../modules/GPUNodeModule.js';

// ============================================================================
// Configuration
// ============================================================================

export interface HardwareConditionEvaluatorConfig {
  benchmarkModule: BenchmarkModule;
  nodeModule: GPUNodeModule;
  /** Minimum benchmark score to pass (default: 80) */
  minBenchmarkScore?: number;
  /** Minimum uptime % for SLA compliance (default: 95) */
  minUptimePercent?: number;
  /** Cache TTL in milliseconds (default: 5 minutes) */
  cacheTtlMs?: number;
}

// ============================================================================
// Evaluator
// ============================================================================

interface CacheEntry {
  data: unknown;
  cachedAt: number;
}

export class HardwareConditionEvaluator implements ICustomConditionEvaluator {
  readonly evaluatorId = 'hardware-condition-evaluator';
  readonly supportedConditions = [
    'HARDWARE_BENCHMARK_PASSED',
    'DATACENTER_VERIFIED',
    'NODE_ONLINE_AND_OPERATIONAL',
    'NODE_DECOMMISSIONED',
    'SLA_COMPLIANT',
  ];

  private benchmarkModule: BenchmarkModule;
  private nodeModule: GPUNodeModule;
  private minBenchmarkScore: number;
  private minUptimePercent: number;
  private cacheTtlMs: number;
  private cache: Map<string, CacheEntry> = new Map();

  constructor(config: HardwareConditionEvaluatorConfig) {
    this.benchmarkModule = config.benchmarkModule;
    this.nodeModule = config.nodeModule;
    this.minBenchmarkScore = config.minBenchmarkScore ?? 80;
    this.minUptimePercent = config.minUptimePercent ?? 95;
    this.cacheTtlMs = config.cacheTtlMs ?? 5 * 60 * 1000;
  }

  supports(conditionName: string): boolean {
    return this.supportedConditions.includes(conditionName);
  }

  async evaluate(
    conditionName: string,
    context: CustomConditionContext,
  ): Promise<CustomConditionResult> {
    if (!this.supports(conditionName)) {
      return { satisfied: false, reason: `Unsupported condition: ${conditionName}` };
    }

    const nodeId = context.asset.metadata?.nodeId as string | undefined;
    if (!nodeId) {
      return { satisfied: false, reason: 'Asset metadata must include nodeId for hardware evaluation' };
    }

    switch (conditionName) {
      case 'HARDWARE_BENCHMARK_PASSED':
        return this.evaluateBenchmark(nodeId);
      case 'DATACENTER_VERIFIED':
        return this.evaluateDatacenter(nodeId);
      case 'NODE_ONLINE_AND_OPERATIONAL':
        return this.evaluateNodeOnline(nodeId);
      case 'NODE_DECOMMISSIONED':
        return this.evaluateDecommissioned(nodeId);
      case 'SLA_COMPLIANT':
        return this.evaluateSLA(nodeId);
      default:
        return { satisfied: false, reason: `Unknown condition: ${conditionName}` };
    }
  }

  private async evaluateBenchmark(nodeId: string): Promise<CustomConditionResult> {
    try {
      const benchmark = await this.benchmarkModule.getLatestVerified(nodeId);
      if (!benchmark) {
        return { satisfied: false, reason: 'No verified benchmark found for this node' };
      }
      if (benchmark.score < this.minBenchmarkScore) {
        return {
          satisfied: false,
          reason: `Benchmark score ${benchmark.score} below minimum ${this.minBenchmarkScore}`,
          evidence: { benchmark },
        };
      }
      return {
        satisfied: true,
        evidence: { benchmark, minScore: this.minBenchmarkScore },
      };
    } catch (error) {
      return {
        satisfied: false,
        reason: `Benchmark check failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  private async evaluateDatacenter(nodeId: string): Promise<CustomConditionResult> {
    try {
      const node = await this.nodeModule.get(nodeId);
      if (node.datacenterTier < 2) {
        return {
          satisfied: false,
          reason: `Datacenter tier ${node.datacenterTier} below minimum tier 2`,
          evidence: { datacenterTier: node.datacenterTier },
        };
      }
      return {
        satisfied: true,
        evidence: {
          datacenterName: node.datacenterName,
          datacenterTier: node.datacenterTier,
          datacenterLocation: node.datacenterLocation,
          certifications: node.datacenterCertifications,
        },
      };
    } catch (error) {
      return {
        satisfied: false,
        reason: `Datacenter verification failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  private async evaluateNodeOnline(nodeId: string): Promise<CustomConditionResult> {
    try {
      const health = await this.nodeModule.getHealth(nodeId);
      if (health.status === 'unreachable' || health.status === 'critical') {
        return {
          satisfied: false,
          reason: `Node health status is '${health.status}'`,
          evidence: { health },
        };
      }
      return {
        satisfied: true,
        evidence: { health },
      };
    } catch (error) {
      return {
        satisfied: false,
        reason: `Health check failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  private async evaluateDecommissioned(nodeId: string): Promise<CustomConditionResult> {
    try {
      const node = await this.nodeModule.get(nodeId);
      if (node.status !== 'decommissioned') {
        return {
          satisfied: false,
          reason: `Node status is '${node.status}', expected 'decommissioned'`,
        };
      }
      return {
        satisfied: true,
        evidence: { nodeStatus: node.status },
      };
    } catch (error) {
      return {
        satisfied: false,
        reason: `Decommission check failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  private async evaluateSLA(nodeId: string): Promise<CustomConditionResult> {
    try {
      const node = await this.nodeModule.get(nodeId);
      const uptime = node.uptimePercent;
      if (uptime === undefined) {
        return { satisfied: false, reason: 'Uptime data not available' };
      }
      if (uptime < this.minUptimePercent) {
        return {
          satisfied: false,
          reason: `Uptime ${uptime}% below SLA minimum ${this.minUptimePercent}%`,
          evidence: { uptimePercent: uptime, slaThreshold: this.minUptimePercent },
        };
      }
      return {
        satisfied: true,
        evidence: { uptimePercent: uptime, slaThreshold: this.minUptimePercent },
      };
    } catch (error) {
      return {
        satisfied: false,
        reason: `SLA check failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  clearCache(): void {
    this.cache.clear();
  }
}
