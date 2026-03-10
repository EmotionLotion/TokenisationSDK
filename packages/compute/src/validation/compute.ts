/**
 * Compute Validation Schemas
 *
 * Zod schemas for all compute-related SDK module inputs.
 * Used by GPUNodeModule, ClusterModule, BenchmarkModule,
 * UtilizationModule, and RevenueModule.
 */

import { z, ZodSchema } from 'zod';

// ============================================================================
// Validation Utility
// ============================================================================

export class ValidationError extends Error {
  public readonly code = 'VALIDATION_ERROR';
  public readonly fieldErrors: Array<{ path: string; message: string }>;

  constructor(message: string, fieldErrors: Array<{ path: string; message: string }>) {
    super(message);
    this.name = 'ValidationError';
    this.fieldErrors = fieldErrors;
  }
}

/**
 * Parse input against a Zod schema and throw a clear ValidationError on failure.
 */
export function parseOrThrow<T>(schema: ZodSchema<T>, data: unknown, label: string): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const fieldErrors = result.error.issues.map(issue => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));
    const summary = fieldErrors
      .map(e => e.path ? `${e.path}: ${e.message}` : e.message)
      .join('; ');
    throw new ValidationError(
      `${label} validation failed: ${summary}`,
      fieldErrors,
    );
  }
  return result.data;
}

// ============================================================================
// GPU Node Module Schemas
// ============================================================================

export const registerNodeInputSchema = z.object({
  name: z.string().min(1, 'name is required').max(256),
  gpuModel: z.string().min(1, 'gpuModel is required'),
  gpuCount: z.number().int().positive('gpuCount must be a positive integer'),
  vramPerGpuGB: z.number().positive('vramPerGpuGB must be positive'),
  interconnect: z.string().min(1, 'interconnect is required'),
  datacenterName: z.string().min(1, 'datacenterName is required'),
  datacenterTier: z.number().int().min(1).max(4),
  datacenterLocation: z.string().min(1, 'datacenterLocation is required'),
  datacenterCertifications: z.array(z.string()).optional(),
  acquisitionCostUsd: z.string().regex(/^\d+(\.\d+)?$/, 'acquisitionCostUsd must be a positive number string'),
  acquisitionDate: z.string().min(1, 'acquisitionDate is required'),
  estimatedUsefulLifeMonths: z.number().int().positive(),
  metadata: z.record(z.unknown()).optional(),
});
export type RegisterNodeInput = z.infer<typeof registerNodeInputSchema>;

export const updateNodeInputSchema = z.object({
  name: z.string().min(1).max(256).optional(),
  status: z.enum(['online', 'offline', 'maintenance', 'decommissioned']).optional(),
  spotPricePerHourUsd: z.string().regex(/^\d+(\.\d+)?$/).optional(),
  monthlyOperatingCostUsd: z.string().regex(/^\d+(\.\d+)?$/).optional(),
  metadata: z.record(z.unknown()).optional(),
}).refine(obj => Object.keys(obj).length > 0, 'At least one field required');
export type UpdateNodeInput = z.infer<typeof updateNodeInputSchema>;

// ============================================================================
// Cluster Module Schemas
// ============================================================================

export const createClusterInputSchema = z.object({
  name: z.string().min(1, 'name is required').max(256),
  nodeIds: z.array(z.string().min(1)).min(1, 'At least one node is required'),
  description: z.string().max(1000).optional(),
  networkTopology: z.enum(['mesh', 'ring', 'star', 'fat-tree']).optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type CreateClusterInput = z.infer<typeof createClusterInputSchema>;

export const updateClusterInputSchema = z.object({
  name: z.string().min(1).max(256).optional(),
  addNodeIds: z.array(z.string()).optional(),
  removeNodeIds: z.array(z.string()).optional(),
  description: z.string().max(1000).optional(),
  metadata: z.record(z.unknown()).optional(),
}).refine(obj => Object.keys(obj).length > 0, 'At least one field required');
export type UpdateClusterInput = z.infer<typeof updateClusterInputSchema>;

// ============================================================================
// Benchmark Module Schemas
// ============================================================================

export const submitBenchmarkInputSchema = z.object({
  nodeId: z.string().min(1, 'nodeId is required'),
  suite: z.enum(['mlperf', 'geekbench', 'spec', 'custom']),
  score: z.number().min(0, 'score must be non-negative'),
  rawResults: z.record(z.unknown()).optional(),
  runDurationSeconds: z.number().positive().optional(),
  softwareVersion: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type SubmitBenchmarkInput = z.infer<typeof submitBenchmarkInputSchema>;

// ============================================================================
// Utilization Module Schemas
// ============================================================================

export const reportUtilizationInputSchema = z.object({
  nodeId: z.string().min(1, 'nodeId is required'),
  gpuUtilizationPercent: z.number().min(0).max(100),
  memoryUtilizationPercent: z.number().min(0).max(100),
  powerDrawWatts: z.number().min(0).optional(),
  temperatureCelsius: z.number().optional(),
  activeJobs: z.number().int().min(0).optional(),
  reportedAt: z.string().datetime().optional(),
});
export type ReportUtilizationInput = z.infer<typeof reportUtilizationInputSchema>;

// ============================================================================
// Revenue Module Schemas
// ============================================================================

export const recordRevenueInputSchema = z.object({
  source: z.enum(['spot', 'reserved', 'contract', 'inference', 'training', 'other']),
  amount: z.string().regex(/^\d+(\.\d+)?$/, 'amount must be a positive number string'),
  currency: z.string().min(1).max(10).default('USD'),
  period: z.string().min(1, 'period is required'),
  jobId: z.string().optional(),
  clientId: z.string().optional(),
  gpuHoursConsumed: z.number().positive().optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type RecordRevenueInput = z.infer<typeof recordRevenueInputSchema>;

export const distributionRequestInputSchema = z.object({
  period: z.string().min(1, 'period is required'),
  totalRevenue: z.string().regex(/^\d+(\.\d+)?$/),
  operatingCosts: z.string().regex(/^\d+(\.\d+)?$/),
  currency: z.string().min(1).max(10).default('USD'),
});
export type DistributionRequestInput = z.infer<typeof distributionRequestInputSchema>;

// ============================================================================
// Secondary Market Schemas
// ============================================================================

export const createComputeListingInputSchema = z.object({
  tokenAmount: z.number().int().positive('tokenAmount must be a positive integer'),
  pricePerToken: z.number().positive('pricePerToken must be positive'),
  sellerWallet: z.string().min(1, 'sellerWallet is required'),
  currency: z.string().optional(),
  expiresAt: z.string().datetime().optional(),
});
export type CreateComputeListingInput = z.infer<typeof createComputeListingInputSchema>;
