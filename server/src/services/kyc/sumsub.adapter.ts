/**
 * SumSub KYC Provider Adapter
 *
 * Implements the KYC adapter interface for SumSub.
 * Docs: https://developers.sumsub.com/
 */

import crypto from 'crypto';
import {
  KYCProviderAdapter,
  KYCApplicant,
  KYCSession,
  KYCVerificationResult,
  KYCStatus,
  KYCLevel,
  KYCCheck,
  KYCDocument,
  WebhookEvent,
  CreateApplicantParams,
  CreateSessionParams,
  DocumentType,
} from './kyc.adapter.js';

export interface SumSubConfig {
  appToken: string;
  secretKey: string;
  baseUrl?: string;
  levelNameBasic?: string;
  levelNameStandard?: string;
  levelNameEnhanced?: string;
  webhookSecretKey?: string;
}

interface SumSubApplicant {
  id: string;
  externalUserId: string;
  email?: string;
  phone?: string;
  info?: {
    firstName?: string;
    lastName?: string;
    dob?: string;
    country?: string;
    nationality?: string;
  };
  createdAt: string;
  clientId?: string;
}

interface SumSubAccessToken {
  token: string;
  userId: string;
}

interface SumSubReviewResult {
  reviewAnswer: string;
  moderationComment?: string;
  clientComment?: string;
  rejectLabels?: string[];
  reviewRejectType?: string;
}

interface SumSubCheck {
  checkType: string;
  answer: string;
  createdAt: string;
}

export class SumSubAdapter implements KYCProviderAdapter {
  readonly providerName = 'sumsub';

  private config: Required<SumSubConfig>;

  constructor(config: SumSubConfig) {
    this.config = {
      appToken: config.appToken,
      secretKey: config.secretKey,
      baseUrl: config.baseUrl || 'https://api.sumsub.com',
      levelNameBasic: config.levelNameBasic || 'basic-kyc-level',
      levelNameStandard: config.levelNameStandard || 'standard-kyc-level',
      levelNameEnhanced: config.levelNameEnhanced || 'enhanced-kyc-level',
      webhookSecretKey: config.webhookSecretKey || config.secretKey,
    };
  }

  private getLevelName(level: KYCLevel): string {
    switch (level) {
      case 'BASIC':
        return this.config.levelNameBasic;
      case 'STANDARD':
        return this.config.levelNameStandard;
      case 'ENHANCED':
        return this.config.levelNameEnhanced;
      default:
        return this.config.levelNameBasic;
    }
  }

  private generateSignature(method: string, path: string, timestamp: number, body?: string): string {
    const data = timestamp + method.toUpperCase() + path + (body || '');
    return crypto
      .createHmac('sha256', this.config.secretKey)
      .update(data)
      .digest('hex');
  }

