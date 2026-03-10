/**
 * ComplianceService - The "Brain" of RWA permissions
 *
 * Handles KYC, investor accreditation, transfer restrictions, and policy evaluation.
 * This service coordinates between the compliance plugin and the lifecycle engine.
 *
 * Reference: ERC-3643 T-REX Compliance
 */

import { z } from 'zod';
import type {
  ICompliancePlugin,
  ComplianceViolation,
  IPluginRegistry,
  RightModel,
  TransferContext,
} from '@tokenisation/core';
import { ValidationError } from '@tokenisation/core';
import type { Party } from '@tokenisation/core';
import { isPartyFrozen, hasValidKyc, isAccredited } from '@tokenisation/core';
import type { ChainService } from '@tokenisation/core';

// ============================================================================
// RULESET SCHEMAS
// ============================================================================

/**
 * Rule condition types
 */
export enum RuleConditionType {
  /** Require whitelist membership */
  WHITELIST_REQUIRED = 'WHITELIST_REQUIRED',

  /** Require KYC verification */
  KYC_REQUIRED = 'KYC_REQUIRED',

  /** Require accredited investor status */
  ACCREDITATION_REQUIRED = 'ACCREDITATION_REQUIRED',

  /** Maximum number of investors */
  MAX_INVESTOR_COUNT = 'MAX_INVESTOR_COUNT',

  /** Minimum holding amount */
  MIN_HOLDING_AMOUNT = 'MIN_HOLDING_AMOUNT',

  /** Maximum holding amount */
  MAX_HOLDING_AMOUNT = 'MAX_HOLDING_AMOUNT',

  /** Lockup period check */
  LOCKUP_PERIOD = 'LOCKUP_PERIOD',

  /** Jurisdiction whitelist */
  JURISDICTION_WHITELIST = 'JURISDICTION_WHITELIST',

  /** Jurisdiction blacklist */
  JURISDICTION_BLACKLIST = 'JURISDICTION_BLACKLIST',

  /** Time-based restriction */
  TIME_RESTRICTION = 'TIME_RESTRICTION',

  /** Price cap for anti-scalping (limits resale price to % of mint price) */
  PRICE_CAP = 'PRICE_CAP',

  /** Maximum resale price (absolute value) */
  MAX_RESALE_PRICE = 'MAX_RESALE_PRICE',

  /** Lifecycle state restriction (blocks transfers from certain states) */
  LIFECYCLE_STATE_RESTRICTION = 'LIFECYCLE_STATE_RESTRICTION',

  /** Custom rule */
  CUSTOM = 'CUSTOM',
}

/**
 * Ruleset condition schema
 */
export const RuleConditionSchema = z.object({
  /** Condition type */
  type: z.nativeEnum(RuleConditionType),

  /** Condition is enabled */
  enabled: z.boolean().default(true),

  /** Condition parameters */
  params: z.record(z.unknown()).default({}),

  /** Error message when condition fails */
  errorMessage: z.string().optional(),

  /** Severity of violation */
  severity: z.enum(['ERROR', 'WARNING']).default('ERROR'),
});

export type RuleCondition = z.infer<typeof RuleConditionSchema>;

/**
 * Full ruleset schema
 */
export const RulesetSchema = z.object({
  /** Ruleset identifier */
  id: z.string(),

  /** Ruleset name */
  name: z.string(),

  /** Description */
  description: z.string().optional(),

  /** Asset types this ruleset applies to */
  appliesToAssetTypes: z.array(z.string()).optional(),

  /** Jurisdictions this ruleset applies to */
  appliesToJurisdictions: z.array(z.string().length(2)).optional(),

  /** List of conditions */
  conditions: z.array(RuleConditionSchema),

  /** Ruleset priority (higher = evaluated first) */
  priority: z.number().default(0),

  /** Whether ruleset is active */
  active: z.boolean().default(true),

  /** Metadata */
  metadata: z.record(z.unknown()).default({}),
});

export type Ruleset = z.infer<typeof RulesetSchema>;

// Input validation schemas
const NonEmptyStringSchema = z.string().min(1, 'Value cannot be empty');
const AssetIdSchema = NonEmptyStringSchema.describe('Asset ID');
const PartyIdSchema = NonEmptyStringSchema.describe('Party ID');
const InvestorCountSchema = z.number().int().min(0, 'Investor count must be non-negative');

