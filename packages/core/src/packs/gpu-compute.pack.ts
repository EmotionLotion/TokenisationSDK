/**
 * Unified GPU Compute Infrastructure Pack
 *
 * Pre-configured asset packs for tokenizing GPU compute infrastructure.
 * Follows the spread operator inheritance pattern (like Real Estate).
 *
 * Architecture:
 * - baseGPUComputeConfig: Shared rules, verifications, governance
 * - gpuComputePack: General GPU compute infrastructure
 * - enterpriseGPUComputePack: H100/A100 datacenter-grade nodes
 * - consumerGPUComputePack: RTX 4090/3090 consumer GPU farms
 * - createGPUComputePack(): Factory for custom configurations
 */

import { AssetType, InvestorClass, LiquidityProfile, FractionalizationType } from '../core/AssetAbstraction.js';
import { LifecycleState } from '../core/types.js';
import type { AssetPack, LifecycleRule, ComplianceRule, RequiredVerification, DistributionSchedule, GovernanceSettings } from './AssetPackRegistry.js';

// ============================================================================
// TYPES
// ============================================================================

export interface AssetPackConfig extends AssetPack {
  jurisdiction: string;
  jurisdictionProvider: string;
  custodyProvider: string;
  kycProvider: string;
  tokenContract: 'RealToken' | 'ComplianceToken' | 'ComplianceMultiToken';
  complianceModules: string[];
}

export interface CreateGPUComputePackOptions {
  id: string;
  name: string;
  description: string;
  jurisdiction: string;
  jurisdictionProvider: string;
  custodyProvider?: string;
  kycProvider?: string;
  additionalComplianceRules?: ComplianceRule[];
  additionalVerifications?: RequiredVerification[];
  additionalLifecycleRules?: LifecycleRule[];
  blockedJurisdictions?: string[];
  allowedJurisdictions?: string[];
  additionalMetadataSchema?: Record<string, { type: 'string' | 'number' | 'boolean' | 'date' | 'array' | 'object'; required: boolean; description: string }>;
  tags?: string[];
  overrides?: Partial<AssetPackConfig>;
}

// ============================================================================
// BASE CONFIGURATION (SHARED)
// ============================================================================

const baseLifecycleRules: LifecycleRule[] = [
  {
    from: LifecycleState.DRAFT,
    to: LifecycleState.PENDING_VERIFICATION,
    conditions: [
      {
        type: 'DOCUMENT',
        documents: ['HARDWARE_SPEC_SHEET', 'BENCHMARK_REPORT', 'DATACENTER_AGREEMENT', 'LEGAL_OPINION'],
      },
      { type: 'CUSTOM', customCondition: 'HARDWARE_SPECS_SUBMITTED' },
    ],
    actions: [
      { type: 'NOTIFY', params: { roles: ['COMPLIANCE', 'HARDWARE_AUDITOR'] } },
      { type: 'EMIT_EVENT', params: { event: 'HARDWARE_VERIFICATION_REQUESTED' } },
    ],
    description: 'Submit GPU node with hardware specs, benchmark report, and datacenter agreement',
  },
  {
    from: LifecycleState.PENDING_VERIFICATION,
    to: LifecycleState.VERIFIED,
    conditions: [
      {
        type: 'APPROVAL',
        approvals: [
          { role: 'HARDWARE_AUDITOR', count: 1 },
          { role: 'COMPLIANCE', count: 1 },
        ],
      },
      { type: 'CUSTOM', customCondition: 'HARDWARE_BENCHMARK_PASSED' },
      { type: 'CUSTOM', customCondition: 'DATACENTER_VERIFIED' },
    ],
    actions: [
      { type: 'EMIT_EVENT', params: { event: 'NODE_VERIFIED' } },
    ],
    description: 'Hardware audit, benchmark validation, and datacenter verification required',
  },
  {
    from: LifecycleState.VERIFIED,
    to: LifecycleState.ACTIVE,
    conditions: [
      { type: 'CUSTOM', customCondition: 'NODE_ONLINE_AND_OPERATIONAL' },
    ],
    actions: [
      { type: 'EMIT_EVENT', params: { event: 'NODE_TOKENIZED' } },
      { type: 'NOTIFY', params: { roles: ['INVESTOR'] } },
    ],
    description: 'Activate node for tokenization after confirming operational status',
  },
  {
    from: LifecycleState.ACTIVE,
    to: LifecycleState.FROZEN,
    conditions: [
      { type: 'APPROVAL', approvals: [{ role: 'ADMIN', count: 1 }] },
    ],
    actions: [
      { type: 'FREEZE', params: {} },
      { type: 'NOTIFY', params: { roles: ['INVESTOR'] } },
    ],
    description: 'Freeze for maintenance, distributions, or regulatory action',
  },
  {
    from: LifecycleState.FROZEN,
    to: LifecycleState.ACTIVE,
    conditions: [
      { type: 'APPROVAL', approvals: [{ role: 'ADMIN', count: 1 }] },
      { type: 'CUSTOM', customCondition: 'NODE_ONLINE_AND_OPERATIONAL' },
    ],
    actions: [
      { type: 'UNFREEZE', params: {} },
    ],
    description: 'Unfreeze after confirming node is operational',
  },
  {
    from: '*',
    to: LifecycleState.REDEEMED,
    conditions: [
      { type: 'APPROVAL', approvals: [{ role: 'ADMIN', count: 1 }, { role: 'LEGAL', count: 1 }] },
      { type: 'CUSTOM', customCondition: 'NODE_DECOMMISSIONED' },
    ],
    actions: [
      { type: 'DISTRIBUTE', params: { type: 'PRINCIPAL' } },
      { type: 'BURN', params: {} },
      { type: 'EMIT_EVENT', params: { event: 'NODE_REDEEMED' } },
    ],
    description: 'Redeem tokens on node decommission or hardware sale',
  },
];

