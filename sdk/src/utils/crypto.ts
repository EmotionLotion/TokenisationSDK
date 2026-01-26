/**
 * Cross-Platform Cryptographic Utilities
 *
 * Provides consistent crypto operations across Node.js and browser environments.
 * Uses Node.js native crypto when available, falls back to Web Crypto API.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface HmacOptions {
  algorithm: 'sha256' | 'sha512';
  encoding?: 'hex' | 'base64';
}

export interface HashOptions {
  algorithm: 'sha256' | 'sha512' | 'md5';
  encoding?: 'hex' | 'base64';
}

// ============================================================================
// ENVIRONMENT DETECTION
// ============================================================================

const isNode = typeof process !== 'undefined' &&
  process.versions != null &&
  process.versions.node != null;

// ============================================================================
// NODE.JS CRYPTO
// ============================================================================

async function hmacNode(
  secret: string,
  data: string,
  options: HmacOptions
): Promise<string> {
  const crypto = await import('crypto');
  const hmac = crypto.createHmac(options.algorithm, secret);
  hmac.update(data);
  return hmac.digest(options.encoding ?? 'hex');
}

async function hashNode(
  data: string | Buffer,
  options: HashOptions
): Promise<string> {
  const crypto = await import('crypto');
  const hash = crypto.createHash(options.algorithm);
  hash.update(data);
  return hash.digest(options.encoding ?? 'hex');
}

async function timingSafeEqualNode(a: string, b: string): Promise<boolean> {
  const crypto = await import('crypto');
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);

  if (bufA.length !== bufB.length) {
    return false;
  }

  return crypto.timingSafeEqual(bufA, bufB);
}

async function randomBytesNode(length: number): Promise<Buffer> {
  const crypto = await import('crypto');
  return crypto.randomBytes(length);
}

// ============================================================================
// WEB CRYPTO API (Browser fallback)
// ============================================================================

async function hmacWeb(
  secret: string,
  data: string,
  options: HmacOptions
): Promise<string> {
  const encoder = new TextEncoder();
  const algorithm = options.algorithm === 'sha256' ? 'SHA-256' : 'SHA-512';

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: algorithm },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(data)
  );

  return bufferToString(new Uint8Array(signature), options.encoding ?? 'hex');
}

async function hashWeb(
  data: string | Uint8Array,
  options: HashOptions
): Promise<string> {
  const encoder = new TextEncoder();
  const algorithmMap: Record<string, string> = {
    sha256: 'SHA-256',
    sha512: 'SHA-512',
    md5: 'MD5', // Note: MD5 may not be available in all browsers
  };

  const algorithm = algorithmMap[options.algorithm];
  const dataBytes = typeof data === 'string' ? encoder.encode(data) : data;
  const hashBuffer = await crypto.subtle.digest(algorithm, dataBytes);

  return bufferToString(new Uint8Array(hashBuffer), options.encoding ?? 'hex');
}

async function timingSafeEqualWeb(a: string, b: string): Promise<boolean> {
  // Web Crypto doesn't have timing-safe compare, implement constant-time comparison
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

async function randomBytesWeb(length: number): Promise<Uint8Array> {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function bufferToString(buffer: Uint8Array, encoding: 'hex' | 'base64'): string {
  if (encoding === 'hex') {
    return Array.from(buffer)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } else {
    // Base64 encoding
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(buffer).toString('base64');
    }
    return btoa(String.fromCharCode(...buffer));
  }
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

// ============================================================================
// EXPORTED FUNCTIONS
// ============================================================================

/**
 * Create HMAC signature
 */
export async function hmac(
  secret: string,
  data: string,
  options: HmacOptions = { algorithm: 'sha256' }
): Promise<string> {
  if (isNode) {
    return hmacNode(secret, data, options);
  }
  return hmacWeb(secret, data, options);
}

/**
 * Create hash
 */
