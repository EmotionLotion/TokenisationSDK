/**
 * External Data Sources API Routes
 *
 * Manage and query external data feeds (price oracles, NAV providers, etc.)
 */

import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ValidationError } from '../middleware/errorHandler.js';
import { apiKeyMiddleware, type ApiKeyRequest } from '../middleware/auth.js';
import * as datasourcesService from '../services/datasources.service.js';

export const datasourcesRouter = Router();

// ============================================================================
// Schemas
// ============================================================================

const registerDataSourceSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.enum(['chainlink', 'pyth', 'custom_oracle', 'nav_provider', 'market_data', 'webhook']),
  endpoint: z.string().url(),
  credentials: z.object({
    apiKey: z.string().optional(),
    secret: z.string().optional(),
    headers: z.record(z.string()).optional(),
  }).optional(),
  pollingInterval: z.number().int().positive().optional(),
  transformConfig: z.record(z.unknown()).optional(),
});

const fetchChainlinkSchema = z.object({
  chainId: z.number().int().positive(),
  aggregatorAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  rpcUrl: z.string().url(),
});

const fetchPythSchema = z.object({
  priceFeedId: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  hermesUrl: z.string().url().optional(),
});

const webhookPayloadSchema = z.object({
  id: z.string().optional(),
  type: z.string().min(1),
  timestamp: z.string().datetime().optional(),
  data: z.record(z.unknown()),
});

// ============================================================================
// Data Source Management Endpoints
// ============================================================================

/**
 * @openapi
 * /api/v1/datasources:
 *   post:
 *     tags: [Data Sources]
 *     summary: Register a new data source
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, type, endpoint]
 *             properties:
 *               name: { type: string }
 *               type: { type: string, enum: [chainlink, pyth, custom_oracle, nav_provider, market_data, webhook] }
 *               endpoint: { type: string, format: uri }
 */
datasourcesRouter.post(
  '/',
  apiKeyMiddleware,
  async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.apiKey) throw new ValidationError('API key required');

      const input = registerDataSourceSchema.parse(req.body);

      const source = datasourcesService.registerDataSource({
        ...input,
        orgId: req.apiKey.orgId,
        status: 'active',
      });

      res.status(201).json(source);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @openapi
 * /api/v1/datasources:
 *   get:
 *     tags: [Data Sources]
 *     summary: List data sources
 *     parameters:
 *       - name: type
 *         in: query
 *         schema: { type: string }
 *       - name: status
 *         in: query
 *         schema: { type: string }
 */
datasourcesRouter.get(
  '/',
  apiKeyMiddleware,
  async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.apiKey) throw new ValidationError('API key required');

      const sources = datasourcesService.listDataSources(req.apiKey.orgId, {
        type: req.query.type as datasourcesService.DataSourceType | undefined,
        status: req.query.status as datasourcesService.DataSourceStatus | undefined,
      });

      res.json({
        data: sources,
        count: sources.length,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @openapi
 * /api/v1/datasources/{id}:
 *   get:
 *     tags: [Data Sources]
 *     summary: Get data source details
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string }
 */
datasourcesRouter.get(
  '/:id',
  apiKeyMiddleware,
  async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.apiKey) throw new ValidationError('API key required');

      const source = datasourcesService.getDataSource(req.params.id);
      if (!source || source.orgId !== req.apiKey.orgId) {
        return res.status(404).json({ error: 'Data source not found' });
      }

      res.json(source);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @openapi
 * /api/v1/datasources/{id}:
 *   delete:
 *     tags: [Data Sources]
 *     summary: Delete a data source
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string }
 */
datasourcesRouter.delete(
  '/:id',
  apiKeyMiddleware,
  async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.apiKey) throw new ValidationError('API key required');

      const source = datasourcesService.getDataSource(req.params.id);
      if (!source || source.orgId !== req.apiKey.orgId) {
        return res.status(404).json({ error: 'Data source not found' });
      }

      datasourcesService.deleteDataSource(req.params.id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);

