/**
 * Ahoy Fly+ Pass Pack
 *
 * Phase 1: Tokenized travel membership as an Access NFT.
 * Features: Remote check-in, door-to-door luggage, fast-track security.
 *
 * Flow: Define(Service) -> Mint(NFT) -> Access(App)
 */

import { TokenisationSDK, RightType, LifecycleState, PartyRole, PartyType, TransferabilityMode } from '../../SDK.js';
import { EvidenceType } from '../../models/index.js';
import { FlyPlusTier, AhoyEcosystemConfig, type FlyPlusPass } from '../types.js';

/**
 * Fly+ Pass configuration
 */
export interface FlyPlusPassConfig {
  /** Pass holder name */
  holderName: string;

  /** Pass holder email */
  holderEmail: string;

  /** Pass tier */
  tier: FlyPlusTier;

  /** Validity period in days */
  validityDays: number;

  /** Is the pass transferable (can be sold on secondary market) */
  transferable?: boolean;

  /** Maximum number of uses (undefined = unlimited) */
  maxUsage?: number;

  /** Payment reference */
  paymentRef?: string;
}

/**
 * Fly+ Pass Pack
 *
 * Implements tokenized travel membership with tiered benefits.
 */
export class FlyPlusPassPack {
  private sdk: TokenisationSDK;
  private config: FlyPlusPassConfig;

  constructor(sdk: TokenisationSDK, config: FlyPlusPassConfig) {
    this.sdk = sdk;
    this.config = config;
  }

  /**
   * Execute the full Fly+ Pass tokenization flow
   */
  async execute(): Promise<{
    passAssetId: string;
    holderId: string;
    issuerId: string;
    passData: FlyPlusPass;
  }> {
    // Step 1: Create Ahoy (Issuer)
    const issuer = this.sdk.parties_.create({
      type: PartyType.ORGANIZATION,
      roles: [PartyRole.ISSUER, PartyRole.VERIFIER],
      name: 'Ahoy Fly+',
      jurisdiction: 'AE',
    });

    // Step 2: Create Pass Holder
    const holder = this.sdk.parties_.create({
      type: PartyType.INDIVIDUAL,
      roles: [PartyRole.INVESTOR],
      name: this.config.holderName,
      email: this.config.holderEmail,
      jurisdiction: 'AE',
    });

    // Step 3: Verify holder KYC (simplified for demo)
    this.sdk.parties_.setKyc(
      holder.id,
      true,
      new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
    );

    // Step 4: Calculate validity period
    const validFrom = new Date();
    const validUntil = new Date(Date.now() + this.config.validityDays * 24 * 60 * 60 * 1000);

    // Step 5: Get tier features
    const features = AhoyEcosystemConfig.FLYPLUS_TIERS[this.config.tier];

    // Step 6: Create Pass metadata
    const passData: FlyPlusPass = {
      passId: '', // Will be set to asset ID
      holderId: holder.id,
      tier: this.config.tier,
      features,
      validFrom: validFrom.toISOString(),
      validUntil: validUntil.toISOString(),
      transferable: this.config.transferable ?? true,
      usageCount: 0,
      maxUsage: this.config.maxUsage,
    };

    // Step 7: Create the Pass Asset (NFT)
    const passAsset = await this.sdk.assets.create({
      name: `Fly+ ${this.config.tier} Pass - ${this.config.holderName}`,
      description: `Ahoy Fly+ ${this.config.tier} membership pass with ${this.getTierBenefitsDescription()}`,
      rightType: RightType.ACCESS,
      jurisdiction: {
        countryCode: 'AE',
        accreditedOnly: false,
        blockedJurisdictions: [],
      },
      validityPeriod: {
        startTime: validFrom.toISOString(),
        endTime: validUntil.toISOString(),
        isPerpetual: false,
      },
      transferabilityRules: {
        mode: this.config.transferable
          ? TransferabilityMode.UNRESTRICTED
          : TransferabilityMode.NON_TRANSFERABLE,
        lockupPeriodSeconds: 0,
        requireKyc: true,
      },
      issuerId: issuer.id,
      typedMetadata: {
        assetType: 'FLYPLUS_PASS',
        ...passData,
      },
    });

    // Update passId
    passData.passId = passAsset.id;

    // Step 8: Add payment evidence
    if (this.config.paymentRef) {
      const paymentEvidence = this.sdk.evidence.create({
        assetId: passAsset.id,
        type: EvidenceType.FINANCIAL_DOCUMENT,
        title: 'Fly+ Pass Purchase Receipt',
        description: `Payment confirmation for ${this.config.tier} pass`,
        contentHash: 'sha256:' + Buffer.from(passAsset.id + 'payment').toString('hex').slice(0, 64),
        source: {
          type: 'PAYMENT_PROCESSOR',
          identifier: 'stripe',
          name: 'Stripe Payment',
          trusted: true,
          reputationScore: 95,
        },
      });
      await this.sdk.evidence.verify(paymentEvidence.id, issuer.id, 'PAYMENT_VERIFICATION');
    }

    // Step 9: Progress through lifecycle
    await this.sdk.assets.transition(passAsset.id, LifecycleState.PENDING_VERIFICATION, issuer.id);
    await this.sdk.assets.verify(passAsset.id, issuer.id);
    await this.sdk.assets.activate(passAsset.id, issuer.id);

    // Step 10: Mint NFT to holder
    await this.sdk.tokens.mint(passAsset.id, holder.id, '1');

    return {
      passAssetId: passAsset.id,
      holderId: holder.id,
      issuerId: issuer.id,
      passData,
    };
  }

