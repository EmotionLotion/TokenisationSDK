/**
 * COMET Driver Reputation Pack
 *
 * Phase 2: Soulbound Token (SBT) for driver performance tracking.
 * Drivers earn XP for on-time deliveries, safe driving, and customer ratings.
 *
 * Flow: Verify(Oracle Data) -> Update(Score) -> Reward($AHOY)
 */

import { TokenisationSDK, RightType, LifecycleState, PartyRole, PartyType, TransferabilityMode } from '../../SDK.js';
import { EvidenceType } from '../../models/index.js';
import { DriverTier, AhoyEcosystemConfig, type DriverReputation } from '../types.js';

/**
 * Driver profile configuration
 */
export interface DriverProfileConfig {
  /** Driver's full name */
  driverName: string;

  /** Driver's license number */
  licenseNumber: string;

  /** Driver's email */
  email: string;

  /** Vehicle type */
  vehicleType: 'BIKE' | 'CAR' | 'VAN' | 'TRUCK';

  /** Operating zone */
  zone: string;
}

/**
 * Delivery completion data (from telematics)
 */
export interface DeliveryData {
  deliveryId: string;
  completedAt: string;
  wasOnTime: boolean;
  customerRating: number; // 1-5
  distanceKm: number;
  durationMinutes: number;
  safetyEvents: number; // Hard brakes, speeding, etc.
}

/**
 * COMET Driver Reputation Pack
 *
 * Implements gamified driver performance tracking with Soulbound Tokens.
 */
export class DriverReputationPack {
  private sdk: TokenisationSDK;
  private config: DriverProfileConfig;

  constructor(sdk: TokenisationSDK, config: DriverProfileConfig) {
    this.sdk = sdk;
    this.config = config;
  }

  /**
   * Register a new driver and create their reputation SBT
   */
  async registerDriver(): Promise<{
    reputationAssetId: string;
    driverId: string;
    issuerId: string;
    reputation: DriverReputation;
  }> {
    // Step 1: Create COMET (Issuer)
    const issuer = this.sdk.parties_.create({
      type: PartyType.ORGANIZATION,
      roles: [PartyRole.ISSUER, PartyRole.VERIFIER],
      name: 'Ahoy COMET',
      jurisdiction: 'AE',
    });

    // Step 2: Create Driver party
    const driver = this.sdk.parties_.create({
      type: PartyType.INDIVIDUAL,
      roles: [PartyRole.INVESTOR], // Driver is the token holder
      name: this.config.driverName,
      email: this.config.email,
      jurisdiction: 'AE',
    });

    // Step 3: Verify driver credentials
    this.sdk.parties_.setKyc(
      driver.id,
      true,
      new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
    );

    // Step 4: Initialize reputation
    const reputation: DriverReputation = {
      driverId: driver.id,
      totalDeliveries: 0,
      onTimeRate: 100,
      safetyScore: 100,
      customerRating: 5.0,
      xpPoints: 0,
      tier: DriverTier.BRONZE,
      streakDays: 0,
      lastUpdated: new Date().toISOString(),
    };

    // Step 5: Create Reputation SBT (Soulbound - non-transferable)
    const reputationAsset = await this.sdk.assets.create({
      name: `COMET Driver Reputation - ${this.config.driverName}`,
      description: `Soulbound reputation token for COMET driver. Tier: ${reputation.tier}`,
      rightType: RightType.BEHAVIOR,
      jurisdiction: {
        countryCode: 'AE',
        accreditedOnly: false,
        blockedJurisdictions: [],
      },
      validityPeriod: {
        isPerpetual: true, // Reputation is permanent
      },
      transferabilityRules: {
        mode: TransferabilityMode.NON_TRANSFERABLE, // SOULBOUND
        lockupPeriodSeconds: 0,
        requireKyc: true,
      },
      issuerId: issuer.id,
      typedMetadata: {
        assetType: 'DRIVER_REPUTATION',
        licenseNumber: this.config.licenseNumber,
        vehicleType: this.config.vehicleType,
        zone: this.config.zone,
        ...reputation,
      },
    });

    // Step 6: Add license verification evidence
    const licenseEvidence = this.sdk.evidence.create({
      assetId: reputationAsset.id,
      type: EvidenceType.LEGAL_DOCUMENT,
      title: 'Driver License Verification',
      description: `License #${this.config.licenseNumber} verified`,
      contentHash: 'sha256:' + Buffer.from(reputationAsset.id + 'license').toString('hex').slice(0, 64),
      source: {
        type: 'GOVERNMENT',
        identifier: 'uae-rta',
        name: 'UAE Roads & Transport Authority',
        trusted: true,
        reputationScore: 100,
      },
    });
    await this.sdk.evidence.verify(licenseEvidence.id, issuer.id, 'LICENSE_VERIFICATION');

    // Step 7: Activate reputation token
    await this.sdk.assets.transition(reputationAsset.id, LifecycleState.PENDING_VERIFICATION, issuer.id);
    await this.sdk.assets.verify(reputationAsset.id, issuer.id);
    await this.sdk.assets.activate(reputationAsset.id, issuer.id);

    // Step 8: Mint SBT to driver (amount = 1 for NFT)
    await this.sdk.tokens.mint(reputationAsset.id, driver.id, '1');

    return {
      reputationAssetId: reputationAsset.id,
      driverId: driver.id,
      issuerId: issuer.id,
      reputation,
    };
  }

