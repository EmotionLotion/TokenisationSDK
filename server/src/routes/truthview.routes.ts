/**
 * Truth View API Routes
 *
 * Point-in-time queries and historical state reconstruction
 */

import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ValidationError } from '../middleware/errorHandler.js';
import { apiKeyMiddleware, type ApiKeyRequest } from '../middleware/auth.js';
import * as truthviewService from '../services/truthview.service.js';

export const truthviewRouter = Router();

// ============================================================================
// Schemas
// ============================================================================

const historicalBalanceSchema = z.object({
  tokenId: z.string().min(1),
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  asOf: z.string().datetime().optional(),
});

const capTableSnapshotSchema = z.object({
  tokenId: z.string().min(1),
  asOf: z.string().datetime().optional(),
});

const stateChangesSchema = z.object({
  tokenId: z.string().min(1),
  fromDate: z.string().datetime(),
  toDate: z.string().datetime(),
});

const stateProofSchema = z.object({
  tokenId: z.string().min(1),
  asOf: z.string().datetime().optional(),
});

// ============================================================================
// Historical Balance Endpoints
// ============================================================================

/**
 * @openapi
 * /api/v1/truthview/balance:
 *   get:
 *     tags: [Truth View]
 *     summary: Get historical balance for a wallet
 *     parameters:
 *       - name: tokenId
 *         in: query
 *         required: true
 *         schema: { type: string }
 *       - name: walletAddress
 *         in: query
 *         required: true
 *         schema: { type: string }
 *       - name: asOf
 *         in: query
 *         schema: { type: string, format: date-time }
 */
truthviewRouter.get(
  '/balance',
  apiKeyMiddleware,
  async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.apiKey) throw new ValidationError('API key required');

      const params = historicalBalanceSchema.parse(req.query);
      const asOf = params.asOf ? new Date(params.asOf) : new Date();

      const balance = await truthviewService.getHistoricalBalance(
        params.tokenId,
        params.walletAddress,
        asOf,
        req.apiKey.orgId
      );

      res.json(balance);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @openapi
 * /api/v1/truthview/balances:
 *   get:
 *     tags: [Truth View]
 *     summary: Get all balances at a specific point in time
 *     parameters:
 *       - name: tokenId
 *         in: query
 *         required: true
 *         schema: { type: string }
 *       - name: asOf
 *         in: query
 *         schema: { type: string, format: date-time }
 */
truthviewRouter.get(
  '/balances',
  apiKeyMiddleware,
  async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.apiKey) throw new ValidationError('API key required');

      const tokenId = z.string().min(1).parse(req.query.tokenId);
      const asOfParam = req.query.asOf as string | undefined;
      const asOf = asOfParam ? new Date(asOfParam) : new Date();

      const balances = await truthviewService.getHistoricalBalances({
        tokenId,
        orgId: req.apiKey.orgId,
        asOf,
        queryType: 'date',
      });

      res.json({
        data: balances,
        count: balances.length,
        asOf: asOf.toISOString(),
      });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================================================
// Cap Table Snapshot Endpoints
// ============================================================================

/**
 * @openapi
 * /api/v1/truthview/snapshot:
 *   get:
 *     tags: [Truth View]
 *     summary: Generate cap table snapshot at a specific point in time
 *     parameters:
 *       - name: tokenId
 *         in: query
 *         required: true
 *         schema: { type: string }
 *       - name: asOf
 *         in: query
 *         schema: { type: string, format: date-time }
 */
truthviewRouter.get(
  '/snapshot',
  apiKeyMiddleware,
  async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.apiKey) throw new ValidationError('API key required');

      const params = capTableSnapshotSchema.parse(req.query);
      const asOf = params.asOf ? new Date(params.asOf) : new Date();

      const snapshot = await truthviewService.generateCapTableSnapshot(
        params.tokenId,
        req.apiKey.orgId,
        asOf
      );

      res.json(snapshot);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @openapi
 * /api/v1/truthview/snapshot/eod:
 *   get:
 *     tags: [Truth View]
 *     summary: Get end-of-day cap table snapshot
 *     parameters:
 *       - name: tokenId
 *         in: query
 *         required: true
 *         schema: { type: string }
 *       - name: date
 *         in: query
 *         required: true
 *         schema: { type: string, format: date }
 */
truthviewRouter.get(
  '/snapshot/eod',
  apiKeyMiddleware,
  async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.apiKey) throw new ValidationError('API key required');

      const tokenId = z.string().min(1).parse(req.query.tokenId);
      const dateParam = z.string().parse(req.query.date);
      const date = new Date(dateParam);

      if (isNaN(date.getTime())) {
        throw new ValidationError('Invalid date format');
      }

      const snapshot = await truthviewService.getEndOfDaySnapshot(
        tokenId,
        req.apiKey.orgId,
        date
      );

      res.json(snapshot);
    } catch (error) {
      next(error);
    }
  }
);

