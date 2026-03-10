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
import type {
  RightModel,
  ComplianceContext,
  PolicyDecision,
  ComplianceEngine,
  DecisionReceipt,
  AssetPack,
  StateContext,
  IIdentityRegistry,
  ICrossPackEventBus,
  IAuditLog,
  PortableComplianceRegistry,
} from '@tokenisation/core';
import {
  LifecycleState,
  RightType,
  TransferabilityMode,
  ComplianceAction,
  AssetType,
  InvestorClass,
  LiquidityProfile,
  FractionalizationType,
  StateMachine,
} from '@tokenisation/core';
import {
  AIRLINE_TICKET_STATE_MACHINE,
  AirlineTicketState,
  AirlineTicketEvent,
  AirlineTicketErrorCode,
  type AirlineTicketOperationContext,
  transferWindowGuard,
  postCheckInLockGuard,
  transferCountGuard,
  mapLegacyStatusToState,
  mapStateToLegacyStatus,
} from './AirlineTicketStateMachine.js';

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
  /** Initial state - ticket record created but not yet issued */
  CREATED = 'CREATED',
  ISSUED = 'ISSUED',
  CONFIRMED = 'CONFIRMED',
  CHECKED_IN = 'CHECKED_IN',
  BOARDED = 'BOARDED',
  COMPLETED = 'COMPLETED',
  /** Ticket used and flight completed */
  USED = 'USED',
  /** Ticket lifecycle closed normally */
  CLOSED = 'CLOSED',
  CANCELLED = 'CANCELLED',
  REFUNDED = 'REFUNDED',
  NO_SHOW = 'NO_SHOW',
  /** Ticket has expired */
  EXPIRED = 'EXPIRED',
  /** Terminal state - ticket is void and cannot be used */
  VOID = 'VOID',
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
  /** Idempotency key for deduplication (AT-11) */
  idempotencyKey?: string;
  /** Resale fee/royalty amount (AT-09) */
  resaleFee?: string;
  /** Payment reference for fee collection */
  paymentReference?: string;
}

// ============================================================================
// RESALE FEE TYPES (AT-09)
// ============================================================================

export interface ResaleFeeConfig {
  /** Percentage of resale value as fee (e.g., 0.05 = 5%) */
  feePercentage: number;
  /** Minimum fee amount */
  minimumFee: string;
  /** Maximum fee cap */
  maximumFee?: string;
  /** Treasury address for fee collection */
  treasuryAddress: string;
  /** Whether fee is required before transfer */
  feeRequired: boolean;
}

export interface ResaleFeeLedgerEntry {
  id: string;
  transferRequestId: string;
  ticketId: string;
  resaleValue: string;
  feeAmount: string;
  feePercentage: number;
  treasuryAddress: string;
  paymentReference?: string;
  status: 'PENDING' | 'COLLECTED' | 'WAIVED';
  createdAt: string;
  collectedAt?: string;
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
    byStatus: Partial<Record<TicketStatus, number>>;
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
  /** Signing secret for HMAC signing (PR-04) */
  secret: string;
  /** Whether endpoint is active */
  active: boolean;
  /** Retry policy */
  retryPolicy: {
    maxRetries: number;
    backoffMs: number;
  };
}

// ============================================================================
// WEBHOOK SECURITY TYPES (PR-04)
// ============================================================================

export interface WebhookDelivery {
  id: string;
  eventId: string;
  endpointId: string;
  url: string;
  payload: string;
  signature: string;
  timestamp: string;
  nonce: string;
  attemptCount: number;
  status: 'PENDING' | 'DELIVERED' | 'FAILED' | 'DEAD_LETTER';
  lastAttemptAt?: string;
  nextRetryAt?: string;
  responseCode?: number;
  responseBody?: string;
  error?: string;
}

export interface DeadLetterEntry {
  id: string;
  deliveryId: string;
  eventId: string;
  endpointId: string;
  payload: string;
  failedAt: string;
  reason: string;
  attemptCount: number;
  /** Can be manually retried */
  retriable: boolean;
}

export interface WebhookPayloadWithSecurity {
  /** Event data */
  event: AirlineEvent;
  /** HMAC-SHA256 signature */
  signature: string;
  /** Timestamp for replay protection */
  timestamp: string;
  /** Unique nonce for replay protection */
  nonce: string;
  /** Webhook delivery ID for idempotency */
  deliveryId: string;
}

// ============================================================================
// AUDIT LOG TYPES (PR-03)
// ============================================================================

export interface AuditLogEntry {
  id: string;
  /** Who performed the action */
  actor: {
    id: string;
    role: AirlineRole;
    airlineCode?: string;
  };
  /** What action was performed */
  action: string;
  /** What resource was affected */
  resource: {
    type: 'TICKET' | 'TRANSFER_REQUEST' | 'WEBHOOK' | 'AIRLINE' | 'SYSTEM';
    id: string;
  };
  /** When the action occurred */
  timestamp: string;
  /** Why the action was performed (optional reason) */
  reason?: string;
  /** Before state (for changes) */
  before?: Record<string, unknown>;
  /** After state (for changes) */
  after?: Record<string, unknown>;
  /** Request metadata */
  metadata?: {
    ipAddress?: string;
    userAgent?: string;
    idempotencyKey?: string;
    correlationId?: string;
  };
  /** Whether action succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
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
  /** State machine for formal state transition enforcement */
  private stateMachine: StateMachine;
  /** Tracks ticket states separately from TicketStatus for state machine */
  private ticketStates: Map<string, AirlineTicketState> = new Map();
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

  // Idempotency tracking (AT-11, PR-02)
  private transferIdempotencyKeys: Map<string, string> = new Map(); // key -> requestId
  private operationIdempotencyKeys: Map<string, { result: unknown; expiresAt: number }> = new Map(); // key -> { result, expiry }
  private idempotencyTTLMs: number = 24 * 60 * 60 * 1000; // 24 hours default

  // Resale fee tracking (AT-09)
  private resaleFeeConfig?: ResaleFeeConfig;
  private resaleFeeLedger: Map<string, ResaleFeeLedgerEntry> = new Map();

  // External system adapters (Requirement D)
  private pssAdapter?: IPSSAdapter;
  private dcsAdapter?: IDCSAdapter;

  // Webhook delivery tracking (PR-04)
  private webhookDeliveries: Map<string, WebhookDelivery> = new Map();
  private deadLetterQueue: Map<string, DeadLetterEntry> = new Map();
  private webhookTimeout: number = 5000; // 5 seconds default

  // Audit log (PR-03)
  private auditLog: AuditLogEntry[] = [];

  // ComplianceEngine for transfer validation (integrated compliance checks)
  private complianceEngine?: ComplianceEngine;

  // Cross-pack orchestration dependencies (optional)
  private identityRegistry?: IIdentityRegistry;
  private crossPackEventBus?: ICrossPackEventBus;
  private crossPackAuditLog?: IAuditLog;
  private complianceRegistry?: PortableComplianceRegistry;

