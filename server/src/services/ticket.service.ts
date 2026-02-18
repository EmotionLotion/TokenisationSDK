import { db, schema, getDbMode } from '../config/database.js';
import { eq, and, desc, lt, gt, or, sql } from 'drizzle-orm';
import { NotFoundError, ValidationError, AppError } from '../middleware/errorHandler.js';
import * as complianceService from './compliance.service.js';
import * as relayerService from './relayer.service.js';
import { randomUUID } from 'crypto';
import { logger } from '../middleware/logger.js';

// SQLite compatibility helpers: Drizzle pgTable columns handle Date→string via mapToDriverValue,
// but SQLite can't bind booleans or objects directly.
const isSqlite = () => getDbMode() === 'sqlite';
const toDbBool = (b: boolean): any => isSqlite() ? (b ? 1 : 0) : b;
const toDbJson = (obj: unknown): any => isSqlite() ? JSON.stringify(obj ?? {}) : (obj ?? {});

const {
  airlineTickets,
  ticketTransfers,
  ticketEvents,
  ticketMetadataVersions,
  resaleFeeLedger,
  ticketWebhooks,
} = schema;

// ============================================================================
// Types
// ============================================================================

export type TicketStatus =
  | 'ISSUED'
  | 'CONFIRMED'
  | 'CHECKED_IN'
  | 'BOARDED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'REFUNDED'
  | 'EXPIRED'
  | 'BURNED'
  | 'VOID';

export type TransferRequestStatus =
  | 'PENDING'
  | 'KYC_REQUIRED'
  | 'APPROVED'
  | 'REJECTED'
  | 'COMPLETED'
  | 'EXPIRED';

const VALID_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  ISSUED: ['CONFIRMED', 'CHECKED_IN', 'CANCELLED', 'EXPIRED', 'VOID'],
  CONFIRMED: ['CHECKED_IN', 'CANCELLED', 'EXPIRED', 'VOID'],
  CHECKED_IN: ['BOARDED', 'CANCELLED', 'VOID'],
  BOARDED: ['COMPLETED'],
  COMPLETED: ['BURNED'],
  CANCELLED: ['REFUNDED', 'VOID'],
  REFUNDED: ['BURNED'],
  EXPIRED: ['VOID'],
  BURNED: [],
  VOID: [],
};

/**
 * On-chain function selectors for NFT contract lifecycle calls.
 * Only statuses that require an on-chain transaction are listed.
 */
const ON_CHAIN_SELECTORS: Record<string, string> = {
  CHECKED_IN: '0x183ff085',   // checkIn(uint256)
  BOARDED:    '0x6223258e',   // board(uint256)
  BURNED:     '0x42966c68',   // burn(uint256)
};

// ============================================================================
// Interfaces
// ============================================================================

export interface IssueTicketInput {
  orgId: string;
  flightNumber: string;
  airline: string;
  departureTime: string; // ISO timestamp
  arrivalTime: string;
  departureAirport: string;
  arrivalAirport: string;
  gate?: string;
  seat?: string;
  ticketClass?: string;
  passengerId?: string;
  passengerWallet?: string;
  passengerName?: string;
  eTicketNumber?: string;
  bookingReference?: string;
  transferable?: boolean;
  maxTransfers?: number;
  pricePaid?: string;
  currency?: string;
  metadata?: Record<string, unknown>;
}

