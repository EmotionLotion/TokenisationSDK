/**
 * Asset Abstraction Layer
 *
 * Hides ERC token standards behind institutional-friendly asset descriptors.
 * Institutions describe WHAT they want, the SDK decides HOW to implement it.
 *
 * @example
 * ```typescript
 * const asset = await sdk.issueAsset({
 *   assetType: AssetType.REAL_ESTATE,
 *   jurisdiction: 'AE',
 *   investorClass: InvestorClass.ACCREDITED,
 *   liquidityProfile: LiquidityProfile.SEMI_LIQUID,
 * });
 * ```
 */

import { z } from 'zod';
import { TransferabilityMode, RightType } from './types.js';

// ============================================================================
// ASSET TYPE DESCRIPTORS
// ============================================================================

/**
 * High-level asset categories that institutions understand.
 * The SDK maps these to appropriate token standards internally.
 */
export enum AssetType {
  // Securities & Financial Instruments
  EQUITY = 'EQUITY',                     // Company shares, stock
  DEBT = 'DEBT',                         // Bonds, notes, loans
  FUND = 'FUND',                         // Investment funds, ETFs
  DERIVATIVE = 'DERIVATIVE',             // Options, futures, swaps

  // Real Assets
  REAL_ESTATE = 'REAL_ESTATE',           // Property, land, buildings
  COMMODITY = 'COMMODITY',               // Gold, oil, agricultural
  INFRASTRUCTURE = 'INFRASTRUCTURE',     // Roads, bridges, utilities

  // Alternative Assets
  PRIVATE_EQUITY = 'PRIVATE_EQUITY',     // PE fund interests
  VENTURE_CAPITAL = 'VENTURE_CAPITAL',   // VC investments
  ART_COLLECTIBLE = 'ART_COLLECTIBLE',   // Art, wine, collectibles

  // Digital & IP
  INTELLECTUAL_PROPERTY = 'INTELLECTUAL_PROPERTY',  // Patents, copyrights
  DIGITAL_RIGHTS = 'DIGITAL_RIGHTS',     // Licenses, subscriptions
  CARBON_CREDIT = 'CARBON_CREDIT',       // Environmental credits

  // Operational
  REVENUE_SHARE = 'REVENUE_SHARE',       // Revenue participation
  ROYALTY = 'ROYALTY',                   // Royalty streams
  INVOICE = 'INVOICE',                   // Invoice financing

  // Access & Membership
  MEMBERSHIP = 'MEMBERSHIP',             // Club, organization access
  TICKET = 'TICKET',                     // Event access
  CREDENTIAL = 'CREDENTIAL',             // Certifications, badges
}

/**
 * Investor classification for regulatory compliance.
 */
export enum InvestorClass {
  /** Open to all investors, minimal restrictions */
  RETAIL = 'RETAIL',

  /** Accredited/qualified investors only (e.g., Reg D in US) */
  ACCREDITED = 'ACCREDITED',

  /** Professional/institutional investors only */
  INSTITUTIONAL = 'INSTITUTIONAL',

  /** Qualified purchasers (higher threshold than accredited) */
  QUALIFIED_PURCHASER = 'QUALIFIED_PURCHASER',
}

/**
 * Liquidity profile determines transfer restrictions and market structure.
 */
export enum LiquidityProfile {
  /** Freely tradeable, no restrictions */
  LIQUID = 'LIQUID',

  /** Some restrictions (lockups, holding periods) */
  SEMI_LIQUID = 'SEMI_LIQUID',

  /** Significant restrictions, limited secondary market */
  ILLIQUID = 'ILLIQUID',

  /** Non-transferable (soulbound) */
  NON_TRANSFERABLE = 'NON_TRANSFERABLE',
}

/**
 * Fractionalization strategy for the asset.
 */
export enum FractionalizationType {
  /** Single indivisible token (NFT-style) */
  WHOLE = 'WHOLE',

  /** Fixed number of equal shares */
  FIXED_SHARES = 'FIXED_SHARES',

  /** Divisible to any decimal precision */
  DIVISIBLE = 'DIVISIBLE',

  /** Multiple token types representing different tranches/classes */
  MULTI_CLASS = 'MULTI_CLASS',
}

// ============================================================================
// INTERNAL TOKEN STANDARD MAPPING
// ============================================================================

/**
 * Internal token standard selection (hidden from API users).
 * @internal
 */
export enum TokenStandard {
  ERC20 = 'ERC20',           // Fungible tokens
  ERC721 = 'ERC721',         // Non-fungible tokens
  ERC1155 = 'ERC1155',       // Multi-token (fungible + non-fungible)
  ERC3643 = 'ERC3643',       // Compliant security token (T-REX)
  ERC4626 = 'ERC4626',       // Tokenized vault
  SOULBOUND = 'SOULBOUND',   // Non-transferable (ERC-5192)
}

