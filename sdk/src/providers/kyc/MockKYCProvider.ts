/**
 * MockKYCProvider - Reference Implementation
 *
 * A mock KYC provider for testing and demonstration.
 * Partners can use this as a template for building their own
 * integrations with Jumio, Onfido, Sumsub, Persona, etc.
 */

import { v4 as uuidv4 } from 'uuid';
import type { Result } from '../../core/types.js';
import { ok, err } from '../../core/types.js';
import type {
  IKYCProvider,
  KYCLevel,
  KYCStatus,
  KYCVerification,
} from '../../core/interfaces.providers.js';

/**
 * In-memory storage for mock data
 */
interface MockStorage {
  verifications: Map<string, KYCVerification>;
  subjectVerifications: Map<string, string>; // subjectId -> verificationId
}

/**
 * MockKYCProvider Configuration
 */
export interface MockKYCProviderConfig {
  /** Simulated verification delay in ms (default: 1000) */
  verificationDelay?: number;
  /** Auto-approve verifications (default: true) */
  autoApprove?: boolean;
  /** Base URL for verification (default: 'https://mock-kyc.example.com') */
  baseUrl?: string;
  /** Simulate failures for testing (default: false) */
  simulateFailures?: boolean;
  /** Failure rate when simulateFailures is true (0-1, default: 0.1) */
  failureRate?: number;
  /** Blocked countries for sanctions (default: ['KP', 'IR', 'CU', 'SY']) */
  blockedCountries?: string[];
}

/**
 * MockKYCProvider - For testing and development
 *
 * @example
 * ```typescript
 * import { MockKYCProvider } from '@tokenisation/sdk';
 *
 * const kyc = new MockKYCProvider({
 *   autoApprove: true,
 *   verificationDelay: 2000,
 * });
 *
 * // Register with provider registry
 * providerRegistry.registerKYC(kyc, { isDefault: true });
 *
 * // Initiate verification
 * const result = await kyc.initiateVerification({
 *   subjectId: 'user-123',
 *   level: 'standard',
 * });
 * ```
 */
export class MockKYCProvider implements IKYCProvider {
  readonly providerId = 'mock-kyc';
  readonly providerName = 'Mock KYC Provider';
  readonly supportedLevels: KYCLevel[] = ['none', 'basic', 'standard', 'enhanced', 'institutional'];

  private storage: MockStorage = {
    verifications: new Map(),
    subjectVerifications: new Map(),
  };

  private config: Required<MockKYCProviderConfig>;

  constructor(config: MockKYCProviderConfig = {}) {
    this.config = {
      verificationDelay: config.verificationDelay ?? 1000,
      autoApprove: config.autoApprove ?? true,
      baseUrl: config.baseUrl ?? 'https://mock-kyc.example.com',
      simulateFailures: config.simulateFailures ?? false,
      failureRate: config.failureRate ?? 0.1,
      blockedCountries: config.blockedCountries ?? ['KP', 'IR', 'CU', 'SY'],
    };
  }

  /**
   * Initiate KYC verification
   */
  async initiateVerification(params: {
    subjectId: string;
    level: KYCLevel;
    redirectUrl?: string;
    webhookUrl?: string;
    prefill?: {
      email?: string;
      phone?: string;
      firstName?: string;
      lastName?: string;
      dateOfBirth?: string;
      country?: string;
    };
  }): Promise<Result<{
    verificationId: string;
    verificationUrl: string;
    sdkToken?: string;
  }, string>> {
    if (this.shouldFail()) {
      return err('Simulated failure: Unable to initiate verification');
    }

    const verificationId = `ver_${uuidv4().slice(0, 12)}`;
    const sdkToken = `tok_${uuidv4()}`;

    // Create verification record
    const verification: KYCVerification = {
      verificationId,
      subjectId: params.subjectId,
      level: params.level,
      status: 'pending',
      jurisdiction: params.prefill?.country,
      providerData: {
        prefill: params.prefill,
        redirectUrl: params.redirectUrl,
        webhookUrl: params.webhookUrl,
        createdAt: new Date().toISOString(),
      },
    };

    this.storage.verifications.set(verificationId, verification);
    this.storage.subjectVerifications.set(params.subjectId, verificationId);

    // Auto-approve if configured
    if (this.config.autoApprove) {
      this.processVerification(verificationId);
    }

    const verificationUrl = `${this.config.baseUrl}/verify/${verificationId}?token=${sdkToken}`;

    return ok({
      verificationId,
      verificationUrl,
      sdkToken,
    });
  }

  /**
   * Get verification status
   */
  async getVerification(verificationId: string): Promise<Result<KYCVerification, string>> {
    const verification = this.storage.verifications.get(verificationId);

    if (!verification) {
      return err(`Verification not found: ${verificationId}`);
    }

    return ok(verification);
  }

  /**
   * Get latest verification for a subject
   */
  async getSubjectVerification(subjectId: string): Promise<Result<KYCVerification | null, string>> {
    const verificationId = this.storage.subjectVerifications.get(subjectId);

    if (!verificationId) {
      return ok(null);
    }

    const verification = this.storage.verifications.get(verificationId);
    return ok(verification || null);
  }

