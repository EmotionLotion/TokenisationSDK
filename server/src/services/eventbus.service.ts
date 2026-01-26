import { db, schema } from '../config/database.js';
import { eq, and, desc, lt, isNull, or, gte, inArray, sql } from 'drizzle-orm';
import { randomBytes } from 'crypto';
import { NotFoundError, ValidationError } from '../middleware/errorHandler.js';
import * as webhookService from './webhook.service.js';
import { logger } from '../middleware/logger.js';

const { eventBusQueue } = schema;

// ============================================================================
// Types & Interfaces
// ============================================================================

export type EventStatus = 'pending' | 'processing' | 'processed' | 'failed' | 'dlq';

export interface EventMessage {
  id: string;
  orgId: string;
  topic: string;
  payload: Record<string, unknown>;
  status: EventStatus;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  lastAttemptAt: Date | null;
  processAfter: Date | null;
  createdAt: Date;
}

export interface PublishEventInput {
  orgId: string;
  topic: string;
  payload: Record<string, unknown>;
  delayMs?: number;
  deduplicationKey?: string;
}

export interface EventHandler {
  topic: string | RegExp;
  handler: (event: EventMessage) => Promise<void>;
  name: string;
}

// ============================================================================
// Event Topics
// ============================================================================

export const TOPICS = {
  // Transfer events
  TRANSFER_CREATED: 'transfer.created',
  TRANSFER_PRECHECKED: 'transfer.prechecked',
  TRANSFER_APPROVED: 'transfer.approved',
  TRANSFER_CANCELLED: 'transfer.cancelled',
  TRANSFER_SIGNED: 'transfer.signed',
  TRANSFER_SUBMITTED: 'transfer.submitted',
  TRANSFER_CONFIRMED: 'transfer.confirmed',
  TRANSFER_RECONCILED: 'transfer.reconciled',
  TRANSFER_SETTLED: 'transfer.settled',
  TRANSFER_FAILED: 'transfer.failed',

  // Token events
  TOKEN_CREATED: 'token.created',
  TOKEN_DEPLOYED: 'token.deployed',
  TOKEN_PAUSED: 'token.paused',
  TOKEN_UNPAUSED: 'token.unpaused',
  TOKEN_FROZEN: 'token.frozen',
  TOKEN_ISSUED: 'token.issued',
  TOKEN_REDEEMED: 'token.redeemed',

  // Investor events
  INVESTOR_CREATED: 'investor.created',
  INVESTOR_ACTIVATED: 'investor.active',
  INVESTOR_SUSPENDED: 'investor.suspended',
  INVESTOR_KYC_STARTED: 'investor.kyc_started',
  INVESTOR_KYC_APPROVED: 'investor.kyc_approved',
  INVESTOR_KYC_REJECTED: 'investor.kyc_rejected',

  // Compliance events
  COMPLIANCE_CHECK_PASSED: 'compliance.check_passed',
  COMPLIANCE_CHECK_FAILED: 'compliance.check_failed',
  DECISION_CREATED: 'decision.created',

  // DLD events
  DLD_TITLE_REGISTERED: 'dld.title_registered',
  DLD_TITLE_VERIFIED: 'dld.title_verified',
  DLD_EVENT_RECEIVED: 'dld.event_received',
  DLD_CONFLICT_DETECTED: 'dld.conflict_detected',

  // Chain events
  CHAIN_TX_SUBMITTED: 'chain.tx_submitted',
  CHAIN_TX_CONFIRMED: 'chain.tx_confirmed',
  CHAIN_TX_FAILED: 'chain.tx_failed',

  // Webhook events
  WEBHOOK_DELIVERED: 'webhook.delivered',
  WEBHOOK_FAILED: 'webhook.failed',
};

// ============================================================================
// Event Publishing
// ============================================================================

export async function publish(input: PublishEventInput): Promise<EventMessage> {
  const processAfter = input.delayMs
    ? new Date(Date.now() + input.delayMs)
    : null;

  // Check for deduplication
  if (input.deduplicationKey) {
    const existing = await db.query.eventBusQueue.findFirst({
      where: and(
        eq(eventBusQueue.orgId, input.orgId),
        eq(eventBusQueue.topic, input.topic),
        eq(eventBusQueue.deduplicationKey, input.deduplicationKey),
        or(
          eq(eventBusQueue.status, 'pending'),
          eq(eventBusQueue.status, 'processing')
        )
      ),
    });

    if (existing) {
      return existing as EventMessage;
    }
  }

  const [event] = await db.insert(eventBusQueue).values({
    orgId: input.orgId,
    topic: input.topic,
    payload: input.payload as any,
    status: 'pending',
    attempts: 0,
    maxAttempts: 5,
    processAfter,
    deduplicationKey: input.deduplicationKey,
  }).returning();

  return event as EventMessage;
}

