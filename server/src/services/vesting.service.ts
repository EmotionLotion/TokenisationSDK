import { db, schema } from '../config/database.js';
import { eq, and, desc, lte, gte } from 'drizzle-orm';
import { NotFoundError, ValidationError } from '../middleware/errorHandler.js';
import * as auditService from './audit.service.js';
import { withRetryableTransaction } from '../utils/transaction.js';

const { vestingSchedules, vestingMilestones, vestingReleases, tokens, investors, ledgerPositions, eventBusQueue } = schema;

// ============================================================================
// Types
// ============================================================================

export type VestingType = 'linear' | 'cliff' | 'cliff_then_linear' | 'milestone' | 'graded';
export type VestingStatus = 'not_started' | 'active' | 'fully_vested' | 'terminated' | 'accelerated';
export type TerminationType = 'voluntary' | 'for_cause' | 'without_cause' | 'death_disability' | 'change_of_control';

export interface CreateVestingScheduleInput {
  orgId: string;
  tokenId: string;
  investorId: string;
  walletAddress: string;
  totalAmount: string;
  vestingType: VestingType;
  grantDate: Date;
  startDate: Date;
  cliffDate?: Date;
  endDate: Date;
  cliffMonths?: number;
  vestingMonths: number;
  cliffAmount?: string;
  gradedSchedule?: Array<{ monthsFromGrant: number; cumulativePercent: number }>;
  accelerationTriggers?: Array<{
    type: 'SINGLE_TRIGGER' | 'DOUBLE_TRIGGER' | 'CUSTOM';
    events: string[];
    accelerationPercent: number;
  }>;
  metadata?: Record<string, unknown>;
}

export interface CreateMilestoneInput {
  orgId: string;
  scheduleId: string;
  name: string;
  description?: string;
  vestingPercent: number;
  targetDate?: Date;
  metadata?: Record<string, unknown>;
}

export interface VestingCalculation {
  scheduleId: string;
  calculationDate: string;
  totalAmount: string;
  vestedAmount: string;
  unvestedAmount: string;
  claimedAmount: string;
  availableToClaim: string;
  nextVestingDate?: string;
  nextVestingAmount?: string;
  vestingPercent: number;
}

// ============================================================================
// Vesting Schedule Management
// ============================================================================

export async function createSchedule(input: CreateVestingScheduleInput) {
  // Validate token exists
  const token = await db.query.tokens.findFirst({
    where: and(eq(tokens.id, input.tokenId), eq(tokens.orgId, input.orgId)),
  });
  if (!token) {
    throw new NotFoundError('Token not found');
  }

  // Validate investor exists
  const investor = await db.query.investors.findFirst({
    where: and(eq(investors.id, input.investorId), eq(investors.orgId, input.orgId)),
  });
  if (!investor) {
    throw new NotFoundError('Investor not found');
  }

  // Validate amounts
  if (!/^\d+$/.test(input.totalAmount) || BigInt(input.totalAmount) <= 0n) {
    throw new ValidationError('Total amount must be a positive integer string');
  }

  // Validate dates
  if (input.endDate <= input.startDate) {
    throw new ValidationError('End date must be after start date');
  }

  if (input.cliffDate && input.cliffDate < input.startDate) {
    throw new ValidationError('Cliff date cannot be before start date');
  }

  const [schedule] = await db.insert(vestingSchedules).values({
    orgId: input.orgId,
    tokenId: input.tokenId,
    investorId: input.investorId,
    walletAddress: input.walletAddress.toLowerCase(),
    totalAmount: input.totalAmount,
    vestingType: input.vestingType,
    grantDate: input.grantDate,
    startDate: input.startDate,
    cliffDate: input.cliffDate,
    endDate: input.endDate,
    cliffMonths: input.cliffMonths || 0,
    vestingMonths: input.vestingMonths,
    cliffAmount: input.cliffAmount,
    gradedSchedule: input.gradedSchedule,
    accelerationTriggers: input.accelerationTriggers,
    status: new Date() >= input.startDate ? 'active' : 'not_started',
    metadata: input.metadata || {},
  }).returning();

  await db.insert(eventBusQueue).values({
    orgId: input.orgId,
    topic: 'vesting.schedule.created',
    payload: { scheduleId: schedule.id, investorId: input.investorId, totalAmount: input.totalAmount },
  });

  await auditService.logSystemAction(
    input.orgId,
    'vesting_schedule_created',
    'vesting_schedule',
    schedule.id,
    `Vesting schedule created for ${input.totalAmount} tokens`,
    { tokenId: input.tokenId, investorId: input.investorId }
  );

  return schedule;
}

