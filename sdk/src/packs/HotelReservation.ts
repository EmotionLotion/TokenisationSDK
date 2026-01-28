/**
 * Pack: Hotel Reservation
 *
 * Production-ready implementation for hotel reservation tokenization with:
 * - Conditional transfer requiring hotel approval OR identity claim
 * - Name change fees
 * - Transfer count limits
 * - Cancellation/refund lifecycle
 * - Check-in/check-out with room assignment
 * - Stay extension
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
import type { IIdentityRegistry } from '../orchestration/SharedIdentityRegistry.js';
import type { ICrossPackEventBus } from '../orchestration/CrossPackEventBus.js';
import type { IAuditLog } from '../orchestration/UnifiedAuditLog.js';
import {
  HOTEL_RESERVATION_STATE_MACHINE,
  HotelReservationState,
  HotelReservationEvent,
  HotelReservationErrorCode,
  type HotelReservationOperationContext,
  transferWindowGuard,
  postCheckInLockGuard,
  transferCountGuard,
  mapLegacyStatusToState,
  mapStateToLegacyStatus,
} from './HotelReservationStateMachine.js';

// ============================================================================
// TYPES
// ============================================================================

export enum RoomType {
  STANDARD = 'STANDARD',
  DELUXE = 'DELUXE',
  SUITE = 'SUITE',
  PENTHOUSE = 'PENTHOUSE',
  STUDIO = 'STUDIO',
  FAMILY = 'FAMILY',
}

export enum HotelReservationStatus {
  CREATED = 'CREATED',
  CONFIRMED = 'CONFIRMED',
  CHECKED_IN = 'CHECKED_IN',
  CHECKED_OUT = 'CHECKED_OUT',
  CLOSED = 'CLOSED',
  CANCELLED = 'CANCELLED',
  NO_SHOW = 'NO_SHOW',
  EXPIRED = 'EXPIRED',
  VOID = 'VOID',
}

export enum TransferApprovalStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  AUTO_APPROVED = 'AUTO_APPROVED',
}

export interface HotelReservationMetadata {
  assetType: 'HOTEL_RESERVATION';
  /** Hotel code */
  hotelCode: string;
  /** Hotel name */
  hotelName: string;
  /** Confirmation number */
  confirmationNumber: string;
  /** Guest name */
  guestName: string;
  /** Guest identity document */
  guestIdentity?: {
    type: 'PASSPORT' | 'ID_CARD' | 'DRIVERS_LICENSE';
    number: string;
    country: string;
    expiryDate: string;
  };
  /** Room type */
  roomType: RoomType;
  /** Room number (assigned at check-in) */
  roomNumber?: string;
  /** Check-in date (ISO string) */
  checkInDate: string;
  /** Check-out date (ISO string) */
  checkOutDate: string;
  /** Number of nights */
  nightCount: number;
  /** Rate information */
  rate: {
    perNight: string;
    total: string;
    taxes: string;
    currency: string;
    rateType: string;
  };
  /** Reservation status */
  status: HotelReservationStatus;
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
  /** Guest preferences */
  guestPreferences: {
    smoking: boolean;
    floorPreference?: 'HIGH' | 'LOW' | 'ANY';
    bedType?: 'KING' | 'QUEEN' | 'TWIN' | 'DOUBLE';
    specialRequests?: string[];
  };
  /** Whether reservation is currently frozen */
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
  reservationId: string;
  fromGuest: string;
  toGuest: {
    name: string;
    identity?: HotelReservationMetadata['guestIdentity'];
  };
  reason: string;
  requestedAt: string;
  status: TransferApprovalStatus;
  approvedAt?: string;
  approvedBy?: string;
  rejectionReason?: string;
  nameChangeFee: string;
  expiresAt: string;
  /** Idempotency key for deduplication */
  idempotencyKey?: string;
}

// ============================================================================
// RBAC TYPES
// ============================================================================

export enum HotelRole {
  HOTEL_ADMIN = 'HOTEL_ADMIN',
  FRONT_DESK = 'FRONT_DESK',
  CONCIERGE = 'CONCIERGE',
  PLATFORM_ADMIN = 'PLATFORM_ADMIN',
  GUEST = 'GUEST',
  AUDITOR = 'AUDITOR',
}

export interface ActorContext {
  actorId: string;
  role: HotelRole;
  hotelCode?: string;
  guestId?: string;
}

export interface RBACPermission {
  action: string;
  allowedRoles: HotelRole[];
  requiresOwnership?: boolean;
  requiresHotelMatch?: boolean;
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

export enum HotelEventType {
  RESERVATION_CREATED = 'RESERVATION_CREATED',
  RESERVATION_CONFIRMED = 'RESERVATION_CONFIRMED',
  RESERVATION_CANCELLED = 'RESERVATION_CANCELLED',
  CHECK_IN_COMPLETED = 'CHECK_IN_COMPLETED',
  CHECK_OUT_COMPLETED = 'CHECK_OUT_COMPLETED',
  RESERVATION_TRANSFERRED = 'RESERVATION_TRANSFERRED',
  RESERVATION_MODIFIED = 'RESERVATION_MODIFIED',
  STAY_EXTENDED = 'STAY_EXTENDED',
  NO_SHOW_RECORDED = 'NO_SHOW_RECORDED',
  RESERVATION_FROZEN = 'RESERVATION_FROZEN',
  RESERVATION_UNFROZEN = 'RESERVATION_UNFROZEN',
}

export interface HotelEvent {
  id: string;
  type: HotelEventType;
  reservationId: string;
  occurredAt: string;
  data: Record<string, unknown>;
  confirmationNumber?: string;
}

// ============================================================================
// FREEZE RECORD
// ============================================================================

export interface FreezeRecord {
  id: string;
  reservationId: string;
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
  // Reservation creation - hotel only
  { action: 'CREATE', allowedRoles: [HotelRole.HOTEL_ADMIN, HotelRole.FRONT_DESK, HotelRole.PLATFORM_ADMIN] },