/**
 * Internal compliance module selection.
 * @internal
 */
export interface ComplianceConfig {
  requireKyc: boolean;
  requireAccreditation: boolean;
  countryWhitelist?: string[];
  countryBlacklist?: string[];
  maxInvestors?: number;
  maxHoldingPercent?: number;
  lockupDays?: number;
  transferCooldownHours?: number;
}

// ============================================================================
// ASSET DESCRIPTOR SCHEMA
// ============================================================================

/**
 * Asset descriptor - the institutional-friendly input for issuing assets.
 * No ERC standards, no blockchain terminology.
 */
export const AssetDescriptorSchema = z.object({
  // Required fields
  /** Human-readable name */
  name: z.string().min(1).max(256),

  /** Type of asset being tokenized */
  assetType: z.nativeEnum(AssetType),

  /** Primary jurisdiction (ISO country code) */
  jurisdiction: z.string().length(2),

  // Investor & Compliance
  /** Target investor class */
  investorClass: z.nativeEnum(InvestorClass).default(InvestorClass.RETAIL),

  /** Liquidity profile */
  liquidityProfile: z.nativeEnum(LiquidityProfile).default(LiquidityProfile.SEMI_LIQUID),

  /** How the asset should be fractionalized */
  fractionalization: z.nativeEnum(FractionalizationType).default(FractionalizationType.DIVISIBLE),

  // Optional configuration
  /** Description */
  description: z.string().max(4096).optional(),

  /** Total supply (for divisible assets) */
  totalSupply: z.string().optional(),

  /** Number of shares (for fixed share assets) */
  numberOfShares: z.number().positive().optional(),

  /** Decimal precision (default: 18 for divisible, 0 for whole) */
  decimals: z.number().min(0).max(18).optional(),

  /** Lockup period in days */
  lockupDays: z.number().nonnegative().default(0),

  /** Maximum number of investors */
  maxInvestors: z.number().positive().optional(),

  /** Maximum holding per investor (percentage) */
  maxHoldingPercent: z.number().min(0).max(100).optional(),

  /** Additional jurisdictions where the asset can be offered */
  additionalJurisdictions: z.array(z.string().length(2)).default([]),

  /** Blocked jurisdictions */
  blockedJurisdictions: z.array(z.string().length(2)).default([]),

  /** External document URI (prospectus, legal docs) */
  documentUri: z.string().url().optional(),

  /** Asset-specific metadata */
  metadata: z.record(z.unknown()).default({}),
});

export type AssetDescriptor = z.infer<typeof AssetDescriptorSchema>;

// ============================================================================
// TOKEN STANDARD RESOLVER
// ============================================================================

/**
 * Resolved token configuration - internal result of the abstraction layer.
 * @internal
 */
export interface ResolvedTokenConfig {
  /** Selected token standard */
  standard: TokenStandard;

  /** Mapped right type for the lifecycle engine */
  rightType: RightType;

  /** Transfer mode */
  transferMode: TransferabilityMode;

  /** Compliance configuration */
  compliance: ComplianceConfig;

  /** Token decimals */
  decimals: number;

  /** Whether this needs multi-token support */
  isMultiToken: boolean;

  /** Human-readable explanation of the resolution */
  rationale: string[];
}

/**
 * Default sanctioned countries (OFAC list).
 */
const SANCTIONED_COUNTRIES = ['KP', 'IR', 'CU', 'SY', 'RU'];

/**
 * Resolves asset descriptor to internal token configuration.
 * This is the core logic that hides ERC standards from the API.
 *
 * @internal
 */
