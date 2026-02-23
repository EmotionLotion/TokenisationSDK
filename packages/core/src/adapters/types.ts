/**
 * @fileoverview Use-Case Adapter Interface Specification
 *
 * This module defines the pluggable adapter interfaces that enable the SDK
 * to support any asset type without core code changes.
 *
 * Architecture:
 * - Core SDK is invariant (identity, compliance, transfers, ledger)
 * - Use-cases plug in as adapters (asset schema, policies, connectors)
 *
 * To add a new asset type:
 * 1. Implement IAssetAdapter for your asset
 * 2. Implement IJurisdictionAdapter for applicable jurisdictions
 * 3. Register adapters with the SDK
 */

// ============================================================================
// VALIDATION & RESULT TYPES
// ============================================================================

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  field: string;
  code: string;
  message: string;
}

export interface ValidationWarning {
  field: string;
  code: string;
  message: string;
}

export interface OperationResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

// ============================================================================
// ASSET ADAPTER INTERFACE
// ============================================================================

/**
 * IAssetAdapter - Defines how an asset type integrates with the SDK
 *
 * Each asset type (real estate, carbon, tickets, etc.) implements this interface
 * to define its specific schema, validation rules, and lifecycle hooks.
 */
export interface IAssetAdapter<
  TAssetInput = Record<string, unknown>,
  TAssetMetadata = Record<string, unknown>
> {
  /**
   * Unique identifier for this asset type
   * @example "real_estate", "carbon_credit", "event_ticket"
   */
  readonly assetType: string;

  /**
   * Human-readable name
   */
  readonly displayName: string;

  /**
   * Supported token standards for this asset type
   */
  readonly supportedTokenStandards: TokenStandard[];

  /**
   * Default token standard to use
   */
  readonly defaultTokenStandard: TokenStandard;

  // -------------------------------------------------------------------------
  // SCHEMA & VALIDATION
  // -------------------------------------------------------------------------

  /**
   * Validate asset input data against the adapter's schema
   * @param input Raw asset data from API/SDK call
   * @returns Validation result with errors if invalid
   */
  validateAsset(input: TAssetInput): ValidationResult;

  /**
   * Normalize and transform raw input into canonical asset metadata
   * @param raw Raw input data
   * @returns Normalized metadata in standard format
   */
  normalizeMetadata(raw: TAssetInput): TAssetMetadata;

  /**
   * Get JSON Schema for asset input validation
   * Used for API documentation and client-side validation
   */
  getSchema(): AssetSchema;

  // -------------------------------------------------------------------------
  // LIFECYCLE HOOKS
  // -------------------------------------------------------------------------

  /**
   * Called before asset creation
   * Use for external validation, registry checks, etc.
   */
  onBeforeCreate?(context: AssetContext): Promise<OperationResult>;

  /**
   * Called after asset creation
   * Use for external notifications, registry sync, etc.
   */
  onAfterCreate?(context: AssetContext): Promise<void>;

  /**
   * Called before token issuance
   * Use for compliance checks, registry verification
   */
  onBeforeIssue?(context: IssueContext): Promise<OperationResult>;

  /**
   * Called after token issuance
   */
  onAfterIssue?(context: IssueContext): Promise<void>;

  /**
   * Called before transfer
   * Use for additional transfer restrictions beyond compliance engine
   */
  onBeforeTransfer?(context: TransferContext): Promise<OperationResult>;

  /**
   * Called after transfer
   * Use for registry updates, notifications
   */
  onAfterTransfer?(context: TransferContext): Promise<void>;

  /**
   * Called before redemption/burn
   */
  onBeforeRedeem?(context: RedeemContext): Promise<OperationResult>;

  /**
   * Called after redemption/burn
   * Use for certificate generation, registry retirement
   */
  onAfterRedeem?(context: RedeemContext): Promise<void>;

  /**
   * Called before payout/distribution
   */
  onBeforePayout?(context: PayoutContext): Promise<OperationResult>;

  /**
   * Called after payout/distribution
   */
  onAfterPayout?(context: PayoutContext): Promise<void>;

  // -------------------------------------------------------------------------
  // EXTERNAL CONNECTORS
  // -------------------------------------------------------------------------

  /**
   * Get external connectors for this asset type
   * @example DLD connector for real estate, Verra for carbon
   */
  getConnectors?(): ExternalConnector[];
}

