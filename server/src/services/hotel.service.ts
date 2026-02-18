import { db, schema, getDbMode } from '../config/database.js';
import { eq, and, desc, lt, gt, or, sql } from 'drizzle-orm';
import { NotFoundError, ValidationError, AppError } from '../middleware/errorHandler.js';
import * as relayerService from './relayer.service.js';
import { randomUUID } from 'crypto';
import { logger } from '../middleware/logger.js';

// SQLite compatibility helpers: Drizzle pgTable columns handle Date->string via mapToDriverValue,
// but SQLite can't bind booleans or objects directly.
const isSqlite = () => getDbMode() === 'sqlite';
const toDbBool = (b: boolean): any => isSqlite() ? (b ? 1 : 0) : b;
const toDbJson = (obj: unknown): any => isSqlite() ? JSON.stringify(obj ?? {}) : (obj ?? {});

const {
  hotelReservations,
  hotelReservationTransfers,
  hotelReservationEvents,
} = schema;

// ============================================================================
// Types
// ============================================================================

export type ReservationStatus =
  | 'CREATED'
  | 'CONFIRMED'
  | 'CHECKED_IN'
  | 'CHECKED_OUT'
  | 'CLOSED'
  | 'CANCELLED'
  | 'NO_SHOW'
  | 'EXPIRED'
  | 'VOID';

export type TransferRequestStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'COMPLETED'
  | 'EXPIRED';

const VALID_TRANSITIONS: Record<ReservationStatus, ReservationStatus[]> = {
  CREATED:     ['CONFIRMED', 'CANCELLED', 'NO_SHOW', 'EXPIRED', 'VOID'],
  CONFIRMED:   ['CHECKED_IN', 'CANCELLED', 'NO_SHOW', 'EXPIRED', 'VOID'],
  CHECKED_IN:  ['CHECKED_OUT', 'VOID'],
  CHECKED_OUT: ['CLOSED', 'VOID'],
  CLOSED:      ['VOID'],
  CANCELLED:   ['VOID'],
  NO_SHOW:     ['VOID'],
  EXPIRED:     ['VOID'],
  VOID:        [],
};

// ============================================================================
// Interfaces
// ============================================================================

export interface CreateReservationInput {
  orgId: string;
  hotelCode: string;
  hotelName: string;
  checkInDate: string;   // ISO date
  checkOutDate: string;  // ISO date
  roomType?: string;
  roomNumber?: string;
  guestId?: string;
  guestWallet?: string;
  guestName?: string;
  guestEmail?: string;
  confirmationNumber?: string;
  bookingReference?: string;
  transferable?: boolean;
  maxTransfers?: number;
  pricePaid?: string;
  currency?: string;
  metadata?: Record<string, unknown>;
}

