/**
 * Asset Pack Configuration
 *
 * Defines the mapping between asset pack IDs and their required adapters.
 * This configuration is used by the RegistryService to load the correct
 * adapters when processing assets of different types.
 *
 * Asset-Agnostic Architecture:
 * - No hardcoded defaults for jurisdiction or asset type
 * - Each pack explicitly declares its requirements
 * - Unknown packs fail fast with clear error messages
 */

import type { AssetPackAdapterConfig } from '../services/registry/registry.service.js';

// ============================================================================
// Asset Pack Definitions
// ============================================================================

/**
 * Supported asset types
 */
export const AssetTypes = {
  REAL_ESTATE: 'REAL_ESTATE',
  SECURITIES: 'SECURITIES',
  COMMODITIES: 'COMMODITIES',
  ART: 'ART',
  COLLECTIBLES: 'COLLECTIBLES',
  LOYALTY: 'LOYALTY',
  TICKETS: 'TICKETS',
  CREDENTIALS: 'CREDENTIALS',
  PHYSICAL_ASSET: 'PHYSICAL_ASSET',
  WAREHOUSE_RECEIPT: 'WAREHOUSE_RECEIPT',
} as const;

export type AssetType = typeof AssetTypes[keyof typeof AssetTypes];

/**
 * Supported jurisdictions
 */
export const Jurisdictions = {
  AE: 'AE',      // United Arab Emirates (Dubai)
  US: 'US',      // United States
  SG: 'SG',      // Singapore
  EU: 'EU',      // European Union
  UK: 'UK',      // United Kingdom
  GLOBAL: 'GLOBAL', // No specific jurisdiction
} as const;

export type Jurisdiction = typeof Jurisdictions[keyof typeof Jurisdictions];

/**
 * Complete asset pack configuration including metadata
 */
export interface AssetPackDefinition extends AssetPackAdapterConfig {
  /** Human-readable name */
  name: string;
  /** Description of the pack */
  description: string;
  /** Asset type */
  assetType: AssetType;
  /** Compliance modules required */
  complianceModules: string[];
  /** Whether KYC is required */
  requiresKYC: boolean;
  /** Whether custody is required */
  requiresCustody: boolean;
  /** Token standard */
  tokenStandard: 'ERC-20' | 'ERC-721' | 'ERC-1155' | 'ERC-3643';
  /** Regulatory framework */
  regulatoryFramework?: string;
}

// ============================================================================
// Asset Pack Registry
// ============================================================================

/**
 * All registered asset packs
 *
 * Pack IDs follow the convention: {ASSET_TYPE}_{JURISDICTION}
 */
