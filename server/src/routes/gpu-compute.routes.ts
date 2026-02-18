/**
 * GPU Compute Routes
 *
 * REST API endpoints for GPU compute node tokenization:
 * - Node management (register, list, update, decommission)
 * - Hardware verification
 * - Tokenization workflow
 * - Metrics and revenue tracking
 * - Yield distribution
 * - Marketplace browsing and analytics
 */

import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as gpuComputeService from '../services/gpu-compute.service.js';
import { ValidationError } from '../middleware/errorHandler.js';
import { type ApiKeyRequest } from '../middleware/auth.js';

export const gpuComputeRouter = Router();

// ============================================================================
// Validation Schemas
// ============================================================================

const gpuModelEnum = z.enum(['H100', 'A100', 'L40S', 'RTX_4090', 'RTX_3090', 'RTX_3080', 'A6000', 'V100', 'OTHER']);
const interconnectEnum = z.enum(['NVLink', 'PCIe', 'NVSwitch']);

const createNodeSchema = z.object({
  gpuModel: gpuModelEnum,
  gpuCount: z.number().int().min(1).max(64),
  vramPerGpuGB: z.number().int().min(1),
  interconnect: interconnectEnum,
  cpuModel: z.string().optional(),
  ramGB: z.number().int().optional(),
  storageTB: z.number().int().optional(),
  networkBandwidthGbps: z.number().int().optional(),
  datacenterName: z.string().min(1),
  datacenterTier: z.number().int().min(1).max(4),
  datacenterLocation: z.string().min(1),
  datacenterCertifications: z.array(z.string()).optional(),
  powerCostPerKwh: z.string().optional(),
  tdpWatts: z.number().int().optional(),
  benchmarkScore: z.number().int().optional(),
  acquisitionCostUsd: z.string().min(1),
  acquisitionDate: z.string().min(1),
  estimatedUsefulLifeMonths: z.number().int().min(1).max(120),
  vastMachineId: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const updateNodeSchema = z.object({
  gpuModel: gpuModelEnum.optional(),
  cpuModel: z.string().nullable().optional(),
  benchmarkScore: z.number().int().optional(),
  datacenterName: z.string().optional(),
  datacenterTier: z.number().int().min(1).max(4).optional(),
  datacenterLocation: z.string().optional(),
  powerCostPerKwh: z.string().nullable().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const tokenizeNodeSchema = z.object({
  tokenSymbol: z.string().min(2).max(10),
  tokenName: z.string().min(1).max(100),
  totalSupply: z.string().min(1),
  pricePerToken: z.string().min(1),
});

const recordRevenueSchema = z.object({
  grossRevenueUsd: z.string().min(1),
  electricityCostUsd: z.string().min(1),
  periodStart: z.string().min(1),
  periodEnd: z.string().min(1),
  hoursRented: z.string().optional(),
  avgUtilizationPercent: z.string().optional(),
});

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ============================================================================
// GPU Node Management
// ============================================================================

// POST /gpu-nodes - Register a new GPU node
gpuComputeRouter.post('/gpu-nodes', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const data = createNodeSchema.parse(req.body);
    const node = await gpuComputeService.createGPUNode(req.apiKey!.orgId, data);
    res.status(201).json({ success: true, data: node });
  } catch (error) {
    if (error instanceof z.ZodError) return next(new ValidationError(error.errors.map(e => e.message).join(', ')));
    next(error);
  }
});

// GET /gpu-nodes - List all GPU nodes
gpuComputeRouter.get('/gpu-nodes', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const { page, limit } = paginationSchema.parse(req.query);
    const result = await gpuComputeService.listGPUNodes(req.apiKey!.orgId, {
      status: req.query.status as string,
      gpuModel: req.query.gpuModel as string,
      datacenterTier: req.query.datacenterTier ? Number(req.query.datacenterTier) : undefined,
      page, limit,
    });
    res.json({ success: true, ...result });
  } catch (error) { next(error); }
});

// GET /gpu-nodes/:nodeId - Get single node
gpuComputeRouter.get('/gpu-nodes/:nodeId', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const node = await gpuComputeService.getGPUNode(req.apiKey!.orgId, req.params.nodeId);
    if (!node) return res.status(404).json({ success: false, error: 'Node not found' });
    res.json({ success: true, data: node });
  } catch (error) { next(error); }
});

// PATCH /gpu-nodes/:nodeId - Update node
gpuComputeRouter.patch('/gpu-nodes/:nodeId', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const data = updateNodeSchema.parse(req.body);
    const node = await gpuComputeService.updateGPUNode(req.apiKey!.orgId, req.params.nodeId, data);
    if (!node) return res.status(404).json({ success: false, error: 'Node not found' });
    res.json({ success: true, data: node });
  } catch (error) {
    if (error instanceof z.ZodError) return next(new ValidationError(error.errors.map(e => e.message).join(', ')));
    next(error);
  }
});

// DELETE /gpu-nodes/:nodeId - Decommission
gpuComputeRouter.delete('/gpu-nodes/:nodeId', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const node = await gpuComputeService.decommissionGPUNode(req.apiKey!.orgId, req.params.nodeId);
    if (!node) return res.status(404).json({ success: false, error: 'Node not found' });
    res.json({ success: true, data: node });
  } catch (error) { next(error); }
});

// ============================================================================
// Verification
// ============================================================================

// POST /gpu-nodes/:nodeId/verify - Trigger verification
gpuComputeRouter.post('/gpu-nodes/:nodeId/verify', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const node = await gpuComputeService.requestVerification(req.apiKey!.orgId, req.params.nodeId);
    if (!node) return res.status(404).json({ success: false, error: 'Node not found' });
    res.json({ success: true, data: node, message: 'Verification requested' });
  } catch (error) { next(error); }
});

