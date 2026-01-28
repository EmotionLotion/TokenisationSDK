/**
 * AssetPackRegistry - Pre-built asset configurations with lifecycle rules
 *
 * Asset Packs are complete configurations for common asset types including:
 * - Compliance rules
 * - Lifecycle state machine
 * - Required verifications
 * - Distribution schedules
 * - Governance settings
 *
 * @example
 * ```typescript
 * // Get a pre-built pack
 * const pack = AssetPackRegistry.get('PRIVATE_EQUITY_FUND');
 *
 * // Apply to asset creation
 * const asset = await service.issueAsset({
 *   ...pack.defaults,
 *   name: 'My PE Fund',
 * });
 * ```
 */

import {
  AssetType,
  InvestorClass,
  LiquidityProfile,
  FractionalizationType,
} from '../core/AssetAbstraction.js';
import { LifecycleState, TransferabilityMode } from '../core/types.js';
import { ValidationError, ErrorCode } from '../errors/index.js';
import { z } from 'zod';

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const LifecycleConditionSchema = z.object({
  type: z.enum(['APPROVAL', 'DOCUMENT', 'TIME', 'BALANCE', 'COMPLIANCE', 'CUSTOM']),
  approvals: z.array(z.object({ role: z.string(), count: z.number() })).optional(),
  documents: z.array(z.string()).optional(),
  timeCondition: z.string().optional(),
  balanceCondition: z.object({
    operator: z.enum(['GT', 'GTE', 'LT', 'LTE', 'EQ']),
    value: z.string(),
  }).optional(),
  customCondition: z.string().optional(),
});

const LifecycleActionSchema = z.object({
  type: z.enum(['EMIT_EVENT', 'NOTIFY', 'FREEZE', 'UNFREEZE', 'MINT', 'BURN', 'DISTRIBUTE', 'CUSTOM']),
  params: z.record(z.unknown()),
});

const LifecycleRuleSchema = z.object({
  from: z.union([z.nativeEnum(LifecycleState), z.literal('*')]),
  to: z.nativeEnum(LifecycleState),
  conditions: z.array(LifecycleConditionSchema),
  actions: z.array(LifecycleActionSchema),
  description: z.string().min(1, 'Description is required'),
});

const ComplianceRuleSchema = z.object({
  id: z.string().min(1, 'Rule ID is required'),
  name: z.string().min(1, 'Rule name is required'),
  type: z.enum(['KYC', 'ACCREDITATION', 'JURISDICTION', 'HOLDING_LIMIT', 'TRANSFER_LIMIT', 'LOCKUP', 'CUSTOM']),
  params: z.record(z.unknown()),
  severity: z.enum(['BLOCK', 'WARN', 'LOG']),
});

const DistributionScheduleSchema = z.object({
  type: z.enum(['DIVIDEND', 'INTEREST', 'ROYALTY', 'RENT', 'CUSTOM']),
  frequency: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUALLY', 'ON_DEMAND']),
  calculation: z.enum(['FIXED', 'PRO_RATA', 'TIERED', 'CUSTOM']),
  recordDateOffset: z.number().min(0),
});

const GovernanceSettingsSchema = z.object({
  votingEnabled: z.boolean(),
  votingStrategy: z.enum(['ONE_TOKEN_ONE_VOTE', 'QUADRATIC', 'WEIGHTED', 'ONE_PERSON_ONE_VOTE']),
  quorumPercent: z.number().min(0).max(100),
  approvalThresholdPercent: z.number().min(0).max(100),
  proposalTypes: z.array(z.string()),
  votingPeriodDays: z.number().min(1),
});

const RequiredVerificationSchema = z.object({
  type: z.string().min(1, 'Verification type is required'),
  description: z.string().min(1, 'Description is required'),
  allowedVerifiers: z.array(z.string()).min(1, 'At least one verifier is required'),
  mandatory: z.boolean(),
});

const MetadataSchemaFieldSchema = z.object({
  type: z.enum(['string', 'number', 'boolean', 'date', 'array', 'object']),
  required: z.boolean(),
  description: z.string(),
});

const AssetPackDefaultsSchema = z.object({
  assetType: z.nativeEnum(AssetType),
  investorClass: z.nativeEnum(InvestorClass),
  liquidityProfile: z.nativeEnum(LiquidityProfile),
  fractionalization: z.nativeEnum(FractionalizationType),
  lockupDays: z.number().min(0),
  maxInvestors: z.number().min(1).optional(),
  maxHoldingPercent: z.number().min(0).max(100).optional(),
  additionalJurisdictions: z.array(z.string()),
  blockedJurisdictions: z.array(z.string()),
});

