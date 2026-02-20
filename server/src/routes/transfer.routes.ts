import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as transferService from '../services/transfer.service.js';
import * as relayerService from '../services/relayer.service.js';
import * as batchTransferService from '../services/batch-transfer.service.js';
import { ValidationError, NotFoundError } from '../middleware/errorHandler.js';
import { apiKeyMiddleware, type ApiKeyRequest } from '../middleware/auth.js';
import { idempotencyMiddleware } from '../services/idempotency.service.js';
import { requireScope } from '../middleware/scopeGuard.js';
import { db, schema } from '../config/database.js';
import { eq, and } from 'drizzle-orm';

export const transferRouter = Router();

/**
 * @openapi
 * /transfers:
 *   post:
 *     tags: [Transfers]
 *     summary: Create transfer request
 *     description: |
 *       Step 1 of the transfer saga. Creates a transfer request in 'pending' status.
 *       The transfer must then go through precheck, approval, signing, submission, and settlement.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateTransferInput'
 *     responses:
 *       201:
 *         description: Transfer created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Transfer'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *   get:
 *     tags: [Transfers]
 *     summary: List transfers
 *     parameters:
 *       - name: tokenId
 *         in: query
 *         schema:
 *           type: string
 *           format: uuid
 *       - name: status
 *         in: query
 *         schema:
 *           type: string
 *           enum: [pending, prechecked, approved, signed, submitted, confirmed, reconciled, settled, failed, cancelled]
 *       - name: fromWallet
 *         in: query
 *         schema:
 *           type: string
 *       - name: toWallet
 *         in: query
 *         schema:
 *           type: string
 *       - $ref: '#/components/parameters/limitParam'
 *       - $ref: '#/components/parameters/offsetParam'
 *     responses:
 *       200:
 *         description: List of transfers
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Transfer'
 *                 count:
 *                   type: integer
 *
 * /transfers/execute:
 *   post:
 *     tags: [Transfers]
 *     summary: Execute full transfer saga
 *     description: |
 *       Executes the complete transfer flow in one call:
 *       create → precheck → approve (optional) → sign
 *
 *       Use `autoApprove: true` to automatically approve compliant transfers.
 *       Use `mode: 'custodial'` for server-side signing or `mode: 'non_custodial'` to get unsigned tx.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             allOf:
 *               - $ref: '#/components/schemas/CreateTransferInput'
 *               - type: object
 *                 properties:
 *                   autoApprove:
 *                     type: boolean
 *                     description: Auto-approve if compliance passes
 *                   mode:
 *                     type: string
 *                     enum: [custodial, non_custodial]
 *                     description: Signing mode
 *     responses:
 *       201:
 *         description: Transfer executed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 transfer:
 *                   $ref: '#/components/schemas/Transfer'
 *                 decision:
 *                   $ref: '#/components/schemas/ComplianceDecision'
 *                 unsignedTx:
 *                   type: object
 *                   description: Unsigned transaction (non_custodial mode)
 *
 * /transfers/{id}:
 *   get:
 *     tags: [Transfers]
 *     summary: Get transfer by ID
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Transfer details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Transfer'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *
 * /transfers/{id}/precheck:
 *   post:
 *     tags: [Transfers]
 *     summary: Precheck transfer compliance
 *     description: |
 *       Step 2: Run compliance checks on the transfer without committing.
 *       Evaluates policies and returns the decision.
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Precheck complete
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Transfer'
 *
 * /transfers/{id}/approve:
 *   post:
 *     tags: [Transfers]
 *     summary: Approve transfer
 *     description: Step 3: Approve the transfer after successful precheck
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Transfer approved
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Transfer'
 *
 * /transfers/{id}/sign:
 *   post:
 *     tags: [Transfers]
 *     summary: Sign transfer
 *     description: |
 *       Step 4: Generate or execute the signed transaction.
 *       - `custodial`: Server signs and returns txHash
 *       - `non_custodial`: Returns unsigned tx for client signing
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               mode:
 *                 type: string
 *                 enum: [custodial, non_custodial]
 *                 default: non_custodial
 *     responses:
 *       200:
 *         description: Transaction signed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 transfer:
 *                   $ref: '#/components/schemas/Transfer'
 *                 txHash:
 *                   type: string
 *                 unsignedTx:
 *                   type: object
 *
 * /transfers/{id}/submit:
 *   post:
 *     tags: [Transfers]
 *     summary: Submit signed transaction
 *     description: Step 5: Submit the signed transaction hash (non-custodial mode)
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [txHash]
 *             properties:
 *               txHash:
 *                 $ref: '#/components/schemas/TransactionHash'
 *     responses:
 *       200:
 *         description: Transaction submitted
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Transfer'
 *
 * /transfers/{id}/confirm:
 *   post:
 *     tags: [Transfers]
 *     summary: Confirm transaction mined
 *     description: Step 6: Called by indexer when transaction is mined
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [blockNumber]
 *             properties:
 *               blockNumber:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Transaction confirmed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Transfer'
 *
 * /transfers/{id}/reconcile:
 *   post:
 *     tags: [Transfers]
 *     summary: Reconcile on-chain state
 *     description: Step 7: Verify transfer against on-chain state
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Transfer reconciled
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Transfer'
 *
 * /transfers/{id}/settle:
 *   post:
 *     tags: [Transfers]
 *     summary: Final settlement
 *     description: Step 8: Mark transfer as fully settled
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Transfer settled
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Transfer'
 *
 * /transfers/{id}/cancel:
 *   post:
 *     tags: [Transfers]
 *     summary: Cancel transfer
 *     description: Cancel a pending transfer
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Transfer cancelled
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Transfer'
 */

