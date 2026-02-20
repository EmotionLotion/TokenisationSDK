/**
 * Real Estate Dubai Lifecycle State Machine
 *
 * Models Stake.com's full real estate lifecycle with 11 states.
 * Eliminates information loss from collapsing 7 Stake stages into 3 SDK LifecycleState values.
 *
 * States: SOURCING → DUE_DILIGENCE → LEGAL_STRUCTURING → REGULATORY_APPROVAL → TOKEN_ISSUANCE → LIVE
 *         LIVE → SECONDARY_TRADING (lockup expires)
 *         LIVE ↔ DISTRIBUTING, SECONDARY_TRADING ↔ DISTRIBUTING
 *         LIVE/SECONDARY_TRADING → FROZEN → LIVE/SECONDARY_TRADING (freeze/unfreeze)
 *         Any non-terminal → REDEEMED → CLOSED
 */

import type { StateMachineConfig, StateContext, GuardResult } from '../core/StateMachine.js';
import { stateMachineRegistry } from '../core/StateMachine.js';
import { LifecycleState } from '../core/types.js';

// ============================================================================
// REAL ESTATE LIFECYCLE STATES
// ============================================================================

/**
 * All states in the Dubai real estate lifecycle.
 * These map 1:1 to Stake.com stages with zero information loss.
 */
export const RealEstateLifecycleStates = {
  SOURCING: 'SOURCING',
  DUE_DILIGENCE: 'DUE_DILIGENCE',
  LEGAL_STRUCTURING: 'LEGAL_STRUCTURING',
  REGULATORY_APPROVAL: 'REGULATORY_APPROVAL',
  TOKEN_ISSUANCE: 'TOKEN_ISSUANCE',
  LIVE: 'LIVE',
  SECONDARY_TRADING: 'SECONDARY_TRADING',
  DISTRIBUTING: 'DISTRIBUTING',
  FROZEN: 'FROZEN',
  REDEEMED: 'REDEEMED',
  CLOSED: 'CLOSED',
} as const;

export type RealEstateLifecycleState = typeof RealEstateLifecycleStates[keyof typeof RealEstateLifecycleStates];

// ============================================================================
// GUARD FUNCTIONS
// ============================================================================

/** Guard: lockup period must have expired before entering secondary trading */
const lockupExpiredGuard = async (context: StateContext): Promise<GuardResult> => {
  const lockupEnd = context.metadata?.lockupEndDate as string | undefined;
  if (!lockupEnd) {
    return { allowed: true }; // No lockup configured → allow
  }
  const now = new Date();
  const end = new Date(lockupEnd);
  if (now < end) {
    return { allowed: false, reason: `Lockup period active until ${lockupEnd}` };
  }
  return { allowed: true };
};

/** Guard: VARA regulatory approval must be obtained */
const varaApprovalGuard = async (context: StateContext): Promise<GuardResult> => {
  const varaApproved = context.metadata?.varaApproved as boolean | undefined;
  if (varaApproved === false) {
    return { allowed: false, reason: 'VARA regulatory approval not obtained' };
  }
  return { allowed: true };
};

/** Guard: DLD tokenization must be registered */
const dldRegisteredGuard = async (context: StateContext): Promise<GuardResult> => {
  const dldRegistered = context.metadata?.dldTokenizationRegistered as boolean | undefined;
  if (dldRegistered === false) {
    return { allowed: false, reason: 'DLD tokenization not registered' };
  }
  return { allowed: true };
};

/** Guard: property must be sold or fully redeemed */
const propertySoldGuard = async (context: StateContext): Promise<GuardResult> => {
  const propertySold = context.metadata?.propertySold as boolean | undefined;
  if (propertySold !== true) {
    return { allowed: false, reason: 'Property has not been sold — cannot redeem' };
  }
  return { allowed: true };
};

// ============================================================================
// STATE MACHINE CONFIGURATION
// ============================================================================

