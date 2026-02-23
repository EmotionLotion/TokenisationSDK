/**
 * Health Check Service
 *
 * Provides health and readiness endpoints for production monitoring.
 * Compatible with Kubernetes probes and load balancer health checks.
 */

import { getObservability, type ILogger, type IMetrics } from '../core/Observability.js';

// ============================================================================
// TYPES
// ============================================================================

export enum ServiceHealthStatus {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  UNHEALTHY = 'unhealthy',
}

export interface ComponentHealth {
  name: string;
  status: ServiceHealthStatus;
  message?: string;
  latencyMs?: number;
  lastChecked: string;
}

export interface HealthReport {
  status: ServiceHealthStatus;
  version: string;
  uptime: number;
  timestamp: string;
  components: ComponentHealth[];
  metadata?: Record<string, unknown>;
}

export interface HealthCheckOptions {
  /** Component name */
  name: string;
  /** Check function - returns true if healthy */
  check: () => Promise<boolean> | boolean;
  /** Timeout for check in ms (default: 5000) */
  timeoutMs?: number;
  /** Whether this component is critical (affects overall status) */
  critical?: boolean;
}

// ============================================================================
// HEALTH CHECK SERVICE
// ============================================================================

export class HealthCheckService {
  private checks: Map<string, HealthCheckOptions> = new Map();
  private startTime: number;
  private version: string;
  private logger: ILogger;
  private metrics: IMetrics;
  private lastReport?: HealthReport;

  constructor(options: { version?: string } = {}) {
    this.startTime = Date.now();
    this.version = options.version ?? '1.0.0';
    const obs = getObservability();
    this.logger = obs.logger.child({ component: 'HealthCheck' });
    this.metrics = obs.metrics;
  }

  /**
   * Register a health check
   */
  register(options: HealthCheckOptions): void {
    this.checks.set(options.name, {
      ...options,
      timeoutMs: options.timeoutMs ?? 5000,
      critical: options.critical ?? true,
    });
    this.logger.debug(`Registered health check: ${options.name}`);
  }

  /**
   * Unregister a health check
   */
  unregister(name: string): boolean {
    return this.checks.delete(name);
  }

  /**
   * Run a single health check
   */
  private async runCheck(options: HealthCheckOptions): Promise<ComponentHealth> {
    const start = Date.now();
    const result: ComponentHealth = {
      name: options.name,
      status: ServiceHealthStatus.UNHEALTHY,
      lastChecked: new Date().toISOString(),
    };

    try {
      const checkPromise = Promise.resolve(options.check());
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Check timed out')), options.timeoutMs);
      });

      const healthy = await Promise.race([checkPromise, timeoutPromise]);
      result.status = healthy ? ServiceHealthStatus.HEALTHY : ServiceHealthStatus.UNHEALTHY;
      result.latencyMs = Date.now() - start;

