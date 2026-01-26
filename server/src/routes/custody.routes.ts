import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ValidationError } from '../middleware/errorHandler.js';
import { apiKeyMiddleware, type ApiKeyRequest } from '../middleware/auth.js';
import {
  createCustodyAdapter,
  getCustodyConfigFromEnv,
  getDefaultCustodyProvider,
  CustodyProviderAdapter,
  CustodyProvider,
} from '../services/custody/index.js';

export const custodyRouter = Router();

// Cache adapters per provider
const adapterCache = new Map<CustodyProvider, CustodyProviderAdapter>();

function getAdapter(provider?: CustodyProvider): CustodyProviderAdapter {
  const selectedProvider = provider || getDefaultCustodyProvider();

  if (!adapterCache.has(selectedProvider)) {
    const config = getCustodyConfigFromEnv();
    adapterCache.set(selectedProvider, createCustodyAdapter(selectedProvider, config));
  }

  return adapterCache.get(selectedProvider)!;
}

// ============================================================================
// Schemas
// ============================================================================

const createVaultSchema = z.object({
  name: z.string().min(1).max(255),
  autoFuel: z.boolean().optional(),
  provider: z.enum(['fireblocks', 'bitgo', 'mock']).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const createWalletSchema = z.object({
  vaultId: z.string().min(1),
  name: z.string().min(1).max(255),
  chainId: z.number().int().positive(),
  assetType: z.enum(['ETH', 'MATIC', 'AVAX', 'BNB', 'ERC20', 'ERC721', 'ERC1155', 'NATIVE']),
  contractAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
  provider: z.enum(['fireblocks', 'bitgo', 'mock']).optional(),
});

const createTransactionSchema = z.object({
  vaultId: z.string().min(1),
  assetId: z.string().min(1),
  operation: z.enum(['transfer', 'mint', 'burn', 'contract_call']),
  sourceAddress: z.string().min(1),
  destinationAddress: z.string().min(1),
  amount: z.string().regex(/^\d+$/),
  note: z.string().max(500).optional(),
  externalTxId: z.string().optional(),
  gasPrice: z.string().optional(),
  gasLimit: z.string().optional(),
  contractCallData: z.string().optional(),
  provider: z.enum(['fireblocks', 'bitgo', 'mock']).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const signMessageSchema = z.object({
  vaultId: z.string().min(1),
  assetId: z.string().min(1),
  message: z.string().min(1),
  algorithm: z.enum(['ECDSA_SECP256K1', 'EDDSA_ED25519']).optional(),
  provider: z.enum(['fireblocks', 'bitgo', 'mock']).optional(),
});

const signTypedDataSchema = z.object({
  vaultId: z.string().min(1),
  assetId: z.string().min(1),
  typedData: z.record(z.unknown()),
  provider: z.enum(['fireblocks', 'bitgo', 'mock']).optional(),
});

// ============================================================================
// Vault Routes
// ============================================================================

custodyRouter.post('/vaults', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) throw new ValidationError('API key required');
    const input = createVaultSchema.parse(req.body);
    const adapter = getAdapter(input.provider as CustodyProvider);
    const vault = await adapter.createVault({
      name: input.name,
      autoFuel: input.autoFuel,
      metadata: { ...input.metadata, orgId: req.apiKey.orgId },
    });
    res.status(201).json(vault);
  } catch (error) {
    next(error);
  }
});

custodyRouter.get('/vaults', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) throw new ValidationError('API key required');
    const provider = req.query.provider as CustodyProvider | undefined;
    const adapter = getAdapter(provider);
    const vaults = await adapter.listVaults();
    res.json({ data: vaults, count: vaults.length });
  } catch (error) { next(error); }
});

custodyRouter.get('/vaults/:id', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) throw new ValidationError('API key required');
    const provider = req.query.provider as CustodyProvider | undefined;
    const adapter = getAdapter(provider);
    const vault = await adapter.getVault(req.params.id);
    if (!vault) {
      return res.status(404).json({ error: 'Vault not found' });
    }
    res.json(vault);
  } catch (error) { next(error); }
});

// ============================================================================
// Wallet Routes
// ============================================================================

custodyRouter.post('/wallets', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) throw new ValidationError('API key required');
    const input = createWalletSchema.parse(req.body);
    const adapter = getAdapter(input.provider as CustodyProvider);
    const wallet = await adapter.createWallet({
      vaultId: input.vaultId,
      name: input.name,
      chainId: input.chainId,
      assetType: input.assetType,
      contractAddress: input.contractAddress,
    });
    res.status(201).json(wallet);
  } catch (error) {
    next(error);
  }
});

custodyRouter.get('/vaults/:vaultId/wallets', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) throw new ValidationError('API key required');
    const provider = req.query.provider as CustodyProvider | undefined;
    const adapter = getAdapter(provider);
    const wallets = await adapter.listWallets(req.params.vaultId);
    res.json({ data: wallets, count: wallets.length });
  } catch (error) { next(error); }
});

