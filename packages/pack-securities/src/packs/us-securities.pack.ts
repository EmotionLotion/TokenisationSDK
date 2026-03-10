/**
 * US Securities Asset Pack
 *
 * Pre-configured asset pack for tokenizing US securities
 * under SEC Regulation D (Rule 506(b) and 506(c)).
 *
 * Features:
 * - SEC Regulation D compliance
 * - Accredited investor verification
 * - Blue Sky filing requirements
 * - Transfer restrictions (Rule 144)
 */

import { AssetType, InvestorClass, LiquidityProfile, FractionalizationType } from '@tokenisation/core';
import { LifecycleState } from '@tokenisation/core';
import type { AssetPack, LifecycleRule, ComplianceRule, RequiredVerification } from '@tokenisation/core';

/**
 * Distribution schedule (from AssetPackRegistry, not CashFlow module)
 */
interface DistributionSchedule {
  type: 'DIVIDEND' | 'INTEREST' | 'ROYALTY' | 'RENT' | 'CUSTOM';
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY' | 'ON_DEMAND';
  calculation: 'FIXED' | 'PRO_RATA' | 'TIERED' | 'CUSTOM';
  recordDateOffset: number;
}

/**
 * Governance settings (from AssetPackRegistry)
 */
interface GovernanceSettings {
  votingEnabled: boolean;
  votingStrategy: 'ONE_TOKEN_ONE_VOTE' | 'QUADRATIC' | 'WEIGHTED' | 'ONE_PERSON_ONE_VOTE';
  quorumPercent: number;
  approvalThresholdPercent: number;
  proposalTypes: string[];
  votingPeriodDays: number;
}

/** Local stub for AssetPackConfig after real-estate pack moved to @tokenisation/realestate */
export interface AssetPackConfig extends AssetPack {
  jurisdiction: string;
  jurisdictionProvider: string;
  custodyProvider: string;
  kycProvider: string;
  tokenContract: 'RealToken' | 'ComplianceToken' | 'ComplianceMultiToken';
  complianceModules: string[];
}

/**
 * US Securities Pack Lifecycle Rules
 */
const lifecycleRules: LifecycleRule[] = [
  {
    from: LifecycleState.DRAFT,
    to: LifecycleState.PENDING_VERIFICATION,
    conditions: [
      {
        type: 'DOCUMENT',
        documents: ['PPM', 'SUBSCRIPTION_AGREEMENT', 'FORM_D_DRAFT', 'LEGAL_OPINION'],
      },
    ],
    actions: [
      { type: 'NOTIFY', params: { roles: ['COMPLIANCE', 'LEGAL'] } },
    ],
    description: 'Submit PPM and subscription agreement for review',
  },
  {
    from: LifecycleState.PENDING_VERIFICATION,
    to: LifecycleState.VERIFIED,
    conditions: [
      {
        type: 'APPROVAL',
        approvals: [
          { role: 'LEGAL', count: 1 },
          { role: 'COMPLIANCE', count: 1 },
        ],
      },
    ],
    actions: [
      { type: 'EMIT_EVENT', params: { event: 'OFFERING_APPROVED' } },
    ],
    description: 'Legal and compliance approval of offering documents',
  },
  {
    from: LifecycleState.VERIFIED,
    to: LifecycleState.ACTIVE,
    conditions: [
      { type: 'CUSTOM', customCondition: 'FORM_D_FILED' },
      { type: 'CUSTOM', customCondition: 'BLUE_SKY_FILINGS_COMPLETE' },
    ],
    actions: [
      { type: 'EMIT_EVENT', params: { event: 'OFFERING_ACTIVE' } },
      { type: 'NOTIFY', params: { roles: ['INVESTOR'] } },
    ],
    description: 'Activate after Form D and Blue Sky filings',
  },
  {
    from: LifecycleState.ACTIVE,
    to: LifecycleState.FROZEN,
    conditions: [
      { type: 'APPROVAL', approvals: [{ role: 'COMPLIANCE', count: 1 }] },
    ],
    actions: [
      { type: 'FREEZE', params: {} },
    ],
    description: 'Freeze for distributions or regulatory compliance',
  },
  {
    from: LifecycleState.FROZEN,
    to: LifecycleState.ACTIVE,
    conditions: [
      { type: 'APPROVAL', approvals: [{ role: 'COMPLIANCE', count: 1 }] },
    ],
    actions: [
      { type: 'UNFREEZE', params: {} },
    ],
    description: 'Unfreeze after compliance clearance',
  },
];

