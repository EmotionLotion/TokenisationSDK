/**
 * Airline Ticket State Machine
 *
 * Dedicated state machine configuration for airline ticket lifecycle with:
 * - Strict state transitions
 * - Guard functions for business rules
 * - Integration with core StateMachine infrastructure
 *
 * State Flow:
 * CREATED → ISSUED → (TRANSFERRED)* → CHECKED_IN → BOARDED/USED → CLOSED
 *
 * Side paths:
 * ISSUED → REFUNDED → VOID
 * ISSUED → EXPIRED → VOID
 */

import type {
  StateMachineConfig,
  StateContext,
  GuardResult,
  StateMachineGuard,
} from '../core/StateMachine.js';

// ============================================================================
// AIRLINE TICKET STATE ENUM
// ============================================================================

/**
 * All possible states for an airline ticket
 */
export enum AirlineTicketState {
  /** Initial state - ticket record created but not yet issued */
  CREATED = 'CREATED',

  /** Ticket issued and active - can be transferred */
  ISSUED = 'ISSUED',

  /** Passenger has checked in - transfers locked */
  CHECKED_IN = 'CHECKED_IN',

  /** Passenger has boarded the aircraft */
  BOARDED = 'BOARDED',

  /** Flight completed - ticket used */
  USED = 'USED',

  /** Ticket lifecycle completed normally */
  CLOSED = 'CLOSED',

  /** Ticket has been refunded */
  REFUNDED = 'REFUNDED',

  /** Ticket validity has expired */
  EXPIRED = 'EXPIRED',

  /** Terminal state - ticket is void and cannot be used */
  VOID = 'VOID',
}

// ============================================================================
// STATE MACHINE EVENTS
// ============================================================================

/**
 * Events that trigger state transitions
 */
export enum AirlineTicketEvent {
  ISSUE = 'ISSUE',
  TRANSFER = 'TRANSFER',
  CHECK_IN = 'CHECK_IN',
  BOARD = 'BOARD',
  COMPLETE = 'COMPLETE',
  CLOSE = 'CLOSE',
  REFUND = 'REFUND',
  EXPIRE = 'EXPIRE',
  VOID = 'VOID',
}

// ============================================================================
// ERROR CODES
// ============================================================================

/**
 * Error codes for state machine guard failures
 */
export enum AirlineTicketErrorCode {
  /** Transfer window has closed (< 24h before departure) */
  TRANSFER_WINDOW_CLOSED = 'TRANSFER_WINDOW_CLOSED',

  /** Ticket is locked after check-in - no transfers allowed */
  TICKET_LOCKED_AFTER_CHECKIN = 'TICKET_LOCKED_AFTER_CHECKIN',

  /** Ticket has already been used (boarded) */
  ALREADY_USED = 'ALREADY_USED',

  /** Ticket is void and cannot be operated on */
  TICKET_VOID = 'TICKET_VOID',

  /** Invalid state transition attempted */
  INVALID_TRANSITION = 'INVALID_TRANSITION',

  /** Maximum transfers exceeded */
  MAX_TRANSFERS_EXCEEDED = 'MAX_TRANSFERS_EXCEEDED',

  /** Transfer request not found */
  REQUEST_NOT_FOUND = 'REQUEST_NOT_FOUND',

  /** Ticket not found */
  TICKET_NOT_FOUND = 'TICKET_NOT_FOUND',

  /** Not authorized to perform action */
  UNAUTHORIZED = 'UNAUTHORIZED',

  /** KYC verification required */
  KYC_REQUIRED = 'KYC_REQUIRED',

  /** Payment required for operation */
  PAYMENT_REQUIRED = 'PAYMENT_REQUIRED',
}

// ============================================================================
// OPERATION CONTEXT
// ============================================================================

/**
 * Extended context for airline ticket operations with instrumentation
 */
export interface AirlineTicketOperationContext {
  /** The ticket ID being operated on */
  ticketId: string;

  /** Token ID if minted */
  tokenId?: string;

  /** Hash of booking reference for correlation */
  bookingRefHash: string;

  /** Correlation ID for distributed tracing */
  correlationId: string;

  /** Unique event ID for idempotency */
  eventId: string;

  /** Departure time for guard evaluation */
  departureTime?: Date;

  /** Current transfer count */
  transferCount?: number;

  /** Maximum allowed transfers */
  maxTransfers?: number;

  /** Transfer deadline in hours before departure */
  transferDeadlineHours?: number;
}

// ============================================================================
// GUARD FUNCTIONS
// ============================================================================

/**
 * Guard: Transfer Window
 * Rejects transfers if less than 24 hours (or configured deadline) before departure
 */
export const transferWindowGuard: StateMachineGuard = async (
  context: StateContext
): Promise<GuardResult> => {
  // Only apply to TRANSFER event
  if (context.event !== AirlineTicketEvent.TRANSFER) {
    return { allowed: true };
  }

  const opContext = context.metadata as unknown as AirlineTicketOperationContext | undefined;
  if (!opContext?.departureTime) {
    // No departure time in context - allow (will be checked elsewhere)
    return { allowed: true };
  }

  const deadlineHours = opContext.transferDeadlineHours ?? 24;
  const deadline = new Date(opContext.departureTime.getTime() - deadlineHours * 60 * 60 * 1000);
  const now = new Date();

  if (now > deadline) {
    return {
      allowed: false,
      reason: `${AirlineTicketErrorCode.TRANSFER_WINDOW_CLOSED}: Transfer window closed ${deadlineHours} hours before departure`,
    };
  }

  return { allowed: true };
};

