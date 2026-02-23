/**
 * Service Right Template
 *
 * Shared utilities for service-right packs (Airline, Hotel, Car Rental, Concert, etc.)
 * Provides common enums, interfaces, and factory functions.
 */

import type {
  StateMachineGuard,
  StateContext,
  GuardResult,
} from '../core/StateMachine.js';
import {
  AssetType,
  InvestorClass,
  LiquidityProfile,
  FractionalizationType,
} from '../core/AssetAbstraction.js';
import { LifecycleState } from '../core/types.js';
import type { AssetPack } from './AssetPackRegistry.js';

// ============================================================================
// SERVICE RIGHT CATEGORY
// ============================================================================

export enum ServiceRightCategory {
  AIRLINE = 'AIRLINE',
  HOTEL = 'HOTEL',
  CAR_RENTAL = 'CAR_RENTAL',
  CONCERT = 'CONCERT',
  CUSTOM = 'CUSTOM',
}

// ============================================================================
// SERVICE RIGHT LIFECYCLE STATE
// ============================================================================

export enum ServiceRightLifecycleState {
  CREATED = 'CREATED',
  CONFIRMED = 'CONFIRMED',
  ACTIVATED = 'ACTIVATED',
  COMPLETED = 'COMPLETED',
  CLOSED = 'CLOSED',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
  REFUNDED = 'REFUNDED',
  VOID = 'VOID',
}

// ============================================================================
// SERVICE RIGHT TEMPLATE INTERFACE
// ============================================================================

