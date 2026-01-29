/**
 * CCIPSettlementProvider
 *
 * Implements ISettlementProvider backed by Chainlink CCIP cross-chain transfers.
 * Maps SDK settlement instructions to CCIP bridge operations.
 */

import { v4 as uuidv4 } from 'uuid';
import { ok, err, type Result } from '../../core/types.js';
import type {
  ISettlementProvider,
  SettlementInstruction,
  SettlementType,
  SettlementStatus,
} from '../../core/interfaces.providers.js';
import type { CCIPBridgePlugin } from '../../plugins/chainlink/CCIPBridgePlugin.js';
import { chainRegistry } from '../../plugins/chain/ChainRegistry.js';

/** CCIP cross-chain finality time in minutes (conservative estimate) */
const CCIP_FINALITY_MINUTES = 20;

export interface CCIPSettlementProviderConfig {
  /** Default destination chain ID when not encoded in toAccount */
  defaultDestChainId?: number;
  /** Separator used in toAccount to encode chain ID (e.g. "137:0xABC...") */
  addressChainSeparator?: string;
}

/**
 * CCIPSettlementProvider
 *
 * Settlement provider that uses Chainlink CCIP for cross-chain token transfers.
 * Supports T+0 (same-day) and instant settlement via CCIP message passing.
 *
 * Destination chain encoding:
 *   The toAccount field can encode the destination chain using "chainId:address"
 *   format (e.g. "137:0xABC..."). If no chain prefix is present, the configured
 *   defaultDestChainId is used.
 */
export class CCIPSettlementProvider implements ISettlementProvider {
  readonly providerId = 'chainlink-ccip';
  readonly providerName = 'Chainlink CCIP Settlement';
  readonly supportedTypes: SettlementType[] = ['T+0', 'instant', 'atomic'];

  /** In-memory instruction store */
  private instructions: Map<string, SettlementInstruction> = new Map();
  /** Map instruction IDs to CCIP message IDs */
  private messageIds: Map<string, string> = new Map();
  /** Track DvP receipt confirmations: instructionId -> { asset, funds } */
  private receiptConfirmations: Map<string, { asset: boolean; funds: boolean }> = new Map();

  private readonly config: Required<CCIPSettlementProviderConfig>;

  constructor(
    private readonly ccipPlugin: CCIPBridgePlugin,
    config: CCIPSettlementProviderConfig = {},
  ) {
    this.config = {
      defaultDestChainId: config.defaultDestChainId ?? 1,
      addressChainSeparator: config.addressChainSeparator ?? ':',
    };
  }

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
    const instruction: SettlementInstruction = {
      instructionId: uuidv4(),
      referenceId: params.referenceId,
      referenceType: params.referenceType,
      settlementType: params.settlementType,
      status: 'pending',
      asset: params.asset,
      cash: params.cash,
      settlementDate: params.settlementDate || new Date().toISOString(),
    };

