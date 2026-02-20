/**
 * Secondary Market Routes
 *
 * apiKeyMiddleware is applied at mount point in index.ts — not duplicated here.
 */

import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as secondaryMarketService from '../services/secondary-market.service.js';
import { ValidationError } from '../middleware/errorHandler.js';
import { requireScope } from '../middleware/scopeGuard.js';
import type { ApiKeyRequest } from '../middleware/auth.js';

export const secondaryMarketRouter = Router();

const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

secondaryMarketRouter.get('/assets/:assetId/listings', requireScope('read'), async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const { status } = req.query;
    const { limit, offset } = paginationSchema.parse(req.query);
    const listings = await secondaryMarketService.getListings(req.params.assetId, {
      status: status as string | undefined,
      limit,
      offset,
    });
    res.json({ data: listings });
  } catch (error) {
    if (error instanceof z.ZodError) return next(new ValidationError(error.errors.map(e => e.message).join(', ')));
    next(error);
  }
});

secondaryMarketRouter.post('/assets/:assetId/listings', requireScope('write'), async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const input = z.object({
      tokenAmount: z.number().positive(),
      pricePerToken: z.number().positive(),
      currency: z.string().optional(),
      expiresAt: z.string().datetime().optional(),
      sellerWallet: z.string().min(1),
    }).parse(req.body);
    const listing = await secondaryMarketService.createListing(
      req.params.assetId, req.apiKey?.keyId || 'unknown', input.sellerWallet, input,
    );
    res.status(201).json({ data: listing });
  } catch (error) {
    if (error instanceof z.ZodError) next(new ValidationError(error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')));
    else next(error);
  }
});

secondaryMarketRouter.post('/listings/:id/purchase', requireScope('write'), async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const { buyerWallet } = z.object({ buyerWallet: z.string().min(1) }).parse(req.body);
    const orgId = req.apiKey?.orgId || req.apiKey?.keyId || 'unknown';
    const result = await secondaryMarketService.purchaseListing(req.params.id, buyerWallet, orgId);
    res.json({ data: result });
  } catch (error) {
    if (error instanceof z.ZodError) next(new ValidationError(error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')));
    else next(error);
  }
});

secondaryMarketRouter.post('/listings/:id/cancel', requireScope('write'), async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const orgId = req.apiKey?.orgId || req.apiKey?.keyId || 'unknown';
    const result = await secondaryMarketService.cancelListing(req.params.id, orgId);
    res.json({ data: result });
  } catch (error) { next(error); }
});
