/**
 * H2O Utility Credit Pack
 *
 * IoT-verified utility credits for water/resource tracking.
 * Each credit represents verified delivery of resources.
 *
 * Flow: IoT Sensor -> Oracle -> Mint Credit -> Settlement
 */

import { TokenisationSDK, RightType, LifecycleState, PartyRole, PartyType, TransferabilityMode } from '../../SDK.js';
import { EvidenceType } from '../../models/index.js';
import { UtilityType, type UtilityCredit, type IoTReading } from '../types.js';
import { SDKError, ErrorCode } from '../../errors/index.js';

/**
 * H2O Provider configuration
 */
export interface H2OProviderConfig {
  /** Provider name */
  providerName: string;

  /** Operating region */
  region: string;

  /** Utility type */
  utilityType: UtilityType;

  /** Unit of measurement */
  unit: string;
}

/**
 * Credit minting request
 */
export interface MintCreditRequest {
  /** IoT device readings */
  iotReadings: IoTReading[];

  /** Consumer ID */
  consumerId: string;

  /** Delivery location */
  location?: {
    lat: number;
    lng: number;
  };
}

/**
 * H2O Utility Credit Pack
 *
 * Implements IoT-verified utility credits for resource tracking.
 */
export class H2OUtilityCreditPack {
  private sdk: TokenisationSDK;
  private config: H2OProviderConfig;
  private providerAssetId: string | null = null;
  private providerId: string | null = null;

  constructor(sdk: TokenisationSDK, config: H2OProviderConfig) {
    this.sdk = sdk;
    this.config = config;
  }

  /**
   * Initialize the utility provider
   */
  async initializeProvider(): Promise<{
    providerAssetId: string;
    providerId: string;
  }> {
    // Step 1: Create H2O Provider
    const provider = this.sdk.parties_.create({
      type: PartyType.ORGANIZATION,
      roles: [PartyRole.ISSUER, PartyRole.VERIFIER],
      name: this.config.providerName,
      jurisdiction: 'AE',
    });

    this.providerId = provider.id;

    // Step 2: Create Provider Registry Asset
    const providerAsset = await this.sdk.assets.create({
      name: `${this.config.providerName} - ${this.config.utilityType} Registry`,
      description: `Utility credit registry for ${this.config.utilityType.toLowerCase()} delivery in ${this.config.region}`,
      rightType: RightType.VERIFICATION,
      jurisdiction: {
        countryCode: 'AE',
        accreditedOnly: false,
        blockedJurisdictions: [],
      },
      validityPeriod: {
        isPerpetual: true,
      },
      transferabilityRules: {
        mode: TransferabilityMode.COMPLIANCE_GATED,
        lockupPeriodSeconds: 0,
        requireKyc: false,
      },
      issuerId: provider.id,
      typedMetadata: {
        assetType: 'H2O_UTILITY_REGISTRY',
        providerName: this.config.providerName,
        utilityType: this.config.utilityType,
        region: this.config.region,
        unit: this.config.unit,
        totalCreditsIssued: 0,
        totalQuantityDelivered: 0,
      },
    });

    this.providerAssetId = providerAsset.id;

    // Step 3: Add provider certification
    this.sdk.evidence.create({
      assetId: providerAsset.id,
      type: EvidenceType.CERTIFICATE,
      title: 'Utility Provider License',
      description: `Licensed ${this.config.utilityType.toLowerCase()} provider for ${this.config.region}`,
      contentHash: 'sha256:' + Buffer.from(providerAsset.id + 'license').toString('hex').slice(0, 64),
      source: {
        type: 'GOVERNMENT',
        identifier: 'uae-dewa',
        name: 'Dubai Electricity and Water Authority',
        trusted: true,
        reputationScore: 100,
      },
    });

    // Step 4: Activate provider
    await this.sdk.assets.transition(providerAsset.id, LifecycleState.PENDING_VERIFICATION, provider.id);
    await this.sdk.assets.verify(providerAsset.id, provider.id);
    await this.sdk.assets.activate(providerAsset.id, provider.id);

    return {
      providerAssetId: providerAsset.id,
      providerId: provider.id,
    };
  }

