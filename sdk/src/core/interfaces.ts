/**
 * Plugin Interfaces for the Tokenisation SDK
 *
 * These interfaces define the contract for swappable plugins.
 * Only the rules, plugins, and oracles change between different asset types.
 */

import type {
  RightModel,
  TransferContext,
  Result,
  LifecycleState,
  BaseEvent,
} from './types.js';

// ============================================================================
// JURISDICTION PLUGIN
// ============================================================================

/**
 * Jurisdiction check result
 */
export interface JurisdictionCheckResult {
  allowed: boolean;
  reason?: string;
  restrictions?: string[];
  requiredDocuments?: string[];
}

/**
 * IJurisdictionPlugin - Defines legal wrapper for the Right
 * Handles jurisdiction-specific rules and restrictions.
 *
 * Reference: UAE VARA, US SEC, EU MiFID frameworks
 */
export interface IJurisdictionPlugin {
  /** Plugin identifier */
  readonly pluginId: string;

  /** Supported jurisdictions (ISO country codes) */
  readonly supportedJurisdictions: string[];

  /**
   * Check if an asset can be created in a jurisdiction
   */
  canCreateAsset(asset: RightModel): Promise<JurisdictionCheckResult>;

  /**
   * Check if a transfer is allowed between parties in different jurisdictions
   */
  canTransfer(
    context: TransferContext,
    fromJurisdiction: string,
    toJurisdiction: string
  ): Promise<JurisdictionCheckResult>;

  /**
   * Get required documents for a jurisdiction
   */
  getRequiredDocuments(jurisdictionCode: string, assetType: string): string[];

  /**
   * Validate jurisdiction-specific metadata
   */
  validateMetadata(asset: RightModel): Promise<Result<void, string>>;
}

// ============================================================================
// COMPLIANCE PLUGIN
// ============================================================================

/**
 * Compliance check result
 */
export interface ComplianceCheckResult {
  compliant: boolean;
  violations: ComplianceViolation[];
  warnings: string[];
}

/**
 * Compliance violation details
 */
export interface ComplianceViolation {
  ruleId: string;
  ruleName: string;
  severity: 'ERROR' | 'WARNING';
  message: string;
  metadata?: Record<string, unknown>;
}

/**
 * Party compliance status
 */
export interface PartyComplianceStatus {
  partyId: string;
  kycVerified: boolean;
  kycExpiryDate?: string;
  accreditedInvestor: boolean;
  frozenUntil?: string;
  restrictedJurisdictions: string[];
}

/**
 * ICompliancePlugin - The "Brain" of RWA permissions
 * Handles KYC, investor accreditation, transfer restrictions.
 *
 * Reference: ERC-3643 T-REX Compliance
 */
export interface ICompliancePlugin {
  /** Plugin identifier */
  readonly pluginId: string;

  /**
   * Evaluate if a transfer is compliant
   */
  evaluateTransfer(
    context: TransferContext,
    fromStatus: PartyComplianceStatus,
    toStatus: PartyComplianceStatus
  ): Promise<ComplianceCheckResult>;

  /**
   * Check if a party can hold an asset
   */
  canHoldAsset(
    partyId: string,
    asset: RightModel,
    status: PartyComplianceStatus
  ): Promise<ComplianceCheckResult>;

  /**
   * Check a specific policy rule
   */
  checkPolicy(
    ruleId: string,
    context: Record<string, unknown>
  ): Promise<ComplianceCheckResult>;

  /**
   * Get compliance status for a party
   */
  getPartyStatus(partyId: string): Promise<PartyComplianceStatus | null>;

  /**
   * Update compliance status for a party
   */
  updatePartyStatus(
    partyId: string,
    status: Partial<PartyComplianceStatus>
  ): Promise<Result<void, string>>;

  /**
   * Freeze a party's assets
   */
  freezeParty(partyId: string, until?: string, reason?: string): Promise<Result<void, string>>;

  /**
   * Unfreeze a party
   */
  unfreezeParty(partyId: string): Promise<Result<void, string>>;
}

// ============================================================================
// ORACLE PLUGIN
// ============================================================================

/**
 * Oracle data point
 */
export interface OracleDataPoint {
  source: string;
  value: unknown;
  timestamp: string;
  signature?: string;
  confidence?: number;
}

/**
 * Oracle request
 */
export interface OracleRequest {
  dataType: string;
  parameters: Record<string, unknown>;
  timeout?: number;
}

