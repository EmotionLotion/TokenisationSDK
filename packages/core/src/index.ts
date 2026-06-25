/**
 * @tokenisation/core
 *
 * Asset-class-agnostic foundation for the Tokenisation SDK.
 * Partners building non-real-estate apps (airline tickets, loyalty points, etc.)
 * can import ONLY this package.
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
  // Chain Service
  ChainService,
  // Provider Resilience
  ResilientClient,
  createKYCResilientClient,
  createPaymentResilientClient,
  createBlockchainResilientClient,
} from './core/index.js';

export type {
  ComplianceEngineConfig,
  ComplianceResult,
  // Resilience types
  ResilientClientConfig,
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
  ComplianceContext,
  PolicyDecision,
  // Provider interfaces (KYC, Custody, etc.)
  IKYCProvider,
  KYCLevel,
  KYCStatus,
  KYCVerification,
  // Custody provider interfaces (used by @tokenisation/chains)
  ICustodyProvider,
  CustodyArrangementType,
  CustodyAccount,
  SigningRequest,
  SignedTransaction,
  // ACE plugin interfaces (used by @tokenisation/chains)
  IAcePlugin,
  ACEAttestation,
  ACERequest,
  ACEConsensusInfo,
  ACETransferCheckParams,
  // Proof of Reserve plugin interface (used by @tokenisation/chains)
  IProofOfReservePlugin,
} from './core/index.js';

// ACE enums (used by @tokenisation/chains)
export {
  ACEAttestationType,
  ACEAttestationStatus,
} from './core/index.js';

// Custom Condition Evaluation (used by @tokenisation/realestate)
export type {
  ICustomConditionEvaluator,
  CustomConditionContext,
  CustomConditionResult,
  ICustomConditionRegistry,
} from './core/index.js';
export {
  CustomConditionRegistry,
  getCustomConditionRegistry,
  setCustomConditionRegistry,
} from './core/index.js';

// StateMachine types (used by @tokenisation/realestate)
export type {
  StateMachineConfig,
  StateContext,
  GuardResult,
  StateMachineGuard,
  TransitionAction,
  TransitionResult,
} from './core/index.js';
export {
  stateMachineRegistry,
  StateMachineRegistry,
  STANDARD_LIFECYCLE,
  SIMPLE_LIFECYCLE,
  GOVERNANCE_LIFECYCLE,
  FINANCIAL_LIFECYCLE,
} from './core/index.js';

// Models
export * from './models/index.js';

// Plugins
export * from './plugins/index.js';

// Services
export * from './services/index.js';

// Error Classes (ValidationError re-exported from here takes precedence)
export {
  SDKError,
  AuthenticationError,
  ValidationError,
  ComplianceError,
  ContractError,
  NetworkError,
  OracleError,
  AssetError,
  StorageError,
  ErrorCode,
  isSDKError,
  hasErrorCode,
  wrapError,
  getErrorMessage,
  formatErrorForUser,
} from './errors/index.js';
export type { ErrorCodeType } from './errors/index.js';

// Asset Abstraction Layer (institutional-friendly API, no ERC terminology)
export {
  AssetType,
  InvestorClass,
  LiquidityProfile,
  FractionalizationType,
  TokenStandard,
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

// Decision Receipt (audit trail, receipt chaining)
export {
  createReceipt,
  receiptChain,
  hashReceipt,
  verifyReceipt,
  verifyReceiptSignature,
} from './core/DecisionReceipt.js';
export type {
  DecisionReceipt,
} from './core/DecisionReceipt.js';

// Policy Hashing
export { hashPolicy } from './core/PolicyHash.js';

// Disaster Recovery
export {
  DisasterRecoveryService,
  SystemHealthStatus,
  BackendServiceStatus,
  SafeFailMode,
  createDisasterRecoveryService,
  createDevelopmentDisasterRecoveryService,
} from './core/DisasterRecovery.js';
export type {
  DisasterRecoveryConfig,
  StuckStateRecord,
  RecoveryCheckpoint,
  SystemHealthReport,
  RecoveryResult,
} from './core/DisasterRecovery.js';

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

// Reference Packs
export * from './packs/index.js';

// Pre-built UI Components (Stripe Elements style)
// NOTE: React components are NOT exported from the root entry — they statically import
// `react`, which would force every consumer (incl. backend/Node apps) to install React.
// Import them from the subpath instead:  `@tokenisation/core/components`  (see package.json exports). [F22]
// The theme helpers below are framework-agnostic (no React) and remain on the root for
// backwards compatibility (used by @tokenisation/realestate components, etc.).
export { defaultTheme, createStyles, type TokenisationTheme } from './components/theme.js';

// Extension Modules (Cash Flow, Governance, Escrow)
export * from './modules/index.js';

// Offline Engines
export * as offline from './offline/index.js';
export { NetworkDetector, type NetworkStatus, type NetworkStatusCallback, type NetworkDetectorOptions } from './offline/NetworkDetector.js';
export { SyncManager, type SyncProgress, type SyncStatus, type SyncProgressCallback, type SyncStatusCallback, type SyncManagerOptions } from './offline/SyncManager.js';
export { OfflineQueue, type OfflineQueueOptions, type QueuedOperation, type OperationPriority } from './offline/OfflineQueue.js';

// Provider Implementations (Mock/Reference)
export * from './providers/index.js';

// Production Infrastructure
export * from './middleware/index.js';
// Framework-agnostic storage interface + in-memory adapter only. The Drizzle/pg-backed
// Postgres adapter (`./storage/postgres`) statically imports `drizzle-orm`/`pg`, so it is
// NOT in the root entry — import it from `@tokenisation/core/storage` instead. [F22]
export * from './storage/DatabaseAdapter.js';
export * from './secrets/index.js';
export * from './queue/index.js';
export * from './audit/index.js';
export * from './api/index.js';

// Validation (ValidationError, validate, validateSafe also re-exported via modules)
export {
  isValidAddress,
  isValidUUID,
  isValidTokenAmount,
  isValidTxHash,
  isValidChainId,
  sanitizeString,
  sanitizeObject,
  withValidation,
} from './validation/index.js';

// Cross-Pack Orchestration
export {
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

// Workflow Registry (generic — packs register named workflows)
export {
  WorkflowRegistry,
} from './workflows/WorkflowRegistry.js';
export type {
  WorkflowDefinition,
  WorkflowStepDefinition,
  WorkflowExecutionContext,
  WorkflowProgressCallback,
  WorkflowProgressEvent,
  WorkflowResult,
  WorkflowStepResult,
  WorkflowError,
  WorkflowRunOptions,
} from './workflows/WorkflowRegistry.js';

// Pack Manifest & Registry
export {
  PackRegistry,
  PackManifestSchema,
} from './packs/PackManifest.js';
export type {
  PackManifest,
  LoadedPack,
  PackActivationContext,
} from './packs/PackManifest.js';

// Connectors
export * from './connectors/index.js';

// Browser HTTP Client
export {
  BrowserHttpClient,
  BrowserHttpError,
} from './utils/browser-http.js';
export type {
  BrowserHttpClientConfig,
  BrowserRequestOptions,
} from './utils/browser-http.js';

// Crypto utilities
export * from './utils/crypto.js';

// QR Code
export * from './utils/qrcode.js';

// CCIPSettlementProvider (used by @tokenisation/chains)
export { CCIPSettlementProvider } from './providers/settlement/CCIPSettlementProvider.js';
export type { CCIPSettlementProviderConfig } from './providers/settlement/CCIPSettlementProvider.js';

// Ahoy / Telematics (used by @tokenisation/chains)
export { TelematicsEventType } from './ahoy/index.js';

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

export function createTokenisationSDK(
  config: CreateTokenisationSDKConfig = {},
): TokenisationSDKWithEvents {
  const sdk = new _TokenisationSDK(config.sdkConfig);

  const handlers: Record<TokenisationEventType, Set<(...args: any[]) => void>> = {
    statusUpdate: new Set(),
    transferSuccess: new Set(),
    complianceFailure: new Set(),
  };

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
