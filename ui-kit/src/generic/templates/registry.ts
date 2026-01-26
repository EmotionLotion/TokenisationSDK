/**
 * Template Registry - Pre-defined Asset Templates
 *
 * Each template defines:
 * - schema: metadata fields for this asset class
 * - default policies: rules that apply by default
 * - available actions: lifecycle actions for this asset type
 * - rights: what capabilities this asset has
 */

import type {
  AssetTemplate,
  TemplateType,
  MetadataField,
  ActionType,
  AssetRights,
} from '../types';

// ============================================
// Common Schema Fields
// ============================================

const commonFields: MetadataField[] = [
  {
    key: 'name',
    label: 'Asset Name',
    type: 'string',
    required: true,
    description: 'The display name of the asset',
  },
  {
    key: 'description',
    label: 'Description',
    type: 'string',
    required: false,
    description: 'Detailed description of the asset',
  },
  {
    key: 'image',
    label: 'Image URL',
    type: 'url',
    required: false,
    description: 'Cover image for the asset',
  },
];

// ============================================
// Real Estate Template
// ============================================

export const realEstateTemplate: AssetTemplate = {
  id: 'tmpl_real_estate_v1',
  type: 'real_estate',
  name: 'Real Estate Fractional',
  description: 'Fractional ownership in real estate properties with yield distribution',
  profile: 'regulated_fungible',
  icon: 'Building2',
  color: '#3B82F6', // blue
  schema: [
    ...commonFields,
    {
      key: 'propertyAddress',
      label: 'Property Address',
      type: 'string',
      required: true,
      description: 'Physical address of the property',
    },
    {
      key: 'propertyType',
      label: 'Property Type',
      type: 'enum',
      required: true,
      options: ['Residential', 'Commercial', 'Industrial', 'Mixed-Use', 'Land'],
    },
    {
      key: 'appraisalValue',
      label: 'Appraisal Value (USD)',
      type: 'number',
      required: true,
      description: 'Latest appraised value',
    },
    {
      key: 'spvId',
      label: 'SPV Entity ID',
      type: 'string',
      required: false,
      description: 'Special Purpose Vehicle identifier',
    },
    {
      key: 'annualYield',
      label: 'Expected Annual Yield (%)',
      type: 'number',
      required: false,
    },
  ],
  defaultPolicies: ['pol_kyc_required', 'pol_lockup_90d', 'pol_accredited_only'],
  availableActions: ['issue', 'transfer', 'distribute', 'redeem', 'freeze'],
  rights: {
    transferable: true,
    redeemable: true,
    expirable: false,
    retirable: false,
    payoutEnabled: true,
  },
};

// ============================================
// Carbon Credit Template
// ============================================

export const carbonCreditTemplate: AssetTemplate = {
  id: 'tmpl_carbon_credit_v1',
  type: 'carbon_credit',
  name: 'Carbon Credit',
  description: 'Verified carbon credits that can be retired for offset',
  profile: 'semi_fungible',
  icon: 'Leaf',
  color: '#22C55E', // green
  schema: [
    ...commonFields,
    {
      key: 'registryId',
      label: 'Registry ID',
      type: 'string',
      required: true,
      description: 'ID in the carbon registry (Verra, Gold Standard, etc.)',
    },
    {
      key: 'registryName',
      label: 'Registry',
      type: 'enum',
      required: true,
      options: ['Verra', 'Gold Standard', 'ACR', 'CAR', 'Puro.earth'],
    },
    {
      key: 'projectType',
      label: 'Project Type',
      type: 'enum',
      required: true,
      options: ['Forestry', 'Renewable Energy', 'Methane Capture', 'Blue Carbon', 'Direct Air Capture'],
    },
    {
      key: 'vintage',
      label: 'Vintage Year',
      type: 'number',
      required: true,
      description: 'Year the credits were issued',
    },
    {
      key: 'co2Tonnes',
      label: 'CO2 Tonnes per Unit',
      type: 'number',
      required: true,
      description: 'Tonnes of CO2 equivalent per token',
    },
    {
      key: 'projectLocation',
      label: 'Project Location',
      type: 'string',
      required: false,
    },
  ],
  defaultPolicies: ['pol_kyc_required', 'pol_registry_attestation'],
  availableActions: ['issue', 'transfer', 'retire'],
  rights: {
    transferable: true,
    redeemable: false,
    expirable: false,
    retirable: true,
    payoutEnabled: false,
  },
};

// ============================================
// Ticket Template
// ============================================