export const ASSET_PACK_CONFIGS: Record<string, AssetPackDefinition> = {
  // -------------------------------------------------------------------------
  // UAE Real Estate
  // -------------------------------------------------------------------------
  REAL_ESTATE_AE: {
    packId: 'REAL_ESTATE_AE',
    name: 'UAE Real Estate',
    description: 'Tokenized real estate under UAE VARA regulations with DLD integration',
    assetType: AssetTypes.REAL_ESTATE,
    jurisdiction: Jurisdictions.AE,
    jurisdictionProvider: 'dld',
    custodyProvider: 'fireblocks',
    kycProvider: 'onfido',
    complianceModules: ['investor-cap', 'jurisdiction-whitelist', 'lockup-period'],
    requiresKYC: true,
    requiresCustody: true,
    tokenStandard: 'ERC-3643',
    regulatoryFramework: 'VARA',
  },

  // Alias for backward compatibility
  REAL_ESTATE_DUBAI: {
    packId: 'REAL_ESTATE_DUBAI',
    name: 'Dubai Real Estate (Legacy)',
    description: 'Tokenized real estate under UAE VARA regulations with DLD integration',
    assetType: AssetTypes.REAL_ESTATE,
    jurisdiction: Jurisdictions.AE,
    jurisdictionProvider: 'dld',
    custodyProvider: 'fireblocks',
    kycProvider: 'onfido',
    complianceModules: ['investor-cap', 'jurisdiction-whitelist', 'lockup-period'],
    requiresKYC: true,
    requiresCustody: true,
    tokenStandard: 'ERC-3643',
    regulatoryFramework: 'VARA',
  },

  // -------------------------------------------------------------------------
  // US Securities
  // -------------------------------------------------------------------------
  SECURITIES_US_506B: {
    packId: 'SECURITIES_US_506B',
    name: 'US Securities - Reg D 506(b)',
    description: 'Security tokens under SEC Regulation D 506(b) exemption',
    assetType: AssetTypes.SECURITIES,
    jurisdiction: Jurisdictions.US,
    jurisdictionProvider: 'sec',
    custodyProvider: 'bitgo',
    kycProvider: 'jumio',
    complianceModules: ['accredited-investor', 'investor-cap-35', 'holding-period-6mo', 'no-general-solicitation'],
    requiresKYC: true,
    requiresCustody: true,
    tokenStandard: 'ERC-3643',
    regulatoryFramework: 'SEC Reg D 506(b)',
  },

  SECURITIES_US_506C: {
    packId: 'SECURITIES_US_506C',
    name: 'US Securities - Reg D 506(c)',
    description: 'Security tokens under SEC Regulation D 506(c) exemption',
    assetType: AssetTypes.SECURITIES,
    jurisdiction: Jurisdictions.US,
    jurisdictionProvider: 'sec',
    custodyProvider: 'bitgo',
    kycProvider: 'jumio',
    complianceModules: ['accredited-investor-verified', 'holding-period-6mo'],
    requiresKYC: true,
    requiresCustody: true,
    tokenStandard: 'ERC-3643',
    regulatoryFramework: 'SEC Reg D 506(c)',
  },

  // -------------------------------------------------------------------------
  // Singapore
  // -------------------------------------------------------------------------
  SECURITIES_SG: {
    packId: 'SECURITIES_SG',
    name: 'Singapore Digital Securities',
    description: 'Digital securities under MAS regulations',
    assetType: AssetTypes.SECURITIES,
    jurisdiction: Jurisdictions.SG,
    jurisdictionProvider: 'mas',
    custodyProvider: 'fireblocks',
    kycProvider: 'onfido',
    complianceModules: ['accredited-investor-sg', 'jurisdiction-whitelist'],
    requiresKYC: true,
    requiresCustody: true,
    tokenStandard: 'ERC-3643',
    regulatoryFramework: 'MAS SFA',
  },

  REAL_ESTATE_SG: {
    packId: 'REAL_ESTATE_SG',
    name: 'Singapore Real Estate',
    description: 'Tokenized real estate under MAS regulations',
    assetType: AssetTypes.REAL_ESTATE,
    jurisdiction: Jurisdictions.SG,
    jurisdictionProvider: 'mas',
    custodyProvider: 'fireblocks',
    kycProvider: 'onfido',
    complianceModules: ['accredited-investor-sg', 'jurisdiction-whitelist', 'lockup-period'],
    requiresKYC: true,
    requiresCustody: true,
    tokenStandard: 'ERC-3643',
    regulatoryFramework: 'MAS',
  },

  // -------------------------------------------------------------------------
  // Global / Unregulated Asset Types
  // -------------------------------------------------------------------------
  LOYALTY_GLOBAL: {
    packId: 'LOYALTY_GLOBAL',
    name: 'Loyalty Points',
    description: 'Fungible loyalty/rewards tokens',
    assetType: AssetTypes.LOYALTY,
    jurisdiction: Jurisdictions.GLOBAL,
    // No jurisdiction provider needed
    complianceModules: [],
    requiresKYC: false,
    requiresCustody: false,
    tokenStandard: 'ERC-20',
  },

  TICKETS_GLOBAL: {
    packId: 'TICKETS_GLOBAL',
    name: 'Event Tickets',
    description: 'NFT-based event tickets',
    assetType: AssetTypes.TICKETS,
    jurisdiction: Jurisdictions.GLOBAL,
    complianceModules: ['transfer-window'],
    requiresKYC: false,
    requiresCustody: false,
    tokenStandard: 'ERC-721',
  },

  CREDENTIALS_GLOBAL: {
    packId: 'CREDENTIALS_GLOBAL',
    name: 'Verification Credentials',
    description: 'Non-transferable credential tokens',
    assetType: AssetTypes.CREDENTIALS,
    jurisdiction: Jurisdictions.GLOBAL,
    complianceModules: ['non-transferable'],
    requiresKYC: false,
    requiresCustody: false,
    tokenStandard: 'ERC-721',
  },

  PHYSICAL_ASSET_GLOBAL: {
    packId: 'PHYSICAL_ASSET_GLOBAL',
    name: 'Physical Asset',
    description: 'Tokenized physical assets with ownership tracking',
    assetType: AssetTypes.PHYSICAL_ASSET,
    jurisdiction: Jurisdictions.GLOBAL,
    complianceModules: ['ownership-verification'],
    requiresKYC: false,
    requiresCustody: false,
    tokenStandard: 'ERC-721',
  },

  WAREHOUSE_RECEIPT_GLOBAL: {
    packId: 'WAREHOUSE_RECEIPT_GLOBAL',
    name: 'Warehouse Receipt',
    description: 'Tokenized warehouse receipts for commodities',
    assetType: AssetTypes.WAREHOUSE_RECEIPT,
    jurisdiction: Jurisdictions.GLOBAL,
    complianceModules: ['document-verification'],
    requiresKYC: true,
    requiresCustody: false,
    tokenStandard: 'ERC-721',
  },
};

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get asset pack configuration by ID
 * @throws Error if pack not found
 */
export function getAssetPackConfig(packId: string): AssetPackDefinition {
  const config = ASSET_PACK_CONFIGS[packId];
  if (!config) {
    const availablePacks = Object.keys(ASSET_PACK_CONFIGS).join(', ');
    throw new Error(
      `Unknown asset pack: '${packId}'. ` +
      `Available packs: ${availablePacks}`
    );
  }
  return config;
}

/**
 * Check if an asset pack exists
 */
export function hasAssetPack(packId: string): boolean {
  return packId in ASSET_PACK_CONFIGS;
}

/**
 * Get all asset packs for a jurisdiction
 */
export function getPacksByJurisdiction(jurisdiction: Jurisdiction): AssetPackDefinition[] {
  return Object.values(ASSET_PACK_CONFIGS).filter(
    pack => pack.jurisdiction === jurisdiction
  );
}

/**
 * Get all asset packs for an asset type
 */
export function getPacksByAssetType(assetType: AssetType): AssetPackDefinition[] {
  return Object.values(ASSET_PACK_CONFIGS).filter(
    pack => pack.assetType === assetType
  );
}

/**
 * Get all available pack IDs
 */
export function getAvailablePackIds(): string[] {
  return Object.keys(ASSET_PACK_CONFIGS);
}

/**
 * Derive pack ID from jurisdiction and asset type
 * @returns Pack ID or null if no matching pack
 */
export function derivePackId(assetType: string, jurisdiction: string): string | null {
  // Try direct match
  const directKey = `${assetType}_${jurisdiction}`;
  if (ASSET_PACK_CONFIGS[directKey]) {
    return directKey;
  }

  // Try GLOBAL fallback for non-regulated asset types
  const globalKey = `${assetType}_GLOBAL`;
  if (ASSET_PACK_CONFIGS[globalKey]) {
    return globalKey;
  }

  return null;
}
