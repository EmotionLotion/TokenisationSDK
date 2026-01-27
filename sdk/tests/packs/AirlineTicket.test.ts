/**
 * Airline Ticket Engine Tests
 *
 * Production-readiness test cases covering:
 * - TC-1: Create ticket token (mint)
 * - TC-2: Check-in state transition
 * - TC-3: Boarding / consumed
 * - TC-4: Transfer allowed before check-in
 * - TC-5: Transfer blocked after check-in
 * - TC-6: Bulk operations and reconciliation
 * - TC-8: Rebook / reissue
 * - TC-9: Double-spend prevention
 * - TC-10: Metadata versioning
 * - TC-16: RBAC enforcement
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  AirlineTicketEngine,
  TicketClass,
  TicketStatus,
  AirlineRole,
  type ActorContext,
  type FlightSegment,
} from '../../src/packs/AirlineTicket.js';

describe('AirlineTicketEngine', () => {
  let engine: AirlineTicketEngine;
  const AIRLINE_CODE = 'EK';

  // Test actors
  const airlineAdmin: ActorContext = {
    actorId: 'airline-admin-1',
    role: AirlineRole.AIRLINE_ADMIN,
    airlineCode: AIRLINE_CODE,
  };

  const airlineAgent: ActorContext = {
    actorId: 'agent-1',
    role: AirlineRole.AIRLINE_AGENT,
    airlineCode: AIRLINE_CODE,
  };

  const passenger: ActorContext = {
    actorId: 'John Doe',
    role: AirlineRole.PASSENGER,
    passengerId: 'John Doe',
  };

  const auditor: ActorContext = {
    actorId: 'auditor-1',
    role: AirlineRole.AUDITOR,
  };

  const testSegment: FlightSegment = {
    flightNumber: 'EK001',
    airline: AIRLINE_CODE,
    departure: {
      airport: 'DXB',
      terminal: 'T3',
      dateTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days from now
    },
    arrival: {
      airport: 'LHR',
      terminal: 'T3',
      dateTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000 + 7 * 60 * 60 * 1000).toISOString(),
    },
    class: TicketClass.BUSINESS,
    seatNumber: '1A',
  };

  const defaultTicketParams = {
    airlineCode: AIRLINE_CODE,
    bookingReference: 'ABC123',
    eTicketNumber: '176-1234567890',
    passengerName: 'John Doe',
    segments: [testSegment],
    fare: {
      baseFare: '1000.00',
      taxes: '200.00',
      total: '1200.00',
      currency: 'USD',
      fareClass: 'J',
      fareRules: ['Non-refundable after check-in'],
    },
    transferRules: {
      maxTransfers: 2,
      transferCount: 0,
      nameChangeFee: '50.00',
      requiresIssuerApproval: true,
      autoApproveWithIdentity: true,
      transferDeadlineHours: 24,
    },
    cancellationRules: {
      refundable: true,
      cancellationFee: '100.00',
      cancellationDeadlineHours: 48,
      refundCurrency: 'USD',
    },
  };

  beforeEach(() => {
    engine = new AirlineTicketEngine();
    engine.registerAirline(AIRLINE_CODE);
  });

  // ==========================================================================
  // TC-1: Create ticket token (mint)
  // ==========================================================================
  describe('TC-1: Create ticket token', () => {
    it('should mint ticket with correct metadata', () => {
      const result = engine.issue(defaultTicketParams);

      expect(result.success).toBe(true);
      expect(result.ticket).toBeDefined();
      expect(result.ticket!.id).toBeDefined();
      expect(result.ticket!.metadata).toBeDefined();

      const metadata = result.ticket!.metadata as Record<string, unknown>;
      expect(metadata.bookingReference).toBe('ABC123');
      expect(metadata.eTicketNumber).toBe('176-1234567890');
      expect(metadata.passengerName).toBe('John Doe');
      expect(metadata.status).toBe(TicketStatus.ISSUED);
    });

    it('should reject ticket from unauthorized airline', () => {
      const result = engine.issue({
        ...defaultTicketParams,
        airlineCode: 'XX', // Not registered
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Airline not authorized');
    });

    it('should create audit trail on issuance', () => {
      const result = engine.issue(defaultTicketParams);
      expect(result.success).toBe(true);

      const versions = engine.getMetadataVersions(result.ticket!.id);
      expect(versions.length).toBe(1);
      expect(versions[0].version).toBe(0);
      expect(versions[0].changeReason).toBe('Initial issuance');
    });
  });

  // ==========================================================================
  // TC-2: Check-in state transition
  // ==========================================================================
  describe('TC-2: Check-in state transition', () => {
    it('should transition ISSUED -> CHECKED_IN', () => {
      const { ticket } = engine.issue(defaultTicketParams);
      const result = engine.checkIn({
        ticketId: ticket!.id,
        actor: passenger,
      });

      expect(result.success).toBe(true);
      const metadata = result.ticket!.metadata as Record<string, unknown>;
      expect(metadata.status).toBe(TicketStatus.CHECKED_IN);
    });

    it('should be idempotent (repeated check-in returns success)', () => {
      const { ticket } = engine.issue(defaultTicketParams);

      // First check-in
      const result1 = engine.checkIn({ ticketId: ticket!.id, actor: passenger });
      expect(result1.success).toBe(true);
      expect(result1.alreadyCheckedIn).toBeFalsy();

      // Second check-in (idempotent)
      const result2 = engine.checkIn({ ticketId: ticket!.id, actor: passenger });
      expect(result2.success).toBe(true);
      expect(result2.alreadyCheckedIn).toBe(true);
    });

    it('should enforce state machine (no illegal jumps)', () => {
      const { ticket } = engine.issue(defaultTicketParams);

      // Cancel the ticket first
      engine.cancel({ ticketId: ticket!.id, requestedBy: 'John Doe' });

      // Try to check in cancelled ticket
      const result = engine.checkIn({ ticketId: ticket!.id, actor: passenger });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot check in from status CANCELLED');
    });
  });

  // ==========================================================================
  // TC-3: Boarding / consumed
  // ==========================================================================
  describe('TC-3: Boarding / consumed', () => {
    it('should transition CHECKED_IN -> BOARDED', async () => {
      const { ticket } = engine.issue(defaultTicketParams);
      engine.checkIn({ ticketId: ticket!.id, actor: passenger });

      const result = await engine.board({
        ticketId: ticket!.id,
        actor: airlineAgent,
        scanLocation: 'Gate B12',
      });

      expect(result.success).toBe(true);
      expect(result.verificationLog?.result).toBe('VALID');
      const metadata = result.ticket!.metadata as Record<string, unknown>;
      expect(metadata.status).toBe(TicketStatus.BOARDED);
    });

    it('should block boarding if not checked in', async () => {
      const { ticket } = engine.issue(defaultTicketParams);

      const result = await engine.board({
        ticketId: ticket!.id,
        actor: airlineAgent,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Must be CHECKED_IN first');
      expect(result.verificationLog?.result).toBe('INVALID');
    });

    it('should provide proof/receipt for audits', async () => {
      const { ticket } = engine.issue(defaultTicketParams);
      engine.checkIn({ ticketId: ticket!.id, actor: passenger });

      await engine.board({
        ticketId: ticket!.id,
        actor: airlineAgent,
        scanLocation: 'Gate B12',
      });

      const logs = engine.getVerificationLogs(ticket!.id);
      expect(logs.length).toBe(1);
      expect(logs[0].result).toBe('VALID');
      expect(logs[0].scanLocation).toBe('Gate B12');
    });
  });

  // ==========================================================================
  // TC-4 & TC-5: Transfer rules
  // ==========================================================================
  describe('TC-4 & TC-5: Transfer rules', () => {
    it('TC-4: should allow transfer before check-in', () => {
      const { ticket } = engine.issue(defaultTicketParams);

      const result = engine.requestTransfer({
        ticketId: ticket!.id,
        fromPassenger: 'John Doe',
        toPassenger: { name: 'Jane Doe' },
      });

      expect(result.success).toBe(true);
      expect(result.request).toBeDefined();
    });

    it('TC-5: should block transfer after check-in', () => {
      const { ticket } = engine.issue(defaultTicketParams);
      engine.checkIn({ ticketId: ticket!.id, actor: passenger });

      const result = engine.requestTransfer({
        ticketId: ticket!.id,
        fromPassenger: 'John Doe',
        toPassenger: { name: 'Jane Doe' },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Ticket cannot be transferred in current status');
    });
  });

  // ==========================================================================
  // TC-6: Bulk operations and reconciliation
  // ==========================================================================
  describe('TC-6: Bulk operations', () => {
    it('should bulk update ticket status', async () => {
      // Issue multiple tickets
      const ticket1 = engine.issue(defaultTicketParams).ticket!;
      const ticket2 = engine.issue({ ...defaultTicketParams, eTicketNumber: '176-0000000002' }).ticket!;
      const ticket3 = engine.issue({ ...defaultTicketParams, eTicketNumber: '176-0000000003' }).ticket!;

      const result = await engine.bulkUpdateStatus({
        ticketIds: [ticket1.id, ticket2.id, ticket3.id],
        newStatus: TicketStatus.CANCELLED,
        actor: airlineAdmin,
        reason: 'Flight cancelled',
      });

      expect(result.totalProcessed).toBe(3);
      expect(result.totalSuccess).toBe(3);
      expect(result.totalFailed).toBe(0);
    });

    it('should handle partial failures in bulk operations', async () => {
      const ticket1 = engine.issue(defaultTicketParams).ticket!;
      const ticket2 = engine.issue({ ...defaultTicketParams, eTicketNumber: '176-0000000002' }).ticket!;

      // Check in one ticket (can't cancel after boarding)
      engine.checkIn({ ticketId: ticket2.id, actor: passenger });
      await engine.board({ ticketId: ticket2.id, actor: airlineAgent });

      const result = await engine.bulkUpdateStatus({
        ticketIds: [ticket1.id, ticket2.id, 'non-existent-id'],
        newStatus: TicketStatus.CANCELLED,
        actor: airlineAdmin,
        reason: 'Test cancellation',
      });

      expect(result.totalSuccess).toBe(1); // ticket1
      expect(result.totalFailed).toBe(2); // ticket2 (boarded), non-existent
    });

    it('should generate reconciliation report', () => {
      // Issue tickets for the same flight
      const departureDate = testSegment.departure.dateTime.split('T')[0];
      engine.issue(defaultTicketParams);
      engine.issue({ ...defaultTicketParams, eTicketNumber: '176-0000000002', passengerName: 'Jane Doe' });

      const report = engine.generateReconciliationReport({
        flightNumber: 'EK001',
        airlineCode: AIRLINE_CODE,
        departureDate,
        actor: airlineAdmin,
      });

      expect(report.reportId).toBeDefined();
      expect(report.summary.totalTickets).toBe(2);
      expect(report.summary.byStatus[TicketStatus.ISSUED]).toBe(2);
      expect(report.exportFormats.csv).toContain('John Doe');
      expect(report.exportFormats.csv).toContain('Jane Doe');
      expect(report.exportFormats.json).toContain('John Doe');
    });

    it('should allow auditor to generate reports', () => {
      engine.issue(defaultTicketParams);
      const departureDate = testSegment.departure.dateTime.split('T')[0];

      const report = engine.generateReconciliationReport({
        flightNumber: 'EK001',
        airlineCode: AIRLINE_CODE,
        departureDate,
        actor: auditor,
      });

      expect(report.reportId).toBeDefined();
    });
  });

  // ==========================================================================
  // TC-8: Rebook / reissue
  // ==========================================================================
  describe('TC-8: Rebook / reissue', () => {
    it('should rebook ticket to new flight', () => {
      const { ticket } = engine.issue(defaultTicketParams);

      const newSegment: FlightSegment = {
        ...testSegment,
        flightNumber: 'EK002',
        departure: {
          ...testSegment.departure,
          dateTime: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString(),
        },
      };

      const result = engine.rebook({
        originalTicketId: ticket!.id,
        newSegments: [newSegment],
        reason: 'FLIGHT_CANCELLED',
        actor: airlineAdmin,
      });

      expect(result.success).toBe(true);
      expect(result.newTicket).toBeDefined();
      expect(result.rebookRecord).toBeDefined();
      expect(result.rebookRecord!.originalTicketId).toBe(ticket!.id);
      expect(result.rebookRecord!.newTicketId).toBe(result.newTicket!.id);

      // Original ticket should be cancelled
      const originalMetadata = engine.getTicket(ticket!.id)!.metadata as Record<string, unknown>;
      expect(originalMetadata.status).toBe(TicketStatus.CANCELLED);
    });

    it('should link rebooked tickets for audit trail', () => {
      const { ticket } = engine.issue(defaultTicketParams);

      const result = engine.rebook({
        originalTicketId: ticket!.id,
        newSegments: [{ ...testSegment, flightNumber: 'EK003' }],
        reason: 'SCHEDULE_CHANGE',
        actor: airlineAdmin,
      });

      // Check rebook history
      const history = engine.getRebookHistory(ticket!.id);
      expect(history.length).toBe(1);
      expect(history[0].reason).toBe('SCHEDULE_CHANGE');

      // Check original ticket link
      const originalTicket = engine.getOriginalTicket(result.newTicket!.id);
      expect(originalTicket?.id).toBe(ticket!.id);
    });
  });

  // ==========================================================================
  // TC-9: Double-spend prevention
  // ==========================================================================
  describe('TC-9: Double-spend prevention', () => {
    it('should prevent double boarding', async () => {
      const { ticket } = engine.issue(defaultTicketParams);
      engine.checkIn({ ticketId: ticket!.id, actor: passenger });

      // First boarding - succeeds
      const result1 = await engine.board({
        ticketId: ticket!.id,
        actor: airlineAgent,
        scanLocation: 'Gate A1',
      });
      expect(result1.success).toBe(true);
      expect(result1.verificationLog?.result).toBe('VALID');

      // Second boarding - fails with ALREADY_USED
      const result2 = await engine.board({
        ticketId: ticket!.id,
        actor: airlineAgent,
        scanLocation: 'Gate A2',
      });
      expect(result2.success).toBe(false);
      expect(result2.error).toContain('ALREADY_USED');
      expect(result2.verificationLog?.result).toBe('ALREADY_USED');
      expect(result2.verificationLog?.previousVerification).toBeDefined();
    });

    it('should record all verification attempts', async () => {
      const { ticket } = engine.issue(defaultTicketParams);
      engine.checkIn({ ticketId: ticket!.id, actor: passenger });

      // First scan
      await engine.board({ ticketId: ticket!.id, actor: airlineAgent, scanLocation: 'Gate A' });

      // Second scan (attacker attempt)
      await engine.board({ ticketId: ticket!.id, actor: airlineAgent, scanLocation: 'Gate B' });

      const logs = engine.getVerificationLogs(ticket!.id);
      expect(logs.length).toBe(2);
      expect(logs[0].result).toBe('VALID');
      expect(logs[1].result).toBe('ALREADY_USED');
    });
  });

  // ==========================================================================
  // TC-10: Metadata versioning
  // ==========================================================================
  describe('TC-10: Metadata versioning', () => {
    it('should track all metadata changes', async () => {
      const { ticket } = engine.issue(defaultTicketParams);

      // Check-in
      engine.checkIn({ ticketId: ticket!.id, actor: passenger });

      // Board
      await engine.board({ ticketId: ticket!.id, actor: airlineAgent });

      const versions = engine.getMetadataVersions(ticket!.id);
      expect(versions.length).toBe(3); // Issue, check-in, board

      expect(versions[0].changeReason).toBe('Initial issuance');
      expect(versions[1].changeReason).toBe('Check-in');
      expect(versions[2].changeReason).toBe('Boarding');

      // Verify hash chain
      expect(versions[1].previousHash).toBe(versions[0].currentHash);
      expect(versions[2].previousHash).toBe(versions[1].currentHash);
    });

    it('should record status changes in version history', () => {
      const { ticket } = engine.issue(defaultTicketParams);
      engine.checkIn({ ticketId: ticket!.id, actor: passenger });

      const versions = engine.getMetadataVersions(ticket!.id);
      const checkInVersion = versions[1];

      expect(checkInVersion.changes.status).toEqual({
        old: TicketStatus.ISSUED,
        new: TicketStatus.CHECKED_IN,
      });
    });
  });

  // ==========================================================================
  // TC-16: RBAC enforcement
  // ==========================================================================
  describe('TC-16: RBAC enforcement', () => {
    it('should enforce role-based permissions', () => {
      const { ticket } = engine.issue(defaultTicketParams);

      // Auditor cannot check-in
      expect(() => {
        engine.checkIn({ ticketId: ticket!.id, actor: auditor });
      }).toThrow('PERMISSION_DENIED');
    });

    it('should enforce ownership requirements', () => {
      const { ticket } = engine.issue(defaultTicketParams);

      const wrongPassenger: ActorContext = {
        actorId: 'Eve',
        role: AirlineRole.PASSENGER,
        passengerId: 'Eve', // Not the ticket owner
      };

      expect(() => {
        engine.checkIn({ ticketId: ticket!.id, actor: wrongPassenger });
      }).toThrow('Not the ticket owner');
    });

    it('should enforce airline matching', async () => {
      const { ticket } = engine.issue(defaultTicketParams);
      engine.checkIn({ ticketId: ticket!.id, actor: passenger });

      const wrongAirlineAgent: ActorContext = {
        actorId: 'agent-2',
        role: AirlineRole.AIRLINE_AGENT,
        airlineCode: 'QR', // Different airline
      };

      await expect(
        engine.board({ ticketId: ticket!.id, actor: wrongAirlineAgent })
      ).rejects.toThrow('cannot modify tickets from EK');
    });

    it('should allow platform admin full access', async () => {
      const { ticket } = engine.issue(defaultTicketParams);

      const platformAdmin: ActorContext = {
        actorId: 'platform-admin',
        role: AirlineRole.PLATFORM_ADMIN,
      };

      // Platform admin can check-in without ownership
      // Note: Platform admin bypasses ownership check in real implementation
      const result = engine.checkIn({ ticketId: ticket!.id, actor: platformAdmin });
      expect(result.success).toBe(true);
    });
  });
});
