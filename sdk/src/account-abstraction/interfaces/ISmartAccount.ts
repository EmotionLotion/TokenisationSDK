/**
 * ISmartAccount - Smart Account Interface
 *
 * Defines the interface for ERC-4337 smart accounts.
 * Smart accounts are contract-based accounts that enable:
 * - Gasless transactions (via paymasters)
 * - Batched transactions
 * - Custom validation logic
 * - Social recovery
 * - Session keys
 */

import type { Signer } from 'ethers';
import type { Result } from '../../core/types.js';
import type {
  UserOperation,
  UnsignedUserOperation,
  UserOperationCall,
  UserOperationCalls,
} from './UserOperation.js';

/**
 * Smart account type
 */
export type SmartAccountType =
  | 'simple'       // Basic single-owner account
  | 'multisig'     // Multi-signature account
  | 'session'      // Session key enabled
  | 'social'       // Social recovery enabled
  | 'modular';     // Modular (ERC-6900) account

/**
 * Smart account state
 */
export type SmartAccountState =
  | 'not_deployed'  // Account not yet deployed on-chain
  | 'deployed'      // Account deployed and active
  | 'locked'        // Account temporarily locked
  | 'deprecated';   // Account deprecated (new version available)

/**
 * Smart account information
 */
export interface SmartAccountInfo {
  /** Account address (counterfactual if not deployed) */
  address: string;
  /** Account type */
  type: SmartAccountType;
  /** Current state */
  state: SmartAccountState;
  /** Chain ID */
  chainId: number;
  /** Entry point address used */
  entryPoint: string;
  /** Factory address used for deployment */
  factory: string;
  /** Owner address(es) */
  owners: string[];
  /** Current nonce */
  nonce: bigint;
  /** Whether the account is deployed on-chain */
  isDeployed: boolean;
  /** Implementation version */
  version?: string;
  /** Account metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Smart account configuration
 */
export interface SmartAccountConfig {
  /** Chain ID */
  chainId: number;
  /** Entry point address (default: v0.7 entry point) */
  entryPoint?: string;
  /** Factory address for deployment */
  factory?: string;
  /** Owner signer */
  owner: Signer;
  /** Additional owners for multi-sig */
  additionalOwners?: string[];
  /** Signing threshold for multi-sig */
  threshold?: number;
  /** Salt for address derivation */
  salt?: bigint;
  /** Index for key derivation (for HD wallets) */
  index?: number;
  /** Whether to deploy immediately */
  deployOnInit?: boolean;
}

/**
 * ISmartAccount - Smart Account Interface
 *
 * Represents an ERC-4337 smart contract account.
 *
 * @example
 * ```typescript
 * // Create a smart account
 * const account = await SmartAccountFactory.create({
 *   chainId: 8453,
 *   owner: signer,
 * });
 *
 * // Build and execute a user operation
 * const userOp = await account.buildUserOperation({
 *   calls: [
 *     { to: tokenAddress, value: 0n, data: transferData },
 *   ],
 * });
 *
 * await bundler.sendUserOperation(userOp);
 * ```
 */
export interface ISmartAccount {
  // ============================================================================
  // ACCOUNT INFO
  // ============================================================================

  /**
   * Get the account address
   * Returns counterfactual address if not deployed
   */
  getAddress(): Promise<string>;

  /**
   * Get full account information
   */
  getAccountInfo(): Promise<SmartAccountInfo>;

  /**
   * Check if account is deployed on-chain
   */
  isDeployed(): Promise<boolean>;

  /**
   * Get the current nonce
   */
  getNonce(): Promise<bigint>;

  /**
   * Get the entry point address
   */
  getEntryPoint(): string;

  /**
   * Get the chain ID
   */
  getChainId(): number;

  // ============================================================================
  // USER OPERATION BUILDING
  // ============================================================================

  /**
   * Build an unsigned UserOperation
   */
  buildUserOperation(params: {
    /** Calls to execute */
    calls: UserOperationCalls;
    /** Nonce override (optional) */
    nonce?: bigint;
    /** Custom call data override (optional) */
    callData?: string;
    /** Gas limit overrides */
    gasLimits?: {
      callGasLimit?: bigint;
      verificationGasLimit?: bigint;
      preVerificationGas?: bigint;
    };
    /** Gas price overrides */
    gasPrices?: {
      maxFeePerGas?: bigint;
      maxPriorityFeePerGas?: bigint;
    };
  }): Promise<UnsignedUserOperation>;

