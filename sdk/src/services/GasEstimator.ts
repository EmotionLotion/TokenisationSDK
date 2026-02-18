/**
 * GasEstimator - Client-side gas estimation service.
 *
 * Fetches gas estimates from the server's /api/v1/gas/estimate endpoint
 * and provides formatted fee information for display.
 *
 * @example
 * ```typescript
 * import { GasEstimator } from '@tokenisation/sdk';
 *
 * const estimator = new GasEstimator('https://api.example.com');
 * const estimate = await estimator.estimateTransfer(137);
 * console.log(estimate.displayCost); // "0.003421 MATIC"
 * ```
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GasOperation = 'mint' | 'transfer' | 'redeem' | 'approve';

export interface GasEstimate {
  /** Chain ID the estimate is for */
  chainId: number;
  /** Chain display name */
  chainName: string;
  /** Native currency symbol (e.g., "ETH", "MATIC") */
  nativeSymbol: string;
  /** Estimated gas units needed */
  gasLimit: string;
  /** Current gas price in wei */
  gasPrice: string;
  /** EIP-1559 max fee per gas in wei */
  maxFeePerGas: string;
  /** EIP-1559 max priority fee per gas in wei */
  maxPriorityFeePerGas: string;
  /** Estimated total cost in wei */
  estimatedCostWei: string;
  /** Estimated cost in native token (human-readable, e.g., "0.003421") */
  estimatedCostNative: string;
  /** Formatted display string (e.g., "0.003421 MATIC") */
  displayCost: string;
  /** Gas price in gwei for display */
  gasPriceGwei: string;
  /** Whether this result was served from cache */
  cached: boolean;
  /** Server timestamp of the estimate */
  timestamp: string;
}

export interface GasEstimatorConfig {
  /** Base API URL (e.g., "https://api.example.com") */
  apiUrl: string;
  /** Optional org ID header */
  orgId?: string;
  /** Optional additional headers */
  headers?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class GasEstimator {
  private readonly apiUrl: string;
  private readonly orgId?: string;
  private readonly headers: Record<string, string>;

  constructor(config: GasEstimatorConfig | string) {
    if (typeof config === 'string') {
      this.apiUrl = config;
      this.headers = {};
    } else {
      this.apiUrl = config.apiUrl;
      this.orgId = config.orgId;
      this.headers = config.headers ?? {};
    }
  }

  /**
   * Estimate gas for a mint operation.
   */
  async estimateMint(chainId: number, contractAddress?: string): Promise<GasEstimate> {
    return this.estimate(chainId, 'mint', contractAddress);
  }

  /**
   * Estimate gas for a transfer operation.
   */
  async estimateTransfer(chainId: number, contractAddress?: string): Promise<GasEstimate> {
    return this.estimate(chainId, 'transfer', contractAddress);
  }

  /**
   * Estimate gas for a redemption (burn) operation.
   */
  async estimateRedeem(chainId: number, contractAddress?: string): Promise<GasEstimate> {
    return this.estimate(chainId, 'redeem', contractAddress);
  }

  /**
   * Estimate gas for an approve operation.
   */
  async estimateApprove(chainId: number, contractAddress?: string): Promise<GasEstimate> {
    return this.estimate(chainId, 'approve', contractAddress);
  }

  /**
   * Get current gas price for a chain.
   */
  async getGasPrice(chainId: number): Promise<{
    gasPrice: string;
    gasPriceGwei: string;
    maxFeePerGas: string;
    maxPriorityFeePerGas: string;
    nativeSymbol: string;
  }> {
    const params = new URLSearchParams({ chainId: String(chainId) });
    const response = await this.fetchApi(`/api/v1/gas/price?${params}`);
    return response.data;
  }

  /**
   * Generic estimate for any operation type.
   */
  async estimate(
    chainId: number,
    operation: GasOperation = 'transfer',
    contractAddress?: string,
  ): Promise<GasEstimate> {
    const params = new URLSearchParams({
      chainId: String(chainId),
      operation,
    });
    if (contractAddress) {
      params.set('to', contractAddress);
    }

    const response = await this.fetchApi(`/api/v1/gas/estimate?${params}`);
    const data = response.data;

    return {
      chainId: data.chainId,
      chainName: data.chainName,
      nativeSymbol: data.nativeSymbol,
      gasLimit: data.gasLimit,
      gasPrice: data.gasPrice,
      maxFeePerGas: data.maxFeePerGas,
      maxPriorityFeePerGas: data.maxPriorityFeePerGas,
      estimatedCostWei: data.estimatedCostWei,
      estimatedCostNative: data.estimatedCostNative,
      displayCost: `${data.estimatedCostNative} ${data.nativeSymbol}`,
      gasPriceGwei: this.weiToGwei(data.gasPrice),
      cached: response.cached ?? false,
      timestamp: data.timestamp,
    };
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /**
   * Format a fee for display.
   * E.g., formatFee("3421000000000000", "ETH") => "0.003421 ETH"
   */
  static formatFee(costWei: string, symbol: string, decimals: number = 18): string {
    const native = GasEstimator.weiToNative(costWei, decimals);
    return `${native} ${symbol}`;
  }

  /**
   * Convert wei to native token amount string.
   */
  static weiToNative(wei: string, decimals: number = 18): string {
    const value = BigInt(wei);
    const divisor = BigInt(10 ** decimals);
    const whole = value / divisor;
    const frac = value % divisor;
    const fracStr = frac.toString().padStart(decimals, '0').slice(0, 6);
    // Trim trailing zeros
    const trimmed = fracStr.replace(/0+$/, '') || '0';
    return `${whole}.${trimmed}`;
  }

  private weiToGwei(wei: string): string {
    const value = BigInt(wei);
    const gwei = value / BigInt(1e9);
    const fracGwei = Number(value % BigInt(1e9)) / 1e9;
    return (Number(gwei) + fracGwei).toFixed(2);
  }

  private async fetchApi(path: string): Promise<any> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.headers,
    };
    if (this.orgId) {
      headers['X-Org-Id'] = this.orgId;
    }

    const response = await fetch(`${this.apiUrl}${path}`, { headers });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Gas estimation failed: ${response.status}`);
    }

    return response.json();
  }
}