export interface TransferReservationInput {
  orgId: string;
  reservationId: string;
  toWallet: string;
  toGuestId?: string;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Reservation CRUD
// ============================================================================

export async function createReservation(input: CreateReservationInput) {
  const {
    orgId, hotelCode, hotelName, checkInDate, checkOutDate,
    roomType, roomNumber, guestId, guestWallet, guestName,
    guestEmail, confirmationNumber, bookingReference,
    transferable, maxTransfers, pricePaid, currency, metadata,
  } = input;

  const checkIn = new Date(checkInDate);
  const checkOut = new Date(checkOutDate);

  if (checkIn <= new Date()) {
    throw new ValidationError('Check-in date must be in the future');
  }
  if (checkOut <= checkIn) {
    throw new ValidationError('Check-out date must be after check-in date');
  }

  // Idempotency by confirmation number
  if (confirmationNumber) {
    const existing = await db.query.hotelReservations.findFirst({
      where: and(eq(hotelReservations.orgId, orgId), eq(hotelReservations.confirmationNumber, confirmationNumber)),
    });
    if (existing) return existing;
  }

  const [reservation] = await db.insert(hotelReservations).values({
    orgId,
    hotelCode,
    hotelName,
    checkInDate: checkIn,
    checkOutDate: checkOut,
    roomType: roomType ?? 'STANDARD',
    roomNumber: roomNumber ?? null,
    guestId: guestId ?? null,
    guestWallet: guestWallet ?? null,
    guestName: guestName ?? null,
    guestEmail: guestEmail ?? null,
    confirmationNumber: confirmationNumber ?? `RES-${randomUUID().slice(0, 12).toUpperCase()}`,
    bookingReference: bookingReference ?? randomUUID().slice(0, 6).toUpperCase(),
    status: 'CREATED',
    transferable: toDbBool(transferable ?? true),
    maxTransfers: maxTransfers ?? 3,
    transferCount: 0,
    pricePaid: pricePaid ?? '0',
    currency: currency ?? 'ETH',
    metadata: toDbJson(metadata),
    createdAt: new Date(),
    updatedAt: new Date(),
  }).returning();

  // Record event
  await recordReservationEvent(orgId, reservation.id, 'RESERVATION_CREATED', 'SYSTEM', 'HOTEL_AGENT', null, 'CREATED', {
    hotelCode, hotelName, checkInDate, checkOutDate,
  });

  logger.info('Reservation created', { reservationId: reservation.id, hotelCode, orgId });
  return reservation;
}

export async function getReservation(orgId: string, reservationId: string) {
  const reservation = await db.query.hotelReservations.findFirst({
    where: and(eq(hotelReservations.id, reservationId), eq(hotelReservations.orgId, orgId)),
  });

  if (!reservation) throw new NotFoundError('Reservation not found');
  return reservation;
}

export async function listReservations(orgId: string, params?: {
  hotelCode?: string;
  status?: string;
  guestId?: string;
  limit?: number;
  offset?: number;
}) {
  const conditions = [eq(hotelReservations.orgId, orgId)];

  if (params?.hotelCode) conditions.push(eq(hotelReservations.hotelCode, params.hotelCode));
  if (params?.status) conditions.push(eq(hotelReservations.status, params.status));
  if (params?.guestId) conditions.push(eq(hotelReservations.guestId, params.guestId));

  const limit = params?.limit ?? 50;
  const offset = params?.offset ?? 0;

  const results = await db.select().from(hotelReservations)
    .where(and(...conditions))
    .orderBy(desc(hotelReservations.createdAt))
    .limit(limit)
    .offset(offset);

  return { data: results, limit, offset };
}

// ============================================================================
// Lifecycle Transitions
// ============================================================================

async function transitionReservation(
  orgId: string,
  reservationId: string,
  newStatus: ReservationStatus,
  actor: string,
  actorRole: string,
  details?: Record<string, unknown>,
) {
  const reservation = await getReservation(orgId, reservationId);
  const currentStatus = reservation.status as ReservationStatus;

  const allowed = VALID_TRANSITIONS[currentStatus];
  if (!allowed || !allowed.includes(newStatus)) {
    throw new ValidationError(`Cannot transition from ${currentStatus} to ${newStatus}`);
  }

  const now = new Date();
  const updateData: Record<string, unknown> = {
    status: newStatus,
    updatedAt: now,
  };

  if (newStatus === 'CONFIRMED') updateData.confirmedAt = now;
  if (newStatus === 'CHECKED_IN') updateData.checkedInAt = now;
  if (newStatus === 'CHECKED_OUT') updateData.checkedOutAt = now;
  if (newStatus === 'CLOSED') updateData.closedAt = now;
  if (newStatus === 'CANCELLED') updateData.cancelledAt = now;

  const [updated] = await db.update(hotelReservations)
    .set(updateData)
    .where(and(eq(hotelReservations.id, reservationId), eq(hotelReservations.orgId, orgId)))
    .returning();

  await recordReservationEvent(orgId, reservationId, `RESERVATION_${newStatus}`, actor, actorRole, currentStatus, newStatus, details);

  logger.info('Reservation transitioned', { reservationId, from: currentStatus, to: newStatus });
  return updated;
}

export async function confirmReservation(orgId: string, reservationId: string, actor: string) {
  return transitionReservation(orgId, reservationId, 'CONFIRMED', actor, 'HOTEL_AGENT', { action: 'confirm' });
}

export async function checkIn(orgId: string, reservationId: string, roomNumber: string, actor: string) {
  if (!roomNumber || roomNumber.trim().length === 0) {
    throw new ValidationError('Room number is required for check-in');
  }

  const reservation = await getReservation(orgId, reservationId);
  const currentStatus = reservation.status as ReservationStatus;

  const allowed = VALID_TRANSITIONS[currentStatus];
  if (!allowed || !allowed.includes('CHECKED_IN')) {
    throw new ValidationError(`Cannot transition from ${currentStatus} to CHECKED_IN`);
  }

  const now = new Date();
  const [updated] = await db.update(hotelReservations)
    .set({
      status: 'CHECKED_IN',
      roomNumber,
      checkedInAt: now,
      updatedAt: now,
    })
    .where(and(eq(hotelReservations.id, reservationId), eq(hotelReservations.orgId, orgId)))
    .returning();

  await recordReservationEvent(orgId, reservationId, 'RESERVATION_CHECKED_IN', actor, 'HOTEL_AGENT', currentStatus, 'CHECKED_IN', {
    roomNumber,
  });

  logger.info('Guest checked in', { reservationId, roomNumber });
  return updated;
}

export async function checkOut(orgId: string, reservationId: string, actor: string) {
  return transitionReservation(orgId, reservationId, 'CHECKED_OUT', actor, 'HOTEL_AGENT', { action: 'check_out' });
}

export async function closeReservation(orgId: string, reservationId: string, actor: string) {
  return transitionReservation(orgId, reservationId, 'CLOSED', actor, 'HOTEL_ADMIN', { action: 'close' });
}

export async function cancelReservation(orgId: string, reservationId: string, reason: string, actor: string) {
  const reservation = await getReservation(orgId, reservationId);
  const currentStatus = reservation.status as ReservationStatus;

  if (!['CREATED', 'CONFIRMED'].includes(currentStatus)) {
    throw new ValidationError(`Cannot cancel reservation in status ${currentStatus}; only CREATED or CONFIRMED reservations may be cancelled`);
  }

  return transitionReservation(orgId, reservationId, 'CANCELLED', actor, 'HOTEL_ADMIN', { reason });
}

// ============================================================================
// Extend Stay
// ============================================================================

export async function extendStay(orgId: string, reservationId: string, newCheckOutDate: string, actor: string) {
  const reservation = await getReservation(orgId, reservationId);
  const currentStatus = reservation.status as ReservationStatus;

  if (currentStatus !== 'CHECKED_IN') {
    throw new ValidationError(`Cannot extend stay for reservation in status ${currentStatus}; must be CHECKED_IN`);
  }

  const currentCheckOut = new Date(reservation.checkOutDate);
  const newCheckOut = new Date(newCheckOutDate);

  if (newCheckOut <= currentCheckOut) {
    throw new ValidationError('New check-out date must be after the current check-out date');
  }

  const [updated] = await db.update(hotelReservations)
    .set({
      checkOutDate: newCheckOut,
      updatedAt: new Date(),
    })
    .where(and(eq(hotelReservations.id, reservationId), eq(hotelReservations.orgId, orgId)))
    .returning();

  await recordReservationEvent(orgId, reservationId, 'STAY_EXTENDED', actor, 'HOTEL_AGENT', null, null, {
    previousCheckOut: currentCheckOut.toISOString(),
    newCheckOut: newCheckOut.toISOString(),
  });

  logger.info('Stay extended', { reservationId, newCheckOutDate });
  return updated;
}

// ============================================================================
// Transfer Operations
// ============================================================================

export async function requestTransfer(input: TransferReservationInput) {
  const { orgId, reservationId, toWallet, toGuestId, idempotencyKey, metadata } = input;

  // Idempotency check
  if (idempotencyKey) {
    const existing = await db.query.hotelReservationTransfers.findFirst({
      where: and(eq(hotelReservationTransfers.orgId, orgId), eq(hotelReservationTransfers.idempotencyKey, idempotencyKey)),
    });
    if (existing) return existing;
  }

  const reservation = await getReservation(orgId, reservationId);

  // Validate transfer eligibility
  if (!reservation.transferable) throw new ValidationError('Reservation is not transferable');
  if ((reservation.transferCount ?? 0) >= (reservation.maxTransfers ?? 3)) throw new ValidationError('Maximum transfers reached');

  const status = reservation.status as ReservationStatus;

  // Cannot transfer after check-in
  if (['CHECKED_IN', 'CHECKED_OUT', 'CLOSED'].includes(status)) {
    throw new ValidationError('Reservation is locked after check-in');
  }
  if (!['CREATED', 'CONFIRMED'].includes(status)) {
    throw new ValidationError(`Cannot transfer reservation in status ${status}`);
  }

  // Transfer window guard: 24h before check-in
  const checkInTime = new Date(reservation.checkInDate).getTime();
  const cutoff = checkInTime - (24 * 60 * 60 * 1000);
  if (Date.now() >= cutoff) {
    throw new ValidationError('Transfer window closed (less than 24h before check-in)');
  }

  const fromWallet = reservation.guestWallet ?? '';

  const [transfer] = await db.insert(hotelReservationTransfers).values({
    orgId,
    reservationId,
    fromWallet,
    toWallet,
    fromGuestId: reservation.guestId ?? null,
    toGuestId: toGuestId ?? null,
    status: 'PENDING',
    idempotencyKey,
    metadata: toDbJson(metadata),
    createdAt: new Date(),
    updatedAt: new Date(),
  }).returning();

  await recordReservationEvent(orgId, reservationId, 'TRANSFER_REQUESTED', fromWallet, 'GUEST', null, null, {
    transferId: transfer.id, toWallet,
  });

  logger.info('Transfer requested', { reservationId, transferId: transfer.id });
  return transfer;
}

export async function approveTransfer(orgId: string, transferId: string, approvedBy: string) {
  const transfer = await db.query.hotelReservationTransfers.findFirst({
    where: and(eq(hotelReservationTransfers.id, transferId), eq(hotelReservationTransfers.orgId, orgId)),
  });

  if (!transfer) throw new NotFoundError('Transfer request not found');
  if (transfer.status !== 'PENDING') {
    throw new ValidationError(`Cannot approve transfer in status ${transfer.status}`);
  }

  // Execute the transfer
  const reservation = await getReservation(orgId, transfer.reservationId);

  await db.update(hotelReservations).set({
    guestWallet: transfer.toWallet,
    guestId: transfer.toGuestId,
    transferCount: (reservation.transferCount ?? 0) + 1,
    updatedAt: new Date(),
  }).where(eq(hotelReservations.id, transfer.reservationId));

  const [updated] = await db.update(hotelReservationTransfers).set({
    status: 'COMPLETED',
    approvedBy,
    approvedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(hotelReservationTransfers.id, transferId)).returning();

  await recordReservationEvent(orgId, transfer.reservationId, 'RESERVATION_TRANSFERRED', approvedBy, 'HOTEL_ADMIN', null, null, {
    transferId, from: transfer.fromWallet, to: transfer.toWallet,
  });

  logger.info('Transfer approved and completed', { transferId, reservationId: transfer.reservationId });
  return updated;
}

// ============================================================================
// Event History
// ============================================================================

export async function getReservationEvents(orgId: string, reservationId: string, limit = 50) {
  return db.select().from(hotelReservationEvents)
    .where(and(eq(hotelReservationEvents.orgId, orgId), eq(hotelReservationEvents.reservationId, reservationId)))
    .orderBy(desc(hotelReservationEvents.createdAt))
    .limit(limit);
}

// ============================================================================
// Internal Helpers
// ============================================================================

async function recordReservationEvent(
  orgId: string,
  reservationId: string,
  eventType: string,
  actor: string,
  actorRole: string,
  previousState: string | null,
  newState: string | null,
  details?: Record<string, unknown>,
) {
  await db.insert(hotelReservationEvents).values({
    orgId,
    reservationId,
    eventType,
    actor,
    actorRole,
    previousState,
    newState,
    details: toDbJson(details),
    correlationId: randomUUID(),
    createdAt: new Date(),
  });
}
