/**
 * Vesting Module
 *
 * Handles employee equity vesting schedules with:
 * - Cliff periods
 * - Linear/graded vesting
 * - Acceleration triggers
 * - Termination handling
 */

import { v4 as uuidv4 } from 'uuid';
import type { IEventStore } from '../core/interfaces.js';
import { EventType, type BaseEvent } from '../core/types.js';

// ============================================================================
// TYPES
// ============================================================================

export enum VestingType {
  /** All tokens vest at once after cliff */
  CLIFF_ONLY = 'CLIFF_ONLY',
  /** Linear vesting over time */
  LINEAR = 'LINEAR',
  /** Cliff then linear */
  CLIFF_THEN_LINEAR = 'CLIFF_THEN_LINEAR',
  /** Custom schedule with milestones */
  MILESTONE = 'MILESTONE',
  /** Graded vesting (increasing percentages) */
  GRADED = 'GRADED',
}

export enum VestingStatus {
  NOT_STARTED = 'NOT_STARTED',
  VESTING = 'VESTING',
  FULLY_VESTED = 'FULLY_VESTED',
  TERMINATED = 'TERMINATED',
  ACCELERATED = 'ACCELERATED',
}

export enum TerminationType {
  /** Voluntary resignation */
  VOLUNTARY = 'VOLUNTARY',
  /** Termination for cause */
  FOR_CAUSE = 'FOR_CAUSE',
  /** Termination without cause */
  WITHOUT_CAUSE = 'WITHOUT_CAUSE',
  /** Death or disability */
  DEATH_DISABILITY = 'DEATH_DISABILITY',
  /** Change of control */
  CHANGE_OF_CONTROL = 'CHANGE_OF_CONTROL',
}

export interface VestingSchedule {
  id: string;
  /** Beneficiary ID */
  beneficiaryId: string;
  /** Asset ID */
  assetId: string;
  /** Total grant amount */
  totalAmount: string;
  /** Vesting type */
  vestingType: VestingType;
  /** Grant date */
  grantDate: string;
  /** Cliff period in months (0 for no cliff) */
  cliffMonths: number;
  /** Total vesting period in months */
  vestingMonths: number;
  /** Vested amount */
  vestedAmount: string;
  /** Claimed amount */
  claimedAmount: string;
  /** Status */
  status: VestingStatus;
  /** Termination date (if terminated) */
  terminationDate?: string;
  /** Termination type */
  terminationType?: TerminationType;
  /** Graded schedule (for GRADED type) */
  gradedSchedule?: GradedVestingStep[];
  /** Milestone schedule (for MILESTONE type) */
  milestones?: VestingMilestone[];
  /** Acceleration triggers */
  accelerationTriggers?: AccelerationTrigger[];
  /** Metadata */
  metadata: Record<string, unknown>;
  /** Created at */
  createdAt: string;
  /** Updated at */
  updatedAt: string;
}

export interface GradedVestingStep {
  /** Months from grant */
  monthsFromGrant: number;
  /** Cumulative percentage vested */
  cumulativePercent: number;
}

export interface VestingMilestone {
  id: string;
  /** Milestone description */
  description: string;
  /** Percentage that vests on completion */
  vestingPercent: number;
  /** Target date (optional) */
  targetDate?: string;
  /** Completed */
  completed: boolean;
  /** Completion date */
  completedDate?: string;
}

export interface AccelerationTrigger {
  /** Trigger type */
  type: 'SINGLE_TRIGGER' | 'DOUBLE_TRIGGER' | 'CUSTOM';
  /** Events that trigger acceleration */
  events: string[];
  /** Acceleration percentage (100 = full acceleration) */
  accelerationPercent: number;
}

export interface VestingCalculation {
  /** Schedule ID */
  scheduleId: string;
  /** Calculation date */
  calculationDate: string;
  /** Total granted */
  totalAmount: string;
  /** Amount vested */
  vestedAmount: string;
  /** Amount unvested */
  unvestedAmount: string;
  /** Amount claimed */
  claimedAmount: string;
  /** Amount available to claim */
  availableToClaim: string;
  /** Next vesting date */
  nextVestingDate?: string;
  /** Next vesting amount */
  nextVestingAmount?: string;
  /** Vesting percentage */
  vestingPercent: number;
}

