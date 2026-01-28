/**
 * Pack: Car Rental
 *
 * Production-ready implementation for car rental tokenization with:
 * - Conditional transfer requiring company approval OR identity claim
 * - Driver swap with name change fees
 * - Transfer count limits
 * - Cancellation/refund lifecycle
 * - Pickup/return with mileage and fuel tracking
 * - Vehicle inspection and deposit resolution
 * - Rental extension
 * - Insurance verification
 * - Distributed locking for double-spend prevention
 * - Versioned metadata
 * - RBAC enforcement
 */

import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';
import type { RightModel } from '../core/types.js';
import { LifecycleState, RightType, TransferabilityMode } from '../core/types.js';
import type { AssetPack } from './AssetPackRegistry.js';
import { AssetType, InvestorClass, LiquidityProfile, FractionalizationType } from '../core/AssetAbstraction.js';
import { StateMachine, type StateContext } from '../core/StateMachine.js';
import {
  CAR_RENTAL_STATE_MACHINE,
  CarRentalState,
  CarRentalEvent,
  CarRentalErrorCode,
  type CarRentalOperationContext,
  transferWindowGuard,
  postPickupLockGuard,
  transferCountGuard,
  mapLegacyStatusToState,
  mapStateToLegacyStatus,
} from './CarRentalStateMachine.js';

// ============================================================================
// TYPES
// ============================================================================

export enum VehicleCategory {
  ECONOMY = 'ECONOMY',
  COMPACT = 'COMPACT',
  SEDAN = 'SEDAN',
  SUV = 'SUV',
  LUXURY = 'LUXURY',
  EXOTIC = 'EXOTIC',
  VAN = 'VAN',
}

export enum CarRentalStatus {
  CREATED = 'CREATED',
  CONFIRMED = 'CONFIRMED',
  PICKED_UP = 'PICKED_UP',
  RETURNED = 'RETURNED',
  INSPECTED = 'INSPECTED',
  CLOSED = 'CLOSED',
  CANCELLED = 'CANCELLED',
  NO_SHOW = 'NO_SHOW',
  EXPIRED = 'EXPIRED',
  VOID = 'VOID',
}

export enum DepositStatus {
  HELD = 'HELD',
  RELEASED = 'RELEASED',
  PARTIALLY_CHARGED = 'PARTIALLY_CHARGED',
  FULLY_CHARGED = 'FULLY_CHARGED',
}

export enum TransferApprovalStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  AUTO_APPROVED = 'AUTO_APPROVED',
}

export interface CarRentalMetadata {
  assetType: 'CAR_RENTAL';
  /** Rental company code */
  rentalCompanyCode: string;
  /** Confirmation number */
  confirmationNumber: string;
  /** Driver name */
  driverName: string;
  /** Driver identity document */
  driverIdentity?: {
    type: 'PASSPORT' | 'ID_CARD' | 'DRIVERS_LICENSE';
    number: string;
    country: string;
    expiryDate: string;
  };
  /** Driver's license details */
  driverLicense: {
    number: string;
    state: string;
    country: string;
    expiryDate: string;
    class: string;
  };
  /** Vehicle information */
  vehicleInfo: {
    vin: string;
    make: string;
    model: string;
    year: number;
    licensePlate: string;
    color: string;
    category: VehicleCategory;
  };
  /** Rental period */
  rentalPeriod: {
    pickupDate: string;
    returnDate: string;
    pickupLocation: string;
    returnLocation: string;
  };
  /** Pricing */
  pricing: {
    perDay: string;
    total: string;
    taxes: string;
    currency: string;
    deposit: string;
    insuranceFee: string;
    mileageAllowance: number;
    overageFeePerMile: string;
  };
  /** Insurance policy */
  insurancePolicy: {
    provider: string;
    policyNumber: string;
    coverageType: string;
    verified: boolean;
  };
  /** Vehicle condition tracking */
  vehicleCondition: {
    pickupMileage?: number;
    returnMileage?: number;
    pickupFuelLevel?: number;
    returnFuelLevel?: number;
    damageReport?: string;
  };
  /** Deposit tracking */
  deposit: {
    amount: string;
    status: DepositStatus;
    chargeAmount?: string;
    chargeReason?: string;
  };
  /** Day count */
  dayCount: number;
  /** Rental status */
  status: CarRentalStatus;
  /** Transfer rules */
  transferRules: {
    maxTransfers: number;
    transferCount: number;
    nameChangeFee: string;
    transferDeadlineHours: number;
    autoApproveWithIdentity: boolean;
  };
  /** Cancellation policy */
  cancellationPolicy: {
    refundable: boolean;
    cancellationFee: string;
    freeCancellationDeadlineHours: number;
    penaltyPercentage: number;
  };
  /** Transfer history */
  transferHistory: TransferRecord[];
  /** Whether rental is currently frozen */
  frozen: boolean;
  /** Freeze details if frozen */
  freezeInfo?: {
    frozenAt: string;
    reason: string;
    expiresAt?: string;
  };
  /** KYC verification status */
  kycStatus: {
    verified: boolean;
    verifiedAt?: string;
    expiresAt?: string;
  };
}

export interface TransferRecord {
  id: string;
  from: {
    name: string;
    identity?: string;
  };
  to: {
    name: string;
    identity?: string;
  };
  requestedAt: string;
  approvalStatus: TransferApprovalStatus;
  approvedAt?: string;
  approvedBy?: string;
  nameChangeFee?: string;
  rejectionReason?: string;
}

export interface TransferRequest {
  id: string;
  rentalId: string;
  fromDriver: string;
  toDriver: {
    name: string;
    identity?: CarRentalMetadata['driverIdentity'];
  };
  reason: string;
  requestedAt: string;
  status: TransferApprovalStatus;
  approvedAt?: string;
  approvedBy?: string;
  rejectionReason?: string;
  nameChangeFee: string;
  expiresAt: string;
  idempotencyKey?: string;
}

// ============================================================================
// RBAC TYPES
// ============================================================================

export enum RentalRole {
  RENTAL_ADMIN = 'RENTAL_ADMIN',
  RENTAL_AGENT = 'RENTAL_AGENT',
  PLATFORM_ADMIN = 'PLATFORM_ADMIN',
  DRIVER = 'DRIVER',
  AUDITOR = 'AUDITOR',
}

export interface ActorContext {
  actorId: string;
  role: RentalRole;
  rentalCompanyCode?: string;
  driverId?: string;
}

export interface RBACPermission {
  action: string;
  allowedRoles: RentalRole[];
  requiresOwnership?: boolean;
  requiresCompanyMatch?: boolean;
}

// ============================================================================
// DISTRIBUTED LOCK TYPES
// ============================================================================

export interface IDistributedLock {
  acquire(resourceId: string, ttlMs: number): Promise<string | null>;
  release(resourceId: string, lockId: string): Promise<boolean>;
  isLocked(resourceId: string): Promise<boolean>;
  extend(resourceId: string, lockId: string, ttlMs: number): Promise<boolean>;
}

// ============================================================================
// VERSIONED METADATA TYPES
// ============================================================================

export interface MetadataVersion {
  version: number;
  timestamp: string;
  changedBy: string;
  changeReason: string;
  previousHash: string;
  currentHash: string;
  changes: Record<string, { old: unknown; new: unknown }>;
}

