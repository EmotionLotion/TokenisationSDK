/**
 * Chainlink Automation (Keepers) Plugin
 *
 * Provides automated, decentralized execution for:
 * - Scheduled dividend distributions
 * - Periodic compliance re-verification
 * - NAV updates and rebalancing
 * - License/subscription renewals
 * - Escrow releases
 *
 * Integrates with Chainlink Automation v2.1 for reliable, gas-efficient automation.
 */

import { ethers, type Provider, type Signer, type ContractTransactionResponse } from 'ethers';
import { ok, err, type Result } from '@tokenisation/core';
import { ValidationError } from '@tokenisation/core';

// Automation Registry v2.1 ABI (minimal)
const AUTOMATION_REGISTRY_ABI = [
  'function registerUpkeep(tuple(address target, uint32 gasLimit, address admin, uint8 triggerType, bytes checkData, bytes triggerConfig, bytes offchainConfig) memory params) external returns (uint256 upkeepId)',
  'function getUpkeep(uint256 id) external view returns (address target, uint32 executeGas, bytes memory checkData, uint96 balance, address admin, uint64 maxValidBlocknumber, uint32 lastPerformBlockNumber, uint96 amountSpent, bool paused, bytes memory offchainConfig)',
  'function pauseUpkeep(uint256 id) external',
  'function unpauseUpkeep(uint256 id) external',
  'function cancelUpkeep(uint256 id) external',
  'function addFunds(uint256 id, uint96 amount) external',
  'function getMinBalance(uint256 id) external view returns (uint96)',
  'function setUpkeepGasLimit(uint256 id, uint32 gasLimit) external',
  'function getActiveUpkeepIDs(uint256 startIndex, uint256 maxCount) external view returns (uint256[] memory)',
  'event UpkeepRegistered(uint256 indexed id, uint32 executeGas, address admin)',
  'event UpkeepPerformed(uint256 indexed id, bool indexed success, uint96 totalPayment, uint256 gasUsed, uint256 gasOverhead, bytes trigger)',
];

// Automation-compatible contract interface
const AUTOMATION_COMPATIBLE_ABI = [
  'function checkUpkeep(bytes calldata checkData) external view returns (bool upkeepNeeded, bytes memory performData)',
  'function performUpkeep(bytes calldata performData) external',
];

// Registry addresses by chain (v2.1)
const AUTOMATION_REGISTRIES: Record<number, string> = {
  1: '0x02777053d6764996e594c3E88AF1D58D5363a2e6', // Ethereum Mainnet
  137: '0x02777053d6764996e594c3E88AF1D58D5363a2e6', // Polygon Mainnet
  8453: '0xE226D5aCae908252CcA3F6CEFa577527650a9e1e', // Base Mainnet
  11155111: '0x86EFBD0b6736Bed994962f9797049422A3A8E8Ad', // Sepolia
  84532: '0xD421e2b5Dd4efbC1Eba7e71dCCC8D04B067c40Bb', // Base Sepolia
  42161: '0x02777053d6764996e594c3E88AF1D58D5363a2e6', // Arbitrum
};

export enum TriggerType {
  CONDITIONAL = 0,
  LOG = 1,
}

export enum AutomationTaskType {
  DISTRIBUTION = 'DISTRIBUTION',
  COMPLIANCE_CHECK = 'COMPLIANCE_CHECK',
  NAV_UPDATE = 'NAV_UPDATE',
  ESCROW_RELEASE = 'ESCROW_RELEASE',
  LICENSE_RENEWAL = 'LICENSE_RENEWAL',
  DLD_REGISTRY_CHECK = 'DLD_REGISTRY_CHECK',
  CUSTOM = 'CUSTOM',
}

export interface AutomationPluginConfig {
  chainId: number;
  rpcUrl: string;
  /**
   * @deprecated Use `connectSigner()` with an external Signer (Fireblocks, Ledger, AWS KMS) instead.
   * Raw private keys should never be hardcoded or stored in .env files in production.
   */
  privateKey?: string;
}

export interface UpkeepRegistration {
  target: string; // Automation-compatible contract address
  gasLimit: number;
  admin: string;
  triggerType: TriggerType;
  checkData: string; // Bytes passed to checkUpkeep
  triggerConfig?: string; // For log triggers
  offchainConfig?: string;
  name?: string;
  encryptedEmail?: string;
}

export interface UpkeepInfo {
  id: string;
  target: string;
  gasLimit: number;
  balance: string;
  formattedBalance: string;
  admin: string;
  lastPerformBlock: number;
  amountSpent: string;
  paused: boolean;
  minBalance: string;
  isActive: boolean;
}

