import { Query, QueryHandler, QueryOptions, queryBus } from '../../cqrs/Query.js';
import { getOrgId } from '../../context/TenantContext.js';

// ============================================================================
// GetTransferQuery - Get a single transfer by ID
// ============================================================================

/**
 * Transfer details
 */
export interface TransferDetails {
  id: string;
  orgId: string;
  tokenId: string;
  tokenName?: string;
  tokenSymbol?: string;

  fromWallet: string;
  toWallet: string;
  fromInvestorId?: string;
  toInvestorId?: string;
  fromInvestorName?: string;
  toInvestorName?: string;

  amount: string;
  amountFormatted?: string;

  status: TransferStatus;
  reason?: string;

  complianceStatus?: 'pending' | 'approved' | 'denied' | 'override';
  decisionId?: string;
  decisionReceiptId?: string;

  txHash?: string;
  txBlock?: number;
  chainId?: number;

  createdAt: Date;
  updatedAt: Date;
  approvedAt?: Date;
  settledAt?: Date;
  cancelledAt?: Date;

  approvedBy?: string;
  cancelledBy?: string;
  cancelReason?: string;

  metadata?: Record<string, unknown>;
}

export type TransferStatus =
  | 'pending'
  | 'compliance_pending'
  | 'approved'
  | 'rejected'
  | 'submitted'
  | 'pending_confirmation'
  | 'settled'
  | 'failed'
  | 'cancelled';

/**
 * Query to get a transfer by ID
 */
export interface GetTransferQuery extends Query<TransferDetails | null> {
  readonly _type: 'transfer.get';
  transferId: string;
  includeInvestorDetails?: boolean;
  includeTokenDetails?: boolean;
}

/**
 * Create a GetTransferQuery
 */
export function getTransferQuery(
  transferId: string,
  options?: {
    includeInvestorDetails?: boolean;
    includeTokenDetails?: boolean;
  }
): GetTransferQuery {
  return {
    _type: 'transfer.get',
    transferId,
    includeInvestorDetails: options?.includeInvestorDetails ?? true,
    includeTokenDetails: options?.includeTokenDetails ?? true,
  };
}

/**
 * Handler for GetTransferQuery
 */
export class GetTransferHandler implements QueryHandler<GetTransferQuery, TransferDetails | null> {
  async handle(query: GetTransferQuery, options: QueryOptions): Promise<TransferDetails | null> {
    const orgId = options.orgId || getOrgId();

    // In a real implementation, this would:
    // 1. Query database for transfer by ID and orgId
    // 2. Optionally join with investors table
    // 3. Optionally join with tokens table
    // 4. Return null if not found

    // Mock implementation - return null for now
    // In production, this would query the database
    return null;
  }
}

// Register handler
queryBus.register('transfer.get', new GetTransferHandler());
