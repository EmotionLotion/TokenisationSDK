/**
 * BasePSSConnector - Abstract Base Class for PSS Connectors
 *
 * Provides shared functionality for PSS/NDC/DCS integrations:
 * - HTTP client management
 * - Authentication handling
 * - Request/response logging
 * - Error handling
 */

import type {
  IPSSConnector,
  INDCConnector,
  IDCSConnector,
  PNR,
  Passenger,
  FlightSegment,
  Ticket,
  PaymentInfo,
  CreatePNRParams,
  PNRResult,
  TicketResult,
  RefundResult,
  OfferSearchParams,
  OfferSearchResult,
  PriceResult,
  SeatMapResult,
  OrderResult,
  OrderChangeRequest,
  RefundQuoteResult,
  NDCAncillary,
  CheckInRequest,
  CheckInResult,
  BoardingPassResult,
  BoardResult,
  BoardingStatusResult,
  Result,
} from './types.js';

/**
 * Base connector configuration
 */
export interface BaseConnectorConfig {
  /** API base URL */
  baseUrl: string;
  /** API key */
  apiKey?: string;
  /** API secret */
  apiSecret?: string;
  /** OAuth2 client ID */
  clientId?: string;
  /** OAuth2 client secret */
  clientSecret?: string;
  /** Request timeout (ms) */
  timeout?: number;
  /** Enable debug logging */
  debug?: boolean;
  /** Retry configuration */
  retry?: {
    maxRetries: number;
    retryDelay: number;
  };
}

/**
 * OAuth2 token response
 */
interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
}

/**
 * BasePSSConnector - Abstract base for PSS connectors
 */
export abstract class BasePSSConnector implements IPSSConnector {
  abstract readonly providerId: string;
  abstract readonly providerName: string;

  protected config: BaseConnectorConfig;
  protected accessToken?: string;
  protected tokenExpiry?: number;

  constructor(config: BaseConnectorConfig) {
    this.config = {
      timeout: 30000,
      debug: false,
      retry: {
        maxRetries: 3,
        retryDelay: 1000,
      },
      ...config,
    };
  }

  // ============================================================================
  // ABSTRACT METHODS (to be implemented by subclasses)
  // ============================================================================

  abstract createPNR(params: CreatePNRParams): Promise<PNRResult>;
  abstract getPNR(recordLocator: string): Promise<PNRResult>;
  abstract updatePassenger(
    recordLocator: string,
    passengerId: string,
    updates: Partial<Passenger>
  ): Promise<PNRResult>;
  abstract cancelPNR(recordLocator: string): Promise<PNRResult>;
  abstract issueTicket(recordLocator: string, payment: PaymentInfo): Promise<TicketResult>;
  abstract voidTicket(ticketNumber: string): Promise<TicketResult>;
  abstract processRefund(ticketNumber: string, amount?: number): Promise<RefundResult>;
  abstract exchangeTicket(ticketNumber: string, newSegments: FlightSegment[]): Promise<TicketResult>;

  async healthCheck(): Promise<boolean> {
    try {
      await this._ensureAuthenticated();
      return true;
    } catch {
      return false;
    }
  }

  // ============================================================================
  // PROTECTED METHODS
  // ============================================================================

