/**
 * MockDCSConnector - Mock DCS Connector for Testing
 *
 * Simulates Departure Control System operations:
 * - Check-in simulation
 * - Boarding pass generation
 * - Boarding status tracking
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
 * Mock DCS configuration
 */
export interface MockDCSConfig extends BaseConnectorConfig {
  /** Simulated delay (ms) */
  simulatedDelay?: number;
  /** Error rate (0-1) */
  errorRate?: number;
}

/**
 * Checked-in passenger record
 */
interface CheckedInRecord {
  recordLocator: string;
  passengerId: string;
  segmentId: string;
  seatNumber: string;
  boardingSequence: number;
  boardingGroup: string;
  status: 'CHECKED_IN' | 'BOARDED' | 'NO_SHOW';
  boardingPass?: BoardingPass;
}

/**
 * MockDCSConnector - In-memory DCS for testing
 */
export class MockDCSConnector extends BaseDCSConnector {
  readonly providerId = 'mock-dcs';
  readonly providerName = 'Mock DCS';

  private checkedIn: Map<string, CheckedInRecord> = new Map();
  private boardingStatuses: Map<string, BoardingStatus> = new Map();
  private simulatedDelay: number;
  private errorRate: number;
  private boardingSequenceCounter = 0;

  constructor(config: MockDCSConfig) {
    super(config);
    this.simulatedDelay = config.simulatedDelay ?? 100;
    this.errorRate = config.errorRate ?? 0;
  }

  // ============================================================================
  // CHECK-IN
  // ============================================================================

