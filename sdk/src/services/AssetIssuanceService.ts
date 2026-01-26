/**
 * Asset Issuance Service
 *
 * High-level API for issuing tokenized assets without ERC terminology.
 * Institutions describe their requirements, the SDK handles implementation details.
 *
 * @example
 * ```typescript
 * const service = new AssetIssuanceService(sdk);
 *
 * // Issue a real estate token - no ERC knowledge needed
 * const asset = await service.issueAsset({
 *   name: 'Dubai Marina Tower Unit 4501',
 *   assetType: AssetType.REAL_ESTATE,
 *   jurisdiction: 'AE',
 *   investorClass: InvestorClass.ACCREDITED,
 *   liquidityProfile: LiquidityProfile.SEMI_LIQUID,
 *   totalSupply: '1000000',
 *   lockupDays: 365,
 * });
 *
 * // The SDK automatically selected ERC-3643, configured compliance,
 * // and set up the appropriate transfer restrictions.
 * ```
 */

import { v4 as uuidv4 } from 'uuid';
import {
  AssetDescriptor,
  AssetDescriptorSchema,
  AssetType,
  InvestorClass,
  LiquidityProfile,
  FractionalizationType,
  IssuedAsset,
  resolveTokenStandard,
  ResolvedTokenConfig,
  TokenStandard,
  getAssetTypeDescription,
  getJurisdictionInfo,
} from '../core/AssetAbstraction.js';
import {
  LifecycleState,
  RightType,
  TransferabilityMode,
  Result,
  ok,
  err,
} from '../core/types.js';

// ============================================================================
// SERVICE INTERFACE
// ============================================================================

/**
 * Options for the asset issuance service.
 */
export interface AssetIssuanceServiceOptions {
  /** Whether to auto-deploy contracts (default: false for draft) */
  autoDeploy?: boolean;

  /** Default jurisdiction if not specified */
  defaultJurisdiction?: string;

  /** Callback for resolution decisions (debugging/audit) */
  onResolution?: (descriptor: AssetDescriptor, config: ResolvedTokenConfig) => void;
}

/**
 * Error types for asset issuance.
 */
export class AssetIssuanceError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AssetIssuanceError';
  }
}

// ============================================================================
// ASSET ISSUANCE SERVICE
// ============================================================================

/**
 * Service for issuing tokenized assets with an institutional-friendly API.
 * Hides all ERC standards and blockchain complexity.
 */
export class AssetIssuanceService {
  private options: AssetIssuanceServiceOptions;
  private assets: Map<string, IssuedAsset> = new Map();
  private resolutions: Map<string, ResolvedTokenConfig> = new Map();

  constructor(options: AssetIssuanceServiceOptions = {}) {
    this.options = {
      autoDeploy: false,
      ...options,
    };
  }

  // ==========================================================================
  // MAIN API - No ERC terminology
  // ==========================================================================