/**
 * IOraclePlugin - Bridge to off-chain data
 * Fetches external data for verification and pricing.
 *
 * Integration Points:
 * - Chainlink Functions for custom API data
 * - Chainlink PoR for asset backing verification
 */
export interface IOraclePlugin {
  /** Plugin identifier */
  readonly pluginId: string;

  /** Supported data types */
  readonly supportedDataTypes: string[];

  /**
   * Fetch data from oracle
   */
  fetchData(request: OracleRequest): Promise<Result<OracleDataPoint, string>>;

  /**
   * Subscribe to data updates
   */
  subscribe(
    request: OracleRequest,
    callback: (data: OracleDataPoint) => void
  ): Promise<{ unsubscribe: () => void }>;

  /**
   * Verify oracle data signature
   */
  verifySignature(dataPoint: OracleDataPoint): Promise<boolean>;

  /**
   * Get current NAV (Net Asset Value) for an asset
   */
  getNAV(assetId: string): Promise<Result<OracleDataPoint, string>>;
}

// ============================================================================
// STORAGE PLUGIN
// ============================================================================

/**
 * Storage metadata
 */
export interface StorageMetadata {
  contentHash: string;
  size: number;
  mimeType: string;
  uploadedAt: string;
  uri: string;
}

/**
 * IStoragePlugin - Decentralized storage interface
 * Handles off-chain evidence storage (deeds, certificates, etc.)
 *
 * Reference: IPFS, Filebase, Pinata
 */
export interface IStoragePlugin {
  /** Plugin identifier */
  readonly pluginId: string;

  /** Storage provider name */
  readonly providerName: string;

  /**
   * Store content and return its hash/URI
   */
  store(content: Buffer | string, filename?: string): Promise<Result<StorageMetadata, string>>;

  /**
   * Retrieve content by hash/URI
   */
  retrieve(uri: string): Promise<Result<Buffer, string>>;

  /**
   * Check if content exists
   */
  exists(uri: string): Promise<boolean>;

  /**
   * Pin content to ensure persistence
   */
  pin(uri: string): Promise<Result<void, string>>;

  /**
   * Unpin content
   */
  unpin(uri: string): Promise<Result<void, string>>;

  /**
   * Get storage metadata
   */
  getMetadata(uri: string): Promise<Result<StorageMetadata, string>>;
}

// ============================================================================
// CHAIN PLUGIN
// ============================================================================

/**
 * Transaction receipt
 */
export interface TransactionReceipt {
  transactionHash: string;
  blockNumber: number;
  blockHash: string;
  status: 'SUCCESS' | 'REVERTED' | 'PENDING';
  gasUsed: string;
  logs: TransactionLog[];
}

/**
 * Transaction log
 */
export interface TransactionLog {
  address: string;
  topics: string[];
  data: string;
  logIndex: number;
}

/**
 * Chain configuration
 */
export interface ChainConfig {
  chainId: number;
  name: string;
  rpcUrl: string;
  explorerUrl?: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
}

/**
 * IChainPlugin - Blockchain adapter interface
 * Abstracts interaction with different blockchains.
 *
 * Reference: Centrifuge Adapter pattern
 */
export interface IChainPlugin {
  /** Plugin identifier */
  readonly pluginId: string;

  /** Chain configuration */
  readonly chainConfig: ChainConfig;

  /**
   * Connect to the blockchain
   */
  connect(): Promise<Result<void, string>>;

  /**
   * Disconnect from the blockchain
   */
  disconnect(): Promise<void>;

  /**
   * Check if connected
   */
  isConnected(): boolean;

  /**
   * Get current block number
   */
  getBlockNumber(): Promise<number>;

  /**
   * Send a raw transaction
   */
  sendTransaction(tx: {
    to: string;
    data: string;
    value?: string;
    gasLimit?: string;
  }): Promise<Result<TransactionReceipt, string>>;

  /**
   * Call a contract method (read-only)
   */
  call(params: {
    to: string;
    data: string;
  }): Promise<Result<string, string>>;

  /**
   * Wait for transaction confirmation
   */
  waitForTransaction(
    txHash: string,
    confirmations?: number
  ): Promise<Result<TransactionReceipt, string>>;

  /**
   * Get transaction receipt
   */
  getTransactionReceipt(txHash: string): Promise<TransactionReceipt | null>;

  /**
   * Subscribe to contract events
   */
  subscribeToEvents(
    contractAddress: string,
    eventSignature: string,
    callback: (log: TransactionLog) => void
  ): Promise<{ unsubscribe: () => void }>;
}

// ============================================================================
// TOKEN ADAPTER INTERFACE
// ============================================================================

