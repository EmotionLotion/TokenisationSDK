/**
 * Generic Asset Types - "Stripe Elements for Assets"
 *
 * These types follow the Template + Instance model from the SDK plan:
 * - Template: "what rules does this asset class have?"
 * - Instance: "this specific property / flight / credit batch / royalty stream"
 */

// ============================================
// Action Types (Universal Lifecycle Actions)
// ============================================

export type ActionType =
  | 'issue'      // mint/allocate
  | 'transfer'   // change ownership
  | 'redeem'     // claim underlying / delivery / refund
  | 'retire'     // burn with purpose (carbon)
  | 'expire'     // auto-invalidate (tickets)
  | 'distribute' // payouts/royalties/yields
  | 'freeze'     // compliance action
  | 'unfreeze'   // compliance action
  | 'revoke'     // regulated flows
  | 'clawback';  // regulated flows

// ============================================
// Token Standard Profiles (hidden from users)
// ============================================

export type TokenProfile =
  | 'regulated_fungible'  // real estate fractions, funds, t-bills (ERC-3643 style)
  | 'unregulated_fungible' // loyalty points, game tokens (ERC-20)
  | 'unique_nonfungible'  // tickets, certificates, deeds (ERC-721)
  | 'semi_fungible';      // batches/series, carbon vintages (ERC-1155)

// ============================================
// Template Types (Asset Classes)
// ============================================

export type TemplateType =
  | 'real_estate'
  | 'custom';

// ============================================
// Supply Models
// ============================================

export type SupplyModel = 'fixed' | 'capped' | 'elastic';

export interface SupplyConfig {
  model: SupplyModel;
  total: string;
  decimals: number;
  minted?: string;
  burned?: string;
}

// ============================================
// Policy Types
// ============================================

export type PolicyType =
  | 'eligibility'  // identity requirements
  | 'transfer'     // time locks, whitelist
  | 'holding'      // ownership limits
  | 'fees'         // issuer fee, marketplace fee
  | 'lifecycle';   // expiry, retire rules

export interface Policy {
  id: string;
  type: PolicyType;
  name: string;
  description: string;
  conditions: PolicyCondition[];
  effect: 'allow' | 'deny' | 'require';
}

export interface PolicyCondition {
  field: string;
  operator: 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'in' | 'nin';
  value: unknown;
}

// ============================================
// Rights & Capabilities
// ============================================

export interface AssetRights {
  transferable: boolean;
  redeemable: boolean;
  expirable: boolean;
  retirable: boolean;
  payoutEnabled: boolean;
}

// ============================================
// Asset Template
// ============================================

export interface MetadataField {
  key: string;
  label: string;
  type: 'string' | 'number' | 'date' | 'boolean' | 'address' | 'url' | 'enum';
  required: boolean;
  options?: string[]; // for enum type
  description?: string;
}

export interface AssetTemplate {
  id: string;
  type: TemplateType;
  name: string;
  description: string;
  profile: TokenProfile;
  schema: MetadataField[];
  defaultPolicies: string[];
  availableActions: ActionType[];
  rights: AssetRights;
  icon?: string;
  color?: string;
}

// ============================================
// Asset Instance
// ============================================

export type AssetStatus =
  | 'draft'
  | 'pending_verification'
  | 'verified'
  | 'active'
  | 'frozen'
  | 'redeemed'
  | 'expired'
  | 'burned';

export interface AssetMetadata {
  name: string;
  description?: string;
  image?: string;
  [key: string]: unknown;
}

export interface AssetInstance {
  id: string;
  templateId: string;
  template?: AssetTemplate;
  metadata: AssetMetadata;
  supply: SupplyConfig;
  status: AssetStatus;
  issuerId: string;
  jurisdiction: string;
  policies: Policy[];
  createdAt: string;
  updatedAt: string;
  // Computed/derived properties
  currentPrice?: string;
  totalValue?: string;
  holdersCount?: number;
}

// ============================================
// Position (Holdings)
// ============================================

export interface Position {
  id: string;
  identityId: string;
  assetId: string;
  balance: string;
  lockedBalance?: string;
  availableBalance?: string;
  lastUpdatedAt: string;
}

// ============================================
// User/Identity Types
// ============================================

export type KYCStatus = 'pending' | 'verified' | 'revoked' | 'expired';
export type RiskTier = 'low' | 'medium' | 'high';

export interface UserIdentity {
  id: string;
  type: 'individual' | 'company';
  name?: string;
  walletAddress?: string;
  jurisdiction: string;
  kycStatus: KYCStatus;
  riskTier?: RiskTier;
  accreditedInvestor?: boolean;
  isFrozen?: boolean;
  permissions: Permission[];
}

export interface Permission {
  action: ActionType;
  assetId?: string;  // if null, applies to all assets
  templateType?: TemplateType;
}

// ============================================
// Action Request/Response
// ============================================

export interface ActionRequest {
  action: ActionType;
  assetId: string;
  actorId: string;
  params: Record<string, unknown>;
}

export interface ActionResult {
  success: boolean;
  transactionId?: string;
  message?: string;
  requirements?: string[];
}

// ============================================
// Policy Evaluation
// ============================================

export interface PolicyEvaluationRequest {
  action: ActionType;
  actorIdentityId: string;
  assetId: string;
  amount?: string;
  toIdentityId?: string;
}

export interface PolicyEvaluationResult {
  allowed: boolean;
  reasons: string[];
  requirements: string[];
}

// ============================================
// Filter/Query Types
// ============================================

export interface AssetFilter {
  type?: TemplateType;
  status?: AssetStatus | AssetStatus[];
  jurisdiction?: string;
  issuerId?: string;
  search?: string;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}
