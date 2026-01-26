/**
 * Storage Module
 *
 * Exports storage adapters and provides factory function for getting
 * the appropriate adapter based on provider type.
 */

export * from './storage.adapter.js';
export { S3StorageAdapter } from './s3.adapter.js';
export { IPFSStorageAdapter } from './ipfs.adapter.js';

import type { StorageProviderAdapter, StorageProviderType } from './storage.adapter.js';
import { S3StorageAdapter } from './s3.adapter.js';
import { IPFSStorageAdapter } from './ipfs.adapter.js';
import { storageConfig, isStorageConfigured } from '../../config/storage.js';

// Singleton adapter instances (lazy initialized)
let s3Adapter: S3StorageAdapter | null = null;
let ipfsAdapter: IPFSStorageAdapter | null = null;

/**
 * Get an S3 storage adapter instance
 */
export function getS3Adapter(): S3StorageAdapter {
  if (!s3Adapter) {
    if (!storageConfig.s3.enabled) {
      throw new Error('S3 storage is not enabled. Set S3_ENABLED=true in environment.');
    }
    s3Adapter = new S3StorageAdapter();
  }
  return s3Adapter;
}

/**
 * Get an IPFS storage adapter instance
 */
export function getIPFSAdapter(): IPFSStorageAdapter {
  if (!ipfsAdapter) {
    if (!storageConfig.ipfs.enabled) {
      throw new Error('IPFS storage is not enabled. Set IPFS_ENABLED=true in environment.');
    }
    ipfsAdapter = new IPFSStorageAdapter();
  }
  return ipfsAdapter;
}

/**
 * Get a storage adapter by provider type
 *
 * @param provider - The storage provider type ('s3', 'ipfs', 'azure')
 * @returns The appropriate storage adapter
 * @throws Error if the provider is not supported or not configured
 */
export function getStorageAdapter(provider?: StorageProviderType): StorageProviderAdapter {
  const providerType = provider || storageConfig.defaultProvider;

  switch (providerType) {
    case 's3':
      return getS3Adapter();

    case 'ipfs':
      return getIPFSAdapter();

    case 'azure':
      // Azure adapter not implemented yet
      throw new Error('Azure storage adapter is not yet implemented');

    default:
      throw new Error(`Unknown storage provider: ${providerType}`);
  }
}

/**
 * Get the default storage adapter based on configuration
 */
export function getDefaultStorageAdapter(): StorageProviderAdapter {
  return getStorageAdapter(storageConfig.defaultProvider);
}

/**
 * Check if a specific storage provider is available
 */
export function isProviderAvailable(provider: StorageProviderType): boolean {
  switch (provider) {
    case 's3':
      return storageConfig.s3.enabled;
    case 'ipfs':
      return storageConfig.ipfs.enabled;
    case 'azure':
      return false; // Not implemented
    default:
      return false;
  }
}

/**
 * Get all available storage providers
 */
export function getAvailableProviders(): StorageProviderType[] {
  const providers: StorageProviderType[] = [];

  if (storageConfig.s3.enabled) {
    providers.push('s3');
  }

  if (storageConfig.ipfs.enabled) {
    providers.push('ipfs');
  }

  return providers;
}

/**
 * Reset adapter instances (useful for testing)
 */
export function resetAdapters(): void {
  s3Adapter = null;
  ipfsAdapter = null;
}

/**
 * Health check all configured storage providers
 */
export async function healthCheckAllProviders(): Promise<
  Record<StorageProviderType, { healthy: boolean; latencyMs: number; error?: string }>
> {
  const results: Record<string, { healthy: boolean; latencyMs: number; error?: string }> = {};

  if (storageConfig.s3.enabled) {
    try {
      const adapter = getS3Adapter();
      results.s3 = await adapter.healthCheck();
    } catch (error) {
      results.s3 = {
        healthy: false,
        latencyMs: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  if (storageConfig.ipfs.enabled) {
    try {
      const adapter = getIPFSAdapter();
      results.ipfs = await adapter.healthCheck();
    } catch (error) {
      results.ipfs = {
        healthy: false,
        latencyMs: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  return results as Record<StorageProviderType, { healthy: boolean; latencyMs: number; error?: string }>;
}

// Re-export storage config utilities
export { storageConfig, isStorageConfigured, validateStorageConfig } from '../../config/storage.js';
