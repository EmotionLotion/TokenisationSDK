/**
 * Idempotent Operations Module
 *
 * Wraps critical token operations with idempotency guarantees:
 * - Mint operations
 * - Burn operations
 * - Transfer operations
 * - Distribution/Dividend operations
 * - Redemption operations
 *
 * Uses the core IdempotencyManager but adds operation-specific
 * key generation and validation.
 */

import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';
import {
  IdempotencyManager,
  IIdempotencyStorage,
  MemoryIdempotencyStorage,
  IdempotencyKeys,
} from '../core/Idempotency.js';
import { ok, err, type Result } from '../core/types.js';

// ============================================================================
// TYPES
// ============================================================================

export enum OperationType {
  MINT = 'MINT',
  BURN = 'BURN',
  TRANSFER = 'TRANSFER',
  DISTRIBUTION = 'DISTRIBUTION',
  DIVIDEND = 'DIVIDEND',
  REDEMPTION = 'REDEMPTION',
  CLAIM = 'CLAIM',
}

export interface OperationRecord {
  id: string;
  idempotencyKey: string;
  operationType: OperationType;
  assetId: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  requestHash: string;
  params: Record<string, unknown>;
  result?: unknown;
  error?: string;
  createdAt: string;
  completedAt?: string;
  attempts: number;
  lastAttemptAt?: string;
}

export interface IdempotentMintParams {
  assetId: string;
  to: string;
  amount: string;
  nonce?: number;
  metadata?: Record<string, unknown>;
}

export interface IdempotentBurnParams {
  assetId: string;
  from: string;
  amount: string;
  nonce?: number;
  reason?: string;
}

export interface IdempotentTransferParams {
  assetId: string;
  from: string;
  to: string;
  amount: string;
  nonce?: number;
  metadata?: Record<string, unknown>;
}

export interface IdempotentDistributionParams {
  scheduleId: string;
  assetId: string;
  totalAmount: string;
  snapshotBlockNumber?: number;
  executionDate: string;
}

export interface IdempotentRedemptionParams {
  assetId: string;
  holderId: string;
  amount: string;
  redemptionType: string;
  requestId?: string;
}

export interface IdempotentClaimParams {
  distributionId: string;
  recipientId: string;
  amount: string;
}

// ============================================================================
// IDEMPOTENT OPERATIONS MANAGER
// ============================================================================

export class IdempotentOperationsManager {
  private idempotencyManager: IdempotencyManager;
  private operations: Map<string, OperationRecord> = new Map();
  private nonceMap: Map<string, number> = new Map();

  constructor(storage?: IIdempotencyStorage) {
    this.idempotencyManager = new IdempotencyManager({
      storage: storage ?? new MemoryIdempotencyStorage(),
      ttlMs: 7 * 24 * 60 * 60 * 1000, // 7 days for financial operations
      lockTimeoutMs: 60000, // 1 minute lock
      maxWaitMs: 120000, // 2 minutes wait
    });
  }

  // ============================================================================
  // MINT OPERATIONS
  // ============================================================================

  /**
   * Execute an idempotent mint operation
   */
  async mint<T>(
    params: IdempotentMintParams,
    executor: (params: IdempotentMintParams) => Promise<T>
  ): Promise<Result<T, string>> {
    const nonce = params.nonce ?? this.getNextNonce(`mint:${params.assetId}:${params.to}`);
    const idempotencyKey = IdempotencyKeys.mint(params.assetId, params.to, params.amount, nonce);
    const requestHash = this.hashParams(params);

    const record = this.createOperationRecord({
      idempotencyKey,
      operationType: OperationType.MINT,
      assetId: params.assetId,
      requestHash,
      params: params as unknown as Record<string, unknown>,
    });

    return this.executeWithIdempotency(record, () => executor(params));
  }

  /**
   * Generate idempotency key for mint (for external use)
   */
  getMintIdempotencyKey(params: IdempotentMintParams): string {
    const nonce = params.nonce ?? this.getNextNonce(`mint:${params.assetId}:${params.to}`);
    return IdempotencyKeys.mint(params.assetId, params.to, params.amount, nonce);
  }

