import type { HttpClient } from '../utils/http.js';
import type { Token, TokenTranche, PaginatedResponse, TokenStatus } from '../types.js';
import {
  validate,
  CreateTokenInputSchema,
  UpdateTokenInputSchema,
  ListTokensParamsSchema,
  DeployTokenInputSchema,
  IssueTokensInputSchema,
  RedeemTokensInputSchema,
  CreateTrancheInputSchema,
  ClawbackInputSchema,
  ConfirmClawbackInputSchema,
  ListClawbacksParamsSchema,
  ReasonInputSchema,
  FreezeTokenInputSchema,
  UUIDSchema,
  EthereumAddressSchema,
  PaginationSchema,
} from './validation.js';

// ============================================================================
// Tokens Module
// ============================================================================

export interface CreateTokenInput {
  name: string;
  symbol: string;
  decimals?: number;
  maxSupply?: string;
  projectId?: string;
  assetId?: string;
  chainId: number;
  policyId?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateTokenInput {
  name?: string;
  metadata?: Record<string, unknown>;
}

export interface ListTokensParams {
  status?: TokenStatus;
  chainId?: number;
  projectId?: string;
  assetId?: string;
  limit?: number;
  offset?: number;
}

export interface DeployTokenInput {
  chainId?: number;
  identityRegistryAddress?: string;
  complianceAddress?: string;
}

export interface IssueTokensInput {
  investorId: string;
  walletAddress: string;
  amount: string;
  trancheId?: string;
  /** Required idempotency key to prevent duplicate issuances */
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
}

export interface RedeemTokensInput {
  investorId: string;
  walletAddress: string;
  amount: string;
  trancheId?: string;
  /** Required idempotency key to prevent duplicate redemptions */
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
}

export interface CreateTrancheInput {
  name: string;
  supply: string;
  lockedUntil?: string;
  transferRestrictions?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface Issuance {
  id: string;
  tokenId: string;
  investorId: string;
  walletAddress: string;
  amount: string;
  trancheId: string | null;
  txHash: string | null;
  status: 'pending' | 'submitted' | 'confirmed' | 'failed';
  createdAt: string;
}

export interface Redemption {
  id: string;
  tokenId: string;
  investorId: string;
  walletAddress: string;
  amount: string;
  trancheId: string | null;
  txHash: string | null;
  status: 'pending' | 'submitted' | 'confirmed' | 'failed';
  createdAt: string;
}

export interface ClawbackInput {
  /** Address to clawback tokens from */
  fromWallet: string;
  /** Address to send tokens to (typically treasury or compliance address) */
  toWallet: string;
  /** Investor ID of the source (optional, will be looked up if not provided) */
  fromInvestorId?: string;
  /** Investor ID of the destination (optional) */
  toInvestorId?: string;
  /** Amount to clawback (in smallest unit) */
  amount: string;
  /** Reason for the clawback (required, minimum 10 characters) */
  reason: string;
  /** Required idempotency key to prevent duplicate clawbacks */
  idempotencyKey: string;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

export interface Clawback {
  id: string;
  tokenId: string;
  fromWallet: string;
  toWallet: string;
  fromInvestorId: string | null;
  toInvestorId: string | null;
  amount: string;
  reason: string;
  status: 'pending' | 'approved' | 'executed' | 'confirmed' | 'failed';
  approvedBy: string | null;
  executedBy: string | null;
  txHash: string | null;
  txBlock: number | null;
  createdAt: string;
  approvedAt: string | null;
  executedAt: string | null;
}

export interface ListClawbacksParams {
  status?: Clawback['status'];
  fromWallet?: string;
  limit?: number;
  offset?: number;
}

export class TokensModule {
  constructor(private http: HttpClient) {}

  /**
   * Creates a new token definition.
   */
  async create(input: CreateTokenInput, idempotencyKey?: string): Promise<Token> {
    const validated = validate(CreateTokenInputSchema, input);
    const response = await this.http.post<Token>('/api/v1/tokens', validated, { idempotencyKey });
    return response.data;
  }

