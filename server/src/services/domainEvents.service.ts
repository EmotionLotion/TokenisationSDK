import { db, schema } from '../config/database.js';
import { eq, and, lt, or, desc, sql, asc, isNull } from 'drizzle-orm';
import { randomBytes } from 'crypto';
import { getRequestContext, runWithContext, createSystemContext, type RequestContext } from '../middleware/context.js';
import * as webhookService from './webhook.service.js';
import { logger } from '../middleware/logger.js';
import type { PostgresJsTransaction } from 'drizzle-orm/postgres-js';

const { domainEventsOutbox, eventBusQueue } = schema;

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface DomainEvent<T = Record<string, unknown>> {
  eventId: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: T;
  metadata: EventMetadata;
  sequence: number;
  createdAt: Date;
}

export interface EventMetadata {
  requestId?: string;
  actorId?: string;
  actorType?: string;
  idempotencyKey?: string;
  causationId?: string; // ID of the event that caused this event
  correlationId?: string; // ID to correlate related events
  [key: string]: unknown;
}

export interface EmitEventInput<T = Record<string, unknown>> {
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  orgId: string;
  payload: T;
  metadata?: Partial<EventMetadata>;
}

// ============================================================================
// Event Type Registry
// ============================================================================

export const EVENT_TYPES = {
  // Transfer lifecycle
  TRANSFER_CREATED: 'transfer.created',
  TRANSFER_PRECHECKED: 'transfer.prechecked',
  TRANSFER_APPROVED: 'transfer.approved',
  TRANSFER_REJECTED: 'transfer.rejected',
  TRANSFER_SIGNED: 'transfer.signed',
  TRANSFER_SUBMITTED: 'transfer.submitted',
  TRANSFER_CONFIRMED: 'transfer.confirmed',
  TRANSFER_RECONCILED: 'transfer.reconciled',
  TRANSFER_SETTLED: 'transfer.settled',
  TRANSFER_FAILED: 'transfer.failed',
  TRANSFER_CANCELLED: 'transfer.cancelled',

  // Token lifecycle
  TOKEN_CREATED: 'token.created',
  TOKEN_DEPLOYING: 'token.deploying',
  TOKEN_DEPLOYED: 'token.deployed',
  TOKEN_PAUSED: 'token.paused',
  TOKEN_UNPAUSED: 'token.unpaused',
  TOKEN_FROZEN: 'token.frozen',
  TOKEN_UNFROZEN: 'token.unfrozen',

  // Issuance lifecycle
  ISSUANCE_CREATED: 'issuance.created',
  ISSUANCE_APPROVED: 'issuance.approved',
  ISSUANCE_SUBMITTED: 'issuance.submitted',
  ISSUANCE_CONFIRMED: 'issuance.confirmed',
  ISSUANCE_SETTLED: 'issuance.settled',
  ISSUANCE_FAILED: 'issuance.failed',

  // Redemption lifecycle
  REDEMPTION_REQUESTED: 'redemption.requested',
  REDEMPTION_APPROVED: 'redemption.approved',
  REDEMPTION_SUBMITTED: 'redemption.submitted',
  REDEMPTION_CONFIRMED: 'redemption.confirmed',
  REDEMPTION_SETTLED: 'redemption.settled',
  REDEMPTION_FAILED: 'redemption.failed',

  // Clawback lifecycle
  CLAWBACK_REQUESTED: 'clawback.requested',
  CLAWBACK_PENDING_APPROVAL: 'clawback.pending_approval',
  CLAWBACK_APPROVED: 'clawback.approved',
  CLAWBACK_REJECTED: 'clawback.rejected',
  CLAWBACK_EXECUTING: 'clawback.executing',
  CLAWBACK_CONFIRMED: 'clawback.confirmed',
  CLAWBACK_FAILED: 'clawback.failed',

  // Investor lifecycle
  INVESTOR_CREATED: 'investor.created',
  INVESTOR_ACTIVATED: 'investor.activated',
  INVESTOR_SUSPENDED: 'investor.suspended',
  INVESTOR_KYC_STARTED: 'investor.kyc_started',
  INVESTOR_KYC_APPROVED: 'investor.kyc_approved',
  INVESTOR_KYC_REJECTED: 'investor.kyc_rejected',
  INVESTOR_KYC_EXPIRED: 'investor.kyc_expired',

  // Compliance events
  COMPLIANCE_DECISION_CREATED: 'compliance.decision_created',
  COMPLIANCE_APPROVAL_REQUESTED: 'compliance.approval_requested',
  COMPLIANCE_APPROVAL_GRANTED: 'compliance.approval_granted',
  COMPLIANCE_APPROVAL_DENIED: 'compliance.approval_denied',

  // Distribution events
  DISTRIBUTION_CREATED: 'distribution.created',
  DISTRIBUTION_APPROVED: 'distribution.approved',
  DISTRIBUTION_PROCESSING: 'distribution.processing',
  DISTRIBUTION_COMPLETED: 'distribution.completed',
  DISTRIBUTION_PAYOUT_SENT: 'distribution.payout_sent',
  DISTRIBUTION_PAYOUT_FAILED: 'distribution.payout_failed',

  // Corporate action events
  CORPORATE_ACTION_ANNOUNCED: 'corporate_action.announced',
  CORPORATE_ACTION_APPROVED: 'corporate_action.approved',
  CORPORATE_ACTION_PROCESSING: 'corporate_action.processing',
  CORPORATE_ACTION_COMPLETED: 'corporate_action.completed',
  CORPORATE_ACTION_ENTITLEMENT_PROCESSED: 'corporate_action.entitlement_processed',

  // Settlement events
  SETTLEMENT_PENDING: 'settlement.pending',
  SETTLEMENT_FINALIZED: 'settlement.finalized',
  SETTLEMENT_REORGED: 'settlement.reorged',

  // DLD events
  DLD_TITLE_REGISTERED: 'dld.title_registered',
  DLD_TITLE_VERIFIED: 'dld.title_verified',
  DLD_EVENT_RECEIVED: 'dld.event_received',
  DLD_CONFLICT_DETECTED: 'dld.conflict_detected',
} as const;