  /**
   * Issue a new tokenized asset.
   *
   * The SDK automatically determines the appropriate token standard,
   * compliance configuration, and transfer restrictions based on the
   * asset descriptor.
   *
   * @param descriptor - Asset description (no blockchain terminology)
   * @returns The issued asset with all configuration resolved
   *
   * @example
   * ```typescript
   * // Issue equity tokens
   * const equity = await service.issueAsset({
   *   name: 'Acme Corp Series A',
   *   assetType: AssetType.EQUITY,
   *   jurisdiction: 'US',
   *   investorClass: InvestorClass.ACCREDITED,
   *   liquidityProfile: LiquidityProfile.ILLIQUID,
   *   totalSupply: '10000000',
   *   maxInvestors: 99,  // Reg D limit
   *   lockupDays: 365,
   * });
   *
   * // Issue carbon credits
   * const carbon = await service.issueAsset({
   *   name: 'Verified Carbon Units 2024',
   *   assetType: AssetType.CARBON_CREDIT,
   *   jurisdiction: 'CH',
   *   investorClass: InvestorClass.RETAIL,
   *   liquidityProfile: LiquidityProfile.LIQUID,
   *   totalSupply: '1000000',
   * });
   * ```
   */
  async issueAsset(descriptor: Partial<AssetDescriptor>): Promise<Result<IssuedAsset, AssetIssuanceError>> {
    // Validate input
    const parseResult = AssetDescriptorSchema.safeParse({
      ...descriptor,
      jurisdiction: descriptor.jurisdiction || this.options.defaultJurisdiction,
    });

    if (!parseResult.success) {
      return err(new AssetIssuanceError(
        'Invalid asset descriptor',
        'INVALID_DESCRIPTOR',
        { errors: parseResult.error.errors }
      ));
    }

    const validDescriptor = parseResult.data;

    // Resolve token standard and configuration
    const resolution = resolveTokenStandard(validDescriptor);

    // Notify callback if provided
    if (this.options.onResolution) {
      this.options.onResolution(validDescriptor, resolution);
    }

    // Create the issued asset
    const assetId = uuidv4();
    const now = new Date().toISOString();

    const issuedAsset: IssuedAsset = {
      id: assetId,
      name: validDescriptor.name,
      assetType: validDescriptor.assetType,
      jurisdiction: validDescriptor.jurisdiction,
      investorClass: validDescriptor.investorClass,
      liquidityProfile: validDescriptor.liquidityProfile,
      state: 'DRAFT',
      supply: {
        total: validDescriptor.totalSupply || '0',
        circulating: '0',
        decimals: resolution.decimals,
      },
      compliance: {
        kycRequired: resolution.compliance.requireKyc,
        accreditationRequired: resolution.compliance.requireAccreditation,
        lockupDays: resolution.compliance.lockupDays || 0,
        maxInvestors: resolution.compliance.maxInvestors,
        allowedCountries: resolution.compliance.countryWhitelist,
        blockedCountries: resolution.compliance.countryBlacklist || [],
      },
      createdAt: now,
    };

    // Store asset and resolution
    this.assets.set(assetId, issuedAsset);
    this.resolutions.set(assetId, resolution);

    return ok(issuedAsset);
  }

  /**
   * Get asset by ID.
   */
  getAsset(assetId: string): IssuedAsset | undefined {
    return this.assets.get(assetId);
  }

  /**
   * List all issued assets.
   */
  listAssets(filter?: {
    assetType?: AssetType;
    jurisdiction?: string;
    state?: IssuedAsset['state'];
  }): IssuedAsset[] {
    let assets = Array.from(this.assets.values());

    if (filter?.assetType) {
      assets = assets.filter(a => a.assetType === filter.assetType);
    }
    if (filter?.jurisdiction) {
      assets = assets.filter(a => a.jurisdiction === filter.jurisdiction);
    }
    if (filter?.state) {
      assets = assets.filter(a => a.state === filter.state);
    }

    return assets;
  }

  /**
   * Activate an asset (moves from DRAFT to ACTIVE).
   * In production, this would deploy contracts and configure compliance.
   */
  async activateAsset(assetId: string): Promise<Result<IssuedAsset, AssetIssuanceError>> {
    const asset = this.assets.get(assetId);
    if (!asset) {
      return err(new AssetIssuanceError('Asset not found', 'NOT_FOUND', { assetId }));
    }

    if (asset.state !== 'DRAFT' && asset.state !== 'PENDING') {
      return err(new AssetIssuanceError(
        `Cannot activate asset in ${asset.state} state`,
        'INVALID_STATE',
        { currentState: asset.state }
      ));
    }

    // Update state
    asset.state = 'ACTIVE';
    this.assets.set(assetId, asset);

    return ok(asset);
  }

  /**
   * Freeze an asset (compliance action).
   */
  async freezeAsset(assetId: string, reason: string): Promise<Result<IssuedAsset, AssetIssuanceError>> {
    const asset = this.assets.get(assetId);
    if (!asset) {
      return err(new AssetIssuanceError('Asset not found', 'NOT_FOUND', { assetId }));
    }

    if (asset.state !== 'ACTIVE') {
      return err(new AssetIssuanceError(
        'Only active assets can be frozen',
        'INVALID_STATE',
        { currentState: asset.state }
      ));
    }

    asset.state = 'FROZEN';
    this.assets.set(assetId, asset);

    return ok(asset);
  }

  /**
   * Retire an asset permanently.
   */
  async retireAsset(assetId: string): Promise<Result<IssuedAsset, AssetIssuanceError>> {
    const asset = this.assets.get(assetId);
    if (!asset) {
      return err(new AssetIssuanceError('Asset not found', 'NOT_FOUND', { assetId }));
    }

    asset.state = 'RETIRED';
    this.assets.set(assetId, asset);

    return ok(asset);
  }

