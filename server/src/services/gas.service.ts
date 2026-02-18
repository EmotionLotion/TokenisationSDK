/**
 * Gas Estimation Service
 *
 * Provides gas estimation, pricing, and multi-chain comparison for blockchain
 * transactions. Supports both EIP-1559 and legacy gas pricing models with
 * in-memory caching.
 */

import { ValidationError } from '../middleware/errorHandler.js';
import { logger } from '../middleware/logger.js';

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface ChainConfig {
  chainId: number;
  name: string;
  rpcUrl: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  supportsEIP1559: boolean;
  isTestnet: boolean;
}

export interface TxParams {
  from?: string;
  to?: string;
  data?: string;
  value?: string;
}

export interface GasPriceResult {
  chainId: number;
  chainName: string;
  nativeSymbol: string;
  /** Legacy gas price in wei */
  gasPrice: string;
  gasPriceGwei: string;
  /** EIP-1559 fields (null on legacy-only chains) */
  baseFee: string | null;
  maxPriorityFeePerGas: string | null;
  maxFeePerGas: string | null;
  /** Whether the chain supports EIP-1559 */
  eip1559: boolean;
  timestamp: string;
}

export interface GasEstimateResult {
  chainId: number;
  chainName: string;
  nativeSymbol: string;
  gasLimit: string;
  gasPrice: string;
  gasPriceGwei: string;
  baseFee: string | null;
  maxPriorityFeePerGas: string | null;
  maxFeePerGas: string | null;
  eip1559: boolean;
  estimatedCostWei: string;
  estimatedCostNative: string;
  estimatedCostUSD: string;
  timestamp: string;
}

export interface ChainComparisonEntry {
  chainId: number;
  chainName: string;
  nativeSymbol: string;
  gasPrice: string;
  gasPriceGwei: string;
  baseFee: string | null;
  eip1559: boolean;
  estimatedTransferCostWei: string;
  estimatedTransferCostNative: string;
  estimatedTransferCostUSD: string;
}

export interface ChainComparisonResult {
  chains: ChainComparisonEntry[];
  cheapest: ChainComparisonEntry | null;
  timestamp: string;
}

// ============================================================================
// Chain Configuration
// ============================================================================

let chainConfigs: ChainConfig[];

try {
  // Try to load from existing chain config module
  const chainsModule = await import('../config/chains.js');
  const raw = chainsModule.SUPPORTED_CHAINS || chainsModule.default || [];
  chainConfigs = Array.isArray(raw) ? raw : Object.values(raw);
} catch {
  // Fallback: define inline
  chainConfigs = [
    {
      chainId: 1,
      name: 'Ethereum Mainnet',
      rpcUrl: process.env.ETH_MAINNET_RPC || 'https://eth.llamarpc.com',
      nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
      supportsEIP1559: true,
      isTestnet: false,
    },
    {
      chainId: 11155111,
      name: 'Sepolia Testnet',
      rpcUrl: process.env.ETH_SEPOLIA_RPC || 'https://rpc.sepolia.org',
      nativeCurrency: { name: 'Sepolia Ether', symbol: 'ETH', decimals: 18 },
      supportsEIP1559: true,
      isTestnet: true,
    },
    {
      chainId: 137,
      name: 'Polygon Mainnet',
      rpcUrl: process.env.POLYGON_RPC || 'https://polygon-rpc.com',
      nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
      supportsEIP1559: true,
      isTestnet: false,
    },
    {
      chainId: 80001,
      name: 'Polygon Mumbai',
      rpcUrl: process.env.POLYGON_MUMBAI_RPC || 'https://rpc-mumbai.maticvigil.com',
      nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
      supportsEIP1559: true,
      isTestnet: true,
    },
    {
      chainId: 43114,
      name: 'Avalanche C-Chain',
      rpcUrl: process.env.AVAX_RPC || 'https://api.avax.network/ext/bc/C/rpc',
      nativeCurrency: { name: 'Avalanche', symbol: 'AVAX', decimals: 18 },
      supportsEIP1559: true,
      isTestnet: false,
    },
    {
      chainId: 42161,
      name: 'Arbitrum One',
      rpcUrl: process.env.ARBITRUM_RPC || 'https://arb1.arbitrum.io/rpc',
      nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
      supportsEIP1559: true,
      isTestnet: false,
    },
    {
      chainId: 10,
      name: 'Optimism',
      rpcUrl: process.env.OPTIMISM_RPC || 'https://mainnet.optimism.io',
      nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
      supportsEIP1559: true,
      isTestnet: false,
    },
    {
      chainId: 8453,
      name: 'Base',
      rpcUrl: process.env.BASE_RPC || 'https://mainnet.base.org',
      nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
      supportsEIP1559: true,
      isTestnet: false,
    },
  ];
}

