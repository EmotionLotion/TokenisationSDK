/**
 * Apple Wallet Provider
 *
 * Generates Apple Wallet passes (.pkpass files) from pass data.
 * Handles certificate signing, manifest generation, and ZIP packaging.
 */

import {
  WalletPassData,
  AppleWalletConfig,
  ApplePassResult,
  WalletPassProvider,
  WalletPassError,
  PassField,
  PassBarcode,
} from './types.js';
import { hash } from '../../utils/crypto.js';

// ============================================================================
// TYPES
// ============================================================================

interface PassJson {
  formatVersion: number;
  passTypeIdentifier: string;
  teamIdentifier: string;
  organizationName: string;
  description: string;
  serialNumber: string;
  backgroundColor?: string;
  foregroundColor?: string;
  labelColor?: string;
  logoText?: string;
  relevantDate?: string;
  expirationDate?: string;
  voided?: boolean;
  sharingProhibited?: boolean;
  webServiceURL?: string;
  authenticationToken?: string;
  locations?: Array<{
    latitude: number;
    longitude: number;
    altitude?: number;
    relevantText?: string;
  }>;
  maxDistance?: number;
  beacons?: Array<{
    proximityUUID: string;
    major?: number;
    minor?: number;
    relevantText?: string;
  }>;
  barcode?: {
    message: string;
    format: string;
    messageEncoding: string;
    altText?: string;
  };
  barcodes?: Array<{
    message: string;
    format: string;
    messageEncoding: string;
    altText?: string;
  }>;
  nfc?: {
    message: string;
    encryptionPublicKey?: string;
  };
  associatedStoreIdentifiers?: number[];
  appLaunchURL?: string;
  userInfo?: Record<string, unknown>;
  [key: string]: unknown;
}

