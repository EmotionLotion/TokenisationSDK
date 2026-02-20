/**
 * Custody Service
 *
 * Provides unified access to institutional custody providers.
 * Currently supports Fireblocks and BitGo.
 */

export * from './custody.adapter.js';
export { FireblocksAdapter, createFireblocksAdapter } from './fireblocks.adapter.js';
export { BitGoAdapter, createBitGoAdapter } from './bitgo.adapter.js';

import {
  CustodyProviderAdapter,
  CustodyProviderConfig,
  CustodyProvider,
} from './custody.adapter.js';
import { createFireblocksAdapter } from './fireblocks.adapter.js';
import { createBitGoAdapter } from './bitgo.adapter.js';

/**
 * Creates a custody provider adapter based on configuration.
 */
export function createCustodyAdapter(
  provider: CustodyProvider,
  config: CustodyProviderConfig
): CustodyProviderAdapter {
  switch (provider) {
    case 'fireblocks':
      if (!config.fireblocks) {
        throw new Error('Fireblocks configuration required');
      }
      return createFireblocksAdapter(config.fireblocks);

    case 'bitgo':
      if (!config.bitgo) {
        throw new Error('BitGo configuration required');
      }
      return createBitGoAdapter(config.bitgo);

    case 'mock':
      return createMockAdapter();

    default:
      throw new Error(`Unknown custody provider: ${provider}`);
  }
}

/**
 * Mock adapter for testing.
 */
function createMockAdapter(): CustodyProviderAdapter {
  const vaults = new Map<string, any>();
  const transactions = new Map<string, any>();
  let vaultCounter = 0;
  let txCounter = 0;

  return {
    providerName: 'mock',

    async createVault(params) {
      const id = `vault_${++vaultCounter}`;
      const vault = {
        id,
        name: params.name,
        assets: [],
        createdAt: new Date(),
        metadata: params.metadata,
      };
      vaults.set(id, vault);
      return vault;
    },

    async getVault(vaultId) {
      return vaults.get(vaultId) || null;
    },

    async listVaults() {
      return Array.from(vaults.values());
    },

    async createWallet(params) {
      const vault = vaults.get(params.vaultId);
      const wallet = {
        id: `wallet_${Date.now()}`,
        vaultId: params.vaultId,
        name: params.name,
        address: `0x${Math.random().toString(16).slice(2, 42)}`,
        chainId: params.chainId,
        assetType: params.assetType,
        contractAddress: params.contractAddress,
        createdAt: new Date(),
      };
      if (vault) {
        vault.assets.push({
          id: wallet.id,
          vaultId: params.vaultId,
          assetId: params.assetType,
          address: wallet.address,
          balance: '0',
          chainId: params.chainId,
        });
      }
      return wallet;
    },

    async getWallet(vaultId, assetId) {
      const vault = vaults.get(vaultId);
      if (!vault) return null;
      const asset = vault.assets.find((a: any) => a.assetId === assetId);
      if (!asset) return null;
      return {
        id: asset.id,
        vaultId,
        name: assetId,
        address: asset.address,
        chainId: asset.chainId,
        assetType: assetId as any,
        createdAt: new Date(),
      };
    },

    async listWallets(vaultId) {
      const vault = vaults.get(vaultId);
      if (!vault) return [];
      return vault.assets.map((a: any) => ({
        id: a.id,
        vaultId,
        name: a.assetId,
        address: a.address,
        chainId: a.chainId,
        assetType: a.assetId,
        createdAt: new Date(),
      }));
    },

    async getBalance(_vaultId, _assetId) {
      return '1000000000000000000'; // 1 ETH
    },

    async createTransaction(params) {
      const id = `tx_${++txCounter}`;
      const tx = {
        id,
        externalId: params.externalTxId || id,
        vaultId: params.vaultId,
        assetId: params.assetId,
        operation: params.operation,
        status: 'pending_signature' as const,
        sourceAddress: params.sourceAddress,
        destinationAddress: params.destinationAddress,
        amount: params.amount,
        note: params.note,
        createdAt: new Date(),
        metadata: params.metadata,
      };
      transactions.set(id, tx);
      return tx;
    },

    async getTransaction(txId) {
      return transactions.get(txId) || null;
    },

    async listTransactions(vaultId, params) {
      const results = Array.from(transactions.values())
        .filter(tx => tx.vaultId === vaultId)
        .filter(tx => !params?.status || tx.status === params.status);

      const offset = params?.offset || 0;
      const limit = params?.limit || 100;
      return results.slice(offset, offset + limit);
    },

    async cancelTransaction(txId) {
      const tx = transactions.get(txId);
      if (tx && tx.status === 'pending_signature') {
        tx.status = 'cancelled';
        return true;
      }
      return false;
    },

    async signMessage(params) {
      return {
        signature: `0x${'ab'.repeat(65)}`,
        publicKey: `0x${'cd'.repeat(33)}`,
        algorithm: params.algorithm || 'ECDSA_SECP256K1',
      };
    },

    async signTypedData(_params) {
      return {
        signature: `0x${'ef'.repeat(65)}`,
        publicKey: `0x${'01'.repeat(33)}`,
        algorithm: 'ECDSA_SECP256K1',
      };
    },

    validateWebhook(_payload, _signature) {
      return true;
    },

    parseWebhookEvent(payload) {
      const data = JSON.parse(payload);
      return {
        id: data.id || 'mock_event',
        type: data.type || 'transaction.updated',
        timestamp: new Date(),
        data: data,
        rawPayload: data,
      };
    },

    async healthCheck() {
      return { healthy: true, latencyMs: 1 };
    },
  };
}

/**
 * Default custody configuration from environment variables.
 */
export function getCustodyConfigFromEnv(): CustodyProviderConfig {
  return {
    fireblocks: process.env.FIREBLOCKS_API_KEY ? {
      apiKey: process.env.FIREBLOCKS_API_KEY,
      apiSecretPath: process.env.FIREBLOCKS_API_SECRET_PATH || './fireblocks-secret.key',
      baseUrl: process.env.FIREBLOCKS_BASE_URL,
      webhookPublicKey: process.env.FIREBLOCKS_WEBHOOK_PUBLIC_KEY,
    } : undefined,

    bitgo: process.env.BITGO_ACCESS_TOKEN ? {
      accessToken: process.env.BITGO_ACCESS_TOKEN,
      baseUrl: process.env.BITGO_BASE_URL,
      walletPassphrase: process.env.BITGO_WALLET_PASSPHRASE,
      webhookToken: process.env.BITGO_WEBHOOK_TOKEN,
    } : undefined,
  };
}

/**
 * Get the default custody provider based on configuration.
 */
export function getDefaultCustodyProvider(): CustodyProvider {
  const isProduction = process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging';

  if (process.env.FIREBLOCKS_API_KEY) return 'fireblocks';
  if (process.env.BITGO_ACCESS_TOKEN) return 'bitgo';

  if (isProduction) {
    throw new Error(
      'FATAL: No custody provider configured in production/staging. ' +
      'Set FIREBLOCKS_API_KEY or BITGO_ACCESS_TOKEN with valid credentials.'
    );
  }

  console.warn(
    '\x1b[33m⚠ WARNING: No custody provider configured — using mock custody. ' +
    'No real asset custody. Set FIREBLOCKS_API_KEY or BITGO_ACCESS_TOKEN in .env.\x1b[0m'
  );
  return 'mock';
}
