/**
 * Prediction Market Routes — "FlightBet"
 *
 * CRUD + bet + settle endpoints for flight delay prediction markets.
 */

import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as predictionMarketService from '../services/prediction-market.service.js';
import { ValidationError } from '../middleware/errorHandler.js';
import { apiKeyMiddleware, type ApiKeyRequest } from '../middleware/auth.js';

export const predictionMarketRouter = Router();

// ============================================================================
// Validation Schemas
// ============================================================================

const CreateMarketSchema = z.object({
  flightNumber: z.string().min(2).max(16),
  departureDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  thresholds: z.record(z.number()).default({}),
  closesAt: z.string().datetime(),
});

const PlaceBetSchema = z.object({
  marketId: z.string().uuid(),
  partyId: z.string().uuid(),
  outcome: z.enum(['on-time', 'delayed-15', 'delayed-60', 'cancelled']),
  amount: z.number().positive(),
});

const SettleMarketSchema = z.object({
  marketId: z.string().uuid(),
  actualOutcome: z.enum(['on-time', 'delayed-15', 'delayed-60', 'cancelled']),
  oracleProof: z.string().min(1),
});

const ListMarketsSchema = z.object({
  status: z.enum(['open', 'closed', 'settled', 'voided']).optional(),
  flightNumber: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

// ============================================================================
// Routes
// ============================================================================

/** POST /api/v1/markets — Create a new prediction market */
predictionMarketRouter.post('/', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) throw new ValidationError('API key required');
    const input = CreateMarketSchema.parse(req.body);
    const market = await predictionMarketService.createMarket(req.apiKey.orgId, input);
    res.status(201).json({ data: market });
  } catch (error) { next(error); }
});

/** GET /api/v1/markets — List markets */
predictionMarketRouter.get('/', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) throw new ValidationError('API key required');
    const filters = ListMarketsSchema.parse(req.query);
    const result = await predictionMarketService.listMarkets(req.apiKey.orgId, filters);
    res.json({ data: result.data, count: result.count });
  } catch (error) { next(error); }
});

/** GET /api/v1/markets/:id — Get a single market */
predictionMarketRouter.get('/:id', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const market = await predictionMarketService.getMarket(req.params.id);
    if (!market) { res.status(404).json({ error: 'Market not found' }); return; }
    res.json({ data: market });
  } catch (error) { next(error); }
});

/** POST /api/v1/markets/bet — Place a bet on a market */
predictionMarketRouter.post('/bet', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) throw new ValidationError('API key required');
    const input = PlaceBetSchema.parse(req.body);
    const bet = await predictionMarketService.placeBet(req.apiKey.orgId, input);
    res.status(201).json({ data: bet });
  } catch (error) { next(error); }
});

/** POST /api/v1/markets/settle — Settle a market with oracle proof */
predictionMarketRouter.post('/settle', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) throw new ValidationError('API key required');
    const input = SettleMarketSchema.parse(req.body);
    const result = await predictionMarketService.settleMarket(req.apiKey.orgId, input);
    res.json({ data: result });
  } catch (error) { next(error); }
});

/** GET /api/v1/markets/:id/bets — List bets for a market */
predictionMarketRouter.get('/:id/bets', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const { partyId, outcome, limit, offset } = req.query;
    const result = await predictionMarketService.listBets(req.params.id, {
      partyId: partyId as string | undefined,
      outcome: outcome as predictionMarketService.MarketOutcome | undefined,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    });
    res.json({ data: result.data, count: result.count });
  } catch (error) { next(error); }
});
