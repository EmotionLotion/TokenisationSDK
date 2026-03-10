/**
 * Pack C: Driving/Loyalty Score
 *
 * Reference implementation for tokenizing behavior-based scores.
 * Type: BEHAVIOR State (Soulbound)
 *
 * Flow: Define (Safe Driver) -> Verify (Telematics Oracle) -> Mint/Update (Soulbound Score) -> Reward (Discount)
 */

import { TokenisationSDK, RightType, LifecycleState, PartyRole, PartyType, TransferabilityMode } from '@tokenisation/core';
import { EvidenceType } from '@tokenisation/core';
import type { BehaviorMetadata } from '@tokenisation/core';
import { SDKError, ErrorCode } from '@tokenisation/core';

/**
 * Behavior Score Pack configuration
 */
export interface BehaviorScoreConfig {
  /** Score type */
  scoreType: 'LOYALTY_POINTS' | 'DRIVING_SCORE' | 'REPUTATION' | 'CREDIT_SCORE';

  /** Score name */
  name: string;

  /** Description */
  description?: string;

  /** Initial score */
  initialScore: number;

  /** Maximum possible score */
  maxScore: number;

  /** Score decay rate per period (0-1, 0 = no decay) */
  decayRate?: number;

  /** Oracle/data source for score updates */
  dataSource: {
    name: string;
    type: string;
    identifier: string;
  };

  /** Issuer information */
  issuer: {
    name: string;
    jurisdiction: string;
  };

  /** Subject (the person/entity being scored) */
  subject: {
    name: string;
    jurisdiction: string;
  };
}

/**
 * Behavior Score Pack
 *
 * Demonstrates the tokenization of behavior-based scores as soulbound tokens.
 */
export class BehaviorScorePack {
  private sdk: TokenisationSDK;
  private config: BehaviorScoreConfig;
  private assetId: string | null = null;

  constructor(sdk: TokenisationSDK, config: BehaviorScoreConfig) {
    this.sdk = sdk;
    this.config = config;
  }

  /**
   * Execute the initial setup flow
   */
  async execute(): Promise<{
    assetId: string;
    issuerId: string;
    subjectId: string;
    oracleEvidenceId: string;
  }> {
    // Step 1: Create Issuer (e.g., Insurance Company, Loyalty Program)
    const issuer = this.sdk.parties_.create({
      type: PartyType.ORGANIZATION,
      roles: [PartyRole.ISSUER, PartyRole.ORACLE_PROVIDER],
      name: this.config.issuer.name,
      jurisdiction: this.config.issuer.jurisdiction,
    });

    // Step 2: Create Subject (the person being scored)
    const subject = this.sdk.parties_.create({
      type: PartyType.INDIVIDUAL,
      roles: [PartyRole.INVESTOR], // Token holder
      name: this.config.subject.name,
      jurisdiction: this.config.subject.jurisdiction,
    });

    // Step 3: Create Behavior Score Asset with Metadata
    const metadata: BehaviorMetadata = {
      assetType: 'BEHAVIOR',
      scoreType: this.config.scoreType,
      currentScore: this.config.initialScore,
      maxScore: this.config.maxScore,
      lastUpdateSource: this.config.dataSource.name,
      historyCount: 0,
      decayRate: this.config.decayRate,
    };

    const asset = await this.sdk.assets.create({
      name: this.config.name,
      description: this.config.description || `${this.config.scoreType} for ${this.config.subject.name}`,
      rightType: RightType.BEHAVIOR,
      jurisdiction: {
        countryCode: this.config.subject.jurisdiction,
        accreditedOnly: false,
        blockedJurisdictions: [],
      },
      validityPeriod: {
        isPerpetual: true, // Behavior scores are perpetual
      },
      transferabilityRules: {
        mode: TransferabilityMode.NON_TRANSFERABLE, // Soulbound - cannot be transferred
        lockupPeriodSeconds: 0,
        requireKyc: true,
      },
      issuerId: issuer.id,
      typedMetadata: metadata,
    });

    this.assetId = asset.id;

    // Step 4: Add Oracle/Telematics Evidence
    const oracleEvidence = this.sdk.evidence.create({
      assetId: asset.id,
      type: EvidenceType.ORACLE_ATTESTATION,
      title: `${this.config.scoreType} Initial Assessment`,
      description: `Initial score calculation from ${this.config.dataSource.name}`,
      contentHash: 'sha256:' + Buffer.from(asset.id + 'oracle').toString('hex').slice(0, 64),
      source: {
        type: this.config.dataSource.type,
        identifier: this.config.dataSource.identifier,
        name: this.config.dataSource.name,
        trusted: true,
        reputationScore: 90,
      },
    });

    // Step 5: Verify Oracle Evidence
    await this.sdk.evidence.verify(oracleEvidence.id, issuer.id, 'ORACLE_VERIFICATION');

    // Step 6: Submit for Verification
    await this.sdk.assets.transition(
      asset.id,
      LifecycleState.PENDING_VERIFICATION,
      issuer.id
    );

    // Step 7: Verify Asset
    await this.sdk.assets.verify(asset.id, issuer.id);

    // Step 8: Activate Asset
    await this.sdk.assets.activate(asset.id, issuer.id);

    // Step 9: Mint soulbound token to subject
    await this.sdk.tokens.mint(asset.id, subject.id, '1'); // Soulbound = 1 token

    return {
      assetId: asset.id,
      issuerId: issuer.id,
      subjectId: subject.id,
      oracleEvidenceId: oracleEvidence.id,
    };
  }

