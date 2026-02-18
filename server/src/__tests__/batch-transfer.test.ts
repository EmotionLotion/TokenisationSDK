/**
 * Batch Transfer Service - Integration Tests
 *
 * Tests createBatchTransfer: validation, max batch size, per-item
 * success/failure, amount checks, and result shape.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createBatchTransfer } from '../services/batch-transfer.service.js';
import type {
  BatchTransferInput,
  BatchTransferResult,
} from '../services/batch-transfer.service.js';

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

const ORG_ID = 'org-test-001';

function validTransfer(overrides: Partial<BatchTransferInput> = {}): BatchTransferInput {
  return {
    tokenId: 'tok-001',
    fromWallet: '0xAAA',
    toWallet: '0xBBB',
    amount: '1000',
    ...overrides,
  };
}

function manyValidTransfers(count: number): BatchTransferInput[] {
  return Array.from({ length: count }, (_, i) =>
    validTransfer({
      tokenId: `tok-${String(i).padStart(3, '0')}`,
      fromWallet: `0xFrom${i}`,
      toWallet: `0xTo${i}`,
      amount: String((i + 1) * 100),
    }),
  );
}

// ============================================================================
// Tests
// ============================================================================

describe('createBatchTransfer', () => {
  describe('single transfer succeeds', () => {
    it('returns a result with batchId, total=1, succeeded=1, failed=0', async () => {
      const result = await createBatchTransfer(ORG_ID, [validTransfer()]);

      expect(result.batchId).toBeDefined();
      expect(result.batchId.startsWith('batch-')).toBe(true);
      expect(result.total).toBe(1);
      expect(result.succeeded).toBe(1);
      expect(result.failed).toBe(0);
      expect(result.results).toHaveLength(1);
      expect(result.results[0].status).toBe('success');
      expect(result.results[0].transferId).toBeDefined();
      expect(result.results[0].index).toBe(0);
      expect(result.results[0].tokenId).toBe('tok-001');
    });
  });

  describe('max batch size (100 transfers)', () => {
    it('succeeds for exactly 100 transfers', async () => {
      const transfers = manyValidTransfers(100);
      const result = await createBatchTransfer(ORG_ID, transfers);

      expect(result.total).toBe(100);
      expect(result.succeeded).toBe(100);
      expect(result.failed).toBe(0);
      expect(result.results).toHaveLength(100);
    });
  });

  describe('exceeds max batch size (101 transfers)', () => {
    it('throws an error', async () => {
      const transfers = manyValidTransfers(101);

      await expect(createBatchTransfer(ORG_ID, transfers)).rejects.toThrow(
        /exceeds maximum of 100/,
      );
    });

    it('includes the batch size in the error message', async () => {
      const transfers = manyValidTransfers(101);

      await expect(createBatchTransfer(ORG_ID, transfers)).rejects.toThrow(
        /101/,
      );
    });
  });

  describe('empty array', () => {
    it('throws an error', async () => {
      await expect(createBatchTransfer(ORG_ID, [])).rejects.toThrow(
        /at least one transfer/,
      );
    });
  });

  describe('missing required fields cause individual item failure', () => {
    it('missing tokenId fails the item', async () => {
      const result = await createBatchTransfer(ORG_ID, [
        validTransfer({ tokenId: '' }),
      ]);

      expect(result.failed).toBe(1);
      expect(result.succeeded).toBe(0);
      expect(result.results[0].status).toBe('failed');
      expect(result.results[0].error).toMatch(/required fields/i);
    });

    it('missing fromWallet fails the item', async () => {
      const result = await createBatchTransfer(ORG_ID, [
        validTransfer({ fromWallet: '' }),
      ]);

      expect(result.failed).toBe(1);
      expect(result.results[0].status).toBe('failed');
      expect(result.results[0].error).toBeDefined();
    });

    it('missing toWallet fails the item', async () => {
      const result = await createBatchTransfer(ORG_ID, [
        validTransfer({ toWallet: '' }),
      ]);

      expect(result.failed).toBe(1);
      expect(result.results[0].status).toBe('failed');
    });

    it('missing amount fails the item', async () => {
      const result = await createBatchTransfer(ORG_ID, [
        validTransfer({ amount: '' }),
      ]);

      expect(result.failed).toBe(1);
      expect(result.results[0].status).toBe('failed');
    });
  });

  describe('amount validation', () => {
    it('amount of "0" fails the item (must be positive)', async () => {
      const result = await createBatchTransfer(ORG_ID, [
        validTransfer({ amount: '0' }),
      ]);

      expect(result.failed).toBe(1);
      expect(result.succeeded).toBe(0);
      expect(result.results[0].status).toBe('failed');
      expect(result.results[0].error).toMatch(/positive/i);
    });

    it('negative amount fails the item', async () => {
      const result = await createBatchTransfer(ORG_ID, [
        validTransfer({ amount: '-500' }),
      ]);

      expect(result.failed).toBe(1);
      expect(result.results[0].status).toBe('failed');
      expect(result.results[0].error).toMatch(/positive/i);
    });

    it('very large valid amount succeeds (BigInt support)', async () => {
      const result = await createBatchTransfer(ORG_ID, [
        validTransfer({ amount: '999999999999999999999999' }),
      ]);

      expect(result.succeeded).toBe(1);
      expect(result.results[0].status).toBe('success');
    });
  });

  describe('mixed success and failure', () => {
    it('reports correct counts when some valid and some invalid', async () => {
      const transfers: BatchTransferInput[] = [
        validTransfer({ tokenId: 'tok-good-1' }),
        validTransfer({ tokenId: '', fromWallet: '0xA', toWallet: '0xB', amount: '100' }), // missing tokenId
        validTransfer({ tokenId: 'tok-good-2' }),
        validTransfer({ tokenId: 'tok-zero', amount: '0' }), // zero amount
        validTransfer({ tokenId: 'tok-good-3' }),
      ];

      const result = await createBatchTransfer(ORG_ID, transfers);

      expect(result.total).toBe(5);
      expect(result.succeeded).toBe(3);
      expect(result.failed).toBe(2);
      expect(result.results).toHaveLength(5);

      // Verify indices are correct
      expect(result.results[0].index).toBe(0);
      expect(result.results[0].status).toBe('success');

      expect(result.results[1].index).toBe(1);
      expect(result.results[1].status).toBe('failed');

      expect(result.results[2].index).toBe(2);
      expect(result.results[2].status).toBe('success');

      expect(result.results[3].index).toBe(3);
      expect(result.results[3].status).toBe('failed');

      expect(result.results[4].index).toBe(4);
      expect(result.results[4].status).toBe('success');
    });

    it('successful items have transferId, failed items have error', async () => {
      const transfers: BatchTransferInput[] = [
        validTransfer(),
        validTransfer({ amount: '-1' }),
      ];

      const result = await createBatchTransfer(ORG_ID, transfers);

      const successItem = result.results.find(r => r.status === 'success')!;
      const failedItem = result.results.find(r => r.status === 'failed')!;

      expect(successItem.transferId).toBeDefined();
      expect(successItem.transferId!.length).toBeGreaterThan(0);
      expect(successItem.error).toBeUndefined();

      expect(failedItem.error).toBeDefined();
      expect(failedItem.error!.length).toBeGreaterThan(0);
    });
  });

  describe('result shape', () => {
    it('batchId is a non-empty string prefixed with "batch-"', async () => {
      const result = await createBatchTransfer(ORG_ID, [validTransfer()]);

      expect(typeof result.batchId).toBe('string');
      expect(result.batchId.startsWith('batch-')).toBe(true);
    });

    it('total equals the number of input transfers', async () => {
      const transfers = manyValidTransfers(7);
      const result = await createBatchTransfer(ORG_ID, transfers);

      expect(result.total).toBe(7);
    });

    it('succeeded + failed equals total', async () => {
      const transfers: BatchTransferInput[] = [
        validTransfer(),
        validTransfer({ amount: '0' }),
        validTransfer(),
        validTransfer({ tokenId: '' }),
      ];

      const result = await createBatchTransfer(ORG_ID, transfers);

      expect(result.succeeded + result.failed).toBe(result.total);
    });

    it('results array length equals total', async () => {
      const transfers = manyValidTransfers(15);
      const result = await createBatchTransfer(ORG_ID, transfers);

      expect(result.results).toHaveLength(result.total);
    });

    it('each result item has the correct tokenId from the input', async () => {
      const transfers = [
        validTransfer({ tokenId: 'alpha' }),
        validTransfer({ tokenId: 'beta' }),
        validTransfer({ tokenId: 'gamma' }),
      ];

      const result = await createBatchTransfer(ORG_ID, transfers);

      expect(result.results[0].tokenId).toBe('alpha');
      expect(result.results[1].tokenId).toBe('beta');
      expect(result.results[2].tokenId).toBe('gamma');
    });
  });

  describe('metadata passthrough', () => {
    it('accepts transfers with optional metadata', async () => {
      const result = await createBatchTransfer(ORG_ID, [
        validTransfer({ metadata: { note: 'test transfer', priority: 'high' } }),
      ]);

      expect(result.succeeded).toBe(1);
    });

    it('accepts transfers without metadata', async () => {
      const input: BatchTransferInput = {
        tokenId: 'tok-no-meta',
        fromWallet: '0xA',
        toWallet: '0xB',
        amount: '500',
      };

      const result = await createBatchTransfer(ORG_ID, [input]);

      expect(result.succeeded).toBe(1);
    });
  });
});
