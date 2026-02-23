/**
 * Chainlink DECO (Decentralized Confidential Oracle) Plugin
 *
 * Enables privacy-preserving proofs of off-chain data using DECO protocol.
 * Users can prove statements about their private data (bank balances, income,
 * identity attributes) without revealing the underlying data on-chain.
 *
 * Use cases:
 * - Prove bank balance >$1M for institutional real estate offerings
 * - Prove accredited investor status without revealing net worth
 * - Prove age >18 for concert ticket compliance without revealing DOB
 * - Prove insurance coverage for car rental without revealing policy details
 *
 * Architecture:
 * - DECO Prover: Runs on the user's device, generates ZK proofs from TLS sessions
 * - DECO Verifier: Runs on DON nodes, verifies proofs against attested TLS transcripts
 * - ACE Integration: Valid DECO proofs are converted to ACE attestations
 *
 * @packageDocumentation
 */

import { ethers, type Provider, type Signer } from 'ethers';
import { ok, err, type Result } from '@tokenisation/core';

// ============================================================================
// Types
// ============================================================================

/**
 * Supported proof types for DECO
 */
export enum DecoProofType {
  /** Prove a financial balance exceeds a threshold */
  BALANCE_THRESHOLD = 'BALANCE_THRESHOLD',
  /** Prove accredited investor status */
  ACCREDITED_INVESTOR = 'ACCREDITED_INVESTOR',
  /** Prove age satisfies a minimum requirement */
  AGE_VERIFICATION = 'AGE_VERIFICATION',
  /** Prove residency in a jurisdiction */
  RESIDENCY_PROOF = 'RESIDENCY_PROOF',
  /** Prove insurance coverage exists */
  INSURANCE_COVERAGE = 'INSURANCE_COVERAGE',
  /** Prove employment at an institution */
  EMPLOYMENT_PROOF = 'EMPLOYMENT_PROOF',
  /** Custom predicate proof */
  CUSTOM = 'CUSTOM',
}

/**
 * Status of a DECO proof session
 */
export enum DecoSessionStatus {
  /** Session created, awaiting prover to initiate TLS handshake */
  PENDING = 'PENDING',
  /** TLS session established, prover generating commitments */
  ATTESTING = 'ATTESTING',
  /** Proof generated, awaiting DON verification */
  PROVING = 'PROVING',
  /** Proof verified by DON consensus */
  VERIFIED = 'VERIFIED',
  /** Proof verification failed */
  FAILED = 'FAILED',
  /** Session expired before completion */
  EXPIRED = 'EXPIRED',
}

/**
 * Data source configuration for TLS-attested data
 */
export interface DecoDataSource {
  /** Human-readable name of the data source */
  name: string;
  /** The HTTPS endpoint the prover connects to (e.g., bank API) */
  tlsEndpoint: string;
  /** Expected TLS certificate fingerprint for pinning */
  certificateFingerprint?: string;
  /** JSONPath to extract the relevant value from the TLS response */
  valuePath: string;
  /** Expected content type */
  contentType: 'application/json' | 'text/html';
}

/**
 * Proof request — what the verifier wants proved
 */
export interface DecoProofRequest {
  /** Type of proof requested */
  proofType: DecoProofType;
  /** The predicate to prove (e.g., "balance > 1000000") */
  predicate: string;
  /** Comparison operator */
  operator: '>' | '>=' | '<' | '<=' | '==' | '!=' | 'contains' | 'exists';
  /** Threshold value (for numeric comparisons) */
  threshold?: string;
  /** Data source to attest */
  dataSource: DecoDataSource;
  /** Requesting party (verifier) address */
  verifierAddress: string;
  /** Subject (prover) address */
  proverAddress: string;
  /** Session expiry in seconds from creation */
  expirySeconds?: number;
  /** Additional context hash for binding the proof to a specific transaction */
  contextHash?: string;
  /** Vertical that requested this proof */
  vertical?: string;
}

/**
 * Proof result returned after DON verification
 */
