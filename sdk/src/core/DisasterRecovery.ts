/**
 * DisasterRecovery - Production-ready disaster recovery and safe-fail system
 *
 * Provides:
 * - Backend health monitoring
 * - Automatic failover to safe-deny mode
 * - Stuck state detection and resolution
 * - State persistence and recovery
 * - Circuit breaker for backend dependencies
 *
 * When backend is down, all operations requiring off-chain decisions fail-safe (deny).
 */

import { v4 as uuidv4 } from 'uuid';
import type { RightModel, Result, BaseEvent } from './types.js';
import { LifecycleState, ok, err } from './types.js';
import type { IEventStore } from './interfaces.js';

// ============================================================================
// CONFIGURATION TYPES
// ============================================================================

/**
 * System health status
 */
export enum SystemHealthStatus {
  /** All systems operational */
  HEALTHY = 'HEALTHY',
  /** Some services degraded but operational */
  DEGRADED = 'DEGRADED',
  /** Critical services unavailable, safe-deny active */
  CRITICAL = 'CRITICAL',
  /** System in recovery mode */
  RECOVERING = 'RECOVERING',
  /** System offline */
  OFFLINE = 'OFFLINE',
}

/**
 * Backend service status
 */
export enum BackendServiceStatus {
  ONLINE = 'ONLINE',
  DEGRADED = 'DEGRADED',
  OFFLINE = 'OFFLINE',
  UNKNOWN = 'UNKNOWN',
}

/**
 * Safe-fail mode for operations
 */
export enum SafeFailMode {
  /** Deny all operations requiring backend (recommended for production) */
  DENY_ALL = 'DENY_ALL',
  /** Allow read-only operations, deny writes */
  READ_ONLY = 'READ_ONLY',
  /** Use cached decisions if available */
  USE_CACHE = 'USE_CACHE',
  /** Allow all with warnings (not recommended for production) */
  ALLOW_WITH_WARNING = 'ALLOW_WITH_WARNING',
}

/**
 * Disaster recovery configuration
 */
export interface DisasterRecoveryConfig {
  /** Health check interval in milliseconds */
  healthCheckIntervalMs: number;
  /** Number of failed health checks before marking service offline */
  failureThreshold: number;
  /** Time before a stuck state is flagged (in milliseconds) */
  stuckStateThresholdMs: number;
  /** Safe-fail mode when backend is unavailable */
  safeFailMode: SafeFailMode;
  /** Maximum time to cache decisions (in milliseconds) */
  decisionCacheMaxAgeMs: number;
  /** Enable automatic recovery attempts */
  autoRecoveryEnabled: boolean;
  /** Recovery attempt interval (in milliseconds) */
  recoveryIntervalMs: number;
  /** Backend endpoints to monitor */
  backendEndpoints: string[];
}

/**
 * Default configuration (production-safe)
 */
const DEFAULT_CONFIG: DisasterRecoveryConfig = {
  healthCheckIntervalMs: 30 * 1000, // 30 seconds
  failureThreshold: 3,
  stuckStateThresholdMs: 5 * 60 * 1000, // 5 minutes
  safeFailMode: SafeFailMode.DENY_ALL,
  decisionCacheMaxAgeMs: 60 * 1000, // 1 minute
  autoRecoveryEnabled: true,
  recoveryIntervalMs: 60 * 1000, // 1 minute
  backendEndpoints: [],
};

// ============================================================================
// DATA TYPES
// ============================================================================

/**
 * Backend service health
 */
interface BackendServiceHealth {
  endpoint: string;
  status: BackendServiceStatus;
  lastCheck: Date;
  lastSuccess?: Date;
  consecutiveFailures: number;
  latencyMs?: number;
  errorMessage?: string;
}

/**
 * Stuck state record
 */
export interface StuckStateRecord {
  assetId: string;
  state: LifecycleState;
  stuckSince: string;
  lastTransitionAttempt?: string;
  failureReason?: string;
  resolutionAttempts: number;
}

/**
 * Cached decision
 */
interface CachedDecision {
  action: string;
  context: Record<string, unknown>;
  result: 'ALLOW' | 'DENY';
  cachedAt: number;
  reason?: string;
}

