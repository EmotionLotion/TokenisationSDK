/**
 * PSSConnectorRegistry - Central Registry for PSS/NDC/DCS Connectors
 *
 * Manages connector instances and provides unified access:
 * - Register connectors by provider ID
 * - Get connector by provider or capability
 * - Auto-discovery of available connectors
 * - Fallback/failover support
 */

import type {
  IPSSConnector,
  INDCConnector,
  IDCSConnector,
} from '../types.js';

/**
 * Connector capabilities
 */
export type ConnectorCapability =
  | 'pnr'           // PNR operations
  | 'ticketing'     // Ticketing operations
  | 'ndc-shopping'  // NDC offer search
  | 'ndc-ordering'  // NDC order management
  | 'checkin'       // Check-in operations
  | 'boarding'      // Boarding operations
  | 'seatmap';      // Seat map retrieval

/**
 * Registered connector entry
 */
interface ConnectorEntry {
  connector: IPSSConnector | INDCConnector | IDCSConnector;
  type: 'pss' | 'ndc' | 'dcs';
  capabilities: ConnectorCapability[];
  priority: number;
  enabled: boolean;
}

/**
 * Registry configuration
 */
export interface PSSRegistryConfig {
  /** Enable auto-failover on errors */
  enableFailover?: boolean;
  /** Number of retries before failover */
  failoverRetries?: number;
  /** Health check interval (ms) */
  healthCheckInterval?: number;
}

/**
 * PSSConnectorRegistry - Unified connector management
 */
export class PSSConnectorRegistry {
  private connectors: Map<string, ConnectorEntry> = new Map();
  private config: Required<PSSRegistryConfig>;
  private healthCheckTimer?: ReturnType<typeof setInterval>;
  private healthStatus: Map<string, boolean> = new Map();

  constructor(config: PSSRegistryConfig = {}) {
    this.config = {
      enableFailover: config.enableFailover ?? true,
      failoverRetries: config.failoverRetries ?? 2,
      healthCheckInterval: config.healthCheckInterval ?? 60000,
    };
  }

  // ============================================================================
  // REGISTRATION
  // ============================================================================

  /**
   * Register a PSS connector
   */
  registerPSS(
    connector: IPSSConnector,
    options: {
      capabilities?: ConnectorCapability[];
      priority?: number;
    } = {}
  ): void {
    const entry: ConnectorEntry = {
      connector,
      type: 'pss',
      capabilities: options.capabilities || ['pnr', 'ticketing'],
      priority: options.priority ?? 100,
      enabled: true,
    };

    this.connectors.set(connector.providerId, entry);
    this.healthStatus.set(connector.providerId, true);
  }

  /**
   * Register an NDC connector
   */
  registerNDC(
    connector: INDCConnector,
    options: {
      capabilities?: ConnectorCapability[];
      priority?: number;
    } = {}
  ): void {
    const entry: ConnectorEntry = {
      connector,
      type: 'ndc',
      capabilities: options.capabilities || [
        'pnr',
        'ticketing',
        'ndc-shopping',
        'ndc-ordering',
        'seatmap',
      ],
      priority: options.priority ?? 100,
      enabled: true,
    };

    this.connectors.set(connector.providerId, entry);
    this.healthStatus.set(connector.providerId, true);
  }

  /**
   * Register a DCS connector
   */
  registerDCS(
    connector: IDCSConnector,
    options: {
      capabilities?: ConnectorCapability[];
      priority?: number;
    } = {}
  ): void {
    const entry: ConnectorEntry = {
      connector,
      type: 'dcs',
      capabilities: options.capabilities || ['checkin', 'boarding'],
      priority: options.priority ?? 100,
      enabled: true,
    };

    this.connectors.set(connector.providerId, entry);
    this.healthStatus.set(connector.providerId, true);
  }

  /**
   * Unregister a connector
   */
  unregister(providerId: string): boolean {
    this.healthStatus.delete(providerId);
    return this.connectors.delete(providerId);
  }

