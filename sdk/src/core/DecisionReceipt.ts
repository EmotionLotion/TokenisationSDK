/**
 * DecisionReceipt - Immutable audit trail for compliance decisions
 *
 * Every compliance decision generates a receipt that can be cryptographically
 * verified. Receipts form a chain where each receipt references the previous
 * one, creating an immutable audit trail.
 */

import { createHash, createSign, createVerify, generateKeyPairSync } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import type { PolicyDecision, ComplianceAction, ComplianceContext } from './types.js';
import { hashPolicy } from './PolicyHash.js';
import type { ACEConsensusInfo } from './interfaces.js';

// Re-export for consumers who import from DecisionReceipt
export type { ACEConsensusInfo };

// ============================================================================
// PDR (Policy Decision Record) TYPES - CCID-Compatible
// ============================================================================

/**
 * DON Signature - Individual node signature in DON consensus
 */
export interface DONSignature {
  /** Node address/identifier */
  nodeAddress: string;
  /** Signature bytes (hex encoded) */
  signature: string;
  /** Signing timestamp */
  timestamp: string;
}

/**
 * DON Consensus Proof - Cryptographic proof of DON consensus
 */
export interface DONConsensusProof {
  /** Request ID that was processed */
  requestId: string;
  /** Number of nodes that participated */
  nodeCount: number;
  /** Required threshold for consensus */
  threshold: number;
  /** Individual node signatures */
  signatures: DONSignature[];
  /** Aggregated multi-sig (if available) */
  aggregatedSignature?: string;
  /** Block number when consensus was reached */
  blockNumber: number;
  /** Block hash for reference */
  blockHash: string;
  /** Transaction hash that fulfilled the request */
  transactionHash?: string;
}

/**
 * CCID Credential Schema Reference
 * Compatible with Chainlink Credential Interoperability Definition
 */
export interface CCIDSchemaRef {
  /** Schema identifier (e.g., "ccid:schema:transfer-compliance:v1") */
  schemaId: string;
  /** Schema version */
  version: string;
  /** Schema registry URL */
  registryUrl?: string;
  /** Hash of schema definition for verification */
  schemaHash?: string;
}

/**
 * Policy Module Evaluation Result
 * Matches the on-chain PolicyResult structure
 */
export interface PolicyModuleResult {
  /** Module address that evaluated the policy */
  moduleAddress: string;
  /** Module name */
  moduleName: string;
  /** Whether the policy check passed */
  allowed: boolean;
  /** Policy identifier */
  policyId: string;
  /** Specific rule that was triggered (if any) */
  ruleId?: string;
  /** Human-readable reason for the decision */
  reason: string;
  /** Evaluation timestamp */
  timestamp: number;
  /** Cryptographic proof of evaluation (abi-encoded) */
  proof: string;
}

/**
 * PolicyDecisionRecord (PDR) - CCID-Compatible Decision Record
 *
 * A PDR is a signed attestation that can be verified by:
 * 1. External auditors
 * 2. DeFi protocols (Aave, Uniswap, etc.)
 * 3. Regulatory bodies
 * 4. Cross-chain verification systems
 *
 * It mirrors the structure returned by the Chainlink DON so that
 * any party can independently verify the decision against the DON.
 */
export interface PolicyDecisionRecord {
  /** Unique PDR identifier (matches ACE attestation ID if available) */
  pdrId: string;

  // === Core Decision Data ===
  /** The compliance action evaluated */
  action: ComplianceAction;
  /** Decision result */
  result: 'ALLOW' | 'DENY' | 'CONDITIONAL';
  /** Policy version used */
  policyVersion: string;
  /** SHA-256 hash of the complete policy configuration */
  policyHash: string;

  // === DON Consensus Proof ===
  /** DON consensus proof (null if local evaluation only) */
  donProof: DONConsensusProof | null;
  /** ACE attestation ID from Chainlink DON */
  aceAttestationId?: string;

  // === Policy Module Results ===
  /** Results from individual on-chain policy modules */
  policyModuleResults: PolicyModuleResult[];
  /** Aggregate policy hash from PolicyModuleRegistry */
  aggregatePolicyHash?: string;

  // === CCID Compatibility ===
  /** CCID schema reference for DeFi composability */
  ccidSchema: CCIDSchemaRef;
  /** Whether this PDR is CCID-compliant */
  ccidCompliant: boolean;

