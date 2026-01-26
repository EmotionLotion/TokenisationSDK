/**
 * LINK Token Balance Manager Plugin
 *
 * Manages LINK token balances for Chainlink services:
 * - Functions subscriptions
 * - Automation (Keepers) upkeeps
 * - VRF subscriptions
 *
 * Provides balance monitoring, low-balance alerts, and funding workflows.
 */

import { ethers, type Provider, type Signer } from 'ethers';
import { ok, err, type Result } from '../../core/types.js';
import { ValidationError } from '../../errors/index.js';

// LINK Token ABI (minimal)
const LINK_TOKEN_ABI = [
  'function balanceOf(address account) external view returns (uint256)',
  'function transfer(address to, uint256 amount) external returns (bool)',
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)',
  'function transferAndCall(address to, uint256 value, bytes calldata data) external returns (bool)',
];

// Functions Router ABI for subscription management
const FUNCTIONS_ROUTER_ABI = [
  'function getSubscription(uint64 subscriptionId) external view returns (uint96 balance, uint64 reqCount, address owner, address[] memory consumers)',
  'function addConsumer(uint64 subscriptionId, address consumer) external',
  'function removeConsumer(uint64 subscriptionId, address consumer) external',
];

// Automation Registry ABI
const AUTOMATION_REGISTRY_ABI = [
  'function getUpkeep(uint256 id) external view returns (address target, uint32 executeGas, bytes memory checkData, uint96 balance, address admin, uint64 maxValidBlocknumber, uint32 lastPerformBlockNumber, uint96 amountSpent, bool paused, bytes memory offchainConfig)',
  'function addFunds(uint256 id, uint96 amount) external',
  'function getMinBalance(uint256 id) external view returns (uint96)',
];

// Contract addresses by chain
const LINK_TOKENS: Record<number, string> = {
  1: '0x514910771AF9Ca656af840dff83E8264EcF986CA', // Ethereum Mainnet
  137: '0xb0897686c545045aFc77CF20eC7A532E3120E0F1', // Polygon Mainnet
  8453: '0x88Fb150BDc53A65fe94Dea0c9BA0a6dAf8C6e196', // Base Mainnet
  11155111: '0x779877A7B0D9E8603169DdbD7836e478b4624789', // Sepolia
  84532: '0xE4aB69C077896252FAFBD49EFD26B5D171A32410', // Base Sepolia
  80001: '0x326C977E6efc84E512bB9C30f76E30c160eD06FB', // Polygon Mumbai
};

const FUNCTIONS_ROUTERS: Record<number, string> = {
  84532: '0xf9B8fc078197181C841c296C876945aaa425B278',
  11155111: '0xb83E47C2bC239B3bf370bc41e1459A34b41238D0',
  80001: '0x6E2dc0F9DB014aE19888F539E59285D2Ea04244C',
};

const AUTOMATION_REGISTRIES: Record<number, string> = {
  1: '0x02777053d6764996e594c3E88AF1D58D5363a2e6', // Ethereum Mainnet v2.1
  137: '0x02777053d6764996e594c3E88AF1D58D5363a2e6', // Polygon Mainnet v2.1
  8453: '0xE226D5aCae908252CcA3F6CEFa577527650a9e1e', // Base Mainnet v2.1
  11155111: '0x86EFBD0b6736Bed994962f9797049422A3A8E8Ad', // Sepolia v2.1
  84532: '0xD421e2b5Dd4efbC1Eba7e71dCCC8D04B067c40Bb', // Base Sepolia v2.1
};

export interface LinkManagerConfig {
  chainId: number;
  rpcUrl: string;
  privateKey?: string;
  alertThresholds?: {
    functionsSubscription?: string; // LINK amount (wei)
    automationUpkeep?: string;
    vrfSubscription?: string;
  };
  alertCallback?: (alert: LinkBalanceAlert) => void;
}

export interface LinkBalanceAlert {
  type: 'FUNCTIONS' | 'AUTOMATION' | 'VRF' | 'WALLET';
  id: string;
  currentBalance: string;
  threshold: string;
  severity: 'WARNING' | 'CRITICAL';
  message: string;
  timestamp: string;
}

export interface SubscriptionBalance {
  subscriptionId: string;
  balance: string;
  formattedBalance: string;
  requestCount: bigint;
  owner: string;
  consumers: string[];
  isBelowThreshold: boolean;
}

export interface UpkeepBalance {
  upkeepId: string;
  balance: string;
  formattedBalance: string;
  minBalance: string;
  amountSpent: string;
  paused: boolean;
  isBelowThreshold: boolean;
}

