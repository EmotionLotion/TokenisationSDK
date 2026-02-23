/**
 * Reconciliation Service
 *
 * Compares server state vs on-chain state to detect discrepancies.
 * Critical for production systems to ensure data integrity.
 *
 * Features:
 * - Balance reconciliation (server vs chain)
 * - Transfer history verification
 * - Discrepancy detection and alerting
 * - Audit report generation
 */

import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// TYPES
// ============================================================================

export enum ReconciliationType {
  BALANCE = 'BALANCE',
  TRANSFER = 'TRANSFER',
  SUPPLY = 'SUPPLY',
  HOLDER_COUNT = 'HOLDER_COUNT',
  FULL = 'FULL',
}

export enum ReconciliationStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export enum DiscrepancyType {
  BALANCE_MISMATCH = 'BALANCE_MISMATCH',
  MISSING_ON_CHAIN = 'MISSING_ON_CHAIN',
  MISSING_OFF_CHAIN = 'MISSING_OFF_CHAIN',
  SUPPLY_MISMATCH = 'SUPPLY_MISMATCH',
  HOLDER_COUNT_MISMATCH = 'HOLDER_COUNT_MISMATCH',
  TRANSFER_MISSING = 'TRANSFER_MISSING',
  TRANSFER_DUPLICATE = 'TRANSFER_DUPLICATE',
  STATE_MISMATCH = 'STATE_MISMATCH',
}

export enum DiscrepancySeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export interface BalanceRecord {
  holderId: string;
  holderAddress: string;
  balance: string;
  lastUpdated: string;
}

export interface TransferRecord {
  id: string;
  from: string;
  to: string;
  amount: string;
  timestamp: string;
  txHash?: string;
  blockNumber?: number;
}

export interface Discrepancy {
  id: string;
  type: DiscrepancyType;
  severity: DiscrepancySeverity;
  assetId: string;
  holderId?: string;
  holderAddress?: string;
  serverValue: string;
  chainValue: string;
  difference: string;
  detectedAt: string;
  resolved: boolean;
  resolvedAt?: string;
  resolution?: string;
  metadata?: Record<string, unknown>;
}

export interface ReconciliationReport {
  id: string;
  assetId: string;
  type: ReconciliationType;
  status: ReconciliationStatus;
  startedAt: string;
  completedAt?: string;
  blockNumber?: number;
  chainId?: number;

  // Summary stats
  holdersChecked: number;
  transfersChecked: number;
  discrepanciesFound: number;

  // Server state
  serverTotalSupply: string;
  serverHolderCount: number;

  // Chain state
  chainTotalSupply: string;
  chainHolderCount: number;

  // Discrepancies
  discrepancies: Discrepancy[];

  // Execution metadata
  duration?: number;
  error?: string;
}

export interface ReconciliationConfig {
  /** Asset ID to reconcile */
  assetId: string;
  /** Contract address on chain */
  contractAddress: string;
  /** Chain ID */
  chainId: number;
  /** Block number for point-in-time reconciliation (optional) */
  atBlockNumber?: number;
  /** Tolerance for balance differences (in wei) - defaults to 0 */
  balanceTolerance?: string;
  /** Whether to auto-resolve minor discrepancies */
  autoResolveMinor?: boolean;
}

// ============================================================================
// PROVIDER INTERFACES
// ============================================================================

/**
 * Server-side data provider interface
 */
export interface IServerDataProvider {
  /** Get all holder balances from server database */
  getBalances(assetId: string): Promise<BalanceRecord[]>;

  /** Get total supply from server */
  getTotalSupply(assetId: string): Promise<string>;

  /** Get transfer history from server */
  getTransfers(assetId: string, fromBlock?: number, toBlock?: number): Promise<TransferRecord[]>;

  /** Get holder count from server */
  getHolderCount(assetId: string): Promise<number>;
}

/**
 * On-chain data provider interface
 */
