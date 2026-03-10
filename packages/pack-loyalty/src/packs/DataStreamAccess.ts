/**
 * AMS/GTS Data Stream Access Pack
 *
 * Tokenized access to movement data APIs for developers.
 * Stake $AHOY to access high-fidelity routing/traffic data.
 *
 * Flow: User (Connect) -> Data Pool -> Developer (AMS) -> Burn $AHOY
 */

import { TokenisationSDK, RightType, LifecycleState, PartyRole, PartyType, TransferabilityMode } from '@tokenisation/core';
import { EvidenceType } from '@tokenisation/core';
import { DataStreamType, type DataStreamAccess, type AlgorithmIP } from '../types.js';
import { SDKError, ValidationError, ErrorCode } from '@tokenisation/core';

/**
 * Data stream access configuration
 */
export interface DataStreamConfig {
  /** Developer name/company */
  developerName: string;

  /** Developer email */
  developerEmail: string;

  /** Data stream type */
  streamType: DataStreamType;

  /** Access tier */
  tier: 'FREE' | 'BASIC' | 'PRO' | 'ENTERPRISE';

  /** Stake amount in $AHOY */
  stakeAmount: string;
}

/**
 * Data Stream Access Pack
 *
 * Implements tokenized access to Ahoy's data infrastructure.
 */
export class DataStreamAccessPack {
  private sdk: TokenisationSDK;
  private config: DataStreamConfig;

  constructor(sdk: TokenisationSDK, config: DataStreamConfig) {
    this.sdk = sdk;
    this.config = config;
  }

  /**
   * Request data stream access
   */
  async requestAccess(): Promise<{
    accessAssetId: string;
    developerId: string;
    accessData: DataStreamAccess;
    apiKey: string;
  }> {
    // Step 1: Create AMS Platform (Issuer)
    const platform = this.sdk.parties_.create({
      type: PartyType.ORGANIZATION,
      roles: [PartyRole.ISSUER, PartyRole.VERIFIER],
      name: 'Ahoy Movement Studio',
      jurisdiction: 'AE',
    });

    // Step 2: Create Developer party
    const developer = this.sdk.parties_.create({
      type: PartyType.ORGANIZATION,
      roles: [PartyRole.INVESTOR],
      name: this.config.developerName,
      email: this.config.developerEmail,
      jurisdiction: 'AE',
    });

    // Step 3: Generate API key
    const apiKey = this.generateApiKey();

    // Step 4: Define rate limits and retention
    const tierConfig = this.getTierConfig();

    // Step 5: Create access metadata
    const accessData: DataStreamAccess = {
      accessId: '', // Will be set to asset ID
      developerId: developer.id,
      streamType: this.config.streamType,
      tier: this.config.tier,
      rateLimit: tierConfig.rateLimit,
      dataRetention: tierConfig.dataRetention,
      stakeAmount: this.config.stakeAmount,
      apiKey,
      createdAt: new Date().toISOString(),
      expiresAt: this.config.tier === 'FREE'
        ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days for free
        : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 year for paid
    };

    // Step 6: Create Access Asset
    const accessAsset = await this.sdk.assets.create({
      name: `GTS ${this.config.streamType} Access - ${this.config.tier}`,
      description: `${this.config.tier} tier access to ${this.config.streamType.toLowerCase()} data stream`,
      rightType: RightType.ACCESS,
      jurisdiction: {
        countryCode: 'AE',
        accreditedOnly: false,
        blockedJurisdictions: [],
      },
      validityPeriod: {
        startTime: accessData.createdAt,
        endTime: accessData.expiresAt,
        isPerpetual: false,
      },
      transferabilityRules: {
        mode: TransferabilityMode.NON_TRANSFERABLE, // API access is non-transferable
        lockupPeriodSeconds: 0,
        requireKyc: false,
      },
      issuerId: platform.id,
      typedMetadata: {
        assetType: 'DATA_STREAM_ACCESS',
        ...accessData,
      },
    });

    accessData.accessId = accessAsset.id;

    // Step 7: Add stake evidence (if not free tier)
    if (this.config.tier !== 'FREE' && BigInt(this.config.stakeAmount) > 0) {
      this.sdk.evidence.create({
        assetId: accessAsset.id,
        type: EvidenceType.FINANCIAL_DOCUMENT,
        title: '$AHOY Stake Record',
        description: `Staked ${this.config.stakeAmount} $AHOY for ${this.config.tier} tier access`,
        contentHash: 'sha256:' + Buffer.from(accessAsset.id + 'stake').toString('hex').slice(0, 64),
        source: {
          type: 'AHOY_TOKEN',
          identifier: 'ahoy-staking',
          name: 'Ahoy Staking Contract',
          trusted: true,
          reputationScore: 100,
        },
      });
    }

    // Step 8: Activate access
    await this.sdk.assets.transition(accessAsset.id, LifecycleState.PENDING_VERIFICATION, platform.id);
    await this.sdk.assets.verify(accessAsset.id, platform.id);
    await this.sdk.assets.activate(accessAsset.id, platform.id);

    // Step 9: Mint access token
    await this.sdk.tokens.mint(accessAsset.id, developer.id, '1');

    return {
      accessAssetId: accessAsset.id,
      developerId: developer.id,
      accessData,
      apiKey,
    };
  }

