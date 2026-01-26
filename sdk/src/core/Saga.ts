/**
 * Saga/Transaction Coordinator
 *
 * Manages multi-step operations with compensation (rollback) on failure.
 * Essential for operations like: KYC → Payment → Mint → Notify
 *
 * @example
 * ```typescript
 * const saga = new SagaCoordinator();
 *
 * const result = await saga
 *   .step('verify-kyc', async () => {
 *     return await kycProvider.verify(userId);
 *   }, async (kycResult) => {
 *     // Compensation: invalidate KYC if later steps fail
 *     await kycProvider.invalidate(kycResult.id);
 *   })
 *   .step('process-payment', async () => {
 *     return await stripe.createCharge(amount);
 *   }, async (charge) => {
 *     // Compensation: refund if later steps fail
 *     await stripe.refund(charge.id);
 *   })
 *   .step('mint-tokens', async () => {
 *     return await tokenContract.mint(to, amount);
 *   })
 *   .execute();
 * ```
 */

import { v4 as uuidv4 } from 'uuid';
import { ok, err, type Result } from './types.js';

// ============================================================================
// TYPES
// ============================================================================

export type StepStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'COMPENSATED';

export interface SagaStep<T = unknown> {
  name: string;
  status: StepStatus;
  execute: () => Promise<T>;
  compensate?: (result: T) => Promise<void>;
  result?: T;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface SagaState {
  id: string;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'COMPENSATING' | 'COMPENSATED';
  steps: Array<{
    name: string;
    status: StepStatus;
    error?: string;
    startedAt?: string;
    completedAt?: string;
  }>;
  startedAt: string;
  completedAt?: string;
  error?: string;
}

export interface SagaOptions {
  /** Saga identifier (auto-generated if not provided) */
  id?: string;
  /** Timeout for entire saga in ms (default: 5 minutes) */
  timeoutMs?: number;
  /** Whether to run compensation on timeout (default: true) */
  compensateOnTimeout?: boolean;
  /** Event handlers */
  onStepStart?: (stepName: string, sagaId: string) => void;
  onStepComplete?: (stepName: string, sagaId: string) => void;
  onStepFail?: (stepName: string, error: string, sagaId: string) => void;
  onCompensationStart?: (stepName: string, sagaId: string) => void;
  onCompensationComplete?: (stepName: string, sagaId: string) => void;
  onCompensationFail?: (stepName: string, error: string, sagaId: string) => void;
}

export interface SagaResult<T> {
  sagaId: string;
  success: boolean;
  results: Record<string, unknown>;
  finalResult?: T;
  error?: string;
  compensated: boolean;
  state: SagaState;
}

// ============================================================================
// SAGA BUILDER
// ============================================================================

interface StepDefinition<T> {
  name: string;
  execute: () => Promise<T>;
  compensate?: (result: T) => Promise<void>;
}

export class SagaBuilder<TContext extends Record<string, unknown> = Record<string, unknown>> {
  private steps: StepDefinition<unknown>[] = [];
  private options: SagaOptions;

  constructor(options: SagaOptions = {}) {
    this.options = options;
  }

  /**
   * Add a step to the saga
   */
  step<TResult>(
    name: string,
    execute: (context: TContext) => Promise<TResult>,
    compensate?: (result: TResult, context: TContext) => Promise<void>
  ): SagaBuilder<TContext & { [K in typeof name]: TResult }> {
    this.steps.push({
      name,
      execute: execute as () => Promise<unknown>,
      compensate: compensate as ((result: unknown) => Promise<void>) | undefined,
    });
    return this as unknown as SagaBuilder<TContext & { [K in typeof name]: TResult }>;
  }

  /**
   * Execute the saga
   */
  async execute(): Promise<Result<SagaResult<TContext>, string>> {
    const coordinator = new SagaCoordinator(this.options);

    for (const step of this.steps) {
      coordinator.addStep(step.name, step.execute, step.compensate);
    }

    return coordinator.execute();
  }
}

// ============================================================================
// SAGA COORDINATOR
// ============================================================================

export class SagaCoordinator {
  private id: string;
  private steps: SagaStep[] = [];
  private results: Record<string, unknown> = {};
  private status: SagaState['status'] = 'RUNNING';
  private options: Required<SagaOptions>;
  private startedAt: string;

  constructor(options: SagaOptions = {}) {
    this.id = options.id ?? uuidv4();
    this.startedAt = new Date().toISOString();
    this.options = {
      id: this.id,
      timeoutMs: options.timeoutMs ?? 5 * 60 * 1000,
      compensateOnTimeout: options.compensateOnTimeout ?? true,
      onStepStart: options.onStepStart ?? (() => {}),
      onStepComplete: options.onStepComplete ?? (() => {}),
      onStepFail: options.onStepFail ?? (() => {}),
      onCompensationStart: options.onCompensationStart ?? (() => {}),
      onCompensationComplete: options.onCompensationComplete ?? (() => {}),
      onCompensationFail: options.onCompensationFail ?? (() => {}),
    };
  }

