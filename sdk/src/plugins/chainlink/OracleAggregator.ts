/**
 * Oracle Aggregator Plugin
 *
 * Provides multi-oracle redundancy with automatic failover:
 * - Primary/fallback oracle configuration
 * - Consensus-based aggregation (median, average)
 * - Deviation-based health detection
 * - Automatic failover on oracle failure
 *
 * Ensures reliable data even when individual oracles fail.
 */

import { ethers, type Provider } from 'ethers';
import { ok, err, type Result } from '../../core/types.js';
import type { IOraclePlugin, OracleDataPoint, OracleRequest } from '../../core/interfaces.js';
import { ValidationError, OracleError, ErrorCode } from '../../errors/index.js';

// Chainlink Aggregator ABI
const AGGREGATOR_V3_ABI = [
  'function latestRoundData() external view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
  'function decimals() external view returns (uint8)',
  'function description() external view returns (string)',
];

export enum AggregationStrategy {
  /** Use primary oracle, fallback on failure */
  PRIMARY_FALLBACK = 'PRIMARY_FALLBACK',

  /** Use median value from all oracles */
  MEDIAN = 'MEDIAN',

  /** Use average value from all oracles */
  AVERAGE = 'AVERAGE',

  /** Use the most recent value */
  MOST_RECENT = 'MOST_RECENT',

  /** Use weighted average based on confidence */
  WEIGHTED = 'WEIGHTED',

  /** Require consensus (values within deviation threshold) */
  CONSENSUS = 'CONSENSUS',
}

export interface OracleSource {
  id: string;
  name: string;
  type: 'chainlink' | 'api' | 'custom';
  address?: string; // For Chainlink data feeds
  endpoint?: string; // For API oracles
  fetchFn?: () => Promise<OracleDataPoint>; // For custom oracles
  priority: number; // Lower = higher priority
  weight: number; // For weighted average (0-1)
  maxStaleness: number; // seconds
  enabled: boolean;
}

export interface OracleAggregatorConfig {
  chainId: number;
  rpcUrl: string;
  strategy: AggregationStrategy;
  deviationThreshold?: number; // Percentage (e.g., 5 for 5%)
  minOracles?: number; // Minimum oracles required for consensus
  timeoutMs?: number;
  cacheTimeMs?: number;
}

export interface AggregatedResult {
  value: string;
  formattedValue: string;
  decimals: number;
  timestamp: string;
  sources: Array<{
    id: string;
    value: string;
    timestamp: string;
    used: boolean;
    error?: string;
  }>;
  strategy: AggregationStrategy;
  confidence: number;
}

/**
 * Oracle Aggregator
 *
 * Aggregates data from multiple oracle sources with failover support.
 */
export class OracleAggregator implements IOraclePlugin {
  readonly pluginId = 'oracle-aggregator';
  readonly supportedDataTypes = ['price', 'nav', 'custom'];

  private chainId: number;
  private provider: Provider;
  private strategy: AggregationStrategy;
  private deviationThreshold: number;
  private minOracles: number;
  private timeoutMs: number;
  private cacheTimeMs: number;

  private sources: Map<string, OracleSource> = new Map();
  private pairSources: Map<string, string[]> = new Map(); // pair -> source IDs
  private cache: Map<string, { result: AggregatedResult; expiresAt: number }> = new Map();

