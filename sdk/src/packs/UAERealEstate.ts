/**
 * Pack A: UAE Real Estate
 *
 * Reference implementation for tokenizing UAE real estate assets.
 * Type: OWNERSHIP Right
 *
 * Flow: Define (Apartment) -> Verify (Deed) -> Mint (ERC-20 Share) -> Enforce (Whitelist) -> Distribute (Rent)
 */

import { TokenisationSDK, RightType, LifecycleState, PartyRole, PartyType } from '../SDK.js';
import { EvidenceType, type RealEstateMetadata } from '../models/index.js';
import { RuleConditionType } from '../services/ComplianceService.js';

/**
 * UAE Real Estate Pack configuration
 */
export interface UAERealEstateConfig {
  /** Property name */
  name: string;

  /** Property description */
  description?: string;

  /** Property details */
  property: {
    type: 'RESIDENTIAL' | 'COMMERCIAL' | 'INDUSTRIAL' | 'LAND';
    address: {
      street: string;
      city: string;
      postalCode: string;
    };
    areaSqm: number;
    deedNumber?: string;
  };

  /** Valuation */
  valuation: {
    amount: string; // In AED
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
 * UAE Real Estate Pack
 *
 * Demonstrates the full tokenization flow for UAE real estate.
 */
export class UAERealEstatePack {
  private sdk: TokenisationSDK;
  private config: UAERealEstateConfig;

  constructor(sdk: TokenisationSDK, config: UAERealEstateConfig) {
    this.sdk = sdk;
    this.config = config;
  }

  /**
   * Execute the full tokenization flow
   */
  async execute(): Promise<{
    assetId: string;
    issuerId: string;
    verifierId: string;
    deedEvidenceId: string;
  }> {
    // Step 1: Create Issuer
    const issuer = this.sdk.parties_.create({
      type: PartyType.ORGANIZATION,
      roles: [PartyRole.ISSUER],
      name: this.config.issuer.name,
      email: this.config.issuer.email,
      jurisdiction: 'AE',
    });

    // Create Verifier (e.g., Dubai Land Department)
    const verifier = this.sdk.parties_.create({
      type: PartyType.ORGANIZATION,
      roles: [PartyRole.VERIFIER],
      name: 'Dubai Land Department',
      jurisdiction: 'AE',
    });

    // Step 2: Create Asset with Real Estate Metadata
    const metadata: RealEstateMetadata = {
      assetType: 'REAL_ESTATE',
      propertyType: this.config.property.type,
      address: {
        street: this.config.property.address.street,
        city: this.config.property.address.city,
        postalCode: this.config.property.address.postalCode,
        country: 'AE',
      },
      area: {
        value: this.config.property.areaSqm,
        unit: 'SQM',
      },
      deedNumber: this.config.property.deedNumber,
      valuationAmount: this.config.valuation.amount,
      valuationCurrency: 'AED',
      valuationDate: this.config.valuation.date,
    };

    const asset = await this.sdk.assets.create({
      name: this.config.name,
      description: this.config.description,
      rightType: RightType.OWNERSHIP,
      jurisdiction: {
        countryCode: 'AE',
        regulatoryFramework: 'UAE_VARA',
        accreditedOnly: false,
        blockedJurisdictions: ['KP', 'IR', 'CU', 'SY'],
      },
      issuerId: issuer.id,
      typedMetadata: metadata,
    });

    // Step 3: Add Deed Evidence
    const deedEvidence = this.sdk.evidence.create({
      assetId: asset.id,
      type: EvidenceType.LEGAL_DOCUMENT,
      title: 'Property Title Deed',
      description: `Title deed for ${this.config.name}`,
      contentHash: 'sha256:' + Buffer.from(asset.id + 'deed').toString('hex').slice(0, 64),
      source: {
        type: 'GOVERNMENT_REGISTRY',
        identifier: 'dubai-land-department',
        name: 'Dubai Land Department',
        trusted: true,
        reputationScore: 100,
      },
    });

    // Step 4: Verify Evidence
    await this.sdk.evidence.verify(deedEvidence.id, verifier.id, 'DOCUMENT_REVIEW');

    // Step 5: Submit for Verification
    await this.sdk.assets.transition(
      asset.id,
      LifecycleState.PENDING_VERIFICATION,
      issuer.id
    );

    // Step 6: Verify Asset
    await this.sdk.assets.verify(asset.id, verifier.id);

    // Step 7: Activate Asset
    await this.sdk.assets.activate(asset.id, issuer.id);

    // Step 8: Register Compliance Rules
    this.sdk.compliance.registerRuleset({
      id: `uae-re-${asset.id.slice(0, 8)}`,
      name: `UAE Real Estate - ${this.config.name}`,
      appliesToAssetTypes: [RightType.OWNERSHIP],
      appliesToJurisdictions: ['AE'],
      conditions: [
        {
          type: RuleConditionType.KYC_REQUIRED,
          enabled: true,
          params: {},
          severity: 'ERROR',
        },
        {
          type: RuleConditionType.MAX_INVESTOR_COUNT,
          enabled: true,
          params: { maxCount: 500 },
          severity: 'ERROR',
        },
        {
          type: RuleConditionType.JURISDICTION_BLACKLIST,
          enabled: true,
          params: { jurisdictions: ['KP', 'IR', 'CU', 'SY'] },
          severity: 'ERROR',
        },
      ],
      priority: 10,
      active: true,
      metadata: {},
    });

    return {
      assetId: asset.id,
      issuerId: issuer.id,
      verifierId: verifier.id,
      deedEvidenceId: deedEvidence.id,
    };
  }
}

/**
 * Quick start helper for UAE Real Estate tokenization
 */
export async function createUAERealEstateToken(
  sdk: TokenisationSDK,
  config: UAERealEstateConfig
): Promise<string> {
  const pack = new UAERealEstatePack(sdk, config);
  const result = await pack.execute();
  return result.assetId;
}
