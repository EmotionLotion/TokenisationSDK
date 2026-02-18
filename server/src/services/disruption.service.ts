/**
 * Disruption & Rebooking Service (D8)
 *
 * Handles flight disruptions (delays, diversions, cancellations) and
 * provides rebooking capability for affected passengers:
 * - Records disruption events linked to flights
 * - Finds alternative flights (mock/placeholder for real integration)
 * - Offers, accepts, and rejects rebookings
 * - Updates ticket metadata on accepted rebookings
 *
 * Uses rawQuery for table creation and data access, consistent with
 * flight-oracle.service.ts and other raw-query-based services.
 *
 * @packageDocumentation
 */

import { rawQuery } from '../config/database.js';
import { randomUUID } from 'crypto';
import { logger } from '../middleware/logger.js';

// ============================================================================
// Types & Interfaces
// ============================================================================

export type DisruptionType = 'delay' | 'diversion' | 'cancellation';
export type DisruptionSeverity = 'minor' | 'major' | 'critical';
export type RebookingStatus = 'PENDING' | 'OFFERED' | 'ACCEPTED' | 'REJECTED' | 'COMPLETED';

export interface DisruptionEvent {
  id: string;
  orgId: string;
  originalFlightNumber: string;
  departureDate: string;
  disruptionType: DisruptionType;
  severity: DisruptionSeverity;
  description: string;
  alternativeFlights: AlternativeFlight[];
  resolvedAt: string | null;
  createdAt: string;
}

export interface AlternativeFlight {
  flightNumber: string;
  departureDate: string;
  departureTime: string;
  arrivalTime: string;
  seatsAvailable: number;
}

export interface Rebooking {
  id: string;
  orgId: string;
  disruptionId: string;
  ticketId: string;
  originalFlight: string;
  newFlight: string;
  newDepartureDate: string;
  status: RebookingStatus;
  passengerNotifiedAt: string | null;
  acceptedAt: string | null;
  createdAt: string;
}

export interface RecordDisruptionInput {
  originalFlightNumber: string;
  departureDate: string;
  disruptionType: DisruptionType;
  severity: DisruptionSeverity;
  description: string;
}

// ============================================================================
// Initialisation
// ============================================================================

let _initialised = false;

