/**
 * Signing Service
 *
 * Provides signing/verification for compliance decisions.
 * Supports multiple backends: ephemeral (dev), file-based PEM, AWS KMS.
 */

import {
  createSign,
  createVerify,
  generateKeyPairSync,
  createPublicKey,
  createPrivateKey,
  type KeyObject,
} from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { logger } from '../../middleware/logger.js';

// ============================================================================
// Interface
// ============================================================================

export interface ISigningService {
  sign(payload: string): Promise<string>;
  verify(payload: string, signature: string): Promise<boolean>;
  getPublicKey(): Promise<string>;
}

// ============================================================================
// Canonical JSON — deterministic serialisation (sorted keys)
// ============================================================================

export function canonicalJsonStringify(obj: unknown): string {
  return JSON.stringify(obj, (_key, value) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return Object.keys(value)
        .sort()
        .reduce<Record<string, unknown>>((sorted, k) => {
          sorted[k] = (value as Record<string, unknown>)[k];
          return sorted;
        }, {});
    }
    return value;
  });
}

// ============================================================================
// Ephemeral Signing Service (dev-only)
// ============================================================================

export class EphemeralSigningService implements ISigningService {
  private privateKey: KeyObject;
  private publicKey: KeyObject;

  constructor() {
    logger.warn(
      'Using ephemeral signing keys — NOT suitable for production. Set SIGNING_PROVIDER=file or SIGNING_PROVIDER=kms.',
    );
    const pair = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    this.privateKey = createPrivateKey(pair.privateKey);
    this.publicKey = createPublicKey(pair.publicKey);
  }

  async sign(payload: string): Promise<string> {
    const signer = createSign('RSA-SHA256');
    signer.update(payload);
    return signer.sign(this.privateKey, 'base64');
  }

  async verify(payload: string, signature: string): Promise<boolean> {
    const verifier = createVerify('RSA-SHA256');
    verifier.update(payload);
    return verifier.verify(this.publicKey, signature, 'base64');
  }

  async getPublicKey(): Promise<string> {
    return this.publicKey.export({ type: 'spki', format: 'pem' }) as string;
  }
}

// ============================================================================
// File Key Signing Service (loads RSA PEM from disk)
// ============================================================================

export class FileKeySigningService implements ISigningService {
  private privateKey: KeyObject;
  private publicKey: KeyObject;

  constructor(keyPath: string) {
    const pem = readFileSync(keyPath, 'utf-8');
    this.privateKey = createPrivateKey(pem);
    this.publicKey = createPublicKey(this.privateKey);
    logger.info('Loaded signing key from file', { path: keyPath });
  }

  async sign(payload: string): Promise<string> {
    const signer = createSign('RSA-SHA256');
    signer.update(payload);
    return signer.sign(this.privateKey, 'base64');
  }

  async verify(payload: string, signature: string): Promise<boolean> {
    const verifier = createVerify('RSA-SHA256');
    verifier.update(payload);
    return verifier.verify(this.publicKey, signature, 'base64');
  }

  async getPublicKey(): Promise<string> {
    return this.publicKey.export({ type: 'spki', format: 'pem' }) as string;
  }
}

// ============================================================================
// AWS KMS Signing Service
// ============================================================================

export class AwsKmsSigningService implements ISigningService {
  private keyId: string;
  private kmsClient: any; // lazily loaded @aws-sdk/client-kms

  constructor(keyId: string) {
    this.keyId = keyId;
    logger.info('Using AWS KMS signing', { keyId });
  }

  private async getClient() {
    if (!this.kmsClient) {
      try {
        const { KMSClient } = await import('@aws-sdk/client-kms');
        this.kmsClient = new KMSClient({
          region: process.env.AWS_REGION || 'us-east-1',
        });
      } catch {
        throw new Error(
          'AWS KMS signing requires @aws-sdk/client-kms. Install it with: npm install @aws-sdk/client-kms',
        );
      }
    }
    return this.kmsClient;
  }