export const ticketTemplate: AssetTemplate = {
  id: 'tmpl_ticket_v1',
  type: 'ticket',
  name: 'Event Ticket',
  description: 'Access tickets for events with expiry and QR verification',
  profile: 'unique_nonfungible',
  icon: 'Ticket',
  color: '#A855F7', // purple
  schema: [
    ...commonFields,
    {
      key: 'eventName',
      label: 'Event Name',
      type: 'string',
      required: true,
    },
    {
      key: 'eventDate',
      label: 'Event Date',
      type: 'date',
      required: true,
    },
    {
      key: 'venue',
      label: 'Venue',
      type: 'string',
      required: true,
    },
    {
      key: 'ticketType',
      label: 'Ticket Type',
      type: 'enum',
      required: true,
      options: ['General Admission', 'VIP', 'Backstage', 'Reserved Seating'],
    },
    {
      key: 'seatNumber',
      label: 'Seat Number',
      type: 'string',
      required: false,
    },
    {
      key: 'maxTransfers',
      label: 'Maximum Transfers',
      type: 'number',
      required: false,
      description: 'Limit on how many times the ticket can be resold',
    },
  ],
  defaultPolicies: ['pol_transfer_fee_5pct', 'pol_expiry_after_event'],
  availableActions: ['issue', 'transfer', 'expire'],
  rights: {
    transferable: true,
    redeemable: false,
    expirable: true,
    retirable: false,
    payoutEnabled: false,
  },
};

// ============================================
// Royalty Template
// ============================================

export const royaltyTemplate: AssetTemplate = {
  id: 'tmpl_royalty_v1',
  type: 'royalty',
  name: 'Royalty Stream',
  description: 'Fractional ownership in revenue streams (music, IP, etc.)',
  profile: 'regulated_fungible',
  icon: 'Music',
  color: '#F59E0B', // amber
  schema: [
    ...commonFields,
    {
      key: 'assetTitle',
      label: 'Asset Title',
      type: 'string',
      required: true,
      description: 'Name of the underlying asset (song, patent, etc.)',
    },
    {
      key: 'assetType',
      label: 'Asset Type',
      type: 'enum',
      required: true,
      options: ['Music', 'Film', 'Patent', 'Trademark', 'Book', 'Other IP'],
    },
    {
      key: 'royaltyPercentage',
      label: 'Royalty Percentage',
      type: 'number',
      required: true,
      description: 'Percentage of revenue distributed to token holders',
    },
    {
      key: 'distributionFrequency',
      label: 'Distribution Frequency',
      type: 'enum',
      required: true,
      options: ['Monthly', 'Quarterly', 'Annually'],
    },
    {
      key: 'oracleProvider',
      label: 'Revenue Oracle Provider',
      type: 'string',
      required: false,
      description: 'Provider verifying revenue data',
    },
  ],
  defaultPolicies: ['pol_kyc_required', 'pol_oracle_revenue_proof'],
  availableActions: ['issue', 'transfer', 'distribute'],
  rights: {
    transferable: true,
    redeemable: false,
    expirable: false,
    retirable: false,
    payoutEnabled: true,
  },
};

// ============================================
// Loyalty Template
// ============================================

export const loyaltyTemplate: AssetTemplate = {
  id: 'tmpl_loyalty_v1',
  type: 'loyalty',
  name: 'Loyalty Points',
  description: 'Non-transferable reward points for loyalty programs',
  profile: 'unregulated_fungible',
  icon: 'Star',
  color: '#EC4899', // pink
  schema: [
    ...commonFields,
    {
      key: 'programName',
      label: 'Program Name',
      type: 'string',
      required: true,
    },
    {
      key: 'pointValue',
      label: 'Point Value (USD)',
      type: 'number',
      required: false,
      description: 'Monetary value per point',
    },
    {
      key: 'expiryMonths',
      label: 'Expiry (Months)',
      type: 'number',
      required: false,
      description: 'Points expire after this many months of inactivity',
    },
    {
      key: 'redemptionOptions',
      label: 'Redemption Options',
      type: 'string',
      required: false,
      description: 'Comma-separated list of redemption options',
    },
  ],
  defaultPolicies: ['pol_non_transferable'],
  availableActions: ['issue', 'redeem'],
  rights: {
    transferable: false,
    redeemable: true,
    expirable: true,
    retirable: false,
    payoutEnabled: false,
  },
};

// ============================================
// Commodity Template
// ============================================

export const commodityTemplate: AssetTemplate = {
  id: 'tmpl_commodity_v1',
  type: 'commodity',
  name: 'Commodity Token',
  description: 'Tokenized commodities with proof-of-reserve',
  profile: 'regulated_fungible',
  icon: 'Gem',
  color: '#F97316', // orange
  schema: [
    ...commonFields,
    {
      key: 'commodityType',
      label: 'Commodity Type',
      type: 'enum',
      required: true,
      options: ['Gold', 'Silver', 'Platinum', 'Oil', 'Wheat', 'Coffee', 'Other'],
    },
    {
      key: 'unitWeight',
      label: 'Unit Weight',
      type: 'string',
      required: true,
      description: 'Weight per token (e.g., "1 troy oz")',
    },
    {
      key: 'custodian',
      label: 'Custodian',
      type: 'string',
      required: true,
      description: 'Entity holding the physical commodity',
    },
    {
      key: 'storageLocation',
      label: 'Storage Location',
      type: 'string',
      required: false,
    },
    {
      key: 'purityGrade',
      label: 'Purity/Grade',
      type: 'string',
      required: false,
      description: 'Quality specification (e.g., "99.99% pure")',
    },
    {
      key: 'proofOfReserveUrl',
      label: 'Proof of Reserve URL',
      type: 'url',
      required: false,
    },
  ],
  defaultPolicies: ['pol_kyc_required', 'pol_proof_of_reserve'],
  availableActions: ['issue', 'transfer', 'redeem', 'freeze'],
  rights: {
    transferable: true,
    redeemable: true,
    expirable: false,
    retirable: false,
    payoutEnabled: false,
  },
};

