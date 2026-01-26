/**
 * ComplianceEngine - Central orchestrator for compliance-first architecture
 *
 * The ComplianceEngine is the GATEKEEPER for ALL operations. Nothing happens
 * without a PolicyDecision and DecisionReceipt.
 *
 * Flow:
 * 1. User requests an action (create, verify, activate, mint, transfer, burn)
 * 2. ComplianceEngine.evaluate() is called
 * 3. Engine evaluates plugins (jurisdiction, compliance, policies)
 * 4. Engine produces a PolicyDecision (ALLOW/DENY/CONDITIONAL)
 * 5. Engine creates a DecisionReceipt (signed, hashed, chained)
 * 6. If ALLOW, the operation proceeds
 * 7. If DENY, the receipt explains why
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  PolicyDecision,
  PolicyViolation,
  PolicyWarning,
  ComplianceContext,
  RightModel,
  BaseEvent,
} from './types.js';
import { EventType, ComplianceAction } from './types.js';
import type {
  IJurisdictionPlugin,
  ICompliancePlugin,
  IEventStore,
  PartyComplianceStatus,
} from './interfaces.js';
import { hashPolicy, PolicyVersionManager, policyVersionManager } from './PolicyHash.js';
import {
  DecisionReceipt,
  ReceiptChain,
  receiptChain,
  createReceipt,
} from './DecisionReceipt.js';
import { PolicyEvaluator } from './PolicyEvaluator.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Configuration for the ComplianceEngine
 */
export interface ComplianceEngineConfig {
  /** Jurisdiction plugin for regulatory checks */
  jurisdictionPlugin?: IJurisdictionPlugin;
  /** Compliance plugin for KYC/AML checks */
  compliancePlugin?: ICompliancePlugin;
  /** Policy evaluator for rule-based checks */
  policyEvaluator?: PolicyEvaluator;
  /** Event store for recording decisions */
  eventStore?: IEventStore;
  /** Issuer identifier for receipts */
  issuerId?: string;
  /** Enable strict mode (require all plugins) */
  strictMode?: boolean;
}

/**
 * Result from a compliance evaluation
 */
export interface ComplianceResult {
  /** The policy decision */
  decision: PolicyDecision;
  /** The decision receipt (signed proof) */
  receipt: DecisionReceipt;
}

// ============================================================================
// COMPLIANCE ENGINE
// ============================================================================

/**
 * ComplianceEngine - The brain of compliance-first architecture
 */
export class ComplianceEngine {
  private jurisdictionPlugin?: IJurisdictionPlugin;
  private compliancePlugin?: ICompliancePlugin;
  private policyEvaluator?: PolicyEvaluator;
  private eventStore?: IEventStore;
  private receiptChain: ReceiptChain;
  private policyVersionManager: PolicyVersionManager;
  private issuerId: string;
  private strictMode: boolean;

  // Default policy for when no custom policy is configured
  private defaultPolicy = {
    rules: [
      { id: 'basic_kyc', type: 'require', field: 'actor.kycVerified', op: 'eq', value: true },
    ],
    metadata: { name: 'default-policy', version: '1.0.0' },
  };

  constructor(config: ComplianceEngineConfig = {}) {
    this.jurisdictionPlugin = config.jurisdictionPlugin;
    this.compliancePlugin = config.compliancePlugin;
    this.policyEvaluator = config.policyEvaluator;
    this.eventStore = config.eventStore;
    this.receiptChain = receiptChain;
    this.policyVersionManager = policyVersionManager;
    this.issuerId = config.issuerId || 'compliance-engine';
    this.strictMode = config.strictMode || false;
  }

  // ============================================================================
  // MAIN ENTRY POINT
  // ============================================================================

