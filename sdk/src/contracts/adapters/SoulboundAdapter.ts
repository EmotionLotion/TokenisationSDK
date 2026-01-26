/**
 * SoulboundAdapter - Non-Transferable Token Adapter
 *
 * Provides a unified interface for interacting with Soulbound Tokens (SBT).
 * SBTs are non-transferable NFTs typically used for identity, reputation,
 * credentials, and other non-tradeable attributes.
 *
 * Key features:
 * - Non-transferable (transfer reverts)
 * - Mintable by authorized issuers
 * - Burnable (can be revoked or voluntarily removed)
 * - Score/metadata updates supported
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
 * Soulbound Token ABI
 */
const SOULBOUND_TOKEN_ABI = [
  // ERC721 Metadata
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address owner) view returns (uint256)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function tokenURI(uint256 tokenId) view returns (string)',

  // Soulbound specific - transfers revert
  'function transferFrom(address from, address to, uint256 tokenId)',
  'function safeTransferFrom(address from, address to, uint256 tokenId)',

  // Minting and burning
  'function mint(address to)',
  'function mintWithData(address to, bytes data)',
  'function burn(uint256 tokenId)',
  'function revoke(uint256 tokenId)',

  // Score/Data management (for reputation SBTs)
  'function getScore(uint256 tokenId) view returns (uint256)',
  'function setScore(uint256 tokenId, uint256 score)',
  'function getTier(uint256 tokenId) view returns (string)',
  'function updateTier(uint256 tokenId, string tier)',
  'function getData(uint256 tokenId) view returns (bytes)',
  'function setData(uint256 tokenId, bytes data)',
  'function setTokenURI(uint256 tokenId, string uri)',

  // Token ID lookups
  'function tokenOfOwner(address owner) view returns (uint256)',
  'function hasToken(address owner) view returns (bool)',

  // Admin
  'function pause()',
  'function unpause()',
  'function paused() view returns (bool)',
  'function addMinter(address minter)',
  'function removeMinter(address minter)',
  'function isMinter(address account) view returns (bool)',

  // Events
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
  'event ScoreUpdated(uint256 indexed tokenId, uint256 oldScore, uint256 newScore)',
  'event TierUpdated(uint256 indexed tokenId, string oldTier, string newTier)',
  'event Revoked(uint256 indexed tokenId, address indexed owner)',
];

/**
 * Reputation tier definition
 */
export interface ReputationTier {
  name: string;
  minScore: number;
  maxScore: number;
  benefits: string[];
}

/**
 * Default reputation tiers (as specified in the implementation plan)
 */
export const DEFAULT_REPUTATION_TIERS: ReputationTier[] = [
  { name: 'BRONZE', minScore: 0, maxScore: 500, benefits: ['Base rate'] },
  { name: 'SILVER', minScore: 500, maxScore: 1500, benefits: ['+10% payout', 'Priority routes'] },
  { name: 'GOLD', minScore: 1500, maxScore: 3000, benefits: ['+20% payout', 'Premium customers'] },
  { name: 'PLATINUM', minScore: 3000, maxScore: Infinity, benefits: ['+30% payout', 'Exclusive contracts'] },
];

/**
 * SoulboundAdapter configuration
 */
export interface SoulboundAdapterConfig {
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

  /** Reputation tiers configuration */
  reputationTiers?: ReputationTier[];
}

/**
 * Soulbound token holder data
 */
export interface SoulboundTokenData {
  tokenId: string;
  owner: string;
  score: number;
  tier: string;
  tokenURI?: string;
  metadata?: Record<string, unknown>;
}

/**
 * SoulboundAdapter implementation
 */
export class SoulboundAdapter implements ITokenAdapter {
  readonly pluginId: string;
  readonly tokenInfo: TokenInfo;

  private provider: ethers.JsonRpcProvider;
  private contract: ethers.Contract;
  private signer: ethers.Wallet | null = null;
  private reputationTiers: ReputationTier[];

  private constructor(
    pluginId: string,
    tokenInfo: TokenInfo,
    provider: ethers.JsonRpcProvider,
    contract: ethers.Contract,
    signer: ethers.Wallet | null,
    reputationTiers: ReputationTier[]
  ) {
    this.pluginId = pluginId;
    this.tokenInfo = tokenInfo;
    this.provider = provider;
    this.contract = contract;
    this.signer = signer;
    this.reputationTiers = reputationTiers;
  }