/**
 * Guard: Post-Check-in Lock
 * Blocks all transfers after the ticket has been checked in
 */
export const postCheckInLockGuard: StateMachineGuard = async (
  context: StateContext
): Promise<GuardResult> => {
  // Only apply to TRANSFER event
  if (context.event !== AirlineTicketEvent.TRANSFER) {
    return { allowed: true };
  }

  // If current state is CHECKED_IN or beyond, block transfer
  const lockedStates = [
    AirlineTicketState.CHECKED_IN,
    AirlineTicketState.BOARDED,
    AirlineTicketState.USED,
    AirlineTicketState.CLOSED,
  ];

  if (lockedStates.includes(context.currentState as AirlineTicketState)) {
    return {
      allowed: false,
      reason: `${AirlineTicketErrorCode.TICKET_LOCKED_AFTER_CHECKIN}: Ticket is locked after check-in`,
    };
  }

  return { allowed: true };
};

/**
 * Guard: One-Time Use
 * Prevents duplicate boarding attempts
 */
export const oneTimeUseGuard: StateMachineGuard = async (
  context: StateContext
): Promise<GuardResult> => {
  // Only apply to BOARD event
  if (context.event !== AirlineTicketEvent.BOARD) {
    return { allowed: true };
  }

  // If already boarded or used, reject
  const usedStates = [
    AirlineTicketState.BOARDED,
    AirlineTicketState.USED,
    AirlineTicketState.CLOSED,
  ];

  if (usedStates.includes(context.currentState as AirlineTicketState)) {
    return {
      allowed: false,
      reason: `${AirlineTicketErrorCode.ALREADY_USED}: Ticket has already been used`,
    };
  }

  return { allowed: true };
};

/**
 * Guard: Void Check
 * Prevents any operations on voided tickets
 */
export const voidCheckGuard: StateMachineGuard = async (
  context: StateContext
): Promise<GuardResult> => {
  if (context.currentState === AirlineTicketState.VOID) {
    return {
      allowed: false,
      reason: `${AirlineTicketErrorCode.TICKET_VOID}: Ticket is void and cannot be modified`,
    };
  }

  return { allowed: true };
};

/**
 * Guard: Transfer Count Limit
 * Enforces maximum transfer count
 */
export const transferCountGuard: StateMachineGuard = async (
  context: StateContext
): Promise<GuardResult> => {
  // Only apply to TRANSFER event
  if (context.event !== AirlineTicketEvent.TRANSFER) {
    return { allowed: true };
  }

  const opContext = context.metadata as unknown as AirlineTicketOperationContext | undefined;
  if (!opContext) {
    return { allowed: true };
  }

  const { transferCount, maxTransfers } = opContext;
  if (transferCount !== undefined && maxTransfers !== undefined) {
    if (transferCount >= maxTransfers) {
      return {
        allowed: false,
        reason: `${AirlineTicketErrorCode.MAX_TRANSFERS_EXCEEDED}: Maximum transfers (${maxTransfers}) exceeded`,
      };
    }
  }

  return { allowed: true };
};

// ============================================================================
// STATE MACHINE CONFIGURATION
// ============================================================================

/**
 * Airline Ticket State Machine Configuration
 *
 * Defines all valid states and transitions for airline ticket lifecycle
 */
