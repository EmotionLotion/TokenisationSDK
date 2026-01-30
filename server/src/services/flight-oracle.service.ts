/**
 * Flight Oracle Service
 *
 * Manages flight status monitoring, caching, and ticket lifecycle integration:
 * - Watches flights and polls for status updates via CRE oracle
 * - Caches flight status with 5-minute TTL
 * - Triggers ticket state transitions on flight events (landed, cancelled, delayed)
 * - Processes callbacks from the CRE workflow
 *
 * Uses rawQuery for table creation and data access to stay consistent
 * with scheduler.service.ts and other raw-query-based services.
 *
 * @packageDocumentation
 */

import { rawQuery } from '../config/database.js';
import { randomUUID } from 'crypto';
import { logger } from '../middleware/logger.js';

// ============================================================================
// Types & Interfaces
// ============================================================================

export type FlightWatchStatus = 'active' | 'paused' | 'completed' | 'cancelled';

export type FlightStatus =
  | 'scheduled'
  | 'active'
  | 'landed'
  | 'cancelled'
  | 'incident'
  | 'diverted'
  | 'unknown';

export interface FlightWatch {
  id: string;
  orgId: string;
  flightNumber: string;
  departureDate: string;
  status: FlightWatchStatus;
  lastCheckedAt: string | null;
  ticketId: string | null;
  callbackUrl: string | null;
  createdAt: string;
}

export interface FlightStatusCache {
  id: string;
  flightNumber: string;
  departureDate: string;
  status: FlightStatus;
  actualDeparture: string | null;
  actualArrival: string | null;
  delay: number;
  gate: string | null;
  terminal: string | null;
  cancelled: boolean;
  source: string;
  fetchedAt: string;
  createdAt: string;
}

export interface FlightStatusResult {
  flightNumber: string;
  departureDate: string;
  status: FlightStatus;
  actualDeparture: string | null;
  actualArrival: string | null;
  delay: number;
  gate: string | null;
  terminal: string | null;
  cancelled: boolean;
  source: string;
  fetchedAt: string;
  cached: boolean;
}

export interface WatchFlightInput {
  orgId: string;
  flightNumber: string;
  departureDate: string;
  ticketId?: string;
  callbackUrl?: string;
}

export interface CRECallbackPayload {
  type: 'flight_status_update';
  ticketId: string | null;
  data: {
    flightNumber: string;
    status: FlightStatus;
    actualDeparture: string | null;
    actualArrival: string | null;
    delay: number;
    gate: string | null;
    terminal: string | null;
    cancelled: boolean;
  };
  fetchedAt: string;
  source: string;
}

// ============================================================================
// Constants
// ============================================================================

/** Cache TTL in milliseconds (5 minutes) */
const CACHE_TTL_MS = 5 * 60 * 1000;

/** CRE workflow endpoint for on-demand flight checks */
const CRE_WORKFLOW_URL = process.env.CRE_FLIGHT_STATUS_URL || 'http://localhost:6690/flight-status';

/** Hours before departure to start polling */
const POLL_HOURS_BEFORE = 6;

// ============================================================================
// Initialisation — create tables if they don't exist
// ============================================================================

let _initialised = false;

