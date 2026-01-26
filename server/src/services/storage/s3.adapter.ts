/**
 * S3 Storage Adapter
 *
 * Implements StorageProviderAdapter for AWS S3 and S3-compatible services.
 * Uses AWS SDK v3 for presigned URLs and object operations.
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  GetObjectCommandInput,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createHash } from 'crypto';
import type {
  StorageProviderAdapter,
  UploadUrlParams,
  UploadUrlResult,
  DownloadUrlResult,
  IntegrityVerificationResult,
  DeleteResult,
  HealthCheckResult,
} from './storage.adapter.js';
import { storageConfig } from '../../config/storage.js';

export class S3StorageAdapter implements StorageProviderAdapter {
  readonly providerName = 's3' as const;

  private client: S3Client;
  private bucket: string;

  constructor() {
    const config = storageConfig.s3;

    const clientConfig: ConstructorParameters<typeof S3Client>[0] = {
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    };

    // Support S3-compatible services (MinIO, DigitalOcean Spaces, etc.)
    if (config.endpoint) {
      clientConfig.endpoint = config.endpoint;
      clientConfig.forcePathStyle = config.forcePathStyle ?? true;
    }

    this.client = new S3Client(clientConfig);
    this.bucket = config.bucket;
  }

  /**
   * Generate a presigned PUT URL for direct client uploads
   */
  async generateUploadUrl(params: UploadUrlParams): Promise<UploadUrlResult> {
    const { orgId, fileName, contentType, expiresInSeconds = 900 } = params; // 15 min default

    // Generate a unique key with org isolation
    const timestamp = Date.now();
    const sanitizedFileName = this.sanitizeFileName(fileName);
    const key = `${orgId}/${timestamp}-${sanitizedFileName}`;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(this.client, command, {
      expiresIn: expiresInSeconds,
    });

    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);
    const documentUri = `s3://${this.bucket}/${key}`;

    return {
      uploadUrl,
      documentUri,
      headers: {
        'Content-Type': contentType,
      },
      expiresAt,
    };
  }

  /**
   * Generate a presigned GET URL for downloads
   */
  async generateDownloadUrl(uri: string, expiresInSeconds: number = 3600): Promise<DownloadUrlResult> {
    const key = this.extractKeyFromUri(uri);

    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    const downloadUrl = await getSignedUrl(this.client, command, {
      expiresIn: expiresInSeconds,
    });

    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

    return {
      downloadUrl,
      expiresAt,
    };
  }

  /**
   * Verify document integrity by downloading and computing SHA256
   */
  async verifyIntegrity(uri: string, expectedSha256: string): Promise<IntegrityVerificationResult> {
    try {
      const key = this.extractKeyFromUri(uri);

      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      const response = await this.client.send(command);

      if (!response.Body) {
        return {
          verified: false,
          error: 'Empty response body',
        };
      }

      // Stream the body and compute SHA256
      const chunks: Uint8Array[] = [];
      const stream = response.Body as AsyncIterable<Uint8Array>;

      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      const buffer = Buffer.concat(chunks);
      const actualSha256 = createHash('sha256').update(buffer).digest('hex');

      return {
        verified: actualSha256.toLowerCase() === expectedSha256.toLowerCase(),
        actualSha256,
      };
    } catch (error) {
      return {
        verified: false,
        error: error instanceof Error ? error.message : 'Unknown error during verification',
      };
    }
  }

  /**
   * Delete a document from S3
   */
  async delete(uri: string): Promise<DeleteResult> {
    try {
      const key = this.extractKeyFromUri(uri);

      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      await this.client.send(command);

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error during deletion',
      };
    }
  }

  /**
   * Check S3 bucket connectivity
   */
  async healthCheck(): Promise<HealthCheckResult> {
    const startTime = Date.now();

    try {
      const command = new HeadBucketCommand({
        Bucket: this.bucket,
      });

      await this.client.send(command);

      return {
        healthy: true,
        latencyMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        healthy: false,
        latencyMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Extract the S3 key from a storage URI
   */
  private extractKeyFromUri(uri: string): string {
    // Handle formats: s3://bucket/key or just the key
    const match = uri.match(/^s3:\/\/[^/]+\/(.+)$/);
    if (match) {
      return match[1];
    }

    // If no protocol, assume it's just the key
    if (!uri.includes('://')) {
      return uri;
    }

    throw new Error(`Invalid S3 URI format: ${uri}`);
  }

  /**
   * Sanitize filename for S3 key usage
   */
  private sanitizeFileName(fileName: string): string {
    // Remove or replace characters that are problematic for S3 keys
    return fileName
      .replace(/[^\w\s.-]/g, '_') // Replace special chars with underscore
      .replace(/\s+/g, '_')        // Replace spaces with underscore
      .replace(/_+/g, '_')         // Collapse multiple underscores
      .substring(0, 200);          // Limit length
  }
}

export default S3StorageAdapter;