  /**
   * Create and initialize a SoulboundAdapter
   */
  static async create(config: SoulboundAdapterConfig): Promise<SoulboundAdapter> {
    const provider = new ethers.JsonRpcProvider(config.providerUrl);
    const abi = config.abi || SOULBOUND_TOKEN_ABI;

    let signer: ethers.Wallet | null = null;
    let contract: ethers.Contract;

    if (config.privateKey) {
      signer = new ethers.Wallet(config.privateKey, provider);
      contract = new ethers.Contract(config.contractAddress, abi, signer);
    } else {
      contract = new ethers.Contract(config.contractAddress, abi, provider);
    }

    // Fetch token info
    let name = 'Soulbound Token';
    let symbol = 'SBT';
    let totalSupply = '0';

    try {
      [name, symbol, totalSupply] = await Promise.all([
        contract.name() as Promise<string>,
        contract.symbol() as Promise<string>,
        contract.totalSupply().then((s: bigint) => s.toString()) as Promise<string>,
      ]);
    } catch {
      // Contract might not have all these methods
    }

    const tokenInfo: TokenInfo = {
      address: config.contractAddress,
      name,
      symbol,
      decimals: 0,
      totalSupply,
      tokenType: 'SBT',
    };

    const pluginId = `sbt-${config.contractAddress.toLowerCase().slice(0, 8)}`;
    const tiers = config.reputationTiers || DEFAULT_REPUTATION_TIERS;

    return new SoulboundAdapter(pluginId, tokenInfo, provider, contract, signer, tiers);
  }

  /**
   * Mint a new Soulbound Token
   * Note: SBTs are typically limited to one per address
   */
  async mint(
    to: string,
    _amount: string = '1',
    _tokenId?: string
  ): Promise<Result<TransactionReceipt, string>> {
    if (!this.signer) {
      return err('No signer configured - cannot mint');
    }

    try {
      // Check if recipient already has a token
      const hasToken = await this.hasToken(to);
      if (hasToken) {
        return err('Address already has a Soulbound Token');
      }

      const tx = await this.contract.mint(to);
      const receipt = await tx.wait();
      return ok(this.formatReceipt(receipt));
    } catch (error) {
      return err(`Mint failed: ${error}`);
    }
  }

  /**
   * Mint with initial data (for reputation initialization)
   */
  async mintWithData(
    to: string,
    data: string
  ): Promise<Result<TransactionReceipt, string>> {
    if (!this.signer) {
      return err('No signer configured - cannot mint');
    }

    try {
      const hasToken = await this.hasToken(to);
      if (hasToken) {
        return err('Address already has a Soulbound Token');
      }

      const tx = await this.contract.mintWithData(to, data);
      const receipt = await tx.wait();
      return ok(this.formatReceipt(receipt));
    } catch (error) {
      return err(`Mint with data failed: ${error}`);
    }
  }

  /**
   * Transfer is NOT allowed for Soulbound Tokens
   * This method always returns an error
   */
  async transfer(
    _from: string,
    _to: string,
    _amount: string,
    _tokenId?: string
  ): Promise<Result<TransactionReceipt, string>> {
    return err('Soulbound Tokens are non-transferable');
  }

  /**
   * Burn a Soulbound Token
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
      return err('Token ID required for burning');
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
   * Revoke a Soulbound Token (admin function)
   */
  async revoke(tokenId: string): Promise<Result<TransactionReceipt, string>> {
    if (!this.signer) {
      return err('No signer configured - cannot revoke');
    }

    try {
      const tx = await this.contract.revoke(tokenId);
      const receipt = await tx.wait();
      return ok(this.formatReceipt(receipt));
    } catch (error) {
      return err(`Revoke failed: ${error}`);
    }
  }

  /**
   * Freeze is not applicable for SBTs (they're already non-transferable)
   */
  async freeze(_target: string): Promise<Result<TransactionReceipt, string>> {
    return err('Freeze not applicable for Soulbound Tokens');
  }

  /**
   * Unfreeze is not applicable for SBTs
   */
  async unfreeze(_target: string): Promise<Result<TransactionReceipt, string>> {
    return err('Unfreeze not applicable for Soulbound Tokens');
  }

  /**
   * Get balance (0 or 1 for SBTs)
   */
  async balanceOf(address: string): Promise<string> {
    try {
      const balance = await this.contract.balanceOf(address) as bigint;
      return balance.toString();
    } catch {
      return '0';
    }
  }

  /**
   * Check if address is frozen (always false for SBTs)
   */
  async isFrozen(_address: string): Promise<boolean> {
    return false;
  }