export async function init(): Promise<void> {
  if (_initialised) return;

  logger.info('FlightOracle: initialising tables');

  await rawQuery(`
    CREATE TABLE IF NOT EXISTS flight_watches (
      id              TEXT PRIMARY KEY,
      org_id          TEXT NOT NULL,
      flight_number   TEXT NOT NULL,
      departure_date  TEXT NOT NULL,
      status          TEXT NOT NULL DEFAULT 'active',
      last_checked_at TEXT,
      ticket_id       TEXT,
      callback_url    TEXT,
      created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await rawQuery(`
    CREATE TABLE IF NOT EXISTS flight_status_cache (
      id               TEXT PRIMARY KEY,
      flight_number    TEXT NOT NULL,
      departure_date   TEXT NOT NULL,
      status           TEXT NOT NULL DEFAULT 'unknown',
      actual_departure TEXT,
      actual_arrival   TEXT,
      delay            INTEGER NOT NULL DEFAULT 0,
      gate             TEXT,
      terminal         TEXT,
      cancelled        INTEGER NOT NULL DEFAULT 0,
      source           TEXT NOT NULL DEFAULT 'unknown',
      fetched_at       TEXT NOT NULL,
      created_at       TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Indices for common lookups
  await rawQuery(`
    CREATE INDEX IF NOT EXISTS idx_fw_org_status
      ON flight_watches (org_id, status)
  `);
  await rawQuery(`
    CREATE INDEX IF NOT EXISTS idx_fw_flight_date
      ON flight_watches (flight_number, departure_date)
  `);
  await rawQuery(`
    CREATE INDEX IF NOT EXISTS idx_fsc_flight_date
      ON flight_status_cache (flight_number, departure_date)
  `);

  _initialised = true;
  logger.info('FlightOracle: tables ready');
}

// ============================================================================
// Service Methods
// ============================================================================

/**
 * Get the current status for a flight. Returns cached data if fresh,
 * otherwise triggers a CRE oracle fetch.
 */
export async function getFlightStatus(
  flightNumber: string,
  departureDate: string,
): Promise<FlightStatusResult> {
  await init();

  // Check cache first
  const cached = await getCachedStatus(flightNumber, departureDate);
  if (cached) {
    logger.debug('FlightOracle: cache hit', { flightNumber, departureDate });
    return {
      flightNumber: cached.flightNumber,
      departureDate: cached.departureDate,
      status: cached.status,
      actualDeparture: cached.actualDeparture,
      actualArrival: cached.actualArrival,
      delay: cached.delay,
      gate: cached.gate,
      terminal: cached.terminal,
      cancelled: cached.cancelled,
      source: cached.source,
      fetchedAt: cached.fetchedAt,
      cached: true,
    };
  }

  // Cache miss — trigger CRE workflow
  logger.info('FlightOracle: cache miss, triggering CRE workflow', { flightNumber, departureDate });
  const fresh = await triggerCREFetch(flightNumber, departureDate);
  return { ...fresh, cached: false };
}

/**
 * Subscribe to flight status updates. Creates a watch entry so the cron
 * poller includes this flight.
 */
export async function watchFlight(input: WatchFlightInput): Promise<FlightWatch> {
  await init();

  const { orgId, flightNumber, departureDate, ticketId, callbackUrl } = input;

  // Check for existing active watch
  const existing = await rawQuery<FlightWatch>(
    `SELECT * FROM flight_watches
     WHERE org_id = ? AND flight_number = ? AND departure_date = ? AND status = 'active'
     LIMIT 1`,
    [orgId, flightNumber, departureDate],
  );

  if (existing.length > 0) {
    logger.info('FlightOracle: watch already exists', { id: existing[0].id, flightNumber });
    return mapWatchRow(existing[0]);
  }

  const id = randomUUID();
  const now = new Date().toISOString();

  await rawQuery(
    `INSERT INTO flight_watches (id, org_id, flight_number, departure_date, status, ticket_id, callback_url, created_at)
     VALUES (?, ?, ?, ?, 'active', ?, ?, ?)`,
    [id, orgId, flightNumber, departureDate, ticketId ?? null, callbackUrl ?? null, now],
  );

  logger.info('FlightOracle: watch created', { id, flightNumber, departureDate });

  return {
    id,
    orgId,
    flightNumber,
    departureDate,
    status: 'active',
    lastCheckedAt: null,
    ticketId: ticketId ?? null,
    callbackUrl: callbackUrl ?? null,
    createdAt: now,
  };
}

/**
 * Unsubscribe from flight status updates.
 */
export async function unwatchFlight(
  orgId: string,
  flightNumber: string,
  departureDate?: string,
): Promise<{ removed: number }> {
  await init();

  let query = `UPDATE flight_watches SET status = 'cancelled' WHERE org_id = ? AND flight_number = ? AND status = 'active'`;
  const params: unknown[] = [orgId, flightNumber];

  if (departureDate) {
    query += ' AND departure_date = ?';
    params.push(departureDate);
  }

  await rawQuery(query, params);

  // Count affected (rawQuery doesn't return changes count; re-query)
  const remaining = await rawQuery<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM flight_watches
     WHERE org_id = ? AND flight_number = ? AND status = 'cancelled'`,
    [orgId, flightNumber],
  );

  const removed = remaining[0]?.cnt ?? 0;
  logger.info('FlightOracle: watches cancelled', { orgId, flightNumber, removed });
  return { removed };
}

/**
 * List all active watches for an organisation.
 */
export async function listWatches(
  orgId: string,
  opts?: { status?: FlightWatchStatus; limit?: number; offset?: number },
): Promise<{ data: FlightWatch[]; count: number }> {
  await init();

  const status = opts?.status ?? 'active';
  const limit = opts?.limit ?? 50;
  const offset = opts?.offset ?? 0;

  const rows = await rawQuery<FlightWatch>(
    `SELECT * FROM flight_watches
     WHERE org_id = ? AND status = ?
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`,
    [orgId, status, limit, offset],
  );

  const countRows = await rawQuery<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM flight_watches WHERE org_id = ? AND status = ?`,
    [orgId, status],
  );

  return {
    data: rows.map(mapWatchRow),
    count: countRows[0]?.cnt ?? 0,
  };
}

/**
 * Process an incoming callback from the CRE workflow.
 * Updates cache and triggers ticket state transitions when appropriate.
 */
export async function processCallback(payload: CRECallbackPayload): Promise<void> {
  await init();

  const { data, fetchedAt, source, ticketId } = payload;
  const { flightNumber, status, actualDeparture, actualArrival, delay, gate, terminal, cancelled } = data;

  logger.info('FlightOracle: processing CRE callback', { flightNumber, status, ticketId });

  // Determine departureDate from actualDeparture or today
  const departureDate = actualDeparture
    ? actualDeparture.substring(0, 10)
    : new Date().toISOString().substring(0, 10);

  // Upsert cache
  await upsertCache({
    flightNumber,
    departureDate,
    status: status as FlightStatus,
    actualDeparture,
    actualArrival,
    delay,
    gate,
    terminal,
    cancelled,
    source,
    fetchedAt,
  });

  // Update watch lastCheckedAt
  await rawQuery(
    `UPDATE flight_watches SET last_checked_at = ? WHERE flight_number = ? AND status = 'active'`,
    [new Date().toISOString(), flightNumber],
  );

  // Trigger ticket state transitions
  await handleFlightEvent(flightNumber, departureDate, status as FlightStatus, delay, ticketId);
}

/**
 * Check upcoming flights that are near departure and trigger CRE fetches.
 * Called by the server's internal scheduler (e.g. every 5 minutes).
 */
export async function checkUpcomingFlights(): Promise<{ checked: number }> {
  await init();

  const cutoff = new Date(Date.now() + POLL_HOURS_BEFORE * 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();

  // Find active watches whose departure date is within the polling window
  const watches = await rawQuery<FlightWatch>(
    `SELECT * FROM flight_watches
     WHERE status = 'active'
       AND departure_date <= ?
       AND (last_checked_at IS NULL OR last_checked_at < datetime(?, '-5 minutes'))
     ORDER BY departure_date ASC
     LIMIT 50`,
    [cutoff.substring(0, 10), now],
  );

  if (watches.length === 0) {
    logger.debug('FlightOracle: no upcoming flights to poll');
    return { checked: 0 };
  }

  logger.info('FlightOracle: polling upcoming flights', { count: watches.length });

  let checked = 0;
  for (const watch of watches) {
    try {
      await triggerCREFetch(
        watch.flight_number ?? (watch as any).flightNumber,
        watch.departure_date ?? (watch as any).departureDate,
        watch.callback_url ?? (watch as any).callbackUrl ?? undefined,
        watch.ticket_id ?? (watch as any).ticketId ?? undefined,
      );
      checked++;

      // Update lastCheckedAt
      await rawQuery(
        `UPDATE flight_watches SET last_checked_at = ? WHERE id = ?`,
        [new Date().toISOString(), watch.id],
      );
    } catch (err) {
      logger.error('FlightOracle: failed to poll flight', {
        watchId: watch.id,
        flightNumber: watch.flight_number,
        error: (err as Error).message,
      });
    }
  }

  return { checked };
}

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Retrieve cached status if it exists and is within TTL.
 */
async function getCachedStatus(
  flightNumber: string,
  departureDate: string,
): Promise<FlightStatusCache | null> {
  const rows = await rawQuery<any>(
    `SELECT * FROM flight_status_cache
     WHERE flight_number = ? AND departure_date = ?
     ORDER BY fetched_at DESC
     LIMIT 1`,
    [flightNumber, departureDate],
  );

  if (rows.length === 0) return null;

  const row = rows[0];
  const fetchedAt = new Date(row.fetched_at ?? row.fetchedAt).getTime();
  if (Date.now() - fetchedAt > CACHE_TTL_MS) {
    // Stale
    return null;
  }

  return {
    id: row.id,
    flightNumber: row.flight_number ?? row.flightNumber,
    departureDate: row.departure_date ?? row.departureDate,
    status: (row.status as FlightStatus) ?? 'unknown',
    actualDeparture: row.actual_departure ?? row.actualDeparture ?? null,
    actualArrival: row.actual_arrival ?? row.actualArrival ?? null,
    delay: row.delay ?? 0,
    gate: row.gate ?? null,
    terminal: row.terminal ?? null,
    cancelled: Boolean(row.cancelled),
    source: row.source ?? 'unknown',
    fetchedAt: row.fetched_at ?? row.fetchedAt,
    createdAt: row.created_at ?? row.createdAt,
  };
}

/**
 * Insert or update a cache entry.
 */
async function upsertCache(entry: {
  flightNumber: string;
  departureDate: string;
  status: FlightStatus;
  actualDeparture: string | null;
  actualArrival: string | null;
  delay: number;
  gate: string | null;
  terminal: string | null;
  cancelled: boolean;
  source: string;
  fetchedAt: string;
}): Promise<void> {
  const id = randomUUID();
  const now = new Date().toISOString();

  // Simple strategy: always insert a new row. Old rows become stale and ignored by TTL check.
  await rawQuery(
    `INSERT INTO flight_status_cache
       (id, flight_number, departure_date, status, actual_departure, actual_arrival,
        delay, gate, terminal, cancelled, source, fetched_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      entry.flightNumber,
      entry.departureDate,
      entry.status,
      entry.actualDeparture,
      entry.actualArrival,
      entry.delay,
      entry.gate,
      entry.terminal,
      entry.cancelled ? 1 : 0,
      entry.source,
      entry.fetchedAt,
      now,
    ],
  );
}

/**
 * Trigger the CRE workflow for a single flight and cache the result.
 */
async function triggerCREFetch(
  flightNumber: string,
  departureDate: string,
  callbackUrl?: string,
  ticketId?: string,
): Promise<FlightStatusResult> {
  try {
    const body = JSON.stringify({
      flightNumber,
      departureDate,
      callbackUrl: callbackUrl ?? `${process.env.SERVER_BASE_URL || 'http://localhost:3000'}/api/v1/flights/callback`,
      ticketId,
    });

    const response = await fetch(CRE_WORKFLOW_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.CRE_AUTH_TOKEN ?? ''}`,
      },
      body,
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      throw new Error(`CRE workflow returned ${response.status}`);
    }

    const data = await response.json() as any;

    // Cache the result
    const status: FlightStatus = data.status ?? 'unknown';
    await upsertCache({
      flightNumber,
      departureDate,
      status,
      actualDeparture: data.actualDeparture ?? null,
      actualArrival: data.actualArrival ?? null,
      delay: data.delay ?? 0,
      gate: data.gate ?? null,
      terminal: data.terminal ?? null,
      cancelled: Boolean(data.cancelled),
      source: data.source ?? 'cre',
      fetchedAt: data.fetchedAt ?? new Date().toISOString(),
    });

    return {
      flightNumber,
      departureDate,
      status,
      actualDeparture: data.actualDeparture ?? null,
      actualArrival: data.actualArrival ?? null,
      delay: data.delay ?? 0,
      gate: data.gate ?? null,
      terminal: data.terminal ?? null,
      cancelled: Boolean(data.cancelled),
      source: data.source ?? 'cre',
      fetchedAt: data.fetchedAt ?? new Date().toISOString(),
      cached: false,
    };
  } catch (err) {
    logger.error('FlightOracle: CRE fetch failed, returning unknown', {
      flightNumber,
      error: (err as Error).message,
    });

    return {
      flightNumber,
      departureDate,
      status: 'unknown',
      actualDeparture: null,
      actualArrival: null,
      delay: 0,
      gate: null,
      terminal: null,
      cancelled: false,
      source: 'error',
      fetchedAt: new Date().toISOString(),
      cached: false,
    };
  }
}

