/**
 * AssetPackLifecycleManager - Wires AssetPack rules to the LifecycleEngine
 *
 * This manager bridges the gap between AssetPack lifecycle rule configurations
 * and the core LifecycleEngine. It:
 *
 * 1. Reads lifecycle rules from an AssetPack
 * 2. Registers transition guards for each rule
 * 3. Evaluates custom conditions using the CustomConditionRegistry
 * 4. Validates required documents and approvals
 *
 * Usage:
 * ```typescript
 * const manager = new AssetPackLifecycleManager({
 *   lifecycleEngine,
 *   customConditionRegistry,
 * });
 *
 * // Apply Dubai Real Estate pack rules
 * manager.applyPack(dubaiRealEstatePack);
 *
 * // Now transitions will be validated against pack rules
 * await lifecycleEngine.transition(request);
 * ```
 */

import type { LifecycleState, RightModel, Result } from '../core/types.js';
import type { LifecycleEngine } from '../core/LifecycleEngine.js';
import type { StateTransitionRequest, ICustomConditionRegistry, CustomConditionContext } from '../core/interfaces.js';
import type { AssetPack, LifecycleRule, LifecycleCondition } from './AssetPackRegistry.js';
import { CustomConditionRegistry, getCustomConditionRegistry } from '../core/CustomConditionRegistry.js';

/**
 * Document store interface - for checking required documents
 */
export interface IDocumentStore {
  hasDocuments(assetId: string, documentTypes: string[]): Promise<boolean>;
  getDocuments(assetId: string): Promise<{ type: string; uri: string; verified: boolean }[]>;
}

/**
 * Approval store interface - for checking required approvals
 */
export interface IApprovalStore {
  hasApprovals(assetId: string, approvals: { role: string; count: number }[]): Promise<boolean>;
  getApprovals(assetId: string): Promise<{ role: string; approvedBy: string; approvedAt: string }[]>;
}

/**
 * Configuration for AssetPackLifecycleManager
 */
export interface AssetPackLifecycleManagerConfig {
  /** LifecycleEngine instance */
  lifecycleEngine: LifecycleEngine;
  /** Custom condition registry (uses default if not provided) */
  customConditionRegistry?: ICustomConditionRegistry;
  /** Document store for checking required documents */
  documentStore?: IDocumentStore;
  /** Approval store for checking required approvals */
  approvalStore?: IApprovalStore;
}

/**
 * Guard evaluation result
 */
interface GuardEvaluationResult {
  satisfied: boolean;
  unsatisfiedConditions: string[];
  evidence: Record<string, unknown>;
  warnings: string[];
}

/**
 * AssetPackLifecycleManager
 *
 * Manages the application of AssetPack lifecycle rules to the LifecycleEngine.
 */
export class AssetPackLifecycleManager {
  private lifecycleEngine: LifecycleEngine;
  private customConditionRegistry: ICustomConditionRegistry;
  private documentStore?: IDocumentStore;
  private approvalStore?: IApprovalStore;
  private appliedPacks: Map<string, AssetPack> = new Map();

  constructor(config: AssetPackLifecycleManagerConfig) {
    this.lifecycleEngine = config.lifecycleEngine;
    this.customConditionRegistry = config.customConditionRegistry || getCustomConditionRegistry();
    this.documentStore = config.documentStore;
    this.approvalStore = config.approvalStore;
  }

  /**
   * Apply an AssetPack's lifecycle rules to the engine
   */
  applyPack(pack: AssetPack): void {
    if (this.appliedPacks.has(pack.id)) {
      console.warn(`[AssetPackLifecycleManager] Pack '${pack.id}' already applied`);
      return;
    }

    console.log(`[AssetPackLifecycleManager] Applying pack '${pack.id}' with ${pack.lifecycleRules.length} rules`);

    for (const rule of pack.lifecycleRules) {
      this.registerRuleAsGuard(pack.id, rule);
    }

    this.appliedPacks.set(pack.id, pack);
  }

  /**
   * Remove an applied pack
   */
  removePack(packId: string): boolean {
    // Note: The LifecycleEngine doesn't support removing guards,
    // so this just removes from our tracking
    return this.appliedPacks.delete(packId);
  }

  /**
   * Get list of applied packs
   */
  getAppliedPacks(): string[] {
    return Array.from(this.appliedPacks.keys());
  }

  /**
   * Register a lifecycle rule as a transition guard
   */
  private registerRuleAsGuard(packId: string, rule: LifecycleRule): void {
    const fromStates: LifecycleState[] = rule.from === '*'
      ? this.getAllNonTerminalStates()
      : [rule.from as LifecycleState];

    for (const fromState of fromStates) {
      this.lifecycleEngine.registerGuard(
        fromState,
        rule.to,
        this.createGuardFromRule(packId, rule)
      );
    }
  }

