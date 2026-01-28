/**
 * Hotel Reservation State Machine
 *
 * Dedicated state machine configuration for hotel reservation lifecycle with:
 * - Strict state transitions
 * - Guard functions for business rules
 * - Integration with core StateMachine infrastructure
 *
 * State Flow:
 * CREATED → CONFIRMED → CHECKED_IN → CHECKED_OUT → CLOSED
 *
 * Side paths:
 * CONFIRMED → CANCELLED
 * CONFIRMED → NO_SHOW → VOID
 * CONFIRMED → EXPIRED → VOID
 * Any non-terminal → VOID
 */

import type {
  StateMachineConfig,
  StateContext,
  GuardResult,
  StateMachineGuard,
} from '../core/StateMachine.js';

// ============================================================================
// HOTEL RESERVATION STATE ENUM
// ============================================================================

/**
 * All possible states for a hotel reservation
 */
export enum HotelReservationState {
  /** Initial state - reservation created but not yet confirmed */
  CREATED = 'CREATED',

  /** Reservation confirmed with payment */
  CONFIRMED = 'CONFIRMED',

  /** Guest has checked in */
  CHECKED_IN = 'CHECKED_IN',

  /** Guest has checked out */
  CHECKED_OUT = 'CHECKED_OUT',

  /** Reservation lifecycle completed normally */
  CLOSED = 'CLOSED',

  /** Reservation has been cancelled */
  CANCELLED = 'CANCELLED',

  /** Guest did not show up */
  NO_SHOW = 'NO_SHOW',

  /** Reservation validity has expired */
  EXPIRED = 'EXPIRED',

  /** Terminal state - reservation is void and cannot be used */
  VOID = 'VOID',
}

// ============================================================================
// STATE MACHINE EVENTS
// ============================================================================

/**
 * Events that trigger state transitions
 */
export enum HotelReservationEvent {
  CONFIRM = 'CONFIRM',
  CHECK_IN = 'CHECK_IN',
  CHECK_OUT = 'CHECK_OUT',
  CLOSE = 'CLOSE',
  CANCEL = 'CANCEL',
  MARK_NO_SHOW = 'MARK_NO_SHOW',
  EXPIRE = 'EXPIRE',
  VOID = 'VOID',
  TRANSFER = 'TRANSFER',
  MODIFY = 'MODIFY',
  EXTEND_STAY = 'EXTEND_STAY',
}

// ============================================================================
// ERROR CODES
// ============================================================================

/**
 * Error codes for state machine guard failures
 */
export enum HotelReservationErrorCode {
  /** Cancellation window has closed */
  CANCELLATION_WINDOW_CLOSED = 'CANCELLATION_WINDOW_CLOSED',

  /** Check-in attempted too early */
  CHECK_IN_TOO_EARLY = 'CHECK_IN_TOO_EARLY',

  /** Check-in date has passed */
  CHECK_IN_DATE_PASSED = 'CHECK_IN_DATE_PASSED',

  /** Guest is already checked in */
  ALREADY_CHECKED_IN = 'ALREADY_CHECKED_IN',

  /** Guest is not checked in */
  NOT_CHECKED_IN = 'NOT_CHECKED_IN',

  /** Transfer window has closed */
  TRANSFER_WINDOW_CLOSED = 'TRANSFER_WINDOW_CLOSED',

  /** Reservation is locked after check-in */
  RESERVATION_LOCKED_AFTER_CHECKIN = 'RESERVATION_LOCKED_AFTER_CHECKIN',

  /** Maximum transfers exceeded */
  MAX_TRANSFERS_EXCEEDED = 'MAX_TRANSFERS_EXCEEDED',

  /** Reservation is void */
  RESERVATION_VOID = 'RESERVATION_VOID',

  /** Guest has already checked out */
  ALREADY_CHECKED_OUT = 'ALREADY_CHECKED_OUT',

  /** Not the guest on the reservation */
  NOT_GUEST = 'NOT_GUEST',

  /** Invalid state transition attempted */
  INVALID_TRANSITION = 'INVALID_TRANSITION',

  /** Reservation not found */
  RESERVATION_NOT_FOUND = 'RESERVATION_NOT_FOUND',

  /** Not authorized to perform action */
  UNAUTHORIZED = 'UNAUTHORIZED',
}

// ============================================================================
// OPERATION CONTEXT
// ============================================================================

/**
 * Extended context for hotel reservation operations
 */
export interface HotelReservationOperationContext {
  /** The reservation ID being operated on */
  reservationId: string;

  /** Hotel code */
  hotelCode: string;

  /** Correlation ID for distributed tracing */
  correlationId: string;

  /** Unique event ID for idempotency */
  eventId: string;