export interface FundingEstimate {
  serviceName: string;
  currentBalance: string;
  recommendedTopUp: string;
  estimatedDuration: string; // e.g., "30 days"
  costPerRequest: string;
}

/**
 * LINK Token Balance Manager
 *
 * Monitors and manages LINK balances across Chainlink services.
 */
export class LinkManagerPlugin {
  readonly pluginId = 'link-manager';

  private chainId: number;
  private provider: Provider;
  private signer?: Signer;
  private linkToken: ethers.Contract;
  private alertThresholds: Required<NonNullable<LinkManagerConfig['alertThresholds']>>;
  private alertCallback?: (alert: LinkBalanceAlert) => void;
  private monitoringIntervals: Map<string, NodeJS.Timeout> = new Map();

  constructor(config: LinkManagerConfig) {
    this.chainId = config.chainId;
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl, config.chainId);

    if (config.privateKey) {
      this.signer = new ethers.Wallet(config.privateKey, this.provider);
    }

    const linkAddress = LINK_TOKENS[config.chainId];
    if (!linkAddress) {
      throw new ValidationError(`LINK token not configured for chain ${config.chainId}`, {
        field: 'chainId',
        constraints: { supportedChains: Object.keys(LINK_TOKENS).join(', ') },
      });
    }

    this.linkToken = new ethers.Contract(
      linkAddress,
      LINK_TOKEN_ABI,
      this.signer || this.provider
    );

    // Default thresholds: 1 LINK warning
    this.alertThresholds = {
      functionsSubscription: config.alertThresholds?.functionsSubscription || ethers.parseEther('1').toString(),
      automationUpkeep: config.alertThresholds?.automationUpkeep || ethers.parseEther('1').toString(),
      vrfSubscription: config.alertThresholds?.vrfSubscription || ethers.parseEther('1').toString(),
    };

