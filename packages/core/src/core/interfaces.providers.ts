/**
 * Provider Interfaces - External System Integration Points
 *
 * The SDK is the BRAIN (compliance, decisions, orchestration).
 * Providers are the BODY (custody, KYC, exchanges, settlement).
 *
 * Anyone can plug in by implementing these interfaces.
 */

import type { Result } from './types.js';

// ============================================================================
// CUSTODY PROVIDER
// ============================================================================

/**
 * Custody arrangements supported
 */
export type CustodyArrangementType =
  | 'self'           // User holds own keys
  | 'qualified'      // Qualified custodian (bank, trust company)
  | 'mpc'            // Multi-party computation
  | 'multisig'       // Multi-signature wallet
  | 'institutional'; // Prime broker / institutional custody

/**
 * Custody account information
 */
export interface CustodyAccount {
  accountId: string;
  custodyType: CustodyArrangementType;
  providerName: string;
  /** Blockchain addresses controlled by this account */
  addresses: string[];
  /** Whether account can sign transactions */
  canSign: boolean;
  /** Whether account is active */
  isActive: boolean;
  /** Metadata from provider */
  metadata?: Record<string, unknown>;
}

/**
 * Transaction signing request
 */
export interface SigningRequest {
  accountId: string;
  transactionData: string;
  chainId: number;
  /** Optional: require N approvals before signing */
  requiredApprovals?: number;
  /** Optional: time limit for signing */
  expiresAt?: string;
}

/**
 * Signed transaction result
 */
export interface SignedTransaction {
  requestId: string;
  signature: string;
  signedAt: string;
  signers: string[];
}

/**
 * ICustodyProvider - Plug in any custody solution
 *
 * Examples: Fireblocks, BitGo, Anchorage, Copper, self-custody
 */
export interface ICustodyProvider {
  /** Provider identifier */
  readonly providerId: string;

  /** Provider name for display */
  readonly providerName: string;

  /** Custody type this provider offers */
  readonly custodyType: CustodyArrangementType;

  /**
   * Create a new custody account
   */
  createAccount(params: {
    ownerId: string;
    label?: string;
    metadata?: Record<string, unknown>;
  }): Promise<Result<CustodyAccount, string>>;

  /**
   * Get account details
   */
  getAccount(accountId: string): Promise<Result<CustodyAccount, string>>;

  /**
   * List accounts for an owner
   */
  listAccounts(ownerId: string): Promise<Result<CustodyAccount[], string>>;

  /**
   * Generate new address for account
   */
  generateAddress(accountId: string, chainId: number): Promise<Result<string, string>>;

  /**
   * Request transaction signing
   * Returns request ID - signing may be async (approvals needed)
   */
  requestSigning(request: SigningRequest): Promise<Result<{ requestId: string }, string>>;

  /**
   * Get signing status
   */
  getSigningStatus(requestId: string): Promise<Result<{
    status: 'pending' | 'approved' | 'rejected' | 'signed' | 'expired';
    signedTransaction?: SignedTransaction;
    rejectionReason?: string;
  }, string>>;

  /**
   * Check if provider is available
   */
  healthCheck(): Promise<boolean>;
}

// ============================================================================
// KYC PROVIDER
// ============================================================================

/**
 * KYC verification levels
 */
export type KYCLevel =
  | 'none'
  | 'basic'        // Name, email, phone
  | 'standard'     // + ID document, address
  | 'enhanced'     // + Source of funds, PEP check
  | 'institutional'; // Full institutional onboarding

/**
 * KYC verification status
 */
export type KYCStatus =
  | 'not_started'
  | 'pending'
  | 'in_review'
  | 'approved'
  | 'rejected'
  | 'expired';

/**
 * KYC verification result
 */
export interface KYCVerification {
  verificationId: string;
  subjectId: string;
  level: KYCLevel;
  status: KYCStatus;
  /** ISO country code of verified jurisdiction */
  jurisdiction?: string;
  /** Whether subject is accredited investor */
  accreditedInvestor?: boolean;
  /** Whether subject is PEP (Politically Exposed Person) */
  isPEP?: boolean;
  /** Sanctions screening result */
  sanctionsStatus?: 'clear' | 'flagged' | 'blocked';
  /** When verification was completed */
  verifiedAt?: string;
  /** When verification expires */
  expiresAt?: string;
  /** Rejection reason if rejected */
  rejectionReason?: string;
  /** Raw data from provider (for audit) */
  providerData?: Record<string, unknown>;
}

/**
 * IKYCProvider - Plug in any KYC/AML solution
 *
 * Examples: Jumio, Onfido, Sumsub, Persona, Trulioo
 */
export interface IKYCProvider {
  /** Provider identifier */
  readonly providerId: string;

  /** Provider name for display */
  readonly providerName: string;

  /** Supported verification levels */
  readonly supportedLevels: KYCLevel[];

