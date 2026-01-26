/**
 * ERC1155Adapter - Permissioned ERC-1155 Multi-Token Adapter
 *
 * Provides a unified interface for interacting with permissioned ERC-1155 tokens.
 * Supports multiple token types, batch operations, minting, transferring, burning, and freezing.
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
 * ComplianceMultiToken ABI
 */
const COMPLIANCE_MULTI_TOKEN_ABI = [
  // ERC-1155 Standard
  'function balanceOf(address account, uint256 id) view returns (uint256)',
  'function balanceOfBatch(address[] accounts, uint256[] ids) view returns (uint256[])',
  'function setApprovalForAll(address operator, bool approved)',
  'function isApprovedForAll(address account, address operator) view returns (bool)',
  'function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data)',
  'function safeBatchTransferFrom(address from, address to, uint256[] ids, uint256[] amounts, bytes data)',
  'function uri(uint256 id) view returns (string)',
  'function supportsInterface(bytes4 interfaceId) view returns (bool)',

  // Token Type Management
  'function createTokenType(uint256 tokenId, string name, string symbol, string uri)',
  'function setURI(uint256 tokenId, string newUri)',
  'function tokenTypes(uint256 tokenId) view returns (string name, string symbol, string uri, uint256 totalSupply, bool exists)',
  'function getTokenIds() view returns (uint256[])',
  'function totalSupply(uint256 tokenId) view returns (uint256)',

  // Minting & Burning
  'function mint(address to, uint256 tokenId, uint256 amount)',
  'function mintBatch(address to, uint256[] ids, uint256[] amounts)',
  'function burn(uint256 tokenId, uint256 amount)',
  'function burnBatch(uint256[] ids, uint256[] amounts)',

  // Compliance
  'function freeze(address account)',
  'function unfreeze(address account)',
  'function isFrozen(address account) view returns (bool)',
  'function forceTransfer(address from, address to, uint256 tokenId, uint256 amount, string reason) returns (bool)',
  'function canTransfer(address from, address to, uint256 tokenId, uint256 amount) view returns (bool, string)',

  // Compliance Rules
  'function setTokenComplianceRules(uint256 tokenId, bool requireKyc, bool requireAccreditation, uint256 maxInvestorCount, uint256 maxHoldingAmount, uint256 minTransferAmount, uint256 lockupEndTime)',
  'function setAllowedCountries(uint256 tokenId, uint16[] countries)',
  'function setBlockedCountries(uint256 tokenId, uint16[] countries)',
  'function tokenRules(uint256 tokenId) view returns (bool requireKyc, bool requireAccreditation, uint256 maxInvestorCount, uint256 maxHoldingAmount, uint256 minTransferAmount, uint256 lockupEndTime)',

  // Admin
  'function owner() view returns (address)',
  'function agents(address) view returns (bool)',
  'function compliance(address) view returns (bool)',
  'function paused() view returns (bool)',
  'function investorCount(uint256 tokenId) view returns (uint256)',
  'function isInvestor(uint256 tokenId, address account) view returns (bool)',

  // Events
  'event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)',
  'event TransferBatch(address indexed operator, address indexed from, address indexed to, uint256[] ids, uint256[] values)',
  'event ApprovalForAll(address indexed account, address indexed operator, bool approved)',
  'event URI(string value, uint256 indexed id)',
  'event Frozen(address indexed account, address indexed by)',
  'event Unfrozen(address indexed account, address indexed by)',
  'event TokenTypeCreated(uint256 indexed tokenId, string name, string symbol)',
];

/**
 * Token type info
 */
export interface TokenTypeInfo {
  tokenId: string;
  name: string;
  symbol: string;
  uri: string;
  totalSupply: string;
  exists: boolean;
}

/**
 * Compliance rules for a token type
 */
export interface TokenComplianceRules {
  requireKyc: boolean;
  requireAccreditation: boolean;
  maxInvestorCount: string;
  maxHoldingAmount: string;
  minTransferAmount: string;
  lockupEndTime: string;
}

/**
 * ERC1155Adapter configuration
 */
