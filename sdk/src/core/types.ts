/**
 * Core Types for the Tokenisation SDK
 *
 * This module defines the fundamental types and enums used throughout the SDK.
 * The SDK tokenizes Rights (ownership, access, governance) and States (verified behavior, compliance status).
 */

import { z } from 'zod';

// ============================================================================
// LIFECYCLE STATES
// ============================================================================

/**
 * LifecycleState represents the canonical states an asset can be in.
 * The state machine enforces valid transitions between these states.
 *
 * Flow: DRAFT -> PENDING_VERIFICATION -> VERIFIED -> ACTIVE -> [REDEEMED|EXPIRED|BURNED]
 */
export enum LifecycleState {
  /** Initial state - asset definition created but not submitted for verification */
  DRAFT = 'DRAFT',

  /** Asset submitted for verification, awaiting review */
  PENDING_VERIFICATION = 'PENDING_VERIFICATION',

  /** Asset verified by authorized verifier */
  VERIFIED = 'VERIFIED',

  /** Token minted and active on-chain */
  ACTIVE = 'ACTIVE',

  /** Asset frozen due to compliance or legal reasons */
  FROZEN = 'FROZEN',

  /** Asset redeemed (e.g., ticket used, loan repaid) */
  REDEEMED = 'REDEEMED',

  /** Asset validity period expired */
  EXPIRED = 'EXPIRED',

  /** Token burned and asset retired */
  BURNED = 'BURNED',
}

/**
 * Valid state transitions for the lifecycle engine
 */
export const VALID_TRANSITIONS: Record<LifecycleState, LifecycleState[]> = {
  [LifecycleState.DRAFT]: [LifecycleState.PENDING_VERIFICATION],
  [LifecycleState.PENDING_VERIFICATION]: [LifecycleState.VERIFIED, LifecycleState.DRAFT],
  [LifecycleState.VERIFIED]: [LifecycleState.ACTIVE, LifecycleState.DRAFT],
  [LifecycleState.ACTIVE]: [LifecycleState.FROZEN, LifecycleState.REDEEMED, LifecycleState.EXPIRED, LifecycleState.BURNED],
  [LifecycleState.FROZEN]: [LifecycleState.ACTIVE, LifecycleState.BURNED],
  [LifecycleState.REDEEMED]: [LifecycleState.BURNED],
  [LifecycleState.EXPIRED]: [LifecycleState.BURNED],
  [LifecycleState.BURNED]: [], // Terminal state
};

// ============================================================================
// RIGHT TYPES
// ============================================================================

/**
 * RightType categorizes what kind of right is being tokenized.
 * Each type has different semantics and typical use cases.
 */
export enum RightType {
  /** Ownership rights - Real Estate, IP, Game Items, Physical Assets */
  OWNERSHIP = 'OWNERSHIP',

  /** Access rights - Tickets, Memberships, Education Credentials */
  ACCESS = 'ACCESS',

  /** Behavior/Reputation states - Loyalty Points, Driving Scores */
  BEHAVIOR = 'BEHAVIOR',

  /** Verification proofs - Carbon Credits, Supply Chain, Certifications */
  VERIFICATION = 'VERIFICATION',
}

// ============================================================================
// TRANSFERABILITY RULES
// ============================================================================

/**
 * TransferabilityMode defines how a token can be transferred
 */
export enum TransferabilityMode {
  /** Freely transferable to anyone */
  UNRESTRICTED = 'UNRESTRICTED',

  /** Transferable only to whitelisted addresses */
  WHITELIST_ONLY = 'WHITELIST_ONLY',

  /** Non-transferable (soulbound) */
  NON_TRANSFERABLE = 'NON_TRANSFERABLE',

  /** Transferable with compliance checks */
  COMPLIANCE_GATED = 'COMPLIANCE_GATED',
}

// ============================================================================
// ZOD SCHEMAS
// ============================================================================

/**
 * Jurisdiction schema - defines legal wrapper for the right
 */
