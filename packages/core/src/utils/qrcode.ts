/**
 * QR Code Utilities
 *
 * Provides QR code generation and verification functionality for token verification,
 * event tickets, and general-purpose use cases.
 */

import { hmac, timingSafeEqual } from './crypto.js';

// ============================================================================
// TYPES
// ============================================================================

export interface QRCodeOptions {
  /** Size of the QR code in pixels (default: 256) */
  size?: number;
  /** Error correction level (default: 'M') */
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
  /** Margin/quiet zone in modules (default: 4) */
  margin?: number;
  /** Colors for the QR code */
  color?: {
    /** Dark module color (default: '#000000') */
    dark?: string;
    /** Light module color (default: '#ffffff') */
    light?: string;
  };
}

export interface TokenVerificationPayload {
  /** Unique identifier of the token */
  tokenId: string;
  /** Associated asset ID (optional) */
  assetId?: string;
  /** Current holder address or ID (optional) */
  holder?: string;
  /** URL for verification (where to validate the QR) */
  verifyUrl: string;
  /** Expiration timestamp in ISO format (optional) */
  expiresAt?: string;
  /** HMAC signature for verification */
  signature: string;
}

export interface QRCodeResult {
  /** Data URL for embedding in img src (PNG format) */
  dataUrl: string;
  /** SVG string for vector rendering */
  svg: string;
  /** The full verification URL encoded in the QR */
  verificationUrl: string;
}

export interface SimpleQRResult {
  /** Data URL for embedding in img src (PNG format) */
  dataUrl: string;
  /** SVG string for vector rendering */
  svg: string;
}

// ============================================================================
// QR CODE GENERATION (using canvas-based approach for Node.js compatibility)
// ============================================================================

/**
 * QR Code matrix generation
 * Implements Reed-Solomon error correction and QR encoding
 */

// Galois field arithmetic for Reed-Solomon
const GF256_EXP = new Uint8Array(512);
const GF256_LOG = new Uint8Array(256);

// Initialize Galois field tables
(function initGF() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF256_EXP[i] = x;
    GF256_LOG[x] = i;
    x = (x << 1) ^ (x >= 128 ? 0x11d : 0);
  }
  for (let i = 255; i < 512; i++) {
    GF256_EXP[i] = GF256_EXP[i - 255];
  }
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF256_EXP[GF256_LOG[a] + GF256_LOG[b]];
}

function gfDiv(a: number, b: number): number {
  if (b === 0) throw new Error('Division by zero');
  if (a === 0) return 0;
  return GF256_EXP[(GF256_LOG[a] - GF256_LOG[b] + 255) % 255];
}

// Error correction codeword counts per version and level
const EC_CODEWORDS: Record<string, number[]> = {
  L: [7, 10, 15, 20, 26, 18, 20, 24, 30, 18],
  M: [10, 16, 26, 18, 24, 16, 18, 22, 22, 26],
  Q: [13, 22, 18, 26, 18, 24, 18, 22, 20, 24],
  H: [17, 28, 22, 16, 22, 28, 26, 26, 24, 28],
};

// Total codewords per version
const TOTAL_CODEWORDS = [26, 44, 70, 100, 134, 172, 196, 242, 292, 346];

// Alphanumeric character set
const ALPHANUM = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

// Mode indicators
const MODE_NUMERIC = 0b0001;
const MODE_ALPHANUMERIC = 0b0010;
const MODE_BYTE = 0b0100;

// Character count indicator bits per version group
const CHAR_COUNT_BITS = {
  numeric: [10, 12, 14],
  alphanumeric: [9, 11, 13],
  byte: [8, 16, 16],
};

function getVersionGroup(version: number): number {
  if (version <= 9) return 0;
  if (version <= 26) return 1;
  return 2;
}

function selectMode(data: string): number {
  if (/^\d+$/.test(data)) return MODE_NUMERIC;
  if ([...data].every(c => ALPHANUM.includes(c.toUpperCase()))) return MODE_ALPHANUMERIC;
  return MODE_BYTE;
}

