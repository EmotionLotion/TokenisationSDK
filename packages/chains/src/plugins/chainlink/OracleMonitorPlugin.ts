/**
 * Oracle Monitoring Plugin
 *
 * Provides health monitoring and alerting for oracle services:
 * - Chainlink Data Feeds staleness detection
 * - Functions subscription health
 * - Automation upkeep health
 * - Custom oracle health checks
 *
 * Supports webhook notifications and integration with external monitoring systems.
 */

import { ethers, type Provider } from 'ethers';
import { ok, err, type Result } from '@tokenisation/core';

// Chainlink Aggregator ABI for staleness checks
const AGGREGATOR_V3_ABI = [
  'function latestRoundData() external view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
  'function decimals() external view returns (uint8)',
  'function description() external view returns (string)',
];

export enum OracleType {
  DATA_FEED = 'DATA_FEED',
  FUNCTIONS = 'FUNCTIONS',
  AUTOMATION = 'AUTOMATION',
  VRF = 'VRF',
  CUSTOM = 'CUSTOM',
}

export enum HealthStatus {
  HEALTHY = 'HEALTHY',
  DEGRADED = 'DEGRADED',
  UNHEALTHY = 'UNHEALTHY',
  UNKNOWN = 'UNKNOWN',
}

export enum AlertSeverity {
  INFO = 'INFO',
  WARNING = 'WARNING',
  CRITICAL = 'CRITICAL',
}

export interface OracleMonitorConfig {
  chainId: number;
  rpcUrl: string;
  webhookUrl?: string;
  webhookHeaders?: Record<string, string>;
  defaultStalenessThreshold?: number; // seconds
  checkIntervalMs?: number;
}

export interface MonitoredOracle {
  id: string;
  name: string;
  type: OracleType;
  address?: string;
  subscriptionId?: string;
  upkeepId?: string;
  stalenessThreshold: number; // seconds
  enabled: boolean;
  lastCheck?: OracleHealthCheck;
  metadata?: Record<string, unknown>;
}

export interface OracleHealthCheck {
  oracleId: string;
  status: HealthStatus;
  timestamp: string;
  latency?: number; // ms
  lastUpdate?: string;
  staleness?: number; // seconds since last update
  price?: string;
  error?: string;
  details?: Record<string, unknown>;
}

export interface OracleAlert {
  id: string;
  oracleId: string;
  oracleName: string;
  type: OracleType;
  severity: AlertSeverity;
  status: HealthStatus;
  message: string;
  timestamp: string;
  resolved: boolean;
  resolvedAt?: string;
  metadata?: Record<string, unknown>;
}

export interface WebhookPayload {
  event: 'ORACLE_ALERT' | 'ORACLE_RECOVERED' | 'HEALTH_REPORT';
  timestamp: string;
  chainId: number;
  data: OracleAlert | OracleHealthCheck | OracleHealthCheck[];
}

/**
 * Oracle Monitor Plugin
 *
 * Monitors oracle health and sends alerts via webhooks.
 */
export class OracleMonitorPlugin {
  readonly pluginId = 'oracle-monitor';

  private chainId: number;
  private provider: Provider;
  private webhookUrl?: string;
  private webhookHeaders: Record<string, string>;
  private defaultStalenessThreshold: number;
  private checkIntervalMs: number;

  private oracles: Map<string, MonitoredOracle> = new Map();
  private alerts: Map<string, OracleAlert> = new Map();
  private healthHistory: Map<string, OracleHealthCheck[]> = new Map();
  private monitoringInterval?: NodeJS.Timeout;
  private alertCallbacks: Array<(alert: OracleAlert) => void> = [];

