/**
 * External Data Sources Service
 *
 * Connectors for external data feeds:
 * - Price oracles (Chainlink, Pyth, custom)
 * - Market data providers
 * - NAV data feeds
 * - Regulatory data sources
 * - Custom webhook ingestion
 */

import { createHash } from 'crypto';
import { db, schema } from '../config/database.js';
import * as auditService from './audit.service.js';

const { eventBusQueue } = schema;

// Type helper for database operations (works around dual SQLite/Postgres support)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dbOps = db as any;

// ============================================================================
// Types & Interfaces
// ============================================================================

export type DataSourceType = 'chainlink' | 'pyth' | 'custom_oracle' | 'nav_provider' | 'market_data' | 'webhook';
export type DataSourceStatus = 'active' | 'inactive' | 'error' | 'rate_limited';

export interface DataSourceConfig {
  id: string;
  orgId: string;
  name: string;
  type: DataSourceType;
  status: DataSourceStatus;
  endpoint: string;
  credentials?: {
    apiKey?: string;
    secret?: string;
    headers?: Record<string, string>;
  };
  pollingInterval?: number; // milliseconds
  retryPolicy?: {
    maxRetries: number;
    backoffMs: number;
    backoffMultiplier: number;
  };
  transformConfig?: Record<string, unknown>;
  lastFetchAt?: Date;
  lastSuccessAt?: Date;
  lastError?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PriceData {
  sourceId: string;
  sourceName: string;
  asset: string;
  baseCurrency: string;
  price: string;
  decimals: number;
  timestamp: Date;
  blockNumber?: number;
  roundId?: string;
  confidence?: number;
  metadata?: Record<string, unknown>;
}

export interface NAVData {
  sourceId: string;
  sourceName: string;
  tokenId: string;
  nav: string;
  navPerShare: string;
  totalShares: string;
  asOfDate: Date;
  currency: string;
  audited: boolean;
  metadata?: Record<string, unknown>;
}

export interface ExternalEvent {
  id: string;
  sourceId: string;
  eventType: string;
  timestamp: Date;
  payload: Record<string, unknown>;
  normalized: boolean;
  processedAt?: Date;
}

export interface DataFetchResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  latencyMs: number;
  fetchedAt: Date;
}

// ============================================================================
// In-Memory Storage
// ============================================================================

const dataSources = new Map<string, DataSourceConfig>();
const priceCache = new Map<string, PriceData[]>(); // key = asset:currency
const navCache = new Map<string, NAVData[]>(); // key = tokenId
const externalEvents = new Map<string, ExternalEvent>();

// ============================================================================
// Data Source Management
// ============================================================================

/**
 * Register a new data source
 */