/**
 * US Securities Compliance Rules
 */
const complianceRules: ComplianceRule[] = [
  {
    id: 'ACCREDITED_INVESTOR',
    name: 'Accredited Investor Verification',
    type: 'ACCREDITATION',
    params: {
      requiredStatus: 'ACCREDITED',
      verificationMethods: ['income', 'net_worth', 'professional_certification'],
      verificationProviders: ['verify_investor', 'parallel_markets'],
    },
    severity: 'BLOCK',
  },
  {
    id: 'US_AML_KYC',
    name: 'US AML/KYC Requirements',
    type: 'KYC',
    params: {
      requiredLevel: 'enhanced',
      requireSSN: true,
      requireW9: true,
    },
    severity: 'BLOCK',
  },
  {
    id: 'JURISDICTION_RESTRICTIONS',
    name: 'US Jurisdiction Restrictions',
    type: 'JURISDICTION',
    params: {
      allowedCountries: ['US'],
      blockedStates: [], // Add states without Blue Sky exemption
      blockedCountries: ['KP', 'IR', 'CU', 'SY', 'RU', 'BY'],
    },
    severity: 'BLOCK',
  },
  {
    id: 'RULE_144_LOCKUP',
    name: 'Rule 144 Holding Period',
    type: 'LOCKUP',
    params: {
      lockupDays: 365, // 1 year for non-reporting issuers
      exemptTransfers: ['REDEMPTION', 'DEATH', 'DIVORCE'],
    },
    severity: 'BLOCK',
  },
  {
    id: 'MAX_INVESTORS_506B',
    name: 'Rule 506(b) Investor Limit',
    type: 'HOLDING_LIMIT',
    params: {
      maxNonAccreditedInvestors: 35,
      maxTotalInvestors: 2000, // To avoid SEC registration
    },
    severity: 'BLOCK',
  },
  {
    id: 'MIN_INVESTMENT',
    name: 'Minimum Investment',
    type: 'TRANSFER_LIMIT',
    params: {
      minAmount: '25000',
      currency: 'USD',
    },
    severity: 'BLOCK',
  },
];

/**
 * Required Verifications for US Securities
 */
const requiredVerifications: RequiredVerification[] = [
  {
    type: 'ACCREDITATION_VERIFICATION',
    description: 'Third-party accredited investor verification (Rule 506(c))',
    allowedVerifiers: ['VERIFY_INVESTOR', 'PARALLEL_MARKETS', 'CPA', 'ATTORNEY', 'BROKER_DEALER'],
    mandatory: true,
  },
  {
    type: 'PPM_REVIEW',
    description: 'Private Placement Memorandum legal review',
    allowedVerifiers: ['LEGAL'],
    mandatory: true,
  },
  {
    type: 'SUBSCRIPTION_REVIEW',
    description: 'Subscription agreement review and acceptance',
    allowedVerifiers: ['COMPLIANCE'],
    mandatory: true,
  },
  {
    type: 'FORM_D_FILING',
    description: 'SEC Form D filing confirmation',
    allowedVerifiers: ['LEGAL', 'COMPLIANCE'],
    mandatory: true,
  },
  {
    type: 'BLUE_SKY_FILINGS',
    description: 'State Blue Sky filings (as required)',
    allowedVerifiers: ['LEGAL'],
    mandatory: true,
  },
  {
    type: 'BAD_ACTOR_CHECK',
    description: 'Bad Actor disqualification check (Rule 506(d))',
    allowedVerifiers: ['COMPLIANCE', 'LEGAL'],
    mandatory: true,
  },
];

/**
 * Distribution Schedule for US Securities
 */
const distributionSchedule: DistributionSchedule = {
  type: 'DIVIDEND',
  frequency: 'QUARTERLY',
  calculation: 'PRO_RATA',
  recordDateOffset: 5, // 5 days before distribution
};

/**
 * Governance Settings for US Securities
 */
const governanceSettings: GovernanceSettings = {
  votingEnabled: true,
  votingStrategy: 'ONE_TOKEN_ONE_VOTE',
  quorumPercent: 50,
  approvalThresholdPercent: 66,
  proposalTypes: [
    'AMENDMENT',
    'DISSOLUTION',
    'MAJOR_TRANSACTION',
    'MANAGEMENT_CHANGE',
    'DISTRIBUTION_POLICY',
  ],
  votingPeriodDays: 30,
};

