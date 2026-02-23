import type { HttpClient } from '../utils/http.js';
import type { Investor, InvestorWallet, PaginatedResponse, InvestorStatus, InvestorClassification, RiskTier, KycStatus } from '../types.js';
import {
  validate,
  CreateInvestorInputSchema,
  UpdateInvestorInputSchema,
  ListInvestorsParamsSchema,
  AddWalletInputSchema,
  StartKycInputSchema,
  VerifyWalletInputSchema,
  ReasonInputSchema,
  RequiredReasonInputSchema,
  UUIDSchema,
} from './validation.js';

// ============================================================================
// Investors Module
// ============================================================================

export interface CreateInvestorInput {
  email: string;
  name?: string;
  externalId?: string;
  type?: 'individual' | 'entity';
  classification?: InvestorClassification;
  riskTier?: RiskTier;
  jurisdiction: string;
  accredited?: boolean;
  metadata?: Record<string, unknown>;
}

export interface UpdateInvestorInput {
  email?: string;
  name?: string;
  externalId?: string;
  classification?: InvestorClassification;
  riskTier?: RiskTier;
  jurisdiction?: string;
  accredited?: boolean;
  metadata?: Record<string, unknown>;
}

export interface ListInvestorsParams {
  status?: InvestorStatus;
  kycStatus?: KycStatus;
  classification?: InvestorClassification;
  jurisdiction?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface AddWalletInput {
  address: string;
  chainId: number;
  walletType?: 'eoa' | 'multisig' | 'smart_account';
  custodyType?: 'self' | 'custodian';
  isPrimary?: boolean;
  metadata?: Record<string, unknown>;
}

export interface StartKycInput {
  provider: string;
  redirectUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface KycSession {
  sessionId: string;
  provider: string;
  url: string;
  expiresAt: string;
}

export class InvestorsModule {
  constructor(private http: HttpClient) {}

  /**
   * Creates a new investor.
   */
  async create(input: CreateInvestorInput, idempotencyKey?: string): Promise<Investor> {
    const validated = validate(CreateInvestorInputSchema, input);
    const response = await this.http.post<Investor>('/api/v1/investors', validated, { idempotencyKey });
    return response.data;
  }

  /**
   * Retrieves an investor by ID.
   */
  async get(id: string): Promise<Investor> {
    const validatedId = validate(UUIDSchema, id);
    const response = await this.http.get<Investor>(`/api/v1/investors/${validatedId}`);
    return response.data;
  }

  /**
   * Lists investors with optional filters.
   */
  async list(params?: ListInvestorsParams): Promise<PaginatedResponse<Investor>> {
    const validated = params ? validate(ListInvestorsParamsSchema, params) : undefined;
    return this.http.list<Investor>('/api/v1/investors', validated as Record<string, string | number | boolean | undefined>);
  }

  /**
   * Updates an investor.
   */
  async update(id: string, input: UpdateInvestorInput): Promise<Investor> {
    const validatedId = validate(UUIDSchema, id);
    const validated = validate(UpdateInvestorInputSchema, input);
    const response = await this.http.patch<Investor>(`/api/v1/investors/${validatedId}`, validated);
    return response.data;
  }

  /**
   * Activates an investor (requires approved KYC).
   */
  async activate(id: string): Promise<Investor> {
    const validatedId = validate(UUIDSchema, id);
    const response = await this.http.post<Investor>(`/api/v1/investors/${validatedId}/activate`);
    return response.data;
  }

  /**
   * Suspends an investor.
   */
  async suspend(id: string, reason?: string): Promise<Investor> {
    const validatedId = validate(UUIDSchema, id);
    const validated = validate(ReasonInputSchema, { reason });
    const response = await this.http.post<Investor>(`/api/v1/investors/${validatedId}/suspend`, validated);
    return response.data;
  }

  /**
   * Offboards an investor.
   */
  async offboard(id: string, reason?: string): Promise<Investor> {
    const validatedId = validate(UUIDSchema, id);
    const validated = validate(ReasonInputSchema, { reason });
    const response = await this.http.post<Investor>(`/api/v1/investors/${validatedId}/offboard`, validated);
    return response.data;
  }

