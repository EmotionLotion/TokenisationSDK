/**
 * OAuth2 Authorization Server Routes
 *
 * Implements RFC 6749 OAuth2 endpoints:
 * - GET /oauth/authorize - Authorization endpoint (initiate auth code flow)
 * - POST /oauth/authorize - Process authorization decision (approve/deny)
 * - POST /oauth/token - Token endpoint (client_credentials, authorization_code, refresh_token)
 * - POST /oauth/revoke - Token revocation (RFC 7009)
 * - POST /oauth/introspect - Token introspection (RFC 7662)
 * - GET /oauth/.well-known/oauth-authorization-server - Server metadata (RFC 8414)
 *
 * @packageDocumentation
 */

import { Router, Request, Response, NextFunction } from 'express';
import { oauth2Service, OAUTH_SCOPES } from '../services/oauth2.service.js';
import { oauth2ConsentService } from '../services/oauth2-consent.service.js';
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
// AUTHORIZATION ENDPOINT
// GET /oauth/authorize
// ============================================================================

/**
 * @openapi
 * /oauth/authorize:
 *   get:
 *     summary: OAuth2 Authorization Endpoint
 *     description: |
 *       Initiates the Authorization Code flow with PKCE.
 *       Validates the request parameters and returns authorization request details
 *       for the client to present a consent screen or process programmatically.
 *     tags:
 *       - OAuth2
 *     parameters:
 *       - name: response_type
 *         in: query
 *         required: true
 *         schema:
 *           type: string
 *           enum: [code]
 *       - name: client_id
 *         in: query
 *         required: true
 *         schema:
 *           type: string
 *       - name: redirect_uri
 *         in: query
 *         required: true
 *         schema:
 *           type: string
 *       - name: scope
 *         in: query
 *         required: false
 *         schema:
 *           type: string
 *         description: Space-separated list of requested scopes
 *       - name: state
 *         in: query
 *         required: true
 *         schema:
 *           type: string
 *         description: Opaque value used to prevent CSRF
 *       - name: code_challenge
 *         in: query
 *         required: true
 *         schema:
 *           type: string
 *         description: PKCE code challenge
 *       - name: code_challenge_method
 *         in: query
 *         required: true
 *         schema:
 *           type: string
 *           enum: [S256, plain]
 *         description: PKCE code challenge method
 *     responses:
 *       200:
 *         description: Authorization request created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 request_id:
 *                   type: string
 *                 client_id:
 *                   type: string
 *                 client_name:
 *                   type: string
 *                 requested_scopes:
 *                   type: array
 *                   items:
 *                     type: string
 *                 redirect_uri:
 *                   type: string
 *                 state:
 *                   type: string
 *                 expires_at:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: Invalid request parameters
 */
oauthRouter.get('/authorize', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      response_type,
      client_id,
      redirect_uri,
      scope,
      state,
      code_challenge,
      code_challenge_method,
    } = req.query as Record<string, string>;

    // Validate response_type
    if (!response_type || response_type !== 'code') {
      return res.status(400).json({
        error: 'unsupported_response_type',
        error_description: 'Only response_type=code is supported',
      });
    }

    // Validate required parameters
    if (!client_id) {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'Missing required parameter: client_id',
      });
    }

    if (!redirect_uri) {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'Missing required parameter: redirect_uri',
      });
    }

    if (!state) {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'Missing required parameter: state',
      });
    }

    if (!code_challenge) {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'Missing required parameter: code_challenge (PKCE is required)',
      });
    }

    if (!code_challenge_method || !['S256', 'plain'].includes(code_challenge_method)) {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'Missing or invalid code_challenge_method. Supported: S256, plain',
      });
    }

    // Validate client exists and is active
    const client = await oauth2Service.getClient(client_id);
    if (!client || client.status !== 'active') {
      return res.status(400).json({
        error: 'invalid_client',
        error_description: 'Unknown or inactive client',
      });
    }

    // Validate redirect_uri is registered
    if (!client.redirectUris.includes(redirect_uri)) {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'redirect_uri is not registered for this client',
      });
    }

    // Parse and validate scopes
    const requestedScopes = scope ? scope.split(' ').filter(s => s) : client.scopes;
    const validScopes = requestedScopes.filter(s => client.scopes.includes(s));

    if (requestedScopes.length > 0 && validScopes.length === 0) {
      return res.status(400).json({
        error: 'invalid_scope',
        error_description: 'None of the requested scopes are valid for this client',
      });
    }

    // Create the authorization request
    const authRequest = oauth2ConsentService.createAuthorizationRequest({
      clientId: client_id,
      orgId: client.orgId,
      redirectUri: redirect_uri,
      scope: validScopes,
      state,
      codeChallenge: code_challenge,
      codeChallengeMethod: code_challenge_method as 'S256' | 'plain',
    });

    // Return authorization request details for the client to present consent
    res.json({
      request_id: authRequest.id,
      client_id: client.clientId,
      client_name: client.name,
      requested_scopes: validScopes.map(s => ({
        scope: s,
        description: (OAUTH_SCOPES as Record<string, string>)[s] || s,
      })),
      redirect_uri,
      state,
      expires_at: authRequest.expiresAt.toISOString(),
    });
  } catch (error) {
    logger.error('OAuth2 authorize error', { error });
    next(error);
  }
});