  /**
   * Make authenticated HTTP request
   */
  protected async _request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
    path: string,
    body?: unknown,
    headers?: Record<string, string>
  ): Promise<T> {
    await this._ensureAuthenticated();

    const url = `${this.config.baseUrl}${path}`;
    const requestHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...headers,
    };

    if (this.accessToken) {
      requestHeaders['Authorization'] = `Bearer ${this.accessToken}`;
    } else if (this.config.apiKey) {
      requestHeaders['X-API-Key'] = this.config.apiKey;
    }

    this._log('Request', { method, url, body });

    let lastError: Error | null = null;
    const maxRetries = this.config.retry?.maxRetries || 3;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(
          () => controller.abort(),
          this.config.timeout || 30000
        );

        const response = await fetch(url, {
          method,
          headers: requestHeaders,
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorBody}`);
        }

        const data = await response.json();
        this._log('Response', { status: response.status, data });

        return data as T;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');

        if (attempt < maxRetries) {
          await this._delay(this.config.retry?.retryDelay || 1000);
        }
      }
    }

    throw lastError;
  }

  /**
   * Ensure we have a valid access token
   */
  protected async _ensureAuthenticated(): Promise<void> {
    // Skip if using API key
    if (this.config.apiKey && !this.config.clientId) {
      return;
    }

    // Check if token is valid
    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return;
    }

    // Get new token
    await this._authenticate();
  }

  /**
   * Authenticate with OAuth2
   */
  protected async _authenticate(): Promise<void> {
    if (!this.config.clientId || !this.config.clientSecret) {
      throw new Error('OAuth2 credentials not configured');
    }

    const tokenUrl = this._getTokenUrl();
    const params = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
    });

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      throw new Error(`Authentication failed: ${response.status}`);
    }

    const data: TokenResponse = await response.json();

    this.accessToken = data.access_token;
    this.tokenExpiry = Date.now() + (data.expires_in - 60) * 1000; // 60s buffer

    this._log('Authenticated', { expiresIn: data.expires_in });
  }

  /**
   * Get OAuth2 token URL (override in subclass)
   */
  protected _getTokenUrl(): string {
    return `${this.config.baseUrl}/oauth/token`;
  }

  /**
   * Log message if debug enabled
   */
  protected _log(message: string, data?: unknown): void {
    if (this.config.debug) {
      console.log(`[${this.providerId}] ${message}`, data || '');
    }
  }

  /**
   * Delay helper
   */
  protected _delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Generate record locator
   */
  protected _generateRecordLocator(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /**
   * Generate ticket number
   */
  protected _generateTicketNumber(airlineCode: string): string {
    const random = Math.floor(Math.random() * 10000000000).toString().padStart(10, '0');
    return `${airlineCode}${random}`;
  }
}

/**
 * BaseNDCConnector - Abstract base for NDC connectors
 */
export abstract class BaseNDCConnector extends BasePSSConnector implements INDCConnector {
  abstract searchOffers(params: OfferSearchParams): Promise<OfferSearchResult>;
  abstract priceOffer(offerId: string): Promise<PriceResult>;
  abstract getSeatMap(offerId: string, segmentId: string): Promise<SeatMapResult>;
  abstract createOrder(
    offerId: string,
    passengers: Passenger[],
    payment: PaymentInfo
  ): Promise<OrderResult>;
  abstract getOrder(orderId: string): Promise<OrderResult>;
  abstract cancelOrder(orderId: string): Promise<OrderResult>;
  abstract changeOrder(orderId: string, changes: OrderChangeRequest): Promise<OrderResult>;
  abstract addService(orderId: string, ancillary: NDCAncillary): Promise<OrderResult>;
  abstract getRefundQuote(orderId: string): Promise<RefundQuoteResult>;
}

/**
 * BaseDCSConnector - Abstract base for DCS connectors
 */
export abstract class BaseDCSConnector implements IDCSConnector {
  abstract readonly providerId: string;
  abstract readonly providerName: string;

  protected config: BaseConnectorConfig;

  constructor(config: BaseConnectorConfig) {
    this.config = {
      timeout: 30000,
      debug: false,
      ...config,
    };
  }

  abstract checkIn(request: CheckInRequest): Promise<CheckInResult>;
  abstract getBoardingPass(recordLocator: string, passengerId: string): Promise<BoardingPassResult>;
  abstract board(recordLocator: string, passengerId: string): Promise<BoardResult>;
  abstract getBoardingStatus(flightNumber: string, departureDate: string): Promise<BoardingStatusResult>;
  abstract markNoShow(recordLocator: string, passengerId: string): Promise<Result>;
  abstract healthCheck(): Promise<boolean>;

  protected _log(message: string, data?: unknown): void {
    if (this.config.debug) {
      console.log(`[${this.providerId}] ${message}`, data || '');
    }
  }
}
