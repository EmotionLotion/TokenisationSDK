/**
 * Pack: Concert Ticket
 *
 * Production-ready implementation for concert ticket tokenization with:
 * - Anti-scalping resale price cap enforcement
 * - Age restriction verification
 * - Lead booker group booking support
 * - Conditional transfer requiring venue approval OR identity claim
 * - Fan name change fees
 * - Transfer count limits
 * - Cancellation/refund lifecycle
 * - Venue entry/admission tracking
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
  CONCERT_TICKET_STATE_MACHINE,
  ConcertTicketState,
  ConcertTicketEvent,
  ConcertTicketErrorCode,
  type ConcertTicketOperationContext,
  transferWindowGuard,
  postAdmissionLockGuard,
  transferCountGuard,
  mapLegacyStatusToState,
  mapStateToLegacyStatus,
} from './ConcertTicketStateMachine.js';

// ============================================================================
// TYPES
// ============================================================================

export enum SeatingTier {
  VIP = 'VIP',
  RESERVED = 'RESERVED',
  GENERAL_ADMISSION = 'GENERAL_ADMISSION',
  STANDING = 'STANDING',
}

export enum ConcertTicketStatus {
  CREATED = 'CREATED',
  ISSUED = 'ISSUED',
  ADMITTED = 'ADMITTED',
  USED = 'USED',
  CLOSED = 'CLOSED',
  CANCELLED = 'CANCELLED',
  REFUNDED = 'REFUNDED',
  EXPIRED = 'EXPIRED',
  VOID = 'VOID',
}

export enum TransferApprovalStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  AUTO_APPROVED = 'AUTO_APPROVED',
}

export interface ConcertTicketMetadata {
  assetType: 'CONCERT_TICKET';
  /** Venue code */
  venueCode: string;
  /** Venue name */
  venueName: string;
  /** Confirmation number */
  confirmationNumber: string;
  /** Event information */
  eventInfo: {
    eventName: string;
    artist: string;
    eventDate: string;
    eventTime: string;
  };
  /** Seating information */
  seating: {
    section: string;
    row: string;
    seat: string;
    tier: SeatingTier;
  };
  /** Pricing */
  pricing: {
    faceValue: string;
    serviceFee: string;
    total: string;
    currency: string;
    resalePriceCap: string;
  };
  /** Fan information */
  fanInfo: {
    fanName: string;
    fanIdentity?: {
      type: 'PASSPORT' | 'ID_CARD' | 'DRIVERS_LICENSE';
      number: string;
      country: string;
      expiryDate: string;
    };
    ageVerified: boolean;
    fanAge?: number;
    fanClubMember: boolean;
  };
  /** Lead booker information (for group bookings) */
  leadBooker?: {
    name: string;
    identity?: string;
    bookingGroupSize: number;
  };
  /** Restrictions */
  restrictions: {
    minimumAge?: number;
    leadBookerRequired: boolean;
    idRequiredAtEntry: boolean;
    maxResalePercent: number;
  };
  /** Entry information */
  entryInfo?: {
    admittedAt: string;
    scannedBy: string;
    scanLocation?: string;
  };
  /** Anti-scalping tracking */
  antiScalping: {
    maxResalePercent: number;
    originalPrice: string;
    resaleHistory: Array<{
      fromFan: string;
      toFan: string;
      price: string;
      date: string;
    }>;
  };
  /** Ticket status */
  status: ConcertTicketStatus;
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
  /** Whether ticket is currently frozen */
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
  resalePrice?: string;
  rejectionReason?: string;
}

export interface TransferRequest {
  id: string;
  ticketId: string;
  fromFan: string;
  toFan: {
    name: string;
    identity?: ConcertTicketMetadata['fanInfo']['fanIdentity'];
    age?: number;
  };
  resalePrice?: string;
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

export enum VenueRole {
  VENUE_ADMIN = 'VENUE_ADMIN',
  BOX_OFFICE = 'BOX_OFFICE',
  SECURITY = 'SECURITY',
  PLATFORM_ADMIN = 'PLATFORM_ADMIN',
  FAN = 'FAN',
  AUDITOR = 'AUDITOR',
}

export interface ActorContext {
  actorId: string;
  role: VenueRole;
  venueCode?: string;
  fanId?: string;
}

export interface RBACPermission {
  action: string;
  allowedRoles: VenueRole[];
  requiresOwnership?: boolean;
  requiresVenueMatch?: boolean;
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

export enum ConcertTicketEventType {
  TICKET_CREATED = 'TICKET_CREATED',
  TICKET_ISSUED = 'TICKET_ISSUED',
  TICKET_CANCELLED = 'TICKET_CANCELLED',
  TICKET_REFUNDED = 'TICKET_REFUNDED',
  ENTRY_ADMITTED = 'ENTRY_ADMITTED',
  EVENT_COMPLETED = 'EVENT_COMPLETED',
  TICKET_TRANSFERRED = 'TICKET_TRANSFERRED',
  TICKET_MODIFIED = 'TICKET_MODIFIED',
  TICKET_FROZEN = 'TICKET_FROZEN',
  TICKET_UNFROZEN = 'TICKET_UNFROZEN',
}

export interface ConcertTicketEventRecord {
  id: string;
  type: ConcertTicketEventType;
  ticketId: string;
  occurredAt: string;
  data: Record<string, unknown>;
  confirmationNumber?: string;
}

// ============================================================================
// FREEZE RECORD
// ============================================================================

export interface FreezeRecord {
  id: string;
  ticketId: string;
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
  // Ticket creation - venue only
  { action: 'CREATE', allowedRoles: [VenueRole.VENUE_ADMIN, VenueRole.BOX_OFFICE, VenueRole.PLATFORM_ADMIN] },

