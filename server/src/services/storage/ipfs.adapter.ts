/**
 * IPFS Storage Adapter
 *
 * Implements StorageProviderAdapter for IPFS using Pinata as the pinning service.
 * Uses content-addressable storage with CID-based URIs.
 */

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

interface PinataUploadResponse {
  IpfsHash: string;
  PinSize: number;
  Timestamp: string;
}

interface PinataPinListResponse {
  rows: Array<{
    ipfs_pin_hash: string;
    size: number;
    date_pinned: string;
    metadata: {
      name?: string;
      keyvalues?: Record<string, string>;
    };
  }>;
  count: number;
}

export class IPFSStorageAdapter implements StorageProviderAdapter {
  readonly providerName = 'ipfs' as const;

  private jwt: string;
  private gateway: string;
  private apiBase = 'https://api.pinata.cloud';

  constructor() {
    const config = storageConfig.ipfs;
    this.jwt = config.pinataJwt;
    this.gateway = config.pinataGateway.replace(/\/$/, ''); // Remove trailing slash
  }

  /**
   * Generate upload URL for IPFS via Pinata
   *
   * Note: IPFS doesn't support presigned URLs in the same way as S3.
   * For IPFS uploads, the client should either:
   * 1. Upload to the server which then pins to Pinata
   * 2. Use Pinata's Web3 SDK directly from the client
   *
   * This implementation provides a server-side upload endpoint approach.
   */
  async generateUploadUrl(params: UploadUrlParams): Promise<UploadUrlResult> {
    const { orgId, fileName, contentType, expiresInSeconds = 900 } = params;

    // For IPFS, we generate a unique upload ID that the client will use
    // to upload the file to our server, which then pins it to Pinata
    const uploadId = `${orgId}-${Date.now()}-${this.sanitizeFileName(fileName)}`;

    // The "upload URL" is actually our server endpoint that handles Pinata pinning
    // In a real implementation, this would be your server's upload endpoint
    const uploadUrl = `/api/v1/storage/ipfs/upload/${uploadId}`;

    // The document URI will be populated after upload with the actual CID
    // For now, we return a placeholder that will be replaced
    const documentUri = `ipfs://pending-${uploadId}`;

    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

    return {
      uploadUrl,
      documentUri,
      headers: {
        'Content-Type': contentType,
        'X-Upload-Id': uploadId,
        'X-Org-Id': orgId,
        'X-File-Name': fileName,
      },
      expiresAt,
    };
  }

  /**
   * Pin content directly to IPFS via Pinata
   * This is called by the server after receiving the file from the client
   */
  async pinContent(
    content: Buffer,
    fileName: string,
    orgId: string,
    metadata?: Record<string, string>
  ): Promise<{ cid: string; uri: string; size: number }> {
    const formData = new FormData();

    // Create a blob from the buffer
    // Node.js Buffer extends Uint8Array, which should work with Blob
    const blob = new Blob([new Uint8Array(content)]);
    formData.append('file', blob, fileName);

    // Add pinata metadata
    const pinataMetadata = {
      name: fileName,
      keyvalues: {
        orgId,
        uploadedAt: new Date(),
        ...metadata,
      },
    };
    formData.append('pinataMetadata', JSON.stringify(pinataMetadata));

    const response = await fetch(`${this.apiBase}/pinning/pinFileToIPFS`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.jwt}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Pinata upload failed: ${response.status} - ${errorText}`);
    }

    const result = (await response.json()) as PinataUploadResponse;

    return {
      cid: result.IpfsHash,
      uri: `ipfs://${result.IpfsHash}`,
      size: result.PinSize,
    };
  }

  /**
   * Generate a gateway URL for downloading content
   */
  async generateDownloadUrl(uri: string, expiresInSeconds: number = 3600): Promise<DownloadUrlResult> {
    const cid = this.extractCidFromUri(uri);

    // Pinata dedicated gateway with optional token for private content
    const downloadUrl = `${this.gateway}/ipfs/${cid}`;

    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

    return {
      downloadUrl,
      expiresAt,
    };
  }

  /**
   * Verify content integrity
   *
   * IPFS is content-addressed, so the CID IS the content hash.
   * However, we also verify against the expected SHA256 for cross-validation.
   */
  async verifyIntegrity(uri: string, expectedSha256: string): Promise<IntegrityVerificationResult> {
    try {
      const cid = this.extractCidFromUri(uri);

      // Fetch the content from the gateway
      const response = await fetch(`${this.gateway}/ipfs/${cid}`, {
        headers: {
          Authorization: `Bearer ${this.jwt}`,
        },
      });

      if (!response.ok) {
        return {
          verified: false,
          error: `Failed to fetch content: ${response.status}`,
        };
      }

      const buffer = Buffer.from(await response.arrayBuffer());
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
   * Unpin content from Pinata
   */
  async delete(uri: string): Promise<DeleteResult> {
    try {
      const cid = this.extractCidFromUri(uri);

      const response = await fetch(`${this.apiBase}/pinning/unpin/${cid}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${this.jwt}`,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          error: `Failed to unpin: ${response.status} - ${errorText}`,
        };
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error during deletion',
      };
    }
  }

  /**
   * Check Pinata API connectivity
   */
  async healthCheck(): Promise<HealthCheckResult> {
    const startTime = Date.now();

    try {
      const response = await fetch(`${this.apiBase}/data/testAuthentication`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.jwt}`,
        },
      });

      if (!response.ok) {
        return {
          healthy: false,
          latencyMs: Date.now() - startTime,
          error: `Authentication test failed: ${response.status}`,
        };
      }

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
   * Get pin information for a CID
   */
  async getPinInfo(cid: string): Promise<{
    pinned: boolean;
    size?: number;
    pinnedAt?: string;
  }> {
    try {
      const response = await fetch(
        `${this.apiBase}/data/pinList?status=pinned&hashContains=${cid}`,
        {
          headers: {
            Authorization: `Bearer ${this.jwt}`,
          },
        }
      );

      if (!response.ok) {
        return { pinned: false };
      }

      const result = (await response.json()) as PinataPinListResponse;

      if (result.count === 0) {
        return { pinned: false };
      }

      const pin = result.rows[0];
      return {
        pinned: true,
        size: pin.size,
        pinnedAt: pin.date_pinned,
      };
    } catch {
      return { pinned: false };
    }
  }

  /**
   * Extract CID from an IPFS URI
   */
  private extractCidFromUri(uri: string): string {
    // Handle formats: ipfs://cid, /ipfs/cid, or just cid
    const match = uri.match(/^(?:ipfs:\/\/|\/ipfs\/)?([a-zA-Z0-9]+)$/);
    if (match) {
      return match[1];
    }

    throw new Error(`Invalid IPFS URI format: ${uri}`);
  }

  /**
   * Sanitize filename for metadata
   */
  private sanitizeFileName(fileName: string): string {
    return fileName
      .replace(/[^\w\s.-]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .substring(0, 200);
  }
}

export default IPFSStorageAdapter;
