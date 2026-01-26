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
