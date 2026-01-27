import { Command, CommandHandler, CommandMeta, commandBus } from '../../cqrs/Command.js';
import { getOrgId } from '../../context/TenantContext.js';

// ============================================================================
// ApproveTransferCommand - Approve a pending transfer
// ============================================================================

/**
 * Input for approving a transfer
 */
export interface ApproveTransferInput {
  transferId: string;
  approverNotes?: string;
  overrideCompliance?: boolean;
  overrideReason?: string;
}

/**
 * Result of transfer approval
 */
export interface ApproveTransferResult {
  id: string;
  status: 'approved' | 'submitted' | 'pending_settlement';
  approvedBy: string;
  approvedAt: Date;
  txHash?: string;
}

/**
 * Command to approve a transfer
 */
export interface ApproveTransferCommand extends Command<ApproveTransferResult> {
  readonly _type: 'transfer.approve';
  input: ApproveTransferInput;
}

/**
 * Create an ApproveTransferCommand
 */
export function approveTransferCommand(input: ApproveTransferInput): ApproveTransferCommand {
  return {
    _type: 'transfer.approve',
    input,
  };
}

/**
 * Handler for ApproveTransferCommand
 */
export class ApproveTransferHandler implements CommandHandler<ApproveTransferCommand, ApproveTransferResult> {
  async handle(command: ApproveTransferCommand, meta: CommandMeta): Promise<ApproveTransferResult> {
    const orgId = meta.orgId || getOrgId();
    const { input } = command;

    // Validate input
    if (!input.transferId) {
      throw new Error('Transfer ID is required');
    }

    // Check if override is requested
    if (input.overrideCompliance && !input.overrideReason) {
      throw new Error('Override reason is required when overriding compliance');
    }

    // In a real implementation, this would:
    // 1. Load transfer and validate state
    // 2. Verify approver has permission
    // 3. Check compliance decision (or record override)
    // 4. Update transfer status
    // 5. Submit to chain if auto-execute enabled
    // 6. Emit domain events

    return {
      id: input.transferId,
      status: 'approved',
      approvedBy: meta.actorId || 'unknown',
      approvedAt: new Date(),
    };
  }
}

// Register handler
commandBus.register('transfer.approve', new ApproveTransferHandler());