  /**
   * Evaluate an action for compliance
   *
   * This is the main entry point - ALL operations must go through this method.
   *
   * @param action - The action being requested
   * @param context - Context for the evaluation
   * @returns Promise<ComplianceResult> - Decision and receipt
   */
  async evaluate(
    action: ComplianceAction,
    context: ComplianceContext
  ): Promise<ComplianceResult> {
    // 1. Get applicable policies
    const policy = this.getApplicablePolicy(action, context);

    // 2. Hash policy for audit trail
    const policyHash = hashPolicy(policy);
    const policyVersion = '1.0.0'; // Would come from policy version manager in production

    // 3. Evaluate based on action type
    let decision: PolicyDecision;

    switch (action) {
      case 'asset:create':
        decision = await this.evaluateAssetCreation(context);
        break;
      case 'asset:verify':
        decision = await this.evaluateAssetVerification(context);
        break;
      case 'asset:activate':
        decision = await this.evaluateAssetActivation(context);
        break;
      case 'token:mint':
        decision = await this.evaluateMint(context);
        break;
      case 'token:transfer':
        decision = await this.evaluateTransfer(context);
        break;
      case 'token:burn':
        decision = await this.evaluateBurn(context);
        break;
      case 'party:register':
        decision = await this.evaluatePartyRegistration(context);
        break;
      default:
        decision = this.buildDecision(action, [
          {
            code: 'UNKNOWN_ACTION',
            message: `Unknown compliance action: ${action}`,
            severity: 'CRITICAL',
            rule: 'system.action_validation',
          },
        ], []);
    }

    // 4. Enrich decision with policy info
    decision.policyVersion = policyVersion;
    decision.policyHash = policyHash;

    // 5. Create receipt
    const receipt = createReceipt(decision, context, {
      previousReceiptHash: this.receiptChain.getLastReceiptHash(),
      issuedBy: this.issuerId,
    });

    // 6. Store receipt in chain
    this.receiptChain.append(receipt);

    // 7. Emit event to event store
    if (this.eventStore) {
      await this.emitDecisionEvent(decision, receipt, context);
    }

    return { decision, receipt };
  }

  // ============================================================================
  // ACTION-SPECIFIC EVALUATIONS
  // ============================================================================

  /**
   * Evaluate asset creation
   */
  private async evaluateAssetCreation(context: ComplianceContext): Promise<PolicyDecision> {
    const violations: PolicyViolation[] = [];
    const warnings: PolicyWarning[] = [];

    // Check jurisdiction allows this asset type
    if (this.jurisdictionPlugin && context.asset) {
      try {
        const result = await this.jurisdictionPlugin.canCreateAsset(context.asset);
        if (!result.allowed) {
          violations.push({
            code: 'JURISDICTION_BLOCKED',
            message: result.reason || 'Asset type not allowed in jurisdiction',
            severity: 'CRITICAL',
            rule: 'jurisdiction.asset_type',
          });
        }
        if (result.restrictions && result.restrictions.length > 0) {
          warnings.push({
            code: 'JURISDICTION_RESTRICTIONS',
            message: `Restrictions: ${result.restrictions.join(', ')}`,
            rule: 'jurisdiction.restrictions',
          });
        }
      } catch (error) {
        if (this.strictMode) {
          violations.push({
            code: 'JURISDICTION_CHECK_FAILED',
            message: `Jurisdiction check failed: ${error}`,
            severity: 'CRITICAL',
            rule: 'jurisdiction.availability',
          });
        }
      }
    }

    // Check creator has basic KYC
    if (this.compliancePlugin && context.actorId) {
      try {
        const partyStatus = await this.compliancePlugin.getPartyStatus(context.actorId);
        if (!partyStatus) {
          violations.push({
            code: 'CREATOR_NOT_FOUND',
            message: 'Asset creator is not a registered party',
            severity: 'CRITICAL',
            rule: 'compliance.party_registration',
          });
        } else if (!partyStatus.kycVerified) {
          violations.push({
            code: 'CREATOR_KYC_REQUIRED',
            message: 'Asset creator must complete KYC verification',
            severity: 'CRITICAL',
            rule: 'compliance.kyc_required',
          });
        } else if (partyStatus.kycExpiryDate && new Date(partyStatus.kycExpiryDate) < new Date()) {
          violations.push({
            code: 'CREATOR_KYC_EXPIRED',
            message: 'Asset creator KYC verification has expired',
            severity: 'CRITICAL',
            rule: 'compliance.kyc_expiry',
          });
        }
      } catch (error) {
        if (this.strictMode) {
          violations.push({
            code: 'COMPLIANCE_CHECK_FAILED',
            message: `Compliance check failed: ${error}`,
            severity: 'CRITICAL',
            rule: 'compliance.availability',
          });
        }
      }
    }

    return this.buildDecision(ComplianceAction.ASSET_CREATE, violations, warnings);
  }

