/**
 * UAE Real Estate Policy
 *
 * Rule: "UAE real estate requires UAE residency OR accredited foreign investor"
 *
 * Allow if:
 *   - KYC approved AND
 *   - Sanctions clear AND
 *   - (
 *       (residency == "AE")
 *       OR
 *       (residency != "AE" AND accredited_investor == true)
 *     )
 */

import {
  ClaimType,
  ClaimBitmask,
  DenyReason,
  type Policy,
} from '@tokenisation/compliance';

export const UAE_REAL_ESTATE_POLICY: Policy = {
  id: 'uae-real-estate-v1',
  name: 'UAE Real Estate Investment Policy',
  version: '1.0.0',
  description: 'Policy for UAE real estate tokenization. Requires UAE residency OR accredited foreign investor status.',
  assetTypes: ['REAL_ESTATE', 'UAE_REAL_ESTATE'],
  jurisdictions: ['AE'],

  ruleGroups: [
    // Group 1: UAE Resident
    [
      {
        id: 'uae-resident-kyc',
        description: 'KYC must be approved',
        requiredClaims: [ClaimType.KYC_APPROVED],
        denyReason: DenyReason.KYC_NOT_APPROVED,
      },
      {
        id: 'uae-resident-sanctions',
        description: 'Sanctions screening must be clear',
        requiredClaims: [ClaimType.SANCTIONS_CLEAR],
        denyReason: DenyReason.SANCTIONS_FLAGGED,
      },
      {
        id: 'uae-resident-residency',
        description: 'Must be UAE resident',
        requiredClaims: [ClaimType.RESIDENCY],
        jurisdictionMustMatch: 'AE',
        denyReason: DenyReason.RESIDENCY_NOT_VERIFIED,
      },
    ],

    // Group 2: Foreign Accredited Investor
    [
      {
        id: 'foreign-accredited-kyc',
        description: 'KYC must be approved',
        requiredClaims: [ClaimType.KYC_APPROVED],
        denyReason: DenyReason.KYC_NOT_APPROVED,
      },
      {
        id: 'foreign-accredited-sanctions',
        description: 'Sanctions screening must be clear',
        requiredClaims: [ClaimType.SANCTIONS_CLEAR],
        denyReason: DenyReason.SANCTIONS_FLAGGED,
      },
      {
        id: 'foreign-accredited-status',
        description: 'Must be accredited investor (for non-UAE residents)',
        requiredClaims: [ClaimType.ACCREDITED_INVESTOR],
        jurisdictionMustNotMatch: 'AE',
        denyReason: DenyReason.NOT_ACCREDITED,
      },
    ],
  ],

  // On-chain requires at minimum: KYC + SANCTIONS
  // The residency vs accredited check is done by checking the full mask
  onChainBitmask: ClaimBitmask[ClaimType.KYC_APPROVED] | ClaimBitmask[ClaimType.SANCTIONS_CLEAR],

  createdAt: new Date().toISOString(),
  isActive: true,
};