// ============================================================================
// COMPLIANCE SERVICE
// ============================================================================

/**
 * Transfer evaluation context
 */
export interface TransferEvaluationContext {
  from: Party;
  to: Party;
  asset: RightModel;
  amount: string;
  metadata?: Record<string, unknown>;
}

/**
 * Compliance evaluation result
 */
export interface ComplianceEvaluationResult {
  allowed: boolean;
  violations: ComplianceViolation[];
  warnings: string[];
  evaluatedRulesets: string[];
  metadata: Record<string, unknown>;
}

/**
 * ComplianceService class
 *
 * Central service for all compliance-related operations.
 */
export class ComplianceService {
  private rulesets: Map<string, Ruleset> = new Map();
  private whitelists: Map<string, Set<string>> = new Map(); // assetId -> Set<partyId>
  private registry: IPluginRegistry | null = null;
  private chainService: ChainService | null = null;
  private investorCounts: Map<string, number> = new Map(); // assetId -> count

  /**
   * Set the plugin registry
   */
  setRegistry(registry: IPluginRegistry): void {
    this.registry = registry;
  }

  /**
   * Set the chain service
   */
  setChainService(chainService: ChainService): void {
    this.chainService = chainService;
  }

  /**
   * Register a ruleset
   */
  registerRuleset(ruleset: Ruleset): void {
    const validated = RulesetSchema.parse(ruleset);
    this.rulesets.set(validated.id, validated);
  }

  /**
   * Remove a ruleset
   */
  removeRuleset(rulesetId: string): boolean {
    return this.rulesets.delete(rulesetId);
  }

  /**
   * Get all rulesets
   */
  getRulesets(): Ruleset[] {
    return Array.from(this.rulesets.values()).sort(
      (a, b) => b.priority - a.priority
    );
  }

  /**
   * Get rulesets applicable to an asset
   */
  getApplicableRulesets(asset: RightModel): Ruleset[] {
    return this.getRulesets().filter((ruleset) => {
      if (!ruleset.active) return false;

      // Check asset type
      if (
        ruleset.appliesToAssetTypes &&
        !ruleset.appliesToAssetTypes.includes(asset.rightType)
      ) {
        return false;
      }

      // Check jurisdiction
      if (
        ruleset.appliesToJurisdictions &&
        !ruleset.appliesToJurisdictions.includes(asset.jurisdiction.countryCode)
      ) {
        return false;
      }

      return true;
    });
  }

  /**
   * Evaluate a transfer for compliance
   */
  async evaluateTransfer(
    context: TransferEvaluationContext
  ): Promise<ComplianceEvaluationResult> {
    const violations: ComplianceViolation[] = [];
    const warnings: string[] = [];
    const evaluatedRulesets: string[] = [];
    const metadata: Record<string, unknown> = {};

    // Check basic party status
    const partyChecks = this.checkPartyStatus(context.from, context.to);
    violations.push(...partyChecks.violations);
    warnings.push(...partyChecks.warnings);

    // Get applicable rulesets
    const rulesets = this.getApplicableRulesets(context.asset);

    // Evaluate each ruleset
    for (const ruleset of rulesets) {
      evaluatedRulesets.push(ruleset.id);
      const result = await this.evaluateRuleset(ruleset, context);
      violations.push(...result.violations);
      warnings.push(...result.warnings);
    }

    // Check with compliance plugins if available
    if (this.registry) {
      const plugins = this.registry.getAll<ICompliancePlugin>('compliance');
      for (const plugin of plugins) {
        try {
          const fromStatus = await plugin.getPartyStatus(context.from.id);
          const toStatus = await plugin.getPartyStatus(context.to.id);

          if (fromStatus && toStatus) {
            const transferContext: TransferContext = {
              from: context.from.id,
              to: context.to.id,
              amount: context.amount,
              assetId: context.asset.id,
              timestamp: new Date().toISOString(),
              metadata: context.metadata,
            };

            const pluginResult = await plugin.evaluateTransfer(
              transferContext,
              fromStatus,
              toStatus
            );

            violations.push(...pluginResult.violations);
            warnings.push(...pluginResult.warnings);
          }
        } catch (error) {
          warnings.push(`Plugin error: ${error}`);
        }
      }
    }

    // Check with on-chain compliance if available
    if (this.chainService) {
      const onChainResult = await this.checkOnChainCompliance(context);
      violations.push(...onChainResult.violations);
      warnings.push(...onChainResult.warnings);
    }

    return {
      allowed: violations.filter((v) => v.severity === 'ERROR').length === 0,
      violations,
      warnings,
      evaluatedRulesets,
      metadata,
    };
  }

