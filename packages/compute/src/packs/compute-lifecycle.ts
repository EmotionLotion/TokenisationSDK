/**
 * GPU Compute Lifecycle State Machine
 *
 * Models io.net-style compute infrastructure lifecycle with 12 states.
 * Maps the full lifecycle of a GPU node from procurement through decommission.
 *
 * States: PROCUREMENT -> PROVISIONING -> BENCHMARKING -> VERIFIED -> ACTIVE -> EARNING
 *         ACTIVE -> SECONDARY_TRADING (lockup expires)
 *         ACTIVE <-> EARNING, SECONDARY_TRADING <-> EARNING
 *         ACTIVE/SECONDARY_TRADING -> MAINTENANCE -> ACTIVE/SECONDARY_TRADING
 *         Any -> DEGRADED (SLA breach), DEGRADED -> ACTIVE (restored)
 *         Any non-terminal -> DECOMMISSIONED -> CLOSED
 */

import type { StateMachineConfig, StateContext, GuardResult } from '@tokenisation/core';
import { stateMachineRegistry } from '@tokenisation/core';
import { LifecycleState } from '@tokenisation/core';

// ============================================================================
// COMPUTE LIFECYCLE STATES
// ============================================================================

/**
 * All states in the GPU compute lifecycle.
 * These model the full lifecycle of a compute node on an io.net-style platform.
 */
export const ComputeLifecycleStates = {
  /** Hardware procured but not yet racked */
  PROCUREMENT: 'PROCUREMENT',
  /** Node racked, OS installed, drivers configured */
  PROVISIONING: 'PROVISIONING',
  /** Running hardware benchmarks (MLPerf, etc.) */
  BENCHMARKING: 'BENCHMARKING',
  /** Benchmarks passed, compliance verified, ready for tokenization */
  VERIFIED: 'VERIFIED',
  /** Tokenized, live on platform, accepting jobs */
  ACTIVE: 'ACTIVE',
  /** Distributing compute revenue to token holders */
  EARNING: 'EARNING',
  /** Lockup expired, tokens tradeable on secondary market */
  SECONDARY_TRADING: 'SECONDARY_TRADING',
  /** Scheduled or unscheduled maintenance window */
  MAINTENANCE: 'MAINTENANCE',
  /** SLA breach or performance degradation detected */
  DEGRADED: 'DEGRADED',
  /** Compliance or regulatory freeze */
  FROZEN: 'FROZEN',
  /** Hardware sold or end-of-life, proceeds distributed */
  DECOMMISSIONED: 'DECOMMISSIONED',
  /** Terminal — all tokens burned, lifecycle complete */
  CLOSED: 'CLOSED',
} as const;

export type ComputeLifecycleState = typeof ComputeLifecycleStates[keyof typeof ComputeLifecycleStates];

// ============================================================================
// GUARD FUNCTIONS
// ============================================================================

/** Guard: hardware benchmark must pass minimum threshold */
const benchmarkPassedGuard = async (context: StateContext): Promise<GuardResult> => {
  const benchmarkScore = context.metadata?.benchmarkScore as number | undefined;
  const threshold = context.metadata?.benchmarkThreshold as number | undefined ?? 80;
  if (benchmarkScore === undefined) {
    return { allowed: false, reason: 'Benchmark has not been submitted' };
  }
  if (benchmarkScore < threshold) {
    return { allowed: false, reason: `Benchmark score ${benchmarkScore} below threshold ${threshold}` };
  }
  return { allowed: true };
};

/** Guard: datacenter verification must be complete */
const datacenterVerifiedGuard = async (context: StateContext): Promise<GuardResult> => {
  const verified = context.metadata?.datacenterVerified as boolean | undefined;
  if (verified !== true) {
    return { allowed: false, reason: 'Datacenter verification not complete' };
  }
  return { allowed: true };
};

/** Guard: lockup period must have expired before secondary trading */
const lockupExpiredGuard = async (context: StateContext): Promise<GuardResult> => {
  const lockupEnd = context.metadata?.lockupEndDate as string | undefined;
  if (!lockupEnd) {
    return { allowed: true };
  }
  const now = new Date();
  const end = new Date(lockupEnd);
  if (now < end) {
    return { allowed: false, reason: `Lockup period active until ${lockupEnd}` };
  }
  return { allowed: true };
};