const AssetPackSchema = z.object({
  id: z.string().min(1, 'Pack ID is required').regex(/^[A-Z0-9_]+$/, 'Pack ID must be uppercase alphanumeric with underscores'),
  name: z.string().min(1, 'Pack name is required'),
  description: z.string().min(1, 'Description is required'),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'Version must be semver format (x.y.z)'),
  defaults: AssetPackDefaultsSchema,
  lifecycleRules: z.array(LifecycleRuleSchema),
  complianceRules: z.array(ComplianceRuleSchema),
  requiredVerifications: z.array(RequiredVerificationSchema),
  distributionSchedule: DistributionScheduleSchema.optional(),
  governance: GovernanceSettingsSchema.optional(),
  metadataSchema: z.record(MetadataSchemaFieldSchema),
  tags: z.array(z.string()).min(1, 'At least one tag is required'),
});

// ============================================================================
// TYPES
// ============================================================================

/**
 * Lifecycle rule - defines transitions and guards
 */
export interface LifecycleRule {
  /** From state */
  from: LifecycleState | '*';
  /** To state */
  to: LifecycleState;
  /** Required conditions */
  conditions: LifecycleCondition[];
  /** Actions to execute on transition */
  actions: LifecycleAction[];
  /** Human-readable description */
  description: string;
}

export interface LifecycleCondition {
  type: 'APPROVAL' | 'DOCUMENT' | 'TIME' | 'BALANCE' | 'COMPLIANCE' | 'CUSTOM';
  /** Required approvals by role */
  approvals?: { role: string; count: number }[];
  /** Required document types */
  documents?: string[];
  /** Time condition (ISO duration or specific date) */
  timeCondition?: string;
  /** Balance condition */
  balanceCondition?: { operator: 'GT' | 'GTE' | 'LT' | 'LTE' | 'EQ'; value: string };
  /** Custom condition identifier */
  customCondition?: string;
}

export interface LifecycleAction {
  type: 'EMIT_EVENT' | 'NOTIFY' | 'FREEZE' | 'UNFREEZE' | 'MINT' | 'BURN' | 'DISTRIBUTE' | 'CUSTOM';
  params: Record<string, unknown>;
}

/**
 * Compliance rule
 */
export interface ComplianceRule {
  id: string;
  name: string;
  type: 'KYC' | 'ACCREDITATION' | 'JURISDICTION' | 'HOLDING_LIMIT' | 'TRANSFER_LIMIT' | 'LOCKUP' | 'CUSTOM';
  params: Record<string, unknown>;
  severity: 'BLOCK' | 'WARN' | 'LOG';
}

/**
 * Distribution schedule
 */
export interface DistributionSchedule {
  type: 'DIVIDEND' | 'INTEREST' | 'ROYALTY' | 'RENT' | 'CUSTOM';
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY' | 'ON_DEMAND';
  /** Calculation method */
  calculation: 'FIXED' | 'PRO_RATA' | 'TIERED' | 'CUSTOM';
  /** Record date offset in days before distribution */
  recordDateOffset: number;
}

/**
 * Governance settings
 */
export interface GovernanceSettings {
  /** Voting enabled */
  votingEnabled: boolean;
  /** Voting strategy */
  votingStrategy: 'ONE_TOKEN_ONE_VOTE' | 'QUADRATIC' | 'WEIGHTED' | 'ONE_PERSON_ONE_VOTE';
  /** Quorum percentage */
  quorumPercent: number;
  /** Approval threshold percentage */
  approvalThresholdPercent: number;
  /** Proposal types allowed */
  proposalTypes: string[];
  /** Voting period in days */
  votingPeriodDays: number;
}

/**
 * Required verification
 */
export interface RequiredVerification {
  type: string;
  description: string;
  /** Verifier roles that can provide this verification */
  allowedVerifiers: string[];
  /** Whether this is mandatory for activation */
  mandatory: boolean;
}

/**
 * Asset Pack - complete configuration for an asset type
 */
export interface AssetPack {
  /** Pack identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description */
  description: string;
  /** Version */
  version: string;

  /** Default asset descriptor values */
  defaults: {
    assetType: AssetType;
    investorClass: InvestorClass;
    liquidityProfile: LiquidityProfile;
    fractionalization: FractionalizationType;
    lockupDays: number;
    maxInvestors?: number;
    maxHoldingPercent?: number;
    additionalJurisdictions: string[];
    blockedJurisdictions: string[];
  };

