/**
 * Evidence Model
 *
 * Evidence represents off-chain proof that supports asset verification.
 * Examples: property deeds, certificates, audit reports, sensor data.
 */

import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { ValidationError } from '../errors/index.js';

// ============================================================================
// EVIDENCE TYPE ENUM
// ============================================================================

/**
 * Types of evidence that can be attached to assets
 */
export enum EvidenceType {
  /** Legal document (deed, contract, license) */
  LEGAL_DOCUMENT = 'LEGAL_DOCUMENT',

  /** Financial document (audit, valuation, statement) */
  FINANCIAL_DOCUMENT = 'FINANCIAL_DOCUMENT',

  /** Identity verification (KYC, passport, ID) */
  IDENTITY_VERIFICATION = 'IDENTITY_VERIFICATION',

  /** Certificate (degree, license, accreditation) */
  CERTIFICATE = 'CERTIFICATE',

  /** Sensor/IoT data (telematics, environmental) */
  SENSOR_DATA = 'SENSOR_DATA',

  /** Oracle attestation (price feed, off-chain data) */
  ORACLE_ATTESTATION = 'ORACLE_ATTESTATION',

  /** Third-party audit report */
  AUDIT_REPORT = 'AUDIT_REPORT',

  /** Photo/media evidence */
  MEDIA = 'MEDIA',

  /** Custom/other evidence type */
  CUSTOM = 'CUSTOM',
}

/**
 * Evidence verification status
 */
export enum EvidenceStatus {
  /** Evidence submitted, pending verification */
  PENDING = 'PENDING',

  /** Evidence verified by authorized verifier */
  VERIFIED = 'VERIFIED',

  /** Evidence rejected during verification */
  REJECTED = 'REJECTED',

  /** Evidence expired (e.g., outdated appraisal) */
  EXPIRED = 'EXPIRED',

  /** Evidence revoked by issuer */
  REVOKED = 'REVOKED',
}

// ============================================================================
// EVIDENCE SCHEMA
// ============================================================================

/**
 * Signature schema for evidence authentication
 */
export const SignatureSchema = z.object({
  /** Signer's address or identifier */
  signer: z.string(),

  /** Signature algorithm used */
  algorithm: z.enum(['ECDSA', 'ED25519', 'RSA', 'HMAC']),

  /** The signature value (hex or base64 encoded) */
  value: z.string(),

  /** Timestamp when signature was created */
  timestamp: z.string().datetime(),

  /** Optional key ID for multi-key signers */
  keyId: z.string().optional(),
});

export type Signature = z.infer<typeof SignatureSchema>;

/**
 * Evidence source information
 */
export const EvidenceSourceSchema = z.object({
  /** Source type (e.g., 'GOVERNMENT_REGISTRY', 'ORACLE', 'MANUAL') */
  type: z.string(),

  /** Source identifier or URL */
  identifier: z.string(),

  /** Source name for display */
  name: z.string(),

  /** Whether source is considered trusted */
  trusted: z.boolean().default(false),

  /** Source reputation score (0-100) */
  reputationScore: z.number().min(0).max(100).optional(),
});

export type EvidenceSource = z.infer<typeof EvidenceSourceSchema>;

/**
 * Full Evidence schema
 */
export const EvidenceSchema = z.object({
  /** Unique evidence identifier */
  id: z.string().uuid(),

  /** Related asset ID */
  assetId: z.string().uuid(),

  /** Evidence type */
  type: z.nativeEnum(EvidenceType),

  /** Current verification status */
  status: z.nativeEnum(EvidenceStatus).default(EvidenceStatus.PENDING),

  /** Human-readable title */
  title: z.string().min(1).max(256),

  /** Description of the evidence */
  description: z.string().max(4096).optional(),

  /** Content hash (SHA-256 or similar) */
  contentHash: z.string(),

  /** Hash algorithm used */
  hashAlgorithm: z.enum(['SHA256', 'SHA384', 'SHA512', 'KECCAK256']).default('SHA256'),

  /** Storage URI (IPFS, S3, etc.) */
  storageUri: z.string().optional(),

  /** MIME type of the evidence content */
  mimeType: z.string().optional(),

  /** File size in bytes */
  sizeBytes: z.number().nonnegative().optional(),

  /** Evidence source information */
  source: EvidenceSourceSchema,

  /** Cryptographic signatures */
  signatures: z.array(SignatureSchema).default([]),

  /** Verifier information (who verified this evidence) */
  verifier: z
    .object({
      verifierId: z.string(),
      verifiedAt: z.string().datetime(),
      verificationMethod: z.string(),
      notes: z.string().optional(),
    })
    .optional(),

  /** Evidence validity period */
  validFrom: z.string().datetime().optional(),
  validUntil: z.string().datetime().optional(),

  /** Additional metadata */
  metadata: z.record(z.unknown()).default({}),

  /** Creation timestamp */
  createdAt: z.string().datetime(),

  /** Last update timestamp */
  updatedAt: z.string().datetime(),

  /** Version for optimistic locking */
  version: z.number().nonnegative().default(0),
});