export async function ensureTables(): Promise<void> {
  if (_initialised) return;

  logger.info('DisruptionService: initialising tables');

  await rawQuery(`
    CREATE TABLE IF NOT EXISTS disruption_events (
      id                      TEXT PRIMARY KEY,
      org_id                  TEXT NOT NULL,
      original_flight_number  TEXT NOT NULL,
      departure_date          TEXT NOT NULL,
      disruption_type         TEXT NOT NULL,
      severity                TEXT NOT NULL DEFAULT 'minor',
      description             TEXT NOT NULL DEFAULT '',
      alternative_flights     TEXT NOT NULL DEFAULT '[]',
      resolved_at             TEXT,
      created_at              TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await rawQuery(`
    CREATE TABLE IF NOT EXISTS rebookings (
      id                    TEXT PRIMARY KEY,
      org_id                TEXT NOT NULL,
      disruption_id         TEXT NOT NULL,
      ticket_id             TEXT NOT NULL,
      original_flight       TEXT NOT NULL,
      new_flight            TEXT NOT NULL,
      new_departure_date    TEXT NOT NULL,
      status                TEXT NOT NULL DEFAULT 'PENDING',
      passenger_notified_at TEXT,
      accepted_at           TEXT,
      created_at            TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await rawQuery(`
    CREATE INDEX IF NOT EXISTS idx_de_org
      ON disruption_events (org_id, departure_date)
  `);
  await rawQuery(`
    CREATE INDEX IF NOT EXISTS idx_de_flight
      ON disruption_events (original_flight_number, departure_date)
  `);
  await rawQuery(`
    CREATE INDEX IF NOT EXISTS idx_rb_disruption
      ON rebookings (disruption_id, status)
  `);
  await rawQuery(`
    CREATE INDEX IF NOT EXISTS idx_rb_org
      ON rebookings (org_id, status)
  `);

  _initialised = true;
  logger.info('DisruptionService: tables ready');
}

// ============================================================================
// Service Methods
// ============================================================================

/**
 * Record a disruption event and find affected tickets.
 * Returns the created disruption with affected ticket count.
 */
export async function recordDisruption(
  orgId: string,
  input: RecordDisruptionInput,
): Promise<DisruptionEvent & { affectedTickets: number }> {
  await ensureTables();

  const id = randomUUID();
  const now = new Date().toISOString();

  // Find alternative flights (mock)
  const alternatives = await findAlternativeFlights(orgId, input.originalFlightNumber, input.departureDate);

  await rawQuery(
    `INSERT INTO disruption_events
       (id, org_id, original_flight_number, departure_date, disruption_type, severity, description, alternative_flights, resolved_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
    [
      id, orgId, input.originalFlightNumber, input.departureDate,
      input.disruptionType, input.severity, input.description,
      JSON.stringify(alternatives), now,
    ],
  );

  // Find affected tickets for this flight
  const affected = await rawQuery<any>(
    `SELECT id FROM airline_tickets
     WHERE org_id = ? AND flight_number = ? AND departure_date = ?
       AND status IN ('CONFIRMED', 'CHECKED_IN', 'BOARDED')`,
    [orgId, input.originalFlightNumber, input.departureDate],
  ).catch(() => [] as any[]);

  logger.info('DisruptionService: disruption recorded', {
    disruptionId: id,
    flight: input.originalFlightNumber,
    type: input.disruptionType,
    affectedTickets: affected.length,
  });

  return {
    id,
    orgId,
    originalFlightNumber: input.originalFlightNumber,
    departureDate: input.departureDate,
    disruptionType: input.disruptionType,
    severity: input.severity,
    description: input.description,
    alternativeFlights: alternatives,
    resolvedAt: null,
    createdAt: now,
    affectedTickets: affected.length,
  };
}

/**
 * Find alternative flights for a disrupted route.
 * Placeholder implementation returning mock alternatives for the same route
 * with nearby departure times. Replace with real GDS/airline API integration.
 */
export async function findAlternativeFlights(
  _orgId: string,
  originalFlight: string,
  departureDate: string,
): Promise<AlternativeFlight[]> {
  // Extract airline code prefix (e.g., "EK" from "EK502")
  const airlineCode = originalFlight.replace(/\d+/g, '');
  const flightNum = parseInt(originalFlight.replace(/\D+/g, ''), 10) || 100;

  // Generate mock alternatives: same airline, nearby flight numbers, same date
  return [
    {
      flightNumber: `${airlineCode}${flightNum + 2}`,
      departureDate,
      departureTime: '14:30',
      arrivalTime: '18:45',
      seatsAvailable: 23,
    },
    {
      flightNumber: `${airlineCode}${flightNum + 4}`,
      departureDate,
      departureTime: '17:00',
      arrivalTime: '21:15',
      seatsAvailable: 45,
    },
    {
      flightNumber: `${airlineCode}${flightNum + 10}`,
      departureDate: nextDay(departureDate),
      departureTime: '08:00',
      arrivalTime: '12:15',
      seatsAvailable: 120,
    },
  ];
}

/**
 * Create a rebooking offer for a specific ticket on a disrupted flight.
 */
export async function offerRebooking(
  orgId: string,
  disruptionId: string,
  ticketId: string,
  newFlight: string,
  newDepartureDate: string,
): Promise<Rebooking> {
  await ensureTables();

  // Verify disruption exists
  const disruptions = await rawQuery<any>(
    `SELECT * FROM disruption_events WHERE id = ? AND org_id = ? LIMIT 1`,
    [disruptionId, orgId],
  );
  if (disruptions.length === 0) {
    throw new Error(`Disruption ${disruptionId} not found`);
  }

  const disruption = disruptions[0];
  const originalFlight = disruption.original_flight_number ?? disruption.originalFlightNumber;

  const id = randomUUID();
  const now = new Date().toISOString();

  await rawQuery(
    `INSERT INTO rebookings
       (id, org_id, disruption_id, ticket_id, original_flight, new_flight, new_departure_date, status, passenger_notified_at, accepted_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'OFFERED', ?, NULL, ?)`,
    [id, orgId, disruptionId, ticketId, originalFlight, newFlight, newDepartureDate, now, now],
  );

  logger.info('DisruptionService: rebooking offered', { rebookingId: id, ticketId, newFlight });

  return {
    id,
    orgId,
    disruptionId,
    ticketId,
    originalFlight,
    newFlight,
    newDepartureDate,
    status: 'OFFERED',
    passengerNotifiedAt: now,
    acceptedAt: null,
    createdAt: now,
  };
}

/**
 * Accept a rebooking offer. Updates the ticket's flight metadata and
 * transitions the ticket status back to CONFIRMED.
 */
export async function acceptRebooking(
  orgId: string,
  rebookingId: string,
): Promise<Rebooking | null> {
  await ensureTables();

  const now = new Date().toISOString();

  // Fetch the rebooking
  const rows = await rawQuery<any>(
    `SELECT * FROM rebookings WHERE id = ? AND org_id = ? AND status = 'OFFERED' LIMIT 1`,
    [rebookingId, orgId],
  );
  if (rows.length === 0) return null;

  const rb = rows[0];
  const ticketId = rb.ticket_id ?? rb.ticketId;
  const newFlight = rb.new_flight ?? rb.newFlight;
  const newDepartureDate = rb.new_departure_date ?? rb.newDepartureDate;

  // Update rebooking status
  await rawQuery(
    `UPDATE rebookings SET status = 'ACCEPTED', accepted_at = ? WHERE id = ? AND org_id = ?`,
    [now, rebookingId, orgId],
  );

  // Update the ticket's flight information and restore CONFIRMED status
  await rawQuery(
    `UPDATE airline_tickets
     SET flight_number = ?, departure_date = ?, status = 'CONFIRMED', updated_at = ?
     WHERE id = ? AND org_id = ?`,
    [newFlight, newDepartureDate, now, ticketId, orgId],
  ).catch((err: Error) => {
    logger.warn('DisruptionService: could not update ticket for rebooking', {
      ticketId,
      error: err.message,
    });
  });

  // Mark rebooking as completed
  await rawQuery(
    `UPDATE rebookings SET status = 'COMPLETED' WHERE id = ? AND org_id = ?`,
    [rebookingId, orgId],
  );

  logger.info('DisruptionService: rebooking accepted', { rebookingId, ticketId, newFlight });

  return mapRebookingRow({ ...rb, status: 'COMPLETED', accepted_at: now });
}

/**
 * Reject a rebooking offer. The ticket remains in its current state
 * and is eligible for a refund instead.
 */
export async function rejectRebooking(
  orgId: string,
  rebookingId: string,
): Promise<Rebooking | null> {
  await ensureTables();

  const rows = await rawQuery<any>(
    `SELECT * FROM rebookings WHERE id = ? AND org_id = ? AND status = 'OFFERED' LIMIT 1`,
    [rebookingId, orgId],
  );
  if (rows.length === 0) return null;

  await rawQuery(
    `UPDATE rebookings SET status = 'REJECTED' WHERE id = ? AND org_id = ?`,
    [rebookingId, orgId],
  );

  logger.info('DisruptionService: rebooking rejected', {
    rebookingId,
    ticketId: rows[0].ticket_id ?? rows[0].ticketId,
  });

  return mapRebookingRow({ ...rows[0], status: 'REJECTED' });
}

/**
 * List disruption events for an organisation with optional filters.
 */
export async function listDisruptions(
  orgId: string,
  filters?: {
    flightNumber?: string;
    disruptionType?: DisruptionType;
    severity?: DisruptionSeverity;
    resolved?: boolean;
    limit?: number;
    offset?: number;
  },
): Promise<{ data: DisruptionEvent[]; count: number }> {
  await ensureTables();

  const limit = filters?.limit ?? 50;
  const offset = filters?.offset ?? 0;
  const conditions: string[] = ['org_id = ?'];
  const params: unknown[] = [orgId];

  if (filters?.flightNumber) {
    conditions.push('original_flight_number = ?');
    params.push(filters.flightNumber);
  }
  if (filters?.disruptionType) {
    conditions.push('disruption_type = ?');
    params.push(filters.disruptionType);
  }
  if (filters?.severity) {
    conditions.push('severity = ?');
    params.push(filters.severity);
  }
  if (filters?.resolved === true) {
    conditions.push('resolved_at IS NOT NULL');
  } else if (filters?.resolved === false) {
    conditions.push('resolved_at IS NULL');
  }

  const where = conditions.join(' AND ');

  const rows = await rawQuery<any>(
    `SELECT * FROM disruption_events WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );

  const countRows = await rawQuery<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM disruption_events WHERE ${where}`,
    params,
  );

  return {
    data: rows.map(mapDisruptionRow),
    count: countRows[0]?.cnt ?? 0,
  };
}

/**
 * List rebookings, optionally filtered by disruption ID.
 */
export async function listRebookings(
  orgId: string,
  disruptionId?: string,
): Promise<Rebooking[]> {
  await ensureTables();

  let query = `SELECT * FROM rebookings WHERE org_id = ?`;
  const params: unknown[] = [orgId];

  if (disruptionId) {
    query += ' AND disruption_id = ?';
    params.push(disruptionId);
  }

  query += ' ORDER BY created_at DESC';

  const rows = await rawQuery<any>(query, params);
  return rows.map(mapRebookingRow);
}

// ============================================================================
// Internal Helpers
// ============================================================================

function mapDisruptionRow(row: any): DisruptionEvent {
  let alternatives: AlternativeFlight[] = [];
  try {
    const raw = row.alternative_flights ?? row.alternativeFlights ?? '[]';
    alternatives = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch { /* ignore parse errors */ }

  return {
    id: row.id,
    orgId: row.org_id ?? row.orgId,
    originalFlightNumber: row.original_flight_number ?? row.originalFlightNumber,
    departureDate: row.departure_date ?? row.departureDate,
    disruptionType: (row.disruption_type ?? row.disruptionType) as DisruptionType,
    severity: (row.severity as DisruptionSeverity) ?? 'minor',
    description: row.description ?? '',
    alternativeFlights: alternatives,
    resolvedAt: row.resolved_at ?? row.resolvedAt ?? null,
    createdAt: row.created_at ?? row.createdAt,
  };
}

function mapRebookingRow(row: any): Rebooking {
  return {
    id: row.id,
    orgId: row.org_id ?? row.orgId,
    disruptionId: row.disruption_id ?? row.disruptionId,
    ticketId: row.ticket_id ?? row.ticketId,
    originalFlight: row.original_flight ?? row.originalFlight,
    newFlight: row.new_flight ?? row.newFlight,
    newDepartureDate: row.new_departure_date ?? row.newDepartureDate,
    status: (row.status as RebookingStatus) ?? 'PENDING',
    passengerNotifiedAt: row.passenger_notified_at ?? row.passengerNotifiedAt ?? null,
    acceptedAt: row.accepted_at ?? row.acceptedAt ?? null,
    createdAt: row.created_at ?? row.createdAt,
  };
}

/**
 * Return the next calendar day in YYYY-MM-DD format.
 */
function nextDay(dateStr: string): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + 1);
  return d.toISOString().substring(0, 10);
}