function getMinVersion(data: string, mode: number, ecLevel: string): number {
  const dataLen = data.length;

  for (let version = 1; version <= 10; version++) {
    const vg = getVersionGroup(version);
    const totalCodewords = TOTAL_CODEWORDS[version - 1];
    const ecCodewords = EC_CODEWORDS[ecLevel][version - 1];
    const dataCodewords = totalCodewords - ecCodewords;
    const dataBits = dataCodewords * 8;

    let requiredBits = 4; // mode indicator

    switch (mode) {
      case MODE_NUMERIC:
        requiredBits += CHAR_COUNT_BITS.numeric[vg];
        requiredBits += Math.floor(dataLen / 3) * 10;
        requiredBits += (dataLen % 3 === 1) ? 4 : (dataLen % 3 === 2) ? 7 : 0;
        break;
      case MODE_ALPHANUMERIC:
        requiredBits += CHAR_COUNT_BITS.alphanumeric[vg];
        requiredBits += Math.floor(dataLen / 2) * 11;
        requiredBits += (dataLen % 2) * 6;
        break;
      case MODE_BYTE:
        requiredBits += CHAR_COUNT_BITS.byte[vg];
        requiredBits += dataLen * 8;
        break;
    }

    if (requiredBits <= dataBits) return version;
  }

  throw new Error('Data too long for QR code');
}

function encodeData(data: string, mode: number, version: number): number[] {
  const vg = getVersionGroup(version);
  const bits: number[] = [];

  // Add mode indicator (4 bits)
  for (let i = 3; i >= 0; i--) {
    bits.push((mode >> i) & 1);
  }

  // Add character count indicator
  let charCountBits: number;
  switch (mode) {
    case MODE_NUMERIC:
      charCountBits = CHAR_COUNT_BITS.numeric[vg];
      break;
    case MODE_ALPHANUMERIC:
      charCountBits = CHAR_COUNT_BITS.alphanumeric[vg];
      break;
    default:
      charCountBits = CHAR_COUNT_BITS.byte[vg];
  }

  for (let i = charCountBits - 1; i >= 0; i--) {
    bits.push((data.length >> i) & 1);
  }

  // Encode data
  switch (mode) {
    case MODE_NUMERIC:
      for (let i = 0; i < data.length; i += 3) {
        const chunk = data.slice(i, i + 3);
        const val = parseInt(chunk, 10);
        const numBits = chunk.length === 3 ? 10 : chunk.length === 2 ? 7 : 4;
        for (let j = numBits - 1; j >= 0; j--) {
          bits.push((val >> j) & 1);
        }
      }
      break;

    case MODE_ALPHANUMERIC:
      const upper = data.toUpperCase();
      for (let i = 0; i < upper.length; i += 2) {
        if (i + 1 < upper.length) {
          const val = ALPHANUM.indexOf(upper[i]) * 45 + ALPHANUM.indexOf(upper[i + 1]);
          for (let j = 10; j >= 0; j--) {
            bits.push((val >> j) & 1);
          }
        } else {
          const val = ALPHANUM.indexOf(upper[i]);
          for (let j = 5; j >= 0; j--) {
            bits.push((val >> j) & 1);
          }
        }
      }
      break;

    case MODE_BYTE:
      for (const char of data) {
        const code = char.charCodeAt(0);
        for (let j = 7; j >= 0; j--) {
          bits.push((code >> j) & 1);
        }
      }
      break;
  }

  return bits;
}

