/**
 * Chainlink ACE (Automated Compliance Engine) Plugin
 *
 * Provides decentralized compliance attestations via Chainlink DON.
 * Replaces single-point-of-failure backend compliance with DON consensus.
 *
 * Features:
 * - Request attestations from ACE DON
 * - Cache attestations locally (5-minute TTL)
 * - Subscribe to attestation events
 * - Fallback handling for DON unavailability
 * - CCID compatibility for DeFi composability
 */

import { ethers, type Provider, type Signer, type ContractEventPayload } from 'ethers';
import { ok, err, type Result } from '../../core/types.js';
import type {
  IAcePlugin,
  ACEAttestation,
  ACERequest,
  ACEAttestationType,
  ACEAttestationStatus,
  ACEConsensusInfo,
  ACETransferCheckParams,
} from '../../core/interfaces.js';

// ACE Router ABI (minimal interface)
const ACE_ROUTER_ABI = [
  // Read functions
  'function getAttestation(bytes32 attestationId) external view returns (tuple(bytes32 attestationId, address subject, uint8 attestationType, bool passed, uint256 validUntil, bytes32 schemaId, bytes signature, uint256 timestamp, uint8 nodeCount, uint8 threshold, uint8 status))',
  'function isAttestationValid(bytes32 attestationId) external view returns (bool)',
  'function getCachedAttestation(address subject, uint8 attestationType) external view returns (bytes32)',
  'function hasValidAttestation(address subject, uint8 attestationType) external view returns (bool hasValid, bytes32 attestationId)',
  'function signatureThreshold() external view returns (uint8)',
  'function donNodeCount() external view returns (uint8)',
  'function cacheTTL(uint8 attestationType) external view returns (uint256)',
  'function highValueThreshold() external view returns (uint256)',
  'function usePolicyModules() external view returns (bool)',
  'function policyRegistry() external view returns (address)',

  // Write functions
  'function requestAttestation(tuple(address subject, uint8 attestationType, bytes32 contextHash, bytes additionalData)) external returns (bytes32 requestId)',
  'function checkTransferCompliance(address from, address to, uint256 value, address token) external returns (bytes32 requestId)',

  // Policy Module functions
  'function evaluatePolicies(address from, address to, uint256 amount, address token) external view returns (bool allowed, tuple(bool allowed, bytes32 policyId, bytes32 ruleId, string reason, uint256 timestamp, bytes proof)[] results)',
  'function evaluatePoliciesEarly(address from, address to, uint256 amount, address token) external view returns (bool allowed, address failedModule, string reason)',
  'function checkFullCompliance(address from, address to, uint256 amount, address token) external view returns (bool compliant, bytes32 attestationId, tuple(bool allowed, bytes32 policyId, bytes32 ruleId, string reason, uint256 timestamp, bytes proof)[] policyResults)',

  // Events
  'event AttestationRequested(bytes32 indexed requestId, address indexed subject, uint8 attestationType, bytes32 contextHash)',
  'event AttestationFulfilled(bytes32 indexed attestationId, address indexed subject, uint8 attestationType, bool passed, uint256 validUntil)',
  'event AttestationRevoked(bytes32 indexed attestationId, string reason)',
  'event AttestationExpired(bytes32 indexed attestationId)',
  'event FallbackTriggered(bytes32 indexed requestId, string reason)',
  'event PolicyEvaluated(address indexed from, address indexed to, address indexed token, uint256 amount, bool allowed, uint256 moduleCount)',
];

// Attestation type enum values (matches Solidity)
const ATTESTATION_TYPE_MAP: Record<ACEAttestationType, number> = {
  IDENTITY_VERIFICATION: 0,
  ACCREDITATION: 1,
  SANCTIONS_SCREENING: 2,
  JURISDICTION_CHECK: 3,
  TRANSFER_COMPLIANCE: 4,
  CUSTOM: 5,
};

const ATTESTATION_TYPE_REVERSE: Record<number, ACEAttestationType> = {
  0: 'IDENTITY_VERIFICATION' as ACEAttestationType,
  1: 'ACCREDITATION' as ACEAttestationType,
  2: 'SANCTIONS_SCREENING' as ACEAttestationType,
  3: 'JURISDICTION_CHECK' as ACEAttestationType,
  4: 'TRANSFER_COMPLIANCE' as ACEAttestationType,
  5: 'CUSTOM' as ACEAttestationType,
};