  /**
   * Retrieves a token by ID.
   */
  async get(id: string): Promise<Token> {
    const validatedId = validate(UUIDSchema, id);
    const response = await this.http.get<Token>(`/api/v1/tokens/${validatedId}`);
    return response.data;
  }

  /**
   * Lists tokens with optional filters.
   */
  async list(params?: ListTokensParams): Promise<PaginatedResponse<Token>> {
    const validated = params ? validate(ListTokensParamsSchema, params) : undefined;
    return this.http.list<Token>('/api/v1/tokens', validated as Record<string, string | number | boolean | undefined>);
  }

  /**
   * Updates a token (only draft tokens).
   */
  async update(id: string, input: UpdateTokenInput): Promise<Token> {
    const validatedId = validate(UUIDSchema, id);
    const validated = validate(UpdateTokenInputSchema, input);
    const response = await this.http.patch<Token>(`/api/v1/tokens/${validatedId}`, validated);
    return response.data;
  }

  /**
   * Deploys a token to the blockchain.
   */
  async deploy(id: string, input?: DeployTokenInput): Promise<Token> {
    const validatedId = validate(UUIDSchema, id);
    const validated = input ? validate(DeployTokenInputSchema, input) : undefined;
    const response = await this.http.post<Token>(`/api/v1/tokens/${validatedId}/deploy`, validated);
    return response.data;
  }

  /**
   * Pauses a token (freezes all transfers).
   */
  async pause(id: string, reason?: string): Promise<Token> {
    const validatedId = validate(UUIDSchema, id);
    const validated = validate(ReasonInputSchema, { reason });
    const response = await this.http.post<Token>(`/api/v1/tokens/${validatedId}/pause`, validated);
    return response.data;
  }

  /**
   * Unpauses a token (resumes transfers).
   */
  async unpause(id: string): Promise<Token> {
    const validatedId = validate(UUIDSchema, id);
    const response = await this.http.post<Token>(`/api/v1/tokens/${validatedId}/unpause`);
    return response.data;
  }

  /**
   * Freezes a token permanently.
   */
  async freeze(id: string, reason: string): Promise<Token> {
    const validatedId = validate(UUIDSchema, id);
    const validated = validate(FreezeTokenInputSchema, { reason });
    const response = await this.http.post<Token>(`/api/v1/tokens/${validatedId}/freeze`, validated);
    return response.data;
  }

  // ============================================================================
  // Issuance & Redemption
  // ============================================================================

  /**
   * Issues tokens to an investor.
   */
  async issue(tokenId: string, input: IssueTokensInput): Promise<Issuance> {
    const validatedTokenId = validate(UUIDSchema, tokenId);
    const validated = validate(IssueTokensInputSchema, input);
    const response = await this.http.post<Issuance>(`/api/v1/tokens/${validatedTokenId}/issue`, validated, {
      idempotencyKey: validated.idempotencyKey,
    });
    return response.data;
  }

  /**
   * Redeems tokens from an investor.
   */
  async redeem(tokenId: string, input: RedeemTokensInput): Promise<Redemption> {
    const validatedTokenId = validate(UUIDSchema, tokenId);
    const validated = validate(RedeemTokensInputSchema, input);
    const response = await this.http.post<Redemption>(`/api/v1/tokens/${validatedTokenId}/redeem`, validated, {
      idempotencyKey: validated.idempotencyKey,
    });
    return response.data;
  }

  /**
   * Lists issuances for a token.
   */
  async listIssuances(tokenId: string, params?: { limit?: number; offset?: number }): Promise<PaginatedResponse<Issuance>> {
    const validatedTokenId = validate(UUIDSchema, tokenId);
    const validated = params ? validate(PaginationSchema, params) : undefined;
    return this.http.list<Issuance>(`/api/v1/tokens/${validatedTokenId}/issuances`, validated as Record<string, string | number | boolean | undefined>);
  }