export function registerDataSource(config: Omit<DataSourceConfig, 'id' | 'createdAt' | 'updatedAt'>): DataSourceConfig {
  const id = `ds_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date();

  const source: DataSourceConfig = {
    ...config,
    id,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };

  dataSources.set(id, source);
  return source;
}

/**
 * Get data source by ID
 */
export function getDataSource(id: string): DataSourceConfig | null {
  return dataSources.get(id) || null;
}

/**
 * List data sources for an organization
 */
export function listDataSources(
  orgId: string,
  options?: { type?: DataSourceType; status?: DataSourceStatus }
): DataSourceConfig[] {
  return Array.from(dataSources.values())
    .filter((ds) => ds.orgId === orgId)
    .filter((ds) => !options?.type || ds.type === options.type)
    .filter((ds) => !options?.status || ds.status === options.status);
}

/**
 * Update data source status
 */
export function updateDataSourceStatus(
  id: string,
  status: DataSourceStatus,
  error?: string
): DataSourceConfig | null {
  const source = dataSources.get(id);
  if (!source) return null;

  source.status = status;
  source.updatedAt = new Date();
  if (error) {
    source.lastError = error;
  }
  dataSources.set(id, source);
  return source;
}

/**
 * Delete data source
 */
export function deleteDataSource(id: string): boolean {
  return dataSources.delete(id);
}

// ============================================================================
// Chainlink Oracle Integration
// ============================================================================

interface ChainlinkAggregatorV3 {
  roundId: string;
  answer: string;
  startedAt: string;
  updatedAt: string;
  answeredInRound: string;
}

/**
 * Fetch price from Chainlink aggregator
 */
export async function fetchChainlinkPrice(
  chainId: number,
  aggregatorAddress: string,
  rpcUrl: string
): Promise<DataFetchResult<PriceData>> {
  const start = Date.now();

  try {
    // ABI-encoded call to latestRoundData()
    const latestRoundDataSelector = '0xfeaf968c';

    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'eth_call',
        params: [
          {
            to: aggregatorAddress,
            data: latestRoundDataSelector,
          },
          'latest',
        ],
      }),
    });

    const result = await response.json() as { error?: { message: string }; result?: string };

    if (result.error) {
      return {
        success: false,
        error: result.error.message,
        latencyMs: Date.now() - start,
        fetchedAt: new Date(),
      };
    }

    // Decode the response (roundId, answer, startedAt, updatedAt, answeredInRound)
    const data = result.result;
    if (!data || data === '0x') {
      return {
        success: false,
        error: 'Empty response from aggregator',
        latencyMs: Date.now() - start,
        fetchedAt: new Date(),
      };
    }

    // Parse the response (each value is 32 bytes)
    const roundId = BigInt('0x' + data.slice(2, 66)).toString();
    const answer = BigInt('0x' + data.slice(66, 130)).toString();
    const updatedAt = Number(BigInt('0x' + data.slice(194, 258)));

    const priceData: PriceData = {
      sourceId: `chainlink:${aggregatorAddress}`,
      sourceName: 'Chainlink',
      asset: 'UNKNOWN', // Would need to query description()
      baseCurrency: 'USD',
      price: answer,
      decimals: 8, // Standard Chainlink decimals
      timestamp: new Date(updatedAt * 1000),
      roundId,
      confidence: 100,
    };

    return {
      success: true,
      data: priceData,
      latencyMs: Date.now() - start,
      fetchedAt: new Date(),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      latencyMs: Date.now() - start,
      fetchedAt: new Date(),
    };
  }
}

// ============================================================================
// Pyth Network Integration
// ============================================================================

interface PythPriceUpdate {
  id: string;
  price: {
    price: string;
    conf: string;
    expo: number;
    publish_time: number;
  };
  ema_price: {
    price: string;
    conf: string;
    expo: number;
    publish_time: number;
  };
}

/**
 * Fetch price from Pyth Network
 */
export async function fetchPythPrice(
  priceFeedId: string,
  hermeUrl: string = 'https://hermes.pyth.network'
): Promise<DataFetchResult<PriceData>> {
  const start = Date.now();

  try {
    const response = await fetch(
      `${hermeUrl}/api/latest_price_feeds?ids[]=${priceFeedId}`,
      {
        headers: { 'Accept': 'application/json' },
      }
    );

    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
        latencyMs: Date.now() - start,
        fetchedAt: new Date(),
      };
    }

    const data = await response.json() as PythPriceUpdate[];
    const priceFeed = data[0];

    if (!priceFeed) {
      return {
        success: false,
        error: 'Price feed not found',
        latencyMs: Date.now() - start,
        fetchedAt: new Date(),
      };
    }

    // Calculate confidence as percentage
    const price = BigInt(priceFeed.price.price);
    const conf = BigInt(priceFeed.price.conf);
    const confidence = price > 0n ? Number((price - conf) * 100n / price) : 0;

    const priceData: PriceData = {
      sourceId: `pyth:${priceFeedId}`,
      sourceName: 'Pyth Network',
      asset: priceFeedId,
      baseCurrency: 'USD',
      price: priceFeed.price.price,
      decimals: Math.abs(priceFeed.price.expo),
      timestamp: new Date(priceFeed.price.publish_time * 1000),
      confidence,
      metadata: {
        emaPrice: priceFeed.ema_price.price,
        emaConf: priceFeed.ema_price.conf,
      },
    };

    return {
      success: true,
      data: priceData,
      latencyMs: Date.now() - start,
      fetchedAt: new Date(),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      latencyMs: Date.now() - start,
      fetchedAt: new Date(),
    };
  }
}

// ============================================================================
// Custom API Integration
// ============================================================================

/**
 * Fetch data from a custom API endpoint
 */
export async function fetchFromCustomSource<T>(
  source: DataSourceConfig,
  path: string = ''
): Promise<DataFetchResult<T>> {
  const start = Date.now();

  try {
    const url = source.endpoint + path;
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      ...source.credentials?.headers,
    };

    if (source.credentials?.apiKey) {
      headers['Authorization'] = `Bearer ${source.credentials.apiKey}`;
    }

    const response = await fetch(url, { headers });

    if (!response.ok) {
      updateDataSourceStatus(source.id, 'error', `HTTP ${response.status}`);
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
        latencyMs: Date.now() - start,
        fetchedAt: new Date(),
      };
    }

    const data = await response.json();

    // Update source status
    const now = new Date();
    source.lastFetchAt = now;
    source.lastSuccessAt = now;
    source.status = 'active';
    dataSources.set(source.id, source);

    return {
      success: true,
      data: data as T,
      latencyMs: Date.now() - start,
      fetchedAt: now,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    updateDataSourceStatus(source.id, 'error', errorMsg);

    return {
      success: false,
      error: errorMsg,
      latencyMs: Date.now() - start,
      fetchedAt: new Date(),
    };
  }
}

// ============================================================================
// NAV Data Provider Integration
// ============================================================================

interface NAVProviderResponse {
  tokenId: string;
  nav: string;
  navPerShare: string;
  totalShares: string;
  asOfDate: string;
  currency: string;
  audited: boolean;
}

/**
 * Fetch NAV data from provider
 */
export async function fetchNAVData(
  source: DataSourceConfig,
  tokenId: string
): Promise<DataFetchResult<NAVData>> {
  const result = await fetchFromCustomSource<NAVProviderResponse>(
    source,
    `/nav/${tokenId}`
  );

  if (!result.success || !result.data) {
    return {
      success: false,
      error: result.error,
      latencyMs: result.latencyMs,
      fetchedAt: result.fetchedAt,
    };
  }

  const navData: NAVData = {
    sourceId: source.id,
    sourceName: source.name,
    tokenId: result.data.tokenId,
    nav: result.data.nav,
    navPerShare: result.data.navPerShare,
    totalShares: result.data.totalShares,
    asOfDate: new Date(result.data.asOfDate),
    currency: result.data.currency,
    audited: result.data.audited,
  };

  // Cache the NAV data
  const cacheKey = tokenId;
  const existing = navCache.get(cacheKey) || [];
  existing.push(navData);
  // Keep last 100 entries
  navCache.set(cacheKey, existing.slice(-100));

  return {
    success: true,
    data: navData,
    latencyMs: result.latencyMs,
    fetchedAt: result.fetchedAt,
  };
}

// ============================================================================
// Webhook Ingestion
// ============================================================================

export interface WebhookPayload {
  id?: string;
  type: string;
  timestamp?: string;
  data: Record<string, unknown>;
  signature?: string;
}

/**
 * Process incoming webhook
 */
export async function processWebhook(
  sourceId: string,
  payload: WebhookPayload,
  signature?: string
): Promise<ExternalEvent> {
  const source = dataSources.get(sourceId);
  if (!source) {
    throw new Error('Data source not found');
  }

  // Validate signature if configured
  if (source.credentials?.secret && signature) {
    const isValid = validateWebhookSignature(
      JSON.stringify(payload),
      signature,
      source.credentials.secret
    );
    if (!isValid) {
      throw new Error('Invalid webhook signature');
    }
  }

  const event: ExternalEvent = {
    id: payload.id || `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    sourceId,
    eventType: payload.type,
    timestamp: payload.timestamp ? new Date(payload.timestamp) : new Date(),
    payload: payload.data,
    normalized: false,
  };

  externalEvents.set(event.id, event);

  // Emit to internal event bus
  await dbOps.insert(eventBusQueue).values({
    orgId: source.orgId,
    topic: `external.${payload.type}`,
    payload: {
      eventId: event.id,
      sourceId,
      sourceName: source.name,
      ...payload.data,
    },
  });

  return event;
}