const ATTESTATION_STATUS_REVERSE: Record<number, ACEAttestationStatus> = {
  0: 'PENDING' as ACEAttestationStatus,
  1: 'VALID' as ACEAttestationStatus,
  2: 'EXPIRED' as ACEAttestationStatus,
  3: 'REVOKED' as ACEAttestationStatus,
  4: 'FAILED' as ACEAttestationStatus,
};

export interface AcePluginConfig {
  /** Chain ID */
  chainId: number;
  /** RPC URL */
  rpcUrl: string;
  /** ACE Router contract address */
  routerAddress: string;
  /** Private key for signing transactions */
  privateKey?: string;
  /** Request timeout in milliseconds (default 30000) */
  requestTimeout?: number;
  /** Local cache TTL in milliseconds (default 300000 = 5 minutes) */
  localCacheTTL?: number;
  /** Whether to use ACE-first evaluation (default true) */
  aceFirst?: boolean;
  /** Whether to fallback to local compliance on ACE failure (default true) */
  fallbackOnAceFailure?: boolean;
}

interface CachedAttestation {
  attestation: ACEAttestation;
  cachedAt: number;
}

interface PendingRequest {
  resolve: (value: ACEAttestation) => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
}

/**
 * Policy evaluation result from on-chain policy modules
 */
export interface PolicyResult {
  allowed: boolean;
  policyId: string;
  ruleId: string;
  reason: string;
  timestamp: number;
  proof: string;
}

/**
 * Full compliance check result combining attestations and policy modules
 */
export interface FullComplianceResult {
  compliant: boolean;
  attestationId: string | null;
  policyResults: PolicyResult[];
  attestationsValid: boolean;
  policiesPass: boolean;
}

/**
 * Chainlink ACE Plugin
 *
 * Provides decentralized compliance attestations via Chainlink DON consensus.
 */
export class ChainlinkAcePlugin implements IAcePlugin {
  readonly pluginId = 'chainlink-ace';
  readonly routerAddress: string;

  private chainId: number;
  private provider: Provider;
  private signer?: Signer;
  private contract: ethers.Contract;
  private requestTimeout: number;
  private localCacheTTL: number;
  private aceFirst: boolean;
  private fallbackOnAceFailure: boolean;

  // Local cache for attestations
  private cache: Map<string, CachedAttestation> = new Map();

  // Pending request tracking
  private pendingRequests: Map<string, PendingRequest> = new Map();

  // Event subscribers
  private attestationSubscribers: Set<(attestation: ACEAttestation) => void> = new Set();

  constructor(config: AcePluginConfig) {
    this.chainId = config.chainId;
    this.routerAddress = config.routerAddress;
    this.requestTimeout = config.requestTimeout || 30000;
    this.localCacheTTL = config.localCacheTTL || 300000; // 5 minutes
    this.aceFirst = config.aceFirst !== false;
    this.fallbackOnAceFailure = config.fallbackOnAceFailure !== false;

    this.provider = new ethers.JsonRpcProvider(config.rpcUrl, config.chainId);

    if (config.privateKey) {
      this.signer = new ethers.Wallet(config.privateKey, this.provider);
      this.contract = new ethers.Contract(
        config.routerAddress,
        ACE_ROUTER_ABI,
        this.signer
      );
    } else {
      this.contract = new ethers.Contract(
        config.routerAddress,
        ACE_ROUTER_ABI,
        this.provider
      );
    }

    // Set up event listeners
    this._setupEventListeners();
  }

