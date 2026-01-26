/**
 * ERC721Adapter - NFT Token Adapter
 *
 * Provides a unified interface for interacting with ERC721 NFT tokens.
 * Supports minting, transferring, burning, and metadata operations.
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
 * Standard ERC721 ABI with permissioned extensions
 */
const PERMISSIONED_ERC721_ABI = [
  // ERC721 Standard
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address owner) view returns (uint256)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function tokenURI(uint256 tokenId) view returns (string)',
  'function approve(address to, uint256 tokenId)',
  'function getApproved(uint256 tokenId) view returns (address)',
  'function setApprovalForAll(address operator, bool approved)',
  'function isApprovedForAll(address owner, address operator) view returns (bool)',
  'function transferFrom(address from, address to, uint256 tokenId)',
  'function safeTransferFrom(address from, address to, uint256 tokenId)',
  'function safeTransferFrom(address from, address to, uint256 tokenId, bytes data)',

  // Permissioned extensions
  'function mint(address to, uint256 tokenId)',
  'function mintWithURI(address to, uint256 tokenId, string uri)',
  'function burn(uint256 tokenId)',
  'function freeze(address account)',
  'function unfreeze(address account)',
  'function isFrozen(address account) view returns (bool)',
  'function setTokenURI(uint256 tokenId, string uri)',

  // Events
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
  'event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId)',
  'event ApprovalForAll(address indexed owner, address indexed operator, bool approved)',
  'event Frozen(address indexed account)',
  'event Unfrozen(address indexed account)',
];

/**
 * ERC721Adapter configuration
 */
export interface ERC721AdapterConfig {
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
 * ERC721Adapter implementation
 */
export class ERC721Adapter implements ITokenAdapter {
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
   * Create and initialize an ERC721Adapter
   */
  static async create(config: ERC721AdapterConfig): Promise<ERC721Adapter> {
    const provider = new ethers.JsonRpcProvider(config.providerUrl);
    const abi = config.abi || PERMISSIONED_ERC721_ABI;

    let signer: ethers.Wallet | null = null;
    let contract: ethers.Contract;

    if (config.privateKey) {
      signer = new ethers.Wallet(config.privateKey, provider);
      contract = new ethers.Contract(config.contractAddress, abi, signer);
    } else {
      contract = new ethers.Contract(config.contractAddress, abi, provider);
    }

    // Fetch token info
    let name = 'Unknown';
    let symbol = 'UNK';
    let totalSupply = '0';

    try {
      [name, symbol, totalSupply] = await Promise.all([
        contract.name() as Promise<string>,
        contract.symbol() as Promise<string>,
        contract.totalSupply().then((s: bigint) => s.toString()) as Promise<string>,
      ]);
    } catch {
      // Some NFTs might not have all these methods
    }

    const tokenInfo: TokenInfo = {
      address: config.contractAddress,
      name,
      symbol,
      decimals: 0, // NFTs don't have decimals
      totalSupply,
      tokenType: 'ERC721',
    };

    const pluginId = `erc721-${config.contractAddress.toLowerCase().slice(0, 8)}`;

    return new ERC721Adapter(pluginId, tokenInfo, provider, contract, signer);
  }

  /**
   * Mint a new NFT
   */
  async mint(
    to: string,
    _amount: string,
    tokenId?: string
  ): Promise<Result<TransactionReceipt, string>> {
    if (!this.signer) {
      return err('No signer configured - cannot mint');
    }

    if (!tokenId) {
      return err('Token ID required for NFT minting');
    }

    try {
      const tx = await this.contract.mint(to, tokenId);
      const receipt = await tx.wait();
      return ok(this.formatReceipt(receipt));
    } catch (error) {
      return err(`Mint failed: ${error}`);
    }
  }

  /**
   * Mint NFT with URI
   */
  async mintWithURI(
    to: string,
    tokenId: string,
    uri: string
  ): Promise<Result<TransactionReceipt, string>> {
    if (!this.signer) {
      return err('No signer configured - cannot mint');
    }

    try {
      const tx = await this.contract.mintWithURI(to, tokenId, uri);
      const receipt = await tx.wait();
      return ok(this.formatReceipt(receipt));
    } catch (error) {
      return err(`Mint with URI failed: ${error}`);
    }
  }