/** Guard: node must be confirmed online and operational */
const nodeOnlineGuard = async (context: StateContext): Promise<GuardResult> => {
  const online = context.metadata?.nodeOnline as boolean | undefined;
  if (online !== true) {
    return { allowed: false, reason: 'Node is not confirmed online' };
  }
  return { allowed: true };
};

/** Guard: node must be decommissioned (hardware sold / end-of-life) */
const nodeDecommissionedGuard = async (context: StateContext): Promise<GuardResult> => {
  const decommissioned = context.metadata?.nodeDecommissioned as boolean | undefined;
  if (decommissioned !== true) {
    return { allowed: false, reason: 'Node has not been confirmed decommissioned' };
  }
  return { allowed: true };
};

/** Guard: SLA breach must be detected */
const slaBreachGuard = async (context: StateContext): Promise<GuardResult> => {
  const uptimePercent = context.metadata?.currentUptimePercent as number | undefined;
  const slaThreshold = context.metadata?.slaUptimePercent as number | undefined ?? 95;
  if (uptimePercent !== undefined && uptimePercent < slaThreshold) {
    return { allowed: true };
  }
  return { allowed: false, reason: `Uptime ${uptimePercent ?? 'unknown'}% meets SLA threshold ${slaThreshold}%` };
};

// ============================================================================
// STATE MACHINE CONFIGURATION
// ============================================================================

/**
 * Full lifecycle config for GPU compute infrastructure tokenization.
 * 12 states with granular transitions modeling io.net-style platforms.
 */