export async function getSchedule(id: string, orgId: string) {
  const schedule = await db.query.vestingSchedules.findFirst({
    where: and(eq(vestingSchedules.id, id), eq(vestingSchedules.orgId, orgId)),
  });

  if (!schedule) {
    throw new NotFoundError('Vesting schedule not found');
  }

  return schedule;
}

export async function listSchedules(orgId: string, params: {
  tokenId?: string;
  investorId?: string;
  status?: VestingStatus;
  limit?: number;
  offset?: number;
} = {}) {
  const { tokenId, investorId, status, limit = 50, offset = 0 } = params;

  const conditions = [eq(vestingSchedules.orgId, orgId)];
  if (tokenId) conditions.push(eq(vestingSchedules.tokenId, tokenId));
  if (investorId) conditions.push(eq(vestingSchedules.investorId, investorId));
  if (status) conditions.push(eq(vestingSchedules.status, status));

  return db.select()
    .from(vestingSchedules)
    .where(and(...conditions))
    .orderBy(desc(vestingSchedules.createdAt))
    .limit(limit)
    .offset(offset);
}

// ============================================================================
// Vesting Calculations
// ============================================================================

export async function calculateVestedAmount(
  scheduleId: string,
  orgId: string,
  asOfDate?: Date
): Promise<VestingCalculation> {
  const schedule = await getSchedule(scheduleId, orgId);
  const now = asOfDate || new Date();

  const startDate = new Date(schedule.startDate);
  const endDate = new Date(schedule.endDate);
  const cliffDate = schedule.cliffDate ? new Date(schedule.cliffDate) : null;
  const totalAmount = BigInt(schedule.totalAmount);

  let vestedAmount = 0n;

  // Not started yet
  if (now < startDate) {
    return buildCalculation(schedule, '0', now);
  }

  // Fully vested
  if (now >= endDate) {
    return buildCalculation(schedule, schedule.totalAmount, now);
  }

  // Check cliff
  if (cliffDate && now < cliffDate) {
    return buildCalculation(schedule, '0', now);
  }

  // Calculate based on vesting type
  switch (schedule.vestingType) {
    case 'linear':
      vestedAmount = calculateLinearVesting(startDate, endDate, totalAmount, now);
      break;

    case 'cliff':
      // All vests at cliff
      vestedAmount = cliffDate && now >= cliffDate ? totalAmount : 0n;
      break;

    case 'cliff_then_linear':
      if (cliffDate && now >= cliffDate) {
        const cliffAmount = schedule.cliffAmount ? BigInt(schedule.cliffAmount) : 0n;
        const remainingAmount = totalAmount - cliffAmount;
        const linearVested = calculateLinearVesting(cliffDate, endDate, remainingAmount, now);
        vestedAmount = cliffAmount + linearVested;
      }
      break;

    case 'graded':
      vestedAmount = calculateGradedVesting(schedule, now);
      break;

    case 'milestone':
      vestedAmount = await calculateMilestoneVesting(scheduleId, orgId, totalAmount);
      break;
  }

  return buildCalculation(schedule, vestedAmount.toString(), now);
}

function calculateLinearVesting(
  startDate: Date,
  endDate: Date,
  totalAmount: bigint,
  now: Date
): bigint {
  const totalDuration = endDate.getTime() - startDate.getTime();
  const elapsed = Math.min(now.getTime() - startDate.getTime(), totalDuration);
  const percentage = elapsed / totalDuration;

  return (totalAmount * BigInt(Math.floor(percentage * 10000))) / 10000n;
}

function calculateGradedVesting(
  schedule: typeof vestingSchedules.$inferSelect,
  now: Date
): bigint {
  const gradedSchedule = schedule.gradedSchedule as Array<{ monthsFromGrant: number; cumulativePercent: number }>;
  if (!gradedSchedule || gradedSchedule.length === 0) {
    return 0n;
  }

  const grantDate = new Date(schedule.grantDate);
  const monthsElapsed = (now.getTime() - grantDate.getTime()) / (30 * 24 * 60 * 60 * 1000);
  const totalAmount = BigInt(schedule.totalAmount);

  let applicablePercent = 0;
  for (const step of gradedSchedule) {
    if (monthsElapsed >= step.monthsFromGrant) {
      applicablePercent = step.cumulativePercent;
    }
  }

  return (totalAmount * BigInt(Math.floor(applicablePercent * 100))) / 10000n;
}