export interface TransferTicketInput {
  orgId: string;
  ticketId: string;
  toWallet: string;
  toPassengerId?: string;
  idempotencyKey: string;
  kycRequired?: boolean;
  resaleFee?: string;
  resaleFeeCurrency?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateMetadataInput {
  orgId: string;
  ticketId: string;
  field: string;
  newValue: string;
  changeReason?: string;
  changedBy?: string;
}

export interface BulkUpdateInput {
  orgId: string;
  ticketIds: string[];
  newStatus: TicketStatus;
  reason?: string;
  actor?: string;
}

export interface ReconciliationReportInput {
  orgId: string;
  flightNumber: string;
  departureDate: string;
}

// ============================================================================
// Ticket CRUD
// ============================================================================

export async function issueTicket(input: IssueTicketInput) {
  const {
    orgId, flightNumber, airline, departureTime, arrivalTime,
    departureAirport, arrivalAirport, gate, seat, ticketClass,
    passengerId, passengerWallet, passengerName,
    eTicketNumber, bookingReference, transferable, maxTransfers,
    pricePaid, currency, metadata,
  } = input;

  const depTime = new Date(departureTime);
  const arrTime = new Date(arrivalTime);

  if (depTime <= new Date()) {
    throw new ValidationError('Departure time must be in the future');
  }
  if (arrTime <= depTime) {
    throw new ValidationError('Arrival time must be after departure time');
  }

  // Check idempotency by e-ticket number
  if (eTicketNumber) {
    const existing = await db.query.airlineTickets.findFirst({
      where: and(eq(airlineTickets.orgId, orgId), eq(airlineTickets.eTicketNumber, eTicketNumber)),
    });
    if (existing) return existing;
  }

  const [ticket] = await db.insert(airlineTickets).values({
    orgId,
    flightNumber,
    airline,
    departureTime: depTime,
    arrivalTime: arrTime,
    departureAirport,
    arrivalAirport,
    gate: gate ?? null,
    seat: seat ?? null,
    ticketClass: ticketClass ?? 'ECONOMY',
    passengerId: passengerId ?? null,
    passengerWallet: passengerWallet ?? null,
    passengerName: passengerName ?? null,
    eTicketNumber: eTicketNumber ?? `ET-${randomUUID().slice(0, 12).toUpperCase()}`,
    bookingReference: bookingReference ?? randomUUID().slice(0, 6).toUpperCase(),
    status: 'ISSUED',
    transferable: toDbBool(transferable ?? true),
    maxTransfers: maxTransfers ?? 3,
    transferCount: 0,
    pricePaid: pricePaid ?? '0',
    currency: currency ?? 'ETH',
    metadataVersion: 1,
    metadata: toDbJson(metadata),
    issuedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  }).returning();

  // Record event
  await recordTicketEvent(orgId, ticket.id, 'TICKET_ISSUED', 'SYSTEM', 'AIRLINE_AGENT', null, 'ISSUED', {
    flightNumber, airline, departureAirport, arrivalAirport,
  });

  logger.info('Ticket issued', { ticketId: ticket.id, flightNumber, orgId });
  return ticket;
}

export async function getTicket(orgId: string, ticketId: string) {
  const ticket = await db.query.airlineTickets.findFirst({
    where: and(eq(airlineTickets.id, ticketId), eq(airlineTickets.orgId, orgId)),
  });

  if (!ticket) throw new NotFoundError('Ticket not found');
  return ticket;
}

export async function listTickets(orgId: string, params?: {
  flightNumber?: string;
  status?: string;
  passengerId?: string;
  limit?: number;
  offset?: number;
}) {
  const conditions = [eq(airlineTickets.orgId, orgId)];

  if (params?.flightNumber) conditions.push(eq(airlineTickets.flightNumber, params.flightNumber));
  if (params?.status) conditions.push(eq(airlineTickets.status, params.status));
  if (params?.passengerId) conditions.push(eq(airlineTickets.passengerId, params.passengerId));

  const limit = params?.limit ?? 50;
  const offset = params?.offset ?? 0;

  const results = await db.select().from(airlineTickets)
    .where(and(...conditions))
    .orderBy(desc(airlineTickets.createdAt))
    .limit(limit)
    .offset(offset);

  return { data: results, limit, offset };
}

// ============================================================================
// Lifecycle Transitions
// ============================================================================

async function transitionTicket(orgId: string, ticketId: string, newStatus: TicketStatus, actor: string, actorRole: string, details?: Record<string, unknown>) {
  const ticket = await getTicket(orgId, ticketId);
  const currentStatus = ticket.status as TicketStatus;

  const allowed = VALID_TRANSITIONS[currentStatus];
  if (!allowed || !allowed.includes(newStatus)) {
    throw new ValidationError(`Cannot transition from ${currentStatus} to ${newStatus}`);
  }

  const now = new Date();
  const updateData: Record<string, unknown> = {
    status: newStatus,
    updatedAt: now,
  };

  if (newStatus === 'CHECKED_IN') updateData.checkedInAt = now;
  if (newStatus === 'BOARDED') updateData.boardedAt = now;
  if (newStatus === 'COMPLETED') updateData.completedAt = now;
  if (newStatus === 'CANCELLED') updateData.cancelledAt = now;
  if (newStatus === 'BURNED') updateData.burnedAt = now;

  // Optimistic DB update
  const [updated] = await db.update(airlineTickets)
    .set(updateData)
    .where(and(eq(airlineTickets.id, ticketId), eq(airlineTickets.orgId, orgId)))
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
          await db.update(airlineTickets)
            .set({ status: currentStatus, updatedAt: new Date() })
            .where(eq(airlineTickets.id, ticketId));

          logger.error('On-chain tx reverted, rolling back', { ticketId, txHash, from: currentStatus, to: newStatus });
          throw new AppError(`On-chain transaction reverted for ${newStatus} (tx: ${txHash})`, 502);
        }

        // Persist txHash in ticket metadata
        const existingMeta = (ticket.metadata as Record<string, unknown>) ?? {};
        await db.update(airlineTickets)
          .set({
            metadata: toDbJson({ ...existingMeta, lastTxHash: txHash }),
          })
          .where(eq(airlineTickets.id, ticketId));