  /**
   * Lists redemptions for a token.
   */
  async listRedemptions(tokenId: string, params?: { limit?: number; offset?: number }): Promise<PaginatedResponse<Redemption>> {
    const validatedTokenId = validate(UUIDSchema, tokenId);
    const validated = params ? validate(PaginationSchema, params) : undefined;
    return this.http.list<Redemption>(`/api/v1/tokens/${validatedTokenId}/redemptions`, validated as Record<string, string | number | boolean | undefined>);
  }

  // ============================================================================
  // Tranches
  // ============================================================================

  /**
   * Creates a tranche for a token.
   */
  async createTranche(tokenId: string, input: CreateTrancheInput): Promise<TokenTranche> {
    const validatedTokenId = validate(UUIDSchema, tokenId);
    const validated = validate(CreateTrancheInputSchema, input);
    const response = await this.http.post<TokenTranche>(`/api/v1/tokens/${validatedTokenId}/tranches`, validated);
    return response.data;
  }

  /**
   * Lists tranches for a token.
   */
  async listTranches(tokenId: string): Promise<TokenTranche[]> {
    const validatedTokenId = validate(UUIDSchema, tokenId);
    const response = await this.http.get<{ data: TokenTranche[] }>(`/api/v1/tokens/${validatedTokenId}/tranches`);
    return response.data.data;
  }

  /**
   * Gets a specific tranche.
   */
  async getTranche(tokenId: string, trancheId: string): Promise<TokenTranche> {
    const validatedTokenId = validate(UUIDSchema, tokenId);
    const validatedTrancheId = validate(UUIDSchema, trancheId);
    const response = await this.http.get<TokenTranche>(`/api/v1/tokens/${validatedTokenId}/tranches/${validatedTrancheId}`);
    return response.data;
  }

  // ============================================================================
  // Balances & Cap Table
  // ============================================================================

  /**
   * Gets the cap table for a token.
   */
  async getCapTable(tokenId: string): Promise<{
    tokenId: string;
    totalSupply: string;
    holders: Array<{
      investorId: string;
      walletAddress: string;
      balance: string;
      percentage: number;
    }>;
  }> {
    const validatedTokenId = validate(UUIDSchema, tokenId);
    const response = await this.http.get<{
      tokenId: string;
      totalSupply: string;
      holders: Array<{
        investorId: string;
        walletAddress: string;
        balance: string;
        percentage: number;
      }>;
    }>(`/api/v1/tokens/${validatedTokenId}/cap-table`);
    return response.data;
  }

  /**
   * Gets the balance for a specific wallet.
   */
  async getBalance(tokenId: string, walletAddress: string): Promise<{
    tokenId: string;
    walletAddress: string;
    balance: string;
    lockedBalance: string;
    availableBalance: string;
  }> {
    const validatedTokenId = validate(UUIDSchema, tokenId);
    const validatedAddress = validate(EthereumAddressSchema, walletAddress);
    const response = await this.http.get<{
      tokenId: string;
      walletAddress: string;
      balance: string;
      lockedBalance: string;
      availableBalance: string;
    }>(`/api/v1/tokens/${validatedTokenId}/balances/${validatedAddress}`);
    return response.data;
  }

  // ============================================================================
  // Clawback (Administrative Token Recovery)
  // ============================================================================