  /**
   * Request a new attestation from the ACE DON
   */
  async requestAttestation(request: ACERequest): Promise<Result<string, string>> {
    if (!this.signer) {
      return err('Signer required for requesting attestations');
    }

    try {
      // Check local cache first
      const cached = await this.getCachedAttestation(request.subject, request.attestationType);
      if (cached) {
        return ok(cached.attestationId);
      }

      // Build request tuple
      const requestTuple = {
        subject: request.subject,
        attestationType: ATTESTATION_TYPE_MAP[request.attestationType],
        contextHash: request.contextHash || ethers.ZeroHash,
        additionalData: request.additionalData
          ? ethers.toUtf8Bytes(JSON.stringify(request.additionalData))
          : '0x',
      };

      // Send transaction
      const tx = await this.contract.requestAttestation(requestTuple);
      const receipt = await tx.wait();

      // Find requestId from event logs
      const requestEvent = receipt.logs.find(
        (log: ethers.Log) =>
          log.topics[0] === ethers.id('AttestationRequested(bytes32,address,uint8,bytes32)')
      );

      if (!requestEvent) {
        return err('AttestationRequested event not found in transaction logs');
      }

      const requestId = requestEvent.topics[1];
      return ok(requestId);
    } catch (error) {
      return err(
        `Failed to request attestation: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get an attestation by ID
   */
  async getAttestation(attestationId: string): Promise<Result<ACEAttestation, string>> {
    try {
      // Check local cache first
      const cacheKey = `id:${attestationId}`;
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.cachedAt < this.localCacheTTL) {
        return ok(cached.attestation);
      }

      // Fetch from contract
      const raw = await this.contract.getAttestation(attestationId);

      const attestation = this._parseAttestation(raw);

      // Cache the result
      this.cache.set(cacheKey, {
        attestation,
        cachedAt: Date.now(),
      });

      return ok(attestation);
    } catch (error) {
      return err(
        `Failed to get attestation: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Check if an attestation is currently valid
   */
  async isAttestationValid(attestationId: string): Promise<boolean> {
    try {
      return await this.contract.isAttestationValid(attestationId);
    } catch {
      return false;
    }
  }

  /**
   * Get a cached attestation for a subject and type
   */
  async getCachedAttestation(
    subject: string,
    type: ACEAttestationType
  ): Promise<ACEAttestation | null> {
    try {
      // Check local cache first
      const cacheKey = `${subject}:${type}`;
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.cachedAt < this.localCacheTTL) {
        // Verify still valid
        if (new Date(cached.attestation.validUntil).getTime() > Date.now()) {
          return cached.attestation;
        }
      }

      // Check on-chain cache
      const attestationId = await this.contract.getCachedAttestation(
        subject,
        ATTESTATION_TYPE_MAP[type]
      );

      if (attestationId === ethers.ZeroHash) {
        return null;
      }

      const result = await this.getAttestation(attestationId);
      if (!result.success) {
        return null;
      }

      // Update local cache
      this.cache.set(cacheKey, {
        attestation: result.data,
        cachedAt: Date.now(),
      });

      return result.data;
    } catch {
      return null;
    }
  }

  /**
   * Check transfer compliance with fresh or cached attestation
   */
  async checkTransferCompliance(
    params: ACETransferCheckParams
  ): Promise<Result<ACEAttestation, string>> {
    if (!this.signer) {
      return err('Signer required for transfer compliance check');
    }

    try {
      // Convert amount to BigInt
      const value = ethers.parseUnits(params.amount, 18);

      // Check if we can use cached attestations
      const fromCached = await this.getCachedAttestation(
        params.from,
        'TRANSFER_COMPLIANCE' as ACEAttestationType
      );
      const toCached = await this.getCachedAttestation(
        params.to,
        'TRANSFER_COMPLIANCE' as ACEAttestationType
      );

      // Check high-value threshold
      const highValueThreshold = await this.contract.highValueThreshold();

      if (value < highValueThreshold && fromCached && toCached) {
        // Can use cached attestation for low-value transfers
        return ok(fromCached);
      }

      // Request fresh attestation
      const tx = await this.contract.checkTransferCompliance(
        params.from,
        params.to,
        value,
        params.tokenAddress || ethers.ZeroAddress
      );

      const receipt = await tx.wait();

      // Find requestId from event
      const requestEvent = receipt.logs.find(
        (log: ethers.Log) =>
          log.topics[0] === ethers.id('AttestationRequested(bytes32,address,uint8,bytes32)')
      );

      if (!requestEvent) {
        return err('AttestationRequested event not found');
      }

      const requestId = requestEvent.topics[1];

      // Wait for attestation fulfillment
      const attestation = await this._waitForAttestation(requestId);
      return ok(attestation);
    } catch (error) {
      return err(
        `Transfer compliance check failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Check if subject has all required attestations for a transfer
   */
  async hasRequiredAttestations(
    subject: string,
    requiredTypes: ACEAttestationType[]
  ): Promise<boolean> {
    try {
      for (const type of requiredTypes) {
        const [hasValid] = await this.contract.hasValidAttestation(
          subject,
          ATTESTATION_TYPE_MAP[type]
        );
        if (!hasValid) {
          return false;
        }
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Subscribe to attestation events
   */
  async subscribeToAttestations(
    callback: (attestation: ACEAttestation) => void
  ): Promise<{ unsubscribe: () => void }> {
    this.attestationSubscribers.add(callback);

    return {
      unsubscribe: () => {
        this.attestationSubscribers.delete(callback);
      },
    };
  }

  /**
   * Get consensus info for an attestation
   */
  async getConsensusInfo(attestationId: string): Promise<ACEConsensusInfo | null> {
    try {
      const result = await this.getAttestation(attestationId);
      if (!result.success) {
        return null;
      }

      return {
        nodeCount: result.data.nodeCount,
        threshold: result.data.threshold,
        timestamp: result.data.timestamp,
      };
    } catch {
      return null;
    }
  }

  // ============================================================================
  // Configuration Methods
  // ============================================================================

  /**
   * Check if ACE-first evaluation is enabled
   */
  isAceFirst(): boolean {
    return this.aceFirst;
  }

  /**
   * Set ACE-first evaluation mode
   */
  setAceFirst(enabled: boolean): void {
    this.aceFirst = enabled;
  }

  /**
   * Check if fallback is enabled
   */
  isFallbackEnabled(): boolean {
    return this.fallbackOnAceFailure;
  }

  /**
   * Set fallback mode
   */
  setFallbackEnabled(enabled: boolean): void {
    this.fallbackOnAceFailure = enabled;
  }

  /**
   * Get current cache TTL
   */
  getLocalCacheTTL(): number {
    return this.localCacheTTL;
  }

  /**
   * Set local cache TTL
   */
  setLocalCacheTTL(ttlMs: number): void {
    this.localCacheTTL = ttlMs;
  }

  /**
   * Clear local cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get DON configuration
   */
  async getDONConfig(): Promise<{
    threshold: number;
    nodeCount: number;
    cacheTTLs: Record<ACEAttestationType, number>;
  }> {
    const threshold = await this.contract.signatureThreshold();
    const nodeCount = await this.contract.donNodeCount();

    const cacheTTLs: Record<ACEAttestationType, number> = {} as Record<ACEAttestationType, number>;
    for (const [type, value] of Object.entries(ATTESTATION_TYPE_MAP)) {
      const ttl = await this.contract.cacheTTL(value);
      cacheTTLs[type as ACEAttestationType] = Number(ttl);
    }

    return {
      threshold: Number(threshold),
      nodeCount: Number(nodeCount),
      cacheTTLs,
    };
  }

  // ============================================================================
  // Policy Module Evaluation Methods
  // ============================================================================

  /**
   * Check if policy modules are enabled on the ACE router
   */
  async isPolicyModulesEnabled(): Promise<boolean> {
    try {
      return await this.contract.usePolicyModules();
    } catch {
      return false;
    }
  }

  /**
   * Get the policy registry address
   */
  async getPolicyRegistryAddress(): Promise<string | null> {
    try {
      const address = await this.contract.policyRegistry();
      return address === ethers.ZeroAddress ? null : address;
    } catch {
      return null;
    }
  }

  /**
   * Evaluate transfer against on-chain policy modules
   * This provides authoritative DON-enforced policy evaluation
   *
   * @param from Sender address
   * @param to Recipient address
   * @param amount Transfer amount (as string with decimals)
   * @param token Token address
   * @returns Policy evaluation results
   */
  async evaluatePolicies(
    from: string,
    to: string,
    amount: string,
    token: string
  ): Promise<Result<{ allowed: boolean; results: PolicyResult[] }, string>> {
    try {
      const value = ethers.parseUnits(amount, 18);

      const [allowed, rawResults] = await this.contract.evaluatePolicies(from, to, value, token);

      const results: PolicyResult[] = rawResults.map((r: {
        allowed: boolean;
        policyId: string;
        ruleId: string;
        reason: string;
        timestamp: bigint;
        proof: string;
      }) => ({
        allowed: r.allowed,
        policyId: r.policyId,
        ruleId: r.ruleId,
        reason: r.reason,
        timestamp: Number(r.timestamp),
        proof: r.proof,
      }));

      return ok({ allowed, results });
    } catch (error) {
      return err(
        `Policy evaluation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Evaluate policies with early termination on first failure
   * More gas-efficient when only the first failure matters
   *
   * @param from Sender address
   * @param to Recipient address
   * @param amount Transfer amount (as string with decimals)
   * @param token Token address
   * @returns Early termination result
   */
  async evaluatePoliciesEarly(
    from: string,
    to: string,
    amount: string,
    token: string
  ): Promise<Result<{ allowed: boolean; failedModule: string | null; reason: string }, string>> {
    try {
      const value = ethers.parseUnits(amount, 18);

      const [allowed, failedModule, reason] = await this.contract.evaluatePoliciesEarly(
        from,
        to,
        value,
        token
      );

      return ok({
        allowed,
        failedModule: failedModule === ethers.ZeroAddress ? null : failedModule,
        reason,
      });
    } catch (error) {
      return err(
        `Early policy evaluation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Check full compliance combining attestations and policy modules
   * This is the recommended method for production use
   *
   * @param from Sender address
   * @param to Recipient address
   * @param amount Transfer amount (as string with decimals)
   * @param token Token address
   * @returns Full compliance result with attestation and policy details
   */
  async checkFullCompliance(
    from: string,
    to: string,
    amount: string,
    token: string
  ): Promise<Result<FullComplianceResult, string>> {
    try {
      const value = ethers.parseUnits(amount, 18);

      const [compliant, attestationId, rawPolicyResults] = await this.contract.checkFullCompliance(
        from,
        to,
        value,
        token
      );

      const policyResults: PolicyResult[] = rawPolicyResults.map((r: {
        allowed: boolean;
        policyId: string;
        ruleId: string;
        reason: string;
        timestamp: bigint;
        proof: string;
      }) => ({
        allowed: r.allowed,
        policyId: r.policyId,
        ruleId: r.ruleId,
        reason: r.reason,
        timestamp: Number(r.timestamp),
        proof: r.proof,
      }));

      // Check attestation validity separately
      const attestationsValid = attestationId !== ethers.ZeroHash &&
        await this.isAttestationValid(attestationId);

      // Check if all policies pass
      const policiesPass = policyResults.every((r) => r.allowed);

      return ok({
        compliant,
        attestationId: attestationId === ethers.ZeroHash ? null : attestationId,
        policyResults,
        attestationsValid,
        policiesPass,
      });
    } catch (error) {
      return err(
        `Full compliance check failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Pre-validate transfer using SDK as a local pre-validator
   * Use this before requesting on-chain attestation to catch obvious issues
   *
   * @param from Sender address
   * @param to Recipient address
   * @param amount Transfer amount
   * @param token Token address
   * @returns Pre-validation result
   */
  async preValidateTransfer(
    from: string,
    to: string,
    amount: string,
    token: string
  ): Promise<{ valid: boolean; issues: string[] }> {
    const issues: string[] = [];

    // Check addresses
    if (!ethers.isAddress(from)) {
      issues.push('Invalid sender address');
    }
    if (!ethers.isAddress(to)) {
      issues.push('Invalid recipient address');
    }
    if (from.toLowerCase() === to.toLowerCase()) {
      issues.push('Sender and recipient are the same address');
    }

    // Check amount
    try {
      const value = ethers.parseUnits(amount, 18);
      if (value <= 0n) {
        issues.push('Transfer amount must be greater than zero');
      }
    } catch {
      issues.push('Invalid transfer amount format');
    }

    // Check token address
    if (token !== ethers.ZeroAddress && !ethers.isAddress(token)) {
      issues.push('Invalid token address');
    }

    // Check cached attestations (quick local check)
    const fromCached = await this.getCachedAttestation(from, 'IDENTITY_VERIFICATION' as ACEAttestationType);
    const toCached = await this.getCachedAttestation(to, 'IDENTITY_VERIFICATION' as ACEAttestationType);

    if (!fromCached && !toCached) {
      // No cached identity attestations - might need fresh attestation
      // This is a warning, not a hard failure
      issues.push('Warning: No cached identity attestations found - may require fresh DON attestation');
    }

    return {
      valid: issues.filter((i) => !i.startsWith('Warning:')).length === 0,
      issues,
    };
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Set up event listeners for attestation events
   */
  private _setupEventListeners(): void {
    // Listen for AttestationFulfilled events
    this.contract.on(
      'AttestationFulfilled',
      (
        attestationId: string,
        subject: string,
        attestationType: number,
        passed: boolean,
        validUntil: bigint,
        event: ContractEventPayload
      ) => {
        // Fetch full attestation
        this.getAttestation(attestationId).then((result) => {
          if (result.success) {
            // Notify subscribers
            for (const callback of this.attestationSubscribers) {
              try {
                callback(result.data);
              } catch (e) {
                console.error('Error in attestation subscriber:', e);
              }
            }

            // Resolve pending request if any
            const pending = this.pendingRequests.get(attestationId);
            if (pending) {
              clearTimeout(pending.timeoutId);
              pending.resolve(result.data);
              this.pendingRequests.delete(attestationId);
            }
          }
        });
      }
    );

    // Listen for FallbackTriggered events
    this.contract.on('FallbackTriggered', (requestId: string, reason: string) => {
      const pending = this.pendingRequests.get(requestId);
      if (pending) {
        clearTimeout(pending.timeoutId);
        pending.reject(new Error(`Fallback triggered: ${reason}`));
        this.pendingRequests.delete(requestId);
      }
    });
  }

  /**
   * Wait for an attestation to be fulfilled
   */
  private async _waitForAttestation(requestId: string): Promise<ACEAttestation> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`Attestation request timed out after ${this.requestTimeout}ms`));
      }, this.requestTimeout);

      this.pendingRequests.set(requestId, {
        resolve,
        reject,
        timeoutId,
      });
    });
  }

  /**
   * Parse raw attestation data from contract
   */
  private _parseAttestation(raw: unknown): ACEAttestation {
    const data = raw as {
      attestationId: string;
      subject: string;
      attestationType: bigint;
      passed: boolean;
      validUntil: bigint;
      schemaId: string;
      signature: string;
      timestamp: bigint;
      nodeCount: bigint;
      threshold: bigint;
      status: bigint;
    };

    return {
      attestationId: data.attestationId,
      subject: data.subject,
      type: ATTESTATION_TYPE_REVERSE[Number(data.attestationType)] || ('CUSTOM' as ACEAttestationType),
      passed: data.passed,
      validUntil: new Date(Number(data.validUntil) * 1000).toISOString(),
      schemaId: data.schemaId,
      signature: data.signature,
      timestamp: new Date(Number(data.timestamp) * 1000).toISOString(),
      nodeCount: Number(data.nodeCount),
      threshold: Number(data.threshold),
      status: ATTESTATION_STATUS_REVERSE[Number(data.status)] || ('PENDING' as ACEAttestationStatus),
    };
  }

  /**
   * Disconnect and cleanup
   */
  async disconnect(): Promise<void> {
    // Clear pending requests
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeoutId);
      pending.reject(new Error('Plugin disconnected'));
    }
    this.pendingRequests.clear();

    // Clear subscribers
    this.attestationSubscribers.clear();

    // Clear cache
    this.cache.clear();

    // Remove event listeners
    this.contract.removeAllListeners();

    // Remove all provider-level listeners to stop polling
    (this.provider as ethers.JsonRpcProvider).removeAllListeners?.();
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a new ACE plugin instance
 */
export function createAcePlugin(config: AcePluginConfig): ChainlinkAcePlugin {
  return new ChainlinkAcePlugin(config);
}

/**
 * Create ACE plugin for Base Sepolia testnet
 */
export function createBaseSepoliaAcePlugin(
  routerAddress: string,
  privateKey?: string
): ChainlinkAcePlugin {
  return new ChainlinkAcePlugin({
    chainId: 84532,
    rpcUrl: 'https://sepolia.base.org',
    routerAddress,
    privateKey,
  });
}

/**
 * Create ACE plugin for Ethereum Sepolia testnet
 */
export function createSepoliaAcePlugin(
  routerAddress: string,
  privateKey?: string
): ChainlinkAcePlugin {
  return new ChainlinkAcePlugin({
    chainId: 11155111,
    rpcUrl: 'https://ethereum-sepolia.publicnode.com',
    routerAddress,
    privateKey,
  });
}

/**
 * Create ACE plugin for Polygon Mumbai testnet
 */
export function createMumbaiAcePlugin(
  routerAddress: string,
  privateKey?: string
): ChainlinkAcePlugin {
  return new ChainlinkAcePlugin({
    chainId: 80001,
    rpcUrl: 'https://rpc-mumbai.maticvigil.com',
    routerAddress,
    privateKey,
  });
}

export default ChainlinkAcePlugin;
