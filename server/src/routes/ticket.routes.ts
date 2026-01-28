/**
 * Ticket Routes
 *
 * REST API for airline ticket NFT lifecycle management.
 * Covers issuance, check-in, boarding, transfer, cancellation,
 * metadata updates, bulk operations, and reconciliation.
 */

import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as ticketService from '../services/ticket.service.js';
import * as eventbusService from '../services/eventbus.service.js';
import { ValidationError } from '../middleware/errorHandler.js';
import type { ApiKeyRequest } from '../middleware/auth.js';

export const ticketRouter = Router();

// ============================================================================
// Validation Schemas
// ============================================================================

const IssueTicketSchema = z.object({
  flightNumber: z.string().min(2).max(16),
  airline: z.string().min(2).max(8),
  departureTime: z.string().datetime(),
  arrivalTime: z.string().datetime(),
  departureAirport: z.string().length(3),
  arrivalAirport: z.string().length(3),
  gate: z.string().max(16).optional(),
  seat: z.string().max(8).optional(),
  ticketClass: z.enum(['ECONOMY', 'PREMIUM_ECONOMY', 'BUSINESS', 'FIRST']).optional(),
  passengerId: z.string().uuid().optional(),
  passengerWallet: z.string().max(42).optional(),
  passengerName: z.string().max(256).optional(),
  eTicketNumber: z.string().max(64).optional(),
  bookingReference: z.string().max(16).optional(),
  transferable: z.boolean().optional(),
  maxTransfers: z.number().int().min(0).max(255).optional(),
  pricePaid: z.string().optional(),
  currency: z.string().max(8).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const TransferTicketSchema = z.object({
  toWallet: z.string().min(1).max(42),
  toPassengerId: z.string().uuid().optional(),
  idempotencyKey: z.string().min(1).max(128),
  kycRequired: z.boolean().optional(),
  resaleFee: z.string().optional(),
  resaleFeeCurrency: z.string().max(8).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const UpdateMetadataSchema = z.object({
  field: z.enum(['gate', 'seat', 'ticketClass', 'departureTime', 'arrivalTime', 'metadataUri']),
  newValue: z.string().min(1),
  changeReason: z.string().max(256).optional(),
  changedBy: z.string().max(256).optional(),
});

const BulkUpdateSchema = z.object({
  ticketIds: z.array(z.string().uuid()).min(1).max(500),
  newStatus: z.enum(['CANCELLED', 'EXPIRED', 'VOID']),
  reason: z.string().optional(),
  actor: z.string().optional(),
});

const BulkCancelFlightSchema = z.object({
  reason: z.string().min(1),
  actor: z.string().optional(),
});

const ListTicketsSchema = z.object({
  flightNumber: z.string().optional(),
  status: z.string().optional(),
  passengerId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

// ============================================================================
// Routes
// ============================================================================

// POST /api/v1/tickets - Issue a new ticket
ticketRouter.post('/', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const body = IssueTicketSchema.parse(req.body);
    const ticket = await ticketService.issueTicket({
      orgId: req.apiKey!.orgId,
      ...body,
    });
    res.status(201).json({ data: ticket });
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/tickets - List tickets
ticketRouter.get('/', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const params = ListTicketsSchema.parse(req.query);
    const result = await ticketService.listTickets(req.apiKey!.orgId, params);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/tickets/:id - Get ticket details
ticketRouter.get('/:id', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const ticket = await ticketService.getTicket(req.apiKey!.orgId, req.params.id);
    res.json({ data: ticket });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/tickets/:id/check-in
ticketRouter.post('/:id/check-in', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const ticket = await ticketService.checkIn(req.apiKey!.orgId, req.params.id, req.body.actor ?? 'api');
    res.json({ data: ticket });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/tickets/:id/board
ticketRouter.post('/:id/board', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const ticket = await ticketService.board(req.apiKey!.orgId, req.params.id, req.body.actor ?? 'api');
    res.json({ data: ticket });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/tickets/:id/complete - Complete and optionally burn
ticketRouter.post('/:id/complete', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const burn = req.body.burn !== false; // Default to burn after completion
    let ticket;
    if (burn) {
      ticket = await ticketService.completeAndBurn(req.apiKey!.orgId, req.params.id, req.body.actor ?? 'api');
    } else {
      ticket = await ticketService.completeTicket(req.apiKey!.orgId, req.params.id, req.body.actor ?? 'api');
    }
    res.json({ data: ticket });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/tickets/:id/cancel
ticketRouter.post('/:id/cancel', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const reason = req.body.reason ?? 'Cancelled by operator';
    const ticket = await ticketService.cancelTicket(req.apiKey!.orgId, req.params.id, reason, req.body.actor ?? 'api');
    res.json({ data: ticket });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/tickets/:id/refund
ticketRouter.post('/:id/refund', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const ticket = await ticketService.refundTicket(req.apiKey!.orgId, req.params.id, req.body.actor ?? 'api');
    res.json({ data: ticket });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/tickets/:id/freeze
ticketRouter.post('/:id/freeze', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const reason = req.body.reason ?? 'Frozen for investigation';
    const ticket = await ticketService.freezeTicket(req.apiKey!.orgId, req.params.id, reason, req.body.actor ?? 'api');
    res.json({ data: ticket });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/tickets/:id/unfreeze
ticketRouter.post('/:id/unfreeze', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const ticket = await ticketService.unfreezeTicket(req.apiKey!.orgId, req.params.id, req.body.actor ?? 'api');
    res.json({ data: ticket });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// SSE Stream — Real-time ticket status updates
// ============================================================================

// GET /api/v1/tickets/:id/stream
ticketRouter.get('/:id/stream', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const orgId = req.apiKey!.orgId;
    const ticketId = req.params.id;

    // Verify ticket exists
    const ticket = await ticketService.getTicket(orgId, ticketId);

    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    });

    // Send initial state
    res.write(`event: status\ndata: ${JSON.stringify({ ticketId: ticket.id, status: ticket.status, updatedAt: ticket.updatedAt })}\n\n`);

    // Register EventBus handler for ticket events matching this ticket ID
    const handlerName = `sse-ticket-${ticketId}-${Date.now()}`;

    eventbusService.registerHandler({
      name: handlerName,
      topic: /^ticket\./,
      handler: async (event) => {
        const payload = event.payload as Record<string, unknown>;
        if (payload.ticketId === ticketId) {
          try {
            res.write(`event: ${event.topic}\ndata: ${JSON.stringify(payload)}\n\n`);
          } catch {
            // Connection may have closed
          }
        }
      },
    });

    // Heartbeat every 30 seconds
    const heartbeat = setInterval(() => {
      try {
        res.write(`:heartbeat\n\n`);
      } catch {
        clearInterval(heartbeat);
      }
    }, 30_000);

    // Cleanup on client disconnect
    req.on('close', () => {
      clearInterval(heartbeat);
      eventbusService.unregisterHandler(handlerName);
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Transfer Routes
// ============================================================================

// POST /api/v1/tickets/:id/transfer - Request a transfer
ticketRouter.post('/:id/transfer', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const body = TransferTicketSchema.parse(req.body);
    const transfer = await ticketService.requestTransfer({
      orgId: req.apiKey!.orgId,
      ticketId: req.params.id,
      ...body,
    });
    res.status(201).json({ data: transfer });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/tickets/transfers/:transferId/approve
ticketRouter.post('/transfers/:transferId/approve', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const transfer = await ticketService.approveTransfer(req.apiKey!.orgId, req.params.transferId, req.body.approvedBy ?? 'api');
    res.json({ data: transfer });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/tickets/transfers/:transferId/reject
ticketRouter.post('/transfers/:transferId/reject', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const transfer = await ticketService.rejectTransfer(req.apiKey!.orgId, req.params.transferId, req.body.reason ?? 'Rejected', req.body.rejectedBy ?? 'api');
    res.json({ data: transfer });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/tickets/transfers/:transferId/complete-kyc
ticketRouter.post('/transfers/:transferId/complete-kyc', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const transfer = await ticketService.completeTransferKyc(req.apiKey!.orgId, req.params.transferId);
    res.json({ data: transfer });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/tickets/transfers/:transferId/pay-fee
ticketRouter.post('/transfers/:transferId/pay-fee', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const result = await ticketService.payResaleFee(req.apiKey!.orgId, req.params.transferId, req.body.txHash);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Resale Routes
// ============================================================================

const ResalePurchaseSchema = z.object({
  buyerWallet: z.string().min(1).max(42),
  buyerPassengerId: z.string().uuid().optional(),
  kycData: z.record(z.unknown()).optional(),
  paymentDetails: z.object({
    txHash: z.string().optional(),
    method: z.string().optional(),
  }).optional(),
  idempotencyKey: z.string().max(128).optional(),
});

// POST /api/v1/tickets/:id/resale/purchase — Single-call resale orchestration
ticketRouter.post('/:id/resale/purchase', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const orgId = req.apiKey!.orgId;
    const ticketId = req.params.id;
    const body = ResalePurchaseSchema.parse(req.body);

    // Step 1: Request transfer
    const transfer = await ticketService.requestTransfer({
      orgId,
      ticketId,
      toWallet: body.buyerWallet,
      toPassengerId: body.buyerPassengerId,
      idempotencyKey: body.idempotencyKey ?? `resale-${ticketId}-${Date.now()}`,
      kycRequired: !!body.kycData,
    });

    try {
      // Step 2: Complete KYC if data provided
      if (body.kycData) {
        await ticketService.completeTransferKyc(orgId, transfer.id);
      }

      // Step 3: Pay resale fee if applicable
      if (transfer.resaleFee && parseFloat(transfer.resaleFee) > 0) {
        await ticketService.payResaleFee(orgId, transfer.id, body.paymentDetails?.txHash);
      }

      // Step 4: Approve transfer
      const completed = await ticketService.approveTransfer(orgId, transfer.id, 'resale-orchestrator');

      res.status(200).json({
        data: {
          transferId: completed.id,
          ticketId,
          status: completed.status,
          fromWallet: completed.fromWallet,
          toWallet: completed.toWallet,
          price: completed.resaleFee ?? '0',
          currency: completed.resaleFeeCurrency ?? 'ETH',
        },
      });
    } catch (stepError) {
      // Rollback: reject the transfer if any step after creation fails
      try {
        await ticketService.rejectTransfer(
          orgId,
          transfer.id,
          `Resale orchestration failed: ${stepError instanceof Error ? stepError.message : 'Unknown error'}`,
          'resale-orchestrator',
        );
      } catch {
        // Best-effort rollback
      }
      throw stepError;
    }
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Metadata Update Routes
// ============================================================================

// PATCH /api/v1/tickets/:id/metadata - Update ticket metadata (gate, seat, delay)
ticketRouter.patch('/:id/metadata', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const body = UpdateMetadataSchema.parse(req.body);
    const ticket = await ticketService.updateMetadata({
      orgId: req.apiKey!.orgId,
      ticketId: req.params.id,
      ...body,
    });
    res.json({ data: ticket });
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/tickets/:id/metadata-history
ticketRouter.get('/:id/metadata-history', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const history = await ticketService.getMetadataHistory(req.apiKey!.orgId, req.params.id);
    res.json({ data: history });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// History & Audit Routes
// ============================================================================

// GET /api/v1/tickets/:id/events
ticketRouter.get('/:id/events', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const events = await ticketService.getTicketEvents(req.apiKey!.orgId, req.params.id);
    res.json({ data: events });
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/tickets/:id/transfers
ticketRouter.get('/:id/transfers', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const transfers = await ticketService.getTransferHistory(req.apiKey!.orgId, req.params.id);
    res.json({ data: transfers });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Bulk Operations
// ============================================================================

// POST /api/v1/tickets/bulk/update-status
ticketRouter.post('/bulk/update-status', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const body = BulkUpdateSchema.parse(req.body);
    const results = await ticketService.bulkUpdateStatus({
      orgId: req.apiKey!.orgId,
      ...body,
    });
    res.json({ data: results });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/tickets/flights/:flightNumber/cancel
ticketRouter.post('/flights/:flightNumber/cancel', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const body = BulkCancelFlightSchema.parse(req.body);
    const departureDate = req.body.departureDate ?? new Date().toISOString().split('T')[0];
    const result = await ticketService.bulkCancelFlight(
      req.apiKey!.orgId, req.params.flightNumber, departureDate, body.reason, body.actor ?? 'api'
    );
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Reconciliation
// ============================================================================

// GET /api/v1/tickets/flights/:flightNumber/reconciliation
ticketRouter.get('/flights/:flightNumber/reconciliation', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const departureDate = (req.query.departureDate as string) ?? new Date().toISOString().split('T')[0];
    const report = await ticketService.getReconciliationReport({
      orgId: req.apiKey!.orgId,
      flightNumber: req.params.flightNumber,
      departureDate,
    });
    res.json({ data: report });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Auto-Expiry (webhook from Chainlink Automation or cron)
// ============================================================================

// POST /api/v1/tickets/automation/expire-stale
ticketRouter.post('/automation/expire-stale', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const results = await ticketService.expireStaleTickets(req.apiKey!.orgId);
    res.json({ data: results });
  } catch (error) {
    next(error);
  }
});
