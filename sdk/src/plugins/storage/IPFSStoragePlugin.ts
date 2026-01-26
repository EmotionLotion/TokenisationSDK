/**
 * IPFS Storage Plugin
 *
 * Implements IStoragePlugin interface for IPFS using Pinata as the pinning service.
 * Provides content-addressable storage with CID-based URIs.
 */

import { ok, err, type Result } from '../../core/types.js';
import type { IStoragePlugin, StorageMetadata } from '../../core/interfaces.js';

export interface IPFSStoragePluginConfig {
  pinataJwt: string;
  pinataGateway?: string;
}

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

export class IPFSStoragePlugin implements IStoragePlugin {
  readonly pluginId = 'ipfs-storage';
  readonly providerName = 'IPFS';

  private jwt: string;
  private gateway: string;
  private apiBase = 'https://api.pinata.cloud';

  constructor(config: IPFSStoragePluginConfig) {
    this.jwt = config.pinataJwt;
    this.gateway = (config.pinataGateway || 'https://gateway.pinata.cloud').replace(/\/$/, '');
  }

  async store(content: Buffer | string, filename?: string): Promise<Result<StorageMetadata, string>> {
    try {
      const buffer = typeof content === 'string' ? Buffer.from(content) : content;

      // Create form data for Pinata upload
      const formData = new FormData();
      // Node.js Buffer extends Uint8Array, which works with Blob
      const blob = new Blob([new Uint8Array(buffer)]);
      const uploadFilename = filename || 'file';
      formData.append('file', blob, uploadFilename);

      // Add metadata
      const pinataMetadata = {
        name: uploadFilename,
        keyvalues: {
          uploadedAt: new Date().toISOString(),
          sdk: 'tokenisation-sdk',
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
        return err(`Pinata upload failed: ${response.status} - ${errorText}`);
      }

      const result = (await response.json()) as PinataUploadResponse;

      // Compute SHA256 hash of content
      const { createHash } = await import('crypto');
      const contentHash = createHash('sha256').update(buffer).digest('hex');

      // Detect MIME type
      let mimeType = 'application/octet-stream';
      if (filename) {
        if (filename.endsWith('.json')) mimeType = 'application/json';
        else if (filename.endsWith('.pdf')) mimeType = 'application/pdf';
        else if (filename.endsWith('.png')) mimeType = 'image/png';
        else if (filename.endsWith('.jpg') || filename.endsWith('.jpeg')) mimeType = 'image/jpeg';
        else if (filename.endsWith('.txt')) mimeType = 'text/plain';
      }

      const metadata: StorageMetadata = {
        uri: `ipfs://${result.IpfsHash}`,
        contentHash,
        size: result.PinSize,
        mimeType,
        uploadedAt: result.Timestamp,
      };

      return ok(metadata);
    } catch (error) {
      return err(`IPFS store failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async retrieve(uri: string): Promise<Result<Buffer, string>> {
    try {
      const cid = this.extractCidFromUri(uri);
      const gatewayUrl = `${this.gateway}/ipfs/${cid}`;

      const response = await fetch(gatewayUrl, {
        headers: {
          Authorization: `Bearer ${this.jwt}`,
        },
      });

      if (!response.ok) {
        return err(`IPFS retrieve failed: ${response.status}`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      return ok(buffer);
    } catch (error) {
      return err(`IPFS retrieve failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async exists(uri: string): Promise<boolean> {
    try {
      const cid = this.extractCidFromUri(uri);

      // Check if pinned
      const response = await fetch(
        `${this.apiBase}/data/pinList?status=pinned&hashContains=${cid}`,
        {
          headers: {
            Authorization: `Bearer ${this.jwt}`,
          },
        }
      );

      if (!response.ok) {
        return false;
      }

      const result = (await response.json()) as PinataPinListResponse;
      return result.count > 0;
    } catch {
      return false;
    }
  }

  async pin(uri: string): Promise<Result<void, string>> {
    try {
      const cid = this.extractCidFromUri(uri);

      // Pin by CID
      const response = await fetch(`${this.apiBase}/pinning/pinByHash`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.jwt}`,
        },
        body: JSON.stringify({
          hashToPin: cid,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return err(`IPFS pin failed: ${response.status} - ${errorText}`);
      }

      return ok(undefined);
    } catch (error) {
      return err(`IPFS pin failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async unpin(uri: string): Promise<Result<void, string>> {
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
        return err(`IPFS unpin failed: ${response.status} - ${errorText}`);
      }

      return ok(undefined);
    } catch (error) {
      return err(`IPFS unpin failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getMetadata(uri: string): Promise<Result<StorageMetadata, string>> {
    try {
      const cid = this.extractCidFromUri(uri);

      // Get pin info from Pinata
      const response = await fetch(
        `${this.apiBase}/data/pinList?status=pinned&hashContains=${cid}`,
        {
          headers: {
            Authorization: `Bearer ${this.jwt}`,
          },
        }
      );

      if (!response.ok) {
        return err(`IPFS getMetadata failed: ${response.status}`);
      }

      const result = (await response.json()) as PinataPinListResponse;

      if (result.count === 0) {
        return err(`Content not found: ${uri}`);
      }

      const pin = result.rows[0];

      // Note: contentHash would need to be computed by downloading the content
      // For IPFS, the CID itself is a content hash (but not SHA256)
      const metadata: StorageMetadata = {
        uri,
        contentHash: cid, // CID is the content-addressable hash
        size: pin.size,
        mimeType: 'application/octet-stream', // Would need content analysis for accurate type
        uploadedAt: pin.date_pinned,
      };

      return ok(metadata);
    } catch (error) {
      return err(`IPFS getMetadata failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get the gateway URL for a given IPFS URI
   */
  getGatewayUrl(uri: string): string {
    const cid = this.extractCidFromUri(uri);
    return `${this.gateway}/ipfs/${cid}`;
  }

  /**
   * Verify content integrity by downloading and hashing
   */
  async verifyIntegrity(uri: string, expectedSha256: string): Promise<Result<boolean, string>> {
    try {
      const contentResult = await this.retrieve(uri);
      if (!contentResult.success) {
        return err((contentResult as { success: false; error: string }).error);
      }

      const { createHash } = await import('crypto');
      const actualHash = createHash('sha256').update(contentResult.data).digest('hex');

      return ok(actualHash.toLowerCase() === expectedSha256.toLowerCase());
    } catch (error) {
      return err(`Integrity verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private extractCidFromUri(uri: string): string {
    const match = uri.match(/^(?:ipfs:\/\/|\/ipfs\/)?([a-zA-Z0-9]+)$/);
    if (match) {
      return match[1];
    }
    throw new Error(`Invalid IPFS URI format: ${uri}`);
  }
}

export default IPFSStoragePlugin;