function bitsToCodewords(bits: number[], totalCodewords: number): number[] {
  const codewords: number[] = [];

  // Add terminator (up to 4 zeros)
  const dataCodewords = totalCodewords;
  const maxBits = dataCodewords * 8;
  const terminator = Math.min(4, maxBits - bits.length);
  for (let i = 0; i < terminator; i++) {
    bits.push(0);
  }

  // Pad to byte boundary
  while (bits.length % 8 !== 0) {
    bits.push(0);
  }

  // Convert to codewords
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) {
      byte = (byte << 1) | (bits[i + j] || 0);
    }
    codewords.push(byte);
  }

  // Pad with alternating bytes
  const padBytes = [0xec, 0x11];
  let padIndex = 0;
  while (codewords.length < dataCodewords) {
    codewords.push(padBytes[padIndex]);
    padIndex = (padIndex + 1) % 2;
  }

  return codewords;
}

function generateECCodewords(data: number[], ecCount: number): number[] {
  // Generator polynomial for given EC count
  const gen: number[] = [1];
  for (let i = 0; i < ecCount; i++) {
    const newGen = new Array(gen.length + 1).fill(0);
    for (let j = 0; j < gen.length; j++) {
      newGen[j] ^= gen[j];
      newGen[j + 1] ^= gfMul(gen[j], GF256_EXP[i]);
    }
    gen.length = 0;
    gen.push(...newGen);
  }

  // Polynomial division
  const result = new Array(ecCount).fill(0);
  const msg = [...data, ...result];

  for (let i = 0; i < data.length; i++) {
    const coef = msg[i];
    if (coef !== 0) {
      for (let j = 0; j < gen.length; j++) {
        msg[i + j] ^= gfMul(gen[j], coef);
      }
    }
  }

  return msg.slice(data.length);
}

function createMatrix(version: number): number[][] {
  const size = version * 4 + 17;
  const matrix: number[][] = [];
  for (let i = 0; i < size; i++) {
    matrix.push(new Array(size).fill(-1)); // -1 = unset
  }
  return matrix;
}

function addFinderPattern(matrix: number[][], row: number, col: number): void {
  for (let r = -1; r <= 7; r++) {
    for (let c = -1; c <= 7; c++) {
      const rr = row + r;
      const cc = col + c;
      if (rr < 0 || rr >= matrix.length || cc < 0 || cc >= matrix.length) continue;

      if (r === -1 || r === 7 || c === -1 || c === 7) {
        matrix[rr][cc] = 0; // White separator
      } else if (r === 0 || r === 6 || c === 0 || c === 6) {
        matrix[rr][cc] = 1; // Black border
      } else if (r >= 2 && r <= 4 && c >= 2 && c <= 4) {
        matrix[rr][cc] = 1; // Black center
      } else {
        matrix[rr][cc] = 0; // White
      }
    }
  }
}

function addTimingPatterns(matrix: number[][]): void {
  const size = matrix.length;
  for (let i = 8; i < size - 8; i++) {
    const bit = i % 2 === 0 ? 1 : 0;
    if (matrix[6][i] === -1) matrix[6][i] = bit;
    if (matrix[i][6] === -1) matrix[i][6] = bit;
  }
}

function addAlignmentPattern(matrix: number[][], row: number, col: number): void {
  for (let r = -2; r <= 2; r++) {
    for (let c = -2; c <= 2; c++) {
      const rr = row + r;
      const cc = col + c;
      if (matrix[rr][cc] !== -1) return; // Skip if occupied by finder

      if (Math.abs(r) === 2 || Math.abs(c) === 2) {
        matrix[rr][cc] = 1;
      } else if (r === 0 && c === 0) {
        matrix[rr][cc] = 1;
      } else {
        matrix[rr][cc] = 0;
      }
    }
  }
}

function getAlignmentPositions(version: number): number[] {
  if (version === 1) return [];

  const positions: number[] = [6];
  const size = version * 4 + 17;
  const last = size - 7;

  if (version >= 2) {
    const numIntervals = Math.floor(version / 7) + 1;
    const step = Math.round((last - 6) / numIntervals);

    for (let i = 1; i <= numIntervals; i++) {
      positions.push(6 + step * i);
    }
    positions[positions.length - 1] = last;
  }

  return positions;
}

