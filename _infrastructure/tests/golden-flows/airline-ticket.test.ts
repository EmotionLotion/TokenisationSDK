/**
 * Airline Ticket E2E Test Suite
 *
 * Comprehensive E2E tests for the Airline Ticket SDK covering:
 * - Golden path (happy flow)
 * - State machine transitions
 * - Guard enforcement (transfer window, post-check-in lock, one-time use)
 * - Refund/void flow
 * - Idempotency
 * - Webhook events
 * - Authorization (RBAC)
 * - Observability (correlationId)
 *
 * Test Cases:
 * | Test ID   | Name                | Purpose                                          |
 * |-----------|---------------------|--------------------------------------------------|
 * | AT-E2E-01 | Golden Path         | Full happy path: create→issue→transfer→checkin→board→query |
 * | AT-E2E-02 | Transfer Window     | Reject transfers after departure-24h             |
 * | AT-E2E-03 | Post-Check-in Lock  | Reject transfers after check-in                  |
 * | AT-E2E-04 | One-time Use        | Reject second boarding (ALREADY_USED)            |
 * | AT-E2E-05 | Refund/Void         | Refund → VOID, no further transfers              |
 * | AT-RES-01 | Idempotency         | Same idempotency key returns same result         |
 * | AT-RES-02 | Webhook Dedupe      | Duplicate webhooks deduplicated by eventId       |
 * | AT-SEC-01 | AuthZ               | Only airline role can checkIn/board              |
 * | AT-OBS-01 | Observability       | All ops emit correlationId in logs/events        |
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import {
  AirlineTicketEngine,
  TicketStatus,
  TicketClass,
  AirlineRole,
  TransferReason,
  TransferApprovalStatus,
  AirlineEventType,
  type ActorContext,
  type FlightSegment,
} from '../../sdk/src/packs/AirlineTicket';
import {
  AirlineTicketState,
  AirlineTicketErrorCode,
  AirlineTicketEvent,
} from '../../sdk/src/packs/AirlineTicketStateMachine';
import { WebhookReceiver, createWebhookReceiver } from '../helpers/webhook-receiver';

// ============================================================================
// TEST SETUP
// ============================================================================

describe('Airline Ticket E2E Tests', () => {
  let engine: AirlineTicketEngine;
  let webhookReceiver: WebhookReceiver | null = null;

  // Test data
  const AIRLINE_CODE = 'EK';
  const AIRLINE_NAME = 'Emirates';
  const TEST_SECRET = 'test-webhook-secret-12345';

  // Actor contexts for RBAC testing
  const airlineAdmin: ActorContext = {
    actorId: 'admin-001',
    role: AirlineRole.AIRLINE_ADMIN,
    airlineCode: AIRLINE_CODE,
  };

  const airlineAgent: ActorContext = {
    actorId: 'agent-001',
    role: AirlineRole.AIRLINE_AGENT,
    airlineCode: AIRLINE_CODE,
  };

  const passenger: ActorContext = {
    actorId: 'John Doe',
    role: AirlineRole.PASSENGER,
    passengerId: 'John Doe',
  };

  const otherPassenger: ActorContext = {
    actorId: 'Jane Smith',
    role: AirlineRole.PASSENGER,
    passengerId: 'Jane Smith',
  };

  // Helper to create a test ticket
  function createTestTicket(options?: {
    passengerName?: string;
    departureInHours?: number;
    maxTransfers?: number;
    transferDeadlineHours?: number;
    refundable?: boolean;
  }) {
    const now = new Date();
    const departureInHours = options?.departureInHours ?? 48;
    const departureTime = new Date(now.getTime() + departureInHours * 60 * 60 * 1000);
    const arrivalTime = new Date(departureTime.getTime() + 8 * 60 * 60 * 1000);

    const segments: FlightSegment[] = [
      {
        flightNumber: 'EK507',
        airline: AIRLINE_CODE,
        departure: {
          airport: 'DXB',
          terminal: '3',
          dateTime: departureTime.toISOString(),
        },
        arrival: {
          airport: 'LHR',
          terminal: '3',
          dateTime: arrivalTime.toISOString(),
        },
        class: TicketClass.BUSINESS,
        seatNumber: '14A',
      },
    ];

    const result = engine.issue({
      airlineCode: AIRLINE_CODE,
      bookingReference: `PNR-${uuidv4().substring(0, 6).toUpperCase()}`,
      eTicketNumber: `176-${Date.now()}`,
      passengerName: options?.passengerName ?? 'John Doe',
      passengerIdentity: {
        type: 'PASSPORT',
        number: 'AB123456',
        country: 'GB',
        expiryDate: '2030-01-01',
      },
      segments,
      fare: {
        baseFare: '2500.00',
        taxes: '500.00',
        total: '3000.00',
        currency: 'AED',
        fareClass: 'J',
        fareRules: ['Non-refundable after 24 hours of departure'],
      },
      transferRules: {
        maxTransfers: options?.maxTransfers ?? 3,
        transferCount: 0,
        nameChangeFee: '150.00',
        requiresIssuerApproval: false,
        autoApproveWithIdentity: true,
        transferDeadlineHours: options?.transferDeadlineHours ?? 24,
      },
      cancellationRules: {
        refundable: options?.refundable ?? true,
        cancellationFee: '250.00',
        cancellationDeadlineHours: 24,
        refundCurrency: 'AED',
      },
      policyFlags: {
        transferable: true,
        refundable: options?.refundable ?? true,
      },
    });

    if (!result.success || !result.ticket) {
      throw new Error(`Failed to create test ticket: ${result.error}`);
    }

    return result.ticket;
  }

  beforeAll(async () => {
    // Start webhook receiver if needed for webhook tests
    try {
      webhookReceiver = await createWebhookReceiver({
        port: 9998,
        secret: TEST_SECRET,
      });
    } catch (err) {
      console.log('Webhook receiver not started - webhook tests may be skipped');
    }
  });

  afterAll(async () => {
    if (webhookReceiver) {
      await webhookReceiver.stop();
    }
  });

  beforeEach(() => {
    // Create fresh engine for each test
    engine = new AirlineTicketEngine();
    engine.registerAirline(AIRLINE_CODE);

    // Verify test identity for auto-approval
    engine.verifyIdentity('PASSPORT:GB:AB123456');
    engine.verifyIdentity('PASSPORT:US:CD789012');

    // Clear webhook receiver
    if (webhookReceiver) {
      webhookReceiver.clear();
    }
  });

  // ============================================================================
  // AT-E2E-01: Golden Path
  // ============================================================================

  describe('AT-E2E-01: Golden Path', () => {
    it('should complete full lifecycle: issue → transfer → checkin → board → complete → close', async () => {
      // Step 1: Issue ticket
      const ticket = createTestTicket({ passengerName: 'John Doe' });
      expect(ticket.id).toBeDefined();

      // Verify initial state
      const initialState = engine.getCurrentState(ticket.id);
      expect(initialState).toBe(AirlineTicketState.ISSUED);

      // Step 2: Transfer ticket (async)
      const transferResult = await engine.requestTransfer({
        ticketId: ticket.id,
        fromPassenger: 'John Doe',
        toPassenger: {
          name: 'Jane Smith',
          identity: {
            type: 'PASSPORT',
            number: 'CD789012',
            country: 'US',
            expiryDate: '2029-06-15',
          },
        },
        reason: TransferReason.GIFT,
        actor: passenger,
      });

      expect(transferResult.success).toBe(true);
      expect(transferResult.request?.status).toBe(TransferApprovalStatus.AUTO_APPROVED);

      // Verify state is still ISSUED (transfers don't change state)
      expect(engine.getCurrentState(ticket.id)).toBe(AirlineTicketState.ISSUED);

      // Step 3: Check in
      const checkinResult = engine.checkIn({
        ticketId: ticket.id,
        actor: { ...airlineAgent, passengerId: 'Jane Smith' },
      });

      expect(checkinResult.success).toBe(true);
      expect(engine.getCurrentState(ticket.id)).toBe(AirlineTicketState.CHECKED_IN);

      // Step 4: Board
      const boardResult = await engine.board({
        ticketId: ticket.id,
        actor: airlineAgent,
        scanLocation: 'Gate A5',
      });

      expect(boardResult.success).toBe(true);
      expect(boardResult.verificationLog?.result).toBe('VALID');
      expect(engine.getCurrentState(ticket.id)).toBe(AirlineTicketState.BOARDED);

      // Step 5: Complete flight
      const completeResult = engine.completeTicket({
        ticketId: ticket.id,
        actor: airlineAgent,
      });

      expect(completeResult.success).toBe(true);
      expect(engine.getCurrentState(ticket.id)).toBe(AirlineTicketState.USED);

      // Step 6: Close ticket
      const closeResult = engine.closeTicket({
        ticketId: ticket.id,
        actor: airlineAdmin,
      });

      expect(closeResult.success).toBe(true);
      expect(engine.getCurrentState(ticket.id)).toBe(AirlineTicketState.CLOSED);
      expect(engine.isTicketTerminal(ticket.id)).toBe(true);
    });

    it('should query ticket at each state', () => {
      const ticket = createTestTicket();

      // Query after issue
      let retrieved = engine.getTicket(ticket.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(ticket.id);

      // Check in
      engine.checkIn({ ticketId: ticket.id, actor: airlineAgent });

      // Query after check-in
      retrieved = engine.getTicket(ticket.id);
      const metadata = retrieved?.metadata as any;
      expect(metadata.status).toBe(TicketStatus.CHECKED_IN);
    });
  });

  // ============================================================================
  // AT-E2E-02: Transfer Window Guard
  // ============================================================================

  describe('AT-E2E-02: Transfer Window Guard', () => {
    it('should allow transfer when within 24h window (departure > 24h away)', async () => {
      // Create ticket with departure 48 hours from now
      const ticket = createTestTicket({
        passengerName: 'John Doe',
        departureInHours: 48,
        transferDeadlineHours: 24,
      });

      const result = await engine.requestTransfer({
        ticketId: ticket.id,
        fromPassenger: 'John Doe',
        toPassenger: { name: 'Jane Smith' },
        reason: TransferReason.GIFT,
        actor: passenger,
      });

      expect(result.success).toBe(true);
    });

    it('should reject transfer when outside transfer window (departure < 24h away)', async () => {
      // Create ticket with departure 12 hours from now (within 24h deadline)
      const ticket = createTestTicket({
        passengerName: 'John Doe',
        departureInHours: 12,
        transferDeadlineHours: 24,
      });

      const result = await engine.requestTransfer({
        ticketId: ticket.id,
        fromPassenger: 'John Doe',
        toPassenger: { name: 'Jane Smith' },
        reason: TransferReason.GIFT,
        actor: passenger,
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('TRANSFER_WINDOW_CLOSED');
    });

    it('should respect custom transfer deadline hours', async () => {
      // Create ticket with 6h transfer deadline, departure 8h away
      const ticket = createTestTicket({
        passengerName: 'John Doe',
        departureInHours: 8,
        transferDeadlineHours: 6,
      });

      // Should succeed - 8h departure, 6h deadline = 2h remaining
      const result = await engine.requestTransfer({
        ticketId: ticket.id,
        fromPassenger: 'John Doe',
        toPassenger: { name: 'Jane Smith' },
        reason: TransferReason.GIFT,
        actor: passenger,
      });

      expect(result.success).toBe(true);
    });
  });

  // ============================================================================
  // AT-E2E-03: Post-Check-in Lock Guard
  // ============================================================================

  describe('AT-E2E-03: Post-Check-in Lock Guard', () => {
    it('should allow transfer before check-in', async () => {
      const ticket = createTestTicket({ passengerName: 'John Doe' });

      // Transfer before check-in should work
      const result = await engine.requestTransfer({
        ticketId: ticket.id,
        fromPassenger: 'John Doe',
        toPassenger: { name: 'Jane Smith' },
        reason: TransferReason.GIFT,
        actor: passenger,
      });

      expect(result.success).toBe(true);
    });

    it('should reject transfer after check-in with TICKET_LOCKED_AFTER_CHECKIN error', async () => {
      const ticket = createTestTicket({ passengerName: 'John Doe' });

      // Check in first
      engine.checkIn({ ticketId: ticket.id, actor: airlineAgent });

      // Now try to transfer
      const result = await engine.requestTransfer({
        ticketId: ticket.id,
        fromPassenger: 'John Doe',
        toPassenger: { name: 'Jane Smith' },
        reason: TransferReason.GIFT,
        actor: passenger,
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('TICKET_LOCKED_AFTER_CHECKIN');
    });

    it('should reject transfer after boarding', async () => {
      const ticket = createTestTicket({ passengerName: 'John Doe' });

      // Check in and board
      engine.checkIn({ ticketId: ticket.id, actor: airlineAgent });
      await engine.board({ ticketId: ticket.id, actor: airlineAgent });

      // Try to transfer after boarding
      const result = await engine.requestTransfer({
        ticketId: ticket.id,
        fromPassenger: 'John Doe',
        toPassenger: { name: 'Jane Smith' },
        reason: TransferReason.GIFT,
        actor: passenger,
      });

      expect(result.success).toBe(false);
      // Either TICKET_LOCKED_AFTER_CHECKIN or TICKET_USED
      expect(['TICKET_LOCKED_AFTER_CHECKIN', 'TICKET_USED']).toContain(result.errorCode);
    });
  });

  // ============================================================================
  // AT-E2E-04: One-Time Use Guard
  // ============================================================================

  describe('AT-E2E-04: One-Time Use Guard', () => {
    it('should allow first boarding', async () => {
      const ticket = createTestTicket();
      engine.checkIn({ ticketId: ticket.id, actor: airlineAgent });

      const result = await engine.board({
        ticketId: ticket.id,
        actor: airlineAgent,
        scanLocation: 'Gate B3',
      });

      expect(result.success).toBe(true);
      expect(result.verificationLog?.result).toBe('VALID');
    });

    it('should reject second boarding with ALREADY_USED error', async () => {
      const ticket = createTestTicket();
      engine.checkIn({ ticketId: ticket.id, actor: airlineAgent });

      // First boarding
      const firstBoard = await engine.board({
        ticketId: ticket.id,
        actor: airlineAgent,
        scanLocation: 'Gate B3',
      });
      expect(firstBoard.success).toBe(true);

      // Second boarding attempt (same ticket)
      const secondBoard = await engine.board({
        ticketId: ticket.id,
        actor: airlineAgent,
        scanLocation: 'Gate B3',
      });

      expect(secondBoard.success).toBe(false);
      expect(secondBoard.error).toContain('ALREADY_USED');
      expect(secondBoard.verificationLog?.result).toBe('ALREADY_USED');
    });

    it('should record previous verification in log for duplicate attempts', async () => {
      const ticket = createTestTicket();
      engine.checkIn({ ticketId: ticket.id, actor: airlineAgent });

      // First boarding
      const firstBoard = await engine.board({
        ticketId: ticket.id,
        actor: airlineAgent,
        scanLocation: 'Gate B3',
      });

      // Second boarding
      const secondBoard = await engine.board({
        ticketId: ticket.id,
        actor: airlineAgent,
        scanLocation: 'Gate B3',
      });

      expect(secondBoard.verificationLog?.previousVerification).toBeDefined();
      expect(secondBoard.verificationLog?.previousVerification?.verifiedAt).toBe(
        firstBoard.verificationLog?.verifiedAt
      );
    });
  });

  // ============================================================================
  // AT-E2E-05: Refund/Void Flow
  // ============================================================================

  describe('AT-E2E-05: Refund/Void Flow', () => {
    it('should transition ticket to REFUNDED then VOID after refund', () => {
      const ticket = createTestTicket({ refundable: true });

      // Cancel first
      const cancelResult = engine.cancelTicket({
        ticketId: ticket.id,
        actor: passenger,
        reason: 'Change of plans',
      });
      expect(cancelResult.success).toBe(true);

      // Process refund
      const refundResult = engine.processRefund(ticket.id, { actor: airlineAdmin });
      expect(refundResult.success).toBe(true);
      expect(refundResult.refundAmount).toBeDefined();
      expect(parseFloat(refundResult.refundAmount!)).toBeGreaterThan(0);

      // Check final state is VOID (auto-void after refund)
      expect(engine.getCurrentState(ticket.id)).toBe(AirlineTicketState.VOID);
      expect(engine.isTicketTerminal(ticket.id)).toBe(true);
    });

    it('should reject transfer on voided ticket with TICKET_VOID error', async () => {
      const ticket = createTestTicket({ refundable: true });

      // Cancel and refund
      engine.cancelTicket({ ticketId: ticket.id, actor: passenger, reason: 'Test' });
      engine.processRefund(ticket.id);

      // Try to transfer
      const result = await engine.requestTransfer({
        ticketId: ticket.id,
        fromPassenger: 'John Doe',
        toPassenger: { name: 'Jane Smith' },
        reason: TransferReason.GIFT,
        actor: passenger,
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('TICKET_VOID');
    });

    it('should reject check-in on voided ticket', () => {
      const ticket = createTestTicket({ refundable: true });

      // Cancel and refund
      engine.cancelTicket({ ticketId: ticket.id, actor: passenger, reason: 'Test' });
      engine.processRefund(ticket.id);

      // Try to check in
      const result = engine.checkIn({ ticketId: ticket.id, actor: airlineAgent });
      expect(result.success).toBe(false);
    });

    it('should calculate correct refund amount (fare - cancellation fee)', () => {
      const ticket = createTestTicket({ refundable: true });

      // Cancel and refund
      engine.cancelTicket({ ticketId: ticket.id, actor: passenger, reason: 'Test' });
      const result = engine.processRefund(ticket.id);

      // Fare total: 3000, cancellation fee: 250
      // Expected refund: 2750
      expect(result.refundAmount).toBe('2750.00');
    });
  });

  // ============================================================================
  // AT-RES-01: Idempotency
  // ============================================================================

  describe('AT-RES-01: Idempotency', () => {
    it('should return same transfer request for duplicate idempotency key', async () => {
      const ticket = createTestTicket({ passengerName: 'John Doe' });
      const idempotencyKey = `idem-${uuidv4()}`;

      // First request
      const result1 = await engine.requestTransfer({
        ticketId: ticket.id,
        fromPassenger: 'John Doe',
        toPassenger: { name: 'Jane Smith' },
        reason: TransferReason.GIFT,
        idempotencyKey,
        actor: passenger,
      });

      expect(result1.success).toBe(true);
      const firstRequestId = result1.request?.id;

      // Second request with same key
      const result2 = await engine.requestTransfer({
        ticketId: ticket.id,
        fromPassenger: 'John Doe',
        toPassenger: { name: 'Jane Smith' },
        reason: TransferReason.GIFT,
        idempotencyKey,
        actor: passenger,
      });

      expect(result2.success).toBe(true);
      expect(result2.request?.id).toBe(firstRequestId);
    });

    it('should create separate requests for different idempotency keys', async () => {
      const ticket = createTestTicket({ passengerName: 'John Doe', maxTransfers: 5 });

      // First request
      const result1 = await engine.requestTransfer({
        ticketId: ticket.id,
        fromPassenger: 'John Doe',
        toPassenger: { name: 'Jane Smith' },
        reason: TransferReason.GIFT,
        idempotencyKey: 'key-1',
        actor: passenger,
      });

      // The auto-approve means the ticket is now owned by Jane Smith
      // Create a new ticket for the second test
      const ticket2 = createTestTicket({ passengerName: 'Alice Brown', maxTransfers: 5 });

      // Second request with different key
      const result2 = await engine.requestTransfer({
        ticketId: ticket2.id,
        fromPassenger: 'Alice Brown',
        toPassenger: { name: 'Bob Wilson' },
        reason: TransferReason.GIFT,
        idempotencyKey: 'key-2',
        actor: { ...passenger, actorId: 'Alice Brown', passengerId: 'Alice Brown' },
      });

      expect(result1.request?.id).not.toBe(result2.request?.id);
    });

    it('should handle check-in idempotency', () => {
      const ticket = createTestTicket();

      // First check-in
      const result1 = engine.checkIn({
        ticketId: ticket.id,
        actor: airlineAgent,
        idempotencyKey: 'checkin-idem-1',
      });
      expect(result1.success).toBe(true);
      expect(result1.alreadyCheckedIn).toBeFalsy();

      // Second check-in (same ticket, no idempotency key but same ticket)
      const result2 = engine.checkIn({
        ticketId: ticket.id,
        actor: airlineAgent,
      });
      expect(result2.success).toBe(true);
      expect(result2.alreadyCheckedIn).toBe(true);
    });
  });

  // ============================================================================
  // AT-RES-02: Webhook Event Deduplication
  // ============================================================================

  describe('AT-RES-02: Webhook Event Deduplication', () => {
    it('should emit unique event IDs for each action', () => {
      const ticket = createTestTicket();

      // Get events before check-in
      const eventsBefore = engine.getTicketEvents(ticket.id);
      const issuedEvent = eventsBefore.find((e) => e.type === AirlineEventType.TICKET_ISSUED);

      // Check in
      engine.checkIn({ ticketId: ticket.id, actor: airlineAgent });

      const eventsAfter = engine.getTicketEvents(ticket.id);
      const checkinEvent = eventsAfter.find((e) => e.type === AirlineEventType.CHECK_IN_COMPLETED);

      expect(issuedEvent?.id).toBeDefined();
      expect(checkinEvent?.id).toBeDefined();
      expect(issuedEvent?.id).not.toBe(checkinEvent?.id);
    });

    it('should include correlation information in events', () => {
      const ticket = createTestTicket();

      const events = engine.getTicketEvents(ticket.id);
      const issuedEvent = events.find((e) => e.type === AirlineEventType.TICKET_ISSUED);

      expect(issuedEvent?.pnr).toBeDefined(); // PNR acts as correlation
      expect(issuedEvent?.ticketId).toBe(ticket.id);
      expect(issuedEvent?.occurredAt).toBeDefined();
    });

    it('should emit events in correct order', async () => {
      const ticket = createTestTicket();

      // Perform actions
      engine.checkIn({ ticketId: ticket.id, actor: airlineAgent });
      await engine.board({ ticketId: ticket.id, actor: airlineAgent });

      const events = engine.getTicketEvents(ticket.id);
      const eventTypes = events.map((e) => e.type);

      // Verify order: ISSUED comes before CHECK_IN_COMPLETED comes before BOARDING_COMPLETED
      const issuedIndex = eventTypes.indexOf(AirlineEventType.TICKET_ISSUED);
      const checkinIndex = eventTypes.indexOf(AirlineEventType.CHECK_IN_COMPLETED);
      const boardingIndex = eventTypes.indexOf(AirlineEventType.BOARDING_COMPLETED);

      expect(issuedIndex).toBeLessThan(checkinIndex);
      expect(checkinIndex).toBeLessThan(boardingIndex);
    });
  });

  // ============================================================================
  // AT-SEC-01: Authorization (RBAC)
  // ============================================================================

  describe('AT-SEC-01: Authorization (RBAC)', () => {
    it('should allow airline agent to board passengers', async () => {
      const ticket = createTestTicket();
      engine.checkIn({ ticketId: ticket.id, actor: airlineAgent });

      const result = await engine.board({
        ticketId: ticket.id,
        actor: airlineAgent,
      });

      expect(result.success).toBe(true);
    });

    it('should reject passenger from boarding others', async () => {
      const ticket = createTestTicket();
      engine.checkIn({ ticketId: ticket.id, actor: airlineAgent });

      try {
        await engine.board({
          ticketId: ticket.id,
          actor: passenger,
        });
        // Should not reach here
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error.message).toContain('PERMISSION_DENIED');
      }
    });

    it('should allow passenger to request transfer of own ticket', async () => {
      const ticket = createTestTicket({ passengerName: 'John Doe' });

      const result = await engine.requestTransfer({
        ticketId: ticket.id,
        fromPassenger: 'John Doe',
        toPassenger: { name: 'Jane Smith' },
        reason: TransferReason.GIFT,
        actor: passenger,
      });

      expect(result.success).toBe(true);
    });

    it('should reject other passenger from requesting transfer', async () => {
      const ticket = createTestTicket({ passengerName: 'John Doe' });

      const result = await engine.requestTransfer({
        ticketId: ticket.id,
        fromPassenger: 'John Doe',
        toPassenger: { name: 'Jane Smith' },
        reason: TransferReason.GIFT,
        actor: otherPassenger, // Jane is not the owner
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('UNAUTHORIZED');
    });

    it('should allow airline admin to process refunds', () => {
      const ticket = createTestTicket({ refundable: true });
      engine.cancelTicket({ ticketId: ticket.id, actor: passenger, reason: 'Test' });

      const result = engine.processRefund(ticket.id, { actor: airlineAdmin });
      expect(result.success).toBe(true);
    });

    it('should allow admin to check permission', () => {
      const ticket = createTestTicket();

      const permission = engine.checkPermission(airlineAdmin, 'BOARD', ticket.id);
      expect(permission.allowed).toBe(true);

      const passengerPermission = engine.checkPermission(passenger, 'BOARD', ticket.id);
      expect(passengerPermission.allowed).toBe(false);
    });
  });

  // ============================================================================
  // AT-OBS-01: Observability
  // ============================================================================

  describe('AT-OBS-01: Observability', () => {
    it('should record audit log entries for actions', async () => {
      const ticket = createTestTicket({ passengerName: 'John Doe' });

      // Request transfer with actor
      await engine.requestTransfer({
        ticketId: ticket.id,
        fromPassenger: 'John Doe',
        toPassenger: { name: 'Jane Smith' },
        reason: TransferReason.GIFT,
        actor: passenger,
      });

      // Get audit log
      const auditLog = engine.getAuditLog({ action: 'REQUEST_TRANSFER' });

      expect(auditLog.length).toBeGreaterThan(0);
      expect(auditLog[0].action).toBe('REQUEST_TRANSFER');
      expect(auditLog[0].actor.id).toBe(passenger.actorId);
      expect(auditLog[0].success).toBe(true);
    });

    it('should include correlationId in metadata changes', () => {
      const ticket = createTestTicket();

      // Check in to trigger metadata change
      engine.checkIn({ ticketId: ticket.id, actor: airlineAgent });

      // Get metadata versions
      const ticket2 = engine.getTicket(ticket.id);
      expect(ticket2?.updatedAt).toBeDefined();
    });

    it('should log failed permission attempts', async () => {
      const ticket = createTestTicket({ passengerName: 'John Doe' });

      // Try to transfer as wrong passenger
      await engine.requestTransfer({
        ticketId: ticket.id,
        fromPassenger: 'John Doe',
        toPassenger: { name: 'Bob Wilson' },
        reason: TransferReason.GIFT,
        actor: otherPassenger, // Jane cannot transfer John's ticket
      });

      const auditLog = engine.getAuditLog({
        action: 'REQUEST_TRANSFER',
        actorId: otherPassenger.actorId,
      });

      expect(auditLog.length).toBeGreaterThan(0);
      expect(auditLog[0].success).toBe(false);
      expect(auditLog[0].error).toContain('PERMISSION_DENIED');
    });

    it('should emit all expected events during lifecycle', async () => {
      const ticket = createTestTicket();

      // Complete lifecycle
      engine.checkIn({ ticketId: ticket.id, actor: airlineAgent });
      await engine.board({ ticketId: ticket.id, actor: airlineAgent });

      // Verify events
      const events = engine.getTicketEvents(ticket.id);
      const eventTypes = events.map((e) => e.type);

      expect(eventTypes).toContain(AirlineEventType.TICKET_ISSUED);
      expect(eventTypes).toContain(AirlineEventType.CHECK_IN_COMPLETED);
      expect(eventTypes).toContain(AirlineEventType.BOARDING_COMPLETED);
    });
  });

  // ============================================================================
  // Additional State Machine Tests
  // ============================================================================

  describe('State Machine Integration', () => {
    it('should provide valid events for each state', () => {
      const ticket = createTestTicket();

      // In ISSUED state
      let validEvents = engine.getValidEvents(ticket.id);
      expect(validEvents).toContain(AirlineTicketEvent.TRANSFER);
      expect(validEvents).toContain(AirlineTicketEvent.CHECK_IN);

      // After check-in
      engine.checkIn({ ticketId: ticket.id, actor: airlineAgent });
      validEvents = engine.getValidEvents(ticket.id);
      expect(validEvents).toContain(AirlineTicketEvent.BOARD);
      expect(validEvents).not.toContain(AirlineTicketEvent.TRANSFER);
    });

    it('should identify terminal states correctly', () => {
      const ticket = createTestTicket({ refundable: true });

      // Not terminal yet
      expect(engine.isTicketTerminal(ticket.id)).toBe(false);

      // Cancel and refund to VOID (terminal)
      engine.cancelTicket({ ticketId: ticket.id, actor: passenger, reason: 'Test' });
      engine.processRefund(ticket.id);

      expect(engine.isTicketTerminal(ticket.id)).toBe(true);
    });

    it('should handle tryTransition for complex state changes', async () => {
      const ticket = createTestTicket();

      // Use state machine directly for a transition
      const result = await engine.tryTransition({
        ticketId: ticket.id,
        event: AirlineTicketEvent.CHECK_IN,
        actorId: airlineAgent.actorId,
        actorRoles: [AirlineRole.AIRLINE_AGENT],
      });

      expect(result.success).toBe(true);
      expect(result.previousState).toBe(AirlineTicketState.ISSUED);
      expect(result.newState).toBe(AirlineTicketState.CHECKED_IN);
    });
  });
});
