/**
 * LifecycleEngine - The canonical state machine
 *
 * This engine owns the truth about asset states. Transitions are enforced here,
 * not on-chain. The blockchain is only used for settlement/finality.
 *
 * Flow: DRAFT -> VERIFIED -> ACTIVE -> [REDEEMED|EXPIRED|BURNED]
 */

import {
  LifecycleState,
  VALID_TRANSITIONS,
  EventType,
  type RightModel,
  type BaseEvent,
} from './types.js';
import type {
  ILifecycleEngine,
  IEventStore,
  StateTransitionRequest,
  StateTransitionResult,
  TransitionGuard,
} from './interfaces.js';
import { EventStore } from './EventStore.js';
import { PolicyEvaluator } from './PolicyEvaluator.js';

/**
 * Asset state record stored by the engine
 */
interface AssetStateRecord {
  assetId: string;
  currentState: LifecycleState;
  asset: RightModel;
  lastUpdated: string;
}

/**
 * LifecycleEngine implementation
 *
 * The core state machine that manages asset lifecycle transitions.
 * All state changes must go through this engine.
 */
export class LifecycleEngine implements ILifecycleEngine {
  private eventStore: IEventStore;
  private policyEvaluator: PolicyEvaluator;
  private assetStates: Map<string, AssetStateRecord> = new Map();
  private guards: Map<string, TransitionGuard[]> = new Map();

  constructor(
    eventStore?: IEventStore,
    policyEvaluator?: PolicyEvaluator
  ) {
    this.eventStore = eventStore || new EventStore();
    this.policyEvaluator = policyEvaluator || new PolicyEvaluator();
  }

  /**
   * Rebuild state from persistent storage
   */
  async hydrate(): Promise<void> {
    const allEvents = await this.eventStore.getAll();
    const assetIds = new Set(allEvents.map((e) => e.assetId));

    for (const id of assetIds) {
      const asset = await this.rebuildFromEvents(id);
      if (asset) {
        this.assetStates.set(id, {
          assetId: id,
          currentState: asset.state,
          asset,
          lastUpdated: asset.updatedAt || new Date().toISOString(),
        });
      }
    }
    console.log(`[LifecycleEngine] Hydrated ${this.assetStates.size} assets from storage.`);
  }

  /**
   * Get the event store
   */
  getEventStore(): IEventStore {
    return this.eventStore;
  }

  /**
   * Get the policy evaluator
   */
  getPolicyEvaluator(): PolicyEvaluator {
    return this.policyEvaluator;
  }

  /**
   * Register an asset with the engine
   */
  async registerAsset(asset: RightModel): Promise<void> {
    const record: AssetStateRecord = {
      assetId: asset.id,
      currentState: asset.state,
      asset,
      lastUpdated: new Date().toISOString(),
    };

    this.assetStates.set(asset.id, record);

    // Record the creation event
    const event = EventStore.createStateChangeEvent({
      assetId: asset.id,
      actorId: 'system',
      type: EventType.ASSET_CREATED,
      payload: {
        asset,
        initialState: asset.state,
      },
    });

    await this.eventStore.append(event);
  }

  /**
   * Get the current state of an asset
   */
  async getState(assetId: string): Promise<LifecycleState | null> {
    const record = this.assetStates.get(assetId);
    return record?.currentState || null;
  }

  /**
   * Get the full asset record
   */
  async getAsset(assetId: string): Promise<RightModel | null> {
    const record = this.assetStates.get(assetId);
    return record?.asset || null;
  }

  /**
   * Check if a transition is valid according to the state machine
   */
  canTransition(fromState: LifecycleState, toState: LifecycleState): boolean {
    const validNext = VALID_TRANSITIONS[fromState];
    return validNext?.includes(toState) || false;
  }

  /**
   * Get valid next states from the current state
   */
  getValidNextStates(currentState: LifecycleState): LifecycleState[] {
    return VALID_TRANSITIONS[currentState] || [];
  }

  /**
   * Register a transition guard
   *
   * Guards are evaluated before any transition and can block it.
   */
  registerGuard(
    fromState: LifecycleState,
    toState: LifecycleState,
    guard: TransitionGuard
  ): void {
    const key = `${fromState}->${toState}`;
    const existingGuards = this.guards.get(key) || [];
    existingGuards.push(guard);
    this.guards.set(key, existingGuards);
  }

