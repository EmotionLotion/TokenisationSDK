/**
 * Dubai Real Estate Asset Pack
 *
 * Pre-configured asset pack for tokenizing Dubai real estate,
 * compliant with UAE VARA regulations and DLD requirements.
 *
 * Features:
 * - DLD ownership verification integration
 * - VARA-compliant token structure
 * - RERA valuation requirements
 * - UAE investor restrictions
 */

import { AssetType, InvestorClass, LiquidityProfile, FractionalizationType } from '../core/AssetAbstraction.js';
import { LifecycleState } from '../core/types.js';
import type { AssetPack, LifecycleRule, ComplianceRule, RequiredVerification, DistributionSchedule, GovernanceSettings } from './AssetPackRegistry.js';

/**
 * Asset pack configuration with adapter bindings
 */
export interface AssetPackConfig extends AssetPack {
  /** Jurisdiction code (ISO 3166-1 alpha-2) */
  jurisdiction: string;
  /** Server-side jurisdiction provider name */
  jurisdictionProvider: string;
  /** Server-side custody provider name */
  custodyProvider: string;
  /** Server-side KYC provider name */
  kycProvider: string;
  /** Smart contract to deploy */
  tokenContract: 'RealToken' | 'ComplianceToken' | 'ComplianceMultiToken';
  /** Compliance modules to attach */
  complianceModules: string[];
}

/**
 * Dubai Real Estate Pack Lifecycle Rules
 */
const lifecycleRules: LifecycleRule[] = [
  {
    from: LifecycleState.DRAFT,
    to: LifecycleState.PENDING_VERIFICATION,
    conditions: [
      {
        type: 'DOCUMENT',
        documents: ['TITLE_DEED', 'VALUATION_REPORT', 'NOC', 'LEGAL_OPINION'],
      },
    ],
    actions: [
      { type: 'NOTIFY', params: { roles: ['COMPLIANCE', 'LEGAL'] } },
      { type: 'EMIT_EVENT', params: { event: 'VERIFICATION_REQUESTED' } },
    ],
    description: 'Submit property with DLD title deed and RERA valuation',
  },
  {
    from: LifecycleState.PENDING_VERIFICATION,
    to: LifecycleState.VERIFIED,
    conditions: [
      {
        type: 'APPROVAL',
        approvals: [
          { role: 'COMPLIANCE', count: 1 },
          { role: 'LEGAL', count: 1 },
        ],
      },
      { type: 'CUSTOM', customCondition: 'DLD_OWNERSHIP_VERIFIED' },
    ],
    actions: [
      { type: 'EMIT_EVENT', params: { event: 'PROPERTY_VERIFIED' } },
    ],
    description: 'DLD ownership verification and compliance approval required',
  },
  {
    from: LifecycleState.VERIFIED,
    to: LifecycleState.ACTIVE,
    conditions: [
      { type: 'CUSTOM', customCondition: 'DLD_TOKENIZATION_REGISTERED' },
    ],
    actions: [
      { type: 'EMIT_EVENT', params: { event: 'PROPERTY_TOKENIZED' } },
      { type: 'NOTIFY', params: { roles: ['INVESTOR'] } },
    ],
    description: 'Activate after DLD tokenization registration',
  },
  {
    from: LifecycleState.ACTIVE,
    to: LifecycleState.FROZEN,
    conditions: [
      { type: 'APPROVAL', approvals: [{ role: 'ADMIN', count: 1 }] },
    ],
    actions: [
      { type: 'FREEZE', params: {} },
      { type: 'NOTIFY', params: { roles: ['INVESTOR'] } },
    ],
    description: 'Freeze for distributions or regulatory action',
  },
  {
    from: LifecycleState.FROZEN,
    to: LifecycleState.ACTIVE,
    conditions: [
      { type: 'APPROVAL', approvals: [{ role: 'ADMIN', count: 1 }] },
    ],
    actions: [
      { type: 'UNFREEZE', params: {} },
    ],
    description: 'Unfreeze to resume trading',
  },
  {
    from: '*',
    to: LifecycleState.REDEEMED,
    conditions: [
      { type: 'APPROVAL', approvals: [{ role: 'ADMIN', count: 1 }, { role: 'LEGAL', count: 1 }] },
      { type: 'CUSTOM', customCondition: 'PROPERTY_SOLD' },
    ],
    actions: [
      { type: 'DISTRIBUTE', params: { type: 'PRINCIPAL' } },
      { type: 'BURN', params: {} },
      { type: 'EMIT_EVENT', params: { event: 'PROPERTY_REDEEMED' } },
    ],
    description: 'Redeem tokens on property sale',
  },
];

/**
 * Dubai Real Estate Compliance Rules
 */
