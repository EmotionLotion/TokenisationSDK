/**
 * Pack: Airline Ticket Resale
 *
 * Production-ready implementation for airline ticket tokenization with:
 * - Conditional transfer requiring issuer approval OR identity claim
 * - Name change fees
 * - Transfer count limits
 * - Cancellation/refund lifecycle
 * - Bulk operations for mass updates (TC-6)
 * - Reconciliation reports (TC-6)
 * - Rebook/reissue with ticket linking (TC-8)
 * - Distributed locking for double-spend prevention (TC-9)
 * - Versioned metadata (TC-10)
 * - RBAC enforcement (TC-16)
 */

import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';
import type { RightModel } from '../core/types.js';
import { LifecycleState, RightType, TransferabilityMode } from '../core/types.js';
import type { AssetPack } from './AssetPackRegistry.js';
import { AssetType, InvestorClass, LiquidityProfile, FractionalizationType } from '../core/AssetAbstraction.js';

// ============================================================================
// TYPES
// ============================================================================

export enum TicketClass {
  ECONOMY = 'ECONOMY',
  PREMIUM_ECONOMY = 'PREMIUM_ECONOMY',
  BUSINESS = 'BUSINESS',
  FIRST = 'FIRST',
}

export enum TicketStatus {
  ISSUED = 'ISSUED',
  CONFIRMED = 'CONFIRMED',
  CHECKED_IN = 'CHECKED_IN',
  BOARDED = 'BOARDED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  REFUNDED = 'REFUNDED',
  NO_SHOW = 'NO_SHOW',
}

export enum TransferApprovalStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  AUTO_APPROVED = 'AUTO_APPROVED',
}

export interface FlightSegment {
  flightNumber: string;
  airline: string;
  departure: {
    airport: string;
    terminal?: string;
    dateTime: string;
  };
  arrival: {
    airport: string;
    terminal?: string;
    dateTime: string;
  };
  class: TicketClass;
  seatNumber?: string;
}

export interface AirlineTicketMetadata {
  assetType: 'AIRLINE_TICKET';
  /** Booking reference / PNR */
  bookingReference: string;
  /** E-ticket number */
  eTicketNumber: string;
  /** Passenger name */
  passengerName: string;
  /** Passenger identity document */
  passengerIdentity?: {
    type: 'PASSPORT' | 'ID_CARD' | 'DRIVERS_LICENSE';
    number: string;
    country: string;
    expiryDate: string;
  };
  /** Flight segments */
  segments: FlightSegment[];
  /** Ticket status */
  status: TicketStatus;
  /** Fare information */
  fare: {
    baseFare: string;
    taxes: string;
    total: string;
    currency: string;
    fareClass: string;
    fareRules: string[];
  };
  /** Transfer rules */
  transferRules: {
    maxTransfers: number;
    transferCount: number;
    nameChangeFee: string;
    requiresIssuerApproval: boolean;
    autoApproveWithIdentity: boolean;
    transferDeadlineHours: number; // hours before departure
  };
  /** Cancellation rules */
  cancellationRules: {
    refundable: boolean;
    cancellationFee: string;
    cancellationDeadlineHours: number;
    refundCurrency: string;
  };
  /** Issuing airline */
  issuingAirline: {
    code: string;
    name: string;
  };
  /** Transfer history */
  transferHistory: TicketTransferRecord[];

  // ========== NEW: Airline Policy Flags (Requirement A) ==========
  /** Airline policy flags governing ticket behavior */
  policyFlags: AirlinePolicyFlags;
  /** Custody model for this ticket */
  custodyModel: CustodyModel;
  /** Whether ticket is currently frozen */
  frozen: boolean;
  /** Freeze details if frozen */
  freezeInfo?: {
    frozenAt: string;
    reason: string;
    expiresAt?: string;
  };
  /** Whether ticket has been revoked */
  revoked: boolean;
  /** Revocation details if revoked */
  revocationInfo?: {
    revokedAt: string;
    reason: RevocationReason;
    refundIssued: boolean;
  };
  /** KYC verification status */
  kycStatus: {
    verified: boolean;
    verifiedAt?: string;
    expiresAt?: string;
    sanctionsCleared: boolean;
    sanctionsClearedAt?: string;
  };
}

export interface TicketTransferRecord {
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
  ticketId: string;
  fromPassenger: string;
  toPassenger: {
    name: string;
    identity?: AirlineTicketMetadata['passengerIdentity'];
  };
  /** Reason for transfer (Requirement B) */
  reason: TransferReason;
  /** Supporting documentation for reason */
  supportingDocumentation?: string;
  requestedAt: string;
  status: TransferApprovalStatus;
  approvedAt?: string;
  approvedBy?: string;
  rejectionReason?: string;
  nameChangeFee: string;
  expiresAt: string;
  /** Whether re-KYC was required and completed */
  reKycRequired: boolean;
  reKycCompleted: boolean;
  reKycCompletedAt?: string;
}

// ============================================================================
// RBAC TYPES (TC-16)
// ============================================================================

export enum AirlineRole {
  AIRLINE_ADMIN = 'AIRLINE_ADMIN',       // Full access to airline's tickets
  AIRLINE_AGENT = 'AIRLINE_AGENT',       // Can approve transfers, check-in
  PLATFORM_ADMIN = 'PLATFORM_ADMIN',     // Full platform access
  PLATFORM_OPERATOR = 'PLATFORM_OPERATOR', // Can view, limited actions
  PASSENGER = 'PASSENGER',               // Can view/transfer own tickets
  AUDITOR = 'AUDITOR',                   // Read-only access
}

export interface ActorContext {
  actorId: string;
  role: AirlineRole;
  airlineCode?: string;  // For airline roles
  passengerId?: string;  // For passenger role
}

export interface RBACPermission {
  action: string;
  allowedRoles: AirlineRole[];
  requiresOwnership?: boolean;  // Must own the resource
  requiresAirlineMatch?: boolean;  // Must match airline code
}

// ============================================================================
// DISTRIBUTED LOCK TYPES (TC-9)
// ============================================================================

export interface IDistributedLock {
  /**
   * Acquire a lock
   * @returns lockId if acquired, null if lock is held
   */
  acquire(resourceId: string, ttlMs: number): Promise<string | null>;

  /**
   * Release a lock
   */
  release(resourceId: string, lockId: string): Promise<boolean>;

  /**
   * Check if resource is locked
   */
  isLocked(resourceId: string): Promise<boolean>;

  /**
   * Extend lock TTL
   */
  extend(resourceId: string, lockId: string, ttlMs: number): Promise<boolean>;
}

// ============================================================================
// VERSIONED METADATA TYPES (TC-10)
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
// BULK OPERATIONS TYPES (TC-6)
// ============================================================================

export interface BulkUpdateResult {
  successful: string[];
  failed: Array<{ ticketId: string; error: string }>;
  totalProcessed: number;
  totalSuccess: number;
  totalFailed: number;
}

export interface ReconciliationEntry {
  ticketId: string;
  eTicketNumber: string;
  bookingReference: string;
  passengerName: string;
  status: TicketStatus;
  flightNumber: string;
  departure: string;
  arrival: string;
  fareTotal: string;
  currency: string;
  transferCount: number;
  lastUpdated: string;
  refundAmount?: string;
  refundStatus?: 'PENDING' | 'PROCESSED' | 'N/A';
}

export interface ReconciliationReport {
  reportId: string;
  generatedAt: string;
  flightId: string;
  airlineCode: string;
  summary: {
    totalTickets: number;
    byStatus: Record<TicketStatus, number>;
    totalRevenue: string;
    totalRefunds: string;
    currency: string;
  };
  entries: ReconciliationEntry[];
  exportFormats: {
    csv: string;
    json: string;
  };
}

// ============================================================================
// REBOOK TYPES (TC-8)
// ============================================================================

export interface RebookRecord {
  id: string;
  originalTicketId: string;
  newTicketId: string;
  reason: 'FLIGHT_CANCELLED' | 'SCHEDULE_CHANGE' | 'PASSENGER_REQUEST' | 'INVOLUNTARY';
  rebookedAt: string;
  rebookedBy: string;
  fareDifference: string;
  refundAmount?: string;
  notes?: string;
}

export interface VerificationLog {
  ticketId: string;
  verifiedAt: string;
  verifiedBy: string;
  scanLocation?: string;
  result: 'VALID' | 'ALREADY_USED' | 'INVALID' | 'EXPIRED';
  previousVerification?: {
    verifiedAt: string;
    verifiedBy: string;
  };
}

// ============================================================================
// AIRLINE POLICY FLAGS (Requirement A)
// ============================================================================

export interface AirlinePolicyFlags {
  /** Whether ticket can be transferred at all */
  transferable: boolean;
  /** Whether ticket is refundable */
  refundable: boolean;
  /** Whether ticket can be upgraded */
  upgradeable: boolean;
  /** Whether standby is allowed */
  standbyAllowed: boolean;
  /** Whether seat selection is locked */
  seatLocked: boolean;
  /** Whether ticket can be used for same-day changes */
  sameDayChangeAllowed: boolean;
  /** Minimum hours before departure for changes */
  changeDeadlineHours: number;
  /** Whether re-KYC is required for transfer */
  reKycRequiredForTransfer: boolean;
  /** Jurisdiction-specific rules */
  jurisdictionRules?: {
    /** EU261 passenger rights applicable */
    eu261Applicable: boolean;
    /** US DOT rules applicable */
    usDotApplicable: boolean;
    /** UAE GCAA rules applicable */
    uaeGcaaApplicable: boolean;
  };
  /** Custom airline-specific flags */
  customFlags?: Record<string, boolean | string | number>;
}

// ============================================================================
// TRANSFER REASON (Requirement B)
// ============================================================================

export enum TransferReason {
  RESALE = 'RESALE',           // Secondary market sale
  GIFT = 'GIFT',               // Gift to another person
  ILLNESS = 'ILLNESS',         // Medical inability to travel
  DEATH_IN_FAMILY = 'DEATH_IN_FAMILY',
  WORK_CONFLICT = 'WORK_CONFLICT',
  VISA_DENIED = 'VISA_DENIED',
  CORPORATE_REASSIGNMENT = 'CORPORATE_REASSIGNMENT',
  NAME_CORRECTION = 'NAME_CORRECTION',  // Typo fix
  OTHER = 'OTHER',
}

// ============================================================================
// REVOCATION & OVERRIDE (Requirement F)
// ============================================================================