  async checkIn(request: CheckInRequest): Promise<CheckInResult> {
    await this._simulateDelay();
    if (this._shouldError()) {
      return { success: false, checkedInPassengers: [], boardingPasses: [], errors: [{ passengerId: '', code: 'ERR', message: 'Simulated error' }] };
    }

    const checkedInPassengers: CheckInResult['checkedInPassengers'] = [];
    const boardingPasses: BoardingPass[] = [];
    const errors: CheckInResult['errors'] = [];

    for (const passengerId of request.passengerIds) {
      for (const segmentId of request.segmentIds) {
        const key = `${request.recordLocator}-${passengerId}-${segmentId}`;

        // Check if already checked in
        if (this.checkedIn.has(key)) {
          errors.push({
            passengerId,
            code: 'ALREADY_CHECKED_IN',
            message: 'Passenger already checked in for this segment',
          });
          continue;
        }

        // Assign seat
        const seatPreference = request.seatPreferences?.find(
          (p) => p.passengerId === passengerId
        );
        const seatNumber = this._assignSeat(seatPreference?.preference);
        const boardingSequence = ++this.boardingSequenceCounter;
        const boardingGroup = this._getBoardingGroup(boardingSequence);

        // Create boarding pass
        const boardingPass = this._createBoardingPass(
          request.recordLocator,
          passengerId,
          segmentId,
          seatNumber,
          boardingSequence,
          boardingGroup
        );

        const record: CheckedInRecord = {
          recordLocator: request.recordLocator,
          passengerId,
          segmentId,
          seatNumber,
          boardingSequence,
          boardingGroup,
          status: 'CHECKED_IN',
          boardingPass,
        };

        this.checkedIn.set(key, record);

        checkedInPassengers.push({
          passengerId,
          seatNumber,
          boardingSequence,
          boardingGroup,
        });

        boardingPasses.push(boardingPass);
      }
    }

    this._log('Checked in passengers', {
      recordLocator: request.recordLocator,
      count: checkedInPassengers.length,
    });

    return {
      success: checkedInPassengers.length > 0,
      checkedInPassengers,
      boardingPasses,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  async getBoardingPass(
    recordLocator: string,
    passengerId: string
  ): Promise<BoardingPassResult> {
    await this._simulateDelay();
    if (this._shouldError()) {
      return { success: false, error: 'Simulated error' };
    }

    // Find boarding pass for this passenger
    for (const [key, record] of this.checkedIn.entries()) {
      if (
        record.recordLocator === recordLocator &&
        record.passengerId === passengerId &&
        record.boardingPass
      ) {
        return { success: true, boardingPass: record.boardingPass };
      }
    }

    return { success: false, error: 'Boarding pass not found' };
  }

  // ============================================================================
  // BOARDING
  // ============================================================================

  async board(recordLocator: string, passengerId: string): Promise<BoardResult> {
    await this._simulateDelay();
    if (this._shouldError()) {
      return { success: false, error: 'Simulated error' };
    }

    // Find checked-in record
    let found = false;
    for (const [key, record] of this.checkedIn.entries()) {
      if (
        record.recordLocator === recordLocator &&
        record.passengerId === passengerId
      ) {
        if (record.status === 'BOARDED') {
          return { success: false, error: 'Passenger already boarded' };
        }
        if (record.status === 'NO_SHOW') {
          return { success: false, error: 'Passenger marked as no-show' };
        }

        record.status = 'BOARDED';
        found = true;
        break;
      }
    }

    if (!found) {
      return { success: false, error: 'Passenger not checked in' };
    }

    this._log('Passenger boarded', { recordLocator, passengerId });

    return { success: true, boarded: true };
  }

  async getBoardingStatus(
    flightNumber: string,
    departureDate: string
  ): Promise<BoardingStatusResult> {
    await this._simulateDelay();
    if (this._shouldError()) {
      return { success: false, error: 'Simulated error' };
    }

    const key = `${flightNumber}-${departureDate}`;
    let status = this.boardingStatuses.get(key);

    if (!status) {
      // Create mock status
      status = this._createMockBoardingStatus(flightNumber, departureDate);
      this.boardingStatuses.set(key, status);
    }

    // Update status with checked-in passengers
    const passengers: BoardingStatus['passengers'] = [];
    let boardedCount = 0;

    for (const record of this.checkedIn.values()) {
      if (record.segmentId.includes(flightNumber)) {
        passengers.push({
          passengerId: record.passengerId,
          name: `Passenger ${record.passengerId}`,
          status: record.status === 'BOARDED' ? 'BOARDED' : 'CHECKED_IN',
          seatNumber: record.seatNumber,
        });
        if (record.status === 'BOARDED') {
          boardedCount++;
        }
      }
    }

    status.passengers = passengers;
    status.boardedCount = boardedCount;
    status.totalPassengers = passengers.length;

    return { success: true, status };
  }

  async markNoShow(recordLocator: string, passengerId: string): Promise<Result> {
    await this._simulateDelay();
    if (this._shouldError()) {
      return { success: false, error: 'Simulated error' };
    }

    // Find checked-in record
    let found = false;
    for (const [key, record] of this.checkedIn.entries()) {
      if (
        record.recordLocator === recordLocator &&
        record.passengerId === passengerId
      ) {
        if (record.status === 'BOARDED') {
          return { success: false, error: 'Cannot mark boarded passenger as no-show' };
        }

        record.status = 'NO_SHOW';
        found = true;
        break;
      }
    }

    if (!found) {
      return { success: false, error: 'Passenger not found' };
    }

    this._log('Marked no-show', { recordLocator, passengerId });

    return { success: true };
  }

  async healthCheck(): Promise<boolean> {
    await this._simulateDelay();
    return !this._shouldError();
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  private async _simulateDelay(): Promise<void> {
    if (this.simulatedDelay > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.simulatedDelay));
    }
  }

  private _shouldError(): boolean {
    return Math.random() < this.errorRate;
  }

  private _assignSeat(preference?: 'WINDOW' | 'AISLE' | 'ANY'): string {
    const row = Math.floor(Math.random() * 30) + 1;
    let column: string;

    if (preference === 'WINDOW') {
      column = Math.random() < 0.5 ? 'A' : 'F';
    } else if (preference === 'AISLE') {
      column = Math.random() < 0.5 ? 'C' : 'D';
    } else {
      const columns = ['A', 'B', 'C', 'D', 'E', 'F'];
      column = columns[Math.floor(Math.random() * columns.length)];
    }

    return `${row}${column}`;
  }

  private _getBoardingGroup(sequence: number): string {
    if (sequence <= 30) return 'A';
    if (sequence <= 60) return 'B';
    if (sequence <= 90) return 'C';
    return 'D';
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
    boardingTime.setMinutes(boardingTime.getMinutes() - 30);

    // Mock BCBP data
    const bcbpData = `M1PASSENGER/${passengerId}     E${recordLocator}LAXJFK`;

    return {
      passengerId,
      bcbpData,
      passengerName: `PASSENGER/${passengerId}`,
      flightNumber: segmentId.substring(0, 6) || 'AA1234',
      departureAirport: 'LAX',
      arrivalAirport: 'JFK',
      departureDate: departureTime.toISOString().split('T')[0],
      departureTime: departureTime.toISOString().split('T')[1].substring(0, 5),
      gate: `A${Math.floor(Math.random() * 30) + 1}`,
      boardingTime: boardingTime.toISOString().split('T')[1].substring(0, 5),
      seatNumber,
      cabinClass: 'Y',
      boardingSequence,
      boardingGroup,
      qrCode: `data:image/png;base64,mock-qr-${recordLocator}`,
    };
  }

  private _createMockBoardingStatus(
    flightNumber: string,
    departureDate: string
  ): BoardingStatus {
    return {
      segmentId: `${flightNumber}-${departureDate}`,
      flightNumber,
      departureAirport: 'LAX',
      scheduledDeparture: `${departureDate}T10:00:00Z`,
      estimatedDeparture: `${departureDate}T10:15:00Z`,
      gate: 'A15',
      status: 'SCHEDULED',
      boardedCount: 0,
      totalPassengers: 0,
      passengers: [],
    };
  }

  // ============================================================================
  // TEST HELPERS
  // ============================================================================

  /**
   * Get all checked-in records (for testing)
   */
  getAllCheckedIn(): CheckedInRecord[] {
    return Array.from(this.checkedIn.values());
  }

  /**
   * Clear all data (for testing)
   */
  clear(): void {
    this.checkedIn.clear();
    this.boardingStatuses.clear();
    this.boardingSequenceCounter = 0;
  }

  /**
   * Set boarding status for a flight (for testing)
   */
  setBoardingStatus(
    flightNumber: string,
    departureDate: string,
    status: Partial<BoardingStatus>
  ): void {
    const key = `${flightNumber}-${departureDate}`;
    const existing = this.boardingStatuses.get(key) ||
      this._createMockBoardingStatus(flightNumber, departureDate);

    this.boardingStatuses.set(key, { ...existing, ...status });
  }
}
