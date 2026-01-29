/**
 * DO (Domain Object) Conformance Tests
 *
 * Validates that all 5 use case packs conform to the expected domain object
 * patterns: state machine, RBAC, transfers, freeze, metadata versioning,
 * events, cancellation, and idempotency.
 *
 * Use Cases:
 * 1. Airline Tickets
 * 2. Hotel Reservations
 * 3. Car Rentals
 * 4. Concert Tickets
 * 5. Real Estate (UAERealEstatePack via core SDK)
 */

import { describe, it, expect, beforeEach } from 'vitest';

// --- Airline ---
import {
  AirlineTicketEngine,
  TicketClass,
  TicketStatus,
  AirlineRole,
  TransferReason,
  AirlineEventType,
  type ActorContext as AirlineActor,
  type FlightSegment,
} from '../../src/packs/AirlineTicket.js';

// --- Hotel ---
import {
  HotelReservationEngine,
  RoomType,
  HotelReservationStatus,
  HotelRole,
  HotelEventType,
  type ActorContext as HotelActor,
  type HotelReservationMetadata,
} from '../../src/packs/HotelReservation.js';

// --- Car Rental ---
import {
  CarRentalEngine,
  VehicleCategory,
  CarRentalStatus,
  DepositStatus,
  RentalRole,
  CarRentalEventType,
  type ActorContext as CarActor,
  type CarRentalMetadata,
} from '../../src/packs/CarRental.js';

// --- Concert ---
import {
  ConcertTicketEngine,
  SeatingTier,
  ConcertTicketStatus,
  VenueRole,
  ConcertTicketEventType,
  type ActorContext as ConcertActor,
  type ConcertTicketMetadata,
} from '../../src/packs/ConcertTicket.js';

// --- Real Estate (core SDK) ---
import { TokenisationSDK, RightType, LifecycleState } from '../../src/SDK.js';

// =============================================================================
// SHARED FIXTURES
// =============================================================================