  constructor(config?: {
    distributedLock?: IDistributedLock;
    pssAdapter?: IPSSAdapter;
    dcsAdapter?: IDCSAdapter;
    resaleFeeConfig?: ResaleFeeConfig;
    webhookTimeout?: number;
    idempotencyTTLMs?: number;
    /** ComplianceEngine for enhanced transfer validation (lifecycle state, price cap, etc.) */
    complianceEngine?: ComplianceEngine;
    identityRegistry?: IIdentityRegistry;
    eventBus?: ICrossPackEventBus;
    auditLog?: IAuditLog;
    complianceRegistry?: PortableComplianceRegistry;
  }) {
    this.distributedLock = config?.distributedLock ?? new InMemoryDistributedLock();
    this.pssAdapter = config?.pssAdapter;
    this.dcsAdapter = config?.dcsAdapter;
    this.resaleFeeConfig = config?.resaleFeeConfig;
    this.complianceEngine = config?.complianceEngine;
    this.identityRegistry = config?.identityRegistry;
    this.crossPackEventBus = config?.eventBus;
    this.crossPackAuditLog = config?.auditLog;
    this.complianceRegistry = config?.complianceRegistry;
    if (config?.webhookTimeout) this.webhookTimeout = config.webhookTimeout;
    if (config?.idempotencyTTLMs) this.idempotencyTTLMs = config.idempotencyTTLMs;

    // Initialize state machine with airline ticket configuration
    this.stateMachine = new StateMachine(AIRLINE_TICKET_STATE_MACHINE);

    // Add global guards for transfer validation
    this.stateMachine.addGlobalGuard(transferWindowGuard);
    this.stateMachine.addGlobalGuard(postCheckInLockGuard);
    this.stateMachine.addGlobalGuard(transferCountGuard);
  }

  /**
   * Set the compliance engine for enhanced transfer validation
   */
  setComplianceEngine(engine: ComplianceEngine): void {
    this.complianceEngine = engine;
  }

  /**
   * Get the compliance engine
   */
  getComplianceEngine(): ComplianceEngine | undefined {
    return this.complianceEngine;
  }

  /**
   * Evaluate transfer compliance through the ComplianceEngine
   *
   * This provides enhanced validation including:
   * - Lifecycle state check (blocks transfers from REDEEMED, EXPIRED, etc.)
   * - Price cap enforcement (110% anti-scalping rule)
   * - KYC/AML checks if configured
   *
   * @param ticket The ticket (RightModel) being transferred
   * @param from Sender identity
   * @param to Recipient identity
   * @param toIdentityHash Optional identity hash of recipient
   * @param transferPrice Optional transfer price for anti-scalping check
   */
  private async evaluateTransferCompliance(
    ticket: RightModel,
    from: string,
    to: string,
    toIdentityHash?: string,
    transferPrice?: string
  ): Promise<{ decision: PolicyDecision; receipt?: DecisionReceipt }> {
    if (!this.complianceEngine) {
      // No compliance engine - return allow by default
      return {
        decision: {
          id: uuidv4(),
          action: ComplianceAction.TOKEN_TRANSFER,
          result: 'ALLOW',
          violations: [],
          warnings: [],
          policyVersion: '0.0.0',
          policyHash: '',
          evaluatedAt: new Date().toISOString(),
        },
      };
    }

    const metadata = ticket.metadata as unknown as AirlineTicketMetadata;

    // Build compliance context
    const context: ComplianceContext = {
      assetId: ticket.id,
      asset: ticket,
      actorId: from,
      recipientId: toIdentityHash || to,
      amount: '1', // NFT transfer is always 1
      metadata: {
        ticketClass: metadata.segments[0]?.class,
        airline: metadata.segments[0]?.airline,
        transferPrice,
        mintPrice: metadata.fare?.total, // Original ticket price
        priceCapPercent: 110, // 110% anti-scalping rule for airline tickets
      },
    };

    // Evaluate through ComplianceEngine
    return this.complianceEngine.evaluate(ComplianceAction.TOKEN_TRANSFER, context);
  }

  /**
   * Configure resale fee (AT-09)
   */
  setResaleFeeConfig(config: ResaleFeeConfig): void {
    this.resaleFeeConfig = config;
  }

  /**
   * Get resale fee ledger entries
   */
  getResaleFeeLedger(): ResaleFeeLedgerEntry[] {
    return Array.from(this.resaleFeeLedger.values());
  }

  /**
   * Get treasury balance (sum of collected fees)
   */
  getTreasuryBalance(): { total: string; pending: string; collected: string } {
    let pending = 0;
    let collected = 0;

    for (const entry of Array.from(this.resaleFeeLedger.values())) {
      const amount = parseFloat(entry.feeAmount);
      if (entry.status === 'PENDING') pending += amount;
      if (entry.status === 'COLLECTED') collected += amount;
    }

    return {
      total: (pending + collected).toFixed(2),
      pending: pending.toFixed(2),
      collected: collected.toFixed(2),
    };
  }

  /**
   * Get transfer request by idempotency key (AT-11)
   */
  private getTransferByIdempotencyKey(key: string): TransferRequest | undefined {
    const requestId = this.transferIdempotencyKeys.get(key);
    if (requestId) {
      return this.transferRequests.get(requestId);
    }
    return undefined;
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
    this.identityRegistry?.verify(identityHash, 'AIRLINE');
  }

  // ============================================================================
  // STATE MACHINE METHODS
  // ============================================================================

  /**
   * Get current state of a ticket using the formal state machine
   */
  getCurrentState(ticketId: string): AirlineTicketState | undefined {
    // First check if we have the state cached
    const cachedState = this.ticketStates.get(ticketId);
    if (cachedState) {
      return cachedState;
    }

    // Fall back to deriving from ticket metadata
    const ticket = this.tickets.get(ticketId);
    if (!ticket) {
      return undefined;
    }

    const metadata = ticket.metadata as unknown as AirlineTicketMetadata;
    return mapLegacyStatusToState(metadata.status);
  }

  /**
   * Set the state of a ticket (internal use)
   */
  private setTicketState(ticketId: string, state: AirlineTicketState): void {
    this.ticketStates.set(ticketId, state);
    this.stateMachine.setState(ticketId, state);
  }