  /**
   * Initiates a clawback of tokens from one address to another.
   *
   * Clawback is an administrative action that bypasses normal transfer compliance
   * checks. It is used for regulatory enforcement, court orders, or recovery
   * of tokens from compromised accounts.
   *
   * **Regulatory Note**: The reason field is required and permanently recorded
   * in the audit trail. It cannot be modified after creation.
   *
   * @example
   * ```typescript
   * // Initiate a clawback
   * const clawback = await client.tokens.initiateClawback(tokenId, {
   *   fromWallet: '0x1234...',
   *   toWallet: '0x5678...',  // Treasury address
   *   amount: '1000000000000000000',  // 1 token (18 decimals)
   *   reason: 'Court order #12345 - asset recovery',
   *   idempotencyKey: 'clawback-court-order-12345'
   * });
   *
   * // Approve and execute
   * await client.tokens.approveClawback(tokenId, clawback.id);
   * await client.tokens.executeClawback(tokenId, clawback.id);
   * ```
   */
  async initiateClawback(tokenId: string, input: ClawbackInput): Promise<Clawback> {
    const validatedTokenId = validate(UUIDSchema, tokenId);
    const validated = validate(ClawbackInputSchema, input);
    const response = await this.http.post<Clawback>(
      `/api/v1/tokens/${validatedTokenId}/clawback`,
      validated,
      { idempotencyKey: validated.idempotencyKey }
    );
    return response.data;
  }

  /**
   * Approves a pending clawback for execution.
   * In production, this typically requires compliance officer approval.
   */
  async approveClawback(tokenId: string, clawbackId: string): Promise<Clawback> {
    const validatedTokenId = validate(UUIDSchema, tokenId);
    const validatedClawbackId = validate(UUIDSchema, clawbackId);
    const response = await this.http.post<Clawback>(
      `/api/v1/tokens/${validatedTokenId}/clawbacks/${validatedClawbackId}/approve`
    );
    return response.data;
  }

  /**
   * Executes an approved clawback.
   * This moves the tokens and updates the ledger positions.
   */
  async executeClawback(tokenId: string, clawbackId: string): Promise<Clawback> {
    const validatedTokenId = validate(UUIDSchema, tokenId);
    const validatedClawbackId = validate(UUIDSchema, clawbackId);
    const response = await this.http.post<Clawback>(
      `/api/v1/tokens/${validatedTokenId}/clawbacks/${validatedClawbackId}/execute`
    );
    return response.data;
  }

  /**
   * Confirms a clawback after on-chain transaction is confirmed.
   */
  async confirmClawback(
    tokenId: string,
    clawbackId: string,
    txHash: string,
    blockNumber: number
  ): Promise<Clawback> {
    const validatedTokenId = validate(UUIDSchema, tokenId);
    const validatedClawbackId = validate(UUIDSchema, clawbackId);
    const validated = validate(ConfirmClawbackInputSchema, { txHash, blockNumber });
    const response = await this.http.post<Clawback>(
      `/api/v1/tokens/${validatedTokenId}/clawbacks/${validatedClawbackId}/confirm`,
      validated
    );
    return response.data;
  }

  /**
   * Gets a clawback by ID.
   */
  async getClawback(tokenId: string, clawbackId: string): Promise<Clawback> {
    const validatedTokenId = validate(UUIDSchema, tokenId);
    const validatedClawbackId = validate(UUIDSchema, clawbackId);
    const response = await this.http.get<Clawback>(
      `/api/v1/tokens/${validatedTokenId}/clawbacks/${validatedClawbackId}`
    );
    return response.data;
  }

  /**
   * Lists clawbacks for a token.
   *
   * @example
   * ```typescript
   * // Get all pending clawbacks
   * const pending = await client.tokens.listClawbacks(tokenId, {
   *   status: 'pending'
   * });
   *
   * // Get clawbacks from a specific address
   * const fromAddress = await client.tokens.listClawbacks(tokenId, {
   *   fromWallet: '0x1234...'
   * });
   * ```
   */
  async listClawbacks(
    tokenId: string,
    params?: ListClawbacksParams
  ): Promise<PaginatedResponse<Clawback>> {
    const validatedTokenId = validate(UUIDSchema, tokenId);
    const validated = params ? validate(ListClawbacksParamsSchema, params) : undefined;
    return this.http.list<Clawback>(
      `/api/v1/tokens/${validatedTokenId}/clawbacks`,
      validated as Record<string, string | number | boolean | undefined>
    );
  }
}
