/**
 * Pack D: Ahoy Comet Bike / Physical Asset
 *
 * Reference implementation for tokenizing physical assets.
 * Type: OWNERSHIP (Physical)
 *
 * Flow: Define (Bike) -> Verify (Manuf. Cert) -> Mint (NFT) -> Enforce (Warranty)
 */

import { TokenisationSDK, RightType, LifecycleState, PartyRole, PartyType, TransferabilityMode } from '@tokenisation/core';
import { EvidenceType } from '@tokenisation/core';
import type { PhysicalAssetMetadata } from '@tokenisation/core';
import { SDKError, ErrorCode } from '@tokenisation/core';

/**
 * Physical Asset Pack configuration
 */
export interface PhysicalAssetConfig {
  /** Asset name */
  name: string;

  /** Description */
  description?: string;

  /** Category */
  category: 'VEHICLE' | 'EQUIPMENT' | 'ART' | 'COLLECTIBLE' | 'OTHER';

  /** Manufacturer details */
  manufacturer: {
    name: string;
    model: string;
    serialNumber?: string;
    manufactureDate?: string;
  };

  /** Warranty information */
  warranty?: {
    provider: string;
    expiryDate: string;
    terms?: string;
  };

  /** Current condition */
  condition?: 'NEW' | 'LIKE_NEW' | 'GOOD' | 'FAIR' | 'POOR';

  /** Physical location (optional) */
  location?: {
    latitude: number;
    longitude: number;
  };

  /** Issuer/Seller information */
  issuer: {
    name: string;
    jurisdiction: string;
  };
}

/**
 * Physical Asset Pack
 *
 * Demonstrates the tokenization of physical assets as NFTs.
 */
export class PhysicalAssetPack {
  private sdk: TokenisationSDK;
  private config: PhysicalAssetConfig;

  constructor(sdk: TokenisationSDK, config: PhysicalAssetConfig) {
    this.sdk = sdk;
    this.config = config;
  }

  /**
   * Execute the full tokenization flow
   */
  async execute(): Promise<{
    assetId: string;
    issuerId: string;
    manufacturerCertId: string;
    warrantyEvidenceId?: string;
  }> {
    // Step 1: Create Issuer
    const issuer = this.sdk.parties_.create({
      type: PartyType.ORGANIZATION,
      roles: [PartyRole.ISSUER],
      name: this.config.issuer.name,
      jurisdiction: this.config.issuer.jurisdiction,
    });

    // Step 2: Create Physical Asset with Metadata
    const metadata: PhysicalAssetMetadata = {
      assetType: 'PHYSICAL',
      category: this.config.category,
      manufacturer: this.config.manufacturer.name,
      model: this.config.manufacturer.model,
      serialNumber: this.config.manufacturer.serialNumber,
      manufactureDate: this.config.manufacturer.manufactureDate,
      warrantyExpiry: this.config.warranty?.expiryDate,
      condition: this.config.condition,
      physicalLocation: this.config.location,
    };

    const asset = await this.sdk.assets.create({
      name: this.config.name,
      description: this.config.description || `${this.config.manufacturer.name} ${this.config.manufacturer.model}`,
      rightType: RightType.OWNERSHIP,
      jurisdiction: {
        countryCode: this.config.issuer.jurisdiction,
        accreditedOnly: false,
        blockedJurisdictions: [],
      },
      validityPeriod: {
        isPerpetual: true,
      },
      transferabilityRules: {
        mode: TransferabilityMode.UNRESTRICTED, // Physical assets can be freely transferred
        lockupPeriodSeconds: 0,
        requireKyc: false,
      },
      issuerId: issuer.id,
      typedMetadata: metadata,
    });

    // Step 3: Add Manufacturer Certificate Evidence
    const manufacturerCert = this.sdk.evidence.create({
      assetId: asset.id,
      type: EvidenceType.CERTIFICATE,
      title: 'Manufacturer Certificate of Authenticity',
      description: `Certificate of authenticity for ${this.config.manufacturer.name} ${this.config.manufacturer.model}`,
      contentHash: 'sha256:' + Buffer.from(asset.id + 'cert').toString('hex').slice(0, 64),
      source: {
        type: 'MANUFACTURER',
        identifier: this.config.manufacturer.name.toLowerCase().replace(/\s/g, '-'),
        name: this.config.manufacturer.name,
        trusted: true,
        reputationScore: 95,
      },
    });

    // Step 4: Verify Manufacturer Certificate
    await this.sdk.evidence.verify(manufacturerCert.id, issuer.id, 'CERTIFICATE_VERIFICATION');

    // Step 5: Add Warranty Evidence (if provided)
    let warrantyEvidenceId: string | undefined;
    if (this.config.warranty) {
      const warrantyEvidence = this.sdk.evidence.create({
        assetId: asset.id,
        type: EvidenceType.LEGAL_DOCUMENT,
        title: 'Warranty Certificate',
        description: `Warranty valid until ${this.config.warranty.expiryDate}`,
        contentHash: 'sha256:' + Buffer.from(asset.id + 'warranty').toString('hex').slice(0, 64),
        validFrom: new Date().toISOString(),
        validUntil: this.config.warranty.expiryDate,
        source: {
          type: 'WARRANTY_PROVIDER',
          identifier: this.config.warranty.provider.toLowerCase().replace(/\s/g, '-'),
          name: this.config.warranty.provider,
          trusted: true,
          reputationScore: 90,
        },
      });

      await this.sdk.evidence.verify(warrantyEvidence.id, issuer.id, 'WARRANTY_VERIFICATION');
      warrantyEvidenceId = warrantyEvidence.id;
    }

    // Step 6: Submit for Verification
    await this.sdk.assets.transition(
      asset.id,
      LifecycleState.PENDING_VERIFICATION,
      issuer.id
    );

    // Step 7: Verify Asset
    await this.sdk.assets.verify(asset.id, issuer.id);

    // Step 8: Activate Asset (Mint NFT)
    await this.sdk.assets.activate(asset.id, issuer.id);

    return {
      assetId: asset.id,
      issuerId: issuer.id,
      manufacturerCertId: manufacturerCert.id,
      warrantyEvidenceId,
    };
  }