// ============================================
// Equity Template
// ============================================

export const equityTemplate: AssetTemplate = {
  id: 'tmpl_equity_v1',
  type: 'equity',
  name: 'Company Equity',
  description: 'Tokenized shares or equity units in a company',
  profile: 'regulated_fungible',
  icon: 'Briefcase',
  color: '#6366F1', // indigo
  schema: [
    ...commonFields,
    {
      key: 'companyName',
      label: 'Company Name',
      type: 'string',
      required: true,
    },
    {
      key: 'shareClass',
      label: 'Share Class',
      type: 'enum',
      required: true,
      options: ['Common', 'Preferred', 'Series A', 'Series B', 'Series C', 'Convertible Note'],
    },
    {
      key: 'parValue',
      label: 'Par Value (USD)',
      type: 'number',
      required: false,
    },
    {
      key: 'votingRights',
      label: 'Voting Rights',
      type: 'boolean',
      required: true,
    },
    {
      key: 'dividendEligible',
      label: 'Dividend Eligible',
      type: 'boolean',
      required: true,
    },
    {
      key: 'registrationNumber',
      label: 'Registration Number',
      type: 'string',
      required: false,
      description: 'Company registration or SEC filing number',
    },
  ],
  defaultPolicies: ['pol_kyc_required', 'pol_accredited_only', 'pol_lockup_12m'],
  availableActions: ['issue', 'transfer', 'distribute', 'freeze'],
  rights: {
    transferable: true,
    redeemable: false,
    expirable: false,
    retirable: false,
    payoutEnabled: true,
  },
};

// ============================================
// Custom Template (Base)
// ============================================

export const customTemplate: AssetTemplate = {
  id: 'tmpl_custom_v1',
  type: 'custom',
  name: 'Custom Asset',
  description: 'Create a custom asset type with your own schema',
  profile: 'regulated_fungible',
  icon: 'Sparkles',
  color: '#64748B', // slate
  schema: [...commonFields],
  defaultPolicies: [],
  availableActions: ['issue', 'transfer', 'redeem', 'retire', 'expire', 'distribute', 'freeze'],
  rights: {
    transferable: true,
    redeemable: true,
    expirable: true,
    retirable: true,
    payoutEnabled: true,
  },
};

// ============================================
// Template Registry
// ============================================

export const templateRegistry: Record<TemplateType, AssetTemplate> = {
  real_estate: realEstateTemplate,
  carbon_credit: carbonCreditTemplate,
  ticket: ticketTemplate,
  royalty: royaltyTemplate,
  loyalty: loyaltyTemplate,
  commodity: commodityTemplate,
  equity: equityTemplate,
  custom: customTemplate,
};

/**
 * Get a template by type
 */
export function getTemplate(type: TemplateType): AssetTemplate {
  return templateRegistry[type];
}

/**
 * Get all available templates
 */
export function getAllTemplates(): AssetTemplate[] {
  return Object.values(templateRegistry);
}

/**
 * Get templates by profile
 */
export function getTemplatesByProfile(profile: AssetTemplate['profile']): AssetTemplate[] {
  return Object.values(templateRegistry).filter((t) => t.profile === profile);
}

/**
 * Check if an action is available for a template
 */
export function isActionAvailable(
  templateType: TemplateType,
  action: ActionType
): boolean {
  const template = templateRegistry[templateType];
  return template?.availableActions.includes(action) ?? false;
}

/**
 * Get action label for display
 */
export function getActionLabel(action: ActionType): string {
  const labels: Record<ActionType, string> = {
    issue: 'Issue',
    transfer: 'Transfer',
    redeem: 'Redeem',
    retire: 'Retire',
    expire: 'Expire',
    distribute: 'Distribute',
    freeze: 'Freeze',
    unfreeze: 'Unfreeze',
    revoke: 'Revoke',
    clawback: 'Clawback',
  };
  return labels[action];
}

/**
 * Get action description
 */
export function getActionDescription(action: ActionType): string {
  const descriptions: Record<ActionType, string> = {
    issue: 'Mint new tokens or allocate to investors',
    transfer: 'Transfer ownership to another party',
    redeem: 'Claim the underlying asset or value',
    retire: 'Permanently burn tokens with proof (e.g., carbon offset)',
    expire: 'Mark the asset as expired (e.g., after event)',
    distribute: 'Distribute payouts to all holders',
    freeze: 'Temporarily lock the asset for compliance',
    unfreeze: 'Remove the compliance lock',
    revoke: 'Revoke access or ownership',
    clawback: 'Force return of tokens for compliance',
  };
  return descriptions[action];
}
