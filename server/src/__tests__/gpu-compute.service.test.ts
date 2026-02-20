/**
 * GPU Compute Service - Unit Tests
 *
 * Tests createGPUNode, getGPUNode, listGPUNodes (pagination/filters),
 * requestVerification/completeVerification workflow,
 * tokenizeNode, recordRevenuePeriod (cents-based arithmetic, overlap),
 * and distributeRevenue.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  createGPUNode,
  getGPUNode,
  listGPUNodes,
  requestVerification,
  completeVerification,
  tokenizeNode,
  recordRevenuePeriod,
  distributeRevenue,
} from '../services/gpu-compute.service.js';

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
// Helpers
// ============================================================================

let orgCounter = 0;
function uniqueOrgId(): string {
  return `org-gpu-${Date.now()}-${++orgCounter}`;
}

/** Create a GPU node with reasonable defaults for testing. */
async function createTestNode(orgId: string, overrides: Record<string, unknown> = {}) {
  return createGPUNode(orgId, {
    gpuModel: 'NVIDIA H100',
    gpuCount: 8,
    vramPerGpuGB: 80,
    interconnect: 'NVLink',
    datacenterName: 'Equinix DC1',
    datacenterTier: 3,
    datacenterLocation: 'US-East',
    acquisitionCostUsd: '250000.00',
    acquisitionDate: '2024-06-15T00:00:00Z',
    estimatedUsefulLifeMonths: 60,
    ...overrides,
  });
}

// ============================================================================
// Tests
// ============================================================================