async function calculateMilestoneVesting(
  scheduleId: string,
  orgId: string,
  totalAmount: bigint
): Promise<bigint> {
  const milestones = await db.select()
    .from(vestingMilestones)
    .where(and(
      eq(vestingMilestones.scheduleId, scheduleId),
      eq(vestingMilestones.status, 'completed')
    ));

  let totalPercent = 0;
  for (const milestone of milestones) {
    totalPercent += parseFloat(milestone.vestingPercent || '0');
  }

  return (totalAmount * BigInt(Math.floor(totalPercent * 100))) / 10000n;
}

function buildCalculation(
  schedule: typeof vestingSchedules.$inferSelect,
  vestedAmount: string,
  calculationDate: Date
): VestingCalculation {
  const total = BigInt(schedule.totalAmount);
  const vested = BigInt(vestedAmount);
  const claimed = BigInt(schedule.claimedAmount);

  return {
    scheduleId: schedule.id,
    calculationDate: calculationDate.toISOString(),
    totalAmount: schedule.totalAmount,
    vestedAmount,
    unvestedAmount: (total - vested).toString(),
    claimedAmount: schedule.claimedAmount,
    availableToClaim: (vested - claimed).toString(),
    vestingPercent: total > 0n ? Number((vested * 10000n) / total) / 100 : 0,
  };
}

// ============================================================================
// Milestone Management
// ============================================================================

export async function createMilestone(input: CreateMilestoneInput) {
  const schedule = await getSchedule(input.scheduleId, input.orgId);

  if (schedule.vestingType !== 'milestone') {
    throw new ValidationError('Cannot add milestones to non-milestone vesting schedule');
  }

  const [milestone] = await db.insert(vestingMilestones).values({
    orgId: input.orgId,
    scheduleId: input.scheduleId,
    name: input.name,
    description: input.description,
    vestingPercent: input.vestingPercent.toString(),
    targetDate: input.targetDate,
    metadata: input.metadata || {},
  }).returning();

  return milestone;
}

export async function completeMilestone(
  milestoneId: string,
  orgId: string,
  completedBy: string
) {
  const milestone = await db.query.vestingMilestones.findFirst({
    where: and(eq(vestingMilestones.id, milestoneId), eq(vestingMilestones.orgId, orgId)),
  });

  if (!milestone) {
    throw new NotFoundError('Milestone not found');
  }

  if (milestone.status === 'completed') {
    throw new ValidationError('Milestone already completed');
  }

  const [updated] = await db.update(vestingMilestones)
    .set({
      status: 'completed',
      completedAt: new Date(),
      completedBy,
    })
    .where(eq(vestingMilestones.id, milestoneId))
    .returning();

  await db.insert(eventBusQueue).values({
    orgId,
    topic: 'vesting.milestone.completed',
    payload: { milestoneId, scheduleId: milestone.scheduleId },
  });

  await auditService.logSystemAction(
    orgId,
    'vesting_milestone_completed',
    'vesting_milestone',
    milestoneId,
    `Milestone "${milestone.name}" completed`,
    { scheduleId: milestone.scheduleId, completedBy }
  );

  return updated;
}

export async function listMilestones(scheduleId: string, orgId: string) {
  return db.select()
    .from(vestingMilestones)
    .where(and(
      eq(vestingMilestones.scheduleId, scheduleId),
      eq(vestingMilestones.orgId, orgId)
    ))
    .orderBy(vestingMilestones.targetDate);
}

// ============================================================================
// Token Release
// ============================================================================

