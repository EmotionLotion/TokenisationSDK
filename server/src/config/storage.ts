/**
 * Storage Configuration
 *
 * Configuration for S3 and IPFS storage providers.
 * Supports AWS S3, S3-compatible services (MinIO, DigitalOcean Spaces), and IPFS via Pinata.
 */

export interface S3Config {
  enabled: boolean;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint?: string; // Optional for S3-compatible services
  forcePathStyle?: boolean; // Required for MinIO
}

export interface IPFSConfig {
  enabled: boolean;
  pinataJwt: string;
  pinataGateway: string;
}

export interface StorageConfig {
  s3: S3Config;
  ipfs: IPFSConfig;
  defaultProvider: 's3' | 'ipfs' | 'azure';
}

function getEnvVar(key: string, defaultValue?: string): string {
  const value = process.env[key];
  if (value === undefined) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    return '';
  }
  return value;
}

function getEnvBool(key: string, defaultValue: boolean = false): boolean {
  const value = process.env[key];
  if (value === undefined) {
    return defaultValue;
  }
  return value.toLowerCase() === 'true' || value === '1';
}

export const storageConfig: StorageConfig = {
  s3: {
    enabled: getEnvBool('S3_ENABLED', false),
    region: getEnvVar('S3_REGION', 'us-east-1'),
    bucket: getEnvVar('S3_BUCKET', ''),
    accessKeyId: getEnvVar('S3_ACCESS_KEY_ID', ''),
    secretAccessKey: getEnvVar('S3_SECRET_ACCESS_KEY', ''),
    endpoint: getEnvVar('S3_ENDPOINT') || undefined,
    forcePathStyle: getEnvBool('S3_FORCE_PATH_STYLE', false),
  },
  ipfs: {
    enabled: getEnvBool('IPFS_ENABLED', false),
    pinataJwt: getEnvVar('PINATA_JWT', ''),
    pinataGateway: getEnvVar('PINATA_GATEWAY', 'https://gateway.pinata.cloud'),
  },
  defaultProvider: (getEnvVar('DEFAULT_STORAGE_PROVIDER', 's3') as 's3' | 'ipfs' | 'azure'),
};

/**
 * Validate storage configuration
 * Returns an array of validation errors, empty if valid
 */
export function validateStorageConfig(): string[] {
  const errors: string[] = [];

  if (storageConfig.s3.enabled) {
    if (!storageConfig.s3.bucket) {
      errors.push('S3_BUCKET is required when S3_ENABLED=true');
    }
    if (!storageConfig.s3.accessKeyId) {
      errors.push('S3_ACCESS_KEY_ID is required when S3_ENABLED=true');
    }
    if (!storageConfig.s3.secretAccessKey) {
      errors.push('S3_SECRET_ACCESS_KEY is required when S3_ENABLED=true');
    }
  }

  if (storageConfig.ipfs.enabled) {
    if (!storageConfig.ipfs.pinataJwt) {
      errors.push('PINATA_JWT is required when IPFS_ENABLED=true');
    }
  }

  // Ensure at least one provider is enabled for production use
  const defaultProvider = storageConfig.defaultProvider;
  if (defaultProvider === 's3' && !storageConfig.s3.enabled) {
    errors.push('DEFAULT_STORAGE_PROVIDER is set to s3 but S3_ENABLED is false');
  }
  if (defaultProvider === 'ipfs' && !storageConfig.ipfs.enabled) {
    errors.push('DEFAULT_STORAGE_PROVIDER is set to ipfs but IPFS_ENABLED is false');
  }

  return errors;
}

/**
 * Check if storage is configured for production use
 */
export function isStorageConfigured(): boolean {
  return storageConfig.s3.enabled || storageConfig.ipfs.enabled;
}

export default storageConfig;
