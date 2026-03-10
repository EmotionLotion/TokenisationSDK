/**
 * Car Rental State Machine
 *
 * Dedicated state machine configuration for car rental lifecycle with:
 * - Strict state transitions
 * - Guard functions for business rules
 * - Integration with core StateMachine infrastructure
 *
 * State Flow:
 * CREATED -> CONFIRMED -> PICKED_UP -> RETURNED -> INSPECTED -> CLOSED
 *
 * Side paths:
 * CONFIRMED -> CANCELLED
 * CONFIRMED -> NO_SHOW -> VOID
 * CONFIRMED -> EXPIRED -> VOID
 * Any non-terminal -> VOID
 */

import type {
  StateMachineConfig,
  StateContext,
  GuardResult,
  StateMachineGuard,
} from '@tokenisation/core';

// ============================================================================
// CAR RENTAL STATE ENUM
// ============================================================================

/**
 * All possible states for a car rental
 */
export enum CarRentalState {
  /** Initial state - rental created but not yet confirmed */
  CREATED = 'CREATED',

  /** Rental confirmed with payment and deposit held */
  CONFIRMED = 'CONFIRMED',

  /** Vehicle has been picked up by driver */
  PICKED_UP = 'PICKED_UP',

  /** Vehicle has been returned */
  RETURNED = 'RETURNED',

  /** Vehicle has been inspected post-return */
  INSPECTED = 'INSPECTED',

  /** Rental lifecycle completed normally */
  CLOSED = 'CLOSED',

  /** Rental has been cancelled */
  CANCELLED = 'CANCELLED',

  /** Driver did not show up for pickup */
  NO_SHOW = 'NO_SHOW',

  /** Rental validity has expired */
  EXPIRED = 'EXPIRED',

  /** Terminal state - rental is void and cannot be used */
  VOID = 'VOID',
}

// ============================================================================
// STATE MACHINE EVENTS
// ============================================================================

/**
 * Events that trigger state transitions
 */
export enum CarRentalEvent {
  CONFIRM = 'CONFIRM',
  PICK_UP = 'PICK_UP',
  RETURN = 'RETURN',
  INSPECT = 'INSPECT',
  CLOSE = 'CLOSE',
  CANCEL = 'CANCEL',
  MARK_NO_SHOW = 'MARK_NO_SHOW',
  EXPIRE = 'EXPIRE',
  VOID = 'VOID',
  TRANSFER = 'TRANSFER',
  MODIFY = 'MODIFY',
  EXTEND_RENTAL = 'EXTEND_RENTAL',
}

// ============================================================================
// ERROR CODES
// ============================================================================

/**
 * Error codes for state machine guard failures
 */
export enum CarRentalErrorCode {
  /** Cancellation window has closed */
  CANCELLATION_WINDOW_CLOSED = 'CANCELLATION_WINDOW_CLOSED',

  /** Pickup attempted before pickup date */
  PICKUP_DATE_NOT_REACHED = 'PICKUP_DATE_NOT_REACHED',

  /** Pickup date has passed */
  PICKUP_DATE_PASSED = 'PICKUP_DATE_PASSED',

  /** Vehicle is already picked up */
  ALREADY_PICKED_UP = 'ALREADY_PICKED_UP',

  /** Vehicle has not been picked up */
  NOT_PICKED_UP = 'NOT_PICKED_UP',

  /** Transfer window has closed */
  TRANSFER_WINDOW_CLOSED = 'TRANSFER_WINDOW_CLOSED',

  /** Rental is locked after pickup */
  RENTAL_LOCKED_AFTER_PICKUP = 'RENTAL_LOCKED_AFTER_PICKUP',

  /** Maximum transfers exceeded */
  MAX_TRANSFERS_EXCEEDED = 'MAX_TRANSFERS_EXCEEDED',

  /** Rental is void */
  RENTAL_VOID = 'RENTAL_VOID',

  /** Vehicle has already been returned */
  ALREADY_RETURNED = 'ALREADY_RETURNED',

  /** Not the driver on the rental */
  NOT_DRIVER = 'NOT_DRIVER',

  /** Invalid state transition attempted */
  INVALID_TRANSITION = 'INVALID_TRANSITION',

  /** Rental not found */
  RENTAL_NOT_FOUND = 'RENTAL_NOT_FOUND',

  /** Not authorized to perform action */
  UNAUTHORIZED = 'UNAUTHORIZED',

  /** Insurance not verified */
  INSURANCE_NOT_VERIFIED = 'INSURANCE_NOT_VERIFIED',
}

// ============================================================================
// OPERATION CONTEXT
// ============================================================================

/**
 * Extended context for car rental operations
 */
export interface CarRentalOperationContext {
  /** The rental ID being operated on */
  rentalId: string;