// ============================================================================
// Mock Native Token Price Feed (USD)
// ============================================================================

const NATIVE_TOKEN_PRICES_USD: Record<string, number> = {
  ETH: parseFloat(process.env.ETH_PRICE_USD || '3200'),
  MATIC: parseFloat(process.env.MATIC_PRICE_USD || '0.85'),
  AVAX: parseFloat(process.env.AVAX_PRICE_USD || '35'),
};

function getNativeTokenPriceUSD(symbol: string): number {
  return NATIVE_TOKEN_PRICES_USD[symbol] ?? 0;
}

// ============================================================================
// Gas Price Cache (15-second TTL)
// ============================================================================

const CACHE_TTL_MS = 15_000;

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const gasPriceCache = new Map<string, CacheEntry<GasPriceResult>>();
const gasEstimateCache = new Map<string, CacheEntry<GasEstimateResult>>();

function getCached<T>(cache: Map<string, CacheEntry<T>>, key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache<T>(cache: Map<string, CacheEntry<T>>, key: string, data: T): void {
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ============================================================================
// JSON-RPC Client
// ============================================================================

type RpcParam = string | number | boolean | null | Record<string, unknown> | RpcParam[];

async function jsonRpcCall<T = unknown>(rpcUrl: string, method: string, params: RpcParam[]): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method,
        params,
      }),
      signal: controller.signal,
    });

    const result = await response.json() as { error?: { message: string; code?: number }; result?: T };

    if (result.error) {
      throw new Error(`RPC Error (${result.error.code || 'unknown'}): ${result.error.message}`);
    }

    return result.result as T;
  } finally {
    clearTimeout(timeout);
  }
}

// ============================================================================
// Helpers
// ============================================================================

function getChainConfig(chainId: number): ChainConfig {
  const config = chainConfigs.find(c => c.chainId === chainId);
  if (!config) {
    throw new ValidationError(
      `Unsupported chain ID: ${chainId}. Supported: ${chainConfigs.map(c => c.chainId).join(', ')}`
    );
  }
  return config;
}

function formatWeiToNative(wei: string, decimals: number): string {
  const value = BigInt(wei);
  const divisor = BigInt(10 ** decimals);
  const whole = value / divisor;
  const frac = value % divisor;
  const fracStr = frac.toString().padStart(decimals, '0').slice(0, 8);
  return `${whole}.${fracStr}`;
}

function weiToGwei(wei: string): string {
  const value = BigInt(wei);
  const gwei = value / BigInt(1e9);
  const fracGwei = (value % BigInt(1e9)) / BigInt(1e6);
  return `${gwei}.${fracGwei.toString().padStart(3, '0')}`;
}

function weiToUSD(wei: string, decimals: number, priceUSD: number): string {
  const value = BigInt(wei);
  const divisor = BigInt(10 ** decimals);
  const whole = Number(value / divisor);
  const frac = Number(value % divisor) / Number(divisor);
  const nativeAmount = whole + frac;
  return (nativeAmount * priceUSD).toFixed(4);
}

/** Default gas limit for a standard ERC-20 transfer */
const DEFAULT_ERC20_TRANSFER_GAS = '65000';

// ============================================================================
// Service Methods
// ============================================================================

/**
 * Estimate gas for a specific transaction on a given chain.
 */
