/**
 * Onfido KYC Provider Adapter
 *
 * Implements the KYC adapter interface for Onfido.
 * Docs: https://documentation.onfido.com/
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

export interface OnfidoConfig {
  apiToken: string;
  baseUrl?: string;
  webhookToken?: string;
  region?: 'us' | 'eu' | 'ca';
}

interface OnfidoApplicant {
  id: string;
  created_at: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  dob?: string;
  address?: {
    street?: string;
    town?: string;
    state?: string;
    postcode?: string;
    country?: string;
  };
}

interface OnfidoSdkToken {
  token: string;
}

interface OnfidoCheck {
  id: string;
  status: string;
  result: string;
  created_at: string;
  report_ids: string[];
}

interface OnfidoReport {
  id: string;
  name: string;
  status: string;
  result: string;
  created_at: string;
  breakdown?: Record<string, unknown>;
}

interface OnfidoDocument {
  id: string;
  type: string;
  status: string;
  issuing_country?: string;
  file_name?: string;
}

export class OnfidoAdapter implements KYCProviderAdapter {
  readonly providerName = 'onfido';

  private config: Required<OnfidoConfig>;

  constructor(config: OnfidoConfig) {
    const regionUrls: Record<string, string> = {
      us: 'https://api.us.onfido.com/v3.6',
      eu: 'https://api.eu.onfido.com/v3.6',
      ca: 'https://api.ca.onfido.com/v3.6',
    };

    this.config = {
      apiToken: config.apiToken,
      baseUrl: config.baseUrl || regionUrls[config.region || 'us'],
      webhookToken: config.webhookToken || '',
      region: config.region || 'us',
    };
  }

  private getReportNames(level: KYCLevel): string[] {
    switch (level) {
      case 'BASIC':
        return ['document'];
      case 'STANDARD':
        return ['document', 'facial_similarity_photo'];
      case 'ENHANCED':
        return ['document', 'facial_similarity_photo', 'watchlist_standard'];
      default:
        return ['document'];
    }
  }

  private async request<T>(
    method: string,
    path: string,
    body?: Record<string, unknown>
  ): Promise<T> {
    const response = await fetch(`${this.config.baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Token token=${this.config.apiToken}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Onfido API error: ${response.status} - ${error}`);
    }

    return response.json() as Promise<T>;
  }

  async createApplicant(params: CreateApplicantParams): Promise<KYCApplicant> {
    const onfidoApplicant = await this.request<OnfidoApplicant>(
      'POST',
      '/applicants',
      {
        first_name: params.firstName || params.externalId,
        last_name: params.lastName || 'User',
        email: params.email,
        dob: params.dateOfBirth,
        address: params.country
          ? {
              country: params.country,
            }
          : undefined,
      }
    );

    return this.mapApplicant(onfidoApplicant, params.externalId);
  }

  async getApplicant(applicantId: string): Promise<KYCApplicant | null> {
    try {
      const onfidoApplicant = await this.request<OnfidoApplicant>(
        'GET',
        `/applicants/${applicantId}`
      );
      return this.mapApplicant(onfidoApplicant);
    } catch (error) {
      if (error instanceof Error && error.message.includes('404')) {
        return null;
      }
      throw error;
    }
  }

  async getApplicantByExternalId(_externalId: string): Promise<KYCApplicant | null> {
    // Onfido doesn't support external ID lookup directly
    // Would need to maintain a mapping in your database
    return null;
  }

  async createSession(params: CreateSessionParams): Promise<KYCSession> {
    // Generate SDK token for web/mobile integration
    const tokenResponse = await this.request<OnfidoSdkToken>(
      'POST',
      '/sdk_token',
      {
        applicant_id: params.applicantId,
        referrer: params.redirectUrl || '*://*/*',
      }
    );

    return {
      id: crypto.randomUUID(),
      applicantId: params.applicantId,
      level: params.level,
      status: 'PENDING',
      accessToken: tokenResponse.token,
      accessUrl: undefined, // Onfido uses SDK, not redirect URL
      expiresAt: new Date(Date.now() + 90 * 60 * 1000), // 90 minutes
      provider: this.providerName,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  async getVerificationResult(applicantId: string): Promise<KYCVerificationResult> {
    // Get the latest check for this applicant
    const checksResponse = await this.request<{ checks: OnfidoCheck[] }>(
      'GET',
      `/checks?applicant_id=${applicantId}`
    );

    const latestCheck = checksResponse.checks[0];

    if (!latestCheck) {
      return {
        applicantId,
        status: 'NOT_STARTED',
        level: 'STANDARD',
        verified: false,
        checks: [],
        documents: [],
      };
    }

    // Get reports for the check
    const reports = await Promise.all(
      latestCheck.report_ids.map(id =>
        this.request<OnfidoReport>('GET', `/reports/${id}`)
      )
    );

    // Get documents
    const docsResponse = await this.request<{ documents: OnfidoDocument[] }>(
      'GET',
      `/documents?applicant_id=${applicantId}`
    );

    const kycStatus = this.mapCheckStatus(latestCheck.status, latestCheck.result);
    const checks: KYCCheck[] = reports.map(report => ({
      id: report.id,
      type: report.name,
      status: this.mapReportStatus(report.result),
      result: report.breakdown,
      createdAt: new Date(report.created_at),
    }));

    const documents: KYCDocument[] = docsResponse.documents.map(doc => ({
      id: doc.id,
      type: this.mapDocumentType(doc.type),
      status: doc.status === 'uploaded' ? 'approved' : 'pending',
      country: doc.issuing_country,
    }));

    return {
      applicantId,
      status: kycStatus,
      level: 'STANDARD',
      verified: kycStatus === 'APPROVED',
      checks,
      documents,
      verifiedAt: kycStatus === 'APPROVED' ? new Date(latestCheck.created_at) : undefined,
    };
  }

  async getStatus(applicantId: string): Promise<KYCStatus> {
    const checksResponse = await this.request<{ checks: OnfidoCheck[] }>(
      'GET',
      `/checks?applicant_id=${applicantId}`
    );

    const latestCheck = checksResponse.checks[0];

    if (!latestCheck) {
      return 'NOT_STARTED';
    }

    return this.mapCheckStatus(latestCheck.status, latestCheck.result);
  }

  /**
   * Create a check for an applicant
   */
  async createCheck(applicantId: string, level: KYCLevel): Promise<string> {
    const check = await this.request<OnfidoCheck>('POST', '/checks', {
      applicant_id: applicantId,
      report_names: this.getReportNames(level),
    });

    return check.id;
  }

  validateWebhook(payload: string, signature: string): boolean {
    if (!this.config.webhookToken) {
      return false;
    }

    const expectedSignature = crypto
      .createHmac('sha256', this.config.webhookToken)
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
      id: data.payload?.object?.id || crypto.randomUUID(),
      type: data.payload?.action || 'unknown',
      applicantId: data.payload?.object?.applicant_id || '',
      timestamp: new Date(data.payload?.object?.completed_at_iso8601 || Date.now()),
      payload: data,
    };
  }

  async resetApplicant(applicantId: string): Promise<void> {
    // Onfido doesn't have a direct reset - would need to delete and recreate
    await this.request('DELETE', `/applicants/${applicantId}`);
  }

  async healthCheck(): Promise<{ healthy: boolean; latencyMs: number }> {
    const start = Date.now();
    try {
      // Try to list applicants with limit 1 as a health check
      await this.request('GET', '/applicants?per_page=1');
      return { healthy: true, latencyMs: Date.now() - start };
    } catch {
      return { healthy: false, latencyMs: Date.now() - start };
    }
  }

  private mapApplicant(onfido: OnfidoApplicant, externalId?: string): KYCApplicant {
    return {
      id: onfido.id,
      externalId: externalId || onfido.id,
      email: onfido.email || '',
      firstName: onfido.first_name,
      lastName: onfido.last_name,
      dateOfBirth: onfido.dob,
      country: onfido.address?.country,
      address: onfido.address
        ? {
            street: onfido.address.street,
            city: onfido.address.town,
            state: onfido.address.state,
            postalCode: onfido.address.postcode,
            country: onfido.address.country,
          }
        : undefined,
      createdAt: new Date(onfido.created_at),
      updatedAt: new Date(),
    };
  }

  private mapCheckStatus(status: string, result: string): KYCStatus {
    if (status === 'in_progress') return 'IN_PROGRESS';
    if (status === 'awaiting_applicant') return 'PENDING';
    if (status === 'complete') {
      if (result === 'clear') return 'APPROVED';
      if (result === 'consider') return 'AWAITING_REVIEW';
      return 'REJECTED';
    }
    return 'PENDING';
  }

  private mapReportStatus(result: string): 'pending' | 'passed' | 'failed' | 'warning' {
    switch (result) {
      case 'clear':
        return 'passed';
      case 'consider':
        return 'warning';
      case 'unidentified':
        return 'failed';
      default:
        return 'pending';
    }
  }

  private mapDocumentType(type: string): DocumentType {
    const mapping: Record<string, DocumentType> = {
      passport: 'PASSPORT',
      national_identity_card: 'NATIONAL_ID',
      driving_licence: 'DRIVERS_LICENSE',
      residence_permit: 'RESIDENCE_PERMIT',
      utility_bill: 'UTILITY_BILL',
      bank_statement: 'BANK_STATEMENT',
    };
    return mapping[type] || 'PASSPORT';
  }
}

export function createOnfidoAdapter(config: OnfidoConfig): OnfidoAdapter {
  return new OnfidoAdapter(config);
}
