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
    const response = await this.http.post<Token>(`/api/v1/tokens/${validatedId}/pause`, { reason });
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
    const response = await this.http.post<Token>(`/api/v1/tokens/${validatedId}/freeze`, { reason });
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
}
