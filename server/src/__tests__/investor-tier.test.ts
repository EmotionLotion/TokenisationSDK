/**
 * Investor Tier Service - Unit Tests
 *
 * Tests getPlans (default seeding, idempotency), createPlan,
 * checkTierEligibility (all VARA rules), and getInvestorTierInfo.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getPlans,
  createPlan,
  checkTierEligibility,
  getInvestorTierInfo,
} from '../services/investor-tier.service.js';
import { db, investorTierAssignments } from '../config/database.js';

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

let assetCounter = 0;
function uniqueAssetId(): string {
  return `asset-tier-${Date.now()}-${++assetCounter}`;
}

let investorCounter = 0;
function uniqueInvestorId(): string {
  return `inv-tier-${Date.now()}-${++investorCounter}`;
}

/** Seed an investor tier assignment row directly in DB. */
async function seedInvestorTier(
  investorId: string,
  tier: string,
  accreditationStatus: string = 'none',
  totalInvested: number = 0,
) {
  await (db as any).insert(investorTierAssignments).values({
    id: `ita-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    investorId,
    tier,
    accreditationStatus,
    totalInvested: String(totalInvested),
  });
}

// ============================================================================
// Tests
// ============================================================================

describe('Investor Tier Service', () => {
  // --------------------------------------------------------------------------
  // getPlans
  // --------------------------------------------------------------------------
  describe('getPlans', () => {
    it('returns 4 default VARA plans when none exist for an asset', async () => {
      const plans = await getPlans(uniqueAssetId());
      expect(plans).toHaveLength(4);
    });

    it('returns plans with the correct tiers', async () => {
      const plans = await getPlans(uniqueAssetId());
      const tiers = plans.map(p => p.tier);
      expect(tiers).toEqual(['retail', 'qualified', 'professional', 'institutional']);
    });

    it('seeds plans to DB idempotently (second call returns same count and IDs)', async () => {
      const assetId = uniqueAssetId();
      const first = await getPlans(assetId);
      const second = await getPlans(assetId);
      expect(second).toHaveLength(4);
      // Same plan IDs in same order
      expect(first.map(p => p.id)).toEqual(second.map(p => p.id));
      // Same core fields
      for (let i = 0; i < 4; i++) {
        expect(first[i].tier).toBe(second[i].tier);
        expect(first[i].minInvestment).toBe(second[i].minInvestment);
        expect(first[i].maxInvestment).toBe(second[i].maxInvestment);
      }
    });

    it('returns different plans for different assets', async () => {
      const plansA = await getPlans(uniqueAssetId());
      const plansB = await getPlans(uniqueAssetId());
      expect(plansA[0].id).not.toBe(plansB[0].id);
    });

    it('default retail plan has correct VARA limits', async () => {
      const plans = await getPlans(uniqueAssetId());
      const retail = plans.find(p => p.tier === 'retail')!;
      expect(retail.minInvestment).toBe(1000);
      expect(retail.maxInvestment).toBe(500000);
      expect(retail.maxHoldingPercent).toBe(10);
      expect(retail.accreditationRequired).toBe(false);
      expect(retail.currency).toBe('AED');
      expect(retail.active).toBe(true);
    });

    it('default institutional plan allows up to 100% holding', async () => {
      const plans = await getPlans(uniqueAssetId());
      const institutional = plans.find(p => p.tier === 'institutional')!;
      expect(institutional.maxHoldingPercent).toBe(100);
      expect(institutional.accreditationRequired).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // createPlan
  // --------------------------------------------------------------------------
  describe('createPlan', () => {
    it('creates a custom plan and returns it with correct fields', async () => {
      const assetId = uniqueAssetId();
      const plan = await createPlan(assetId, {
        tier: 'retail',
        name: 'Custom Retail',
        minInvestment: 500,
        maxInvestment: 100000,
        maxHoldingPercent: 5,
        managementFeePercent: 2,
        performanceFeePercent: 0,
        lockupDays: 60,
        accreditationRequired: false,
        currency: 'AED',
        active: true,
      });

      expect(plan.id).toContain(`plan-${assetId}-retail`);
      expect(plan.assetId).toBe(assetId);
      expect(plan.tier).toBe('retail');
      expect(plan.name).toBe('Custom Retail');
      expect(plan.minInvestment).toBe(500);
      expect(plan.maxInvestment).toBe(100000);
    });

    it('created plan is retrievable via getPlans after defaults are seeded', async () => {
      const assetId = uniqueAssetId();
      // Seed defaults first
      await getPlans(assetId);
      // Create an additional plan
      await createPlan(assetId, {
        tier: 'retail',
        name: 'Promo Retail',
        minInvestment: 100,
        maxInvestment: 50000,
        maxHoldingPercent: 3,
        managementFeePercent: 1,
        performanceFeePercent: 0,
        lockupDays: 30,
        accreditationRequired: false,
        currency: 'AED',
        active: true,
      });

      const allPlans = await getPlans(assetId);
      // Should now have 5 plans (4 defaults + 1 custom)
      expect(allPlans).toHaveLength(5);
    });
  });

  // --------------------------------------------------------------------------
  // checkTierEligibility
  // --------------------------------------------------------------------------
  describe('checkTierEligibility', () => {
    it('returns eligible=true for a valid retail investment', async () => {
      const assetId = uniqueAssetId();
      const investorId = uniqueInvestorId();
      const result = await checkTierEligibility(assetId, investorId, 50000);

      expect(result.eligible).toBe(true);
      expect(result.tier).toBe('retail');
      expect(result.violations).toHaveLength(0);
      expect(result.maxAllowedAmount).toBeGreaterThan(0);
    });

    it('returns BLOCK violation when amount is below minimum investment', async () => {
      const assetId = uniqueAssetId();
      const investorId = uniqueInvestorId();
      const result = await checkTierEligibility(assetId, investorId, 100);

      expect(result.eligible).toBe(false);
      const minViolation = result.violations.find(v => v.rule === 'VARA_MIN_INVESTMENT');
      expect(minViolation).toBeDefined();
      expect(minViolation!.severity).toBe('BLOCK');
      expect(result.maxAllowedAmount).toBe(0);
    });

    it('returns BLOCK violation when amount exceeds maximum investment', async () => {
      const assetId = uniqueAssetId();
      const investorId = uniqueInvestorId();
      const result = await checkTierEligibility(assetId, investorId, 1000000);

      expect(result.eligible).toBe(false);
      const maxViolation = result.violations.find(v => v.rule === 'VARA_MAX_RETAIL_INVESTMENT');
      expect(maxViolation).toBeDefined();
      expect(maxViolation!.severity).toBe('BLOCK');
      expect(result.maxAllowedAmount).toBe(0);
    });

    it('returns BLOCK violation when accreditation is required but missing', async () => {
      const assetId = uniqueAssetId();
      const investorId = uniqueInvestorId();
      // Assign investor as qualified tier but with no accreditation
      await seedInvestorTier(investorId, 'qualified', 'none', 0);

      const result = await checkTierEligibility(assetId, investorId, 600000);

      expect(result.eligible).toBe(false);
      expect(result.tier).toBe('qualified');
      const accredViolation = result.violations.find(v => v.rule === 'VARA_QUALIFIED_INVESTOR');
      expect(accredViolation).toBeDefined();
      expect(accredViolation!.severity).toBe('BLOCK');
    });

    it('returns BLOCK violation for holding limit exceeded', async () => {
      const assetId = uniqueAssetId();
      const investorId = uniqueInvestorId();
      // Investor already has 400,000 invested in retail tier (max 500,000)
      await seedInvestorTier(investorId, 'retail', 'none', 400000);

      // Trying to invest 200,000 more (total would be 600,000 > 500,000 max)
      const result = await checkTierEligibility(assetId, investorId, 200000);

      expect(result.eligible).toBe(false);
      const holdingViolation = result.violations.find(v => v.rule === 'VARA_MAX_HOLDING');
      expect(holdingViolation).toBeDefined();
      expect(holdingViolation!.severity).toBe('BLOCK');
    });

    it('eligible result includes correct maxAllowedAmount', async () => {
      const assetId = uniqueAssetId();
      const investorId = uniqueInvestorId();
      await seedInvestorTier(investorId, 'retail', 'none', 100000);

      const result = await checkTierEligibility(assetId, investorId, 50000);

      expect(result.eligible).toBe(true);
      // maxAllowed = 500,000 (max) - 100,000 (already invested) = 400,000
      expect(result.maxAllowedAmount).toBe(400000);
    });

    it('ineligible result has maxAllowedAmount=0', async () => {
      const assetId = uniqueAssetId();
      const investorId = uniqueInvestorId();
      const result = await checkTierEligibility(assetId, investorId, 100);

      expect(result.eligible).toBe(false);
      expect(result.maxAllowedAmount).toBe(0);
    });

    it('unknown investor defaults to retail tier', async () => {
      const assetId = uniqueAssetId();
      const result = await checkTierEligibility(assetId, 'unknown-inv-xyz', 50000);

      expect(result.tier).toBe('retail');
      expect(result.plan).not.toBeNull();
      expect(result.plan!.tier).toBe('retail');
    });

    it('qualified investor with accreditation can invest in qualified tier range', async () => {
      const assetId = uniqueAssetId();
      const investorId = uniqueInvestorId();
      await seedInvestorTier(investorId, 'qualified', 'qualified', 0);

      const result = await checkTierEligibility(assetId, investorId, 1000000);

      expect(result.eligible).toBe(true);
      expect(result.tier).toBe('qualified');
      expect(result.violations).toHaveLength(0);
    });

    it('returns the matching plan in the result', async () => {
      const assetId = uniqueAssetId();
      const investorId = uniqueInvestorId();
      const result = await checkTierEligibility(assetId, investorId, 50000);

      expect(result.plan).not.toBeNull();
      expect(result.plan!.assetId).toBe(assetId);
      expect(result.plan!.tier).toBe('retail');
    });
  });

  // --------------------------------------------------------------------------
  // getInvestorTierInfo
  // --------------------------------------------------------------------------
  describe('getInvestorTierInfo', () => {
    it('returns default retail tier for unknown investor', async () => {
      const info = await getInvestorTierInfo('unknown-inv-999');

      expect(info.investorId).toBe('unknown-inv-999');
      expect(info.tier).toBe('retail');
      expect(info.accreditationStatus).toBe('none');
      expect(info.totalInvested).toBe(0);
      expect(info.currency).toBe('AED');
    });

    it('returns assigned tier for known investor', async () => {
      const investorId = uniqueInvestorId();
      await seedInvestorTier(investorId, 'professional', 'professional', 5000000);

      const info = await getInvestorTierInfo(investorId);

      expect(info.investorId).toBe(investorId);
      expect(info.tier).toBe('professional');
      expect(info.accreditationStatus).toBe('professional');
      expect(info.totalInvested).toBe(5000000);
    });

    it('returns correct currency (always AED)', async () => {
      const investorId = uniqueInvestorId();
      await seedInvestorTier(investorId, 'institutional', 'institutional', 10000000);

      const info = await getInvestorTierInfo(investorId);
      expect(info.currency).toBe('AED');
    });
  });
});