/**
 * Recovery checkpoint
 */
export interface RecoveryCheckpoint {
  id: string;
  timestamp: string;
  systemState: {
    totalAssets: number;
    assetsByState: Record<string, number>;
    pendingTransitions: number;
  };
  eventStorePosition: number;
  checksum: string;
}

/**
 * System health report
 */
export interface SystemHealthReport {
  status: SystemHealthStatus;
  timestamp: string;
  backendServices: BackendServiceHealth[];
  stuckStates: StuckStateRecord[];
  lastRecoveryCheckpoint?: RecoveryCheckpoint;
  safeFailModeActive: boolean;
  pendingOperations: number;
  uptime: number;
}

/**
 * Recovery result
 */
export interface RecoveryResult {
  success: boolean;
  recoveredAssets: number;
  failedRecoveries: string[];
  warnings: string[];
  duration: number;
}

// ============================================================================
// DISASTER RECOVERY SERVICE
// ============================================================================

/**
 * DisasterRecoveryService - Manages system resilience and recovery
 */
export class DisasterRecoveryService {
  private config: DisasterRecoveryConfig;
  private startTime: Date;

  // Health monitoring
  private backendHealth: Map<string, BackendServiceHealth> = new Map();
  private healthCheckInterval?: NodeJS.Timeout;
  private recoveryInterval?: NodeJS.Timeout;

  // Stuck state tracking
  private stuckStates: Map<string, StuckStateRecord> = new Map();
  private stateLastUpdated: Map<string, Date> = new Map();

  // Decision caching
  private decisionCache: Map<string, CachedDecision> = new Map();

  // Recovery
  private lastCheckpoint?: RecoveryCheckpoint;
  private isRecovering: boolean = false;

  // Event store reference (optional, for state recovery)
  private eventStore?: IEventStore;

  // Health check function (can be customized)
  private healthCheckFn?: (endpoint: string) => Promise<{ ok: boolean; latencyMs: number }>;

  constructor(config: Partial<DisasterRecoveryConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.startTime = new Date();

    // Initialize backend health for configured endpoints
    for (const endpoint of this.config.backendEndpoints) {
      this.backendHealth.set(endpoint, {
        endpoint,
        status: BackendServiceStatus.UNKNOWN,
        lastCheck: new Date(),
        consecutiveFailures: 0,
      });
    }
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  /**
   * Start disaster recovery monitoring
   */
  start(): void {
    // Start health check interval
    if (this.config.backendEndpoints.length > 0) {
      this.healthCheckInterval = setInterval(
        () => this.runHealthChecks(),
        this.config.healthCheckIntervalMs
      );
      // Run immediate check
      this.runHealthChecks();
    }

    // Start recovery interval if enabled
    if (this.config.autoRecoveryEnabled) {
      this.recoveryInterval = setInterval(
        () => this.attemptAutoRecovery(),
        this.config.recoveryIntervalMs
      );
    }
  }

  /**
   * Stop disaster recovery monitoring
   */
  stop(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }
    if (this.recoveryInterval) {
      clearInterval(this.recoveryInterval);
      this.recoveryInterval = undefined;
    }
  }

  /**
   * Set event store for state recovery
   */
  setEventStore(eventStore: IEventStore): void {
    this.eventStore = eventStore;
  }

  /**
   * Set custom health check function
   */
  setHealthCheckFunction(
    fn: (endpoint: string) => Promise<{ ok: boolean; latencyMs: number }>
  ): void {
    this.healthCheckFn = fn;
  }

  // ============================================================================
  // HEALTH MONITORING
  // ============================================================================

  /**
   * Run health checks on all backend services
   */
  private async runHealthChecks(): Promise<void> {
    for (const endpoint of this.config.backendEndpoints) {
      await this.checkEndpointHealth(endpoint);
    }
  }

