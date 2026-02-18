/**
 * Unified Real Estate Asset Pack
 *
 * Pre-configured asset packs for tokenizing real estate across jurisdictions.
 * Follows the spread operator inheritance pattern (like US Securities).
 *
 * Architecture:
 * - baseRealEstateConfig: Shared rules, verifications, governance
 * - dubaiRealEstatePack: UAE VARA + DLD integration
 * - adgmRealEstatePack: ADGM (Abu Dhabi) variant
 * - genericRealEstatePack: Jurisdiction-agnostic baseline
 * - createRealEstatePack(): Factory for custom jurisdictions
 */

import { AssetType, InvestorClass, LiquidityProfile, FractionalizationType } from '../core/AssetAbstraction.js';
import { LifecycleState } from '../core/types.js';
import type { AssetPack, LifecycleRule, ComplianceRule, RequiredVerification, DistributionSchedule, GovernanceSettings } from './AssetPackRegistry.js';

// ============================================================================
// TYPES
// ============================================================================

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
 * Options for creating a custom real estate pack
 */
export interface CreateRealEstatePackOptions {
  /** Unique pack identifier */
  id: string;
  /** Display name */
  name: string;
  /** Description */
  description: string;
  /** Jurisdiction code (ISO 3166-1 alpha-2) */
  jurisdiction: string;
  /** Jurisdiction provider name */
  jurisdictionProvider: string;
  /** Custody provider name (default: 'fireblocks') */
  custodyProvider?: string;
  /** KYC provider name (default: 'onfido') */
  kycProvider?: string;
  /** Additional compliance rules to merge */
  additionalComplianceRules?: ComplianceRule[];
  /** Additional verifications to merge */
  additionalVerifications?: RequiredVerification[];
  /** Additional lifecycle rules to merge */
  additionalLifecycleRules?: LifecycleRule[];
  /** Blocked jurisdictions (appended to base) */
  blockedJurisdictions?: string[];
  /** Allowed jurisdictions (overrides base if provided) */
  allowedJurisdictions?: string[];
  /** Additional metadata schema fields */
  additionalMetadataSchema?: Record<string, { type: 'string' | 'number' | 'boolean' | 'date' | 'array' | 'object'; required: boolean; description: string }>;
  /** Tags (appended to base) */
  tags?: string[];
  /** Partial overrides for any pack fields */
  overrides?: Partial<AssetPackConfig>;
}

// ============================================================================
// BASE CONFIGURATION (SHARED)
// ============================================================================

/**
 * Base lifecycle rules shared across all real estate packs
 */
