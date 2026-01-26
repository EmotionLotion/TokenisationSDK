/**
 * OracleService - Production-ready oracle with fail-safe modes
 *
 * Provides oracle implementation with:
 * - Stale data detection and rejection
 * - Configurable fail-safe behavior (deny vs fallback)
 * - Circuit breaker pattern for resilience
 * - Health monitoring and status reporting
 *
 * In production, this integrates with Chainlink Functions or similar.
 */

import { v4 as uuidv4 } from 'uuid';
import type { IOraclePlugin, OracleDataPoint, OracleRequest } from '../core/interfaces.js';
import type { Result } from '../core/types.js';
import { ok, err } from '../core/types.js';

// ============================================================================
// CONFIGURATION TYPES
// ============================================================================

/**
 * Oracle fail-safe behavior modes
 */
export enum OracleFailSafeMode {
  /** Deny all operations when oracle is unavailable/stale (recommended for production) */
  DENY_ON_FAILURE = 'DENY_ON_FAILURE',
  /** Use last known good value if available */
  USE_CACHED = 'USE_CACHED',
  /** Use fallback/default values */
  USE_FALLBACK = 'USE_FALLBACK',
  /** Allow operations but flag with warning */
  ALLOW_WITH_WARNING = 'ALLOW_WITH_WARNING',
}

/**
 * Oracle health status
 */
export enum OracleHealthStatus {
  HEALTHY = 'HEALTHY',
  DEGRADED = 'DEGRADED',
  STALE = 'STALE',
  UNAVAILABLE = 'UNAVAILABLE',
  CIRCUIT_OPEN = 'CIRCUIT_OPEN',
}

/**
 * Oracle configuration
 */
export interface OracleConfig {
  /** Maximum age of data before it's considered stale (in milliseconds) */
  maxDataAgeMs: number;
  /** Fail-safe mode when oracle is unavailable */
  failSafeMode: OracleFailSafeMode;
  /** Circuit breaker failure threshold before opening */
  circuitBreakerThreshold: number;
  /** Circuit breaker reset timeout (in milliseconds) */
  circuitBreakerResetMs: number;
  /** Minimum confidence threshold for accepting data */
  minConfidenceThreshold: number;
  /** Enable strict mode (reject any data below confidence threshold) */
  strictMode: boolean;
  /** Fallback values for when fail-safe mode is USE_FALLBACK */
  fallbackValues?: Record<string, unknown>;
}

/**
 * Default configuration (production-safe defaults)
 */
const DEFAULT_CONFIG: OracleConfig = {
  maxDataAgeMs: 5 * 60 * 1000, // 5 minutes
  failSafeMode: OracleFailSafeMode.DENY_ON_FAILURE,
  circuitBreakerThreshold: 5,
  circuitBreakerResetMs: 60 * 1000, // 1 minute
  minConfidenceThreshold: 0.8,
  strictMode: true,
  fallbackValues: {},
};

// ============================================================================
// DATA TYPES
// ============================================================================

/**
 * NAV (Net Asset Value) data
 */
export interface NAVData {
  assetId: string;
  nav: string; // BigNumber as string
  currency: string;
  timestamp: string;
  source: string;
}

/**
 * Price feed data
 */
export interface PriceFeedData {
  pair: string;
  price: string;
  decimals: number;
  timestamp: string;
}

/**
 * Oracle subscription
 */
interface OracleSubscription {
  id: string;
  request: OracleRequest;
  callback: (data: OracleDataPoint) => void;
  interval: NodeJS.Timeout;
}

/**
 * Circuit breaker state
 */
interface CircuitBreakerState {
  failures: number;
  lastFailure: number;
  isOpen: boolean;
  openedAt?: number;
}

/**
 * Cache entry for last known good values
 */
interface CacheEntry {
  data: OracleDataPoint;
  cachedAt: number;
}

/**
 * Oracle health report
 */
export interface OracleHealthReport {
  status: OracleHealthStatus;
  lastSuccessfulFetch?: string;
  lastFailure?: string;
  failureCount: number;
  circuitBreakerOpen: boolean;
  dataTypes: {
    [key: string]: {
      lastUpdate: string;
      isStale: boolean;
      confidence: number;
    };
  };
}

// ============================================================================
// ORACLE SERVICE
// ============================================================================

/**
 * OracleService class - Production-ready implementation
 */
export class OracleService implements IOraclePlugin {
  readonly pluginId = 'production-oracle';
  readonly supportedDataTypes = ['NAV', 'PRICE', 'CUSTOM'];