export function resolveTokenStandard(descriptor: AssetDescriptor): ResolvedTokenConfig {
  const rationale: string[] = [];

  // Determine base token standard
  let standard: TokenStandard;
  let rightType: RightType;
  let decimals: number;
  let isMultiToken = false;

  // Step 1: Determine fractionalization → token standard mapping
  switch (descriptor.fractionalization) {
    case FractionalizationType.WHOLE:
      standard = TokenStandard.ERC721;
      decimals = 0;
      rationale.push('WHOLE fractionalization → ERC-721 (NFT)');
      break;

    case FractionalizationType.MULTI_CLASS:
      standard = TokenStandard.ERC1155;
      decimals = descriptor.decimals ?? 18;
      isMultiToken = true;
      rationale.push('MULTI_CLASS fractionalization → ERC-1155 (multi-token)');
      break;

    case FractionalizationType.FIXED_SHARES:
    case FractionalizationType.DIVISIBLE:
    default:
      // Default to compliant token for securities
      standard = TokenStandard.ERC3643;
      decimals = descriptor.decimals ?? 18;
      rationale.push('DIVISIBLE/FIXED_SHARES → ERC-3643 (compliant token)');
      break;
  }

  // Step 2: Override based on asset type
  switch (descriptor.assetType) {
    case AssetType.EQUITY:
    case AssetType.DEBT:
    case AssetType.FUND:
    case AssetType.PRIVATE_EQUITY:
    case AssetType.VENTURE_CAPITAL:
      // Securities always need compliance
      if (standard !== TokenStandard.ERC1155) {
        standard = TokenStandard.ERC3643;
        rationale.push(`${descriptor.assetType} is a security → ERC-3643 required`);
      }
      rightType = RightType.OWNERSHIP;
      break;

    case AssetType.REAL_ESTATE:
    case AssetType.INFRASTRUCTURE:
      standard = TokenStandard.ERC3643;
      rightType = RightType.OWNERSHIP;
      rationale.push('Real asset → ERC-3643 with ownership rights');
      break;

    case AssetType.ART_COLLECTIBLE:
      if (descriptor.fractionalization === FractionalizationType.WHOLE) {
        standard = TokenStandard.ERC721;
        rationale.push('Whole collectible → ERC-721');
      }
      rightType = RightType.OWNERSHIP;
      break;

    case AssetType.CREDENTIAL:
    case AssetType.MEMBERSHIP:
      if (descriptor.liquidityProfile === LiquidityProfile.NON_TRANSFERABLE) {
        standard = TokenStandard.SOULBOUND;
        rationale.push('Non-transferable credential → Soulbound (ERC-5192)');
      }
      rightType = RightType.ACCESS;
      break;

    case AssetType.TICKET:
      rightType = RightType.ACCESS;
      if (descriptor.fractionalization === FractionalizationType.WHOLE) {
        standard = TokenStandard.ERC721;
      }
      break;

    case AssetType.CARBON_CREDIT:
      rightType = RightType.VERIFICATION;
      rationale.push('Carbon credit → Verification right type');
      break;

    case AssetType.REVENUE_SHARE:
    case AssetType.ROYALTY:
      standard = TokenStandard.ERC4626;
      rightType = RightType.OWNERSHIP;
      rationale.push('Revenue/royalty stream → ERC-4626 vault');
      break;

    default:
      rightType = RightType.OWNERSHIP;
  }

  // Step 3: Determine transfer mode
  let transferMode: TransferabilityMode;
  switch (descriptor.liquidityProfile) {
    case LiquidityProfile.LIQUID:
      transferMode = TransferabilityMode.UNRESTRICTED;
      rationale.push('LIQUID profile → unrestricted transfers');
      break;

    case LiquidityProfile.NON_TRANSFERABLE:
      transferMode = TransferabilityMode.NON_TRANSFERABLE;
      rationale.push('NON_TRANSFERABLE profile → soulbound');
      break;

    case LiquidityProfile.SEMI_LIQUID:
    case LiquidityProfile.ILLIQUID:
    default:
      transferMode = TransferabilityMode.COMPLIANCE_GATED;
      rationale.push(`${descriptor.liquidityProfile} profile → compliance-gated transfers`);
      break;
  }

  // Step 4: Build compliance configuration
  const compliance: ComplianceConfig = {
    requireKyc: descriptor.investorClass !== InvestorClass.RETAIL,
    requireAccreditation: descriptor.investorClass === InvestorClass.ACCREDITED ||
                          descriptor.investorClass === InvestorClass.QUALIFIED_PURCHASER,
    lockupDays: descriptor.lockupDays,
    maxInvestors: descriptor.maxInvestors,
    maxHoldingPercent: descriptor.maxHoldingPercent,
  };

  // Add jurisdiction restrictions
  if (descriptor.additionalJurisdictions.length > 0) {
    compliance.countryWhitelist = [
      descriptor.jurisdiction,
      ...descriptor.additionalJurisdictions,
    ];
    rationale.push(`Country whitelist: ${compliance.countryWhitelist.join(', ')}`);
  }

  // Always block sanctioned countries
  compliance.countryBlacklist = [
    ...SANCTIONED_COUNTRIES,
    ...descriptor.blockedJurisdictions,
  ];
  rationale.push(`Blocked countries: ${compliance.countryBlacklist.join(', ')}`);

  // Step 5: Investor class implications
  if (descriptor.investorClass === InvestorClass.INSTITUTIONAL) {
    compliance.requireKyc = true;
    compliance.requireAccreditation = true;
    rationale.push('INSTITUTIONAL class → KYC + accreditation required');
  }

  if (descriptor.investorClass === InvestorClass.QUALIFIED_PURCHASER) {
    compliance.requireKyc = true;
    compliance.requireAccreditation = true;
    // QP typically has lower max investors
    if (!compliance.maxInvestors || compliance.maxInvestors > 100) {
      compliance.maxInvestors = 100;
    }
    rationale.push('QUALIFIED_PURCHASER → max 100 investors');
  }

  return {
    standard,
    rightType,
    transferMode,
    compliance,
    decimals,
    isMultiToken,
    rationale,
  };
}