describe('GPU Compute Service', () => {
  // --------------------------------------------------------------------------
  // createGPUNode
  // --------------------------------------------------------------------------
  describe('createGPUNode', () => {
    it('creates node with correct data', async () => {
      const orgId = uniqueOrgId();

      const node = await createTestNode(orgId);

      expect(node).toBeDefined();
      expect(node.id).toBeDefined();
      expect(node.orgId).toBe(orgId);
      expect(node.gpuModel).toBe('NVIDIA H100');
      expect(node.gpuCount).toBe(8);
      expect(node.vramPerGpuGB).toBe(80);
      // totalVramGB = gpuCount * vramPerGpuGB
      expect(node.totalVramGB).toBe(640);
      expect(node.interconnect).toBe('NVLink');
      expect(node.datacenterName).toBe('Equinix DC1');
      expect(node.datacenterTier).toBe(3);
      expect(node.datacenterLocation).toBe('US-East');
      expect(node.status).toBe('registered');
    });

    it('sets verified to false by default', async () => {
      const orgId = uniqueOrgId();
      const node = await createTestNode(orgId);

      // SQLite stores boolean as 0/1
      expect(node.verified === false || node.verified === (0 as any)).toBe(true);
    });

    it('stores optional fields as null when not provided', async () => {
      const orgId = uniqueOrgId();
      const node = await createTestNode(orgId);

      expect(node.cpuModel).toBeNull();
      expect(node.ramGB).toBeNull();
      expect(node.storageTB).toBeNull();
      expect(node.vastMachineId).toBeNull();
    });

    it('stores optional fields when provided', async () => {
      const orgId = uniqueOrgId();
      const node = await createTestNode(orgId, {
        cpuModel: 'AMD EPYC 7763',
        ramGB: 1024,
        storageTB: 10,
        networkBandwidthGbps: 100,
        tdpWatts: 700,
        benchmarkScore: 95000,
      });

      expect(node.cpuModel).toBe('AMD EPYC 7763');
      expect(node.ramGB).toBe(1024);
      expect(node.storageTB).toBe(10);
    });
  });

  // --------------------------------------------------------------------------
  // getGPUNode
  // --------------------------------------------------------------------------
  describe('getGPUNode', () => {
    it('returns null for non-existent node', async () => {
      const orgId = uniqueOrgId();
      const result = await getGPUNode(orgId, 'non-existent-node-id');
      expect(result).toBeNull();
    });

    it('returns the created node', async () => {
      const orgId = uniqueOrgId();
      const created = await createTestNode(orgId);

      const fetched = await getGPUNode(orgId, created.id);
      expect(fetched).not.toBeNull();
      expect(fetched!.id).toBe(created.id);
      expect(fetched!.gpuModel).toBe('NVIDIA H100');
    });

    it('returns null when orgId does not match', async () => {
      const orgId = uniqueOrgId();
      const otherOrgId = uniqueOrgId();
      const created = await createTestNode(orgId);

      const result = await getGPUNode(otherOrgId, created.id);
      expect(result).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // listGPUNodes
  // --------------------------------------------------------------------------
  describe('listGPUNodes', () => {
    it('returns paginated results with correct metadata', async () => {
      const orgId = uniqueOrgId();

      // Create 5 nodes
      for (let i = 0; i < 5; i++) {
        await createTestNode(orgId, { gpuModel: `GPU-${i}` });
      }

      const result = await listGPUNodes(orgId, { page: 1, limit: 3 });
      expect(result.data).toHaveLength(3);
      expect(result.total).toBe(5);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(3);
    });

    it('returns second page correctly', async () => {
      const orgId = uniqueOrgId();

      for (let i = 0; i < 5; i++) {
        await createTestNode(orgId, { gpuModel: `GPU-Page-${i}` });
      }

      const result = await listGPUNodes(orgId, { page: 2, limit: 3 });
      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(5);
      expect(result.page).toBe(2);
    });

    it('filters by gpuModel', async () => {
      const orgId = uniqueOrgId();

      await createTestNode(orgId, { gpuModel: 'NVIDIA A100' });
      await createTestNode(orgId, { gpuModel: 'NVIDIA H100' });
      await createTestNode(orgId, { gpuModel: 'NVIDIA A100' });

      const result = await listGPUNodes(orgId, { gpuModel: 'NVIDIA A100' });
      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
      for (const node of result.data) {
        expect(node.gpuModel).toBe('NVIDIA A100');
      }
    });

    it('filters by status', async () => {
      const orgId = uniqueOrgId();

      const node1 = await createTestNode(orgId);
      await createTestNode(orgId);

      // Put one through verification
      await requestVerification(orgId, node1.id);

      const pending = await listGPUNodes(orgId, { status: 'pending_verification' });
      expect(pending.data).toHaveLength(1);
      expect(pending.data[0].id).toBe(node1.id);

      const registered = await listGPUNodes(orgId, { status: 'registered' });
      expect(registered.data).toHaveLength(1);
    });

    it('does not return nodes from other orgs', async () => {
      const orgA = uniqueOrgId();
      const orgB = uniqueOrgId();

      await createTestNode(orgA);
      await createTestNode(orgB);

      const result = await listGPUNodes(orgA);
      expect(result.total).toBe(1);
    });

    it('returns empty list for org with no nodes', async () => {
      const orgId = uniqueOrgId();
      const result = await listGPUNodes(orgId);
      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // Verification workflow
  // --------------------------------------------------------------------------
  describe('requestVerification / completeVerification', () => {
    it('requestVerification sets status to pending_verification', async () => {
      const orgId = uniqueOrgId();
      const node = await createTestNode(orgId);

      const updated = await requestVerification(orgId, node.id);
      expect(updated).not.toBeNull();
      expect(updated!.status).toBe('pending_verification');
    });

    it('completeVerification with passed=true sets verified status', async () => {
      const orgId = uniqueOrgId();
      const node = await createTestNode(orgId);

      await requestVerification(orgId, node.id);
      const verified = await completeVerification(orgId, node.id, true);

      expect(verified).not.toBeNull();
      expect(verified!.status).toBe('verified');
      // SQLite stores boolean as 0/1
      expect(verified!.verified === true || verified!.verified === (1 as any)).toBe(true);
    });

    it('completeVerification with passed=false reverts to registered', async () => {
      const orgId = uniqueOrgId();
      const node = await createTestNode(orgId);

      await requestVerification(orgId, node.id);
      const result = await completeVerification(orgId, node.id, false);

      expect(result).not.toBeNull();
      expect(result!.status).toBe('registered');
      expect(result!.verified === false || result!.verified === (0 as any)).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // tokenizeNode
  // --------------------------------------------------------------------------
  describe('tokenizeNode', () => {
    it('creates marketplace listing', async () => {
      const orgId = uniqueOrgId();
      const node = await createTestNode(orgId);

      const listing = await tokenizeNode(orgId, node.id, {
        tokenSymbol: 'GPU1',
        tokenName: 'GPU Node Token 1',
        totalSupply: '10000',
        pricePerToken: '25.00',
      });

      expect(listing).toBeDefined();
      expect(listing.id).toBeDefined();
      expect(listing.orgId).toBe(orgId);
      expect(listing.nodeId).toBe(node.id);
      expect(listing.tokenSymbol).toBe('GPU1');
      expect(listing.tokenName).toBe('GPU Node Token 1');
      expect(listing.totalSupply).toBe('10000');
      expect(listing.pricePerToken).toBe('25.00');
    });

    it('sets node status to active', async () => {
      const orgId = uniqueOrgId();
      const node = await createTestNode(orgId);

      await tokenizeNode(orgId, node.id, {
        tokenSymbol: `TKN${Date.now()}`,
        tokenName: 'Test Token',
        totalSupply: '1000',
        pricePerToken: '10.00',
      });

      const updated = await getGPUNode(orgId, node.id);
      expect(updated).not.toBeNull();
      expect(updated!.status).toBe('active');
    });
  });

  // --------------------------------------------------------------------------
  // recordRevenuePeriod
  // --------------------------------------------------------------------------
  describe('recordRevenuePeriod', () => {
    it('records revenue with cents-based arithmetic (no floating point errors)', async () => {
      const orgId = uniqueOrgId();
      const node = await createTestNode(orgId);

      const period = await recordRevenuePeriod(orgId, node.id, {
        grossRevenueUsd: '1000.00',
        electricityCostUsd: '100.00',
        periodStart: '2024-01-01T00:00:00Z',
        periodEnd: '2024-01-31T23:59:59Z',
      });

      expect(period).toBeDefined();
      expect(period.grossRevenueUsd).toBe('1000.00');
      expect(period.electricityCostUsd).toBe('100.00');

      // After electricity: $900.00
      // Platform fee (10%): $90.00
      // Maintenance (5%): $45.00
      // Insurance (2%): $18.00
      // Net: 900 - 90 - 45 - 18 = $747.00
      expect(period.platformFeeUsd).toBe('90.00');
      expect(period.maintenanceReserveUsd).toBe('45.00');
      expect(period.insuranceCostUsd).toBe('18.00');
      expect(period.netRevenueUsd).toBe('747.00');
    });

    it('handles small amounts without floating point errors', async () => {
      const orgId = uniqueOrgId();
      const node = await createTestNode(orgId);

      const period = await recordRevenuePeriod(orgId, node.id, {
        grossRevenueUsd: '10.01',
        electricityCostUsd: '1.01',
        periodStart: '2024-02-01T00:00:00Z',
        periodEnd: '2024-02-29T23:59:59Z',
      });

      // After electricity: 10.01 - 1.01 = 9.00 => 900 cents
      // Platform fee (10%): 90 cents => 0.90
      // Maintenance (5%): 45 cents => 0.45
      // Insurance (2%): 18 cents => 0.18
      // Net: 900 - 90 - 45 - 18 = 747 cents => 7.47
      expect(period.platformFeeUsd).toBe('0.90');
      expect(period.maintenanceReserveUsd).toBe('0.45');
      expect(period.insuranceCostUsd).toBe('0.18');
      expect(period.netRevenueUsd).toBe('7.47');
    });

    it('throws error for overlapping revenue periods', async () => {
      const orgId = uniqueOrgId();
      const node = await createTestNode(orgId);

      // Record first period: January 2024
      await recordRevenuePeriod(orgId, node.id, {
        grossRevenueUsd: '1000.00',
        electricityCostUsd: '100.00',
        periodStart: '2024-01-01T00:00:00Z',
        periodEnd: '2024-01-31T23:59:59Z',
      });

      // Attempt overlapping period (mid-January to mid-February)
      await expect(
        recordRevenuePeriod(orgId, node.id, {
          grossRevenueUsd: '2000.00',
          electricityCostUsd: '200.00',
          periodStart: '2024-01-15T00:00:00Z',
          periodEnd: '2024-02-15T23:59:59Z',
        }),
      ).rejects.toThrow(/overlap/i);
    });

    it('allows non-overlapping periods', async () => {
      const orgId = uniqueOrgId();
      const node = await createTestNode(orgId);

      // January
      await recordRevenuePeriod(orgId, node.id, {
        grossRevenueUsd: '1000.00',
        electricityCostUsd: '100.00',
        periodStart: '2024-01-01T00:00:00Z',
        periodEnd: '2024-01-31T23:59:59Z',
      });

      // February (no overlap)
      const feb = await recordRevenuePeriod(orgId, node.id, {
        grossRevenueUsd: '1200.00',
        electricityCostUsd: '120.00',
        periodStart: '2024-02-01T00:00:00Z',
        periodEnd: '2024-02-29T23:59:59Z',
      });

      expect(feb).toBeDefined();
      expect(feb.grossRevenueUsd).toBe('1200.00');
    });
  });

  // --------------------------------------------------------------------------
  // distributeRevenue
  // --------------------------------------------------------------------------
  describe('distributeRevenue', () => {
    it('creates distribution record for valid undistributed period', async () => {
      const orgId = uniqueOrgId();
      const node = await createTestNode(orgId);

      // Need a listing for yield calculation
      await tokenizeNode(orgId, node.id, {
        tokenSymbol: `D${Date.now()}`,
        tokenName: 'Dist Test Token',
        totalSupply: '1000',
        pricePerToken: '10.00',
      });

      const period = await recordRevenuePeriod(orgId, node.id, {
        grossRevenueUsd: '5000.00',
        electricityCostUsd: '500.00',
        periodStart: '2024-03-01T00:00:00Z',
        periodEnd: '2024-03-31T23:59:59Z',
      });

      const distribution = await distributeRevenue(orgId, node.id, period.id);
      expect(distribution).not.toBeNull();
      expect(distribution!.orgId).toBe(orgId);
      expect(distribution!.nodeId).toBe(node.id);
      expect(distribution!.revenuePeriodId).toBe(period.id);
      expect(distribution!.status).toBe('completed');
      expect(distribution!.distributionMethod).toBe('pro_rata');
    });

    it('returns null for already distributed period', async () => {
      const orgId = uniqueOrgId();
      const node = await createTestNode(orgId);

      await tokenizeNode(orgId, node.id, {
        tokenSymbol: `DD${Date.now()}`,
        tokenName: 'Dist Dup Token',
        totalSupply: '1000',
        pricePerToken: '10.00',
      });

      const period = await recordRevenuePeriod(orgId, node.id, {
        grossRevenueUsd: '3000.00',
        electricityCostUsd: '300.00',
        periodStart: '2024-04-01T00:00:00Z',
        periodEnd: '2024-04-30T23:59:59Z',
      });

      // First distribution
      const first = await distributeRevenue(orgId, node.id, period.id);
      expect(first).not.toBeNull();

      // Second attempt should return null (already distributed)
      const second = await distributeRevenue(orgId, node.id, period.id);
      expect(second).toBeNull();
    });

    it('verifies period.nodeId matches nodeId', async () => {
      const orgId = uniqueOrgId();
      const nodeA = await createTestNode(orgId);
      const nodeB = await createTestNode(orgId);

      await tokenizeNode(orgId, nodeA.id, {
        tokenSymbol: `VA${Date.now()}`,
        tokenName: 'Verify A Token',
        totalSupply: '1000',
        pricePerToken: '10.00',
      });

      const period = await recordRevenuePeriod(orgId, nodeA.id, {
        grossRevenueUsd: '2000.00',
        electricityCostUsd: '200.00',
        periodStart: '2024-05-01T00:00:00Z',
        periodEnd: '2024-05-31T23:59:59Z',
      });

      // Try to distribute revenue for nodeB using nodeA's period
      await expect(
        distributeRevenue(orgId, nodeB.id, period.id),
      ).rejects.toThrow(/does not belong to node/);
    });

    it('returns null for non-existent revenue period', async () => {
      const orgId = uniqueOrgId();
      const node = await createTestNode(orgId);

      const result = await distributeRevenue(orgId, node.id, 'non-existent-period-id');
      expect(result).toBeNull();
    });
  });
});