  /**
   * Request a state transition
   *
   * This is the main entry point for changing asset state.
   */
  async transition(
    request: StateTransitionRequest
  ): Promise<StateTransitionResult> {
    const record = this.assetStates.get(request.assetId);

    // Check if asset exists
    if (!record) {
      return {
        success: false,
        previousState: request.fromState,
        newState: request.fromState,
        error: `Asset ${request.assetId} not found`,
      };
    }

    // Verify current state matches
    if (record.currentState !== request.fromState) {
      return {
        success: false,
        previousState: record.currentState,
        newState: record.currentState,
        error: `State mismatch: expected ${request.fromState}, actual ${record.currentState}`,
      };
    }

    // Check if transition is valid
    if (!this.canTransition(request.fromState, request.toState)) {
      return {
        success: false,
        previousState: request.fromState,
        newState: request.fromState,
        error: `Invalid transition from ${request.fromState} to ${request.toState}`,
      };
    }

    // Run transition guards
    const guardKey = `${request.fromState}->${request.toState}`;
    const guards = this.guards.get(guardKey) || [];

    for (const guard of guards) {
      const guardResult = await guard(record.asset, request);
      if (!guardResult.success) {
        return {
          success: false,
          previousState: request.fromState,
          newState: request.fromState,
          error: guardResult.error,
        };
      }
    }

    // Evaluate policies
    const policyResult = await this.policyEvaluator.evaluateStateRules(
      record.asset,
      request.toState
    );

    if (!policyResult.success) {
      return {
        success: false,
        previousState: request.fromState,
        newState: request.fromState,
        error: policyResult.error.join(', '),
      };
    }

    // Perform the transition
    const previousState = record.currentState;
    record.currentState = request.toState;
    record.asset = {
      ...record.asset,
      state: request.toState,
      updatedAt: new Date().toISOString(),
      version: record.asset.version + 1,
    };
    record.lastUpdated = new Date().toISOString();

    // Record the state change event
    const event = EventStore.createStateChangeEvent({
      assetId: request.assetId,
      actorId: request.actorId,
      type: EventType.STATE_CHANGED,
      payload: {
        previousState,
        newState: request.toState,
        reason: request.reason,
        metadata: request.metadata,
      },
    });

    await this.eventStore.append(event);

    return {
      success: true,
      previousState,
      newState: request.toState,
      event,
    };
  }

  /**
   * Get transition history for an asset
   */
  async getHistory(assetId: string): Promise<BaseEvent[]> {
    return this.eventStore.getByAssetId(assetId);
  }

  /**
   * Rebuild asset state from event history
   *
   * Useful for recovering state or auditing.
   */
  async rebuildFromEvents(assetId: string): Promise<RightModel | null> {
    const events = await this.eventStore.getByAssetId(assetId);

    if (events.length === 0) {
      return null;
    }

    // Find the creation event
    const creationEvent = events.find(
      (e) => e.type === EventType.ASSET_CREATED
    );

    if (!creationEvent) {
      return null;
    }

    // Start with the initial asset
    let asset = creationEvent.payload['asset'] as RightModel;

    // Apply all state changes
    for (const event of events) {
      if (event.type === EventType.STATE_CHANGED) {
        asset = {
          ...asset,
          state: event.payload['newState'] as LifecycleState,
          updatedAt: event.timestamp,
          version: asset.version + 1,
        };
      }
    }

    return asset;
  }

  /**
   * Verify engine state matches event log
   *
   * Useful for consistency checks.
   */
  async verifyConsistency(assetId: string): Promise<boolean> {
    const currentRecord = this.assetStates.get(assetId);
    const rebuiltAsset = await this.rebuildFromEvents(assetId);

    if (!currentRecord || !rebuiltAsset) {
      return currentRecord === null && rebuiltAsset === null;
    }

    return currentRecord.asset.state === rebuiltAsset.state;
  }

  /**
   * Get all registered assets
   */
  getAllAssets(): RightModel[] {
    return Array.from(this.assetStates.values()).map((r) => r.asset);
  }

  /**
   * Get assets by state
   */
  getAssetsByState(state: LifecycleState): RightModel[] {
    return Array.from(this.assetStates.values())
      .filter((r) => r.currentState === state)
      .map((r) => r.asset);
  }

  /**
   * Clear all state (for testing)
   */
  clear(): void {
    this.assetStates.clear();
    this.guards.clear();
    if (this.eventStore instanceof EventStore) {
      this.eventStore.clear();
    }
  }
}