  /**
   * Check party status for basic violations
   */
  private checkPartyStatus(
    from: Party,
    to: Party
  ): { violations: ComplianceViolation[]; warnings: string[] } {
    const violations: ComplianceViolation[] = [];
    const warnings: string[] = [];

    // Check if sender is frozen
    if (isPartyFrozen(from)) {
      violations.push({
        ruleId: 'FROZEN_SENDER',
        ruleName: 'Frozen Account',
        severity: 'ERROR',
        message: `Sender ${from.name} is frozen: ${from.freezeReason || 'No reason provided'}`,
      });
    }

    // Check if receiver is frozen
    if (isPartyFrozen(to)) {
      violations.push({
        ruleId: 'FROZEN_RECEIVER',
        ruleName: 'Frozen Account',
        severity: 'ERROR',
        message: `Receiver ${to.name} is frozen: ${to.freezeReason || 'No reason provided'}`,
      });
    }

    return { violations, warnings };
  }

  /**
   * Evaluate a single ruleset
   */
  private async evaluateRuleset(
    ruleset: Ruleset,
    context: TransferEvaluationContext
  ): Promise<{ violations: ComplianceViolation[]; warnings: string[] }> {
    const violations: ComplianceViolation[] = [];
    const warnings: string[] = [];

    for (const condition of ruleset.conditions) {
      if (!condition.enabled) continue;

      const result = await this.evaluateCondition(condition, context);

      if (!result.passed) {
        const violation: ComplianceViolation = {
          ruleId: `${ruleset.id}:${condition.type}`,
          ruleName: condition.type,
          severity: condition.severity,
          message:
            condition.errorMessage ||
            result.message ||
            `Condition ${condition.type} failed`,
          ...(result.metadata && { metadata: result.metadata }),
        };

        if (condition.severity === 'ERROR') {
          violations.push(violation);
        } else {
          warnings.push(violation.message);
        }
      }
    }

    return { violations, warnings };
  }

  /**
   * Evaluate a single condition
   */
  private async evaluateCondition(
    condition: RuleCondition,
    context: TransferEvaluationContext
  ): Promise<{ passed: boolean; message?: string; metadata?: Record<string, unknown> }> {
    switch (condition.type) {
      case RuleConditionType.WHITELIST_REQUIRED:
        return this.checkWhitelist(context);

      case RuleConditionType.KYC_REQUIRED:
        return this.checkKyc(context, condition.params);

      case RuleConditionType.ACCREDITATION_REQUIRED:
        return this.checkAccreditation(context);

      case RuleConditionType.MAX_INVESTOR_COUNT:
        return this.checkMaxInvestorCount(context, condition.params);

      case RuleConditionType.MIN_HOLDING_AMOUNT:
        return this.checkMinHolding(context, condition.params);

      case RuleConditionType.MAX_HOLDING_AMOUNT:
        return this.checkMaxHolding(context, condition.params);

      case RuleConditionType.LOCKUP_PERIOD:
        return this.checkLockupPeriod(context);

      case RuleConditionType.JURISDICTION_WHITELIST:
        return this.checkJurisdictionWhitelist(context, condition.params);

      case RuleConditionType.JURISDICTION_BLACKLIST:
        return this.checkJurisdictionBlacklist(context, condition.params);

      case RuleConditionType.TIME_RESTRICTION:
        return this.checkTimeRestriction(condition.params);

      default:
        return { passed: true };
    }
  }

  /**
   * Check whitelist condition
   */
  private checkWhitelist(
    context: TransferEvaluationContext
  ): { passed: boolean; message?: string } {
    const whitelist = this.whitelists.get(context.asset.id);

    if (!whitelist) {
      // No whitelist = open to all
      return { passed: true };
    }

    if (!whitelist.has(context.to.id)) {
      return {
        passed: false,
        message: `Receiver ${context.to.name} is not on the whitelist`,
      };
    }

    return { passed: true };
  }