  // === Subject Information ===
  /** Type of subject */
  subjectType: 'asset' | 'party' | 'transfer';
  /** Subject identifier (address or asset ID) */
  subjectId: string;
  /** Actor who initiated the action */
  actorId: string;
  /** Recipient (for transfers) */
  recipientId?: string;
  /** Token address (for token operations) */
  tokenAddress?: string;
  /** Amount (for token operations) */
  amount?: string;

  // === Blockchain Reference ===
  /** Chain ID where the decision was recorded */
  chainId: number;
  /** Block number at time of decision */
  blockNumber?: number;
  /** Block timestamp */
  blockTimestamp?: number;

  // === Timestamps ===
  /** When the PDR was created */
  createdAt: string;
  /** When the PDR expires (based on attestation validity) */
  validUntil: string;

  // === Cryptographic Integrity ===
  /** SHA-256 hash of PDR content (excluding signature) */
  contentHash: string;
  /** RSA-SHA256 signature of the content hash */
  signature: string;

  // === Audit Trail ===
  /** Previous PDR hash for chain linkage */
  previousPdrHash?: string;
  /** Human-readable summary */
  summary: string;
  /** Denial reasons */
  reasons: string[];
  /** Any warnings */
  warnings: string[];
}

/**
 * PDR Verification Result
 */
export interface PDRVerificationResult {
  /** Overall validity */
  valid: boolean;
  /** Local signature verification */
  signatureValid: boolean;
  /** Content hash matches */
  contentHashValid: boolean;
  /** DON consensus proof is valid (if present) */
  donProofValid: boolean;
  /** Policy module proofs are valid */
  policyProofsValid: boolean;
  /** Chain linkage is valid */
  chainValid: boolean;
  /** CCID compliance status */
  ccidCompliant: boolean;
  /** Issues found */
  issues: string[];
}

// ============================================================================
// TYPES
// ============================================================================

/**
 * DecisionReceipt - Immutable record of a compliance decision
 */
export interface DecisionReceipt {
  /** Unique receipt identifier */
  id: string;
  /** Reference to the PolicyDecision this receipt is for */
  decisionId: string;
  /** The action that was evaluated */
  action: ComplianceAction;
  /** The result of the evaluation */
  result: 'ALLOW' | 'DENY' | 'CONDITIONAL';

  // Provenance
  /** ISO 8601 timestamp of when the receipt was issued */
  issuedAt: string;
  /** System identifier that issued the receipt */
  issuedBy: string;

  // Policy reference
  /** Version of the policy used */
  policyVersion: string;
  /** SHA-256 hash of the policy content */
  policyHash: string;

  // Decision hash for verification
  /** SHA-256 hash of the decision inputs + output */
  decisionHash: string;
  /** Hash of the previous receipt in the chain (for chain linkage) */
  previousReceiptHash?: string;

  // Context
  /** Type of subject (asset, party, or transfer) */
  subjectType: 'asset' | 'party' | 'transfer';
  /** Identifier of the subject */
  subjectId: string;
  /** Identifier of the actor who triggered the action */
  actorId: string;

  // Signature
  /** RSA-SHA256 signature of the receipt */
  signature: string;

  // Human-readable
  /** Summary of the decision for display */
  summary: string;
  /** Reasons for denial (if denied) */
  reasons: string[];

  // ACE (Automated Compliance Engine) fields
  /** ACE attestation ID if decision was made via Chainlink DON */
  aceAttestationId?: string;
  /** ACE consensus information for decentralized compliance verification */
  aceConsensusInfo?: ACEConsensusInfo;
  /** CCID schema ID for DeFi composability */
  aceSchemaId?: string;
}

/**
 * ReceiptVerificationResult - Result of verifying a receipt
 */
export interface ReceiptVerificationResult {
  /** Overall validity */
  valid: boolean;
  /** Signature verification passed */
  signatureValid: boolean;
  /** Decision hash matches */
  hashValid: boolean;
  /** Chain linkage is valid */
  chainValid: boolean;
  /** Policy hash matches expected version */
  policyHashValid: boolean;
  /** Any issues found during verification */
  issues: string[];
}

// ============================================================================
// KEY MANAGEMENT
// ============================================================================

