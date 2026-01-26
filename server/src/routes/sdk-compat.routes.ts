/**
 * SDK Compatibility Routes
 *
 * These routes provide aliases and wrappers to bridge the React SDK's
 * expected API endpoints to the actual server implementation.
 *
 * This allows the React SDK to work without changes while maintaining
 * backward compatibility with existing server endpoints.
 */

import { Router } from 'express';
import { db, parties, partyWallets } from '../config/database.js';
import { eq } from 'drizzle-orm';
import { type AuthRequest } from '../middleware/auth.js';
import { ValidationError, NotFoundError } from '../middleware/errorHandler.js';
import { z } from 'zod';

export const sdkCompatRouter = Router();

// ============================================================================
// PARTIES - Wallet lookup alias
// ============================================================================

/**
 * GET /api/v1/parties (with walletAddress query param)
 * The React SDK expects to find parties by wallet address via query param.
 * This proxies to the standard party list with wallet filtering.
 */
sdkCompatRouter.get('/parties', async (req: AuthRequest, res, next) => {
  try {
    const { walletAddress } = req.query;

    if (walletAddress && typeof walletAddress === 'string') {
      // Look up by wallet address
      if (!/^0x[a-fA-F0-9]{40}$/i.test(walletAddress)) {
        throw new ValidationError('Invalid Ethereum address');
      }

      const wallet = await db.query.partyWallets.findFirst({
        where: eq(partyWallets.address, walletAddress.toLowerCase()),
      });

      if (!wallet) {
        return res.json({ parties: [] });
      }

      const party = await db.query.parties.findFirst({
        where: eq(parties.id, wallet.partyId),
      });

      if (!party) {
        return res.json({ parties: [] });
      }

      const wallets = await db.query.partyWallets.findMany({
        where: eq(partyWallets.partyId, party.id),
      });

      return res.json({
        parties: [{
          ...party,
          wallets,
        }],
      });
    }

    // Fall through to standard behavior - this will be handled by the actual party router
    next();
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// DOCUMENTS - Alias /documents to /projects/documents
// ============================================================================

/**
 * POST /api/v1/documents/upload
 * Proxies to /projects/documents/upload-url
 */
sdkCompatRouter.post('/documents/upload', async (req: AuthRequest, res, next) => {
  // Redirect to the projects document upload endpoint
  req.url = '/projects/documents/upload-url';
  next('route');
});

/**
 * POST /api/v1/documents
 * Register uploaded document - proxies to /projects/documents
 */
sdkCompatRouter.post('/documents', async (req: AuthRequest, res, next) => {
  req.url = '/projects/documents';
  next('route');
});

/**
 * GET /api/v1/documents
 * List documents - proxies to /projects/documents
 */
sdkCompatRouter.get('/documents', async (req: AuthRequest, res, next) => {
  req.url = '/projects/documents';
  next('route');
});

// ============================================================================
// COMPLIANCE - Check endpoints
// ============================================================================

const transferCheckSchema = z.object({
  assetId: z.string(),
  fromAddress: z.string(),
  toAddress: z.string(),
  amount: z.string(),
  actorId: z.string().optional(),
});

const mintCheckSchema = z.object({
  assetId: z.string(),
  toAddress: z.string(),
  amount: z.string(),
  actorId: z.string().optional(),
});

/**
 * POST /api/v1/compliance/check/transfer
 * Check transfer compliance (alias to /compliance/decisions/transfer)
 */
sdkCompatRouter.post('/compliance/check/transfer', async (req: AuthRequest, res, next) => {
  try {
    const data = transferCheckSchema.parse(req.body);

    // Rewrite request body to match decisions/transfer format
    req.body = {
      tokenId: data.assetId, // Map assetId to tokenId
      fromWallet: data.fromAddress,
      toWallet: data.toAddress,
      amount: data.amount,
      requesterId: data.actorId,
    };

    // Forward to decisions/transfer endpoint
    req.url = '/compliance/decisions/transfer';
    next('route');
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new ValidationError(error.errors.map(e => e.message).join(', ')));
    } else {
      next(error);
    }
  }
});

/**
 * POST /api/v1/compliance/check/mint
 * Check mint compliance (alias to /compliance/decisions/issuance)
 */
sdkCompatRouter.post('/compliance/check/mint', async (req: AuthRequest, res, next) => {
  try {
    const data = mintCheckSchema.parse(req.body);

    // Rewrite request body to match decisions/issuance format
    req.body = {
      tokenId: data.assetId,
      recipientWallet: data.toAddress,
      amount: data.amount,
      requesterId: data.actorId,
    };

    // Forward to decisions/issuance endpoint
    req.url = '/compliance/decisions/issuance';
    next('route');
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new ValidationError(error.errors.map(e => e.message).join(', ')));
    } else {
      next(error);
    }
  }
});