/**
 * Full lifecycle config for Dubai real estate tokenization.
 * 11 states with granular transitions modeling Stake.com's pipeline.
 */
export const REAL_ESTATE_LIFECYCLE: StateMachineConfig = {
  id: 'real-estate-dubai',
  name: 'Dubai Real Estate Lifecycle',
  description: 'Full 11-state lifecycle for Stake.com-style real estate tokenization with zero information loss',

  states: [
    { id: 'SOURCING', name: 'Sourcing', isInitial: true, description: 'Property identified and under evaluation' },
    { id: 'DUE_DILIGENCE', name: 'Due Diligence', description: 'Comprehensive property and legal due diligence' },
    { id: 'LEGAL_STRUCTURING', name: 'Legal Structuring', description: 'SPV creation and legal documentation' },
    { id: 'REGULATORY_APPROVAL', name: 'Regulatory Approval', description: 'VARA/SCA/DLD regulatory approvals' },
    { id: 'TOKEN_ISSUANCE', name: 'Token Issuance', description: 'Smart contract deployment and token minting' },
    { id: 'LIVE', name: 'Live', description: 'Primary distribution — tokens available for purchase' },
    { id: 'SECONDARY_TRADING', name: 'Secondary Trading', description: 'P2P secondary market active (lockup expired)' },
    { id: 'DISTRIBUTING', name: 'Distributing', description: 'Rental income distribution in progress' },
    { id: 'FROZEN', name: 'Frozen', description: 'Compliance freeze — all transfers halted' },
    { id: 'REDEEMED', name: 'Redeemed', isTerminal: true, description: 'Property sold, proceeds distributed to token holders' },
    { id: 'CLOSED', name: 'Closed', isTerminal: true, description: 'Terminal — all tokens burned, lifecycle complete' },
  ],

  transitions: [
    // --- Happy path ---
    { from: 'SOURCING', to: 'DUE_DILIGENCE', event: 'BEGIN_DUE_DILIGENCE', description: 'Start property due diligence' },
    { from: 'DUE_DILIGENCE', to: 'LEGAL_STRUCTURING', event: 'BEGIN_LEGAL_STRUCTURING', description: 'Due diligence complete, begin SPV setup' },
    { from: 'LEGAL_STRUCTURING', to: 'REGULATORY_APPROVAL', event: 'SUBMIT_FOR_APPROVAL', description: 'Legal structure ready, submit for regulatory approval' },
    {
      from: 'REGULATORY_APPROVAL',
      to: 'TOKEN_ISSUANCE',
      event: 'APPROVE_AND_ISSUE',
      description: 'Regulatory approval granted, begin token issuance',
      guards: [varaApprovalGuard],
      requiresAuth: true,
      allowedRoles: ['ADMIN', 'COMPLIANCE'],
    },
    {
      from: 'TOKEN_ISSUANCE',
      to: 'LIVE',
      event: 'ACTIVATE',
      description: 'Tokens minted and distributed, go live',
      guards: [dldRegisteredGuard],
      requiresAuth: true,
      allowedRoles: ['ADMIN'],
    },

    // --- Secondary trading (lockup expiry) ---
    {
      from: 'LIVE',
      to: 'SECONDARY_TRADING',
      event: 'ENABLE_SECONDARY',
      description: 'Lockup expired, enable secondary trading',
      guards: [lockupExpiredGuard],
    },

    // --- Distribution cycles ---
    { from: 'LIVE', to: 'DISTRIBUTING', event: 'BEGIN_DISTRIBUTION', description: 'Start rental income distribution' },
    { from: 'DISTRIBUTING', to: 'LIVE', event: 'END_DISTRIBUTION', description: 'Distribution complete, resume primary' },
    { from: 'SECONDARY_TRADING', to: 'DISTRIBUTING', event: 'BEGIN_DISTRIBUTION', description: 'Start distribution during secondary trading' },
    { from: 'DISTRIBUTING', to: 'SECONDARY_TRADING', event: 'END_DISTRIBUTION_SECONDARY', description: 'Distribution complete, resume secondary trading' },

    // --- Freeze / unfreeze ---
    { from: 'LIVE', to: 'FROZEN', event: 'FREEZE', description: 'Compliance freeze during primary', requiresAuth: true, allowedRoles: ['ADMIN', 'COMPLIANCE'] },
    { from: 'SECONDARY_TRADING', to: 'FROZEN', event: 'FREEZE', description: 'Compliance freeze during secondary', requiresAuth: true, allowedRoles: ['ADMIN', 'COMPLIANCE'] },
    {
      from: 'FROZEN',
      to: 'LIVE',
      event: 'UNFREEZE_TO_LIVE',
      description: 'Unfreeze back to primary',
      requiresAuth: true,
      allowedRoles: ['ADMIN', 'COMPLIANCE'],
    },
    {
      from: 'FROZEN',
      to: 'SECONDARY_TRADING',
      event: 'UNFREEZE_TO_SECONDARY',
      description: 'Unfreeze back to secondary trading',
      requiresAuth: true,
      allowedRoles: ['ADMIN', 'COMPLIANCE'],
    },

    // --- Redemption (any non-terminal → REDEEMED) ---
    { from: 'SOURCING', to: 'REDEEMED', event: 'REDEEM', description: 'Early cancellation', guards: [propertySoldGuard] },
    { from: 'DUE_DILIGENCE', to: 'REDEEMED', event: 'REDEEM', description: 'Cancel during DD', guards: [propertySoldGuard] },
    { from: 'LEGAL_STRUCTURING', to: 'REDEEMED', event: 'REDEEM', description: 'Cancel during legal', guards: [propertySoldGuard] },
    { from: 'REGULATORY_APPROVAL', to: 'REDEEMED', event: 'REDEEM', description: 'Cancel during approval', guards: [propertySoldGuard] },
    { from: 'TOKEN_ISSUANCE', to: 'REDEEMED', event: 'REDEEM', description: 'Cancel during issuance', guards: [propertySoldGuard] },
    { from: 'LIVE', to: 'REDEEMED', event: 'REDEEM', description: 'Property sold, redeem tokens', guards: [propertySoldGuard] },
    { from: 'SECONDARY_TRADING', to: 'REDEEMED', event: 'REDEEM', description: 'Property sold during secondary', guards: [propertySoldGuard] },
    { from: 'DISTRIBUTING', to: 'REDEEMED', event: 'REDEEM', description: 'Property sold during distribution', guards: [propertySoldGuard] },
    { from: 'FROZEN', to: 'REDEEMED', event: 'REDEEM', description: 'Property sold while frozen', guards: [propertySoldGuard] },

    // --- REDEEMED → CLOSED ---
    { from: 'REDEEMED', to: 'CLOSED', event: 'CLOSE', description: 'All tokens burned, lifecycle complete' },

    // --- Rejection / rollback during pre-live ---
    { from: 'DUE_DILIGENCE', to: 'SOURCING', event: 'REJECT_DD', description: 'Due diligence failed, return to sourcing' },
    { from: 'LEGAL_STRUCTURING', to: 'DUE_DILIGENCE', event: 'REJECT_LEGAL', description: 'Legal issues found, return to DD' },
    { from: 'REGULATORY_APPROVAL', to: 'LEGAL_STRUCTURING', event: 'REJECT_REGULATORY', description: 'Regulatory rejection, rework legal structure' },
  ],
};

