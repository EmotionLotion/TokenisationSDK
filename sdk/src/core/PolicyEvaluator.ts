/**
 * PolicyEvaluator - Connects the lifecycle engine to plugins
 *
 * Evaluates policies by delegating to registered compliance and jurisdiction plugins.
 * Acts as the bridge between the state machine and external rule systems.
 */

import type {
  RightModel,
  TransferContext,
  Result,
  LifecycleState,
} from './types.js';
import { ok, err } from './types.js';
import type {
  ICompliancePlugin,
  IJurisdictionPlugin,
  IPluginRegistry,
  ComplianceCheckResult,
  JurisdictionCheckResult,
  StateTransitionRequest,
} from './interfaces.js';

/**
 * Policy evaluation result
 */
export interface PolicyEvaluationResult {
  allowed: boolean;
  complianceResult?: ComplianceCheckResult;
  jurisdictionResult?: JurisdictionCheckResult;
  errors: string[];
  warnings: string[];
}

/**
 * Policy context for evaluation
 */
export interface PolicyContext {
  asset: RightModel;
  request?: StateTransitionRequest;
  transferContext?: TransferContext;
  additionalData?: Record<string, unknown>;
}

/**
 * PolicyEvaluator class
 *
 * Coordinates policy evaluation across multiple plugins.
 */
export class PolicyEvaluator {
  private registry: IPluginRegistry | null = null;

  /**
   * Set the plugin registry
   */
  setRegistry(registry: IPluginRegistry): void {
    this.registry = registry;
  }

  /**
   * Evaluate all policies for a state transition
   */
  async evaluateTransition(
    context: PolicyContext
  ): Promise<PolicyEvaluationResult> {
    const result: PolicyEvaluationResult = {
      allowed: true,
      errors: [],
      warnings: [],
    };

    // If no registry is set, allow all transitions (MVP mode)
    if (!this.registry) {
      return result;
    }

    // Get compliance plugins
    const compliancePlugins = this.registry.getAll<ICompliancePlugin>('compliance');
    const jurisdictionPlugins = this.registry.getAll<IJurisdictionPlugin>('jurisdiction');

    // Evaluate jurisdiction rules
    for (const plugin of jurisdictionPlugins) {
      try {
        const jurisdictionResult = await plugin.canCreateAsset(context.asset);
        if (!jurisdictionResult.allowed) {
          result.allowed = false;
          result.jurisdictionResult = jurisdictionResult;
          result.errors.push(
            jurisdictionResult.reason || 'Jurisdiction check failed'
          );
        }
      } catch (error) {
        result.warnings.push(
          `Jurisdiction plugin ${plugin.pluginId} error: ${error}`
        );
      }
    }

    // Evaluate compliance rules if transfer context provided
    if (context.transferContext) {
      for (const plugin of compliancePlugins) {
        try {
          const fromStatus = await plugin.getPartyStatus(
            context.transferContext.from
          );
          const toStatus = await plugin.getPartyStatus(
            context.transferContext.to
          );

          if (fromStatus && toStatus) {
            const complianceResult = await plugin.evaluateTransfer(
              context.transferContext,
              fromStatus,
              toStatus
            );

            if (!complianceResult.compliant) {
              result.allowed = false;
              result.complianceResult = complianceResult;
              result.errors.push(
                ...complianceResult.violations.map((v) => v.message)
              );
            }
            result.warnings.push(...complianceResult.warnings);
          }
        } catch (error) {
          result.warnings.push(
            `Compliance plugin ${plugin.pluginId} error: ${error}`
          );
        }
      }
    }

    return result;
  }

  /**
   * Evaluate if an asset can be created
   */
  async canCreateAsset(asset: RightModel): Promise<Result<void, string[]>> {
    const result = await this.evaluateTransition({ asset });

    if (!result.allowed) {
      return err(result.errors);
    }

    return ok(undefined);
  }

  /**
   * Evaluate if a transfer is allowed
   */
  async canTransfer(
    asset: RightModel,
    transferContext: TransferContext
  ): Promise<Result<void, string[]>> {
    const result = await this.evaluateTransition({
      asset,
      transferContext,
    });

    if (!result.allowed) {
      return err(result.errors);
    }

    return ok(undefined);
  }

  /**
   * Evaluate state-specific rules
   */
  async evaluateStateRules(
    asset: RightModel,
    targetState: LifecycleState
  ): Promise<Result<void, string[]>> {
    const errors: string[] = [];

    // Check validity period for activation
    if (targetState === 'ACTIVE') {
      const validity = asset.validityPeriod;

      if (validity.startTime) {
        const startDate = new Date(validity.startTime);
        if (startDate > new Date()) {
          errors.push('Asset validity period has not started');
        }
      }

      if (validity.endTime) {
        const endDate = new Date(validity.endTime);
        if (endDate < new Date()) {
          errors.push('Asset validity period has expired');
        }
      }
    }

    // Additional state-specific rules can be added here

    if (errors.length > 0) {
      return err(errors);
    }

    return ok(undefined);
  }
}
