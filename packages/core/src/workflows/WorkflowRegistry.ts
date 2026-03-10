/**
 * WorkflowRegistry — Generic workflow registration and execution system
 *
 * Replaces hardcoded vertical-specific methods (tokenizeRealEstate, launchSecurityToken)
 * with a generic registry where vertical packs register their own workflows.
 *
 * @example
 * ```typescript
 * import { WorkflowRegistry } from '@tokenisation/core';
 * import { createRealEstateWorkflows } from '@tokenisation/pack-realestate';
 *
 * const registry = new WorkflowRegistry();
 * createRealEstateWorkflows().forEach(w => registry.register(w));
 *
 * const result = await registry.run('tokenize-real-estate', {
 *   titleDeedNumber: 'DLD-2024-12345',
 *   propertyAddress: '1802, Marina Towers, Dubai Marina',
 * });
 * ```
 */

import { z } from 'zod';
import type {
  WorkflowDefinition,
  WorkflowStepDefinition,
  WorkflowExecutionContext,
} from '../packs/PackManifest.js';

// Re-export the types so consumers can import from either location
export type { WorkflowDefinition, WorkflowStepDefinition, WorkflowExecutionContext };

// ============================================================================
// PROGRESS TRACKING (Generic — replaces GoldenPath's ProgressEvent)
// ============================================================================

/**
 * Progress callback for tracking workflow execution
 */
export interface WorkflowProgressCallback {
  (event: WorkflowProgressEvent): void;
}

/**
 * Progress event emitted during workflow execution
 */
export interface WorkflowProgressEvent {
  /** Workflow name */
  workflowName: string;
  /** Current step index (0-based) */
  stepIndex: number;
  /** Total number of steps */
  totalSteps: number;
  /** Step name */
  stepName: string;
  /** Current status */
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
  /** Percentage complete (0-100) */
  percentComplete: number;
  /** Optional message */
  message?: string;
  /** Data produced by the step */
  data?: unknown;
}

/**
 * Result of a workflow execution
 */
export interface WorkflowResult<T = unknown> {
  success: boolean;
  workflowName: string;
  data?: T;
  error?: WorkflowError;
  steps: WorkflowStepResult[];
  totalTimeMs: number;
}

export interface WorkflowStepResult {
  stepIndex: number;
  stepName: string;
  status: 'completed' | 'failed' | 'skipped';
  timeMs: number;
  data?: unknown;
  error?: string;
}

export interface WorkflowError {
  code: string;
  message: string;
  stepIndex: number;
  stepName: string;
  details?: Record<string, unknown>;
}

// ============================================================================
// WORKFLOW RUN OPTIONS
// ============================================================================

export interface WorkflowRunOptions {
  /** Progress callback */
  onProgress?: WorkflowProgressCallback;
  /** SDK instance to pass to the workflow */
  sdk?: unknown;
  /** Abort signal for cancellation */
  signal?: AbortSignal;
}

// ============================================================================
// WORKFLOW REGISTRY
// ============================================================================

/**
 * WorkflowRegistry — Register and execute named workflows.
 *
 * Vertical packs register their workflows here. The SDK exposes this
 * as `sdk.workflows.run(name, input)`.
 */
export class WorkflowRegistry {
  private workflows: Map<string, WorkflowDefinition> = new Map();

  /**
   * Register a workflow definition.
   *
   * @throws Error if a workflow with the same name already exists
   */
  register<TInput = unknown, TOutput = unknown>(
    workflow: WorkflowDefinition<TInput, TOutput>
  ): void {
    if (!workflow.name || typeof workflow.name !== 'string') {
      throw new Error('Workflow name must be a non-empty string');
    }

    if (this.workflows.has(workflow.name)) {
      throw new Error(
        `Workflow "${workflow.name}" is already registered. Use unregister() first to replace it.`
      );
    }

    if (typeof workflow.execute !== 'function') {
      throw new Error(`Workflow "${workflow.name}" must have an execute() function`);
    }

    this.workflows.set(workflow.name, workflow as WorkflowDefinition);
  }

