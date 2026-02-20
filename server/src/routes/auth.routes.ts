import { Router } from 'express';
import { SiweMessage } from 'siwe';
import { randomBytes, createHash } from 'crypto';
import { db, parties, partyWallets, sessions } from '../config/database.js';
import { eq, and } from 'drizzle-orm';
import { generateToken, generateRefreshToken, verifyToken, authMiddleware, type AuthRequest } from '../middleware/auth.js';
import { ValidationError, UnauthorizedError, AppError } from '../middleware/errorHandler.js';

export const authRouter = Router();

// Store nonces in memory for simplicity (use Redis in production)
const nonceStore = new Map<string, { nonce: string; expiresAt: Date }>();

// Generate nonce for SIWE
authRouter.post('/siwe/nonce', async (req, res, next) => {
  try {
    const { address } = req.body;

    if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
      throw new ValidationError('Invalid Ethereum address');
    }

    const nonce = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Store nonce
    nonceStore.set(address.toLowerCase(), { nonce, expiresAt });

    res.json({
      nonce,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

// Verify SIWE signature and create session
authRouter.post('/siwe/verify', async (req, res, next) => {
  try {
    const { message, signature } = req.body;

    if (!message || !signature) {
      throw new ValidationError('Message and signature are required');
    }

    // Parse and verify SIWE message
    const siweMessage = new SiweMessage(message);
    const { data: verified } = await siweMessage.verify({ signature });

    const address = verified.address.toLowerCase();

    // Verify nonce
    const storedNonce = nonceStore.get(address);
    if (!storedNonce || storedNonce.nonce !== verified.nonce) {
      throw new UnauthorizedError('Invalid or expired nonce');
    }

    if (new Date() > storedNonce.expiresAt) {
      nonceStore.delete(address);
      throw new UnauthorizedError('Nonce expired');
    }

    // Invalidate nonce
    nonceStore.delete(address);

    // Find or create party
    let wallet = await db.query.partyWallets.findFirst({
      where: eq(partyWallets.address, address),
      with: { party: true } as any, // Drizzle relation typing
    });

    let party;
    if (!wallet) {
      // Create new party
      const [newParty] = await db.insert(parties).values({
        name: `Wallet ${address.slice(0, 8)}...${address.slice(-4)}`,
        type: 'INDIVIDUAL',
        roles: ['INVESTOR'],
        jurisdiction: 'US', // Default, can be updated
      }).returning();

      party = newParty;

      // Link wallet to party
      await db.insert(partyWallets).values({
        partyId: party.id,
        address,
        chainId: verified.chainId || 1,
        isPrimary: true,
        verified: true,
        verifiedAt: new Date(),
      });
    } else {
      party = (wallet as any).party || await db.query.parties.findFirst({
        where: eq(parties.id, wallet.partyId),
      });
    }

    if (!party) {
      throw new AppError('Failed to find or create party', 500);
    }

    // Generate tokens
    const tokenPayload = { partyId: party.id, address };
    const token = generateToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    // Store session
    await db.insert(sessions).values({
      partyId: party.id,
      walletAddress: address,
      siweNonce: verified.nonce,
      siweIssuedAt: verified.issuedAt ? new Date(verified.issuedAt) : new Date(),
      siweExpiryAt: verified.expirationTime ? new Date(verified.expirationTime) : undefined,
      jwtIssuedAt: new Date(),
      jwtExpiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
      refreshTokenHash: createHash('sha256').update(refreshToken).digest('hex'),
      refreshExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      isActive: true,
    });

    res.json({
      token,
      refreshToken,
      party: {
        id: party.id,
        name: party.name,
        type: party.type,
        roles: party.roles,
        jurisdiction: party.jurisdiction,
        verificationLevel: party.verificationLevel,
        kycVerified: party.kycVerified,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Signature')) {
      next(new UnauthorizedError('Invalid signature'));
    } else {
      next(error);
    }
  }
});

// Email/password registration
authRouter.post('/register', async (req, res, next) => {
  try {
    const { email, password, name, orgId } = req.body;

    if (!email || !password) {
      throw new ValidationError('Email and password are required');
    }
    if (password.length < 8) {
      throw new ValidationError('Password must be at least 8 characters');
    }
    if (!orgId) {
      throw new ValidationError('Organization ID is required');
    }

    const iamService = await import('../services/iam.service.js');
    const user = await iamService.createUser({ email, password, name, orgId });

    const tokenPayload = { partyId: user.id, address: email, orgId };
    const token = generateToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    res.status(201).json({ token, refreshToken, user });
  } catch (error) {
    next(error);
  }
});

// Email/password login
authRouter.post('/login', async (req, res, next) => {
  try {
    const { email, password, orgId } = req.body;

    if (!email || !password) {
      throw new ValidationError('Email and password are required');
    }

    const iamService = await import('../services/iam.service.js');
    const user = await iamService.verifyUserPassword(email, password, orgId);

    const tokenPayload = { partyId: user.id, address: email, orgId: user.orgId };
    const token = generateToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    // Store session (siweNonce is required by schema; use a random value for email auth)
    await db.insert(sessions).values({
      partyId: user.id,
      walletAddress: email.slice(0, 42),
      siweNonce: randomBytes(16).toString('hex'),
      jwtIssuedAt: new Date(),
      jwtExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      refreshTokenHash: createHash('sha256').update(refreshToken).digest('hex'),
      refreshExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      isActive: true,
    });

    res.json({ token, refreshToken, user });
  } catch (error) {
    next(error);
  }
});

// Refresh token
authRouter.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      throw new ValidationError('Refresh token is required');
    }

    // Verify refresh token
    const decoded = verifyToken(refreshToken);
    const tokenHash = createHash('sha256').update(refreshToken).digest('hex');

    // Find session
    const session = await db.query.sessions.findFirst({
      where: and(
        eq(sessions.partyId, decoded.partyId),
        eq(sessions.refreshTokenHash, tokenHash),
        eq(sessions.isActive, true)
      ),
    });

    if (!session) {
      throw new UnauthorizedError('Invalid refresh token');
    }

    if (session.refreshExpiresAt && new Date() > session.refreshExpiresAt) {
      throw new UnauthorizedError('Refresh token expired');
    }

    // Generate new tokens
    const tokenPayload = { partyId: decoded.partyId, address: decoded.address };
    const newToken = generateToken(tokenPayload);
    const newRefreshToken = generateRefreshToken(tokenPayload);

    // Update session
    await db.update(sessions)
      .set({
        jwtIssuedAt: new Date(),
        jwtExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
        refreshTokenHash: createHash('sha256').update(newRefreshToken).digest('hex'),
        refreshExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        lastUsedAt: new Date(),
      })
      .where(eq(sessions.id, session.id));

    res.json({
      token: newToken,
      refreshToken: newRefreshToken,
    });
  } catch (error) {
    next(error);
  }
});

// Logout
authRouter.post('/logout', authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user) {
      throw new UnauthorizedError();
    }

    // Invalidate all sessions for this party
    await db.update(sessions)
      .set({ isActive: false })
      .where(and(
        eq(sessions.partyId, req.user.partyId),
        eq(sessions.isActive, true)
      ));

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Get current user
authRouter.get('/me', authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user) {
      throw new UnauthorizedError();
    }

    const party = await db.query.parties.findFirst({
      where: eq(parties.id, req.user.partyId),
    });

    if (!party) {
      throw new UnauthorizedError('Party not found');
    }

    const wallets = await db.query.partyWallets.findMany({
      where: eq(partyWallets.partyId, party.id),
    });

    res.json({
      party: {
        id: party.id,
        name: party.name,
        type: party.type,
        roles: party.roles,
        jurisdiction: party.jurisdiction,
        verificationLevel: party.verificationLevel,
        kycVerified: party.kycVerified,
        accreditedInvestor: party.accreditedInvestor,
        isFrozen: party.isFrozen,
      },
      wallets: wallets.map(w => ({
        address: w.address,
        chainId: w.chainId,
        isPrimary: w.isPrimary,
        verified: w.verified,
      })),
    });
  } catch (error) {
    next(error);
  }
});
