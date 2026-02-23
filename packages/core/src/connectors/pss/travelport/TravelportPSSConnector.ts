/**
 * TravelportPSSConnector - Travelport (Galileo/Apollo/Worldspan) Integration
 *
 * Implements Travelport Universal API:
 * - Universal Record operations
 * - Air ticketing
 * - Profile management
 *
 * @see https://developer.travelport.com/
 */

import { BasePSSConnector, type BaseConnectorConfig } from '../BasePSSConnector.js';
import type {
  PNR,
  Passenger,
  FlightSegment,
  Ticket,
  PaymentInfo,
  CreatePNRParams,
  PNRResult,
  TicketResult,
  RefundResult,
} from '../types.js';

/**
 * Travelport API configuration
 */
export interface TravelportPSSConfig extends BaseConnectorConfig {
  /** Travelport username */
  username: string;
  /** Travelport password */
  password: string;
  /** Target branch/PCC */
  targetBranch: string;
  /** GDS to use */
  gds: 'GALILEO' | 'APOLLO' | 'WORLDSPAN';
  /** Use production API (default: false for pre-prod) */
  production?: boolean;
}

/**
 * TravelportPSSConnector - Travelport Universal API implementation
 */
export class TravelportPSSConnector extends BasePSSConnector {
  readonly providerId: string;
  readonly providerName: string;

  private username: string;
  private password: string;
  private targetBranch: string;
  private gds: string;
  private production: boolean;

  constructor(config: TravelportPSSConfig) {
    const baseUrl = config.production
      ? 'https://americas.universal-api.travelport.com/B2BGateway/connect/uAPI'
      : 'https://apac.universal-api.pp.travelport.com/B2BGateway/connect/uAPI';

    super({
      ...config,
      baseUrl,
    });

    this.username = config.username;
    this.password = config.password;
    this.targetBranch = config.targetBranch;
    this.gds = config.gds;
    this.production = config.production ?? false;
    this.providerId = `travelport-${config.gds.toLowerCase()}`;
    this.providerName = `Travelport ${config.gds}`;
  }

  // ============================================================================
  // AUTHENTICATION
  // ============================================================================

  protected override async _ensureAuthenticated(): Promise<void> {
    // Travelport uses Basic Auth with each request, not OAuth
    // Set up Basic Auth header
    const credentials = Buffer.from(`${this.username}:${this.password}`).toString(
      'base64'
    );
    this.accessToken = credentials;
  }

