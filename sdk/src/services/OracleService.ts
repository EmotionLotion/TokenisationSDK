/**
 * OracleService - Simulates NAV updates and off-chain data
 *
 * Provides a mock oracle implementation for testing and development.
 * In production, this would integrate with Chainlink Functions or similar.
 */

import { v4 as uuidv4 } from 'uuid';
import type { IOraclePlugin, OracleDataPoint, OracleRequest } from '../core/interfaces.js';
import type { Result } from '../core/types.js';
import { ok, err } from '../core/types.js';

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
 * OracleService class
 */
export class OracleService implements IOraclePlugin {
  readonly pluginId = 'mock-oracle';
  readonly supportedDataTypes = ['NAV', 'PRICE', 'CUSTOM'];

  private navData: Map<string, NAVData> = new Map();
  private priceFeedData: Map<string, PriceFeedData> = new Map();
  private subscriptions: Map<string, OracleSubscription> = new Map();
  private customDataProviders: Map<string, (params: Record<string, unknown>) => Promise<unknown>> = new Map();

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

  /**
   * Fetch data from oracle
   */
  async fetchData(request: OracleRequest): Promise<Result<OracleDataPoint, string>> {
    try {
      switch (request.dataType) {
        case 'NAV':
          return this.fetchNAVData(request);

        case 'PRICE':
          return this.fetchPriceData(request);

        default:
          return this.fetchCustomData(request);
      }
    } catch (error) {
      return err(`Oracle fetch error: ${error}`);
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
      // Return mock data for testing
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
        confidence: 0.95,
      });
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
      // Return mock data for common pairs
      const mockPrices: Record<string, string> = {
        'ETH/USD': '2000000000', // $2000 with 6 decimals
        'BTC/USD': '50000000000', // $50000 with 6 decimals
        'USD/AED': '3670000', // 3.67 with 6 decimals
      };

      const mockPrice = mockPrices[pair] || '1000000';

      return ok({
        source: 'mock-oracle',
        value: {
          pair,
          price: mockPrice,
          decimals: 6,
          timestamp: new Date().toISOString(),
        },
        timestamp: new Date().toISOString(),
        confidence: 0.95,
      });
    }

    return ok({
      source: 'mock-oracle',
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
      // Return mock data for unknown types
      return ok({
        source: 'mock-oracle',
        value: { type: request.dataType, data: 'mock' },
        timestamp: new Date().toISOString(),
        confidence: 0.5,
      });
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

  /**
   * Subscribe to data updates
   */
  async subscribe(
    request: OracleRequest,
    callback: (data: OracleDataPoint) => void
  ): Promise<{ unsubscribe: () => void }> {
    const subscriptionId = uuidv4();
    const updateInterval = request.timeout || 60000; // Default 1 minute

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
    // For MVP, always return true
    // In production, this would verify Chainlink/oracle signatures
    return true;
  }

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
  }
}

/**
 * Create oracle service with default configuration
 */
export function createOracleService(): OracleService {
  const service = new OracleService();

  // Set some default mock prices
  service.setPriceFeed('ETH/USD', '2000000000', 6);
  service.setPriceFeed('BTC/USD', '50000000000', 6);
  service.setPriceFeed('USD/AED', '3670000', 6);
  service.setPriceFeed('EUR/USD', '1100000', 6);

  return service;
}
