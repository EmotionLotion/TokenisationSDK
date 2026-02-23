/**
 * MockSettlementProvider - Reference Implementation
 *
 * A mock settlement provider for testing and demonstration.
 * Partners can use this as a template for building their own
 * integrations with DTCC, Paxos Settlement, Fireblocks, etc.
 */

import { v4 as uuidv4 } from 'uuid';
import type { Result } from '../../core/types.js';
import { ok, err } from '../../core/types.js';
import type {
  ISettlementProvider,
  SettlementType,
  SettlementStatus,
  SettlementInstruction,
} from '../../core/interfaces.providers.js';

/**
 * In-memory storage for mock data
 */
interface MockStorage {
  instructions: Map<string, SettlementInstruction>;
}

/**
 * MockSettlementProvider Configuration
 */
export interface MockSettlementProviderConfig {
  /** Simulated settlement delay in ms (default: 1000) */
  settlementDelay?: number;
  /** Auto-settle instructions (default: true) */
  autoSettle?: boolean;
  /** Settlement window start hour (0-23, default: 9) */
  settlementWindowStartHour?: number;
  /** Settlement window end hour (0-23, default: 17) */
  settlementWindowEndHour?: number;
  /** Settlement timezone (default: 'America/New_York') */
  settlementTimezone?: string;
  /** Simulate failures for testing (default: false) */
  simulateFailures?: boolean;
  /** Failure rate when simulateFailures is true (0-1, default: 0.1) */
  failureRate?: number;
}

/**
 * MockSettlementProvider - For testing and development
 *
 * @example
 * ```typescript
 * import { MockSettlementProvider } from '@tokenisation/sdk';
 *
 * const settlement = new MockSettlementProvider({
 *   autoSettle: true,
 *   settlementDelay: 2000,
 * });
 *
 * // Register with provider registry
 * providerRegistry.registerSettlement(settlement, { isDefault: true });
 *
 * // Create settlement instruction
 * const result = await settlement.createInstruction({
 *   referenceId: 'trade-123',
 *   referenceType: 'trade',
 *   settlementType: 'T+0',
 *   asset: {
 *     assetId: 'asset-456',
 *     quantity: '100',
 *     fromAccount: 'seller-acc',
 *     toAccount: 'buyer-acc',
 *   },
 *   cash: {
 *     currency: 'USDC',
 *     amount: '1000',
 *     fromAccount: 'buyer-acc',
 *     toAccount: 'seller-acc',
 *   },
 * });
 * ```
 */
export class MockSettlementProvider implements ISettlementProvider {
  readonly providerId = 'mock-settlement';
  readonly providerName = 'Mock Settlement Provider';
  readonly supportedTypes: SettlementType[] = ['instant', 'T+0', 'T+1', 'T+2', 'atomic', 'escrow'];

  private storage: MockStorage = {
    instructions: new Map(),
  };

  private config: Required<MockSettlementProviderConfig>;

  constructor(config: MockSettlementProviderConfig = {}) {
    this.config = {
      settlementDelay: config.settlementDelay ?? 1000,
      autoSettle: config.autoSettle ?? true,
      settlementWindowStartHour: config.settlementWindowStartHour ?? 9,
      settlementWindowEndHour: config.settlementWindowEndHour ?? 17,
      settlementTimezone: config.settlementTimezone ?? 'America/New_York',
      simulateFailures: config.simulateFailures ?? false,
      failureRate: config.failureRate ?? 0.1,
    };
  }