/**
 * Token info
 */
export interface TokenInfo {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: string;
  tokenType: 'ERC20' | 'ERC721' | 'ERC1155' | 'SBT' | 'ERC1410' | 'ERC4626' | 'ERC3643';
}

/**
 * ITokenAdapter - Abstract token layer
 * Provides unified interface for different token standards.
 */
export interface ITokenAdapter {
  /** Plugin identifier */
  readonly pluginId: string;

  /** Token information */
  readonly tokenInfo: TokenInfo;

  /**
   * Mint tokens to an address
   */
  mint(to: string, amount: string, tokenId?: string): Promise<Result<TransactionReceipt, string>>;

  /**
   * Transfer tokens between addresses
   */
  transfer(
    from: string,
    to: string,
    amount: string,
    tokenId?: string
  ): Promise<Result<TransactionReceipt, string>>;

  /**
   * Burn tokens
   */
  burn(from: string, amount: string, tokenId?: string): Promise<Result<TransactionReceipt, string>>;

  /**
   * Freeze an account
   */
  freeze(target: string): Promise<Result<TransactionReceipt, string>>;

  /**
   * Unfreeze an account
   */
  unfreeze(target: string): Promise<Result<TransactionReceipt, string>>;

  /**
   * Get balance for an address
   */
  balanceOf(address: string, tokenId?: string): Promise<string>;

  /**
   * Check if an address is frozen
   */
  isFrozen(address: string): Promise<boolean>;

  /**
   * Get token URI (for NFTs)
   */
  tokenURI?(tokenId: string): Promise<string>;
}

// ============================================================================
// PLUGIN REGISTRY INTERFACE
// ============================================================================

/**
 * Plugin types that can be registered
 */
export type PluginType =
  | 'jurisdiction'
  | 'compliance'
  | 'oracle'
  | 'storage'
  | 'chain'
  | 'token'
  | 'ace';

/**
 * Any plugin interface
 */
export type AnyPlugin =
  | IJurisdictionPlugin
  | ICompliancePlugin
  | IOraclePlugin
  | IStoragePlugin
  | IChainPlugin
  | ITokenAdapter
  | IAcePlugin;

/**
 * IPluginRegistry - Central registry for all plugins
 */
export interface IPluginRegistry {
  /**
   * Register a plugin
   */
  register<T extends AnyPlugin>(type: PluginType, plugin: T): void;

  /**
   * Get a plugin by type and ID
   */
  get<T extends AnyPlugin>(type: PluginType, pluginId: string): T | undefined;

  /**
   * Get all plugins of a type
   */
  getAll<T extends AnyPlugin>(type: PluginType): T[];

  /**
   * Check if a plugin is registered
   */
  has(type: PluginType, pluginId: string): boolean;

  /**
   * Unregister a plugin
   */
  unregister(type: PluginType, pluginId: string): boolean;
}

// ============================================================================
// LIFECYCLE ENGINE INTERFACE
// ============================================================================

/**
 * State transition request
 */
export interface StateTransitionRequest {
  assetId: string;
  fromState: LifecycleState;
  toState: LifecycleState;
  actorId: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

/**
 * State transition result
 */
export interface StateTransitionResult {
  success: boolean;
  previousState: LifecycleState;
  newState: LifecycleState;
  event?: BaseEvent;
  error?: string;
}

/**
 * Transition guard function
 */
export type TransitionGuard = (
  asset: RightModel,
  request: StateTransitionRequest
) => Promise<Result<void, string>>;

/**
 * ILifecycleEngine - Core state machine interface
 * Owns the truth about asset states. Transitions are enforced here.
 */
export interface ILifecycleEngine {
  /**
   * Get current state of an asset
   */
  getState(assetId: string): Promise<LifecycleState | null>;

  /**
   * Request a state transition
   */
  transition(request: StateTransitionRequest): Promise<StateTransitionResult>;

  /**
   * Check if a transition is valid
   */
  canTransition(fromState: LifecycleState, toState: LifecycleState): boolean;

  /**
   * Register a transition guard
   */
  registerGuard(
    fromState: LifecycleState,
    toState: LifecycleState,
    guard: TransitionGuard
  ): void;

  /**
   * Get valid next states from current state
   */
  getValidNextStates(currentState: LifecycleState): LifecycleState[];

  /**
   * Get transition history for an asset
   */
  getHistory(assetId: string): Promise<BaseEvent[]>;