        // For burn, also record burnedAt if not already set
        if (newStatus === 'BURNED') {
          await db.update(airlineTickets)
            .set({ burnedAt: new Date() })
            .where(and(eq(airlineTickets.id, ticketId), sql`burned_at IS NULL`));
        }

        logger.info('On-chain lifecycle tx confirmed', { ticketId, txHash, status: newStatus });
      } catch (error) {
        // If the error is our own AppError (rollback case), re-throw
        if (error instanceof AppError) throw error;

        // Network / relayer failure: rollback DB
        await db.update(airlineTickets)
          .set({ status: currentStatus, updatedAt: new Date() })
          .where(eq(airlineTickets.id, ticketId));

        logger.error('On-chain lifecycle call failed, rolling back', { ticketId, error });
        throw new AppError(`On-chain call failed for ${newStatus}: ${error instanceof Error ? error.message : 'Unknown error'}`, 502);
      }
    }
  }

  await recordTicketEvent(orgId, ticketId, `TICKET_${newStatus}`, actor, actorRole, currentStatus, newStatus, details);

  // Record metadata version
  await db.insert(ticketMetadataVersions).values({
    orgId,
    ticketId,
    version: (ticket.metadataVersion ?? 1) + 1,
    field: 'status',
    oldValue: currentStatus,
    newValue: newStatus,
    changedBy: actor,
    createdAt: new Date(),
  });

  // Increment metadata version
  await db.update(airlineTickets)
    .set({ metadataVersion: (ticket.metadataVersion ?? 1) + 1 })
    .where(eq(airlineTickets.id, ticketId));

  logger.info('Ticket transitioned', { ticketId, from: currentStatus, to: newStatus });
  return updated;
}

export async function checkIn(orgId: string, ticketId: string, actor: string) {
  return transitionTicket(orgId, ticketId, 'CHECKED_IN', actor, 'AIRLINE_AGENT', { action: 'check_in' });
}

export async function board(orgId: string, ticketId: string, actor: string) {
  const ticket = await getTicket(orgId, ticketId);

  // One-time use guard: if already BOARDED/COMPLETED/BURNED, reject
  if (['BOARDED', 'COMPLETED', 'BURNED'].includes(ticket.status)) {
    throw new ValidationError('Ticket has already been used');
  }

  return transitionTicket(orgId, ticketId, 'BOARDED', actor, 'AIRLINE_AGENT', { action: 'board' });
}

export async function completeTicket(orgId: string, ticketId: string, actor: string) {
  return transitionTicket(orgId, ticketId, 'COMPLETED', actor, 'AIRLINE_ADMIN');
}

export async function burnTicket(orgId: string, ticketId: string, actor: string) {
  return transitionTicket(orgId, ticketId, 'BURNED', actor, 'SYSTEM', { action: 'burn_after_use' });
}

export async function cancelTicket(orgId: string, ticketId: string, reason: string, actor: string) {
  return transitionTicket(orgId, ticketId, 'CANCELLED', actor, 'AIRLINE_ADMIN', { reason });
}

export async function refundTicket(orgId: string, ticketId: string, actor: string) {
  return transitionTicket(orgId, ticketId, 'REFUNDED', actor, 'AIRLINE_ADMIN', { action: 'refund' });
}

export async function completeAndBurn(orgId: string, ticketId: string, actor: string) {
  await transitionTicket(orgId, ticketId, 'COMPLETED', actor, 'SYSTEM');
  return transitionTicket(orgId, ticketId, 'BURNED', actor, 'SYSTEM', { action: 'complete_and_burn' });
}

// ============================================================================
// Transfer Operations
// ============================================================================

