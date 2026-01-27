/**
 * ICustodyProvider - Server-side interface for custody solutions
 *
 * Provides integration points with institutional custody providers for:
 * - Wallet management
 * - Transaction signing
 * - Key management
 *
 * Examples: Fireblocks, BitGo, Anchorage, Copper
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Wallet types supported
 */
export type WalletType =
  | 'hot'          // Online, automated signing
  | 'warm'         // Semi-online, requires some approval
  | 'cold'         // Offline, manual signing
  | 'mpc'          // Multi-party computation
  | 'multisig';    // Multi-signature

/**
 * Create wallet parameters
 */
export interface CreateWalletParams {
  /** Wallet name/label */
  name: string;
  /** Wallet type */
  type: WalletType;
  /** Blockchain network (chain ID) */
  chainId: number;
  /** Owner identifier */
  ownerId: string;
  /** Required signers for transactions (for multisig) */
  requiredSigners?: number;
  /** Total signers (for multisig) */
  totalSigners?: number;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Wallet information
 */
export interface Wallet {
  /** Wallet ID in custody system */
  walletId: string;
  /** Wallet name */
  name: string;
  /** Wallet type */
  type: WalletType;
  /** Blockchain address */
  address: string;
  /** Chain ID */
  chainId: number;
  /** Owner ID */
  ownerId: string;
  /** Whether wallet is active */
  isActive: boolean;
  /** Creation timestamp */
  createdAt: string;
  /** Last activity timestamp */
  lastActivityAt?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Transaction signing parameters
 */
export interface SignTxParams {
  /** Wallet ID to sign with */
  walletId: string;
  /** Raw transaction data (hex) */
  transactionData: string;
  /** Chain ID */
  chainId: number;
  /** Transaction destination */
  to: string;
  /** Transaction value (wei) */
  value?: string;
  /** Gas limit */
  gasLimit?: string;
  /** Note/reason for the transaction */
  note?: string;
  /** Idempotency key */
  idempotencyKey?: string;
}

/**
 * Signed transaction result
 */
export interface SignedTransaction {
  /** Transaction ID in custody system */
  transactionId: string;
  /** Signed transaction (hex) */
  signedTransaction: string;
  /** Transaction hash */
  transactionHash: string;
  /** Status */
  status: 'pending' | 'signed' | 'broadcast' | 'confirmed' | 'failed';
  /** Signers who approved */
  signers?: string[];
  /** Timestamp of signing */
  signedAt: string;
}

/**
 * Transaction status details
 */
export interface TransactionStatus {
  /** Transaction ID */
  transactionId: string;
  /** Current status */
  status: 'pending_approval' | 'pending_signature' | 'signed' | 'broadcast' | 'confirmed' | 'failed' | 'cancelled';
  /** Transaction hash (if broadcast) */
  transactionHash?: string;
  /** Block number (if confirmed) */
  blockNumber?: number;
  /** Number of confirmations */
  confirmations?: number;
  /** Failure reason (if failed) */
  failureReason?: string;
  /** Pending approvers */
  pendingApprovers?: string[];
  /** Completed approvers */
  completedApprovers?: string[];
  /** Created timestamp */
  createdAt: string;
  /** Updated timestamp */
  updatedAt: string;
}

/**
 * Balance information
 */
export interface WalletBalance {
  /** Wallet ID */
  walletId: string;
  /** Blockchain address */
  address: string;
  /** Native currency balance */
  nativeBalance: string;
  /** Token balances */
  tokenBalances: Array<{
    tokenAddress: string;
    symbol: string;
    balance: string;
    decimals: number;
  }>;
  /** Balance timestamp */
  asOf: string;
}

// ============================================================================
// Interface
// ============================================================================

/**
 * ICustodyProvider - Interface for custody provider integrations
 */
export interface ICustodyProvider {
  /** Provider identifier */
  readonly providerId: string;

  /** Provider name for display */
  readonly providerName: string;

  /**
   * Create a new custody wallet
   * @param params Wallet creation parameters
   * @returns Created wallet
   */
  createWallet(params: CreateWalletParams): Promise<Wallet>;

  /**
   * Get wallet by ID
   * @param walletId Wallet identifier
   * @returns Wallet information
   */
  getWallet(walletId: string): Promise<Wallet>;

  /**
   * List wallets for an owner
   * @param ownerId Owner identifier
   * @returns Array of wallets
   */
  listWallets(ownerId: string): Promise<Wallet[]>;

  /**
   * Get wallet balance
   * @param walletId Wallet identifier
   * @returns Balance information
   */
  getBalance(walletId: string): Promise<WalletBalance>;

  /**
   * Sign a transaction
   * @param params Transaction signing parameters
   * @returns Signed transaction
   */
  signTransaction(params: SignTxParams): Promise<SignedTransaction>;

  /**
   * Get transaction status
   * @param transactionId Transaction identifier
   * @returns Transaction status
   */
  getTransactionStatus(transactionId: string): Promise<TransactionStatus>;

  /**
   * Get public key for a wallet
   * @param walletId Wallet identifier
   * @returns Public key (hex)
   */
  getPublicKey(walletId: string): Promise<string>;

  /**
   * Check if provider is available
   * @returns Health status
   */
  healthCheck(): Promise<boolean>;
}