const baseComplianceRules: ComplianceRule[] = [
  {
    id: 'GPU_KYC',
    name: 'GPU Compute KYC Requirements',
    type: 'KYC',
    params: {
      requiredLevel: 'enhanced',
      expiryDays: 365,
    },
    severity: 'BLOCK',
  },
  {
    id: 'GPU_AML_CFT',
    name: 'GPU Compute AML/CFT Compliance',
    type: 'CUSTOM',
    params: {
      requireSourceOfFunds: true,
      sanctionsScreeningRequired: true,
      pepCheckRequired: true,
    },
    severity: 'BLOCK',
  },
  {
    id: 'GPU_JURISDICTION',
    name: 'GPU Compute Jurisdiction Restrictions',
    type: 'JURISDICTION',
    params: {
      blockedCountries: ['KP', 'IR', 'CU', 'SY', 'RU', 'BY'],
    },
    severity: 'BLOCK',
  },
  {
    id: 'GPU_MAX_HOLDING',
    name: 'Maximum Holding Limit',
    type: 'HOLDING_LIMIT',
    params: {
      maxPercent: 10,
      exemptRoles: ['INSTITUTIONAL', 'SPONSOR'],
    },
    severity: 'BLOCK',
  },
  {
    id: 'GPU_LOCKUP',
    name: 'Initial Lockup Period',
    type: 'LOCKUP',
    params: {
      lockupDays: 30,
      exemptTransfers: ['REDEMPTION', 'FORCED_TRANSFER'],
    },
    severity: 'BLOCK',
  },
  {
    id: 'GPU_ACCREDITATION',
    name: 'Accredited Investor Check',
    type: 'ACCREDITATION',
    params: {
      qualifiedInvestorThreshold: '100000',
      acceptedQualifications: ['institutional', 'professional', 'accredited', 'high_net_worth'],
      exemptBelowThreshold: true,
    },
    severity: 'BLOCK',
  },
];