export const COMPUTE_LIFECYCLE: StateMachineConfig = {
  id: 'gpu-compute',
  name: 'GPU Compute Infrastructure Lifecycle',
  description: 'Full 12-state lifecycle for io.net-style GPU compute tokenization',

  states: [
    { id: 'PROCUREMENT', name: 'Procurement', isInitial: true, description: 'Hardware procured, awaiting delivery and racking' },
    { id: 'PROVISIONING', name: 'Provisioning', description: 'Node racked, OS and drivers being configured' },
    { id: 'BENCHMARKING', name: 'Benchmarking', description: 'Running hardware benchmarks for verification' },
    { id: 'VERIFIED', name: 'Verified', description: 'Benchmarks passed, compliance verified, ready for tokenization' },
    { id: 'ACTIVE', name: 'Active', description: 'Tokenized and live, accepting compute jobs' },
    { id: 'EARNING', name: 'Earning', description: 'Revenue distribution cycle in progress' },
    { id: 'SECONDARY_TRADING', name: 'Secondary Trading', description: 'Lockup expired, tokens tradeable on secondary market' },
    { id: 'MAINTENANCE', name: 'Maintenance', description: 'Scheduled or unscheduled maintenance window' },
    { id: 'DEGRADED', name: 'Degraded', description: 'SLA breach or performance degradation detected' },
    { id: 'FROZEN', name: 'Frozen', description: 'Compliance or regulatory freeze — all transfers halted' },
    { id: 'DECOMMISSIONED', name: 'Decommissioned', isTerminal: true, description: 'Hardware sold or end-of-life, proceeds distributed' },
    { id: 'CLOSED', name: 'Closed', isTerminal: true, description: 'Terminal — all tokens burned, lifecycle complete' },
  ],

  transitions: [
    // --- Happy path ---
    { from: 'PROCUREMENT', to: 'PROVISIONING', event: 'BEGIN_PROVISIONING', description: 'Hardware delivered, begin rack and stack' },
    { from: 'PROVISIONING', to: 'BENCHMARKING', event: 'BEGIN_BENCHMARKING', description: 'Node configured, start hardware benchmarks' },
    {
      from: 'BENCHMARKING',
      to: 'VERIFIED',
      event: 'VERIFY',
      description: 'Benchmarks passed, datacenter verified',
      guards: [benchmarkPassedGuard, datacenterVerifiedGuard],
      requiresAuth: true,
      allowedRoles: ['HARDWARE_AUDITOR', 'COMPLIANCE'],
    },
    {
      from: 'VERIFIED',
      to: 'ACTIVE',
      event: 'ACTIVATE',
      description: 'Token minted, node goes live',
      guards: [nodeOnlineGuard],
      requiresAuth: true,
      allowedRoles: ['ADMIN'],
    },

    // --- Secondary trading (lockup expiry) ---
    {
      from: 'ACTIVE',
      to: 'SECONDARY_TRADING',
      event: 'ENABLE_SECONDARY',
      description: 'Lockup expired, enable secondary trading',
      guards: [lockupExpiredGuard],
    },

    // --- Revenue distribution cycles ---
    { from: 'ACTIVE', to: 'EARNING', event: 'BEGIN_DISTRIBUTION', description: 'Start compute revenue distribution' },
    { from: 'EARNING', to: 'ACTIVE', event: 'END_DISTRIBUTION', description: 'Distribution complete, resume active' },
    { from: 'SECONDARY_TRADING', to: 'EARNING', event: 'BEGIN_DISTRIBUTION', description: 'Start distribution during secondary trading' },
    { from: 'EARNING', to: 'SECONDARY_TRADING', event: 'END_DISTRIBUTION_SECONDARY', description: 'Distribution complete, resume secondary trading' },

    // --- Maintenance windows ---
    { from: 'ACTIVE', to: 'MAINTENANCE', event: 'BEGIN_MAINTENANCE', description: 'Scheduled maintenance', requiresAuth: true, allowedRoles: ['ADMIN', 'PLATFORM_OPERATOR'] },
    { from: 'SECONDARY_TRADING', to: 'MAINTENANCE', event: 'BEGIN_MAINTENANCE', description: 'Maintenance during secondary trading', requiresAuth: true, allowedRoles: ['ADMIN', 'PLATFORM_OPERATOR'] },
    {
      from: 'MAINTENANCE',
      to: 'ACTIVE',
      event: 'END_MAINTENANCE',
      description: 'Maintenance complete, resume active',
      guards: [nodeOnlineGuard],
    },
    {
      from: 'MAINTENANCE',
      to: 'SECONDARY_TRADING',
      event: 'END_MAINTENANCE_SECONDARY',
      description: 'Maintenance complete, resume secondary trading',
      guards: [nodeOnlineGuard],
    },

    // --- Degradation (SLA breach) ---
    { from: 'ACTIVE', to: 'DEGRADED', event: 'SLA_BREACH', description: 'Performance dropped below SLA threshold' },
    { from: 'SECONDARY_TRADING', to: 'DEGRADED', event: 'SLA_BREACH', description: 'SLA breach during secondary trading' },
    {
      from: 'DEGRADED',
      to: 'ACTIVE',
      event: 'RESTORE',
      description: 'Performance restored above SLA threshold',
      guards: [nodeOnlineGuard],
    },
    { from: 'DEGRADED', to: 'MAINTENANCE', event: 'BEGIN_MAINTENANCE', description: 'Degraded node enters maintenance' },

    // --- Freeze / unfreeze ---
    { from: 'ACTIVE', to: 'FROZEN', event: 'FREEZE', description: 'Compliance freeze', requiresAuth: true, allowedRoles: ['ADMIN', 'COMPLIANCE'] },
    { from: 'SECONDARY_TRADING', to: 'FROZEN', event: 'FREEZE', description: 'Compliance freeze during secondary', requiresAuth: true, allowedRoles: ['ADMIN', 'COMPLIANCE'] },
    { from: 'FROZEN', to: 'ACTIVE', event: 'UNFREEZE_TO_ACTIVE', description: 'Unfreeze back to active', requiresAuth: true, allowedRoles: ['ADMIN', 'COMPLIANCE'] },
    { from: 'FROZEN', to: 'SECONDARY_TRADING', event: 'UNFREEZE_TO_SECONDARY', description: 'Unfreeze back to secondary trading', requiresAuth: true, allowedRoles: ['ADMIN', 'COMPLIANCE'] },

    // --- Decommission (any non-terminal -> DECOMMISSIONED) ---
    { from: 'PROCUREMENT', to: 'DECOMMISSIONED', event: 'DECOMMISSION', description: 'Cancel during procurement', guards: [nodeDecommissionedGuard] },
    { from: 'PROVISIONING', to: 'DECOMMISSIONED', event: 'DECOMMISSION', description: 'Cancel during provisioning', guards: [nodeDecommissionedGuard] },
    { from: 'BENCHMARKING', to: 'DECOMMISSIONED', event: 'DECOMMISSION', description: 'Cancel during benchmarking', guards: [nodeDecommissionedGuard] },
    { from: 'VERIFIED', to: 'DECOMMISSIONED', event: 'DECOMMISSION', description: 'Cancel after verification', guards: [nodeDecommissionedGuard] },
    { from: 'ACTIVE', to: 'DECOMMISSIONED', event: 'DECOMMISSION', description: 'Decommission active node', guards: [nodeDecommissionedGuard] },
    { from: 'SECONDARY_TRADING', to: 'DECOMMISSIONED', event: 'DECOMMISSION', description: 'Decommission during secondary', guards: [nodeDecommissionedGuard] },
    { from: 'EARNING', to: 'DECOMMISSIONED', event: 'DECOMMISSION', description: 'Decommission during distribution', guards: [nodeDecommissionedGuard] },
    { from: 'MAINTENANCE', to: 'DECOMMISSIONED', event: 'DECOMMISSION', description: 'Decommission during maintenance', guards: [nodeDecommissionedGuard] },
    { from: 'DEGRADED', to: 'DECOMMISSIONED', event: 'DECOMMISSION', description: 'Decommission degraded node', guards: [nodeDecommissionedGuard] },
    { from: 'FROZEN', to: 'DECOMMISSIONED', event: 'DECOMMISSION', description: 'Decommission frozen node', guards: [nodeDecommissionedGuard] },

    // --- DECOMMISSIONED -> CLOSED ---
    { from: 'DECOMMISSIONED', to: 'CLOSED', event: 'CLOSE', description: 'All tokens burned, lifecycle complete' },

    // --- Rollbacks during pre-live ---
    { from: 'PROVISIONING', to: 'PROCUREMENT', event: 'REJECT_PROVISIONING', description: 'Provisioning failed, return to procurement' },
    { from: 'BENCHMARKING', to: 'PROVISIONING', event: 'REJECT_BENCHMARK', description: 'Benchmark failed, re-provision' },
  ],
};

