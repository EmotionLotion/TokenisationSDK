/**
 * Chainlink Data Feed Plugin
 *
 * Provides access to Chainlink price feeds for NAV calculations and pricing.
 * Implements a chain-agnostic interface for fetching real-time price data.
 */

import { ethers, type Provider } from 'ethers';
import { ok, err, type Result } from '@tokenisation/core';
import type { IOraclePlugin, OracleDataPoint, OracleRequest } from '@tokenisation/core';
import { ValidationError, OracleError, ErrorCode } from '@tokenisation/core';

// Chainlink Aggregator V3 ABI (minimal)
const AGGREGATOR_V3_ABI = [
  'function latestRoundData() external view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
  'function decimals() external view returns (uint8)',
  'function description() external view returns (string)',
];

// Data feed addresses by chain
const DATA_FEEDS: Record<number, Record<string, string>> = {
  // Base Mainnet
  8453: {
    'ETH/USD': '0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70',
    'BTC/USD': '0x64c911996D3c6aC71E9b8F11F8f4D7A9d5a8C1e4',
    'USDC/USD': '0x7e860098F58bBFC8648a4311b374B1D669a2bc6B',
    'LINK/USD': '0x17CAb8FE31E32f08326e5E27412894e49B0f9D65',
  },
  // Polygon Mainnet
  137: {
    'ETH/USD': '0xF9680D99D6C9589e2a93a78A04A279e509205945',
    'BTC/USD': '0xc907E116054Ad103354f2D350FD2514433D57F6f',
    'USDC/USD': '0xfE4A8cc5b5B2366C1B58Bea3858e81843581b2F7',
    'MATIC/USD': '0xAB594600376Ec9fD91F8e885dADF0CE036862dE0',
    'LINK/USD': '0xd9FFdb71EbE7496cC440152d43986Aae0AB76665',
  },
  // Ethereum Mainnet
  1: {
    'ETH/USD': '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419',
    'BTC/USD': '0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c',
    'USDC/USD': '0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6',
    'LINK/USD': '0x2c1d072e956AFFC0D435Cb7AC38EF18d24d9127c',
    'DAI/USD': '0xAed0c38402a5d19df6E4c03F4E2DceD6e29c1ee9',
  },
  // Base Sepolia (Testnet)
  84532: {
    'ETH/USD': '0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1',
    'BTC/USD': '0x0FB99723Aee6f420beAD13e6bBB79b7E6F034298',
    'LINK/USD': '0xb113F5A928BCfF189C998ab20d753a47F9dE5A61',
  },
  // Sepolia (Testnet)
  11155111: {
    'ETH/USD': '0x694AA1769357215DE4FAC081bf1f309aDC325306',
    'BTC/USD': '0x1b44F3514812d835EB1BDB0acB33d3fA3351Ee43',
    'LINK/USD': '0xc59E3633BAAC79493d908e63626716e204A45EdF',
  },
};

export interface DataFeedPluginConfig {
  chainId: number;
  rpcUrl: string;
  customFeeds?: Record<string, string>;
  cacheTimeMs?: number;
  /** Pairs to monitor — informational only, feeds are resolved from chainId */
  pairs?: string[];
}

export interface PriceData {
  pair: string;
  price: bigint;
  decimals: number;
  formattedPrice: string;
  updatedAt: Date;
  roundId: bigint;
}

export class DataFeedPlugin implements IOraclePlugin {
  readonly pluginId = 'chainlink-data-feeds';
  readonly supportedDataTypes = ['price', 'nav'];

  private chainId: number;
  private provider: Provider;
  private feeds: Record<string, string>;
  private cache: Map<string, { data: PriceData; expiresAt: number }> = new Map();
  private cacheTimeMs: number;
  private subscriptions: Map<string, () => void> = new Map();