export async function publishBatch(events: PublishEventInput[]): Promise<EventMessage[]> {
  if (events.length === 0) return [];

  const results: EventMessage[] = [];

  for (const event of events) {
    const result = await publish(event);
    results.push(result);
  }

  return results;
}

// ============================================================================
// Event Consumption
// ============================================================================

// Registered handlers
const handlers: EventHandler[] = [];

export function registerHandler(handler: EventHandler): void {
  handlers.push(handler);
  logger.info(`Event handler registered: ${handler.name} for topic ${handler.topic}`);
}

export function unregisterHandler(name: string): void {
  const index = handlers.findIndex(h => h.name === name);
  if (index >= 0) {
    handlers.splice(index, 1);
  }
}

function matchesTopic(pattern: string | RegExp, topic: string): boolean {
  if (typeof pattern === 'string') {
    if (pattern === '*') return true;
    if (pattern.endsWith('.*')) {
      return topic.startsWith(pattern.slice(0, -2));
    }
    return pattern === topic;
  }
  return pattern.test(topic);
}

async function processEvent(event: EventMessage): Promise<void> {
  // Find matching handlers
  const matchingHandlers = handlers.filter(h => matchesTopic(h.topic, event.topic));

  if (matchingHandlers.length === 0) {
    // No handlers, just mark as processed
    await db.update(eventBusQueue)
      .set({ status: 'processed', processedAt: new Date() })
      .where(eq(eventBusQueue.id, event.id));
    return;
  }

  // Execute all handlers
  const errors: string[] = [];

  for (const handler of matchingHandlers) {
    try {
      await handler.handler(event);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      errors.push(`${handler.name}: ${errorMsg}`);
      logger.error(`Event handler ${handler.name} failed`, { error: error as Error });
    }
  }

  if (errors.length > 0) {
    throw new Error(errors.join('; '));
  }
}

// ============================================================================
// Event Processing Loop
// ============================================================================

let processingActive = false;

export async function startProcessing(config: {
  batchSize?: number;
  pollingInterval?: number;
} = {}): Promise<void> {
  const { batchSize = 100, pollingInterval = 1000 } = config;

  if (processingActive) {
    throw new ValidationError('Event processing already active');
  }

  processingActive = true;
  logger.info('Event bus processing started');

  while (processingActive) {
    try {
      const processed = await processBatch(batchSize);
      if (processed === 0) {
        // No events to process, wait before polling again
        await new Promise(resolve => setTimeout(resolve, pollingInterval));
      }
    } catch (error) {
      logger.error('Event processing error', { error: error as Error });
      await new Promise(resolve => setTimeout(resolve, pollingInterval * 3));
    }
  }
}

export function stopProcessing(): void {
  processingActive = false;
  logger.info('Event bus processing stopped');
}

export function isProcessing(): boolean {
  return processingActive;
}

async function processBatch(batchSize: number): Promise<number> {
  const now = new Date();

  // Get pending events that are ready to process
  const events = await db.select()
    .from(eventBusQueue)
    .where(
      and(
        eq(eventBusQueue.status, 'pending'),
        or(
          isNull(eventBusQueue.processAfter),
          lt(eventBusQueue.processAfter, now)
        )
      )
    )
    .orderBy(eventBusQueue.createdAt)
    .limit(batchSize);

  let processed = 0;

  for (const event of events) {
    const typedEvent = event as EventMessage;

    // Mark as processing
    await db.update(eventBusQueue)
      .set({ status: 'processing' })
      .where(eq(eventBusQueue.id, event.id));

    try {
      await processEvent(typedEvent);

      // Mark as processed
      await db.update(eventBusQueue)
        .set({
          status: 'processed',
          processedAt: new Date(),
          attempts: typedEvent.attempts + 1,
          lastAttemptAt: new Date(),
        })
        .where(eq(eventBusQueue.id, event.id));

      // Dispatch to webhooks
      await dispatchToWebhooks(typedEvent);

      processed++;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      const newAttempts = typedEvent.attempts + 1;

      if (newAttempts >= typedEvent.maxAttempts) {
        // Move to DLQ
        await db.update(eventBusQueue)
          .set({
            status: 'dlq',
            attempts: newAttempts,
            lastError: errorMsg,
            lastAttemptAt: new Date(),
          })
          .where(eq(eventBusQueue.id, event.id));
      } else {
        // Retry with exponential backoff
        const retryDelay = Math.pow(2, newAttempts) * 1000; // 2^n seconds
        await db.update(eventBusQueue)
          .set({
            status: 'pending',
            attempts: newAttempts,
            lastError: errorMsg,
            lastAttemptAt: new Date(),
            processAfter: new Date(Date.now() + retryDelay),
          })
          .where(eq(eventBusQueue.id, event.id));
      }
    }
  }

  return processed;
}

async function dispatchToWebhooks(event: EventMessage): Promise<void> {
  try {
    await webhookService.dispatchEvent(event.orgId, event.topic, event.payload);
  } catch (error) {
    logger.error(`Failed to dispatch webhook for event ${event.id}`, { error: error as Error });
  }
}