export async function requestTransfer(input: TransferTicketInput) {
  const { orgId, ticketId, toWallet, toPassengerId, idempotencyKey, kycRequired, resaleFee, resaleFeeCurrency, metadata } = input;

  // Idempotency check
  if (idempotencyKey) {
    const existing = await db.query.ticketTransfers.findFirst({
      where: and(eq(ticketTransfers.orgId, orgId), eq(ticketTransfers.idempotencyKey, idempotencyKey)),
    });
    if (existing) return existing;
  }

  const ticket = await getTicket(orgId, ticketId);

  // Validate transfer eligibility
  if (!ticket.transferable) throw new ValidationError('Ticket is not transferable');
  if ((ticket.transferCount ?? 0) >= (ticket.maxTransfers ?? 3)) throw new ValidationError('Maximum transfers reached');

  const status = ticket.status as TicketStatus;
  if (status === 'CHECKED_IN' || status === 'BOARDED') throw new ValidationError('Ticket is locked after check-in');
  if (!['ISSUED', 'CONFIRMED'].includes(status)) throw new ValidationError(`Cannot transfer ticket in status ${status}`);

  // Transfer window guard: 24h before departure
  const departureTime = new Date(ticket.departureTime).getTime();
  const cutoff = departureTime - (24 * 60 * 60 * 1000);
  if (Date.now() >= cutoff) throw new ValidationError('Transfer window closed (less than 24h before departure)');

  const fromWallet = ticket.passengerWallet ?? '';
  const initialStatus: TransferRequestStatus = kycRequired ? 'KYC_REQUIRED' : 'PENDING';

  const [transfer] = await db.insert(ticketTransfers).values({
    orgId,
    ticketId,
    fromWallet,
    toWallet,
    fromPassengerId: ticket.passengerId ?? null,
    toPassengerId: toPassengerId ?? null,
    status: initialStatus,
    kycRequired: toDbBool(kycRequired ?? false),
    kycCompleted: toDbBool(false),
    resaleFee: resaleFee ?? null,
    resaleFeeCurrency: resaleFeeCurrency ?? null,
    resaleFeePaid: toDbBool(false),
    idempotencyKey,
    metadata: toDbJson(metadata),
    createdAt: new Date(),
    updatedAt: new Date(),
  }).returning();

  // Record resale fee if applicable
  if (resaleFee && parseFloat(resaleFee) > 0) {
    await db.insert(resaleFeeLedger).values({
      orgId,
      ticketId,
      transferId: transfer.id,
      amount: resaleFee,
      currency: resaleFeeCurrency ?? 'ETH',
      status: 'PENDING',
      metadata: toDbJson({}),
      createdAt: new Date(),
    });
  }

  await recordTicketEvent(orgId, ticketId, 'TRANSFER_REQUESTED', fromWallet, 'PASSENGER', null, null, {
    transferId: transfer.id, toWallet,
  });

  logger.info('Transfer requested', { ticketId, transferId: transfer.id });
  return transfer;
}