  /**
   * Check health of a specific endpoint
   */
  private async checkEndpointHealth(endpoint: string): Promise<void> {
    const health = this.backendHealth.get(endpoint);
    if (!health) return;

    try {
      const result = this.healthCheckFn
        ? await this.healthCheckFn(endpoint)
        : await this.defaultHealthCheck(endpoint);

      if (result.ok) {
        health.status = BackendServiceStatus.ONLINE;
        health.lastSuccess = new Date();
        health.consecutiveFailures = 0;
        health.latencyMs = result.latencyMs;
        health.errorMessage = undefined;
      } else {
        this.recordHealthCheckFailure(health, 'Health check returned not ok');
      }
    } catch (error) {
      this.recordHealthCheckFailure(health, String(error));
    }

    health.lastCheck = new Date();
  }

  /**
   * Default health check implementation
   */
  private async defaultHealthCheck(
    endpoint: string
  ): Promise<{ ok: boolean; latencyMs: number }> {
    const start = Date.now();

    try {
      // Use fetch if available, otherwise mark as unknown
      if (typeof fetch !== 'undefined') {
        const response = await fetch(`${endpoint}/health`, {
          method: 'GET',
          signal: AbortSignal.timeout(5000),
        });
        return {
          ok: response.ok,
          latencyMs: Date.now() - start,
        };
      }
      return { ok: true, latencyMs: 0 }; // Assume ok if fetch unavailable
    } catch {
      return { ok: false, latencyMs: Date.now() - start };
    }
  }

  /**
   * Record a health check failure
   */
  private recordHealthCheckFailure(
    health: BackendServiceHealth,
    error: string
  ): void {
    health.consecutiveFailures++;
    health.errorMessage = error;

    if (health.consecutiveFailures >= this.config.failureThreshold) {
      health.status = BackendServiceStatus.OFFLINE;
    } else {
      health.status = BackendServiceStatus.DEGRADED;
    }
  }

  /**
   * Get overall system health status
   */
  getSystemStatus(): SystemHealthStatus {
    if (this.isRecovering) {
      return SystemHealthStatus.RECOVERING;
    }

    const services = Array.from(this.backendHealth.values());

    if (services.length === 0) {
      return SystemHealthStatus.HEALTHY;
    }

    const offlineCount = services.filter(
      (s) => s.status === BackendServiceStatus.OFFLINE
    ).length;
    const degradedCount = services.filter(
      (s) => s.status === BackendServiceStatus.DEGRADED
    ).length;

    if (offlineCount === services.length) {
      return SystemHealthStatus.OFFLINE;
    }
    if (offlineCount > 0) {
      return SystemHealthStatus.CRITICAL;
    }
    if (degradedCount > 0) {
      return SystemHealthStatus.DEGRADED;
    }

    return SystemHealthStatus.HEALTHY;
  }

  /**
   * Check if safe-fail mode should be active
   */
  isSafeFailModeActive(): boolean {
    const status = this.getSystemStatus();
    return (
      status === SystemHealthStatus.CRITICAL ||
      status === SystemHealthStatus.OFFLINE
    );
  }

  /**
   * Get detailed health report
   */
  getHealthReport(): SystemHealthReport {
    return {
      status: this.getSystemStatus(),
      timestamp: new Date().toISOString(),
      backendServices: Array.from(this.backendHealth.values()),
      stuckStates: Array.from(this.stuckStates.values()),
      lastRecoveryCheckpoint: this.lastCheckpoint,
      safeFailModeActive: this.isSafeFailModeActive(),
      pendingOperations: this.decisionCache.size,
      uptime: Date.now() - this.startTime.getTime(),
    };
  }

  // ============================================================================
  // SAFE-FAIL OPERATIONS
  // ============================================================================

