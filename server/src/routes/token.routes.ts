import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as tokenService from '../services/token.service.js';
import { ValidationError } from '../middleware/errorHandler.js';
import { apiKeyMiddleware, type ApiKeyRequest } from '../middleware/auth.js';

export const tokenRouter = Router();

// ============================================================================
// Validation Schemas
// ============================================================================

const createTokenSchema = z.object({
  projectId: z.string().uuid().optional(),
  assetId: z.string().uuid().optional(),
  name: z.string().min(1).max(100),
  symbol: z.string().min(1).max(10).regex(/^[A-Z0-9]+$/i, 'Symbol must be alphanumeric'),
  decimals: z.number().int().min(0).max(18).optional(),
  standard: z.enum(['ERC3643', 'ERC1400', 'ERC20']).optional(),
  totalSupply: z.string().regex(/^\d+$/, 'Must be a positive integer string'),
  maxSupply: z.string().regex(/^\d+$/, 'Must be a positive integer string').optional(),
  chainId: z.number().int().positive(),
  complianceModules: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const updateTokenSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  metadata: z.record(z.unknown()).optional(),
  complianceModules: z.array(z.string()).optional(),
});

const deployTokenSchema = z.object({
  deployerAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address'),
  gasLimit: z.string().optional(),
  gasPrice: z.string().optional(),
  maxFeePerGas: z.string().optional(),
  maxPriorityFeePerGas: z.string().optional(),
});

const confirmDeploymentSchema = z.object({
  contractAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid contract address'),
  txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/, 'Invalid transaction hash'),
  blockNumber: z.number().int().positive(),
});

const createTrancheSchema = z.object({
  name: z.string().min(1).max(100),
  supply: z.string().regex(/^\d+$/, 'Must be a positive integer string'),
  restrictions: z.record(z.unknown()).optional(),
  vestingSchedule: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const issueTokensSchema = z.object({
  trancheId: z.string().uuid().optional(),
  investorId: z.string().uuid(),
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address'),
  amount: z.string().regex(/^\d+$/, 'Must be a positive integer string'),
  reason: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const redeemTokensSchema = z.object({
  investorId: z.string().uuid(),
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address'),
  amount: z.string().regex(/^\d+$/, 'Must be a positive integer string'),
  reason: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const confirmIssuanceSchema = z.object({
  txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/, 'Invalid transaction hash'),
  blockNumber: z.number().int().positive(),
});

// ============================================================================
// Token CRUD Routes
// ============================================================================

// Create token
tokenRouter.post('/', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const input = createTokenSchema.parse(req.body);
    const token = await tokenService.createToken({
      ...input,
      orgId: req.apiKey.orgId,
    });

    res.status(201).json(token);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new ValidationError(error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')));
    } else {
      next(error);
    }
  }
});

// List tokens
tokenRouter.get('/', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const { projectId, status, chainId, limit, offset } = req.query;

    const tokens = await tokenService.listTokens(req.apiKey.orgId, {
      projectId: projectId as string | undefined,
      status: status as string | undefined,
      chainId: chainId ? parseInt(chainId as string) : undefined,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    });

    res.json({ data: tokens, count: tokens.length });
  } catch (error) {
    next(error);
  }
});

// Get token by ID
tokenRouter.get('/:id', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const token = await tokenService.getToken(req.params.id, req.apiKey.orgId);
    res.json(token);
  } catch (error) {
    next(error);
  }
});

// Update token
tokenRouter.patch('/:id', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const input = updateTokenSchema.parse(req.body);
    const token = await tokenService.updateToken(req.params.id, req.apiKey.orgId, input);

    res.json(token);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new ValidationError(error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')));
    } else {
      next(error);
    }
  }
});

// ============================================================================
// Token Deployment Routes
// ============================================================================

// Deploy token
tokenRouter.post('/:id/deploy', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const input = deployTokenSchema.parse(req.body);
    const result = await tokenService.deployToken(req.params.id, req.apiKey.orgId, input);

    res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new ValidationError(error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')));
    } else {
      next(error);
    }
  }
});

// Confirm deployment
tokenRouter.post('/:id/confirm-deployment', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const { contractAddress, txHash, blockNumber } = confirmDeploymentSchema.parse(req.body);
    const token = await tokenService.confirmDeployment(
      req.params.id,
      req.apiKey.orgId,
      contractAddress,
      txHash,
      blockNumber
    );

    res.json(token);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new ValidationError(error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')));
    } else {
      next(error);
    }
  }
});

// ============================================================================
// Token Status Routes
// ============================================================================

// Pause token
tokenRouter.post('/:id/pause', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const { reason } = req.body;
    const token = await tokenService.pauseToken(req.params.id, req.apiKey.orgId, reason);

    res.json(token);
  } catch (error) {
    next(error);
  }
});

// Unpause token
tokenRouter.post('/:id/unpause', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const token = await tokenService.unpauseToken(req.params.id, req.apiKey.orgId);
    res.json(token);
  } catch (error) {
    next(error);
  }
});

// Freeze token
tokenRouter.post('/:id/freeze', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const { reason } = req.body;
    if (!reason) {
      throw new ValidationError('Reason is required for freezing');
    }

    const token = await tokenService.freezeToken(req.params.id, req.apiKey.orgId, reason);
    res.json(token);
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Tranche Routes
// ============================================================================

// Create tranche
tokenRouter.post('/:tokenId/tranches', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const input = createTrancheSchema.parse(req.body);
    const tranche = await tokenService.createTranche({
      ...input,
      orgId: req.apiKey.orgId,
      tokenId: req.params.tokenId,
    });

    res.status(201).json(tranche);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new ValidationError(error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')));
    } else {
      next(error);
    }
  }
});