export async function releaseVestedTokens(scheduleId: string, orgId: string) {
  const schedule = await getSchedule(scheduleId, orgId);
  const calculation = await calculateVestedAmount(scheduleId, orgId);

  const availableToClaim = BigInt(calculation.availableToClaim);
  if (availableToClaim <= 0n) {
    throw new ValidationError('No tokens available to release');
  }

  const release = await withRetryableTransaction(async (tx) => {
    // Create release record
    const [newRelease] = await tx.insert(vestingReleases).values({
      orgId,
      scheduleId,
      amount: availableToClaim.toString(),
      releaseType: 'claim',
      status: 'pending',
    }).returning();

    // Update schedule claimed amount
    const newClaimedAmount = BigInt(schedule.claimedAmount) + availableToClaim;
    await tx.update(vestingSchedules)
      .set({
        claimedAmount: newClaimedAmount.toString(),
        vestedAmount: calculation.vestedAmount,
        status: newClaimedAmount >= BigInt(schedule.totalAmount) ? 'fully_vested' : 'active',
        updatedAt: new Date(),
      })
      .where(eq(vestingSchedules.id, scheduleId));

    // Update ledger position (credit tokens to investor)
    const existingPosition = await tx.query.ledgerPositions.findFirst({
      where: and(
        eq(ledgerPositions.tokenId, schedule.tokenId),
        eq(ledgerPositions.walletAddress, schedule.walletAddress.toLowerCase())
      ),
    });

    if (existingPosition) {
      const newBalance = BigInt(existingPosition.balance) + availableToClaim;
      await tx.update(ledgerPositions)
        .set({
          balance: newBalance.toString(),
          lastEventAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(ledgerPositions.id, existingPosition.id));
    } else {
      await tx.insert(ledgerPositions).values({
        orgId,
        tokenId: schedule.tokenId,
        investorId: schedule.investorId,
        walletAddress: schedule.walletAddress.toLowerCase(),
        balance: availableToClaim.toString(),
        lastEventAt: new Date(),
      });
    }

    // Emit event
    await tx.insert(eventBusQueue).values({
      orgId,
      topic: 'vesting.tokens.released',
      payload: {
        scheduleId,
        releaseId: newRelease.id,
        amount: availableToClaim.toString(),
        investorId: schedule.investorId,
      },
    });

    return newRelease;
  }, 3, 100);

  await auditService.logSystemAction(
    orgId,
    'vesting_tokens_released',
    'vesting_release',
    release.id,
    `Released ${availableToClaim.toString()} vested tokens`,
    { scheduleId, investorId: schedule.investorId }
  );

  return release;
}

// ============================================================================
// Termination
// ============================================================================

export async function terminateSchedule(
  scheduleId: string,
  orgId: string,
  terminationType: TerminationType,
  terminatedBy: string
) {
  const schedule = await getSchedule(scheduleId, orgId);

  if (schedule.status === 'terminated' || schedule.status === 'fully_vested') {
    throw new ValidationError(`Cannot terminate schedule in ${schedule.status} status`);
  }

  // Calculate final vested amount at termination
  const calculation = await calculateVestedAmount(scheduleId, orgId);

  const [updated] = await db.update(vestingSchedules)
    .set({
      status: 'terminated',
      terminationDate: new Date(),
      terminationType,
      vestedAmount: calculation.vestedAmount,
      updatedAt: new Date(),
    })
    .where(eq(vestingSchedules.id, scheduleId))
    .returning();

  await db.insert(eventBusQueue).values({
    orgId,
    topic: 'vesting.schedule.terminated',
    payload: { scheduleId, terminationType, finalVestedAmount: calculation.vestedAmount },
  });

  await auditService.logSystemAction(
    orgId,
    'vesting_schedule_terminated',
    'vesting_schedule',
    scheduleId,
    `Vesting schedule terminated: ${terminationType}`,
    { terminationType, terminatedBy, finalVestedAmount: calculation.vestedAmount }
  );

  return updated;
}

// ============================================================================
// Acceleration
// ============================================================================

export async function accelerateVesting(
  scheduleId: string,
  orgId: string,
  accelerationPercent: number,
  reason: string,
  acceleratedBy: string
) {
  const schedule = await getSchedule(scheduleId, orgId);

  if (schedule.status === 'terminated' || schedule.status === 'fully_vested') {
    throw new ValidationError(`Cannot accelerate schedule in ${schedule.status} status`);
  }

  if (accelerationPercent < 0 || accelerationPercent > 100) {
    throw new ValidationError('Acceleration percent must be between 0 and 100');
  }

  const totalAmount = BigInt(schedule.totalAmount);
  const currentVested = BigInt(schedule.vestedAmount);
  const acceleratedAmount = (totalAmount * BigInt(Math.floor(accelerationPercent * 100))) / 10000n;
  const newVestedAmount = currentVested > acceleratedAmount ? currentVested : acceleratedAmount;

  const [updated] = await db.update(vestingSchedules)
    .set({
      status: newVestedAmount >= totalAmount ? 'fully_vested' : 'accelerated',
      vestedAmount: newVestedAmount.toString(),
      updatedAt: new Date(),
    })
    .where(eq(vestingSchedules.id, scheduleId))
    .returning();

  await db.insert(eventBusQueue).values({
    orgId,
    topic: 'vesting.schedule.accelerated',
    payload: { scheduleId, accelerationPercent, newVestedAmount: newVestedAmount.toString() },
  });

  await auditService.logSystemAction(
    orgId,
    'vesting_schedule_accelerated',
    'vesting_schedule',
    scheduleId,
    `Vesting accelerated to ${accelerationPercent}%: ${reason}`,
    { accelerationPercent, reason, acceleratedBy }
  );

  return updated;
}

export async function listReleases(scheduleId: string, orgId: string) {
  return db.select()
    .from(vestingReleases)
    .where(and(
      eq(vestingReleases.scheduleId, scheduleId),
      eq(vestingReleases.orgId, orgId)
    ))
    .orderBy(desc(vestingReleases.releasedAt));
}
