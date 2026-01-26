/**
 * TokenisationSDK - Main SDK Class
 *
 * A programmable factory that turns real-world rights, assets, or actions
 * into verifiable, rule-based digital tokens.
 *
 * Usage:
 * ```typescript
 * const sdk = new TokenisationSDK();
 *
 * // Create an asset
 * const asset = await sdk.assets.create({
 *   name: 'Dubai Marina Apartment',
 *   rightType: 'OWNERSHIP',
 *   jurisdiction: { countryCode: 'AE' },
 * });
 *
 * // Mint tokens
 * await sdk.tokens.mint(asset.id, '0x...', '1000000');
 * ```
 */

import { v4 as uuidv4 } from 'uuid';
import {
  LifecycleEngine,
  EventStore,
  PolicyEvaluator,
  LifecycleState,
  RightType,
  TransferabilityMode,
  type IEventStore,
  type RightModel,
  type Result,
  ok,
  err,
  // New extensibility modules
  RightTypeRegistry,
  rightTypeRegistry,
  type RightTypeBehavior,
  StateMachine,
  type StateDefinition,
  type TransitionDefinition,
  HookManager,
  hookManager,
  type HookEvent,
  type HookHandler,
  HookPriority,
  ChainService,
  type ChainConnectionConfig,
} from './core/index.js';
import {
  PluginRegistry,
  createMockJurisdictionPlugin,
  createMockCompliancePlugin,
  createMockStoragePlugin,
  // Production plugins
  JurisdictionPlugin,
  createJurisdictionPlugin,
  type JurisdictionPluginConfig,
  KYCCompliancePlugin,
  createKYCCompliancePlugin,
  type KYCCompliancePluginConfig,
} from './plugins/index.js';
import {
  createAsset,
  createEvidence,
  createParty,
  type Asset,
  type CreateAssetParams,
  type Evidence,
  type CreateEvidenceParams,
  type Party,
  type CreatePartyParams,
  EvidenceType,
  EvidenceStatus,
  PartyRole,
  PartyType,
} from './models/index.js';
import {
  ComplianceService,
  createComplianceService,
  VerificationService,
  createVerificationService,
  AttestationService,
  createMockAttestationService,
  OracleService,
  createOracleService,
  IndexingService,
  createIndexingService,
} from './services/index.js';
import {
  CashFlowEngine,
  type DistributionSchedule,
  type DistributionEvent,
  DistributionType,
  AllocationStrategy,
} from './modules/CashFlow.js';
import {
  GovernanceEngine,
  type Proposal,
  type VoteRecord,
  type Delegation,
  VotingStrategy,
  VoteType,
  ProposalType,
} from './modules/Governance.js';
import {
  EscrowEngine,
  type Escrow,
  type Milestone,
  EscrowType,
  EscrowStatus,
  ReleaseConditionType,
} from './modules/Escrow.js';

/**
 * Production API configuration for real backend integration
 */
export interface ProductionConfig {
  /** API endpoint for the tokenisation backend */
  apiEndpoint: string;

  /** API key for authentication */
  apiKey?: string;

  /** JWT token (alternative to API key) */
  authToken?: string;

  /** Jurisdiction plugin configuration */
  jurisdiction?: JurisdictionPluginConfig;

  /** KYC compliance plugin configuration */
  kyc?: Partial<KYCCompliancePluginConfig>;
}

/**
 * SDK Configuration
 */
export interface SDKConfig {
  /**
   * Use mock plugins for testing/development.
   * When false and production config is provided, uses real plugins.
   * Default: true (for backwards compatibility)
   */
  useMockPlugins?: boolean;

  /**
   * Production configuration for real backend integration.
   * When provided with useMockPlugins=false, enables production mode.
   */
  production?: ProductionConfig;

  /** Chain configuration (optional) */
  chain?: ChainConnectionConfig;

  /** Custom EventStore for persistence */
  eventStore?: IEventStore;
}

