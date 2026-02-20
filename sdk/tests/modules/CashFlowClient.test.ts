/**
 * CashFlowModule (Client) Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CashFlowModule } from '../../src/modules/CashFlowClient.js';

function createMockHttp() {
  return {
    get: vi.fn().mockResolvedValue({ data: {} }),
    post: vi.fn().mockResolvedValue({ data: {} }),
    put: vi.fn().mockResolvedValue({ data: {} }),
    patch: vi.fn().mockResolvedValue({ data: {} }),
    delete: vi.fn().mockResolvedValue({ data: {} }),
    list: vi.fn().mockResolvedValue({ data: [], total: 0 }),
  } as any;
}

// Mock validation functions
vi.mock('../../src/modules/validation.js', () => ({
  validate: (_schema: any, data: any) => data,
  UUIDSchema: { parse: (v: string) => v },
}));

vi.mock('../../src/modules/validation-governance.js', () => ({
  CreateScheduleInputSchema: {},
  UpdateScheduleInputSchema: {},
  ExecuteDistributionInputSchema: {},
  ListSchedulesParamsSchema: {},
  ListDistributionsParamsSchema: {},
}));

describe('CashFlowModule', () => {
  let mod: CashFlowModule;
  let http: ReturnType<typeof createMockHttp>;

  beforeEach(() => {
    http = createMockHttp();
    mod = new CashFlowModule(http);
  });

  describe('scheduleDistribution', () => {
    it('should POST to /api/v1/distributions/schedules', async () => {
      const input = {
        assetId: 'a1',
        type: 'DIVIDEND',
        frequency: 'QUARTERLY',
        paymentCurrency: 'USDC',
        startDate: '2026-01-01T00:00:00Z',
      };
      await mod.scheduleDistribution(input as any);
      expect(http.post).toHaveBeenCalledWith('/api/v1/distributions/schedules', input);
    });
  });

  describe('getSchedule', () => {
    it('should GET from /api/v1/distributions/schedules/:id', async () => {
      const expected = { id: 'sched-1', type: 'DIVIDEND' };
      http.get.mockResolvedValue({ data: expected });
      const result = await mod.getSchedule('sched-1');
      expect(http.get).toHaveBeenCalledWith('/api/v1/distributions/schedules/sched-1');
      expect(result).toEqual(expected);
    });
  });

  describe('processDistribution', () => {
    it('should POST to /api/v1/distributions/schedules/:id/execute', async () => {
      await mod.processDistribution('sched-1');
      expect(http.post).toHaveBeenCalledWith(
        '/api/v1/distributions/schedules/sched-1/execute',
        undefined,
      );
    });

    it('should pass execution input when provided', async () => {
      const input = { snapshotAt: '2026-01-01T00:00:00Z' };
      await mod.processDistribution('sched-1', input as any);
      expect(http.post).toHaveBeenCalledWith(
        '/api/v1/distributions/schedules/sched-1/execute',
        input,
      );
    });
  });

  describe('getDistribution', () => {
    it('should GET from /api/v1/distributions/:id', async () => {
      await mod.getDistribution('dist-1');
      expect(http.get).toHaveBeenCalledWith('/api/v1/distributions/dist-1');
    });
  });

  describe('claimPayout', () => {
    it('should POST to /api/v1/distributions/:id/claim', async () => {
      await mod.claimPayout('dist-1');
      expect(http.post).toHaveBeenCalledWith('/api/v1/distributions/dist-1/claim');
    });
  });

  describe('getUnclaimedPayouts', () => {
    it('should GET from /api/v1/distributions/payouts/unclaimed', async () => {
      http.get.mockResolvedValue({ data: { data: [{ distributionId: 'd1', amount: '100' }] } });
      const result = await mod.getUnclaimedPayouts();
      expect(http.get).toHaveBeenCalledWith('/api/v1/distributions/payouts/unclaimed');
      expect(result).toEqual([{ distributionId: 'd1', amount: '100' }]);
    });
  });

  describe('getTotalDistributed', () => {
    it('should GET from /api/v1/distributions/assets/:id/totals', async () => {
      const expected = { USDC: '10000', AED: '50000' };
      http.get.mockResolvedValue({ data: expected });
      const result = await mod.getTotalDistributed('asset-1');
      expect(http.get).toHaveBeenCalledWith('/api/v1/distributions/assets/asset-1/totals');
      expect(result).toEqual(expected);
    });
  });

  describe('getYieldSummary', () => {
    it('should GET yield summary with period parameter', async () => {
      await mod.getYieldSummary('asset-1', 90);
      expect(http.get).toHaveBeenCalledWith(
        '/api/v1/distributions/assets/asset-1/yield',
        { periodDays: 90 },
      );
    });

    it('should GET yield summary without period', async () => {
      await mod.getYieldSummary('asset-1');
      expect(http.get).toHaveBeenCalledWith(
        '/api/v1/distributions/assets/asset-1/yield',
        undefined,
      );
    });
  });
});
