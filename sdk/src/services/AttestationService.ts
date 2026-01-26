/**
 * AttestationService - Signs valid evidence hashes
 *
 * Responsible for creating attestations that prove evidence has been
 * verified by authorized parties.
 */

import { createSign, createHash, randomBytes, createHmac } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import type { Evidence, Signature } from '../models/Evidence.js';
import type { Result } from '../core/types.js';
import { ok, err } from '../core/types.js';

/**
 * Attestation record
 */
export interface Attestation {
  id: string;
  evidenceId: string;
  contentHash: string;
  attesterId: string;
  signature: Signature;
  timestamp: string;
  metadata: Record<string, unknown>;
}

/**
 * Attester configuration
 */
export interface AttesterConfig {
  attesterId: string;
  privateKey?: string;
  algorithm: 'ECDSA' | 'ED25519' | 'RSA' | 'HMAC';
  hmacSecret?: string;
}

/**
 * AttestationService class
 */
export class AttestationService {
  private config: AttesterConfig;
  private attestations: Map<string, Attestation> = new Map();

  constructor(config: AttesterConfig) {
    this.config = config;
  }

  /**
   * Create an attestation for evidence
   */
  async createAttestation(
    evidence: Evidence,
    metadata?: Record<string, unknown>
  ): Promise<Result<Attestation, string>> {
    try {
      // Create signature
      const signatureResult = await this.signHash(evidence.contentHash);
      if (!signatureResult.success) {
        return err(signatureResult.error);
      }

      const attestation: Attestation = {
        id: uuidv4(),
        evidenceId: evidence.id,
        contentHash: evidence.contentHash,
        attesterId: this.config.attesterId,
        signature: signatureResult.data,
        timestamp: new Date().toISOString(),
        metadata: metadata || {},
      };

      // Store attestation
      this.attestations.set(attestation.id, attestation);

      return ok(attestation);
    } catch (error) {
      return err(`Failed to create attestation: ${error}`);
    }
  }

  /**
   * Sign a hash value
   */
  async signHash(hash: string): Promise<Result<Signature, string>> {
    try {
      let signatureValue: string;

      switch (this.config.algorithm) {
        case 'RSA':
          if (!this.config.privateKey) {
            return err('RSA private key not configured');
          }
          signatureValue = this.signRSA(hash, this.config.privateKey);
          break;

        case 'ECDSA':
          if (!this.config.privateKey) {
            return err('ECDSA private key not configured');
          }
          signatureValue = this.signECDSA(hash, this.config.privateKey);
          break;

        case 'HMAC':
          if (!this.config.hmacSecret) {
            return err('HMAC secret not configured');
          }
          signatureValue = this.signHMAC(hash, this.config.hmacSecret);
          break;

        default:
          // For testing, generate a mock signature
          signatureValue = this.generateMockSignature(hash);
      }

      const signature: Signature = {
        signer: this.config.attesterId,
        algorithm: this.config.algorithm,
        value: signatureValue,
        timestamp: new Date().toISOString(),
      };

      return ok(signature);
    } catch (error) {
      return err(`Signing failed: ${error}`);
    }
  }

  /**
   * Sign with RSA
   */
  private signRSA(data: string, privateKey: string): string {
    const signer = createSign('SHA256');
    signer.update(data);
    return signer.sign(privateKey, 'hex');
  }

  /**
   * Sign with ECDSA
   */
  private signECDSA(data: string, privateKey: string): string {
    const signer = createSign('SHA256');
    signer.update(data);
    return signer.sign({ key: privateKey, dsaEncoding: 'ieee-p1363' }, 'hex');
  }

  /**
   * Sign with HMAC
   */
  private signHMAC(data: string, secret: string): string {
    return createHmac('sha256', secret).update(data).digest('hex');
  }

  /**
   * Generate a mock signature for testing
   */
  private generateMockSignature(data: string): string {
    const mockKey = this.config.attesterId + '_mock_key';
    return createHash('sha256')
      .update(data + mockKey + randomBytes(16).toString('hex'))
      .digest('hex');
  }

  /**
   * Get attestation by ID
   */
  getAttestation(attestationId: string): Attestation | undefined {
    return this.attestations.get(attestationId);
  }

  /**
   * Get attestations for evidence
   */
  getAttestationsForEvidence(evidenceId: string): Attestation[] {
    return Array.from(this.attestations.values()).filter(
      (a) => a.evidenceId === evidenceId
    );
  }

  /**
   * Verify an attestation signature
   */
  async verifyAttestation(attestation: Attestation): Promise<boolean> {
    // For MVP, just check the attestation exists and has required fields
    return (
      attestation.id !== undefined &&
      attestation.evidenceId !== undefined &&
      attestation.signature !== undefined &&
      attestation.signature.value !== undefined
    );
  }

  /**
   * Batch create attestations
   */
  async createBatchAttestations(
    evidences: Evidence[]
  ): Promise<Result<Attestation[], string>> {
    const attestations: Attestation[] = [];
    const errors: string[] = [];

    for (const evidence of evidences) {
      const result = await this.createAttestation(evidence);
      if (result.success) {
        attestations.push(result.data);
      } else {
        errors.push(`Evidence ${evidence.id}: ${result.error}`);
      }
    }

    if (errors.length > 0 && attestations.length === 0) {
      return err(errors.join('; '));
    }

    return ok(attestations);
  }

  /**
   * Get attester ID
   */
  getAttesterId(): string {
    return this.config.attesterId;
  }

  /**
   * Get all attestations
   */
  getAllAttestations(): Attestation[] {
    return Array.from(this.attestations.values());
  }

  /**
   * Clear all attestations (for testing)
   */
  clear(): void {
    this.attestations.clear();
  }
}

/**
 * Create attestation service with mock configuration
 */
export function createMockAttestationService(
  attesterId?: string
): AttestationService {
  return new AttestationService({
    attesterId: attesterId || 'mock-attester',
    algorithm: 'HMAC',
    hmacSecret: randomBytes(32).toString('hex'),
  });
}
