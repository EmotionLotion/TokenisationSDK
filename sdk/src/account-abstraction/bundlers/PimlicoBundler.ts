/**
 * PimlicoBundler - Pimlico Bundler Integration
 *
 * Integrates with Pimlico's ERC-4337 bundler service.
 * Pimlico provides:
 * - Fast UserOperation bundling
 * - Gas estimation
 * - Paymaster sponsorship
 *
 * @see https://docs.pimlico.io/
 */

import type { Result } from '../../core/types.js';
import { ok, err } from '../../core/types.js';
import { AbstractBundler } from './AbstractBundler.js';
import type { BundlerConfig, BundlerGasPrices } from '../interfaces/IBundler.js';

/**
 * Pimlico-specific configuration
 */
export interface PimlicoConfig extends BundlerConfig {
  /** Pimlico API key */
  apiKey: string;
  /** Use sponsorship API */
  sponsorship?: boolean;
}

/**
 * Pimlico chain endpoints
 */
const PIMLICO_ENDPOINTS: Record<number, string> = {
  1: 'https://api.pimlico.io/v2/ethereum/rpc',
  8453: 'https://api.pimlico.io/v2/base/rpc',
  84532: 'https://api.pimlico.io/v2/base-sepolia/rpc',
  137: 'https://api.pimlico.io/v2/polygon/rpc',
  42161: 'https://api.pimlico.io/v2/arbitrum/rpc',
  10: 'https://api.pimlico.io/v2/optimism/rpc',
};

/**
 * PimlicoBundler - Pimlico Bundler Implementation
 *
 * @example
 * ```typescript
 * const bundler = new PimlicoBundler({
 *   chainId: 8453,
 *   apiKey: 'YOUR_PIMLICO_API_KEY',
 * });
 *
 * // Send user operation
 * const result = await bundler.sendUserOperation(signedUserOp);
 *
 * // Get gas prices
 * const gasPrices = await bundler.getGasPrices();
 * ```
 */
export class PimlicoBundler extends AbstractBundler {
  readonly providerId = 'pimlico';
  readonly providerName = 'Pimlico';

  private apiKey: string;
  private sponsorship: boolean;

  constructor(config: PimlicoConfig) {
    super(config);
    this.apiKey = config.apiKey;
    this.sponsorship = config.sponsorship ?? false;
  }

  protected _getDefaultBundlerUrl(): string {
    const baseUrl = PIMLICO_ENDPOINTS[this.chainId];
    if (!baseUrl) {
      throw new Error(`Pimlico does not support chain ${this.chainId}`);
    }
    return `${baseUrl}?apikey=${this.apiKey}`;
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
   * Get gas prices from Pimlico
   */
  async getGasPrices(): Promise<Result<BundlerGasPrices, string>> {
    // Pimlico-specific gas price API
    const result = await this._rpcRequest<{
      slow: { maxFeePerGas: string; maxPriorityFeePerGas: string };
      standard: { maxFeePerGas: string; maxPriorityFeePerGas: string };
      fast: { maxFeePerGas: string; maxPriorityFeePerGas: string };
    }>('pimlico_getUserOperationGasPrice', []);

    if (!result.success) {
      // Fall back to default
      return super.getGasPrices();
    }

    return ok({
      standard: {
        maxFeePerGas: BigInt(result.data.standard.maxFeePerGas),
        maxPriorityFeePerGas: BigInt(result.data.standard.maxPriorityFeePerGas),
      },
      fast: {
        maxFeePerGas: BigInt(result.data.fast.maxFeePerGas),
        maxPriorityFeePerGas: BigInt(result.data.fast.maxPriorityFeePerGas),
      },
      instant: {
        maxFeePerGas: BigInt(result.data.fast.maxFeePerGas) * 150n / 100n,
        maxPriorityFeePerGas: BigInt(result.data.fast.maxPriorityFeePerGas) * 150n / 100n,
      },
    });
  }

  /**
   * Get sponsorship data from Pimlico
   */
  async getPaymasterData(
    userOp: Record<string, unknown>,
    sponsorshipPolicyId?: string
  ): Promise<Result<{
    paymaster: string;
    paymasterData: string;
    paymasterVerificationGasLimit: bigint;
    paymasterPostOpGasLimit: bigint;
  }, string>> {
    if (!this.sponsorship) {
      return err('Sponsorship not enabled');
    }

    const params: unknown[] = [userOp, this.config.entryPoint];
    if (sponsorshipPolicyId) {
      params.push({ sponsorshipPolicyId });
    }

    const result = await this._rpcRequest<{
      paymaster: string;
      paymasterData: string;
      paymasterVerificationGasLimit: string;
      paymasterPostOpGasLimit: string;
    }>('pm_sponsorUserOperation', params);

    if (!result.success) {
      return err(result.error);
    }

    return ok({
      paymaster: result.data.paymaster,
      paymasterData: result.data.paymasterData,
      paymasterVerificationGasLimit: BigInt(result.data.paymasterVerificationGasLimit),
      paymasterPostOpGasLimit: BigInt(result.data.paymasterPostOpGasLimit),
    });
  }
}

/**
 * Factory function
 */
export function createPimlicoBundler(config: PimlicoConfig): PimlicoBundler {
  return new PimlicoBundler(config);
}