/**
 * In-memory key pair for signing/verification
 * In production, this would be stored in HSM/KMS
 */
let keyPair: { privateKey: string; publicKey: string } | null = null;

function getKeyPair(): { privateKey: string; publicKey: string } {
  if (!keyPair) {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    keyPair = { privateKey, publicKey };
  }
  return keyPair;
}

/**
 * Set custom key pair (for testing or external key management)
 */
export function setKeyPair(privateKey: string, publicKey: string): void {
  keyPair = { privateKey, publicKey };
}

/**
 * Get the public key for external verification
 */
export function getPublicKey(): string {
  return getKeyPair().publicKey;
}

// ============================================================================
// HASHING FUNCTIONS
// ============================================================================

/**
 * Create a deterministic hash of a decision
 */
export function hashDecision(
  decision: PolicyDecision,
  context: ComplianceContext
): string {
  const payload = {
    decisionId: decision.id,
    action: decision.action,
    result: decision.result,
    violations: decision.violations,
    warnings: decision.warnings,
    policyVersion: decision.policyVersion,
    policyHash: decision.policyHash,
    evaluatedAt: decision.evaluatedAt,
    context: {
      assetId: context.assetId,
      actorId: context.actorId,
      recipientId: context.recipientId,
      amount: context.amount,
    },
  };

  // Deterministic serialization
  const normalized = JSON.stringify(payload, Object.keys(payload).sort());
  return createHash('sha256').update(normalized).digest('hex');
}

/**
 * Create a hash of a receipt for chain linkage
 */
export function hashReceipt(receipt: Omit<DecisionReceipt, 'signature'>): string {
  const payload = {
    id: receipt.id,
    decisionId: receipt.decisionId,
    action: receipt.action,
    result: receipt.result,
    issuedAt: receipt.issuedAt,
    issuedBy: receipt.issuedBy,
    policyVersion: receipt.policyVersion,
    policyHash: receipt.policyHash,
    decisionHash: receipt.decisionHash,
    previousReceiptHash: receipt.previousReceiptHash,
    subjectType: receipt.subjectType,
    subjectId: receipt.subjectId,
    actorId: receipt.actorId,
    summary: receipt.summary,
    reasons: receipt.reasons,
  };

  const normalized = JSON.stringify(payload, Object.keys(payload).sort());
  return createHash('sha256').update(normalized).digest('hex');
}

// ============================================================================
// SIGNING FUNCTIONS
// ============================================================================

/**
 * Sign a receipt with the private key
 */
export function signReceipt(receipt: Omit<DecisionReceipt, 'signature'>): string {
  const { privateKey } = getKeyPair();
  const hash = hashReceipt(receipt);

  const sign = createSign('RSA-SHA256');
  sign.update(hash);
  return sign.sign(privateKey, 'base64');
}

/**
 * Verify a receipt's signature
 */
export function verifyReceiptSignature(receipt: DecisionReceipt): boolean {
  const { publicKey } = getKeyPair();
  const { signature, ...receiptWithoutSignature } = receipt;

  const hash = hashReceipt(receiptWithoutSignature);

  const verify = createVerify('RSA-SHA256');
  verify.update(hash);

  try {
    return verify.verify(publicKey, signature, 'base64');
  } catch {
    return false;
  }
}

// ============================================================================
// RECEIPT CREATION
// ============================================================================

/**
 * Create a decision receipt from a policy decision and context
 */
export function createReceipt(
  decision: PolicyDecision,
  context: ComplianceContext,
  options?: {
    previousReceiptHash?: string;
    issuedBy?: string;
  }
): DecisionReceipt {
  const id = uuidv4();
  const issuedAt = new Date().toISOString();
  const issuedBy = options?.issuedBy || 'compliance-engine';

  // Determine subject type and ID
  const subjectType: 'asset' | 'party' | 'transfer' = context.recipientId
    ? 'transfer'
    : context.assetId
      ? 'asset'
      : 'party';
  const subjectId = context.assetId || context.actorId;

  // Create human-readable summary
  const summary = createSummary(decision, context);

  // Extract denial reasons
  const reasons = decision.violations.map((v) => v.message);

  // Create receipt without signature
  const receiptWithoutSignature: Omit<DecisionReceipt, 'signature'> = {
    id,
    decisionId: decision.id,
    action: decision.action,
    result: decision.result,
    issuedAt,
    issuedBy,
    policyVersion: decision.policyVersion,
    policyHash: decision.policyHash,
    decisionHash: hashDecision(decision, context),
    previousReceiptHash: options?.previousReceiptHash,
    subjectType,
    subjectId,
    actorId: context.actorId,
    summary,
    reasons,
  };

  // Sign and return complete receipt
  const signature = signReceipt(receiptWithoutSignature);

  return {
    ...receiptWithoutSignature,
    signature,
  };
}

