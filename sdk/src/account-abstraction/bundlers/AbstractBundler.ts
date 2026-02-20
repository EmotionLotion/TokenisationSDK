/**
 * AbstractBundler - Base Class for Bundler Implementations
 *
 * Provides shared functionality for ERC-4337 bundlers.
 * Extend this class to implement specific bundler backends.
 */

import type { Result } from '../../core/types.js';
import { ok, err } from '../../core/types.js';
import type {
  IBundler,
  BundlerConfig,
  BundlerStatus,
  BundlerGasPrices,
  SupportedEntryPoint,
  SendUserOperationOptions,
} from '../interfaces/IBundler.js';
import type {
  UserOperation,
  PackedUserOperation,
  UnsignedUserOperation,
  UserOperationReceipt,
  UserOperationByHash,
  UserOperationGasEstimate,
} from '../interfaces/UserOperation.js';
import { packUserOperation } from '../interfaces/UserOperation.js';

/**
 * ERC-4337 JSON-RPC methods
 */
const RPC_METHODS = {
  SEND_USER_OPERATION: 'eth_sendUserOperation',
  ESTIMATE_USER_OPERATION_GAS: 'eth_estimateUserOperationGas',
  GET_USER_OPERATION_BY_HASH: 'eth_getUserOperationByHash',
  GET_USER_OPERATION_RECEIPT: 'eth_getUserOperationReceipt',
  SUPPORTED_ENTRY_POINTS: 'eth_supportedEntryPoints',
  CHAIN_ID: 'eth_chainId',
  GET_NONCE: 'eth_getAccountNonce',
} as const;

/**
 * Default entry points
 */
const DEFAULT_ENTRY_POINTS = {
  V07: '0x0000000071727De22E5E9d8BAf0edAc6f37da032',
} as const;

/**
 * AbstractBundler - Base bundler implementation
 */
export abstract class AbstractBundler implements IBundler {
  abstract readonly providerId: string;
  abstract readonly providerName: string;

  readonly chainId: number;
  readonly entryPoint: string;

  protected config: BundlerConfig;
  protected bundlerUrl: string;

  constructor(config: BundlerConfig) {
    this.config = {
      timeout: 30000,
      debug: false,
      ...config,
    };
    this.chainId = config.chainId;
    this.entryPoint = config.entryPoint || DEFAULT_ENTRY_POINTS.V07;
    this.bundlerUrl = config.bundlerUrl || this._getDefaultBundlerUrl();
  }

  // ============================================================================
  // ABSTRACT METHODS
  // ============================================================================

  /**
   * Get default bundler URL for this provider
   */
  protected abstract _getDefaultBundlerUrl(): string;

  /**
   * Make RPC request to bundler
   */
  protected abstract _rpcRequest<T>(
    method: string,
    params: unknown[]
  ): Promise<Result<T, string>>;

  // ============================================================================
  // IBundler IMPLEMENTATION
  // ============================================================================

  async getStatus(): Promise<BundlerStatus> {
    try {
      const result = await this._rpcRequest<string[]>(
        RPC_METHODS.SUPPORTED_ENTRY_POINTS,
        []
      );
      return result.success ? 'online' : 'degraded';
    } catch {
      return 'offline';
    }
  }

  async getSupportedEntryPoints(): Promise<SupportedEntryPoint[]> {
    const result = await this._rpcRequest<string[]>(
      RPC_METHODS.SUPPORTED_ENTRY_POINTS,
      []
    );

    if (!result.success) {
      return [];
    }

    return result.data.map((address) => ({
      address,
      version: address.toLowerCase() === DEFAULT_ENTRY_POINTS.V07.toLowerCase()
        ? 'v0.7'
        : 'unknown',
    }));
  }

  async healthCheck(): Promise<boolean> {
    const status = await this.getStatus();
    return status === 'online';
  }

  async sendUserOperation(
    userOp: UserOperation | PackedUserOperation,
    options?: SendUserOperationOptions
  ): Promise<Result<{ userOpHash: string }, string>> {
    // Convert to packed format if needed
    const packedUserOp = 'accountGasLimits' in userOp
      ? userOp
      : packUserOperation(userOp as UserOperation);

    // Format for RPC
    const formattedUserOp = this._formatUserOpForRpc(packedUserOp);

    const result = await this._rpcRequest<string>(
      RPC_METHODS.SEND_USER_OPERATION,
      [formattedUserOp, this.entryPoint]
    );

    if (!result.success) {
      return err(result.error);
    }

    const userOpHash = result.data;

    // Wait for receipt if requested
    if (options?.waitForReceipt) {
      await this.waitForReceipt(userOpHash, options.timeout);
    }

    return ok({ userOpHash });
  }

  async getUserOperationByHash(
    userOpHash: string
  ): Promise<Result<UserOperationByHash | null, string>> {
    const result = await this._rpcRequest<UserOperationByHash | null>(
      RPC_METHODS.GET_USER_OPERATION_BY_HASH,
      [userOpHash]
    );

    if (!result.success) {
      return err(result.error);
    }

    return ok(result.data);
  }