export async function approveTransfer(orgId: string, transferId: string, approvedBy: string) {
  const transfer = await db.query.ticketTransfers.findFirst({
    where: and(eq(ticketTransfers.id, transferId), eq(ticketTransfers.orgId, orgId)),
  });

  if (!transfer) throw new NotFoundError('Transfer request not found');
  if (transfer.status !== 'PENDING' && transfer.status !== 'KYC_REQUIRED') {
    throw new ValidationError(`Cannot approve transfer in status ${transfer.status}`);
  }
  if (transfer.kycRequired && !transfer.kycCompleted) {
    throw new ValidationError('KYC must be completed before approval');
  }

  // Check resale fee payment
  if (transfer.resaleFee && parseFloat(transfer.resaleFee) > 0 && !transfer.resaleFeePaid) {
    throw new ValidationError('Resale fee must be paid before approval');
  }

  // Execute the transfer
  const ticket = await getTicket(orgId, transfer.ticketId);

  await db.update(airlineTickets).set({
    passengerWallet: transfer.toWallet,
    passengerId: transfer.toPassengerId,
    transferCount: (ticket.transferCount ?? 0) + 1,
    metadataVersion: (ticket.metadataVersion ?? 1) + 1,
    updatedAt: new Date(),
  }).where(eq(airlineTickets.id, transfer.ticketId));

  const [updated] = await db.update(ticketTransfers).set({
    status: 'COMPLETED',
    approvedBy,
    approvedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(ticketTransfers.id, transferId)).returning();

  // Collect resale fee
  if (transfer.resaleFee && parseFloat(transfer.resaleFee) > 0) {
    await db.update(resaleFeeLedger).set({
      status: 'COLLECTED',
      collectedAt: new Date(),
    }).where(eq(resaleFeeLedger.transferId, transferId));
  }

  await recordTicketEvent(orgId, transfer.ticketId, 'TICKET_TRANSFERRED', approvedBy, 'AIRLINE_ADMIN', null, null, {
    transferId, from: transfer.fromWallet, to: transfer.toWallet,
  });

  logger.info('Transfer approved and completed', { transferId, ticketId: transfer.ticketId });
  return updated;
}

export async function rejectTransfer(orgId: string, transferId: string, reason: string, rejectedBy: string) {
  const [updated] = await db.update(ticketTransfers).set({
    status: 'REJECTED',
    rejectionReason: reason,
    updatedAt: new Date(),
  }).where(and(eq(ticketTransfers.id, transferId), eq(ticketTransfers.orgId, orgId))).returning();

  if (!updated) throw new NotFoundError('Transfer request not found');

  await recordTicketEvent(orgId, updated.ticketId, 'TRANSFER_REJECTED', rejectedBy, 'AIRLINE_ADMIN', null, null, {
    transferId, reason,
  });

  return updated;
}

export async function completeTransferKyc(orgId: string, transferId: string) {
  const [updated] = await db.update(ticketTransfers).set({
    kycCompleted: toDbBool(true),
    kycCompletedAt: new Date(),
    status: 'PENDING', // Move from KYC_REQUIRED to PENDING for approval
    updatedAt: new Date(),
  }).where(and(eq(ticketTransfers.id, transferId), eq(ticketTransfers.orgId, orgId))).returning();

  if (!updated) throw new NotFoundError('Transfer request not found');
  return updated;
}

export async function payResaleFee(orgId: string, transferId: string, txHash?: string) {
  const transfer = await db.query.ticketTransfers.findFirst({
    where: and(eq(ticketTransfers.id, transferId), eq(ticketTransfers.orgId, orgId)),
  });
  if (!transfer) throw new NotFoundError('Transfer request not found');

  await db.update(ticketTransfers).set({
    resaleFeePaid: toDbBool(true),
    updatedAt: new Date(),
  }).where(eq(ticketTransfers.id, transferId));

  await db.update(resaleFeeLedger).set({
    status: 'COLLECTED',
    collectedAt: new Date(),
    txHash: txHash ?? null,
  }).where(eq(resaleFeeLedger.transferId, transferId));

  return { success: true };
}

// ============================================================================
// Metadata Updates (Gate, Seat, Delay)
// ============================================================================

export async function updateMetadata(input: UpdateMetadataInput) {
  const { orgId, ticketId, field, newValue, changeReason, changedBy } = input;
  const ticket = await getTicket(orgId, ticketId);

  const allowedFields = ['gate', 'seat', 'ticketClass', 'departureTime', 'arrivalTime', 'metadataUri'];
  if (!allowedFields.includes(field)) throw new ValidationError(`Cannot update field: ${field}`);

  const oldValue = String((ticket as Record<string, unknown>)[field] ?? '');
  const newVersion = (ticket.metadataVersion ?? 1) + 1;

  // Update the ticket field
  const updateData: Record<string, unknown> = {
    [field]: field.includes('Time') ? new Date(newValue) : newValue,
    metadataVersion: newVersion,
    updatedAt: new Date(),
  };

  await db.update(airlineTickets).set(updateData).where(eq(airlineTickets.id, ticketId));

  // Record version
  await db.insert(ticketMetadataVersions).values({
    orgId,
    ticketId,
    version: newVersion,
    field,
    oldValue,
    newValue,
    changedBy: changedBy ?? 'SYSTEM',
    changeReason,
    createdAt: new Date(),
  });

  // Map field to event type
  const eventTypes: Record<string, string> = {
    gate: 'GATE_CHANGED',
    seat: 'SEAT_CHANGED',
    ticketClass: 'CLASS_CHANGED',
    departureTime: 'FLIGHT_DELAYED',
    arrivalTime: 'FLIGHT_DELAYED',
  };

  await recordTicketEvent(orgId, ticketId, eventTypes[field] ?? 'METADATA_UPDATED', changedBy ?? 'SYSTEM', 'AIRLINE_ADMIN', null, null, {
    field, oldValue, newValue, version: newVersion,
  });

  logger.info('Ticket metadata updated', { ticketId, field, newVersion });
  return getTicket(orgId, ticketId);
}

// ============================================================================
// Bulk Operations
// ============================================================================

export async function bulkUpdateStatus(input: BulkUpdateInput) {
  const { orgId, ticketIds, newStatus, reason, actor } = input;
  const results: Array<{ ticketId: string; success: boolean; error?: string }> = [];

  for (const ticketId of ticketIds) {
    try {
      await transitionTicket(orgId, ticketId, newStatus, actor ?? 'SYSTEM', 'AIRLINE_ADMIN', { reason, bulk: true });
      results.push({ ticketId, success: true });
    } catch (error: any) {
      results.push({ ticketId, success: false, error: error.message });
    }
  }

  logger.info('Bulk status update completed', { total: ticketIds.length, succeeded: results.filter(r => r.success).length });
  return results;
}

export async function bulkCancelFlight(orgId: string, flightNumber: string, departureDate: string, reason: string, actor: string) {
  const startOfDay = new Date(departureDate);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(departureDate);
  endOfDay.setHours(23, 59, 59, 999);

  const tickets = await db.select().from(airlineTickets).where(
    and(
      eq(airlineTickets.orgId, orgId),
      eq(airlineTickets.flightNumber, flightNumber),
      gt(airlineTickets.departureTime, startOfDay),
      lt(airlineTickets.departureTime, endOfDay),
    )
  );

  const cancelableStatuses = ['ISSUED', 'CONFIRMED', 'CHECKED_IN'];
  const ticketIds = tickets
    .filter(t => cancelableStatuses.includes(t.status))
    .map(t => t.id);

  if (ticketIds.length === 0) return { cancelled: 0, results: [] };

  const results = await bulkUpdateStatus({
    orgId,
    ticketIds,
    newStatus: 'CANCELLED',
    reason: `Flight ${flightNumber} cancelled: ${reason}`,
    actor,
  });

  return { cancelled: results.filter(r => r.success).length, results };
}

// ============================================================================
// Reconciliation Report
// ============================================================================

export async function getReconciliationReport(input: ReconciliationReportInput) {
  const { orgId, flightNumber, departureDate } = input;

  const startOfDay = new Date(departureDate);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(departureDate);
  endOfDay.setHours(23, 59, 59, 999);

  const tickets = await db.select().from(airlineTickets).where(
    and(
      eq(airlineTickets.orgId, orgId),
      eq(airlineTickets.flightNumber, flightNumber),
      gt(airlineTickets.departureTime, startOfDay),
      lt(airlineTickets.departureTime, endOfDay),
    )
  );

  const statusCounts: Record<string, number> = {};
  let totalRevenue = 0;
  let totalTransfers = 0;

  for (const ticket of tickets) {
    statusCounts[ticket.status] = (statusCounts[ticket.status] || 0) + 1;
    if (!['CANCELLED', 'REFUNDED', 'VOID'].includes(ticket.status)) {
      totalRevenue += parseFloat(ticket.pricePaid ?? '0');
    }
    totalTransfers += ticket.transferCount ?? 0;
  }

  return {
    flightNumber,
    departureDate,
    totalTickets: tickets.length,
    statusBreakdown: statusCounts,
    totalRevenue,
    currency: tickets[0]?.currency ?? 'ETH',
    totalTransfers,
    boarded: statusCounts['BOARDED'] ?? 0,
    completed: statusCounts['COMPLETED'] ?? 0,
    noShow: tickets.filter(t => t.status === 'EXPIRED').length,
    cancelled: statusCounts['CANCELLED'] ?? 0,
    refunded: statusCounts['REFUNDED'] ?? 0,
  };
}

// ============================================================================
// Event History
// ============================================================================

export async function getTicketEvents(orgId: string, ticketId: string, limit = 50) {
  return db.select().from(ticketEvents)
    .where(and(eq(ticketEvents.orgId, orgId), eq(ticketEvents.ticketId, ticketId)))
    .orderBy(desc(ticketEvents.createdAt))
    .limit(limit);
}

export async function getMetadataHistory(orgId: string, ticketId: string) {
  return db.select().from(ticketMetadataVersions)
    .where(and(eq(ticketMetadataVersions.orgId, orgId), eq(ticketMetadataVersions.ticketId, ticketId)))
    .orderBy(desc(ticketMetadataVersions.version));
}

export async function getTransferHistory(orgId: string, ticketId: string) {
  return db.select().from(ticketTransfers)
    .where(and(eq(ticketTransfers.orgId, orgId), eq(ticketTransfers.ticketId, ticketId)))
    .orderBy(desc(ticketTransfers.createdAt));
}

// ============================================================================
// Auto-Expiry (called by background worker or Chainlink Automation callback)
// ============================================================================

export async function expireStaleTickets(orgId: string) {
  const now = new Date();
  const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);

  const staleTickets = await db.select().from(airlineTickets).where(
    and(
      eq(airlineTickets.orgId, orgId),
      lt(airlineTickets.departureTime, sixHoursAgo),
      or(
        eq(airlineTickets.status, 'ISSUED'),
        eq(airlineTickets.status, 'CONFIRMED'),
        eq(airlineTickets.status, 'CHECKED_IN'),
      ),
    )
  );

  const results = [];
  for (const ticket of staleTickets) {
    try {
      await transitionTicket(orgId, ticket.id, 'EXPIRED', 'AUTOMATION', 'SYSTEM', {
        reason: 'Auto-expired: departure time passed',
        departureTime: ticket.departureTime,
      });
      results.push({ ticketId: ticket.id, success: true });
    } catch (error: any) {
      results.push({ ticketId: ticket.id, success: false, error: error.message });
    }
  }

  logger.info('Auto-expiry completed', { orgId, expired: results.filter(r => r.success).length });
  return results;
}

