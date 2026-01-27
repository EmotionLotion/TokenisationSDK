import { Command, CommandHandler, CommandMeta, commandBus } from '../../cqrs/Command.js';
import { getOrgId } from '../../context/TenantContext.js';

// ============================================================================
// CreateTransferCommand - Initiate a token transfer
// ============================================================================

/**
 * Input for creating a transfer
 */
export interface CreateTransferInput {
  tokenId: string;
  fromWallet: string;
  toWallet: string;
  amount: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Result of transfer creation
 */
export interface CreateTransferResult {
  id: string;
  status: 'pending' | 'compliance_pending' | 'approved' | 'rejected';
  tokenId: string;
  fromWallet: string;
  toWallet: string;
  amount: string;
  decisionId?: string;
  createdAt: Date;
}

/**
 * Command to create a new transfer
 */
export interface CreateTransferCommand extends Command<CreateTransferResult> {
  readonly _type: 'transfer.create';
  input: CreateTransferInput;
}

/**
 * Create a CreateTransferCommand
 */
export function createTransferCommand(input: CreateTransferInput): CreateTransferCommand {
  return {
    _type: 'transfer.create',
    input,
  };
}

/**
 * Handler for CreateTransferCommand
 */
export class CreateTransferHandler implements CommandHandler<CreateTransferCommand, CreateTransferResult> {
  async handle(command: CreateTransferCommand, meta: CommandMeta): Promise<CreateTransferResult> {
    const orgId = meta.orgId || getOrgId();
    const { input } = command;

    // Validate input
    if (!input.tokenId) {
      throw new Error('Token ID is required');
    }
    if (!input.fromWallet) {
      throw new Error('From wallet is required');
    }
    if (!input.toWallet) {
      throw new Error('To wallet is required');
    }
    if (!input.amount || BigInt(input.amount) <= 0n) {
      throw new Error('Amount must be a positive number');
    }

    // In a real implementation, this would:
    // 1. Load token and validate it exists
    // 2. Check sender balance
    // 3. Run compliance checks
    // 4. Create transfer record in database
    // 5. Emit domain events

    // For now, return a mock result
    const transferId = `txf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

    return {
      id: transferId,
      status: 'compliance_pending',
      tokenId: input.tokenId,
      fromWallet: input.fromWallet,
      toWallet: input.toWallet,
      amount: input.amount,
      createdAt: new Date(),
    };
  }
}

// Register handler
commandBus.register('transfer.create', new CreateTransferHandler());
