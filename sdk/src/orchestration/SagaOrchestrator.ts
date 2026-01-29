/**
 * SagaOrchestrator
 *
 * Orchestrates multi-step cross-pack workflows (sagas) with compensation.
 * Steps run sequentially with optional timeouts. On failure, compensations
 * execute in reverse order.
 */

import { v4 as uuidv4 } from 'uuid';
import type { ICrossPackEventBus, CrossPackEvent, CrossPackEventFilter } from './CrossPackEventBus.js';

// ============================================================================
// ENUMS & TYPES
// ============================================================================

export enum SagaExecutionStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  COMPENSATING = 'COMPENSATING',
  COMPENSATED = 'COMPENSATED',
  FAILED = 'FAILED',
}

export interface SagaStep {
  name: string;
  packSource: string;
  action: (event: CrossPackEvent) => Promise<void>;
  timeoutMs?: number;
}

export interface CompensationStep {
  name: string;
  packSource: string;
  action: () => Promise<void>;
}

export interface SagaDefinition {
  id: string;
  name: string;
  triggerFilter: CrossPackEventFilter;
  steps: SagaStep[];
  compensations: CompensationStep[];
  timeoutMs?: number;
}

export interface SagaExecution {
  id: string;
  sagaId: string;
  sagaName: string;
  status: SagaExecutionStatus;
  triggerEvent: CrossPackEvent;
  completedSteps: string[];
  currentStep?: string;
  error?: string;
  startedAt: string;
  completedAt?: string;
  correlationId?: string;
}

export interface SagaLogEntry {
  id: string;
  executionId: string;
  sagaId: string;
  action: string;
  stepName?: string;
  timestamp: string;
  data?: Record<string, unknown>;
  error?: string;
}

// ============================================================================
// SAGA ORCHESTRATOR
// ============================================================================

export class SagaOrchestrator {
  private eventBus: ICrossPackEventBus;
  private sagas: Map<string, SagaDefinition> = new Map();
  private executions: Map<string, SagaExecution> = new Map();
  private log: SagaLogEntry[] = [];
  private subscriptionIds: string[] = [];
  /** Tracks sagas currently inside a synchronous step action to prevent re-entrant triggers */
  private inStepExecution: Set<string> = new Set();

  constructor(eventBus: ICrossPackEventBus) {
    this.eventBus = eventBus;
  }

  registerSaga(definition: SagaDefinition): void {
    this.sagas.set(definition.id, definition);
  }

  start(): void {
    for (const saga of this.sagas.values()) {
      const subId = this.eventBus.subscribe(saga.triggerFilter, (event) => {
        void this.executeSaga(saga, event).catch(() => {
          // Errors are already logged internally via appendLog
        });
      });
      this.subscriptionIds.push(subId);
    }
  }

  stop(): void {
    for (const subId of this.subscriptionIds) {
      this.eventBus.unsubscribe(subId);
    }
    this.subscriptionIds = [];
  }

  getExecution(id: string): SagaExecution | undefined {
    return this.executions.get(id);
  }

  getExecutions(): SagaExecution[] {
    return Array.from(this.executions.values());
  }

  getExecutionsBySaga(sagaId: string): SagaExecution[] {
    return Array.from(this.executions.values()).filter(e => e.sagaId === sagaId);
  }

  getSagaLog(executionId?: string): SagaLogEntry[] {
    if (executionId) {
      return this.log.filter(l => l.executionId === executionId);
    }
    return [...this.log];
  }

  private async executeSaga(saga: SagaDefinition, triggerEvent: CrossPackEvent): Promise<void> {
    // Drop re-entrant triggers: if a step action synchronously publishes
    // an event matching this saga's trigger, skip it to prevent infinite recursion.
    if (this.inStepExecution.has(saga.id)) {
      return;
    }

    const execution: SagaExecution = {
      id: uuidv4(),
      sagaId: saga.id,
      sagaName: saga.name,
      status: SagaExecutionStatus.RUNNING,
      triggerEvent,
      completedSteps: [],
      startedAt: new Date().toISOString(),
      correlationId: triggerEvent.correlationId,
    };

    this.executions.set(execution.id, execution);

    this.appendLog(execution.id, saga.id, 'SAGA_STARTED', undefined, {
      triggerEventId: triggerEvent.id,
      triggerType: triggerEvent.type,
    });

    try {
      for (const step of saga.steps) {
        execution.currentStep = step.name;

        this.appendLog(execution.id, saga.id, 'STEP_STARTED', step.name);

        const timeoutMs = step.timeoutMs ?? saga.timeoutMs;

        // Guard only the synchronous portion of step.action() to block
        // re-entrant triggers (step publishes event matching own saga trigger)
        // without blocking separate publish() calls across await boundaries.
        this.inStepExecution.add(saga.id);
        let stepPromise: Promise<void>;
        if (timeoutMs) {
          stepPromise = Promise.race([
            step.action(triggerEvent),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error(`Step "${step.name}" timed out after ${timeoutMs}ms`)), timeoutMs)
            ),
          ]);
        } else {
          stepPromise = step.action(triggerEvent);
        }
        this.inStepExecution.delete(saga.id);
        await stepPromise;

        execution.completedSteps.push(step.name);
        this.appendLog(execution.id, saga.id, 'STEP_COMPLETED', step.name);
      }

      execution.status = SagaExecutionStatus.COMPLETED;
      execution.currentStep = undefined;
      execution.completedAt = new Date().toISOString();
      this.appendLog(execution.id, saga.id, 'SAGA_COMPLETED');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      execution.error = errorMessage;

      this.appendLog(execution.id, saga.id, 'STEP_FAILED', execution.currentStep, undefined, errorMessage);

      // Run compensations in reverse
      execution.status = SagaExecutionStatus.COMPENSATING;
      this.appendLog(execution.id, saga.id, 'COMPENSATION_STARTED');

      const compensationsToRun = [...saga.compensations].reverse();
      for (const comp of compensationsToRun) {
        try {
          this.appendLog(execution.id, saga.id, 'COMPENSATION_STEP_STARTED', comp.name);
          await comp.action();
          this.appendLog(execution.id, saga.id, 'COMPENSATION_STEP_COMPLETED', comp.name);
        } catch (compErr) {
          const compErrorMessage = compErr instanceof Error ? compErr.message : String(compErr);
          this.appendLog(execution.id, saga.id, 'COMPENSATION_STEP_FAILED', comp.name, undefined, compErrorMessage);
          // Continue running other compensations even if one fails
        }
      }

      execution.status = SagaExecutionStatus.FAILED;
      execution.currentStep = undefined;
      execution.completedAt = new Date().toISOString();
      this.appendLog(execution.id, saga.id, 'SAGA_FAILED', undefined, undefined, errorMessage);
    }
  }

  private appendLog(
    executionId: string,
    sagaId: string,
    action: string,
    stepName?: string,
    data?: Record<string, unknown>,
    error?: string
  ): void {
    this.log.push({
      id: uuidv4(),
      executionId,
      sagaId,
      action,
      stepName,
      timestamp: new Date().toISOString(),
      data,
      error,
    });
  }
}