  // ============================================================================
  // KYC Management
  // ============================================================================

  /**
   * Starts a KYC session for an investor.
   */
  async startKyc(investorId: string, input: StartKycInput): Promise<KycSession> {
    const validatedId = validate(UUIDSchema, investorId);
    const validated = validate(StartKycInputSchema, input);
    const response = await this.http.post<KycSession>(`/api/v1/investors/${validatedId}/kyc/start`, validated);
    return response.data;
  }

  /**
   * Manually approves KYC for an investor (admin only).
   */
  async approveKyc(investorId: string, reason?: string): Promise<Investor> {
    const validatedId = validate(UUIDSchema, investorId);
    const validated = validate(ReasonInputSchema, { reason });
    const response = await this.http.post<Investor>(`/api/v1/investors/${validatedId}/kyc/approve`, validated);
    return response.data;
  }

  /**
   * Manually rejects KYC for an investor (admin only).
   */
  async rejectKyc(investorId: string, reason: string): Promise<Investor> {
    const validatedId = validate(UUIDSchema, investorId);
    const validated = validate(RequiredReasonInputSchema, { reason });
    const response = await this.http.post<Investor>(`/api/v1/investors/${validatedId}/kyc/reject`, validated);
    return response.data;
  }

  /**
   * Gets the current KYC status for an investor.
   */
  async getKycStatus(investorId: string): Promise<{ status: KycStatus; provider: string | null; expiresAt: string | null }> {
    const validatedId = validate(UUIDSchema, investorId);
    const response = await this.http.get<{ status: KycStatus; provider: string | null; expiresAt: string | null }>(`/api/v1/investors/${validatedId}/kyc`);
    return response.data;
  }

  // ============================================================================
  // Wallet Management
  // ============================================================================

  /**
   * Adds a wallet to an investor.
   */
  async addWallet(investorId: string, input: AddWalletInput): Promise<InvestorWallet> {
    const validatedId = validate(UUIDSchema, investorId);
    const validated = validate(AddWalletInputSchema, input);
    const response = await this.http.post<InvestorWallet>(`/api/v1/investors/${validatedId}/wallets`, validated);
    return response.data;
  }

  /**
   * Lists wallets for an investor.
   */
  async listWallets(investorId: string): Promise<InvestorWallet[]> {
    const validatedId = validate(UUIDSchema, investorId);
    const response = await this.http.get<{ data: InvestorWallet[] }>(`/api/v1/investors/${validatedId}/wallets`);
    return response.data.data;
  }

  /**
   * Verifies a wallet (signature verification).
   */
  async verifyWallet(investorId: string, walletId: string, signature: string, message: string): Promise<InvestorWallet> {
    const validatedInvestorId = validate(UUIDSchema, investorId);
    const validatedWalletId = validate(UUIDSchema, walletId);
    const validated = validate(VerifyWalletInputSchema, { signature, message });
    const response = await this.http.post<InvestorWallet>(`/api/v1/investors/${validatedInvestorId}/wallets/${validatedWalletId}/verify`, validated);
    return response.data;
  }

  /**
   * Revokes a wallet.
   */
  async revokeWallet(investorId: string, walletId: string): Promise<void> {
    const validatedInvestorId = validate(UUIDSchema, investorId);
    const validatedWalletId = validate(UUIDSchema, walletId);
    await this.http.post(`/api/v1/investors/${validatedInvestorId}/wallets/${validatedWalletId}/revoke`);
  }

  /**
   * Sets a wallet as primary.
   */
  async setPrimaryWallet(investorId: string, walletId: string): Promise<InvestorWallet> {
    const validatedInvestorId = validate(UUIDSchema, investorId);
    const validatedWalletId = validate(UUIDSchema, walletId);
    const response = await this.http.post<InvestorWallet>(`/api/v1/investors/${validatedInvestorId}/wallets/${validatedWalletId}/set-primary`);
    return response.data;
  }
}
