/**
 * Webhook Queue
 *
 * Reliable webhook delivery with:
 * - Persistent queue
 * - Automatic retries with exponential backoff
 * - Dead letter queue for failed webhooks
 * - Signature verification
 */

import { v4 as uuidv4 } from 'uuid';
import { createHmac } from 'crypto';
import { ok, err, type Result } from '../core/types.js';
import { retry, type RetryOptions } from '../core/Retry.js';
import { getObservability, type ILogger, type IMetrics } from '../core/Observability.js';

// ============================================================================
// TYPES
// ============================================================================

export interface WebhookEvent {
  id: string;
  type: string;
  data: unknown;
  timestamp: string;
}

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  event: WebhookEvent;
  endpoint: string;
  status: 'pending' | 'processing' | 'delivered' | 'failed' | 'dead';
  attempts: number;
  maxAttempts: number;
  nextAttempt?: string;
  lastError?: string;
  response?: {
    status: number;
    body?: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface WebhookEndpoint {
  id: string;
  url: string;
  secret: string;
  events: string[]; // Event types to subscribe to, or ['*'] for all
  active: boolean;
  metadata?: Record<string, string>;
  createdAt: string;
}

export interface IWebhookStore {
  /** Save a delivery */
  saveDelivery(delivery: WebhookDelivery): Promise<void>;
  /** Get a delivery by ID */
  getDelivery(id: string): Promise<WebhookDelivery | null>;
  /** Get pending deliveries */
  getPendingDeliveries(limit: number): Promise<WebhookDelivery[]>;
  /** Get failed deliveries for an endpoint */
  getFailedDeliveries(webhookId: string, limit: number): Promise<WebhookDelivery[]>;
  /** Update delivery status */
  updateDelivery(id: string, updates: Partial<WebhookDelivery>): Promise<void>;
  /** Move to dead letter queue */
  moveToDead(id: string): Promise<void>;
  /** Get dead letter queue */
  getDeadLetterQueue(limit: number): Promise<WebhookDelivery[]>;
  /** Retry a dead delivery */
  retryDeadDelivery(id: string): Promise<void>;

  /** Save an endpoint */
  saveEndpoint(endpoint: WebhookEndpoint): Promise<void>;
  /** Get an endpoint by ID */
  getEndpoint(id: string): Promise<WebhookEndpoint | null>;
  /** Get endpoints for an event type */
  getEndpointsForEvent(eventType: string): Promise<WebhookEndpoint[]>;
  /** List all endpoints */
  listEndpoints(): Promise<WebhookEndpoint[]>;
  /** Delete an endpoint */
  deleteEndpoint(id: string): Promise<void>;
}

// ============================================================================
// IN-MEMORY STORE
// ============================================================================

export class InMemoryWebhookStore implements IWebhookStore {
  private deliveries: Map<string, WebhookDelivery> = new Map();
  private deadLetterQueue: Map<string, WebhookDelivery> = new Map();
  private endpoints: Map<string, WebhookEndpoint> = new Map();

  async saveDelivery(delivery: WebhookDelivery): Promise<void> {
    this.deliveries.set(delivery.id, delivery);
  }

  async getDelivery(id: string): Promise<WebhookDelivery | null> {
    return this.deliveries.get(id) ?? this.deadLetterQueue.get(id) ?? null;
  }

  async getPendingDeliveries(limit: number): Promise<WebhookDelivery[]> {
    const now = new Date().toISOString();
    return Array.from(this.deliveries.values())
      .filter(d =>
        (d.status === 'pending' || d.status === 'processing') &&
        (!d.nextAttempt || d.nextAttempt <= now)
      )
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(0, limit);
  }

  async getFailedDeliveries(webhookId: string, limit: number): Promise<WebhookDelivery[]> {
    return Array.from(this.deliveries.values())
      .filter(d => d.webhookId === webhookId && d.status === 'failed')
      .slice(0, limit);
  }

  async updateDelivery(id: string, updates: Partial<WebhookDelivery>): Promise<void> {
    const delivery = this.deliveries.get(id);
    if (delivery) {
      Object.assign(delivery, updates, { updatedAt: new Date().toISOString() });
    }
  }

  async moveToDead(id: string): Promise<void> {
    const delivery = this.deliveries.get(id);
    if (delivery) {
      delivery.status = 'dead';
      delivery.updatedAt = new Date().toISOString();
      this.deadLetterQueue.set(id, delivery);
      this.deliveries.delete(id);
    }
  }

  async getDeadLetterQueue(limit: number): Promise<WebhookDelivery[]> {
    return Array.from(this.deadLetterQueue.values()).slice(0, limit);
  }

  async retryDeadDelivery(id: string): Promise<void> {
    const delivery = this.deadLetterQueue.get(id);
    if (delivery) {
      delivery.status = 'pending';
      delivery.attempts = 0;
      delivery.nextAttempt = undefined;
      delivery.lastError = undefined;
      delivery.updatedAt = new Date().toISOString();
      this.deliveries.set(id, delivery);
      this.deadLetterQueue.delete(id);
    }
  }

  async saveEndpoint(endpoint: WebhookEndpoint): Promise<void> {
    this.endpoints.set(endpoint.id, endpoint);
  }

  async getEndpoint(id: string): Promise<WebhookEndpoint | null> {
    return this.endpoints.get(id) ?? null;
  }

  async getEndpointsForEvent(eventType: string): Promise<WebhookEndpoint[]> {
    return Array.from(this.endpoints.values())
      .filter(e => e.active && (e.events.includes('*') || e.events.includes(eventType)));
  }

  async listEndpoints(): Promise<WebhookEndpoint[]> {
    return Array.from(this.endpoints.values());
  }

  async deleteEndpoint(id: string): Promise<void> {
    this.endpoints.delete(id);
  }
}

// ============================================================================
// WEBHOOK QUEUE
// ============================================================================

export interface WebhookQueueConfig {
  /** Maximum delivery attempts (default: 5) */
  maxAttempts?: number;
  /** Base delay for retry in ms (default: 60000 = 1 minute) */
  retryDelayMs?: number;
  /** Maximum retry delay in ms (default: 3600000 = 1 hour) */
  maxRetryDelayMs?: number;
  /** Request timeout in ms (default: 30000) */
  timeoutMs?: number;
  /** How many deliveries to process concurrently (default: 10) */
  concurrency?: number;
  /** Polling interval in ms (default: 5000) */
  pollIntervalMs?: number;
}

export class WebhookQueue {
  private store: IWebhookStore;
  private config: Required<WebhookQueueConfig>;
  private logger: ILogger;
  private metrics: IMetrics;
  private running: boolean = false;
  private pollTimeout?: NodeJS.Timeout;

  constructor(store?: IWebhookStore, config?: WebhookQueueConfig) {
    this.store = store ?? new InMemoryWebhookStore();
    this.config = {
      maxAttempts: config?.maxAttempts ?? 5,
      retryDelayMs: config?.retryDelayMs ?? 60000,
      maxRetryDelayMs: config?.maxRetryDelayMs ?? 3600000,
      timeoutMs: config?.timeoutMs ?? 30000,
      concurrency: config?.concurrency ?? 10,
      pollIntervalMs: config?.pollIntervalMs ?? 5000,
    };

    const obs = getObservability();
    this.logger = obs.logger.child({ component: 'WebhookQueue' });
    this.metrics = obs.metrics;
  }

  /**
   * Register a webhook endpoint
   */
  async registerEndpoint(params: {
    url: string;
    events: string[];
    metadata?: Record<string, string>;
  }): Promise<WebhookEndpoint> {
    const endpoint: WebhookEndpoint = {
      id: uuidv4(),
      url: params.url,
      secret: this.generateSecret(),
      events: params.events,
      active: true,
      metadata: params.metadata,
      createdAt: new Date().toISOString(),
    };

    await this.store.saveEndpoint(endpoint);
    this.logger.info('Webhook endpoint registered', { endpointId: endpoint.id, url: endpoint.url });
    this.metrics.increment('webhook_endpoints_registered_total');

    return endpoint;
  }

  /**
   * Unregister a webhook endpoint
   */
  async unregisterEndpoint(id: string): Promise<void> {
    await this.store.deleteEndpoint(id);
    this.logger.info('Webhook endpoint unregistered', { endpointId: id });
  }

  /**
   * Get endpoint details
   */
  async getEndpoint(id: string): Promise<WebhookEndpoint | null> {
    return this.store.getEndpoint(id);
  }

  /**
   * List all endpoints
   */
  async listEndpoints(): Promise<WebhookEndpoint[]> {
    return this.store.listEndpoints();
  }

  /**
   * Enqueue an event for delivery
   */
  async enqueue(event: Omit<WebhookEvent, 'id' | 'timestamp'>): Promise<string[]> {
    const webhookEvent: WebhookEvent = {
      id: uuidv4(),
      type: event.type,
      data: event.data,
      timestamp: new Date().toISOString(),
    };

    const endpoints = await this.store.getEndpointsForEvent(event.type);
    const deliveryIds: string[] = [];

    for (const endpoint of endpoints) {
      const delivery: WebhookDelivery = {
        id: uuidv4(),
        webhookId: endpoint.id,
        event: webhookEvent,
        endpoint: endpoint.url,
        status: 'pending',
        attempts: 0,
        maxAttempts: this.config.maxAttempts,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await this.store.saveDelivery(delivery);
      deliveryIds.push(delivery.id);
    }

    this.logger.debug('Event enqueued', {
      eventId: webhookEvent.id,
      eventType: event.type,
      deliveries: deliveryIds.length,
    });

    this.metrics.increment('webhook_events_enqueued_total', { event_type: event.type });
    this.metrics.increment('webhook_deliveries_created_total', {}, deliveryIds.length);

    return deliveryIds;
  }

  /**
   * Start processing queue
   */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.logger.info('Webhook queue started');
    this.poll();
  }

  /**
   * Stop processing queue
   */
  stop(): void {
    this.running = false;
    if (this.pollTimeout) {
      clearTimeout(this.pollTimeout);
    }
    this.logger.info('Webhook queue stopped');
  }

  /**
   * Process pending deliveries
   */
  private async poll(): Promise<void> {
    if (!this.running) return;

    try {
      const deliveries = await this.store.getPendingDeliveries(this.config.concurrency);

      await Promise.all(deliveries.map(d => this.processDelivery(d)));
    } catch (error) {
      this.logger.error('Poll error', error instanceof Error ? error : new Error(String(error)));
    }

    // Schedule next poll
    this.pollTimeout = setTimeout(() => this.poll(), this.config.pollIntervalMs);
  }

  /**
   * Process a single delivery
   */
  private async processDelivery(delivery: WebhookDelivery): Promise<void> {
    const endpoint = await this.store.getEndpoint(delivery.webhookId);
    if (!endpoint || !endpoint.active) {
      await this.store.moveToDead(delivery.id);
      return;
    }

    await this.store.updateDelivery(delivery.id, { status: 'processing' });
    const stopTimer = this.metrics.startTimer('webhook_delivery_duration_ms');

    try {
      const result = await this.deliver(delivery, endpoint);

      if (result.success) {
        await this.store.updateDelivery(delivery.id, {
          status: 'delivered',
          attempts: delivery.attempts + 1,
          response: result.data,
        });

        this.logger.debug('Webhook delivered', {
          deliveryId: delivery.id,
          eventType: delivery.event.type,
        });

        this.metrics.increment('webhook_deliveries_success_total');
      } else {
        await this.handleFailure(delivery, result.error);
      }
    } catch (error) {
      await this.handleFailure(
        delivery,
        error instanceof Error ? error.message : 'Unknown error'
      );
    } finally {
      stopTimer();
    }
  }

  /**
   * Deliver webhook to endpoint
   */
  private async deliver(
    delivery: WebhookDelivery,
    endpoint: WebhookEndpoint
  ): Promise<Result<{ status: number; body?: string }, string>> {
    const payload = JSON.stringify(delivery.event);
    const signature = this.sign(payload, endpoint.secret);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

      const response = await fetch(endpoint.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-ID': delivery.webhookId,
          'X-Delivery-ID': delivery.id,
          'X-Event-Type': delivery.event.type,
          'X-Signature': signature,
          'X-Timestamp': delivery.event.timestamp,
        },
        body: payload,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const body = await response.text().catch(() => undefined);

      if (response.ok) {
        return ok({ status: response.status, body });
      }

      return err(`HTTP ${response.status}: ${body ?? response.statusText}`);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return err('Request timeout');
      }
      return err(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Handle delivery failure
   */
  private async handleFailure(delivery: WebhookDelivery, error: string): Promise<void> {
    const attempts = delivery.attempts + 1;

    if (attempts >= delivery.maxAttempts) {
      await this.store.updateDelivery(delivery.id, {
        attempts,
        lastError: error,
      });
      await this.store.moveToDead(delivery.id);

      this.logger.warn('Webhook moved to dead letter queue', {
        deliveryId: delivery.id,
        eventType: delivery.event.type,
        attempts,
        error,
      });

      this.metrics.increment('webhook_deliveries_dead_total');
    } else {
      const delay = Math.min(
        this.config.retryDelayMs * Math.pow(2, attempts - 1),
        this.config.maxRetryDelayMs
      );
      const nextAttempt = new Date(Date.now() + delay).toISOString();

      await this.store.updateDelivery(delivery.id, {
        status: 'pending',
        attempts,
        nextAttempt,
        lastError: error,
      });

      this.logger.debug('Webhook delivery scheduled for retry', {
        deliveryId: delivery.id,
        attempts,
        nextAttempt,
      });

      this.metrics.increment('webhook_deliveries_retry_total');
    }

    this.metrics.increment('webhook_deliveries_failed_total');
  }

  /**
   * Generate webhook secret
   */
  private generateSecret(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let secret = 'whsec_';
    for (let i = 0; i < 32; i++) {
      secret += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return secret;
  }

  /**
   * Sign webhook payload
   */
  private sign(payload: string, secret: string): string {
    const hmac = createHmac('sha256', secret);
    hmac.update(payload);
    return `sha256=${hmac.digest('hex')}`;
  }

  /**
   * Verify webhook signature (for consumers)
   */
  static verifySignature(payload: string, signature: string, secret: string): boolean {
    const hmac = createHmac('sha256', secret);
    hmac.update(payload);
    const expected = `sha256=${hmac.digest('hex')}`;
    return signature === expected;
  }

  /**
   * Get dead letter queue contents
   */
  async getDeadLetterQueue(limit: number = 100): Promise<WebhookDelivery[]> {
    return this.store.getDeadLetterQueue(limit);
  }

  /**
   * Retry a dead delivery
   */
  async retryDeadDelivery(id: string): Promise<void> {
    await this.store.retryDeadDelivery(id);
    this.logger.info('Dead delivery requeued', { deliveryId: id });
  }

  /**
   * Get delivery status
   */
  async getDelivery(id: string): Promise<WebhookDelivery | null> {
    return this.store.getDelivery(id);
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let defaultWebhookQueue: WebhookQueue | undefined;

export function getWebhookQueue(): WebhookQueue {
  if (!defaultWebhookQueue) {
    defaultWebhookQueue = new WebhookQueue();
  }
  return defaultWebhookQueue;
}

export function configureWebhookQueue(
  store?: IWebhookStore,
  config?: WebhookQueueConfig
): WebhookQueue {
  defaultWebhookQueue = new WebhookQueue(store, config);
  return defaultWebhookQueue;
}

export default WebhookQueue;