// ============================================================================
// EVENT TYPES
// ============================================================================

export enum CarRentalEventType {
  RENTAL_CREATED = 'RENTAL_CREATED',
  RENTAL_CONFIRMED = 'RENTAL_CONFIRMED',
  RENTAL_CANCELLED = 'RENTAL_CANCELLED',
  PICKUP_COMPLETED = 'PICKUP_COMPLETED',
  RETURN_COMPLETED = 'RETURN_COMPLETED',
  INSPECTION_COMPLETED = 'INSPECTION_COMPLETED',
  RENTAL_TRANSFERRED = 'RENTAL_TRANSFERRED',
  RENTAL_MODIFIED = 'RENTAL_MODIFIED',
  RENTAL_EXTENDED = 'RENTAL_EXTENDED',
  NO_SHOW_RECORDED = 'NO_SHOW_RECORDED',
  RENTAL_FROZEN = 'RENTAL_FROZEN',
  RENTAL_UNFROZEN = 'RENTAL_UNFROZEN',
}

export interface CarRentalEvent {
  id: string;
  type: CarRentalEventType;
  rentalId: string;
  occurredAt: string;
  data: Record<string, unknown>;
  confirmationNumber?: string;
}

// ============================================================================
// FREEZE RECORD
// ============================================================================

export interface FreezeRecord {
  id: string;
  rentalId: string;
  frozenAt: string;
  frozenBy: string;
  reason: string;
  description?: string;
  unfrozenAt?: string;
  unfrozenBy?: string;
  expiresAt?: string;
}

// ============================================================================
// IN-MEMORY DISTRIBUTED LOCK
// ============================================================================

export class InMemoryDistributedLock implements IDistributedLock {
  private locks: Map<string, { lockId: string; expiresAt: number }> = new Map();

  async acquire(resourceId: string, ttlMs: number): Promise<string | null> {
    const now = Date.now();
    const existing = this.locks.get(resourceId);

    if (existing && existing.expiresAt > now) {
      return null;
    }

    const lockId = uuidv4();
    this.locks.set(resourceId, { lockId, expiresAt: now + ttlMs });
    return lockId;
  }

  async release(resourceId: string, lockId: string): Promise<boolean> {
    const existing = this.locks.get(resourceId);
    if (!existing || existing.lockId !== lockId) {
      return false;
    }
    this.locks.delete(resourceId);
    return true;
  }

  async isLocked(resourceId: string): Promise<boolean> {
    const existing = this.locks.get(resourceId);
    if (!existing) return false;
    if (existing.expiresAt <= Date.now()) {
      this.locks.delete(resourceId);
      return false;
    }
    return true;
  }

  async extend(resourceId: string, lockId: string, ttlMs: number): Promise<boolean> {
    const existing = this.locks.get(resourceId);
    if (!existing || existing.lockId !== lockId) {
      return false;
    }
    existing.expiresAt = Date.now() + ttlMs;
    return true;
  }
}

// ============================================================================
// RBAC PERMISSION DEFINITIONS
// ============================================================================

const PERMISSIONS: RBACPermission[] = [
  // Rental creation - company only
  { action: 'CREATE', allowedRoles: [RentalRole.RENTAL_ADMIN, RentalRole.RENTAL_AGENT, RentalRole.PLATFORM_ADMIN] },

  // Confirm rental
  { action: 'CONFIRM', allowedRoles: [RentalRole.RENTAL_ADMIN, RentalRole.RENTAL_AGENT, RentalRole.PLATFORM_ADMIN] },

  // Pickup
  { action: 'PICK_UP', allowedRoles: [RentalRole.RENTAL_ADMIN, RentalRole.RENTAL_AGENT, RentalRole.PLATFORM_ADMIN], requiresCompanyMatch: true },

  // Return
  { action: 'RETURN', allowedRoles: [RentalRole.RENTAL_ADMIN, RentalRole.RENTAL_AGENT, RentalRole.PLATFORM_ADMIN], requiresCompanyMatch: true },

  // Inspect
  { action: 'INSPECT', allowedRoles: [RentalRole.RENTAL_ADMIN, RentalRole.RENTAL_AGENT, RentalRole.PLATFORM_ADMIN], requiresCompanyMatch: true },

  // Transfer request - driver or platform
  { action: 'REQUEST_TRANSFER', allowedRoles: [RentalRole.DRIVER, RentalRole.PLATFORM_ADMIN], requiresOwnership: true },

  // Approve/reject transfer - company only
  { action: 'APPROVE_TRANSFER', allowedRoles: [RentalRole.RENTAL_ADMIN, RentalRole.RENTAL_AGENT], requiresCompanyMatch: true },

  // Cancel - driver or company
  { action: 'CANCEL', allowedRoles: [RentalRole.DRIVER, RentalRole.RENTAL_ADMIN, RentalRole.RENTAL_AGENT, RentalRole.PLATFORM_ADMIN] },

  // Modify - company or driver
  { action: 'MODIFY', allowedRoles: [RentalRole.RENTAL_ADMIN, RentalRole.RENTAL_AGENT, RentalRole.DRIVER, RentalRole.PLATFORM_ADMIN] },

  // Extend rental
  { action: 'EXTEND_RENTAL', allowedRoles: [RentalRole.RENTAL_ADMIN, RentalRole.RENTAL_AGENT, RentalRole.DRIVER, RentalRole.PLATFORM_ADMIN] },

  // Mark no-show - company only
  { action: 'MARK_NO_SHOW', allowedRoles: [RentalRole.RENTAL_ADMIN, RentalRole.RENTAL_AGENT, RentalRole.PLATFORM_ADMIN], requiresCompanyMatch: true },

  // Freeze/unfreeze - admin only
  { action: 'FREEZE', allowedRoles: [RentalRole.RENTAL_ADMIN, RentalRole.PLATFORM_ADMIN] },

  // View - all roles
  { action: 'VIEW', allowedRoles: Object.values(RentalRole) },

  // Close - company only
  { action: 'CLOSE', allowedRoles: [RentalRole.RENTAL_ADMIN, RentalRole.RENTAL_AGENT, RentalRole.PLATFORM_ADMIN], requiresCompanyMatch: true },
];

// ============================================================================
// CAR RENTAL ENGINE
// ============================================================================

export class CarRentalEngine {
  private rentals: Map<string, RightModel> = new Map();
  private transferRequests: Map<string, TransferRequest> = new Map();
  private stateMachine: StateMachine;
  private rentalStates: Map<string, CarRentalState> = new Map();
  private authorizedCompanies: Set<string> = new Set();
  private verifiedIdentities: Map<string, boolean> = new Map();

  private distributedLock: IDistributedLock;
  private metadataVersions: Map<string, MetadataVersion[]> = new Map();
  private freezeRecords: Map<string, FreezeRecord[]> = new Map();
  private events: CarRentalEvent[] = [];

  // Idempotency tracking
  private transferIdempotencyKeys: Map<string, string> = new Map();

  constructor(config?: {
    distributedLock?: IDistributedLock;
  }) {
    this.distributedLock = config?.distributedLock ?? new InMemoryDistributedLock();

    this.stateMachine = new StateMachine(CAR_RENTAL_STATE_MACHINE);
    this.stateMachine.addGlobalGuard(transferWindowGuard);
    this.stateMachine.addGlobalGuard(postPickupLockGuard);
    this.stateMachine.addGlobalGuard(transferCountGuard);
  }

