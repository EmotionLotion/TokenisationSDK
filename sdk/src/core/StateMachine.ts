/**
 * Custom State Machine
 *
 * Provides a configurable state machine that can be customized per asset type.
 * Supports custom states, transitions, guards, and hooks.
 */

import { v4 as uuidv4 } from 'uuid';
import { LifecycleState, BaseEvent, EventType } from './types.js';
import { ValidationError, SDKError, ErrorCode } from '../errors/index.js';

// ============================================================================
// STATE MACHINE TYPES
// ============================================================================

/**
 * State definition
 */
export interface StateDefinition {
  /** Unique state identifier */
  id: string;

  /** Human-readable name */
  name: string;

  /** Description */
  description?: string;

  /** Whether this is an initial state */
  isInitial?: boolean;

  /** Whether this is a terminal/final state */
  isTerminal?: boolean;

  /** Entry action - called when entering this state */
  onEnter?: (context: StateContext) => Promise<void>;

  /** Exit action - called when leaving this state */
  onExit?: (context: StateContext) => Promise<void>;

  /** Metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Transition definition
 */
export interface TransitionDefinition {
  /** Source state */
  from: string;

  /** Target state */
  to: string;

  /** Transition name/event */
  event: string;

  /** Description */
  description?: string;

  /** Guard conditions that must pass */
  guards?: StateMachineGuard[];

  /** Actions to execute during transition */
  actions?: TransitionAction[];

  /** Whether this transition requires authorization */
  requiresAuth?: boolean;

  /** Allowed roles for this transition */
  allowedRoles?: string[];
}

/**
 * Guard function signature
 */
export type StateMachineGuard = (context: StateContext) => Promise<GuardResult>;

/**
 * Guard result
 */
export interface GuardResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Action function signature
 */
export type TransitionAction = (context: StateContext) => Promise<void>;

/**
 * Context passed to guards and actions
 */
export interface StateContext {
  /** Asset ID */
  assetId: string;

  /** Current state */
  currentState: string;

  /** Target state */
  targetState: string;

  /** Transition event */
  event: string;

  /** Actor performing the transition */
  actorId: string;

  /** Actor roles */
  actorRoles?: string[];

  /** Additional metadata */
  metadata?: Record<string, unknown>;

  /** Timestamp */
  timestamp: string;
}

/**
 * State machine configuration
 */
export interface StateMachineConfig {
  /** Unique identifier */
  id: string;

  /** Name */
  name: string;

  /** Description */
  description?: string;

  /** State definitions */
  states: StateDefinition[];

  /** Transition definitions */
  transitions: TransitionDefinition[];

  /** Global guards (applied to all transitions) */
  globalGuards?: StateMachineGuard[];