  /** Check-in date for guard evaluation */
  checkInDate?: Date;

  /** Check-out date for guard evaluation */
  checkOutDate?: Date;

  /** Current transfer count */
  transferCount?: number;

  /** Maximum allowed transfers */
  maxTransfers?: number;

  /** Transfer deadline in hours before check-in */
  transferDeadlineHours?: number;

  /** Free cancellation deadline in hours before check-in */
  freeCancellationDeadlineHours?: number;
}

// ============================================================================
// GUARD FUNCTIONS
// ============================================================================

/**
 * Guard: Cancellation Window
 * Blocks CANCEL if past freeCancellationDeadlineHours before checkInDate
 */
export const cancellationWindowGuard: StateMachineGuard = async (
  context: StateContext
): Promise<GuardResult> => {
  if (context.event !== HotelReservationEvent.CANCEL) {
    return { allowed: true };
  }

  const opContext = context.metadata as unknown as HotelReservationOperationContext | undefined;
  if (!opContext?.checkInDate) {
    return { allowed: true };
  }

  const deadlineHours = opContext.freeCancellationDeadlineHours ?? 24;
  const deadline = new Date(opContext.checkInDate.getTime() - deadlineHours * 60 * 60 * 1000);
  const now = new Date();

  if (now > deadline) {
    return {
      allowed: false,
      reason: `${HotelReservationErrorCode.CANCELLATION_WINDOW_CLOSED}: Cancellation window closed ${deadlineHours} hours before check-in`,
    };
  }

  return { allowed: true };
};

/**
 * Guard: Check-in Date
 * Only allow CHECK_IN on or after checkInDate and before checkOutDate
 */
export const checkInDateGuard: StateMachineGuard = async (
  context: StateContext
): Promise<GuardResult> => {
  if (context.event !== HotelReservationEvent.CHECK_IN) {
    return { allowed: true };
  }

  const opContext = context.metadata as unknown as HotelReservationOperationContext | undefined;
  if (!opContext?.checkInDate) {
    return { allowed: true };
  }

  const now = new Date();
  const checkInDate = new Date(opContext.checkInDate);
  // Allow check-in from the start of the check-in day
  const checkInDayStart = new Date(checkInDate);
  checkInDayStart.setHours(0, 0, 0, 0);

  if (now < checkInDayStart) {
    return {
      allowed: false,
      reason: `${HotelReservationErrorCode.CHECK_IN_TOO_EARLY}: Cannot check in before ${checkInDayStart.toISOString()}`,
    };
  }

  if (opContext.checkOutDate) {
    const checkOutDate = new Date(opContext.checkOutDate);
    if (now >= checkOutDate) {
      return {
        allowed: false,
        reason: `${HotelReservationErrorCode.CHECK_IN_DATE_PASSED}: Check-in date has passed (checkout was ${checkOutDate.toISOString()})`,
      };
    }
  }

  return { allowed: true };
};

/**
 * Guard: Transfer Window
 * Blocks TRANSFER if less than transferDeadlineHours before checkInDate
 */
export const transferWindowGuard: StateMachineGuard = async (
  context: StateContext
): Promise<GuardResult> => {
  if (context.event !== HotelReservationEvent.TRANSFER) {
    return { allowed: true };
  }

  const opContext = context.metadata as unknown as HotelReservationOperationContext | undefined;
  if (!opContext?.checkInDate) {
    return { allowed: true };
  }

  const deadlineHours = opContext.transferDeadlineHours ?? 24;
  const deadline = new Date(opContext.checkInDate.getTime() - deadlineHours * 60 * 60 * 1000);
  const now = new Date();

  if (now > deadline) {
    return {
      allowed: false,
      reason: `${HotelReservationErrorCode.TRANSFER_WINDOW_CLOSED}: Transfer window closed ${deadlineHours} hours before check-in`,
    };
  }

  return { allowed: true };
};

/**
 * Guard: Post Check-in Lock
 * Blocks TRANSFER if state is CHECKED_IN or later
 */
export const postCheckInLockGuard: StateMachineGuard = async (
  context: StateContext
): Promise<GuardResult> => {
  if (context.event !== HotelReservationEvent.TRANSFER) {
    return { allowed: true };
  }

  const lockedStates = [
    HotelReservationState.CHECKED_IN,
    HotelReservationState.CHECKED_OUT,
    HotelReservationState.CLOSED,
  ];

  if (lockedStates.includes(context.currentState as HotelReservationState)) {
    return {
      allowed: false,
      reason: `${HotelReservationErrorCode.RESERVATION_LOCKED_AFTER_CHECKIN}: Reservation is locked after check-in`,
    };
  }

  return { allowed: true };
};

/**
 * Guard: Void Check
 * Prevents any operations on voided reservations
 */