export const JurisdictionSchema = z.object({
  /** ISO country code */
  countryCode: z.string().length(2),

  /** Regulatory framework (e.g., 'UAE_VARA', 'US_SEC', 'EU_MIFID') */
  regulatoryFramework: z.string().optional(),

  /** Whether accredited investor status is required */
  accreditedOnly: z.boolean().default(false),

  /** Blocked jurisdictions (ISO country codes) */
  blockedJurisdictions: z.array(z.string().length(2)).default([]),
});

export type Jurisdiction = z.infer<typeof JurisdictionSchema>;

/**
 * ValidityPeriod schema - defines when the right is valid
 */
export const ValidityPeriodSchema = z.object({
  /** Start time (ISO 8601) */
  startTime: z.string().datetime().optional(),

  /** End time (ISO 8601) */
  endTime: z.string().datetime().optional(),

  /** Duration in seconds (alternative to endTime) */
  durationSeconds: z.number().positive().optional(),

  /** Whether validity is perpetual */
  isPerpetual: z.boolean().default(false),
});

export type ValidityPeriod = z.infer<typeof ValidityPeriodSchema>;

/**
 * TransferabilityRules schema - defines transfer restrictions
 */
export const TransferabilityRulesSchema = z.object({
  /** Transfer mode */
  mode: z.nativeEnum(TransferabilityMode),

  /** Lock-up period in seconds */
  lockupPeriodSeconds: z.number().nonnegative().default(0),

  /** Maximum number of holders */
  maxHolders: z.number().positive().optional(),

  /** Minimum holding amount */
  minimumHoldingAmount: z.string().optional(), // BigNumber as string

  /** Whether KYC is required for transfers */
  requireKyc: z.boolean().default(false),
});

export type TransferabilityRules = z.infer<typeof TransferabilityRulesSchema>;

/**
 * RightModel schema - Universal wrapper for all tokenizable rights
 * This is the core data model that can represent any asset type.
 */
export const RightModelSchema = z.object({
  /** Unique identifier for this right */
  id: z.string().uuid(),

  /** Type of right being tokenized */
  rightType: z.nativeEnum(RightType),

  /** Human-readable name */
  name: z.string().min(1).max(256),

  /** Description of the right */
  description: z.string().max(4096).optional(),

  /** Current lifecycle state */
  state: z.nativeEnum(LifecycleState).default(LifecycleState.DRAFT),

  /** Jurisdiction configuration */
  jurisdiction: JurisdictionSchema,

  /** Validity period */
  validityPeriod: ValidityPeriodSchema,

  /** Transferability rules */
  transferabilityRules: TransferabilityRulesSchema,

  /** Asset-specific metadata (flexible schema) */
  metadata: z.record(z.unknown()).default({}),

  /** Creation timestamp */
  createdAt: z.string().datetime(),

  /** Last update timestamp */
  updatedAt: z.string().datetime(),

  /** Version for optimistic locking */
  version: z.number().nonnegative().default(0),
});

export type RightModel = z.infer<typeof RightModelSchema>;

// ============================================================================
// EVENT TYPES
// ============================================================================

/**
 * EventType for the event store
 */
export enum EventType {
  ASSET_CREATED = 'ASSET_CREATED',
  ASSET_UPDATED = 'ASSET_UPDATED',
  STATE_CHANGED = 'STATE_CHANGED',
  VERIFICATION_SUBMITTED = 'VERIFICATION_SUBMITTED',
  VERIFICATION_COMPLETED = 'VERIFICATION_COMPLETED',
  TOKEN_MINTED = 'TOKEN_MINTED',
  TOKEN_TRANSFERRED = 'TOKEN_TRANSFERRED',
  TOKEN_BURNED = 'TOKEN_BURNED',
  COMPLIANCE_CHECK = 'COMPLIANCE_CHECK',
  POLICY_EVALUATED = 'POLICY_EVALUATED',
  // Compliance-first architecture events
  COMPLIANCE_DECISION = 'COMPLIANCE_DECISION',
  POLICY_DECISION_ALLOWED = 'POLICY_DECISION_ALLOWED',
  POLICY_DECISION_DENIED = 'POLICY_DECISION_DENIED',
}

// ============================================================================
// COMPLIANCE-FIRST TYPES
// ============================================================================

/**
 * ComplianceAction - All actions that require compliance evaluation
 * Every operation must be evaluated by the ComplianceEngine before execution.
 */
