/**
 * ExitWindowModule Tests
 *
 * Covers schedule management, window retrieval, redemption requests,
 * input validation (Zod schemas), and URL encoding.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ExitWindowModule } from '../../src/modules/ExitWindowModule.js';
import { ValidationError } from '../../src/validation/real-estate.js';

function createMockHttp() {
  return {
    get: vi.fn().mockResolvedValue({ data: {} }),
    post: vi.fn().mockResolvedValue({ data: {} }),
    put: vi.fn().mockResolvedValue({ data: { data: {} } }),
    patch: vi.fn().mockResolvedValue({ data: {} }),
    delete: vi.fn().mockResolvedValue({ data: {} }),
    list: vi.fn().mockResolvedValue({ data: [], total: 0 }),
  } as any;
}

// ---------------------------------------------------------------------------
// Valid input fixtures
// ---------------------------------------------------------------------------

function validSchedule() {
  return {
    frequency: 'quarterly' as const,
    windowDurationDays: 14,
    maxRedemptionPercent: 25,
    noticePeriodDays: 7,
  };
}

function validRedemption() {
  return { investorId: 'inv-001', amount: 500 };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ExitWindowModule', () => {
  let mod: ExitWindowModule;
  let http: ReturnType<typeof createMockHttp>;

  beforeEach(() => {
    http = createMockHttp();
    mod = new ExitWindowModule(http);
  });

  // ========================================================================
  // setSchedule
  // ========================================================================
  describe('setSchedule', () => {
    it('should PUT to /api/v1/assets/:assetId/exit-schedule with validated body', async () => {
      const schedule = validSchedule();
      await mod.setSchedule('asset-1', schedule);

      expect(http.put).toHaveBeenCalledWith(
        '/api/v1/assets/asset-1/exit-schedule',
        schedule,
      );
    });

    it('should encodeURIComponent the assetId in the URL', async () => {
      await mod.setSchedule('asset/special id', validSchedule());

      const url = http.put.mock.calls[0][0] as string;
      expect(url).toBe('/api/v1/assets/asset%2Fspecial%20id/exit-schedule');
    });

    it('should return the nested data from response.data.data', async () => {
      const expected = { id: 'sched-1', assetId: 'a1', frequency: 'quarterly' };
      http.put.mockResolvedValue({ data: { data: expected } });

      const result = await mod.setSchedule('a1', validSchedule());
      expect(result).toEqual(expected);
    });

    it('should reject an invalid frequency enum value', async () => {
      const bad = { ...validSchedule(), frequency: 'weekly' };
      await expect(mod.setSchedule('a1', bad as any)).rejects.toThrow(ValidationError);
    });

    it('should reject windowDurationDays < 1', async () => {
      const bad = { ...validSchedule(), windowDurationDays: 0 };
      await expect(mod.setSchedule('a1', bad)).rejects.toThrow(ValidationError);
    });

    it('should reject negative windowDurationDays', async () => {
      const bad = { ...validSchedule(), windowDurationDays: -5 };
      await expect(mod.setSchedule('a1', bad)).rejects.toThrow(ValidationError);
    });

    it('should reject maxRedemptionPercent > 100', async () => {
      const bad = { ...validSchedule(), maxRedemptionPercent: 101 };
      await expect(mod.setSchedule('a1', bad)).rejects.toThrow(ValidationError);
    });

    it('should reject maxRedemptionPercent < 0', async () => {
      const bad = { ...validSchedule(), maxRedemptionPercent: -1 };
      await expect(mod.setSchedule('a1', bad)).rejects.toThrow(ValidationError);
    });

    it('should accept maxRedemptionPercent at boundary values 0 and 100', async () => {
      await expect(
        mod.setSchedule('a1', { ...validSchedule(), maxRedemptionPercent: 0 }),
      ).resolves.toBeDefined();

      await expect(
        mod.setSchedule('a1', { ...validSchedule(), maxRedemptionPercent: 100 }),
      ).resolves.toBeDefined();
    });

    it('should accept all valid frequency values', async () => {
      const frequencies = ['monthly', 'quarterly', 'semi-annually', 'annually'] as const;
      for (const frequency of frequencies) {
        http.put.mockClear();
        await mod.setSchedule('a1', { ...validSchedule(), frequency });
        expect(http.put).toHaveBeenCalledTimes(1);
      }
    });

    it('should reject non-integer windowDurationDays', async () => {
      const bad = { ...validSchedule(), windowDurationDays: 3.5 };
      await expect(mod.setSchedule('a1', bad)).rejects.toThrow(ValidationError);
    });
  });

  // ========================================================================
  // getWindows
  // ========================================================================
  describe('getWindows', () => {
    it('should GET /api/v1/assets/:assetId/exit-windows', async () => {
      const windows = [
        { id: 'w1', assetId: 'a1', status: 'open' },
        { id: 'w2', assetId: 'a1', status: 'closed' },
      ];
      http.get.mockResolvedValue({ data: { data: windows } });

      const result = await mod.getWindows('a1');

      expect(http.get).toHaveBeenCalledWith('/api/v1/assets/a1/exit-windows');
      expect(result).toEqual(windows);
    });

    it('should encodeURIComponent the assetId', async () => {
      http.get.mockResolvedValue({ data: { data: [] } });
      await mod.getWindows('asset&id=1');

      expect(http.get).toHaveBeenCalledWith(
        '/api/v1/assets/asset%26id%3D1/exit-windows',
      );
    });
  });

  // ========================================================================
  // getCurrentWindow
  // ========================================================================
  describe('getCurrentWindow', () => {
    it('should GET /api/v1/assets/:assetId/exit-windows/current', async () => {
      const window = { id: 'w1', status: 'open' };
      http.get.mockResolvedValue({ data: { data: window } });

      const result = await mod.getCurrentWindow('a1');

      expect(http.get).toHaveBeenCalledWith('/api/v1/assets/a1/exit-windows/current');
      expect(result).toEqual(window);
    });

    it('should return null when no current window exists', async () => {
      http.get.mockResolvedValue({ data: { data: null } });

      const result = await mod.getCurrentWindow('a1');
      expect(result).toBeNull();
    });

    it('should encodeURIComponent the assetId', async () => {
      http.get.mockResolvedValue({ data: { data: null } });
      await mod.getCurrentWindow('a/b');

      expect(http.get).toHaveBeenCalledWith('/api/v1/assets/a%2Fb/exit-windows/current');
    });
  });

  // ========================================================================
  // getNextWindow
  // ========================================================================
  describe('getNextWindow', () => {
    it('should GET /api/v1/assets/:assetId/exit-windows/next', async () => {
      const window = { id: 'w2', status: 'scheduled' };
      http.get.mockResolvedValue({ data: { data: window } });

      const result = await mod.getNextWindow('a1');

      expect(http.get).toHaveBeenCalledWith('/api/v1/assets/a1/exit-windows/next');
      expect(result).toEqual(window);
    });

    it('should return null when no next window exists', async () => {
      http.get.mockResolvedValue({ data: { data: null } });

      const result = await mod.getNextWindow('a1');
      expect(result).toBeNull();
    });

    it('should encodeURIComponent the assetId', async () => {
      http.get.mockResolvedValue({ data: { data: null } });
      await mod.getNextWindow('asset id');

      expect(http.get).toHaveBeenCalledWith('/api/v1/assets/asset%20id/exit-windows/next');
    });
  });

  // ========================================================================
  // requestRedemption
  // ========================================================================
  describe('requestRedemption', () => {
    it('should POST to /api/v1/assets/:assetId/exit-windows/redeem with validated body', async () => {
      const input = validRedemption();
      http.post.mockResolvedValue({ data: { data: { id: 'r1', ...input, status: 'pending' } } });

      const result = await mod.requestRedemption('a1', input);

      expect(http.post).toHaveBeenCalledWith(
        '/api/v1/assets/a1/exit-windows/redeem',
        input,
      );
      expect(result).toHaveProperty('id', 'r1');
    });

    it('should encodeURIComponent the assetId in the URL', async () => {
      http.post.mockResolvedValue({ data: { data: {} } });
      await mod.requestRedemption('asset#1', validRedemption());

      const url = http.post.mock.calls[0][0] as string;
      expect(url).toBe('/api/v1/assets/asset%231/exit-windows/redeem');
    });

    it('should reject amount <= 0', async () => {
      await expect(
        mod.requestRedemption('a1', { investorId: 'inv-1', amount: 0 }),
      ).rejects.toThrow(ValidationError);

      await expect(
        mod.requestRedemption('a1', { investorId: 'inv-1', amount: -10 }),
      ).rejects.toThrow(ValidationError);
    });

    it('should reject empty investorId', async () => {
      await expect(
        mod.requestRedemption('a1', { investorId: '', amount: 100 }),
      ).rejects.toThrow(ValidationError);
    });

    it('should include descriptive field errors in the ValidationError', async () => {
      try {
        await mod.requestRedemption('a1', { investorId: '', amount: -1 });
        expect.fail('Expected ValidationError');
      } catch (err) {
        expect(err).toBeInstanceOf(ValidationError);
        const ve = err as ValidationError;
        expect(ve.fieldErrors.length).toBeGreaterThanOrEqual(2);
        const paths = ve.fieldErrors.map((e) => e.path);
        expect(paths).toContain('investorId');
        expect(paths).toContain('amount');
      }
    });
  });

  // ========================================================================
  // getSchedule does NOT exist (removed)
  // ========================================================================
  describe('no getSchedule method', () => {
    it('should not expose a getSchedule method', () => {
      expect((mod as any).getSchedule).toBeUndefined();
    });
  });
});