  /**
   * Mint utility credits based on IoT readings
   */
  async mintCredits(request: MintCreditRequest): Promise<{
    creditAssetId: string;
    credit: UtilityCredit;
    carbonOffset: number;
  }> {
    if (!this.providerId) {
      throw new SDKError('Provider not initialized. Call initializeProvider() first.', ErrorCode.NOT_INITIALIZED, {
        details: { hint: 'Call initializeProvider() before mintCredit()' },
      });
    }

    // Step 1: Verify IoT readings
    const verifiedReading = await this.verifyIoTReadings(request.iotReadings);

    // Step 2: Calculate quantity and carbon offset
    const quantity = verifiedReading.totalQuantity;
    const carbonOffset = this.calculateCarbonOffset(quantity);

    // Step 3: Create credit metadata
    const credit: UtilityCredit = {
      creditId: '', // Will be set to asset ID
      utilityType: this.config.utilityType,
      quantity,
      unit: this.config.unit,
      verifiedBy: request.iotReadings[0]?.deviceId || 'MANUAL',
      timestamp: new Date().toISOString(),
      location: request.location,
      qualityScore: verifiedReading.qualityScore,
      carbonOffset,
    };

    // Step 4: Create Credit Asset
    const creditAsset = await this.sdk.assets.create({
      name: `${this.config.utilityType} Credit - ${quantity} ${this.config.unit}`,
      description: `Verified ${this.config.utilityType.toLowerCase()} delivery credit`,
      rightType: RightType.VERIFICATION,
      jurisdiction: {
        countryCode: 'AE',
        accreditedOnly: false,
        blockedJurisdictions: [],
      },
      validityPeriod: {
        startTime: new Date().toISOString(),
        endTime: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 year validity
        isPerpetual: false,
      },
      transferabilityRules: {
        mode: TransferabilityMode.COMPLIANCE_GATED,
        lockupPeriodSeconds: 0,
        requireKyc: false,
      },
      issuerId: this.providerId,
      typedMetadata: {
        assetType: 'H2O_UTILITY_CREDIT',
        ...credit,
      },
    });

    credit.creditId = creditAsset.id;

    // Step 5: Add IoT verification evidence
    this.sdk.evidence.create({
      assetId: creditAsset.id,
      type: EvidenceType.AUDIT_REPORT,
      title: 'IoT Meter Verification',
      description: `Verified delivery of ${quantity} ${this.config.unit} via IoT sensors`,
      contentHash: 'sha256:' + Buffer.from(creditAsset.id + 'iot').toString('hex').slice(0, 64),
      source: {
        type: 'IOT_ORACLE',
        identifier: request.iotReadings[0]?.deviceId || 'manual-verification',
        name: 'H2O IoT Oracle',
        trusted: true,
        reputationScore: 95,
      },
    });

    // Step 6: Activate credit
    await this.sdk.assets.transition(creditAsset.id, LifecycleState.PENDING_VERIFICATION, this.providerId);
    await this.sdk.assets.verify(creditAsset.id, this.providerId);
    await this.sdk.assets.activate(creditAsset.id, this.providerId);

    // Step 7: Mint to consumer
    await this.sdk.tokens.mint(creditAsset.id, request.consumerId, quantity.toString());

    return {
      creditAssetId: creditAsset.id,
      credit,
      carbonOffset,
    };
  }

