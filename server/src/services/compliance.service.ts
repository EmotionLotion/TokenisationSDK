import { db, schema } from '../config/database.js';
import { eq, and, desc } from 'drizzle-orm';
import { createHash, createSign, createVerify, generateKeyPairSync } from 'crypto';
import { NotFoundError, ValidationError, AppError } from '../middleware/errorHandler.js';

const { policies, policyVersions, decisions, investors, dldTitles, tokens } = schema;

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
  value: unknown;
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
      decisionInput.investor = {
        kycStatus: fromInvestor.status === 'active' ? 'approved' : 'pending',
        classification: fromInvestor.classification,
        jurisdiction: fromInvestor.jurisdiction,
        accreditedStatus: fromInvestor.accreditedStatus || 'unknown',
        sanctions: 'clear', // Would be fetched from sanctions screening
      };
    }
  }

  // Get DLD data if available
  if (token.assetId) {
    const dldTitle = await db.query.dldTitles.findFirst({
      where: eq(dldTitles.assetId, token.assetId),
    });
    if (dldTitle) {
      decisionInput.asset = {
        dld: {
          flags: dldTitle.flags || [],
          status: dldTitle.status,
        },
      };
    }
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
      decisionInput.investor = {
        kycStatus: toInvestor.status === 'active' ? 'approved' : 'pending',
        classification: toInvestor.classification,
        jurisdiction: toInvestor.jurisdiction,
        accreditedStatus: toInvestor.accreditedStatus || 'unknown',
        sanctions: 'clear',
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
    .update(JSON.stringify(input.inputs, Object.keys(input.inputs).sort()))
    .digest('hex');

  // Create signature over decision (in production, use HSM)
  const decisionPayload = {
    type: input.type,
    result: input.result,
    reasons: input.reasons,
    inputsHash,
    timestamp: new Date().toISOString(),
  };

  const signature = signDecision(decisionPayload);

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
// Decision Signing (Mock - in production use HSM)
// ============================================================================

// In production, keys would be stored in HSM/KMS
let signingKeyPair: { privateKey: string; publicKey: string } | null = null;

function getSigningKeyPair() {
  if (!signingKeyPair) {
    // Generate key pair (in production, load from HSM/KMS)
    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    signingKeyPair = { privateKey, publicKey };
  }
  return signingKeyPair;
}

function signDecision(payload: object): string {
  const { privateKey } = getSigningKeyPair();
  const sign = createSign('RSA-SHA256');
  sign.update(JSON.stringify(payload));
  return sign.sign(privateKey, 'base64');
}

export function verifyDecisionSignature(payload: object, signature: string): boolean {
  const { publicKey } = getSigningKeyPair();
  const verify = createVerify('RSA-SHA256');
  verify.update(JSON.stringify(payload));
  return verify.verify(publicKey, signature, 'base64');
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
    ],
    actions: {
      onDeny: ['log', 'webhook'],
      onAllow: ['permit_or_allowlist'],
    },
  };
}