  /**
   * Unregister a workflow by name.
   */
  unregister(name: string): boolean {
    return this.workflows.delete(name);
  }

  /**
   * Run a registered workflow by name.
   */
  async run<TOutput = unknown>(
    name: string,
    input: unknown,
    options: WorkflowRunOptions = {}
  ): Promise<WorkflowResult<TOutput>> {
    const workflow = this.workflows.get(name);
    if (!workflow) {
      const available = this.list().join(', ') || '(none)';
      throw new Error(
        `Workflow "${name}" is not registered. Available workflows: ${available}`
      );
    }

    const startTime = Date.now();
    const steps: WorkflowStepResult[] = [];

    // Validate input if schema is provided
    if (workflow.inputSchema) {
      const parseResult = workflow.inputSchema.safeParse(input);
      if (!parseResult.success) {
        const firstError = parseResult.error.errors[0];
        return {
          success: false,
          workflowName: name,
          error: {
            code: 'VALIDATION_ERROR',
            message: `Invalid input: ${firstError.message} at ${firstError.path.join('.')}`,
            stepIndex: -1,
            stepName: 'input-validation',
          },
          steps: [],
          totalTimeMs: Date.now() - startTime,
        };
      }
    }

    // Build execution context with progress tracking
    const context: WorkflowExecutionContext = {
      sdk: options.sdk,
      emitProgress: (stepIndex, status, message) => {
        const stepDef = workflow.steps[stepIndex];
        const stepName = stepDef?.name ?? `step-${stepIndex}`;

        const event: WorkflowProgressEvent = {
          workflowName: name,
          stepIndex,
          totalSteps: workflow.steps.length,
          stepName,
          status,
          percentComplete: workflow.steps.length > 0
            ? Math.round(((stepIndex + (status === 'completed' ? 1 : 0.5)) / workflow.steps.length) * 100)
            : 0,
          message,
        };

        options.onProgress?.(event);

        // Track step results
        if (status === 'completed' || status === 'failed' || status === 'skipped') {
          const existing = steps.find(s => s.stepIndex === stepIndex);
          if (!existing) {
            steps.push({
              stepIndex,
              stepName,
              status,
              timeMs: 0,
              error: status === 'failed' ? message : undefined,
            });
          }
        }
      },
    };

    try {
      // Check for cancellation
      if (options.signal?.aborted) {
        return {
          success: false,
          workflowName: name,
          error: {
            code: 'CANCELLED',
            message: 'Workflow was cancelled before execution',
            stepIndex: -1,
            stepName: 'pre-execution',
          },
          steps,
          totalTimeMs: Date.now() - startTime,
        };
      }

      const result = await workflow.execute(input, context);

      return {
        success: true,
        workflowName: name,
        data: result as TOutput,
        steps,
        totalTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      const lastStep = steps[steps.length - 1];
      return {
        success: false,
        workflowName: name,
        error: {
          code: (error as any).code || 'WORKFLOW_ERROR',
          message: (error as Error).message,
          stepIndex: lastStep?.stepIndex ?? -1,
          stepName: lastStep?.stepName ?? 'unknown',
        },
        steps,
        totalTimeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Get a workflow definition by name.
   */
  get(name: string): WorkflowDefinition | undefined {
    return this.workflows.get(name);
  }

  /**
   * List all registered workflow names.
   */
  list(): string[] {
    return Array.from(this.workflows.keys());
  }

  /**
   * List all registered workflows with metadata.
   */
  listDetailed(): Array<{ name: string; description: string; steps: WorkflowStepDefinition[] }> {
    return Array.from(this.workflows.values()).map(w => ({
      name: w.name,
      description: w.description,
      steps: w.steps,
    }));
  }

  /**
   * Check if a workflow is registered.
   */
  has(name: string): boolean {
    return this.workflows.has(name);
  }
}