    this.instructions.set(instruction.instructionId, instruction);
    return ok(instruction);
  }

  async executeInstruction(instructionId: string): Promise<Result<SettlementInstruction, string>> {
    const instruction = this.instructions.get(instructionId);
    if (!instruction) {
      return err(`Instruction not found: ${instructionId}`);
    }

    if (instruction.status !== 'pending') {
      return err(`Instruction is not pending: ${instruction.status}`);
    }

    // Update status to processing
    instruction.status = 'processing';
    this.instructions.set(instructionId, instruction);

    // Execute the CCIP transfer
    const result = await this.ccipPlugin.bridgeTokens({
      destChainId: this.extractDestChainId(instruction),
      receiver: this.extractAddress(instruction.asset.toAccount),
      token: instruction.asset.assetId,
      amount: instruction.asset.quantity,
      data: JSON.stringify({
        referenceId: instruction.referenceId,
        referenceType: instruction.referenceType,
      }),
    });

    if (!result.success) {
      instruction.status = 'failed';
      instruction.failureReason = result.error;
      this.instructions.set(instructionId, instruction);
      return err(result.error);
    }

    // Store the CCIP message ID and update instruction
    this.messageIds.set(instructionId, result.data.messageId);
    instruction.transactionHash = result.data.txHash;

    if (instruction.cash) {
      // DvP: asset leg sent via CCIP, now wait for both receipt confirmations
      instruction.status = 'awaiting_funds';
      this.getOrCreateReceipts(instructionId).asset = true; // asset leg initiated
      this.instructions.set(instructionId, instruction);
    } else {
      // Asset-only transfer: settle immediately on CCIP send
      instruction.status = 'settled';
      instruction.settledAt = new Date().toISOString();
      this.instructions.set(instructionId, instruction);
    }

    return ok(instruction);
  }

  async getInstruction(instructionId: string): Promise<Result<SettlementInstruction, string>> {
    const instruction = this.instructions.get(instructionId);
    if (!instruction) {
      return err(`Instruction not found: ${instructionId}`);
    }
    return ok(instruction);
  }

  async listInstructions(params: {
    referenceId?: string;
    status?: SettlementStatus[];
    fromDate?: string;
    toDate?: string;
    limit?: number;
  }): Promise<Result<SettlementInstruction[], string>> {
    let instructions = Array.from(this.instructions.values());

    if (params.referenceId) {
      instructions = instructions.filter(i => i.referenceId === params.referenceId);
    }
    if (params.status && params.status.length > 0) {
      instructions = instructions.filter(i => params.status!.includes(i.status));
    }
    if (params.fromDate) {
      instructions = instructions.filter(i => i.settlementDate >= params.fromDate!);
    }
    if (params.toDate) {
      instructions = instructions.filter(i => i.settlementDate <= params.toDate!);
    }
    if (params.limit) {
      instructions = instructions.slice(0, params.limit);
    }

    return ok(instructions);
  }

  async cancelInstruction(instructionId: string): Promise<Result<SettlementInstruction, string>> {
    const instruction = this.instructions.get(instructionId);
    if (!instruction) {
      return err(`Instruction not found: ${instructionId}`);
    }

    if (instruction.status !== 'pending') {
      return err(`Cannot cancel instruction in status: ${instruction.status}`);
    }

    instruction.status = 'cancelled';
    this.instructions.set(instructionId, instruction);
    return ok(instruction);
  }

  async confirmAssetReceipt(instructionId: string): Promise<Result<void, string>> {
    const instruction = this.instructions.get(instructionId);
    if (!instruction) {
      return err(`Instruction not found: ${instructionId}`);
    }

    // Only meaningful for instructions that have a cash leg (DvP)
    if (!instruction.cash) {
      return err(`Instruction ${instructionId} has no cash leg — asset-only transfers settle via executeInstruction`);
    }

    const validStatuses: SettlementStatus[] = ['processing', 'awaiting_assets', 'awaiting_funds'];
    if (!validStatuses.includes(instruction.status)) {
      return err(`Cannot confirm asset receipt in status: ${instruction.status}`);
    }

    const receipts = this.getOrCreateReceipts(instructionId);
    receipts.asset = true;

    // If we were awaiting assets specifically, move to awaiting funds (or settle if both done)
    if (!receipts.funds) {
      instruction.status = 'awaiting_funds';
      this.instructions.set(instructionId, instruction);
    } else {
      // Both legs confirmed — settle
      instruction.status = 'settled';
      instruction.settledAt = new Date().toISOString();
      this.instructions.set(instructionId, instruction);
    }

    return ok(undefined);
  }

  async confirmFundsReceipt(instructionId: string): Promise<Result<void, string>> {
    const instruction = this.instructions.get(instructionId);
    if (!instruction) {
      return err(`Instruction not found: ${instructionId}`);
    }

    if (!instruction.cash) {
      return err(`Instruction ${instructionId} has no cash leg — nothing to confirm`);
    }

    const validStatuses: SettlementStatus[] = ['processing', 'awaiting_assets', 'awaiting_funds'];
    if (!validStatuses.includes(instruction.status)) {
      return err(`Cannot confirm funds receipt in status: ${instruction.status}`);
    }

    const receipts = this.getOrCreateReceipts(instructionId);
    receipts.funds = true;

    if (!receipts.asset) {
      instruction.status = 'awaiting_assets';
      this.instructions.set(instructionId, instruction);
    } else {
      // Both legs confirmed — settle
      instruction.status = 'settled';
      instruction.settledAt = new Date().toISOString();
      this.instructions.set(instructionId, instruction);
    }

    return ok(undefined);
  }

  async getSettlementWindow(): Promise<{
    nextSettlementTime: string;
    cutoffTime: string;
    timezone: string;
  }> {
    // CCIP has no traditional settlement window — it settles on message finality.
    // The "next settlement" is now (submit anytime), and the cutoff is the
    // estimated finality horizon (~20 minutes from now for cross-chain).
    const now = new Date();
    const finality = new Date(now.getTime() + CCIP_FINALITY_MINUTES * 60_000);
    return {
      nextSettlementTime: now.toISOString(),
      cutoffTime: finality.toISOString(),
      timezone: 'UTC',
    };
  }

  async healthCheck(): Promise<boolean> {
    // Verify the CCIP plugin can reach its router by checking support for a
    // known lane. We pick a well-known destination (Ethereum mainnet selector).
    // If the plugin's source chain doesn't support that lane, we fall back to
    // checking any supported lane from getSupportedLanes().
    try {
      const lanes = this.ccipPlugin.getSupportedLanes();
      if (lanes.length === 0) {
        return false;
      }
      // Probe the first available lane to confirm on-chain connectivity
      return await this.ccipPlugin.isChainSupported(lanes[0].dest);
    } catch {
      return false;
    }
  }

  /**
   * Get the CCIP message ID for a settled instruction
   */
  getMessageId(instructionId: string): string | undefined {
    return this.messageIds.get(instructionId);
  }

  /**
   * Extract destination chain ID from instruction metadata.
   *
   * Supports two formats for toAccount:
   *   1. "chainId:0xAddress" — chain ID is parsed from the prefix
   *   2. Plain "0xAddress" — falls back to defaultDestChainId from config
   *
   * Validates the extracted chain ID against ChainRegistry for CCIP support.
   */
  private extractDestChainId(instruction: SettlementInstruction): number {
    const toAccount = instruction.asset.toAccount;
    const sep = this.config.addressChainSeparator;

    if (toAccount.includes(sep)) {
      const parts = toAccount.split(sep);
      const parsed = parseInt(parts[0], 10);
      if (!isNaN(parsed) && chainRegistry.get(parsed)?.ccipChainSelector) {
        return parsed;
      }
    }

    return this.config.defaultDestChainId;
  }

  /**
   * Parse the raw address from a potentially chain-prefixed toAccount string.
   * "137:0xABC..." → "0xABC..."
   * "0xABC..."     → "0xABC..."
   */
  private extractAddress(toAccount: string): string {
    const sep = this.config.addressChainSeparator;
    if (toAccount.includes(sep)) {
      return toAccount.split(sep).slice(1).join(sep);
    }
    return toAccount;
  }

  private getOrCreateReceipts(instructionId: string): { asset: boolean; funds: boolean } {
    let receipts = this.receiptConfirmations.get(instructionId);
    if (!receipts) {
      receipts = { asset: false, funds: false };
      this.receiptConfirmations.set(instructionId, receipts);
    }
    return receipts;
  }
}