const gpuSpecificComplianceRules: ComplianceRule[] = [
  {
    id: 'GPU_HARDWARE_VERIFICATION',
    name: 'Hardware Verification Required',
    type: 'CUSTOM',
    params: {
      requireVerifiedNode: true,
      verificationExpiryDays: 30,
      requireOnlineStatus: true,
      benchmarkThreshold: 80,
    },
    severity: 'BLOCK',
  },
  {
    id: 'GPU_UPTIME_SLA',
    name: 'Uptime SLA Compliance',
    type: 'CUSTOM',
    params: {
      minimumUptimePercent: 95,
      measurementPeriodDays: 30,
      breachAction: 'NOTIFY_AND_WARN',
    },
    severity: 'WARN',
  },
  {
    id: 'GPU_DEPRECIATION',
    name: 'Hardware Depreciation Tracking',
    type: 'CUSTOM',
    params: {
      depreciationMethod: 'STRAIGHT_LINE',
      maxUsefulLifeMonths: 60,
      salvageValuePercent: 10,
      revaluationFrequency: 'QUARTERLY',
    },
    severity: 'LOG',
  },
];

const baseRequiredVerifications: RequiredVerification[] = [
  {
    type: 'HARDWARE_VERIFICATION',
    description: 'GPU hardware benchmark and specification verification',
    allowedVerifiers: ['HARDWARE_AUDITOR', 'PLATFORM_OPERATOR'],
    mandatory: true,
  },
  {
    type: 'DATACENTER_VERIFICATION',
    description: 'Datacenter tier, certifications, and uptime SLA verification',
    allowedVerifiers: ['DATACENTER_AUDITOR', 'COMPLIANCE'],
    mandatory: true,
  },
  {
    type: 'LEGAL_OPINION',
    description: 'Legal opinion on tokenization structure',
    allowedVerifiers: ['LEGAL'],
    mandatory: true,
  },
  {
    type: 'INSURANCE_VERIFICATION',
    description: 'Hardware and liability insurance verification',
    allowedVerifiers: ['COMPLIANCE', 'INSURANCE_PROVIDER'],
    mandatory: true,
  },
];

const baseDistributionSchedule: DistributionSchedule = {
  type: 'CUSTOM',
  frequency: 'MONTHLY',
  calculation: 'PRO_RATA',
  recordDateOffset: 1,
};

const baseGovernanceSettings: GovernanceSettings = {
  votingEnabled: true,
  votingStrategy: 'ONE_TOKEN_ONE_VOTE',
  quorumPercent: 20,
  approvalThresholdPercent: 51,
  proposalTypes: [
    'HARDWARE_UPGRADE',
    'NODE_DECOMMISSION',
    'FEE_CHANGE',
    'MAINTENANCE_BUDGET',
    'DATACENTER_MIGRATION',
  ],
  votingPeriodDays: 7,
};

const baseMetadataSchema: Record<string, { type: 'string' | 'number' | 'boolean' | 'date' | 'array' | 'object'; required: boolean; description: string }> = {
  gpuModel: { type: 'string', required: true, description: 'GPU model (e.g., H100, A100, RTX_4090)' },
  gpuCount: { type: 'number', required: true, description: 'Number of GPUs in the node' },
  vramPerGpuGB: { type: 'number', required: true, description: 'VRAM per GPU in GB' },
  interconnect: { type: 'string', required: true, description: 'GPU interconnect type (NVLink, PCIe, NVSwitch)' },
  datacenterName: { type: 'string', required: true, description: 'Datacenter facility name' },
  datacenterTier: { type: 'number', required: true, description: 'Datacenter tier (1-4)' },
  datacenterLocation: { type: 'string', required: true, description: 'Datacenter geographic location' },
  datacenterCertifications: { type: 'array', required: false, description: 'Datacenter certifications (ISO 27001, SOC2, etc.)' },
  acquisitionCostUsd: { type: 'string', required: true, description: 'Hardware acquisition cost in USD' },
  acquisitionDate: { type: 'date', required: true, description: 'Date of hardware acquisition' },
  benchmarkScore: { type: 'number', required: true, description: 'MLPerf or equivalent benchmark score' },
  estimatedUsefulLifeMonths: { type: 'number', required: true, description: 'Estimated useful life in months' },
  expectedAnnualYield: { type: 'number', required: false, description: 'Expected annual compute yield (%)' },
  spotPricePerHour: { type: 'string', required: false, description: 'Current spot price per GPU-hour in USD' },
  currentUtilization: { type: 'number', required: false, description: 'Current utilization percentage (0-100)' },
  monthlyOperatingCost: { type: 'string', required: false, description: 'Monthly operating cost in USD' },
};

