/**
 * IBenchmarkProvider - Interface for benchmark verification providers.
 *
 * Implementations connect to external benchmark services
 * (MLPerf, Geekbench, custom) to verify hardware performance.
 */

export interface BenchmarkProviderConfig {
  apiUrl?: string;
  apiKey?: string;
  timeoutMs?: number;
}

export interface BenchmarkVerificationRequest {
  nodeId: string;
  gpuModel: string;
  gpuCount: number;
  vramPerGpuGB: number;
  claimedScore: number;
  suite: string;
  rawResults?: Record<string, unknown>;
}

export interface BenchmarkVerificationResult {
  verified: boolean;
  actualScore: number;
  claimedScore: number;
  discrepancyPercent: number;
  suite: string;
  details: Record<string, unknown>;
  verifiedAt: string;
}

export interface IBenchmarkProvider {
  readonly providerId: string;
  verify(request: BenchmarkVerificationRequest): Promise<BenchmarkVerificationResult>;
}

/**
 * Mock benchmark provider for testing.
 */
export class MockBenchmarkProvider implements IBenchmarkProvider {
  readonly providerId = 'mock-benchmark';
  private maxDiscrepancyPercent: number;

  constructor(config?: { maxDiscrepancyPercent?: number }) {
    this.maxDiscrepancyPercent = config?.maxDiscrepancyPercent ?? 10;
  }

  async verify(request: BenchmarkVerificationRequest): Promise<BenchmarkVerificationResult> {
    const actualScore = request.claimedScore * (0.95 + Math.random() * 0.1);
    const discrepancy = Math.abs(actualScore - request.claimedScore) / request.claimedScore * 100;

    return {
      verified: discrepancy <= this.maxDiscrepancyPercent,
      actualScore: Math.round(actualScore * 100) / 100,
      claimedScore: request.claimedScore,
      discrepancyPercent: Math.round(discrepancy * 100) / 100,
      suite: request.suite,
      details: {
        gpuModel: request.gpuModel,
        gpuCount: request.gpuCount,
        provider: 'mock',
      },
      verifiedAt: new Date().toISOString(),
    };
  }
}
