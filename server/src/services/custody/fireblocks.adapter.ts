/**
 * Fireblocks Custody Provider Adapter
 *
 * Implements the custody adapter interface for Fireblocks.
 * Docs: https://developers.fireblocks.com/
 */

import crypto from 'crypto';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import {
  CustodyProviderAdapter,
  CustodyVault,
  CustodyWallet,
  CustodyTransaction,
  TransactionStatus,
  CreateVaultParams,
  CreateWalletParams,
  CreateTransactionParams,
  SignMessageParams,
  SignedMessage,
  WebhookEvent,
  VaultAsset,
} from './custody.adapter.js';

export interface FireblocksConfig {
  apiKey: string;
  apiSecretPath: string;
  baseUrl?: string;
  webhookPublicKey?: string;
}

interface FireblocksVaultAccount {
  id: string;
  name: string;
  hiddenOnUI: boolean;
  assets: FireblocksAsset[];
  customerRefId?: string;
  autoFuel: boolean;
}

interface FireblocksAsset {
  id: string;
  total: string;
  available: string;
  pending: string;
  lockedAmount: string;
  blockHeight?: string;
  blockHash?: string;
}

interface FireblocksTransaction {
  id: string;
  externalTxId?: string;
  status: string;
  subStatus?: string;
  txHash?: string;
  operation: string;
  source: { type: string; id: string; name?: string };
  destination: { type: string; id: string; name?: string };
  amount: number;
  amountStr: string;
  assetId: string;
  fee?: number;
  feeStr?: string;
  networkFee?: number;
  netAmount?: number;
  createdAt: number;
  lastUpdated?: number;
  note?: string;
  signedBy?: string[];
}

const FIREBLOCKS_STATUS_MAP: Record<string, TransactionStatus> = {
  SUBMITTED: 'pending_signature',
  QUEUED: 'queued',
  PENDING_SIGNATURE: 'pending_signature',
  PENDING_AUTHORIZATION: 'pending_authorization',
  PENDING_3RD_PARTY_MANUAL_APPROVAL: 'pending_approval',
  PENDING_3RD_PARTY: 'pending_approval',
  BROADCASTING: 'broadcasting',
  CONFIRMING: 'confirming',
  CONFIRMED: 'confirmed',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  REJECTED: 'rejected',
  FAILED: 'failed',
  BLOCKED: 'rejected',
};

export class FireblocksAdapter implements CustodyProviderAdapter {
  readonly providerName = 'fireblocks' as const;

  private config: Required<Omit<FireblocksConfig, 'webhookPublicKey'>> & { webhookPublicKey?: string };
  private apiSecret: string;

  constructor(config: FireblocksConfig) {
    this.config = {
      apiKey: config.apiKey,
      apiSecretPath: config.apiSecretPath,
      baseUrl: config.baseUrl || 'https://api.fireblocks.io',
      webhookPublicKey: config.webhookPublicKey,
    };

    // Load API secret from file
    this.apiSecret = fs.readFileSync(config.apiSecretPath, 'utf8');
  }

  private generateJwt(path: string, body?: Record<string, unknown>): string {
    const now = Math.floor(Date.now() / 1000);
    const nonce = crypto.randomUUID();

    const payload = {
      uri: path,
      nonce,
      iat: now,
      exp: now + 30,
      sub: this.config.apiKey,
      bodyHash: body ? crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex') : undefined,
    };

    return jwt.sign(payload, this.apiSecret, { algorithm: 'RS256' });
  }

