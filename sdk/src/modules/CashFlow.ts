/**
 * Cash Flow / Distribution Module
 *
 * Handles dividends, royalties, revenue sharing, and other periodic payments.
 * Supports multiple distribution strategies and payment schedules.
 */

import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { BaseEvent, EventType } from '../core/types.js';
import { SDKError, ErrorCode } from '../errors/index.js';

// ============================================================================
// TYPES AND SCHEMAS
// ============================================================================

/**
 * Distribution type
 */
export enum DistributionType {
  /** One-time dividend payment */
  DIVIDEND = 'DIVIDEND',

  /** Interest/coupon payment on debt */
  INTEREST = 'INTEREST',

  /** Royalty payment */
  ROYALTY = 'ROYALTY',

  /** Revenue share */
  REVENUE_SHARE = 'REVENUE_SHARE',

  /** Rent/lease payment */
  RENT = 'RENT',

  /** Profit share */
  PROFIT_SHARE = 'PROFIT_SHARE',

  /** Yield payment (staking, lending) */
  YIELD = 'YIELD',

  /** Custom distribution */
  CUSTOM = 'CUSTOM',
}

/**
 * Distribution frequency
 */
export enum DistributionFrequency {
  ONE_TIME = 'ONE_TIME',
  DAILY = 'DAILY',
  WEEKLY = 'WEEKLY',
  BIWEEKLY = 'BIWEEKLY',
  MONTHLY = 'MONTHLY',
  QUARTERLY = 'QUARTERLY',
  SEMI_ANNUAL = 'SEMI_ANNUAL',
  ANNUAL = 'ANNUAL',
  ON_DEMAND = 'ON_DEMAND',
}

/**
 * Distribution status
 */
export enum DistributionStatus {
  SCHEDULED = 'SCHEDULED',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  PARTIALLY_COMPLETED = 'PARTIALLY_COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

/**
 * Distribution allocation strategy
 */
export enum AllocationStrategy {
  /** Pro-rata based on token balance */
  PRO_RATA = 'PRO_RATA',

  /** Equal distribution to all holders */
  EQUAL = 'EQUAL',

  /** Tiered based on holding amount */
  TIERED = 'TIERED',

  /** Time-weighted average balance */
  TIME_WEIGHTED = 'TIME_WEIGHTED',

  /** Custom allocation function */
  CUSTOM = 'CUSTOM',
}

/**
 * Distribution schedule schema
 */
export const DistributionScheduleSchema = z.object({
  /** Unique schedule ID */
  id: z.string().uuid(),

  /** Asset ID this schedule is for */
  assetId: z.string().uuid(),

  /** Distribution type */
  type: z.nativeEnum(DistributionType),

  /** Frequency */
  frequency: z.nativeEnum(DistributionFrequency),

  /** Allocation strategy */
  allocationStrategy: z.nativeEnum(AllocationStrategy),

  /** Currency/token for payment */
  paymentCurrency: z.string(),

  /** Amount per distribution (or rate) */
  amount: z.string().optional(), // BigNumber as string

  /** Rate (for percentage-based distributions) */
  rate: z.number().min(0).max(100).optional(),

  /** Start date */
  startDate: z.string().datetime(),

  /** End date (optional) */
  endDate: z.string().datetime().optional(),

  /** Next scheduled distribution */
  nextDistribution: z.string().datetime().optional(),

  /** Whether schedule is active */
  isActive: z.boolean().default(true),

  /** Minimum balance to receive distribution */
  minimumBalance: z.string().optional(),

  /** Snapshot block/timestamp for balance calculation */
  snapshotAt: z.string().datetime().optional(),

  /** Custom parameters */
  parameters: z.record(z.unknown()).optional(),

  /** Created at */
  createdAt: z.string().datetime(),

  /** Updated at */
  updatedAt: z.string().datetime(),
});

export type DistributionSchedule = z.infer<typeof DistributionScheduleSchema>;

/**
 * Distribution event schema
 */
export const DistributionEventSchema = z.object({
  /** Unique distribution ID */
  id: z.string().uuid(),

  /** Schedule ID */
  scheduleId: z.string().uuid(),

  /** Asset ID */
  assetId: z.string().uuid(),

  /** Distribution type */
  type: z.nativeEnum(DistributionType),

  /** Status */
  status: z.nativeEnum(DistributionStatus),

  /** Total amount distributed */
  totalAmount: z.string(),

  /** Payment currency */
  currency: z.string(),

  /** Number of recipients */
  recipientCount: z.number().nonnegative(),

  /** Individual payouts */
  payouts: z.array(z.object({
    recipientId: z.string(),
    recipientAddress: z.string().optional(),
    amount: z.string(),
    claimed: z.boolean().default(false),
    claimedAt: z.string().datetime().optional(),
    txHash: z.string().optional(),
  })),

  /** Snapshot timestamp */
  snapshotAt: z.string().datetime(),

  /** Execution timestamp */
  executedAt: z.string().datetime().optional(),

  /** Error message if failed */
  error: z.string().optional(),

  /** Metadata */
  metadata: z.record(z.unknown()).optional(),

  /** Created at */
  createdAt: z.string().datetime(),
});

export type DistributionEvent = z.infer<typeof DistributionEventSchema>;

/**
 * Tier definition for tiered allocations
 */
export interface AllocationTier {
  minBalance: string;
  maxBalance?: string;
  multiplier: number; // e.g., 1.5 for 50% bonus
}

/**
 * Holder balance snapshot
 */
export interface HolderSnapshot {
  holderId: string;
  holderAddress?: string;
  balance: string;
  weight: number; // Calculated weight for allocation
  timeHeld?: number; // Seconds held (for time-weighted)
}

// ============================================================================
// CASH FLOW ENGINE
// ============================================================================

/**
 * Cash Flow Engine for managing distributions
 */
export class CashFlowEngine {
  private schedules: Map<string, DistributionSchedule> = new Map();
  private distributions: Map<string, DistributionEvent> = new Map();
  private eventStore?: { append: (event: BaseEvent) => Promise<void> };
  private balanceProvider?: (assetId: string) => Promise<HolderSnapshot[]>;

