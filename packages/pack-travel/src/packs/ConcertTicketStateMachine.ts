/**
 * Concert Ticket State Machine
 *
 * Dedicated state machine configuration for concert ticket lifecycle with:
 * - Strict state transitions
 * - Guard functions for business rules including anti-scalping
 * - Age restriction enforcement
 * - Lead booker requirements
 * - Integration with core StateMachine infrastructure
 *
 * State Flow:
 * CREATED -> ISSUED -> ADMITTED -> USED -> CLOSED
 *
 * Side paths:
 * CREATED/ISSUED -> CANCELLED
 * ISSUED/CANCELLED -> REFUNDED
 * ISSUED -> EXPIRED
 * REFUNDED/EXPIRED/CREATED/ISSUED -> VOID
 */

import type {
  StateMachineConfig,
  StateContext,
  GuardResult,
  StateMachineGuard,
} from '@tokenisation/core';

// ============================================================================
// CONCERT TICKET STATE ENUM
// ============================================================================

/**
 * All possible states for a concert ticket
 */
export enum ConcertTicketState {
  /** Initial state - ticket created but not yet issued */
  CREATED = 'CREATED',

  /** Ticket issued and valid for entry */
  ISSUED = 'ISSUED',

  /** Fan has been admitted to the venue */
  ADMITTED = 'ADMITTED',

  /** Event has been completed (post-admission) */
  USED = 'USED',

  /** Ticket lifecycle completed normally */
  CLOSED = 'CLOSED',

  /** Ticket has been cancelled */
  CANCELLED = 'CANCELLED',

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
export enum ConcertTicketEvent {
  ISSUE = 'ISSUE',
  ADMIT = 'ADMIT',
  COMPLETE = 'COMPLETE',
  CLOSE = 'CLOSE',
  CANCEL = 'CANCEL',
  REFUND = 'REFUND',
  EXPIRE = 'EXPIRE',
  VOID = 'VOID',
  TRANSFER = 'TRANSFER',
  MODIFY = 'MODIFY',
}

// ============================================================================
// ERROR CODES
// ============================================================================

/**
 * Error codes for state machine guard failures
 */
export enum ConcertTicketErrorCode {
  /** Transfer window has closed */
  TRANSFER_WINDOW_CLOSED = 'TRANSFER_WINDOW_CLOSED',

  /** Ticket is locked after admission */
  TICKET_LOCKED_AFTER_ADMISSION = 'TICKET_LOCKED_AFTER_ADMISSION',

  /** Fan has already been admitted */
  ALREADY_ADMITTED = 'ALREADY_ADMITTED',

  /** Ticket is void */
  TICKET_VOID = 'TICKET_VOID',

  /** Invalid state transition attempted */
  INVALID_TRANSITION = 'INVALID_TRANSITION',

  /** Maximum transfers exceeded */
  MAX_TRANSFERS_EXCEEDED = 'MAX_TRANSFERS_EXCEEDED',

  /** Ticket not found */
  TICKET_NOT_FOUND = 'TICKET_NOT_FOUND',

  /** Not authorized to perform action */
  UNAUTHORIZED = 'UNAUTHORIZED',

  /** Resale price exceeds cap */
  RESALE_PRICE_CAP_EXCEEDED = 'RESALE_PRICE_CAP_EXCEEDED',

  /** Age restriction failed */
  AGE_RESTRICTION_FAILED = 'AGE_RESTRICTION_FAILED',

  /** Lead booker required for transfer */
  LEAD_BOOKER_REQUIRED = 'LEAD_BOOKER_REQUIRED',

  /** Not the fan on the ticket */
  NOT_FAN = 'NOT_FAN',
}

// ============================================================================
// OPERATION CONTEXT
// ============================================================================

/**
 * Extended context for concert ticket operations
 */
export interface ConcertTicketOperationContext {
  /** The ticket ID being operated on */
  ticketId: string;

  /** Venue code */
  venueCode: string;

  /** Correlation ID for distributed tracing */
  correlationId: string;

  /** Unique event ID for idempotency */
  eventId: string;

  /** Event date for guard evaluation */
  eventDate?: Date;

  /** Current transfer count */
  transferCount?: number;

  /** Maximum allowed transfers */
  maxTransfers?: number;

  /** Transfer deadline in hours before event */
  transferDeadlineHours?: number;

  /** Resale price for anti-scalping check */
  resalePrice?: number;

  /** Maximum allowed resale percentage above face value */
  maxResalePercent?: number;

  /** Face value of the ticket */
  faceValue?: number;