  /**
   * Check KYC condition
   */
  private checkKyc(
    context: TransferEvaluationContext,
    _params: Record<string, unknown>
  ): { passed: boolean; message?: string } {
    // Note: minLevel param can be used in future for verification level checks
    // const minLevel = _params['minLevel'] as string | undefined;

    // Check sender KYC
    if (!hasValidKyc(context.from)) {
      return {
        passed: false,
        message: `Sender ${context.from.name} does not have valid KYC`,
      };
    }

    // Check receiver KYC
    if (!hasValidKyc(context.to)) {
      return {
        passed: false,
        message: `Receiver ${context.to.name} does not have valid KYC`,
      };
    }

    return { passed: true };
  }

  /**
   * Check accreditation condition
   */
  private checkAccreditation(
    context: TransferEvaluationContext
  ): { passed: boolean; message?: string } {
    if (!isAccredited(context.from)) {
      return {
        passed: false,
        message: `Sender ${context.from.name} is not an accredited investor`,
      };
    }

    if (!isAccredited(context.to)) {
      return {
        passed: false,
        message: `Receiver ${context.to.name} is not an accredited investor`,
      };
    }

    return { passed: true };
  }

  /**
   * Check max investor count
   */
  private checkMaxInvestorCount(
    context: TransferEvaluationContext,
    params: Record<string, unknown>
  ): { passed: boolean; message?: string; metadata?: Record<string, unknown> } {
    const maxCount = params['maxCount'] as number;
    const currentCount = this.investorCounts.get(context.asset.id) || 0;

    // If receiver is already a holder, no new investor
    // Check via asset metadata if available, otherwise assume new investor
    const assetWithHolders = context.asset as { currentHolders?: Array<{ partyId: string }> };
    const isNewInvestor =
      !assetWithHolders.currentHolders?.some((h: { partyId: string }) => h.partyId === context.to.id);

    if (isNewInvestor && currentCount >= maxCount) {
      return {
        passed: false,
        message: `Maximum investor count (${maxCount}) reached`,
        metadata: { currentCount, maxCount },
      };
    }

    return { passed: true };
  }

  /**
   * Check minimum holding amount
   */
  private checkMinHolding(
    context: TransferEvaluationContext,
    params: Record<string, unknown>
  ): { passed: boolean; message?: string } {
    const minAmount = BigInt(params['minAmount'] as string || '0');
    const transferAmount = BigInt(context.amount);

    if (transferAmount < minAmount) {
      return {
        passed: false,
        message: `Transfer amount ${context.amount} is below minimum ${params['minAmount']}`,
      };
    }

    return { passed: true };
  }

  /**
   * Check maximum holding amount
   */
  private checkMaxHolding(
    context: TransferEvaluationContext,
    params: Record<string, unknown>
  ): { passed: boolean; message?: string } {
    const maxAmount = BigInt(params['maxAmount'] as string || '0');
    const transferAmount = BigInt(context.amount);

    if (maxAmount > 0n && transferAmount > maxAmount) {
      return {
        passed: false,
        message: `Transfer amount ${context.amount} exceeds maximum ${params['maxAmount']}`,
      };
    }

    return { passed: true };
  }

  /**
   * Check lockup period
   */
  private checkLockupPeriod(
    context: TransferEvaluationContext
  ): { passed: boolean; message?: string } {
    const lockupEndSeconds =
      context.asset.transferabilityRules.lockupPeriodSeconds;

    if (lockupEndSeconds > 0) {
      const assetCreated = new Date(context.asset.createdAt);
      const lockupEnd = new Date(
        assetCreated.getTime() + lockupEndSeconds * 1000
      );

      if (new Date() < lockupEnd) {
        return {
          passed: false,
          message: `Asset is in lockup period until ${lockupEnd.toISOString()}`,
        };
      }
    }

    return { passed: true };
  }

  /**
   * Check jurisdiction whitelist
   */
  private checkJurisdictionWhitelist(
    context: TransferEvaluationContext,
    params: Record<string, unknown>
  ): { passed: boolean; message?: string } {
    const allowed = params['jurisdictions'] as string[];

    if (!allowed || allowed.length === 0) {
      return { passed: true };
    }

    if (!allowed.includes(context.to.jurisdiction)) {
      return {
        passed: false,
        message: `Receiver jurisdiction ${context.to.jurisdiction} is not in allowed list`,
      };
    }

    return { passed: true };
  }