export interface IChainDataProvider {
  /** Get all holder balances from chain */
  getBalances(contractAddress: string, atBlock?: number): Promise<BalanceRecord[]>;

  /** Get total supply from chain */
  getTotalSupply(contractAddress: string, atBlock?: number): Promise<string>;

  /** Get transfer events from chain */
  getTransfers(contractAddress: string, fromBlock?: number, toBlock?: number): Promise<TransferRecord[]>;

  /** Get holder count from chain */
  getHolderCount(contractAddress: string, atBlock?: number): Promise<number>;

  /** Get current block number */
  getCurrentBlock(): Promise<number>;
}

/**
 * Alert handler interface
 */
export interface IReconciliationAlertHandler {
  /** Called when discrepancy is detected */
  onDiscrepancy(discrepancy: Discrepancy): Promise<void>;

  /** Called when reconciliation completes */
  onComplete(report: ReconciliationReport): Promise<void>;

  /** Called when reconciliation fails */
  onError(assetId: string, error: Error): Promise<void>;
}

// ============================================================================
// RECONCILIATION SERVICE
// ============================================================================

export class ReconciliationService {
  private serverProvider: IServerDataProvider;
  private chainProvider: IChainDataProvider;
  private alertHandlers: IReconciliationAlertHandler[] = [];
  private reports: Map<string, ReconciliationReport> = new Map();
  private discrepancies: Map<string, Discrepancy> = new Map();
  private assetContractMap: Map<string, { address: string; chainId: number }> = new Map();

  constructor(
    serverProvider: IServerDataProvider,
    chainProvider: IChainDataProvider
  ) {
    this.serverProvider = serverProvider;
    this.chainProvider = chainProvider;
  }

  /**
   * Register an alert handler
   */
  registerAlertHandler(handler: IReconciliationAlertHandler): void {
    this.alertHandlers.push(handler);
  }

  /**
   * Register asset-contract mapping
   */
  registerAsset(assetId: string, contractAddress: string, chainId: number): void {
    this.assetContractMap.set(assetId, { address: contractAddress, chainId });
  }

  /**
   * Run full reconciliation
   */
  async reconcile(config: ReconciliationConfig): Promise<ReconciliationReport> {
    const report: ReconciliationReport = {
      id: uuidv4(),
      assetId: config.assetId,
      type: ReconciliationType.FULL,
      status: ReconciliationStatus.IN_PROGRESS,
      startedAt: new Date().toISOString(),
      chainId: config.chainId,
      holdersChecked: 0,
      transfersChecked: 0,
      discrepanciesFound: 0,
      serverTotalSupply: '0',
      serverHolderCount: 0,
      chainTotalSupply: '0',
      chainHolderCount: 0,
      discrepancies: [],
    };

    const startTime = Date.now();

    try {
      // Get current or specified block
      const blockNumber = config.atBlockNumber ?? await this.chainProvider.getCurrentBlock();
      report.blockNumber = blockNumber;

      // Run reconciliation checks in parallel
      const [balanceResult, supplyResult, holderCountResult] = await Promise.all([
        this.reconcileBalances(config, blockNumber, report),
        this.reconcileSupply(config, blockNumber, report),
        this.reconcileHolderCount(config, blockNumber, report),
      ]);

      // Aggregate discrepancies
      report.discrepancies = [
        ...balanceResult,
        ...supplyResult,
        ...holderCountResult,
      ];
      report.discrepanciesFound = report.discrepancies.length;

      // Auto-resolve minor discrepancies if configured
      if (config.autoResolveMinor) {
        await this.autoResolveMinor(report, config.balanceTolerance || '0');
      }

      report.status = ReconciliationStatus.COMPLETED;
      report.completedAt = new Date().toISOString();
      report.duration = Date.now() - startTime;

      // Store report
      this.reports.set(report.id, report);

      // Store discrepancies
      for (const discrepancy of report.discrepancies) {
        this.discrepancies.set(discrepancy.id, discrepancy);
      }

      // Alert handlers
      await this.notifyCompletion(report);

      return report;

    } catch (error) {
      report.status = ReconciliationStatus.FAILED;
      report.error = error instanceof Error ? error.message : String(error);
      report.completedAt = new Date().toISOString();
      report.duration = Date.now() - startTime;

      this.reports.set(report.id, report);

      // Alert handlers
      await this.notifyError(config.assetId, error instanceof Error ? error : new Error(String(error)));

      return report;
    }
  }