  /**
   * Retire/consume utility credits
   */
  async retireCredits(
    creditAssetId: string,
    consumerId: string,
    quantity: number,
    reason: string
  ): Promise<{ success: boolean; remaining: number }> {
    if (!this.providerId) {
      throw new SDKError('Provider not initialized', ErrorCode.NOT_INITIALIZED, {
        details: { hint: 'Call initializeProvider() first' },
      });
    }

    const asset = await this.sdk.assets.get(creditAssetId);
    if (!asset) {
      return { success: false, remaining: 0 };
    }

    // Add retirement evidence
    this.sdk.evidence.create({
      assetId: creditAssetId,
      type: EvidenceType.AUDIT_REPORT,
      title: 'Credit Retirement',
      description: `Retired ${quantity} ${this.config.unit}. Reason: ${reason}`,
      contentHash: 'sha256:' + Buffer.from(creditAssetId + 'retire' + Date.now()).toString('hex').slice(0, 64),
      source: {
        type: 'CONSUMER',
        identifier: consumerId,
        name: 'Credit Holder',
        trusted: true,
        reputationScore: 80,
      },
    });

    const currentBalanceStr = await this.sdk.tokens.getBalance(creditAssetId, consumerId);
    const currentBalance = BigInt(currentBalanceStr);
    const remaining = Number(currentBalance) - quantity;

    // If all credits retired, burn the asset
    if (remaining <= 0) {
      await this.sdk.assets.retire(creditAssetId, this.providerId);
    }

    return { success: true, remaining: Math.max(0, remaining) };
  }

  /**
   * Verify IoT readings
   */
  private async verifyIoTReadings(readings: IoTReading[]): Promise<{
    totalQuantity: number;
    qualityScore: number;
    verified: boolean;
  }> {
    if (readings.length === 0) {
      return { totalQuantity: 0, qualityScore: 0, verified: false };
    }

    // Sum up readings
    const totalQuantity = readings.reduce((sum, r) => sum + r.value, 0);

    // Calculate quality score based on readings consistency
    const avgValue = totalQuantity / readings.length;
    const variance = readings.reduce((sum, r) => sum + Math.pow(r.value - avgValue, 2), 0) / readings.length;
    const stdDev = Math.sqrt(variance);
    const qualityScore = Math.max(0, 100 - (stdDev / avgValue) * 100);

    return {
      totalQuantity,
      qualityScore: Math.round(qualityScore),
      verified: true,
    };
  }

  /**
   * Calculate carbon offset for delivered resources
   */
  private calculateCarbonOffset(quantity: number): number {
    // Simplified carbon offset calculation
    const offsetFactors: Record<UtilityType, number> = {
      [UtilityType.WATER]: 0.001, // kg CO2 per liter saved
      [UtilityType.ELECTRICITY]: 0.5, // kg CO2 per kWh
      [UtilityType.GAS]: 2.0, // kg CO2 per m³
      [UtilityType.COLD_CHAIN]: 0.1, // kg CO2 per ton-km
    };

    return Math.round(quantity * (offsetFactors[this.config.utilityType] || 0) * 100) / 100;
  }
}

/**
 * Quick start helper for H2O Water Credits
 */
export async function createWaterCreditProvider(sdk: TokenisationSDK): Promise<{
  pack: H2OUtilityCreditPack;
  providerAssetId: string;
}> {
  const pack = new H2OUtilityCreditPack(sdk, {
    providerName: 'Ahoy H2O',
    region: 'Dubai',
    utilityType: UtilityType.WATER,
    unit: 'LITERS',
  });

  const result = await pack.initializeProvider();

  return {
    pack,
    providerAssetId: result.providerAssetId,
  };
}

/**
 * Simulate IoT water delivery for demo
 */
export async function simulateWaterDelivery(
  sdk: TokenisationSDK,
  pack: H2OUtilityCreditPack,
  consumerId: string,
  liters: number = 1000
): Promise<string> {
  // Simulate IoT readings
  const readings: IoTReading[] = [];
  const readingsCount = 10;
  const litersPerReading = liters / readingsCount;

  for (let i = 0; i < readingsCount; i++) {
    readings.push({
      deviceId: `H2O-METER-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      readingType: 'FLOW_RATE',
      value: litersPerReading + (Math.random() - 0.5) * 10, // Small variance
      unit: 'LITERS',
      timestamp: new Date(Date.now() - (readingsCount - i) * 60000).toISOString(),
    });
  }

  const result = await pack.mintCredits({
    iotReadings: readings,
    consumerId,
    location: {
      lat: 25.2048,
      lng: 55.2708, // Dubai coordinates
    },
  });

  return result.creditAssetId;
}
