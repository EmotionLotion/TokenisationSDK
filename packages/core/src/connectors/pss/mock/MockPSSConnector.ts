/**
 * MockPSSConnector - Mock PSS Connector for Testing
 *
 * Simulates PSS operations for development and testing:
 * - In-memory PNR storage
 * - Configurable delays
 * - Error simulation
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
 * Mock PSS configuration
 */
export interface MockPSSConfig extends BaseConnectorConfig {
  /** Simulated delay (ms) */
  simulatedDelay?: number;
  /** Error rate (0-1) for testing error handling */
  errorRate?: number;
  /** Initial PNRs to load */
  initialPNRs?: PNR[];
}

/**
 * MockPSSConnector - In-memory PSS for testing
 */
export class MockPSSConnector extends BasePSSConnector {
  readonly providerId = 'mock-pss';
  readonly providerName = 'Mock PSS';

  private pnrs: Map<string, PNR> = new Map();
  private tickets: Map<string, Ticket> = new Map();
  private simulatedDelay: number;
  private errorRate: number;

  constructor(config: MockPSSConfig) {
    super(config);
    this.simulatedDelay = config.simulatedDelay ?? 100;
    this.errorRate = config.errorRate ?? 0;

    // Load initial PNRs
    if (config.initialPNRs) {
      for (const pnr of config.initialPNRs) {
        this.pnrs.set(pnr.recordLocator, pnr);
      }
    }
  }

  // ============================================================================
  // PNR OPERATIONS
  // ============================================================================

  async createPNR(params: CreatePNRParams): Promise<PNRResult> {
    await this._simulateDelay();
    if (this._shouldError()) {
      return { success: false, error: 'Simulated error' };
    }

    const recordLocator = this._generateRecordLocator();
    const now = new Date().toISOString();

    const pnr: PNR = {
      recordLocator,
      createdAt: now,
      updatedAt: now,
      status: 'CONFIRMED',
      passengers: params.passengers.map((p, i) => ({
        ...p,
        passengerId: p.passengerId || `PAX${i + 1}`,
      })),
      segments: params.segments.map((s, i) => ({
        ...s,
        segmentId: s.segmentId || `SEG${i + 1}`,
        status: 'HK',
      })),
      remarks: params.remarks?.map((text) => ({
        type: 'GENERAL' as const,
        text,
        createdAt: now,
      })),
      contact: params.contact,
      ticketTimeLimit: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };

    this.pnrs.set(recordLocator, pnr);
    this._log('Created PNR', { recordLocator });

    return { success: true, pnr };
  }

  async getPNR(recordLocator: string): Promise<PNRResult> {
    await this._simulateDelay();
    if (this._shouldError()) {
      return { success: false, error: 'Simulated error' };
    }

    const pnr = this.pnrs.get(recordLocator);
    if (!pnr) {
      return { success: false, error: `PNR ${recordLocator} not found` };
    }

    return { success: true, pnr };
  }

  async updatePassenger(
    recordLocator: string,
    passengerId: string,
    updates: Partial<Passenger>
  ): Promise<PNRResult> {
    await this._simulateDelay();
    if (this._shouldError()) {
      return { success: false, error: 'Simulated error' };
    }

    const pnr = this.pnrs.get(recordLocator);
    if (!pnr) {
      return { success: false, error: `PNR ${recordLocator} not found` };
    }

    const passengerIndex = pnr.passengers.findIndex(
      (p) => p.passengerId === passengerId
    );
    if (passengerIndex === -1) {
      return { success: false, error: `Passenger ${passengerId} not found` };
    }

    pnr.passengers[passengerIndex] = {
      ...pnr.passengers[passengerIndex],
      ...updates,
    };
    pnr.updatedAt = new Date().toISOString();

    this._log('Updated passenger', { recordLocator, passengerId });

    return { success: true, pnr };
  }

  async cancelPNR(recordLocator: string): Promise<PNRResult> {
    await this._simulateDelay();
    if (this._shouldError()) {
      return { success: false, error: 'Simulated error' };
    }

    const pnr = this.pnrs.get(recordLocator);
    if (!pnr) {
      return { success: false, error: `PNR ${recordLocator} not found` };
    }

    pnr.status = 'CANCELLED';
    pnr.updatedAt = new Date().toISOString();

    // Cancel all segments
    for (const segment of pnr.segments) {
      segment.status = 'XX';
    }

    this._log('Cancelled PNR', { recordLocator });

    return { success: true, pnr };
  }

  // ============================================================================
  // TICKETING
  // ============================================================================