  /**
   * Reconcile balances between server and chain
   */
  private async reconcileBalances(
    config: ReconciliationConfig,
    blockNumber: number,
    report: ReconciliationReport
  ): Promise<Discrepancy[]> {
    const discrepancies: Discrepancy[] = [];
    const tolerance = BigInt(config.balanceTolerance || '0');

    // Get balances from both sources
    const [serverBalances, chainBalances] = await Promise.all([
      this.serverProvider.getBalances(config.assetId),
      this.chainProvider.getBalances(config.contractAddress, blockNumber),
    ]);

    // Index by address for comparison
    const serverByAddress = new Map(serverBalances.map(b => [b.holderAddress.toLowerCase(), b]));
    const chainByAddress = new Map(chainBalances.map(b => [b.holderAddress.toLowerCase(), b]));

    report.holdersChecked = Math.max(serverBalances.length, chainBalances.length);

    // Check all server balances exist on chain with correct values
    for (const [address, serverBalance] of serverByAddress) {
      const chainBalance = chainByAddress.get(address);

      if (!chainBalance) {
        // Missing on chain
        discrepancies.push(this.createDiscrepancy({
          type: DiscrepancyType.MISSING_ON_CHAIN,
          severity: this.calculateSeverity(serverBalance.balance, '0'),
          assetId: config.assetId,
          holderId: serverBalance.holderId,
          holderAddress: address,
          serverValue: serverBalance.balance,
          chainValue: '0',
          difference: serverBalance.balance,
        }));
        continue;
      }

      // Check balance matches
      const serverBal = BigInt(serverBalance.balance);
      const chainBal = BigInt(chainBalance.balance);
      const diff = serverBal > chainBal ? serverBal - chainBal : chainBal - serverBal;

      if (diff > tolerance) {
        discrepancies.push(this.createDiscrepancy({
          type: DiscrepancyType.BALANCE_MISMATCH,
          severity: this.calculateSeverity(serverBalance.balance, chainBalance.balance),
          assetId: config.assetId,
          holderId: serverBalance.holderId,
          holderAddress: address,
          serverValue: serverBalance.balance,
          chainValue: chainBalance.balance,
          difference: diff.toString(),
        }));
      }
    }

    // Check for chain balances missing from server
    for (const [address, chainBalance] of chainByAddress) {
      if (!serverByAddress.has(address) && BigInt(chainBalance.balance) > 0n) {
        discrepancies.push(this.createDiscrepancy({
          type: DiscrepancyType.MISSING_OFF_CHAIN,
          severity: this.calculateSeverity('0', chainBalance.balance),
          assetId: config.assetId,
          holderAddress: address,
          serverValue: '0',
          chainValue: chainBalance.balance,
          difference: chainBalance.balance,
        }));
      }
    }

    // Alert for each discrepancy
    for (const discrepancy of discrepancies) {
      await this.notifyDiscrepancy(discrepancy);
    }

    return discrepancies;
  }

