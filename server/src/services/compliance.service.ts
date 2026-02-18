import { db, schema } from '../config/database.js';
import { eq, and, desc } from 'drizzle-orm';
import { createHash, randomUUID } from 'crypto';
import { NotFoundError, ValidationError, AppError } from '../middleware/errorHandler.js';
import * as auditService from './audit.service.js';
import * as whitelistService from './whitelist.service.js';
import { logger } from '../middleware/logger.js';
import { getSanctionsService } from './sanctions/sanctions.service.js';
import { getSigningService, canonicalJsonStringify } from './signing/signing.service.js';

const { policies, policyVersions, decisions, investors, parties, dldTitles, tokens, eventBusQueue, assets, ledgerPositions } = schema;

// ============================================================================
// Sanctions Screening Helper
// ============================================================================

export async function screenInvestorSanctions(investorId: string): Promise<'flagged' | 'clear'> {
  const investor = await db.query.investors.findFirst({
    where: eq(investors.id, investorId),
  });
  if (!investor) {
    throw new NotFoundError('Investor not found for sanctions screening');
  }

  // Resolve investor name via party join
  let name = '';
  let country = investor.jurisdiction || '';
  if (investor.partyId) {
    const party = await db.query.parties.findFirst({
      where: eq(parties.id, investor.partyId),
    });
    if (party) {
      name = party.name;
      country = country || party.jurisdiction;
    }
  }

  if (!name) {
    // Fallback: use email prefix or external ID as name if no party linked
    name = investor.email?.split('@')[0] || investor.externalId || 'unknown';
  }

  const sanctionsService = getSanctionsService();
  const result = await sanctionsService.screen({ name, country });
  const status = result.matchFound ? 'flagged' : 'clear';

  // Persist result
  await db.update(investors)
    .set({
      sanctionsStatus: status,
      sanctionsScreenedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(investors.id, investorId));

  if (result.matchFound) {
    logger.warn('Sanctions match found for investor', {
      investorId,
      matchCount: result.matches.length,
      topScore: result.matches[0]?.score,
    });
  }

  return status;
}

// ============================================================================
// Types & Interfaces
// ============================================================================

export type RuleOperator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'not_in' | 'contains' | 'not_contains' | 'regex';
export type RuleType = 'require' | 'limit' | 'block' | 'allow';
export type DecisionResult = 'allow' | 'deny' | 'require_action';
export type DecisionType = 'transfer' | 'issuance' | 'redemption' | 'freeze' | 'force_transfer';

export interface Rule {
  id: string;
  type: RuleType;
  field: string;
  op: RuleOperator;
  value?: unknown;
  message?: string;
  code?: string;
}

export interface Ruleset {
  version: number;
  rules: Rule[];
  actions?: {
    onDeny?: string[];
    onAllow?: string[];
  };
}

export interface DecisionReason {
  code: string;
  message: string;
  fields?: string[];
  ruleId?: string;
}

export interface DecisionInput {
  // Transfer inputs
  tokenId?: string;
  fromWallet?: string;
  toWallet?: string;
  amount?: string;

  // Investor inputs
  fromInvestorId?: string;
  toInvestorId?: string;

  // Context
  assetId?: string;
  dldTitleId?: string;

  // Resolved data (populated during evaluation)
  investor?: {
    kycStatus?: string;
    sanctions?: string;
    classification?: string;
    jurisdiction?: string;
    accreditedStatus?: string;
  };
  token?: {
    status?: string;
    chainId?: number;
  };
  asset?: {
    state?: string;
    transferabilityMode?: string;
    dld?: {
      flags?: string[];
      status?: string;
    };
  };
  holding?: {
    beforePct?: number;
    afterPct?: number;
    beforeAmount?: string;
    afterAmount?: string;
  };
  // Computed fields populated during evaluation
  lockup?: {
    /** Whether lockup period has elapsed (true = can transfer) */
    elapsed: boolean;
    /** Remaining lockup seconds (0 if elapsed) */
    remainingSeconds: number;
  };
  whitelist?: {
    /** Whether the sender is whitelisted */
    senderWhitelisted: boolean;
    /** Whether the recipient is whitelisted */
    recipientWhitelisted: boolean;
  };
}

export interface DecisionOutput {
  id: string;
  type: DecisionType;
  result: DecisionResult;
  reasons: DecisionReason[];
  requiredActions: string[];
  inputsHash: string;
  policyVersionId?: string;
  signature?: string;
  createdAt: Date;
}

// ============================================================================
// Policy Service
// ============================================================================

export interface CreatePolicyInput {
  orgId: string;
  name: string;
  description?: string;
  type?: DecisionType;
  ruleset: Ruleset;
  metadata?: Record<string, unknown>;
}

export interface UpdatePolicyInput {
  name?: string;
  description?: string;
  status?: 'active' | 'archived';
  metadata?: Record<string, unknown>;
}

export async function createPolicy(input: CreatePolicyInput) {
  // Validate ruleset
  validateRuleset(input.ruleset);

  // Create policy
  const [policy] = await db.insert(policies).values({
    orgId: input.orgId,
    name: input.name,
    description: input.description,
    type: input.type || 'transfer',
    metadata: input.metadata || {},
  }).returning();

  // Create initial version
  const [version] = await db.insert(policyVersions).values({
    orgId: input.orgId,
    policyId: policy.id,
    version: 1,
    ruleset: input.ruleset as any,
    publishedAt: new Date(),
  }).returning();

  // Update policy with current version
  await db.update(policies)
    .set({ currentVersionId: version.id })
    .where(eq(policies.id, policy.id));

  return { ...policy, currentVersion: version };
}

export async function getPolicy(id: string, orgId: string) {
  const policy = await db.query.policies.findFirst({
    where: and(eq(policies.id, id), eq(policies.orgId, orgId)),
  });

  if (!policy) {
    throw new NotFoundError('Policy not found');
  }

  // Get current version
  let currentVersion = null;
  if (policy.currentVersionId) {
    currentVersion = await db.query.policyVersions.findFirst({
      where: eq(policyVersions.id, policy.currentVersionId),
    });
  }

  return { ...policy, currentVersion };
}

export async function listPolicies(orgId: string, params: { type?: string; status?: string; limit?: number; offset?: number } = {}) {
  const { type, status, limit = 50, offset = 0 } = params;

  const conditions = [eq(policies.orgId, orgId)];
  if (type) conditions.push(eq(policies.type, type));
  if (status) conditions.push(eq(policies.status, status));

  const results = await db.select()
    .from(policies)
    .where(and(...conditions))
    .orderBy(desc(policies.createdAt))
    .limit(limit)
    .offset(offset);

  return results;
}

export async function publishPolicyVersion(policyId: string, orgId: string, ruleset: Ruleset, createdBy?: string) {
  const policy = await getPolicy(policyId, orgId);

  // Validate ruleset
  validateRuleset(ruleset);

  // Get current version number
  const latestVersion = await db.query.policyVersions.findFirst({
    where: eq(policyVersions.policyId, policyId),
    orderBy: [desc(policyVersions.version)],
  });

  const newVersionNumber = (latestVersion?.version || 0) + 1;

  // Create new version
  const [version] = await db.insert(policyVersions).values({
    orgId,
    policyId,
    version: newVersionNumber,
    ruleset: ruleset as any,
    createdBy,
    publishedAt: new Date(),
  }).returning();

  // Update policy with new current version
  await db.update(policies)
    .set({
      currentVersionId: version.id,
      updatedAt: new Date(),
    })
    .where(eq(policies.id, policyId));

  return version;
}

export async function getPolicyVersion(policyId: string, version: number, orgId: string) {
  const policyVersion = await db.query.policyVersions.findFirst({
    where: and(
      eq(policyVersions.policyId, policyId),
      eq(policyVersions.version, version),
      eq(policyVersions.orgId, orgId)
    ),
  });

  if (!policyVersion) {
    throw new NotFoundError('Policy version not found');
  }

  return policyVersion;
}

export async function listPolicyVersions(policyId: string, orgId: string) {
  return db.select()
    .from(policyVersions)
    .where(and(eq(policyVersions.policyId, policyId), eq(policyVersions.orgId, orgId)))
    .orderBy(desc(policyVersions.version));
}

// ============================================================================
// Ruleset Validation
// ============================================================================

const VALID_OPERATORS: RuleOperator[] = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'not_in', 'contains', 'not_contains', 'regex'];
const VALID_RULE_TYPES: RuleType[] = ['require', 'limit', 'block', 'allow'];