  /**
   * Evaluate asset verification
   */
  private async evaluateAssetVerification(context: ComplianceContext): Promise<PolicyDecision> {
    const violations: PolicyViolation[] = [];
    const warnings: PolicyWarning[] = [];

    // Verifier must have KYC
    if (this.compliancePlugin && context.actorId) {
      const partyStatus = await this.safeGetPartyStatus(context.actorId);
      if (!partyStatus?.kycVerified) {
        violations.push({
          code: 'VERIFIER_KYC_REQUIRED',
          message: 'Verifier must have completed KYC verification',
          severity: 'CRITICAL',
          rule: 'compliance.verifier_kyc',
        });
      }
    }

    // Asset must exist
    if (!context.asset && !context.assetId) {
      violations.push({
        code: 'ASSET_NOT_FOUND',
        message: 'Asset not found for verification',
        severity: 'CRITICAL',
        rule: 'asset.existence',
      });
    }

    return this.buildDecision(ComplianceAction.ASSET_VERIFY, violations, warnings);
  }

  /**
   * Evaluate asset activation (final gate before minting enabled)
   */
  private async evaluateAssetActivation(context: ComplianceContext): Promise<PolicyDecision> {
    const violations: PolicyViolation[] = [];
    const warnings: PolicyWarning[] = [];

    // Full compliance check before activation
    if (this.compliancePlugin && context.asset) {
      try {
        const partyStatus = await this.safeGetPartyStatus(context.actorId);
        if (partyStatus) {
          const canHold = await this.compliancePlugin.canHoldAsset(
            context.actorId,
            context.asset,
            partyStatus
          );
          if (!canHold.compliant) {
            for (const violation of canHold.violations) {
              violations.push({
                code: violation.ruleId,
                message: violation.message,
                severity: violation.severity === 'WARNING' ? 'ERROR' : 'CRITICAL',
                rule: violation.ruleName,
              });
            }
          }
        } else {
          violations.push({
            code: 'ACTIVATOR_NOT_FOUND',
            message: 'Party activating asset not found',
            severity: 'CRITICAL',
            rule: 'compliance.party_registration',
          });
        }
      } catch (error) {
        if (this.strictMode) {
          violations.push({
            code: 'ACTIVATION_CHECK_FAILED',
            message: `Activation compliance check failed: ${error}`,
            severity: 'CRITICAL',
            rule: 'compliance.activation_requirements',
          });
        }
      }
    }

    // Jurisdiction check for activation
    if (this.jurisdictionPlugin && context.asset) {
      try {
        const result = await this.jurisdictionPlugin.canCreateAsset(context.asset);
        if (!result.allowed) {
          violations.push({
            code: 'ACTIVATION_JURISDICTION_BLOCKED',
            message: result.reason || 'Asset cannot be activated in this jurisdiction',
            severity: 'CRITICAL',
            rule: 'jurisdiction.activation',
          });
        }
      } catch {
        // Non-critical for activation
        warnings.push({
          code: 'JURISDICTION_CHECK_SKIPPED',
          message: 'Jurisdiction check could not be performed',
          rule: 'jurisdiction.availability',
        });
      }
    }

    return this.buildDecision(ComplianceAction.ASSET_ACTIVATE, violations, warnings);
  }

