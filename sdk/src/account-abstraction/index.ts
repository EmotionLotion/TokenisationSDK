/**
 * Account Abstraction Module (ERC-4337)
 *
 * Provides smart account infrastructure for gasless and batched transactions:
 * - Smart Accounts (SimpleAccount, MultiSig)
 * - Bundlers (Pimlico, Biconomy, Alchemy)
 * - Paymasters (Verifying, Sponsor)
 * - UserOperation Builder
 *
 * @example
 * ```typescript
 * import { TokenisationSDK } from '@tokenisation/sdk';
 *
 * const sdk = new TokenisationSDK();
 *
 * // Create a smart account
 * const account = await sdk.aa.createSmartAccount({
 *   owner: signer,
 *   chainId: 8453,
 * });
 *
 * // Build and execute a gasless transaction
 * const result = await sdk.aa
 *   .createBuilder(account)
 *   .addCall(tokenAddress, 0n, transferData)
 *   .setPaymaster(sponsorPaymaster)
 *   .execute();
 * ```
 *
 * @module
 */

// ============================================================================
// INTERFACES
// ============================================================================

export * from './interfaces/index.js';

// ============================================================================
// CORE
// ============================================================================

export {
  UserOperationBuilder,
  createUserOperationBuilder,
  type UserOperationBuilderConfig,
  type ExecuteOptions,
} from './core/UserOperationBuilder.js';

export {
  SmartAccountFactory,
  createSmartAccountFactory,
  ENTRY_POINTS,
  ACCOUNT_FACTORIES,
  type SmartAccountFactoryConfig,
  type CreateAccountParams,
} from './core/SmartAccountFactory.js';

// ============================================================================
// BUNDLERS
// ============================================================================

export { AbstractBundler } from './bundlers/AbstractBundler.js';

export {
  PimlicoBundler,
  createPimlicoBundler,
  type PimlicoConfig,
} from './bundlers/PimlicoBundler.js';

export {
  BiconomyBundler,
  createBiconomyBundler,
  type BiconomyConfig,
} from './bundlers/BiconomyBundler.js';

export {
  AlchemyBundler,
  createAlchemyBundler,
  type AlchemyConfig,
} from './bundlers/AlchemyBundler.js';

// ============================================================================
// PAYMASTERS
// ============================================================================

export {
  VerifyingPaymaster,
  createVerifyingPaymaster,
} from './paymasters/VerifyingPaymaster.js';

export {
  SponsorPaymaster,
  createSponsorPaymaster,
} from './paymasters/SponsorPaymaster.js';

// ============================================================================
// AA MODULE CLASS
// ============================================================================

import type { Signer, Provider } from 'ethers';
import type { Result } from '../core/types.js';
import { ok, err } from '../core/types.js';
import type { ISmartAccount, SmartAccountConfig } from './interfaces/ISmartAccount.js';
import type { IBundler } from './interfaces/IBundler.js';
import type { IPaymaster } from './interfaces/IPaymaster.js';
import { SmartAccountFactory, type SmartAccountFactoryConfig } from './core/SmartAccountFactory.js';
import { UserOperationBuilder, type UserOperationBuilderConfig } from './core/UserOperationBuilder.js';

/**
 * Account Abstraction module configuration
 */
export interface AAModuleConfig {
  /** Chain ID */
  chainId: number;
  /** JSON-RPC provider */
  provider: Provider;
  /** Default bundler */
  bundler?: IBundler;
  /** Default paymaster */
  paymaster?: IPaymaster;
  /** Entry point address */
  entryPoint?: string;
}

/**
 * Account creation options
 */
export interface CreateSmartAccountOptions {
  /** Account owner signer */
  owner: Signer;
  /** Chain ID (optional if set in module config) */
  chainId?: number;
  /** Salt for address derivation */
  salt?: bigint;
  /** Account type */
  type?: 'simple' | 'multisig';
  /** Additional owners (for multi-sig) */
  additionalOwners?: string[];
  /** Signing threshold (for multi-sig) */
  threshold?: number;
}

/**
 * AAModule - Account Abstraction Module
 *
 * Main entry point for ERC-4337 account abstraction in the SDK.
 *
 * @example
 * ```typescript
 * // Access via SDK
 * const account = await sdk.aa.createSmartAccount({ owner: signer });
 *
 * // Execute gasless transaction
 * const result = await sdk.aa.execute({
 *   account,
 *   calls: [{ to, value, data }],
 *   sponsorship: true,
 * });
 * ```
 */