export interface AutomationTask {
  id: string;
  type: AutomationTaskType;
  upkeepId?: string;
  contractAddress: string;
  checkData: string;
  enabled: boolean;
  lastCheck?: string;
  lastPerform?: string;
  performCount: number;
  metadata?: Record<string, unknown>;
}

export interface PerformanceLog {
  upkeepId: string;
  success: boolean;
  gasUsed: string;
  payment: string;
  timestamp: string;
  blockNumber: number;
}

/**
 * Chainlink Automation Plugin
 *
 * Manages automated task execution via Chainlink Keepers.
 */
export class ChainlinkAutomationPlugin {
  readonly pluginId = 'chainlink-automation';

  private chainId: number;
  private provider: Provider;
  private signer?: Signer;
  private registry: ethers.Contract;
  private tasks: Map<string, AutomationTask> = new Map();
  private performanceLogs: PerformanceLog[] = [];

  constructor(config: AutomationPluginConfig) {
    this.chainId = config.chainId;
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl, config.chainId);

    if (config.privateKey) {
      console.warn(
        '[ChainlinkAutomation] WARNING: Using raw privateKey is deprecated and insecure for production. ' +
        'Use connectSigner() with an external Signer (Fireblocks, Ledger, AWS KMS) instead.'
      );
      this.signer = new ethers.Wallet(config.privateKey, this.provider);
    }

    const registryAddress = AUTOMATION_REGISTRIES[config.chainId];
    if (!registryAddress) {
      throw new ValidationError(`Automation registry not configured for chain ${config.chainId}`, {
        field: 'chainId',
        constraints: { supportedChains: Object.keys(AUTOMATION_REGISTRIES).join(', ') },
      });
    }

    this.registry = new ethers.Contract(
      registryAddress,
      AUTOMATION_REGISTRY_ABI,
      this.signer || this.provider
    );