custodyRouter.get('/vaults/:vaultId/wallets/:assetId', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) throw new ValidationError('API key required');
    const provider = req.query.provider as CustodyProvider | undefined;
    const adapter = getAdapter(provider);
    const wallet = await adapter.getWallet(req.params.vaultId, req.params.assetId);
    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }
    res.json(wallet);
  } catch (error) { next(error); }
});

custodyRouter.get('/vaults/:vaultId/wallets/:assetId/balance', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) throw new ValidationError('API key required');
    const provider = req.query.provider as CustodyProvider | undefined;
    const adapter = getAdapter(provider);
    const balance = await adapter.getBalance(req.params.vaultId, req.params.assetId);
    res.json({ balance });
  } catch (error) { next(error); }
});

// ============================================================================
// Transaction Routes
// ============================================================================

custodyRouter.post('/transactions', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) throw new ValidationError('API key required');
    const input = createTransactionSchema.parse(req.body);
    const adapter = getAdapter(input.provider as CustodyProvider);
    const tx = await adapter.createTransaction({
      vaultId: input.vaultId,
      assetId: input.assetId,
      operation: input.operation,
      sourceAddress: input.sourceAddress,
      destinationAddress: input.destinationAddress,
      amount: input.amount,
      note: input.note,
      externalTxId: input.externalTxId,
      gasPrice: input.gasPrice,
      gasLimit: input.gasLimit,
      contractCallData: input.contractCallData,
      metadata: { ...input.metadata, orgId: req.apiKey.orgId },
    });
    res.status(201).json(tx);
  } catch (error) {
    next(error);
  }
});

custodyRouter.get('/transactions/:id', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) throw new ValidationError('API key required');
    const provider = req.query.provider as CustodyProvider | undefined;
    const adapter = getAdapter(provider);
    const tx = await adapter.getTransaction(req.params.id);
    if (!tx) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    res.json(tx);
  } catch (error) { next(error); }
});

custodyRouter.get('/vaults/:vaultId/transactions', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) throw new ValidationError('API key required');
    const provider = req.query.provider as CustodyProvider | undefined;
    const { status, limit, offset } = req.query;
    const adapter = getAdapter(provider);
    const transactions = await adapter.listTransactions(req.params.vaultId, {
      status: status as any,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    });
    res.json({ data: transactions, count: transactions.length });
  } catch (error) { next(error); }
});

custodyRouter.post('/transactions/:id/cancel', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) throw new ValidationError('API key required');
    const provider = req.query.provider as CustodyProvider | undefined;
    const adapter = getAdapter(provider);
    const success = await adapter.cancelTransaction(req.params.id);
    if (!success) {
      return res.status(400).json({ error: 'Failed to cancel transaction' });
    }
    res.json({ success: true });
  } catch (error) { next(error); }
});

// ============================================================================
// Signing Routes
// ============================================================================

custodyRouter.post('/sign/message', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) throw new ValidationError('API key required');
    const input = signMessageSchema.parse(req.body);
    const adapter = getAdapter(input.provider as CustodyProvider);
    const signature = await adapter.signMessage({
      vaultId: input.vaultId,
      assetId: input.assetId,
      message: input.message,
      algorithm: input.algorithm,
    });
    res.json(signature);
  } catch (error) {
    next(error);
  }
});

custodyRouter.post('/sign/typed-data', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) throw new ValidationError('API key required');
    const input = signTypedDataSchema.parse(req.body);
    const adapter = getAdapter(input.provider as CustodyProvider);
    const signature = await adapter.signTypedData({
      vaultId: input.vaultId,
      assetId: input.assetId,
      typedData: input.typedData,
    });
    res.json(signature);
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Webhook Routes
// ============================================================================

custodyRouter.post('/webhooks/fireblocks', async (req, res, next) => {
  try {
    const signature = req.headers['x-fireblocks-signature'] as string;
    const adapter = getAdapter('fireblocks');

    const payload = JSON.stringify(req.body);
    if (!adapter.validateWebhook(payload, signature)) {
      return res.status(401).json({ error: 'Invalid webhook signature' });
    }

    const event = adapter.parseWebhookEvent(payload);
    console.log('Fireblocks webhook event:', event.type, event.data);

    // Process webhook event (update transaction status, emit internal events, etc.)

    res.status(200).json({ received: true });
  } catch (error) { next(error); }
});

custodyRouter.post('/webhooks/bitgo', async (req, res, next) => {
  try {
    const signature = req.headers['x-signature'] as string;
    const adapter = getAdapter('bitgo');

    const payload = JSON.stringify(req.body);
    if (!adapter.validateWebhook(payload, signature)) {
      return res.status(401).json({ error: 'Invalid webhook signature' });
    }

    const event = adapter.parseWebhookEvent(payload);
    console.log('BitGo webhook event:', event.type, event.data);

    // Process webhook event

    res.status(200).json({ received: true });
  } catch (error) { next(error); }
});

// ============================================================================
// Health Check
// ============================================================================

custodyRouter.get('/health', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) throw new ValidationError('API key required');
    const provider = req.query.provider as CustodyProvider | undefined;
    const adapter = getAdapter(provider);
    const health = await adapter.healthCheck();
    res.json({
      provider: adapter.providerName,
      ...health,
    });
  } catch (error) { next(error); }
});