// ============================================================================
// JURISDICTION ADAPTER INTERFACE
// ============================================================================

/**
 * IJurisdictionAdapter - Defines jurisdiction-specific rules and integrations
 *
 * Regulation is geographic, not architectural. This adapter handles
 * jurisdiction-specific compliance requirements.
 */
export interface IJurisdictionAdapter {
  /**
   * ISO 2-letter country code
   */
  readonly jurisdiction: string;

  /**
   * Human-readable name
   */
  readonly displayName: string;

  /**
   * Supported asset types in this jurisdiction
   */
  readonly supportedAssetTypes: string[];

  // -------------------------------------------------------------------------
  // COMPLIANCE
  // -------------------------------------------------------------------------

  /**
   * Verify asset meets jurisdiction requirements
   */
  verifyAsset(asset: AssetContext): Promise<JurisdictionVerification>;

  /**
   * Get compliance rule overrides for this jurisdiction
   * These rules are merged with asset-type policies
   */
  getComplianceOverrides(): PolicyOverride[];

  /**
   * Get required claim types for investors in this jurisdiction
   */
  getRequiredClaims(): ClaimRequirement[];

  // -------------------------------------------------------------------------
  // REPORTING
  // -------------------------------------------------------------------------

  /**
   * Get reporting templates for regulatory compliance
   */
  getReportingTemplates(): ReportTemplate[];

  /**
   * Generate regulatory report
   */
  generateReport?(
    template: string,
    data: ReportData
  ): Promise<OperationResult<ReportOutput>>;

  // -------------------------------------------------------------------------
  // EXTERNAL REGISTRIES
  // -------------------------------------------------------------------------

  /**
   * Get external registry connector (e.g., DLD for UAE)
   */
  getRegistryConnector?(): ExternalConnector | null;
}

// ============================================================================
// KYC ADAPTER INTERFACE
// ============================================================================

/**
 * IKycAdapter - Defines integration with KYC/identity verification providers
 */
export interface IKycAdapter {
  /**
   * Provider identifier
   * @example "sumsub", "onfido", "jumio", "manual"
   */
  readonly provider: string;

  /**
   * Human-readable name
   */
  readonly displayName: string;

  /**
   * Supported verification levels
   */
  readonly supportedLevels: string[];

  /**
   * Create a new verification session
   */
  createSession(input: KycSessionInput): Promise<KycSession>;

  /**
   * Get session status from provider
   */
  getSessionStatus(sessionId: string): Promise<KycSessionStatus>;

  /**
   * Process webhook from provider
   */
  processWebhook(
    payload: unknown,
    signature: string
  ): Promise<KycWebhookResult>;

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(payload: string, signature: string): boolean;
}

// ============================================================================
// SUPPORTING TYPES
// ============================================================================

export type TokenStandard =
  | 'ERC-3643'
  | 'ERC-1400'
  | 'ERC-20'
  | 'ERC-721'
  | 'ERC-1155';

export interface AssetSchema {
  type: 'object';
  required: string[];
  properties: Record<string, SchemaProperty>;
}

export interface SchemaProperty {
  type: string;
  description?: string;
  format?: string;
  enum?: string[];
  minimum?: number;
  maximum?: number;
  pattern?: string;
  items?: SchemaProperty;
}

export interface AssetContext {
  assetId: string;
  assetType: string;
  jurisdiction: string;
  issuerId: string;
  metadata: Record<string, unknown>;
}