/**
 * Create a human-readable summary of a decision
 */
function createSummary(decision: PolicyDecision, context: ComplianceContext): string {
  const actionLabels: Record<ComplianceAction, string> = {
    'asset:create': 'Asset creation',
    'asset:verify': 'Asset verification',
    'asset:activate': 'Asset activation',
    'token:mint': 'Token minting',
    'token:transfer': 'Token transfer',
    'token:burn': 'Token burning',
    'party:register': 'Party registration',
  };

  const actionLabel = actionLabels[decision.action] || decision.action;
  const resultLabel = decision.result === 'ALLOW' ? 'allowed' : decision.result === 'DENY' ? 'denied' : 'conditional';

  if (context.recipientId) {
    return `${actionLabel} ${resultLabel}: ${context.actorId} → ${context.recipientId}`;
  }

  return `${actionLabel} ${resultLabel} for ${context.actorId}`;
}

// ============================================================================
// RECEIPT VERIFICATION
// ============================================================================

/**
 * Verify a receipt's integrity and authenticity
 */
export function verifyReceipt(
  receipt: DecisionReceipt,
  options?: {
    expectedPolicyHash?: string;
    previousReceipt?: DecisionReceipt;
  }
): ReceiptVerificationResult {
  const issues: string[] = [];
  let signatureValid = false;
  let hashValid = true;
  let chainValid = true;
  let policyHashValid = true;

  // Verify signature
  try {
    signatureValid = verifyReceiptSignature(receipt);
    if (!signatureValid) {
      issues.push('Invalid signature');
    }
  } catch (error) {
    issues.push(`Signature verification failed: ${error}`);
  }

  // Verify policy hash if expected hash provided
  if (options?.expectedPolicyHash) {
    policyHashValid = receipt.policyHash === options.expectedPolicyHash;
    if (!policyHashValid) {
      issues.push(`Policy hash mismatch: expected ${options.expectedPolicyHash}, got ${receipt.policyHash}`);
    }
  }

  // Verify chain linkage if previous receipt provided
  if (options?.previousReceipt) {
    const expectedPreviousHash = hashReceipt({
      ...options.previousReceipt,
    });

    // Remove signature from the hash input
    const { signature: _sig, ...prevWithoutSig } = options.previousReceipt;
    const actualPreviousHash = hashReceipt(prevWithoutSig);

    if (receipt.previousReceiptHash !== actualPreviousHash) {
      chainValid = false;
      issues.push('Chain linkage invalid: previousReceiptHash does not match previous receipt');
    }
  }

  return {
    valid: signatureValid && hashValid && chainValid && policyHashValid,
    signatureValid,
    hashValid,
    chainValid,
    policyHashValid,
    issues,
  };
}

// ============================================================================
// RECEIPT CHAIN MANAGEMENT
// ============================================================================

/**
 * ReceiptChain - Manages a chain of receipts for audit trail
 */
export class ReceiptChain {
  private receipts: DecisionReceipt[] = [];
  private receiptsBySubject: Map<string, string[]> = new Map();
  private receiptsByAsset: Map<string, string[]> = new Map();

  /**
   * Add a receipt to the chain
   */
  append(receipt: DecisionReceipt): void {
    this.receipts.push(receipt);

    // Index by subject
    const subjectReceipts = this.receiptsBySubject.get(receipt.subjectId) || [];
    subjectReceipts.push(receipt.id);
    this.receiptsBySubject.set(receipt.subjectId, subjectReceipts);

    // Index by asset if applicable
    if (receipt.subjectType === 'asset' || receipt.subjectType === 'transfer') {
      const assetReceipts = this.receiptsByAsset.get(receipt.subjectId) || [];
      assetReceipts.push(receipt.id);
      this.receiptsByAsset.set(receipt.subjectId, assetReceipts);
    }
  }

