/**
 * Webhook Test Receiver
 *
 * Test utility to capture and verify webhooks during E2E testing:
 * - HTTP server on configurable port
 * - Event deduplication by eventId
 * - Signature verification (HMAC-SHA256)
 * - Ordered event assertion
 */

import { createServer, Server, IncomingMessage, ServerResponse } from 'http';
import { createHmac } from 'crypto';

// ============================================================================
// TYPES
// ============================================================================

export interface WebhookEvent {
  id: string;
  type: string;
  ticketId: string;
  occurredAt: string;
  data: Record<string, unknown>;
  pnr?: string;
}

export interface ReceivedWebhook {
  /** The webhook event payload */
  event: WebhookEvent;
  /** Timestamp when webhook was received */
  receivedAt: string;
  /** The signature from the request header */
  signature: string;
  /** The timestamp from the request header */
  timestamp: string;
  /** The nonce from the request header */
  nonce: string;
  /** The delivery ID for idempotency */
  deliveryId: string;
  /** Whether signature was valid */
  signatureValid: boolean;
  /** Raw request body */
  rawBody: string;
  /** HTTP headers */
  headers: Record<string, string | string[] | undefined>;
}

export interface WebhookReceiverOptions {
  /** Port to listen on (default: 9999) */
  port?: number;
  /** Secret for HMAC signature verification */
  secret: string;
  /** Allowed timestamp skew in seconds (default: 300) */
  timestampToleranceSeconds?: number;
}

// ============================================================================
// WEBHOOK RECEIVER CLASS
// ============================================================================

export class WebhookReceiver {
  private server: Server | null = null;
  private port: number;
  private secret: string;
  private timestampTolerance: number;

  /** All received webhooks in order */
  private webhooks: ReceivedWebhook[] = [];

  /** Deduplicated events by eventId */
  private eventsByEventId: Map<string, ReceivedWebhook> = new Map();

  /** Deduplicated events by deliveryId */
  private eventsByDeliveryId: Map<string, ReceivedWebhook> = new Map();

  /** Events indexed by ticket ID */
  private eventsByTicketId: Map<string, ReceivedWebhook[]> = new Map();

  /** Events indexed by type */
  private eventsByType: Map<string, ReceivedWebhook[]> = new Map();

  /** Waiting resolvers for event assertions */
  private waiters: Array<{
    predicate: (webhook: ReceivedWebhook) => boolean;
    resolve: (webhook: ReceivedWebhook) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }> = [];

  constructor(options: WebhookReceiverOptions) {
    this.port = options.port ?? 9999;
    this.secret = options.secret;
    this.timestampTolerance = options.timestampToleranceSeconds ?? 300;
  }

