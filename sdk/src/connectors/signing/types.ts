/**
 * Document Signing Types
 *
 * Common types for document signing integrations (DocuSign, etc.)
 */

// ============================================================================
// DOCUMENT TYPES
// ============================================================================

/**
 * Document format types
 */
export type DocumentFormat = 'pdf' | 'docx' | 'html';

/**
 * Signer role in the signing process
 */
export type SignerRole =
  | 'investor'
  | 'issuer'
  | 'agent'
  | 'witness'
  | 'broker'
  | 'legal'
  | 'other';

/**
 * Recipient action type
 */
export type RecipientType =
  | 'signer'           // Must sign the document
  | 'carbon_copy'      // Receives a copy when complete
  | 'certified_delivery' // Must acknowledge receipt
  | 'in_person'        // Signs in person with agent
  | 'notary';          // Requires notarization

/**
 * Authentication method for signers
 */
export type AuthMethod =
  | 'none'
  | 'email'
  | 'phone'
  | 'sms'
  | 'knowledge_based'
  | 'id_verification';

// ============================================================================
// SIGNER & RECIPIENT TYPES
// ============================================================================

/**
 * Signer information for a signing request
 */
export interface Signer {
  /** Unique identifier for the signer */
  id?: string;
  /** Signer's email address */
  email: string;
  /** Signer's full name */
  name: string;
  /** Role in the signing process */
  role: SignerRole;
  /** Type of recipient */
  recipientType?: RecipientType;
  /** Routing order (lower = earlier) */
  routingOrder?: number;
  /** Authentication method */
  authMethod?: AuthMethod;
  /** Phone number for SMS/phone auth */
  phone?: string;
  /** Custom metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Signature tab/field position in the document
 */
export interface SignatureTab {
  /** Type of field */
  type: 'signature' | 'initial' | 'date' | 'text' | 'checkbox';
  /** Page number (1-indexed) */
  pageNumber: number;
  /** X position from left edge (points) */
  xPosition: number;
  /** Y position from top edge (points) */
  yPosition: number;
  /** Tab width (optional) */
  width?: number;
  /** Tab height (optional) */
  height?: number;
  /** Is this field required? */
  required?: boolean;
  /** Label for the field */
  label?: string;
  /** Default value (for text/checkbox) */
  defaultValue?: string;
  /** Anchor text for auto-positioning */
  anchorString?: string;
  /** Offset from anchor (if using anchor) */
  anchorOffset?: { x: number; y: number };
}

/**
 * Signer with tab positions
 */
export interface SignerWithTabs extends Signer {
  /** Signature/form tabs for this signer */
  tabs?: SignatureTab[];
}

// ============================================================================
// DOCUMENT TYPES
// ============================================================================

/**
 * Document to be signed
 */
export interface SigningDocument {
  /** Unique identifier for the document */
  documentId: string;
  /** Display name for the document */
  name: string;
  /** File extension/format */
  format: DocumentFormat;
  /** Document content (Buffer or base64 string) */
  content: Buffer | string;
  /** Order in the envelope (for multiple docs) */
  order?: number;
  /** File name for download */
  fileName?: string;
}

// ============================================================================
// REQUEST & RESULT TYPES
// ============================================================================

/**
 * Signing request to create an envelope
 */
export interface SigningRequest {
  /** Documents to be signed */
  documents: SigningDocument[];
  /** List of signers */
  signers: SignerWithTabs[];
  /** Subject line for email notifications */
  subject?: string;
  /** Email body message */
  message?: string;
  /** Send immediately or draft */
  status?: 'sent' | 'draft';
  /** Expiration in days */
  expiresInDays?: number;
  /** Reminder settings */
  reminders?: {
    /** Days until first reminder */
    reminderDelay: number;
    /** Days between reminders */
    reminderFrequency: number;
  };
  /** Webhook URL for status updates */
  webhookUrl?: string;
  /** Custom envelope metadata */
  metadata?: Record<string, unknown>;
  /** Reference ID for correlation */
  referenceId?: string;
}

/**
 * Envelope/signing session status
 */
export type EnvelopeStatus =
  | 'created'
  | 'sent'
  | 'delivered'
  | 'signed'
  | 'completed'
  | 'declined'
  | 'voided'
  | 'expired'
  | 'deleted';

/**
 * Individual signer status
 */
export interface SignerStatus {
  /** Signer email */
  email: string;
  /** Signer name */
  name: string;
  /** Signing status */
  status: 'pending' | 'sent' | 'delivered' | 'signed' | 'declined';
  /** When signature was completed */
  signedAt?: string;
  /** Decline reason if declined */
  declineReason?: string;
}

/**
 * Result from creating a signing envelope
 */
export interface SigningResult {
  /** Unique envelope ID from the provider */
  envelopeId: string;
  /** Current status */
  status: EnvelopeStatus;
  /** Embedded signing URL (if requested) */
  signingUrl?: string;
  /** Sender view URL */
  senderViewUrl?: string;
  /** Status of each signer */
  signers?: SignerStatus[];
  /** When the envelope was created */
  createdAt: string;
  /** When the envelope expires */
  expiresAt?: string;
  /** Custom metadata returned */
  metadata?: Record<string, unknown>;
}

/**
 * Signed document download result
 */
export interface SignedDocument {
  /** Document ID */
  documentId: string;
  /** Document name */
  name: string;
  /** Document content */
  content: Buffer;
  /** Content type */
  contentType: string;
  /** When it was signed */
  signedAt?: string;
}

/**
 * Certificate of completion
 */
export interface CompletionCertificate {
  /** Certificate content */
  content: Buffer;
  /** Content type */
  contentType: string;
}

// ============================================================================
// WEBHOOK TYPES
// ============================================================================

/**
 * Webhook event types
 */
export type SigningWebhookEvent =
  | 'envelope.sent'
  | 'envelope.delivered'
  | 'envelope.completed'
  | 'envelope.declined'
  | 'envelope.voided'
  | 'recipient.signed'
  | 'recipient.declined'
  | 'recipient.delivered';

/**
 * Webhook payload
 */
export interface SigningWebhookPayload {
  /** Event type */
  event: SigningWebhookEvent;
  /** Envelope ID */
  envelopeId: string;
  /** Current status */
  status: EnvelopeStatus;
  /** Timestamp */
  timestamp: string;
  /** Recipient info (for recipient events) */
  recipient?: {
    email: string;
    name: string;
    status: string;
  };
  /** Custom metadata */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// PROVIDER INTERFACE
// ============================================================================

/**
 * Common interface for signing providers
 */
export interface SigningProvider {
  /** Provider name */
  readonly name: string;

  /** Create a new signing envelope */
  createEnvelope(request: SigningRequest): Promise<SigningResult>;

  /** Get envelope status */
  getStatus(envelopeId: string): Promise<SigningResult>;

  /** Get embedded signing URL for a recipient */
  getSigningUrl(
    envelopeId: string,
    signerEmail: string,
    returnUrl: string
  ): Promise<string>;

  /** Download signed documents */
  downloadSigned(envelopeId: string): Promise<SignedDocument[]>;

  /** Download completion certificate */
  downloadCertificate(envelopeId: string): Promise<CompletionCertificate>;

  /** Void/cancel an envelope */
  voidEnvelope(envelopeId: string, reason: string): Promise<void>;

  /** Resend notifications */
  resendNotification(envelopeId: string, signerEmail?: string): Promise<void>;
}

// ============================================================================
// ERROR TYPES
// ============================================================================

/**
 * Error thrown by signing providers
 */
export class SigningError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly code?: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'SigningError';
  }
}