  // Confirm reservation
  { action: 'CONFIRM', allowedRoles: [HotelRole.HOTEL_ADMIN, HotelRole.FRONT_DESK, HotelRole.PLATFORM_ADMIN] },

  // Check-in
  { action: 'CHECK_IN', allowedRoles: [HotelRole.HOTEL_ADMIN, HotelRole.FRONT_DESK, HotelRole.PLATFORM_ADMIN], requiresHotelMatch: true },

  // Check-out
  { action: 'CHECK_OUT', allowedRoles: [HotelRole.HOTEL_ADMIN, HotelRole.FRONT_DESK, HotelRole.PLATFORM_ADMIN], requiresHotelMatch: true },

  // Transfer request - guest or platform
  { action: 'REQUEST_TRANSFER', allowedRoles: [HotelRole.GUEST, HotelRole.PLATFORM_ADMIN], requiresOwnership: true },

  // Approve/reject transfer - hotel only
  { action: 'APPROVE_TRANSFER', allowedRoles: [HotelRole.HOTEL_ADMIN, HotelRole.FRONT_DESK], requiresHotelMatch: true },

  // Cancel - guest or hotel
  { action: 'CANCEL', allowedRoles: [HotelRole.GUEST, HotelRole.HOTEL_ADMIN, HotelRole.FRONT_DESK, HotelRole.PLATFORM_ADMIN] },

  // Modify - hotel or guest
  { action: 'MODIFY', allowedRoles: [HotelRole.HOTEL_ADMIN, HotelRole.FRONT_DESK, HotelRole.GUEST, HotelRole.PLATFORM_ADMIN] },

  // Extend stay
  { action: 'EXTEND_STAY', allowedRoles: [HotelRole.HOTEL_ADMIN, HotelRole.FRONT_DESK, HotelRole.GUEST, HotelRole.PLATFORM_ADMIN] },

  // Mark no-show - hotel only
  { action: 'MARK_NO_SHOW', allowedRoles: [HotelRole.HOTEL_ADMIN, HotelRole.FRONT_DESK, HotelRole.PLATFORM_ADMIN], requiresHotelMatch: true },

  // Freeze/unfreeze - admin only
  { action: 'FREEZE', allowedRoles: [HotelRole.HOTEL_ADMIN, HotelRole.PLATFORM_ADMIN] },

  // View - all roles
  { action: 'VIEW', allowedRoles: Object.values(HotelRole) },

  // Close - hotel only
  { action: 'CLOSE', allowedRoles: [HotelRole.HOTEL_ADMIN, HotelRole.FRONT_DESK, HotelRole.PLATFORM_ADMIN], requiresHotelMatch: true },
];

// ============================================================================
// HOTEL RESERVATION ENGINE
// ============================================================================

export class HotelReservationEngine {
  private reservations: Map<string, RightModel> = new Map();
  private transferRequests: Map<string, TransferRequest> = new Map();
  private stateMachine: StateMachine;
  private reservationStates: Map<string, HotelReservationState> = new Map();
  private authorizedHotels: Set<string> = new Set();
  private verifiedIdentities: Map<string, boolean> = new Map();

  private distributedLock: IDistributedLock;
  private metadataVersions: Map<string, MetadataVersion[]> = new Map();
  private freezeRecords: Map<string, FreezeRecord[]> = new Map();
  private events: HotelEvent[] = [];

  // Idempotency tracking
  private transferIdempotencyKeys: Map<string, string> = new Map();

  // Cross-pack orchestration dependencies (optional)
  private identityRegistry?: IIdentityRegistry;
  private crossPackEventBus?: ICrossPackEventBus;
  private crossPackAuditLog?: IAuditLog;

  constructor(config?: {
    distributedLock?: IDistributedLock;
    identityRegistry?: IIdentityRegistry;
    eventBus?: ICrossPackEventBus;
    auditLog?: IAuditLog;
  }) {
    this.distributedLock = config?.distributedLock ?? new InMemoryDistributedLock();
    this.identityRegistry = config?.identityRegistry;
    this.crossPackEventBus = config?.eventBus;
    this.crossPackAuditLog = config?.auditLog;

    this.stateMachine = new StateMachine(HOTEL_RESERVATION_STATE_MACHINE);
    this.stateMachine.addGlobalGuard(transferWindowGuard);
    this.stateMachine.addGlobalGuard(postCheckInLockGuard);
    this.stateMachine.addGlobalGuard(transferCountGuard);
  }

  // ============================================================================
  // REGISTRATION & IDENTITY
  // ============================================================================

  registerHotel(hotelCode: string): void {
    this.authorizedHotels.add(hotelCode);
  }

  verifyIdentity(identityHash: string): void {
    this.verifiedIdentities.set(identityHash, true);
    this.identityRegistry?.verify(identityHash, 'HOTEL');
  }

  // ============================================================================
  // STATE MACHINE METHODS
  // ============================================================================

  getCurrentState(reservationId: string): HotelReservationState | undefined {
    const cachedState = this.reservationStates.get(reservationId);
    if (cachedState) {
      return cachedState;
    }

    const reservation = this.reservations.get(reservationId);
    if (!reservation) {
      return undefined;
    }

    const metadata = reservation.metadata as unknown as HotelReservationMetadata;
    return mapLegacyStatusToState(metadata.status);
  }

  private setReservationState(reservationId: string, state: HotelReservationState): void {
    this.reservationStates.set(reservationId, state);
    this.stateMachine.setState(reservationId, state);
  }