// ============================================================================
// Freeze / Unfreeze (Fraud Investigation)
// ============================================================================

export async function freezeTicket(orgId: string, ticketId: string, reason: string, actor: string) {
  const ticket = await getTicket(orgId, ticketId);

  await db.update(airlineTickets).set({
    status: 'FROZEN' as any,
    metadata: toDbJson({
      ...(typeof ticket.metadata === 'string' ? JSON.parse(ticket.metadata as string) : (ticket.metadata as Record<string, unknown> ?? {})),
      frozen: true,
      freezeReason: reason,
      frozenAt: new Date().toISOString(),
      frozenBy: actor,
      previousStatus: ticket.status,
    }),
    transferable: toDbBool(false),
    updatedAt: new Date(),
  }).where(eq(airlineTickets.id, ticketId));

  await recordTicketEvent(orgId, ticketId, 'TICKET_FROZEN', actor, 'AIRLINE_ADMIN', null, null, { reason });
  return getTicket(orgId, ticketId);
}

export async function unfreezeTicket(orgId: string, ticketId: string, actor: string) {
  const ticket = await getTicket(orgId, ticketId);
  const rawMeta = typeof ticket.metadata === 'string' ? JSON.parse(ticket.metadata as string) : (ticket.metadata as Record<string, unknown> ?? {});
  const previousStatus = rawMeta.previousStatus || 'ISSUED';
  delete rawMeta.frozen;
  delete rawMeta.freezeReason;
  delete rawMeta.frozenAt;
  delete rawMeta.frozenBy;
  delete rawMeta.previousStatus;

  await db.update(airlineTickets).set({
    status: previousStatus,
    metadata: toDbJson(rawMeta),
    transferable: toDbBool(true),
    updatedAt: new Date(),
  }).where(eq(airlineTickets.id, ticketId));

  await recordTicketEvent(orgId, ticketId, 'TICKET_UNFROZEN', actor, 'AIRLINE_ADMIN', null, null, {});
  return getTicket(orgId, ticketId);
}