export async function estimateGas(
  chainId: number,
  txParams: TxParams
): Promise<GasEstimateResult> {
  const chain = getChainConfig(chainId);

  const cacheKey = `estimate:${chainId}:${txParams.to || ''}:${(txParams.data || '').slice(0, 10)}`;
  const cached = getCached(gasEstimateCache, cacheKey);
  if (cached) return cached;

  // 1. Estimate gas limit
  let gasLimitHex: string;
  try {
    gasLimitHex = await jsonRpcCall<string>(chain.rpcUrl, 'eth_estimateGas', [{
      from: txParams.from || '0x0000000000000000000000000000000000000001',
      to: txParams.to || '0x0000000000000000000000000000000000000001',
      data: txParams.data || '0x',
      value: txParams.value ? `0x${BigInt(txParams.value).toString(16)}` : '0x0',
    }]);
  } catch (err) {
    logger.warn('eth_estimateGas failed, using default gas limit', {
      metadata: { chainId, error: err instanceof Error ? err.message : 'unknown' },
    });
    gasLimitHex = `0x${BigInt(DEFAULT_ERC20_TRANSFER_GAS).toString(16)}`;
  }

  const gasLimitBn = BigInt(gasLimitHex);

  // 2. Get gas prices
  const prices = await getCurrentGasPrices(chainId);

  // 3. Calculate cost
  const effectiveGasPrice = prices.maxFeePerGas
    ? BigInt(prices.maxFeePerGas)
    : BigInt(prices.gasPrice);

  const estimatedCostWei = (gasLimitBn * effectiveGasPrice).toString();
  const estimatedCostNative = formatWeiToNative(estimatedCostWei, chain.nativeCurrency.decimals);
  const priceUSD = getNativeTokenPriceUSD(chain.nativeCurrency.symbol);
  const estimatedCostUSD = weiToUSD(estimatedCostWei, chain.nativeCurrency.decimals, priceUSD);

  const result: GasEstimateResult = {
    chainId,
    chainName: chain.name,
    nativeSymbol: chain.nativeCurrency.symbol,
    gasLimit: gasLimitBn.toString(),
    gasPrice: prices.gasPrice,
    gasPriceGwei: prices.gasPriceGwei,
    baseFee: prices.baseFee,
    maxPriorityFeePerGas: prices.maxPriorityFeePerGas,
    maxFeePerGas: prices.maxFeePerGas,
    eip1559: prices.eip1559,
    estimatedCostWei,
    estimatedCostNative,
    estimatedCostUSD,
    timestamp: new Date().toISOString(),
  };

  setCache(gasEstimateCache, cacheKey, result);
  return result;
}

/**
 * Get current gas prices for a chain (EIP-1559 + legacy).
 */
export async function getCurrentGasPrices(chainId: number): Promise<GasPriceResult> {
  const chain = getChainConfig(chainId);

  const cacheKey = `prices:${chainId}`;
  const cached = getCached(gasPriceCache, cacheKey);
  if (cached) return cached;

  // Fetch legacy gas price
  const gasPriceHex = await jsonRpcCall<string>(chain.rpcUrl, 'eth_gasPrice', []);
  const gasPriceWei = BigInt(gasPriceHex).toString();

  // Attempt EIP-1559 fee data
  let baseFee: string | null = null;
  let maxPriorityFeePerGas: string | null = null;
  let maxFeePerGas: string | null = null;
  let eip1559 = false;

  if (chain.supportsEIP1559) {
    try {
      interface FeeHistory {
        baseFeePerGas: string[];
        gasUsedRatio: number[];
        oldestBlock: string;
        reward?: string[][];
      }

      const feeHistory = await jsonRpcCall<FeeHistory>(
        chain.rpcUrl,
        'eth_feeHistory',
        [4, 'latest', [25, 50, 75]]
      );

      if (feeHistory?.baseFeePerGas?.length > 0) {
        const latestBaseFee = BigInt(feeHistory.baseFeePerGas[feeHistory.baseFeePerGas.length - 1]);
        baseFee = latestBaseFee.toString();

        // Calculate priority fee from median reward tier
        let priorityFee = BigInt('1500000000'); // 1.5 gwei default
        if (feeHistory.reward && feeHistory.reward.length > 0) {
          const medianRewards = feeHistory.reward
            .map(r => BigInt(r[1] || r[0] || '0x59682f00'))
            .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
          priorityFee = medianRewards[Math.floor(medianRewards.length / 2)];
        }

        maxPriorityFeePerGas = priorityFee.toString();
        // maxFeePerGas = 2 * baseFee + priorityFee (EIP-1559 recommended formula)
        maxFeePerGas = (latestBaseFee * 2n + priorityFee).toString();
        eip1559 = true;
      }
    } catch (err) {
      logger.warn('EIP-1559 fee query failed, falling back to legacy pricing', {
        metadata: { chainId, error: err instanceof Error ? err.message : 'unknown' },
      });
    }
  }

  const result: GasPriceResult = {
    chainId,
    chainName: chain.name,
    nativeSymbol: chain.nativeCurrency.symbol,
    gasPrice: gasPriceWei,
    gasPriceGwei: weiToGwei(gasPriceWei),
    baseFee,
    maxPriorityFeePerGas,
    maxFeePerGas,
    eip1559,
    timestamp: new Date().toISOString(),
  };

  setCache(gasPriceCache, cacheKey, result);
  return result;
}

