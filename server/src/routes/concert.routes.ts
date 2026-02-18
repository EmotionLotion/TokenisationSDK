/**
 * Concert Ticket Routes
 *
 * REST API for concert ticket NFT lifecycle management.
 * Includes anti-scalping transfer enforcement.
 */

import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as concertService from '../services/concert.service.js';
import { ValidationError } from '../middleware/errorHandler.js';
import type { ApiKeyRequest } from '../middleware/auth.js';

export const concertRouter = Router();

// ============================================================================
// Validation Schemas
// ============================================================================

const CreateTicketSchema = z.object({
  venueCode: z.string().min(2).max(16),
  venueName: z.string().min(1).max(256),
  eventName: z.string().min(1).max(256),
  artist: z.string().min(1).max(256),
  eventDate: z.string().datetime(),
  doorsOpen: z.string().datetime().optional(),
  section: z.string().max(32).optional(),
  row: z.string().max(16).optional(),
  seatNumber: z.string().max(16).optional(),
  seatingTier: z.enum(['GA', 'FLOOR', 'LOWER', 'UPPER', 'VIP', 'BACKSTAGE']).optional(),
  faceValue: z.string().optional(),
  resalePriceCap: z.string().optional(),
  currency: z.string().max(8).optional(),
  fanName: z.string().max(256).optional(),
  fanId: z.string().uuid().optional(),
  fanWallet: z.string().max(42).optional(),
  ageVerified: z.boolean().optional(),
  confirmationCode: z.string().max(32).optional(),
  bookingReference: z.string().max(16).optional(),
  transferable: z.boolean().optional(),
  maxTransfers: z.number().int().min(0).max(255).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const TransferSchema = z.object({
  toWallet: z.string().min(1).max(42),
  toFanId: z.string().uuid().optional(),
  resalePrice: z.string().optional(),
  idempotencyKey: z.string().min(1).max(128),
  metadata: z.record(z.unknown()).optional(),
});

const ListSchema = z.object({
  venueCode: z.string().optional(),
  eventName: z.string().optional(),
  status: z.string().optional(),
  fanId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

// ============================================================================
// Routes
// ============================================================================

// POST /api/v1/concerts - Create a ticket
concertRouter.post('/', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const body = CreateTicketSchema.parse(req.body);
    const ticket = await concertService.createTicket({
      orgId: req.apiKey!.orgId,
      ...body,
    });
    res.status(201).json({ data: ticket });
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/concerts - List tickets
concertRouter.get('/', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const params = ListSchema.parse(req.query);
    const result = await concertService.listTickets(req.apiKey!.orgId, params);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/concerts/:id - Get ticket details
concertRouter.get('/:id', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const ticket = await concertService.getTicket(req.apiKey!.orgId, req.params.id);
    res.json({ data: ticket });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/concerts/:id/issue
concertRouter.post('/:id/issue', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const ticket = await concertService.issueTicket(req.apiKey!.orgId, req.params.id, req.body.actor ?? 'api');
    res.json({ data: ticket });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/concerts/:id/admit
concertRouter.post('/:id/admit', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const ticket = await concertService.admitFan(req.apiKey!.orgId, req.params.id, req.body.actor ?? 'api');
    res.json({ data: ticket });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/concerts/:id/complete
concertRouter.post('/:id/complete', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const ticket = await concertService.markUsed(req.apiKey!.orgId, req.params.id, req.body.actor ?? 'api');
    res.json({ data: ticket });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/concerts/:id/close
concertRouter.post('/:id/close', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const ticket = await concertService.closeTicket(req.apiKey!.orgId, req.params.id, req.body.actor ?? 'api');
    res.json({ data: ticket });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/concerts/:id/cancel
concertRouter.post('/:id/cancel', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const reason = req.body.reason ?? 'Cancelled by operator';
    const ticket = await concertService.cancelTicket(req.apiKey!.orgId, req.params.id, reason, req.body.actor ?? 'api');
    res.json({ data: ticket });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/concerts/:id/refund
concertRouter.post('/:id/refund', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const ticket = await concertService.refundTicket(req.apiKey!.orgId, req.params.id, req.body.actor ?? 'api');
    res.json({ data: ticket });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/concerts/:id/transfer (with anti-scalping)
concertRouter.post('/:id/transfer', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const body = TransferSchema.parse(req.body);
    const transfer = await concertService.requestTransfer({
      orgId: req.apiKey!.orgId,
      concertTicketId: req.params.id,
      ...body,
    });
    res.status(201).json({ data: transfer });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/concerts/transfers/:id/approve
concertRouter.post('/transfers/:id/approve', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const transfer = await concertService.approveTransfer(req.apiKey!.orgId, req.params.id, req.body.approvedBy ?? 'api');
    res.json({ data: transfer });
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/concerts/:id/events
concertRouter.get('/:id/events', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const events = await concertService.getTicketEvents(req.apiKey!.orgId, req.params.id);
    res.json({ data: events });
  } catch (error) {
    next(error);
  }
});
