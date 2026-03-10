import { z } from 'zod';

export const GPUModelEnum = z.enum([
  'H100', 'H200', 'A100', 'A10G', 'L40S', 'L4',
  'RTX_4090', 'RTX_3090', 'RTX_3080',
  'MI300X', 'MI250X',
  'OTHER',
]);
export type GPUModel = z.infer<typeof GPUModelEnum>;

export const InterconnectEnum = z.enum(['NVLink', 'NVSwitch', 'PCIe_4', 'PCIe_5', 'InfiniBand', 'OTHER']);
export type Interconnect = z.infer<typeof InterconnectEnum>;

export const DatacenterTierEnum = z.enum(['1', '2', '3', '4']);
export type DatacenterTier = z.infer<typeof DatacenterTierEnum>;

export const ComputeMetadataSchema = z.object({
  assetType: z.literal('GPU_COMPUTE'),

  // Hardware
  gpuModel: GPUModelEnum,
  gpuCount: z.number().int().positive(),
  vramPerGpuGB: z.number().positive(),
  interconnect: InterconnectEnum,
  totalTFLOPS: z.number().positive().optional(),

  // Datacenter
  datacenter: z.object({
    name: z.string(),
    tier: DatacenterTierEnum,
    location: z.string(),
    certifications: z.array(z.string()).optional(),
  }),

  // Economics
  acquisitionCostUsd: z.string(),
  acquisitionDate: z.string().datetime(),
  estimatedUsefulLifeMonths: z.number().int().positive(),
  monthlyOperatingCostUsd: z.string().optional(),
  spotPricePerHourUsd: z.string().optional(),

  // Performance
  benchmarkScore: z.number().min(0).optional(),
  benchmarkSuite: z.string().optional(),
  currentUtilization: z.number().min(0).max(100).optional(),
  uptimePercent: z.number().min(0).max(100).optional(),

  // Yield
  expectedAnnualYieldPercent: z.number().min(0).max(100).optional(),
});

export type ComputeMetadata = z.infer<typeof ComputeMetadataSchema>;
