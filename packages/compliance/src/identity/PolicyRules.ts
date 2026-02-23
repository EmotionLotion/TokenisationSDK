/**
 * Policy Rules Engine
 *
 * Policies define WHO can do WHAT with WHICH tokens.
 * They evaluate claims and produce ALLOW/DENY decisions with reasons.
 *
 * Design principles:
 * 1. Policies read claims, never raw KYC data
 * 2. Decisions must be explainable (reason codes)
 * 3. Policies are versioned and auditable
 * 4. On-chain enforcement uses simplified bitmask check
 */

import {
  ClaimType,
  ClaimBitmask,
  claimTypesToBitmask,
  satisfiesMask,
  type ClaimSet,
} from './Claims.js';

// ============================================================================
// POLICY TYPES
// ============================================================================

/**
 * Policy decision outcome
 */
export type PolicyOutcome = 'ALLOW' | 'DENY' | 'CONDITIONAL';

/**
 * Denial reason codes (must be explainable)
 */
export enum DenyReason {
  // KYC-related
  KYC_NOT_APPROVED = 'KYC_NOT_APPROVED',
  KYC_EXPIRED = 'KYC_EXPIRED',
  KYC_LEVEL_INSUFFICIENT = 'KYC_LEVEL_INSUFFICIENT',

  // Jurisdiction-related
  RESIDENCY_NOT_VERIFIED = 'RESIDENCY_NOT_VERIFIED',
  JURISDICTION_BLOCKED = 'JURISDICTION_BLOCKED',
  JURISDICTION_MISMATCH = 'JURISDICTION_MISMATCH',

  // Investor status
  NOT_ACCREDITED = 'NOT_ACCREDITED',
  NOT_INSTITUTIONAL = 'NOT_INSTITUTIONAL',
  NOT_QUALIFIED_PURCHASER = 'NOT_QUALIFIED_PURCHASER',

  // Compliance-related
  SANCTIONS_FLAGGED = 'SANCTIONS_FLAGGED',
  PEP_FLAGGED = 'PEP_FLAGGED',
  SOURCE_OF_FUNDS_MISSING = 'SOURCE_OF_FUNDS_MISSING',

  // Wallet-related
  WALLET_NOT_LINKED = 'WALLET_NOT_LINKED',
  WALLET_FROZEN = 'WALLET_FROZEN',

  // Generic
  CLAIMS_EXPIRED = 'CLAIMS_EXPIRED',
  MISSING_REQUIRED_CLAIMS = 'MISSING_REQUIRED_CLAIMS',
  POLICY_NOT_FOUND = 'POLICY_NOT_FOUND',
}

/**
 * Policy decision with explanation
 */
export interface PolicyDecision {
  /** Decision outcome */
  outcome: PolicyOutcome;

  /** Denial reason (if DENY) */
  denyReason?: DenyReason;

  /** Human-readable explanation */
  explanation: string;

  /** Policy ID that made the decision */
  policyId: string;

  /** Policy version */
  policyVersion: string;

  /** Claims that were evaluated */
  evaluatedClaims: ClaimType[];

  /** Missing claims that caused denial */
  missingClaims?: ClaimType[];

  /** Conditions that must be met (if CONDITIONAL) */
  conditions?: string[];

  /** Timestamp of decision */
  decidedAt: string;
}

// ============================================================================
// POLICY DEFINITION
// ============================================================================

/**
 * A policy rule defines a single condition
 */
export interface PolicyRule {
  /** Rule ID for tracking */
  id: string;

  /** Human-readable description */
  description: string;

  /** Required claim types (AND logic) */
  requiredClaims: ClaimType[];

  /** Optional: jurisdiction must match */
  jurisdictionMustMatch?: string;

  /** Optional: jurisdiction must NOT match (for foreign investor rules) */
  jurisdictionMustNotMatch?: string;

  /** Denial reason if this rule fails */
  denyReason: DenyReason;
}

/**
 * A policy is a set of rules with OR/AND logic
 */
export interface Policy {
  /** Unique policy ID */
  id: string;

  /** Human-readable name */
  name: string;

  /** Policy version */
  version: string;

  /** Description */
  description: string;

  /** Asset types this policy applies to */
  assetTypes: string[];

  /** Jurisdictions this policy applies to */
  jurisdictions: string[];

  /**
   * Rule groups with OR logic between groups.
   * Within each group, rules have AND logic.
   *
   * Example: "UAE resident" OR "foreign accredited investor"
   * = [
   *     [{ requiredClaims: [KYC, RESIDENCY], jurisdictionMustMatch: 'AE' }],
   *     [{ requiredClaims: [KYC, ACCREDITED], jurisdictionMustNotMatch: 'AE' }]
   *   ]
   */
  ruleGroups: PolicyRule[][];

  /** Minimum on-chain bitmask (computed from rules) */
  onChainBitmask: bigint;

  /** Created timestamp */
  createdAt: string;

