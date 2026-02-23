/**
 * Composite Audit Storage
 *
 * Multi-backend audit storage that writes to multiple storage backends.
 * Useful for compliance requirements (e.g., database + file + S3).
 */

import { ok, err, type Result } from '../../core/types.js';
import type { AuditEntry, AuditQueryOptions } from '../AuditLog.js';
import type { IAuditStorage } from './IAuditStorage.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Write mode for composite storage
 */
export type WriteMode =
  | 'all'           // All backends must succeed
  | 'any'           // At least one backend must succeed
  | 'primary-only'  // Only primary must succeed, others are best-effort
  | 'majority';     // Majority of backends must succeed

/**
 * Composite storage configuration
 */
export interface CompositeAuditStorageConfig {
  /** Primary storage backend (used for reads) */
  primary: IAuditStorage;
  /** Secondary storage backends */
  secondary: IAuditStorage[];
  /** Write mode (default: 'all') */
  writeMode?: WriteMode;
  /** Whether to read from secondaries if primary fails */
  fallbackReads?: boolean;
  /** Callback for write errors */
  onWriteError?: (backend: string, error: string, entry: AuditEntry) => void;
}

// ============================================================================
// COMPOSITE AUDIT STORAGE
// ============================================================================

/**
 * Composite audit storage that writes to multiple backends
 *
 * Features:
 * - Configurable write modes (all, any, primary-only, majority)
 * - Fallback reads from secondary backends
 * - Error callbacks for monitoring
 */
export class CompositeAuditStorage implements IAuditStorage {
  readonly name = 'composite-storage';

  private primary: IAuditStorage;
  private secondary: IAuditStorage[];
  private writeMode: WriteMode;
  private fallbackReads: boolean;
  private onWriteError?: (backend: string, error: string, entry: AuditEntry) => void;

  constructor(config: CompositeAuditStorageConfig) {
    this.primary = config.primary;
    this.secondary = config.secondary;
    this.writeMode = config.writeMode ?? 'all';
    this.fallbackReads = config.fallbackReads ?? true;
    this.onWriteError = config.onWriteError;
  }

  async initialize(): Promise<Result<void, string>> {
    const results = await Promise.all([
      this.primary.initialize(),
      ...this.secondary.map((s) => s.initialize()),
    ]);

    const failures = results.filter((r): r is { success: false; error: string } => !r.success);
    if (failures.length > 0) {
      return err(`Failed to initialize backends: ${failures.map((e) => e.error).join(', ')}`);
    }

    return ok(undefined);
  }

  async write(entry: AuditEntry): Promise<Result<void, string>> {
    const allBackends = [this.primary, ...this.secondary];
    const results = await Promise.all(
      allBackends.map(async (backend) => {
        const result = await backend.write(entry);
        if (!result.success) {
          this.onWriteError?.(backend.name, result.error, entry);
        }
        return { backend: backend.name, result };
      })
    );

    return this.evaluateWriteResults(results, entry);
  }

  async writeBatch(entries: AuditEntry[]): Promise<Result<void, string>> {
    const allBackends = [this.primary, ...this.secondary];
    const results = await Promise.all(
      allBackends.map(async (backend) => {
        const result = await backend.writeBatch(entries);
        if (!result.success) {
          for (const entry of entries) {
            this.onWriteError?.(backend.name, result.error, entry);
          }
        }
        return { backend: backend.name, result };
      })
    );

    // Use first entry for error reporting context
    return this.evaluateWriteResults(results, entries[0]);
  }

  async query(options: AuditQueryOptions): Promise<Result<AuditEntry[], string>> {
    // Try primary first
    const primaryResult = await this.primary.query(options);
    if (primaryResult.success) {
      return primaryResult;
    }

    // Fallback to secondaries
    if (this.fallbackReads) {
      for (const secondary of this.secondary) {
        const result = await secondary.query(options);
        if (result.success) {
          return result;
        }
      }
    }

    return primaryResult;
  }

  async getById(id: string): Promise<Result<AuditEntry | null, string>> {
    // Try primary first
    const primaryResult = await this.primary.getById(id);
    if (primaryResult.success && primaryResult.data) {
      return primaryResult;
    }

    // Fallback to secondaries
    if (this.fallbackReads) {
      for (const secondary of this.secondary) {
        const result = await secondary.getById(id);
        if (result.success && result.data) {
          return result;
        }
      }
    }

    return primaryResult;
  }

  async count(options?: AuditQueryOptions): Promise<Result<number, string>> {
    // Use primary for counts
    const result = await this.primary.count(options);
    if (result.success) {
      return result;
    }

    // Fallback to secondaries
    if (this.fallbackReads) {
      for (const secondary of this.secondary) {
        const secResult = await secondary.count(options);
        if (secResult.success) {
          return secResult;
        }
      }
    }

    return result;
  }

  async healthCheck(): Promise<boolean> {
    const checks = await Promise.all([
      this.primary.healthCheck(),
      ...this.secondary.map((s) => s.healthCheck()),
    ]);

    // Require at least primary to be healthy
    return checks[0];
  }

  async close(): Promise<Result<void, string>> {
    const results = await Promise.all([
      this.primary.close(),
      ...this.secondary.map((s) => s.close()),
    ]);

    const failures = results.filter((r): r is { success: false; error: string } => !r.success);
    if (failures.length > 0) {
      return err(`Failed to close backends: ${failures.map((e) => e.error).join(', ')}`);
    }

    return ok(undefined);
  }

  // ============================================================================
  // ADDITIONAL METHODS
  // ============================================================================

  /**
   * Get status of all backends
   */
  async getBackendStatus(): Promise<Record<string, boolean>> {
    const status: Record<string, boolean> = {};

    status[this.primary.name] = await this.primary.healthCheck();
    for (const secondary of this.secondary) {
      status[secondary.name] = await secondary.healthCheck();
    }

    return status;
  }

  /**
   * Get list of backend names
   */
  getBackendNames(): string[] {
    return [this.primary.name, ...this.secondary.map((s) => s.name)];
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private evaluateWriteResults(
    results: Array<{ backend: string; result: Result<void, string> }>,
    entry: AuditEntry
  ): Result<void, string> {
    const successes = results.filter((r) => r.result.success);
    const failures = results.filter((r) => !r.result.success);

    switch (this.writeMode) {
      case 'all':
        if (failures.length > 0) {
          return err(`Write failed on: ${failures.map((f) => f.backend).join(', ')}`);
        }
        return ok(undefined);

      case 'any':
        if (successes.length === 0) {
          return err(`Write failed on all backends`);
        }
        return ok(undefined);

      case 'primary-only':
        const primaryResult = results.find((r) => r.backend === this.primary.name);
        return primaryResult?.result ?? err('Primary backend not found');

      case 'majority':
        const required = Math.floor(results.length / 2) + 1;
        if (successes.length >= required) {
          return ok(undefined);
        }
        return err(`Write failed on majority of backends (${failures.length}/${results.length})`);

      default:
        return err(`Unknown write mode: ${this.writeMode}`);
    }
  }
}

/**
 * Create a composite audit storage instance
 */
export function createCompositeAuditStorage(
  config: CompositeAuditStorageConfig
): CompositeAuditStorage {
  return new CompositeAuditStorage(config);
}

export default CompositeAuditStorage;