// ============================================================================
// Passenger Name Verification
// ============================================================================

/**
 * Normalize a name string for comparison:
 * lowercase, trim, remove diacritics, collapse whitespace,
 * strip common prefixes (Mr, Mrs, Ms, Dr, Prof), remove punctuation.
 */
export function normalizeNameForComparison(name: string): string {
  let normalized = name
    .trim()
    .toLowerCase()
    // Remove diacritics (e.g. é → e, ü → u)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    // Remove punctuation (keep letters, digits, spaces)
    .replace(/[^a-z0-9\s]/g, '')
    // Collapse multiple spaces
    .replace(/\s+/g, ' ')
    .trim();

  // Strip common title prefixes
  const prefixes = ['mr', 'mrs', 'ms', 'dr', 'prof', 'miss', 'mx', 'sir', 'dame', 'lady', 'lord'];
  for (const prefix of prefixes) {
    const pattern = new RegExp(`^${prefix}\\s+`, 'i');
    normalized = normalized.replace(pattern, '');
  }

  return normalized.trim();
}

/**
 * Calculate the similarity between two names on a 0–1 scale.
 * Uses normalized Levenshtein distance combined with token matching.
 */
export function calculateNameSimilarity(name1: string, name2: string): number {
  const a = normalizeNameForComparison(name1);
  const b = normalizeNameForComparison(name2);

  if (a === b) return 1.0;
  if (a.length === 0 || b.length === 0) return 0.0;

  // --- Levenshtein distance (Wagner–Fischer) ---
  const lenA = a.length;
  const lenB = b.length;
  const matrix: number[][] = [];

  for (let i = 0; i <= lenA; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= lenB; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= lenA; i++) {
    for (let j = 1; j <= lenB; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,       // deletion
        matrix[i][j - 1] + 1,       // insertion
        matrix[i - 1][j - 1] + cost, // substitution
      );
    }
  }
  const maxLen = Math.max(lenA, lenB);
  const levenshteinScore = 1 - matrix[lenA][lenB] / maxLen;

  // --- Token matching ---
  const tokensA = a.split(' ').filter(Boolean);
  const tokensB = b.split(' ').filter(Boolean);

  // Check if all tokens from the shorter set appear in the longer set
  const [shorter, longer] = tokensA.length <= tokensB.length
    ? [tokensA, tokensB]
    : [tokensB, tokensA];

  let matchedTokens = 0;
  for (const token of shorter) {
    if (longer.includes(token)) {
      matchedTokens++;
    }
  }

  const tokenScore = shorter.length > 0 ? matchedTokens / shorter.length : 0;

  // Return the higher of the two scores
  return Math.max(levenshteinScore, tokenScore);
}

/**
 * Verify a ticket's passengerName against KYC-provided name fields.
 * Returns a verification result with confidence score and match details.
 */
