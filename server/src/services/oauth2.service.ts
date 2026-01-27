/**
 * OAuth2 Authorization Server Service
 *
 * Implements RFC 6749 OAuth2 Authorization Server with support for:
 * - client_credentials grant (service-to-service)
 * - refresh_token grant (token renewal)
 *
 * Security features:
 * - Client secrets hashed with argon2
 * - Access tokens are JWTs (1 hour expiry)
 * - Refresh tokens are opaque, hashed in storage (30 day expiry, rotated on use)
 * - Token introspection for resource servers
 *
 * @packageDocumentation
 */

import { randomBytes, createHash } from 'crypto';
import * as argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { db } from '../config/database.js';
import { oauthClients, oauthTokens, orgs } from '../db/schema.js';
import { eq, and, sql, gt, isNull } from 'drizzle-orm';
import { logger } from '../middleware/logger.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const JWT_ISSUER = process.env.JWT_ISSUER || 'tokenisation-api';
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || 'tokenisation-sdk';

// Token expiry times
const ACCESS_TOKEN_EXPIRY_SECONDS = 3600; // 1 hour
const REFRESH_TOKEN_EXPIRY_DAYS = 30;

// Available OAuth2 scopes
export const OAUTH_SCOPES = {
  // Read scopes
  'read:assets': 'Read access to assets',
  'read:tokens': 'Read access to tokens',
  'read:investors': 'Read access to investors',
  'read:transfers': 'Read access to transfers',
  'read:compliance': 'Read access to compliance data',
  'read:reports': 'Read access to reports',
  'read:audit': 'Read access to audit logs',

  // Write scopes
  'write:assets': 'Create and update assets',
  'write:tokens': 'Create and manage tokens',
  'write:investors': 'Create and update investors',
  'write:transfers': 'Initiate transfers',
  'write:compliance': 'Manage compliance policies',

  // Admin scopes
  'admin:org': 'Organization administration',
  'admin:users': 'User management',
  'admin:webhooks': 'Webhook management',

  // Full access
  'admin': 'Full administrative access',
} as const;

export type OAuthScope = keyof typeof OAUTH_SCOPES;

// ============================================================================
// TYPES
// ============================================================================

export interface OAuth2Client {
  id: string;
  clientId: string;
  name: string;
  orgId: string;
  scopes: string[];
  redirectUris: string[];
  status: string;
  createdAt: Date;
}

export interface OAuth2TokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token?: string;
  scope: string;
}

export interface OAuth2TokenPayload {
  sub: string; // client_id
  orgId: string;
  scopes: string[];
  clientName: string;
  type: 'access';
  iat: number;
  exp: number;
  iss: string;
  aud: string;
}

export interface TokenIntrospectionResponse {
  active: boolean;
  scope?: string;
  client_id?: string;
  username?: string;
  token_type?: string;
  exp?: number;
  iat?: number;
  nbf?: number;
  sub?: string;
  aud?: string;
  iss?: string;
  orgId?: string;
}

export interface OAuth2ServerMetadata {
  issuer: string;
  token_endpoint: string;
  revocation_endpoint: string;
  introspection_endpoint: string;
  token_endpoint_auth_methods_supported: string[];
  grant_types_supported: string[];
  scopes_supported: string[];
  response_types_supported: string[];
}

// ============================================================================
// OAUTH2 SERVICE CLASS
// ============================================================================

export class OAuth2Service {
  /**
   * Register a new OAuth2 client
   */
  async registerClient(params: {
    orgId: string;
    name: string;
    scopes?: string[];
    redirectUris?: string[];
  }): Promise<{ client: OAuth2Client; clientSecret: string }> {
    // Generate client credentials
    const clientId = `cli_${randomBytes(16).toString('hex')}`;
    const clientSecret = `sec_${randomBytes(32).toString('hex')}`;

    // Hash the client secret with argon2
    const clientSecretHash = await argon2.hash(clientSecret);

    // Validate scopes
    const validScopes = params.scopes?.filter(s => s in OAUTH_SCOPES) || [];

    // Insert client
    const [client] = await db.insert(oauthClients).values({
      orgId: params.orgId,
      clientId,
      clientSecretHash,
      name: params.name,
      scopes: validScopes,
      redirectUris: params.redirectUris || [],
      status: 'active',
    }).returning();

    logger.info('OAuth2 client registered', {
      metadata: { clientId, orgId: params.orgId, name: params.name },
    });

    return {
      client: {
        id: client.id,
        clientId: client.clientId,
        name: client.name,
        orgId: client.orgId!,
        scopes: client.scopes || [],
        redirectUris: client.redirectUris || [],
        status: client.status,
        createdAt: client.createdAt!,
      },
      clientSecret, // Only returned once
    };
  }