  /**
   * Evaluate token minting
   */
  private async evaluateMint(context: ComplianceContext): Promise<PolicyDecision> {
    const violations: PolicyViolation[] = [];
    const warnings: PolicyWarning[] = [];

    // Check recipient can hold this asset
    if (this.compliancePlugin && context.recipientId) {
      try {
        const recipientStatus = await this.safeGetPartyStatus(context.recipientId);

        if (!recipientStatus) {
          violations.push({
            code: 'RECIPIENT_NOT_FOUND',
            message: 'Token recipient is not a registered party',
            severity: 'CRITICAL',
            rule: 'compliance.party_registration',
          });
        } else {
          if (!recipientStatus.kycVerified) {
            violations.push({
              code: 'RECIPIENT_KYC_REQUIRED',
              message: 'Token recipient must complete KYC verification',
              severity: 'CRITICAL',
              rule: 'compliance.kyc_required',
            });
          }

          if (recipientStatus.frozenUntil && new Date(recipientStatus.frozenUntil) > new Date()) {
            violations.push({
              code: 'RECIPIENT_FROZEN',
              message: 'Token recipient account is frozen',
              severity: 'CRITICAL',
              rule: 'compliance.account_status',
            });
          }

          // Check if recipient can hold this specific asset
          if (context.asset) {
            const canHold = await this.compliancePlugin.canHoldAsset(
              context.recipientId,
              context.asset,
              recipientStatus
            );
            if (!canHold.compliant) {
              for (const violation of canHold.violations) {
                violations.push({
                  code: violation.ruleId,
                  message: violation.message,
                  severity: violation.severity === 'WARNING' ? 'ERROR' : 'CRITICAL',
                  rule: violation.ruleName,
                });
              }
            }
          }
        }
      } catch (error) {
        if (this.strictMode) {
          violations.push({
            code: 'MINT_COMPLIANCE_CHECK_FAILED',
            message: `Mint compliance check failed: ${error}`,
            severity: 'CRITICAL',
            rule: 'compliance.mint_requirements',
          });
        }
      }
    } else if (!context.recipientId) {
      violations.push({
        code: 'RECIPIENT_REQUIRED',
        message: 'Recipient ID is required for minting',
        severity: 'CRITICAL',
        rule: 'token.mint_recipient',
      });
    }

    // Check jurisdiction allows minting to recipient
    if (this.jurisdictionPlugin && context.asset && context.recipientId) {
      try {
        const recipientStatus = await this.safeGetPartyStatus(context.recipientId);
        const toJurisdiction = recipientStatus?.restrictedJurisdictions?.[0] || 'UNKNOWN';

        const transferContext = {
          from: '0x0000000000000000000000000000000000000000', // Mint from zero address
          to: context.recipientId,
          amount: context.amount || '0',
          assetId: context.assetId || context.asset.id,
          timestamp: new Date().toISOString(),
        };

        const canMint = await this.jurisdictionPlugin.canTransfer(
          transferContext,
          context.asset.jurisdiction.countryCode,
          toJurisdiction
        );

        if (!canMint.allowed) {
          violations.push({
            code: 'JURISDICTION_MINT_BLOCKED',
            message: canMint.reason || 'Mint blocked by jurisdiction rules',
            severity: 'CRITICAL',
            rule: 'jurisdiction.mint',
          });
        }
      } catch {
        warnings.push({
          code: 'JURISDICTION_CHECK_SKIPPED',
          message: 'Jurisdiction check could not be performed for mint',
          rule: 'jurisdiction.availability',
        });
      }
    }

    return this.buildDecision(ComplianceAction.TOKEN_MINT, violations, warnings);
  }