  /** Rental company code */
  rentalCompanyCode: string;

  /** Correlation ID for distributed tracing */
  correlationId: string;

  /** Unique event ID for idempotency */
  eventId: string;

  /** Pickup date for guard evaluation */
  pickupDate?: Date;

  /** Return date for guard evaluation */
  returnDate?: Date;

  /** Current transfer count */
  transferCount?: number;

  /** Maximum allowed transfers */
  maxTransfers?: number;

  /** Transfer deadline in hours before pickup */
  transferDeadlineHours?: number;

  /** Free cancellation deadline in hours before pickup */
  freeCancellationDeadlineHours?: number;

  /** Whether insurance is verified */
  insuranceVerified?: boolean;
}

// ============================================================================
// GUARD FUNCTIONS
// ============================================================================

/**
 * Guard: Pickup Date
 * Only allow PICK_UP on or after pickupDate and before returnDate
 */
export const pickupDateGuard: StateMachineGuard = async (
  context: StateContext
): Promise<GuardResult> => {
  if (context.event !== CarRentalEvent.PICK_UP) {
    return { allowed: true };
  }

  const opContext = context.metadata as unknown as CarRentalOperationContext | undefined;
  if (!opContext?.pickupDate) {
    return { allowed: true };
  }

  const now = new Date();
  const pickupDate = new Date(opContext.pickupDate);
  const pickupDayStart = new Date(pickupDate);
  pickupDayStart.setHours(0, 0, 0, 0);

  if (now < pickupDayStart) {
    return {
      allowed: false,
      reason: `${CarRentalErrorCode.PICKUP_DATE_NOT_REACHED}: Cannot pick up before ${pickupDayStart.toISOString()}`,
    };
  }

  if (opContext.returnDate) {
    const returnDate = new Date(opContext.returnDate);
    if (now >= returnDate) {
      return {
        allowed: false,
        reason: `${CarRentalErrorCode.PICKUP_DATE_PASSED}: Pickup date has passed (return was ${returnDate.toISOString()})`,
      };
    }
  }

  return { allowed: true };
};

/**
 * Guard: Insurance Verification
 * Blocks PICK_UP if insurance is not verified
 */
export const insuranceVerificationGuard: StateMachineGuard = async (
  context: StateContext
): Promise<GuardResult> => {
  if (context.event !== CarRentalEvent.PICK_UP) {
    return { allowed: true };
  }

  const opContext = context.metadata as unknown as CarRentalOperationContext | undefined;
  if (!opContext) {
    return { allowed: true };
  }

  if (opContext.insuranceVerified === false) {
    return {
      allowed: false,
      reason: `${CarRentalErrorCode.INSURANCE_NOT_VERIFIED}: Insurance must be verified before pickup`,
    };
  }

  return { allowed: true };
};

/**
 * Guard: Transfer Window
 * Blocks TRANSFER if less than transferDeadlineHours before pickupDate
 */
export const transferWindowGuard: StateMachineGuard = async (
  context: StateContext
): Promise<GuardResult> => {
  if (context.event !== CarRentalEvent.TRANSFER) {
    return { allowed: true };
  }

  const opContext = context.metadata as unknown as CarRentalOperationContext | undefined;
  if (!opContext?.pickupDate) {
    return { allowed: true };
  }

  const deadlineHours = opContext.transferDeadlineHours ?? 24;
  const deadline = new Date(opContext.pickupDate.getTime() - deadlineHours * 60 * 60 * 1000);
  const now = new Date();

  if (now > deadline) {
    return {
      allowed: false,
      reason: `${CarRentalErrorCode.TRANSFER_WINDOW_CLOSED}: Transfer window closed ${deadlineHours} hours before pickup`,
    };
  }

  return { allowed: true };
};

/**
 * Guard: Post Pickup Lock
 * Blocks TRANSFER if state is PICKED_UP or later
 */
export const postPickupLockGuard: StateMachineGuard = async (
  context: StateContext
): Promise<GuardResult> => {
  if (context.event !== CarRentalEvent.TRANSFER) {
    return { allowed: true };
  }

  const lockedStates = [
    CarRentalState.PICKED_UP,
    CarRentalState.RETURNED,
    CarRentalState.INSPECTED,
    CarRentalState.CLOSED,
  ];

  if (lockedStates.includes(context.currentState as CarRentalState)) {
    return {
      allowed: false,
      reason: `${CarRentalErrorCode.RENTAL_LOCKED_AFTER_PICKUP}: Rental is locked after pickup`,
    };
  }

  return { allowed: true };
};

/**
 * Guard: Void Check
 * Prevents any operations on voided rentals
 */