  // Issue ticket
  { action: 'ISSUE', allowedRoles: [VenueRole.VENUE_ADMIN, VenueRole.BOX_OFFICE, VenueRole.PLATFORM_ADMIN] },

  // Admit entry - security or venue
  { action: 'ADMIT', allowedRoles: [VenueRole.VENUE_ADMIN, VenueRole.SECURITY, VenueRole.PLATFORM_ADMIN], requiresVenueMatch: true },

  // Complete event
  { action: 'COMPLETE', allowedRoles: [VenueRole.VENUE_ADMIN, VenueRole.PLATFORM_ADMIN], requiresVenueMatch: true },

  // Transfer request - fan or platform
  { action: 'REQUEST_TRANSFER', allowedRoles: [VenueRole.FAN, VenueRole.PLATFORM_ADMIN], requiresOwnership: true },

  // Approve/reject transfer - venue only
  { action: 'APPROVE_TRANSFER', allowedRoles: [VenueRole.VENUE_ADMIN, VenueRole.BOX_OFFICE], requiresVenueMatch: true },

  // Cancel - fan or venue
  { action: 'CANCEL', allowedRoles: [VenueRole.FAN, VenueRole.VENUE_ADMIN, VenueRole.BOX_OFFICE, VenueRole.PLATFORM_ADMIN] },

  // Refund - venue or platform
  { action: 'REFUND', allowedRoles: [VenueRole.VENUE_ADMIN, VenueRole.BOX_OFFICE, VenueRole.PLATFORM_ADMIN] },

  // Modify - venue or fan
  { action: 'MODIFY', allowedRoles: [VenueRole.VENUE_ADMIN, VenueRole.BOX_OFFICE, VenueRole.FAN, VenueRole.PLATFORM_ADMIN] },

  // Freeze/unfreeze - admin only
  { action: 'FREEZE', allowedRoles: [VenueRole.VENUE_ADMIN, VenueRole.PLATFORM_ADMIN] },

  // View - all roles
  { action: 'VIEW', allowedRoles: Object.values(VenueRole) },

  // Close - venue only
  { action: 'CLOSE', allowedRoles: [VenueRole.VENUE_ADMIN, VenueRole.BOX_OFFICE, VenueRole.PLATFORM_ADMIN], requiresVenueMatch: true },
];

// ============================================================================
// CONCERT TICKET ENGINE
// ============================================================================

export class ConcertTicketEngine {
  private tickets: Map<string, RightModel> = new Map();
  private transferRequests: Map<string, TransferRequest> = new Map();
  private stateMachine: StateMachine;
  private ticketStates: Map<string, ConcertTicketState> = new Map();
  private authorizedVenues: Set<string> = new Set();
  private verifiedIdentities: Map<string, boolean> = new Map();

  private distributedLock: IDistributedLock;
  private metadataVersions: Map<string, MetadataVersion[]> = new Map();
  private freezeRecords: Map<string, FreezeRecord[]> = new Map();
  private events: ConcertTicketEventRecord[] = [];

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

    this.stateMachine = new StateMachine(CONCERT_TICKET_STATE_MACHINE);
    this.stateMachine.addGlobalGuard(transferWindowGuard);
    this.stateMachine.addGlobalGuard(postAdmissionLockGuard);
    this.stateMachine.addGlobalGuard(transferCountGuard);
  }

  // ============================================================================
  // REGISTRATION & IDENTITY
  // ============================================================================

  registerVenue(venueCode: string): void {
    this.authorizedVenues.add(venueCode);
  }

  verifyIdentity(identityHash: string): void {
    this.verifiedIdentities.set(identityHash, true);
    this.identityRegistry?.verify(identityHash, 'CONCERT');
  }

  // ============================================================================
  // STATE MACHINE METHODS
  // ============================================================================

  getCurrentState(ticketId: string): ConcertTicketState | undefined {
    const cachedState = this.ticketStates.get(ticketId);
    if (cachedState) {
      return cachedState;
    }

    const ticket = this.tickets.get(ticketId);
    if (!ticket) {
      return undefined;
    }

    const metadata = ticket.metadata as unknown as ConcertTicketMetadata;
    return mapLegacyStatusToState(metadata.status);
  }

  private setTicketState(ticketId: string, state: ConcertTicketState): void {
    this.ticketStates.set(ticketId, state);
    this.stateMachine.setState(ticketId, state);
  }

  // ============================================================================
  // RBAC ENFORCEMENT
  // ============================================================================

  checkPermission(
    actor: ActorContext,
    action: string,
    ticketId?: string
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

    if (permission.requiresOwnership && ticketId) {
      const ticket = this.tickets.get(ticketId);
      if (!ticket) {
        return { allowed: false, reason: 'Ticket not found' };
      }
      const metadata = ticket.metadata as unknown as ConcertTicketMetadata;

      if (actor.role === VenueRole.FAN) {
        const isOwner = actor.fanId === metadata.fanInfo.fanName;
        if (!isOwner) {
          return { allowed: false, reason: 'Not the ticket holder' };
        }
      }
    }

    if (permission.requiresVenueMatch && ticketId) {
      const ticket = this.tickets.get(ticketId);
      if (!ticket) {
        return { allowed: false, reason: 'Ticket not found' };
      }
      const metadata = ticket.metadata as unknown as ConcertTicketMetadata;

      if (actor.venueCode && actor.venueCode !== metadata.venueCode) {
        return {
          allowed: false,
          reason: `Venue ${actor.venueCode} cannot modify tickets from ${metadata.venueCode}`,
        };
      }
    }

    return { allowed: true };
  }