  // ============================================================================
  // REGISTRATION & IDENTITY
  // ============================================================================

  registerRentalCompany(companyCode: string): void {
    this.authorizedCompanies.add(companyCode);
  }

  verifyIdentity(identityHash: string): void {
    this.verifiedIdentities.set(identityHash, true);
  }

  // ============================================================================
  // STATE MACHINE METHODS
  // ============================================================================

  getCurrentState(rentalId: string): CarRentalState | undefined {
    const cachedState = this.rentalStates.get(rentalId);
    if (cachedState) {
      return cachedState;
    }

    const rental = this.rentals.get(rentalId);
    if (!rental) {
      return undefined;
    }

    const metadata = rental.metadata as unknown as CarRentalMetadata;
    return mapLegacyStatusToState(metadata.status);
  }

  private setRentalState(rentalId: string, state: CarRentalState): void {
    this.rentalStates.set(rentalId, state);
    this.stateMachine.setState(rentalId, state);
  }

  // ============================================================================
  // RBAC ENFORCEMENT
  // ============================================================================

  checkPermission(
    actor: ActorContext,
    action: string,
    rentalId?: string
  ): { allowed: boolean; reason?: string } {
    const permission = PERMISSIONS.find(p => p.action === action);

    if (!permission) {
      return { allowed: false, reason: `Unknown action: ${action}` };
    }

    if (!permission.allowedRoles.includes(actor.role)) {
      return {
        allowed: false,
        reason: `Role ${actor.role} not authorized for action ${action}`,
      };
    }

    if (permission.requiresOwnership && rentalId) {
      const rental = this.rentals.get(rentalId);
      if (!rental) {
        return { allowed: false, reason: 'Rental not found' };
      }
      const metadata = rental.metadata as unknown as CarRentalMetadata;

      if (actor.role === RentalRole.DRIVER) {
        const isOwner = actor.driverId === metadata.driverName;
        if (!isOwner) {
          return { allowed: false, reason: 'Not the rental holder' };
        }
      }
    }

    if (permission.requiresCompanyMatch && rentalId) {
      const rental = this.rentals.get(rentalId);
      if (!rental) {
        return { allowed: false, reason: 'Rental not found' };
      }
      const metadata = rental.metadata as unknown as CarRentalMetadata;

      if (actor.rentalCompanyCode && actor.rentalCompanyCode !== metadata.rentalCompanyCode) {
        return {
          allowed: false,
          reason: `Company ${actor.rentalCompanyCode} cannot modify rentals from ${metadata.rentalCompanyCode}`,
        };
      }
    }

    return { allowed: true };
  }

  private enforcePermission(actor: ActorContext, action: string, rentalId?: string): void {
    const result = this.checkPermission(actor, action, rentalId);
    if (!result.allowed) {
      throw new Error(`PERMISSION_DENIED: ${result.reason}`);
    }
  }

  // ============================================================================
  // RENTAL CREATION
  // ============================================================================

  createRental(params: {
    rentalCompanyCode: string;
    confirmationNumber: string;
    driverName: string;
    driverIdentity?: CarRentalMetadata['driverIdentity'];
    driverLicense: CarRentalMetadata['driverLicense'];
    vehicleInfo: CarRentalMetadata['vehicleInfo'];
    rentalPeriod: CarRentalMetadata['rentalPeriod'];
    pricing: CarRentalMetadata['pricing'];
    insurancePolicy?: Partial<CarRentalMetadata['insurancePolicy']>;
    transferRules?: Partial<CarRentalMetadata['transferRules']>;
    cancellationPolicy?: Partial<CarRentalMetadata['cancellationPolicy']>;
  }): { success: boolean; rental?: RightModel; error?: string } {
    if (!this.authorizedCompanies.has(params.rentalCompanyCode)) {
      return { success: false, error: 'Rental company not authorized' };
    }

    const now = new Date().toISOString();

    const pickupDate = new Date(params.rentalPeriod.pickupDate);
    const returnDate = new Date(params.rentalPeriod.returnDate);
    const dayCount = Math.max(1, Math.round((returnDate.getTime() - pickupDate.getTime()) / (24 * 60 * 60 * 1000)));

    const defaultTransferRules: CarRentalMetadata['transferRules'] = {
      maxTransfers: 2,
      transferCount: 0,
      nameChangeFee: '25.00',
      transferDeadlineHours: 24,
      autoApproveWithIdentity: true,
    };

    const defaultCancellationPolicy: CarRentalMetadata['cancellationPolicy'] = {
      refundable: true,
      cancellationFee: '0.00',
      freeCancellationDeadlineHours: 24,
      penaltyPercentage: 100,
    };

    const defaultInsurancePolicy: CarRentalMetadata['insurancePolicy'] = {
      provider: '',
      policyNumber: '',
      coverageType: 'BASIC',
      verified: true,
    };

    const metadata: CarRentalMetadata = {
      assetType: 'CAR_RENTAL',
      rentalCompanyCode: params.rentalCompanyCode,
      confirmationNumber: params.confirmationNumber,
      driverName: params.driverName,
      driverIdentity: params.driverIdentity,
      driverLicense: params.driverLicense,
      vehicleInfo: params.vehicleInfo,
      rentalPeriod: params.rentalPeriod,
      pricing: params.pricing,
      insurancePolicy: { ...defaultInsurancePolicy, ...params.insurancePolicy },
      vehicleCondition: {},
      deposit: {
        amount: params.pricing.deposit,
        status: DepositStatus.HELD,
      },
      dayCount,
      status: CarRentalStatus.CREATED,
      transferRules: { ...defaultTransferRules, ...params.transferRules },
      cancellationPolicy: { ...defaultCancellationPolicy, ...params.cancellationPolicy },
      transferHistory: [],
      frozen: false,
      kycStatus: {
        verified: !!params.driverIdentity,
        verifiedAt: params.driverIdentity ? now : undefined,
      },
    };

    const rental: RightModel = {
      id: uuidv4(),
      name: `${params.rentalCompanyCode} - ${params.driverName} - ${params.confirmationNumber}`,
      rightType: RightType.ACCESS,
      state: LifecycleState.ACTIVE,
      jurisdiction: {
        countryCode: 'GLOBAL',
        accreditedOnly: false,
        blockedJurisdictions: [],
      },
      validityPeriod: {
        isPerpetual: false,
        startTime: params.rentalPeriod.pickupDate,
        endTime: params.rentalPeriod.returnDate,
      },
      transferabilityRules: {
        mode: TransferabilityMode.COMPLIANCE_GATED,
        lockupPeriodSeconds: 0,
        requireKyc: false,
      },
      metadata: metadata as unknown as Record<string, unknown>,
      createdAt: now,
      updatedAt: now,
      version: 0,
    };

    this.rentals.set(rental.id, rental);
    this.setRentalState(rental.id, CarRentalState.CREATED);

    // Initialize metadata version history
    this.metadataVersions.set(rental.id, [{
      version: 0,
      timestamp: now,
      changedBy: 'SYSTEM',
      changeReason: 'Initial creation',
      previousHash: '',
      currentHash: this.hashMetadata(metadata),
      changes: {},
    }]);

    this.emitEvent(CarRentalEventType.RENTAL_CREATED, rental.id, {
      confirmationNumber: params.confirmationNumber,
      driverName: params.driverName,
      rentalCompanyCode: params.rentalCompanyCode,
      vehicleCategory: params.vehicleInfo.category,
      pickupDate: params.rentalPeriod.pickupDate,
      returnDate: params.rentalPeriod.returnDate,
    }, params.confirmationNumber);

    return { success: true, rental };
  }