function validateWebhookSignature(payload: string, signature: string, secret: string): boolean {
  const expectedSignature = createHash('sha256')
    .update(payload + secret)
    .digest('hex');

  return signature === expectedSignature || signature === `sha256=${expectedSignature}`;
}

// ============================================================================
// Data Normalization
// ============================================================================

/**
 * Normalize price data to standard format
 */
export function normalizePriceData(
  data: PriceData,
  targetDecimals: number = 18
): { price: string; normalizedAt: Date } {
  const price = BigInt(data.price);
  const sourceDecimals = data.decimals;

  let normalizedPrice: bigint;
  if (targetDecimals > sourceDecimals) {
    normalizedPrice = price * BigInt(10 ** (targetDecimals - sourceDecimals));
  } else {
    normalizedPrice = price / BigInt(10 ** (sourceDecimals - targetDecimals));
  }

  return {
    price: normalizedPrice.toString(),
    normalizedAt: new Date(),
  };
}

/**
 * Aggregate prices from multiple sources
 */
export function aggregatePrices(prices: PriceData[]): {
  median: string;
  mean: string;
  min: string;
  max: string;
  stdDev: string;
  sourceCount: number;
} {
  if (prices.length === 0) {
    return {
      median: '0',
      mean: '0',
      min: '0',
      max: '0',
      stdDev: '0',
      sourceCount: 0,
    };
  }

  // Normalize all prices to 18 decimals
  const normalizedPrices = prices.map((p) => BigInt(normalizePriceData(p).price));

  // Sort for median calculation
  const sorted = [...normalizedPrices].sort((a, b) => (a > b ? 1 : a < b ? -1 : 0));

  const median = sorted[Math.floor(sorted.length / 2)];
  const min = sorted[0];
  const max = sorted[sorted.length - 1];

  // Calculate mean
  let sum = 0n;
  for (const p of normalizedPrices) {
    sum += p;
  }
  const mean = sum / BigInt(normalizedPrices.length);

  // Calculate standard deviation (simplified)
  let varianceSum = 0n;
  for (const p of normalizedPrices) {
    const diff = p - mean;
    varianceSum += diff * diff;
  }
  const variance = varianceSum / BigInt(normalizedPrices.length);
  // Approximate sqrt using Newton's method (simplified)
  const stdDev = sqrt(variance);

  return {
    median: median.toString(),
    mean: mean.toString(),
    min: min.toString(),
    max: max.toString(),
    stdDev: stdDev.toString(),
    sourceCount: prices.length,
  };
}