/**
 * Asset management interface
 */
export interface AssetManager {
  create(params: CreateAssetParams): Promise<Asset>;
  get(assetId: string): Promise<Asset | null>;
  getAll(): Asset[];
  update(assetId: string, updates: Partial<Asset>): Promise<Result<Asset, string>>;
  transition(assetId: string, toState: LifecycleState, actorId: string): Promise<Result<Asset, string>>;
  verify(assetId: string, verifierId: string): Promise<Result<Asset, string>>;
  activate(assetId: string, actorId: string): Promise<Result<Asset, string>>;
  retire(assetId: string, actorId: string): Promise<Result<Asset, string>>;
  getByState(state: LifecycleState): Asset[];
}

/**
 * Party management interface
 */
export interface PartyManager {
  create(params: CreatePartyParams): Party;
  get(partyId: string): Party | undefined;
  getAll(): Party[];
  update(partyId: string, updates: Partial<Party>): Result<Party, string>;
  setKyc(partyId: string, verified: boolean, expiryDate?: string): Result<Party, string>;
  freeze(partyId: string, reason: string): Result<Party, string>;
  unfreeze(partyId: string): Result<Party, string>;
}

/**
 * Evidence management interface
 */
export interface EvidenceManager {
  create(params: CreateEvidenceParams): Evidence;
  get(evidenceId: string): Evidence | undefined;
  getForAsset(assetId: string): Evidence[];
  verify(evidenceId: string, verifierId: string, method: string): Promise<Result<Evidence, string>>;
  reject(evidenceId: string, verifierId: string, reason: string): Result<Evidence, string>;
}

/**
 * Token operations interface
 */
export interface TokenManager {
  mint(assetId: string, to: string, amount: string): Promise<Result<void, string>>;
  transfer(assetId: string, from: string, to: string, amount: string): Promise<Result<void, string>>;
  burn(assetId: string, from: string, amount: string): Promise<Result<void, string>>;
  getBalance(assetId: string, address: string): Promise<string>;
}

/**
 * Main SDK Class
 */
export class TokenisationSDK {
  // Core components
  private lifecycleEngine: LifecycleEngine;
  private pluginRegistry: PluginRegistry;
  private eventStore: EventStore;
  private policyEvaluator: PolicyEvaluator;
  private chainService?: ChainService;

  // Extension modules
  private _rightTypeRegistry: RightTypeRegistry;
  private _hookManager: HookManager;
  private _cashFlowEngine: CashFlowEngine;
  private _governanceEngine: GovernanceEngine;
  private _escrowEngine: EscrowEngine;

  // Services
  private complianceService: ComplianceService;
  private verificationService: VerificationService;
  private attestationService: AttestationService;
  private oracleService: OracleService;
  private indexingService: IndexingService;

  // Data stores
  private parties: Map<string, Party> = new Map();
  private evidences: Map<string, Evidence> = new Map();
  private evidencesByAsset: Map<string, string[]> = new Map();

  // Configuration
  private config: SDKConfig;

  // Public interfaces
  public readonly assets: AssetManager;
  public readonly parties_: PartyManager;
  public readonly evidence: EvidenceManager;
  public readonly tokens: TokenManager;