  /** Global actions (applied to all transitions) */
  globalActions?: TransitionAction[];
}

/**
 * Transition result
 */
export interface TransitionResult {
  success: boolean;
  previousState: string;
  newState: string;
  event?: BaseEvent;
  error?: string;
  guardFailures?: string[];
}

// ============================================================================
// DEFAULT STATE MACHINES
// ============================================================================

/**
 * Standard asset lifecycle (default)
 */
export const STANDARD_LIFECYCLE: StateMachineConfig = {
  id: 'standard',
  name: 'Standard Asset Lifecycle',
  description: 'Default lifecycle for tokenized assets',
  states: [
    { id: 'DRAFT', name: 'Draft', isInitial: true, description: 'Asset created but not submitted' },
    { id: 'PENDING_VERIFICATION', name: 'Pending Verification', description: 'Awaiting verification' },
    { id: 'VERIFIED', name: 'Verified', description: 'Asset verified and ready' },
    { id: 'ACTIVE', name: 'Active', description: 'Token minted and tradeable' },
    { id: 'FROZEN', name: 'Frozen', description: 'Temporarily suspended' },
    { id: 'REDEEMED', name: 'Redeemed', description: 'Asset redeemed/claimed' },
    { id: 'EXPIRED', name: 'Expired', description: 'Validity period ended' },
    { id: 'BURNED', name: 'Burned', isTerminal: true, description: 'Token burned and retired' },
  ],
  transitions: [
    { from: 'DRAFT', to: 'PENDING_VERIFICATION', event: 'SUBMIT' },
    { from: 'PENDING_VERIFICATION', to: 'VERIFIED', event: 'VERIFY' },
    { from: 'PENDING_VERIFICATION', to: 'DRAFT', event: 'REJECT' },
    { from: 'VERIFIED', to: 'ACTIVE', event: 'ACTIVATE' },
    { from: 'VERIFIED', to: 'DRAFT', event: 'REVOKE' },
    { from: 'ACTIVE', to: 'FROZEN', event: 'FREEZE' },
    { from: 'ACTIVE', to: 'REDEEMED', event: 'REDEEM' },
    { from: 'ACTIVE', to: 'EXPIRED', event: 'EXPIRE' },
    { from: 'ACTIVE', to: 'BURNED', event: 'BURN' },
    { from: 'FROZEN', to: 'ACTIVE', event: 'UNFREEZE' },
    { from: 'FROZEN', to: 'BURNED', event: 'BURN' },
    { from: 'REDEEMED', to: 'BURNED', event: 'BURN' },
    { from: 'EXPIRED', to: 'BURNED', event: 'BURN' },
  ],
};

/**
 * Simple lifecycle (no verification)
 */
export const SIMPLE_LIFECYCLE: StateMachineConfig = {
  id: 'simple',
  name: 'Simple Lifecycle',
  description: 'Simplified lifecycle without verification steps',
  states: [
    { id: 'DRAFT', name: 'Draft', isInitial: true },
    { id: 'ACTIVE', name: 'Active' },
    { id: 'PAUSED', name: 'Paused' },
    { id: 'RETIRED', name: 'Retired', isTerminal: true },
  ],
  transitions: [
    { from: 'DRAFT', to: 'ACTIVE', event: 'ACTIVATE' },
    { from: 'ACTIVE', to: 'PAUSED', event: 'PAUSE' },
    { from: 'ACTIVE', to: 'RETIRED', event: 'RETIRE' },
    { from: 'PAUSED', to: 'ACTIVE', event: 'RESUME' },
    { from: 'PAUSED', to: 'RETIRED', event: 'RETIRE' },
  ],
};

/**
 * Governance lifecycle (with proposal states)
 */
export const GOVERNANCE_LIFECYCLE: StateMachineConfig = {
  id: 'governance',
  name: 'Governance Lifecycle',
  description: 'Lifecycle for governance proposals',
  states: [
    { id: 'DRAFT', name: 'Draft', isInitial: true },
    { id: 'PENDING', name: 'Pending' },
    { id: 'ACTIVE_VOTING', name: 'Active Voting' },
    { id: 'PASSED', name: 'Passed' },
    { id: 'REJECTED', name: 'Rejected', isTerminal: true },
    { id: 'QUEUED', name: 'Queued for Execution' },
    { id: 'EXECUTED', name: 'Executed', isTerminal: true },
    { id: 'CANCELLED', name: 'Cancelled', isTerminal: true },
    { id: 'EXPIRED', name: 'Expired', isTerminal: true },
  ],
  transitions: [
    { from: 'DRAFT', to: 'PENDING', event: 'SUBMIT' },
    { from: 'PENDING', to: 'ACTIVE_VOTING', event: 'START_VOTING' },
    { from: 'PENDING', to: 'CANCELLED', event: 'CANCEL' },
    { from: 'ACTIVE_VOTING', to: 'PASSED', event: 'PASS' },
    { from: 'ACTIVE_VOTING', to: 'REJECTED', event: 'REJECT' },
    { from: 'ACTIVE_VOTING', to: 'EXPIRED', event: 'EXPIRE' },
    { from: 'PASSED', to: 'QUEUED', event: 'QUEUE' },
    { from: 'PASSED', to: 'CANCELLED', event: 'CANCEL' },
    { from: 'QUEUED', to: 'EXECUTED', event: 'EXECUTE' },
    { from: 'QUEUED', to: 'EXPIRED', event: 'EXPIRE' },
    { from: 'QUEUED', to: 'CANCELLED', event: 'CANCEL' },
  ],
};

/**
 * Financial instrument lifecycle
 */
export const FINANCIAL_LIFECYCLE: StateMachineConfig = {
  id: 'financial',
  name: 'Financial Instrument Lifecycle',
  description: 'Lifecycle for bonds, loans, and financial instruments',
  states: [
    { id: 'DRAFT', name: 'Draft', isInitial: true },
    { id: 'PENDING_APPROVAL', name: 'Pending Approval' },
    { id: 'APPROVED', name: 'Approved' },
    { id: 'ISSUED', name: 'Issued' },
    { id: 'TRADING', name: 'Trading' },
    { id: 'MATURED', name: 'Matured' },
    { id: 'DEFAULTED', name: 'Defaulted' },
    { id: 'CALLED', name: 'Called Early' },
    { id: 'SETTLED', name: 'Settled', isTerminal: true },
    { id: 'CANCELLED', name: 'Cancelled', isTerminal: true },
  ],
  transitions: [
    { from: 'DRAFT', to: 'PENDING_APPROVAL', event: 'SUBMIT' },
    { from: 'PENDING_APPROVAL', to: 'APPROVED', event: 'APPROVE' },
    { from: 'PENDING_APPROVAL', to: 'DRAFT', event: 'REJECT' },
    { from: 'APPROVED', to: 'ISSUED', event: 'ISSUE' },
    { from: 'APPROVED', to: 'CANCELLED', event: 'CANCEL' },
    { from: 'ISSUED', to: 'TRADING', event: 'ACTIVATE_TRADING' },
    { from: 'TRADING', to: 'MATURED', event: 'MATURE' },
    { from: 'TRADING', to: 'DEFAULTED', event: 'DEFAULT' },
    { from: 'TRADING', to: 'CALLED', event: 'CALL' },
    { from: 'MATURED', to: 'SETTLED', event: 'SETTLE' },
    { from: 'CALLED', to: 'SETTLED', event: 'SETTLE' },
    { from: 'DEFAULTED', to: 'SETTLED', event: 'SETTLE' },
  ],
};

// ============================================================================
// STATE MACHINE CLASS
// ============================================================================

/**
 * Configurable state machine implementation
 */
export class StateMachine {
  private config: StateMachineConfig;
  private stateMap: Map<string, StateDefinition>;
  private transitionMap: Map<string, TransitionDefinition[]>;
  private assetStates: Map<string, string> = new Map();
  private eventStore?: { append: (event: BaseEvent) => Promise<void> };