  /**
   * Run sanctions screening
   */
  async screenSanctions(params: {
    subjectId: string;
    fullName: string;
    dateOfBirth?: string;
    country?: string;
  }): Promise<Result<{
    status: 'clear' | 'flagged' | 'blocked';
    matches?: Array<{
      listName: string;
      matchScore: number;
      details: string;
    }>;
  }, string>> {
    if (this.shouldFail()) {
      return err('Simulated failure: Unable to screen sanctions');
    }

    // Check blocked countries
    if (params.country && this.config.blockedCountries.includes(params.country)) {
      return ok({
        status: 'blocked',
        matches: [{
          listName: 'OFAC SDN',
          matchScore: 100,
          details: `Country ${params.country} is on the blocked list`,
        }],
      });
    }

    // Simulate flagged results for certain names (for testing)
    const flaggedNames = ['john doe', 'jane smith', 'test blocked'];
    if (flaggedNames.includes(params.fullName.toLowerCase())) {
      return ok({
        status: 'flagged',
        matches: [{
          listName: 'Test Watchlist',
          matchScore: 85,
          details: 'Potential match found - manual review required',
        }],
      });
    }

    return ok({ status: 'clear' });
  }

  /**
   * Handle webhook from provider
   */
  async handleWebhook(payload: unknown, signature: string): Promise<Result<{
    verificationId: string;
    newStatus: KYCStatus;
  }, string>> {
    // In a real implementation, verify signature
    if (!signature || signature === 'invalid') {
      return err('Invalid webhook signature');
    }

    const data = payload as { verificationId?: string; status?: string };

    if (!data.verificationId) {
      return err('Missing verificationId in webhook payload');
    }

    const verification = this.storage.verifications.get(data.verificationId);
    if (!verification) {
      return err(`Verification not found: ${data.verificationId}`);
    }

    // Map external status to our status
    const statusMap: Record<string, KYCStatus> = {
      'completed': 'approved',
      'approved': 'approved',
      'rejected': 'rejected',
      'pending': 'pending',
      'in_review': 'in_review',
      'expired': 'expired',
    };

    const newStatus = statusMap[data.status || ''] || 'pending';
    verification.status = newStatus;

    if (newStatus === 'approved') {
      verification.verifiedAt = new Date().toISOString();
      // Set expiration to 1 year from now
      const expiresAt = new Date();
      expiresAt.setFullYear(expiresAt.getFullYear() + 1);
      verification.expiresAt = expiresAt.toISOString();
    }

    return ok({
      verificationId: data.verificationId,
      newStatus,
    });
  }

  /**
   * Check if provider is available
   */
  async healthCheck(): Promise<boolean> {
    return !this.shouldFail();
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  /**
   * Process a verification (simulate async approval)
   */
  private async processVerification(verificationId: string): Promise<void> {
    const verification = this.storage.verifications.get(verificationId);
    if (!verification) return;

    // First move to in_review
    await this.delay(this.config.verificationDelay / 2);
    verification.status = 'in_review';

    // Then approve or reject
    await this.delay(this.config.verificationDelay / 2);

    if (this.shouldFail()) {
      verification.status = 'rejected';
      verification.rejectionReason = 'Simulated verification failure';
      return;
    }

    verification.status = 'approved';
    verification.verifiedAt = new Date().toISOString();

    // Set expiration to 1 year from now
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    verification.expiresAt = expiresAt.toISOString();

    // Set accredited investor status based on level
    if (verification.level === 'enhanced' || verification.level === 'institutional') {
      verification.accreditedInvestor = true;
    }

    verification.sanctionsStatus = 'clear';
    verification.isPEP = false;
  }

  /**
   * Check if we should simulate a failure
   */
  private shouldFail(): boolean {
    return this.config.simulateFailures && Math.random() < this.config.failureRate;
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ============================================================================
  // TEST HELPERS
  // ============================================================================

  /**
   * Reset all storage (for testing)
   */
  reset(): void {
    this.storage.verifications.clear();
    this.storage.subjectVerifications.clear();
  }

  /**
   * Manually set verification status (for testing)
   */
  setVerificationStatus(verificationId: string, status: KYCStatus, reason?: string): void {
    const verification = this.storage.verifications.get(verificationId);
    if (verification) {
      verification.status = status;
      if (status === 'rejected' && reason) {
        verification.rejectionReason = reason;
      }
      if (status === 'approved') {
        verification.verifiedAt = new Date().toISOString();
      }
    }
  }

  /**
   * Create a pre-approved verification (for testing)
   */
  createApprovedVerification(subjectId: string, level: KYCLevel = 'standard'): string {
    const verificationId = `ver_${uuidv4().slice(0, 12)}`;

    const verification: KYCVerification = {
      verificationId,
      subjectId,
      level,
      status: 'approved',
      jurisdiction: 'US',
      accreditedInvestor: level === 'enhanced' || level === 'institutional',
      isPEP: false,
      sanctionsStatus: 'clear',
      verifiedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    };

    this.storage.verifications.set(verificationId, verification);
    this.storage.subjectVerifications.set(subjectId, verificationId);

    return verificationId;
  }
}
