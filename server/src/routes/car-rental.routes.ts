/**
 * Car Rental Routes
 *
 * REST API for car rental NFT lifecycle management.
 */

import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as carRentalService from '../services/car-rental.service.js';
import { ValidationError } from '../middleware/errorHandler.js';
import type { ApiKeyRequest } from '../middleware/auth.js';

export const carRentalRouter = Router();

// ============================================================================
// Validation Schemas
// ============================================================================

const CreateRentalSchema = z.object({
  rentalCompanyCode: z.string().min(2).max(16),
  rentalCompanyName: z.string().min(1).max(256),
  driverName: z.string().min(1).max(256),
  vehicleCategory: z.enum(['ECONOMY', 'COMPACT', 'MIDSIZE', 'FULLSIZE', 'LUXURY', 'SUV', 'VAN']).optional(),
  vehicleMake: z.string().max(64).optional(),
  vehicleModel: z.string().max(64).optional(),
  pickupDate: z.string().datetime(),
  returnDate: z.string().datetime(),
  pickupLocation: z.string().max(256).optional(),
  returnLocation: z.string().max(256).optional(),
  dailyRate: z.string().optional(),
  currency: z.string().max(8).optional(),
  depositAmount: z.string().optional(),
  insuranceType: z.string().max(32).optional(),
  insuranceProvider: z.string().max(128).optional(),
  driverId: z.string().uuid().optional(),
  driverWallet: z.string().max(42).optional(),
  confirmationCode: z.string().max(32).optional(),
  bookingReference: z.string().max(16).optional(),
  transferable: z.boolean().optional(),
  maxTransfers: z.number().int().min(0).max(255).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const PickupSchema = z.object({
  mileage: z.number().int().min(0),
  fuelLevel: z.string().max(16),
  actor: z.string().optional(),
});

const ReturnSchema = z.object({
  mileage: z.number().int().min(0),
  fuelLevel: z.string().max(16),
  damageReport: z.record(z.unknown()).optional(),
  actor: z.string().optional(),
});

const InspectSchema = z.object({
  depositResolution: z.enum(['RELEASED', 'PARTIALLY_CHARGED', 'FULLY_CHARGED']),
  chargeAmount: z.string().optional(),
  actor: z.string().optional(),
});

const TransferSchema = z.object({
  toWallet: z.string().min(1).max(42),
  toDriverId: z.string().uuid().optional(),
  idempotencyKey: z.string().min(1).max(128),
  metadata: z.record(z.unknown()).optional(),
});

const ListSchema = z.object({
  rentalCompanyCode: z.string().optional(),
  status: z.string().optional(),
  driverId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

// ============================================================================
// Routes
// ============================================================================

// POST /api/v1/car-rentals - Create a rental
carRentalRouter.post('/', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const body = CreateRentalSchema.parse(req.body);
    const rental = await carRentalService.createRental({
      orgId: req.apiKey!.orgId,
      ...body,
    });
    res.status(201).json({ data: rental });
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/car-rentals - List rentals
carRentalRouter.get('/', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const params = ListSchema.parse(req.query);
    const result = await carRentalService.listRentals(req.apiKey!.orgId, params);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/car-rentals/:id - Get rental details
carRentalRouter.get('/:id', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const rental = await carRentalService.getRental(req.apiKey!.orgId, req.params.id);
    res.json({ data: rental });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/car-rentals/:id/confirm
carRentalRouter.post('/:id/confirm', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const rental = await carRentalService.confirmRental(req.apiKey!.orgId, req.params.id, req.body.actor ?? 'api');
    res.json({ data: rental });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/car-rentals/:id/pickup
carRentalRouter.post('/:id/pickup', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const body = PickupSchema.parse(req.body);
    const rental = await carRentalService.confirmPickup(
      req.apiKey!.orgId, req.params.id, body.mileage, body.fuelLevel, body.actor ?? 'api',
    );
    res.json({ data: rental });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/car-rentals/:id/return
carRentalRouter.post('/:id/return', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const body = ReturnSchema.parse(req.body);
    const rental = await carRentalService.processReturn(
      req.apiKey!.orgId, req.params.id, body.mileage, body.fuelLevel, body.damageReport, body.actor ?? 'api',
    );
    res.json({ data: rental });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/car-rentals/:id/inspect
carRentalRouter.post('/:id/inspect', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const body = InspectSchema.parse(req.body);
    const rental = await carRentalService.inspectVehicle(
      req.apiKey!.orgId, req.params.id, body.depositResolution, body.chargeAmount, body.actor ?? 'api',
    );
    res.json({ data: rental });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/car-rentals/:id/close
carRentalRouter.post('/:id/close', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const rental = await carRentalService.closeRental(req.apiKey!.orgId, req.params.id, req.body.actor ?? 'api');
    res.json({ data: rental });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/car-rentals/:id/cancel
carRentalRouter.post('/:id/cancel', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const reason = req.body.reason ?? 'Cancelled by operator';
    const rental = await carRentalService.cancelRental(req.apiKey!.orgId, req.params.id, reason, req.body.actor ?? 'api');
    res.json({ data: rental });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/car-rentals/:id/transfer
carRentalRouter.post('/:id/transfer', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const body = TransferSchema.parse(req.body);
    const transfer = await carRentalService.requestTransfer({
      orgId: req.apiKey!.orgId,
      rentalId: req.params.id,
      ...body,
    });
    res.status(201).json({ data: transfer });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/car-rentals/transfers/:id/approve
carRentalRouter.post('/transfers/:id/approve', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const transfer = await carRentalService.approveTransfer(req.apiKey!.orgId, req.params.id, req.body.approvedBy ?? 'api');
    res.json({ data: transfer });
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/car-rentals/:id/events
carRentalRouter.get('/:id/events', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const events = await carRentalService.getRentalEvents(req.apiKey!.orgId, req.params.id);
    res.json({ data: events });
  } catch (error) {
    next(error);
  }
});