  /** Lifecycle rules */
  lifecycleRules: LifecycleRule[];

  /** Compliance rules */
  complianceRules: ComplianceRule[];

  /** Required verifications */
  requiredVerifications: RequiredVerification[];

  /** Distribution schedule (if applicable) */
  distributionSchedule?: DistributionSchedule;

  /** Governance settings (if applicable) */
  governance?: GovernanceSettings;

  /** Metadata schema */
  metadataSchema: Record<string, {
    type: 'string' | 'number' | 'boolean' | 'date' | 'array' | 'object';
    required: boolean;
    description: string;
  }>;

  /** Tags for discovery */
  tags: string[];
}

// ============================================================================
// PRE-BUILT ASSET PACKS
// ============================================================================

/**
 * Private Equity Fund Pack
 */
const PRIVATE_EQUITY_FUND: AssetPack = {
  id: 'PRIVATE_EQUITY_FUND',
  name: 'Private Equity Fund',
  description: 'Tokenized limited partnership interests in a private equity fund',
  version: '1.0.0',

  defaults: {
    assetType: AssetType.PRIVATE_EQUITY,
    investorClass: InvestorClass.QUALIFIED_PURCHASER,
    liquidityProfile: LiquidityProfile.ILLIQUID,
    fractionalization: FractionalizationType.FIXED_SHARES,
    lockupDays: 365 * 3, // 3-year lockup typical for PE
    maxInvestors: 99,
    maxHoldingPercent: 25,
    additionalJurisdictions: [],
    blockedJurisdictions: ['KP', 'IR', 'CU', 'SY'],
  },

  lifecycleRules: [
    {
      from: LifecycleState.DRAFT,
      to: LifecycleState.PENDING_VERIFICATION,
      conditions: [
        { type: 'DOCUMENT', documents: ['PPM', 'SUBSCRIPTION_AGREEMENT'] },
      ],
      actions: [{ type: 'NOTIFY', params: { roles: ['COMPLIANCE'] } }],
      description: 'Submit for verification with PPM and subscription docs',
    },
    {
      from: LifecycleState.PENDING_VERIFICATION,
      to: LifecycleState.VERIFIED,
      conditions: [
        { type: 'APPROVAL', approvals: [{ role: 'COMPLIANCE', count: 1 }, { role: 'LEGAL', count: 1 }] },
      ],
      actions: [{ type: 'EMIT_EVENT', params: { event: 'FUND_VERIFIED' } }],
      description: 'Requires compliance and legal approval',
    },
    {
      from: LifecycleState.VERIFIED,
      to: LifecycleState.ACTIVE,
      conditions: [
        { type: 'BALANCE', balanceCondition: { operator: 'GTE', value: '1000000' } }, // Min $1M
      ],
      actions: [
        { type: 'EMIT_EVENT', params: { event: 'FUND_ACTIVATED' } },
        { type: 'NOTIFY', params: { roles: ['INVESTOR'] } },
      ],
      description: 'Activate when minimum commitment reached',
    },
    {
      from: LifecycleState.ACTIVE,
      to: LifecycleState.FROZEN,
      conditions: [
        { type: 'APPROVAL', approvals: [{ role: 'GP', count: 1 }] },
      ],
      actions: [{ type: 'FREEZE', params: {} }],
      description: 'GP can freeze fund for distributions',
    },
  ],

  complianceRules: [
    {
      id: 'QP_VERIFICATION',
      name: 'Qualified Purchaser Verification',
      type: 'ACCREDITATION',
      params: { requiredStatus: 'QUALIFIED_PURCHASER' },
      severity: 'BLOCK',
    },
    {
      id: 'MAX_INVESTORS',
      name: 'Maximum Investor Limit',
      type: 'HOLDING_LIMIT',
      params: { maxInvestors: 99 },
      severity: 'BLOCK',
    },
    {
      id: 'LOCKUP_3Y',
      name: '3-Year Lockup Period',
      type: 'LOCKUP',
      params: { lockupDays: 365 * 3 },
      severity: 'BLOCK',
    },
  ],

  requiredVerifications: [
    {
      type: 'PPM_REVIEW',
      description: 'Private Placement Memorandum legal review',
      allowedVerifiers: ['LEGAL'],
      mandatory: true,
    },
    {
      type: 'FUND_AUDIT',
      description: 'Annual fund audit',
      allowedVerifiers: ['AUDITOR'],
      mandatory: false,
    },
  ],

  distributionSchedule: {
    type: 'DIVIDEND',
    frequency: 'QUARTERLY',
    calculation: 'PRO_RATA',
    recordDateOffset: 5,
  },

  governance: {
    votingEnabled: true,
    votingStrategy: 'ONE_TOKEN_ONE_VOTE',
    quorumPercent: 50,
    approvalThresholdPercent: 66,
    proposalTypes: ['FUND_EXTENSION', 'GP_REMOVAL', 'AMENDMENT'],
    votingPeriodDays: 30,
  },

  metadataSchema: {
    fundName: { type: 'string', required: true, description: 'Legal fund name' },
    vintageYear: { type: 'number', required: true, description: 'Fund vintage year' },
    targetSize: { type: 'string', required: true, description: 'Target fund size' },
    managementFee: { type: 'number', required: true, description: 'Annual management fee %' },
    carriedInterest: { type: 'number', required: true, description: 'Carried interest %' },
    investmentPeriodYears: { type: 'number', required: true, description: 'Investment period' },
  },

  tags: ['private-equity', 'fund', 'institutional', 'reg-d'],
};