interface ManifestJson {
  [filename: string]: string;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Convert hex color to Apple's rgb() format
 */
function hexToRgb(hex: string): string {
  const match = hex.replace('#', '').match(/.{2}/g);
  if (!match || match.length < 3) return hex;

  const [r, g, b] = match.map(h => parseInt(h, 16));
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Convert barcode format to Apple's format string
 */
function toBarcodeFormat(format: string): string {
  const formats: Record<string, string> = {
    QR: 'PKBarcodeFormatQR',
    PDF417: 'PKBarcodeFormatPDF417',
    AZTEC: 'PKBarcodeFormatAztec',
    CODE128: 'PKBarcodeFormatCode128',
  };
  return formats[format] || 'PKBarcodeFormatQR';
}

/**
 * Convert pass type to Apple's style key
 */
function getPassStyleKey(type: string): string {
  const styles: Record<string, string> = {
    boardingPass: 'boardingPass',
    eventTicket: 'eventTicket',
    coupon: 'coupon',
    generic: 'generic',
    storeCard: 'storeCard',
  };
  return styles[type] || 'generic';
}

/**
 * Convert pass fields to Apple format
 */
function convertFields(fields?: PassField[]): Array<{
  key: string;
  label: string;
  value: string | number;
  textAlignment?: string;
  dateStyle?: string;
  timeStyle?: string;
  changeMessage?: string;
}> | undefined {
  if (!fields || fields.length === 0) return undefined;

  return fields.map(field => {
    const converted: {
      key: string;
      label: string;
      value: string | number;
      textAlignment?: string;
      dateStyle?: string;
      timeStyle?: string;
      changeMessage?: string;
    } = {
      key: field.key,
      label: field.label,
      value: field.value,
    };

    if (field.textAlignment) {
      const alignments: Record<string, string> = {
        left: 'PKTextAlignmentLeft',
        center: 'PKTextAlignmentCenter',
        right: 'PKTextAlignmentRight',
        natural: 'PKTextAlignmentNatural',
      };
      converted.textAlignment = alignments[field.textAlignment];
    }

    if (field.dateStyle) {
      const styles: Record<string, string> = {
        short: 'PKDateStyleShort',
        medium: 'PKDateStyleMedium',
        long: 'PKDateStyleLong',
        full: 'PKDateStyleFull',
      };
      converted.dateStyle = styles[field.dateStyle];
    }

    if (field.timeStyle) {
      const styles: Record<string, string> = {
        short: 'PKDateStyleShort',
        medium: 'PKDateStyleMedium',
        long: 'PKDateStyleLong',
        full: 'PKDateStyleFull',
      };
      converted.timeStyle = styles[field.timeStyle];
    }

    if (field.changeMessage) {
      converted.changeMessage = field.changeMessage;
    }

    return converted;
  });
}

/**
 * Convert barcode to Apple format
 */
function convertBarcode(barcode?: PassBarcode): PassJson['barcode'] | undefined {
  if (!barcode) return undefined;

  return {
    message: barcode.message,
    format: toBarcodeFormat(barcode.format),
    messageEncoding: barcode.messageEncoding || 'iso-8859-1',
    altText: barcode.altText,
  };
}

/**
 * Simple ZIP file creation (without external dependencies)
 */
class SimpleZip {
  private files: Array<{ name: string; data: Buffer; isCompressed: boolean }> = [];

  addFile(name: string, data: Buffer | string): void {
    const buffer = typeof data === 'string' ? Buffer.from(data, 'utf-8') : data;
    this.files.push({ name, data: buffer, isCompressed: false });
  }

  toBuffer(): Buffer {
    const centralDirectory: Buffer[] = [];
    const localFiles: Buffer[] = [];
    let localOffset = 0;

    for (const file of this.files) {
      // Local file header
      const nameBuffer = Buffer.from(file.name, 'utf-8');
      const localHeader = Buffer.alloc(30 + nameBuffer.length);

      localHeader.writeUInt32LE(0x04034b50, 0); // Local file header signature
      localHeader.writeUInt16LE(20, 4); // Version needed to extract
      localHeader.writeUInt16LE(0, 6); // General purpose bit flag
      localHeader.writeUInt16LE(0, 8); // Compression method (stored)
      localHeader.writeUInt16LE(0, 10); // File last modification time
      localHeader.writeUInt16LE(0, 12); // File last modification date
      localHeader.writeUInt32LE(this.crc32(file.data), 14); // CRC-32
      localHeader.writeUInt32LE(file.data.length, 18); // Compressed size
      localHeader.writeUInt32LE(file.data.length, 22); // Uncompressed size
      localHeader.writeUInt16LE(nameBuffer.length, 26); // File name length
      localHeader.writeUInt16LE(0, 28); // Extra field length
      nameBuffer.copy(localHeader, 30);

      localFiles.push(localHeader, file.data);

      // Central directory file header
      const cdHeader = Buffer.alloc(46 + nameBuffer.length);

      cdHeader.writeUInt32LE(0x02014b50, 0); // Central directory file header signature
      cdHeader.writeUInt16LE(20, 4); // Version made by
      cdHeader.writeUInt16LE(20, 6); // Version needed to extract
      cdHeader.writeUInt16LE(0, 8); // General purpose bit flag
      cdHeader.writeUInt16LE(0, 10); // Compression method (stored)
      cdHeader.writeUInt16LE(0, 12); // File last modification time
      cdHeader.writeUInt16LE(0, 14); // File last modification date
      cdHeader.writeUInt32LE(this.crc32(file.data), 16); // CRC-32
      cdHeader.writeUInt32LE(file.data.length, 20); // Compressed size
      cdHeader.writeUInt32LE(file.data.length, 24); // Uncompressed size
      cdHeader.writeUInt16LE(nameBuffer.length, 28); // File name length
      cdHeader.writeUInt16LE(0, 30); // Extra field length
      cdHeader.writeUInt16LE(0, 32); // File comment length
      cdHeader.writeUInt16LE(0, 34); // Disk number start
      cdHeader.writeUInt16LE(0, 36); // Internal file attributes
      cdHeader.writeUInt32LE(0, 38); // External file attributes
      cdHeader.writeUInt32LE(localOffset, 42); // Relative offset of local header
      nameBuffer.copy(cdHeader, 46);

      centralDirectory.push(cdHeader);
      localOffset += localHeader.length + file.data.length;
    }

    const cdBuffer = Buffer.concat(centralDirectory);

    // End of central directory record
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0); // EOCD signature
    eocd.writeUInt16LE(0, 4); // Number of this disk
    eocd.writeUInt16LE(0, 6); // Disk where central directory starts
    eocd.writeUInt16LE(this.files.length, 8); // Number of central directory records on this disk
    eocd.writeUInt16LE(this.files.length, 10); // Total number of central directory records
    eocd.writeUInt32LE(cdBuffer.length, 12); // Size of central directory
    eocd.writeUInt32LE(localOffset, 16); // Offset of start of central directory
    eocd.writeUInt16LE(0, 20); // Comment length

    return Buffer.concat([...localFiles, cdBuffer, eocd]);
  }

  private crc32(data: Buffer): number {
    let crc = 0xffffffff;
    const table = this.getCrc32Table();

    for (let i = 0; i < data.length; i++) {
      crc = (crc >>> 8) ^ table[(crc ^ data[i]) & 0xff];
    }

    return (crc ^ 0xffffffff) >>> 0;
  }

  private getCrc32Table(): Uint32Array {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      table[i] = c;
    }
    return table;
  }
}

