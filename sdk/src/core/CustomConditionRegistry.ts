/**
 * CustomConditionRegistry - Registry for custom condition evaluators
 *
 * This registry manages custom condition evaluators that handle pack-defined
 * lifecycle conditions like 'DLD_OWNERSHIP_VERIFIED' or 'FORM_D_FILED'.
 *
 * Usage:
 * ```typescript
 * const registry = new CustomConditionRegistry();
 * registry.register(new DLDConditionEvaluator(dldModule));
 * registry.register(new SECConditionEvaluator(secModule));
 *
 * const result = await registry.evaluate('DLD_OWNERSHIP_VERIFIED', context);
 * ```
 */

import type {
  ICustomConditionEvaluator,
  ICustomConditionRegistry,
  CustomConditionContext,
  CustomConditionResult,
} from './interfaces.js';

/**
 * Default custom condition registry implementation
 */
export class CustomConditionRegistry implements ICustomConditionRegistry {
  private evaluators: Map<string, ICustomConditionEvaluator> = new Map();
  private conditionToEvaluator: Map<string, string> = new Map();

  /**
   * Register a custom condition evaluator
   */
  register(evaluator: ICustomConditionEvaluator): void {
    this.evaluators.set(evaluator.evaluatorId, evaluator);

    // Map each supported condition to this evaluator
    for (const condition of evaluator.supportedConditions) {
      if (this.conditionToEvaluator.has(condition)) {
        console.warn(
          `[CustomConditionRegistry] Condition '${condition}' already registered by ` +
          `'${this.conditionToEvaluator.get(condition)}', overwriting with '${evaluator.evaluatorId}'`
        );
      }
      this.conditionToEvaluator.set(condition, evaluator.evaluatorId);
    }

    console.log(
      `[CustomConditionRegistry] Registered evaluator '${evaluator.evaluatorId}' ` +
      `with conditions: ${evaluator.supportedConditions.join(', ')}`
    );
  }

  /**
   * Unregister an evaluator
   */
  unregister(evaluatorId: string): boolean {
    const evaluator = this.evaluators.get(evaluatorId);
    if (!evaluator) {
      return false;
    }

    // Remove condition mappings
    for (const condition of evaluator.supportedConditions) {
      if (this.conditionToEvaluator.get(condition) === evaluatorId) {
        this.conditionToEvaluator.delete(condition);
      }
    }

    this.evaluators.delete(evaluatorId);
    return true;
  }

  /**
   * Get the evaluator for a specific condition
   */
  getEvaluator(conditionName: string): ICustomConditionEvaluator | undefined {
    const evaluatorId = this.conditionToEvaluator.get(conditionName);
    if (!evaluatorId) {
      return undefined;
    }
    return this.evaluators.get(evaluatorId);
  }

  /**
   * Check if a condition has a registered evaluator
   */
  hasEvaluator(conditionName: string): boolean {
    return this.conditionToEvaluator.has(conditionName);
  }

  /**
   * Evaluate a custom condition using the appropriate evaluator
   */
  async evaluate(
    conditionName: string,
    context: CustomConditionContext
  ): Promise<CustomConditionResult> {
    const evaluator = this.getEvaluator(conditionName);

    if (!evaluator) {
      return {
        satisfied: false,
        reason: `No evaluator registered for custom condition '${conditionName}'`,
      };
    }

    if (!evaluator.supports(conditionName)) {
      return {
        satisfied: false,
        reason: `Evaluator '${evaluator.evaluatorId}' does not support condition '${conditionName}'`,
      };
    }

    try {
      return await evaluator.evaluate(conditionName, context);
    } catch (error) {
      return {
        satisfied: false,
        reason: `Error evaluating condition '${conditionName}': ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * List all registered evaluators
   */
  listEvaluators(): ICustomConditionEvaluator[] {
    return Array.from(this.evaluators.values());
  }

  /**
   * List all registered conditions
   */
  listConditions(): string[] {
    return Array.from(this.conditionToEvaluator.keys());
  }

  /**
   * Clear all registrations (for testing)
   */
  clear(): void {
    this.evaluators.clear();
    this.conditionToEvaluator.clear();
  }
}

// Singleton instance for global access
let defaultRegistry: CustomConditionRegistry | null = null;

/**
 * Get the default custom condition registry
 */
export function getCustomConditionRegistry(): CustomConditionRegistry {
  if (!defaultRegistry) {
    defaultRegistry = new CustomConditionRegistry();
  }
  return defaultRegistry;
}

/**
 * Set the default custom condition registry (for testing)
 */
export function setCustomConditionRegistry(registry: CustomConditionRegistry): void {
  defaultRegistry = registry;
}