/**
 * Real Estate Investment Pack
 */
const REAL_ESTATE_INVESTMENT: AssetPack = {
  id: 'REAL_ESTATE_INVESTMENT',
  name: 'Real Estate Investment',
  description: 'Fractional ownership of commercial or residential real estate',
  version: '1.0.0',

  defaults: {
    assetType: AssetType.REAL_ESTATE,
    investorClass: InvestorClass.ACCREDITED,
    liquidityProfile: LiquidityProfile.SEMI_LIQUID,
    fractionalization: FractionalizationType.DIVISIBLE,
    lockupDays: 365,
    maxHoldingPercent: 10,
    additionalJurisdictions: ['US', 'GB', 'SG'],
    blockedJurisdictions: ['KP', 'IR', 'CU', 'SY'],
  },

  lifecycleRules: [
    {
      from: LifecycleState.DRAFT,
      to: LifecycleState.PENDING_VERIFICATION,
      conditions: [
        { type: 'DOCUMENT', documents: ['TITLE_DEED', 'VALUATION_REPORT', 'LEGAL_OPINION'] },
      ],
      actions: [{ type: 'NOTIFY', params: { roles: ['COMPLIANCE', 'LEGAL'] } }],
      description: 'Submit with title deed and valuation',
    },
    {
      from: LifecycleState.PENDING_VERIFICATION,
      to: LifecycleState.VERIFIED,
      conditions: [
        { type: 'APPROVAL', approvals: [{ role: 'COMPLIANCE', count: 1 }] },
        { type: 'DOCUMENT', documents: ['TITLE_DEED'] },
      ],
      actions: [{ type: 'EMIT_EVENT', params: { event: 'PROPERTY_VERIFIED' } }],
      description: 'Compliance verifies title and ownership',
    },
    {
      from: LifecycleState.VERIFIED,
      to: LifecycleState.ACTIVE,
      conditions: [],
      actions: [{ type: 'EMIT_EVENT', params: { event: 'PROPERTY_TOKENIZED' } }],
      description: 'Activate for investment',
    },
  ],

  complianceRules: [
    {
      id: 'KYC_REQUIRED',
      name: 'KYC Verification Required',
      type: 'KYC',
      params: {},
      severity: 'BLOCK',
    },
    {
      id: 'ACCREDITATION',
      name: 'Accredited Investor Status',
      type: 'ACCREDITATION',
      params: { requiredStatus: 'ACCREDITED' },
      severity: 'BLOCK',
    },
    {
      id: 'MAX_HOLDING',
      name: 'Maximum Holding Limit',
      type: 'HOLDING_LIMIT',
      params: { maxPercent: 10 },
      severity: 'BLOCK',
    },
  ],

  requiredVerifications: [
    {
      type: 'TITLE_VERIFICATION',
      description: 'Title deed verification',
      allowedVerifiers: ['LEGAL', 'TITLE_COMPANY'],
      mandatory: true,
    },
    {
      type: 'PROPERTY_VALUATION',
      description: 'Independent property valuation',
      allowedVerifiers: ['APPRAISER'],
      mandatory: true,
    },
    {
      type: 'INSURANCE_VERIFICATION',
      description: 'Property insurance verification',
      allowedVerifiers: ['COMPLIANCE'],
      mandatory: true,
    },
  ],

  distributionSchedule: {
    type: 'RENT',
    frequency: 'MONTHLY',
    calculation: 'PRO_RATA',
    recordDateOffset: 1,
  },

  governance: {
    votingEnabled: true,
    votingStrategy: 'ONE_TOKEN_ONE_VOTE',
    quorumPercent: 25,
    approvalThresholdPercent: 51,
    proposalTypes: ['MAJOR_REPAIR', 'SALE', 'REFINANCE', 'MANAGEMENT_CHANGE'],
    votingPeriodDays: 14,
  },

  metadataSchema: {
    propertyAddress: { type: 'string', required: true, description: 'Property address' },
    propertyType: { type: 'string', required: true, description: 'Property type' },
    areaSqm: { type: 'number', required: true, description: 'Property area in sqm' },
    valuationAmount: { type: 'string', required: true, description: 'Valuation amount' },
    valuationDate: { type: 'date', required: true, description: 'Valuation date' },
    titleDeedNumber: { type: 'string', required: true, description: 'Title deed number' },
    annualRentalYield: { type: 'number', required: false, description: 'Expected annual yield %' },
  },

  tags: ['real-estate', 'property', 'rental-income', 'accredited'],
};

