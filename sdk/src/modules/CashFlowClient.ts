/**
 * CashFlow Module (Thin API Client)
 *
 * A Stripe-like thin REST wrapper for distribution/cash flow operations.
 * This module delegates all business logic to the backend server
 * and does not maintain local state.
 *
 * For offline/local cash flow operations, see offline/CashFlowEngine.ts
 */

import type { HttpClient } from '../utils/http.js';
import type { PaginatedResponse } from '../types.js';
import {
  validate,
  UUIDSchema,
} from './validation.js';
import {
  CreateScheduleInputSchema,
  UpdateScheduleInputSchema,
  ExecuteDistributionInputSchema,
  ListSchedulesParamsSchema,
  ListDistributionsParamsSchema,
  type CreateScheduleInput,
  type UpdateScheduleInput,
  type ExecuteDistributionInput,
  type ListSchedulesParams,
  type ListDistributionsParams,
} from './validation-governance.js';

// ============================================================================
// Types
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
  assetId: string;
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
  createdAt: string;
  updatedAt: string;
}

export interface DistributionPayout {
  recipientId: string;
  recipientAddress?: string;
  amount: string;
  claimed: boolean;
  claimedAt?: string;
  txHash?: string;
}

export interface Distribution {
  id: string;
  scheduleId: string;
  assetId: string;
  type: DistributionType;
  status: DistributionStatus;
  totalAmount: string;
  currency: string;
  recipientCount: number;
  payouts: DistributionPayout[];
  snapshotAt: string;
  executedAt?: string;
  error?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface ClaimResult {
  distributionId: string;
  recipientId: string;
  amount: string;
  claimed: boolean;
  claimedAt?: string;
  txHash?: string;
}

export interface UnclaimedPayout {
  distributionId: string;
  amount: string;
  currency: string;
  type: DistributionType;
}

export interface YieldSummary {
  assetId: string;
  periodDays: number;
  totalDistributed: Record<string, string>;
  yieldPercentage: number;
  distributionCount: number;
}

// ============================================================================
// CashFlow Module
// ============================================================================

export class CashFlowModule {
  constructor(private http: HttpClient) {}

  // ============================================
  // Schedule Management
  // ============================================

  /**
   * Create a distribution schedule.
   */
  async scheduleDistribution(input: CreateScheduleInput): Promise<DistributionSchedule> {
    const validated = validate(CreateScheduleInputSchema, input);
    const response = await this.http.post<DistributionSchedule>(
      '/api/v1/distributions/schedules',
      validated
    );
    return response.data;
  }

  /**
   * Get a schedule by ID.
   */
  async getSchedule(scheduleId: string): Promise<DistributionSchedule> {
    const validatedId = validate(UUIDSchema, scheduleId);
    const response = await this.http.get<DistributionSchedule>(
      `/api/v1/distributions/schedules/${validatedId}`
    );
    return response.data;
  }

  /**
   * Update a schedule.
   */
  async updateSchedule(scheduleId: string, input: UpdateScheduleInput): Promise<DistributionSchedule> {
    const validatedId = validate(UUIDSchema, scheduleId);
    const validated = validate(UpdateScheduleInputSchema, input);
    const response = await this.http.patch<DistributionSchedule>(
      `/api/v1/distributions/schedules/${validatedId}`,
      validated
    );
    return response.data;
  }

  /**
   * List schedules with optional filters.
   */
  async listSchedules(params?: ListSchedulesParams): Promise<PaginatedResponse<DistributionSchedule>> {
    const validated = params ? validate(ListSchedulesParamsSchema, params) : undefined;
    return this.http.list<DistributionSchedule>(
      '/api/v1/distributions/schedules',
      validated as Record<string, string | number | boolean | undefined>
    );
  }

  /**
   * Pause a schedule.
   */
  async pauseSchedule(scheduleId: string): Promise<DistributionSchedule> {
    const validatedId = validate(UUIDSchema, scheduleId);
    const response = await this.http.post<DistributionSchedule>(
      `/api/v1/distributions/schedules/${validatedId}/pause`
    );
    return response.data;
  }

  /**
   * Resume a schedule.
   */
  async resumeSchedule(scheduleId: string): Promise<DistributionSchedule> {
    const validatedId = validate(UUIDSchema, scheduleId);
    const response = await this.http.post<DistributionSchedule>(
      `/api/v1/distributions/schedules/${validatedId}/resume`
    );
    return response.data;
  }