  constructor(config: SDKConfig = {}) {
    this.config = {
      useMockPlugins: true,
      ...config,
    };

    // Initialize core components
    this.eventStore = (config.eventStore as EventStore) || new EventStore();
    this.policyEvaluator = new PolicyEvaluator();
    this.lifecycleEngine = new LifecycleEngine(this.eventStore, this.policyEvaluator);
    this.lifecycleEngine = new LifecycleEngine(this.eventStore, this.policyEvaluator);
    this.pluginRegistry = new PluginRegistry();

    // Initialize chain service if config provided
    if (this.config.chain) {
      this.chainService = new ChainService(this.config.chain);
    }

    // Initialize extension modules (use singletons for global state)
    this._rightTypeRegistry = rightTypeRegistry;
    this._hookManager = hookManager;
    this._cashFlowEngine = new CashFlowEngine();
    this._governanceEngine = new GovernanceEngine();
    this._escrowEngine = new EscrowEngine();

    // Initialize services
    this.complianceService = createComplianceService();
    this.verificationService = createVerificationService();
    this.attestationService = createMockAttestationService('sdk-attester');
    this.oracleService = createOracleService();
    this.indexingService = createIndexingService();

    // Register plugins based on configuration
    if (this.config.useMockPlugins !== false) {
      // Default to mock plugins for backwards compatibility
      this.registerMockPlugins();
    } else if (this.config.production) {
      // Use production plugins when explicitly configured
      this.registerProductionPlugins(this.config.production);
    }

    // Connect services
    this.policyEvaluator.setRegistry(this.pluginRegistry);
    this.complianceService.setRegistry(this.pluginRegistry);
    if (this.chainService) {
      this.complianceService.setChainService(this.chainService);
    }

    // Initialize public interfaces
    this.assets = this.createAssetManager();
    this.parties_ = this.createPartyManager();
    this.evidence = this.createEvidenceManager();
    this.tokens = this.createTokenManager();
  }

  /**
   * Register mock plugins for testing/development
   */
  private registerMockPlugins(): void {
    this.pluginRegistry.register('jurisdiction', createMockJurisdictionPlugin());
    this.pluginRegistry.register('compliance', createMockCompliancePlugin());
    this.pluginRegistry.register('storage', createMockStoragePlugin());
  }

  /**
   * Register production plugins for real backend integration
   */
  private registerProductionPlugins(config: ProductionConfig): void {
    // Register production jurisdiction plugin with regulatory frameworks
    const jurisdictionPlugin = createJurisdictionPlugin(config.jurisdiction);
    this.pluginRegistry.register('jurisdiction', jurisdictionPlugin);

    // Register production KYC compliance plugin
    const kycPlugin = createKYCCompliancePlugin(
      config.apiEndpoint,
      config.apiKey || '',
      config.kyc
    );
    this.pluginRegistry.register('compliance', kycPlugin);

    // Note: Storage plugin currently uses mock - API storage will be added
    // when the backend storage endpoints are fully implemented
    this.pluginRegistry.register('storage', createMockStoragePlugin());
  }

  /**
   * Check if SDK is running in production mode
   */
  isProductionMode(): boolean {
    return this.config.useMockPlugins === false && !!this.config.production;
  }

  /**
   * Get the production configuration (if in production mode)
   */
  getProductionConfig(): ProductionConfig | undefined {
    return this.config.production;
  }

  /**
   * Create asset manager
   */
  private createAssetManager(): AssetManager {
    return {
      create: async (params: CreateAssetParams): Promise<Asset> => {
        const asset = createAsset(params);
        await this.lifecycleEngine.registerAsset(asset);
        return asset;
      },

      get: async (assetId: string): Promise<Asset | null> => {
        const asset = await this.lifecycleEngine.getAsset(assetId);
        return asset as Asset | null;
      },

      getAll: (): Asset[] => {
        return this.lifecycleEngine.getAllAssets() as Asset[];
      },

      update: async (assetId: string, updates: Partial<Asset>): Promise<Result<Asset, string>> => {
        const asset = await this.lifecycleEngine.getAsset(assetId);
        if (!asset) {
          return err(`Asset ${assetId} not found`);
        }

        const updated = { ...asset, ...updates, updatedAt: new Date().toISOString() } as Asset;
        await this.lifecycleEngine.registerAsset(updated);
        return ok(updated);
      },

      transition: async (assetId: string, toState: LifecycleState, actorId: string): Promise<Result<Asset, string>> => {
        const currentState = await this.lifecycleEngine.getState(assetId);
        if (!currentState) {
          return err(`Asset ${assetId} not found`);
        }

        const result = await this.lifecycleEngine.transition({
          assetId,
          fromState: currentState,
          toState,
          actorId,
        });

        if (!result.success) {
          return err(result.error || 'Transition failed');
        }

        const asset = await this.lifecycleEngine.getAsset(assetId);
        return ok(asset as Asset);
      },

      verify: async (assetId: string, verifierId: string): Promise<Result<Asset, string>> => {
        return this.assets.transition(assetId, LifecycleState.VERIFIED, verifierId);
      },

      activate: async (assetId: string, actorId: string): Promise<Result<Asset, string>> => {
        return this.assets.transition(assetId, LifecycleState.ACTIVE, actorId);
      },

      retire: async (assetId: string, actorId: string): Promise<Result<Asset, string>> => {
        return this.assets.transition(assetId, LifecycleState.BURNED, actorId);
      },

      getByState: (state: LifecycleState): Asset[] => {
        return this.lifecycleEngine.getAssetsByState(state) as Asset[];
      },
    };
  }