// ============================================================================
// Outbox Pattern Implementation
// ============================================================================

/**
 * Generate a unique event ID
 */
function generateEventId(): string {
  return `evt_${Date.now().toString(36)}_${randomBytes(8).toString('hex')}`;
}

/**
 * Get the next sequence number for an aggregate.
 * This ensures events for the same aggregate are ordered.
 */
async function getNextSequence(
  tx: typeof db | PostgresJsTransaction<any, any>,
  aggregateType: string,
  aggregateId: string,
  orgId: string
): Promise<number> {
  const result = await tx.select({
    maxSeq: sql<number>`COALESCE(MAX(${domainEventsOutbox.sequence}), 0)`,
  })
    .from(domainEventsOutbox)
    .where(and(
      eq(domainEventsOutbox.orgId, orgId),
      eq(domainEventsOutbox.aggregateType, aggregateType),
      eq(domainEventsOutbox.aggregateId, aggregateId)
    ));

  return (result[0]?.maxSeq || 0) + 1;
}

/**
 * Emit a domain event to the outbox.
 * This should be called WITHIN the same transaction as the business operation.
 *
 * Usage:
 * ```typescript
 * await db.transaction(async (tx) => {
 *   // Business operation
 *   const [transfer] = await tx.insert(transfers).values({...}).returning();
 *
 *   // Emit event in same transaction
 *   await emitEvent(tx, {
 *     eventType: EVENT_TYPES.TRANSFER_CREATED,
 *     aggregateType: 'transfer',
 *     aggregateId: transfer.id,
 *     orgId: transfer.orgId,
 *     payload: transfer,
 *   });
 * });
 * ```
 */
export async function emitEvent<T = Record<string, unknown>>(
  tx: typeof db | PostgresJsTransaction<any, any>,
  input: EmitEventInput<T>
): Promise<DomainEvent<T>> {
  const ctx = getRequestContext();
  const eventId = generateEventId();
  const sequence = await getNextSequence(tx, input.aggregateType, input.aggregateId, input.orgId);

  const metadata: EventMetadata = {
    requestId: ctx?.requestId,
    actorId: ctx?.actorId,
    actorType: ctx?.actorType,
    idempotencyKey: ctx?.idempotencyKey,
    ...input.metadata,
  };

  const [event] = await tx.insert(domainEventsOutbox).values({
    orgId: input.orgId,
    eventId,
    eventType: input.eventType,
    aggregateType: input.aggregateType,
    aggregateId: input.aggregateId,
    payload: input.payload as any,
    metadata: metadata as any,
    sequence,
    status: 'pending',
    requestId: ctx?.requestId,
    actorId: ctx?.actorId,
    actorType: ctx?.actorType,
  }).returning();

  return {
    eventId,
    eventType: input.eventType,
    aggregateType: input.aggregateType,
    aggregateId: input.aggregateId,
    payload: input.payload,
    metadata,
    sequence,
    createdAt: event.createdAt!,
  };
}

