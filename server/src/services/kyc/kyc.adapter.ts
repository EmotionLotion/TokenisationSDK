/**
 * KYC Provider Adapter Interface
 *
 * Abstracts KYC provider implementations to allow easy switching
 * between SumSub, Onfido, and other providers.
 */

export type KYCLevel = 'BASIC' | 'STANDARD' | 'ENHANCED';

export type KYCStatus =
  | 'NOT_STARTED'
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'AWAITING_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'RETRY';

export type DocumentType =
  | 'PASSPORT'
  | 'NATIONAL_ID'
  | 'DRIVERS_LICENSE'
  | 'RESIDENCE_PERMIT'
  | 'UTILITY_BILL'
  | 'BANK_STATEMENT'
  | 'SELFIE';

export interface KYCApplicant {
  id: string;
  externalId: string;
  email: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
  nationality?: string;
  country?: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface KYCSession {
  id: string;
  applicantId: string;
  level: KYCLevel;
  status: KYCStatus;
  accessToken?: string;
  accessUrl?: string;
  expiresAt?: Date;
  provider: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface KYCVerificationResult {
  applicantId: string;
  status: KYCStatus;
  level: KYCLevel;
  verified: boolean;
  reviewResult?: {
    moderationComment?: string;
    rejectLabels?: string[];
    reviewAnswer?: string;
  };
  checks: KYCCheck[];
  documents: KYCDocument[];
  riskScore?: number;
  expiresAt?: Date;
  verifiedAt?: Date;
}

export interface KYCCheck {
  id: string;
  type: string;
  status: 'pending' | 'passed' | 'failed' | 'warning';
  result?: Record<string, unknown>;
  createdAt: Date;
}

export interface KYCDocument {
  id: string;
  type: DocumentType;
  status: 'pending' | 'approved' | 'rejected';
  country?: string;
  issuedDate?: string;
  expiryDate?: string;
  documentNumber?: string;
  rejectionReason?: string;
}

export interface WebhookEvent {
  id: string;
  type: string;
  applicantId: string;
  timestamp: Date;
  payload: Record<string, unknown>;
}

export interface CreateApplicantParams {
  externalId: string;
  email: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
  nationality?: string;
  country?: string;
  level?: KYCLevel;
}

export interface CreateSessionParams {
  applicantId: string;
  level: KYCLevel;
  redirectUrl?: string;
  locale?: string;
}

export interface KYCProviderAdapter {
  readonly providerName: string;

  /**
   * Create a new KYC applicant
   */
  createApplicant(params: CreateApplicantParams): Promise<KYCApplicant>;

  /**
   * Get applicant by ID
   */
  getApplicant(applicantId: string): Promise<KYCApplicant | null>;

  /**
   * Get applicant by external ID
   */
  getApplicantByExternalId(externalId: string): Promise<KYCApplicant | null>;

  /**
   * Create a verification session
   */
  createSession(params: CreateSessionParams): Promise<KYCSession>;

  /**
   * Get verification result
   */
  getVerificationResult(applicantId: string): Promise<KYCVerificationResult>;

  /**
   * Get verification status
   */
  getStatus(applicantId: string): Promise<KYCStatus>;

  /**
   * Validate webhook signature
   */
  validateWebhook(payload: string, signature: string): boolean;

  /**
   * Parse webhook event
   */
  parseWebhookEvent(payload: string): WebhookEvent;

  /**
   * Reset applicant for re-verification
   */
  resetApplicant(applicantId: string): Promise<void>;

  /**
   * Health check
   */
  healthCheck(): Promise<{ healthy: boolean; latencyMs: number }>;
}

/**
 * KYC Provider Factory
 */
export type KYCProviderType = 'sumsub' | 'onfido' | 'mock';

export interface KYCProviderConfig {
  sumsub?: {
    appToken: string;
    secretKey: string;
    baseUrl?: string;
    levelNameBasic?: string;
    levelNameStandard?: string;
    levelNameEnhanced?: string;
  };
  onfido?: {
    apiToken: string;
    baseUrl?: string;
    webhookToken?: string;
  };
}
