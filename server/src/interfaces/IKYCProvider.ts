/**
 * IKYCProvider - Server-side interface for KYC/AML verification providers
 *
 * Provides integration points with identity verification services for:
 * - Identity verification initiation
 * - Verification status tracking
 * - Document submission
 * - Webhook processing
 *
 * Examples: Onfido, Jumio, Sumsub, Persona
 */

// ============================================================================
// Types
// ============================================================================

/**
 * KYC verification levels
 */
export type KYCLevel =
  | 'none'
  | 'basic'           // Email, phone verification
  | 'standard'        // + ID document, selfie
  | 'enhanced'        // + Proof of address, source of funds
  | 'institutional';  // Full institutional onboarding

/**
 * KYC verification status
 */
export type KYCStatusType =
  | 'not_started'
  | 'pending'
  | 'in_review'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'requires_action';

/**
 * Document types supported
 */
export type DocumentType =
  | 'passport'
  | 'national_id'
  | 'driving_license'
  | 'residence_permit'
  | 'selfie'
  | 'proof_of_address'
  | 'bank_statement'
  | 'tax_return'
  | 'incorporation_certificate'
  | 'shareholder_registry'
  | 'other';

/**
 * Initiate verification parameters
 */
export interface InitiateParams {
  /** Subject/user identifier */
  subjectId: string;
  /** Verification level requested */
  level: KYCLevel;
  /** Pre-filled user data */
  prefill?: {
    email?: string;
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
  };
  /** Redirect URL after verification */
  redirectUrl?: string;
  /** Webhook URL for status updates */
  webhookUrl?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * KYC session information
 */
export interface KYCSession {
  /** Session/verification ID */
  sessionId: string;
  /** Subject ID */
  subjectId: string;
  /** Verification level */
  level: KYCLevel;
  /** Current status */
  status: KYCStatusType;
  /** URL for user to complete verification */
  verificationUrl: string;
  /** SDK token for embedded verification */
  sdkToken?: string;
  /** Session expiry */
  expiresAt: string;
  /** Created timestamp */
  createdAt: string;
}

/**
 * Detailed KYC status
 */
export interface KYCStatus {
  /** Session/verification ID */
  sessionId: string;
  /** Subject ID */
  subjectId: string;
  /** Verification level */
  level: KYCLevel;
  /** Current status */
  status: KYCStatusType;
  /** Overall result */
  result?: 'clear' | 'consider' | 'reject';
  /** Verified data */
  verifiedData?: {
    firstName?: string;
    lastName?: string;
    dateOfBirth?: string;
    nationality?: string;
    documentNumber?: string;
    documentType?: string;
    documentExpiry?: string;
    address?: {
      street?: string;
      city?: string;
      state?: string;
      postalCode?: string;
      country?: string;
    };
  };
  /** Check results */
  checks?: Array<{
    type: string;
    status: 'pending' | 'complete';
    result: 'clear' | 'consider' | 'reject';
    reasons?: string[];
  }>;
  /** Actions required from user */
  requiredActions?: string[];
  /** Rejection reasons */
  rejectionReasons?: string[];
  /** Completed timestamp */
  completedAt?: string;
  /** Expiry of verification */
  expiresAt?: string;
  /** Provider-specific data */
  providerData?: Record<string, unknown>;
}

/**
 * Document submission parameters
 */
export interface DocumentParams {
  /** Session ID */
  sessionId: string;
  /** Document type */
  documentType: DocumentType;
  /** Document side (front/back) */
  side?: 'front' | 'back';
  /** Document content (base64) */
  content: string;
  /** Content type (mime) */
  contentType: string;
  /** Filename */
  filename?: string;
}

/**
 * Document submission result
 */
export interface DocumentResult {
  /** Document ID */
  documentId: string;
  /** Document type */
  documentType: DocumentType;
  /** Upload status */
  status: 'uploaded' | 'processing' | 'accepted' | 'rejected';
  /** Rejection reason */
  rejectionReason?: string;
  /** Uploaded timestamp */
  uploadedAt: string;
}

/**
 * Webhook processing result
 */
export interface WebhookResult {
  /** Session/verification ID */
  sessionId: string;
  /** Subject ID */
  subjectId: string;
  /** Event type */
  eventType: string;
  /** New status (if status change) */
  newStatus?: KYCStatusType;
  /** Whether this is a final result */
  isFinal: boolean;
  /** Timestamp */
  timestamp: string;
}

/**
 * Sanctions screening result
 */
export interface SanctionsResult {
  /** Subject ID */
  subjectId: string;
  /** Screening status */
  status: 'clear' | 'potential_match' | 'confirmed_match';
  /** Potential matches */
  matches?: Array<{
    listName: string;
    matchScore: number;
    entityName: string;
    entityType: 'individual' | 'entity';
    listType: 'sanctions' | 'pep' | 'watchlist' | 'adverse_media';
    details?: string;
  }>;
  /** Screening timestamp */
  screenedAt: string;
}

// ============================================================================
// Interface
// ============================================================================

/**
 * IKYCProvider - Interface for KYC/AML provider integrations
 */
export interface IKYCProvider {
  /** Provider identifier */
  readonly providerId: string;

  /** Provider name for display */
  readonly providerName: string;

  /** Supported verification levels */
  readonly supportedLevels: KYCLevel[];

  /**
   * Initiate a verification session
   * @param params Initiation parameters
   * @returns KYC session
   */
  initiateVerification(params: InitiateParams): Promise<KYCSession>;

  /**
   * Get verification status
   * @param sessionId Session identifier
   * @returns KYC status
   */
  getVerificationStatus(sessionId: string): Promise<KYCStatus>;

  /**
   * Get latest verification for a subject
   * @param subjectId Subject identifier
   * @returns KYC status or null
   */
  getSubjectVerification(subjectId: string): Promise<KYCStatus | null>;

  /**
   * Submit a document
   * @param params Document parameters
   * @returns Document result
   */
  submitDocument(params: DocumentParams): Promise<DocumentResult>;

  /**
   * Process incoming webhook
   * @param payload Webhook payload
   * @param signature Webhook signature for verification
   * @returns Webhook processing result
   */
  processWebhook(payload: unknown, signature: string): Promise<WebhookResult>;

  /**
   * Run sanctions screening
   * @param subjectId Subject identifier
   * @param fullName Subject's full name
   * @param dateOfBirth Optional date of birth
   * @param country Optional country
   * @returns Sanctions result
   */
  screenSanctions(
    subjectId: string,
    fullName: string,
    dateOfBirth?: string,
    country?: string
  ): Promise<SanctionsResult>;

  /**
   * Check if provider is available
   * @returns Health status
   */
  healthCheck(): Promise<boolean>;
}
