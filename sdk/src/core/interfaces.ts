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
  | 'token';

/**
 * Any plugin interface
 */
export type AnyPlugin =
  | IJurisdictionPlugin
  | ICompliancePlugin
  | IOraclePlugin
  | IStoragePlugin
  | IChainPlugin
  | ITokenAdapter;

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
