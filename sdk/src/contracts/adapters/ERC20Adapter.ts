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
} from '../../core/interfaces.js';
import type { Result } from '../../core/types.js';
import { ok, err } from '../../core/types.js';

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
   */
  static async create(config: ERC20AdapterConfig): Promise<ERC20Adapter> {
    const provider = new ethers.JsonRpcProvider(config.providerUrl);
    const abi = config.abi || PERMISSIONED_ERC20_ABI;

    let signer: ethers.Wallet | null = null;
    let contract: ethers.Contract;

    if (config.privateKey) {
      signer = new ethers.Wallet(config.privateKey, provider);
      contract = new ethers.Contract(config.contractAddress, abi, signer);
    } else {
      contract = new ethers.Contract(config.contractAddress, abi, provider);
    }

    // Fetch token info
    const [name, symbol, decimals, totalSupply] = await Promise.all([
      contract.name() as Promise<string>,
      contract.symbol() as Promise<string>,
      contract.decimals() as Promise<number>,
      contract.totalSupply() as Promise<bigint>,
    ]);

    const tokenInfo: TokenInfo = {
      address: config.contractAddress,
      name,
      symbol,
      decimals: Number(decimals),
      totalSupply: totalSupply.toString(),
      tokenType: 'ERC20',
    };

    const pluginId = `erc20-${config.contractAddress.toLowerCase().slice(0, 8)}`;

    return new ERC20Adapter(pluginId, tokenInfo, provider, contract, signer);
  }

  /**
   * Mint tokens to an address
   */
  async mint(
    to: string,
    amount: string
  ): Promise<Result<TransactionReceipt, string>> {
    if (!this.signer) {
      return err('No signer configured - cannot mint');
    }

    try {
      const tx = await this.contract.mint(to, amount);
      const receipt = await tx.wait();

      return ok(this.formatReceipt(receipt));
    } catch (error) {
      return err(`Mint failed: ${error}`);
    }
  }

  /**
   * Transfer tokens between addresses
   */
  async transfer(
    from: string,
    to: string,
    amount: string
  ): Promise<Result<TransactionReceipt, string>> {
    if (!this.signer) {
      return err('No signer configured - cannot transfer');
    }

    try {
      // Use transferFrom if from is different from signer
      const signerAddress = await this.signer.getAddress();

      let tx;
      if (from.toLowerCase() === signerAddress.toLowerCase()) {
        tx = await this.contract.transfer(to, amount);
      } else {
        tx = await this.contract.transferFrom(from, to, amount);
      }

      const receipt = await tx.wait();
      return ok(this.formatReceipt(receipt));
    } catch (error) {
      return err(`Transfer failed: ${error}`);
    }
  }

  /**
   * Burn tokens
   */
  async burn(
    from: string,
    amount: string
  ): Promise<Result<TransactionReceipt, string>> {
    if (!this.signer) {
      return err('No signer configured - cannot burn');
    }

    try {
      const signerAddress = await this.signer.getAddress();

      let tx;
      if (from.toLowerCase() === signerAddress.toLowerCase()) {
        tx = await this.contract.burn(amount);
      } else {
        tx = await this.contract.burnFrom(from, amount);
      }

      const receipt = await tx.wait();
      return ok(this.formatReceipt(receipt));
    } catch (error) {
      return err(`Burn failed: ${error}`);
    }
  }

  /**
   * Freeze an account
   */
  async freeze(target: string): Promise<Result<TransactionReceipt, string>> {
    if (!this.signer) {
      return err('No signer configured - cannot freeze');
    }

    try {
      const tx = await this.contract.freeze(target);
      const receipt = await tx.wait();
      return ok(this.formatReceipt(receipt));
    } catch (error) {
      return err(`Freeze failed: ${error}`);
    }
  }

  /**
   * Unfreeze an account
   */
  async unfreeze(target: string): Promise<Result<TransactionReceipt, string>> {
    if (!this.signer) {
      return err('No signer configured - cannot unfreeze');
    }

    try {
      const tx = await this.contract.unfreeze(target);
      const receipt = await tx.wait();
      return ok(this.formatReceipt(receipt));
    } catch (error) {
      return err(`Unfreeze failed: ${error}`);
    }
  }

  /**
   * Get balance for an address
   */
  async balanceOf(address: string): Promise<string> {
    const balance = await this.contract.balanceOf(address) as bigint;
    return balance.toString();
  }

  /**
   * Check if an address is frozen
   */
  async isFrozen(address: string): Promise<boolean> {
    try {
      return await this.contract.isFrozen(address) as boolean;
    } catch {
      // Contract might not have isFrozen function
      return false;
    }
  }

  /**
   * Get allowance
   */
  async allowance(owner: string, spender: string): Promise<string> {
    const allowance = await this.contract.allowance(owner, spender) as bigint;
    return allowance.toString();
  }

  /**
   * Approve spender
   */
  async approve(
    spender: string,
    amount: string
  ): Promise<Result<TransactionReceipt, string>> {
    if (!this.signer) {
      return err('No signer configured - cannot approve');
    }

    try {
      const tx = await this.contract.approve(spender, amount);
      const receipt = await tx.wait();
      return ok(this.formatReceipt(receipt));
    } catch (error) {
      return err(`Approve failed: ${error}`);
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
