/**
 * Asset Model
 *
 * The core asset representation with full validation.
 * Assets can represent any tokenizable right or state.
 */

import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import {
  RightType,
  LifecycleState,
  TransferabilityMode,
  JurisdictionSchema,
  ValidityPeriodSchema,
  TransferabilityRulesSchema,
  RightModelSchema,
  type RightModel,
  type Jurisdiction,
  type ValidityPeriod,
  type TransferabilityRules,
} from '../core/types.js';
import { ValidationError } from '../errors/index.js';

// ============================================================================
// ASSET TYPE-SPECIFIC METADATA SCHEMAS
// ============================================================================

/**
 * Generic real-estate catch-all (detailed schema lives in @tokenisation/realestate)
 */
export const RealEstateMetadataSchema = z.object({
  assetType: z.literal('REAL_ESTATE'),
}).passthrough();

export type RealEstateMetadata = z.infer<typeof RealEstateMetadataSchema>;

/**
 * Ticket/Access specific metadata
 */
export const TicketMetadataSchema = z.object({
  assetType: z.literal('TICKET'),
  eventName: z.string(),
  eventDate: z.string().datetime(),
  venue: z.string(),
  seatInfo: z
    .object({
      section: z.string().optional(),
      row: z.string().optional(),
      seat: z.string().optional(),
    })
    .optional(),
  ticketTier: z.enum(['GENERAL', 'VIP', 'PREMIUM', 'BACKSTAGE']).optional(),
  maxResalePrice: z.string().optional(), // BigNumber as string
  transferWindowEnd: z.string().datetime().optional(),
});

export type TicketMetadata = z.infer<typeof TicketMetadataSchema>;

/**
 * Behavior/Loyalty score metadata
 */
export const BehaviorMetadataSchema = z.object({
  assetType: z.literal('BEHAVIOR'),
  scoreType: z.enum(['LOYALTY_POINTS', 'DRIVING_SCORE', 'REPUTATION', 'CREDIT_SCORE']),
  currentScore: z.number(),
  maxScore: z.number(),
  lastUpdateSource: z.string(),
  historyCount: z.number().nonnegative(),
  decayRate: z.number().min(0).max(1).optional(), // Score decay per period
});

export type BehaviorMetadata = z.infer<typeof BehaviorMetadataSchema>;

/**
 * Verification/Certificate metadata
 */
export const VerificationMetadataSchema = z.object({
  assetType: z.literal('VERIFICATION'),
  certificateType: z.enum([
    'CARBON_CREDIT',
    'EDUCATIONAL_DEGREE',
    'PROFESSIONAL_LICENSE',
    'SUPPLY_CHAIN_PROOF',
    'PATENT',
    'COPYRIGHT',
  ]),
  issuingAuthority: z.string(),
  certificateNumber: z.string(),
  issueDate: z.string().datetime(),
  expiryDate: z.string().datetime().optional(),
  verificationProof: z.string().optional(), // IPFS hash or URL
  carbonTonnes: z.number().positive().optional(), // For carbon credits
  retiredAmount: z.number().nonnegative().optional(),
});

export type VerificationMetadata = z.infer<typeof VerificationMetadataSchema>;

/**
 * Physical asset metadata (e.g., Ahoy Comet Bike)
 */
export const PhysicalAssetMetadataSchema = z.object({
  assetType: z.literal('PHYSICAL'),
  category: z.enum(['VEHICLE', 'EQUIPMENT', 'ART', 'COLLECTIBLE', 'OTHER']),
  manufacturer: z.string(),
  model: z.string(),
  serialNumber: z.string().optional(),
  manufactureDate: z.string().datetime().optional(),
  warrantyExpiry: z.string().datetime().optional(),
  condition: z.enum(['NEW', 'LIKE_NEW', 'GOOD', 'FAIR', 'POOR']).optional(),
  physicalLocation: z
    .object({
      latitude: z.number(),
      longitude: z.number(),
    })
    .optional(),
});

export type PhysicalAssetMetadata = z.infer<typeof PhysicalAssetMetadataSchema>;