  private async request<T>(
    method: string,
    path: string,
    body?: Record<string, unknown>
  ): Promise<T> {
    const token = this.generateJwt(path, body);

    const response = await fetch(`${this.config.baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.config.apiKey,
        'Authorization': `Bearer ${token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Fireblocks API error: ${response.status} - ${error}`);
    }

    return response.json() as Promise<T>;
  }

  // ============================================================================
  // Vault Management
  // ============================================================================

  async createVault(params: CreateVaultParams): Promise<CustodyVault> {
    const fbVault = await this.request<FireblocksVaultAccount>(
      'POST',
      '/v1/vault/accounts',
      {
        name: params.name,
        autoFuel: params.autoFuel ?? false,
        customerRefId: params.metadata?.customerRefId as string,
      }
    );

    return this.mapVault(fbVault);
  }

  async getVault(vaultId: string): Promise<CustodyVault | null> {
    try {
      const fbVault = await this.request<FireblocksVaultAccount>(
        'GET',
        `/v1/vault/accounts/${vaultId}`
      );
      return this.mapVault(fbVault);
    } catch (error) {
      if (error instanceof Error && error.message.includes('404')) {
        return null;
      }
      throw error;
    }
  }

  async listVaults(): Promise<CustodyVault[]> {
    const response = await this.request<{ accounts: FireblocksVaultAccount[] }>(
      'GET',
      '/v1/vault/accounts'
    );
    return response.accounts.map(v => this.mapVault(v));
  }

  // ============================================================================
  // Wallet/Asset Management
  // ============================================================================

  async createWallet(params: CreateWalletParams): Promise<CustodyWallet> {
    // In Fireblocks, wallets are created as assets within vault accounts
    const assetId = this.getFireblocksAssetId(params.chainId, params.assetType, params.contractAddress);

    const response = await this.request<{ id: string; address: string }>(
      'POST',
      `/v1/vault/accounts/${params.vaultId}/${assetId}`,
      {}
    );

    return {
      id: response.id,
      vaultId: params.vaultId,
      name: params.name,
      address: response.address,
      chainId: params.chainId,
      assetType: params.assetType,
      contractAddress: params.contractAddress,
      createdAt: new Date(),
    };
  }

  async getWallet(vaultId: string, assetId: string): Promise<CustodyWallet | null> {
    try {
      const response = await this.request<{ id: string; address: string; total: string }>(
        'GET',
        `/v1/vault/accounts/${vaultId}/${assetId}`
      );

      return {
        id: response.id,
        vaultId,
        name: assetId,
        address: response.address,
        chainId: this.getChainIdFromAsset(assetId),
        assetType: 'ERC20',
        createdAt: new Date(),
      };
    } catch {
      return null;
    }
  }

  async listWallets(vaultId: string): Promise<CustodyWallet[]> {
    const vault = await this.getVault(vaultId);
    if (!vault) return [];

    return vault.assets.map(asset => ({
      id: asset.id,
      vaultId,
      name: asset.assetId,
      address: asset.address,
      chainId: this.getChainIdFromAsset(asset.assetId),
      assetType: 'ERC20' as const,
      createdAt: new Date(),
    }));
  }

  async getBalance(vaultId: string, assetId: string): Promise<string> {
    const response = await this.request<{ total: string; available: string }>(
      'GET',
      `/v1/vault/accounts/${vaultId}/${assetId}`
    );
    return response.available;
  }

  // ============================================================================
  // Transaction Management
  // ============================================================================

  async createTransaction(params: CreateTransactionParams): Promise<CustodyTransaction> {
    const fbTx = await this.request<FireblocksTransaction>(
      'POST',
      '/v1/transactions',
      {
        operation: this.mapOperation(params.operation),
        source: {
          type: 'VAULT_ACCOUNT',
          id: params.vaultId,
        },
        destination: {
          type: this.getDestinationType(params.destinationAddress),
          id: params.destinationAddress,
        },
        assetId: params.assetId,
        amount: params.amount,
        note: params.note,
        externalTxId: params.externalTxId,
        gasPrice: params.gasPrice,
        gasLimit: params.gasLimit,
        extraParameters: params.contractCallData ? {
          contractCallData: params.contractCallData,
        } : undefined,
      }
    );

    return this.mapTransaction(fbTx, params.vaultId);
  }

  async getTransaction(txId: string): Promise<CustodyTransaction | null> {
    try {
      const fbTx = await this.request<FireblocksTransaction>(
        'GET',
        `/v1/transactions/${txId}`
      );
      return this.mapTransaction(fbTx, fbTx.source.id);
    } catch {
      return null;
    }
  }

  async listTransactions(vaultId: string, params?: {
    status?: TransactionStatus;
    limit?: number;
    offset?: number;
  }): Promise<CustodyTransaction[]> {
    const queryParams = new URLSearchParams();
    queryParams.set('sourceId', vaultId);
    if (params?.limit) queryParams.set('limit', params.limit.toString());
    if (params?.offset) queryParams.set('offset', params.offset.toString());

    const response = await this.request<FireblocksTransaction[]>(
      'GET',
      `/v1/transactions?${queryParams.toString()}`
    );

    let transactions = response.map(tx => this.mapTransaction(tx, vaultId));

    if (params?.status) {
      transactions = transactions.filter(tx => tx.status === params.status);
    }

    return transactions;
  }

  async cancelTransaction(txId: string): Promise<boolean> {
    try {
      await this.request<{ success: boolean }>(
        'POST',
        `/v1/transactions/${txId}/cancel`
      );
      return true;
    } catch {
      return false;
    }
  }

  // ============================================================================
  // Signing
  // ============================================================================

  async signMessage(params: SignMessageParams): Promise<SignedMessage> {
    const response = await this.request<{
      signedMessages: Array<{
        content: string;
        algorithm: string;
        derivationPath: number[];
        signature: { fullSig: string; r: string; s: string; v: number };
        publicKey: string;
      }>;
    }>(
      'POST',
      '/v1/transactions',
      {
        operation: 'RAW',
        source: {
          type: 'VAULT_ACCOUNT',
          id: params.vaultId,
        },
        assetId: params.assetId,
        extraParameters: {
          rawMessageData: {
            messages: [{
              content: Buffer.from(params.message).toString('hex'),
              algorithm: params.algorithm || 'ECDSA_SECP256K1',
            }],
          },
        },
      }
    );

    const signed = response.signedMessages[0];
    return {
      signature: signed.signature.fullSig,
      publicKey: signed.publicKey,
      algorithm: signed.algorithm,
    };
  }

  async signTypedData(params: {
    vaultId: string;
    assetId: string;
    typedData: Record<string, unknown>;
  }): Promise<SignedMessage> {
    const response = await this.request<{
      signedMessages: Array<{
        signature: { fullSig: string };
        publicKey: string;
        algorithm: string;
      }>;
    }>(
      'POST',
      '/v1/transactions',
      {
        operation: 'TYPED_MESSAGE',
        source: {
          type: 'VAULT_ACCOUNT',
          id: params.vaultId,
        },
        assetId: params.assetId,
        extraParameters: {
          rawMessageData: {
            messages: [{
              content: params.typedData,
              type: 'EIP712',
            }],
          },
        },
      }
    );

    const signed = response.signedMessages[0];
    return {
      signature: signed.signature.fullSig,
      publicKey: signed.publicKey,
      algorithm: signed.algorithm,
    };
  }

  // ============================================================================
  // Webhooks
  // ============================================================================

  validateWebhook(payload: string, signature: string): boolean {
    if (!this.config.webhookPublicKey) {
      throw new Error('Webhook public key not configured');
    }

    try {
      const verify = crypto.createVerify('RSA-SHA512');
      verify.update(payload);
      return verify.verify(this.config.webhookPublicKey, signature, 'base64');
    } catch {
      return false;
    }
  }

  parseWebhookEvent(payload: string): WebhookEvent {
    const data = JSON.parse(payload);

    return {
      id: data.tenantId + '-' + data.timestamp,
      type: data.type,
      timestamp: new Date(data.timestamp),
      data: {
        transactionId: data.data?.id,
        vaultId: data.data?.source?.id,
        status: FIREBLOCKS_STATUS_MAP[data.data?.status] || 'pending_signature',
        txHash: data.data?.txHash,
      },
      rawPayload: data,
    };
  }

  // ============================================================================
  // Health
  // ============================================================================

  async healthCheck(): Promise<{ healthy: boolean; latencyMs: number }> {
    const start = Date.now();
    try {
      await this.request('GET', '/v1/supported_assets');
      return { healthy: true, latencyMs: Date.now() - start };
    } catch {
      return { healthy: false, latencyMs: Date.now() - start };
    }
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private mapVault(fb: FireblocksVaultAccount): CustodyVault {
    return {
      id: fb.id,
      name: fb.name,
      assets: fb.assets.map(a => this.mapAsset(a, fb.id)),
      createdAt: new Date(),
      metadata: { autoFuel: fb.autoFuel, customerRefId: fb.customerRefId },
    };
  }

  private mapAsset(fb: FireblocksAsset, vaultId: string): VaultAsset {
    return {
      id: fb.id,
      vaultId,
      assetId: fb.id,
      address: '', // Address is fetched separately
      balance: fb.available,
      pendingBalance: fb.pending,
      chainId: this.getChainIdFromAsset(fb.id),
    };
  }

  private mapTransaction(fb: FireblocksTransaction, vaultId: string): CustodyTransaction {
    return {
      id: fb.id,
      externalId: fb.externalTxId || fb.id,
      vaultId,
      assetId: fb.assetId,
      operation: this.reverseMapOperation(fb.operation),
      status: FIREBLOCKS_STATUS_MAP[fb.status] || 'pending_signature',
      sourceAddress: fb.source.id,
      destinationAddress: fb.destination.id,
      amount: fb.amountStr,
      fee: fb.feeStr,
      txHash: fb.txHash,
      signedBy: fb.signedBy,
      note: fb.note,
      createdAt: new Date(fb.createdAt),
      completedAt: fb.lastUpdated ? new Date(fb.lastUpdated) : undefined,
    };
  }

  private mapOperation(op: string): string {
    const map: Record<string, string> = {
      transfer: 'TRANSFER',
      mint: 'MINT',
      burn: 'BURN',
      contract_call: 'CONTRACT_CALL',
    };
    return map[op] || 'TRANSFER';
  }

  private reverseMapOperation(op: string): 'transfer' | 'mint' | 'burn' | 'contract_call' {
    const map: Record<string, 'transfer' | 'mint' | 'burn' | 'contract_call'> = {
      TRANSFER: 'transfer',
      MINT: 'mint',
      BURN: 'burn',
      CONTRACT_CALL: 'contract_call',
    };
    return map[op] || 'transfer';
  }

  private getDestinationType(address: string): string {
    // Check if it's a vault account ID (numeric) or external address
    if (/^\d+$/.test(address)) {
      return 'VAULT_ACCOUNT';
    }
    return 'ONE_TIME_ADDRESS';
  }

  private getFireblocksAssetId(chainId: number, assetType: string, contractAddress?: string): string {
    // Map chain ID to Fireblocks asset ID
    const chainMap: Record<number, string> = {
      1: 'ETH',
      137: 'MATIC_POLYGON',
      43114: 'AVAX',
      56: 'BNB_BSC',
      42161: 'ETH-AETH',
      10: 'ETH-OPT',
      8453: 'ETH-BASE',
    };

    if (assetType === 'ERC20' && contractAddress) {
      return `${chainMap[chainId] || 'ETH'}_${contractAddress}`;
    }

    return chainMap[chainId] || 'ETH';
  }

  private getChainIdFromAsset(assetId: string): number {
    const assetMap: Record<string, number> = {
      ETH: 1,
      MATIC_POLYGON: 137,
      AVAX: 43114,
      BNB_BSC: 56,
    };

    for (const [prefix, chainId] of Object.entries(assetMap)) {
      if (assetId.startsWith(prefix)) {
        return chainId;
      }
    }

    return 1; // Default to Ethereum
  }
}

export function createFireblocksAdapter(config: FireblocksConfig): FireblocksAdapter {
  return new FireblocksAdapter(config);
}
