/**
 * PolicyHash - Policy versioning and deterministic hashing
 *
 * Provides cryptographic guarantees that policy decisions can be verified
 * against the exact policy version that was used to make them.
 */

import { createHash } from 'crypto';

// ============================================================================
// TYPES
// ============================================================================

/**
 * PolicyVersion - A specific version of a policy
 */
export interface PolicyVersion {
  /** Unique version identifier */
  id: string;
  /** Sequential version number */
  version: number;
  /** SHA-256 hash of the normalized policy content */
  hash: string;
  /** When this version became effective */
  effectiveFrom: string;
  /** When this version was superseded (if applicable) */
  effectiveTo?: string;
  /** Description of changes from previous version */
  changelog: string;
}

/**
 * PolicyContent - The content structure that gets hashed
 */
export interface PolicyContent {
  /** Policy rules */
  rules: PolicyRule[];
  /** Policy metadata */
  metadata?: Record<string, unknown>;
  /** Policy actions */
  actions?: {
    onAllow?: string[];
    onDeny?: string[];
  };
}

/**
 * PolicyRule - A single rule within a policy
 */
export interface PolicyRule {
  /** Rule identifier */
  id: string;
  /** Rule type */
  type: 'require' | 'limit' | 'block' | 'allow';
  /** Field to check */
  field: string;
  /** Operator */
  op: string;
  /** Expected value */
  value: unknown;
  /** Human-readable message */
  message?: string;
  /** Error code */
  code?: string;
}

// ============================================================================
// HASHING FUNCTIONS
// ============================================================================

/**
 * Deterministically serialize an object for hashing
 * Keys are sorted to ensure consistent hashing regardless of insertion order
 */
function normalizeForHashing(obj: unknown): string {
  if (obj === null || obj === undefined) {
    return 'null';
  }

  if (typeof obj !== 'object') {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    return '[' + obj.map(normalizeForHashing).join(',') + ']';
  }

  // Object: sort keys and recursively normalize values
  const sortedKeys = Object.keys(obj as object).sort();
  const pairs = sortedKeys.map(
    (key) => `"${key}":${normalizeForHashing((obj as Record<string, unknown>)[key])}`
  );
  return '{' + pairs.join(',') + '}';
}

/**
 * Generate a SHA-256 hash of a policy
 *
 * @param policy - The policy content to hash
 * @returns Hexadecimal SHA-256 hash string
 */
export function hashPolicy(policy: PolicyContent | object): string {
  const normalized = normalizeForHashing(policy);
  return createHash('sha256').update(normalized).digest('hex');
}

/**
 * Verify that a policy matches an expected hash
 *
 * @param policy - The policy to verify
 * @param expectedHash - The expected SHA-256 hash
 * @returns true if the policy hash matches
 */
export function verifyPolicyHash(policy: PolicyContent | object, expectedHash: string): boolean {
  const actualHash = hashPolicy(policy);
  return actualHash === expectedHash;
}

// ============================================================================
// VERSION MANAGEMENT
// ============================================================================

/**
 * PolicyVersionManager - Manages policy version history
 */
export class PolicyVersionManager {
  private versions: Map<string, PolicyVersion[]> = new Map();

  /**
   * Create a new policy version
   */
  createVersion(
    policyId: string,
    content: PolicyContent,
    changelog: string
  ): PolicyVersion {
    const existingVersions = this.versions.get(policyId) || [];
    const latestVersion = existingVersions[existingVersions.length - 1];

    // Mark previous version as superseded
    if (latestVersion && !latestVersion.effectiveTo) {
      latestVersion.effectiveTo = new Date().toISOString();
    }

    const newVersion: PolicyVersion = {
      id: `${policyId}-v${existingVersions.length + 1}`,
      version: existingVersions.length + 1,
      hash: hashPolicy(content),
      effectiveFrom: new Date().toISOString(),
      changelog,
    };

    existingVersions.push(newVersion);
    this.versions.set(policyId, existingVersions);

    return newVersion;
  }

  /**
   * Get all versions of a policy
   */
  getVersions(policyId: string): PolicyVersion[] {
    return this.versions.get(policyId) || [];
  }

  /**
   * Get a specific version of a policy
   */
  getVersion(policyId: string, version: number): PolicyVersion | undefined {
    const versions = this.versions.get(policyId);
    return versions?.find((v) => v.version === version);
  }

  /**
   * Get the current (latest) version of a policy
   */
  getCurrentVersion(policyId: string): PolicyVersion | undefined {
    const versions = this.versions.get(policyId);
    return versions?.[versions.length - 1];
  }

  /**
   * Get the version that was effective at a given time
   */
  getVersionAtTime(policyId: string, timestamp: string): PolicyVersion | undefined {
    const versions = this.versions.get(policyId);
    if (!versions) return undefined;

    const targetTime = new Date(timestamp).getTime();

    return versions.find((v) => {
      const effectiveFrom = new Date(v.effectiveFrom).getTime();
      const effectiveTo = v.effectiveTo ? new Date(v.effectiveTo).getTime() : Infinity;
      return targetTime >= effectiveFrom && targetTime < effectiveTo;
    });
  }

  /**
   * Verify that a decision was made with a specific policy version
   */
  verifyDecisionPolicy(
    policyId: string,
    policyHash: string,
    policyVersionNumber: number
  ): { valid: boolean; reason?: string } {
    const version = this.getVersion(policyId, policyVersionNumber);

    if (!version) {
      return {
        valid: false,
        reason: `Policy version ${policyVersionNumber} not found for policy ${policyId}`,
      };
    }

    if (version.hash !== policyHash) {
      return {
        valid: false,
        reason: `Policy hash mismatch: expected ${version.hash}, got ${policyHash}`,
      };
    }

    return { valid: true };
  }
}

/**
 * Singleton instance for SDK-wide policy version management
 */
export const policyVersionManager = new PolicyVersionManager();