  /**
   * Update the behavior score based on new data
   */
  async updateScore(
    newScore: number,
    actorId: string,
    reason: string
  ): Promise<void> {
    if (!this.assetId) {
      throw new SDKError('Pack not initialized. Call execute() first.', ErrorCode.NOT_INITIALIZED, {
        details: { hint: 'Call execute() before updateScore()' },
      });
    }

    const asset = await this.sdk.assets.get(this.assetId);
    if (!asset) {
      throw new SDKError('Asset not found', ErrorCode.ASSET_NOT_FOUND, {
        details: { assetId: this.assetId },
      });
    }

    // Update metadata with new score
    const currentMetadata = asset.typedMetadata as BehaviorMetadata;
    const updatedMetadata: BehaviorMetadata = {
      ...currentMetadata,
      currentScore: newScore,
      historyCount: currentMetadata.historyCount + 1,
    };

    // Add evidence for score update
    this.sdk.evidence.create({
      assetId: this.assetId,
      type: EvidenceType.ORACLE_ATTESTATION,
      title: `Score Update #${updatedMetadata.historyCount}`,
      description: reason,
      contentHash: 'sha256:' + Buffer.from(this.assetId + 'update' + Date.now()).toString('hex').slice(0, 64),
      source: {
        type: 'ORACLE',
        identifier: currentMetadata.lastUpdateSource,
        name: currentMetadata.lastUpdateSource,
        trusted: true,
        reputationScore: 90,
      },
    });

    // Update asset metadata
    await this.sdk.assets.update(this.assetId, {
      typedMetadata: updatedMetadata,
    } as any);
  }

  /**
   * Calculate reward eligibility based on score
   */
  calculateReward(
    score: number,
    rewardTiers: Array<{ minScore: number; reward: string }>
  ): string | null {
    // Sort tiers by minScore descending
    const sortedTiers = [...rewardTiers].sort((a, b) => b.minScore - a.minScore);

    for (const tier of sortedTiers) {
      if (score >= tier.minScore) {
        return tier.reward;
      }
    }

    return null;
  }
}

/**
 * Quick start helper for Driving Score tokenization
 */
export async function createDrivingScore(
  sdk: TokenisationSDK,
  driverName: string,
  initialScore: number = 750
): Promise<string> {
  const pack = new BehaviorScorePack(sdk, {
    scoreType: 'DRIVING_SCORE',
    name: `Safe Driver Score - ${driverName}`,
    description: 'Telematics-based safe driving score',
    initialScore,
    maxScore: 1000,
    decayRate: 0.01, // 1% decay per period without activity
    dataSource: {
      name: 'Telematics Provider',
      type: 'IOT_DEVICE',
      identifier: 'telematics-api',
    },
    issuer: {
      name: 'SafeDrive Insurance',
      jurisdiction: 'AE',
    },
    subject: {
      name: driverName,
      jurisdiction: 'AE',
    },
  });

  const result = await pack.execute();
  return result.assetId;
}

/**
 * Quick start helper for Loyalty Points tokenization
 */
export async function createLoyaltyScore(
  sdk: TokenisationSDK,
  programName: string,
  memberName: string,
  initialPoints: number = 0
): Promise<string> {
  const pack = new BehaviorScorePack(sdk, {
    scoreType: 'LOYALTY_POINTS',
    name: `${programName} - ${memberName}`,
    description: `Loyalty points for ${programName}`,
    initialScore: initialPoints,
    maxScore: 999999,
    decayRate: 0, // Points don't decay
    dataSource: {
      name: programName,
      type: 'LOYALTY_PROGRAM',
      identifier: programName.toLowerCase().replace(/\s/g, '-'),
    },
    issuer: {
      name: programName,
      jurisdiction: 'AE',
    },
    subject: {
      name: memberName,
      jurisdiction: 'AE',
    },
  });

  const result = await pack.execute();
  return result.assetId;
}