  /** Whether policy is active */
  isActive: boolean;
}

// ============================================================================
// UAE REAL ESTATE POLICY
// ============================================================================

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

// ============================================================================
// POLICY EVALUATOR
// ============================================================================

/**
 * Evaluate a claim set against a policy
 */
export function evaluatePolicy(
  claimSet: ClaimSet,
  policy: Policy
): PolicyDecision {
  const now = new Date();

  // Check if claims have expired
  if (claimSet.earliestExpiry && new Date(claimSet.earliestExpiry) <= now) {
    return {
      outcome: 'DENY',
      denyReason: DenyReason.CLAIMS_EXPIRED,
      explanation: 'One or more required claims have expired. Please re-verify.',
      policyId: policy.id,
      policyVersion: policy.version,
      evaluatedClaims: [],
      decidedAt: now.toISOString(),
    };
  }

  // Evaluate rule groups (OR logic between groups)
  for (const ruleGroup of policy.ruleGroups) {
    const groupResult = evaluateRuleGroup(claimSet, ruleGroup);

    if (groupResult.passed) {
      // This group passed - policy allows
      return {
        outcome: 'ALLOW',
        explanation: `Allowed by rule group. ${groupResult.explanation}`,
        policyId: policy.id,
        policyVersion: policy.version,
        evaluatedClaims: groupResult.evaluatedClaims,
        decidedAt: now.toISOString(),
      };
    }
  }

  // No rule group passed - collect all failures
  const allMissingClaims = new Set<ClaimType>();
  let lastDenyReason = DenyReason.MISSING_REQUIRED_CLAIMS;

  for (const ruleGroup of policy.ruleGroups) {
    for (const rule of ruleGroup) {
      for (const claimType of rule.requiredClaims) {
        const hasClaim = claimSet.claims.some(
          (c) => c.type === claimType && c.isActive && new Date(c.expiresAt) > now
        );
        if (!hasClaim) {
          allMissingClaims.add(claimType);
        }
      }
    }
  }

  // Determine the most specific deny reason
  if (allMissingClaims.has(ClaimType.KYC_APPROVED)) {
    lastDenyReason = DenyReason.KYC_NOT_APPROVED;
  } else if (allMissingClaims.has(ClaimType.SANCTIONS_CLEAR)) {
    lastDenyReason = DenyReason.SANCTIONS_FLAGGED;
  } else if (allMissingClaims.has(ClaimType.RESIDENCY) && allMissingClaims.has(ClaimType.ACCREDITED_INVESTOR)) {
    lastDenyReason = DenyReason.JURISDICTION_MISMATCH;
  } else if (allMissingClaims.has(ClaimType.ACCREDITED_INVESTOR)) {
    lastDenyReason = DenyReason.NOT_ACCREDITED;
  }

  return {
    outcome: 'DENY',
    denyReason: lastDenyReason,
    explanation: buildDenyExplanation(lastDenyReason, policy),
    policyId: policy.id,
    policyVersion: policy.version,
    evaluatedClaims: Array.from(allMissingClaims),
    missingClaims: Array.from(allMissingClaims),
    decidedAt: now.toISOString(),
  };
}

/**
 * Evaluate a single rule group (AND logic within group)
 */
function evaluateRuleGroup(
  claimSet: ClaimSet,
  rules: PolicyRule[]
): { passed: boolean; explanation: string; evaluatedClaims: ClaimType[] } {
  const now = new Date();
  const evaluatedClaims: ClaimType[] = [];

  for (const rule of rules) {
    // Check required claims
    for (const claimType of rule.requiredClaims) {
      evaluatedClaims.push(claimType);

      const claim = claimSet.claims.find(
        (c) => c.type === claimType && c.isActive && new Date(c.expiresAt) > now
      );

      if (!claim) {
        return {
          passed: false,
          explanation: `Missing required claim: ${claimType}`,
          evaluatedClaims,
        };
      }

      // Check jurisdiction constraints
      if (rule.jurisdictionMustMatch && claim.jurisdiction !== rule.jurisdictionMustMatch) {
        return {
          passed: false,
          explanation: `Jurisdiction mismatch: expected ${rule.jurisdictionMustMatch}, got ${claim.jurisdiction}`,
          evaluatedClaims,
        };
      }

      if (rule.jurisdictionMustNotMatch && claim.jurisdiction === rule.jurisdictionMustNotMatch) {
        return {
          passed: false,
          explanation: `Jurisdiction must not be ${rule.jurisdictionMustNotMatch}`,
          evaluatedClaims,
        };
      }
    }
  }

  return {
    passed: true,
    explanation: `All ${rules.length} rules in group passed`,
    evaluatedClaims,
  };
}

/**
 * Build human-readable deny explanation
 */
