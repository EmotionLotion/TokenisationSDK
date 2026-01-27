/**
 * OAuth2 Authorization Server Routes
 *
 * Implements RFC 6749 OAuth2 endpoints:
 * - POST /oauth/token - Token endpoint
 * - POST /oauth/revoke - Token revocation (RFC 7009)
 * - POST /oauth/introspect - Token introspection (RFC 7662)
 * - GET /oauth/.well-known/oauth-authorization-server - Server metadata (RFC 8414)
 *
 * @packageDocumentation
 */

import { Router, Request, Response, NextFunction } from 'express';
import { oauth2Service, OAUTH_SCOPES } from '../services/oauth2.service.js';
import { ValidationError, UnauthorizedError, AppError } from '../middleware/errorHandler.js';
import { logger } from '../middleware/logger.js';
import { apiKeyMiddleware, type ApiKeyRequest } from '../middleware/auth.js';

export const oauthRouter = Router();

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Extract client credentials from request
 * Supports both Basic auth and body parameters (RFC 6749 Section 2.3)
 */
function extractClientCredentials(req: Request): { clientId: string; clientSecret: string } | null {
  // Try Basic auth first
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Basic ')) {
    const credentials = Buffer.from(authHeader.slice(6), 'base64').toString('utf-8');
    const [clientId, clientSecret] = credentials.split(':');
    if (clientId && clientSecret) {
      return { clientId, clientSecret };
    }
  }

  // Fall back to body parameters
  const { client_id, client_secret } = req.body;
  if (client_id && client_secret) {
    return { clientId: client_id, clientSecret: client_secret };
  }

  return null;
}

// ============================================================================
// TOKEN ENDPOINT
// POST /oauth/token
// ============================================================================

/**
 * @openapi
 * /oauth/token:
 *   post:
 *     summary: OAuth2 Token Endpoint
 *     description: |
 *       Issues access and refresh tokens. Supports grant types:
 *       - `client_credentials`: For service-to-service authentication
 *       - `refresh_token`: For token renewal
 *     tags:
 *       - OAuth2
 *     requestBody:
 *       required: true
 *       content:
 *         application/x-www-form-urlencoded:
 *           schema:
 *             type: object
 *             required:
 *               - grant_type
 *             properties:
 *               grant_type:
 *                 type: string
 *                 enum: [client_credentials, refresh_token]
 *               client_id:
 *                 type: string
 *                 description: Required if not using Basic auth
 *               client_secret:
 *                 type: string
 *                 description: Required if not using Basic auth
 *               scope:
 *                 type: string
 *                 description: Space-separated list of requested scopes
 *               refresh_token:
 *                 type: string
 *                 description: Required for refresh_token grant
 *     responses:
 *       200:
 *         description: Token response
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 access_token:
 *                   type: string
 *                 token_type:
 *                   type: string
 *                   enum: [Bearer]
 *                 expires_in:
 *                   type: integer
 *                 refresh_token:
 *                   type: string
 *                 scope:
 *                   type: string
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Invalid client credentials
 */
oauthRouter.post('/token', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { grant_type, scope, refresh_token } = req.body;

    if (!grant_type) {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'Missing required parameter: grant_type',
      });
    }

    // Handle refresh_token grant
    if (grant_type === 'refresh_token') {
      if (!refresh_token) {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'Missing required parameter: refresh_token',
        });
      }

      const tokenResponse = await oauth2Service.issueRefreshToken(refresh_token);
      if (!tokenResponse) {
        return res.status(400).json({
          error: 'invalid_grant',
          error_description: 'Invalid or expired refresh token',
        });
      }

      return res.json(tokenResponse);
    }

    // Handle client_credentials grant
    if (grant_type === 'client_credentials') {
      const credentials = extractClientCredentials(req);
      if (!credentials) {
        return res.status(401).json({
          error: 'invalid_client',
          error_description: 'Client authentication failed',
        });
      }

      const client = await oauth2Service.authenticateClient(
        credentials.clientId,
        credentials.clientSecret
      );

      if (!client) {
        return res.status(401).json({
          error: 'invalid_client',
          error_description: 'Client authentication failed',
        });
      }

      // Parse requested scopes
      const requestedScopes = scope ? scope.split(' ').filter((s: string) => s) : undefined;

      const tokenResponse = await oauth2Service.issueClientCredentialsToken(client, requestedScopes);
      return res.json(tokenResponse);
    }

    return res.status(400).json({
      error: 'unsupported_grant_type',
      error_description: `Grant type '${grant_type}' is not supported`,
    });
  } catch (error) {
    logger.error('OAuth2 token error', { error });
    next(error);
  }
});