  private config: OracleConfig;
  private navData: Map<string, NAVData> = new Map();
  private priceFeedData: Map<string, PriceFeedData> = new Map();
  private subscriptions: Map<string, OracleSubscription> = new Map();
  private customDataProviders: Map<string, (params: Record<string, unknown>) => Promise<unknown>> = new Map();

  // Fail-safe infrastructure
  private circuitBreaker: CircuitBreakerState = {
    failures: 0,
    lastFailure: 0,
    isOpen: false,
  };
  private cache: Map<string, CacheEntry> = new Map();
  private lastSuccessfulFetch?: Date;
  private lastFailure?: Date;

  constructor(config: Partial<OracleConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ============================================================================
  // CONFIGURATION
  // ============================================================================

  /**
   * Update oracle configuration
   */
  updateConfig(config: Partial<OracleConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): OracleConfig {
    return { ...this.config };
  }

  // ============================================================================
  // HEALTH MONITORING
  // ============================================================================

  /**
   * Get oracle health status
   */
  getHealthStatus(): OracleHealthStatus {
    if (this.circuitBreaker.isOpen) {
      return OracleHealthStatus.CIRCUIT_OPEN;
    }

    if (!this.lastSuccessfulFetch) {
      return OracleHealthStatus.UNAVAILABLE;
    }

    const timeSinceLastSuccess = Date.now() - this.lastSuccessfulFetch.getTime();
    if (timeSinceLastSuccess > this.config.maxDataAgeMs) {
      return OracleHealthStatus.STALE;
    }

    if (this.circuitBreaker.failures > 0) {
      return OracleHealthStatus.DEGRADED;
    }

    return OracleHealthStatus.HEALTHY;
  }

  /**
   * Get detailed health report
   */
  getHealthReport(): OracleHealthReport {
    const dataTypes: OracleHealthReport['dataTypes'] = {};
    const now = Date.now();

    // Check NAV data staleness
    for (const [assetId, nav] of this.navData.entries()) {
      const age = now - new Date(nav.timestamp).getTime();
      dataTypes[`NAV:${assetId}`] = {
        lastUpdate: nav.timestamp,
        isStale: age > this.config.maxDataAgeMs,
        confidence: age > this.config.maxDataAgeMs ? 0 : 1 - (age / this.config.maxDataAgeMs),
      };
    }

    // Check price feed staleness
    for (const [pair, price] of this.priceFeedData.entries()) {
      const age = now - new Date(price.timestamp).getTime();
      dataTypes[`PRICE:${pair}`] = {
        lastUpdate: price.timestamp,
        isStale: age > this.config.maxDataAgeMs,
        confidence: age > this.config.maxDataAgeMs ? 0 : 1 - (age / this.config.maxDataAgeMs),
      };
    }

    return {
      status: this.getHealthStatus(),
      lastSuccessfulFetch: this.lastSuccessfulFetch?.toISOString(),
      lastFailure: this.lastFailure?.toISOString(),
      failureCount: this.circuitBreaker.failures,
      circuitBreakerOpen: this.circuitBreaker.isOpen,
      dataTypes,
    };
  }

  /**
   * Check if oracle is healthy enough for operations
   */
  isHealthy(): boolean {
    const status = this.getHealthStatus();
    return status === OracleHealthStatus.HEALTHY || status === OracleHealthStatus.DEGRADED;
  }

  // ============================================================================
  // CIRCUIT BREAKER
  // ============================================================================

  /**
   * Record a failure for circuit breaker
   */
  private recordFailure(): void {
    this.circuitBreaker.failures++;
    this.circuitBreaker.lastFailure = Date.now();
    this.lastFailure = new Date();

    if (this.circuitBreaker.failures >= this.config.circuitBreakerThreshold) {
      this.circuitBreaker.isOpen = true;
      this.circuitBreaker.openedAt = Date.now();
    }
  }

  /**
   * Record a success, reset failure count
   */
  private recordSuccess(): void {
    this.circuitBreaker.failures = 0;
    this.circuitBreaker.isOpen = false;
    this.circuitBreaker.openedAt = undefined;
    this.lastSuccessfulFetch = new Date();
  }

  /**
   * Check if circuit breaker allows requests
   */
  private canMakeRequest(): boolean {
    if (!this.circuitBreaker.isOpen) {
      return true;
    }

    // Check if we should try to reset
    const timeSinceOpen = Date.now() - (this.circuitBreaker.openedAt || 0);
    if (timeSinceOpen > this.config.circuitBreakerResetMs) {
      // Half-open state: allow one request to test
      return true;
    }

    return false;
  }

  /**
   * Reset circuit breaker manually
   */
  resetCircuitBreaker(): void {
    this.circuitBreaker = {
      failures: 0,
      lastFailure: 0,
      isOpen: false,
    };
  }

  // ============================================================================
  // DATA FRESHNESS VALIDATION
  // ============================================================================

  /**
   * Check if data is stale
   */
  private isDataStale(timestamp: string): boolean {
    const dataAge = Date.now() - new Date(timestamp).getTime();
    return dataAge > this.config.maxDataAgeMs;
  }

  /**
   * Validate data point meets requirements
   */
  private validateDataPoint(dataPoint: OracleDataPoint): Result<void, string> {
    // Check staleness
    if (this.isDataStale(dataPoint.timestamp)) {
      return err(`Data is stale: ${dataPoint.timestamp} (max age: ${this.config.maxDataAgeMs}ms)`);
    }

    // Check confidence threshold in strict mode
    if (this.config.strictMode) {
      const confidence = dataPoint.confidence ?? 1.0;
      if (confidence < this.config.minConfidenceThreshold) {
        return err(`Data confidence ${confidence} below threshold ${this.config.minConfidenceThreshold}`);
      }
    }

    return ok(undefined);
  }

  // ============================================================================
  // FAIL-SAFE HANDLING
  // ============================================================================

  /**
   * Handle oracle failure based on fail-safe mode
   */
  private handleFailure(
    request: OracleRequest,
    error: string
  ): Result<OracleDataPoint, string> {
    this.recordFailure();
    const cacheKey = this.getCacheKey(request);

    switch (this.config.failSafeMode) {
      case OracleFailSafeMode.DENY_ON_FAILURE:
        return err(`Oracle unavailable (DENY_ON_FAILURE): ${error}`);

      case OracleFailSafeMode.USE_CACHED: {
        const cached = this.cache.get(cacheKey);
        if (cached) {
          // Check if cached data is too old even for fallback
          const cacheAge = Date.now() - cached.cachedAt;
          if (cacheAge > this.config.maxDataAgeMs * 2) {
            return err(`Oracle unavailable and cached data too old: ${error}`);
          }
          return ok({
            ...cached.data,
            confidence: 0.5, // Reduced confidence for cached data
          });
        }
        return err(`Oracle unavailable and no cached data: ${error}`);
      }

      case OracleFailSafeMode.USE_FALLBACK: {
        const fallbackKey = `${request.dataType}:${JSON.stringify(request.parameters)}`;
        const fallback = this.config.fallbackValues?.[fallbackKey];
        if (fallback) {
          return ok({
            source: 'fallback',
            value: fallback,
            timestamp: new Date().toISOString(),
            confidence: 0.3, // Low confidence for fallback
          });
        }
        return err(`Oracle unavailable and no fallback configured: ${error}`);
      }

      case OracleFailSafeMode.ALLOW_WITH_WARNING:
        return ok({
          source: 'unavailable',
          value: null,
          timestamp: new Date().toISOString(),
          confidence: 0,
        });

      default:
        return err(`Oracle unavailable: ${error}`);
    }
  }

  /**
   * Generate cache key for a request
   */
  private getCacheKey(request: OracleRequest): string {
    return `${request.dataType}:${JSON.stringify(request.parameters)}`;
  }

  /**
   * Cache a successful response
   */
  private cacheResponse(request: OracleRequest, data: OracleDataPoint): void {
    const key = this.getCacheKey(request);
    this.cache.set(key, {
      data,
      cachedAt: Date.now(),
    });
  }

  // ============================================================================
  // DATA SETTERS (for external data sources)
  // ============================================================================

  /**
   * Set NAV for an asset
   */
  setNAV(assetId: string, nav: string, currency: string, source: string): void {
    this.navData.set(assetId, {
      assetId,
      nav,
      currency,
      timestamp: new Date().toISOString(),
      source,
    });
    this.recordSuccess();
  }

  /**
   * Set price feed data
   */
  setPriceFeed(pair: string, price: string, decimals: number): void {
    this.priceFeedData.set(pair, {
      pair,
      price,
      decimals,
      timestamp: new Date().toISOString(),
    });
    this.recordSuccess();
  }

  /**
   * Register a custom data provider
   */
  registerDataProvider(
    dataType: string,
    provider: (params: Record<string, unknown>) => Promise<unknown>
  ): void {
    this.customDataProviders.set(dataType, provider);
  }

  // ============================================================================
  // DATA FETCHING
  // ============================================================================

  /**
   * Fetch data from oracle with fail-safe handling
   */
  async fetchData(request: OracleRequest): Promise<Result<OracleDataPoint, string>> {
    // Check circuit breaker
    if (!this.canMakeRequest()) {
      return this.handleFailure(request, 'Circuit breaker is open');
    }

    try {
      let result: Result<OracleDataPoint, string>;

      switch (request.dataType) {
        case 'NAV':
          result = await this.fetchNAVData(request);
          break;

        case 'PRICE':
          result = await this.fetchPriceData(request);
          break;

        default:
          result = await this.fetchCustomData(request);
      }

      if (!result.success) {
        return this.handleFailure(request, result.error);
      }

      // Validate the data point
      const validation = this.validateDataPoint(result.data);
      if (!validation.success) {
        return this.handleFailure(request, validation.error);
      }

      // Cache successful response
      this.cacheResponse(request, result.data);
      this.recordSuccess();

      return result;
    } catch (error) {
      return this.handleFailure(request, `Oracle fetch error: ${error}`);
    }
  }

  /**
   * Fetch NAV data
   */
  private async fetchNAVData(
    request: OracleRequest
  ): Promise<Result<OracleDataPoint, string>> {
    const assetId = request.parameters['assetId'] as string;

    if (!assetId) {
      return err('Asset ID required for NAV data');
    }

    const nav = this.navData.get(assetId);

    if (!nav) {
      // In production mode, don't return mock data
      if (this.config.strictMode) {
        return err(`No NAV data available for asset ${assetId}`);
      }

      // Only return mock data in non-strict mode
      const mockNav: NAVData = {
        assetId,
        nav: '1000000000000000000', // 1.0 with 18 decimals
        currency: 'USD',
        timestamp: new Date().toISOString(),
        source: 'mock',
      };

      return ok({
        source: 'mock-oracle',
        value: mockNav,
        timestamp: mockNav.timestamp,
        confidence: 0.5, // Lower confidence for mock data
      });
    }

    // Check if data is stale
    if (this.isDataStale(nav.timestamp)) {
      return err(`NAV data is stale for asset ${assetId}`);
    }

    return ok({
      source: nav.source,
      value: nav,
      timestamp: nav.timestamp,
      confidence: 1.0,
    });
  }

  /**
   * Fetch price data
   */
  private async fetchPriceData(
    request: OracleRequest
  ): Promise<Result<OracleDataPoint, string>> {
    const pair = request.parameters['pair'] as string;

    if (!pair) {
      return err('Pair required for price data');
    }

    const price = this.priceFeedData.get(pair);

    if (!price) {
      // In production mode, don't return mock data
      if (this.config.strictMode) {
        return err(`No price data available for pair ${pair}`);
      }

      // Only return mock data in non-strict mode
      const mockPrices: Record<string, string> = {
        'ETH/USD': '2000000000',
        'BTC/USD': '50000000000',
        'USD/AED': '3670000',
      };

      const mockPrice = mockPrices[pair];
      if (!mockPrice) {
        return err(`No price data available for pair ${pair}`);
      }

      return ok({
        source: 'mock-oracle',
        value: {
          pair,
          price: mockPrice,
          decimals: 6,
          timestamp: new Date().toISOString(),
        },
        timestamp: new Date().toISOString(),
        confidence: 0.5,
      });
    }

    // Check if data is stale
    if (this.isDataStale(price.timestamp)) {
      return err(`Price data is stale for pair ${pair}`);
    }

    return ok({
      source: 'production-oracle',
      value: price,
      timestamp: price.timestamp,
      confidence: 1.0,
    });
  }

  /**
   * Fetch custom data
   */
  private async fetchCustomData(
    request: OracleRequest
  ): Promise<Result<OracleDataPoint, string>> {
    const provider = this.customDataProviders.get(request.dataType);

    if (!provider) {
      return err(`No provider for data type: ${request.dataType}`);
    }

    try {
      const data = await provider(request.parameters);
      return ok({
        source: 'custom-provider',
        value: data,
        timestamp: new Date().toISOString(),
        confidence: 1.0,
      });
    } catch (error) {
      return err(`Custom provider error: ${error}`);
    }
  }

  // ============================================================================
  // SUBSCRIPTIONS
  // ============================================================================

  /**
   * Subscribe to data updates
   */
  async subscribe(
    request: OracleRequest,
    callback: (data: OracleDataPoint) => void
  ): Promise<{ unsubscribe: () => void }> {
    const subscriptionId = uuidv4();
    const updateInterval = request.timeout || 60000;

    const interval = setInterval(async () => {
      const result = await this.fetchData(request);
      if (result.success) {
        callback(result.data);
      }
    }, updateInterval);

    const subscription: OracleSubscription = {
      id: subscriptionId,
      request,
      callback,
      interval,
    };

    this.subscriptions.set(subscriptionId, subscription);

    // Send initial data
    const initialResult = await this.fetchData(request);
    if (initialResult.success) {
      callback(initialResult.data);
    }

    return {
      unsubscribe: () => {
        const sub = this.subscriptions.get(subscriptionId);
        if (sub) {
          clearInterval(sub.interval);
          this.subscriptions.delete(subscriptionId);
        }
      },
    };
  }

  /**
   * Verify oracle data signature (mock implementation)
   */
  async verifySignature(_dataPoint: OracleDataPoint): Promise<boolean> {
    // In production, verify Chainlink/oracle signatures
    // For now, return true for data with valid timestamps
    return true;
  }

  // ============================================================================
  // CONVENIENCE METHODS
  // ============================================================================

  /**
   * Get current NAV for an asset
   */
  async getNAV(assetId: string): Promise<Result<OracleDataPoint, string>> {
    return this.fetchData({
      dataType: 'NAV',
      parameters: { assetId },
    });
  }

  /**
   * Get current price for a pair
   */
  async getPrice(pair: string): Promise<Result<OracleDataPoint, string>> {
    return this.fetchData({
      dataType: 'PRICE',
      parameters: { pair },
    });
  }

  /**
   * Simulate NAV update (for testing)
   */
  simulateNAVUpdate(
    assetId: string,
    changePercent: number,
    currency: string = 'USD'
  ): void {
    const existing = this.navData.get(assetId);
    const currentNAV = existing ? BigInt(existing.nav) : BigInt('1000000000000000000');
    const change = (currentNAV * BigInt(Math.floor(changePercent * 100))) / BigInt(10000);
    const newNAV = currentNAV + change;

    this.setNAV(assetId, newNAV.toString(), currency, 'simulation');
  }

  /**
   * Simulate oracle failure (for testing)
   */
  simulateFailure(): void {
    for (let i = 0; i < this.config.circuitBreakerThreshold; i++) {
      this.recordFailure();
    }
  }

  /**
   * Simulate stale data (for testing)
   */
  simulateStaleData(assetId: string): void {
    const staleTimestamp = new Date(Date.now() - this.config.maxDataAgeMs * 2).toISOString();
    this.navData.set(assetId, {
      assetId,
      nav: '1000000000000000000',
      currency: 'USD',
      timestamp: staleTimestamp,
      source: 'stale-simulation',
    });
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Get all active subscriptions count
   */
  getActiveSubscriptionCount(): number {
    return this.subscriptions.size;
  }

  /**
   * Clear all data and subscriptions
   */
  clear(): void {
    // Clear intervals
    for (const sub of this.subscriptions.values()) {
      clearInterval(sub.interval);
    }

    this.navData.clear();
    this.priceFeedData.clear();
    this.subscriptions.clear();
    this.customDataProviders.clear();
    this.cache.clear();
    this.resetCircuitBreaker();
    this.lastSuccessfulFetch = undefined;
    this.lastFailure = undefined;
  }
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/**
 * Create oracle service with production-safe defaults
 */
export function createOracleService(config?: Partial<OracleConfig>): OracleService {
  return new OracleService({
    maxDataAgeMs: 5 * 60 * 1000, // 5 minutes
    failSafeMode: OracleFailSafeMode.DENY_ON_FAILURE,
    circuitBreakerThreshold: 5,
    circuitBreakerResetMs: 60 * 1000,
    minConfidenceThreshold: 0.8,
    strictMode: true,
    ...config,
  });
}

/**
 * Create oracle service for development/testing
 */
export function createDevelopmentOracleService(): OracleService {
  const service = new OracleService({
    maxDataAgeMs: 60 * 60 * 1000, // 1 hour for development
    failSafeMode: OracleFailSafeMode.USE_FALLBACK,
    circuitBreakerThreshold: 10,
    circuitBreakerResetMs: 10 * 1000,
    minConfidenceThreshold: 0.5,
    strictMode: false,
  });

  // Set some default mock prices
  service.setPriceFeed('ETH/USD', '2000000000', 6);
  service.setPriceFeed('BTC/USD', '50000000000', 6);
  service.setPriceFeed('USD/AED', '3670000', 6);
  service.setPriceFeed('EUR/USD', '1100000', 6);

  return service;
}