export const voidCheckGuard: StateMachineGuard = async (
  context: StateContext
): Promise<GuardResult> => {
  if (context.currentState === HotelReservationState.VOID) {
    return {
      allowed: false,
      reason: `${HotelReservationErrorCode.RESERVATION_VOID}: Reservation is void and cannot be modified`,
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
  if (context.event !== HotelReservationEvent.TRANSFER) {
    return { allowed: true };
  }

  const opContext = context.metadata as unknown as HotelReservationOperationContext | undefined;
  if (!opContext) {
    return { allowed: true };
  }

  const { transferCount, maxTransfers } = opContext;
  if (transferCount !== undefined && maxTransfers !== undefined) {
    if (transferCount >= maxTransfers) {
      return {
        allowed: false,
        reason: `${HotelReservationErrorCode.MAX_TRANSFERS_EXCEEDED}: Maximum transfers (${maxTransfers}) exceeded`,
      };
    }
  }

  return { allowed: true };
};

// ============================================================================
// STATE MACHINE CONFIGURATION
// ============================================================================

/**
 * Hotel Reservation State Machine Configuration
 *
 * Defines all valid states and transitions for hotel reservation lifecycle
 */
export const HOTEL_RESERVATION_STATE_MACHINE: StateMachineConfig = {
  id: 'hotel-reservation-v1',
  name: 'Hotel Reservation Lifecycle V1',
  description: 'State machine for hotel reservation lifecycle with strict transition enforcement',

  states: [
    {
      id: HotelReservationState.CREATED,
      name: 'Created',
      description: 'Reservation record created but not yet confirmed',
      isInitial: true,
    },
    {
      id: HotelReservationState.CONFIRMED,
      name: 'Confirmed',
      description: 'Reservation confirmed with payment - can be transferred',
    },
    {
      id: HotelReservationState.CHECKED_IN,
      name: 'Checked In',
      description: 'Guest has checked in - transfers locked',
    },
    {
      id: HotelReservationState.CHECKED_OUT,
      name: 'Checked Out',
      description: 'Guest has checked out',
    },
    {
      id: HotelReservationState.CLOSED,
      name: 'Closed',
      description: 'Reservation lifecycle completed normally',
      isTerminal: true,
    },
    {
      id: HotelReservationState.CANCELLED,
      name: 'Cancelled',
      description: 'Reservation has been cancelled',
      isTerminal: true,
    },
    {
      id: HotelReservationState.NO_SHOW,
      name: 'No Show',
      description: 'Guest did not show up',
      isTerminal: true,
    },
    {
      id: HotelReservationState.EXPIRED,
      name: 'Expired',
      description: 'Reservation validity has expired',
      isTerminal: true,
    },
    {
      id: HotelReservationState.VOID,
      name: 'Void',
      description: 'Terminal state - reservation is void and cannot be used',
      isTerminal: true,
    },
  ],

  transitions: [
    // Happy path: CREATED → CONFIRMED → CHECKED_IN → CHECKED_OUT → CLOSED
    {
      from: HotelReservationState.CREATED,
      to: HotelReservationState.CONFIRMED,
      event: HotelReservationEvent.CONFIRM,
      description: 'Confirm reservation with payment',
    },
    {
      from: HotelReservationState.CONFIRMED,
      to: HotelReservationState.CHECKED_IN,
      event: HotelReservationEvent.CHECK_IN,
      description: 'Guest checks in',
      guards: [checkInDateGuard],
    },
    {
      from: HotelReservationState.CHECKED_IN,
      to: HotelReservationState.CHECKED_OUT,
      event: HotelReservationEvent.CHECK_OUT,
      description: 'Guest checks out',
    },
    {
      from: HotelReservationState.CHECKED_OUT,
      to: HotelReservationState.CLOSED,
      event: HotelReservationEvent.CLOSE,
      description: 'Close reservation lifecycle',
    },

    // Transfer (only from CONFIRMED, with guards)
    {
      from: HotelReservationState.CONFIRMED,
      to: HotelReservationState.CONFIRMED,
      event: HotelReservationEvent.TRANSFER,
      description: 'Transfer reservation to another guest (repeatable)',
      guards: [transferWindowGuard, postCheckInLockGuard, transferCountGuard],
    },

    // Modify (only from CONFIRMED)
    {
      from: HotelReservationState.CONFIRMED,
      to: HotelReservationState.CONFIRMED,
      event: HotelReservationEvent.MODIFY,
      description: 'Modify reservation details',
    },

    // Extend stay (only from CHECKED_IN)
    {
      from: HotelReservationState.CHECKED_IN,
      to: HotelReservationState.CHECKED_IN,
      event: HotelReservationEvent.EXTEND_STAY,
      description: 'Extend the stay by updating checkout date',
    },

    // Cancellation paths
    {
      from: HotelReservationState.CREATED,
      to: HotelReservationState.CANCELLED,
      event: HotelReservationEvent.CANCEL,
      description: 'Cancel uncofirmed reservation',
    },
    {
      from: HotelReservationState.CONFIRMED,
      to: HotelReservationState.CANCELLED,
      event: HotelReservationEvent.CANCEL,
      description: 'Cancel confirmed reservation',
      guards: [cancellationWindowGuard],
    },

    // No-show path
    {
      from: HotelReservationState.CONFIRMED,
      to: HotelReservationState.NO_SHOW,
      event: HotelReservationEvent.MARK_NO_SHOW,
      description: 'Mark guest as no-show',
    },

    // Expiry path
    {
      from: HotelReservationState.CONFIRMED,
      to: HotelReservationState.EXPIRED,
      event: HotelReservationEvent.EXPIRE,
      description: 'Reservation expired',
    },

    // Void paths (any non-terminal → VOID)
    {
      from: HotelReservationState.CREATED,
      to: HotelReservationState.VOID,
      event: HotelReservationEvent.VOID,
      description: 'Void created reservation',
    },
    {
      from: HotelReservationState.CONFIRMED,
      to: HotelReservationState.VOID,
      event: HotelReservationEvent.VOID,
      description: 'Void confirmed reservation',
    },
    {
      from: HotelReservationState.CHECKED_IN,
      to: HotelReservationState.VOID,
      event: HotelReservationEvent.VOID,
      description: 'Void checked-in reservation',
    },
    {
      from: HotelReservationState.CHECKED_OUT,
      to: HotelReservationState.VOID,
      event: HotelReservationEvent.VOID,
      description: 'Void checked-out reservation',
    },
    {
      from: HotelReservationState.NO_SHOW,
      to: HotelReservationState.VOID,
      event: HotelReservationEvent.VOID,
      description: 'Void no-show reservation',
    },
    {
      from: HotelReservationState.EXPIRED,
      to: HotelReservationState.VOID,
      event: HotelReservationEvent.VOID,
      description: 'Void expired reservation',
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
export function getValidNextStates(currentState: HotelReservationState): HotelReservationState[] {
  const transitions = HOTEL_RESERVATION_STATE_MACHINE.transitions.filter(
    (t) => t.from === currentState
  );
  return Array.from(new Set(transitions.map((t) => t.to as HotelReservationState)));
}

/**
 * Check if a state is terminal
 */
export function isTerminalState(state: HotelReservationState): boolean {
  return [
    HotelReservationState.CLOSED,
    HotelReservationState.VOID,
    HotelReservationState.CANCELLED,
    HotelReservationState.NO_SHOW,
    HotelReservationState.EXPIRED,
  ].includes(state);
}

/**
 * Check if reservation can be transferred in current state
 */
export function canTransferInState(state: HotelReservationState): boolean {
  return state === HotelReservationState.CONFIRMED;
}

/**
 * Map HotelReservationState to legacy status string
 */
export function mapStateToLegacyStatus(
  state: HotelReservationState
): string {
  const mapping: Record<HotelReservationState, string> = {
    [HotelReservationState.CREATED]: 'CREATED',
    [HotelReservationState.CONFIRMED]: 'CONFIRMED',
    [HotelReservationState.CHECKED_IN]: 'CHECKED_IN',
    [HotelReservationState.CHECKED_OUT]: 'CHECKED_OUT',
    [HotelReservationState.CLOSED]: 'CLOSED',
    [HotelReservationState.CANCELLED]: 'CANCELLED',
    [HotelReservationState.NO_SHOW]: 'NO_SHOW',
    [HotelReservationState.EXPIRED]: 'EXPIRED',
    [HotelReservationState.VOID]: 'VOID',
  };

  return mapping[state];
}

/**
 * Map legacy status string to HotelReservationState
 */
export function mapLegacyStatusToState(
  legacyStatus: string
): HotelReservationState {
  const mapping: Record<string, HotelReservationState> = {
    CREATED: HotelReservationState.CREATED,
    CONFIRMED: HotelReservationState.CONFIRMED,
    CHECKED_IN: HotelReservationState.CHECKED_IN,
    CHECKED_OUT: HotelReservationState.CHECKED_OUT,
    CLOSED: HotelReservationState.CLOSED,
    CANCELLED: HotelReservationState.CANCELLED,
    NO_SHOW: HotelReservationState.NO_SHOW,
    EXPIRED: HotelReservationState.EXPIRED,
    VOID: HotelReservationState.VOID,
  };

  return mapping[legacyStatus] ?? HotelReservationState.CREATED;
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
