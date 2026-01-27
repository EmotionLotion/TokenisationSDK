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
 *
 * Implements VARA-compliant lifecycle with DLD integration:
 * 1. DRAFT -> PENDING_VERIFICATION: Submit with required documents + VARA compliance check
 * 2. PENDING_VERIFICATION -> VERIFIED: DLD ownership verification + approvals
 * 3. VERIFIED -> ACTIVE: DLD tokenization registration
 */
const lifecycleRules: LifecycleRule[] = [
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
          { role: 'VARA_OFFICER', count: 1 }, // VARA compliance officer approval
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
 *
 * Implements UAE VARA (Virtual Assets Regulatory Authority) requirements
 * as outlined in the Virtual Assets and Related Activities Regulations 2023
 */
const complianceRules: ComplianceRule[] = [
  // =============================================================================
  // VARA KYC/AML REQUIREMENTS
  // =============================================================================
  {
    id: 'VARA_KYC',
    name: 'VARA KYC Requirements',
    type: 'KYC',
    params: {
      requiredLevel: 'enhanced', // VARA requires enhanced due diligence for real estate
      allowedDocuments: ['emirates_id', 'passport', 'residence_visa'],
      additionalChecks: ['source_of_funds', 'pep_screening', 'sanctions_check'],
      expiryDays: 365, // Re-verification required annually
    },
    severity: 'BLOCK',
  },
  {
    id: 'VARA_AML_CFT',
    name: 'VARA AML/CFT Compliance',
    type: 'CUSTOM',
    params: {
      requireSourceOfFunds: true,
      sourceOfFundsThreshold: '100000', // AED - requires proof above this amount
      requireBeneficialOwnership: true,
      sanctionsScreeningRequired: true,
      pepCheckRequired: true,
      refreshPeriodDays: 180, // Re-screen every 6 months
    },
    severity: 'BLOCK',
  },

  // =============================================================================
  // VARA JURISDICTION RESTRICTIONS
  // =============================================================================
  {
    id: 'VARA_JURISDICTION',
    name: 'VARA Jurisdiction Restrictions',
    type: 'JURISDICTION',
    params: {
      // GCC + approved jurisdictions
      allowedCountries: ['AE', 'SA', 'QA', 'KW', 'BH', 'OM', 'GB', 'US', 'SG', 'HK', 'CH', 'DE', 'FR'],
      // FATF blacklist + VARA restricted jurisdictions
      blockedCountries: ['KP', 'IR', 'CU', 'SY', 'RU', 'BY', 'MM', 'VE', 'YE', 'LY', 'SD', 'SO'],
      // High-risk jurisdictions require additional EDD
      highRiskCountries: ['AF', 'HT', 'ML', 'NI', 'PK', 'PA', 'SS', 'UG', 'ZW'],
      requireEnhancedDueDiligenceForHighRisk: true,
    },
    severity: 'BLOCK',
  },

  // =============================================================================
  // VARA INVESTOR QUALIFICATION
  // =============================================================================
  {
    id: 'VARA_QUALIFIED_INVESTOR',
    name: 'VARA Qualified Investor Check',
    type: 'ACCREDITATION',
    params: {
      // For investments >= 500k AED, must be qualified/institutional
      qualifiedInvestorThreshold: '500000', // AED
      acceptedQualifications: [
        'institutional', // Licensed financial institution
        'professional', // Professional investor certification
        'qualified', // Qualified investor status
        'high_net_worth', // HNW individual (>3M AED liquid assets)
      ],
      exemptBelowThreshold: true, // Retail allowed for smaller investments
    },
    severity: 'BLOCK',
  },

  // =============================================================================
  // VARA INVESTMENT LIMITS
  // =============================================================================
  {
    id: 'VARA_MIN_INVESTMENT',
    name: 'VARA Minimum Investment',
    type: 'TRANSFER_LIMIT',
    params: {
      minAmount: '1000', // AED - VARA minimum for tokenized real estate
      currency: 'AED',
      exemptTransfers: ['REDEMPTION', 'GIFT', 'INHERITANCE'],
    },
    severity: 'BLOCK',
  },
  {
    id: 'VARA_MAX_RETAIL_INVESTMENT',
    name: 'VARA Retail Investment Cap',
    type: 'TRANSFER_LIMIT',
    params: {
      // Retail investors capped at 500k AED per asset
      maxAmount: '500000', // AED
      currency: 'AED',
      appliesTo: ['RETAIL'],
      exemptRoles: ['INSTITUTIONAL', 'PROFESSIONAL', 'QUALIFIED'],
    },
    severity: 'WARN', // Warn but allow with additional acknowledgment
  },

  // =============================================================================
  // VARA HOLDING LIMITS
  // =============================================================================
  {
    id: 'VARA_MAX_HOLDING',
    name: 'VARA Maximum Holding Limit',
    type: 'HOLDING_LIMIT',
    params: {
      maxPercent: 10, // No single investor > 10% (anti-concentration)
      exemptRoles: ['INSTITUTIONAL', 'SPONSOR'],
      concentrationLimitPercent: 25, // Top 5 holders < 25% combined
    },
    severity: 'BLOCK',
  },

  // =============================================================================
  // VARA LOCKUP REQUIREMENTS
  // =============================================================================
  {
    id: 'VARA_LOCKUP',
    name: 'VARA Initial Lockup Period',
    type: 'LOCKUP',
    params: {
      lockupDays: 90, // 90-day lockup for new investments
      exemptTransfers: ['REDEMPTION', 'FORCED_TRANSFER', 'REGULATORY_FREEZE'],
      earlyReleaseWithPenalty: true,
      earlyReleasePenaltyPercent: 2.5,
    },
    severity: 'BLOCK',
  },

  // =============================================================================
  // VARA DISCLOSURE & MARKETING
  // =============================================================================
  {
    id: 'VARA_DISCLOSURE',
    name: 'VARA Risk Disclosure',
    type: 'CUSTOM',
    params: {
      requireRiskAcknowledgment: true,
      requiredDisclosures: [
        'investment_risk', // General investment risk
        'liquidity_risk', // Limited secondary market
        'market_risk', // Property value fluctuation
        'regulatory_risk', // Regulatory changes
        'no_guaranteed_returns', // Returns not guaranteed
      ],
      disclosureLanguages: ['en', 'ar'], // English and Arabic required
      coolingOffPeriodHours: 24, // 24-hour cooling off after disclosure
    },
    severity: 'BLOCK',
  },
  {
    id: 'VARA_MARKETING',
    name: 'VARA Marketing Compliance',
    type: 'CUSTOM',
    params: {
      prohibitedClaims: [
        'guaranteed_returns',
        'risk_free',
        'government_backed',
        'principal_protected',
      ],
      requiredWarnings: [
        'capital_at_risk',
        'past_performance_not_indicative',
        'vara_regulated',
      ],
      targetAudienceRestrictions: ['no_minors', 'qualified_jurisdictions_only'],
    },
    severity: 'WARN',
  },

  // =============================================================================
  // VARA REPORTING
  // =============================================================================
  {
    id: 'VARA_REPORTING',
    name: 'VARA Regulatory Reporting',
    type: 'CUSTOM',
    params: {
      reportingFrequency: 'QUARTERLY',
      reportTypes: [
        'investor_summary', // Investor count and demographics
        'transaction_summary', // Transfer volume and value
        'aml_sar', // Suspicious activity reports
        'complaints_register', // Investor complaints
      ],
      suspiciousActivityThreshold: '50000', // AED - auto-flag for SAR review
      largeTransactionThreshold: '250000', // AED - requires enhanced monitoring
    },
    severity: 'LOG', // Tracking/logging requirement
  },

  // =============================================================================
  // VARA CUSTODY REQUIREMENTS
  // =============================================================================
  {
    id: 'VARA_CUSTODY',
    name: 'VARA Custody Standards',
    type: 'CUSTOM',
    params: {
      requireLicensedCustodian: true,
      segregatedAssets: true,
      insuranceRequired: true,
      minimumInsuranceCoverage: '10000000', // AED - 10M minimum coverage
      multiSigRequired: true,
      coldStoragePercent: 80, // 80% in cold storage
    },
    severity: 'BLOCK',
  },
];

/**
 * Required Verifications for Dubai Real Estate
 * Includes VARA regulatory requirements and DLD property verifications
 */
const requiredVerifications: RequiredVerification[] = [
  // DLD Property Verifications
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

  // VARA Regulatory Verifications
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

  // Legal & Insurance
  {
    type: 'LEGAL_OPINION',
    description: 'Legal opinion on tokenization structure under UAE law',
    allowedVerifiers: ['LEGAL'],
    mandatory: true,
  },
  {
    type: 'INSURANCE_VERIFICATION',
    description: 'Property and custody insurance verification',
    allowedVerifiers: ['COMPLIANCE', 'INSURANCE_PROVIDER'],
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
  },

  tags: ['real-estate', 'dubai', 'uae', 'vara', 'rental-income', 'property'],
};

export default dubaiRealEstatePack;
