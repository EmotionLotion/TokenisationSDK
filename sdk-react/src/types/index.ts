/**
 * React SDK Types
 *
 * Type definitions for the React integration layer.
 * Partners use these types when building their UIs.
 *
 * Note: We define types locally rather than importing from core SDK
 * to ensure API stability for React consumers.
 */

// ============================================================================
// CORE TYPES (locally defined for stability)
// ============================================================================

/**
 * Asset lifecycle states
 */
export type LifecycleState =
  | 'DRAFT'
  | 'PENDING_VERIFICATION'
  | 'VERIFIED'
  | 'ACTIVE'
  | 'SUSPENDED'
  | 'FROZEN'
  | 'REDEEMED'
  | 'TERMINATED';

/**
 * Compliance action types for evaluation
 */
export type ComplianceAction =
  | 'asset:create'
  | 'asset:verify'
  | 'asset:activate'
  | 'token:mint'
  | 'token:transfer'
  | 'token:burn'
  | 'party:register';

/**
 * Policy decision result
 */
export interface PolicyDecision {
  id: string;
  action: ComplianceAction;
  result: 'ALLOW' | 'DENY' | 'CONDITIONAL';
  conditions?: string[];
  violations: PolicyViolation[];
  warnings: PolicyWarning[];
  policyVersion: string;
  policyHash: string;
  evaluatedAt: string;
}

/**
 * Policy violation
 */
export interface PolicyViolation {
  code: string;
  message: string;
  severity: 'ERROR' | 'CRITICAL';
  rule: string;
  field?: string;
}

/**
 * Policy warning
 */
export interface PolicyWarning {
  code: string;
  message: string;
  rule: string;
}

/**
 * Decision receipt for audit trail
 */
export interface DecisionReceipt {
  id: string;
  decisionId: string;
  action: ComplianceAction;
  result: 'ALLOW' | 'DENY' | 'CONDITIONAL';
  issuedAt: string;
  issuedBy: string;
  policyVersion: string;
  policyHash: string;
  decisionHash: string;
  previousReceiptHash?: string;
  subjectType: 'asset' | 'party' | 'transfer';
  subjectId: string;
  actorId: string;
  signature: string;
  summary: string;
  reasons: string[];
}

/**
 * KYC verification levels
 */
export type KYCLevel =
  | 'none'
  | 'basic'
  | 'standard'
  | 'enhanced'
  | 'institutional';

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
 * Asset definition
 */
export interface Asset {
  id: string;
  name: string;
  symbol?: string;
  description?: string;
  rightType: string;
  jurisdiction: string;
  state: LifecycleState;
  ownerId: string;
  totalShares?: number;
  pricePerShare?: number;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

/**
 * Token info
 */
export interface TokenInfo {
  assetId: string;
  tokenAddress?: string;
  chainId?: number;
  standard?: string;
  decimals: number;
  totalSupply: string;
}

/**
 * Party (investor/user) record
 */
export interface Party {
  id: string;
  name: string;
  type: 'individual' | 'corporate' | 'institutional';
  walletAddress?: string;
  email?: string;
  kycLevel?: KYCLevel;
  kycStatus?: KYCStatus;
  accredited?: boolean;
  jurisdiction?: string;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// SDK CONFIGURATION
// ============================================================================

/**
 * SDK initialization configuration
 */
export interface TokenisationConfig {
  /** API endpoint for the tokenisation server */
  apiUrl: string;

  /** Organization ID for multi-tenant deployments */
  orgId?: string;

  /** Default jurisdiction (ISO country code) */
  defaultJurisdiction?: string;

  /** Supported blockchain networks */
  networks?: NetworkConfig[];

  /** Custom storage adapter (for document uploads) */
  storage?: StorageConfig;

  /** KYC provider configuration */
  kyc?: KYCProviderConfig;