const baseDefaults = {
  assetType: AssetType.INFRASTRUCTURE,
  investorClass: InvestorClass.ACCREDITED,
  liquidityProfile: LiquidityProfile.SEMI_LIQUID,
  fractionalization: FractionalizationType.DIVISIBLE,
  lockupDays: 30,
  maxHoldingPercent: 10,
  additionalJurisdictions: [] as string[],
  blockedJurisdictions: ['KP', 'IR', 'CU', 'SY', 'RU', 'BY'],
};

// ============================================================================
// GPU COMPUTE PACK (GENERAL)
// ============================================================================

export const gpuComputePack: AssetPackConfig = {
  id: 'gpu-compute',
  name: 'GPU Compute Infrastructure',
  description: 'Tokenize GPU compute nodes for fractional ownership with automated yield distribution from compute rental revenue',
  version: '1.0.0',

  jurisdiction: 'US',
  jurisdictionProvider: 'generic',
  custodyProvider: 'fireblocks',
  kycProvider: 'onfido',
  tokenContract: 'ComplianceToken',
  complianceModules: ['HardwareVerificationModule', 'MaxBalanceModule', 'CountryRestrictionsModule'],

  defaults: baseDefaults,
  lifecycleRules: baseLifecycleRules,
  complianceRules: [...baseComplianceRules, ...gpuSpecificComplianceRules],
  requiredVerifications: baseRequiredVerifications,
  distributionSchedule: baseDistributionSchedule,
  governance: baseGovernanceSettings,
  metadataSchema: baseMetadataSchema,
  tags: ['gpu-compute', 'infrastructure', 'depin', 'yield-bearing'],
};

// ============================================================================
// ENTERPRISE GPU COMPUTE PACK (H100/A100 Datacenter Grade)
// ============================================================================

const enterpriseComplianceRules: ComplianceRule[] = [
  {
    id: 'ENT_MIN_INVESTMENT',
    name: 'Enterprise Minimum Investment',
    type: 'TRANSFER_LIMIT',
    params: { minAmount: '50000', currency: 'USD' },
    severity: 'BLOCK',
  },
  {
    id: 'ENT_DATACENTER_CERT',
    name: 'Enterprise Datacenter Certification Required',
    type: 'CUSTOM',
    params: {
      requiredCertifications: ['ISO_27001', 'SOC2'],
      minimumTier: 3,
    },
    severity: 'BLOCK',
  },
];

const enterpriseVerifications: RequiredVerification[] = [
  {
    type: 'SOC2_AUDIT',
    description: 'SOC 2 Type II datacenter audit',
    allowedVerifiers: ['LICENSED_AUDITOR'],
    mandatory: true,
  },
];

const enterpriseMetadataSchema: Record<string, { type: 'string' | 'number' | 'boolean' | 'date' | 'array' | 'object'; required: boolean; description: string }> = {
  slaUptimePercent: { type: 'number', required: true, description: 'SLA uptime guarantee (%)' },
  redundancyLevel: { type: 'string', required: true, description: 'Hardware redundancy level (N+1, 2N, etc.)' },
  networkTier: { type: 'string', required: true, description: 'Network tier (Tier 1 transit, peering, etc.)' },
};

export const enterpriseGPUComputePack: AssetPackConfig = {
  ...gpuComputePack,
  id: 'enterprise-gpu-compute',
  name: 'Enterprise GPU Compute (Datacenter Grade)',
  description: 'Tokenize enterprise-grade GPU clusters (H100/A100) in certified datacenters with SLA guarantees',
  defaults: {
    ...baseDefaults,
    investorClass: InvestorClass.INSTITUTIONAL,
  },
  complianceRules: [...gpuComputePack.complianceRules, ...enterpriseComplianceRules],
  requiredVerifications: [...baseRequiredVerifications, ...enterpriseVerifications],
  metadataSchema: { ...baseMetadataSchema, ...enterpriseMetadataSchema },
  tags: ['gpu-compute', 'enterprise', 'datacenter', 'h100', 'a100', 'institutional'],
};

// ============================================================================
// CONSUMER GPU COMPUTE PACK (RTX 4090/3090 Farms)
// ============================================================================