  /**
   * Initiate KYC verification
   * Returns URL/token for user to complete verification
   */
  initiateVerification(params: {
    subjectId: string;
    level: KYCLevel;
    /** Redirect URL after completion */
    redirectUrl?: string;
    /** Webhook URL for status updates */
    webhookUrl?: string;
    /** Pre-filled data */
    prefill?: {
      email?: string;
      phone?: string;
      firstName?: string;
      lastName?: string;
      dateOfBirth?: string;
      country?: string;
    };
  }): Promise<Result<{
    verificationId: string;
    /** URL for user to complete KYC */
    verificationUrl: string;
    /** Token for SDK-based verification */
    sdkToken?: string;
  }, string>>;

  /**
   * Get verification status
   */
  getVerification(verificationId: string): Promise<Result<KYCVerification, string>>;

  /**
   * Get latest verification for a subject
   */
  getSubjectVerification(subjectId: string): Promise<Result<KYCVerification | null, string>>;

  /**
   * Run sanctions screening
   */
  screenSanctions(params: {
    subjectId: string;
    fullName: string;
    dateOfBirth?: string;
    country?: string;
  }): Promise<Result<{
    status: 'clear' | 'flagged' | 'blocked';
    matches?: Array<{
      listName: string;
      matchScore: number;
      details: string;
    }>;
  }, string>>;

  /**
   * Handle webhook from provider
   */
  handleWebhook(payload: unknown, signature: string): Promise<Result<{
    verificationId: string;
    newStatus: KYCStatus;
  }, string>>;

  /**
   * Check if provider is available
   */
  healthCheck(): Promise<boolean>;
}

// ============================================================================
// EXCHANGE PROVIDER
// ============================================================================

/**
 * Order side
 */
export type OrderSide = 'buy' | 'sell';

/**
 * Order type
 */
export type OrderType = 'market' | 'limit' | 'stop' | 'stop_limit';

/**
 * Order status
 */
export type OrderStatus =
  | 'pending'
  | 'open'
  | 'partially_filled'
  | 'filled'
  | 'cancelled'
  | 'rejected'
  | 'expired';

/**
 * Order details
 */
export interface Order {
  orderId: string;
  assetId: string;
  side: OrderSide;
  type: OrderType;
  status: OrderStatus;
  /** Amount to trade */
  quantity: string;
  /** Filled amount */
  filledQuantity: string;
  /** Limit price (for limit orders) */
  price?: string;
  /** Average fill price */
  avgFillPrice?: string;
  /** Trading pair (e.g., 'ASSET/USDC') */
  pair: string;
  /** Order creator */
  traderId: string;
  createdAt: string;
  updatedAt: string;
  /** Trades that filled this order */
  trades?: Trade[];
}

/**
 * Trade execution
 */
export interface Trade {
  tradeId: string;
  orderId: string;
  side: OrderSide;
  quantity: string;
  price: string;
  fee: string;
  feeCurrency: string;
  executedAt: string;
  /** Counterparty (if disclosed) */
  counterpartyId?: string;
}

/**
 * Order book entry
 */
export interface OrderBookEntry {
  price: string;
  quantity: string;
  orderCount: number;
}

/**
 * IExchangeProvider - Plug in any exchange/ATS
 *
 * Examples: tZERO, INX, Securitize Markets, internal OTC desk
 */
export interface IExchangeProvider {
  /** Provider identifier */
  readonly providerId: string;

  /** Provider name for display */
  readonly providerName: string;

  /** Supported trading pairs */
  readonly supportedPairs: string[];

  /**
   * Place an order
   */
  placeOrder(params: {
    assetId: string;
    traderId: string;
    side: OrderSide;
    type: OrderType;
    quantity: string;
    price?: string;
    /** Time in force */
    timeInForce?: 'GTC' | 'IOC' | 'FOK' | 'DAY';
    /** Client-provided order ID for idempotency */
    clientOrderId?: string;
  }): Promise<Result<Order, string>>;

  /**
   * Cancel an order
   */
  cancelOrder(orderId: string, traderId: string): Promise<Result<Order, string>>;

  /**
   * Get order details
   */
  getOrder(orderId: string): Promise<Result<Order, string>>;

  /**
   * List orders for a trader
   */
  listOrders(params: {
    traderId: string;
    assetId?: string;
    status?: OrderStatus[];
    limit?: number;
    offset?: number;
  }): Promise<Result<Order[], string>>;

  /**
   * Get order book for an asset
   */
  getOrderBook(assetId: string, depth?: number): Promise<Result<{
    bids: OrderBookEntry[];
    asks: OrderBookEntry[];
    lastPrice?: string;
    timestamp: string;
  }, string>>;

  /**
   * Get trade history
   */
  getTradeHistory(params: {
    traderId?: string;
    assetId?: string;
    fromDate?: string;
    toDate?: string;
    limit?: number;
  }): Promise<Result<Trade[], string>>;

  /**
   * Check if trading is enabled for an asset
   */
  isTradingEnabled(assetId: string): Promise<boolean>;

  /**
   * Check if provider is available
   */
  healthCheck(): Promise<boolean>;
}

// ============================================================================
// SETTLEMENT PROVIDER
// ============================================================================