  /** Custody provider configuration */
  custody?: CustodyProviderConfig;

  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Network configuration
 */
export interface NetworkConfig {
  chainId: number;
  name: string;
  rpcUrl: string;
  blockExplorerUrl?: string;
  /** Is this network the default? */
  isDefault?: boolean;
}

/**
 * Storage configuration for documents
 */
export interface StorageConfig {
  /** Storage type */
  type: 'ipfs' | 's3' | 'azure' | 'custom';
  /** Endpoint URL */
  endpoint?: string;
  /** API key (for hosted services) */
  apiKey?: string;
  /** Custom upload handler */
  customUpload?: (file: File, metadata: DocumentMetadata) => Promise<string>;
}

/**
 * KYC provider configuration
 */
export interface KYCProviderConfig {
  provider: 'jumio' | 'onfido' | 'sumsub' | 'persona' | 'custom';
  apiKey?: string;
  sdkToken?: string;
  webhookUrl?: string;
}

/**
 * Custody provider configuration
 */
export interface CustodyProviderConfig {
  provider: 'fireblocks' | 'bitgo' | 'anchorage' | 'self' | 'custom';
  apiKey?: string;
  vaultId?: string;
}

// ============================================================================
// WALLET TYPES
// ============================================================================

/**
 * Connected wallet information
 */
export interface WalletConnection {
  /** Wallet address */
  address: string;
  /** Connected chain ID */
  chainId: number;
  /** Wallet provider name */
  provider: string;
  /** Whether wallet is connected */
  isConnected: boolean;
  /** ENS name if available */
  ensName?: string;
}

/**
 * Supported wallet providers
 */
export type WalletProvider =
  | 'metamask'
  | 'walletconnect'
  | 'coinbase'
  | 'phantom'
  | 'ledger'
  | 'custom';

/**
 * Wallet connection options
 */
export interface WalletConnectOptions {
  /** Preferred wallet provider */
  preferredProvider?: WalletProvider;
  /** Required chain ID */
  requiredChainId?: number;
  /** Auto-connect on mount */
  autoConnect?: boolean;
}

// ============================================================================
// DOCUMENT TYPES
// ============================================================================

/**
 * Document metadata
 */
export interface DocumentMetadata {
  /** Document type */
  type: DocumentType;
  /** Associated asset ID */
  assetId?: string;
  /** Associated party ID */
  partyId?: string;
  /** Document description */
  description?: string;
  /** Tags for categorization */
  tags?: string[];
  /** Expiration date */
  expiresAt?: string;
}

/**
 * Document types for tokenisation
 */
export type DocumentType =
  | 'proof_of_ownership'
  | 'title_deed'
  | 'valuation_report'
  | 'legal_opinion'
  | 'prospectus'
  | 'shareholder_agreement'
  | 'id_document'
  | 'proof_of_address'
  | 'accreditation_letter'
  | 'tax_certificate'
  | 'other';

/**
 * Uploaded document record
 */
export interface UploadedDocument {
  id: string;
  type: DocumentType;
  filename: string;
  /** Storage URI (IPFS hash, S3 URL, etc.) */
  storageUri: string;
  /** File hash for verification */
  contentHash: string;
  /** Upload timestamp */
  uploadedAt: string;
  /** File size in bytes */
  size: number;
  /** MIME type */
  mimeType: string;
  /** Document metadata */
  metadata: DocumentMetadata;
  /** Verification status */
  verified: boolean;
}

// ============================================================================
// UI STATE TYPES
// ============================================================================

/**
 * Async operation state
 */
export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
}

/**
 * Asset creation form data
 */
export interface AssetFormData {
  name: string;
  symbol: string;
  description?: string;
  rightType: string;
  jurisdiction: string;
  totalShares?: number;
  pricePerShare?: number;
  documents: File[];
  metadata?: Record<string, unknown>;
}

/**
 * KYC form data
 */
export interface KYCFormData {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  dateOfBirth: string;
  nationality: string;
  address: {
    street: string;
    city: string;
    state?: string;
    postalCode: string;
    country: string;
  };
  idDocument?: File;
  proofOfAddress?: File;
}

/**
 * Transfer form data
 */
export interface TransferFormData {
  assetId: string;
  fromAddress: string;
  toAddress: string;
  amount: string;
  memo?: string;
}

// ============================================================================
// CALLBACK TYPES
// ============================================================================

/**
 * Event callbacks for SDK operations
 */
export interface TokenisationCallbacks {
  /** Called when wallet connects */
  onWalletConnect?: (wallet: WalletConnection) => void;
  /** Called when wallet disconnects */
  onWalletDisconnect?: () => void;
  /** Called on transaction submitted */
  onTransactionSubmit?: (txHash: string) => void;
  /** Called on transaction confirmed */
  onTransactionConfirm?: (txHash: string, receipt: unknown) => void;
  /** Called on transaction error */
  onTransactionError?: (error: Error) => void;
  /** Called on compliance decision */
  onComplianceDecision?: (decision: PolicyDecision, receipt: DecisionReceipt) => void;
  /** Called on document upload */
  onDocumentUpload?: (document: UploadedDocument) => void;
  /** Called on KYC status change */
  onKYCStatusChange?: (status: KYCStatus) => void;
  /** Called on asset state change */
  onAssetStateChange?: (assetId: string, newState: LifecycleState) => void;
}

// ============================================================================
// CONTEXT TYPES
// ============================================================================

/**
 * SDK Context value
 */
export interface TokenisationContextValue {
  /** SDK configuration */
  config: TokenisationConfig;

  /** Whether SDK is initialized */
  isInitialized: boolean;

  /** Current connected wallet */
  wallet: WalletConnection | null;

  /** Current user's party record */
  currentParty: Party | null;

  /** Connect wallet */
  connectWallet: (options?: WalletConnectOptions) => Promise<WalletConnection>;

  /** Disconnect wallet */
  disconnectWallet: () => Promise<void>;

  /** Switch network */
  switchNetwork: (chainId: number) => Promise<void>;
}