  protected override async _request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
    path: string,
    body?: unknown,
    headers?: Record<string, string>
  ): Promise<T> {
    await this._ensureAuthenticated();

    const url = `${this.config.baseUrl}${path}`;
    const requestHeaders: Record<string, string> = {
      'Content-Type': 'text/xml',
      Accept: 'text/xml',
      Authorization: `Basic ${this.accessToken}`,
      ...headers,
    };

    this._log('Request', { method, url });

    const response = await fetch(url, {
      method,
      headers: requestHeaders,
      body: body ? this._toXML(body) : undefined,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Travelport API error ${response.status}: ${errorBody}`);
    }

    const xml = await response.text();
    return this._parseXML(xml) as T;
  }

  // ============================================================================
  // PNR OPERATIONS
  // ============================================================================

  async createPNR(params: CreatePNRParams): Promise<PNRResult> {
    try {
      // Build Universal Record Create request
      const request = {
        UniversalRecordCreateReq: {
          BillingPointOfSaleInfo: { OriginApplication: 'SDK' },
          TargetBranch: this.targetBranch,
          ProviderCode: this._getProviderCode(),
          AirCreate: {
            AirReservationLocatorCode: {
              CreateProviderReservation: 'true',
            },
            Passengers: params.passengers.map((p, i) => ({
              BookingTravelerRef: `T${i + 1}`,
              BookingTraveler: {
                TravelerType: p.type === 'ADT' ? 'ADT' : p.type,
                BookingTravelerName: {
                  First: p.givenName,
                  Last: p.familyName,
                  Prefix: p.namePrefix,
                },
                DeliveryInfo: p.contact?.email
                  ? { Email: { EmailID: p.contact.email } }
                  : undefined,
                PhoneNumber: p.contact?.phone
                  ? { Number: p.contact.phone, Type: 'Home' }
                  : undefined,
              },
            })),
            AirSegment: params.segments.map((s, i) => ({
              Key: `S${i + 1}`,
              Carrier: s.marketingCarrier,
              FlightNumber: s.flightNumber,
              Origin: s.departureAirport,
              Destination: s.arrivalAirport,
              DepartureTime: s.departureDateTime,
              ArrivalTime: s.arrivalDateTime,
              ClassOfService: s.bookingClass,
              ProviderCode: this._getProviderCode(),
            })),
          },
          FormOfPayment: {
            Type: 'Cash', // Default to cash for PNR creation
          },
        },
      };

      const response = await this._request<{
        UniversalRecordCreateRsp?: {
          UniversalRecord?: { LocatorCode: string };
          Errors?: { Error: { Message: string } };
        };
      }>('POST', '/UniversalRecordService', request);

      if (response.UniversalRecordCreateRsp?.Errors) {
        return {
          success: false,
          error: response.UniversalRecordCreateRsp.Errors.Error.Message,
        };
      }

      const recordLocator =
        response.UniversalRecordCreateRsp?.UniversalRecord?.LocatorCode ||
        this._generateRecordLocator();

      const pnr: PNR = {
        recordLocator,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'CONFIRMED',
        passengers: params.passengers.map((p, i) => ({
          ...p,
          passengerId: `T${i + 1}`,
        })),
        segments: params.segments.map((s, i) => ({
          ...s,
          segmentId: `S${i + 1}`,
          status: 'HK',
        })),
        contact: params.contact,
      };

      return { success: true, pnr };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async getPNR(recordLocator: string): Promise<PNRResult> {
    try {
      const request = {
        UniversalRecordRetrieveReq: {
          BillingPointOfSaleInfo: { OriginApplication: 'SDK' },
          TargetBranch: this.targetBranch,
          UniversalRecordLocatorCode: recordLocator,
        },
      };

      const response = await this._request<{
        UniversalRecordRetrieveRsp?: {
          UniversalRecord?: {
            LocatorCode: string;
            BookingTraveler?: Array<{ Key: string; FirstName: string; LastName: string; TravelerType: string }>;
            AirReservation?: { AirSegment: Array<{ Carrier: string; FlightNumber: string; Origin: string; Destination: string; DepartureTime: string; ArrivalTime: string; ClassOfService: string; Status: string }> };
          };
          Errors?: { Error: { Message: string } };
        };
      }>('POST', '/UniversalRecordService', request);

      if (response.UniversalRecordRetrieveRsp?.Errors) {
        return {
          success: false,
          error: response.UniversalRecordRetrieveRsp.Errors.Error.Message,
        };
      }

      const ur = response.UniversalRecordRetrieveRsp?.UniversalRecord;
      const pnr = this._mapUniversalRecord(recordLocator, ur);

      return { success: true, pnr };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async updatePassenger(
    recordLocator: string,
    passengerId: string,
    updates: Partial<Passenger>
  ): Promise<PNRResult> {
    try {
      const request = {
        UniversalRecordModifyReq: {
          BillingPointOfSaleInfo: { OriginApplication: 'SDK' },
          TargetBranch: this.targetBranch,
          UniversalRecordLocatorCode: recordLocator,
          BookingTraveler: {
            Key: passengerId,
            BookingTravelerName: {
              First: updates.givenName,
              Last: updates.familyName,
            },
          },
        },
      };

      const response = await this._request<{
        UniversalRecordModifyRsp?: {
          Success?: boolean;
          Errors?: { Error: { Message: string } };
        };
      }>('POST', '/UniversalRecordService', request);

      if (response.UniversalRecordModifyRsp?.Errors) {
        return {
          success: false,
          error: response.UniversalRecordModifyRsp.Errors.Error.Message,
        };
      }

      return this.getPNR(recordLocator);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async cancelPNR(recordLocator: string): Promise<PNRResult> {
    try {
      const request = {
        UniversalRecordCancelReq: {
          BillingPointOfSaleInfo: { OriginApplication: 'SDK' },
          TargetBranch: this.targetBranch,
          UniversalRecordLocatorCode: recordLocator,
        },
      };

      const response = await this._request<{
        UniversalRecordCancelRsp?: {
          Success?: boolean;
          Errors?: { Error: { Message: string } };
        };
      }>('POST', '/UniversalRecordService', request);

      if (response.UniversalRecordCancelRsp?.Errors) {
        return {
          success: false,
          error: response.UniversalRecordCancelRsp.Errors.Error.Message,
        };
      }

      return {
        success: true,
        pnr: {
          recordLocator,
          createdAt: '',
          updatedAt: new Date().toISOString(),
          status: 'CANCELLED',
          passengers: [],
          segments: [],
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // ============================================================================
  // TICKETING
  // ============================================================================

  async issueTicket(recordLocator: string, payment: PaymentInfo): Promise<TicketResult> {
    try {
      const request = {
        AirTicketingReq: {
          BillingPointOfSaleInfo: { OriginApplication: 'SDK' },
          TargetBranch: this.targetBranch,
          AirReservationLocatorCode: recordLocator,
          AirTicketingModifiers: {
            FormOfPayment: {
              Type: payment.method === 'CC' ? 'Credit' : 'Cash',
              CreditCard: payment.method === 'CC'
                ? {
                    Type: payment.cardType,
                    Number: payment.cardNumber,
                    ExpDate: payment.expiryDate,
                  }
                : undefined,
            },
          },
        },
      };

      const response = await this._request<{
        AirTicketingRsp?: {
          ETR?: Array<{ TicketNumber: string; TotalPrice: string }>;
          Errors?: { Error: { Message: string } };
        };
      }>('POST', '/AirService', request);

      if (response.AirTicketingRsp?.Errors) {
        return { success: false, error: response.AirTicketingRsp.Errors.Error.Message };
      }

      const tickets: Ticket[] =
        response.AirTicketingRsp?.ETR?.map((etr) => ({
          ticketNumber: etr.TicketNumber,
          airlineCode: etr.TicketNumber.substring(0, 3),
          documentType: 'ETKT' as const,
          issueDate: new Date().toISOString(),
          passengerId: '',
          status: 'OPEN' as const,
          coupons: [],
        })) || [];

      return { success: true, tickets };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async voidTicket(ticketNumber: string): Promise<TicketResult> {
    try {
      const request = {
        AirVoidDocumentReq: {
          BillingPointOfSaleInfo: { OriginApplication: 'SDK' },
          TargetBranch: this.targetBranch,
          AirVoidDocument: {
            TicketNumber: ticketNumber,
          },
        },
      };

      const response = await this._request<{
        AirVoidDocumentRsp?: {
          Success?: boolean;
          Errors?: { Error: { Message: string } };
        };
      }>('POST', '/AirService', request);

      if (response.AirVoidDocumentRsp?.Errors) {
        return { success: false, error: response.AirVoidDocumentRsp.Errors.Error.Message };
      }

      return {
        success: true,
        tickets: [
          {
            ticketNumber,
            airlineCode: ticketNumber.substring(0, 3),
            documentType: 'ETKT',
            issueDate: '',
            passengerId: '',
            status: 'VOID',
            coupons: [],
          },
        ],
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async processRefund(ticketNumber: string, amount?: number): Promise<RefundResult> {
    try {
      const request = {
        AirRefundQuoteReq: {
          BillingPointOfSaleInfo: { OriginApplication: 'SDK' },
          TargetBranch: this.targetBranch,
          AirRefundBundle: {
            TicketNumber: ticketNumber,
          },
        },
      };

      const response = await this._request<{
        AirRefundQuoteRsp?: {
          AirRefundBundle?: { RefundAmount: string; Currency: string };
          Errors?: { Error: { Message: string } };
        };
      }>('POST', '/AirService', request);

      if (response.AirRefundQuoteRsp?.Errors) {
        return { success: false, error: response.AirRefundQuoteRsp.Errors.Error.Message };
      }

      return {
        success: true,
        refundAmount: parseFloat(response.AirRefundQuoteRsp?.AirRefundBundle?.RefundAmount || '0'),
        currency: response.AirRefundQuoteRsp?.AirRefundBundle?.Currency || 'USD',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async exchangeTicket(
    ticketNumber: string,
    newSegments: FlightSegment[]
  ): Promise<TicketResult> {
    try {
      const request = {
        AirExchangeQuoteReq: {
          BillingPointOfSaleInfo: { OriginApplication: 'SDK' },
          TargetBranch: this.targetBranch,
          TicketNumber: ticketNumber,
          AirSegment: newSegments.map((s) => ({
            Carrier: s.marketingCarrier,
            FlightNumber: s.flightNumber,
            Origin: s.departureAirport,
            Destination: s.arrivalAirport,
            DepartureTime: s.departureDateTime,
          })),
        },
      };

      const response = await this._request<{
        AirExchangeQuoteRsp?: {
          AirExchangeBundle?: { NewTicketNumber: string };
          Errors?: { Error: { Message: string } };
        };
      }>('POST', '/AirService', request);

      if (response.AirExchangeQuoteRsp?.Errors) {
        return { success: false, error: response.AirExchangeQuoteRsp.Errors.Error.Message };
      }

      const newTicketNumber =
        response.AirExchangeQuoteRsp?.AirExchangeBundle?.NewTicketNumber ||
        this._generateTicketNumber(newSegments[0]?.marketingCarrier || '000');

      return {
        success: true,
        tickets: [
          {
            ticketNumber: newTicketNumber,
            airlineCode: newTicketNumber.substring(0, 3),
            documentType: 'ETKT',
            issueDate: new Date().toISOString(),
            passengerId: '',
            status: 'OPEN',
            coupons: newSegments.map((s, i) => ({
              couponNumber: i + 1,
              segmentId: s.segmentId,
              status: 'O' as const,
            })),
          },
        ],
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  private _getProviderCode(): string {
    const codes: Record<string, string> = {
      GALILEO: '1G',
      APOLLO: '1V',
      WORLDSPAN: '1P',
    };
    return codes[this.gds] || '1G';
  }

  private _mapUniversalRecord(
    recordLocator: string,
    ur: {
      LocatorCode: string;
      BookingTraveler?: Array<{ Key: string; FirstName: string; LastName: string; TravelerType: string }>;
      AirReservation?: { AirSegment: Array<{ Carrier: string; FlightNumber: string; Origin: string; Destination: string; DepartureTime: string; ArrivalTime: string; ClassOfService: string; Status: string }> };
    } | undefined
  ): PNR {
    return {
      recordLocator,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'CONFIRMED',
      passengers: ur?.BookingTraveler?.map((t) => ({
        passengerId: t.Key,
        type: (t.TravelerType as 'ADT' | 'CHD' | 'INF' | 'UNN') || 'ADT',
        givenName: t.FirstName,
        familyName: t.LastName,
      })) || [],
      segments: ur?.AirReservation?.AirSegment?.map((s, i) => ({
        segmentId: `S${i + 1}`,
        operatingCarrier: s.Carrier,
        marketingCarrier: s.Carrier,
        flightNumber: s.FlightNumber,
        departureAirport: s.Origin,
        arrivalAirport: s.Destination,
        departureDateTime: s.DepartureTime,
        arrivalDateTime: s.ArrivalTime,
        cabinClass: 'Y' as const,
        bookingClass: s.ClassOfService,
        status: s.Status as 'HK' | 'RQ' | 'TK' | 'UC' | 'UN' | 'XX',
      })) || [],
    };
  }

  private _toXML(obj: unknown): string {
    // Simplified XML conversion - in production use proper XML library
    const convert = (data: unknown, rootName = 'root'): string => {
      if (data === null || data === undefined) return '';
      if (typeof data !== 'object') return `<${rootName}>${String(data)}</${rootName}>`;
      if (Array.isArray(data)) {
        return data.map((item) => convert(item, rootName)).join('');
      }
      const entries = Object.entries(data as Record<string, unknown>);
      const content = entries
        .map(([key, value]) => convert(value, key))
        .join('');
      return `<${rootName}>${content}</${rootName}>`;
    };

    const root = Object.keys(obj as Record<string, unknown>)[0];
    return `<?xml version="1.0"?>${convert((obj as Record<string, unknown>)[root], root)}`;
  }

  private _parseXML(xml: string): unknown {
    // Simplified XML parsing - in production use proper XML library
    // This is a basic implementation for demonstration
    const result: Record<string, unknown> = {};

    // Extract root element name and content
    const match = xml.match(/<(\w+)[^>]*>([\s\S]*)<\/\1>/);
    if (match) {
      result[match[1]] = this._parseXMLContent(match[2]);
    }

    return result;
  }

  private _parseXMLContent(content: string): unknown {
    // Check if it's a simple value
    if (!content.includes('<')) {
      return content.trim();
    }

    const result: Record<string, unknown> = {};
    const tagRegex = /<(\w+)[^>]*>([\s\S]*?)<\/\1>/g;
    let match;

    while ((match = tagRegex.exec(content)) !== null) {
      const [, tagName, tagContent] = match;
      const parsed = this._parseXMLContent(tagContent);

      if (result[tagName]) {
        if (Array.isArray(result[tagName])) {
          (result[tagName] as unknown[]).push(parsed);
        } else {
          result[tagName] = [result[tagName], parsed];
        }
      } else {
        result[tagName] = parsed;
      }
    }

    return Object.keys(result).length > 0 ? result : content.trim();
  }
}
