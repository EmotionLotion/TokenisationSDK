/**
 * S3 Storage Plugin
 *
 * Implements IStoragePlugin interface for AWS S3 and S3-compatible services.
 * Provides direct S3 operations for SDK usage when not using the API backend.
 */

import { ok, err, type Result } from '../../core/types.js';
import type { IStoragePlugin, StorageMetadata } from '../../core/interfaces.js';
import { ValidationError } from '../../errors/index.js';

export interface S3StoragePluginConfig {
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint?: string; // For S3-compatible services
  forcePathStyle?: boolean; // For MinIO
}

export class S3StoragePlugin implements IStoragePlugin {
  readonly pluginId = 's3-storage';
  readonly providerName = 'S3';

  private config: S3StoragePluginConfig;
  private s3Client: any = null;
  private initialized = false;

  constructor(config: S3StoragePluginConfig) {
    this.config = config;
  }

  /**
   * Lazily initialize the S3 client
   * This allows the plugin to be created before AWS SDK is loaded
   */
  private async getClient(): Promise<any> {
    if (!this.initialized) {
      // Dynamic import to support browser environments where AWS SDK may not be available
      const { S3Client } = await import('@aws-sdk/client-s3');

      const clientConfig: any = {
        region: this.config.region,
        credentials: {
          accessKeyId: this.config.accessKeyId,
          secretAccessKey: this.config.secretAccessKey,
        },
      };

      if (this.config.endpoint) {
        clientConfig.endpoint = this.config.endpoint;
        clientConfig.forcePathStyle = this.config.forcePathStyle ?? true;
      }

      this.s3Client = new S3Client(clientConfig);
      this.initialized = true;
    }

    return this.s3Client;
  }

  async store(content: Buffer | string, filename?: string): Promise<Result<StorageMetadata, string>> {
    try {
      const { PutObjectCommand } = await import('@aws-sdk/client-s3');
      const { createHash } = await import('crypto');

      const client = await this.getClient();
      const buffer = typeof content === 'string' ? Buffer.from(content) : content;

      // Generate content hash for content-addressable key
      const contentHash = createHash('sha256').update(buffer).digest('hex');
      const timestamp = Date.now();
      const sanitizedFilename = filename
        ? filename.replace(/[^\w\s.-]/g, '_').replace(/\s+/g, '_').substring(0, 100)
        : 'file';
      const key = `${timestamp}-${sanitizedFilename}-${contentHash.substring(0, 8)}`;

      // Detect MIME type
      let mimeType = 'application/octet-stream';
      if (filename) {
        if (filename.endsWith('.json')) mimeType = 'application/json';
        else if (filename.endsWith('.pdf')) mimeType = 'application/pdf';
        else if (filename.endsWith('.png')) mimeType = 'image/png';
        else if (filename.endsWith('.jpg') || filename.endsWith('.jpeg')) mimeType = 'image/jpeg';
        else if (filename.endsWith('.txt')) mimeType = 'text/plain';
      }

      const command = new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
      });

      await client.send(command);

      const metadata: StorageMetadata = {
        uri: `s3://${this.config.bucket}/${key}`,
        contentHash,
        size: buffer.length,
        mimeType,
        uploadedAt: new Date().toISOString(),
      };

      return ok(metadata);
    } catch (error) {
      return err(`S3 store failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async retrieve(uri: string): Promise<Result<Buffer, string>> {
    try {
      const { GetObjectCommand } = await import('@aws-sdk/client-s3');

      const client = await this.getClient();
      const key = this.extractKeyFromUri(uri);

      const command = new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
      });

      const response = await client.send(command);

      if (!response.Body) {
        return err('Empty response body');
      }

      // Stream the body to buffer
      const chunks: Uint8Array[] = [];
      const stream = response.Body as AsyncIterable<Uint8Array>;

      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      return ok(Buffer.concat(chunks));
    } catch (error) {
      return err(`S3 retrieve failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async exists(uri: string): Promise<boolean> {
    try {
      const { HeadObjectCommand } = await import('@aws-sdk/client-s3');

      const client = await this.getClient();
      const key = this.extractKeyFromUri(uri);

      const command = new HeadObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
      });

      await client.send(command);
      return true;
    } catch {
      return false;
    }
  }

  async pin(_uri: string): Promise<Result<void, string>> {
    // S3 doesn't have a concept of pinning; objects persist until deleted
    return ok(undefined);
  }

  async unpin(_uri: string): Promise<Result<void, string>> {
    // No-op for S3
    return ok(undefined);
  }

  async getMetadata(uri: string): Promise<Result<StorageMetadata, string>> {
    try {
      const { HeadObjectCommand } = await import('@aws-sdk/client-s3');

      const client = await this.getClient();
      const key = this.extractKeyFromUri(uri);

      const command = new HeadObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
      });

      const response = await client.send(command);

      // For full content hash, we'd need to download the file
      // Here we return a placeholder; use retrieve() + hash for actual verification
      const metadata: StorageMetadata = {
        uri,
        contentHash: response.ETag?.replace(/"/g, '') || 'unknown',
        size: response.ContentLength || 0,
        mimeType: response.ContentType || 'application/octet-stream',
        uploadedAt: response.LastModified?.toISOString() || new Date().toISOString(),
      };

      return ok(metadata);
    } catch (error) {
      return err(`S3 getMetadata failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Delete an object from S3
   */
  async delete(uri: string): Promise<Result<void, string>> {
    try {
      const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');

      const client = await this.getClient();
      const key = this.extractKeyFromUri(uri);

      const command = new DeleteObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
      });

      await client.send(command);
      return ok(undefined);
    } catch (error) {
      return err(`S3 delete failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate a presigned URL for uploading
   */
  async generateUploadUrl(
    key: string,
    contentType: string,
    expiresInSeconds: number = 900
  ): Promise<Result<{ uploadUrl: string; uri: string }, string>> {
    try {
      const { PutObjectCommand } = await import('@aws-sdk/client-s3');
      const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');

      const client = await this.getClient();

      const command = new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        ContentType: contentType,
      });

      const uploadUrl = await getSignedUrl(client, command, {
        expiresIn: expiresInSeconds,
      });

      return ok({
        uploadUrl,
        uri: `s3://${this.config.bucket}/${key}`,
      });
    } catch (error) {
      return err(`S3 generateUploadUrl failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate a presigned URL for downloading
   */
  async generateDownloadUrl(
    uri: string,
    expiresInSeconds: number = 3600
  ): Promise<Result<string, string>> {
    try {
      const { GetObjectCommand } = await import('@aws-sdk/client-s3');
      const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');

      const client = await this.getClient();
      const key = this.extractKeyFromUri(uri);

      const command = new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
      });

      const downloadUrl = await getSignedUrl(client, command, {
        expiresIn: expiresInSeconds,
      });

      return ok(downloadUrl);
    } catch (error) {
      return err(`S3 generateDownloadUrl failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private extractKeyFromUri(uri: string): string {
    const match = uri.match(/^s3:\/\/[^/]+\/(.+)$/);
    if (match) {
      return match[1];
    }
    if (!uri.includes('://')) {
      return uri;
    }
    throw new ValidationError(`Invalid S3 URI format: ${uri}`, {
      field: 'uri',
      constraints: { format: 's3://bucket/key or plain key' },
    });
  }
}

export default S3StoragePlugin;
