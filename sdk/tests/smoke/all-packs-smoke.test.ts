/**
 * Smoke Tests - All 5 Use Cases
 *
 * Quick happy-path validation ensuring each pack's core flow works end-to-end.
 * These tests are designed to run fast and catch regressions early.
 *
 * 1. Airline Tickets    - Issue → Check-in → Board
 * 2. Hotel Reservations - Create → Confirm → Check-in → Check-out
 * 3. Car Rentals        - Create → Confirm → Pickup → Return → Inspect
 * 4. Concert Tickets    - Create → Issue → Admit → Complete
 * 5. Real Estate        - Create Asset → Transition → Mint
 */

import { describe, it, expect, beforeEach } from 'vitest';

// --- Airline ---
import {
  AirlineTicketEngine,
  TicketClass,
  TicketStatus,
  AirlineRole,
  TransferReason,
  type ActorContext as AirlineActor,
  type FlightSegment,
} from '@tokenisation/core';

// --- Hotel ---
import {
  HotelReservationEngine,
  RoomType,
  HotelReservationStatus,
  HotelRole,
  type ActorContext as HotelActor,
} from '@tokenisation/core';

// --- Car Rental ---
import {
  CarRentalEngine,
  VehicleCategory,
  CarRentalStatus,
  DepositStatus,
  RentalRole,
  type ActorContext as CarActor,
} from '@tokenisation/core';

// --- Concert ---
import {
  ConcertTicketEngine,
  SeatingTier,
  ConcertTicketStatus,
  VenueRole,
  type ActorContext as ConcertActor,
} from '@tokenisation/core';

// --- Real Estate ---
import { TokenisationSDK, RightType, LifecycleState } from '@tokenisation/core';

