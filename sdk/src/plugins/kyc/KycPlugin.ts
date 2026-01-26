/**
 * KYC Plugin for Tokenisation SDK
 *
 * Client-side KYC integration supporting multiple providers.
 * Handles verification session creation, status tracking, and webhook processing.
 */

import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Supported KYC providers
 */
export type KycProvider = 'sumsub' | 'onfido' | 'mock';

/**
 * Verification levels
 */
export enum VerificationLevel {
  /** Basic identity check */
  BASIC = 'BASIC',
  /** Standard KYC with document verification */
  STANDARD = 'STANDARD',
  /** Enhanced due diligence */
  ENHANCED = 'ENHANCED',
}

/**
 * Verification status
 */
export enum VerificationStatus {
  /** Not started */
  NOT_STARTED = 'NOT_STARTED',
  /** In progress */
  PENDING = 'PENDING',
  /** Awaiting review */
  REVIEW = 'REVIEW',
  /** Approved */
  APPROVED = 'APPROVED',
  /** Rejected */
  REJECTED = 'REJECTED',
  /** Expired (needs re-verification) */
  EXPIRED = 'EXPIRED',
}

/**
 * KYC session for user verification
 */
export interface KycSession {
  /** Unique session ID */
  sessionId: string;
  /** User ID in your system */
  userId: string;
  /** Associated wallet address */
  walletAddress?: string;
  /** Provider-specific session URL or token */
  url?: string;
  /** SDK access token (for embedded flows) */
  accessToken?: string;
  /** Session expiration time */
  expiresAt: string;
  /** Verification level */
  level: VerificationLevel;
  /** Provider being used */
  provider: KycProvider;
}

/**
 * Verification result
 */
export interface VerificationResult {
  /** User ID */
  userId: string;
  /** Current status */
  status: VerificationStatus;
  /** Verification level achieved */
  level?: VerificationLevel;
  /** Whether currently verified */
  verified: boolean;
  /** Verification expiry date */
  expiresAt?: string;
  /** Rejection reason if rejected */
  rejectionReason?: string;
  /** Provider reference ID */
  providerReferenceId?: string;
  /** Country of residence */
  country?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * KYC plugin configuration
 */
export interface KycPluginConfig {
  /** KYC provider to use */
  provider: KycProvider;
  /** Provider-specific configuration */
  providerConfig: {
    /** API base URL */
    baseUrl?: string;
    /** API key or app token */
    apiKey?: string;
    /** Secret key (for signed requests) */
    secretKey?: string;
    /** Webhook secret for verification */
    webhookSecret?: string;
  };
  /** Server endpoint for KYC operations */
  serverEndpoint?: string;
  /** Default verification level */
  defaultLevel?: VerificationLevel;
  /** Session TTL in seconds */
  sessionTtlSeconds?: number;
}

/**
 * Start verification request
 */
export interface StartVerificationRequest {
  /** User ID in your system */
  userId: string;
  /** User's wallet address */
  walletAddress?: string;
  /** Desired verification level */
  level?: VerificationLevel;
  /** User's email */
  email?: string;
  /** User's country (ISO 3166-1 alpha-2) */
  country?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
  /** Redirect URL after verification */
  redirectUrl?: string;
}

/**
 * Webhook event from KYC provider
 */
export interface KycWebhookEvent {
  /** Event type */
  type: 'verification.completed' | 'verification.rejected' | 'verification.expired';
  /** User ID */
  userId: string;
  /** Provider reference */
  providerReferenceId: string;
  /** Result status */
  status: VerificationStatus;
  /** Verification level */
  level?: VerificationLevel;
  /** Rejection reason */
  rejectionReason?: string;
  /** Country */
  country?: string;
  /** Timestamp */
  timestamp: string;
  /** Raw provider data */
  rawData?: unknown;
}

// ============================================================================
// KYC PLUGIN
// ============================================================================

/**
 * KYC Plugin for client-side KYC integration
 *
 * @example
 * ```typescript
 * const kyc = new KycPlugin({
 *   provider: 'sumsub',
 *   providerConfig: {
 *     apiKey: process.env.SUMSUB_API_KEY,
 *   },
 *   serverEndpoint: 'https://api.yourservice.com/kyc',
 * });
 *
 * // Start verification
 * const session = await kyc.startVerification({
 *   userId: 'user-123',
 *   walletAddress: '0x...',
 *   level: VerificationLevel.STANDARD,
 * });
 *
 * // Redirect user or open embedded widget
 * window.open(session.url);
 * ```
 */
export class KycPlugin {
  readonly pluginId = 'kyc-plugin';

