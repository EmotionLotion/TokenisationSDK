import { db, schema } from '../config/database.js';
import { eq, and, desc, lt, gt, or, sql } from 'drizzle-orm';
import { NotFoundError, ValidationError, AppError } from '../middleware/errorHandler.js';
import * as complianceService from './compliance.service.js';
import { randomUUID } from 'crypto';
import { logger } from '../middleware/logger.js';

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
    transferable: transferable ?? true,
    maxTransfers: maxTransfers ?? 3,
    transferCount: 0,
    pricePaid: pricePaid ?? '0',
    currency: currency ?? 'ETH',
    metadataVersion: 1,
    metadata: metadata ?? {},
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

  const updateData: Record<string, unknown> = {
    status: newStatus,
    updatedAt: new Date(),
  };

  if (newStatus === 'CHECKED_IN') updateData.checkedInAt = new Date();
  if (newStatus === 'BOARDED') updateData.boardedAt = new Date();
  if (newStatus === 'COMPLETED') updateData.completedAt = new Date();
  if (newStatus === 'CANCELLED') updateData.cancelledAt = new Date();
  if (newStatus === 'BURNED') updateData.burnedAt = new Date();

  const [updated] = await db.update(airlineTickets)
    .set(updateData)
    .where(and(eq(airlineTickets.id, ticketId), eq(airlineTickets.orgId, orgId)))
    .returning();

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
    kycRequired: kycRequired ?? false,
    kycCompleted: false,
    resaleFee: resaleFee ?? null,
    resaleFeeCurrency: resaleFeeCurrency ?? null,
    resaleFeePaid: false,
    idempotencyKey,
    metadata: metadata ?? {},
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
    kycCompleted: true,
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
    resaleFeePaid: true,
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
    metadata: {
      ...(ticket.metadata as Record<string, unknown> ?? {}),
      frozen: true,
      freezeReason: reason,
      frozenAt: new Date().toISOString(),
      frozenBy: actor,
    },
    transferable: false,
    updatedAt: new Date(),
  }).where(eq(airlineTickets.id, ticketId));

  await recordTicketEvent(orgId, ticketId, 'TICKET_FROZEN', actor, 'AIRLINE_ADMIN', null, null, { reason });
  return getTicket(orgId, ticketId);
}

export async function unfreezeTicket(orgId: string, ticketId: string, actor: string) {
  const ticket = await getTicket(orgId, ticketId);
  const meta = ticket.metadata as Record<string, unknown> ?? {};
  delete meta.frozen;
  delete meta.freezeReason;
  delete meta.frozenAt;
  delete meta.frozenBy;

  await db.update(airlineTickets).set({
    metadata: meta,
    transferable: true,
    updatedAt: new Date(),
  }).where(eq(airlineTickets.id, ticketId));

  await recordTicketEvent(orgId, ticketId, 'TICKET_UNFROZEN', actor, 'AIRLINE_ADMIN', null, null, {});
  return getTicket(orgId, ticketId);
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
    details: details ?? {},
    correlationId: randomUUID(),
  });
}
