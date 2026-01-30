/**
 * Flight Oracle Routes
 *
 * REST API for real-time flight status monitoring via Chainlink CRE oracle.
 * Supports on-demand lookups, watch subscriptions, and CRE webhook callbacks.
 */

import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as flightOracleService from '../services/flight-oracle.service.js';
import { ValidationError } from '../middleware/errorHandler.js';
import { apiKeyMiddleware, type ApiKeyRequest } from '../middleware/auth.js';

export const flightOracleRouter = Router();

// ============================================================================
// Validation Schemas
// ============================================================================

const GetFlightStatusSchema = z.object({
  departureDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format'),
});

const WatchFlightSchema = z.object({
  flightNumber: z.string().min(2).max(16),
  departureDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format'),
  ticketId: z.string().uuid().optional(),
  callbackUrl: z.string().url().optional(),
});

const UnwatchQuerySchema = z.object({
  departureDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const CRECallbackSchema = z.object({
  type: z.literal('flight_status_update'),
  ticketId: z.string().nullable().optional(),
  data: z.object({
    flightNumber: z.string().min(2).max(16),
    status: z.enum(['scheduled', 'active', 'landed', 'cancelled', 'incident', 'diverted', 'unknown']),
    actualDeparture: z.string().nullable().optional(),
    actualArrival: z.string().nullable().optional(),
    delay: z.number().int().min(0).default(0),
    gate: z.string().nullable().optional(),
    terminal: z.string().nullable().optional(),
    cancelled: z.boolean().default(false),
  }),
  fetchedAt: z.string(),
  source: z.string(),
});

const ListWatchesSchema = z.object({
  status: z.enum(['active', 'paused', 'completed', 'cancelled']).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

// ============================================================================
// Routes
// ============================================================================

/**
 * GET /api/v1/flights/:flightNumber/status
 *
 * Get the current status of a flight. Returns cached data when fresh,
 * otherwise triggers a CRE oracle fetch.
 *
 * Query params:
 *   departureDate - required, YYYY-MM-DD
 */
flightOracleRouter.get(
  '/:flightNumber/status',
  apiKeyMiddleware,
  async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.apiKey) {
        throw new ValidationError('API key required');
      }

      const { departureDate } = GetFlightStatusSchema.parse(req.query);
      const flightNumber = req.params.flightNumber;

      if (!flightNumber || flightNumber.length < 2) {
        throw new ValidationError('Invalid flight number');
      }

      const result = await flightOracleService.getFlightStatus(flightNumber, departureDate);

      res.json({
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /api/v1/flights/watch
 *
 * Subscribe to flight status updates. The server will poll the CRE oracle
 * for this flight as departure approaches and trigger ticket transitions.
 *
 * Body:
 *   flightNumber  - required
 *   departureDate - required, YYYY-MM-DD
 *   ticketId      - optional UUID, links watch to a ticket
 *   callbackUrl   - optional URL for webhook notifications
 */
flightOracleRouter.post(
  '/watch',
  apiKeyMiddleware,
  async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.apiKey) {
        throw new ValidationError('API key required');
      }

      const body = WatchFlightSchema.parse(req.body);

      const watch = await flightOracleService.watchFlight({
        orgId: req.apiKey.orgId,
        flightNumber: body.flightNumber,
        departureDate: body.departureDate,
        ticketId: body.ticketId,
        callbackUrl: body.callbackUrl,
      });

      res.status(201).json({ data: watch });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * DELETE /api/v1/flights/:flightNumber/watch
 *
 * Unsubscribe from flight status updates.
 *
 * Query params:
 *   departureDate - optional, YYYY-MM-DD (narrows to specific date)
 */
flightOracleRouter.delete(
  '/:flightNumber/watch',
  apiKeyMiddleware,
  async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.apiKey) {
        throw new ValidationError('API key required');
      }

      const { departureDate } = UnwatchQuerySchema.parse(req.query);
      const flightNumber = req.params.flightNumber;

      if (!flightNumber || flightNumber.length < 2) {
        throw new ValidationError('Invalid flight number');
      }

      const result = await flightOracleService.unwatchFlight(
        req.apiKey.orgId,
        flightNumber,
        departureDate,
      );

      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /api/v1/flights/callback
 *
 * Webhook endpoint called by the CRE workflow when flight status is fetched.
 * This is an internal endpoint — authenticated via a shared bearer token
 * rather than an org API key.
 */
flightOracleRouter.post(
  '/callback',
  async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    try {
      // Verify CRE callback token
      const authHeader = req.headers.authorization;
      const expectedToken = process.env.CRE_CALLBACK_TOKEN;

      if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
        res.status(401).json({ error: 'Unauthorized: invalid callback token' });
        return;
      }

      const payload = CRECallbackSchema.parse(req.body);

      await flightOracleService.processCallback({
        type: payload.type,
        ticketId: payload.ticketId ?? null,
        data: {
          flightNumber: payload.data.flightNumber,
          status: payload.data.status,
          actualDeparture: payload.data.actualDeparture ?? null,
          actualArrival: payload.data.actualArrival ?? null,
          delay: payload.data.delay,
          gate: payload.data.gate ?? null,
          terminal: payload.data.terminal ?? null,
          cancelled: payload.data.cancelled,
        },
        fetchedAt: payload.fetchedAt,
        source: payload.source,
      });

      res.json({ status: 'ok' });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * GET /api/v1/flights/watches
 *
 * List active flight watches for the authenticated organisation.
 *
 * Query params:
 *   status - optional, filter by watch status
 *   limit  - optional, default 50, max 200
 *   offset - optional, default 0
 */
flightOracleRouter.get(
  '/watches',
  apiKeyMiddleware,
  async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.apiKey) {
        throw new ValidationError('API key required');
      }

      const params = ListWatchesSchema.parse(req.query);

      const result = await flightOracleService.listWatches(req.apiKey.orgId, {
        status: params.status as flightOracleService.FlightWatchStatus | undefined,
        limit: params.limit,
        offset: params.offset,
      });

      res.json({
        data: result.data,
        count: result.count,
      });
    } catch (error) {
      next(error);
    }
  },
);
