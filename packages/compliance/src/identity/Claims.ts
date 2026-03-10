/**
 * Claims System
 *
 * Claims are the SDK's internal currency for identity verification.
 * They normalize KYC provider outputs into a consistent schema that
 * policies can evaluate against.
 *
 * Key principles:
 * 1. Claims are the ONLY thing policies read
 * 2. Claims have expiry - verification isn't forever
 * 3. Claims map to on-chain bitmasks for enforcement
 * 4. Provider details stay off-chain (privacy)
 */

import { z } from 'zod';

// ============================================================================
// CLAIM TYPES
// ============================================================================

/**
 * Standard claim types supported by the SDK.
 * These map to bitmask positions for on-chain enforcement.
 */
export enum ClaimType {
  /** KYC verification completed and approved */
  KYC_APPROVED = 'KYC_APPROVED',

  /** Residency verified for a specific country */
  RESIDENCY = 'RESIDENCY',

  /** Accredited investor status verified */
  ACCREDITED_INVESTOR = 'ACCREDITED_INVESTOR',

  /** Qualified purchaser (higher threshold than accredited) */
  QUALIFIED_PURCHASER = 'QUALIFIED_PURCHASER',

  /** Institutional investor */
  INSTITUTIONAL = 'INSTITUTIONAL',

  /** Sanctions screening passed */
  SANCTIONS_CLEAR = 'SANCTIONS_CLEAR',

  /** Not a Politically Exposed Person */
  PEP_CLEAR = 'PEP_CLEAR',

  /** Source of funds verified */
  SOURCE_OF_FUNDS = 'SOURCE_OF_FUNDS',

  /** Age verification (18+) */
  AGE_VERIFIED = 'AGE_VERIFIED',

  /** Entity type verified (for corporates) */
  ENTITY_VERIFIED = 'ENTITY_VERIFIED',
}

/**
 * On-chain bitmask mapping for claims.
 * Each claim has a bit position in a uint256.
 *
 * On-chain storage uses these bits to efficiently check
 * multiple claims in a single comparison.
 */
export const ClaimBitmask: Record<ClaimType, bigint> = {
  [ClaimType.KYC_APPROVED]: 1n << 0n,         // bit 0
  [ClaimType.RESIDENCY]: 1n << 1n,            // bit 1
  [ClaimType.ACCREDITED_INVESTOR]: 1n << 2n,  // bit 2
  [ClaimType.QUALIFIED_PURCHASER]: 1n << 3n,  // bit 3
  [ClaimType.INSTITUTIONAL]: 1n << 4n,        // bit 4
  [ClaimType.SANCTIONS_CLEAR]: 1n << 5n,      // bit 5
  [ClaimType.PEP_CLEAR]: 1n << 6n,            // bit 6
  [ClaimType.SOURCE_OF_FUNDS]: 1n << 7n,      // bit 7
  [ClaimType.AGE_VERIFIED]: 1n << 8n,         // bit 8
  [ClaimType.ENTITY_VERIFIED]: 1n << 9n,      // bit 9
};

// ============================================================================
// CLAIM SCHEMA
// ============================================================================

/**
 * A claim issued to an identity
 */
export interface Claim {
  /** Unique claim ID */
  id: string;

  /** Identity (investor) this claim belongs to */
  identityId: string;

  /** Type of claim */
  type: ClaimType;

  /** Claim value (true for boolean claims, or specific value) */
  value: string | boolean | number;

  /** ISO country code for jurisdiction-specific claims */
  jurisdiction?: string;

  /** KYC provider that issued this claim */
  provider: string;

  /** Provider's reference ID */
  providerReferenceId?: string;

  /** When the claim was issued */
  issuedAt: string;

  /** When the claim expires (ISO 8601) */
  expiresAt: string;

  /** Whether claim is currently active */
  isActive: boolean;

