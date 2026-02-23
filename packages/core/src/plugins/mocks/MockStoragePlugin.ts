/**
 * MockStoragePlugin
 *
 * A mock implementation of IStoragePlugin for testing and MVP.
 * Simulates IPFS-like content-addressable storage.
 */

import { createHash } from 'crypto';
import type {
  IStoragePlugin,
  StorageMetadata,
} from '../../core/interfaces.js';
import type { Result } from '../../core/types.js';
import { ok, err } from '../../core/types.js';

/**
 * Stored content entry
 */
interface StoredContent {
  content: Buffer;
  metadata: StorageMetadata;
  pinned: boolean;
}

/**
 * Mock storage plugin configuration
 */
export interface MockStorageConfig {
  /** Maximum file size in bytes */
  maxFileSize?: number;

  /** Simulated latency in ms */
  latencyMs?: number;

  /** Whether to fail randomly (for testing) */
  failureRate?: number;

  /** URI prefix */
  uriPrefix?: string;
}

/**
 * MockStoragePlugin implementation
 */
export class MockStoragePlugin implements IStoragePlugin {
  readonly pluginId = 'mock-storage';
  readonly providerName = 'MockIPFS';

  private storage: Map<string, StoredContent> = new Map();
  private config: Required<MockStorageConfig>;

  constructor(config: MockStorageConfig = {}) {
    this.config = {
      maxFileSize: 100 * 1024 * 1024, // 100MB
      latencyMs: 0,
      failureRate: 0,
      uriPrefix: 'ipfs://',
      ...config,
    };
  }

  /**
   * Simulate latency
   */
  private async simulateLatency(): Promise<void> {
    if (this.config.latencyMs > 0) {
      await new Promise((resolve) =>
        setTimeout(resolve, this.config.latencyMs)
      );
    }
  }

  /**
   * Simulate random failure
   */
  private shouldFail(): boolean {
    return Math.random() < this.config.failureRate;
  }

  /**
   * Generate content hash
   */
  private generateHash(content: Buffer): string {
    return createHash('sha256').update(content).digest('hex');
  }

  /**
   * Generate URI from hash
   */
  private hashToUri(hash: string): string {
    return `${this.config.uriPrefix}${hash}`;
  }

  /**
   * Extract hash from URI
   */
  private uriToHash(uri: string): string {
    return uri.replace(this.config.uriPrefix, '');
  }

  /**
   * Store content and return its hash/URI
   */
  async store(
    content: Buffer | string,
    filename?: string
  ): Promise<Result<StorageMetadata, string>> {
    await this.simulateLatency();

    if (this.shouldFail()) {
      return err('Storage service temporarily unavailable');
    }

    // Convert string to buffer
    const buffer = typeof content === 'string' ? Buffer.from(content) : content;

    // Check file size
    if (buffer.length > this.config.maxFileSize) {
      return err(
        `File size ${buffer.length} exceeds maximum ${this.config.maxFileSize}`
      );
    }

    // Generate hash
    const hash = this.generateHash(buffer);
    const uri = this.hashToUri(hash);

    // Detect mime type (simplified)
    let mimeType = 'application/octet-stream';
    if (filename) {
      if (filename.endsWith('.json')) mimeType = 'application/json';
      else if (filename.endsWith('.pdf')) mimeType = 'application/pdf';
      else if (filename.endsWith('.png')) mimeType = 'image/png';
      else if (filename.endsWith('.jpg') || filename.endsWith('.jpeg'))
        mimeType = 'image/jpeg';
      else if (filename.endsWith('.txt')) mimeType = 'text/plain';
    }

    const metadata: StorageMetadata = {
      contentHash: hash,
      size: buffer.length,
      mimeType,
      uploadedAt: new Date().toISOString(),
      uri,
    };

    // Store content
    this.storage.set(hash, {
      content: buffer,
      metadata,
      pinned: false,
    });

    return ok(metadata);
  }

  /**
   * Retrieve content by hash/URI
   */
  async retrieve(uri: string): Promise<Result<Buffer, string>> {
    await this.simulateLatency();

    if (this.shouldFail()) {
      return err('Storage service temporarily unavailable');
    }

    const hash = this.uriToHash(uri);
    const stored = this.storage.get(hash);

    if (!stored) {
      return err(`Content not found: ${uri}`);
    }

    return ok(stored.content);
  }

  /**
   * Check if content exists
   */
  async exists(uri: string): Promise<boolean> {
    const hash = this.uriToHash(uri);
    return this.storage.has(hash);
  }

  /**
   * Pin content to ensure persistence
   */
  async pin(uri: string): Promise<Result<void, string>> {
    await this.simulateLatency();

    const hash = this.uriToHash(uri);
    const stored = this.storage.get(hash);

    if (!stored) {
      return err(`Content not found: ${uri}`);
    }

    stored.pinned = true;
    return ok(undefined);
  }

  /**
   * Unpin content
   */
  async unpin(uri: string): Promise<Result<void, string>> {
    await this.simulateLatency();

    const hash = this.uriToHash(uri);
    const stored = this.storage.get(hash);

    if (!stored) {
      return err(`Content not found: ${uri}`);
    }

    stored.pinned = false;
    return ok(undefined);
  }

  /**
   * Get storage metadata
   */
  async getMetadata(uri: string): Promise<Result<StorageMetadata, string>> {
    const hash = this.uriToHash(uri);
    const stored = this.storage.get(hash);

    if (!stored) {
      return err(`Content not found: ${uri}`);
    }

    return ok(stored.metadata);
  }

  /**
   * Get all stored URIs (for testing/debugging)
   */
  getAllUris(): string[] {
    return Array.from(this.storage.keys()).map((hash) =>
      this.hashToUri(hash)
    );
  }

  /**
   * Get storage stats
   */
  getStats(): {
    totalFiles: number;
    totalSize: number;
    pinnedFiles: number;
  } {
    let totalSize = 0;
    let pinnedFiles = 0;

    for (const stored of this.storage.values()) {
      totalSize += stored.content.length;
      if (stored.pinned) pinnedFiles++;
    }

    return {
      totalFiles: this.storage.size,
      totalSize,
      pinnedFiles,
    };
  }

  /**
   * Clear all storage (for testing)
   */
  clear(): void {
    this.storage.clear();
  }

  /**
   * Delete unpinned content (garbage collection)
   */
  gc(): number {
    let deleted = 0;
    for (const [hash, stored] of this.storage) {
      if (!stored.pinned) {
        this.storage.delete(hash);
        deleted++;
      }
    }
    return deleted;
  }
}

/**
 * Create a default mock storage plugin
 */
export function createMockStoragePlugin(): MockStoragePlugin {
  return new MockStoragePlugin({
    maxFileSize: 100 * 1024 * 1024,
    latencyMs: 0,
    failureRate: 0,
  });
}