const baseLifecycleRules: LifecycleRule[] = [
  {
    from: LifecycleState.DRAFT,
    to: LifecycleState.PENDING_VERIFICATION,
    conditions: [
      {
        type: 'DOCUMENT',
        documents: ['TITLE_DEED', 'VALUATION_REPORT', 'LEGAL_OPINION'],
      },
    ],
    actions: [
      { type: 'NOTIFY', params: { roles: ['COMPLIANCE', 'LEGAL'] } },
      { type: 'EMIT_EVENT', params: { event: 'VERIFICATION_REQUESTED' } },
    ],
    description: 'Submit property with title deed, valuation report, and legal opinion',
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
    ],
    actions: [
      { type: 'EMIT_EVENT', params: { event: 'PROPERTY_VERIFIED' } },
    ],
    description: 'Multi-party approval required for verification',
  },
  {
    from: LifecycleState.VERIFIED,
    to: LifecycleState.ACTIVE,
    conditions: [],
    actions: [
      { type: 'EMIT_EVENT', params: { event: 'PROPERTY_TOKENIZED' } },
      { type: 'NOTIFY', params: { roles: ['INVESTOR'] } },
    ],
    description: 'Activate property for tokenization',
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
 * Base compliance rules shared across all real estate packs
 */
const baseComplianceRules: ComplianceRule[] = [
  // KYC Requirements
  {
    id: 'RE_KYC',
    name: 'Real Estate KYC Requirements',
    type: 'KYC',
    params: {
      requiredLevel: 'enhanced',
      expiryDays: 365,
    },
    severity: 'BLOCK',
  },
  // AML/CFT
  {
    id: 'RE_AML_CFT',
    name: 'Real Estate AML/CFT Compliance',
    type: 'CUSTOM',
    params: {
      requireSourceOfFunds: true,
      sanctionsScreeningRequired: true,
      pepCheckRequired: true,
    },
    severity: 'BLOCK',
  },
  // Base Jurisdiction Restrictions (FATF blacklist)
  {
    id: 'RE_JURISDICTION',
    name: 'Real Estate Jurisdiction Restrictions',
    type: 'JURISDICTION',
    params: {
      blockedCountries: ['KP', 'IR', 'CU', 'SY'],
    },
    severity: 'BLOCK',
  },
  // Holding Limits
  {
    id: 'RE_MAX_HOLDING',
    name: 'Maximum Holding Limit',
    type: 'HOLDING_LIMIT',
    params: {
      maxPercent: 10,
      exemptRoles: ['INSTITUTIONAL', 'SPONSOR'],
    },
    severity: 'BLOCK',
  },
  // Lockup Period
  {
    id: 'RE_LOCKUP',
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
 * Base required verifications shared across all real estate packs
 */
const baseRequiredVerifications: RequiredVerification[] = [
  {
    type: 'TITLE_VERIFICATION',
    description: 'Property title deed verification',
    allowedVerifiers: ['LEGAL', 'TITLE_COMPANY', 'GOVERNMENT_REGISTRY'],
    mandatory: true,
  },
  {
    type: 'PROPERTY_VALUATION',
    description: 'Independent property valuation',
    allowedVerifiers: ['APPRAISER', 'CERTIFIED_VALUER'],
    mandatory: true,
  },
  {
    type: 'LEGAL_OPINION',
    description: 'Legal opinion on tokenization structure',
    allowedVerifiers: ['LEGAL'],
    mandatory: true,
  },
  {
    type: 'INSURANCE_VERIFICATION',
    description: 'Property and liability insurance verification',
    allowedVerifiers: ['COMPLIANCE', 'INSURANCE_PROVIDER'],
    mandatory: true,
  },
];

/**
 * Base distribution schedule for real estate (rental income)
 */
const baseDistributionSchedule: DistributionSchedule = {
  type: 'RENT',
  frequency: 'MONTHLY',
  calculation: 'PRO_RATA',
  recordDateOffset: 1,
};

/**
 * Base governance settings for real estate
 */
const baseGovernanceSettings: GovernanceSettings = {
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
 * Base metadata schema for real estate
 */
const baseMetadataSchema: Record<string, { type: 'string' | 'number' | 'boolean' | 'date' | 'array' | 'object'; required: boolean; description: string }> = {
  propertyAddress: {
    type: 'string',
    required: true,
    description: 'Full property address',
  },
  propertyType: {
    type: 'string',
    required: true,
    description: 'Property type (residential, commercial, etc.)',
  },
  areaSqm: {
    type: 'number',
    required: true,
    description: 'Property area in square meters',
  },
  valuationAmount: {
    type: 'string',
    required: true,
    description: 'Property valuation amount',
  },
  valuationDate: {
    type: 'date',
    required: true,
    description: 'Date of valuation',
  },
  titleDeedNumber: {
    type: 'string',
    required: true,
    description: 'Title deed or property registration number',
  },
  issuerName: {
    type: 'string',
    required: true,
    description: 'Legal name of the token issuer',
  },
  totalSupply: {
    type: 'string',
    required: true,
    description: 'Total token supply',
  },
  expectedYield: {
    type: 'number',
    required: false,
    description: 'Expected annual rental yield (%)',
  },
};

/**
 * Base asset defaults for real estate
 */
const baseDefaults = {
  assetType: AssetType.REAL_ESTATE,
  investorClass: InvestorClass.RETAIL,
  liquidityProfile: LiquidityProfile.SEMI_LIQUID,
  fractionalization: FractionalizationType.DIVISIBLE,
  lockupDays: 90,
  maxHoldingPercent: 10,
  additionalJurisdictions: [] as string[],
  blockedJurisdictions: ['KP', 'IR', 'CU', 'SY'],
};

// ============================================================================
// DUBAI REAL ESTATE PACK (UAE VARA + DLD)
// ============================================================================

/**
 * Dubai-specific lifecycle rules with DLD and VARA integration
 */
const dubaiLifecycleRules: LifecycleRule[] = [
  {
    from: LifecycleState.DRAFT,
    to: LifecycleState.PENDING_VERIFICATION,
    conditions: [
      {
        type: 'DOCUMENT',
        documents: [
          'TITLE_DEED',
          'VALUATION_REPORT',
          'NOC',
          'LEGAL_OPINION',
          'VARA_LICENSE_CERTIFICATE',
          'AML_ASSESSMENT_REPORT',
        ],
      },
      { type: 'CUSTOM', customCondition: 'VARA_COMPLIANCE_VERIFIED' },
    ],
    actions: [
      { type: 'NOTIFY', params: { roles: ['COMPLIANCE', 'LEGAL', 'VARA_OFFICER'] } },
      { type: 'EMIT_EVENT', params: { event: 'VERIFICATION_REQUESTED' } },
    ],
    description: 'Submit property with DLD title deed, RERA valuation, and VARA compliance documents',
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
          { role: 'VARA_OFFICER', count: 1 },
        ],
      },
      { type: 'CUSTOM', customCondition: 'DLD_OWNERSHIP_VERIFIED' },
    ],
    actions: [
      { type: 'EMIT_EVENT', params: { event: 'PROPERTY_VERIFIED' } },
      { type: 'EMIT_EVENT', params: { event: 'VARA_VERIFICATION_COMPLETE' } },
    ],
    description: 'DLD ownership verification, VARA compliance, and multi-party approval required',
  },
  {
    from: LifecycleState.VERIFIED,
    to: LifecycleState.ACTIVE,
    conditions: [
      { type: 'CUSTOM', customCondition: 'DLD_TOKENIZATION_REGISTERED' },
      { type: 'CUSTOM', customCondition: 'VARA_REPORTING_ACTIVE' },
    ],
    actions: [
      { type: 'EMIT_EVENT', params: { event: 'PROPERTY_TOKENIZED' } },
      { type: 'EMIT_EVENT', params: { event: 'VARA_ASSET_ACTIVATED' } },
      { type: 'NOTIFY', params: { roles: ['INVESTOR', 'VARA_OFFICER'] } },
    ],
    description: 'Activate after DLD tokenization registration and VARA reporting setup',
  },
  // Granular real estate lifecycle rules (maps to real-estate-dubai state machine)
  {
    from: LifecycleState.VERIFIED,
    to: LifecycleState.VERIFIED,
    conditions: [
      { type: 'CUSTOM', customCondition: 'VARA_REGULATORY_APPROVAL_OBTAINED' },
      {
        type: 'APPROVAL',
        approvals: [
          { role: 'COMPLIANCE', count: 1 },
          { role: 'VARA_OFFICER', count: 1 },
        ],
      },
    ],
    actions: [
      { type: 'EMIT_EVENT', params: { event: 'REGULATORY_APPROVAL_GRANTED' } },
    ],
    description: 'REGULATORY_APPROVAL → TOKEN_ISSUANCE: VARA approval obtained, proceed to token issuance',
  },
  {
    from: LifecycleState.ACTIVE,
    to: LifecycleState.ACTIVE,
    conditions: [
      { type: 'CUSTOM', customCondition: 'DLD_TOKENIZATION_REGISTERED' },
      { type: 'CUSTOM', customCondition: 'SMART_CONTRACT_AUDITED' },
    ],
    actions: [
      { type: 'EMIT_EVENT', params: { event: 'TOKEN_ISSUANCE_COMPLETE' } },
      { type: 'NOTIFY', params: { roles: ['INVESTOR'] } },
    ],
    description: 'TOKEN_ISSUANCE → LIVE: Tokens minted, DLD registered, go live for primary distribution',
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
 * Dubai-specific VARA compliance rules
 */
const varaComplianceRules: ComplianceRule[] = [
  // VARA KYC Requirements
  {
    id: 'VARA_KYC',
    name: 'VARA KYC Requirements',
    type: 'KYC',
    params: {
      requiredLevel: 'enhanced',
      allowedDocuments: ['emirates_id', 'passport', 'residence_visa'],
      additionalChecks: ['source_of_funds', 'pep_screening', 'sanctions_check'],
      expiryDays: 365,
    },
    severity: 'BLOCK',
  },
  // VARA AML/CFT
  {
    id: 'VARA_AML_CFT',
    name: 'VARA AML/CFT Compliance',
    type: 'CUSTOM',
    params: {
      requireSourceOfFunds: true,
      sourceOfFundsThreshold: '100000',
      requireBeneficialOwnership: true,
      sanctionsScreeningRequired: true,
      pepCheckRequired: true,
      refreshPeriodDays: 180,
    },
    severity: 'BLOCK',
  },
  // VARA Jurisdiction Restrictions
  {
    id: 'VARA_JURISDICTION',
    name: 'VARA Jurisdiction Restrictions',
    type: 'JURISDICTION',
    params: {
      allowedCountries: ['AE', 'SA', 'QA', 'KW', 'BH', 'OM', 'GB', 'US', 'SG', 'HK', 'CH', 'DE', 'FR'],
      blockedCountries: ['KP', 'IR', 'CU', 'SY', 'RU', 'BY', 'MM', 'VE', 'YE', 'LY', 'SD', 'SO'],
      highRiskCountries: ['AF', 'HT', 'ML', 'NI', 'PK', 'PA', 'SS', 'UG', 'ZW'],
      requireEnhancedDueDiligenceForHighRisk: true,
    },
    severity: 'BLOCK',
  },
  // VARA Qualified Investor
  {
    id: 'VARA_QUALIFIED_INVESTOR',
    name: 'VARA Qualified Investor Check',
    type: 'ACCREDITATION',
    params: {
      qualifiedInvestorThreshold: '500000',
      acceptedQualifications: ['institutional', 'professional', 'qualified', 'high_net_worth'],
      exemptBelowThreshold: true,
    },
    severity: 'BLOCK',
  },
  // VARA Minimum Investment
  {
    id: 'VARA_MIN_INVESTMENT',
    name: 'VARA Minimum Investment',
    type: 'TRANSFER_LIMIT',
    params: {
      minAmount: '1000',
      currency: 'AED',
      exemptTransfers: ['REDEMPTION', 'GIFT', 'INHERITANCE'],
    },
    severity: 'BLOCK',
  },
  // VARA Retail Investment Cap
  {
    id: 'VARA_MAX_RETAIL_INVESTMENT',
    name: 'VARA Retail Investment Cap',
    type: 'TRANSFER_LIMIT',
    params: {
      maxAmount: '500000',
      currency: 'AED',
      appliesTo: ['RETAIL'],
      exemptRoles: ['INSTITUTIONAL', 'PROFESSIONAL', 'QUALIFIED'],
    },
    severity: 'BLOCK',
  },
  // VARA Maximum Holding
  {
    id: 'VARA_MAX_HOLDING',
    name: 'VARA Maximum Holding Limit',
    type: 'HOLDING_LIMIT',
    params: {
      maxPercent: 10,
      exemptRoles: ['INSTITUTIONAL', 'SPONSOR'],
      concentrationLimitPercent: 25,
    },
    severity: 'BLOCK',
  },
  // VARA Lockup
  {
    id: 'VARA_LOCKUP',
    name: 'VARA Initial Lockup Period',
    type: 'LOCKUP',
    params: {
      lockupDays: 90,
      exemptTransfers: ['REDEMPTION', 'FORCED_TRANSFER', 'REGULATORY_FREEZE'],
      earlyReleaseWithPenalty: true,
      earlyReleasePenaltyPercent: 2.5,
    },
    severity: 'BLOCK',
  },
  // VARA Disclosure
  {
    id: 'VARA_DISCLOSURE',
    name: 'VARA Risk Disclosure',
    type: 'CUSTOM',
    params: {
      requireRiskAcknowledgment: true,
      requiredDisclosures: ['investment_risk', 'liquidity_risk', 'market_risk', 'regulatory_risk', 'no_guaranteed_returns'],
      disclosureLanguages: ['en', 'ar'],
      coolingOffPeriodHours: 24,
    },
    severity: 'BLOCK',
  },
  // VARA Marketing
  {
    id: 'VARA_MARKETING',
    name: 'VARA Marketing Compliance',
    type: 'CUSTOM',
    params: {
      prohibitedClaims: ['guaranteed_returns', 'risk_free', 'government_backed', 'principal_protected'],
      requiredWarnings: ['capital_at_risk', 'past_performance_not_indicative', 'vara_regulated'],
      targetAudienceRestrictions: ['no_minors', 'qualified_jurisdictions_only'],
    },
    severity: 'WARN',
  },
  // VARA Reporting
  {
    id: 'VARA_REPORTING',
    name: 'VARA Regulatory Reporting',
    type: 'CUSTOM',
    params: {
      reportingFrequency: 'QUARTERLY',
      reportTypes: ['investor_summary', 'transaction_summary', 'aml_sar', 'complaints_register'],
      suspiciousActivityThreshold: '50000',
      largeTransactionThreshold: '250000',
    },
    severity: 'LOG',
  },
  // VARA Custody
  {
    id: 'VARA_CUSTODY',
    name: 'VARA Custody Standards',
    type: 'CUSTOM',
    params: {
      requireLicensedCustodian: true,
      segregatedAssets: true,
      insuranceRequired: true,
      minimumInsuranceCoverage: '10000000',
      multiSigRequired: true,
      coldStoragePercent: 80,
    },
    severity: 'BLOCK',
  },
];

/**
 * Dubai-specific DLD verifications
 */
const dldVerifications: RequiredVerification[] = [
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
    type: 'NOC_VERIFICATION',
    description: 'No Objection Certificate from developer (if applicable)',
    allowedVerifiers: ['DEVELOPER', 'COMPLIANCE'],
    mandatory: false,
  },
  {
    type: 'VARA_VASP_LICENSE',
    description: 'VARA Virtual Asset Service Provider license verification',
    allowedVerifiers: ['VARA', 'COMPLIANCE'],
    mandatory: true,
  },
  {
    type: 'VARA_COMPLIANCE_ATTESTATION',
    description: 'VARA compliance framework attestation',
    allowedVerifiers: ['VARA', 'LICENSED_AUDITOR'],
    mandatory: true,
  },
  {
    type: 'VARA_AML_ASSESSMENT',
    description: 'VARA AML/CFT risk assessment',
    allowedVerifiers: ['COMPLIANCE', 'LICENSED_AUDITOR'],
    mandatory: true,
  },
  {
    type: 'CUSTODY_AGREEMENT',
    description: 'Licensed custodian agreement verification',
    allowedVerifiers: ['COMPLIANCE', 'CUSTODIAN'],
    mandatory: true,
  },
];

/**
 * Dubai-specific metadata schema fields
 */
const dubaiMetadataSchema: Record<string, { type: 'string' | 'number' | 'boolean' | 'date' | 'array' | 'object'; required: boolean; description: string }> = {
  // DLD Property Information
  titleDeedNumber: {
    type: 'string',
    required: true,
    description: 'DLD Title Deed Number',
  },
  propertyId: {
    type: 'string',
    required: true,
    description: 'DLD Property ID',
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
  // Valuation & Pricing
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
  mintPrice: {
    type: 'string',
    required: true,
    description: 'Initial mint price per token in AED',
  },
  expectedYield: {
    type: 'number',
    required: false,
    description: 'Expected annual rental yield (%)',
  },
  // VARA Compliance Information
  varaLicenseNumber: {
    type: 'string',
    required: true,
    description: 'VARA VASP License Number',
  },
  varaLicenseExpiry: {
    type: 'date',
    required: true,
    description: 'VARA License Expiry Date',
  },
  varaRiskCategory: {
    type: 'string',
    required: true,
    description: 'VARA Risk Category (LOW, MEDIUM, HIGH)',
  },
  varaComplianceStatus: {
    type: 'string',
    required: true,
    description: 'VARA Compliance Status (COMPLIANT, PENDING, REMEDIATION)',
  },
  // Issuer Information
  issuerName: {
    type: 'string',
    required: true,
    description: 'Legal name of the token issuer',
  },
  issuerRegistrationNumber: {
    type: 'string',
    required: true,
    description: 'Issuer commercial registration number',
  },
  issuerJurisdiction: {
    type: 'string',
    required: true,
    description: 'Issuer jurisdiction (ISO country code)',
  },
  // Token Details
  tokenContractAddress: {
    type: 'string',
    required: false,
    description: 'Deployed ERC-3643 token contract address',
  },
  totalSupply: {
    type: 'string',
    required: true,
    description: 'Total token supply',
  },
  tokenizationReferenceNumber: {
    type: 'string',
    required: false,
    description: 'DLD Tokenization Reference Number',
  },
};

/**
 * Dubai Real Estate Asset Pack Configuration
 * UAE VARA compliant with DLD integration
 */
export const dubaiRealEstatePack: AssetPackConfig = {
  id: 'DUBAI_REAL_ESTATE',
  name: 'Dubai Real Estate',
  description: 'Tokenized real estate in Dubai with DLD integration and VARA compliance',
  version: '1.0.0',
  stateMachineId: 'real-estate-dubai',

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
    ...baseDefaults,
    additionalJurisdictions: ['SA', 'QA', 'KW', 'BH', 'OM', 'GB', 'US', 'SG'],
    blockedJurisdictions: ['KP', 'IR', 'CU', 'SY', 'RU'],
  },

  lifecycleRules: dubaiLifecycleRules,
  complianceRules: varaComplianceRules,
  requiredVerifications: [
    ...baseRequiredVerifications.filter(v => v.type !== 'TITLE_VERIFICATION' && v.type !== 'PROPERTY_VALUATION'),
    ...dldVerifications,
  ],
  distributionSchedule: baseDistributionSchedule,
  governance: baseGovernanceSettings,
  metadataSchema: dubaiMetadataSchema,
  tags: ['real-estate', 'dubai', 'uae', 'vara', 'rental-income', 'property'],
};

// ============================================================================
// ADGM REAL ESTATE PACK (Abu Dhabi)
// ============================================================================

/**
 * ADGM-specific compliance rules
 */
const adgmComplianceRules: ComplianceRule[] = [
  // ADGM KYC
  {
    id: 'ADGM_KYC',
    name: 'ADGM KYC Requirements',
    type: 'KYC',
    params: {
      requiredLevel: 'enhanced',
      allowedDocuments: ['emirates_id', 'passport', 'residence_visa'],
      additionalChecks: ['source_of_funds', 'pep_screening', 'sanctions_check'],
      expiryDays: 365,
    },
    severity: 'BLOCK',
  },
  // ADGM AML/CFT
  {
    id: 'ADGM_AML_CFT',
    name: 'ADGM AML/CFT Compliance',
    type: 'CUSTOM',
    params: {
      requireSourceOfFunds: true,
      sourceOfFundsThreshold: '100000',
      requireBeneficialOwnership: true,
      sanctionsScreeningRequired: true,
      pepCheckRequired: true,
    },
    severity: 'BLOCK',
  },
  // ADGM Jurisdiction Restrictions
  {
    id: 'ADGM_JURISDICTION',
    name: 'ADGM Jurisdiction Restrictions',
    type: 'JURISDICTION',
    params: {
      allowedCountries: ['AE', 'SA', 'QA', 'KW', 'BH', 'OM', 'GB', 'US', 'SG', 'HK', 'CH', 'DE', 'FR', 'JP', 'AU'],
      blockedCountries: ['KP', 'IR', 'CU', 'SY', 'RU', 'BY'],
    },
    severity: 'BLOCK',
  },
  // ADGM Qualified Investor
  {
    id: 'ADGM_QUALIFIED_INVESTOR',
    name: 'ADGM Qualified Investor Check',
    type: 'ACCREDITATION',
    params: {
      qualifiedInvestorThreshold: '500000',
      acceptedQualifications: ['institutional', 'professional', 'qualified'],
      exemptBelowThreshold: true,
    },
    severity: 'BLOCK',
  },
  // ADGM Maximum Holding
  {
    id: 'ADGM_MAX_HOLDING',
    name: 'ADGM Maximum Holding Limit',
    type: 'HOLDING_LIMIT',
    params: {
      maxPercent: 10,
      exemptRoles: ['INSTITUTIONAL', 'SPONSOR'],
    },
    severity: 'BLOCK',
  },
  // ADGM Lockup
  {
    id: 'ADGM_LOCKUP',
    name: 'ADGM Initial Lockup Period',
    type: 'LOCKUP',
    params: {
      lockupDays: 90,
      exemptTransfers: ['REDEMPTION', 'FORCED_TRANSFER'],
    },
    severity: 'BLOCK',
  },
];

/**
 * ADGM-specific verifications
 */
const adgmVerifications: RequiredVerification[] = [
  {
    type: 'ADGM_PROPERTY_REGISTRATION',
    description: 'ADGM property registration verification',
    allowedVerifiers: ['ADGM_REGISTRATION_AUTHORITY', 'LICENSED_NOTARY'],
    mandatory: true,
  },
  {
    type: 'ADGM_FSRA_LICENSE',
    description: 'ADGM FSRA license verification',
    allowedVerifiers: ['ADGM_FSRA', 'COMPLIANCE'],
    mandatory: true,
  },
  {
    type: 'ADGM_VALUATION',
    description: 'ADGM-approved property valuation',
    allowedVerifiers: ['ADGM_CERTIFIED_VALUER', 'COMPLIANCE'],
    mandatory: true,
  },
];

/**
 * ADGM Real Estate Asset Pack Configuration
 */
export const adgmRealEstatePack: AssetPackConfig = {
  ...dubaiRealEstatePack,
  id: 'ADGM_REAL_ESTATE',
  name: 'ADGM Real Estate',
  description: 'Tokenized real estate in Abu Dhabi Global Market with FSRA compliance',

  jurisdictionProvider: 'adgm',

  defaults: {
    ...baseDefaults,
    additionalJurisdictions: ['SA', 'QA', 'KW', 'BH', 'OM', 'GB', 'US', 'SG', 'JP', 'AU'],
    blockedJurisdictions: ['KP', 'IR', 'CU', 'SY', 'RU', 'BY'],
  },

  lifecycleRules: baseLifecycleRules,
  complianceRules: adgmComplianceRules,
  requiredVerifications: [
    ...baseRequiredVerifications,
    ...adgmVerifications,
  ],

  metadataSchema: {
    ...baseMetadataSchema,
    adgmRegistrationNumber: {
      type: 'string',
      required: true,
      description: 'ADGM property registration number',
    },
    fsraLicenseNumber: {
      type: 'string',
      required: true,
      description: 'ADGM FSRA license number',
    },
  },

  tags: ['real-estate', 'adgm', 'abu-dhabi', 'uae', 'rental-income', 'property'],
};

// ============================================================================
// GENERIC REAL ESTATE PACK (Jurisdiction-Agnostic)
// ============================================================================

/**
 * Generic Real Estate Asset Pack Configuration
 * Jurisdiction-agnostic baseline for any real estate tokenization
 */
export const genericRealEstatePack: AssetPackConfig = {
  id: 'GENERIC_REAL_ESTATE',
  name: 'Generic Real Estate',
  description: 'Jurisdiction-agnostic real estate tokenization pack',
  version: '1.0.0',

  // Adapter configuration
  jurisdiction: '',
  jurisdictionProvider: 'generic',
  custodyProvider: 'fireblocks',
  kycProvider: 'onfido',
  tokenContract: 'RealToken',
  complianceModules: [
    'whitelist',
    'country-restrictions',
    'max-balance',
  ],

  defaults: baseDefaults,
  lifecycleRules: baseLifecycleRules,
  complianceRules: baseComplianceRules,
  requiredVerifications: baseRequiredVerifications,
  distributionSchedule: baseDistributionSchedule,
  governance: baseGovernanceSettings,
  metadataSchema: baseMetadataSchema,
  tags: ['real-estate', 'generic', 'property', 'rental-income'],
};

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a custom real estate pack for a specific jurisdiction
 *
 * @example
 * ```typescript
 * const ukRealEstatePack = createRealEstatePack({
 *   id: 'UK_REAL_ESTATE',
 *   name: 'UK Real Estate',
 *   description: 'FCA-compliant real estate tokenization',
 *   jurisdiction: 'GB',
 *   jurisdictionProvider: 'land-registry',
 *   additionalComplianceRules: [fcaComplianceRule],
 *   additionalVerifications: [landRegistryVerification],
 *   tags: ['uk', 'fca'],
 * });
 * ```
 */
export function createRealEstatePack(options: CreateRealEstatePackOptions): AssetPackConfig {
  const {
    id,
    name,
    description,
    jurisdiction,
    jurisdictionProvider,
    custodyProvider = 'fireblocks',
    kycProvider = 'onfido',
    additionalComplianceRules = [],
    additionalVerifications = [],
    additionalLifecycleRules = [],
    blockedJurisdictions = [],
    allowedJurisdictions,
    additionalMetadataSchema = {},
    tags = [],
    overrides = {},
  } = options;

  // Merge blocked jurisdictions
  const mergedBlockedJurisdictions = [
    ...new Set([...baseDefaults.blockedJurisdictions, ...blockedJurisdictions]),
  ];

  // Update jurisdiction compliance rule if allowed jurisdictions provided
  let mergedComplianceRules = [...baseComplianceRules, ...additionalComplianceRules];
  if (allowedJurisdictions) {
    mergedComplianceRules = mergedComplianceRules.map(rule => {
      if (rule.id === 'RE_JURISDICTION') {
        return {
          ...rule,
          params: {
            ...rule.params,
            allowedCountries: allowedJurisdictions,
            blockedCountries: mergedBlockedJurisdictions,
          },
        };
      }
      return rule;
    });
  }

  return {
    id,
    name,
    description,
    version: '1.0.0',

    jurisdiction,
    jurisdictionProvider,
    custodyProvider,
    kycProvider,
    tokenContract: 'RealToken',
    complianceModules: ['whitelist', 'country-restrictions', 'max-balance', 'hold-time'],

    defaults: {
      ...baseDefaults,
      blockedJurisdictions: mergedBlockedJurisdictions,
      ...(allowedJurisdictions ? { additionalJurisdictions: allowedJurisdictions } : {}),
    },

    lifecycleRules: [...baseLifecycleRules, ...additionalLifecycleRules],
    complianceRules: mergedComplianceRules,
    requiredVerifications: [...baseRequiredVerifications, ...additionalVerifications],
    distributionSchedule: baseDistributionSchedule,
    governance: baseGovernanceSettings,
    metadataSchema: {
      ...baseMetadataSchema,
      ...additionalMetadataSchema,
    },
    tags: ['real-estate', 'property', ...tags],

    ...overrides,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  // Base configuration (for extension)
  baseLifecycleRules,
  baseComplianceRules,
  baseRequiredVerifications,
  baseDistributionSchedule,
  baseGovernanceSettings,
  baseMetadataSchema,
  baseDefaults,

  // Dubai-specific (for extension)
  dubaiLifecycleRules,
  varaComplianceRules,
  dldVerifications,
  dubaiMetadataSchema,

  // ADGM-specific (for extension)
  adgmComplianceRules,
  adgmVerifications,
};

export default dubaiRealEstatePack;
