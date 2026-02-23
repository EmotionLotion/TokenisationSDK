/**
 * API Storage Plugin
 *
 * Implements IStoragePlugin interface by delegating to the backend API.
 * Uses presigned URLs for S3/IPFS operations and local caching for performance.
 */

import { ok, err, type Result } from '../../core/types.js';
import type { IStoragePlugin, StorageMetadata } from '../../core/interfaces.js';
import type { ApiClient } from './ApiClient.js';

export interface ApiStoragePluginConfig {
  apiClient: ApiClient;
  defaultStorageProvider?: 's3' | 'ipfs' | 'azure';
}

interface UploadUrlResponse {
  uploadUrl: string;
  documentUri: string;
  headers?: Record<string, string>;
  expiresAt: string;
}

interface DownloadUrlResponse {
  downloadUrl: string;
  expiresAt: string;
}

interface DocumentResponse {
  id: string;
  uri: string;
  sha256: string;
  name: string;
  mimeType?: string;
  size?: number;
  status: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export class ApiStoragePlugin implements IStoragePlugin {
  readonly pluginId = 'api-storage';
  readonly providerName = 'API';

  private client: ApiClient;
  private defaultProvider: 's3' | 'ipfs' | 'azure';
  private cache: Map<string, { data: Buffer; metadata: StorageMetadata; timestamp: number }> = new Map();
  private cacheMaxAge = 5 * 60 * 1000; // 5 minutes

  constructor(config: ApiStoragePluginConfig) {
    this.client = config.apiClient;
    this.defaultProvider = config.defaultStorageProvider || 's3';
  }

  /**
   * Store content via the API backend
   *
   * Flow:
   * 1. Get presigned upload URL from backend
   * 2. Upload content directly to storage (S3/IPFS)
   * 3. Register the document with the backend
   */
  async store(content: Buffer | string, filename?: string): Promise<Result<StorageMetadata, string>> {
    try {
      const buffer = typeof content === 'string' ? Buffer.from(content) : content;
      const uploadFilename = filename || 'file';

      // Detect MIME type
      let mimeType = 'application/octet-stream';
      if (filename) {
        if (filename.endsWith('.json')) mimeType = 'application/json';
        else if (filename.endsWith('.pdf')) mimeType = 'application/pdf';
        else if (filename.endsWith('.png')) mimeType = 'image/png';
        else if (filename.endsWith('.jpg') || filename.endsWith('.jpeg')) mimeType = 'image/jpeg';
        else if (filename.endsWith('.txt')) mimeType = 'text/plain';
      }

      // 1. Get presigned upload URL from backend
      const uploadUrlResponse = await this.client.post<UploadUrlResponse>(
        '/api/v1/documents/upload-url',
        {
          fileName: uploadFilename,
          contentType: mimeType,
          storageProvider: this.defaultProvider,
        }
      );

      // 2. Upload content directly to storage
      const uploadResponse = await fetch(uploadUrlResponse.uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': mimeType,
          ...(uploadUrlResponse.headers || {}),
        },
        body: new Uint8Array(buffer),
      });

      if (!uploadResponse.ok) {
        return err(`Upload failed: ${uploadResponse.status} ${uploadResponse.statusText}`);
      }

      // 3. Compute SHA256 hash
      const { createHash } = await import('crypto');
      const contentHash = createHash('sha256').update(buffer).digest('hex');

      // 4. Register the document with the backend
      const document = await this.client.post<DocumentResponse>(
        '/api/v1/documents',
        {
          name: uploadFilename,
          type: 'evidence',
          uri: uploadUrlResponse.documentUri,
          sha256: contentHash,
          mimeType,
          size: buffer.length,
          storageProvider: this.defaultProvider,
        }
      );

      const metadata: StorageMetadata = {
        uri: document.uri,
        contentHash,
        size: buffer.length,
        mimeType,
        uploadedAt: document.createdAt,
      };

      // Cache the content
      this.cache.set(document.uri, {
        data: buffer,
        metadata,
        timestamp: Date.now(),
      });

      return ok(metadata);
    } catch (error) {
      return err(`Storage failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Retrieve content via the API backend
   *
   * Flow:
   * 1. Check local cache
   * 2. Get presigned download URL from backend
   * 3. Download content from storage
   */
  async retrieve(uri: string): Promise<Result<Buffer, string>> {
    try {
      // Check cache first
      const cached = this.getCachedContent(uri);
      if (cached) {
        return ok(cached.data);
      }

      // Get presigned download URL from backend
      const downloadUrlResponse = await this.client.post<DownloadUrlResponse>(
        '/api/v1/documents/download-url',
        { uri }
      );

      // Download content
      const response = await fetch(downloadUrlResponse.downloadUrl);
      if (!response.ok) {
        return err(`Download failed: ${response.status} ${response.statusText}`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());

      // Cache the content (we don't have full metadata here, so create minimal)
      const { createHash } = await import('crypto');
      const contentHash = createHash('sha256').update(buffer).digest('hex');

      this.cache.set(uri, {
        data: buffer,
        metadata: {
          uri,
          contentHash,
          size: buffer.length,
          mimeType: response.headers.get('content-type') || 'application/octet-stream',
          uploadedAt: new Date().toISOString(),
        },
        timestamp: Date.now(),
      });

      return ok(buffer);
    } catch (error) {
      return err(`Retrieve failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if content exists (checks cache, then tries to get download URL)
   */
  async exists(uri: string): Promise<boolean> {
    // Check cache first
    if (this.getCachedContent(uri)) {
      return true;
    }

    try {
      // Try to get a download URL - if it succeeds, the content exists
      await this.client.post<DownloadUrlResponse>(
        '/api/v1/documents/download-url',
        { uri }
      );
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Pin content (delegates to backend - only meaningful for IPFS)
   */
  async pin(uri: string): Promise<Result<void, string>> {
    // Pinning is handled by the backend for IPFS
    // For S3, this is a no-op
    if (uri.startsWith('ipfs://')) {
      try {
        await this.client.post(`/api/v1/documents/pin`, { uri });
        return ok(undefined);
      } catch (error) {
        return err(`Pin failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
    return ok(undefined);
  }

  /**
   * Unpin content (delegates to backend - only meaningful for IPFS)
   */
  async unpin(uri: string): Promise<Result<void, string>> {
    if (uri.startsWith('ipfs://')) {
      try {
        await this.client.post(`/api/v1/documents/unpin`, { uri });
        return ok(undefined);
      } catch (error) {
        return err(`Unpin failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
    return ok(undefined);
  }

  /**
   * Get storage metadata
   */
  async getMetadata(uri: string): Promise<Result<StorageMetadata, string>> {
    // Check cache first
    const cached = this.getCachedContent(uri);
    if (cached) {
      return ok(cached.metadata);
    }

    try {
      // Try to retrieve and cache the content to get metadata
      const result = await this.retrieve(uri);
      if (!result.success) {
        return err((result as { success: false; error: string }).error);
      }

      // Should now be in cache
      const cachedAfterRetrieve = this.getCachedContent(uri);
      if (cachedAfterRetrieve) {
        return ok(cachedAfterRetrieve.metadata);
      }

      return err('Failed to get metadata');
    } catch (error) {
      return err(`GetMetadata failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Verify document integrity via the backend
   */
  async verifyIntegrity(documentId: string): Promise<Result<{
    verified: boolean;
    actualSha256?: string;
    error?: string;
  }, string>> {
    try {
      const result = await this.client.post<{
        verified: boolean;
        documentId: string;
        actualSha256?: string;
        error?: string;
      }>(`/api/v1/documents/${documentId}/verify-integrity`);

      return ok(result);
    } catch (error) {
      return err(`Integrity verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate upload URL for direct client uploads
   */
  async generateUploadUrl(
    fileName: string,
    contentType: string,
    storageProvider?: 's3' | 'ipfs' | 'azure'
  ): Promise<Result<UploadUrlResponse, string>> {
    try {
      const result = await this.client.post<UploadUrlResponse>(
        '/api/v1/documents/upload-url',
        {
          fileName,
          contentType,
          storageProvider: storageProvider || this.defaultProvider,
        }
      );
      return ok(result);
    } catch (error) {
      return err(`Generate upload URL failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate download URL for a document
   */
  async generateDownloadUrl(
    uri: string,
    expiresInSeconds?: number
  ): Promise<Result<DownloadUrlResponse, string>> {
    try {
      const result = await this.client.post<DownloadUrlResponse>(
        '/api/v1/documents/download-url',
        {
          uri,
          expiresInSeconds,
        }
      );
      return ok(result);
    } catch (error) {
      return err(`Generate download URL failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Clear the local cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; entries: number } {
    let totalSize = 0;
    const values = Array.from(this.cache.values());
    for (const item of values) {
      totalSize += item.data.length;
    }
    return {
      size: totalSize,
      entries: this.cache.size,
    };
  }

  /**
   * Set the default storage provider
   */
  setDefaultProvider(provider: 's3' | 'ipfs' | 'azure'): void {
    this.defaultProvider = provider;
  }

  /**
   * Get cached content if still valid
   */
  private getCachedContent(uri: string): { data: Buffer; metadata: StorageMetadata } | null {
    const cached = this.cache.get(uri);
    if (!cached) {
      return null;
    }

    // Check if cache entry is still valid
    if (Date.now() - cached.timestamp > this.cacheMaxAge) {
      this.cache.delete(uri);
      return null;
    }

    return cached;
  }
}

export default ApiStoragePlugin;