  /**
   * Record API usage for billing
   */
  async recordUsage(
    accessAssetId: string,
    requestCount: number
  ): Promise<{ ahoyPointsBurned: number }> {
    const asset = await this.sdk.assets.get(accessAssetId);
    if (!asset) {
      throw new SDKError('Access asset not found', ErrorCode.ASSET_NOT_FOUND, {
        details: { accessAssetId },
      });
    }

    const metadata = asset.typedMetadata as unknown as DataStreamAccess;

    // Check rate limit
    if (requestCount > metadata.rateLimit) {
      throw new ValidationError(`Rate limit exceeded: ${requestCount} > ${metadata.rateLimit}`, {
        field: 'requestCount',
        constraints: { maxAllowed: String(metadata.rateLimit), requested: String(requestCount) },
      });
    }

    // Calculate $AHOY cost (based on tier)
    const tierCosts = {
      FREE: 0,
      BASIC: 1,
      PRO: 0.5,
      ENTERPRISE: 0.2,
    };
    const ahoyPointsBurned = Math.ceil(requestCount * tierCosts[metadata.tier]);

    return { ahoyPointsBurned };
  }

  /**
   * Get tier configuration
   */
  private getTierConfig(): { rateLimit: number; dataRetention: number } {
    const configs = {
      FREE: { rateLimit: 100, dataRetention: 1 },
      BASIC: { rateLimit: 1000, dataRetention: 7 },
      PRO: { rateLimit: 10000, dataRetention: 30 },
      ENTERPRISE: { rateLimit: 100000, dataRetention: 365 },
    };
    return configs[this.config.tier];
  }

  /**
   * Generate API key
   */
  private generateApiKey(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let key = 'ahoy_';
    for (let i = 0; i < 32; i++) {
      key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return key;
  }
}

/**
 * Algorithm IP Pack
 *
 * Mint routing/optimization algorithms as IP-NFTs with royalties.
 */
export class AlgorithmIPPack {
  private sdk: TokenisationSDK;

  constructor(sdk: TokenisationSDK) {
    this.sdk = sdk;
  }