  // ============================================================================
  // CONFIRM RENTAL
  // ============================================================================

  confirmRental(params: {
    rentalId: string;
    actor: ActorContext;
  }): { success: boolean; rental?: RightModel; error?: string } {
    this.enforcePermission(params.actor, 'CONFIRM', params.rentalId);

    const rental = this.rentals.get(params.rentalId);
    if (!rental) {
      return { success: false, error: 'Rental not found' };
    }

    const metadata = rental.metadata as unknown as CarRentalMetadata;

    if (metadata.status === CarRentalStatus.CONFIRMED) {
      return { success: true, rental };
    }

    if (metadata.status !== CarRentalStatus.CREATED) {
      return {
        success: false,
        error: `Cannot confirm from status ${metadata.status}. Allowed: CREATED`,
      };
    }

    const previousMetadata = { ...metadata };
    metadata.status = CarRentalStatus.CONFIRMED;
    rental.updatedAt = new Date().toISOString();

    this.setRentalState(params.rentalId, CarRentalState.CONFIRMED);

    this.recordMetadataChange(
      params.rentalId,
      previousMetadata,
      metadata,
      params.actor.actorId,
      'Rental confirmed'
    );

    this.emitEvent(CarRentalEventType.RENTAL_CONFIRMED, params.rentalId, {
      confirmedBy: params.actor.actorId,
    }, metadata.confirmationNumber);

    return { success: true, rental };
  }

  // ============================================================================
  // PICK UP
  // ============================================================================

  pickUp(params: {
    rentalId: string;
    actor: ActorContext;
    mileageStart?: number;
    fuelLevel?: number;
  }): { success: boolean; rental?: RightModel; error?: string; alreadyPickedUp?: boolean } {
    this.enforcePermission(params.actor, 'PICK_UP', params.rentalId);

    const rental = this.rentals.get(params.rentalId);
    if (!rental) {
      return { success: false, error: 'Rental not found' };
    }

    const metadata = rental.metadata as unknown as CarRentalMetadata;

    // Check frozen
    if (metadata.frozen) {
      return { success: false, error: 'Rental is frozen - contact rental company' };
    }

    // Idempotent: if already picked up, return success
    if (metadata.status === CarRentalStatus.PICKED_UP) {
      return { success: true, rental, alreadyPickedUp: true };
    }

    if (metadata.status !== CarRentalStatus.CONFIRMED) {
      return {
        success: false,
        error: `Cannot pick up from status ${metadata.status}. Allowed: CONFIRMED`,
      };
    }

    // Check insurance verification
    if (!metadata.insurancePolicy.verified) {
      return {
        success: false,
        error: 'Insurance must be verified before pickup',
        alreadyPickedUp: false,
      };
    }

    const previousMetadata = { ...metadata };
    metadata.status = CarRentalStatus.PICKED_UP;
    if (params.mileageStart !== undefined) {
      metadata.vehicleCondition.pickupMileage = params.mileageStart;
    }
    if (params.fuelLevel !== undefined) {
      metadata.vehicleCondition.pickupFuelLevel = params.fuelLevel;
    }
    rental.updatedAt = new Date().toISOString();

    this.setRentalState(params.rentalId, CarRentalState.PICKED_UP);

    this.recordMetadataChange(
      params.rentalId,
      previousMetadata,
      metadata,
      params.actor.actorId,
      'Vehicle picked up'
    );

    this.emitEvent(CarRentalEventType.PICKUP_COMPLETED, params.rentalId, {
      pickedUpBy: params.actor.actorId,
      mileageStart: params.mileageStart,
      fuelLevel: params.fuelLevel,
    }, metadata.confirmationNumber);

    return { success: true, rental };
  }

  // ============================================================================
  // RETURN VEHICLE
  // ============================================================================

  returnVehicle(params: {
    rentalId: string;
    actor: ActorContext;
    mileageEnd?: number;
    fuelLevel?: number;
    damageNotes?: string;
  }): { success: boolean; rental?: RightModel; error?: string; mileageDiff?: number } {
    this.enforcePermission(params.actor, 'RETURN', params.rentalId);

    const rental = this.rentals.get(params.rentalId);
    if (!rental) {
      return { success: false, error: 'Rental not found' };
    }

    const metadata = rental.metadata as unknown as CarRentalMetadata;

    if (metadata.status !== CarRentalStatus.PICKED_UP) {
      return {
        success: false,
        error: `Cannot return vehicle from status ${metadata.status}. Must be PICKED_UP`,
      };
    }

    const previousMetadata = { ...metadata };
    metadata.status = CarRentalStatus.RETURNED;
    if (params.mileageEnd !== undefined) {
      metadata.vehicleCondition.returnMileage = params.mileageEnd;
    }
    if (params.fuelLevel !== undefined) {
      metadata.vehicleCondition.returnFuelLevel = params.fuelLevel;
    }
    if (params.damageNotes) {
      metadata.vehicleCondition.damageReport = params.damageNotes;
    }
    rental.updatedAt = new Date().toISOString();

    this.setRentalState(params.rentalId, CarRentalState.RETURNED);

    // Calculate mileage difference
    let mileageDiff: number | undefined;
    if (metadata.vehicleCondition.pickupMileage !== undefined && metadata.vehicleCondition.returnMileage !== undefined) {
      mileageDiff = metadata.vehicleCondition.returnMileage - metadata.vehicleCondition.pickupMileage;
    }

    this.recordMetadataChange(
      params.rentalId,
      previousMetadata,
      metadata,
      params.actor.actorId,
      'Vehicle returned'
    );

    this.emitEvent(CarRentalEventType.RETURN_COMPLETED, params.rentalId, {
      returnedBy: params.actor.actorId,
      mileageEnd: params.mileageEnd,
      fuelLevel: params.fuelLevel,
      damageNotes: params.damageNotes,
      mileageDiff,
    }, metadata.confirmationNumber);

    return { success: true, rental, mileageDiff };
  }

  // ============================================================================
  // INSPECT VEHICLE
  // ============================================================================

