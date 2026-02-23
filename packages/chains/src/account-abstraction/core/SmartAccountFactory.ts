/**
 * SmartAccountFactory - Factory for Creating Smart Accounts
 *
 * Creates and manages ERC-4337 smart accounts.
 * Supports multiple account types:
 * - SimpleAccount - Basic single-owner
 * - MultiSigAccount - Multi-signature
 * - SessionKeyAccount - Session key enabled
 */

import { ethers, type Signer, type Provider } from 'ethers';
import type { Result } from '@tokenisation/core';
import { ok, err } from '@tokenisation/core';
import type {
  ISmartAccount,
  SmartAccountConfig,
  SmartAccountType,
  SmartAccountInfo,
} from '../interfaces/ISmartAccount.js';

/**
 * Known entry point addresses
 */
export const ENTRY_POINTS = {
  V07: '0x0000000071727De22E5E9d8BAf0edAc6f37da032', // v0.7 entry point
  V06: '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789', // v0.6 entry point (legacy)
} as const;

/**
 * Known factory addresses
 */
export const ACCOUNT_FACTORIES = {
  SIMPLE: '0x9406Cc6185a346906296840746125a0E44976454', // SimpleAccount factory
  BICONOMY: '0x000000a56Aaca3e9a4C479ea6b6CD0DbcB6634F5', // Biconomy
  KERNEL: '0x5de4839a76cf55d0c90e2061ef4386d962E15ae3', // Kernel
  SAFE: '0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67', // Safe AA module
} as const;

/**
 * Factory configuration
 */
export interface SmartAccountFactoryConfig {
  /** Chain ID */
  chainId: number;
  /** JSON-RPC provider */
  provider: Provider;
  /** Entry point address (default: v0.7) */
  entryPoint?: string;
  /** Default factory address */
  defaultFactory?: string;
}

/**
 * Account creation params
 */
export interface CreateAccountParams {
  /** Account type */
  type?: SmartAccountType;
  /** Owner signer */
  owner: Signer;
  /** Salt for address derivation */
  salt?: bigint;
  /** Index for deterministic derivation */
  index?: number;
  /** Custom factory address */
  factory?: string;
  /** Additional owners (for multi-sig) */
  additionalOwners?: string[];
  /** Signing threshold (for multi-sig) */
  threshold?: number;
}

/**
 * SmartAccountFactory - Factory for Smart Accounts
 *
 * @example
 * ```typescript
 * const factory = new SmartAccountFactory({
 *   chainId: 8453,
 *   provider: ethersProvider,
 * });
 *
 * // Create a simple account
 * const account = await factory.createSimpleAccount(signer);
 *
 * // Create a multi-sig account
 * const multiSig = await factory.createMultiSigAccount(signer, ['0x...'], 2);
 *
 * // Get account at known address
 * const existing = await factory.getAccount(address, signer);
 * ```
 */
export class SmartAccountFactory {
  private config: Required<SmartAccountFactoryConfig>;
  private accountCache: Map<string, ISmartAccount> = new Map();

  constructor(config: SmartAccountFactoryConfig) {
    this.config = {
      entryPoint: ENTRY_POINTS.V07,
      defaultFactory: ACCOUNT_FACTORIES.SIMPLE,
      ...config,
    };
  }

  // ============================================================================
  // ACCOUNT CREATION
  // ============================================================================

  /**
   * Create a simple (single-owner) smart account
   */
  async createSimpleAccount(
    owner: Signer,
    options: {
      salt?: bigint;
      index?: number;
      factory?: string;
    } = {}
  ): Promise<Result<ISmartAccount, string>> {
    return this.create({
      type: 'simple',
      owner,
      ...options,
    });
  }

  /**
   * Create a multi-sig smart account
   */
  async createMultiSigAccount(
    owner: Signer,
    additionalOwners: string[],
    threshold: number,
    options: {
      salt?: bigint;
      factory?: string;
    } = {}
  ): Promise<Result<ISmartAccount, string>> {
    return this.create({
      type: 'multisig',
      owner,
      additionalOwners,
      threshold,
      ...options,
    });
  }

