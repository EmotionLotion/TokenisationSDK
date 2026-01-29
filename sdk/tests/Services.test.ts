/**
 * Services Tests
 *
 * Tests for SDK services including deployment and indexing.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  DeploymentService,
  createDeploymentService,
  SUPPORTED_CHAINS,
  CHAINLINK_ETH_USD_FEEDS,
  type DeploymentConfig,
} from '../src/services/DeploymentService.js';
import {
  createIndexingService,
  type IndexingService,
} from '../src/services/IndexingService.js';
import {
  OracleService,
  createDevelopmentOracleService,
} from '../src/services/OracleService.js';

describe('DeploymentService', () => {
  describe('Configuration', () => {
    it('should export supported chains', () => {
      expect(SUPPORTED_CHAINS).toBeDefined();
      expect(SUPPORTED_CHAINS.mainnet).toBeDefined();
      expect(SUPPORTED_CHAINS.polygon).toBeDefined();
      expect(SUPPORTED_CHAINS.base).toBeDefined();
      expect(SUPPORTED_CHAINS.sepolia).toBeDefined();
    });

    it('should export Chainlink price feeds', () => {
      expect(CHAINLINK_ETH_USD_FEEDS).toBeDefined();
      expect(CHAINLINK_ETH_USD_FEEDS[1]).toBeDefined(); // Mainnet
      expect(CHAINLINK_ETH_USD_FEEDS[137]).toBeDefined(); // Polygon
      expect(CHAINLINK_ETH_USD_FEEDS[11155111]).toBeDefined(); // Sepolia
    });

    it('should have correct Chainlink feed addresses', () => {
      // Mainnet ETH/USD
      expect(CHAINLINK_ETH_USD_FEEDS[1]).toBe('0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419');
      // Sepolia ETH/USD
      expect(CHAINLINK_ETH_USD_FEEDS[11155111]).toBe('0x694AA1769357215DE4FAC081bf1f309aDC325306');
    });
  });

  // Note: Full deployment tests require a real account and RPC connection
  // These tests verify the service structure without making actual blockchain calls
});

describe('IndexingService', () => {
  let service: IndexingService;

  beforeEach(() => {
    service = createIndexingService();
  });

  it('should create indexing service', () => {
    expect(service).toBeDefined();
  });

  it('should simulate transfers', () => {
    service.simulateTransfer({
      contractAddress: 'asset-1',
      from: '0x0000000000000000000000000000000000000000',
      to: 'holder-1',
      amount: '1000',
    });

    const balance = service.getHolderBalance('asset-1', 'holder-1');
    expect(balance).toBe('1000');
  });

  it('should track multiple holders', () => {
    // Mint to holder 1
    service.simulateTransfer({
      contractAddress: 'asset-1',
      from: '0x0000000000000000000000000000000000000000',
      to: 'holder-1',
      amount: '1000',
    });

    // Mint to holder 2
    service.simulateTransfer({
      contractAddress: 'asset-1',
      from: '0x0000000000000000000000000000000000000000',
      to: 'holder-2',
      amount: '500',
    });

    expect(service.getHolderBalance('asset-1', 'holder-1')).toBe('1000');
    expect(service.getHolderBalance('asset-1', 'holder-2')).toBe('500');
  });

  it('should handle transfers between holders', () => {
    // Mint
    service.simulateTransfer({
      contractAddress: 'asset-1',
      from: '0x0000000000000000000000000000000000000000',
      to: 'holder-1',
      amount: '1000',
    });

    // Transfer
    service.simulateTransfer({
      contractAddress: 'asset-1',
      from: 'holder-1',
      to: 'holder-2',
      amount: '400',
    });

    expect(service.getHolderBalance('asset-1', 'holder-1')).toBe('600');
    expect(service.getHolderBalance('asset-1', 'holder-2')).toBe('400');
  });

  it('should return zero for unknown holders', () => {
    const balance = service.getHolderBalance('asset-1', 'unknown-holder');
    expect(balance).toBe('0');
  });
});

describe('OracleService', () => {
  let service: OracleService;

  beforeEach(() => {
    // Use development oracle for backward-compatible mock behavior
    service = createDevelopmentOracleService();
  });

  afterEach(() => {
    service.clear();
  });

  it('should create oracle service', () => {
    expect(service).toBeDefined();
    expect(service.pluginId).toBe('production-oracle');
  });

  it('should set and fetch NAV data', async () => {
    const assetId = 'asset-123';
    service.setNAV(assetId, '1500000', 'USD', 'appraisal');

    const result = await service.fetchData({
      dataType: 'NAV',
      source: 'mock',
      parameters: { assetId },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      const value = result.data.value as { nav: string };
      expect(value.nav).toBe('1500000');
    }
  });

  it('should set and fetch price feed data', async () => {
    service.setPriceFeed('ETH/USD', '2500000000', 8); // $2500.00000000

    const result = await service.fetchData({
      dataType: 'PRICE',
      source: 'mock',
      parameters: { pair: 'ETH/USD' },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      const value = result.data.value as { price: string };
      expect(value.price).toBe('2500000000');
    }
  });

  it('should return mock NAV for unknown asset in non-strict mode', async () => {
    const result = await service.fetchData({
      dataType: 'NAV',
      parameters: { assetId: 'unknown-asset' },
    });

    // In development mode (non-strict), returns mock data for unknown assets
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.source).toBe('mock-oracle');
      expect(result.data.confidence).toBeLessThan(1.0); // Lower confidence for mock
    }
  });

  it('should handle unknown price pairs gracefully', async () => {
    const result = await service.fetchData({
      dataType: 'PRICE',
      parameters: { pair: 'UNKNOWN/USD' },
    });

    // Unknown pairs should fail (no mock data configured)
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('No price data available');
    }
  });

  it('should support custom data providers', async () => {
    // Register a custom data provider
    service.registerDataProvider('WEATHER', async (params) => {
      return { temperature: 25, humidity: 60, location: params.location };
    });

    const result = await service.fetchData({
      dataType: 'WEATHER',
      source: 'custom',
      parameters: { location: 'Dubai' },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      const data = result.data.value as { temperature: number; humidity: number };
      expect(data.temperature).toBe(25);
    }
  });

  it('should list supported data types', () => {
    expect(service.supportedDataTypes).toContain('NAV');
    expect(service.supportedDataTypes).toContain('PRICE');
    expect(service.supportedDataTypes).toContain('CUSTOM');
  });
});