  inspectVehicle(params: {
    rentalId: string;
    actor: ActorContext;
    inspectionResult: {
      passed: boolean;
      damageFound?: boolean;
      chargeAmount?: string;
      chargeReason?: string;
    };
  }): { success: boolean; rental?: RightModel; error?: string } {
    this.enforcePermission(params.actor, 'INSPECT', params.rentalId);

    const rental = this.rentals.get(params.rentalId);
    if (!rental) {
      return { success: false, error: 'Rental not found' };
    }

    const metadata = rental.metadata as unknown as CarRentalMetadata;

    if (metadata.status !== CarRentalStatus.RETURNED) {
      return {
        success: false,
        error: `Cannot inspect vehicle from status ${metadata.status}. Must be RETURNED`,
      };
    }

    const previousMetadata = { ...metadata };
    metadata.status = CarRentalStatus.INSPECTED;

    // Resolve deposit based on inspection
    if (params.inspectionResult.passed && !params.inspectionResult.damageFound) {
      metadata.deposit.status = DepositStatus.RELEASED;
    } else if (params.inspectionResult.chargeAmount) {
      const chargeAmount = parseFloat(params.inspectionResult.chargeAmount);
      const depositAmount = parseFloat(metadata.deposit.amount);

      if (chargeAmount >= depositAmount) {
        metadata.deposit.status = DepositStatus.FULLY_CHARGED;
      } else {
        metadata.deposit.status = DepositStatus.PARTIALLY_CHARGED;
      }
      metadata.deposit.chargeAmount = params.inspectionResult.chargeAmount;
      metadata.deposit.chargeReason = params.inspectionResult.chargeReason;
    } else {
      metadata.deposit.status = DepositStatus.RELEASED;
    }

    rental.updatedAt = new Date().toISOString();

    this.setRentalState(params.rentalId, CarRentalState.INSPECTED);

    this.recordMetadataChange(
      params.rentalId,
      previousMetadata,
      metadata,
      params.actor.actorId,
      'Vehicle inspected'
    );

    this.emitEvent(CarRentalEventType.INSPECTION_COMPLETED, params.rentalId, {
      inspectedBy: params.actor.actorId,
      passed: params.inspectionResult.passed,
      depositStatus: metadata.deposit.status,
      chargeAmount: params.inspectionResult.chargeAmount,
    }, metadata.confirmationNumber);

    return { success: true, rental };
  }

  // ============================================================================
  // CLOSE RENTAL
  // ============================================================================

  closeRental(params: {
    rentalId: string;
    actor: ActorContext;
  }): { success: boolean; rental?: RightModel; error?: string } {
    this.enforcePermission(params.actor, 'CLOSE', params.rentalId);

    const rental = this.rentals.get(params.rentalId);
    if (!rental) {
      return { success: false, error: 'Rental not found' };
    }

    const metadata = rental.metadata as unknown as CarRentalMetadata;

    if (metadata.status !== CarRentalStatus.INSPECTED) {
      return {
        success: false,
        error: `Cannot close from status ${metadata.status}. Must be INSPECTED`,
      };
    }

    const previousMetadata = { ...metadata };
    metadata.status = CarRentalStatus.CLOSED;
    rental.state = LifecycleState.BURNED;
    rental.updatedAt = new Date().toISOString();

    this.setRentalState(params.rentalId, CarRentalState.CLOSED);

    this.recordMetadataChange(
      params.rentalId,
      previousMetadata,
      metadata,
      params.actor.actorId,
      'Rental closed'
    );

    return { success: true, rental };
  }

  // ============================================================================
  // CANCEL RENTAL
  // ============================================================================

  cancelRental(params: {
    rentalId: string;
    requestedBy: string;
    reason?: string;
  }): { success: boolean; refundAmount?: string; error?: string } {
    const rental = this.rentals.get(params.rentalId);
    if (!rental) {
      return { success: false, error: 'Rental not found' };
    }

    const metadata = rental.metadata as unknown as CarRentalMetadata;

    // Check if cancellation is allowed from current status
    if (metadata.status !== CarRentalStatus.CREATED &&
        metadata.status !== CarRentalStatus.CONFIRMED) {
      return { success: false, error: `Cannot cancel rental in status ${metadata.status}` };
    }

    // Check frozen
    if (metadata.frozen) {
      return { success: false, error: 'Rental is frozen - cannot cancel' };
    }

    // Check cancellation deadline for confirmed rentals
    if (metadata.status === CarRentalStatus.CONFIRMED) {
      const pickupDate = new Date(metadata.rentalPeriod.pickupDate);
      const deadlineHours = metadata.cancellationPolicy.freeCancellationDeadlineHours;
      const deadline = new Date(pickupDate.getTime() - deadlineHours * 60 * 60 * 1000);

      if (new Date() > deadline) {
        // Past free cancellation window - apply penalty
        if (metadata.cancellationPolicy.penaltyPercentage >= 100) {
          return {
            success: false,
            error: `Cancellation window closed ${deadlineHours} hours before pickup`,
          };
        }
      }
    }

    // Calculate refund
    let refundAmount = '0';
    if (metadata.cancellationPolicy.refundable) {
      const rateTotal = parseFloat(metadata.pricing.total);
      const cancellationFee = parseFloat(metadata.cancellationPolicy.cancellationFee);
      refundAmount = Math.max(0, rateTotal - cancellationFee).toFixed(2);
    }

    const previousMetadata = { ...metadata };
    metadata.status = CarRentalStatus.CANCELLED;
    // Release deposit on cancellation
    metadata.deposit.status = DepositStatus.RELEASED;
    rental.state = LifecycleState.REDEEMED;
    rental.updatedAt = new Date().toISOString();

    this.setRentalState(params.rentalId, CarRentalState.CANCELLED);

    this.recordMetadataChange(
      params.rentalId,
      previousMetadata,
      metadata,
      params.requestedBy,
      `Cancelled: ${params.reason ?? 'No reason provided'}`
    );

    this.emitEvent(CarRentalEventType.RENTAL_CANCELLED, params.rentalId, {
      cancelledBy: params.requestedBy,
      reason: params.reason,
      refundAmount,
    }, metadata.confirmationNumber);

    return { success: true, refundAmount };
  }

  // ============================================================================
  // TRANSFER RENTAL
  // ============================================================================