      if (!healthy) {
        result.message = 'Check returned false';
      }
    } catch (error) {
      result.status = ServiceHealthStatus.UNHEALTHY;
      result.message = error instanceof Error ? error.message : 'Unknown error';
      result.latencyMs = Date.now() - start;
    }

    // Record metrics
    this.metrics.gauge('health_check_status', result.status === ServiceHealthStatus.HEALTHY ? 1 : 0, {
      component: options.name,
    });
    if (result.latencyMs !== undefined) {
      this.metrics.histogram('health_check_latency_ms', result.latencyMs, {
        component: options.name,
      });
    }

    return result;
  }

  /**
   * Run all health checks and generate report
   */
  async check(): Promise<HealthReport> {
    const components: ComponentHealth[] = [];
    let overallStatus = ServiceHealthStatus.HEALTHY;

    for (const [, options] of this.checks) {
      const result = await this.runCheck(options);
      components.push(result);

      // Update overall status based on component status and criticality
      if (result.status === ServiceHealthStatus.UNHEALTHY && options.critical) {
        overallStatus = ServiceHealthStatus.UNHEALTHY;
      } else if (result.status === ServiceHealthStatus.DEGRADED && overallStatus !== ServiceHealthStatus.UNHEALTHY) {
        overallStatus = ServiceHealthStatus.DEGRADED;
      }
    }

    const report: HealthReport = {
      status: overallStatus,
      version: this.version,
      uptime: Date.now() - this.startTime,
      timestamp: new Date().toISOString(),
      components,
    };

    this.lastReport = report;
    this.metrics.gauge('health_status', overallStatus === ServiceHealthStatus.HEALTHY ? 1 : 0);

    return report;
  }

  /**
   * Quick liveness check (just verifies the service is running)
   */
  liveness(): { status: 'ok'; uptime: number } {
    return {
      status: 'ok',
      uptime: Date.now() - this.startTime,
    };
  }

  /**
   * Readiness check (verifies the service is ready to accept traffic)
   */
  async readiness(): Promise<{ ready: boolean; status: ServiceHealthStatus }> {
    const report = await this.check();
    return {
      ready: report.status !== ServiceHealthStatus.UNHEALTHY,
      status: report.status,
    };
  }

  /**
   * Get last health report without running checks
   */
  getLastReport(): HealthReport | undefined {
    return this.lastReport;
  }

  /**
   * Get uptime in milliseconds
   */
  getUptime(): number {
    return Date.now() - this.startTime;
  }

  /**
   * Create HTTP handler for health endpoints (Express/Koa compatible)
   */
  createHandler(): {
    health: () => Promise<HealthReport>;
    liveness: () => { status: 'ok'; uptime: number };
    readiness: () => Promise<{ ready: boolean; status: ServiceHealthStatus }>;
  } {
    return {
      health: () => this.check(),
      liveness: () => this.liveness(),
      readiness: () => this.readiness(),
    };
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let defaultHealthCheck: HealthCheckService | undefined;

export function getHealthCheck(): HealthCheckService {
  if (!defaultHealthCheck) {
    defaultHealthCheck = new HealthCheckService();
  }
  return defaultHealthCheck;
}

export function configureHealthCheck(options: { version?: string }): HealthCheckService {
  defaultHealthCheck = new HealthCheckService(options);
  return defaultHealthCheck;
}

// ============================================================================
// COMMON HEALTH CHECKS
// ============================================================================

/**
 * Create a database connection health check
 */
export function createDatabaseCheck(
  name: string,
  pingFn: () => Promise<boolean>
): HealthCheckOptions {
  return {
    name,
    check: pingFn,
    timeoutMs: 5000,
    critical: true,
  };
}

/**
 * Create an external API health check
 */
export function createApiCheck(
  name: string,
  healthUrl: string,
  options?: { timeoutMs?: number; critical?: boolean }
): HealthCheckOptions {
  return {
    name,
    check: async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), options?.timeoutMs ?? 5000);

        const response = await fetch(healthUrl, {
          method: 'GET',
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        return response.ok;
      } catch {
        return false;
      }
    },
    timeoutMs: options?.timeoutMs ?? 5000,
    critical: options?.critical ?? false,
  };
}

/**
 * Create a memory usage health check
 */
export function createMemoryCheck(
  maxHeapUsedPercent: number = 90
): HealthCheckOptions {
  return {
    name: 'memory',
    check: () => {
      if (typeof process !== 'undefined' && process.memoryUsage) {
        const usage = process.memoryUsage();
        const heapUsedPercent = (usage.heapUsed / usage.heapTotal) * 100;
        return heapUsedPercent < maxHeapUsedPercent;
      }
      return true;
    },
    critical: false,
  };
}

/**
 * Create a disk space health check (Node.js only)
 */
export function createDiskCheck(
  path: string = '/',
  minFreePercent: number = 10
): HealthCheckOptions {
  return {
    name: 'disk',
    check: async () => {
      // This would require fs.statfs in Node.js 18.15+
      // For now, always return true as a placeholder
      return true;
    },
    critical: false,
  };
}

export default HealthCheckService;