function reserveFormatInfo(matrix: number[][]): void {
  const size = matrix.length;

  // Around top-left finder
  for (let i = 0; i <= 8; i++) {
    if (matrix[8][i] === -1) matrix[8][i] = 2; // 2 = reserved
    if (matrix[i][8] === -1) matrix[i][8] = 2;
  }

  // Around bottom-left finder
  for (let i = 0; i <= 7; i++) {
    if (matrix[size - 1 - i][8] === -1) matrix[size - 1 - i][8] = 2;
  }

  // Around top-right finder
  for (let i = 0; i <= 7; i++) {
    if (matrix[8][size - 1 - i] === -1) matrix[8][size - 1 - i] = 2;
  }

  // Dark module
  matrix[size - 8][8] = 1;
}

function placeData(matrix: number[][], data: number[]): void {
  const size = matrix.length;
  let dataIndex = 0;
  let bitIndex = 7;

  // Place data in zigzag pattern
  let upward = true;

  for (let col = size - 1; col >= 0; col -= 2) {
    if (col === 6) col = 5; // Skip timing column

    const rows = upward
      ? Array.from({ length: size }, (_, i) => size - 1 - i)
      : Array.from({ length: size }, (_, i) => i);

    for (const row of rows) {
      for (let c = 0; c < 2; c++) {
        const currentCol = col - c;
        if (currentCol < 0) continue;

        if (matrix[row][currentCol] === -1) {
          const bit = dataIndex < data.length
            ? (data[dataIndex] >> bitIndex) & 1
            : 0;
          matrix[row][currentCol] = bit;

          bitIndex--;
          if (bitIndex < 0) {
            bitIndex = 7;
            dataIndex++;
          }
        }
      }
    }

    upward = !upward;
  }
}

function applyMask(matrix: number[][], maskPattern: number): number[][] {
  const size = matrix.length;
  const masked = matrix.map(row => [...row]);

  const maskFn = (row: number, col: number): boolean => {
    switch (maskPattern) {
      case 0: return (row + col) % 2 === 0;
      case 1: return row % 2 === 0;
      case 2: return col % 3 === 0;
      case 3: return (row + col) % 3 === 0;
      case 4: return (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0;
      case 5: return ((row * col) % 2) + ((row * col) % 3) === 0;
      case 6: return (((row * col) % 2) + ((row * col) % 3)) % 2 === 0;
      case 7: return (((row + col) % 2) + ((row * col) % 3)) % 2 === 0;
      default: return false;
    }
  };

  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      // Only mask data modules (not function patterns or reserved)
      if (masked[row][col] !== 2 && isDataModule(matrix, row, col)) {
        if (maskFn(row, col)) {
          masked[row][col] = masked[row][col] === 1 ? 0 : 1;
        }
      }
    }
  }

  return masked;
}

function isDataModule(matrix: number[][], row: number, col: number): boolean {
  const size = matrix.length;

  // Finder patterns and separators
  if (row < 9 && col < 9) return false;
  if (row < 9 && col >= size - 8) return false;
  if (row >= size - 8 && col < 9) return false;

  // Timing patterns
  if (row === 6 || col === 6) return false;

  return true;
}

function addFormatInfo(matrix: number[][], ecLevel: string, maskPattern: number): void {
  const ecBits: Record<string, number> = { L: 1, M: 0, Q: 3, H: 2 };
  const formatData = (ecBits[ecLevel] << 3) | maskPattern;

  // Calculate BCH error correction
  let bch = formatData << 10;
  const generator = 0b10100110111;

  for (let i = 4; i >= 0; i--) {
    if ((bch >> (i + 10)) & 1) {
      bch ^= generator << i;
    }
  }

  const formatBits = ((formatData << 10) | bch) ^ 0b101010000010010;

  const size = matrix.length;

  // Place format bits
  const positions1 = [
    [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8],
    [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]
  ];

  const positions2 = [
    [size - 1, 8], [size - 2, 8], [size - 3, 8], [size - 4, 8],
    [size - 5, 8], [size - 6, 8], [size - 7, 8],
    [8, size - 8], [8, size - 7], [8, size - 6], [8, size - 5],
    [8, size - 4], [8, size - 3], [8, size - 2], [8, size - 1]
  ];

  for (let i = 0; i < 15; i++) {
    const bit = (formatBits >> i) & 1;
    matrix[positions1[i][0]][positions1[i][1]] = bit;
    matrix[positions2[i][0]][positions2[i][1]] = bit;
  }
}