  /**
   * Record a completed delivery and update reputation
   */
  async recordDelivery(
    reputationAssetId: string,
    deliveryData: DeliveryData
  ): Promise<{
    reputation: DriverReputation;
    xpEarned: number;
    ahoyPointsEarned: number;
    tierUp: boolean;
  }> {
    const asset = await this.sdk.assets.get(reputationAssetId);
    if (!asset) {
      throw new Error('Reputation asset not found');
    }

    const metadata = asset.typedMetadata as unknown as DriverReputation & {
      assetType: string;
      licenseNumber: string;
      vehicleType: string;
      zone: string;
    };

    // Calculate XP earned for this delivery
    let xpEarned = 10; // Base XP
    if (deliveryData.wasOnTime) xpEarned += 15;
    if (deliveryData.customerRating >= 4.5) xpEarned += 20;
    if (deliveryData.safetyEvents === 0) xpEarned += 10;

    // Update statistics
    const newTotalDeliveries = metadata.totalDeliveries + 1;
    const onTimeDeliveries = Math.round((metadata.onTimeRate / 100) * metadata.totalDeliveries) +
      (deliveryData.wasOnTime ? 1 : 0);
    const newOnTimeRate = (onTimeDeliveries / newTotalDeliveries) * 100;

    // Calculate new safety score (penalize safety events)
    const safetyPenalty = deliveryData.safetyEvents * 2;
    const newSafetyScore = Math.max(0, Math.min(100,
      (metadata.safetyScore * metadata.totalDeliveries + (100 - safetyPenalty)) / newTotalDeliveries
    ));

    // Calculate new customer rating (weighted average)
    const newCustomerRating =
      (metadata.customerRating * metadata.totalDeliveries + deliveryData.customerRating) / newTotalDeliveries;

    // Update XP and check for tier upgrade
    const newXpPoints = metadata.xpPoints + xpEarned;
    const newTier = this.calculateTier(newXpPoints);
    const tierUp = newTier !== metadata.tier;

    // Calculate streak
    const lastUpdate = new Date(metadata.lastUpdated);
    const now = new Date();
    const daysSinceLastDelivery = Math.floor((now.getTime() - lastUpdate.getTime()) / (24 * 60 * 60 * 1000));
    const newStreakDays = daysSinceLastDelivery <= 1 ? metadata.streakDays + 1 : 1;

    // Bonus XP for streaks
    if (newStreakDays >= 7) xpEarned += 50; // Weekly streak bonus

    // Calculate $AHOY points earned
    let ahoyPointsEarned = 0;
    if (newStreakDays >= 7 && newStreakDays % 7 === 0) {
      ahoyPointsEarned = AhoyEcosystemConfig.POINTS_CONFIG.PERFECT_DELIVERY_WEEK.points;
    }

    // Update reputation
    const updatedReputation: DriverReputation = {
      driverId: metadata.driverId,
      totalDeliveries: newTotalDeliveries,
      onTimeRate: Math.round(newOnTimeRate * 10) / 10,
      safetyScore: Math.round(newSafetyScore * 10) / 10,
      customerRating: Math.round(newCustomerRating * 100) / 100,
      xpPoints: newXpPoints,
      tier: newTier,
      streakDays: newStreakDays,
      lastUpdated: now.toISOString(),
    };

    // Add delivery evidence
    this.sdk.evidence.create({
      assetId: reputationAssetId,
      type: EvidenceType.AUDIT_REPORT,
      title: `Delivery ${deliveryData.deliveryId}`,
      description: `Completed delivery. On-time: ${deliveryData.wasOnTime}, Rating: ${deliveryData.customerRating}`,
      contentHash: 'sha256:' + Buffer.from(reputationAssetId + deliveryData.deliveryId).toString('hex').slice(0, 64),
      source: {
        type: 'TELEMATICS',
        identifier: 'comet-telematics',
        name: 'COMET Telematics Oracle',
        trusted: true,
        reputationScore: 95,
      },
    });

    // Update asset metadata
    await this.sdk.assets.update(reputationAssetId, {
      description: `Soulbound reputation token for COMET driver. Tier: ${newTier}. Deliveries: ${newTotalDeliveries}`,
      typedMetadata: {
        assetType: 'DRIVER_REPUTATION',
        licenseNumber: metadata.licenseNumber,
        vehicleType: metadata.vehicleType,
        zone: metadata.zone,
        ...updatedReputation,
      },
    } as any);

    return {
      reputation: updatedReputation,
      xpEarned,
      ahoyPointsEarned,
      tierUp,
    };
  }