/**
 * Carbon Credit Pack
 */
const CARBON_CREDIT: AssetPack = {
  id: 'CARBON_CREDIT',
  name: 'Carbon Credit',
  description: 'Verified carbon offset credits from certified projects',
  version: '1.0.0',

  defaults: {
    assetType: AssetType.CARBON_CREDIT,
    investorClass: InvestorClass.RETAIL,
    liquidityProfile: LiquidityProfile.LIQUID,
    fractionalization: FractionalizationType.DIVISIBLE,
    lockupDays: 0,
    additionalJurisdictions: [],
    blockedJurisdictions: ['KP', 'IR', 'CU', 'SY'],
  },

  lifecycleRules: [
    {
      from: LifecycleState.DRAFT,
      to: LifecycleState.PENDING_VERIFICATION,
      conditions: [
        { type: 'DOCUMENT', documents: ['PROJECT_DOCUMENTATION', 'VERIFICATION_REPORT'] },
      ],
      actions: [],
      description: 'Submit with project documentation',
    },
    {
      from: LifecycleState.PENDING_VERIFICATION,
      to: LifecycleState.VERIFIED,
      conditions: [
        { type: 'APPROVAL', approvals: [{ role: 'VERIFIER', count: 1 }] },
      ],
      actions: [{ type: 'EMIT_EVENT', params: { event: 'CREDITS_VERIFIED' } }],
      description: 'Third-party verification required',
    },
    {
      from: LifecycleState.VERIFIED,
      to: LifecycleState.ACTIVE,
      conditions: [],
      actions: [],
      description: 'Activate for trading',
    },
    {
      from: LifecycleState.ACTIVE,
      to: LifecycleState.REDEEMED,
      conditions: [
        { type: 'CUSTOM', customCondition: 'RETIREMENT_REQUESTED' },
      ],
      actions: [
        { type: 'BURN', params: {} },
        { type: 'EMIT_EVENT', params: { event: 'CREDITS_RETIRED' } },
      ],
      description: 'Retire credits (burn tokens)',
    },
  ],

  complianceRules: [
    {
      id: 'REGISTRY_LINK',
      name: 'Registry Linkage',
      type: 'CUSTOM',
      params: { requiresRegistryId: true },
      severity: 'BLOCK',
    },
  ],

  requiredVerifications: [
    {
      type: 'PROJECT_VERIFICATION',
      description: 'Carbon project verification by accredited body',
      allowedVerifiers: ['VERRA', 'GOLD_STANDARD', 'ACR', 'CAR'],
      mandatory: true,
    },
  ],

  metadataSchema: {
    projectId: { type: 'string', required: true, description: 'Project registry ID' },
    projectName: { type: 'string', required: true, description: 'Project name' },
    projectType: { type: 'string', required: true, description: 'Project type' },
    vintageYear: { type: 'number', required: true, description: 'Credit vintage year' },
    registry: { type: 'string', required: true, description: 'Registry (Verra, Gold Standard, etc.)' },
    methodology: { type: 'string', required: true, description: 'Carbon methodology' },
    country: { type: 'string', required: true, description: 'Project country' },
    tonnesCO2e: { type: 'number', required: true, description: 'Tonnes CO2 equivalent' },
  },

  tags: ['carbon', 'environment', 'esg', 'retail', 'liquid'],
};

