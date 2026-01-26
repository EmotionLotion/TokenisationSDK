import { db, schema } from '../config/database.js';
import { eq, and, desc, gte, lte, inArray } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { NotFoundError, ValidationError } from '../middleware/errorHandler.js';
import * as ledgerService from './ledger.service.js';

const { tokens, ledgerPositions, investors } = schema;

// ============================================================================
// Types & Interfaces
// ============================================================================

export type DistributionType =
  | 'DIVIDEND'
  | 'INTEREST'
  | 'ROYALTY'
  | 'REVENUE_SHARE'
  | 'RENT'
  | 'PROFIT_SHARE'
  | 'YIELD'
  | 'CUSTOM';

export type DistributionFrequency =
  | 'ONE_TIME'
  | 'DAILY'
  | 'WEEKLY'
  | 'BIWEEKLY'
  | 'MONTHLY'
  | 'QUARTERLY'
  | 'SEMI_ANNUAL'
  | 'ANNUAL'
  | 'ON_DEMAND';

export type DistributionStatus =
  | 'SCHEDULED'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'PARTIALLY_COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export type AllocationStrategy =
  | 'PRO_RATA'
  | 'EQUAL'
  | 'TIERED'
  | 'TIME_WEIGHTED'
  | 'CUSTOM';