/**
 * Emit multiple events atomically in the same transaction.
 */
export async function emitEvents<T = Record<string, unknown>>(
  tx: typeof db | PostgresJsTransaction<any, any>,
  inputs: EmitEventInput<T>[]
): Promise<DomainEvent<T>[]> {
  const events: DomainEvent<T>[] = [];
  for (const input of inputs) {
    const event = await emitEvent(tx, input);
    events.push(event);
  }
  return events;
}

// ============================================================================
// Outbox Worker - Processes pending events
// ============================================================================

interface WorkerConfig {
  batchSize: number;
  pollingIntervalMs: number;
  maxRetries: number;
  circuitBreakerThreshold: number;
  circuitBreakerResetMs: number;
  perEndpointConcurrency: number;
}

const DEFAULT_CONFIG: WorkerConfig = {
  batchSize: 100,
  pollingIntervalMs: 1000,
  maxRetries: 5,
  circuitBreakerThreshold: 10,
  circuitBreakerResetMs: 60000,
  perEndpointConcurrency: 5,
};

// Circuit breaker state per endpoint
const circuitBreakers = new Map<string, {
  failures: number;
  lastFailure: number;
  isOpen: boolean;
}>();

let workerRunning = false;
let workerInstance: NodeJS.Timeout | null = null;

/**
 * Starts the outbox worker that processes pending events.
 */
