/**
 * Disaster Recovery Tests
 *
 * Tests for Test Case 15: Disaster Recovery and "Safe Fail"
 * Validates system resilience and recovery capabilities.
 *
 * Pass criteria:
 * - Backend down: SDK denies when backend unreachable
 * - Stuck state detection: Detected and surfaced for manual intervention
 * - Recovery: State can be rebuilt from event log
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import {
  DisasterRecoveryService,
  SystemHealthStatus,
  BackendServiceStatus,
  SafeFailMode,
  createDisasterRecoveryService,
  createDevelopmentDisasterRecoveryService,
} from '../src/core/DisasterRecovery.js';
import { EventStore } from '../src/core/EventStore.js';
import { LifecycleState, RightType, TransferabilityMode, EventType } from '../src/core/types.js';
import type { RightModel } from '../src/core/types.js';

// ============================================================================
// TEST FIXTURES
// ============================================================================

function createTestAsset(overrides: Partial<RightModel> = {}): RightModel {
  return {
    id: uuidv4(),
    name: 'DR Test Asset',
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
    ...overrides,
  };
}

describe('Disaster Recovery Tests', () => {
  let drService: DisasterRecoveryService;
  let eventStore: EventStore;

  beforeEach(() => {
    eventStore = new EventStore();
    drService = createDisasterRecoveryService({
      healthCheckIntervalMs: 1000,
      failureThreshold: 3,
      stuckStateThresholdMs: 5000, // 5 seconds for testing
      safeFailMode: SafeFailMode.DENY_ALL,
      decisionCacheMaxAgeMs: 60000,
      autoRecoveryEnabled: false, // Disable for controlled testing
      backendEndpoints: [],
    });
    drService.setEventStore(eventStore);
  });

  afterEach(() => {
    drService.stop();
    drService.clear();
    eventStore.clear();
  });

  // ==========================================================================
  // SAFE-FAIL MODE TESTS
  // ==========================================================================

  describe('Safe-Fail Mode', () => {
    describe('DENY_ALL mode', () => {
      it('should deny all operations when backend is offline', () => {
        // Simulate backend offline
        drService.updateConfig({
          backendEndpoints: ['http://backend:8080'],
        });
        drService.simulateBackendOffline('http://backend:8080');

        const result = drService.evaluateOperation('token:transfer', {
          from: 'alice',
          to: 'bob',
          amount: '100',
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.allowed).toBe(false);
          expect(result.data.reason).toContain('safe-fail mode');
        }
      });

      it('should allow operations when backend is online', () => {
        // No backend configured = healthy
        const result = drService.evaluateOperation('token:transfer', {
          from: 'alice',
          to: 'bob',
          amount: '100',
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.allowed).toBe(true);
          expect(result.data.reason).toBe('System healthy');
        }
      });
    });

    describe('READ_ONLY mode', () => {
      it('should allow read operations when backend is offline', () => {
        const service = createDisasterRecoveryService({
          safeFailMode: SafeFailMode.READ_ONLY,
          backendEndpoints: ['http://backend:8080'],
        });
        service.simulateBackendOffline('http://backend:8080');

        const result = service.evaluateOperation('asset:get', { id: '123' });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.allowed).toBe(true);
          expect(result.data.reason).toContain('Read-only');
        }

        service.clear();
      });

      it('should deny write operations when backend is offline', () => {
        const service = createDisasterRecoveryService({
          safeFailMode: SafeFailMode.READ_ONLY,
          backendEndpoints: ['http://backend:8080'],
        });
        service.simulateBackendOffline('http://backend:8080');

        const result = service.evaluateOperation('token:transfer', {});

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.allowed).toBe(false);
          expect(result.data.reason).toContain('Write operation denied');
        }

        service.clear();
      });
    });

    describe('USE_CACHE mode', () => {
      it('should use cached decision when available', () => {
        const service = createDisasterRecoveryService({
          safeFailMode: SafeFailMode.USE_CACHE,
          backendEndpoints: ['http://backend:8080'],
        });

        // Cache a decision
        service.cacheDecision(
          'token:transfer',
          { from: 'alice', to: 'bob' },
          'ALLOW',
          'Previously approved'
        );

        // Simulate backend offline
        service.simulateBackendOffline('http://backend:8080');

        const result = service.evaluateOperation('token:transfer', {
          from: 'alice',
          to: 'bob',
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.allowed).toBe(true);
          expect(result.data.reason).toContain('cached decision');
        }

        service.clear();
      });

      it('should deny when no cached decision available', () => {
        const service = createDisasterRecoveryService({
          safeFailMode: SafeFailMode.USE_CACHE,
          backendEndpoints: ['http://backend:8080'],
        });
        service.simulateBackendOffline('http://backend:8080');

        const result = service.evaluateOperation('token:transfer', {
          from: 'unknown',
          to: 'unknown',
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.allowed).toBe(false);
          expect(result.data.reason).toContain('No cached decision');
        }

        service.clear();
      });
    });

    describe('ALLOW_WITH_WARNING mode', () => {
      it('should allow with warning when backend is offline', () => {
        const service = createDisasterRecoveryService({
          safeFailMode: SafeFailMode.ALLOW_WITH_WARNING,
          backendEndpoints: ['http://backend:8080'],
        });
        service.simulateBackendOffline('http://backend:8080');

        const result = service.evaluateOperation('token:transfer', {});

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.allowed).toBe(true);
          expect(result.data.reason).toContain('WARNING');
        }

        service.clear();
      });
    });
  });

  // ==========================================================================
  // SYSTEM HEALTH STATUS
  // ==========================================================================

  describe('System Health Status', () => {
    it('should report HEALTHY when no backends configured', () => {
      expect(drService.getSystemStatus()).toBe(SystemHealthStatus.HEALTHY);
      expect(drService.isSafeFailModeActive()).toBe(false);
    });

    it('should report HEALTHY when all backends online', () => {
      drService.updateConfig({
        backendEndpoints: ['http://backend:8080'],
      });
      drService.simulateBackendOnline('http://backend:8080');

      expect(drService.getSystemStatus()).toBe(SystemHealthStatus.HEALTHY);
    });

    it('should report CRITICAL when some backends offline', () => {
      drService.updateConfig({
        backendEndpoints: ['http://backend1:8080', 'http://backend2:8080'],
      });
      drService.simulateBackendOnline('http://backend1:8080');
      drService.simulateBackendOffline('http://backend2:8080');

      expect(drService.getSystemStatus()).toBe(SystemHealthStatus.CRITICAL);
      expect(drService.isSafeFailModeActive()).toBe(true);
    });

    it('should report OFFLINE when all backends offline', () => {
      drService.updateConfig({
        backendEndpoints: ['http://backend:8080'],
      });
      drService.simulateBackendOffline('http://backend:8080');

      expect(drService.getSystemStatus()).toBe(SystemHealthStatus.OFFLINE);
      expect(drService.isSafeFailModeActive()).toBe(true);
    });

    it('should include detailed health report', () => {
      drService.updateConfig({
        backendEndpoints: ['http://backend:8080'],
      });
      drService.simulateBackendOnline('http://backend:8080');

      const report = drService.getHealthReport();

      expect(report.status).toBe(SystemHealthStatus.HEALTHY);
      expect(report.backendServices).toHaveLength(1);
      expect(report.backendServices[0]?.status).toBe(BackendServiceStatus.ONLINE);
      expect(report.safeFailModeActive).toBe(false);
      expect(report.uptime).toBeGreaterThanOrEqual(0);
    });
  });

  // ==========================================================================
  // STUCK STATE DETECTION
  // ==========================================================================

  describe('Stuck State Detection', () => {
    it('should detect assets stuck in transitional states', async () => {
      // Create service with short stuck threshold
      const service = createDisasterRecoveryService({
        stuckStateThresholdMs: 100, // 100ms for testing
      });

      const asset = createTestAsset({
        state: LifecycleState.PENDING_VERIFICATION,
        updatedAt: new Date(Date.now() - 200).toISOString(), // 200ms ago
      });

      // Record initial state
      service.recordStateUpdate(asset.id, asset.state);

      // Wait for stuck threshold
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Detect stuck states
      const stuckStates = service.detectStuckStates([asset]);

      expect(stuckStates).toHaveLength(1);
      expect(stuckStates[0]?.assetId).toBe(asset.id);
      expect(stuckStates[0]?.state).toBe(LifecycleState.PENDING_VERIFICATION);

      service.clear();
    });

    it('should not flag terminal states as stuck', async () => {
      const service = createDisasterRecoveryService({
        stuckStateThresholdMs: 100,
      });

      const burnedAsset = createTestAsset({
        state: LifecycleState.BURNED,
        updatedAt: new Date(Date.now() - 200).toISOString(),
      });

      const redeemedAsset = createTestAsset({
        state: LifecycleState.REDEEMED,
        updatedAt: new Date(Date.now() - 200).toISOString(),
      });

      service.recordStateUpdate(burnedAsset.id, burnedAsset.state);
      service.recordStateUpdate(redeemedAsset.id, redeemedAsset.state);

      await new Promise((resolve) => setTimeout(resolve, 150));

      const stuckStates = service.detectStuckStates([burnedAsset, redeemedAsset]);

      expect(stuckStates).toHaveLength(0);

      service.clear();
    });

    it('should track failed transition attempts', () => {
      const assetId = 'test-asset-1';

      drService.recordFailedTransition(
        assetId,
        LifecycleState.PENDING_VERIFICATION,
        'Backend timeout'
      );

      const stuckStates = drService.getStuckStates();

      expect(stuckStates).toHaveLength(1);
      expect(stuckStates[0]?.failureReason).toBe('Backend timeout');
      expect(stuckStates[0]?.resolutionAttempts).toBe(1);
    });

    it('should increment resolution attempts on repeated failures', () => {
      const assetId = 'test-asset-2';

      drService.recordFailedTransition(assetId, LifecycleState.PENDING_VERIFICATION, 'Error 1');
      drService.recordFailedTransition(assetId, LifecycleState.PENDING_VERIFICATION, 'Error 2');
      drService.recordFailedTransition(assetId, LifecycleState.PENDING_VERIFICATION, 'Error 3');

      const stuckStates = drService.getStuckStates();

      expect(stuckStates).toHaveLength(1);
      expect(stuckStates[0]?.resolutionAttempts).toBe(3);
      expect(stuckStates[0]?.failureReason).toBe('Error 3');
    });

    it('should clear stuck state after successful update', () => {
      const assetId = 'test-asset-3';

      drService.recordFailedTransition(assetId, LifecycleState.PENDING_VERIFICATION, 'Error');
      expect(drService.getStuckStates()).toHaveLength(1);

      drService.recordStateUpdate(assetId, LifecycleState.VERIFIED);
      expect(drService.getStuckStates()).toHaveLength(0);
    });

    it('should allow manual resolution of stuck states', () => {
      const assetId = 'test-asset-4';

      drService.recordFailedTransition(assetId, LifecycleState.FROZEN, 'Manual intervention needed');
      expect(drService.getStuckStates()).toHaveLength(1);

      drService.resolveStuckState(assetId);
      expect(drService.getStuckStates()).toHaveLength(0);
    });
  });

  // ==========================================================================
  // STATE RECOVERY FROM EVENTS
  // ==========================================================================

  describe('State Recovery from Events', () => {
    it('should recover state from event log', async () => {
      // Create some events
      const asset1 = createTestAsset({ state: LifecycleState.DRAFT });
      const asset2 = createTestAsset({ state: LifecycleState.DRAFT });

      // Append creation events
      await eventStore.append(
        EventStore.createStateChangeEvent({
          assetId: asset1.id,
          actorId: 'system',
          type: EventType.ASSET_CREATED,
          payload: { asset: asset1, initialState: LifecycleState.DRAFT },
        })
      );

      await eventStore.append(
        EventStore.createStateChangeEvent({
          assetId: asset2.id,
          actorId: 'system',
          type: EventType.ASSET_CREATED,
          payload: { asset: asset2, initialState: LifecycleState.DRAFT },
        })
      );

      // Append state change
      await eventStore.append(
        EventStore.createStateChangeEvent({
          assetId: asset1.id,
          actorId: 'verifier',
          type: EventType.STATE_CHANGED,
          payload: {
            previousState: LifecycleState.DRAFT,
            newState: LifecycleState.VERIFIED,
          },
        })
      );

      // Recover state
      const result = await drService.recoverFromEvents();

      expect(result.success).toBe(true);
      expect(result.recoveredAssets).toBe(2);
      expect(result.failedRecoveries).toHaveLength(0);
    });

    it('should report recovery failures', async () => {
      // Append malformed event
      await eventStore.append({
        id: uuidv4(),
        type: EventType.ASSET_CREATED,
        assetId: 'malformed-asset',
        timestamp: new Date().toISOString(),
        actorId: 'system',
        payload: {}, // Missing asset data
        eventVersion: 1,
      });

      const result = await drService.recoverFromEvents();

      // Should still succeed overall but note the issue
      expect(result.success).toBe(true);
      expect(result.recoveredAssets).toBe(0);
    });

    it('should clear stuck states after recovery', async () => {
      const assetId = 'stuck-asset';

      // Record a stuck state
      drService.recordFailedTransition(assetId, LifecycleState.PENDING_VERIFICATION, 'Error');
      expect(drService.getStuckStates()).toHaveLength(1);

      // Recover from events
      await drService.recoverFromEvents();

      // Stuck states should be cleared
      expect(drService.getStuckStates()).toHaveLength(0);
    });
  });

  // ==========================================================================
  // RECOVERY CHECKPOINTS
  // ==========================================================================

  describe('Recovery Checkpoints', () => {
    it('should create checkpoint with current system state', async () => {
      const assets = [
        createTestAsset({ state: LifecycleState.DRAFT }),
        createTestAsset({ state: LifecycleState.ACTIVE }),
        createTestAsset({ state: LifecycleState.PENDING_VERIFICATION }),
      ];

      const checkpoint = await drService.createCheckpoint(assets, 100);

      expect(checkpoint.id).toBeDefined();
      expect(checkpoint.timestamp).toBeDefined();
      expect(checkpoint.systemState.totalAssets).toBe(3);
      expect(checkpoint.systemState.assetsByState[LifecycleState.DRAFT]).toBe(1);
      expect(checkpoint.systemState.assetsByState[LifecycleState.ACTIVE]).toBe(1);
      expect(checkpoint.systemState.pendingTransitions).toBe(1);
      expect(checkpoint.eventStorePosition).toBe(100);
      expect(checkpoint.checksum).toBeDefined();
    });

    it('should include checkpoint in health report', async () => {
      const assets = [createTestAsset()];
      await drService.createCheckpoint(assets, 50);

      const report = drService.getHealthReport();

      expect(report.lastRecoveryCheckpoint).toBeDefined();
      expect(report.lastRecoveryCheckpoint?.eventStorePosition).toBe(50);
    });
  });

  // ==========================================================================
  // DECISION CACHING
  // ==========================================================================

  describe('Decision Caching', () => {
    it('should cache decisions for replay', () => {
      drService.cacheDecision(
        'token:transfer',
        { from: 'alice', to: 'bob', amount: '100' },
        'ALLOW',
        'Compliance passed'
      );

      // Trigger safe-fail mode
      drService.updateConfig({
        safeFailMode: SafeFailMode.USE_CACHE,
        backendEndpoints: ['http://backend:8080'],
      });
      drService.simulateBackendOffline('http://backend:8080');

      const result = drService.evaluateOperation('token:transfer', {
        from: 'alice',
        to: 'bob',
        amount: '100',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.allowed).toBe(true);
      }
    });

    it('should expire old cached decisions', async () => {
      const service = createDisasterRecoveryService({
        decisionCacheMaxAgeMs: 100, // 100ms expiry
        safeFailMode: SafeFailMode.USE_CACHE,
        backendEndpoints: ['http://backend:8080'],
      });

      service.cacheDecision('test:action', { key: 'value' }, 'ALLOW');

      // Wait for cache to expire
      await new Promise((resolve) => setTimeout(resolve, 150));

      service.simulateBackendOffline('http://backend:8080');

      const result = service.evaluateOperation('test:action', { key: 'value' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.allowed).toBe(false);
        expect(result.data.reason).toContain('No cached decision');
      }

      service.clear();
    });
  });

  // ==========================================================================
  // DEVELOPMENT MODE
  // ==========================================================================

  describe('Development Mode', () => {
    it('should have relaxed settings in development mode', () => {
      const devService = createDevelopmentDisasterRecoveryService();
      const config = devService.getConfig();

      expect(config.safeFailMode).toBe(SafeFailMode.ALLOW_WITH_WARNING);
      expect(config.stuckStateThresholdMs).toBeGreaterThan(5 * 60 * 1000);

      devService.clear();
    });
  });

  // ==========================================================================
  // INTEGRATION SCENARIOS
  // ==========================================================================

  describe('Integration Scenarios', () => {
    it('Scenario 15a: Backend down - SDK denies operations', () => {
      drService.updateConfig({
        backendEndpoints: ['http://compliance-backend:8080'],
        safeFailMode: SafeFailMode.DENY_ALL,
      });
      drService.simulateBackendOffline('http://compliance-backend:8080');

      // Attempt a transfer
      const result = drService.evaluateOperation('token:transfer', {
        from: 'investor-1',
        to: 'investor-2',
        amount: '1000000',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.allowed).toBe(false);
        expect(result.data.reason).toContain('backend services unavailable');
      }

      // Verify health report shows issue
      const report = drService.getHealthReport();
      expect(report.status).toBe(SystemHealthStatus.OFFLINE);
      expect(report.safeFailModeActive).toBe(true);
    });

    it('Scenario 15b: Stuck state detected and surfaced', async () => {
      const service = createDisasterRecoveryService({
        stuckStateThresholdMs: 100,
      });

      const verificationAsset = createTestAsset({
        id: 'verification-stuck',
        state: LifecycleState.PENDING_VERIFICATION,
      });

      // Record initial state
      service.recordStateUpdate(verificationAsset.id, verificationAsset.state);

      // Wait for stuck threshold
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Detect stuck states
      service.detectStuckStates([verificationAsset]);

      // Verify stuck state is surfaced in health report
      const report = service.getHealthReport();
      expect(report.stuckStates).toHaveLength(1);
      expect(report.stuckStates[0]?.assetId).toBe('verification-stuck');

      service.clear();
    });

    it('Scenario 15c: State recovery from event log after crash', async () => {
      // Simulate a system with events
      const asset = createTestAsset({
        id: 'recovery-test',
        state: LifecycleState.DRAFT,
      });

      await eventStore.append(
        EventStore.createStateChangeEvent({
          assetId: asset.id,
          actorId: 'issuer',
          type: EventType.ASSET_CREATED,
          payload: { asset, initialState: LifecycleState.DRAFT },
        })
      );

      await eventStore.append(
        EventStore.createStateChangeEvent({
          assetId: asset.id,
          actorId: 'verifier',
          type: EventType.STATE_CHANGED,
          payload: {
            previousState: LifecycleState.DRAFT,
            newState: LifecycleState.PENDING_VERIFICATION,
          },
        })
      );

      await eventStore.append(
        EventStore.createStateChangeEvent({
          assetId: asset.id,
          actorId: 'verifier',
          type: EventType.STATE_CHANGED,
          payload: {
            previousState: LifecycleState.PENDING_VERIFICATION,
            newState: LifecycleState.VERIFIED,
          },
        })
      );

      // Simulate "crash" - new DR service instance
      const newDrService = createDisasterRecoveryService();
      newDrService.setEventStore(eventStore);

      // Recover state
      const result = await newDrService.recoverFromEvents();

      expect(result.success).toBe(true);
      expect(result.recoveredAssets).toBe(1);
      expect(result.duration).toBeGreaterThanOrEqual(0);

      newDrService.clear();
    });

    it('Scenario 15d: Graceful degradation during partial outage', () => {
      drService.updateConfig({
        backendEndpoints: [
          'http://primary-backend:8080',
          'http://secondary-backend:8080',
        ],
        safeFailMode: SafeFailMode.DENY_ALL,
      });

      // Primary is online, secondary is offline
      drService.simulateBackendOnline('http://primary-backend:8080');
      drService.simulateBackendOffline('http://secondary-backend:8080');

      // System should be in CRITICAL state (some services down)
      const status = drService.getSystemStatus();
      expect(status).toBe(SystemHealthStatus.CRITICAL);

      // Safe-fail mode should be active
      expect(drService.isSafeFailModeActive()).toBe(true);

      // Operations should be denied
      const result = drService.evaluateOperation('token:transfer', {});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.allowed).toBe(false);
      }
    });
  });
});