// ============================================================================
// Price Feed Endpoints
// ============================================================================

/**
 * @openapi
 * /api/v1/datasources/prices/chainlink:
 *   post:
 *     tags: [Data Sources]
 *     summary: Fetch price from Chainlink aggregator
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [chainId, aggregatorAddress, rpcUrl]
 *             properties:
 *               chainId: { type: integer }
 *               aggregatorAddress: { type: string }
 *               rpcUrl: { type: string, format: uri }
 */
datasourcesRouter.post(
  '/prices/chainlink',
  apiKeyMiddleware,
  async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.apiKey) throw new ValidationError('API key required');

      const input = fetchChainlinkSchema.parse(req.body);

      const result = await datasourcesService.fetchChainlinkPrice(
        input.chainId,
        input.aggregatorAddress,
        input.rpcUrl
      );

      if (!result.success) {
        return res.status(500).json({
          error: result.error,
          latencyMs: result.latencyMs,
        });
      }

      // Cache the price data
      if (result.data) {
        datasourcesService.cachePriceData(result.data);
      }

      res.json({
        data: result.data,
        latencyMs: result.latencyMs,
        fetchedAt: result.fetchedAt,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @openapi
 * /api/v1/datasources/prices/pyth:
 *   post:
 *     tags: [Data Sources]
 *     summary: Fetch price from Pyth Network
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [priceFeedId]
 *             properties:
 *               priceFeedId: { type: string }
 *               hermesUrl: { type: string, format: uri }
 */
datasourcesRouter.post(
  '/prices/pyth',
  apiKeyMiddleware,
  async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.apiKey) throw new ValidationError('API key required');

      const input = fetchPythSchema.parse(req.body);

      const result = await datasourcesService.fetchPythPrice(
        input.priceFeedId,
        input.hermesUrl
      );

      if (!result.success) {
        return res.status(500).json({
          error: result.error,
          latencyMs: result.latencyMs,
        });
      }

      // Cache the price data
      if (result.data) {
        datasourcesService.cachePriceData(result.data);
      }

      res.json({
        data: result.data,
        latencyMs: result.latencyMs,
        fetchedAt: result.fetchedAt,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @openapi
 * /api/v1/datasources/prices/cache:
 *   get:
 *     tags: [Data Sources]
 *     summary: Get cached prices for an asset
 *     parameters:
 *       - name: asset
 *         in: query
 *         required: true
 *         schema: { type: string }
 *       - name: baseCurrency
 *         in: query
 *         schema: { type: string }
 *       - name: since
 *         in: query
 *         schema: { type: string, format: date-time }
 */
datasourcesRouter.get(
  '/prices/cache',
  apiKeyMiddleware,
  async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.apiKey) throw new ValidationError('API key required');

      const asset = z.string().min(1).parse(req.query.asset);
      const baseCurrency = (req.query.baseCurrency as string) || 'USD';
      const since = req.query.since ? new Date(req.query.since as string) : undefined;

      const prices = datasourcesService.getCachedPrices(asset, baseCurrency, since);

      res.json({
        data: prices,
        count: prices.length,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @openapi
 * /api/v1/datasources/prices/latest:
 *   get:
 *     tags: [Data Sources]
 *     summary: Get latest cached price for an asset
 *     parameters:
 *       - name: asset
 *         in: query
 *         required: true
 *         schema: { type: string }
 *       - name: baseCurrency
 *         in: query
 *         schema: { type: string }
 */
datasourcesRouter.get(
  '/prices/latest',
  apiKeyMiddleware,
  async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.apiKey) throw new ValidationError('API key required');

      const asset = z.string().min(1).parse(req.query.asset);
      const baseCurrency = (req.query.baseCurrency as string) || 'USD';

      const price = datasourcesService.getLatestCachedPrice(asset, baseCurrency);

      if (!price) {
        return res.status(404).json({ error: 'No cached price found' });
      }

      res.json(price);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @openapi
 * /api/v1/datasources/prices/aggregate:
 *   get:
 *     tags: [Data Sources]
 *     summary: Get aggregated prices from multiple sources
 *     parameters:
 *       - name: asset
 *         in: query
 *         required: true
 *         schema: { type: string }
 *       - name: baseCurrency
 *         in: query
 *         schema: { type: string }
 */
datasourcesRouter.get(
  '/prices/aggregate',
  apiKeyMiddleware,
  async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.apiKey) throw new ValidationError('API key required');

      const asset = z.string().min(1).parse(req.query.asset);
      const baseCurrency = (req.query.baseCurrency as string) || 'USD';

      // Get prices from last 5 minutes
      const since = new Date(Date.now() - 5 * 60 * 1000);
      const prices = datasourcesService.getCachedPrices(asset, baseCurrency, since);

      if (prices.length === 0) {
        return res.status(404).json({ error: 'No prices available for aggregation' });
      }

      const aggregated = datasourcesService.aggregatePrices(prices);

      res.json({
        asset,
        baseCurrency,
        ...aggregated,
        timestamp: new Date(),
      });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================================================
// NAV Data Endpoints
// ============================================================================

/**
 * @openapi
 * /api/v1/datasources/nav/{tokenId}:
 *   get:
 *     tags: [Data Sources]
 *     summary: Fetch NAV data for a token
 *     parameters:
 *       - name: tokenId
 *         in: path
 *         required: true
 *         schema: { type: string }
 *       - name: sourceId
 *         in: query
 *         required: true
 *         schema: { type: string }
 */
datasourcesRouter.get(
  '/nav/:tokenId',
  apiKeyMiddleware,
  async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.apiKey) throw new ValidationError('API key required');

      const sourceId = z.string().min(1).parse(req.query.sourceId);

      const source = datasourcesService.getDataSource(sourceId);
      if (!source || source.orgId !== req.apiKey.orgId) {
        return res.status(404).json({ error: 'Data source not found' });
      }

      if (source.type !== 'nav_provider') {
        return res.status(400).json({ error: 'Data source is not a NAV provider' });
      }

      const result = await datasourcesService.fetchNAVData(source, req.params.tokenId);

      if (!result.success) {
        return res.status(500).json({
          error: result.error,
          latencyMs: result.latencyMs,
        });
      }

      res.json({
        data: result.data,
        latencyMs: result.latencyMs,
        fetchedAt: result.fetchedAt,
      });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================================================
// Webhook Endpoints
// ============================================================================

/**
 * @openapi
 * /api/v1/datasources/webhook/{sourceId}:
 *   post:
 *     tags: [Data Sources]
 *     summary: Receive webhook data from external source
 *     parameters:
 *       - name: sourceId
 *         in: path
 *         required: true
 *         schema: { type: string }
 */
datasourcesRouter.post(
  '/webhook/:sourceId',
  async (req, res, next) => {
    try {
      const signature = req.headers['x-signature'] as string | undefined ||
                        req.headers['x-webhook-signature'] as string | undefined;

      const payload = webhookPayloadSchema.parse(req.body);

      const event = await datasourcesService.processWebhook(
        req.params.sourceId,
        payload,
        signature
      );

      res.status(200).json({
        received: true,
        eventId: event.id,
      });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================================================
// Health Check Endpoints
// ============================================================================

/**
 * @openapi
 * /api/v1/datasources/health:
 *   get:
 *     tags: [Data Sources]
 *     summary: Check health of all data sources
 */
datasourcesRouter.get(
  '/health',
  apiKeyMiddleware,
  async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.apiKey) throw new ValidationError('API key required');

      const health = await datasourcesService.checkDataSourcesHealth(req.apiKey.orgId);

      const allHealthy = health.every((h) => h.healthy);

      res.json({
        overall: allHealthy ? 'healthy' : 'degraded',
        sources: health,
        checkedAt: new Date(),
      });
    } catch (error) {
      next(error);
    }
  }
);