/**
 * Compare gas prices across multiple chains.
 */
export async function compareChains(chainIds: number[]): Promise<ChainComparisonResult> {
  if (chainIds.length === 0) {
    throw new ValidationError('At least one chain ID is required');
  }

  if (chainIds.length > 10) {
    throw new ValidationError('Maximum 10 chains can be compared at once');
  }

  // Validate all chain IDs upfront
  for (const id of chainIds) {
    getChainConfig(id);
  }

  const entries: ChainComparisonEntry[] = [];
  const transferGas = BigInt(DEFAULT_ERC20_TRANSFER_GAS);

  const results = await Promise.allSettled(
    chainIds.map(async (chainId) => {
      const chain = getChainConfig(chainId);
      const prices = await getCurrentGasPrices(chainId);

      const effectiveGasPrice = prices.maxFeePerGas
        ? BigInt(prices.maxFeePerGas)
        : BigInt(prices.gasPrice);

      const costWei = (transferGas * effectiveGasPrice).toString();
      const costNative = formatWeiToNative(costWei, chain.nativeCurrency.decimals);
      const priceUSD = getNativeTokenPriceUSD(chain.nativeCurrency.symbol);
      const costUSD = weiToUSD(costWei, chain.nativeCurrency.decimals, priceUSD);

      return {
        chainId,
        chainName: chain.name,
        nativeSymbol: chain.nativeCurrency.symbol,
        gasPrice: prices.gasPrice,
        gasPriceGwei: prices.gasPriceGwei,
        baseFee: prices.baseFee,
        eip1559: prices.eip1559,
        estimatedTransferCostWei: costWei,
        estimatedTransferCostNative: costNative,
        estimatedTransferCostUSD: costUSD,
      } as ChainComparisonEntry;
    })
  );

  for (const result of results) {
    if (result.status === 'fulfilled') {
      entries.push(result.value);
    } else {
      logger.warn('Failed to fetch gas prices for chain comparison', {
        metadata: { error: result.reason instanceof Error ? result.reason.message : 'unknown' },
      });
    }
  }

  // Sort by USD cost ascending
  entries.sort((a, b) => parseFloat(a.estimatedTransferCostUSD) - parseFloat(b.estimatedTransferCostUSD));

  return {
    chains: entries,
    cheapest: entries.length > 0 ? entries[0] : null,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Estimate the cost of transferring a specific ERC-20 token.
 */
export async function estimateTransferCost(
  tokenAddress: string,
  from: string,
  to: string,
  amount: string,
  chainId: number
): Promise<GasEstimateResult> {
  // Encode ERC-20 transfer(address, uint256) calldata
  const transferSelector = '0xa9059cbb';
  const paddedTo = to.slice(2).toLowerCase().padStart(64, '0');
  const paddedAmount = BigInt(amount).toString(16).padStart(64, '0');
  const data = `${transferSelector}${paddedTo}${paddedAmount}`;

  return estimateGas(chainId, {
    from,
    to: tokenAddress,
    data,
    value: '0',
  });
}

// ============================================================================
// Utility Exports
// ============================================================================

export function listSupportedChains(): ChainConfig[] {
  return chainConfigs;
}

export { getChainConfig };