// ============================================================================
// VESTING ENGINE
// ============================================================================

export class VestingEngine {
  private eventStore: IEventStore;
  private schedules: Map<string, VestingSchedule> = new Map();
  private schedulesByBeneficiary: Map<string, Set<string>> = new Map();
  private schedulesByAsset: Map<string, Set<string>> = new Map();

  constructor(eventStore: IEventStore) {
    this.eventStore = eventStore;
  }

  /**
   * Create a new vesting schedule
   */
  createSchedule(params: {
    beneficiaryId: string;
    assetId: string;
    totalAmount: string;
    vestingType: VestingType;
    grantDate?: string;
    cliffMonths?: number;
    vestingMonths: number;
    gradedSchedule?: GradedVestingStep[];
    milestones?: VestingMilestone[];
    accelerationTriggers?: AccelerationTrigger[];
    metadata?: Record<string, unknown>;
  }): VestingSchedule {
    const now = new Date().toISOString();
    const schedule: VestingSchedule = {
      id: uuidv4(),
      beneficiaryId: params.beneficiaryId,
      assetId: params.assetId,
      totalAmount: params.totalAmount,
      vestingType: params.vestingType,
      grantDate: params.grantDate ?? now,
      cliffMonths: params.cliffMonths ?? 0,
      vestingMonths: params.vestingMonths,
      vestedAmount: '0',
      claimedAmount: '0',
      status: VestingStatus.NOT_STARTED,
      gradedSchedule: params.gradedSchedule,
      milestones: params.milestones?.map(m => ({ ...m, id: uuidv4(), completed: false })),
      accelerationTriggers: params.accelerationTriggers,
      metadata: params.metadata ?? {},
      createdAt: now,
      updatedAt: now,
    };

    this.schedules.set(schedule.id, schedule);
    this.indexSchedule(schedule);

    // Emit event
    this.emitEvent({
      type: EventType.ASSET_UPDATED,
      assetId: params.assetId,
      actorId: 'system',
      payload: {
        action: 'VESTING_SCHEDULE_CREATED',
        scheduleId: schedule.id,
        beneficiaryId: params.beneficiaryId,
        totalAmount: params.totalAmount,
        vestingType: params.vestingType,
      },
    });

    return schedule;
  }

  /**
   * Calculate current vesting state
   */
  calculateVesting(scheduleId: string, asOfDate?: string): VestingCalculation {
    const schedule = this.schedules.get(scheduleId);
    if (!schedule) {
      throw new Error(`Schedule not found: ${scheduleId}`);
    }

    const calculationDate = asOfDate ?? new Date().toISOString();
    const grantDate = new Date(schedule.grantDate);
    const calcDate = new Date(calculationDate);

    // Calculate months elapsed
    const monthsElapsed = this.monthsBetween(grantDate, calcDate);

    let vestedPercent = 0;

    if (schedule.status === VestingStatus.TERMINATED) {
      // Use vested amount at termination
      vestedPercent = (parseFloat(schedule.vestedAmount) / parseFloat(schedule.totalAmount)) * 100;
    } else if (schedule.status === VestingStatus.ACCELERATED) {
      vestedPercent = 100;
    } else {
      vestedPercent = this.calculateVestedPercent(schedule, monthsElapsed);
    }

    const totalAmount = BigInt(schedule.totalAmount);
    const vestedAmount = (totalAmount * BigInt(Math.floor(vestedPercent * 100))) / BigInt(10000);
    const claimedAmount = BigInt(schedule.claimedAmount);
    const availableToClaim = vestedAmount - claimedAmount;

    // Calculate next vesting
    const nextVesting = this.calculateNextVesting(schedule, monthsElapsed);

    return {
      scheduleId,
      calculationDate,
      totalAmount: schedule.totalAmount,
      vestedAmount: vestedAmount.toString(),
      unvestedAmount: (totalAmount - vestedAmount).toString(),
      claimedAmount: schedule.claimedAmount,
      availableToClaim: availableToClaim > 0n ? availableToClaim.toString() : '0',
      nextVestingDate: nextVesting?.date,
      nextVestingAmount: nextVesting?.amount,
      vestingPercent: vestedPercent,
    };
  }