  constructor(config: StateMachineConfig, eventStore?: { append: (event: BaseEvent) => Promise<void> }) {
    this.config = config;
    this.eventStore = eventStore;

    // Build state lookup
    this.stateMap = new Map();
    for (const state of config.states) {
      this.stateMap.set(state.id, state);
    }

    // Build transition lookup (by source state)
    this.transitionMap = new Map();
    for (const transition of config.transitions) {
      const existing = this.transitionMap.get(transition.from) || [];
      existing.push(transition);
      this.transitionMap.set(transition.from, existing);
    }
  }

  /**
   * Get state machine configuration
   */
  getConfig(): StateMachineConfig {
    return this.config;
  }

  /**
   * Get initial state
   */
  getInitialState(): string {
    const initial = this.config.states.find(s => s.isInitial);
    return initial?.id || this.config.states[0]?.id || 'DRAFT';
  }

  /**
   * Get current state for an asset
   */
  getState(assetId: string): string | undefined {
    return this.assetStates.get(assetId);
  }

  /**
   * Set state for an asset (used for initialization/hydration)
   */
  setState(assetId: string, state: string): void {
    if (!this.stateMap.has(state)) {
      throw new ValidationError(`Unknown state: ${state}`, {
        field: 'state',
        constraints: { validStates: Array.from(this.stateMap.keys()).join(', ') },
      });
    }
    this.assetStates.set(assetId, state);
  }