// ============================================================================
// APPLE WALLET PROVIDER
// ============================================================================

/**
 * Apple Wallet pass provider
 *
 * @example
 * ```typescript
 * const provider = new AppleWalletProvider({
 *   passTypeIdentifier: 'pass.com.example.ticket',
 *   teamIdentifier: 'ABCDE12345',
 *   signingCertificate: fs.readFileSync('certificate.p12'),
 *   certificatePassword: 'password123',
 * });
 *
 * const result = await provider.generatePass({
 *   type: 'eventTicket',
 *   organizationName: 'Example Inc',
 *   description: 'Concert Ticket',
 *   serialNumber: 'ticket-001',
 *   primaryFields: [
 *     { key: 'event', label: 'EVENT', value: 'Summer Concert 2024' }
 *   ],
 *   barcode: {
 *     message: 'ticket-001',
 *     format: 'QR',
 *   },
 * });
 *
 * // result.passBuffer contains the .pkpass file
 * // result.contentType is 'application/vnd.apple.pkpass'
 * ```
 */
export class AppleWalletProvider implements WalletPassProvider<AppleWalletConfig, ApplePassResult> {
  readonly name = 'apple';

  private config: AppleWalletConfig;

  constructor(config: AppleWalletConfig) {
    this.config = config;
  }

