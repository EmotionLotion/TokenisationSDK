/**
 * Party Model
 *
 * Represents participants in the tokenization ecosystem.
 * Types: Issuer, Investor, Verifier, Custodian, etc.
 */

import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// PARTY TYPES
// ============================================================================

/**
 * Role a party can have in the ecosystem
 */
export enum PartyRole {
  /** Asset issuer/creator */
  ISSUER = 'ISSUER',

  /** Token investor/holder */
  INVESTOR = 'INVESTOR',

  /** Authorized verifier of evidence */
  VERIFIER = 'VERIFIER',

  /** Asset custodian */
  CUSTODIAN = 'CUSTODIAN',

  /** Regulatory authority */
  REGULATOR = 'REGULATOR',

  /** Transfer agent */
  TRANSFER_AGENT = 'TRANSFER_AGENT',

  /** Oracle data provider */
  ORACLE_PROVIDER = 'ORACLE_PROVIDER',

  /** Platform operator */
  OPERATOR = 'OPERATOR',
}

/**
 * Party type (individual vs organization)
 */
export enum PartyType {
  INDIVIDUAL = 'INDIVIDUAL',
  ORGANIZATION = 'ORGANIZATION',
  DAO = 'DAO',
  TRUST = 'TRUST',
  FUND = 'FUND',
}

/**
 * KYC/AML verification level
 */
export enum VerificationLevel {
  /** No verification */
  NONE = 'NONE',

  /** Basic verification (email/phone) */
  BASIC = 'BASIC',

  /** Standard KYC */
  STANDARD = 'STANDARD',

  /** Enhanced due diligence */
  ENHANCED = 'ENHANCED',

  /** Institutional level */
  INSTITUTIONAL = 'INSTITUTIONAL',
}

/**
 * Accreditation status
 */
export enum AccreditationStatus {
  /** Not accredited */
  NOT_ACCREDITED = 'NOT_ACCREDITED',

  /** Self-certified accredited */
  SELF_CERTIFIED = 'SELF_CERTIFIED',

  /** Verified accredited investor */
  VERIFIED = 'VERIFIED',

  /** Qualified institutional buyer */
  QIB = 'QIB',

  /** Qualified purchaser */
  QP = 'QP',
}

// ============================================================================
// PARTY SCHEMAS
// ============================================================================

/**
 * Wallet/address binding
 */
export const WalletBindingSchema = z.object({
  /** Blockchain address */
  address: z.string(),

  /** Chain ID */
  chainId: z.number(),

  /** Whether this is the primary wallet */
  isPrimary: z.boolean().default(false),

  /** Wallet label */
  label: z.string().optional(),

  /** When the binding was verified */
  verifiedAt: z.string().datetime().optional(),

  /** Verification method (signature, etc.) */
  verificationMethod: z.string().optional(),
});

export type WalletBinding = z.infer<typeof WalletBindingSchema>;

/**
 * KYC verification record
 */
export const KycRecordSchema = z.object({
  /** Verification provider */
  provider: z.string(),

  /** Verification level achieved */
  level: z.nativeEnum(VerificationLevel),

  /** When verification was completed */
  verifiedAt: z.string().datetime(),

  /** When verification expires */
  expiresAt: z.string().datetime().optional(),

  /** Reference ID from provider */
  referenceId: z.string(),

  /** Hash of KYC data (for privacy) */
  dataHash: z.string().optional(),

  /** Countries where KYC is valid */
  validJurisdictions: z.array(z.string().length(2)).default([]),
});

export type KycRecord = z.infer<typeof KycRecordSchema>;

/**
 * Full Party schema
 */
export const PartySchema = z.object({
  /** Unique party identifier */
  id: z.string().uuid(),

  /** Party type */
  type: z.nativeEnum(PartyType),

  /** Roles this party has */
  roles: z.array(z.nativeEnum(PartyRole)).min(1),

  /** Display name */
  name: z.string().min(1).max(256),

  /** Email address */
  email: z.string().email().optional(),

  /** Phone number */
  phone: z.string().optional(),

  /** Primary jurisdiction (ISO country code) */
  jurisdiction: z.string().length(2),

  /** Legal entity identifier (LEI) for organizations */
  legalEntityId: z.string().optional(),

  /** Tax identification number (encrypted/hashed) */
  taxIdHash: z.string().optional(),

  /** Linked wallet addresses */
  wallets: z.array(WalletBindingSchema).default([]),

  /** KYC verification records */
  kycRecords: z.array(KycRecordSchema).default([]),

  /** Current verification level (highest achieved) */
  verificationLevel: z.nativeEnum(VerificationLevel).default(VerificationLevel.NONE),

  /** Accreditation status */
  accreditationStatus: z
    .nativeEnum(AccreditationStatus)
    .default(AccreditationStatus.NOT_ACCREDITED),

  /** Accreditation expiry */
  accreditationExpiry: z.string().datetime().optional(),

  /** Whether party is currently frozen */
  isFrozen: z.boolean().default(false),

  /** Frozen until date */
  frozenUntil: z.string().datetime().optional(),

  /** Freeze reason */
  freezeReason: z.string().optional(),

  /** Blocked jurisdictions for this party */
  blockedJurisdictions: z.array(z.string().length(2)).default([]),

  /** Party-specific compliance flags */
  complianceFlags: z.record(z.boolean()).default({}),

  /** Additional metadata */
  metadata: z.record(z.unknown()).default({}),

  /** Creation timestamp */
  createdAt: z.string().datetime(),

  /** Last update timestamp */
  updatedAt: z.string().datetime(),

  /** Last activity timestamp */
  lastActivityAt: z.string().datetime().optional(),

  /** Version for optimistic locking */
  version: z.number().nonnegative().default(0),
});