export async function hash(
  data: string | Buffer | Uint8Array,
  options: HashOptions = { algorithm: 'sha256' }
): Promise<string> {
  if (isNode) {
    return hashNode(data as string | Buffer, options);
  }
  return hashWeb(data as string | Uint8Array, options);
}

/**
 * Constant-time string comparison
 */
export async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  if (isNode) {
    return timingSafeEqualNode(a, b);
  }
  return timingSafeEqualWeb(a, b);
}

/**
 * Generate random bytes
 */
export async function randomBytes(length: number): Promise<Uint8Array> {
  if (isNode) {
    const buf = await randomBytesNode(length);
    return new Uint8Array(buf);
  }
  return randomBytesWeb(length);
}

/**
 * Generate random hex string
 */
export async function randomHex(length: number): Promise<string> {
  const bytes = await randomBytes(length);
  return bufferToString(bytes, 'hex');
}

/**
 * Generate UUID v4
 */
export async function randomUUID(): Promise<string> {
  const bytes = await randomBytes(16);

  // Set version (4) and variant (RFC 4122)
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = bufferToString(bytes, 'hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

// ============================================================================
// WEBHOOK SIGNATURE VERIFICATION
// ============================================================================

export interface WebhookSignatureOptions {
  /** The raw payload string */
  payload: string;
  /** The signature from the webhook header */
  signature: string;
  /** The webhook secret */
  secret: string;
  /** Timestamp from the webhook (optional, for replay protection) */
  timestamp?: string;
  /** Maximum age in seconds for timestamp validation (default: 300) */
  maxAgeSeconds?: number;
}

/**
 * Verify Stripe webhook signature
 */
export async function verifyStripeSignature(options: WebhookSignatureOptions): Promise<boolean> {
  const { payload, signature, secret, maxAgeSeconds = 300 } = options;

  // Parse Stripe signature header: t=timestamp,v1=signature
  const parts = signature.split(',');
  const timestamp = parts.find((p) => p.startsWith('t='))?.slice(2);
  const sig = parts.find((p) => p.startsWith('v1='))?.slice(3);

  if (!timestamp || !sig) {
    return false;
  }

  // Validate timestamp (replay protection)
  const eventTime = parseInt(timestamp, 10);
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - eventTime) > maxAgeSeconds) {
    return false;
  }

  // Compute expected signature
  const signedPayload = `${timestamp}.${payload}`;
  const expectedSig = await hmac(secret, signedPayload, { algorithm: 'sha256' });

  return timingSafeEqual(sig, expectedSig);
}

/**
 * Verify generic HMAC webhook signature
 */
export async function verifyHmacSignature(options: WebhookSignatureOptions): Promise<boolean> {
  const { payload, signature, secret, timestamp, maxAgeSeconds = 300 } = options;

  // Validate timestamp if provided
  if (timestamp) {
    const eventTime = parseInt(timestamp, 10);
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - eventTime) > maxAgeSeconds) {
      return false;
    }
  }

  // Compute expected signature
  const dataToSign = timestamp ? `${timestamp}.${payload}` : payload;
  const expectedSig = await hmac(secret, dataToSign, { algorithm: 'sha256' });

  return timingSafeEqual(signature, expectedSig);
}

/**
 * Verify Circle/AWS SNS signature (simplified)
 */
export async function verifySnsSignature(
  message: Record<string, unknown>,
  _certificateUrl: string
): Promise<boolean> {
  // In production, fetch the certificate from certificateUrl and verify
  // For now, return true if message has required fields
  return !!(message.Type && message.MessageId && message.TopicArn);
}

/**
 * Create webhook signature for testing
 */
export async function createWebhookSignature(
  payload: string,
  secret: string,
  timestamp?: number
): Promise<string> {
  const ts = timestamp ?? Math.floor(Date.now() / 1000);
  const signedPayload = `${ts}.${payload}`;
  const sig = await hmac(secret, signedPayload, { algorithm: 'sha256' });
  return `t=${ts},v1=${sig}`;
}