  /**
   * Attempt a state transition using the state machine with guards
   * @returns Result with success status and any guard failures
   */
  async tryTransition(params: {
    ticketId: string;
    event: AirlineTicketEvent;
    actorId: string;
    actorRoles?: string[];
    /** Additional context for guards */
    operationContext?: Partial<AirlineTicketOperationContext>;
  }): Promise<{
    success: boolean;
    previousState?: AirlineTicketState;
    newState?: AirlineTicketState;
    error?: string;
    errorCode?: AirlineTicketErrorCode;
    guardFailures?: string[];
  }> {
    const ticket = this.tickets.get(params.ticketId);
    if (!ticket) {
      return {
        success: false,
        error: 'Ticket not found',
        errorCode: AirlineTicketErrorCode.TICKET_NOT_FOUND,
      };
    }

    const metadata = ticket.metadata as unknown as AirlineTicketMetadata;
    const currentState = this.getCurrentState(params.ticketId) ?? AirlineTicketState.CREATED;

    // Build operation context for guards
    const opContext: AirlineTicketOperationContext = {
      ticketId: params.ticketId,
      bookingRefHash: this.hashBookingRef(metadata.bookingReference),
      correlationId: uuidv4(),
      eventId: uuidv4(),
      departureTime: metadata.segments[0]?.departure?.dateTime
        ? new Date(metadata.segments[0].departure.dateTime)
        : undefined,
      transferCount: metadata.transferRules.transferCount,
      maxTransfers: metadata.transferRules.maxTransfers,
      transferDeadlineHours: metadata.transferRules.transferDeadlineHours,
      ...params.operationContext,
    };

    // Find the target state for this event
    const targetState = this.getTargetStateForEvent(currentState, params.event);
    if (!targetState) {
      return {
        success: false,
        error: `No valid transition for event ${params.event} from state ${currentState}`,
        errorCode: AirlineTicketErrorCode.INVALID_TRANSITION,
      };
    }

    // Build state context
    const stateContext: StateContext = {
      assetId: params.ticketId,
      currentState,
      targetState,
      event: params.event,
      actorId: params.actorId,
      actorRoles: params.actorRoles,
      metadata: opContext as unknown as Record<string, unknown>,
      timestamp: new Date().toISOString(),
    };

    // Execute transition through state machine
    const result = await this.stateMachine.transition(stateContext);

    if (!result.success) {
      // Parse error code from guard failures if present
      let errorCode = AirlineTicketErrorCode.INVALID_TRANSITION;
      if (result.guardFailures && result.guardFailures.length > 0) {
        const firstFailure = result.guardFailures[0];
        // Extract error code from format "ERROR_CODE: message"
        const match = firstFailure.match(/^([A-Z_]+):/);
        if (match) {
          errorCode = match[1] as AirlineTicketErrorCode;
        }
      }

      return {
        success: false,
        previousState: currentState,
        error: result.error ?? 'Transition failed',
        errorCode,
        guardFailures: result.guardFailures,
      };
    }

    // Update internal state tracking
    this.setTicketState(params.ticketId, targetState as AirlineTicketState);

    // Update ticket metadata to sync with legacy status
    const newLegacyStatus = mapStateToLegacyStatus(targetState as AirlineTicketState);
    if (newLegacyStatus) {
      const previousMetadata = { ...metadata };
      metadata.status = newLegacyStatus as TicketStatus;
      ticket.updatedAt = new Date().toISOString();

      // Record the change
      this.recordMetadataChange(
        params.ticketId,
        previousMetadata,
        metadata,
        params.actorId,
        `State transition: ${params.event}`
      );
    }

    return {
      success: true,
      previousState: currentState,
      newState: targetState as AirlineTicketState,
    };
  }

  /**
   * Get target state for a given event from current state
   */
  private getTargetStateForEvent(
    currentState: AirlineTicketState,
    event: AirlineTicketEvent
  ): AirlineTicketState | undefined {
    const transition = AIRLINE_TICKET_STATE_MACHINE.transitions.find(
      (t) => t.from === currentState && t.event === event
    );
    return transition?.to as AirlineTicketState | undefined;
  }

  /**
   * Hash booking reference for correlation
   */
  private hashBookingRef(bookingRef: string): string {
    return createHash('sha256').update(bookingRef).digest('hex').substring(0, 16);
  }

  /**
   * Get valid next events from current state
   */
  getValidEvents(ticketId: string): AirlineTicketEvent[] {
    const currentState = this.getCurrentState(ticketId);
    if (!currentState) return [];

    return AIRLINE_TICKET_STATE_MACHINE.transitions
      .filter((t) => t.from === currentState)
      .map((t) => t.event as AirlineTicketEvent);
  }