  constructor(
    eventStore?: { append: (event: BaseEvent) => Promise<void> },
    balanceProvider?: (assetId: string) => Promise<HolderSnapshot[]>
  ) {
    this.eventStore = eventStore;
    this.balanceProvider = balanceProvider;
  }

  /**
   * Set balance provider
   */
  setBalanceProvider(provider: (assetId: string) => Promise<HolderSnapshot[]>): void {
    this.balanceProvider = provider;
  }

  // ============================================
  // SCHEDULE MANAGEMENT
  // ============================================

  /**
   * Create a distribution schedule
   */
  createSchedule(params: {
    assetId: string;
    type: DistributionType;
    frequency: DistributionFrequency;
    allocationStrategy?: AllocationStrategy;
    paymentCurrency: string;
    amount?: string;
    rate?: number;
    startDate: string;
    endDate?: string;
    minimumBalance?: string;
    parameters?: Record<string, unknown>;
  }): DistributionSchedule {
    const now = new Date().toISOString();

    const schedule: DistributionSchedule = {
      id: uuidv4(),
      assetId: params.assetId,
      type: params.type,
      frequency: params.frequency,
      allocationStrategy: params.allocationStrategy || AllocationStrategy.PRO_RATA,
      paymentCurrency: params.paymentCurrency,
      amount: params.amount,
      rate: params.rate,
      startDate: params.startDate,
      endDate: params.endDate,
      nextDistribution: this.calculateNextDistribution(params.startDate, params.frequency),
      isActive: true,
      minimumBalance: params.minimumBalance,
      parameters: params.parameters,
      createdAt: now,
      updatedAt: now,
    };

    const validated = DistributionScheduleSchema.parse(schedule);
    this.schedules.set(validated.id, validated);

    return validated;
  }