export interface ServiceRightTemplate {
  /** Category of service right */
  category: ServiceRightCategory;
  /** Unique code for the service provider */
  providerCode: string;
  /** Provider name */
  providerName: string;
  /** Confirmation or booking number */
  confirmationNumber: string;
  /** Primary holder name */
  holderName: string;
  /** Holder identity document */
  holderIdentity?: {
    type: 'PASSPORT' | 'ID_CARD' | 'DRIVERS_LICENSE';
    number: string;
    country: string;
    expiryDate: string;
  };
  /** Service date/period */
  servicePeriod: {
    startDate: string;
    endDate: string;
  };
  /** Pricing information */
  pricing: {
    total: string;
    currency: string;
  };
  /** Current lifecycle state */
  status: string;
  /** Transfer rules */
  transferRules: {
    maxTransfers: number;
    transferCount: number;
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
  /** Whether service right is currently frozen */
  frozen: boolean;
  /** KYC verification status */
  kycStatus: {
    verified: boolean;
    verifiedAt?: string;
    expiresAt?: string;
  };
}

// ============================================================================
// GUARD FACTORY FUNCTIONS
// ============================================================================

/**
 * Creates a transfer window guard that blocks transfers
 * when less than `deadlineHours` before the service start date.
 */
export function createTransferWindowGuard(
  transferEventName: string,
  errorCode: string
): StateMachineGuard {
  return async (context: StateContext): Promise<GuardResult> => {
    if (context.event !== transferEventName) {
      return { allowed: true };
    }

    const opContext = context.metadata as Record<string, unknown> | undefined;
    if (!opContext?.startDate) {
      return { allowed: true };
    }

    const deadlineHours = (opContext.transferDeadlineHours as number) ?? 24;
    const startDate = new Date(opContext.startDate as string | number);
    const deadline = new Date(startDate.getTime() - deadlineHours * 60 * 60 * 1000);
    const now = new Date();

    if (now > deadline) {
      return {
        allowed: false,
        reason: `${errorCode}: Transfer window closed ${deadlineHours} hours before service start`,
      };
    }

    return { allowed: true };
  };
}

/**
 * Creates a void check guard that prevents any operations on voided items.
 */
export function createVoidCheckGuard(
  voidState: string,
  errorCode: string
): StateMachineGuard {
  return async (context: StateContext): Promise<GuardResult> => {
    if (context.currentState === voidState) {
      return {
        allowed: false,
        reason: `${errorCode}: Item is void and cannot be modified`,
      };
    }
    return { allowed: true };
  };
}

/**
 * Creates a post-activation lock guard that blocks transfers after activation.
 */
export function createPostActivationLockGuard(
  transferEventName: string,
  lockedStates: string[],
  errorCode: string
): StateMachineGuard {
  return async (context: StateContext): Promise<GuardResult> => {
    if (context.event !== transferEventName) {
      return { allowed: true };
    }

    if (lockedStates.includes(context.currentState as string)) {
      return {
        allowed: false,
        reason: `${errorCode}: Item is locked after activation`,
      };
    }

    return { allowed: true };
  };
}

/**
 * Creates a transfer count guard that enforces maximum transfer count.
 */
export function createTransferCountGuard(
  transferEventName: string,
  errorCode: string
): StateMachineGuard {
  return async (context: StateContext): Promise<GuardResult> => {
    if (context.event !== transferEventName) {
      return { allowed: true };
    }

    const opContext = context.metadata as Record<string, unknown> | undefined;
    if (!opContext) {
      return { allowed: true };
    }

    const transferCount = opContext.transferCount as number | undefined;
    const maxTransfers = opContext.maxTransfers as number | undefined;

    if (transferCount !== undefined && maxTransfers !== undefined) {
      if (transferCount >= maxTransfers) {
        return {
          allowed: false,
          reason: `${errorCode}: Maximum transfers (${maxTransfers}) exceeded`,
        };
      }
    }

    return { allowed: true };
  };
}

// ============================================================================
// SERVICE RIGHT PACK FACTORY
// ============================================================================

/**
 * Creates a basic AssetPack configuration from minimal input.
 */
export function createServiceRightPack(config: {
  id: string;
  name: string;
  description: string;
  category: ServiceRightCategory;
  tags: string[];
  metadataSchema?: Record<string, { type: 'string' | 'number' | 'boolean' | 'date' | 'array' | 'object'; required: boolean; description: string }>;
}): AssetPack {
  return {
    id: config.id,
    name: config.name,
    description: config.description,
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
          { type: 'APPROVAL', approvals: [{ role: 'PROVIDER', count: 1 }] },
        ],
        actions: [{ type: 'EMIT_EVENT', params: { event: `${config.id}_CONFIRMED` } }],
        description: `Confirm ${config.name.toLowerCase()}`,
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
          { type: 'APPROVAL', approvals: [{ role: 'PROVIDER', count: 1 }] },
        ],
        actions: [{ type: 'EMIT_EVENT', params: { event: 'TRANSFER_APPROVED' } }],
        description: 'Approve transfer',
      },
      {
        from: LifecycleState.ACTIVE,
        to: LifecycleState.REDEEMED,
        conditions: [
          { type: 'CUSTOM', customCondition: 'SERVICE_COMPLETED' },
        ],
        actions: [{ type: 'EMIT_EVENT', params: { event: `${config.id}_COMPLETED` } }],
        description: 'Service completed',
      },
      {
        from: LifecycleState.ACTIVE,
        to: LifecycleState.REDEEMED,
        conditions: [
          { type: 'APPROVAL', approvals: [{ role: 'HOLDER', count: 1 }] },
        ],
        actions: [{ type: 'EMIT_EVENT', params: { event: `${config.id}_CANCELLED` } }],
        description: `Cancel ${config.name.toLowerCase()}`,
      },
    ],

    complianceRules: [
      {
        id: 'TRANSFER_APPROVAL',
        name: 'Transfer Requires Approval',
        type: 'CUSTOM',
        params: { requireProviderApproval: true, allowIdentityBypass: true },
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
        params: { deadlineHoursBeforeService: 24 },
        severity: 'BLOCK',
      },
    ],

    requiredVerifications: [
      {
        type: 'IDENTITY_VERIFICATION',
        description: 'Holder identity verification (optional for auto-approval)',
        allowedVerifiers: ['PROVIDER', 'IDENTITY_PROVIDER'],
        mandatory: false,
      },
    ],

    metadataSchema: config.metadataSchema ?? {
      confirmationNumber: { type: 'string', required: true, description: 'Confirmation number' },
      holderName: { type: 'string', required: true, description: 'Holder name' },
      servicePeriod: { type: 'object', required: true, description: 'Service period' },
      pricing: { type: 'object', required: true, description: 'Pricing information' },
      transferRules: { type: 'object', required: true, description: 'Transfer rules' },
      cancellationPolicy: { type: 'object', required: true, description: 'Cancellation policy' },
    },

    tags: [config.category.toLowerCase(), ...config.tags],
  };
}