  /**
   * Get the last receipt in the chain
   */
  getLastReceipt(): DecisionReceipt | undefined {
    return this.receipts[this.receipts.length - 1];
  }

  /**
   * Get the last receipt hash for chain linkage
   */
  getLastReceiptHash(): string | undefined {
    const lastReceipt = this.getLastReceipt();
    if (!lastReceipt) return undefined;

    const { signature: _sig, ...withoutSignature } = lastReceipt;
    return hashReceipt(withoutSignature);
  }

  /**
   * Get a receipt by ID
   */
  getById(receiptId: string): DecisionReceipt | undefined {
    return this.receipts.find((r) => r.id === receiptId);
  }

  /**
   * Get receipts for a subject
   */
  getBySubject(subjectId: string): DecisionReceipt[] {
    const ids = this.receiptsBySubject.get(subjectId) || [];
    return ids
      .map((id) => this.receipts.find((r) => r.id === id))
      .filter((r): r is DecisionReceipt => r !== undefined);
  }

  /**
   * Get receipts for an asset
   */
  getByAsset(assetId: string): DecisionReceipt[] {
    const ids = this.receiptsByAsset.get(assetId) || [];
    return ids
      .map((id) => this.receipts.find((r) => r.id === id))
      .filter((r): r is DecisionReceipt => r !== undefined);
  }

  /**
   * Get all receipts
   */
  getAll(): DecisionReceipt[] {
    return [...this.receipts];
  }