export function validateRuleset(ruleset: Ruleset): void {
  if (typeof ruleset.version !== 'number' || ruleset.version < 1) {
    throw new ValidationError('Ruleset version must be a positive integer');
  }

  if (!Array.isArray(ruleset.rules)) {
    throw new ValidationError('Ruleset must have a rules array');
  }

  for (const rule of ruleset.rules) {
    if (!rule.id || typeof rule.id !== 'string') {
      throw new ValidationError('Each rule must have a string id');
    }

    if (!VALID_RULE_TYPES.includes(rule.type)) {
      throw new ValidationError(`Invalid rule type: ${rule.type}. Must be one of: ${VALID_RULE_TYPES.join(', ')}`);
    }

    if (!rule.field || typeof rule.field !== 'string') {
      throw new ValidationError(`Rule ${rule.id}: field must be a non-empty string`);
    }

    if (!VALID_OPERATORS.includes(rule.op)) {
      throw new ValidationError(`Rule ${rule.id}: invalid operator ${rule.op}. Must be one of: ${VALID_OPERATORS.join(', ')}`);
    }

    if (rule.value === undefined) {
      throw new ValidationError(`Rule ${rule.id}: value is required`);
    }
  }
}

// ============================================================================
// Decision Engine
// ============================================================================

export interface EvaluateTransferInput {
  orgId: string;
  tokenId: string;
  fromWallet: string;
  toWallet: string;
  amount: string;
  policyId?: string;
  fromInvestorId?: string;
  toInvestorId?: string;
}