export enum ComplianceAction {
  /** Creating a new asset */
  ASSET_CREATE = 'asset:create',
  /** Verifying an asset */
  ASSET_VERIFY = 'asset:verify',
  /** Activating an asset for trading */
  ASSET_ACTIVATE = 'asset:activate',
  /** Minting new tokens */
  TOKEN_MINT = 'token:mint',
  /** Transferring tokens between parties */
  TOKEN_TRANSFER = 'token:transfer',
  /** Burning tokens */
  TOKEN_BURN = 'token:burn',
  /** Registering a new party */
  PARTY_REGISTER = 'party:register',
}

/**
 * PolicyViolation - Details about why a policy check failed
 */
export interface PolicyViolation {
  /** Unique violation code for programmatic handling */
  code: string;
  /** Human-readable description of the violation */
  message: string;
  /** Severity level - ERROR can be fixed, CRITICAL is fatal */
  severity: 'ERROR' | 'CRITICAL';
  /** The rule that was violated */
  rule: string;
  /** The specific field that caused the violation (if applicable) */
  field?: string;
}

/**
 * PolicyWarning - Non-blocking warnings from policy evaluation
 */
export interface PolicyWarning {
  /** Warning code */
  code: string;
  /** Warning message */
  message: string;
  /** The rule that generated the warning */
  rule: string;
}

/**
 * PolicyDecision - The result of a compliance evaluation
 * This is generated by the ComplianceEngine for every action.
 */
export interface PolicyDecision {
  /** Unique decision identifier */
  id: string;
  /** The action that was evaluated */
  action: ComplianceAction;
  /** The result of the evaluation */
  result: 'ALLOW' | 'DENY' | 'CONDITIONAL';
  /** Conditions that must be met (for CONDITIONAL results) */
  conditions?: string[];
  /** List of policy violations that caused a DENY */
  violations: PolicyViolation[];
  /** Non-blocking warnings */
  warnings: PolicyWarning[];
  /** Version of the policy used for evaluation */
  policyVersion: string;
  /** SHA-256 hash of the policy content */
  policyHash: string;
  /** ISO 8601 timestamp of when the decision was made */
  evaluatedAt: string;
}

/**
 * ComplianceContext - Context data for compliance evaluation
 */
export interface ComplianceContext {
  /** The asset being operated on */
  assetId?: string;
  /** The full asset model (if available) */
  asset?: RightModel;
  /** The actor performing the action */
  actorId: string;
  /** The recipient (for mint/transfer operations) */
  recipientId?: string;
  /** The amount (for token operations) */
  amount?: string;
  /** Additional metadata for evaluation */
  metadata?: Record<string, unknown>;
}

/**
 * Base event schema
 */
export const BaseEventSchema = z.object({
  /** Unique event ID */
  id: z.string().uuid(),

  /** Event type */
  type: z.nativeEnum(EventType),

  /** Related asset ID */
  assetId: z.string().uuid(),

  /** Event timestamp */
  timestamp: z.string().datetime(),

  /** Actor who triggered the event */
  actorId: z.string(),

  /** Event payload */
  payload: z.record(z.unknown()),

  /** Event version for schema evolution */
  eventVersion: z.number().default(1),
});

export type BaseEvent = z.infer<typeof BaseEventSchema>;

// ============================================================================
// RESULT TYPES
// ============================================================================

/**
 * Generic result type for operations that can fail
 */
export type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E };

/**
 * Create a success result
 */
export function ok<T>(data: T): Result<T, never> {
  return { success: true, data };
}

/**
 * Create a failure result
 */
export function err<E>(error: E): Result<never, E> {
  return { success: false, error };
}

// ============================================================================
// TRANSFER CONTEXT
// ============================================================================

/**
 * Context for transfer operations
 */
export const TransferContextSchema = z.object({
  from: z.string(),
  to: z.string(),
  amount: z.string(), // BigNumber as string
  assetId: z.string().uuid(),
  timestamp: z.string().datetime(),
  metadata: z.record(z.unknown()).optional(),
});

export type TransferContext = z.infer<typeof TransferContextSchema>;