export type Party = z.infer<typeof PartySchema>;

// ============================================================================
// PARTY FACTORY
// ============================================================================

/**
 * Parameters for creating a new party
 */
export interface CreatePartyParams {
  type: PartyType;
  roles: PartyRole[];
  name: string;
  email?: string;
  phone?: string;
  jurisdiction: string;
  legalEntityId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Create a new party
 */
export function createParty(params: CreatePartyParams): Party {
  const now = new Date().toISOString();

  const party: Party = {
    id: uuidv4(),
    type: params.type,
    roles: params.roles,
    name: params.name,
    email: params.email,
    phone: params.phone,
    jurisdiction: params.jurisdiction,
    legalEntityId: params.legalEntityId,
    wallets: [],
    kycRecords: [],
    verificationLevel: VerificationLevel.NONE,
    accreditationStatus: AccreditationStatus.NOT_ACCREDITED,
    isFrozen: false,
    blockedJurisdictions: [],
    complianceFlags: {},
    metadata: params.metadata || {},
    createdAt: now,
    updatedAt: now,
    version: 0,
  };

  // Validate
  const result = PartySchema.safeParse(party);
  if (!result.success) {
    throw new Error(`Invalid party: ${result.error.message}`);
  }

  return result.data;
}

/**
 * Add a wallet binding to a party
 */
export function addWallet(party: Party, wallet: WalletBinding): Party {
  // If this is marked as primary, unmark others
  let wallets = party.wallets;
  if (wallet.isPrimary) {
    wallets = wallets.map((w) => ({ ...w, isPrimary: false }));
  }

  return {
    ...party,
    wallets: [...wallets, wallet],
    updatedAt: new Date().toISOString(),
    version: party.version + 1,
  };
}

/**
 * Add KYC record to a party
 */
export function addKycRecord(party: Party, kyc: KycRecord): Party {
  // Update verification level to highest achieved
  const levels = [
    VerificationLevel.NONE,
    VerificationLevel.BASIC,
    VerificationLevel.STANDARD,
    VerificationLevel.ENHANCED,
    VerificationLevel.INSTITUTIONAL,
  ];

  const currentIdx = levels.indexOf(party.verificationLevel);
  const newIdx = levels.indexOf(kyc.level);
  const newLevel = newIdx > currentIdx ? kyc.level : party.verificationLevel;

  return {
    ...party,
    kycRecords: [...party.kycRecords, kyc],
    verificationLevel: newLevel,
    updatedAt: new Date().toISOString(),
    version: party.version + 1,
  };
}

/**
 * Update accreditation status
 */
export function updateAccreditation(
  party: Party,
  status: AccreditationStatus,
  expiryDate?: string
): Party {
  return {
    ...party,
    accreditationStatus: status,
    accreditationExpiry: expiryDate,
    updatedAt: new Date().toISOString(),
    version: party.version + 1,
  };
}

/**
 * Freeze a party
 */
export function freezeParty(party: Party, reason: string, until?: string): Party {
  return {
    ...party,
    isFrozen: true,
    freezeReason: reason,
    frozenUntil: until,
    updatedAt: new Date().toISOString(),
    version: party.version + 1,
  };
}

/**
 * Unfreeze a party
 */
export function unfreezeParty(party: Party): Party {
  return {
    ...party,
    isFrozen: false,
    freezeReason: undefined,
    frozenUntil: undefined,
    updatedAt: new Date().toISOString(),
    version: party.version + 1,
  };
}

/**
 * Check if party is currently frozen
 */
export function isPartyFrozen(party: Party): boolean {
  if (!party.isFrozen) {
    return false;
  }

  // Check if freeze has expired
  if (party.frozenUntil) {
    const frozenUntil = new Date(party.frozenUntil);
    if (new Date() > frozenUntil) {
      return false;
    }
  }

  return true;
}

/**
 * Check if party has valid KYC
 */
export function hasValidKyc(party: Party, minLevel?: VerificationLevel): boolean {
  const levels = [
    VerificationLevel.NONE,
    VerificationLevel.BASIC,
    VerificationLevel.STANDARD,
    VerificationLevel.ENHANCED,
    VerificationLevel.INSTITUTIONAL,
  ];

  const required = minLevel || VerificationLevel.BASIC;
  const currentIdx = levels.indexOf(party.verificationLevel);
  const requiredIdx = levels.indexOf(required);

  if (currentIdx < requiredIdx) {
    return false;
  }

  // Check if any KYC record is still valid
  const now = new Date();
  return party.kycRecords.some((kyc) => {
    if (kyc.expiresAt) {
      const expiresAt = new Date(kyc.expiresAt);
      return expiresAt > now;
    }
    return true;
  });
}

/**
 * Check if party is accredited
 */
export function isAccredited(party: Party): boolean {
  if (party.accreditationStatus === AccreditationStatus.NOT_ACCREDITED) {
    return false;
  }

  // Check expiry
  if (party.accreditationExpiry) {
    const expiry = new Date(party.accreditationExpiry);
    if (new Date() > expiry) {
      return false;
    }
  }

  return true;
}

/**
 * Get primary wallet for a party
 */
export function getPrimaryWallet(party: Party): WalletBinding | undefined {
  return party.wallets.find((w) => w.isPrimary) || party.wallets[0];
}

/**
 * Validate party object
 */
export function validateParty(party: unknown): party is Party {
  return PartySchema.safeParse(party).success;
}

/**
 * Parse and validate party data
 */
export function parseParty(data: unknown): Party {
  return PartySchema.parse(data);
}
