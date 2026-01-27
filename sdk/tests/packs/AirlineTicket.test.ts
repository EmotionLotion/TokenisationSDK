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
  TransferReason,
  RevocationReason,
  CustodyModel,
  AirlineEventType,
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
    it('TC-4: should allow transfer before check-in', async () => {
      const { ticket } = engine.issue(defaultTicketParams);

      const result = await engine.requestTransfer({
        ticketId: ticket!.id,
        fromPassenger: 'John Doe',
        toPassenger: { name: 'Jane Doe' },
        reason: TransferReason.GIFT,
      });

      expect(result.success).toBe(true);
      expect(result.request).toBeDefined();
      expect(result.request!.reason).toBe(TransferReason.GIFT);
    });

    it('TC-5: should block transfer after check-in', async () => {
      const { ticket } = engine.issue(defaultTicketParams);
      engine.checkIn({ ticketId: ticket!.id, actor: passenger });

      const result = await engine.requestTransfer({
        ticketId: ticket!.id,
        fromPassenger: 'John Doe',
        toPassenger: { name: 'Jane Doe' },
        reason: TransferReason.RESALE,
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('TICKET_LOCKED_AFTER_CHECKIN');
      expect(result.error).toContain('locked after check-in');
    });

    it('should block transfer of frozen ticket', async () => {
      const { ticket } = engine.issue(defaultTicketParams);

      // Freeze the ticket
      engine.freezeTicket({
        ticketId: ticket!.id,
        actor: airlineAdmin,
        reason: 'FRAUD_INVESTIGATION',
      });

      const result = await engine.requestTransfer({
        ticketId: ticket!.id,
        fromPassenger: 'John Doe',
        toPassenger: { name: 'Jane Doe' },
        reason: TransferReason.RESALE,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('frozen');
    });

    it('should block transfer of revoked ticket', async () => {
      const { ticket } = engine.issue(defaultTicketParams);

      // Revoke the ticket
      engine.revokeTicket({
        ticketId: ticket!.id,
        actor: airlineAdmin,
        reason: RevocationReason.FRAUD_DETECTED,
        issueRefund: false,
      });

      const result = await engine.requestTransfer({
        ticketId: ticket!.id,
        fromPassenger: 'John Doe',
        toPassenger: { name: 'Jane Doe' },
        reason: TransferReason.RESALE,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('revoked');
    });

    it('should block transfer of non-transferable ticket', async () => {
      const { ticket } = engine.issue({
        ...defaultTicketParams,
        policyFlags: { transferable: false },
      });

      const result = await engine.requestTransfer({
        ticketId: ticket!.id,
        fromPassenger: 'John Doe',
        toPassenger: { name: 'Jane Doe' },
        reason: TransferReason.GIFT,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('non-transferable');
    });

    it('should require re-KYC for resale transfers', async () => {
      const { ticket } = engine.issue(defaultTicketParams);

      const result = await engine.requestTransfer({
        ticketId: ticket!.id,
        fromPassenger: 'John Doe',
        toPassenger: { name: 'Jane Doe' },
        reason: TransferReason.RESALE,
      });

      expect(result.success).toBe(true);
      expect(result.request!.reKycRequired).toBe(true);
      expect(result.request!.reKycCompleted).toBe(false);
    });

    it('should require re-KYC completion before approval', async () => {
      const { ticket } = engine.issue(defaultTicketParams);

      const transferResult = await engine.requestTransfer({
        ticketId: ticket!.id,
        fromPassenger: 'John Doe',
        toPassenger: { name: 'Jane Doe' },
        reason: TransferReason.RESALE,
      });

      // Try to approve without completing KYC
      const approvalResult = engine.approveTransfer({
        requestId: transferResult.request!.id,
        approvedBy: 'agent-1',
      });

      expect(approvalResult.success).toBe(false);
      expect(approvalResult.error).toContain('Re-KYC verification required');
    });

    it('should allow approval after re-KYC completion', async () => {
      const { ticket } = engine.issue(defaultTicketParams);

      const transferResult = await engine.requestTransfer({
        ticketId: ticket!.id,
        fromPassenger: 'John Doe',
        toPassenger: { name: 'Jane Doe' },
        reason: TransferReason.RESALE,
      });

      // Complete KYC
      const kycResult = engine.completeTransferKyc({
        requestId: transferResult.request!.id,
        verifiedBy: 'kyc-agent-1',
        verificationReference: 'KYC-REF-001',
      });
      expect(kycResult.success).toBe(true);

      // Now approve
      const approvalResult = engine.approveTransfer({
        requestId: transferResult.request!.id,
        approvedBy: 'agent-1',
      });

      expect(approvalResult.success).toBe(true);
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

  // ==========================================================================
  // Requirement F: Revocation & Override Powers
  // ==========================================================================
  describe('Requirement F: Revocation & Override Powers', () => {
    it('should revoke ticket with refund', () => {
      const { ticket } = engine.issue(defaultTicketParams);

      const result = engine.revokeTicket({
        ticketId: ticket!.id,
        actor: airlineAdmin,
        reason: RevocationReason.FRAUD_DETECTED,
        description: 'Suspected fraud',
        issueRefund: true,
      });

      expect(result.success).toBe(true);
      expect(result.record).toBeDefined();
      expect(result.record!.reason).toBe(RevocationReason.FRAUD_DETECTED);
      expect(result.record!.refundIssued).toBe(true);

      const metadata = engine.getTicket(ticket!.id)!.metadata as Record<string, unknown>;
      expect(metadata.revoked).toBe(true);
      expect(metadata.status).toBe(TicketStatus.CANCELLED);
    });

    it('should not appeal fraud/sanctions revocations', () => {
      const { ticket } = engine.issue(defaultTicketParams);

      const result = engine.revokeTicket({
        ticketId: ticket!.id,
        actor: airlineAdmin,
        reason: RevocationReason.FRAUD_DETECTED,
        issueRefund: false,
      });

      expect(result.record!.appealable).toBe(false);
    });

    it('should allow appeal for system errors', () => {
      const { ticket } = engine.issue(defaultTicketParams);

      const result = engine.revokeTicket({
        ticketId: ticket!.id,
        actor: airlineAdmin,
        reason: RevocationReason.SYSTEM_ERROR,
        issueRefund: true,
      });

      expect(result.record!.appealable).toBe(true);
    });

    it('should force reassign ticket with authorization', () => {
      const { ticket } = engine.issue(defaultTicketParams);

      const result = engine.forceReassign({
        ticketId: ticket!.id,
        actor: airlineAdmin,
        authorizedBy: 'manager-1',
        newPassenger: {
          name: 'New Passenger',
          identity: {
            type: 'PASSPORT',
            number: 'X1234567',
            country: 'US',
            expiryDate: '2030-01-01',
          },
        },
        reason: 'Regulatory requirement',
        regulatoryReference: 'REG-2024-001',
      });

      expect(result.success).toBe(true);
      expect(result.override).toBeDefined();
      expect(result.override!.overrideType).toBe('REASSIGN');
      expect(result.override!.authorizedBy).toBe('manager-1');

      const metadata = engine.getTicket(ticket!.id)!.metadata as Record<string, unknown>;
      expect(metadata.passengerName).toBe('New Passenger');
    });

    it('should not reassign frozen ticket', () => {
      const { ticket } = engine.issue(defaultTicketParams);

      engine.freezeTicket({
        ticketId: ticket!.id,
        actor: airlineAdmin,
        reason: 'REGULATORY',
      });

      const result = engine.forceReassign({
        ticketId: ticket!.id,
        actor: airlineAdmin,
        authorizedBy: 'manager-1',
        newPassenger: { name: 'New Passenger' },
        reason: 'Test',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('frozen');
    });

    it('should record override history', () => {
      const { ticket } = engine.issue(defaultTicketParams);

      engine.forceReassign({
        ticketId: ticket!.id,
        actor: airlineAdmin,
        authorizedBy: 'manager-1',
        newPassenger: { name: 'New Passenger' },
        reason: 'Test override',
      });

      const history = engine.getOverrideHistory(ticket!.id);
      expect(history.length).toBe(1);
      expect(history[0].reason).toBe('Test override');
    });
  });

  // ==========================================================================
  // Requirement F: Freeze functionality
  // ==========================================================================
  describe('Freeze functionality', () => {
    it('should freeze and unfreeze ticket', () => {
      const { ticket } = engine.issue(defaultTicketParams);

      // Freeze
      const freezeResult = engine.freezeTicket({
        ticketId: ticket!.id,
        actor: airlineAdmin,
        reason: 'FRAUD_INVESTIGATION',
        description: 'Under investigation',
      });

      expect(freezeResult.success).toBe(true);
      expect(freezeResult.freeze!.reason).toBe('FRAUD_INVESTIGATION');

      let metadata = engine.getTicket(ticket!.id)!.metadata as Record<string, unknown>;
      expect(metadata.frozen).toBe(true);

      // Unfreeze
      const unfreezeResult = engine.unfreezeTicket({
        ticketId: ticket!.id,
        actor: airlineAdmin,
      });

      expect(unfreezeResult.success).toBe(true);

      metadata = engine.getTicket(ticket!.id)!.metadata as Record<string, unknown>;
      expect(metadata.frozen).toBe(false);
    });

    it('should not freeze already frozen ticket', () => {
      const { ticket } = engine.issue(defaultTicketParams);

      engine.freezeTicket({
        ticketId: ticket!.id,
        actor: airlineAdmin,
        reason: 'REGULATORY',
      });

      const result = engine.freezeTicket({
        ticketId: ticket!.id,
        actor: airlineAdmin,
        reason: 'DISPUTE',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('already frozen');
    });

    it('should record freeze history', () => {
      const { ticket } = engine.issue(defaultTicketParams);

      engine.freezeTicket({
        ticketId: ticket!.id,
        actor: airlineAdmin,
        reason: 'SANCTIONS',
      });

      engine.unfreezeTicket({ ticketId: ticket!.id, actor: airlineAdmin });

      const history = engine.getFreezeHistory(ticket!.id);
      expect(history.length).toBe(1);
      expect(history[0].unfrozenAt).toBeDefined();
    });

    it('should emergency invalidate ticket', () => {
      const { ticket } = engine.issue(defaultTicketParams);

      const result = engine.emergencyInvalidate({
        ticketId: ticket!.id,
        actor: airlineAdmin,
        authorizedBy: 'security-lead',
        reason: 'Security threat detected',
      });

      expect(result.success).toBe(true);

      const metadata = engine.getTicket(ticket!.id)!.metadata as Record<string, unknown>;
      expect(metadata.revoked).toBe(true);
    });
  });

  // ==========================================================================
  // Requirement E: Custody & Recovery
  // ==========================================================================
  describe('Requirement E: Custody & Recovery', () => {
    it('should initiate recovery for lost device', () => {
      const { ticket } = engine.issue(defaultTicketParams);

      const result = engine.initiateRecovery({
        ticketId: ticket!.id,
        requestedBy: 'John Doe',
        reason: 'LOST_DEVICE',
        verificationMethod: 'IN_PERSON',
      });

      expect(result.success).toBe(true);
      expect(result.request).toBeDefined();
      expect(result.request!.status).toBe('PENDING');
      expect(result.request!.verified).toBe(false);
    });

    it('should complete full recovery flow', () => {
      const { ticket } = engine.issue(defaultTicketParams);

      // Initiate
      const initResult = engine.initiateRecovery({
        ticketId: ticket!.id,
        requestedBy: 'John Doe',
        reason: 'LOST_DEVICE',
        verificationMethod: 'VIDEO_CALL',
      });

      // Verify
      const verifyResult = engine.verifyRecovery({
        requestId: initResult.request!.id,
        actor: airlineAdmin,
      });
      expect(verifyResult.success).toBe(true);

      // Complete
      const completeResult = engine.completeRecovery({
        requestId: initResult.request!.id,
        actor: airlineAdmin,
        newDestination: '0xNewWalletAddress',
      });
      expect(completeResult.success).toBe(true);

      const requests = engine.getRecoveryRequests(ticket!.id);
      expect(requests[0].status).toBe('COMPLETED');
    });

    it('should not allow duplicate recovery requests', () => {
      const { ticket } = engine.issue(defaultTicketParams);

      engine.initiateRecovery({
        ticketId: ticket!.id,
        requestedBy: 'John Doe',
        reason: 'LOST_DEVICE',
        verificationMethod: 'IN_PERSON',
      });

      const secondResult = engine.initiateRecovery({
        ticketId: ticket!.id,
        requestedBy: 'John Doe',
        reason: 'STOLEN_DEVICE',
        verificationMethod: 'VIDEO_CALL',
      });

      expect(secondResult.success).toBe(false);
      expect(secondResult.error).toContain('already in progress');
    });

    it('should require verification before completion', () => {
      const { ticket } = engine.issue(defaultTicketParams);

      const initResult = engine.initiateRecovery({
        ticketId: ticket!.id,
        requestedBy: 'John Doe',
        reason: 'LOST_DEVICE',
        verificationMethod: 'IN_PERSON',
      });

      // Try to complete without verification
      const result = engine.completeRecovery({
        requestId: initResult.request!.id,
        actor: airlineAdmin,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('verified first');
    });
  });

  // ==========================================================================
  // Requirement C: Sanctions & KYC
  // ==========================================================================
  describe('Requirement C: Sanctions & KYC', () => {
    it('should clear sanctions check', () => {
      const { ticket } = engine.issue(defaultTicketParams);

      const result = engine.clearSanctionsCheck({
        ticketId: ticket!.id,
        actor: airlineAdmin,
        clearanceReference: 'SANCTIONS-CLR-001',
      });

      expect(result.success).toBe(true);

      const metadata = engine.getTicket(ticket!.id)!.metadata as Record<string, unknown>;
      const kycStatus = metadata.kycStatus as Record<string, unknown>;
      expect(kycStatus.sanctionsCleared).toBe(true);
      expect(kycStatus.sanctionsClearedAt).toBeDefined();
    });

    it('should flag sanctions alert and freeze ticket', () => {
      const { ticket } = engine.issue(defaultTicketParams);

      const result = engine.flagSanctionsAlert({
        ticketId: ticket!.id,
        actor: airlineAdmin,
        matchDetails: 'Potential match on OFAC list',
      });

      expect(result.success).toBe(true);

      const metadata = engine.getTicket(ticket!.id)!.metadata as Record<string, unknown>;
      expect(metadata.frozen).toBe(true);
    });
  });

  // ==========================================================================
  // Requirement D: Event Management
  // ==========================================================================
  describe('Requirement D: Event Management', () => {
    it('should emit and track events', () => {
      const { ticket } = engine.issue(defaultTicketParams);

      const events = engine.getTicketEvents(ticket!.id);
      expect(events.length).toBe(1);
      expect(events[0].type).toBe(AirlineEventType.TICKET_ISSUED);
    });

    it('should filter events by type', () => {
      const { ticket } = engine.issue(defaultTicketParams);
      engine.checkIn({ ticketId: ticket!.id, actor: passenger });

      // Issue another ticket
      engine.issue({ ...defaultTicketParams, eTicketNumber: '176-0000000099' });

      const issuedEvents = engine.getEventsByType(AirlineEventType.TICKET_ISSUED);
      expect(issuedEvents.length).toBe(2);
    });

    it('should register and manage webhooks', () => {
      engine.registerWebhook({
        endpointId: 'webhook-1',
        url: 'https://example.com/webhook',
        events: [AirlineEventType.TICKET_ISSUED, AirlineEventType.TICKET_CANCELLED],
        secret: 'secret-key',
        active: true,
        retryPolicy: { maxRetries: 3, backoffMs: 1000 },
      });

      // Issue a ticket - would trigger webhook in real implementation
      const { ticket } = engine.issue(defaultTicketParams);
      expect(ticket).toBeDefined();

      // Unregister
      const removed = engine.unregisterWebhook('webhook-1');
      expect(removed).toBe(true);
    });
  });

  // ==========================================================================
  // Policy flags (Requirement A)
  // ==========================================================================
  describe('Requirement A: Policy Flags', () => {
    it('should issue ticket with custom policy flags', () => {
      const { ticket } = engine.issue({
        ...defaultTicketParams,
        policyFlags: {
          transferable: false,
          refundable: false,
          upgradeable: true,
          standbyAllowed: true,
          reKycRequiredForTransfer: true,
          jurisdictionRules: {
            eu261Applicable: true,
            usDotApplicable: false,
            uaeGcaaApplicable: true,
          },
        },
        custodyModel: CustodyModel.PASSENGER_CUSTODY,
      });

      expect(ticket).toBeDefined();
      const metadata = ticket!.metadata as Record<string, unknown>;
      const policyFlags = metadata.policyFlags as Record<string, unknown>;

      expect(policyFlags.transferable).toBe(false);
      expect(policyFlags.refundable).toBe(false);
      expect(policyFlags.standbyAllowed).toBe(true);
      expect(metadata.custodyModel).toBe(CustodyModel.PASSENGER_CUSTODY);
    });
  });

  // ==========================================================================
  // AT Test Cases (Airline Ticket - Production Scenarios)
  // ==========================================================================
  describe('AT Test Cases', () => {
    // AT-01: Mint ticket with seat + flight constraints
    describe('AT-01: Mint ticket with metadata', () => {
      it('should mint ticket with correct seat and flight metadata', () => {
        const result = engine.issue(defaultTicketParams);

        expect(result.success).toBe(true);
        expect(result.ticket).toBeDefined();

        const metadata = result.ticket!.metadata as Record<string, unknown>;
        expect(metadata.bookingReference).toBe('ABC123');
        expect(metadata.eTicketNumber).toBe('176-1234567890');

        const segments = metadata.segments as Array<Record<string, unknown>>;
        expect(segments[0].flightNumber).toBe('EK001');
        expect(segments[0].seatNumber).toBe('1A');
      });

      it('should emit TICKET_ISSUED event with booking reference', () => {
        const { ticket } = engine.issue(defaultTicketParams);

        const events = engine.getTicketEvents(ticket!.id);
        expect(events.length).toBe(1);
        expect(events[0].type).toBe(AirlineEventType.TICKET_ISSUED);
        expect(events[0].pnr).toBe('ABC123');
      });

      it('should have hash-chained metadata versions', () => {
        const { ticket } = engine.issue(defaultTicketParams);

        const versions = engine.getMetadataVersions(ticket!.id);
        expect(versions.length).toBe(1);
        expect(versions[0].currentHash).toBeDefined();
        expect(versions[0].currentHash.length).toBe(64); // SHA256 hex
      });
    });

    // AT-02: Transfer allowed window (e.g., before T-24h)
    describe('AT-02: Transfer window', () => {
      it('should allow transfer before deadline', async () => {
        const { ticket } = engine.issue(defaultTicketParams);

        const result = await engine.requestTransfer({
          ticketId: ticket!.id,
          fromPassenger: 'John Doe',
          toPassenger: { name: 'Jane Doe' },
          reason: TransferReason.GIFT,
        });

        expect(result.success).toBe(true);
      });

      it('should block transfer after window closes with TRANSFER_WINDOW_CLOSED', async () => {
        // Create ticket with departure very soon (past deadline)
        const pastDeadlineSegment = {
          ...testSegment,
          departure: {
            airport: 'DXB',
            terminal: 'T3',
            dateTime: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(), // 12 hours from now
          },
          arrival: {
            airport: 'LHR',
            terminal: 'T3',
            dateTime: new Date(Date.now() + 19 * 60 * 60 * 1000).toISOString(),
          },
        };

        const { ticket } = engine.issue({
          ...defaultTicketParams,
          segments: [pastDeadlineSegment],
          transferRules: {
            ...defaultTicketParams.transferRules,
            transferDeadlineHours: 24, // Need 24h before, only have 12h
          },
        });

        const result = await engine.requestTransfer({
          ticketId: ticket!.id,
          fromPassenger: 'John Doe',
          toPassenger: { name: 'Jane Doe' },
          reason: TransferReason.GIFT,
        });

        expect(result.success).toBe(false);
        expect(result.errorCode).toBe('TRANSFER_WINDOW_CLOSED');
      });
    });

    // AT-03: Transfer count limit (only once)
    describe('AT-03: Transfer count limit', () => {
      it('should block transfer when MAX_TRANSFERS_EXCEEDED', async () => {
        const issueResult = engine.issue({
          ...defaultTicketParams,
          policyFlags: {
            transferable: true,
            refundable: true,
            upgradeable: true,
            standbyAllowed: false,
            seatLocked: false,
            sameDayChangeAllowed: true,
            changeDeadlineHours: 24,
            reKycRequiredForTransfer: false, // Disable re-KYC
          },
          transferRules: {
            ...defaultTicketParams.transferRules,
            maxTransfers: 1,
            requiresIssuerApproval: false,
            autoApproveWithIdentity: false,
          },
        });

        expect(issueResult.success).toBe(true);
        const ticket = issueResult.ticket!;

        // First transfer succeeds and executes immediately (no approval needed)
        // Must provide identity to bypass re-KYC requirement
        const result1 = await engine.requestTransfer({
          ticketId: ticket.id,
          fromPassenger: 'John Doe',
          toPassenger: {
            name: 'Jane Doe',
            identity: {
              type: 'PASSPORT',
              number: 'JD123456',
              country: 'US',
              expiryDate: '2030-01-01',
            },
          },
          reason: TransferReason.GIFT,
        });

        expect(result1.success).toBe(true);
        expect(result1.request!.status).toBe('AUTO_APPROVED');

        // Second transfer fails
        const result2 = await engine.requestTransfer({
          ticketId: ticket!.id,
          fromPassenger: 'Jane Doe',
          toPassenger: {
            name: 'Bob Smith',
            identity: {
              type: 'PASSPORT',
              number: 'BS789012',
              country: 'US',
              expiryDate: '2030-01-01',
            },
          },
          reason: TransferReason.GIFT,
        });

        expect(result2.success).toBe(false);
        expect(result2.errorCode).toBe('MAX_TRANSFERS_EXCEEDED');
      });
    });

    // AT-04: Identity binding at check-in
    describe('AT-04: Identity binding at check-in', () => {
      it('should lock ticket after check-in with TICKET_LOCKED_AFTER_CHECKIN', async () => {
        const { ticket } = engine.issue(defaultTicketParams);

        engine.checkIn({ ticketId: ticket!.id, actor: passenger });

        const result = await engine.requestTransfer({
          ticketId: ticket!.id,
          fromPassenger: 'John Doe',
          toPassenger: { name: 'Jane Doe' },
          reason: TransferReason.GIFT,
        });

        expect(result.success).toBe(false);
        expect(result.errorCode).toBe('TICKET_LOCKED_AFTER_CHECKIN');

        const metadata = engine.getTicket(ticket!.id)!.metadata as Record<string, unknown>;
        expect(metadata.status).toBe(TicketStatus.CHECKED_IN);
      });
    });

    // AT-05: Name change / passenger reassignment flow
    describe('AT-05: Passenger assignment', () => {
      it('should allow assignPassenger before check-in', () => {
        const { ticket } = engine.issue(defaultTicketParams);

        const result = engine.assignPassenger({
          ticketId: ticket!.id,
          passengerId: 'Jane Doe',
          passengerIdentity: {
            type: 'PASSPORT',
            number: 'AB123456',
            country: 'GB',
            expiryDate: '2030-01-01',
          },
          actor: airlineAgent,
        });

        expect(result.success).toBe(true);

        const metadata = engine.getTicket(ticket!.id)!.metadata as Record<string, unknown>;
        expect(metadata.passengerName).toBe('Jane Doe');
      });

      it('should create audit trail for passenger assignment', () => {
        const { ticket } = engine.issue(defaultTicketParams);

        engine.assignPassenger({
          ticketId: ticket!.id,
          passengerId: 'Jane Doe',
          actor: airlineAgent,
        });

        const versions = engine.getMetadataVersions(ticket!.id);
        expect(versions.length).toBe(2);
        expect(versions[1].changeReason).toContain('Passenger assigned');
        expect(versions[1].changes.passengerName).toEqual({
          old: 'John Doe',
          new: 'Jane Doe',
        });
      });

      it('should block assignPassenger after check-in', () => {
        const { ticket } = engine.issue(defaultTicketParams);
        engine.checkIn({ ticketId: ticket!.id, actor: passenger });

        const result = engine.assignPassenger({
          ticketId: ticket!.id,
          passengerId: 'Jane Doe',
          actor: airlineAgent,
        });

        expect(result.success).toBe(false);
        expect(result.errorCode).toBe('TICKET_LOCKED_AFTER_CHECKIN');
      });
    });

    // AT-06: "Illness" scenario
    describe('AT-06: Medical transfer scenario', () => {
      it('should require approval for ILLNESS transfer', async () => {
        const { ticket } = engine.issue(defaultTicketParams);

        const result = await engine.requestTransfer({
          ticketId: ticket!.id,
          fromPassenger: 'John Doe',
          toPassenger: { name: 'Jane Doe' },
          reason: TransferReason.ILLNESS,
          supportingDocumentation: 'Medical certificate #12345',
        });

        expect(result.success).toBe(true);
        expect(result.request!.status).toBe('PENDING');
        expect(result.request!.reason).toBe(TransferReason.ILLNESS);
      });

      it('should complete ILLNESS transfer after approval', async () => {
        const { ticket } = engine.issue(defaultTicketParams);

        const transferResult = await engine.requestTransfer({
          ticketId: ticket!.id,
          fromPassenger: 'John Doe',
          toPassenger: { name: 'Jane Doe' },
          reason: TransferReason.ILLNESS,
        });

        // Complete KYC if required
        if (transferResult.request!.reKycRequired) {
          engine.completeTransferKyc({
            requestId: transferResult.request!.id,
            verifiedBy: 'kyc-agent',
          });
        }

        // Approve
        const approvalResult = engine.approveTransfer({
          requestId: transferResult.request!.id,
          approvedBy: 'airline-medical-desk',
        });

        expect(approvalResult.success).toBe(true);

        const metadata = engine.getTicket(ticket!.id)!.metadata as Record<string, unknown>;
        expect(metadata.passengerName).toBe('Jane Doe');
      });
    });

    // AT-07: Refund flow (burn + status)
    describe('AT-07: Refund flow', () => {
      it('should block transfer after refund with TICKET_VOID', async () => {
        const { ticket } = engine.issue(defaultTicketParams);

        // Cancel
        engine.cancel({ ticketId: ticket!.id, requestedBy: 'John Doe' });

        // Process refund
        const refundResult = engine.processRefund(ticket!.id);
        expect(refundResult.success).toBe(true);

        // Try transfer - should fail
        const result = await engine.requestTransfer({
          ticketId: ticket!.id,
          fromPassenger: 'John Doe',
          toPassenger: { name: 'Jane Doe' },
          reason: TransferReason.GIFT,
        });

        expect(result.success).toBe(false);
        expect(result.errorCode).toBe('TICKET_VOID');
      });
    });

    // AT-08: Boarding scan consumes ticket
    describe('AT-08: Boarding consumes ticket', () => {
      it('should prevent second boarding with ALREADY_USED', async () => {
        const { ticket } = engine.issue(defaultTicketParams);
        engine.checkIn({ ticketId: ticket!.id, actor: passenger });

        // First boarding
        const result1 = await engine.board({
          ticketId: ticket!.id,
          actor: airlineAgent,
        });
        expect(result1.success).toBe(true);
        expect(result1.verificationLog?.result).toBe('VALID');

        // Second boarding - fails
        const result2 = await engine.board({
          ticketId: ticket!.id,
          actor: airlineAgent,
        });
        expect(result2.success).toBe(false);
        expect(result2.error).toContain('ALREADY_USED');
        expect(result2.verificationLog?.result).toBe('ALREADY_USED');
      });
    });

    // AT-09: Royalty / fee on resale
    describe('AT-09: Resale royalty', () => {
      const resaleTicketParams = {
        ...defaultTicketParams,
        transferRules: {
          ...defaultTicketParams.transferRules,
          requiresIssuerApproval: true, // Require approval to test fee flow
        },
      };

      it('should calculate resale fee', async () => {
        const engineWithFees = new AirlineTicketEngine({
          resaleFeeConfig: {
            feePercentage: 0.05, // 5%
            minimumFee: '10.00',
            maximumFee: '100.00',
            treasuryAddress: '0xAirlineTreasury',
            feeRequired: false,
          },
        });
        engineWithFees.registerAirline(AIRLINE_CODE);

        const { ticket } = engineWithFees.issue(resaleTicketParams);

        const result = await engineWithFees.requestTransfer({
          ticketId: ticket!.id,
          fromPassenger: 'John Doe',
          toPassenger: { name: 'Jane Doe' },
          reason: TransferReason.RESALE,
        });

        expect(result.success).toBe(true);
        expect(result.request!.resaleFee).toBe('60.00'); // 5% of 1200
      });

      it('should collect fee on approval', async () => {
        const engineWithFees = new AirlineTicketEngine({
          resaleFeeConfig: {
            feePercentage: 0.05,
            minimumFee: '10.00',
            treasuryAddress: '0xAirlineTreasury',
            feeRequired: false,
          },
        });
        engineWithFees.registerAirline(AIRLINE_CODE);

        const { ticket } = engineWithFees.issue(resaleTicketParams);

        const transferResult = await engineWithFees.requestTransfer({
          ticketId: ticket!.id,
          fromPassenger: 'John Doe',
          toPassenger: { name: 'Jane Doe' },
          reason: TransferReason.RESALE,
        });
        expect(transferResult.success).toBe(true);

        // Complete KYC
        engineWithFees.completeTransferKyc({
          requestId: transferResult.request!.id,
          verifiedBy: 'kyc-agent',
        });

        // Approve
        engineWithFees.approveTransfer({
          requestId: transferResult.request!.id,
          approvedBy: 'agent',
        });

        const treasury = engineWithFees.getTreasuryBalance();
        expect(parseFloat(treasury.collected)).toBe(60.00);
      });

      it('should require payment when feeRequired is true', async () => {
        const engineWithFees = new AirlineTicketEngine({
          resaleFeeConfig: {
            feePercentage: 0.05,
            minimumFee: '10.00',
            treasuryAddress: '0xAirlineTreasury',
            feeRequired: true,
          },
        });
        engineWithFees.registerAirline(AIRLINE_CODE);

        const { ticket } = engineWithFees.issue(resaleTicketParams);

        const transferResult = await engineWithFees.requestTransfer({
          ticketId: ticket!.id,
          fromPassenger: 'John Doe',
          toPassenger: { name: 'Jane Doe' },
          reason: TransferReason.RESALE,
        });
        expect(transferResult.success).toBe(true);

        // Complete KYC
        engineWithFees.completeTransferKyc({
          requestId: transferResult.request!.id,
          verifiedBy: 'kyc-agent',
        });

        // Try to approve without payment
        const result = engineWithFees.approveTransfer({
          requestId: transferResult.request!.id,
          approvedBy: 'agent',
        });

        expect(result.success).toBe(false);
        expect(result.errorCode).toBe('PAYMENT_REQUIRED');
      });
    });

    // AT-10: High throughput test
    describe('AT-10: High throughput', () => {
      it('should handle bulk minting without duplicates', async () => {
        const ticketIds = new Set<string>();

        for (let i = 0; i < 100; i++) {
          const result = engine.issue({
            ...defaultTicketParams,
            eTicketNumber: `176-${String(i).padStart(10, '0')}`,
            passengerName: `Passenger ${i}`,
          });
          expect(result.success).toBe(true);
          expect(ticketIds.has(result.ticket!.id)).toBe(false);
          ticketIds.add(result.ticket!.id);
        }

        expect(ticketIds.size).toBe(100);
      });

      it('should handle concurrent boarding with locking', async () => {
        const { ticket } = engine.issue(defaultTicketParams);
        engine.checkIn({ ticketId: ticket!.id, actor: passenger });

        // Simulate concurrent boarding attempts
        const results = await Promise.all([
          engine.board({ ticketId: ticket!.id, actor: airlineAgent, scanLocation: 'Gate A' }),
          engine.board({ ticketId: ticket!.id, actor: airlineAgent, scanLocation: 'Gate B' }),
          engine.board({ ticketId: ticket!.id, actor: airlineAgent, scanLocation: 'Gate C' }),
        ]);

        const successCount = results.filter(r => r.success).length;
        expect(successCount).toBe(1); // Only one should succeed
      });
    });

    // AT-11: Offline/edge case — duplicated API calls
    describe('AT-11: Idempotency', () => {
      const idempotentTicketParams = {
        ...defaultTicketParams,
        transferRules: {
          ...defaultTicketParams.transferRules,
          requiresIssuerApproval: true, // Ensure request is pending
        },
      };

      it('should deduplicate transfer requests with same idempotency key', async () => {
        const { ticket } = engine.issue(idempotentTicketParams);

        const idempotencyKey = 'unique-transfer-key-123';

        // First request
        const result1 = await engine.requestTransfer({
          ticketId: ticket!.id,
          fromPassenger: 'John Doe',
          toPassenger: { name: 'Jane Doe' },
          reason: TransferReason.GIFT,
          idempotencyKey,
        });

        // Retry with same key
        const result2 = await engine.requestTransfer({
          ticketId: ticket!.id,
          fromPassenger: 'John Doe',
          toPassenger: { name: 'Jane Doe' },
          reason: TransferReason.GIFT,
          idempotencyKey,
        });

        expect(result1.success).toBe(true);
        expect(result2.success).toBe(true);
        expect(result1.request!.id).toBe(result2.request!.id); // Same request returned
      });

      it('should return same response on retry (5 times)', async () => {
        const { ticket } = engine.issue(idempotentTicketParams);
        const idempotencyKey = 'retry-test-key';

        const requests: Array<{ id: string }> = [];

        for (let i = 0; i < 5; i++) {
          const result = await engine.requestTransfer({
            ticketId: ticket!.id,
            fromPassenger: 'John Doe',
            toPassenger: { name: 'Jane Doe' },
            reason: TransferReason.GIFT,
            idempotencyKey,
          });
          expect(result.success).toBe(true);
          requests.push({ id: result.request!.id });
        }

        // All should have the same ID
        const uniqueIds = new Set(requests.map(r => r.id));
        expect(uniqueIds.size).toBe(1);
      });
    });

    // AT-12: Event ordering correctness
    describe('AT-12: State machine validation', () => {
      it('should fail board() before checkIn() with INVALID_STATE', async () => {
        const { ticket } = engine.issue(defaultTicketParams);

        const result = await engine.board({
          ticketId: ticket!.id,
          actor: airlineAgent,
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Must be CHECKED_IN');
        expect(result.verificationLog?.result).toBe('INVALID');
      });

      it('should fail transfer() after board() with TICKET_USED', async () => {
        const { ticket } = engine.issue(defaultTicketParams);
        engine.checkIn({ ticketId: ticket!.id, actor: passenger });
        await engine.board({ ticketId: ticket!.id, actor: airlineAgent });

        const result = await engine.requestTransfer({
          ticketId: ticket!.id,
          fromPassenger: 'John Doe',
          toPassenger: { name: 'Jane Doe' },
          reason: TransferReason.GIFT,
        });

        expect(result.success).toBe(false);
        expect(result.errorCode).toBe('TICKET_USED');
      });
    });
  });

  // ============================================================================
  // PR-XX: PRODUCTION READINESS TESTS
  // ============================================================================

  describe('PR-01: Auth Bypass Attempts', () => {
    it('should reject approveTransfer from unauthorized role (PASSENGER)', async () => {
      const { ticket } = engine.issue(defaultTicketParams);

      // Request transfer
      const transferResult = await engine.requestTransfer({
        ticketId: ticket!.id,
        fromPassenger: 'John Doe',
        toPassenger: { name: 'Jane Doe' },
        reason: TransferReason.GIFT,
      });
      expect(transferResult.success).toBe(true);

      // Passenger tries to approve (should fail)
      const result = engine.approveTransfer({
        requestId: transferResult.request!.id,
        approvedBy: 'passenger-self',
        actor: passenger, // Unauthorized role
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('UNAUTHORIZED');
    });

    it('should reject approveTransfer from wrong airline', async () => {
      const { ticket } = engine.issue(defaultTicketParams);

      const transferResult = await engine.requestTransfer({
        ticketId: ticket!.id,
        fromPassenger: 'John Doe',
        toPassenger: { name: 'Jane Doe' },
        reason: TransferReason.GIFT,
      });

      // Agent from different airline tries to approve
      const wrongAirlineAgent: ActorContext = {
        actorId: 'agent-other',
        role: AirlineRole.AIRLINE_AGENT,
        airlineCode: 'QF', // Different airline
      };

      const result = engine.approveTransfer({
        requestId: transferResult.request!.id,
        approvedBy: 'wrong-airline-agent',
        actor: wrongAirlineAgent,
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('UNAUTHORIZED');
    });

    it('should reject rejectTransfer from AUDITOR role', async () => {
      const { ticket } = engine.issue(defaultTicketParams);

      const transferResult = await engine.requestTransfer({
        ticketId: ticket!.id,
        fromPassenger: 'John Doe',
        toPassenger: { name: 'Jane Doe' },
        reason: TransferReason.GIFT,
      });

      // Auditor tries to reject (should fail - read-only role)
      const result = engine.rejectTransfer({
        requestId: transferResult.request!.id,
        rejectedBy: 'auditor',
        reason: 'Test rejection',
        actor: auditor,
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('UNAUTHORIZED');
    });

    it('should allow approveTransfer from authorized AIRLINE_AGENT', async () => {
      // Use policy that doesn't require re-KYC to isolate RBAC testing
      const { ticket } = engine.issue({
        ...defaultTicketParams,
        policyFlags: {
          reKycRequiredForTransfer: false,
          transferable: true,
          refundable: true,
          upgradeable: true,
          standbyAllowed: false,
          seatLocked: false,
          sameDayChangeAllowed: true,
          changeDeadlineHours: 24,
        },
      });

      const transferResult = await engine.requestTransfer({
        ticketId: ticket!.id,
        fromPassenger: 'John Doe',
        toPassenger: {
          name: 'Jane Doe',
          // Provide identity to avoid re-KYC requirement
          identity: {
            type: 'PASSPORT',
            number: 'JD123456',
            country: 'US',
            expiryDate: '2030-01-01',
          },
        },
        reason: TransferReason.GIFT,
      });

      expect(transferResult.success).toBe(true);

      // Airline agent approves
      const result = engine.approveTransfer({
        requestId: transferResult.request!.id,
        approvedBy: 'airline-agent',
        actor: airlineAgent,
      });

      expect(result.success).toBe(true);
    });

    it('should reject requestTransfer with RBAC from non-owner passenger', async () => {
      const { ticket } = engine.issue(defaultTicketParams);

      // Different passenger tries to request transfer
      const otherPassenger: ActorContext = {
        actorId: 'Jane Doe',
        role: AirlineRole.PASSENGER,
        passengerId: 'Jane Doe', // Not the ticket owner
      };

      const result = await engine.requestTransfer({
        ticketId: ticket!.id,
        fromPassenger: 'John Doe',
        toPassenger: { name: 'Alice' },
        reason: TransferReason.GIFT,
        actor: otherPassenger,
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('UNAUTHORIZED');
    });
  });

  describe('PR-02: Replay Attack Prevention', () => {
    it('should deduplicate transfer requests with same idempotency key', async () => {
      const { ticket } = engine.issue(defaultTicketParams);

      const idempotencyKey = 'transfer-key-123';

      // First request
      const result1 = await engine.requestTransfer({
        ticketId: ticket!.id,
        fromPassenger: 'John Doe',
        toPassenger: { name: 'Jane Doe' },
        reason: TransferReason.GIFT,
        idempotencyKey,
      });
      expect(result1.success).toBe(true);

      // Second request with same key should return same result
      const result2 = await engine.requestTransfer({
        ticketId: ticket!.id,
        fromPassenger: 'John Doe',
        toPassenger: { name: 'Alice' }, // Different passenger - should be ignored
        reason: TransferReason.RESALE,
        idempotencyKey,
      });

      expect(result2.success).toBe(true);
      expect(result2.request!.id).toBe(result1.request!.id); // Same request ID
      expect(result2.request!.toPassenger.name).toBe('Jane Doe'); // Original passenger, not Alice
    });

    it('should allow different requests with different idempotency keys', async () => {
      // Create two tickets
      const { ticket: ticket1 } = engine.issue({
        ...defaultTicketParams,
        eTicketNumber: '176-1111111111',
        bookingReference: 'AAA111',
      });
      const { ticket: ticket2 } = engine.issue({
        ...defaultTicketParams,
        eTicketNumber: '176-2222222222',
        bookingReference: 'BBB222',
      });

      const result1 = await engine.requestTransfer({
        ticketId: ticket1!.id,
        fromPassenger: 'John Doe',
        toPassenger: { name: 'Jane Doe' },
        reason: TransferReason.GIFT,
        idempotencyKey: 'key-1',
      });

      const result2 = await engine.requestTransfer({
        ticketId: ticket2!.id,
        fromPassenger: 'John Doe',
        toPassenger: { name: 'Alice' },
        reason: TransferReason.GIFT,
        idempotencyKey: 'key-2',
      });

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(result1.request!.id).not.toBe(result2.request!.id);
    });

    it('should retrieve transfer by idempotency key', () => {
      const { ticket } = engine.issue(defaultTicketParams);
      const idempotencyKey = 'lookup-key-456';

      engine.requestTransfer({
        ticketId: ticket!.id,
        fromPassenger: 'John Doe',
        toPassenger: { name: 'Jane Doe' },
        reason: TransferReason.GIFT,
        idempotencyKey,
      });

      const retrieved = engine.getTransferByIdempotencyKey(idempotencyKey);
      expect(retrieved).toBeDefined();
      expect(retrieved!.toPassenger.name).toBe('Jane Doe');
    });
  });

  describe('PR-03: Audit Logs Complete', () => {
    it('should record audit entry for approveTransfer', async () => {
      // Use policy without re-KYC to test audit logging flow
      const { ticket } = engine.issue({
        ...defaultTicketParams,
        policyFlags: {
          reKycRequiredForTransfer: false,
          transferable: true,
          refundable: true,
          upgradeable: true,
          standbyAllowed: false,
          seatLocked: false,
          sameDayChangeAllowed: true,
          changeDeadlineHours: 24,
        },
      });

      const transferResult = await engine.requestTransfer({
        ticketId: ticket!.id,
        fromPassenger: 'John Doe',
        toPassenger: {
          name: 'Jane Doe',
          // Provide identity to avoid re-KYC requirement
          identity: {
            type: 'PASSPORT',
            number: 'JD123456',
            country: 'US',
            expiryDate: '2030-01-01',
          },
        },
        reason: TransferReason.GIFT,
        actor: passenger,
      });

      expect(transferResult.success).toBe(true);

      engine.approveTransfer({
        requestId: transferResult.request!.id,
        approvedBy: 'airline-agent',
        actor: airlineAgent,
      });

      const auditLog = engine.getAuditLog({
        action: 'APPROVE_TRANSFER',
        resourceId: transferResult.request!.id,
      });

      expect(auditLog.length).toBeGreaterThan(0);
      expect(auditLog[0].actor.id).toBe('agent-1');
      expect(auditLog[0].actor.role).toBe(AirlineRole.AIRLINE_AGENT);
      expect(auditLog[0].success).toBe(true);
    });

    it('should record audit entry for failed authorization', async () => {
      const { ticket } = engine.issue(defaultTicketParams);

      const transferResult = await engine.requestTransfer({
        ticketId: ticket!.id,
        fromPassenger: 'John Doe',
        toPassenger: { name: 'Jane Doe' },
        reason: TransferReason.GIFT,
      });

      // Unauthorized attempt
      engine.approveTransfer({
        requestId: transferResult.request!.id,
        approvedBy: 'unauthorized',
        actor: passenger,
      });

      const auditLog = engine.getAuditLog({
        actorId: 'John Doe',
        action: 'APPROVE_TRANSFER',
      });

      expect(auditLog.length).toBeGreaterThan(0);
      expect(auditLog[0].success).toBe(false);
      expect(auditLog[0].error).toContain('PERMISSION_DENIED');
    });

    it('should record audit entry for requestTransfer with idempotency key', () => {
      const { ticket } = engine.issue(defaultTicketParams);
      const idempotencyKey = 'audit-key-789';

      engine.requestTransfer({
        ticketId: ticket!.id,
        fromPassenger: 'John Doe',
        toPassenger: { name: 'Jane Doe' },
        reason: TransferReason.GIFT,
        idempotencyKey,
        actor: passenger,
      });

      const auditLog = engine.getAuditLog({
        action: 'REQUEST_TRANSFER',
      });

      const entry = auditLog.find(e => e.metadata?.idempotencyKey === idempotencyKey);
      expect(entry).toBeDefined();
      expect(entry!.reason).toBe(TransferReason.GIFT);
    });

    it('should filter audit log by time range', () => {
      const { ticket } = engine.issue(defaultTicketParams);

      const before = new Date().toISOString();

      engine.requestTransfer({
        ticketId: ticket!.id,
        fromPassenger: 'John Doe',
        toPassenger: { name: 'Jane Doe' },
        reason: TransferReason.GIFT,
        actor: passenger,
      });

      const after = new Date(Date.now() + 1000).toISOString();

      const auditLog = engine.getAuditLog({
        since: before,
        until: after,
      });

      expect(auditLog.length).toBeGreaterThan(0);
    });

    it('should include before/after state in audit entry for rejectTransfer', async () => {
      const { ticket } = engine.issue(defaultTicketParams);

      const transferResult = await engine.requestTransfer({
        ticketId: ticket!.id,
        fromPassenger: 'John Doe',
        toPassenger: { name: 'Jane Doe' },
        reason: TransferReason.GIFT,
      });

      engine.rejectTransfer({
        requestId: transferResult.request!.id,
        rejectedBy: 'agent',
        reason: 'Policy violation',
        actor: airlineAgent,
      });

      const auditLog = engine.getAuditLog({
        action: 'REJECT_TRANSFER',
      });

      expect(auditLog.length).toBeGreaterThan(0);
      expect(auditLog[0].before).toBeDefined();
      expect(auditLog[0].after).toBeDefined();
      expect(auditLog[0].reason).toBe('Policy violation');
    });
  });

  describe('PR-04: Webhook Security', () => {
    it('should sign webhooks with HMAC-SHA256', () => {
      const webhookConfig = {
        endpointId: 'webhook-1',
        url: 'https://airline.example.com/webhook',
        events: [AirlineEventType.TICKET_ISSUED],
        secret: 'test-secret-key-12345',
        active: true,
        retryPolicy: { maxRetries: 3, backoffMs: 1000 },
      };

      engine.registerWebhook(webhookConfig);

      // Issue ticket to trigger webhook
      const { ticket } = engine.issue(defaultTicketParams);
      expect(ticket).toBeDefined();

      // Get the webhook delivery
      const events = engine.getTicketEvents(ticket!.id);
      const issueEvent = events.find(e => e.type === AirlineEventType.TICKET_ISSUED);
      expect(issueEvent).toBeDefined();

      const deliveries = engine.getDeliveriesForEvent(issueEvent!.id);
      expect(deliveries.length).toBeGreaterThan(0);

      const delivery = deliveries[0];
      expect(delivery.signature).toBeDefined();
      expect(delivery.signature.length).toBe(64); // SHA-256 hex length
      expect(delivery.timestamp).toBeDefined();
      expect(delivery.nonce).toBeDefined();
    });

    it('should verify webhook signature correctly', () => {
      const secret = 'test-secret-key';
      const payload = JSON.stringify({ test: 'data' });
      const timestamp = new Date().toISOString();
      const nonce = 'test-nonce-123';

      // Simulate creating a signature (using internal method via a delivery)
      const webhookConfig = {
        endpointId: 'verify-test',
        url: 'https://test.example.com/webhook',
        events: [AirlineEventType.TICKET_ISSUED],
        secret,
        active: true,
        retryPolicy: { maxRetries: 1, backoffMs: 100 },
      };
      engine.registerWebhook(webhookConfig);

      const { ticket } = engine.issue(defaultTicketParams);
      const events = engine.getTicketEvents(ticket!.id);
      const delivery = engine.getDeliveriesForEvent(events[0].id)[0];

      // Verify signature validation works
      const verifyResult = engine.verifyWebhookSignature({
        payload: delivery.payload,
        signature: delivery.signature,
        secret,
        timestamp: delivery.timestamp,
        nonce: delivery.nonce,
      });

      expect(verifyResult.valid).toBe(true);
    });

    it('should reject expired webhook timestamp (replay protection)', () => {
      const secret = 'test-secret';
      const payload = '{"test":"data"}';
      const oldTimestamp = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10 minutes ago
      const nonce = 'old-nonce';

      const result = engine.verifyWebhookSignature({
        payload,
        signature: 'any-signature',
        secret,
        timestamp: oldTimestamp,
        nonce,
        maxAgeMs: 300000, // 5 minutes
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('replay protection');
    });

    it('should reject invalid webhook signature', () => {
      const webhookConfig = {
        endpointId: 'invalid-test',
        url: 'https://test.example.com/webhook',
        events: [AirlineEventType.TICKET_ISSUED],
        secret: 'real-secret',
        active: true,
        retryPolicy: { maxRetries: 1, backoffMs: 100 },
      };
      engine.registerWebhook(webhookConfig);

      const { ticket } = engine.issue(defaultTicketParams);
      const events = engine.getTicketEvents(ticket!.id);
      const delivery = engine.getDeliveriesForEvent(events[0].id)[0];

      const result = engine.verifyWebhookSignature({
        payload: delivery.payload,
        signature: delivery.signature,
        secret: 'wrong-secret', // Wrong secret
        timestamp: delivery.timestamp,
        nonce: delivery.nonce,
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid webhook signature');
    });

    it('should move failed webhook to dead letter queue after max retries', () => {
      const webhookConfig = {
        endpointId: 'failing-webhook',
        url: 'https://fail.example.com/webhook', // URL with 'fail' triggers failure
        events: [AirlineEventType.TICKET_ISSUED],
        secret: 'test-secret',
        active: true,
        retryPolicy: { maxRetries: 2, backoffMs: 100 },
      };

      engine.registerWebhook(webhookConfig);

      // Issue ticket to trigger webhook (will fail)
      const { ticket } = engine.issue(defaultTicketParams);
      expect(ticket).toBeDefined();

      // Get pending deliveries
      const pending = engine.getPendingDeliveries();
      expect(pending.some(d => d.endpointId === 'failing-webhook')).toBe(true);

      // Retry until max retries exceeded
      const failingDelivery = pending.find(d => d.endpointId === 'failing-webhook')!;
      engine.retryWebhook(failingDelivery.id);
      engine.retryWebhook(failingDelivery.id);

      // Should now be in dead letter queue
      const dlq = engine.getDeadLetterQueue();
      expect(dlq.length).toBeGreaterThan(0);
      expect(dlq[0].reason).toContain('Max retries');
    });

    it('should track webhook delivery attempts', () => {
      const webhookConfig = {
        endpointId: 'attempt-tracker',
        url: 'https://fail.example.com/webhook',
        events: [AirlineEventType.TICKET_ISSUED],
        secret: 'test-secret',
        active: true,
        retryPolicy: { maxRetries: 5, backoffMs: 100 },
      };

      engine.registerWebhook(webhookConfig);

      const { ticket } = engine.issue(defaultTicketParams);
      const events = engine.getTicketEvents(ticket!.id);
      const deliveries = engine.getDeliveriesForEvent(events[0].id);
      const delivery = deliveries.find(d => d.endpointId === 'attempt-tracker')!;

      expect(delivery.attemptCount).toBe(1);

      engine.retryWebhook(delivery.id);
      const updated = engine.getWebhookDelivery(delivery.id);
      expect(updated!.attemptCount).toBe(2);
    });

    it('should allow manual retry from dead letter queue', () => {
      const webhookConfig = {
        endpointId: 'manual-retry-test',
        url: 'https://fail.example.com/webhook',
        events: [AirlineEventType.TICKET_ISSUED],
        secret: 'test-secret',
        active: true,
        retryPolicy: { maxRetries: 1, backoffMs: 100 },
      };

      engine.registerWebhook(webhookConfig);

      const { ticket } = engine.issue(defaultTicketParams);
      const events = engine.getTicketEvents(ticket!.id);
      const deliveries = engine.getDeliveriesForEvent(events[0].id);
      const delivery = deliveries.find(d => d.endpointId === 'manual-retry-test')!;

      // Exhaust retries
      engine.retryWebhook(delivery.id);

      // Should be in DLQ
      const dlq = engine.getDeadLetterQueue();
      const dlEntry = dlq.find(e => e.endpointId === 'manual-retry-test');
      expect(dlEntry).toBeDefined();
      expect(dlEntry!.retriable).toBe(true);

      // Manual retry from DLQ (will still fail but tests the mechanism)
      const retryResult = engine.retryFromDeadLetter(dlEntry!.id);
      expect(retryResult.success).toBe(false); // Still fails because URL has 'fail'

      // Entry should be removed from DLQ
      const updatedDlq = engine.getDeadLetterQueue();
      expect(updatedDlq.find(e => e.id === dlEntry!.id)).toBeUndefined();
    });

    it('should calculate exponential backoff for retries', () => {
      const webhookConfig = {
        endpointId: 'backoff-test',
        url: 'https://fail.example.com/webhook',
        events: [AirlineEventType.TICKET_ISSUED],
        secret: 'test-secret',
        active: true,
        retryPolicy: { maxRetries: 5, backoffMs: 1000 },
      };

      engine.registerWebhook(webhookConfig);

      const { ticket } = engine.issue(defaultTicketParams);
      const events = engine.getTicketEvents(ticket!.id);
      const deliveries = engine.getDeliveriesForEvent(events[0].id);
      const delivery = deliveries.find(d => d.endpointId === 'backoff-test')!;

      // First retry - backoff should be 1000ms
      expect(delivery.nextRetryAt).toBeDefined();
      const firstRetryTime = new Date(delivery.nextRetryAt!).getTime();
      const firstAttemptTime = new Date(delivery.lastAttemptAt!).getTime();
      expect(firstRetryTime - firstAttemptTime).toBeGreaterThanOrEqual(1000);
    });
  });
});