export async function evaluateTransfer(input: EvaluateTransferInput): Promise<DecisionOutput> {
  const { orgId, tokenId, fromWallet, toWallet, amount, policyId, fromInvestorId, toInvestorId } = input;

  // Get token and its policy
  const token = await db.query.tokens.findFirst({
    where: and(eq(tokens.id, tokenId), eq(tokens.orgId, orgId)),
  });

  if (!token) {
    throw new NotFoundError('Token not found');
  }

  // Determine which policy to use
  const effectivePolicyId = policyId || token.policyId;

  let policy = null;
  let policyVersion = null;
  let ruleset: Ruleset = getDefaultRuleset();

  if (effectivePolicyId) {
    policy = await getPolicy(effectivePolicyId, orgId);
    if (policy.currentVersion) {
      policyVersion = policy.currentVersion;
      ruleset = policyVersion.ruleset as unknown as Ruleset;
    }
  }

  // Gather context data for evaluation
  const decisionInput: DecisionInput = {
    tokenId,
    fromWallet,
    toWallet,
    amount,
    fromInvestorId,
    toInvestorId,
    token: {
      status: token.status,
      chainId: token.chainId,
    },
  };

  // Get investor data if available
  if (fromInvestorId) {
    const fromInvestor = await db.query.investors.findFirst({
      where: eq(investors.id, fromInvestorId),
    });
    if (fromInvestor) {
      // Run real sanctions screening
      let sanctionsResult: 'flagged' | 'clear' = 'clear';
      try {
        sanctionsResult = await screenInvestorSanctions(fromInvestorId);
      } catch (err) {
        logger.warn('Sanctions screening failed, defaulting to flagged', { error: err, investorId: fromInvestorId });
        sanctionsResult = 'flagged';
      }
      decisionInput.investor = {
        kycStatus: fromInvestor.status === 'active' ? 'approved' : 'pending',
        classification: fromInvestor.classification,
        jurisdiction: fromInvestor.jurisdiction,
        accreditedStatus: fromInvestor.accreditedStatus || 'unknown',
        sanctions: sanctionsResult,
      };
    }
  }

  // Get asset data for transferability rules
  let transferabilityRules: { mode?: string; lockupPeriodSeconds?: number } | null = null;
  if (token.assetId) {
    const asset = await db.query.assets.findFirst({
      where: eq(assets.id, token.assetId),
      columns: { transferabilityRules: true },
    });
    if (asset?.transferabilityRules) {
      transferabilityRules = asset.transferabilityRules as { mode?: string; lockupPeriodSeconds?: number };
    }

    // Get DLD data
    const dldTitle = await db.query.dldTitles.findFirst({
      where: eq(dldTitles.assetId, token.assetId),
    });

    decisionInput.asset = {
      transferabilityMode: transferabilityRules?.mode,
      dld: dldTitle ? {
        flags: dldTitle.flags || [],
        status: dldTitle.status,
      } : undefined,
    };
  }

  // --- Lockup period check ---
  const lockupSeconds = transferabilityRules?.lockupPeriodSeconds ?? 0;
  if (lockupSeconds > 0) {
    // Get earliest position for the sender wallet on this token
    const position = await db.query.ledgerPositions.findFirst({
      where: and(
        eq(ledgerPositions.tokenId, tokenId),
        eq(ledgerPositions.walletAddress, fromWallet.toLowerCase()),
      ),
      columns: { createdAt: true },
    });

    if (position?.createdAt) {
      const acquiredAt = new Date(position.createdAt).getTime();
      const lockupEnd = acquiredAt + lockupSeconds * 1000;
      const now = Date.now();
      decisionInput.lockup = {
        elapsed: now >= lockupEnd,
        remainingSeconds: Math.max(0, Math.ceil((lockupEnd - now) / 1000)),
      };
    } else {
      // No position found — treat as locked (cannot verify acquisition date)
      decisionInput.lockup = { elapsed: false, remainingSeconds: lockupSeconds };
    }
  } else {
    decisionInput.lockup = { elapsed: true, remainingSeconds: 0 };
  }

  // --- Whitelist check ---
  const mode = transferabilityRules?.mode;
  if (mode === 'WHITELIST_ONLY') {
    try {
      const [senderOk, recipientOk] = await Promise.all([
        whitelistService.isWhitelisted(orgId, tokenId, fromWallet),
        whitelistService.isWhitelisted(orgId, tokenId, toWallet),
      ]);
      decisionInput.whitelist = {
        senderWhitelisted: senderOk,
        recipientWhitelisted: recipientOk,
      };
    } catch (err) {
      logger.warn('Whitelist check failed, denying by default', { error: err });
      decisionInput.whitelist = {
        senderWhitelisted: false,
        recipientWhitelisted: false,
      };
    }
  } else {
    // Not in whitelist mode — treat as whitelisted
    decisionInput.whitelist = {
      senderWhitelisted: true,
      recipientWhitelisted: true,
    };
  }

  // Evaluate ruleset
  const evaluationResult = evaluateRuleset(ruleset, decisionInput);

  // Create decision record
  const decision = await createDecision({
    orgId,
    type: 'transfer',
    policyVersionId: policyVersion?.id,
    subjectRef: tokenId,
    subjectType: 'token',
    inputs: decisionInput,
    result: evaluationResult.result,
    reasons: evaluationResult.reasons,
    requiredActions: evaluationResult.requiredActions,
  });

  return decision;
}