/**
 * US Securities (Reg D 506c) Asset Pack Configuration
 */
export const usSecurities506cPack: AssetPackConfig = {
  id: 'US_SECURITIES_506C',
  name: 'US Securities (Reg D 506c)',
  description: 'Tokenized securities under SEC Regulation D Rule 506(c) - accredited investors only with general solicitation',
  version: '1.0.0',

  // Adapter configuration
  jurisdiction: 'US',
  jurisdictionProvider: 'sec',
  custodyProvider: 'bitgo',
  kycProvider: 'jumio',
  tokenContract: 'RealToken',
  complianceModules: [
    'whitelist',
    'country-restrictions',
    'max-holders',
    'hold-time',
  ],

  // Asset defaults
  defaults: {
    assetType: AssetType.PRIVATE_EQUITY,
    investorClass: InvestorClass.ACCREDITED,
    liquidityProfile: LiquidityProfile.ILLIQUID,
    fractionalization: FractionalizationType.FIXED_SHARES,
    lockupDays: 365, // Rule 144 holding period
    maxInvestors: 2000,
    maxHoldingPercent: 25,
    additionalJurisdictions: [],
    blockedJurisdictions: ['KP', 'IR', 'CU', 'SY', 'RU', 'BY'],
  },

  lifecycleRules,
  complianceRules,
  requiredVerifications,
  distributionSchedule,
  governance: governanceSettings,

  metadataSchema: {
    issuerName: {
      type: 'string',
      required: true,
      description: 'Legal name of the issuer',
    },
    offeringType: {
      type: 'string',
      required: true,
      description: 'Type of offering (equity, debt, convertible, etc.)',
    },
    regulationType: {
      type: 'string',
      required: true,
      description: 'Regulation type (506b, 506c, Reg A+, Reg CF)',
    },
    formDFileDate: {
      type: 'date',
      required: false,
      description: 'Date Form D was filed with SEC',
    },
    offeringAmount: {
      type: 'string',
      required: true,
      description: 'Total offering amount in USD',
    },
    minimumInvestment: {
      type: 'string',
      required: true,
      description: 'Minimum investment amount per investor',
    },
    useOfProceeds: {
      type: 'string',
      required: true,
      description: 'Intended use of offering proceeds',
    },
    riskFactors: {
      type: 'array',
      required: true,
      description: 'Key risk factors for the investment',
    },
    managementTeam: {
      type: 'array',
      required: false,
      description: 'Key management team members',
    },
    financialStatements: {
      type: 'boolean',
      required: true,
      description: 'Whether audited financial statements are provided',
    },
  },

  tags: ['securities', 'us', 'reg-d', '506c', 'accredited', 'private-placement'],
};

/**
 * US Securities (Reg D 506b) Asset Pack Configuration
 * Allows up to 35 non-accredited investors, no general solicitation
 */
export const usSecurities506bPack: AssetPackConfig = {
  ...usSecurities506cPack,
  id: 'US_SECURITIES_506B',
  name: 'US Securities (Reg D 506b)',
  description: 'Tokenized securities under SEC Regulation D Rule 506(b) - limited non-accredited investors, no general solicitation',

  defaults: {
    ...usSecurities506cPack.defaults,
    investorClass: InvestorClass.QUALIFIED_PURCHASER,
    maxInvestors: 35, // Non-accredited limit
  },

  complianceRules: [
    ...complianceRules.filter(r => r.id !== 'MAX_INVESTORS_506B'),
    {
      id: 'MAX_NON_ACCREDITED',
      name: 'Rule 506(b) Non-Accredited Limit',
      type: 'HOLDING_LIMIT',
      params: {
        maxNonAccreditedInvestors: 35,
        requireSophisticatedInvestor: true,
      },
      severity: 'BLOCK',
    },
    {
      id: 'NO_GENERAL_SOLICITATION',
      name: 'No General Solicitation',
      type: 'CUSTOM',
      params: {
        prohibitGeneralSolicitation: true,
        requirePreExistingRelationship: true,
      },
      severity: 'BLOCK',
    },
  ],

  tags: ['securities', 'us', 'reg-d', '506b', 'private-placement', 'no-solicitation'],
};

export default usSecurities506cPack;