// ============================================================================
// Validation Schemas
// ============================================================================

const createTransferSchema = z.object({
  tokenId: z.string().uuid(),
  fromWallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address'),
  toWallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address'),
  amount: z.string().min(1).regex(/^\d+$/, 'Amount must be a positive integer string'),
  fromInvestorId: z.string().uuid().optional(),
  toInvestorId: z.string().uuid().optional(),
  idempotencyKey: z.string().max(64).optional(),
  expiresAt: z.string().datetime().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const executeTransferSchema = createTransferSchema.extend({
  autoApprove: z.boolean().optional(),
  mode: z.enum(['custodial', 'non_custodial']).optional(),
});

const submitTransferSchema = z.object({
  txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/, 'Invalid transaction hash'),
});

const confirmTransferSchema = z.object({
  blockNumber: z.number().int().positive(),
});

// ============================================================================
// Transfer Routes
// ============================================================================

// Create transfer (Step 1)
transferRouter.post(
  '/',
  apiKeyMiddleware,
  requireScope('write'),
  idempotencyMiddleware({ operation: 'transfer.create', required: true }),
  async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const input = createTransferSchema.parse(req.body);
    const transfer = await transferService.createTransfer({
      ...input,
      orgId: req.apiKey.orgId,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
    });

    res.status(201).json(transfer);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new ValidationError(error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')));
    } else {
      next(error);
    }
  }
});

// Execute full saga (create + precheck + optional auto-approve + sign)
transferRouter.post('/execute', apiKeyMiddleware, requireScope('write'), async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const input = executeTransferSchema.parse(req.body);
    const result = await transferService.executeTransferSaga(
      {
        ...input,
        orgId: req.apiKey.orgId,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
      },
      {
        autoApprove: input.autoApprove,
        mode: input.mode,
      }
    );

    res.status(201).json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new ValidationError(error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')));
    } else {
      next(error);
    }
  }
});

// ============================================================================
// Gas Estimation (must be registered before /:id routes)
// ============================================================================

const estimateGasSchema = z.object({
  tokenId: z.string().uuid(),
  fromWallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address'),
  toWallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address'),
  amount: z.string().min(1).regex(/^\d+$/, 'Amount must be a positive integer string'),
});

// Estimate gas for a transfer without creating one
transferRouter.post('/estimate-gas', apiKeyMiddleware, requireScope('read'), async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const { tokenId, fromWallet, toWallet, amount } = estimateGasSchema.parse(req.body);

    // Look up token
    const token = await db.query.tokens.findFirst({
      where: and(
        eq(schema.tokens.id, tokenId),
        eq(schema.tokens.orgId, req.apiKey.orgId),
      ),
    });

    if (!token) {
      throw new NotFoundError('Token not found');
    }

    if (!token.address) {
      throw new ValidationError('Token not deployed');
    }

    // Encode transfer(address, uint256) call data
    const callData = relayerService.encodeERC20Transfer(toWallet, amount);

    // Estimate gas via eth_estimateGas — if the transaction would revert,
    // the RPC returns an error with the revert reason.
    const gasEstimate = await relayerService.estimateGas({
      from: fromWallet,
      to: token.address,
      data: callData,
      value: '0',
      chainId: token.chainId,
    });

    res.json({
      gasLimit: gasEstimate.gasLimit,
      gasPrice: gasEstimate.gasPrice,
      maxFeePerGas: gasEstimate.maxFeePerGas,
      maxPriorityFeePerGas: gasEstimate.maxPriorityFeePerGas,
      estimatedCost: gasEstimate.estimatedCost,
      estimatedCostUSD: gasEstimate.estimatedCostUSD,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new ValidationError(error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')));
    } else {
      next(error);
    }
  }
});

// ============================================================================
// Batch Transfer (must be BEFORE /:id catch-all)
// ============================================================================

const batchTransferSchema = z.object({
  transfers: z.array(z.object({
    tokenId: z.string().min(1),
    fromWallet: z.string().min(1),
    toWallet: z.string().min(1),
    amount: z.string().min(1),
    metadata: z.record(z.unknown()).optional(),
  })).min(1).max(100),
});

transferRouter.post('/batch', apiKeyMiddleware, requireScope('write'), async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const { transfers } = batchTransferSchema.parse(req.body);
    const result = await batchTransferService.createBatchTransfer(req.apiKey.orgId, transfers);
    res.status(201).json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new ValidationError(error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')));
    } else {
      next(error);
    }
  }
});