  /**
   * Authenticate client using client_id and client_secret
   */
  async authenticateClient(clientId: string, clientSecret: string): Promise<OAuth2Client | null> {
    const client = await db.query.oauthClients.findFirst({
      where: and(
        eq(oauthClients.clientId, clientId),
        eq(oauthClients.status, 'active')
      ),
    });

    if (!client) {
      return null;
    }

    // Verify client secret
    const isValid = await argon2.verify(client.clientSecretHash, clientSecret);
    if (!isValid) {
      return null;
    }

    return {
      id: client.id,
      clientId: client.clientId,
      name: client.name,
      orgId: client.orgId!,
      scopes: client.scopes || [],
      redirectUris: client.redirectUris || [],
      status: client.status,
      createdAt: client.createdAt!,
    };
  }

  /**
   * Issue tokens for client_credentials grant
   */
  async issueClientCredentialsToken(
    client: OAuth2Client,
    requestedScopes?: string[]
  ): Promise<OAuth2TokenResponse> {
    // Determine final scopes (intersection of requested and allowed)
    let finalScopes = client.scopes;
    if (requestedScopes && requestedScopes.length > 0) {
      finalScopes = requestedScopes.filter(s => client.scopes.includes(s));
    }

    // Generate access token (JWT)
    const accessToken = this.generateAccessToken(client, finalScopes);

    // Generate refresh token (opaque)
    const refreshToken = randomBytes(32).toString('base64url');
    const refreshTokenHash = createHash('sha256').update(refreshToken).digest('hex');

    // Store refresh token
    const refreshExpiresAt = new Date();
    refreshExpiresAt.setDate(refreshExpiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);

    await db.insert(oauthTokens).values({
      orgId: client.orgId,
      clientId: client.id,
      tokenType: 'refresh',
      tokenHash: refreshTokenHash,
      scopes: finalScopes.join(' '),
      expiresAt: refreshExpiresAt,
    });

    logger.info('OAuth2 tokens issued', {
      metadata: { clientId: client.clientId, scopes: finalScopes },
    });

    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: ACCESS_TOKEN_EXPIRY_SECONDS,
      refresh_token: refreshToken,
      scope: finalScopes.join(' '),
    };
  }

  /**
   * Issue tokens for refresh_token grant
   */
  async issueRefreshToken(refreshToken: string): Promise<OAuth2TokenResponse | null> {
    const refreshTokenHash = createHash('sha256').update(refreshToken).digest('hex');

    // Find the stored refresh token
    const storedToken = await db.query.oauthTokens.findFirst({
      where: and(
        eq(oauthTokens.tokenHash, refreshTokenHash),
        eq(oauthTokens.tokenType, 'refresh'),
        isNull(oauthTokens.revokedAt),
        gt(oauthTokens.expiresAt, new Date())
      ),
    });

    if (!storedToken) {
      return null;
    }

    // Get the client
    const client = await db.query.oauthClients.findFirst({
      where: and(
        eq(oauthClients.id, storedToken.clientId),
        eq(oauthClients.status, 'active')
      ),
    });

    if (!client) {
      return null;
    }

    // Revoke the old refresh token (rotation)
    await db.update(oauthTokens)
      .set({ revokedAt: new Date() })
      .where(eq(oauthTokens.id, storedToken.id));

    // Parse scopes from stored token
    const scopes = storedToken.scopes.split(' ').filter(s => s);

    const oauth2Client: OAuth2Client = {
      id: client.id,
      clientId: client.clientId,
      name: client.name,
      orgId: client.orgId!,
      scopes: client.scopes || [],
      redirectUris: client.redirectUris || [],
      status: client.status,
      createdAt: client.createdAt!,
    };

    // Generate new access token
    const accessToken = this.generateAccessToken(oauth2Client, scopes);

    // Generate new refresh token
    const newRefreshToken = randomBytes(32).toString('base64url');
    const newRefreshTokenHash = createHash('sha256').update(newRefreshToken).digest('hex');

    const refreshExpiresAt = new Date();
    refreshExpiresAt.setDate(refreshExpiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);

    await db.insert(oauthTokens).values({
      orgId: storedToken.orgId,
      clientId: storedToken.clientId,
      tokenType: 'refresh',
      tokenHash: newRefreshTokenHash,
      scopes: scopes.join(' '),
      expiresAt: refreshExpiresAt,
    });

    logger.info('OAuth2 refresh token rotated', {
      metadata: { clientId: client.clientId },
    });

    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: ACCESS_TOKEN_EXPIRY_SECONDS,
      refresh_token: newRefreshToken,
      scope: scopes.join(' '),
    };
  }

  /**
   * Revoke a token
   */
  async revokeToken(token: string, tokenTypeHint?: 'access_token' | 'refresh_token'): Promise<boolean> {
    // Try to determine if it's a refresh token
    if (tokenTypeHint === 'refresh_token' || !token.startsWith('eyJ')) {
      // Likely a refresh token - revoke by hash
      const tokenHash = createHash('sha256').update(token).digest('hex');

      const result = await db.update(oauthTokens)
        .set({ revokedAt: new Date() })
        .where(and(
          eq(oauthTokens.tokenHash, tokenHash),
          isNull(oauthTokens.revokedAt)
        ));

      // Note: Access tokens are stateless JWTs, can't be truly revoked
      // In production, you might want to maintain a blocklist in Redis

      return true;
    }

    // For access tokens (JWTs), we can't revoke them directly
    // Best practice: short expiry + refresh tokens
    logger.warn('Access token revocation requested but JWTs cannot be revoked');
    return true;
  }

  /**
   * Introspect a token
   */
  async introspectToken(token: string): Promise<TokenIntrospectionResponse> {
    // Try to verify as JWT access token first
    if (token.startsWith('eyJ')) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET, {
          algorithms: ['HS256'],
          issuer: JWT_ISSUER,
          audience: JWT_AUDIENCE,
        }) as OAuth2TokenPayload;

        return {
          active: true,
          scope: decoded.scopes.join(' '),
          client_id: decoded.sub,
          token_type: 'Bearer',
          exp: decoded.exp,
          iat: decoded.iat,
          sub: decoded.sub,
          aud: JWT_AUDIENCE,
          iss: JWT_ISSUER,
          orgId: decoded.orgId,
        };
      } catch {
        return { active: false };
      }
    }

    // Try as refresh token
    const tokenHash = createHash('sha256').update(token).digest('hex');

    const storedToken = await db.query.oauthTokens.findFirst({
      where: and(
        eq(oauthTokens.tokenHash, tokenHash),
        eq(oauthTokens.tokenType, 'refresh'),
        isNull(oauthTokens.revokedAt),
        gt(oauthTokens.expiresAt, new Date())
      ),
    });

    if (!storedToken) {
      return { active: false };
    }

    const client = await db.query.oauthClients.findFirst({
      where: eq(oauthClients.id, storedToken.clientId),
    });

    return {
      active: true,
      scope: storedToken.scopes,
      client_id: client?.clientId,
      token_type: 'refresh_token',
      exp: Math.floor(storedToken.expiresAt.getTime() / 1000),
      iat: Math.floor(storedToken.createdAt.getTime() / 1000),
      sub: client?.clientId,
      orgId: storedToken.orgId,
    };
  }

  /**
   * Get server metadata (RFC 8414)
   */
  getServerMetadata(baseUrl: string): OAuth2ServerMetadata {
    return {
      issuer: JWT_ISSUER,
      token_endpoint: `${baseUrl}/oauth/token`,
      revocation_endpoint: `${baseUrl}/oauth/revoke`,
      introspection_endpoint: `${baseUrl}/oauth/introspect`,
      token_endpoint_auth_methods_supported: [
        'client_secret_basic',
        'client_secret_post',
      ],
      grant_types_supported: [
        'client_credentials',
        'refresh_token',
      ],
      scopes_supported: Object.keys(OAUTH_SCOPES),
      response_types_supported: ['token'],
    };
  }

  /**
   * Get a client by ID
   */
  async getClient(clientId: string): Promise<OAuth2Client | null> {
    const client = await db.query.oauthClients.findFirst({
      where: eq(oauthClients.clientId, clientId),
    });

    if (!client) {
      return null;
    }

    return {
      id: client.id,
      clientId: client.clientId,
      name: client.name,
      orgId: client.orgId!,
      scopes: client.scopes || [],
      redirectUris: client.redirectUris || [],
      status: client.status,
      createdAt: client.createdAt!,
    };
  }

  /**
   * List clients for an organization
   */
  async listClients(orgId: string): Promise<OAuth2Client[]> {
    const clients = await db.query.oauthClients.findMany({
      where: eq(oauthClients.orgId, orgId),
    });

    return clients.map(client => ({
      id: client.id,
      clientId: client.clientId,
      name: client.name,
      orgId: client.orgId!,
      scopes: client.scopes || [],
      redirectUris: client.redirectUris || [],
      status: client.status,
      createdAt: client.createdAt!,
    }));
  }

  /**
   * Update client scopes
   */
  async updateClientScopes(clientId: string, scopes: string[]): Promise<OAuth2Client | null> {
    const validScopes = scopes.filter(s => s in OAUTH_SCOPES);

    const [client] = await db.update(oauthClients)
      .set({ scopes: validScopes, updatedAt: new Date() })
      .where(eq(oauthClients.clientId, clientId))
      .returning();

    if (!client) {
      return null;
    }

    return {
      id: client.id,
      clientId: client.clientId,
      name: client.name,
      orgId: client.orgId!,
      scopes: client.scopes || [],
      redirectUris: client.redirectUris || [],
      status: client.status,
      createdAt: client.createdAt!,
    };
  }

  /**
   * Revoke a client (disable)
   */
  async revokeClient(clientId: string): Promise<boolean> {
    // Revoke all tokens for this client
    const client = await db.query.oauthClients.findFirst({
      where: eq(oauthClients.clientId, clientId),
    });

    if (!client) {
      return false;
    }

    await db.update(oauthTokens)
      .set({ revokedAt: new Date() })
      .where(eq(oauthTokens.clientId, client.id));

    // Disable the client
    await db.update(oauthClients)
      .set({ status: 'revoked', updatedAt: new Date() })
      .where(eq(oauthClients.clientId, clientId));

    logger.info('OAuth2 client revoked', { metadata: { clientId } });

    return true;
  }

  /**
   * Rotate client secret
   */
  async rotateClientSecret(clientId: string): Promise<{ clientSecret: string } | null> {
    const newSecret = `sec_${randomBytes(32).toString('hex')}`;
    const secretHash = await argon2.hash(newSecret);

    const result = await db.update(oauthClients)
      .set({ clientSecretHash: secretHash, updatedAt: new Date() })
      .where(eq(oauthClients.clientId, clientId));

    logger.info('OAuth2 client secret rotated', { metadata: { clientId } });

    return { clientSecret: newSecret };
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private generateAccessToken(client: OAuth2Client, scopes: string[]): string {
    const payload: Omit<OAuth2TokenPayload, 'iat' | 'exp' | 'iss' | 'aud'> = {
      sub: client.clientId,
      orgId: client.orgId,
      scopes,
      clientName: client.name,
      type: 'access',
    };

    return jwt.sign(payload, JWT_SECRET, {
      algorithm: 'HS256',
      expiresIn: ACCESS_TOKEN_EXPIRY_SECONDS,
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
  }

  /**
   * Cleanup expired tokens (should be run periodically)
   */
  async cleanupExpiredTokens(): Promise<number> {
    const result = await db.delete(oauthTokens)
      .where(sql`${oauthTokens.expiresAt} < NOW() - INTERVAL '7 days'`);

    return 0; // Drizzle doesn't return count easily
  }
}

// Export singleton instance
export const oauth2Service = new OAuth2Service();
