/**
 * ERC20Adapter - Permissioned ERC20 Token Adapter
 *
 * Provides a unified interface for interacting with permissioned ERC20 tokens.
 * Supports minting, transferring, burning, and freezing operations.
 */

import { ethers } from 'ethers';
import type {
  ITokenAdapter,
  TokenInfo,
  TransactionReceipt,
} from '@tokenisation/core';
import type { Result } from '@tokenisation/core';
import { ok, err } from '@tokenisation/core';
import { ContractError, ValidationError, ErrorCode } from '@tokenisation/core';
import {
  ERC20AdapterConfigSchema,
  EthereumAddressSchema,
  TokenAmountSchema,
  TokenAmountOrZeroSchema,
  validateOrThrow,
} from '../validation.js';

/**
 * Standard ERC20 ABI with additional permissioned functions
 */
const PERMISSIONED_ERC20_ABI = [
  // ERC20 Standard
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function transferFrom(address from, address to, uint256 amount) returns (bool)',

  // Permissioned extensions
  'function mint(address to, uint256 amount)',
  'function burn(uint256 amount)',
  'function burnFrom(address account, uint256 amount)',
  'function freeze(address account)',
  'function unfreeze(address account)',
  'function isFrozen(address account) view returns (bool)',

  // Events
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'event Approval(address indexed owner, address indexed spender, uint256 value)',
  'event Frozen(address indexed account)',
  'event Unfrozen(address indexed account)',
];

/**
 * ERC20Adapter configuration
 */
export interface ERC20AdapterConfig {
  /** Contract address */
  contractAddress: string;

  /** JSON-RPC provider URL */
  providerUrl: string;

  /** Private key for signing transactions (optional for read-only) */
  privateKey?: string;

  /** Chain ID */
  chainId: number;

  /** Custom ABI (if different from standard) */
  abi?: string[];
}

/**
 * ERC20Adapter implementation
 */
export class ERC20Adapter implements ITokenAdapter {
  readonly pluginId: string;
  readonly tokenInfo: TokenInfo;

  private provider: ethers.JsonRpcProvider;
  private contract: ethers.Contract;
  private signer: ethers.Wallet | null = null;

  private constructor(
    pluginId: string,
    tokenInfo: TokenInfo,
    provider: ethers.JsonRpcProvider,
    contract: ethers.Contract,
    signer: ethers.Wallet | null
  ) {
    this.pluginId = pluginId;
    this.tokenInfo = tokenInfo;
    this.provider = provider;
    this.contract = contract;
    this.signer = signer;
  }

