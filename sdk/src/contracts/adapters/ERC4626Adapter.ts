/**
 * ERC4626Adapter - Tokenized Vault Adapter
 *
 * Implements ERC-4626 standard for yield-bearing vaults.
 * Supports deposits, withdrawals, and yield distribution.
 *
 * Use Cases:
 * - Yield-bearing real estate tokens
 * - Auto-compounding dividend tokens
 * - Revenue share pools
 * - Staking vaults
 * - LP token wrappers
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
 * ERC-4626 Tokenized Vault ABI
 */
const ERC4626_ABI = [
  // ERC-20 Base
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function transferFrom(address from, address to, uint256 amount) returns (bool)',

  // ERC-4626 Vault
  'function asset() view returns (address)',
  'function totalAssets() view returns (uint256)',
  'function convertToShares(uint256 assets) view returns (uint256)',
  'function convertToAssets(uint256 shares) view returns (uint256)',
  'function maxDeposit(address receiver) view returns (uint256)',
  'function maxMint(address receiver) view returns (uint256)',
  'function maxWithdraw(address owner) view returns (uint256)',
  'function maxRedeem(address owner) view returns (uint256)',
  'function previewDeposit(uint256 assets) view returns (uint256)',
  'function previewMint(uint256 shares) view returns (uint256)',
  'function previewWithdraw(uint256 assets) view returns (uint256)',
  'function previewRedeem(uint256 shares) view returns (uint256)',
  'function deposit(uint256 assets, address receiver) returns (uint256)',
  'function mint(uint256 shares, address receiver) returns (uint256)',
  'function withdraw(uint256 assets, address receiver, address owner) returns (uint256)',
  'function redeem(uint256 shares, address receiver, address owner) returns (uint256)',

  // Events
  'event Deposit(address indexed sender, address indexed owner, uint256 assets, uint256 shares)',
  'event Withdraw(address indexed sender, address indexed receiver, address indexed owner, uint256 assets, uint256 shares)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'event Approval(address indexed owner, address indexed spender, uint256 value)',
];

/**
 * ERC-20 Token ABI (for underlying asset)
 */
const ERC20_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function balanceOf(address account) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
];

/**
 * Vault state information
 */
export interface VaultState {
  /** Total assets under management */
  totalAssets: string;

  /** Total vault shares */
  totalShares: string;

  /** Share price (assets per share) */
  sharePrice: string;

  /** Underlying asset address */
  assetAddress: string;

  /** Asset token info */
  assetInfo: {
    name: string;
    symbol: string;
    decimals: number;
  };

  /** APY (if tracked) */
  apy?: number;
}

/**
 * Deposit preview result
 */
export interface DepositPreview {
  /** Assets to deposit */
  assets: string;

  /** Shares to receive */
  shares: string;

  /** Effective price */
  effectivePrice: string;

  /** Slippage from current price */
  slippage: string;
}

/**
 * Withdrawal preview result
 */
export interface WithdrawPreview {
  /** Shares to burn */
  shares: string;

  /** Assets to receive */
  assets: string;

  /** Effective price */
  effectivePrice: string;
}

/**
 * User position in vault
 */
export interface VaultPosition {
  /** User's share balance */
  shares: string;

  /** Equivalent asset value */
  assetValue: string;

  /** Share of total vault (percentage) */
  shareOfVault: string;

  /** Max withdrawable assets */
  maxWithdraw: string;

  /** Max redeemable shares */
  maxRedeem: string;
}

/**
 * ERC4626 Adapter configuration
 */
export interface ERC4626AdapterConfig {
  /** Vault contract address */
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
 * ERC4626Adapter implementation
 */
export class ERC4626Adapter implements ITokenAdapter {
  readonly pluginId: string;
  readonly tokenInfo: TokenInfo;

  private provider: ethers.JsonRpcProvider;
  private contract: ethers.Contract;
  private assetContract: ethers.Contract | null = null;
  private signer: ethers.Wallet | null = null;
  private assetAddress: string = '';
  private assetDecimals: number = 18;

  private constructor(
    pluginId: string,
    tokenInfo: TokenInfo,
    provider: ethers.JsonRpcProvider,
    contract: ethers.Contract,
    signer: ethers.Wallet | null,
    assetContract: ethers.Contract | null,
    assetAddress: string,
    assetDecimals: number
  ) {
    this.pluginId = pluginId;
    this.tokenInfo = tokenInfo;
    this.provider = provider;
    this.contract = contract;
    this.signer = signer;
    this.assetContract = assetContract;
    this.assetAddress = assetAddress;
    this.assetDecimals = assetDecimals;
  }

