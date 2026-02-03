/**
 * ZKP Module - Zero-Knowledge Proofs for Privacy
 *
 * Provides privacy-preserving compliance verification:
 * - Age proofs (verify age >= threshold without revealing DOB)
 * - Accreditation proofs (verify net worth/income without revealing amounts)
 * - Jurisdiction proofs (verify residency without revealing country)
 * - KYC status proofs (verify KYC level without revealing identity)
 *
 * @example
 * ```typescript
 * import { ZKPPlugin, createClaimsMerkleTree } from '@tokenisation/sdk';
 *
 * const zkp = new ZKPPlugin({
 *   circuitsPath: './circuits/build',
 * });
 *
 * // Create claims Merkle tree
 * const tree = await zkp.createClaimsMerkleTree([
 *   {
 *     claimType: 9, // AGE_VERIFIED
 *     claimValue: 631152000, // Birth date
 *     salt: '0x...',
 *     identityId: '0x...',
 *     expiryTimestamp: Date.now() / 1000 + 86400 * 365,
 *   },
 * ]);
 *
 * // Generate age proof
 * const proof = await zkp.generateAgeProof({
 *   birthDate: 631152000,
 *   ageThreshold: 18,
 *   claimsRoot: tree.value.root,
 *   currentTimestamp: Math.floor(Date.now() / 1000),
 *   externalNullifier: zkp.generateExternalNullifier('transfer-123'),
 *   salt: '0x...',
 *   identityId: '0x...',
 *   expiryTimestamp: Date.now() / 1000 + 86400 * 365,
 *   merklePathElements: tree.value.getProof(0).pathElements,
 *   merklePathIndices: tree.value.getProof(0).pathIndices,
 * });
 *
 * // Submit to on-chain verifier
 * const formatted = zkp.formatProofForChain(proof.value);
 * await verifierRegistry.verifyProof(
 *   zkp.getProofTypeBytes32('AGE_PROOF'),
 *   formatted.pA,
 *   formatted.pB,
 *   formatted.pC,
 *   formatted.pubSignals
 * );
 * ```
 *
 * @module
 */

// Types
export type {
  ZKProofType,
  ZKProof,
  Groth16Proof,
  ZKPublicSignals,
  CircuitArtifacts,
  VerificationKey,
  VerificationResult,
  ZKPPluginConfig,
  ProofInput,
  AgeProofInput,
  AccreditationProofInput,
  JurisdictionProofInput,
  KYCStatusProofInput,
  ZKClaim,
  ClaimsMerkleTree,
} from './types.js';

export { PROOF_TYPE_BYTES32 } from './types.js';

// Main plugin
export { ZKPPlugin, createZKPPlugin } from './ZKPPlugin.js';

// Circuit management
export { CircuitManager, createCircuitManager } from './CircuitManager.js';