export async function evaluateIssuance(input: {
  orgId: string;
  tokenId: string;
  toWallet: string;
  amount: string;
  toInvestorId?: string;
  policyId?: string;
}): Promise<DecisionOutput> {
  const { orgId, tokenId, toWallet, amount, toInvestorId, policyId } = input;

  // Similar to transfer evaluation but for issuance
  const token = await db.query.tokens.findFirst({
    where: and(eq(tokens.id, tokenId), eq(tokens.orgId, orgId)),
  });

  if (!token) {
    throw new NotFoundError('Token not found');
  }

  const effectivePolicyId = policyId || token.policyId;
  let ruleset: Ruleset = getDefaultRuleset();
  let policyVersion = null;

  if (effectivePolicyId) {
    const policy = await getPolicy(effectivePolicyId, orgId);
    if (policy.currentVersion) {
      policyVersion = policy.currentVersion;
      ruleset = policyVersion.ruleset as unknown as Ruleset;
    }
  }

  const decisionInput: DecisionInput = {
    tokenId,
    toWallet,
    amount,
    toInvestorId,
    token: {
      status: token.status,
      chainId: token.chainId,
    },
  };

  // Get investor data
  if (toInvestorId) {
    const toInvestor = await db.query.investors.findFirst({
      where: eq(investors.id, toInvestorId),
    });
    if (toInvestor) {
      // Run real sanctions screening
      let sanctionsResult: 'flagged' | 'clear' = 'clear';
      try {
        sanctionsResult = await screenInvestorSanctions(toInvestorId!);
      } catch (err) {
        logger.warn('Sanctions screening failed, defaulting to flagged', { error: err, investorId: toInvestorId });
        sanctionsResult = 'flagged';
      }
      decisionInput.investor = {
        kycStatus: toInvestor.status === 'active' ? 'approved' : 'pending',
        classification: toInvestor.classification,
        jurisdiction: toInvestor.jurisdiction,
        accreditedStatus: toInvestor.accreditedStatus || 'unknown',
        sanctions: sanctionsResult,
      };
    }
  }

  const evaluationResult = evaluateRuleset(ruleset, decisionInput);

  const decision = await createDecision({
    orgId,
    type: 'issuance',
    policyVersionId: policyVersion?.id,
    subjectRef: tokenId,
    subjectType: 'token',
    inputs: decisionInput,
    result: evaluationResult.result,
    reasons: evaluationResult.reasons,
    requiredActions: evaluationResult.requiredActions,
  });

  return decision;
}