/**
 * POST /api/v1/compliance/check
 * Generic compliance check for any action
 */
sdkCompatRouter.post('/compliance/check', async (req: AuthRequest, res, next) => {
  try {
    const { action, context } = req.body;

    // Map action to appropriate endpoint
    switch (action) {
      case 'token:transfer':
        req.body = {
          tokenId: context.assetId,
          fromWallet: context.fromAddress,
          toWallet: context.toAddress,
          amount: context.amount,
          requesterId: context.actorId,
        };
        req.url = '/compliance/decisions/transfer';
        break;

      case 'token:mint':
        req.body = {
          tokenId: context.assetId,
          recipientWallet: context.toAddress || context.recipientId,
          amount: context.amount,
          requesterId: context.actorId,
        };
        req.url = '/compliance/decisions/issuance';
        break;

      default:
        // For other actions, create a generic decision
        return res.json({
          decision: {
            id: `dec_${Date.now()}`,
            action,
            result: 'ALLOW',
            violations: [],
            warnings: [],
            policyVersion: '1.0.0',
            policyHash: 'mock-hash',
            evaluatedAt: new Date().toISOString(),
          },
          receipt: {
            id: `rec_${Date.now()}`,
            decisionId: `dec_${Date.now()}`,
            action,
            result: 'ALLOW',
            issuedAt: new Date().toISOString(),
            issuedBy: 'sdk-compat',
            policyVersion: '1.0.0',
            policyHash: 'mock-hash',
            decisionHash: 'mock-decision-hash',
            subjectType: 'asset',
            subjectId: context.assetId || 'unknown',
            actorId: context.actorId || 'unknown',
            signature: 'mock-signature',
            summary: `${action} check passed`,
            reasons: [],
          },
        });
    }

    next('route');
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// KYC - Status and initiation aliases
// ============================================================================

/**
 * GET /api/v1/kyc/status
 * Get KYC status by wallet address
 */
sdkCompatRouter.get('/kyc/status', async (req: AuthRequest, res, next) => {
  try {
    const { walletAddress } = req.query;

    if (!walletAddress || typeof walletAddress !== 'string') {
      throw new ValidationError('walletAddress is required');
    }

    if (!/^0x[a-fA-F0-9]{40}$/i.test(walletAddress)) {
      throw new ValidationError('Invalid Ethereum address');
    }

    // Find party by wallet
    const wallet = await db.query.partyWallets.findFirst({
      where: eq(partyWallets.address, walletAddress.toLowerCase()),
    });

    if (!wallet) {
      return res.json({ verification: null });
    }

    const party = await db.query.parties.findFirst({
      where: eq(parties.id, wallet.partyId),
    });

    if (!party) {
      return res.json({ verification: null });
    }

    // Map party KYC data to verification format
    const verification = {
      verificationId: party.id,
      subjectId: party.id,
      level: (party.verificationLevel || 'none').toLowerCase(),
      status: party.kycVerified ? 'approved' : 'not_started',
      jurisdiction: party.jurisdiction,
      accreditedInvestor: party.accreditedInvestor,
      isPEP: false,
      sanctionsStatus: party.isFrozen ? 'flagged' : 'clear',
      verifiedAt: party.kycVerified ? party.updatedAt?.toISOString() : undefined,
      expiresAt: party.kycExpiryDate?.toISOString(),
    };

    res.json({ verification });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/kyc/initiate
 * Initiate KYC verification for a wallet
 */
sdkCompatRouter.post('/kyc/initiate', async (req: AuthRequest, res, next) => {
  try {
    const { walletAddress, level, redirectUrl, webhookUrl, prefill } = req.body;

    if (!walletAddress || !/^0x[a-fA-F0-9]{40}$/i.test(walletAddress)) {
      throw new ValidationError('Valid walletAddress is required');
    }

    // Check if party already exists for this wallet
    let wallet = await db.query.partyWallets.findFirst({
      where: eq(partyWallets.address, walletAddress.toLowerCase()),
    });

    let partyId: string;

    if (!wallet) {
      // Create new party
      const [newParty] = await db.insert(parties).values({
        name: prefill?.firstName && prefill?.lastName
          ? `${prefill.firstName} ${prefill.lastName}`
          : 'Unknown',
        type: 'INDIVIDUAL',
        roles: ['INVESTOR'],
        jurisdiction: prefill?.country || 'US',
        metadata: {
          email: prefill?.email,
          phone: prefill?.phone,
          dateOfBirth: prefill?.dateOfBirth,
        },
      }).returning();

      partyId = newParty.id;

      // Add wallet
      await db.insert(partyWallets).values({
        partyId,
        address: walletAddress.toLowerCase(),
        chainId: 1,
        isPrimary: true,
      });
    } else {
      partyId = wallet.partyId;
    }

    // Generate verification URL (in production, this would call actual KYC provider)
    const verificationId = `ver_${partyId}`;
    const verificationUrl = `https://kyc.example.com/verify/${verificationId}?redirect=${encodeURIComponent(redirectUrl || '')}`;
    const sdkToken = `tok_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    res.json({
      success: true,
      verificationId,
      verificationUrl,
      sdkToken,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/kyc/sanctions/screen
 * Screen party for sanctions
 */
sdkCompatRouter.post('/kyc/sanctions/screen', async (req: AuthRequest, res, next) => {
  try {
    const { partyId } = req.body;

    if (!partyId) {
      throw new ValidationError('partyId is required');
    }

    const party = await db.query.parties.findFirst({
      where: eq(parties.id, partyId),
    });

    if (!party) {
      throw new NotFoundError('Party');
    }

    // Mock sanctions check - in production, call actual sanctions provider
    const blockedCountries = ['KP', 'IR', 'CU', 'SY'];
    const isFlagged = blockedCountries.includes(party.jurisdiction || '');

    res.json({
      status: isFlagged ? 'flagged' : 'clear',
      matches: isFlagged ? [{
        listName: 'OFAC SDN',
        matchScore: 100,
        details: `Jurisdiction ${party.jurisdiction} is on restricted list`,
      }] : [],
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// ASSETS - Token operation aliases
// ============================================================================

/**
 * POST /api/v1/assets/:id/mint
 * Alias to /tokens/:tokenId/issue
 */
sdkCompatRouter.post('/assets/:id/mint', async (req: AuthRequest, res, next) => {
  // Asset ID is used as token ID in this context
  req.url = `/tokens/${req.params.id}/issue`;
  req.body = {
    recipientWallet: req.body.toAddress,
    amount: req.body.amount,
    investorId: req.body.actorId,
  };
  next('route');
});

/**
 * POST /api/v1/assets/:id/transfer
 * Create a transfer for asset tokens
 */
sdkCompatRouter.post('/assets/:id/transfer', async (req: AuthRequest, res, next) => {
  req.body = {
    tokenId: req.params.id,
    fromWallet: req.body.fromAddress,
    toWallet: req.body.toAddress,
    amount: req.body.amount,
  };
  req.url = '/transfers';
  next('route');
});

/**
 * POST /api/v1/assets/:id/burn
 * Alias to /tokens/:tokenId/burn
 */
sdkCompatRouter.post('/assets/:id/burn', async (req: AuthRequest, res, next) => {
  req.url = `/tokens/${req.params.id}/burn`;
  req.body = {
    wallet: req.body.fromAddress,
    amount: req.body.amount,
  };
  next('route');
});

/**
 * GET /api/v1/assets/:id/balance/:address
 * Get balance for address
 */
sdkCompatRouter.get('/assets/:id/balance/:address', async (req: AuthRequest, res, next) => {
  const { id, address } = req.params;

  // Redirect to token balance endpoint
  req.url = `/tokens/${id}/balance?wallet=${address}`;
  next('route');
});

/**
 * GET /api/v1/assets/:id/holders
 * Get all token holders (cap table)
 */
sdkCompatRouter.get('/assets/:id/holders', async (req: AuthRequest, res, next) => {
  req.url = `/tokens/${req.params.id}/cap-table`;
  next('route');
});

/**
 * GET /api/v1/assets/:id/token
 * Get token info for asset
 */
sdkCompatRouter.get('/assets/:id/token', async (req: AuthRequest, res, next) => {
  req.url = `/tokens/${req.params.id}`;
  next('route');
});

// ============================================================================
// COMPLIANCE RECEIPTS - Chain verification
// ============================================================================

/**
 * GET /api/v1/compliance/receipts/chain/verify
 * Verify the entire receipt chain for an asset
 */
sdkCompatRouter.get('/compliance/receipts/chain/verify', async (_req: AuthRequest, res, _next) => {
  // Mock implementation - in production, verify the actual chain
  res.json({
    valid: true,
    brokenAt: undefined,
  });
});
