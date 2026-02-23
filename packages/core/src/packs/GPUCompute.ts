/**
 * Pack: GPU Compute Infrastructure
 *
 * Reference implementation for tokenizing GPU compute infrastructure.
 * Type: OWNERSHIP Right
 *
 * This is a backward-compatible wrapper around the unified gpu-compute.pack.ts.
 * For new implementations, prefer using gpuComputePack directly.
 *
 * Flow: Define (GPU Node) -> Verify (Hardware Audit) -> Mint (ERC-20 Share) -> Enforce (Compliance) -> Distribute (Compute Revenue)
 */

import { TokenisationSDK, RightType, LifecycleState, PartyRole, PartyType } from '../SDK.js';
import { EvidenceType } from '../models/index.js';
// [LAYER] Moved to @tokenisation/compliance
// import { RuleConditionType } from '../services/ComplianceService.js';

/** Stub enum after ComplianceService moved to @tokenisation/compliance */
enum RuleConditionType {
  KYC_REQUIRED = 'KYC_REQUIRED',
  ACCREDITATION_REQUIRED = 'ACCREDITATION_REQUIRED',
  JURISDICTION_BLACKLIST = 'JURISDICTION_BLACKLIST',
  MAX_INVESTOR_COUNT = 'MAX_INVESTOR_COUNT',
  TIME_RESTRICTION = 'TIME_RESTRICTION',
}
import { gpuComputePack } from './gpu-compute.pack.js';

/**
 * GPU Compute Pack configuration
 */
export interface GPUComputeConfig {
  /** GPU node cluster name */
  name: string;
  /** Description of the GPU compute offering */
  description?: string;
  /** GPU node details */
  gpuNode: {
    model: string;
    count: number;
    vramPerGpu: number;
    interconnect: string;
    datacenter: {
      name: string;
      tier: number;
      location: string;
      certifications?: string[];
    };
  };
  /** Valuation */
  valuation: {
    amount: string;
    date: string;
  };
  /** Token configuration */
  token: {
    totalSupply: string;
    decimals: number;
    symbol: string;
  };
  /** Issuer information */
  issuer: {
    name: string;
    email?: string;
  };
}

/**
 * GPU Compute Pack
 *
 * Demonstrates the full tokenization flow for GPU compute infrastructure.
 * Uses the unified gpuComputePack internally for configuration.
 *
 * @deprecated For new implementations, use gpuComputePack from './gpu-compute.pack.js'
 */
export class GPUComputePack {
  private sdk: TokenisationSDK;
  private config: GPUComputeConfig;

  static readonly pack = gpuComputePack;

  constructor(sdk: TokenisationSDK, config: GPUComputeConfig) {
    this.sdk = sdk;
    this.config = config;
  }

  static getBlockedJurisdictions(): string[] {
    return gpuComputePack.defaults.blockedJurisdictions;
  }

  static getComplianceRules() {
    return gpuComputePack.complianceRules;
  }

  static getLifecycleRules() {
    return gpuComputePack.lifecycleRules;
  }

  /**
   * Execute the full tokenization flow
   */
  async execute(): Promise<{
    assetId: string;
    issuerId: string;
    verifierId: string;
    evidenceId: string;
  }> {
    // Step 1: Create Issuer
    const issuer = this.sdk.parties_.create({
      type: PartyType.ORGANIZATION,
      roles: [PartyRole.ISSUER],
      name: this.config.issuer.name,
      email: this.config.issuer.email,
      jurisdiction: 'US',
    });

    // Create Verifier (Hardware Auditor)
    const verifier = this.sdk.parties_.create({
      type: PartyType.ORGANIZATION,
      roles: [PartyRole.VERIFIER],
      name: 'Hardware Auditor',
      jurisdiction: 'US',
    });

    // Step 2: Create Asset with GPU Compute Metadata
    const asset = await this.sdk.assets.create({
      name: this.config.name,
      description: this.config.description,
      rightType: RightType.OWNERSHIP,
      jurisdiction: {
        countryCode: 'US',
        regulatoryFramework: 'GPU_COMPUTE',
        accreditedOnly: true,
        blockedJurisdictions: gpuComputePack.defaults.blockedJurisdictions,
      },
      issuerId: issuer.id,
      typedMetadata: {
        assetType: 'GPU_COMPUTE',
        gpuModel: this.config.gpuNode.model,
        gpuCount: this.config.gpuNode.count,
        vramPerGpuGB: this.config.gpuNode.vramPerGpu,
        interconnect: this.config.gpuNode.interconnect,
        datacenterName: this.config.gpuNode.datacenter.name,
        datacenterTier: this.config.gpuNode.datacenter.tier,
        datacenterLocation: this.config.gpuNode.datacenter.location,
        datacenterCertifications: this.config.gpuNode.datacenter.certifications || [],
        acquisitionCostUsd: this.config.valuation.amount,
        acquisitionDate: this.config.valuation.date,
      },
    });

    // Step 3: Add Hardware Specification Evidence
    const evidence = this.sdk.evidence.create({
      assetId: asset.id,
      type: EvidenceType.AUDIT_REPORT,
      title: 'GPU Hardware Specification & Benchmark Report',
      description: `Hardware verification for ${this.config.name} - ${this.config.gpuNode.count}x ${this.config.gpuNode.model}`,
      contentHash: 'sha256:' + Buffer.from(asset.id + 'hardware-spec').toString('hex').slice(0, 64),
      source: {
        type: 'HARDWARE_AUDITOR',
        identifier: 'hardware-verification-service',
        name: 'Hardware Auditor',
        trusted: true,
        reputationScore: 95,
      },
    });

    // Step 4: Verify Evidence
    await this.sdk.evidence.verify(evidence.id, verifier.id, 'HARDWARE_AUDIT');

    // Step 5: Lifecycle transitions
    await this.sdk.assets.transition(asset.id, LifecycleState.PENDING_VERIFICATION, issuer.id);
    await this.sdk.assets.verify(asset.id, verifier.id);
    await this.sdk.assets.activate(asset.id, issuer.id);

    // [LAYER] Compliance ruleset registration moved to @tokenisation/compliance
    // sdk.compliance.registerRuleset(...) — register via ComplianceService externally

    return {
      assetId: asset.id,
      issuerId: issuer.id,
      verifierId: verifier.id,
      evidenceId: evidence.id,
    };
  }
}

export async function createGPUComputeToken(
  sdk: TokenisationSDK,
  config: GPUComputeConfig
): Promise<string> {
  const pack = new GPUComputePack(sdk, config);
  const result = await pack.execute();
  return result.assetId;
}