  /**
   * Claim vested tokens
   */
  async claim(scheduleId: string, amount?: string): Promise<{
    claimedAmount: string;
    remainingVested: string;
  }> {
    const schedule = this.schedules.get(scheduleId);
    if (!schedule) {
      throw new Error(`Schedule not found: ${scheduleId}`);
    }

    const calculation = this.calculateVesting(scheduleId);
    const availableToClaim = BigInt(calculation.availableToClaim);

    if (availableToClaim <= 0n) {
      throw new Error('No tokens available to claim');
    }

    const claimAmount = amount ? BigInt(amount) : availableToClaim;
    if (claimAmount > availableToClaim) {
      throw new Error(`Cannot claim ${claimAmount}, only ${availableToClaim} available`);
    }

    // Update schedule
    schedule.claimedAmount = (BigInt(schedule.claimedAmount) + claimAmount).toString();
    schedule.vestedAmount = calculation.vestedAmount;
    schedule.updatedAt = new Date().toISOString();

    if (schedule.status === VestingStatus.NOT_STARTED) {
      schedule.status = VestingStatus.VESTING;
    }

    // Emit event
    await this.emitEvent({
      type: EventType.ASSET_UPDATED,
      assetId: schedule.assetId,
      actorId: schedule.beneficiaryId,
      payload: {
        action: 'VESTING_CLAIMED',
        scheduleId,
        claimedAmount: claimAmount.toString(),
        totalClaimed: schedule.claimedAmount,
      },
    });

    return {
      claimedAmount: claimAmount.toString(),
      remainingVested: (availableToClaim - claimAmount).toString(),
    };
  }

  /**
   * Complete a milestone
   */
  completeMilestone(scheduleId: string, milestoneId: string): VestingMilestone {
    const schedule = this.schedules.get(scheduleId);
    if (!schedule) {
      throw new Error(`Schedule not found: ${scheduleId}`);
    }

    if (schedule.vestingType !== VestingType.MILESTONE) {
      throw new Error('Schedule is not milestone-based');
    }

    const milestone = schedule.milestones?.find(m => m.id === milestoneId);
    if (!milestone) {
      throw new Error(`Milestone not found: ${milestoneId}`);
    }

    if (milestone.completed) {
      throw new Error('Milestone already completed');
    }

    milestone.completed = true;
    milestone.completedDate = new Date().toISOString();
    schedule.updatedAt = new Date().toISOString();

    // Check if fully vested
    const allCompleted = schedule.milestones?.every(m => m.completed);
    if (allCompleted) {
      schedule.status = VestingStatus.FULLY_VESTED;
    } else if (schedule.status === VestingStatus.NOT_STARTED) {
      schedule.status = VestingStatus.VESTING;
    }

    // Emit event
    this.emitEvent({
      type: EventType.ASSET_UPDATED,
      assetId: schedule.assetId,
      actorId: 'system',
      payload: {
        action: 'VESTING_MILESTONE_COMPLETED',
        scheduleId,
        milestoneId,
        vestingPercent: milestone.vestingPercent,
      },
    });

    return milestone;
  }