  /**
   * Use the pass for a service
   */
  async usePass(
    passAssetId: string,
    serviceType: 'CHECK_IN' | 'LUGGAGE' | 'FAST_TRACK' | 'LOUNGE'
  ): Promise<{ success: boolean; message: string; pointsEarned: number }> {
    const asset = await this.sdk.assets.get(passAssetId);
    if (!asset) {
      return { success: false, message: 'Pass not found', pointsEarned: 0 };
    }

    const metadata = asset.typedMetadata as unknown as FlyPlusPass;

    // Check if service is available for this tier
    const serviceMap: Record<string, keyof typeof metadata.features> = {
      CHECK_IN: 'remoteCheckIn',
      LUGGAGE: 'doorToDoorLuggage',
      FAST_TRACK: 'fastTrackSecurity',
      LOUNGE: 'loungeAccess',
    };

    const featureKey = serviceMap[serviceType];
    if (!metadata.features[featureKey]) {
      return {
        success: false,
        message: `${serviceType} is not available for ${metadata.tier} tier`,
        pointsEarned: 0,
      };
    }

    // Check usage limits
    if (metadata.maxUsage && metadata.usageCount >= metadata.maxUsage) {
      return { success: false, message: 'Pass usage limit reached', pointsEarned: 0 };
    }

    // Check validity
    const now = new Date();
    if (now < new Date(metadata.validFrom) || now > new Date(metadata.validUntil)) {
      return { success: false, message: 'Pass is not currently valid', pointsEarned: 0 };
    }

    // Record usage
    const pointsEarned = this.calculatePointsEarned(serviceType);

    return {
      success: true,
      message: `Successfully used ${serviceType} service`,
      pointsEarned,
    };
  }

  /**
   * Transfer pass to another user (if transferable)
   */
  async transferPass(
    passAssetId: string,
    fromPartyId: string,
    toPartyId: string
  ): Promise<{ success: boolean; error?: string }> {
    const asset = await this.sdk.assets.get(passAssetId);
    if (!asset) {
      return { success: false, error: 'Pass not found' };
    }

    const metadata = asset.typedMetadata as unknown as FlyPlusPass;
    if (!metadata.transferable) {
      return { success: false, error: 'This pass is non-transferable' };
    }

    return this.sdk.tokens.transfer(passAssetId, fromPartyId, toPartyId, '1');
  }

  /**
   * Get tier benefits description
   */
  private getTierBenefitsDescription(): string {
    const features = AhoyEcosystemConfig.FLYPLUS_TIERS[this.config.tier];
    const benefits: string[] = [];

    if (features.remoteCheckIn) benefits.push('Remote Check-in');
    if (features.doorToDoorLuggage) benefits.push('Door-to-Door Luggage');
    if (features.fastTrackSecurity) benefits.push('Fast-Track Security');
    if (features.loungeAccess) benefits.push('Lounge Access');
    if (features.prioritySupport) benefits.push('Priority Support');

    return benefits.join(', ');
  }

  /**
   * Calculate $AHOY points earned for service usage
   */
  private calculatePointsEarned(serviceType: string): number {
    const pointsMap: Record<string, number> = {
      CHECK_IN: 10,
      LUGGAGE: 25,
      FAST_TRACK: 15,
      LOUNGE: 20,
    };
    return pointsMap[serviceType] || 0;
  }
}

/**
 * Quick start helper for Fly+ Pass
 */
export async function createFlyPlusPass(
  sdk: TokenisationSDK,
  holderName: string,
  holderEmail: string,
  tier: FlyPlusTier = FlyPlusTier.PREMIUM
): Promise<string> {
  const pack = new FlyPlusPassPack(sdk, {
    holderName,
    holderEmail,
    tier,
    validityDays: 365,
    transferable: true,
    paymentRef: 'STRIPE_' + Date.now(),
  });

  const result = await pack.execute();
  return result.passAssetId;
}

/**
 * Create all tier passes for demo
 */
export async function createAllTierPasses(
  sdk: TokenisationSDK,
  holderName: string,
  holderEmail: string
): Promise<Record<FlyPlusTier, string>> {
  const passes: Record<string, string> = {};

  for (const tier of Object.values(FlyPlusTier)) {
    const pack = new FlyPlusPassPack(sdk, {
      holderName: `${holderName} (${tier})`,
      holderEmail,
      tier,
      validityDays: 365,
      transferable: tier !== FlyPlusTier.BASIC,
    });
    const result = await pack.execute();
    passes[tier] = result.passAssetId;
  }

  return passes as Record<FlyPlusTier, string>;
}