// List transfers
transferRouter.get('/', apiKeyMiddleware, requireScope('read'), async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const { tokenId, status, fromWallet, toWallet, limit, offset } = req.query;

    const transfers = await transferService.listTransfers(req.apiKey.orgId, {
      tokenId: tokenId as string | undefined,
      status: status as string | undefined,
      fromWallet: fromWallet as string | undefined,
      toWallet: toWallet as string | undefined,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    });

    res.json({ data: transfers, count: transfers.length });
  } catch (error) {
    next(error);
  }
});

// Get transfer by ID
transferRouter.get('/:id', apiKeyMiddleware, requireScope('read'), async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const transfer = await transferService.getTransfer(req.params.id, req.apiKey.orgId);
    res.json(transfer);
  } catch (error) {
    next(error);
  }
});

// Precheck transfer (Step 2)
transferRouter.post('/:id/precheck', apiKeyMiddleware, requireScope('write'), async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const transfer = await transferService.precheckTransfer(req.params.id, req.apiKey.orgId);
    res.json(transfer);
  } catch (error) {
    next(error);
  }
});

// Approve transfer (Step 3)
transferRouter.post('/:id/approve', apiKeyMiddleware, requireScope('admin'), async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const transfer = await transferService.approveTransfer(req.params.id, req.apiKey.orgId, req.apiKey.keyId);
    res.json(transfer);
  } catch (error) {
    next(error);
  }
});

// Cancel transfer
transferRouter.post('/:id/cancel', apiKeyMiddleware, requireScope('admin'), async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const { reason } = req.body;
    const transfer = await transferService.cancelTransfer(req.params.id, req.apiKey.orgId, reason);
    res.json(transfer);
  } catch (error) {
    next(error);
  }
});

// Sign transfer (Step 4) - Returns tx payload for non-custodial signing
transferRouter.post('/:id/sign', apiKeyMiddleware, requireScope('admin'), async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const mode = (req.body.mode as 'custodial' | 'non_custodial') || 'non_custodial';
    const result = await transferService.signTransfer(req.params.id, req.apiKey.orgId, mode);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Submit transfer (Step 5) - Submit signed tx hash
transferRouter.post('/:id/submit', apiKeyMiddleware, requireScope('admin'), async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const { txHash } = submitTransferSchema.parse(req.body);
    const transfer = await transferService.submitTransfer(req.params.id, req.apiKey.orgId, txHash);
    res.json(transfer);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new ValidationError(error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')));
    } else {
      next(error);
    }
  }
});

// Confirm transfer (Step 6) - Called by indexer when tx is mined
transferRouter.post('/:id/confirm', apiKeyMiddleware, requireScope('admin'), async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const { blockNumber } = confirmTransferSchema.parse(req.body);
    const transfer = await transferService.confirmTransfer(req.params.id, req.apiKey.orgId, blockNumber);
    res.json(transfer);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new ValidationError(error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')));
    } else {
      next(error);
    }
  }
});

// Reconcile transfer (Step 7) - Verify on-chain state
transferRouter.post('/:id/reconcile', apiKeyMiddleware, requireScope('admin'), async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const transfer = await transferService.reconcileTransfer(req.params.id, req.apiKey.orgId);
    res.json(transfer);
  } catch (error) {
    next(error);
  }
});

// Settle transfer (Step 8) - Final settlement
transferRouter.post('/:id/settle', apiKeyMiddleware, requireScope('admin'), async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const transfer = await transferService.settleTransfer(req.params.id, req.apiKey.orgId);
    res.json(transfer);
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Compliance Pre-Check
// ============================================================================

// Check transfer compliance without creating a transfer
transferRouter.post('/check', apiKeyMiddleware, requireScope('read'), async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const { tokenId, fromWallet, toWallet, amount } = req.body;

    if (!tokenId || !fromWallet || !toWallet || !amount) {
      throw new ValidationError('tokenId, fromWallet, toWallet, and amount are required');
    }

    // Run compliance check without creating a transfer
    const check = await transferService.checkTransferCompliance(req.apiKey.orgId, {
      tokenId,
      fromWallet,
      toWallet,
      amount,
    });

    res.json({
      allowed: check.allowed,
      decision: check.decision,
      reasons: check.reasons || [],
      restrictions: check.restrictions || [],
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Redemption Routes
// ============================================================================

// Create redemption request (investor exit)
transferRouter.post('/redemption', apiKeyMiddleware, requireScope('write'), async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const { tokenId, investorId, fromWallet, amount, paymentMethod, paymentDetails, metadata } = req.body;

    if (!tokenId || !fromWallet || !amount) {
      throw new ValidationError('tokenId, fromWallet, and amount are required');
    }

    // Create a redemption record
    const redemption = {
      id: `rdm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      orgId: req.apiKey.orgId,
      tokenId,
      investorId,
      fromWallet,
      amount,
      paymentMethod: paymentMethod || 'bank_wire',
      paymentDetails: paymentDetails || {},
      status: 'pending',
      metadata: metadata || {},
      createdAt: new Date(),
    };

    res.status(201).json(redemption);
  } catch (error) {
    next(error);
  }
});