/**
 * Settlement types
 */
export type SettlementType =
  | 'instant'    // Real-time settlement
  | 'T+0'        // Same day
  | 'T+1'        // Next day
  | 'T+2'        // Two days (traditional)
  | 'atomic'     // DvP atomic swap
  | 'escrow';    // Escrow-based

/**
 * Settlement status
 */
export type SettlementStatus =
  | 'pending'
  | 'processing'
  | 'awaiting_funds'
  | 'awaiting_assets'
  | 'settled'
  | 'failed'
  | 'cancelled';

/**
 * Settlement instruction
 */
export interface SettlementInstruction {
  instructionId: string;
  /** Trade or transfer being settled */
  referenceId: string;
  referenceType: 'trade' | 'transfer' | 'redemption' | 'issuance';
  settlementType: SettlementType;
  status: SettlementStatus;
  /** Asset leg */
  asset: {
    assetId: string;
    quantity: string;
    fromAccount: string;
    toAccount: string;
  };
  /** Cash leg (if DvP) */
  cash?: {
    currency: string;
    amount: string;
    fromAccount: string;
    toAccount: string;
  };
  /** When settlement should occur */
  settlementDate: string;
  /** When actually settled */
  settledAt?: string;
  /** Failure reason */
  failureReason?: string;
  /** On-chain transaction hash (if applicable) */
  transactionHash?: string;
}

/**
 * ISettlementProvider - Plug in any settlement system
 *
 * Examples: DTCC, Paxos Settlement, Fireblocks, internal ledger
 */
export interface ISettlementProvider {
  /** Provider identifier */
  readonly providerId: string;

  /** Provider name for display */
  readonly providerName: string;

  /** Supported settlement types */
  readonly supportedTypes: SettlementType[];

  /**
   * Create settlement instruction
   */
  createInstruction(params: {
    referenceId: string;
    referenceType: 'trade' | 'transfer' | 'redemption' | 'issuance';
    settlementType: SettlementType;
    asset: {
      assetId: string;
      quantity: string;
      fromAccount: string;
      toAccount: string;
    };
    cash?: {
      currency: string;
      amount: string;
      fromAccount: string;
      toAccount: string;
    };
    /** Preferred settlement date */
    settlementDate?: string;
  }): Promise<Result<SettlementInstruction, string>>;

  /**
   * Get instruction status
   */
  getInstruction(instructionId: string): Promise<Result<SettlementInstruction, string>>;

  /**
   * List instructions
   */
  listInstructions(params: {
    referenceId?: string;
    status?: SettlementStatus[];
    fromDate?: string;
    toDate?: string;
    limit?: number;
  }): Promise<Result<SettlementInstruction[], string>>;

  /**
   * Cancel instruction (if not yet processing)
   */
  cancelInstruction(instructionId: string): Promise<Result<SettlementInstruction, string>>;

  /**
   * Confirm receipt of assets (for escrow-based)
   */
  confirmAssetReceipt(instructionId: string): Promise<Result<void, string>>;

  /**
   * Confirm receipt of funds (for escrow-based)
   */
  confirmFundsReceipt(instructionId: string): Promise<Result<void, string>>;

  /**
   * Get settlement window (when settlement runs)
   */
  getSettlementWindow(): Promise<{
    nextSettlementTime: string;
    cutoffTime: string;
    timezone: string;
  }>;

  /**
   * Check if provider is available
   */
  healthCheck(): Promise<boolean>;
}

// ============================================================================
// PROVIDER REGISTRY
// ============================================================================

/**
 * Provider types
 */
export type ProviderType = 'custody' | 'kyc' | 'exchange' | 'settlement';

/**
 * Any provider
 */
export type AnyProvider =
  | ICustodyProvider
  | IKYCProvider
  | IExchangeProvider
  | ISettlementProvider;

/**
 * Provider registration
 */
export interface ProviderRegistration<T extends AnyProvider = AnyProvider> {
  type: ProviderType;
  provider: T;
  /** Priority (lower = higher priority) */
  priority: number;
  /** Whether this is the default for its type */
  isDefault: boolean;
}

/**
 * IProviderRegistry - Central registry for all external providers
 */
export interface IProviderRegistry {
  /**
   * Register a provider
   */
  register<T extends AnyProvider>(
    type: ProviderType,
    provider: T,
    options?: { priority?: number; isDefault?: boolean }
  ): void;

  /**
   * Get default provider for a type
   */
  getDefault<T extends AnyProvider>(type: ProviderType): T | undefined;

  /**
   * Get provider by ID
   */
  get<T extends AnyProvider>(type: ProviderType, providerId: string): T | undefined;

  /**
   * Get all providers of a type
   */
  getAll<T extends AnyProvider>(type: ProviderType): T[];

  /**
   * Check if a provider is registered
   */
  has(type: ProviderType, providerId: string): boolean;

  /**
   * Unregister a provider
   */
  unregister(type: ProviderType, providerId: string): boolean;

  /**
   * Health check all providers
   */
  healthCheckAll(): Promise<Map<string, boolean>>;
}
