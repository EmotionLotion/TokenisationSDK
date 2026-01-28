/**
 * Car Rental Engine Tests
 *
 * Production-readiness test cases covering:
 * - TC-1: Create rental
 * - TC-2: Confirm rental
 * - TC-3: Pick up
 * - TC-4: Return vehicle
 * - TC-5: Inspect vehicle
 * - TC-6: Transfer before pickup
 * - TC-7: Transfer after pickup
 * - TC-8: Cancellation
 * - TC-9: Modify rental
 * - TC-10: Extend rental
 * - TC-11: Freeze/unfreeze
 * - TC-12: Double pickup prevention
 * - TC-13: Metadata versioning
 * - TC-14: RBAC
 * - TC-15: Event tracking
 * - TC-16: No-show + Bulk
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  CarRentalEngine,
  VehicleCategory,
  CarRentalStatus,
  DepositStatus,
  RentalRole,
  CarRentalEventType,
  type ActorContext,
  type CarRentalMetadata,
} from '../../src/packs/CarRental.js';

describe('CarRentalEngine', () => {
  let engine: CarRentalEngine;
  const COMPANY_CODE = 'HERTZ-LAX';

  // Test actors
  const rentalAdmin: ActorContext = {
    actorId: 'rental-admin-1',
    role: RentalRole.RENTAL_ADMIN,
    rentalCompanyCode: COMPANY_CODE,
  };

  const rentalAgent: ActorContext = {
    actorId: 'agent-1',
    role: RentalRole.RENTAL_AGENT,
    rentalCompanyCode: COMPANY_CODE,
  };

  const driver: ActorContext = {
    actorId: 'John Doe',
    role: RentalRole.DRIVER,
    driverId: 'John Doe',
  };

  const auditor: ActorContext = {
    actorId: 'auditor-1',
    role: RentalRole.AUDITOR,
  };

  const platformAdmin: ActorContext = {
    actorId: 'platform-admin-1',
    role: RentalRole.PLATFORM_ADMIN,
  };

  const pickupDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const returnDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();

  const defaultRentalParams = {
    rentalCompanyCode: COMPANY_CODE,
    confirmationNumber: 'HTZ-123456',
    driverName: 'John Doe',
    driverLicense: {
      number: 'DL-12345',
      state: 'CA',
      country: 'US',
      expiryDate: '2028-01-01',
      class: 'C',
    },
    vehicleInfo: {
      vin: '1HGBH41JXMN109186',
      make: 'Toyota',
      model: 'Camry',
      year: 2024,
      licensePlate: 'ABC-1234',
      color: 'Silver',
      category: VehicleCategory.SEDAN,
    },
    rentalPeriod: {
      pickupDate,
      returnDate,
      pickupLocation: 'LAX Airport',
      returnLocation: 'LAX Airport',
    },
    pricing: {
      perDay: '75.00',
      total: '225.00',
      taxes: '30.00',
      currency: 'USD',
      deposit: '500.00',
      insuranceFee: '25.00',
      mileageAllowance: 150,
      overageFeePerMile: '0.35',
    },
    insurancePolicy: {
      provider: 'SafeDrive Insurance',
      policyNumber: 'INS-789',
      coverageType: 'FULL',
      verified: true,
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
    engine = new CarRentalEngine();
    engine.registerRentalCompany(COMPANY_CODE);
  });

  // ==========================================================================
  // TC-1: Create rental
  // ==========================================================================
  describe('TC-1: Create rental', () => {
    it('should create rental with correct metadata', () => {
      const result = engine.createRental(defaultRentalParams);

      expect(result.success).toBe(true);
      expect(result.rental).toBeDefined();
      expect(result.rental!.id).toBeDefined();

      const metadata = result.rental!.metadata as unknown as CarRentalMetadata;
      expect(metadata.confirmationNumber).toBe('HTZ-123456');
      expect(metadata.driverName).toBe('John Doe');
      expect(metadata.rentalCompanyCode).toBe(COMPANY_CODE);
      expect(metadata.vehicleInfo.category).toBe(VehicleCategory.SEDAN);
      expect(metadata.status).toBe(CarRentalStatus.CREATED);
      expect(metadata.deposit.status).toBe(DepositStatus.HELD);
    });

    it('should reject rental from unauthorized company', () => {
      const result = engine.createRental({
        ...defaultRentalParams,
        rentalCompanyCode: 'UNKNOWN-COMPANY',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Rental company not authorized');
    });

    it('should create initial metadata version on creation', () => {
      const result = engine.createRental(defaultRentalParams);
      expect(result.success).toBe(true);

      const versions = engine.getMetadataVersions(result.rental!.id);
      expect(versions.length).toBe(1);
      expect(versions[0].version).toBe(0);
      expect(versions[0].changeReason).toBe('Initial creation');
    });

    it('should calculate day count correctly', () => {
      const result = engine.createRental(defaultRentalParams);
      const metadata = result.rental!.metadata as unknown as CarRentalMetadata;
      expect(metadata.dayCount).toBe(3);
    });
  });

  // ==========================================================================
  // TC-2: Confirm rental
  // ==========================================================================
  describe('TC-2: Confirm rental', () => {
    it('should transition CREATED -> CONFIRMED', () => {
      const { rental } = engine.createRental(defaultRentalParams);

      const result = engine.confirmRental({
        rentalId: rental!.id,
        actor: rentalAgent,
      });

      expect(result.success).toBe(true);
      const metadata = result.rental!.metadata as unknown as CarRentalMetadata;
      expect(metadata.status).toBe(CarRentalStatus.CONFIRMED);
    });

    it('should be idempotent (double confirm returns success)', () => {
      const { rental } = engine.createRental(defaultRentalParams);

      const result1 = engine.confirmRental({ rentalId: rental!.id, actor: rentalAgent });
      expect(result1.success).toBe(true);

      const result2 = engine.confirmRental({ rentalId: rental!.id, actor: rentalAgent });
      expect(result2.success).toBe(true);
    });

    it('should reject confirm from invalid state', async () => {
      const { rental } = engine.createRental(defaultRentalParams);
      engine.confirmRental({ rentalId: rental!.id, actor: rentalAgent });
      await engine.pickUp({ rentalId: rental!.id, actor: rentalAgent });

      const result = engine.confirmRental({ rentalId: rental!.id, actor: rentalAgent });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot confirm from status');
    });
  });

  // ==========================================================================
  // TC-3: Pick up
  // ==========================================================================
  describe('TC-3: Pick up', () => {
    it('should transition CONFIRMED -> PICKED_UP with mileage and fuel', async () => {
      const { rental } = engine.createRental(defaultRentalParams);
      engine.confirmRental({ rentalId: rental!.id, actor: rentalAgent });

      const result = await engine.pickUp({
        rentalId: rental!.id,
        actor: rentalAgent,
        mileageStart: 15000,
        fuelLevel: 100,
      });

      expect(result.success).toBe(true);
      const metadata = result.rental!.metadata as unknown as CarRentalMetadata;
      expect(metadata.status).toBe(CarRentalStatus.PICKED_UP);
      expect(metadata.vehicleCondition.pickupMileage).toBe(15000);
      expect(metadata.vehicleCondition.pickupFuelLevel).toBe(100);
    });

    it('should be idempotent (returns alreadyPickedUp)', async () => {
      const { rental } = engine.createRental(defaultRentalParams);
      engine.confirmRental({ rentalId: rental!.id, actor: rentalAgent });

      const result1 = await engine.pickUp({ rentalId: rental!.id, actor: rentalAgent });
      expect(result1.success).toBe(true);
      expect(result1.alreadyPickedUp).toBeFalsy();

      const result2 = await engine.pickUp({ rentalId: rental!.id, actor: rentalAgent });
      expect(result2.success).toBe(true);
      expect(result2.alreadyPickedUp).toBe(true);
    });

    it('should reject pickup from CREATED status', async () => {
      const { rental } = engine.createRental(defaultRentalParams);

      const result = await engine.pickUp({ rentalId: rental!.id, actor: rentalAgent });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot pick up from status');
    });

    it('should block pickup when rental is frozen', async () => {
      const { rental } = engine.createRental(defaultRentalParams);
      engine.confirmRental({ rentalId: rental!.id, actor: rentalAgent });
      engine.freezeRental({
        rentalId: rental!.id,
        actor: rentalAdmin,
        reason: 'Payment dispute',
      });

      const result = await engine.pickUp({ rentalId: rental!.id, actor: rentalAgent });
      expect(result.success).toBe(false);
      expect(result.error).toContain('frozen');
    });

    it('should block pickup when insurance is not verified', async () => {
      const { rental } = engine.createRental({
        ...defaultRentalParams,
        insurancePolicy: {
          provider: '',
          policyNumber: '',
          coverageType: 'NONE',
          verified: false,
        },
      });
      engine.confirmRental({ rentalId: rental!.id, actor: rentalAgent });

      const result = await engine.pickUp({ rentalId: rental!.id, actor: rentalAgent });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Insurance must be verified');
    });
  });

  // ==========================================================================
  // TC-4: Return vehicle
  // ==========================================================================
  describe('TC-4: Return vehicle', () => {
    it('should transition PICKED_UP -> RETURNED with mileage, fuel, and damage', async () => {
      const { rental } = engine.createRental(defaultRentalParams);
      engine.confirmRental({ rentalId: rental!.id, actor: rentalAgent });
      await engine.pickUp({ rentalId: rental!.id, actor: rentalAgent, mileageStart: 15000, fuelLevel: 100 });

      const result = engine.returnVehicle({
        rentalId: rental!.id,
        actor: rentalAgent,
        mileageEnd: 15350,
        fuelLevel: 75,
        damageNotes: 'Minor scratch on rear bumper',
      });

      expect(result.success).toBe(true);
      const metadata = result.rental!.metadata as unknown as CarRentalMetadata;
      expect(metadata.status).toBe(CarRentalStatus.RETURNED);
      expect(metadata.vehicleCondition.returnMileage).toBe(15350);
      expect(metadata.vehicleCondition.returnFuelLevel).toBe(75);
      expect(metadata.vehicleCondition.damageReport).toBe('Minor scratch on rear bumper');
    });

    it('should reject return if not picked up', () => {
      const { rental } = engine.createRental(defaultRentalParams);
      engine.confirmRental({ rentalId: rental!.id, actor: rentalAgent });

      const result = engine.returnVehicle({ rentalId: rental!.id, actor: rentalAgent });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Must be PICKED_UP');
    });

    it('should calculate mileage difference', async () => {
      const { rental } = engine.createRental(defaultRentalParams);
      engine.confirmRental({ rentalId: rental!.id, actor: rentalAgent });
      await engine.pickUp({ rentalId: rental!.id, actor: rentalAgent, mileageStart: 15000 });

      const result = engine.returnVehicle({
        rentalId: rental!.id,
        actor: rentalAgent,
        mileageEnd: 15500,
      });

      expect(result.success).toBe(true);
      expect(result.mileageDiff).toBe(500);
    });
  });

  // ==========================================================================
  // TC-5: Inspect vehicle
  // ==========================================================================
  describe('TC-5: Inspect vehicle', () => {
    it('should release deposit when inspection passed', async () => {
      const { rental } = engine.createRental(defaultRentalParams);
      engine.confirmRental({ rentalId: rental!.id, actor: rentalAgent });
      await engine.pickUp({ rentalId: rental!.id, actor: rentalAgent });
      engine.returnVehicle({ rentalId: rental!.id, actor: rentalAgent });

      const result = engine.inspectVehicle({
        rentalId: rental!.id,
        actor: rentalAgent,
        inspectionResult: { passed: true },
      });

      expect(result.success).toBe(true);
      const metadata = result.rental!.metadata as unknown as CarRentalMetadata;
      expect(metadata.status).toBe(CarRentalStatus.INSPECTED);
      expect(metadata.deposit.status).toBe(DepositStatus.RELEASED);
    });

    it('should partially charge deposit when damage found', async () => {
      const { rental } = engine.createRental(defaultRentalParams);
      engine.confirmRental({ rentalId: rental!.id, actor: rentalAgent });
      await engine.pickUp({ rentalId: rental!.id, actor: rentalAgent });
      engine.returnVehicle({ rentalId: rental!.id, actor: rentalAgent });

      const result = engine.inspectVehicle({
        rentalId: rental!.id,
        actor: rentalAgent,
        inspectionResult: {
          passed: false,
          damageFound: true,
          chargeAmount: '200.00',
          chargeReason: 'Bumper scratch repair',
        },
      });

      expect(result.success).toBe(true);
      const metadata = result.rental!.metadata as unknown as CarRentalMetadata;
      expect(metadata.deposit.status).toBe(DepositStatus.PARTIALLY_CHARGED);
      expect(metadata.deposit.chargeAmount).toBe('200.00');
      expect(metadata.deposit.chargeReason).toBe('Bumper scratch repair');
    });

    it('should reject inspection from non-RETURNED status', async () => {
      const { rental } = engine.createRental(defaultRentalParams);
      engine.confirmRental({ rentalId: rental!.id, actor: rentalAgent });
      await engine.pickUp({ rentalId: rental!.id, actor: rentalAgent });

      const result = engine.inspectVehicle({
        rentalId: rental!.id,
        actor: rentalAgent,
        inspectionResult: { passed: true },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Must be RETURNED');
    });
  });

  // ==========================================================================
  // TC-6: Transfer before pickup
  // ==========================================================================
  describe('TC-6: Transfer before pickup', () => {
    it('should allow transfer of confirmed rental', () => {
      const { rental } = engine.createRental(defaultRentalParams);
      engine.confirmRental({ rentalId: rental!.id, actor: rentalAgent });

      const result = engine.requestTransfer({
        rentalId: rental!.id,
        fromDriver: 'John Doe',
        toDriver: { name: 'Jane Doe' },
        reason: 'Schedule change',
      });

      expect(result.success).toBe(true);
      expect(result.request).toBeDefined();
    });

    it('should change driver name after approved transfer', () => {
      const { rental } = engine.createRental(defaultRentalParams);
      engine.confirmRental({ rentalId: rental!.id, actor: rentalAgent });

      const transferResult = engine.requestTransfer({
        rentalId: rental!.id,
        fromDriver: 'John Doe',
        toDriver: { name: 'Jane Doe' },
        reason: 'Schedule change',
      });

      engine.approveTransfer({
        requestId: transferResult.request!.id,
        approvedBy: 'agent-1',
      });

      const updated = engine.getRental(rental!.id);
      const metadata = updated!.metadata as unknown as CarRentalMetadata;
      expect(metadata.driverName).toBe('Jane Doe');
      expect(metadata.transferRules.transferCount).toBe(1);
    });

    it('should auto-approve with verified identity', () => {
      engine.verifyIdentity('PASSPORT:US:P123456');

      const { rental } = engine.createRental(defaultRentalParams);
      engine.confirmRental({ rentalId: rental!.id, actor: rentalAgent });

      const result = engine.requestTransfer({
        rentalId: rental!.id,
        fromDriver: 'John Doe',
        toDriver: {
          name: 'Jane Doe',
          identity: {
            type: 'PASSPORT',
            number: 'P123456',
            country: 'US',
            expiryDate: '2028-01-01',
          },
        },
        reason: 'Schedule change',
      });

      expect(result.success).toBe(true);
      expect(result.request!.status).toBe('AUTO_APPROVED');

      const updated = engine.getRental(rental!.id);
      const metadata = updated!.metadata as unknown as CarRentalMetadata;
      expect(metadata.driverName).toBe('Jane Doe');
    });
  });

  // ==========================================================================
  // TC-7: Transfer after pickup (blocked)
  // ==========================================================================
  describe('TC-7: Transfer after pickup', () => {
    it('should block transfer after pickup (RENTAL_LOCKED_AFTER_PICKUP)', async () => {
      const { rental } = engine.createRental(defaultRentalParams);
      engine.confirmRental({ rentalId: rental!.id, actor: rentalAgent });
      await engine.pickUp({ rentalId: rental!.id, actor: rentalAgent });

      const result = engine.requestTransfer({
        rentalId: rental!.id,
        fromDriver: 'John Doe',
        toDriver: { name: 'Jane Doe' },
        reason: 'Change of driver',
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('RENTAL_LOCKED_AFTER_PICKUP');
      expect(result.error).toContain('locked after pickup');
    });

    it('should block transfer of frozen rental', () => {
      const { rental } = engine.createRental(defaultRentalParams);
      engine.confirmRental({ rentalId: rental!.id, actor: rentalAgent });

      engine.freezeRental({
        rentalId: rental!.id,
        actor: rentalAdmin,
        reason: 'Fraud investigation',
      });

      const result = engine.requestTransfer({
        rentalId: rental!.id,
        fromDriver: 'John Doe',
        toDriver: { name: 'Jane Doe' },
        reason: 'Change of driver',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('frozen');
    });
  });

  // ==========================================================================
  // TC-8: Cancellation
  // ==========================================================================
  describe('TC-8: Cancellation', () => {
    it('should allow free cancellation within window', () => {
      const { rental } = engine.createRental(defaultRentalParams);
      engine.confirmRental({ rentalId: rental!.id, actor: rentalAgent });

      const result = engine.cancelRental({
        rentalId: rental!.id,
        requestedBy: 'John Doe',
        reason: 'Change of plans',
      });

      expect(result.success).toBe(true);
      expect(parseFloat(result.refundAmount!)).toBe(225.00);
    });

    it('should reject cancellation after pickup', async () => {
      const { rental } = engine.createRental(defaultRentalParams);
      engine.confirmRental({ rentalId: rental!.id, actor: rentalAgent });
      await engine.pickUp({ rentalId: rental!.id, actor: rentalAgent });

      const result = engine.cancelRental({
        rentalId: rental!.id,
        requestedBy: 'John Doe',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot cancel');
    });

    it('should apply cancellation fee when configured', () => {
      const { rental } = engine.createRental({
        ...defaultRentalParams,
        cancellationPolicy: {
          refundable: true,
          cancellationFee: '50.00',
          freeCancellationDeadlineHours: 24,
          penaltyPercentage: 100,
        },
      });
      engine.confirmRental({ rentalId: rental!.id, actor: rentalAgent });

      const result = engine.cancelRental({
        rentalId: rental!.id,
        requestedBy: 'John Doe',
      });

      expect(result.success).toBe(true);
      expect(parseFloat(result.refundAmount!)).toBe(175.00); // 225 - 50
    });

    it('should allow cancellation of CREATED (unconfirmed) rental', () => {
      const { rental } = engine.createRental(defaultRentalParams);

      const result = engine.cancelRental({
        rentalId: rental!.id,
        requestedBy: 'John Doe',
      });

      expect(result.success).toBe(true);
    });
  });

  // ==========================================================================
  // TC-9: Modify rental
  // ==========================================================================
  describe('TC-9: Modify rental', () => {
    it('should modify dates of confirmed rental', () => {
      const { rental } = engine.createRental(defaultRentalParams);
      engine.confirmRental({ rentalId: rental!.id, actor: rentalAgent });

      const newReturnDate = new Date(Date.now() + 12 * 24 * 60 * 60 * 1000).toISOString();

      const result = engine.modifyRental({
        rentalId: rental!.id,
        changes: { returnDate: newReturnDate },
        actor: rentalAgent,
      });

      expect(result.success).toBe(true);
      const metadata = result.rental!.metadata as unknown as CarRentalMetadata;
      expect(metadata.rentalPeriod.returnDate).toBe(newReturnDate);
      expect(metadata.dayCount).toBe(5); // ~12 - 7 = 5 days
    });

    it('should modify vehicle category', () => {
      const { rental } = engine.createRental(defaultRentalParams);
      engine.confirmRental({ rentalId: rental!.id, actor: rentalAgent });

      const result = engine.modifyRental({
        rentalId: rental!.id,
        changes: { vehicleCategory: VehicleCategory.SUV },
        actor: rentalAgent,
      });

      expect(result.success).toBe(true);
      const metadata = result.rental!.metadata as unknown as CarRentalMetadata;
      expect(metadata.vehicleInfo.category).toBe(VehicleCategory.SUV);
    });

    it('should reject modification after pickup', async () => {
      const { rental } = engine.createRental(defaultRentalParams);
      engine.confirmRental({ rentalId: rental!.id, actor: rentalAgent });
      await engine.pickUp({ rentalId: rental!.id, actor: rentalAgent });

      const result = engine.modifyRental({
        rentalId: rental!.id,
        changes: { vehicleCategory: VehicleCategory.LUXURY },
        actor: rentalAgent,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Must be CONFIRMED');
    });

    it('should reject modification of frozen rental', () => {
      const { rental } = engine.createRental(defaultRentalParams);
      engine.confirmRental({ rentalId: rental!.id, actor: rentalAgent });

      engine.freezeRental({
        rentalId: rental!.id,
        actor: rentalAdmin,
        reason: 'Investigation',
      });

      const result = engine.modifyRental({
        rentalId: rental!.id,
        changes: { vehicleCategory: VehicleCategory.SUV },
        actor: rentalAgent,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('frozen');
    });
  });

  // ==========================================================================
  // TC-10: Extend rental
  // ==========================================================================
  describe('TC-10: Extend rental', () => {
    it('should extend return date and update dayCount and total', async () => {
      const { rental } = engine.createRental(defaultRentalParams);
      engine.confirmRental({ rentalId: rental!.id, actor: rentalAgent });
      await engine.pickUp({ rentalId: rental!.id, actor: rentalAgent });

      const newReturnDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

      const result = engine.extendRental({
        rentalId: rental!.id,
        newReturnDate,
        actor: rentalAgent,
      });

      expect(result.success).toBe(true);
      const metadata = result.rental!.metadata as unknown as CarRentalMetadata;
      expect(metadata.rentalPeriod.returnDate).toBe(newReturnDate);
      expect(metadata.dayCount).toBe(7); // ~14 - 7 = 7 days
      // Total should be recalculated: 75 * 7 + 30 = 555
      expect(metadata.pricing.total).toBe('555.00');
    });

    it('should reject extend from non-PICKED_UP status', () => {
      const { rental } = engine.createRental(defaultRentalParams);
      engine.confirmRental({ rentalId: rental!.id, actor: rentalAgent });

      const result = engine.extendRental({
        rentalId: rental!.id,
        newReturnDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        actor: rentalAgent,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Must be PICKED_UP');
    });

    it('should reject if new return date is before current return date', async () => {
      const { rental } = engine.createRental(defaultRentalParams);
      engine.confirmRental({ rentalId: rental!.id, actor: rentalAgent });
      await engine.pickUp({ rentalId: rental!.id, actor: rentalAgent });

      const result = engine.extendRental({
        rentalId: rental!.id,
        newReturnDate: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString(), // Before original return
        actor: rentalAgent,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('after current return date');
    });
  });

  // ==========================================================================
  // TC-11: Freeze/unfreeze
  // ==========================================================================
  describe('TC-11: Freeze/unfreeze', () => {
    it('should freeze a rental', () => {
      const { rental } = engine.createRental(defaultRentalParams);
      engine.confirmRental({ rentalId: rental!.id, actor: rentalAgent });

      const result = engine.freezeRental({
        rentalId: rental!.id,
        actor: rentalAdmin,
        reason: 'Payment dispute',
      });

      expect(result.success).toBe(true);
      expect(result.freeze).toBeDefined();

      const updated = engine.getRental(rental!.id);
      const metadata = updated!.metadata as unknown as CarRentalMetadata;
      expect(metadata.frozen).toBe(true);
    });

    it('should block operations on frozen rental', async () => {
      const { rental } = engine.createRental(defaultRentalParams);
      engine.confirmRental({ rentalId: rental!.id, actor: rentalAgent });

      engine.freezeRental({
        rentalId: rental!.id,
        actor: rentalAdmin,
        reason: 'Payment dispute',
      });

      const pickupResult = await engine.pickUp({ rentalId: rental!.id, actor: rentalAgent });
      expect(pickupResult.success).toBe(false);

      const transferResult = engine.requestTransfer({
        rentalId: rental!.id,
        fromDriver: 'John Doe',
        toDriver: { name: 'Jane Doe' },
        reason: 'Change',
      });
      expect(transferResult.success).toBe(false);
    });

    it('should unfreeze and re-enable operations', async () => {
      const { rental } = engine.createRental(defaultRentalParams);
      engine.confirmRental({ rentalId: rental!.id, actor: rentalAgent });

      engine.freezeRental({
        rentalId: rental!.id,
        actor: rentalAdmin,
        reason: 'Payment dispute',
      });

      const unfreezeResult = engine.unfreezeRental({
        rentalId: rental!.id,
        actor: rentalAdmin,
      });
      expect(unfreezeResult.success).toBe(true);

      const pickupResult = await engine.pickUp({ rentalId: rental!.id, actor: rentalAgent });
      expect(pickupResult.success).toBe(true);
    });

    it('should reject freeze on already frozen rental', () => {
      const { rental } = engine.createRental(defaultRentalParams);

      engine.freezeRental({
        rentalId: rental!.id,
        actor: rentalAdmin,
        reason: 'First freeze',
      });

      const result = engine.freezeRental({
        rentalId: rental!.id,
        actor: rentalAdmin,
        reason: 'Second freeze',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('already frozen');
    });
  });

  // ==========================================================================
  // TC-12: Double pickup prevention
  // ==========================================================================
  describe('TC-12: Double pickup prevention', () => {
    it('should return alreadyPickedUp on repeated pickup', async () => {
      const { rental } = engine.createRental(defaultRentalParams);
      engine.confirmRental({ rentalId: rental!.id, actor: rentalAgent });

      const result1 = await engine.pickUp({ rentalId: rental!.id, actor: rentalAgent });
      expect(result1.success).toBe(true);
      expect(result1.alreadyPickedUp).toBeFalsy();

      const result2 = await engine.pickUp({ rentalId: rental!.id, actor: rentalAgent });
      expect(result2.success).toBe(true);
      expect(result2.alreadyPickedUp).toBe(true);
    });
  });

  // ==========================================================================
  // TC-13: Metadata versioning
  // ==========================================================================
  describe('TC-13: Metadata versioning', () => {
    it('should build hash chain across create/confirm/pickup/return', async () => {
      const { rental } = engine.createRental(defaultRentalParams);
      engine.confirmRental({ rentalId: rental!.id, actor: rentalAgent });
      await engine.pickUp({ rentalId: rental!.id, actor: rentalAgent });
      engine.returnVehicle({ rentalId: rental!.id, actor: rentalAgent });

      const versions = engine.getMetadataVersions(rental!.id);

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
      const { rental } = engine.createRental(defaultRentalParams);
      engine.confirmRental({ rentalId: rental!.id, actor: rentalAgent });

      const versions = engine.getMetadataVersions(rental!.id);
      const confirmVersion = versions[1];

      expect(confirmVersion.changes.status).toBeDefined();
      expect(confirmVersion.changes.status.old).toBe(CarRentalStatus.CREATED);
      expect(confirmVersion.changes.status.new).toBe(CarRentalStatus.CONFIRMED);
    });

    it('should have unique hashes for each version', async () => {
      const { rental } = engine.createRental(defaultRentalParams);
      engine.confirmRental({ rentalId: rental!.id, actor: rentalAgent });
      await engine.pickUp({ rentalId: rental!.id, actor: rentalAgent });

      const versions = engine.getMetadataVersions(rental!.id);
      const hashes = versions.map(v => v.currentHash);
      const uniqueHashes = new Set(hashes);
      expect(uniqueHashes.size).toBe(hashes.length);
    });
  });

  // ==========================================================================
  // TC-14: RBAC
  // ==========================================================================
  describe('TC-14: RBAC', () => {
    it('should allow rental agent to pick up and return', async () => {
      const { rental } = engine.createRental(defaultRentalParams);
      engine.confirmRental({ rentalId: rental!.id, actor: rentalAgent });

      const pickupResult = await engine.pickUp({ rentalId: rental!.id, actor: rentalAgent });
      expect(pickupResult.success).toBe(true);

      const returnResult = engine.returnVehicle({ rentalId: rental!.id, actor: rentalAgent });
      expect(returnResult.success).toBe(true);
    });

    it('should block driver from pickup (not authorized)', async () => {
      const { rental } = engine.createRental(defaultRentalParams);
      engine.confirmRental({ rentalId: rental!.id, actor: rentalAgent });

      await expect(
        engine.pickUp({ rentalId: rental!.id, actor: driver })
      ).rejects.toThrow('PERMISSION_DENIED');
    });

    it('should block auditor from pickup', async () => {
      const { rental } = engine.createRental(defaultRentalParams);
      engine.confirmRental({ rentalId: rental!.id, actor: rentalAgent });

      await expect(
        engine.pickUp({ rentalId: rental!.id, actor: auditor })
      ).rejects.toThrow('PERMISSION_DENIED');
    });

    it('should allow rental admin to freeze', () => {
      const { rental } = engine.createRental(defaultRentalParams);

      const result = engine.freezeRental({
        rentalId: rental!.id,
        actor: rentalAdmin,
        reason: 'Admin freeze',
      });
      expect(result.success).toBe(true);
    });

    it('should block driver from freezing', () => {
      const { rental } = engine.createRental(defaultRentalParams);

      expect(() => {
        engine.freezeRental({
          rentalId: rental!.id,
          actor: driver,
          reason: 'Driver freeze attempt',
        });
      }).toThrow('PERMISSION_DENIED');
    });
  });

  // ==========================================================================
  // TC-15: Event tracking
  // ==========================================================================
  describe('TC-15: Event tracking', () => {
    it('should emit events for each state change', async () => {
      const { rental } = engine.createRental(defaultRentalParams);
      engine.confirmRental({ rentalId: rental!.id, actor: rentalAgent });
      await engine.pickUp({ rentalId: rental!.id, actor: rentalAgent });
      engine.returnVehicle({ rentalId: rental!.id, actor: rentalAgent });

      const events = engine.getRentalEvents(rental!.id);

      const eventTypes = events.map(e => e.type);
      expect(eventTypes).toContain(CarRentalEventType.RENTAL_CREATED);
      expect(eventTypes).toContain(CarRentalEventType.RENTAL_CONFIRMED);
      expect(eventTypes).toContain(CarRentalEventType.PICKUP_COMPLETED);
      expect(eventTypes).toContain(CarRentalEventType.RETURN_COMPLETED);
    });

    it('should isolate events per rental', () => {
      const res1 = engine.createRental(defaultRentalParams).rental!;
      const res2 = engine.createRental({
        ...defaultRentalParams,
        confirmationNumber: 'HTZ-789',
        driverName: 'Jane Doe',
      }).rental!;

      engine.confirmRental({ rentalId: res1.id, actor: rentalAgent });

      const events1 = engine.getRentalEvents(res1.id);
      const events2 = engine.getRentalEvents(res2.id);

      expect(events1.length).toBe(2);
      expect(events2.length).toBe(1);
    });

    it('should include event data', () => {
      const { rental } = engine.createRental(defaultRentalParams);

      const events = engine.getRentalEvents(rental!.id);
      const createEvent = events.find(e => e.type === CarRentalEventType.RENTAL_CREATED);

      expect(createEvent).toBeDefined();
      expect(createEvent!.data.driverName).toBe('John Doe');
      expect(createEvent!.data.rentalCompanyCode).toBe(COMPANY_CODE);
      expect(createEvent!.confirmationNumber).toBe('HTZ-123456');
    });
  });

  // ==========================================================================
  // TC-16: No-show + Bulk
  // ==========================================================================
  describe('TC-16: No-show + Bulk', () => {
    it('should mark no-show for confirmed rental', () => {
      const { rental } = engine.createRental(defaultRentalParams);
      engine.confirmRental({ rentalId: rental!.id, actor: rentalAgent });

      const result = engine.markNoShow({ rentalId: rental!.id, actor: rentalAgent });

      expect(result.success).toBe(true);
      const metadata = result.rental!.metadata as unknown as CarRentalMetadata;
      expect(metadata.status).toBe(CarRentalStatus.NO_SHOW);
    });

    it('should reject no-show for non-CONFIRMED rental', () => {
      const { rental } = engine.createRental(defaultRentalParams);

      const result = engine.markNoShow({ rentalId: rental!.id, actor: rentalAgent });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Must be CONFIRMED');
    });

    it('should create 50 rentals with unique IDs', () => {
      const ids = new Set<string>();

      for (let i = 0; i < 50; i++) {
        const result = engine.createRental({
          ...defaultRentalParams,
          confirmationNumber: `HTZ-BULK-${i}`,
          driverName: `Driver ${i}`,
        });

        expect(result.success).toBe(true);
        expect(result.rental).toBeDefined();
        ids.add(result.rental!.id);
      }

      expect(ids.size).toBe(50);
    });

    it('should handle concurrent-like operations on different rentals', async () => {
      const rentals: string[] = [];

      for (let i = 0; i < 10; i++) {
        const result = engine.createRental({
          ...defaultRentalParams,
          confirmationNumber: `HTZ-CONC-${i}`,
          driverName: `Driver ${i}`,
        });
        rentals.push(result.rental!.id);
        engine.confirmRental({ rentalId: result.rental!.id, actor: rentalAgent });
      }

      for (const id of rentals) {
        const result = await engine.pickUp({ rentalId: id, actor: rentalAgent });
        expect(result.success).toBe(true);
      }

      for (const id of rentals) {
        const result = engine.returnVehicle({ rentalId: id, actor: rentalAgent });
        expect(result.success).toBe(true);
      }

      for (const id of rentals) {
        const res = engine.getRental(id);
        const metadata = res!.metadata as unknown as CarRentalMetadata;
        expect(metadata.status).toBe(CarRentalStatus.RETURNED);
      }
    });
  });
});