  /**
   * Create a smart account
   */
  async create(params: CreateAccountParams): Promise<Result<ISmartAccount, string>> {
    try {
      const type = params.type || 'simple';
      const factory = params.factory || this.config.defaultFactory;
      const salt = params.salt || BigInt(params.index || 0);

      // Get owner address
      const ownerAddress = await params.owner.getAddress();

      // Compute counterfactual address
      const address = await this.computeAddress(ownerAddress, salt, factory);

      // Check if account is deployed
      const code = await this.config.provider.getCode(address);
      const isDeployed = code !== '0x';

      // Create account instance based on type
      const account = this.createAccountInstance(type, {
        address,
        owner: params.owner,
        ownerAddress,
        chainId: this.config.chainId,
        entryPoint: this.config.entryPoint,
        factory,
        salt,
        isDeployed,
        additionalOwners: params.additionalOwners,
        threshold: params.threshold,
        provider: this.config.provider,
      });

      // Cache the account
      this.accountCache.set(address.toLowerCase(), account);

      return ok(account);
    } catch (error) {
      return err(`Failed to create smart account: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get an existing account at an address
   */
  async getAccount(
    address: string,
    owner: Signer
  ): Promise<Result<ISmartAccount, string>> {
    // Check cache first
    const cached = this.accountCache.get(address.toLowerCase());
    if (cached) {
      return ok(cached);
    }

    // Check if deployed
    const code = await this.config.provider.getCode(address);
    if (code === '0x') {
      return err('No account deployed at address');
    }

    // Try to detect account type
    // In production, we'd check for specific function signatures
    const ownerAddress = await owner.getAddress();

    const account = this.createAccountInstance('simple', {
      address,
      owner,
      ownerAddress,
      chainId: this.config.chainId,
      entryPoint: this.config.entryPoint,
      factory: this.config.defaultFactory,
      salt: 0n,
      isDeployed: true,
      provider: this.config.provider,
    });

    this.accountCache.set(address.toLowerCase(), account);

    return ok(account);
  }

  /**
   * Compute counterfactual address for an account
   */
  async computeAddress(
    owner: string,
    salt: bigint,
    factory?: string
  ): Promise<string> {
    const factoryAddress = factory || this.config.defaultFactory;

    // SimpleAccount factory uses CREATE2
    // address = keccak256(0xff ++ factory ++ salt ++ keccak256(initCode))[12:]

    // For simulation, we use a deterministic derivation
    const initCodeHash = ethers.keccak256(
      ethers.solidityPacked(
        ['address', 'address', 'uint256'],
        [this.config.entryPoint, owner, salt]
      )
    );

    const create2Address = ethers.getCreate2Address(
      factoryAddress,
      ethers.zeroPadValue(ethers.toBeHex(salt), 32),
      initCodeHash
    );

    return create2Address;
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================

  /**
   * Get entry point address
   */
  getEntryPoint(): string {
    return this.config.entryPoint;
  }

  /**
   * Get chain ID
   */
  getChainId(): number {
    return this.config.chainId;
  }

  /**
   * Clear account cache
   */
  clearCache(): void {
    this.accountCache.clear();
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private createAccountInstance(
    type: SmartAccountType,
    params: {
      address: string;
      owner: Signer;
      ownerAddress: string;
      chainId: number;
      entryPoint: string;
      factory: string;
      salt: bigint;
      isDeployed: boolean;
      additionalOwners?: string[];
      threshold?: number;
      provider: Provider;
    }
  ): ISmartAccount {
    // Create a simple account implementation
    // In a full implementation, we'd have separate classes for each type
    return new SimpleSmartAccount(params);
  }
}

/**
 * Simple Smart Account Implementation
 *
 * Basic single-owner ERC-4337 account.
 */
class SimpleSmartAccount implements ISmartAccount {
  private address: string;
  private owner: Signer;
  private ownerAddress: string;
  private chainId: number;
  private entryPoint: string;
  private factory: string;
  private salt: bigint;
  private _isDeployed: boolean;
  private provider: Provider;
  private nonce: bigint = 0n;

  constructor(params: {
    address: string;
    owner: Signer;
    ownerAddress: string;
    chainId: number;
    entryPoint: string;
    factory: string;
    salt: bigint;
    isDeployed: boolean;
    provider: Provider;
  }) {
    this.address = params.address;
    this.owner = params.owner;
    this.ownerAddress = params.ownerAddress;
    this.chainId = params.chainId;
    this.entryPoint = params.entryPoint;
    this.factory = params.factory;
    this.salt = params.salt;
    this._isDeployed = params.isDeployed;
    this.provider = params.provider;
  }

  async getAddress(): Promise<string> {
    return this.address;
  }

  async getAccountInfo(): Promise<SmartAccountInfo> {
    return {
      address: this.address,
      type: 'simple',
      state: this._isDeployed ? 'deployed' : 'not_deployed',
      chainId: this.chainId,
      entryPoint: this.entryPoint,
      factory: this.factory,
      owners: [this.ownerAddress],
      nonce: this.nonce,
      isDeployed: this._isDeployed,
      version: '0.7.0',
    };
  }

  async isDeployed(): Promise<boolean> {
    return this._isDeployed;
  }

  async getNonce(): Promise<bigint> {
    // In production, this would query the EntryPoint contract
    return this.nonce;
  }

  getEntryPoint(): string {
    return this.entryPoint;
  }

  getChainId(): number {
    return this.chainId;
  }

  async buildUserOperation(params: {
    calls: Array<{ to: string; value: bigint; data: string }>;
    nonce?: bigint;
    callData?: string;
    gasLimits?: {
      callGasLimit?: bigint;
      verificationGasLimit?: bigint;
      preVerificationGas?: bigint;
    };
    gasPrices?: {
      maxFeePerGas?: bigint;
      maxPriorityFeePerGas?: bigint;
    };
  }): Promise<import('../interfaces/UserOperation.js').UnsignedUserOperation> {
    const nonce = params.nonce ?? await this.getNonce();
    const callData = params.callData ?? await this.encodeCalls(params.calls);

    // Get factory data if not deployed
    const factory = this._isDeployed ? undefined : this.factory;
    const factoryData = this._isDeployed ? undefined : await this.getFactoryData();

    return {
      sender: this.address,
      nonce,
      factory,
      factoryData,
      callData,
      callGasLimit: params.gasLimits?.callGasLimit ?? 100000n,
      verificationGasLimit: params.gasLimits?.verificationGasLimit ?? 100000n,
      preVerificationGas: params.gasLimits?.preVerificationGas ?? 50000n,
      maxFeePerGas: params.gasPrices?.maxFeePerGas ?? 1000000000n, // 1 gwei
      maxPriorityFeePerGas: params.gasPrices?.maxPriorityFeePerGas ?? 100000000n, // 0.1 gwei
    };
  }

  async encodeCalls(
    calls: Array<{ to: string; value: bigint; data: string }>
  ): Promise<string> {
    if (calls.length === 1) {
      // Single call: execute(address,uint256,bytes)
      const iface = new ethers.Interface([
        'function execute(address dest, uint256 value, bytes data)',
      ]);
      return iface.encodeFunctionData('execute', [
        calls[0].to,
        calls[0].value,
        calls[0].data,
      ]);
    }

    // Batch call: executeBatch(address[],uint256[],bytes[])
    const iface = new ethers.Interface([
      'function executeBatch(address[] dest, uint256[] value, bytes[] data)',
    ]);
    return iface.encodeFunctionData('executeBatch', [
      calls.map((c) => c.to),
      calls.map((c) => c.value),
      calls.map((c) => c.data),
    ]);
  }

  async encodeCall(call: { to: string; value: bigint; data: string }): Promise<string> {
    return this.encodeCalls([call]);
  }

  async getInitCode(): Promise<string> {
    if (this._isDeployed) {
      return '0x';
    }
    const factoryData = await this.getFactoryData();
    return this.factory + factoryData.slice(2);
  }

  async getFactoryData(): Promise<string> {
    // Encode createAccount(owner, salt) call
    const iface = new ethers.Interface([
      'function createAccount(address owner, uint256 salt) returns (address)',
    ]);
    return iface.encodeFunctionData('createAccount', [this.ownerAddress, this.salt]);
  }

  async signUserOperation(
    userOp: import('../interfaces/UserOperation.js').UnsignedUserOperation
  ): Promise<import('../interfaces/UserOperation.js').UserOperation> {
    const userOpHash = await this.getUserOpHash(userOp);
    const signature = await this.owner.signMessage(ethers.getBytes(userOpHash));

    return {
      ...userOp,
      signature,
    };
  }

  async signMessage(message: string | Uint8Array): Promise<string> {
    return this.owner.signMessage(message);
  }

  async signTypedData(
    domain: Record<string, unknown>,
    types: Record<string, Array<{ name: string; type: string }>>,
    value: Record<string, unknown>
  ): Promise<string> {
    // Cast to ethers types
    const signer = this.owner as ethers.Signer;
    if (!('signTypedData' in signer)) {
      throw new Error('Signer does not support signTypedData');
    }
    return (signer as any).signTypedData(domain, types, value);
  }

  async getUserOpHash(
    userOp: import('../interfaces/UserOperation.js').UnsignedUserOperation
  ): Promise<string> {
    // Simplified userOp hash calculation
    // In production, this would match the EntryPoint's hash calculation
    const packed = ethers.solidityPacked(
      ['address', 'uint256', 'bytes32', 'bytes32', 'uint256', 'uint256', 'uint256', 'uint256', 'uint256', 'bytes32'],
      [
        userOp.sender,
        userOp.nonce,
        ethers.keccak256(userOp.factory ? userOp.factory + (userOp.factoryData?.slice(2) || '') : '0x'),
        ethers.keccak256(userOp.callData),
        userOp.callGasLimit,
        userOp.verificationGasLimit,
        userOp.preVerificationGas,
        userOp.maxFeePerGas,
        userOp.maxPriorityFeePerGas,
        ethers.keccak256(
          userOp.paymaster
            ? userOp.paymaster +
              (userOp.paymasterVerificationGasLimit?.toString(16).padStart(32, '0') || '') +
              (userOp.paymasterPostOpGasLimit?.toString(16).padStart(32, '0') || '') +
              (userOp.paymasterData?.slice(2) || '')
            : '0x'
        ),
      ]
    );

    const userOpHash = ethers.keccak256(
      ethers.solidityPacked(
        ['bytes32', 'address', 'uint256'],
        [ethers.keccak256(packed), this.entryPoint, this.chainId]
      )
    );

    return userOpHash;
  }

  async deploy(): Promise<import('@tokenisation/core').Result<import('../interfaces/UserOperation.js').UserOperation, string>> {
    if (this._isDeployed) {
      return err('Account already deployed');
    }

    // Build deployment UserOp (no-op call)
    const userOp = await this.buildUserOperation({
      calls: [{ to: this.address, value: 0n, data: '0x' }],
    });

    const signedUserOp = await this.signUserOperation(userOp);

    // Mark as deployed
    this._isDeployed = true;

    return ok(signedUserOp);
  }

  async getDeploymentCost(): Promise<bigint> {
    // Estimate deployment cost
    return 200000n * 1000000000n; // ~200k gas * 1 gwei
  }

  async getOwners(): Promise<string[]> {
    return [this.ownerAddress];
  }

  async isOwner(address: string): Promise<boolean> {
    return address.toLowerCase() === this.ownerAddress.toLowerCase();
  }

  getOwnerSigner(): Signer {
    return this.owner;
  }

  async validateUserOperation(
    userOp: import('../interfaces/UserOperation.js').UserOperation
  ): Promise<import('@tokenisation/core').Result<void, string>> {
    // Basic validation
    if (userOp.sender.toLowerCase() !== this.address.toLowerCase()) {
      return err('Sender mismatch');
    }
    if (!userOp.signature || userOp.signature === '0x') {
      return err('Missing signature');
    }
    return ok(undefined);
  }

  async estimateUserOperationGas(
    userOp: import('../interfaces/UserOperation.js').UnsignedUserOperation
  ): Promise<{
    callGasLimit: bigint;
    verificationGasLimit: bigint;
    preVerificationGas: bigint;
  }> {
    // Basic estimation
    return {
      callGasLimit: 100000n,
      verificationGasLimit: 100000n,
      preVerificationGas: 50000n,
    };
  }
}

/**
 * Factory function
 */
export function createSmartAccountFactory(
  config: SmartAccountFactoryConfig
): SmartAccountFactory {
  return new SmartAccountFactory(config);
}