export interface ERC1155AdapterConfig {
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
 * ERC1155Adapter implementation
 */
export class ERC1155Adapter implements ITokenAdapter {
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
   * Create and initialize an ERC1155Adapter
   */
  static async create(config: ERC1155AdapterConfig): Promise<ERC1155Adapter> {
    const provider = new ethers.JsonRpcProvider(config.providerUrl);
    const abi = config.abi || COMPLIANCE_MULTI_TOKEN_ABI;

    let signer: ethers.Wallet | null = null;
    let contract: ethers.Contract;

    if (config.privateKey) {
      signer = new ethers.Wallet(config.privateKey, provider);
      contract = new ethers.Contract(config.contractAddress, abi, signer);
    } else {
      contract = new ethers.Contract(config.contractAddress, abi, provider);
    }

    // Get token IDs to determine basic info
    let tokenIds: bigint[] = [];
    try {
      tokenIds = await contract.getTokenIds() as bigint[];
    } catch {
      // Contract might be new with no token types yet
    }

    // Build aggregate token info
    let totalSupply = BigInt(0);
    if (tokenIds.length > 0) {
      for (const id of tokenIds) {
        const supply = await contract.totalSupply(id) as bigint;
        totalSupply += supply;
      }
    }

    const tokenInfo: TokenInfo = {
      address: config.contractAddress,
      name: 'ComplianceMultiToken',
      symbol: 'MULTI',
      decimals: 0, // ERC-1155 typically doesn't use decimals
      totalSupply: totalSupply.toString(),
      tokenType: 'ERC1155',
    };

    const pluginId = `erc1155-${config.contractAddress.toLowerCase().slice(0, 8)}`;

    return new ERC1155Adapter(pluginId, tokenInfo, provider, contract, signer);
  }

  // ============================================================================
  // TOKEN TYPE MANAGEMENT
  // ============================================================================

  /**
   * Create a new token type
   */
  async createTokenType(
    tokenId: string,
    name: string,
    symbol: string,
    uri: string
  ): Promise<Result<TransactionReceipt, string>> {
    if (!this.signer) {
      return err('No signer configured - cannot create token type');
    }

    try {
      const tx = await this.contract.createTokenType(tokenId, name, symbol, uri);
      const receipt = await tx.wait();
      return ok(this.formatReceipt(receipt));
    } catch (error) {
      return err(`Create token type failed: ${error}`);
    }
  }

  /**
   * Get token type info
   */
  async getTokenType(tokenId: string): Promise<TokenTypeInfo | null> {
    try {
      const result = await this.contract.tokenTypes(tokenId);
      if (!result.exists) {
        return null;
      }

      return {
        tokenId,
        name: result.name,
        symbol: result.symbol,
        uri: result.uri,
        totalSupply: result.totalSupply.toString(),
        exists: result.exists,
      };
    } catch {
      return null;
    }
  }

  /**
   * Get all token IDs
   */
  async getTokenIds(): Promise<string[]> {
    try {
      const ids = await this.contract.getTokenIds() as bigint[];
      return ids.map((id) => id.toString());
    } catch {
      return [];
    }
  }

  /**
   * Set URI for a token type
   */
  async setURI(
    tokenId: string,
    newUri: string
  ): Promise<Result<TransactionReceipt, string>> {
    if (!this.signer) {
      return err('No signer configured - cannot set URI');
    }

    try {
      const tx = await this.contract.setURI(tokenId, newUri);
      const receipt = await tx.wait();
      return ok(this.formatReceipt(receipt));
    } catch (error) {
      return err(`Set URI failed: ${error}`);
    }
  }

  // ============================================================================
  // ITokenAdapter IMPLEMENTATION
  // ============================================================================

  /**
   * Mint tokens to an address
   */
  async mint(
    to: string,
    amount: string,
    tokenId?: string
  ): Promise<Result<TransactionReceipt, string>> {
    if (!this.signer) {
      return err('No signer configured - cannot mint');
    }

    if (!tokenId) {
      return err('Token ID required for ERC-1155 mint');
    }

    try {
      const tx = await this.contract.mint(to, tokenId, amount);
      const receipt = await tx.wait();
      return ok(this.formatReceipt(receipt));
    } catch (error) {
      return err(`Mint failed: ${error}`);
    }
  }