  // ============================================================================
  // RETRIEVAL
  // ============================================================================

  /**
   * Get connector by provider ID
   */
  get(providerId: string): IPSSConnector | INDCConnector | IDCSConnector | undefined {
    const entry = this.connectors.get(providerId);
    if (!entry || !entry.enabled) return undefined;
    return entry.connector;
  }

  /**
   * Get PSS connector by provider ID
   */
  getPSS(providerId: string): IPSSConnector | undefined {
    const entry = this.connectors.get(providerId);
    if (!entry || entry.type !== 'pss' || !entry.enabled) return undefined;
    return entry.connector as IPSSConnector;
  }

  /**
   * Get NDC connector by provider ID
   */
  getNDC(providerId: string): INDCConnector | undefined {
    const entry = this.connectors.get(providerId);
    if (!entry || entry.type !== 'ndc' || !entry.enabled) return undefined;
    return entry.connector as INDCConnector;
  }

  /**
   * Get DCS connector by provider ID
   */
  getDCS(providerId: string): IDCSConnector | undefined {
    const entry = this.connectors.get(providerId);
    if (!entry || entry.type !== 'dcs' || !entry.enabled) return undefined;
    return entry.connector as IDCSConnector;
  }

  /**
   * Get connectors by capability (sorted by priority)
   */
  getByCapability(capability: ConnectorCapability): Array<IPSSConnector | INDCConnector | IDCSConnector> {
    return Array.from(this.connectors.values())
      .filter((entry) => entry.enabled && entry.capabilities.includes(capability))
      .sort((a, b) => b.priority - a.priority)
      .map((entry) => entry.connector);
  }

  /**
   * Get first available connector with capability
   */
  getFirstByCapability(capability: ConnectorCapability): IPSSConnector | INDCConnector | IDCSConnector | undefined {
    const connectors = this.getByCapability(capability);

    // If failover is enabled, skip unhealthy connectors
    if (this.config.enableFailover) {
      for (const connector of connectors) {
        if (this.healthStatus.get(connector.providerId) !== false) {
          return connector;
        }
      }
    }

    return connectors[0];
  }

  /**
   * Get all PSS connectors
   */
  getAllPSS(): IPSSConnector[] {
    return Array.from(this.connectors.values())
      .filter((entry) => entry.type === 'pss' && entry.enabled)
      .sort((a, b) => b.priority - a.priority)
      .map((entry) => entry.connector as IPSSConnector);
  }

  /**
   * Get all NDC connectors
   */
  getAllNDC(): INDCConnector[] {
    return Array.from(this.connectors.values())
      .filter((entry) => entry.type === 'ndc' && entry.enabled)
      .sort((a, b) => b.priority - a.priority)
      .map((entry) => entry.connector as INDCConnector);
  }

  /**
   * Get all DCS connectors
   */
  getAllDCS(): IDCSConnector[] {
    return Array.from(this.connectors.values())
      .filter((entry) => entry.type === 'dcs' && entry.enabled)
      .sort((a, b) => b.priority - a.priority)
      .map((entry) => entry.connector as IDCSConnector);
  }

  /**
   * List all registered provider IDs
   */
  listProviders(): string[] {
    return Array.from(this.connectors.keys());
  }

  // ============================================================================
  // MANAGEMENT
  // ============================================================================

  /**
   * Enable a connector
   */
  enable(providerId: string): void {
    const entry = this.connectors.get(providerId);
    if (entry) {
      entry.enabled = true;
    }
  }

  /**
   * Disable a connector
   */
  disable(providerId: string): void {
    const entry = this.connectors.get(providerId);
    if (entry) {
      entry.enabled = false;
    }
  }

  /**
   * Set connector priority
   */
  setPriority(providerId: string, priority: number): void {
    const entry = this.connectors.get(providerId);
    if (entry) {
      entry.priority = priority;
    }
  }

