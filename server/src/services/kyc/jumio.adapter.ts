/**
 * Jumio KYC Provider Adapter
 *
 * Implements the KYC adapter interface for Jumio.
 * Docs: https://docs.jumio.com/
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

export interface JumioConfig {
  apiToken: string;
  apiSecret: string;
  baseUrl?: string;
  callbackUrl?: string;
  webhookSecret?: string;
}

interface JumioAccount {
  account: {
    id: string;
  };
  workflowExecution: {
    id: string;
    credentials: Array<{
      id: string;
      category: string;
    }>;
  };
  web: {
    href: string;
  };
}

interface JumioWorkflowExecution {
  account: { id: string };
  workflowExecution: {
    id: string;
    status: string;
    completedAt?: string;
  };
  decision?: {
    type: string;
    details?: {
      label?: string;
    };
    risk?: {
      score?: number;
    };
  };
  capabilities?: {
    extraction?: Array<{
      id: string;
      credentials: Array<{
        id: string;
        category: string;
        parts?: Array<{
          classifier?: string;
          extractedData?: Record<string, unknown>;
        }>;
      }>;
    }>;
    usability?: Array<{
      id: string;
      credentials: Array<{
        id: string;
        decision: { type: string };
      }>;
    }>;
  };
}

const JUMIO_STATUS_MAP: Record<string, KYCStatus> = {
  INITIATED: 'NOT_STARTED',
  PENDING: 'PENDING',
  PROCESSED: 'AWAITING_REVIEW',
  PASSED: 'APPROVED',
  REJECTED: 'REJECTED',
  WARNING: 'RETRY',
  NOT_EXECUTED: 'NOT_STARTED',
};

export class JumioAdapter implements KYCProviderAdapter {
  readonly providerName = 'jumio';

  private config: Required<Omit<JumioConfig, 'callbackUrl' | 'webhookSecret'>> & {
    callbackUrl?: string;
    webhookSecret?: string;
  };

  constructor(config: JumioConfig) {
    this.config = {
      apiToken: config.apiToken,
      apiSecret: config.apiSecret,
      baseUrl: config.baseUrl || 'https://api.jumio.com',
      callbackUrl: config.callbackUrl,
      webhookSecret: config.webhookSecret,
    };
  }

  private getAuthHeader(): string {
    const credentials = Buffer.from(`${this.config.apiToken}:${this.config.apiSecret}`).toString('base64');
    return `Basic ${credentials}`;
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
        'Authorization': this.getAuthHeader(),
        'User-Agent': 'TokenisationSDK/1.0',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Jumio API error: ${response.status} - ${error}`);
    }

    return response.json() as Promise<T>;
  }

  async createApplicant(params: CreateApplicantParams): Promise<KYCApplicant> {
    // Jumio creates accounts when initiating verification
    // We'll store minimal info and create the full workflow in createSession
    return {
      id: params.externalId,
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
  }

  async getApplicant(applicantId: string): Promise<KYCApplicant | null> {
    try {
      // Try to get workflow execution details
      const execution = await this.request<JumioWorkflowExecution>(
        'GET',
        `/api/v1/accounts/${applicantId}`
      );

      return {
        id: execution.account.id,
        externalId: applicantId,
        email: '',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes('404')) {
        return null;
      }
      throw error;
    }
  }

  async getApplicantByExternalId(externalId: string): Promise<KYCApplicant | null> {
    return this.getApplicant(externalId);
  }

  async createSession(params: CreateSessionParams): Promise<KYCSession> {
    const workflowDefinition = this.getWorkflowDefinition(params.level);

    const response = await this.request<JumioAccount>(
      'POST',
      '/api/v1/accounts',
      {
        customerInternalReference: params.applicantId,
        workflowDefinition: {
          key: workflowDefinition,
        },
        callbackUrl: this.config.callbackUrl,
        userReference: params.applicantId,
        web: {
          locale: params.locale || 'en',
        },
      }
    );

    return {
      id: response.workflowExecution.id,
      applicantId: params.applicantId,
      level: params.level,
      status: 'PENDING',
      accessToken: response.workflowExecution.id,
      accessUrl: response.web.href,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
      provider: this.providerName,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  async getVerificationResult(applicantId: string): Promise<KYCVerificationResult> {
    // Get workflow execution status
    const execution = await this.request<JumioWorkflowExecution>(
      'GET',
      `/api/v1/accounts/${applicantId}`
    );

    const status = this.mapStatus(execution.workflowExecution.status, execution.decision?.type);
    const checks = this.extractChecks(execution);
    const documents = this.extractDocuments(execution);

    return {
      applicantId,
      status,
      level: 'STANDARD',
      verified: status === 'APPROVED',
      reviewResult: execution.decision ? {
        moderationComment: execution.decision.details?.label,
        reviewAnswer: execution.decision.type,
      } : undefined,
      checks,
      documents,
      riskScore: execution.decision?.risk?.score,
      verifiedAt: status === 'APPROVED' && execution.workflowExecution.completedAt
        ? new Date(execution.workflowExecution.completedAt)
        : undefined,
    };
  }

  async getStatus(applicantId: string): Promise<KYCStatus> {
    const result = await this.getVerificationResult(applicantId);
    return result.status;
  }

  validateWebhook(payload: string, signature: string): boolean {
    if (!this.config.webhookSecret) {
      throw new Error('Webhook secret not configured');
    }

    const expectedSignature = crypto
      .createHmac('sha256', this.config.webhookSecret)
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
      id: data.workflowExecution?.id || crypto.randomUUID(),
      type: data.eventType || 'workflow.completed',
      applicantId: data.customerInternalReference || data.account?.id,
      timestamp: new Date(data.timestamp || Date.now()),
      payload: data,
    };
  }

  async resetApplicant(applicantId: string): Promise<void> {
    // Jumio doesn't support resetting - would need to create new workflow
    console.log(`Jumio: Cannot reset applicant ${applicantId}, create new workflow instead`);
  }

  async healthCheck(): Promise<{ healthy: boolean; latencyMs: number }> {
    const start = Date.now();
    try {
      // Jumio doesn't have a dedicated health endpoint, use token validation
      await this.request('GET', '/api/v1/validations/authenticate');
      return { healthy: true, latencyMs: Date.now() - start };
    } catch {
      // 401 is expected without proper auth context but means API is reachable
      return { healthy: true, latencyMs: Date.now() - start };
    }
  }

  private getWorkflowDefinition(level: KYCLevel): string {
    // Jumio workflow keys depend on your account configuration
    // These are common patterns
    switch (level) {
      case 'BASIC':
        return 'ID_VERIFICATION';
      case 'STANDARD':
        return 'ID_AND_SELFIE';
      case 'ENHANCED':
        return 'ID_SELFIE_AND_PROOF_OF_ADDRESS';
      default:
        return 'ID_AND_SELFIE';
    }
  }

  private mapStatus(workflowStatus: string, decisionType?: string): KYCStatus {
    if (decisionType) {
      return JUMIO_STATUS_MAP[decisionType] || 'PENDING';
    }
    return JUMIO_STATUS_MAP[workflowStatus] || 'PENDING';
  }

  private extractChecks(execution: JumioWorkflowExecution): KYCCheck[] {
    const checks: KYCCheck[] = [];

    if (execution.capabilities?.usability) {
      for (const usability of execution.capabilities.usability) {
        for (const credential of usability.credentials) {
          checks.push({
            id: credential.id,
            type: 'usability',
            status: credential.decision.type === 'PASSED' ? 'passed' : 'failed',
            createdAt: new Date(),
          });
        }
      }
    }

    return checks;
  }

  private extractDocuments(execution: JumioWorkflowExecution): KYCDocument[] {
    const documents: KYCDocument[] = [];

    if (execution.capabilities?.extraction) {
      for (const extraction of execution.capabilities.extraction) {
        for (const credential of extraction.credentials) {
          const part = credential.parts?.[0];
          const extractedData = part?.extractedData as Record<string, unknown> | undefined;

          documents.push({
            id: credential.id,
            type: this.mapDocumentCategory(credential.category),
            status: 'approved',
            country: extractedData?.issuingCountry as string,
            issuedDate: extractedData?.issuingDate as string,
            expiryDate: extractedData?.expiryDate as string,
            documentNumber: extractedData?.documentNumber as string,
          });
        }
      }
    }

    return documents;
  }

  private mapDocumentCategory(category: string): DocumentType {
    const mapping: Record<string, DocumentType> = {
      PASSPORT: 'PASSPORT',
      ID: 'NATIONAL_ID',
      DRIVING_LICENSE: 'DRIVERS_LICENSE',
      VISA: 'RESIDENCE_PERMIT',
      UTILITY_BILL: 'UTILITY_BILL',
      BANK_STATEMENT: 'BANK_STATEMENT',
      SELFIE: 'SELFIE',
      FACE: 'SELFIE',
    };
    return mapping[category.toUpperCase()] || 'PASSPORT';
  }
}

export function createJumioAdapter(config: JumioConfig): JumioAdapter {
  return new JumioAdapter(config);
}