  // ============================================================================
  // BURN OPERATIONS
  // ============================================================================

  /**
   * Execute an idempotent burn operation
   */
  async burn<T>(
    params: IdempotentBurnParams,
    executor: (params: IdempotentBurnParams) => Promise<T>
  ): Promise<Result<T, string>> {
    const nonce = params.nonce ?? this.getNextNonce(`burn:${params.assetId}:${params.from}`);
    const idempotencyKey = IdempotencyKeys.burn(params.assetId, params.from, params.amount, nonce);
    const requestHash = this.hashParams(params);

    const record = this.createOperationRecord({
      idempotencyKey,
      operationType: OperationType.BURN,
      assetId: params.assetId,
      requestHash,
      params: params as unknown as Record<string, unknown>,
    });

    return this.executeWithIdempotency(record, () => executor(params));
  }

  // ============================================================================
  // TRANSFER OPERATIONS
  // ============================================================================

  /**
   * Execute an idempotent transfer operation
   */
  async transfer<T>(
    params: IdempotentTransferParams,
    executor: (params: IdempotentTransferParams) => Promise<T>
  ): Promise<Result<T, string>> {
    const nonce = params.nonce ?? this.getNextNonce(`transfer:${params.assetId}:${params.from}:${params.to}`);
    const idempotencyKey = IdempotencyKeys.transfer(params.assetId, params.from, params.to, params.amount, nonce);
    const requestHash = this.hashParams(params);

    const record = this.createOperationRecord({
      idempotencyKey,
      operationType: OperationType.TRANSFER,
      assetId: params.assetId,
      requestHash,
      params: params as unknown as Record<string, unknown>,
    });

    return this.executeWithIdempotency(record, () => executor(params));
  }

  // ============================================================================
  // DISTRIBUTION OPERATIONS
  // ============================================================================

  /**
   * Execute an idempotent distribution/dividend operation
   */
  async distribute<T>(
    params: IdempotentDistributionParams,
    executor: (params: IdempotentDistributionParams) => Promise<T>
  ): Promise<Result<T, string>> {
    // Key includes schedule + execution date to prevent duplicate distributions for same period
    const idempotencyKey = this.generateDistributionKey(params);
    const requestHash = this.hashParams(params);

    const record = this.createOperationRecord({
      idempotencyKey,
      operationType: OperationType.DISTRIBUTION,
      assetId: params.assetId,
      requestHash,
      params: params as unknown as Record<string, unknown>,
    });

    return this.executeWithIdempotency(record, () => executor(params));
  }

  /**
   * Generate idempotency key for distribution
   */
  generateDistributionKey(params: IdempotentDistributionParams): string {
    // Include block number if available for immutable reference
    const blockRef = params.snapshotBlockNumber ? `:block:${params.snapshotBlockNumber}` : '';
    return `distribution:${params.scheduleId}:${params.executionDate}:${params.totalAmount}${blockRef}`;
  }

  /**
   * Execute an idempotent dividend operation (alias for distribute)
   */
  async dividend<T>(
    params: IdempotentDistributionParams,
    executor: (params: IdempotentDistributionParams) => Promise<T>
  ): Promise<Result<T, string>> {
    const idempotencyKey = `dividend:${params.scheduleId}:${params.executionDate}:${params.totalAmount}`;
    const requestHash = this.hashParams(params);

    const record = this.createOperationRecord({
      idempotencyKey,
      operationType: OperationType.DIVIDEND,
      assetId: params.assetId,
      requestHash,
      params: params as unknown as Record<string, unknown>,
    });

    return this.executeWithIdempotency(record, () => executor(params));
  }

  // ============================================================================
  // REDEMPTION OPERATIONS
  // ============================================================================

  /**
   * Execute an idempotent redemption operation
   */
  async redeem<T>(
    params: IdempotentRedemptionParams,
    executor: (params: IdempotentRedemptionParams) => Promise<T>
  ): Promise<Result<T, string>> {
    // Use requestId if provided, otherwise generate from params
    const requestId = params.requestId ?? uuidv4();
    const idempotencyKey = `redemption:${params.assetId}:${params.holderId}:${requestId}`;
    const requestHash = this.hashParams(params);

    const record = this.createOperationRecord({
      idempotencyKey,
      operationType: OperationType.REDEMPTION,
      assetId: params.assetId,
      requestHash,
      params: params as unknown as Record<string, unknown>,
    });

    return this.executeWithIdempotency(record, () => executor(params));
  }

