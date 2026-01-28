/**
 * Wallet Pass Types
 *
 * Common types for Apple Wallet and Google Pay pass generation.
 */

// ============================================================================
// PASS DATA TYPES
// ============================================================================

/**
 * The type of pass to generate
 */
export type PassType = 'boardingPass' | 'eventTicket' | 'coupon' | 'generic' | 'storeCard';

/**
 * Transit type for boarding passes
 */
export type TransitType = 'air' | 'boat' | 'bus' | 'train' | 'generic';

/**
 * Barcode format options
 */
export type BarcodeFormat = 'QR' | 'PDF417' | 'AZTEC' | 'CODE128';

/**
 * A single field to display on the pass
 */
export interface PassField {
  /** Unique key for the field */
  key: string;
  /** Label displayed above the value */
  label: string;
  /** The value to display */
  value: string | number;
  /** Text alignment (optional) */
  textAlignment?: 'left' | 'center' | 'right' | 'natural';
  /** Date/time style for date values (optional) */
  dateStyle?: 'short' | 'medium' | 'long' | 'full';
  /** Time style for date values (optional) */
  timeStyle?: 'short' | 'medium' | 'long' | 'full';
  /** Change message for push notifications (optional) */
  changeMessage?: string;
}

/**
 * Barcode configuration for the pass
 */
export interface PassBarcode {
  /** The message to encode in the barcode */
  message: string;
  /** Barcode format */
  format: BarcodeFormat;
  /** Message encoding (default: iso-8859-1) */
  messageEncoding?: string;
  /** Alt text displayed below barcode (optional) */
  altText?: string;
}

/**
 * Location for relevance/notifications
 */
export interface PassLocation {
  /** Latitude in degrees */
  latitude: number;
  /** Longitude in degrees */
  longitude: number;
  /** Altitude in meters (optional) */
  altitude?: number;
  /** Relevance text (optional) */
  relevantText?: string;
}

/**
 * Beacon for relevance (iBeacon)
 */
export interface PassBeacon {
  /** Proximity UUID */
  proximityUUID: string;
  /** Major value (optional) */
  major?: number;
  /** Minor value (optional) */
  minor?: number;
  /** Relevance text (optional) */
  relevantText?: string;
}

/**
 * NFC configuration for the pass
 */
export interface PassNFC {
  /** NFC message */
  message: string;
  /** Encryption public key (optional) */
  encryptionPublicKey?: string;
}

/**
 * Complete wallet pass data structure
 */
export interface WalletPassData {
  /** Type of pass */
  type: PassType;
  /** Organization/issuer name */
  organizationName: string;
  /** Pass description */
  description: string;
  /** Unique serial number for the pass */
  serialNumber: string;

  // Visual styling
  /** Background color (hex, e.g., '#007AFF') */
  backgroundColor?: string;
  /** Foreground/text color (hex) */
  foregroundColor?: string;
  /** Label color (hex) */
  labelColor?: string;
  /** Logo image URL or base64 data */
  logoUrl?: string;
  /** Logo text (displayed next to logo) */
  logoText?: string;
  /** Icon image URL or base64 data */
  iconUrl?: string;
  /** Strip image URL for event tickets */
  stripUrl?: string;
  /** Background image URL */
  backgroundUrl?: string;
  /** Thumbnail image URL */
  thumbnailUrl?: string;
  /** Footer image URL */
  footerUrl?: string;

  // Barcode
  /** Barcode configuration */
  barcode?: PassBarcode;
  /** Multiple barcodes (for different platforms) */
  barcodes?: PassBarcode[];

  // Fields (content displayed on the pass)
  /** Primary fields (large, prominent) */
  primaryFields: PassField[];
  /** Secondary fields (below primary) */
  secondaryFields?: PassField[];
  /** Auxiliary fields (additional info) */
  auxiliaryFields?: PassField[];
  /** Back fields (shown when pass is flipped) */
  backFields?: PassField[];
  /** Header fields (top of pass) */
  headerFields?: PassField[];

  // Holder
  /** Pass holder name (used for ticket/loyalty objects) */
  holder?: string;

  // Transit specific (for boarding passes)
  /** Transit type for boarding passes */
  transitType?: TransitType;

  // Time relevance
  /** When the pass becomes relevant (ISO date) */
  relevantDate?: string;
  /** When the pass expires (ISO date) */
  expirationDate?: string;
  /** Voided state */
  voided?: boolean;

  // Location relevance
  /** Locations where pass is relevant */
  locations?: PassLocation[];
  /** Maximum distance for location relevance (meters) */
  maxDistance?: number;
  /** iBeacons for relevance */
  beacons?: PassBeacon[];

  // NFC
  /** NFC configuration */
  nfc?: PassNFC;

  // Additional data
  /** Associated app store identifiers */
  associatedStoreIdentifiers?: number[];
  /** App launch URL */
  appLaunchURL?: string;
  /** User info dictionary (custom data) */
  userInfo?: Record<string, unknown>;
  /** Web service URL for updates */
  webServiceURL?: string;
  /** Authentication token for web service */
  authenticationToken?: string;

  // Sharing
  /** Whether sharing is prohibited */
  sharingProhibited?: boolean;
}

// ============================================================================
// PROVIDER CONFIGURATION TYPES
// ============================================================================

/**
 * Apple Wallet provider configuration
 */
export interface AppleWalletConfig {
  /** Pass type identifier (e.g., pass.com.example.ticket) */
  passTypeIdentifier: string;
  /** Apple Developer Team Identifier */
  teamIdentifier: string;
  /** P12/PEM certificate for signing passes */
  signingCertificate: Buffer | string;
  /** Certificate password */
  certificatePassword: string;
  /** Apple WWDR intermediate certificate (optional, uses built-in) */
  wwdrCertificate?: Buffer | string;
}

/**
 * Google Pay provider configuration
 */
export interface GooglePayConfig {
  /** Google Pay issuer ID */
  issuerId: string;
  /** Service account key (JSON object or path) */
  serviceAccountKey: Record<string, unknown> | string;
  /** Application name (optional) */
  applicationName?: string;
}

// ============================================================================
// RESULT TYPES
// ============================================================================

/**
 * Result from Apple Wallet pass generation
 */
export interface ApplePassResult {
  /** The .pkpass file as a Buffer */
  passBuffer: Buffer;
  /** Content type for HTTP response */
  contentType: 'application/vnd.apple.pkpass';
  /** Suggested filename */
  filename: string;
}

/**
 * Result from Google Pay pass generation
 */
export interface GooglePassResult {
  /** JWT token for the pass */
  jwt: string;
  /** Save-to-Google-Pay URL */
  saveUrl: string;
  /** Pass class ID */
  classId: string;
  /** Pass object ID */
  objectId: string;
}

// ============================================================================
// COMMON INTERFACES
// ============================================================================

/**
 * Common interface for wallet pass providers
 */
export interface WalletPassProvider<TConfig, TResult> {
  /** Provider name */
  readonly name: string;
  /** Generate a pass from the given data */
  generatePass(data: WalletPassData): Promise<TResult>;
  /** Get a URL to add the pass to the wallet */
  getAddUrl?(data: WalletPassData): Promise<string>;
}

/**
 * Error thrown by wallet pass providers
 */
export class WalletPassError extends Error {
  constructor(
    message: string,
    public readonly provider: 'apple' | 'google',
    public readonly code?: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'WalletPassError';
  }
}