  /**
   * Reconcile total supply
   */
  private async reconcileSupply(
    config: ReconciliationConfig,
    blockNumber: number,
    report: ReconciliationReport
  ): Promise<Discrepancy[]> {
    const discrepancies: Discrepancy[] = [];

    const [serverSupply, chainSupply] = await Promise.all([
      this.serverProvider.getTotalSupply(config.assetId),
      this.chainProvider.getTotalSupply(config.contractAddress, blockNumber),
    ]);

    report.serverTotalSupply = serverSupply;
    report.chainTotalSupply = chainSupply;

    const serverVal = BigInt(serverSupply);
    const chainVal = BigInt(chainSupply);
    const diff = serverVal > chainVal ? serverVal - chainVal : chainVal - serverVal;

    if (diff > 0n) {
      const discrepancy = this.createDiscrepancy({
        type: DiscrepancyType.SUPPLY_MISMATCH,
        severity: DiscrepancySeverity.CRITICAL,
        assetId: config.assetId,
        serverValue: serverSupply,
        chainValue: chainSupply,
        difference: diff.toString(),
      });
      discrepancies.push(discrepancy);
      await this.notifyDiscrepancy(discrepancy);
    }

    return discrepancies;
  }

  /**
   * Reconcile holder count
   */
  private async reconcileHolderCount(
    config: ReconciliationConfig,
    blockNumber: number,
    report: ReconciliationReport
  ): Promise<Discrepancy[]> {
    const discrepancies: Discrepancy[] = [];

    const [serverCount, chainCount] = await Promise.all([
      this.serverProvider.getHolderCount(config.assetId),
      this.chainProvider.getHolderCount(config.contractAddress, blockNumber),
    ]);

    report.serverHolderCount = serverCount;
    report.chainHolderCount = chainCount;

    if (serverCount !== chainCount) {
      const diff = Math.abs(serverCount - chainCount);
      const discrepancy = this.createDiscrepancy({
        type: DiscrepancyType.HOLDER_COUNT_MISMATCH,
        severity: diff > 10 ? DiscrepancySeverity.HIGH : DiscrepancySeverity.MEDIUM,
        assetId: config.assetId,
        serverValue: serverCount.toString(),
        chainValue: chainCount.toString(),
        difference: diff.toString(),
      });
      discrepancies.push(discrepancy);
      await this.notifyDiscrepancy(discrepancy);
    }

    return discrepancies;
  }

  /**
   * Reconcile transfer history
   */
  async reconcileTransfers(
    config: ReconciliationConfig,
    fromBlock: number,
    toBlock: number
  ): Promise<ReconciliationReport> {
    const report: ReconciliationReport = {
      id: uuidv4(),
      assetId: config.assetId,
      type: ReconciliationType.TRANSFER,
      status: ReconciliationStatus.IN_PROGRESS,
      startedAt: new Date().toISOString(),
      blockNumber: toBlock,
      chainId: config.chainId,
      holdersChecked: 0,
      transfersChecked: 0,
      discrepanciesFound: 0,
      serverTotalSupply: '0',
      serverHolderCount: 0,
      chainTotalSupply: '0',
      chainHolderCount: 0,
      discrepancies: [],
    };

    const startTime = Date.now();

    try {
      const [serverTransfers, chainTransfers] = await Promise.all([
        this.serverProvider.getTransfers(config.assetId, fromBlock, toBlock),
        this.chainProvider.getTransfers(config.contractAddress, fromBlock, toBlock),
      ]);

      report.transfersChecked = Math.max(serverTransfers.length, chainTransfers.length);

      // Index chain transfers by txHash
      const chainByTxHash = new Map(
        chainTransfers
          .filter(t => t.txHash)
          .map(t => [t.txHash!.toLowerCase(), t])
      );

      // Check all server transfers exist on chain
      for (const serverTx of serverTransfers) {
        if (!serverTx.txHash) {
          report.discrepancies.push(this.createDiscrepancy({
            type: DiscrepancyType.MISSING_ON_CHAIN,
            severity: DiscrepancySeverity.HIGH,
            assetId: config.assetId,
            serverValue: JSON.stringify(serverTx),
            chainValue: 'NOT_FOUND',
            difference: serverTx.amount,
            metadata: { transferId: serverTx.id },
          }));
          continue;
        }

        const chainTx = chainByTxHash.get(serverTx.txHash.toLowerCase());
        if (!chainTx) {
          report.discrepancies.push(this.createDiscrepancy({
            type: DiscrepancyType.TRANSFER_MISSING,
            severity: DiscrepancySeverity.CRITICAL,
            assetId: config.assetId,
            serverValue: JSON.stringify(serverTx),
            chainValue: 'NOT_FOUND',
            difference: serverTx.amount,
            metadata: { txHash: serverTx.txHash },
          }));
        }
      }

      report.discrepanciesFound = report.discrepancies.length;
      report.status = ReconciliationStatus.COMPLETED;
      report.completedAt = new Date().toISOString();
      report.duration = Date.now() - startTime;

      this.reports.set(report.id, report);

      for (const discrepancy of report.discrepancies) {
        this.discrepancies.set(discrepancy.id, discrepancy);
        await this.notifyDiscrepancy(discrepancy);
      }

      await this.notifyCompletion(report);

      return report;

    } catch (error) {
      report.status = ReconciliationStatus.FAILED;
      report.error = error instanceof Error ? error.message : String(error);
      report.completedAt = new Date().toISOString();
      report.duration = Date.now() - startTime;

      this.reports.set(report.id, report);
      await this.notifyError(config.assetId, error instanceof Error ? error : new Error(String(error)));

      return report;
    }
  }