  /**
   * Rebuild state from persistent storage
   */
  hydrate(): Promise<void>;
}

// ============================================================================
// EVENT STORE INTERFACE
// ============================================================================

/**
 * Event query options
 */
export interface EventQueryOptions {
  assetId?: string;
  types?: string[];
  fromTimestamp?: string;
  toTimestamp?: string;
  limit?: number;
  offset?: number;
}

/**
 * IEventStore - Append-only event ledger
 * Records all state changes for auditability.
 */
export interface IEventStore {
  /**
   * Append an event
   */
  append(event: BaseEvent): Promise<void>;

  /**
   * Query events
   */
  query(options: EventQueryOptions): Promise<BaseEvent[]>;

  /**
   * Get events for an asset
   */
  getByAssetId(assetId: string): Promise<BaseEvent[]>;

  /**
   * Get event by ID
   */
  getById(eventId: string): Promise<BaseEvent | null>;

  /**
   * Get all events (for rebuilding state)
   */
  getAll(): Promise<BaseEvent[]>;

  /**
   * Get event count
   */
  count(): Promise<number>;
}

// ============================================================================
// ACE (AUTOMATED COMPLIANCE ENGINE) INTERFACES
// ============================================================================

/**
 * ACE Attestation types - matches on-chain enum
 */
export enum ACEAttestationType {
  /** KYC/AML verification */
  IDENTITY_VERIFICATION = 'IDENTITY_VERIFICATION',
  /** Investor accreditation status */
  ACCREDITATION = 'ACCREDITATION',
  /** OFAC/sanctions check */
  SANCTIONS_SCREENING = 'SANCTIONS_SCREENING',
  /** Geographic eligibility */
  JURISDICTION_CHECK = 'JURISDICTION_CHECK',
  /** Per-transfer compliance check */
  TRANSFER_COMPLIANCE = 'TRANSFER_COMPLIANCE',
  /** Custom attestation type */
  CUSTOM = 'CUSTOM',
}

/**
 * ACE Attestation status
 */
export enum ACEAttestationStatus {
  PENDING = 'PENDING',
  VALID = 'VALID',
  EXPIRED = 'EXPIRED',
  REVOKED = 'REVOKED',
  FAILED = 'FAILED',
}

/**
 * ACE Attestation - Decentralized compliance attestation from Chainlink DON
 * Provides CCID-compatible attestations for DeFi composability
 */
export interface ACEAttestation {
  /** Unique attestation identifier */
  attestationId: string;
  /** Subject address the attestation is for */
  subject: string;
  /** Type of attestation */
  type: ACEAttestationType;
  /** Whether the compliance check passed */
  passed: boolean;
  /** ISO 8601 timestamp when attestation expires */
  validUntil: string;
  /** CCID-compatible schema ID for DeFi integration */
  schemaId: string;
  /** DON multi-sig signature */
  signature: string;
  /** ISO 8601 timestamp of attestation creation */
  timestamp: string;
  /** Number of DON nodes that confirmed */
  nodeCount: number;
  /** Required threshold for consensus */
  threshold: number;
  /** Current attestation status */
  status: ACEAttestationStatus;
}

/**
 * ACE Attestation Request
 */
export interface ACERequest {
  /** Subject address for the attestation */
  subject: string;
  /** Type of attestation requested */
  attestationType: ACEAttestationType;
  /** Hash of transfer context (for transfer compliance) */
  contextHash?: string;
  /** Additional data for the request */
  additionalData?: Record<string, unknown>;
}

/**
 * ACE Consensus info for audit trail
 */
export interface ACEConsensusInfo {
  /** Number of nodes that participated */
  nodeCount: number;
  /** Required threshold for consensus */
  threshold: number;
  /** ISO 8601 timestamp of consensus */
  timestamp: string;
}

/**
 * ACE Transfer compliance check parameters
 */
export interface ACETransferCheckParams {
  /** Sender address */
  from: string;
  /** Recipient address */
  to: string;
  /** Asset ID */
  assetId: string;
  /** Transfer amount as string (BigNumber compatible) */
  amount: string;
  /** Optional: token contract address */
  tokenAddress?: string;
}

/**
 * IAcePlugin - Plugin interface for Chainlink ACE integration
 * Provides decentralized compliance attestations via Chainlink DON
 *
 * Integration Points:
 * - ACERouter.sol for on-chain attestation storage
 * - ACEComplianceModule.sol for transfer compliance
 * - CCID compatibility for DeFi protocol integration
 */
export interface IAcePlugin {
  /** Plugin identifier */
  readonly pluginId: string;