  /**
   * Evaluate an operation in safe-fail mode
   */
  evaluateOperation(
    action: string,
    context: Record<string, unknown>
  ): Result<{ allowed: boolean; reason: string }, string> {
    // Check if safe-fail mode is active
    if (!this.isSafeFailModeActive()) {
      return ok({ allowed: true, reason: 'System healthy' });
    }

    switch (this.config.safeFailMode) {
      case SafeFailMode.DENY_ALL:
        return ok({
          allowed: false,
          reason: 'Operation denied: backend services unavailable (safe-fail mode)',
        });

      case SafeFailMode.READ_ONLY:
        if (this.isReadOnlyAction(action)) {
          return ok({ allowed: true, reason: 'Read-only operation allowed' });
        }
        return ok({
          allowed: false,
          reason: 'Write operation denied: backend services unavailable',
        });

      case SafeFailMode.USE_CACHE: {
        const cached = this.getCachedDecision(action, context);
        if (cached) {
          return ok({
            allowed: cached.result === 'ALLOW',
            reason: `Using cached decision from ${new Date(cached.cachedAt).toISOString()}`,
          });
        }
        return ok({
          allowed: false,
          reason: 'No cached decision available, denying operation',
        });
      }

      case SafeFailMode.ALLOW_WITH_WARNING:
        return ok({
          allowed: true,
          reason: 'WARNING: Operation allowed but backend unavailable - may be inconsistent',
        });

      default:
        return ok({
          allowed: false,
          reason: 'Unknown safe-fail mode, denying operation',
        });
    }
  }

  /**
   * Check if an action is read-only
   */
  private isReadOnlyAction(action: string): boolean {
    const readOnlyActions = [
      'asset:get',
      'asset:list',
      'asset:history',
      'party:get',
      'party:list',
      'token:balance',
      'compliance:status',
    ];
    return readOnlyActions.some((a) => action.startsWith(a));
  }

  /**
   * Cache a decision for potential replay
   */
  cacheDecision(
    action: string,
    context: Record<string, unknown>,
    result: 'ALLOW' | 'DENY',
    reason?: string
  ): void {
    const key = this.getCacheKey(action, context);
    this.decisionCache.set(key, {
      action,
      context,
      result,
      cachedAt: Date.now(),
      reason,
    });

    // Cleanup old cache entries
    this.cleanupDecisionCache();
  }

  /**
   * Get a cached decision
   */
  private getCachedDecision(
    action: string,
    context: Record<string, unknown>
  ): CachedDecision | undefined {
    const key = this.getCacheKey(action, context);
    const cached = this.decisionCache.get(key);

    if (!cached) return undefined;

    // Check if cache is still valid
    if (Date.now() - cached.cachedAt > this.config.decisionCacheMaxAgeMs) {
      this.decisionCache.delete(key);
      return undefined;
    }

    return cached;
  }

  /**
   * Generate cache key for a decision
   */
  private getCacheKey(action: string, context: Record<string, unknown>): string {
    const contextKey = JSON.stringify(context, Object.keys(context).sort());
    return `${action}:${contextKey}`;
  }

  /**
   * Cleanup old cache entries
   */
  private cleanupDecisionCache(): void {
    const now = Date.now();
    for (const [key, cached] of this.decisionCache.entries()) {
      if (now - cached.cachedAt > this.config.decisionCacheMaxAgeMs) {
        this.decisionCache.delete(key);
      }
    }
  }

  // ============================================================================
  // STUCK STATE DETECTION
  // ============================================================================

  /**
   * Record a state update for stuck detection
   */
  recordStateUpdate(assetId: string, state: LifecycleState): void {
    this.stateLastUpdated.set(assetId, new Date());

    // Remove from stuck states if it was there
    this.stuckStates.delete(assetId);
  }

  /**
   * Record a failed transition attempt
   */
  recordFailedTransition(
    assetId: string,
    currentState: LifecycleState,
    reason: string
  ): void {
    const existing = this.stuckStates.get(assetId);

    if (existing) {
      existing.lastTransitionAttempt = new Date().toISOString();
      existing.failureReason = reason;
      existing.resolutionAttempts++;
    } else {
      this.stuckStates.set(assetId, {
        assetId,
        state: currentState,
        stuckSince: new Date().toISOString(),
        lastTransitionAttempt: new Date().toISOString(),
        failureReason: reason,
        resolutionAttempts: 1,
      });
    }
  }