  /**
   * Create and initialize an ERC20Adapter
   *
   * @param config - Adapter configuration
   * @returns Initialized ERC20Adapter
   * @throws ValidationError if config is invalid
   * @throws ContractError if contract initialization fails
   */
  static async create(config: ERC20AdapterConfig): Promise<ERC20Adapter> {
    // Validate configuration
    const validatedConfig = validateOrThrow(
      ERC20AdapterConfigSchema,
      config,
      'ERC20Adapter config'
    );

    const provider = new ethers.JsonRpcProvider(validatedConfig.providerUrl);
    const abi = validatedConfig.abi || PERMISSIONED_ERC20_ABI;

    let signer: ethers.Wallet | null = null;
    let contract: ethers.Contract;

    try {
      if (validatedConfig.privateKey) {
        signer = new ethers.Wallet(validatedConfig.privateKey, provider);
        contract = new ethers.Contract(validatedConfig.contractAddress, abi, signer);
      } else {
        contract = new ethers.Contract(validatedConfig.contractAddress, abi, provider);
      }

      // Fetch token info
      const [name, symbol, decimals, totalSupply] = await Promise.all([
        contract.name() as Promise<string>,
        contract.symbol() as Promise<string>,
        contract.decimals() as Promise<number>,
        contract.totalSupply() as Promise<bigint>,
      ]);

      const tokenInfo: TokenInfo = {
        address: validatedConfig.contractAddress,
        name,
        symbol,
        decimals: Number(decimals),
        totalSupply: totalSupply.toString(),
        tokenType: 'ERC20',
      };

      const pluginId = `erc20-${validatedConfig.contractAddress.toLowerCase().slice(0, 8)}`;

      return new ERC20Adapter(pluginId, tokenInfo, provider, contract, signer);
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }
      throw new ContractError(
        `Failed to initialize ERC20 adapter: ${error instanceof Error ? error.message : String(error)}`,
        {
          code: ErrorCode.CONTRACT_NOT_DEPLOYED,
          contractAddress: validatedConfig.contractAddress,
          method: 'create',
          cause: error instanceof Error ? error : undefined,
        }
      );
    }
  }

  /**
   * Mint tokens to an address
   *
   * @param to - Recipient address
   * @param amount - Amount to mint (in base units)
   * @returns Transaction receipt or error
   */
  async mint(
    to: string,
    amount: string
  ): Promise<Result<TransactionReceipt, string>> {
    // Validate inputs
    const toValidation = EthereumAddressSchema.safeParse(to);
    if (!toValidation.success) {
      return err(`Invalid recipient address: ${toValidation.error.errors[0].message}`);
    }

    const amountValidation = TokenAmountSchema.safeParse(amount);
    if (!amountValidation.success) {
      return err(`Invalid amount: ${amountValidation.error.errors[0].message}`);
    }

    if (!this.signer) {
      return err('No signer configured - cannot mint');
    }

    try {
      const tx = await this.contract.mint(toValidation.data, amountValidation.data);
      const receipt = await tx.wait();

      return ok(this.formatReceipt(receipt));
    } catch (error) {
      return err(`Mint failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Transfer tokens between addresses
   *
   * @param from - Sender address
   * @param to - Recipient address
   * @param amount - Amount to transfer (in base units)
   * @returns Transaction receipt or error
   */
  async transfer(
    from: string,
    to: string,
    amount: string
  ): Promise<Result<TransactionReceipt, string>> {
    // Validate inputs
    const fromValidation = EthereumAddressSchema.safeParse(from);
    if (!fromValidation.success) {
      return err(`Invalid sender address: ${fromValidation.error.errors[0].message}`);
    }

    const toValidation = EthereumAddressSchema.safeParse(to);
    if (!toValidation.success) {
      return err(`Invalid recipient address: ${toValidation.error.errors[0].message}`);
    }

    const amountValidation = TokenAmountSchema.safeParse(amount);
    if (!amountValidation.success) {
      return err(`Invalid amount: ${amountValidation.error.errors[0].message}`);
    }

    if (!this.signer) {
      return err('No signer configured - cannot transfer');
    }

    try {
      // Use transferFrom if from is different from signer
      const signerAddress = await this.signer.getAddress();

      let tx;
      if (fromValidation.data === signerAddress.toLowerCase()) {
        tx = await this.contract.transfer(toValidation.data, amountValidation.data);
      } else {
        tx = await this.contract.transferFrom(fromValidation.data, toValidation.data, amountValidation.data);
      }

      const receipt = await tx.wait();
      return ok(this.formatReceipt(receipt));
    } catch (error) {
      return err(`Transfer failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Burn tokens
   *
   * @param from - Address to burn from
   * @param amount - Amount to burn (in base units)
   * @returns Transaction receipt or error
   */
  async burn(
    from: string,
    amount: string
  ): Promise<Result<TransactionReceipt, string>> {
    // Validate inputs
    const fromValidation = EthereumAddressSchema.safeParse(from);
    if (!fromValidation.success) {
      return err(`Invalid address: ${fromValidation.error.errors[0].message}`);
    }

    const amountValidation = TokenAmountSchema.safeParse(amount);
    if (!amountValidation.success) {
      return err(`Invalid amount: ${amountValidation.error.errors[0].message}`);
    }

    if (!this.signer) {
      return err('No signer configured - cannot burn');
    }

    try {
      const signerAddress = await this.signer.getAddress();

      let tx;
      if (fromValidation.data === signerAddress.toLowerCase()) {
        tx = await this.contract.burn(amountValidation.data);
      } else {
        tx = await this.contract.burnFrom(fromValidation.data, amountValidation.data);
      }

      const receipt = await tx.wait();
      return ok(this.formatReceipt(receipt));
    } catch (error) {
      return err(`Burn failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Freeze an account
   *
   * @param target - Address to freeze
   * @returns Transaction receipt or error
   */
  async freeze(target: string): Promise<Result<TransactionReceipt, string>> {
    const targetValidation = EthereumAddressSchema.safeParse(target);
    if (!targetValidation.success) {
      return err(`Invalid address: ${targetValidation.error.errors[0].message}`);
    }

    if (!this.signer) {
      return err('No signer configured - cannot freeze');
    }

    try {
      const tx = await this.contract.freeze(targetValidation.data);
      const receipt = await tx.wait();
      return ok(this.formatReceipt(receipt));
    } catch (error) {
      return err(`Freeze failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Unfreeze an account
   *
   * @param target - Address to unfreeze
   * @returns Transaction receipt or error
   */
  async unfreeze(target: string): Promise<Result<TransactionReceipt, string>> {
    const targetValidation = EthereumAddressSchema.safeParse(target);
    if (!targetValidation.success) {
      return err(`Invalid address: ${targetValidation.error.errors[0].message}`);
    }

    if (!this.signer) {
      return err('No signer configured - cannot unfreeze');
    }

    try {
      const tx = await this.contract.unfreeze(targetValidation.data);
      const receipt = await tx.wait();
      return ok(this.formatReceipt(receipt));
    } catch (error) {
      return err(`Unfreeze failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get balance for an address
   *
   * @param address - Address to query
   * @returns Token balance as string
   * @throws ValidationError if address is invalid
   */
  async balanceOf(address: string): Promise<string> {
    const validation = EthereumAddressSchema.safeParse(address);
    if (!validation.success) {
      throw new ValidationError(`Invalid address: ${validation.error.errors[0].message}`, {
        field: 'address',
      });
    }

    const balance = await this.contract.balanceOf(validation.data) as bigint;
    return balance.toString();
  }

  /**
   * Check if an address is frozen
   *
   * @param address - Address to check
   * @returns True if frozen, false otherwise
   */
  async isFrozen(address: string): Promise<boolean> {
    const validation = EthereumAddressSchema.safeParse(address);
    if (!validation.success) {
      throw new ValidationError(`Invalid address: ${validation.error.errors[0].message}`, {
        field: 'address',
      });
    }

    try {
      return await this.contract.isFrozen(validation.data) as boolean;
    } catch {
      // Contract might not have isFrozen function
      return false;
    }
  }

  /**
   * Get allowance
   *
   * @param owner - Token owner address
   * @param spender - Spender address
   * @returns Allowance amount as string
   * @throws ValidationError if addresses are invalid
   */
  async allowance(owner: string, spender: string): Promise<string> {
    const ownerValidation = EthereumAddressSchema.safeParse(owner);
    if (!ownerValidation.success) {
      throw new ValidationError(`Invalid owner address: ${ownerValidation.error.errors[0].message}`, {
        field: 'owner',
      });
    }

    const spenderValidation = EthereumAddressSchema.safeParse(spender);
    if (!spenderValidation.success) {
      throw new ValidationError(`Invalid spender address: ${spenderValidation.error.errors[0].message}`, {
        field: 'spender',
      });
    }

    const allowance = await this.contract.allowance(ownerValidation.data, spenderValidation.data) as bigint;
    return allowance.toString();
  }

  /**
   * Approve spender
   *
   * @param spender - Address to approve
   * @param amount - Amount to approve (can be 0 to revoke)
   * @returns Transaction receipt or error
   */
  async approve(
    spender: string,
    amount: string
  ): Promise<Result<TransactionReceipt, string>> {
    const spenderValidation = EthereumAddressSchema.safeParse(spender);
    if (!spenderValidation.success) {
      return err(`Invalid spender address: ${spenderValidation.error.errors[0].message}`);
    }

    const amountValidation = TokenAmountOrZeroSchema.safeParse(amount);
    if (!amountValidation.success) {
      return err(`Invalid amount: ${amountValidation.error.errors[0].message}`);
    }

    if (!this.signer) {
      return err('No signer configured - cannot approve');
    }

    try {
      const tx = await this.contract.approve(spenderValidation.data, amountValidation.data);
      const receipt = await tx.wait();
      return ok(this.formatReceipt(receipt));
    } catch (error) {
      return err(`Approve failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Format ethers receipt to our format
   */
  private formatReceipt(receipt: ethers.TransactionReceipt): TransactionReceipt {
    return {
      transactionHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      blockHash: receipt.blockHash,
      status: receipt.status === 1 ? 'SUCCESS' : 'REVERTED',
      gasUsed: receipt.gasUsed.toString(),
      logs: receipt.logs.map((log) => ({
        address: log.address,
        topics: log.topics as string[],
        data: log.data,
        logIndex: log.index,
      })),
    };
  }

  /**
   * Get the provider
   */
  getProvider(): ethers.JsonRpcProvider {
    return this.provider;
  }

  /**
   * Get the contract
   */
  getContract(): ethers.Contract {
    return this.contract;
  }
}