export type Evidence = z.infer<typeof EvidenceSchema>;

// ============================================================================
// EVIDENCE FACTORY
// ============================================================================

/**
 * Parameters for creating new evidence
 */
export interface CreateEvidenceParams {
  assetId: string;
  type: EvidenceType;
  title: string;
  description?: string;
  contentHash: string;
  hashAlgorithm?: 'SHA256' | 'SHA384' | 'SHA512' | 'KECCAK256';
  storageUri?: string;
  mimeType?: string;
  sizeBytes?: number;
  source: EvidenceSource;
  validFrom?: string;
  validUntil?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Create new evidence
 */
export function createEvidence(params: CreateEvidenceParams): Evidence {
  const now = new Date().toISOString();

  const evidence: Evidence = {
    id: uuidv4(),
    assetId: params.assetId,
    type: params.type,
    status: EvidenceStatus.PENDING,
    title: params.title,
    description: params.description,
    contentHash: params.contentHash,
    hashAlgorithm: params.hashAlgorithm || 'SHA256',
    storageUri: params.storageUri,
    mimeType: params.mimeType,
    sizeBytes: params.sizeBytes,
    source: params.source,
    signatures: [],
    validFrom: params.validFrom,
    validUntil: params.validUntil,
    metadata: params.metadata || {},
    createdAt: now,
    updatedAt: now,
    version: 0,
  };

  // Validate
  const result = EvidenceSchema.safeParse(evidence);
  if (!result.success) {
    throw new ValidationError(`Invalid evidence: ${result.error.message}`, {
      field: 'evidence',
      constraints: result.error.flatten().fieldErrors as Record<string, string>,
    });
  }

  return result.data;
}

/**
 * Add a signature to evidence
 */
export function addSignature(evidence: Evidence, signature: Signature): Evidence {
  return {
    ...evidence,
    signatures: [...evidence.signatures, signature],
    updatedAt: new Date().toISOString(),
    version: evidence.version + 1,
  };
}

/**
 * Verify evidence (mark as verified)
 */
export function verifyEvidence(
  evidence: Evidence,
  verifierId: string,
  verificationMethod: string,
  notes?: string
): Evidence {
  return {
    ...evidence,
    status: EvidenceStatus.VERIFIED,
    verifier: {
      verifierId,
      verifiedAt: new Date().toISOString(),
      verificationMethod,
      notes,
    },
    updatedAt: new Date().toISOString(),
    version: evidence.version + 1,
  };
}

/**
 * Reject evidence
 */
export function rejectEvidence(
  evidence: Evidence,
  verifierId: string,
  reason: string
): Evidence {
  return {
    ...evidence,
    status: EvidenceStatus.REJECTED,
    verifier: {
      verifierId,
      verifiedAt: new Date().toISOString(),
      verificationMethod: 'MANUAL_REJECTION',
      notes: reason,
    },
    updatedAt: new Date().toISOString(),
    version: evidence.version + 1,
  };
}

/**
 * Check if evidence is valid (not expired)
 */
export function isEvidenceValid(evidence: Evidence): boolean {
  if (evidence.status !== EvidenceStatus.VERIFIED) {
    return false;
  }

  const now = new Date();

  if (evidence.validFrom) {
    const validFrom = new Date(evidence.validFrom);
    if (now < validFrom) {
      return false;
    }
  }

  if (evidence.validUntil) {
    const validUntil = new Date(evidence.validUntil);
    if (now > validUntil) {
      return false;
    }
  }

  return true;
}

/**
 * Validate evidence object
 */
export function validateEvidence(evidence: unknown): evidence is Evidence {
  return EvidenceSchema.safeParse(evidence).success;
}

/**
 * Parse and validate evidence data
 */
export function parseEvidence(data: unknown): Evidence {
  return EvidenceSchema.parse(data);
}
