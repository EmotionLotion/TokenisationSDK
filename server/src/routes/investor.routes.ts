import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as investorService from '../services/investor.service.js';
import { ValidationError } from '../middleware/errorHandler.js';
import { apiKeyMiddleware, type ApiKeyRequest } from '../middleware/auth.js';

export const investorRouter = Router();

/**
 * @openapi
 * /investors:
 *   post:
 *     tags: [Investors]
 *     summary: Create a new investor
 *     description: Register a new investor in the system. The investor will be created with status 'pending' and kycStatus 'none'.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateInvestorInput'
 *     responses:
 *       201:
 *         description: Investor created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Investor'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *   get:
 *     tags: [Investors]
 *     summary: List investors
 *     description: Retrieve a paginated list of investors for the organization
 *     parameters:
 *       - name: type
 *         in: query
 *         schema:
 *           type: string
 *           enum: [individual, institutional, qualified, accredited]
 *       - name: status
 *         in: query
 *         schema:
 *           type: string
 *           enum: [pending, active, suspended, blocked]
 *       - name: kycStatus
 *         in: query
 *         schema:
 *           type: string
 *           enum: [none, pending, approved, rejected, expired]
 *       - name: countryCode
 *         in: query
 *         schema:
 *           type: string
 *       - name: search
 *         in: query
 *         schema:
 *           type: string
 *       - $ref: '#/components/parameters/limitParam'
 *       - $ref: '#/components/parameters/offsetParam'
 *     responses:
 *       200:
 *         description: List of investors
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Investor'
 *                 count:
 *                   type: integer
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *
 * /investors/{id}:
 *   get:
 *     tags: [Investors]
 *     summary: Get investor by ID
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Investor details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Investor'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *   patch:
 *     tags: [Investors]
 *     summary: Update investor
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               phone:
 *                 type: string
 *               type:
 *                 type: string
 *                 enum: [individual, institutional, qualified, accredited]
 *               countryCode:
 *                 type: string
 *               taxResidency:
 *                 type: string
 *               profile:
 *                 type: object
 *               metadata:
 *                 type: object
 *     responses:
 *       200:
 *         description: Investor updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Investor'
 *
 * /investors/{id}/kyc:
 *   post:
 *     tags: [Investors]
 *     summary: Create KYC session
 *     description: Initiate a KYC verification session for an investor
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [provider, levelRequested]
 *             properties:
 *               provider:
 *                 type: string
 *                 enum: [sumsub, onfido, jumio, manual]
 *               levelRequested:
 *                 type: string
 *               metadata:
 *                 type: object
 *     responses:
 *       201:
 *         description: KYC session created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/KycSession'
 *   get:
 *     tags: [Investors]
 *     summary: List KYC sessions
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: List of KYC sessions
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/KycSession'
 *                 count:
 *                   type: integer
 *
 * /investors/{id}/kyc/approve:
 *   post:
 *     tags: [Investors]
 *     summary: Manually approve KYC
 *     description: Manually approve an investor's KYC verification (for authorized approvers)
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [approverId, kycLevel]
 *             properties:
 *               approverId:
 *                 type: string
 *                 format: uuid
 *               kycLevel:
 *                 type: string
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: KYC approved
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/KycSession'
 *
 * /investors/{id}/wallets:
 *   post:
 *     tags: [Investors]
 *     summary: Add wallet to investor
 *     description: Link a new wallet address to an investor
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [address, chainId]
 *             properties:
 *               address:
 *                 $ref: '#/components/schemas/EthereumAddress'
 *               chainId:
 *                 type: integer
 *               label:
 *                 type: string
 *               metadata:
 *                 type: object
 *     responses:
 *       201:
 *         description: Wallet added
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/InvestorWallet'
 *   get:
 *     tags: [Investors]
 *     summary: List investor wallets
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: List of wallets
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/InvestorWallet'
 *                 count:
 *                   type: integer
 *
 * /investors/{id}/wallets/{walletId}/verify:
 *   post:
 *     tags: [Investors]
 *     summary: Verify wallet ownership
 *     description: Verify wallet ownership via signature
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - name: walletId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [signature]
 *             properties:
 *               signature:
 *                 type: string
 *     responses:
 *       200:
 *         description: Wallet verified
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/InvestorWallet'
 */

// ============================================================================
// Validation Schemas
// ============================================================================