export interface DecoProofResult {
  /** Unique proof session ID */
  sessionId: string;
  /** Whether the predicate was satisfied */
  predicateSatisfied: boolean;
  /** Proof type */
  proofType: DecoProofType;
  /** The predicate that was evaluated */
  predicate: string;
  /** Session status */
  status: DecoSessionStatus;
  /** DON consensus info */
  consensus: {
    nodeCount: number;
    threshold: number;
    nodesAgreed: number;
  };
  /** TLS attestation metadata (no private data) */
  attestation: {
    /** Domain that was attested */
    attestedDomain: string;
    /** Timestamp of the TLS session */
    attestedAt: string;
    /** Certificate chain verified */
    certificateVerified: boolean;
  };
  /** Linked ACE attestation ID (if ACE integration enabled) */
  aceAttestationId?: string;
  /** Proof validity period */
  validUntil: string;
  /** On-chain proof hash */
  proofHash: string;
  /** Transaction hash of the on-chain verification */
  txHash?: string;
}

/**
 * DECO Verifier contract ABI
 */
const DECO_VERIFIER_ABI = [
  'function createSession(tuple(uint8 proofType, bytes32 predicateHash, address prover, address verifier, uint256 expiry, bytes32 contextHash) request) external returns (bytes32 sessionId)',
  'function getSession(bytes32 sessionId) external view returns (tuple(bytes32 sessionId, uint8 proofType, bytes32 predicateHash, address prover, address verifier, uint8 status, bool predicateSatisfied, uint256 createdAt, uint256 verifiedAt, uint256 expiry, bytes32 proofHash, uint8 nodeCount, uint8 threshold, uint8 nodesAgreed, bytes32 aceAttestationId))',
  'function submitProof(bytes32 sessionId, bytes proof, bytes tlsAttestation) external returns (bool)',
  'function verifyProof(bytes32 sessionId) external view returns (bool valid, bool predicateSatisfied)',
  'function getLinkedAttestation(bytes32 sessionId) external view returns (bytes32 aceAttestationId)',
  'function revokeSession(bytes32 sessionId) external',
  'event SessionCreated(bytes32 indexed sessionId, address indexed prover, address indexed verifier, uint8 proofType)',
  'event ProofSubmitted(bytes32 indexed sessionId, bytes32 proofHash)',
  'event ProofVerified(bytes32 indexed sessionId, bool predicateSatisfied, uint8 nodesAgreed)',
  'event SessionExpired(bytes32 indexed sessionId)',
];

const PROOF_TYPE_MAP: Record<DecoProofType, number> = {
  [DecoProofType.BALANCE_THRESHOLD]: 0,
  [DecoProofType.ACCREDITED_INVESTOR]: 1,
  [DecoProofType.AGE_VERIFICATION]: 2,
  [DecoProofType.RESIDENCY_PROOF]: 3,
  [DecoProofType.INSURANCE_COVERAGE]: 4,
  [DecoProofType.EMPLOYMENT_PROOF]: 5,
  [DecoProofType.CUSTOM]: 6,
};

const PROOF_TYPE_REVERSE: Record<number, DecoProofType> = Object.fromEntries(
  Object.entries(PROOF_TYPE_MAP).map(([k, v]) => [v, k as DecoProofType])
);

const SESSION_STATUS_REVERSE: Record<number, DecoSessionStatus> = {
  0: DecoSessionStatus.PENDING,
  1: DecoSessionStatus.ATTESTING,
  2: DecoSessionStatus.PROVING,
  3: DecoSessionStatus.VERIFIED,
  4: DecoSessionStatus.FAILED,
  5: DecoSessionStatus.EXPIRED,
};

// ============================================================================
// Plugin Configuration
// ============================================================================

export interface DecoPluginConfig {
  /** Chain ID */
  chainId: number;
  /** RPC URL */
  rpcUrl: string;
  /** DECO Verifier contract address */
  verifierAddress: string;
  /** Private key for signing transactions */
  privateKey?: string;
  /** Default session expiry in seconds (default: 3600 = 1 hour) */
  defaultExpirySeconds?: number;
  /** Whether to auto-link verified proofs to ACE attestations */
  linkToAce?: boolean;
  /** ACE Router address (required if linkToAce is true) */
  aceRouterAddress?: string;
}

// ============================================================================
// DECO Plugin
// ============================================================================

export class DecoPlugin {
  readonly pluginId = 'chainlink-deco';
  readonly verifierAddress: string;

  private chainId: number;
  private provider: Provider;
  private signer?: Signer;
  private contract: ethers.Contract;
  private defaultExpirySeconds: number;
  private linkToAce: boolean;
  private aceRouterAddress?: string;