function buildDenyExplanation(reason: DenyReason, policy: Policy): string {
  const explanations: Record<DenyReason, string> = {
    [DenyReason.KYC_NOT_APPROVED]: 'KYC verification is required but not completed or approved.',
    [DenyReason.KYC_EXPIRED]: 'KYC verification has expired. Please re-verify.',
    [DenyReason.KYC_LEVEL_INSUFFICIENT]: 'Higher KYC verification level required for this asset type.',
    [DenyReason.RESIDENCY_NOT_VERIFIED]: 'Residency verification required but not completed.',
    [DenyReason.JURISDICTION_BLOCKED]: 'Your jurisdiction is not allowed for this asset.',
    [DenyReason.JURISDICTION_MISMATCH]: `For ${policy.name}: UAE residents can invest directly. Non-UAE residents must be accredited investors.`,
    [DenyReason.NOT_ACCREDITED]: 'Accredited investor status required but not verified.',
    [DenyReason.NOT_INSTITUTIONAL]: 'Institutional investor status required.',
    [DenyReason.NOT_QUALIFIED_PURCHASER]: 'Qualified purchaser status required.',
    [DenyReason.SANCTIONS_FLAGGED]: 'Unable to proceed due to sanctions screening results.',
    [DenyReason.PEP_FLAGGED]: 'Additional review required for politically exposed persons.',
    [DenyReason.SOURCE_OF_FUNDS_MISSING]: 'Source of funds verification required.',
    [DenyReason.WALLET_NOT_LINKED]: 'Please link a verified wallet to your identity.',
    [DenyReason.WALLET_FROZEN]: 'Your wallet has been frozen. Please contact support.',
    [DenyReason.CLAIMS_EXPIRED]: 'One or more verification claims have expired.',
    [DenyReason.MISSING_REQUIRED_CLAIMS]: 'Required verification claims are missing.',
    [DenyReason.POLICY_NOT_FOUND]: 'No applicable policy found for this asset.',
  };

  return explanations[reason] || 'Transfer not allowed by policy.';
}

// ============================================================================
// POLICY REGISTRY
// ============================================================================

/**
 * Policy registry for managing active policies
 */
export class PolicyRegistry {
  private policies: Map<string, Policy> = new Map();
  private assetTypePolicies: Map<string, string[]> = new Map();
  private jurisdictionPolicies: Map<string, string[]> = new Map();

  /**
   * Register a policy
   */
  register(policy: Policy): void {
    this.policies.set(policy.id, policy);

    // Index by asset type
    for (const assetType of policy.assetTypes) {
      const existing = this.assetTypePolicies.get(assetType) || [];
      if (!existing.includes(policy.id)) {
        existing.push(policy.id);
        this.assetTypePolicies.set(assetType, existing);
      }
    }

    // Index by jurisdiction
    for (const jurisdiction of policy.jurisdictions) {
      const existing = this.jurisdictionPolicies.get(jurisdiction) || [];
      if (!existing.includes(policy.id)) {
        existing.push(policy.id);
        this.jurisdictionPolicies.set(jurisdiction, existing);
      }
    }
  }

  /**
   * Get policy by ID
   */
  get(policyId: string): Policy | undefined {
    return this.policies.get(policyId);
  }

  /**
   * Find policies for an asset type
   */
  findByAssetType(assetType: string): Policy[] {
    const policyIds = this.assetTypePolicies.get(assetType) || [];
    return policyIds
      .map((id) => this.policies.get(id))
      .filter((p): p is Policy => p !== undefined && p.isActive);
  }

  /**
   * Find policies for a jurisdiction
   */
  findByJurisdiction(jurisdiction: string): Policy[] {
    const policyIds = this.jurisdictionPolicies.get(jurisdiction) || [];
    return policyIds
      .map((id) => this.policies.get(id))
      .filter((p): p is Policy => p !== undefined && p.isActive);
  }

  /**
   * Find best matching policy for asset + jurisdiction
   */
  findBestMatch(assetType: string, jurisdiction: string): Policy | undefined {
    const byAsset = this.findByAssetType(assetType);
    const byJurisdiction = byAsset.filter((p) => p.jurisdictions.includes(jurisdiction));

    // Prefer jurisdiction-specific policy
    if (byJurisdiction.length > 0) {
      return byJurisdiction[0];
    }

    // Fall back to asset-type policy
    return byAsset[0];
  }

  /**
   * Get all active policies
   */
  getAll(): Policy[] {
    return Array.from(this.policies.values()).filter((p) => p.isActive);
  }
}

// ============================================================================
// DEFAULT REGISTRY WITH UAE POLICY
// ============================================================================

/**
 * Create default policy registry with standard policies
 */
export function createDefaultPolicyRegistry(): PolicyRegistry {
  const registry = new PolicyRegistry();

  // Register UAE Real Estate policy
  registry.register(UAE_REAL_ESTATE_POLICY);

  // Could add more default policies here:
  // registry.register(US_REG_D_POLICY);
  // registry.register(EU_MIFID_POLICY);

  return registry;
}
