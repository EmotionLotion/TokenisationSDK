/**
 * AlchemyBundler - Alchemy Bundler Integration
 *
 * Integrates with Alchemy's ERC-4337 bundler service (Account Kit).
 * Alchemy provides:
 * - Enterprise-grade reliability
 * - Gas manager for sponsorship
 * - Modular smart accounts
 *
 * @see https://docs.alchemy.com/docs/account-kit
 */

import type { Result } from '../../core/types.js';
import { ok, err } from '../../core/types.js';
import { AbstractBundler } from './AbstractBundler.js';
import type { BundlerConfig, BundlerGasPrices } from '../interfaces/IBundler.js';

/**
 * Alchemy-specific configuration
 */
export interface AlchemyConfig extends BundlerConfig {
  /** Alchemy API key */
  apiKey: string;
  /** Gas policy ID for sponsorship */
  gasPolicyId?: string;
}

/**
 * Alchemy chain network names
 */
const ALCHEMY_NETWORKS: Record<number, string> = {
  1: 'eth-mainnet',
  5: 'eth-goerli',
  11155111: 'eth-sepolia',
  8453: 'base-mainnet',
  84532: 'base-sepolia',
  137: 'polygon-mainnet',
  80001: 'polygon-mumbai',
  42161: 'arb-mainnet',
  421614: 'arb-sepolia',
  10: 'opt-mainnet',
  11155420: 'opt-sepolia',
};

/**
 * AlchemyBundler - Alchemy Bundler Implementation
 *
 * @example
 * ```typescript
 * const bundler = new AlchemyBundler({
 *   chainId: 8453,
 *   apiKey: 'YOUR_ALCHEMY_API_KEY',
 *   gasPolicyId: 'YOUR_GAS_POLICY_ID', // Optional
 * });
 *
 * // Send user operation
 * const result = await bundler.sendUserOperation(signedUserOp);
 * ```
 */
export class AlchemyBundler extends AbstractBundler {
  readonly providerId = 'alchemy';
  readonly providerName = 'Alchemy';

  private apiKey: string;
  private gasPolicyId?: string;

  constructor(config: AlchemyConfig) {
    super(config);
    this.apiKey = config.apiKey;
    this.gasPolicyId = config.gasPolicyId;
  }

  protected _getDefaultBundlerUrl(): string {
    const network = ALCHEMY_NETWORKS[this.chainId];
    if (!network) {
      throw new Error(`Alchemy does not support chain ${this.chainId}`);
    }
    return `https://${network}.g.alchemy.com/v2/${this.apiKey}`;
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
   * Get gas prices from Alchemy
   */
  async getGasPrices(): Promise<Result<BundlerGasPrices, string>> {
    // Alchemy uses standard eth_maxPriorityFeePerGas
    const [maxFeeResult, priorityFeeResult] = await Promise.all([
      this._rpcRequest<string>('eth_gasPrice', []),
      this._rpcRequest<string>('eth_maxPriorityFeePerGas', []),
    ]);

    if (!maxFeeResult.success || !priorityFeeResult.success) {
      return super.getGasPrices();
    }

    const maxFeePerGas = BigInt(maxFeeResult.data);
    const maxPriorityFeePerGas = BigInt(priorityFeeResult.data);

    return ok({
      standard: {
        maxFeePerGas,
        maxPriorityFeePerGas,
      },
      fast: {
        maxFeePerGas: maxFeePerGas * 120n / 100n,
        maxPriorityFeePerGas: maxPriorityFeePerGas * 120n / 100n,
      },
      instant: {
        maxFeePerGas: maxFeePerGas * 150n / 100n,
        maxPriorityFeePerGas: maxPriorityFeePerGas * 150n / 100n,
      },
    });
  }

  /**
   * Get paymaster data from Alchemy Gas Manager
   */
  async getPaymasterData(
    userOp: Record<string, unknown>
  ): Promise<Result<{
    paymaster: string;
    paymasterData: string;
    paymasterVerificationGasLimit: bigint;
    paymasterPostOpGasLimit: bigint;
  }, string>> {
    if (!this.gasPolicyId) {
      return err('Gas policy ID not configured');
    }

    const result = await this._rpcRequest<{
      paymaster: string;
      paymasterData: string;
      paymasterVerificationGasLimit: string;
      paymasterPostOpGasLimit: string;
    }>('alchemy_requestGasAndPaymasterAndData', [
      {
        policyId: this.gasPolicyId,
        entryPoint: this.entryPoint,
        userOperation: userOp,
      },
    ]);

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

  /**
   * Request gas and paymaster data in one call
   */
  async requestGasAndPaymasterData(
    userOp: Record<string, unknown>,
    overrides?: {
      maxFeePerGas?: string;
      maxPriorityFeePerGas?: string;
      callGasLimit?: string;
      verificationGasLimit?: string;
      preVerificationGas?: string;
    }
  ): Promise<Result<{
    paymaster: string;
    paymasterData: string;
    paymasterVerificationGasLimit: string;
    paymasterPostOpGasLimit: string;
    callGasLimit: string;
    verificationGasLimit: string;
    preVerificationGas: string;
    maxFeePerGas: string;
    maxPriorityFeePerGas: string;
  }, string>> {
    if (!this.gasPolicyId) {
      return err('Gas policy ID not configured');
    }

    return this._rpcRequest('alchemy_requestGasAndPaymasterAndData', [
      {
        policyId: this.gasPolicyId,
        entryPoint: this.entryPoint,
        userOperation: userOp,
        dummySignature: userOp.signature || '0x' + '00'.repeat(65),
        overrides,
      },
    ]);
  }

  /**
   * Simulate UserOperation with detailed traces
   */
  async simulateUserOperationWithTraces(
    userOp: Record<string, unknown>
  ): Promise<Result<{
    success: boolean;
    revertReason?: string;
    traces?: unknown[];
  }, string>> {
    const result = await this._rpcRequest<{
      simulationResult: {
        success: boolean;
        revertData?: string;
      };
      callTrace?: unknown[];
    }>('alchemy_simulateUserOperation', [
      userOp,
      this.entryPoint,
    ]);

    if (!result.success) {
      return err(result.error);
    }

    return ok({
      success: result.data.simulationResult.success,
      revertReason: result.data.simulationResult.revertData,
      traces: result.data.callTrace,
    });
  }
}

/**
 * Factory function
 */
export function createAlchemyBundler(config: AlchemyConfig): AlchemyBundler {
  return new AlchemyBundler(config);
}