  /**
   * Create a transition guard from a lifecycle rule
   */
  private createGuardFromRule(
    packId: string,
    rule: LifecycleRule
  ): (asset: RightModel, request: StateTransitionRequest) => Promise<Result<void, string>> {
    return async (asset: RightModel, request: StateTransitionRequest): Promise<Result<void, string>> => {
      const result = await this.evaluateRuleConditions(packId, rule, asset, request);

      if (!result.satisfied) {
        return {
          success: false,
          error: `Lifecycle rule conditions not met: ${result.unsatisfiedConditions.join('; ')}`,
        };
      }

      // Log warnings if any
      if (result.warnings.length > 0) {
        console.warn(
          `[AssetPackLifecycleManager] Transition ${request.fromState} -> ${request.toState} warnings:`,
          result.warnings
        );
      }

      return { success: true, data: undefined };
    };
  }

  /**
   * Evaluate all conditions for a lifecycle rule
   */
  private async evaluateRuleConditions(
    packId: string,
    rule: LifecycleRule,
    asset: RightModel,
    request: StateTransitionRequest
  ): Promise<GuardEvaluationResult> {
    const result: GuardEvaluationResult = {
      satisfied: true,
      unsatisfiedConditions: [],
      evidence: {},
      warnings: [],
    };

    for (const condition of rule.conditions) {
      const conditionResult = await this.evaluateCondition(condition, asset, request);

      if (!conditionResult.satisfied) {
        result.satisfied = false;
        result.unsatisfiedConditions.push(conditionResult.reason || `Condition ${condition.type} not met`);
      }

      // Merge evidence
      Object.assign(result.evidence, conditionResult.evidence || {});

      // Collect warnings
      if (conditionResult.warnings) {
        result.warnings.push(...conditionResult.warnings);
      }
    }

    return result;
  }

  /**
   * Evaluate a single lifecycle condition
   */
  private async evaluateCondition(
    condition: LifecycleCondition,
    asset: RightModel,
    request: StateTransitionRequest
  ): Promise<{ satisfied: boolean; reason?: string; evidence?: Record<string, unknown>; warnings?: string[] }> {
    switch (condition.type) {
      case 'CUSTOM':
        return this.evaluateCustomCondition(condition, asset, request);
      case 'DOCUMENT':
        return this.evaluateDocumentCondition(condition, asset);
      case 'APPROVAL':
        return this.evaluateApprovalCondition(condition, asset);
      case 'TIME':
        return this.evaluateTimeCondition(condition, asset);
      case 'BALANCE':
        return this.evaluateBalanceCondition(condition, asset);
      case 'COMPLIANCE':
        // Compliance is handled by the ComplianceEngine separately
        return { satisfied: true };
      default:
        return { satisfied: false, reason: `Unknown condition type: ${condition.type}` };
    }
  }

  /**
   * Evaluate a custom condition using the registry
   */
  private async evaluateCustomCondition(
    condition: LifecycleCondition,
    asset: RightModel,
    request: StateTransitionRequest
  ): Promise<{ satisfied: boolean; reason?: string; evidence?: Record<string, unknown>; warnings?: string[] }> {
    if (!condition.customCondition) {
      return { satisfied: false, reason: 'Custom condition name not specified' };
    }

    const context: CustomConditionContext = {
      assetId: asset.id,
      asset,
      actorId: request.actorId,
      targetState: request.toState,
      metadata: request.metadata,
    };

    const result = await this.customConditionRegistry.evaluate(condition.customCondition, context);

    return {
      satisfied: result.satisfied,
      reason: result.reason,
      evidence: result.evidence,
      warnings: result.warnings,
    };
  }

  /**
   * Evaluate a document condition
   */
  private async evaluateDocumentCondition(
    condition: LifecycleCondition,
    asset: RightModel
  ): Promise<{ satisfied: boolean; reason?: string; evidence?: Record<string, unknown> }> {
    if (!condition.documents || condition.documents.length === 0) {
      return { satisfied: true };
    }

    if (!this.documentStore) {
      // No document store configured - assume documents are verified externally
      console.warn('[AssetPackLifecycleManager] No document store configured, skipping document check');
      return { satisfied: true, evidence: { documentCheckSkipped: true } };
    }

    const hasAllDocs = await this.documentStore.hasDocuments(asset.id, condition.documents);

    if (!hasAllDocs) {
      const existingDocs = await this.documentStore.getDocuments(asset.id);
      const existingTypes = existingDocs.map(d => d.type);
      const missing = condition.documents.filter(d => !existingTypes.includes(d));

      return {
        satisfied: false,
        reason: `Missing required documents: ${missing.join(', ')}`,
        evidence: { requiredDocuments: condition.documents, existingDocuments: existingTypes },
      };
    }

    return { satisfied: true, evidence: { documentsVerified: condition.documents } };
  }