/**
 * Generic/Custom asset metadata for extensibility
 */
export const CustomMetadataSchema = z.object({
  assetType: z.string(),
}).passthrough();

export type CustomMetadata = z.infer<typeof CustomMetadataSchema>;

/**
 * Union of all asset metadata types (built-in + custom)
 * Using union with passthrough to allow custom types
 */
export const AssetMetadataSchema = z.union([
  RealEstateMetadataSchema,
  TicketMetadataSchema,
  BehaviorMetadataSchema,
  VerificationMetadataSchema,
  PhysicalAssetMetadataSchema,
  CustomMetadataSchema,
]);

export type AssetMetadata = z.infer<typeof AssetMetadataSchema>;

// ============================================================================
// FULL ASSET SCHEMA
// ============================================================================

/**
 * Full Asset schema extending RightModel with typed metadata
 */
export const AssetSchema = RightModelSchema.extend({
  /** Typed metadata based on asset type */
  typedMetadata: AssetMetadataSchema.optional(),

  /** Token information once minted */
  tokenInfo: z
    .object({
      contractAddress: z.string(),
      tokenId: z.string().optional(),
      chainId: z.number(),
      tokenStandard: z.enum(['ERC20', 'ERC721', 'ERC1155']),
      totalSupply: z.string(),
      decimals: z.number().min(0).max(18).optional(),
    })
    .optional(),

  /** Evidence references */
  evidenceIds: z.array(z.string().uuid()).default([]),

  /** Party references */
  issuerId: z.string().uuid(),
  currentHolders: z
    .array(
      z.object({
        partyId: z.string().uuid(),
        amount: z.string(), // BigNumber as string
        acquiredAt: z.string().datetime(),
      })
    )
    .default([]),
});

export type Asset = z.infer<typeof AssetSchema>;

// ============================================================================
// ASSET FACTORY
// ============================================================================

/**
 * Parameters for creating a new asset
 */
export interface CreateAssetParams {
  name: string;
  description?: string;
  rightType: RightType;
  jurisdiction: Jurisdiction;
  validityPeriod?: Partial<ValidityPeriod>;
  transferabilityRules?: Partial<TransferabilityRules>;
  metadata?: Record<string, unknown>;
  typedMetadata?: AssetMetadata;
  issuerId: string;
}

/**
 * Create a new asset with defaults
 */
export function createAsset(params: CreateAssetParams): Asset {
  const now = new Date().toISOString();

  const asset: Asset = {
    id: uuidv4(),
    name: params.name,
    description: params.description,
    rightType: params.rightType,
    state: LifecycleState.DRAFT,
    jurisdiction: params.jurisdiction,
    validityPeriod: {
      isPerpetual: true,
      ...params.validityPeriod,
    },
    transferabilityRules: {
      mode: TransferabilityMode.COMPLIANCE_GATED,
      lockupPeriodSeconds: 0,
      requireKyc: true,
      ...params.transferabilityRules,
    },
    metadata: params.metadata || {},
    typedMetadata: params.typedMetadata,
    createdAt: now,
    updatedAt: now,
    version: 0,
    evidenceIds: [],
    issuerId: params.issuerId,
    currentHolders: [],
  };

  // Validate the asset
  const result = AssetSchema.safeParse(asset);
  if (!result.success) {
    throw new ValidationError(`Invalid asset: ${result.error.message}`, {
      field: 'asset',
      constraints: result.error.flatten().fieldErrors as Record<string, string>,
    });
  }

  return result.data;
}

/**
 * Validate an asset object
 */
export function validateAsset(asset: unknown): asset is Asset {
  return AssetSchema.safeParse(asset).success;
}

/**
 * Parse and validate asset data
 */
export function parseAsset(data: unknown): Asset {
  return AssetSchema.parse(data);
}

/**
 * Safely parse asset data
 */
export function safeParseAsset(data: unknown): z.SafeParseReturnType<unknown, Asset> {
  return AssetSchema.safeParse(data);
}