  /**
   * Check if ticket is in a terminal state
   */
  isTicketTerminal(ticketId: string): boolean {
    const state = this.getCurrentState(ticketId);
    return state === AirlineTicketState.CLOSED || state === AirlineTicketState.VOID;
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
      // Deep copy to prevent mutation of original params
      transferRules: { ...params.transferRules },
      cancellationRules: { ...params.cancellationRules },
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

    // Initialize state machine state to ISSUED
    this.setTicketState(ticket.id, AirlineTicketState.ISSUED);

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

    this.crossPackAuditLog?.log({
      source: 'AIRLINE', action: 'TICKET_ISSUED',
      actorId: params.airlineCode, resourceId: ticket.id,
      success: true,
    });

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

    // Update state machine state
    this.setTicketState(params.ticketId, AirlineTicketState.CHECKED_IN);

    // Emit check-in event
    this.emitEvent(AirlineEventType.CHECK_IN_COMPLETED, params.ticketId, {
      checkedInBy: params.actor.actorId,
      checkedInAt: ticket.updatedAt,
    }, metadata.bookingReference);

    // Record version change
    this.recordMetadataChange(
      params.ticketId,
      previousMetadata,
      metadata,
      params.actor.actorId,
      'Check-in'
    );

    this.crossPackAuditLog?.log({
      source: 'AIRLINE', action: 'CHECKIN_COMPLETED',
      actorId: params.actor.actorId, resourceId: params.ticketId,
      success: true,
    });

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

      // Update state machine state
      this.setTicketState(params.ticketId, AirlineTicketState.BOARDED);

      // Emit boarding event
      this.emitEvent(AirlineEventType.BOARDING_COMPLETED, params.ticketId, {
        boardedBy: params.actor.actorId,
        boardedAt: now,
        scanLocation: params.scanLocation,
      }, metadata.bookingReference);

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

      this.crossPackAuditLog?.log({
        source: 'AIRLINE', action: 'BOARDING_COMPLETED',
        actorId: params.actor.actorId, resourceId: params.ticketId,
        success: true,
      });

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
    metadata.status = TicketStatus.USED;  // Use new USED status
    ticket.state = LifecycleState.REDEEMED;
    ticket.updatedAt = new Date().toISOString();

    // Update state machine state to USED
    this.setTicketState(params.ticketId, AirlineTicketState.USED);

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
   * Close a ticket lifecycle after flight is used
   * Transitions from USED → CLOSED state
   */
  closeTicket(params: {
    ticketId: string;
    actor: ActorContext;
  }): { success: boolean; ticket?: RightModel; error?: string; errorCode?: string } {
    this.enforcePermission(params.actor, 'BOARD', params.ticketId); // Same permission as boarding

    const ticket = this.tickets.get(params.ticketId);
    if (!ticket) {
      return { success: false, error: 'Ticket not found', errorCode: AirlineTicketErrorCode.TICKET_NOT_FOUND };
    }

    const metadata = ticket.metadata as unknown as AirlineTicketMetadata;
    const currentState = this.getCurrentState(params.ticketId);

    // Can only close from USED state
    if (currentState !== AirlineTicketState.USED && metadata.status !== TicketStatus.USED && metadata.status !== TicketStatus.COMPLETED) {
      return {
        success: false,
        error: `Cannot close from state ${currentState}. Must be USED/COMPLETED.`,
        errorCode: AirlineTicketErrorCode.INVALID_TRANSITION,
      };
    }

    const previousMetadata = { ...metadata };
    metadata.status = TicketStatus.CLOSED;
    ticket.state = LifecycleState.BURNED;
    ticket.updatedAt = new Date().toISOString();

    // Update state machine state to CLOSED
    this.setTicketState(params.ticketId, AirlineTicketState.CLOSED);

    this.recordMetadataChange(
      params.ticketId,
      previousMetadata,
      metadata,
      params.actor.actorId,
      'Ticket lifecycle closed'
    );

    return { success: true, ticket };
  }

  /**
   * Request ticket transfer (name change) with policy-driven validation
   * Implements Requirement B: Policy-Driven Transfer Engine
   *
   * When a ComplianceEngine is configured, this method also performs:
   * - Lifecycle state validation (blocks transfers from terminal states)
   * - Price cap enforcement (anti-scalping 110% rule)
   * - KYC/AML checks if configured
   */
  async requestTransfer(params: {
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
    /** Idempotency key for deduplication (AT-11) */
    idempotencyKey?: string;
    /** Actor context for RBAC enforcement (PR-01) */
    actor?: ActorContext;
    /** Transfer price for anti-scalping validation */
    transferPrice?: string;
  }): Promise<{ success: boolean; request?: TransferRequest; error?: string; errorCode?: string }> {
    // Check idempotency key first (AT-11)
    if (params.idempotencyKey) {
      const existingRequest = this.getTransferByIdempotencyKey(params.idempotencyKey);
      if (existingRequest) {
        return { success: true, request: existingRequest }; // Return existing request
      }
    }

    const ticket = this.tickets.get(params.ticketId);
    if (!ticket) {
      if (params.actor) {
        this.recordAudit({
          actor: params.actor,
          action: 'REQUEST_TRANSFER',
          resource: { type: 'TICKET', id: params.ticketId },
          success: false,
          error: 'Ticket not found',
        });
      }
      return { success: false, error: 'Ticket not found', errorCode: 'TICKET_NOT_FOUND' };
    }

    // RBAC enforcement (PR-01)
    if (params.actor) {
      try {
        this.enforcePermission(params.actor, 'REQUEST_TRANSFER', params.ticketId);
      } catch (error) {
        this.recordAudit({
          actor: params.actor,
          action: 'REQUEST_TRANSFER',
          resource: { type: 'TICKET', id: params.ticketId },
          success: false,
          error: error instanceof Error ? error.message : 'Permission denied',
        });
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Permission denied',
          errorCode: 'UNAUTHORIZED'
        };
      }
    }

    const metadata = ticket.metadata as unknown as AirlineTicketMetadata;

    // Check if ticket is revoked (Requirement F)
    if (metadata.revoked) {
      return { success: false, error: 'Cannot transfer revoked ticket', errorCode: 'TICKET_VOID' };
    }

    // Check if ticket is frozen (Requirement F)
    if (metadata.frozen) {
      return { success: false, error: 'Cannot transfer frozen ticket - contact airline support', errorCode: 'TICKET_FROZEN' };
    }

    // Check policy flags - transferability (Requirement A)
    if (!metadata.policyFlags.transferable) {
      return { success: false, error: 'Ticket is non-transferable per airline policy', errorCode: 'NON_TRANSFERABLE' };
    }

    // Check current passenger
    if (metadata.passengerName !== params.fromPassenger) {
      return { success: false, error: 'Not the current ticket holder', errorCode: 'NOT_OWNER' };
    }

    // Check ticket status - includes CHECKED_IN, BOARDED, COMPLETED, CANCELLED, REFUNDED (AT-04, AT-07)
    if (metadata.status !== TicketStatus.ISSUED && metadata.status !== TicketStatus.CONFIRMED) {
      // Specific error codes for different states
      if (metadata.status === TicketStatus.CHECKED_IN) {
        return { success: false, error: 'Ticket is locked after check-in', errorCode: 'TICKET_LOCKED_AFTER_CHECKIN' };
      }
      if (metadata.status === TicketStatus.BOARDED || metadata.status === TicketStatus.COMPLETED) {
        return { success: false, error: 'Ticket has already been used', errorCode: 'TICKET_USED' };
      }
      if (metadata.status === TicketStatus.REFUNDED) {
        return { success: false, error: 'Ticket has been voided after refund', errorCode: 'TICKET_VOID' };
      }
      if (metadata.status === TicketStatus.VOID) {
        return { success: false, error: 'Ticket is void and cannot be transferred', errorCode: 'TICKET_VOID' };
      }
      if (metadata.status === TicketStatus.CANCELLED) {
        return { success: false, error: 'Ticket has been cancelled', errorCode: 'TICKET_CANCELLED' };
      }
      return { success: false, error: 'Ticket cannot be transferred in current status', errorCode: 'INVALID_STATE' };
    }

    // Check transfer count limit (AT-03)
    if (metadata.transferRules.transferCount >= metadata.transferRules.maxTransfers) {
      this.crossPackAuditLog?.log({
        source: 'AIRLINE', action: 'TRANSFER_DENIED', actorId: params.fromPassenger,
        resourceId: params.ticketId, success: false,
        reason: `Maximum transfers (${metadata.transferRules.maxTransfers}) exceeded`,
      });
      return {
        success: false,
        error: `Maximum transfers (${metadata.transferRules.maxTransfers}) exceeded`,
        errorCode: 'MAX_TRANSFERS_EXCEEDED'
      };
    }

    // Check transfer deadline (AT-02)
    const firstDeparture = new Date(metadata.segments[0]?.departure.dateTime);
    const deadlineHours = metadata.policyFlags.changeDeadlineHours ?? metadata.transferRules.transferDeadlineHours;
    const deadline = new Date(firstDeparture.getTime() - deadlineHours * 60 * 60 * 1000);
    if (new Date() > deadline) {
      this.crossPackAuditLog?.log({
        source: 'AIRLINE', action: 'TRANSFER_DENIED', actorId: params.fromPassenger,
        resourceId: params.ticketId, success: false, reason: 'Transfer window has closed',
      });
      return { success: false, error: 'Transfer window has closed', errorCode: 'TRANSFER_WINDOW_CLOSED' };
    }

    // Compliance gate for recipient
    if (this.complianceRegistry && params.toPassenger.identity) {
      const identityHash = this.hashIdentity(params.toPassenger.identity);
      const check = this.complianceRegistry.checkCompliance({ identityHash });
      if (!check.hasValidReceipt) {
        this.crossPackAuditLog?.log({
          source: 'AIRLINE', action: 'TRANSFER_DENIED',
          actorId: params.fromPassenger, resourceId: params.ticketId,
          success: false, reason: 'No valid compliance receipt',
        });
        return { success: false, error: 'Compliance verification required for recipient' };
      }
    }

    // Determine if re-KYC is required (Requirement C)
    const reKycRequired = metadata.policyFlags.reKycRequiredForTransfer ||
      params.reason === TransferReason.RESALE ||
      !params.toPassenger.identity;

    // Calculate resale fee if configured (AT-09)
    let resaleFee: string | undefined;
    if (this.resaleFeeConfig && params.reason === TransferReason.RESALE) {
      const ticketValue = parseFloat(metadata.fare.total);
      let feeAmount = ticketValue * this.resaleFeeConfig.feePercentage;
      const minFee = parseFloat(this.resaleFeeConfig.minimumFee);
      const maxFee = this.resaleFeeConfig.maximumFee ? parseFloat(this.resaleFeeConfig.maximumFee) : Infinity;

      feeAmount = Math.max(minFee, Math.min(maxFee, feeAmount));
      resaleFee = feeAmount.toFixed(2);

      // If fee is required and no payment reference provided, block transfer
      if (this.resaleFeeConfig.feeRequired) {
        // Fee will be tracked and must be paid before approval
      }
    }

    // ComplianceEngine check for enhanced validation (lifecycle state, price cap, etc.)
    if (this.complianceEngine) {
      // Use provided transfer price or fall back to resale fee as price indicator
      const transferPriceForCompliance = params.transferPrice || resaleFee;
      const complianceResult = await this.evaluateTransferCompliance(
        ticket,
        params.fromPassenger,
        params.toPassenger.name,
        params.toPassenger.identity?.number,
        transferPriceForCompliance
      );

      if (complianceResult.decision.result === 'DENY') {
        if (params.actor) {
          this.recordAudit({
            actor: params.actor,
            action: 'REQUEST_TRANSFER',
            resource: { type: 'TICKET', id: params.ticketId },
            success: false,
            error: `Compliance denied: ${complianceResult.decision.violations.map(v => v.message).join(', ')}`,
          });
        }
        return {
          success: false,
          error: complianceResult.decision.violations.map(v => v.message).join(', '),
          errorCode: complianceResult.decision.violations[0]?.code || 'COMPLIANCE_DENIED',
        };
      }
    }

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
      idempotencyKey: params.idempotencyKey,
      resaleFee,
    };