  /** Fan age for age restriction */
  fanAge?: number;

  /** Minimum age restriction */
  minimumAge?: number;

  /** Whether lead booker is required */
  leadBookerRequired?: boolean;

  /** Whether the requester is the lead booker */
  isLeadBooker?: boolean;
}

// ============================================================================
// GUARD FUNCTIONS
// ============================================================================

/**
 * Guard: Resale Price Cap (Anti-Scalping)
 * Blocks TRANSFER if resale price exceeds maxResalePercent above face value
 */
export const resalePriceCapGuard: StateMachineGuard = async (
  context: StateContext
): Promise<GuardResult> => {
  if (context.event !== ConcertTicketEvent.TRANSFER) {
    return { allowed: true };
  }

  const opContext = context.metadata as unknown as ConcertTicketOperationContext | undefined;
  if (!opContext?.resalePrice || !opContext?.faceValue || !opContext?.maxResalePercent) {
    return { allowed: true };
  }

  const maxAllowedPrice = opContext.faceValue * (1 + opContext.maxResalePercent / 100);

  if (opContext.resalePrice > maxAllowedPrice) {
    return {
      allowed: false,
      reason: `${ConcertTicketErrorCode.RESALE_PRICE_CAP_EXCEEDED}: Resale price ${opContext.resalePrice} exceeds maximum allowed ${maxAllowedPrice.toFixed(2)} (${opContext.maxResalePercent}% above face value)`,
    };
  }

  return { allowed: true };
};

/**
 * Guard: Age Restriction
 * Blocks TRANSFER if the new fan does not meet the minimum age requirement
 */
export const ageRestrictionGuard: StateMachineGuard = async (
  context: StateContext
): Promise<GuardResult> => {
  if (context.event !== ConcertTicketEvent.TRANSFER) {
    return { allowed: true };
  }

  const opContext = context.metadata as unknown as ConcertTicketOperationContext | undefined;
  if (!opContext?.minimumAge || !opContext?.fanAge) {
    return { allowed: true };
  }

  if (opContext.fanAge < opContext.minimumAge) {
    return {
      allowed: false,
      reason: `${ConcertTicketErrorCode.AGE_RESTRICTION_FAILED}: Fan age ${opContext.fanAge} is below minimum age ${opContext.minimumAge}`,
    };
  }

  return { allowed: true };
};

/**
 * Guard: Transfer Window
 * Blocks TRANSFER if less than transferDeadlineHours before eventDate
 */
export const transferWindowGuard: StateMachineGuard = async (
  context: StateContext
): Promise<GuardResult> => {
  if (context.event !== ConcertTicketEvent.TRANSFER) {
    return { allowed: true };
  }

  const opContext = context.metadata as unknown as ConcertTicketOperationContext | undefined;
  if (!opContext?.eventDate) {
    return { allowed: true };
  }

  const deadlineHours = opContext.transferDeadlineHours ?? 24;
  const deadline = new Date(opContext.eventDate.getTime() - deadlineHours * 60 * 60 * 1000);
  const now = new Date();

  if (now > deadline) {
    return {
      allowed: false,
      reason: `${ConcertTicketErrorCode.TRANSFER_WINDOW_CLOSED}: Transfer window closed ${deadlineHours} hours before event`,
    };
  }

  return { allowed: true };
};

/**
 * Guard: Post Admission Lock
 * Blocks TRANSFER if state is ADMITTED or later
 */
export const postAdmissionLockGuard: StateMachineGuard = async (
  context: StateContext
): Promise<GuardResult> => {
  if (context.event !== ConcertTicketEvent.TRANSFER) {
    return { allowed: true };
  }

  const lockedStates = [
    ConcertTicketState.ADMITTED,
    ConcertTicketState.USED,
    ConcertTicketState.CLOSED,
  ];

  if (lockedStates.includes(context.currentState as ConcertTicketState)) {
    return {
      allowed: false,
      reason: `${ConcertTicketErrorCode.TICKET_LOCKED_AFTER_ADMISSION}: Ticket is locked after admission`,
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
  if (context.currentState === ConcertTicketState.VOID) {
    return {
      allowed: false,
      reason: `${ConcertTicketErrorCode.TICKET_VOID}: Ticket is void and cannot be modified`,
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
  if (context.event !== ConcertTicketEvent.TRANSFER) {
    return { allowed: true };
  }

  const opContext = context.metadata as unknown as ConcertTicketOperationContext | undefined;
  if (!opContext) {
    return { allowed: true };
  }

  const { transferCount, maxTransfers } = opContext;
  if (transferCount !== undefined && maxTransfers !== undefined) {
    if (transferCount >= maxTransfers) {
      return {
        allowed: false,
        reason: `${ConcertTicketErrorCode.MAX_TRANSFERS_EXCEEDED}: Maximum transfers (${maxTransfers}) exceeded`,
      };
    }
  }

  return { allowed: true };
};

/**
 * Guard: Lead Booker
 * Blocks TRANSFER if lead booker is required and requester is not the lead booker
 */
export const leadBookerGuard: StateMachineGuard = async (
  context: StateContext
): Promise<GuardResult> => {
  if (context.event !== ConcertTicketEvent.TRANSFER) {
    return { allowed: true };
  }

  const opContext = context.metadata as unknown as ConcertTicketOperationContext | undefined;
  if (!opContext) {
    return { allowed: true };
  }

  if (opContext.leadBookerRequired && !opContext.isLeadBooker) {
    return {
      allowed: false,
      reason: `${ConcertTicketErrorCode.LEAD_BOOKER_REQUIRED}: Only the lead booker can transfer this ticket`,
    };
  }

  return { allowed: true };
};

// ============================================================================
// STATE MACHINE CONFIGURATION
// ============================================================================

/**
 * Concert Ticket State Machine Configuration
 *
 * Defines all valid states and transitions for concert ticket lifecycle
 */
export const CONCERT_TICKET_STATE_MACHINE: StateMachineConfig = {
  id: 'concert-ticket-v1',
  name: 'Concert Ticket Lifecycle V1',
  description: 'State machine for concert ticket lifecycle with anti-scalping and age restrictions',

  states: [
    {
      id: ConcertTicketState.CREATED,
      name: 'Created',
      description: 'Ticket record created but not yet issued',
      isInitial: true,
    },
    {
      id: ConcertTicketState.ISSUED,
      name: 'Issued',
      description: 'Ticket issued and valid for entry - can be transferred',
    },
    {
      id: ConcertTicketState.ADMITTED,
      name: 'Admitted',
      description: 'Fan has been admitted to the venue - transfers locked',
    },
    {
      id: ConcertTicketState.USED,
      name: 'Used',
      description: 'Event has been completed',
    },
    {
      id: ConcertTicketState.CLOSED,
      name: 'Closed',
      description: 'Ticket lifecycle completed normally',
      isTerminal: true,
    },
    {
      id: ConcertTicketState.CANCELLED,
      name: 'Cancelled',
      description: 'Ticket has been cancelled',
      isTerminal: true,
    },
    {
      id: ConcertTicketState.REFUNDED,
      name: 'Refunded',
      description: 'Ticket has been refunded',
      isTerminal: true,
    },
    {
      id: ConcertTicketState.EXPIRED,
      name: 'Expired',
      description: 'Ticket validity has expired',
      isTerminal: true,
    },
    {
      id: ConcertTicketState.VOID,
      name: 'Void',
      description: 'Terminal state - ticket is void and cannot be used',
      isTerminal: true,
    },
  ],

  transitions: [
    // Happy path: CREATED -> ISSUED -> ADMITTED -> USED -> CLOSED
    {
      from: ConcertTicketState.CREATED,
      to: ConcertTicketState.ISSUED,
      event: ConcertTicketEvent.ISSUE,
      description: 'Issue ticket',
    },
    {
      from: ConcertTicketState.ISSUED,
      to: ConcertTicketState.ADMITTED,
      event: ConcertTicketEvent.ADMIT,
      description: 'Admit fan to venue',
    },
    {
      from: ConcertTicketState.ADMITTED,
      to: ConcertTicketState.USED,
      event: ConcertTicketEvent.COMPLETE,
      description: 'Event completed',
    },
    {
      from: ConcertTicketState.USED,
      to: ConcertTicketState.CLOSED,
      event: ConcertTicketEvent.CLOSE,
      description: 'Close ticket lifecycle',
    },

    // Transfer (only from ISSUED, with guards including anti-scalping)
    {
      from: ConcertTicketState.ISSUED,
      to: ConcertTicketState.ISSUED,
      event: ConcertTicketEvent.TRANSFER,
      description: 'Transfer ticket to another fan (repeatable)',
      guards: [resalePriceCapGuard, transferWindowGuard, postAdmissionLockGuard, transferCountGuard, leadBookerGuard],
    },

    // Modify (only from ISSUED)
    {
      from: ConcertTicketState.ISSUED,
      to: ConcertTicketState.ISSUED,
      event: ConcertTicketEvent.MODIFY,
      description: 'Modify ticket details (e.g. seat change)',
    },

    // Cancellation paths
    {
      from: ConcertTicketState.CREATED,
      to: ConcertTicketState.CANCELLED,
      event: ConcertTicketEvent.CANCEL,
      description: 'Cancel unissued ticket',
    },
    {
      from: ConcertTicketState.ISSUED,
      to: ConcertTicketState.CANCELLED,
      event: ConcertTicketEvent.CANCEL,
      description: 'Cancel issued ticket',
    },

    // Refund paths
    {
      from: ConcertTicketState.ISSUED,
      to: ConcertTicketState.REFUNDED,
      event: ConcertTicketEvent.REFUND,
      description: 'Refund issued ticket',
    },
    {
      from: ConcertTicketState.CANCELLED,
      to: ConcertTicketState.REFUNDED,
      event: ConcertTicketEvent.REFUND,
      description: 'Refund cancelled ticket',
    },

    // Expiry path
    {
      from: ConcertTicketState.ISSUED,
      to: ConcertTicketState.EXPIRED,
      event: ConcertTicketEvent.EXPIRE,
      description: 'Ticket expired',
    },

    // Void paths
    {
      from: ConcertTicketState.CREATED,
      to: ConcertTicketState.VOID,
      event: ConcertTicketEvent.VOID,
      description: 'Void created ticket',
    },
    {
      from: ConcertTicketState.ISSUED,
      to: ConcertTicketState.VOID,
      event: ConcertTicketEvent.VOID,
      description: 'Void issued ticket',
    },
    {
      from: ConcertTicketState.REFUNDED,
      to: ConcertTicketState.VOID,
      event: ConcertTicketEvent.VOID,
      description: 'Void refunded ticket',
    },
    {
      from: ConcertTicketState.EXPIRED,
      to: ConcertTicketState.VOID,
      event: ConcertTicketEvent.VOID,
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
export function getValidNextStates(currentState: ConcertTicketState): ConcertTicketState[] {
  const transitions = CONCERT_TICKET_STATE_MACHINE.transitions.filter(
    (t) => t.from === currentState
  );
  return Array.from(new Set(transitions.map((t) => t.to as ConcertTicketState)));
}

/**
 * Check if a state is terminal
 */
export function isTerminalState(state: ConcertTicketState): boolean {
  return [
    ConcertTicketState.CLOSED,
    ConcertTicketState.VOID,
    ConcertTicketState.CANCELLED,
    ConcertTicketState.REFUNDED,
    ConcertTicketState.EXPIRED,
  ].includes(state);
}

/**
 * Check if ticket can be transferred in current state
 */
export function canTransferInState(state: ConcertTicketState): boolean {
  return state === ConcertTicketState.ISSUED;
}

/**
 * Map ConcertTicketState to legacy status string
 */
export function mapStateToLegacyStatus(
  state: ConcertTicketState
): string {
  const mapping: Record<ConcertTicketState, string> = {
    [ConcertTicketState.CREATED]: 'CREATED',
    [ConcertTicketState.ISSUED]: 'ISSUED',
    [ConcertTicketState.ADMITTED]: 'ADMITTED',
    [ConcertTicketState.USED]: 'USED',
    [ConcertTicketState.CLOSED]: 'CLOSED',
    [ConcertTicketState.CANCELLED]: 'CANCELLED',
    [ConcertTicketState.REFUNDED]: 'REFUNDED',
    [ConcertTicketState.EXPIRED]: 'EXPIRED',
    [ConcertTicketState.VOID]: 'VOID',
  };

  return mapping[state];
}

/**
 * Map legacy status string to ConcertTicketState
 */
export function mapLegacyStatusToState(
  legacyStatus: string
): ConcertTicketState {
  const mapping: Record<string, ConcertTicketState> = {
    CREATED: ConcertTicketState.CREATED,
    ISSUED: ConcertTicketState.ISSUED,
    ADMITTED: ConcertTicketState.ADMITTED,
    USED: ConcertTicketState.USED,
    CLOSED: ConcertTicketState.CLOSED,
    CANCELLED: ConcertTicketState.CANCELLED,
    REFUNDED: ConcertTicketState.REFUNDED,
    EXPIRED: ConcertTicketState.EXPIRED,
    VOID: ConcertTicketState.VOID,
  };

  return mapping[legacyStatus] ?? ConcertTicketState.CREATED;
}

// ============================================================================
// EXPORTS
// ============================================================================

export type {
  StateMachineConfig,
  StateContext,
  GuardResult,
  StateMachineGuard,
};