export enum RevocationReason {
  FRAUD_DETECTED = 'FRAUD_DETECTED',
  PAYMENT_CHARGEBACK = 'PAYMENT_CHARGEBACK',
  REGULATORY_ORDER = 'REGULATORY_ORDER',
  SANCTIONS_MATCH = 'SANCTIONS_MATCH',
  AIRLINE_DISCRETION = 'AIRLINE_DISCRETION',
  SYSTEM_ERROR = 'SYSTEM_ERROR',
  DUPLICATE_BOOKING = 'DUPLICATE_BOOKING',
  SECURITY_THREAT = 'SECURITY_THREAT',
}

export interface RevocationRecord {
  id: string;
  ticketId: string;
  revokedAt: string;
  revokedBy: string;
  reason: RevocationReason;
  description?: string;
  /** Whether passenger was notified */
  passengerNotified: boolean;
  /** Whether refund was issued */
  refundIssued: boolean;
  refundAmount?: string;
  /** Can be appealed */
  appealable: boolean;
  appealDeadline?: string;
}

export interface OverrideRecord {
  id: string;
  ticketId: string;
  overrideType: 'REASSIGN' | 'STATUS_CHANGE' | 'POLICY_OVERRIDE' | 'FREEZE' | 'UNFREEZE';
  previousState: Record<string, unknown>;
  newState: Record<string, unknown>;
  overriddenAt: string;
  overriddenBy: string;
  authorizedBy: string;  // Senior approval
  reason: string;
  /** Regulatory reference if applicable */
  regulatoryReference?: string;
}

export interface FreezeRecord {
  id: string;
  ticketId: string;
  frozenAt: string;
  frozenBy: string;
  reason: 'REGULATORY' | 'FRAUD_INVESTIGATION' | 'DISPUTE' | 'SANCTIONS' | 'SECURITY';
  description?: string;
  unfrozenAt?: string;
  unfrozenBy?: string;
  /** Auto-expire the freeze */
  expiresAt?: string;
}

// ============================================================================
// CUSTODY & RECOVERY (Requirement E)
// ============================================================================

export enum CustodyModel {
  AIRLINE_CUSTODY = 'AIRLINE_CUSTODY',     // Airline controls wallet
  PASSENGER_CUSTODY = 'PASSENGER_CUSTODY', // User wallet
  HYBRID_ESCROW = 'HYBRID_ESCROW',         // Airline escrow + user rights
}

export interface RecoveryRequest {
  id: string;
  ticketId: string;
  requestedAt: string;
  requestedBy: string;
  reason: 'LOST_DEVICE' | 'STOLEN_DEVICE' | 'FORGOTTEN_PASSWORD' | 'ACCOUNT_COMPROMISE' | 'DEATH_OF_HOLDER';
  /** Identity verification method used */
  verificationMethod: 'IN_PERSON' | 'VIDEO_CALL' | 'DOCUMENT_UPLOAD' | 'AIRLINE_COUNTER';
  /** Verification completed */
  verified: boolean;
  verifiedAt?: string;
  verifiedBy?: string;
  /** New wallet/account for recovery */
  recoveryDestination?: string;
  status: 'PENDING' | 'VERIFIED' | 'COMPLETED' | 'REJECTED';
  completedAt?: string;
  rejectionReason?: string;
}

// ============================================================================
// AIRLINE SYSTEM INTEGRATION (Requirement D)
// ============================================================================

export enum AirlineEventType {
  // Ticket lifecycle
  TICKET_ISSUED = 'TICKET_ISSUED',
  TICKET_CONFIRMED = 'TICKET_CONFIRMED',
  TICKET_CANCELLED = 'TICKET_CANCELLED',
  TICKET_REFUNDED = 'TICKET_REFUNDED',
  TICKET_TRANSFERRED = 'TICKET_TRANSFERRED',
  TICKET_REVOKED = 'TICKET_REVOKED',

  // Check-in & boarding
  CHECK_IN_STARTED = 'CHECK_IN_STARTED',
  CHECK_IN_COMPLETED = 'CHECK_IN_COMPLETED',
  BOARDING_PASS_ISSUED = 'BOARDING_PASS_ISSUED',
  BOARDING_COMPLETED = 'BOARDING_COMPLETED',

  // Flight changes
  SEAT_CHANGED = 'SEAT_CHANGED',
  CLASS_UPGRADED = 'CLASS_UPGRADED',
  CLASS_DOWNGRADED = 'CLASS_DOWNGRADED',
  FLIGHT_REBOOKED = 'FLIGHT_REBOOKED',

  // Disruptions
  FLIGHT_DELAYED = 'FLIGHT_DELAYED',
  FLIGHT_CANCELLED = 'FLIGHT_CANCELLED',
  FLIGHT_DIVERTED = 'FLIGHT_DIVERTED',

  // Compliance
  KYC_REQUIRED = 'KYC_REQUIRED',
  KYC_VERIFIED = 'KYC_VERIFIED',
  SANCTIONS_ALERT = 'SANCTIONS_ALERT',
  REGULATORY_HOLD = 'REGULATORY_HOLD',

  // Recovery
  RECOVERY_REQUESTED = 'RECOVERY_REQUESTED',
  RECOVERY_COMPLETED = 'RECOVERY_COMPLETED',
}

export interface AirlineEvent {
  id: string;
  type: AirlineEventType;
  ticketId: string;
  occurredAt: string;
  data: Record<string, unknown>;
  /** For external system correlation */
  externalReference?: string;
  /** PSS record locator */
  pnr?: string;
}

export interface AirlineWebhookConfig {
  /** Unique endpoint ID */
  endpointId: string;
  /** Webhook URL */
  url: string;
  /** Events to subscribe to */
  events: AirlineEventType[];
  /** Signing secret */
  secret: string;
  /** Whether endpoint is active */
  active: boolean;
  /** Retry policy */
  retryPolicy: {
    maxRetries: number;
    backoffMs: number;
  };
}

/**
 * Interface for Passenger Service System (PSS) integration
 */
export interface IPSSAdapter {
  /** Sync ticket to PSS */
  syncTicket(ticketId: string, metadata: AirlineTicketMetadata): Promise<{ pnr: string; success: boolean }>;
  /** Get PNR from PSS */
  getPNR(pnr: string): Promise<{ found: boolean; data?: Record<string, unknown> }>;
  /** Update passenger in PSS */
  updatePassenger(pnr: string, passenger: { name: string; identity?: AirlineTicketMetadata['passengerIdentity'] }): Promise<boolean>;
  /** Cancel booking in PSS */
  cancelBooking(pnr: string, reason: string): Promise<boolean>;
}

/**
 * Interface for Departure Control System (DCS) integration
 */
export interface IDCSAdapter {
  /** Check-in passenger */
  checkIn(pnr: string, segmentIndex: number): Promise<{ boardingPass?: string; success: boolean }>;
  /** Board passenger */
  board(pnr: string, segmentIndex: number, gateAgent: string): Promise<boolean>;
  /** Get boarding status */
  getBoardingStatus(pnr: string, segmentIndex: number): Promise<'NOT_CHECKED_IN' | 'CHECKED_IN' | 'BOARDED' | 'NO_SHOW'>;
  /** Mark no-show */
  markNoShow(pnr: string, segmentIndex: number): Promise<boolean>;
}

// ============================================================================
// IN-MEMORY DISTRIBUTED LOCK (TC-9)
// ============================================================================

export class InMemoryDistributedLock implements IDistributedLock {
  private locks: Map<string, { lockId: string; expiresAt: number }> = new Map();