  /**
   * Terminate vesting
   */
  terminate(scheduleId: string, terminationType: TerminationType): VestingSchedule {
    const schedule = this.schedules.get(scheduleId);
    if (!schedule) {
      throw new Error(`Schedule not found: ${scheduleId}`);
    }

    if (schedule.status === VestingStatus.TERMINATED) {
      throw new Error('Schedule already terminated');
    }

    const now = new Date().toISOString();
    const calculation = this.calculateVesting(scheduleId);

    // Handle different termination types
    let finalVestedAmount = calculation.vestedAmount;

    if (terminationType === TerminationType.FOR_CAUSE) {
      // Forfeit all unvested AND unclaimed vested
      finalVestedAmount = schedule.claimedAmount;
    } else if (terminationType === TerminationType.DEATH_DISABILITY) {
      // Often triggers acceleration
      const trigger = schedule.accelerationTriggers?.find(
        t => t.events.includes('DEATH_DISABILITY')
      );
      if (trigger) {
        const acceleratedAmount = (BigInt(schedule.totalAmount) * BigInt(trigger.accelerationPercent)) / 100n;
        finalVestedAmount = acceleratedAmount.toString();
      }
    } else if (terminationType === TerminationType.CHANGE_OF_CONTROL) {
      // Check for acceleration triggers
      const trigger = schedule.accelerationTriggers?.find(
        t => t.events.includes('CHANGE_OF_CONTROL')
      );
      if (trigger) {
        const acceleratedAmount = (BigInt(schedule.totalAmount) * BigInt(trigger.accelerationPercent)) / 100n;
        finalVestedAmount = acceleratedAmount.toString();
      }
    }

    schedule.status = VestingStatus.TERMINATED;
    schedule.terminationDate = now;
    schedule.terminationType = terminationType;
    schedule.vestedAmount = finalVestedAmount;
    schedule.updatedAt = now;

    // Emit event
    this.emitEvent({
      type: EventType.ASSET_UPDATED,
      assetId: schedule.assetId,
      actorId: 'system',
      payload: {
        action: 'VESTING_TERMINATED',
        scheduleId,
        terminationType,
        finalVestedAmount,
        forfeitedAmount: (BigInt(schedule.totalAmount) - BigInt(finalVestedAmount)).toString(),
      },
    });

    return schedule;
  }

  /**
   * Trigger acceleration
   */
  accelerate(scheduleId: string, triggerEvent: string): VestingSchedule {
    const schedule = this.schedules.get(scheduleId);
    if (!schedule) {
      throw new Error(`Schedule not found: ${scheduleId}`);
    }

    const trigger = schedule.accelerationTriggers?.find(t => t.events.includes(triggerEvent));
    if (!trigger) {
      throw new Error(`No acceleration trigger for event: ${triggerEvent}`);
    }

    const acceleratedAmount = (BigInt(schedule.totalAmount) * BigInt(trigger.accelerationPercent)) / 100n;

    schedule.status = trigger.accelerationPercent === 100
      ? VestingStatus.ACCELERATED
      : VestingStatus.VESTING;
    schedule.vestedAmount = acceleratedAmount.toString();
    schedule.updatedAt = new Date().toISOString();

    // Emit event
    this.emitEvent({
      type: EventType.ASSET_UPDATED,
      assetId: schedule.assetId,
      actorId: 'system',
      payload: {
        action: 'VESTING_ACCELERATED',
        scheduleId,
        triggerEvent,
        accelerationPercent: trigger.accelerationPercent,
        newVestedAmount: schedule.vestedAmount,
      },
    });

    return schedule;
  }

  /**
   * Get schedule by ID
   */
  getSchedule(scheduleId: string): VestingSchedule | undefined {
    return this.schedules.get(scheduleId);
  }

  /**
   * Get schedules for beneficiary
   */
  getSchedulesForBeneficiary(beneficiaryId: string): VestingSchedule[] {
    const scheduleIds = this.schedulesByBeneficiary.get(beneficiaryId);
    if (!scheduleIds) return [];
    return Array.from(scheduleIds).map(id => this.schedules.get(id)!).filter(Boolean);
  }