  // ==========================================================================
  // INFORMATIONAL API
  // ==========================================================================

  /**
   * Preview what configuration would be used for an asset descriptor.
   * Useful for understanding SDK decisions before issuing.
   */
  previewConfiguration(descriptor: Partial<AssetDescriptor>): Result<{
    tokenStandard: string;
    rightType: string;
    transferMode: string;
    compliance: ResolvedTokenConfig['compliance'];
    rationale: string[];
  }, AssetIssuanceError> {
    const parseResult = AssetDescriptorSchema.safeParse({
      name: 'Preview',
      ...descriptor,
      jurisdiction: descriptor.jurisdiction || this.options.defaultJurisdiction || 'US',
    });

    if (!parseResult.success) {
      return err(new AssetIssuanceError(
        'Invalid asset descriptor',
        'INVALID_DESCRIPTOR',
        { errors: parseResult.error.errors }
      ));
    }

    const resolution = resolveTokenStandard(parseResult.data);

    // Map internal enum to friendly name
    const standardNames: Record<TokenStandard, string> = {
      [TokenStandard.ERC20]: 'Fungible Token',
      [TokenStandard.ERC721]: 'Non-Fungible Token (NFT)',
      [TokenStandard.ERC1155]: 'Multi-Token',
      [TokenStandard.ERC3643]: 'Compliant Security Token',
      [TokenStandard.ERC4626]: 'Tokenized Vault',
      [TokenStandard.SOULBOUND]: 'Non-Transferable Token',
    };

    return ok({
      tokenStandard: standardNames[resolution.standard],
      rightType: resolution.rightType,
      transferMode: resolution.transferMode,
      compliance: resolution.compliance,
      rationale: resolution.rationale,
    });
  }

  /**
   * Get internal resolution for an issued asset (for debugging/audit).
   */
  getResolution(assetId: string): ResolvedTokenConfig | undefined {
    return this.resolutions.get(assetId);
  }

  /**
   * Get information about an asset type.
   */
  getAssetTypeInfo(assetType: AssetType): {
    description: string;
    typicalStandard: string;
    complianceNotes: string[];
  } {
    const description = getAssetTypeDescription(assetType);

    // Determine typical standard and notes
    let typicalStandard: string;
    const complianceNotes: string[] = [];

    switch (assetType) {
      case AssetType.EQUITY:
      case AssetType.DEBT:
      case AssetType.FUND:
        typicalStandard = 'Compliant Security Token';
        complianceNotes.push('Requires KYC verification');
        complianceNotes.push('May require accredited investor status');
        complianceNotes.push('Subject to securities regulations');
        break;

      case AssetType.REAL_ESTATE:
        typicalStandard = 'Compliant Security Token';
        complianceNotes.push('Requires KYC verification');
        complianceNotes.push('May have jurisdiction-specific requirements');
        complianceNotes.push('Often has lockup periods');
        break;

      case AssetType.ART_COLLECTIBLE:
        typicalStandard = 'NFT or Fractional Token';
        complianceNotes.push('Provenance tracking important');
        complianceNotes.push('May require authentication');
        break;

      case AssetType.CARBON_CREDIT:
        typicalStandard = 'Fungible Token';
        complianceNotes.push('Requires verification of underlying credits');
        complianceNotes.push('Registry integration recommended');
        break;

      case AssetType.CREDENTIAL:
      case AssetType.MEMBERSHIP:
        typicalStandard = 'Non-Transferable Token';
        complianceNotes.push('Typically soulbound (non-transferable)');
        complianceNotes.push('Linked to specific identity');
        break;

      default:
        typicalStandard = 'Compliant Security Token';
        complianceNotes.push('Configuration depends on specific use case');
    }

    return { description, typicalStandard, complianceNotes };
  }

  /**
   * Get jurisdiction information and regulatory notes.
   */
  getJurisdictionInfo(countryCode: string) {
    return getJurisdictionInfo(countryCode);
  }
}

// ============================================================================
// CONVENIENCE EXPORTS
// ============================================================================

export {
  AssetType,
  InvestorClass,
  LiquidityProfile,
  FractionalizationType,
  AssetDescriptor,
  IssuedAsset,
};