  async acquire(resourceId: string, ttlMs: number): Promise<string | null> {
    const now = Date.now();
    const existing = this.locks.get(resourceId);

    // Check if lock exists and hasn't expired
    if (existing && existing.expiresAt > now) {
      return null; // Lock is held
    }

    // Acquire lock
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
// RBAC PERMISSION DEFINITIONS (TC-16)
// ============================================================================

const PERMISSIONS: RBACPermission[] = [
  // Ticket issuance - airline only
  { action: 'ISSUE', allowedRoles: [AirlineRole.AIRLINE_ADMIN, AirlineRole.PLATFORM_ADMIN] },

  // Check-in
  { action: 'CHECK_IN', allowedRoles: [AirlineRole.AIRLINE_ADMIN, AirlineRole.AIRLINE_AGENT, AirlineRole.PLATFORM_ADMIN, AirlineRole.PASSENGER], requiresOwnership: true },

  // Boarding - airline only
  { action: 'BOARD', allowedRoles: [AirlineRole.AIRLINE_ADMIN, AirlineRole.AIRLINE_AGENT], requiresAirlineMatch: true },

  // Transfer request - passenger or platform
  { action: 'REQUEST_TRANSFER', allowedRoles: [AirlineRole.PASSENGER, AirlineRole.PLATFORM_OPERATOR, AirlineRole.PLATFORM_ADMIN], requiresOwnership: true },

  // Approve/reject transfer - airline only
  { action: 'APPROVE_TRANSFER', allowedRoles: [AirlineRole.AIRLINE_ADMIN, AirlineRole.AIRLINE_AGENT], requiresAirlineMatch: true },
  { action: 'REJECT_TRANSFER', allowedRoles: [AirlineRole.AIRLINE_ADMIN, AirlineRole.AIRLINE_AGENT], requiresAirlineMatch: true },

  // Cancel - passenger or airline
  { action: 'CANCEL', allowedRoles: [AirlineRole.PASSENGER, AirlineRole.AIRLINE_ADMIN, AirlineRole.AIRLINE_AGENT, AirlineRole.PLATFORM_ADMIN], requiresOwnership: true },

  // Refund - airline only
  { action: 'PROCESS_REFUND', allowedRoles: [AirlineRole.AIRLINE_ADMIN, AirlineRole.PLATFORM_ADMIN], requiresAirlineMatch: true },

  // Bulk operations - admin only
  { action: 'BULK_UPDATE', allowedRoles: [AirlineRole.AIRLINE_ADMIN, AirlineRole.PLATFORM_ADMIN], requiresAirlineMatch: true },

  // Rebook - airline only
  { action: 'REBOOK', allowedRoles: [AirlineRole.AIRLINE_ADMIN, AirlineRole.AIRLINE_AGENT, AirlineRole.PLATFORM_ADMIN], requiresAirlineMatch: true },

  // Reconciliation - admin and auditor
  { action: 'GENERATE_REPORT', allowedRoles: [AirlineRole.AIRLINE_ADMIN, AirlineRole.PLATFORM_ADMIN, AirlineRole.AUDITOR] },

  // View - all roles
  { action: 'VIEW', allowedRoles: Object.values(AirlineRole) },
];

// ============================================================================
// AIRLINE TICKET ENGINE
// ============================================================================

export class AirlineTicketEngine {
  private tickets: Map<string, RightModel> = new Map();
  private transferRequests: Map<string, TransferRequest> = new Map();
  private authorizedAirlines: Set<string> = new Set();
  private verifiedIdentities: Map<string, boolean> = new Map();

  // New: RBAC, locking, versioning, rebook tracking (TC-9, TC-10, TC-8, TC-16)
  private distributedLock: IDistributedLock;
  private metadataVersions: Map<string, MetadataVersion[]> = new Map();
  private rebookRecords: Map<string, RebookRecord> = new Map();
  private verificationLogs: Map<string, VerificationLog[]> = new Map();
  private ticketsByFlight: Map<string, Set<string>> = new Map(); // flightNumber -> ticketIds

  // New: Revocation, Override, Freeze, Recovery (Requirement E, F)
  private revocationRecords: Map<string, RevocationRecord> = new Map();
  private overrideRecords: Map<string, OverrideRecord[]> = new Map();
  private freezeRecords: Map<string, FreezeRecord[]> = new Map();
  private recoveryRequests: Map<string, RecoveryRequest[]> = new Map();
  private events: AirlineEvent[] = [];
  private webhookConfigs: Map<string, AirlineWebhookConfig> = new Map();

  // External system adapters (Requirement D)
  private pssAdapter?: IPSSAdapter;
  private dcsAdapter?: IDCSAdapter;

  constructor(config?: {
    distributedLock?: IDistributedLock;
    pssAdapter?: IPSSAdapter;
    dcsAdapter?: IDCSAdapter;
  }) {
    this.distributedLock = config?.distributedLock ?? new InMemoryDistributedLock();
    this.pssAdapter = config?.pssAdapter;
    this.dcsAdapter = config?.dcsAdapter;
  }

  /**
   * Register an authorized airline
   */
  registerAirline(airlineCode: string): void {
    this.authorizedAirlines.add(airlineCode);
  }

  /**
   * Verify passenger identity (allows auto-approval)
   */
  verifyIdentity(identityHash: string): void {
    this.verifiedIdentities.set(identityHash, true);
  }

  // ============================================================================
  // RBAC ENFORCEMENT (TC-16)
  // ============================================================================

  /**
   * Check if actor has permission to perform action
   */
  checkPermission(
    actor: ActorContext,
    action: string,
    ticketId?: string
  ): { allowed: boolean; reason?: string } {
    const permission = PERMISSIONS.find(p => p.action === action);

    if (!permission) {
      return { allowed: false, reason: `Unknown action: ${action}` };
    }

    // Check role
    if (!permission.allowedRoles.includes(actor.role)) {
      return {
        allowed: false,
        reason: `Role ${actor.role} not authorized for action ${action}`,
      };
    }

    // Check ownership if required
    if (permission.requiresOwnership && ticketId) {
      const ticket = this.tickets.get(ticketId);
      if (!ticket) {
        return { allowed: false, reason: 'Ticket not found' };
      }
      const metadata = ticket.metadata as unknown as AirlineTicketMetadata;

      if (actor.role === AirlineRole.PASSENGER) {
        // Passenger must own the ticket (name match or identity match)
        const isOwner =
          actor.passengerId === metadata.passengerName ||
          (metadata.passengerIdentity && actor.passengerId === metadata.passengerIdentity.number);

        if (!isOwner) {
          return { allowed: false, reason: 'Not the ticket owner' };
        }
      }
    }

    // Check airline match if required
    if (permission.requiresAirlineMatch && ticketId) {
      const ticket = this.tickets.get(ticketId);
      if (!ticket) {
        return { allowed: false, reason: 'Ticket not found' };
      }
      const metadata = ticket.metadata as unknown as AirlineTicketMetadata;

      if (actor.airlineCode && actor.airlineCode !== metadata.issuingAirline.code) {
        return {
          allowed: false,
          reason: `Airline ${actor.airlineCode} cannot modify tickets from ${metadata.issuingAirline.code}`,
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Enforce permission (throws if not allowed)
   */
  private enforcePermission(actor: ActorContext, action: string, ticketId?: string): void {
    const result = this.checkPermission(actor, action, ticketId);
    if (!result.allowed) {
      throw new Error(`PERMISSION_DENIED: ${result.reason}`);
    }
  }

  /**
   * Issue a ticket with full airline policy support
   */
  issue(params: {
    airlineCode: string;
    bookingReference: string;
    eTicketNumber: string;
    passengerName: string;
    passengerIdentity?: AirlineTicketMetadata['passengerIdentity'];
    segments: FlightSegment[];
    fare: AirlineTicketMetadata['fare'];
    transferRules: AirlineTicketMetadata['transferRules'];
    cancellationRules: AirlineTicketMetadata['cancellationRules'];
    /** Airline policy flags (Requirement A) */
    policyFlags?: Partial<AirlinePolicyFlags>;
    /** Custody model (Requirement E) */
    custodyModel?: CustodyModel;
  }): { success: boolean; ticket?: RightModel; error?: string } {
    // Check airline authorization
    if (!this.authorizedAirlines.has(params.airlineCode)) {
      return { success: false, error: 'Airline not authorized' };
    }

    const now = new Date().toISOString();
    const firstDeparture = params.segments[0]?.departure.dateTime;
    const lastArrival = params.segments[params.segments.length - 1]?.arrival.dateTime;

    // Default policy flags derived from transfer/cancellation rules
    const defaultPolicyFlags: AirlinePolicyFlags = {
      transferable: params.transferRules.maxTransfers > 0,
      refundable: params.cancellationRules.refundable,
      upgradeable: true,
      standbyAllowed: false,
      seatLocked: false,
      sameDayChangeAllowed: true,
      changeDeadlineHours: params.transferRules.transferDeadlineHours,
      reKycRequiredForTransfer: params.transferRules.requiresIssuerApproval,
    };

    const metadata: AirlineTicketMetadata = {
      assetType: 'AIRLINE_TICKET',
      bookingReference: params.bookingReference,
      eTicketNumber: params.eTicketNumber,
      passengerName: params.passengerName,
      passengerIdentity: params.passengerIdentity,
      segments: params.segments,
      status: TicketStatus.ISSUED,
      fare: params.fare,
      transferRules: params.transferRules,
      cancellationRules: params.cancellationRules,
      issuingAirline: {
        code: params.airlineCode,
        name: params.airlineCode, // Would be looked up in real implementation
      },
      transferHistory: [],
      // New policy fields (Requirement A, E, F)
      policyFlags: { ...defaultPolicyFlags, ...params.policyFlags },
      custodyModel: params.custodyModel ?? CustodyModel.AIRLINE_CUSTODY,
      frozen: false,
      revoked: false,
      kycStatus: {
        verified: !!params.passengerIdentity,
        verifiedAt: params.passengerIdentity ? now : undefined,
        sanctionsCleared: false, // Must be explicitly cleared
      },
    };

    const ticket: RightModel = {
      id: uuidv4(),
      name: `${params.airlineCode} ${params.segments[0]?.flightNumber} - ${params.passengerName}`,
      rightType: RightType.ACCESS,
      state: LifecycleState.ACTIVE,
      jurisdiction: {
        countryCode: 'GLOBAL',
        accreditedOnly: false,
        blockedJurisdictions: [],
      },
      validityPeriod: {
        isPerpetual: false,
        startTime: now,
        endTime: lastArrival,
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

    // Index by flight number for reconciliation
    for (const segment of params.segments) {
      const flightKey = `${segment.airline}:${segment.flightNumber}:${segment.departure.dateTime.split('T')[0]}`;
      if (!this.ticketsByFlight.has(flightKey)) {
        this.ticketsByFlight.set(flightKey, new Set());
      }
      this.ticketsByFlight.get(flightKey)!.add(ticket.id);
    }

    // Initialize metadata version history
    this.metadataVersions.set(ticket.id, [{
      version: 0,
      timestamp: now,
      changedBy: 'SYSTEM',
      changeReason: 'Initial issuance',
      previousHash: '',
      currentHash: this.hashMetadata(metadata),
      changes: {},
    }]);

    // Emit event (Requirement D)
    this.emitEvent(AirlineEventType.TICKET_ISSUED, ticket.id, {
      eTicketNumber: params.eTicketNumber,
      bookingReference: params.bookingReference,
      passengerName: params.passengerName,
      segments: params.segments.map(s => ({
        flightNumber: s.flightNumber,
        departure: s.departure,
        arrival: s.arrival,
      })),
    }, params.bookingReference);

    // Sync to PSS if adapter available
    if (this.pssAdapter) {
      this.pssAdapter.syncTicket(ticket.id, metadata).catch(() => {
        // Log but don't fail - PSS sync is async
      });
    }

    return { success: true, ticket };
  }

  // ============================================================================
  // CHECK-IN AND BOARDING (TC-2, TC-3, TC-9)
  // ============================================================================

  /**
   * Check-in a ticket (idempotent)
   */
  checkIn(params: {
    ticketId: string;
    actor: ActorContext;
    idempotencyKey?: string;
  }): { success: boolean; ticket?: RightModel; error?: string; alreadyCheckedIn?: boolean } {
    this.enforcePermission(params.actor, 'CHECK_IN', params.ticketId);

    const ticket = this.tickets.get(params.ticketId);
    if (!ticket) {
      return { success: false, error: 'Ticket not found' };
    }

    const metadata = ticket.metadata as unknown as AirlineTicketMetadata;

    // Idempotent: if already checked in, return success
    if (metadata.status === TicketStatus.CHECKED_IN) {
      return { success: true, ticket, alreadyCheckedIn: true };
    }

    // Validate status transition
    if (metadata.status !== TicketStatus.ISSUED && metadata.status !== TicketStatus.CONFIRMED) {
      return {
        success: false,
        error: `Cannot check in from status ${metadata.status}. Allowed: ISSUED, CONFIRMED`,
      };
    }

    // Update status
    const previousMetadata = { ...metadata };
    metadata.status = TicketStatus.CHECKED_IN;
    ticket.updatedAt = new Date().toISOString();

    // Record version change
    this.recordMetadataChange(
      params.ticketId,
      previousMetadata,
      metadata,
      params.actor.actorId,
      'Check-in'
    );

    return { success: true, ticket };
  }

  /**
   * Board a passenger (with distributed locking for double-spend prevention)
   */
  async board(params: {
    ticketId: string;
    actor: ActorContext;
    scanLocation?: string;
  }): Promise<{ success: boolean; ticket?: RightModel; error?: string; verificationLog?: VerificationLog }> {
    this.enforcePermission(params.actor, 'BOARD', params.ticketId);

    const ticket = this.tickets.get(params.ticketId);
    if (!ticket) {
      return { success: false, error: 'Ticket not found' };
    }

    const metadata = ticket.metadata as unknown as AirlineTicketMetadata;

    // Create verification log entry
    const now = new Date().toISOString();
    const existingLogs = this.verificationLogs.get(params.ticketId) ?? [];

    // Acquire distributed lock to prevent race conditions (TC-9)
    const lockId = await this.distributedLock.acquire(`boarding:${params.ticketId}`, 5000);
    if (!lockId) {
      // Another process is boarding this ticket
      const log: VerificationLog = {
        ticketId: params.ticketId,
        verifiedAt: now,
        verifiedBy: params.actor.actorId,
        scanLocation: params.scanLocation,
        result: 'ALREADY_USED',
        previousVerification: existingLogs.length > 0 ? {
          verifiedAt: existingLogs[existingLogs.length - 1].verifiedAt,
          verifiedBy: existingLogs[existingLogs.length - 1].verifiedBy,
        } : undefined,
      };
      existingLogs.push(log);
      this.verificationLogs.set(params.ticketId, existingLogs);

      return {
        success: false,
        error: 'ALREADY_USED: Ticket is being processed by another scan',
        verificationLog: log,
      };
    }

    try {
      // Check if already boarded (double-spend attempt)
      if (metadata.status === TicketStatus.BOARDED || metadata.status === TicketStatus.COMPLETED) {
        const log: VerificationLog = {
          ticketId: params.ticketId,
          verifiedAt: now,
          verifiedBy: params.actor.actorId,
          scanLocation: params.scanLocation,
          result: 'ALREADY_USED',
          previousVerification: existingLogs.length > 0 ? {
            verifiedAt: existingLogs[existingLogs.length - 1].verifiedAt,
            verifiedBy: existingLogs[existingLogs.length - 1].verifiedBy,
          } : undefined,
        };
        existingLogs.push(log);
        this.verificationLogs.set(params.ticketId, existingLogs);

        return {
          success: false,
          error: `ALREADY_USED: Ticket already boarded at ${existingLogs.find(l => l.result === 'VALID')?.verifiedAt}`,
          verificationLog: log,
        };
      }

      // Validate status transition
      if (metadata.status !== TicketStatus.CHECKED_IN) {
        const log: VerificationLog = {
          ticketId: params.ticketId,
          verifiedAt: now,
          verifiedBy: params.actor.actorId,
          scanLocation: params.scanLocation,
          result: 'INVALID',
        };
        existingLogs.push(log);
        this.verificationLogs.set(params.ticketId, existingLogs);

        return {
          success: false,
          error: `Cannot board from status ${metadata.status}. Must be CHECKED_IN first.`,
          verificationLog: log,
        };
      }

      // Check ticket expiry
      const firstDeparture = new Date(metadata.segments[0]?.departure.dateTime);
      if (new Date() > new Date(firstDeparture.getTime() + 24 * 60 * 60 * 1000)) {
        const log: VerificationLog = {
          ticketId: params.ticketId,
          verifiedAt: now,
          verifiedBy: params.actor.actorId,
          scanLocation: params.scanLocation,
          result: 'EXPIRED',
        };
        existingLogs.push(log);
        this.verificationLogs.set(params.ticketId, existingLogs);

        return { success: false, error: 'Ticket has expired', verificationLog: log };
      }

      // Successfully board
      const previousMetadata = { ...metadata };
      metadata.status = TicketStatus.BOARDED;
      ticket.updatedAt = now;

      // Record version change
      this.recordMetadataChange(
        params.ticketId,
        previousMetadata,
        metadata,
        params.actor.actorId,
        'Boarding'
      );

      // Record successful verification
      const log: VerificationLog = {
        ticketId: params.ticketId,
        verifiedAt: now,
        verifiedBy: params.actor.actorId,
        scanLocation: params.scanLocation,
        result: 'VALID',
      };
      existingLogs.push(log);
      this.verificationLogs.set(params.ticketId, existingLogs);

      return { success: true, ticket, verificationLog: log };
    } finally {
      // Always release the lock
      await this.distributedLock.release(`boarding:${params.ticketId}`, lockId);
    }
  }

  /**
   * Mark flight as completed
   */
  completeTicket(params: {
    ticketId: string;
    actor: ActorContext;
  }): { success: boolean; ticket?: RightModel; error?: string } {
    this.enforcePermission(params.actor, 'BOARD', params.ticketId); // Same permission as boarding

    const ticket = this.tickets.get(params.ticketId);
    if (!ticket) {
      return { success: false, error: 'Ticket not found' };
    }

    const metadata = ticket.metadata as unknown as AirlineTicketMetadata;

    if (metadata.status !== TicketStatus.BOARDED) {
      return { success: false, error: `Cannot complete from status ${metadata.status}. Must be BOARDED.` };
    }

    const previousMetadata = { ...metadata };
    metadata.status = TicketStatus.COMPLETED;
    ticket.state = LifecycleState.REDEEMED;
    ticket.updatedAt = new Date().toISOString();

    this.recordMetadataChange(
      params.ticketId,
      previousMetadata,
      metadata,
      params.actor.actorId,
      'Flight completed'
    );

    return { success: true, ticket };
  }

  /**
   * Request ticket transfer (name change) with policy-driven validation
   * Implements Requirement B: Policy-Driven Transfer Engine
   */
  requestTransfer(params: {
    ticketId: string;
    fromPassenger: string;
    toPassenger: {
      name: string;
      identity?: AirlineTicketMetadata['passengerIdentity'];
    };
    /** Reason for transfer (required per Requirement B) */
    reason: TransferReason;
    /** Supporting documentation for reason */
    supportingDocumentation?: string;
  }): { success: boolean; request?: TransferRequest; error?: string } {
    const ticket = this.tickets.get(params.ticketId);
    if (!ticket) {
      return { success: false, error: 'Ticket not found' };
    }

    const metadata = ticket.metadata as unknown as AirlineTicketMetadata;

    // Check if ticket is revoked (Requirement F)
    if (metadata.revoked) {
      return { success: false, error: 'Cannot transfer revoked ticket' };
    }

    // Check if ticket is frozen (Requirement F)
    if (metadata.frozen) {
      return { success: false, error: 'Cannot transfer frozen ticket - contact airline support' };
    }

    // Check policy flags - transferability (Requirement A)
    if (!metadata.policyFlags.transferable) {
      return { success: false, error: 'Ticket is non-transferable per airline policy' };
    }

    // Check current passenger
    if (metadata.passengerName !== params.fromPassenger) {
      return { success: false, error: 'Not the current ticket holder' };
    }

    // Check ticket status
    if (metadata.status !== TicketStatus.ISSUED && metadata.status !== TicketStatus.CONFIRMED) {
      return { success: false, error: 'Ticket cannot be transferred in current status' };
    }

    // Check transfer count limit
    if (metadata.transferRules.transferCount >= metadata.transferRules.maxTransfers) {
      return { success: false, error: `Maximum transfers (${metadata.transferRules.maxTransfers}) reached` };
    }

    // Check transfer deadline (use policy flags deadline if set)
    const firstDeparture = new Date(metadata.segments[0]?.departure.dateTime);
    const deadlineHours = metadata.policyFlags.changeDeadlineHours ?? metadata.transferRules.transferDeadlineHours;
    const deadline = new Date(firstDeparture.getTime() - deadlineHours * 60 * 60 * 1000);
    if (new Date() > deadline) {
      return { success: false, error: 'Transfer deadline has passed' };
    }

    // Determine if re-KYC is required (Requirement C)
    const reKycRequired = metadata.policyFlags.reKycRequiredForTransfer ||
      params.reason === TransferReason.RESALE ||
      !params.toPassenger.identity;

    const now = new Date();
    const request: TransferRequest = {
      id: uuidv4(),
      ticketId: params.ticketId,
      fromPassenger: params.fromPassenger,
      toPassenger: params.toPassenger,
      reason: params.reason,
      supportingDocumentation: params.supportingDocumentation,
      requestedAt: now.toISOString(),
      status: TransferApprovalStatus.PENDING,
      nameChangeFee: metadata.transferRules.nameChangeFee,
      expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(), // 24 hour expiry
      reKycRequired,
      reKycCompleted: !reKycRequired, // If not required, mark as complete
      reKycCompletedAt: !reKycRequired ? now.toISOString() : undefined,
    };

    // Emit KYC_REQUIRED event if re-KYC is needed (Requirement C)
    if (request.reKycRequired && !request.reKycCompleted) {
      this.emitEvent(AirlineEventType.KYC_REQUIRED, params.ticketId, {
        transferRequestId: request.id,
        reason: params.reason,
        newPassenger: params.toPassenger.name,
      }, metadata.bookingReference);
    }

    // Check for auto-approval with verified identity
    if (metadata.transferRules.autoApproveWithIdentity && params.toPassenger.identity) {
      const identityHash = this.hashIdentity(params.toPassenger.identity);
      if (this.verifiedIdentities.get(identityHash)) {
        // If re-KYC required, mark it as completed via verified identity
        if (request.reKycRequired) {
          request.reKycCompleted = true;
          request.reKycCompletedAt = now.toISOString();
        }

        request.status = TransferApprovalStatus.AUTO_APPROVED;
        request.approvedAt = now.toISOString();
        request.approvedBy = 'SYSTEM_AUTO_APPROVAL';

        // Execute transfer immediately
        this.executeTransfer(request);

        // Emit transfer event
        this.emitEvent(AirlineEventType.TICKET_TRANSFERRED, params.ticketId, {
          from: params.fromPassenger,
          to: params.toPassenger.name,
          reason: params.reason,
          autoApproved: true,
        }, metadata.bookingReference);

        return { success: true, request };
      }
    }

    // Otherwise requires issuer approval
    if (metadata.transferRules.requiresIssuerApproval) {
      this.transferRequests.set(request.id, request);
      return { success: true, request };
    }

    // If no approval required and no identity verification, auto-approve
    // But only if re-KYC is not required or is completed
    if (!request.reKycRequired || request.reKycCompleted) {
      request.status = TransferApprovalStatus.AUTO_APPROVED;
      request.approvedAt = now.toISOString();
      this.executeTransfer(request);

      // Emit transfer event
      this.emitEvent(AirlineEventType.TICKET_TRANSFERRED, params.ticketId, {
        from: params.fromPassenger,
        to: params.toPassenger.name,
        reason: params.reason,
        autoApproved: true,
      }, metadata.bookingReference);

      return { success: true, request };
    }

    // Re-KYC required but not completed - hold for KYC verification
    this.transferRequests.set(request.id, request);
    return { success: true, request };
  }

  /**
   * Complete re-KYC for a transfer request
   */
  completeTransferKyc(params: {
    requestId: string;
    verifiedBy: string;
    verificationReference?: string;
  }): { success: boolean; error?: string } {
    const request = this.transferRequests.get(params.requestId);
    if (!request) {
      return { success: false, error: 'Transfer request not found' };
    }

    if (!request.reKycRequired) {
      return { success: false, error: 'Re-KYC not required for this transfer' };
    }

    if (request.reKycCompleted) {
      return { success: false, error: 'Re-KYC already completed' };
    }

    request.reKycCompleted = true;
    request.reKycCompletedAt = new Date().toISOString();

    // Emit KYC verified event
    this.emitEvent(AirlineEventType.KYC_VERIFIED, request.ticketId, {
      transferRequestId: request.id,
      verifiedBy: params.verifiedBy,
      verificationReference: params.verificationReference,
    });

    return { success: true };
  }

  /**
   * Approve transfer (by airline)
   */
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

    // Check re-KYC completion (Requirement C)
    if (request.reKycRequired && !request.reKycCompleted) {
      return { success: false, error: 'Re-KYC verification required before approval - call completeTransferKyc first' };
    }

    const ticket = this.tickets.get(request.ticketId);
    const metadata = ticket?.metadata as unknown as AirlineTicketMetadata | undefined;

    request.status = TransferApprovalStatus.APPROVED;
    request.approvedAt = new Date().toISOString();
    request.approvedBy = params.approvedBy;

    this.executeTransfer(request);

    // Emit transfer event
    this.emitEvent(AirlineEventType.TICKET_TRANSFERRED, request.ticketId, {
      from: request.fromPassenger,
      to: request.toPassenger.name,
      reason: request.reason,
      approvedBy: params.approvedBy,
    }, metadata?.bookingReference);

    return { success: true };
  }

  /**
   * Reject transfer (by airline)
   */
  rejectTransfer(params: {
    requestId: string;
    rejectedBy: string;
    reason: string;
  }): { success: boolean; error?: string } {
    const request = this.transferRequests.get(params.requestId);
    if (!request) {
      return { success: false, error: 'Transfer request not found' };
    }

    if (request.status !== TransferApprovalStatus.PENDING) {
      return { success: false, error: 'Request is not pending' };
    }

    request.status = TransferApprovalStatus.REJECTED;
    request.rejectionReason = params.reason;

    return { success: true };
  }

  /**
   * Cancel ticket
   */
  cancel(params: {
    ticketId: string;
    requestedBy: string;
  }): { success: boolean; refundAmount?: string; error?: string } {
    const ticket = this.tickets.get(params.ticketId);
    if (!ticket) {
      return { success: false, error: 'Ticket not found' };
    }

    const metadata = ticket.metadata as unknown as AirlineTicketMetadata;

    // Check ownership
    if (metadata.passengerName !== params.requestedBy) {
      return { success: false, error: 'Not the ticket holder' };
    }

    // Check if cancellation is allowed
    if (metadata.status === TicketStatus.BOARDED ||
        metadata.status === TicketStatus.COMPLETED ||
        metadata.status === TicketStatus.CANCELLED) {
      return { success: false, error: 'Ticket cannot be cancelled in current status' };
    }

    // Check cancellation deadline
    const firstDeparture = new Date(metadata.segments[0]?.departure.dateTime);
    const deadline = new Date(firstDeparture.getTime() - metadata.cancellationRules.cancellationDeadlineHours * 60 * 60 * 1000);
    if (new Date() > deadline) {
      return { success: false, error: 'Cancellation deadline has passed' };
    }

    // Calculate refund
    let refundAmount = '0';
    if (metadata.cancellationRules.refundable) {
      const fareTotal = parseFloat(metadata.fare.total);
      const cancellationFee = parseFloat(metadata.cancellationRules.cancellationFee);
      refundAmount = Math.max(0, fareTotal - cancellationFee).toFixed(2);
    }

    // Update ticket status
    metadata.status = TicketStatus.CANCELLED;
    ticket.state = LifecycleState.REDEEMED;
    ticket.updatedAt = new Date().toISOString();

    return { success: true, refundAmount };
  }

  /**
   * Process refund
   */
  processRefund(ticketId: string): { success: boolean; refundAmount?: string; error?: string } {
    const ticket = this.tickets.get(ticketId);
    if (!ticket) {
      return { success: false, error: 'Ticket not found' };
    }

    const metadata = ticket.metadata as unknown as AirlineTicketMetadata;

    if (metadata.status !== TicketStatus.CANCELLED) {
      return { success: false, error: 'Ticket must be cancelled first' };
    }

    if (!metadata.cancellationRules.refundable) {
      return { success: false, error: 'Ticket is non-refundable' };
    }

    const fareTotal = parseFloat(metadata.fare.total);
    const cancellationFee = parseFloat(metadata.cancellationRules.cancellationFee);
    const refundAmount = Math.max(0, fareTotal - cancellationFee).toFixed(2);

    metadata.status = TicketStatus.REFUNDED;
    ticket.state = LifecycleState.REDEEMED;
    ticket.updatedAt = new Date().toISOString();

    return { success: true, refundAmount };
  }

  /**
   * Get ticket
   */
  getTicket(ticketId: string): RightModel | undefined {
    return this.tickets.get(ticketId);
  }

  /**
   * Get pending transfer requests for airline
   */
  getPendingTransfers(airlineCode: string): TransferRequest[] {
    return Array.from(this.transferRequests.values())
      .filter(r => {
        const ticket = this.tickets.get(r.ticketId);
        if (!ticket) return false;
        const metadata = ticket.metadata as unknown as AirlineTicketMetadata;
        return metadata.issuingAirline.code === airlineCode && r.status === TransferApprovalStatus.PENDING;
      });
  }

  // ============================================================================
  // BULK OPERATIONS (TC-6)
  // ============================================================================

  /**
   * Bulk update ticket status (e.g., flight cancellation)
   * Processes tickets in parallel with individual error handling
   */
  async bulkUpdateStatus(params: {
    ticketIds: string[];
    newStatus: TicketStatus;
    actor: ActorContext;
    reason: string;
  }): Promise<BulkUpdateResult> {
    // Check permission for bulk operations
    this.enforcePermission(params.actor, 'BULK_UPDATE');

    const results: BulkUpdateResult = {
      successful: [],
      failed: [],
      totalProcessed: params.ticketIds.length,
      totalSuccess: 0,
      totalFailed: 0,
    };

    // Process in batches to avoid overwhelming the system
    const BATCH_SIZE = 100;

    for (let i = 0; i < params.ticketIds.length; i += BATCH_SIZE) {
      const batch = params.ticketIds.slice(i, i + BATCH_SIZE);

      await Promise.all(batch.map(async (ticketId) => {
        try {
          const ticket = this.tickets.get(ticketId);
          if (!ticket) {
            results.failed.push({ ticketId, error: 'Ticket not found' });
            return;
          }

          const metadata = ticket.metadata as unknown as AirlineTicketMetadata;

          // Check airline match for bulk operation
          if (params.actor.airlineCode && params.actor.airlineCode !== metadata.issuingAirline.code) {
            results.failed.push({
              ticketId,
              error: `Cannot modify ticket from different airline: ${metadata.issuingAirline.code}`,
            });
            return;
          }

          // Validate status transition
          const validTransitions = this.getValidStatusTransitions(metadata.status);
          if (!validTransitions.includes(params.newStatus)) {
            results.failed.push({
              ticketId,
              error: `Invalid status transition: ${metadata.status} -> ${params.newStatus}`,
            });
            return;
          }

          // Update status
          const previousMetadata = { ...metadata };
          metadata.status = params.newStatus;
          ticket.updatedAt = new Date().toISOString();

          // Update lifecycle state if needed
          if ([TicketStatus.CANCELLED, TicketStatus.REFUNDED, TicketStatus.COMPLETED].includes(params.newStatus)) {
            ticket.state = LifecycleState.REDEEMED;
          }

          // Record version change
          this.recordMetadataChange(
            ticketId,
            previousMetadata,
            metadata,
            params.actor.actorId,
            `Bulk update: ${params.reason}`
          );

          results.successful.push(ticketId);
        } catch (error) {
          results.failed.push({
            ticketId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }));
    }

    results.totalSuccess = results.successful.length;
    results.totalFailed = results.failed.length;

    return results;
  }

  /**
   * Bulk cancel tickets for a flight (e.g., flight cancellation)
   */
  async bulkCancelFlight(params: {
    flightNumber: string;
    airlineCode: string;
    departureDate: string;
    actor: ActorContext;
    reason: string;
  }): Promise<BulkUpdateResult> {
    const flightKey = `${params.airlineCode}:${params.flightNumber}:${params.departureDate}`;
    const ticketIds = Array.from(this.ticketsByFlight.get(flightKey) ?? []);

    if (ticketIds.length === 0) {
      return {
        successful: [],
        failed: [],
        totalProcessed: 0,
        totalSuccess: 0,
        totalFailed: 0,
      };
    }

    return this.bulkUpdateStatus({
      ticketIds,
      newStatus: TicketStatus.CANCELLED,
      actor: params.actor,
      reason: `Flight ${params.flightNumber} cancelled: ${params.reason}`,
    });
  }

  // ============================================================================
  // RECONCILIATION REPORT (TC-6)
  // ============================================================================

  /**
   * Generate reconciliation report for a flight
   */
  generateReconciliationReport(params: {
    flightNumber: string;
    airlineCode: string;
    departureDate: string;
    actor: ActorContext;
  }): ReconciliationReport {
    this.enforcePermission(params.actor, 'GENERATE_REPORT');

    const flightKey = `${params.airlineCode}:${params.flightNumber}:${params.departureDate}`;
    const ticketIds = Array.from(this.ticketsByFlight.get(flightKey) ?? []);

    const entries: ReconciliationEntry[] = [];
    const statusCounts: Record<TicketStatus, number> = {
      [TicketStatus.ISSUED]: 0,
      [TicketStatus.CONFIRMED]: 0,
      [TicketStatus.CHECKED_IN]: 0,
      [TicketStatus.BOARDED]: 0,
      [TicketStatus.COMPLETED]: 0,
      [TicketStatus.CANCELLED]: 0,
      [TicketStatus.REFUNDED]: 0,
      [TicketStatus.NO_SHOW]: 0,
    };

    let totalRevenue = 0;
    let totalRefunds = 0;
    let currency = 'USD';

    for (const ticketId of ticketIds) {
      const ticket = this.tickets.get(ticketId);
      if (!ticket) continue;

      const metadata = ticket.metadata as unknown as AirlineTicketMetadata;
      const segment = metadata.segments.find(
        s => s.flightNumber === params.flightNumber && s.departure.dateTime.startsWith(params.departureDate)
      );

      if (!segment) continue;

      // Calculate refund amount for cancelled/refunded tickets
      let refundAmount: string | undefined;
      let refundStatus: 'PENDING' | 'PROCESSED' | 'N/A' = 'N/A';

      if (metadata.status === TicketStatus.CANCELLED || metadata.status === TicketStatus.REFUNDED) {
        if (metadata.cancellationRules.refundable) {
          const fareTotal = parseFloat(metadata.fare.total);
          const cancellationFee = parseFloat(metadata.cancellationRules.cancellationFee);
          refundAmount = Math.max(0, fareTotal - cancellationFee).toFixed(2);
          totalRefunds += parseFloat(refundAmount);
          refundStatus = metadata.status === TicketStatus.REFUNDED ? 'PROCESSED' : 'PENDING';
        }
      } else if (![TicketStatus.CANCELLED, TicketStatus.REFUNDED].includes(metadata.status)) {
        totalRevenue += parseFloat(metadata.fare.total);
      }

      currency = metadata.fare.currency;
      statusCounts[metadata.status]++;

      entries.push({
        ticketId,
        eTicketNumber: metadata.eTicketNumber,
        bookingReference: metadata.bookingReference,
        passengerName: metadata.passengerName,
        status: metadata.status,
        flightNumber: segment.flightNumber,
        departure: segment.departure.dateTime,
        arrival: segment.arrival.dateTime,
        fareTotal: metadata.fare.total,
        currency: metadata.fare.currency,
        transferCount: metadata.transferRules.transferCount,
        lastUpdated: ticket.updatedAt,
        refundAmount,
        refundStatus,
      });
    }

    // Sort by passenger name
    entries.sort((a, b) => a.passengerName.localeCompare(b.passengerName));

    // Generate CSV export
    const csvHeaders = [
      'Ticket ID', 'E-Ticket', 'PNR', 'Passenger', 'Status', 'Flight',
      'Departure', 'Arrival', 'Fare', 'Currency', 'Transfers', 'Last Updated',
      'Refund Amount', 'Refund Status',
    ];
    const csvRows = entries.map(e => [
      e.ticketId, e.eTicketNumber, e.bookingReference, e.passengerName,
      e.status, e.flightNumber, e.departure, e.arrival, e.fareTotal,
      e.currency, e.transferCount, e.lastUpdated,
      e.refundAmount ?? '', e.refundStatus,
    ]);
    const csv = [
      csvHeaders.join(','),
      ...csvRows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
    ].join('\n');

    const report: ReconciliationReport = {
      reportId: uuidv4(),
      generatedAt: new Date().toISOString(),
      flightId: flightKey,
      airlineCode: params.airlineCode,
      summary: {
        totalTickets: entries.length,
        byStatus: statusCounts,
        totalRevenue: totalRevenue.toFixed(2),
        totalRefunds: totalRefunds.toFixed(2),
        currency,
      },
      entries,
      exportFormats: {
        csv,
        json: JSON.stringify(entries, null, 2),
      },
    };

    return report;
  }

  /**
   * Generate reconciliation report for all flights on a date
   */
  generateDailyReconciliation(params: {
    airlineCode: string;
    date: string;
    actor: ActorContext;
  }): ReconciliationReport[] {
    this.enforcePermission(params.actor, 'GENERATE_REPORT');

    const reports: ReconciliationReport[] = [];

    for (const flightKey of Array.from(this.ticketsByFlight.keys())) {
      const [airline, flightNumber, departureDate] = flightKey.split(':');

      if (airline === params.airlineCode && departureDate === params.date) {
        const report = this.generateReconciliationReport({
          flightNumber,
          airlineCode: params.airlineCode,
          departureDate,
          actor: params.actor,
        });
        reports.push(report);
      }
    }

    return reports;
  }

  // ============================================================================
  // REBOOK / REISSUE (TC-8)
  // ============================================================================

  /**
   * Rebook a ticket to a new flight
   * Creates a new ticket linked to the original
   */
  rebook(params: {
    originalTicketId: string;
    newSegments: FlightSegment[];
    reason: RebookRecord['reason'];
    actor: ActorContext;
    fareDifference?: string;
    notes?: string;
  }): { success: boolean; newTicket?: RightModel; rebookRecord?: RebookRecord; error?: string } {
    this.enforcePermission(params.actor, 'REBOOK', params.originalTicketId);

    const originalTicket = this.tickets.get(params.originalTicketId);
    if (!originalTicket) {
      return { success: false, error: 'Original ticket not found' };
    }

    const originalMetadata = originalTicket.metadata as unknown as AirlineTicketMetadata;

    // Check if ticket can be rebooked
    const rebookableStatuses = [
      TicketStatus.ISSUED,
      TicketStatus.CONFIRMED,
      TicketStatus.CHECKED_IN,
      TicketStatus.CANCELLED,
    ];

    if (!rebookableStatuses.includes(originalMetadata.status)) {
      return {
        success: false,
        error: `Cannot rebook ticket in status ${originalMetadata.status}. Allowed: ${rebookableStatuses.join(', ')}`,
      };
    }

    // Calculate fare difference
    const fareDifference = params.fareDifference ?? '0.00';

    // Calculate refund if applicable (involuntary rebook)
    let refundAmount: string | undefined;
    if (params.reason === 'FLIGHT_CANCELLED' || params.reason === 'INVOLUNTARY') {
      if (originalMetadata.cancellationRules.refundable && parseFloat(fareDifference) < 0) {
        refundAmount = Math.abs(parseFloat(fareDifference)).toFixed(2);
      }
    }

    // Issue new ticket
    const newTicketResult = this.issue({
      airlineCode: originalMetadata.issuingAirline.code,
      bookingReference: originalMetadata.bookingReference, // Keep same PNR
      eTicketNumber: `${originalMetadata.eTicketNumber}-R`, // Suffix for rebook
      passengerName: originalMetadata.passengerName,
      passengerIdentity: originalMetadata.passengerIdentity,
      segments: params.newSegments,
      fare: {
        ...originalMetadata.fare,
        total: (parseFloat(originalMetadata.fare.total) + parseFloat(fareDifference)).toFixed(2),
      },
      transferRules: {
        ...originalMetadata.transferRules,
        transferCount: 0, // Reset transfer count for new ticket
      },
      cancellationRules: originalMetadata.cancellationRules,
    });

    if (!newTicketResult.success || !newTicketResult.ticket) {
      return { success: false, error: newTicketResult.error ?? 'Failed to issue new ticket' };
    }

    // Update original ticket status
    const previousMetadata = { ...originalMetadata };
    originalMetadata.status = TicketStatus.CANCELLED;
    originalTicket.state = LifecycleState.REDEEMED;
    originalTicket.updatedAt = new Date().toISOString();

    this.recordMetadataChange(
      params.originalTicketId,
      previousMetadata,
      originalMetadata,
      params.actor.actorId,
      `Rebooked to ${newTicketResult.ticket.id}: ${params.reason}`
    );

    // Create rebook record for audit trail
    const rebookRecord: RebookRecord = {
      id: uuidv4(),
      originalTicketId: params.originalTicketId,
      newTicketId: newTicketResult.ticket.id,
      reason: params.reason,
      rebookedAt: new Date().toISOString(),
      rebookedBy: params.actor.actorId,
      fareDifference,
      refundAmount,
      notes: params.notes,
    };

    this.rebookRecords.set(rebookRecord.id, rebookRecord);

    // Link tickets in metadata for traceability
    const newMetadata = newTicketResult.ticket.metadata as unknown as AirlineTicketMetadata & {
      rebookedFrom?: string;
    };
    (newMetadata as unknown as Record<string, unknown>)['rebookedFrom'] = params.originalTicketId;

    return {
      success: true,
      newTicket: newTicketResult.ticket,
      rebookRecord,
    };
  }

  /**
   * Get rebook history for a ticket
   */
  getRebookHistory(ticketId: string): RebookRecord[] {
    const records: RebookRecord[] = [];

    for (const record of Array.from(this.rebookRecords.values())) {
      if (record.originalTicketId === ticketId || record.newTicketId === ticketId) {
        records.push(record);
      }
    }

    return records.sort((a, b) => a.rebookedAt.localeCompare(b.rebookedAt));
  }

  /**
   * Get the original ticket for a rebooked ticket
   */
  getOriginalTicket(ticketId: string): RightModel | undefined {
    const metadata = this.tickets.get(ticketId)?.metadata as Record<string, unknown>;
    if (metadata?.rebookedFrom) {
      return this.tickets.get(metadata.rebookedFrom as string);
    }
    return undefined;
  }

  // ============================================================================
  // VERSIONED METADATA (TC-10)
  // ============================================================================

  /**
   * Get metadata version history for a ticket
   */
  getMetadataVersions(ticketId: string): MetadataVersion[] {
    return this.metadataVersions.get(ticketId) ?? [];
  }

  /**
   * Get verification logs for a ticket
   */
  getVerificationLogs(ticketId: string): VerificationLog[] {
    return this.verificationLogs.get(ticketId) ?? [];
  }

  // ============================================================================
  // REVOCATION & OVERRIDE POWERS (Requirement F)
  // ============================================================================

  /**
   * Revoke a ticket (forced invalidation by airline)
   */
  revokeTicket(params: {
    ticketId: string;
    actor: ActorContext;
    reason: RevocationReason;
    description?: string;
    issueRefund: boolean;
  }): { success: boolean; record?: RevocationRecord; error?: string } {
    this.enforcePermission(params.actor, 'BULK_UPDATE', params.ticketId); // Admin-only

    const ticket = this.tickets.get(params.ticketId);
    if (!ticket) {
      return { success: false, error: 'Ticket not found' };
    }

    const metadata = ticket.metadata as unknown as AirlineTicketMetadata;

    if (metadata.revoked) {
      return { success: false, error: 'Ticket already revoked' };
    }

    // Calculate refund if applicable
    let refundAmount: string | undefined;
    if (params.issueRefund && metadata.cancellationRules.refundable) {
      const fareTotal = parseFloat(metadata.fare.total);
      // Full refund for fraud/regulatory - no fee
      if ([RevocationReason.REGULATORY_ORDER, RevocationReason.SYSTEM_ERROR].includes(params.reason)) {
        refundAmount = fareTotal.toFixed(2);
      } else {
        const fee = parseFloat(metadata.cancellationRules.cancellationFee);
        refundAmount = Math.max(0, fareTotal - fee).toFixed(2);
      }
    }

    // Update ticket
    const previousMetadata = { ...metadata };
    metadata.revoked = true;
    metadata.revocationInfo = {
      revokedAt: new Date().toISOString(),
      reason: params.reason,
      refundIssued: !!refundAmount,
    };
    metadata.status = TicketStatus.CANCELLED;
    ticket.state = LifecycleState.REDEEMED;
    ticket.updatedAt = new Date().toISOString();

    // Record revocation
    const record: RevocationRecord = {
      id: uuidv4(),
      ticketId: params.ticketId,
      revokedAt: new Date().toISOString(),
      revokedBy: params.actor.actorId,
      reason: params.reason,
      description: params.description,
      passengerNotified: false, // Would be handled by notification system
      refundIssued: !!refundAmount,
      refundAmount,
      appealable: ![RevocationReason.FRAUD_DETECTED, RevocationReason.SANCTIONS_MATCH].includes(params.reason),
      appealDeadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
    };

    this.revocationRecords.set(record.id, record);
    this.recordMetadataChange(params.ticketId, previousMetadata, metadata, params.actor.actorId, `Revoked: ${params.reason}`);
    this.emitEvent(AirlineEventType.TICKET_REVOKED, params.ticketId, { reason: params.reason, refundAmount });

    return { success: true, record };
  }

  /**
   * Force reassign a ticket to another passenger (override power)
   */
  forceReassign(params: {
    ticketId: string;
    actor: ActorContext;
    authorizedBy: string;  // Senior approval required
    newPassenger: {
      name: string;
      identity?: AirlineTicketMetadata['passengerIdentity'];
    };
    reason: string;
    regulatoryReference?: string;
  }): { success: boolean; override?: OverrideRecord; error?: string } {
    this.enforcePermission(params.actor, 'BULK_UPDATE', params.ticketId);

    const ticket = this.tickets.get(params.ticketId);
    if (!ticket) {
      return { success: false, error: 'Ticket not found' };
    }

    const metadata = ticket.metadata as unknown as AirlineTicketMetadata;

    if (metadata.revoked) {
      return { success: false, error: 'Cannot reassign revoked ticket' };
    }

    if (metadata.frozen) {
      return { success: false, error: 'Cannot reassign frozen ticket - unfreeze first' };
    }

    const previousState = {
      passengerName: metadata.passengerName,
      passengerIdentity: metadata.passengerIdentity,
    };

    // Update passenger
    metadata.passengerName = params.newPassenger.name;
    metadata.passengerIdentity = params.newPassenger.identity;
    metadata.kycStatus = {
      verified: !!params.newPassenger.identity,
      verifiedAt: params.newPassenger.identity ? new Date().toISOString() : undefined,
      sanctionsCleared: false, // Must be re-verified
    };
    ticket.name = `${metadata.issuingAirline.code} ${metadata.segments[0]?.flightNumber} - ${params.newPassenger.name}`;
    ticket.updatedAt = new Date().toISOString();

    // Record override
    const override: OverrideRecord = {
      id: uuidv4(),
      ticketId: params.ticketId,
      overrideType: 'REASSIGN',
      previousState,
      newState: {
        passengerName: params.newPassenger.name,
        passengerIdentity: params.newPassenger.identity,
      },
      overriddenAt: new Date().toISOString(),
      overriddenBy: params.actor.actorId,
      authorizedBy: params.authorizedBy,
      reason: params.reason,
      regulatoryReference: params.regulatoryReference,
    };

    const overrides = this.overrideRecords.get(params.ticketId) ?? [];
    overrides.push(override);
    this.overrideRecords.set(params.ticketId, overrides);

    this.recordMetadataChange(
      params.ticketId,
      { ...metadata, passengerName: previousState.passengerName } as AirlineTicketMetadata,
      metadata,
      params.actor.actorId,
      `Force reassign: ${params.reason}`
    );

    return { success: true, override };
  }

  /**
   * Freeze a ticket (regulatory or security hold)
   */
  freezeTicket(params: {
    ticketId: string;
    actor: ActorContext;
    reason: FreezeRecord['reason'];
    description?: string;
    expiresAt?: string;
  }): { success: boolean; freeze?: FreezeRecord; error?: string } {
    this.enforcePermission(params.actor, 'BULK_UPDATE', params.ticketId);

    const ticket = this.tickets.get(params.ticketId);
    if (!ticket) {
      return { success: false, error: 'Ticket not found' };
    }

    const metadata = ticket.metadata as unknown as AirlineTicketMetadata;

    if (metadata.frozen) {
      return { success: false, error: 'Ticket already frozen' };
    }

    if (metadata.revoked) {
      return { success: false, error: 'Cannot freeze revoked ticket' };
    }

    // Freeze the ticket
    metadata.frozen = true;
    metadata.freezeInfo = {
      frozenAt: new Date().toISOString(),
      reason: params.description ?? params.reason,
      expiresAt: params.expiresAt,
    };
    ticket.updatedAt = new Date().toISOString();

    // Record freeze
    const freeze: FreezeRecord = {
      id: uuidv4(),
      ticketId: params.ticketId,
      frozenAt: new Date().toISOString(),
      frozenBy: params.actor.actorId,
      reason: params.reason,
      description: params.description,
      expiresAt: params.expiresAt,
    };

    const freezes = this.freezeRecords.get(params.ticketId) ?? [];
    freezes.push(freeze);
    this.freezeRecords.set(params.ticketId, freezes);

    this.emitEvent(AirlineEventType.REGULATORY_HOLD, params.ticketId, { reason: params.reason });

    return { success: true, freeze };
  }

  /**
   * Unfreeze a ticket
   */
  unfreezeTicket(params: {
    ticketId: string;
    actor: ActorContext;
  }): { success: boolean; error?: string } {
    this.enforcePermission(params.actor, 'BULK_UPDATE', params.ticketId);

    const ticket = this.tickets.get(params.ticketId);
    if (!ticket) {
      return { success: false, error: 'Ticket not found' };
    }

    const metadata = ticket.metadata as unknown as AirlineTicketMetadata;

    if (!metadata.frozen) {
      return { success: false, error: 'Ticket is not frozen' };
    }

    // Unfreeze
    metadata.frozen = false;
    metadata.freezeInfo = undefined;
    ticket.updatedAt = new Date().toISOString();

    // Update freeze record
    const freezes = this.freezeRecords.get(params.ticketId) ?? [];
    const lastFreeze = freezes[freezes.length - 1];
    if (lastFreeze) {
      lastFreeze.unfrozenAt = new Date().toISOString();
      lastFreeze.unfrozenBy = params.actor.actorId;
    }

    return { success: true };
  }

  /**
   * Emergency invalidation (immediate, no refund)
   */
  emergencyInvalidate(params: {
    ticketId: string;
    actor: ActorContext;
    authorizedBy: string;
    reason: string;
  }): { success: boolean; error?: string } {
    return this.revokeTicket({
      ticketId: params.ticketId,
      actor: params.actor,
      reason: RevocationReason.SECURITY_THREAT,
      description: `EMERGENCY: ${params.reason} (Authorized by: ${params.authorizedBy})`,
      issueRefund: false,
    });
  }

  // ============================================================================
  // CUSTODY & RECOVERY (Requirement E)
  // ============================================================================

  /**
   * Initiate recovery for lost/stolen device
   */
  initiateRecovery(params: {
    ticketId: string;
    requestedBy: string;
    reason: RecoveryRequest['reason'];
    verificationMethod: RecoveryRequest['verificationMethod'];
    recoveryDestination?: string;
  }): { success: boolean; request?: RecoveryRequest; error?: string } {
    const ticket = this.tickets.get(params.ticketId);
    if (!ticket) {
      return { success: false, error: 'Ticket not found' };
    }

    const metadata = ticket.metadata as unknown as AirlineTicketMetadata;

    if (metadata.revoked) {
      return { success: false, error: 'Cannot recover revoked ticket' };
    }

    // Check if there's already a pending recovery
    const existingRequests = this.recoveryRequests.get(params.ticketId) ?? [];
    const pendingRequest = existingRequests.find(r => r.status === 'PENDING' || r.status === 'VERIFIED');
    if (pendingRequest) {
      return { success: false, error: 'Recovery already in progress' };
    }

    const request: RecoveryRequest = {
      id: uuidv4(),
      ticketId: params.ticketId,
      requestedAt: new Date().toISOString(),
      requestedBy: params.requestedBy,
      reason: params.reason,
      verificationMethod: params.verificationMethod,
      verified: false,
      recoveryDestination: params.recoveryDestination,
      status: 'PENDING',
    };

    existingRequests.push(request);
    this.recoveryRequests.set(params.ticketId, existingRequests);

    this.emitEvent(AirlineEventType.RECOVERY_REQUESTED, params.ticketId, {
      reason: params.reason,
      method: params.verificationMethod,
    });

    return { success: true, request };
  }

  /**
   * Verify recovery request (called after identity verification)
   */
  verifyRecovery(params: {
    requestId: string;
    actor: ActorContext;
  }): { success: boolean; error?: string } {
    // Find the request
    for (const [ticketId, requests] of Array.from(this.recoveryRequests.entries())) {
      const request = requests.find(r => r.id === params.requestId);
      if (request) {
        this.enforcePermission(params.actor, 'BULK_UPDATE', ticketId);

        if (request.status !== 'PENDING') {
          return { success: false, error: `Cannot verify request in status ${request.status}` };
        }

        request.verified = true;
        request.verifiedAt = new Date().toISOString();
        request.verifiedBy = params.actor.actorId;
        request.status = 'VERIFIED';

        return { success: true };
      }
    }

    return { success: false, error: 'Recovery request not found' };
  }

  /**
   * Complete recovery (transfer ticket to new wallet/account)
   */
  completeRecovery(params: {
    requestId: string;
    actor: ActorContext;
    newDestination?: string;
  }): { success: boolean; error?: string } {
    for (const [ticketId, requests] of Array.from(this.recoveryRequests.entries())) {
      const request = requests.find(r => r.id === params.requestId);
      if (request) {
        this.enforcePermission(params.actor, 'BULK_UPDATE', ticketId);

        if (request.status !== 'VERIFIED') {
          return { success: false, error: 'Recovery must be verified first' };
        }

        request.status = 'COMPLETED';
        request.completedAt = new Date().toISOString();
        if (params.newDestination) {
          request.recoveryDestination = params.newDestination;
        }

        this.emitEvent(AirlineEventType.RECOVERY_COMPLETED, ticketId, {
          requestId: params.requestId,
          destination: request.recoveryDestination,
        });

        return { success: true };
      }
    }

    return { success: false, error: 'Recovery request not found' };
  }

  /**
   * Get recovery requests for a ticket
   */
  getRecoveryRequests(ticketId: string): RecoveryRequest[] {
    return this.recoveryRequests.get(ticketId) ?? [];
  }

  /**
   * Get override history for a ticket
   */
  getOverrideHistory(ticketId: string): OverrideRecord[] {
    return this.overrideRecords.get(ticketId) ?? [];
  }

  /**
   * Get freeze history for a ticket
   */
  getFreezeHistory(ticketId: string): FreezeRecord[] {
    return this.freezeRecords.get(ticketId) ?? [];
  }

  // ============================================================================
  // SANCTIONS & KYC (Requirement C)
  // ============================================================================

  /**
   * Clear sanctions check for a ticket
   */
  clearSanctionsCheck(params: {
    ticketId: string;
    actor: ActorContext;
    clearanceReference?: string;
  }): { success: boolean; error?: string } {
    this.enforcePermission(params.actor, 'BULK_UPDATE', params.ticketId);

    const ticket = this.tickets.get(params.ticketId);
    if (!ticket) {
      return { success: false, error: 'Ticket not found' };
    }

    const metadata = ticket.metadata as unknown as AirlineTicketMetadata;
    metadata.kycStatus.sanctionsCleared = true;
    metadata.kycStatus.sanctionsClearedAt = new Date().toISOString();
    ticket.updatedAt = new Date().toISOString();

    return { success: true };
  }

  /**
   * Flag sanctions alert (blocks ticket operations)
   */
  flagSanctionsAlert(params: {
    ticketId: string;
    actor: ActorContext;
    matchDetails: string;
  }): { success: boolean; error?: string } {
    this.enforcePermission(params.actor, 'BULK_UPDATE', params.ticketId);

    // Freeze the ticket
    this.freezeTicket({
      ticketId: params.ticketId,
      actor: params.actor,
      reason: 'SANCTIONS',
      description: params.matchDetails,
    });

    this.emitEvent(AirlineEventType.SANCTIONS_ALERT, params.ticketId, { matchDetails: params.matchDetails });

    return { success: true };
  }

  // ============================================================================
  // WEBHOOK & EVENT MANAGEMENT (Requirement D)
  // ============================================================================

  /**
   * Register a webhook endpoint
   */
  registerWebhook(config: AirlineWebhookConfig): void {
    this.webhookConfigs.set(config.endpointId, config);
  }

  /**
   * Unregister a webhook endpoint
   */
  unregisterWebhook(endpointId: string): boolean {
    return this.webhookConfigs.delete(endpointId);
  }

  /**
   * Get all events for a ticket
   */
  getTicketEvents(ticketId: string): AirlineEvent[] {
    return this.events.filter(e => e.ticketId === ticketId);
  }

  /**
   * Get events by type
   */
  getEventsByType(type: AirlineEventType, since?: string): AirlineEvent[] {
    return this.events.filter(e => {
      if (e.type !== type) return false;
      if (since && e.occurredAt < since) return false;
      return true;
    });
  }

  /**
   * Emit an event and trigger webhooks
   */
  private emitEvent(
    type: AirlineEventType,
    ticketId: string,
    data: Record<string, unknown>,
    pnr?: string
  ): void {
    const event: AirlineEvent = {
      id: uuidv4(),
      type,
      ticketId,
      occurredAt: new Date().toISOString(),
      data,
      pnr,
    };

    this.events.push(event);

    // Trigger webhooks (in real implementation, this would be async/queued)
    for (const config of Array.from(this.webhookConfigs.values())) {
      if (config.active && config.events.includes(type)) {
        // Would send webhook in real implementation
        // this.sendWebhook(config, event);
      }
    }
  }

  // ============================================================================
  // QUERY METHODS
  // ============================================================================

  /**
   * Get all tickets for a flight
   */
  getTicketsByFlight(flightNumber: string, airlineCode: string, departureDate: string): RightModel[] {
    const flightKey = `${airlineCode}:${flightNumber}:${departureDate}`;
    const ticketIds = this.ticketsByFlight.get(flightKey);

    if (!ticketIds) return [];

    return Array.from(ticketIds)
      .map(id => this.tickets.get(id))
      .filter((t): t is RightModel => t !== undefined);
  }

  /**
   * Get all tickets for a passenger
   */
  getTicketsByPassenger(passengerName: string): RightModel[] {
    return Array.from(this.tickets.values()).filter(ticket => {
      const metadata = ticket.metadata as unknown as AirlineTicketMetadata;
      return metadata.passengerName === passengerName;
    });
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  /**
   * Get valid status transitions
   */
  private getValidStatusTransitions(currentStatus: TicketStatus): TicketStatus[] {
    const transitions: Record<TicketStatus, TicketStatus[]> = {
      [TicketStatus.ISSUED]: [TicketStatus.CONFIRMED, TicketStatus.CHECKED_IN, TicketStatus.CANCELLED],
      [TicketStatus.CONFIRMED]: [TicketStatus.CHECKED_IN, TicketStatus.CANCELLED],
      [TicketStatus.CHECKED_IN]: [TicketStatus.BOARDED, TicketStatus.CANCELLED, TicketStatus.NO_SHOW],
      [TicketStatus.BOARDED]: [TicketStatus.COMPLETED],
      [TicketStatus.COMPLETED]: [],
      [TicketStatus.CANCELLED]: [TicketStatus.REFUNDED],
      [TicketStatus.REFUNDED]: [],
      [TicketStatus.NO_SHOW]: [TicketStatus.REFUNDED],
    };

    return transitions[currentStatus] ?? [];
  }

  /**
   * Record metadata change for versioning
   */
  private recordMetadataChange(
    ticketId: string,
    previousMetadata: AirlineTicketMetadata,
    newMetadata: AirlineTicketMetadata,
    changedBy: string,
    changeReason: string
  ): void {
    const versions = this.metadataVersions.get(ticketId) ?? [];
    const previousVersion = versions[versions.length - 1];

    // Calculate changes
    const changes: Record<string, { old: unknown; new: unknown }> = {};

    if (previousMetadata.status !== newMetadata.status) {
      changes.status = { old: previousMetadata.status, new: newMetadata.status };
    }
    if (previousMetadata.passengerName !== newMetadata.passengerName) {
      changes.passengerName = { old: previousMetadata.passengerName, new: newMetadata.passengerName };
    }
    if (previousMetadata.transferRules.transferCount !== newMetadata.transferRules.transferCount) {
      changes.transferCount = {
        old: previousMetadata.transferRules.transferCount,
        new: newMetadata.transferRules.transferCount,
      };
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

  /**
   * Hash metadata for integrity verification
   */
  private hashMetadata(metadata: AirlineTicketMetadata): string {
    const hashInput = JSON.stringify({
      eTicketNumber: metadata.eTicketNumber,
      bookingReference: metadata.bookingReference,
      passengerName: metadata.passengerName,
      status: metadata.status,
      segments: metadata.segments,
      fare: metadata.fare,
    });

    return createHash('sha256').update(hashInput).digest('hex');
  }

  private executeTransfer(request: TransferRequest): void {
    const ticket = this.tickets.get(request.ticketId);
    if (!ticket) return;

    const metadata = ticket.metadata as unknown as AirlineTicketMetadata;

    // Record transfer in history
    const transferRecord: TicketTransferRecord = {
      id: request.id,
      from: {
        name: request.fromPassenger,
        identity: metadata.passengerIdentity?.number,
      },
      to: {
        name: request.toPassenger.name,
        identity: request.toPassenger.identity?.number,
      },
      requestedAt: request.requestedAt,
      approvalStatus: request.status,
      approvedAt: request.approvedAt,
      approvedBy: request.approvedBy,
      nameChangeFee: request.nameChangeFee,
    };
    metadata.transferHistory.push(transferRecord);

    // Update passenger details
    metadata.passengerName = request.toPassenger.name;
    metadata.passengerIdentity = request.toPassenger.identity;
    metadata.transferRules.transferCount++;

    ticket.name = `${metadata.issuingAirline.code} ${metadata.segments[0]?.flightNumber} - ${request.toPassenger.name}`;
    ticket.updatedAt = new Date().toISOString();
  }

  private hashIdentity(identity: AirlineTicketMetadata['passengerIdentity']): string {
    if (!identity) return '';
    return `${identity.type}:${identity.country}:${identity.number}`;
  }
}

// ============================================================================
// ASSET PACK DEFINITION
// ============================================================================

export const AIRLINE_TICKET_PACK: AssetPack = {
  id: 'AIRLINE_TICKET',
  name: 'Airline Ticket Resale',
  description: 'Transferable airline tickets with issuer approval workflow, name change fees, and cancellation rules',
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
        { type: 'APPROVAL', approvals: [{ role: 'AIRLINE', count: 1 }] },
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
        { type: 'APPROVAL', approvals: [{ role: 'AIRLINE', count: 1 }] },
      ],
      actions: [{ type: 'EMIT_EVENT', params: { event: 'TRANSFER_APPROVED' } }],
      description: 'Approve transfer',
    },
    {
      from: LifecycleState.ACTIVE,
      to: LifecycleState.REDEEMED,
      conditions: [
        { type: 'CUSTOM', customCondition: 'FLIGHT_COMPLETED' },
      ],
      actions: [{ type: 'EMIT_EVENT', params: { event: 'FLIGHT_COMPLETED' } }],
      description: 'Flight completed',
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
    {
      from: LifecycleState.REDEEMED,
      to: LifecycleState.REDEEMED,
      conditions: [
        { type: 'CUSTOM', customCondition: 'REFUND_PROCESSED' },
      ],
      actions: [
        { type: 'EMIT_EVENT', params: { event: 'REFUND_ISSUED' } },
        { type: 'BURN', params: {} },
      ],
      description: 'Process refund',
    },
  ],

  complianceRules: [
    {
      id: 'TRANSFER_APPROVAL',
      name: 'Transfer Requires Approval',
      type: 'CUSTOM',
      params: { requireIssuerApproval: true, allowIdentityBypass: true },
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
      params: { deadlineHoursBeforeDeparture: 24 },
      severity: 'BLOCK',
    },
  ],

  requiredVerifications: [
    {
      type: 'IDENTITY_VERIFICATION',
      description: 'Passenger identity verification (optional for auto-approval)',
      allowedVerifiers: ['AIRLINE', 'IDENTITY_PROVIDER'],
      mandatory: false,
    },
  ],

  metadataSchema: {
    bookingReference: { type: 'string', required: true, description: 'Booking reference / PNR' },
    eTicketNumber: { type: 'string', required: true, description: 'E-ticket number' },
    passengerName: { type: 'string', required: true, description: 'Passenger name' },
    segments: { type: 'array', required: true, description: 'Flight segments' },
    fare: { type: 'object', required: true, description: 'Fare information' },
    transferRules: { type: 'object', required: true, description: 'Transfer rules' },
    cancellationRules: { type: 'object', required: true, description: 'Cancellation rules' },
  },

  tags: ['airline', 'ticket', 'travel', 'conditional-transfer', 'approval-workflow'],
};

export default AirlineTicketEngine;