export async function verifyPassengerIdentity(
  orgId: string,
  ticketId: string,
  kycData: {
    firstName: string;
    lastName: string;
    fullName?: string;
    documentName?: string;
  },
): Promise<{
  verified: boolean;
  confidence: number;
  matchDetails: { method: string; score: number }[];
  warnings: string[];
}> {
  const ticket = await getTicket(orgId, ticketId);
  const passengerName = ticket.passengerName;

  if (!passengerName) {
    return {
      verified: false,
      confidence: 0,
      matchDetails: [],
      warnings: ['Ticket has no passenger name on record'],
    };
  }

  const normalizedPassenger = normalizeNameForComparison(passengerName);
  const matchDetails: { method: string; score: number }[] = [];
  const warnings: string[] = [];

  // Build candidate name variants from the KYC data
  const candidates: { label: string; value: string }[] = [];

  if (kycData.fullName) {
    candidates.push({ label: 'fullName', value: kycData.fullName });
  }

  // firstName + lastName combined
  const combinedName = `${kycData.firstName} ${kycData.lastName}`.trim();
  if (combinedName.length > 0) {
    candidates.push({ label: 'firstName+lastName', value: combinedName });
  }

  if (kycData.documentName) {
    candidates.push({ label: 'documentName', value: kycData.documentName });
  }

  let bestScore = 0;

  for (const candidate of candidates) {
    const normalizedCandidate = normalizeNameForComparison(candidate.value);

    // Exact normalized match
    if (normalizedPassenger === normalizedCandidate) {
      matchDetails.push({ method: `exact:${candidate.label}`, score: 1.0 });
      bestScore = 1.0;
      continue;
    }

    // Fuzzy match
    const fuzzyScore = calculateNameSimilarity(passengerName, candidate.value);
    matchDetails.push({ method: `fuzzy:${candidate.label}`, score: fuzzyScore });

    if (fuzzyScore > bestScore) {
      bestScore = fuzzyScore;
    }

    // Warn on partial matches
    if (fuzzyScore >= 0.6 && fuzzyScore < 0.85) {
      warnings.push(
        `Partial match (${(fuzzyScore * 100).toFixed(1)}%) against ${candidate.label}: "${candidate.value}"`,
      );
    }
  }

  const verified = bestScore >= 0.85;

  if (!verified && bestScore < 0.6) {
    warnings.push('No KYC name variant matched the passenger name on the ticket');
  }

  logger.info('Passenger identity verification completed', {
    ticketId,
    orgId,
    verified,
    confidence: bestScore,
    matchCount: matchDetails.length,
  });

  return {
    verified,
    confidence: bestScore,
    matchDetails,
    warnings,
  };
}

/**
 * End-to-end passenger verification: look up investor KYC data and verify
 * that the investor's name matches the ticket's passengerName.
 */
export async function enforcePassengerVerification(
  orgId: string,
  ticketId: string,
  investorId: string,
): Promise<{ allowed: boolean; reason?: string }> {
  // Look up the investor record
  const investor = await db.query.investors.findFirst({
    where: and(
      eq(schema.investors.id, investorId),
      eq(schema.investors.orgId, orgId),
    ),
  });

  if (!investor) {
    logger.warn('Investor not found for passenger verification', { orgId, investorId, ticketId });
    return { allowed: false, reason: 'Investor record not found' };
  }

  // KYC must be in a passed state
  if (investor.kycStatus !== 'passed') {
    return { allowed: false, reason: `Investor KYC status is "${investor.kycStatus}", must be "passed"` };
  }

  // Extract name fields from investor metadata
  const meta = (typeof investor.metadata === 'string'
    ? JSON.parse(investor.metadata as string)
    : (investor.metadata as Record<string, unknown> ?? {})) as Record<string, unknown>;

  const firstName = (meta.firstName as string) ?? (meta.first_name as string) ?? '';
  const lastName = (meta.lastName as string) ?? (meta.last_name as string) ?? '';
  const fullName = (meta.fullName as string) ?? (meta.full_name as string) ?? undefined;
  const documentName = (meta.documentName as string) ?? (meta.document_name as string) ?? undefined;

  if (!firstName && !lastName && !fullName && !documentName) {
    logger.warn('No name data in investor metadata for verification', { orgId, investorId });
    return { allowed: false, reason: 'Investor record has no name data for verification' };
  }

  const result = await verifyPassengerIdentity(orgId, ticketId, {
    firstName,
    lastName,
    fullName,
    documentName,
  });

  if (!result.verified) {
    const reason = result.warnings.length > 0
      ? `Name verification failed: ${result.warnings.join('; ')}`
      : `Name verification failed (best confidence: ${(result.confidence * 100).toFixed(1)}%)`;

    logger.warn('Passenger verification denied', { orgId, ticketId, investorId, confidence: result.confidence });
    return { allowed: false, reason };
  }

  logger.info('Passenger verification approved', { orgId, ticketId, investorId, confidence: result.confidence });
  return { allowed: true };
}

// ============================================================================
// Internal Helpers
// ============================================================================

async function recordTicketEvent(
  orgId: string,
  ticketId: string,
  eventType: string,
  actor: string,
  actorRole: string,
  previousState: string | null,
  newState: string | null,
  details?: Record<string, unknown>,
) {
  await db.insert(ticketEvents).values({
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
