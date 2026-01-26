import type { HttpClient } from '../utils/http.js';
import type { Investor, InvestorWallet, PaginatedResponse, InvestorStatus, InvestorClassification, RiskTier, KycStatus } from '../types.js';

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
    const response = await this.http.post<Investor>('/api/v1/investors', input, { idempotencyKey });
    return response.data;
  }

  /**
   * Retrieves an investor by ID.
   */
  async get(id: string): Promise<Investor> {
    const response = await this.http.get<Investor>(`/api/v1/investors/${id}`);
    return response.data;
  }

  /**
   * Lists investors with optional filters.
   */
  async list(params?: ListInvestorsParams): Promise<PaginatedResponse<Investor>> {
    return this.http.list<Investor>('/api/v1/investors', params as Record<string, string | number | boolean | undefined>);
  }

  /**
   * Updates an investor.
   */
  async update(id: string, input: UpdateInvestorInput): Promise<Investor> {
    const response = await this.http.patch<Investor>(`/api/v1/investors/${id}`, input);
    return response.data;
  }

  /**
   * Activates an investor (requires approved KYC).
   */
  async activate(id: string): Promise<Investor> {
    const response = await this.http.post<Investor>(`/api/v1/investors/${id}/activate`);
    return response.data;
  }

  /**
   * Suspends an investor.
   */
  async suspend(id: string, reason?: string): Promise<Investor> {
    const response = await this.http.post<Investor>(`/api/v1/investors/${id}/suspend`, { reason });
    return response.data;
  }

  /**
   * Offboards an investor.
   */
  async offboard(id: string, reason?: string): Promise<Investor> {
    const response = await this.http.post<Investor>(`/api/v1/investors/${id}/offboard`, { reason });
    return response.data;
  }

  // ============================================================================
  // KYC Management
  // ============================================================================

  /**
   * Starts a KYC session for an investor.
   */
  async startKyc(investorId: string, input: StartKycInput): Promise<KycSession> {
    const response = await this.http.post<KycSession>(`/api/v1/investors/${investorId}/kyc/start`, input);
    return response.data;
  }

  /**
   * Manually approves KYC for an investor (admin only).
   */
  async approveKyc(investorId: string, reason?: string): Promise<Investor> {
    const response = await this.http.post<Investor>(`/api/v1/investors/${investorId}/kyc/approve`, { reason });
    return response.data;
  }

  /**
   * Manually rejects KYC for an investor (admin only).
   */
  async rejectKyc(investorId: string, reason: string): Promise<Investor> {
    const response = await this.http.post<Investor>(`/api/v1/investors/${investorId}/kyc/reject`, { reason });
    return response.data;
  }

  /**
   * Gets the current KYC status for an investor.
   */
  async getKycStatus(investorId: string): Promise<{ status: KycStatus; provider: string | null; expiresAt: string | null }> {
    const response = await this.http.get<{ status: KycStatus; provider: string | null; expiresAt: string | null }>(`/api/v1/investors/${investorId}/kyc`);
    return response.data;
  }

  // ============================================================================
  // Wallet Management
  // ============================================================================

  /**
   * Adds a wallet to an investor.
   */
  async addWallet(investorId: string, input: AddWalletInput): Promise<InvestorWallet> {
    const response = await this.http.post<InvestorWallet>(`/api/v1/investors/${investorId}/wallets`, input);
    return response.data;
  }

  /**
   * Lists wallets for an investor.
   */
  async listWallets(investorId: string): Promise<InvestorWallet[]> {
    const response = await this.http.get<{ data: InvestorWallet[] }>(`/api/v1/investors/${investorId}/wallets`);
    return response.data.data;
  }

  /**
   * Verifies a wallet (signature verification).
   */
  async verifyWallet(investorId: string, walletId: string, signature: string, message: string): Promise<InvestorWallet> {
    const response = await this.http.post<InvestorWallet>(`/api/v1/investors/${investorId}/wallets/${walletId}/verify`, {
      signature,
      message,
    });
    return response.data;
  }

  /**
   * Revokes a wallet.
   */
  async revokeWallet(investorId: string, walletId: string): Promise<void> {
    await this.http.post(`/api/v1/investors/${investorId}/wallets/${walletId}/revoke`);
  }

  /**
   * Sets a wallet as primary.
   */
  async setPrimaryWallet(investorId: string, walletId: string): Promise<InvestorWallet> {
    const response = await this.http.post<InvestorWallet>(`/api/v1/investors/${investorId}/wallets/${walletId}/set-primary`);
    return response.data;
  }
}
