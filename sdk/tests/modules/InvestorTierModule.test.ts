/**
 * InvestorTierModule Tests
 *
 * Comprehensive tests for investor tier management including plan CRUD,
 * eligibility checks, tier assignment, URL encoding, and input validation.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InvestorTierModule, ValidationError } from '@tokenisation/realestate';

// ---------------------------------------------------------------------------
// Mock HttpClient
// ---------------------------------------------------------------------------

function createMockHttp() {
  return {
    get: vi.fn().mockResolvedValue({ data: { data: {} } }),
    post: vi.fn().mockResolvedValue({ data: { data: {} } }),
    put: vi.fn().mockResolvedValue({ data: { data: {} } }),
    patch: vi.fn().mockResolvedValue({ data: { data: {} } }),
    delete: vi.fn().mockResolvedValue({ data: { data: {} } }),
    list: vi.fn().mockResolvedValue({ data: [], total: 0 }),
  } as any;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('InvestorTierModule', () => {
  let mod: InvestorTierModule;
  let http: ReturnType<typeof createMockHttp>;

  beforeEach(() => {
    http = createMockHttp();
    mod = new InvestorTierModule(http);
  });

  // ========================================================================
  // getPlans
  // ========================================================================

  describe('getPlans', () => {
    it('should GET the correct URL for a plain assetId', async () => {
      http.get.mockResolvedValue({ data: { data: [] } });

      await mod.getPlans('asset-1');

      expect(http.get).toHaveBeenCalledWith('/api/v1/assets/asset-1/plans');
    });

    it('should return response.data.data (the plans array)', async () => {
      const fakePlan = {
        id: 'plan-1',
        assetId: 'a1',
        tier: 'retail',
        name: 'Retail Plan',
        minInvestment: 1000,
        maxInvestment: 50000,
        maxHoldingPercent: 5,
        managementFeePercent: 1.5,
        performanceFeePercent: 10,
        lockupDays: 90,
        accreditationRequired: false,
        currency: 'AED',
        active: true,
      };
      http.get.mockResolvedValue({ data: { data: [fakePlan] } });

      const result = await mod.getPlans('a1');

      expect(result).toEqual([fakePlan]);
    });

    it('should encode special characters in assetId (e.g. "asset/1")', async () => {
      http.get.mockResolvedValue({ data: { data: [] } });

      await mod.getPlans('asset/1');

      const calledUrl = http.get.mock.calls[0][0];
      expect(calledUrl).toBe(`/api/v1/assets/${encodeURIComponent('asset/1')}/plans`);
      expect(calledUrl).toContain('asset%2F1');
    });

    it('should encode assetId with spaces and ampersands', async () => {
      http.get.mockResolvedValue({ data: { data: [] } });

      await mod.getPlans('asset 1&2');

      const calledUrl = http.get.mock.calls[0][0];
      expect(calledUrl).toBe(`/api/v1/assets/${encodeURIComponent('asset 1&2')}/plans`);
    });
  });

  // ========================================================================
  // createPlan
  // ========================================================================

  describe('createPlan', () => {
    const validPlan = {
      tier: 'qualified' as const,
      name: 'Qualified Investor Plan',
      minInvestment: 10000,
      maxInvestment: 500000,
      maxHoldingPercent: 20,
      managementFeePercent: 1,
      performanceFeePercent: 15,
      lockupDays: 180,
      accreditationRequired: true,
      accreditationTypes: ['cma', 'sca'],
      currency: 'AED',
      active: true,
    };

    it('should POST to the correct URL with the plan body', async () => {
      const created = { id: 'plan-new', assetId: 'a1', ...validPlan };
      http.post.mockResolvedValue({ data: { data: created } });

      const result = await mod.createPlan('a1', validPlan);

      expect(http.post).toHaveBeenCalledWith(
        '/api/v1/assets/a1/plans',
        validPlan,
      );
      expect(result).toEqual(created);
    });

    it('should encode special characters in assetId for createPlan', async () => {
      http.post.mockResolvedValue({ data: { data: {} } });

      await mod.createPlan('asset/special', validPlan);

      const calledUrl = http.post.mock.calls[0][0];
      expect(calledUrl).toBe(`/api/v1/assets/${encodeURIComponent('asset/special')}/plans`);
    });
  });

  // ========================================================================
  // checkEligibility
  // ========================================================================

  describe('checkEligibility', () => {
    it('should POST validated body to the correct URL', async () => {
      const eligibilityResult = {
        eligible: true,
        tier: 'retail',
        plan: null,
        violations: [],
        maxAllowedAmount: 50000,
      };
      http.post.mockResolvedValue({ data: { data: eligibilityResult } });

      const result = await mod.checkEligibility('a1', 'inv-1', 5000);

      expect(http.post).toHaveBeenCalledWith(
        '/api/v1/assets/a1/check-eligibility',
        { investorId: 'inv-1', amount: 5000 },
      );
      expect(result).toEqual(eligibilityResult);
    });

    it('should throw ValidationError when amount is zero', async () => {
      await expect(
        mod.checkEligibility('a1', 'inv-1', 0),
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError when amount is negative', async () => {
      await expect(
        mod.checkEligibility('a1', 'inv-1', -100),
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError when investorId is empty', async () => {
      await expect(
        mod.checkEligibility('a1', '', 1000),
      ).rejects.toThrow(ValidationError);
    });

    it('should encode special characters in assetId for checkEligibility', async () => {
      http.post.mockResolvedValue({ data: { data: {} } });

      await mod.checkEligibility('asset/1', 'inv-1', 5000);

      const calledUrl = http.post.mock.calls[0][0];
      expect(calledUrl).toBe(`/api/v1/assets/${encodeURIComponent('asset/1')}/check-eligibility`);
    });
  });

  // ========================================================================
  // assignTier
  // ========================================================================

  describe('assignTier', () => {
    it('should POST the correct body to the investor tier URL', async () => {
      const tierInfo = {
        investorId: 'inv-1',
        tier: 'qualified',
        accreditationStatus: 'verified',
        totalInvested: 25000,
        currency: 'AED',
      };
      http.post.mockResolvedValue({ data: { data: tierInfo } });

      const result = await mod.assignTier('inv-1', {
        tier: 'qualified',
        accreditationStatus: 'verified',
        totalInvested: 25000,
      });

      expect(http.post).toHaveBeenCalledWith(
        '/api/v1/investors/inv-1/tier',
        { tier: 'qualified', accreditationStatus: 'verified', totalInvested: 25000 },
      );
      expect(result).toEqual(tierInfo);
    });

    it('should send correct body with only the required tier field', async () => {
      http.post.mockResolvedValue({ data: { data: {} } });

      await mod.assignTier('inv-2', { tier: 'retail' });

      const postedBody = http.post.mock.calls[0][1];
      expect(postedBody).toHaveProperty('tier', 'retail');
      // Defaults should be applied by the schema
      expect(postedBody).toHaveProperty('accreditationStatus', 'none');
      expect(postedBody).toHaveProperty('totalInvested', 0);
    });

    it('should throw ValidationError for an invalid tier value', async () => {
      await expect(
        mod.assignTier('inv-1', { tier: 'vip' as any }),
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for an empty-string tier', async () => {
      await expect(
        mod.assignTier('inv-1', { tier: '' as any }),
      ).rejects.toThrow(ValidationError);
    });

    it('should accept all valid tier values', async () => {
      http.post.mockResolvedValue({ data: { data: {} } });

      for (const tier of ['retail', 'qualified', 'professional', 'institutional'] as const) {
        await mod.assignTier('inv-1', { tier });
        const postedBody = http.post.mock.calls.at(-1)![1];
        expect(postedBody).toHaveProperty('tier', tier);
      }
    });

    it('should encode special characters in investorId', async () => {
      http.post.mockResolvedValue({ data: { data: {} } });

      await mod.assignTier('inv/special', { tier: 'retail' });

      const calledUrl = http.post.mock.calls[0][0];
      expect(calledUrl).toBe(`/api/v1/investors/${encodeURIComponent('inv/special')}/tier`);
    });

    it('should throw ValidationError when totalInvested is negative', async () => {
      await expect(
        mod.assignTier('inv-1', { tier: 'retail', totalInvested: -500 }),
      ).rejects.toThrow(ValidationError);
    });
  });

  // ========================================================================
  // getEffectiveTier
  // ========================================================================

  describe('getEffectiveTier', () => {
    it('should GET the correct URL for a plain investorId', async () => {
      const tierInfo = {
        investorId: 'inv-1',
        tier: 'retail',
        accreditationStatus: 'none',
        totalInvested: 0,
        currency: 'AED',
      };
      http.get.mockResolvedValue({ data: { data: tierInfo } });

      const result = await mod.getEffectiveTier('inv-1');

      expect(http.get).toHaveBeenCalledWith('/api/v1/investors/inv-1/tier');
      expect(result).toEqual(tierInfo);
    });

    it('should encode special characters in investorId (e.g. "inv/1")', async () => {
      http.get.mockResolvedValue({ data: { data: {} } });

      await mod.getEffectiveTier('inv/1');

      const calledUrl = http.get.mock.calls[0][0];
      expect(calledUrl).toBe(`/api/v1/investors/${encodeURIComponent('inv/1')}/tier`);
      expect(calledUrl).toContain('inv%2F1');
    });
  });

  // ========================================================================
  // ValidationError shape
  // ========================================================================

  describe('ValidationError shape', () => {
    it('should include fieldErrors with path and message for eligibility failures', async () => {
      try {
        await mod.checkEligibility('a1', '', -1);
        expect.fail('Expected ValidationError to be thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ValidationError);
        const ve = err as ValidationError;
        expect(ve.code).toBe('VALIDATION_ERROR');
        expect(ve.fieldErrors).toBeInstanceOf(Array);
        expect(ve.fieldErrors.length).toBeGreaterThan(0);
        for (const fe of ve.fieldErrors) {
          expect(fe).toHaveProperty('path');
          expect(fe).toHaveProperty('message');
        }
      }
    });

    it('should include fieldErrors with path and message for assignTier failures', async () => {
      try {
        await mod.assignTier('inv-1', { tier: 'bogus' as any });
        expect.fail('Expected ValidationError to be thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ValidationError);
        const ve = err as ValidationError;
        expect(ve.code).toBe('VALIDATION_ERROR');
        expect(ve.fieldErrors.length).toBeGreaterThan(0);
        const tierError = ve.fieldErrors.find(e => e.path === 'tier');
        expect(tierError).toBeDefined();
      }
    });
  });
});
