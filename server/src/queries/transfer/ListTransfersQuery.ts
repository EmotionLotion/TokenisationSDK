import { Query, QueryHandler, QueryOptions, queryBus } from '../../cqrs/Query.js';
import { getOrgId } from '../../context/TenantContext.js';
import { TransferDetails, TransferStatus } from './GetTransferQuery.js';

// ============================================================================
// ListTransfersQuery - List transfers with filtering and pagination
// ============================================================================

/**
 * Filter options for listing transfers
 */
export interface TransferFilter {
  tokenId?: string;
  fromWallet?: string;
  toWallet?: string;
  fromInvestorId?: string;
  toInvestorId?: string;
  status?: TransferStatus | TransferStatus[];
  createdAfter?: Date;
  createdBefore?: Date;
  settledAfter?: Date;
  settledBefore?: Date;
  minAmount?: string;
  maxAmount?: string;
}

/**
 * Pagination options
 */
export interface PaginationOptions {
  limit?: number;
  offset?: number;
  sortBy?: 'createdAt' | 'settledAt' | 'amount';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Paginated result
 */
export interface TransferListResult {
  transfers: TransferDetails[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

/**
 * Query to list transfers
 */
export interface ListTransfersQuery extends Query<TransferListResult> {
  readonly _type: 'transfer.list';
  filter?: TransferFilter;
  pagination?: PaginationOptions;
  includeInvestorDetails?: boolean;
  includeTokenDetails?: boolean;
}

/**
 * Create a ListTransfersQuery
 */
export function listTransfersQuery(
  filter?: TransferFilter,
  pagination?: PaginationOptions,
  options?: {
    includeInvestorDetails?: boolean;
    includeTokenDetails?: boolean;
  }
): ListTransfersQuery {
  return {
    _type: 'transfer.list',
    filter,
    pagination,
    includeInvestorDetails: options?.includeInvestorDetails ?? false,
    includeTokenDetails: options?.includeTokenDetails ?? false,
  };
}

/**
 * Handler for ListTransfersQuery
 */
export class ListTransfersHandler implements QueryHandler<ListTransfersQuery, TransferListResult> {
  async handle(query: ListTransfersQuery, options: QueryOptions): Promise<TransferListResult> {
    const orgId = options.orgId || getOrgId();
    const pagination = query.pagination || {};
    const limit = Math.min(pagination.limit || 50, 100);
    const offset = pagination.offset || 0;

    // In a real implementation, this would:
    // 1. Build SQL query with filters
    // 2. Apply pagination
    // 3. Count total matching records
    // 4. Optionally join with investors/tokens
    // 5. Return results

    // Mock implementation
    return {
      transfers: [],
      total: 0,
      limit,
      offset,
      hasMore: false,
    };
  }
}

// Register handler
queryBus.register('transfer.list', new ListTransfersHandler());
