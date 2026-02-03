/**
 * BiconomyBundler - Biconomy Bundler Integration
 *
 * Integrates with Biconomy's ERC-4337 bundler service.
 * Biconomy provides:
 * - Smart account infrastructure
 * - Gasless transactions via paymaster
 * - Session keys for improved UX
 *
 * @see https://docs.biconomy.io/
 */

import type { Result } from '../../core/types.js';
import { ok, err } from '../../core/types.js';
import { AbstractBundler } from './AbstractBundler.js';
import type { BundlerConfig, BundlerGasPrices } from '../interfaces/IBundler.js';

/**
 * Biconomy-specific configuration
 */
export interface BiconomyConfig extends BundlerConfig {
  /** Biconomy API key */
  apiKey: string;
  /** Biconomy paymaster API key (optional) */
  paymasterApiKey?: string;
}

/**
 * Biconomy chain endpoints
 */
const BICONOMY_ENDPOINTS: Record<number, string> = {
  1: 'https://bundler.biconomy.io/api/v2/1',
  8453: 'https://bundler.biconomy.io/api/v2/8453',
  84532: 'https://bundler.biconomy.io/api/v2/84532',
  137: 'https://bundler.biconomy.io/api/v2/137',
  42161: 'https://bundler.biconomy.io/api/v2/42161',
  10: 'https://bundler.biconomy.io/api/v2/10',
  56: 'https://bundler.biconomy.io/api/v2/56',
  43114: 'https://bundler.biconomy.io/api/v2/43114',
};

/**
 * BiconomyBundler - Biconomy Bundler Implementation
 *
 * @example
 * ```typescript
 * const bundler = new BiconomyBundler({
 *   chainId: 8453,
 *   apiKey: 'YOUR_BICONOMY_API_KEY',
 * });
 *
 * // Send user operation
 * const result = await bundler.sendUserOperation(signedUserOp);
 * ```
 */
export class BiconomyBundler extends AbstractBundler {
  readonly providerId = 'biconomy';
  readonly providerName = 'Biconomy';

  private apiKey: string;
  private paymasterApiKey?: string;

  constructor(config: BiconomyConfig) {
    super(config);
    this.apiKey = config.apiKey;
    this.paymasterApiKey = config.paymasterApiKey;
  }

  protected _getDefaultBundlerUrl(): string {
    const baseUrl = BICONOMY_ENDPOINTS[this.chainId];
    if (!baseUrl) {
      throw new Error(`Biconomy does not support chain ${this.chainId}`);
    }
    return `${baseUrl}/${this.apiKey}`;
  }

  protected async _rpcRequest<T>(
    method: string,
    params: unknown[]
  ): Promise<Result<T, string>> {
    try {
      this._debug(`RPC Request: ${method}`, params);

      const response = await fetch(this.bundlerUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method,
          params,
        }),
      });

      if (!response.ok) {
        return err(`HTTP error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      if (data.error) {
        return err(`RPC error: ${data.error.message || JSON.stringify(data.error)}`);
      }

      this._debug(`RPC Response: ${method}`, data.result);
      return ok(data.result);
    } catch (error) {
      return err(`Request failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get gas prices from Biconomy
   */
  async getGasPrices(): Promise<Result<BundlerGasPrices, string>> {
    const result = await this._rpcRequest<{
      maxFeePerGas: string;
      maxPriorityFeePerGas: string;
    }>('biconomy_getGasFeeValues', []);

    if (!result.success) {
      return super.getGasPrices();
    }

    const maxFeePerGas = BigInt(result.value.maxFeePerGas);
    const maxPriorityFeePerGas = BigInt(result.value.maxPriorityFeePerGas);

    return ok({
      standard: {
        maxFeePerGas: maxFeePerGas * 80n / 100n,
        maxPriorityFeePerGas: maxPriorityFeePerGas * 80n / 100n,
      },
      fast: {
        maxFeePerGas,
        maxPriorityFeePerGas,
      },
      instant: {
        maxFeePerGas: maxFeePerGas * 150n / 100n,
        maxPriorityFeePerGas: maxPriorityFeePerGas * 150n / 100n,
      },
    });
  }

  /**
   * Get paymaster data from Biconomy
   */
  async getPaymasterData(
    userOp: Record<string, unknown>,
    mode: 'SPONSORED' | 'ERC20' = 'SPONSORED',
    tokenAddress?: string
  ): Promise<Result<{
    paymaster: string;
    paymasterData: string;
    paymasterVerificationGasLimit: bigint;
    paymasterPostOpGasLimit: bigint;
  }, string>> {
    if (!this.paymasterApiKey) {
      return err('Paymaster API key not configured');
    }

    const paymasterUrl = `https://paymaster.biconomy.io/api/v1/${this.chainId}/${this.paymasterApiKey}`;

    try {
      const response = await fetch(paymasterUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          method: 'pm_sponsorUserOperation',
          params: [
            userOp,
            this.entryPoint,
            {
              mode,
              ...(tokenAddress && { tokenInfo: { feeTokenAddress: tokenAddress } }),
            },
          ],
          id: Date.now(),
          jsonrpc: '2.0',
        }),
      });

      if (!response.ok) {
        return err(`HTTP error: ${response.status}`);
      }

      const data = await response.json();

      if (data.error) {
        return err(`Paymaster error: ${data.error.message}`);
      }

      return ok({
        paymaster: data.result.paymaster,
        paymasterData: data.result.paymasterData,
        paymasterVerificationGasLimit: BigInt(data.result.paymasterVerificationGasLimit || '100000'),
        paymasterPostOpGasLimit: BigInt(data.result.paymasterPostOpGasLimit || '50000'),
      });
    } catch (error) {
      return err(`Paymaster request failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get supported tokens for ERC-20 paymaster
   */
  async getSupportedTokens(): Promise<Result<Array<{
    address: string;
    symbol: string;
    decimals: number;
  }>, string>> {
    if (!this.paymasterApiKey) {
      return err('Paymaster API key not configured');
    }

    // Biconomy-specific API for supported tokens
    // In production, this would call the actual API
    return ok([
      { address: '0xA0b86a42e68F8Ef7B0A2eF24F2A47cB8e91D9d8e', symbol: 'USDC', decimals: 6 },
      { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', symbol: 'USDT', decimals: 6 },
    ]);
  }
}

/**
 * Factory function
 */
export function createBiconomyBundler(config: BiconomyConfig): BiconomyBundler {
  return new BiconomyBundler(config);
}
