/**
 * Tokenisation SDK
 *
 * A modular tokenisation infrastructure that abstracts compliance, issuance, and
 * asset lifecycle management. Enables partners to deploy tokenized real-world assets
 * without rebuilding financial infrastructure.
 *
 * Key capabilities:
 * - Asset tokenisation without blockchain knowledge (no ERC standards exposed)
 * - Built-in compliance engine with KYC/AML verification
 * - Full asset lifecycle management (draft → active → frozen → redeemed)
 * - Custody & recovery mechanisms (multi-sig, lost keys, regulatory overrides)
 * - Real-time indexing and regulatory reporting
 * - Pre-built asset packs for common use cases (PE funds, real estate, bonds)
 *
 * @packageDocumentation
 */

// Main SDK export
export { TokenisationSDK } from './SDK.js';
export type { SDKConfig, AssetManager, PartyManager, EvidenceManager, TokenManager } from './SDK.js';

// API Client (Stripe-like interface)
export { ApiClient, createApiClient, TokenizationError } from './ApiClient.js';
export { HttpClient } from './utils/http.js';

// OAuth Token Manager
export {
  OAuthTokenManager,
  createOAuthTokenManager,
  createOAuthFetch,
} from './auth/OAuthTokenManager.js';
export type {
  OAuthTokenManagerConfig,
  TokenResponse as OAuthTokenResponse,
  OAuthTokenManagerEvents,
} from './auth/OAuthTokenManager.js';

// Pagination Utilities
export {
  paginate,
  collectAll,
  collectBatches,
  Paginator,
  createCursorFetcher,
  createPageFetcher,
} from './utils/pagination.js';
export type {
  PaginatedResponse as PaginationResponse,
  PageInfo,
  PaginationOptions,
} from './utils/pagination.js';

// API Types
// Note: Asset and AssetState are intentionally NOT exported here so that the
// richer Model Asset (from ./models/index.js wildcard export) takes precedence.
export type {
  TokenizationSDKConfig,
  PaginatedResponse,
  ApiResponse,
  ApiError,
  Organization,
  User,
  Role,
  ApiKey,
  Project,
  Document,
  Investor,
  InvestorWallet,
  InvestorStatus,
  InvestorClassification,
  RiskTier,
  KycStatus,
  Token,
  TokenTranche,
  TokenStatus,
  Policy,
  PolicyRule,
  ComplianceDecision,
  Transfer,
  TransferStatus,
  CreateTransferInput,
  Settlement,
  FinalityStatus,
  WebhookEndpoint,
  WebhookDelivery,
  LedgerPosition,
  LedgerEvent,
  DldTitle,
  DldEvent,
  AuditLogEntry,
  EventMessage,
  EventStatus,
  ChainConfig,
} from './types.js';

// Core types and interfaces
export {
  LifecycleEngine,
  EventStore,
  PolicyEvaluator,
  VALID_TRANSITIONS,
  EventType,
  ComplianceAction,
  ok,
  err,
  RightModelSchema,
  BaseEventSchema,
  JurisdictionSchema,
  ValidityPeriodSchema,
  TransferabilityRulesSchema,
  TransferContextSchema,
  ComplianceEngine,
} from './core/index.js';

export type {
  ComplianceEngineConfig,
  ComplianceResult,
} from './core/index.js';

export type {
  RightModel,
  BaseEvent,
  Jurisdiction,
  ValidityPeriod,
  TransferabilityRules,
  TransferContext,
  Result,
  ILifecycleEngine,
  IEventStore,
  IPluginRegistry,
  IJurisdictionPlugin,
  ICompliancePlugin,
  IOraclePlugin,
  IStoragePlugin,
  IChainPlugin,
  ITokenAdapter,
  PluginType,
  AnyPlugin,
  StateTransitionRequest,
  StateTransitionResult,
  TransitionGuard,
  JurisdictionCheckResult,
  ComplianceCheckResult,
  ComplianceViolation,
  PartyComplianceStatus,
  OracleDataPoint,
  OracleRequest,
  StorageMetadata,
  TransactionReceipt,
  TransactionLog,
  ChainConfig as CoreChainConfig,
  TokenInfo,
  EventQueryOptions,
  PolicyEvaluationResult,
  PolicyContext,
} from './core/index.js';

