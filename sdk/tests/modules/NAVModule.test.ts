import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NAVModule, ValidationError } from '@tokenisation/realestate';

// ---------------------------------------------------------------------------
// Mock HttpClient
// ---------------------------------------------------------------------------

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

describe('NAVModule', () => {
  let http: ReturnType<typeof createMockHttp>;
  let mod: NAVModule;

  beforeEach(() => {
    http = createMockHttp();
    mod = new NAVModule(http);
  });

  // ========================================================================
  // getCurrent
  // ========================================================================

  describe('getCurrent', () => {
    it('should GET the correct NAV URL and return response data directly', async () => {
      const fakeData = {
        nav: {
          id: 'nav-1',
          assetId: 'asset-abc',
          navPerToken: '10',
          totalAssetValue: '1000000',
          liabilities: '50000',
          netAssetValue: '950000',
          totalSupply: '95000',
          currency: 'AED',
          decimals: 18,
          source: 'manual',
          computedAt: '2025-06-01T00:00:00Z',
        },
        valuationSources: [
          { name: 'Appraiser A', value: '1000000', weight: 1 },
        ],
      };
      http.get.mockResolvedValueOnce({ data: fakeData });

      const result = await mod.getCurrent('asset-abc');

      expect(http.get).toHaveBeenCalledTimes(1);
      expect(http.get).toHaveBeenCalledWith('/api/v1/assets/asset-abc/nav');
      expect(result).toEqual(fakeData);
    });

    it('should encode special characters in assetId', async () => {
      http.get.mockResolvedValueOnce({ data: { nav: {}, valuationSources: [] } });

      await mod.getCurrent('id with/slash & special');

      const url = http.get.mock.calls[0][0];
      expect(url).toBe('/api/v1/assets/id%20with%2Fslash%20%26%20special/nav');
    });
  });

  // ========================================================================
  // getHistory
  // ========================================================================

  describe('getHistory', () => {
    it('should GET history endpoint and pass query params', async () => {
      const fakeHistory = {
        records: [{ id: 'nav-1' }, { id: 'nav-2' }],
        total: 2,
        page: 1,
        limit: 20,
        totalPages: 1,
      };
      http.get.mockResolvedValueOnce({ data: fakeHistory });

      const result = await mod.getHistory('asset-1', {
        page: 1,
        limit: 20,
        source: 'manual',
      });

      expect(http.get).toHaveBeenCalledTimes(1);
      const [url, params] = http.get.mock.calls[0];
      expect(url).toBe('/api/v1/assets/asset-1/nav/history');
      expect(params).toEqual({ page: 1, limit: 20, source: 'manual' });
      expect(result).toEqual(fakeHistory);
    });

    it('should work without optional params', async () => {
      const fakeHistory = { records: [], total: 0, page: 1, limit: 20, totalPages: 0 };
      http.get.mockResolvedValueOnce({ data: fakeHistory });

      const result = await mod.getHistory('asset-2');

      expect(http.get).toHaveBeenCalledWith(
        '/api/v1/assets/asset-2/nav/history',
        undefined,
      );
      expect(result).toEqual(fakeHistory);
    });

    it('should pass date-range filter params', async () => {
      http.get.mockResolvedValueOnce({
        data: { records: [], total: 0, page: 1, limit: 20, totalPages: 0 },
      });

      await mod.getHistory('asset-3', { from: '2025-01-01', to: '2025-06-30' });

      const params = http.get.mock.calls[0][1];
      expect(params).toEqual({ from: '2025-01-01', to: '2025-06-30' });
    });
  });

  // ========================================================================
  // submitValuation
  // ========================================================================

  describe('submitValuation', () => {
    const validInput = {
      totalAssetValue: '5000000',
    };

    it('should POST to valuations endpoint with validated body and return nav', async () => {
      const fakeNav = {
        id: 'nav-new',
        assetId: 'asset-1',
        navPerToken: '50',
        totalAssetValue: '5000000',
        liabilities: '0',
        netAssetValue: '5000000',
        totalSupply: '100000',
        currency: 'AED',
        decimals: 18,
        source: 'manual',
        computedAt: '2025-07-01T00:00:00Z',
      };
      http.post.mockResolvedValueOnce({ data: { nav: fakeNav } });

      const result = await mod.submitValuation('asset-1', validInput);

      expect(http.post).toHaveBeenCalledTimes(1);
      const [url, body] = http.post.mock.calls[0];
      expect(url).toBe('/api/v1/assets/asset-1/nav/valuations');
      expect(body).toMatchObject({ totalAssetValue: '5000000' });
      expect(result).toEqual({ nav: fakeNav });
    });

    it('should encode assetId in the URL', async () => {
      http.post.mockResolvedValueOnce({ data: { nav: {} } });

      await mod.submitValuation('asset/special', validInput);

      expect(http.post.mock.calls[0][0]).toBe(
        '/api/v1/assets/asset%2Fspecial/nav/valuations',
      );
    });

    it('should pass through optional fields (liabilities, currency, sources)', async () => {
      const fullInput = {
        totalAssetValue: '5000000',
        liabilities: '100000',
        currency: 'USD',
        decimals: 6,
        reason: 'Annual revaluation',
        sources: [
          { name: 'Appraiser X', value: '4900000', weight: 0.6 },
          { name: 'Appraiser Y', value: '5100000', weight: 0.4 },
        ],
      };
      http.post.mockResolvedValueOnce({ data: { nav: {} } });

      await mod.submitValuation('asset-1', fullInput);

      const body = http.post.mock.calls[0][1];
      expect(body.liabilities).toBe('100000');
      expect(body.currency).toBe('USD');
      expect(body.decimals).toBe(6);
      expect(body.reason).toBe('Annual revaluation');
      expect(body.sources).toHaveLength(2);
      expect(body.sources[0]).toEqual({ name: 'Appraiser X', value: '4900000', weight: 0.6 });
    });

    // ---- Validation failure tests ----

    it('should throw ValidationError when totalAssetValue is empty string', async () => {
      const bad = { totalAssetValue: '' };

      await expect(mod.submitValuation('asset-1', bad)).rejects.toBeInstanceOf(ValidationError);
      await expect(mod.submitValuation('asset-1', bad)).rejects.toThrow(/totalAssetValue/i);
      expect(http.post).not.toHaveBeenCalled();
    });

    it('should throw ValidationError when totalAssetValue is a non-numeric string', async () => {
      const bad = { totalAssetValue: 'abc-not-a-number' };

      try {
        await mod.submitValuation('asset-1', bad);
        expect.unreachable('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ValidationError);
        const ve = err as ValidationError;
        expect(ve.code).toBe('VALIDATION_ERROR');
        expect(ve.fieldErrors.some(e => e.path === 'totalAssetValue')).toBe(true);
      }
    });

    it('should throw ValidationError when totalAssetValue contains decimals (schema requires integer string)', async () => {
      const bad = { totalAssetValue: '5000.50' };

      await expect(mod.submitValuation('asset-1', bad)).rejects.toBeInstanceOf(ValidationError);
    });

    it('should throw ValidationError when totalAssetValue is missing entirely', async () => {
      const bad = {} as any;

      await expect(mod.submitValuation('asset-1', bad)).rejects.toBeInstanceOf(ValidationError);
    });

    it('should throw ValidationError when sources contain an entry with weight > 1', async () => {
      const bad = {
        totalAssetValue: '5000000',
        sources: [{ name: 'Bad', value: '5000000', weight: 1.5 }],
      };

      await expect(mod.submitValuation('asset-1', bad)).rejects.toBeInstanceOf(ValidationError);
    });
  });
});
