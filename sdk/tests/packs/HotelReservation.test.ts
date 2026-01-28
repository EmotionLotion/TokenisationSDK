/**
 * Hotel Reservation Engine Tests
 *
 * Production-readiness test cases covering:
 * - TC-1: Create reservation
 * - TC-2: Confirm reservation
 * - TC-3: Check-in
 * - TC-4: Check-out
 * - TC-5: Transfer before check-in
 * - TC-6: Transfer after check-in
 * - TC-7: Cancellation policy
 * - TC-8: Modify reservation
 * - TC-9: Extend stay
 * - TC-10: Freeze/unfreeze
 * - TC-11: Double check-in prevention
 * - TC-12: Metadata versioning
 * - TC-13: RBAC
 * - TC-14: Event tracking
 * - TC-15: No-show handling
 * - TC-16: Bulk operations
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  HotelReservationEngine,
  RoomType,
  HotelReservationStatus,
  HotelRole,
  HotelEventType,
  type ActorContext,
  type HotelReservationMetadata,
} from '../../src/packs/HotelReservation.js';

describe('HotelReservationEngine', () => {
  let engine: HotelReservationEngine;
  const HOTEL_CODE = 'HILTON-DXB';

  // Test actors
  const hotelAdmin: ActorContext = {
    actorId: 'hotel-admin-1',
    role: HotelRole.HOTEL_ADMIN,
    hotelCode: HOTEL_CODE,
  };

  const frontDesk: ActorContext = {
    actorId: 'front-desk-1',
    role: HotelRole.FRONT_DESK,
    hotelCode: HOTEL_CODE,
  };

  const guest: ActorContext = {
    actorId: 'John Doe',
    role: HotelRole.GUEST,
    guestId: 'John Doe',
  };

  const auditor: ActorContext = {
    actorId: 'auditor-1',
    role: HotelRole.AUDITOR,
  };

  const concierge: ActorContext = {
    actorId: 'concierge-1',
    role: HotelRole.CONCIERGE,
    hotelCode: HOTEL_CODE,
  };

  const checkInDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const checkOutDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();

  const defaultReservationParams = {
    hotelCode: HOTEL_CODE,
    hotelName: 'Hilton Dubai Creek',
    confirmationNumber: 'HLT-123456',
    guestName: 'John Doe',
    roomType: RoomType.DELUXE,
    checkInDate,
    checkOutDate,
    rate: {
      perNight: '200.00',
      total: '600.00',
      taxes: '60.00',
      currency: 'USD',
      rateType: 'BEST_AVAILABLE',
    },
    transferRules: {
      maxTransfers: 2,
      transferCount: 0,
      nameChangeFee: '25.00',
      transferDeadlineHours: 24,
      autoApproveWithIdentity: true,
    },
    cancellationPolicy: {
      refundable: true,
      cancellationFee: '0.00',
      freeCancellationDeadlineHours: 24,
      penaltyPercentage: 100,
    },
  };

  beforeEach(() => {
    engine = new HotelReservationEngine();
    engine.registerHotel(HOTEL_CODE);
  });

  // ==========================================================================
  // TC-1: Create reservation
  // ==========================================================================
  describe('TC-1: Create reservation', () => {
    it('should create reservation with correct metadata', () => {
      const result = engine.createReservation(defaultReservationParams);

      expect(result.success).toBe(true);
      expect(result.reservation).toBeDefined();
      expect(result.reservation!.id).toBeDefined();

      const metadata = result.reservation!.metadata as unknown as HotelReservationMetadata;
      expect(metadata.confirmationNumber).toBe('HLT-123456');
      expect(metadata.guestName).toBe('John Doe');
      expect(metadata.hotelCode).toBe(HOTEL_CODE);
      expect(metadata.roomType).toBe(RoomType.DELUXE);
      expect(metadata.status).toBe(HotelReservationStatus.CREATED);
      expect(metadata.nightCount).toBe(3);
    });

    it('should reject reservation from unauthorized hotel', () => {
      const result = engine.createReservation({
        ...defaultReservationParams,
        hotelCode: 'UNKNOWN-HOTEL',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Hotel not authorized');
    });

    it('should create initial metadata version on creation', () => {
      const result = engine.createReservation(defaultReservationParams);
      expect(result.success).toBe(true);

      const versions = engine.getMetadataVersions(result.reservation!.id);
      expect(versions.length).toBe(1);
      expect(versions[0].version).toBe(0);
      expect(versions[0].changeReason).toBe('Initial creation');
    });
  });

  // ==========================================================================
  // TC-2: Confirm reservation
  // ==========================================================================
  describe('TC-2: Confirm reservation', () => {
    it('should transition CREATED → CONFIRMED', () => {
      const { reservation } = engine.createReservation(defaultReservationParams);

      const result = engine.confirmReservation({
        reservationId: reservation!.id,
        actor: frontDesk,
      });

      expect(result.success).toBe(true);
      const metadata = result.reservation!.metadata as unknown as HotelReservationMetadata;
      expect(metadata.status).toBe(HotelReservationStatus.CONFIRMED);
    });

    it('should be idempotent (double confirm returns success)', () => {
      const { reservation } = engine.createReservation(defaultReservationParams);

      const result1 = engine.confirmReservation({
        reservationId: reservation!.id,
        actor: frontDesk,
      });
      expect(result1.success).toBe(true);

      const result2 = engine.confirmReservation({
        reservationId: reservation!.id,
        actor: frontDesk,
      });
      expect(result2.success).toBe(true);
    });

    it('should reject confirm from invalid state', () => {
      const { reservation } = engine.createReservation(defaultReservationParams);
      engine.confirmReservation({ reservationId: reservation!.id, actor: frontDesk });

      // Check in
      engine.checkIn({ reservationId: reservation!.id, actor: frontDesk });

      // Try to confirm again from CHECKED_IN
      const result = engine.confirmReservation({
        reservationId: reservation!.id,
        actor: frontDesk,
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot confirm from status');
    });
  });

  // ==========================================================================
  // TC-3: Check-in
  // ==========================================================================
  describe('TC-3: Check-in', () => {
    it('should transition CONFIRMED → CHECKED_IN', () => {
      const { reservation } = engine.createReservation(defaultReservationParams);
      engine.confirmReservation({ reservationId: reservation!.id, actor: frontDesk });

      const result = engine.checkIn({
        reservationId: reservation!.id,
        actor: frontDesk,
        roomNumber: '1205',
      });

      expect(result.success).toBe(true);
      const metadata = result.reservation!.metadata as unknown as HotelReservationMetadata;
      expect(metadata.status).toBe(HotelReservationStatus.CHECKED_IN);
      expect(metadata.roomNumber).toBe('1205');
    });

    it('should be idempotent (returns alreadyCheckedIn)', () => {
      const { reservation } = engine.createReservation(defaultReservationParams);
      engine.confirmReservation({ reservationId: reservation!.id, actor: frontDesk });

      const result1 = engine.checkIn({ reservationId: reservation!.id, actor: frontDesk });
      expect(result1.success).toBe(true);
      expect(result1.alreadyCheckedIn).toBeFalsy();

      const result2 = engine.checkIn({ reservationId: reservation!.id, actor: frontDesk });
      expect(result2.success).toBe(true);
      expect(result2.alreadyCheckedIn).toBe(true);
    });

    it('should reject check-in from CREATED status', () => {
      const { reservation } = engine.createReservation(defaultReservationParams);

      const result = engine.checkIn({
        reservationId: reservation!.id,
        actor: frontDesk,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot check in from status');
    });

    it('should block check-in when reservation is frozen', () => {
      const { reservation } = engine.createReservation(defaultReservationParams);
      engine.confirmReservation({ reservationId: reservation!.id, actor: frontDesk });

      engine.freezeReservation({
        reservationId: reservation!.id,
        actor: hotelAdmin,
        reason: 'Payment dispute',
      });

      const result = engine.checkIn({
        reservationId: reservation!.id,
        actor: frontDesk,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('frozen');
    });
  });

  // ==========================================================================
  // TC-4: Check-out
  // ==========================================================================
  describe('TC-4: Check-out', () => {
    it('should transition CHECKED_IN → CHECKED_OUT', () => {
      const { reservation } = engine.createReservation(defaultReservationParams);
      engine.confirmReservation({ reservationId: reservation!.id, actor: frontDesk });
      engine.checkIn({ reservationId: reservation!.id, actor: frontDesk });

      const result = engine.checkOut({
        reservationId: reservation!.id,
        actor: frontDesk,
      });

      expect(result.success).toBe(true);
      const metadata = result.reservation!.metadata as unknown as HotelReservationMetadata;
      expect(metadata.status).toBe(HotelReservationStatus.CHECKED_OUT);
    });

    it('should reject check-out if not checked in', () => {
      const { reservation } = engine.createReservation(defaultReservationParams);
      engine.confirmReservation({ reservationId: reservation!.id, actor: frontDesk });

      const result = engine.checkOut({
        reservationId: reservation!.id,
        actor: frontDesk,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Must be CHECKED_IN');
    });

    it('should allow CHECKED_OUT → CLOSED', () => {
      const { reservation } = engine.createReservation(defaultReservationParams);
      engine.confirmReservation({ reservationId: reservation!.id, actor: frontDesk });
      engine.checkIn({ reservationId: reservation!.id, actor: frontDesk });
      engine.checkOut({ reservationId: reservation!.id, actor: frontDesk });

      const result = engine.closeReservation({
        reservationId: reservation!.id,
        actor: frontDesk,
      });

      expect(result.success).toBe(true);
      const metadata = result.reservation!.metadata as unknown as HotelReservationMetadata;
      expect(metadata.status).toBe(HotelReservationStatus.CLOSED);
    });
  });

  // ==========================================================================
  // TC-5: Transfer before check-in
  // ==========================================================================
  describe('TC-5: Transfer before check-in', () => {
    it('should allow transfer of confirmed reservation', () => {
      const { reservation } = engine.createReservation(defaultReservationParams);
      engine.confirmReservation({ reservationId: reservation!.id, actor: frontDesk });

      const result = engine.requestTransfer({
        reservationId: reservation!.id,
        fromGuest: 'John Doe',
        toGuest: { name: 'Jane Doe' },
        reason: 'Gift',
      });

      expect(result.success).toBe(true);
      expect(result.request).toBeDefined();
    });

    it('should change guest name after approved transfer', () => {
      const { reservation } = engine.createReservation(defaultReservationParams);
      engine.confirmReservation({ reservationId: reservation!.id, actor: frontDesk });

      const transferResult = engine.requestTransfer({
        reservationId: reservation!.id,
        fromGuest: 'John Doe',
        toGuest: { name: 'Jane Doe' },
        reason: 'Gift',
      });

      engine.approveTransfer({
        requestId: transferResult.request!.id,
        approvedBy: 'front-desk-1',
      });

      const updated = engine.getReservation(reservation!.id);
      const metadata = updated!.metadata as unknown as HotelReservationMetadata;
      expect(metadata.guestName).toBe('Jane Doe');
      expect(metadata.transferRules.transferCount).toBe(1);
    });

    it('should auto-approve with verified identity', () => {
      engine.verifyIdentity('PASSPORT:US:P123456');

      const { reservation } = engine.createReservation(defaultReservationParams);
      engine.confirmReservation({ reservationId: reservation!.id, actor: frontDesk });

      const result = engine.requestTransfer({
        reservationId: reservation!.id,
        fromGuest: 'John Doe',
        toGuest: {
          name: 'Jane Doe',
          identity: {
            type: 'PASSPORT',
            number: 'P123456',
            country: 'US',
            expiryDate: '2028-01-01',
          },
        },
        reason: 'Gift',
      });

      expect(result.success).toBe(true);
      expect(result.request!.status).toBe('AUTO_APPROVED');

      const updated = engine.getReservation(reservation!.id);
      const metadata = updated!.metadata as unknown as HotelReservationMetadata;
      expect(metadata.guestName).toBe('Jane Doe');
    });
  });

  // ==========================================================================
  // TC-6: Transfer after check-in (blocked)
  // ==========================================================================
  describe('TC-6: Transfer after check-in', () => {
    it('should block transfer after check-in (RESERVATION_LOCKED_AFTER_CHECKIN)', () => {
      const { reservation } = engine.createReservation(defaultReservationParams);
      engine.confirmReservation({ reservationId: reservation!.id, actor: frontDesk });
      engine.checkIn({ reservationId: reservation!.id, actor: frontDesk });

      const result = engine.requestTransfer({
        reservationId: reservation!.id,
        fromGuest: 'John Doe',
        toGuest: { name: 'Jane Doe' },
        reason: 'Gift',
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('RESERVATION_LOCKED_AFTER_CHECKIN');
      expect(result.error).toContain('locked after check-in');
    });

    it('should block transfer of frozen reservation', () => {
      const { reservation } = engine.createReservation(defaultReservationParams);
      engine.confirmReservation({ reservationId: reservation!.id, actor: frontDesk });

      engine.freezeReservation({
        reservationId: reservation!.id,
        actor: hotelAdmin,
        reason: 'Fraud investigation',
      });

      const result = engine.requestTransfer({
        reservationId: reservation!.id,
        fromGuest: 'John Doe',
        toGuest: { name: 'Jane Doe' },
        reason: 'Gift',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('frozen');
    });
  });

  // ==========================================================================
  // TC-7: Cancellation policy
  // ==========================================================================
  describe('TC-7: Cancellation policy', () => {
    it('should allow free cancellation within window', () => {
      const { reservation } = engine.createReservation(defaultReservationParams);
      engine.confirmReservation({ reservationId: reservation!.id, actor: frontDesk });

      const result = engine.cancelReservation({
        reservationId: reservation!.id,
        requestedBy: 'John Doe',
        reason: 'Change of plans',
      });

      expect(result.success).toBe(true);
      // No cancellation fee, so full refund
      expect(parseFloat(result.refundAmount!)).toBe(600.00);
    });

    it('should reject cancellation after check-in', () => {
      const { reservation } = engine.createReservation(defaultReservationParams);
      engine.confirmReservation({ reservationId: reservation!.id, actor: frontDesk });
      engine.checkIn({ reservationId: reservation!.id, actor: frontDesk });

      const result = engine.cancelReservation({
        reservationId: reservation!.id,
        requestedBy: 'John Doe',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot cancel');
    });

    it('should apply cancellation fee when configured', () => {
      const { reservation } = engine.createReservation({
        ...defaultReservationParams,
        cancellationPolicy: {
          refundable: true,
          cancellationFee: '100.00',
          freeCancellationDeadlineHours: 24,
          penaltyPercentage: 100,
        },
      });
      engine.confirmReservation({ reservationId: reservation!.id, actor: frontDesk });

      const result = engine.cancelReservation({
        reservationId: reservation!.id,
        requestedBy: 'John Doe',
      });

      expect(result.success).toBe(true);
      expect(parseFloat(result.refundAmount!)).toBe(500.00); // 600 - 100
    });

    it('should allow cancellation of CREATED (unconfirmed) reservation', () => {
      const { reservation } = engine.createReservation(defaultReservationParams);

      const result = engine.cancelReservation({
        reservationId: reservation!.id,
        requestedBy: 'John Doe',
      });

      expect(result.success).toBe(true);
    });
  });

  // ==========================================================================
  // TC-8: Modify reservation
  // ==========================================================================
  describe('TC-8: Modify reservation', () => {
    it('should modify dates of confirmed reservation', () => {
      const { reservation } = engine.createReservation(defaultReservationParams);
      engine.confirmReservation({ reservationId: reservation!.id, actor: frontDesk });

      const newCheckOut = new Date(Date.now() + 12 * 24 * 60 * 60 * 1000).toISOString();

      const result = engine.modifyReservation({
        reservationId: reservation!.id,
        changes: { checkOutDate: newCheckOut },
        actor: frontDesk,
      });

      expect(result.success).toBe(true);
      const metadata = result.reservation!.metadata as unknown as HotelReservationMetadata;
      expect(metadata.checkOutDate).toBe(newCheckOut);
      expect(metadata.nightCount).toBe(5); // ~12 - 7 = 5 days
    });

    it('should modify room type of confirmed reservation', () => {
      const { reservation } = engine.createReservation(defaultReservationParams);
      engine.confirmReservation({ reservationId: reservation!.id, actor: frontDesk });

      const result = engine.modifyReservation({
        reservationId: reservation!.id,
        changes: { roomType: RoomType.SUITE },
        actor: frontDesk,
      });

      expect(result.success).toBe(true);
      const metadata = result.reservation!.metadata as unknown as HotelReservationMetadata;
      expect(metadata.roomType).toBe(RoomType.SUITE);
    });

    it('should reject modification of checked-in reservation', () => {
      const { reservation } = engine.createReservation(defaultReservationParams);
      engine.confirmReservation({ reservationId: reservation!.id, actor: frontDesk });
      engine.checkIn({ reservationId: reservation!.id, actor: frontDesk });

      const result = engine.modifyReservation({
        reservationId: reservation!.id,
        changes: { roomType: RoomType.PENTHOUSE },
        actor: frontDesk,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Must be CONFIRMED');
    });

    it('should reject modification of frozen reservation', () => {
      const { reservation } = engine.createReservation(defaultReservationParams);
      engine.confirmReservation({ reservationId: reservation!.id, actor: frontDesk });

      engine.freezeReservation({
        reservationId: reservation!.id,
        actor: hotelAdmin,
        reason: 'Investigation',
      });

      const result = engine.modifyReservation({
        reservationId: reservation!.id,
        changes: { roomType: RoomType.SUITE },
        actor: frontDesk,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('frozen');
    });
  });

  // ==========================================================================
  // TC-9: Extend stay
  // ==========================================================================
  describe('TC-9: Extend stay', () => {
    it('should extend checkout date and update nightCount and total', () => {
      const { reservation } = engine.createReservation(defaultReservationParams);
      engine.confirmReservation({ reservationId: reservation!.id, actor: frontDesk });
      engine.checkIn({ reservationId: reservation!.id, actor: frontDesk });

      const newCheckOut = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

      const result = engine.extendStay({
        reservationId: reservation!.id,
        newCheckOutDate: newCheckOut,
        actor: frontDesk,
      });

      expect(result.success).toBe(true);
      const metadata = result.reservation!.metadata as unknown as HotelReservationMetadata;
      expect(metadata.checkOutDate).toBe(newCheckOut);
      expect(metadata.nightCount).toBe(7); // ~14 - 7 = 7 days
      // Total should be recalculated: 200 * 7 + 60 = 1460
      expect(metadata.rate.total).toBe('1460.00');
    });

    it('should reject extend from non-CHECKED_IN status', () => {
      const { reservation } = engine.createReservation(defaultReservationParams);
      engine.confirmReservation({ reservationId: reservation!.id, actor: frontDesk });

      const result = engine.extendStay({
        reservationId: reservation!.id,
        newCheckOutDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        actor: frontDesk,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Must be CHECKED_IN');
    });

    it('should reject if new checkout is before current checkout', () => {
      const { reservation } = engine.createReservation(defaultReservationParams);
      engine.confirmReservation({ reservationId: reservation!.id, actor: frontDesk });
      engine.checkIn({ reservationId: reservation!.id, actor: frontDesk });

      const result = engine.extendStay({
        reservationId: reservation!.id,
        newCheckOutDate: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString(), // Before original checkout
        actor: frontDesk,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('after current check-out date');
    });
  });

  // ==========================================================================
  // TC-10: Freeze/unfreeze
  // ==========================================================================
  describe('TC-10: Freeze/unfreeze', () => {
    it('should freeze a reservation', () => {
      const { reservation } = engine.createReservation(defaultReservationParams);
      engine.confirmReservation({ reservationId: reservation!.id, actor: frontDesk });

      const result = engine.freezeReservation({
        reservationId: reservation!.id,
        actor: hotelAdmin,
        reason: 'Payment dispute',
      });

      expect(result.success).toBe(true);
      expect(result.freeze).toBeDefined();

      const updated = engine.getReservation(reservation!.id);
      const metadata = updated!.metadata as unknown as HotelReservationMetadata;
      expect(metadata.frozen).toBe(true);
    });

    it('should block operations on frozen reservation', () => {
      const { reservation } = engine.createReservation(defaultReservationParams);
      engine.confirmReservation({ reservationId: reservation!.id, actor: frontDesk });

      engine.freezeReservation({
        reservationId: reservation!.id,
        actor: hotelAdmin,
        reason: 'Payment dispute',
      });

      // Check-in should fail
      const checkInResult = engine.checkIn({
        reservationId: reservation!.id,
        actor: frontDesk,
      });
      expect(checkInResult.success).toBe(false);

      // Transfer should fail
      const transferResult = engine.requestTransfer({
        reservationId: reservation!.id,
        fromGuest: 'John Doe',
        toGuest: { name: 'Jane Doe' },
        reason: 'Gift',
      });
      expect(transferResult.success).toBe(false);
    });

    it('should unfreeze and re-enable operations', () => {
      const { reservation } = engine.createReservation(defaultReservationParams);
      engine.confirmReservation({ reservationId: reservation!.id, actor: frontDesk });

      engine.freezeReservation({
        reservationId: reservation!.id,
        actor: hotelAdmin,
        reason: 'Payment dispute',
      });

      const unfreezeResult = engine.unfreezeReservation({
        reservationId: reservation!.id,
        actor: hotelAdmin,
      });
      expect(unfreezeResult.success).toBe(true);

      // Check-in should now work
      const checkInResult = engine.checkIn({
        reservationId: reservation!.id,
        actor: frontDesk,
      });
      expect(checkInResult.success).toBe(true);
    });

    it('should reject freeze on already frozen reservation', () => {
      const { reservation } = engine.createReservation(defaultReservationParams);

      engine.freezeReservation({
        reservationId: reservation!.id,
        actor: hotelAdmin,
        reason: 'First freeze',
      });

      const result = engine.freezeReservation({
        reservationId: reservation!.id,
        actor: hotelAdmin,
        reason: 'Second freeze',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('already frozen');
    });
  });

  // ==========================================================================
  // TC-11: Double check-in prevention
  // ==========================================================================
  describe('TC-11: Double check-in prevention', () => {
    it('should return alreadyCheckedIn on repeated check-in', () => {
      const { reservation } = engine.createReservation(defaultReservationParams);
      engine.confirmReservation({ reservationId: reservation!.id, actor: frontDesk });

      const result1 = engine.checkIn({ reservationId: reservation!.id, actor: frontDesk });
      expect(result1.success).toBe(true);
      expect(result1.alreadyCheckedIn).toBeFalsy();

      const result2 = engine.checkIn({ reservationId: reservation!.id, actor: frontDesk });
      expect(result2.success).toBe(true);
      expect(result2.alreadyCheckedIn).toBe(true);

      const result3 = engine.checkIn({ reservationId: reservation!.id, actor: frontDesk });
      expect(result3.success).toBe(true);
      expect(result3.alreadyCheckedIn).toBe(true);
    });
  });

  // ==========================================================================
  // TC-12: Metadata versioning
  // ==========================================================================
  describe('TC-12: Metadata versioning', () => {
    it('should build hash chain across create/confirm/checkIn/checkOut', () => {
      const { reservation } = engine.createReservation(defaultReservationParams);
      engine.confirmReservation({ reservationId: reservation!.id, actor: frontDesk });
      engine.checkIn({ reservationId: reservation!.id, actor: frontDesk });
      engine.checkOut({ reservationId: reservation!.id, actor: frontDesk });

      const versions = engine.getMetadataVersions(reservation!.id);

      // Should have 4 versions: create, confirm, check-in, check-out
      expect(versions.length).toBe(4);

      // Verify hash chain
      expect(versions[0].previousHash).toBe('');
      expect(versions[0].currentHash).toBeTruthy();

      for (let i = 1; i < versions.length; i++) {
        expect(versions[i].previousHash).toBe(versions[i - 1].currentHash);
        expect(versions[i].currentHash).toBeTruthy();
        expect(versions[i].currentHash).not.toBe(versions[i].previousHash);
      }

      // Verify version numbers
      expect(versions[0].version).toBe(0);
      expect(versions[1].version).toBe(1);
      expect(versions[2].version).toBe(2);
      expect(versions[3].version).toBe(3);
    });

    it('should record status changes in version history', () => {
      const { reservation } = engine.createReservation(defaultReservationParams);
      engine.confirmReservation({ reservationId: reservation!.id, actor: frontDesk });

      const versions = engine.getMetadataVersions(reservation!.id);
      const confirmVersion = versions[1];

      expect(confirmVersion.changes.status).toBeDefined();
      expect(confirmVersion.changes.status.old).toBe(HotelReservationStatus.CREATED);
      expect(confirmVersion.changes.status.new).toBe(HotelReservationStatus.CONFIRMED);
    });

    it('should have unique hashes for each version', () => {
      const { reservation } = engine.createReservation(defaultReservationParams);
      engine.confirmReservation({ reservationId: reservation!.id, actor: frontDesk });
      engine.checkIn({ reservationId: reservation!.id, actor: frontDesk });

      const versions = engine.getMetadataVersions(reservation!.id);
      const hashes = versions.map(v => v.currentHash);
      const uniqueHashes = new Set(hashes);
      expect(uniqueHashes.size).toBe(hashes.length);
    });
  });

  // ==========================================================================
  // TC-13: RBAC
  // ==========================================================================
  describe('TC-13: RBAC', () => {
    it('should allow front desk to check in and check out', () => {
      const { reservation } = engine.createReservation(defaultReservationParams);
      engine.confirmReservation({ reservationId: reservation!.id, actor: frontDesk });

      const checkInResult = engine.checkIn({ reservationId: reservation!.id, actor: frontDesk });
      expect(checkInResult.success).toBe(true);

      const checkOutResult = engine.checkOut({ reservationId: reservation!.id, actor: frontDesk });
      expect(checkOutResult.success).toBe(true);
    });

    it('should block guest from check-out (not authorized)', () => {
      const { reservation } = engine.createReservation(defaultReservationParams);
      engine.confirmReservation({ reservationId: reservation!.id, actor: frontDesk });
      engine.checkIn({ reservationId: reservation!.id, actor: frontDesk });

      expect(() => {
        engine.checkOut({ reservationId: reservation!.id, actor: guest });
      }).toThrow('PERMISSION_DENIED');
    });

    it('should block auditor from check-in', () => {
      const { reservation } = engine.createReservation(defaultReservationParams);
      engine.confirmReservation({ reservationId: reservation!.id, actor: frontDesk });

      expect(() => {
        engine.checkIn({ reservationId: reservation!.id, actor: auditor });
      }).toThrow('PERMISSION_DENIED');
    });

    it('should block concierge from creating reservations', () => {
      expect(() => {
        engine.confirmReservation({
          reservationId: 'non-existent',
          actor: concierge,
        });
      }).toThrow('PERMISSION_DENIED');
    });

    it('should allow hotel admin to freeze', () => {
      const { reservation } = engine.createReservation(defaultReservationParams);

      const result = engine.freezeReservation({
        reservationId: reservation!.id,
        actor: hotelAdmin,
        reason: 'Admin freeze',
      });
      expect(result.success).toBe(true);
    });

    it('should block guest from freezing', () => {
      const { reservation } = engine.createReservation(defaultReservationParams);

      expect(() => {
        engine.freezeReservation({
          reservationId: reservation!.id,
          actor: guest,
          reason: 'Guest freeze attempt',
        });
      }).toThrow('PERMISSION_DENIED');
    });
  });

  // ==========================================================================
  // TC-14: Event tracking
  // ==========================================================================
  describe('TC-14: Event tracking', () => {
    it('should emit events for each state change', () => {
      const { reservation } = engine.createReservation(defaultReservationParams);
      engine.confirmReservation({ reservationId: reservation!.id, actor: frontDesk });
      engine.checkIn({ reservationId: reservation!.id, actor: frontDesk });
      engine.checkOut({ reservationId: reservation!.id, actor: frontDesk });

      const events = engine.getReservationEvents(reservation!.id);

      const eventTypes = events.map(e => e.type);
      expect(eventTypes).toContain(HotelEventType.RESERVATION_CREATED);
      expect(eventTypes).toContain(HotelEventType.RESERVATION_CONFIRMED);
      expect(eventTypes).toContain(HotelEventType.CHECK_IN_COMPLETED);
      expect(eventTypes).toContain(HotelEventType.CHECK_OUT_COMPLETED);
    });

    it('should isolate events per reservation', () => {
      const res1 = engine.createReservation(defaultReservationParams).reservation!;
      const res2 = engine.createReservation({
        ...defaultReservationParams,
        confirmationNumber: 'HLT-789',
        guestName: 'Jane Doe',
      }).reservation!;

      engine.confirmReservation({ reservationId: res1.id, actor: frontDesk });

      const events1 = engine.getReservationEvents(res1.id);
      const events2 = engine.getReservationEvents(res2.id);

      // res1 has CREATED + CONFIRMED events, res2 has only CREATED
      expect(events1.length).toBe(2);
      expect(events2.length).toBe(1);
    });

    it('should include event data', () => {
      const { reservation } = engine.createReservation(defaultReservationParams);

      const events = engine.getReservationEvents(reservation!.id);
      const createEvent = events.find(e => e.type === HotelEventType.RESERVATION_CREATED);

      expect(createEvent).toBeDefined();
      expect(createEvent!.data.guestName).toBe('John Doe');
      expect(createEvent!.data.hotelCode).toBe(HOTEL_CODE);
      expect(createEvent!.confirmationNumber).toBe('HLT-123456');
    });
  });

  // ==========================================================================
  // TC-15: No-show handling
  // ==========================================================================
  describe('TC-15: No-show handling', () => {
    it('should mark no-show for confirmed reservation', () => {
      const { reservation } = engine.createReservation(defaultReservationParams);
      engine.confirmReservation({ reservationId: reservation!.id, actor: frontDesk });

      const result = engine.markNoShow({
        reservationId: reservation!.id,
        actor: frontDesk,
      });

      expect(result.success).toBe(true);
      const metadata = result.reservation!.metadata as unknown as HotelReservationMetadata;
      expect(metadata.status).toBe(HotelReservationStatus.NO_SHOW);
    });

    it('should reject no-show for non-CONFIRMED reservation', () => {
      const { reservation } = engine.createReservation(defaultReservationParams);

      const result = engine.markNoShow({
        reservationId: reservation!.id,
        actor: frontDesk,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Must be CONFIRMED');
    });

    it('should emit NO_SHOW_RECORDED event', () => {
      const { reservation } = engine.createReservation(defaultReservationParams);
      engine.confirmReservation({ reservationId: reservation!.id, actor: frontDesk });
      engine.markNoShow({ reservationId: reservation!.id, actor: frontDesk });

      const events = engine.getReservationEvents(reservation!.id);
      const noShowEvent = events.find(e => e.type === HotelEventType.NO_SHOW_RECORDED);
      expect(noShowEvent).toBeDefined();
    });
  });

  // ==========================================================================
  // TC-16: Bulk operations
  // ==========================================================================
  describe('TC-16: Bulk operations', () => {
    it('should create 50 reservations with unique IDs', () => {
      const ids = new Set<string>();

      for (let i = 0; i < 50; i++) {
        const result = engine.createReservation({
          ...defaultReservationParams,
          confirmationNumber: `HLT-BULK-${i}`,
          guestName: `Guest ${i}`,
        });

        expect(result.success).toBe(true);
        expect(result.reservation).toBeDefined();
        ids.add(result.reservation!.id);
      }

      // All 50 IDs should be unique
      expect(ids.size).toBe(50);
    });

    it('should handle concurrent-like operations on different reservations', () => {
      const reservations: string[] = [];

      // Create and confirm 10 reservations
      for (let i = 0; i < 10; i++) {
        const result = engine.createReservation({
          ...defaultReservationParams,
          confirmationNumber: `HLT-CONC-${i}`,
          guestName: `Guest ${i}`,
        });
        reservations.push(result.reservation!.id);
        engine.confirmReservation({ reservationId: result.reservation!.id, actor: frontDesk });
      }

      // Check in all of them
      for (const id of reservations) {
        const result = engine.checkIn({ reservationId: id, actor: frontDesk });
        expect(result.success).toBe(true);
      }

      // Check out all of them
      for (const id of reservations) {
        const result = engine.checkOut({ reservationId: id, actor: frontDesk });
        expect(result.success).toBe(true);
      }

      // Verify all are checked out
      for (const id of reservations) {
        const res = engine.getReservation(id);
        const metadata = res!.metadata as unknown as HotelReservationMetadata;
        expect(metadata.status).toBe(HotelReservationStatus.CHECKED_OUT);
      }
    });
  });
});
