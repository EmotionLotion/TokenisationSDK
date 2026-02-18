/**
 * Event Stream Service
 *
 * Provides real-time event streaming by polling the domainEventsOutbox table
 * for published events and delivering them to SSE subscribers.
 */

import { db, schema } from '../config/database.js';
import { eq, and, gt, gte, desc, asc, inArray, sql } from 'drizzle-orm';
import { logger } from '../middleware/logger.js';

const { domainEventsOutbox } = schema;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StreamFilters {
  orgId: string;
  assetId?: string;
  aggregateType?: string;
  eventTypes?: string[];
}

export interface StreamEvent {
  id: string;
  eventId: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: unknown;
  metadata: unknown;
  sequence: number;
  createdAt: Date | null;
}

export type EventCallback = (event: StreamEvent) => void;
export type ErrorCallback = (error: Error) => void;

// ---------------------------------------------------------------------------
// Subscription
// ---------------------------------------------------------------------------

export interface Subscription {
  id: string;
  filters: StreamFilters;
  onEvent: EventCallback;
  onError?: ErrorCallback;
  cursor: string | null;        // globalSequence or id of last delivered event
  active: boolean;
}

const activeSubscriptions = new Map<string, Subscription>();
let pollingInterval: ReturnType<typeof setInterval> | null = null;

const POLL_INTERVAL_MS = 1_000;
const MAX_EVENTS_PER_POLL = 100;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a new event stream subscription.
 * Returns a subscription ID that can be used to unsubscribe.
 */