  /**
   * Evaluate an approval condition
   */
  private async evaluateApprovalCondition(
    condition: LifecycleCondition,
    asset: RightModel
  ): Promise<{ satisfied: boolean; reason?: string; evidence?: Record<string, unknown> }> {
    if (!condition.approvals || condition.approvals.length === 0) {
      return { satisfied: true };
    }

    if (!this.approvalStore) {
      // No approval store configured - assume approvals are verified externally
      console.warn('[AssetPackLifecycleManager] No approval store configured, skipping approval check');
      return { satisfied: true, evidence: { approvalCheckSkipped: true } };
    }

    const hasAllApprovals = await this.approvalStore.hasApprovals(asset.id, condition.approvals);

    if (!hasAllApprovals) {
      const existingApprovals = await this.approvalStore.getApprovals(asset.id);

      return {
        satisfied: false,
        reason: `Missing required approvals from roles: ${condition.approvals.map(a => a.role).join(', ')}`,
        evidence: { requiredApprovals: condition.approvals, existingApprovals },
      };
    }

    return { satisfied: true, evidence: { approvalsVerified: condition.approvals } };
  }

  /**
   * Evaluate a time condition
   */
  private async evaluateTimeCondition(
    condition: LifecycleCondition,
    asset: RightModel
  ): Promise<{ satisfied: boolean; reason?: string }> {
    if (!condition.timeCondition) {
      return { satisfied: true };
    }

    // Handle special time conditions
    if (condition.timeCondition === 'MATURITY_DATE') {
      const maturityDate = asset.metadata?.maturityDate as string | undefined;
      if (!maturityDate) {
        return { satisfied: false, reason: 'Maturity date not set in asset metadata' };
      }
      const now = new Date();
      const maturity = new Date(maturityDate);
      if (now < maturity) {
        return { satisfied: false, reason: `Maturity date not reached (${maturityDate})` };
      }
      return { satisfied: true };
    }

    // Handle ISO duration format (P1Y, P30D, etc.)
    // For now, just return satisfied - full implementation would parse duration
    console.warn(`[AssetPackLifecycleManager] Time condition '${condition.timeCondition}' not fully implemented`);
    return { satisfied: true };
  }

  /**
   * Evaluate a balance condition
   */
  private async evaluateBalanceCondition(
    condition: LifecycleCondition,
    asset: RightModel
  ): Promise<{ satisfied: boolean; reason?: string }> {
    if (!condition.balanceCondition) {
      return { satisfied: true };
    }

    // Get current balance from metadata or external source
    const currentBalance = BigInt(asset.metadata?.currentBalance as string || '0');
    const requiredValue = BigInt(condition.balanceCondition.value);

    let satisfied = false;
    switch (condition.balanceCondition.operator) {
      case 'GT':
        satisfied = currentBalance > requiredValue;
        break;
      case 'GTE':
        satisfied = currentBalance >= requiredValue;
        break;
      case 'LT':
        satisfied = currentBalance < requiredValue;
        break;
      case 'LTE':
        satisfied = currentBalance <= requiredValue;
        break;
      case 'EQ':
        satisfied = currentBalance === requiredValue;
        break;
    }

    if (!satisfied) {
      return {
        satisfied: false,
        reason: `Balance condition not met: ${currentBalance} ${condition.balanceCondition.operator} ${requiredValue}`,
      };
    }

    return { satisfied: true };
  }

  /**
   * Get all non-terminal lifecycle states
   */
  private getAllNonTerminalStates(): LifecycleState[] {
    // Import dynamically to avoid circular dependency
    const { LifecycleState, VALID_TRANSITIONS } = require('../core/types.js');

    return Object.entries(VALID_TRANSITIONS)
      .filter(([_, transitions]) => (transitions as LifecycleState[]).length > 0)
      .map(([state]) => state as LifecycleState);
  }

  /**
   * Manually evaluate a rule for testing/debugging
   */
  async evaluateRule(
    packId: string,
    ruleTo: LifecycleState,
    asset: RightModel,
    actorId: string,
    metadata?: Record<string, unknown>
  ): Promise<GuardEvaluationResult> {
    const pack = this.appliedPacks.get(packId);
    if (!pack) {
      return {
        satisfied: false,
        unsatisfiedConditions: [`Pack '${packId}' not applied`],
        evidence: {},
        warnings: [],
      };
    }

    const rule = pack.lifecycleRules.find(r =>
      (r.from === '*' || r.from === asset.state) && r.to === ruleTo
    );

    if (!rule) {
      return {
        satisfied: false,
        unsatisfiedConditions: [`No rule found for transition ${asset.state} -> ${ruleTo}`],
        evidence: {},
        warnings: [],
      };
    }

    return this.evaluateRuleConditions(packId, rule, asset, {
      assetId: asset.id,
      fromState: asset.state,
      toState: ruleTo,
      actorId,
      metadata,
    });
  }
}
