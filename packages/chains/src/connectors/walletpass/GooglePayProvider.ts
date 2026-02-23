/**
 * Google Pay Provider
 *
 * Generates Google Pay passes (Save to Google Pay) using the Google Wallet API.
 * Creates JWT tokens and save URLs for passes.
 */

import {
  WalletPassData,
  GooglePayConfig,
  GooglePassResult,
  WalletPassProvider,
  WalletPassError,
  PassField,
} from './types.js';
import { randomUUID } from '@tokenisation/core';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Google Wallet pass class types
 */
type GooglePassClass =
  | 'EventTicketClass'
  | 'FlightClass'
  | 'GiftCardClass'
  | 'LoyaltyClass'
  | 'OfferClass'
  | 'TransitClass'
  | 'GenericClass';

/**
 * Google Wallet pass object types
 */
type GooglePassObject =
  | 'EventTicketObject'
  | 'FlightObject'
  | 'GiftCardObject'
  | 'LoyaltyObject'
  | 'OfferObject'
  | 'TransitObject'
  | 'GenericObject';

interface GooglePassClassData {
  id: string;
  issuerName: string;
  reviewStatus: string;
  [key: string]: unknown;
}

interface GooglePassObjectData {
  id: string;
  classId: string;
  state: string;
  [key: string]: unknown;
}

