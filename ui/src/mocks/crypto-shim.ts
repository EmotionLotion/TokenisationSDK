// Custom crypto shim: imports crypto-browserify (CJS) and adds/overrides
// Node-only APIs that the SDK's DecisionReceipt needs.
//
// crypto-browserify provides createHash, randomBytes, etc. but its
// createSign/createVerify (from browserify-sign) try to parse real PEM keys.
// Since we only have dummy keys in the browser demo, we stub those too.

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore -- no type declarations for crypto-browserify
import cryptoBrowserify from 'crypto-browserify';

// --- Stubs for Node-only crypto APIs ---

const dummyPEM = '-----BEGIN PUBLIC KEY-----\nDUMMY\n-----END PUBLIC KEY-----';

export function generateKeyPairSync(
  _type: string,
  _options?: unknown,
): { publicKey: string; privateKey: string } {
  return { publicKey: dummyPEM, privateKey: dummyPEM };
}

export function createSign(_algorithm: string) {
  return {
    update(_data: unknown) { return this; },
    sign(_key: unknown, _encoding?: string) { return 'browser-demo-signature'; },
  };
}

export function createVerify(_algorithm: string) {
  return {
    update(_data: unknown) { return this; },
    verify(_key: unknown, _sig: unknown, _encoding?: string) { return true; },
  };
}

// --- Re-export everything else from crypto-browserify ---

// Destructure only the exports we DON'T override
const {
  createSign: _cs,
  createVerify: _cv,
  Sign: _Sign,
  Verify: _Verify,
  ...rest
} = cryptoBrowserify as Record<string, any>;

// Named re-exports of the non-overridden functions
export const {
  randomBytes,
  createHash,
  createHmac,
  getHashes,
  pbkdf2,
  pbkdf2Sync,
  Cipher,
  createCipher,
  Cipheriv,
  createCipheriv,
  Decipher,
  createDecipher,
  Decipheriv,
  createDecipheriv,
  getCiphers,
  listCiphers,
  DiffieHellmanGroup,
  createDiffieHellmanGroup,
  getDiffieHellman,
  createDiffieHellman,
  DiffieHellman,
  createECDH,
  publicEncrypt,
  privateEncrypt,
  publicDecrypt,
  privateDecrypt,
  randomFill,
  randomFillSync,
  constants,
  Hash,
  Hmac,
  rng,
  pseudoRandomBytes,
  prng,
} = rest;

// Stub Sign/Verify classes too
export const Sign = createSign;
export const Verify = createVerify;

// Default export with everything merged
export default {
  ...cryptoBrowserify,
  generateKeyPairSync,
  createSign,
  createVerify,
  Sign,
  Verify,
};
