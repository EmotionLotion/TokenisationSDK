import { Router } from 'express';
import { db, events } from '../config/database.js';
import { eq, and, sql, gte, lte, inArray } from 'drizzle-orm';
import { type AuthRequest } from '../middleware/auth.js';
import { NotFoundError, ValidationError } from '../middleware/errorHandler.js';
import * as eventStreamService from '../services/event-stream.service.js';
import { logger } from '../middleware/logger.js';

export const eventRouter = Router();

// ---------------------------------------------------------------------------
// SSE Stream endpoint
// ---------------------------------------------------------------------------

const HEARTBEAT_INTERVAL_MS = 30_000;

eventRouter.get('/stream', (req: AuthRequest, res, next) => {
  try {
    const orgId = req.user?.orgId || (req.headers['x-org-id'] as string);
    if (!orgId) {
      res.status(403).json({ error: 'orgId is required for event streaming' });
      return;
    }

    // Parse optional filters from query params
    const assetId = req.query.assetId as string | undefined;
    const aggregateType = req.query.aggregateType as string | undefined;
    const eventTypes = req.query.types
      ? (req.query.types as string).split(',')
      : undefined;

    // Last-Event-Id for reconnection (sent by browser EventSource automatically)
    const lastEventId =
      (req.headers['last-event-id'] as string) || null;

    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    });

    // Send initial comment to confirm connection
    res.write(': connected\n\n');

    // Heartbeat to keep connection alive
    const heartbeat = setInterval(() => {
      res.write(': heartbeat\n\n');
    }, HEARTBEAT_INTERVAL_MS);

    // Subscribe to event stream
    const subscriptionId = eventStreamService.subscribe(
      { orgId, assetId, aggregateType, eventTypes },
      (event) => {
        // SSE format: id, event type, data
        res.write(`id: ${event.eventId}\n`);
        res.write(`event: ${event.eventType}\n`);
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      },
      (error) => {
        logger.error(`[SSE] Stream error for ${subscriptionId}`, { error });
        // Send error event to client
        res.write(`event: error\ndata: ${JSON.stringify({ message: error.message })}\n\n`);
      },
      lastEventId,
    );

    // Replay missed events if reconnecting
    if (lastEventId) {
      eventStreamService
        .replay(
          { orgId, assetId, aggregateType, eventTypes },
          lastEventId,
        )
        .then((missedEvents) => {
          for (const event of missedEvents) {
            res.write(`id: ${event.eventId}\n`);
            res.write(`event: ${event.eventType}\n`);
            res.write(`data: ${JSON.stringify(event)}\n\n`);
          }
        })
        .catch((err) => {
          logger.error('[SSE] Replay failed', { error: err });
        });
    }

    logger.info(`[SSE] Client connected: ${subscriptionId} (org: ${orgId})`);

    // Clean up on disconnect
    req.on('close', () => {
      clearInterval(heartbeat);
      eventStreamService.unsubscribe(subscriptionId);
      logger.info(`[SSE] Client disconnected: ${subscriptionId}`);
    });
  } catch (error) {
    next(error);
  }
});

// List events
eventRouter.get('/', async (req: AuthRequest, res, next) => {
  try {
    const {
      page = '1',
      limit = '50',
      assetId,
      types,
      from,
      to,
      actorId,
    } = req.query;

    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);
    const conditions = [];

    if (assetId) {
      conditions.push(eq(events.assetId, assetId as string));
    }

    if (types) {
      const typeArray = (types as string).split(',');
      conditions.push(inArray(events.type, typeArray));
    }

    if (from) {
      conditions.push(gte(events.timestamp, new Date(from as string)));
    }

    if (to) {
      conditions.push(lte(events.timestamp, new Date(to as string)));
    }

    if (actorId) {
      conditions.push(eq(events.actorId, actorId as string));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [eventList, countResult] = await Promise.all([
      db.select().from(events)
        .where(whereClause)
        .limit(parseInt(limit as string))
        .offset(offset)
        .orderBy(events.timestamp),
      db.select({ count: sql<number>`count(*)` }).from(events).where(whereClause),
    ]);

    res.json({
      events: eventList,
      total: Number(countResult[0]?.count || 0),
      page: parseInt(page as string),
      limit: parseInt(limit as string),
    });
  } catch (error) {
    next(error);
  }
});

// Get event by ID
eventRouter.get('/:id', async (req: AuthRequest, res, next) => {
  try {
    const { id } = req.params;

    const event = await db.query.events.findFirst({
      where: eq(events.id, id),
    });

    if (!event) {
      throw new NotFoundError('Event');
    }

    res.json(event);
  } catch (error) {
    next(error);
  }
});

// Get events for an asset
eventRouter.get('/asset/:assetId', async (req: AuthRequest, res, next) => {
  try {
    const { assetId } = req.params;
    const { page = '1', limit = '50', types } = req.query;
    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);

    const conditions = [eq(events.assetId, assetId)];

    if (types) {
      const typeArray = (types as string).split(',');
      conditions.push(inArray(events.type, typeArray));
    }

    const whereClause = and(...conditions);

    const [eventList, countResult] = await Promise.all([
      db.select().from(events)
        .where(whereClause)
        .limit(parseInt(limit as string))
        .offset(offset)
        .orderBy(events.timestamp),
      db.select({ count: sql<number>`count(*)` }).from(events).where(whereClause),
    ]);

    res.json({
      events: eventList,
      total: Number(countResult[0]?.count || 0),
      page: parseInt(page as string),
      limit: parseInt(limit as string),
    });
  } catch (error) {
    next(error);
  }
});

// Create event (internal use, SDK logs events)
eventRouter.post('/', async (req: AuthRequest, res, next) => {
  try {
    const { type, assetId, payload } = req.body;

    if (!type || !assetId) {
      throw new ValidationError('type and assetId are required');
    }

    const [event] = await db.insert(events).values({
      type,
      assetId,
      actorId: req.user?.partyId || 'system',
      payload: payload || {},
    }).returning();

    res.status(201).json(event);
  } catch (error) {
    next(error);
  }
});

// Get event statistics
eventRouter.get('/stats/summary', async (req: AuthRequest, res, next) => {
  try {
    const { assetId, from, to } = req.query;

    const conditions = [];

    if (assetId) {
      conditions.push(eq(events.assetId, assetId as string));
    }

    if (from) {
      conditions.push(gte(events.timestamp, new Date(from as string)));
    }

    if (to) {
      conditions.push(lte(events.timestamp, new Date(to as string)));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const stats = await db.select({
      type: events.type,
      count: sql<number>`count(*)`,
    })
      .from(events)
      .where(whereClause)
      .groupBy(events.type);

    res.json({
      summary: stats.reduce((acc, s) => ({
        ...acc,
        [s.type]: Number(s.count),
      }), {}),
    });
  } catch (error) {
    next(error);
  }
});
