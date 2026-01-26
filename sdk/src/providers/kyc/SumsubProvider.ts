/**
 * Sumsub KYC Provider
 *
 * Real integration with Sumsub (Sum&Substance) API for KYC/AML verification.
 * Supports identity verification, document checks, and sanctions screening.
 *
 * @see https://developers.sumsub.com/
 */

import { createHmac } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import type { Result } from '../../core/types.js';
import { ok, err } from '../../core/types.js';
import type {
  IKYCProvider,
  KYCLevel,
  KYCStatus,
  KYCVerification,
} from '../../core/interfaces.providers.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Sumsub provider configuration
 */
export interface SumsubProviderConfig {
  /** Sumsub App Token */
  appToken: string;
  /** Sumsub Secret Key */
  secretKey: string;
  /** API base URL (defaults to production) */
  baseUrl?: string;
  /** Webhook secret for signature verification */
  webhookSecret?: string;
  /** Level name mapping to Sumsub level names */
  levelMapping?: Record<KYCLevel, string>;
  /** Request timeout in ms */
  timeout?: number;
}

/**
 * Sumsub applicant data
 */
interface SumsubApplicant {
  id: string;
  createdAt: string;
  externalUserId: string;
  info?: {
    firstName?: string;
    lastName?: string;
    dob?: string;
    country?: string;
    phone?: string;
    email?: string;
  };
  review?: {
    reviewStatus: string;
    reviewResult?: {
      reviewAnswer: string;
      rejectLabels?: string[];
      reviewRejectType?: string;
    };
    moderationComment?: string;
  };
  requiredIdDocs?: {
    docSets?: Array<{
      idDocSetType: string;
      types: string[];
    }>;
  };
}

/**
 * Sumsub access token response
 */
interface SumsubAccessToken {
  token: string;
  userId: string;
}

/**
 * Sumsub webhook payload
 */
interface SumsubWebhookPayload {
  applicantId: string;
  externalUserId: string;
  type: string;
  reviewStatus?: string;
  reviewResult?: {
    reviewAnswer: string;
    rejectLabels?: string[];
    moderationComment?: string;
  };
  createdAt: string;
}

// ============================================================================
// DEFAULT LEVEL MAPPING
// ============================================================================

const DEFAULT_LEVEL_MAPPING: Record<KYCLevel, string> = {
  none: 'basic-kyc',
  basic: 'basic-kyc',
  standard: 'basic-kyc-level',
  enhanced: 'enhanced-kyc-level',
  institutional: 'institutional-kyc-level',
};

// ============================================================================
// SUMSUB PROVIDER
// ============================================================================

/**
 * SumsubProvider - Real Sumsub API integration
 *
 * @example
 * ```typescript
 * const sumsub = new SumsubProvider({
 *   appToken: process.env.SUMSUB_APP_TOKEN,
 *   secretKey: process.env.SUMSUB_SECRET_KEY,
 * });
 *
 * // Initiate verification
 * const result = await sumsub.initiateVerification({
 *   subjectId: 'user-123',
 *   level: 'standard',
 *   prefill: {
 *     email: 'user@example.com',
 *     firstName: 'John',
 *     lastName: 'Doe',
 *   },
 * });
 *
 * if (result.success) {
 *   // Redirect user to verification URL or use SDK token
 *   console.log(result.data.verificationUrl);
 * }
 * ```
 */
export class SumsubProvider implements IKYCProvider {
  readonly providerId = 'sumsub';
  readonly providerName = 'Sumsub';
  readonly supportedLevels: KYCLevel[] = ['none', 'basic', 'standard', 'enhanced', 'institutional'];

  private config: Required<Pick<SumsubProviderConfig, 'appToken' | 'secretKey' | 'baseUrl' | 'timeout'>> &
    SumsubProviderConfig;
  private levelMapping: Record<KYCLevel, string>;

  constructor(config: SumsubProviderConfig) {
    if (!config.appToken || !config.secretKey) {
      throw new Error('Sumsub appToken and secretKey are required');
    }

    this.config = {
      baseUrl: 'https://api.sumsub.com',
      timeout: 30000,
      ...config,
    };

    this.levelMapping = config.levelMapping || DEFAULT_LEVEL_MAPPING;
  }