// ============================================================================
// REVOCATION ENDPOINT
// POST /oauth/revoke
// ============================================================================

/**
 * @openapi
 * /oauth/revoke:
 *   post:
 *     summary: OAuth2 Token Revocation (RFC 7009)
 *     description: Revokes an access or refresh token
 *     tags:
 *       - OAuth2
 *     requestBody:
 *       required: true
 *       content:
 *         application/x-www-form-urlencoded:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *             properties:
 *               token:
 *                 type: string
 *               token_type_hint:
 *                 type: string
 *                 enum: [access_token, refresh_token]
 *     responses:
 *       200:
 *         description: Token revoked (always returns 200 per RFC 7009)
 */
oauthRouter.post('/revoke', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token, token_type_hint } = req.body;

    if (!token) {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'Missing required parameter: token',
      });
    }

    // RFC 7009: Always return 200, even if token is invalid
    await oauth2Service.revokeToken(token, token_type_hint);

    res.status(200).send();
  } catch (error) {
    logger.error('OAuth2 revoke error', { error });
    // Per RFC 7009, still return 200
    res.status(200).send();
  }
});

// ============================================================================
// INTROSPECTION ENDPOINT
// POST /oauth/introspect
// ============================================================================

/**
 * @openapi
 * /oauth/introspect:
 *   post:
 *     summary: OAuth2 Token Introspection (RFC 7662)
 *     description: Returns information about a token
 *     tags:
 *       - OAuth2
 *     security:
 *       - BasicAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/x-www-form-urlencoded:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *             properties:
 *               token:
 *                 type: string
 *               token_type_hint:
 *                 type: string
 *                 enum: [access_token, refresh_token]
 *     responses:
 *       200:
 *         description: Token information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required:
 *                 - active
 *               properties:
 *                 active:
 *                   type: boolean
 *                 scope:
 *                   type: string
 *                 client_id:
 *                   type: string
 *                 exp:
 *                   type: integer
 *                 iat:
 *                   type: integer
 */
oauthRouter.post('/introspect', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'Missing required parameter: token',
      });
    }

    // Optional: Verify caller is authorized to introspect
    // For simplicity, we allow any request to introspect (common in internal services)

    const introspection = await oauth2Service.introspectToken(token);
    res.json(introspection);
  } catch (error) {
    logger.error('OAuth2 introspect error', { error });
    next(error);
  }
});

// ============================================================================
// METADATA ENDPOINT
// GET /oauth/.well-known/oauth-authorization-server
// ============================================================================

/**
 * @openapi
 * /oauth/.well-known/oauth-authorization-server:
 *   get:
 *     summary: OAuth2 Authorization Server Metadata (RFC 8414)
 *     description: Returns OAuth2 server metadata for client configuration
 *     tags:
 *       - OAuth2
 *     responses:
 *       200:
 *         description: Server metadata
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 issuer:
 *                   type: string
 *                 token_endpoint:
 *                   type: string
 *                 revocation_endpoint:
 *                   type: string
 *                 introspection_endpoint:
 *                   type: string
 *                 grant_types_supported:
 *                   type: array
 *                   items:
 *                     type: string
 *                 scopes_supported:
 *                   type: array
 *                   items:
 *                     type: string
 */
oauthRouter.get('/.well-known/oauth-authorization-server', (req: Request, res: Response) => {
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.get('host');
  const baseUrl = `${protocol}://${host}`;

  const metadata = oauth2Service.getServerMetadata(baseUrl);
  res.json(metadata);
});

// ============================================================================
// CLIENT MANAGEMENT ENDPOINTS (Protected)
// ============================================================================

