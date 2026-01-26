import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as relayerService from '../services/relayer.service.js';
import { ValidationError } from '../middleware/errorHandler.js';
import { apiKeyMiddleware, type ApiKeyRequest } from '../middleware/auth.js';

export const relayerRouter = Router();

// ============================================================================
// Validation Schemas
// ============================================================================

const buildTransactionSchema = z.object({
  to: z.string().regex(/^0x[a-fA-F0-9]{40}$/).nullable(),
  from: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  data: z.string().regex(/^0x[a-fA-F0-9]*$/),
  value: z.string().optional(),
  chainId: z.number().int().positive(),
  gasLimit: z.string().optional(),
  useEip1559: z.boolean().optional(),
});

const signTransactionSchema = z.object({
  to: z.string().regex(/^0x[a-fA-F0-9]{40}$/).nullable(),
  from: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  data: z.string().regex(/^0x[a-fA-F0-9]*$/),
  value: z.string(),
  gasLimit: z.string().optional(),
  gasPrice: z.string().optional(),
  maxFeePerGas: z.string().optional(),
  maxPriorityFeePerGas: z.string().optional(),
  nonce: z.number().int().optional(),
  chainId: z.number().int().positive(),
});

const submitTransactionSchema = z.object({
  chainId: z.number().int().positive(),
  signedTx: z.string().regex(/^0x[a-fA-F0-9]+$/),
});

const erc20TransferSchema = z.object({
  tokenAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  from: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  to: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  amount: z.string().regex(/^\d+$/),
  chainId: z.number().int().positive(),
});

// ============================================================================
// Chain Info Routes
// ============================================================================

// List supported chains
relayerRouter.get('/chains', async (_req, res, next) => {
  try {
    const chains = relayerService.listSupportedChains();
    res.json({ data: chains });
  } catch (error) {
    next(error);
  }
});

// Get specific chain config
relayerRouter.get('/chains/:chainId', async (req, res, next) => {
  try {
    const chainId = parseInt(req.params.chainId);
    const chain = relayerService.getChainConfig(chainId);
    res.json(chain);
  } catch (error) {
    next(error);
  }
});

// Check chain health
relayerRouter.get('/chains/:chainId/health', async (req, res, next) => {
  try {
    const chainId = parseInt(req.params.chainId);
    const health = await relayerService.checkChainHealth(chainId);
    res.json(health);
  } catch (error) {
    next(error);
  }
});

// Check all chains health
relayerRouter.get('/health', async (_req, res, next) => {
  try {
    const health = await relayerService.checkAllChainsHealth();
    res.json({ data: health });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Gas Estimation Routes
// ============================================================================

// Estimate gas for transaction
relayerRouter.post('/gas/estimate', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const tx = buildTransactionSchema.parse(req.body);
    const estimate = await relayerService.estimateGas({
      ...tx,
      value: tx.value || '0',
    });

    res.json(estimate);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new ValidationError(error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')));
    } else {
      next(error);
    }
  }
});

// ============================================================================
// Transaction Building Routes
// ============================================================================

// Build transaction
relayerRouter.post('/tx/build', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const params = buildTransactionSchema.parse(req.body);
    const tx = await relayerService.buildTransaction(params);

    res.json(tx);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new ValidationError(error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')));
    } else {
      next(error);
    }
  }
});

// Sign transaction (custodial mode)
relayerRouter.post('/tx/sign', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const tx = signTransactionSchema.parse(req.body);
    const result = await relayerService.signTransaction(tx, req.apiKey.orgId);

    res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new ValidationError(error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')));
    } else {
      next(error);
    }
  }
});

// Submit signed transaction
relayerRouter.post('/tx/submit', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const { chainId, signedTx } = submitTransactionSchema.parse(req.body);
    const result = await relayerService.submitTransaction(chainId, signedTx, req.apiKey.orgId);

    res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new ValidationError(error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')));
    } else {
      next(error);
    }
  }
});

// Get transaction receipt
relayerRouter.get('/tx/:chainId/:txHash', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const chainId = parseInt(req.params.chainId);
    const receipt = await relayerService.getTransactionReceipt(chainId, req.params.txHash);

    if (!receipt) {
      res.json({ status: 'pending', txHash: req.params.txHash });
    } else {
      res.json(receipt);
    }
  } catch (error) {
    next(error);
  }
});

// Wait for transaction confirmation
relayerRouter.post('/tx/wait', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const { chainId, txHash, confirmations, timeout } = req.body;

    if (!chainId || !txHash) {
      throw new ValidationError('chainId and txHash are required');
    }

    const receipt = await relayerService.waitForTransaction(
      chainId,
      txHash,
      confirmations || 1,
      timeout || 120000
    );

    res.json(receipt);
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Nonce Management Routes
// ============================================================================

// Get next nonce
relayerRouter.get('/nonce/:chainId/:address', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const chainId = parseInt(req.params.chainId);
    const nonce = await relayerService.getNextNonce(chainId, req.params.address);

    res.json({ nonce });
  } catch (error) {
    next(error);
  }
});

// Reset nonce cache
relayerRouter.post('/nonce/:chainId/:address/reset', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const chainId = parseInt(req.params.chainId);
    relayerService.resetNonceCache(chainId, req.params.address);

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// State Query Routes
// ============================================================================

// Get ETH balance
relayerRouter.get('/balance/:chainId/:address', async (req, res, next) => {
  try {
    const chainId = parseInt(req.params.chainId);
    const balance = await relayerService.getBalance(chainId, req.params.address);

    res.json({ balance });
  } catch (error) {
    next(error);
  }
});

// Get contract code
relayerRouter.get('/code/:chainId/:address', async (req, res, next) => {
  try {
    const chainId = parseInt(req.params.chainId);
    const code = await relayerService.getCode(chainId, req.params.address);

    res.json({ code, isContract: code !== '0x' });
  } catch (error) {
    next(error);
  }
});

// Make eth_call
relayerRouter.post('/call', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const { chainId, to, data } = req.body;

    if (!chainId || !to || !data) {
      throw new ValidationError('chainId, to, and data are required');
    }

    const result = await relayerService.call(chainId, to, data);

    res.json({ result });
  } catch (error) {
    next(error);
  }
});

// Get current block number
relayerRouter.get('/block/:chainId', async (req, res, next) => {
  try {
    const chainId = parseInt(req.params.chainId);
    const blockNumber = await relayerService.getBlockNumber(chainId);

    res.json({ blockNumber });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// ERC20 Helper Routes
// ============================================================================

// Get ERC20 balance
relayerRouter.get('/erc20/balance/:chainId/:tokenAddress/:walletAddress', async (req, res, next) => {
  try {
    const chainId = parseInt(req.params.chainId);
    const balance = await relayerService.getERC20Balance(
      chainId,
      req.params.tokenAddress,
      req.params.walletAddress
    );

    res.json({ balance });
  } catch (error) {
    next(error);
  }
});

// Build ERC20 transfer transaction
relayerRouter.post('/erc20/transfer/build', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const { tokenAddress, from, to, amount, chainId } = erc20TransferSchema.parse(req.body);

    const data = relayerService.encodeERC20Transfer(to, amount);
    const tx = await relayerService.buildTransaction({
      to: tokenAddress,
      from,
      data,
      value: '0',
      chainId,
    });

    res.json(tx);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new ValidationError(error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')));
    } else {
      next(error);
    }
  }
});