  async sign(payload: string): Promise<string> {
    const client = await this.getClient();
    const { SignCommand } = await import('@aws-sdk/client-kms');
    const encoder = new TextEncoder();
    const response = await client.send(
      new SignCommand({
        KeyId: this.keyId,
        Message: encoder.encode(payload),
        MessageType: 'RAW',
        SigningAlgorithm: 'RSASSA_PKCS1_V1_5_SHA_256',
      }),
    );
    return Buffer.from(response.Signature!).toString('base64');
  }

  async verify(payload: string, signature: string): Promise<boolean> {
    const client = await this.getClient();
    const { VerifyCommand } = await import('@aws-sdk/client-kms');
    const encoder = new TextEncoder();
    try {
      const response = await client.send(
        new VerifyCommand({
          KeyId: this.keyId,
          Message: encoder.encode(payload),
          MessageType: 'RAW',
          Signature: Buffer.from(signature, 'base64'),
          SigningAlgorithm: 'RSASSA_PKCS1_V1_5_SHA_256',
        }),
      );
      return response.SignatureValid === true;
    } catch {
      return false;
    }
  }

  async getPublicKey(): Promise<string> {
    const client = await this.getClient();
    const { GetPublicKeyCommand } = await import('@aws-sdk/client-kms');
    const response = await client.send(
      new GetPublicKeyCommand({ KeyId: this.keyId }),
    );
    const der = Buffer.from(response.PublicKey!);
    const pem = `-----BEGIN PUBLIC KEY-----\n${der.toString('base64').match(/.{1,64}/g)!.join('\n')}\n-----END PUBLIC KEY-----`;
    return pem;
  }
}

// ============================================================================
// Factory
// ============================================================================

let signingServiceInstance: ISigningService | null = null;

/**
 * Auto-provisioned file-based signing service.
 * If no PEM file exists at the given path, generates one automatically.
 */
export class AutoFileSigningService extends FileKeySigningService {
  constructor(keyPath: string) {
    const dir = dirname(keyPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    if (!existsSync(keyPath)) {
      logger.info('No signing key found, generating new RSA key pair', { path: keyPath });
      const pair = generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });
      writeFileSync(keyPath, pair.privateKey as string, { mode: 0o600 });
      logger.info('Generated and saved signing key', { path: keyPath });
    }
    super(keyPath);
  }
}

const DEFAULT_KEY_PATH = './data/signing-key.pem';

export function createSigningService(): ISigningService {
  const provider = process.env.SIGNING_PROVIDER;

  // Explicit provider set
  if (provider) {
    switch (provider) {
      case 'file': {
        const keyPath = process.env.SIGNING_KEY_PATH;
        if (!keyPath) {
          throw new Error('SIGNING_KEY_PATH env var is required when SIGNING_PROVIDER=file');
        }
        return new FileKeySigningService(keyPath);
      }
      case 'kms': {
        const keyId = process.env.KMS_KEY_ID;
        if (!keyId) {
          throw new Error('KMS_KEY_ID env var is required when SIGNING_PROVIDER=kms');
        }
        return new AwsKmsSigningService(keyId);
      }
      case 'ephemeral':
        return new EphemeralSigningService();
      default:
        throw new Error(`Unknown SIGNING_PROVIDER: ${provider}`);
    }
  }

  // No explicit provider set — infer based on environment
  if (process.env.NODE_ENV === 'test') {
    return new EphemeralSigningService();
  }

  if (process.env.NODE_ENV === 'production') {
    logger.error(
      'SIGNING_PROVIDER not set in production. Set SIGNING_PROVIDER=file, kms, or ephemeral explicitly. Falling back to auto-file.',
    );
  }

  // Development / unset: auto-generate and persist a file-based key
  return new AutoFileSigningService(process.env.SIGNING_KEY_PATH || DEFAULT_KEY_PATH);
}

export function getSigningService(): ISigningService {
  if (!signingServiceInstance) {
    signingServiceInstance = createSigningService();
  }
  return signingServiceInstance;
}