  /**
   * Evaluate token transfer
   */
  private async evaluateTransfer(context: ComplianceContext): Promise<PolicyDecision> {
    const violations: PolicyViolation[] = [];
    const warnings: PolicyWarning[] = [];

    // Get sender and recipient status
    const senderStatus = context.actorId
      ? await this.safeGetPartyStatus(context.actorId)
      : null;
    const recipientStatus = context.recipientId
      ? await this.safeGetPartyStatus(context.recipientId)
      : null;

    // Validate sender
    if (!senderStatus) {
      violations.push({
        code: 'SENDER_NOT_FOUND',
        message: 'Transfer sender is not a registered party',
        severity: 'CRITICAL',
        rule: 'compliance.party_registration',
      });
    } else {
      if (!senderStatus.kycVerified) {
        violations.push({
          code: 'SENDER_KYC_REQUIRED',
          message: 'Transfer sender must complete KYC verification',
          severity: 'CRITICAL',
          rule: 'compliance.kyc_required',
        });
      }
      if (senderStatus.frozenUntil && new Date(senderStatus.frozenUntil) > new Date()) {
        violations.push({
          code: 'SENDER_FROZEN',
          message: 'Transfer sender account is frozen',
          severity: 'CRITICAL',
          rule: 'compliance.account_status',
        });
      }
    }

    // Validate recipient
    if (!recipientStatus) {
      violations.push({
        code: 'RECIPIENT_NOT_FOUND',
        message: 'Transfer recipient is not a registered party',
        severity: 'CRITICAL',
        rule: 'compliance.party_registration',
      });
    } else {
      if (!recipientStatus.kycVerified) {
        violations.push({
          code: 'RECIPIENT_KYC_REQUIRED',
          message: 'Transfer recipient must complete KYC verification',
          severity: 'CRITICAL',
          rule: 'compliance.kyc_required',
        });
      }
      if (recipientStatus.frozenUntil && new Date(recipientStatus.frozenUntil) > new Date()) {
        violations.push({
          code: 'RECIPIENT_FROZEN',
          message: 'Transfer recipient account is frozen',
          severity: 'CRITICAL',
          rule: 'compliance.account_status',
        });
      }
    }

    // Evaluate transfer with compliance plugin
    if (this.compliancePlugin && senderStatus && recipientStatus) {
      try {
        const transferContext = {
          from: context.actorId,
          to: context.recipientId!,
          amount: context.amount || '0',
          assetId: context.assetId || context.asset?.id || '',
          timestamp: new Date().toISOString(),
        };

        const complianceResult = await this.compliancePlugin.evaluateTransfer(
          transferContext,
          senderStatus,
          recipientStatus
        );

        if (!complianceResult.compliant) {
          for (const violation of complianceResult.violations) {
            violations.push({
              code: violation.ruleId,
              message: violation.message,
              severity: violation.severity === 'WARNING' ? 'ERROR' : 'CRITICAL',
              rule: violation.ruleName,
            });
          }
        }

        for (const warning of complianceResult.warnings) {
          warnings.push({
            code: 'COMPLIANCE_WARNING',
            message: warning,
            rule: 'compliance.transfer',
          });
        }
      } catch (error) {
        if (this.strictMode) {
          violations.push({
            code: 'TRANSFER_COMPLIANCE_CHECK_FAILED',
            message: `Transfer compliance check failed: ${error}`,
            severity: 'CRITICAL',
            rule: 'compliance.transfer_requirements',
          });
        }
      }
    }

    // Jurisdiction check for transfer
    if (this.jurisdictionPlugin && context.asset && senderStatus && recipientStatus) {
      try {
        const fromJurisdiction = senderStatus.restrictedJurisdictions?.[0] || context.asset.jurisdiction.countryCode;
        const toJurisdiction = recipientStatus.restrictedJurisdictions?.[0] || 'UNKNOWN';

        const transferContext = {
          from: context.actorId,
          to: context.recipientId!,
          amount: context.amount || '0',
          assetId: context.assetId || context.asset.id,
          timestamp: new Date().toISOString(),
        };

        const canTransfer = await this.jurisdictionPlugin.canTransfer(
          transferContext,
          fromJurisdiction,
          toJurisdiction
        );

        if (!canTransfer.allowed) {
          violations.push({
            code: 'JURISDICTION_TRANSFER_BLOCKED',
            message: canTransfer.reason || 'Transfer blocked by jurisdiction rules',
            severity: 'CRITICAL',
            rule: 'jurisdiction.transfer',
          });
        }
      } catch {
        warnings.push({
          code: 'JURISDICTION_CHECK_SKIPPED',
          message: 'Jurisdiction check could not be performed for transfer',
          rule: 'jurisdiction.availability',
        });
      }
    }

    return this.buildDecision(ComplianceAction.TOKEN_TRANSFER, violations, warnings);
  }

  /**
   * Evaluate token burn
   */
  private async evaluateBurn(context: ComplianceContext): Promise<PolicyDecision> {
    const violations: PolicyViolation[] = [];
    const warnings: PolicyWarning[] = [];

    // Burner must have KYC and not be frozen
    if (this.compliancePlugin && context.actorId) {
      const partyStatus = await this.safeGetPartyStatus(context.actorId);

      if (!partyStatus) {
        violations.push({
          code: 'BURNER_NOT_FOUND',
          message: 'Token burner is not a registered party',
          severity: 'CRITICAL',
          rule: 'compliance.party_registration',
        });
      } else {
        if (!partyStatus.kycVerified) {
          violations.push({
            code: 'BURNER_KYC_REQUIRED',
            message: 'Token burner must complete KYC verification',
            severity: 'CRITICAL',
            rule: 'compliance.kyc_required',
          });
        }
        if (partyStatus.frozenUntil && new Date(partyStatus.frozenUntil) > new Date()) {
          violations.push({
            code: 'BURNER_FROZEN',
            message: 'Token burner account is frozen',
            severity: 'CRITICAL',
            rule: 'compliance.account_status',
          });
        }
      }
    }

    return this.buildDecision(ComplianceAction.TOKEN_BURN, violations, warnings);
  }