// Models
export * from './models/index.js';

// Plugins
export * from './plugins/index.js';

// Services
export * from './services/index.js';

// Factories (Chainlink wiring)
export {
  createChainlinkWiredSDK,
} from './factories/ChainlinkSDKFactory.js';
export type {
  ChainlinkWiringConfig,
  ChainlinkWiredSDK,
} from './factories/ChainlinkSDKFactory.js';

// Bridges
export { DataFeedBridge } from './bridges/DataFeedBridge.js';
export type { DataFeedBridgeConfig } from './bridges/DataFeedBridge.js';

// Asset Abstraction Layer (institutional-friendly API, no ERC terminology)
export {
  AssetType,
  InvestorClass,
  LiquidityProfile,
  FractionalizationType,
  AssetDescriptorSchema,
  resolveTokenStandard,
  getAssetTypeDescription,
  getJurisdictionInfo,
} from './core/AssetAbstraction.js';
export type {
  AssetDescriptor,
  IssuedAsset,
  ResolvedTokenConfig,
} from './core/AssetAbstraction.js';

export {
  AssetIssuanceService,
  AssetIssuanceError,
} from './services/AssetIssuanceService.js';
export type {
  AssetIssuanceServiceOptions,
} from './services/AssetIssuanceService.js';

// Custody & Recovery
export {
  CustodyManager,
  custodyManager,
  CustodyType,
  RecoveryReason,
  OverrideType,
  ApprovalStatus,
} from './core/CustodyManager.js';
export type {
  CustodyArrangement,
  RecoveryRequest,
  RecoveryApproval,
  OverrideRequest,
  OverrideApproval,
  Delegation as CustodyDelegation,
  DelegatedPermission,
  DelegationConstraint,
} from './core/CustodyManager.js';

// Indexing & Reporting
export {
  IndexingEngine,
  indexingEngine,
  IndexedEventType,
} from './core/IndexingEngine.js';
export type {
  IndexedEvent,
  BalanceRecord,
  TransferRecord,
  HolderStats,
  AssetStats,
  ComplianceReport,
  TransferQueryOptions,
  IndexerEventQueryOptions,
} from './core/IndexingEngine.js';

// Contracts (adapters)
export * from './contracts/index.js';

// Reference Packs
export * from './packs/index.js';

// Pre-built UI Components (Stripe Elements style)
export * from './components/index.js';

// Extension Modules (Cash Flow, Governance, Escrow)
export * from './modules/index.js';

// Offline Engines (deprecated - for development only)
// For production, use ApiClient modules instead
export * as offline from './offline/index.js';

// Provider Implementations (Mock/Reference)
export * from './providers/index.js';

// Production Infrastructure
export * from './middleware/index.js';
export * from './storage/index.js';
export * from './secrets/index.js';
export * from './queue/index.js';
export * from './audit/index.js';
export * from './api/index.js';
export * from './identity/index.js';

// Cross-Pack Orchestration (Handoff, Identity, Audit)
export {
  // Autonomous Handoff
  FlightLandingOracle,
  CrossPackEventBus,
  SagaOrchestrator,
  SagaExecutionStatus,

  // Portable Identity
  PortableComplianceRegistry,
  SharedIdentityRegistry,

  // Unified Audit
  AuditChainManager,
  UnifiedAuditLog,
} from './orchestration/index.js';

export type {
  // Handoff types
  FlightLandingData,
  FlightLandingStatus,
  LandingVerificationResult,
  CrossPackEvent,
  CrossPackEventFilter,
  CrossPackEventHandler,
  ICrossPackEventBus,
  SagaDefinition,
  SagaStep,
  SagaExecution,
  SagaLogEntry,
  CompensationStep,

  // Portable Identity types
  PortableReceipt,
  PortableReceiptQuery,
  PortableComplianceCheck,
  ComplianceType,
  IdentityVerification,
  IIdentityRegistry,

  // Audit types
  AuditEntry as OrchestrationAuditEntry,
  AuditFilter as OrchestrationAuditFilter,
  IAuditLog,
  ChainedAuditEntry,
  BusinessAuditView,
  ChainVerificationResult,
  CrossPackSubscription,
} from './orchestration/index.js';