// ============================================================================
// Rule Evaluation
// ============================================================================

interface EvaluationResult {
  result: DecisionResult;
  reasons: DecisionReason[];
  requiredActions: string[];
}

export function evaluateRuleset(ruleset: Ruleset, input: DecisionInput): EvaluationResult {
  const reasons: DecisionReason[] = [];
  const requiredActions: string[] = [];
  let allPassed = true;

  for (const rule of ruleset.rules) {
    const fieldValue = getFieldValue(input, rule.field);
    const passed = evaluateRule(rule, fieldValue);

    if (!passed) {
      allPassed = false;
      reasons.push({
        code: rule.code || `RULE_${rule.id.toUpperCase()}_FAILED`,
        message: rule.message || `Rule ${rule.id} failed: ${rule.field} ${rule.op} ${JSON.stringify(rule.value)}`,
        fields: [rule.field],
        ruleId: rule.id,
      });
    }
  }

  // Determine actions based on result
  if (!allPassed && ruleset.actions?.onDeny) {
    requiredActions.push(...ruleset.actions.onDeny);
  } else if (allPassed && ruleset.actions?.onAllow) {
    requiredActions.push(...ruleset.actions.onAllow);
  }

  return {
    result: allPassed ? 'allow' : 'deny',
    reasons,
    requiredActions,
  };
}