  /**
   * Create party manager
   */
  private createPartyManager(): PartyManager {
    return {
      create: (params: CreatePartyParams): Party => {
        const party = createParty(params);
        this.parties.set(party.id, party);
        return party;
      },

      get: (partyId: string): Party | undefined => {
        return this.parties.get(partyId);
      },

      getAll: (): Party[] => {
        return Array.from(this.parties.values());
      },

      update: (partyId: string, updates: Partial<Party>): Result<Party, string> => {
        const party = this.parties.get(partyId);
        if (!party) {
          return err(`Party ${partyId} not found`);
        }

        const updated = { ...party, ...updates, updatedAt: new Date().toISOString() };
        this.parties.set(partyId, updated);
        return ok(updated);
      },

      setKyc: (partyId: string, verified: boolean, expiryDate?: string): Result<Party, string> => {
        const party = this.parties.get(partyId);
        if (!party) {
          return err(`Party ${partyId} not found`);
        }

        // Update compliance service
        const compliance = this.pluginRegistry.getCompliance('mock-compliance');
        if (compliance) {
          (compliance as any).setKycVerified(partyId, verified, expiryDate);
        }

        return this.parties_.update(partyId, {
          verificationLevel: verified ? 'STANDARD' : 'NONE',
        } as Partial<Party>);
      },

      freeze: (partyId: string, reason: string): Result<Party, string> => {
        const party = this.parties.get(partyId);
        if (!party) {
          return err(`Party ${partyId} not found`);
        }

        return this.parties_.update(partyId, {
          isFrozen: true,
          freezeReason: reason,
        });
      },

      unfreeze: (partyId: string): Result<Party, string> => {
        const party = this.parties.get(partyId);
        if (!party) {
          return err(`Party ${partyId} not found`);
        }

        return this.parties_.update(partyId, {
          isFrozen: false,
          freezeReason: undefined,
        });
      },
    };
  }

