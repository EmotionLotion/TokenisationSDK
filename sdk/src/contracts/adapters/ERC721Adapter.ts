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
import { ContractError, ValidationError, ErrorCode } from '../../errors/index.js';
import {
  ERC721AdapterConfigSchema,
  EthereumAddressSchema,
  TokenIdSchema,
  TokenUriSchema,
  validateOrThrow,
} from '../validation.js';

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
   *
   * @param config - Adapter configuration
   * @returns Initialized ERC721Adapter
   * @throws ValidationError if config is invalid
   * @throws ContractError if contract initialization fails
   */
  static async create(config: ERC721AdapterConfig): Promise<ERC721Adapter> {
    // Validate configuration
    const validatedConfig = validateOrThrow(
      ERC721AdapterConfigSchema,
      config,
      'ERC721Adapter config'
    );

    const provider = new ethers.JsonRpcProvider(validatedConfig.providerUrl);
    const abi = validatedConfig.abi || PERMISSIONED_ERC721_ABI;

    try {
      let signer: ethers.Wallet | null = null;
      let contract: ethers.Contract;

      if (validatedConfig.privateKey) {
        signer = new ethers.Wallet(validatedConfig.privateKey, provider);
        contract = new ethers.Contract(validatedConfig.contractAddress, abi, signer);
      } else {
        contract = new ethers.Contract(validatedConfig.contractAddress, abi, provider);
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
        address: validatedConfig.contractAddress,
        name,
        symbol,
        decimals: 0, // NFTs don't have decimals
        totalSupply,
        tokenType: 'ERC721',
      };

      const pluginId = `erc721-${validatedConfig.contractAddress.toLowerCase().slice(0, 8)}`;

      return new ERC721Adapter(pluginId, tokenInfo, provider, contract, signer);
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }
      throw new ContractError(
        `Failed to initialize ERC721 adapter: ${error instanceof Error ? error.message : String(error)}`,
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
   * Mint a new NFT
   *
   * @param to - Recipient address
   * @param _amount - Ignored for NFTs (always 1)
   * @param tokenId - Token ID to mint
   * @returns Transaction receipt or error
   */
  async mint(
    to: string,
    _amount: string,
    tokenId?: string
  ): Promise<Result<TransactionReceipt, string>> {
    const toValidation = EthereumAddressSchema.safeParse(to);
    if (!toValidation.success) {
      return err(`Invalid recipient address: ${toValidation.error.errors[0].message}`);
    }

    if (!tokenId) {
      return err('Token ID required for NFT minting');
    }

    const tokenIdValidation = TokenIdSchema.safeParse(tokenId);
    if (!tokenIdValidation.success) {
      return err(`Invalid token ID: ${tokenIdValidation.error.errors[0].message}`);
    }

    if (!this.signer) {
      return err('No signer configured - cannot mint');
    }

    try {
      const tx = await this.contract.mint(toValidation.data, tokenIdValidation.data);
      const receipt = await tx.wait();
      return ok(this.formatReceipt(receipt));
    } catch (error) {
      return err(`Mint failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Mint NFT with URI
   *
   * @param to - Recipient address
   * @param tokenId - Token ID to mint
   * @param uri - Metadata URI for the token
   * @returns Transaction receipt or error
   */
  async mintWithURI(
    to: string,
    tokenId: string,
    uri: string
  ): Promise<Result<TransactionReceipt, string>> {
    const toValidation = EthereumAddressSchema.safeParse(to);
    if (!toValidation.success) {
      return err(`Invalid recipient address: ${toValidation.error.errors[0].message}`);
    }

    const tokenIdValidation = TokenIdSchema.safeParse(tokenId);
    if (!tokenIdValidation.success) {
      return err(`Invalid token ID: ${tokenIdValidation.error.errors[0].message}`);
    }

    const uriValidation = TokenUriSchema.safeParse(uri);
    if (!uriValidation.success) {
      return err(`Invalid URI: ${uriValidation.error.errors[0].message}`);
    }

    if (!this.signer) {
      return err('No signer configured - cannot mint');
    }

    try {
      const tx = await this.contract.mintWithURI(toValidation.data, tokenIdValidation.data, uriValidation.data);
      const receipt = await tx.wait();
      return ok(this.formatReceipt(receipt));
    } catch (error) {
      return err(`Mint with URI failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Transfer NFT
   *
   * @param from - Sender address
   * @param to - Recipient address
   * @param _amount - Ignored for NFTs (always 1)
   * @param tokenId - Token ID to transfer
   * @returns Transaction receipt or error
   */
  async transfer(
    from: string,
    to: string,
    _amount: string,
    tokenId?: string
  ): Promise<Result<TransactionReceipt, string>> {
    const fromValidation = EthereumAddressSchema.safeParse(from);
    if (!fromValidation.success) {
      return err(`Invalid sender address: ${fromValidation.error.errors[0].message}`);
    }

    const toValidation = EthereumAddressSchema.safeParse(to);
    if (!toValidation.success) {
      return err(`Invalid recipient address: ${toValidation.error.errors[0].message}`);
    }

    if (!tokenId) {
      return err('Token ID required for NFT transfer');
    }

    const tokenIdValidation = TokenIdSchema.safeParse(tokenId);
    if (!tokenIdValidation.success) {
      return err(`Invalid token ID: ${tokenIdValidation.error.errors[0].message}`);
    }

    if (!this.signer) {
      return err('No signer configured - cannot transfer');
    }

    try {
      const tx = await this.contract.transferFrom(fromValidation.data, toValidation.data, tokenIdValidation.data);
      const receipt = await tx.wait();
      return ok(this.formatReceipt(receipt));
    } catch (error) {
      return err(`Transfer failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Safe transfer NFT
   *
   * @param from - Sender address
   * @param to - Recipient address
   * @param tokenId - Token ID to transfer
   * @param data - Optional callback data
   * @returns Transaction receipt or error
   */
  async safeTransfer(
    from: string,
    to: string,
    tokenId: string,
    data?: string
  ): Promise<Result<TransactionReceipt, string>> {
    const fromValidation = EthereumAddressSchema.safeParse(from);
    if (!fromValidation.success) {
      return err(`Invalid sender address: ${fromValidation.error.errors[0].message}`);
    }

    const toValidation = EthereumAddressSchema.safeParse(to);
    if (!toValidation.success) {
      return err(`Invalid recipient address: ${toValidation.error.errors[0].message}`);
    }

    const tokenIdValidation = TokenIdSchema.safeParse(tokenId);
    if (!tokenIdValidation.success) {
      return err(`Invalid token ID: ${tokenIdValidation.error.errors[0].message}`);
    }

    if (!this.signer) {
      return err('No signer configured - cannot transfer');
    }

    try {
      let tx;
      if (data) {
        tx = await this.contract['safeTransferFrom(address,address,uint256,bytes)'](
          fromValidation.data,
          toValidation.data,
          tokenIdValidation.data,
          data
        );
      } else {
        tx = await this.contract['safeTransferFrom(address,address,uint256)'](
          fromValidation.data,
          toValidation.data,
          tokenIdValidation.data
        );
      }
      const receipt = await tx.wait();
      return ok(this.formatReceipt(receipt));
    } catch (error) {
      return err(`Safe transfer failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Burn NFT
   *
   * @param _from - Ignored (token owner determined from contract)
   * @param _amount - Ignored for NFTs (always 1)
   * @param tokenId - Token ID to burn
   * @returns Transaction receipt or error
   */
  async burn(
    _from: string,
    _amount: string,
    tokenId?: string
  ): Promise<Result<TransactionReceipt, string>> {
    if (!tokenId) {
      return err('Token ID required for NFT burning');
    }

    const tokenIdValidation = TokenIdSchema.safeParse(tokenId);
    if (!tokenIdValidation.success) {
      return err(`Invalid token ID: ${tokenIdValidation.error.errors[0].message}`);
    }

    if (!this.signer) {
      return err('No signer configured - cannot burn');
    }

    try {
      const tx = await this.contract.burn(tokenIdValidation.data);
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
   * Get balance (number of NFTs owned)
   *
   * @param address - Address to query
   * @returns Number of NFTs owned as string
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
      return false;
    }
  }

  /**
   * Get token URI
   *
   * @param tokenId - Token ID to query
   * @returns Metadata URI
   * @throws ValidationError if tokenId is invalid
   */
  async tokenURI(tokenId: string): Promise<string> {
    const validation = TokenIdSchema.safeParse(tokenId);
    if (!validation.success) {
      throw new ValidationError(`Invalid token ID: ${validation.error.errors[0].message}`, {
        field: 'tokenId',
      });
    }

    return await this.contract.tokenURI(validation.data) as string;
  }

  /**
   * Get owner of a token
   *
   * @param tokenId - Token ID to query
   * @returns Owner address
   * @throws ValidationError if tokenId is invalid
   */
  async ownerOf(tokenId: string): Promise<string> {
    const validation = TokenIdSchema.safeParse(tokenId);
    if (!validation.success) {
      throw new ValidationError(`Invalid token ID: ${validation.error.errors[0].message}`, {
        field: 'tokenId',
      });
    }

    return await this.contract.ownerOf(validation.data) as string;
  }

  /**
   * Set token URI
   *
   * @param tokenId - Token ID to update
   * @param uri - New metadata URI
   * @returns Transaction receipt or error
   */
  async setTokenURI(
    tokenId: string,
    uri: string
  ): Promise<Result<TransactionReceipt, string>> {
    const tokenIdValidation = TokenIdSchema.safeParse(tokenId);
    if (!tokenIdValidation.success) {
      return err(`Invalid token ID: ${tokenIdValidation.error.errors[0].message}`);
    }

    const uriValidation = TokenUriSchema.safeParse(uri);
    if (!uriValidation.success) {
      return err(`Invalid URI: ${uriValidation.error.errors[0].message}`);
    }

    if (!this.signer) {
      return err('No signer configured - cannot set URI');
    }

    try {
      const tx = await this.contract.setTokenURI(tokenIdValidation.data, uriValidation.data);
      const receipt = await tx.wait();
      return ok(this.formatReceipt(receipt));
    } catch (error) {
      return err(`Set token URI failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Approve operator for a token
   *
   * @param to - Address to approve
   * @param tokenId - Token ID to approve
   * @returns Transaction receipt or error
   */
  async approve(
    to: string,
    tokenId: string
  ): Promise<Result<TransactionReceipt, string>> {
    const toValidation = EthereumAddressSchema.safeParse(to);
    if (!toValidation.success) {
      return err(`Invalid address: ${toValidation.error.errors[0].message}`);
    }

    const tokenIdValidation = TokenIdSchema.safeParse(tokenId);
    if (!tokenIdValidation.success) {
      return err(`Invalid token ID: ${tokenIdValidation.error.errors[0].message}`);
    }

    if (!this.signer) {
      return err('No signer configured - cannot approve');
    }

    try {
      const tx = await this.contract.approve(toValidation.data, tokenIdValidation.data);
      const receipt = await tx.wait();
      return ok(this.formatReceipt(receipt));
    } catch (error) {
      return err(`Approve failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Set approval for all
   *
   * @param operator - Operator address
   * @param approved - Whether to approve or revoke
   * @returns Transaction receipt or error
   */
  async setApprovalForAll(
    operator: string,
    approved: boolean
  ): Promise<Result<TransactionReceipt, string>> {
    const operatorValidation = EthereumAddressSchema.safeParse(operator);
    if (!operatorValidation.success) {
      return err(`Invalid operator address: ${operatorValidation.error.errors[0].message}`);
    }

    if (!this.signer) {
      return err('No signer configured - cannot set approval');
    }

    try {
      const tx = await this.contract.setApprovalForAll(operatorValidation.data, approved);
      const receipt = await tx.wait();
      return ok(this.formatReceipt(receipt));
    } catch (error) {
      return err(`Set approval for all failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Check if operator is approved for all
   *
   * @param owner - Token owner address
   * @param operator - Operator address
   * @returns True if operator is approved
   * @throws ValidationError if addresses are invalid
   */
  async isApprovedForAll(owner: string, operator: string): Promise<boolean> {
    const ownerValidation = EthereumAddressSchema.safeParse(owner);
    if (!ownerValidation.success) {
      throw new ValidationError(`Invalid owner address: ${ownerValidation.error.errors[0].message}`, {
        field: 'owner',
      });
    }

    const operatorValidation = EthereumAddressSchema.safeParse(operator);
    if (!operatorValidation.success) {
      throw new ValidationError(`Invalid operator address: ${operatorValidation.error.errors[0].message}`, {
        field: 'operator',
      });
    }

    return await this.contract.isApprovedForAll(ownerValidation.data, operatorValidation.data) as boolean;
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