function sqrt(n: bigint): bigint {
  if (n < 0n) throw new Error('Square root of negative number');
  if (n < 2n) return n;

  let x = n;
  let y = (x + 1n) / 2n;
  while (y < x) {
    x = y;
    y = (x + n / x) / 2n;
  }
  return x;
}

// ============================================================================
// Price Cache Management
// ============================================================================

/**
 * Cache price data
 */
export function cachePriceData(data: PriceData): void {
  const cacheKey = `${data.asset}:${data.baseCurrency}`;
  const existing = priceCache.get(cacheKey) || [];
  existing.push(data);
  // Keep last 1000 entries
  priceCache.set(cacheKey, existing.slice(-1000));
}

/**
 * Get cached prices for an asset
 */
export function getCachedPrices(
  asset: string,
  baseCurrency: string,
  since?: Date
): PriceData[] {
  const cacheKey = `${asset}:${baseCurrency}`;
  let prices = priceCache.get(cacheKey) || [];

  if (since) {
    prices = prices.filter((p) => p.timestamp >= since);
  }

  return prices;
}

/**
 * Get latest cached price for an asset
 */
export function getLatestCachedPrice(asset: string, baseCurrency: string): PriceData | null {
  const prices = getCachedPrices(asset, baseCurrency);
  if (prices.length === 0) return null;
  return prices[prices.length - 1];
}

// ============================================================================
// Health Checks
// ============================================================================

export interface DataSourceHealth {
  id: string;
  name: string;
  type: DataSourceType;
  status: DataSourceStatus;
  lastSuccessAt?: Date;
  lastError?: string;
  latencyMs?: number;
  healthy: boolean;
}

/**
 * Check health of all data sources for an organization
 */
export async function checkDataSourcesHealth(orgId: string): Promise<DataSourceHealth[]> {
  const sources = listDataSources(orgId);
  const healthChecks: DataSourceHealth[] = [];

  for (const source of sources) {
    const timeSinceSuccess = source.lastSuccessAt
      ? Date.now() - source.lastSuccessAt.getTime()
      : Infinity;

    // Consider unhealthy if no success in last 5 minutes
    const healthy = source.status === 'active' && timeSinceSuccess < 5 * 60 * 1000;

    healthChecks.push({
      id: source.id,
      name: source.name,
      type: source.type,
      status: source.status,
      lastSuccessAt: source.lastSuccessAt,
      lastError: source.lastError,
      healthy,
    });
  }

  return healthChecks;
}

// ============================================================================
// Polling Service
// ============================================================================

const pollingIntervals = new Map<string, NodeJS.Timeout>();

/**
 * Start polling a data source
 */
export function startPolling(
  sourceId: string,
  fetchFn: () => Promise<void>,
  intervalMs: number
): void {
  // Clear existing interval if any
  stopPolling(sourceId);

  // Start new interval
  const interval = setInterval(async () => {
    try {
      await fetchFn();
    } catch (error) {
      console.error(`Polling error for source ${sourceId}:`, error);
    }
  }, intervalMs);

  pollingIntervals.set(sourceId, interval);
}

/**
 * Stop polling a data source
 */
export function stopPolling(sourceId: string): void {
  const interval = pollingIntervals.get(sourceId);
  if (interval) {
    clearInterval(interval);
    pollingIntervals.delete(sourceId);
  }
}

/**
 * Stop all polling
 */
export function stopAllPolling(): void {
  for (const [id] of pollingIntervals) {
    stopPolling(id);
  }
}
