import type { HttpClient } from '../utils/http.js';
import type { EventMessage, EventStatus, PaginatedResponse } from '../types.js';
import { validate, PurgeEventsInputSchema } from './validation.js';
import { z } from 'zod';

// ============================================================================
// Validation Schemas
// ============================================================================

const PublishEventSchema = z.object({
  topic: z.string().min(1).max(255),
  payload: z.record(z.unknown()),
  delayMs: z.number().int().nonnegative().optional(),
  deduplicationKey: z.string().max(255).optional(),
});

const ListEventsParamsSchema = z.object({
  topic: z.string().optional(),
  status: z.enum(['pending', 'processing', 'processed', 'failed', 'dlq']).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  limit: z.number().int().min(1).max(1000).optional(),
  offset: z.number().int().min(0).optional(),
});

const UUIDSchema = z.string().uuid();

// ============================================================================
// Types
// ============================================================================

export interface PublishEventInput {
  /** Event topic (e.g., "transfer.created", "token.deployed") */
  topic: string;
  /** Event payload data */
  payload: Record<string, unknown>;
  /** Delay before processing (milliseconds) */
  delayMs?: number;
  /** Key for deduplication - prevents duplicate events */
  deduplicationKey?: string;
}

export interface ListEventsParams {
  /** Filter by topic */
  topic?: string;
  /** Filter by status */
  status?: EventStatus;
  /** Filter events after this date */
  startDate?: string;
  /** Filter events before this date */
  endDate?: string;
  /** Maximum number of results */
  limit?: number;
  /** Pagination offset */
  offset?: number;
}

export interface EventStats {
  pending: number;
  processing: number;
  processed: number;
  failed: number;
  dlq: number;
  byTopic: Record<string, number>;
}

export interface ProcessingStatus {
  isProcessing: boolean;
}

// ============================================================================
// Events Module
// ============================================================================

/**
 * Events module for managing the internal event bus.
 *
 * The event bus provides:
 * - Asynchronous event publishing with optional delays
 * - Deduplication to prevent duplicate events
 * - Automatic retries with exponential backoff
 * - Dead letter queue (DLQ) for failed events
 * - Event statistics and monitoring
 *
 * Events are automatically dispatched to configured webhooks.
 */
export class EventsModule {
  constructor(private http: HttpClient) {}

  // ============================================================================
  // Publishing
  // ============================================================================

  /**
   * Publishes a single event to the event bus.
   *
   * @example
   * ```typescript
   * const event = await client.events.publish({
   *   topic: 'custom.notification',
   *   payload: { message: 'Hello world' },
   *   deduplicationKey: 'notification-123'
   * });
   * ```
   */
  async publish(input: PublishEventInput): Promise<EventMessage> {
    const validated = validate(PublishEventSchema, input);
    const response = await this.http.post<EventMessage>('/api/v1/eventbus/publish', validated);
    return response.data;
  }

  /**
   * Publishes multiple events in a batch (max 100).
   *
   * @example
   * ```typescript
   * const result = await client.events.publishBatch([
   *   { topic: 'notification.sent', payload: { userId: '1' } },
   *   { topic: 'notification.sent', payload: { userId: '2' } }
   * ]);
   * ```
   */
  async publishBatch(events: PublishEventInput[]): Promise<{ data: EventMessage[]; count: number }> {
    const validated = events.map(e => validate(PublishEventSchema, e));
    const response = await this.http.post<{ data: EventMessage[]; count: number }>(
      '/api/v1/eventbus/publish/batch',
      { events: validated }
    );
    return response.data;
  }

  // ============================================================================
  // Querying
  // ============================================================================

  /**
   * Lists events with optional filters.
   *
   * @example
   * ```typescript
   * // Get all pending events
   * const events = await client.events.list({ status: 'pending' });
   *
   * // Get transfer events from last 24 hours
   * const yesterday = new Date(Date.now() - 86400000).toISOString();
   * const events = await client.events.list({
   *   topic: 'transfer.*',
   *   startDate: yesterday
   * });
   * ```
   */
  async list(params?: ListEventsParams): Promise<PaginatedResponse<EventMessage>> {
    const validated = params ? validate(ListEventsParamsSchema, params) : undefined;
    return this.http.list<EventMessage>(
      '/api/v1/eventbus/events',
      validated as Record<string, string | number | boolean | undefined>
    );
  }

  /**
   * Retrieves a specific event by ID.
   */
  async get(id: string): Promise<EventMessage> {
    const validatedId = validate(UUIDSchema, id);
    const response = await this.http.get<EventMessage>(`/api/v1/eventbus/events/${validatedId}`);
    return response.data;
  }

  /**
   * Deletes an event (only processed or DLQ events can be deleted).
   */
  async delete(id: string): Promise<{ success: boolean }> {
    const validatedId = validate(UUIDSchema, id);
    const response = await this.http.delete<{ success: boolean }>(`/api/v1/eventbus/events/${validatedId}`);
    return response.data;
  }

  // ============================================================================
  // Dead Letter Queue
  // ============================================================================

  /**
   * Gets events in the dead letter queue (failed after max retries).
   *
   * @example
   * ```typescript
   * const dlqEvents = await client.events.getDeadLetterQueue();
   * console.log(`${dlqEvents.data.length} events in DLQ`);
   * ```
   */
  async getDeadLetterQueue(limit?: number): Promise<PaginatedResponse<EventMessage>> {
    return this.http.list<EventMessage>('/api/v1/eventbus/dlq', { limit });
  }

  /**
   * Retries a specific event (moves it back to pending).
   * Only works for failed or DLQ events.
   */
  async retry(id: string): Promise<EventMessage> {
    const validatedId = validate(UUIDSchema, id);
    const response = await this.http.post<EventMessage>(`/api/v1/eventbus/events/${validatedId}/retry`);
    return response.data;
  }

  /**
   * Retries all events in the dead letter queue.
   *
   * @example
   * ```typescript
   * const result = await client.events.retryAllDlq();
   * console.log(`Retried ${result.retried} events`);
   * ```
   */
  async retryAllDlq(): Promise<{ retried: number }> {
    const response = await this.http.post<{ retried: number }>('/api/v1/eventbus/dlq/retry-all');
    return response.data;
  }

  // ============================================================================
  // Statistics & Monitoring
  // ============================================================================

  /**
   * Gets event statistics including counts by status and topic.
   *
   * @example
   * ```typescript
   * const stats = await client.events.getStats();
   * console.log(`Pending: ${stats.pending}, Failed: ${stats.failed}`);
   * console.log('By topic:', stats.byTopic);
   * ```
   */
  async getStats(): Promise<EventStats> {
    const response = await this.http.get<EventStats>('/api/v1/eventbus/stats');
    return response.data;
  }

  /**
   * Gets the list of available event topics.
   */
  async getTopics(): Promise<{ topics: Record<string, string> }> {
    const response = await this.http.get<{ topics: Record<string, string> }>('/api/v1/eventbus/topics');
    return response.data;
  }

  // ============================================================================
  // Maintenance
  // ============================================================================

  /**
   * Purges old processed events to free up storage.
   *
   * @param olderThanDays Delete events older than this many days
   *
   * @example
   * ```typescript
   * // Delete processed events older than 30 days
   * const result = await client.events.purge(30);
   * console.log(`Deleted ${result.deleted} events`);
   * ```
   */
  async purge(olderThanDays: number): Promise<{ deleted: number }> {
    const validated = validate(PurgeEventsInputSchema, { olderThanDays });
    const response = await this.http.post<{ deleted: number }>('/api/v1/eventbus/purge', validated);
    return response.data;
  }
}
