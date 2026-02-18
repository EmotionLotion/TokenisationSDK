// ============================================================================
// Core SDK Types
// ============================================================================

/**
 * SDK Configuration options
 */
export interface TokenizationSDKConfig {
  /** API key for authentication (sk_test_xxx or sk_live_xxx) */
  apiKey: string;
  /** Base URL for the API (default: https://api.tokenisation.io) */
  baseUrl?: string;
  /** Environment: 'test' | 'sandbox' | 'staging' | 'live' */
  environment?: 'test' | 'sandbox' | 'staging' | 'live';
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Retry configuration */
  retry?: {
    maxRetries: number;
    retryDelay: number;
    retryOn?: number[];
  };
  /** Custom headers to include in all requests (useful for dev mode bypass) */
  defaultHeaders?: Record<string, string>;
}

/** Pre-configured environment presets */
export const ENVIRONMENT_PRESETS: Record<string, { baseUrl: string; environment: TokenizationSDKConfig['environment'] }> = {
  sandbox: { baseUrl: 'https://sandbox.api.tokenisation.io', environment: 'sandbox' },
  staging: { baseUrl: 'https://staging.api.tokenisation.io', environment: 'staging' },
  production: { baseUrl: 'https://api.tokenisation.io', environment: 'live' },
  test: { baseUrl: 'http://localhost:3001/api/v1', environment: 'test' },
};

/** Create SDK config from environment name */
export function configFromEnvironment(env: keyof typeof ENVIRONMENT_PRESETS, apiKey: string, overrides?: Partial<TokenizationSDKConfig>): TokenizationSDKConfig {
  const preset = ENVIRONMENT_PRESETS[env];
  return { apiKey, baseUrl: preset.baseUrl, environment: preset.environment, ...overrides };
}

/**
 * Paginated response wrapper
 */
export interface PaginatedResponse<T> {
  data: T[];
  count: number;
  page?: number;
  limit?: number;
  hasMore?: boolean;
}

/**
 * Standard API response
 */
export interface ApiResponse<T> {
  data: T;
  requestId: string;
  idempotencyKey?: string;
}

/**
 * API Error response
 */
export interface ApiError {
  error: {
    message: string;
    code: string;
    details?: Record<string, unknown>;
  };
  requestId?: string;
}

// ============================================================================
// Organization & IAM Types
// ============================================================================

