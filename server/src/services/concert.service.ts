import { db, schema, getDbMode } from '../config/database.js';
import { eq, and, desc, sql } from 'drizzle-orm';
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
  concertTickets,
  concertTicketTransfers,
  concertTicketEvents,
} = schema;

// ============================================================================
// Types
// ============================================================================

export type ConcertTicketStatus =
  | 'CREATED'
  | 'ISSUED'
  | 'ADMITTED'
  | 'USED'
  | 'CLOSED'
  | 'CANCELLED'
  | 'REFUNDED'
  | 'EXPIRED'
  | 'VOID';

export type ConcertTransferStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'COMPLETED'
  | 'EXPIRED';

const VALID_TRANSITIONS: Record<ConcertTicketStatus, ConcertTicketStatus[]> = {
  CREATED:   ['ISSUED', 'CANCELLED', 'EXPIRED', 'VOID'],
  ISSUED:    ['ADMITTED', 'CANCELLED', 'EXPIRED', 'VOID'],
  ADMITTED:  ['USED', 'VOID'],
  USED:      ['CLOSED', 'VOID'],
  CLOSED:    [],
  CANCELLED: ['REFUNDED', 'VOID'],
  REFUNDED:  [],
  EXPIRED:   ['VOID'],
  VOID:      [],
};

/**
 * On-chain function selectors for NFT contract lifecycle calls.
 * Only statuses that require an on-chain transaction are listed.
 */
const ON_CHAIN_SELECTORS: Record<string, string> = {
  ADMITTED: '0x183ff085',   // admit(uint256)
  USED:     '0x6223258e',   // markUsed(uint256)
  VOID:     '0x42966c68',   // void(uint256)
};

// ============================================================================
// Interfaces
// ============================================================================

export interface CreateConcertTicketInput {
  orgId: string;
  venueCode: string;
  venueName: string;
  eventName: string;
  eventDate: string; // ISO timestamp
  doorsOpen?: string; // ISO timestamp
  section?: string;
  row?: string;
  seat?: string;
  ticketTier?: string; // GA, VIP, FLOOR, BALCONY, etc.
  fanId?: string;
  fanWallet?: string;
  fanName?: string;
  barcode?: string;
  bookingReference?: string;
  transferable?: boolean;
  maxTransfers?: number;
  resalePriceCap?: string; // anti-scalping: max allowed resale price
  pricePaid?: string;
  currency?: string;
  metadata?: Record<string, unknown>;
}