  /**
   * Update a schedule
   */
  updateSchedule(
    scheduleId: string,
    updates: Partial<Omit<DistributionSchedule, 'id' | 'assetId' | 'createdAt'>>
  ): DistributionSchedule | null {
    const schedule = this.schedules.get(scheduleId);
    if (!schedule) return null;

    const updated: DistributionSchedule = {
      ...schedule,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    const validated = DistributionScheduleSchema.parse(updated);
    this.schedules.set(scheduleId, validated);

    return validated;
  }

  /**
   * Pause a schedule
   */
  pauseSchedule(scheduleId: string): boolean {
    return this.updateSchedule(scheduleId, { isActive: false }) !== null;
  }

  /**
   * Resume a schedule
   */
  resumeSchedule(scheduleId: string): boolean {
    return this.updateSchedule(scheduleId, { isActive: true }) !== null;
  }

  /**
   * Delete a schedule
   */
  deleteSchedule(scheduleId: string): boolean {
    return this.schedules.delete(scheduleId);
  }

  /**
   * Get schedule by ID
   */
  getSchedule(scheduleId: string): DistributionSchedule | undefined {
    return this.schedules.get(scheduleId);
  }

  /**
   * Get schedules for an asset
   */
  getSchedulesForAsset(assetId: string): DistributionSchedule[] {
    return Array.from(this.schedules.values()).filter(s => s.assetId === assetId);
  }

  /**
   * Get due schedules
   */
  getDueSchedules(): DistributionSchedule[] {
    const now = new Date().toISOString();
    return Array.from(this.schedules.values()).filter(
      s => s.isActive && s.nextDistribution && s.nextDistribution <= now
    );
  }

  // ============================================
  // DISTRIBUTION EXECUTION
  // ============================================

  /**
   * Execute a distribution
   */
  async executeDistribution(
    scheduleId: string,
    options?: {
      amount?: string;
      snapshotAt?: string;
      metadata?: Record<string, unknown>;
    }
  ): Promise<DistributionEvent> {
    const schedule = this.schedules.get(scheduleId);
    if (!schedule) {
      throw new SDKError(
        `Schedule not found: ${scheduleId}`,
        ErrorCode.NOT_FOUND,
        { details: { scheduleId } }
      );
    }

    if (!this.balanceProvider) {
      throw new SDKError(
        'Balance provider not set',
        ErrorCode.NOT_INITIALIZED,
        { details: { required: 'balanceProvider' } }
      );
    }

    const now = new Date().toISOString();
    const snapshotAt = options?.snapshotAt || now;

    // Get holder snapshots
    const holders = await this.balanceProvider(schedule.assetId);

    // Filter by minimum balance
    const eligibleHolders = holders.filter(h => {
      if (!schedule.minimumBalance) return true;
      return BigInt(h.balance) >= BigInt(schedule.minimumBalance);
    });

    // Calculate allocations
    const totalAmount = options?.amount || schedule.amount || '0';
    const payouts = this.calculateAllocations(
      eligibleHolders,
      totalAmount,
      schedule.allocationStrategy,
      schedule.parameters
    );

    // Create distribution event
    const distribution: DistributionEvent = {
      id: uuidv4(),
      scheduleId: schedule.id,
      assetId: schedule.assetId,
      type: schedule.type,
      status: DistributionStatus.PROCESSING,
      totalAmount,
      currency: schedule.paymentCurrency,
      recipientCount: payouts.length,
      payouts,
      snapshotAt,
      createdAt: now,
      metadata: options?.metadata,
    };

    this.distributions.set(distribution.id, distribution);

    // Update next distribution
    this.updateSchedule(scheduleId, {
      nextDistribution: this.calculateNextDistribution(now, schedule.frequency),
      snapshotAt,
    });

    // Emit event
    if (this.eventStore) {
      await this.eventStore.append({
        id: uuidv4(),
        type: EventType.ASSET_UPDATED,
        assetId: schedule.assetId,
        timestamp: now,
        actorId: 'system',
        payload: {
          action: 'DISTRIBUTION_CREATED',
          distributionId: distribution.id,
          type: schedule.type,
          totalAmount,
          recipientCount: payouts.length,
        },
        eventVersion: 1,
      });
    }

    return distribution;
  }

  /**
   * Mark a distribution as completed
   */
  completeDistribution(distributionId: string, txHash?: string): DistributionEvent | null {
    const distribution = this.distributions.get(distributionId);
    if (!distribution) return null;

    distribution.status = DistributionStatus.COMPLETED;
    distribution.executedAt = new Date().toISOString();

    if (txHash) {
      distribution.payouts.forEach(p => {
        p.txHash = txHash;
      });
    }

    return distribution;
  }

  /**
   * Mark a distribution as failed
   */
  failDistribution(distributionId: string, error: string): DistributionEvent | null {
    const distribution = this.distributions.get(distributionId);
    if (!distribution) return null;

    distribution.status = DistributionStatus.FAILED;
    distribution.error = error;

    return distribution;
  }

  /**
   * Claim a payout
   */
  async claimPayout(
    distributionId: string,
    recipientId: string
  ): Promise<{ amount: string; claimed: boolean }> {
    const distribution = this.distributions.get(distributionId);
    if (!distribution) {
      throw new SDKError(
        `Distribution not found: ${distributionId}`,
        ErrorCode.NOT_FOUND,
        { details: { distributionId } }
      );
    }

    const payout = distribution.payouts.find(p => p.recipientId === recipientId);
    if (!payout) {
      throw new SDKError(
        `Recipient not found in distribution: ${recipientId}`,
        ErrorCode.NOT_FOUND,
        { details: { distributionId, recipientId } }
      );
    }

    if (payout.claimed) {
      return { amount: payout.amount, claimed: false };
    }

    payout.claimed = true;
    payout.claimedAt = new Date().toISOString();

    return { amount: payout.amount, claimed: true };
  }

  /**
   * Get unclaimed payouts for a recipient
   */
  getUnclaimedPayouts(recipientId: string): Array<{
    distributionId: string;
    amount: string;
    currency: string;
    type: DistributionType;
  }> {
    const unclaimed: Array<{
      distributionId: string;
      amount: string;
      currency: string;
      type: DistributionType;
    }> = [];

    for (const distribution of this.distributions.values()) {
      if (distribution.status !== DistributionStatus.COMPLETED) continue;

      const payout = distribution.payouts.find(
        p => p.recipientId === recipientId && !p.claimed
      );

      if (payout) {
        unclaimed.push({
          distributionId: distribution.id,
          amount: payout.amount,
          currency: distribution.currency,
          type: distribution.type,
        });
      }
    }

    return unclaimed;
  }

  // ============================================
  // ALLOCATION CALCULATIONS
  // ============================================

  /**
   * Calculate allocations based on strategy
   */
  private calculateAllocations(
    holders: HolderSnapshot[],
    totalAmount: string,
    strategy: AllocationStrategy,
    parameters?: Record<string, unknown>
  ): DistributionEvent['payouts'] {
    const total = BigInt(totalAmount);

    switch (strategy) {
      case AllocationStrategy.PRO_RATA:
        return this.calculateProRata(holders, total);

      case AllocationStrategy.EQUAL:
        return this.calculateEqual(holders, total);

      case AllocationStrategy.TIERED:
        return this.calculateTiered(holders, total, parameters?.tiers as AllocationTier[] | undefined);

      case AllocationStrategy.TIME_WEIGHTED:
        return this.calculateTimeWeighted(holders, total);

      case AllocationStrategy.CUSTOM:
        if (parameters?.allocator && typeof parameters.allocator === 'function') {
          return (parameters.allocator as (holders: HolderSnapshot[], total: bigint) => DistributionEvent['payouts'])(holders, total);
        }
        return this.calculateProRata(holders, total);

      default:
        return this.calculateProRata(holders, total);
    }
  }

  /**
   * Pro-rata allocation
   */
  private calculateProRata(holders: HolderSnapshot[], totalAmount: bigint): DistributionEvent['payouts'] {
    const totalBalance = holders.reduce((sum, h) => sum + BigInt(h.balance), 0n);

    if (totalBalance === 0n) {
      return holders.map(h => ({
        recipientId: h.holderId,
        recipientAddress: h.holderAddress,
        amount: '0',
        claimed: false,
      }));
    }

    return holders.map(h => ({
      recipientId: h.holderId,
      recipientAddress: h.holderAddress,
      amount: ((BigInt(h.balance) * totalAmount) / totalBalance).toString(),
      claimed: false,
    }));
  }

  /**
   * Equal allocation
   */
  private calculateEqual(holders: HolderSnapshot[], totalAmount: bigint): DistributionEvent['payouts'] {
    const count = BigInt(holders.length);
    if (count === 0n) return [];

    const perHolder = totalAmount / count;

    return holders.map(h => ({
      recipientId: h.holderId,
      recipientAddress: h.holderAddress,
      amount: perHolder.toString(),
      claimed: false,
    }));
  }

  /**
   * Tiered allocation
   */
  private calculateTiered(
    holders: HolderSnapshot[],
    totalAmount: bigint,
    tiers?: AllocationTier[]
  ): DistributionEvent['payouts'] {
    if (!tiers || tiers.length === 0) {
      return this.calculateProRata(holders, totalAmount);
    }

    // Calculate weighted balances
    const weightedHolders = holders.map(h => {
      const balance = BigInt(h.balance);
      let multiplier = 1;

      for (const tier of tiers) {
        if (balance >= BigInt(tier.minBalance)) {
          if (!tier.maxBalance || balance <= BigInt(tier.maxBalance)) {
            multiplier = tier.multiplier;
            break;
          }
        }
      }

      return {
        ...h,
        weightedBalance: balance * BigInt(Math.floor(multiplier * 100)) / 100n,
      };
    });

    const totalWeighted = weightedHolders.reduce((sum, h) => sum + h.weightedBalance, 0n);

    if (totalWeighted === 0n) {
      return holders.map(h => ({
        recipientId: h.holderId,
        recipientAddress: h.holderAddress,
        amount: '0',
        claimed: false,
      }));
    }

    return weightedHolders.map(h => ({
      recipientId: h.holderId,
      recipientAddress: h.holderAddress,
      amount: ((h.weightedBalance * totalAmount) / totalWeighted).toString(),
      claimed: false,
    }));
  }

  /**
   * Time-weighted allocation
   */
  private calculateTimeWeighted(holders: HolderSnapshot[], totalAmount: bigint): DistributionEvent['payouts'] {
    // Use time-weighted balance (balance * time held)
    const weightedHolders = holders.map(h => ({
      ...h,
      weightedBalance: BigInt(h.balance) * BigInt(h.timeHeld || 1),
    }));

    const totalWeighted = weightedHolders.reduce((sum, h) => sum + h.weightedBalance, 0n);

    if (totalWeighted === 0n) {
      return holders.map(h => ({
        recipientId: h.holderId,
        recipientAddress: h.holderAddress,
        amount: '0',
        claimed: false,
      }));
    }

    return weightedHolders.map(h => ({
      recipientId: h.holderId,
      recipientAddress: h.holderAddress,
      amount: ((h.weightedBalance * totalAmount) / totalWeighted).toString(),
      claimed: false,
    }));
  }

  // ============================================
  // UTILITY FUNCTIONS
  // ============================================

  /**
   * Calculate next distribution date
   */
  private calculateNextDistribution(fromDate: string, frequency: DistributionFrequency): string {
    const date = new Date(fromDate);

    switch (frequency) {
      case DistributionFrequency.DAILY:
        date.setDate(date.getDate() + 1);
        break;
      case DistributionFrequency.WEEKLY:
        date.setDate(date.getDate() + 7);
        break;
      case DistributionFrequency.BIWEEKLY:
        date.setDate(date.getDate() + 14);
        break;
      case DistributionFrequency.MONTHLY:
        date.setMonth(date.getMonth() + 1);
        break;
      case DistributionFrequency.QUARTERLY:
        date.setMonth(date.getMonth() + 3);
        break;
      case DistributionFrequency.SEMI_ANNUAL:
        date.setMonth(date.getMonth() + 6);
        break;
      case DistributionFrequency.ANNUAL:
        date.setFullYear(date.getFullYear() + 1);
        break;
      case DistributionFrequency.ONE_TIME:
      case DistributionFrequency.ON_DEMAND:
        return fromDate;
    }

    return date.toISOString();
  }

  /**
   * Get distribution by ID
   */
  getDistribution(distributionId: string): DistributionEvent | undefined {
    return this.distributions.get(distributionId);
  }

  /**
   * Get distributions for an asset
   */
  getDistributionsForAsset(assetId: string): DistributionEvent[] {
    return Array.from(this.distributions.values()).filter(d => d.assetId === assetId);
  }

  /**
   * Calculate total distributed for an asset
   */
  getTotalDistributed(assetId: string): Record<string, string> {
    const totals: Record<string, bigint> = {};

    for (const distribution of this.distributions.values()) {
      if (distribution.assetId === assetId && distribution.status === DistributionStatus.COMPLETED) {
        const currency = distribution.currency;
        totals[currency] = (totals[currency] || 0n) + BigInt(distribution.totalAmount);
      }
    }

    const result: Record<string, string> = {};
    for (const [currency, amount] of Object.entries(totals)) {
      result[currency] = amount.toString();
    }

    return result;
  }

  /**
   * Calculate yield/APY for an asset
   */
  calculateYield(assetId: string, periodDays: number = 365): number {
    const distributions = this.getDistributionsForAsset(assetId).filter(
      d => d.status === DistributionStatus.COMPLETED
    );

    if (distributions.length === 0) return 0;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - periodDays);

    const relevantDistributions = distributions.filter(
      d => new Date(d.createdAt) >= cutoff
    );

    const totalDistributed = relevantDistributions.reduce(
      (sum, d) => sum + BigInt(d.totalAmount),
      0n
    );

    // This is a simplified calculation - real APY would need price data
    return Number(totalDistributed) / 100; // Placeholder
  }
}