  /**
   * Create evidence manager
   */
  private createEvidenceManager(): EvidenceManager {
    return {
      create: (params: CreateEvidenceParams): Evidence => {
        const evidence = createEvidence(params);
        this.evidences.set(evidence.id, evidence);

        // Index by asset
        const assetEvidences = this.evidencesByAsset.get(params.assetId) || [];
        assetEvidences.push(evidence.id);
        this.evidencesByAsset.set(params.assetId, assetEvidences);

        return evidence;
      },

      get: (evidenceId: string): Evidence | undefined => {
        return this.evidences.get(evidenceId);
      },

      getForAsset: (assetId: string): Evidence[] => {
        const evidenceIds = this.evidencesByAsset.get(assetId) || [];
        return evidenceIds
          .map((id) => this.evidences.get(id))
          .filter((e): e is Evidence => e !== undefined);
      },

      verify: async (evidenceId: string, verifierId: string, method: string): Promise<Result<Evidence, string>> => {
        const evidence = this.evidences.get(evidenceId);
        if (!evidence) {
          return err(`Evidence ${evidenceId} not found`);
        }

        // Verify using verification service
        const verificationResult = await this.verificationService.verifyEvidence(evidence);
        if (!verificationResult.isValid) {
          return err(`Evidence verification failed: ${verificationResult.errors.join(', ')}`);
        }

        // Create attestation
        await this.attestationService.createAttestation(evidence);

        // Update evidence
        const updated: Evidence = {
          ...evidence,
          status: EvidenceStatus.VERIFIED,
          verifier: {
            verifierId,
            verifiedAt: new Date().toISOString(),
            verificationMethod: method,
          },
          updatedAt: new Date().toISOString(),
          version: evidence.version + 1,
        };

        this.evidences.set(evidenceId, updated);
        return ok(updated);
      },

      reject: (evidenceId: string, verifierId: string, reason: string): Result<Evidence, string> => {
        const evidence = this.evidences.get(evidenceId);
        if (!evidence) {
          return err(`Evidence ${evidenceId} not found`);
        }

        const updated: Evidence = {
          ...evidence,
          status: EvidenceStatus.REJECTED,
          verifier: {
            verifierId,
            verifiedAt: new Date().toISOString(),
            verificationMethod: 'MANUAL_REJECTION',
            notes: reason,
          },
          updatedAt: new Date().toISOString(),
          version: evidence.version + 1,
        };

        this.evidences.set(evidenceId, updated);
        return ok(updated);
      },
    };
  }

  /**
   * Create token manager
   */
  private createTokenManager(): TokenManager {
    return {
      mint: async (assetId: string, to: string, amount: string): Promise<Result<void, string>> => {
        const asset = (await this.lifecycleEngine.getAsset(assetId)) as Asset;
        if (!asset) {
          return err(`Asset ${assetId} not found`);
        }

        if (asset.state !== LifecycleState.ACTIVE) {
          return err(`Asset must be ACTIVE to mint tokens`);
        }

        // Simulate mint
        if (this.chainService && asset.tokenInfo?.contractAddress) {
          // Real Mint using ChainService
          const result = await this.chainService.writeContract(
            asset.tokenInfo.contractAddress as `0x${string}`,
            [`function mint(address to, uint256 amount) external`], // TODO: Use real ABI
            'mint',
            [to, BigInt(amount)]
          );
          if (!result.success) return err(result.error);
        } else {
          // Simulation (Fallback)
          this.indexingService.simulateTransfer({
            contractAddress: assetId,
            from: '0x0000000000000000000000000000000000000000',
            to,
            amount,
          });
        }

        return ok(undefined);
      },

      transfer: async (assetId: string, from: string, to: string, amount: string): Promise<Result<void, string>> => {
        const asset = (await this.lifecycleEngine.getAsset(assetId)) as Asset;
        if (!asset) {
          return err(`Asset ${assetId} not found`);
        }

        if (asset.state !== LifecycleState.ACTIVE) {
          return err(`Asset must be ACTIVE for transfers`);
        }

        // Check compliance
        const fromParty = Array.from(this.parties.values()).find(
          (p) => p.wallets?.some((w) => w.address.toLowerCase() === from.toLowerCase())
        );
        const toParty = Array.from(this.parties.values()).find(
          (p) => p.wallets?.some((w) => w.address.toLowerCase() === to.toLowerCase())
        );

        if (fromParty && toParty) {
          const complianceResult = await this.complianceService.evaluateTransfer({
            from: fromParty,
            to: toParty,
            asset: asset as Asset,
            amount,
          });

          if (!complianceResult.allowed) {
            return err(`Transfer not compliant: ${complianceResult.violations.map((v) => v.message).join(', ')}`);
          }
        }

        // Simulate transfer
        if (this.chainService && asset.tokenInfo?.contractAddress) {
          // Real Transfer using ChainService
          const result = await this.chainService.writeContract(
            asset.tokenInfo.contractAddress as `0x${string}`,
            [`function transfer(address to, uint256 amount) external`], // TODO: Use real ABI
            'transfer',
            [to, BigInt(amount)]
          );
          if (!result.success) return err(result.error);
        } else {
          // Simulation (Fallback)
          this.indexingService.simulateTransfer({
            contractAddress: assetId,
            from,
            to,
            amount,
          });
        }

        return ok(undefined);
      },

      burn: async (assetId: string, from: string, amount: string): Promise<Result<void, string>> => {
        const asset = (await this.lifecycleEngine.getAsset(assetId)) as Asset;
        if (!asset) {
          return err(`Asset ${assetId} not found`);
        }

        // Simulate burn
        this.indexingService.simulateTransfer({
          contractAddress: assetId,
          from,
          to: '0x0000000000000000000000000000000000000000',
          amount,
        });

        return ok(undefined);
      },

      getBalance: async (assetId: string, address: string): Promise<string> => {
        return this.indexingService.getHolderBalance(assetId, address);
      },
    };
  }