interface JwtPayload {
  iss: string;
  aud: string;
  typ: string;
  iat: number;
  payload: {
    eventTicketClasses?: GooglePassClassData[];
    eventTicketObjects?: GooglePassObjectData[];
    flightClasses?: GooglePassClassData[];
    flightObjects?: GooglePassObjectData[];
    giftCardClasses?: GooglePassClassData[];
    giftCardObjects?: GooglePassObjectData[];
    loyaltyClasses?: GooglePassClassData[];
    loyaltyObjects?: GooglePassObjectData[];
    offerClasses?: GooglePassClassData[];
    offerObjects?: GooglePassObjectData[];
    transitClasses?: GooglePassClassData[];
    transitObjects?: GooglePassObjectData[];
    genericClasses?: GooglePassClassData[];
    genericObjects?: GooglePassObjectData[];
  };
  origins?: string[];
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Map pass type to Google Wallet class/object types
 */
function getGooglePassTypes(type: string): { classType: GooglePassClass; objectType: GooglePassObject } {
  const mapping: Record<string, { classType: GooglePassClass; objectType: GooglePassObject }> = {
    eventTicket: { classType: 'EventTicketClass', objectType: 'EventTicketObject' },
    boardingPass: { classType: 'FlightClass', objectType: 'FlightObject' },
    coupon: { classType: 'OfferClass', objectType: 'OfferObject' },
    storeCard: { classType: 'LoyaltyClass', objectType: 'LoyaltyObject' },
    generic: { classType: 'GenericClass', objectType: 'GenericObject' },
  };

  return mapping[type] || { classType: 'GenericClass', objectType: 'GenericObject' };
}

/**
 * Convert hex color to Google's format (keep as hex)
 */
function toGoogleColor(hex?: string): string | undefined {
  if (!hex) return undefined;
  // Ensure it starts with #
  return hex.startsWith('#') ? hex : `#${hex}`;
}

/**
 * Create localized string for Google Wallet
 */
function localizedString(value: string, language = 'en'): {
  kind: string;
  translatedValues: Array<{ language: string; value: string }>;
  defaultValue: { language: string; value: string };
} {
  return {
    kind: 'walletobjects#translatedString',
    translatedValues: [{ language, value }],
    defaultValue: { language, value },
  };
}

/**
 * Convert pass fields to Google text module format
 */
function fieldsToTextModules(fields?: PassField[]): Array<{
  id: string;
  header: string;
  body: string;
}> | undefined {
  if (!fields || fields.length === 0) return undefined;

  return fields.map((field, index) => ({
    id: field.key || `field_${index}`,
    header: field.label,
    body: String(field.value),
  }));
}

/**
 * Convert pass fields to Google label-value rows
 */
function fieldsToLabelValueRows(fields?: PassField[]): Array<{
  columns: Array<{
    label: string;
    value: string;
  }>;
}> | undefined {
  if (!fields || fields.length === 0) return undefined;

  // Group fields into rows of 2
  const rows: Array<{ columns: Array<{ label: string; value: string }> }> = [];
  for (let i = 0; i < fields.length; i += 2) {
    const columns: Array<{ label: string; value: string }> = [];
    columns.push({
      label: fields[i].label,
      value: String(fields[i].value),
    });
    if (i + 1 < fields.length) {
      columns.push({
        label: fields[i + 1].label,
        value: String(fields[i + 1].value),
      });
    }
    rows.push({ columns });
  }

  return rows;
}

/**
 * Create barcode for Google Wallet
 */
function createBarcode(data: WalletPassData): {
  type: string;
  value: string;
  alternateText?: string;
} | undefined {
  const barcode = data.barcode || data.barcodes?.[0];
  if (!barcode) return undefined;

  const formatMapping: Record<string, string> = {
    QR: 'QR_CODE',
    PDF417: 'PDF_417',
    AZTEC: 'AZTEC',
    CODE128: 'CODE_128',
  };

  return {
    type: formatMapping[barcode.format] || 'QR_CODE',
    value: barcode.message,
    alternateText: barcode.altText,
  };
}

/**
 * Create image URI object for Google Wallet
 */
function createImageUri(url?: string): {
  uri: string;
  description?: string;
} | undefined {
  if (!url) return undefined;

  return {
    uri: url,
    description: 'Image',
  };
}

/**
 * Base64URL encode
 */
function base64UrlEncode(data: string | Buffer): string {
  const base64 = typeof data === 'string'
    ? Buffer.from(data).toString('base64')
    : data.toString('base64');

  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Create JWT token (simplified - in production use proper JWT library)
 */
async function createJwt(
  payload: JwtPayload,
  privateKey: string,
  clientEmail: string
): Promise<string> {
  const header = {
    alg: 'RS256',
    typ: 'JWT',
  };

  const headerEncoded = base64UrlEncode(JSON.stringify(header));
  const payloadEncoded = base64UrlEncode(JSON.stringify(payload));

  const signatureInput = `${headerEncoded}.${payloadEncoded}`;

  // Sign with RSA-SHA256
  const crypto = await import('crypto');
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(signatureInput);
  const signature = sign.sign(privateKey);
  const signatureEncoded = base64UrlEncode(signature);

  return `${headerEncoded}.${payloadEncoded}.${signatureEncoded}`;
}

// ============================================================================
// GOOGLE PAY PROVIDER
// ============================================================================

/**
 * Google Pay pass provider
 *
 * @example
 * ```typescript
 * const provider = new GooglePayProvider({
 *   issuerId: '1234567890',
 *   serviceAccountKey: require('./service-account.json'),
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
 * // result.jwt contains the signed JWT
 * // result.saveUrl is the Google Pay save URL
 * ```
 */
export class GooglePayProvider implements WalletPassProvider<GooglePayConfig, GooglePassResult> {
  readonly name = 'google';

  private config: GooglePayConfig;
  private serviceAccountKey: {
    client_email: string;
    private_key: string;
    [key: string]: unknown;
  };

  constructor(config: GooglePayConfig) {
    this.config = config;

    // Parse service account key if it's a string (path or JSON string)
    if (typeof config.serviceAccountKey === 'string') {
      try {
        this.serviceAccountKey = JSON.parse(config.serviceAccountKey);
      } catch {
        throw new WalletPassError(
          'Invalid service account key format',
          'google',
          'INVALID_CONFIG'
        );
      }
    } else {
      this.serviceAccountKey = config.serviceAccountKey as {
        client_email: string;
        private_key: string;
      };
    }

    if (!this.serviceAccountKey.client_email || !this.serviceAccountKey.private_key) {
      throw new WalletPassError(
        'Service account key must contain client_email and private_key',
        'google',
        'INVALID_CONFIG'
      );
    }
  }

  /**
   * Generate a Google Pay pass
   */
  async generatePass(data: WalletPassData): Promise<GooglePassResult> {
    try {
      const { classType, objectType } = getGooglePassTypes(data.type);

      // Generate unique IDs
      const classId = `${this.config.issuerId}.${data.type}_${await this.generateShortId()}`;
      const objectId = `${this.config.issuerId}.${data.serialNumber}`;

      // Build class and object data
      const classData = this.buildClassData(classId, data, classType);
      const objectData = this.buildObjectData(objectId, classId, data, objectType);

      // Create JWT payload
      const jwtPayload = this.buildJwtPayload(classData, objectData, classType, objectType);

      // Sign JWT
      const jwt = await createJwt(
        jwtPayload,
        this.serviceAccountKey.private_key,
        this.serviceAccountKey.client_email
      );

      // Build save URL
      const saveUrl = `https://pay.google.com/gp/v/save/${jwt}`;

      return {
        jwt,
        saveUrl,
        classId,
        objectId,
      };
    } catch (error) {
      if (error instanceof WalletPassError) throw error;

      throw new WalletPassError(
        `Failed to generate Google Pay pass: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'google',
        'GENERATION_FAILED',
        error
      );
    }
  }

  /**
   * Get the save URL for a pass
   */
  async getSaveUrl(data: WalletPassData): Promise<string> {
    const result = await this.generatePass(data);
    return result.saveUrl;
  }

  /**
   * Build pass class data
   */
  private buildClassData(
    classId: string,
    data: WalletPassData,
    classType: GooglePassClass
  ): GooglePassClassData {
    const baseClass: GooglePassClassData = {
      id: classId,
      issuerName: data.organizationName,
      reviewStatus: 'UNDER_REVIEW', // or 'APPROVED' for production
    };

    // Add type-specific fields
    switch (classType) {
      case 'EventTicketClass':
        return {
          ...baseClass,
          eventName: localizedString(data.description),
          logo: data.logoUrl ? { sourceUri: createImageUri(data.logoUrl) } : undefined,
          hexBackgroundColor: toGoogleColor(data.backgroundColor),
          countryCode: 'US', // Should be configurable
        };

      case 'FlightClass':
        return {
          ...baseClass,
          localScheduledDepartureDateTime: data.relevantDate,
          flightHeader: {
            carrier: {
              carrierIataCode: 'XX', // Should come from data
            },
            flightNumber: data.primaryFields?.[0]?.value?.toString() || 'XX000',
          },
          origin: {
            airportIataCode: 'XXX', // Should come from data
          },
          destination: {
            airportIataCode: 'YYY', // Should come from data
          },
        };

      case 'OfferClass':
        return {
          ...baseClass,
          title: data.description,
          provider: data.organizationName,
          redemptionChannel: 'BOTH',
          hexBackgroundColor: toGoogleColor(data.backgroundColor),
        };

      case 'LoyaltyClass':
        return {
          ...baseClass,
          programName: data.description,
          programLogo: data.logoUrl ? { sourceUri: createImageUri(data.logoUrl) } : undefined,
          hexBackgroundColor: toGoogleColor(data.backgroundColor),
        };

      case 'GenericClass':
      default:
        return {
          ...baseClass,
          hexBackgroundColor: toGoogleColor(data.backgroundColor),
        };
    }
  }

  /**
   * Build pass object data
   */
  private buildObjectData(
    objectId: string,
    classId: string,
    data: WalletPassData,
    objectType: GooglePassObject
  ): GooglePassObjectData {
    const baseObject: GooglePassObjectData = {
      id: objectId,
      classId: classId,
      state: data.voided ? 'EXPIRED' : 'ACTIVE',
    };

    // Common fields
    const commonFields: Record<string, unknown> = {
      barcode: createBarcode(data),
      validTimeInterval: data.expirationDate
        ? {
            start: { date: new Date().toISOString() },
            end: { date: data.expirationDate },
          }
        : undefined,
      textModulesData: fieldsToTextModules(data.backFields),
    };

    // Add type-specific fields
    switch (objectType) {
      case 'EventTicketObject':
        return {
          ...baseObject,
          ...commonFields,
          ticketHolderName: data.holder || 'Guest',
          ticketNumber: data.serialNumber,
          seatInfo: data.auxiliaryFields
            ? {
                seat: {
                  defaultValue: {
                    language: 'en',
                    value: data.auxiliaryFields.find(f => f.key === 'seat')?.value?.toString() || '',
                  },
                },
                row: {
                  defaultValue: {
                    language: 'en',
                    value: data.auxiliaryFields.find(f => f.key === 'row')?.value?.toString() || '',
                  },
                },
                section: {
                  defaultValue: {
                    language: 'en',
                    value: data.auxiliaryFields.find(f => f.key === 'section')?.value?.toString() || '',
                  },
                },
              }
            : undefined,
        };

      case 'FlightObject':
        return {
          ...baseObject,
          ...commonFields,
          passengerName: data.holder || 'Guest',
          reservationInfo: {
            confirmationCode: data.serialNumber,
          },
          boardingAndSeatingInfo: data.auxiliaryFields
            ? {
                seatNumber: data.auxiliaryFields.find(f => f.key === 'seat')?.value?.toString(),
                boardingGroup: data.auxiliaryFields.find(f => f.key === 'group')?.value?.toString(),
              }
            : undefined,
        };

      case 'OfferObject':
        return {
          ...baseObject,
          ...commonFields,
        };

      case 'LoyaltyObject':
        return {
          ...baseObject,
          ...commonFields,
          accountId: data.holder || data.serialNumber,
          accountName: data.holder || 'Member',
          loyaltyPoints: data.primaryFields?.[0]
            ? {
                balance: {
                  int: typeof data.primaryFields[0].value === 'number'
                    ? data.primaryFields[0].value
                    : parseInt(data.primaryFields[0].value.toString(), 10) || 0,
                },
                label: data.primaryFields[0].label,
              }
            : undefined,
        };

      case 'GenericObject':
      default:
        return {
          ...baseObject,
          ...commonFields,
          header: localizedString(data.description),
          subheader: data.organizationName
            ? localizedString(data.organizationName)
            : undefined,
          cardTitle: localizedString(data.primaryFields?.[0]?.value?.toString() || data.description),
        };
    }
  }

  /**
   * Build the JWT payload
   */
  private buildJwtPayload(
    classData: GooglePassClassData,
    objectData: GooglePassObjectData,
    classType: GooglePassClass,
    objectType: GooglePassObject
  ): JwtPayload {
    const payload: JwtPayload = {
      iss: this.serviceAccountKey.client_email,
      aud: 'google',
      typ: 'savetowallet',
      iat: Math.floor(Date.now() / 1000),
      payload: {},
      origins: ['*'], // Should be restricted in production
    };

    // Add class and object to payload based on type
    const classKey = this.getPayloadKey(classType, true);
    const objectKey = this.getPayloadKey(objectType, false);

    (payload.payload as Record<string, unknown[]>)[classKey] = [classData];
    (payload.payload as Record<string, unknown[]>)[objectKey] = [objectData];

    return payload;
  }

  /**
   * Get the payload key for a class/object type
   */
  private getPayloadKey(type: string, isClass: boolean): string {
    const mapping: Record<string, string> = {
      EventTicketClass: 'eventTicketClasses',
      EventTicketObject: 'eventTicketObjects',
      FlightClass: 'flightClasses',
      FlightObject: 'flightObjects',
      GiftCardClass: 'giftCardClasses',
      GiftCardObject: 'giftCardObjects',
      LoyaltyClass: 'loyaltyClasses',
      LoyaltyObject: 'loyaltyObjects',
      OfferClass: 'offerClasses',
      OfferObject: 'offerObjects',
      TransitClass: 'transitClasses',
      TransitObject: 'transitObjects',
      GenericClass: 'genericClasses',
      GenericObject: 'genericObjects',
    };

    return mapping[type] || (isClass ? 'genericClasses' : 'genericObjects');
  }

  /**
   * Generate a short unique ID
   */
  private async generateShortId(): Promise<string> {
    const uuid = await randomUUID();
    return uuid.replace(/-/g, '').substring(0, 12);
  }
}

export default GooglePayProvider;