/**
 * Corporate Bond Pack
 */
const CORPORATE_BOND: AssetPack = {
  id: 'CORPORATE_BOND',
  name: 'Corporate Bond',
  description: 'Tokenized corporate debt instrument with fixed interest payments',
  version: '1.0.0',

  defaults: {
    assetType: AssetType.DEBT,
    investorClass: InvestorClass.ACCREDITED,
    liquidityProfile: LiquidityProfile.SEMI_LIQUID,
    fractionalization: FractionalizationType.DIVISIBLE,
    lockupDays: 0,
    additionalJurisdictions: [],
    blockedJurisdictions: ['KP', 'IR', 'CU', 'SY'],
  },

  lifecycleRules: [
    {
      from: LifecycleState.DRAFT,
      to: LifecycleState.PENDING_VERIFICATION,
      conditions: [
        { type: 'DOCUMENT', documents: ['INDENTURE', 'PROSPECTUS', 'RATING_REPORT'] },
      ],
      actions: [],
      description: 'Submit with bond documentation',
    },
    {
      from: LifecycleState.PENDING_VERIFICATION,
      to: LifecycleState.VERIFIED,
      conditions: [
        { type: 'APPROVAL', approvals: [{ role: 'LEGAL', count: 1 }, { role: 'COMPLIANCE', count: 1 }] },
      ],
      actions: [],
      description: 'Legal and compliance review',
    },
    {
      from: LifecycleState.VERIFIED,
      to: LifecycleState.ACTIVE,
      conditions: [],
      actions: [{ type: 'EMIT_EVENT', params: { event: 'BOND_ISSUED' } }],
      description: 'Bond issuance',
    },
    {
      from: LifecycleState.ACTIVE,
      to: LifecycleState.REDEEMED,
      conditions: [
        { type: 'TIME', timeCondition: 'MATURITY_DATE' },
      ],
      actions: [
        { type: 'DISTRIBUTE', params: { type: 'PRINCIPAL' } },
        { type: 'BURN', params: {} },
      ],
      description: 'Maturity and principal redemption',
    },
  ],

  complianceRules: [
    {
      id: 'KYC_REQUIRED',
      name: 'KYC Required',
      type: 'KYC',
      params: {},
      severity: 'BLOCK',
    },
    {
      id: 'ACCREDITATION',
      name: 'Accredited Investor',
      type: 'ACCREDITATION',
      params: {},
      severity: 'BLOCK',
    },
  ],

  requiredVerifications: [
    {
      type: 'LEGAL_REVIEW',
      description: 'Bond indenture legal review',
      allowedVerifiers: ['LEGAL'],
      mandatory: true,
    },
    {
      type: 'CREDIT_RATING',
      description: 'Credit rating from agency',
      allowedVerifiers: ['RATING_AGENCY'],
      mandatory: false,
    },
  ],

  distributionSchedule: {
    type: 'INTEREST',
    frequency: 'QUARTERLY',
    calculation: 'FIXED',
    recordDateOffset: 5,
  },

  metadataSchema: {
    issuerName: { type: 'string', required: true, description: 'Bond issuer' },
    couponRate: { type: 'number', required: true, description: 'Annual coupon rate %' },
    maturityDate: { type: 'date', required: true, description: 'Maturity date' },
    faceValue: { type: 'string', required: true, description: 'Face value per bond' },
    creditRating: { type: 'string', required: false, description: 'Credit rating' },
    isin: { type: 'string', required: false, description: 'ISIN code' },
  },

  tags: ['bond', 'debt', 'fixed-income', 'accredited'],
};

/**
 * Art/Collectible Pack
 */