  /**
   * Get schedules for asset
   */
  getSchedulesForAsset(assetId: string): VestingSchedule[] {
    const scheduleIds = this.schedulesByAsset.get(assetId);
    if (!scheduleIds) return [];
    return Array.from(scheduleIds).map(id => this.schedules.get(id)!).filter(Boolean);
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private calculateVestedPercent(schedule: VestingSchedule, monthsElapsed: number): number {
    if (monthsElapsed < 0) return 0;

    // Check cliff
    if (monthsElapsed < schedule.cliffMonths) {
      return 0;
    }

    switch (schedule.vestingType) {
      case VestingType.CLIFF_ONLY:
        return monthsElapsed >= schedule.cliffMonths ? 100 : 0;

      case VestingType.LINEAR:
        return Math.min(100, (monthsElapsed / schedule.vestingMonths) * 100);

      case VestingType.CLIFF_THEN_LINEAR: {
        if (monthsElapsed < schedule.cliffMonths) return 0;
        const monthsAfterCliff = monthsElapsed - schedule.cliffMonths;
        const vestingAfterCliff = schedule.vestingMonths - schedule.cliffMonths;
        const cliffPercent = (schedule.cliffMonths / schedule.vestingMonths) * 100;
        const linearPercent = (monthsAfterCliff / vestingAfterCliff) * (100 - cliffPercent);
        return Math.min(100, cliffPercent + linearPercent);
      }

      case VestingType.GRADED: {
        if (!schedule.gradedSchedule) return 0;
        let vestedPercent = 0;
        for (const step of schedule.gradedSchedule) {
          if (monthsElapsed >= step.monthsFromGrant) {
            vestedPercent = step.cumulativePercent;
          }
        }
        return vestedPercent;
      }

      case VestingType.MILESTONE: {
        if (!schedule.milestones) return 0;
        return schedule.milestones
          .filter(m => m.completed)
          .reduce((sum, m) => sum + m.vestingPercent, 0);
      }

      default:
        return 0;
    }
  }

  private calculateNextVesting(
    schedule: VestingSchedule,
    currentMonths: number
  ): { date: string; amount: string } | undefined {
    if (schedule.status === VestingStatus.FULLY_VESTED ||
        schedule.status === VestingStatus.TERMINATED ||
        schedule.status === VestingStatus.ACCELERATED) {
      return undefined;
    }

    const grantDate = new Date(schedule.grantDate);

    switch (schedule.vestingType) {
      case VestingType.CLIFF_ONLY:
        if (currentMonths < schedule.cliffMonths) {
          const cliffDate = new Date(grantDate);
          cliffDate.setMonth(cliffDate.getMonth() + schedule.cliffMonths);
          return { date: cliffDate.toISOString(), amount: schedule.totalAmount };
        }
        return undefined;

      case VestingType.LINEAR:
      case VestingType.CLIFF_THEN_LINEAR: {
        const nextMonth = Math.ceil(currentMonths) + 1;
        if (nextMonth > schedule.vestingMonths) return undefined;
        const nextDate = new Date(grantDate);
        nextDate.setMonth(nextDate.getMonth() + nextMonth);
        const monthlyAmount = BigInt(schedule.totalAmount) / BigInt(schedule.vestingMonths);
        return { date: nextDate.toISOString(), amount: monthlyAmount.toString() };
      }

      case VestingType.GRADED: {
        const nextStep = schedule.gradedSchedule?.find(s => s.monthsFromGrant > currentMonths);
        if (!nextStep) return undefined;
        const nextDate = new Date(grantDate);
        nextDate.setMonth(nextDate.getMonth() + nextStep.monthsFromGrant);
        const prevPercent = schedule.gradedSchedule
          ?.filter(s => s.monthsFromGrant <= currentMonths)
          .reduce((max, s) => Math.max(max, s.cumulativePercent), 0) ?? 0;
        const vestingPercent = nextStep.cumulativePercent - prevPercent;
        const amount = (BigInt(schedule.totalAmount) * BigInt(vestingPercent)) / 100n;
        return { date: nextDate.toISOString(), amount: amount.toString() };
      }

      default:
        return undefined;
    }
  }

  private monthsBetween(start: Date, end: Date): number {
    const years = end.getFullYear() - start.getFullYear();
    const months = end.getMonth() - start.getMonth();
    const days = end.getDate() - start.getDate();
    return years * 12 + months + (days > 0 ? days / 30 : 0);
  }

  private indexSchedule(schedule: VestingSchedule): void {
    // Index by beneficiary
    if (!this.schedulesByBeneficiary.has(schedule.beneficiaryId)) {
      this.schedulesByBeneficiary.set(schedule.beneficiaryId, new Set());
    }
    this.schedulesByBeneficiary.get(schedule.beneficiaryId)!.add(schedule.id);

    // Index by asset
    if (!this.schedulesByAsset.has(schedule.assetId)) {
      this.schedulesByAsset.set(schedule.assetId, new Set());
    }
    this.schedulesByAsset.get(schedule.assetId)!.add(schedule.id);
  }

  private async emitEvent(event: Omit<BaseEvent, 'id' | 'timestamp' | 'eventVersion'>): Promise<void> {
    await this.eventStore.append({
      ...event,
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      eventVersion: 1,
    });
  }
}

export default VestingEngine;