    // Listen for perform events
    this.setupEventListeners();
  }

  /**
   * Connect with an external signer (preferred over raw privateKey for production).
   */
  connectSigner(signer: Signer): void {
    this.signer = signer;
    this.registry = new ethers.Contract(
      AUTOMATION_REGISTRIES[this.chainId],
      AUTOMATION_REGISTRY_ABI,
      this.signer
    );
  }

  // ============================================
  // UPKEEP REGISTRATION
  // ============================================

  /**
   * Register a new upkeep.
   * Automatically runs simulateCheckUpkeep before registration to validate
   * the target contract and warn if the provided gasLimit may be insufficient.
   */
  async registerUpkeep(params: UpkeepRegistration): Promise<Result<string, string>> {
    if (!this.signer) {
      return err('Signer required for registration');
    }

    try {
      // Pre-registration gas simulation: validate the target contract
      // responds to checkUpkeep and estimate gas usage
      const checkData = params.checkData || '0x';
      try {
        const targetContract = new ethers.Contract(
          params.target,
          AUTOMATION_COMPATIBLE_ABI,
          this.provider
        );
        const gasEstimate = await this.provider.estimateGas({
          to: params.target,
          data: targetContract.interface.encodeFunctionData('checkUpkeep', [checkData]),
        });
        const estimatedGas = Number(gasEstimate);
        // performUpkeep typically uses 2-3x the gas of checkUpkeep
        const estimatedPerformGas = estimatedGas * 3;
        if (params.gasLimit < estimatedPerformGas) {
          console.warn(
            `[ChainlinkAutomation] WARNING: Provided gasLimit (${params.gasLimit}) may be insufficient. ` +
            `checkUpkeep estimated ${estimatedGas} gas; performUpkeep may need ~${estimatedPerformGas}. ` +
            `Insufficient gas will cause repeated failed executions that drain your LINK balance.`
          );
        }
      } catch {
        // Simulation failed — target may not implement checkUpkeep or is not yet deployed.
        // Log warning but proceed with registration (user may know what they're doing).
        console.warn(
          `[ChainlinkAutomation] WARNING: Could not simulate checkUpkeep on target ${params.target}. ` +
          `Ensure the contract implements AutomationCompatibleInterface and is deployed.`
        );
      }

      const registrationParams = {
        target: params.target,
        gasLimit: params.gasLimit,
        admin: params.admin,
        triggerType: params.triggerType,
        checkData,
        triggerConfig: params.triggerConfig || '0x',
        offchainConfig: params.offchainConfig || '0x',
      };

      const tx: ContractTransactionResponse = await this.registry.registerUpkeep(registrationParams);
      const receipt = await tx.wait();

      // Find UpkeepRegistered event
      const event = receipt?.logs.find(log => {
        try {
          const parsed = this.registry.interface.parseLog({
            topics: [...log.topics],
            data: log.data,
          });
          return parsed?.name === 'UpkeepRegistered';
        } catch {
          return false;
        }
      });

      if (event) {
        const parsed = this.registry.interface.parseLog({
          topics: [...event.topics],
          data: event.data,
        });
        const upkeepId = parsed?.args?.id?.toString();
        return ok(upkeepId || 'unknown');
      }

      return ok(receipt?.hash || 'unknown');
    } catch (error) {
      return err(`Registration failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get upkeep information
   */
  async getUpkeep(upkeepId: string | bigint): Promise<Result<UpkeepInfo, string>> {
    try {
      const upkeep = await this.registry.getUpkeep(upkeepId);
      const minBalance = await this.registry.getMinBalance(upkeepId);

      return ok({
        id: upkeepId.toString(),
        target: upkeep.target,
        gasLimit: Number(upkeep.executeGas),
        balance: upkeep.balance.toString(),
        formattedBalance: ethers.formatEther(upkeep.balance),
        admin: upkeep.admin,
        lastPerformBlock: Number(upkeep.lastPerformBlockNumber),
        amountSpent: upkeep.amountSpent.toString(),
        paused: upkeep.paused,
        minBalance: minBalance.toString(),
        isActive: !upkeep.paused && BigInt(upkeep.balance.toString()) >= BigInt(minBalance.toString()),
      });
    } catch (error) {
      return err(`Failed to get upkeep: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Pause an upkeep
   */
  async pauseUpkeep(upkeepId: string | bigint): Promise<Result<string, string>> {
    if (!this.signer) {
      return err('Signer required');
    }

    try {
      const tx = await this.registry.pauseUpkeep(upkeepId);
      const receipt = await tx.wait();
      return ok(receipt.hash);
    } catch (error) {
      return err(`Pause failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Unpause an upkeep
   */
  async unpauseUpkeep(upkeepId: string | bigint): Promise<Result<string, string>> {
    if (!this.signer) {
      return err('Signer required');
    }

    try {
      const tx = await this.registry.unpauseUpkeep(upkeepId);
      const receipt = await tx.wait();
      return ok(receipt.hash);
    } catch (error) {
      return err(`Unpause failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Cancel an upkeep
   */
  async cancelUpkeep(upkeepId: string | bigint): Promise<Result<string, string>> {
    if (!this.signer) {
      return err('Signer required');
    }

    try {
      const tx = await this.registry.cancelUpkeep(upkeepId);
      const receipt = await tx.wait();
      return ok(receipt.hash);
    } catch (error) {
      return err(`Cancel failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Update upkeep gas limit
   */
  async setUpkeepGasLimit(upkeepId: string | bigint, gasLimit: number): Promise<Result<string, string>> {
    if (!this.signer) {
      return err('Signer required');
    }

    try {
      const tx = await this.registry.setUpkeepGasLimit(upkeepId, gasLimit);
      const receipt = await tx.wait();
      return ok(receipt.hash);
    } catch (error) {
      return err(`Update failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // ============================================
  // TASK MANAGEMENT
  // ============================================

  /**
   * Create and register a distribution automation task
   */
  async createDistributionTask(params: {
    distributorContract: string;
    scheduleId: string;
    gasLimit?: number;
    admin: string;
  }): Promise<Result<AutomationTask, string>> {
    const checkData = ethers.AbiCoder.defaultAbiCoder().encode(
      ['string', 'string'],
      ['DISTRIBUTION', params.scheduleId]
    );

    const result = await this.registerUpkeep({
      target: params.distributorContract,
      gasLimit: params.gasLimit || 500000,
      admin: params.admin,
      triggerType: TriggerType.CONDITIONAL,
      checkData,
    });

    if (!result.success) {
      return err(result.error);
    }

    const task: AutomationTask = {
      id: `dist-${params.scheduleId}`,
      type: AutomationTaskType.DISTRIBUTION,
      upkeepId: result.data,
      contractAddress: params.distributorContract,
      checkData,
      enabled: true,
      performCount: 0,
      metadata: { scheduleId: params.scheduleId },
    };

    this.tasks.set(task.id, task);
    return ok(task);
  }

  /**
   * Create and register a compliance check automation task
   */
  async createComplianceCheckTask(params: {
    complianceContract: string;
    assetId: string;
    checkInterval?: string; // e.g., "daily", "weekly"
    gasLimit?: number;
    admin: string;
  }): Promise<Result<AutomationTask, string>> {
    const checkData = ethers.AbiCoder.defaultAbiCoder().encode(
      ['string', 'string', 'string'],
      ['COMPLIANCE', params.assetId, params.checkInterval || 'daily']
    );

    const result = await this.registerUpkeep({
      target: params.complianceContract,
      gasLimit: params.gasLimit || 300000,
      admin: params.admin,
      triggerType: TriggerType.CONDITIONAL,
      checkData,
    });

    if (!result.success) {
      return err(result.error);
    }

    const task: AutomationTask = {
      id: `compliance-${params.assetId}`,
      type: AutomationTaskType.COMPLIANCE_CHECK,
      upkeepId: result.data,
      contractAddress: params.complianceContract,
      checkData,
      enabled: true,
      performCount: 0,
      metadata: { assetId: params.assetId, checkInterval: params.checkInterval },
    };

    this.tasks.set(task.id, task);
    return ok(task);
  }

  /**
   * Create and register a NAV update automation task
   */
  async createNAVUpdateTask(params: {
    navContract: string;
    assetId: string;
    oracleAddress?: string;
    gasLimit?: number;
    admin: string;
  }): Promise<Result<AutomationTask, string>> {
    const checkData = ethers.AbiCoder.defaultAbiCoder().encode(
      ['string', 'string', 'address'],
      ['NAV_UPDATE', params.assetId, params.oracleAddress || ethers.ZeroAddress]
    );

    const result = await this.registerUpkeep({
      target: params.navContract,
      gasLimit: params.gasLimit || 400000,
      admin: params.admin,
      triggerType: TriggerType.CONDITIONAL,
      checkData,
    });

    if (!result.success) {
      return err(result.error);
    }

    const task: AutomationTask = {
      id: `nav-${params.assetId}`,
      type: AutomationTaskType.NAV_UPDATE,
      upkeepId: result.data,
      contractAddress: params.navContract,
      checkData,
      enabled: true,
      performCount: 0,
      metadata: { assetId: params.assetId, oracleAddress: params.oracleAddress },
    };

    this.tasks.set(task.id, task);
    return ok(task);
  }

  /**
   * Create and register an escrow release automation task
   */
  async createEscrowReleaseTask(params: {
    escrowContract: string;
    escrowId: string;
    releaseCondition?: string;
    gasLimit?: number;
    admin: string;
  }): Promise<Result<AutomationTask, string>> {
    const checkData = ethers.AbiCoder.defaultAbiCoder().encode(
      ['string', 'string', 'string'],
      ['ESCROW', params.escrowId, params.releaseCondition || 'TIME_BASED']
    );

    const result = await this.registerUpkeep({
      target: params.escrowContract,
      gasLimit: params.gasLimit || 300000,
      admin: params.admin,
      triggerType: TriggerType.CONDITIONAL,
      checkData,
    });

    if (!result.success) {
      return err(result.error);
    }

    const task: AutomationTask = {
      id: `escrow-${params.escrowId}`,
      type: AutomationTaskType.ESCROW_RELEASE,
      upkeepId: result.data,
      contractAddress: params.escrowContract,
      checkData,
      enabled: true,
      performCount: 0,
      metadata: { escrowId: params.escrowId, releaseCondition: params.releaseCondition },
    };

    this.tasks.set(task.id, task);
    return ok(task);
  }

  /**
   * Create and register a DLD registry watcher automation task
   */
  async createDLDRegistryWatcher(params: {
    watcherContract: string;
    dldTitleId: string;
    deedNumber: string;
    checkInterval?: string; // e.g., "hourly", "daily"
    gasLimit?: number;
    admin: string;
  }): Promise<Result<AutomationTask, string>> {
    const checkInterval = params.checkInterval || 'daily';

    const checkData = ethers.AbiCoder.defaultAbiCoder().encode(
      ['string', 'string', 'string', 'string'],
      ['DLD_REGISTRY_CHECK', params.dldTitleId, params.deedNumber, checkInterval]
    );

    const result = await this.registerUpkeep({
      target: params.watcherContract,
      gasLimit: params.gasLimit || 300000,
      admin: params.admin,
      triggerType: TriggerType.CONDITIONAL,
      checkData,
    });

    if (!result.success) {
      return err(result.error);
    }

    const task: AutomationTask = {
      id: `dld-registry-${params.dldTitleId}`,
      type: AutomationTaskType.DLD_REGISTRY_CHECK,
      upkeepId: result.data,
      contractAddress: params.watcherContract,
      checkData,
      enabled: true,
      performCount: 0,
      metadata: {
        dldTitleId: params.dldTitleId,
        deedNumber: params.deedNumber,
        checkInterval,
      },
    };

    this.tasks.set(task.id, task);
    return ok(task);
  }

  /**
   * Get task by ID
   */
  getTask(taskId: string): AutomationTask | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * Get all tasks
   */
  getAllTasks(): AutomationTask[] {
    return Array.from(this.tasks.values());
  }

  /**
   * Get tasks by type
   */
  getTasksByType(type: AutomationTaskType): AutomationTask[] {
    return Array.from(this.tasks.values()).filter(t => t.type === type);
  }

  // ============================================
  // SIMULATION
  // ============================================

  /**
   * Simulate checkUpkeep for a contract
   */
  async simulateCheckUpkeep(
    contractAddress: string,
    checkData: string
  ): Promise<Result<{ upkeepNeeded: boolean; performData: string }, string>> {
    try {
      const contract = new ethers.Contract(
        contractAddress,
        AUTOMATION_COMPATIBLE_ABI,
        this.provider
      );

      const [upkeepNeeded, performData] = await contract.checkUpkeep.staticCall(checkData);

      return ok({ upkeepNeeded, performData });
    } catch (error) {
      return err(`Simulation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Manually trigger performUpkeep (for testing)
   */
  async manualPerform(
    contractAddress: string,
    performData: string
  ): Promise<Result<string, string>> {
    if (!this.signer) {
      return err('Signer required');
    }

    try {
      const contract = new ethers.Contract(
        contractAddress,
        AUTOMATION_COMPATIBLE_ABI,
        this.signer
      );

      const tx = await contract.performUpkeep(performData);
      const receipt = await tx.wait();
      return ok(receipt.hash);
    } catch (error) {
      return err(`Perform failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // ============================================
  // EVENT HANDLING
  // ============================================

  private setupEventListeners(): void {
    this.registry.on('UpkeepPerformed', (id, success, totalPayment, gasUsed, gasOverhead, trigger) => {
      const log: PerformanceLog = {
        upkeepId: id.toString(),
        success,
        gasUsed: gasUsed.toString(),
        payment: totalPayment.toString(),
        timestamp: new Date().toISOString(),
        blockNumber: 0, // Would need to get from event
      };

      this.performanceLogs.push(log);

      // Update task if tracked
      for (const task of this.tasks.values()) {
        if (task.upkeepId === id.toString()) {
          task.lastPerform = log.timestamp;
          task.performCount++;
          break;
        }
      }
    });
  }

  /**
   * Get performance logs
   */
  getPerformanceLogs(upkeepId?: string): PerformanceLog[] {
    if (upkeepId) {
      return this.performanceLogs.filter(log => log.upkeepId === upkeepId);
    }
    return [...this.performanceLogs];
  }

  // ============================================
  // UTILITY
  // ============================================

  /**
   * Get registry address
   */
  getRegistryAddress(): string {
    return AUTOMATION_REGISTRIES[this.chainId];
  }

  /**
   * Get active upkeep IDs
   */
  async getActiveUpkeepIds(startIndex: number = 0, maxCount: number = 100): Promise<Result<string[], string>> {
    try {
      const ids = await this.registry.getActiveUpkeepIDs(startIndex, maxCount);
      return ok(ids.map((id: bigint) => id.toString()));
    } catch (error) {
      return err(`Failed to get upkeep IDs: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Cleanup resources and remove all event listeners.
   */
  destroy(): void {
    this.registry.removeAllListeners();
    this.tasks.clear();
    this.performanceLogs.length = 0;
    (this.provider as ethers.JsonRpcProvider).removeAllListeners?.();
  }
}

// Factory functions
export function createAutomationPlugin(config: AutomationPluginConfig): ChainlinkAutomationPlugin {
  return new ChainlinkAutomationPlugin(config);
}

export function createSepoliaAutomationPlugin(
  rpcUrl?: string,
  privateKey?: string
): ChainlinkAutomationPlugin {
  return new ChainlinkAutomationPlugin({
    chainId: 11155111,
    rpcUrl: rpcUrl || 'https://ethereum-sepolia.publicnode.com',
    privateKey,
  });
}

export function createBaseSepoliaAutomationPlugin(
  rpcUrl?: string,
  privateKey?: string
): ChainlinkAutomationPlugin {
  return new ChainlinkAutomationPlugin({
    chainId: 84532,
    rpcUrl: rpcUrl || 'https://sepolia.base.org',
    privateKey,
  });
}

export default ChainlinkAutomationPlugin;