  // ============================================================================
  // CLAIM OPERATIONS
  // ============================================================================

  /**
   * Execute an idempotent claim operation (for distribution payouts)
   */
  async claim<T>(
    params: IdempotentClaimParams,
    executor: (params: IdempotentClaimParams) => Promise<T>
  ): Promise<Result<T, string>> {
    // Claim key ensures same distribution + recipient can only be claimed once
    const idempotencyKey = `claim:${params.distributionId}:${params.recipientId}`;
    const requestHash = this.hashParams(params);

    const record = this.createOperationRecord({
      idempotencyKey,
      operationType: OperationType.CLAIM,
      assetId: params.distributionId,
      requestHash,
      params: params as unknown as Record<string, unknown>,
    });

    return this.executeWithIdempotency(record, () => executor(params));
  }

  // ============================================================================
  // QUERY METHODS
  // ============================================================================

  /**
   * Check if an operation has already been executed
   */
  async hasExecuted(idempotencyKey: string): Promise<boolean> {
    return this.idempotencyManager.hasExecuted(idempotencyKey);
  }

  /**
   * Get operation record by idempotency key
   */
  getOperation(idempotencyKey: string): OperationRecord | undefined {
    return this.operations.get(idempotencyKey);
  }

  /**
   * Get all operations for an asset
   */
  getOperationsForAsset(assetId: string): OperationRecord[] {
    return Array.from(this.operations.values())
      .filter(op => op.assetId === assetId);
  }

  /**
   * Get operations by type
   */
  getOperationsByType(operationType: OperationType): OperationRecord[] {
    return Array.from(this.operations.values())
      .filter(op => op.operationType === operationType);
  }

  /**
   * Get failed operations for retry
   */
  getFailedOperations(): OperationRecord[] {
    return Array.from(this.operations.values())
      .filter(op => op.status === 'FAILED');
  }

  /**
   * Get pending operations
   */
  getPendingOperations(): OperationRecord[] {
    return Array.from(this.operations.values())
      .filter(op => op.status === 'PENDING');
  }

  /**
   * Invalidate an idempotency key (for retry scenarios)
   */
  async invalidate(idempotencyKey: string): Promise<void> {
    await this.idempotencyManager.invalidate(idempotencyKey);
    this.operations.delete(idempotencyKey);
  }

  /**
   * Clean up expired records
   */
  async cleanup(): Promise<number> {
    return this.idempotencyManager.cleanup();
  }

  // ============================================================================
  // INTERNAL HELPERS
  // ============================================================================

  private async executeWithIdempotency<T>(
    record: OperationRecord,
    executor: () => Promise<T>
  ): Promise<Result<T, string>> {
    // Store the record
    this.operations.set(record.idempotencyKey, record);

    const result = await this.idempotencyManager.execute(
      record.idempotencyKey,
      async () => {
        record.attempts++;
        record.lastAttemptAt = new Date().toISOString();

        try {
          const executionResult = await executor();
          record.status = 'COMPLETED';
          record.result = executionResult;
          record.completedAt = new Date().toISOString();
          return executionResult;
        } catch (error) {
          record.status = 'FAILED';
          record.error = error instanceof Error ? error.message : String(error);
          throw error;
        }
      },
      { requestHash: record.requestHash }
    );

    if (result.success) {
      record.status = 'COMPLETED';
      record.result = result.data;
      record.completedAt = new Date().toISOString();
    } else {
      record.status = 'FAILED';
      record.error = result.error;
    }

    return result;
  }

