/**
 * BitGo Custody Provider Adapter
 *
 * Implements the custody adapter interface for BitGo.
 * Docs: https://developers.bitgo.com/
 */

import crypto from 'crypto';
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

export interface BitGoConfig {
  accessToken: string;
  baseUrl?: string;
  walletPassphrase?: string;
  webhookToken?: string;
  enterprise?: string;
}

interface BitGoWallet {
  id: string;
  label: string;
  coin: string;
  enterprise?: string;
  balance: number;
  balanceString: string;
  confirmedBalance: number;
  confirmedBalanceString: string;
  spendableBalance: number;
  spendableBalanceString: string;
  receiveAddress: { address: string };
  keys: string[];
  users: Array<{ user: string; permissions: string[] }>;
  createdDate: string;
}

interface BitGoTransfer {
  id: string;
  coin: string;
  wallet: string;
  txid?: string;
  height?: number;
  type: string;
  state: string;
  entries: Array<{
    address: string;
    value: number;
    valueString: string;
  }>;
  value: number;
  valueString: string;
  fee?: number;
  feeString?: string;
  date: string;
  comment?: string;
  signedBy?: string[];
}

interface BitGoPendingApproval {
  id: string;
  wallet: string;
  enterprise?: string;
  state: string;
  creator: string;
  createDate: string;
  info: {
    type: string;
    transactionRequest?: {
      recipients: Array<{ address: string; amount: string }>;
    };
  };
}

const BITGO_STATUS_MAP: Record<string, TransactionStatus> = {
  signed: 'pending_approval',
  pendingApproval: 'pending_approval',
  pending: 'broadcasting',
  unconfirmed: 'confirming',
  confirmed: 'confirmed',
  completed: 'completed',
  rejected: 'rejected',
  failed: 'failed',
};

export class BitGoAdapter implements CustodyProviderAdapter {
  readonly providerName = 'bitgo' as const;

  private config: Required<Omit<BitGoConfig, 'enterprise' | 'webhookToken'>> & {
    enterprise?: string;
    webhookToken?: string;
  };

  constructor(config: BitGoConfig) {
    this.config = {
      accessToken: config.accessToken,
      baseUrl: config.baseUrl || 'https://app.bitgo.com',
      walletPassphrase: config.walletPassphrase || '',
      enterprise: config.enterprise,
      webhookToken: config.webhookToken,
    };
  }