  /**
   * Verify the entire chain integrity
   */
  verifyChain(): { valid: boolean; issues: string[] } {
    const issues: string[] = [];

    for (let i = 0; i < this.receipts.length; i++) {
      const receipt = this.receipts[i];
      const previousReceipt = i > 0 ? this.receipts[i - 1] : undefined;

      const verification = verifyReceipt(receipt, { previousReceipt });

      if (!verification.valid) {
        issues.push(`Receipt ${i + 1} (${receipt.id}): ${verification.issues.join(', ')}`);
      }
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }

  /**
   * Clear all receipts (for testing)
   */
  clear(): void {
    this.receipts = [];
    this.receiptsBySubject.clear();
    this.receiptsByAsset.clear();
  }
}

/**
 * Singleton receipt chain for SDK-wide usage
 */
export const receiptChain = new ReceiptChain();

// ============================================================================
// PDR (Policy Decision Record) FUNCTIONS
// ============================================================================

/**
 * CCID Schema IDs for different compliance actions
 */
export const CCID_SCHEMAS: Record<ComplianceAction, CCIDSchemaRef> = {
  'asset:create': {
    schemaId: 'ccid:schema:asset-creation:v1',
    version: '1.0.0',
    registryUrl: 'https://ccid.chainlink.dev/schemas',
  },
  'asset:verify': {
    schemaId: 'ccid:schema:asset-verification:v1',
    version: '1.0.0',
    registryUrl: 'https://ccid.chainlink.dev/schemas',
  },
  'asset:activate': {
    schemaId: 'ccid:schema:asset-activation:v1',
    version: '1.0.0',
    registryUrl: 'https://ccid.chainlink.dev/schemas',
  },
  'token:mint': {
    schemaId: 'ccid:schema:token-mint:v1',
    version: '1.0.0',
    registryUrl: 'https://ccid.chainlink.dev/schemas',
  },
  'token:transfer': {
    schemaId: 'ccid:schema:transfer-compliance:v1',
    version: '1.0.0',
    registryUrl: 'https://ccid.chainlink.dev/schemas',
  },
  'token:burn': {
    schemaId: 'ccid:schema:token-burn:v1',
    version: '1.0.0',
    registryUrl: 'https://ccid.chainlink.dev/schemas',
  },
  'party:register': {
    schemaId: 'ccid:schema:party-registration:v1',
    version: '1.0.0',
    registryUrl: 'https://ccid.chainlink.dev/schemas',
  },
};

/**
 * Hash PDR content for signature
 */
export function hashPDRContent(pdr: Omit<PolicyDecisionRecord, 'contentHash' | 'signature'>): string {
  const payload = {
    pdrId: pdr.pdrId,
    action: pdr.action,
    result: pdr.result,
    policyVersion: pdr.policyVersion,
    policyHash: pdr.policyHash,
    aceAttestationId: pdr.aceAttestationId,
    donProof: pdr.donProof,
    policyModuleResults: pdr.policyModuleResults,
    aggregatePolicyHash: pdr.aggregatePolicyHash,
    ccidSchema: pdr.ccidSchema,
    subjectType: pdr.subjectType,
    subjectId: pdr.subjectId,
    actorId: pdr.actorId,
    recipientId: pdr.recipientId,
    tokenAddress: pdr.tokenAddress,
    amount: pdr.amount,
    chainId: pdr.chainId,
    blockNumber: pdr.blockNumber,
    createdAt: pdr.createdAt,
    validUntil: pdr.validUntil,
    previousPdrHash: pdr.previousPdrHash,
  };

  const normalized = JSON.stringify(payload, Object.keys(payload).sort());
  return createHash('sha256').update(normalized).digest('hex');
}

/**
 * Sign a PDR
 */
export function signPDR(pdr: Omit<PolicyDecisionRecord, 'signature'>): string {
  const { privateKey } = getKeyPair();
  const hash = pdr.contentHash;

  const sign = createSign('RSA-SHA256');
  sign.update(hash);
  return sign.sign(privateKey, 'base64');
}

/**
 * Verify PDR signature
 */
export function verifyPDRSignature(pdr: PolicyDecisionRecord): boolean {
  const { publicKey } = getKeyPair();

  const verify = createVerify('RSA-SHA256');
  verify.update(pdr.contentHash);

  try {
    return verify.verify(publicKey, pdr.signature, 'base64');
  } catch {
    return false;
  }
}

/**
 * Create a PDR from a policy decision and optional ACE data
 */
export function createPDR(
  decision: PolicyDecision,
  context: ComplianceContext,
  options?: {
    donProof?: DONConsensusProof;
    aceAttestationId?: string;
    policyModuleResults?: PolicyModuleResult[];
    aggregatePolicyHash?: string;
    chainId?: number;
    blockNumber?: number;
    blockTimestamp?: number;
    validUntil?: string;
    previousPdrHash?: string;
  }
): PolicyDecisionRecord {
  const pdrId = options?.aceAttestationId || uuidv4();
  const createdAt = new Date().toISOString();

  // Default validity: 1 hour for local decisions, or from DON attestation
  const validUntil = options?.validUntil ||
    new Date(Date.now() + 3600000).toISOString();

  // Determine subject type
  const subjectType: 'asset' | 'party' | 'transfer' = context.recipientId
    ? 'transfer'
    : context.assetId
      ? 'asset'
      : 'party';
  const subjectId = context.assetId || context.actorId;

  // Get CCID schema for this action
  const ccidSchema = CCID_SCHEMAS[decision.action];

  // Determine CCID compliance
  const ccidCompliant = Boolean(
    options?.donProof &&
    options.donProof.signatures.length >= options.donProof.threshold &&
    ccidSchema
  );

  // Create summary and reasons
  const summary = createPDRSummary(decision, context);
  const reasons = decision.violations.map((v) => v.message);
  const warnings = decision.warnings.map((w) => w.message);

  // Build PDR without signature
  const pdrWithoutSig: Omit<PolicyDecisionRecord, 'contentHash' | 'signature'> = {
    pdrId,
    action: decision.action,
    result: decision.result,
    policyVersion: decision.policyVersion,
    policyHash: decision.policyHash,
    donProof: options?.donProof || null,
    aceAttestationId: options?.aceAttestationId,
    policyModuleResults: options?.policyModuleResults || [],
    aggregatePolicyHash: options?.aggregatePolicyHash,
    ccidSchema,
    ccidCompliant,
    subjectType,
    subjectId,
    actorId: context.actorId,
    recipientId: context.recipientId,
    tokenAddress: context.assetId,
    amount: context.amount?.toString(),
    chainId: options?.chainId || 1,
    blockNumber: options?.blockNumber,
    blockTimestamp: options?.blockTimestamp,
    createdAt,
    validUntil,
    previousPdrHash: options?.previousPdrHash,
    summary,
    reasons,
    warnings,
  };

  // Calculate content hash
  const contentHash = hashPDRContent(pdrWithoutSig);

  const pdrWithHash: Omit<PolicyDecisionRecord, 'signature'> = {
    ...pdrWithoutSig,
    contentHash,
  };

  // Sign and return
  const signature = signPDR(pdrWithHash);

  return {
    ...pdrWithHash,
    signature,
  };
}

/**
 * Create a PDR summary
 */
function createPDRSummary(decision: PolicyDecision, context: ComplianceContext): string {
  const actionLabels: Record<ComplianceAction, string> = {
    'asset:create': 'Asset creation',
    'asset:verify': 'Asset verification',
    'asset:activate': 'Asset activation',
    'token:mint': 'Token minting',
    'token:transfer': 'Token transfer',
    'token:burn': 'Token burning',
    'party:register': 'Party registration',
  };

  const actionLabel = actionLabels[decision.action] || decision.action;
  const resultLabel = decision.result === 'ALLOW' ? 'allowed' : decision.result === 'DENY' ? 'denied' : 'conditional';

  if (context.recipientId) {
    return `PDR: ${actionLabel} ${resultLabel} - ${context.actorId} → ${context.recipientId}`;
  }

  return `PDR: ${actionLabel} ${resultLabel} for ${context.actorId}`;
}

/**
 * Verify a PDR's integrity
 */
export function verifyPDR(
  pdr: PolicyDecisionRecord,
  options?: {
    expectedPolicyHash?: string;
    previousPdr?: PolicyDecisionRecord;
    verifyDONProof?: boolean;
  }
): PDRVerificationResult {
  const issues: string[] = [];
  let signatureValid = false;
  let contentHashValid = true;
  let donProofValid = true;
  let policyProofsValid = true;
  let chainValid = true;

  // Verify signature
  try {
    signatureValid = verifyPDRSignature(pdr);
    if (!signatureValid) {
      issues.push('Invalid PDR signature');
    }
  } catch (error) {
    issues.push(`PDR signature verification failed: ${error}`);
  }

  // Verify content hash
  const { contentHash: _ch, signature: _sig, ...pdrForHash } = pdr;
  const expectedHash = hashPDRContent(pdrForHash);
  contentHashValid = pdr.contentHash === expectedHash;
  if (!contentHashValid) {
    issues.push('Content hash mismatch');
  }

  // Verify policy hash if provided
  if (options?.expectedPolicyHash && pdr.policyHash !== options.expectedPolicyHash) {
    issues.push(`Policy hash mismatch: expected ${options.expectedPolicyHash}`);
  }

  // Verify DON proof if present and requested
  if (pdr.donProof && options?.verifyDONProof !== false) {
    if (pdr.donProof.signatures.length < pdr.donProof.threshold) {
      donProofValid = false;
      issues.push(`Insufficient DON signatures: ${pdr.donProof.signatures.length}/${pdr.donProof.threshold}`);
    }
    // Additional DON signature verification would go here in production
  }

  // Verify policy module proofs
  for (const result of pdr.policyModuleResults) {
    if (!result.proof || result.proof.length === 0) {
      policyProofsValid = false;
      issues.push(`Missing proof from module ${result.moduleName}`);
    }
  }

  // Verify chain linkage
  if (options?.previousPdr) {
    const expectedPrevHash = options.previousPdr.contentHash;
    if (pdr.previousPdrHash !== expectedPrevHash) {
      chainValid = false;
      issues.push('PDR chain linkage invalid');
    }
  }

  // Check CCID compliance
  const ccidCompliant = pdr.ccidCompliant &&
    pdr.donProof !== null &&
    pdr.ccidSchema !== undefined;

  return {
    valid: signatureValid && contentHashValid && donProofValid && policyProofsValid && chainValid,
    signatureValid,
    contentHashValid,
    donProofValid,
    policyProofsValid,
    chainValid,
    ccidCompliant,
    issues,
  };
}

/**
 * Convert a DecisionReceipt to a PDR
 */
export function receiptToPDR(
  receipt: DecisionReceipt,
  decision: PolicyDecision,
  context: ComplianceContext,
  options?: {
    chainId?: number;
    policyModuleResults?: PolicyModuleResult[];
  }
): PolicyDecisionRecord {
  // Build DON proof from ACE data if available
  let donProof: DONConsensusProof | null = null;
  if (receipt.aceConsensusInfo && receipt.aceAttestationId) {
    donProof = {
      requestId: receipt.aceAttestationId,
      nodeCount: receipt.aceConsensusInfo.nodeCount,
      threshold: receipt.aceConsensusInfo.threshold,
      signatures: [], // Would be populated from on-chain data
      blockNumber: 0, // Would be populated from on-chain data
      blockHash: '',
    };
  }

  return createPDR(decision, context, {
    donProof: donProof || undefined,
    aceAttestationId: receipt.aceAttestationId,
    policyModuleResults: options?.policyModuleResults,
    chainId: options?.chainId,
    previousPdrHash: receipt.previousReceiptHash,
  });
}

/**
 * PDR Chain Manager - Manages a chain of PDRs
 */
export class PDRChain {
  private pdrs: PolicyDecisionRecord[] = [];
  private pdrsBySubject: Map<string, string[]> = new Map();

