/**
 * LegalModule - Thin API Client for KYC/AML compliance operations.
 *
 * Provides KYC provider configuration, investor verification,
 * status checks, and freeze/unfreeze operations.
 *
 * Usage:
 *   const sdk = new ApiClient({ apiKey: 'sk_live_...' });
 *   await sdk.legal.configureKYC({ provider: 'sumsub', region: 'AE' });
 *   await sdk.legal.initiateVerification('inv_123');
 *   const status = await sdk.legal.getVerificationStatus('inv_123');
 */

import type { HttpClient } from '../utils/http.js';

// ============================================================================
// Types
// ============================================================================

export interface ConfigureKYCInput {
  provider: string;
  region: string;
  level?: string;
  webhookUrl?: string;
}

export interface KYCConfiguration {
  id: string;
  provider: string;
  region: string;
  level: string;
  webhookUrl?: string;
  status: 'active' | 'inactive';
  createdAt: string;
  updatedAt: string;
}

export interface VerificationSession {
  sessionId: string;
  investorId: string;
  provider: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'expired';
  redirectUrl?: string;
  createdAt: string;
  expiresAt?: string;
}

export interface VerificationStatus {
  investorId: string;
  status: 'not_started' | 'pending' | 'in_progress' | 'approved' | 'rejected' | 'expired';
  provider: string;
  level: string;
  verifiedAt?: string;
  rejectionReason?: string;
  lastCheckedAt: string;
}

export interface FreezeResult {
  investorId: string;
  frozen: boolean;
  reason: string;
  frozenAt: string;
  frozenBy: string;
}

export interface UnfreezeResult {
  investorId: string;
  frozen: boolean;
  unfrozenAt: string;
  unfrozenBy: string;
}

// ============================================================================
// Module
// ============================================================================

export class LegalModule {
  constructor(private http: HttpClient) {}

  /**
   * Configure KYC provider settings for the organization.
   */
  async configureKYC(input: ConfigureKYCInput): Promise<KYCConfiguration> {
    const response = await this.http.post<KYCConfiguration>(
      '/api/v1/compliance/kyc/configure',
      input,
    );
    return response.data;
  }

  /**
   * Initiate a KYC verification session for an investor.
   */
  async initiateVerification(investorId: string): Promise<VerificationSession> {
    const response = await this.http.post<VerificationSession>(
      `/api/v1/compliance/kyc/verify/${encodeURIComponent(investorId)}`,
      {},
    );
    return response.data;
  }

  /**
   * Get the current KYC verification status for an investor.
   */
  async getVerificationStatus(investorId: string): Promise<VerificationStatus> {
    const response = await this.http.get<VerificationStatus>(
      `/api/v1/compliance/kyc/status/${encodeURIComponent(investorId)}`,
    );
    return response.data;
  }

  /**
   * Freeze an investor's account for compliance reasons.
   */
  async freezeParty(investorId: string, reason: string): Promise<FreezeResult> {
    const response = await this.http.post<FreezeResult>(
      `/api/v1/compliance/kyc/freeze/${encodeURIComponent(investorId)}`,
      { reason },
    );
    return response.data;
  }

  /**
   * Unfreeze a previously frozen investor account.
   */
  async unfreezeParty(investorId: string): Promise<UnfreezeResult> {
    const response = await this.http.post<UnfreezeResult>(
      `/api/v1/compliance/kyc/unfreeze/${encodeURIComponent(investorId)}`,
      {},
    );
    return response.data;
  }
}
