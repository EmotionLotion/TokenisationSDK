/**
 * InvestorTierModule - Unit Tests
 *
 * Tests the SDK module responsible for per-tier investment plans,
 * eligibility checks, and effective tier resolution.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InvestorTierModule } from '../modules/InvestorTierModule.js';
import type {
  InvestorPlan,
  TierEligibilityResult,
  InvestorTierInfo,
} from '../modules/InvestorTierModule.js';

// ============================================================================
// Mock HttpClient
// ============================================================================

function createMockHttp() {
  return {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  } as any;
}

// ============================================================================
// Fixtures
// ============================================================================

const SAMPLE_PLAN: InvestorPlan = {
  id: 'plan-001',
  assetId: 'asset-abc',
  tier: 'retail',
  name: 'Retail Plan',
  minInvestment: 500,
  maxInvestment: 50000,
  maxHoldingPercent: 5,
  managementFeePercent: 1.5,
  performanceFeePercent: 10,
  lockupDays: 365,
  accreditationRequired: false,
  currency: 'AED',
  active: true,
};

const INSTITUTIONAL_PLAN: InvestorPlan = {
  id: 'plan-002',
  assetId: 'asset-abc',
  tier: 'institutional',
  name: 'Institutional Plan',
  minInvestment: 1_000_000,
  maxInvestment: 50_000_000,
  maxHoldingPercent: 49,
  managementFeePercent: 0.5,
  performanceFeePercent: 5,
  lockupDays: 180,
  accreditationRequired: true,
  accreditationTypes: ['QIB', 'ADGM_PI'],
  currency: 'AED',
  active: true,
};

const SAMPLE_ELIGIBILITY: TierEligibilityResult = {
  eligible: true,
  tier: 'retail',
  plan: SAMPLE_PLAN,
  violations: [],
  maxAllowedAmount: 50000,
};

const SAMPLE_TIER_INFO: InvestorTierInfo = {
  investorId: 'inv-001',
  tier: 'qualified',
  accreditationStatus: 'verified',
  totalInvested: 125000,
  currency: 'AED',
};

// ============================================================================
// Tests
// ============================================================================

describe('InvestorTierModule', () => {
  let mockHttp: ReturnType<typeof createMockHttp>;
  let module: InvestorTierModule;

  beforeEach(() => {
    mockHttp = createMockHttp();
    module = new InvestorTierModule(mockHttp);
  });

  describe('instantiation', () => {
    it('can be instantiated with a mock HttpClient', () => {
      expect(module).toBeInstanceOf(InvestorTierModule);
    });
  });

  describe('getPlans', () => {
    it('calls GET /api/v1/assets/:assetId/plans', async () => {
      mockHttp.get.mockResolvedValue({
        data: { data: [SAMPLE_PLAN, INSTITUTIONAL_PLAN] },
      });

      const result = await module.getPlans('asset-abc');

      expect(mockHttp.get).toHaveBeenCalledTimes(1);
      expect(mockHttp.get).toHaveBeenCalledWith('/api/v1/assets/asset-abc/plans');
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(SAMPLE_PLAN);
      expect(result[1]).toEqual(INSTITUTIONAL_PLAN);
    });

    it('returns an empty array when no plans exist', async () => {
      mockHttp.get.mockResolvedValue({
        data: { data: [] },
      });

      const result = await module.getPlans('asset-empty');

      expect(result).toEqual([]);
      expect(mockHttp.get).toHaveBeenCalledWith('/api/v1/assets/asset-empty/plans');
    });

    it('interpolates the assetId correctly in the URL', async () => {
      mockHttp.get.mockResolvedValue({
        data: { data: [] },
      });

      await module.getPlans('asset-xyz-123');

      expect(mockHttp.get).toHaveBeenCalledWith('/api/v1/assets/asset-xyz-123/plans');
    });
  });

  describe('createPlan', () => {
    it('calls POST /api/v1/assets/:assetId/plans with plan data', async () => {
      const planInput = {
        tier: 'retail' as const,
        name: 'Retail Plan',
        minInvestment: 500,
        maxInvestment: 50000,
        maxHoldingPercent: 5,
        managementFeePercent: 1.5,
        performanceFeePercent: 10,
        lockupDays: 365,
        accreditationRequired: false,
        currency: 'AED',
        active: true,
      };

      mockHttp.post.mockResolvedValue({
        data: { data: SAMPLE_PLAN },
      });

      const result = await module.createPlan('asset-abc', planInput);

      expect(mockHttp.post).toHaveBeenCalledTimes(1);
      expect(mockHttp.post).toHaveBeenCalledWith(
        '/api/v1/assets/asset-abc/plans',
        planInput,
      );
      expect(result).toEqual(SAMPLE_PLAN);
    });

    it('returns the created plan with id and assetId populated', async () => {
      const planInput = {
        tier: 'institutional' as const,
        name: 'Institutional Plan',
        minInvestment: 1_000_000,
        maxInvestment: 50_000_000,
        maxHoldingPercent: 49,
        managementFeePercent: 0.5,
        performanceFeePercent: 5,
        lockupDays: 180,
        accreditationRequired: true,
        accreditationTypes: ['QIB', 'ADGM_PI'],
        currency: 'AED',
        active: true,
      };

      mockHttp.post.mockResolvedValue({
        data: { data: INSTITUTIONAL_PLAN },
      });

      const result = await module.createPlan('asset-abc', planInput);

      expect(result.id).toBe('plan-002');
      expect(result.assetId).toBe('asset-abc');
      expect(result.tier).toBe('institutional');
    });
  });

  describe('checkEligibility', () => {
    it('calls POST /api/v1/assets/:assetId/check-eligibility with investorId and amount', async () => {
      mockHttp.post.mockResolvedValue({
        data: { data: SAMPLE_ELIGIBILITY },
      });

      const result = await module.checkEligibility('asset-abc', 'inv-001', 10000);

      expect(mockHttp.post).toHaveBeenCalledTimes(1);
      expect(mockHttp.post).toHaveBeenCalledWith(
        '/api/v1/assets/asset-abc/check-eligibility',
        { investorId: 'inv-001', amount: 10000 },
      );
      expect(result).toEqual(SAMPLE_ELIGIBILITY);
    });

    it('returns eligible: true with no violations when investor qualifies', async () => {
      mockHttp.post.mockResolvedValue({
        data: { data: SAMPLE_ELIGIBILITY },
      });

      const result = await module.checkEligibility('asset-abc', 'inv-001', 10000);

      expect(result.eligible).toBe(true);
      expect(result.violations).toHaveLength(0);
      expect(result.plan).toBeDefined();
    });

    it('returns eligible: false with violations when investor does not qualify', async () => {
      const deniedResult: TierEligibilityResult = {
        eligible: false,
        tier: 'retail',
        plan: SAMPLE_PLAN,
        violations: [
          {
            rule: 'MAX_INVESTMENT',
            severity: 'BLOCK',
            message: 'Amount exceeds maximum retail investment of 50,000 AED',
            limit: 50000,
            actual: 100000,
          },
        ],
        maxAllowedAmount: 50000,
      };

      mockHttp.post.mockResolvedValue({
        data: { data: deniedResult },
      });

      const result = await module.checkEligibility('asset-abc', 'inv-001', 100000);

      expect(result.eligible).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].rule).toBe('MAX_INVESTMENT');
      expect(result.violations[0].severity).toBe('BLOCK');
    });

    it('uses correct URL interpolation for assetId', async () => {
      mockHttp.post.mockResolvedValue({
        data: { data: SAMPLE_ELIGIBILITY },
      });

      await module.checkEligibility('my-special-asset', 'inv-002', 5000);

      expect(mockHttp.post).toHaveBeenCalledWith(
        '/api/v1/assets/my-special-asset/check-eligibility',
        { investorId: 'inv-002', amount: 5000 },
      );
    });
  });

  describe('getEffectiveTier', () => {
    it('calls GET /api/v1/investors/:investorId/tier', async () => {
      mockHttp.get.mockResolvedValue({
        data: { data: SAMPLE_TIER_INFO },
      });

      const result = await module.getEffectiveTier('inv-001');

      expect(mockHttp.get).toHaveBeenCalledTimes(1);
      expect(mockHttp.get).toHaveBeenCalledWith('/api/v1/investors/inv-001/tier');
      expect(result).toEqual(SAMPLE_TIER_INFO);
    });

    it('correctly parses the tier info response', async () => {
      mockHttp.get.mockResolvedValue({
        data: { data: SAMPLE_TIER_INFO },
      });

      const result = await module.getEffectiveTier('inv-001');

      expect(result.investorId).toBe('inv-001');
      expect(result.tier).toBe('qualified');
      expect(result.accreditationStatus).toBe('verified');
      expect(result.totalInvested).toBe(125000);
      expect(result.currency).toBe('AED');
    });

    it('interpolates the investorId correctly in the URL', async () => {
      mockHttp.get.mockResolvedValue({
        data: {
          data: {
            investorId: 'inv-xyz-999',
            tier: 'professional',
            accreditationStatus: 'pending',
            totalInvested: 0,
            currency: 'USD',
          },
        },
      });

      const result = await module.getEffectiveTier('inv-xyz-999');

      expect(mockHttp.get).toHaveBeenCalledWith('/api/v1/investors/inv-xyz-999/tier');
      expect(result.tier).toBe('professional');
    });
  });

  describe('error handling', () => {
    it('propagates HTTP errors from getPlans', async () => {
      mockHttp.get.mockRejectedValue(new Error('Network error'));

      await expect(module.getPlans('asset-fail')).rejects.toThrow('Network error');
    });

    it('propagates HTTP errors from createPlan', async () => {
      mockHttp.post.mockRejectedValue(new Error('401 Unauthorized'));

      await expect(
        module.createPlan('asset-fail', {
          tier: 'retail',
          name: 'X',
          minInvestment: 0,
          maxInvestment: 0,
          maxHoldingPercent: 0,
          managementFeePercent: 0,
          performanceFeePercent: 0,
          lockupDays: 0,
          accreditationRequired: false,
          currency: 'AED',
          active: false,
        }),
      ).rejects.toThrow('401 Unauthorized');
    });

    it('propagates HTTP errors from checkEligibility', async () => {
      mockHttp.post.mockRejectedValue(new Error('500 Internal Server Error'));

      await expect(
        module.checkEligibility('asset-fail', 'inv-001', 1000),
      ).rejects.toThrow('500 Internal Server Error');
    });

    it('propagates HTTP errors from getEffectiveTier', async () => {
      mockHttp.get.mockRejectedValue(new Error('404 Not Found'));

      await expect(
        module.getEffectiveTier('inv-nonexistent'),
      ).rejects.toThrow('404 Not Found');
    });
  });
});
