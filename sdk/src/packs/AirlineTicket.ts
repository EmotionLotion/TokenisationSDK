/**
 * Pack: Airline Ticket Resale
 *
 * Reference implementation for airline ticket tokenization with:
 * - Conditional transfer requiring issuer approval OR identity claim
 * - Name change fees
 * - Transfer count limits
 * - Cancellation/refund lifecycle
 */

import { v4 as uuidv4 } from 'uuid';
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
  requestedAt: string;
  status: TransferApprovalStatus;
  approvedAt?: string;
  approvedBy?: string;
  rejectionReason?: string;
  nameChangeFee: string;
  expiresAt: string;
}

// ============================================================================
// AIRLINE TICKET ENGINE
// ============================================================================

export class AirlineTicketEngine {
  private tickets: Map<string, RightModel> = new Map();
  private transferRequests: Map<string, TransferRequest> = new Map();
  private authorizedAirlines: Set<string> = new Set();
  private verifiedIdentities: Map<string, boolean> = new Map();

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

  /**
   * Issue a ticket
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
  }): { success: boolean; ticket?: RightModel; error?: string } {
    // Check airline authorization
    if (!this.authorizedAirlines.has(params.airlineCode)) {
      return { success: false, error: 'Airline not authorized' };
    }

    const now = new Date().toISOString();
    const firstDeparture = params.segments[0]?.departure.dateTime;
    const lastArrival = params.segments[params.segments.length - 1]?.arrival.dateTime;

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
    return { success: true, ticket };
  }

  /**
   * Request ticket transfer (name change)
   */
  requestTransfer(params: {
    ticketId: string;
    fromPassenger: string;
    toPassenger: {
      name: string;
      identity?: AirlineTicketMetadata['passengerIdentity'];
    };
  }): { success: boolean; request?: TransferRequest; error?: string } {
    const ticket = this.tickets.get(params.ticketId);
    if (!ticket) {
      return { success: false, error: 'Ticket not found' };
    }

    const metadata = ticket.metadata as unknown as AirlineTicketMetadata;

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

    // Check transfer deadline
    const firstDeparture = new Date(metadata.segments[0]?.departure.dateTime);
    const deadline = new Date(firstDeparture.getTime() - metadata.transferRules.transferDeadlineHours * 60 * 60 * 1000);
    if (new Date() > deadline) {
      return { success: false, error: 'Transfer deadline has passed' };
    }

    const now = new Date();
    const request: TransferRequest = {
      id: uuidv4(),
      ticketId: params.ticketId,
      fromPassenger: params.fromPassenger,
      toPassenger: params.toPassenger,
      requestedAt: now.toISOString(),
      status: TransferApprovalStatus.PENDING,
      nameChangeFee: metadata.transferRules.nameChangeFee,
      expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(), // 24 hour expiry
    };

    // Check for auto-approval with verified identity
    if (metadata.transferRules.autoApproveWithIdentity && params.toPassenger.identity) {
      const identityHash = this.hashIdentity(params.toPassenger.identity);
      if (this.verifiedIdentities.get(identityHash)) {
        request.status = TransferApprovalStatus.AUTO_APPROVED;
        request.approvedAt = now.toISOString();
        request.approvedBy = 'SYSTEM_AUTO_APPROVAL';

        // Execute transfer immediately
        this.executeTransfer(request);

        return { success: true, request };
      }
    }

    // Otherwise requires issuer approval
    if (metadata.transferRules.requiresIssuerApproval) {
      this.transferRequests.set(request.id, request);
      return { success: true, request };
    }

    // If no approval required and no identity verification, auto-approve
    request.status = TransferApprovalStatus.AUTO_APPROVED;
    request.approvedAt = now.toISOString();
    this.executeTransfer(request);

    return { success: true, request };
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

    request.status = TransferApprovalStatus.APPROVED;
    request.approvedAt = new Date().toISOString();
    request.approvedBy = params.approvedBy;

    this.executeTransfer(request);

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
  // PRIVATE HELPERS
  // ============================================================================

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
