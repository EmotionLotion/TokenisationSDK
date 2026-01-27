import { Command, CommandHandler, CommandMeta, commandBus } from '../../cqrs/Command.js';
import { getOrgId } from '../../context/TenantContext.js';

// ============================================================================
// CancelTransferCommand - Cancel a pending transfer
// ============================================================================

/**
 * Input for cancelling a transfer
 */
export interface CancelTransferInput {
  transferId: string;
  reason: string;
}

/**
 * Result of transfer cancellation
 */
export interface CancelTransferResult {
  id: string;
  status: 'cancelled';
  cancelledBy: string;
  cancelledAt: Date;
  reason: string;
}

/**
 * Command to cancel a transfer
 */
export interface CancelTransferCommand extends Command<CancelTransferResult> {
  readonly _type: 'transfer.cancel';
  input: CancelTransferInput;
}

/**
 * Create a CancelTransferCommand
 */
export function cancelTransferCommand(input: CancelTransferInput): CancelTransferCommand {
  return {
    _type: 'transfer.cancel',
    input,
  };
}

/**
 * Handler for CancelTransferCommand
 */
export class CancelTransferHandler implements CommandHandler<CancelTransferCommand, CancelTransferResult> {
  async handle(command: CancelTransferCommand, meta: CommandMeta): Promise<CancelTransferResult> {
    const orgId = meta.orgId || getOrgId();
    const { input } = command;

    // Validate input
    if (!input.transferId) {
      throw new Error('Transfer ID is required');
    }
    if (!input.reason) {
      throw new Error('Cancellation reason is required');
    }

    // In a real implementation, this would:
    // 1. Load transfer and validate state (must be cancellable)
    // 2. Verify actor has permission to cancel
    // 3. Update transfer status
    // 4. Emit domain events

    return {
      id: input.transferId,
      status: 'cancelled',
      cancelledBy: meta.actorId || 'unknown',
      cancelledAt: new Date(),
      reason: input.reason,
    };
  }
}

// Register handler
commandBus.register('transfer.cancel', new CancelTransferHandler());