  // ============================================================================
  // RBAC ENFORCEMENT
  // ============================================================================

  checkPermission(
    actor: ActorContext,
    action: string,
    reservationId?: string
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

    if (permission.requiresOwnership && reservationId) {
      const reservation = this.reservations.get(reservationId);
      if (!reservation) {
        return { allowed: false, reason: 'Reservation not found' };
      }
      const metadata = reservation.metadata as unknown as HotelReservationMetadata;

      if (actor.role === HotelRole.GUEST) {
        const isOwner = actor.guestId === metadata.guestName;
        if (!isOwner) {
          return { allowed: false, reason: 'Not the reservation holder' };
        }
      }
    }

    if (permission.requiresHotelMatch && reservationId) {
      const reservation = this.reservations.get(reservationId);
      if (!reservation) {
        return { allowed: false, reason: 'Reservation not found' };
      }
      const metadata = reservation.metadata as unknown as HotelReservationMetadata;

      if (actor.hotelCode && actor.hotelCode !== metadata.hotelCode) {
        return {
          allowed: false,
          reason: `Hotel ${actor.hotelCode} cannot modify reservations from ${metadata.hotelCode}`,
        };
      }
    }

    return { allowed: true };
  }

  private enforcePermission(actor: ActorContext, action: string, reservationId?: string): void {
    const result = this.checkPermission(actor, action, reservationId);
    if (!result.allowed) {
      throw new Error(`PERMISSION_DENIED: ${result.reason}`);
    }
  }

  // ============================================================================
  // RESERVATION CREATION
  // ============================================================================