export interface Organization {
  id: string;
  name: string;
  slug: string;
  status: 'active' | 'suspended' | 'disabled';
  settings: Record<string, unknown>;
  riskProfile: Record<string, unknown>;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  orgId: string;
  email: string;
  name: string | null;
  status: 'active' | 'disabled' | 'pending';
  emailVerified: boolean;
  lastLoginAt: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface Role {
  id: string;
  orgId: string;
  name: string;
  description: string | null;
  permissions: string[];
  isSystem: boolean;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ApiKey {
  id: string;
  orgId: string;
  name: string;
  keyPrefix: string;
  environment: 'test' | 'live';
  scopes: string[];
  status: 'active' | 'revoked';
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

// ============================================================================
// Project & Asset Types
// ============================================================================

export interface Project {
  id: string;
  orgId: string;
  name: string;
  description: string | null;
  jurisdiction: string;
  assetType: string;
  status: 'draft' | 'active' | 'frozen' | 'closed';
  settings: Record<string, unknown>;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface Document {
  id: string;
  orgId: string;
  projectId: string | null;
  assetId: string | null;
  type: string;
  name: string;
  storageProvider: 's3' | 'ipfs' | 'azure';
  uri: string;
  sha256: string;
  mimeType: string | null;
  size: number | null;
  signedBy: string | null;
  signedAt: string | null;
  status: 'uploaded' | 'verified' | 'expired' | 'rejected';
  expiresAt: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export type AssetState = 'draft' | 'pending_verification' | 'verified' | 'tokenized' | 'frozen' | 'closed';

export interface Asset {
  id: string;
  orgId: string;
  projectId: string | null;
  name: string;
  description: string | null;
  state: AssetState;
  titleDeedExternalId: string | null;
  verificationState: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// Investor Types
// ============================================================================

export type InvestorStatus = 'pending' | 'active' | 'suspended' | 'offboarded';
export type InvestorClassification = 'retail' | 'professional' | 'institutional';
export type RiskTier = 'low' | 'medium' | 'high';
export type KycStatus = 'not_started' | 'pending' | 'approved' | 'rejected' | 'expired';

export interface Investor {
  id: string;
  orgId: string;
  externalId: string | null;
  email: string;
  name: string | null;
  type: 'individual' | 'entity';
  classification: InvestorClassification;
  riskTier: RiskTier;
  jurisdiction: string;
  status: InvestorStatus;
  kycStatus: KycStatus;
  kycProvider: string | null;
  kycExternalId: string | null;
  kycVerifiedAt: string | null;
  kycExpiresAt: string | null;
  piiRef: string | null;
  accredited: boolean;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface InvestorWallet {
  id: string;
  investorId: string;
  address: string;
  chainId: number;
  walletType: 'eoa' | 'multisig' | 'smart_account';
  custodyType: 'self' | 'custodian';
  isPrimary: boolean;
  verified: boolean;
  verifiedAt: string | null;
  status: 'active' | 'revoked';
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// Token Types
// ============================================================================

export type TokenStatus = 'draft' | 'deploying' | 'active' | 'paused' | 'frozen';

export interface Token {
  id: string;
  orgId: string;
  projectId: string | null;
  assetId: string | null;
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: string;
  maxSupply: string | null;
  status: TokenStatus;
  chainId: number;
  contractAddress: string | null;
  identityRegistryAddress: string | null;
  complianceAddress: string | null;
  policyId: string | null;
  deployedAt: string | null;
  deployTxHash: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface TokenTranche {
  id: string;
  tokenId: string;
  name: string;
  supply: string;
  lockedUntil: string | null;
  transferRestrictions: Record<string, unknown>;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// Compliance Types
// ============================================================================

export interface Policy {
  id: string;
  orgId: string;
  name: string;
  description: string | null;
  status: 'draft' | 'active' | 'archived';
  jurisdiction: string;
  rules: PolicyRule[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface PolicyRule {
  id: string;
  type: string;
  parameters: Record<string, unknown>;
  enabled: boolean;
}

export interface ComplianceDecision {
  id: string;
  orgId: string;
  policyId: string;
  entityType: 'transfer' | 'issuance' | 'redemption' | 'investor';
  entityId: string;
  decision: 'approved' | 'rejected' | 'pending_review';
  reasons: string[];
  overrideBy: string | null;
  overrideReason: string | null;
  expiresAt: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// Transfer Types
// ============================================================================

export type TransferStatus =
  | 'created'
  | 'prechecked'
  | 'approved'
  | 'signing'
  | 'submitted'
  | 'confirmed'
  | 'reconciled'
  | 'settled'
  | 'cancelled'
  | 'failed';

export interface Transfer {
  id: string;
  orgId: string;
  tokenId: string;
  fromWallet: string;
  toWallet: string;
  amount: string;
  status: TransferStatus;
  decisionId: string | null;
  txHash: string | null;
  chainId: number;
  error: string | null;
  idempotencyKey: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTransferInput {
  tokenId: string;
  fromWallet: string;
  toWallet: string;
  amount: string;
  chainId?: number;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Settlement Types
// ============================================================================

export type FinalityStatus = 'pending' | 'finalized' | 'reorged';

export interface Settlement {
  id: string;
  orgId: string;
  transferId: string | null;
  issuanceId: string | null;
  redemptionId: string | null;
  txHash: string;
  chainId: number;
  finalityStatus: FinalityStatus;
  confirmedBlock: number | null;
  finalizedBlock: number | null;
  confirmations: number;
  requiredConfirmations: number;
  indexedAt: string | null;
  finalizedAt: string | null;
  reorgedAt: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// Webhook Types
// ============================================================================

export interface WebhookEndpoint {
  id: string;
  orgId: string;
  url: string;
  events: string[];
  status: 'active' | 'disabled';
  secret: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookDelivery {
  id: string;
  endpointId: string;
  event: string;
  payload: Record<string, unknown>;
  status: 'pending' | 'delivered' | 'failed';
  attempts: number;
  lastAttemptAt: string | null;
  deliveredAt: string | null;
  responseStatus: number | null;
  responseBody: string | null;
  createdAt: string;
}

// ============================================================================
// Ledger Types
// ============================================================================

export interface LedgerPosition {
  id: string;
  orgId: string;
  tokenId: string;
  investorId: string;
  walletAddress: string;
  balance: string;
  lockedBalance: string;
  availableBalance: string;
  lastEventId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface LedgerEvent {
  id: string;
  orgId: string;
  positionId: string;
  type: 'issuance' | 'redemption' | 'transfer_in' | 'transfer_out' | 'lock' | 'unlock';
  amount: string;
  balanceBefore: string;
  balanceAfter: string;
  referenceType: string | null;
  referenceId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

// ============================================================================
// DLD Types
// ============================================================================

export interface DldTitle {
  id: string;
  orgId: string;
  assetId: string | null;
  externalTitleDeedId: string;
  status: 'unknown' | 'pending' | 'verified' | 'conflict';
  snapshot: Record<string, unknown>;
  flags: string[];
  lastSyncAt: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface DldEvent {
  id: string;
  titleId: string;
  eventType: string;
  externalEventId: string | null;
  payload: Record<string, unknown>;
  processedAt: string | null;
  status: 'pending' | 'processed' | 'ignored' | 'error';
  error: string | null;
  createdAt: string;
}

// ============================================================================
// Audit Types
// ============================================================================

export interface AuditLogEntry {
  id: string;
  orgId: string;
  action: string;
  entityType: string;
  entityId: string;
  actorType: 'user' | 'api_key' | 'system';
  actorId: string;
  changes: Record<string, unknown>;
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
  previousHash: string;
  hash: string;
  createdAt: string;
}

// ============================================================================
// Event Bus Types
// ============================================================================

export type EventStatus = 'pending' | 'processing' | 'processed' | 'failed' | 'dlq';

export interface EventMessage {
  id: string;
  orgId: string;
  topic: string;
  payload: Record<string, unknown>;
  status: EventStatus;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  lastAttemptAt: string | null;
  processAfter: string | null;
  createdAt: string;
}

// ============================================================================
// Chain Types
// ============================================================================

export interface ChainConfig {
  chainId: number;
  name: string;
  rpcUrl: string;
  explorerUrl: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  confirmations: number;
  isTestnet: boolean;
}