  constructor(config: OracleAggregatorConfig) {
    this.chainId = config.chainId;
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl, config.chainId);
    this.strategy = config.strategy;
    this.deviationThreshold = config.deviationThreshold || 5; // 5% default
    this.minOracles = config.minOracles || 1;
    this.timeoutMs = config.timeoutMs || 10000;
    this.cacheTimeMs = config.cacheTimeMs || 30000;
  }

  // ============================================
  // SOURCE MANAGEMENT
  // ============================================

  /**
   * Add a Chainlink data feed source
   */
  addChainlinkSource(params: {
    id: string;
    name: string;
    address: string;
    pairs: string[];
    priority?: number;
    weight?: number;
    maxStaleness?: number;
  }): OracleSource {
    const source: OracleSource = {
      id: params.id,
      name: params.name,
      type: 'chainlink',
      address: params.address,
      priority: params.priority || 1,
      weight: params.weight || 1,
      maxStaleness: params.maxStaleness || 3600,
      enabled: true,
    };

    this.sources.set(source.id, source);

    // Map pairs to this source
    for (const pair of params.pairs) {
      const existing = this.pairSources.get(pair) || [];
      existing.push(source.id);
      this.pairSources.set(pair, existing);
    }

    return source;
  }

  /**
   * Add an API oracle source
   */
  addApiSource(params: {
    id: string;
    name: string;
    endpoint: string;
    pairs: string[];
    priority?: number;
    weight?: number;
    maxStaleness?: number;
    fetchFn: (pair: string) => Promise<OracleDataPoint>;
  }): OracleSource {
    const source: OracleSource = {
      id: params.id,
      name: params.name,
      type: 'api',
      endpoint: params.endpoint,
      fetchFn: async () => params.fetchFn(params.pairs[0]),
      priority: params.priority || 2,
      weight: params.weight || 0.8,
      maxStaleness: params.maxStaleness || 60,
      enabled: true,
    };

    this.sources.set(source.id, source);

    for (const pair of params.pairs) {
      const existing = this.pairSources.get(pair) || [];
      existing.push(source.id);
      this.pairSources.set(pair, existing);
    }

    return source;
  }

  /**
   * Add a custom oracle source
   */
  addCustomSource(params: {
    id: string;
    name: string;
    pairs: string[];
    fetchFn: () => Promise<OracleDataPoint>;
    priority?: number;
    weight?: number;
    maxStaleness?: number;
  }): OracleSource {
    const source: OracleSource = {
      id: params.id,
      name: params.name,
      type: 'custom',
      fetchFn: params.fetchFn,
      priority: params.priority || 3,
      weight: params.weight || 0.5,
      maxStaleness: params.maxStaleness || 300,
      enabled: true,
    };

    this.sources.set(source.id, source);

    for (const pair of params.pairs) {
      const existing = this.pairSources.get(pair) || [];
      existing.push(source.id);
      this.pairSources.set(pair, existing);
    }

    return source;
  }

  /**
   * Remove a source
   */
  removeSource(sourceId: string): boolean {
    this.sources.delete(sourceId);

    // Remove from pair mappings
    for (const [pair, sources] of this.pairSources.entries()) {
      const filtered = sources.filter(id => id !== sourceId);
      if (filtered.length === 0) {
        this.pairSources.delete(pair);
      } else {
        this.pairSources.set(pair, filtered);
      }
    }

    return true;
  }

  /**
   * Enable/disable a source
   */
  setSourceEnabled(sourceId: string, enabled: boolean): boolean {
    const source = this.sources.get(sourceId);
    if (source) {
      source.enabled = enabled;
      return true;
    }
    return false;
  }

  // ============================================
  // DATA FETCHING
  // ============================================

  /**
   * Fetch aggregated data for a pair
   */
  async getAggregatedPrice(pair: string): Promise<Result<AggregatedResult, string>> {
    // Check cache
    const cached = this.cache.get(pair);
    if (cached && Date.now() < cached.expiresAt) {
      return ok(cached.result);
    }

    const sourceIds = this.pairSources.get(pair);
    if (!sourceIds || sourceIds.length === 0) {
      return err(`No sources configured for pair: ${pair}`);
    }

    // Fetch from all enabled sources
    const fetchResults = await this.fetchFromAllSources(pair, sourceIds);

    // Check if we have enough sources
    const validResults = fetchResults.filter(r => !r.error && r.value);
    if (validResults.length < this.minOracles) {
      return err(`Insufficient oracle responses: ${validResults.length}/${this.minOracles}`);
    }

    // Aggregate based on strategy
    const aggregated = this.aggregate(fetchResults, pair);

    // Cache result
    this.cache.set(pair, {
      result: aggregated,
      expiresAt: Date.now() + this.cacheTimeMs,
    });

    return ok(aggregated);
  }

  private async fetchFromAllSources(
    pair: string,
    sourceIds: string[]
  ): Promise<Array<{ id: string; value: string; decimals: number; timestamp: string; error?: string }>> {
    const sources = sourceIds
      .map(id => this.sources.get(id))
      .filter((s): s is OracleSource => s !== undefined && s.enabled)
      .sort((a, b) => a.priority - b.priority);

    const results = await Promise.all(
      sources.map(async source => {
        try {
          const result = await this.fetchWithTimeout(source, pair);
          return { id: source.id, ...result };
        } catch (error) {
          return {
            id: source.id,
            value: '',
            decimals: 0,
            timestamp: new Date().toISOString(),
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      })
    );

    return results;
  }

  private async fetchWithTimeout(
    source: OracleSource,
    pair: string
  ): Promise<{ value: string; decimals: number; timestamp: string }> {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Timeout')), this.timeoutMs)
    );

    const fetch = async (): Promise<{ value: string; decimals: number; timestamp: string }> => {
      if (source.type === 'chainlink' && source.address) {
        const contract = new ethers.Contract(source.address, AGGREGATOR_V3_ABI, this.provider);
        const [roundData, decimals] = await Promise.all([
          contract.latestRoundData(),
          contract.decimals(),
        ]);

        const updatedAt = Number(roundData.updatedAt);
        const staleness = Math.floor(Date.now() / 1000) - updatedAt;

        if (staleness > source.maxStaleness) {
          throw new OracleError(`Data stale: ${staleness}s > ${source.maxStaleness}s`, {
            code: ErrorCode.ORACLE_STALE_DATA,
            details: { staleness, maxStaleness: source.maxStaleness },
          });
        }

        return {
          value: roundData.answer.toString(),
          decimals: Number(decimals),
          timestamp: new Date(updatedAt * 1000).toISOString(),
        };
      } else if (source.fetchFn) {
        const result = await source.fetchFn();
        return {
          value: typeof result.value === 'string' ? result.value : JSON.stringify(result.value),
          decimals: 8, // Default decimals for custom sources
          timestamp: result.timestamp,
        };
      }

      throw new OracleError('No fetch method available', {
        code: ErrorCode.ORACLE_UNAVAILABLE,
        details: { sourceId: source.id, sourceType: source.type },
      });
    };

    return Promise.race([fetch(), timeout]);
  }

  // ============================================
  // AGGREGATION STRATEGIES
  // ============================================

  private aggregate(
    results: Array<{ id: string; value: string; decimals: number; timestamp: string; error?: string }>,
    pair: string
  ): AggregatedResult {
    const validResults = results.filter(r => !r.error && r.value);

    if (validResults.length === 0) {
      return {
        value: '0',
        formattedValue: '0',
        decimals: 8,
        timestamp: new Date().toISOString(),
        sources: results.map(r => ({
          id: r.id,
          value: r.value,
          timestamp: r.timestamp,
          used: false,
          error: r.error,
        })),
        strategy: this.strategy,
        confidence: 0,
      };
    }

    let aggregatedValue: bigint;
    let usedSourceIds: Set<string>;
    const decimals = validResults[0].decimals;

    switch (this.strategy) {
      case AggregationStrategy.PRIMARY_FALLBACK:
        [aggregatedValue, usedSourceIds] = this.aggregatePrimaryFallback(validResults);
        break;

      case AggregationStrategy.MEDIAN:
        [aggregatedValue, usedSourceIds] = this.aggregateMedian(validResults);
        break;

      case AggregationStrategy.AVERAGE:
        [aggregatedValue, usedSourceIds] = this.aggregateAverage(validResults);
        break;

      case AggregationStrategy.MOST_RECENT:
        [aggregatedValue, usedSourceIds] = this.aggregateMostRecent(validResults);
        break;

      case AggregationStrategy.WEIGHTED:
        [aggregatedValue, usedSourceIds] = this.aggregateWeighted(validResults);
        break;

      case AggregationStrategy.CONSENSUS:
        [aggregatedValue, usedSourceIds] = this.aggregateConsensus(validResults);
        break;

      default:
        [aggregatedValue, usedSourceIds] = this.aggregatePrimaryFallback(validResults);
    }

    // Calculate confidence based on source agreement
    const confidence = this.calculateConfidence(validResults, aggregatedValue, decimals);

    return {
      value: aggregatedValue.toString(),
      formattedValue: ethers.formatUnits(aggregatedValue, decimals),
      decimals,
      timestamp: new Date().toISOString(),
      sources: results.map(r => ({
        id: r.id,
        value: r.value,
        timestamp: r.timestamp,
        used: usedSourceIds.has(r.id),
        error: r.error,
      })),
      strategy: this.strategy,
      confidence,
    };
  }

  private aggregatePrimaryFallback(
    results: Array<{ id: string; value: string; decimals: number }>
  ): [bigint, Set<string>] {
    const source = this.sources.get(results[0].id);
    const sortedByPriority = [...results].sort((a, b) => {
      const sourceA = this.sources.get(a.id);
      const sourceB = this.sources.get(b.id);
      return (sourceA?.priority || 999) - (sourceB?.priority || 999);
    });

    const primary = sortedByPriority[0];
    return [BigInt(primary.value), new Set([primary.id])];
  }

  private aggregateMedian(
    results: Array<{ id: string; value: string; decimals: number }>
  ): [bigint, Set<string>] {
    const values = results.map(r => ({ id: r.id, value: BigInt(r.value) }));
    values.sort((a, b) => (a.value < b.value ? -1 : a.value > b.value ? 1 : 0));

    const midIndex = Math.floor(values.length / 2);

    if (values.length % 2 === 0) {
      const median = (values[midIndex - 1].value + values[midIndex].value) / 2n;
      return [median, new Set([values[midIndex - 1].id, values[midIndex].id])];
    } else {
      return [values[midIndex].value, new Set([values[midIndex].id])];
    }
  }

  private aggregateAverage(
    results: Array<{ id: string; value: string; decimals: number }>
  ): [bigint, Set<string>] {
    const sum = results.reduce((acc, r) => acc + BigInt(r.value), 0n);
    const average = sum / BigInt(results.length);
    return [average, new Set(results.map(r => r.id))];
  }

  private aggregateMostRecent(
    results: Array<{ id: string; value: string; decimals: number; timestamp: string }>
  ): [bigint, Set<string>] {
    const sorted = [...results].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    return [BigInt(sorted[0].value), new Set([sorted[0].id])];
  }

  private aggregateWeighted(
    results: Array<{ id: string; value: string; decimals: number }>
  ): [bigint, Set<string>] {
    let totalWeight = 0;
    let weightedSum = 0n;

    for (const result of results) {
      const source = this.sources.get(result.id);
      const weight = source?.weight || 1;
      totalWeight += weight;
      weightedSum += BigInt(result.value) * BigInt(Math.floor(weight * 1000));
    }

    const average = weightedSum / BigInt(Math.floor(totalWeight * 1000));
    return [average, new Set(results.map(r => r.id))];
  }

  private aggregateConsensus(
    results: Array<{ id: string; value: string; decimals: number }>
  ): [bigint, Set<string>] {
    // Find values within deviation threshold of each other
    const values = results.map(r => ({ id: r.id, value: BigInt(r.value) }));
    const consensusGroup: typeof values = [];

    for (const current of values) {
      const withinThreshold = values.filter(other => {
        if (current.value === 0n) return other.value === 0n;
        const deviation = Number(
          ((other.value - current.value) * 10000n) / current.value
        ) / 100;
        return Math.abs(deviation) <= this.deviationThreshold;
      });

      if (withinThreshold.length > consensusGroup.length) {
        consensusGroup.length = 0;
        consensusGroup.push(...withinThreshold);
      }
    }

    if (consensusGroup.length < this.minOracles) {
      // Fall back to median if no consensus
      return this.aggregateMedian(results);
    }

    // Use median of consensus group
    consensusGroup.sort((a, b) => (a.value < b.value ? -1 : a.value > b.value ? 1 : 0));
    const midIndex = Math.floor(consensusGroup.length / 2);
    return [consensusGroup[midIndex].value, new Set(consensusGroup.map(v => v.id))];
  }

  private calculateConfidence(
    results: Array<{ id: string; value: string }>,
    aggregatedValue: bigint,
    decimals: number
  ): number {
    if (results.length === 0) return 0;
    if (results.length === 1) return 0.8;

    // Calculate how many sources agree within threshold
    let agreeing = 0;
    for (const result of results) {
      const value = BigInt(result.value);
      if (aggregatedValue === 0n) {
        if (value === 0n) agreeing++;
        continue;
      }
      const deviation = Number(((value - aggregatedValue) * 10000n) / aggregatedValue) / 100;
      if (Math.abs(deviation) <= this.deviationThreshold) {
        agreeing++;
      }
    }

    return agreeing / results.length;
  }

  // ============================================
  // IOraclePlugin INTERFACE
  // ============================================

  async fetchData(request: OracleRequest): Promise<Result<OracleDataPoint, string>> {
    const pair = request.parameters?.pair as string;
    if (!pair) {
      return err('Missing required parameter: pair');
    }

    const result = await this.getAggregatedPrice(pair);
    if (!result.success) {
      return err(result.error);
    }

    return ok({
      source: `Aggregator (${result.data.sources.filter(s => s.used).map(s => s.id).join(', ')})`,
      value: result.data.formattedValue,
      timestamp: result.data.timestamp,
      confidence: result.data.confidence,
    });
  }

  async subscribe(
    request: OracleRequest,
    callback: (data: OracleDataPoint) => void
  ): Promise<{ unsubscribe: () => void }> {
    const pair = request.parameters?.pair as string;
    if (!pair) {
      throw new ValidationError('Missing required parameter: pair', {
        field: 'parameters.pair',
        constraints: { required: 'true' },
      });
    }

    let running = true;
    const intervalMs = (request.timeout || 30) * 1000;

    const poll = async () => {
      while (running) {
        const result = await this.fetchData(request);
        if (result.success) {
          callback(result.data);
        }
        await new Promise(resolve => setTimeout(resolve, intervalMs));
      }
    };

    poll();

    return {
      unsubscribe: () => {
        running = false;
      },
    };
  }

  async verifySignature(dataPoint: OracleDataPoint): Promise<boolean> {
    return dataPoint.source.startsWith('Aggregator');
  }

  async getNAV(assetId: string): Promise<Result<OracleDataPoint, string>> {
    return this.fetchData({
      dataType: 'nav',
      parameters: { pair: `${assetId}/USD` },
    });
  }

  // ============================================
  // UTILITY
  // ============================================

  /**
   * Set aggregation strategy
   */
  setStrategy(strategy: AggregationStrategy): void {
    this.strategy = strategy;
  }

  /**
   * Get all sources
   */
  getSources(): OracleSource[] {
    return Array.from(this.sources.values());
  }

  /**
   * Get sources for a pair
   */
  getSourcesForPair(pair: string): OracleSource[] {
    const sourceIds = this.pairSources.get(pair) || [];
    return sourceIds
      .map(id => this.sources.get(id))
      .filter((s): s is OracleSource => s !== undefined);
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}

// Factory functions
export function createOracleAggregator(config: OracleAggregatorConfig): OracleAggregator {
  return new OracleAggregator(config);
}

export function createPrimaryFallbackAggregator(
  chainId: number,
  rpcUrl: string
): OracleAggregator {
  return new OracleAggregator({
    chainId,
    rpcUrl,
    strategy: AggregationStrategy.PRIMARY_FALLBACK,
  });
}

export function createConsensusAggregator(
  chainId: number,
  rpcUrl: string,
  minOracles: number = 2,
  deviationThreshold: number = 5
): OracleAggregator {
  return new OracleAggregator({
    chainId,
    rpcUrl,
    strategy: AggregationStrategy.CONSENSUS,
    minOracles,
    deviationThreshold,
  });
}

export default OracleAggregator;