  /**
   * Add a PDR to the chain
   */
  append(pdr: PolicyDecisionRecord): void {
    this.pdrs.push(pdr);

    const subjectPdrs = this.pdrsBySubject.get(pdr.subjectId) || [];
    subjectPdrs.push(pdr.pdrId);
    this.pdrsBySubject.set(pdr.subjectId, subjectPdrs);
  }

  /**
   * Get the last PDR
   */
  getLastPDR(): PolicyDecisionRecord | undefined {
    return this.pdrs[this.pdrs.length - 1];
  }

  /**
   * Get the last PDR content hash for chain linkage
   */
  getLastPDRHash(): string | undefined {
    const lastPdr = this.getLastPDR();
    return lastPdr?.contentHash;
  }

  /**
   * Get a PDR by ID
   */
  getById(pdrId: string): PolicyDecisionRecord | undefined {
    return this.pdrs.find((p) => p.pdrId === pdrId);
  }

  /**
   * Get PDRs for a subject
   */
  getBySubject(subjectId: string): PolicyDecisionRecord[] {
    const ids = this.pdrsBySubject.get(subjectId) || [];
    return ids
      .map((id) => this.pdrs.find((p) => p.pdrId === id))
      .filter((p): p is PolicyDecisionRecord => p !== undefined);
  }