function futureDate(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

// =============================================================================
// 1. AIRLINE TICKET CONFORMANCE
// =============================================================================
describe('DO Conformance: Airline Tickets', () => {
  let engine: AirlineTicketEngine;
  const CODE = 'EK';

  const admin: AirlineActor = { actorId: 'admin-1', role: AirlineRole.AIRLINE_ADMIN, airlineCode: CODE };
  const agent: AirlineActor = { actorId: 'agent-1', role: AirlineRole.AIRLINE_AGENT, airlineCode: CODE };
  const pax: AirlineActor = { actorId: 'John Doe', role: AirlineRole.PASSENGER, passengerId: 'John Doe' };
  const auditor: AirlineActor = { actorId: 'aud-1', role: AirlineRole.AUDITOR };

  const segment: FlightSegment = {
    flightNumber: 'EK001',
    airline: CODE,
    departure: { airport: 'DXB', terminal: 'T3', dateTime: futureDate(7) },
    arrival: { airport: 'LHR', terminal: 'T3', dateTime: futureDate(7.3) },
    class: TicketClass.BUSINESS,
    seatNumber: '1A',
  };

  const params = {
    airlineCode: CODE,
    bookingReference: 'CONF-001',
    eTicketNumber: '176-0000000001',
    passengerName: 'John Doe',
    segments: [segment],
    fare: { baseFare: '1000.00', taxes: '200.00', total: '1200.00', currency: 'USD', fareClass: 'J', fareRules: [] },
    transferRules: { maxTransfers: 2, transferCount: 0, nameChangeFee: '50.00', requiresIssuerApproval: true, autoApproveWithIdentity: true, transferDeadlineHours: 24 },
    cancellationRules: { refundable: true, cancellationFee: '100.00', cancellationDeadlineHours: 48, refundCurrency: 'USD' },
  };

  beforeEach(() => {
    engine = new AirlineTicketEngine();
    engine.registerAirline(CODE);
  });

  // --- State machine conformance ---
  describe('State Machine', () => {
    it('should follow ISSUED → CHECKED_IN → BOARDED lifecycle', async () => {
      const { ticket } = engine.issue(params);
      expect((ticket!.metadata as any).status).toBe(TicketStatus.ISSUED);

      engine.checkIn({ ticketId: ticket!.id, actor: pax });
      expect((engine.getTicket(ticket!.id)!.metadata as any).status).toBe(TicketStatus.CHECKED_IN);

      await engine.board({ ticketId: ticket!.id, actor: agent });
      expect((engine.getTicket(ticket!.id)!.metadata as any).status).toBe(TicketStatus.BOARDED);
    });

    it('should reject invalid state transitions', async () => {
      const { ticket } = engine.issue(params);
      // Cannot board without check-in
      const r = await engine.board({ ticketId: ticket!.id, actor: agent });
      expect(r.success).toBe(false);
    });

    it('should reject operations on cancelled tickets', () => {
      const { ticket } = engine.issue(params);
      engine.cancel({ ticketId: ticket!.id, requestedBy: 'John Doe' });
      const r = engine.checkIn({ ticketId: ticket!.id, actor: pax });
      expect(r.success).toBe(false);
    });
  });

  // --- RBAC conformance ---
  describe('RBAC', () => {
    it('should deny auditor from check-in', () => {
      const { ticket } = engine.issue(params);
      expect(() => engine.checkIn({ ticketId: ticket!.id, actor: auditor })).toThrow('PERMISSION_DENIED');
    });

    it('should deny wrong-airline agent from boarding', async () => {
      const { ticket } = engine.issue(params);
      engine.checkIn({ ticketId: ticket!.id, actor: pax });
      const wrongAgent: AirlineActor = { actorId: 'x', role: AirlineRole.AIRLINE_AGENT, airlineCode: 'QR' };
      await expect(engine.board({ ticketId: ticket!.id, actor: wrongAgent })).rejects.toThrow();
    });
  });

  // --- Transfer conformance ---
  describe('Transfers', () => {
    it('should allow pre-check-in transfer', async () => {
      const { ticket } = engine.issue(params);
      const r = await engine.requestTransfer({ ticketId: ticket!.id, fromPassenger: 'John Doe', toPassenger: { name: 'Jane Doe' }, reason: TransferReason.GIFT });
      expect(r.success).toBe(true);
    });

    it('should block post-check-in transfer', async () => {
      const { ticket } = engine.issue(params);
      engine.checkIn({ ticketId: ticket!.id, actor: pax });
      const r = await engine.requestTransfer({ ticketId: ticket!.id, fromPassenger: 'John Doe', toPassenger: { name: 'Jane' }, reason: TransferReason.GIFT });
      expect(r.success).toBe(false);
      expect(r.errorCode).toBe('TICKET_LOCKED_AFTER_CHECKIN');
    });
  });

  // --- Freeze conformance ---
  describe('Freeze', () => {
    it('should freeze and block operations', async () => {
      const { ticket } = engine.issue(params);
      engine.freezeTicket({ ticketId: ticket!.id, actor: admin, reason: 'FRAUD' });
      const r = await engine.requestTransfer({ ticketId: ticket!.id, fromPassenger: 'John Doe', toPassenger: { name: 'X' }, reason: TransferReason.GIFT });
      expect(r.success).toBe(false);
    });

    it('should unfreeze and restore operations', async () => {
      const { ticket } = engine.issue(params);
      engine.freezeTicket({ ticketId: ticket!.id, actor: admin, reason: 'FRAUD' });
      engine.unfreezeTicket({ ticketId: ticket!.id, actor: admin });
      const r = await engine.requestTransfer({ ticketId: ticket!.id, fromPassenger: 'John Doe', toPassenger: { name: 'X' }, reason: TransferReason.GIFT });
      expect(r.success).toBe(true);
    });
  });

  // --- Metadata versioning conformance ---
  describe('Metadata Versioning', () => {
    it('should maintain hash chain integrity', async () => {
      const { ticket } = engine.issue(params);
      engine.checkIn({ ticketId: ticket!.id, actor: pax });
      await engine.board({ ticketId: ticket!.id, actor: agent });

      const versions = engine.getMetadataVersions(ticket!.id);
      expect(versions.length).toBe(3);
      for (let i = 1; i < versions.length; i++) {
        expect(versions[i].previousHash).toBe(versions[i - 1].currentHash);
      }
    });
  });

  // --- Event tracking conformance ---
  describe('Events', () => {
    it('should emit TICKET_ISSUED event on creation', () => {
      const { ticket } = engine.issue(params);
      const events = engine.getTicketEvents(ticket!.id);
      expect(events.some(e => e.type === AirlineEventType.TICKET_ISSUED)).toBe(true);
    });
  });

  // --- Double-spend prevention ---
  describe('Double-Spend Prevention', () => {
    it('should prevent double boarding', async () => {
      const { ticket } = engine.issue(params);
      engine.checkIn({ ticketId: ticket!.id, actor: pax });
      const r1 = await engine.board({ ticketId: ticket!.id, actor: agent });
      expect(r1.success).toBe(true);
      const r2 = await engine.board({ ticketId: ticket!.id, actor: agent });
      expect(r2.success).toBe(false);
    });
  });
});

// =============================================================================
// 2. HOTEL RESERVATION CONFORMANCE
// =============================================================================
describe('DO Conformance: Hotel Reservations', () => {
  let engine: HotelReservationEngine;
  const CODE = 'HILTON-DXB';

  const admin: HotelActor = { actorId: 'admin-1', role: HotelRole.HOTEL_ADMIN, hotelCode: CODE };
  const frontDesk: HotelActor = { actorId: 'fd-1', role: HotelRole.FRONT_DESK, hotelCode: CODE };
  const guest: HotelActor = { actorId: 'John Doe', role: HotelRole.GUEST, guestId: 'John Doe' };
  const auditor: HotelActor = { actorId: 'aud-1', role: HotelRole.AUDITOR };

  const params = {
    hotelCode: CODE,
    hotelName: 'Hilton Dubai Creek',
    confirmationNumber: 'HLT-CONF-001',
    guestName: 'John Doe',
    roomType: RoomType.DELUXE,
    checkInDate: futureDate(7),
    checkOutDate: futureDate(10),
    rate: { perNight: '200.00', total: '600.00', taxes: '60.00', currency: 'USD', rateType: 'BEST_AVAILABLE' },
    transferRules: { maxTransfers: 2, transferCount: 0, nameChangeFee: '25.00', transferDeadlineHours: 24, autoApproveWithIdentity: true },
    cancellationPolicy: { refundable: true, cancellationFee: '0.00', freeCancellationDeadlineHours: 24, penaltyPercentage: 100 },
  };

  beforeEach(() => {
    engine = new HotelReservationEngine();
    engine.registerHotel(CODE);
  });

  describe('State Machine', () => {
    it('should follow CREATED → CONFIRMED → CHECKED_IN → CHECKED_OUT → CLOSED', () => {
      const { reservation } = engine.createReservation(params);
      expect((reservation!.metadata as any).status).toBe(HotelReservationStatus.CREATED);

      engine.confirmReservation({ reservationId: reservation!.id, actor: frontDesk });
      expect((engine.getReservation(reservation!.id)!.metadata as any).status).toBe(HotelReservationStatus.CONFIRMED);

      engine.checkIn({ reservationId: reservation!.id, actor: frontDesk });
      expect((engine.getReservation(reservation!.id)!.metadata as any).status).toBe(HotelReservationStatus.CHECKED_IN);

      engine.checkOut({ reservationId: reservation!.id, actor: frontDesk });
      expect((engine.getReservation(reservation!.id)!.metadata as any).status).toBe(HotelReservationStatus.CHECKED_OUT);

      engine.closeReservation({ reservationId: reservation!.id, actor: frontDesk });
      expect((engine.getReservation(reservation!.id)!.metadata as any).status).toBe(HotelReservationStatus.CLOSED);
    });

    it('should reject check-in from CREATED (must confirm first)', () => {
      const { reservation } = engine.createReservation(params);
      const r = engine.checkIn({ reservationId: reservation!.id, actor: frontDesk });
      expect(r.success).toBe(false);
    });

    it('should reject check-out from CONFIRMED (must check-in first)', () => {
      const { reservation } = engine.createReservation(params);
      engine.confirmReservation({ reservationId: reservation!.id, actor: frontDesk });
      const r = engine.checkOut({ reservationId: reservation!.id, actor: frontDesk });
      expect(r.success).toBe(false);
    });
  });

  describe('RBAC', () => {
    it('should deny auditor from check-in', () => {
      const { reservation } = engine.createReservation(params);
      engine.confirmReservation({ reservationId: reservation!.id, actor: frontDesk });
      expect(() => engine.checkIn({ reservationId: reservation!.id, actor: auditor })).toThrow('PERMISSION_DENIED');
    });

    it('should deny guest from check-out', () => {
      const { reservation } = engine.createReservation(params);
      engine.confirmReservation({ reservationId: reservation!.id, actor: frontDesk });
      engine.checkIn({ reservationId: reservation!.id, actor: frontDesk });
      expect(() => engine.checkOut({ reservationId: reservation!.id, actor: guest })).toThrow('PERMISSION_DENIED');
    });
  });

  describe('Transfers', () => {
    it('should allow transfer before check-in', () => {
      const { reservation } = engine.createReservation(params);
      engine.confirmReservation({ reservationId: reservation!.id, actor: frontDesk });
      const r = engine.requestTransfer({ reservationId: reservation!.id, fromGuest: 'John Doe', toGuest: { name: 'Jane' }, reason: 'Gift' });
      expect(r.success).toBe(true);
    });

    it('should block transfer after check-in', () => {
      const { reservation } = engine.createReservation(params);
      engine.confirmReservation({ reservationId: reservation!.id, actor: frontDesk });
      engine.checkIn({ reservationId: reservation!.id, actor: frontDesk });
      const r = engine.requestTransfer({ reservationId: reservation!.id, fromGuest: 'John Doe', toGuest: { name: 'Jane' }, reason: 'Gift' });
      expect(r.success).toBe(false);
      expect(r.errorCode).toBe('RESERVATION_LOCKED_AFTER_CHECKIN');
    });
  });

  describe('Freeze', () => {
    it('should freeze and block check-in', () => {
      const { reservation } = engine.createReservation(params);
      engine.confirmReservation({ reservationId: reservation!.id, actor: frontDesk });
      engine.freezeReservation({ reservationId: reservation!.id, actor: admin, reason: 'Dispute' });
      const r = engine.checkIn({ reservationId: reservation!.id, actor: frontDesk });
      expect(r.success).toBe(false);
    });

    it('should unfreeze and restore operations', () => {
      const { reservation } = engine.createReservation(params);
      engine.confirmReservation({ reservationId: reservation!.id, actor: frontDesk });
      engine.freezeReservation({ reservationId: reservation!.id, actor: admin, reason: 'Dispute' });
      engine.unfreezeReservation({ reservationId: reservation!.id, actor: admin });
      const r = engine.checkIn({ reservationId: reservation!.id, actor: frontDesk });
      expect(r.success).toBe(true);
    });
  });

  describe('Metadata Versioning', () => {
    it('should maintain hash chain across lifecycle', () => {
      const { reservation } = engine.createReservation(params);
      engine.confirmReservation({ reservationId: reservation!.id, actor: frontDesk });
      engine.checkIn({ reservationId: reservation!.id, actor: frontDesk });
      engine.checkOut({ reservationId: reservation!.id, actor: frontDesk });

      const versions = engine.getMetadataVersions(reservation!.id);
      expect(versions.length).toBe(4);
      for (let i = 1; i < versions.length; i++) {
        expect(versions[i].previousHash).toBe(versions[i - 1].currentHash);
      }
    });
  });

  describe('Events', () => {
    it('should emit events for each state change', () => {
      const { reservation } = engine.createReservation(params);
      engine.confirmReservation({ reservationId: reservation!.id, actor: frontDesk });
      const events = engine.getReservationEvents(reservation!.id);
      const types = events.map(e => e.type);
      expect(types).toContain(HotelEventType.RESERVATION_CREATED);
      expect(types).toContain(HotelEventType.RESERVATION_CONFIRMED);
    });
  });

  describe('Double Check-in Prevention', () => {
    it('should be idempotent on repeated check-in', () => {
      const { reservation } = engine.createReservation(params);
      engine.confirmReservation({ reservationId: reservation!.id, actor: frontDesk });
      const r1 = engine.checkIn({ reservationId: reservation!.id, actor: frontDesk });
      expect(r1.success).toBe(true);
      expect(r1.alreadyCheckedIn).toBeFalsy();
      const r2 = engine.checkIn({ reservationId: reservation!.id, actor: frontDesk });
      expect(r2.success).toBe(true);
      expect(r2.alreadyCheckedIn).toBe(true);
    });
  });

  describe('Cancellation', () => {
    it('should allow cancellation of confirmed reservation with refund', () => {
      const { reservation } = engine.createReservation(params);
      engine.confirmReservation({ reservationId: reservation!.id, actor: frontDesk });
      const r = engine.cancelReservation({ reservationId: reservation!.id, requestedBy: 'John Doe', reason: 'Plans changed' });
      expect(r.success).toBe(true);
      expect(parseFloat(r.refundAmount!)).toBe(600.00);
    });

    it('should reject cancellation after check-in', () => {
      const { reservation } = engine.createReservation(params);
      engine.confirmReservation({ reservationId: reservation!.id, actor: frontDesk });
      engine.checkIn({ reservationId: reservation!.id, actor: frontDesk });
      const r = engine.cancelReservation({ reservationId: reservation!.id, requestedBy: 'John Doe' });
      expect(r.success).toBe(false);
    });
  });

  describe('No-Show', () => {
    it('should mark no-show for confirmed reservation', () => {
      const { reservation } = engine.createReservation(params);
      engine.confirmReservation({ reservationId: reservation!.id, actor: frontDesk });
      const r = engine.markNoShow({ reservationId: reservation!.id, actor: frontDesk });
      expect(r.success).toBe(true);
      expect((r.reservation!.metadata as any).status).toBe(HotelReservationStatus.NO_SHOW);
    });
  });
});

// =============================================================================
// 3. CAR RENTAL CONFORMANCE
// =============================================================================
describe('DO Conformance: Car Rentals', () => {
  let engine: CarRentalEngine;
  const CODE = 'HERTZ-LAX';

  const admin: CarActor = { actorId: 'admin-1', role: RentalRole.RENTAL_ADMIN, rentalCompanyCode: CODE };
  const agent: CarActor = { actorId: 'agent-1', role: RentalRole.RENTAL_AGENT, rentalCompanyCode: CODE };
  const driverActor: CarActor = { actorId: 'John Doe', role: RentalRole.DRIVER, driverId: 'John Doe' };
  const auditor: CarActor = { actorId: 'aud-1', role: RentalRole.AUDITOR };

  const params = {
    rentalCompanyCode: CODE,
    confirmationNumber: 'HTZ-CONF-001',
    driverName: 'John Doe',
    driverLicense: { number: 'DL-12345', state: 'CA', country: 'US', expiryDate: '2028-01-01', class: 'C' },
    vehicleInfo: { vin: '1HGBH41JXMN109186', make: 'Toyota', model: 'Camry', year: 2024, licensePlate: 'ABC-1234', color: 'Silver', category: VehicleCategory.SEDAN },
    rentalPeriod: { pickupDate: futureDate(7), returnDate: futureDate(10), pickupLocation: 'LAX', returnLocation: 'LAX' },
    pricing: { perDay: '75.00', total: '225.00', taxes: '30.00', currency: 'USD', deposit: '500.00', insuranceFee: '25.00', mileageAllowance: 150, overageFeePerMile: '0.35' },
    insurancePolicy: { provider: 'SafeDrive', policyNumber: 'INS-789', coverageType: 'FULL', verified: true },
    transferRules: { maxTransfers: 2, transferCount: 0, nameChangeFee: '25.00', transferDeadlineHours: 24, autoApproveWithIdentity: true },
    cancellationPolicy: { refundable: true, cancellationFee: '0.00', freeCancellationDeadlineHours: 24, penaltyPercentage: 100 },
  };

  beforeEach(() => {
    engine = new CarRentalEngine();
    engine.registerRentalCompany(CODE);
  });

  describe('State Machine', () => {
    it('should follow CREATED → CONFIRMED → PICKED_UP → RETURNED → INSPECTED', async () => {
      const { rental } = engine.createRental(params);
      expect((rental!.metadata as any).status).toBe(CarRentalStatus.CREATED);

      engine.confirmRental({ rentalId: rental!.id, actor: agent });
      expect((engine.getRental(rental!.id)!.metadata as any).status).toBe(CarRentalStatus.CONFIRMED);

      await engine.pickUp({ rentalId: rental!.id, actor: agent, mileageStart: 15000, fuelLevel: 100 });
      expect((engine.getRental(rental!.id)!.metadata as any).status).toBe(CarRentalStatus.PICKED_UP);

      engine.returnVehicle({ rentalId: rental!.id, actor: agent, mileageEnd: 15300, fuelLevel: 80 });
      expect((engine.getRental(rental!.id)!.metadata as any).status).toBe(CarRentalStatus.RETURNED);

      engine.inspectVehicle({ rentalId: rental!.id, actor: agent, inspectionResult: { passed: true } });
      expect((engine.getRental(rental!.id)!.metadata as any).status).toBe(CarRentalStatus.INSPECTED);
    });

    it('should reject pickup from CREATED (must confirm first)', async () => {
      const { rental } = engine.createRental(params);
      const r = await engine.pickUp({ rentalId: rental!.id, actor: agent });
      expect(r.success).toBe(false);
    });

    it('should reject return before pickup', () => {
      const { rental } = engine.createRental(params);
      engine.confirmRental({ rentalId: rental!.id, actor: agent });
      const r = engine.returnVehicle({ rentalId: rental!.id, actor: agent });
      expect(r.success).toBe(false);
    });
  });

  describe('RBAC', () => {
    it('should deny driver from pickup', async () => {
      const { rental } = engine.createRental(params);
      engine.confirmRental({ rentalId: rental!.id, actor: agent });
      await expect(engine.pickUp({ rentalId: rental!.id, actor: driverActor })).rejects.toThrow('PERMISSION_DENIED');
    });

    it('should deny auditor from pickup', async () => {
      const { rental } = engine.createRental(params);
      engine.confirmRental({ rentalId: rental!.id, actor: agent });
      await expect(engine.pickUp({ rentalId: rental!.id, actor: auditor })).rejects.toThrow('PERMISSION_DENIED');
    });
  });

  describe('Transfers', () => {
    it('should allow transfer before pickup', () => {
      const { rental } = engine.createRental(params);
      engine.confirmRental({ rentalId: rental!.id, actor: agent });
      const r = engine.requestTransfer({ rentalId: rental!.id, fromDriver: 'John Doe', toDriver: { name: 'Jane' }, reason: 'Schedule change' });
      expect(r.success).toBe(true);
    });

    it('should block transfer after pickup', async () => {
      const { rental } = engine.createRental(params);
      engine.confirmRental({ rentalId: rental!.id, actor: agent });
      await engine.pickUp({ rentalId: rental!.id, actor: agent });
      const r = engine.requestTransfer({ rentalId: rental!.id, fromDriver: 'John Doe', toDriver: { name: 'Jane' }, reason: 'Change' });
      expect(r.success).toBe(false);
      expect(r.errorCode).toBe('RENTAL_LOCKED_AFTER_PICKUP');
    });
  });

  describe('Freeze', () => {
    it('should freeze and block pickup', async () => {
      const { rental } = engine.createRental(params);
      engine.confirmRental({ rentalId: rental!.id, actor: agent });
      engine.freezeRental({ rentalId: rental!.id, actor: admin, reason: 'Dispute' });
      const r = await engine.pickUp({ rentalId: rental!.id, actor: agent });
      expect(r.success).toBe(false);
    });

    it('should unfreeze and restore', async () => {
      const { rental } = engine.createRental(params);
      engine.confirmRental({ rentalId: rental!.id, actor: agent });
      engine.freezeRental({ rentalId: rental!.id, actor: admin, reason: 'Dispute' });
      engine.unfreezeRental({ rentalId: rental!.id, actor: admin });
      const r = await engine.pickUp({ rentalId: rental!.id, actor: agent });
      expect(r.success).toBe(true);
    });
  });

  describe('Metadata Versioning', () => {
    it('should maintain hash chain across lifecycle', async () => {
      const { rental } = engine.createRental(params);
      engine.confirmRental({ rentalId: rental!.id, actor: agent });
      await engine.pickUp({ rentalId: rental!.id, actor: agent });
      engine.returnVehicle({ rentalId: rental!.id, actor: agent });

      const versions = engine.getMetadataVersions(rental!.id);
      expect(versions.length).toBe(4);
      for (let i = 1; i < versions.length; i++) {
        expect(versions[i].previousHash).toBe(versions[i - 1].currentHash);
      }
    });
  });

  describe('Events', () => {
    it('should emit events for each state change', async () => {
      const { rental } = engine.createRental(params);
      engine.confirmRental({ rentalId: rental!.id, actor: agent });
      await engine.pickUp({ rentalId: rental!.id, actor: agent });
      engine.returnVehicle({ rentalId: rental!.id, actor: agent });

      const events = engine.getRentalEvents(rental!.id);
      const types = events.map(e => e.type);
      expect(types).toContain(CarRentalEventType.RENTAL_CREATED);
      expect(types).toContain(CarRentalEventType.RENTAL_CONFIRMED);
      expect(types).toContain(CarRentalEventType.PICKUP_COMPLETED);
      expect(types).toContain(CarRentalEventType.RETURN_COMPLETED);
    });
  });

  describe('Deposit Management', () => {
    it('should release deposit on clean inspection', async () => {
      const { rental } = engine.createRental(params);
      engine.confirmRental({ rentalId: rental!.id, actor: agent });
      await engine.pickUp({ rentalId: rental!.id, actor: agent });
      engine.returnVehicle({ rentalId: rental!.id, actor: agent });
      const r = engine.inspectVehicle({ rentalId: rental!.id, actor: agent, inspectionResult: { passed: true } });
      expect(r.success).toBe(true);
      expect((r.rental!.metadata as any).deposit.status).toBe(DepositStatus.RELEASED);
    });

    it('should partially charge deposit on damage', async () => {
      const { rental } = engine.createRental(params);
      engine.confirmRental({ rentalId: rental!.id, actor: agent });
      await engine.pickUp({ rentalId: rental!.id, actor: agent });
      engine.returnVehicle({ rentalId: rental!.id, actor: agent });
      const r = engine.inspectVehicle({ rentalId: rental!.id, actor: agent, inspectionResult: { passed: false, damageFound: true, chargeAmount: '200.00', chargeReason: 'Scratch' } });
      expect(r.success).toBe(true);
      expect((r.rental!.metadata as any).deposit.status).toBe(DepositStatus.PARTIALLY_CHARGED);
    });
  });

  describe('Cancellation', () => {
    it('should allow cancellation with full refund', () => {
      const { rental } = engine.createRental(params);
      engine.confirmRental({ rentalId: rental!.id, actor: agent });
      const r = engine.cancelRental({ rentalId: rental!.id, requestedBy: 'John Doe', reason: 'Plans changed' });
      expect(r.success).toBe(true);
      expect(parseFloat(r.refundAmount!)).toBe(225.00);
    });

    it('should reject cancellation after pickup', async () => {
      const { rental } = engine.createRental(params);
      engine.confirmRental({ rentalId: rental!.id, actor: agent });
      await engine.pickUp({ rentalId: rental!.id, actor: agent });
      const r = engine.cancelRental({ rentalId: rental!.id, requestedBy: 'John Doe' });
      expect(r.success).toBe(false);
    });
  });
});

// =============================================================================
// 4. CONCERT TICKET CONFORMANCE
// =============================================================================
describe('DO Conformance: Concert Tickets', () => {
  let engine: ConcertTicketEngine;
  const CODE = 'MSG-NYC';

  const venueAdmin: ConcertActor = { actorId: 'admin-1', role: VenueRole.VENUE_ADMIN, venueCode: CODE };
  const boxOffice: ConcertActor = { actorId: 'bo-1', role: VenueRole.BOX_OFFICE, venueCode: CODE };
  const security: ConcertActor = { actorId: 'sec-1', role: VenueRole.SECURITY, venueCode: CODE };
  const fan: ConcertActor = { actorId: 'Alice', role: VenueRole.FAN, fanId: 'Alice' };
  const auditor: ConcertActor = { actorId: 'aud-1', role: VenueRole.AUDITOR };

  const params = {
    venueCode: CODE,
    venueName: 'Madison Square Garden',
    confirmationNumber: 'MSG-CONF-001',
    eventInfo: { eventName: 'Rock Concert', artist: 'The Rolling Stones', eventDate: futureDate(30), eventTime: '20:00' },
    seating: { section: 'A', row: '5', seat: '12', tier: SeatingTier.VIP },
    pricing: { faceValue: '250.00', serviceFee: '25.00', total: '275.00', currency: 'USD' },
    fanInfo: { fanName: 'Alice', ageVerified: true, fanAge: 25, fanClubMember: true },
    antiScalping: { maxResalePercent: 10 },
    transferRules: { maxTransfers: 2, transferCount: 0, nameChangeFee: '15.00', transferDeadlineHours: 24, autoApproveWithIdentity: true },
    cancellationPolicy: { refundable: true, cancellationFee: '0.00', freeCancellationDeadlineHours: 48, penaltyPercentage: 100 },
  };

  beforeEach(() => {
    engine = new ConcertTicketEngine();
    engine.registerVenue(CODE);
  });

  describe('State Machine', () => {
    it('should follow CREATED → ISSUED → ADMITTED → USED', () => {
      const { ticket } = engine.createTicket(params);
      expect((ticket!.metadata as any).status).toBe(ConcertTicketStatus.CREATED);

      engine.issueTicket({ ticketId: ticket!.id, actor: boxOffice });
      expect((engine.getTicket(ticket!.id)!.metadata as any).status).toBe(ConcertTicketStatus.ISSUED);

      engine.admitEntry({ ticketId: ticket!.id, actor: security });
      expect((engine.getTicket(ticket!.id)!.metadata as any).status).toBe(ConcertTicketStatus.ADMITTED);

      engine.completeEvent({ ticketId: ticket!.id, actor: venueAdmin });
      expect((engine.getTicket(ticket!.id)!.metadata as any).status).toBe(ConcertTicketStatus.USED);
    });

    it('should reject admission from CREATED (must issue first)', () => {
      const { ticket } = engine.createTicket(params);
      const r = engine.admitEntry({ ticketId: ticket!.id, actor: security });
      expect(r.success).toBe(false);
    });

    it('should reject complete from ISSUED (must admit first)', () => {
      const { ticket } = engine.createTicket(params);
      engine.issueTicket({ ticketId: ticket!.id, actor: boxOffice });
      const r = engine.completeEvent({ ticketId: ticket!.id, actor: venueAdmin });
      expect(r.success).toBe(false);
    });
  });

  describe('RBAC', () => {
    it('should deny fan from admitting', () => {
      const { ticket } = engine.createTicket(params);
      engine.issueTicket({ ticketId: ticket!.id, actor: boxOffice });
      expect(() => engine.admitEntry({ ticketId: ticket!.id, actor: fan })).toThrow('PERMISSION_DENIED');
    });

    it('should deny auditor from modifying', () => {
      const { ticket } = engine.createTicket(params);
      engine.issueTicket({ ticketId: ticket!.id, actor: boxOffice });
      expect(() => engine.modifyTicket({ ticketId: ticket!.id, changes: { seat: '20' }, actor: auditor })).toThrow('PERMISSION_DENIED');
    });
  });

  describe('Transfers', () => {
    it('should allow transfer before admission', () => {
      const { ticket } = engine.createTicket(params);
      engine.issueTicket({ ticketId: ticket!.id, actor: boxOffice });
      const r = engine.requestTransfer({ ticketId: ticket!.id, fromFan: 'Alice', toFan: { name: 'Bob' }, reason: 'Gift' });
      expect(r.success).toBe(true);
    });

    it('should block transfer after admission', () => {
      const { ticket } = engine.createTicket(params);
      engine.issueTicket({ ticketId: ticket!.id, actor: boxOffice });
      engine.admitEntry({ ticketId: ticket!.id, actor: security });
      const r = engine.requestTransfer({ ticketId: ticket!.id, fromFan: 'Alice', toFan: { name: 'Bob' }, reason: 'Gift' });
      expect(r.success).toBe(false);
      expect(r.errorCode).toBe('TICKET_LOCKED_AFTER_ADMISSION');
    });
  });

  describe('Anti-Scalping', () => {
    it('should allow resale at face value', () => {
      const { ticket } = engine.createTicket(params);
      engine.issueTicket({ ticketId: ticket!.id, actor: boxOffice });
      const r = engine.requestTransfer({ ticketId: ticket!.id, fromFan: 'Alice', toFan: { name: 'Bob' }, resalePrice: '250.00', reason: 'Resale' });
      expect(r.success).toBe(true);
    });

    it('should reject resale above price cap', () => {
      const { ticket } = engine.createTicket(params);
      engine.issueTicket({ ticketId: ticket!.id, actor: boxOffice });
      const r = engine.requestTransfer({ ticketId: ticket!.id, fromFan: 'Alice', toFan: { name: 'Bob' }, resalePrice: '300.00', reason: 'Scalp' });
      expect(r.success).toBe(false);
      expect(r.errorCode).toBe('RESALE_PRICE_CAP_EXCEEDED');
    });
  });

  describe('Freeze', () => {
    it('should freeze and block operations', () => {
      const { ticket } = engine.createTicket(params);
      engine.issueTicket({ ticketId: ticket!.id, actor: boxOffice });
      engine.freezeTicket({ ticketId: ticket!.id, actor: venueAdmin, reason: 'Fraud' });
      const r = engine.requestTransfer({ ticketId: ticket!.id, fromFan: 'Alice', toFan: { name: 'Bob' }, reason: 'Gift' });
      expect(r.success).toBe(false);
    });

    it('should unfreeze and restore', () => {
      const { ticket } = engine.createTicket(params);
      engine.issueTicket({ ticketId: ticket!.id, actor: boxOffice });
      engine.freezeTicket({ ticketId: ticket!.id, actor: venueAdmin, reason: 'Fraud' });
      engine.unfreezeTicket({ ticketId: ticket!.id, actor: venueAdmin });
      const r = engine.modifyTicket({ ticketId: ticket!.id, changes: { seat: '20' }, actor: boxOffice });
      expect(r.success).toBe(true);
    });
  });

  describe('Metadata Versioning', () => {
    it('should maintain hash chain across lifecycle', () => {
      const { ticket } = engine.createTicket(params);
      engine.issueTicket({ ticketId: ticket!.id, actor: boxOffice });
      engine.admitEntry({ ticketId: ticket!.id, actor: security });
      engine.completeEvent({ ticketId: ticket!.id, actor: venueAdmin });

      const versions = engine.getMetadataVersions(ticket!.id);
      expect(versions.length).toBe(4);
      for (let i = 1; i < versions.length; i++) {
        expect(versions[i].previousHash).toBe(versions[i - 1].currentHash);
      }
    });
  });

  describe('Events', () => {
    it('should emit events for each state change', () => {
      const { ticket } = engine.createTicket(params);
      engine.issueTicket({ ticketId: ticket!.id, actor: boxOffice });
      engine.admitEntry({ ticketId: ticket!.id, actor: security });

      const events = engine.getTicketEvents(ticket!.id);
      const types = events.map(e => e.type);
      expect(types).toContain(ConcertTicketEventType.TICKET_CREATED);
      expect(types).toContain(ConcertTicketEventType.TICKET_ISSUED);
      expect(types).toContain(ConcertTicketEventType.ENTRY_ADMITTED);
    });
  });

  describe('Double Admission Prevention', () => {
    it('should be idempotent on repeated admission', () => {
      const { ticket } = engine.createTicket(params);
      engine.issueTicket({ ticketId: ticket!.id, actor: boxOffice });
      const r1 = engine.admitEntry({ ticketId: ticket!.id, actor: security });
      expect(r1.alreadyAdmitted).toBeFalsy();
      const r2 = engine.admitEntry({ ticketId: ticket!.id, actor: security });
      expect(r2.alreadyAdmitted).toBe(true);
    });
  });

  describe('Cancellation', () => {
    it('should allow cancellation with refund', () => {
      const { ticket } = engine.createTicket(params);
      engine.issueTicket({ ticketId: ticket!.id, actor: boxOffice });
      const r = engine.cancelTicket({ ticketId: ticket!.id, requestedBy: 'Alice', reason: 'Plans changed' });
      expect(r.success).toBe(true);
      expect(parseFloat(r.refundAmount!)).toBe(275.00);
    });

    it('should reject cancellation after admission', () => {
      const { ticket } = engine.createTicket(params);
      engine.issueTicket({ ticketId: ticket!.id, actor: boxOffice });
      engine.admitEntry({ ticketId: ticket!.id, actor: security });
      const r = engine.cancelTicket({ ticketId: ticket!.id, requestedBy: 'Alice' });
      expect(r.success).toBe(false);
    });
  });

  describe('Age Restriction', () => {
    it('should block underage fan transfer', () => {
      const { ticket } = engine.createTicket({ ...params, restrictions: { minimumAge: 18, leadBookerRequired: false, idRequiredAtEntry: false, maxResalePercent: 10 } });
      engine.issueTicket({ ticketId: ticket!.id, actor: boxOffice });
      const r = engine.requestTransfer({ ticketId: ticket!.id, fromFan: 'Alice', toFan: { name: 'Kid', age: 15 }, reason: 'Gift' });
      expect(r.success).toBe(false);
      expect(r.errorCode).toBe('AGE_RESTRICTION_FAILED');
    });
  });
});

// =============================================================================
// 5. REAL ESTATE CONFORMANCE (Core SDK)
// =============================================================================
describe('DO Conformance: Real Estate', () => {
  let sdk: TokenisationSDK;

  beforeEach(() => {
    sdk = new TokenisationSDK();
  });

  describe('Asset Lifecycle', () => {
    it('should create real estate asset with correct metadata', async () => {
      const asset = await sdk.assets.create({
        name: 'Marina Tower Unit 2501',
        rightType: RightType.OWNERSHIP,
        jurisdiction: { countryCode: 'AE', regulatoryFramework: 'UAE_VARA', accreditedOnly: false, blockedJurisdictions: ['KP', 'IR'] },
        issuerId: sdk.parties_.create({ type: 'ORGANIZATION' as any, roles: ['ISSUER' as any], name: 'Issuer Co', jurisdiction: 'AE' }).id,
        typedMetadata: {
          assetType: 'REAL_ESTATE',
          propertyType: 'RESIDENTIAL',
          address: { street: '2501 Marina Tower', city: 'Dubai', postalCode: '00000', country: 'AE' },
          area: { value: 150, unit: 'SQM' },
          valuationAmount: '5000000',
          valuationCurrency: 'AED',
          valuationDate: '2024-06-01',
        },
      });

      expect(asset.id).toBeDefined();
      expect(asset.name).toBe('Marina Tower Unit 2501');
      expect(asset.state).toBe(LifecycleState.DRAFT);
    });

    it('should transition DRAFT → PENDING_VERIFICATION', async () => {
      const issuer = sdk.parties_.create({ type: 'ORGANIZATION' as any, roles: ['ISSUER' as any], name: 'Issuer', jurisdiction: 'AE' });
      const verifier = sdk.parties_.create({ type: 'ORGANIZATION' as any, roles: ['VERIFIER' as any], name: 'DLD', jurisdiction: 'AE' });

      const asset = await sdk.assets.create({
        name: 'Test Property',
        rightType: RightType.OWNERSHIP,
        jurisdiction: { countryCode: 'AE' },
        issuerId: issuer.id,
      });

      const evidence = sdk.evidence.create({
        assetId: asset.id,
        type: 'LEGAL_DOCUMENT' as any,
        title: 'Title Deed',
        contentHash: 'sha256:' + 'a'.repeat(64),
        source: { type: 'GOVERNMENT_REGISTRY', identifier: 'dld', name: 'DLD', trusted: true, reputationScore: 100 },
      });

      await sdk.evidence.verify(evidence.id, verifier.id, 'DOCUMENT_REVIEW');
      const result = await sdk.assets.transition(asset.id, LifecycleState.PENDING_VERIFICATION, 'Submit for verification');

      expect(result.success).toBe(true);
      if (result.success) expect(result.data.state).toBe(LifecycleState.PENDING_VERIFICATION);
    });
  });

  describe('Token Operations', () => {
    it('should mint tokens for a verified asset', async () => {
      const issuer = sdk.parties_.create({ type: 'ORGANIZATION' as any, roles: ['ISSUER' as any], name: 'Issuer', jurisdiction: 'AE' });
      const verifier = sdk.parties_.create({ type: 'ORGANIZATION' as any, roles: ['VERIFIER' as any], name: 'DLD', jurisdiction: 'AE' });

      const asset = await sdk.assets.create({
        name: 'Mint Test Property',
        rightType: RightType.OWNERSHIP,
        jurisdiction: { countryCode: 'AE' },
        issuerId: issuer.id,
      });

      const evidence = sdk.evidence.create({
        assetId: asset.id,
        type: 'LEGAL_DOCUMENT' as any,
        title: 'Title Deed',
        contentHash: 'sha256:' + 'b'.repeat(64),
        source: { type: 'GOVERNMENT_REGISTRY', identifier: 'dld', name: 'DLD', trusted: true, reputationScore: 100 },
      });

      await sdk.evidence.verify(evidence.id, verifier.id, 'DOCUMENT_REVIEW');
      await sdk.assets.transition(asset.id, LifecycleState.PENDING_VERIFICATION, 'Submit');
      await sdk.assets.transition(asset.id, LifecycleState.VERIFIED, 'Verified');
      await sdk.assets.transition(asset.id, LifecycleState.ACTIVE, 'Activate');

      const mintResult = await sdk.tokens.mint(asset.id, '0x1234567890abcdef', '1000000');
      expect(mintResult).toBeDefined();
    });
  });

  describe('Compliance Policy', () => {
    it('should evaluate compliance rules for transfers', async () => {
      const result = await sdk.complianceEngine.evaluate(
        'token:transfer' as any,
        {
          senderId: 'sender-1',
          recipientId: 'receiver-1',
          assetId: 'asset-1',
          amount: '1000',
          jurisdiction: 'AE',
        } as any,
      );

      expect(result).toBeDefined();
      expect(result.decision).toBeDefined();
    });
  });

  describe('Event Store', () => {
    it('should record events for asset operations', async () => {
      const issuer = sdk.parties_.create({ type: 'ORGANIZATION' as any, roles: ['ISSUER' as any], name: 'Event Test Issuer', jurisdiction: 'AE' });

      const asset = await sdk.assets.create({
        name: 'Event Test Property',
        rightType: RightType.OWNERSHIP,
        jurisdiction: { countryCode: 'AE' },
        issuerId: issuer.id,
      });

      const events = await sdk.events.getByAssetId(asset.id);
      expect(events.length).toBeGreaterThan(0);
    });
  });
});