  /**
   * Batch mint tokens
   */
  async mintBatch(
    to: string,
    ids: string[],
    amounts: string[]
  ): Promise<Result<TransactionReceipt, string>> {
    if (!this.signer) {
      return err('No signer configured - cannot mint');
    }

    try {
      const tx = await this.contract.mintBatch(to, ids, amounts);
      const receipt = await tx.wait();
      return ok(this.formatReceipt(receipt));
    } catch (error) {
      return err(`Batch mint failed: ${error}`);
    }
  }

  /**
   * Transfer tokens between addresses
   */
  async transfer(
    from: string,
    to: string,
    amount: string,
    tokenId?: string
  ): Promise<Result<TransactionReceipt, string>> {
    if (!this.signer) {
      return err('No signer configured - cannot transfer');
    }

    if (!tokenId) {
      return err('Token ID required for ERC-1155 transfer');
    }

    try {
      const tx = await this.contract.safeTransferFrom(from, to, tokenId, amount, '0x');
      const receipt = await tx.wait();
      return ok(this.formatReceipt(receipt));
    } catch (error) {
      return err(`Transfer failed: ${error}`);
    }
  }

  /**
   * Batch transfer tokens
   */
  async transferBatch(
    from: string,
    to: string,
    ids: string[],
    amounts: string[]
  ): Promise<Result<TransactionReceipt, string>> {
    if (!this.signer) {
      return err('No signer configured - cannot transfer');
    }

    try {
      const tx = await this.contract.safeBatchTransferFrom(from, to, ids, amounts, '0x');
      const receipt = await tx.wait();
      return ok(this.formatReceipt(receipt));
    } catch (error) {
      return err(`Batch transfer failed: ${error}`);
    }
  }

  /**
   * Burn tokens
   */
  async burn(
    from: string,
    amount: string,
    tokenId?: string
  ): Promise<Result<TransactionReceipt, string>> {
    if (!this.signer) {
      return err('No signer configured - cannot burn');
    }

    if (!tokenId) {
      return err('Token ID required for ERC-1155 burn');
    }

    // Note: ComplianceMultiToken.burn only allows burning from msg.sender
    const signerAddress = await this.signer.getAddress();
    if (from.toLowerCase() !== signerAddress.toLowerCase()) {
      return err('Can only burn tokens from signer address');
    }

    try {
      const tx = await this.contract.burn(tokenId, amount);
      const receipt = await tx.wait();
      return ok(this.formatReceipt(receipt));
    } catch (error) {
      return err(`Burn failed: ${error}`);
    }
  }