  /**
   * Evaluate party registration
   */
  private async evaluatePartyRegistration(context: ComplianceContext): Promise<PolicyDecision> {
    const violations: PolicyViolation[] = [];
    const warnings: PolicyWarning[] = [];

    // Basic validation - party must have identifying information
    if (!context.metadata?.name && !context.metadata?.identifier) {
      violations.push({
        code: 'PARTY_IDENTIFIER_REQUIRED',
        message: 'Party must have a name or identifier',
        severity: 'ERROR',
        rule: 'party.identification',
      });
    }

    return this.buildDecision(ComplianceAction.PARTY_REGISTER, violations, warnings);
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  /**
   * Build a PolicyDecision from violations and warnings
   */
  private buildDecision(
    action: ComplianceAction,
    violations: PolicyViolation[],
    warnings: PolicyWarning[]
  ): PolicyDecision {
    return {
      id: uuidv4(),
      action,
      result: violations.length === 0 ? 'ALLOW' : 'DENY',
      violations,
      warnings,
      policyVersion: '', // Set by caller
      policyHash: '', // Set by caller
      evaluatedAt: new Date().toISOString(),
    };
  }

  /**
   * Get applicable policy for an action
   */
  private getApplicablePolicy(action: ComplianceAction, context: ComplianceContext): object {
    // In production, this would look up the policy from a policy store
    // based on the action type, asset type, jurisdiction, etc.
    return this.defaultPolicy;
  }

  /**
   * Safely get party status with error handling
   */
  private async safeGetPartyStatus(partyId: string): Promise<PartyComplianceStatus | null> {
    if (!this.compliancePlugin) return null;

    try {
      return await this.compliancePlugin.getPartyStatus(partyId);
    } catch {
      return null;
    }
  }

  /**
   * Emit decision event to event store
   */
  private async emitDecisionEvent(
    decision: PolicyDecision,
    receipt: DecisionReceipt,
    context: ComplianceContext
  ): Promise<void> {
    if (!this.eventStore) return;

    const eventType = decision.result === 'ALLOW'
      ? EventType.POLICY_DECISION_ALLOWED
      : EventType.POLICY_DECISION_DENIED;

    const event: BaseEvent = {
      id: uuidv4(),
      type: eventType,
      assetId: context.assetId || context.asset?.id || 'no-asset',
      timestamp: receipt.issuedAt,
      actorId: context.actorId,
      payload: {
        decision: {
          id: decision.id,
          action: decision.action,
          result: decision.result,
          violations: decision.violations,
          warnings: decision.warnings,
          policyVersion: decision.policyVersion,
          policyHash: decision.policyHash,
        },
        receipt: {
          id: receipt.id,
          decisionHash: receipt.decisionHash,
          summary: receipt.summary,
        },
      },
      eventVersion: 1,
    };

    await this.eventStore.append(event);
  }

  // ============================================================================
  // PUBLIC ACCESSORS
  // ============================================================================

  /**
   * Get receipts for an asset
   */
  getReceiptsForAsset(assetId: string): DecisionReceipt[] {
    return this.receiptChain.getByAsset(assetId);
  }

  /**
   * Get a receipt by ID
   */
  getReceipt(receiptId: string): DecisionReceipt | undefined {
    return this.receiptChain.getById(receiptId);
  }

  /**
   * Get all receipts
   */
  getAllReceipts(): DecisionReceipt[] {
    return this.receiptChain.getAll();
  }

  /**
   * Verify a receipt
   */
  verifyReceipt(receiptId: string): boolean {
    const receipt = this.receiptChain.getById(receiptId);
    if (!receipt) return false;

    const { verifyReceipt } = require('./DecisionReceipt.js');
    const result = verifyReceipt(receipt);
    return result.valid;
  }

  /**
   * Verify the entire receipt chain
   */
  verifyChain(): { valid: boolean; issues: string[] } {
    return this.receiptChain.verifyChain();
  }

  /**
   * Set the jurisdiction plugin
   */
  setJurisdictionPlugin(plugin: IJurisdictionPlugin): void {
    this.jurisdictionPlugin = plugin;
  }

  /**
   * Set the compliance plugin
   */
  setCompliancePlugin(plugin: ICompliancePlugin): void {
    this.compliancePlugin = plugin;
  }

  /**
   * Set the policy evaluator
   */
  setPolicyEvaluator(evaluator: PolicyEvaluator): void {
    this.policyEvaluator = evaluator;
  }

  /**
   * Set the event store
   */
  setEventStore(eventStore: IEventStore): void {
    this.eventStore = eventStore;
  }

  /**
   * Clear all receipts (for testing)
   */
  clear(): void {
    this.receiptChain.clear();
  }
}

/**
 * Singleton instance for SDK-wide usage
 */
let complianceEngineInstance: ComplianceEngine | null = null;

export function getComplianceEngine(): ComplianceEngine {
  if (!complianceEngineInstance) {
    complianceEngineInstance = new ComplianceEngine();
  }
  return complianceEngineInstance;
}

export function setComplianceEngine(engine: ComplianceEngine): void {
  complianceEngineInstance = engine;
}