  private createOperationRecord(params: {
    idempotencyKey: string;
    operationType: OperationType;
    assetId: string;
    requestHash: string;
    params: Record<string, unknown>;
  }): OperationRecord {
    return {
      id: uuidv4(),
      idempotencyKey: params.idempotencyKey,
      operationType: params.operationType,
      assetId: params.assetId,
      status: 'PENDING',
      requestHash: params.requestHash,
      params: params.params,
      createdAt: new Date().toISOString(),
      attempts: 0,
    };
  }

  private hashParams(params: unknown): string {
    return createHash('sha256')
      .update(JSON.stringify(params))
      .digest('hex');
  }

  private getNextNonce(key: string): number {
    const current = this.nonceMap.get(key) ?? 0;
    this.nonceMap.set(key, current + 1);
    return current + 1;
  }
}

// ============================================================================
// IDEMPOTENT CASH FLOW WRAPPER
// ============================================================================

import type { CashFlowEngine, DistributionSchedule, DistributionEvent } from './CashFlow.js';

/**
 * Wrapper for CashFlowEngine with built-in idempotency
 */
export class IdempotentCashFlowEngine {
  private cashFlowEngine: CashFlowEngine;
  private idempotentOps: IdempotentOperationsManager;

  constructor(cashFlowEngine: CashFlowEngine, storage?: IIdempotencyStorage) {
    this.cashFlowEngine = cashFlowEngine;
    this.idempotentOps = new IdempotentOperationsManager(storage);
  }

  /**
   * Execute a distribution with idempotency
   */
  async executeDistribution(
    scheduleId: string,
    options?: {
      amount?: string;
      snapshotAt?: string;
      snapshotBlockNumber?: number;
      chainId?: number;
      onChainSnapshotId?: string;
      metadata?: Record<string, unknown>;
      idempotencyKey?: string;
    }
  ): Promise<Result<DistributionEvent, string>> {
    const schedule = this.cashFlowEngine.getSchedule(scheduleId);
    if (!schedule) {
      return err(`Schedule not found: ${scheduleId}`);
    }

    const params: IdempotentDistributionParams = {
      scheduleId,
      assetId: schedule.assetId,
      totalAmount: options?.amount || schedule.amount || '0',
      snapshotBlockNumber: options?.snapshotBlockNumber,
      executionDate: options?.snapshotAt || new Date().toISOString().split('T')[0],
    };

    return this.idempotentOps.distribute(params, async () => {
      return this.cashFlowEngine.executeDistribution(scheduleId, options);
    });
  }

  /**
   * Claim a payout with idempotency
   */
  async claimPayout(
    distributionId: string,
    recipientId: string
  ): Promise<Result<{ amount: string; claimed: boolean }, string>> {
    const params: IdempotentClaimParams = {
      distributionId,
      recipientId,
      amount: '0', // Will be determined during execution
    };

    return this.idempotentOps.claim(params, async () => {
      return this.cashFlowEngine.claimPayout(distributionId, recipientId);
    });
  }

  /**
   * Check if distribution was already executed
   */
  async wasDistributionExecuted(scheduleId: string, executionDate: string): Promise<boolean> {
    const schedule = this.cashFlowEngine.getSchedule(scheduleId);
    if (!schedule) return false;

    const key = this.idempotentOps.generateDistributionKey({
      scheduleId,
      assetId: schedule.assetId,
      totalAmount: schedule.amount || '0',
      executionDate,
    });

    return this.idempotentOps.hasExecuted(key);
  }

  /**
   * Get underlying CashFlowEngine for non-idempotent operations
   */
  getEngine(): CashFlowEngine {
    return this.cashFlowEngine;
  }

  /**
   * Get idempotency manager for queries
   */
  getIdempotencyManager(): IdempotentOperationsManager {
    return this.idempotentOps;
  }
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/**
 * Create an idempotent operations manager with default settings
 */
export function createIdempotentOperationsManager(
  storage?: IIdempotencyStorage
): IdempotentOperationsManager {
  return new IdempotentOperationsManager(storage);
}

/**
 * Create an idempotent cash flow wrapper
 */
export function createIdempotentCashFlow(
  cashFlowEngine: CashFlowEngine,
  storage?: IIdempotencyStorage
): IdempotentCashFlowEngine {
  return new IdempotentCashFlowEngine(cashFlowEngine, storage);
}