// ============================================================================
// BRIDGE FUNCTIONS
// ============================================================================

/**
 * Map a core SDK LifecycleState to the most appropriate ComputeLifecycleState.
 */
export function mapCoreStateToCompute(coreState: LifecycleState | string): ComputeLifecycleState {
  const stateStr = typeof coreState === 'number' ? LifecycleState[coreState] : coreState;
  const mapping: Record<string, ComputeLifecycleState> = {
    DRAFT: 'PROCUREMENT',
    PENDING_VERIFICATION: 'BENCHMARKING',
    VERIFIED: 'VERIFIED',
    ACTIVE: 'ACTIVE',
    FROZEN: 'FROZEN',
    PARTIALLY_REDEEMED: 'EARNING',
    REDEEMED: 'DECOMMISSIONED',
    EXPIRED: 'DECOMMISSIONED',
    CLOSED: 'CLOSED',
    BURNED: 'CLOSED',
  };
  return mapping[stateStr] || 'PROCUREMENT';
}

/**
 * Map a ComputeLifecycleState back to the nearest core SDK LifecycleState.
 */
export function mapComputeToCoreState(computeState: ComputeLifecycleState): LifecycleState {
  const mapping: Record<ComputeLifecycleState, LifecycleState> = {
    PROCUREMENT: LifecycleState.DRAFT,
    PROVISIONING: LifecycleState.DRAFT,
    BENCHMARKING: LifecycleState.PENDING_VERIFICATION,
    VERIFIED: LifecycleState.VERIFIED,
    ACTIVE: LifecycleState.ACTIVE,
    EARNING: LifecycleState.ACTIVE,
    SECONDARY_TRADING: LifecycleState.ACTIVE,
    MAINTENANCE: LifecycleState.ACTIVE,
    DEGRADED: LifecycleState.ACTIVE,
    FROZEN: LifecycleState.FROZEN,
    DECOMMISSIONED: LifecycleState.REDEEMED,
    CLOSED: LifecycleState.CLOSED,
  };
  return mapping[computeState];
}

// ============================================================================
// REGISTRATION
// ============================================================================

export function registerComputeLifecycle(): void {
  stateMachineRegistry.register(COMPUTE_LIFECYCLE);
}

try {
  registerComputeLifecycle();
} catch (e) {
  console.warn('Compute lifecycle auto-registration deferred:', e instanceof Error ? e.message : e);
}
