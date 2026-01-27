/**
 * Billing Service
 *
 * Provides billing and quota management capabilities:
 * - Plan management (free, starter, growth, enterprise)
 * - Quota enforcement
 * - Invoice generation
 * - Usage summaries
 *
 * @packageDocumentation
 */

import { db } from '../config/database.js';
import { billingPlans, orgBilling, usageQuotas, usageRecords, orgs } from '../db/schema.js';
import { eq, and, sql, gte, lte, desc } from 'drizzle-orm';
import { logger } from '../middleware/logger.js';
import { usageService } from './usage.service.js';

// ============================================================================
// TYPES
// ============================================================================

export interface BillingPlan {
  id: string;
  name: string;
  quotas: Record<string, number>;
  features: Record<string, boolean>;
  priceMonthly: number | null; // in cents
}

export interface OrgBillingInfo {
  id: string;
  orgId: string;
  plan: BillingPlan;
  status: 'active' | 'suspended' | 'cancelled';
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  stripeCustomerId?: string;
}

export interface Invoice {
  id: string;
  orgId: string;
  period: {
    start: Date;
    end: Date;
  };
  plan: BillingPlan;
  lineItems: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
  subtotal: number;
  tax: number;
  total: number;
  status: 'draft' | 'issued' | 'paid' | 'overdue';
  issuedAt?: Date;
  dueAt?: Date;
  paidAt?: Date;
}

export interface UsageSummary {
  orgId: string;
  plan: BillingPlan;
  billingPeriod: {
    start: Date;
    end: Date;
  };
  quotaUsage: Array<{
    resource: string;
    limit: number;
    used: number;
    remaining: number;
    percentUsed: number;
  }>;
  projectedOverage: Array<{
    resource: string;
    projectedUsage: number;
    overageAmount: number;
  }>;
}

// ============================================================================
// DEFAULT PLANS
// ============================================================================

export const DEFAULT_PLANS: BillingPlan[] = [
  {
    id: 'free',
    name: 'Free',
    quotas: {
      api_calls: 1000,
      webhooks: 100,
      tokens: 5,
      investors: 50,
      transfers: 100,
    },
    features: {
      oauth: false,
      webhooks: true,
      priority_support: false,
      custom_branding: false,
      sla: false,
    },
    priceMonthly: 0,
  },
  {
    id: 'starter',
    name: 'Starter',
    quotas: {
      api_calls: 10000,
      webhooks: 1000,
      tokens: 25,
      investors: 500,
      transfers: 1000,
    },
    features: {
      oauth: true,
      webhooks: true,
      priority_support: false,
      custom_branding: false,
      sla: false,
    },
    priceMonthly: 9900, // $99
  },
  {
    id: 'growth',
    name: 'Growth',
    quotas: {
      api_calls: 100000,
      webhooks: 10000,
      tokens: 100,
      investors: 5000,
      transfers: 10000,
    },
    features: {
      oauth: true,
      webhooks: true,
      priority_support: true,
      custom_branding: true,
      sla: false,
    },
    priceMonthly: 49900, // $499
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    quotas: {
      api_calls: -1, // unlimited
      webhooks: -1,
      tokens: -1,
      investors: -1,
      transfers: -1,
    },
    features: {
      oauth: true,
      webhooks: true,
      priority_support: true,
      custom_branding: true,
      sla: true,
    },
    priceMonthly: null, // custom pricing
  },
];

// ============================================================================
// BILLING SERVICE CLASS
// ============================================================================

export class BillingService {
  /**
   * Get the current billing plan for an organization
   */
  async getPlan(orgId: string): Promise<BillingPlan> {
    const billing = await db.query.orgBilling.findFirst({
      where: eq(orgBilling.orgId, orgId),
    });

    if (!billing) {
      // Default to free plan
      return DEFAULT_PLANS.find(p => p.id === 'free')!;
    }

    const plan = await db.query.billingPlans.findFirst({
      where: eq(billingPlans.id, billing.planId),
    });

    if (!plan) {
      return DEFAULT_PLANS.find(p => p.id === 'free')!;
    }

    return {
      id: plan.id,
      name: plan.name,
      quotas: plan.quotas as Record<string, number>,
      features: plan.features as Record<string, boolean>,
      priceMonthly: plan.priceMonthly,
    };
  }