export const voidCheckGuard: StateMachineGuard = async (
  context: StateContext
): Promise<GuardResult> => {
  if (context.currentState === CarRentalState.VOID) {
    return {
      allowed: false,
      reason: `${CarRentalErrorCode.RENTAL_VOID}: Rental is void and cannot be modified`,
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
  if (context.event !== CarRentalEvent.TRANSFER) {
    return { allowed: true };
  }

  const opContext = context.metadata as unknown as CarRentalOperationContext | undefined;
  if (!opContext) {
    return { allowed: true };
  }

  const { transferCount, maxTransfers } = opContext;
  if (transferCount !== undefined && maxTransfers !== undefined) {
    if (transferCount >= maxTransfers) {
      return {
        allowed: false,
        reason: `${CarRentalErrorCode.MAX_TRANSFERS_EXCEEDED}: Maximum transfers (${maxTransfers}) exceeded`,
      };
    }
  }

  return { allowed: true };
};

// ============================================================================
// STATE MACHINE CONFIGURATION
// ============================================================================

/**
 * Car Rental State Machine Configuration
 *
 * Defines all valid states and transitions for car rental lifecycle
 */
export const CAR_RENTAL_STATE_MACHINE: StateMachineConfig = {
  id: 'car-rental-v1',
  name: 'Car Rental Lifecycle V1',
  description: 'State machine for car rental lifecycle with strict transition enforcement',

  states: [
    {
      id: CarRentalState.CREATED,
      name: 'Created',
      description: 'Rental record created but not yet confirmed',
      isInitial: true,
    },
    {
      id: CarRentalState.CONFIRMED,
      name: 'Confirmed',
      description: 'Rental confirmed with payment and deposit held - can be transferred',
    },
    {
      id: CarRentalState.PICKED_UP,
      name: 'Picked Up',
      description: 'Vehicle has been picked up by driver - transfers locked',
    },
    {
      id: CarRentalState.RETURNED,
      name: 'Returned',
      description: 'Vehicle has been returned',
    },
    {
      id: CarRentalState.INSPECTED,
      name: 'Inspected',
      description: 'Vehicle has been inspected post-return',
    },
    {
      id: CarRentalState.CLOSED,
      name: 'Closed',
      description: 'Rental lifecycle completed normally',
      isTerminal: true,
    },
    {
      id: CarRentalState.CANCELLED,
      name: 'Cancelled',
      description: 'Rental has been cancelled',
      isTerminal: true,
    },
    {
      id: CarRentalState.NO_SHOW,
      name: 'No Show',
      description: 'Driver did not show up for pickup',
      isTerminal: true,
    },
    {
      id: CarRentalState.EXPIRED,
      name: 'Expired',
      description: 'Rental validity has expired',
      isTerminal: true,
    },
    {
      id: CarRentalState.VOID,
      name: 'Void',
      description: 'Terminal state - rental is void and cannot be used',
      isTerminal: true,
    },
  ],

  transitions: [
    // Happy path: CREATED -> CONFIRMED -> PICKED_UP -> RETURNED -> INSPECTED -> CLOSED
    {
      from: CarRentalState.CREATED,
      to: CarRentalState.CONFIRMED,
      event: CarRentalEvent.CONFIRM,
      description: 'Confirm rental with payment and deposit',
    },
    {
      from: CarRentalState.CONFIRMED,
      to: CarRentalState.PICKED_UP,
      event: CarRentalEvent.PICK_UP,
      description: 'Driver picks up vehicle',
      guards: [pickupDateGuard, insuranceVerificationGuard],
    },
    {
      from: CarRentalState.PICKED_UP,
      to: CarRentalState.RETURNED,
      event: CarRentalEvent.RETURN,
      description: 'Driver returns vehicle',
    },
    {
      from: CarRentalState.RETURNED,
      to: CarRentalState.INSPECTED,
      event: CarRentalEvent.INSPECT,
      description: 'Vehicle inspected post-return',
    },
    {
      from: CarRentalState.INSPECTED,
      to: CarRentalState.CLOSED,
      event: CarRentalEvent.CLOSE,
      description: 'Close rental lifecycle',
    },

    // Transfer (only from CONFIRMED, with guards)
    {
      from: CarRentalState.CONFIRMED,
      to: CarRentalState.CONFIRMED,
      event: CarRentalEvent.TRANSFER,
      description: 'Transfer rental to another driver (repeatable)',
      guards: [transferWindowGuard, postPickupLockGuard, transferCountGuard],
    },

    // Modify (only from CONFIRMED)
    {
      from: CarRentalState.CONFIRMED,
      to: CarRentalState.CONFIRMED,
      event: CarRentalEvent.MODIFY,
      description: 'Modify rental details',
    },

    // Extend rental (only from PICKED_UP)
    {
      from: CarRentalState.PICKED_UP,
      to: CarRentalState.PICKED_UP,
      event: CarRentalEvent.EXTEND_RENTAL,
      description: 'Extend the rental by updating return date',
    },

    // Cancellation paths
    {
      from: CarRentalState.CREATED,
      to: CarRentalState.CANCELLED,
      event: CarRentalEvent.CANCEL,
      description: 'Cancel unconfirmed rental',
    },
    {
      from: CarRentalState.CONFIRMED,
      to: CarRentalState.CANCELLED,
      event: CarRentalEvent.CANCEL,
      description: 'Cancel confirmed rental',
    },

    // No-show path
    {
      from: CarRentalState.CONFIRMED,
      to: CarRentalState.NO_SHOW,
      event: CarRentalEvent.MARK_NO_SHOW,
      description: 'Mark driver as no-show',
    },

    // Expiry path
    {
      from: CarRentalState.CONFIRMED,
      to: CarRentalState.EXPIRED,
      event: CarRentalEvent.EXPIRE,
      description: 'Rental expired',
    },

    // Void paths (any non-terminal -> VOID)
    {
      from: CarRentalState.CREATED,
      to: CarRentalState.VOID,
      event: CarRentalEvent.VOID,
      description: 'Void created rental',
    },
    {
      from: CarRentalState.CONFIRMED,
      to: CarRentalState.VOID,
      event: CarRentalEvent.VOID,
      description: 'Void confirmed rental',
    },
    {
      from: CarRentalState.PICKED_UP,
      to: CarRentalState.VOID,
      event: CarRentalEvent.VOID,
      description: 'Void picked-up rental',
    },
    {
      from: CarRentalState.RETURNED,
      to: CarRentalState.VOID,
      event: CarRentalEvent.VOID,
      description: 'Void returned rental',
    },
    {
      from: CarRentalState.INSPECTED,
      to: CarRentalState.VOID,
      event: CarRentalEvent.VOID,
      description: 'Void inspected rental',
    },
    {
      from: CarRentalState.NO_SHOW,
      to: CarRentalState.VOID,
      event: CarRentalEvent.VOID,
      description: 'Void no-show rental',
    },
    {
      from: CarRentalState.EXPIRED,
      to: CarRentalState.VOID,
      event: CarRentalEvent.VOID,
      description: 'Void expired rental',
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
export function getValidNextStates(currentState: CarRentalState): CarRentalState[] {
  const transitions = CAR_RENTAL_STATE_MACHINE.transitions.filter(
    (t) => t.from === currentState
  );
  return Array.from(new Set(transitions.map((t) => t.to as CarRentalState)));
}

/**
 * Check if a state is terminal
 */
export function isTerminalState(state: CarRentalState): boolean {
  return [
    CarRentalState.CLOSED,
    CarRentalState.VOID,
    CarRentalState.CANCELLED,
    CarRentalState.NO_SHOW,
    CarRentalState.EXPIRED,
  ].includes(state);
}

/**
 * Check if rental can be transferred in current state
 */
export function canTransferInState(state: CarRentalState): boolean {
  return state === CarRentalState.CONFIRMED;
}

/**
 * Map CarRentalState to legacy status string
 */
export function mapStateToLegacyStatus(
  state: CarRentalState
): string {
  const mapping: Record<CarRentalState, string> = {
    [CarRentalState.CREATED]: 'CREATED',
    [CarRentalState.CONFIRMED]: 'CONFIRMED',
    [CarRentalState.PICKED_UP]: 'PICKED_UP',
    [CarRentalState.RETURNED]: 'RETURNED',
    [CarRentalState.INSPECTED]: 'INSPECTED',
    [CarRentalState.CLOSED]: 'CLOSED',
    [CarRentalState.CANCELLED]: 'CANCELLED',
    [CarRentalState.NO_SHOW]: 'NO_SHOW',
    [CarRentalState.EXPIRED]: 'EXPIRED',
    [CarRentalState.VOID]: 'VOID',
  };

  return mapping[state];
}

/**
 * Map legacy status string to CarRentalState
 */
export function mapLegacyStatusToState(
  legacyStatus: string
): CarRentalState {
  const mapping: Record<string, CarRentalState> = {
    CREATED: CarRentalState.CREATED,
    CONFIRMED: CarRentalState.CONFIRMED,
    PICKED_UP: CarRentalState.PICKED_UP,
    RETURNED: CarRentalState.RETURNED,
    INSPECTED: CarRentalState.INSPECTED,
    CLOSED: CarRentalState.CLOSED,
    CANCELLED: CarRentalState.CANCELLED,
    NO_SHOW: CarRentalState.NO_SHOW,
    EXPIRED: CarRentalState.EXPIRED,
    VOID: CarRentalState.VOID,
  };

  return mapping[legacyStatus] ?? CarRentalState.CREATED;
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