  /** Hash of supporting evidence (for audit) */
  evidenceHash?: string;

  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Zod schema for claim validation
 */
export const ClaimSchema = z.object({
  id: z.string().uuid(),
  identityId: z.string().uuid(),
  type: z.nativeEnum(ClaimType),
  value: z.union([z.string(), z.boolean(), z.number()]),
  jurisdiction: z.string().length(2).optional(),
  provider: z.string(),
  providerReferenceId: z.string().optional(),
  issuedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  isActive: z.boolean(),
  evidenceHash: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

// ============================================================================
// CLAIM SET (aggregated claims for an identity)
// ============================================================================

/**
 * ClaimSet represents all active claims for an identity.
 * This is what policies evaluate against.
 */
export interface ClaimSet {
  /** Identity ID */
  identityId: string;

  /** All active claims */
  claims: Claim[];

  /** Computed bitmask for on-chain enforcement */
  bitmask: bigint;

  /** Earliest expiry among all claims */
  earliestExpiry: string | null;

  /** Primary jurisdiction (from residency claim) */
  jurisdiction: string | null;

  /** Last updated timestamp */
  updatedAt: string;
}

// ============================================================================
// CLAIM HELPERS
// ============================================================================

/**
 * Compute bitmask from a set of claims
 */
export function computeClaimBitmask(claims: Claim[]): bigint {
  let mask = 0n;

  const now = new Date();

  for (const claim of claims) {
    // Only include active, non-expired claims
    if (!claim.isActive) continue;
    if (new Date(claim.expiresAt) <= now) continue;

    const bit = ClaimBitmask[claim.type];
    if (bit) {
      mask |= bit;
    }
  }

  return mask;
}

/**
 * Check if a bitmask satisfies required claims
 */
export function satisfiesMask(claimMask: bigint, requiredMask: bigint): boolean {
  return (claimMask & requiredMask) === requiredMask;
}

/**
 * Get human-readable claim names from bitmask
 */
export function bitmaskToClaimTypes(mask: bigint): ClaimType[] {
  const types: ClaimType[] = [];

  for (const [type, bit] of Object.entries(ClaimBitmask)) {
    if ((mask & bit) === bit) {
      types.push(type as ClaimType);
    }
  }

  return types;
}

/**
 * Convert claim types to bitmask
 */
export function claimTypesToBitmask(types: ClaimType[]): bigint {
  let mask = 0n;
  for (const type of types) {
    mask |= ClaimBitmask[type];
  }
  return mask;
}

/**
 * Get earliest expiry from claims
 */
export function getEarliestExpiry(claims: Claim[]): string | null {
  const activeClaims = claims.filter((c) => c.isActive);
  if (activeClaims.length === 0) return null;

  const dates = activeClaims.map((c) => new Date(c.expiresAt));
  const earliest = new Date(Math.min(...dates.map((d) => d.getTime())));

  return earliest.toISOString();
}

/**
 * Build a ClaimSet from claims
 */
export function buildClaimSet(identityId: string, claims: Claim[]): ClaimSet {
  const activeClaims = claims.filter((c) => c.isActive && new Date(c.expiresAt) > new Date());

  const residencyClaim = activeClaims.find((c) => c.type === ClaimType.RESIDENCY);

  return {
    identityId,
    claims: activeClaims,
    bitmask: computeClaimBitmask(activeClaims),
    earliestExpiry: getEarliestExpiry(activeClaims),
    jurisdiction: residencyClaim?.jurisdiction || null,
    updatedAt: new Date().toISOString(),
  };
}

// ============================================================================
// PREDEFINED REQUIREMENT MASKS
// ============================================================================

/**
 * Common requirement masks for different asset types.
 * These define what claims are needed for different token types.
 */
export const RequirementMasks = {
  /** Basic KYC only */
  BASIC_KYC: ClaimBitmask[ClaimType.KYC_APPROVED] | ClaimBitmask[ClaimType.SANCTIONS_CLEAR],

  /** Standard securities (US Reg D) */
  US_REG_D: ClaimBitmask[ClaimType.KYC_APPROVED] |
    ClaimBitmask[ClaimType.ACCREDITED_INVESTOR] |
    ClaimBitmask[ClaimType.SANCTIONS_CLEAR],

  /** UAE resident investor */
  UAE_RESIDENT: ClaimBitmask[ClaimType.KYC_APPROVED] |
    ClaimBitmask[ClaimType.RESIDENCY] |
    ClaimBitmask[ClaimType.SANCTIONS_CLEAR],

  /** UAE foreign accredited investor */
  UAE_FOREIGN_ACCREDITED: ClaimBitmask[ClaimType.KYC_APPROVED] |
    ClaimBitmask[ClaimType.ACCREDITED_INVESTOR] |
    ClaimBitmask[ClaimType.SANCTIONS_CLEAR],

  /** Institutional only */
  INSTITUTIONAL: ClaimBitmask[ClaimType.KYC_APPROVED] |
    ClaimBitmask[ClaimType.INSTITUTIONAL] |
    ClaimBitmask[ClaimType.SANCTIONS_CLEAR] |
    ClaimBitmask[ClaimType.SOURCE_OF_FUNDS],

  /** Non-regulated (tickets, loyalty) */
  UNREGULATED: 0n, // No claims required
} as const;

// ============================================================================
// CLAIM ISSUANCE
// ============================================================================

/**
 * Parameters for issuing a new claim
 */
export interface IssueClaimParams {
  identityId: string;
  type: ClaimType;
  value: string | boolean | number;
  jurisdiction?: string;
  provider: string;
  providerReferenceId?: string;
  expiresInDays?: number;
  evidenceHash?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Create a new claim from issuance params
 */
export function createClaim(params: IssueClaimParams): Omit<Claim, 'id'> {
  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setDate(expiresAt.getDate() + (params.expiresInDays || 365));

  return {
    identityId: params.identityId,
    type: params.type,
    value: params.value,
    jurisdiction: params.jurisdiction,
    provider: params.provider,
    providerReferenceId: params.providerReferenceId,
    issuedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    isActive: true,
    evidenceHash: params.evidenceHash,
    metadata: params.metadata,
  };
}

// ============================================================================
// KYC RESULT TO CLAIMS MAPPING
// ============================================================================

/**
 * Canonical KYC result (normalized from any provider)
 */
export interface KYCResult {
  /** Provider identifier */
  provider: string;

  /** Provider's reference ID */
  providerReferenceId: string;

  /** KYC status */
  status: 'pending' | 'approved' | 'rejected';

  /** Verification level achieved */
  level: 'basic' | 'standard' | 'enhanced' | 'institutional';

  /** Verified jurisdiction (ISO country code) */
  jurisdiction: string;

  /** Investor type */
  investorType: 'individual' | 'entity';

  /** Accredited investor status */
  accreditedInvestor: boolean;

  /** Sanctions screening result */
  sanctionsStatus: 'clear' | 'flagged' | 'blocked';

  /** PEP status */
  isPEP: boolean;

  /** Risk score (0-100, optional) */
  riskScore?: number;

  /** When verification expires */
  expiresAt: string;

  /** Hash of evidence documents */
  evidenceHash?: string;
}

/**
 * Convert a KYC result to claims.
 * This is the normalization point - all providers go through here.
 */
export function kycResultToClaims(
  identityId: string,
  result: KYCResult
): Array<Omit<Claim, 'id'>> {
  const claims: Array<Omit<Claim, 'id'>> = [];
  const baseParams = {
    identityId,
    provider: result.provider,
    providerReferenceId: result.providerReferenceId,
    expiresAt: result.expiresAt,
    evidenceHash: result.evidenceHash,
    isActive: true,
    issuedAt: new Date().toISOString(),
  };

  // Only issue claims for approved KYC
  if (result.status !== 'approved') {
    return claims;
  }

  // KYC Approved
  claims.push({
    ...baseParams,
    type: ClaimType.KYC_APPROVED,
    value: true,
  });

  // Residency
  claims.push({
    ...baseParams,
    type: ClaimType.RESIDENCY,
    value: result.jurisdiction,
    jurisdiction: result.jurisdiction,
  });

  // Accredited investor
  if (result.accreditedInvestor) {
    claims.push({
      ...baseParams,
      type: ClaimType.ACCREDITED_INVESTOR,
      value: true,
    });
  }

  // Institutional
  if (result.level === 'institutional') {
    claims.push({
      ...baseParams,
      type: ClaimType.INSTITUTIONAL,
      value: true,
    });
  }

  // Sanctions
  if (result.sanctionsStatus === 'clear') {
    claims.push({
      ...baseParams,
      type: ClaimType.SANCTIONS_CLEAR,
      value: true,
    });
  }

  // PEP
  if (!result.isPEP) {
    claims.push({
      ...baseParams,
      type: ClaimType.PEP_CLEAR,
      value: true,
    });
  }

  // Entity verification
  if (result.investorType === 'entity') {
    claims.push({
      ...baseParams,
      type: ClaimType.ENTITY_VERIFIED,
      value: true,
    });
  }

  // Age (implied by KYC for individuals)
  if (result.investorType === 'individual') {
    claims.push({
      ...baseParams,
      type: ClaimType.AGE_VERIFIED,
      value: true,
    });
  }

  return claims;
}
