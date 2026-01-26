/**
 * Tokenisation SDK - Client Entry Point
 *
 * Browser-safe exports for frontend applications.
 * This entry point excludes server-only modules like:
 * - SecretsManager (AWS, Vault credentials)
 * - AdminAPI (system management)
 * - DatabaseAdapter (direct DB access)
 * - AuditLog (server-side logging)
 *
 * Use this import for React, Vue, or any browser application:
 * ```typescript
 * import { TokenisationSDK, ComplianceEngine } from '@tokenisation/sdk/client';
 * ```
 *
 * @packageDocumentation
 */

// Main SDK (browser-safe subset)
export { TokenisationSDK } from './SDK.js';
export type { SDKConfig, AssetManager, PartyManager, EvidenceManager, TokenManager } from './SDK.js';

// API Client (Stripe-like interface)
export { ApiClient, createApiClient, TokenizationError } from './ApiClient.js';

// Error Classes
export {
  // Base class
  SDKError,
  // Specialized errors
  AuthenticationError,
  ValidationError,
  ComplianceError,
  ContractError,
  NetworkError,
  OracleError,
  AssetError,
  StorageError,
  // Error codes
  ErrorCode,
  // Utilities
  isSDKError,
  hasErrorCode,
  wrapError,
  getErrorMessage,
  formatErrorForUser,
} from './errors/index.js';
export type { ErrorCodeType } from './errors/index.js';

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

// Models (browser-safe)
export * from './models/index.js';

// Auth Plugins (browser-safe)
export {
  SIWEAuthPlugin,
  createSIWEAuthPlugin,
  MetaMaskPlugin,
  createMetaMaskPlugin,
  WalletConnectPlugin,
  createWalletConnectPlugin,
} from './plugins/auth/index.js';
export type {
  SIWEAuthConfig,
  AuthSession,
  WalletConnection,
  MetaMaskPluginConfig,
  ChainParams,
  MetaMaskEventType,
  WalletConnectPluginConfig,
  WalletConnectEventType,
} from './plugins/auth/index.js';

// Browser Storage Plugin
export { BrowserStoragePlugin } from './plugins/BrowserStoragePlugin.js';
export { BrowserEventStore } from './plugins/BrowserEventStore.js';

// Compliance Plugins (browser-safe)
export { JurisdictionPlugin } from './plugins/compliance/JurisdictionPlugin.js';

// Asset Abstraction Layer
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

// Custody & Recovery (read-only client operations)
export {
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

// Indexing (read-only client operations)
export {
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

// Contract Adapters (browser-safe - just interfaces/types for viewing)
export type {
  ERC20AdapterConfig,
  ERC721AdapterConfig,
  ERC1155AdapterConfig,
  TokenTypeInfo,
  TokenComplianceRules,
} from './contracts/index.js';

// Reference Packs (configuration only, no server operations)
export * from './packs/index.js';

// Pre-built UI Components
export * from './components/index.js';

// Extension Modules (browser-safe subset)
export {
  HookPriority,
  DistributionType,
  AllocationStrategy,
  VotingStrategy,
  VoteType,
  ProposalType,
  EscrowType,
  EscrowStatus,
  ReleaseConditionType,
} from './SDK.js';

export type {
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

// Core enums
export {
  LifecycleState,
  RightType,
  TransferabilityMode,
  EvidenceType,
  EvidenceStatus,
  PartyRole,
  PartyType,
} from './SDK.js';

// API Types (for type-safe API calls)
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
  EventMessage,
  EventStatus,
  ChainConfig,
} from './types.js';