  private async request<T>(
    method: string,
    path: string,
    body?: Record<string, unknown>
  ): Promise<T> {
    const response = await fetch(`${this.config.baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.accessToken}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`BitGo API error: ${response.status} - ${error}`);
    }

    return response.json() as Promise<T>;
  }

  // ============================================================================
  // Vault Management (BitGo uses Wallets as vaults)
  // ============================================================================

  async createVault(params: CreateVaultParams): Promise<CustodyVault> {
    // In BitGo, vaults are essentially enterprise wallets
    // For this adapter, we'll create an ETH wallet as the primary vault
    const wallet = await this.request<BitGoWallet>(
      'POST',
      '/api/v2/eth/wallet/generate',
      {
        label: params.name,
        passphrase: this.config.walletPassphrase,
        enterprise: this.config.enterprise,
        multisigType: 'tss',
      }
    );

    return this.mapWalletToVault(wallet);
  }

  async getVault(vaultId: string): Promise<CustodyVault | null> {
    try {
      // Determine coin from wallet ID or default to ETH
      const wallet = await this.request<BitGoWallet>(
        'GET',
        `/api/v2/eth/wallet/${vaultId}`
      );
      return this.mapWalletToVault(wallet);
    } catch (error) {
      if (error instanceof Error && error.message.includes('404')) {
        return null;
      }
      throw error;
    }
  }

  async listVaults(): Promise<CustodyVault[]> {
    const response = await this.request<{ wallets: BitGoWallet[] }>(
      'GET',
      '/api/v2/eth/wallet'
    );
    return response.wallets.map(w => this.mapWalletToVault(w));
  }

  // ============================================================================
  // Wallet/Asset Management
  // ============================================================================

  async createWallet(params: CreateWalletParams): Promise<CustodyWallet> {
    const coin = this.getCoinFromChainId(params.chainId);

    const wallet = await this.request<BitGoWallet>(
      'POST',
      `/api/v2/${coin}/wallet/generate`,
      {
        label: params.name,
        passphrase: this.config.walletPassphrase,
        enterprise: this.config.enterprise,
        multisigType: 'tss',
      }
    );

    return {
      id: wallet.id,
      vaultId: params.vaultId,
      name: wallet.label,
      address: wallet.receiveAddress.address,
      chainId: params.chainId,
      assetType: params.assetType,
      contractAddress: params.contractAddress,
      createdAt: new Date(wallet.createdDate),
    };
  }

  async getWallet(vaultId: string, assetId: string): Promise<CustodyWallet | null> {
    try {
      const coin = assetId.toLowerCase();
      const wallet = await this.request<BitGoWallet>(
        'GET',
        `/api/v2/${coin}/wallet/${vaultId}`
      );

      return {
        id: wallet.id,
        vaultId,
        name: wallet.label,
        address: wallet.receiveAddress.address,
        chainId: this.getChainIdFromCoin(coin),
        assetType: 'NATIVE',
        createdAt: new Date(wallet.createdDate),
      };
    } catch {
      return null;
    }
  }

  async listWallets(vaultId: string): Promise<CustodyWallet[]> {
    // List wallets across supported coins
    const coins = ['eth', 'matic', 'avax'];
    const wallets: CustodyWallet[] = [];

    for (const coin of coins) {
      try {
        const response = await this.request<{ wallets: BitGoWallet[] }>(
          'GET',
          `/api/v2/${coin}/wallet`
        );

        for (const wallet of response.wallets) {
          wallets.push({
            id: wallet.id,
            vaultId,
            name: wallet.label,
            address: wallet.receiveAddress.address,
            chainId: this.getChainIdFromCoin(coin),
            assetType: 'NATIVE',
            createdAt: new Date(wallet.createdDate),
          });
        }
      } catch {
        // Coin not enabled for this enterprise
      }
    }

    return wallets;
  }

  async getBalance(vaultId: string, assetId: string): Promise<string> {
    const coin = assetId.toLowerCase();
    const wallet = await this.request<BitGoWallet>(
      'GET',
      `/api/v2/${coin}/wallet/${vaultId}`
    );
    return wallet.spendableBalanceString;
  }

  // ============================================================================
  // Transaction Management
  // ============================================================================

  async createTransaction(params: CreateTransactionParams): Promise<CustodyTransaction> {
    const coin = this.getCoinFromChainId(this.getChainIdFromAsset(params.assetId));

    // Build transaction
    const prebuild = await this.request<{
      txHex: string;
      txInfo: Record<string, unknown>;
    }>(
      'POST',
      `/api/v2/${coin}/wallet/${params.vaultId}/tx/build`,
      {
        recipients: [{
          address: params.destinationAddress,
          amount: params.amount,
        }],
        comment: params.note,
      }
    );

    // Send transaction
    const tx = await this.request<BitGoTransfer>(
      'POST',
      `/api/v2/${coin}/wallet/${params.vaultId}/tx/send`,
      {
        txHex: prebuild.txHex,
        walletPassphrase: this.config.walletPassphrase,
        comment: params.note,
      }
    );

    return this.mapTransfer(tx, params.vaultId);
  }

  async getTransaction(txId: string): Promise<CustodyTransaction | null> {
    // BitGo requires coin type, we'll try common ones
    const coins = ['eth', 'matic', 'avax'];

    for (const coin of coins) {
      try {
        const transfer = await this.request<BitGoTransfer>(
          'GET',
          `/api/v2/${coin}/wallet/transfer/${txId}`
        );
        return this.mapTransfer(transfer, transfer.wallet);
      } catch {
        // Not found in this coin
      }
    }

    return null;
  }

  async listTransactions(vaultId: string, params?: {
    status?: TransactionStatus;
    limit?: number;
    offset?: number;
  }): Promise<CustodyTransaction[]> {
    const coin = 'eth'; // Default to ETH, could be parameterized

    const queryParams = new URLSearchParams();
    if (params?.limit) queryParams.set('limit', params.limit.toString());
    if (params?.offset) queryParams.set('skip', params.offset.toString());

    const response = await this.request<{ transfers: BitGoTransfer[] }>(
      'GET',
      `/api/v2/${coin}/wallet/${vaultId}/transfer?${queryParams.toString()}`
    );

    let transactions = response.transfers.map(t => this.mapTransfer(t, vaultId));

    if (params?.status) {
      transactions = transactions.filter(tx => tx.status === params.status);
    }

    return transactions;
  }

  async cancelTransaction(txId: string): Promise<boolean> {
    // BitGo uses pending approvals for cancellation
    try {
      const approvals = await this.request<{ pendingApprovals: BitGoPendingApproval[] }>(
        'GET',
        '/api/v2/pendingApprovals'
      );

      const approval = approvals.pendingApprovals.find(a =>
        a.info.transactionRequest && a.state === 'pending'
      );

      if (approval) {
        await this.request(
          'PUT',
          `/api/v2/pendingApprovals/${approval.id}`,
          { state: 'rejected' }
        );
        return true;
      }

      return false;
    } catch {
      return false;
    }
  }

  // ============================================================================
  // Signing
  // ============================================================================

  async signMessage(params: SignMessageParams): Promise<SignedMessage> {
    const coin = 'eth'; // Message signing primarily for ETH

    const response = await this.request<{
      signature: string;
      publicKey: string;
    }>(
      'POST',
      `/api/v2/${coin}/wallet/${params.vaultId}/signmessage`,
      {
        message: params.message,
        walletPassphrase: this.config.walletPassphrase,
      }
    );

    return {
      signature: response.signature,
      publicKey: response.publicKey,
      algorithm: params.algorithm || 'ECDSA_SECP256K1',
    };
  }

  async signTypedData(params: {
    vaultId: string;
    assetId: string;
    typedData: Record<string, unknown>;
  }): Promise<SignedMessage> {
    const coin = 'eth';

    const response = await this.request<{
      signature: string;
      publicKey: string;
    }>(
      'POST',
      `/api/v2/${coin}/wallet/${params.vaultId}/signtypeddata`,
      {
        typedData: params.typedData,
        walletPassphrase: this.config.walletPassphrase,
      }
    );

    return {
      signature: response.signature,
      publicKey: response.publicKey,
      algorithm: 'ECDSA_SECP256K1',
    };
  }

  // ============================================================================
  // Webhooks
  // ============================================================================

  validateWebhook(payload: string, signature: string): boolean {
    if (!this.config.webhookToken) {
      throw new Error('Webhook token not configured');
    }

    const expectedSignature = crypto
      .createHmac('sha256', this.config.webhookToken)
      .update(payload)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }

  parseWebhookEvent(payload: string): WebhookEvent {
    const data = JSON.parse(payload);

    return {
      id: data.hash || crypto.randomUUID(),
      type: data.type,
      timestamp: new Date(),
      data: {
        transactionId: data.transfer?.id,
        vaultId: data.wallet,
        status: BITGO_STATUS_MAP[data.state] || 'pending_signature',
        txHash: data.hash,
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
      await this.request('GET', '/api/v2/ping');
      return { healthy: true, latencyMs: Date.now() - start };
    } catch {
      return { healthy: false, latencyMs: Date.now() - start };
    }
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private mapWalletToVault(wallet: BitGoWallet): CustodyVault {
    const asset: VaultAsset = {
      id: wallet.id,
      vaultId: wallet.id,
      assetId: wallet.coin.toUpperCase(),
      address: wallet.receiveAddress.address,
      balance: wallet.spendableBalanceString,
      pendingBalance: (BigInt(wallet.balanceString) - BigInt(wallet.spendableBalanceString)).toString(),
      chainId: this.getChainIdFromCoin(wallet.coin),
    };

    return {
      id: wallet.id,
      name: wallet.label,
      assets: [asset],
      createdAt: new Date(wallet.createdDate),
      metadata: {
        coin: wallet.coin,
        enterprise: wallet.enterprise,
      },
    };
  }

  private mapTransfer(transfer: BitGoTransfer, vaultId: string): CustodyTransaction {
    const sourceEntry = transfer.entries.find(e => e.value < 0);
    const destEntry = transfer.entries.find(e => e.value > 0);

    return {
      id: transfer.id,
      externalId: transfer.txid || transfer.id,
      vaultId,
      assetId: transfer.coin.toUpperCase(),
      operation: 'transfer',
      status: BITGO_STATUS_MAP[transfer.state] || 'pending_signature',
      sourceAddress: sourceEntry?.address || '',
      destinationAddress: destEntry?.address || '',
      amount: transfer.valueString,
      fee: transfer.feeString,
      txHash: transfer.txid,
      blockNumber: transfer.height,
      signedBy: transfer.signedBy,
      note: transfer.comment,
      createdAt: new Date(transfer.date),
      completedAt: transfer.state === 'confirmed' ? new Date(transfer.date) : undefined,
    };
  }

  private getCoinFromChainId(chainId: number): string {
    const map: Record<number, string> = {
      1: 'eth',
      137: 'polygon',
      43114: 'avaxc',
      56: 'bsc',
      42161: 'arbeth',
      10: 'opeth',
    };
    return map[chainId] || 'eth';
  }

  private getChainIdFromCoin(coin: string): number {
    const map: Record<string, number> = {
      eth: 1,
      polygon: 137,
      matic: 137,
      avaxc: 43114,
      avax: 43114,
      bsc: 56,
      arbeth: 42161,
      opeth: 10,
    };
    return map[coin.toLowerCase()] || 1;
  }

  private getChainIdFromAsset(assetId: string): number {
    // Asset IDs like ETH, MATIC, etc.
    const map: Record<string, number> = {
      ETH: 1,
      MATIC: 137,
      AVAX: 43114,
      BNB: 56,
    };
    return map[assetId.toUpperCase()] || 1;
  }
}

export function createBitGoAdapter(config: BitGoConfig): BitGoAdapter {
  return new BitGoAdapter(config);
}