  /**
   * Get available transitions from current state
   */
  getAvailableTransitions(currentState: string): TransitionDefinition[] {
    return this.transitionMap.get(currentState) || [];
  }

  /**
   * Get available target states from current state
   */
  getAvailableTargetStates(currentState: string): string[] {
    const transitions = this.getAvailableTransitions(currentState);
    return [...new Set(transitions.map(t => t.to))];
  }

  /**
   * Check if a transition is valid
   */
  canTransition(from: string, to: string): boolean {
    const transitions = this.getAvailableTransitions(from);
    return transitions.some(t => t.to === to);
  }

  /**
   * Find transition by from/to states
   */
  findTransition(from: string, to: string): TransitionDefinition | undefined {
    const transitions = this.getAvailableTransitions(from);
    return transitions.find(t => t.to === to);
  }

  /**
   * Execute a state transition
   */
  async transition(context: StateContext): Promise<TransitionResult> {
    const { assetId, currentState, targetState, event, actorId, actorRoles, metadata, timestamp } = context;

    // Validate states exist
    if (!this.stateMap.has(currentState)) {
      return {
        success: false,
        previousState: currentState,
        newState: currentState,
        error: `Unknown source state: ${currentState}`,
      };
    }

    if (!this.stateMap.has(targetState)) {
      return {
        success: false,
        previousState: currentState,
        newState: currentState,
        error: `Unknown target state: ${targetState}`,
      };
    }

    // Find valid transition
    const transition = this.findTransition(currentState, targetState);
    if (!transition) {
      return {
        success: false,
        previousState: currentState,
        newState: currentState,
        error: `No valid transition from ${currentState} to ${targetState}`,
      };
    }

    // Check role authorization
    if (transition.requiresAuth && transition.allowedRoles) {
      const hasRole = actorRoles?.some(role => transition.allowedRoles!.includes(role));
      if (!hasRole) {
        return {
          success: false,
          previousState: currentState,
          newState: currentState,
          error: `Actor lacks required role for this transition`,
        };
      }
    }

    // Execute global guards
    const guardFailures: string[] = [];
    if (this.config.globalGuards) {
      for (const guard of this.config.globalGuards) {
        const result = await guard(context);
        if (!result.allowed) {
          guardFailures.push(result.reason || 'Global guard failed');
        }
      }
    }

    // Execute transition-specific guards
    if (transition.guards) {
      for (const guard of transition.guards) {
        const result = await guard(context);
        if (!result.allowed) {
          guardFailures.push(result.reason || 'Guard failed');
        }
      }
    }

    if (guardFailures.length > 0) {
      return {
        success: false,
        previousState: currentState,
        newState: currentState,
        error: `Guard conditions not met`,
        guardFailures,
      };
    }

    // Execute exit action on current state
    const currentStateDef = this.stateMap.get(currentState);
    if (currentStateDef?.onExit) {
      await currentStateDef.onExit(context);
    }

    // Execute global actions
    if (this.config.globalActions) {
      for (const action of this.config.globalActions) {
        await action(context);
      }
    }

    // Execute transition actions
    if (transition.actions) {
      for (const action of transition.actions) {
        await action(context);
      }
    }

    // Update state
    this.assetStates.set(assetId, targetState);

    // Execute entry action on new state
    const targetStateDef = this.stateMap.get(targetState);
    if (targetStateDef?.onEnter) {
      await targetStateDef.onEnter(context);
    }

    // Create event
    const stateEvent: BaseEvent = {
      id: uuidv4(),
      type: EventType.STATE_CHANGED,
      assetId,
      timestamp,
      actorId,
      payload: {
        previousState: currentState,
        newState: targetState,
        event,
        metadata,
      },
      eventVersion: 1,
    };

    // Persist event
    if (this.eventStore) {
      await this.eventStore.append(stateEvent);
    }

    return {
      success: true,
      previousState: currentState,
      newState: targetState,
      event: stateEvent,
    };
  }