/**
 * @openapi
 * /oauth/clients:
 *   post:
 *     summary: Register a new OAuth2 client
 *     description: Creates a new OAuth2 client for the organization
 *     tags:
 *       - OAuth2
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *               scopes:
 *                 type: array
 *                 items:
 *                   type: string
 *               redirect_uris:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       201:
 *         description: Client created
 */
oauthRouter.post('/clients', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const orgId = req.apiKey?.orgId;
    if (!orgId) {
      throw new UnauthorizedError('Organization context required');
    }

    const { name, scopes, redirect_uris } = req.body;

    if (!name) {
      throw new ValidationError('Client name is required');
    }

    const result = await oauth2Service.registerClient({
      orgId,
      name,
      scopes,
      redirectUris: redirect_uris,
    });

    res.status(201).json({
      client: result.client,
      client_secret: result.clientSecret, // Only returned once!
      warning: 'Store the client_secret securely. It cannot be retrieved again.',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /oauth/clients:
 *   get:
 *     summary: List OAuth2 clients
 *     description: Lists all OAuth2 clients for the organization
 *     tags:
 *       - OAuth2
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: List of clients
 */
oauthRouter.get('/clients', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const orgId = req.apiKey?.orgId;
    if (!orgId) {
      throw new UnauthorizedError('Organization context required');
    }

    const clients = await oauth2Service.listClients(orgId);
    res.json({ clients });
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /oauth/clients/{clientId}:
 *   get:
 *     summary: Get OAuth2 client details
 *     tags:
 *       - OAuth2
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - name: clientId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Client details
 *       404:
 *         description: Client not found
 */
oauthRouter.get('/clients/:clientId', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const orgId = req.apiKey?.orgId;
    if (!orgId) {
      throw new UnauthorizedError('Organization context required');
    }

    const client = await oauth2Service.getClient(req.params.clientId);
    if (!client || client.orgId !== orgId) {
      return res.status(404).json({ error: 'Client not found' });
    }

    res.json({ client });
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /oauth/clients/{clientId}/rotate-secret:
 *   post:
 *     summary: Rotate client secret
 *     description: Generates a new client secret. The old secret is immediately invalidated.
 *     tags:
 *       - OAuth2
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - name: clientId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: New client secret
 */
oauthRouter.post('/clients/:clientId/rotate-secret', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const orgId = req.apiKey?.orgId;
    if (!orgId) {
      throw new UnauthorizedError('Organization context required');
    }

    const client = await oauth2Service.getClient(req.params.clientId);
    if (!client || client.orgId !== orgId) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const result = await oauth2Service.rotateClientSecret(req.params.clientId);
    if (!result) {
      return res.status(404).json({ error: 'Client not found' });
    }

    res.json({
      client_secret: result.clientSecret,
      warning: 'Store the new client_secret securely. It cannot be retrieved again.',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /oauth/clients/{clientId}:
 *   delete:
 *     summary: Revoke OAuth2 client
 *     description: Disables the client and revokes all its tokens
 *     tags:
 *       - OAuth2
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - name: clientId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Client revoked
 */
oauthRouter.delete('/clients/:clientId', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const orgId = req.apiKey?.orgId;
    if (!orgId) {
      throw new UnauthorizedError('Organization context required');
    }

    const client = await oauth2Service.getClient(req.params.clientId);
    if (!client || client.orgId !== orgId) {
      return res.status(404).json({ error: 'Client not found' });
    }

    await oauth2Service.revokeClient(req.params.clientId);
    res.json({ success: true, message: 'Client revoked' });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// SCOPES ENDPOINT
// GET /oauth/scopes
// ============================================================================

/**
 * @openapi
 * /oauth/scopes:
 *   get:
 *     summary: List available OAuth2 scopes
 *     description: Returns all available scopes and their descriptions
 *     tags:
 *       - OAuth2
 *     responses:
 *       200:
 *         description: Available scopes
 */
oauthRouter.get('/scopes', (_req: Request, res: Response) => {
  res.json({
    scopes: Object.entries(OAUTH_SCOPES).map(([scope, description]) => ({
      scope,
      description,
    })),
  });
});