const consumerComplianceRules: ComplianceRule[] = [
  {
    id: 'CON_LOW_BARRIER',
    name: 'Consumer-Friendly Investment',
    type: 'TRANSFER_LIMIT',
    params: { minAmount: '100', currency: 'USD' },
    severity: 'BLOCK',
  },
];

const consumerMetadataSchema: Record<string, { type: 'string' | 'number' | 'boolean' | 'date' | 'array' | 'object'; required: boolean; description: string }> = {
  powerSource: { type: 'string', required: false, description: 'Power source (grid, solar, etc.)' },
  coolingMethod: { type: 'string', required: false, description: 'Cooling method (air, liquid, immersion)' },
};

export const consumerGPUComputePack: AssetPackConfig = {
  ...gpuComputePack,
  id: 'consumer-gpu-compute',
  name: 'Consumer GPU Compute Farm',
  description: 'Tokenize consumer GPU farms (RTX 4090/3090) with lower barriers to entry',
  defaults: {
    ...baseDefaults,
    investorClass: InvestorClass.RETAIL,
    lockupDays: 14,
  },
  complianceRules: [
    ...baseComplianceRules.map(r =>
      r.id === 'GPU_ACCREDITATION' ? { ...r, params: { ...r.params, exemptBelowThreshold: true, qualifiedInvestorThreshold: '50000' } } : r
    ),
    ...gpuSpecificComplianceRules,
    ...consumerComplianceRules,
  ],
  metadataSchema: { ...baseMetadataSchema, ...consumerMetadataSchema },
  tags: ['gpu-compute', 'consumer', 'rtx-4090', 'rtx-3090', 'retail'],
};

// ============================================================================
// FACTORY
// ============================================================================

export function createGPUComputePack(options: CreateGPUComputePackOptions): AssetPackConfig {
  const {
    id, name, description, jurisdiction, jurisdictionProvider,
    custodyProvider = 'fireblocks', kycProvider = 'onfido',
    additionalComplianceRules = [], additionalVerifications = [],
    additionalLifecycleRules = [], blockedJurisdictions = [],
    allowedJurisdictions, additionalMetadataSchema = {},
    tags = [], overrides = {},
  } = options;

  const mergedBlockedJurisdictions = [
    ...new Set([...baseDefaults.blockedJurisdictions, ...blockedJurisdictions]),
  ];

  let mergedComplianceRules = [...baseComplianceRules, ...gpuSpecificComplianceRules, ...additionalComplianceRules];
  if (allowedJurisdictions) {
    mergedComplianceRules = mergedComplianceRules.map(rule =>
      rule.id === 'GPU_JURISDICTION'
        ? { ...rule, params: { ...rule.params, allowedCountries: allowedJurisdictions, blockedCountries: mergedBlockedJurisdictions } }
        : rule
    );
  }

  return {
    id, name, description, version: '1.0.0',
    jurisdiction, jurisdictionProvider, custodyProvider, kycProvider,
    tokenContract: 'ComplianceToken',
    complianceModules: ['HardwareVerificationModule', 'MaxBalanceModule', 'CountryRestrictionsModule'],
    defaults: { ...baseDefaults, blockedJurisdictions: mergedBlockedJurisdictions },
    lifecycleRules: [...baseLifecycleRules, ...additionalLifecycleRules],
    complianceRules: mergedComplianceRules,
    requiredVerifications: [...baseRequiredVerifications, ...additionalVerifications],
    distributionSchedule: baseDistributionSchedule,
    governance: baseGovernanceSettings,
    metadataSchema: { ...baseMetadataSchema, ...additionalMetadataSchema },
    tags: ['gpu-compute', 'infrastructure', ...tags],
    ...overrides,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  baseLifecycleRules, baseComplianceRules, baseRequiredVerifications,
  baseDistributionSchedule, baseGovernanceSettings, baseMetadataSchema, baseDefaults,
  gpuSpecificComplianceRules, enterpriseComplianceRules, enterpriseVerifications,
  enterpriseMetadataSchema, consumerComplianceRules, consumerMetadataSchema,
};

export default gpuComputePack;