export interface TransferConcertTicketInput {
  orgId: string;
  ticketId: string;
  toWallet: string;
  toFanId?: string;
  idempotencyKey: string;
  resalePrice?: string;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Ticket CRUD
// ============================================================================

export async function createTicket(input: CreateConcertTicketInput) {
  const {
    orgId, venueCode, venueName, eventName, eventDate, doorsOpen,
    section, row, seat, ticketTier,
    fanId, fanWallet, fanName,
    barcode, bookingReference, transferable, maxTransfers,
    resalePriceCap, pricePaid, currency, metadata,
  } = input;

  const evtDate = new Date(eventDate);

  if (evtDate <= new Date()) {
    throw new ValidationError('Event date must be in the future');
  }

  // Idempotency by barcode
  if (barcode) {
    const existing = await db.query.concertTickets.findFirst({
      where: and(eq(concertTickets.orgId, orgId), eq(concertTickets.barcode, barcode)),
    });
    if (existing) return existing;
  }

  const [ticket] = await db.insert(concertTickets).values({
    orgId,
    venueCode,
    venueName,
    eventName,
    eventDate: evtDate,
    doorsOpen: doorsOpen ? new Date(doorsOpen) : null,
    section: section ?? null,
    row: row ?? null,
    seat: seat ?? null,
    ticketTier: ticketTier ?? 'GA',
    fanId: fanId ?? null,
    fanWallet: fanWallet ?? null,
    fanName: fanName ?? null,
    barcode: barcode ?? `CT-${randomUUID().slice(0, 12).toUpperCase()}`,
    bookingReference: bookingReference ?? randomUUID().slice(0, 6).toUpperCase(),
    status: 'CREATED',
    transferable: toDbBool(transferable ?? true),
    maxTransfers: maxTransfers ?? 3,
    transferCount: 0,
    resalePriceCap: resalePriceCap ?? null,
    pricePaid: pricePaid ?? '0',
    currency: currency ?? 'ETH',
    metadataVersion: 1,
    metadata: toDbJson(metadata),
    createdAt: new Date(),
    updatedAt: new Date(),
  }).returning();

  // Record event
  await recordConcertEvent(orgId, ticket.id, 'TICKET_CREATED', 'SYSTEM', 'VENUE_ADMIN', null, 'CREATED', {
    venueCode, eventName, eventDate,
  });

  logger.info('Concert ticket created', { ticketId: ticket.id, eventName, orgId });
  return ticket;
}

export async function getTicket(orgId: string, ticketId: string) {
  const ticket = await db.query.concertTickets.findFirst({
    where: and(eq(concertTickets.id, ticketId), eq(concertTickets.orgId, orgId)),
  });

  if (!ticket) throw new NotFoundError('Concert ticket not found');
  return ticket;
}

export async function listTickets(orgId: string, params?: {
  venueCode?: string;
  eventName?: string;
  status?: string;
  fanId?: string;
  limit?: number;
  offset?: number;
}) {
  const conditions = [eq(concertTickets.orgId, orgId)];

  if (params?.venueCode) conditions.push(eq(concertTickets.venueCode, params.venueCode));
  if (params?.eventName) conditions.push(eq(concertTickets.eventName, params.eventName));
  if (params?.status) conditions.push(eq(concertTickets.status, params.status));
  if (params?.fanId) conditions.push(eq(concertTickets.fanId, params.fanId));

  const limit = params?.limit ?? 50;
  const offset = params?.offset ?? 0;

  const results = await db.select().from(concertTickets)
    .where(and(...conditions))
    .orderBy(desc(concertTickets.createdAt))
    .limit(limit)
    .offset(offset);

  return { data: results, limit, offset };
}

// ============================================================================
// Lifecycle Transitions
// ============================================================================

async function transitionTicket(
  orgId: string,
  ticketId: string,
  newStatus: ConcertTicketStatus,
  actor: string,
  actorRole: string,
  details?: Record<string, unknown>,
) {
  const ticket = await getTicket(orgId, ticketId);
  const currentStatus = ticket.status as ConcertTicketStatus;

  const allowed = VALID_TRANSITIONS[currentStatus];
  if (!allowed || !allowed.includes(newStatus)) {
    throw new ValidationError(`Cannot transition from ${currentStatus} to ${newStatus}`);
  }

  const now = new Date();
  const updateData: Record<string, unknown> = {
    status: newStatus,
    updatedAt: now,
  };

  if (newStatus === 'ISSUED') updateData.issuedAt = now;
  if (newStatus === 'ADMITTED') updateData.admittedAt = now;
  if (newStatus === 'USED') updateData.usedAt = now;
  if (newStatus === 'CLOSED') updateData.closedAt = now;
  if (newStatus === 'CANCELLED') updateData.cancelledAt = now;

  // Optimistic DB update
  const [updated] = await db.update(concertTickets)
    .set(updateData)
    .where(and(eq(concertTickets.id, ticketId), eq(concertTickets.orgId, orgId)))
    .returning();

  // On-chain saga: submit NFT contract call if this status has a selector
  const selector = ON_CHAIN_SELECTORS[newStatus];
  if (selector && ticket.contractAddress && ticket.chainTokenId != null) {
    const chainId = ticket.chainId as number | undefined;
    const relayerAddress = process.env.RELAYER_ADDRESS;

    if (chainId && relayerAddress) {
      try {
        // ABI-encode: selector + uint256(chainTokenId)
        const tokenIdHex = BigInt(ticket.chainTokenId).toString(16).padStart(64, '0');
        const calldata = `${selector}${tokenIdHex}`;

        const txRequest = await relayerService.buildTransaction({
          to: ticket.contractAddress,
          from: relayerAddress,
          data: calldata,
          chainId,
        });

        const { signedTx, hash } = await relayerService.signTransaction(txRequest, orgId);
        const { txHash } = await relayerService.submitTransaction(chainId, signedTx, orgId);
        const receipt = await relayerService.waitForTransaction(chainId, txHash);

        if (receipt.status === 'failed') {
          // Rollback: revert DB to previous status
          await db.update(concertTickets)
            .set({ status: currentStatus, updatedAt: new Date() })
            .where(eq(concertTickets.id, ticketId));

          logger.error('On-chain tx reverted, rolling back', { ticketId, txHash, from: currentStatus, to: newStatus });
          throw new AppError(`On-chain transaction reverted for ${newStatus} (tx: ${txHash})`, 502);
        }

        // Persist txHash in ticket metadata
        const existingMeta = (ticket.metadata as Record<string, unknown>) ?? {};
        await db.update(concertTickets)
          .set({
            metadata: toDbJson({ ...existingMeta, lastTxHash: txHash }),
          })
          .where(eq(concertTickets.id, ticketId));

        logger.info('On-chain lifecycle tx confirmed', { ticketId, txHash, status: newStatus });
      } catch (error) {
        // If the error is our own AppError (rollback case), re-throw
        if (error instanceof AppError) throw error;

        // Network / relayer failure: rollback DB
        await db.update(concertTickets)
          .set({ status: currentStatus, updatedAt: new Date() })
          .where(eq(concertTickets.id, ticketId));

        logger.error('On-chain lifecycle call failed, rolling back', { ticketId, error });
        throw new AppError(`On-chain call failed for ${newStatus}: ${error instanceof Error ? error.message : 'Unknown error'}`, 502);
      }
    }
  }

  await recordConcertEvent(orgId, ticketId, `TICKET_${newStatus}`, actor, actorRole, currentStatus, newStatus, details);

  // Increment metadata version
  await db.update(concertTickets)
    .set({ metadataVersion: (ticket.metadataVersion ?? 1) + 1 })
    .where(eq(concertTickets.id, ticketId));

  logger.info('Concert ticket transitioned', { ticketId, from: currentStatus, to: newStatus });
  return updated;
}

export async function issueTicket(orgId: string, ticketId: string, actor: string) {
  return transitionTicket(orgId, ticketId, 'ISSUED', actor, 'VENUE_ADMIN', { action: 'issue' });
}

export async function admitFan(orgId: string, ticketId: string, actor: string) {
  const ticket = await getTicket(orgId, ticketId);

  // One-time gate scan guard: if already ADMITTED/USED/CLOSED, reject
  if (['ADMITTED', 'USED', 'CLOSED'].includes(ticket.status)) {
    throw new ValidationError('Fan has already been admitted');
  }

  return transitionTicket(orgId, ticketId, 'ADMITTED', actor, 'GATE_STAFF', { action: 'gate_scan' });
}

export async function markUsed(orgId: string, ticketId: string, actor: string) {
  return transitionTicket(orgId, ticketId, 'USED', actor, 'VENUE_ADMIN', { action: 'mark_used' });
}

export async function closeTicket(orgId: string, ticketId: string, actor: string) {
  return transitionTicket(orgId, ticketId, 'CLOSED', actor, 'VENUE_ADMIN', { action: 'close' });
}

export async function cancelTicket(orgId: string, ticketId: string, reason: string, actor: string) {
  return transitionTicket(orgId, ticketId, 'CANCELLED', actor, 'VENUE_ADMIN', { reason });
}

export async function refundTicket(orgId: string, ticketId: string, actor: string) {
  return transitionTicket(orgId, ticketId, 'REFUNDED', actor, 'VENUE_ADMIN', { action: 'refund' });
}

export async function voidTicket(orgId: string, ticketId: string, reason: string, actor: string) {
  // VOID can happen from any non-terminal state; override transition check
  const ticket = await getTicket(orgId, ticketId);
  const currentStatus = ticket.status as ConcertTicketStatus;

  const terminalStatuses: ConcertTicketStatus[] = ['CLOSED', 'REFUNDED', 'VOID'];
  if (terminalStatuses.includes(currentStatus)) {
    throw new ValidationError(`Cannot void ticket in terminal status ${currentStatus}`);
  }

  const now = new Date();
  const [updated] = await db.update(concertTickets)
    .set({ status: 'VOID' as any, updatedAt: now })
    .where(and(eq(concertTickets.id, ticketId), eq(concertTickets.orgId, orgId)))
    .returning();

  await recordConcertEvent(orgId, ticketId, 'TICKET_VOID', actor, 'VENUE_ADMIN', currentStatus, 'VOID', { reason });

  logger.info('Concert ticket voided', { ticketId, from: currentStatus });
  return updated;
}

// ============================================================================
// Transfer Operations (Anti-Scalping)
// ============================================================================

export async function requestTransfer(input: TransferConcertTicketInput) {
  const { orgId, ticketId, toWallet, toFanId, idempotencyKey, resalePrice, metadata } = input;

  // Idempotency check
  if (idempotencyKey) {
    const existing = await db.query.concertTicketTransfers.findFirst({
      where: and(eq(concertTicketTransfers.orgId, orgId), eq(concertTicketTransfers.idempotencyKey, idempotencyKey)),
    });
    if (existing) return existing;
  }

  const ticket = await getTicket(orgId, ticketId);

  // Validate transfer eligibility
  if (!ticket.transferable) throw new ValidationError('Ticket is not transferable');
  if ((ticket.transferCount ?? 0) >= (ticket.maxTransfers ?? 3)) throw new ValidationError('Maximum transfers reached');

  const status = ticket.status as ConcertTicketStatus;
  if (status === 'ADMITTED' || status === 'USED') throw new ValidationError('Ticket is locked after admission');
  if (!['CREATED', 'ISSUED'].includes(status)) throw new ValidationError(`Cannot transfer ticket in status ${status}`);

  // Anti-scalping: reject if resalePrice exceeds the resale price cap
  if (resalePrice && ticket.resalePriceCap) {
    const price = parseFloat(resalePrice);
    const cap = parseFloat(ticket.resalePriceCap);
    if (price > cap) {
      throw new ValidationError(
        `Resale price ${resalePrice} exceeds the price cap of ${ticket.resalePriceCap}. Anti-scalping policy prohibits this transfer.`,
      );
    }
  }

  // Transfer window guard: 24h before event
  const eventTime = new Date(ticket.eventDate).getTime();
  const cutoff = eventTime - (24 * 60 * 60 * 1000);
  if (Date.now() >= cutoff) {
    throw new ValidationError('Transfer window closed (less than 24h before event)');
  }

  const fromWallet = ticket.fanWallet ?? '';

  const [transfer] = await db.insert(concertTicketTransfers).values({
    orgId,
    ticketId,
    fromWallet,
    toWallet,
    fromFanId: ticket.fanId ?? null,
    toFanId: toFanId ?? null,
    status: 'PENDING',
    resalePrice: resalePrice ?? null,
    idempotencyKey,
    metadata: toDbJson(metadata),
    createdAt: new Date(),
    updatedAt: new Date(),
  }).returning();

  await recordConcertEvent(orgId, ticketId, 'TRANSFER_REQUESTED', fromWallet, 'FAN', null, null, {
    transferId: transfer.id, toWallet, resalePrice,
  });

  logger.info('Concert transfer requested', { ticketId, transferId: transfer.id });
  return transfer;
}

export async function approveTransfer(orgId: string, transferId: string, approvedBy: string) {
  const transfer = await db.query.concertTicketTransfers.findFirst({
    where: and(eq(concertTicketTransfers.id, transferId), eq(concertTicketTransfers.orgId, orgId)),
  });

  if (!transfer) throw new NotFoundError('Transfer request not found');
  if (transfer.status !== 'PENDING') {
    throw new ValidationError(`Cannot approve transfer in status ${transfer.status}`);
  }

  // Execute the transfer
  const ticket = await getTicket(orgId, transfer.ticketId);

  await db.update(concertTickets).set({
    fanWallet: transfer.toWallet,
    fanId: transfer.toFanId,
    transferCount: (ticket.transferCount ?? 0) + 1,
    metadataVersion: (ticket.metadataVersion ?? 1) + 1,
    updatedAt: new Date(),
  }).where(eq(concertTickets.id, transfer.ticketId));

  const [updated] = await db.update(concertTicketTransfers).set({
    status: 'COMPLETED',
    approvedBy,
    approvedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(concertTicketTransfers.id, transferId)).returning();

  await recordConcertEvent(orgId, transfer.ticketId, 'TICKET_TRANSFERRED', approvedBy, 'VENUE_ADMIN', null, null, {
    transferId, from: transfer.fromWallet, to: transfer.toWallet,
  });

  logger.info('Concert transfer approved and completed', { transferId, ticketId: transfer.ticketId });
  return updated;
}

export async function rejectTransfer(orgId: string, transferId: string, reason: string, rejectedBy: string) {
  const [updated] = await db.update(concertTicketTransfers).set({
    status: 'REJECTED',
    rejectionReason: reason,
    updatedAt: new Date(),
  }).where(and(eq(concertTicketTransfers.id, transferId), eq(concertTicketTransfers.orgId, orgId))).returning();

  if (!updated) throw new NotFoundError('Transfer request not found');

  await recordConcertEvent(orgId, updated.ticketId, 'TRANSFER_REJECTED', rejectedBy, 'VENUE_ADMIN', null, null, {
    transferId, reason,
  });

  return updated;
}

// ============================================================================
// Event History
// ============================================================================

export async function getTicketEvents(orgId: string, ticketId: string, limit = 50) {
  return db.select().from(concertTicketEvents)
    .where(and(eq(concertTicketEvents.orgId, orgId), eq(concertTicketEvents.ticketId, ticketId)))
    .orderBy(desc(concertTicketEvents.createdAt))
    .limit(limit);
}

export async function getTransferHistory(orgId: string, ticketId: string) {
  return db.select().from(concertTicketTransfers)
    .where(and(eq(concertTicketTransfers.orgId, orgId), eq(concertTicketTransfers.ticketId, ticketId)))
    .orderBy(desc(concertTicketTransfers.createdAt));
}

// ============================================================================
// Auto-Expiry (called by background worker or Chainlink Automation callback)
// ============================================================================

export async function expireStaleTickets(orgId: string) {
  const now = new Date();
  const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);

  const staleTickets = await db.select().from(concertTickets).where(
    and(
      eq(concertTickets.orgId, orgId),
      sql`${concertTickets.eventDate} < ${sixHoursAgo}`,
      sql`(${concertTickets.status} = 'CREATED' OR ${concertTickets.status} = 'ISSUED')`,
    )
  );

  const results = [];
  for (const ticket of staleTickets) {
    try {
      await transitionTicket(orgId, ticket.id, 'EXPIRED', 'AUTOMATION', 'SYSTEM', {
        reason: 'Auto-expired: event time passed',
        eventDate: ticket.eventDate,
      });
      results.push({ ticketId: ticket.id, success: true });
    } catch (error: any) {
      results.push({ ticketId: ticket.id, success: false, error: error.message });
    }
  }

  logger.info('Concert auto-expiry completed', { orgId, expired: results.filter(r => r.success).length });
  return results;
}

// ============================================================================
// Internal Helpers
// ============================================================================

async function recordConcertEvent(
  orgId: string,
  ticketId: string,
  eventType: string,
  actor: string,
  actorRole: string,
  previousState: string | null,
  newState: string | null,
  details?: Record<string, unknown>,
) {
  await db.insert(concertTicketEvents).values({
    orgId,
    ticketId,
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
