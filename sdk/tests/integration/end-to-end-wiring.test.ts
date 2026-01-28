/**
 * End-to-End Wiring Integration Tests
 *
 * Verifies that the three orchestration components (FlightLandingOracle,
 * PortableComplianceRegistry, AuditChainManager) are properly wired into
 * the four pack engines via real engine operations (no mocks).
 */

import { describe, it, expect, beforeEach } from 'vitest';

// Orchestration layer
import {
  SharedIdentityRegistry,
  CrossPackEventBus,
  SagaOrchestrator,
  SagaExecutionStatus,
  UnifiedAuditLog,
  AuditChainManager,
  PortableComplianceRegistry,
  FlightLandingOracle,
} from '../../src/orchestration/index.js';
import type {
  IAuditLog,
  SagaDefinition,
} from '../../src/orchestration/index.js';

// Oracle service
import { OracleService } from '../../src/services/OracleService.js';

// Pack engines
import {
  AirlineTicketEngine,
  TicketClass,
  AirlineRole,
  TransferReason,
} from '../../src/packs/AirlineTicket.js';
import type { ActorContext as AirlineActorContext } from '../../src/packs/AirlineTicket.js';

import {
  HotelReservationEngine,
  RoomType,
  HotelRole,
} from '../../src/packs/HotelReservation.js';
import type { ActorContext as HotelActorContext } from '../../src/packs/HotelReservation.js';

import {
  CarRentalEngine,
  VehicleCategory,
  RentalRole,
} from '../../src/packs/CarRental.js';
import type { ActorContext as CarActorContext } from '../../src/packs/CarRental.js';

import {
  ConcertTicketEngine,
  SeatingTier,
  VenueRole,
} from '../../src/packs/ConcertTicket.js';
import type { ActorContext as ConcertActorContext } from '../../src/packs/ConcertTicket.js';

// Compliance types
import { ComplianceAction } from '../../src/core/types.js';

// ============================================================================
// HELPERS
// ============================================================================