  /**
   * Transfer NFT
   */
  async transfer(
    from: string,
    to: string,
    _amount: string,
    tokenId?: string
  ): Promise<Result<TransactionReceipt, string>> {
    if (!this.signer) {
      return err('No signer configured - cannot transfer');
    }

    if (!tokenId) {
      return err('Token ID required for NFT transfer');
    }

    try {
      const tx = await this.contract.transferFrom(from, to, tokenId);
      const receipt = await tx.wait();
      return ok(this.formatReceipt(receipt));
    } catch (error) {
      return err(`Transfer failed: ${error}`);
    }
  }

  /**
   * Safe transfer NFT
   */
  async safeTransfer(
    from: string,
    to: string,
    tokenId: string,
    data?: string
  ): Promise<Result<TransactionReceipt, string>> {
    if (!this.signer) {
      return err('No signer configured - cannot transfer');
    }

    try {
      let tx;
      if (data) {
        tx = await this.contract['safeTransferFrom(address,address,uint256,bytes)'](
          from,
          to,
          tokenId,
          data
        );
      } else {
        tx = await this.contract['safeTransferFrom(address,address,uint256)'](
          from,
          to,
          tokenId
        );
      }
      const receipt = await tx.wait();
      return ok(this.formatReceipt(receipt));
    } catch (error) {
      return err(`Safe transfer failed: ${error}`);
    }
  }

  /**
   * Burn NFT
   */
  async burn(
    _from: string,
    _amount: string,
    tokenId?: string
  ): Promise<Result<TransactionReceipt, string>> {
    if (!this.signer) {
      return err('No signer configured - cannot burn');
    }

    if (!tokenId) {
      return err('Token ID required for NFT burning');
    }

    try {
      const tx = await this.contract.burn(tokenId);
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
   * Get balance (number of NFTs owned)
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
      return false;
    }
  }

  /**
   * Get token URI
   */
  async tokenURI(tokenId: string): Promise<string> {
    return await this.contract.tokenURI(tokenId) as string;
  }

  /**
   * Get owner of a token
   */
  async ownerOf(tokenId: string): Promise<string> {
    return await this.contract.ownerOf(tokenId) as string;
  }

  /**
   * Set token URI
   */
  async setTokenURI(
    tokenId: string,
    uri: string
  ): Promise<Result<TransactionReceipt, string>> {
    if (!this.signer) {
      return err('No signer configured - cannot set URI');
    }

    try {
      const tx = await this.contract.setTokenURI(tokenId, uri);
      const receipt = await tx.wait();
      return ok(this.formatReceipt(receipt));
    } catch (error) {
      return err(`Set token URI failed: ${error}`);
    }
  }

  /**
   * Approve operator for a token
   */
  async approve(
    to: string,
    tokenId: string
  ): Promise<Result<TransactionReceipt, string>> {
    if (!this.signer) {
      return err('No signer configured - cannot approve');
    }

    try {
      const tx = await this.contract.approve(to, tokenId);
      const receipt = await tx.wait();
      return ok(this.formatReceipt(receipt));
    } catch (error) {
      return err(`Approve failed: ${error}`);
    }
  }

  /**
   * Set approval for all
   */
  async setApprovalForAll(
    operator: string,
    approved: boolean
  ): Promise<Result<TransactionReceipt, string>> {
    if (!this.signer) {
      return err('No signer configured - cannot set approval');
    }

    try {
      const tx = await this.contract.setApprovalForAll(operator, approved);
      const receipt = await tx.wait();
      return ok(this.formatReceipt(receipt));
    } catch (error) {
      return err(`Set approval for all failed: ${error}`);
    }
  }

  /**
   * Check if operator is approved for all
   */
  async isApprovedForAll(owner: string, operator: string): Promise<boolean> {
    return await this.contract.isApprovedForAll(owner, operator) as boolean;
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
