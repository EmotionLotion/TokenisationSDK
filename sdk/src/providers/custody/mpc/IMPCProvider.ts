/**
 * IMPCProvider - Extended MPC Interface
 *
 * Extends ICustodyProvider with MPC-specific capabilities:
 * - Key share management
 * - Multi-party signing sessions
 * - EIP-712 typed data support
 * - ethers.js Signer creation
 */

import type { Signer } from 'ethers';
import type { Result } from '../../../core/types.js';
import type {
  ICustodyProvider,
  CustodyAccount,
  SigningRequest,
  SignedTransaction,
} from '../../../core/interfaces.providers.js';

// ============================================================================
// MPC KEY SHARE TYPES
// ============================================================================

/**
 * Information about an MPC key share
 */
export interface MPCKeyShare {
  /** Share identifier */
  shareId: string;
  /** Account this share belongs to */
  accountId: string;
  /** Share index (1-based) */
  shareIndex: number;
  /** Total number of shares (n in t-of-n) */
  totalShares: number;
  /** Threshold required to sign (t in t-of-n) */
  threshold: number;
  /** Public key derived from this share */
  publicKey: string;
  /** Device/party holding this share */
  holder: {
    id: string;
    type: 'server' | 'client' | 'backup' | 'hardware';
    name?: string;
  };
  /** Share creation timestamp */
  createdAt: string;
  /** Last usage timestamp */
  lastUsedAt?: string;
  /** Whether share is active and usable */
  isActive: boolean;
}

/**
 * MPC key generation parameters
 */
export interface MPCKeyGenParams {
  /** Account to generate keys for */
  accountId: string;
  /** Number of shares to create (n) */
  totalShares: number;
  /** Signing threshold (t) */
  threshold: number;
  /** Key derivation path (optional, e.g., "m/44'/60'/0'/0") */
  derivationPath?: string;
  /** Participants in key generation */
  participants?: Array<{
    id: string;
    type: 'server' | 'client' | 'backup' | 'hardware';
    name?: string;
  }>;
}

// ============================================================================
// MPC SIGNING SESSION TYPES
// ============================================================================

/**
 * Status of an MPC signing session
 */
export type MPCSigningSessionStatus =
  | 'initiated'      // Session created, waiting for participants
  | 'collecting'     // Collecting partial signatures
  | 'signing'        // Threshold met, combining signatures
  | 'completed'      // Signature created successfully
  | 'failed'         // Session failed
  | 'expired'        // Session timed out
  | 'cancelled';     // Manually cancelled

/**
 * Participant in an MPC signing session
 */
export interface MPCSigningParticipant {
  /** Share holder ID */
  holderId: string;
  /** Share index used */
  shareIndex: number;
  /** Whether partial signature received */
  hasContributed: boolean;
  /** Contribution timestamp */
  contributedAt?: string;
  /** Device info (if available) */
  deviceInfo?: string;
}

/**
 * Request to initiate an MPC signing session
 */
export interface MPCSigningSessionRequest {
  /** Account to sign with */
  accountId: string;
  /** Message digest to sign (hex) */
  messageHash: string;
  /** Optional: Specific shares to use (by holder ID) */
  requestedParticipants?: string[];
  /** Session expiry (ISO 8601) */
  expiresAt?: string;
  /** Metadata for audit */
  metadata?: Record<string, unknown>;
  /** Callback URL for status updates */
  callbackUrl?: string;
}

/**
 * MPC signing session information
 */
export interface MPCSigningSession {
  /** Session identifier */
  sessionId: string;
  /** Account being signed for */
  accountId: string;
  /** Session status */
  status: MPCSigningSessionStatus;
  /** Message being signed */
  messageHash: string;
  /** Required threshold */
  threshold: number;
  /** Current number of contributions */
  contributionCount: number;
  /** Participants and their status */
  participants: MPCSigningParticipant[];
  /** Final signature (when completed) */
  signature?: string;
  /** Session creation timestamp */
  createdAt: string;
  /** Session completion timestamp */
  completedAt?: string;
  /** Session expiry */
  expiresAt: string;
  /** Error message (if failed) */
  error?: string;
}

// ============================================================================
// EIP-712 TYPED DATA TYPES
// ============================================================================

/**
 * EIP-712 Domain
 */
export interface TypedDataDomain {
  name?: string;
  version?: string;
  chainId?: number;
  verifyingContract?: string;
  salt?: string;
}

/**
 * EIP-712 Type definition
 */
export interface TypedDataType {
  name: string;
  type: string;
}

/**
 * EIP-712 Types map
 */
export interface TypedDataTypes {
  [typeName: string]: TypedDataType[];
}

/**
 * Full EIP-712 typed data
 */
export interface TypedData {
  domain: TypedDataDomain;
  types: TypedDataTypes;
  primaryType: string;
  message: Record<string, unknown>;
}

// ============================================================================
// MPC PROVIDER INTERFACE
// ============================================================================