export const AIRLINE_TICKET_STATE_MACHINE: StateMachineConfig = {
  id: 'airline-ticket-v2',
  name: 'Airline Ticket Lifecycle V2',
  description: 'State machine for airline ticket lifecycle with strict transition enforcement',

  states: [
    {
      id: AirlineTicketState.CREATED,
      name: 'Created',
      description: 'Ticket record created but not yet issued',
      isInitial: true,
    },
    {
      id: AirlineTicketState.ISSUED,
      name: 'Issued',
      description: 'Ticket issued and active - can be transferred',
    },
    {
      id: AirlineTicketState.CHECKED_IN,
      name: 'Checked In',
      description: 'Passenger has checked in - transfers locked',
    },
    {
      id: AirlineTicketState.BOARDED,
      name: 'Boarded',
      description: 'Passenger has boarded the aircraft',
    },
    {
      id: AirlineTicketState.USED,
      name: 'Used',
      description: 'Flight completed - ticket used',
    },
    {
      id: AirlineTicketState.CLOSED,
      name: 'Closed',
      description: 'Ticket lifecycle completed normally',
      isTerminal: true,
    },
    {
      id: AirlineTicketState.REFUNDED,
      name: 'Refunded',
      description: 'Ticket has been refunded',
    },
    {
      id: AirlineTicketState.EXPIRED,
      name: 'Expired',
      description: 'Ticket validity has expired',
    },
    {
      id: AirlineTicketState.VOID,
      name: 'Void',
      description: 'Terminal state - ticket is void and cannot be used',
      isTerminal: true,
    },
  ],

  transitions: [
    // Happy path: CREATED → ISSUED → CHECKED_IN → BOARDED → USED → CLOSED
    {
      from: AirlineTicketState.CREATED,
      to: AirlineTicketState.ISSUED,
      event: AirlineTicketEvent.ISSUE,
      description: 'Issue ticket to passenger',
    },
    {
      from: AirlineTicketState.ISSUED,
      to: AirlineTicketState.ISSUED,
      event: AirlineTicketEvent.TRANSFER,
      description: 'Transfer ticket to another passenger (repeatable)',
      guards: [transferWindowGuard, postCheckInLockGuard, transferCountGuard],
    },
    {
      from: AirlineTicketState.ISSUED,
      to: AirlineTicketState.CHECKED_IN,
      event: AirlineTicketEvent.CHECK_IN,
      description: 'Check in for flight',
    },
    {
      from: AirlineTicketState.CHECKED_IN,
      to: AirlineTicketState.BOARDED,
      event: AirlineTicketEvent.BOARD,
      description: 'Board the aircraft',
      guards: [oneTimeUseGuard],
    },
    {
      from: AirlineTicketState.BOARDED,
      to: AirlineTicketState.USED,
      event: AirlineTicketEvent.COMPLETE,
      description: 'Complete flight',
    },
    {
      from: AirlineTicketState.USED,
      to: AirlineTicketState.CLOSED,
      event: AirlineTicketEvent.CLOSE,
      description: 'Close ticket lifecycle',
    },

    // Side path: Refund flow
    {
      from: AirlineTicketState.ISSUED,
      to: AirlineTicketState.REFUNDED,
      event: AirlineTicketEvent.REFUND,
      description: 'Refund ticket',
    },
    {
      from: AirlineTicketState.REFUNDED,
      to: AirlineTicketState.VOID,
      event: AirlineTicketEvent.VOID,
      description: 'Void refunded ticket',
    },

    // Side path: Expiry flow
    {
      from: AirlineTicketState.ISSUED,
      to: AirlineTicketState.EXPIRED,
      event: AirlineTicketEvent.EXPIRE,
      description: 'Ticket expired',
    },
    {
      from: AirlineTicketState.EXPIRED,
      to: AirlineTicketState.VOID,
      event: AirlineTicketEvent.VOID,
      description: 'Void expired ticket',
    },
  ],

  // Global guards applied to all transitions
  globalGuards: [voidCheckGuard],
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get all valid next states from a given state
 */
export function getValidNextStates(currentState: AirlineTicketState): AirlineTicketState[] {
  const transitions = AIRLINE_TICKET_STATE_MACHINE.transitions.filter(
    (t) => t.from === currentState
  );
  return Array.from(new Set(transitions.map((t) => t.to as AirlineTicketState)));
}

/**
 * Check if a state is terminal
 */
export function isTerminalState(state: AirlineTicketState): boolean {
  return state === AirlineTicketState.CLOSED || state === AirlineTicketState.VOID;
}

/**
 * Check if ticket can be transferred in current state
 */
export function canTransferInState(state: AirlineTicketState): boolean {
  return state === AirlineTicketState.ISSUED;
}

/**
 * Map legacy TicketStatus to AirlineTicketState
 */
export function mapLegacyStatusToState(
  legacyStatus: string
): AirlineTicketState {
  const mapping: Record<string, AirlineTicketState> = {
    ISSUED: AirlineTicketState.ISSUED,
    CONFIRMED: AirlineTicketState.ISSUED, // CONFIRMED maps to ISSUED
    CHECKED_IN: AirlineTicketState.CHECKED_IN,
    BOARDED: AirlineTicketState.BOARDED,
    COMPLETED: AirlineTicketState.USED,
    CANCELLED: AirlineTicketState.VOID,
    REFUNDED: AirlineTicketState.REFUNDED,
    NO_SHOW: AirlineTicketState.EXPIRED,
  };

  return mapping[legacyStatus] ?? AirlineTicketState.CREATED;
}

/**
 * Map AirlineTicketState to legacy TicketStatus
 */
export function mapStateToLegacyStatus(
  state: AirlineTicketState
): string {
  const mapping: Record<AirlineTicketState, string> = {
    [AirlineTicketState.CREATED]: 'ISSUED',
    [AirlineTicketState.ISSUED]: 'ISSUED',
    [AirlineTicketState.CHECKED_IN]: 'CHECKED_IN',
    [AirlineTicketState.BOARDED]: 'BOARDED',
    [AirlineTicketState.USED]: 'COMPLETED',
    [AirlineTicketState.CLOSED]: 'COMPLETED',
    [AirlineTicketState.REFUNDED]: 'REFUNDED',
    [AirlineTicketState.EXPIRED]: 'NO_SHOW',
    [AirlineTicketState.VOID]: 'CANCELLED',
  };

  return mapping[state];
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  StateMachineConfig,
  StateContext,
  GuardResult,
  StateMachineGuard,
};