    this.alertCallback = config.alertCallback;
  }

  // ============================================
  // WALLET BALANCE
  // ============================================

  /**
   * Get LINK balance of a wallet
   */
  async getWalletBalance(address: string): Promise<Result<{ balance: string; formatted: string }, string>> {
    try {
      const balance = await this.linkToken.balanceOf(address);
      return ok({
        balance: balance.toString(),
        formatted: ethers.formatEther(balance),
      });
    } catch (error) {
      return err(`Failed to get wallet balance: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Transfer LINK to an address
   */
  async transferLink(to: string, amount: string): Promise<Result<string, string>> {
    if (!this.signer) {
      return err('Signer required for transfers');
    }

    try {
      const tx = await this.linkToken.transfer(to, amount);
      const receipt = await tx.wait();
      return ok(receipt.hash);
    } catch (error) {
      return err(`Transfer failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // ============================================
  // FUNCTIONS SUBSCRIPTION MANAGEMENT
  // ============================================

  /**
   * Get Functions subscription balance
   */
  async getFunctionsSubscriptionBalance(subscriptionId: bigint): Promise<Result<SubscriptionBalance, string>> {
    const routerAddress = FUNCTIONS_ROUTERS[this.chainId];
    if (!routerAddress) {
      return err(`Functions router not configured for chain ${this.chainId}`);
    }

    try {
      const router = new ethers.Contract(routerAddress, FUNCTIONS_ROUTER_ABI, this.provider);
      const [balance, reqCount, owner, consumers] = await router.getSubscription(subscriptionId);

      const balanceStr = balance.toString();
      const threshold = BigInt(this.alertThresholds.functionsSubscription);

      return ok({
        subscriptionId: subscriptionId.toString(),
        balance: balanceStr,
        formattedBalance: ethers.formatEther(balance),
        requestCount: BigInt(reqCount.toString()),
        owner,
        consumers,
        isBelowThreshold: BigInt(balanceStr) < threshold,
      });
    } catch (error) {
      return err(`Failed to get subscription: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Fund a Functions subscription using transferAndCall
   */
  async fundFunctionsSubscription(subscriptionId: bigint, amount: string): Promise<Result<string, string>> {
    if (!this.signer) {
      return err('Signer required for funding');
    }

    const routerAddress = FUNCTIONS_ROUTERS[this.chainId];
    if (!routerAddress) {
      return err(`Functions router not configured for chain ${this.chainId}`);
    }

    try {
      // Encode subscription ID for transferAndCall
      const data = ethers.AbiCoder.defaultAbiCoder().encode(['uint64'], [subscriptionId]);

      const tx = await this.linkToken.transferAndCall(routerAddress, amount, data);
      const receipt = await tx.wait();
      return ok(receipt.hash);
    } catch (error) {
      return err(`Funding failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // ============================================
  // AUTOMATION UPKEEP MANAGEMENT
  // ============================================

  /**
   * Get Automation upkeep balance
   */
  async getAutomationUpkeepBalance(upkeepId: bigint): Promise<Result<UpkeepBalance, string>> {
    const registryAddress = AUTOMATION_REGISTRIES[this.chainId];
    if (!registryAddress) {
      return err(`Automation registry not configured for chain ${this.chainId}`);
    }

    try {
      const registry = new ethers.Contract(registryAddress, AUTOMATION_REGISTRY_ABI, this.provider);
      const upkeep = await registry.getUpkeep(upkeepId);
      const minBalance = await registry.getMinBalance(upkeepId);

      const balanceStr = upkeep.balance.toString();
      const threshold = BigInt(this.alertThresholds.automationUpkeep);

      return ok({
        upkeepId: upkeepId.toString(),
        balance: balanceStr,
        formattedBalance: ethers.formatEther(upkeep.balance),
        minBalance: minBalance.toString(),
        amountSpent: upkeep.amountSpent.toString(),
        paused: upkeep.paused,
        isBelowThreshold: BigInt(balanceStr) < threshold || BigInt(balanceStr) < BigInt(minBalance.toString()),
      });
    } catch (error) {
      return err(`Failed to get upkeep: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Fund an Automation upkeep
   */
  async fundAutomationUpkeep(upkeepId: bigint, amount: string): Promise<Result<string, string>> {
    if (!this.signer) {
      return err('Signer required for funding');
    }

    const registryAddress = AUTOMATION_REGISTRIES[this.chainId];
    if (!registryAddress) {
      return err(`Automation registry not configured for chain ${this.chainId}`);
    }

    try {
      // First approve the registry to spend LINK
      const approveTx = await this.linkToken.approve(registryAddress, amount);
      await approveTx.wait();

      // Then add funds to upkeep
      const registry = new ethers.Contract(registryAddress, AUTOMATION_REGISTRY_ABI, this.signer);
      const tx = await registry.addFunds(upkeepId, amount);
      const receipt = await tx.wait();
      return ok(receipt.hash);
    } catch (error) {
      return err(`Funding failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // ============================================
  // MONITORING
  // ============================================

  /**
   * Start monitoring a Functions subscription
   */
  startFunctionsMonitoring(subscriptionId: bigint, intervalMs: number = 300000): void {
    const key = `functions-${subscriptionId}`;

    if (this.monitoringIntervals.has(key)) {
      return; // Already monitoring
    }

    const check = async () => {
      const result = await this.getFunctionsSubscriptionBalance(subscriptionId);
      if (result.success && result.data.isBelowThreshold) {
        this.emitAlert({
          type: 'FUNCTIONS',
          id: subscriptionId.toString(),
          currentBalance: result.data.balance,
          threshold: this.alertThresholds.functionsSubscription,
          severity: BigInt(result.data.balance) < BigInt(this.alertThresholds.functionsSubscription) / 2n ? 'CRITICAL' : 'WARNING',
          message: `Functions subscription ${subscriptionId} balance (${result.data.formattedBalance} LINK) is below threshold`,
          timestamp: new Date().toISOString(),
        });
      }
    };

    check(); // Initial check
    const interval = setInterval(check, intervalMs);
    this.monitoringIntervals.set(key, interval);
  }

  /**
   * Start monitoring an Automation upkeep
   */
  startAutomationMonitoring(upkeepId: bigint, intervalMs: number = 300000): void {
    const key = `automation-${upkeepId}`;

    if (this.monitoringIntervals.has(key)) {
      return; // Already monitoring
    }

    const check = async () => {
      const result = await this.getAutomationUpkeepBalance(upkeepId);
      if (result.success && result.data.isBelowThreshold) {
        this.emitAlert({
          type: 'AUTOMATION',
          id: upkeepId.toString(),
          currentBalance: result.data.balance,
          threshold: this.alertThresholds.automationUpkeep,
          severity: BigInt(result.data.balance) < BigInt(result.data.minBalance) ? 'CRITICAL' : 'WARNING',
          message: `Automation upkeep ${upkeepId} balance (${result.data.formattedBalance} LINK) is below threshold`,
          timestamp: new Date().toISOString(),
        });
      }
    };

    check(); // Initial check
    const interval = setInterval(check, intervalMs);
    this.monitoringIntervals.set(key, interval);
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(key: string): void {
    const interval = this.monitoringIntervals.get(key);
    if (interval) {
      clearInterval(interval);
      this.monitoringIntervals.delete(key);
    }
  }

  /**
   * Stop all monitoring
   */
  stopAllMonitoring(): void {
    for (const interval of this.monitoringIntervals.values()) {
      clearInterval(interval);
    }
    this.monitoringIntervals.clear();
  }

  // ============================================
  // COST ESTIMATION
  // ============================================

  /**
   * Estimate LINK costs for Functions
   */
  estimateFunctionsCost(params: {
    gasUsed: number;
    callbackGasLimit: number;
    gasPrice: bigint;
    linkPremium?: number; // Default 0.2 LINK per request
  }): FundingEstimate {
    const { gasUsed, callbackGasLimit, gasPrice, linkPremium = 0.2 } = params;

    // Functions cost = Premium + (callback gas * gas price in LINK)
    // This is a simplified estimate
    const gasCostWei = BigInt(callbackGasLimit) * gasPrice;
    const gasCostLink = Number(ethers.formatEther(gasCostWei));
    const costPerRequest = linkPremium + gasCostLink;

    return {
      serviceName: 'Chainlink Functions',
      currentBalance: '0', // Would need to be fetched
      recommendedTopUp: ethers.parseEther((costPerRequest * 100).toString()).toString(), // 100 requests
      estimatedDuration: '~100 requests',
      costPerRequest: costPerRequest.toFixed(4) + ' LINK',
    };
  }

  /**
   * Estimate LINK costs for Automation
   */
  estimateAutomationCost(params: {
    performGasLimit: number;
    checksPerDay: number;
    performsPerDay: number;
    gasPrice: bigint;
  }): FundingEstimate {
    const { performGasLimit, checksPerDay, performsPerDay, gasPrice } = params;

    // Automation cost = check gas + perform gas (when triggered)
    // Premium varies by registry version
    const checkGas = 150000n; // Approximate check gas
    const performGas = BigInt(performGasLimit);

    const dailyCost = (checkGas * BigInt(checksPerDay) + performGas * BigInt(performsPerDay)) * gasPrice;
    const monthlyCost = dailyCost * 30n;

    return {
      serviceName: 'Chainlink Automation',
      currentBalance: '0',
      recommendedTopUp: (monthlyCost * 2n).toString(), // 2 months buffer
      estimatedDuration: '~60 days',
      costPerRequest: ethers.formatEther(performGas * gasPrice) + ' LINK per perform',
    };
  }

  // ============================================
  // UTILITY
  // ============================================

  private emitAlert(alert: LinkBalanceAlert): void {
    if (this.alertCallback) {
      this.alertCallback(alert);
    }
    console.warn(`[LinkManager] ${alert.severity}: ${alert.message}`);
  }

  /**
   * Get LINK token address for current chain
   */
  getLinkTokenAddress(): string {
    return LINK_TOKENS[this.chainId];
  }

  /**
   * Set alert callback
   */
  setAlertCallback(callback: (alert: LinkBalanceAlert) => void): void {
    this.alertCallback = callback;
  }

  /**
   * Update alert thresholds
   */
  setAlertThresholds(thresholds: Partial<typeof this.alertThresholds>): void {
    this.alertThresholds = { ...this.alertThresholds, ...thresholds };
  }
}

// Factory functions
export function createLinkManager(config: LinkManagerConfig): LinkManagerPlugin {
  return new LinkManagerPlugin(config);
}

export function createSepoliaLinkManager(
  rpcUrl?: string,
  privateKey?: string,
  alertCallback?: (alert: LinkBalanceAlert) => void
): LinkManagerPlugin {
  return new LinkManagerPlugin({
    chainId: 11155111,
    rpcUrl: rpcUrl || 'https://ethereum-sepolia.publicnode.com',
    privateKey,
    alertCallback,
  });
}

export function createBaseSepoliaLinkManager(
  rpcUrl?: string,
  privateKey?: string,
  alertCallback?: (alert: LinkBalanceAlert) => void
): LinkManagerPlugin {
  return new LinkManagerPlugin({
    chainId: 84532,
    rpcUrl: rpcUrl || 'https://sepolia.base.org',
    privateKey,
    alertCallback,
  });
}

export default LinkManagerPlugin;
