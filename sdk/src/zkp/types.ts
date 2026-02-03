/**
 * ZKP Types
 *
 * Type definitions for Zero-Knowledge Proof operations.
 */

/**
 * Supported proof types
 */
export type ZKProofType =
  | 'AGE_PROOF'
  | 'ACCREDITATION_PROOF'
  | 'JURISDICTION_PROOF'
  | 'KYC_STATUS_PROOF'
  | 'COMBINED_COMPLIANCE';

/**
 * Proof type bytes32 constants (for smart contracts)
 */
export const PROOF_TYPE_BYTES32: Record<ZKProofType, string> = {
  AGE_PROOF: '0x4147455f50524f4f460000000000000000000000000000000000000000000000',
  ACCREDITATION_PROOF: '0x4143435245444954415449000000000000000000000000000000000000000000',
  JURISDICTION_PROOF: '0x4a5552495344494354494f000000000000000000000000000000000000000000',
  KYC_STATUS_PROOF: '0x4b59435f5354415455530000000000000000000000000000000000000000000000',
  COMBINED_COMPLIANCE: '0x434f4d42494e45445f434f000000000000000000000000000000000000000000',
};

/**
 * Groth16 proof structure
 */
export interface Groth16Proof {
  pi_a: [string, string];
  pi_b: [[string, string], [string, string]];
  pi_c: [string, string];
  protocol: 'groth16';
  curve: 'bn128';
}

/**
 * Public signals from proof
 */
export interface ZKPublicSignals {
  nullifier: string;
  commitment: string;
  result: string | boolean;
  [key: string]: string | boolean | number;
}

/**
 * Complete proof with public signals
 */
export interface ZKProof {
  proof: Groth16Proof;
  publicSignals: ZKPublicSignals;
}

/**
 * Proof generation inputs
 */
export interface ProofInput {
  // Common inputs
  claimsRoot: string;
  currentTimestamp: number;
  externalNullifier: string;

  // Private claim data
  claimValue: string | number;
  salt: string;
  identityId: string;
  expiryTimestamp: number;

  // Merkle proof
  merklePathElements: string[];
  merklePathIndices: number[];

  // Proof-specific inputs
  [key: string]: unknown;
}

/**
 * Age proof specific inputs
 */
export interface AgeProofInput extends ProofInput {
  birthDate: number; // Unix timestamp
  ageThreshold: number; // Required age in years
}

/**
 * Accreditation proof specific inputs
 */
export interface AccreditationProofInput extends ProofInput {
  netWorth: string; // In USD cents
  annualIncome: string; // In USD cents
  accreditationMethod: 1 | 2 | 3; // 1=net worth, 2=income, 3=professional
  netWorthThreshold: string;
  incomeThreshold: string;
}

/**
 * Jurisdiction proof specific inputs
 */
export interface JurisdictionProofInput extends ProofInput {
  jurisdictionCode: number; // ISO 3166-1 numeric
  allowedJurisdictions: number[];
}

/**
 * KYC status proof specific inputs
 */
export interface KYCStatusProofInput extends ProofInput {
  kycLevel: 1 | 2 | 3 | 4;
  requiredLevel: 1 | 2 | 3 | 4;
  kycProvider: string; // Hash of provider name
  verificationId: string; // Hash of verification ID
}

/**
 * Circuit artifacts
 */
export interface CircuitArtifacts {
  wasm: Uint8Array | string;
  zkey: Uint8Array | string;
  vkey?: VerificationKey;
}

/**
 * Verification key structure
 */
export interface VerificationKey {
  protocol: string;
  curve: string;
  nPublic: number;
  vk_alpha_1: string[];
  vk_beta_2: string[][];
  vk_gamma_2: string[][];
  vk_delta_2: string[][];
  vk_alphabeta_12: string[][][];
  IC: string[][];
}

/**
 * Proof verification result
 */
export interface VerificationResult {
  valid: boolean;
  error?: string;
  nullifier?: string;
  commitment?: string;
}

/**
 * Merkle tree for claims
 */
export interface ClaimsMerkleTree {
  root: string;
  depth: number;
  leaves: string[];
  getProof(leafIndex: number): {
    pathElements: string[];
    pathIndices: number[];
  };
}

/**
 * Claim for ZK proof
 */
export interface ZKClaim {
  claimType: number;
  claimValue: string | number;
  salt: string;
  identityId: string;
  expiryTimestamp: number;
  commitment?: string;
  leafIndex?: number;
}

/**
 * ZKP Plugin configuration
 */
export interface ZKPPluginConfig {
  /** Path to circuit artifacts */
  circuitsPath?: string;
  /** Verifier registry contract address */
  verifierRegistryAddress?: string;
  /** Chain ID */
  chainId?: number;
  /** Enable caching of proofs */
  enableCache?: boolean;
  /** Cache duration (seconds) */
  cacheDuration?: number;
}