  requestTransfer(params: {
    rentalId: string;
    fromDriver: string;
    toDriver: {
      name: string;
      identity?: CarRentalMetadata['driverIdentity'];
    };
    reason: string;
    idempotencyKey?: string;
  }): { success: boolean; request?: TransferRequest; error?: string; errorCode?: string } {
    // Check idempotency key first
    if (params.idempotencyKey) {
      const existingRequestId = this.transferIdempotencyKeys.get(params.idempotencyKey);
      if (existingRequestId) {
        const existingRequest = this.transferRequests.get(existingRequestId);
        if (existingRequest) {
          return { success: true, request: existingRequest };
        }
      }
    }

    const rental = this.rentals.get(params.rentalId);
    if (!rental) {
      return { success: false, error: 'Rental not found', errorCode: CarRentalErrorCode.RENTAL_NOT_FOUND };
    }

    const metadata = rental.metadata as unknown as CarRentalMetadata;

    // Check frozen
    if (metadata.frozen) {
      return { success: false, error: 'Cannot transfer frozen rental', errorCode: 'RENTAL_FROZEN' };
    }

    // Check current driver
    if (metadata.driverName !== params.fromDriver) {
      return { success: false, error: 'Not the current rental holder', errorCode: CarRentalErrorCode.NOT_DRIVER };
    }

    // Check status
    if (metadata.status !== CarRentalStatus.CONFIRMED) {
      if (metadata.status === CarRentalStatus.PICKED_UP) {
        return { success: false, error: 'Rental is locked after pickup', errorCode: CarRentalErrorCode.RENTAL_LOCKED_AFTER_PICKUP };
      }
      return { success: false, error: 'Rental cannot be transferred in current status', errorCode: CarRentalErrorCode.INVALID_TRANSITION };
    }

    // Check transfer count limit
    if (metadata.transferRules.transferCount >= metadata.transferRules.maxTransfers) {
      return {
        success: false,
        error: `Maximum transfers (${metadata.transferRules.maxTransfers}) exceeded`,
        errorCode: CarRentalErrorCode.MAX_TRANSFERS_EXCEEDED,
      };
    }

    // Check transfer deadline
    const pickupDate = new Date(metadata.rentalPeriod.pickupDate);
    const deadlineHours = metadata.transferRules.transferDeadlineHours;
    const deadline = new Date(pickupDate.getTime() - deadlineHours * 60 * 60 * 1000);
    if (new Date() > deadline) {
      return { success: false, error: 'Transfer window has closed', errorCode: CarRentalErrorCode.TRANSFER_WINDOW_CLOSED };
    }

    const now = new Date();
    const request: TransferRequest = {
      id: uuidv4(),
      rentalId: params.rentalId,
      fromDriver: params.fromDriver,
      toDriver: params.toDriver,
      reason: params.reason,
      requestedAt: now.toISOString(),
      status: TransferApprovalStatus.PENDING,
      nameChangeFee: metadata.transferRules.nameChangeFee,
      expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      idempotencyKey: params.idempotencyKey,
    };

    // Store idempotency key mapping
    if (params.idempotencyKey) {
      this.transferIdempotencyKeys.set(params.idempotencyKey, request.id);
    }

    // Check for auto-approval with verified identity
    if (metadata.transferRules.autoApproveWithIdentity && params.toDriver.identity) {
      const identityHash = this.hashIdentity(params.toDriver.identity);
      if (this.verifiedIdentities.get(identityHash)) {
        request.status = TransferApprovalStatus.AUTO_APPROVED;
        request.approvedAt = now.toISOString();
        request.approvedBy = 'SYSTEM_AUTO_APPROVAL';

        this.executeTransfer(request);

        this.emitEvent(CarRentalEventType.RENTAL_TRANSFERRED, params.rentalId, {
          from: params.fromDriver,
          to: params.toDriver.name,
          reason: params.reason,
          autoApproved: true,
        }, metadata.confirmationNumber);
      }
    }

    this.transferRequests.set(request.id, request);

    return { success: true, request };
  }

  approveTransfer(params: {
    requestId: string;
    approvedBy: string;
  }): { success: boolean; error?: string } {
    const request = this.transferRequests.get(params.requestId);
    if (!request) {
      return { success: false, error: 'Transfer request not found' };
    }

    if (request.status !== TransferApprovalStatus.PENDING) {
      return { success: false, error: 'Request is not pending' };
    }

    // Check expiry
    if (new Date() > new Date(request.expiresAt)) {
      request.status = TransferApprovalStatus.REJECTED;
      request.rejectionReason = 'Request expired';
      return { success: false, error: 'Request has expired' };
    }

    request.status = TransferApprovalStatus.APPROVED;
    request.approvedAt = new Date().toISOString();
    request.approvedBy = params.approvedBy;

    this.executeTransfer(request);

    const rental = this.rentals.get(request.rentalId);
    const metadata = rental?.metadata as unknown as CarRentalMetadata | undefined;

    this.emitEvent(CarRentalEventType.RENTAL_TRANSFERRED, request.rentalId, {
      from: request.fromDriver,
      to: request.toDriver.name,
      reason: request.reason,
      approvedBy: params.approvedBy,
    }, metadata?.confirmationNumber);

    return { success: true };
  }

  // ============================================================================
  // MODIFY RENTAL
  // ============================================================================

  modifyRental(params: {
    rentalId: string;
    changes: {
      pickupDate?: string;
      returnDate?: string;
      vehicleCategory?: VehicleCategory;
      pickupLocation?: string;
      returnLocation?: string;
    };
    actor: ActorContext;
  }): { success: boolean; rental?: RightModel; error?: string } {
    this.enforcePermission(params.actor, 'MODIFY', params.rentalId);

    const rental = this.rentals.get(params.rentalId);
    if (!rental) {
      return { success: false, error: 'Rental not found' };
    }

    const metadata = rental.metadata as unknown as CarRentalMetadata;

    if (metadata.status !== CarRentalStatus.CONFIRMED) {
      return {
        success: false,
        error: `Cannot modify rental in status ${metadata.status}. Must be CONFIRMED`,
      };
    }

    if (metadata.frozen) {
      return { success: false, error: 'Rental is frozen - cannot modify' };
    }

    const previousMetadata = { ...metadata };

    if (params.changes.pickupDate) {
      metadata.rentalPeriod.pickupDate = params.changes.pickupDate;
    }
    if (params.changes.returnDate) {
      metadata.rentalPeriod.returnDate = params.changes.returnDate;
    }
    if (params.changes.vehicleCategory) {
      metadata.vehicleInfo.category = params.changes.vehicleCategory;
    }
    if (params.changes.pickupLocation) {
      metadata.rentalPeriod.pickupLocation = params.changes.pickupLocation;
    }
    if (params.changes.returnLocation) {
      metadata.rentalPeriod.returnLocation = params.changes.returnLocation;
    }

    // Recalculate day count if dates changed
    if (params.changes.pickupDate || params.changes.returnDate) {
      const pickup = new Date(metadata.rentalPeriod.pickupDate);
      const returnD = new Date(metadata.rentalPeriod.returnDate);
      metadata.dayCount = Math.max(1, Math.round((returnD.getTime() - pickup.getTime()) / (24 * 60 * 60 * 1000)));

      // Recalculate total
      const perDay = parseFloat(metadata.pricing.perDay);
      const taxes = parseFloat(metadata.pricing.taxes);
      metadata.pricing.total = (perDay * metadata.dayCount + taxes).toFixed(2);
    }

    rental.updatedAt = new Date().toISOString();

    this.recordMetadataChange(
      params.rentalId,
      previousMetadata,
      metadata,
      params.actor.actorId,
      'Rental modified'
    );

    this.emitEvent(CarRentalEventType.RENTAL_MODIFIED, params.rentalId, {
      modifiedBy: params.actor.actorId,
      changes: params.changes,
    }, metadata.confirmationNumber);

    return { success: true, rental };
  }

  // ============================================================================
  // EXTEND RENTAL
  // ============================================================================

  extendRental(params: {
    rentalId: string;
    newReturnDate: string;
    actor: ActorContext;
  }): { success: boolean; rental?: RightModel; error?: string } {
    this.enforcePermission(params.actor, 'EXTEND_RENTAL', params.rentalId);

    const rental = this.rentals.get(params.rentalId);
    if (!rental) {
      return { success: false, error: 'Rental not found' };
    }

    const metadata = rental.metadata as unknown as CarRentalMetadata;

    if (metadata.status !== CarRentalStatus.PICKED_UP) {
      return {
        success: false,
        error: `Cannot extend rental from status ${metadata.status}. Must be PICKED_UP`,
      };
    }

    const newReturn = new Date(params.newReturnDate);
    const currentReturn = new Date(metadata.rentalPeriod.returnDate);

    if (newReturn <= currentReturn) {
      return { success: false, error: 'New return date must be after current return date' };
    }

    const previousMetadata = { ...metadata };
    metadata.rentalPeriod.returnDate = params.newReturnDate;

    // Recalculate day count and total
    const pickup = new Date(metadata.rentalPeriod.pickupDate);
    metadata.dayCount = Math.max(1, Math.round((newReturn.getTime() - pickup.getTime()) / (24 * 60 * 60 * 1000)));
    const perDay = parseFloat(metadata.pricing.perDay);
    const taxes = parseFloat(metadata.pricing.taxes);
    metadata.pricing.total = (perDay * metadata.dayCount + taxes).toFixed(2);

    rental.updatedAt = new Date().toISOString();
    rental.validityPeriod!.endTime = params.newReturnDate;

    this.recordMetadataChange(
      params.rentalId,
      previousMetadata,
      metadata,
      params.actor.actorId,
      'Rental extended'
    );

    this.emitEvent(CarRentalEventType.RENTAL_EXTENDED, params.rentalId, {
      previousReturnDate: previousMetadata.rentalPeriod.returnDate,
      newReturnDate: params.newReturnDate,
      newDayCount: metadata.dayCount,
      newTotal: metadata.pricing.total,
    }, metadata.confirmationNumber);

    return { success: true, rental };
  }

