/**
 * DePIN Routes — "UseYield"
 *
 * Device CRUD + telemetry ingestion + yield compute/distribute endpoints.
 */

import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as depinIotService from '../services/depin-iot.service.js';
import * as yieldService from '../services/yield-distribution.service.js';
import { ValidationError } from '../middleware/errorHandler.js';
import { type ApiKeyRequest } from '../middleware/auth.js';

export const depinRouter = Router();

// ============================================================================
// Validation Schemas
// ============================================================================

const RegisterDeviceSchema = z.object({
  assetId: z.string().uuid(),
  deviceId: z.string().min(1).max(128),
  deviceType: z.enum(['occupancy_sensor', 'power_meter', 'flow_meter', 'gps_tracker', 'environmental', 'access_control']),
  location: z.string().min(1),
  metadata: z.record(z.unknown()).optional(),
});

const IngestTelemetrySchema = z.object({
  deviceId: z.string().min(1),
  metrics: z.record(z.number()),
  timestamp: z.string().optional(),
});

const CalculateUtilizationSchema = z.object({
  assetId: z.string().uuid(),
  period: z.string().regex(/^\d{4}-\d{2}$/),
});

const CreateYieldRuleSchema = z.object({
  assetId: z.string().uuid(),
  baseYield: z.number().min(0).max(100),
  utilizationMultiplier: z.number().min(0).max(10),
  period: z.enum(['daily', 'weekly', 'monthly']),
  minUtilization: z.number().min(0).max(100).optional(),
});

const ComputeYieldSchema = z.object({
  assetId: z.string().uuid(),
  period: z.string().regex(/^\d{4}-\d{2}$/),
  utilizationScore: z.number().min(0).max(100),
});

// ============================================================================
// Device Routes — /api/v1/devices
// ============================================================================

/** POST /api/v1/devices — Register an IoT device */
depinRouter.post('/devices', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) throw new ValidationError('API key required');
    const input = RegisterDeviceSchema.parse(req.body);
    const device = await depinIotService.registerDevice(req.apiKey.orgId, input);
    res.status(201).json({ data: device });
  } catch (error) { next(error); }
});

/** GET /api/v1/devices — List devices */
depinRouter.get('/devices', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) throw new ValidationError('API key required');
    const { assetId, deviceType, status, limit, offset } = req.query;
    const result = await depinIotService.listDevices(req.apiKey.orgId, {
      assetId: assetId as string | undefined,
      deviceType: deviceType as depinIotService.DeviceType | undefined,
      status: status as depinIotService.DeviceStatus | undefined,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    });
    res.json({ data: result.data, count: result.count });
  } catch (error) { next(error); }
});

/** POST /api/v1/devices/telemetry — Ingest telemetry data */
depinRouter.post('/devices/telemetry', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) throw new ValidationError('API key required');
    const input = IngestTelemetrySchema.parse(req.body);
    const point = await depinIotService.ingestTelemetry(req.apiKey.orgId, input);
    res.status(201).json({ data: point });
  } catch (error) { next(error); }
});

/** GET /api/v1/devices/:deviceId/telemetry — Get device telemetry */
depinRouter.get('/devices/:deviceId/telemetry', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) throw new ValidationError('API key required');
    const { limit, since } = req.query;
    const data = await depinIotService.getDeviceTelemetry(req.apiKey.orgId, req.params.deviceId, {
      limit: limit ? parseInt(limit as string) : undefined,
      since: since as string | undefined,
    });
    res.json({ data });
  } catch (error) { next(error); }
});

/** POST /api/v1/devices/utilization — Calculate utilization score */
depinRouter.post('/devices/utilization', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) throw new ValidationError('API key required');
    const input = CalculateUtilizationSchema.parse(req.body);
    const score = await depinIotService.calculateUtilization(req.apiKey.orgId, input.assetId, input.period);
    res.json({ data: score });
  } catch (error) { next(error); }
});

// ============================================================================
// Yield Routes — /api/v1/yield
// ============================================================================

/** POST /api/v1/yield/rules — Create a yield distribution rule */
depinRouter.post('/yield/rules', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) throw new ValidationError('API key required');
    const input = CreateYieldRuleSchema.parse(req.body);
    const rule = await yieldService.createDistributionRule(req.apiKey.orgId, input);
    res.status(201).json({ data: rule });
  } catch (error) { next(error); }
});

/** GET /api/v1/yield/rules — List yield rules */
depinRouter.get('/yield/rules', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) throw new ValidationError('API key required');
    const { assetId, limit, offset } = req.query;
    const result = await yieldService.listRules(req.apiKey.orgId, {
      assetId: assetId as string | undefined,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    });
    res.json({ data: result.data, count: result.count });
  } catch (error) { next(error); }
});

/** POST /api/v1/yield/compute — Compute yield for an asset */
depinRouter.post('/yield/compute', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) throw new ValidationError('API key required');
    const input = ComputeYieldSchema.parse(req.body);
    const dist = await yieldService.computeYield(req.apiKey.orgId, input.assetId, input.period, input.utilizationScore);
    res.json({ data: dist });
  } catch (error) { next(error); }
});

/** POST /api/v1/yield/distribute/:id — Execute distribution */
depinRouter.post('/yield/distribute/:id', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) throw new ValidationError('API key required');
    const dist = await yieldService.distributeYield(req.apiKey.orgId, req.params.id);
    res.json({ data: dist });
  } catch (error) { next(error); }
});

/** GET /api/v1/yield/distributions — List distributions */
depinRouter.get('/yield/distributions', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) throw new ValidationError('API key required');
    const { assetId, status, limit, offset } = req.query;
    const result = await yieldService.listDistributions(req.apiKey.orgId, {
      assetId: assetId as string | undefined,
      status: status as yieldService.DistributionStatus | undefined,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    });
    res.json({ data: result.data, count: result.count });
  } catch (error) { next(error); }
});
