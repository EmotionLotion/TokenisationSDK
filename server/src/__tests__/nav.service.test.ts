/**
 * NAV (Net Asset Value) Service - Unit Tests
 *
 * Tests calculateNAV (valid inputs, BigInt edge cases),
 * getCurrentNAV, getNAVHistory (pagination),
 * processCallback (CRE workflow), and addManualValuation.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  calculateNAV,
  getCurrentNAV,
  getNAVHistory,
  processCallback,
  addManualValuation,
} from '../services/nav.service.js';
import type { CRECallbackPayload, ManualValuationInput } from '../services/nav.service.js';

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
  return `org-nav-${Date.now()}-${++orgCounter}`;
}

let assetCounter = 0;
function uniqueAssetId(): string {
  return `asset-nav-${Date.now()}-${++assetCounter}`;
}

// ============================================================================
// Tests
// ============================================================================

describe('NAV Service', () => {
  // --------------------------------------------------------------------------
  // calculateNAV
  // --------------------------------------------------------------------------
  describe('calculateNAV', () => {
    it('calculates NAV correctly with valid inputs', async () => {
      const orgId = uniqueOrgId();
      const assetId = uniqueAssetId();

      const record = await calculateNAV(orgId, assetId, {
        totalAssetValue: '1000000',
        liabilities: '200000',
        currency: 'USD',
        decimals: 18,
      });

      expect(record.id).toBeDefined();
      expect(record.orgId).toBe(orgId);
      expect(record.assetId).toBe(assetId);
      expect(record.totalAssetValue).toBe('1000000');
      expect(record.liabilities).toBe('200000');
      // netAssetValue = totalAssetValue - liabilities = 800000
      expect(record.netAssetValue).toBe('800000');
      expect(record.currency).toBe('USD');
      expect(record.decimals).toBe(18);
      expect(record.source).toBe('manual');
      expect(record.txHash).toBeNull();
      expect(record.computedAt).toBeDefined();
      expect(record.createdAt).toBeDefined();
    });

    it('defaults liabilities to 0 when not provided', async () => {
      const orgId = uniqueOrgId();
      const assetId = uniqueAssetId();

      const record = await calculateNAV(orgId, assetId, {
        totalAssetValue: '500000',
      });

      expect(record.liabilities).toBe('0');
      expect(record.netAssetValue).toBe('500000');
    });

    it('defaults currency to USD and decimals to 18', async () => {
      const orgId = uniqueOrgId();
      const assetId = uniqueAssetId();

      const record = await calculateNAV(orgId, assetId, {
        totalAssetValue: '100000',
      });

      expect(record.currency).toBe('USD');
      expect(record.decimals).toBe(18);
    });

    it('throws for invalid totalAssetValue (non-numeric string)', async () => {
      const orgId = uniqueOrgId();
      const assetId = uniqueAssetId();

      await expect(
        calculateNAV(orgId, assetId, {
          totalAssetValue: 'not-a-number',
        }),
      ).rejects.toThrow(/Invalid totalAssetValue/);
    });

    it('throws for totalAssetValue with decimal point', async () => {
      const orgId = uniqueOrgId();
      const assetId = uniqueAssetId();

      await expect(
        calculateNAV(orgId, assetId, {
          totalAssetValue: '100.50',
        }),
      ).rejects.toThrow(/Invalid totalAssetValue/);
    });

    it('handles zero totalAssetValue correctly', async () => {
      const orgId = uniqueOrgId();
      const assetId = uniqueAssetId();

      const record = await calculateNAV(orgId, assetId, {
        totalAssetValue: '0',
        liabilities: '0',
      });

      expect(record.netAssetValue).toBe('0');
      expect(record.navPerToken).toBe('0');
    });

    it('clamps netAssetValue to 0 when liabilities exceed totalAssetValue', async () => {
      const orgId = uniqueOrgId();
      const assetId = uniqueAssetId();

      const record = await calculateNAV(orgId, assetId, {
        totalAssetValue: '100000',
        liabilities: '500000',
      });

      expect(record.netAssetValue).toBe('0');
    });

    it('persists valuation sources when provided', async () => {
      const orgId = uniqueOrgId();
      const assetId = uniqueAssetId();

      const record = await calculateNAV(orgId, assetId, {
        totalAssetValue: '1000000',
        sources: [
          { name: 'appraisal', value: '900000', weight: 0.6 },
          { name: 'market_comp', value: '1100000', weight: 0.4 },
        ],
      });

      expect(record.id).toBeDefined();
      expect(record.source).toBe('manual');
    });
  });

  // --------------------------------------------------------------------------
  // getCurrentNAV
  // --------------------------------------------------------------------------
  describe('getCurrentNAV', () => {
    it('returns null when no records exist', async () => {
      const orgId = uniqueOrgId();
      const assetId = uniqueAssetId();

      const result = await getCurrentNAV(orgId, assetId);
      expect(result).toBeNull();
    });

    it('returns the most recent NAV record', async () => {
      const orgId = uniqueOrgId();
      const assetId = uniqueAssetId();

      // Create two NAV records
      await calculateNAV(orgId, assetId, {
        totalAssetValue: '500000',
      });
      const second = await calculateNAV(orgId, assetId, {
        totalAssetValue: '750000',
      });

      const current = await getCurrentNAV(orgId, assetId);
      expect(current).not.toBeNull();
      expect(current!.id).toBe(second.id);
      expect(current!.totalAssetValue).toBe('750000');
    });

    it('does not return records from different orgId', async () => {
      const orgA = uniqueOrgId();
      const orgB = uniqueOrgId();
      const assetId = uniqueAssetId();

      await calculateNAV(orgA, assetId, {
        totalAssetValue: '500000',
      });

      const result = await getCurrentNAV(orgB, assetId);
      expect(result).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // getNAVHistory
  // --------------------------------------------------------------------------
  describe('getNAVHistory', () => {
    it('returns paginated results with correct metadata', async () => {
      const orgId = uniqueOrgId();
      const assetId = uniqueAssetId();

      // Create 5 NAV records
      for (let i = 0; i < 5; i++) {
        await calculateNAV(orgId, assetId, {
          totalAssetValue: String((i + 1) * 100000),
        });
      }

      const result = await getNAVHistory(orgId, assetId, { page: 1, limit: 3 });
      expect(result.records).toHaveLength(3);
      expect(result.total).toBe(5);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(3);
    });

    it('returns second page correctly', async () => {
      const orgId = uniqueOrgId();
      const assetId = uniqueAssetId();

      for (let i = 0; i < 5; i++) {
        await calculateNAV(orgId, assetId, {
          totalAssetValue: String((i + 1) * 100000),
        });
      }

      const result = await getNAVHistory(orgId, assetId, { page: 2, limit: 3 });
      expect(result.records).toHaveLength(2);
      expect(result.total).toBe(5);
      expect(result.page).toBe(2);
    });

    it('returns empty records when no data exists', async () => {
      const orgId = uniqueOrgId();
      const assetId = uniqueAssetId();

      const result = await getNAVHistory(orgId, assetId);
      expect(result.records).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('defaults page to 1 and limit to 20', async () => {
      const orgId = uniqueOrgId();
      const assetId = uniqueAssetId();

      await calculateNAV(orgId, assetId, {
        totalAssetValue: '100000',
      });

      const result = await getNAVHistory(orgId, assetId);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it('filters by source', async () => {
      const orgId = uniqueOrgId();
      const assetId = uniqueAssetId();

      // Create a manual record
      await calculateNAV(orgId, assetId, {
        totalAssetValue: '100000',
      });

      // Create a CRE workflow record
      await processCallback(orgId, assetId, {
        assetId,
        navPerToken: '1000',
        totalAssetValue: '200000',
        liabilities: '0',
        netAssetValue: '200000',
        totalSupply: '200',
        currency: 'USD',
        decimals: 18,
        valuationSources: [],
        computedAt: new Date().toISOString(),
      });

      const manualOnly = await getNAVHistory(orgId, assetId, { source: 'manual' });
      expect(manualOnly.total).toBe(1);
      expect(manualOnly.records[0].source).toBe('manual');

      const creOnly = await getNAVHistory(orgId, assetId, { source: 'cre_workflow' });
      expect(creOnly.total).toBe(1);
      expect(creOnly.records[0].source).toBe('cre_workflow');
    });

    it('caps limit to 100', async () => {
      const orgId = uniqueOrgId();
      const assetId = uniqueAssetId();

      const result = await getNAVHistory(orgId, assetId, { limit: 500 });
      expect(result.limit).toBe(100);
    });
  });

  // --------------------------------------------------------------------------
  // processCallback
  // --------------------------------------------------------------------------
  describe('processCallback', () => {
    it('creates record from CRE callback payload', async () => {
      const orgId = uniqueOrgId();
      const assetId = uniqueAssetId();
      const computedAt = new Date().toISOString();

      const payload: CRECallbackPayload = {
        assetId,
        navPerToken: '5000000000000000000',
        totalAssetValue: '10000000',
        liabilities: '2000000',
        netAssetValue: '8000000',
        totalSupply: '1600',
        currency: 'USD',
        decimals: 18,
        valuationSources: [
          { name: 'oracle_feed', value: '10000000', weight: 1.0, timestamp: Math.floor(Date.now() / 1000) },
        ],
        computedAt,
        txHash: '0xabc123',
      };

      const record = await processCallback(orgId, assetId, payload);

      expect(record.id).toBeDefined();
      expect(record.orgId).toBe(orgId);
      expect(record.assetId).toBe(assetId);
      expect(record.navPerToken).toBe('5000000000000000000');
      expect(record.totalAssetValue).toBe('10000000');
      expect(record.liabilities).toBe('2000000');
      expect(record.netAssetValue).toBe('8000000');
      expect(record.totalSupply).toBe('1600');
      expect(record.source).toBe('cre_workflow');
      expect(record.txHash).toBe('0xabc123');
      expect(record.computedAt).toBe(computedAt);
    });

    it('handles callback without txHash', async () => {
      const orgId = uniqueOrgId();
      const assetId = uniqueAssetId();

      const record = await processCallback(orgId, assetId, {
        assetId,
        navPerToken: '1000',
        totalAssetValue: '100000',
        liabilities: '0',
        netAssetValue: '100000',
        totalSupply: '100',
        currency: 'USD',
        decimals: 18,
        valuationSources: [],
        computedAt: new Date().toISOString(),
      });

      expect(record.txHash).toBeNull();
    });

    it('persists valuation sources from callback', async () => {
      const orgId = uniqueOrgId();
      const assetId = uniqueAssetId();

      const record = await processCallback(orgId, assetId, {
        assetId,
        navPerToken: '1000',
        totalAssetValue: '100000',
        liabilities: '0',
        netAssetValue: '100000',
        totalSupply: '100',
        currency: 'USD',
        decimals: 18,
        valuationSources: [
          { name: 'chainlink', value: '100000', weight: 0.7, timestamp: 1700000000 },
          { name: 'appraisal', value: '100000', weight: 0.3, timestamp: 1700000000 },
        ],
        computedAt: new Date().toISOString(),
      });

      // Record should be retrievable
      const current = await getCurrentNAV(orgId, assetId);
      expect(current).not.toBeNull();
      expect(current!.id).toBe(record.id);
    });

    it('callback record appears in getCurrentNAV', async () => {
      const orgId = uniqueOrgId();
      const assetId = uniqueAssetId();

      const record = await processCallback(orgId, assetId, {
        assetId,
        navPerToken: '2000',
        totalAssetValue: '200000',
        liabilities: '0',
        netAssetValue: '200000',
        totalSupply: '100',
        currency: 'AED',
        decimals: 18,
        valuationSources: [],
        computedAt: new Date().toISOString(),
      });

      const current = await getCurrentNAV(orgId, assetId);
      expect(current).not.toBeNull();
      expect(current!.id).toBe(record.id);
      expect(current!.currency).toBe('AED');
    });
  });

  // --------------------------------------------------------------------------
  // addManualValuation
  // --------------------------------------------------------------------------
  describe('addManualValuation', () => {
    it('delegates to calculateNAV and returns a manual source record', async () => {
      const orgId = uniqueOrgId();
      const assetId = uniqueAssetId();

      const record = await addManualValuation(orgId, assetId, {
        totalAssetValue: '3000000',
        liabilities: '500000',
        currency: 'AED',
        decimals: 8,
      });

      expect(record.source).toBe('manual');
      expect(record.totalAssetValue).toBe('3000000');
      expect(record.liabilities).toBe('500000');
      expect(record.netAssetValue).toBe('2500000');
      expect(record.currency).toBe('AED');
      expect(record.decimals).toBe(8);
    });

    it('is retrievable via getCurrentNAV after creation', async () => {
      const orgId = uniqueOrgId();
      const assetId = uniqueAssetId();

      const manual = await addManualValuation(orgId, assetId, {
        totalAssetValue: '1000000',
      });

      const current = await getCurrentNAV(orgId, assetId);
      expect(current).not.toBeNull();
      expect(current!.id).toBe(manual.id);
    });
  });
});