export class AAModule {
  private config: AAModuleConfig;
  private factory: SmartAccountFactory;
  private defaultBundler?: IBundler;
  private defaultPaymaster?: IPaymaster;

  constructor(config: AAModuleConfig) {
    this.config = config;
    this.factory = new SmartAccountFactory({
      chainId: config.chainId,
      provider: config.provider,
      entryPoint: config.entryPoint,
    });
    this.defaultBundler = config.bundler;
    this.defaultPaymaster = config.paymaster;
  }

  // ============================================================================
  // ACCOUNT MANAGEMENT
  // ============================================================================

  /**
   * Create a new smart account
   */
  async createSmartAccount(
    options: CreateSmartAccountOptions
  ): Promise<Result<ISmartAccount, string>> {
    const chainId = options.chainId || this.config.chainId;

    if (options.type === 'multisig' && options.additionalOwners) {
      return this.factory.createMultiSigAccount(
        options.owner,
        options.additionalOwners,
        options.threshold || 2,
        { salt: options.salt }
      );
    }

    return this.factory.createSimpleAccount(options.owner, {
      salt: options.salt,
    });
  }

  /**
   * Get an existing smart account at an address
   */
  async getSmartAccount(
    address: string,
    owner: Signer
  ): Promise<Result<ISmartAccount, string>> {
    return this.factory.getAccount(address, owner);
  }

  /**
   * Compute the counterfactual address for an account
   */
  async computeAddress(owner: string, salt: bigint): Promise<string> {
    return this.factory.computeAddress(owner, salt);
  }

  // ============================================================================
  // USER OPERATION BUILDING
  // ============================================================================

  /**
   * Create a UserOperationBuilder for fluent UserOp construction
   */
  createBuilder(
    account: ISmartAccount,
    bundler?: IBundler,
    paymaster?: IPaymaster
  ): UserOperationBuilder {
    const actualBundler = bundler || this.defaultBundler;
    if (!actualBundler) {
      throw new Error('No bundler configured. Provide a bundler or set default.');
    }

    return new UserOperationBuilder({
      account,
      bundler: actualBundler,
      paymaster: paymaster || this.defaultPaymaster,
    });
  }

  // ============================================================================
  // CONVENIENCE METHODS
  // ============================================================================

  /**
   * Execute calls through a smart account (high-level convenience method)
   */
  async execute(params: {
    /** Smart account to use */
    account: ISmartAccount;
    /** Calls to execute */
    calls: Array<{ to: string; value: bigint; data: string }>;
    /** Whether to use paymaster sponsorship */
    sponsorship?: boolean;
    /** Custom bundler (optional) */
    bundler?: IBundler;
    /** Custom paymaster (optional) */
    paymaster?: IPaymaster;
    /** Wait for receipt */
    waitForReceipt?: boolean;
  }): Promise<Result<{ userOpHash: string; receipt?: unknown }, string>> {
    const bundler = params.bundler || this.defaultBundler;
    if (!bundler) {
      return err('No bundler configured');
    }

    const builder = this.createBuilder(params.account, bundler);

    // Add calls
    builder.addCalls(params.calls);

    // Set paymaster if sponsorship requested
    if (params.sponsorship && (params.paymaster || this.defaultPaymaster)) {
      builder.setPaymaster(params.paymaster || this.defaultPaymaster!);
    }

    // Execute
    return builder.execute({ waitForReceipt: params.waitForReceipt });
  }

  // ============================================================================
  // CONFIGURATION
  // ============================================================================

  /**
   * Set default bundler
   */
  setBundler(bundler: IBundler): void {
    this.defaultBundler = bundler;
  }

  /**
   * Set default paymaster
   */
  setPaymaster(paymaster: IPaymaster): void {
    this.defaultPaymaster = paymaster;
  }

  /**
   * Get the entry point address
   */
  getEntryPoint(): string {
    return this.factory.getEntryPoint();
  }

  /**
   * Get the chain ID
   */
  getChainId(): number {
    return this.config.chainId;
  }
}

/**
 * Factory function to create AA module
 */
export function createAAModule(config: AAModuleConfig): AAModule {
  return new AAModule(config);
}