  /**
   * Quick balance check for a single holder
   */
  async checkBalance(
    assetId: string,
    holderAddress: string
  ): Promise<{ matches: boolean; serverBalance: string; chainBalance: string; difference: string }> {
    const mapping = this.assetContractMap.get(assetId);
    if (!mapping) {
      throw new Error(`Asset ${assetId} not registered for reconciliation`);
    }

    const [serverBalances, chainBalances] = await Promise.all([
      this.serverProvider.getBalances(assetId),
      this.chainProvider.getBalances(mapping.address),
    ]);

    const serverBal = serverBalances.find(b => b.holderAddress.toLowerCase() === holderAddress.toLowerCase());
    const chainBal = chainBalances.find(b => b.holderAddress.toLowerCase() === holderAddress.toLowerCase());

    const serverValue = serverBal?.balance || '0';
    const chainValue = chainBal?.balance || '0';
    const diff = BigInt(serverValue) > BigInt(chainValue)
      ? (BigInt(serverValue) - BigInt(chainValue)).toString()
      : (BigInt(chainValue) - BigInt(serverValue)).toString();

    return {
      matches: serverValue === chainValue,
      serverBalance: serverValue,
      chainBalance: chainValue,
      difference: diff,
    };
  }

  /**
   * Resolve a discrepancy manually
   */
  resolveDiscrepancy(discrepancyId: string, resolution: string): boolean {
    const discrepancy = this.discrepancies.get(discrepancyId);
    if (!discrepancy) return false;

    discrepancy.resolved = true;
    discrepancy.resolvedAt = new Date().toISOString();
    discrepancy.resolution = resolution;

    return true;
  }

  /**
   * Get all unresolved discrepancies
   */
  getUnresolvedDiscrepancies(assetId?: string): Discrepancy[] {
    return Array.from(this.discrepancies.values())
      .filter(d => !d.resolved && (!assetId || d.assetId === assetId));
  }

  /**
   * Get discrepancies by severity
   */
  getDiscrepanciesBySeverity(severity: DiscrepancySeverity): Discrepancy[] {
    return Array.from(this.discrepancies.values())
      .filter(d => d.severity === severity && !d.resolved);
  }

  /**
   * Get reconciliation report by ID
   */
  getReport(reportId: string): ReconciliationReport | undefined {
    return this.reports.get(reportId);
  }

  /**
   * Get all reports for an asset
   */
  getReportsForAsset(assetId: string): ReconciliationReport[] {
    return Array.from(this.reports.values())
      .filter(r => r.assetId === assetId)
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  }

