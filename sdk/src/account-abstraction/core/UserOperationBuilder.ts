/**
 * UserOperationBuilder - Fluent Builder for UserOperations
 *
 * Provides a fluent API for constructing ERC-4337 UserOperations.
 * Handles gas estimation, paymaster integration, and signing.
 *
 * @example
 * ```typescript
 * const result = await sdk.aa
 *   .createBuilder(smartAccount)
 *   .addCall(tokenContract, 0n, transferData)
 *   .addCall(nftContract, 0n, mintData)
 *   .setPaymaster(sponsorPaymaster)
 *   .execute();
 * ```
 */

import type { Signer } from 'ethers';
import type { Result } from '../../core/types.js';
import { ok, err } from '../../core/types.js';
import type {
  UserOperation,
  UnsignedUserOperation,
  UserOperationCall,
  UserOperationCalls,
  UserOperationReceipt,
} from '../interfaces/UserOperation.js';
import type { ISmartAccount } from '../interfaces/ISmartAccount.js';
import type { IBundler } from '../interfaces/IBundler.js';
import type { IPaymaster, PaymasterData } from '../interfaces/IPaymaster.js';

/**
 * Builder configuration
 */
export interface UserOperationBuilderConfig {
  /** Smart account to build operations for */
  account: ISmartAccount;
  /** Bundler for submission */
  bundler: IBundler;
  /** Default paymaster (optional) */
  paymaster?: IPaymaster;
  /** Whether to auto-estimate gas */
  autoEstimateGas?: boolean;
  /** Whether to auto-populate gas prices */
  autoPopulateGasPrices?: boolean;
  /** Gas buffer multiplier (e.g., 1.2 for 20% buffer) */
  gasBufferMultiplier?: number;
}

/**
 * Execution options
 */
export interface ExecuteOptions {
  /** Whether to wait for receipt */
  waitForReceipt?: boolean;
  /** Receipt timeout (ms) */
  timeout?: number;
  /** Skip validation */
  skipValidation?: boolean;
}

/**
 * UserOperationBuilder - Fluent Builder for UserOperations
 */
export class UserOperationBuilder {
  private config: UserOperationBuilderConfig;
  private calls: UserOperationCalls = [];
  private nonceOverride?: bigint;
  private gasLimits: {
    callGasLimit?: bigint;
    verificationGasLimit?: bigint;
    preVerificationGas?: bigint;
  } = {};
  private gasPrices: {
    maxFeePerGas?: bigint;
    maxPriorityFeePerGas?: bigint;
  } = {};
  private paymasterOverride?: IPaymaster;
  private paymasterDataOverride?: PaymasterData;
  private customCallData?: string;
  private metadata: Record<string, unknown> = {};

  constructor(config: UserOperationBuilderConfig) {
    this.config = {
      autoEstimateGas: true,
      autoPopulateGasPrices: true,
      gasBufferMultiplier: 1.2,
      ...config,
    };
  }

  // ============================================================================
  // CALL BUILDING
  // ============================================================================

  /**
   * Add a call to the operation
   */
  addCall(to: string, value: bigint, data: string): this {
    this.calls.push({ to, value, data });
    return this;
  }

  /**
   * Add multiple calls
   */
  addCalls(calls: UserOperationCalls): this {
    this.calls.push(...calls);
    return this;
  }

  /**
   * Set custom call data (overrides calls)
   */
  setCallData(callData: string): this {
    this.customCallData = callData;
    return this;
  }

  /**
   * Clear all calls
   */
  clearCalls(): this {
    this.calls = [];
    this.customCallData = undefined;
    return this;
  }

  // ============================================================================
  // GAS CONFIGURATION
  // ============================================================================

  /**
   * Set custom nonce
   */
  setNonce(nonce: bigint): this {
    this.nonceOverride = nonce;
    return this;
  }

  /**
   * Set call gas limit
   */
  setCallGasLimit(limit: bigint): this {
    this.gasLimits.callGasLimit = limit;
    return this;
  }

  /**
   * Set verification gas limit
   */
  setVerificationGasLimit(limit: bigint): this {
    this.gasLimits.verificationGasLimit = limit;
    return this;
  }

  /**
   * Set pre-verification gas
   */
  setPreVerificationGas(gas: bigint): this {
    this.gasLimits.preVerificationGas = gas;
    return this;
  }