export interface DistributionSchedule {
  id: string;
  orgId: string;
  tokenId: string;
  type: DistributionType;
  frequency: DistributionFrequency;
  allocationStrategy: AllocationStrategy;
  paymentCurrency: string;
  amount?: string;
  rate?: number;
  startDate: string;
  endDate?: string;
  nextDistribution?: string;
  isActive: boolean;
  minimumBalance?: string;
  snapshotAt?: string;
  parameters?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface DistributionEvent {
  id: string;
  orgId: string;
  scheduleId: string;
  tokenId: string;
  type: DistributionType;
  status: DistributionStatus;
  totalAmount: string;
  currency: string;
  recipientCount: number;
  snapshotAt: string;
  executedAt?: string;
  error?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface Payout {
  id: string;
  orgId: string;
  distributionId: string;
  recipientId: string;
  recipientAddress?: string;
  amount: string;
  claimed: boolean;
  claimedAt?: string;
  txHash?: string;
  createdAt: string;
}

export interface AllocationTier {
  minBalance: string;
  maxBalance?: string;
  multiplier: number;
}

export interface HolderSnapshot {
  holderId: string;
  holderAddress?: string;
  balance: string;
  weight: number;
  timeHeld?: number;
}

// ============================================================================
// In-Memory Storage (will be replaced with DB tables in production)
// ============================================================================

const schedules = new Map<string, DistributionSchedule>();
const distributions = new Map<string, DistributionEvent>();
const payouts = new Map<string, Payout[]>();

// ============================================================================
// Schedule Management
// ============================================================================

export async function createSchedule(input: {
  orgId: string;
  tokenId: string;
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
  metadata?: Record<string, unknown>;
}): Promise<DistributionSchedule> {
  // Verify token exists
  const token = await db.query.tokens.findFirst({
    where: and(eq(tokens.id, input.tokenId), eq(tokens.orgId, input.orgId)),
  });

  if (!token) {
    throw new NotFoundError('Token not found');
  }

  const now = new Date().toISOString();
  const schedule: DistributionSchedule = {
    id: uuidv4(),
    orgId: input.orgId,
    tokenId: input.tokenId,
    type: input.type,
    frequency: input.frequency,
    allocationStrategy: input.allocationStrategy || 'PRO_RATA',
    paymentCurrency: input.paymentCurrency,
    amount: input.amount,
    rate: input.rate,
    startDate: input.startDate,
    endDate: input.endDate,
    nextDistribution: calculateNextDistribution(input.startDate, input.frequency),
    isActive: true,
    minimumBalance: input.minimumBalance,
    parameters: input.parameters,
    metadata: input.metadata,
    createdAt: now,
    updatedAt: now,
  };

  schedules.set(schedule.id, schedule);
  return schedule;
}

export async function getSchedule(id: string, orgId: string): Promise<DistributionSchedule> {
  const schedule = schedules.get(id);
  if (!schedule || schedule.orgId !== orgId) {
    throw new NotFoundError('Distribution schedule not found');
  }
  return schedule;
}

export async function listSchedules(orgId: string, params: {
  tokenId?: string;
  type?: DistributionType;
  isActive?: boolean;
  limit?: number;
  offset?: number;
} = {}): Promise<DistributionSchedule[]> {
  const { tokenId, type, isActive, limit = 100, offset = 0 } = params;

  let results = Array.from(schedules.values())
    .filter(s => s.orgId === orgId);

  if (tokenId) results = results.filter(s => s.tokenId === tokenId);
  if (type) results = results.filter(s => s.type === type);
  if (isActive !== undefined) results = results.filter(s => s.isActive === isActive);

  return results
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(offset, offset + limit);
}

export async function updateSchedule(
  id: string,
  orgId: string,
  updates: Partial<Omit<DistributionSchedule, 'id' | 'orgId' | 'tokenId' | 'createdAt'>>
): Promise<DistributionSchedule> {
  const schedule = await getSchedule(id, orgId);

  const updated: DistributionSchedule = {
    ...schedule,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  schedules.set(id, updated);
  return updated;
}

export async function pauseSchedule(id: string, orgId: string): Promise<DistributionSchedule> {
  return updateSchedule(id, orgId, { isActive: false });
}

export async function resumeSchedule(id: string, orgId: string): Promise<DistributionSchedule> {
  return updateSchedule(id, orgId, { isActive: true });
}

export async function deleteSchedule(id: string, orgId: string): Promise<{ success: boolean }> {
  const schedule = await getSchedule(id, orgId);
  schedules.delete(id);
  return { success: true };
}

export async function getDueSchedules(orgId: string): Promise<DistributionSchedule[]> {
  const now = new Date().toISOString();
  return Array.from(schedules.values())
    .filter(s =>
      s.orgId === orgId &&
      s.isActive &&
      s.nextDistribution &&
      s.nextDistribution <= now
    );
}

// ============================================================================
// Distribution Execution
// ============================================================================

export async function executeDistribution(
  scheduleId: string,
  orgId: string,
  options?: {
    amount?: string;
    snapshotAt?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<DistributionEvent> {
  const schedule = await getSchedule(scheduleId, orgId);

  if (!schedule.isActive) {
    throw new ValidationError('Schedule is not active');
  }

  const now = new Date().toISOString();
  const snapshotAt = options?.snapshotAt || now;
  const totalAmount = options?.amount || schedule.amount || '0';

  // Get holder snapshots from ledger
  const holders = await getHolderSnapshots(schedule.tokenId, orgId, schedule.minimumBalance);

  // Calculate allocations
  const calculatedPayouts = calculateAllocations(
    holders,
    totalAmount,
    schedule.allocationStrategy,
    schedule.parameters
  );

  // Create distribution event
  const distribution: DistributionEvent = {
    id: uuidv4(),
    orgId,
    scheduleId: schedule.id,
    tokenId: schedule.tokenId,
    type: schedule.type,
    status: 'PROCESSING',
    totalAmount,
    currency: schedule.paymentCurrency,
    recipientCount: calculatedPayouts.length,
    snapshotAt,
    metadata: options?.metadata,
    createdAt: now,
  };

  distributions.set(distribution.id, distribution);

  // Create payout records
  const payoutRecords: Payout[] = calculatedPayouts.map(p => ({
    id: uuidv4(),
    orgId,
    distributionId: distribution.id,
    recipientId: p.recipientId,
    recipientAddress: p.recipientAddress,
    amount: p.amount,
    claimed: false,
    createdAt: now,
  }));

  payouts.set(distribution.id, payoutRecords);

  // Update schedule with next distribution date
  await updateSchedule(scheduleId, orgId, {
    nextDistribution: calculateNextDistribution(now, schedule.frequency),
    snapshotAt,
  });

  return distribution;
}

export async function completeDistribution(
  distributionId: string,
  orgId: string,
  txHash?: string
): Promise<DistributionEvent> {
  const distribution = distributions.get(distributionId);
  if (!distribution || distribution.orgId !== orgId) {
    throw new NotFoundError('Distribution not found');
  }

  distribution.status = 'COMPLETED';
  distribution.executedAt = new Date().toISOString();

  // Update all payouts with txHash if provided
  if (txHash) {
    const distributionPayouts = payouts.get(distributionId) || [];
    distributionPayouts.forEach(p => {
      p.txHash = txHash;
    });
  }

  return distribution;
}

export async function failDistribution(
  distributionId: string,
  orgId: string,
  error: string
): Promise<DistributionEvent> {
  const distribution = distributions.get(distributionId);
  if (!distribution || distribution.orgId !== orgId) {
    throw new NotFoundError('Distribution not found');
  }

  distribution.status = 'FAILED';
  distribution.error = error;

  return distribution;
}

export async function getDistribution(id: string, orgId: string): Promise<DistributionEvent> {
  const distribution = distributions.get(id);
  if (!distribution || distribution.orgId !== orgId) {
    throw new NotFoundError('Distribution not found');
  }
  return distribution;
}

export async function listDistributions(orgId: string, params: {
  tokenId?: string;
  scheduleId?: string;
  status?: DistributionStatus;
  type?: DistributionType;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
} = {}): Promise<DistributionEvent[]> {
  const { tokenId, scheduleId, status, type, startDate, endDate, limit = 100, offset = 0 } = params;

  let results = Array.from(distributions.values())
    .filter(d => d.orgId === orgId);

  if (tokenId) results = results.filter(d => d.tokenId === tokenId);
  if (scheduleId) results = results.filter(d => d.scheduleId === scheduleId);
  if (status) results = results.filter(d => d.status === status);
  if (type) results = results.filter(d => d.type === type);
  if (startDate) results = results.filter(d => new Date(d.createdAt) >= startDate);
  if (endDate) results = results.filter(d => new Date(d.createdAt) <= endDate);

  return results
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(offset, offset + limit);
}

// ============================================================================
// Payout Management
// ============================================================================

export async function getPayouts(distributionId: string, orgId: string): Promise<Payout[]> {
  const distribution = await getDistribution(distributionId, orgId);
  return payouts.get(distributionId) || [];
}

export async function claimPayout(
  distributionId: string,
  recipientId: string,
  orgId: string
): Promise<{ amount: string; claimed: boolean }> {
  const distribution = await getDistribution(distributionId, orgId);
  const distributionPayouts = payouts.get(distributionId) || [];

  const payout = distributionPayouts.find(p => p.recipientId === recipientId);
  if (!payout) {
    throw new NotFoundError('Payout not found for this recipient');
  }

  if (payout.claimed) {
    return { amount: payout.amount, claimed: false };
  }

  payout.claimed = true;
  payout.claimedAt = new Date().toISOString();

  return { amount: payout.amount, claimed: true };
}

export async function getUnclaimedPayouts(recipientId: string, orgId: string): Promise<{
  distributionId: string;
  amount: string;
  currency: string;
  type: DistributionType;
}[]> {
  const unclaimed: {
    distributionId: string;
    amount: string;
    currency: string;
    type: DistributionType;
  }[] = [];

  for (const [distributionId, distributionPayouts] of payouts.entries()) {
    const distribution = distributions.get(distributionId);
    if (!distribution || distribution.orgId !== orgId) continue;
    if (distribution.status !== 'COMPLETED') continue;

    const payout = distributionPayouts.find(
      p => p.recipientId === recipientId && !p.claimed
    );

    if (payout) {
      unclaimed.push({
        distributionId,
        amount: payout.amount,
        currency: distribution.currency,
        type: distribution.type,
      });
    }
  }

  return unclaimed;
}

// ============================================================================
// Analytics
// ============================================================================

export async function getDistributionSummary(tokenId: string, orgId: string): Promise<{
  tokenId: string;
  totalDistributed: Record<string, string>;
  totalDistributions: number;
  completedDistributions: number;
  pendingPayouts: number;
  lastDistribution?: string;
}> {
  const tokenDistributions = Array.from(distributions.values())
    .filter(d => d.tokenId === tokenId && d.orgId === orgId);

  const totalDistributed: Record<string, bigint> = {};
  let completedDistributions = 0;
  let pendingPayouts = 0;
  let lastDistribution: string | undefined;

  for (const dist of tokenDistributions) {
    if (dist.status === 'COMPLETED') {
      completedDistributions++;
      totalDistributed[dist.currency] = (totalDistributed[dist.currency] || 0n) + BigInt(dist.totalAmount);

      if (!lastDistribution || dist.executedAt! > lastDistribution) {
        lastDistribution = dist.executedAt;
      }
    }

    const distributionPayouts = payouts.get(dist.id) || [];
    pendingPayouts += distributionPayouts.filter(p => !p.claimed).length;
  }

  const result: Record<string, string> = {};
  for (const [currency, amount] of Object.entries(totalDistributed)) {
    result[currency] = amount.toString();
  }

  return {
    tokenId,
    totalDistributed: result,
    totalDistributions: tokenDistributions.length,
    completedDistributions,
    pendingPayouts,
    lastDistribution,
  };
}

export async function calculateYield(
  tokenId: string,
  orgId: string,
  periodDays: number = 365
): Promise<{
  tokenId: string;
  periodDays: number;
  totalDistributed: string;
  distributionCount: number;
  averagePerDistribution: string;
}> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - periodDays);

  const relevantDistributions = Array.from(distributions.values())
    .filter(d =>
      d.tokenId === tokenId &&
      d.orgId === orgId &&
      d.status === 'COMPLETED' &&
      new Date(d.createdAt) >= cutoff
    );

  const totalDistributed = relevantDistributions.reduce(
    (sum, d) => sum + BigInt(d.totalAmount),
    0n
  );

  const avgPerDistribution = relevantDistributions.length > 0
    ? totalDistributed / BigInt(relevantDistributions.length)
    : 0n;

  return {
    tokenId,
    periodDays,
    totalDistributed: totalDistributed.toString(),
    distributionCount: relevantDistributions.length,
    averagePerDistribution: avgPerDistribution.toString(),
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

async function getHolderSnapshots(
  tokenId: string,
  orgId: string,
  minimumBalance?: string
): Promise<HolderSnapshot[]> {
  const positions = await db.select()
    .from(ledgerPositions)
    .where(and(
      eq(ledgerPositions.tokenId, tokenId),
      eq(ledgerPositions.orgId, orgId)
    ));

  let holders: HolderSnapshot[] = positions.map(p => ({
    holderId: p.investorId,
    holderAddress: p.walletAddress,
    balance: p.balance,
    weight: 1,
  }));

  // Filter by minimum balance
  if (minimumBalance) {
    const minBal = BigInt(minimumBalance);
    holders = holders.filter(h => BigInt(h.balance) >= minBal);
  }

  return holders;
}

function calculateAllocations(
  holders: HolderSnapshot[],
  totalAmount: string,
  strategy: AllocationStrategy,
  parameters?: Record<string, unknown>
): { recipientId: string; recipientAddress?: string; amount: string }[] {
  const total = BigInt(totalAmount);

  switch (strategy) {
    case 'PRO_RATA':
      return calculateProRata(holders, total);
    case 'EQUAL':
      return calculateEqual(holders, total);
    case 'TIERED':
      return calculateTiered(holders, total, parameters?.tiers as AllocationTier[] | undefined);
    case 'TIME_WEIGHTED':
      return calculateTimeWeighted(holders, total);
    default:
      return calculateProRata(holders, total);
  }
}

function calculateProRata(
  holders: HolderSnapshot[],
  totalAmount: bigint
): { recipientId: string; recipientAddress?: string; amount: string }[] {
  const totalBalance = holders.reduce((sum, h) => sum + BigInt(h.balance), 0n);

  if (totalBalance === 0n) {
    return holders.map(h => ({
      recipientId: h.holderId,
      recipientAddress: h.holderAddress,
      amount: '0',
    }));
  }

  return holders.map(h => ({
    recipientId: h.holderId,
    recipientAddress: h.holderAddress,
    amount: ((BigInt(h.balance) * totalAmount) / totalBalance).toString(),
  }));
}

function calculateEqual(
  holders: HolderSnapshot[],
  totalAmount: bigint
): { recipientId: string; recipientAddress?: string; amount: string }[] {
  const count = BigInt(holders.length);
  if (count === 0n) return [];

  const perHolder = totalAmount / count;

  return holders.map(h => ({
    recipientId: h.holderId,
    recipientAddress: h.holderAddress,
    amount: perHolder.toString(),
  }));
}

function calculateTiered(
  holders: HolderSnapshot[],
  totalAmount: bigint,
  tiers?: AllocationTier[]
): { recipientId: string; recipientAddress?: string; amount: string }[] {
  if (!tiers || tiers.length === 0) {
    return calculateProRata(holders, totalAmount);
  }

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
    }));
  }

  return weightedHolders.map(h => ({
    recipientId: h.holderId,
    recipientAddress: h.holderAddress,
    amount: ((h.weightedBalance * totalAmount) / totalWeighted).toString(),
  }));
}

function calculateTimeWeighted(
  holders: HolderSnapshot[],
  totalAmount: bigint
): { recipientId: string; recipientAddress?: string; amount: string }[] {
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
    }));
  }

  return weightedHolders.map(h => ({
    recipientId: h.holderId,
    recipientAddress: h.holderAddress,
    amount: ((h.weightedBalance * totalAmount) / totalWeighted).toString(),
  }));
}

function calculateNextDistribution(fromDate: string, frequency: DistributionFrequency): string {
  const date = new Date(fromDate);

  switch (frequency) {
    case 'DAILY':
      date.setDate(date.getDate() + 1);
      break;
    case 'WEEKLY':
      date.setDate(date.getDate() + 7);
      break;
    case 'BIWEEKLY':
      date.setDate(date.getDate() + 14);
      break;
    case 'MONTHLY':
      date.setMonth(date.getMonth() + 1);
      break;
    case 'QUARTERLY':
      date.setMonth(date.getMonth() + 3);
      break;
    case 'SEMI_ANNUAL':
      date.setMonth(date.getMonth() + 6);
      break;
    case 'ANNUAL':
      date.setFullYear(date.getFullYear() + 1);
      break;
    case 'ONE_TIME':
    case 'ON_DEMAND':
      return fromDate;
  }

  return date.toISOString();
}