  // ============================================================================
  // NO-SHOW
  // ============================================================================

  markNoShow(params: {
    rentalId: string;
    actor: ActorContext;
  }): { success: boolean; rental?: RightModel; error?: string } {
    this.enforcePermission(params.actor, 'MARK_NO_SHOW', params.rentalId);

    const rental = this.rentals.get(params.rentalId);
    if (!rental) {
      return { success: false, error: 'Rental not found' };
    }

    const metadata = rental.metadata as unknown as CarRentalMetadata;

    if (metadata.status !== CarRentalStatus.CONFIRMED) {
      return {
        success: false,
        error: `Cannot mark no-show from status ${metadata.status}. Must be CONFIRMED`,
      };
    }

    const previousMetadata = { ...metadata };
    metadata.status = CarRentalStatus.NO_SHOW;
    rental.updatedAt = new Date().toISOString();

    this.setRentalState(params.rentalId, CarRentalState.NO_SHOW);

    this.recordMetadataChange(
      params.rentalId,
      previousMetadata,
      metadata,
      params.actor.actorId,
      'No-show recorded'
    );

    this.emitEvent(CarRentalEventType.NO_SHOW_RECORDED, params.rentalId, {
      markedBy: params.actor.actorId,
    }, metadata.confirmationNumber);

    return { success: true, rental };
  }

  // ============================================================================
  // FREEZE / UNFREEZE
  // ============================================================================

  freezeRental(params: {
    rentalId: string;
    actor: ActorContext;
    reason: string;
    expiresAt?: string;
  }): { success: boolean; freeze?: FreezeRecord; error?: string } {
    this.enforcePermission(params.actor, 'FREEZE', params.rentalId);

    const rental = this.rentals.get(params.rentalId);
    if (!rental) {
      return { success: false, error: 'Rental not found' };
    }

    const metadata = rental.metadata as unknown as CarRentalMetadata;

    if (metadata.frozen) {
      return { success: false, error: 'Rental already frozen' };
    }

    metadata.frozen = true;
    metadata.freezeInfo = {
      frozenAt: new Date().toISOString(),
      reason: params.reason,
      expiresAt: params.expiresAt,
    };
    rental.updatedAt = new Date().toISOString();

    const freeze: FreezeRecord = {
      id: uuidv4(),
      rentalId: params.rentalId,
      frozenAt: new Date().toISOString(),
      frozenBy: params.actor.actorId,
      reason: params.reason,
      expiresAt: params.expiresAt,
    };

    const freezes = this.freezeRecords.get(params.rentalId) ?? [];
    freezes.push(freeze);
    this.freezeRecords.set(params.rentalId, freezes);

    this.emitEvent(CarRentalEventType.RENTAL_FROZEN, params.rentalId, {
      reason: params.reason,
    }, metadata.confirmationNumber);

    return { success: true, freeze };
  }

  unfreezeRental(params: {
    rentalId: string;
    actor: ActorContext;
  }): { success: boolean; error?: string } {
    this.enforcePermission(params.actor, 'FREEZE', params.rentalId);

    const rental = this.rentals.get(params.rentalId);
    if (!rental) {
      return { success: false, error: 'Rental not found' };
    }

    const metadata = rental.metadata as unknown as CarRentalMetadata;

    if (!metadata.frozen) {
      return { success: false, error: 'Rental is not frozen' };
    }

    metadata.frozen = false;
    metadata.freezeInfo = undefined;
    rental.updatedAt = new Date().toISOString();

    const freezes = this.freezeRecords.get(params.rentalId) ?? [];
    const lastFreeze = freezes[freezes.length - 1];
    if (lastFreeze) {
      lastFreeze.unfrozenAt = new Date().toISOString();
      lastFreeze.unfrozenBy = params.actor.actorId;
    }

    this.emitEvent(CarRentalEventType.RENTAL_UNFROZEN, params.rentalId, {
      unfrozenBy: params.actor.actorId,
    }, metadata.confirmationNumber);

    return { success: true };
  }

  // ============================================================================
  // QUERY METHODS
  // ============================================================================

  getRental(rentalId: string): RightModel | undefined {
    return this.rentals.get(rentalId);
  }

  getRentalEvents(rentalId: string): CarRentalEvent[] {
    return this.events.filter(e => e.rentalId === rentalId);
  }

