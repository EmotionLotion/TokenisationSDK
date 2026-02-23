/**
 * Enhanced Saga Types
 *
 * Extended type definitions for saga orchestration with persistence.
 */

// ============================================================================
// SAGA STATE TYPES
// ============================================================================

/**
 * Saga step status
 */
export type SagaStepStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'COMPENSATING'
  | 'COMPENSATED'
  | 'COMPENSATION_FAILED';

/**
 * Overall saga status
 */
export type SagaStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'COMPENSATING'
  | 'COMPENSATED'
  | 'COMPENSATION_FAILED';

/**
 * Persisted step state
 */
export interface PersistedStepState {
  name: string;
  status: SagaStepStatus;
  result?: unknown;
  error?: string;
  startedAt?: string;
  completedAt?: string;
  compensatedAt?: string;
  attempts: number;
  maxAttempts: number;
}

/**
 * Persisted saga state
 */
export interface PersistedSagaState {
  id: string;
  type: string;
  status: SagaStatus;
  currentStepIndex: number;
  steps: PersistedStepState[];
  context: Record<string, unknown>;
  results: Record<string, unknown>;
  error?: string;
  metadata?: Record<string, unknown>;
  startedAt: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

// ============================================================================
// SAGA DEFINITION TYPES
// ============================================================================

/**
 * Step execution function
 */
export type StepExecutor<TContext, TResult> = (
  context: TContext
) => Promise<TResult>;

/**
 * Step compensation function
 */
export type StepCompensator<TContext, TResult> = (
  result: TResult,
  context: TContext
) => Promise<void>;

/**
 * Step definition
 */
export interface SagaStepDefinition<TContext = Record<string, unknown>, TResult = unknown> {
  /** Step name (unique within saga) */
  name: string;
  /** Execute the step */
  execute: StepExecutor<TContext, TResult>;
  /** Compensate (rollback) the step on failure */
  compensate?: StepCompensator<TContext, TResult>;
  /** Maximum retry attempts (default: 1) */
  maxAttempts?: number;
  /** Timeout in milliseconds */
  timeoutMs?: number;
  /** Whether this step is idempotent */
  idempotent?: boolean;
  /** Whether compensation is required (default: true if compensate is provided) */
  compensationRequired?: boolean;
}

/**
 * Saga definition
 */
export interface SagaDefinition<TContext = Record<string, unknown>> {
  /** Saga type identifier */
  type: string;
  /** Description for logging */
  description?: string;
  /** Steps in execution order */
  steps: SagaStepDefinition<TContext, unknown>[];
  /** Overall timeout in milliseconds */
  timeoutMs?: number;
  /** Whether to compensate on timeout (default: true) */
  compensateOnTimeout?: boolean;
  /** Event handlers */
  onStart?: (sagaId: string, context: TContext) => void | Promise<void>;
  onComplete?: (sagaId: string, results: Record<string, unknown>) => void | Promise<void>;
  onFail?: (sagaId: string, error: string) => void | Promise<void>;
  onCompensate?: (sagaId: string) => void | Promise<void>;
}

// ============================================================================
// SAGA EXECUTION OPTIONS
// ============================================================================

/**
 * Options for saga execution
 */
export interface SagaExecutionOptions {
  /** Custom saga ID (auto-generated if not provided) */
  sagaId?: string;
  /** Initial context data */
  context?: Record<string, unknown>;
  /** Additional metadata for logging/debugging */
  metadata?: Record<string, unknown>;
  /** Override default timeout */
  timeoutMs?: number;
  /** Correlation ID for tracing */
  correlationId?: string;
}

/**
 * Saga execution result
 */
export interface SagaExecutionResult<TResults = Record<string, unknown>> {
  sagaId: string;
  type: string;
  success: boolean;
  results: TResults;
  error?: string;
  compensated: boolean;
  state: PersistedSagaState;
  duration: number;
}

// ============================================================================
// SAGA QUERY TYPES
// ============================================================================

/**
 * Query options for saga storage
 */
export interface SagaQueryOptions {
  type?: string;
  status?: SagaStatus | SagaStatus[];
  fromDate?: string;
  toDate?: string;
  limit?: number;
  offset?: number;
  orderBy?: 'createdAt' | 'updatedAt' | 'startedAt';
  orderDirection?: 'asc' | 'desc';
}

/**
 * Saga summary for listings
 */
export interface SagaSummary {
  id: string;
  type: string;
  status: SagaStatus;
  currentStep: string;
  startedAt: string;
  completedAt?: string;
  error?: string;
}