const complianceRules: ComplianceRule[] = [
  {
    id: 'UAE_KYC',
    name: 'UAE KYC Requirements',
    type: 'KYC',
    params: {
      requiredLevel: 'standard',
      allowedDocuments: ['emirates_id', 'passport', 'residence_visa'],
    },
    severity: 'BLOCK',
  },
  {
    id: 'INVESTOR_WHITELIST',
    name: 'Investor Whitelist',
    type: 'JURISDICTION',
    params: {
      allowedCountries: ['AE', 'SA', 'QA', 'KW', 'BH', 'OM', 'GB', 'US', 'SG'],
      blockedCountries: ['KP', 'IR', 'CU', 'SY', 'RU'],
    },
    severity: 'BLOCK',
  },
  {
    id: 'MAX_HOLDING',
    name: 'Maximum Holding Limit',
    type: 'HOLDING_LIMIT',
    params: {
      maxPercent: 10,
      exemptRoles: ['INSTITUTIONAL'],
    },
    severity: 'BLOCK',
  },
  {
    id: 'MIN_INVESTMENT',
    name: 'Minimum Investment',
    type: 'TRANSFER_LIMIT',
    params: {
      minAmount: '500', // AED
      currency: 'AED',
    },
    severity: 'BLOCK',
  },
  {
    id: 'LOCKUP_PERIOD',
    name: 'Initial Lockup Period',
    type: 'LOCKUP',
    params: {
      lockupDays: 90,
      exemptTransfers: ['REDEMPTION', 'FORCED_TRANSFER'],
    },
    severity: 'BLOCK',
  },
];

/**
 * Required Verifications for Dubai Real Estate
 */
const requiredVerifications: RequiredVerification[] = [
  {
    type: 'DLD_TITLE_VERIFICATION',
    description: 'Dubai Land Department title deed verification',
    allowedVerifiers: ['DLD', 'LICENSED_NOTARY'],
    mandatory: true,
  },
  {
    type: 'RERA_VALUATION',
    description: 'RERA-certified property valuation',
    allowedVerifiers: ['RERA_CERTIFIED_VALUER'],
    mandatory: true,
  },
  {
    type: 'LEGAL_OPINION',
    description: 'Legal opinion on tokenization structure',
    allowedVerifiers: ['LEGAL'],
    mandatory: true,
  },
  {
    type: 'NOC_VERIFICATION',
    description: 'No Objection Certificate from developer (if applicable)',
    allowedVerifiers: ['DEVELOPER', 'COMPLIANCE'],
    mandatory: false,
  },
  {
    type: 'INSURANCE_VERIFICATION',
    description: 'Property insurance verification',
    allowedVerifiers: ['COMPLIANCE'],
    mandatory: true,
  },
];

/**
 * Distribution Schedule for Dubai Real Estate
 */
const distributionSchedule: DistributionSchedule = {
  type: 'RENT',
  frequency: 'MONTHLY',
  calculation: 'PRO_RATA',
  recordDateOffset: 1, // 1 day before distribution
};

/**
 * Governance Settings for Dubai Real Estate
 */
const governanceSettings: GovernanceSettings = {
  votingEnabled: true,
  votingStrategy: 'ONE_TOKEN_ONE_VOTE',
  quorumPercent: 25,
  approvalThresholdPercent: 51,
  proposalTypes: [
    'MAJOR_REPAIR',
    'PROPERTY_SALE',
    'REFINANCE',
    'MANAGEMENT_CHANGE',
    'TENANT_APPROVAL',
  ],
  votingPeriodDays: 14,
};

/**
 * Dubai Real Estate Asset Pack Configuration
 */
export const dubaiRealEstatePack: AssetPackConfig = {
  id: 'DUBAI_REAL_ESTATE',
  name: 'Dubai Real Estate',
  description: 'Tokenized real estate in Dubai with DLD integration and VARA compliance',
  version: '1.0.0',

  // Adapter configuration
  jurisdiction: 'AE',
  jurisdictionProvider: 'dld',
  custodyProvider: 'fireblocks',
  kycProvider: 'onfido',
  tokenContract: 'RealToken',
  complianceModules: [
    'whitelist',
    'country-restrictions',
    'max-balance',
    'hold-time',
  ],

  // Asset defaults
  defaults: {
    assetType: AssetType.REAL_ESTATE,
    investorClass: InvestorClass.RETAIL,
    liquidityProfile: LiquidityProfile.SEMI_LIQUID,
    fractionalization: FractionalizationType.DIVISIBLE,
    lockupDays: 90,
    maxHoldingPercent: 10,
    additionalJurisdictions: ['SA', 'QA', 'KW', 'BH', 'OM', 'GB', 'US', 'SG'],
    blockedJurisdictions: ['KP', 'IR', 'CU', 'SY', 'RU'],
  },

  lifecycleRules,
  complianceRules,
  requiredVerifications,
  distributionSchedule,
  governance: governanceSettings,

  metadataSchema: {
    titleDeedNumber: {
      type: 'string',
      required: true,
      description: 'DLD Title Deed Number',
    },
    propertyAddress: {
      type: 'string',
      required: true,
      description: 'Full property address in Dubai',
    },
    propertyType: {
      type: 'string',
      required: true,
      description: 'Property type (apartment, villa, commercial, etc.)',
    },
    area: {
      type: 'string',
      required: true,
      description: 'Dubai area/community name',
    },
    areaSqft: {
      type: 'number',
      required: true,
      description: 'Property area in square feet',
    },
    valuationAmount: {
      type: 'string',
      required: true,
      description: 'RERA-certified valuation amount in AED',
    },
    valuationDate: {
      type: 'date',
      required: true,
      description: 'Date of RERA valuation',
    },
    expectedYield: {
      type: 'number',
      required: false,
      description: 'Expected annual rental yield (%)',
    },
    developer: {
      type: 'string',
      required: false,
      description: 'Property developer name',
    },
    completionDate: {
      type: 'date',
      required: false,
      description: 'Property completion date (for off-plan)',
    },
  },

  tags: ['real-estate', 'dubai', 'uae', 'vara', 'rental-income', 'property'],
};

export default dubaiRealEstatePack;