  /**
   * Check jurisdiction blacklist
   */
  private checkJurisdictionBlacklist(
    context: TransferEvaluationContext,
    params: Record<string, unknown>
  ): { passed: boolean; message?: string } {
    const blocked = params['jurisdictions'] as string[];

    if (!blocked || blocked.length === 0) {
      return { passed: true };
    }

    if (blocked.includes(context.to.jurisdiction)) {
      return {
        passed: false,
        message: `Receiver jurisdiction ${context.to.jurisdiction} is blocked`,
      };
    }

    return { passed: true };
  }

  /**
   * Check time restriction
   */
  private checkTimeRestriction(
    params: Record<string, unknown>
  ): { passed: boolean; message?: string } {
    const now = new Date();
    const startTime = params['startTime'] as string;
    const endTime = params['endTime'] as string;

    if (startTime && new Date(startTime) > now) {
      return {
        passed: false,
        message: `Transfer not allowed before ${startTime}`,
      };
    }

    if (endTime && new Date(endTime) < now) {
      return {
        passed: false,
        message: `Transfer not allowed after ${endTime}`,
      };
    }

    return { passed: true };
  }

  // ============================================================================
  // WHITELIST MANAGEMENT
  // ============================================================================

  /**
   * Add party to asset whitelist
   *
   * @throws ValidationError if assetId or partyId is invalid
   */
  addToWhitelist(assetId: string, partyId: string): void {
    const assetResult = AssetIdSchema.safeParse(assetId);
    if (!assetResult.success) {
      throw new ValidationError('Invalid asset ID', { field: 'assetId', constraints: { minLength: '1' } });
    }
    const partyResult = PartyIdSchema.safeParse(partyId);
    if (!partyResult.success) {
      throw new ValidationError('Invalid party ID', { field: 'partyId', constraints: { minLength: '1' } });
    }

    let whitelist = this.whitelists.get(assetId);
    if (!whitelist) {
      whitelist = new Set();
      this.whitelists.set(assetId, whitelist);
    }
    whitelist.add(partyId);
  }

  /**
   * Remove party from asset whitelist
   *
   * @throws ValidationError if assetId or partyId is invalid
   */
  removeFromWhitelist(assetId: string, partyId: string): boolean {
    const assetResult = AssetIdSchema.safeParse(assetId);
    if (!assetResult.success) {
      throw new ValidationError('Invalid asset ID', { field: 'assetId', constraints: { minLength: '1' } });
    }
    const partyResult = PartyIdSchema.safeParse(partyId);
    if (!partyResult.success) {
      throw new ValidationError('Invalid party ID', { field: 'partyId', constraints: { minLength: '1' } });
    }

    const whitelist = this.whitelists.get(assetId);
    return whitelist?.delete(partyId) || false;
  }

  /**
   * Check if party is whitelisted
   *
   * @throws ValidationError if assetId or partyId is invalid
   */
  isWhitelisted(assetId: string, partyId: string): boolean {
    const assetResult = AssetIdSchema.safeParse(assetId);
    if (!assetResult.success) {
      throw new ValidationError('Invalid asset ID', { field: 'assetId', constraints: { minLength: '1' } });
    }
    const partyResult = PartyIdSchema.safeParse(partyId);
    if (!partyResult.success) {
      throw new ValidationError('Invalid party ID', { field: 'partyId', constraints: { minLength: '1' } });
    }

    const whitelist = this.whitelists.get(assetId);
    if (!whitelist) return true; // No whitelist = open
    return whitelist.has(partyId);
  }

  /**
   * Get whitelist for an asset
   *
   * @throws ValidationError if assetId is invalid
   */
  getWhitelist(assetId: string): string[] {
    const assetResult = AssetIdSchema.safeParse(assetId);
    if (!assetResult.success) {
      throw new ValidationError('Invalid asset ID', { field: 'assetId', constraints: { minLength: '1' } });
    }

    const whitelist = this.whitelists.get(assetId);
    return whitelist ? Array.from(whitelist) : [];
  }

  // ============================================================================
  // INVESTOR COUNT MANAGEMENT
  // ============================================================================

