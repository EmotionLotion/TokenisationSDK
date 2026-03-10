/**
 * AmadeusDCSConnector - Amadeus DCS Integration
 *
 * Departure Control System operations via Amadeus APIs:
 * - Check-in
 * - Boarding passes
 * - Boarding status
 *
 * Note: Full DCS capabilities require Amadeus Altea DCS partnership
 * This implementation uses available self-service APIs
 */

import { BaseDCSConnector, type BaseConnectorConfig } from '../BasePSSConnector.js';
import type {
  CheckInRequest,
  CheckInResult,
  BoardingPassResult,
  BoardResult,
  BoardingStatusResult,
  BoardingPass,
  BoardingStatus,
  Result,
} from '../types.js';

/**
 * Amadeus DCS configuration
 */
export interface AmadeusDCSConfig extends BaseConnectorConfig {
  /** Amadeus API key */
  apiKey: string;
  /** Amadeus API secret */
  apiSecret: string;
  /** Use production API (default: false for test) */
  production?: boolean;
}

/**
 * AmadeusDCSConnector - Amadeus DCS implementation
 *
 * Note: Full DCS API access requires enterprise partnership with Amadeus
 * This connector provides a framework with mock implementations where
 * full API access is not available.
 */
export class AmadeusDCSConnector extends BaseDCSConnector {
  readonly providerId = 'amadeus-dcs';
  readonly providerName = 'Amadeus DCS';

  private accessToken?: string;
  private tokenExpiry?: number;
  private production: boolean;
  private apiKey: string;
  private apiSecret: string;

  constructor(config: AmadeusDCSConfig) {
    const baseUrl = config.production
      ? 'https://api.amadeus.com'
      : 'https://test.api.amadeus.com';

    super({ ...config, baseUrl });

    this.production = config.production ?? false;
    this.apiKey = config.apiKey;
    this.apiSecret = config.apiSecret;
  }

  // ============================================================================
  // AUTHENTICATION
  // ============================================================================

  private async _ensureAuthenticated(): Promise<void> {
    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return;
    }