  /**
   * Add a guard to a transition
   */
  addGuard(from: string, to: string, guard: StateMachineGuard): void {
    const transition = this.findTransition(from, to);
    if (!transition) {
      throw new SDKError(
        `No transition from ${from} to ${to}`,
        ErrorCode.NOT_FOUND,
        { details: { from, to } }
      );
    }
    if (!transition.guards) {
      transition.guards = [];
    }
    transition.guards.push(guard);
  }

  /**
   * Add an action to a transition
   */
  addAction(from: string, to: string, action: TransitionAction): void {
    const transition = this.findTransition(from, to);
    if (!transition) {
      throw new SDKError(
        `No transition from ${from} to ${to}`,
        ErrorCode.NOT_FOUND,
        { details: { from, to } }
      );
    }
    if (!transition.actions) {
      transition.actions = [];
    }
    transition.actions.push(action);
  }

  /**
   * Add a global guard
   */
  addGlobalGuard(guard: StateMachineGuard): void {
    if (!this.config.globalGuards) {
      this.config.globalGuards = [];
    }
    this.config.globalGuards.push(guard);
  }

  /**
   * Add a global action
   */
  addGlobalAction(action: TransitionAction): void {
    if (!this.config.globalActions) {
      this.config.globalActions = [];
    }
    this.config.globalActions.push(action);
  }

  /**
   * Get all states
   */
  getAllStates(): StateDefinition[] {
    return this.config.states;
  }

  /**
   * Get terminal states
   */
  getTerminalStates(): StateDefinition[] {
    return this.config.states.filter(s => s.isTerminal);
  }

  /**
   * Check if state is terminal
   */
  isTerminal(stateId: string): boolean {
    const state = this.stateMap.get(stateId);
    return state?.isTerminal ?? false;
  }
}

// ============================================================================
// STATE MACHINE REGISTRY
// ============================================================================

/**
 * Registry for managing state machine configurations
 */
export class StateMachineRegistry {
  private static instance: StateMachineRegistry;
  private configs: Map<string, StateMachineConfig> = new Map();

  private constructor() {
    // Register built-in lifecycles
    this.configs.set(STANDARD_LIFECYCLE.id, STANDARD_LIFECYCLE);
    this.configs.set(SIMPLE_LIFECYCLE.id, SIMPLE_LIFECYCLE);
    this.configs.set(GOVERNANCE_LIFECYCLE.id, GOVERNANCE_LIFECYCLE);
    this.configs.set(FINANCIAL_LIFECYCLE.id, FINANCIAL_LIFECYCLE);
  }

  static getInstance(): StateMachineRegistry {
    if (!StateMachineRegistry.instance) {
      StateMachineRegistry.instance = new StateMachineRegistry();
    }
    return StateMachineRegistry.instance;
  }

  /**
   * Register a new state machine configuration
   */
  register(config: StateMachineConfig): void {
    this.configs.set(config.id, config);
  }

  /**
   * Get a configuration by ID
   */
  get(id: string): StateMachineConfig | undefined {
    return this.configs.get(id);
  }

  /**
   * Get all configurations
   */
  getAll(): StateMachineConfig[] {
    return Array.from(this.configs.values());
  }

  /**
   * Create a state machine instance from a configuration
   */
  create(configId: string, eventStore?: { append: (event: BaseEvent) => Promise<void> }): StateMachine {
    const config = this.configs.get(configId);
    if (!config) {
      throw new SDKError(
        `Unknown state machine configuration: ${configId}`,
        ErrorCode.NOT_FOUND,
        { details: { configId, availableConfigs: Array.from(this.configs.keys()) } }
      );
    }
    return new StateMachine(config, eventStore);
  }

  /**
   * Create a custom state machine
   */
  createCustom(config: StateMachineConfig, eventStore?: { append: (event: BaseEvent) => Promise<void> }): StateMachine {
    return new StateMachine(config, eventStore);
  }
}

// Export singleton accessor
export const stateMachineRegistry = StateMachineRegistry.getInstance();