  /**
   * Create and initialize an ERC4626Adapter
   */
  static async create(config: ERC4626AdapterConfig): Promise<ERC4626Adapter> {
    const provider = new ethers.JsonRpcProvider(config.providerUrl);
    const abi = config.abi || ERC4626_ABI;

    let signer: ethers.Wallet | null = null;
    let contract: ethers.Contract;

    if (config.privateKey) {
      signer = new ethers.Wallet(config.privateKey, provider);
      contract = new ethers.Contract(config.contractAddress, abi, signer);
    } else {
      contract = new ethers.Contract(config.contractAddress, abi, provider);
    }

    // Fetch vault token info
    const [name, symbol, decimals, totalSupply, assetAddress] = await Promise.all([
      contract.name() as Promise<string>,
      contract.symbol() as Promise<string>,
      contract.decimals() as Promise<number>,
      contract.totalSupply() as Promise<bigint>,
      contract.asset() as Promise<string>,
    ]);

    // Get underlying asset info
    const assetContractInstance = new ethers.Contract(
      assetAddress,
      ERC20_ABI,
      signer || provider
    );
    const assetDecimals = (await assetContractInstance.decimals()) as number;

    const tokenInfo: TokenInfo = {
      address: config.contractAddress,
      name,
      symbol,
      decimals: Number(decimals),
      totalSupply: totalSupply.toString(),
      tokenType: 'ERC4626',
    };

    const pluginId = `erc4626-${config.contractAddress.toLowerCase().slice(0, 8)}`;

    return new ERC4626Adapter(
      pluginId,
      tokenInfo,
      provider,
      contract,
      signer,
      assetContractInstance,
      assetAddress,
      Number(assetDecimals)
    );
  }

  // ============================================================================
  // ITokenAdapter Implementation
  // ============================================================================

  /**
   * Mint shares by depositing assets
   */
  async mint(
    to: string,
    amount: string
  ): Promise<Result<TransactionReceipt, string>> {
    // In ERC4626, mint mints exact shares (not assets)
    // We deposit assets equivalent to the share amount
    return this.depositAssets(amount, to);
  }

  /**
   * Transfer shares
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
   * Burn shares by withdrawing assets
   */
  async burn(
    from: string,
    amount: string
  ): Promise<Result<TransactionReceipt, string>> {
    // In ERC4626, burning happens via redeem
    return this.redeemShares(amount, from, from);
  }

  /**
   * Freeze not supported in ERC-4626
   */
  async freeze(_target: string): Promise<Result<TransactionReceipt, string>> {
    return err('ERC-4626 does not support account freezing');
  }

  /**
   * Unfreeze not supported in ERC-4626
   */
  async unfreeze(_target: string): Promise<Result<TransactionReceipt, string>> {
    return err('ERC-4626 does not support account freezing');
  }

  /**
   * Get share balance
   */
  async balanceOf(address: string): Promise<string> {
    const balance = (await this.contract.balanceOf(address)) as bigint;
    return balance.toString();
  }

  /**
   * Check if address is frozen (ERC-4626 doesn't have native freeze)
   */
  async isFrozen(_address: string): Promise<boolean> {
    // ERC-4626 doesn't support account freezing
    return false;
  }

  // ============================================================================
  // ERC-4626 Specific Methods
  // ============================================================================

  /**
   * Get vault state
   */
  async getVaultState(): Promise<VaultState> {
    const [totalAssets, totalShares, assetName, assetSymbol, assetDecimals] = await Promise.all([
      this.contract.totalAssets() as Promise<bigint>,
      this.contract.totalSupply() as Promise<bigint>,
      this.assetContract?.name() as Promise<string>,
      this.assetContract?.symbol() as Promise<string>,
      this.assetContract?.decimals() as Promise<number>,
    ]);

    const sharePrice =
      totalShares > 0n
        ? (totalAssets * BigInt(10 ** this.tokenInfo.decimals)) / totalShares
        : BigInt(10 ** this.assetDecimals);

    return {
      totalAssets: totalAssets.toString(),
      totalShares: totalShares.toString(),
      sharePrice: sharePrice.toString(),
      assetAddress: this.assetAddress,
      assetInfo: {
        name: assetName,
        symbol: assetSymbol,
        decimals: Number(assetDecimals),
      },
    };
  }

