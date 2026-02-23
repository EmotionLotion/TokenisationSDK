/**
 * DocuSign Connector
 *
 * Integration with DocuSign eSignature API for document signing workflows.
 * Supports JWT authentication, envelope creation, embedded signing, and webhooks.
 */

import {
  SigningProvider,
  SigningRequest,
  SigningResult,
  SignedDocument,
  CompletionCertificate,
  SigningError,
  SignerWithTabs,
  SignatureTab,
  EnvelopeStatus,
  SignerStatus,
} from './types.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * DocuSign environment
 */
export type DocuSignEnvironment = 'demo' | 'production';

/**
 * DocuSign connector configuration
 */
export interface DocuSignConfig {
  /** Integration key (client ID) from DocuSign */
  integrationKey: string;
  /** DocuSign account ID */
  accountId: string;
  /** Environment (demo or production) */
  environment: DocuSignEnvironment;
  /** RSA private key for JWT auth (PEM format) */
  privateKey: string;
  /** User ID for impersonation */
  userId: string;
  /** OAuth scopes (default: signature, impersonation) */
  scopes?: string[];
}

// ============================================================================
// DOCUSIGN API TYPES
// ============================================================================

interface DocuSignAccessToken {
  access_token: string;
  token_type: string;
  expires_in: number;
  expiresAt: number;
}

interface DocuSignEnvelope {
  envelopeId: string;
  status: string;
  statusDateTime: string;
  sentDateTime?: string;
  completedDateTime?: string;
  voidedDateTime?: string;
  voidedReason?: string;
  emailSubject?: string;
  recipients?: {
    signers?: Array<{
      email: string;
      name: string;
      status: string;
      signedDateTime?: string;
      declinedReason?: string;
    }>;
  };
}

interface DocuSignRecipientView {
  url: string;
}

// ============================================================================
// CONNECTOR IMPLEMENTATION
// ============================================================================

/**
 * DocuSign eSignature connector
 *
 * @example
 * ```typescript
 * const docusign = new DocuSignConnector({
 *   integrationKey: 'your-integration-key',
 *   accountId: 'your-account-id',
 *   environment: 'demo',
 *   privateKey: fs.readFileSync('private.key', 'utf-8'),
 *   userId: 'user-guid',
 * });
 *
 * // Create signing envelope
 * const result = await docusign.createEnvelope({
 *   documents: [{
 *     documentId: 'doc1',
 *     name: 'Investment Agreement',
 *     format: 'pdf',
 *     content: pdfBuffer,
 *   }],
 *   signers: [{
 *     email: 'investor@example.com',
 *     name: 'John Investor',
 *     role: 'investor',
 *     tabs: [{
 *       type: 'signature',
 *       pageNumber: 1,
 *       xPosition: 100,
 *       yPosition: 700,
 *     }],
 *   }],
 *   subject: 'Please sign your investment agreement',
 * });
 *
 * console.log('Envelope ID:', result.envelopeId);
 * ```
 */
export class DocuSignConnector implements SigningProvider {
  readonly name = 'docusign';

  private config: DocuSignConfig;
  private baseUrl: string;
  private authUrl: string;
  private accessToken: DocuSignAccessToken | null = null;

  constructor(config: DocuSignConfig) {
    this.config = {
      ...config,
      scopes: config.scopes || ['signature', 'impersonation'],
    };

    // Set URLs based on environment
    if (config.environment === 'production') {
      this.baseUrl = 'https://na4.docusign.net/restapi';
      this.authUrl = 'https://account.docusign.com';
    } else {
      this.baseUrl = 'https://demo.docusign.net/restapi';
      this.authUrl = 'https://account-d.docusign.com';
    }
  }

  // ============================================================================
  // AUTHENTICATION
  // ============================================================================