  /**
   * Add a step to the saga
   */
  addStep<T>(
    name: string,
    execute: () => Promise<T>,
    compensate?: (result: T) => Promise<void>
  ): this {
    this.steps.push({
      name,
      status: 'PENDING',
      execute,
      compensate: compensate as ((result: unknown) => Promise<void>) | undefined,
    });
    return this;
  }

  /**
   * Execute the saga
   */
  async execute<T = Record<string, unknown>>(): Promise<Result<SagaResult<T>, string>> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Saga timed out after ${this.options.timeoutMs}ms`));
      }, this.options.timeoutMs);
    });

    try {
      const executionPromise = this.executeSteps();
      await Promise.race([executionPromise, timeoutPromise]);

      this.status = 'COMPLETED';

      return ok({
        sagaId: this.id,
        success: true,
        results: this.results,
        finalResult: this.results as T,
        compensated: false,
        state: this.getState(),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Run compensation
      if (this.options.compensateOnTimeout || !errorMessage.includes('timed out')) {
        await this.compensate();
      }

      return ok({
        sagaId: this.id,
        success: false,
        results: this.results,
        error: errorMessage,
        compensated: this.status === 'COMPENSATED',
        state: this.getState(),
      });
    }
  }

  /**
   * Get current saga state
   */
  getState(): SagaState {
    return {
      id: this.id,
      status: this.status,
      steps: this.steps.map((s) => ({
        name: s.name,
        status: s.status,
        error: s.error,
        startedAt: s.startedAt,
        completedAt: s.completedAt,
      })),
      startedAt: this.startedAt,
      completedAt: this.status === 'COMPLETED' || this.status === 'COMPENSATED'
        ? new Date().toISOString()
        : undefined,
      error: this.steps.find((s) => s.error)?.error,
    };
  }

  private async executeSteps(): Promise<void> {
    for (const step of this.steps) {
      step.status = 'RUNNING';
      step.startedAt = new Date().toISOString();
      this.options.onStepStart(step.name, this.id);

      try {
        step.result = await step.execute();
        step.status = 'COMPLETED';
        step.completedAt = new Date().toISOString();
        this.results[step.name] = step.result;
        this.options.onStepComplete(step.name, this.id);
      } catch (error) {
        step.status = 'FAILED';
        step.error = error instanceof Error ? error.message : String(error);
        step.completedAt = new Date().toISOString();
        this.options.onStepFail(step.name, step.error, this.id);
        throw error;
      }
    }
  }

  private async compensate(): Promise<void> {
    this.status = 'COMPENSATING';

    // Compensate in reverse order (only completed steps)
    const completedSteps = this.steps
      .filter((s) => s.status === 'COMPLETED' && s.compensate)
      .reverse();

    for (const step of completedSteps) {
      this.options.onCompensationStart(step.name, this.id);

      try {
        await step.compensate!(step.result);
        step.status = 'COMPENSATED';
        this.options.onCompensationComplete(step.name, this.id);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.options.onCompensationFail(step.name, errorMessage, this.id);
        // Continue compensating other steps even if one fails
      }
    }

    this.status = 'COMPENSATED';
  }
}

// ============================================================================
// PRE-BUILT SAGA TEMPLATES
// ============================================================================

/**
 * Subscription saga: KYC → Payment → Allocation → Notification
 */
export function createSubscriptionSaga(
  options: SagaOptions = {}
): SagaBuilder<Record<string, unknown>> {
  return new SagaBuilder({
    ...options,
    id: options.id ?? `subscription-${uuidv4().slice(0, 8)}`,
  });
}

/**
 * Token issuance saga: Verify → Deploy → Mint → Register
 */
export function createIssuanceSaga(
  options: SagaOptions = {}
): SagaBuilder<Record<string, unknown>> {
  return new SagaBuilder({
    ...options,
    id: options.id ?? `issuance-${uuidv4().slice(0, 8)}`,
  });
}

/**
 * Transfer saga: Compliance → Debit → Credit → Settle
 */
export function createTransferSaga(
  options: SagaOptions = {}
): SagaBuilder<Record<string, unknown>> {
  return new SagaBuilder({
    ...options,
    id: options.id ?? `transfer-${uuidv4().slice(0, 8)}`,
  });
}

/**
 * Redemption saga: Verify → Burn → Payout → Close
 */
export function createRedemptionSaga(
  options: SagaOptions = {}
): SagaBuilder<Record<string, unknown>> {
  return new SagaBuilder({
    ...options,
    id: options.id ?? `redemption-${uuidv4().slice(0, 8)}`,
  });
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Create a new saga builder
 */
export function saga(options: SagaOptions = {}): SagaBuilder<Record<string, unknown>> {
  return new SagaBuilder(options);
}