function getFieldValue(input: DecisionInput, fieldPath: string): unknown {
  const parts = fieldPath.split('.');
  let value: unknown = input;

  for (const part of parts) {
    if (value === null || value === undefined) return undefined;
    if (typeof value === 'object') {
      value = (value as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }

  return value;
}

function evaluateRule(rule: Rule, fieldValue: unknown): boolean {
  const { op, value } = rule;

  switch (op) {
    case 'eq':
      return fieldValue === value;

    case 'neq':
      return fieldValue !== value;

    case 'gt':
      return typeof fieldValue === 'number' && typeof value === 'number' && fieldValue > value;

    case 'gte':
      return typeof fieldValue === 'number' && typeof value === 'number' && fieldValue >= value;

    case 'lt':
      return typeof fieldValue === 'number' && typeof value === 'number' && fieldValue < value;

    case 'lte':
      return typeof fieldValue === 'number' && typeof value === 'number' && fieldValue <= value;

    case 'in':
      return Array.isArray(value) && value.includes(fieldValue);

    case 'not_in':
      return Array.isArray(value) && !value.includes(fieldValue);

    case 'contains':
      if (Array.isArray(fieldValue)) {
        return fieldValue.includes(value);
      }
      if (typeof fieldValue === 'string') {
        return fieldValue.includes(String(value));
      }
      return false;

    case 'not_contains':
      if (Array.isArray(fieldValue)) {
        return !fieldValue.includes(value);
      }
      if (typeof fieldValue === 'string') {
        return !fieldValue.includes(String(value));
      }
      return true;

    case 'regex':
      if (typeof fieldValue === 'string' && typeof value === 'string') {
        return new RegExp(value).test(fieldValue);
      }
      return false;

    default:
      return false;
  }
}

// ============================================================================
// Decision Creation & Storage
// ============================================================================

interface CreateDecisionInput {
  orgId: string;
  type: DecisionType;
  policyVersionId?: string;
  subjectRef: string;
  subjectType: string;
  inputs: DecisionInput;
  result: DecisionResult;
  reasons: DecisionReason[];
  requiredActions: string[];
}

async function createDecision(input: CreateDecisionInput): Promise<DecisionOutput> {
  // Create canonical hash of inputs
  const inputsHash = createHash('sha256')
    .update(canonicalJsonStringify(input.inputs))
    .digest('hex');

  // Create decision hash (for receipt linkage)
  const decisionHash = computeDecisionHash(input, inputsHash);

  // Create signature over decision (in production, use HSM)
  const decisionPayload = {
    type: input.type,
    result: input.result,
    reasons: input.reasons,
    inputsHash,
    decisionHash,
    timestamp: new Date(),
  };

  const signature = await signDecisionAsync(decisionPayload);

  const [decision] = await db.insert(decisions).values({
    orgId: input.orgId,
    type: input.type,
    policyVersionId: input.policyVersionId,
    subjectRef: input.subjectRef,
    subjectType: input.subjectType,
    inputsHash,
    inputs: input.inputs as any,
    result: input.result,
    reasons: input.reasons as any,
    requiredActions: input.requiredActions as any,
    signature,
    signedBy: 'system',
    signedAt: new Date(),
  }).returning();

  // Log to audit trail
  try {
    await auditService.log({
      orgId: input.orgId,
      actorId: input.inputs.fromInvestorId || input.inputs.toInvestorId || 'system',
      actorType: input.inputs.fromInvestorId || input.inputs.toInvestorId ? 'user' : 'system',
      action: input.result === 'allow' ? 'decision_approved' : 'decision_rejected',
      resourceType: 'decision',
      resourceId: decision.id,
      description: `${input.type} decision: ${input.result}`,
      metadata: {
        decisionType: input.type,
        result: input.result,
        policyVersionId: input.policyVersionId,
        reasons: input.reasons,
        inputsHash: inputsHash,
        decisionHash: decisionHash,
        subjectRef: input.subjectRef,
        subjectType: input.subjectType,
      },
    });
  } catch (auditError) {
    // Log audit failure but don't fail the decision
    logger.error('Failed to log compliance decision to audit trail', { error: auditError as Error });
  }

  return {
    id: decision.id,
    type: decision.type as DecisionType,
    result: decision.result as DecisionResult,
    reasons: decision.reasons as unknown as DecisionReason[],
    requiredActions: decision.requiredActions as unknown as string[] || [],
    inputsHash: decision.inputsHash,
    policyVersionId: decision.policyVersionId || undefined,
    signature: decision.signature || undefined,
    createdAt: decision.createdAt!,
  };
}

/**
 * Compute a deterministic hash of the decision for receipt linkage
 */
function computeDecisionHash(input: CreateDecisionInput, inputsHash: string): string {
  const payload = {
    type: input.type,
    result: input.result,
    reasons: input.reasons.map(r => r.code),
    inputsHash,
    policyVersionId: input.policyVersionId || null,
    subjectRef: input.subjectRef,
    subjectType: input.subjectType,
  };

  return createHash('sha256')
    .update(canonicalJsonStringify(payload))
    .digest('hex');
}

export async function getDecision(id: string, orgId: string): Promise<DecisionOutput> {
  const decision = await db.query.decisions.findFirst({
    where: and(eq(decisions.id, id), eq(decisions.orgId, orgId)),
  });

  if (!decision) {
    throw new NotFoundError('Decision not found');
  }

  return {
    id: decision.id,
    type: decision.type as DecisionType,
    result: decision.result as DecisionResult,
    reasons: decision.reasons as unknown as DecisionReason[],
    requiredActions: decision.requiredActions as unknown as string[] || [],
    inputsHash: decision.inputsHash,
    policyVersionId: decision.policyVersionId || undefined,
    signature: decision.signature || undefined,
    createdAt: decision.createdAt!,
  };
}

export async function listDecisions(orgId: string, params: {
  type?: string;
  result?: string;
  subjectRef?: string;
  limit?: number;
  offset?: number;
} = {}) {
  const { type, result, subjectRef, limit = 50, offset = 0 } = params;

  const conditions = [eq(decisions.orgId, orgId)];
  if (type) conditions.push(eq(decisions.type, type));
  if (result) conditions.push(eq(decisions.result, result));
  if (subjectRef) conditions.push(eq(decisions.subjectRef, subjectRef));

  return db.select()
    .from(decisions)
    .where(and(...conditions))
    .orderBy(desc(decisions.createdAt))
    .limit(limit)
    .offset(offset);
}

// ============================================================================
// Decision Signing — delegates to ISigningService (see signing/signing.service.ts)
// ============================================================================

async function signDecisionAsync(payload: object): Promise<string> {
  const service = getSigningService();
  return service.sign(canonicalJsonStringify(payload));
}

export async function verifyDecisionSignature(payload: object, signature: string): Promise<boolean> {
  const service = getSigningService();
  return service.verify(canonicalJsonStringify(payload), signature);
}

// ============================================================================
// Default Ruleset (UAE/Dubai compliant)
// ============================================================================

// ============================================================================
// KYC Operations
// ============================================================================

export async function configureKYC(input: {
  orgId: string;
  provider: string;
  region: string;
  level?: string;
  webhookUrl?: string;
}) {
  const { orgId, provider, region, level, webhookUrl } = input;

  // Store KYC config as a compliance policy with type metadata
  const config = {
    id: randomUUID(),
    provider,
    region,
    level: level || 'standard',
    webhookUrl,
    status: 'active' as const,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Emit configuration event
  await db.insert(eventBusQueue).values({
    orgId,
    topic: 'compliance.kyc.configured',
    eventId: `evt_${randomUUID().replace(/-/g, '')}`,
    payload: { provider, region, level: config.level } as any,
    trace: { timestamp: new Date() } as any,
    status: 'pending',
  });

  return config;
}

export async function initiateKYCVerification(investorId: string, orgId: string) {
  const investor = await db.query.investors.findFirst({
    where: and(eq(investors.id, investorId), eq(investors.orgId, orgId)),
  });

  if (!investor) {
    throw new NotFoundError('Investor not found');
  }

  const session = {
    sessionId: randomUUID(),
    investorId,
    provider: 'configured', // Would read from org KYC config in production
    status: 'pending' as const,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24h expiry
  };

  // Emit verification initiated event
  await db.insert(eventBusQueue).values({
    orgId,
    topic: 'compliance.kyc.verification_initiated',
    eventId: `evt_${randomUUID().replace(/-/g, '')}`,
    payload: { investorId, sessionId: session.sessionId } as any,
    trace: { timestamp: new Date() } as any,
    status: 'pending',
  });

  return session;
}

export async function getKYCVerificationStatus(investorId: string, orgId: string) {
  const investor = await db.query.investors.findFirst({
    where: and(eq(investors.id, investorId), eq(investors.orgId, orgId)),
  });

  if (!investor) {
    throw new NotFoundError('Investor not found');
  }

  return {
    investorId,
    status: investor.status === 'active' ? 'approved' : 'pending',
    provider: 'configured',
    level: 'standard',
    verifiedAt: investor.status === 'active' ? (investor.updatedAt?.toISOString() || new Date().toISOString()) : undefined,
    lastCheckedAt: new Date().toISOString(),
  };
}

export async function freezeInvestor(investorId: string, orgId: string, reason: string) {
  const investor = await db.query.investors.findFirst({
    where: and(eq(investors.id, investorId), eq(investors.orgId, orgId)),
  });

  if (!investor) {
    throw new NotFoundError('Investor not found');
  }

  await db.update(investors)
    .set({
      status: 'frozen',
      metadata: {
        ...(investor.metadata as Record<string, unknown> || {}),
        frozenReason: reason,
        frozenAt: new Date().toISOString(),
      },
      updatedAt: new Date(),
    })
    .where(eq(investors.id, investorId));

  // Emit freeze event
  await db.insert(eventBusQueue).values({
    orgId,
    topic: 'compliance.kyc.investor_frozen',
    eventId: `evt_${randomUUID().replace(/-/g, '')}`,
    payload: { investorId, reason } as any,
    trace: { timestamp: new Date() } as any,
    status: 'pending',
  });

  return {
    investorId,
    frozen: true,
    reason,
    frozenAt: new Date().toISOString(),
    frozenBy: `org:${orgId}`,
  };
}

export async function unfreezeInvestor(investorId: string, orgId: string) {
  const investor = await db.query.investors.findFirst({
    where: and(eq(investors.id, investorId), eq(investors.orgId, orgId)),
  });

  if (!investor) {
    throw new NotFoundError('Investor not found');
  }

  await db.update(investors)
    .set({
      status: 'active',
      metadata: {
        ...(investor.metadata as Record<string, unknown> || {}),
        unfrozenAt: new Date().toISOString(),
      },
      updatedAt: new Date(),
    })
    .where(eq(investors.id, investorId));

  // Emit unfreeze event
  await db.insert(eventBusQueue).values({
    orgId,
    topic: 'compliance.kyc.investor_unfrozen',
    eventId: `evt_${randomUUID().replace(/-/g, '')}`,
    payload: { investorId } as any,
    trace: { timestamp: new Date() } as any,
    status: 'pending',
  });

  return {
    investorId,
    frozen: false,
    unfrozenAt: new Date().toISOString(),
    unfrozenBy: `org:${orgId}`,
  };
}

// ============================================================================
// Default Ruleset (UAE/Dubai compliant)
// ============================================================================

export function getDefaultRuleset(): Ruleset {
  return {
    version: 1,
    rules: [
      {
        id: 'kyc_required',
        type: 'require',
        field: 'investor.kycStatus',
        op: 'eq',
        value: 'approved',
        code: 'KYC_REQUIRED',
        message: 'Investor KYC must be approved',
      },
      {
        id: 'sanctions_clear',
        type: 'require',
        field: 'investor.sanctions',
        op: 'eq',
        value: 'clear',
        code: 'SANCTIONS_BLOCKED',
        message: 'Investor is on sanctions list',
      },
      {
        id: 'token_active',
        type: 'require',
        field: 'token.status',
        op: 'eq',
        value: 'active',
        code: 'TOKEN_NOT_ACTIVE',
        message: 'Token must be in active status',
      },
      {
        id: 'dld_no_dispute',
        type: 'require',
        field: 'asset.dld.flags',
        op: 'not_contains',
        value: 'dispute',
        code: 'DLD_DISPUTE',
        message: 'Asset is flagged as dispute at DLD',
      },
      {
        id: 'dld_no_lien',
        type: 'require',
        field: 'asset.dld.flags',
        op: 'not_contains',
        value: 'lien',
        code: 'DLD_LIEN',
        message: 'Asset has a lien registered at DLD',
      },
      {
        id: 'dld_not_locked',
        type: 'require',
        field: 'asset.dld.flags',
        op: 'not_contains',
        value: 'transfer_locked',
        code: 'DLD_TRANSFER_LOCKED',
        message: 'Asset transfers are locked at DLD',
      },
      {
        id: 'lockup_elapsed',
        type: 'require',
        field: 'lockup.elapsed',
        op: 'eq',
        value: true,
        code: 'LOCKUP_PERIOD_ACTIVE',
        message: 'Tokens are still within the lockup period and cannot be transferred',
      },
      {
        id: 'whitelist_sender',
        type: 'require',
        field: 'whitelist.senderWhitelisted',
        op: 'eq',
        value: true,
        code: 'SENDER_NOT_WHITELISTED',
        message: 'Sender wallet is not on the transfer whitelist',
      },
      {
        id: 'whitelist_recipient',
        type: 'require',
        field: 'whitelist.recipientWhitelisted',
        op: 'eq',
        value: true,
        code: 'RECIPIENT_NOT_WHITELISTED',
        message: 'Recipient wallet is not on the transfer whitelist',
      },
    ],
    actions: {
      onDeny: ['log', 'webhook'],
      onAllow: ['permit_or_allowlist'],
    },
  };
}
