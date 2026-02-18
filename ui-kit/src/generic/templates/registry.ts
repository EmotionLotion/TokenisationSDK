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