function futureDate(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

// =============================================================================
// 1. AIRLINE TICKETS SMOKE
// =============================================================================
describe('Smoke: Airline Tickets', () => {
  let engine: AirlineTicketEngine;
  const CODE = 'EK';

  const agent: AirlineActor = { actorId: 'agent-1', role: AirlineRole.AIRLINE_AGENT, airlineCode: CODE };
  const pax: AirlineActor = { actorId: 'John Doe', role: AirlineRole.PASSENGER, passengerId: 'John Doe' };

  const segment: FlightSegment = {
    flightNumber: 'EK001', airline: CODE,
    departure: { airport: 'DXB', terminal: 'T3', dateTime: futureDate(7) },
    arrival: { airport: 'LHR', terminal: 'T3', dateTime: futureDate(7.3) },
    class: TicketClass.ECONOMY, seatNumber: '32A',
  };

  const issueParams = {
    airlineCode: CODE, bookingReference: 'SMOKE-001', eTicketNumber: '176-SMOKE-001',
    passengerName: 'John Doe', segments: [segment],
    fare: { baseFare: '500.00', taxes: '100.00', total: '600.00', currency: 'USD', fareClass: 'Y', fareRules: [] },
    transferRules: { maxTransfers: 1, transferCount: 0, nameChangeFee: '50.00', requiresIssuerApproval: true, autoApproveWithIdentity: true, transferDeadlineHours: 24 },
    cancellationRules: { refundable: true, cancellationFee: '50.00', cancellationDeadlineHours: 48, refundCurrency: 'USD' },
  };

  beforeEach(() => {
    engine = new AirlineTicketEngine();
    engine.registerAirline(CODE);
  });

  it('should complete full happy path: Issue → Check-in → Board', async () => {
    // Issue
    const { ticket, success } = engine.issue(issueParams);
    expect(success).toBe(true);
    expect(ticket).toBeDefined();
    expect((ticket!.metadata as any).status).toBe(TicketStatus.ISSUED);

    // Check-in
    const checkIn = engine.checkIn({ ticketId: ticket!.id, actor: pax });
    expect(checkIn.success).toBe(true);
    expect((checkIn.ticket!.metadata as any).status).toBe(TicketStatus.CHECKED_IN);

    // Board
    const board = await engine.board({ ticketId: ticket!.id, actor: agent, scanLocation: 'Gate A1' });
    expect(board.success).toBe(true);
    expect((board.ticket!.metadata as any).status).toBe(TicketStatus.BOARDED);
    expect(board.verificationLog?.result).toBe('VALID');
  });

  it('should complete transfer flow', async () => {
    const { ticket } = engine.issue(issueParams);
    const transfer = await engine.requestTransfer({
      ticketId: ticket!.id, fromPassenger: 'John Doe',
      toPassenger: { name: 'Jane Doe' }, reason: TransferReason.GIFT,
    });
    expect(transfer.success).toBe(true);
    expect(transfer.request).toBeDefined();
  });

  it('should complete cancellation flow', () => {
    const { ticket } = engine.issue(issueParams);
    const cancel = engine.cancel({ ticketId: ticket!.id, requestedBy: 'John Doe' });
    expect(cancel.success).toBe(true);

    const refund = engine.processRefund(ticket!.id);
    expect(refund.success).toBe(true);
  });

  it('should generate reconciliation report', () => {
    engine.issue(issueParams);
    engine.issue({ ...issueParams, eTicketNumber: '176-SMOKE-002', passengerName: 'Jane Doe' });
    const depDate = segment.departure.dateTime.split('T')[0];
    const report = engine.generateReconciliationReport({
      flightNumber: 'EK001', airlineCode: CODE, departureDate: depDate,
      actor: { actorId: 'admin', role: AirlineRole.AIRLINE_ADMIN, airlineCode: CODE },
    });
    expect(report.summary.totalTickets).toBe(2);
  });
});

// =============================================================================
// 2. HOTEL RESERVATIONS SMOKE
// =============================================================================
describe('Smoke: Hotel Reservations', () => {
  let engine: HotelReservationEngine;
  const CODE = 'HILTON-DXB';

  const frontDesk: HotelActor = { actorId: 'fd-1', role: HotelRole.FRONT_DESK, hotelCode: CODE };

  const params = {
    hotelCode: CODE, hotelName: 'Hilton Dubai Creek', confirmationNumber: 'HLT-SMOKE-001',
    guestName: 'John Doe', roomType: RoomType.STANDARD,
    checkInDate: futureDate(7), checkOutDate: futureDate(10),
    rate: { perNight: '150.00', total: '450.00', taxes: '45.00', currency: 'USD', rateType: 'STANDARD' },
    transferRules: { maxTransfers: 1, transferCount: 0, nameChangeFee: '25.00', transferDeadlineHours: 24, autoApproveWithIdentity: true },
    cancellationPolicy: { refundable: true, cancellationFee: '0.00', freeCancellationDeadlineHours: 24, penaltyPercentage: 100 },
  };

  beforeEach(() => {
    engine = new HotelReservationEngine();
    engine.registerHotel(CODE);
  });

  it('should complete full happy path: Create → Confirm → Check-in → Check-out → Close', () => {
    const { reservation, success } = engine.createReservation(params);
    expect(success).toBe(true);
    expect(reservation).toBeDefined();

    const confirm = engine.confirmReservation({ reservationId: reservation!.id, actor: frontDesk });
    expect(confirm.success).toBe(true);

    const checkIn = engine.checkIn({ reservationId: reservation!.id, actor: frontDesk, roomNumber: '501' });
    expect(checkIn.success).toBe(true);
    expect((checkIn.reservation!.metadata as any).roomNumber).toBe('501');

    const checkOut = engine.checkOut({ reservationId: reservation!.id, actor: frontDesk });
    expect(checkOut.success).toBe(true);

    const close = engine.closeReservation({ reservationId: reservation!.id, actor: frontDesk });
    expect(close.success).toBe(true);
    expect((close.reservation!.metadata as any).status).toBe(HotelReservationStatus.CLOSED);
  });

  it('should complete transfer flow', () => {
    const { reservation } = engine.createReservation(params);
    engine.confirmReservation({ reservationId: reservation!.id, actor: frontDesk });
    const transfer = engine.requestTransfer({
      reservationId: reservation!.id, fromGuest: 'John Doe',
      toGuest: { name: 'Jane Doe' }, reason: 'Gift',
    });
    expect(transfer.success).toBe(true);
  });

  it('should complete cancellation flow', () => {
    const { reservation } = engine.createReservation(params);
    engine.confirmReservation({ reservationId: reservation!.id, actor: frontDesk });
    const cancel = engine.cancelReservation({ reservationId: reservation!.id, requestedBy: 'John Doe', reason: 'Plans changed' });
    expect(cancel.success).toBe(true);
    expect(parseFloat(cancel.refundAmount!)).toBe(450.00);
  });

  it('should extend stay', () => {
    const { reservation } = engine.createReservation(params);
    engine.confirmReservation({ reservationId: reservation!.id, actor: frontDesk });
    engine.checkIn({ reservationId: reservation!.id, actor: frontDesk });
    const extend = engine.extendStay({
      reservationId: reservation!.id,
      newCheckOutDate: futureDate(14),
      actor: frontDesk,
    });
    expect(extend.success).toBe(true);
    expect((extend.reservation!.metadata as any).nightCount).toBe(7);
  });
});

// =============================================================================
// 3. CAR RENTALS SMOKE
// =============================================================================
describe('Smoke: Car Rentals', () => {
  let engine: CarRentalEngine;
  const CODE = 'HERTZ-LAX';

  const agent: CarActor = { actorId: 'agent-1', role: RentalRole.RENTAL_AGENT, rentalCompanyCode: CODE };

  const params = {
    rentalCompanyCode: CODE, confirmationNumber: 'HTZ-SMOKE-001',
    driverName: 'John Doe',
    driverLicense: { number: 'DL-SMOKE', state: 'CA', country: 'US', expiryDate: '2028-01-01', class: 'C' },
    vehicleInfo: { vin: 'SMOKE123456789', make: 'Honda', model: 'Civic', year: 2024, licensePlate: 'SMK-001', color: 'Blue', category: VehicleCategory.COMPACT },
    rentalPeriod: { pickupDate: futureDate(7), returnDate: futureDate(10), pickupLocation: 'LAX', returnLocation: 'LAX' },
    pricing: { perDay: '50.00', total: '150.00', taxes: '20.00', currency: 'USD', deposit: '300.00', insuranceFee: '15.00', mileageAllowance: 200, overageFeePerMile: '0.30' },
    insurancePolicy: { provider: 'SafeDrive', policyNumber: 'INS-SMOKE', coverageType: 'FULL', verified: true },
    transferRules: { maxTransfers: 1, transferCount: 0, nameChangeFee: '25.00', transferDeadlineHours: 24, autoApproveWithIdentity: true },
    cancellationPolicy: { refundable: true, cancellationFee: '0.00', freeCancellationDeadlineHours: 24, penaltyPercentage: 100 },
  };

  beforeEach(() => {
    engine = new CarRentalEngine();
    engine.registerRentalCompany(CODE);
  });

  it('should complete full happy path: Create → Confirm → Pickup → Return → Inspect', async () => {
    const { rental, success } = engine.createRental(params);
    expect(success).toBe(true);
    expect(rental).toBeDefined();

    const confirm = engine.confirmRental({ rentalId: rental!.id, actor: agent });
    expect(confirm.success).toBe(true);

    const pickup = await engine.pickUp({ rentalId: rental!.id, actor: agent, mileageStart: 10000, fuelLevel: 100 });
    expect(pickup.success).toBe(true);

    const ret = engine.returnVehicle({ rentalId: rental!.id, actor: agent, mileageEnd: 10250, fuelLevel: 80 });
    expect(ret.success).toBe(true);
    expect(ret.mileageDiff).toBe(250);

    const inspect = engine.inspectVehicle({ rentalId: rental!.id, actor: agent, inspectionResult: { passed: true } });
    expect(inspect.success).toBe(true);
    expect((inspect.rental!.metadata as any).deposit.status).toBe(DepositStatus.RELEASED);
    expect((inspect.rental!.metadata as any).status).toBe(CarRentalStatus.INSPECTED);
  });

  it('should complete transfer flow', () => {
    const { rental } = engine.createRental(params);
    engine.confirmRental({ rentalId: rental!.id, actor: agent });
    const transfer = engine.requestTransfer({
      rentalId: rental!.id, fromDriver: 'John Doe',
      toDriver: { name: 'Jane Doe' }, reason: 'Schedule change',
    });
    expect(transfer.success).toBe(true);
  });

  it('should complete cancellation flow', () => {
    const { rental } = engine.createRental(params);
    engine.confirmRental({ rentalId: rental!.id, actor: agent });
    const cancel = engine.cancelRental({ rentalId: rental!.id, requestedBy: 'John Doe', reason: 'Plans changed' });
    expect(cancel.success).toBe(true);
    expect(parseFloat(cancel.refundAmount!)).toBe(150.00);
  });

  it('should extend rental period', async () => {
    const { rental } = engine.createRental(params);
    engine.confirmRental({ rentalId: rental!.id, actor: agent });
    await engine.pickUp({ rentalId: rental!.id, actor: agent });
    const extend = engine.extendRental({
      rentalId: rental!.id,
      newReturnDate: futureDate(14),
      actor: agent,
    });
    expect(extend.success).toBe(true);
    expect((extend.rental!.metadata as any).dayCount).toBe(7);
  });
});

// =============================================================================
// 4. CONCERT TICKETS SMOKE
// =============================================================================
describe('Smoke: Concert Tickets', () => {
  let engine: ConcertTicketEngine;
  const CODE = 'MSG-NYC';

  const boxOffice: ConcertActor = { actorId: 'bo-1', role: VenueRole.BOX_OFFICE, venueCode: CODE };
  const security: ConcertActor = { actorId: 'sec-1', role: VenueRole.SECURITY, venueCode: CODE };
  const venueAdmin: ConcertActor = { actorId: 'admin-1', role: VenueRole.VENUE_ADMIN, venueCode: CODE };

  const params = {
    venueCode: CODE, venueName: 'Madison Square Garden', confirmationNumber: 'MSG-SMOKE-001',
    eventInfo: { eventName: 'Smoke Test Concert', artist: 'Test Band', eventDate: futureDate(30), eventTime: '20:00' },
    seating: { section: 'B', row: '10', seat: '5', tier: SeatingTier.STANDARD },
    pricing: { faceValue: '100.00', serviceFee: '10.00', total: '110.00', currency: 'USD' },
    fanInfo: { fanName: 'Alice', ageVerified: true, fanAge: 25, fanClubMember: false },
    antiScalping: { maxResalePercent: 10 },
    transferRules: { maxTransfers: 2, transferCount: 0, nameChangeFee: '10.00', transferDeadlineHours: 24, autoApproveWithIdentity: true },
    cancellationPolicy: { refundable: true, cancellationFee: '0.00', freeCancellationDeadlineHours: 48, penaltyPercentage: 100 },
  };

  beforeEach(() => {
    engine = new ConcertTicketEngine();
    engine.registerVenue(CODE);
  });

  it('should complete full happy path: Create → Issue → Admit → Complete', () => {
    const { ticket, success } = engine.createTicket(params);
    expect(success).toBe(true);
    expect(ticket).toBeDefined();
    expect((ticket!.metadata as any).status).toBe(ConcertTicketStatus.CREATED);

    const issue = engine.issueTicket({ ticketId: ticket!.id, actor: boxOffice });
    expect(issue.success).toBe(true);
    expect((issue.ticket!.metadata as any).status).toBe(ConcertTicketStatus.ISSUED);

    const admit = engine.admitEntry({ ticketId: ticket!.id, actor: security, scanLocation: 'Gate A' });
    expect(admit.success).toBe(true);
    expect((admit.ticket!.metadata as any).status).toBe(ConcertTicketStatus.ADMITTED);
    expect((admit.ticket!.metadata as any).entryInfo.scanLocation).toBe('Gate A');

    const complete = engine.completeEvent({ ticketId: ticket!.id, actor: venueAdmin });
    expect(complete.success).toBe(true);
    expect((complete.ticket!.metadata as any).status).toBe(ConcertTicketStatus.USED);
  });

  it('should complete transfer flow', () => {
    const { ticket } = engine.createTicket(params);
    engine.issueTicket({ ticketId: ticket!.id, actor: boxOffice });
    const transfer = engine.requestTransfer({
      ticketId: ticket!.id, fromFan: 'Alice',
      toFan: { name: 'Bob' }, reason: 'Gift',
    });
    expect(transfer.success).toBe(true);
  });

  it('should complete cancellation and refund flow', () => {
    const { ticket } = engine.createTicket(params);
    engine.issueTicket({ ticketId: ticket!.id, actor: boxOffice });
    const cancel = engine.cancelTicket({ ticketId: ticket!.id, requestedBy: 'Alice', reason: 'Plans changed' });
    expect(cancel.success).toBe(true);
    expect(parseFloat(cancel.refundAmount!)).toBe(110.00);

    const refund = engine.processRefund({ ticketId: ticket!.id, actor: boxOffice });
    expect(refund.success).toBe(true);
    expect((refund.ticket!.metadata as any).status).toBe(ConcertTicketStatus.REFUNDED);
  });

  it('should enforce anti-scalping on resale', () => {
    const { ticket } = engine.createTicket(params);
    engine.issueTicket({ ticketId: ticket!.id, actor: boxOffice });

    // Within cap (100 * 1.10 = 110)
    const ok = engine.requestTransfer({ ticketId: ticket!.id, fromFan: 'Alice', toFan: { name: 'Bob' }, resalePrice: '110.00', reason: 'Resale' });
    expect(ok.success).toBe(true);

    // Above cap
    const { ticket: t2 } = engine.createTicket({ ...params, confirmationNumber: 'MSG-SMOKE-002' });
    engine.issueTicket({ ticketId: t2!.id, actor: boxOffice });
    const fail = engine.requestTransfer({ ticketId: t2!.id, fromFan: 'Alice', toFan: { name: 'Bob' }, resalePrice: '200.00', reason: 'Scalp' });
    expect(fail.success).toBe(false);
    expect(fail.errorCode).toBe('RESALE_PRICE_CAP_EXCEEDED');
  });
});

// =============================================================================
// 5. REAL ESTATE SMOKE (Core SDK)
// =============================================================================
describe('Smoke: Real Estate', () => {
  let sdk: TokenisationSDK;

  beforeEach(() => {
    sdk = new TokenisationSDK();
  });

  it('should complete full happy path: Create → Verify → Activate → Mint', async () => {
    // Create issuer and verifier
    const issuer = sdk.parties_.create({ type: 'ORGANIZATION' as any, roles: ['ISSUER' as any], name: 'Marina Holdings Ltd', jurisdiction: 'AE' });
    const verifier = sdk.parties_.create({ type: 'ORGANIZATION' as any, roles: ['VERIFIER' as any], name: 'Dubai Land Department', jurisdiction: 'AE' });

    // Create asset
    const asset = await sdk.assets.create({
      name: 'Marina Tower Unit 2501',
      rightType: RightType.OWNERSHIP,
      jurisdiction: { countryCode: 'AE', regulatoryFramework: 'UAE_VARA', accreditedOnly: false, blockedJurisdictions: ['KP', 'IR'] },
      issuerId: issuer.id,
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
    expect(asset.state).toBe(LifecycleState.DRAFT);

    // Add and verify evidence
    const evidence = sdk.evidence.create({
      assetId: asset.id,
      type: 'LEGAL_DOCUMENT' as any,
      title: 'Title Deed',
      contentHash: 'sha256:' + 'c'.repeat(64),
      source: { type: 'GOVERNMENT_REGISTRY', identifier: 'dld', name: 'DLD', trusted: true, reputationScore: 100 },
    });
    await sdk.evidence.verify(evidence.id, verifier.id, 'DOCUMENT_REVIEW');

    // Transition through lifecycle
    const pendingResult = await sdk.assets.transition(asset.id, LifecycleState.PENDING_VERIFICATION, 'Submit for verification');
    expect(pendingResult.success).toBe(true);
    if (pendingResult.success) expect(pendingResult.data.state).toBe(LifecycleState.PENDING_VERIFICATION);

    const verifiedResult = await sdk.assets.transition(asset.id, LifecycleState.VERIFIED, 'DLD verified');
    expect(verifiedResult.success).toBe(true);
    if (verifiedResult.success) expect(verifiedResult.data.state).toBe(LifecycleState.VERIFIED);

    const activeResult = await sdk.assets.transition(asset.id, LifecycleState.ACTIVE, 'Activate');
    expect(activeResult.success).toBe(true);
    if (activeResult.success) expect(activeResult.data.state).toBe(LifecycleState.ACTIVE);

    // Mint tokens
    const mintResult = await sdk.tokens.mint(asset.id, '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', '5000000');
    expect(mintResult).toBeDefined();

    // Verify event trail
    const events = await sdk.events.getByAssetId(asset.id);
    expect(events.length).toBeGreaterThanOrEqual(4); // create + 3 transitions + mint
  });

  it('should enforce compliance on transfer check', async () => {
    const result = await sdk.complianceEngine.evaluate(
      'token:transfer' as any,
      {
        senderId: 's1',
        recipientId: 'r1',
        assetId: 'a1',
        amount: '100',
        jurisdiction: 'AE',
      } as any,
    );
    expect(result).toBeDefined();
    expect(result.decision).toBeDefined();
  });

  it('should freeze and unfreeze asset', async () => {
    const issuer = sdk.parties_.create({ type: 'ORGANIZATION' as any, roles: ['ISSUER' as any], name: 'Freeze Test', jurisdiction: 'AE' });
    const verifier = sdk.parties_.create({ type: 'ORGANIZATION' as any, roles: ['VERIFIER' as any], name: 'DLD', jurisdiction: 'AE' });

    const asset = await sdk.assets.create({
      name: 'Freeze Test Property',
      rightType: RightType.OWNERSHIP,
      jurisdiction: { countryCode: 'AE' },
      issuerId: issuer.id,
    });

    const evidence = sdk.evidence.create({
      assetId: asset.id,
      type: 'LEGAL_DOCUMENT' as any,
      title: 'Deed',
      contentHash: 'sha256:' + 'd'.repeat(64),
      source: { type: 'GOVERNMENT_REGISTRY', identifier: 'dld', name: 'DLD', trusted: true, reputationScore: 100 },
    });
    await sdk.evidence.verify(evidence.id, verifier.id, 'DOCUMENT_REVIEW');

    await sdk.assets.transition(asset.id, LifecycleState.PENDING_VERIFICATION, 'Submit');
    await sdk.assets.transition(asset.id, LifecycleState.VERIFIED, 'Verified');
    await sdk.assets.transition(asset.id, LifecycleState.ACTIVE, 'Activate');

    // Freeze
    const frozenResult = await sdk.assets.transition(asset.id, LifecycleState.FROZEN, 'Freeze for distribution');
    expect(frozenResult.success).toBe(true);
    if (frozenResult.success) expect(frozenResult.data.state).toBe(LifecycleState.FROZEN);

    // Unfreeze
    const unfrozenResult = await sdk.assets.transition(asset.id, LifecycleState.ACTIVE, 'Resume');
    expect(unfrozenResult.success).toBe(true);
    if (unfrozenResult.success) expect(unfrozenResult.data.state).toBe(LifecycleState.ACTIVE);
  });
});