  // ==========================================================================
  // VERIFICATION
  // ==========================================================================

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
    try {
      const levelName = this.levelMapping[params.level];

      // Create or get applicant
      const applicantResult = await this.getOrCreateApplicant(
        params.subjectId,
        levelName,
        params.prefill
      );

      if (!applicantResult.success) {
        return err(applicantResult.error);
      }

      const applicant = applicantResult.data;

      // Generate access token for SDK
      const tokenResult = await this.generateAccessToken(applicant.id, levelName);

      if (!tokenResult.success) {
        return err(tokenResult.error);
      }

      // Build verification URL
      const verificationUrl = `https://websdk.sumsub.com/idensic/#/access?accessToken=${tokenResult.data.token}`;

      return ok({
        verificationId: applicant.id,
        verificationUrl,
        sdkToken: tokenResult.data.token,
      });
    } catch (error) {
      return err(`Failed to initiate verification: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get verification status
   */
  async getVerification(verificationId: string): Promise<Result<KYCVerification, string>> {
    try {
      const response = await this.request<SumsubApplicant>(
        'GET',
        `/resources/applicants/${verificationId}/one`
      );

      if (!response.success) {
        return err(response.error);
      }

      const applicant = response.data;
      return ok(this.mapApplicantToVerification(applicant));
    } catch (error) {
      return err(`Failed to get verification: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get latest verification for a subject
   */
  async getSubjectVerification(subjectId: string): Promise<Result<KYCVerification | null, string>> {
    try {
      const response = await this.request<SumsubApplicant>(
        'GET',
        `/resources/applicants/-;externalUserId=${encodeURIComponent(subjectId)}/one`
      );

      if (!response.success) {
        // Not found is OK - return null
        if (response.error.includes('404') || response.error.includes('not found')) {
          return ok(null);
        }
        return err(response.error);
      }

      return ok(this.mapApplicantToVerification(response.data));
    } catch (error) {
      return err(`Failed to get subject verification: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // ==========================================================================
  // SANCTIONS SCREENING
  // ==========================================================================

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
    try {
      // First, ensure applicant exists
      const applicantResult = await this.getOrCreateApplicant(params.subjectId, 'basic-kyc', {
        firstName: params.fullName.split(' ')[0],
        lastName: params.fullName.split(' ').slice(1).join(' '),
        dateOfBirth: params.dateOfBirth,
        country: params.country,
      });

      if (!applicantResult.success) {
        return err(applicantResult.error);
      }

      // Request AML check
      const checkResponse = await this.request<{
        answer: string;
        hits?: Array<{
          score: number;
          listId: string;
          listName: string;
          entity: { name: string };
        }>;
      }>(
        'POST',
        `/resources/applicants/${applicantResult.data.id}/checks/aml`
      );

      if (!checkResponse.success) {
        return err(checkResponse.error);
      }

      const { answer, hits } = checkResponse.data;

      if (answer === 'RED' || answer === 'FINAL_REJECT') {
        return ok({
          status: 'blocked',
          matches: hits?.map((hit) => ({
            listName: hit.listName,
            matchScore: hit.score * 100,
            details: `Match on ${hit.listName}: ${hit.entity.name}`,
          })),
        });
      }

      if (answer === 'YELLOW' || answer === 'SOFT_REJECT') {
        return ok({
          status: 'flagged',
          matches: hits?.map((hit) => ({
            listName: hit.listName,
            matchScore: hit.score * 100,
            details: `Potential match on ${hit.listName}: ${hit.entity.name}`,
          })),
        });
      }

      return ok({ status: 'clear' });
    } catch (error) {
      return err(`Failed to screen sanctions: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // ==========================================================================
  // WEBHOOK HANDLING
  // ==========================================================================

  /**
   * Handle webhook from Sumsub
   */
  async handleWebhook(payload: unknown, signature: string): Promise<Result<{
    verificationId: string;
    newStatus: KYCStatus;
  }, string>> {
    try {
      // Verify webhook signature if secret is configured
      if (this.config.webhookSecret) {
        const isValid = this.verifyWebhookSignature(payload, signature);
        if (!isValid) {
          return err('Invalid webhook signature');
        }
      }

      const data = payload as SumsubWebhookPayload;

      if (!data.applicantId) {
        return err('Missing applicantId in webhook payload');
      }

      // Map Sumsub status to our status
      const newStatus = this.mapSumsubStatus(data.reviewStatus, data.reviewResult?.reviewAnswer);

      return ok({
        verificationId: data.applicantId,
        newStatus,
      });
    } catch (error) {
      return err(`Failed to handle webhook: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // ==========================================================================
  // HEALTH CHECK
  // ==========================================================================

  /**
   * Check if provider is available
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.request<{ ok: boolean }>('GET', '/resources/status');
      return response.success;
    } catch {
      return false;
    }
  }

  // ==========================================================================
  // PRIVATE METHODS
  // ==========================================================================

  /**
   * Get or create applicant
   */
  private async getOrCreateApplicant(
    externalUserId: string,
    levelName: string,
    prefill?: {
      email?: string;
      phone?: string;
      firstName?: string;
      lastName?: string;
      dateOfBirth?: string;
      country?: string;
    }
  ): Promise<Result<SumsubApplicant, string>> {
    // First try to get existing applicant
    const existingResult = await this.request<SumsubApplicant>(
      'GET',
      `/resources/applicants/-;externalUserId=${encodeURIComponent(externalUserId)}/one`
    );

    if (existingResult.success) {
      return existingResult;
    }

    // Create new applicant
    const createBody = {
      externalUserId,
      levelName,
      info: prefill ? {
        firstName: prefill.firstName,
        lastName: prefill.lastName,
        dob: prefill.dateOfBirth,
        country: prefill.country,
        phone: prefill.phone,
        email: prefill.email,
      } : undefined,
    };

    return this.request<SumsubApplicant>('POST', '/resources/applicants', createBody);
  }

  /**
   * Generate access token for SDK
   */
  private async generateAccessToken(
    applicantId: string,
    levelName: string
  ): Promise<Result<SumsubAccessToken, string>> {
    return this.request<SumsubAccessToken>(
      'POST',
      `/resources/accessTokens?userId=${applicantId}&levelName=${levelName}`
    );
  }

  /**
   * Make authenticated request to Sumsub API
   */
  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<Result<T, string>> {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const bodyString = body ? JSON.stringify(body) : '';

    // Generate signature
    const signatureData = timestamp + method.toUpperCase() + path + bodyString;
    const signature = createHmac('sha256', this.config.secretKey)
      .update(signatureData)
      .digest('hex');

    const url = `${this.config.baseUrl}${path}`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

      const response = await fetch(url, {
        method,
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'X-App-Token': this.config.appToken,
          'X-App-Access-Sig': signature,
          'X-App-Access-Ts': timestamp,
        },
        body: bodyString || undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        return err(`Sumsub API error ${response.status}: ${errorText}`);
      }

      const data = await response.json() as T;
      return ok(data);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return err('Request timeout');
      }
      return err(`Request failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Map Sumsub applicant to KYCVerification
   */
  private mapApplicantToVerification(applicant: SumsubApplicant): KYCVerification {
    const reviewStatus = applicant.review?.reviewStatus;
    const reviewAnswer = applicant.review?.reviewResult?.reviewAnswer;

    return {
      verificationId: applicant.id,
      subjectId: applicant.externalUserId,
      level: this.mapLevelFromSumsub(applicant.requiredIdDocs?.docSets),
      status: this.mapSumsubStatus(reviewStatus, reviewAnswer),
      jurisdiction: applicant.info?.country,
      verifiedAt: reviewAnswer === 'GREEN' ? new Date().toISOString() : undefined,
      rejectionReason: applicant.review?.reviewResult?.rejectLabels?.join(', ') ||
        applicant.review?.moderationComment,
      providerData: { applicant },
    };
  }

  /**
   * Map Sumsub status to our KYCStatus
   */
  private mapSumsubStatus(reviewStatus?: string, reviewAnswer?: string): KYCStatus {
    if (reviewAnswer === 'GREEN') return 'approved';
    if (reviewAnswer === 'RED' || reviewAnswer === 'FINAL_REJECT') return 'rejected';

    switch (reviewStatus) {
      case 'pending':
      case 'queued':
        return 'pending';
      case 'onHold':
      case 'prechecked':
        return 'in_review';
      case 'completed':
        return reviewAnswer === 'GREEN' ? 'approved' : 'rejected';
      default:
        return 'pending';
    }
  }

  /**
   * Map Sumsub level to our KYCLevel
   */
  private mapLevelFromSumsub(docSets?: Array<{ idDocSetType: string }>): KYCLevel {
    if (!docSets || docSets.length === 0) return 'basic';

    const hasEnhanced = docSets.some((d) =>
      d.idDocSetType === 'PROOF_OF_RESIDENCE' || d.idDocSetType === 'SELFIE'
    );

    return hasEnhanced ? 'enhanced' : 'standard';
  }

  /**
   * Verify webhook signature
   */
  private verifyWebhookSignature(payload: unknown, signature: string): boolean {
    if (!this.config.webhookSecret) return true;

    const bodyString = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const expectedSignature = createHmac('sha256', this.config.webhookSecret)
      .update(bodyString)
      .digest('hex');

    return signature === expectedSignature;
  }
}

/**
 * Factory function to create SumsubProvider
 */
export function createSumsubProvider(config: SumsubProviderConfig): SumsubProvider {
  return new SumsubProvider(config);
}
