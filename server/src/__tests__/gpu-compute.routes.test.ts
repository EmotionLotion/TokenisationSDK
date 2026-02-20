/**
 * GPU Compute Routes - Unit Tests
 *
 * Tests REST API route handlers for GPU compute node tokenization:
 * - POST /gpu-nodes (create node)
 * - GET /gpu-nodes (list with pagination)
 * - GET /gpu-nodes/:nodeId (single node, 404 handling)
 * - GET /gpu-nodes/:nodeId/metrics (IDOR ownership check)
 * - POST /gpu-nodes/:nodeId/revenue (Zod schema validation)
 * - POST /gpu-nodes/:nodeId/distribute (UUID format validation)
 * - GET /compute-market (marketplace listing)
 *
 * Mocks the gpu-compute.service module and Express request/response objects.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { gpuComputeRouter } from '../routes/gpu-compute.routes.js';

// ============================================================================
// Suppress logger output during tests
// ============================================================================

vi.mock('../middleware/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// ============================================================================
// Mock the GPU Compute Service
// ============================================================================

vi.mock('../services/gpu-compute.service.js', () => ({
  createGPUNode: vi.fn(),
  listGPUNodes: vi.fn(),
  getGPUNode: vi.fn(),
  updateGPUNode: vi.fn(),
  decommissionGPUNode: vi.fn(),
  requestVerification: vi.fn(),
  completeVerification: vi.fn(),
  tokenizeNode: vi.fn(),
  getNodeToken: vi.fn(),
  getNodeMetrics: vi.fn(),
  getNodeRevenue: vi.fn(),
  getNodeRevenueSummary: vi.fn(),
  recordRevenuePeriod: vi.fn(),
  distributeRevenue: vi.fn(),
  getDistributions: vi.fn(),
  listComputeMarket: vi.fn(),
  getMarketAnalytics: vi.fn(),
}));

import * as gpuComputeService from '../services/gpu-compute.service.js';

// ============================================================================
// Helpers
// ============================================================================

const ORG_ID = 'org-test-001';
const OTHER_ORG_ID = 'org-test-002';
const NODE_ID = 'node-test-001';

/** Build a mock Express request object. */
function mockRequest(overrides: Record<string, any> = {}): any {
  return {
    body: {},
    params: {},
    query: {},
    apiKey: { orgId: ORG_ID, scopes: ['*'], keyId: 'key-test-001' },
    ...overrides,
  };
}