  private async request<T>(
    method: string,
    path: string,
    body?: Record<string, unknown>
  ): Promise<T> {
    const timestamp = Math.floor(Date.now() / 1000);
    const bodyStr = body ? JSON.stringify(body) : undefined;
    const signature = this.generateSignature(method, path, timestamp, bodyStr);

    const response = await fetch(`${this.config.baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-App-Token': this.config.appToken,
        'X-App-Access-Sig': signature,
        'X-App-Access-Ts': timestamp.toString(),
      },
      body: bodyStr,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`SumSub API error: ${response.status} - ${error}`);
    }

    return response.json() as Promise<T>;
  }

  async createApplicant(params: CreateApplicantParams): Promise<KYCApplicant> {
    const levelName = this.getLevelName(params.level || 'BASIC');

    const sumsubApplicant = await this.request<SumSubApplicant>(
      'POST',
      `/resources/applicants?levelName=${levelName}`,
      {
        externalUserId: params.externalId,
        email: params.email,
        phone: params.phone,
        info: {
          firstName: params.firstName,
          lastName: params.lastName,
          dob: params.dateOfBirth,
          country: params.country,
          nationality: params.nationality,
        },
      }
    );

    return this.mapApplicant(sumsubApplicant);
  }

  async getApplicant(applicantId: string): Promise<KYCApplicant | null> {
    try {
      const sumsubApplicant = await this.request<SumSubApplicant>(
        'GET',
        `/resources/applicants/${applicantId}/one`
      );
      return this.mapApplicant(sumsubApplicant);
    } catch (error) {
      if (error instanceof Error && error.message.includes('404')) {
        return null;
      }
      throw error;
    }
  }

  async getApplicantByExternalId(externalId: string): Promise<KYCApplicant | null> {
    try {
      const sumsubApplicant = await this.request<SumSubApplicant>(
        'GET',
        `/resources/applicants/-;externalUserId=${encodeURIComponent(externalId)}/one`
      );
      return this.mapApplicant(sumsubApplicant);
    } catch (error) {
      if (error instanceof Error && error.message.includes('404')) {
        return null;
      }
      throw error;
    }
  }

  async createSession(params: CreateSessionParams): Promise<KYCSession> {
    const levelName = this.getLevelName(params.level);

    // Get or create access token
    const tokenResponse = await this.request<SumSubAccessToken>(
      'POST',
      `/resources/accessTokens?userId=${params.applicantId}&levelName=${levelName}`
    );

    return {
      id: crypto.randomUUID(),
      applicantId: params.applicantId,
      level: params.level,
      status: 'PENDING',
      accessToken: tokenResponse.token,
      accessUrl: `https://websdk.sumsub.com/?accessToken=${tokenResponse.token}`,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
      provider: this.providerName,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  async getVerificationResult(applicantId: string): Promise<KYCVerificationResult> {
    const [applicant, status] = await Promise.all([
      this.request<SumSubApplicant>('GET', `/resources/applicants/${applicantId}/one`),
      this.request<{
        reviewResult?: SumSubReviewResult;
        reviewStatus?: string;
      }>('GET', `/resources/applicants/${applicantId}/status`),
    ]);

    // Get checks
    let checks: KYCCheck[] = [];
    try {
      const checksResponse = await this.request<{ checks: SumSubCheck[] }>(
        'GET',
        `/resources/applicants/${applicantId}/info/checks`
      );
      checks = checksResponse.checks.map(c => ({
        id: crypto.randomUUID(),
        type: c.checkType,
        status: this.mapCheckStatus(c.answer),
        createdAt: new Date(c.createdAt),
      }));
    } catch {
      // Checks might not be available
    }

    // Get documents
    let documents: KYCDocument[] = [];
    try {
      const docsResponse = await this.request<{
        items: Array<{
          idDocType: string;
          country?: string;
          issuedDate?: string;
          validUntil?: string;
          number?: string;
        }>;
      }>('GET', `/resources/applicants/${applicantId}/info/idDocs`);

      documents = docsResponse.items.map(doc => ({
        id: crypto.randomUUID(),
        type: this.mapDocumentType(doc.idDocType),
        status: 'approved' as const,
        country: doc.country,
        issuedDate: doc.issuedDate,
        expiryDate: doc.validUntil,
        documentNumber: doc.number,
      }));
    } catch {
      // Documents might not be available
    }

    const kycStatus = this.mapReviewStatus(status.reviewStatus, status.reviewResult);

    return {
      applicantId,
      status: kycStatus,
      level: 'STANDARD', // Default, would need to track this
      verified: kycStatus === 'APPROVED',
      reviewResult: status.reviewResult
        ? {
            moderationComment: status.reviewResult.moderationComment,
            rejectLabels: status.reviewResult.rejectLabels,
            reviewAnswer: status.reviewResult.reviewAnswer,
          }
        : undefined,
      checks,
      documents,
      verifiedAt: kycStatus === 'APPROVED' ? new Date() : undefined,
    };
  }

  async getStatus(applicantId: string): Promise<KYCStatus> {
    const status = await this.request<{
      reviewResult?: SumSubReviewResult;
      reviewStatus?: string;
    }>('GET', `/resources/applicants/${applicantId}/status`);

    return this.mapReviewStatus(status.reviewStatus, status.reviewResult);
  }

  validateWebhook(payload: string, signature: string): boolean {
    const expectedSignature = crypto
      .createHmac('sha256', this.config.webhookSecretKey)
      .update(payload)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }

  parseWebhookEvent(payload: string): WebhookEvent {
    const data = JSON.parse(payload);

    return {
      id: data.webhookId || crypto.randomUUID(),
      type: data.type,
      applicantId: data.applicantId,
      timestamp: new Date(data.createdAtMs || Date.now()),
      payload: data,
    };
  }

  async resetApplicant(applicantId: string): Promise<void> {
    await this.request('POST', `/resources/applicants/${applicantId}/reset`);
  }

  async healthCheck(): Promise<{ healthy: boolean; latencyMs: number }> {
    const start = Date.now();
    try {
      await this.request('GET', '/resources/status/health');
      return { healthy: true, latencyMs: Date.now() - start };
    } catch {
      return { healthy: false, latencyMs: Date.now() - start };
    }
  }

  private mapApplicant(sumsub: SumSubApplicant): KYCApplicant {
    return {
      id: sumsub.id,
      externalId: sumsub.externalUserId,
      email: sumsub.email || '',
      phone: sumsub.phone,
      firstName: sumsub.info?.firstName,
      lastName: sumsub.info?.lastName,
      dateOfBirth: sumsub.info?.dob,
      nationality: sumsub.info?.nationality,
      country: sumsub.info?.country,
      createdAt: new Date(sumsub.createdAt),
      updatedAt: new Date(),
    };
  }

  private mapReviewStatus(
    reviewStatus?: string,
    reviewResult?: SumSubReviewResult
  ): KYCStatus {
    if (!reviewStatus) return 'NOT_STARTED';

    switch (reviewStatus) {
      case 'init':
        return 'NOT_STARTED';
      case 'pending':
        return 'PENDING';
      case 'queued':
      case 'onHold':
        return 'IN_PROGRESS';
      case 'completed':
        if (reviewResult?.reviewAnswer === 'GREEN') return 'APPROVED';
        if (reviewResult?.reviewAnswer === 'RED') return 'REJECTED';
        return 'AWAITING_REVIEW';
      default:
        return 'PENDING';
    }
  }

  private mapCheckStatus(answer: string): 'pending' | 'passed' | 'failed' | 'warning' {
    switch (answer) {
      case 'GREEN':
        return 'passed';
      case 'RED':
        return 'failed';
      case 'YELLOW':
        return 'warning';
      default:
        return 'pending';
    }
  }

  private mapDocumentType(idDocType: string): DocumentType {
    const mapping: Record<string, DocumentType> = {
      PASSPORT: 'PASSPORT',
      ID_CARD: 'NATIONAL_ID',
      DRIVERS: 'DRIVERS_LICENSE',
      RESIDENCE_PERMIT: 'RESIDENCE_PERMIT',
      UTILITY_BILL: 'UTILITY_BILL',
      BANK_STATEMENT: 'BANK_STATEMENT',
      SELFIE: 'SELFIE',
    };
    return mapping[idDocType] || 'PASSPORT';
  }
}

export function createSumSubAdapter(config: SumSubConfig): SumSubAdapter {
  return new SumSubAdapter(config);
}