  async issueTicket(
    recordLocator: string,
    payment: PaymentInfo
  ): Promise<TicketResult> {
    await this._simulateDelay();
    if (this._shouldError()) {
      return { success: false, error: 'Simulated error' };
    }

    const pnr = this.pnrs.get(recordLocator);
    if (!pnr) {
      return { success: false, error: `PNR ${recordLocator} not found` };
    }

    if (pnr.status === 'TICKETED') {
      return { success: false, error: 'PNR already ticketed' };
    }

    const tickets: Ticket[] = [];
    const airlineCode = pnr.segments[0]?.marketingCarrier || '000';

    for (const passenger of pnr.passengers) {
      const ticketNumber = this._generateTicketNumber(airlineCode);

      const ticket: Ticket = {
        ticketNumber,
        airlineCode,
        documentType: 'ETKT',
        issueDate: new Date().toISOString(),
        passengerId: passenger.passengerId,
        status: 'OPEN',
        coupons: pnr.segments.map((segment, i) => ({
          couponNumber: i + 1,
          segmentId: segment.segmentId,
          status: 'O',
        })),
      };

      this.tickets.set(ticketNumber, ticket);
      tickets.push(ticket);
    }

    pnr.tickets = tickets;
    pnr.status = 'TICKETED';
    pnr.payment = { ...payment, status: 'CAPTURED' };
    pnr.updatedAt = new Date().toISOString();

    this._log('Issued tickets', { recordLocator, count: tickets.length });

    return { success: true, tickets };
  }

  async voidTicket(ticketNumber: string): Promise<TicketResult> {
    await this._simulateDelay();
    if (this._shouldError()) {
      return { success: false, error: 'Simulated error' };
    }

    const ticket = this.tickets.get(ticketNumber);
    if (!ticket) {
      return { success: false, error: `Ticket ${ticketNumber} not found` };
    }

    if (ticket.status !== 'OPEN') {
      return { success: false, error: `Cannot void ticket with status ${ticket.status}` };
    }

    // Check if any coupons have been used
    const hasUsedCoupons = ticket.coupons.some((c) => c.status !== 'O');
    if (hasUsedCoupons) {
      return { success: false, error: 'Cannot void ticket with used coupons' };
    }

    ticket.status = 'VOID';
    for (const coupon of ticket.coupons) {
      coupon.status = 'V';
    }

    this._log('Voided ticket', { ticketNumber });

    return { success: true, tickets: [ticket] };
  }

  async processRefund(ticketNumber: string, amount?: number): Promise<RefundResult> {
    await this._simulateDelay();
    if (this._shouldError()) {
      return { success: false, error: 'Simulated error' };
    }

    const ticket = this.tickets.get(ticketNumber);
    if (!ticket) {
      return { success: false, error: `Ticket ${ticketNumber} not found` };
    }

    if (ticket.status === 'REFUNDED') {
      return { success: false, error: 'Ticket already refunded' };
    }

    // Calculate refund amount (mock: 80% of original)
    const refundAmount = amount ?? 100.0; // Mock amount
    const currency = 'USD';

    ticket.status = 'REFUNDED';
    for (const coupon of ticket.coupons) {
      coupon.status = 'R';
    }

    this._log('Processed refund', { ticketNumber, refundAmount });

    return { success: true, refundAmount, currency };
  }

  async exchangeTicket(
    ticketNumber: string,
    newSegments: FlightSegment[]
  ): Promise<TicketResult> {
    await this._simulateDelay();
    if (this._shouldError()) {
      return { success: false, error: 'Simulated error' };
    }

    const oldTicket = this.tickets.get(ticketNumber);
    if (!oldTicket) {
      return { success: false, error: `Ticket ${ticketNumber} not found` };
    }

    if (oldTicket.status !== 'OPEN') {
      return { success: false, error: `Cannot exchange ticket with status ${oldTicket.status}` };
    }

    // Mark old ticket as exchanged
    oldTicket.status = 'EXCHANGED';
    for (const coupon of oldTicket.coupons) {
      coupon.status = 'E';
    }

    // Create new ticket
    const newTicketNumber = this._generateTicketNumber(oldTicket.airlineCode);
    const newTicket: Ticket = {
      ticketNumber: newTicketNumber,
      airlineCode: oldTicket.airlineCode,
      documentType: 'ETKT',
      issueDate: new Date().toISOString(),
      passengerId: oldTicket.passengerId,
      status: 'OPEN',
      coupons: newSegments.map((segment, i) => ({
        couponNumber: i + 1,
        segmentId: segment.segmentId,
        status: 'O',
      })),
    };

    this.tickets.set(newTicketNumber, newTicket);

    this._log('Exchanged ticket', { oldTicketNumber: ticketNumber, newTicketNumber });

    return { success: true, tickets: [newTicket] };
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  private async _simulateDelay(): Promise<void> {
    if (this.simulatedDelay > 0) {
      await this._delay(this.simulatedDelay);
    }
  }

  private _shouldError(): boolean {
    return Math.random() < this.errorRate;
  }

  // ============================================================================
  // TEST HELPERS
  // ============================================================================

  /**
   * Get all PNRs (for testing)
   */
  getAllPNRs(): PNR[] {
    return Array.from(this.pnrs.values());
  }

  /**
   * Get all tickets (for testing)
   */
  getAllTickets(): Ticket[] {
    return Array.from(this.tickets.values());
  }

  /**
   * Clear all data (for testing)
   */
  clear(): void {
    this.pnrs.clear();
    this.tickets.clear();
  }

  /**
   * Set error rate (for testing)
   */
  setErrorRate(rate: number): void {
    this.errorRate = Math.max(0, Math.min(1, rate));
  }
}