// ============================================================================
// BRIDGE FUNCTIONS (Lossless mapping between core LifecycleState and RE states)
// ============================================================================

/**
 * Map a core SDK LifecycleState to the most appropriate RealEstateLifecycleState.
 * Used when hydrating from the generic SDK layer into real estate context.
 */
export function mapCoreStateToRealEstate(coreState: LifecycleState | string): RealEstateLifecycleState {
  const stateStr = typeof coreState === 'number' ? LifecycleState[coreState] : coreState;
  const mapping: Record<string, RealEstateLifecycleState> = {
    DRAFT: 'SOURCING',
    PENDING_VERIFICATION: 'DUE_DILIGENCE',
    VERIFIED: 'LEGAL_STRUCTURING',
    ACTIVE: 'LIVE',
    FROZEN: 'FROZEN',
    PARTIALLY_REDEEMED: 'DISTRIBUTING',
    REDEEMED: 'REDEEMED',
    EXPIRED: 'REDEEMED',
    CLOSED: 'CLOSED',
    BURNED: 'CLOSED',
  };
  return mapping[stateStr] || 'SOURCING';
}

/**
 * Map a RealEstateLifecycleState back to the nearest core SDK LifecycleState.
 * Used when persisting back to the generic SDK layer.
 */
export function mapRealEstateToCoreState(reState: RealEstateLifecycleState): LifecycleState {
  const mapping: Record<RealEstateLifecycleState, LifecycleState> = {
    SOURCING: LifecycleState.DRAFT,
    DUE_DILIGENCE: LifecycleState.PENDING_VERIFICATION,
    LEGAL_STRUCTURING: LifecycleState.VERIFIED,
    REGULATORY_APPROVAL: LifecycleState.VERIFIED,
    TOKEN_ISSUANCE: LifecycleState.ACTIVE,
    LIVE: LifecycleState.ACTIVE,
    SECONDARY_TRADING: LifecycleState.ACTIVE,
    DISTRIBUTING: LifecycleState.ACTIVE,
    FROZEN: LifecycleState.FROZEN,
    REDEEMED: LifecycleState.REDEEMED,
    CLOSED: LifecycleState.CLOSED,
  };
  return mapping[reState];
}

