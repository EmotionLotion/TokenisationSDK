/**
 * Cross-Pack Orchestration Integration Tests
 *
 * Tests the horizontal integration layer above the four independent pack engines:
 * - SharedIdentityRegistry: Cross-pack identity sharing
 * - CrossPackEventBus: Event-driven workflows
 * - SagaOrchestrator: Multi-step saga orchestration with compensation
 * - UnifiedAuditLog: Centralized audit logging
 */

import { describe, it, expect, beforeEach } from 'vitest';

// Orchestration layer
import {
  SharedIdentityRegistry,
  CrossPackEventBus,
  SagaOrchestrator,
  SagaExecutionStatus,
  UnifiedAuditLog,
} from '../../src/orchestration/index.js';
import type {
  IIdentityRegistry,
  ICrossPackEventBus,
  IAuditLog,
  CrossPackEvent,
  SagaDefinition,
} from '../../src/orchestration/index.js';

// Pack engines
import {
  AirlineTicketEngine,
  TicketClass,
  TicketStatus,
  AirlineRole,
} from '../../src/packs/AirlineTicket.js';
import type { ActorContext as AirlineActorContext } from '../../src/packs/AirlineTicket.js';

import {
  HotelReservationEngine,
  RoomType,
  HotelReservationStatus,
  HotelRole,
} from '../../src/packs/HotelReservation.js';
import type { ActorContext as HotelActorContext } from '../../src/packs/HotelReservation.js';

import {
  CarRentalEngine,
  VehicleCategory,
  CarRentalStatus,
  RentalRole,
} from '../../src/packs/CarRental.js';
import type { ActorContext as CarActorContext } from '../../src/packs/CarRental.js';

import {
  ConcertTicketEngine,
  SeatingTier,
  ConcertTicketStatus,
  VenueRole,
} from '../../src/packs/ConcertTicket.js';
import type { ActorContext as ConcertActorContext } from '../../src/packs/ConcertTicket.js';

// ============================================================================
// HELPERS
// ============================================================================

function futureDate(daysAhead: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString();
}

function createAirlineEngine(registry: IIdentityRegistry, bus: ICrossPackEventBus, audit: IAuditLog) {
  const engine = new AirlineTicketEngine({
    identityRegistry: registry,
    eventBus: bus,
    auditLog: audit,
  });
  engine.registerAirline('TEST-AIR');
  return engine;
}

function createHotelEngine(registry: IIdentityRegistry, bus: ICrossPackEventBus, audit: IAuditLog) {
  const engine = new HotelReservationEngine({
    identityRegistry: registry,
    eventBus: bus,
    auditLog: audit,
  });
  engine.registerHotel('TEST-HOTEL');
  return engine;
}

function createCarEngine(registry: IIdentityRegistry, bus: ICrossPackEventBus, audit: IAuditLog) {
  const engine = new CarRentalEngine({
    identityRegistry: registry,
    eventBus: bus,
    auditLog: audit,
  });
  engine.registerRentalCompany('TEST-CAR');
  return engine;
}

function createConcertEngine(registry: IIdentityRegistry, bus: ICrossPackEventBus, audit: IAuditLog) {
  const engine = new ConcertTicketEngine({
    identityRegistry: registry,
    eventBus: bus,
    auditLog: audit,
  });
  engine.registerVenue('TEST-VENUE');
  return engine;
}

const airlineAdmin: AirlineActorContext = {
  actorId: 'admin-1',
  role: AirlineRole.AIRLINE_ADMIN,
  airlineCode: 'TEST-AIR',
};

const hotelFrontDesk: HotelActorContext = {
  actorId: 'frontdesk-1',
  role: HotelRole.FRONT_DESK,
  hotelCode: 'TEST-HOTEL',
};

const carAgent: CarActorContext = {
  actorId: 'agent-1',
  role: RentalRole.RENTAL_AGENT,
  rentalCompanyCode: 'TEST-CAR',
};