const ART_COLLECTIBLE: AssetPack = {
  id: 'ART_COLLECTIBLE',
  name: 'Art & Collectible',
  description: 'Fractional ownership of fine art or collectibles',
  version: '1.0.0',

  defaults: {
    assetType: AssetType.ART_COLLECTIBLE,
    investorClass: InvestorClass.RETAIL,
    liquidityProfile: LiquidityProfile.ILLIQUID,
    fractionalization: FractionalizationType.FIXED_SHARES,
    lockupDays: 180,
    additionalJurisdictions: [],
    blockedJurisdictions: ['KP', 'IR', 'CU', 'SY'],
  },

  lifecycleRules: [
    {
      from: LifecycleState.DRAFT,
      to: LifecycleState.PENDING_VERIFICATION,
      conditions: [
        { type: 'DOCUMENT', documents: ['PROVENANCE', 'AUTHENTICATION', 'INSURANCE'] },
      ],
      actions: [],
      description: 'Submit with provenance documentation',
    },
    {
      from: LifecycleState.PENDING_VERIFICATION,
      to: LifecycleState.VERIFIED,
      conditions: [
        { type: 'APPROVAL', approvals: [{ role: 'AUTHENTICATOR', count: 1 }] },
      ],
      actions: [],
      description: 'Authentication verification',
    },
    {
      from: LifecycleState.VERIFIED,
      to: LifecycleState.ACTIVE,
      conditions: [],
      actions: [],
      description: 'Activate for fractional ownership',
    },
  ],

  complianceRules: [
    {
      id: 'KYC_REQUIRED',
      name: 'KYC Required',
      type: 'KYC',
      params: {},
      severity: 'BLOCK',
    },
  ],

  requiredVerifications: [
    {
      type: 'AUTHENTICATION',
      description: 'Artwork authentication',
      allowedVerifiers: ['AUTHENTICATOR', 'AUCTION_HOUSE'],
      mandatory: true,
    },
    {
      type: 'PROVENANCE',
      description: 'Provenance documentation',
      allowedVerifiers: ['COMPLIANCE'],
      mandatory: true,
    },
    {
      type: 'CUSTODY',
      description: 'Secure custody arrangement',
      allowedVerifiers: ['CUSTODIAN'],
      mandatory: true,
    },
  ],

  governance: {
    votingEnabled: true,
    votingStrategy: 'ONE_TOKEN_ONE_VOTE',
    quorumPercent: 50,
    approvalThresholdPercent: 75,
    proposalTypes: ['SALE', 'LOAN_FOR_EXHIBITION', 'INSURANCE_CHANGE'],
    votingPeriodDays: 21,
  },

  metadataSchema: {
    title: { type: 'string', required: true, description: 'Artwork title' },
    artist: { type: 'string', required: true, description: 'Artist name' },
    year: { type: 'number', required: false, description: 'Year created' },
    medium: { type: 'string', required: true, description: 'Medium/materials' },
    dimensions: { type: 'string', required: true, description: 'Dimensions' },
    condition: { type: 'string', required: true, description: 'Condition report' },
    custodian: { type: 'string', required: true, description: 'Current custodian' },
    insuranceValue: { type: 'string', required: true, description: 'Insured value' },
  },

  tags: ['art', 'collectible', 'fractional', 'retail'],
};

// ============================================================================
// REGISTRY
// ============================================================================

/**
 * Asset Pack Registry
 */
export class AssetPackRegistry {
  private static packs: Map<string, AssetPack> = new Map([
    ['PRIVATE_EQUITY_FUND', PRIVATE_EQUITY_FUND],
    ['REAL_ESTATE_INVESTMENT', REAL_ESTATE_INVESTMENT],
    ['CARBON_CREDIT', CARBON_CREDIT],
    ['CORPORATE_BOND', CORPORATE_BOND],
    ['ART_COLLECTIBLE', ART_COLLECTIBLE],
  ]);

  /**
   * Get a pack by ID
   *
   * @param packId - The pack identifier
   * @throws ValidationError if packId is empty
   */
  static get(packId: string): AssetPack | undefined {
    if (typeof packId !== 'string' || packId.trim().length === 0) {
      throw new ValidationError(
        'Pack ID must be a non-empty string',
        { field: 'packId', constraints: { type: 'string', minLength: '1' } }
      );
    }
    return this.packs.get(packId);
  }

  /**
   * List all available packs
   */
  static list(): AssetPack[] {
    return Array.from(this.packs.values());
  }

  /**
   * Search packs by tags
   *
   * @param tags - Array of tags to search for
   * @throws ValidationError if tags is empty or invalid
   */
  static searchByTags(tags: string[]): AssetPack[] {
    if (!Array.isArray(tags) || tags.length === 0) {
      throw new ValidationError(
        'Tags array must be non-empty',
        { field: 'tags', constraints: { minItems: '1' } }
      );
    }

    for (const tag of tags) {
      if (typeof tag !== 'string' || tag.trim().length === 0) {
        throw new ValidationError(
          'Each tag must be a non-empty string',
          { field: 'tags', constraints: { type: 'string' } }
        );
      }
    }

    return this.list().filter(pack =>
      tags.some(tag => pack.tags.includes(tag.toLowerCase()))
    );
  }

