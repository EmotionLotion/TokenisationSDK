/**
 * KYC Provider Factory and Exports
 */

export * from './kyc.adapter.js';
export * from './sumsub.adapter.js';
export * from './onfido.adapter.js';

import {
  KYCProviderAdapter,
  KYCProviderType,
  KYCProviderConfig,
  KYCApplicant,
  KYCSession,
  KYCVerificationResult,
  KYCStatus,
  CreateApplicantParams,
  CreateSessionParams,
  WebhookEvent,
} from './kyc.adapter.js';
import { SumSubAdapter } from './sumsub.adapter.js';
import { OnfidoAdapter } from './onfido.adapter.js';
import crypto from 'crypto';

/**
 * Mock KYC Adapter for testing
 */
export class MockKYCAdapter implements KYCProviderAdapter {
  readonly providerName = 'mock';

  private applicants = new Map<string, KYCApplicant>();
  private sessions = new Map<string, KYCSession>();
  private statuses = new Map<string, KYCStatus>();

  async createApplicant(params: CreateApplicantParams): Promise<KYCApplicant> {
    const applicant: KYCApplicant = {
      id: crypto.randomUUID(),
      externalId: params.externalId,
      email: params.email,
      phone: params.phone,
      firstName: params.firstName,
      lastName: params.lastName,
      dateOfBirth: params.dateOfBirth,
      nationality: params.nationality,
      country: params.country,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.applicants.set(applicant.id, applicant);
    this.applicants.set(params.externalId, applicant);
    this.statuses.set(applicant.id, 'NOT_STARTED');

    return applicant;
  }

  async getApplicant(applicantId: string): Promise<KYCApplicant | null> {
    return this.applicants.get(applicantId) || null;
  }

  async getApplicantByExternalId(externalId: string): Promise<KYCApplicant | null> {
    return this.applicants.get(externalId) || null;
  }

  async createSession(params: CreateSessionParams): Promise<KYCSession> {
    const session: KYCSession = {
      id: crypto.randomUUID(),
      applicantId: params.applicantId,
      level: params.level,
      status: 'PENDING',
      accessToken: `mock_token_${crypto.randomUUID()}`,
      accessUrl: `https://mock-kyc.example.com/verify?token=${crypto.randomUUID()}`,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      provider: this.providerName,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.sessions.set(session.id, session);
    this.statuses.set(params.applicantId, 'PENDING');

    return session;
  }

  async getVerificationResult(applicantId: string): Promise<KYCVerificationResult> {
    const status = this.statuses.get(applicantId) || 'NOT_STARTED';

    return {
      applicantId,
      status,
      level: 'STANDARD',
      verified: status === 'APPROVED',
      checks: [
        {
          id: crypto.randomUUID(),
          type: 'document_verification',
          status: status === 'APPROVED' ? 'passed' : 'pending',
          createdAt: new Date(),
        },
        {
          id: crypto.randomUUID(),
          type: 'facial_similarity',
          status: status === 'APPROVED' ? 'passed' : 'pending',
          createdAt: new Date(),
        },
      ],
      documents: [
        {
          id: crypto.randomUUID(),
          type: 'PASSPORT',
          status: status === 'APPROVED' ? 'approved' : 'pending',
          country: 'UAE',
        },
      ],
      verifiedAt: status === 'APPROVED' ? new Date() : undefined,
    };
  }

  async getStatus(applicantId: string): Promise<KYCStatus> {
    return this.statuses.get(applicantId) || 'NOT_STARTED';
  }

  validateWebhook(_payload: string, _signature: string): boolean {
    return true;
  }

  parseWebhookEvent(payload: string): WebhookEvent {
    const data = JSON.parse(payload);
    return {
      id: data.id || crypto.randomUUID(),
      type: data.type || 'mock_event',
      applicantId: data.applicantId || '',
      timestamp: new Date(),
      payload: data,
    };
  }

  async resetApplicant(applicantId: string): Promise<void> {
    this.statuses.set(applicantId, 'NOT_STARTED');
  }

  async healthCheck(): Promise<{ healthy: boolean; latencyMs: number }> {
    return { healthy: true, latencyMs: 1 };
  }

  // Test helpers
  setStatus(applicantId: string, status: KYCStatus): void {
    this.statuses.set(applicantId, status);
  }

  approveApplicant(applicantId: string): void {
    this.statuses.set(applicantId, 'APPROVED');
  }

  rejectApplicant(applicantId: string): void {
    this.statuses.set(applicantId, 'REJECTED');
  }
}

/**
 * Create a KYC provider adapter based on configuration
 */
export function createKYCProvider(
  type: KYCProviderType,
  config: KYCProviderConfig
): KYCProviderAdapter {
  switch (type) {
    case 'sumsub':
      if (!config.sumsub) {
        throw new Error('SumSub configuration required');
      }
      return new SumSubAdapter(config.sumsub);

    case 'onfido':
      if (!config.onfido) {
        throw new Error('Onfido configuration required');
      }
      return new OnfidoAdapter(config.onfido);

    case 'mock':
      return new MockKYCAdapter();

    default:
      throw new Error(`Unknown KYC provider: ${type}`);
  }
}

/**
 * Get default KYC provider from environment
 */
export function getDefaultKYCProvider(): KYCProviderAdapter {
  const provider = process.env.KYC_PROVIDER as KYCProviderType || 'mock';

  const config: KYCProviderConfig = {
    sumsub: process.env.SUMSUB_APP_TOKEN
      ? {
          appToken: process.env.SUMSUB_APP_TOKEN,
          secretKey: process.env.SUMSUB_SECRET_KEY || '',
          baseUrl: process.env.SUMSUB_BASE_URL,
        }
      : undefined,
    onfido: process.env.ONFIDO_API_TOKEN
      ? {
          apiToken: process.env.ONFIDO_API_TOKEN,
          webhookToken: process.env.ONFIDO_WEBHOOK_TOKEN,
          region: (process.env.ONFIDO_REGION as 'us' | 'eu' | 'ca') || 'us',
        }
      : undefined,
  };

  return createKYCProvider(provider, config);
}