  /**
   * Generate an Apple Wallet pass
   */
  async generatePass(data: WalletPassData): Promise<ApplePassResult> {
    try {
      // Build pass.json
      const passJson = this.buildPassJson(data);
      const passJsonString = JSON.stringify(passJson, null, 2);

      // Create manifest
      const manifest: ManifestJson = {};

      // Create ZIP
      const zip = new SimpleZip();

      // Add pass.json
      const passJsonBuffer = Buffer.from(passJsonString, 'utf-8');
      manifest['pass.json'] = await hash(passJsonBuffer, { algorithm: 'sha1' });
      zip.addFile('pass.json', passJsonBuffer);

      // Add images if provided (as placeholder - actual implementation would fetch/process images)
      const imageFiles = await this.processImages(data);
      for (const [filename, buffer] of Object.entries(imageFiles)) {
        manifest[filename] = await hash(buffer, { algorithm: 'sha1' });
        zip.addFile(filename, buffer);
      }

      // Create and add manifest.json
      const manifestString = JSON.stringify(manifest, null, 2);
      zip.addFile('manifest.json', manifestString);

      // Create and add signature
      const signature = await this.signManifest(manifestString);
      zip.addFile('signature', signature);

      // Generate the .pkpass file
      const passBuffer = zip.toBuffer();

      return {
        passBuffer,
        contentType: 'application/vnd.apple.pkpass',
        filename: `${data.serialNumber}.pkpass`,
      };
    } catch (error) {
      throw new WalletPassError(
        `Failed to generate Apple Wallet pass: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'apple',
        'GENERATION_FAILED',
        error
      );
    }
  }

  /**
   * Build the pass.json structure
   */
  private buildPassJson(data: WalletPassData): PassJson {
    const styleKey = getPassStyleKey(data.type);

    const passJson: PassJson = {
      formatVersion: 1,
      passTypeIdentifier: this.config.passTypeIdentifier,
      teamIdentifier: this.config.teamIdentifier,
      organizationName: data.organizationName,
      description: data.description,
      serialNumber: data.serialNumber,
    };

    // Colors
    if (data.backgroundColor) {
      passJson.backgroundColor = hexToRgb(data.backgroundColor);
    }
    if (data.foregroundColor) {
      passJson.foregroundColor = hexToRgb(data.foregroundColor);
    }
    if (data.labelColor) {
      passJson.labelColor = hexToRgb(data.labelColor);
    }

    // Logo text
    if (data.logoText) {
      passJson.logoText = data.logoText;
    }

    // Dates
    if (data.relevantDate) {
      passJson.relevantDate = data.relevantDate;
    }
    if (data.expirationDate) {
      passJson.expirationDate = data.expirationDate;
    }
    if (data.voided !== undefined) {
      passJson.voided = data.voided;
    }

    // Sharing
    if (data.sharingProhibited !== undefined) {
      passJson.sharingProhibited = data.sharingProhibited;
    }

    // Web service
    if (data.webServiceURL) {
      passJson.webServiceURL = data.webServiceURL;
      passJson.authenticationToken = data.authenticationToken;
    }

    // Locations
    if (data.locations && data.locations.length > 0) {
      passJson.locations = data.locations.map(loc => ({
        latitude: loc.latitude,
        longitude: loc.longitude,
        altitude: loc.altitude,
        relevantText: loc.relevantText,
      }));
    }
    if (data.maxDistance) {
      passJson.maxDistance = data.maxDistance;
    }

    // Beacons
    if (data.beacons && data.beacons.length > 0) {
      passJson.beacons = data.beacons.map(beacon => ({
        proximityUUID: beacon.proximityUUID,
        major: beacon.major,
        minor: beacon.minor,
        relevantText: beacon.relevantText,
      }));
    }

    // Barcodes
    if (data.barcodes && data.barcodes.length > 0) {
      passJson.barcodes = data.barcodes.map(b => ({
        message: b.message,
        format: toBarcodeFormat(b.format),
        messageEncoding: b.messageEncoding || 'iso-8859-1',
        altText: b.altText,
      }));
      // Also set legacy barcode for older iOS versions
      passJson.barcode = convertBarcode(data.barcodes[0]);
    } else if (data.barcode) {
      passJson.barcode = convertBarcode(data.barcode);
      passJson.barcodes = [convertBarcode(data.barcode)!];
    }

    // NFC
    if (data.nfc) {
      passJson.nfc = {
        message: data.nfc.message,
        encryptionPublicKey: data.nfc.encryptionPublicKey,
      };
    }

    // Associated apps
    if (data.associatedStoreIdentifiers) {
      passJson.associatedStoreIdentifiers = data.associatedStoreIdentifiers;
    }
    if (data.appLaunchURL) {
      passJson.appLaunchURL = data.appLaunchURL;
    }

    // User info
    if (data.userInfo) {
      passJson.userInfo = data.userInfo;
    }

    // Pass style specific content
    const styleContent: Record<string, unknown> = {};

    if (data.transitType && data.type === 'boardingPass') {
      const transitTypes: Record<string, string> = {
        air: 'PKTransitTypeAir',
        boat: 'PKTransitTypeBoat',
        bus: 'PKTransitTypeBus',
        train: 'PKTransitTypeTrain',
        generic: 'PKTransitTypeGeneric',
      };
      styleContent.transitType = transitTypes[data.transitType] || 'PKTransitTypeGeneric';
    }

    // Fields
    const primaryFields = convertFields(data.primaryFields);
    const secondaryFields = convertFields(data.secondaryFields);
    const auxiliaryFields = convertFields(data.auxiliaryFields);
    const backFields = convertFields(data.backFields);
    const headerFields = convertFields(data.headerFields);

    if (primaryFields) styleContent.primaryFields = primaryFields;
    if (secondaryFields) styleContent.secondaryFields = secondaryFields;
    if (auxiliaryFields) styleContent.auxiliaryFields = auxiliaryFields;
    if (backFields) styleContent.backFields = backFields;
    if (headerFields) styleContent.headerFields = headerFields;

    passJson[styleKey] = styleContent;

    return passJson;
  }

  /**
   * Process and prepare images for the pass
   */
  private async processImages(data: WalletPassData): Promise<Record<string, Buffer>> {
    const images: Record<string, Buffer> = {};

    // In a real implementation, you would:
    // 1. Fetch images from URLs
    // 2. Resize them to required dimensions
    // 3. Create @2x and @3x versions

    // For now, we create placeholder images if URLs are provided
    // The actual implementation would use image processing libraries

    if (data.logoUrl) {
      images['logo.png'] = await this.getImageBuffer(data.logoUrl, 'logo');
      images['logo@2x.png'] = await this.getImageBuffer(data.logoUrl, 'logo@2x');
    }

    if (data.iconUrl) {
      images['icon.png'] = await this.getImageBuffer(data.iconUrl, 'icon');
      images['icon@2x.png'] = await this.getImageBuffer(data.iconUrl, 'icon@2x');
    }

    if (data.stripUrl) {
      images['strip.png'] = await this.getImageBuffer(data.stripUrl, 'strip');
      images['strip@2x.png'] = await this.getImageBuffer(data.stripUrl, 'strip@2x');
    }

    if (data.backgroundUrl) {
      images['background.png'] = await this.getImageBuffer(data.backgroundUrl, 'background');
      images['background@2x.png'] = await this.getImageBuffer(data.backgroundUrl, 'background@2x');
    }

    if (data.thumbnailUrl) {
      images['thumbnail.png'] = await this.getImageBuffer(data.thumbnailUrl, 'thumbnail');
      images['thumbnail@2x.png'] = await this.getImageBuffer(data.thumbnailUrl, 'thumbnail@2x');
    }

    if (data.footerUrl) {
      images['footer.png'] = await this.getImageBuffer(data.footerUrl, 'footer');
      images['footer@2x.png'] = await this.getImageBuffer(data.footerUrl, 'footer@2x');
    }

    return images;
  }

  /**
   * Get image buffer from URL or base64 data
   */
  private async getImageBuffer(urlOrData: string, _type: string): Promise<Buffer> {
    // If it's base64 data
    if (urlOrData.startsWith('data:image/')) {
      const base64Data = urlOrData.split(',')[1];
      return Buffer.from(base64Data, 'base64');
    }

    // If it's a URL, fetch it
    if (urlOrData.startsWith('http://') || urlOrData.startsWith('https://')) {
      try {
        const response = await fetch(urlOrData);
        if (!response.ok) {
          throw new Error(`Failed to fetch image: ${response.status}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
      } catch {
        // Return a minimal valid PNG as placeholder
        return this.createPlaceholderPng();
      }
    }

    // Assume it's already a buffer or path
    return Buffer.from(urlOrData);
  }