  private config: KycPluginConfig;
  private sessions: Map<string, KycSession> = new Map();
  private verifications: Map<string, VerificationResult> = new Map();
  private eventHandlers: Map<string, ((event: KycWebhookEvent) => void)[]> = new Map();

  constructor(config: KycPluginConfig) {
    this.config = {
      defaultLevel: VerificationLevel.STANDARD,
      sessionTtlSeconds: 1800, // 30 minutes
      ...config,
    };
  }

  // ==========================================================================
  // SESSION MANAGEMENT
  // ==========================================================================

  /**
   * Start a new verification session
   */
  async startVerification(request: StartVerificationRequest): Promise<KycSession> {
    const sessionId = uuidv4();
    const level = request.level || this.config.defaultLevel!;
    const expiresAt = new Date(
      Date.now() + (this.config.sessionTtlSeconds! * 1000)
    ).toISOString();

    // If server endpoint is configured, call it
    if (this.config.serverEndpoint) {
      const response = await this.callServer('/sessions', 'POST', {
        userId: request.userId,
        walletAddress: request.walletAddress,
        level,
        email: request.email,
        country: request.country,
        metadata: request.metadata,
        redirectUrl: request.redirectUrl,
      });

      const session: KycSession = {
        sessionId: response.sessionId || sessionId,
        userId: request.userId,
        walletAddress: request.walletAddress,
        url: response.url,
        accessToken: response.accessToken,
        expiresAt: response.expiresAt || expiresAt,
        level,
        provider: this.config.provider,
      };

      this.sessions.set(session.sessionId, session);
      return session;
    }

    // Mock provider for testing
    if (this.config.provider === 'mock') {
      const session: KycSession = {
        sessionId,
        userId: request.userId,
        walletAddress: request.walletAddress,
        url: `https://mock-kyc.example.com/verify/${sessionId}`,
        accessToken: `mock-token-${sessionId}`,
        expiresAt,
        level,
        provider: 'mock',
      };

      this.sessions.set(sessionId, session);

      // Update verification status to pending
      this.verifications.set(request.userId, {
        userId: request.userId,
        status: VerificationStatus.PENDING,
        verified: false,
        level,
      });

      return session;
    }

    throw new Error(`Direct provider integration not implemented. Use serverEndpoint.`);
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): KycSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get active session for user
   */
  getActiveSessionForUser(userId: string): KycSession | undefined {
    for (const session of this.sessions.values()) {
      if (session.userId === userId && new Date(session.expiresAt) > new Date()) {
        return session;
      }
    }
    return undefined;
  }

  // ==========================================================================
  // VERIFICATION STATUS
  // ==========================================================================

  /**
   * Get verification status for a user
   */
  async getVerificationStatus(userId: string): Promise<VerificationResult> {
    // Check cache first
    const cached = this.verifications.get(userId);

    // If server endpoint, fetch fresh status
    if (this.config.serverEndpoint) {
      try {
        const response = await this.callServer(`/users/${userId}/status`, 'GET');

        const result: VerificationResult = {
          userId,
          status: response.status as VerificationStatus,
          level: response.level as VerificationLevel,
          verified: response.status === VerificationStatus.APPROVED,
          expiresAt: response.expiresAt,
          rejectionReason: response.rejectionReason,
          providerReferenceId: response.providerReferenceId,
          country: response.country,
          metadata: response.metadata,
        };

        this.verifications.set(userId, result);
        return result;
      } catch (error) {
        // Return cached if server fails
        if (cached) return cached;
        throw error;
      }
    }

    // Return cached or default
    return cached || {
      userId,
      status: VerificationStatus.NOT_STARTED,
      verified: false,
    };
  }

  /**
   * Check if user is verified
   */
  async isVerified(userId: string): Promise<boolean> {
    const status = await this.getVerificationStatus(userId);
    return status.verified && (!status.expiresAt || new Date(status.expiresAt) > new Date());
  }