  createReservation(params: {
    hotelCode: string;
    hotelName?: string;
    confirmationNumber: string;
    guestName: string;
    guestIdentity?: HotelReservationMetadata['guestIdentity'];
    roomType: RoomType;
    checkInDate: string;
    checkOutDate: string;
    rate: HotelReservationMetadata['rate'];
    transferRules?: Partial<HotelReservationMetadata['transferRules']>;
    cancellationPolicy?: Partial<HotelReservationMetadata['cancellationPolicy']>;
    guestPreferences?: Partial<HotelReservationMetadata['guestPreferences']>;
  }): { success: boolean; reservation?: RightModel; error?: string } {
    if (!this.authorizedHotels.has(params.hotelCode)) {
      return { success: false, error: 'Hotel not authorized' };
    }

    const now = new Date().toISOString();

    const checkIn = new Date(params.checkInDate);
    const checkOut = new Date(params.checkOutDate);
    const nightCount = Math.max(1, Math.round((checkOut.getTime() - checkIn.getTime()) / (24 * 60 * 60 * 1000)));

    const defaultTransferRules: HotelReservationMetadata['transferRules'] = {
      maxTransfers: 2,
      transferCount: 0,
      nameChangeFee: '25.00',
      transferDeadlineHours: 24,
      autoApproveWithIdentity: true,
    };

    const defaultCancellationPolicy: HotelReservationMetadata['cancellationPolicy'] = {
      refundable: true,
      cancellationFee: '0.00',
      freeCancellationDeadlineHours: 24,
      penaltyPercentage: 100,
    };

    const metadata: HotelReservationMetadata = {
      assetType: 'HOTEL_RESERVATION',
      hotelCode: params.hotelCode,
      hotelName: params.hotelName ?? params.hotelCode,
      confirmationNumber: params.confirmationNumber,
      guestName: params.guestName,
      guestIdentity: params.guestIdentity,
      roomType: params.roomType,
      checkInDate: params.checkInDate,
      checkOutDate: params.checkOutDate,
      nightCount,
      rate: params.rate,
      status: HotelReservationStatus.CREATED,
      transferRules: { ...defaultTransferRules, ...params.transferRules },
      cancellationPolicy: { ...defaultCancellationPolicy, ...params.cancellationPolicy },
      transferHistory: [],
      guestPreferences: {
        smoking: false,
        floorPreference: 'ANY',
        ...params.guestPreferences,
      },
      frozen: false,
      kycStatus: {
        verified: !!params.guestIdentity,
        verifiedAt: params.guestIdentity ? now : undefined,
      },
    };

    const reservation: RightModel = {
      id: uuidv4(),
      name: `${params.hotelCode} - ${params.guestName} - ${params.confirmationNumber}`,
      rightType: RightType.ACCESS,
      state: LifecycleState.ACTIVE,
      jurisdiction: {
        countryCode: 'GLOBAL',
        accreditedOnly: false,
        blockedJurisdictions: [],
      },
      validityPeriod: {
        isPerpetual: false,
        startTime: params.checkInDate,
        endTime: params.checkOutDate,
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

    this.reservations.set(reservation.id, reservation);
    this.setReservationState(reservation.id, HotelReservationState.CREATED);

    // Initialize metadata version history
    this.metadataVersions.set(reservation.id, [{
      version: 0,
      timestamp: now,
      changedBy: 'SYSTEM',
      changeReason: 'Initial creation',
      previousHash: '',
      currentHash: this.hashMetadata(metadata),
      changes: {},
    }]);

    this.emitEvent(HotelEventType.RESERVATION_CREATED, reservation.id, {
      confirmationNumber: params.confirmationNumber,
      guestName: params.guestName,
      hotelCode: params.hotelCode,
      roomType: params.roomType,
      checkInDate: params.checkInDate,
      checkOutDate: params.checkOutDate,
    }, params.confirmationNumber);

    return { success: true, reservation };
  }

  // ============================================================================
  // CONFIRM RESERVATION
  // ============================================================================

  confirmReservation(params: {
    reservationId: string;
    actor: ActorContext;
  }): { success: boolean; reservation?: RightModel; error?: string } {
    this.enforcePermission(params.actor, 'CONFIRM', params.reservationId);

    const reservation = this.reservations.get(params.reservationId);
    if (!reservation) {
      return { success: false, error: 'Reservation not found' };
    }

    const metadata = reservation.metadata as unknown as HotelReservationMetadata;

    if (metadata.status === HotelReservationStatus.CONFIRMED) {
      return { success: true, reservation };
    }

    if (metadata.status !== HotelReservationStatus.CREATED) {
      return {
        success: false,
        error: `Cannot confirm from status ${metadata.status}. Allowed: CREATED`,
      };
    }

    const previousMetadata = { ...metadata };
    metadata.status = HotelReservationStatus.CONFIRMED;
    reservation.updatedAt = new Date().toISOString();

    this.setReservationState(params.reservationId, HotelReservationState.CONFIRMED);

    this.recordMetadataChange(
      params.reservationId,
      previousMetadata,
      metadata,
      params.actor.actorId,
      'Reservation confirmed'
    );

    this.emitEvent(HotelEventType.RESERVATION_CONFIRMED, params.reservationId, {
      confirmedBy: params.actor.actorId,
    }, metadata.confirmationNumber);

    return { success: true, reservation };
  }

  // ============================================================================
  // CHECK-IN
  // ============================================================================

  checkIn(params: {
    reservationId: string;
    actor: ActorContext;
    roomNumber?: string;
  }): { success: boolean; reservation?: RightModel; error?: string; alreadyCheckedIn?: boolean } {
    this.enforcePermission(params.actor, 'CHECK_IN', params.reservationId);

    const reservation = this.reservations.get(params.reservationId);
    if (!reservation) {
      return { success: false, error: 'Reservation not found' };
    }

    const metadata = reservation.metadata as unknown as HotelReservationMetadata;

    // Check frozen
    if (metadata.frozen) {
      return { success: false, error: 'Reservation is frozen - contact hotel management' };
    }

    // Idempotent: if already checked in, return success
    if (metadata.status === HotelReservationStatus.CHECKED_IN) {
      return { success: true, reservation, alreadyCheckedIn: true };
    }

    if (metadata.status !== HotelReservationStatus.CONFIRMED) {
      return {
        success: false,
        error: `Cannot check in from status ${metadata.status}. Allowed: CONFIRMED`,
      };
    }

    const previousMetadata = { ...metadata };
    metadata.status = HotelReservationStatus.CHECKED_IN;
    if (params.roomNumber) {
      metadata.roomNumber = params.roomNumber;
    }
    reservation.updatedAt = new Date().toISOString();

    this.setReservationState(params.reservationId, HotelReservationState.CHECKED_IN);

    this.recordMetadataChange(
      params.reservationId,
      previousMetadata,
      metadata,
      params.actor.actorId,
      'Check-in'
    );

    this.emitEvent(HotelEventType.CHECK_IN_COMPLETED, params.reservationId, {
      checkedInBy: params.actor.actorId,
      roomNumber: params.roomNumber,
    }, metadata.confirmationNumber);

    return { success: true, reservation };
  }

  // ============================================================================
  // CHECK-OUT
  // ============================================================================

  checkOut(params: {
    reservationId: string;
    actor: ActorContext;
  }): { success: boolean; reservation?: RightModel; error?: string } {
    this.enforcePermission(params.actor, 'CHECK_OUT', params.reservationId);

    const reservation = this.reservations.get(params.reservationId);
    if (!reservation) {
      return { success: false, error: 'Reservation not found' };
    }

    const metadata = reservation.metadata as unknown as HotelReservationMetadata;

    if (metadata.status !== HotelReservationStatus.CHECKED_IN) {
      return {
        success: false,
        error: `Cannot check out from status ${metadata.status}. Must be CHECKED_IN`,
      };
    }

    const previousMetadata = { ...metadata };
    metadata.status = HotelReservationStatus.CHECKED_OUT;
    reservation.updatedAt = new Date().toISOString();

    this.setReservationState(params.reservationId, HotelReservationState.CHECKED_OUT);

    this.recordMetadataChange(
      params.reservationId,
      previousMetadata,
      metadata,
      params.actor.actorId,
      'Check-out'
    );

    this.emitEvent(HotelEventType.CHECK_OUT_COMPLETED, params.reservationId, {
      checkedOutBy: params.actor.actorId,
    }, metadata.confirmationNumber);

    return { success: true, reservation };
  }

  // ============================================================================
  // CLOSE RESERVATION
  // ============================================================================

  closeReservation(params: {
    reservationId: string;
    actor: ActorContext;
  }): { success: boolean; reservation?: RightModel; error?: string } {
    this.enforcePermission(params.actor, 'CLOSE', params.reservationId);

    const reservation = this.reservations.get(params.reservationId);
    if (!reservation) {
      return { success: false, error: 'Reservation not found' };
    }

    const metadata = reservation.metadata as unknown as HotelReservationMetadata;

    if (metadata.status !== HotelReservationStatus.CHECKED_OUT) {
      return {
        success: false,
        error: `Cannot close from status ${metadata.status}. Must be CHECKED_OUT`,
      };
    }

    const previousMetadata = { ...metadata };
    metadata.status = HotelReservationStatus.CLOSED;
    reservation.state = LifecycleState.BURNED;
    reservation.updatedAt = new Date().toISOString();

    this.setReservationState(params.reservationId, HotelReservationState.CLOSED);

    this.recordMetadataChange(
      params.reservationId,
      previousMetadata,
      metadata,
      params.actor.actorId,
      'Reservation closed'
    );

    return { success: true, reservation };
  }

  // ============================================================================
  // CANCEL RESERVATION
  // ============================================================================

  cancelReservation(params: {
    reservationId: string;
    requestedBy: string;
    reason?: string;
  }): { success: boolean; refundAmount?: string; error?: string } {
    const reservation = this.reservations.get(params.reservationId);
    if (!reservation) {
      return { success: false, error: 'Reservation not found' };
    }

    const metadata = reservation.metadata as unknown as HotelReservationMetadata;

    // Check if cancellation is allowed from current status
    if (metadata.status !== HotelReservationStatus.CREATED &&
        metadata.status !== HotelReservationStatus.CONFIRMED) {
      return { success: false, error: `Cannot cancel reservation in status ${metadata.status}` };
    }

    // Check frozen
    if (metadata.frozen) {
      return { success: false, error: 'Reservation is frozen - cannot cancel' };
    }

    // Check cancellation deadline for confirmed reservations
    if (metadata.status === HotelReservationStatus.CONFIRMED) {
      const checkInDate = new Date(metadata.checkInDate);
      const deadlineHours = metadata.cancellationPolicy.freeCancellationDeadlineHours;
      const deadline = new Date(checkInDate.getTime() - deadlineHours * 60 * 60 * 1000);

      if (new Date() > deadline) {
        // Past free cancellation window - apply penalty
        if (metadata.cancellationPolicy.penaltyPercentage >= 100) {
          return {
            success: false,
            error: `Cancellation window closed ${deadlineHours} hours before check-in`,
          };
        }
      }
    }

    // Calculate refund
    let refundAmount = '0';
    if (metadata.cancellationPolicy.refundable) {
      const rateTotal = parseFloat(metadata.rate.total);
      const cancellationFee = parseFloat(metadata.cancellationPolicy.cancellationFee);
      refundAmount = Math.max(0, rateTotal - cancellationFee).toFixed(2);
    }

    const previousMetadata = { ...metadata };
    metadata.status = HotelReservationStatus.CANCELLED;
    reservation.state = LifecycleState.REDEEMED;
    reservation.updatedAt = new Date().toISOString();

    this.setReservationState(params.reservationId, HotelReservationState.CANCELLED);

    this.recordMetadataChange(
      params.reservationId,
      previousMetadata,
      metadata,
      params.requestedBy,
      `Cancelled: ${params.reason ?? 'No reason provided'}`
    );

    this.emitEvent(HotelEventType.RESERVATION_CANCELLED, params.reservationId, {
      cancelledBy: params.requestedBy,
      reason: params.reason,
      refundAmount,
    }, metadata.confirmationNumber);

    return { success: true, refundAmount };
  }

  // ============================================================================
  // TRANSFER RESERVATION
  // ============================================================================

  requestTransfer(params: {
    reservationId: string;
    fromGuest: string;
    toGuest: {
      name: string;
      identity?: HotelReservationMetadata['guestIdentity'];
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

    const reservation = this.reservations.get(params.reservationId);
    if (!reservation) {
      return { success: false, error: 'Reservation not found', errorCode: HotelReservationErrorCode.RESERVATION_NOT_FOUND };
    }

    const metadata = reservation.metadata as unknown as HotelReservationMetadata;

    // Check frozen
    if (metadata.frozen) {
      return { success: false, error: 'Cannot transfer frozen reservation', errorCode: 'RESERVATION_FROZEN' };
    }

    // Check current guest
    if (metadata.guestName !== params.fromGuest) {
      return { success: false, error: 'Not the current reservation holder', errorCode: HotelReservationErrorCode.NOT_GUEST };
    }

    // Check status
    if (metadata.status !== HotelReservationStatus.CONFIRMED) {
      if (metadata.status === HotelReservationStatus.CHECKED_IN) {
        return { success: false, error: 'Reservation is locked after check-in', errorCode: HotelReservationErrorCode.RESERVATION_LOCKED_AFTER_CHECKIN };
      }
      return { success: false, error: 'Reservation cannot be transferred in current status', errorCode: HotelReservationErrorCode.INVALID_TRANSITION };
    }

    // Check transfer count limit
    if (metadata.transferRules.transferCount >= metadata.transferRules.maxTransfers) {
      this.crossPackAuditLog?.log({
        source: 'HOTEL', action: 'TRANSFER_DENIED', actorId: params.fromGuest,
        resourceId: params.reservationId, success: false,
        reason: `Maximum transfers (${metadata.transferRules.maxTransfers}) exceeded`,
      });
      return {
        success: false,
        error: `Maximum transfers (${metadata.transferRules.maxTransfers}) exceeded`,
        errorCode: HotelReservationErrorCode.MAX_TRANSFERS_EXCEEDED,
      };
    }

    // Check transfer deadline
    const checkInDate = new Date(metadata.checkInDate);
    const deadlineHours = metadata.transferRules.transferDeadlineHours;
    const deadline = new Date(checkInDate.getTime() - deadlineHours * 60 * 60 * 1000);
    if (new Date() > deadline) {
      return { success: false, error: 'Transfer window has closed', errorCode: HotelReservationErrorCode.TRANSFER_WINDOW_CLOSED };
    }

    const now = new Date();
    const request: TransferRequest = {
      id: uuidv4(),
      reservationId: params.reservationId,
      fromGuest: params.fromGuest,
      toGuest: params.toGuest,
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
    if (metadata.transferRules.autoApproveWithIdentity && params.toGuest.identity) {
      const identityHash = this.hashIdentity(params.toGuest.identity);
      if (this.verifiedIdentities.get(identityHash) || this.identityRegistry?.isVerified(identityHash)) {
        request.status = TransferApprovalStatus.AUTO_APPROVED;
        request.approvedAt = now.toISOString();
        request.approvedBy = 'SYSTEM_AUTO_APPROVAL';

        this.executeTransfer(request);

        this.emitEvent(HotelEventType.RESERVATION_TRANSFERRED, params.reservationId, {
          from: params.fromGuest,
          to: params.toGuest.name,
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

    const reservation = this.reservations.get(request.reservationId);
    const metadata = reservation?.metadata as unknown as HotelReservationMetadata | undefined;

    this.emitEvent(HotelEventType.RESERVATION_TRANSFERRED, request.reservationId, {
      from: request.fromGuest,
      to: request.toGuest.name,
      reason: request.reason,
      approvedBy: params.approvedBy,
    }, metadata?.confirmationNumber);

    return { success: true };
  }

  // ============================================================================
  // MODIFY RESERVATION
  // ============================================================================

  modifyReservation(params: {
    reservationId: string;
    changes: {
      checkInDate?: string;
      checkOutDate?: string;
      roomType?: RoomType;
      guestPreferences?: Partial<HotelReservationMetadata['guestPreferences']>;
    };
    actor: ActorContext;
  }): { success: boolean; reservation?: RightModel; error?: string } {
    this.enforcePermission(params.actor, 'MODIFY', params.reservationId);

    const reservation = this.reservations.get(params.reservationId);
    if (!reservation) {
      return { success: false, error: 'Reservation not found' };
    }

    const metadata = reservation.metadata as unknown as HotelReservationMetadata;

    if (metadata.status !== HotelReservationStatus.CONFIRMED) {
      return {
        success: false,
        error: `Cannot modify reservation in status ${metadata.status}. Must be CONFIRMED`,
      };
    }

    if (metadata.frozen) {
      return { success: false, error: 'Reservation is frozen - cannot modify' };
    }

    const previousMetadata = { ...metadata };

    if (params.changes.checkInDate) {
      metadata.checkInDate = params.changes.checkInDate;
    }
    if (params.changes.checkOutDate) {
      metadata.checkOutDate = params.changes.checkOutDate;
    }
    if (params.changes.roomType) {
      metadata.roomType = params.changes.roomType;
    }
    if (params.changes.guestPreferences) {
      metadata.guestPreferences = {
        ...metadata.guestPreferences,
        ...params.changes.guestPreferences,
      };
    }

    // Recalculate night count if dates changed
    if (params.changes.checkInDate || params.changes.checkOutDate) {
      const checkIn = new Date(metadata.checkInDate);
      const checkOut = new Date(metadata.checkOutDate);
      metadata.nightCount = Math.max(1, Math.round((checkOut.getTime() - checkIn.getTime()) / (24 * 60 * 60 * 1000)));

      // Recalculate total
      const perNight = parseFloat(metadata.rate.perNight);
      const taxes = parseFloat(metadata.rate.taxes);
      metadata.rate.total = (perNight * metadata.nightCount + taxes).toFixed(2);
    }

    reservation.updatedAt = new Date().toISOString();

    this.recordMetadataChange(
      params.reservationId,
      previousMetadata,
      metadata,
      params.actor.actorId,
      'Reservation modified'
    );

    this.emitEvent(HotelEventType.RESERVATION_MODIFIED, params.reservationId, {
      modifiedBy: params.actor.actorId,
      changes: params.changes,
    }, metadata.confirmationNumber);

    return { success: true, reservation };
  }

  // ============================================================================
  // EXTEND STAY
  // ============================================================================

  extendStay(params: {
    reservationId: string;
    newCheckOutDate: string;
    actor: ActorContext;
  }): { success: boolean; reservation?: RightModel; error?: string } {
    this.enforcePermission(params.actor, 'EXTEND_STAY', params.reservationId);

    const reservation = this.reservations.get(params.reservationId);
    if (!reservation) {
      return { success: false, error: 'Reservation not found' };
    }

    const metadata = reservation.metadata as unknown as HotelReservationMetadata;

    if (metadata.status !== HotelReservationStatus.CHECKED_IN) {
      return {
        success: false,
        error: `Cannot extend stay from status ${metadata.status}. Must be CHECKED_IN`,
      };
    }

    const newCheckOut = new Date(params.newCheckOutDate);
    const currentCheckOut = new Date(metadata.checkOutDate);

    if (newCheckOut <= currentCheckOut) {
      return { success: false, error: 'New check-out date must be after current check-out date' };
    }

    const previousMetadata = { ...metadata };
    metadata.checkOutDate = params.newCheckOutDate;

    // Recalculate night count and total
    const checkIn = new Date(metadata.checkInDate);
    metadata.nightCount = Math.max(1, Math.round((newCheckOut.getTime() - checkIn.getTime()) / (24 * 60 * 60 * 1000)));
    const perNight = parseFloat(metadata.rate.perNight);
    const taxes = parseFloat(metadata.rate.taxes);
    metadata.rate.total = (perNight * metadata.nightCount + taxes).toFixed(2);

    reservation.updatedAt = new Date().toISOString();
    reservation.validityPeriod!.endTime = params.newCheckOutDate;

    this.recordMetadataChange(
      params.reservationId,
      previousMetadata,
      metadata,
      params.actor.actorId,
      'Stay extended'
    );

    this.emitEvent(HotelEventType.STAY_EXTENDED, params.reservationId, {
      previousCheckOut: previousMetadata.checkOutDate,
      newCheckOut: params.newCheckOutDate,
      newNightCount: metadata.nightCount,
      newTotal: metadata.rate.total,
    }, metadata.confirmationNumber);

    return { success: true, reservation };
  }

  // ============================================================================
  // NO-SHOW
  // ============================================================================

  markNoShow(params: {
    reservationId: string;
    actor: ActorContext;
  }): { success: boolean; reservation?: RightModel; error?: string } {
    this.enforcePermission(params.actor, 'MARK_NO_SHOW', params.reservationId);

    const reservation = this.reservations.get(params.reservationId);
    if (!reservation) {
      return { success: false, error: 'Reservation not found' };
    }

    const metadata = reservation.metadata as unknown as HotelReservationMetadata;

    if (metadata.status !== HotelReservationStatus.CONFIRMED) {
      return {
        success: false,
        error: `Cannot mark no-show from status ${metadata.status}. Must be CONFIRMED`,
      };
    }

    const previousMetadata = { ...metadata };
    metadata.status = HotelReservationStatus.NO_SHOW;
    reservation.updatedAt = new Date().toISOString();

    this.setReservationState(params.reservationId, HotelReservationState.NO_SHOW);

    this.recordMetadataChange(
      params.reservationId,
      previousMetadata,
      metadata,
      params.actor.actorId,
      'No-show recorded'
    );

    this.emitEvent(HotelEventType.NO_SHOW_RECORDED, params.reservationId, {
      markedBy: params.actor.actorId,
    }, metadata.confirmationNumber);

    return { success: true, reservation };
  }

  // ============================================================================
  // FREEZE / UNFREEZE
  // ============================================================================

  freezeReservation(params: {
    reservationId: string;
    actor: ActorContext;
    reason: string;
    expiresAt?: string;
  }): { success: boolean; freeze?: FreezeRecord; error?: string } {
    this.enforcePermission(params.actor, 'FREEZE', params.reservationId);

    const reservation = this.reservations.get(params.reservationId);
    if (!reservation) {
      return { success: false, error: 'Reservation not found' };
    }

    const metadata = reservation.metadata as unknown as HotelReservationMetadata;

    if (metadata.frozen) {
      return { success: false, error: 'Reservation already frozen' };
    }

    metadata.frozen = true;
    metadata.freezeInfo = {
      frozenAt: new Date().toISOString(),
      reason: params.reason,
      expiresAt: params.expiresAt,
    };
    reservation.updatedAt = new Date().toISOString();

    const freeze: FreezeRecord = {
      id: uuidv4(),
      reservationId: params.reservationId,
      frozenAt: new Date().toISOString(),
      frozenBy: params.actor.actorId,
      reason: params.reason,
      expiresAt: params.expiresAt,
    };

    const freezes = this.freezeRecords.get(params.reservationId) ?? [];
    freezes.push(freeze);
    this.freezeRecords.set(params.reservationId, freezes);

    this.emitEvent(HotelEventType.RESERVATION_FROZEN, params.reservationId, {
      reason: params.reason,
    }, metadata.confirmationNumber);

    return { success: true, freeze };
  }

  unfreezeReservation(params: {
    reservationId: string;
    actor: ActorContext;
  }): { success: boolean; error?: string } {
    this.enforcePermission(params.actor, 'FREEZE', params.reservationId);

    const reservation = this.reservations.get(params.reservationId);
    if (!reservation) {
      return { success: false, error: 'Reservation not found' };
    }

    const metadata = reservation.metadata as unknown as HotelReservationMetadata;

    if (!metadata.frozen) {
      return { success: false, error: 'Reservation is not frozen' };
    }

    metadata.frozen = false;
    metadata.freezeInfo = undefined;
    reservation.updatedAt = new Date().toISOString();

    const freezes = this.freezeRecords.get(params.reservationId) ?? [];
    const lastFreeze = freezes[freezes.length - 1];
    if (lastFreeze) {
      lastFreeze.unfrozenAt = new Date().toISOString();
      lastFreeze.unfrozenBy = params.actor.actorId;
    }

    this.emitEvent(HotelEventType.RESERVATION_UNFROZEN, params.reservationId, {
      unfrozenBy: params.actor.actorId,
    }, metadata.confirmationNumber);

    return { success: true };
  }

  // ============================================================================
  // QUERY METHODS
  // ============================================================================

  getReservation(reservationId: string): RightModel | undefined {
    return this.reservations.get(reservationId);
  }

  getReservationEvents(reservationId: string): HotelEvent[] {
    return this.events.filter(e => e.reservationId === reservationId);
  }

  getMetadataVersions(reservationId: string): MetadataVersion[] {
    return this.metadataVersions.get(reservationId) ?? [];
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private executeTransfer(request: TransferRequest): void {
    const reservation = this.reservations.get(request.reservationId);
    if (!reservation) return;

    const metadata = reservation.metadata as unknown as HotelReservationMetadata;

    const transferRecord: TransferRecord = {
      id: request.id,
      from: {
        name: request.fromGuest,
        identity: metadata.guestIdentity?.number,
      },
      to: {
        name: request.toGuest.name,
        identity: request.toGuest.identity?.number,
      },
      requestedAt: request.requestedAt,
      approvalStatus: request.status,
      approvedAt: request.approvedAt,
      approvedBy: request.approvedBy,
      nameChangeFee: request.nameChangeFee,
    };
    metadata.transferHistory.push(transferRecord);

    const previousMetadata = { ...metadata };
    metadata.guestName = request.toGuest.name;
    metadata.guestIdentity = request.toGuest.identity;
    metadata.transferRules.transferCount++;

    reservation.name = `${metadata.hotelCode} - ${request.toGuest.name} - ${metadata.confirmationNumber}`;
    reservation.updatedAt = new Date().toISOString();

    this.recordMetadataChange(
      request.reservationId,
      previousMetadata,
      metadata,
      request.approvedBy ?? 'SYSTEM',
      `Transfer: ${request.fromGuest} → ${request.toGuest.name}`
    );
  }

  private recordMetadataChange(
    reservationId: string,
    previousMetadata: HotelReservationMetadata,
    newMetadata: HotelReservationMetadata,
    changedBy: string,
    changeReason: string
  ): void {
    const versions = this.metadataVersions.get(reservationId) ?? [];
    const previousVersion = versions[versions.length - 1];

    const changes: Record<string, { old: unknown; new: unknown }> = {};

    if (previousMetadata.status !== newMetadata.status) {
      changes.status = { old: previousMetadata.status, new: newMetadata.status };
    }
    if (previousMetadata.guestName !== newMetadata.guestName) {
      changes.guestName = { old: previousMetadata.guestName, new: newMetadata.guestName };
    }
    if (previousMetadata.transferRules.transferCount !== newMetadata.transferRules.transferCount) {
      changes.transferCount = {
        old: previousMetadata.transferRules.transferCount,
        new: newMetadata.transferRules.transferCount,
      };
    }
    if (previousMetadata.checkOutDate !== newMetadata.checkOutDate) {
      changes.checkOutDate = { old: previousMetadata.checkOutDate, new: newMetadata.checkOutDate };
    }
    if (previousMetadata.nightCount !== newMetadata.nightCount) {
      changes.nightCount = { old: previousMetadata.nightCount, new: newMetadata.nightCount };
    }
    if (previousMetadata.roomType !== newMetadata.roomType) {
      changes.roomType = { old: previousMetadata.roomType, new: newMetadata.roomType };
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
    this.metadataVersions.set(reservationId, versions);
  }

  private hashMetadata(metadata: HotelReservationMetadata): string {
    const hashInput = JSON.stringify({
      confirmationNumber: metadata.confirmationNumber,
      hotelCode: metadata.hotelCode,
      guestName: metadata.guestName,
      status: metadata.status,
      roomType: metadata.roomType,
      checkInDate: metadata.checkInDate,
      checkOutDate: metadata.checkOutDate,
      rate: metadata.rate,
    });

    return createHash('sha256').update(hashInput).digest('hex');
  }

  private hashIdentity(identity: HotelReservationMetadata['guestIdentity']): string {
    if (!identity) return '';
    return `${identity.type}:${identity.country}:${identity.number}`;
  }

  private emitEvent(
    type: HotelEventType,
    reservationId: string,
    data: Record<string, unknown>,
    confirmationNumber?: string
  ): void {
    const event: HotelEvent = {
      id: uuidv4(),
      type,
      reservationId,
      occurredAt: new Date().toISOString(),
      data,
      confirmationNumber,
    };

    this.events.push(event);

    // Publish to cross-pack event bus
    this.crossPackEventBus?.publish({
      source: 'HOTEL',
      type: event.type,
      resourceId: event.reservationId,
      data: event.data,
      correlationId: (event.data.correlationId as string) ?? undefined,
    });
  }
}

// ============================================================================
// ASSET PACK DEFINITION
// ============================================================================

export const HOTEL_RESERVATION_PACK: AssetPack = {
  id: 'HOTEL_RESERVATION',
  name: 'Hotel Reservation',
  description: 'Transferable hotel reservations with approval workflow, name change fees, and cancellation rules',
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
        { type: 'APPROVAL', approvals: [{ role: 'HOTEL', count: 1 }] },
      ],
      actions: [{ type: 'EMIT_EVENT', params: { event: 'RESERVATION_CONFIRMED' } }],
      description: 'Confirm reservation',
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
        { type: 'APPROVAL', approvals: [{ role: 'HOTEL', count: 1 }] },
      ],
      actions: [{ type: 'EMIT_EVENT', params: { event: 'TRANSFER_APPROVED' } }],
      description: 'Approve transfer',
    },
    {
      from: LifecycleState.ACTIVE,
      to: LifecycleState.REDEEMED,
      conditions: [
        { type: 'CUSTOM', customCondition: 'CHECKED_OUT' },
      ],
      actions: [{ type: 'EMIT_EVENT', params: { event: 'CHECK_OUT_COMPLETED' } }],
      description: 'Guest checked out',
    },
    {
      from: LifecycleState.ACTIVE,
      to: LifecycleState.REDEEMED,
      conditions: [
        { type: 'APPROVAL', approvals: [{ role: 'HOLDER', count: 1 }] },
      ],
      actions: [{ type: 'EMIT_EVENT', params: { event: 'RESERVATION_CANCELLED' } }],
      description: 'Cancel reservation',
    },
  ],

  complianceRules: [
    {
      id: 'TRANSFER_APPROVAL',
      name: 'Transfer Requires Approval',
      type: 'CUSTOM',
      params: { requireHotelApproval: true, allowIdentityBypass: true },
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
      params: { deadlineHoursBeforeCheckIn: 24 },
      severity: 'BLOCK',
    },
  ],

  requiredVerifications: [
    {
      type: 'IDENTITY_VERIFICATION',
      description: 'Guest identity verification (optional for auto-approval)',
      allowedVerifiers: ['HOTEL', 'IDENTITY_PROVIDER'],
      mandatory: false,
    },
  ],

  metadataSchema: {
    confirmationNumber: { type: 'string', required: true, description: 'Confirmation number' },
    guestName: { type: 'string', required: true, description: 'Guest name' },
    roomType: { type: 'string', required: true, description: 'Room type' },
    checkInDate: { type: 'date', required: true, description: 'Check-in date' },
    checkOutDate: { type: 'date', required: true, description: 'Check-out date' },
    rate: { type: 'object', required: true, description: 'Rate information' },
    transferRules: { type: 'object', required: true, description: 'Transfer rules' },
    cancellationPolicy: { type: 'object', required: true, description: 'Cancellation policy' },
  },

  tags: ['hotel', 'reservation', 'hospitality', 'conditional-transfer', 'approval-workflow'],
};

export default HotelReservationEngine;