export function startOutboxWorker(config: Partial<WorkerConfig> = {}): void {
  if (workerRunning) {
    logger.warn('Outbox worker already running');
    return;
  }

  const cfg = { ...DEFAULT_CONFIG, ...config };
  workerRunning = true;

  logger.info('Starting outbox worker', {
    metadata: {
      batchSize: cfg.batchSize,
      pollingIntervalMs: cfg.pollingIntervalMs,
    },
  });

  const processLoop = async () => {
    if (!workerRunning) return;

    try {
      const processed = await processOutboxBatch(cfg);
      if (processed > 0) {
        logger.debug(`Outbox worker processed ${processed} events`);
      }
    } catch (error) {
      logger.error('Outbox worker error', {
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }

    if (workerRunning) {
      workerInstance = setTimeout(processLoop, cfg.pollingIntervalMs);
    }
  };

  processLoop();
}

/**
 * Stops the outbox worker.
 */
export function stopOutboxWorker(): void {
  workerRunning = false;
  if (workerInstance) {
    clearTimeout(workerInstance);
    workerInstance = null;
  }
  logger.info('Outbox worker stopped');
}

/**
 * Process a batch of pending events from the outbox.
 */
async function processOutboxBatch(config: WorkerConfig): Promise<number> {
  // Get pending events
  const pendingEvents = await db.select()
    .from(domainEventsOutbox)
    .where(
      and(
        eq(domainEventsOutbox.status, 'pending'),
        or(
          isNull(domainEventsOutbox.retryCount),
          lt(domainEventsOutbox.retryCount, config.maxRetries)
        )
      )
    )
    .orderBy(asc(domainEventsOutbox.createdAt))
    .limit(config.batchSize);

  if (pendingEvents.length === 0) {
    return 0;
  }

  let processed = 0;

  for (const event of pendingEvents) {
    try {
      // Mark as processing
      await db.update(domainEventsOutbox)
        .set({ status: 'processing' })
        .where(eq(domainEventsOutbox.id, event.id));

      // Create context for this event
      const ctx = createSystemContext(event.orgId, event.requestId || event.eventId);

      await runWithContext(ctx, async () => {
        // Dispatch to webhooks
        await webhookService.dispatchEvent(
          event.orgId,
          event.eventType,
          {
            eventId: event.eventId,
            eventType: event.eventType,
            aggregateType: event.aggregateType,
            aggregateId: event.aggregateId,
            payload: event.payload,
            metadata: event.metadata,
            sequence: event.sequence,
            createdAt: event.createdAt,
          }
        );

        // Also publish to internal event bus for handlers
        await db.insert(eventBusQueue).values({
          orgId: event.orgId,
          topic: event.eventType,
          eventId: event.eventId,
          payload: {
            eventId: event.eventId,
            eventType: event.eventType,
            aggregateType: event.aggregateType,
            aggregateId: event.aggregateId,
            payload: event.payload,
            metadata: event.metadata,
            sequence: event.sequence,
          } as any,
          trace: {
            requestId: event.requestId,
            actorId: event.actorId,
            actorType: event.actorType,
          } as any,
          status: 'pending',
        }).onConflictDoNothing();
      });

      // Mark as published
      await db.update(domainEventsOutbox)
        .set({
          status: 'published',
          publishedAt: new Date(),
        })
        .where(eq(domainEventsOutbox.id, event.id));

      processed++;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      await db.update(domainEventsOutbox)
        .set({
          status: 'pending', // Reset to pending for retry
          retryCount: (event.retryCount || 0) + 1,
          lastError: errorMessage,
        })
        .where(eq(domainEventsOutbox.id, event.id));

      logger.error(`Failed to process event ${event.eventId}`, {
        error: error instanceof Error ? error : new Error(errorMessage),
        metadata: {
          eventId: event.eventId,
          eventType: event.eventType,
          retryCount: (event.retryCount || 0) + 1,
        },
      });
    }
  }

  return processed;
}

// ============================================================================
// Event Queries
// ============================================================================

/**
 * Get events for a specific aggregate.
 */
export async function getAggregateEvents(
  orgId: string,
  aggregateType: string,
  aggregateId: string
): Promise<DomainEvent[]> {
  const events = await db.select()
    .from(domainEventsOutbox)
    .where(and(
      eq(domainEventsOutbox.orgId, orgId),
      eq(domainEventsOutbox.aggregateType, aggregateType),
      eq(domainEventsOutbox.aggregateId, aggregateId)
    ))
    .orderBy(asc(domainEventsOutbox.sequence));

  return events.map(e => ({
    eventId: e.eventId,
    eventType: e.eventType,
    aggregateType: e.aggregateType,
    aggregateId: e.aggregateId,
    payload: e.payload as Record<string, unknown>,
    metadata: e.metadata as EventMetadata,
    sequence: e.sequence,
    createdAt: e.createdAt!,
  }));
}

/**
 * Get events by type within a time range.
 */
export async function getEventsByType(
  orgId: string,
  eventType: string,
  options: {
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  } = {}
): Promise<DomainEvent[]> {
  const { startDate, endDate, limit = 100, offset = 0 } = options;

  let query = db.select()
    .from(domainEventsOutbox)
    .where(and(
      eq(domainEventsOutbox.orgId, orgId),
      eq(domainEventsOutbox.eventType, eventType)
    ))
    .orderBy(desc(domainEventsOutbox.createdAt))
    .limit(limit)
    .offset(offset);

  const events = await query;

  return events
    .filter(e => {
      if (startDate && e.createdAt! < startDate) return false;
      if (endDate && e.createdAt! > endDate) return false;
      return true;
    })
    .map(e => ({
      eventId: e.eventId,
      eventType: e.eventType,
      aggregateType: e.aggregateType,
      aggregateId: e.aggregateId,
      payload: e.payload as Record<string, unknown>,
      metadata: e.metadata as EventMetadata,
      sequence: e.sequence,
      createdAt: e.createdAt!,
    }));
}

/**
 * Get outbox statistics.
 */
export async function getOutboxStats(orgId?: string): Promise<{
  pending: number;
  processing: number;
  published: number;
  failed: number;
}> {
  const conditions = orgId ? eq(domainEventsOutbox.orgId, orgId) : undefined;

  const stats = await db.select({
    status: domainEventsOutbox.status,
    count: sql<number>`count(*)`,
  })
    .from(domainEventsOutbox)
    .where(conditions)
    .groupBy(domainEventsOutbox.status);

  const result = {
    pending: 0,
    processing: 0,
    published: 0,
    failed: 0,
  };

  for (const stat of stats) {
    if (stat.status === 'pending') result.pending = Number(stat.count);
    else if (stat.status === 'processing') result.processing = Number(stat.count);
    else if (stat.status === 'published') result.published = Number(stat.count);
    else if (stat.status === 'failed') result.failed = Number(stat.count);
  }

  return result;
}

/**
 * Manually retry failed events.
 */
export async function retryFailedEvents(orgId: string, limit: number = 100): Promise<number> {
  const result = await db.update(domainEventsOutbox)
    .set({
      status: 'pending',
      retryCount: 0,
      lastError: null,
    })
    .where(and(
      eq(domainEventsOutbox.orgId, orgId),
      eq(domainEventsOutbox.status, 'failed')
    ))
    .returning();

  return result.length;
}

/**
 * Purge old published events.
 */
export async function purgeOldEvents(olderThanDays: number = 30): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);

  const result = await db.delete(domainEventsOutbox)
    .where(and(
      eq(domainEventsOutbox.status, 'published'),
      lt(domainEventsOutbox.publishedAt!, cutoff)
    ))
    .returning();

  return result.length;
}