  /**
   * Generate reconciliation summary
   */
  getSummary(): {
    totalReports: number;
    completedReports: number;
    failedReports: number;
    totalDiscrepancies: number;
    unresolvedDiscrepancies: number;
    criticalDiscrepancies: number;
  } {
    const reports = Array.from(this.reports.values());
    const discrepancies = Array.from(this.discrepancies.values());

    return {
      totalReports: reports.length,
      completedReports: reports.filter(r => r.status === ReconciliationStatus.COMPLETED).length,
      failedReports: reports.filter(r => r.status === ReconciliationStatus.FAILED).length,
      totalDiscrepancies: discrepancies.length,
      unresolvedDiscrepancies: discrepancies.filter(d => !d.resolved).length,
      criticalDiscrepancies: discrepancies.filter(d => d.severity === DiscrepancySeverity.CRITICAL && !d.resolved).length,
    };
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private createDiscrepancy(params: Omit<Discrepancy, 'id' | 'detectedAt' | 'resolved'>): Discrepancy {
    return {
      id: uuidv4(),
      ...params,
      detectedAt: new Date().toISOString(),
      resolved: false,
    };
  }

  private calculateSeverity(serverValue: string, chainValue: string): DiscrepancySeverity {
    const serverBal = BigInt(serverValue);
    const chainBal = BigInt(chainValue);
    const diff = serverBal > chainBal ? serverBal - chainBal : chainBal - serverBal;
    const maxVal = serverBal > chainBal ? serverBal : chainBal;

    if (maxVal === 0n) return DiscrepancySeverity.LOW;

    const percentage = Number((diff * 10000n) / maxVal) / 100;

    if (percentage > 10) return DiscrepancySeverity.CRITICAL;
    if (percentage > 5) return DiscrepancySeverity.HIGH;
    if (percentage > 1) return DiscrepancySeverity.MEDIUM;
    return DiscrepancySeverity.LOW;
  }

  private async autoResolveMinor(report: ReconciliationReport, tolerance: string): Promise<void> {
    const toleranceBigInt = BigInt(tolerance);

    for (const discrepancy of report.discrepancies) {
      if (
        discrepancy.severity === DiscrepancySeverity.LOW &&
        BigInt(discrepancy.difference) <= toleranceBigInt
      ) {
        discrepancy.resolved = true;
        discrepancy.resolvedAt = new Date().toISOString();
        discrepancy.resolution = 'AUTO_RESOLVED_WITHIN_TOLERANCE';
      }
    }
  }

  private async notifyDiscrepancy(discrepancy: Discrepancy): Promise<void> {
    for (const handler of this.alertHandlers) {
      try {
        await handler.onDiscrepancy(discrepancy);
      } catch (error) {
        console.error('Alert handler error:', error);
      }
    }
  }

  private async notifyCompletion(report: ReconciliationReport): Promise<void> {
    for (const handler of this.alertHandlers) {
      try {
        await handler.onComplete(report);
      } catch (error) {
        console.error('Alert handler error:', error);
      }
    }
  }

  private async notifyError(assetId: string, error: Error): Promise<void> {
    for (const handler of this.alertHandlers) {
      try {
        await handler.onError(assetId, error);
      } catch (err) {
        console.error('Alert handler error:', err);
      }
    }
  }
}

// ============================================================================
// SCHEDULED RECONCILIATION JOB
// ============================================================================

export interface ScheduledReconciliationConfig {
  /** Assets to reconcile */
  assets: Array<{
    assetId: string;
    contractAddress: string;
    chainId: number;
  }>;
  /** Interval in milliseconds */
  intervalMs: number;
  /** Balance tolerance */
  balanceTolerance?: string;
}

export class ScheduledReconciliation {
  private service: ReconciliationService;
  private config: ScheduledReconciliationConfig;
  private intervalId?: NodeJS.Timeout;
  private running = false;