// List tranches
tokenRouter.get('/:tokenId/tranches', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const tranches = await tokenService.listTranches(req.params.tokenId, req.apiKey.orgId);
    res.json({ data: tranches, count: tranches.length });
  } catch (error) {
    next(error);
  }
});

// Get tranche
tokenRouter.get('/:tokenId/tranches/:trancheId', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const tranche = await tokenService.getTranche(req.params.trancheId, req.apiKey.orgId);
    res.json(tranche);
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Issuance Routes
// ============================================================================

// Issue tokens
tokenRouter.post('/:tokenId/issue', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const input = issueTokensSchema.parse(req.body);
    const issuance = await tokenService.issueTokens({
      ...input,
      orgId: req.apiKey.orgId,
      tokenId: req.params.tokenId,
    });

    res.status(201).json(issuance);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new ValidationError(error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')));
    } else {
      next(error);
    }
  }
});

// Confirm issuance
tokenRouter.post('/:tokenId/issuances/:issuanceId/confirm', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const { txHash, blockNumber } = confirmIssuanceSchema.parse(req.body);
    const issuance = await tokenService.confirmIssuance(
      req.params.issuanceId,
      req.apiKey.orgId,
      txHash,
      blockNumber
    );

    res.json(issuance);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new ValidationError(error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')));
    } else {
      next(error);
    }
  }
});

// ============================================================================
// Redemption Routes
// ============================================================================

// Redeem tokens
tokenRouter.post('/:tokenId/redeem', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const input = redeemTokensSchema.parse(req.body);
    const redemption = await tokenService.redeemTokens({
      ...input,
      orgId: req.apiKey.orgId,
      tokenId: req.params.tokenId,
    });

    res.status(201).json(redemption);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new ValidationError(error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')));
    } else {
      next(error);
    }
  }
});

// Confirm redemption
tokenRouter.post('/:tokenId/redemptions/:redemptionId/confirm', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const { txHash, blockNumber } = confirmIssuanceSchema.parse(req.body);
    const redemption = await tokenService.confirmRedemption(
      req.params.redemptionId,
      req.apiKey.orgId,
      txHash,
      blockNumber
    );

    res.json(redemption);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new ValidationError(error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')));
    } else {
      next(error);
    }
  }
});

// ============================================================================
// Cap Table & Ledger Routes
// ============================================================================

// Get cap table
tokenRouter.get('/:tokenId/cap-table', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const capTable = await tokenService.getCapTable(req.params.tokenId, req.apiKey.orgId);
    res.json(capTable);
  } catch (error) {
    next(error);
  }
});

// Get ledger positions
tokenRouter.get('/:tokenId/positions', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const { investorId, minBalance, limit, offset } = req.query;

    const positions = await tokenService.listLedgerPositions(req.apiKey.orgId, {
      tokenId: req.params.tokenId,
      investorId: investorId as string | undefined,
      minBalance: minBalance as string | undefined,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    });

    res.json({ data: positions, count: positions.length });
  } catch (error) {
    next(error);
  }
});

// Get specific position
tokenRouter.get('/:tokenId/positions/:investorId/:walletAddress', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const position = await tokenService.getLedgerPosition(
      req.params.tokenId,
      req.params.investorId,
      req.params.walletAddress
    );

    if (!position) {
      res.json({ balance: '0' });
    } else {
      res.json(position);
    }
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Balance & Burn Routes
// ============================================================================

// Get wallet balance for a token
tokenRouter.get('/:tokenId/balance', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const { wallet } = req.query;
    if (!wallet || typeof wallet !== 'string') {
      throw new ValidationError('Wallet address is required');
    }

    // Get balance from cap table or ledger
    const capTable = await tokenService.getCapTable(req.params.tokenId, req.apiKey.orgId);
    const positions = capTable.positions || [];
    const entry = positions.find((e: any) =>
      e.walletAddress?.toLowerCase() === wallet.toLowerCase()
    );

    res.json({
      tokenId: req.params.tokenId,
      wallet,
      balance: entry?.balance || '0',
      percentage: entry?.percentage || '0',
    });
  } catch (error) {
    next(error);
  }
});

// Burn tokens (for redemption/exit)
tokenRouter.post('/:tokenId/burn', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const { fromWallet, amount, reason, metadata } = req.body;

    if (!fromWallet || !amount) {
      throw new ValidationError('fromWallet and amount are required');
    }

    // Use the redeem function internally for burning
    const burn = await tokenService.redeemTokens({
      orgId: req.apiKey.orgId,
      tokenId: req.params.tokenId,
      investorId: metadata?.investorId || 'unknown',
      walletAddress: fromWallet,
      amount,
      reason: reason || 'Token burn',
      metadata: {
        ...metadata,
        burnType: 'direct_burn',
      },
    });

    res.status(201).json({
      id: burn.id,
      tokenId: req.params.tokenId,
      fromWallet,
      amount,
      status: burn.status,
      reason,
      burnedAt: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Policy Attachment Routes
// ============================================================================

// Attach policy to token
tokenRouter.post('/:tokenId/policies', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const { policyId, priority } = req.body;

    if (!policyId) {
      throw new ValidationError('policyId is required');
    }

    // In a full implementation, this would update the token's compliance policies
    // For now, we acknowledge the attachment
    const attachment = {
      tokenId: req.params.tokenId,
      policyId,
      priority: priority || 0,
      attachedAt: new Date().toISOString(),
      attachedBy: req.apiKey.keyId || 'system',
    };

    res.status(201).json(attachment);
  } catch (error) {
    next(error);
  }
});