/**
 * Handle flight events and trigger ticket state transitions.
 */
async function handleFlightEvent(
  flightNumber: string,
  departureDate: string,
  status: FlightStatus,
  delay: number,
  ticketId?: string | null,
): Promise<void> {
  // Determine which watches are affected
  const watches = await rawQuery<any>(
    `SELECT * FROM flight_watches
     WHERE flight_number = ? AND departure_date = ? AND status = 'active'`,
    [flightNumber, departureDate],
  );

  if (watches.length === 0 && !ticketId) return;

  const affectedTicketIds: string[] = [];
  if (ticketId) affectedTicketIds.push(ticketId);
  for (const w of watches) {
    const tid = w.ticket_id ?? w.ticketId;
    if (tid && !affectedTicketIds.includes(tid)) {
      affectedTicketIds.push(tid);
    }
  }

  if (affectedTicketIds.length === 0) {
    logger.debug('FlightOracle: no tickets to transition', { flightNumber, status });
    return;
  }

  // Determine target ticket status based on flight event
  let targetTicketStatus: string | null = null;
  let eventType: string = 'flight_status_update';

  switch (status) {
    case 'landed':
      targetTicketStatus = 'COMPLETED';
      eventType = 'flight_landed';
      break;
    case 'cancelled':
      targetTicketStatus = 'CANCELLED';
      eventType = 'flight_cancelled';
      break;
    case 'active':
      // If delay exceeds 60 minutes, emit a delay event but don't change status
      if (delay >= 60) {
        eventType = 'flight_delayed';
      }
      break;
    case 'diverted':
      eventType = 'flight_diverted';
      break;
    default:
      // No automatic transition for other statuses
      break;
  }

  logger.info('FlightOracle: processing flight event for tickets', {
    flightNumber,
    status,
    eventType,
    targetTicketStatus,
    ticketCount: affectedTicketIds.length,
  });

  for (const tid of affectedTicketIds) {
    try {
      // Record the event in the ticket_events table (if it exists)
      const eventId = randomUUID();
      const now = new Date().toISOString();

      await rawQuery(
        `INSERT INTO ticket_events (id, ticket_id, event_type, payload, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [
          eventId,
          tid,
          eventType,
          JSON.stringify({
            flightNumber,
            departureDate,
            flightStatus: status,
            delay,
          }),
          now,
        ],
      ).catch((err: Error) => {
        // ticket_events table may not exist in all environments
        logger.warn('FlightOracle: could not insert ticket_event', { error: err.message });
      });

      // Transition ticket status if applicable
      if (targetTicketStatus) {
        await rawQuery(
          `UPDATE airline_tickets SET status = ?, updated_at = ? WHERE id = ?`,
          [targetTicketStatus, now, tid],
        ).catch((err: Error) => {
          logger.warn('FlightOracle: could not update ticket status', {
            ticketId: tid,
            target: targetTicketStatus,
            error: err.message,
          });
        });
      }

      // Mark watch as completed for terminal statuses
      if (status === 'landed' || status === 'cancelled') {
        await rawQuery(
          `UPDATE flight_watches SET status = 'completed' WHERE ticket_id = ? AND status = 'active'`,
          [tid],
        );
      }
    } catch (err) {
      logger.error('FlightOracle: failed to process ticket event', {
        ticketId: tid,
        error: (err as Error).message,
      });
    }
  }
}

/**
 * Map a raw DB row to a FlightWatch object (handles snake_case column names).
 */
function mapWatchRow(row: any): FlightWatch {
  return {
    id: row.id,
    orgId: row.org_id ?? row.orgId,
    flightNumber: row.flight_number ?? row.flightNumber,
    departureDate: row.departure_date ?? row.departureDate,
    status: row.status as FlightWatchStatus,
    lastCheckedAt: row.last_checked_at ?? row.lastCheckedAt ?? null,
    ticketId: row.ticket_id ?? row.ticketId ?? null,
    callbackUrl: row.callback_url ?? row.callbackUrl ?? null,
    createdAt: row.created_at ?? row.createdAt,
  };
}