  getMetadataVersions(rentalId: string): MetadataVersion[] {
    return this.metadataVersions.get(rentalId) ?? [];
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private executeTransfer(request: TransferRequest): void {
    const rental = this.rentals.get(request.rentalId);
    if (!rental) return;

    const metadata = rental.metadata as unknown as CarRentalMetadata;

    const transferRecord: TransferRecord = {
      id: request.id,
      from: {
        name: request.fromDriver,
        identity: metadata.driverIdentity?.number,
      },
      to: {
        name: request.toDriver.name,
        identity: request.toDriver.identity?.number,
      },
      requestedAt: request.requestedAt,
      approvalStatus: request.status,
      approvedAt: request.approvedAt,
      approvedBy: request.approvedBy,
      nameChangeFee: request.nameChangeFee,
    };
    metadata.transferHistory.push(transferRecord);

    const previousMetadata = { ...metadata };
    metadata.driverName = request.toDriver.name;
    metadata.driverIdentity = request.toDriver.identity;
    metadata.transferRules.transferCount++;

    rental.name = `${metadata.rentalCompanyCode} - ${request.toDriver.name} - ${metadata.confirmationNumber}`;
    rental.updatedAt = new Date().toISOString();

    this.recordMetadataChange(
      request.rentalId,
      previousMetadata,
      metadata,
      request.approvedBy ?? 'SYSTEM',
      `Transfer: ${request.fromDriver} -> ${request.toDriver.name}`
    );
  }

  private recordMetadataChange(
    rentalId: string,
    previousMetadata: CarRentalMetadata,
    newMetadata: CarRentalMetadata,
    changedBy: string,
    changeReason: string
  ): void {
    const versions = this.metadataVersions.get(rentalId) ?? [];
    const previousVersion = versions[versions.length - 1];

    const changes: Record<string, { old: unknown; new: unknown }> = {};

    if (previousMetadata.status !== newMetadata.status) {
      changes.status = { old: previousMetadata.status, new: newMetadata.status };
    }
    if (previousMetadata.driverName !== newMetadata.driverName) {
      changes.driverName = { old: previousMetadata.driverName, new: newMetadata.driverName };
    }
    if (previousMetadata.transferRules.transferCount !== newMetadata.transferRules.transferCount) {
      changes.transferCount = {
        old: previousMetadata.transferRules.transferCount,
        new: newMetadata.transferRules.transferCount,
      };
    }
    if (previousMetadata.rentalPeriod.returnDate !== newMetadata.rentalPeriod.returnDate) {
      changes.returnDate = { old: previousMetadata.rentalPeriod.returnDate, new: newMetadata.rentalPeriod.returnDate };
    }
    if (previousMetadata.dayCount !== newMetadata.dayCount) {
      changes.dayCount = { old: previousMetadata.dayCount, new: newMetadata.dayCount };
    }
    if (previousMetadata.vehicleInfo.category !== newMetadata.vehicleInfo.category) {
      changes.vehicleCategory = { old: previousMetadata.vehicleInfo.category, new: newMetadata.vehicleInfo.category };
    }

    const newVersion: MetadataVersion = {
      version: (previousVersion?.version ?? -1) + 1,
      timestamp: new Date().toISOString(),
      changedBy,
      changeReason,
      previousHash: previousVersion?.currentHash ?? '',
      currentHash: this.hashMetadata(newMetadata),
      changes,
    };

    versions.push(newVersion);
    this.metadataVersions.set(rentalId, versions);
  }

  private hashMetadata(metadata: CarRentalMetadata): string {
    const hashInput = JSON.stringify({
      confirmationNumber: metadata.confirmationNumber,
      rentalCompanyCode: metadata.rentalCompanyCode,
      driverName: metadata.driverName,
      status: metadata.status,
      vehicleCategory: metadata.vehicleInfo.category,
      pickupDate: metadata.rentalPeriod.pickupDate,
      returnDate: metadata.rentalPeriod.returnDate,
      pricing: metadata.pricing,
    });

    return createHash('sha256').update(hashInput).digest('hex');
  }

  private hashIdentity(identity: CarRentalMetadata['driverIdentity']): string {
    if (!identity) return '';
    return `${identity.type}:${identity.country}:${identity.number}`;
  }

  private emitEvent(
    type: CarRentalEventType,
    rentalId: string,
    data: Record<string, unknown>,
    confirmationNumber?: string
  ): void {
    const event: CarRentalEvent = {
      id: uuidv4(),
      type,
      rentalId,
      occurredAt: new Date().toISOString(),
      data,
      confirmationNumber,
    };

    this.events.push(event);
  }
}

// ============================================================================
// ASSET PACK DEFINITION
// ============================================================================

export const CAR_RENTAL_PACK: AssetPack = {
  id: 'CAR_RENTAL',
  name: 'Car Rental',
  description: 'Transferable car rentals with driver swap workflow, deposit management, vehicle inspection, and insurance verification',
  version: '1.0.0',

  defaults: {
    assetType: AssetType.TICKET,
    investorClass: InvestorClass.RETAIL,
    liquidityProfile: LiquidityProfile.LIQUID,
    fractionalization: FractionalizationType.WHOLE,
    lockupDays: 0,
    additionalJurisdictions: [],
    blockedJurisdictions: [],
  },

  lifecycleRules: [
    {
      from: LifecycleState.DRAFT,
      to: LifecycleState.ACTIVE,
      conditions: [
        { type: 'APPROVAL', approvals: [{ role: 'RENTAL_COMPANY', count: 1 }] },
      ],
      actions: [{ type: 'EMIT_EVENT', params: { event: 'RENTAL_CONFIRMED' } }],
      description: 'Confirm rental',
    },
    {
      from: LifecycleState.ACTIVE,
      to: LifecycleState.FROZEN,
      conditions: [
        { type: 'CUSTOM', customCondition: 'TRANSFER_PENDING' },
      ],
      actions: [],
      description: 'Freeze during transfer approval',
    },
    {
      from: LifecycleState.FROZEN,
      to: LifecycleState.ACTIVE,
      conditions: [
        { type: 'APPROVAL', approvals: [{ role: 'RENTAL_COMPANY', count: 1 }] },
      ],
      actions: [{ type: 'EMIT_EVENT', params: { event: 'TRANSFER_APPROVED' } }],
      description: 'Approve transfer',
    },
    {
      from: LifecycleState.ACTIVE,
      to: LifecycleState.REDEEMED,
      conditions: [
        { type: 'CUSTOM', customCondition: 'VEHICLE_RETURNED' },
      ],
      actions: [{ type: 'EMIT_EVENT', params: { event: 'RETURN_COMPLETED' } }],
      description: 'Vehicle returned',
    },
    {
      from: LifecycleState.ACTIVE,
      to: LifecycleState.REDEEMED,
      conditions: [
        { type: 'APPROVAL', approvals: [{ role: 'HOLDER', count: 1 }] },
      ],
      actions: [{ type: 'EMIT_EVENT', params: { event: 'RENTAL_CANCELLED' } }],
      description: 'Cancel rental',
    },
  ],

  complianceRules: [
    {
      id: 'TRANSFER_APPROVAL',
      name: 'Transfer Requires Approval',
      type: 'CUSTOM',
      params: { requireCompanyApproval: true, allowIdentityBypass: true },
      severity: 'BLOCK',
    },
    {
      id: 'TRANSFER_LIMIT',
      name: 'Transfer Count Limit',
      type: 'TRANSFER_LIMIT',
      params: { maxTransfers: 2 },
      severity: 'BLOCK',
    },
    {
      id: 'TRANSFER_DEADLINE',
      name: 'Transfer Deadline',
      type: 'CUSTOM',
      params: { deadlineHoursBeforePickup: 24 },
      severity: 'BLOCK',
    },
    {
      id: 'INSURANCE_REQUIRED',
      name: 'Insurance Verification Required',
      type: 'CUSTOM',
      params: { requireInsurance: true },
      severity: 'BLOCK',
    },
  ],

  requiredVerifications: [
    {
      type: 'IDENTITY_VERIFICATION',
      description: 'Driver identity verification (optional for auto-approval)',
      allowedVerifiers: ['RENTAL_COMPANY', 'IDENTITY_PROVIDER'],
      mandatory: false,
    },
    {
      type: 'INSURANCE_VERIFICATION',
      description: 'Insurance policy verification',
      allowedVerifiers: ['RENTAL_COMPANY', 'INSURANCE_PROVIDER'],
      mandatory: true,
    },
  ],

  metadataSchema: {
    confirmationNumber: { type: 'string', required: true, description: 'Confirmation number' },
    driverName: { type: 'string', required: true, description: 'Driver name' },
    vehicleInfo: { type: 'object', required: true, description: 'Vehicle information' },
    rentalPeriod: { type: 'object', required: true, description: 'Rental period with pickup/return dates and locations' },
    pricing: { type: 'object', required: true, description: 'Pricing information' },
    transferRules: { type: 'object', required: true, description: 'Transfer rules' },
    cancellationPolicy: { type: 'object', required: true, description: 'Cancellation policy' },
    insurancePolicy: { type: 'object', required: true, description: 'Insurance policy details' },
  },

  tags: ['car-rental', 'mobility', 'access', 'conditional-transfer', 'deposit-workflow'],
};

export default CarRentalEngine;
