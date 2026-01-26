/**
 * Lifecycle Engine Tests
 *
 * Tests for asset lifecycle state machine and transitions.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  LifecycleEngine,
  LifecycleState,
  type RightModel,
  RightType,
  TransferabilityMode,
} from '../src/core/index.js';

describe('LifecycleEngine', () => {
  let engine: LifecycleEngine;

  beforeEach(() => {
    engine = new LifecycleEngine();
  });

  function createTestAsset(overrides?: Partial<RightModel>): RightModel {
    return {
      id: `asset-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: 'Test Asset',
      rightType: RightType.OWNERSHIP,
      state: LifecycleState.DRAFT,
      transferability: TransferabilityMode.TRANSFERABLE,
      jurisdiction: { countryCode: 'US' },
      issuerId: 'issuer-1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      ...overrides,
    };
  }

  describe('Asset Registration', () => {
    it('should register a new asset', async () => {
      const asset = createTestAsset();
      await engine.registerAsset(asset);

      const retrieved = await engine.getAsset(asset.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(asset.id);
    });

    it('should get asset state', async () => {
      const asset = createTestAsset();
      await engine.registerAsset(asset);

      const state = await engine.getState(asset.id);
      expect(state).toBe(LifecycleState.DRAFT);
    });

    it('should return null for non-existent asset', async () => {
      const state = await engine.getState('non-existent');
      expect(state).toBeNull();
    });
  });

  describe('State Transitions', () => {
    it('should register and retrieve asset state', async () => {
      const asset = createTestAsset();
      await engine.registerAsset(asset);

      const state = await engine.getState(asset.id);
      expect(state).toBe(LifecycleState.DRAFT);
    });

    it('should reject invalid transitions from BURNED state', async () => {
      const asset = createTestAsset({ state: LifecycleState.BURNED });
      await engine.registerAsset(asset);

      // Cannot transition from BURNED
      const result = await engine.transition({
        assetId: asset.id,
        fromState: LifecycleState.BURNED,
        toState: LifecycleState.ACTIVE,
        actorId: 'issuer-1',
      });

      expect(result.success).toBe(false);
    });
  });

  describe('Asset Queries', () => {
    it('should get all assets', async () => {
      await engine.registerAsset(createTestAsset({ id: 'asset-1' }));
      await engine.registerAsset(createTestAsset({ id: 'asset-2' }));
      await engine.registerAsset(createTestAsset({ id: 'asset-3' }));

      const assets = engine.getAllAssets();
      expect(assets.length).toBe(3);
    });

    it('should filter assets by state', async () => {
      await engine.registerAsset(createTestAsset({ id: 'draft-1', state: LifecycleState.DRAFT }));
      await engine.registerAsset(createTestAsset({ id: 'draft-2', state: LifecycleState.DRAFT }));
      await engine.registerAsset(createTestAsset({ id: 'active-1', state: LifecycleState.ACTIVE }));

      const draftAssets = engine.getAssetsByState(LifecycleState.DRAFT);
      const activeAssets = engine.getAssetsByState(LifecycleState.ACTIVE);

      expect(draftAssets.length).toBe(2);
      expect(activeAssets.length).toBe(1);
    });
  });
});
