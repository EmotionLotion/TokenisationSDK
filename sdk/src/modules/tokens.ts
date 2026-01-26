import type { HttpClient } from '../utils/http.js';
import type { Token, TokenTranche, PaginatedResponse, TokenStatus } from '../types.js';

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
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
}

export interface RedeemTokensInput {
  investorId: string;
  walletAddress: string;
  amount: string;
  trancheId?: string;
  idempotencyKey?: string;
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
    const response = await this.http.post<Token>('/api/v1/tokens', input, { idempotencyKey });
    return response.data;
  }

  /**
   * Retrieves a token by ID.
   */
  async get(id: string): Promise<Token> {
    const response = await this.http.get<Token>(`/api/v1/tokens/${id}`);
    return response.data;
  }

  /**
   * Lists tokens with optional filters.
   */
  async list(params?: ListTokensParams): Promise<PaginatedResponse<Token>> {
    return this.http.list<Token>('/api/v1/tokens', params as Record<string, string | number | boolean | undefined>);
  }

  /**
   * Updates a token (only draft tokens).
   */
  async update(id: string, input: UpdateTokenInput): Promise<Token> {
    const response = await this.http.patch<Token>(`/api/v1/tokens/${id}`, input);
    return response.data;
  }

  /**
   * Deploys a token to the blockchain.
   */
  async deploy(id: string, input?: DeployTokenInput): Promise<Token> {
    const response = await this.http.post<Token>(`/api/v1/tokens/${id}/deploy`, input);
    return response.data;
  }

  /**
   * Pauses a token (freezes all transfers).
   */
  async pause(id: string, reason?: string): Promise<Token> {
    const response = await this.http.post<Token>(`/api/v1/tokens/${id}/pause`, { reason });
    return response.data;
  }

  /**
   * Unpauses a token (resumes transfers).
   */
  async unpause(id: string): Promise<Token> {
    const response = await this.http.post<Token>(`/api/v1/tokens/${id}/unpause`);
    return response.data;
  }

  /**
   * Freezes a token permanently.
   */
  async freeze(id: string, reason: string): Promise<Token> {
    const response = await this.http.post<Token>(`/api/v1/tokens/${id}/freeze`, { reason });
    return response.data;
  }

  // ============================================================================
  // Issuance & Redemption
  // ============================================================================

  /**
   * Issues tokens to an investor.
   */
  async issue(tokenId: string, input: IssueTokensInput): Promise<Issuance> {
    const response = await this.http.post<Issuance>(`/api/v1/tokens/${tokenId}/issue`, input, {
      idempotencyKey: input.idempotencyKey,
    });
    return response.data;
  }

  /**
   * Redeems tokens from an investor.
   */
  async redeem(tokenId: string, input: RedeemTokensInput): Promise<Redemption> {
    const response = await this.http.post<Redemption>(`/api/v1/tokens/${tokenId}/redeem`, input, {
      idempotencyKey: input.idempotencyKey,
    });
    return response.data;
  }

  /**
   * Lists issuances for a token.
   */
  async listIssuances(tokenId: string, params?: { limit?: number; offset?: number }): Promise<PaginatedResponse<Issuance>> {
    return this.http.list<Issuance>(`/api/v1/tokens/${tokenId}/issuances`, params as Record<string, string | number | boolean | undefined>);
  }

  /**
   * Lists redemptions for a token.
   */
  async listRedemptions(tokenId: string, params?: { limit?: number; offset?: number }): Promise<PaginatedResponse<Redemption>> {
    return this.http.list<Redemption>(`/api/v1/tokens/${tokenId}/redemptions`, params as Record<string, string | number | boolean | undefined>);
  }

  // ============================================================================
  // Tranches
  // ============================================================================

  /**
   * Creates a tranche for a token.
   */
  async createTranche(tokenId: string, input: CreateTrancheInput): Promise<TokenTranche> {
    const response = await this.http.post<TokenTranche>(`/api/v1/tokens/${tokenId}/tranches`, input);
    return response.data;
  }

  /**
   * Lists tranches for a token.
   */
  async listTranches(tokenId: string): Promise<TokenTranche[]> {
    const response = await this.http.get<{ data: TokenTranche[] }>(`/api/v1/tokens/${tokenId}/tranches`);
    return response.data.data;
  }

  /**
   * Gets a specific tranche.
   */
  async getTranche(tokenId: string, trancheId: string): Promise<TokenTranche> {
    const response = await this.http.get<TokenTranche>(`/api/v1/tokens/${tokenId}/tranches/${trancheId}`);
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
    const response = await this.http.get<{
      tokenId: string;
      totalSupply: string;
      holders: Array<{
        investorId: string;
        walletAddress: string;
        balance: string;
        percentage: number;
      }>;
    }>(`/api/v1/tokens/${tokenId}/cap-table`);
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
    const response = await this.http.get<{
      tokenId: string;
      walletAddress: string;
      balance: string;
      lockedBalance: string;
      availableBalance: string;
    }>(`/api/v1/tokens/${tokenId}/balances/${walletAddress}`);
    return response.data;
  }
}