function calculatePenalty(matrix: number[][]): number {
  const size = matrix.length;
  let penalty = 0;

  // Rule 1: Adjacent modules in row/column
  for (let row = 0; row < size; row++) {
    let count = 1;
    for (let col = 1; col < size; col++) {
      if (matrix[row][col] === matrix[row][col - 1]) {
        count++;
      } else {
        if (count >= 5) penalty += count - 2;
        count = 1;
      }
    }
    if (count >= 5) penalty += count - 2;
  }

  for (let col = 0; col < size; col++) {
    let count = 1;
    for (let row = 1; row < size; row++) {
      if (matrix[row][col] === matrix[row - 1][col]) {
        count++;
      } else {
        if (count >= 5) penalty += count - 2;
        count = 1;
      }
    }
    if (count >= 5) penalty += count - 2;
  }

  // Rule 2: 2x2 blocks
  for (let row = 0; row < size - 1; row++) {
    for (let col = 0; col < size - 1; col++) {
      const sum = matrix[row][col] + matrix[row][col + 1] +
                  matrix[row + 1][col] + matrix[row + 1][col + 1];
      if (sum === 0 || sum === 4) penalty += 3;
    }
  }

  // Rule 3: Finder-like patterns
  const pattern1 = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
  const pattern2 = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];

  for (let row = 0; row < size; row++) {
    for (let col = 0; col <= size - 11; col++) {
      let match1 = true;
      let match2 = true;
      for (let i = 0; i < 11; i++) {
        if (matrix[row][col + i] !== pattern1[i]) match1 = false;
        if (matrix[row][col + i] !== pattern2[i]) match2 = false;
      }
      if (match1 || match2) penalty += 40;
    }
  }

  for (let col = 0; col < size; col++) {
    for (let row = 0; row <= size - 11; row++) {
      let match1 = true;
      let match2 = true;
      for (let i = 0; i < 11; i++) {
        if (matrix[row + i][col] !== pattern1[i]) match1 = false;
        if (matrix[row + i][col] !== pattern2[i]) match2 = false;
      }
      if (match1 || match2) penalty += 40;
    }
  }

  // Rule 4: Balance
  let dark = 0;
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (matrix[row][col] === 1) dark++;
    }
  }
  const ratio = (dark * 100) / (size * size);
  const k = Math.abs(Math.floor(ratio / 5 - 10));
  penalty += k * 10;

  return penalty;
}

