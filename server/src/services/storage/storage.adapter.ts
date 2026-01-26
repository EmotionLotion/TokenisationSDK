/**
 * Storage Provider Adapter Interface
 *
 * Defines the contract for storage providers (S3, IPFS, Azure, etc.)
 * Following the adapter pattern used throughout the SDK.
 */

export type StorageProviderType = 's3' | 'ipfs' | 'azure';

export interface UploadUrlParams {
  orgId: string;
  fileName: string;
  contentType: string;
  expiresInSeconds?: number;
}

export interface UploadUrlResult {
  uploadUrl: string;
  documentUri: string;
  headers?: Record<string, string>;
  expiresAt: Date;
}

export interface DownloadUrlResult {
  downloadUrl: string;
  expiresAt: Date;
}

export interface IntegrityVerificationResult {
  verified: boolean;
  actualSha256?: string;
  error?: string;
}

export interface DeleteResult {
  success: boolean;
  error?: string;
}

export interface HealthCheckResult {
  healthy: boolean;
  latencyMs: number;
  error?: string;
}

/**
 * Storage Provider Adapter Interface
 *
 * All storage providers must implement this interface.
 */
export interface StorageProviderAdapter {
  /** Provider identifier */
  readonly providerName: StorageProviderType;

  /**
   * Generate a presigned URL for direct client uploads
   *
   * @param params - Upload parameters including orgId, fileName, contentType
   * @returns Upload URL, document URI for registration, optional headers, and expiration
   */
  generateUploadUrl(params: UploadUrlParams): Promise<UploadUrlResult>;

  /**
   * Generate a presigned URL for downloading a document
   *
   * @param uri - The document URI (e.g., s3://bucket/key or ipfs://cid)
   * @param expiresInSeconds - URL expiration time (default: 3600)
   * @returns Download URL and expiration
   */
  generateDownloadUrl(uri: string, expiresInSeconds?: number): Promise<DownloadUrlResult>;

  /**
   * Verify the integrity of a stored document by comparing SHA256 hashes
   *
   * @param uri - The document URI
   * @param expectedSha256 - The expected SHA256 hash (hex string)
   * @returns Verification result with actual hash if available
   */
  verifyIntegrity(uri: string, expectedSha256: string): Promise<IntegrityVerificationResult>;

  /**
   * Delete a document from storage
   *
   * @param uri - The document URI to delete
   * @returns Success status and any error
   */
  delete(uri: string): Promise<DeleteResult>;

  /**
   * Check the health of the storage provider
   *
   * @returns Health status and latency
   */
  healthCheck(): Promise<HealthCheckResult>;
}

/**
 * Parse a storage URI to extract provider and path information
 *
 * @param uri - URI in format provider://path (e.g., s3://bucket/key or ipfs://cid)
 * @returns Parsed URI components
 */
export function parseStorageUri(uri: string): { provider: string; path: string } | null {
  const match = uri.match(/^([a-z0-9]+):\/\/(.+)$/i);
  if (!match) {
    return null;
  }
  return {
    provider: match[1].toLowerCase(),
    path: match[2],
  };
}

/**
 * Build a storage URI from components
 *
 * @param provider - Storage provider type
 * @param path - The path/key within the provider
 * @returns Formatted URI
 */
export function buildStorageUri(provider: StorageProviderType, path: string): string {
  return `${provider}://${path}`;
}