export interface IssueContext extends AssetContext {
  tokenId: string;
  recipientId: string;
  recipientAddress: string;
  amount: string;
}

export interface TransferContext extends AssetContext {
  tokenId: string;
  transferId: string;
  fromAddress: string;
  toAddress: string;
  fromInvestorId: string;
  toInvestorId: string;
  amount: string;
}

export interface RedeemContext extends AssetContext {
  tokenId: string;
  holderId: string;
  holderAddress: string;
  amount: string;
  reason?: string;
}

export interface PayoutContext extends AssetContext {
  tokenId: string;
  distributionId: string;
  totalAmount: string;
  currency: string;
  recipientCount: number;
}

export interface ExternalConnector {
  id: string;
  name: string;
  type: 'registry' | 'verification' | 'reporting' | 'payment';
  baseUrl?: string;
  apiVersion?: string;

  /**
   * Check connector health/availability
   */
  healthCheck(): Promise<boolean>;

  /**
   * Execute connector-specific operation
   */
  execute<T>(operation: string, params: Record<string, unknown>): Promise<T>;
}

export interface JurisdictionVerification {
  verified: boolean;
  status: 'pending' | 'verified' | 'failed' | 'expired';
  externalId?: string;
  verifiedAt?: string;
  expiresAt?: string;
  details?: Record<string, unknown>;
  errors?: string[];
}

export interface PolicyOverride {
  ruleId: string;
  field?: string;
  op?: string;
  value?: unknown;
  enabled?: boolean;
  message?: string;
}

export interface ClaimRequirement {
  claimType: string;
  required: boolean;
  validityPeriodDays?: number;
  acceptedIssuers?: string[];
}

export interface ReportTemplate {
  id: string;
  name: string;
  description: string;
  frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual' | 'on_demand';
  format: 'json' | 'csv' | 'pdf' | 'xml';
}

export interface ReportData {
  startDate: string;
  endDate: string;
  tokenIds?: string[];
  filters?: Record<string, unknown>;
}

export interface ReportOutput {
  reportId: string;
  template: string;
  generatedAt: string;
  format: string;
  data: unknown;
  downloadUrl?: string;
}

export interface KycSessionInput {
  investorId: string;
  email: string;
  level: string;
  redirectUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface KycSession {
  sessionId: string;
  externalId: string;
  status: string;
  verificationUrl?: string;
  expiresAt?: string;
}

export interface KycSessionStatus {
  sessionId: string;
  status: 'pending' | 'in_progress' | 'approved' | 'rejected' | 'expired';
  level?: string;
  result?: Record<string, unknown>;
  completedAt?: string;
}

export interface KycWebhookResult {
  processed: boolean;
  investorId?: string;
  sessionId?: string;
  newStatus?: string;
  claims?: Record<string, unknown>;
}

// ============================================================================
// ADAPTER REGISTRY
// ============================================================================

/**
 * AdapterRegistry - Central registry for all adapters
 */
export interface IAdapterRegistry {
  /**
   * Register an asset adapter
   */
  registerAssetAdapter(adapter: IAssetAdapter): void;

  /**
   * Register a jurisdiction adapter
   */
  registerJurisdictionAdapter(adapter: IJurisdictionAdapter): void;

  /**
   * Register a KYC adapter
   */
  registerKycAdapter(adapter: IKycAdapter): void;

  /**
   * Get asset adapter by type
   */
  getAssetAdapter(assetType: string): IAssetAdapter | undefined;

  /**
   * Get jurisdiction adapter
   */
  getJurisdictionAdapter(jurisdiction: string): IJurisdictionAdapter | undefined;

  /**
   * Get KYC adapter by provider
   */
  getKycAdapter(provider: string): IKycAdapter | undefined;

  /**
   * Get all registered asset types
   */
  getAssetTypes(): string[];

  /**
   * Get all registered jurisdictions
   */
  getJurisdictions(): string[];

  /**
   * Get all registered KYC providers
   */
  getKycProviders(): string[];
}
