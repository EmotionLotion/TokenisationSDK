/**
 * Lifecycle Engine Tests
 *
 * Tests the state machine transitions and event sourcing.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { LifecycleEngine, EventStore, LifecycleState, EventType, RightType, TransferabilityMode } from '../src/core/index.js';
import type { RightModel } from '../src/core/index.js';
import { v4 as uuidv4 } from 'uuid';

describe('LifecycleEngine', () => {
  let engine: LifecycleEngine;
  let eventStore: EventStore;

  const createTestAsset = (): RightModel => ({
    id: uuidv4(),
    name: 'Test Asset',
    rightType: RightType.OWNERSHIP,
    state: LifecycleState.DRAFT,
    jurisdiction: {
      countryCode: 'AE',
      accreditedOnly: false,
      blockedJurisdictions: [],
    },
    validityPeriod: {
      isPerpetual: true,
    },
    transferabilityRules: {
      mode: TransferabilityMode.COMPLIANCE_GATED,
      lockupPeriodSeconds: 0,
      requireKyc: true,
    },
    metadata: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    version: 0,
  });

  beforeEach(() => {
    eventStore = new EventStore();
    engine = new LifecycleEngine(eventStore);
  });

  describe('State Machine Transitions', () => {
    it('should register an asset in DRAFT state', async () => {
      const asset = createTestAsset();
      await engine.registerAsset(asset);

      const state = await engine.getState(asset.id);
      expect(state).toBe(LifecycleState.DRAFT);
    });

    it('should allow valid transition DRAFT -> PENDING_VERIFICATION', async () => {
      const asset = createTestAsset();
      await engine.registerAsset(asset);

      const result = await engine.transition({
        assetId: asset.id,
        fromState: LifecycleState.DRAFT,
        toState: LifecycleState.PENDING_VERIFICATION,
        actorId: 'test-actor',
      });

      expect(result.success).toBe(true);
      expect(result.newState).toBe(LifecycleState.PENDING_VERIFICATION);
    });

    it('should allow valid transition PENDING_VERIFICATION -> VERIFIED', async () => {
      const asset = createTestAsset();
      await engine.registerAsset(asset);

      await engine.transition({
        assetId: asset.id,
        fromState: LifecycleState.DRAFT,
        toState: LifecycleState.PENDING_VERIFICATION,
        actorId: 'test-actor',
      });

      const result = await engine.transition({
        assetId: asset.id,
        fromState: LifecycleState.PENDING_VERIFICATION,
        toState: LifecycleState.VERIFIED,
        actorId: 'verifier',
      });

      expect(result.success).toBe(true);
      expect(result.newState).toBe(LifecycleState.VERIFIED);
    });

    it('should allow valid transition VERIFIED -> ACTIVE', async () => {
      const asset = createTestAsset();
      await engine.registerAsset(asset);

      await engine.transition({
        assetId: asset.id,
        fromState: LifecycleState.DRAFT,
        toState: LifecycleState.PENDING_VERIFICATION,
        actorId: 'test-actor',
      });

      await engine.transition({
        assetId: asset.id,
        fromState: LifecycleState.PENDING_VERIFICATION,
        toState: LifecycleState.VERIFIED,
        actorId: 'verifier',
      });

      const result = await engine.transition({
        assetId: asset.id,
        fromState: LifecycleState.VERIFIED,
        toState: LifecycleState.ACTIVE,
        actorId: 'issuer',
      });

      expect(result.success).toBe(true);
      expect(result.newState).toBe(LifecycleState.ACTIVE);
    });

    it('should reject invalid transition DRAFT -> ACTIVE', async () => {
      const asset = createTestAsset();
      await engine.registerAsset(asset);

      const result = await engine.transition({
        assetId: asset.id,
        fromState: LifecycleState.DRAFT,
        toState: LifecycleState.ACTIVE,
        actorId: 'test-actor',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid transition');
    });

    it('should reject invalid transition BURNED -> ACTIVE', async () => {
      // BURNED is a terminal state
      expect(engine.canTransition(LifecycleState.BURNED, LifecycleState.ACTIVE)).toBe(false);
    });

    it('should handle state mismatch error', async () => {
      const asset = createTestAsset();
      await engine.registerAsset(asset);

      const result = await engine.transition({
        assetId: asset.id,
        fromState: LifecycleState.VERIFIED, // Wrong state
        toState: LifecycleState.ACTIVE,
        actorId: 'test-actor',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('State mismatch');
    });
  });

  describe('Event Store', () => {
    it('should record asset creation event', async () => {
      const asset = createTestAsset();
      await engine.registerAsset(asset);

      const events = await eventStore.getByAssetId(asset.id);
      expect(events.length).toBe(1);
      expect(events[0]?.type).toBe(EventType.ASSET_CREATED);
    });

    it('should record state change events', async () => {
      const asset = createTestAsset();
      await engine.registerAsset(asset);

      await engine.transition({
        assetId: asset.id,
        fromState: LifecycleState.DRAFT,
        toState: LifecycleState.PENDING_VERIFICATION,
        actorId: 'test-actor',
      });

      const events = await eventStore.getByAssetId(asset.id);
      expect(events.length).toBe(2);
      expect(events[1]?.type).toBe(EventType.STATE_CHANGED);
    });

    it('should rebuild state from events', async () => {
      const asset = createTestAsset();
      await engine.registerAsset(asset);

      await engine.transition({
        assetId: asset.id,
        fromState: LifecycleState.DRAFT,
        toState: LifecycleState.PENDING_VERIFICATION,
        actorId: 'test-actor',
      });

      await engine.transition({
        assetId: asset.id,
        fromState: LifecycleState.PENDING_VERIFICATION,
        toState: LifecycleState.VERIFIED,
        actorId: 'verifier',
      });

      const rebuiltAsset = await engine.rebuildFromEvents(asset.id);
      expect(rebuiltAsset?.state).toBe(LifecycleState.VERIFIED);
    });

    it('should verify consistency between engine and event log', async () => {
      const asset = createTestAsset();
      await engine.registerAsset(asset);

      await engine.transition({
        assetId: asset.id,
        fromState: LifecycleState.DRAFT,
        toState: LifecycleState.PENDING_VERIFICATION,
        actorId: 'test-actor',
      });

      const isConsistent = await engine.verifyConsistency(asset.id);
      expect(isConsistent).toBe(true);
    });
  });

  describe('Transition Guards', () => {
    it('should execute transition guards', async () => {
      const asset = createTestAsset();
      await engine.registerAsset(asset);

      // Register a guard that blocks the transition
      engine.registerGuard(
        LifecycleState.DRAFT,
        LifecycleState.PENDING_VERIFICATION,
        async () => ({ success: false, error: 'Guard blocked transition' })
      );

      const result = await engine.transition({
        assetId: asset.id,
        fromState: LifecycleState.DRAFT,
        toState: LifecycleState.PENDING_VERIFICATION,
        actorId: 'test-actor',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Guard blocked transition');
    });

    it('should allow transition when guard passes', async () => {
      const asset = createTestAsset();
      await engine.registerAsset(asset);

      // Register a guard that allows the transition
      engine.registerGuard(
        LifecycleState.DRAFT,
        LifecycleState.PENDING_VERIFICATION,
        async () => ({ success: true, data: undefined })
      );

      const result = await engine.transition({
        assetId: asset.id,
        fromState: LifecycleState.DRAFT,
        toState: LifecycleState.PENDING_VERIFICATION,
        actorId: 'test-actor',
      });

      expect(result.success).toBe(true);
    });
  });

  describe('Valid Transitions', () => {
    it('should return correct valid next states', () => {
      expect(engine.getValidNextStates(LifecycleState.DRAFT)).toContain(
        LifecycleState.PENDING_VERIFICATION
      );
      expect(engine.getValidNextStates(LifecycleState.ACTIVE)).toContain(
        LifecycleState.BURNED
      );
      expect(engine.getValidNextStates(LifecycleState.BURNED)).toEqual([]);
    });
  });

  describe('Query Operations', () => {
    it('should get all assets', async () => {
      const asset1 = createTestAsset();
      const asset2 = createTestAsset();

      await engine.registerAsset(asset1);
      await engine.registerAsset(asset2);

      const allAssets = engine.getAllAssets();
      expect(allAssets.length).toBe(2);
    });

    it('should get assets by state', async () => {
      const asset1 = createTestAsset();
      const asset2 = createTestAsset();

      await engine.registerAsset(asset1);
      await engine.registerAsset(asset2);

      await engine.transition({
        assetId: asset1.id,
        fromState: LifecycleState.DRAFT,
        toState: LifecycleState.PENDING_VERIFICATION,
        actorId: 'test-actor',
      });

      const draftAssets = engine.getAssetsByState(LifecycleState.DRAFT);
      expect(draftAssets.length).toBe(1);

      const pendingAssets = engine.getAssetsByState(LifecycleState.PENDING_VERIFICATION);
      expect(pendingAssets.length).toBe(1);
    });

    it('should get asset history', async () => {
      const asset = createTestAsset();
      await engine.registerAsset(asset);

      await engine.transition({
        assetId: asset.id,
        fromState: LifecycleState.DRAFT,
        toState: LifecycleState.PENDING_VERIFICATION,
        actorId: 'actor1',
      });

      await engine.transition({
        assetId: asset.id,
        fromState: LifecycleState.PENDING_VERIFICATION,
        toState: LifecycleState.VERIFIED,
        actorId: 'actor2',
      });

      const history = await engine.getHistory(asset.id);
      expect(history.length).toBe(3); // Creation + 2 transitions
    });
  });
});