  /**
   * Get billing info for an organization
   */
  async getBillingInfo(orgId: string): Promise<OrgBillingInfo | null> {
    const billing = await db.query.orgBilling.findFirst({
      where: eq(orgBilling.orgId, orgId),
    });

    if (!billing) {
      return null;
    }

    const plan = await this.getPlan(orgId);

    return {
      id: billing.id,
      orgId: billing.orgId,
      plan,
      status: billing.status as 'active' | 'suspended' | 'cancelled',
      currentPeriodStart: billing.currentPeriodStart,
      currentPeriodEnd: billing.currentPeriodEnd,
      stripeCustomerId: billing.stripeCustomerId || undefined,
    };
  }

  /**
   * Update an organization's plan
   */
  async updatePlan(orgId: string, planId: string): Promise<void> {
    // Get the plan
    let plan = await db.query.billingPlans.findFirst({
      where: eq(billingPlans.id, planId),
    });

    // If not in DB, check defaults
    if (!plan) {
      const defaultPlan = DEFAULT_PLANS.find(p => p.id === planId);
      if (!defaultPlan) {
        throw new Error(`Plan not found: ${planId}`);
      }

      // Insert the default plan
      const [insertedPlan] = await db.insert(billingPlans).values({
        id: defaultPlan.id,
        name: defaultPlan.name,
        quotas: defaultPlan.quotas,
        features: defaultPlan.features,
        priceMonthly: defaultPlan.priceMonthly,
      }).returning();

      plan = insertedPlan;
    }

    const now = new Date();
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    // Upsert org billing
    await db
      .insert(orgBilling)
      .values({
        orgId,
        planId: plan.id,
        status: 'active',
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
      })
      .onConflictDoUpdate({
        target: orgBilling.orgId,
        set: {
          planId: plan.id,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
        },
      });

    // Initialize quotas for the new plan
    const quotas = plan.quotas as Record<string, number>;
    await usageService.initializeQuotas(orgId, quotas);

    logger.info('Plan updated', { metadata: { orgId, planId } });
  }

  /**
   * Enforce quota - returns true if within quota, false if exceeded
   */
  async enforceQuota(orgId: string, resource: string): Promise<boolean> {
    const status = await usageService.checkQuota(orgId, resource);

    // Unlimited quota (-1)
    if (status.limit === -1) {
      return true;
    }

    return !status.isExceeded;
  }

  /**
   * Generate an invoice for a billing period
   */
  async generateInvoice(orgId: string, period: string): Promise<Invoice> {
    const [year, month] = period.split('-').map(Number);
    const periodStart = new Date(year, month - 1, 1);
    const periodEnd = new Date(year, month, 0, 23, 59, 59);

    const plan = await this.getPlan(orgId);
    const usage = await usageService.getUsage(orgId, periodStart, periodEnd);

    // Calculate line items
    const lineItems: Invoice['lineItems'] = [];

    // Base plan fee
    if (plan.priceMonthly && plan.priceMonthly > 0) {
      lineItems.push({
        description: `${plan.name} Plan - Monthly`,
        quantity: 1,
        unitPrice: plan.priceMonthly,
        total: plan.priceMonthly,
      });
    }

    // Check for overage (if not unlimited)
    const quotas = plan.quotas;
    if (quotas.api_calls > 0 && usage.summary.totalCalls > quotas.api_calls) {
      const overage = usage.summary.totalCalls - quotas.api_calls;
      const overageRate = 1; // $0.01 per call over limit
      lineItems.push({
        description: `API Overage (${overage.toLocaleString()} calls over ${quotas.api_calls.toLocaleString()} limit)`,
        quantity: overage,
        unitPrice: overageRate,
        total: overage * overageRate,
      });
    }

    const subtotal = lineItems.reduce((sum, item) => sum + item.total, 0);
    const tax = 0; // Would be calculated based on jurisdiction

    return {
      id: `inv_${year}${String(month).padStart(2, '0')}_${orgId.slice(0, 8)}`,
      orgId,
      period: { start: periodStart, end: periodEnd },
      plan,
      lineItems,
      subtotal,
      tax,
      total: subtotal + tax,
      status: 'draft',
    };
  }