/** Build a mock Express response object with chained status/json. */
function mockResponse(): any {
  const res: any = {
    statusCode: 200,
    jsonData: null,
  };
  res.status = vi.fn((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = vi.fn((data: any) => {
    res.jsonData = data;
    return res;
  });
  return res;
}

/** Build a mock next function that captures errors. */
function mockNext(): any {
  const fn: any = vi.fn();
  return fn;
}

/**
 * Find a route handler registered on the router for a specific method and path.
 * Express Router stores routes in router.stack.
 */
function findRouteHandler(method: string, path: string): Function | null {
  const stack = (gpuComputeRouter as any).stack;
  for (const layer of stack) {
    if (layer.route) {
      const routePath = layer.route.path;
      const routeMethod = Object.keys(layer.route.methods)[0];
      if (routeMethod === method.toLowerCase() && routePath === path) {
        // Return the last handler (the actual async handler, not middleware)
        const handlers = layer.route.stack;
        return handlers[handlers.length - 1].handle;
      }
    }
  }
  return null;
}

/** Sample valid node creation payload. */
function validCreateNodeBody() {
  return {
    gpuModel: 'H100',
    gpuCount: 8,
    vramPerGpuGB: 80,
    interconnect: 'NVLink',
    datacenterName: 'DC-Alpha',
    datacenterTier: 3,
    datacenterLocation: 'Dubai, UAE',
    acquisitionCostUsd: '250000.00',
    acquisitionDate: '2025-01-15',
    estimatedUsefulLifeMonths: 60,
  };
}

/** Sample GPU node object returned by service. */
function sampleNode(overrides: Record<string, any> = {}) {
  return {
    id: NODE_ID,
    orgId: ORG_ID,
    gpuModel: 'H100',
    gpuCount: 8,
    vramPerGpuGB: 80,
    totalVramGB: 640,
    interconnect: 'NVLink',
    datacenterName: 'DC-Alpha',
    datacenterTier: 3,
    datacenterLocation: 'Dubai, UAE',
    acquisitionCostUsd: '250000.00',
    status: 'registered',
    verified: false,
    createdAt: '2025-01-15T00:00:00.000Z',
    updatedAt: '2025-01-15T00:00:00.000Z',
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('GPU Compute Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --------------------------------------------------------------------------
  // POST /gpu-nodes
  // --------------------------------------------------------------------------
  describe('POST /gpu-nodes', () => {
    it('creates a node and returns 201', async () => {
      const handler = findRouteHandler('post', '/gpu-nodes');
      expect(handler).not.toBeNull();

      const created = sampleNode();
      (gpuComputeService.createGPUNode as any).mockResolvedValue(created);

      const req = mockRequest({ body: validCreateNodeBody() });
      const res = mockResponse();
      const next = mockNext();

      await handler!(req, res, next);

      expect(gpuComputeService.createGPUNode).toHaveBeenCalledWith(ORG_ID, expect.objectContaining({
        gpuModel: 'H100',
        gpuCount: 8,
        vramPerGpuGB: 80,
      }));
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.jsonData).toEqual({ success: true, data: created });
    });

    it('calls next with ValidationError on invalid Zod payload', async () => {
      const handler = findRouteHandler('post', '/gpu-nodes');

      const req = mockRequest({ body: { gpuModel: 'INVALID_MODEL' } });
      const res = mockResponse();
      const next = mockNext();

      await handler!(req, res, next);

      expect(next).toHaveBeenCalled();
      const error = next.mock.calls[0][0];
      expect(error).toBeDefined();
      expect(error.message).toBeDefined();
    });

    it('calls next with ValidationError when gpuCount is missing', async () => {
      const handler = findRouteHandler('post', '/gpu-nodes');

      const body = { ...validCreateNodeBody() };
      delete (body as any).gpuCount;

      const req = mockRequest({ body });
      const res = mockResponse();
      const next = mockNext();

      await handler!(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('passes orgId from apiKey to service', async () => {
      const handler = findRouteHandler('post', '/gpu-nodes');

      (gpuComputeService.createGPUNode as any).mockResolvedValue(sampleNode());

      const req = mockRequest({
        body: validCreateNodeBody(),
        apiKey: { orgId: 'custom-org-42', scopes: ['*'], keyId: 'k1' },
      });
      const res = mockResponse();
      const next = mockNext();

      await handler!(req, res, next);

      expect(gpuComputeService.createGPUNode).toHaveBeenCalledWith('custom-org-42', expect.any(Object));
    });
  });

  // --------------------------------------------------------------------------
  // GET /gpu-nodes
  // --------------------------------------------------------------------------
  describe('GET /gpu-nodes', () => {
    it('lists nodes with default pagination', async () => {
      const handler = findRouteHandler('get', '/gpu-nodes');
      expect(handler).not.toBeNull();

      const listResult = { data: [sampleNode()], total: 1, page: 1, limit: 20 };
      (gpuComputeService.listGPUNodes as any).mockResolvedValue(listResult);

      const req = mockRequest({ query: {} });
      const res = mockResponse();
      const next = mockNext();

      await handler!(req, res, next);

      expect(gpuComputeService.listGPUNodes).toHaveBeenCalledWith(ORG_ID, expect.objectContaining({
        page: 1,
        limit: 20,
      }));
      expect(res.jsonData).toEqual({ success: true, ...listResult });
    });

    it('respects page and limit query params', async () => {
      const handler = findRouteHandler('get', '/gpu-nodes');

      const listResult = { data: [], total: 0, page: 3, limit: 10 };
      (gpuComputeService.listGPUNodes as any).mockResolvedValue(listResult);

      const req = mockRequest({ query: { page: '3', limit: '10' } });
      const res = mockResponse();
      const next = mockNext();

      await handler!(req, res, next);

      expect(gpuComputeService.listGPUNodes).toHaveBeenCalledWith(ORG_ID, expect.objectContaining({
        page: 3,
        limit: 10,
      }));
    });

    it('passes filter parameters to the service', async () => {
      const handler = findRouteHandler('get', '/gpu-nodes');

      (gpuComputeService.listGPUNodes as any).mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 });

      const req = mockRequest({ query: { status: 'active', gpuModel: 'H100', datacenterTier: '3' } });
      const res = mockResponse();
      const next = mockNext();

      await handler!(req, res, next);

      expect(gpuComputeService.listGPUNodes).toHaveBeenCalledWith(ORG_ID, expect.objectContaining({
        status: 'active',
        gpuModel: 'H100',
        datacenterTier: 3,
      }));
    });
  });

  // --------------------------------------------------------------------------
  // GET /gpu-nodes/:nodeId
  // --------------------------------------------------------------------------
  describe('GET /gpu-nodes/:nodeId', () => {
    it('returns 404 for non-existent node', async () => {
      const handler = findRouteHandler('get', '/gpu-nodes/:nodeId');
      expect(handler).not.toBeNull();

      (gpuComputeService.getGPUNode as any).mockResolvedValue(null);

      const req = mockRequest({ params: { nodeId: 'non-existent-id' } });
      const res = mockResponse();
      const next = mockNext();

      await handler!(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.jsonData).toEqual({ success: false, error: 'Node not found' });
    });

    it('returns the node when it exists', async () => {
      const handler = findRouteHandler('get', '/gpu-nodes/:nodeId');

      const node = sampleNode();
      (gpuComputeService.getGPUNode as any).mockResolvedValue(node);

      const req = mockRequest({ params: { nodeId: NODE_ID } });
      const res = mockResponse();
      const next = mockNext();

      await handler!(req, res, next);

      expect(gpuComputeService.getGPUNode).toHaveBeenCalledWith(ORG_ID, NODE_ID);
      expect(res.jsonData).toEqual({ success: true, data: node });
    });

    it('passes orgId to getGPUNode for ownership scoping', async () => {
      const handler = findRouteHandler('get', '/gpu-nodes/:nodeId');

      (gpuComputeService.getGPUNode as any).mockResolvedValue(null);

      const req = mockRequest({
        params: { nodeId: NODE_ID },
        apiKey: { orgId: OTHER_ORG_ID, scopes: ['*'], keyId: 'k2' },
      });
      const res = mockResponse();
      const next = mockNext();

      await handler!(req, res, next);

      expect(gpuComputeService.getGPUNode).toHaveBeenCalledWith(OTHER_ORG_ID, NODE_ID);
      // Since getGPUNode filters by orgId, another org's node returns null -> 404
      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  // --------------------------------------------------------------------------
  // GET /gpu-nodes/:nodeId/metrics (IDOR fix test)
  // --------------------------------------------------------------------------
  describe('GET /gpu-nodes/:nodeId/metrics', () => {
    it('verifies node ownership before returning metrics', async () => {
      const handler = findRouteHandler('get', '/gpu-nodes/:nodeId/metrics');
      expect(handler).not.toBeNull();

      const node = sampleNode();
      const metricsData = [
        { id: 'm1', nodeId: NODE_ID, utilizationPercent: '85', isOnline: true, recordedAt: '2025-01-20T00:00:00Z' },
      ];

      (gpuComputeService.getGPUNode as any).mockResolvedValue(node);
      (gpuComputeService.getNodeMetrics as any).mockResolvedValue(metricsData);

      const req = mockRequest({ params: { nodeId: NODE_ID } });
      const res = mockResponse();
      const next = mockNext();

      await handler!(req, res, next);

      // getGPUNode should be called first to verify ownership
      expect(gpuComputeService.getGPUNode).toHaveBeenCalledWith(ORG_ID, NODE_ID);
      expect(gpuComputeService.getNodeMetrics).toHaveBeenCalledWith(NODE_ID);
      expect(res.jsonData).toEqual({ success: true, data: metricsData });
    });

    it('returns 404 when node belongs to a different org (IDOR prevention)', async () => {
      const handler = findRouteHandler('get', '/gpu-nodes/:nodeId/metrics');

      // getGPUNode returns null when orgId does not match
      (gpuComputeService.getGPUNode as any).mockResolvedValue(null);

      const req = mockRequest({
        params: { nodeId: NODE_ID },
        apiKey: { orgId: OTHER_ORG_ID, scopes: ['*'], keyId: 'k2' },
      });
      const res = mockResponse();
      const next = mockNext();

      await handler!(req, res, next);

      expect(gpuComputeService.getGPUNode).toHaveBeenCalledWith(OTHER_ORG_ID, NODE_ID);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.jsonData).toEqual({ success: false, error: 'Node not found' });
      // getNodeMetrics should NOT have been called
      expect(gpuComputeService.getNodeMetrics).not.toHaveBeenCalled();
    });

    it('returns 404 for a completely non-existent node', async () => {
      const handler = findRouteHandler('get', '/gpu-nodes/:nodeId/metrics');

      (gpuComputeService.getGPUNode as any).mockResolvedValue(null);

      const req = mockRequest({ params: { nodeId: 'totally-fake-id' } });
      const res = mockResponse();
      const next = mockNext();

      await handler!(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(gpuComputeService.getNodeMetrics).not.toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // POST /gpu-nodes/:nodeId/revenue (Zod validation)
  // --------------------------------------------------------------------------
  describe('POST /gpu-nodes/:nodeId/revenue', () => {
    it('validates Zod schema for grossRevenueUsd (required)', async () => {
      const handler = findRouteHandler('post', '/gpu-nodes/:nodeId/revenue');
      expect(handler).not.toBeNull();

      const req = mockRequest({
        params: { nodeId: NODE_ID },
        body: {
          // missing grossRevenueUsd
          electricityCostUsd: '500.00',
          periodStart: '2025-01-01',
          periodEnd: '2025-01-31',
        },
      });
      const res = mockResponse();
      const next = mockNext();

      await handler!(req, res, next);

      expect(next).toHaveBeenCalled();
      const error = next.mock.calls[0][0];
      expect(error).toBeDefined();
    });

    it('validates Zod schema for electricityCostUsd (required)', async () => {
      const handler = findRouteHandler('post', '/gpu-nodes/:nodeId/revenue');

      const req = mockRequest({
        params: { nodeId: NODE_ID },
        body: {
          grossRevenueUsd: '5000.00',
          // missing electricityCostUsd
          periodStart: '2025-01-01',
          periodEnd: '2025-01-31',
        },
      });
      const res = mockResponse();
      const next = mockNext();

      await handler!(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('validates Zod schema for periodStart and periodEnd (required)', async () => {
      const handler = findRouteHandler('post', '/gpu-nodes/:nodeId/revenue');

      const req = mockRequest({
        params: { nodeId: NODE_ID },
        body: {
          grossRevenueUsd: '5000.00',
          electricityCostUsd: '500.00',
          // missing periodStart and periodEnd
        },
      });
      const res = mockResponse();
      const next = mockNext();

      await handler!(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('records revenue with a valid payload and returns 201', async () => {
      const handler = findRouteHandler('post', '/gpu-nodes/:nodeId/revenue');

      const revenuePeriod = {
        id: 'rev-001',
        orgId: ORG_ID,
        nodeId: NODE_ID,
        grossRevenueUsd: '5000.00',
        electricityCostUsd: '500.00',
        netRevenueUsd: '3735.00',
        periodStart: '2025-01-01',
        periodEnd: '2025-01-31',
        distributed: false,
      };
      (gpuComputeService.recordRevenuePeriod as any).mockResolvedValue(revenuePeriod);

      const req = mockRequest({
        params: { nodeId: NODE_ID },
        body: {
          grossRevenueUsd: '5000.00',
          electricityCostUsd: '500.00',
          periodStart: '2025-01-01',
          periodEnd: '2025-01-31',
        },
      });
      const res = mockResponse();
      const next = mockNext();

      await handler!(req, res, next);

      expect(gpuComputeService.recordRevenuePeriod).toHaveBeenCalledWith(ORG_ID, NODE_ID, expect.objectContaining({
        grossRevenueUsd: '5000.00',
        electricityCostUsd: '500.00',
      }));
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.jsonData).toEqual({ success: true, data: revenuePeriod });
    });

    it('accepts optional hoursRented and avgUtilizationPercent', async () => {
      const handler = findRouteHandler('post', '/gpu-nodes/:nodeId/revenue');

      (gpuComputeService.recordRevenuePeriod as any).mockResolvedValue({ id: 'rev-002' });

      const req = mockRequest({
        params: { nodeId: NODE_ID },
        body: {
          grossRevenueUsd: '5000.00',
          electricityCostUsd: '500.00',
          periodStart: '2025-01-01',
          periodEnd: '2025-01-31',
          hoursRented: '720',
          avgUtilizationPercent: '85.5',
        },
      });
      const res = mockResponse();
      const next = mockNext();

      await handler!(req, res, next);

      expect(gpuComputeService.recordRevenuePeriod).toHaveBeenCalledWith(ORG_ID, NODE_ID, expect.objectContaining({
        hoursRented: '720',
        avgUtilizationPercent: '85.5',
      }));
      expect(res.status).toHaveBeenCalledWith(201);
    });
  });

  // --------------------------------------------------------------------------
  // POST /gpu-nodes/:nodeId/distribute (UUID validation)
  // --------------------------------------------------------------------------
  describe('POST /gpu-nodes/:nodeId/distribute', () => {
    it('validates revenuePeriodId is a valid UUID', async () => {
      const handler = findRouteHandler('post', '/gpu-nodes/:nodeId/distribute');
      expect(handler).not.toBeNull();

      const req = mockRequest({
        params: { nodeId: NODE_ID },
        body: { revenuePeriodId: 'not-a-uuid' },
      });
      const res = mockResponse();
      const next = mockNext();

      await handler!(req, res, next);

      expect(next).toHaveBeenCalled();
      const error = next.mock.calls[0][0];
      expect(error).toBeDefined();
    });

    it('rejects when revenuePeriodId is missing', async () => {
      const handler = findRouteHandler('post', '/gpu-nodes/:nodeId/distribute');

      const req = mockRequest({
        params: { nodeId: NODE_ID },
        body: {},
      });
      const res = mockResponse();
      const next = mockNext();

      await handler!(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('distributes revenue with a valid UUID', async () => {
      const handler = findRouteHandler('post', '/gpu-nodes/:nodeId/distribute');

      const validUuid = '550e8400-e29b-41d4-a716-446655440000';
      const distribution = {
        id: 'dist-001',
        orgId: ORG_ID,
        nodeId: NODE_ID,
        revenuePeriodId: validUuid,
        totalDistributed: '3735.00',
        distributionMethod: 'pro_rata',
        status: 'completed',
      };
      (gpuComputeService.distributeRevenue as any).mockResolvedValue(distribution);

      const req = mockRequest({
        params: { nodeId: NODE_ID },
        body: { revenuePeriodId: validUuid },
      });
      const res = mockResponse();
      const next = mockNext();

      await handler!(req, res, next);

      expect(gpuComputeService.distributeRevenue).toHaveBeenCalledWith(ORG_ID, NODE_ID, validUuid);
      expect(res.jsonData).toEqual({ success: true, data: distribution });
    });

    it('returns 400 when period not found or already distributed', async () => {
      const handler = findRouteHandler('post', '/gpu-nodes/:nodeId/distribute');

      const validUuid = '550e8400-e29b-41d4-a716-446655440000';
      (gpuComputeService.distributeRevenue as any).mockResolvedValue(null);

      const req = mockRequest({
        params: { nodeId: NODE_ID },
        body: { revenuePeriodId: validUuid },
      });
      const res = mockResponse();
      const next = mockNext();

      await handler!(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.jsonData).toEqual({ success: false, error: 'Period not found or already distributed' });
    });
  });

  // --------------------------------------------------------------------------
  // GET /compute-market
  // --------------------------------------------------------------------------
  describe('GET /compute-market', () => {
    it('returns marketplace listings with default pagination', async () => {
      const handler = findRouteHandler('get', '/compute-market');
      expect(handler).not.toBeNull();

      const marketResult = {
        data: [
          {
            id: 'listing-001',
            nodeId: NODE_ID,
            tokenSymbol: 'GPU1',
            tokenName: 'GPU Node Alpha',
            pricePerToken: '25.00',
            annualizedYieldPercent: '12.50',
            isActive: true,
            node: sampleNode({ status: 'active', verified: true }),
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
      };
      (gpuComputeService.listComputeMarket as any).mockResolvedValue(marketResult);

      const req = mockRequest({ query: {} });
      const res = mockResponse();
      const next = mockNext();

      await handler!(req, res, next);

      expect(gpuComputeService.listComputeMarket).toHaveBeenCalledWith(expect.objectContaining({
        page: 1,
        limit: 20,
      }));
      expect(res.jsonData).toEqual({ success: true, ...marketResult });
    });

    it('passes filter parameters from query to service', async () => {
      const handler = findRouteHandler('get', '/compute-market');

      (gpuComputeService.listComputeMarket as any).mockResolvedValue({ data: [], total: 0, page: 1, limit: 10 });

      const req = mockRequest({
        query: {
          gpuModel: 'A100',
          minYield: '10',
          maxPrice: '50',
          datacenterTier: '4',
          sort: 'yield',
          page: '2',
          limit: '10',
        },
      });
      const res = mockResponse();
      const next = mockNext();

      await handler!(req, res, next);

      expect(gpuComputeService.listComputeMarket).toHaveBeenCalledWith(expect.objectContaining({
        gpuModel: 'A100',
        minYield: 10,
        maxPrice: 50,
        datacenterTier: 4,
        sort: 'yield',
        page: 2,
        limit: 10,
      }));
    });

    it('returns empty data array when no listings exist', async () => {
      const handler = findRouteHandler('get', '/compute-market');

      const emptyResult = { data: [], total: 0, page: 1, limit: 20 };
      (gpuComputeService.listComputeMarket as any).mockResolvedValue(emptyResult);

      const req = mockRequest({ query: {} });
      const res = mockResponse();
      const next = mockNext();

      await handler!(req, res, next);

      expect(res.jsonData.data).toEqual([]);
      expect(res.jsonData.total).toBe(0);
    });
  });
});