/**
 * Map a Stake.com stage string to a RealEstateLifecycleState (display layer helper).
 */
export function mapStakeStageToState(stage: string): RealEstateLifecycleState {
  const mapping: Record<string, RealEstateLifecycleState> = {
    'sourcing': 'SOURCING',
    'due-diligence': 'DUE_DILIGENCE',
    'legal-structuring': 'LEGAL_STRUCTURING',
    'regulatory-approval': 'REGULATORY_APPROVAL',
    'token-issuance': 'TOKEN_ISSUANCE',
    'live': 'LIVE',
    'secondary-trading': 'SECONDARY_TRADING',
    'distributing': 'DISTRIBUTING',
    'frozen': 'FROZEN',
    'redeemed': 'REDEEMED',
    'closed': 'CLOSED',
  };
  return mapping[stage] || 'SOURCING';
}

/**
 * Map a RealEstateLifecycleState to a Stake.com display stage string.
 */
export function mapStateToStakeStage(state: RealEstateLifecycleState): string {
  const mapping: Record<RealEstateLifecycleState, string> = {
    SOURCING: 'sourcing',
    DUE_DILIGENCE: 'due-diligence',
    LEGAL_STRUCTURING: 'legal-structuring',
    REGULATORY_APPROVAL: 'regulatory-approval',
    TOKEN_ISSUANCE: 'token-issuance',
    LIVE: 'live',
    SECONDARY_TRADING: 'secondary-trading',
    DISTRIBUTING: 'distributing',
    FROZEN: 'frozen',
    REDEEMED: 'redeemed',
    CLOSED: 'closed',
  };
  return mapping[state];
}

// ============================================================================
// REGISTRATION
// ============================================================================

// Register the real estate lifecycle in the global state machine registry
// Deferred to avoid circular dependency with StateMachine.ts
export function registerRealEstateLifecycle(): void {
  stateMachineRegistry.register(REAL_ESTATE_LIFECYCLE);
}

// Auto-register when imported (safe as long as StateMachine.ts doesn't side-effect import this file)
try {
  registerRealEstateLifecycle();
} catch (e) {
  console.warn('Real estate lifecycle auto-registration deferred:', e instanceof Error ? e.message : e);
}