  /**
   * Get all PDRs
   */
  getAll(): PolicyDecisionRecord[] {
    return [...this.pdrs];
  }

  /**
   * Get only CCID-compliant PDRs
   */
  getCCIDCompliant(): PolicyDecisionRecord[] {
    return this.pdrs.filter((p) => p.ccidCompliant);
  }

  /**
   * Verify the entire PDR chain
   */
  verifyChain(): { valid: boolean; issues: string[] } {
    const issues: string[] = [];

    for (let i = 0; i < this.pdrs.length; i++) {
      const pdr = this.pdrs[i];
      const previousPdr = i > 0 ? this.pdrs[i - 1] : undefined;

      const verification = verifyPDR(pdr, { previousPdr });

      if (!verification.valid) {
        issues.push(`PDR ${i + 1} (${pdr.pdrId}): ${verification.issues.join(', ')}`);
      }
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }

  /**
   * Export PDRs for external verification
   */
  export(): PolicyDecisionRecord[] {
    return this.pdrs.map((pdr) => ({ ...pdr }));
  }

  /**
   * Import PDRs and verify chain integrity
   */
  import(pdrs: PolicyDecisionRecord[]): { success: boolean; issues: string[] } {
    const issues: string[] = [];

    for (let i = 0; i < pdrs.length; i++) {
      const pdr = pdrs[i];
      const previousPdr = i > 0 ? pdrs[i - 1] : undefined;

      const verification = verifyPDR(pdr, { previousPdr });
      if (!verification.valid) {
        issues.push(`PDR ${i + 1}: ${verification.issues.join(', ')}`);
      }
    }

    if (issues.length === 0) {
      for (const pdr of pdrs) {
        this.append(pdr);
      }
    }

    return {
      success: issues.length === 0,
      issues,
    };
  }

  /**
   * Clear all PDRs
   */
  clear(): void {
    this.pdrs = [];
    this.pdrsBySubject.clear();
  }
}

/**
 * Singleton PDR chain for SDK-wide usage
 */
export const pdrChain = new PDRChain();