  /**
   * Get user position in vault
   */
  async getPosition(address: string): Promise<VaultPosition> {
    const [shares, maxWithdraw, maxRedeem, totalShares] = await Promise.all([
      this.contract.balanceOf(address) as Promise<bigint>,
      this.contract.maxWithdraw(address) as Promise<bigint>,
      this.contract.maxRedeem(address) as Promise<bigint>,
      this.contract.totalSupply() as Promise<bigint>,
    ]);

    const assetValue = (await this.contract.convertToAssets(shares)) as bigint;
    const shareOfVault =
      totalShares > 0n ? (shares * 10000n) / totalShares : 0n; // In basis points

    return {
      shares: shares.toString(),
      assetValue: assetValue.toString(),
      shareOfVault: (Number(shareOfVault) / 100).toFixed(2), // Convert to percentage
      maxWithdraw: maxWithdraw.toString(),
      maxRedeem: maxRedeem.toString(),
    };
  }

  /**
   * Preview a deposit
   */
  async previewDeposit(assets: string): Promise<DepositPreview> {
    const shares = (await this.contract.previewDeposit(assets)) as bigint;
    const currentSharePrice = (await this.contract.convertToAssets(
      BigInt(10 ** this.tokenInfo.decimals)
    )) as bigint;
    const effectivePrice = BigInt(assets) / shares;

    const slippage =
      currentSharePrice > 0n
        ? ((effectivePrice - currentSharePrice) * 10000n) / currentSharePrice
        : 0n;

    return {
      assets,
      shares: shares.toString(),
      effectivePrice: effectivePrice.toString(),
      slippage: (Number(slippage) / 100).toFixed(2),
    };
  }

  /**
   * Preview a withdrawal
   */
  async previewWithdraw(assets: string): Promise<WithdrawPreview> {
    const shares = (await this.contract.previewWithdraw(assets)) as bigint;
    const effectivePrice = shares > 0n ? BigInt(assets) / shares : 0n;

    return {
      shares: shares.toString(),
      assets,
      effectivePrice: effectivePrice.toString(),
    };
  }

  /**
   * Preview a redemption (shares to assets)
   */
  async previewRedeem(shares: string): Promise<{ assets: string; shares: string }> {
    const assets = (await this.contract.previewRedeem(shares)) as bigint;
    return {
      shares,
      assets: assets.toString(),
    };
  }

  /**
   * Deposit assets to receive shares
   */
  async depositAssets(
    assets: string,
    receiver: string
  ): Promise<Result<TransactionReceipt, string>> {
    if (!this.signer) {
      return err('No signer configured - cannot deposit');
    }

    try {
      // First, approve the vault to spend assets
      const signerAddress = await this.signer.getAddress();
      const allowance = (await this.assetContract?.allowance(
        signerAddress,
        this.tokenInfo.address
      )) as bigint;

      if (allowance < BigInt(assets)) {
        const approveTx = await this.assetContract?.approve(
          this.tokenInfo.address,
          ethers.MaxUint256
        );
        await approveTx.wait();
      }

      // Then deposit
      const tx = await this.contract.deposit(assets, receiver);
      const receipt = await tx.wait();

      return ok(this.formatReceipt(receipt));
    } catch (error) {
      return err(`Deposit failed: ${error}`);
    }
  }

  /**
   * Mint exact shares (depositing variable assets)
   */
  async mintShares(
    shares: string,
    receiver: string
  ): Promise<Result<TransactionReceipt, string>> {
    if (!this.signer) {
      return err('No signer configured - cannot mint');
    }

    try {
      // Preview to get required assets
      const requiredAssets = (await this.contract.previewMint(shares)) as bigint;
      const signerAddress = await this.signer.getAddress();

      // Approve if needed
      const allowance = (await this.assetContract?.allowance(
        signerAddress,
        this.tokenInfo.address
      )) as bigint;

      if (allowance < requiredAssets) {
        const approveTx = await this.assetContract?.approve(
          this.tokenInfo.address,
          ethers.MaxUint256
        );
        await approveTx.wait();
      }

      const tx = await this.contract.mint(shares, receiver);
      const receipt = await tx.wait();

      return ok(this.formatReceipt(receipt));
    } catch (error) {
      return err(`Mint shares failed: ${error}`);
    }
  }