    const tokenUrl = `${this.config.baseUrl}/v1/security/oauth2/token`;

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: this.apiKey,
        client_secret: this.apiSecret,
      }).toString(),
    });

    if (!response.ok) {
      throw new Error(`Amadeus authentication failed: ${response.status}`);
    }

    const data = await response.json() as { access_token: string; expires_in: number };

    this.accessToken = data.access_token;
    this.tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;

    this._log('Authenticated with Amadeus DCS', { expiresIn: data.expires_in });
  }

  private async _request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: unknown
  ): Promise<T> {
    await this._ensureAuthenticated();

    const url = `${this.config.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${this.accessToken}`,
    };

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Amadeus DCS API error ${response.status}: ${errorBody}`);
    }

    return await response.json() as T;
  }

  // ============================================================================
  // CHECK-IN OPERATIONS
  // ============================================================================

  async checkIn(request: CheckInRequest): Promise<CheckInResult> {
    // Note: Amadeus DCS check-in requires enterprise API access
    // This implementation provides the interface and mock response

    this._log('Check-in request', request);

    try {
      // In a full implementation, this would call:
      // POST /v1/airport/check-in
      // with the request body containing passenger and flight details

      // For now, generate mock boarding passes
      const checkedInPassengers: CheckInResult['checkedInPassengers'] = [];
      const boardingPasses: BoardingPass[] = [];
      let sequence = 1;

      for (const passengerId of request.passengerIds) {
        const seatPreference = request.seatPreferences?.find(
          (p) => p.passengerId === passengerId
        );

        const seatNumber = this._assignSeat(seatPreference?.preference);
        const boardingSequence = sequence++;
        const boardingGroup = this._getBoardingGroup(boardingSequence);

        checkedInPassengers.push({
          passengerId,
          seatNumber,
          boardingSequence,
          boardingGroup,
        });

        const boardingPass = this._createBoardingPass(
          request.recordLocator,
          passengerId,
          request.segmentIds[0],
          seatNumber,
          boardingSequence,
          boardingGroup
        );

        boardingPasses.push(boardingPass);
      }

      return {
        success: true,
        checkedInPassengers,
        boardingPasses,
      };
    } catch (error) {
      return {
        success: false,
        checkedInPassengers: [],
        boardingPasses: [],
        errors: [
          {
            passengerId: '',
            code: 'DCS_ERROR',
            message: error instanceof Error ? error.message : 'Check-in failed',
          },
        ],
      };
    }
  }

  async getBoardingPass(
    recordLocator: string,
    passengerId: string
  ): Promise<BoardingPassResult> {
    this._log('Get boarding pass', { recordLocator, passengerId });

    try {
      // In a full implementation, this would call:
      // GET /v1/airport/boarding-pass/{recordLocator}/{passengerId}

      // Mock response
      const boardingPass = this._createBoardingPass(
        recordLocator,
        passengerId,
        'SEG1',
        '15A',
        1,
        'A'
      );

      return { success: true, boardingPass };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get boarding pass',
      };
    }
  }

  // ============================================================================
  // BOARDING OPERATIONS
  // ============================================================================

  async board(recordLocator: string, passengerId: string): Promise<BoardResult> {
    this._log('Board passenger', { recordLocator, passengerId });

    try {
      // In a full implementation, this would call:
      // POST /v1/airport/boarding
      // with passenger and boarding gate details

      // Mock success
      return { success: true, boarded: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Boarding failed',
      };
    }
  }

  async getBoardingStatus(
    flightNumber: string,
    departureDate: string
  ): Promise<BoardingStatusResult> {
    this._log('Get boarding status', { flightNumber, departureDate });

    try {
      // Use Flight Status API for basic information
      const response = await this._request<{
        data: Array<{
          flightDesignator: { carrierCode: string; flightNumber: string };
          departure: {
            iataCode: string;
            scheduledTime: string;
            estimatedTime?: string;
            terminal?: string;
            gate?: string;
          };
          arrival: { iataCode: string };
          status: string;
        }>;
      }>(
        'GET',
        `/v2/schedule/flights?carrierCode=${flightNumber.substring(0, 2)}&flightNumber=${flightNumber.substring(2)}&scheduledDepartureDate=${departureDate}`
      );

      const flight = response.data[0];

      if (!flight) {
        return {
          success: false,
          error: 'Flight not found',
        };
      }

      const status: BoardingStatus = {
        segmentId: `${flightNumber}-${departureDate}`,
        flightNumber,
        departureAirport: flight.departure.iataCode,
        scheduledDeparture: flight.departure.scheduledTime,
        estimatedDeparture: flight.departure.estimatedTime,
        gate: flight.departure.gate,
        status: this._mapFlightStatus(flight.status),
        boardedCount: 0,
        totalPassengers: 0,
        passengers: [],
      };

      return { success: true, status };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get boarding status',
      };
    }
  }

  async markNoShow(recordLocator: string, passengerId: string): Promise<Result> {
    this._log('Mark no-show', { recordLocator, passengerId });

    try {
      // In a full implementation, this would call:
      // POST /v1/airport/no-show

      // Mock success
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to mark no-show',
      };
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this._ensureAuthenticated();
      return true;
    } catch {
      return false;
    }
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  private _assignSeat(preference?: 'WINDOW' | 'AISLE' | 'ANY'): string {
    const row = Math.floor(Math.random() * 30) + 1;
    let column: string;

    if (preference === 'WINDOW') {
      column = Math.random() < 0.5 ? 'A' : 'K';
    } else if (preference === 'AISLE') {
      column = Math.random() < 0.5 ? 'C' : 'H';
    } else {
      const columns = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K'];
      column = columns[Math.floor(Math.random() * columns.length)];
    }

    return `${row}${column}`;
  }

  private _getBoardingGroup(sequence: number): string {
    if (sequence <= 30) return '1';
    if (sequence <= 60) return '2';
    if (sequence <= 90) return '3';
    if (sequence <= 120) return '4';
    return '5';
  }

  private _createBoardingPass(
    recordLocator: string,
    passengerId: string,
    segmentId: string,
    seatNumber: string,
    boardingSequence: number,
    boardingGroup: string
  ): BoardingPass {
    const departureTime = new Date();
    departureTime.setHours(departureTime.getHours() + 2);

    const boardingTime = new Date(departureTime);
    boardingTime.setMinutes(boardingTime.getMinutes() - 35);

    // Generate IATA BCBP M1 format
    const bcbpData = this._generateBCBP(
      recordLocator,
      passengerId,
      segmentId,
      seatNumber,
      boardingSequence
    );

    return {
      passengerId,
      bcbpData,
      passengerName: `PASSENGER/${passengerId}`,
      flightNumber: segmentId.substring(0, 6) || 'AA1234',
      departureAirport: 'JFK',
      arrivalAirport: 'LAX',
      departureDate: departureTime.toISOString().split('T')[0],
      departureTime: departureTime.toISOString().split('T')[1].substring(0, 5),
      gate: `B${Math.floor(Math.random() * 40) + 1}`,
      boardingTime: boardingTime.toISOString().split('T')[1].substring(0, 5),
      seatNumber,
      cabinClass: 'Y',
      boardingSequence,
      boardingGroup,
      qrCode: `data:image/png;base64,amadeus-qr-${recordLocator}`,
      barcode: `data:image/png;base64,amadeus-barcode-${recordLocator}`,
    };
  }

  private _generateBCBP(
    recordLocator: string,
    passengerId: string,
    segmentId: string,
    seatNumber: string,
    sequence: number
  ): string {
    // Simplified IATA BCBP format (M1 - single leg)
    const passengerName = `PASSENGER/${passengerId}`.padEnd(20, ' ').substring(0, 20);
    const pnr = recordLocator.padEnd(7, ' ').substring(0, 7);
    const origin = 'JFK';
    const destination = 'LAX';
    const carrier = 'AA';
    const flightNo = '1234';
    const julianDate = Math.floor(
      (new Date().getTime() - new Date(new Date().getFullYear(), 0, 0).getTime()) /
        (1000 * 60 * 60 * 24)
    )
      .toString()
      .padStart(3, '0');
    const seat = seatNumber.padStart(4, '0');
    const seqNo = sequence.toString().padStart(4, '0');

    return `M1${passengerName}E${pnr}${origin}${destination}${carrier}${flightNo} ${julianDate}Y${seat}${seqNo}`;
  }

  private _mapFlightStatus(
    status: string
  ): BoardingStatus['status'] {
    const mapping: Record<string, BoardingStatus['status']> = {
      SCHEDULED: 'SCHEDULED',
      BOARDING: 'BOARDING',
      FINAL_CALL: 'FINAL_CALL',
      GATE_CLOSED: 'GATE_CLOSED',
      DEPARTED: 'DEPARTED',
      CANCELLED: 'CANCELLED',
      DELAYED: 'DELAYED',
    };

    return mapping[status] || 'SCHEDULED';
  }
}
