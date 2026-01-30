/**
 * Gas Estimation Routes
 *
 * Provides gas price queries, transaction estimation, and multi-chain
 * gas comparison endpoints.
 */

import { Router, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import * as gasService from '../services/gas.service.js';
import { ValidationError } from '../middleware/errorHandler.js';
import { type ApiKeyRequest } from '../middleware/auth.js';

export const gasRouter = Router();

// ============================================================================
// Validation Schemas
// ============================================================================

const estimateGasSchema = z.object({
  chainId: z.number().int().positive(),
  to: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address').optional(),
  from: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address').optional(),
  data: z.string().regex(/^0x[a-fA-F0-9]*$/, 'Invalid hex data').optional(),
  value: z.string().regex(/^\d+$/, 'Value must be a non-negative integer string').optional(),
});

// ============================================================================
// Routes
// ============================================================================

/**
 * GET /api/v1/gas/chains/:chainId
 *
 * Returns current gas prices for a specific chain, including EIP-1559
 * base fee and priority fee when available.
 */
gasRouter.get('/chains/:chainId', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const chainId = parseInt(req.params.chainId, 10);
    if (isNaN(chainId) || chainId <= 0) {
      throw new ValidationError('chainId must be a positive integer');
    }

    const prices = await gasService.getCurrentGasPrices(chainId);

    res.json({
      success: true,
      data: prices,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/gas/estimate
 *
 * Estimate gas for a specific transaction.
 *
 * Body:
 *   chainId - (required) Chain ID
 *   to      - (optional) Contract/recipient address
 *   from    - (optional) Sender address
 *   data    - (optional) Calldata hex string
 *   value   - (optional) Value in wei
 */
gasRouter.post('/estimate', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const body = estimateGasSchema.parse(req.body);

    const estimate = await gasService.estimateGas(body.chainId, {
      from: body.from,
      to: body.to,
      data: body.data,
      value: body.value,
    });

    res.json({
      success: true,
      data: estimate,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new ValidationError(error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')));
    } else {
      next(error);
    }
  }
});

/**
 * GET /api/v1/gas/compare
 *
 * Compare gas prices across multiple chains.
 *
 * Query params:
 *   chainIds - (required) Comma-separated chain IDs (e.g., "1,137,42161")
 */
gasRouter.get('/compare', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const chainIdsStr = req.query.chainIds as string;
    if (!chainIdsStr) {
      throw new ValidationError('chainIds query parameter is required (comma-separated, e.g., "1,137,42161")');
    }

    const chainIds = chainIdsStr.split(',').map(s => {
      const id = parseInt(s.trim(), 10);
      if (isNaN(id) || id <= 0) {
        throw new ValidationError(`Invalid chain ID: "${s.trim()}". Must be a positive integer.`);
      }
      return id;
    });

    const comparison = await gasService.compareChains(chainIds);

    res.json({
      success: true,
      data: comparison,
    });
  } catch (error) {
    next(error);
  }
});