  /**
   * Update physical location of the asset
   */
  async updateLocation(
    assetId: string,
    latitude: number,
    longitude: number
  ): Promise<void> {
    const asset = await this.sdk.assets.get(assetId);
    if (!asset) {
      throw new SDKError('Asset not found', ErrorCode.ASSET_NOT_FOUND, {
        details: { assetId },
      });
    }

    const currentMetadata = asset.typedMetadata as PhysicalAssetMetadata;
    const updatedMetadata: PhysicalAssetMetadata = {
      ...currentMetadata,
      physicalLocation: { latitude, longitude },
    };

    await this.sdk.assets.update(assetId, {
      typedMetadata: updatedMetadata,
    } as any);
  }

  /**
   * Update condition of the asset
   */
  async updateCondition(
    assetId: string,
    condition: 'NEW' | 'LIKE_NEW' | 'GOOD' | 'FAIR' | 'POOR',
    inspectorId: string
  ): Promise<void> {
    const asset = await this.sdk.assets.get(assetId);
    if (!asset) {
      throw new SDKError('Asset not found', ErrorCode.ASSET_NOT_FOUND, {
        details: { assetId },
      });
    }

    const currentMetadata = asset.typedMetadata as PhysicalAssetMetadata;
    const updatedMetadata: PhysicalAssetMetadata = {
      ...currentMetadata,
      condition,
    };

    // Add inspection evidence
    this.sdk.evidence.create({
      assetId,
      type: EvidenceType.AUDIT_REPORT,
      title: 'Condition Inspection Report',
      description: `Asset condition updated to: ${condition}`,
      contentHash: 'sha256:' + Buffer.from(assetId + 'inspection' + Date.now()).toString('hex').slice(0, 64),
      source: {
        type: 'INSPECTOR',
        identifier: inspectorId,
        name: 'Certified Inspector',
        trusted: true,
        reputationScore: 85,
      },
    });

    await this.sdk.assets.update(assetId, {
      typedMetadata: updatedMetadata,
    } as any);
  }
}

/**
 * Quick start helper for Ahoy Comet Bike tokenization
 */
export async function createAhoyCometBike(
  sdk: TokenisationSDK,
  serialNumber: string,
  condition: 'NEW' | 'LIKE_NEW' | 'GOOD' | 'FAIR' | 'POOR' = 'NEW'
): Promise<string> {
  const pack = new PhysicalAssetPack(sdk, {
    name: `Ahoy Comet E-Bike #${serialNumber}`,
    description: 'Premium electric bicycle by Ahoy Comet',
    category: 'VEHICLE',
    manufacturer: {
      name: 'Ahoy Comet',
      model: 'Comet E-Bike',
      serialNumber,
      manufactureDate: new Date().toISOString(),
    },
    warranty: {
      provider: 'Ahoy Comet',
      expiryDate: new Date(Date.now() + 2 * 365 * 24 * 60 * 60 * 1000).toISOString(), // 2 years
      terms: 'Standard manufacturer warranty',
    },
    condition,
    issuer: {
      name: 'Ahoy Comet',
      jurisdiction: 'AE',
    },
  });

  const result = await pack.execute();
  return result.assetId;
}

/**
 * Quick start helper for generic collectible tokenization
 */
export async function createCollectible(
  sdk: TokenisationSDK,
  name: string,
  manufacturer: string,
  model: string,
  serialNumber?: string
): Promise<string> {
  const pack = new PhysicalAssetPack(sdk, {
    name,
    category: 'COLLECTIBLE',
    manufacturer: {
      name: manufacturer,
      model,
      serialNumber,
    },
    issuer: {
      name: manufacturer,
      jurisdiction: 'AE',
    },
  });

  const result = await pack.execute();
  return result.assetId;
}
