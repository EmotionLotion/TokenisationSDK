import { Command, CommandHandler, CommandMeta, commandBus } from '../../cqrs/Command.js';
import { getOrgId } from '../../context/TenantContext.js';

// ============================================================================
// SettleTransferCommand - Settle a transfer on-chain
// ============================================================================

/**
 * Input for settling a transfer
 */
export interface SettleTransferInput {
  transferId: string;
  txHash?: string; // If already submitted
  gasPrice?: string;
  maxPriorityFee?: string;
  maxFee?: string;
}

/**
 * Result of transfer settlement
 */
export interface SettleTransferResult {
  id: string;
  status: 'submitted' | 'pending_confirmation' | 'settled' | 'failed';
  txHash: string;
  chainId: number;
  blockNumber?: number;
  confirmations?: number;
  settledAt?: Date;
  error?: string;
}

/**
 * Command to settle a transfer
 */
export interface SettleTransferCommand extends Command<SettleTransferResult> {
  readonly _type: 'transfer.settle';
  input: SettleTransferInput;
}

/**
 * Create a SettleTransferCommand
 */
export function settleTransferCommand(input: SettleTransferInput): SettleTransferCommand {
  return {
    _type: 'transfer.settle',
    input,
  };
}

/**
 * Handler for SettleTransferCommand
 */
export class SettleTransferHandler implements CommandHandler<SettleTransferCommand, SettleTransferResult> {
  async handle(command: SettleTransferCommand, meta: CommandMeta): Promise<SettleTransferResult> {
    const orgId = meta.orgId || getOrgId();
    const { input } = command;

    // Validate input
    if (!input.transferId) {
      throw new Error('Transfer ID is required');
    }

    // In a real implementation, this would:
    // 1. Load transfer and validate state (must be approved)
    // 2. Get token contract address and chain
    // 3. Build transaction
    // 4. Sign and submit via relayer
    // 5. Update transfer with txHash
    // 6. Start finality tracking
    // 7. Emit domain events

    // Mock implementation
    const txHash = input.txHash || `0x${Date.now().toString(16)}${'0'.repeat(48)}`;

    return {
      id: input.transferId,
      status: 'submitted',
      txHash,
      chainId: 137, // Polygon mainnet
    };
  }
}

// Register handler
commandBus.register('transfer.settle', new SettleTransferHandler());