  /**
   * Start the webhook receiver server
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = createServer((req, res) => this.handleRequest(req, res));

      this.server.on('error', (err) => {
        reject(err);
      });

      this.server.listen(this.port, () => {
        console.log(`Webhook receiver listening on port ${this.port}`);
        resolve();
      });
    });
  }

  /**
   * Stop the webhook receiver server
   */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          console.log('Webhook receiver stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Get the URL for the webhook receiver
   */
  getUrl(): string {
    return `http://localhost:${this.port}/webhook`;
  }

  /**
   * Handle incoming webhook request
   */
  private handleRequest(req: IncomingMessage, res: ServerResponse): void {
    let body = '';

    req.on('data', (chunk) => {
      body += chunk.toString();
    });

    req.on('end', () => {
      try {
        const receivedAt = new Date().toISOString();

        // Parse headers
        const signature = this.getHeader(req, 'x-webhook-signature') ?? '';
        const timestamp = this.getHeader(req, 'x-webhook-timestamp') ?? '';
        const nonce = this.getHeader(req, 'x-webhook-nonce') ?? '';
        const deliveryId = this.getHeader(req, 'x-webhook-delivery-id') ?? '';

        // Parse body
        const payload = JSON.parse(body);
        const event: WebhookEvent = payload.event ?? payload;

        // Verify signature
        const signatureValid = this.verifySignature(body, signature, timestamp, nonce);

        // Create received webhook record
        const webhook: ReceivedWebhook = {
          event,
          receivedAt,
          signature,
          timestamp,
          nonce,
          deliveryId,
          signatureValid,
          rawBody: body,
          headers: this.extractHeaders(req),
        };

        // Store webhook (always, even duplicates for debugging)
        this.webhooks.push(webhook);

        // Index by ticket ID
        const ticketEvents = this.eventsByTicketId.get(event.ticketId) ?? [];
        ticketEvents.push(webhook);
        this.eventsByTicketId.set(event.ticketId, ticketEvents);

        // Index by type
        const typeEvents = this.eventsByType.get(event.type) ?? [];
        typeEvents.push(webhook);
        this.eventsByType.set(event.type, typeEvents);

        // Deduplicate by eventId and deliveryId
        const isDuplicateByEventId = this.eventsByEventId.has(event.id);
        const isDuplicateByDeliveryId = deliveryId && this.eventsByDeliveryId.has(deliveryId);

        if (!isDuplicateByEventId) {
          this.eventsByEventId.set(event.id, webhook);
        }
        if (deliveryId && !isDuplicateByDeliveryId) {
          this.eventsByDeliveryId.set(deliveryId, webhook);
        }

        // Notify waiters
        this.notifyWaiters(webhook);

        // Return success (idempotent - always 200 even for duplicates)
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          received: true,
          eventId: event.id,
          deliveryId,
          duplicate: isDuplicateByEventId || isDuplicateByDeliveryId,
        }));
      } catch (error) {
        console.error('Webhook processing error:', error);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid webhook payload' }));
      }
    });
  }

  /**
   * Extract header value (handles array values)
   */
  private getHeader(req: IncomingMessage, name: string): string | undefined {
    const value = req.headers[name.toLowerCase()];
    return Array.isArray(value) ? value[0] : value;
  }

  /**
   * Extract all headers as a plain object
   */
  private extractHeaders(req: IncomingMessage): Record<string, string | string[] | undefined> {
    return { ...req.headers };
  }

  /**
   * Verify HMAC-SHA256 signature
   */
  private verifySignature(
    body: string,
    signature: string,
    timestamp: string,
    nonce: string
  ): boolean {
    if (!signature || !timestamp) {
      return false;
    }

    // Check timestamp is within tolerance
    const requestTime = parseInt(timestamp, 10);
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - requestTime) > this.timestampTolerance) {
      return false;
    }

    // Compute expected signature
    const signaturePayload = `${timestamp}.${nonce}.${body}`;
    const expectedSignature = createHmac('sha256', this.secret)
      .update(signaturePayload)
      .digest('hex');

    // Compare signatures (constant-time comparison)
    return this.constantTimeCompare(signature, expectedSignature);
  }

  /**
   * Constant-time string comparison to prevent timing attacks
   */
  private constantTimeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }

    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return result === 0;
  }

  /**
   * Notify waiting assertions
   */
  private notifyWaiters(webhook: ReceivedWebhook): void {
    const matchedWaiters: typeof this.waiters = [];

    for (const waiter of this.waiters) {
      if (waiter.predicate(webhook)) {
        clearTimeout(waiter.timeout);
        waiter.resolve(webhook);
        matchedWaiters.push(waiter);
      }
    }

    // Remove matched waiters
    this.waiters = this.waiters.filter((w) => !matchedWaiters.includes(w));
  }

  // ============================================================================
  // QUERY METHODS
  // ============================================================================

  /**
   * Get all received webhooks in order
   */
  getAllWebhooks(): ReceivedWebhook[] {
    return [...this.webhooks];
  }

  /**
   * Get deduplicated events (by eventId)
   */
  getUniqueEvents(): ReceivedWebhook[] {
    return Array.from(this.eventsByEventId.values());
  }

  /**
   * Get events for a specific ticket
   */
  getEventsForTicket(ticketId: string): ReceivedWebhook[] {
    return this.eventsByTicketId.get(ticketId) ?? [];
  }

  /**
   * Get events of a specific type
   */
  getEventsByType(type: string): ReceivedWebhook[] {
    return this.eventsByType.get(type) ?? [];
  }

  /**
   * Check if an event with given eventId was received
   */
  hasEvent(eventId: string): boolean {
    return this.eventsByEventId.has(eventId);
  }

  /**
   * Get duplicate deliveries for a given eventId
   */
  getDuplicates(eventId: string): ReceivedWebhook[] {
    return this.webhooks.filter((w) => w.event.id === eventId);
  }

  /**
   * Clear all received webhooks
   */
  clear(): void {
    this.webhooks = [];
    this.eventsByEventId.clear();
    this.eventsByDeliveryId.clear();
    this.eventsByTicketId.clear();
    this.eventsByType.clear();

    // Clear any pending waiters
    for (const waiter of this.waiters) {
      clearTimeout(waiter.timeout);
      waiter.reject(new Error('Webhook receiver cleared'));
    }
    this.waiters = [];
  }

  // ============================================================================
  // ASSERTION METHODS
  // ============================================================================

  /**
   * Wait for a webhook matching the predicate
   */
  async waitForWebhook(
    predicate: (webhook: ReceivedWebhook) => boolean,
    timeoutMs: number = 5000
  ): Promise<ReceivedWebhook> {
    // Check if already received
    const existing = this.webhooks.find(predicate);
    if (existing) {
      return existing;
    }

    // Wait for it
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const index = this.waiters.findIndex((w) => w.resolve === resolve);
        if (index >= 0) {
          this.waiters.splice(index, 1);
        }
        reject(new Error(`Timeout waiting for webhook after ${timeoutMs}ms`));
      }, timeoutMs);

      this.waiters.push({ predicate, resolve, reject, timeout });
    });
  }

  /**
   * Wait for a specific event type
   */
  async waitForEventType(type: string, timeoutMs: number = 5000): Promise<ReceivedWebhook> {
    return this.waitForWebhook((w) => w.event.type === type, timeoutMs);
  }

  /**
   * Wait for a specific event for a ticket
   */
  async waitForTicketEvent(
    ticketId: string,
    type: string,
    timeoutMs: number = 5000
  ): Promise<ReceivedWebhook> {
    return this.waitForWebhook(
      (w) => w.event.ticketId === ticketId && w.event.type === type,
      timeoutMs
    );
  }

  /**
   * Assert events arrived in expected order for a ticket
   */
  assertEventOrder(ticketId: string, expectedTypes: string[]): void {
    const events = this.getEventsForTicket(ticketId);
    const actualTypes = events.map((e) => e.event.type);

    // Filter to only expected types (ignore others)
    const relevantTypes = actualTypes.filter((t) => expectedTypes.includes(t));

    // Check order
    let lastIndex = -1;
    for (const expectedType of expectedTypes) {
      const index = relevantTypes.indexOf(expectedType);
      if (index === -1) {
        throw new Error(
          `Expected event type "${expectedType}" not found. ` +
          `Received: ${relevantTypes.join(', ')}`
        );
      }
      if (index < lastIndex) {
        throw new Error(
          `Event "${expectedType}" arrived out of order. ` +
          `Expected order: ${expectedTypes.join(' → ')}. ` +
          `Actual order: ${relevantTypes.join(' → ')}`
        );
      }
      lastIndex = index;
    }
  }

  /**
   * Assert all signatures are valid
   */
  assertAllSignaturesValid(): void {
    const invalidWebhooks = this.webhooks.filter((w) => !w.signatureValid);
    if (invalidWebhooks.length > 0) {
      throw new Error(
        `${invalidWebhooks.length} webhooks had invalid signatures: ` +
        invalidWebhooks.map((w) => w.event.id).join(', ')
      );
    }
  }

  /**
   * Assert no duplicate event IDs were processed
   */
  assertNoDuplicateEvents(): void {
    const eventIds = this.webhooks.map((w) => w.event.id);
    const uniqueIds = new Set(eventIds);
    if (eventIds.length !== uniqueIds.size) {
      const duplicates = eventIds.filter((id, index) => eventIds.indexOf(id) !== index);
      throw new Error(`Duplicate event IDs received: ${Array.from(new Set(duplicates)).join(', ')}`);
    }
  }

  /**
   * Get webhook count statistics
   */
  getStats(): {
    total: number;
    unique: number;
    duplicates: number;
    validSignatures: number;
    invalidSignatures: number;
    byType: Record<string, number>;
  } {
    const validSignatures = this.webhooks.filter((w) => w.signatureValid).length;
    const byType: Record<string, number> = {};

    for (const [type, events] of Array.from(this.eventsByType.entries())) {
      byType[type] = events.length;
    }

    return {
      total: this.webhooks.length,
      unique: this.eventsByEventId.size,
      duplicates: this.webhooks.length - this.eventsByEventId.size,
      validSignatures,
      invalidSignatures: this.webhooks.length - validSignatures,
      byType,
    };
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Create and start a webhook receiver for testing
 */
export async function createWebhookReceiver(
  options: WebhookReceiverOptions
): Promise<WebhookReceiver> {
  const receiver = new WebhookReceiver(options);
  await receiver.start();
  return receiver;
}

/**
 * Generate a test webhook signature
 */
export function generateWebhookSignature(
  body: string,
  secret: string,
  timestamp?: string,
  nonce?: string
): { signature: string; timestamp: string; nonce: string } {
  const ts = timestamp ?? Math.floor(Date.now() / 1000).toString();
  const n = nonce ?? Math.random().toString(36).substring(2, 15);

  const signaturePayload = `${ts}.${n}.${body}`;
  const signature = createHmac('sha256', secret)
    .update(signaturePayload)
    .digest('hex');

  return { signature, timestamp: ts, nonce: n };
}
