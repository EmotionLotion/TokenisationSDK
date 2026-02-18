/**
 * Investor Tier Service
 *
 * Server-side enforcement of per-tier investment limits.
 * Reads plans from DB or seeds defaults from VARA compliance rules.
 * VARA_MAX_RETAIL_INVESTMENT is severity BLOCK (not WARN).
 */

import { eq } from 'drizzle-orm';
import { db, investorPlans, investorTierAssignments } from '../config/database.js';
import { logger } from '../middleware/logger.js';

// ============================================================================
// Types
// ============================================================================

export type InvestorTier = 'retail' | 'qualified' | 'professional' | 'institutional';

export interface InvestorPlan {
  id: string;
  assetId: string;
  tier: InvestorTier;
  name: string;
  minInvestment: number;
  maxInvestment: number;
  maxHoldingPercent: number;
  managementFeePercent: number;
  performanceFeePercent: number;
  lockupDays: number;
  accreditationRequired: boolean;
  accreditationTypes?: string[];
  currency: string;
  active: boolean;
}

export interface TierEligibilityResult {
  eligible: boolean;
  tier: InvestorTier;
  plan: InvestorPlan | null;
  violations: TierViolation[];
  maxAllowedAmount: number;
}

export interface TierViolation {
  rule: string;
  severity: 'BLOCK' | 'WARN';
  message: string;
  limit?: number;
  actual?: number;
}

// ============================================================================
// VARA Default Plans
// ============================================================================

function getDefaultPlans(assetId: string): InvestorPlan[] {
  return [
    {
      id: `plan-${assetId}-retail`,
      assetId,
      tier: 'retail',
      name: 'Retail Investor',
      minInvestment: 1000,
      maxInvestment: 500000,
      maxHoldingPercent: 10,
      managementFeePercent: 1.5,
      performanceFeePercent: 0,
      lockupDays: 90,
      accreditationRequired: false,
      currency: 'AED',
      active: true,
    },
    {
      id: `plan-${assetId}-qualified`,
      assetId,
      tier: 'qualified',
      name: 'Qualified Investor',
      minInvestment: 500000,
      maxInvestment: 5000000,
      maxHoldingPercent: 25,
      managementFeePercent: 1.0,
      performanceFeePercent: 10,
      lockupDays: 90,
      accreditationRequired: true,
      accreditationTypes: ['qualified', 'high_net_worth'],
      currency: 'AED',
      active: true,
    },
    {
      id: `plan-${assetId}-professional`,
      assetId,
      tier: 'professional',
      name: 'Professional Investor',
      minInvestment: 1000000,
      maxInvestment: 25000000,
      maxHoldingPercent: 50,
      managementFeePercent: 0.75,
      performanceFeePercent: 15,
      lockupDays: 60,
      accreditationRequired: true,
      accreditationTypes: ['professional'],
      currency: 'AED',
      active: true,
    },
    {
      id: `plan-${assetId}-institutional`,
      assetId,
      tier: 'institutional',
      name: 'Institutional Investor',
      minInvestment: 5000000,
      maxInvestment: 100000000,
      maxHoldingPercent: 100,
      managementFeePercent: 0.5,
      performanceFeePercent: 20,
      lockupDays: 30,
      accreditationRequired: true,
      accreditationTypes: ['institutional'],
      currency: 'AED',
      active: true,
    },
  ];
}

// ============================================================================
// DB row → domain object
// ============================================================================

function rowToPlan(row: any): InvestorPlan {
  return {
    id: row.id,
    assetId: row.assetId ?? row.asset_id,
    tier: (row.tier as InvestorTier),
    name: row.name,
    minInvestment: Number(row.minInvestment ?? row.min_investment),
    maxInvestment: Number(row.maxInvestment ?? row.max_investment),
    maxHoldingPercent: Number(row.maxHoldingPercent ?? row.max_holding_percent),
    managementFeePercent: Number(row.managementFeePercent ?? row.management_fee_percent),
    performanceFeePercent: Number(row.performanceFeePercent ?? row.performance_fee_percent),
    lockupDays: Number(row.lockupDays ?? row.lockup_days),
    accreditationRequired: Boolean(row.accreditationRequired ?? row.accreditation_required),
    accreditationTypes: typeof (row.accreditationTypes ?? row.accreditation_types) === 'string'
      ? JSON.parse(row.accreditationTypes ?? row.accreditation_types ?? '[]')
      : (row.accreditationTypes ?? row.accreditation_types ?? []),
    currency: row.currency,
    active: Boolean(row.active),
  };
}

// ============================================================================
// Service Functions
// ============================================================================

export async function getPlans(assetId: string): Promise<InvestorPlan[]> {
  const rows = await (db as any).select().from(investorPlans).where(eq(investorPlans.assetId, assetId));
  if (rows.length > 0) return rows.map(rowToPlan);

  // Seed default VARA plans for this asset
  const defaults = getDefaultPlans(assetId);
  for (const plan of defaults) {
    await (db as any).insert(investorPlans).values({
      id: plan.id,
      assetId: plan.assetId,
      tier: plan.tier,
      name: plan.name,
      minInvestment: String(plan.minInvestment),
      maxInvestment: String(plan.maxInvestment),
      maxHoldingPercent: String(plan.maxHoldingPercent),
      managementFeePercent: String(plan.managementFeePercent),
      performanceFeePercent: String(plan.performanceFeePercent),
      lockupDays: plan.lockupDays,
      accreditationRequired: plan.accreditationRequired ? 1 : 0,
      accreditationTypes: JSON.stringify(plan.accreditationTypes ?? []),
      currency: plan.currency,
      active: plan.active ? 1 : 0,
    });
  }
  return defaults;
}

