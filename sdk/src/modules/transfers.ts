import type { HttpClient } from '../utils/http.js';
import type { Transfer, PaginatedResponse, TransferStatus, Settlement } from '../types.js';

// ============================================================================
// Transfers Module
// ============================================================================

export interface CreateTransferInput {
  tokenId: string;
  fromWallet: string;
  toWallet: string;
  amount: string;
  chainId?: number;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
}

export interface ListTransfersParams {
  tokenId?: string;
  status?: TransferStatus;
  fromWallet?: string;
  toWallet?: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
  offset?: number;
}

export interface TransferWithSettlement extends Transfer {
  settlement?: Settlement;
}

export class TransfersModule {
  constructor(private http: HttpClient) {}

  /**
   * Creates a new transfer request.
   * The transfer goes through the saga: created → prechecked → approved → signing → submitted → confirmed → reconciled → settled
   */
  async create(input: CreateTransferInput): Promise<Transfer> {
    const response = await this.http.post<Transfer>('/api/v1/transfers', input, {
      idempotencyKey: input.idempotencyKey,
    });
    return response.data;
  }

  /**
   * Retrieves a transfer by ID.
   */
  async get(id: string): Promise<TransferWithSettlement> {
    const response = await this.http.get<TransferWithSettlement>(`/api/v1/transfers/${id}`);
    return response.data;
  }

  /**
   * Lists transfers with optional filters.
   */
  async list(params?: ListTransfersParams): Promise<PaginatedResponse<Transfer>> {
    return this.http.list<Transfer>('/api/v1/transfers', params as Record<string, string | number | boolean | undefined>);
  }

  /**
   * Cancels a transfer (only before submission).
   */
  async cancel(id: string, reason?: string): Promise<Transfer> {
    const response = await this.http.post<Transfer>(`/api/v1/transfers/${id}/cancel`, { reason });
    return response.data;
  }

  /**
   * Retries a failed transfer.
   */
  async retry(id: string): Promise<Transfer> {
    const response = await this.http.post<Transfer>(`/api/v1/transfers/${id}/retry`);
    return response.data;
  }

  /**
   * Gets the current status of a transfer with detailed state information.
   */
  async getStatus(id: string): Promise<{
    id: string;
    status: TransferStatus;
    currentStep: string;
    completedSteps: string[];
    nextStep: string | null;
    txHash: string | null;
    settlement: Settlement | null;
    error: string | null;
  }> {
    const response = await this.http.get<{
      id: string;
      status: TransferStatus;
      currentStep: string;
      completedSteps: string[];
      nextStep: string | null;
      txHash: string | null;
      settlement: Settlement | null;
      error: string | null;
    }>(`/api/v1/transfers/${id}/status`);
    return response.data;
  }

  // ============================================================================
  // Batch Operations
  // ============================================================================

  /**
   * Creates multiple transfers in a batch.
   */
  async createBatch(transfers: CreateTransferInput[]): Promise<{
    successful: Transfer[];
    failed: Array<{ input: CreateTransferInput; error: string }>;
  }> {
    const response = await this.http.post<{
      successful: Transfer[];
      failed: Array<{ input: CreateTransferInput; error: string }>;
    }>('/api/v1/transfers/batch', { transfers });
    return response.data;
  }

  // ============================================================================
  // Transfer History
  // ============================================================================

  /**
   * Gets transfer history for a specific wallet.
   */
  async getWalletHistory(walletAddress: string, params?: {
    tokenId?: string;
    direction?: 'in' | 'out' | 'both';
    fromDate?: string;
    toDate?: string;
    limit?: number;
    offset?: number;
  }): Promise<PaginatedResponse<Transfer>> {
    return this.http.list<Transfer>(`/api/v1/transfers/wallet/${walletAddress}`, params as Record<string, string | number | boolean | undefined>);
  }

  /**
   * Gets transfer history for a specific token.
   */
  async getTokenHistory(tokenId: string, params?: {
    fromDate?: string;
    toDate?: string;
    limit?: number;
    offset?: number;
  }): Promise<PaginatedResponse<Transfer>> {
    return this.http.list<Transfer>(`/api/v1/transfers/token/${tokenId}`, params as Record<string, string | number | boolean | undefined>);
  }
}