  constructor(service: ReconciliationService, config: ScheduledReconciliationConfig) {
    this.service = service;
    this.config = config;

    // Register assets
    for (const asset of config.assets) {
      this.service.registerAsset(asset.assetId, asset.contractAddress, asset.chainId);
    }
  }

  /**
   * Start scheduled reconciliation
   */
  start(): void {
    if (this.running) return;

    this.running = true;
    this.intervalId = setInterval(() => this.runAll(), this.config.intervalMs);

    // Run immediately
    this.runAll();
  }

  /**
   * Stop scheduled reconciliation
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    this.running = false;
  }

  /**
   * Run reconciliation for all registered assets
   */
  async runAll(): Promise<ReconciliationReport[]> {
    const reports: ReconciliationReport[] = [];

    for (const asset of this.config.assets) {
      try {
        const report = await this.service.reconcile({
          assetId: asset.assetId,
          contractAddress: asset.contractAddress,
          chainId: asset.chainId,
          balanceTolerance: this.config.balanceTolerance,
          autoResolveMinor: true,
        });
        reports.push(report);
      } catch (error) {
        console.error(`Reconciliation failed for ${asset.assetId}:`, error);
      }
    }

    return reports;
  }
}

// ============================================================================
// MOCK PROVIDERS (for testing)
// ============================================================================

export class MockServerDataProvider implements IServerDataProvider {
  private balances: Map<string, BalanceRecord[]> = new Map();
  private supplies: Map<string, string> = new Map();
  private transfers: Map<string, TransferRecord[]> = new Map();

  setBalances(assetId: string, balances: BalanceRecord[]): void {
    this.balances.set(assetId, balances);
  }

  setTotalSupply(assetId: string, supply: string): void {
    this.supplies.set(assetId, supply);
  }

  setTransfers(assetId: string, transfers: TransferRecord[]): void {
    this.transfers.set(assetId, transfers);
  }

  async getBalances(assetId: string): Promise<BalanceRecord[]> {
    return this.balances.get(assetId) || [];
  }

  async getTotalSupply(assetId: string): Promise<string> {
    return this.supplies.get(assetId) || '0';
  }

  async getTransfers(assetId: string): Promise<TransferRecord[]> {
    return this.transfers.get(assetId) || [];
  }

  async getHolderCount(assetId: string): Promise<number> {
    return (this.balances.get(assetId) || []).filter(b => BigInt(b.balance) > 0n).length;
  }
}

export class MockChainDataProvider implements IChainDataProvider {
  private balances: Map<string, BalanceRecord[]> = new Map();
  private supplies: Map<string, string> = new Map();
  private transfers: Map<string, TransferRecord[]> = new Map();
  private currentBlock = 1000000;

  setBalances(contractAddress: string, balances: BalanceRecord[]): void {
    this.balances.set(contractAddress.toLowerCase(), balances);
  }

  setTotalSupply(contractAddress: string, supply: string): void {
    this.supplies.set(contractAddress.toLowerCase(), supply);
  }

  setTransfers(contractAddress: string, transfers: TransferRecord[]): void {
    this.transfers.set(contractAddress.toLowerCase(), transfers);
  }

  setCurrentBlock(block: number): void {
    this.currentBlock = block;
  }

  async getBalances(contractAddress: string): Promise<BalanceRecord[]> {
    return this.balances.get(contractAddress.toLowerCase()) || [];
  }

  async getTotalSupply(contractAddress: string): Promise<string> {
    return this.supplies.get(contractAddress.toLowerCase()) || '0';
  }

  async getTransfers(contractAddress: string): Promise<TransferRecord[]> {
    return this.transfers.get(contractAddress.toLowerCase()) || [];
  }

  async getHolderCount(contractAddress: string): Promise<number> {
    return (this.balances.get(contractAddress.toLowerCase()) || []).filter(b => BigInt(b.balance) > 0n).length;
  }

  async getCurrentBlock(): Promise<number> {
    return this.currentBlock;
  }
}
