/**
 * Custody Provider Adapter Interface
 *
 * Abstracts custody provider implementations to allow easy switching
 * between Fireblocks, BitGo, and other institutional custody providers.
 */

export type CustodyProvider = 'fireblocks' | 'bitgo' | 'mock';

export type TransactionStatus =
  | 'pending_signature'
  | 'pending_approval'
  | 'pending_authorization'
  | 'queued'
  | 'broadcasting'
  | 'confirming'
  | 'confirmed'
  | 'completed'
  | 'cancelled'
  | 'rejected'
  | 'failed';

export type AssetType = 'ETH' | 'MATIC' | 'AVAX' | 'BNB' | 'ERC20' | 'ERC721' | 'ERC1155' | 'NATIVE';

export interface CustodyVault {
  id: string;
  name: string;
  assets: VaultAsset[];
  createdAt: Date;
  metadata?: Record<string, unknown>;
}

export interface VaultAsset {
  id: string;
  vaultId: string;
  assetId: string;
  address: string;
  balance: string;
  pendingBalance?: string;
  chainId: number;
}

export interface CustodyWallet {
  id: string;
  vaultId: string;
  name: string;
  address: string;
  chainId: number;
  assetType: AssetType;
  contractAddress?: string;
  createdAt: Date;
}

export interface CustodyTransaction {
  id: string;
  externalId: string;
  vaultId: string;
  assetId: string;
  operation: 'transfer' | 'mint' | 'burn' | 'contract_call';
  status: TransactionStatus;
  sourceAddress: string;
  destinationAddress: string;
  amount: string;
  fee?: string;
  txHash?: string;
  blockNumber?: number;
  signedBy?: string[];
  note?: string;
  createdAt: Date;
  completedAt?: Date;
  metadata?: Record<string, unknown>;
}

export interface CreateVaultParams {
  name: string;
  autoFuel?: boolean;
  metadata?: Record<string, unknown>;
}

export interface CreateWalletParams {
  vaultId: string;
  name: string;
  chainId: number;
  assetType: AssetType;
  contractAddress?: string;
}

export interface CreateTransactionParams {
  vaultId: string;
  assetId: string;
  operation: 'transfer' | 'mint' | 'burn' | 'contract_call';
  sourceAddress: string;
  destinationAddress: string;
  amount: string;
  note?: string;
  externalTxId?: string;
  gasPrice?: string;
  gasLimit?: string;
  // For contract calls
  contractCallData?: string;
  metadata?: Record<string, unknown>;
}

export interface SignMessageParams {
  vaultId: string;
  assetId: string;
  message: string;
  algorithm?: 'ECDSA_SECP256K1' | 'EDDSA_ED25519';
}

export interface SignedMessage {
  signature: string;
  publicKey: string;
  algorithm: string;
}

export interface WebhookEvent {
  id: string;
  type: string;
  timestamp: Date;
  data: {
    transactionId?: string;
    vaultId?: string;
    status?: TransactionStatus;
    txHash?: string;
  };
  rawPayload: Record<string, unknown>;
}

export interface CustodyProviderAdapter {
  readonly providerName: CustodyProvider;

  // Vault Management
  createVault(params: CreateVaultParams): Promise<CustodyVault>;
  getVault(vaultId: string): Promise<CustodyVault | null>;
  listVaults(): Promise<CustodyVault[]>;

  // Wallet/Asset Management
  createWallet(params: CreateWalletParams): Promise<CustodyWallet>;
  getWallet(vaultId: string, assetId: string): Promise<CustodyWallet | null>;
  listWallets(vaultId: string): Promise<CustodyWallet[]>;
  getBalance(vaultId: string, assetId: string): Promise<string>;

  // Transaction Management
  createTransaction(params: CreateTransactionParams): Promise<CustodyTransaction>;
  getTransaction(txId: string): Promise<CustodyTransaction | null>;
  listTransactions(vaultId: string, params?: {
    status?: TransactionStatus;
    limit?: number;
    offset?: number;
  }): Promise<CustodyTransaction[]>;
  cancelTransaction(txId: string): Promise<boolean>;

  // Signing
  signMessage(params: SignMessageParams): Promise<SignedMessage>;
  signTypedData(params: {
    vaultId: string;
    assetId: string;
    typedData: Record<string, unknown>;
  }): Promise<SignedMessage>;

  // Webhooks
  validateWebhook(payload: string, signature: string): boolean;
  parseWebhookEvent(payload: string): WebhookEvent;

  // Health
  healthCheck(): Promise<{ healthy: boolean; latencyMs: number }>;
}

export interface CustodyProviderConfig {
  fireblocks?: {
    apiKey: string;
    apiSecretPath: string;
    baseUrl?: string;
    webhookPublicKey?: string;
  };
  bitgo?: {
    accessToken: string;
    baseUrl?: string;
    walletPassphrase?: string;
    webhookToken?: string;
  };
}
