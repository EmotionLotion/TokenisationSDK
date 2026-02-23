/**
 * Concert Ticket Engine Tests
 *
 * Production-readiness test cases covering:
 * - TC-1: Create ticket
 * - TC-2: Issue ticket
 * - TC-3: Admit entry
 * - TC-4: Complete event
 * - TC-5: Transfer before event
 * - TC-6: Transfer after admission
 * - TC-7: Anti-scalping price cap
 * - TC-8: Cancellation/refund
 * - TC-9: Modify ticket
 * - TC-10: Freeze/unfreeze
 * - TC-11: Double admission prevention
 * - TC-12: Metadata versioning
 * - TC-13: RBAC
 * - TC-14: Event tracking
 * - TC-15: Age restriction
 * - TC-16: Lead booker + Bulk
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ConcertTicketEngine,
  SeatingTier,
  ConcertTicketStatus,
  VenueRole,
  ConcertTicketEventType,
  type ActorContext,
  type ConcertTicketMetadata,
} from '@tokenisation/core';

describe('ConcertTicketEngine', () => {
  let engine: ConcertTicketEngine;
  const VENUE_CODE = 'MSG-NYC';

  // Test actors
  const venueAdmin: ActorContext = {
    actorId: 'venue-admin-1',
    role: VenueRole.VENUE_ADMIN,
    venueCode: VENUE_CODE,
  };

  const boxOffice: ActorContext = {
    actorId: 'box-office-1',
    role: VenueRole.BOX_OFFICE,
    venueCode: VENUE_CODE,
  };

  const security: ActorContext = {
    actorId: 'security-1',
    role: VenueRole.SECURITY,
    venueCode: VENUE_CODE,
  };

  const fan: ActorContext = {
    actorId: 'Alice Smith',
    role: VenueRole.FAN,
    fanId: 'Alice Smith',
  };

  const auditor: ActorContext = {
    actorId: 'auditor-1',
    role: VenueRole.AUDITOR,
  };

  const platformAdmin: ActorContext = {
    actorId: 'platform-admin-1',
    role: VenueRole.PLATFORM_ADMIN,
    venueCode: VENUE_CODE,
  };

  const eventDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const defaultTicketParams = {
    venueCode: VENUE_CODE,
    venueName: 'Madison Square Garden',
    confirmationNumber: 'MSG-TKT-001',
    eventInfo: {
      eventName: 'Rock Concert 2026',
      artist: 'The Rolling Stones',
      eventDate,
      eventTime: '20:00',
    },
    seating: {
      section: 'A',
      row: '5',
      seat: '12',
      tier: SeatingTier.VIP,
    },
    pricing: {
      faceValue: '250.00',
      serviceFee: '25.00',
      total: '275.00',
      currency: 'USD',
    },
    fanInfo: {
      fanName: 'Alice Smith',
      ageVerified: true,
      fanAge: 25,
      fanClubMember: true,
    },
    antiScalping: {
      maxResalePercent: 10,
    },
    transferRules: {
      maxTransfers: 2,
      transferCount: 0,
      nameChangeFee: '15.00',
      transferDeadlineHours: 24,
      autoApproveWithIdentity: true,
    },
    cancellationPolicy: {
      refundable: true,
      cancellationFee: '0.00',
      freeCancellationDeadlineHours: 48,
      penaltyPercentage: 100,
    },
  };

  beforeEach(() => {
    engine = new ConcertTicketEngine();
    engine.registerVenue(VENUE_CODE);
  });

  // ==========================================================================
  // TC-1: Create ticket
  // ==========================================================================
  describe('TC-1: Create ticket', () => {
    it('should create ticket with correct metadata', () => {
      const result = engine.createTicket(defaultTicketParams);

      expect(result.success).toBe(true);
      expect(result.ticket).toBeDefined();
      expect(result.ticket!.id).toBeDefined();

      const metadata = result.ticket!.metadata as unknown as ConcertTicketMetadata;
      expect(metadata.confirmationNumber).toBe('MSG-TKT-001');
      expect(metadata.fanInfo.fanName).toBe('Alice Smith');
      expect(metadata.venueCode).toBe(VENUE_CODE);
      expect(metadata.seating.tier).toBe(SeatingTier.VIP);
      expect(metadata.status).toBe(ConcertTicketStatus.CREATED);
    });

    it('should reject ticket from unauthorized venue', () => {
      const result = engine.createTicket({
        ...defaultTicketParams,
        venueCode: 'UNKNOWN-VENUE',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Venue not authorized');
    });

    it('should create initial metadata version on creation', () => {
      const result = engine.createTicket(defaultTicketParams);
      expect(result.success).toBe(true);

      const versions = engine.getMetadataVersions(result.ticket!.id);
      expect(versions.length).toBe(1);
      expect(versions[0].version).toBe(0);
      expect(versions[0].changeReason).toBe('Initial creation');
    });

    it('should set anti-scalping defaults correctly', () => {
      const result = engine.createTicket(defaultTicketParams);
      const metadata = result.ticket!.metadata as unknown as ConcertTicketMetadata;
      expect(metadata.antiScalping.maxResalePercent).toBe(10);
      expect(metadata.antiScalping.originalPrice).toBe('250.00');
      expect(metadata.antiScalping.resaleHistory).toHaveLength(0);
      // 250 * 1.10 = 275
      expect(metadata.pricing.resalePriceCap).toBe('275.00');
    });
  });

  // ==========================================================================
  // TC-2: Issue ticket
  // ==========================================================================
  describe('TC-2: Issue ticket', () => {
    it('should transition CREATED -> ISSUED', () => {
      const { ticket } = engine.createTicket(defaultTicketParams);

      const result = engine.issueTicket({
        ticketId: ticket!.id,
        actor: boxOffice,
      });

      expect(result.success).toBe(true);
      const metadata = result.ticket!.metadata as unknown as ConcertTicketMetadata;
      expect(metadata.status).toBe(ConcertTicketStatus.ISSUED);
    });

    it('should be idempotent (double issue returns success)', () => {
      const { ticket } = engine.createTicket(defaultTicketParams);

      const result1 = engine.issueTicket({ ticketId: ticket!.id, actor: boxOffice });
      expect(result1.success).toBe(true);

      const result2 = engine.issueTicket({ ticketId: ticket!.id, actor: boxOffice });
      expect(result2.success).toBe(true);
    });

    it('should reject issue from invalid state', () => {
      const { ticket } = engine.createTicket(defaultTicketParams);
      engine.issueTicket({ ticketId: ticket!.id, actor: boxOffice });
      engine.admitEntry({ ticketId: ticket!.id, actor: security });

      const result = engine.issueTicket({ ticketId: ticket!.id, actor: boxOffice });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot issue from status');
    });
  });

  // ==========================================================================
  // TC-3: Admit entry
  // ==========================================================================
  describe('TC-3: Admit entry', () => {
    it('should transition ISSUED -> ADMITTED with scanLocation', () => {
      const { ticket } = engine.createTicket(defaultTicketParams);
      engine.issueTicket({ ticketId: ticket!.id, actor: boxOffice });

      const result = engine.admitEntry({
        ticketId: ticket!.id,
        actor: security,
        scanLocation: 'Gate A',
      });

      expect(result.success).toBe(true);
      const metadata = result.ticket!.metadata as unknown as ConcertTicketMetadata;
      expect(metadata.status).toBe(ConcertTicketStatus.ADMITTED);
      expect(metadata.entryInfo).toBeDefined();
      expect(metadata.entryInfo!.scanLocation).toBe('Gate A');
      expect(metadata.entryInfo!.scannedBy).toBe('security-1');
    });

    it('should be idempotent (returns alreadyAdmitted)', () => {
      const { ticket } = engine.createTicket(defaultTicketParams);
      engine.issueTicket({ ticketId: ticket!.id, actor: boxOffice });

      const result1 = engine.admitEntry({ ticketId: ticket!.id, actor: security });
      expect(result1.success).toBe(true);
      expect(result1.alreadyAdmitted).toBeFalsy();

      const result2 = engine.admitEntry({ ticketId: ticket!.id, actor: security });
      expect(result2.success).toBe(true);
      expect(result2.alreadyAdmitted).toBe(true);
    });

    it('should reject admission from CREATED status', () => {
      const { ticket } = engine.createTicket(defaultTicketParams);

      const result = engine.admitEntry({ ticketId: ticket!.id, actor: security });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot admit from status');
    });

    it('should record entry info on admission', () => {
      const { ticket } = engine.createTicket(defaultTicketParams);
      engine.issueTicket({ ticketId: ticket!.id, actor: boxOffice });

      engine.admitEntry({
        ticketId: ticket!.id,
        actor: security,
        scanLocation: 'Main Entrance',
      });

      const updated = engine.getTicket(ticket!.id);
      const metadata = updated!.metadata as unknown as ConcertTicketMetadata;
      expect(metadata.entryInfo).toBeDefined();
      expect(metadata.entryInfo!.admittedAt).toBeTruthy();
      expect(metadata.entryInfo!.scanLocation).toBe('Main Entrance');
    });
  });

  // ==========================================================================
  // TC-4: Complete event
  // ==========================================================================
  describe('TC-4: Complete event', () => {
    it('should transition ADMITTED -> USED', () => {
      const { ticket } = engine.createTicket(defaultTicketParams);
      engine.issueTicket({ ticketId: ticket!.id, actor: boxOffice });
      engine.admitEntry({ ticketId: ticket!.id, actor: security });

      const result = engine.completeEvent({
        ticketId: ticket!.id,
        actor: venueAdmin,
      });

      expect(result.success).toBe(true);
      const metadata = result.ticket!.metadata as unknown as ConcertTicketMetadata;
      expect(metadata.status).toBe(ConcertTicketStatus.USED);
    });

    it('should reject complete from non-ADMITTED status', () => {
      const { ticket } = engine.createTicket(defaultTicketParams);
      engine.issueTicket({ ticketId: ticket!.id, actor: boxOffice });

      const result = engine.completeEvent({ ticketId: ticket!.id, actor: venueAdmin });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Must be ADMITTED');
    });
  });

  // ==========================================================================
  // TC-5: Transfer before event
  // ==========================================================================
  describe('TC-5: Transfer before event', () => {
    it('should allow transfer of issued ticket', () => {
      const { ticket } = engine.createTicket(defaultTicketParams);
      engine.issueTicket({ ticketId: ticket!.id, actor: boxOffice });

      const result = engine.requestTransfer({
        ticketId: ticket!.id,
        fromFan: 'Alice Smith',
        toFan: { name: 'Bob Jones' },
        reason: 'Gift',
      });

      expect(result.success).toBe(true);
      expect(result.request).toBeDefined();
    });

    it('should change fan name after approved transfer', () => {
      const { ticket } = engine.createTicket(defaultTicketParams);
      engine.issueTicket({ ticketId: ticket!.id, actor: boxOffice });

      const transferResult = engine.requestTransfer({
        ticketId: ticket!.id,
        fromFan: 'Alice Smith',
        toFan: { name: 'Bob Jones' },
        reason: 'Gift',
      });

      engine.approveTransfer({
        requestId: transferResult.request!.id,
        approvedBy: 'box-office-1',
      });

      const updated = engine.getTicket(ticket!.id);
      const metadata = updated!.metadata as unknown as ConcertTicketMetadata;
      expect(metadata.fanInfo.fanName).toBe('Bob Jones');
      expect(metadata.transferRules.transferCount).toBe(1);
    });

    it('should auto-approve with verified identity', () => {
      engine.verifyIdentity('PASSPORT:US:P789012');

      const { ticket } = engine.createTicket(defaultTicketParams);
      engine.issueTicket({ ticketId: ticket!.id, actor: boxOffice });

      const result = engine.requestTransfer({
        ticketId: ticket!.id,
        fromFan: 'Alice Smith',
        toFan: {
          name: 'Bob Jones',
          identity: {
            type: 'PASSPORT',
            number: 'P789012',
            country: 'US',
            expiryDate: '2028-01-01',
          },
        },
        reason: 'Gift',
      });

      expect(result.success).toBe(true);
      expect(result.request!.status).toBe('AUTO_APPROVED');

      const updated = engine.getTicket(ticket!.id);
      const metadata = updated!.metadata as unknown as ConcertTicketMetadata;
      expect(metadata.fanInfo.fanName).toBe('Bob Jones');
    });
  });

  // ==========================================================================
  // TC-6: Transfer after admission (blocked)
  // ==========================================================================
  describe('TC-6: Transfer after admission', () => {
    it('should block transfer after admission (TICKET_LOCKED_AFTER_ADMISSION)', () => {
      const { ticket } = engine.createTicket(defaultTicketParams);
      engine.issueTicket({ ticketId: ticket!.id, actor: boxOffice });
      engine.admitEntry({ ticketId: ticket!.id, actor: security });

      const result = engine.requestTransfer({
        ticketId: ticket!.id,
        fromFan: 'Alice Smith',
        toFan: { name: 'Bob Jones' },
        reason: 'Gift',
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('TICKET_LOCKED_AFTER_ADMISSION');
      expect(result.error).toContain('locked after admission');
    });

    it('should block transfer of frozen ticket', () => {
      const { ticket } = engine.createTicket(defaultTicketParams);
      engine.issueTicket({ ticketId: ticket!.id, actor: boxOffice });

      engine.freezeTicket({
        ticketId: ticket!.id,
        actor: venueAdmin,
        reason: 'Fraud investigation',
      });

      const result = engine.requestTransfer({
        ticketId: ticket!.id,
        fromFan: 'Alice Smith',
        toFan: { name: 'Bob Jones' },
        reason: 'Gift',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('frozen');
    });
  });

  // ==========================================================================
  // TC-7: Anti-scalping price cap
  // ==========================================================================
  describe('TC-7: Anti-scalping price cap', () => {
    it('should allow resale at face value', () => {
      const { ticket } = engine.createTicket(defaultTicketParams);
      engine.issueTicket({ ticketId: ticket!.id, actor: boxOffice });

      const result = engine.requestTransfer({
        ticketId: ticket!.id,
        fromFan: 'Alice Smith',
        toFan: { name: 'Bob Jones' },
        resalePrice: '250.00',
        reason: 'Resale',
      });

      expect(result.success).toBe(true);
    });

    it('should allow resale at 110% cap (10% max)', () => {
      const { ticket } = engine.createTicket(defaultTicketParams);
      engine.issueTicket({ ticketId: ticket!.id, actor: boxOffice });

      const result = engine.requestTransfer({
        ticketId: ticket!.id,
        fromFan: 'Alice Smith',
        toFan: { name: 'Bob Jones' },
        resalePrice: '275.00', // 250 * 1.10 = 275
        reason: 'Resale',
      });

      expect(result.success).toBe(true);
    });

    it('should reject resale above price cap', () => {
      const { ticket } = engine.createTicket(defaultTicketParams);
      engine.issueTicket({ ticketId: ticket!.id, actor: boxOffice });

      const result = engine.requestTransfer({
        ticketId: ticket!.id,
        fromFan: 'Alice Smith',
        toFan: { name: 'Bob Jones' },
        resalePrice: '300.00', // Above 275 cap
        reason: 'Scalping attempt',
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('RESALE_PRICE_CAP_EXCEEDED');
      expect(result.error).toContain('exceeds cap');
    });

    it('should record resale in history when transfer approved', () => {
      const { ticket } = engine.createTicket(defaultTicketParams);
      engine.issueTicket({ ticketId: ticket!.id, actor: boxOffice });

      const transferResult = engine.requestTransfer({
        ticketId: ticket!.id,
        fromFan: 'Alice Smith',
        toFan: { name: 'Bob Jones' },
        resalePrice: '260.00',
        reason: 'Resale',
      });

      engine.approveTransfer({
        requestId: transferResult.request!.id,
        approvedBy: 'box-office-1',
      });

      const updated = engine.getTicket(ticket!.id);
      const metadata = updated!.metadata as unknown as ConcertTicketMetadata;
      expect(metadata.antiScalping.resaleHistory.length).toBe(1);
      expect(metadata.antiScalping.resaleHistory[0].price).toBe('260.00');
      expect(metadata.antiScalping.resaleHistory[0].fromFan).toBe('Alice Smith');
      expect(metadata.antiScalping.resaleHistory[0].toFan).toBe('Bob Jones');
    });
  });

  // ==========================================================================
  // TC-8: Cancellation/refund
  // ==========================================================================
  describe('TC-8: Cancellation/refund', () => {
    it('should allow free cancellation within window', () => {
      const { ticket } = engine.createTicket(defaultTicketParams);
      engine.issueTicket({ ticketId: ticket!.id, actor: boxOffice });

      const result = engine.cancelTicket({
        ticketId: ticket!.id,
        requestedBy: 'Alice Smith',
        reason: 'Change of plans',
      });

      expect(result.success).toBe(true);
      expect(parseFloat(result.refundAmount!)).toBe(275.00);
    });

    it('should reject cancellation after admission', () => {
      const { ticket } = engine.createTicket(defaultTicketParams);
      engine.issueTicket({ ticketId: ticket!.id, actor: boxOffice });
      engine.admitEntry({ ticketId: ticket!.id, actor: security });

      const result = engine.cancelTicket({
        ticketId: ticket!.id,
        requestedBy: 'Alice Smith',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot cancel');
    });

    it('should apply cancellation fee when configured', () => {
      const { ticket } = engine.createTicket({
        ...defaultTicketParams,
        cancellationPolicy: {
          refundable: true,
          cancellationFee: '50.00',
          freeCancellationDeadlineHours: 48,
          penaltyPercentage: 100,
        },
      });
      engine.issueTicket({ ticketId: ticket!.id, actor: boxOffice });

      const result = engine.cancelTicket({
        ticketId: ticket!.id,
        requestedBy: 'Alice Smith',
      });

      expect(result.success).toBe(true);
      expect(parseFloat(result.refundAmount!)).toBe(225.00); // 275 - 50
    });

    it('should process refund on cancelled ticket', () => {
      const { ticket } = engine.createTicket(defaultTicketParams);
      engine.issueTicket({ ticketId: ticket!.id, actor: boxOffice });

      engine.cancelTicket({
        ticketId: ticket!.id,
        requestedBy: 'Alice Smith',
      });

      const result = engine.processRefund({
        ticketId: ticket!.id,
        actor: boxOffice,
      });

      expect(result.success).toBe(true);
      const metadata = result.ticket!.metadata as unknown as ConcertTicketMetadata;
      expect(metadata.status).toBe(ConcertTicketStatus.REFUNDED);
    });
  });

  // ==========================================================================
  // TC-9: Modify ticket
  // ==========================================================================
  describe('TC-9: Modify ticket', () => {
    it('should modify seat of issued ticket', () => {
      const { ticket } = engine.createTicket(defaultTicketParams);
      engine.issueTicket({ ticketId: ticket!.id, actor: boxOffice });

      const result = engine.modifyTicket({
        ticketId: ticket!.id,
        changes: { section: 'B', row: '3', seat: '7' },
        actor: boxOffice,
      });

      expect(result.success).toBe(true);
      const metadata = result.ticket!.metadata as unknown as ConcertTicketMetadata;
      expect(metadata.seating.section).toBe('B');
      expect(metadata.seating.row).toBe('3');
      expect(metadata.seating.seat).toBe('7');
    });

    it('should reject modification after admission', () => {
      const { ticket } = engine.createTicket(defaultTicketParams);
      engine.issueTicket({ ticketId: ticket!.id, actor: boxOffice });
      engine.admitEntry({ ticketId: ticket!.id, actor: security });

      const result = engine.modifyTicket({
        ticketId: ticket!.id,
        changes: { seat: '20' },
        actor: boxOffice,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Must be ISSUED');
    });

    it('should reject modification of frozen ticket', () => {
      const { ticket } = engine.createTicket(defaultTicketParams);
      engine.issueTicket({ ticketId: ticket!.id, actor: boxOffice });

      engine.freezeTicket({
        ticketId: ticket!.id,
        actor: venueAdmin,
        reason: 'Investigation',
      });

      const result = engine.modifyTicket({
        ticketId: ticket!.id,
        changes: { seat: '20' },
        actor: boxOffice,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('frozen');
    });
  });

  // ==========================================================================
  // TC-10: Freeze/unfreeze
  // ==========================================================================
  describe('TC-10: Freeze/unfreeze', () => {
    it('should freeze a ticket', () => {
      const { ticket } = engine.createTicket(defaultTicketParams);
      engine.issueTicket({ ticketId: ticket!.id, actor: boxOffice });

      const result = engine.freezeTicket({
        ticketId: ticket!.id,
        actor: venueAdmin,
        reason: 'Suspicious activity',
      });

      expect(result.success).toBe(true);
      expect(result.freeze).toBeDefined();

      const updated = engine.getTicket(ticket!.id);
      const metadata = updated!.metadata as unknown as ConcertTicketMetadata;
      expect(metadata.frozen).toBe(true);
    });

    it('should block operations on frozen ticket', () => {
      const { ticket } = engine.createTicket(defaultTicketParams);
      engine.issueTicket({ ticketId: ticket!.id, actor: boxOffice });

      engine.freezeTicket({
        ticketId: ticket!.id,
        actor: venueAdmin,
        reason: 'Suspicious activity',
      });

      const transferResult = engine.requestTransfer({
        ticketId: ticket!.id,
        fromFan: 'Alice Smith',
        toFan: { name: 'Bob Jones' },
        reason: 'Gift',
      });
      expect(transferResult.success).toBe(false);

      const modifyResult = engine.modifyTicket({
        ticketId: ticket!.id,
        changes: { seat: '20' },
        actor: boxOffice,
      });
      expect(modifyResult.success).toBe(false);
    });

    it('should unfreeze and re-enable operations', () => {
      const { ticket } = engine.createTicket(defaultTicketParams);
      engine.issueTicket({ ticketId: ticket!.id, actor: boxOffice });

      engine.freezeTicket({
        ticketId: ticket!.id,
        actor: venueAdmin,
        reason: 'Suspicious activity',
      });

      const unfreezeResult = engine.unfreezeTicket({
        ticketId: ticket!.id,
        actor: venueAdmin,
      });
      expect(unfreezeResult.success).toBe(true);

      const modifyResult = engine.modifyTicket({
        ticketId: ticket!.id,
        changes: { seat: '20' },
        actor: boxOffice,
      });
      expect(modifyResult.success).toBe(true);
    });

    it('should reject freeze on already frozen ticket', () => {
      const { ticket } = engine.createTicket(defaultTicketParams);

      engine.freezeTicket({
        ticketId: ticket!.id,
        actor: venueAdmin,
        reason: 'First freeze',
      });

      const result = engine.freezeTicket({
        ticketId: ticket!.id,
        actor: venueAdmin,
        reason: 'Second freeze',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('already frozen');
    });
  });

  // ==========================================================================
  // TC-11: Double admission prevention
  // ==========================================================================
  describe('TC-11: Double admission prevention', () => {
    it('should return alreadyAdmitted on repeated admission', () => {
      const { ticket } = engine.createTicket(defaultTicketParams);
      engine.issueTicket({ ticketId: ticket!.id, actor: boxOffice });

      const result1 = engine.admitEntry({ ticketId: ticket!.id, actor: security });
      expect(result1.success).toBe(true);
      expect(result1.alreadyAdmitted).toBeFalsy();

      const result2 = engine.admitEntry({ ticketId: ticket!.id, actor: security });
      expect(result2.success).toBe(true);
      expect(result2.alreadyAdmitted).toBe(true);
    });
  });

  // ==========================================================================
  // TC-12: Metadata versioning
  // ==========================================================================
  describe('TC-12: Metadata versioning', () => {
    it('should build hash chain across create/issue/admit/complete', () => {
      const { ticket } = engine.createTicket(defaultTicketParams);
      engine.issueTicket({ ticketId: ticket!.id, actor: boxOffice });
      engine.admitEntry({ ticketId: ticket!.id, actor: security });
      engine.completeEvent({ ticketId: ticket!.id, actor: venueAdmin });

      const versions = engine.getMetadataVersions(ticket!.id);

      expect(versions.length).toBe(4);

      // Verify hash chain
      expect(versions[0].previousHash).toBe('');
      expect(versions[0].currentHash).toBeTruthy();

      for (let i = 1; i < versions.length; i++) {
        expect(versions[i].previousHash).toBe(versions[i - 1].currentHash);
        expect(versions[i].currentHash).toBeTruthy();
        expect(versions[i].currentHash).not.toBe(versions[i].previousHash);
      }

      expect(versions[0].version).toBe(0);
      expect(versions[1].version).toBe(1);
      expect(versions[2].version).toBe(2);
      expect(versions[3].version).toBe(3);
    });

    it('should record status changes in version history', () => {
      const { ticket } = engine.createTicket(defaultTicketParams);
      engine.issueTicket({ ticketId: ticket!.id, actor: boxOffice });

      const versions = engine.getMetadataVersions(ticket!.id);
      const issueVersion = versions[1];

      expect(issueVersion.changes.status).toBeDefined();
      expect(issueVersion.changes.status.old).toBe(ConcertTicketStatus.CREATED);
      expect(issueVersion.changes.status.new).toBe(ConcertTicketStatus.ISSUED);
    });

    it('should have unique hashes for each version', () => {
      const { ticket } = engine.createTicket(defaultTicketParams);
      engine.issueTicket({ ticketId: ticket!.id, actor: boxOffice });
      engine.admitEntry({ ticketId: ticket!.id, actor: security });

      const versions = engine.getMetadataVersions(ticket!.id);
      const hashes = versions.map(v => v.currentHash);
      const uniqueHashes = new Set(hashes);
      expect(uniqueHashes.size).toBe(hashes.length);
    });
  });

  // ==========================================================================
  // TC-13: RBAC
  // ==========================================================================
  describe('TC-13: RBAC', () => {
    it('should allow security to admit', () => {
      const { ticket } = engine.createTicket(defaultTicketParams);
      engine.issueTicket({ ticketId: ticket!.id, actor: boxOffice });

      const result = engine.admitEntry({ ticketId: ticket!.id, actor: security });
      expect(result.success).toBe(true);
    });

    it('should allow box office to issue', () => {
      const { ticket } = engine.createTicket(defaultTicketParams);

      const result = engine.issueTicket({ ticketId: ticket!.id, actor: boxOffice });
      expect(result.success).toBe(true);
    });

    it('should block fan from admitting', () => {
      const { ticket } = engine.createTicket(defaultTicketParams);
      engine.issueTicket({ ticketId: ticket!.id, actor: boxOffice });

      expect(() => {
        engine.admitEntry({ ticketId: ticket!.id, actor: fan });
      }).toThrow('PERMISSION_DENIED');
    });

    it('should block auditor from modifying', () => {
      const { ticket } = engine.createTicket(defaultTicketParams);
      engine.issueTicket({ ticketId: ticket!.id, actor: boxOffice });

      expect(() => {
        engine.modifyTicket({
          ticketId: ticket!.id,
          changes: { seat: '20' },
          actor: auditor,
        });
      }).toThrow('PERMISSION_DENIED');
    });

    it('should allow venue admin to freeze', () => {
      const { ticket } = engine.createTicket(defaultTicketParams);

      const result = engine.freezeTicket({
        ticketId: ticket!.id,
        actor: venueAdmin,
        reason: 'Admin freeze',
      });
      expect(result.success).toBe(true);
    });
  });

  // ==========================================================================
  // TC-14: Event tracking
  // ==========================================================================
  describe('TC-14: Event tracking', () => {
    it('should emit events for each state change', () => {
      const { ticket } = engine.createTicket(defaultTicketParams);
      engine.issueTicket({ ticketId: ticket!.id, actor: boxOffice });
      engine.admitEntry({ ticketId: ticket!.id, actor: security });
      engine.completeEvent({ ticketId: ticket!.id, actor: venueAdmin });

      const events = engine.getTicketEvents(ticket!.id);

      const eventTypes = events.map(e => e.type);
      expect(eventTypes).toContain(ConcertTicketEventType.TICKET_CREATED);
      expect(eventTypes).toContain(ConcertTicketEventType.TICKET_ISSUED);
      expect(eventTypes).toContain(ConcertTicketEventType.ENTRY_ADMITTED);
      expect(eventTypes).toContain(ConcertTicketEventType.EVENT_COMPLETED);
    });

    it('should isolate events per ticket', () => {
      const t1 = engine.createTicket(defaultTicketParams).ticket!;
      const t2 = engine.createTicket({
        ...defaultTicketParams,
        confirmationNumber: 'MSG-TKT-002',
        fanInfo: { ...defaultTicketParams.fanInfo, fanName: 'Bob Jones' },
      }).ticket!;

      engine.issueTicket({ ticketId: t1.id, actor: boxOffice });

      const events1 = engine.getTicketEvents(t1.id);
      const events2 = engine.getTicketEvents(t2.id);

      expect(events1.length).toBe(2);
      expect(events2.length).toBe(1);
    });

    it('should include event data', () => {
      const { ticket } = engine.createTicket(defaultTicketParams);

      const events = engine.getTicketEvents(ticket!.id);
      const createEvent = events.find(e => e.type === ConcertTicketEventType.TICKET_CREATED);

      expect(createEvent).toBeDefined();
      expect(createEvent!.data.fanName).toBe('Alice Smith');
      expect(createEvent!.data.venueCode).toBe(VENUE_CODE);
      expect(createEvent!.confirmationNumber).toBe('MSG-TKT-001');
    });
  });

  // ==========================================================================
  // TC-15: Age restriction
  // ==========================================================================
  describe('TC-15: Age restriction', () => {
    it('should block transfer to underage fan', () => {
      const { ticket } = engine.createTicket({
        ...defaultTicketParams,
        restrictions: {
          minimumAge: 18,
          leadBookerRequired: false,
          idRequiredAtEntry: false,
          maxResalePercent: 10,
        },
      });
      engine.issueTicket({ ticketId: ticket!.id, actor: boxOffice });

      const result = engine.requestTransfer({
        ticketId: ticket!.id,
        fromFan: 'Alice Smith',
        toFan: { name: 'Young Fan', age: 16 },
        reason: 'Gift',
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('AGE_RESTRICTION_FAILED');
      expect(result.error).toContain('below minimum age');
    });

    it('should allow transfer to of-age fan', () => {
      const { ticket } = engine.createTicket({
        ...defaultTicketParams,
        restrictions: {
          minimumAge: 18,
          leadBookerRequired: false,
          idRequiredAtEntry: false,
          maxResalePercent: 10,
        },
      });
      engine.issueTicket({ ticketId: ticket!.id, actor: boxOffice });

      const result = engine.requestTransfer({
        ticketId: ticket!.id,
        fromFan: 'Alice Smith',
        toFan: { name: 'Adult Fan', age: 21 },
        reason: 'Gift',
      });

      expect(result.success).toBe(true);
    });

    it('should skip age check if no restriction set', () => {
      const { ticket } = engine.createTicket(defaultTicketParams);
      engine.issueTicket({ ticketId: ticket!.id, actor: boxOffice });

      const result = engine.requestTransfer({
        ticketId: ticket!.id,
        fromFan: 'Alice Smith',
        toFan: { name: 'Young Fan', age: 14 },
        reason: 'Gift',
      });

      // Should succeed because no minimumAge restriction
      expect(result.success).toBe(true);
    });
  });

  // ==========================================================================
  // TC-16: Lead booker + Bulk
  // ==========================================================================
  describe('TC-16: Lead booker + Bulk', () => {
    it('should block non-lead-booker from transferring when required', () => {
      const { ticket } = engine.createTicket({
        ...defaultTicketParams,
        fanInfo: {
          ...defaultTicketParams.fanInfo,
          fanName: 'Group Member',
        },
        leadBooker: {
          name: 'Alice Smith',
          bookingGroupSize: 4,
        },
        restrictions: {
          leadBookerRequired: true,
          idRequiredAtEntry: false,
          maxResalePercent: 10,
        },
      });
      engine.issueTicket({ ticketId: ticket!.id, actor: boxOffice });

      const result = engine.requestTransfer({
        ticketId: ticket!.id,
        fromFan: 'Group Member',
        toFan: { name: 'Someone Else' },
        reason: 'Transfer',
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('LEAD_BOOKER_REQUIRED');
    });

    it('should allow lead booker to transfer when required', () => {
      const { ticket } = engine.createTicket({
        ...defaultTicketParams,
        leadBooker: {
          name: 'Alice Smith',
          bookingGroupSize: 4,
        },
        restrictions: {
          leadBookerRequired: true,
          idRequiredAtEntry: false,
          maxResalePercent: 10,
        },
      });
      engine.issueTicket({ ticketId: ticket!.id, actor: boxOffice });

      const result = engine.requestTransfer({
        ticketId: ticket!.id,
        fromFan: 'Alice Smith',
        toFan: { name: 'Bob Jones' },
        reason: 'Transfer',
      });

      // Should succeed because Alice Smith IS the lead booker
      expect(result.success).toBe(true);
    });

    it('should create 50 tickets with unique IDs', () => {
      const ids = new Set<string>();

      for (let i = 0; i < 50; i++) {
        const result = engine.createTicket({
          ...defaultTicketParams,
          confirmationNumber: `MSG-BULK-${i}`,
          fanInfo: { ...defaultTicketParams.fanInfo, fanName: `Fan ${i}` },
        });

        expect(result.success).toBe(true);
        expect(result.ticket).toBeDefined();
        ids.add(result.ticket!.id);
      }

      expect(ids.size).toBe(50);
    });

    it('should handle concurrent-like operations on different tickets', () => {
      const tickets: string[] = [];

      for (let i = 0; i < 10; i++) {
        const result = engine.createTicket({
          ...defaultTicketParams,
          confirmationNumber: `MSG-CONC-${i}`,
          fanInfo: { ...defaultTicketParams.fanInfo, fanName: `Fan ${i}` },
        });
        tickets.push(result.ticket!.id);
        engine.issueTicket({ ticketId: result.ticket!.id, actor: boxOffice });
      }

      for (const id of tickets) {
        const result = engine.admitEntry({ ticketId: id, actor: security });
        expect(result.success).toBe(true);
      }

      for (const id of tickets) {
        const result = engine.completeEvent({ ticketId: id, actor: venueAdmin });
        expect(result.success).toBe(true);
      }

      for (const id of tickets) {
        const t = engine.getTicket(id);
        const metadata = t!.metadata as unknown as ConcertTicketMetadata;
        expect(metadata.status).toBe(ConcertTicketStatus.USED);
      }
    });
  });
});
