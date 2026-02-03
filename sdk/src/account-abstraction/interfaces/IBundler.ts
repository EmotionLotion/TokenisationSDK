/**
 * IBundler - Bundler Interface
 *
 * Defines the interface for ERC-4337 bundlers.
 * Bundlers are responsible for:
 * - Receiving UserOperations from users
 * - Bundling multiple UserOperations into a single transaction
 * - Submitting bundles to the EntryPoint contract
 * - Providing gas estimation and status tracking
 */

import type { Result } from '../../core/types.js';
import type {
  UserOperation,
  PackedUserOperation,
  UnsignedUserOperation,
  UserOperationReceipt,
  UserOperationByHash,
  UserOperationGasEstimate,
} from './UserOperation.js';

/**
 * Bundler status
 */
export type BundlerStatus = 'online' | 'degraded' | 'offline';

/**
 * Supported entry points
 */
export interface SupportedEntryPoint {
  address: string;
  version: string;
}

/**
 * Bundler chain configuration
 */
export interface BundlerChainConfig {
  chainId: number;
  entryPoint: string;
  bundlerUrl: string;
}

/**
 * Gas price info from bundler
 */
export interface BundlerGasPrices {
  /** Standard gas price */
  standard: {
    maxFeePerGas: bigint;
    maxPriorityFeePerGas: bigint;
  };
  /** Fast gas price */
  fast: {
    maxFeePerGas: bigint;
    maxPriorityFeePerGas: bigint;
  };
  /** Instant gas price (highest priority) */
  instant: {
    maxFeePerGas: bigint;
    maxPriorityFeePerGas: bigint;
  };
}

/**
 * UserOperation submission options
 */
export interface SendUserOperationOptions {
  /** Whether to wait for the operation to be included */
  waitForReceipt?: boolean;
  /** Timeout for waiting (ms) */
  timeout?: number;
  /** Whether to replace an existing pending operation */
  replace?: boolean;
}

/**
 * IBundler - Bundler Interface
 *
 * @example
 * ```typescript
 * const bundler = new PimlicoBundler({
 *   chainId: 8453,
 *   apiKey: 'YOUR_API_KEY',
 * });
 *
 * // Send a user operation
 * const result = await bundler.sendUserOperation(userOp);
 * if (result.success) {
 *   console.log('UserOp Hash:', result.value.userOpHash);
 *
 *   // Wait for receipt
 *   const receipt = await bundler.waitForReceipt(result.value.userOpHash);
 * }
 * ```
 */
export interface IBundler {
  // ============================================================================
  // BUNDLER INFO
  // ============================================================================

  /** Bundler provider ID */
  readonly providerId: string;

  /** Bundler provider name */
  readonly providerName: string;

  /** Chain ID this bundler is configured for */
  readonly chainId: number;

  /** Entry point address */
  readonly entryPoint: string;

  /**
   * Get bundler status
   */
  getStatus(): Promise<BundlerStatus>;

  /**
   * Get supported entry points
   */
  getSupportedEntryPoints(): Promise<SupportedEntryPoint[]>;

  /**
   * Check if bundler is healthy
   */
  healthCheck(): Promise<boolean>;

  // ============================================================================
  // USER OPERATION SUBMISSION
  // ============================================================================

  /**
   * Send a UserOperation to the bundler
   *
   * @param userOp - The signed UserOperation to send
   * @param options - Submission options
   * @returns The UserOperation hash
   */
  sendUserOperation(
    userOp: UserOperation | PackedUserOperation,
    options?: SendUserOperationOptions
  ): Promise<Result<{ userOpHash: string }, string>>;

  /**
   * Get a UserOperation by its hash
   *
   * @param userOpHash - The UserOperation hash
   */
  getUserOperationByHash(userOpHash: string): Promise<Result<UserOperationByHash | null, string>>;

  /**
   * Get UserOperation receipt
   *
   * @param userOpHash - The UserOperation hash
   */
  getUserOperationReceipt(userOpHash: string): Promise<Result<UserOperationReceipt | null, string>>;

  /**
   * Wait for UserOperation receipt
   *
   * @param userOpHash - The UserOperation hash
   * @param timeout - Timeout in milliseconds (default: 60000)
   */
  waitForReceipt(userOpHash: string, timeout?: number): Promise<Result<UserOperationReceipt, string>>;

  // ============================================================================
  // GAS ESTIMATION
  // ============================================================================

  /**
   * Estimate gas for a UserOperation
   *
   * @param userOp - The unsigned UserOperation
   */
  estimateUserOperationGas(
    userOp: UnsignedUserOperation
  ): Promise<Result<UserOperationGasEstimate, string>>;

  /**
   * Get current gas prices
   */
  getGasPrices(): Promise<Result<BundlerGasPrices, string>>;

  // ============================================================================
  // UTILITIES
  // ============================================================================

  /**
   * Get the account nonce from the EntryPoint
   *
   * @param address - The account address
   * @param key - The nonce key (default: 0)
   */
  getAccountNonce(address: string, key?: bigint): Promise<Result<bigint, string>>;

  /**
   * Simulate UserOperation execution
   *
   * @param userOp - The UserOperation to simulate
   */
  simulateUserOperation(
    userOp: UserOperation | UnsignedUserOperation
  ): Promise<Result<{ success: boolean; revertReason?: string }, string>>;

  /**
   * Validate a UserOperation without submitting
   */
  validateUserOperation(userOp: UserOperation): Promise<Result<void, string>>;

  /**
   * Debug trace a UserOperation (if supported)
   */
  debugTraceUserOperation?(
    userOpHash: string
  ): Promise<Result<Record<string, unknown>, string>>;
}

/**
 * Bundler configuration
 */
export interface BundlerConfig {
  /** Chain ID */
  chainId: number;
  /** Entry point address (default: v0.7 entry point) */
  entryPoint?: string;
  /** API key for the bundler service */
  apiKey?: string;
  /** Custom bundler URL */
  bundlerUrl?: string;
  /** Request timeout (ms) */
  timeout?: number;
  /** Enable debug mode */
  debug?: boolean;
}