  /** ACE Router contract address */
  readonly routerAddress: string;

  /**
   * Request a new attestation from the ACE DON
   * @param request The attestation request
   * @returns Request ID for tracking
   */
  requestAttestation(request: ACERequest): Promise<Result<string, string>>;

  /**
   * Get an attestation by ID
   * @param attestationId The attestation ID
   * @returns The attestation data
   */
  getAttestation(attestationId: string): Promise<Result<ACEAttestation, string>>;

  /**
   * Check if an attestation is currently valid
   * @param attestationId The attestation ID
   * @returns Whether the attestation is valid
   */
  isAttestationValid(attestationId: string): Promise<boolean>;

  /**
   * Get a cached attestation for a subject and type
   * @param subject The subject address
   * @param type The attestation type
   * @returns The cached attestation or null if none exists
   */
  getCachedAttestation(
    subject: string,
    type: ACEAttestationType
  ): Promise<ACEAttestation | null>;

  /**
   * Check transfer compliance with fresh or cached attestation
   * @param params Transfer parameters
   * @returns The attestation result for the transfer
   */
  checkTransferCompliance(
    params: ACETransferCheckParams
  ): Promise<Result<ACEAttestation, string>>;

  /**
   * Check if subject has all required attestations for a transfer
   * @param subject The subject address
   * @param requiredTypes Array of required attestation types
   * @returns Whether all attestations are valid
   */
  hasRequiredAttestations(
    subject: string,
    requiredTypes: ACEAttestationType[]
  ): Promise<boolean>;

  /**
   * Subscribe to attestation events
   * @param callback Callback for attestation events
   * @returns Unsubscribe function
   */
  subscribeToAttestations(
    callback: (attestation: ACEAttestation) => void
  ): Promise<{ unsubscribe: () => void }>;

  /**
   * Get consensus info for an attestation
   * @param attestationId The attestation ID
   * @returns Consensus info
   */
  getConsensusInfo(attestationId: string): Promise<ACEConsensusInfo | null>;
}

// ============================================================================
// CUSTOM CONDITION EVALUATOR INTERFACE
// ============================================================================

/**
 * Custom condition evaluation context
 */
export interface CustomConditionContext {
  /** Asset ID being evaluated */
  assetId: string;
  /** Full asset model */
  asset: RightModel;
  /** Actor requesting the transition */
  actorId: string;
  /** Target lifecycle state */
  targetState: LifecycleState;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Custom condition evaluation result
 */
export interface CustomConditionResult {
  /** Whether the condition is satisfied */
  satisfied: boolean;
  /** Reason if not satisfied */
  reason?: string;
  /** Evidence/proof of evaluation (e.g., DLD reference number) */
  evidence?: Record<string, unknown>;
  /** Warnings (non-blocking) */
  warnings?: string[];
}

/**
 * ICustomConditionEvaluator - Evaluates pack-defined custom conditions
 *
 * Custom conditions are defined in AssetPack lifecycle rules using
 * `{ type: 'CUSTOM', customCondition: 'CONDITION_NAME' }`
 *
 * This interface allows jurisdiction-specific or domain-specific
 * condition evaluators to be plugged in (e.g., DLD verification for Dubai).
 */
export interface ICustomConditionEvaluator {
  /** Evaluator identifier */
  readonly evaluatorId: string;

  /** List of condition names this evaluator handles */
  readonly supportedConditions: string[];

  /**
   * Evaluate a custom condition
   * @param conditionName The condition to evaluate (e.g., 'DLD_OWNERSHIP_VERIFIED')
   * @param context The evaluation context
   * @returns Evaluation result
   */
  evaluate(
    conditionName: string,
    context: CustomConditionContext
  ): Promise<CustomConditionResult>;

  /**
   * Check if this evaluator supports a condition
   * @param conditionName The condition name
   */
  supports(conditionName: string): boolean;
}

/**
 * ICustomConditionRegistry - Registry for custom condition evaluators
 */
export interface ICustomConditionRegistry {
  /**
   * Register an evaluator
   */
  register(evaluator: ICustomConditionEvaluator): void;

  /**
   * Get evaluator for a condition
   */
  getEvaluator(conditionName: string): ICustomConditionEvaluator | undefined;

  /**
   * Evaluate a condition using the appropriate evaluator
   */
  evaluate(
    conditionName: string,
    context: CustomConditionContext
  ): Promise<CustomConditionResult>;

  /**
   * List all registered evaluators
   */
  listEvaluators(): ICustomConditionEvaluator[];
}