/**
 * IMPCProvider - Multi-Party Computation Custody Provider
 *
 * Extends ICustodyProvider with MPC-specific operations for:
 * - Distributed key generation
 * - Multi-party signing sessions
 * - EIP-712 typed data signing
 * - ethers.js Signer integration
 *
 * @example
 * ```typescript
 * // Initialize provider
 * const mpc = new FireblocksCustodyProvider(config);
 *
 * // Create account and generate MPC keys
 * const account = await mpc.createAccount({ ownerId: 'user-123' });
 * await mpc.generateKeyShares({
 *   accountId: account.value.accountId,
 *   totalShares: 3,
 *   threshold: 2,
 * });
 *
 * // Get ethers.js compatible signer
 * const signer = await mpc.createSigner(account.value.accountId, chainId);
 *
 * // Use with EVM chain plugin
 * evmPlugin.connectSigner(signer);
 * ```
 */
export interface IMPCProvider extends ICustodyProvider {
  // ============================================================================
  // KEY SHARE MANAGEMENT
  // ============================================================================

  /**
   * Generate MPC key shares for an account
   */
  generateKeyShares(params: MPCKeyGenParams): Promise<Result<MPCKeyShare[], string>>;

  /**
   * Get key shares for an account
   */
  getKeyShares(accountId: string): Promise<Result<MPCKeyShare[], string>>;

  /**
   * Refresh/rotate key shares (re-share without changing public key)
   */
  refreshKeyShares(accountId: string): Promise<Result<MPCKeyShare[], string>>;

  /**
   * Deactivate a key share (e.g., lost device)
   */
  deactivateKeyShare(shareId: string, reason: string): Promise<Result<void, string>>;

  // ============================================================================
  // MPC SIGNING SESSIONS
  // ============================================================================

  /**
   * Initiate an MPC signing session
   *
   * Creates a new signing session that participants can contribute to.
   * The session completes when threshold partial signatures are received.
   */
  initiateSigningSession(
    request: MPCSigningSessionRequest
  ): Promise<Result<MPCSigningSession, string>>;

  /**
   * Get signing session status
   */
  getSigningSession(sessionId: string): Promise<Result<MPCSigningSession, string>>;

  /**
   * Cancel a signing session
   */
  cancelSigningSession(sessionId: string): Promise<Result<void, string>>;

  /**
   * Submit a partial signature to a session (for client-side MPC)
   */
  submitPartialSignature(
    sessionId: string,
    holderId: string,
    partialSignature: string
  ): Promise<Result<MPCSigningSession, string>>;

  // ============================================================================
  // EIP-712 SIGNING
  // ============================================================================

  /**
   * Sign typed data (EIP-712)
   */
  signTypedData(
    accountId: string,
    typedData: TypedData
  ): Promise<Result<{ signature: string; sessionId?: string }, string>>;

  /**
   * Sign a message (EIP-191 personal sign)
   */
  signMessage(
    accountId: string,
    message: string | Uint8Array
  ): Promise<Result<{ signature: string; sessionId?: string }, string>>;

  // ============================================================================
  // ETHERS.JS INTEGRATION
  // ============================================================================

  /**
   * Create an ethers.js compatible Signer for an account
   *
   * The returned Signer can be used with EVMChainPlugin.connectSigner()
   * and handles the async MPC signing workflow internally.
   */
  createSigner(
    accountId: string,
    chainId: number,
    options?: {
      /** Polling interval for signing status (ms) */
      pollingInterval?: number;
      /** Signing timeout (ms) */
      timeout?: number;
    }
  ): Promise<Result<Signer, string>>;

  // ============================================================================
  // PROVIDER CAPABILITIES
  // ============================================================================

  /**
   * Get provider capabilities
   */
  getCapabilities(): MPCProviderCapabilities;
}

/**
 * MPC provider capabilities
 */
export interface MPCProviderCapabilities {
  /** Supported threshold schemes (e.g., ['2-of-3', '3-of-5']) */
  supportedSchemes: string[];
  /** Maximum number of shares */
  maxShares: number;
  /** Whether client-side MPC is supported */
  supportsClientMPC: boolean;
  /** Whether hardware security module integration is available */
  supportsHSM: boolean;
  /** Whether key refresh/rotation is supported */
  supportsKeyRefresh: boolean;
  /** Supported signing algorithms */
  supportedAlgorithms: ('ECDSA' | 'EdDSA' | 'Schnorr')[];
  /** Supported curves */
  supportedCurves: ('secp256k1' | 'ed25519')[];
  /** Whether typed data (EIP-712) is supported */
  supportsTypedData: boolean;
  /** Average signing latency (ms) */
  avgSigningLatencyMs?: number;
}

/**
 * MPC provider configuration base
 */
export interface MPCProviderConfig {
  /** Provider-specific API key or credentials */
  apiKey?: string;
  /** API secret (if required) */
  apiSecret?: string;
  /** API base URL (for self-hosted or sandbox) */
  baseUrl?: string;
  /** Default signing timeout (ms) */
  defaultTimeout?: number;
  /** Enable debug logging */
  debug?: boolean;
}