// ============================================================================
// State Change Tracking Endpoints
// ============================================================================

/**
 * @openapi
 * /api/v1/truthview/changes:
 *   get:
 *     tags: [Truth View]
 *     summary: Get state changes between two points in time
 *     parameters:
 *       - name: tokenId
 *         in: query
 *         required: true
 *         schema: { type: string }
 *       - name: fromDate
 *         in: query
 *         required: true
 *         schema: { type: string, format: date-time }
 *       - name: toDate
 *         in: query
 *         required: true
 *         schema: { type: string, format: date-time }
 */
truthviewRouter.get(
  '/changes',
  apiKeyMiddleware,
  async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.apiKey) throw new ValidationError('API key required');

      const params = stateChangesSchema.parse(req.query);

      const changes = await truthviewService.getStateChanges(
        params.tokenId,
        req.apiKey.orgId,
        new Date(params.fromDate),
        new Date(params.toDate)
      );

      res.json(changes);
    } catch (error) {
      next(error);
    }
  }
);

// ============================================================================
// State Proof Endpoints
// ============================================================================

/**
 * @openapi
 * /api/v1/truthview/proof:
 *   get:
 *     tags: [Truth View]
 *     summary: Generate cryptographic state proof
 *     parameters:
 *       - name: tokenId
 *         in: query
 *         required: true
 *         schema: { type: string }
 *       - name: asOf
 *         in: query
 *         schema: { type: string, format: date-time }
 */
truthviewRouter.get(
  '/proof',
  apiKeyMiddleware,
  async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.apiKey) throw new ValidationError('API key required');

      const params = stateProofSchema.parse(req.query);
      const asOf = params.asOf ? new Date(params.asOf) : new Date();

      const proof = await truthviewService.generateStateProof(
        params.tokenId,
        req.apiKey.orgId,
        asOf
      );

      res.json(proof);
    } catch (error) {
      next(error);
    }
  }
);

// ============================================================================
// Comparison Endpoints
// ============================================================================

/**
 * @openapi
 * /api/v1/truthview/compare:
 *   get:
 *     tags: [Truth View]
 *     summary: Compare cap tables at two different points in time
 *     parameters:
 *       - name: tokenId
 *         in: query
 *         required: true
 *         schema: { type: string }
 *       - name: date1
 *         in: query
 *         required: true
 *         schema: { type: string, format: date-time }
 *       - name: date2
 *         in: query
 *         required: true
 *         schema: { type: string, format: date-time }
 */
truthviewRouter.get(
  '/compare',
  apiKeyMiddleware,
  async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.apiKey) throw new ValidationError('API key required');

      const tokenId = z.string().min(1).parse(req.query.tokenId);
      const date1 = z.string().datetime().parse(req.query.date1);
      const date2 = z.string().datetime().parse(req.query.date2);

      const [snapshot1, snapshot2] = await Promise.all([
        truthviewService.generateCapTableSnapshot(tokenId, req.apiKey.orgId, new Date(date1)),
        truthviewService.generateCapTableSnapshot(tokenId, req.apiKey.orgId, new Date(date2)),
      ]);

      // Calculate differences
      const holders1 = new Map(snapshot1.holders.map((h) => [h.walletAddress, h]));
      const holders2 = new Map(snapshot2.holders.map((h) => [h.walletAddress, h]));

      const added: typeof snapshot2.holders = [];
      const removed: typeof snapshot1.holders = [];
      const changed: Array<{
        walletAddress: string;
        balanceBefore: string;
        balanceAfter: string;
        change: string;
      }> = [];

      // Find added and changed holders
      for (const [address, holder] of holders2) {
        const before = holders1.get(address);
        if (!before) {
          added.push(holder);
        } else if (before.balance !== holder.balance) {
          changed.push({
            walletAddress: address,
            balanceBefore: before.balance,
            balanceAfter: holder.balance,
            change: (BigInt(holder.balance) - BigInt(before.balance)).toString(),
          });
        }
      }

      // Find removed holders
      for (const [address, holder] of holders1) {
        if (!holders2.has(address)) {
          removed.push(holder);
        }
      }

      res.json({
        tokenId,
        date1: snapshot1.asOf,
        date2: snapshot2.asOf,
        snapshot1: {
          holderCount: snapshot1.holderCount,
          circulatingSupply: snapshot1.circulatingSupply,
        },
        snapshot2: {
          holderCount: snapshot2.holderCount,
          circulatingSupply: snapshot2.circulatingSupply,
        },
        differences: {
          holdersAdded: added.length,
          holdersRemoved: removed.length,
          holdersChanged: changed.length,
          circulatingSupplyChange: (
            BigInt(snapshot2.circulatingSupply) - BigInt(snapshot1.circulatingSupply)
          ).toString(),
        },
        details: {
          added,
          removed,
          changed,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);