  /**
   * Withdraw exact assets (burning variable shares)
   */
  async withdrawAssets(
    assets: string,
    receiver: string,
    owner: string
  ): Promise<Result<TransactionReceipt, string>> {
    if (!this.signer) {
      return err('No signer configured - cannot withdraw');
    }

    try {
      const tx = await this.contract.withdraw(assets, receiver, owner);
      const receipt = await tx.wait();

      return ok(this.formatReceipt(receipt));
    } catch (error) {
      return err(`Withdraw failed: ${error}`);
    }
  }

  /**
   * Redeem exact shares (receiving variable assets)
   */
  async redeemShares(
    shares: string,
    receiver: string,
    owner: string
  ): Promise<Result<TransactionReceipt, string>> {
    if (!this.signer) {
      return err('No signer configured - cannot redeem');
    }

    try {
      const tx = await this.contract.redeem(shares, receiver, owner);
      const receipt = await tx.wait();

      return ok(this.formatReceipt(receipt));
    } catch (error) {
      return err(`Redeem failed: ${error}`);
    }
  }

  /**
   * Convert assets to shares
   */
  async convertToShares(assets: string): Promise<string> {
    const shares = (await this.contract.convertToShares(assets)) as bigint;
    return shares.toString();
  }

  /**
   * Convert shares to assets
   */
  async convertToAssets(shares: string): Promise<string> {
    const assets = (await this.contract.convertToAssets(shares)) as bigint;
    return assets.toString();
  }

  /**
   * Get max deposit for receiver
   */
  async maxDeposit(receiver: string): Promise<string> {
    const max = (await this.contract.maxDeposit(receiver)) as bigint;
    return max.toString();
  }

  /**
   * Get max mint for receiver
   */
  async maxMint(receiver: string): Promise<string> {
    const max = (await this.contract.maxMint(receiver)) as bigint;
    return max.toString();
  }

  /**
   * Get max withdraw for owner
   */
  async maxWithdraw(owner: string): Promise<string> {
    const max = (await this.contract.maxWithdraw(owner)) as bigint;
    return max.toString();
  }

  /**
   * Get max redeem for owner
   */
  async maxRedeem(owner: string): Promise<string> {
    const max = (await this.contract.maxRedeem(owner)) as bigint;
    return max.toString();
  }

  /**
   * Get underlying asset balance
   */
  async assetBalanceOf(address: string): Promise<string> {
    const balance = (await this.assetContract?.balanceOf(address)) as bigint;
    return balance.toString();
  }

  /**
   * Approve spending of underlying assets
   */
  async approveAssets(
    spender: string,
    amount: string
  ): Promise<Result<TransactionReceipt, string>> {
    if (!this.signer || !this.assetContract) {
      return err('No signer configured - cannot approve');
    }

    try {
      const tx = await this.assetContract.approve(spender, amount);
      const receipt = await tx.wait();
      return ok(this.formatReceipt(receipt));
    } catch (error) {
      return err(`Approve failed: ${error}`);
    }
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  /**
   * Calculate yield earned since last checkpoint
   */
  async calculateYieldEarned(
    address: string,
    initialShares: string,
    initialAssetValue: string
  ): Promise<{
    currentValue: string;
    yieldAmount: string;
    yieldPercentage: string;
  }> {
    const currentValue = (await this.contract.convertToAssets(initialShares)) as bigint;
    const yieldAmount = currentValue - BigInt(initialAssetValue);
    const yieldPercentage =
      BigInt(initialAssetValue) > 0n
        ? (yieldAmount * 10000n) / BigInt(initialAssetValue)
        : 0n;

    return {
      currentValue: currentValue.toString(),
      yieldAmount: yieldAmount.toString(),
      yieldPercentage: (Number(yieldPercentage) / 100).toFixed(2),
    };
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
   * Get the vault contract
   */
  getContract(): ethers.Contract {
    return this.contract;
  }

  /**
   * Get the underlying asset contract
   */
  getAssetContract(): ethers.Contract | null {
    return this.assetContract;
  }

  /**
   * Get the underlying asset address
   */
  getAssetAddress(): string {
    return this.assetAddress;
  }
}