// POST /gpu-nodes/:nodeId/verify/complete - Complete verification
gpuComputeRouter.post('/gpu-nodes/:nodeId/verify/complete', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const { passed } = z.object({ passed: z.boolean() }).parse(req.body);
    const node = await gpuComputeService.completeVerification(req.apiKey!.orgId, req.params.nodeId, passed);
    if (!node) return res.status(404).json({ success: false, error: 'Node not found' });
    res.json({ success: true, data: node });
  } catch (error) {
    if (error instanceof z.ZodError) return next(new ValidationError(error.errors.map(e => e.message).join(', ')));
    next(error);
  }
});

// ============================================================================
// Tokenization
// ============================================================================

// POST /gpu-nodes/:nodeId/tokenize - Tokenize a verified node
gpuComputeRouter.post('/gpu-nodes/:nodeId/tokenize', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const data = tokenizeNodeSchema.parse(req.body);
    const node = await gpuComputeService.getGPUNode(req.apiKey!.orgId, req.params.nodeId);
    if (!node) return res.status(404).json({ success: false, error: 'Node not found' });
    if (!node.verified) return res.status(400).json({ success: false, error: 'Node must be verified before tokenization' });

    const listing = await gpuComputeService.tokenizeNode(req.apiKey!.orgId, req.params.nodeId, data);
    res.status(201).json({ success: true, data: listing });
  } catch (error) {
    if (error instanceof z.ZodError) return next(new ValidationError(error.errors.map(e => e.message).join(', ')));
    next(error);
  }
});

// GET /gpu-nodes/:nodeId/token - Get token details
gpuComputeRouter.get('/gpu-nodes/:nodeId/token', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const token = await gpuComputeService.getNodeToken(req.apiKey!.orgId, req.params.nodeId);
    if (!token) return res.status(404).json({ success: false, error: 'Node not tokenized' });
    res.json({ success: true, data: token });
  } catch (error) { next(error); }
});

// ============================================================================
// Metrics & Revenue
// ============================================================================

// GET /gpu-nodes/:nodeId/metrics - Get metrics
gpuComputeRouter.get('/gpu-nodes/:nodeId/metrics', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const metrics = await gpuComputeService.getNodeMetrics(req.params.nodeId);
    res.json({ success: true, data: metrics });
  } catch (error) { next(error); }
});

// GET /gpu-nodes/:nodeId/revenue - Get revenue history
gpuComputeRouter.get('/gpu-nodes/:nodeId/revenue', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const revenue = await gpuComputeService.getNodeRevenue(req.apiKey!.orgId, req.params.nodeId, {
      start: req.query.periodStart as string,
      end: req.query.periodEnd as string,
    });
    const summary = await gpuComputeService.getNodeRevenueSummary(req.apiKey!.orgId, req.params.nodeId);
    res.json({ success: true, data: revenue, summary });
  } catch (error) { next(error); }
});

// POST /gpu-nodes/:nodeId/revenue - Record revenue period
gpuComputeRouter.post('/gpu-nodes/:nodeId/revenue', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const data = recordRevenueSchema.parse(req.body);
    const period = await gpuComputeService.recordRevenuePeriod(req.apiKey!.orgId, req.params.nodeId, data);
    res.status(201).json({ success: true, data: period });
  } catch (error) {
    if (error instanceof z.ZodError) return next(new ValidationError(error.errors.map(e => e.message).join(', ')));
    next(error);
  }
});

// ============================================================================
// Distribution
// ============================================================================

// POST /gpu-nodes/:nodeId/distribute - Trigger distribution
gpuComputeRouter.post('/gpu-nodes/:nodeId/distribute', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const { revenuePeriodId } = z.object({ revenuePeriodId: z.string().uuid() }).parse(req.body);
    const distribution = await gpuComputeService.distributeRevenue(req.apiKey!.orgId, req.params.nodeId, revenuePeriodId);
    if (!distribution) return res.status(400).json({ success: false, error: 'Period not found or already distributed' });
    res.json({ success: true, data: distribution });
  } catch (error) {
    if (error instanceof z.ZodError) return next(new ValidationError(error.errors.map(e => e.message).join(', ')));
    next(error);
  }
});

// GET /gpu-nodes/:nodeId/distributions - Get distribution history
gpuComputeRouter.get('/gpu-nodes/:nodeId/distributions', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const distributions = await gpuComputeService.getDistributions(req.apiKey!.orgId, req.params.nodeId);
    res.json({ success: true, data: distributions });
  } catch (error) { next(error); }
});

// ============================================================================
// Marketplace (public-ish, still needs auth for now)
// ============================================================================

// GET /compute-market - Browse tokenized GPU nodes
gpuComputeRouter.get('/compute-market', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const result = await gpuComputeService.listComputeMarket({
      gpuModel: req.query.gpuModel as string,
      minYield: req.query.minYield ? Number(req.query.minYield) : undefined,
      maxPrice: req.query.maxPrice ? Number(req.query.maxPrice) : undefined,
      datacenterTier: req.query.datacenterTier ? Number(req.query.datacenterTier) : undefined,
      sort: req.query.sort as string,
      page: req.query.page ? Number(req.query.page) : 1,
      limit: req.query.limit ? Number(req.query.limit) : 20,
    });
    res.json({ success: true, ...result });
  } catch (error) { next(error); }
});

// GET /compute-market/analytics - Market analytics
gpuComputeRouter.get('/compute-market/analytics', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const analytics = await gpuComputeService.getMarketAnalytics();
    res.json({ success: true, data: analytics });
  } catch (error) { next(error); }
});