export function subscribe(
  filters: StreamFilters,
  onEvent: EventCallback,
  onError?: ErrorCallback,
  lastEventId?: string | null,
): string {
  const id = `sub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const subscription: Subscription = {
    id,
    filters,
    onEvent,
    onError,
    cursor: lastEventId ?? null,
    active: true,
  };

  activeSubscriptions.set(id, subscription);
  ensurePolling();

  logger.info(`[EventStream] New subscription ${id} for org ${filters.orgId}`, {
    filters,
    lastEventId,
  });

  return id;
}

/**
 * Remove a subscription.
 */
export function unsubscribe(subscriptionId: string): void {
  const sub = activeSubscriptions.get(subscriptionId);
  if (sub) {
    sub.active = false;
    activeSubscriptions.delete(subscriptionId);
    logger.info(`[EventStream] Unsubscribed ${subscriptionId}`);
  }

  if (activeSubscriptions.size === 0) {
    stopPolling();
  }
}

/**
 * Replay events from a given cursor for a subscription's filters.
 * Used when a client reconnects with Last-Event-Id.
 */
export async function replay(
  filters: StreamFilters,
  afterEventId: string,
  limit: number = MAX_EVENTS_PER_POLL,
): Promise<StreamEvent[]> {
  // Find the row matching the afterEventId to get its globalSequence
  const anchor = await db
    .select({ globalSequence: domainEventsOutbox.globalSequence })
    .from(domainEventsOutbox)
    .where(eq(domainEventsOutbox.eventId, afterEventId))
    .limit(1);

  if (anchor.length === 0) {
    // Unknown cursor – return latest events instead
    return fetchEvents(filters, null, limit);
  }

  const anchorSeq = anchor[0].globalSequence;
  return fetchEvents(filters, anchorSeq, limit);
}

/**
 * Get active subscription count (for health/metrics).
 */
export function getActiveSubscriptionCount(): number {
  return activeSubscriptions.size;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

async function fetchEvents(
  filters: StreamFilters,
  afterGlobalSequence: number | null,
  limit: number,
): Promise<StreamEvent[]> {
  const conditions = [
    eq(domainEventsOutbox.orgId, filters.orgId),
    eq(domainEventsOutbox.status, 'published'),
  ];

  if (afterGlobalSequence != null) {
    conditions.push(gt(domainEventsOutbox.globalSequence, afterGlobalSequence));
  }

  if (filters.assetId) {
    conditions.push(eq(domainEventsOutbox.aggregateId, filters.assetId));
  }

  if (filters.aggregateType) {
    conditions.push(eq(domainEventsOutbox.aggregateType, filters.aggregateType));
  }

  if (filters.eventTypes && filters.eventTypes.length > 0) {
    conditions.push(inArray(domainEventsOutbox.eventType, filters.eventTypes));
  }

  const rows = await db
    .select()
    .from(domainEventsOutbox)
    .where(and(...conditions))
    .orderBy(asc(domainEventsOutbox.globalSequence))
    .limit(limit);

  return rows.map(toStreamEvent);
}

function toStreamEvent(row: typeof domainEventsOutbox.$inferSelect): StreamEvent {
  return {
    id: row.eventId,
    eventId: row.eventId,
    eventType: row.eventType,
    aggregateType: row.aggregateType,
    aggregateId: row.aggregateId,
    payload: row.payload,
    metadata: row.metadata,
    sequence: row.sequence,
    createdAt: row.createdAt,
  };
}

async function pollOnce(): Promise<void> {
  if (activeSubscriptions.size === 0) return;

  // Group subscriptions by orgId to minimize queries
  const byOrg = new Map<string, Subscription[]>();
  for (const sub of activeSubscriptions.values()) {
    if (!sub.active) continue;
    const list = byOrg.get(sub.filters.orgId) || [];
    list.push(sub);
    byOrg.set(sub.filters.orgId, list);
  }

  for (const [orgId, subs] of byOrg) {
    try {
      // Find the earliest cursor among all subs for this org
      let minSeq: number | null = null;
      for (const sub of subs) {
        if (sub.cursor === null) {
          minSeq = null;
          break;
        }
        // cursor stores the globalSequence as string
        const seq = parseInt(sub.cursor, 10);
        if (!isNaN(seq) && (minSeq === null || seq < minSeq)) {
          minSeq = seq;
        }
      }

      const events = await fetchEvents(
        { orgId },
        minSeq,
        MAX_EVENTS_PER_POLL,
      );

      if (events.length === 0) continue;

      // Dispatch events to matching subscriptions
      for (const event of events) {
        for (const sub of subs) {
          if (!sub.active) continue;
          if (!matchesFilters(event, sub.filters)) continue;

          // Skip events the subscription already saw
          if (sub.cursor !== null) {
            const cursorSeq = parseInt(sub.cursor, 10);
            if (!isNaN(cursorSeq) && event.sequence <= cursorSeq) continue;
          }

          try {
            sub.onEvent(event);
          } catch (err) {
            logger.error(`[EventStream] Callback error for ${sub.id}`, { error: err });
            sub.onError?.(err instanceof Error ? err : new Error(String(err)));
          }
        }
      }

      // Update cursors to the latest globalSequence
      const latestRow = events[events.length - 1];
      // We need the globalSequence from the raw query – use sequence as fallback
      const latestSeqStr = String(latestRow.sequence);
      for (const sub of subs) {
        if (!sub.active) continue;
        // Only advance if we delivered at least one event to this sub
        sub.cursor = latestSeqStr;
      }
    } catch (err) {
      logger.error(`[EventStream] Poll error for org ${orgId}`, { error: err });
    }
  }
}

function matchesFilters(event: StreamEvent, filters: StreamFilters): boolean {
  if (filters.assetId && event.aggregateId !== filters.assetId) return false;
  if (filters.aggregateType && event.aggregateType !== filters.aggregateType) return false;
  if (filters.eventTypes && filters.eventTypes.length > 0) {
    if (!filters.eventTypes.includes(event.eventType)) return false;
  }
  return true;
}

function ensurePolling(): void {
  if (pollingInterval) return;
  pollingInterval = setInterval(() => {
    pollOnce().catch((err) => {
      logger.error('[EventStream] Poll cycle failed', err);
    });
  }, POLL_INTERVAL_MS);
  logger.info('[EventStream] Polling started');
}

function stopPolling(): void {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
    logger.info('[EventStream] Polling stopped (no active subscriptions)');
  }
}
