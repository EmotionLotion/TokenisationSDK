/**
 * Recovery Service — Startup recovery orchestrator.
 *
 * On server start this service:
 *  1. Starts the domain-events outbox worker (flushes pending events)
 *  2. Starts the EventBus processing loop (resumes event handlers)
 *  3. Queries for incomplete sagas and logs them
 *  4. Optionally starts indexers for configured chains
 *
 * On shutdown it tears everything down cleanly.
 */

import * as domainEventsService from './domainEvents.service.js';
import * as eventbusService from './eventbus.service.js';
import * as indexerService from './indexer.service.js';
import { db, schema } from '../config/database.js';
import { eq, and, or } from 'drizzle-orm';
import { logger } from '../middleware/logger.js';

const { transfers } = schema;

// ============================================================================
// Configuration
// ============================================================================

export interface RecoveryConfig {
  /** Start the outbox worker on boot (default: true) */
  outboxWorker: boolean;
  /** Start the EventBus processing loop on boot (default: true) */
  eventBusProcessing: boolean;
  /** Chain IDs to auto-start indexers for (default: []) */
  indexerChainIds: number[];
  /** Indexer polling interval in ms (default: 12000) */
  indexerPollingInterval: number;
  /** Indexer confirmations required (default: 12) */
  indexerConfirmations: number;
  /** Indexer batch size (default: 1000) */
  indexerBatchSize: number;
}

const DEFAULT_CONFIG: RecoveryConfig = {
  outboxWorker: true,
  eventBusProcessing: true,
  indexerChainIds: [],
  indexerPollingInterval: 12_000,
  indexerConfirmations: 12,
  indexerBatchSize: 1_000,
};

// ============================================================================
// State
// ============================================================================

let started = false;
let activeIndexerChains: number[] = [];

// ============================================================================
// Startup
// ============================================================================

/**
 * Start all recovery workers. Safe to call multiple times — subsequent calls
 * are no-ops.
 */
export async function start(config: Partial<RecoveryConfig> = {}): Promise<void> {
  if (started) {
    logger.warn('Recovery service already started');
    return;
  }

  const cfg: RecoveryConfig = { ...DEFAULT_CONFIG, ...config };

  logger.info('Recovery service starting...');

  // 1. Outbox worker — flush pending domain events
  if (cfg.outboxWorker) {
    try {
      domainEventsService.startOutboxWorker();
      logger.info('Outbox worker started');
    } catch (error) {
      logger.error('Failed to start outbox worker', { error: error as Error });
    }
  }

  // 2. EventBus processing loop
  if (cfg.eventBusProcessing) {
    try {
      // Fire-and-forget: startProcessing runs its own loop
      eventbusService.startProcessing().catch((error) => {
        logger.error('EventBus processing loop exited with error', { error: error as Error });
      });
      logger.info('EventBus processing started');
    } catch (error) {
      logger.error('Failed to start EventBus processing', { error: error as Error });
    }
  }

  // 3. Log incomplete sagas (transfers stuck in non-terminal states)
  try {
    await logIncompleteSagas();
  } catch (error) {
    logger.error('Failed to query incomplete sagas', { error: error as Error });
  }

  // 4. Start indexers for configured chains
  if (cfg.indexerChainIds.length > 0) {
    for (const chainId of cfg.indexerChainIds) {
      try {
        await indexerService.startIndexer({
          chainId,
          startBlock: 0, // Will pick up from last indexed block
          pollingInterval: cfg.indexerPollingInterval,
          confirmations: cfg.indexerConfirmations,
          batchSize: cfg.indexerBatchSize,
        });
        activeIndexerChains.push(chainId);
        logger.info(`Indexer started for chain ${chainId}`);
      } catch (error) {
        logger.error(`Failed to start indexer for chain ${chainId}`, { error: error as Error });
      }
    }
  }

  started = true;
  logger.info('Recovery service started', {
    metadata: {
      outboxWorker: cfg.outboxWorker,
      eventBusProcessing: cfg.eventBusProcessing,
      indexerChains: cfg.indexerChainIds,
    },
  });
}

// ============================================================================
// Shutdown
// ============================================================================

/**
 * Gracefully stop all workers. Safe to call multiple times.
 */
export async function shutdown(): Promise<void> {
  if (!started) {
    return;
  }

  logger.info('Recovery service shutting down...');

  // Stop indexers
  for (const chainId of activeIndexerChains) {
    try {
      indexerService.stopIndexer(chainId);
      logger.info(`Indexer stopped for chain ${chainId}`);
    } catch (error) {
      logger.error(`Failed to stop indexer for chain ${chainId}`, { error: error as Error });
    }
  }
  activeIndexerChains = [];

  // Stop EventBus processing
  try {
    eventbusService.stopProcessing();
    logger.info('EventBus processing stopped');
  } catch (error) {
    logger.error('Failed to stop EventBus processing', { error: error as Error });
  }

  // Stop outbox worker
  try {
    domainEventsService.stopOutboxWorker();
    logger.info('Outbox worker stopped');
  } catch (error) {
    logger.error('Failed to stop outbox worker', { error: error as Error });
  }

  started = false;
  logger.info('Recovery service shutdown complete');
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Query transfers stuck in non-terminal states and log them.
 * Full auto-resume is opt-in because saga flows vary.
 */
async function logIncompleteSagas(): Promise<void> {
  const nonTerminalStatuses = [
    'created',
    'prechecked',
    'approved',
    'signing',
    'submitted',
    'confirmed',
    'reconciled',
  ];

  const incompleteTransfers = await db.select({
    id: transfers.id,
    orgId: transfers.orgId,
    status: transfers.status,
    tokenId: transfers.tokenId,
    createdAt: transfers.createdAt,
  })
    .from(transfers)
    .where(
      or(
        ...nonTerminalStatuses.map(s => eq(transfers.status, s))
      )
    )
    .limit(500);

  if (incompleteTransfers.length === 0) {
    logger.info('No incomplete sagas found');
    return;
  }

  // Group by status for summary
  const statusCounts: Record<string, number> = {};
  for (const t of incompleteTransfers) {
    statusCounts[t.status] = (statusCounts[t.status] || 0) + 1;
  }

  logger.warn('Incomplete sagas detected on startup', {
    metadata: {
      total: incompleteTransfers.length,
      byStatus: statusCounts,
      sampleIds: incompleteTransfers.slice(0, 10).map(t => t.id),
    },
  });
}

export function isStarted(): boolean {
  return started;
}
