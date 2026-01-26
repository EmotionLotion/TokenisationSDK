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
  Asset,
  AssetState,
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
  ok,
  err,
  RightModelSchema,
  BaseEventSchema,
  JurisdictionSchema,
  ValidityPeriodSchema,
  TransferabilityRulesSchema,
  TransferContextSchema,
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