  async getUserOperationReceipt(
    userOpHash: string
  ): Promise<Result<UserOperationReceipt | null, string>> {
    const result = await this._rpcRequest<UserOperationReceipt | null>(
      RPC_METHODS.GET_USER_OPERATION_RECEIPT,
      [userOpHash]
    );

    if (!result.success) {
      return err(result.error);
    }

    return ok(result.data);
  }

  async waitForReceipt(
    userOpHash: string,
    timeout: number = 60000
  ): Promise<Result<UserOperationReceipt, string>> {
    const startTime = Date.now();
    const pollInterval = 2000; // 2 seconds

    while (Date.now() - startTime < timeout) {
      const result = await this.getUserOperationReceipt(userOpHash);

      if (result.success && result.data) {
        return ok(result.data);
      }

      // Wait before next poll
      await this._delay(pollInterval);
    }

    return err(`Timeout waiting for UserOperation receipt: ${userOpHash}`);
  }

  async estimateUserOperationGas(
    userOp: UnsignedUserOperation
  ): Promise<Result<UserOperationGasEstimate, string>> {
    // Format for estimation (with dummy signature)
    const formattedUserOp = this._formatUserOpForRpc({
      ...packUserOperation({ ...userOp, signature: '0x' + '00'.repeat(65) }),
    });

    const result = await this._rpcRequest<{
      preVerificationGas: string;
      verificationGasLimit: string;
      callGasLimit: string;
      paymasterVerificationGasLimit?: string;
      paymasterPostOpGasLimit?: string;
    }>(
      RPC_METHODS.ESTIMATE_USER_OPERATION_GAS,
      [formattedUserOp, this.entryPoint]
    );

    if (!result.success) {
      return err(result.error);
    }

    return ok({
      preVerificationGas: BigInt(result.data.preVerificationGas),
      verificationGasLimit: BigInt(result.data.verificationGasLimit),
      callGasLimit: BigInt(result.data.callGasLimit),
      paymasterVerificationGasLimit: result.data.paymasterVerificationGasLimit
        ? BigInt(result.data.paymasterVerificationGasLimit)
        : undefined,
      paymasterPostOpGasLimit: result.data.paymasterPostOpGasLimit
        ? BigInt(result.data.paymasterPostOpGasLimit)
        : undefined,
    });
  }

  async getGasPrices(): Promise<Result<BundlerGasPrices, string>> {
    // Default implementation uses provider estimates
    // Subclasses can override for bundler-specific pricing
    return ok({
      standard: {
        maxFeePerGas: 1000000000n, // 1 gwei
        maxPriorityFeePerGas: 100000000n, // 0.1 gwei
      },
      fast: {
        maxFeePerGas: 2000000000n, // 2 gwei
        maxPriorityFeePerGas: 200000000n, // 0.2 gwei
      },
      instant: {
        maxFeePerGas: 5000000000n, // 5 gwei
        maxPriorityFeePerGas: 500000000n, // 0.5 gwei
      },
    });
  }

  async getAccountNonce(
    address: string,
    key: bigint = 0n
  ): Promise<Result<bigint, string>> {
    const result = await this._rpcRequest<string>(
      RPC_METHODS.GET_NONCE,
      [address, this._toHex(key)]
    );

    if (!result.success) {
      return err(result.error);
    }

    return ok(BigInt(result.data));
  }

  async simulateUserOperation(
    userOp: UserOperation | UnsignedUserOperation
  ): Promise<Result<{ success: boolean; revertReason?: string }, string>> {
    // Use estimation as simulation
    const fullUserOp: UserOperation = {
      ...userOp,
      signature: (userOp as UserOperation).signature || '0x' + '00'.repeat(65),
    };

    const estimate = await this.estimateUserOperationGas(fullUserOp);

    if (estimate.success) {
      return ok({ success: true });
    }

    return ok({
      success: false,
      revertReason: estimate.error,
    });
  }

  async validateUserOperation(
    userOp: UserOperation
  ): Promise<Result<void, string>> {
    // Basic validation
    if (!userOp.sender || userOp.sender === '0x') {
      return err('Invalid sender address');
    }
    if (!userOp.signature || userOp.signature === '0x') {
      return err('Missing signature');
    }
    if (!userOp.callData || userOp.callData === '0x') {
      return err('Missing call data');
    }
    return ok(undefined);
  }

  // ============================================================================
  // PROTECTED HELPERS
  // ============================================================================

  /**
   * Format UserOperation for RPC
   */
  protected _formatUserOpForRpc(
    userOp: PackedUserOperation
  ): Record<string, string> {
    return {
      sender: userOp.sender,
      nonce: this._toHex(userOp.nonce),
      initCode: userOp.initCode || '0x',
      callData: userOp.callData,
      accountGasLimits: userOp.accountGasLimits,
      preVerificationGas: this._toHex(userOp.preVerificationGas),
      gasFees: userOp.gasFees,
      paymasterAndData: userOp.paymasterAndData || '0x',
      signature: userOp.signature,
    };
  }

  /**
   * Convert bigint to hex string
   */
  protected _toHex(value: bigint): string {
    return '0x' + value.toString(16);
  }

  /**
   * Delay helper
   */
  protected _delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Log debug message
   */
  protected _debug(message: string, data?: unknown): void {
    if (this.config.debug) {
      console.log(`[${this.providerId}] ${message}`, data || '');
    }
  }
}