  /**
   * Register a new algorithm as IP-NFT
   */
  async registerAlgorithm(config: {
    name: string;
    description: string;
    creatorName: string;
    category: 'ROUTING' | 'OPTIMIZATION' | 'PREDICTION' | 'CLUSTERING';
    royaltyRate: number;
    licenseType: 'EXCLUSIVE' | 'NON_EXCLUSIVE' | 'OPEN_SOURCE';
  }): Promise<{
    algorithmAssetId: string;
    creatorId: string;
    algorithm: AlgorithmIP;
  }> {
    // Create AMS Platform
    const platform = this.sdk.parties_.create({
      type: PartyType.ORGANIZATION,
      roles: [PartyRole.ISSUER, PartyRole.VERIFIER],
      name: 'Ahoy Movement Studio',
      jurisdiction: 'AE',
    });

    // Create creator
    const creator = this.sdk.parties_.create({
      type: PartyType.INDIVIDUAL,
      roles: [PartyRole.INVESTOR],
      name: config.creatorName,
      jurisdiction: 'AE',
    });

    // Create algorithm metadata
    const algorithm: AlgorithmIP = {
      algorithmId: '',
      name: config.name,
      description: config.description,
      creatorId: creator.id,
      category: config.category,
      version: '1.0.0',
      royaltyRate: config.royaltyRate,
      totalCalls: 0,
      totalRoyalties: '0',
      licenseType: config.licenseType,
    };

    // Create IP-NFT
    const algorithmAsset = await this.sdk.assets.create({
      name: `Algorithm IP: ${config.name}`,
      description: config.description,
      rightType: RightType.OWNERSHIP, // IP ownership
      jurisdiction: {
        countryCode: 'AE',
        accreditedOnly: false,
        blockedJurisdictions: [],
      },
      validityPeriod: {
        isPerpetual: true,
      },
      transferabilityRules: {
        mode: config.licenseType === 'EXCLUSIVE'
          ? TransferabilityMode.COMPLIANCE_GATED
          : TransferabilityMode.UNRESTRICTED,
        lockupPeriodSeconds: 0,
        requireKyc: false,
      },
      issuerId: platform.id,
      typedMetadata: {
        assetType: 'ALGORITHM_IP',
        ...algorithm,
      },
    });

    algorithm.algorithmId = algorithmAsset.id;

    // Add code evidence
    this.sdk.evidence.create({
      assetId: algorithmAsset.id,
      type: EvidenceType.LEGAL_DOCUMENT,
      title: 'Algorithm Source Code Hash',
      description: 'Cryptographic hash of the algorithm source code',
      contentHash: 'sha256:' + Buffer.from(algorithmAsset.id + 'code').toString('hex').slice(0, 64),
      source: {
        type: 'CODE_REPOSITORY',
        identifier: 'ams-algo-registry',
        name: 'AMS Algorithm Registry',
        trusted: true,
        reputationScore: 95,
      },
    });

    // Activate
    await this.sdk.assets.transition(algorithmAsset.id, LifecycleState.PENDING_VERIFICATION, platform.id);
    await this.sdk.assets.verify(algorithmAsset.id, platform.id);
    await this.sdk.assets.activate(algorithmAsset.id, platform.id);

    // Mint to creator
    await this.sdk.tokens.mint(algorithmAsset.id, creator.id, '1');

    return {
      algorithmAssetId: algorithmAsset.id,
      creatorId: creator.id,
      algorithm,
    };
  }
}

/**
 * Quick start helpers
 */
export async function createDataStreamAccess(
  sdk: TokenisationSDK,
  developerName: string,
  streamType: DataStreamType = DataStreamType.ROUTING,
  tier: 'FREE' | 'BASIC' | 'PRO' | 'ENTERPRISE' = 'BASIC'
): Promise<string> {
  const pack = new DataStreamAccessPack(sdk, {
    developerName,
    developerEmail: `${developerName.toLowerCase().replace(/\s/g, '.')}@dev.ahoy`,
    streamType,
    tier,
    stakeAmount: tier === 'FREE' ? '0' : '1000',
  });

  const result = await pack.requestAccess();
  return result.accessAssetId;
}

export async function registerRoutingAlgorithm(
  sdk: TokenisationSDK,
  name: string,
  creatorName: string,
  royaltyRate: number = 5
): Promise<string> {
  const pack = new AlgorithmIPPack(sdk);
  const result = await pack.registerAlgorithm({
    name,
    description: `Routing algorithm: ${name}`,
    creatorName,
    category: 'ROUTING',
    royaltyRate,
    licenseType: 'NON_EXCLUSIVE',
  });

  return result.algorithmAssetId;
}