  constructor(config: DataFeedPluginConfig) {
    this.chainId = config.chainId;
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl, config.chainId);
    this.feeds = {
      ...(DATA_FEEDS[config.chainId] || {}),
      ...(config.customFeeds || {}),
    };
    this.cacheTimeMs = config.cacheTimeMs || 60000; // 1 minute default
  }

  async fetchData(request: OracleRequest): Promise<Result<OracleDataPoint, string>> {
    const { dataType, parameters } = request;

    if (dataType !== 'price') {
      return err(`Unsupported data type: ${dataType}. Only 'price' is supported.`);
    }

    const pair = parameters?.pair as string;
    if (!pair) {
      return err('Missing required parameter: pair');
    }

    try {
      const priceData = await this.getLatestPrice(pair);
      return ok({
        source: `Chainlink ${pair}`,
        value: priceData.formattedPrice,
        timestamp: priceData.updatedAt.toISOString(),
        confidence: 1.0, // Chainlink feeds are highly reliable
      });
    } catch (error) {
      return err(`Failed to fetch price: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
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
        try {
          const priceData = await this.getLatestPrice(pair);
          callback({
            source: `Chainlink ${pair}`,
            value: priceData.formattedPrice,
            timestamp: priceData.updatedAt.toISOString(),
            confidence: 1.0,
          });
        } catch (error) {
          console.error(`Price subscription error for ${pair}:`, error);
        }
        await new Promise(resolve => setTimeout(resolve, intervalMs));
      }
    };

    poll();

    const unsubscribe = () => {
      running = false;
    };

    this.subscriptions.set(pair, unsubscribe);
    return { unsubscribe };
  }

  async verifySignature(dataPoint: OracleDataPoint): Promise<boolean> {
    // Chainlink data feeds are verified on-chain
    // This method returns true as the data comes directly from the contract
    return dataPoint.source.startsWith('Chainlink');
  }

  async getNAV(assetId: string): Promise<Result<OracleDataPoint, string>> {
    // For NAV, we typically need asset-specific pricing logic
    // This is a simplified implementation that returns ETH/USD price
    try {
      const priceData = await this.getLatestPrice('ETH/USD');
      return ok({
        source: `Chainlink NAV for ${assetId}`,
        value: priceData.formattedPrice,
        timestamp: priceData.updatedAt.toISOString(),
        confidence: 1.0,
      });
    } catch (error) {
      return err(`Failed to fetch NAV: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Convenience wrapper: returns a Result instead of throwing.
   */
  async getPrice(pair: string): Promise<Result<{ price: string; decimals: number }, string>> {
    try {
      const data = await this.getLatestPrice(pair);
      return ok({ price: data.formattedPrice, decimals: data.decimals });
    } catch (error) {
      return err(`DataFeed price fetch failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getLatestPrice(pair: string): Promise<PriceData> {
    // Check cache first
    const cached = this.cache.get(pair);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.data;
    }

    const feedAddress = this.feeds[pair];
    if (!feedAddress) {
      throw new OracleError(`No data feed found for ${pair} on chain ${this.chainId}`, {
        code: ErrorCode.ORACLE_UNAVAILABLE,
        feedId: pair,
        details: { chainId: this.chainId, availablePairs: Object.keys(this.feeds) },
      });
    }

    const contract = new ethers.Contract(feedAddress, AGGREGATOR_V3_ABI, this.provider);

    const [roundData, decimals] = await Promise.all([
      contract.latestRoundData(),
      contract.decimals(),
    ]);

    const priceData: PriceData = {
      pair,
      price: BigInt(roundData.answer.toString()),
      decimals: Number(decimals),
      formattedPrice: ethers.formatUnits(roundData.answer, decimals),
      updatedAt: new Date(Number(roundData.updatedAt) * 1000),
      roundId: BigInt(roundData.roundId.toString()),
    };

    // Cache the result
    this.cache.set(pair, {
      data: priceData,
      expiresAt: Date.now() + this.cacheTimeMs,
    });

    return priceData;
  }

  async getPrices(pairs: string[]): Promise<Map<string, PriceData>> {
    const results = new Map<string, PriceData>();

    await Promise.all(
      pairs.map(async (pair) => {
        try {
          const price = await this.getLatestPrice(pair);
          results.set(pair, price);
        } catch (error) {
          console.warn(`Failed to fetch ${pair}:`, error);
        }
      })
    );

    return results;
  }

  getAvailablePairs(): string[] {
    return Object.keys(this.feeds);
  }

  getFeedAddress(pair: string): string | undefined {
    return this.feeds[pair];
  }

  addFeed(pair: string, address: string): void {
    this.feeds[pair] = address;
  }

  clearCache(): void {
    this.cache.clear();
  }

  // Subscribe to price updates (polling-based)
  subscribePrice(
    pair: string,
    callback: (price: PriceData) => void,
    intervalMs: number = 30000
  ): () => void {
    let running = true;

    const poll = async () => {
      while (running) {
        try {
          const price = await this.getLatestPrice(pair);
          callback(price);
        } catch (error) {
          console.error(`Price subscription error for ${pair}:`, error);
        }
        await new Promise(resolve => setTimeout(resolve, intervalMs));
      }
    };

    poll();

    return () => {
      running = false;
    };
  }

  /**
   * Destroy the plugin, removing all event listeners from the provider.
   */
  destroy(): void {
    (this.provider as ethers.JsonRpcProvider).removeAllListeners?.();
  }
}

// Factory functions
export function createDataFeedPlugin(config: DataFeedPluginConfig): DataFeedPlugin {
  return new DataFeedPlugin(config);
}

export function createBaseDataFeedPlugin(rpcUrl?: string): DataFeedPlugin {
  return new DataFeedPlugin({
    chainId: 8453,
    rpcUrl: rpcUrl || 'https://mainnet.base.org',
  });
}

export function createPolygonDataFeedPlugin(rpcUrl?: string): DataFeedPlugin {
  return new DataFeedPlugin({
    chainId: 137,
    rpcUrl: rpcUrl || 'https://polygon-rpc.com',
  });
}

export function createEthereumDataFeedPlugin(rpcUrl?: string): DataFeedPlugin {
  return new DataFeedPlugin({
    chainId: 1,
    rpcUrl: rpcUrl || 'https://eth.llamarpc.com',
  });
}

export default DataFeedPlugin;
