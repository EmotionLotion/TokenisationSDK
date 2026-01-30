/**
 * OAuth2 Consent Management Service
 *
 * Manages authorization requests for the OAuth2 Authorization Code flow with PKCE.
 * Stores pending authorization requests in memory with TTL-based expiration.
 *
 * Features:
 * - In-memory storage of pending authorization requests
 * - Authorization code generation (32 bytes hex)
 * - PKCE code_challenge storage
 * - Automatic cleanup of expired requests
 * - One-time use authorization codes (10 minute expiry)
 *
 * @packageDocumentation
 */

import { randomBytes } from 'crypto';
import { logger } from '../middleware/logger.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

/** Authorization code expiry in milliseconds (10 minutes) */
const AUTHORIZATION_CODE_EXPIRY_MS = 10 * 60 * 1000;

/** Cleanup interval for expired requests (5 minutes) */
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

// ============================================================================
// TYPES
// ============================================================================

export type AuthorizationRequestStatus = 'pending' | 'approved' | 'denied' | 'consumed';

export interface AuthorizationRequest {
  /** Unique request identifier */
  id: string;
  /** OAuth2 client ID */
  clientId: string;
  /** Organization ID of the client */
  orgId: string;
  /** Registered redirect URI */
  redirectUri: string;
  /** Requested scopes */
  scope: string[];
  /** Client-provided state parameter */
  state: string;
  /** PKCE code challenge */
  codeChallenge: string;
  /** PKCE code challenge method (S256 or plain) */
  codeChallengeMethod: 'S256' | 'plain';
  /** Current status of the request */
  status: AuthorizationRequestStatus;
  /** Authorization code (set on approval) */
  authorizationCode?: string;
  /** Approved scopes (may be subset of requested) */
  approvedScopes?: string[];
  /** Timestamp when request was created */
  createdAt: Date;
  /** Timestamp when request expires */
  expiresAt: Date;
}

// ============================================================================
// CONSENT SERVICE CLASS
// ============================================================================

export class OAuth2ConsentService {
  /** In-memory store for authorization requests, keyed by request ID */
  private requests: Map<string, AuthorizationRequest> = new Map();

  /** Index from authorization code to request ID for fast lookup */
  private codeIndex: Map<string, string> = new Map();

  /** Cleanup timer */
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Start periodic cleanup
    this.cleanupTimer = setInterval(() => this.cleanupExpired(), CLEANUP_INTERVAL_MS);
    // Allow the process to exit even if the timer is still running
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  /**
   * Create a new pending authorization request
   */
  createAuthorizationRequest(params: {
    clientId: string;
    orgId: string;
    redirectUri: string;
    scope: string[];
    state: string;
    codeChallenge: string;
    codeChallengeMethod: 'S256' | 'plain';
  }): AuthorizationRequest {
    const id = randomBytes(16).toString('hex');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + AUTHORIZATION_CODE_EXPIRY_MS);

    const request: AuthorizationRequest = {
      id,
      clientId: params.clientId,
      orgId: params.orgId,
      redirectUri: params.redirectUri,
      scope: params.scope,
      state: params.state,
      codeChallenge: params.codeChallenge,
      codeChallengeMethod: params.codeChallengeMethod,
      status: 'pending',
      createdAt: now,
      expiresAt,
    };

    this.requests.set(id, request);

    logger.info('Authorization request created', {
      metadata: { requestId: id, clientId: params.clientId },
    });

    return request;
  }

  /**
   * Get an authorization request by ID
   */
  getAuthorizationRequest(requestId: string): AuthorizationRequest | null {
    const request = this.requests.get(requestId);
    if (!request) {
      return null;
    }

    // Check if expired
    if (new Date() > request.expiresAt) {
      this.requests.delete(requestId);
      if (request.authorizationCode) {
        this.codeIndex.delete(request.authorizationCode);
      }
      return null;
    }

    return request;
  }

  /**
   * Get an authorization request by authorization code
   */
  getAuthorizationRequestByCode(code: string): AuthorizationRequest | null {
    const requestId = this.codeIndex.get(code);
    if (!requestId) {
      return null;
    }

    return this.getAuthorizationRequest(requestId);
  }

  /**
   * Approve an authorization request and generate an authorization code
   */
  approveAuthorization(requestId: string, approvedScopes?: string[]): AuthorizationRequest | null {
    const request = this.getAuthorizationRequest(requestId);
    if (!request) {
      return null;
    }

    if (request.status !== 'pending') {
      logger.warn('Attempted to approve non-pending authorization request', {
        metadata: { requestId, status: request.status },
      });
      return null;
    }

    // Generate authorization code (32 bytes hex)
    const authorizationCode = randomBytes(32).toString('hex');

    // Update request
    request.status = 'approved';
    request.authorizationCode = authorizationCode;
    request.approvedScopes = approvedScopes || request.scope;

    // Index by authorization code
    this.codeIndex.set(authorizationCode, requestId);

    logger.info('Authorization request approved', {
      metadata: { requestId, clientId: request.clientId },
    });

    return request;
  }

  /**
   * Deny an authorization request
   */
  denyAuthorization(requestId: string): AuthorizationRequest | null {
    const request = this.getAuthorizationRequest(requestId);
    if (!request) {
      return null;
    }

    if (request.status !== 'pending') {
      logger.warn('Attempted to deny non-pending authorization request', {
        metadata: { requestId, status: request.status },
      });
      return null;
    }

    request.status = 'denied';

    logger.info('Authorization request denied', {
      metadata: { requestId, clientId: request.clientId },
    });

    return request;
  }

  /**
   * Consume an authorization code (mark as used, one-time use)
   */
  consumeAuthorizationCode(code: string): AuthorizationRequest | null {
    const request = this.getAuthorizationRequestByCode(code);
    if (!request) {
      return null;
    }

    if (request.status !== 'approved') {
      logger.warn('Attempted to consume non-approved authorization code', {
        metadata: { requestId: request.id, status: request.status },
      });
      return null;
    }

    // Mark as consumed (one-time use)
    request.status = 'consumed';

    // Remove from code index
    this.codeIndex.delete(code);

    logger.info('Authorization code consumed', {
      metadata: { requestId: request.id, clientId: request.clientId },
    });

    return request;
  }

  /**
   * Clean up expired authorization requests
   */
  private cleanupExpired(): void {
    const now = new Date();
    let cleaned = 0;

    for (const [id, request] of this.requests.entries()) {
      if (now > request.expiresAt) {
        if (request.authorizationCode) {
          this.codeIndex.delete(request.authorizationCode);
        }
        this.requests.delete(id);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug('Cleaned up expired authorization requests', {
        metadata: { count: cleaned },
      });
    }
  }

  /**
   * Stop the cleanup timer (for graceful shutdown)
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }
}

// Export singleton instance
export const oauth2ConsentService = new OAuth2ConsentService();
