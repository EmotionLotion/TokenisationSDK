/**
 * Audit Storage Interface
 *
 * Pluggable storage backend interface for audit logs.
 * Supports multiple storage targets for compliance requirements.
 */

import type { Result } from '../../core/types.js';
import type { AuditEntry, AuditQueryOptions } from '../AuditLog.js';

// ============================================================================
// INTERFACE
// ============================================================================

/**
 * Audit storage backend interface
 */
export interface IAuditStorage {
  /** Storage backend name */
  readonly name: string;

  /**
   * Initialize the storage backend
   */
  initialize(): Promise<Result<void, string>>;

  /**
   * Write an audit entry
   */
  write(entry: AuditEntry): Promise<Result<void, string>>;

  /**
   * Write multiple audit entries (batch)
   */
  writeBatch(entries: AuditEntry[]): Promise<Result<void, string>>;

  /**
   * Query audit entries
   */
  query(options: AuditQueryOptions): Promise<Result<AuditEntry[], string>>;

  /**
   * Get audit entry by ID
   */
  getById(id: string): Promise<Result<AuditEntry | null, string>>;

  /**
   * Count entries matching criteria
   */
  count(options?: AuditQueryOptions): Promise<Result<number, string>>;

  /**
   * Check storage health
   */
  healthCheck(): Promise<boolean>;

  /**
   * Close/cleanup storage connection
   */
  close(): Promise<Result<void, string>>;
}

/**
 * Streaming audit storage interface
 */
export interface IStreamingAuditStorage extends IAuditStorage {
  /**
   * Subscribe to new audit entries
   */
  subscribe(
    callback: (entry: AuditEntry) => void,
    filter?: Partial<AuditQueryOptions>
  ): () => void;

  /**
   * Stream entries matching criteria
   */
  stream(
    options: AuditQueryOptions,
    callback: (entry: AuditEntry) => void
  ): Promise<Result<void, string>>;
}

/**
 * Signed audit entry with cryptographic signature
 */
export interface SignedAuditEntry extends AuditEntry {
  /** Cryptographic signature of the entry */
  signature: string;
  /** Signing key ID */
  signingKeyId: string;
  /** Signature algorithm used */
  signatureAlgorithm: 'ed25519' | 'rsa-sha256' | 'ecdsa-p256';
}

/**
 * Signing audit storage interface
 */
export interface ISigningAuditStorage extends IAuditStorage {
  /**
   * Write a signed audit entry
   */
  writeSigned(entry: AuditEntry): Promise<Result<SignedAuditEntry, string>>;

  /**
   * Verify signature of an entry
   */
  verifySignature(entry: SignedAuditEntry): Promise<Result<boolean, string>>;
}

export default IAuditStorage;