  // ============================================================================
  // PUBLIC GETTERS
  // ============================================================================

  /** Get the lifecycle engine */
  get engine(): LifecycleEngine {
    return this.lifecycleEngine;
  }

  /** Get the plugin registry */
  get plugins(): PluginRegistry {
    return this.pluginRegistry;
  }

  /** Get the compliance service */
  get compliance(): ComplianceService {
    return this.complianceService;
  }

  /** Get the verification service */
  get verification(): VerificationService {
    return this.verificationService;
  }

  /** Get the oracle service */
  get oracle(): OracleService {
    return this.oracleService;
  }

  /** Get the indexing service */
  get indexer(): IndexingService {
    return this.indexingService;
  }

  /** Get the event store */
  get events(): EventStore {
    return this.eventStore;
  }

  // ============================================================================
  // EXTENSION MODULES
  // ============================================================================

  /** Get the right type registry for registering custom right types */
  get rightTypes(): RightTypeRegistry {
    return this._rightTypeRegistry;
  }

  /** Get the hook manager for lifecycle hooks */
  get hooks(): HookManager {
    return this._hookManager;
  }

  /** Get the cash flow engine for distributions */
  get cashFlow(): CashFlowEngine {
    return this._cashFlowEngine;
  }

  /** Get the governance engine for proposals and voting */
  get governance(): GovernanceEngine {
    return this._governanceEngine;
  }

  /** Get the escrow engine for conditional transfers */
  get escrow(): EscrowEngine {
    return this._escrowEngine;
  }

  // ============================================================================
  // CONVENIENCE METHODS FOR EXTENSION MODULES
  // ============================================================================

  /**
   * Register a lifecycle hook
   */
  registerHook<T = unknown>(
    event: HookEvent,
    timing: 'before' | 'after',
    handler: HookHandler<T>,
    options?: { id?: string; priority?: HookPriority; description?: string }
  ): string {
    return this._hookManager.register(event, timing, handler, options);
  }
}

// Re-export commonly used types and enums for convenience
export {
  // Core types
  LifecycleState,
  RightType,
  TransferabilityMode,
  EvidenceType,
  EvidenceStatus,
  PartyRole,
  PartyType,

  // Extension modules
  HookPriority,
  DistributionType,
  AllocationStrategy,
  VotingStrategy,
  VoteType,
  ProposalType,
  EscrowType,
  EscrowStatus,
  ReleaseConditionType,
};

export type {
  // Core types
  Asset,
  Evidence,
  Party,
  CreateAssetParams,
  CreateEvidenceParams,
  CreatePartyParams,
  RightModel,
  Result,

  // Extension types
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

  // Production configuration types
  JurisdictionPluginConfig,
  KYCCompliancePluginConfig,
};

// Re-export extension module classes for direct usage
export {
  RightTypeRegistry,
  rightTypeRegistry,
  StateMachine,
  HookManager,
  hookManager,
  CashFlowEngine,
  GovernanceEngine,
  EscrowEngine,
};