  /**
   * Check if address has a Soulbound Token
   */
  async hasToken(address: string): Promise<boolean> {
    try {
      return await this.contract.hasToken(address) as boolean;
    } catch {
      // Fallback: check balance
      const balance = await this.balanceOf(address);
      return BigInt(balance) > 0n;
    }
  }

  /**
   * Get token ID for an owner (SBTs are typically one per address)
   */
  async tokenOfOwner(owner: string): Promise<string | null> {
    try {
      const tokenId = await this.contract.tokenOfOwner(owner) as bigint;
      return tokenId.toString();
    } catch {
      return null;
    }
  }

  /**
   * Get the score for a token
   */
  async getScore(tokenId: string): Promise<number> {
    try {
      const score = await this.contract.getScore(tokenId) as bigint;
      return Number(score);
    } catch {
      return 0;
    }
  }

  /**
   * Update the score for a token
   */
  async setScore(
    tokenId: string,
    score: number
  ): Promise<Result<TransactionReceipt, string>> {
    if (!this.signer) {
      return err('No signer configured - cannot update score');
    }

    try {
      const tx = await this.contract.setScore(tokenId, score);
      const receipt = await tx.wait();
      return ok(this.formatReceipt(receipt));
    } catch (error) {
      return err(`Set score failed: ${error}`);
    }
  }

  /**
   * Get the tier for a token
   */
  async getTier(tokenId: string): Promise<string> {
    try {
      return await this.contract.getTier(tokenId) as string;
    } catch {
      // Calculate tier from score
      const score = await this.getScore(tokenId);
      return this.calculateTier(score);
    }
  }

  /**
   * Calculate tier based on score
   */
  calculateTier(score: number): string {
    for (const tier of this.reputationTiers) {
      if (score >= tier.minScore && score < tier.maxScore) {
        return tier.name;
      }
    }
    return 'BRONZE';
  }

  /**
   * Get tier benefits
   */
  getTierBenefits(tierName: string): string[] {
    const tier = this.reputationTiers.find(t => t.name === tierName);
    return tier?.benefits || [];
  }

  /**
   * Update the tier for a token
   */
  async updateTier(
    tokenId: string,
    tier: string
  ): Promise<Result<TransactionReceipt, string>> {
    if (!this.signer) {
      return err('No signer configured - cannot update tier');
    }

    try {
      const tx = await this.contract.updateTier(tokenId, tier);
      const receipt = await tx.wait();
      return ok(this.formatReceipt(receipt));
    } catch (error) {
      return err(`Update tier failed: ${error}`);
    }
  }

  /**
   * Update score and automatically sync tier
   */
  async updateScoreAndTier(
    tokenId: string,
    newScore: number
  ): Promise<Result<TransactionReceipt, string>> {
    // First update score
    const scoreResult = await this.setScore(tokenId, newScore);
    if (!scoreResult.success) {
      return scoreResult;
    }

    // Then update tier based on new score
    const newTier = this.calculateTier(newScore);
    return this.updateTier(tokenId, newTier);
  }

  /**
   * Get raw data stored in token
   */
  async getData(tokenId: string): Promise<string> {
    try {
      return await this.contract.getData(tokenId) as string;
    } catch {
      return '0x';
    }
  }

  /**
   * Set raw data in token
   */
  async setData(
    tokenId: string,
    data: string
  ): Promise<Result<TransactionReceipt, string>> {
    if (!this.signer) {
      return err('No signer configured - cannot set data');
    }

    try {
      const tx = await this.contract.setData(tokenId, data);
      const receipt = await tx.wait();
      return ok(this.formatReceipt(receipt));
    } catch (error) {
      return err(`Set data failed: ${error}`);
    }
  }