  /**
   * Create settlement instruction
   */
  async createInstruction(params: {
    referenceId: string;
    referenceType: 'trade' | 'transfer' | 'redemption' | 'issuance';
    settlementType: SettlementType;
    asset: {
      assetId: string;
      quantity: string;
      fromAccount: string;
      toAccount: string;
    };
    cash?: {
      currency: string;
      amount: string;
      fromAccount: string;
      toAccount: string;
    };
    settlementDate?: string;
  }): Promise<Result<SettlementInstruction, string>> {
    if (this.shouldFail()) {
      return err('Simulated failure: Unable to create settlement instruction');
    }

    // Validate settlement type
    if (!this.supportedTypes.includes(params.settlementType)) {
      return err(`Unsupported settlement type: ${params.settlementType}`);
    }

    const instructionId = `stl_${uuidv4().slice(0, 12)}`;

    // Calculate settlement date
    const settlementDate = params.settlementDate || this.calculateSettlementDate(params.settlementType);

    const instruction: SettlementInstruction = {
      instructionId,
      referenceId: params.referenceId,
      referenceType: params.referenceType,
      settlementType: params.settlementType,
      status: 'pending',
      asset: params.asset,
      cash: params.cash,
      settlementDate,
    };

    this.storage.instructions.set(instructionId, instruction);

    // Auto-settle if configured
    if (this.config.autoSettle) {
      this.processInstruction(instructionId);
    }

    return ok(instruction);
  }

  /**
   * Get instruction status
   */
  async getInstruction(instructionId: string): Promise<Result<SettlementInstruction, string>> {
    const instruction = this.storage.instructions.get(instructionId);

    if (!instruction) {
      return err(`Settlement instruction not found: ${instructionId}`);
    }

    return ok(instruction);
  }

  /**
   * List instructions
   */
  async listInstructions(params: {
    referenceId?: string;
    status?: SettlementStatus[];
    fromDate?: string;
    toDate?: string;
    limit?: number;
  }): Promise<Result<SettlementInstruction[], string>> {
    let instructions = Array.from(this.storage.instructions.values());

    if (params.referenceId) {
      instructions = instructions.filter((i) => i.referenceId === params.referenceId);
    }

    if (params.status && params.status.length > 0) {
      instructions = instructions.filter((i) => params.status!.includes(i.status));
    }

    if (params.fromDate) {
      const fromDate = new Date(params.fromDate);
      instructions = instructions.filter((i) => new Date(i.settlementDate) >= fromDate);
    }

    if (params.toDate) {
      const toDate = new Date(params.toDate);
      instructions = instructions.filter((i) => new Date(i.settlementDate) <= toDate);
    }

    // Sort by settlement date
    instructions.sort((a, b) =>
      new Date(a.settlementDate).getTime() - new Date(b.settlementDate).getTime()
    );

    // Apply limit
    const limit = params.limit ?? 100;
    instructions = instructions.slice(0, limit);

    return ok(instructions);
  }

  /**
   * Cancel instruction (if not yet processing)
   */
  async cancelInstruction(instructionId: string): Promise<Result<SettlementInstruction, string>> {
    const instruction = this.storage.instructions.get(instructionId);

    if (!instruction) {
      return err(`Settlement instruction not found: ${instructionId}`);
    }

    if (instruction.status !== 'pending') {
      return err(`Cannot cancel instruction in status: ${instruction.status}`);
    }

    instruction.status = 'cancelled';

    return ok(instruction);
  }

  /**
   * Confirm receipt of assets (for escrow-based)
   */
  async confirmAssetReceipt(instructionId: string): Promise<Result<void, string>> {
    const instruction = this.storage.instructions.get(instructionId);

    if (!instruction) {
      return err(`Settlement instruction not found: ${instructionId}`);
    }

    if (instruction.settlementType !== 'escrow') {
      return err('Asset receipt confirmation only applies to escrow settlements');
    }

    if (instruction.status === 'awaiting_funds') {
      // Both legs confirmed, settle
      instruction.status = 'processing';
      this.finalizeSettlement(instructionId);
    } else if (instruction.status === 'pending' || instruction.status === 'processing') {
      instruction.status = 'awaiting_funds';
    }

    return ok(undefined);
  }

  /**
   * Confirm receipt of funds (for escrow-based)
   */
  async confirmFundsReceipt(instructionId: string): Promise<Result<void, string>> {
    const instruction = this.storage.instructions.get(instructionId);

    if (!instruction) {
      return err(`Settlement instruction not found: ${instructionId}`);
    }

    if (instruction.settlementType !== 'escrow') {
      return err('Funds receipt confirmation only applies to escrow settlements');
    }

    if (instruction.status === 'awaiting_assets') {
      // Both legs confirmed, settle
      instruction.status = 'processing';
      this.finalizeSettlement(instructionId);
    } else if (instruction.status === 'pending' || instruction.status === 'processing') {
      instruction.status = 'awaiting_assets';
    }

    return ok(undefined);
  }