export async function createPlan(assetId: string, plan: Omit<InvestorPlan, 'id' | 'assetId'>): Promise<InvestorPlan> {
  const newPlan: InvestorPlan = {
    ...plan,
    id: `plan-${assetId}-${plan.tier}-${Date.now()}`,
    assetId,
  };

  await (db as any).insert(investorPlans).values({
    id: newPlan.id,
    assetId: newPlan.assetId,
    tier: newPlan.tier,
    name: newPlan.name,
    minInvestment: String(newPlan.minInvestment),
    maxInvestment: String(newPlan.maxInvestment),
    maxHoldingPercent: String(newPlan.maxHoldingPercent),
    managementFeePercent: String(newPlan.managementFeePercent),
    performanceFeePercent: String(newPlan.performanceFeePercent),
    lockupDays: newPlan.lockupDays,
    accreditationRequired: newPlan.accreditationRequired ? 1 : 0,
    accreditationTypes: JSON.stringify(newPlan.accreditationTypes ?? []),
    currency: newPlan.currency,
    active: newPlan.active ? 1 : 0,
  });

  logger.info('Created investor plan', { assetId, tier: plan.tier });
  return newPlan;
}

export async function checkTierEligibility(
  assetId: string,
  investorId: string,
  amount: number,
): Promise<TierEligibilityResult> {
  const plans = await getPlans(assetId);

  // Look up investor tier from DB, default to retail
  const tierRows = await (db as any).select().from(investorTierAssignments).where(eq(investorTierAssignments.investorId, investorId));
  const investorInfo = tierRows.length > 0
    ? { tier: tierRows[0].tier as InvestorTier, accreditationStatus: tierRows[0].accreditationStatus ?? tierRows[0].accreditation_status, totalInvested: Number(tierRows[0].totalInvested ?? tierRows[0].total_invested) }
    : { tier: 'retail' as InvestorTier, accreditationStatus: 'none', totalInvested: 0 };

  const tier = investorInfo.tier;
  const plan = plans.find(p => p.tier === tier && p.active) || null;
  const violations: TierViolation[] = [];

  if (!plan) {
    return {
      eligible: false,
      tier,
      plan: null,
      violations: [{ rule: 'NO_PLAN', severity: 'BLOCK', message: `No active plan for tier: ${tier}` }],
      maxAllowedAmount: 0,
    };
  }

  // VARA_MIN_INVESTMENT check
  if (amount < plan.minInvestment) {
    violations.push({
      rule: 'VARA_MIN_INVESTMENT',
      severity: 'BLOCK',
      message: `Minimum investment is ${plan.minInvestment} ${plan.currency}`,
      limit: plan.minInvestment,
      actual: amount,
    });
  }

  // VARA_MAX_RETAIL_INVESTMENT check (severity: BLOCK)
  if (amount > plan.maxInvestment) {
    violations.push({
      rule: 'VARA_MAX_RETAIL_INVESTMENT',
      severity: 'BLOCK',
      message: `Maximum investment for ${tier} tier is ${plan.maxInvestment} ${plan.currency}`,
      limit: plan.maxInvestment,
      actual: amount,
    });
  }

  // VARA_QUALIFIED_INVESTOR check
  if (plan.accreditationRequired && investorInfo.accreditationStatus === 'none') {
    violations.push({
      rule: 'VARA_QUALIFIED_INVESTOR',
      severity: 'BLOCK',
      message: `${tier} tier requires accreditation`,
    });
  }

  // VARA_MAX_HOLDING check (simplified — would check total exposure in production)
  const totalAfterInvestment = investorInfo.totalInvested + amount;
  if (plan.maxHoldingPercent < 100) {
    if (totalAfterInvestment > plan.maxInvestment) {
      violations.push({
        rule: 'VARA_MAX_HOLDING',
        severity: 'BLOCK',
        message: `Total holding would exceed ${plan.maxHoldingPercent}% limit`,
        limit: plan.maxInvestment,
        actual: totalAfterInvestment,
      });
    }
  }

  const hasBlockingViolation = violations.some(v => v.severity === 'BLOCK');
  const maxAllowed = Math.max(0, plan.maxInvestment - investorInfo.totalInvested);

  return {
    eligible: !hasBlockingViolation,
    tier,
    plan,
    violations,
    maxAllowedAmount: hasBlockingViolation ? 0 : maxAllowed,
  };
}

export async function getInvestorTierInfo(investorId: string): Promise<{
  investorId: string;
  tier: InvestorTier;
  accreditationStatus: string;
  totalInvested: number;
  currency: string;
}> {
  const rows = await (db as any).select().from(investorTierAssignments).where(eq(investorTierAssignments.investorId, investorId));
  if (rows.length > 0) {
    const row = rows[0];
    return {
      investorId,
      tier: row.tier as InvestorTier,
      accreditationStatus: row.accreditationStatus ?? row.accreditation_status ?? 'none',
      totalInvested: Number(row.totalInvested ?? row.total_invested ?? 0),
      currency: 'AED',
    };
  }
  return { investorId, tier: 'retail', accreditationStatus: 'none', totalInvested: 0, currency: 'AED' };
}