  /**
   * Get token URI
   */
  async tokenURI(tokenId: string): Promise<string> {
    try {
      return await this.contract.tokenURI(tokenId) as string;
    } catch {
      return '';
    }
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
   * Get owner of token
   */
  async ownerOf(tokenId: string): Promise<string> {
    try {
      return await this.contract.ownerOf(tokenId) as string;
    } catch {
      return ethers.ZeroAddress;
    }
  }

  /**
   * Get full token data
   */
  async getTokenData(tokenId: string): Promise<SoulboundTokenData | null> {
    try {
      const [owner, score, tier, tokenURI] = await Promise.all([
        this.ownerOf(tokenId),
        this.getScore(tokenId),
        this.getTier(tokenId),
        this.tokenURI(tokenId),
      ]);

      if (owner === ethers.ZeroAddress) {
        return null;
      }

      return {
        tokenId,
        owner,
        score,
        tier,
        tokenURI: tokenURI || undefined,
      };
    } catch {
      return null;
    }
  }

  /**
   * Check if contract is paused
   */
  async isPaused(): Promise<boolean> {
    try {
      return await this.contract.paused() as boolean;
    } catch {
      return false;
    }
  }

  /**
   * Pause contract
   */
  async pause(): Promise<Result<TransactionReceipt, string>> {
    if (!this.signer) {
      return err('No signer configured - cannot pause');
    }

    try {
      const tx = await this.contract.pause();
      const receipt = await tx.wait();
      return ok(this.formatReceipt(receipt));
    } catch (error) {
      return err(`Pause failed: ${error}`);
    }
  }

  /**
   * Unpause contract
   */
  async unpause(): Promise<Result<TransactionReceipt, string>> {
    if (!this.signer) {
      return err('No signer configured - cannot unpause');
    }

    try {
      const tx = await this.contract.unpause();
      const receipt = await tx.wait();
      return ok(this.formatReceipt(receipt));
    } catch (error) {
      return err(`Unpause failed: ${error}`);
    }
  }

  /**
   * Check if address is a minter
   */
  async isMinter(address: string): Promise<boolean> {
    try {
      return await this.contract.isMinter(address) as boolean;
    } catch {
      return false;
    }
  }

  /**
   * Add minter role
   */
  async addMinter(address: string): Promise<Result<TransactionReceipt, string>> {
    if (!this.signer) {
      return err('No signer configured - cannot add minter');
    }

    try {
      const tx = await this.contract.addMinter(address);
      const receipt = await tx.wait();
      return ok(this.formatReceipt(receipt));
    } catch (error) {
      return err(`Add minter failed: ${error}`);
    }
  }

  /**
   * Remove minter role
   */
  async removeMinter(address: string): Promise<Result<TransactionReceipt, string>> {
    if (!this.signer) {
      return err('No signer configured - cannot remove minter');
    }

    try {
      const tx = await this.contract.removeMinter(address);
      const receipt = await tx.wait();
      return ok(this.formatReceipt(receipt));
    } catch (error) {
      return err(`Remove minter failed: ${error}`);
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

  /**
   * Get reputation tiers
   */
  getReputationTiers(): ReputationTier[] {
    return [...this.reputationTiers];
  }
}

/**
 * Create a mock SoulboundAdapter for testing
 */
export function createMockSoulboundAdapter(): {
  mint: (to: string) => Promise<Result<{ tokenId: string }, string>>;
  burn: (tokenId: string) => Promise<Result<void, string>>;
  getScore: (tokenId: string) => number;
  setScore: (tokenId: string, score: number) => void;
  getTier: (tokenId: string) => string;
  hasToken: (address: string) => boolean;
  ownerOf: (tokenId: string) => string | null;
} {
  const tokens = new Map<string, { owner: string; score: number; tier: string }>();
  const ownerTokens = new Map<string, string>();
  let nextTokenId = 1;

  return {
    mint: async (to: string) => {
      if (ownerTokens.has(to.toLowerCase())) {
        return err('Address already has a token');
      }
      const tokenId = (nextTokenId++).toString();
      tokens.set(tokenId, { owner: to, score: 0, tier: 'BRONZE' });
      ownerTokens.set(to.toLowerCase(), tokenId);
      return ok({ tokenId });
    },

    burn: async (tokenId: string) => {
      const token = tokens.get(tokenId);
      if (!token) {
        return err('Token not found');
      }
      ownerTokens.delete(token.owner.toLowerCase());
      tokens.delete(tokenId);
      return ok(undefined);
    },

    getScore: (tokenId: string) => {
      return tokens.get(tokenId)?.score || 0;
    },

    setScore: (tokenId: string, score: number) => {
      const token = tokens.get(tokenId);
      if (token) {
        token.score = score;
        // Update tier based on score
        const tiers = DEFAULT_REPUTATION_TIERS;
        for (const tier of tiers) {
          if (score >= tier.minScore && score < tier.maxScore) {
            token.tier = tier.name;
            break;
          }
        }
      }
    },

    getTier: (tokenId: string) => {
      return tokens.get(tokenId)?.tier || 'BRONZE';
    },

    hasToken: (address: string) => {
      return ownerTokens.has(address.toLowerCase());
    },

    ownerOf: (tokenId: string) => {
      return tokens.get(tokenId)?.owner || null;
    },
  };
}
