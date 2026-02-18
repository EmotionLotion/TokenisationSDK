/**
 * Hotel Reservation Routes
 *
 * REST API for hotel reservation NFT lifecycle management.
 */

import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as hotelService from '../services/hotel.service.js';
import { ValidationError } from '../middleware/errorHandler.js';
import type { ApiKeyRequest } from '../middleware/auth.js';

export const hotelRouter = Router();

// ============================================================================
// Validation Schemas
// ============================================================================

const CreateReservationSchema = z.object({
  hotelCode: z.string().min(2).max(16),
  hotelName: z.string().min(1).max(256),
  guestName: z.string().min(1).max(256),
  roomType: z.enum(['STANDARD', 'DELUXE', 'SUITE', 'PENTHOUSE']).optional(),
  checkInDate: z.string().datetime(),
  checkOutDate: z.string().datetime(),
  rate: z.string().optional(),
  currency: z.string().max(8).optional(),
  guestId: z.string().uuid().optional(),
  guestWallet: z.string().max(42).optional(),
  confirmationCode: z.string().max(32).optional(),
  bookingReference: z.string().max(16).optional(),
  transferable: z.boolean().optional(),
  maxTransfers: z.number().int().min(0).max(255).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const TransferSchema = z.object({
  toWallet: z.string().min(1).max(42),
  toGuestId: z.string().uuid().optional(),
  idempotencyKey: z.string().min(1).max(128),
  metadata: z.record(z.unknown()).optional(),
});

const ExtendStaySchema = z.object({
  newCheckOutDate: z.string().datetime(),
});

const ListSchema = z.object({
  hotelCode: z.string().optional(),
  status: z.string().optional(),
  guestId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

// ============================================================================
// Routes
// ============================================================================

// POST /api/v1/hotels - Create a reservation
hotelRouter.post('/', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const body = CreateReservationSchema.parse(req.body);
    const reservation = await hotelService.createReservation({
      orgId: req.apiKey!.orgId,
      ...body,
    });
    res.status(201).json({ data: reservation });
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/hotels - List reservations
hotelRouter.get('/', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const params = ListSchema.parse(req.query);
    const result = await hotelService.listReservations(req.apiKey!.orgId, params);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/hotels/:id - Get reservation details
hotelRouter.get('/:id', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const reservation = await hotelService.getReservation(req.apiKey!.orgId, req.params.id);
    res.json({ data: reservation });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/hotels/:id/confirm
hotelRouter.post('/:id/confirm', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const reservation = await hotelService.confirmReservation(req.apiKey!.orgId, req.params.id, req.body.actor ?? 'api');
    res.json({ data: reservation });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/hotels/:id/check-in
hotelRouter.post('/:id/check-in', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const roomNumber = req.body.roomNumber;
    const reservation = await hotelService.checkIn(req.apiKey!.orgId, req.params.id, roomNumber, req.body.actor ?? 'api');
    res.json({ data: reservation });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/hotels/:id/check-out
hotelRouter.post('/:id/check-out', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const reservation = await hotelService.checkOut(req.apiKey!.orgId, req.params.id, req.body.actor ?? 'api');
    res.json({ data: reservation });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/hotels/:id/close
hotelRouter.post('/:id/close', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const reservation = await hotelService.closeReservation(req.apiKey!.orgId, req.params.id, req.body.actor ?? 'api');
    res.json({ data: reservation });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/hotels/:id/extend
hotelRouter.post('/:id/extend', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const body = ExtendStaySchema.parse(req.body);
    const reservation = await hotelService.extendStay(req.apiKey!.orgId, req.params.id, body.newCheckOutDate, req.body.actor ?? 'api');
    res.json({ data: reservation });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/hotels/:id/cancel
hotelRouter.post('/:id/cancel', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const reason = req.body.reason ?? 'Cancelled by operator';
    const reservation = await hotelService.cancelReservation(req.apiKey!.orgId, req.params.id, reason, req.body.actor ?? 'api');
    res.json({ data: reservation });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/hotels/:id/transfer
hotelRouter.post('/:id/transfer', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const body = TransferSchema.parse(req.body);
    const transfer = await hotelService.requestTransfer({
      orgId: req.apiKey!.orgId,
      reservationId: req.params.id,
      ...body,
    });
    res.status(201).json({ data: transfer });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/hotels/transfers/:id/approve
hotelRouter.post('/transfers/:id/approve', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const transfer = await hotelService.approveTransfer(req.apiKey!.orgId, req.params.id, req.body.approvedBy ?? 'api');
    res.json({ data: transfer });
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/hotels/:id/events
hotelRouter.get('/:id/events', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const events = await hotelService.getReservationEvents(req.apiKey!.orgId, req.params.id);
    res.json({ data: events });
  } catch (error) {
    next(error);
  }
});