// ============================================================================
// ISSUE ASSET RESULT
// ============================================================================

/**
 * Result of issuing an asset - no ERC terminology exposed.
 */
export interface IssuedAsset {
  /** Unique asset identifier */
  id: string;

  /** Asset name */
  name: string;

  /** Asset type */
  assetType: AssetType;

  /** Primary jurisdiction */
  jurisdiction: string;

  /** Investor class */
  investorClass: InvestorClass;

  /** Liquidity profile */
  liquidityProfile: LiquidityProfile;

  /** Current state */
  state: 'DRAFT' | 'PENDING' | 'ACTIVE' | 'FROZEN' | 'RETIRED';

  /** Token supply information */
  supply: {
    total: string;
    circulating: string;
    decimals: number;
  };

  /** Compliance summary */
  compliance: {
    kycRequired: boolean;
    accreditationRequired: boolean;
    lockupDays: number;
    maxInvestors?: number;
    allowedCountries?: string[];
    blockedCountries: string[];
  };

  /** Contract address (once deployed) */
  contractAddress?: string;

  /** Creation timestamp */
  createdAt: string;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get human-readable description of an asset type.
 */
export function getAssetTypeDescription(assetType: AssetType): string {
  const descriptions: Record<AssetType, string> = {
    [AssetType.EQUITY]: 'Company shares or stock',
    [AssetType.DEBT]: 'Bonds, notes, or loan instruments',
    [AssetType.FUND]: 'Investment fund units',
    [AssetType.DERIVATIVE]: 'Financial derivatives',
    [AssetType.REAL_ESTATE]: 'Real property or land',
    [AssetType.COMMODITY]: 'Physical commodities',
    [AssetType.INFRASTRUCTURE]: 'Infrastructure assets',
    [AssetType.PRIVATE_EQUITY]: 'Private equity interests',
    [AssetType.VENTURE_CAPITAL]: 'Venture capital investments',
    [AssetType.ART_COLLECTIBLE]: 'Art or collectible items',
    [AssetType.INTELLECTUAL_PROPERTY]: 'Patents, copyrights, trademarks',
    [AssetType.DIGITAL_RIGHTS]: 'Digital licenses or subscriptions',
    [AssetType.CARBON_CREDIT]: 'Environmental carbon credits',
    [AssetType.REVENUE_SHARE]: 'Revenue participation rights',
    [AssetType.ROYALTY]: 'Royalty payment streams',
    [AssetType.INVOICE]: 'Invoice financing instruments',
    [AssetType.MEMBERSHIP]: 'Membership or access rights',
    [AssetType.TICKET]: 'Event or access tickets',
    [AssetType.CREDENTIAL]: 'Certifications or credentials',
  };
  return descriptions[assetType];
}

/**
 * Get regulatory considerations for a jurisdiction.
 */
export function getJurisdictionInfo(countryCode: string): {
  name: string;
  framework?: string;
  notes: string[];
} {
  const info: Record<string, { name: string; framework?: string; notes: string[] }> = {
    US: {
      name: 'United States',
      framework: 'SEC Regulations (Reg D, Reg S, Reg A+)',
      notes: [
        'Accredited investor verification required for Reg D',
        'OFAC sanctions screening required',
        'State Blue Sky laws may apply',
      ],
    },
    AE: {
      name: 'United Arab Emirates',
      framework: 'VARA (Virtual Assets Regulatory Authority)',
      notes: [
        'VARA license required for virtual asset activities',
        'KYC/AML requirements per CBUAE guidelines',
      ],
    },
    GB: {
      name: 'United Kingdom',
      framework: 'FCA Regulations',
      notes: [
        'FCA authorization may be required',
        'Consumer Duty obligations apply',
      ],
    },
    SG: {
      name: 'Singapore',
      framework: 'MAS Regulations',
      notes: [
        'MAS licensing requirements',
        'Accredited investor exemptions available',
      ],
    },
    CH: {
      name: 'Switzerland',
      framework: 'FINMA Guidelines',
      notes: [
        'DLT Act provides legal framework',
        'Self-regulatory organization membership',
      ],
    },
  };

  return info[countryCode] || {
    name: countryCode,
    notes: ['Consult local legal counsel for regulatory requirements'],
  };
}