const createInvestorSchema = z.object({
  externalId: z.string().max(100).optional(),
  email: z.string().email(),
  phone: z.string().optional(),
  type: z.enum(['individual', 'institutional', 'qualified', 'accredited']),
  countryCode: z.string().length(2),
  taxResidency: z.string().length(2).optional(),
  profile: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const updateInvestorSchema = z.object({
  email: z.string().email().optional(),
  phone: z.string().optional(),
  type: z.enum(['individual', 'institutional', 'qualified', 'accredited']).optional(),
  countryCode: z.string().length(2).optional(),
  taxResidency: z.string().length(2).optional(),
  profile: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const createKycSessionSchema = z.object({
  provider: z.enum(['sumsub', 'onfido', 'jumio', 'manual']),
  levelRequested: z.string().min(1),
  metadata: z.record(z.unknown()).optional(),
});

const addWalletSchema = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address'),
  chainId: z.number().int().positive(),
  label: z.string().max(100).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const manualKycApprovalSchema = z.object({
  approverId: z.string().uuid(),
  kycLevel: z.string().min(1),
  notes: z.string().optional(),
});

const manualKycRejectionSchema = z.object({
  rejectorId: z.string().uuid(),
  reason: z.string().min(1),
});

// ============================================================================
// Investor CRUD Routes
// ============================================================================

// Create investor
investorRouter.post('/', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const input = createInvestorSchema.parse(req.body);
    const investor = await investorService.createInvestor({
      ...input,
      orgId: req.apiKey.orgId,
    });

    res.status(201).json(investor);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new ValidationError(error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')));
    } else {
      next(error);
    }
  }
});

// List investors
investorRouter.get('/', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const { type, status, kycStatus, countryCode, search, limit, offset } = req.query;

    const investors = await investorService.listInvestors(req.apiKey.orgId, {
      type: type as any,
      status: status as any,
      kycStatus: kycStatus as any,
      countryCode: countryCode as string | undefined,
      search: search as string | undefined,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    });

    res.json({ data: investors, count: investors.length });
  } catch (error) {
    next(error);
  }
});

// Get investor by ID
investorRouter.get('/:id', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const investor = await investorService.getInvestor(req.params.id, req.apiKey.orgId);
    res.json(investor);
  } catch (error) {
    next(error);
  }
});

// Get investor by external ID
investorRouter.get('/external/:externalId', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const investor = await investorService.getInvestorByExternalId(
      req.params.externalId,
      req.apiKey.orgId
    );
    res.json(investor);
  } catch (error) {
    next(error);
  }
});

// Update investor
investorRouter.patch('/:id', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const input = updateInvestorSchema.parse(req.body);
    const investor = await investorService.updateInvestor(req.params.id, req.apiKey.orgId, input);

    res.json(investor);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new ValidationError(error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')));
    } else {
      next(error);
    }
  }
});

// Update investor status
investorRouter.post('/:id/status', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const { status, reason } = req.body;
    if (!status || !['pending', 'active', 'suspended', 'blocked'].includes(status)) {
      throw new ValidationError('Valid status required');
    }

    const investor = await investorService.updateInvestorStatus(
      req.params.id,
      req.apiKey.orgId,
      status,
      reason
    );

    res.json(investor);
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// KYC Session Routes
// ============================================================================

// Create KYC session
investorRouter.post('/:id/kyc', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const input = createKycSessionSchema.parse(req.body);
    const session = await investorService.createKycSession({
      ...input,
      orgId: req.apiKey.orgId,
      investorId: req.params.id,
    });

    res.status(201).json(session);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new ValidationError(error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')));
    } else {
      next(error);
    }
  }
});

// List KYC sessions
investorRouter.get('/:id/kyc', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const sessions = await investorService.listKycSessions(req.params.id, req.apiKey.orgId);
    res.json({ data: sessions, count: sessions.length });
  } catch (error) {
    next(error);
  }
});

// Get KYC session
investorRouter.get('/:id/kyc/:sessionId', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const session = await investorService.getKycSession(req.params.sessionId, req.apiKey.orgId);
    res.json(session);
  } catch (error) {
    next(error);
  }
});

// Refresh KYC session status
investorRouter.post('/:id/kyc/:sessionId/refresh', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const session = await investorService.refreshKycSessionStatus(
      req.params.sessionId,
      req.apiKey.orgId
    );
    res.json(session);
  } catch (error) {
    next(error);
  }
});