  /**
   * Get connector info
   */
  getInfo(providerId: string): {
    type: string;
    capabilities: ConnectorCapability[];
    priority: number;
    enabled: boolean;
    healthy: boolean;
  } | undefined {
    const entry = this.connectors.get(providerId);
    if (!entry) return undefined;

    return {
      type: entry.type,
      capabilities: entry.capabilities,
      priority: entry.priority,
      enabled: entry.enabled,
      healthy: this.healthStatus.get(providerId) ?? false,
    };
  }

  // ============================================================================
  // HEALTH CHECKS
  // ============================================================================

  /**
   * Start periodic health checks
   */
  startHealthChecks(): void {
    if (this.healthCheckTimer) return;

    this.healthCheckTimer = setInterval(
      () => this.runHealthChecks(),
      this.config.healthCheckInterval
    );

    // Run initial check
    this.runHealthChecks();
  }

  /**
   * Stop periodic health checks
   */
  stopHealthChecks(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }
  }

  /**
   * Run health checks on all connectors
   */
  async runHealthChecks(): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();

    const checks = Array.from(this.connectors.entries()).map(
      async ([providerId, entry]) => {
        try {
          const healthy = await entry.connector.healthCheck();
          this.healthStatus.set(providerId, healthy);
          results.set(providerId, healthy);
        } catch {
          this.healthStatus.set(providerId, false);
          results.set(providerId, false);
        }
      }
    );

    await Promise.all(checks);
    return results;
  }

  /**
   * Check if a connector is healthy
   */
  isHealthy(providerId: string): boolean {
    return this.healthStatus.get(providerId) ?? false;
  }

  /**
   * Mark connector as unhealthy (for failover)
   */
  markUnhealthy(providerId: string): void {
    this.healthStatus.set(providerId, false);
  }

  /**
   * Mark connector as healthy
   */
  markHealthy(providerId: string): void {
    this.healthStatus.set(providerId, true);
  }

  // ============================================================================
  // FAILOVER EXECUTION
  // ============================================================================

  /**
   * Execute operation with automatic failover
   */
  async executeWithFailover<T>(
    capability: ConnectorCapability,
    operation: (connector: IPSSConnector | INDCConnector | IDCSConnector) => Promise<T>
  ): Promise<T> {
    const connectors = this.getByCapability(capability);

    if (connectors.length === 0) {
      throw new Error(`No connectors available for capability: ${capability}`);
    }

    let lastError: Error | undefined;

    for (const connector of connectors) {
      // Skip unhealthy connectors
      if (!this.isHealthy(connector.providerId)) {
        continue;
      }

      for (let attempt = 0; attempt <= this.config.failoverRetries; attempt++) {
        try {
          return await operation(connector);
        } catch (error) {
          lastError = error instanceof Error ? error : new Error('Unknown error');

          // If all retries exhausted, mark as unhealthy and try next connector
          if (attempt === this.config.failoverRetries) {
            this.markUnhealthy(connector.providerId);
          }
        }
      }
    }

    throw lastError || new Error('All connectors failed');
  }

  // ============================================================================
  // CLEANUP
  // ============================================================================

  /**
   * Clear all registered connectors
   */
  clear(): void {
    this.stopHealthChecks();
    this.connectors.clear();
    this.healthStatus.clear();
  }

  /**
   * Dispose of the registry
   */
  dispose(): void {
    this.clear();
  }
}

// Default registry instance
let defaultRegistry: PSSConnectorRegistry | undefined;

/**
 * Get the default registry instance
 */
export function getDefaultRegistry(): PSSConnectorRegistry {
  if (!defaultRegistry) {
    defaultRegistry = new PSSConnectorRegistry();
  }
  return defaultRegistry;
}

/**
 * Set the default registry instance
 */
export function setDefaultRegistry(registry: PSSConnectorRegistry): void {
  defaultRegistry = registry;
}