  /**
   * Set all gas limits at once
   */
  setGasLimits(limits: {
    callGasLimit?: bigint;
    verificationGasLimit?: bigint;
    preVerificationGas?: bigint;
  }): this {
    this.gasLimits = { ...this.gasLimits, ...limits };
    return this;
  }

  /**
   * Set max fee per gas
   */
  setMaxFeePerGas(fee: bigint): this {
    this.gasPrices.maxFeePerGas = fee;
    return this;
  }

  /**
   * Set max priority fee per gas
   */
  setMaxPriorityFeePerGas(fee: bigint): this {
    this.gasPrices.maxPriorityFeePerGas = fee;
    return this;
  }

  /**
   * Set gas prices
   */
  setGasPrices(prices: {
    maxFeePerGas?: bigint;
    maxPriorityFeePerGas?: bigint;
  }): this {
    this.gasPrices = { ...this.gasPrices, ...prices };
    return this;
  }

  // ============================================================================
  // PAYMASTER CONFIGURATION
  // ============================================================================

  /**
   * Set paymaster for gas sponsorship
   */
  setPaymaster(paymaster: IPaymaster): this {
    this.paymasterOverride = paymaster;
    return this;
  }

  /**
   * Set paymaster data directly
   */
  setPaymasterData(data: PaymasterData): this {
    this.paymasterDataOverride = data;
    return this;
  }

  /**
   * Clear paymaster (pay gas with native token)
   */
  clearPaymaster(): this {
    this.paymasterOverride = undefined;
    this.paymasterDataOverride = undefined;
    return this;
  }

  // ============================================================================
  // METADATA
  // ============================================================================

  /**
   * Set metadata for tracking
   */
  setMetadata(key: string, value: unknown): this {
    this.metadata[key] = value;
    return this;
  }

  // ============================================================================
  // BUILD
  // ============================================================================

