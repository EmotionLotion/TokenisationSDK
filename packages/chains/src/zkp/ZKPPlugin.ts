/**
 * ZKPPlugin - Zero-Knowledge Proof Generation Plugin
 *
 * Provides ZK proof generation and verification for privacy-preserving
 * compliance verification.
 *
 * @example
 * ```typescript
 * const zkp = new ZKPPlugin({
 *   circuitsPath: './circuits/build',
 *   verifierRegistryAddress: '0x...',
 * });
 *
 * // Generate age proof
 * const proof = await zkp.generateAgeProof({
 *   birthDate: 631152000, // 1990-01-01
 *   ageThreshold: 18,
 *   claimsRoot: '0x...',
 *   // ... other inputs
 * });
 *
 * // Submit to chain
 * await zkp.submitProof(proof);
 * ```
 */

import type { Result } from '@tokenisation/core';
import { ok, err } from '@tokenisation/core';
import type {
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
import { PROOF_TYPE_BYTES32 } from './types.js';
import { CircuitManager } from './CircuitManager.js';

/**
 * ZKPPlugin - Zero-Knowledge Proof Plugin
 */
export class ZKPPlugin {
  private config: ZKPPluginConfig;
  private circuitManager: CircuitManager;
  private proofCache: Map<string, { proof: ZKProof; expiresAt: number }> = new Map();

  constructor(config: ZKPPluginConfig = {}) {
    this.config = {
      enableCache: true,
      cacheDuration: 3600, // 1 hour
      ...config,
    };
    this.circuitManager = new CircuitManager(config.circuitsPath);
  }

  // ============================================================================
  // PROOF GENERATION
  // ============================================================================

  /**
   * Generate an age proof
   */
  async generateAgeProof(input: AgeProofInput): Promise<Result<ZKProof, string>> {
    try {
      // Load circuit
      const artifacts = await this.circuitManager.loadCircuit('age_proof');
      if (!artifacts.success) {
        return err(`Failed to load circuit: ${artifacts.error}`);
      }

      // Prepare circuit inputs
      const circuitInput = {
        claimsRoot: input.claimsRoot,
        currentTimestamp: input.currentTimestamp,
        ageThreshold: input.ageThreshold,
        externalNullifier: input.externalNullifier,
        birthDate: input.birthDate,
        salt: input.salt,
        identityId: input.identityId,
        expiryTimestamp: input.expiryTimestamp,
        merklePathElements: input.merklePathElements,
        merklePathIndices: input.merklePathIndices,
      };

      // Generate proof using snarkjs
      const proof = await this._generateProof(artifacts.data, circuitInput);

      // Cache if enabled
      if (this.config.enableCache) {
        const cacheKey = await this._getCacheKey('AGE_PROOF', input);
        this.proofCache.set(cacheKey, {
          proof,
          expiresAt: Date.now() + (this.config.cacheDuration || 3600) * 1000,
        });
      }

      return ok(proof);
    } catch (error) {
      return err(`Age proof generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate an accreditation proof
   */
  async generateAccreditationProof(
    input: AccreditationProofInput
  ): Promise<Result<ZKProof, string>> {
    try {
      const artifacts = await this.circuitManager.loadCircuit('accreditation_proof');
      if (!artifacts.success) {
        return err(`Failed to load circuit: ${artifacts.error}`);
      }

      const circuitInput = {
        claimsRoot: input.claimsRoot,
        currentTimestamp: input.currentTimestamp,
        netWorthThreshold: input.netWorthThreshold,
        incomeThreshold: input.incomeThreshold,
        externalNullifier: input.externalNullifier,
        netWorth: input.netWorth,
        annualIncome: input.annualIncome,
        accreditationMethod: input.accreditationMethod,
        salt: input.salt,
        identityId: input.identityId,
        expiryTimestamp: input.expiryTimestamp,
        merklePathElements: input.merklePathElements,
        merklePathIndices: input.merklePathIndices,
      };

      const proof = await this._generateProof(artifacts.data, circuitInput);

      if (this.config.enableCache) {
        const cacheKey = await this._getCacheKey('ACCREDITATION_PROOF', input);
        this.proofCache.set(cacheKey, {
          proof,
          expiresAt: Date.now() + (this.config.cacheDuration || 3600) * 1000,
        });
      }

      return ok(proof);
    } catch (error) {
      return err(`Accreditation proof generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate a jurisdiction proof
   */
  async generateJurisdictionProof(
    input: JurisdictionProofInput
  ): Promise<Result<ZKProof, string>> {
    try {
      const artifacts = await this.circuitManager.loadCircuit('jurisdiction_proof');
      if (!artifacts.success) {
        return err(`Failed to load circuit: ${artifacts.error}`);
      }

      // Pad allowed jurisdictions to max size
      const maxAllowed = 20;
      const allowedJurisdictions = [...input.allowedJurisdictions];
      while (allowedJurisdictions.length < maxAllowed) {
        allowedJurisdictions.push(0);
      }

      const circuitInput = {
        claimsRoot: input.claimsRoot,
        currentTimestamp: input.currentTimestamp,
        allowedJurisdictions,
        externalNullifier: input.externalNullifier,
        jurisdictionCode: input.jurisdictionCode,
        salt: input.salt,
        identityId: input.identityId,
        expiryTimestamp: input.expiryTimestamp,
        merklePathElements: input.merklePathElements,
        merklePathIndices: input.merklePathIndices,
      };

      const proof = await this._generateProof(artifacts.data, circuitInput);

      if (this.config.enableCache) {
        const cacheKey = await this._getCacheKey('JURISDICTION_PROOF', input);
        this.proofCache.set(cacheKey, {
          proof,
          expiresAt: Date.now() + (this.config.cacheDuration || 3600) * 1000,
        });
      }

      return ok(proof);
    } catch (error) {
      return err(`Jurisdiction proof generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate a KYC status proof
   */
  async generateKYCStatusProof(
    input: KYCStatusProofInput
  ): Promise<Result<ZKProof, string>> {
    try {
      const artifacts = await this.circuitManager.loadCircuit('kyc_status_proof');
      if (!artifacts.success) {
        return err(`Failed to load circuit: ${artifacts.error}`);
      }

      const circuitInput = {
        claimsRoot: input.claimsRoot,
        currentTimestamp: input.currentTimestamp,
        requiredLevel: input.requiredLevel,
        externalNullifier: input.externalNullifier,
        kycLevel: input.kycLevel,
        kycProvider: input.kycProvider,
        verificationId: input.verificationId,
        salt: input.salt,
        identityId: input.identityId,
        expiryTimestamp: input.expiryTimestamp,
        merklePathElements: input.merklePathElements,
        merklePathIndices: input.merklePathIndices,
      };

      const proof = await this._generateProof(artifacts.data, circuitInput);

      if (this.config.enableCache) {
        const cacheKey = await this._getCacheKey('KYC_STATUS_PROOF', input);
        this.proofCache.set(cacheKey, {
          proof,
          expiresAt: Date.now() + (this.config.cacheDuration || 3600) * 1000,
        });
      }

      return ok(proof);
    } catch (error) {
      return err(`KYC status proof generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // ============================================================================
  // PROOF VERIFICATION
  // ============================================================================

  /**
   * Verify a proof locally (off-chain)
   */
  async verifyProof(
    proofType: ZKProofType,
    proof: ZKProof
  ): Promise<Result<VerificationResult, string>> {
    try {
      const vkeyResult = await this.circuitManager.loadVerificationKey(
        proofType.toLowerCase().replace('_proof', '_proof')
      );

      if (!vkeyResult.success) {
        return err(`Failed to load verification key: ${vkeyResult.error}`);
      }

      const valid = await this._verifyProof(vkeyResult.data, proof);

      return ok({
        valid,
        nullifier: proof.publicSignals.nullifier,
        commitment: proof.publicSignals.commitment,
      });
    } catch (error) {
      return err(`Proof verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // ============================================================================
  // CLAIM MANAGEMENT
  // ============================================================================

  /**
   * Create a commitment for a claim
   */
  async createClaimCommitment(claim: ZKClaim): Promise<Result<string, string>> {
    try {
      // Use Poseidon hash: H(claimType, claimValue, salt, identityId)
      const commitment = await this._poseidonHash([
        claim.claimType,
        claim.claimValue,
        claim.salt,
        claim.identityId,
      ]);

      return ok(commitment);
    } catch (error) {
      return err(`Failed to create commitment: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create a Merkle tree from claims
   */
  async createClaimsMerkleTree(claims: ZKClaim[]): Promise<Result<ClaimsMerkleTree, string>> {
    try {
      // Create commitments for each claim
      const leaves: string[] = [];
      for (const claim of claims) {
        const commitmentResult = await this.createClaimCommitment(claim);
        if (!commitmentResult.success) {
          return err(commitmentResult.error);
        }

        // Leaf = H(commitment, expiry)
        const leaf = await this._poseidonHash([
          commitmentResult.data,
          claim.expiryTimestamp,
        ]);
        leaves.push(leaf);
        claim.commitment = commitmentResult.data;
        claim.leafIndex = leaves.length - 1;
      }

      // Build Merkle tree
      const tree = await this._buildMerkleTree(leaves);

      return ok(tree);
    } catch (error) {
      return err(`Failed to create Merkle tree: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate external nullifier for a context
   */
  async generateExternalNullifier(context: string): Promise<string> {
    // Use keccak256 hash of context
    const { ethers } = await import('ethers');
    return ethers.keccak256(ethers.toUtf8Bytes(context));
  }

  // ============================================================================
  // CACHE MANAGEMENT
  // ============================================================================

  /**
   * Get cached proof
   */
  async getCachedProof(proofType: ZKProofType, input: ProofInput): Promise<ZKProof | null> {
    const cacheKey = await this._getCacheKey(proofType, input);
    const cached = this.proofCache.get(cacheKey);

    if (cached && cached.expiresAt > Date.now()) {
      return cached.proof;
    }

    // Clean up expired entry
    if (cached) {
      this.proofCache.delete(cacheKey);
    }

    return null;
  }

  /**
   * Clear proof cache
   */
  clearCache(): void {
    this.proofCache.clear();
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================

  /**
   * Get proof type bytes32 for contract interaction
   */
  getProofTypeBytes32(proofType: ZKProofType): string {
    return PROOF_TYPE_BYTES32[proofType];
  }

  /**
   * Format proof for on-chain submission
   */
  formatProofForChain(proof: ZKProof): {
    pA: [string, string];
    pB: [[string, string], [string, string]];
    pC: [string, string];
    pubSignals: string[];
  } {
    return {
      pA: proof.proof.pi_a,
      pB: proof.proof.pi_b,
      pC: proof.proof.pi_c,
      pubSignals: [
        proof.publicSignals.nullifier,
        proof.publicSignals.commitment,
        String(proof.publicSignals.result),
      ],
    };
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private async _generateProof(
    artifacts: CircuitArtifacts,
    input: Record<string, unknown>
  ): Promise<ZKProof> {
    // In production, this would use snarkjs:
    // const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    //   input,
    //   artifacts.wasm,
    //   artifacts.zkey
    // );

    // For now, generate a mock proof structure
    const mockProof: Groth16Proof = {
      pi_a: [
        '0x' + '1'.repeat(64),
        '0x' + '2'.repeat(64),
      ],
      pi_b: [
        ['0x' + '3'.repeat(64), '0x' + '4'.repeat(64)],
        ['0x' + '5'.repeat(64), '0x' + '6'.repeat(64)],
      ],
      pi_c: [
        '0x' + '7'.repeat(64),
        '0x' + '8'.repeat(64),
      ],
      protocol: 'groth16',
      curve: 'bn128',
    };

    // Generate deterministic nullifier and commitment from inputs
    const { ethers } = await import('ethers');
    const inputHash = ethers.keccak256(
      ethers.toUtf8Bytes(JSON.stringify(input))
    );

    const mockPublicSignals: ZKPublicSignals = {
      nullifier: ethers.keccak256(inputHash + '01'),
      commitment: ethers.keccak256(inputHash + '02'),
      result: '1',
    };

    return {
      proof: mockProof,
      publicSignals: mockPublicSignals,
    };
  }

  private async _verifyProof(
    vkey: VerificationKey,
    proof: ZKProof
  ): Promise<boolean> {
    // In production, this would use snarkjs:
    // return await snarkjs.groth16.verify(vkey, publicSignals, proof.proof);

    // Mock verification - always returns true for valid proof structure
    return (
      proof.proof.pi_a.length === 2 &&
      proof.proof.pi_b.length === 2 &&
      proof.proof.pi_c.length === 2 &&
      !!proof.publicSignals.nullifier &&
      !!proof.publicSignals.commitment
    );
  }

  private async _poseidonHash(inputs: (string | number)[]): Promise<string> {
    // In production, this would use circomlibjs Poseidon:
    // const poseidon = await buildPoseidon();
    // return poseidon.F.toString(poseidon(inputs));

    // Mock implementation using keccak256
    const { ethers } = await import('ethers');
    return ethers.keccak256(
      ethers.solidityPacked(
        inputs.map(() => 'uint256'),
        inputs.map((i) => BigInt(i))
      )
    );
  }

  private async _buildMerkleTree(leaves: string[]): Promise<ClaimsMerkleTree> {
    const { ethers } = await import('ethers');
    const depth = Math.ceil(Math.log2(leaves.length)) || 1;

    // Pad leaves to power of 2
    const paddedLeaves = [...leaves];
    const targetSize = Math.pow(2, depth);
    while (paddedLeaves.length < targetSize) {
      paddedLeaves.push(ethers.ZeroHash);
    }

    // Build tree layers
    let currentLayer = paddedLeaves;
    const layers: string[][] = [currentLayer];

    while (currentLayer.length > 1) {
      const nextLayer: string[] = [];
      for (let i = 0; i < currentLayer.length; i += 2) {
        const left = currentLayer[i];
        const right = currentLayer[i + 1];
        const hash = await this._poseidonHash([left, right]);
        nextLayer.push(hash);
      }
      layers.push(nextLayer);
      currentLayer = nextLayer;
    }

    const root = currentLayer[0];

    return {
      root,
      depth,
      leaves: paddedLeaves,
      getProof: (leafIndex: number) => {
        const pathElements: string[] = [];
        const pathIndices: number[] = [];

        let index = leafIndex;
        for (let i = 0; i < depth; i++) {
          const isRight = index % 2 === 1;
          const siblingIndex = isRight ? index - 1 : index + 1;

          pathElements.push(layers[i][siblingIndex] || ethers.ZeroHash);
          pathIndices.push(isRight ? 1 : 0);

          index = Math.floor(index / 2);
        }

        return { pathElements, pathIndices };
      },
    };
  }

  private async _getCacheKey(proofType: ZKProofType, input: ProofInput): Promise<string> {
    const { ethers } = await import('ethers');
    return ethers.keccak256(
      ethers.toUtf8Bytes(proofType + JSON.stringify(input))
    );
  }
}

/**
 * Factory function
 */
export function createZKPPlugin(config?: ZKPPluginConfig): ZKPPlugin {
  return new ZKPPlugin(config);
}