function futureDate(daysAhead: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString();
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

const concertSecurity: ConcertActorContext = {
  actorId: 'security-1',
  role: VenueRole.SECURITY,
  venueCode: 'TEST-VENUE',
};

const testIdentity = {
  type: 'PASSPORT' as const,
  number: 'P123456',
  country: 'US',
  expiryDate: futureDate(365),
};

const identityHash = `${testIdentity.type}:${testIdentity.country}:${testIdentity.number}`;

function issueAirlineKyc(
  complianceRegistry: PortableComplianceRegistry,
  hash: string,
) {
  complianceRegistry.issuePortableReceipt({
    identityHash: hash,
    issuingPack: 'AIRLINE',
    complianceType: 'KYC',
    decision: {
      id: 'dec-1',
      action: ComplianceAction.TOKEN_TRANSFER,
      result: 'ALLOW',
      violations: [],
      warnings: [],
      policyVersion: '1.0.0',
      policyHash: 'hash',
      evaluatedAt: new Date().toISOString(),
    },
    context: {
      assetId: 'asset-1',
      actorId: 'actor-1',
      amount: '1',
    },
    expiresAt: futureDate(1),
  });
}

// ============================================================================
// TESTS
// ============================================================================

describe('End-to-End Wiring', () => {
  let auditLog: UnifiedAuditLog;
  let chainManager: AuditChainManager;
  let registry: SharedIdentityRegistry;
  let bus: CrossPackEventBus;
  let complianceRegistry: PortableComplianceRegistry;
  let oracle: OracleService;
  let landingOracle: FlightLandingOracle;

  let airline: AirlineTicketEngine;
  let hotel: HotelReservationEngine;
  let car: CarRentalEngine;
  let concert: ConcertTicketEngine;

  beforeEach(() => {
    auditLog = new UnifiedAuditLog();
    chainManager = new AuditChainManager(auditLog);
    registry = new SharedIdentityRegistry();
    bus = new CrossPackEventBus();
    complianceRegistry = new PortableComplianceRegistry(registry);
    oracle = new OracleService({ strictMode: false });
    landingOracle = new FlightLandingOracle(oracle, bus);

    airline = new AirlineTicketEngine({
      identityRegistry: registry,
      eventBus: bus,
      auditLog: chainManager,
      complianceRegistry,
    });
    airline.registerAirline('TEST-AIR');

    hotel = new HotelReservationEngine({
      identityRegistry: registry,
      eventBus: bus,
      auditLog: chainManager,
      complianceRegistry,
    });
    hotel.registerHotel('TEST-HOTEL');

    car = new CarRentalEngine({
      identityRegistry: registry,
      eventBus: bus,
      auditLog: chainManager,
      complianceRegistry,
      flightLandingOracle: landingOracle,
    });
    car.registerRentalCompany('TEST-CAR');

    concert = new ConcertTicketEngine({
      identityRegistry: registry,
      eventBus: bus,
      auditLog: chainManager,
      complianceRegistry,
    });
    concert.registerVenue('TEST-VENUE');
  });

  // Helper to create and confirm a car rental
  function createConfirmedRental() {
    const result = car.createRental({
      rentalCompanyCode: 'TEST-CAR',
      confirmationNumber: 'CR-001',
      driverName: 'John Doe',
      driverLicense: { number: 'DL123', state: 'CA', country: 'US', expiryDate: futureDate(365), class: 'C' },
      vehicleInfo: { vin: 'V1', make: 'Toyota', model: 'Camry', year: 2024, licensePlate: 'ABC123', color: 'White', category: VehicleCategory.SEDAN },
      rentalPeriod: { pickupDate: futureDate(7), returnDate: futureDate(10), pickupLocation: 'Airport', returnLocation: 'Airport' },
      pricing: { perDay: '50.00', total: '150.00', taxes: '15.00', currency: 'USD', deposit: '200.00', insuranceFee: '10.00', mileageAllowance: 300, overageFeePerMile: '0.25' },
    });
    const rentalId = result.rental!.id;
    car.confirmRental({ rentalId, actor: carAgent });
    return rentalId;
  }

  // Helper to create and confirm a hotel reservation
  function createConfirmedReservation() {
    const result = hotel.createReservation({
      hotelCode: 'TEST-HOTEL',
      confirmationNumber: 'HR-001',
      guestName: 'John Doe',
      guestIdentity: testIdentity,
      roomType: RoomType.STANDARD,
      checkInDate: futureDate(7),
      checkOutDate: futureDate(10),
      rate: { perNight: '100.00', total: '300.00', taxes: '30.00', currency: 'USD', rateType: 'STANDARD' },
    });
    const reservationId = result.reservation!.id;
    hotel.confirmReservation({ reservationId, actor: hotelFrontDesk });
    return reservationId;
  }

  // Helper to create and issue a concert ticket
  function createIssuedTicket() {
    const result = concert.createTicket({
      venueCode: 'TEST-VENUE',
      confirmationNumber: 'CT-001',
      eventInfo: { eventName: 'Rock Show', artist: 'The Band', eventDate: futureDate(14), eventTime: '20:00' },
      seating: { section: 'A', row: '1', seat: '1', tier: SeatingTier.VIP },
      pricing: { faceValue: '100.00', serviceFee: '10.00', total: '110.00', currency: 'USD' },
      fanInfo: { fanName: 'John Doe', fanIdentity: testIdentity, ageVerified: true, fanAge: 25 },
    });
    const ticketId = result.ticket!.id;
    concert.issueTicket({ ticketId, actor: concertBoxOffice });
    return ticketId;
  }

  // Helper to issue an airline ticket
  function createIssuedAirlineTicket() {
    const result = airline.issue({
      airlineCode: 'TEST-AIR',
      bookingReference: 'BR-001',
      eTicketNumber: 'ET-001',
      passengerName: 'John Doe',
      passengerIdentity: testIdentity,
      segments: [{
        segmentId: 'seg-1',
        flightNumber: 'TA-100',
        airline: 'TEST-AIR',
        departure: { airport: 'JFK', terminal: 'T1', gate: 'G1', dateTime: futureDate(7) },
        arrival: { airport: 'LAX', terminal: 'T2', dateTime: futureDate(7) },
        class: TicketClass.ECONOMY,
        status: 'CONFIRMED',
      }],
      fare: { base: '200.00', taxes: '30.00', total: '230.00', currency: 'USD' },
      transferRules: {
        maxTransfers: 2,
        transferCount: 0,
        nameChangeFee: '50.00',
        transferDeadlineHours: 24,
        requiresIssuerApproval: false,
        autoApproveWithIdentity: true,
      },
      cancellationRules: {
        refundable: true,
        cancellationFee: '0.00',
        refundDeadlineHours: 24,
        penaltyPercentage: 0,
      },
    });
    return result.ticket!.id;
  }

  // ==========================================================================
  // Test 1: Car rental pickUp blocked without oracle-verified landing
  // ==========================================================================
  it('car rental pickUp() blocked without oracle-verified landing', async () => {
    const rentalId = createConfirmedRental();

    const result = await car.pickUp({ rentalId, actor: carAgent });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Flight landing not verified');
  });

  // ==========================================================================
  // Test 2: Car rental pickUp succeeds after flight landing reported
  // ==========================================================================
  it('car rental pickUp() succeeds after flight landing reported', async () => {
    const rentalId = createConfirmedRental();

    // Report the landing
    landingOracle.reportLanding({
      flightNumber: '',
      landedAt: new Date().toISOString(),
      airport: 'LAX',
      status: 'LANDED',
      source: 'FAA',
      confidence: 0.99,
    });

    const result = await car.pickUp({ rentalId, actor: carAgent });
    expect(result.success).toBe(true);
  });

  // ==========================================================================
  // Test 3: Hotel checkIn blocked without compliance receipt
  // ==========================================================================
  it('hotel checkIn() blocked without compliance receipt', () => {
    const reservationId = createConfirmedReservation();

    const result = hotel.checkIn({ reservationId, actor: hotelFrontDesk });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Compliance verification required');
  });

  // ==========================================================================
  // Test 4: Hotel checkIn succeeds after airline issues KYC
  // ==========================================================================
  it('hotel checkIn() succeeds after airline issues KYC', () => {
    const reservationId = createConfirmedReservation();

    // Issue portable KYC from airline
    issueAirlineKyc(complianceRegistry, identityHash);

    const result = hotel.checkIn({ reservationId, actor: hotelFrontDesk, roomNumber: '101' });
    expect(result.success).toBe(true);
  });

  // ==========================================================================
  // Test 5: Concert admitEntry blocked without compliance receipt
  // ==========================================================================
  it('concert admitEntry() blocked without compliance receipt', () => {
    const ticketId = createIssuedTicket();

    const result = concert.admitEntry({ ticketId, actor: concertSecurity });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Compliance verification required');
  });

  // ==========================================================================
  // Test 6: Concert admitEntry succeeds with airline KYC receipt
  // ==========================================================================
  it('concert admitEntry() succeeds with airline KYC receipt', () => {
    const ticketId = createIssuedTicket();

    issueAirlineKyc(complianceRegistry, identityHash);

    const result = concert.admitEntry({ ticketId, actor: concertSecurity });
    expect(result.success).toBe(true);
  });

  // ==========================================================================
  // Test 7: Car rental transfer blocked without recipient compliance
  // ==========================================================================
  it('car rental transfer blocked without recipient compliance', () => {
    const rentalId = createConfirmedRental();

    const recipientIdentity = {
      type: 'PASSPORT' as const,
      number: 'P999999',
      country: 'UK',
      expiryDate: futureDate(365),
    };

    const result = car.requestTransfer({
      rentalId,
      fromDriver: 'John Doe',
      toDriver: { name: 'Jane Smith', identity: recipientIdentity },
      reason: 'Change of plans',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Compliance verification required');
  });

  // ==========================================================================
  // Test 8: All pack operations logged to audit chain manager
  // ==========================================================================
  it('all pack operations logged to audit chain manager', () => {
    // Perform operations across all packs
    createIssuedAirlineTicket();
    createConfirmedReservation();
    createConfirmedRental();
    createIssuedTicket();

    const entries = chainManager.getAuditorView();
    expect(entries.length).toBeGreaterThan(0);

    // Check all four sources are represented
    const sources = new Set(entries.map(e => e.source));
    expect(sources.has('AIRLINE')).toBe(true);
    expect(sources.has('HOTEL')).toBe(true);
    expect(sources.has('CAR_RENTAL')).toBe(true);
    expect(sources.has('CONCERT')).toBe(true);
  });

  // ==========================================================================
  // Test 9: Audit entries have correct hash chain linkage
  // ==========================================================================
  it('audit entries have correct hash chain linkage', () => {
    createIssuedAirlineTicket();
    createConfirmedReservation();
    createConfirmedRental();
    createIssuedTicket();

    const verification = chainManager.verifyGlobalChain();
    expect(verification.globalChainValid).toBe(true);
    expect(verification.tamperingDetected).toBe(false);
    expect(verification.totalEntries).toBeGreaterThan(0);
  });

  // ==========================================================================
  // Test 10: Airline scoped view shows only airline audit entries
  // ==========================================================================
  it('airline scoped view shows only airline audit entries', () => {
    createIssuedAirlineTicket();
    createConfirmedReservation();

    const airlineView = chainManager.getScopedView('AIRLINE');
    expect(airlineView.businessId).toBe('AIRLINE');
    expect(airlineView.entries.length).toBeGreaterThan(0);
    expect(airlineView.entries.every(e => e.source === 'AIRLINE')).toBe(true);
    expect(airlineView.chainIntact).toBe(true);
  });

  // ==========================================================================
  // Test 11: Full journey: issue ticket → checkIn hotel → pickUp car → admit concert
  // ==========================================================================
  it('full journey across all 4 packs', async () => {
    // Issue KYC receipt
    issueAirlineKyc(complianceRegistry, identityHash);

    // 1. Issue airline ticket
    const ticketId = createIssuedAirlineTicket();
    expect(airline.checkIn({ ticketId, actor: airlineAdmin }).success).toBe(true);

    // 2. Check in to hotel
    const reservationId = createConfirmedReservation();
    expect(hotel.checkIn({ reservationId, actor: hotelFrontDesk, roomNumber: '202' }).success).toBe(true);

    // 3. Pick up car (need landing report)
    const rentalId = createConfirmedRental();
    landingOracle.reportLanding({
      flightNumber: '',
      landedAt: new Date().toISOString(),
      airport: 'LAX',
      status: 'LANDED',
      source: 'FAA',
      confidence: 0.99,
    });
    const pickupResult = await car.pickUp({ rentalId, actor: carAgent });
    expect(pickupResult.success).toBe(true);

    // 4. Admit to concert
    const concertTicketId = createIssuedTicket();
    expect(concert.admitEntry({ ticketId: concertTicketId, actor: concertSecurity }).success).toBe(true);

    // Verify all operations logged
    const entries = chainManager.getAuditorView();
    const sources = new Set(entries.map(e => e.source));
    expect(sources.size).toBe(4);
  });

  // ==========================================================================
  // Test 12: Journey audit trail has correlationId linking all packs
  // ==========================================================================
  it('journey audit trail has correlationId linking all packs', async () => {
    const correlationId = 'journey-001';

    issueAirlineKyc(complianceRegistry, identityHash);

    // Pick up car with correlationId
    const rentalId = createConfirmedRental();
    landingOracle.reportLanding({
      flightNumber: '',
      landedAt: new Date().toISOString(),
      airport: 'LAX',
      status: 'LANDED',
      source: 'FAA',
      confidence: 0.99,
    });

    await car.pickUp({ rentalId, actor: carAgent, correlationId });

    const journeyEntries = chainManager.getJourneyEntries(correlationId);
    expect(journeyEntries.length).toBeGreaterThan(0);
    expect(journeyEntries.every(e => e.correlationId === correlationId)).toBe(true);
  });

  // ==========================================================================
  // Test 13: Saga orchestrates real pack operations on FLIGHT_LANDED
  // ==========================================================================
  it('saga orchestrates real pack operations on FLIGHT_LANDED', async () => {
    // Create a confirmed hotel reservation
    const reservationId = createConfirmedReservation();
    issueAirlineKyc(complianceRegistry, identityHash);

    // Set up saga: when flight lands, check in hotel guest
    const saga: SagaDefinition = {
      id: 'flight-to-hotel',
      name: 'Flight Landing to Hotel Check-In',
      triggerFilter: { source: 'AIRLINE', type: 'FLIGHT_LANDED' },
      steps: [
        {
          name: 'check-in-hotel',
          packSource: 'HOTEL',
          action: async () => {
            const result = hotel.checkIn({ reservationId, actor: hotelFrontDesk, roomNumber: '303' });
            if (!result.success) throw new Error(result.error);
          },
        },
      ],
      compensations: [],
    };

    const orchestrator = new SagaOrchestrator(bus);
    orchestrator.registerSaga(saga);
    orchestrator.start();

    // Report flight landing (triggers saga)
    landingOracle.reportLanding({
      flightNumber: 'TA-100',
      landedAt: new Date().toISOString(),
      airport: 'LAX',
      status: 'LANDED',
      source: 'FAA',
      confidence: 0.99,
    });

    // Wait for saga execution
    await new Promise(resolve => setTimeout(resolve, 200));

    // Verify hotel was checked in
    const reservation = hotel.getReservation(reservationId);
    const metadata = reservation?.metadata as unknown as { status: string };
    expect(metadata.status).toBe('CHECKED_IN');

    orchestrator.stop();
  });

  // ==========================================================================
  // Test 14: Expired KYC receipt blocks hotel check-in
  // ==========================================================================
  it('expired KYC receipt blocks hotel check-in', () => {
    const reservationId = createConfirmedReservation();

    // Issue receipt with past expiry
    complianceRegistry.issuePortableReceipt({
      identityHash,
      issuingPack: 'AIRLINE',
      complianceType: 'KYC',
      decision: {
        id: 'dec-expired',
        action: ComplianceAction.TOKEN_TRANSFER,
        result: 'ALLOW',
        violations: [],
        warnings: [],
        policyVersion: '1.0.0',
        policyHash: 'hash',
        evaluatedAt: new Date().toISOString(),
      },
      context: {
        assetId: 'asset-1',
        actorId: 'actor-1',
        amount: '1',
      },
      expiresAt: new Date(Date.now() - 1000).toISOString(), // Already expired
    });

    const result = hotel.checkIn({ reservationId, actor: hotelFrontDesk });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Compliance verification required');
  });

  // ==========================================================================
  // Test 15: AuditChainManager works as drop-in IAuditLog
  // ==========================================================================
  it('AuditChainManager works as drop-in IAuditLog', () => {
    // Verify it implements IAuditLog by using it as one
    const auditLogRef: IAuditLog = chainManager;

    const id = auditLogRef.log({
      source: 'TEST',
      action: 'TEST_ACTION',
      actorId: 'test-actor',
      resourceId: 'test-resource',
      success: true,
    });

    expect(typeof id).toBe('string');
    expect(auditLogRef.getAll().length).toBe(1);
    expect(auditLogRef.getByResource('test-resource').length).toBe(1);
    expect(auditLogRef.query({ source: 'TEST' }).length).toBe(1);
    expect(auditLogRef.query({ source: 'NONEXISTENT' }).length).toBe(0);
    expect(auditLogRef.getByCorrelation('nonexistent').length).toBe(0);

    auditLogRef.clear();
    expect(auditLogRef.getAll().length).toBe(0);
  });

  // ==========================================================================
  // Test 16: Pack events published to cross-pack event bus
  // ==========================================================================
  it('pack events published to cross-pack event bus', () => {
    const events: unknown[] = [];
    bus.subscribe({ source: 'AIRLINE' }, (event) => {
      events.push(event);
    });

    createIssuedAirlineTicket();

    expect(events.length).toBeGreaterThan(0);
  });

  // ==========================================================================
  // Test 17: Oracle failure triggers saga compensation for real car rental
  // ==========================================================================
  it('oracle failure triggers saga compensation for real car rental', async () => {
    const rentalId = createConfirmedRental();

    // Set up saga: when flight lands, try to pick up car
    const compensated: string[] = [];
    const saga: SagaDefinition = {
      id: 'flight-to-car',
      name: 'Flight Landing to Car Pickup',
      triggerFilter: { source: 'AIRLINE', type: 'FLIGHT_LANDED' },
      steps: [
        {
          name: 'pickup-car',
          packSource: 'CAR_RENTAL',
          action: async () => {
            const result = await car.pickUp({ rentalId, actor: carAgent });
            if (!result.success) throw new Error(result.error);
          },
        },
      ],
      compensations: [
        {
          name: 'cancel-car-pickup',
          packSource: 'CAR_RENTAL',
          action: async () => {
            compensated.push(rentalId);
          },
        },
      ],
    };

    const orchestrator = new SagaOrchestrator(bus);
    orchestrator.registerSaga(saga);
    orchestrator.start();

    // Simulate oracle failure so pickup will fail
    oracle.simulateFailure();

    bus.publish({
      source: 'AIRLINE',
      type: 'FLIGHT_LANDED',
      resourceId: 'TA-200',
      data: {},
    });

    // Wait for saga execution
    await new Promise(resolve => setTimeout(resolve, 300));

    orchestrator.stop();

    // The saga step should have failed and compensation should have run
    expect(compensated.length).toBe(1);
    expect(compensated[0]).toBe(rentalId);
  });

  // ==========================================================================
  // Test 18: Car rental pickUp succeeds without oracle when not configured
  // ==========================================================================
  it('car rental pickUp succeeds without oracle when not configured', async () => {
    // Create engine WITHOUT flightLandingOracle
    const carNoOracle = new CarRentalEngine({
      identityRegistry: registry,
      eventBus: bus,
      auditLog: chainManager,
    });
    carNoOracle.registerRentalCompany('TEST-CAR');

    const result = carNoOracle.createRental({
      rentalCompanyCode: 'TEST-CAR',
      confirmationNumber: 'CR-002',
      driverName: 'Jane Doe',
      driverLicense: { number: 'DL456', state: 'NY', country: 'US', expiryDate: futureDate(365), class: 'C' },
      vehicleInfo: { vin: 'V2', make: 'Honda', model: 'Civic', year: 2024, licensePlate: 'XYZ789', color: 'Blue', category: VehicleCategory.COMPACT },
      rentalPeriod: { pickupDate: futureDate(7), returnDate: futureDate(10), pickupLocation: 'Airport', returnLocation: 'Airport' },
      pricing: { perDay: '40.00', total: '120.00', taxes: '12.00', currency: 'USD', deposit: '150.00', insuranceFee: '8.00', mileageAllowance: 300, overageFeePerMile: '0.20' },
    });
    const rentalId = result.rental!.id;
    carNoOracle.confirmRental({ rentalId, actor: carAgent });

    const pickupResult = await carNoOracle.pickUp({ rentalId, actor: carAgent });
    expect(pickupResult.success).toBe(true);
  });

  // ==========================================================================
  // Test 19: Hotel checkIn succeeds without compliance when not configured
  // ==========================================================================
  it('hotel checkIn succeeds without compliance when not configured', () => {
    // Create engine WITHOUT complianceRegistry
    const hotelNoCompliance = new HotelReservationEngine({
      identityRegistry: registry,
      eventBus: bus,
      auditLog: chainManager,
    });
    hotelNoCompliance.registerHotel('TEST-HOTEL');

    const result = hotelNoCompliance.createReservation({
      hotelCode: 'TEST-HOTEL',
      confirmationNumber: 'HR-002',
      guestName: 'Jane Doe',
      guestIdentity: testIdentity,
      roomType: RoomType.DELUXE,
      checkInDate: futureDate(7),
      checkOutDate: futureDate(10),
      rate: { perNight: '120.00', total: '360.00', taxes: '36.00', currency: 'USD', rateType: 'STANDARD' },
    });
    const reservationId = result.reservation!.id;
    hotelNoCompliance.confirmReservation({ reservationId, actor: hotelFrontDesk });

    const checkInResult = hotelNoCompliance.checkIn({ reservationId, actor: hotelFrontDesk, roomNumber: '404' });
    expect(checkInResult.success).toBe(true);
  });

  // ==========================================================================
  // Test 20: Concert admitEntry succeeds without compliance when not configured
  // ==========================================================================
  it('concert admitEntry succeeds without compliance when not configured', () => {
    // Create engine WITHOUT complianceRegistry
    const concertNoCompliance = new ConcertTicketEngine({
      identityRegistry: registry,
      eventBus: bus,
      auditLog: chainManager,
    });
    concertNoCompliance.registerVenue('TEST-VENUE');

    const result = concertNoCompliance.createTicket({
      venueCode: 'TEST-VENUE',
      confirmationNumber: 'CT-002',
      eventInfo: { eventName: 'Jazz Night', artist: 'The Jazz', eventDate: futureDate(14), eventTime: '19:00' },
      seating: { section: 'B', row: '2', seat: '3', tier: SeatingTier.GENERAL_ADMISSION },
      pricing: { faceValue: '50.00', serviceFee: '5.00', total: '55.00', currency: 'USD' },
      fanInfo: { fanName: 'Jane Doe', fanIdentity: testIdentity },
    });
    const ticketId = result.ticket!.id;
    concertNoCompliance.issueTicket({ ticketId, actor: concertBoxOffice });

    const admitResult = concertNoCompliance.admitEntry({ ticketId, actor: concertSecurity });
    expect(admitResult.success).toBe(true);
  });
});