  /**
   * Build the unsigned UserOperation
   */
  async build(): Promise<Result<UnsignedUserOperation, string>> {
    try {
      // Validate we have calls
      if (this.calls.length === 0 && !this.customCallData) {
        return err('No calls added to UserOperation');
      }

      // Get call data
      const callData = this.customCallData || await this.config.account.encodeCalls(this.calls);

      // Build base UserOp
      let userOp = await this.config.account.buildUserOperation({
        calls: this.calls,
        nonce: this.nonceOverride,
        callData: this.customCallData ? callData : undefined,
        gasLimits: this.gasLimits,
        gasPrices: this.gasPrices,
      });

      // Auto-populate gas prices if enabled
      if (this.config.autoPopulateGasPrices && (!userOp.maxFeePerGas || !userOp.maxPriorityFeePerGas)) {
        const gasPricesResult = await this.config.bundler.getGasPrices();
        if (gasPricesResult.success) {
          userOp.maxFeePerGas = userOp.maxFeePerGas || gasPricesResult.value.fast.maxFeePerGas;
          userOp.maxPriorityFeePerGas = userOp.maxPriorityFeePerGas || gasPricesResult.value.fast.maxPriorityFeePerGas;
        }
      }

      // Handle paymaster
      const paymaster = this.paymasterOverride || this.config.paymaster;
      if (paymaster && !this.paymasterDataOverride) {
        const pmDataResult = await paymaster.getPaymasterData(userOp);
        if (pmDataResult.success) {
          userOp = {
            ...userOp,
            paymaster: pmDataResult.value.paymaster,
            paymasterVerificationGasLimit: pmDataResult.value.paymasterVerificationGasLimit,
            paymasterPostOpGasLimit: pmDataResult.value.paymasterPostOpGasLimit,
            paymasterData: pmDataResult.value.paymasterData,
          };
        }
      } else if (this.paymasterDataOverride) {
        userOp = {
          ...userOp,
          paymaster: this.paymasterDataOverride.paymaster,
          paymasterVerificationGasLimit: this.paymasterDataOverride.paymasterVerificationGasLimit,
          paymasterPostOpGasLimit: this.paymasterDataOverride.paymasterPostOpGasLimit,
          paymasterData: this.paymasterDataOverride.paymasterData,
        };
      }

      // Auto-estimate gas if enabled
      if (this.config.autoEstimateGas) {
        const gasEstimate = await this.config.bundler.estimateUserOperationGas(userOp);
        if (gasEstimate.success) {
          const multiplier = this.config.gasBufferMultiplier || 1.2;
          userOp.callGasLimit = userOp.callGasLimit || BigInt(Math.ceil(Number(gasEstimate.value.callGasLimit) * multiplier));
          userOp.verificationGasLimit = userOp.verificationGasLimit || BigInt(Math.ceil(Number(gasEstimate.value.verificationGasLimit) * multiplier));
          userOp.preVerificationGas = userOp.preVerificationGas || BigInt(Math.ceil(Number(gasEstimate.value.preVerificationGas) * multiplier));
        }
      }

      return ok(userOp);
    } catch (error) {
      return err(`Failed to build UserOperation: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Build and sign the UserOperation
   */
  async buildAndSign(): Promise<Result<UserOperation, string>> {
    const buildResult = await this.build();
    if (!buildResult.success) {
      return err(buildResult.error);
    }

    try {
      const signedUserOp = await this.config.account.signUserOperation(buildResult.value);
      return ok(signedUserOp);
    } catch (error) {
      return err(`Failed to sign UserOperation: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // ============================================================================
  // EXECUTE
  // ============================================================================

  /**
   * Build, sign, and send the UserOperation
   */
  async execute(options: ExecuteOptions = {}): Promise<Result<{
    userOpHash: string;
    receipt?: UserOperationReceipt;
  }, string>> {
    // Build and sign
    const signedResult = await this.buildAndSign();
    if (!signedResult.success) {
      return err(signedResult.error);
    }

    const signedUserOp = signedResult.value;

    // Validate if not skipped
    if (!options.skipValidation) {
      const validationResult = await this.config.bundler.validateUserOperation(signedUserOp);
      if (!validationResult.success) {
        return err(`Validation failed: ${validationResult.error}`);
      }
    }

    // Send to bundler
    const sendResult = await this.config.bundler.sendUserOperation(signedUserOp);
    if (!sendResult.success) {
      return err(`Failed to send UserOperation: ${sendResult.error}`);
    }

    const { userOpHash } = sendResult.value;

    // Wait for receipt if requested
    if (options.waitForReceipt) {
      const receiptResult = await this.config.bundler.waitForReceipt(
        userOpHash,
        options.timeout || 60000
      );

      if (receiptResult.success) {
        return ok({
          userOpHash,
          receipt: receiptResult.value,
        });
      }

      // Return hash even if receipt wait failed
      return ok({ userOpHash });
    }

    return ok({ userOpHash });
  }

  /**
   * Simulate the UserOperation without sending
   */
  async simulate(): Promise<Result<{ success: boolean; revertReason?: string }, string>> {
    const buildResult = await this.build();
    if (!buildResult.success) {
      return err(buildResult.error);
    }

    return this.config.bundler.simulateUserOperation(buildResult.value);
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================

  /**
   * Get estimated cost in wei
   */
  async estimateCost(): Promise<Result<bigint, string>> {
    const buildResult = await this.build();
    if (!buildResult.success) {
      return err(buildResult.error);
    }

    const userOp = buildResult.value;
    const totalGas = (userOp.callGasLimit || 0n) +
      (userOp.verificationGasLimit || 0n) +
      (userOp.preVerificationGas || 0n);

    const maxFeePerGas = userOp.maxFeePerGas || 0n;
    const estimatedCost = totalGas * maxFeePerGas;

    return ok(estimatedCost);
  }

  /**
   * Create a copy of this builder
   */
  clone(): UserOperationBuilder {
    const builder = new UserOperationBuilder(this.config);
    builder.calls = [...this.calls];
    builder.nonceOverride = this.nonceOverride;
    builder.gasLimits = { ...this.gasLimits };
    builder.gasPrices = { ...this.gasPrices };
    builder.paymasterOverride = this.paymasterOverride;
    builder.paymasterDataOverride = this.paymasterDataOverride;
    builder.customCallData = this.customCallData;
    builder.metadata = { ...this.metadata };
    return builder;
  }

  /**
   * Reset the builder state
   */
  reset(): this {
    this.calls = [];
    this.nonceOverride = undefined;
    this.gasLimits = {};
    this.gasPrices = {};
    this.paymasterOverride = undefined;
    this.paymasterDataOverride = undefined;
    this.customCallData = undefined;
    this.metadata = {};
    return this;
  }
}

/**
 * Factory function to create a UserOperationBuilder
 */
export function createUserOperationBuilder(
  config: UserOperationBuilderConfig
): UserOperationBuilder {
  return new UserOperationBuilder(config);
}