  /**
   * Search packs by asset type
   */
  static searchByAssetType(assetType: AssetType): AssetPack[] {
    return this.list().filter(pack =>
      pack.defaults.assetType === assetType
    );
  }

  /**
   * Register a custom pack
   *
   * @param pack - Asset pack configuration to register
   * @throws ValidationError if pack is invalid
   */
  static register(pack: AssetPack): void {
    const result = AssetPackSchema.safeParse(pack);
    if (!result.success) {
      const firstError = result.error.errors[0];
      throw new ValidationError(
        `Invalid asset pack: ${firstError.message}`,
        {
          field: firstError.path.join('.'),
          constraints: { zodError: firstError.code },
        }
      );
    }

    if (this.packs.has(pack.id)) {
      throw new ValidationError(
        `Asset pack '${pack.id}' already exists. Use a unique ID.`,
        { field: 'id', constraints: { unique: 'true' } }
      );
    }

    this.packs.set(pack.id, pack);
  }

  /**
   * Validate metadata against pack schema
   *
   * @param packId - The pack identifier
   * @param metadata - Metadata to validate
   * @throws ValidationError if packId is invalid
   */
  static validateMetadata(
    packId: string,
    metadata: Record<string, unknown>
  ): { valid: boolean; errors: Array<{ field: string; message: string }> } {
    if (typeof packId !== 'string' || packId.trim().length === 0) {
      throw new ValidationError(
        'Pack ID must be a non-empty string',
        { field: 'packId', constraints: { type: 'string', minLength: '1' } }
      );
    }

    const pack = this.get(packId);
    if (!pack) {
      return { valid: false, errors: [{ field: 'packId', message: 'Pack not found' }] };
    }

    if (!metadata || typeof metadata !== 'object') {
      return { valid: false, errors: [{ field: 'metadata', message: 'Metadata must be an object' }] };
    }

    const errors: Array<{ field: string; message: string }> = [];
    for (const [field, schema] of Object.entries(pack.metadataSchema)) {
      if (schema.required && !(field in metadata)) {
        errors.push({ field, message: `Missing required field: ${field}` });
        continue;
      }

      if (field in metadata) {
        const value = metadata[field];
        const expectedType = schema.type;

        let actualType: string;
        if (value === null || value === undefined) {
          actualType = 'null';
        } else if (Array.isArray(value)) {
          actualType = 'array';
        } else if (value instanceof Date) {
          actualType = 'date';
        } else {
          actualType = typeof value;
        }

        if (expectedType === 'date' && actualType === 'string') {
          // Allow ISO date strings
          if (isNaN(Date.parse(value as string))) {
            errors.push({ field, message: `Invalid date format for field: ${field}` });
          }
        } else if (actualType !== expectedType) {
          errors.push({ field, message: `Invalid type for ${field}: expected ${expectedType}, got ${actualType}` });
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }
}

// Import new jurisdiction-specific packs
import { dubaiRealEstatePack, type AssetPackConfig } from './dubai-real-estate.pack.js';
import { usSecurities506cPack, usSecurities506bPack } from './us-securities.pack.js';

// Import hotel reservation pack
import { HOTEL_RESERVATION_PACK } from './HotelReservation.js';

// Import car rental pack
import { CAR_RENTAL_PACK } from './CarRental.js';

// Import concert ticket pack
import { CONCERT_TICKET_PACK } from './ConcertTicket.js';

// Register jurisdiction-specific packs
AssetPackRegistry.register(dubaiRealEstatePack as AssetPack);
AssetPackRegistry.register(usSecurities506cPack as AssetPack);
AssetPackRegistry.register(usSecurities506bPack as AssetPack);
AssetPackRegistry.register(HOTEL_RESERVATION_PACK as AssetPack);
AssetPackRegistry.register(CAR_RENTAL_PACK as AssetPack);
AssetPackRegistry.register(CONCERT_TICKET_PACK as AssetPack);

// Export individual packs for direct access
export {
  PRIVATE_EQUITY_FUND,
  REAL_ESTATE_INVESTMENT,
  CARBON_CREDIT,
  CORPORATE_BOND,
  ART_COLLECTIBLE,
  dubaiRealEstatePack,
  usSecurities506cPack,
  usSecurities506bPack,
  HOTEL_RESERVATION_PACK,
  CAR_RENTAL_PACK,
  CONCERT_TICKET_PACK,
};

// Export types
export type { AssetPackConfig };
