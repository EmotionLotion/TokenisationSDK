import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as issuanceService from '../services/issuance.service.js';
import { apiKeyMiddleware } from '../middleware/auth.js';
import { ValidationError } from '../middleware/errorHandler.js';
import type { ContextRequest } from '../middleware/context.js';

const router = Router();

// ============================================================================
// Validation Schemas
// ============================================================================

const createOfferingSchema = z.object({
  tokenId: z.string().uuid(),
  name: z.string().min(1).max(256),
  description: z.string().max(4096).optional(),
  hardCap: z.string().regex(/^\d+$/, 'Must be a positive integer'),
  softCap: z.string().regex(/^\d+$/, 'Must be a positive integer').optional(),
  minInvestment: z.string().regex(/^\d+$/, 'Must be a positive integer'),
  maxInvestment: z.string().regex(/^\d+$/, 'Must be a positive integer').optional(),
  pricePerToken: z.string().regex(/^\d+$/, 'Must be a positive integer'),
  currency: z.string().min(1).max(16),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const createAllocationSchema = z.object({
  offeringId: z.string().uuid(),
  investorId: z.string().uuid(),
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid wallet address'),
  amount: z.string().regex(/^\d+$/, 'Must be a positive integer'),
  investmentAmount: z.string().regex(/^\d+$/, 'Must be a positive integer'),
  currency: z.string().min(1).max(16),
  idempotencyKey: z.string().max(64).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const updateStatusSchema = z.object({
  status: z.enum([
    'draft', 'scheduled', 'open', 'paused', 'closed', 'settled', 'cancelled',
    'pending_kyc', 'kyc_verified', 'compliance_pending', 'approved', 'rejected',
    'mint_queued', 'minting', 'confirmed', 'failed',
  ]),
  rejectionReason: z.string().max(1024).optional(),
  txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/).optional(),
  txBlock: z.number().int().positive().optional(),
});

const mintConfirmSchema = z.object({
  txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  txBlock: z.number().int().positive(),
});

// ============================================================================
// Offering Routes
// ============================================================================

/**
 * POST /offerings - Create a new offering
 */
router.post('/offerings', apiKeyMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ctxReq = req as ContextRequest;
    const orgId = ctxReq.apiKey?.orgId;
    if (!orgId) {
      throw new ValidationError('Organization ID required');
    }

    const body = createOfferingSchema.parse(req.body);
    const offering = await issuanceService.createOffering(orgId, {
      ...body,
      startDate: body.startDate ? new Date(body.startDate) : undefined,
      endDate: body.endDate ? new Date(body.endDate) : undefined,
    });

    res.status(201).json({
      success: true,
      data: offering,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /offerings - List offerings
 */
router.get('/offerings', apiKeyMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ctxReq = req as ContextRequest;
    const orgId = ctxReq.apiKey?.orgId;
    if (!orgId) {
      throw new ValidationError('Organization ID required');
    }

    const offerings = await issuanceService.listOfferings(orgId, {
      status: req.query.status as issuanceService.OfferingStatus | undefined,
      tokenId: req.query.tokenId as string | undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
      offset: req.query.offset ? parseInt(req.query.offset as string) : undefined,
    });

    res.json({
      success: true,
      data: offerings,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /offerings/:id - Get offering by ID
 */
router.get('/offerings/:id', apiKeyMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ctxReq = req as ContextRequest;
    const orgId = ctxReq.apiKey?.orgId;
    if (!orgId) {
      throw new ValidationError('Organization ID required');
    }

    const offering = await issuanceService.getOffering(req.params.id, orgId);
    res.json({
      success: true,
      data: offering,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /offerings/:id/status - Update offering status
 */
router.patch('/offerings/:id/status', apiKeyMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ctxReq = req as ContextRequest;
    const orgId = ctxReq.apiKey?.orgId;
    if (!orgId) {
      throw new ValidationError('Organization ID required');
    }

    const body = updateStatusSchema.parse(req.body);
    const offering = await issuanceService.updateOfferingStatus(
      req.params.id,
      orgId,
      body.status as issuanceService.OfferingStatus
    );

    res.json({
      success: true,
      data: offering,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /offerings/:id/settle - Settle an offering
 */
router.post('/offerings/:id/settle', apiKeyMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ctxReq = req as ContextRequest;
    const orgId = ctxReq.apiKey?.orgId;
    if (!orgId) {
      throw new ValidationError('Organization ID required');
    }

    const offering = await issuanceService.settleOffering(req.params.id, orgId);
    res.json({
      success: true,
      data: offering,
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Allocation Routes
// ============================================================================

/**
 * POST /allocations - Create a new allocation
 */
router.post('/allocations', apiKeyMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ctxReq = req as ContextRequest;
    const orgId = ctxReq.apiKey?.orgId;
    if (!orgId) {
      throw new ValidationError('Organization ID required');
    }

    const body = createAllocationSchema.parse(req.body);
    const allocation = await issuanceService.createAllocation(orgId, body);

    res.status(201).json({
      success: true,
      data: allocation,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /allocations - List allocations
 */
router.get('/allocations', apiKeyMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ctxReq = req as ContextRequest;
    const orgId = ctxReq.apiKey?.orgId;
    if (!orgId) {
      throw new ValidationError('Organization ID required');
    }

    const allocations = await issuanceService.listAllocations(orgId, {
      offeringId: req.query.offeringId as string | undefined,
      investorId: req.query.investorId as string | undefined,
      status: req.query.status as issuanceService.AllocationStatus | undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
      offset: req.query.offset ? parseInt(req.query.offset as string) : undefined,
    });

    res.json({
      success: true,
      data: allocations,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /allocations/:id - Get allocation by ID
 */
router.get('/allocations/:id', apiKeyMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ctxReq = req as ContextRequest;
    const orgId = ctxReq.apiKey?.orgId;
    if (!orgId) {
      throw new ValidationError('Organization ID required');
    }

    const allocation = await issuanceService.getAllocation(req.params.id, orgId);
    res.json({
      success: true,
      data: allocation,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /allocations/:id/status - Update allocation status
 */
router.patch('/allocations/:id/status', apiKeyMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ctxReq = req as ContextRequest;
    const orgId = ctxReq.apiKey?.orgId;
    if (!orgId) {
      throw new ValidationError('Organization ID required');
    }

    const body = updateStatusSchema.parse(req.body);
    const allocation = await issuanceService.updateAllocationStatus(
      req.params.id,
      orgId,
      body.status as issuanceService.AllocationStatus,
      {
        rejectionReason: body.rejectionReason,
        txHash: body.txHash,
        txBlock: body.txBlock,
      }
    );

    res.json({
      success: true,
      data: allocation,
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Mint Queue Routes
// ============================================================================

/**
 * GET /mint-queue - Get allocations ready for minting
 */
router.get('/mint-queue', apiKeyMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ctxReq = req as ContextRequest;
    const orgId = ctxReq.apiKey?.orgId;
    if (!orgId) {
      throw new ValidationError('Organization ID required');
    }

    const queue = await issuanceService.getMintQueue(orgId);
    res.json({
      success: true,
      data: queue,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /allocations/:id/queue-mint - Queue allocation for minting
 */
router.post('/allocations/:id/queue-mint', apiKeyMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ctxReq = req as ContextRequest;
    const orgId = ctxReq.apiKey?.orgId;
    if (!orgId) {
      throw new ValidationError('Organization ID required');
    }

    const allocation = await issuanceService.queueForMint(req.params.id, orgId);
    res.json({
      success: true,
      data: allocation,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /allocations/:id/mark-minting - Mark allocation as minting
 */
router.post('/allocations/:id/mark-minting', apiKeyMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ctxReq = req as ContextRequest;
    const orgId = ctxReq.apiKey?.orgId;
    if (!orgId) {
      throw new ValidationError('Organization ID required');
    }

    const body = z.object({
      txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
    }).parse(req.body);

    const allocation = await issuanceService.markMinting(req.params.id, orgId, body.txHash);
    res.json({
      success: true,
      data: allocation,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /allocations/:id/confirm-mint - Confirm mint after chain confirmation
 */
router.post('/allocations/:id/confirm-mint', apiKeyMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ctxReq = req as ContextRequest;
    const orgId = ctxReq.apiKey?.orgId;
    if (!orgId) {
      throw new ValidationError('Organization ID required');
    }

    const body = mintConfirmSchema.parse(req.body);
    const allocation = await issuanceService.confirmMint(
      req.params.id,
      orgId,
      body.txHash,
      body.txBlock
    );

    res.json({
      success: true,
      data: allocation,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /allocations/:id/fail-mint - Mark mint as failed
 */
router.post('/allocations/:id/fail-mint', apiKeyMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ctxReq = req as ContextRequest;
    const orgId = ctxReq.apiKey?.orgId;
    if (!orgId) {
      throw new ValidationError('Organization ID required');
    }

    const body = z.object({
      reason: z.string().min(1).max(1024),
    }).parse(req.body);

    const allocation = await issuanceService.failMint(req.params.id, orgId, body.reason);
    res.json({
      success: true,
      data: allocation,
    });
  } catch (error) {
    next(error);
  }
});

export const issuanceRouter = router;