  /**
   * Batch burn tokens
   */
  async burnBatch(
    ids: string[],
    amounts: string[]
  ): Promise<Result<TransactionReceipt, string>> {
    if (!this.signer) {
      return err('No signer configured - cannot burn');
    }

    try {
      const tx = await this.contract.burnBatch(ids, amounts);
      const receipt = await tx.wait();
      return ok(this.formatReceipt(receipt));
    } catch (error) {
      return err(`Batch burn failed: ${error}`);
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
   * Get balance for an address and token ID
   */
  async balanceOf(address: string, tokenId?: string): Promise<string> {
    if (!tokenId) {
      // Return aggregate balance across all token types
      const ids = await this.getTokenIds();
      let total = BigInt(0);
      for (const id of ids) {
        const balance = await this.contract.balanceOf(address, id) as bigint;
        total += balance;
      }
      return total.toString();
    }

    const balance = await this.contract.balanceOf(address, tokenId) as bigint;
    return balance.toString();
  }

  /**
   * Get balances for multiple address/tokenId pairs
   */
  async balanceOfBatch(
    addresses: string[],
    tokenIds: string[]
  ): Promise<string[]> {
    const balances = await this.contract.balanceOfBatch(addresses, tokenIds) as bigint[];
    return balances.map((b) => b.toString());
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
    return await this.contract.uri(tokenId) as string;
  }

  // ============================================================================
  // COMPLIANCE FUNCTIONS
  // ============================================================================

  /**
   * Check if a transfer is compliant
   */
  async canTransfer(
    from: string,
    to: string,
    tokenId: string,
    amount: string
  ): Promise<{ allowed: boolean; reason: string }> {
    try {
      const [allowed, reason] = await this.contract.canTransfer(from, to, tokenId, amount);
      return { allowed, reason };
    } catch (error) {
      return { allowed: false, reason: `Check failed: ${error}` };
    }
  }

  /**
   * Force transfer (agent only)
   */
  async forceTransfer(
    from: string,
    to: string,
    tokenId: string,
    amount: string,
    reason: string
  ): Promise<Result<TransactionReceipt, string>> {
    if (!this.signer) {
      return err('No signer configured - cannot force transfer');
    }

    try {
      const tx = await this.contract.forceTransfer(from, to, tokenId, amount, reason);
      const receipt = await tx.wait();
      return ok(this.formatReceipt(receipt));
    } catch (error) {
      return err(`Force transfer failed: ${error}`);
    }
  }

  /**
   * Get compliance rules for a token type
   */
  async getTokenRules(tokenId: string): Promise<TokenComplianceRules | null> {
    try {
      const result = await this.contract.tokenRules(tokenId);
      return {
        requireKyc: result.requireKyc,
        requireAccreditation: result.requireAccreditation,
        maxInvestorCount: result.maxInvestorCount.toString(),
        maxHoldingAmount: result.maxHoldingAmount.toString(),
        minTransferAmount: result.minTransferAmount.toString(),
        lockupEndTime: result.lockupEndTime.toString(),
      };
    } catch {
      return null;
    }
  }

  /**
   * Set compliance rules for a token type
   */
  async setTokenComplianceRules(
    tokenId: string,
    rules: Partial<TokenComplianceRules>
  ): Promise<Result<TransactionReceipt, string>> {
    if (!this.signer) {
      return err('No signer configured - cannot set rules');
    }

    try {
      const currentRules = await this.getTokenRules(tokenId);
      const tx = await this.contract.setTokenComplianceRules(
        tokenId,
        rules.requireKyc ?? currentRules?.requireKyc ?? true,
        rules.requireAccreditation ?? currentRules?.requireAccreditation ?? false,
        rules.maxInvestorCount ?? currentRules?.maxInvestorCount ?? '0',
        rules.maxHoldingAmount ?? currentRules?.maxHoldingAmount ?? '0',
        rules.minTransferAmount ?? currentRules?.minTransferAmount ?? '0',
        rules.lockupEndTime ?? currentRules?.lockupEndTime ?? '0'
      );
      const receipt = await tx.wait();
      return ok(this.formatReceipt(receipt));
    } catch (error) {
      return err(`Set compliance rules failed: ${error}`);
    }
  }

  // ============================================================================
  // APPROVAL FUNCTIONS
  // ============================================================================

  /**
   * Set approval for all
   */
  async setApprovalForAll(
    operator: string,
    approved: boolean
  ): Promise<Result<TransactionReceipt, string>> {
    if (!this.signer) {
      return err('No signer configured - cannot approve');
    }

    try {
      const tx = await this.contract.setApprovalForAll(operator, approved);
      const receipt = await tx.wait();
      return ok(this.formatReceipt(receipt));
    } catch (error) {
      return err(`Set approval failed: ${error}`);
    }
  }

  /**
   * Check if approved for all
   */
  async isApprovedForAll(account: string, operator: string): Promise<boolean> {
    return await this.contract.isApprovedForAll(account, operator) as boolean;
  }

  // ============================================================================
  // INVESTOR TRACKING
  // ============================================================================

  /**
   * Get investor count for a token type
   */
  async getInvestorCount(tokenId: string): Promise<number> {
    const count = await this.contract.investorCount(tokenId) as bigint;
    return Number(count);
  }

  /**
   * Check if an address is an investor for a token type
   */
  async isInvestor(tokenId: string, address: string): Promise<boolean> {
    return await this.contract.isInvestor(tokenId, address) as boolean;
  }

  // ============================================================================
  // UTILITY FUNCTIONS
  // ============================================================================

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

  /**
   * Get total supply for a specific token ID
   */
  async totalSupply(tokenId: string): Promise<string> {
    const supply = await this.contract.totalSupply(tokenId) as bigint;
    return supply.toString();
  }
}