  /**
   * Set investor count for an asset
   *
   * @throws ValidationError if assetId or count is invalid
   */
  setInvestorCount(assetId: string, count: number): void {
    const assetResult = AssetIdSchema.safeParse(assetId);
    if (!assetResult.success) {
      throw new ValidationError('Invalid asset ID', { field: 'assetId', constraints: { minLength: '1' } });
    }
    const countResult = InvestorCountSchema.safeParse(count);
    if (!countResult.success) {
      throw new ValidationError('Invalid investor count', { field: 'count', constraints: { min: '0' } });
    }

    this.investorCounts.set(assetId, count);
  }

  /**
   * Increment investor count
   *
   * @throws ValidationError if assetId is invalid
   */
  incrementInvestorCount(assetId: string): number {
    const assetResult = AssetIdSchema.safeParse(assetId);
    if (!assetResult.success) {
      throw new ValidationError('Invalid asset ID', { field: 'assetId', constraints: { minLength: '1' } });
    }

    const current = this.investorCounts.get(assetId) || 0;
    const newCount = current + 1;
    this.investorCounts.set(assetId, newCount);
    return newCount;
  }

  /**
   * Get investor count
   *
   * @throws ValidationError if assetId is invalid
   */
  getInvestorCount(assetId: string): number {
    const assetResult = AssetIdSchema.safeParse(assetId);
    if (!assetResult.success) {
      throw new ValidationError('Invalid asset ID', { field: 'assetId', constraints: { minLength: '1' } });
    }

    return this.investorCounts.get(assetId) || 0;
  }

  /**
   * Clear all data (for testing)
   */
  clear(): void {
    this.rulesets.clear();
    this.whitelists.clear();
    this.investorCounts.clear();
    this.whitelists.clear();
    this.investorCounts.clear();
  }

  /**
   * Check compliance on-chain (ERC-3643)
   */
  private async checkOnChainCompliance(
    context: TransferEvaluationContext
  ): Promise<{ violations: ComplianceViolation[]; warnings: string[] }> {
    const violations: ComplianceViolation[] = [];
    const warnings: string[] = [];

    // Need contract address
    const contractAddress = (context.asset as any).tokenInfo?.contractAddress;
    if (!contractAddress) return { violations, warnings }; // Skip if not on-chain

    try {
      // Call canTransfer on the token contract
      // function canTransfer(address to, uint256 value, bytes calldata data) external view returns (bool, byte, bytes32)
      const result = await this.chainService!.readContract(
        contractAddress,
        [{
          inputs: [
            { name: 'to', type: 'address' },
            { name: 'value', type: 'uint256' },
            { name: 'data', type: 'bytes' }
          ],
          name: 'canTransfer',
          outputs: [
            { name: 'success', type: 'bool' },
            { name: 'reason', type: 'bytes1' },
            { name: 'error', type: 'bytes32' }
          ],
          stateMutability: 'view',
          type: 'function'
        }],
        'canTransfer',
        [context.to.wallets?.[0]?.address || '0x0', BigInt(context.amount), '0x']
      );

      if (result && result[0] === false) {
        violations.push({
          ruleId: 'ON_CHAIN_REJECTION',
          ruleName: 'On-Chain Compliance',
          severity: 'ERROR',
          message: `On-chain validation failed. Code: ${result[1]}`,
          metadata: { error: result[2] }
        });
      }

    } catch (error) {
      warnings.push(`On-chain check failed: ${error}`);
    }

    return { violations, warnings };
  }
}

/**
 * Create default compliance service with common rulesets
 */
export function createComplianceService(): ComplianceService {
  const service = new ComplianceService();

  // Vertical-specific rulesets (e.g. UAE real estate) should be registered
  // by their respective packs via service.registerRuleset()

  // Register default ticket ruleset
  service.registerRuleset({
    id: 'event-ticket',
    name: 'Event Ticket Compliance',
    description: 'Standard compliance rules for event tickets',
    appliesToAssetTypes: ['ACCESS'],
    conditions: [
      {
        type: RuleConditionType.TIME_RESTRICTION,
        enabled: true,
        params: {},
        errorMessage: 'Transfer outside allowed window',
        severity: 'ERROR',
      },
    ],
    priority: 5,
    active: true,
    metadata: {},
  });

  return service;
}