  /**
   * Get settlement window (when settlement runs)
   */
  async getSettlementWindow(): Promise<{
    nextSettlementTime: string;
    cutoffTime: string;
    timezone: string;
  }> {
    const now = new Date();
    const nextSettlement = new Date(now);

    // Set to next settlement window
    if (now.getHours() >= this.config.settlementWindowEndHour) {
      // After today's window, move to next day
      nextSettlement.setDate(nextSettlement.getDate() + 1);
    }

    nextSettlement.setHours(this.config.settlementWindowStartHour, 0, 0, 0);

    // Cutoff is 1 hour before settlement
    const cutoff = new Date(nextSettlement);
    cutoff.setHours(cutoff.getHours() - 1);

    return {
      nextSettlementTime: nextSettlement.toISOString(),
      cutoffTime: cutoff.toISOString(),
      timezone: this.config.settlementTimezone,
    };
  }

  /**
   * Check if provider is available
   */
  async healthCheck(): Promise<boolean> {
    return !this.shouldFail();
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  /**
   * Process an instruction (simulate settlement)
   */
  private async processInstruction(instructionId: string): Promise<void> {
    const instruction = this.storage.instructions.get(instructionId);
    if (!instruction || instruction.status === 'cancelled') return;

    // Move to processing
    instruction.status = 'processing';

    // For escrow, wait for confirmations
    if (instruction.settlementType === 'escrow') {
      instruction.status = 'awaiting_assets';
      return;
    }

    // Simulate settlement
    await this.delay(this.config.settlementDelay);

    await this.finalizeSettlement(instructionId);
  }

  /**
   * Finalize settlement
   */
  private async finalizeSettlement(instructionId: string): Promise<void> {
    const instruction = this.storage.instructions.get(instructionId);
    if (!instruction) return;

    if (this.shouldFail()) {
      instruction.status = 'failed';
      instruction.failureReason = 'Simulated settlement failure';
      return;
    }

    instruction.status = 'settled';
    instruction.settledAt = new Date().toISOString();

    // Generate mock transaction hash
    instruction.transactionHash = `0x${uuidv4().replace(/-/g, '')}`;
  }

  /**
   * Calculate settlement date based on type
   */
  private calculateSettlementDate(type: SettlementType): string {
    const now = new Date();

    switch (type) {
      case 'instant':
      case 'atomic':
        return now.toISOString();

      case 'T+0':
        // Same day settlement at end of settlement window
        now.setHours(this.config.settlementWindowEndHour, 0, 0, 0);
        return now.toISOString();

      case 'T+1':
        now.setDate(now.getDate() + 1);
        now.setHours(this.config.settlementWindowEndHour, 0, 0, 0);
        return now.toISOString();

      case 'T+2':
        now.setDate(now.getDate() + 2);
        now.setHours(this.config.settlementWindowEndHour, 0, 0, 0);
        return now.toISOString();

      case 'escrow':
        // Escrow settles when both parties confirm
        now.setDate(now.getDate() + 7); // Default 7-day escrow
        return now.toISOString();

      default:
        return now.toISOString();
    }
  }

  /**
   * Check if we should simulate a failure
   */
  private shouldFail(): boolean {
    return this.config.simulateFailures && Math.random() < this.config.failureRate;
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ============================================================================
  // TEST HELPERS
  // ============================================================================

  /**
   * Reset all storage (for testing)
   */
  reset(): void {
    this.storage.instructions.clear();
  }

  /**
   * Manually settle an instruction (for testing)
   */
  async settleInstruction(instructionId: string): Promise<void> {
    const instruction = this.storage.instructions.get(instructionId);
    if (instruction) {
      instruction.status = 'settled';
      instruction.settledAt = new Date().toISOString();
      instruction.transactionHash = `0x${uuidv4().replace(/-/g, '')}`;
    }
  }

  /**
   * Manually fail an instruction (for testing)
   */
  failInstruction(instructionId: string, reason: string): void {
    const instruction = this.storage.instructions.get(instructionId);
    if (instruction) {
      instruction.status = 'failed';
      instruction.failureReason = reason;
    }
  }
}