  /**
   * Check for stuck states
   */
  detectStuckStates(assets: RightModel[]): StuckStateRecord[] {
    const now = Date.now();
    const newlyStuck: StuckStateRecord[] = [];

    for (const asset of assets) {
      // Skip terminal states
      if (
        asset.state === LifecycleState.BURNED ||
        asset.state === LifecycleState.REDEEMED
      ) {
        continue;
      }

      const lastUpdate = this.stateLastUpdated.get(asset.id);

      // Check if we have a record
      if (!lastUpdate) {
        // First time seeing this asset, record it
        this.stateLastUpdated.set(asset.id, new Date(asset.updatedAt || Date.now()));
        continue;
      }

      // Check if state is stuck
      const timeSinceUpdate = now - lastUpdate.getTime();
      if (timeSinceUpdate > this.config.stuckStateThresholdMs) {
        // Only flag transitional states as stuck
        if (
          asset.state === LifecycleState.PENDING_VERIFICATION ||
          asset.state === LifecycleState.FROZEN
        ) {
          if (!this.stuckStates.has(asset.id)) {
            const record: StuckStateRecord = {
              assetId: asset.id,
              state: asset.state,
              stuckSince: lastUpdate.toISOString(),
              resolutionAttempts: 0,
            };
            this.stuckStates.set(asset.id, record);
            newlyStuck.push(record);
          }
        }
      }
    }

    return newlyStuck;
  }

  /**
   * Get all stuck states
   */
  getStuckStates(): StuckStateRecord[] {
    return Array.from(this.stuckStates.values());
  }

  /**
   * Manually resolve a stuck state
   */
  resolveStuckState(assetId: string): void {
    this.stuckStates.delete(assetId);
    this.stateLastUpdated.set(assetId, new Date());
  }

  // ============================================================================
  // STATE RECOVERY
  // ============================================================================

  /**
   * Create a recovery checkpoint
   */
  async createCheckpoint(
    assets: RightModel[],
    eventStorePosition: number
  ): Promise<RecoveryCheckpoint> {
    const assetsByState: Record<string, number> = {};
    let pendingTransitions = 0;

    for (const asset of assets) {
      assetsByState[asset.state] = (assetsByState[asset.state] || 0) + 1;
      if (
        asset.state === LifecycleState.PENDING_VERIFICATION ||
        asset.state === LifecycleState.FROZEN
      ) {
        pendingTransitions++;
      }
    }

    const checkpoint: RecoveryCheckpoint = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      systemState: {
        totalAssets: assets.length,
        assetsByState,
        pendingTransitions,
      },
      eventStorePosition,
      checksum: this.computeChecksum(assets),
    };