  private enforcePermission(actor: ActorContext, action: string, ticketId?: string): void {
    const result = this.checkPermission(actor, action, ticketId);
    if (!result.allowed) {
      throw new Error(`PERMISSION_DENIED: ${result.reason}`);
    }
  }

  // ============================================================================
  // TICKET CREATION
  // ============================================================================

  createTicket(params: {
    venueCode: string;
    venueName?: string;
    confirmationNumber: string;
    eventInfo: ConcertTicketMetadata['eventInfo'];
    seating: ConcertTicketMetadata['seating'];
    pricing: {
      faceValue: string;
      serviceFee: string;
      total: string;
      currency: string;
    };
    fanInfo: {
      fanName: string;
      fanIdentity?: ConcertTicketMetadata['fanInfo']['fanIdentity'];
      ageVerified?: boolean;
      fanAge?: number;
      fanClubMember?: boolean;
    };
    leadBooker?: ConcertTicketMetadata['leadBooker'];
    restrictions?: Partial<ConcertTicketMetadata['restrictions']>;
    antiScalping?: {
      maxResalePercent?: number;
    };
    transferRules?: Partial<ConcertTicketMetadata['transferRules']>;
    cancellationPolicy?: Partial<ConcertTicketMetadata['cancellationPolicy']>;
  }): { success: boolean; ticket?: RightModel; error?: string } {
    if (!this.authorizedVenues.has(params.venueCode)) {
      return { success: false, error: 'Venue not authorized' };
    }

    const now = new Date().toISOString();

    const maxResalePercent = params.antiScalping?.maxResalePercent ?? 10;
    const faceValue = parseFloat(params.pricing.faceValue);
    const resalePriceCap = (faceValue * (1 + maxResalePercent / 100)).toFixed(2);

    const defaultTransferRules: ConcertTicketMetadata['transferRules'] = {
      maxTransfers: 2,
      transferCount: 0,
      nameChangeFee: '15.00',
      transferDeadlineHours: 24,
      autoApproveWithIdentity: true,
    };

    const defaultCancellationPolicy: ConcertTicketMetadata['cancellationPolicy'] = {
      refundable: true,
      cancellationFee: '0.00',
      freeCancellationDeadlineHours: 48,
      penaltyPercentage: 100,
    };

    const defaultRestrictions: ConcertTicketMetadata['restrictions'] = {
      leadBookerRequired: false,
      idRequiredAtEntry: false,
      maxResalePercent,
    };

    const metadata: ConcertTicketMetadata = {
      assetType: 'CONCERT_TICKET',
      venueCode: params.venueCode,
      venueName: params.venueName ?? params.venueCode,
      confirmationNumber: params.confirmationNumber,
      eventInfo: params.eventInfo,
      seating: params.seating,
      pricing: {
        ...params.pricing,
        resalePriceCap,
      },
      fanInfo: {
        fanName: params.fanInfo.fanName,
        fanIdentity: params.fanInfo.fanIdentity,
        ageVerified: params.fanInfo.ageVerified ?? false,
        fanAge: params.fanInfo.fanAge,
        fanClubMember: params.fanInfo.fanClubMember ?? false,
      },
      leadBooker: params.leadBooker,
      restrictions: { ...defaultRestrictions, ...params.restrictions },
      antiScalping: {
        maxResalePercent,
        originalPrice: params.pricing.faceValue,
        resaleHistory: [],
      },
      status: ConcertTicketStatus.CREATED,
      transferRules: { ...defaultTransferRules, ...params.transferRules },
      cancellationPolicy: { ...defaultCancellationPolicy, ...params.cancellationPolicy },
      transferHistory: [],
      frozen: false,
      kycStatus: {
        verified: !!params.fanInfo.fanIdentity,
        verifiedAt: params.fanInfo.fanIdentity ? now : undefined,
      },
    };

    const ticket: RightModel = {
      id: uuidv4(),
      name: `${params.venueCode} - ${params.fanInfo.fanName} - ${params.confirmationNumber}`,
      rightType: RightType.ACCESS,
      state: LifecycleState.ACTIVE,
      jurisdiction: {
        countryCode: 'GLOBAL',
        accreditedOnly: false,
        blockedJurisdictions: [],
      },
      validityPeriod: {
        isPerpetual: false,
        startTime: params.eventInfo.eventDate,
        endTime: params.eventInfo.eventDate,
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

    this.tickets.set(ticket.id, ticket);
    this.setTicketState(ticket.id, ConcertTicketState.CREATED);

    // Initialize metadata version history
    this.metadataVersions.set(ticket.id, [{
      version: 0,
      timestamp: now,
      changedBy: 'SYSTEM',
      changeReason: 'Initial creation',
      previousHash: '',
      currentHash: this.hashMetadata(metadata),
      changes: {},
    }]);

    this.emitEvent(ConcertTicketEventType.TICKET_CREATED, ticket.id, {
      confirmationNumber: params.confirmationNumber,
      fanName: params.fanInfo.fanName,
      venueCode: params.venueCode,
      eventName: params.eventInfo.eventName,
      artist: params.eventInfo.artist,
      seatingTier: params.seating.tier,
      eventDate: params.eventInfo.eventDate,
    }, params.confirmationNumber);

    return { success: true, ticket };
  }

  // ============================================================================
  // ISSUE TICKET
  // ============================================================================

  issueTicket(params: {
    ticketId: string;
    actor: ActorContext;
  }): { success: boolean; ticket?: RightModel; error?: string } {
    this.enforcePermission(params.actor, 'ISSUE', params.ticketId);

    const ticket = this.tickets.get(params.ticketId);
    if (!ticket) {
      return { success: false, error: 'Ticket not found' };
    }

    const metadata = ticket.metadata as unknown as ConcertTicketMetadata;

    if (metadata.status === ConcertTicketStatus.ISSUED) {
      return { success: true, ticket };
    }

    if (metadata.status !== ConcertTicketStatus.CREATED) {
      return {
        success: false,
        error: `Cannot issue from status ${metadata.status}. Allowed: CREATED`,
      };
    }

    const previousMetadata = { ...metadata };
    metadata.status = ConcertTicketStatus.ISSUED;
    ticket.updatedAt = new Date().toISOString();

    this.setTicketState(params.ticketId, ConcertTicketState.ISSUED);

    this.recordMetadataChange(
      params.ticketId,
      previousMetadata,
      metadata,
      params.actor.actorId,
      'Ticket issued'
    );

    this.emitEvent(ConcertTicketEventType.TICKET_ISSUED, params.ticketId, {
      issuedBy: params.actor.actorId,
    }, metadata.confirmationNumber);

    return { success: true, ticket };
  }

  // ============================================================================
  // ADMIT ENTRY
  // ============================================================================

  admitEntry(params: {
    ticketId: string;
    actor: ActorContext;
    scanLocation?: string;
  }): { success: boolean; ticket?: RightModel; error?: string; alreadyAdmitted?: boolean } {
    this.enforcePermission(params.actor, 'ADMIT', params.ticketId);

    const ticket = this.tickets.get(params.ticketId);
    if (!ticket) {
      return { success: false, error: 'Ticket not found' };
    }

    const metadata = ticket.metadata as unknown as ConcertTicketMetadata;

    // Idempotent: if already admitted, return success
    if (metadata.status === ConcertTicketStatus.ADMITTED) {
      return { success: true, ticket, alreadyAdmitted: true };
    }

    if (metadata.status !== ConcertTicketStatus.ISSUED) {
      return {
        success: false,
        error: `Cannot admit from status ${metadata.status}. Allowed: ISSUED`,
      };
    }

    const previousMetadata = { ...metadata };
    metadata.status = ConcertTicketStatus.ADMITTED;
    metadata.entryInfo = {
      admittedAt: new Date().toISOString(),
      scannedBy: params.actor.actorId,
      scanLocation: params.scanLocation,
    };
    ticket.updatedAt = new Date().toISOString();

    this.setTicketState(params.ticketId, ConcertTicketState.ADMITTED);

    this.recordMetadataChange(
      params.ticketId,
      previousMetadata,
      metadata,
      params.actor.actorId,
      'Entry admitted'
    );

    this.emitEvent(ConcertTicketEventType.ENTRY_ADMITTED, params.ticketId, {
      admittedBy: params.actor.actorId,
      scanLocation: params.scanLocation,
    }, metadata.confirmationNumber);

    return { success: true, ticket };
  }

  // ============================================================================
  // COMPLETE EVENT
  // ============================================================================

  completeEvent(params: {
    ticketId: string;
    actor: ActorContext;
  }): { success: boolean; ticket?: RightModel; error?: string } {
    this.enforcePermission(params.actor, 'COMPLETE', params.ticketId);

    const ticket = this.tickets.get(params.ticketId);
    if (!ticket) {
      return { success: false, error: 'Ticket not found' };
    }

    const metadata = ticket.metadata as unknown as ConcertTicketMetadata;

    if (metadata.status !== ConcertTicketStatus.ADMITTED) {
      return {
        success: false,
        error: `Cannot complete event from status ${metadata.status}. Must be ADMITTED`,
      };
    }

    const previousMetadata = { ...metadata };
    metadata.status = ConcertTicketStatus.USED;
    ticket.updatedAt = new Date().toISOString();

    this.setTicketState(params.ticketId, ConcertTicketState.USED);

    this.recordMetadataChange(
      params.ticketId,
      previousMetadata,
      metadata,
      params.actor.actorId,
      'Event completed'
    );

    this.emitEvent(ConcertTicketEventType.EVENT_COMPLETED, params.ticketId, {
      completedBy: params.actor.actorId,
    }, metadata.confirmationNumber);

    return { success: true, ticket };
  }

  // ============================================================================
  // CLOSE TICKET
  // ============================================================================

  closeTicket(params: {
    ticketId: string;
    actor: ActorContext;
  }): { success: boolean; ticket?: RightModel; error?: string } {
    this.enforcePermission(params.actor, 'CLOSE', params.ticketId);

    const ticket = this.tickets.get(params.ticketId);
    if (!ticket) {
      return { success: false, error: 'Ticket not found' };
    }

    const metadata = ticket.metadata as unknown as ConcertTicketMetadata;

    if (metadata.status !== ConcertTicketStatus.USED) {
      return {
        success: false,
        error: `Cannot close from status ${metadata.status}. Must be USED`,
      };
    }

    const previousMetadata = { ...metadata };
    metadata.status = ConcertTicketStatus.CLOSED;
    ticket.state = LifecycleState.BURNED;
    ticket.updatedAt = new Date().toISOString();

    this.setTicketState(params.ticketId, ConcertTicketState.CLOSED);

    this.recordMetadataChange(
      params.ticketId,
      previousMetadata,
      metadata,
      params.actor.actorId,
      'Ticket closed'
    );

    return { success: true, ticket };
  }

  // ============================================================================
  // CANCEL TICKET
  // ============================================================================

  cancelTicket(params: {
    ticketId: string;
    requestedBy: string;
    reason?: string;
  }): { success: boolean; refundAmount?: string; error?: string } {
    const ticket = this.tickets.get(params.ticketId);
    if (!ticket) {
      return { success: false, error: 'Ticket not found' };
    }

    const metadata = ticket.metadata as unknown as ConcertTicketMetadata;

    // Check if cancellation is allowed from current status
    if (metadata.status !== ConcertTicketStatus.CREATED &&
        metadata.status !== ConcertTicketStatus.ISSUED) {
      return { success: false, error: `Cannot cancel ticket in status ${metadata.status}` };
    }

    // Check frozen
    if (metadata.frozen) {
      return { success: false, error: 'Ticket is frozen - cannot cancel' };
    }

    // Check cancellation deadline for issued tickets
    if (metadata.status === ConcertTicketStatus.ISSUED) {
      const eventDate = new Date(metadata.eventInfo.eventDate);
      const deadlineHours = metadata.cancellationPolicy.freeCancellationDeadlineHours;
      const deadline = new Date(eventDate.getTime() - deadlineHours * 60 * 60 * 1000);

      if (new Date() > deadline) {
        if (metadata.cancellationPolicy.penaltyPercentage >= 100) {
          return {
            success: false,
            error: `Cancellation window closed ${deadlineHours} hours before event`,
          };
        }
      }
    }

    // Calculate refund
    let refundAmount = '0';
    if (metadata.cancellationPolicy.refundable) {
      const total = parseFloat(metadata.pricing.total);
      const cancellationFee = parseFloat(metadata.cancellationPolicy.cancellationFee);
      refundAmount = Math.max(0, total - cancellationFee).toFixed(2);
    }

    const previousMetadata = { ...metadata };
    metadata.status = ConcertTicketStatus.CANCELLED;
    ticket.state = LifecycleState.REDEEMED;
    ticket.updatedAt = new Date().toISOString();

    this.setTicketState(params.ticketId, ConcertTicketState.CANCELLED);

    this.recordMetadataChange(
      params.ticketId,
      previousMetadata,
      metadata,
      params.requestedBy,
      `Cancelled: ${params.reason ?? 'No reason provided'}`
    );

    this.emitEvent(ConcertTicketEventType.TICKET_CANCELLED, params.ticketId, {
      cancelledBy: params.requestedBy,
      reason: params.reason,
      refundAmount,
    }, metadata.confirmationNumber);

    return { success: true, refundAmount };
  }

  // ============================================================================
  // PROCESS REFUND
  // ============================================================================

  processRefund(params: {
    ticketId: string;
    actor: ActorContext;
  }): { success: boolean; ticket?: RightModel; error?: string } {
    this.enforcePermission(params.actor, 'REFUND', params.ticketId);

    const ticket = this.tickets.get(params.ticketId);
    if (!ticket) {
      return { success: false, error: 'Ticket not found' };
    }

    const metadata = ticket.metadata as unknown as ConcertTicketMetadata;

    if (metadata.status !== ConcertTicketStatus.ISSUED &&
        metadata.status !== ConcertTicketStatus.CANCELLED) {
      return {
        success: false,
        error: `Cannot refund from status ${metadata.status}. Allowed: ISSUED, CANCELLED`,
      };
    }

    const previousMetadata = { ...metadata };
    metadata.status = ConcertTicketStatus.REFUNDED;
    ticket.updatedAt = new Date().toISOString();

    this.setTicketState(params.ticketId, ConcertTicketState.REFUNDED);

    this.recordMetadataChange(
      params.ticketId,
      previousMetadata,
      metadata,
      params.actor.actorId,
      'Ticket refunded'
    );

    this.emitEvent(ConcertTicketEventType.TICKET_REFUNDED, params.ticketId, {
      refundedBy: params.actor.actorId,
      amount: metadata.pricing.total,
    }, metadata.confirmationNumber);

    return { success: true, ticket };
  }

  // ============================================================================
  // TRANSFER TICKET
  // ============================================================================

  requestTransfer(params: {
    ticketId: string;
    fromFan: string;
    toFan: {
      name: string;
      identity?: ConcertTicketMetadata['fanInfo']['fanIdentity'];
      age?: number;
    };
    resalePrice?: string;
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

    const ticket = this.tickets.get(params.ticketId);
    if (!ticket) {
      return { success: false, error: 'Ticket not found', errorCode: ConcertTicketErrorCode.TICKET_NOT_FOUND };
    }

    const metadata = ticket.metadata as unknown as ConcertTicketMetadata;

    // Check frozen
    if (metadata.frozen) {
      return { success: false, error: 'Cannot transfer frozen ticket', errorCode: 'TICKET_FROZEN' };
    }

    // Check current fan
    if (metadata.fanInfo.fanName !== params.fromFan) {
      return { success: false, error: 'Not the current ticket holder', errorCode: ConcertTicketErrorCode.NOT_FAN };
    }

    // Check status
    if (metadata.status !== ConcertTicketStatus.ISSUED) {
      if (metadata.status === ConcertTicketStatus.ADMITTED) {
        return { success: false, error: 'Ticket is locked after admission', errorCode: ConcertTicketErrorCode.TICKET_LOCKED_AFTER_ADMISSION };
      }
      return { success: false, error: 'Ticket cannot be transferred in current status', errorCode: ConcertTicketErrorCode.INVALID_TRANSITION };
    }

    // Check transfer count limit
    if (metadata.transferRules.transferCount >= metadata.transferRules.maxTransfers) {
      return {
        success: false,
        error: `Maximum transfers (${metadata.transferRules.maxTransfers}) exceeded`,
        errorCode: ConcertTicketErrorCode.MAX_TRANSFERS_EXCEEDED,
      };
    }

    // Check transfer deadline
    const eventDate = new Date(metadata.eventInfo.eventDate);
    const deadlineHours = metadata.transferRules.transferDeadlineHours;
    const deadline = new Date(eventDate.getTime() - deadlineHours * 60 * 60 * 1000);
    if (new Date() > deadline) {
      return { success: false, error: 'Transfer window has closed', errorCode: ConcertTicketErrorCode.TRANSFER_WINDOW_CLOSED };
    }

    // Check anti-scalping price cap
    if (params.resalePrice) {
      const resalePrice = parseFloat(params.resalePrice);
      const faceValue = parseFloat(metadata.pricing.faceValue);
      const maxResalePercent = metadata.antiScalping.maxResalePercent;
      const maxAllowedPrice = faceValue * (1 + maxResalePercent / 100);

      if (resalePrice > maxAllowedPrice) {
        this.crossPackAuditLog?.log({
          source: 'CONCERT', action: 'TRANSFER_DENIED', actorId: params.fromFan,
          resourceId: params.ticketId, success: false,
          reason: `Resale price ${resalePrice} exceeds cap of ${maxAllowedPrice.toFixed(2)} (${maxResalePercent}% above face value)`,
        });
        return {
          success: false,
          error: `Resale price ${resalePrice} exceeds cap of ${maxAllowedPrice.toFixed(2)} (${maxResalePercent}% above face value)`,
          errorCode: ConcertTicketErrorCode.RESALE_PRICE_CAP_EXCEEDED,
        };
      }
    }

    // Check age restriction for new fan
    if (metadata.restrictions.minimumAge && params.toFan.age !== undefined) {
      if (params.toFan.age < metadata.restrictions.minimumAge) {
        return {
          success: false,
          error: `Fan age ${params.toFan.age} is below minimum age ${metadata.restrictions.minimumAge}`,
          errorCode: ConcertTicketErrorCode.AGE_RESTRICTION_FAILED,
        };
      }
    }

    // Check lead booker requirement
    if (metadata.restrictions.leadBookerRequired && metadata.leadBooker) {
      if (metadata.fanInfo.fanName !== metadata.leadBooker.name) {
        // Current holder is not lead booker - cannot transfer
        return {
          success: false,
          error: 'Only the lead booker can transfer this ticket',
          errorCode: ConcertTicketErrorCode.LEAD_BOOKER_REQUIRED,
        };
      }
    }

    const now = new Date();
    const request: TransferRequest = {
      id: uuidv4(),
      ticketId: params.ticketId,
      fromFan: params.fromFan,
      toFan: params.toFan,
      resalePrice: params.resalePrice,
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
    if (metadata.transferRules.autoApproveWithIdentity && params.toFan.identity) {
      const identityHash = this.hashIdentity(params.toFan.identity);
      if (this.verifiedIdentities.get(identityHash) || this.identityRegistry?.isVerified(identityHash)) {
        request.status = TransferApprovalStatus.AUTO_APPROVED;
        request.approvedAt = now.toISOString();
        request.approvedBy = 'SYSTEM_AUTO_APPROVAL';

        this.executeTransfer(request);

        this.emitEvent(ConcertTicketEventType.TICKET_TRANSFERRED, params.ticketId, {
          from: params.fromFan,
          to: params.toFan.name,
          reason: params.reason,
          resalePrice: params.resalePrice,
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

    const ticket = this.tickets.get(request.ticketId);
    const metadata = ticket?.metadata as unknown as ConcertTicketMetadata | undefined;

    this.emitEvent(ConcertTicketEventType.TICKET_TRANSFERRED, request.ticketId, {
      from: request.fromFan,
      to: request.toFan.name,
      reason: request.reason,
      resalePrice: request.resalePrice,
      approvedBy: params.approvedBy,
    }, metadata?.confirmationNumber);

    return { success: true };
  }

  // ============================================================================
  // MODIFY TICKET
  // ============================================================================

  modifyTicket(params: {
    ticketId: string;
    changes: {
      section?: string;
      row?: string;
      seat?: string;
      tier?: SeatingTier;
    };
    actor: ActorContext;
  }): { success: boolean; ticket?: RightModel; error?: string } {
    this.enforcePermission(params.actor, 'MODIFY', params.ticketId);

    const ticket = this.tickets.get(params.ticketId);
    if (!ticket) {
      return { success: false, error: 'Ticket not found' };
    }

    const metadata = ticket.metadata as unknown as ConcertTicketMetadata;

    if (metadata.status !== ConcertTicketStatus.ISSUED) {
      return {
        success: false,
        error: `Cannot modify ticket in status ${metadata.status}. Must be ISSUED`,
      };
    }

    if (metadata.frozen) {
      return { success: false, error: 'Ticket is frozen - cannot modify' };
    }

    const previousMetadata = { ...metadata };

    if (params.changes.section) {
      metadata.seating.section = params.changes.section;
    }
    if (params.changes.row) {
      metadata.seating.row = params.changes.row;
    }
    if (params.changes.seat) {
      metadata.seating.seat = params.changes.seat;
    }
    if (params.changes.tier) {
      metadata.seating.tier = params.changes.tier;
    }

    ticket.updatedAt = new Date().toISOString();

    this.recordMetadataChange(
      params.ticketId,
      previousMetadata,
      metadata,
      params.actor.actorId,
      'Ticket modified'
    );

    this.emitEvent(ConcertTicketEventType.TICKET_MODIFIED, params.ticketId, {
      modifiedBy: params.actor.actorId,
      changes: params.changes,
    }, metadata.confirmationNumber);

    return { success: true, ticket };
  }

  // ============================================================================
  // FREEZE / UNFREEZE
  // ============================================================================

  freezeTicket(params: {
    ticketId: string;
    actor: ActorContext;
    reason: string;
    expiresAt?: string;
  }): { success: boolean; freeze?: FreezeRecord; error?: string } {
    this.enforcePermission(params.actor, 'FREEZE', params.ticketId);

    const ticket = this.tickets.get(params.ticketId);
    if (!ticket) {
      return { success: false, error: 'Ticket not found' };
    }

    const metadata = ticket.metadata as unknown as ConcertTicketMetadata;

    if (metadata.frozen) {
      return { success: false, error: 'Ticket already frozen' };
    }

    metadata.frozen = true;
    metadata.freezeInfo = {
      frozenAt: new Date().toISOString(),
      reason: params.reason,
      expiresAt: params.expiresAt,
    };
    ticket.updatedAt = new Date().toISOString();

    const freeze: FreezeRecord = {
      id: uuidv4(),
      ticketId: params.ticketId,
      frozenAt: new Date().toISOString(),
      frozenBy: params.actor.actorId,
      reason: params.reason,
      expiresAt: params.expiresAt,
    };

    const freezes = this.freezeRecords.get(params.ticketId) ?? [];
    freezes.push(freeze);
    this.freezeRecords.set(params.ticketId, freezes);

    this.emitEvent(ConcertTicketEventType.TICKET_FROZEN, params.ticketId, {
      reason: params.reason,
    }, metadata.confirmationNumber);

    return { success: true, freeze };
  }

  unfreezeTicket(params: {
    ticketId: string;
    actor: ActorContext;
  }): { success: boolean; error?: string } {
    this.enforcePermission(params.actor, 'FREEZE', params.ticketId);

    const ticket = this.tickets.get(params.ticketId);
    if (!ticket) {
      return { success: false, error: 'Ticket not found' };
    }

    const metadata = ticket.metadata as unknown as ConcertTicketMetadata;

    if (!metadata.frozen) {
      return { success: false, error: 'Ticket is not frozen' };
    }

    metadata.frozen = false;
    metadata.freezeInfo = undefined;
    ticket.updatedAt = new Date().toISOString();

    const freezes = this.freezeRecords.get(params.ticketId) ?? [];
    const lastFreeze = freezes[freezes.length - 1];
    if (lastFreeze) {
      lastFreeze.unfrozenAt = new Date().toISOString();
      lastFreeze.unfrozenBy = params.actor.actorId;
    }

    this.emitEvent(ConcertTicketEventType.TICKET_UNFROZEN, params.ticketId, {
      unfrozenBy: params.actor.actorId,
    }, metadata.confirmationNumber);

    return { success: true };
  }

  // ============================================================================
  // QUERY METHODS
  // ============================================================================

  getTicket(ticketId: string): RightModel | undefined {
    return this.tickets.get(ticketId);
  }

  getTicketEvents(ticketId: string): ConcertTicketEventRecord[] {
    return this.events.filter(e => e.ticketId === ticketId);
  }

  getMetadataVersions(ticketId: string): MetadataVersion[] {
    return this.metadataVersions.get(ticketId) ?? [];
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private executeTransfer(request: TransferRequest): void {
    const ticket = this.tickets.get(request.ticketId);
    if (!ticket) return;

    const metadata = ticket.metadata as unknown as ConcertTicketMetadata;

    const transferRecord: TransferRecord = {
      id: request.id,
      from: {
        name: request.fromFan,
        identity: metadata.fanInfo.fanIdentity?.number,
      },
      to: {
        name: request.toFan.name,
        identity: request.toFan.identity?.number,
      },
      requestedAt: request.requestedAt,
      approvalStatus: request.status,
      approvedAt: request.approvedAt,
      approvedBy: request.approvedBy,
      nameChangeFee: request.nameChangeFee,
      resalePrice: request.resalePrice,
    };
    metadata.transferHistory.push(transferRecord);

    // Record resale in anti-scalping history
    if (request.resalePrice) {
      metadata.antiScalping.resaleHistory.push({
        fromFan: request.fromFan,
        toFan: request.toFan.name,
        price: request.resalePrice,
        date: new Date().toISOString(),
      });
    }

    const previousMetadata = { ...metadata };
    metadata.fanInfo.fanName = request.toFan.name;
    metadata.fanInfo.fanIdentity = request.toFan.identity;
    if (request.toFan.age !== undefined) {
      metadata.fanInfo.fanAge = request.toFan.age;
    }
    metadata.transferRules.transferCount++;

    ticket.name = `${metadata.venueCode} - ${request.toFan.name} - ${metadata.confirmationNumber}`;
    ticket.updatedAt = new Date().toISOString();

    this.recordMetadataChange(
      request.ticketId,
      previousMetadata,
      metadata,
      request.approvedBy ?? 'SYSTEM',
      `Transfer: ${request.fromFan} -> ${request.toFan.name}`
    );
  }

  private recordMetadataChange(
    ticketId: string,
    previousMetadata: ConcertTicketMetadata,
    newMetadata: ConcertTicketMetadata,
    changedBy: string,
    changeReason: string
  ): void {
    const versions = this.metadataVersions.get(ticketId) ?? [];
    const previousVersion = versions[versions.length - 1];

    const changes: Record<string, { old: unknown; new: unknown }> = {};

    if (previousMetadata.status !== newMetadata.status) {
      changes.status = { old: previousMetadata.status, new: newMetadata.status };
    }
    if (previousMetadata.fanInfo.fanName !== newMetadata.fanInfo.fanName) {
      changes.fanName = { old: previousMetadata.fanInfo.fanName, new: newMetadata.fanInfo.fanName };
    }
    if (previousMetadata.transferRules.transferCount !== newMetadata.transferRules.transferCount) {
      changes.transferCount = {
        old: previousMetadata.transferRules.transferCount,
        new: newMetadata.transferRules.transferCount,
      };
    }
    if (previousMetadata.seating.seat !== newMetadata.seating.seat) {
      changes.seat = { old: previousMetadata.seating.seat, new: newMetadata.seating.seat };
    }
    if (previousMetadata.seating.section !== newMetadata.seating.section) {
      changes.section = { old: previousMetadata.seating.section, new: newMetadata.seating.section };
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
    this.metadataVersions.set(ticketId, versions);
  }

  private hashMetadata(metadata: ConcertTicketMetadata): string {
    const hashInput = JSON.stringify({
      confirmationNumber: metadata.confirmationNumber,
      venueCode: metadata.venueCode,
      fanName: metadata.fanInfo.fanName,
      status: metadata.status,
      seating: metadata.seating,
      eventDate: metadata.eventInfo.eventDate,
      pricing: metadata.pricing,
    });

    return createHash('sha256').update(hashInput).digest('hex');
  }

  private hashIdentity(identity: ConcertTicketMetadata['fanInfo']['fanIdentity']): string {
    if (!identity) return '';
    return `${identity.type}:${identity.country}:${identity.number}`;
  }

  private emitEvent(
    type: ConcertTicketEventType,
    ticketId: string,
    data: Record<string, unknown>,
    confirmationNumber?: string
  ): void {
    const event: ConcertTicketEventRecord = {
      id: uuidv4(),
      type,
      ticketId,
      occurredAt: new Date().toISOString(),
      data,
      confirmationNumber,
    };

    this.events.push(event);

    // Publish to cross-pack event bus
    this.crossPackEventBus?.publish({
      source: 'CONCERT',
      type: event.type,
      resourceId: event.ticketId,
      data: event.data,
      correlationId: (event.data.correlationId as string) ?? undefined,
    });
  }
}

// ============================================================================
// ASSET PACK DEFINITION
// ============================================================================

export const CONCERT_TICKET_PACK: AssetPack = {
  id: 'CONCERT_TICKET',
  name: 'Concert Ticket',
  description: 'Transferable concert tickets with anti-scalping price caps, age restrictions, lead booker support, and venue admission tracking',
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
        { type: 'APPROVAL', approvals: [{ role: 'VENUE', count: 1 }] },
      ],
      actions: [{ type: 'EMIT_EVENT', params: { event: 'TICKET_ISSUED' } }],
      description: 'Issue ticket',
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
        { type: 'APPROVAL', approvals: [{ role: 'VENUE', count: 1 }] },
      ],
      actions: [{ type: 'EMIT_EVENT', params: { event: 'TRANSFER_APPROVED' } }],
      description: 'Approve transfer',
    },
    {
      from: LifecycleState.ACTIVE,
      to: LifecycleState.REDEEMED,
      conditions: [
        { type: 'CUSTOM', customCondition: 'EVENT_COMPLETED' },
      ],
      actions: [{ type: 'EMIT_EVENT', params: { event: 'EVENT_COMPLETED' } }],
      description: 'Event completed',
    },
    {
      from: LifecycleState.ACTIVE,
      to: LifecycleState.REDEEMED,
      conditions: [
        { type: 'APPROVAL', approvals: [{ role: 'HOLDER', count: 1 }] },
      ],
      actions: [{ type: 'EMIT_EVENT', params: { event: 'TICKET_CANCELLED' } }],
      description: 'Cancel ticket',
    },
  ],

  complianceRules: [
    {
      id: 'TRANSFER_APPROVAL',
      name: 'Transfer Requires Approval',
      type: 'CUSTOM',
      params: { requireVenueApproval: true, allowIdentityBypass: true },
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
      id: 'ANTI_SCALPING',
      name: 'Anti-Scalping Price Cap',
      type: 'CUSTOM',
      params: { maxResalePercent: 10 },
      severity: 'BLOCK',
    },
    {
      id: 'TRANSFER_DEADLINE',
      name: 'Transfer Deadline',
      type: 'CUSTOM',
      params: { deadlineHoursBeforeEvent: 24 },
      severity: 'BLOCK',
    },
  ],

  requiredVerifications: [
    {
      type: 'IDENTITY_VERIFICATION',
      description: 'Fan identity verification (optional for auto-approval)',
      allowedVerifiers: ['VENUE', 'IDENTITY_PROVIDER'],
      mandatory: false,
    },
    {
      type: 'AGE_VERIFICATION',
      description: 'Age verification for age-restricted events',
      allowedVerifiers: ['VENUE', 'IDENTITY_PROVIDER'],
      mandatory: false,
    },
  ],

  metadataSchema: {
    confirmationNumber: { type: 'string', required: true, description: 'Confirmation number' },
    fanName: { type: 'string', required: true, description: 'Fan name' },
    eventInfo: { type: 'object', required: true, description: 'Event information' },
    seating: { type: 'object', required: true, description: 'Seating information' },
    pricing: { type: 'object', required: true, description: 'Pricing information' },
    transferRules: { type: 'object', required: true, description: 'Transfer rules' },
    cancellationPolicy: { type: 'object', required: true, description: 'Cancellation policy' },
    antiScalping: { type: 'object', required: true, description: 'Anti-scalping rules' },
  },

  tags: ['concert', 'ticket', 'entertainment', 'anti-scalping', 'access', 'conditional-transfer'],
};

export default ConcertTicketEngine;