  /**
   * Calculate driver tier based on XP
   */
  private calculateTier(xpPoints: number): DriverTier {
    const tiers = AhoyEcosystemConfig.DRIVER_TIERS;

    if (xpPoints >= tiers[DriverTier.DIAMOND]) return DriverTier.DIAMOND;
    if (xpPoints >= tiers[DriverTier.PLATINUM]) return DriverTier.PLATINUM;
    if (xpPoints >= tiers[DriverTier.GOLD]) return DriverTier.GOLD;
    if (xpPoints >= tiers[DriverTier.SILVER]) return DriverTier.SILVER;
    return DriverTier.BRONZE;
  }

  /**
   * Get tier benefits
   */
  static getTierBenefits(tier: DriverTier): {
    payoutMultiplier: number;
    premiumRoutes: boolean;
    prioritySupport: boolean;
    bonusPercentage: number;
  } {
    const benefits: Record<DriverTier, ReturnType<typeof DriverReputationPack.getTierBenefits>> = {
      [DriverTier.BRONZE]: { payoutMultiplier: 1.0, premiumRoutes: false, prioritySupport: false, bonusPercentage: 0 },
      [DriverTier.SILVER]: { payoutMultiplier: 1.05, premiumRoutes: false, prioritySupport: false, bonusPercentage: 5 },
      [DriverTier.GOLD]: { payoutMultiplier: 1.1, premiumRoutes: true, prioritySupport: false, bonusPercentage: 10 },
      [DriverTier.PLATINUM]: { payoutMultiplier: 1.2, premiumRoutes: true, prioritySupport: true, bonusPercentage: 20 },
      [DriverTier.DIAMOND]: { payoutMultiplier: 1.35, premiumRoutes: true, prioritySupport: true, bonusPercentage: 35 },
    };
    return benefits[tier];
  }
}

/**
 * Quick start helper for driver registration
 */
export async function registerCometDriver(
  sdk: TokenisationSDK,
  driverName: string,
  licenseNumber: string,
  vehicleType: 'BIKE' | 'CAR' | 'VAN' | 'TRUCK' = 'CAR'
): Promise<string> {
  const pack = new DriverReputationPack(sdk, {
    driverName,
    licenseNumber,
    email: `${driverName.toLowerCase().replace(/\s/g, '.')}@comet.ahoy`,
    vehicleType,
    zone: 'DUBAI_CENTRAL',
  });

  const result = await pack.registerDriver();
  return result.reputationAssetId;
}

/**
 * Simulate a series of deliveries for demo purposes
 */
export async function simulateDriverWeek(
  sdk: TokenisationSDK,
  reputationAssetId: string
): Promise<{
  finalReputation: DriverReputation;
  totalXpEarned: number;
  totalAhoyPoints: number;
}> {
  const pack = new DriverReputationPack(sdk, {
    driverName: 'Demo Driver',
    licenseNumber: 'DEMO-001',
    email: 'demo@comet.ahoy',
    vehicleType: 'CAR',
    zone: 'DUBAI_CENTRAL',
  });

  let totalXpEarned = 0;
  let totalAhoyPoints = 0;
  let finalReputation: DriverReputation | null = null;

  // Simulate 7 days of deliveries
  for (let day = 0; day < 7; day++) {
    // 5-10 deliveries per day
    const deliveriesPerDay = Math.floor(Math.random() * 6) + 5;

    for (let i = 0; i < deliveriesPerDay; i++) {
      const deliveryData: DeliveryData = {
        deliveryId: `DEL-${Date.now()}-${day}-${i}`,
        completedAt: new Date().toISOString(),
        wasOnTime: Math.random() > 0.15, // 85% on-time rate
        customerRating: 4 + Math.random(), // 4-5 rating
        distanceKm: Math.random() * 20 + 2,
        durationMinutes: Math.random() * 45 + 15,
        safetyEvents: Math.random() > 0.9 ? 1 : 0, // 10% chance of safety event
      };

      const result = await pack.recordDelivery(reputationAssetId, deliveryData);
      totalXpEarned += result.xpEarned;
      totalAhoyPoints += result.ahoyPointsEarned;
      finalReputation = result.reputation;
    }
  }

  return {
    finalReputation: finalReputation!,
    totalXpEarned,
    totalAhoyPoints,
  };
}