  // Session tracking
  private activeSessions: Map<string, DecoProofRequest> = new Map();
  private proofSubscribers: Set<(result: DecoProofResult) => void> = new Set();

  constructor(config: DecoPluginConfig) {
    this.chainId = config.chainId;
    this.verifierAddress = config.verifierAddress;
    this.defaultExpirySeconds = config.defaultExpirySeconds || 3600;
    this.linkToAce = config.linkToAce !== false;
    this.aceRouterAddress = config.aceRouterAddress;

    this.provider = new ethers.JsonRpcProvider(config.rpcUrl, config.chainId);

    if (config.privateKey) {
      this.signer = new ethers.Wallet(config.privateKey, this.provider);
      this.contract = new ethers.Contract(
        config.verifierAddress,
        DECO_VERIFIER_ABI,
        this.signer
      );
    } else {
      this.contract = new ethers.Contract(
        config.verifierAddress,
        DECO_VERIFIER_ABI,
        this.provider
      );
    }

    this._setupEventListeners();
  }

  // ============================================================================
  // Session Management
  // ============================================================================

  /**
   * Create a new DECO proof session.
   * The prover will then need to initiate a TLS session and generate the proof.
   */
  async createProofSession(
    request: DecoProofRequest
  ): Promise<Result<string, string>> {
    if (!this.signer) {
      return err('Signer required for creating proof sessions');
    }

    try {
      const predicateHash = ethers.keccak256(
        ethers.toUtf8Bytes(
          `${request.proofType}:${request.operator}:${request.threshold || ''}:${request.predicate}`
        )
      );

      const expiry =
        Math.floor(Date.now() / 1000) +
        (request.expirySeconds || this.defaultExpirySeconds);

      const sessionRequest = {
        proofType: PROOF_TYPE_MAP[request.proofType],
        predicateHash,
        prover: request.proverAddress,
        verifier: request.verifierAddress,
        expiry,
        contextHash: request.contextHash || ethers.ZeroHash,
      };

      const tx = await this.contract.createSession(sessionRequest);
      const receipt = await tx.wait();

      const sessionEvent = receipt.logs.find(
        (log: ethers.Log) =>
          log.topics[0] ===
          ethers.id('SessionCreated(bytes32,address,address,uint8)')
      );

      if (!sessionEvent) {
        return err('SessionCreated event not found in transaction logs');
      }

      const sessionId = sessionEvent.topics[1];

      // Track session locally
      this.activeSessions.set(sessionId, request);

      return ok(sessionId);
    } catch (error) {
      return err(
        `Failed to create proof session: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get the current status of a DECO proof session
   */
  async getSession(sessionId: string): Promise<Result<DecoProofResult, string>> {
    try {
      const raw = await this.contract.getSession(sessionId);
      return ok(this._parseSession(raw));
    } catch (error) {
      return err(
        `Failed to get session: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Submit a proof for verification.
   * Called by the prover after generating the ZK proof from the TLS session.
   */
  async submitProof(
    sessionId: string,
    proof: Uint8Array,
    tlsAttestation: Uint8Array
  ): Promise<Result<string, string>> {
    if (!this.signer) {
      return err('Signer required for submitting proofs');
    }

    try {
      const tx = await this.contract.submitProof(
        sessionId,
        proof,
        tlsAttestation
      );
      const receipt = await tx.wait();

      return ok(receipt.hash);
    } catch (error) {
      return err(
        `Failed to submit proof: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Verify a proof's validity (read-only check)
   */
  async verifyProof(
    sessionId: string
  ): Promise<Result<{ valid: boolean; predicateSatisfied: boolean }, string>> {
    try {
      const [valid, predicateSatisfied] =
        await this.contract.verifyProof(sessionId);
      return ok({ valid, predicateSatisfied });
    } catch (error) {
      return err(
        `Failed to verify proof: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get the linked ACE attestation ID for a verified proof
   */
  async getLinkedAttestation(
    sessionId: string
  ): Promise<Result<string | null, string>> {
    try {
      const attestationId =
        await this.contract.getLinkedAttestation(sessionId);
      return ok(
        attestationId === ethers.ZeroHash ? null : attestationId
      );
    } catch (error) {
      return err(
        `Failed to get linked attestation: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  // ============================================================================
  // Convenience Methods (Vertical-Specific)
  // ============================================================================

  /**
   * Real Estate: Prove bank balance exceeds a threshold
   * Used for institutional offering qualification.
   */
  async proveBalanceThreshold(params: {
    proverAddress: string;
    verifierAddress: string;
    bankApiEndpoint: string;
    balancePath: string;
    minimumBalance: string;
    currency: string;
    contextHash?: string;
  }): Promise<Result<string, string>> {
    return this.createProofSession({
      proofType: DecoProofType.BALANCE_THRESHOLD,
      predicate: `balance.${params.currency} >= ${params.minimumBalance}`,
      operator: '>=',
      threshold: params.minimumBalance,
      dataSource: {
        name: 'Bank Balance Verification',
        tlsEndpoint: params.bankApiEndpoint,
        valuePath: params.balancePath,
        contentType: 'application/json',
      },
      verifierAddress: params.verifierAddress,
      proverAddress: params.proverAddress,
      contextHash: params.contextHash,
      vertical: 'real-estate',
    });
  }

  /**
   * Real Estate / Concert: Prove accredited investor status
   */
  async proveAccreditedInvestor(params: {
    proverAddress: string;
    verifierAddress: string;
    brokerApiEndpoint: string;
    statusPath: string;
    contextHash?: string;
  }): Promise<Result<string, string>> {
    return this.createProofSession({
      proofType: DecoProofType.ACCREDITED_INVESTOR,
      predicate: 'accredited_investor == true',
      operator: '==',
      threshold: 'true',
      dataSource: {
        name: 'Accredited Investor Verification',
        tlsEndpoint: params.brokerApiEndpoint,
        valuePath: params.statusPath,
        contentType: 'application/json',
      },
      verifierAddress: params.verifierAddress,
      proverAddress: params.proverAddress,
      contextHash: params.contextHash,
      vertical: 'real-estate',
    });
  }

  /**
   * Car Rental: Prove insurance coverage
   */
  async proveInsuranceCoverage(params: {
    proverAddress: string;
    verifierAddress: string;
    insurerApiEndpoint: string;
    coveragePath: string;
    minimumCoverage: string;
    contextHash?: string;
  }): Promise<Result<string, string>> {
    return this.createProofSession({
      proofType: DecoProofType.INSURANCE_COVERAGE,
      predicate: `coverage_amount >= ${params.minimumCoverage}`,
      operator: '>=',
      threshold: params.minimumCoverage,
      dataSource: {
        name: 'Insurance Coverage Verification',
        tlsEndpoint: params.insurerApiEndpoint,
        valuePath: params.coveragePath,
        contentType: 'application/json',
      },
      verifierAddress: params.verifierAddress,
      proverAddress: params.proverAddress,
      contextHash: params.contextHash,
      vertical: 'car-rental',
    });
  }

  /**
   * Concert / Hotel: Prove age meets minimum requirement
   */
  async proveAgeVerification(params: {
    proverAddress: string;
    verifierAddress: string;
    identityApiEndpoint: string;
    dobPath: string;
    minimumAge: number;
    contextHash?: string;
  }): Promise<Result<string, string>> {
    return this.createProofSession({
      proofType: DecoProofType.AGE_VERIFICATION,
      predicate: `age >= ${params.minimumAge}`,
      operator: '>=',
      threshold: String(params.minimumAge),
      dataSource: {
        name: 'Age Verification',
        tlsEndpoint: params.identityApiEndpoint,
        valuePath: params.dobPath,
        contentType: 'application/json',
      },
      verifierAddress: params.verifierAddress,
      proverAddress: params.proverAddress,
      contextHash: params.contextHash,
      vertical: 'concert',
    });
  }

  // ============================================================================
  // Subscriptions
  // ============================================================================

  /**
   * Subscribe to proof verification events
   */
  onProofVerified(
    callback: (result: DecoProofResult) => void
  ): { unsubscribe: () => void } {
    this.proofSubscribers.add(callback);
    return {
      unsubscribe: () => {
        this.proofSubscribers.delete(callback);
      },
    };
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private _setupEventListeners(): void {
    this.contract.on(
      'ProofVerified',
      async (
        sessionId: string,
        predicateSatisfied: boolean,
        nodesAgreed: number
      ) => {
        const result = await this.getSession(sessionId);
        if (result.success) {
          for (const callback of this.proofSubscribers) {
            try {
              callback(result.data);
            } catch (e) {
              console.error('Error in proof subscriber:', e);
            }
          }
        }
      }
    );
  }

  private _parseSession(raw: unknown): DecoProofResult {
    const data = raw as {
      sessionId: string;
      proofType: bigint;
      predicateHash: string;
      prover: string;
      verifier: string;
      status: bigint;
      predicateSatisfied: boolean;
      createdAt: bigint;
      verifiedAt: bigint;
      expiry: bigint;
      proofHash: string;
      nodeCount: bigint;
      threshold: bigint;
      nodesAgreed: bigint;
      aceAttestationId: string;
    };

    const proofType =
      PROOF_TYPE_REVERSE[Number(data.proofType)] || DecoProofType.CUSTOM;
    const request = this.activeSessions.get(data.sessionId);

    return {
      sessionId: data.sessionId,
      predicateSatisfied: data.predicateSatisfied,
      proofType,
      predicate: request?.predicate || `proof_type:${proofType}`,
      status:
        SESSION_STATUS_REVERSE[Number(data.status)] ||
        DecoSessionStatus.PENDING,
      consensus: {
        nodeCount: Number(data.nodeCount),
        threshold: Number(data.threshold),
        nodesAgreed: Number(data.nodesAgreed),
      },
      attestation: {
        attestedDomain: request?.dataSource.tlsEndpoint || 'unknown',
        attestedAt: new Date(Number(data.verifiedAt) * 1000).toISOString(),
        certificateVerified: data.status >= 3n,
      },
      aceAttestationId:
        data.aceAttestationId !== ethers.ZeroHash
          ? data.aceAttestationId
          : undefined,
      validUntil: new Date(Number(data.expiry) * 1000).toISOString(),
      proofHash: data.proofHash,
    };
  }

  /**
   * Convenience method for demos — creates a proof and returns a simplified result.
   */
  async createProof(params: {
    proofType: DecoProofType;
    dataSource: { url: string; method: string; jsonPath: string };
    claim: { field: string; operator: string; threshold: number | string | string[] };
    metadata?: Record<string, unknown>;
  }): Promise<Result<{ proofId: string }, string>> {
    try {
      const result = await this.createProofSession({
        proofType: params.proofType,
        predicate: `${params.claim.field} ${params.claim.operator} ${params.claim.threshold}`,
        operator: (params.claim.operator === 'gte' ? '>=' : params.claim.operator === 'eq' ? '==' : params.claim.operator === 'in' ? '==' : '>=') as '>=' | '==' | '>' | '<' | '<=' | '!=' | 'contains' | 'exists',
        threshold: String(params.claim.threshold),
        dataSource: {
          name: params.dataSource.url,
          tlsEndpoint: params.dataSource.url,
          valuePath: params.dataSource.jsonPath,
          contentType: 'application/json',
        },
        verifierAddress: this.verifierAddress,
        proverAddress: (this.signer as ethers.Wallet)?.address || '0x0000000000000000000000000000000000000000',
        contextHash: params.metadata ? ethers.id(JSON.stringify(params.metadata)) : undefined,
      });
      if (result.success) {
        return ok({ proofId: result.data });
      }
      return err(result.error);
    } catch (error) {
      return err(`DECO proof creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Disconnect and cleanup
   */
  async disconnect(): Promise<void> {
    this.activeSessions.clear();
    this.proofSubscribers.clear();
    this.contract.removeAllListeners();
    (this.provider as ethers.JsonRpcProvider).removeAllListeners?.();
  }

  /**
   * Alias for disconnect — used in demos.
   */
  destroy(): void {
    this.disconnect().catch(() => {});
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

export function createDecoPlugin(config: DecoPluginConfig): DecoPlugin {
  return new DecoPlugin(config);
}

export function createSepoliaDecoPlugin(
  verifierAddress: string,
  privateKey?: string
): DecoPlugin {
  return new DecoPlugin({
    chainId: 11155111,
    rpcUrl: 'https://ethereum-sepolia.publicnode.com',
    verifierAddress,
    privateKey,
  });
}

export function createBaseSepoliaDecoPlugin(
  verifierAddress: string,
  privateKey?: string
): DecoPlugin {
  return new DecoPlugin({
    chainId: 84532,
    rpcUrl: 'https://sepolia.base.org',
    verifierAddress,
    privateKey,
  });
}

export default DecoPlugin;