    // Store idempotency key mapping (AT-11)
    if (params.idempotencyKey) {
      this.transferIdempotencyKeys.set(params.idempotencyKey, request.id);
    }

    // Record audit for transfer request creation (PR-03)
    if (params.actor) {
      this.recordAudit({
        actor: params.actor,
        action: 'REQUEST_TRANSFER',
        resource: { type: 'TRANSFER_REQUEST', id: request.id },
        reason: params.reason,
        after: {
          fromPassenger: params.fromPassenger,
          toPassenger: params.toPassenger.name,
          reason: params.reason,
        },
        success: true,
        metadata: params.idempotencyKey ? { idempotencyKey: params.idempotencyKey } : undefined,
      });
    }

    // Create resale fee ledger entry if fee applies (AT-09)
    if (resaleFee && this.resaleFeeConfig) {
      const ledgerEntry: ResaleFeeLedgerEntry = {
        id: uuidv4(),
        transferRequestId: request.id,
        ticketId: params.ticketId,
        resaleValue: metadata.fare.total,
        feeAmount: resaleFee,
        feePercentage: this.resaleFeeConfig.feePercentage,
        treasuryAddress: this.resaleFeeConfig.treasuryAddress,
        status: 'PENDING',
        createdAt: now.toISOString(),
      };
      this.resaleFeeLedger.set(ledgerEntry.id, ledgerEntry);
    }

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
      if (this.verifiedIdentities.get(identityHash) || this.identityRegistry?.isVerified(identityHash)) {
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

        this.crossPackAuditLog?.log({
          source: 'AIRLINE', action: 'TRANSFER_COMPLETED', actorId: params.fromPassenger,
          resourceId: params.ticketId, success: true,
        });

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
    /** Actor context for RBAC enforcement (PR-01) */
    actor?: ActorContext;
  }): { success: boolean; error?: string; errorCode?: string } {
    const request = this.transferRequests.get(params.requestId);
    if (!request) {
      // Record audit if actor provided (PR-03)
      if (params.actor) {
        this.recordAudit({
          actor: params.actor,
          action: 'APPROVE_TRANSFER',
          resource: { type: 'TRANSFER_REQUEST', id: params.requestId },
          success: false,
          error: 'Transfer request not found',
        });
      }
      return { success: false, error: 'Transfer request not found', errorCode: 'REQUEST_NOT_FOUND' };
    }

    // RBAC enforcement (PR-01)
    if (params.actor) {
      try {
        this.enforcePermission(params.actor, 'APPROVE_TRANSFER', request.ticketId);
      } catch (error) {
        this.recordAudit({
          actor: params.actor,
          action: 'APPROVE_TRANSFER',
          resource: { type: 'TRANSFER_REQUEST', id: params.requestId },
          success: false,
          error: error instanceof Error ? error.message : 'Permission denied',
        });
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Permission denied',
          errorCode: 'UNAUTHORIZED'
        };
      }
    }

    if (request.status !== TransferApprovalStatus.PENDING) {
      return { success: false, error: 'Request is not pending', errorCode: 'INVALID_STATE' };
    }

    // Check expiry
    if (new Date() > new Date(request.expiresAt)) {
      request.status = TransferApprovalStatus.REJECTED;
      request.rejectionReason = 'Request expired';
      return { success: false, error: 'Request has expired', errorCode: 'REQUEST_EXPIRED' };
    }

    // Check re-KYC completion (Requirement C)
    if (request.reKycRequired && !request.reKycCompleted) {
      return {
        success: false,
        error: 'Re-KYC verification required before approval - call completeTransferKyc first',
        errorCode: 'KYC_REQUIRED'
      };
    }

    // Check resale fee payment (AT-09)
    if (request.resaleFee && this.resaleFeeConfig?.feeRequired) {
      const feeEntry = this.findResaleFeeLedgerEntry(request.id);
      if (feeEntry && feeEntry.status === 'PENDING' && !request.paymentReference) {
        return {
          success: false,
          error: `Resale fee of ${request.resaleFee} must be paid before approval`,
          errorCode: 'PAYMENT_REQUIRED'
        };
      }
    }

    const ticket = this.tickets.get(request.ticketId);
    const metadata = ticket?.metadata as unknown as AirlineTicketMetadata | undefined;

    // Record audit for success (PR-03)
    if (params.actor) {
      this.recordAudit({
        actor: params.actor,
        action: 'APPROVE_TRANSFER',
        resource: { type: 'TRANSFER_REQUEST', id: params.requestId },
        before: { status: request.status },
        after: { status: TransferApprovalStatus.APPROVED },
        success: true,
      });
    }

    request.status = TransferApprovalStatus.APPROVED;
    request.approvedAt = new Date().toISOString();
    request.approvedBy = params.approvedBy;

    this.executeTransfer(request);

    // Mark resale fee as collected (AT-09)
    if (request.resaleFee) {
      const feeEntry = this.findResaleFeeLedgerEntry(request.id);
      if (feeEntry && feeEntry.status === 'PENDING') {
        feeEntry.status = 'COLLECTED';
        feeEntry.collectedAt = new Date().toISOString();
        feeEntry.paymentReference = request.paymentReference;
      }
    }

    // Emit transfer event
    this.emitEvent(AirlineEventType.TICKET_TRANSFERRED, request.ticketId, {
      from: request.fromPassenger,
      to: request.toPassenger.name,
      reason: request.reason,
      approvedBy: params.approvedBy,
      resaleFee: request.resaleFee,
    }, metadata?.bookingReference);

    return { success: true };
  }

  /**
   * Pay resale fee for a transfer (AT-09)
   */
  payResaleFee(params: {
    requestId: string;
    paymentReference: string;
  }): { success: boolean; error?: string } {
    const request = this.transferRequests.get(params.requestId);
    if (!request) {
      return { success: false, error: 'Transfer request not found' };
    }

    if (!request.resaleFee) {
      return { success: false, error: 'No resale fee required for this transfer' };
    }

    request.paymentReference = params.paymentReference;

    const feeEntry = this.findResaleFeeLedgerEntry(params.requestId);
    if (feeEntry) {
      feeEntry.paymentReference = params.paymentReference;
    }

    return { success: true };
  }

  /**
   * Find resale fee ledger entry by transfer request ID
   */
  private findResaleFeeLedgerEntry(requestId: string): ResaleFeeLedgerEntry | undefined {
    for (const entry of Array.from(this.resaleFeeLedger.values())) {
      if (entry.transferRequestId === requestId) {
        return entry;
      }
    }
    return undefined;
  }

  /**
   * Reject transfer (by airline)
   */
  rejectTransfer(params: {
    requestId: string;
    rejectedBy: string;
    reason: string;
    /** Actor context for RBAC enforcement (PR-01) */
    actor?: ActorContext;
  }): { success: boolean; error?: string; errorCode?: string } {
    const request = this.transferRequests.get(params.requestId);
    if (!request) {
      if (params.actor) {
        this.recordAudit({
          actor: params.actor,
          action: 'REJECT_TRANSFER',
          resource: { type: 'TRANSFER_REQUEST', id: params.requestId },
          success: false,
          error: 'Transfer request not found',
        });
      }
      return { success: false, error: 'Transfer request not found', errorCode: 'REQUEST_NOT_FOUND' };
    }

    // RBAC enforcement (PR-01)
    if (params.actor) {
      try {
        this.enforcePermission(params.actor, 'REJECT_TRANSFER', request.ticketId);
      } catch (error) {
        this.recordAudit({
          actor: params.actor,
          action: 'REJECT_TRANSFER',
          resource: { type: 'TRANSFER_REQUEST', id: params.requestId },
          success: false,
          error: error instanceof Error ? error.message : 'Permission denied',
        });
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Permission denied',
          errorCode: 'UNAUTHORIZED'
        };
      }
    }

    if (request.status !== TransferApprovalStatus.PENDING) {
      return { success: false, error: 'Request is not pending', errorCode: 'INVALID_STATE' };
    }

    // Record audit for success (PR-03)
    if (params.actor) {
      this.recordAudit({
        actor: params.actor,
        action: 'REJECT_TRANSFER',
        resource: { type: 'TRANSFER_REQUEST', id: params.requestId },
        reason: params.reason,
        before: { status: request.status },
        after: { status: TransferApprovalStatus.REJECTED, rejectionReason: params.reason },
        success: true,
      });
    }

    request.status = TransferApprovalStatus.REJECTED;
    request.rejectionReason = params.reason;

    return { success: true };
  }

  /**
   * Assign passenger to ticket after transfer (AT-05)
   * Links passenger identity to ticket with audit trail
   */
  assignPassenger(params: {
    ticketId: string;
    passengerId: string;
    passengerIdentity?: AirlineTicketMetadata['passengerIdentity'];
    actor: ActorContext;
  }): { success: boolean; error?: string; errorCode?: string } {
    this.enforcePermission(params.actor, 'APPROVE_TRANSFER', params.ticketId);

    const ticket = this.tickets.get(params.ticketId);
    if (!ticket) {
      return { success: false, error: 'Ticket not found', errorCode: 'TICKET_NOT_FOUND' };
    }

    const metadata = ticket.metadata as unknown as AirlineTicketMetadata;

    // Cannot assign after check-in (AT-04)
    if (metadata.status === TicketStatus.CHECKED_IN) {
      return { success: false, error: 'Cannot reassign passenger after check-in', errorCode: 'TICKET_LOCKED_AFTER_CHECKIN' };
    }

    if (metadata.status === TicketStatus.BOARDED || metadata.status === TicketStatus.COMPLETED) {
      return { success: false, error: 'Ticket has already been used', errorCode: 'TICKET_USED' };
    }

    if (metadata.revoked || metadata.status === TicketStatus.REFUNDED) {
      return { success: false, error: 'Ticket has been voided', errorCode: 'TICKET_VOID' };
    }

    // Record previous state for audit trail
    const previousState = {
      passengerName: metadata.passengerName,
      passengerIdentity: metadata.passengerIdentity,
    };

    // Update passenger
    const previousMetadata = { ...metadata };
    metadata.passengerName = params.passengerId;
    metadata.passengerIdentity = params.passengerIdentity;
    metadata.kycStatus = {
      ...metadata.kycStatus,
      verified: !!params.passengerIdentity,
      verifiedAt: params.passengerIdentity ? new Date().toISOString() : undefined,
    };
    ticket.name = `${metadata.issuingAirline.code} ${metadata.segments[0]?.flightNumber} - ${params.passengerId}`;
    ticket.updatedAt = new Date().toISOString();

    // Record audit trail
    this.recordMetadataChange(
      params.ticketId,
      previousMetadata,
      metadata,
      params.actor.actorId,
      `Passenger assigned: ${previousState.passengerName} -> ${params.passengerId}`
    );

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
   * Cancel a ticket
   */
  cancelTicket(params: {
    ticketId: string;
    actor: ActorContext;
    reason: string;
  }): { success: boolean; ticket?: RightModel; error?: string; errorCode?: string } {
    this.enforcePermission(params.actor, 'CANCEL', params.ticketId);

    const ticket = this.tickets.get(params.ticketId);
    if (!ticket) {
      return { success: false, error: 'Ticket not found', errorCode: AirlineTicketErrorCode.TICKET_NOT_FOUND };
    }

    const metadata = ticket.metadata as unknown as AirlineTicketMetadata;

    // Check if already cancelled/voided
    if (metadata.status === TicketStatus.CANCELLED || metadata.status === TicketStatus.VOID) {
      return { success: false, error: 'Ticket is already cancelled', errorCode: 'ALREADY_CANCELLED' };
    }

    // Check if already used
    if (metadata.status === TicketStatus.BOARDED || metadata.status === TicketStatus.USED || metadata.status === TicketStatus.COMPLETED) {
      return { success: false, error: 'Cannot cancel a used ticket', errorCode: AirlineTicketErrorCode.ALREADY_USED };
    }

    const previousMetadata = { ...metadata };
    metadata.status = TicketStatus.CANCELLED;
    ticket.updatedAt = new Date().toISOString();

    // Record metadata change
    this.recordMetadataChange(
      params.ticketId,
      previousMetadata,
      metadata,
      params.actor.actorId,
      `Cancelled: ${params.reason}`
    );

    // Emit cancellation event
    this.emitEvent(AirlineEventType.TICKET_CANCELLED, params.ticketId, {
      cancelledBy: params.actor.actorId,
      reason: params.reason,
    }, metadata.bookingReference);

    // Record audit
    this.recordAudit({
      actor: params.actor,
      action: 'CANCEL',
      resource: { type: 'TICKET', id: params.ticketId },
      reason: params.reason,
      before: { status: previousMetadata.status },
      after: { status: TicketStatus.CANCELLED },
      success: true,
    });

    return { success: true, ticket };
  }

  /**
   * Process refund
   */
  processRefund(ticketId: string, params?: {
    actor?: ActorContext;
    /** Whether to automatically transition to VOID after refund (default: true) */
    autoVoid?: boolean;
  }): { success: boolean; refundAmount?: string; error?: string; errorCode?: string } {
    const ticket = this.tickets.get(ticketId);
    if (!ticket) {
      return { success: false, error: 'Ticket not found', errorCode: AirlineTicketErrorCode.TICKET_NOT_FOUND };
    }

    const metadata = ticket.metadata as unknown as AirlineTicketMetadata;

    // Check if already void
    if (metadata.status === TicketStatus.VOID) {
      return { success: false, error: 'Ticket is already void', errorCode: AirlineTicketErrorCode.TICKET_VOID };
    }

    if (metadata.status !== TicketStatus.CANCELLED) {
      return { success: false, error: 'Ticket must be cancelled first', errorCode: 'INVALID_STATE' };
    }

    if (!metadata.cancellationRules.refundable) {
      return { success: false, error: 'Ticket is non-refundable', errorCode: 'NON_REFUNDABLE' };
    }

    const fareTotal = parseFloat(metadata.fare.total);
    const cancellationFee = parseFloat(metadata.cancellationRules.cancellationFee);
    const refundAmount = Math.max(0, fareTotal - cancellationFee).toFixed(2);

    const previousMetadata = { ...metadata };
    metadata.status = TicketStatus.REFUNDED;
    ticket.updatedAt = new Date().toISOString();

    // Update state machine state
    this.setTicketState(ticketId, AirlineTicketState.REFUNDED);

    // Record metadata change
    this.recordMetadataChange(
      ticketId,
      previousMetadata,
      metadata,
      params?.actor?.actorId ?? 'SYSTEM',
      'Refund processed'
    );

    // Emit refund event
    this.emitEvent(AirlineEventType.TICKET_REFUNDED, ticketId, {
      refundAmount,
      fareTotal: metadata.fare.total,
      cancellationFee: metadata.cancellationRules.cancellationFee,
    }, metadata.bookingReference);

    // Auto-void the ticket after refund (default behavior)
    const shouldAutoVoid = params?.autoVoid !== false;
    if (shouldAutoVoid) {
      // Transition to VOID state - ticket is now burned
      const voidMetadata = { ...metadata };
      metadata.status = TicketStatus.VOID;
      ticket.state = LifecycleState.BURNED;
      ticket.updatedAt = new Date().toISOString();

      // Update state machine
      this.setTicketState(ticketId, AirlineTicketState.VOID);

      // Record the void transition
      this.recordMetadataChange(
        ticketId,
        voidMetadata,
        metadata,
        params?.actor?.actorId ?? 'SYSTEM',
        'Ticket voided after refund'
      );
    }

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
    const statusCounts: Partial<Record<TicketStatus, number>> = {
      [TicketStatus.CREATED]: 0,
      [TicketStatus.ISSUED]: 0,
      [TicketStatus.CONFIRMED]: 0,
      [TicketStatus.CHECKED_IN]: 0,
      [TicketStatus.BOARDED]: 0,
      [TicketStatus.COMPLETED]: 0,
      [TicketStatus.USED]: 0,
      [TicketStatus.CLOSED]: 0,
      [TicketStatus.CANCELLED]: 0,
      [TicketStatus.REFUNDED]: 0,
      [TicketStatus.NO_SHOW]: 0,
      [TicketStatus.EXPIRED]: 0,
      [TicketStatus.VOID]: 0,
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
      const statusKey = metadata.status as keyof typeof statusCounts;
      if (statusKey in statusCounts) statusCounts[statusKey] = (statusCounts[statusKey] ?? 0) + 1;

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

  // ============================================================================
  // WEBHOOK DELIVERY INFRASTRUCTURE (PR-04)
  // ============================================================================

  /**
   * Create HMAC-SHA256 signature for webhook payload (PR-04)
   */
  private createWebhookSignature(payload: string, secret: string, timestamp: string, nonce: string): string {
    const signatureBase = `${timestamp}.${nonce}.${payload}`;
    return createHash('sha256')
      .update(signatureBase)
      .update(secret)
      .digest('hex');
  }

  /**
   * Verify webhook signature (for consumers)
   */
  verifyWebhookSignature(params: {
    payload: string;
    signature: string;
    secret: string;
    timestamp: string;
    nonce: string;
    maxAgeMs?: number;
  }): { valid: boolean; error?: string } {
    // Check timestamp for replay protection
    const maxAge = params.maxAgeMs ?? 300000; // 5 minutes default
    const timestampMs = new Date(params.timestamp).getTime();
    const now = Date.now();

    if (now - timestampMs > maxAge) {
      return { valid: false, error: 'Webhook timestamp expired (replay protection)' };
    }

    // Verify signature
    const expectedSignature = this.createWebhookSignature(
      params.payload,
      params.secret,
      params.timestamp,
      params.nonce
    );

    if (params.signature !== expectedSignature) {
      return { valid: false, error: 'Invalid webhook signature' };
    }

    return { valid: true };
  }

  /**
   * Send webhook with security features (PR-04)
   * In a real implementation, this would be async and use HTTP client
   */
  private sendWebhook(config: AirlineWebhookConfig, event: AirlineEvent): WebhookDelivery {
    const deliveryId = uuidv4();
    const timestamp = new Date().toISOString();
    const nonce = uuidv4();
    const payload = JSON.stringify(event);

    const signature = this.createWebhookSignature(payload, config.secret, timestamp, nonce);

    const delivery: WebhookDelivery = {
      id: deliveryId,
      eventId: event.id,
      endpointId: config.endpointId,
      url: config.url,
      payload,
      signature,
      timestamp,
      nonce,
      attemptCount: 1,
      status: 'PENDING',
      lastAttemptAt: timestamp,
    };

    this.webhookDeliveries.set(deliveryId, delivery);

    // Simulate delivery (in real implementation, this would be HTTP POST)
    // For testing purposes, we'll mark it as delivered or failed based on URL
    if (config.url.includes('fail')) {
      delivery.status = 'FAILED';
      delivery.error = 'Simulated failure';
      delivery.responseCode = 500;
      this.scheduleRetry(delivery, config);
    } else {
      delivery.status = 'DELIVERED';
      delivery.responseCode = 200;
    }

    return delivery;
  }

  /**
   * Schedule retry with exponential backoff (PR-04)
   */
  private scheduleRetry(delivery: WebhookDelivery, config: AirlineWebhookConfig): void {
    if (delivery.attemptCount >= config.retryPolicy.maxRetries) {
      // Move to dead letter queue
      this.moveToDeadLetter(delivery, `Max retries (${config.retryPolicy.maxRetries}) exceeded`);
      return;
    }

    // Calculate next retry time with exponential backoff
    const backoffMs = config.retryPolicy.backoffMs * Math.pow(2, delivery.attemptCount - 1);
    const nextRetryAt = new Date(Date.now() + backoffMs).toISOString();
    delivery.nextRetryAt = nextRetryAt;
  }

  /**
   * Retry failed webhook delivery (PR-04)
   */
  retryWebhook(deliveryId: string): { success: boolean; delivery?: WebhookDelivery; error?: string } {
    const delivery = this.webhookDeliveries.get(deliveryId);
    if (!delivery) {
      return { success: false, error: 'Delivery not found' };
    }

    if (delivery.status === 'DELIVERED') {
      return { success: false, error: 'Delivery already succeeded' };
    }

    if (delivery.status === 'DEAD_LETTER') {
      return { success: false, error: 'Delivery in dead letter queue' };
    }

    const config = this.webhookConfigs.get(delivery.endpointId);
    if (!config) {
      return { success: false, error: 'Webhook config not found' };
    }

    // Increment attempt count and retry
    delivery.attemptCount++;
    delivery.lastAttemptAt = new Date().toISOString();

    // Simulate retry (in real implementation, this would be HTTP POST)
    if (config.url.includes('fail')) {
      delivery.status = 'FAILED';
      delivery.error = 'Simulated failure';
      delivery.responseCode = 500;
      this.scheduleRetry(delivery, config);
    } else {
      delivery.status = 'DELIVERED';
      delivery.responseCode = 200;
      delivery.error = undefined;
    }

    return { success: delivery.status === 'DELIVERED', delivery };
  }

  /**
   * Move delivery to dead letter queue (PR-04)
   */
  private moveToDeadLetter(delivery: WebhookDelivery, reason: string): void {
    delivery.status = 'DEAD_LETTER';

    const dlEntry: DeadLetterEntry = {
      id: uuidv4(),
      deliveryId: delivery.id,
      eventId: delivery.eventId,
      endpointId: delivery.endpointId,
      payload: delivery.payload,
      failedAt: new Date().toISOString(),
      reason,
      attemptCount: delivery.attemptCount,
      retriable: true, // Can be manually retried
    };

    this.deadLetterQueue.set(dlEntry.id, dlEntry);
  }

  /**
   * Get pending webhook deliveries (PR-04)
   */
  getPendingDeliveries(): WebhookDelivery[] {
    return Array.from(this.webhookDeliveries.values())
      .filter(d => d.status === 'PENDING' || d.status === 'FAILED');
  }

  /**
   * Get dead letter queue entries (PR-04)
   */
  getDeadLetterQueue(): DeadLetterEntry[] {
    return Array.from(this.deadLetterQueue.values());
  }

  /**
   * Retry from dead letter queue (PR-04)
   */
  retryFromDeadLetter(dlEntryId: string): { success: boolean; error?: string } {
    const dlEntry = this.deadLetterQueue.get(dlEntryId);
    if (!dlEntry) {
      return { success: false, error: 'Dead letter entry not found' };
    }

    if (!dlEntry.retriable) {
      return { success: false, error: 'Entry marked as non-retriable' };
    }

    const delivery = this.webhookDeliveries.get(dlEntry.deliveryId);
    if (!delivery) {
      return { success: false, error: 'Original delivery not found' };
    }

    // Reset delivery status for retry
    delivery.status = 'PENDING';
    delivery.attemptCount = 0;

    // Remove from dead letter queue
    this.deadLetterQueue.delete(dlEntryId);

    // Attempt retry
    const result = this.retryWebhook(delivery.id);
    return { success: result.success, error: result.error };
  }

  /**
   * Get webhook delivery by ID (PR-04)
   */
  getWebhookDelivery(deliveryId: string): WebhookDelivery | undefined {
    return this.webhookDeliveries.get(deliveryId);
  }

  /**
   * Get all webhook deliveries for an event (PR-04)
   */
  getDeliveriesForEvent(eventId: string): WebhookDelivery[] {
    return Array.from(this.webhookDeliveries.values())
      .filter(d => d.eventId === eventId);
  }

  // ============================================================================
  // AUDIT LOG METHODS (PR-03)
  // ============================================================================

  /**
   * Record an audit log entry (PR-03)
   */
  private recordAudit(params: {
    actor: ActorContext;
    action: string;
    resource: AuditLogEntry['resource'];
    reason?: string;
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
    success: boolean;
    error?: string;
    metadata?: AuditLogEntry['metadata'];
  }): void {
    const entry: AuditLogEntry = {
      id: uuidv4(),
      actor: {
        id: params.actor.actorId,
        role: params.actor.role,
        airlineCode: params.actor.airlineCode,
      },
      action: params.action,
      resource: params.resource,
      timestamp: new Date().toISOString(),
      reason: params.reason,
      before: params.before,
      after: params.after,
      metadata: params.metadata,
      success: params.success,
      error: params.error,
    };

    this.auditLog.push(entry);
  }

  /**
   * Get audit log entries (PR-03)
   */
  getAuditLog(filters?: {
    actorId?: string;
    action?: string;
    resourceType?: AuditLogEntry['resource']['type'];
    resourceId?: string;
    since?: string;
    until?: string;
    limit?: number;
  }): AuditLogEntry[] {
    let entries = [...this.auditLog];

    if (filters?.actorId) {
      entries = entries.filter(e => e.actor.id === filters.actorId);
    }
    if (filters?.action) {
      entries = entries.filter(e => e.action === filters.action);
    }
    if (filters?.resourceType) {
      entries = entries.filter(e => e.resource.type === filters.resourceType);
    }
    if (filters?.resourceId) {
      entries = entries.filter(e => e.resource.id === filters.resourceId);
    }
    if (filters?.since) {
      entries = entries.filter(e => e.timestamp >= filters.since!);
    }
    if (filters?.until) {
      entries = entries.filter(e => e.timestamp <= filters.until!);
    }

    // Sort by timestamp descending
    entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    if (filters?.limit) {
      entries = entries.slice(0, filters.limit);
    }

    return entries;
  }

  // ============================================================================
  // IDEMPOTENCY HELPERS (PR-02)
  // ============================================================================

  /**
   * Check and store idempotency key (PR-02)
   * Returns existing result if key exists, otherwise stores the new result
   */
  private checkIdempotency<T>(key: string, computeResult: () => T): { cached: boolean; result: T } {
    // Clean expired keys
    this.cleanExpiredIdempotencyKeys();

    const existing = this.operationIdempotencyKeys.get(key);
    if (existing && existing.expiresAt > Date.now()) {
      return { cached: true, result: existing.result as T };
    }

    const result = computeResult();
    this.operationIdempotencyKeys.set(key, {
      result,
      expiresAt: Date.now() + this.idempotencyTTLMs,
    });

    return { cached: false, result };
  }

  /**
   * Clean up expired idempotency keys (PR-02)
   */
  private cleanExpiredIdempotencyKeys(): void {
    const now = Date.now();
    for (const [key, value] of Array.from(this.operationIdempotencyKeys.entries())) {
      if (value.expiresAt <= now) {
        this.operationIdempotencyKeys.delete(key);
      }
    }
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

    // Publish to cross-pack event bus
    this.crossPackEventBus?.publish({
      source: 'AIRLINE',
      type: event.type,
      resourceId: event.ticketId,
      data: event.data,
      correlationId: (event.data.correlationId as string) ?? undefined,
    });

    // Trigger webhooks with security (PR-04)
    for (const config of Array.from(this.webhookConfigs.values())) {
      if (config.active && config.events.includes(type)) {
        this.sendWebhook(config, event);
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
    const transitions: Partial<Record<TicketStatus, TicketStatus[]>> = {
      [TicketStatus.CREATED]: [TicketStatus.ISSUED],
      [TicketStatus.ISSUED]: [TicketStatus.CONFIRMED, TicketStatus.CHECKED_IN, TicketStatus.CANCELLED, TicketStatus.EXPIRED],
      [TicketStatus.CONFIRMED]: [TicketStatus.CHECKED_IN, TicketStatus.CANCELLED],
      [TicketStatus.CHECKED_IN]: [TicketStatus.BOARDED, TicketStatus.CANCELLED, TicketStatus.NO_SHOW],
      [TicketStatus.BOARDED]: [TicketStatus.USED, TicketStatus.COMPLETED],
      [TicketStatus.USED]: [TicketStatus.CLOSED],
      [TicketStatus.COMPLETED]: [TicketStatus.CLOSED],
      [TicketStatus.CLOSED]: [], // Terminal
      [TicketStatus.CANCELLED]: [TicketStatus.REFUNDED],
      [TicketStatus.REFUNDED]: [TicketStatus.VOID],
      [TicketStatus.NO_SHOW]: [TicketStatus.REFUNDED, TicketStatus.EXPIRED],
      [TicketStatus.EXPIRED]: [TicketStatus.VOID],
      [TicketStatus.VOID]: [], // Terminal
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