function generateQRMatrix(data: string, options: QRCodeOptions = {}): number[][] {
  const ecLevel = options.errorCorrectionLevel || 'M';
  const mode = selectMode(data);
  const version = getMinVersion(data, mode, ecLevel);

  // Encode data
  const bits = encodeData(data, mode, version);
  const ecCount = EC_CODEWORDS[ecLevel][version - 1];
  const totalCodewords = TOTAL_CODEWORDS[version - 1];
  const dataCodewords = totalCodewords - ecCount;

  const codewords = bitsToCodewords(bits, dataCodewords);
  const ecCodewords = generateECCodewords(codewords, ecCount);
  const allCodewords = [...codewords, ...ecCodewords];

  // Create matrix
  const matrix = createMatrix(version);

  // Add function patterns
  addFinderPattern(matrix, 0, 0);
  addFinderPattern(matrix, 0, matrix.length - 7);
  addFinderPattern(matrix, matrix.length - 7, 0);
  addTimingPatterns(matrix);

  // Add alignment patterns
  const alignPositions = getAlignmentPositions(version);
  for (const row of alignPositions) {
    for (const col of alignPositions) {
      addAlignmentPattern(matrix, row, col);
    }
  }

  reserveFormatInfo(matrix);
  placeData(matrix, allCodewords);

  // Find best mask
  let bestMask = 0;
  let bestPenalty = Infinity;

  for (let mask = 0; mask < 8; mask++) {
    const masked = applyMask(matrix, mask);
    addFormatInfo(masked, ecLevel, mask);
    const penalty = calculatePenalty(masked);
    if (penalty < bestPenalty) {
      bestPenalty = penalty;
      bestMask = mask;
    }
  }

  // Apply best mask
  const finalMatrix = applyMask(matrix, bestMask);
  addFormatInfo(finalMatrix, ecLevel, bestMask);

  return finalMatrix;
}

// ============================================================================
// RENDERING
// ============================================================================