const concertBoxOffice: ConcertActorContext = {
  actorId: 'boxoffice-1',
  role: VenueRole.BOX_OFFICE,
  venueCode: 'TEST-VENUE',
};

// ============================================================================
// TESTS
// ============================================================================

describe('Cross-Pack Orchestration', () => {
  let registry: SharedIdentityRegistry;
  let bus: CrossPackEventBus;
  let audit: UnifiedAuditLog;

  beforeEach(() => {
    registry = new SharedIdentityRegistry();
    bus = new CrossPackEventBus();
    audit = new UnifiedAuditLog();
  });

  // ==========================================================================
  // Scenario 1: Air-to-Road Saga
  // ==========================================================================
  describe('Air-to-Road Saga', () => {
    it('flight COMPLETED triggers car rental CONFIRM via saga', async () => {
      const airline = createAirlineEngine(registry, bus, audit);
      const car = createCarEngine(registry, bus, audit);

      // Create and confirm a car rental
      const rental = car.createRental({
        rentalCompanyCode: 'TEST-CAR',
        confirmationNumber: 'CR-001',
        driverName: 'John Doe',
        driverLicense: { number: 'DL123', state: 'CA', country: 'US', expiryDate: futureDate(365), class: 'C' },
        vehicleInfo: { vin: 'V1', make: 'Toyota', model: 'Camry', year: 2024, licensePlate: 'ABC123', color: 'White', category: VehicleCategory.SEDAN },
        rentalPeriod: { pickupDate: futureDate(7), returnDate: futureDate(10), pickupLocation: 'Airport', returnLocation: 'Airport' },
        pricing: { perDay: '50.00', total: '150.00', taxes: '15.00', currency: 'USD', deposit: '200.00', insuranceFee: '10.00', mileageAllowance: 300, overageFeePerMile: '0.25' },
      });
      expect(rental.success).toBe(true);
      const rentalId = rental.rental!.id;

      // Define saga: when airline flight completes, confirm the car rental
      const saga: SagaDefinition = {
        id: 'air-to-road',
        name: 'Air-to-Road Trip',
        triggerFilter: { source: 'AIRLINE', type: 'FLIGHT_COMPLETED' },
        steps: [
          {
            name: 'confirm-car-rental',
            packSource: 'CAR_RENTAL',
            action: async () => {
              car.confirmRental({ rentalId, actor: carAgent });
            },
          },
        ],
        compensations: [
          {
            name: 'cancel-car-rental',
            packSource: 'CAR_RENTAL',
            action: async () => {
              car.cancelRental({ rentalId, requestedBy: 'saga-compensation' });
            },
          },
        ],
      };

      const orchestrator = new SagaOrchestrator(bus);
      orchestrator.registerSaga(saga);
      orchestrator.start();

      // Publish a flight completed event
      bus.publish({
        source: 'AIRLINE',
        type: 'FLIGHT_COMPLETED',
        resourceId: 'ticket-123',
        data: { flightNumber: 'TA-100' },
        correlationId: 'trip-001',
      });

      // Allow async saga to complete
      await new Promise(r => setTimeout(r, 50));

      // The car rental should now be confirmed
      const updatedRental = car.getRental(rentalId);
      const metadata = updatedRental!.metadata as unknown as { status: string };
      expect(metadata.status).toBe(CarRentalStatus.CONFIRMED);

      orchestrator.stop();
    });

    it('saga execution log shows COMPLETED status', async () => {
      const orchestrator = new SagaOrchestrator(bus);
      orchestrator.registerSaga({
        id: 'simple-saga',
        name: 'Simple Saga',
        triggerFilter: { source: 'AIRLINE', type: 'FLIGHT_COMPLETED' },
        steps: [
          { name: 'step-1', packSource: 'TEST', action: async () => {} },
        ],
        compensations: [],
      });
      orchestrator.start();

      bus.publish({
        source: 'AIRLINE',
        type: 'FLIGHT_COMPLETED',
        resourceId: 'ticket-1',
        data: {},
      });

      await new Promise(r => setTimeout(r, 50));

      const executions = orchestrator.getExecutions();
      expect(executions.length).toBe(1);
      expect(executions[0].status).toBe(SagaExecutionStatus.COMPLETED);
      expect(executions[0].completedSteps).toContain('step-1');

      orchestrator.stop();
    });

    it('event bus has correlated events with shared tripId', () => {
      const tripId = 'trip-ABC';

      bus.publish({
        source: 'AIRLINE',
        type: 'FLIGHT_COMPLETED',
        resourceId: 'ticket-1',
        data: {},
        correlationId: tripId,
      });

      bus.publish({
        source: 'CAR_RENTAL',
        type: 'RENTAL_CONFIRMED',
        resourceId: 'rental-1',
        data: {},
        correlationId: tripId,
      });

      const correlated = bus.getCorrelatedEvents(tripId);
      expect(correlated.length).toBe(2);
      expect(correlated.map(e => e.source)).toContain('AIRLINE');
      expect(correlated.map(e => e.source)).toContain('CAR_RENTAL');
    });

    it('saga step timeout triggers compensation', async () => {
      let compensationRan = false;

      const orchestrator = new SagaOrchestrator(bus);
      orchestrator.registerSaga({
        id: 'timeout-saga',
        name: 'Timeout Saga',
        triggerFilter: { source: 'AIRLINE', type: 'TIMEOUT_TEST' },
        steps: [
          {
            name: 'slow-step',
            packSource: 'TEST',
            action: async () => {
              await new Promise(r => setTimeout(r, 500));
            },
            timeoutMs: 10,
          },
        ],
        compensations: [
          {
            name: 'compensate-slow',
            packSource: 'TEST',
            action: async () => {
              compensationRan = true;
            },
          },
        ],
      });
      orchestrator.start();

      bus.publish({
        source: 'AIRLINE',
        type: 'TIMEOUT_TEST',
        resourceId: 'ticket-1',
        data: {},
      });

      await new Promise(r => setTimeout(r, 200));

      const executions = orchestrator.getExecutions();
      expect(executions[0].status).toBe(SagaExecutionStatus.FAILED);
      expect(executions[0].error).toContain('timed out');
      expect(compensationRan).toBe(true);

      orchestrator.stop();
    });
  });

  // ==========================================================================
  // Scenario 2: Identity-Linked Check-In
  // ==========================================================================
  describe('Identity-Linked Check-In', () => {
    const identityHash = 'PASSPORT:US:ABC123';

    it('airline verifies identity, hotel auto-approves transfer using shared registry', () => {
      const airline = createAirlineEngine(registry, bus, audit);
      const hotel = createHotelEngine(registry, bus, audit);

      // Airline verifies the identity
      airline.verifyIdentity(identityHash);

      // Identity should be verified in the shared registry
      expect(registry.isVerified(identityHash)).toBe(true);

      // Hotel creates a reservation and attempts transfer with same identity
      const res = hotel.createReservation({
        hotelCode: 'TEST-HOTEL',
        confirmationNumber: 'HR-001',
        guestName: 'Alice',
        roomType: RoomType.STANDARD,
        checkInDate: futureDate(30),
        checkOutDate: futureDate(33),
        rate: { perNight: '100.00', total: '300.00', taxes: '30.00', currency: 'USD', rateType: 'STANDARD' },
      });
      expect(res.success).toBe(true);
      const reservationId = res.reservation!.id;

      // Confirm the reservation
      hotel.confirmReservation({ reservationId, actor: hotelFrontDesk });

      // Transfer with verified identity should auto-approve
      const transfer = hotel.requestTransfer({
        reservationId,
        fromGuest: 'Alice',
        toGuest: {
          name: 'Bob',
          identity: { type: 'PASSPORT', number: 'ABC123', country: 'US', expiryDate: futureDate(365) },
        },
        reason: 'Change of plans',
      });

      expect(transfer.success).toBe(true);
      expect(transfer.request!.status).toBe('AUTO_APPROVED');
    });

    it('isVerifiedBy returns true for AIRLINE, false for HOTEL', () => {
      const airline = createAirlineEngine(registry, bus, audit);

      airline.verifyIdentity(identityHash);

      expect(registry.isVerifiedBy(identityHash, 'AIRLINE')).toBe(true);
      expect(registry.isVerifiedBy(identityHash, 'HOTEL')).toBe(false);
    });

    it('getVerifications returns single AIRLINE entry', () => {
      const airline = createAirlineEngine(registry, bus, audit);
      airline.verifyIdentity(identityHash);

      const verifications = registry.getVerifications(identityHash);
      expect(verifications.length).toBe(1);
      expect(verifications[0].source).toBe('AIRLINE');
      expect(verifications[0].identityHash).toBe(identityHash);
    });

    it('multiple sources can verify same identity independently', () => {
      const airline = createAirlineEngine(registry, bus, audit);
      const hotel = createHotelEngine(registry, bus, audit);

      airline.verifyIdentity(identityHash);
      hotel.verifyIdentity(identityHash);

      const verifications = registry.getVerifications(identityHash);
      expect(verifications.length).toBe(2);
      expect(verifications.map(v => v.source).sort()).toEqual(['AIRLINE', 'HOTEL']);

      // Deduplication: verifying again from same source should not add another entry
      airline.verifyIdentity(identityHash);
      expect(registry.getVerifications(identityHash).length).toBe(2);
    });
  });

  // ==========================================================================
  // Scenario 3: Circuit Breaker / Anti-Scalping
  // ==========================================================================
  describe('Circuit Breaker / Anti-Scalping', () => {
    it('concert ticket resale above price cap denied + logged to audit', () => {
      const concert = createConcertEngine(registry, bus, audit);

      const ticket = concert.createTicket({
        venueCode: 'TEST-VENUE',
        confirmationNumber: 'CT-001',
        eventInfo: { eventName: 'Rock Concert', artist: 'The Band', eventDate: futureDate(30), eventTime: '20:00' },
        seating: { section: 'A', row: '1', seat: '1', tier: SeatingTier.VIP },
        pricing: { faceValue: '100.00', serviceFee: '10.00', total: '110.00', currency: 'USD' },
        fanInfo: { fanName: 'Alice' },
        antiScalping: { maxResalePercent: 10 },
      });
      expect(ticket.success).toBe(true);
      const ticketId = ticket.ticket!.id;

      // Issue the ticket
      concert.issueTicket({ ticketId, actor: concertBoxOffice });

      // Verify identity for the new fan
      concert.verifyIdentity('PASSPORT:US:XYZ789');

      // Try to transfer at price above cap ($100 * 1.10 = $110 max)
      const result = concert.requestTransfer({
        ticketId,
        fromFan: 'Alice',
        toFan: { name: 'Scalper', identity: { type: 'PASSPORT', number: 'XYZ789', country: 'US', expiryDate: futureDate(365) } },
        resalePrice: '200.00',
        reason: 'Resale',
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('RESALE_PRICE_CAP_EXCEEDED');
    });

    it('audit log entry has success=false and reason', () => {
      const concert = createConcertEngine(registry, bus, audit);

      const ticket = concert.createTicket({
        venueCode: 'TEST-VENUE',
        confirmationNumber: 'CT-002',
        eventInfo: { eventName: 'Rock Concert', artist: 'The Band', eventDate: futureDate(30), eventTime: '20:00' },
        seating: { section: 'B', row: '2', seat: '2', tier: SeatingTier.RESERVED },
        pricing: { faceValue: '50.00', serviceFee: '5.00', total: '55.00', currency: 'USD' },
        fanInfo: { fanName: 'Charlie' },
        antiScalping: { maxResalePercent: 10 },
      });
      const ticketId = ticket.ticket!.id;
      concert.issueTicket({ ticketId, actor: concertBoxOffice });

      concert.requestTransfer({
        ticketId,
        fromFan: 'Charlie',
        toFan: { name: 'Dave' },
        resalePrice: '500.00',
        reason: 'Resale',
      });

      const deniedEntries = audit.query({ success: false, source: 'CONCERT' });
      expect(deniedEntries.length).toBeGreaterThanOrEqual(1);
      expect(deniedEntries[0].reason).toContain('exceeds cap');
      expect(deniedEntries[0].action).toBe('TRANSFER_DENIED');
    });

    it('event bus has no transfer event when operation was denied', () => {
      const concert = createConcertEngine(registry, bus, audit);

      const ticket = concert.createTicket({
        venueCode: 'TEST-VENUE',
        confirmationNumber: 'CT-003',
        eventInfo: { eventName: 'Rock Concert', artist: 'The Band', eventDate: futureDate(30), eventTime: '20:00' },
        seating: { section: 'C', row: '3', seat: '3', tier: SeatingTier.GENERAL_ADMISSION },
        pricing: { faceValue: '30.00', serviceFee: '3.00', total: '33.00', currency: 'USD' },
        fanInfo: { fanName: 'Eve' },
      });
      const ticketId = ticket.ticket!.id;
      concert.issueTicket({ ticketId, actor: concertBoxOffice });

      concert.requestTransfer({
        ticketId,
        fromFan: 'Eve',
        toFan: { name: 'Frank' },
        resalePrice: '999.00',
        reason: 'Resale',
      });

      const transferEvents = bus.getEvents({ type: 'TICKET_TRANSFERRED' });
      expect(transferEvents.length).toBe(0);
    });

    it('auditor can query denied operations by source and correlationId', () => {
      const tripId = 'trip-audit-test';

      audit.log({
        source: 'CONCERT',
        action: 'TRANSFER_DENIED',
        actorId: 'fan-1',
        resourceId: 'ticket-abc',
        success: false,
        reason: 'Resale price cap exceeded',
        correlationId: tripId,
      });

      audit.log({
        source: 'AIRLINE',
        action: 'TRANSFER_DENIED',
        actorId: 'pax-1',
        resourceId: 'ticket-def',
        success: false,
        reason: 'Max transfers exceeded',
        correlationId: tripId,
      });

      const concertDenied = audit.query({ source: 'CONCERT', success: false });
      expect(concertDenied.length).toBe(1);

      const tripDenied = audit.getByCorrelation(tripId);
      expect(tripDenied.length).toBe(2);
    });
  });

  // ==========================================================================
  // Saga Compensation
  // ==========================================================================
  describe('Saga Compensation', () => {
    it('step fails mid-saga, compensations run in reverse', async () => {
      const compensationOrder: string[] = [];

      const orchestrator = new SagaOrchestrator(bus);
      orchestrator.registerSaga({
        id: 'fail-saga',
        name: 'Failing Saga',
        triggerFilter: { source: 'TEST', type: 'TRIGGER' },
        steps: [
          { name: 'step-A', packSource: 'A', action: async () => {} },
          { name: 'step-B', packSource: 'B', action: async () => { throw new Error('Step B failed'); } },
          { name: 'step-C', packSource: 'C', action: async () => {} },
        ],
        compensations: [
          { name: 'comp-A', packSource: 'A', action: async () => { compensationOrder.push('A'); } },
          { name: 'comp-B', packSource: 'B', action: async () => { compensationOrder.push('B'); } },
        ],
      });
      orchestrator.start();

      bus.publish({ source: 'TEST', type: 'TRIGGER', resourceId: 'r1', data: {} });
      await new Promise(r => setTimeout(r, 50));

      const exec = orchestrator.getExecutions()[0];
      expect(exec.status).toBe(SagaExecutionStatus.FAILED);
      expect(exec.completedSteps).toEqual(['step-A']);
      // Compensations run in reverse order
      expect(compensationOrder).toEqual(['B', 'A']);

      orchestrator.stop();
    });

    it('compensation failure is logged but does not prevent other compensations', async () => {
      const compensationOrder: string[] = [];

      const orchestrator = new SagaOrchestrator(bus);
      orchestrator.registerSaga({
        id: 'comp-fail-saga',
        name: 'Compensation Failure Saga',
        triggerFilter: { source: 'TEST', type: 'COMP_FAIL' },
        steps: [
          { name: 'step-1', packSource: 'X', action: async () => { throw new Error('Fail'); } },
        ],
        compensations: [
          { name: 'comp-1', packSource: 'X', action: async () => { throw new Error('Comp 1 failed'); } },
          { name: 'comp-2', packSource: 'Y', action: async () => { compensationOrder.push('comp-2'); } },
        ],
      });
      orchestrator.start();

      bus.publish({ source: 'TEST', type: 'COMP_FAIL', resourceId: 'r1', data: {} });
      await new Promise(r => setTimeout(r, 50));

      // comp-2 should still have run despite comp-1 failing (reverse order: comp-2 first, then comp-1)
      expect(compensationOrder).toContain('comp-2');

      // Check that the compensation failure was logged
      const sagaLog = orchestrator.getSagaLog();
      const failedCompSteps = sagaLog.filter(l => l.action === 'COMPENSATION_STEP_FAILED');
      expect(failedCompSteps.length).toBeGreaterThanOrEqual(1);

      orchestrator.stop();
    });

    it('saga status transitions: RUNNING -> COMPENSATING -> FAILED', async () => {
      const orchestrator = new SagaOrchestrator(bus);
      orchestrator.registerSaga({
        id: 'status-saga',
        name: 'Status Saga',
        triggerFilter: { source: 'TEST', type: 'STATUS_TEST' },
        steps: [
          { name: 'fail-step', packSource: 'X', action: async () => { throw new Error('Fail'); } },
        ],
        compensations: [
          { name: 'comp-1', packSource: 'X', action: async () => {} },
        ],
      });
      orchestrator.start();

      bus.publish({ source: 'TEST', type: 'STATUS_TEST', resourceId: 'r1', data: {} });
      await new Promise(r => setTimeout(r, 50));

      const sagaLog = orchestrator.getSagaLog();
      const actions = sagaLog.map(l => l.action);

      expect(actions).toContain('SAGA_STARTED');
      expect(actions).toContain('STEP_FAILED');
      expect(actions).toContain('COMPENSATION_STARTED');
      expect(actions).toContain('SAGA_FAILED');

      const exec = orchestrator.getExecutions()[0];
      expect(exec.status).toBe(SagaExecutionStatus.FAILED);

      orchestrator.stop();
    });
  });

  // ==========================================================================
  // Event Correlation
  // ==========================================================================
  describe('Event Correlation', () => {
    it('events from 3+ packs linked by correlationId', () => {
      const tripId = 'trip-XYZ';

      bus.publish({ source: 'AIRLINE', type: 'FLIGHT_BOOKED', resourceId: 'ticket-1', data: {}, correlationId: tripId });
      bus.publish({ source: 'HOTEL', type: 'RESERVATION_CREATED', resourceId: 'res-1', data: {}, correlationId: tripId });
      bus.publish({ source: 'CAR_RENTAL', type: 'RENTAL_CREATED', resourceId: 'rental-1', data: {}, correlationId: tripId });

      const correlated = bus.getCorrelatedEvents(tripId);
      expect(correlated.length).toBe(3);
      const sources = correlated.map(e => e.source).sort();
      expect(sources).toEqual(['AIRLINE', 'CAR_RENTAL', 'HOTEL']);
    });

    it('getCorrelatedEvents returns cross-pack set', () => {
      const tripId = 'trip-full';

      bus.publish({ source: 'AIRLINE', type: 'FLIGHT_COMPLETED', resourceId: 't1', data: {}, correlationId: tripId });
      bus.publish({ source: 'HOTEL', type: 'CHECK_IN_COMPLETED', resourceId: 'r1', data: {}, correlationId: tripId });
      bus.publish({ source: 'CONCERT', type: 'TICKET_ISSUED', resourceId: 'c1', data: {}, correlationId: tripId });

      const events = bus.getCorrelatedEvents(tripId);
      expect(events.length).toBe(3);
      expect(events.every(e => e.correlationId === tripId)).toBe(true);
    });

    it('independent trips do not leak events', () => {
      bus.publish({ source: 'AIRLINE', type: 'FLIGHT_BOOKED', resourceId: 't1', data: {}, correlationId: 'trip-A' });
      bus.publish({ source: 'HOTEL', type: 'RESERVATION_CREATED', resourceId: 'r1', data: {}, correlationId: 'trip-B' });

      const tripA = bus.getCorrelatedEvents('trip-A');
      expect(tripA.length).toBe(1);
      expect(tripA[0].source).toBe('AIRLINE');

      const tripB = bus.getCorrelatedEvents('trip-B');
      expect(tripB.length).toBe(1);
      expect(tripB[0].source).toBe('HOTEL');
    });
  });

  // ==========================================================================
  // Concurrent Execution
  // ==========================================================================
  describe('Concurrent Execution', () => {
    it('two saga instances from same definition run independently', async () => {
      let stepACount = 0;

      const orchestrator = new SagaOrchestrator(bus);
      orchestrator.registerSaga({
        id: 'concurrent-saga',
        name: 'Concurrent Saga',
        triggerFilter: { source: 'TEST', type: 'CONCURRENT' },
        steps: [
          { name: 'step-A', packSource: 'X', action: async () => { stepACount++; } },
        ],
        compensations: [],
      });
      orchestrator.start();

      bus.publish({ source: 'TEST', type: 'CONCURRENT', resourceId: 'r1', data: {}, correlationId: 'c1' });
      bus.publish({ source: 'TEST', type: 'CONCURRENT', resourceId: 'r2', data: {}, correlationId: 'c2' });

      await new Promise(r => setTimeout(r, 50));

      const executions = orchestrator.getExecutionsBySaga('concurrent-saga');
      expect(executions.length).toBe(2);
      expect(executions.every(e => e.status === SagaExecutionStatus.COMPLETED)).toBe(true);
      expect(stepACount).toBe(2);

      orchestrator.stop();
    });

    it('each tracks its own completedSteps and status', async () => {
      const orchestrator = new SagaOrchestrator(bus);
      let callCount = 0;

      orchestrator.registerSaga({
        id: 'tracking-saga',
        name: 'Tracking Saga',
        triggerFilter: { source: 'TEST', type: 'TRACK' },
        steps: [
          {
            name: 'conditional-step',
            packSource: 'X',
            action: async () => {
              callCount++;
              if (callCount === 2) throw new Error('Second fails');
            },
          },
        ],
        compensations: [
          { name: 'comp-1', packSource: 'X', action: async () => {} },
        ],
      });
      orchestrator.start();

      bus.publish({ source: 'TEST', type: 'TRACK', resourceId: 'r1', data: {} });
      bus.publish({ source: 'TEST', type: 'TRACK', resourceId: 'r2', data: {} });

      await new Promise(r => setTimeout(r, 50));

      const executions = orchestrator.getExecutions();
      expect(executions.length).toBe(2);

      const completed = executions.filter(e => e.status === SagaExecutionStatus.COMPLETED);
      const failed = executions.filter(e => e.status === SagaExecutionStatus.FAILED);
      expect(completed.length).toBe(1);
      expect(failed.length).toBe(1);
      expect(completed[0].completedSteps).toEqual(['conditional-step']);
      expect(failed[0].error).toContain('Second fails');

      orchestrator.stop();
    });
  });
});