// ============================================================================
// Event Queries
// ============================================================================

export async function getEvent(id: string, orgId: string): Promise<EventMessage> {
  const event = await db.query.eventBusQueue.findFirst({
    where: and(eq(eventBusQueue.id, id), eq(eventBusQueue.orgId, orgId)),
  });

  if (!event) {
    throw new NotFoundError('Event not found');
  }

  return event as EventMessage;
}

export async function listEvents(orgId: string, params: {
  topic?: string;
  status?: EventStatus;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
} = {}): Promise<EventMessage[]> {
  const { topic, status, startDate, endDate, limit = 100, offset = 0 } = params;

  const conditions = [eq(eventBusQueue.orgId, orgId)];
  if (topic) conditions.push(eq(eventBusQueue.topic, topic));
  if (status) conditions.push(eq(eventBusQueue.status, status));
  if (startDate) conditions.push(gte(eventBusQueue.createdAt, startDate));
  if (endDate) conditions.push(lt(eventBusQueue.createdAt, endDate));

  const results = await db.select()
    .from(eventBusQueue)
    .where(and(...conditions))
    .orderBy(desc(eventBusQueue.createdAt))
    .limit(limit)
    .offset(offset);

  return results as EventMessage[];
}

export async function getDeadLetterQueue(orgId: string, limit: number = 100): Promise<EventMessage[]> {
  const results = await db.select()
    .from(eventBusQueue)
    .where(and(
      eq(eventBusQueue.orgId, orgId),
      eq(eventBusQueue.status, 'dlq')
    ))
    .orderBy(desc(eventBusQueue.createdAt))
    .limit(limit);

  return results as EventMessage[];
}

export async function retryEvent(id: string, orgId: string): Promise<EventMessage> {
  const event = await getEvent(id, orgId);

  if (event.status !== 'dlq' && event.status !== 'failed') {
    throw new ValidationError('Can only retry failed or DLQ events');
  }

  const [updated] = await db.update(eventBusQueue)
    .set({
      status: 'pending',
      attempts: 0,
      lastError: null,
      processAfter: null,
    })
    .where(eq(eventBusQueue.id, id))
    .returning();

  return updated as EventMessage;
}

export async function retryAllDlq(orgId: string): Promise<{ retried: number }> {
  const dlqEvents = await getDeadLetterQueue(orgId, 1000);

  for (const event of dlqEvents) {
    await retryEvent(event.id, orgId);
  }

  return { retried: dlqEvents.length };
}

export async function deleteEvent(id: string, orgId: string): Promise<void> {
  await getEvent(id, orgId);
  await db.delete(eventBusQueue).where(eq(eventBusQueue.id, id));
}

export async function purgeProcessedEvents(orgId: string, olderThan: Date): Promise<{ deleted: number }> {
  const result = await db.delete(eventBusQueue)
    .where(and(
      eq(eventBusQueue.orgId, orgId),
      eq(eventBusQueue.status, 'processed'),
      lt(eventBusQueue.processedAt, olderThan)
    ))
    .returning();

  return { deleted: result.length };
}

// ============================================================================
// Statistics
// ============================================================================

export async function getEventStats(orgId: string): Promise<{
  pending: number;
  processing: number;
  processed: number;
  failed: number;
  dlq: number;
  byTopic: Record<string, number>;
}> {
  // Count by status
  const statusCounts = await db.select({
    status: eventBusQueue.status,
    count: sql<number>`count(*)`,
  })
    .from(eventBusQueue)
    .where(eq(eventBusQueue.orgId, orgId))
    .groupBy(eventBusQueue.status);

  const stats: Record<string, number> = {
    pending: 0,
    processing: 0,
    processed: 0,
    failed: 0,
    dlq: 0,
  };

  for (const row of statusCounts) {
    stats[row.status] = Number(row.count);
  }

  // Count by topic
  const topicCounts = await db.select({
    topic: eventBusQueue.topic,
    count: sql<number>`count(*)`,
  })
    .from(eventBusQueue)
    .where(eq(eventBusQueue.orgId, orgId))
    .groupBy(eventBusQueue.topic);

  const byTopic: Record<string, number> = {};
  for (const row of topicCounts) {
    byTopic[row.topic] = Number(row.count);
  }

  return {
    ...stats,
    byTopic,
  };
}

// ============================================================================
// Built-in Handlers
// ============================================================================

// Register default handlers
registerHandler({
  name: 'webhook-dispatcher',
  topic: '*',
  handler: async (event) => {
    // Webhooks are dispatched in processBatch, this is a no-op
  },
});

// Process pending webhook deliveries handler
registerHandler({
  name: 'webhook-delivery-processor',
  topic: 'webhook.*',
  handler: async (event) => {
    if (event.topic === 'webhook.delivery_pending') {
      const { deliveryId } = event.payload;
      if (deliveryId) {
        await webhookService.deliverWebhook(deliveryId as string);
      }
    }
  },
});