function matrixToSvg(matrix: number[][], options: QRCodeOptions = {}): string {
  const size = options.size || 256;
  const margin = options.margin ?? 4;
  const dark = options.color?.dark || '#000000';
  const light = options.color?.light || '#ffffff';

  const moduleCount = matrix.length;
  const moduleSize = size / (moduleCount + margin * 2);

  let paths = '';
  for (let row = 0; row < moduleCount; row++) {
    for (let col = 0; col < moduleCount; col++) {
      if (matrix[row][col] === 1) {
        const x = (col + margin) * moduleSize;
        const y = (row + margin) * moduleSize;
        paths += `M${x},${y}h${moduleSize}v${moduleSize}h-${moduleSize}Z`;
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <rect width="100%" height="100%" fill="${light}"/>
  <path d="${paths}" fill="${dark}"/>
</svg>`;
}

function matrixToDataUrl(matrix: number[][], options: QRCodeOptions = {}): string {
  // Generate SVG and convert to data URL
  const svg = matrixToSvg(matrix, options);
  const base64 = typeof Buffer !== 'undefined'
    ? Buffer.from(svg).toString('base64')
    : btoa(svg);
  return `data:image/svg+xml;base64,${base64}`;
}

// ============================================================================
// SIGNATURE FUNCTIONS
// ============================================================================

/**
 * Create a signature for the verification payload
 */
async function createSignature(
  payload: Omit<TokenVerificationPayload, 'signature'>,
  secret: string
): Promise<string> {
  const dataToSign = JSON.stringify({
    tokenId: payload.tokenId,
    assetId: payload.assetId,
    holder: payload.holder,
    verifyUrl: payload.verifyUrl,
    expiresAt: payload.expiresAt,
  });

  return hmac(secret, dataToSign, { algorithm: 'sha256' });
}

/**
 * Build the verification URL with encoded payload
 */
function buildVerificationUrl(payload: TokenVerificationPayload): string {
  const params = new URLSearchParams();
  params.set('tokenId', payload.tokenId);
  if (payload.assetId) params.set('assetId', payload.assetId);
  if (payload.holder) params.set('holder', payload.holder);
  if (payload.expiresAt) params.set('expiresAt', payload.expiresAt);
  params.set('sig', payload.signature);

  const separator = payload.verifyUrl.includes('?') ? '&' : '?';
  return `${payload.verifyUrl}${separator}${params.toString()}`;
}

// ============================================================================
// EXPORTED FUNCTIONS
// ============================================================================

/**
 * Generate a signed verification QR code for token verification
 *
 * @param payload - The verification payload (without signature)
 * @param secret - The secret key for HMAC signing
 * @param options - QR code generation options
 * @returns QR code data URL, SVG, and verification URL
 *
 * @example
 * ```typescript
 * const result = await generateVerificationQR(
 *   {
 *     tokenId: 'tok_123',
 *     assetId: 'ast_456',
 *     verifyUrl: 'https://api.example.com/verify',
 *     expiresAt: '2024-12-31T23:59:59Z'
 *   },
 *   'your-secret-key',
 *   { size: 300, errorCorrectionLevel: 'H' }
 * );
 *
 * // Use result.dataUrl in an img src
 * // Use result.svg for vector rendering
 * // result.verificationUrl is what's encoded in the QR
 * ```
 */
export async function generateVerificationQR(
  payload: Omit<TokenVerificationPayload, 'signature'>,
  secret: string,
  options?: QRCodeOptions
): Promise<QRCodeResult> {
  // Generate signature
  const signature = await createSignature(payload, secret);

  // Build full payload
  const fullPayload: TokenVerificationPayload = {
    ...payload,
    signature,
  };

  // Build verification URL
  const verificationUrl = buildVerificationUrl(fullPayload);

  // Generate QR code
  const matrix = generateQRMatrix(verificationUrl, options);

  return {
    dataUrl: matrixToDataUrl(matrix, options),
    svg: matrixToSvg(matrix, options),
    verificationUrl,
  };
}

/**
 * Generate a simple QR code for any data
 *
 * @param data - The data to encode
 * @param options - QR code generation options
 * @returns QR code data URL and SVG
 *
 * @example
 * ```typescript
 * const { dataUrl, svg } = await generateQR('https://example.com', {
 *   size: 256,
 *   color: { dark: '#1a1a1a', light: '#ffffff' }
 * });
 * ```
 */
export async function generateQR(
  data: string,
  options?: QRCodeOptions
): Promise<SimpleQRResult> {
  const matrix = generateQRMatrix(data, options);

  return {
    dataUrl: matrixToDataUrl(matrix, options),
    svg: matrixToSvg(matrix, options),
  };
}

/**
 * Verify a QR code signature
 *
 * @param payload - The full verification payload including signature
 * @param secret - The secret key used for signing
 * @returns true if the signature is valid
 *
 * @example
 * ```typescript
 * // Extract payload from scanned QR verification URL
 * const payload = parseVerificationUrl(scannedUrl);
 *
 * const isValid = await verifyQRSignature(payload, 'your-secret-key');
 * if (!isValid) {
 *   throw new Error('Invalid QR code signature');
 * }
 *
 * // Check expiration
 * if (payload.expiresAt && new Date(payload.expiresAt) < new Date()) {
 *   throw new Error('QR code has expired');
 * }
 * ```
 */
export async function verifyQRSignature(
  payload: TokenVerificationPayload,
  secret: string
): Promise<boolean> {
  const { signature, ...rest } = payload;
  const expectedSignature = await createSignature(rest, secret);

  return timingSafeEqual(signature, expectedSignature);
}

/**
 * Parse a verification URL into a TokenVerificationPayload
 *
 * @param url - The verification URL from the QR code
 * @returns The parsed payload
 *
 * @example
 * ```typescript
 * const url = 'https://api.example.com/verify?tokenId=tok_123&sig=abc123';
 * const payload = parseVerificationUrl(url);
 * ```
 */
export function parseVerificationUrl(url: string): TokenVerificationPayload {
  const parsedUrl = new URL(url);
  const params = parsedUrl.searchParams;

  const tokenId = params.get('tokenId');
  const signature = params.get('sig');

  if (!tokenId || !signature) {
    throw new Error('Invalid verification URL: missing required parameters');
  }

  // Reconstruct the verify URL without query params
  const verifyUrl = `${parsedUrl.origin}${parsedUrl.pathname}`;

  return {
    tokenId,
    assetId: params.get('assetId') || undefined,
    holder: params.get('holder') || undefined,
    verifyUrl,
    expiresAt: params.get('expiresAt') || undefined,
    signature,
  };
}