// ============================================================================
// AUTHORIZATION DECISION ENDPOINT
// POST /oauth/authorize
// ============================================================================

/**
 * @openapi
 * /oauth/authorize:
 *   post:
 *     summary: Process Authorization Decision
 *     description: |
 *       Processes the user's authorization decision (approve or deny).
 *       On approval, generates an authorization code and returns the redirect URL.
 *       On denial, returns the redirect URL with an error.
 *     tags:
 *       - OAuth2
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - request_id
 *               - action
 *             properties:
 *               request_id:
 *                 type: string
 *                 description: Authorization request ID from GET /oauth/authorize
 *               action:
 *                 type: string
 *                 enum: [approve, deny]
 *               scope:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Approved scopes (subset of requested). If omitted, all requested scopes are approved.
 *     responses:
 *       200:
 *         description: Authorization decision processed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 redirect_uri:
 *                   type: string
 *                   description: Full redirect URI with code and state (or error)
 *       400:
 *         description: Invalid request
 */
oauthRouter.post('/authorize', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { request_id, action, scope } = req.body;

    // Validate required parameters
    if (!request_id) {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'Missing required parameter: request_id',
      });
    }

    if (!action || !['approve', 'deny'].includes(action)) {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'Missing or invalid action. Must be "approve" or "deny"',
      });
    }

    // Look up the authorization request
    const authRequest = oauth2ConsentService.getAuthorizationRequest(request_id);
    if (!authRequest) {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'Authorization request not found or expired',
      });
    }

    if (authRequest.status !== 'pending') {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'Authorization request has already been processed',
      });
    }

    const redirectUrl = new URL(authRequest.redirectUri);

    // Handle deny
    if (action === 'deny') {
      oauth2ConsentService.denyAuthorization(request_id);

      redirectUrl.searchParams.set('error', 'access_denied');
      redirectUrl.searchParams.set('error_description', 'The resource owner denied the request');
      redirectUrl.searchParams.set('state', authRequest.state);

      return res.json({
        redirect_uri: redirectUrl.toString(),
      });
    }

    // Handle approve
    // Validate approved scopes (must be subset of requested scopes)
    let approvedScopes: string[] | undefined;
    if (scope && Array.isArray(scope) && scope.length > 0) {
      approvedScopes = scope.filter((s: string) => authRequest.scope.includes(s));
      if (approvedScopes.length === 0) {
        return res.status(400).json({
          error: 'invalid_scope',
          error_description: 'None of the approved scopes are valid for this authorization request',
        });
      }
    }

    const approved = oauth2ConsentService.approveAuthorization(request_id, approvedScopes);
    if (!approved || !approved.authorizationCode) {
      return res.status(500).json({
        error: 'server_error',
        error_description: 'Failed to generate authorization code',
      });
    }

    // Build redirect URL with code and state
    redirectUrl.searchParams.set('code', approved.authorizationCode);
    redirectUrl.searchParams.set('state', authRequest.state);

    return res.json({
      redirect_uri: redirectUrl.toString(),
    });
  } catch (error) {
    logger.error('OAuth2 authorize decision error', { error });
    next(error);
  }
});

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
 *       - `authorization_code`: For authorization code flow with PKCE
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
 *                 enum: [client_credentials, authorization_code, refresh_token]
 *               client_id:
 *                 type: string
 *                 description: Required if not using Basic auth
 *               client_secret:
 *                 type: string
 *                 description: Required if not using Basic auth (client_credentials only)
 *               scope:
 *                 type: string
 *                 description: Space-separated list of requested scopes (client_credentials only)
 *               refresh_token:
 *                 type: string
 *                 description: Required for refresh_token grant
 *               code:
 *                 type: string
 *                 description: Authorization code (authorization_code grant only)
 *               redirect_uri:
 *                 type: string
 *                 description: Must match the redirect_uri used in the authorization request
 *               code_verifier:
 *                 type: string
 *                 description: PKCE code verifier (authorization_code grant only)
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
    const { grant_type, scope, refresh_token, code, redirect_uri, client_id, code_verifier } = req.body;

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

    // Handle authorization_code grant
    if (grant_type === 'authorization_code') {
      if (!code) {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'Missing required parameter: code',
        });
      }

      if (!redirect_uri) {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'Missing required parameter: redirect_uri',
        });
      }

      if (!client_id) {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'Missing required parameter: client_id',
        });
      }

      if (!code_verifier) {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'Missing required parameter: code_verifier (PKCE is required)',
        });
      }

      const tokenResponse = await oauth2Service.issueAuthorizationCodeToken(
        code,
        redirect_uri,
        client_id,
        code_verifier
      );

      if (!tokenResponse) {
        return res.status(400).json({
          error: 'invalid_grant',
          error_description: 'Invalid authorization code, redirect_uri mismatch, or PKCE verification failed',
        });
      }

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
 *                 authorization_endpoint:
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
 *                 code_challenge_methods_supported:
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