// Manual KYC approval
investorRouter.post('/:id/kyc/approve', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const { approverId, kycLevel, notes } = manualKycApprovalSchema.parse(req.body);
    const session = await investorService.manualKycApproval(
      req.params.id,
      req.apiKey.orgId,
      approverId,
      kycLevel,
      notes
    );

    res.json(session);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new ValidationError(error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')));
    } else {
      next(error);
    }
  }
});

// Manual KYC rejection
investorRouter.post('/:id/kyc/reject', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const { rejectorId, reason } = manualKycRejectionSchema.parse(req.body);
    const session = await investorService.manualKycRejection(
      req.params.id,
      req.apiKey.orgId,
      rejectorId,
      reason
    );

    res.json(session);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new ValidationError(error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')));
    } else {
      next(error);
    }
  }
});

// ============================================================================
// Wallet Routes
// ============================================================================

// Add wallet
investorRouter.post('/:id/wallets', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const input = addWalletSchema.parse(req.body);
    const wallet = await investorService.addWallet({
      ...input,
      orgId: req.apiKey.orgId,
      investorId: req.params.id,
    });

    res.status(201).json(wallet);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new ValidationError(error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')));
    } else {
      next(error);
    }
  }
});

// List wallets
investorRouter.get('/:id/wallets', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const wallets = await investorService.listWallets(req.params.id, req.apiKey.orgId);
    res.json({ data: wallets, count: wallets.length });
  } catch (error) {
    next(error);
  }
});

// Get wallet
investorRouter.get('/:id/wallets/:walletId', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const wallet = await investorService.getWallet(req.params.walletId, req.apiKey.orgId);
    res.json(wallet);
  } catch (error) {
    next(error);
  }
});

// Verify wallet
investorRouter.post('/:id/wallets/:walletId/verify', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const { signature } = req.body;
    const wallet = await investorService.verifyWallet(
      req.params.walletId,
      req.apiKey.orgId,
      signature
    );

    res.json(wallet);
  } catch (error) {
    next(error);
  }
});

// Block wallet
investorRouter.post('/:id/wallets/:walletId/block', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const { reason } = req.body;
    if (!reason) {
      throw new ValidationError('Reason is required');
    }

    const wallet = await investorService.blockWallet(
      req.params.walletId,
      req.apiKey.orgId,
      reason
    );

    res.json(wallet);
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Lookup Routes
// ============================================================================

// Find investor by wallet address
investorRouter.get('/lookup/wallet/:address', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const investor = await investorService.findInvestorByWallet(
      req.params.address,
      req.apiKey.orgId
    );

    if (!investor) {
      res.status(404).json({ error: 'Investor not found for this wallet' });
    } else {
      res.json(investor);
    }
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// ============================================================================
// Redemption Eligibility
// ============================================================================

// Check if investor is eligible to redeem tokens
investorRouter.get('/:id/redemption-eligibility', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const { tokenId, amount } = req.query;

    // Get investor to verify they exist
    const investor = await investorService.getInvestor(req.params.id, req.apiKey.orgId);

    // Check redemption eligibility (simplified for MVP)
    const eligibility = {
      investorId: investor.id,
      tokenId: tokenId || null,
      amount: amount || null,
      eligible: true,
      checks: {
        kycValid: investor.kycStatus === 'approved',
        accountActive: investor.status === 'active',
        noLockup: true, // Would check actual lockup periods
        sufficientBalance: true, // Would check actual balance
      },
      reason: null as string | null,
    };

    // Determine eligibility based on checks
    if (!eligibility.checks.kycValid) {
      eligibility.eligible = false;
      eligibility.reason = 'KYC not approved';
    } else if (!eligibility.checks.accountActive) {
      eligibility.eligible = false;
      eligibility.reason = 'Investor account is not active';
    }

    res.json(eligibility);
  } catch (error) {
    next(error);
  }
});

// KYC Webhook Route (for external providers)
// ============================================================================

// KYC provider webhook handler
investorRouter.post('/kyc/webhook/:provider', async (req, res, next) => {
  try {
    const provider = req.params.provider as any;
    const signature = req.headers['x-webhook-signature'] as string || '';

    const result = await investorService.processKycWebhook(provider, req.body, signature);
    res.json(result);
  } catch (error) {
    next(error);
  }
});