  /**
   * Get or refresh access token using JWT grant
   */
  private async getAccessToken(): Promise<string> {
    // Check if we have a valid token
    if (this.accessToken && Date.now() < this.accessToken.expiresAt - 60000) {
      return this.accessToken.access_token;
    }

    try {
      // Create JWT assertion
      const jwt = await this.createJwtAssertion();

      // Exchange JWT for access token
      const response = await fetch(`${this.authUrl}/oauth/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
          assertion: jwt,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Authentication failed: ${response.status} - ${errorText}`);
      }

      const data = await response.json();

      this.accessToken = {
        ...data,
        expiresAt: Date.now() + (data.expires_in * 1000),
      };

      return this.accessToken!.access_token;
    } catch (error) {
      throw new SigningError(
        `DocuSign authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'docusign',
        'AUTH_FAILED',
        error
      );
    }
  }

  /**
   * Create JWT assertion for OAuth
   */
  private async createJwtAssertion(): Promise<string> {
    const crypto = await import('crypto');

    const header = {
      alg: 'RS256',
      typ: 'JWT',
    };

    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: this.config.integrationKey,
      sub: this.config.userId,
      aud: this.authUrl.replace('https://', ''),
      iat: now,
      exp: now + 3600,
      scope: this.config.scopes!.join(' '),
    };

    const headerEncoded = this.base64UrlEncode(JSON.stringify(header));
    const payloadEncoded = this.base64UrlEncode(JSON.stringify(payload));

    const signatureInput = `${headerEncoded}.${payloadEncoded}`;
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(signatureInput);
    const signature = sign.sign(this.config.privateKey);
    const signatureEncoded = this.base64UrlEncode(signature);

    return `${headerEncoded}.${payloadEncoded}.${signatureEncoded}`;
  }

  /**
   * Base64 URL encode
   */
  private base64UrlEncode(data: string | Buffer): string {
    const base64 = typeof data === 'string'
      ? Buffer.from(data).toString('base64')
      : data.toString('base64');

    return base64
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  /**
   * Make authenticated API request
   */
  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const token = await this.getAccessToken();
    const url = `${this.baseUrl}/v2.1/accounts/${this.config.accountId}${path}`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { message: errorText };
      }

      throw new SigningError(
        `DocuSign API error: ${response.status} - ${errorData.message || errorText}`,
        'docusign',
        errorData.errorCode,
        errorData
      );
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return {} as T;
    }

    return response.json();
  }

  // ============================================================================
  // PUBLIC METHODS
  // ============================================================================

  /**
   * Create a new signing envelope
   */
  async createEnvelope(request: SigningRequest): Promise<SigningResult> {
    try {
      // Build envelope definition
      const envelopeDefinition = this.buildEnvelopeDefinition(request);

      // Create envelope via API
      const envelope = await this.request<DocuSignEnvelope>(
        'POST',
        '/envelopes',
        envelopeDefinition
      );

      return this.mapEnvelopeToResult(envelope);
    } catch (error) {
      if (error instanceof SigningError) throw error;

      throw new SigningError(
        `Failed to create envelope: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'docusign',
        'CREATE_FAILED',
        error
      );
    }
  }

  /**
   * Get envelope status
   */
  async getStatus(envelopeId: string): Promise<SigningResult> {
    try {
      const envelope = await this.request<DocuSignEnvelope>(
        'GET',
        `/envelopes/${envelopeId}?include=recipients`
      );

      return this.mapEnvelopeToResult(envelope);
    } catch (error) {
      if (error instanceof SigningError) throw error;

      throw new SigningError(
        `Failed to get envelope status: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'docusign',
        'GET_STATUS_FAILED',
        error
      );
    }
  }

  /**
   * Get embedded signing URL for a recipient
   */
  async getSigningUrl(
    envelopeId: string,
    signerEmail: string,
    returnUrl: string
  ): Promise<string> {
    try {
      // First get the recipient ID
      const envelope = await this.request<DocuSignEnvelope>(
        'GET',
        `/envelopes/${envelopeId}?include=recipients`
      );

      const signer = envelope.recipients?.signers?.find(
        s => s.email.toLowerCase() === signerEmail.toLowerCase()
      );

      if (!signer) {
        throw new SigningError(
          `Signer not found: ${signerEmail}`,
          'docusign',
          'SIGNER_NOT_FOUND'
        );
      }

      // Create recipient view
      const view = await this.request<DocuSignRecipientView>(
        'POST',
        `/envelopes/${envelopeId}/views/recipient`,
        {
          authenticationMethod: 'email',
          email: signerEmail,
          userName: signer.name,
          returnUrl,
          clientUserId: signerEmail, // For embedded signing
        }
      );

      return view.url;
    } catch (error) {
      if (error instanceof SigningError) throw error;

      throw new SigningError(
        `Failed to get signing URL: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'docusign',
        'GET_URL_FAILED',
        error
      );
    }
  }

  /**
   * Download signed documents
   */
  async downloadSigned(envelopeId: string): Promise<SignedDocument[]> {
    try {
      // Get envelope documents list
      const docsResponse = await this.request<{ envelopeDocuments: Array<{ documentId: string; name: string }> }>(
        'GET',
        `/envelopes/${envelopeId}/documents`
      );

      const documents: SignedDocument[] = [];

      // Download each document
      for (const doc of docsResponse.envelopeDocuments) {
        // Skip certificate and summary
        if (doc.documentId === 'certificate' || doc.documentId === 'summary') {
          continue;
        }

        const token = await this.getAccessToken();
        const url = `${this.baseUrl}/v2.1/accounts/${this.config.accountId}/envelopes/${envelopeId}/documents/${doc.documentId}`;

        const response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error(`Failed to download document ${doc.documentId}`);
        }

        const buffer = Buffer.from(await response.arrayBuffer());

        documents.push({
          documentId: doc.documentId,
          name: doc.name,
          content: buffer,
          contentType: 'application/pdf',
        });
      }

      return documents;
    } catch (error) {
      if (error instanceof SigningError) throw error;

      throw new SigningError(
        `Failed to download documents: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'docusign',
        'DOWNLOAD_FAILED',
        error
      );
    }
  }

  /**
   * Download completion certificate
   */
  async downloadCertificate(envelopeId: string): Promise<CompletionCertificate> {
    try {
      const token = await this.getAccessToken();
      const url = `${this.baseUrl}/v2.1/accounts/${this.config.accountId}/envelopes/${envelopeId}/documents/certificate`;

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to download certificate');
      }

      const buffer = Buffer.from(await response.arrayBuffer());

      return {
        content: buffer,
        contentType: 'application/pdf',
      };
    } catch (error) {
      if (error instanceof SigningError) throw error;

      throw new SigningError(
        `Failed to download certificate: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'docusign',
        'CERTIFICATE_FAILED',
        error
      );
    }
  }

  /**
   * Void an envelope
   */
  async voidEnvelope(envelopeId: string, reason: string): Promise<void> {
    try {
      await this.request(
        'PUT',
        `/envelopes/${envelopeId}`,
        {
          status: 'voided',
          voidedReason: reason,
        }
      );
    } catch (error) {
      if (error instanceof SigningError) throw error;

      throw new SigningError(
        `Failed to void envelope: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'docusign',
        'VOID_FAILED',
        error
      );
    }
  }

  /**
   * Resend notifications
   */
  async resendNotification(envelopeId: string, signerEmail?: string): Promise<void> {
    try {
      await this.request(
        'PUT',
        `/envelopes/${envelopeId}?resend_envelope=true`,
        {}
      );
    } catch (error) {
      if (error instanceof SigningError) throw error;

      throw new SigningError(
        `Failed to resend notification: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'docusign',
        'RESEND_FAILED',
        error
      );
    }
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  /**
   * Build DocuSign envelope definition from signing request
   */
  private buildEnvelopeDefinition(request: SigningRequest): Record<string, unknown> {
    const definition: Record<string, unknown> = {
      status: request.status || 'sent',
      emailSubject: request.subject || 'Please sign this document',
      emailBlurb: request.message,
    };

    // Add documents
    definition.documents = request.documents.map((doc, index) => ({
      documentId: doc.documentId || String(index + 1),
      name: doc.name,
      fileExtension: doc.format,
      documentBase64: typeof doc.content === 'string'
        ? doc.content
        : doc.content.toString('base64'),
      order: doc.order || index + 1,
    }));

    // Add recipients
    definition.recipients = {
      signers: request.signers.map((signer, index) => this.buildSignerDefinition(signer, index)),
    };

    // Add expiration
    if (request.expiresInDays) {
      definition.notification = {
        expirations: {
          expireEnabled: 'true',
          expireAfter: request.expiresInDays,
          expireWarn: Math.min(3, request.expiresInDays - 1),
        },
      };
    }

    // Add reminders
    if (request.reminders) {
      definition.notification = {
        ...definition.notification as object,
        reminders: {
          reminderEnabled: 'true',
          reminderDelay: request.reminders.reminderDelay,
          reminderFrequency: request.reminders.reminderFrequency,
        },
      };
    }

    // Add custom fields for metadata
    if (request.metadata || request.referenceId) {
      definition.customFields = {
        textCustomFields: [
          ...(request.referenceId ? [{
            name: 'referenceId',
            value: request.referenceId,
            show: 'false',
          }] : []),
          ...(request.metadata ? Object.entries(request.metadata).map(([name, value]) => ({
            name,
            value: String(value),
            show: 'false',
          })) : []),
        ],
      };
    }

    return definition;
  }

  /**
   * Build signer definition
   */
  private buildSignerDefinition(signer: SignerWithTabs, index: number): Record<string, unknown> {
    const signerDef: Record<string, unknown> = {
      email: signer.email,
      name: signer.name,
      recipientId: signer.id || String(index + 1),
      routingOrder: signer.routingOrder || index + 1,
      clientUserId: signer.email, // Enable embedded signing
    };

    // Add tabs if provided
    if (signer.tabs && signer.tabs.length > 0) {
      signerDef.tabs = this.buildTabs(signer.tabs);
    }

    return signerDef;
  }

  /**
   * Build tabs definition
   */
  private buildTabs(tabs: SignatureTab[]): Record<string, Array<Record<string, unknown>>> {
    const tabsByType: Record<string, Array<Record<string, unknown>>> = {
      signHereTabs: [],
      initialHereTabs: [],
      dateSignedTabs: [],
      textTabs: [],
      checkboxTabs: [],
    };

    for (const tab of tabs) {
      const tabDef: Record<string, unknown> = {
        documentId: '1',
        pageNumber: tab.pageNumber,
        xPosition: tab.xPosition,
        yPosition: tab.yPosition,
      };

      if (tab.width) tabDef.width = tab.width;
      if (tab.height) tabDef.height = tab.height;
      if (tab.required !== undefined) tabDef.required = tab.required ? 'true' : 'false';

      if (tab.anchorString) {
        tabDef.anchorString = tab.anchorString;
        tabDef.anchorUnits = 'pixels';
        if (tab.anchorOffset) {
          tabDef.anchorXOffset = tab.anchorOffset.x;
          tabDef.anchorYOffset = tab.anchorOffset.y;
        }
      }

      switch (tab.type) {
        case 'signature':
          tabsByType.signHereTabs.push(tabDef);
          break;
        case 'initial':
          tabsByType.initialHereTabs.push(tabDef);
          break;
        case 'date':
          tabsByType.dateSignedTabs.push(tabDef);
          break;
        case 'text':
          tabDef.tabLabel = tab.label || 'text';
          if (tab.defaultValue) tabDef.value = tab.defaultValue;
          tabsByType.textTabs.push(tabDef);
          break;
        case 'checkbox':
          tabDef.tabLabel = tab.label || 'checkbox';
          if (tab.defaultValue === 'true') tabDef.selected = 'true';
          tabsByType.checkboxTabs.push(tabDef);
          break;
      }
    }

    // Remove empty arrays
    return Object.fromEntries(
      Object.entries(tabsByType).filter(([_, arr]) => arr.length > 0)
    );
  }

  /**
   * Map DocuSign envelope to signing result
   */
  private mapEnvelopeToResult(envelope: DocuSignEnvelope): SigningResult {
    const signers: SignerStatus[] = envelope.recipients?.signers?.map(s => ({
      email: s.email,
      name: s.name,
      status: this.mapSignerStatus(s.status),
      signedAt: s.signedDateTime,
      declineReason: s.declinedReason,
    })) || [];

    return {
      envelopeId: envelope.envelopeId,
      status: this.mapEnvelopeStatus(envelope.status),
      signers,
      createdAt: envelope.statusDateTime,
    };
  }

  /**
   * Map DocuSign status to our status
   */
  private mapEnvelopeStatus(dsStatus: string): EnvelopeStatus {
    const mapping: Record<string, EnvelopeStatus> = {
      created: 'created',
      sent: 'sent',
      delivered: 'delivered',
      signed: 'signed',
      completed: 'completed',
      declined: 'declined',
      voided: 'voided',
      deleted: 'deleted',
    };

    return mapping[dsStatus.toLowerCase()] || 'created';
  }

  /**
   * Map signer status
   */
  private mapSignerStatus(dsStatus: string): SignerStatus['status'] {
    const mapping: Record<string, SignerStatus['status']> = {
      created: 'pending',
      sent: 'sent',
      delivered: 'delivered',
      signed: 'signed',
      completed: 'signed',
      declined: 'declined',
    };

    return mapping[dsStatus.toLowerCase()] || 'pending';
  }
}

export default DocuSignConnector;