  /**
   * Check if user needs re-verification
   */
  async needsReverification(userId: string, daysBeforeExpiry: number = 30): Promise<boolean> {
    const status = await this.getVerificationStatus(userId);

    if (!status.verified) return true;
    if (!status.expiresAt) return false;

    const expiresAt = new Date(status.expiresAt);
    const warningDate = new Date();
    warningDate.setDate(warningDate.getDate() + daysBeforeExpiry);

    return expiresAt <= warningDate;
  }

  // ==========================================================================
  // WEBHOOK HANDLING
  // ==========================================================================

  /**
   * Process webhook event from KYC provider
   */
  processWebhookEvent(event: KycWebhookEvent): void {
    // Update verification status
    const result: VerificationResult = {
      userId: event.userId,
      status: event.status,
      level: event.level,
      verified: event.status === VerificationStatus.APPROVED,
      rejectionReason: event.rejectionReason,
      providerReferenceId: event.providerReferenceId,
      country: event.country,
    };

    this.verifications.set(event.userId, result);

    // Emit event to handlers
    const handlers = this.eventHandlers.get(event.type) || [];
    for (const handler of handlers) {
      try {
        handler(event);
      } catch (error) {
        console.error('Error in KYC event handler:', error);
      }
    }

    // Also emit to 'all' handlers
    const allHandlers = this.eventHandlers.get('all') || [];
    for (const handler of allHandlers) {
      try {
        handler(event);
      } catch (error) {
        console.error('Error in KYC event handler:', error);
      }
    }
  }

  /**
   * Subscribe to KYC events
   */
  on(
    eventType: KycWebhookEvent['type'] | 'all',
    handler: (event: KycWebhookEvent) => void
  ): () => void {
    const handlers = this.eventHandlers.get(eventType) || [];
    handlers.push(handler);
    this.eventHandlers.set(eventType, handlers);

    // Return unsubscribe function
    return () => {
      const currentHandlers = this.eventHandlers.get(eventType) || [];
      const index = currentHandlers.indexOf(handler);
      if (index > -1) {
        currentHandlers.splice(index, 1);
      }
    };
  }

  // ==========================================================================
  // MOCK PROVIDER (for testing)
  // ==========================================================================

  /**
   * Simulate verification approval (mock provider only)
   */
  mockApprove(
    userId: string,
    options: { level?: VerificationLevel; country?: string; expiresInDays?: number } = {}
  ): void {
    if (this.config.provider !== 'mock') {
      throw new Error('mockApprove only available for mock provider');
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + (options.expiresInDays || 365));

    const event: KycWebhookEvent = {
      type: 'verification.completed',
      userId,
      providerReferenceId: `mock-${userId}`,
      status: VerificationStatus.APPROVED,
      level: options.level || VerificationLevel.STANDARD,
      country: options.country || 'US',
      timestamp: new Date().toISOString(),
    };

    this.processWebhookEvent(event);

    // Update with expiry
    const result = this.verifications.get(userId)!;
    result.expiresAt = expiresAt.toISOString();
    this.verifications.set(userId, result);
  }

  /**
   * Simulate verification rejection (mock provider only)
   */
  mockReject(userId: string, reason: string = 'Document verification failed'): void {
    if (this.config.provider !== 'mock') {
      throw new Error('mockReject only available for mock provider');
    }

    const event: KycWebhookEvent = {
      type: 'verification.rejected',
      userId,
      providerReferenceId: `mock-${userId}`,
      status: VerificationStatus.REJECTED,
      rejectionReason: reason,
      timestamp: new Date().toISOString(),
    };

    this.processWebhookEvent(event);
  }

  // ==========================================================================
  // PRIVATE METHODS
  // ==========================================================================

  private async callServer(
    path: string,
    method: 'GET' | 'POST',
    body?: unknown
  ): Promise<Record<string, unknown>> {
    const url = `${this.config.serverEndpoint}${path}`;

    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(this.config.providerConfig.apiKey && {
          'Authorization': `Bearer ${this.config.providerConfig.apiKey}`,
        }),
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`KYC server error: ${response.status} ${error}`);
    }

    return response.json();
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a KYC plugin instance
 */
export function createKycPlugin(config: KycPluginConfig): KycPlugin {
  return new KycPlugin(config);
}

// ============================================================================
// RE-EXPORTS
// ============================================================================

export type {
  KycPluginConfig,
  KycSession,
  VerificationResult,
  StartVerificationRequest,
  KycWebhookEvent,
};