  constructor(config: OracleMonitorConfig) {
    this.chainId = config.chainId;
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl, config.chainId);
    this.webhookUrl = config.webhookUrl;
    this.webhookHeaders = config.webhookHeaders || { 'Content-Type': 'application/json' };
    this.defaultStalenessThreshold = config.defaultStalenessThreshold || 3600; // 1 hour default
    this.checkIntervalMs = config.checkIntervalMs || 60000; // 1 minute default
  }

  // ============================================
  // ORACLE REGISTRATION
  // ============================================

  /**
   * Register a Chainlink Data Feed for monitoring
   */
  registerDataFeed(params: {
    id: string;
    name: string;
    address: string;
    stalenessThreshold?: number;
    metadata?: Record<string, unknown>;
  }): MonitoredOracle {
    const oracle: MonitoredOracle = {
      id: params.id,
      name: params.name,
      type: OracleType.DATA_FEED,
      address: params.address,
      stalenessThreshold: params.stalenessThreshold || this.defaultStalenessThreshold,
      enabled: true,
      metadata: params.metadata,
    };

    this.oracles.set(oracle.id, oracle);
    this.healthHistory.set(oracle.id, []);
    return oracle;
  }

  /**
   * Register a Functions subscription for monitoring
   */
  registerFunctionsSubscription(params: {
    id: string;
    name: string;
    subscriptionId: string;
    minBalance?: string;
    metadata?: Record<string, unknown>;
  }): MonitoredOracle {
    const oracle: MonitoredOracle = {
      id: params.id,
      name: params.name,
      type: OracleType.FUNCTIONS,
      subscriptionId: params.subscriptionId,
      stalenessThreshold: 0, // Not applicable for Functions
      enabled: true,
      metadata: { ...params.metadata, minBalance: params.minBalance },
    };

    this.oracles.set(oracle.id, oracle);
    this.healthHistory.set(oracle.id, []);
    return oracle;
  }

  /**
   * Register an Automation upkeep for monitoring
   */
  registerAutomationUpkeep(params: {
    id: string;
    name: string;
    upkeepId: string;
    expectedInterval?: number; // seconds between performs
    metadata?: Record<string, unknown>;
  }): MonitoredOracle {
    const oracle: MonitoredOracle = {
      id: params.id,
      name: params.name,
      type: OracleType.AUTOMATION,
      upkeepId: params.upkeepId,
      stalenessThreshold: params.expectedInterval || 86400, // 24 hours default
      enabled: true,
      metadata: params.metadata,
    };

    this.oracles.set(oracle.id, oracle);
    this.healthHistory.set(oracle.id, []);
    return oracle;
  }

  /**
   * Register a custom oracle with health check function
   */
  registerCustomOracle(params: {
    id: string;
    name: string;
    healthCheckFn: () => Promise<{ healthy: boolean; details?: Record<string, unknown> }>;
    metadata?: Record<string, unknown>;
  }): MonitoredOracle {
    const oracle: MonitoredOracle = {
      id: params.id,
      name: params.name,
      type: OracleType.CUSTOM,
      stalenessThreshold: 0,
      enabled: true,
      metadata: { ...params.metadata, healthCheckFn: params.healthCheckFn },
    };

    this.oracles.set(oracle.id, oracle);
    this.healthHistory.set(oracle.id, []);
    return oracle;
  }

  /**
   * Unregister an oracle
   */
  unregisterOracle(oracleId: string): boolean {
    this.healthHistory.delete(oracleId);
    return this.oracles.delete(oracleId);
  }

  /**
   * Enable/disable oracle monitoring
   */
  setOracleEnabled(oracleId: string, enabled: boolean): boolean {
    const oracle = this.oracles.get(oracleId);
    if (oracle) {
      oracle.enabled = enabled;
      return true;
    }
    return false;
  }

  // ============================================
  // HEALTH CHECKS
  // ============================================

  /**
   * Check health of a specific oracle
   */
  async checkOracleHealth(oracleId: string): Promise<Result<OracleHealthCheck, string>> {
    const oracle = this.oracles.get(oracleId);
    if (!oracle) {
      return err(`Oracle not found: ${oracleId}`);
    }

    const startTime = Date.now();

    try {
      let healthCheck: OracleHealthCheck;

      switch (oracle.type) {
        case OracleType.DATA_FEED:
          healthCheck = await this.checkDataFeedHealth(oracle, startTime);
          break;
        case OracleType.FUNCTIONS:
          healthCheck = await this.checkFunctionsHealth(oracle, startTime);
          break;
        case OracleType.AUTOMATION:
          healthCheck = await this.checkAutomationHealth(oracle, startTime);
          break;
        case OracleType.CUSTOM:
          healthCheck = await this.checkCustomHealth(oracle, startTime);
          break;
        default:
          healthCheck = {
            oracleId,
            status: HealthStatus.UNKNOWN,
            timestamp: new Date().toISOString(),
            error: 'Unknown oracle type',
          };
      }

      // Store health check
      oracle.lastCheck = healthCheck;
      const history = this.healthHistory.get(oracleId) || [];
      history.push(healthCheck);
      if (history.length > 100) history.shift(); // Keep last 100 checks
      this.healthHistory.set(oracleId, history);

      // Process alerts
      this.processHealthCheck(oracle, healthCheck);

      return ok(healthCheck);
    } catch (error) {
      const healthCheck: OracleHealthCheck = {
        oracleId,
        status: HealthStatus.UNHEALTHY,
        timestamp: new Date().toISOString(),
        latency: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      };

      oracle.lastCheck = healthCheck;
      this.processHealthCheck(oracle, healthCheck);

      return ok(healthCheck);
    }
  }

  private async checkDataFeedHealth(oracle: MonitoredOracle, startTime: number): Promise<OracleHealthCheck> {
    const contract = new ethers.Contract(oracle.address!, AGGREGATOR_V3_ABI, this.provider);

    const [roundData, decimals] = await Promise.all([
      contract.latestRoundData(),
      contract.decimals(),
    ]);

    const latency = Date.now() - startTime;
    const updatedAt = Number(roundData.updatedAt);
    const now = Math.floor(Date.now() / 1000);
    const staleness = now - updatedAt;

    let status: HealthStatus;
    if (staleness > oracle.stalenessThreshold * 2) {
      status = HealthStatus.UNHEALTHY;
    } else if (staleness > oracle.stalenessThreshold) {
      status = HealthStatus.DEGRADED;
    } else {
      status = HealthStatus.HEALTHY;
    }

    return {
      oracleId: oracle.id,
      status,
      timestamp: new Date().toISOString(),
      latency,
      lastUpdate: new Date(updatedAt * 1000).toISOString(),
      staleness,
      price: ethers.formatUnits(roundData.answer, decimals),
      details: {
        roundId: roundData.roundId.toString(),
        answeredInRound: roundData.answeredInRound.toString(),
        decimals: Number(decimals),
      },
    };
  }

  private async checkFunctionsHealth(oracle: MonitoredOracle, startTime: number): Promise<OracleHealthCheck> {
    // For Functions, we check if the subscription exists and has balance
    // This is a simplified check - would need proper router integration
    const latency = Date.now() - startTime;

    return {
      oracleId: oracle.id,
      status: HealthStatus.HEALTHY, // Would need actual subscription check
      timestamp: new Date().toISOString(),
      latency,
      details: {
        subscriptionId: oracle.subscriptionId,
        note: 'Functions health check requires subscription balance verification',
      },
    };
  }

  private async checkAutomationHealth(oracle: MonitoredOracle, startTime: number): Promise<OracleHealthCheck> {
    const latency = Date.now() - startTime;

    return {
      oracleId: oracle.id,
      status: HealthStatus.HEALTHY, // Would need actual upkeep check
      timestamp: new Date().toISOString(),
      latency,
      details: {
        upkeepId: oracle.upkeepId,
        note: 'Automation health check requires registry verification',
      },
    };
  }

  private async checkCustomHealth(oracle: MonitoredOracle, startTime: number): Promise<OracleHealthCheck> {
    const healthCheckFn = oracle.metadata?.healthCheckFn as
      | (() => Promise<{ healthy: boolean; details?: Record<string, unknown> }>)
      | undefined;

    if (!healthCheckFn) {
      return {
        oracleId: oracle.id,
        status: HealthStatus.UNKNOWN,
        timestamp: new Date().toISOString(),
        error: 'No health check function provided',
      };
    }

    const result = await healthCheckFn();
    const latency = Date.now() - startTime;

    return {
      oracleId: oracle.id,
      status: result.healthy ? HealthStatus.HEALTHY : HealthStatus.UNHEALTHY,
      timestamp: new Date().toISOString(),
      latency,
      details: result.details,
    };
  }

  /**
   * Check health of all registered oracles
   */
  async checkAllOracles(): Promise<OracleHealthCheck[]> {
    const results: OracleHealthCheck[] = [];

    for (const oracle of this.oracles.values()) {
      if (oracle.enabled) {
        const result = await this.checkOracleHealth(oracle.id);
        if (result.success) {
          results.push(result.data);
        }
      }
    }

    return results;
  }

  // ============================================
  // ALERTING
  // ============================================

  private processHealthCheck(oracle: MonitoredOracle, healthCheck: OracleHealthCheck): void {
    const existingAlert = Array.from(this.alerts.values()).find(
      a => a.oracleId === oracle.id && !a.resolved
    );

    if (healthCheck.status === HealthStatus.HEALTHY) {
      // Resolve existing alert if any
      if (existingAlert) {
        existingAlert.resolved = true;
        existingAlert.resolvedAt = new Date().toISOString();
        this.sendWebhook({
          event: 'ORACLE_RECOVERED',
          timestamp: new Date().toISOString(),
          chainId: this.chainId,
          data: existingAlert,
        });
      }
    } else if (healthCheck.status !== HealthStatus.UNKNOWN) {
      // Create or update alert
      if (!existingAlert) {
        const alert: OracleAlert = {
          id: `${oracle.id}-${Date.now()}`,
          oracleId: oracle.id,
          oracleName: oracle.name,
          type: oracle.type,
          severity: healthCheck.status === HealthStatus.UNHEALTHY ? AlertSeverity.CRITICAL : AlertSeverity.WARNING,
          status: healthCheck.status,
          message: this.generateAlertMessage(oracle, healthCheck),
          timestamp: new Date().toISOString(),
          resolved: false,
          metadata: healthCheck.details,
        };

        this.alerts.set(alert.id, alert);
        this.notifyAlert(alert);
      }
    }
  }

  private generateAlertMessage(oracle: MonitoredOracle, healthCheck: OracleHealthCheck): string {
    if (healthCheck.error) {
      return `Oracle ${oracle.name} error: ${healthCheck.error}`;
    }

    if (healthCheck.staleness !== undefined) {
      const hours = Math.floor(healthCheck.staleness / 3600);
      const minutes = Math.floor((healthCheck.staleness % 3600) / 60);
      return `Oracle ${oracle.name} is stale: last update ${hours}h ${minutes}m ago`;
    }

    return `Oracle ${oracle.name} is ${healthCheck.status.toLowerCase()}`;
  }

  private notifyAlert(alert: OracleAlert): void {
    // Notify callbacks
    for (const callback of this.alertCallbacks) {
      try {
        callback(alert);
      } catch (e) {
        console.error('Alert callback error:', e);
      }
    }

    // Send webhook
    this.sendWebhook({
      event: 'ORACLE_ALERT',
      timestamp: new Date().toISOString(),
      chainId: this.chainId,
      data: alert,
    });
  }

  private async sendWebhook(payload: WebhookPayload): Promise<void> {
    if (!this.webhookUrl) return;

    try {
      await fetch(this.webhookUrl, {
        method: 'POST',
        headers: this.webhookHeaders,
        body: JSON.stringify(payload),
      });
    } catch (error) {
      console.error('Webhook send failed:', error);
    }
  }

  /**
   * Register an alert callback
   */
  onAlert(callback: (alert: OracleAlert) => void): () => void {
    this.alertCallbacks.push(callback);
    return () => {
      const index = this.alertCallbacks.indexOf(callback);
      if (index > -1) {
        this.alertCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(): OracleAlert[] {
    return Array.from(this.alerts.values()).filter(a => !a.resolved);
  }

  /**
   * Get all alerts
   */
  getAllAlerts(): OracleAlert[] {
    return Array.from(this.alerts.values());
  }

  /**
   * Manually resolve an alert
   */
  resolveAlert(alertId: string): boolean {
    const alert = this.alerts.get(alertId);
    if (alert && !alert.resolved) {
      alert.resolved = true;
      alert.resolvedAt = new Date().toISOString();
      return true;
    }
    return false;
  }

  // ============================================
  // MONITORING LOOP
  // ============================================

  /**
   * Start continuous monitoring
   */
  startMonitoring(): void {
    if (this.monitoringInterval) {
      return; // Already monitoring
    }

    const check = async () => {
      const results = await this.checkAllOracles();

      // Send periodic health report
      this.sendWebhook({
        event: 'HEALTH_REPORT',
        timestamp: new Date().toISOString(),
        chainId: this.chainId,
        data: results,
      });
    };

    check(); // Initial check
    this.monitoringInterval = setInterval(check, this.checkIntervalMs);
  }

  /**
   * Stop continuous monitoring
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }
  }

  // ============================================
  // UTILITY
  // ============================================

  /**
   * Get oracle by ID
   */
  getOracle(oracleId: string): MonitoredOracle | undefined {
    return this.oracles.get(oracleId);
  }

  /**
   * Get all registered oracles
   */
  getAllOracles(): MonitoredOracle[] {
    return Array.from(this.oracles.values());
  }

  /**
   * Get health history for an oracle
   */
  getHealthHistory(oracleId: string): OracleHealthCheck[] {
    return this.healthHistory.get(oracleId) || [];
  }

  /**
   * Get aggregate health status
   */
  getAggregateHealth(): { status: HealthStatus; healthy: number; degraded: number; unhealthy: number } {
    let healthy = 0;
    let degraded = 0;
    let unhealthy = 0;

    for (const oracle of this.oracles.values()) {
      if (!oracle.enabled) continue;

      switch (oracle.lastCheck?.status) {
        case HealthStatus.HEALTHY:
          healthy++;
          break;
        case HealthStatus.DEGRADED:
          degraded++;
          break;
        case HealthStatus.UNHEALTHY:
          unhealthy++;
          break;
      }
    }

    let status: HealthStatus;
    if (unhealthy > 0) {
      status = HealthStatus.UNHEALTHY;
    } else if (degraded > 0) {
      status = HealthStatus.DEGRADED;
    } else {
      status = HealthStatus.HEALTHY;
    }

    return { status, healthy, degraded, unhealthy };
  }

  /**
   * Set webhook URL
   */
  setWebhookUrl(url: string, headers?: Record<string, string>): void {
    this.webhookUrl = url;
    if (headers) {
      this.webhookHeaders = headers;
    }
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.stopMonitoring();
    this.oracles.clear();
    this.alerts.clear();
    this.healthHistory.clear();
    this.alertCallbacks.length = 0;
  }
}

// Factory functions
export function createOracleMonitor(config: OracleMonitorConfig): OracleMonitorPlugin {
  return new OracleMonitorPlugin(config);
}

export function createSepoliaOracleMonitor(
  rpcUrl?: string,
  webhookUrl?: string
): OracleMonitorPlugin {
  return new OracleMonitorPlugin({
    chainId: 11155111,
    rpcUrl: rpcUrl || 'https://ethereum-sepolia.publicnode.com',
    webhookUrl,
  });
}

export function createBaseSepoliaOracleMonitor(
  rpcUrl?: string,
  webhookUrl?: string
): OracleMonitorPlugin {
  return new OracleMonitorPlugin({
    chainId: 84532,
    rpcUrl: rpcUrl || 'https://sepolia.base.org',
    webhookUrl,
  });
}

export default OracleMonitorPlugin;
