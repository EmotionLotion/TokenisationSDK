import type { HttpClient } from '../utils/http.js';
import type { Transfer, PaginatedResponse, TransferStatus, Settlement } from '../types.js';
import {
  validate,
  CreateTransferInputSchema,
  ListTransfersParamsSchema,
  CreateBatchTransferInputSchema,
  ReasonInputSchema,
  WalletHistoryParamsSchema,
  TokenHistoryParamsSchema,
  UUIDSchema,
  EthereumAddressSchema,
} from './validation.js';

// ============================================================================
// Transfers Module
// ============================================================================

export interface CreateTransferInput {
  tokenId: string;
  fromWallet: string;
  toWallet: string;
  amount: string;
  chainId?: number;
  /** Required idempotency key to prevent duplicate transfers */
  idempotencyKey: string;
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
    const validated = validate(CreateTransferInputSchema, input);
    const response = await this.http.post<Transfer>('/api/v1/transfers', validated, {
      idempotencyKey: validated.idempotencyKey,
    });
    return response.data;
  }

  /**
   * Retrieves a transfer by ID.
   */
  async get(id: string): Promise<TransferWithSettlement> {
    const validatedId = validate(UUIDSchema, id);
    const response = await this.http.get<TransferWithSettlement>(`/api/v1/transfers/${validatedId}`);
    return response.data;
  }

  /**
   * Lists transfers with optional filters.
   */
  async list(params?: ListTransfersParams): Promise<PaginatedResponse<Transfer>> {
    const validated = params ? validate(ListTransfersParamsSchema, params) : undefined;
    return this.http.list<Transfer>('/api/v1/transfers', validated as Record<string, string | number | boolean | undefined>);
  }

  /**
   * Cancels a transfer (only before submission).
   */
  async cancel(id: string, reason?: string): Promise<Transfer> {
    const validatedId = validate(UUIDSchema, id);
    const validated = validate(ReasonInputSchema, { reason });
    const response = await this.http.post<Transfer>(`/api/v1/transfers/${validatedId}/cancel`, validated);
    return response.data;
  }

  /**
   * Retries a failed transfer.
   */
  async retry(id: string): Promise<Transfer> {
    const validatedId = validate(UUIDSchema, id);
    const response = await this.http.post<Transfer>(`/api/v1/transfers/${validatedId}/retry`);
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
    const validatedId = validate(UUIDSchema, id);
    const response = await this.http.get<{
      id: string;
      status: TransferStatus;
      currentStep: string;
      completedSteps: string[];
      nextStep: string | null;
      txHash: string | null;
      settlement: Settlement | null;
      error: string | null;
    }>(`/api/v1/transfers/${validatedId}/status`);
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
    const validated = validate(CreateBatchTransferInputSchema, { transfers });
    const response = await this.http.post<{
      successful: Transfer[];
      failed: Array<{ input: CreateTransferInput; error: string }>;
    }>('/api/v1/transfers/batch', validated);
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
    const validatedAddress = validate(EthereumAddressSchema, walletAddress);
    const validated = params ? validate(WalletHistoryParamsSchema, params) : undefined;
    return this.http.list<Transfer>(`/api/v1/transfers/wallet/${validatedAddress}`, validated as Record<string, string | number | boolean | undefined>);
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
    const validatedTokenId = validate(UUIDSchema, tokenId);
    const validated = params ? validate(TokenHistoryParamsSchema, params) : undefined;
    return this.http.list<Transfer>(`/api/v1/transfers/token/${validatedTokenId}`, validated as Record<string, string | number | boolean | undefined>);
  }

  // ============================================================================
  // Pre-flight Validation
  // ============================================================================

  /**
   * Validates whether a transfer would pass compliance checks WITHOUT creating one.
   * Use this for form validation or pre-submission checks.
   *
   * Returns structured validation result — no transfer is persisted.
   */
  async validate(input: ValidateTransferInput): Promise<ValidationResult> {
    const response = await this.http.post<{
      allowed: boolean;
      decision: 'allow' | 'deny' | 'review';
      reasons: string[];
      restrictions: string[];
    }>('/api/v1/transfers/check', {
      tokenId: input.tokenId,
      fromWallet: input.fromWallet,
      toWallet: input.toWallet,
      amount: input.amount,
    });

    const data = response.data;
    return {
      valid: data.allowed,
      decision: data.decision,
      reasons: data.reasons,
      requiredActions: data.restrictions,
    };
  }

  /**
   * Full pre-flight check: runs compliance validation AND verifies the
   * on-chain transaction won't revert by estimating gas.
   *
   * Returns a comprehensive result combining compliance, gas estimation,
   * and any errors encountered.
   */
  async preflight(input: ValidateTransferInput): Promise<PreflightResult> {
    // Step 1: Compliance validation
    let compliance: ValidationResult;
    try {
      compliance = await this.validate(input);
    } catch (error) {
      return {
        canTransfer: false,
        compliance: {
          valid: false,
          decision: 'deny',
          reasons: [(error as Error).message],
          requiredActions: [],
        },
        gas: null,
        errors: [(error as Error).message],
      };
    }

    if (!compliance.valid) {
      return {
        canTransfer: false,
        compliance,
        gas: null,
        errors: compliance.reasons,
      };
    }

    // Step 2: Gas estimation (verifies on-chain execution won't revert)
    let gas: GasEstimation | null = null;
    const errors: string[] = [];

    try {
      const gasResponse = await this.http.post<{
        gasLimit: string;
        gasPrice: string;
        maxFeePerGas: string;
        maxPriorityFeePerGas: string;
        estimatedCost: string;
        estimatedCostUSD?: string;
      }>('/api/v1/transfers/estimate-gas', {
        tokenId: input.tokenId,
        fromWallet: input.fromWallet,
        toWallet: input.toWallet,
        amount: input.amount,
      });

      gas = {
        gasLimit: gasResponse.data.gasLimit,
        estimatedCost: gasResponse.data.estimatedCost,
        estimatedCostUSD: gasResponse.data.estimatedCostUSD,
      };
    } catch (error) {
      errors.push(`Gas estimation failed: ${(error as Error).message}`);
    }

    return {
      canTransfer: errors.length === 0,
      compliance,
      gas,
      errors,
    };
  }
}

// ============================================================================
// Validation Types
// ============================================================================

export interface ValidateTransferInput {
  tokenId: string;
  fromWallet: string;
  toWallet: string;
  amount: string;
}

export interface ValidationResult {
  valid: boolean;
  decision: 'allow' | 'deny' | 'review';
  reasons: string[];
  requiredActions: string[];
}

export interface GasEstimation {
  gasLimit: string;
  estimatedCost: string;
  estimatedCostUSD?: string;
}

export interface PreflightResult {
  canTransfer: boolean;
  compliance: ValidationResult;
  gas: GasEstimation | null;
  errors: string[];
}
