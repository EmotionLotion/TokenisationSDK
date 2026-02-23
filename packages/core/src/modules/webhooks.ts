import type { HttpClient } from '../utils/http.js';
import type { WebhookEndpoint, WebhookDelivery, PaginatedResponse } from '../types.js';
import { validate, SendTestEventInputSchema } from './validation.js';
import { z } from 'zod';

// ============================================================================
// Validation Schemas
// ============================================================================

const EventPatternSchema = z.string().regex(/^[a-z_]+(\.[a-z_*]+)*$/, 'Invalid event pattern');

const CreateEndpointSchema = z.object({
  url: z.string().url(),
  description: z.string().optional(),
  events: z.array(EventPatternSchema).min(1),
  metadata: z.record(z.unknown()).optional(),
});

const UpdateEndpointSchema = z.object({
  url: z.string().url().optional(),
  description: z.string().optional(),
  events: z.array(EventPatternSchema).optional(),
  status: z.enum(['active', 'disabled']).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const ListEndpointsParamsSchema = z.object({
  status: z.enum(['active', 'disabled']).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
});

const ListDeliveriesParamsSchema = z.object({
  endpointId: z.string().uuid().optional(),
  status: z.enum(['pending', 'sent', 'failed', 'dlq']).optional(),
  eventType: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
});

const UUIDSchema = z.string().uuid();

// ============================================================================
// Types
// ============================================================================

export interface CreateWebhookEndpointInput {
  /** The URL to receive webhook events (must be HTTPS in production) */
  url: string;
  /** Human-readable description */
  description?: string;
  /** Event patterns to subscribe to (e.g., ["transfer.*", "token.deployed"]) */
  events: string[];
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

export interface UpdateWebhookEndpointInput {
  /** New URL */
  url?: string;
  /** New description */
  description?: string;
  /** New event patterns */
  events?: string[];
  /** Enable or disable the endpoint */
  status?: 'active' | 'disabled';
  /** Updated metadata */
  metadata?: Record<string, unknown>;
}

export interface ListEndpointsParams {
  /** Filter by status */
  status?: 'active' | 'disabled';
  /** Maximum results */
  limit?: number;
  /** Pagination offset */
  offset?: number;
}

export interface ListDeliveriesParams {
  /** Filter by endpoint ID */
  endpointId?: string;
  /** Filter by delivery status */
  status?: 'pending' | 'sent' | 'failed' | 'dlq';
  /** Filter by event type */
  eventType?: string;
  /** Maximum results */
  limit?: number;
  /** Pagination offset */
  offset?: number;
}

export interface WebhookEndpointWithSecret extends WebhookEndpoint {
  /** Webhook signing secret (only returned on creation) */
  secret: string;
  /** Warning about storing the secret */
  warning?: string;
}

export interface TestWebhookResult {
  eventId: string;
  deliveryCount: number;
}

// ============================================================================
// Webhooks Module
// ============================================================================

/**
 * Webhooks module for managing webhook endpoints and deliveries.
 *
 * Webhooks enable real-time notifications when events occur in your organization.
 *
 * Features:
 * - HMAC-SHA256 signed payloads for security
 * - Automatic retries with exponential backoff
 * - Event pattern matching (e.g., "transfer.*" matches all transfer events)
 * - Delivery tracking and retry capabilities
 *
 * @example
 * ```typescript
 * // Create a webhook endpoint
 * const endpoint = await client.webhooks.create({
 *   url: 'https://api.example.com/webhooks',
 *   events: ['transfer.*', 'token.deployed'],
 *   description: 'Production webhook'
 * });
 *
 * // Save the secret for verifying signatures
 * console.log('Webhook secret:', endpoint.secret);
 * ```
 */
export class WebhooksModule {
  constructor(private http: HttpClient) {}

  // ============================================================================
  // Endpoint Management
  // ============================================================================

  /**
   * Creates a new webhook endpoint.
   *
   * **Important**: Save the returned `secret` securely. It will not be shown again
   * and is required to verify webhook signatures.
   *
   * @example
   * ```typescript
   * const endpoint = await client.webhooks.create({
   *   url: 'https://api.example.com/webhooks',
   *   events: ['transfer.*', 'investor.activated'],
   *   description: 'Main webhook endpoint'
   * });
   *
   * // Store this secret securely!
   * saveToVault(endpoint.id, endpoint.secret);
   * ```
   */
  async create(input: CreateWebhookEndpointInput): Promise<WebhookEndpointWithSecret> {
    const validated = validate(CreateEndpointSchema, input);
    const response = await this.http.post<WebhookEndpointWithSecret>('/api/v1/webhooks/endpoints', validated);
    return response.data;
  }

  /**
   * Retrieves a webhook endpoint by ID.
   * Note: The secret is not returned for security.
   */
  async get(id: string): Promise<WebhookEndpoint> {
    const validatedId = validate(UUIDSchema, id);
    const response = await this.http.get<WebhookEndpoint>(`/api/v1/webhooks/endpoints/${validatedId}`);
    return response.data;
  }

  /**
   * Lists all webhook endpoints.
   *
   * @example
   * ```typescript
   * // Get all active endpoints
   * const endpoints = await client.webhooks.list({ status: 'active' });
   * ```
   */
  async list(params?: ListEndpointsParams): Promise<PaginatedResponse<WebhookEndpoint>> {
    const validated = params ? validate(ListEndpointsParamsSchema, params) : undefined;
    return this.http.list<WebhookEndpoint>(
      '/api/v1/webhooks/endpoints',
      validated as Record<string, string | number | boolean | undefined>
    );
  }

  /**
   * Updates a webhook endpoint.
   *
   * @example
   * ```typescript
   * // Disable an endpoint
   * await client.webhooks.update(endpointId, { status: 'disabled' });
   *
   * // Change subscribed events
   * await client.webhooks.update(endpointId, {
   *   events: ['transfer.confirmed', 'transfer.settled']
   * });
   * ```
   */
  async update(id: string, input: UpdateWebhookEndpointInput): Promise<WebhookEndpoint> {
    const validatedId = validate(UUIDSchema, id);
    const validated = validate(UpdateEndpointSchema, input);
    const response = await this.http.patch<WebhookEndpoint>(
      `/api/v1/webhooks/endpoints/${validatedId}`,
      validated
    );
    return response.data;
  }

  /**
   * Deletes a webhook endpoint.
   * This also cancels any pending deliveries for this endpoint.
   */
  async delete(id: string): Promise<{ success: boolean; id: string }> {
    const validatedId = validate(UUIDSchema, id);
    const response = await this.http.delete<{ success: boolean; id: string }>(
      `/api/v1/webhooks/endpoints/${validatedId}`
    );
    return response.data;
  }

  /**
   * Rotates the signing secret for a webhook endpoint.
   *
   * **Important**: After rotation, update your webhook receiver to use the new secret.
   * The old secret will immediately stop working.
   *
   * @example
   * ```typescript
   * const result = await client.webhooks.rotateSecret(endpointId);
   * console.log('New secret:', result.secret);
   * // Update your webhook receiver configuration
   * ```
   */
  async rotateSecret(id: string): Promise<{ secret: string; warning: string }> {
    const validatedId = validate(UUIDSchema, id);
    const response = await this.http.post<{ secret: string; warning: string }>(
      `/api/v1/webhooks/endpoints/${validatedId}/rotate-secret`
    );
    return response.data;
  }

  // ============================================================================
  // Deliveries
  // ============================================================================

  /**
   * Lists webhook deliveries with optional filters.
   *
   * @example
   * ```typescript
   * // Get failed deliveries
   * const failed = await client.webhooks.listDeliveries({ status: 'failed' });
   *
   * // Get deliveries for a specific endpoint
   * const deliveries = await client.webhooks.listDeliveries({
   *   endpointId: 'endpoint-id',
   *   limit: 50
   * });
   * ```
   */
  async listDeliveries(params?: ListDeliveriesParams): Promise<PaginatedResponse<WebhookDelivery>> {
    const validated = params ? validate(ListDeliveriesParamsSchema, params) : undefined;
    return this.http.list<WebhookDelivery>(
      '/api/v1/webhooks/deliveries',
      validated as Record<string, string | number | boolean | undefined>
    );
  }

  /**
   * Retries a failed webhook delivery.
   *
   * @example
   * ```typescript
   * const result = await client.webhooks.retryDelivery(deliveryId);
   * if (result.success) {
   *   console.log('Delivery successful');
   * } else {
   *   console.log('Delivery failed:', result.error);
   * }
   * ```
   */
  async retryDelivery(deliveryId: string): Promise<{ success: boolean; error?: string }> {
    const validatedId = validate(UUIDSchema, deliveryId);
    const response = await this.http.post<{ success: boolean; error?: string }>(
      `/api/v1/webhooks/deliveries/${validatedId}/retry`
    );
    return response.data;
  }

  // ============================================================================
  // Testing
  // ============================================================================

  /**
   * Sends a test event to all matching webhook endpoints.
   * Useful for verifying webhook configuration.
   *
   * @example
   * ```typescript
   * // Test with a custom event
   * const result = await client.webhooks.sendTestEvent('test.event', {
   *   message: 'This is a test'
   * });
   * console.log(`Sent to ${result.deliveryCount} endpoints`);
   * ```
   */
  async sendTestEvent(
    eventType: string,
    data?: Record<string, unknown>
  ): Promise<TestWebhookResult> {
    const validated = validate(SendTestEventInputSchema, { eventType, data });
    const response = await this.http.post<TestWebhookResult>('/api/v1/webhooks/test', {
      eventType: validated.eventType,
      data: validated.data || { test: true, timestamp: new Date().toISOString() }
    });
    return response.data;
  }

  // ============================================================================
  // Signature Verification (Static Helper)
  // ============================================================================

  /**
   * Verifies a webhook signature.
   * Use this in your webhook receiver to validate that the request came from us.
   *
   * @param payload - The raw request body as a string
   * @param signature - The X-Webhook-Signature header value
   * @param secret - Your webhook endpoint secret
   * @param timestamp - The X-Webhook-Timestamp header value
   * @param tolerance - Maximum age of the webhook in seconds (default: 300 = 5 minutes)
   *
   * @example
   * ```typescript
   * import { WebhooksModule } from '@tokenisation/sdk';
   * import crypto from 'crypto';
   *
   * app.post('/webhook', (req, res) => {
   *   const isValid = WebhooksModule.verifySignature(
   *     JSON.stringify(req.body),
   *     req.headers['x-webhook-signature'],
   *     process.env.WEBHOOK_SECRET,
   *     parseInt(req.headers['x-webhook-timestamp'])
   *   );
   *
   *   if (!isValid) {
   *     return res.status(401).send('Invalid signature');
   *   }
   *
   *   // Process the webhook...
   *   res.status(200).send('OK');
   * });
   * ```
   */
  static verifySignature(
    payload: string,
    signature: string,
    secret: string,
    timestamp: number,
    tolerance: number = 300
  ): boolean {
    // Check timestamp is within tolerance
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - timestamp) > tolerance) {
      return false;
    }

    // Compute expected signature
    const signedPayloadStr = `${timestamp}.${payload}`;

    // Use dynamic import for crypto in browser/node compatibility
    if (typeof window === 'undefined') {
      // Node.js environment
      const crypto = require('crypto');
      const hmac = crypto.createHmac('sha256', secret);
      hmac.update(signedPayloadStr);
      const expectedSignature = `v1=${hmac.digest('hex')}`;
      return signature === expectedSignature;
    } else {
      // Browser environment - would need SubtleCrypto
      // For now, throw an error as this should be done server-side
      throw new Error('Webhook signature verification should be done server-side');
    }
  }
}