  /**
   * Delete a schedule.
   */
  async deleteSchedule(scheduleId: string): Promise<{ success: boolean }> {
    const validatedId = validate(UUIDSchema, scheduleId);
    const response = await this.http.delete<{ success: boolean }>(
      `/api/v1/distributions/schedules/${validatedId}`
    );
    return response.data;
  }

  // ============================================
  // Distribution Execution
  // ============================================

  /**
   * Execute a distribution (manual trigger or for on-demand schedules).
   */
  async processDistribution(
    scheduleId: string,
    input?: ExecuteDistributionInput
  ): Promise<Distribution> {
    const validatedId = validate(UUIDSchema, scheduleId);
    const validated = input ? validate(ExecuteDistributionInputSchema, input) : undefined;
    const response = await this.http.post<Distribution>(
      `/api/v1/distributions/schedules/${validatedId}/execute`,
      validated
    );
    return response.data;
  }

  /**
   * Get a distribution by ID.
   */
  async getDistribution(distributionId: string): Promise<Distribution> {
    const validatedId = validate(UUIDSchema, distributionId);
    const response = await this.http.get<Distribution>(
      `/api/v1/distributions/${validatedId}`
    );
    return response.data;
  }

  /**
   * List distributions with optional filters.
   */
  async getDistributionHistory(params?: ListDistributionsParams): Promise<PaginatedResponse<Distribution>> {
    const validated = params ? validate(ListDistributionsParamsSchema, params) : undefined;
    return this.http.list<Distribution>(
      '/api/v1/distributions',
      validated as Record<string, string | number | boolean | undefined>
    );
  }

  /**
   * Mark a distribution as completed (after on-chain confirmation).
   */
  async completeDistribution(distributionId: string, txHash?: string): Promise<Distribution> {
    const validatedId = validate(UUIDSchema, distributionId);
    const response = await this.http.post<Distribution>(
      `/api/v1/distributions/${validatedId}/complete`,
      { txHash }
    );
    return response.data;
  }

  /**
   * Mark a distribution as failed.
   */
  async failDistribution(distributionId: string, error: string): Promise<Distribution> {
    const validatedId = validate(UUIDSchema, distributionId);
    const response = await this.http.post<Distribution>(
      `/api/v1/distributions/${validatedId}/fail`,
      { error }
    );
    return response.data;
  }

  // ============================================
  // Payouts
  // ============================================

  /**
   * Claim a payout.
   */
  async claimPayout(distributionId: string): Promise<ClaimResult> {
    const validatedId = validate(UUIDSchema, distributionId);
    const response = await this.http.post<ClaimResult>(
      `/api/v1/distributions/${validatedId}/claim`
    );
    return response.data;
  }

  /**
   * Get unclaimed payouts for the current user.
   */
  async getUnclaimedPayouts(): Promise<UnclaimedPayout[]> {
    const response = await this.http.get<{ data: UnclaimedPayout[] }>(
      '/api/v1/distributions/payouts/unclaimed'
    );
    return response.data.data;
  }

  /**
   * Get payout history for the current user.
   */
  async getPayoutHistory(params?: { limit?: number; offset?: number }): Promise<PaginatedResponse<ClaimResult>> {
    return this.http.list<ClaimResult>(
      '/api/v1/distributions/payouts/history',
      params as Record<string, string | number | boolean | undefined>
    );
  }

  // ============================================
  // Analytics
  // ============================================

  /**
   * Get total distributed amounts for an asset.
   */
  async getTotalDistributed(assetId: string): Promise<Record<string, string>> {
    const validatedId = validate(UUIDSchema, assetId);
    const response = await this.http.get<Record<string, string>>(
      `/api/v1/distributions/assets/${validatedId}/totals`
    );
    return response.data;
  }

  /**
   * Get yield/APY summary for an asset.
   */
  async getYieldSummary(assetId: string, periodDays?: number): Promise<YieldSummary> {
    const validatedId = validate(UUIDSchema, assetId);
    const query = periodDays ? { periodDays } : undefined;
    const response = await this.http.get<YieldSummary>(
      `/api/v1/distributions/assets/${validatedId}/yield`,
      query as Record<string, string | number | boolean | undefined>
    );
    return response.data;
  }

  /**
   * Get due schedules (schedules ready to execute).
   */
  async getDueSchedules(): Promise<DistributionSchedule[]> {
    const response = await this.http.get<{ data: DistributionSchedule[] }>(
      '/api/v1/distributions/schedules/due'
    );
    return response.data.data;
  }
}