    this.lastCheckpoint = checkpoint;
    return checkpoint;
  }

  /**
   * Compute a checksum for state verification
   */
  private computeChecksum(assets: RightModel[]): string {
    const stateString = assets
      .map((a) => `${a.id}:${a.state}:${a.version}`)
      .sort()
      .join('|');

    // Simple hash for checksum
    let hash = 0;
    for (let i = 0; i < stateString.length; i++) {
      const char = stateString.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }

  /**
   * Recover state from event store
   */
  async recoverFromEvents(): Promise<RecoveryResult> {
    if (!this.eventStore) {
      return {
        success: false,
        recoveredAssets: 0,
        failedRecoveries: [],
        warnings: ['No event store configured'],
        duration: 0,
      };
    }

    this.isRecovering = true;
    const startTime = Date.now();
    const warnings: string[] = [];
    const failedRecoveries: string[] = [];
    let recoveredAssets = 0;

    try {
      const events = await this.eventStore.getAll();
      const assetStates = new Map<string, { state: LifecycleState; version: number }>();

      // Replay events to rebuild state
      for (const event of events) {
        try {
          if (event.type === 'ASSET_CREATED') {
            const asset = event.payload['asset'] as RightModel;
            assetStates.set(event.assetId, {
              state: asset.state,
              version: asset.version,
            });
            recoveredAssets++;
          } else if (event.type === 'STATE_CHANGED') {
            const existing = assetStates.get(event.assetId);
            if (existing) {
              existing.state = event.payload['newState'] as LifecycleState;
              existing.version++;
            }
          }
        } catch (error) {
          failedRecoveries.push(event.assetId);
          warnings.push(`Failed to process event ${event.id}: ${error}`);
        }
      }

      // Clear stuck states after recovery
      this.stuckStates.clear();

      return {
        success: true,
        recoveredAssets,
        failedRecoveries,
        warnings,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        recoveredAssets,
        failedRecoveries,
        warnings: [`Recovery failed: ${error}`],
        duration: Date.now() - startTime,
      };
    } finally {
      this.isRecovering = false;
    }
  }

  /**
   * Attempt automatic recovery
   */
  private async attemptAutoRecovery(): Promise<void> {
    // Only attempt recovery if in critical/offline state
    const status = this.getSystemStatus();
    if (
      status !== SystemHealthStatus.CRITICAL &&
      status !== SystemHealthStatus.OFFLINE
    ) {
      return;
    }

    // Don't attempt if already recovering
    if (this.isRecovering) {
      return;
    }

    // Check if any backend is back online
    for (const endpoint of this.config.backendEndpoints) {
      await this.checkEndpointHealth(endpoint);
    }

    // If system is now healthy, clear stuck states
    if (this.getSystemStatus() === SystemHealthStatus.HEALTHY) {
      this.stuckStates.clear();
    }
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Update configuration
   */
  updateConfig(config: Partial<DisasterRecoveryConfig>): void {
    const wasRunning = !!this.healthCheckInterval;

    if (wasRunning) {
      this.stop();
    }

    this.config = { ...this.config, ...config };

    // Update backend health for new endpoints
    for (const endpoint of this.config.backendEndpoints) {
      if (!this.backendHealth.has(endpoint)) {
        this.backendHealth.set(endpoint, {
          endpoint,
          status: BackendServiceStatus.UNKNOWN,
          lastCheck: new Date(),
          consecutiveFailures: 0,
        });
      }
    }

    if (wasRunning) {
      this.start();
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): DisasterRecoveryConfig {
    return { ...this.config };
  }

  /**
   * Clear all state
   */
  clear(): void {
    this.stop();
    this.backendHealth.clear();
    this.stuckStates.clear();
    this.stateLastUpdated.clear();
    this.decisionCache.clear();
    this.lastCheckpoint = undefined;
    this.isRecovering = false;
  }

  /**
   * Force a backend service to offline (for testing)
   */
  simulateBackendOffline(endpoint: string): void {
    const health = this.backendHealth.get(endpoint);
    if (health) {
      health.status = BackendServiceStatus.OFFLINE;
      health.consecutiveFailures = this.config.failureThreshold;
      health.errorMessage = 'Simulated offline';
    }
  }

  /**
   * Force a backend service to online (for testing)
   */
  simulateBackendOnline(endpoint: string): void {
    const health = this.backendHealth.get(endpoint);
    if (health) {
      health.status = BackendServiceStatus.ONLINE;
      health.consecutiveFailures = 0;
      health.lastSuccess = new Date();
      health.errorMessage = undefined;
    }
  }
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/**
 * Create disaster recovery service with production defaults
 */
export function createDisasterRecoveryService(
  config?: Partial<DisasterRecoveryConfig>
): DisasterRecoveryService {
  return new DisasterRecoveryService({
    healthCheckIntervalMs: 30 * 1000,
    failureThreshold: 3,
    stuckStateThresholdMs: 5 * 60 * 1000,
    safeFailMode: SafeFailMode.DENY_ALL,
    decisionCacheMaxAgeMs: 60 * 1000,
    autoRecoveryEnabled: true,
    recoveryIntervalMs: 60 * 1000,
    ...config,
  });
}

/**
 * Create disaster recovery service for development
 */
export function createDevelopmentDisasterRecoveryService(): DisasterRecoveryService {
  return new DisasterRecoveryService({
    healthCheckIntervalMs: 60 * 1000,
    failureThreshold: 5,
    stuckStateThresholdMs: 30 * 60 * 1000, // 30 minutes for dev
    safeFailMode: SafeFailMode.ALLOW_WITH_WARNING,
    decisionCacheMaxAgeMs: 5 * 60 * 1000,
    autoRecoveryEnabled: true,
    recoveryIntervalMs: 5 * 60 * 1000,
    backendEndpoints: [],
  });
}