  /**
   * Get usage summary for an organization
   */
  async getUsageSummary(orgId: string): Promise<UsageSummary> {
    const plan = await this.getPlan(orgId);
    const billing = await this.getBillingInfo(orgId);

    const now = new Date();
    const periodStart = billing?.currentPeriodStart || new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = billing?.currentPeriodEnd || new Date(now.getFullYear(), now.getMonth() + 1, 0);

    // Get quota usage for each resource
    const quotaUsage: UsageSummary['quotaUsage'] = [];
    const projectedOverage: UsageSummary['projectedOverage'] = [];

    for (const [resource, limit] of Object.entries(plan.quotas)) {
      const status = await usageService.checkQuota(orgId, resource);

      quotaUsage.push({
        resource,
        limit: limit === -1 ? Infinity : limit,
        used: status.used,
        remaining: limit === -1 ? Infinity : status.remaining,
        percentUsed: limit === -1 ? 0 : status.percentUsed,
      });

      // Project usage for the rest of the period (simple linear projection)
      if (limit > 0) {
        const daysInPeriod = Math.ceil((periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24));
        const daysElapsed = Math.ceil((now.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24));

        if (daysElapsed > 0) {
          const dailyRate = status.used / daysElapsed;
          const projectedUsage = Math.round(dailyRate * daysInPeriod);

          if (projectedUsage > limit) {
            projectedOverage.push({
              resource,
              projectedUsage,
              overageAmount: projectedUsage - limit,
            });
          }
        }
      }
    }

    return {
      orgId,
      plan,
      billingPeriod: { start: periodStart, end: periodEnd },
      quotaUsage,
      projectedOverage,
    };
  }

  /**
   * Suspend an organization's billing (e.g., for non-payment)
   */
  async suspendBilling(orgId: string, reason: string): Promise<void> {
    await db
      .update(orgBilling)
      .set({ status: 'suspended' })
      .where(eq(orgBilling.orgId, orgId));

    logger.warn('Billing suspended', { metadata: { orgId, reason } });
  }

  /**
   * Reactivate an organization's billing
   */
  async reactivateBilling(orgId: string): Promise<void> {
    await db
      .update(orgBilling)
      .set({ status: 'active' })
      .where(eq(orgBilling.orgId, orgId));

    logger.info('Billing reactivated', { metadata: { orgId } });
  }

  /**
   * List all available plans
   */
  async listPlans(): Promise<BillingPlan[]> {
    const dbPlans = await db.query.billingPlans.findMany();

    if (dbPlans.length === 0) {
      return DEFAULT_PLANS;
    }

    return dbPlans.map(p => ({
      id: p.id,
      name: p.name,
      quotas: p.quotas as Record<string, number>,
      features: p.features as Record<string, boolean>,
      priceMonthly: p.priceMonthly,
    }));
  }

  /**
   * Seed default plans into the database
   */
  async seedDefaultPlans(): Promise<void> {
    for (const plan of DEFAULT_PLANS) {
      await db
        .insert(billingPlans)
        .values({
          id: plan.id,
          name: plan.name,
          quotas: plan.quotas,
          features: plan.features,
          priceMonthly: plan.priceMonthly,
        })
        .onConflictDoNothing();
    }

    logger.info('Default billing plans seeded');
  }

  /**
   * Initialize billing for a new organization
   */
  async initializeOrgBilling(orgId: string, planId: string = 'free'): Promise<void> {
    await this.updatePlan(orgId, planId);
  }

  /**
   * Roll billing period to next month
   */
  async rollBillingPeriods(): Promise<number> {
    const now = new Date();
    let rolled = 0;

    // Find all orgs with expired periods
    const expiredBilling = await db.query.orgBilling.findMany({
      where: and(
        eq(orgBilling.status, 'active'),
        lte(orgBilling.currentPeriodEnd, now)
      ),
    });

    for (const billing of expiredBilling) {
      const newStart = new Date(billing.currentPeriodEnd);
      newStart.setDate(newStart.getDate() + 1);
      const newEnd = new Date(newStart.getFullYear(), newStart.getMonth() + 1, 0, 23, 59, 59);

      await db
        .update(orgBilling)
        .set({
          currentPeriodStart: newStart,
          currentPeriodEnd: newEnd,
        })
        .where(eq(orgBilling.id, billing.id));

      // Reset quotas for new period
      const plan = await this.getPlan(billing.orgId);
      await usageService.initializeQuotas(billing.orgId, plan.quotas);

      rolled++;
    }

    if (rolled > 0) {
      logger.info('Rolled billing periods', { metadata: { count: rolled } });
    }

    return rolled;
  }
}

// Export singleton instance
export const billingService = new BillingService();