// Re-export commonly used types from SDK
export {
  // Core enums
  LifecycleState,
  RightType,
  TransferabilityMode,
  EvidenceType,
  EvidenceStatus,
  PartyRole,
  PartyType,

  // Extension module enums
  HookPriority,
  DistributionType,
  AllocationStrategy,
  VotingStrategy,
  VoteType,
  ProposalType,
  EscrowType,
  EscrowStatus,
  ReleaseConditionType,

  // Extension module classes
  RightTypeRegistry,
  rightTypeRegistry,
  StateMachine,
  HookManager,
  hookManager,
  CashFlowEngine,
  GovernanceEngine,
  EscrowEngine,
} from './SDK.js';

export type {
  // Extension types from SDK
  RightTypeBehavior,
  StateDefinition,
  TransitionDefinition,
  HookEvent,
  HookHandler,
  DistributionSchedule,
  DistributionEvent,
  Proposal,
  VoteRecord,
  Delegation,
  Escrow,
  Milestone,
} from './SDK.js';

// ============================================
// Factory: createTokenisationSDK (Event-Driven Wrapper)
// ============================================

import { TokenisationSDK as _TokenisationSDK } from './SDK.js';

export interface CreateTokenisationSDKConfig {
  /** SDK configuration passed to TokenisationSDK constructor */
  sdkConfig?: ConstructorParameters<typeof _TokenisationSDK>[0];
  /** Called when an asset transitions state */
  onStatusUpdate?: (assetId: string, from: string, to: string) => void;
  /** Called on successful transfer */
  onTransferSuccess?: (transferId: string, from: string, to: string, amount: string) => void;
  /** Called when a compliance check fails */
  onComplianceFailure?: (assetId: string, reason: string) => void;
}

export type TokenisationEventType = 'statusUpdate' | 'transferSuccess' | 'complianceFailure';

export interface TokenisationSDKWithEvents {
  sdk: _TokenisationSDK;
  subscribe: (
    event: TokenisationEventType,
    handler: (...args: any[]) => void,
  ) => () => void;
  emit: (event: TokenisationEventType, ...args: any[]) => void;
}

/**
 * Factory function that wraps TokenisationSDK with an event subscription system.
 *
 * @example
 * ```ts
 * const { sdk, subscribe } = createTokenisationSDK({
 *   onStatusUpdate: (assetId, from, to) => console.log(`Asset ${assetId}: ${from} → ${to}`),
 * });
 *
 * const unsub = subscribe('transferSuccess', (id, from, to, amt) => {
 *   console.log(`Transfer ${id}: ${from} → ${to} (${amt})`);
 * });
 *
 * // later
 * unsub();
 * ```
 */
export function createTokenisationSDK(
  config: CreateTokenisationSDKConfig = {},
): TokenisationSDKWithEvents {
  const sdk = new _TokenisationSDK(config.sdkConfig);

  const handlers: Record<TokenisationEventType, Set<(...args: any[]) => void>> = {
    statusUpdate: new Set(),
    transferSuccess: new Set(),
    complianceFailure: new Set(),
  };

  // Wire initial callbacks
  if (config.onStatusUpdate) handlers.statusUpdate.add(config.onStatusUpdate);
  if (config.onTransferSuccess) handlers.transferSuccess.add(config.onTransferSuccess);
  if (config.onComplianceFailure) handlers.complianceFailure.add(config.onComplianceFailure);

  function emit(event: TokenisationEventType, ...args: any[]) {
    handlers[event].forEach(fn => fn(...args));
  }

  function subscribe(
    event: TokenisationEventType,
    handler: (...args: any[]) => void,
  ): () => void {
    handlers[event].add(handler);
    return () => {
      handlers[event].delete(handler);
    };
  }

  return { sdk, subscribe, emit };
}