  /**
   * Create a minimal valid PNG placeholder
   */
  private createPlaceholderPng(): Buffer {
    // Minimal 1x1 transparent PNG
    return Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
      0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, // IDAT chunk
      0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
      0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, // IEND chunk
      0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
      0x42, 0x60, 0x82,
    ]);
  }

  /**
   * Sign the manifest using the certificate
   *
   * Note: This is a placeholder implementation. In production, you would use
   * node-forge, pkcs7, or native crypto to create a proper PKCS#7 signature.
   */
  private async signManifest(manifestJson: string): Promise<Buffer> {
    // In a real implementation, this would:
    // 1. Parse the P12/PEM certificate
    // 2. Create a PKCS#7 detached signature of the manifest
    // 3. Include the certificate chain (signing cert + WWDR)

    // For now, we create a placeholder that indicates signing is required
    // Production code should use a library like 'node-forge' or 'pkcs7'

    const crypto = await import('crypto');

    // If certificate is a string (PEM), convert to Buffer
    const certBuffer = typeof this.config.signingCertificate === 'string'
      ? Buffer.from(this.config.signingCertificate)
      : this.config.signingCertificate;

    // Create a simple HMAC signature as placeholder
    // IMPORTANT: This is NOT a valid Apple signature!
    // Replace with proper PKCS#7 signing in production
    const hmac = crypto.createHmac('sha256', certBuffer);
    hmac.update(manifestJson);

    // Return a buffer that indicates this needs proper signing
    const signatureMarker = Buffer.from('REQUIRES_PKCS7_SIGNING:');
    const hmacDigest = hmac.digest();

    return Buffer.concat([signatureMarker, hmacDigest]);
  }
}

export default AppleWalletProvider;