  /**
   * Encode multiple calls into callData for the smart account
   */
  encodeCalls(calls: UserOperationCalls): Promise<string>;

  /**
   * Encode a single call into callData
   */
  encodeCall(call: UserOperationCall): Promise<string>;

  /**
   * Get the init code for deploying this account
   */
  getInitCode(): Promise<string>;

  /**
   * Get the factory data for account creation
   */
  getFactoryData(): Promise<string>;

  // ============================================================================
  // SIGNING
  // ============================================================================

  /**
   * Sign a UserOperation
   */
  signUserOperation(userOp: UnsignedUserOperation): Promise<UserOperation>;

  /**
   * Sign a message (EIP-1271)
   */
  signMessage(message: string | Uint8Array): Promise<string>;

  /**
   * Sign typed data (EIP-712, EIP-1271)
   */
  signTypedData(
    domain: Record<string, unknown>,
    types: Record<string, Array<{ name: string; type: string }>>,
    value: Record<string, unknown>
  ): Promise<string>;

  /**
   * Get the user operation hash for signing
   */
  getUserOpHash(userOp: UnsignedUserOperation): Promise<string>;

  // ============================================================================
  // DEPLOYMENT
  // ============================================================================

  /**
   * Deploy the smart account (if not already deployed)
   * Returns the deployment UserOperation
   */
  deploy(): Promise<Result<UserOperation, string>>;

  /**
   * Get estimated deployment cost
   */
  getDeploymentCost(): Promise<bigint>;

  // ============================================================================
  // OWNERSHIP
  // ============================================================================

  /**
   * Get owner address(es)
   */
  getOwners(): Promise<string[]>;

  /**
   * Check if an address is an owner
   */
  isOwner(address: string): Promise<boolean>;

  // ============================================================================
  // UTILITIES
  // ============================================================================

  /**
   * Get the underlying owner signer
   */
  getOwnerSigner(): Signer;

  /**
   * Validate a UserOperation locally
   */
  validateUserOperation(userOp: UserOperation): Promise<Result<void, string>>;

  /**
   * Estimate gas for a UserOperation
   */
  estimateUserOperationGas(userOp: UnsignedUserOperation): Promise<{
    callGasLimit: bigint;
    verificationGasLimit: bigint;
    preVerificationGas: bigint;
  }>;
}

/**
 * Multi-sig specific interface
 */
export interface IMultiSigSmartAccount extends ISmartAccount {
  /**
   * Get the signing threshold
   */
  getThreshold(): Promise<number>;

  /**
   * Add a new owner
   */
  addOwner(owner: string): Promise<UserOperation>;

  /**
   * Remove an owner
   */
  removeOwner(owner: string): Promise<UserOperation>;

  /**
   * Change the signing threshold
   */
  changeThreshold(threshold: number): Promise<UserOperation>;

  /**
   * Get pending transactions awaiting signatures
   */
  getPendingTransactions(): Promise<Array<{
    hash: string;
    userOp: UnsignedUserOperation;
    signatures: string[];
    requiredSignatures: number;
  }>>;

  /**
   * Add signature to a pending transaction
   */
  addSignature(hash: string, signature: string): Promise<Result<void, string>>;
}

/**
 * Session key configuration
 */
export interface SessionKeyConfig {
  /** Session key address */
  sessionKey: string;
  /** Valid after (timestamp) */
  validAfter: number;
  /** Valid until (timestamp) */
  validUntil: number;
  /** Allowed target contracts */
  allowedTargets?: string[];
  /** Allowed function selectors */
  allowedSelectors?: string[];
  /** Maximum ETH value per transaction */
  maxValuePerTransaction?: bigint;
  /** Maximum total ETH value */
  maxTotalValue?: bigint;
  /** Whether the session is enabled */
  isEnabled: boolean;
}

/**
 * Session key enabled account interface
 */
export interface ISessionKeyAccount extends ISmartAccount {
  /**
   * Create a new session key
   */
  createSessionKey(config: Omit<SessionKeyConfig, 'isEnabled'>): Promise<UserOperation>;

  /**
   * Revoke a session key
   */
  revokeSessionKey(sessionKey: string): Promise<UserOperation>;

  /**
   * Get all session keys
   */
  getSessionKeys(): Promise<SessionKeyConfig[]>;

  /**
   * Check if a session key is valid
   */
  isSessionKeyValid(sessionKey: string): Promise<boolean>;
}
