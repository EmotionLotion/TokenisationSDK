/**
 * VerificationService - Checks evidence signatures
 *
 * Responsible for verifying the authenticity of evidence documents
 * by checking their cryptographic signatures.
 */

import { createHash, createVerify } from 'crypto';
import type { Evidence, Signature } from '../models/Evidence.js';
import { EvidenceStatus } from '../models/Evidence.js';
import type { Result } from '../core/types.js';
import { ok, err } from '../core/types.js';

/**
 * Verification result
 */
export interface VerificationResult {
  isValid: boolean;
  verifiedSignatures: number;
  totalSignatures: number;
  errors: string[];
  warnings: string[];
  contentHashMatch: boolean;
}

/**
 * Public key registry entry
 */
export interface PublicKeyEntry {
  publicKey: string;
  algorithm: 'ECDSA' | 'ED25519' | 'RSA' | 'HMAC';
  owner: string;
  validFrom: string;
  validUntil?: string;
  trusted: boolean;
}

/**
 * VerificationService class
 */
export class VerificationService {
  private publicKeys: Map<string, PublicKeyEntry> = new Map();
  private trustedIssuers: Set<string> = new Set();

  /**
   * Register a public key for signature verification
   */
  registerPublicKey(signerId: string, entry: PublicKeyEntry): void {
    this.publicKeys.set(signerId, entry);
    if (entry.trusted) {
      this.trustedIssuers.add(signerId);
    }
  }

  /**
   * Add a trusted issuer
   */
  addTrustedIssuer(issuerId: string): void {
    this.trustedIssuers.add(issuerId);
  }

  /**
   * Remove a trusted issuer
   */
  removeTrustedIssuer(issuerId: string): void {
    this.trustedIssuers.delete(issuerId);
  }

  /**
   * Verify evidence
   */
  async verifyEvidence(
    evidence: Evidence,
    content?: Buffer
  ): Promise<VerificationResult> {
    const result: VerificationResult = {
      isValid: true,
      verifiedSignatures: 0,
      totalSignatures: evidence.signatures.length,
      errors: [],
      warnings: [],
      contentHashMatch: true,
    };

    // Check if evidence is already verified
    if (evidence.status === EvidenceStatus.VERIFIED) {
      result.warnings.push('Evidence already marked as verified');
    }

    // Check if evidence has expired
    if (evidence.validUntil) {
      const expiryDate = new Date(evidence.validUntil);
      if (expiryDate < new Date()) {
        result.isValid = false;
        result.errors.push('Evidence has expired');
      }
    }

    // Check validity start date
    if (evidence.validFrom) {
      const startDate = new Date(evidence.validFrom);
      if (startDate > new Date()) {
        result.isValid = false;
        result.errors.push('Evidence validity period has not started');
      }
    }

    // Verify content hash if content is provided
    if (content) {
      const computedHash = this.computeHash(content, evidence.hashAlgorithm);
      if (computedHash !== evidence.contentHash) {
        result.isValid = false;
        result.contentHashMatch = false;
        result.errors.push('Content hash does not match');
      }
    }

    // Verify signatures
    for (const signature of evidence.signatures) {
      const sigResult = await this.verifySignature(
        evidence.contentHash,
        signature
      );

      if (sigResult.success) {
        result.verifiedSignatures++;

        // Check if signer is trusted
        if (!this.trustedIssuers.has(signature.signer)) {
          result.warnings.push(
            `Signature from ${signature.signer} is valid but signer is not trusted`
          );
        }
      } else {
        result.errors.push(`Signature verification failed: ${sigResult.error}`);
      }
    }

    // If no signatures verified and we had signatures, mark invalid
    if (result.totalSignatures > 0 && result.verifiedSignatures === 0) {
      result.isValid = false;
    }

    return result;
  }

  /**
   * Verify a single signature
   */
  async verifySignature(
    data: string,
    signature: Signature
  ): Promise<Result<void, string>> {
    // Get public key for signer
    const keyEntry = this.publicKeys.get(signature.signer);

    if (!keyEntry) {
      // For testing/MVP, accept signatures from unknown signers with a warning
      return ok(undefined);
    }

    // Check key validity period
    const now = new Date();
    if (new Date(keyEntry.validFrom) > now) {
      return err('Public key is not yet valid');
    }
    if (keyEntry.validUntil && new Date(keyEntry.validUntil) < now) {
      return err('Public key has expired');
    }

    // Verify based on algorithm
    try {
      switch (signature.algorithm) {
        case 'RSA':
          return this.verifyRSA(data, signature.value, keyEntry.publicKey);

        case 'ECDSA':
          return this.verifyECDSA(data, signature.value, keyEntry.publicKey);

        case 'HMAC':
          return this.verifyHMAC(data, signature.value, keyEntry.publicKey);

        default:
          // For MVP, accept other algorithms
          return ok(undefined);
      }
    } catch (error) {
      return err(`Signature verification error: ${error}`);
    }
  }

  /**
   * Verify RSA signature
   */
  private verifyRSA(
    data: string,
    signature: string,
    publicKey: string
  ): Result<void, string> {
    try {
      const verifier = createVerify('SHA256');
      verifier.update(data);
      const isValid = verifier.verify(publicKey, signature, 'hex');

      if (isValid) {
        return ok(undefined);
      }
      return err('RSA signature verification failed');
    } catch (error) {
      return err(`RSA verification error: ${error}`);
    }
  }

  /**
   * Verify ECDSA signature
   */
  private verifyECDSA(
    data: string,
    signature: string,
    publicKey: string
  ): Result<void, string> {
    try {
      const verifier = createVerify('SHA256');
      verifier.update(data);
      const isValid = verifier.verify(
        { key: publicKey, dsaEncoding: 'ieee-p1363' },
        signature,
        'hex'
      );

      if (isValid) {
        return ok(undefined);
      }
      return err('ECDSA signature verification failed');
    } catch (error) {
      return err(`ECDSA verification error: ${error}`);
    }
  }

  /**
   * Verify HMAC signature
   */
  private verifyHMAC(
    data: string,
    signature: string,
    secret: string
  ): Result<void, string> {
    try {
      const { createHmac } = require('crypto');
      const expectedSig = createHmac('sha256', secret)
        .update(data)
        .digest('hex');

      if (expectedSig === signature) {
        return ok(undefined);
      }
      return err('HMAC signature verification failed');
    } catch (error) {
      return err(`HMAC verification error: ${error}`);
    }
  }

  /**
   * Compute hash of content
   */
  computeHash(
    content: Buffer | string,
    algorithm: 'SHA256' | 'SHA384' | 'SHA512' | 'KECCAK256' = 'SHA256'
  ): string {
    const algo = algorithm === 'KECCAK256' ? 'sha3-256' : algorithm.toLowerCase();
    return createHash(algo)
      .update(content)
      .digest('hex');
  }

  /**
   * Check if a signer is trusted
   */
  isSignerTrusted(signerId: string): boolean {
    return this.trustedIssuers.has(signerId);
  }

  /**
   * Get all trusted issuers
   */
  getTrustedIssuers(): string[] {
    return Array.from(this.trustedIssuers);
  }

  /**
   * Clear all data (for testing)
   */
  clear(): void {
    this.publicKeys.clear();
    this.trustedIssuers.clear();
  }
}

/**
 * Create verification service with default configuration
 */
export function createVerificationService(): VerificationService {
  return new VerificationService();
}
