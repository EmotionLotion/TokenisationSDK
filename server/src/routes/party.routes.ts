import { Router } from 'express';
import { db, parties, partyWallets } from '../config/database.js';
import { eq, ilike, and, or, sql } from 'drizzle-orm';
import { type AuthRequest } from '../middleware/auth.js';
import { NotFoundError, ValidationError, ForbiddenError } from '../middleware/errorHandler.js';
import { z } from 'zod';

export const partyRouter = Router();

// Validation schemas
const createPartySchema = z.object({
  name: z.string().min(1).max(256),
  type: z.enum(['INDIVIDUAL', 'ORGANIZATION', 'AGENT']),
  roles: z.array(z.string()).default(['INVESTOR']),
  jurisdiction: z.string().length(2),
  metadata: z.record(z.unknown()).optional(),
});

const updatePartySchema = z.object({
  name: z.string().min(1).max(256).optional(),
  roles: z.array(z.string()).optional(),
  jurisdiction: z.string().length(2).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const kycUpdateSchema = z.object({
  verified: z.boolean(),
  expiryDate: z.string().datetime().optional(),
  verificationLevel: z.enum(['NONE', 'BASIC', 'STANDARD', 'ENHANCED']).optional(),
  accreditedInvestor: z.boolean().optional(),
});

// List parties
partyRouter.get('/', async (req: AuthRequest, res, next) => {
  try {
    const { page = '1', limit = '20', type, jurisdiction, search } = req.query;
    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);

    const conditions = [];

    if (type) {
      conditions.push(eq(parties.type, type as string));
    }

    if (jurisdiction) {
      conditions.push(eq(parties.jurisdiction, jurisdiction as string));
    }

    if (search) {
      conditions.push(ilike(parties.name, `%${search}%`));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [partyList, countResult] = await Promise.all([
      db.select().from(parties)
        .where(whereClause)
        .limit(parseInt(limit as string))
        .offset(offset)
        .orderBy(parties.createdAt),
      db.select({ count: sql<number>`count(*)` }).from(parties).where(whereClause),
    ]);

    res.json({
      parties: partyList,
      total: Number(countResult[0]?.count || 0),
      page: parseInt(page as string),
      limit: parseInt(limit as string),
    });
  } catch (error) {
    next(error);
  }
});

// Get party by wallet address
partyRouter.get('/by-wallet/:address', async (req: AuthRequest, res, next) => {
  try {
    const { address } = req.params;

    if (!address || !/^0x[a-fA-F0-9]{40}$/i.test(address)) {
      throw new ValidationError('Invalid Ethereum address');
    }

    const wallet = await db.query.partyWallets.findFirst({
      where: eq(partyWallets.address, address.toLowerCase()),
    });

    if (!wallet) {
      // Return null instead of error - party may not exist yet
      return res.json({ party: null });
    }

    const party = await db.query.parties.findFirst({
      where: eq(parties.id, wallet.partyId),
    });

    if (!party) {
      return res.json({ party: null });
    }

    const wallets = await db.query.partyWallets.findMany({
      where: eq(partyWallets.partyId, party.id),
    });

    res.json({
      party: {
        ...party,
        wallets,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Get party by ID
partyRouter.get('/:id', async (req: AuthRequest, res, next) => {
  try {
    const { id } = req.params;

    const party = await db.query.parties.findFirst({
      where: eq(parties.id, id),
    });

    if (!party) {
      throw new NotFoundError('Party');
    }

    const wallets = await db.query.partyWallets.findMany({
      where: eq(partyWallets.partyId, id),
    });

    res.json({
      ...party,
      wallets,
    });
  } catch (error) {
    next(error);
  }
});

// Create party
partyRouter.post('/', async (req: AuthRequest, res, next) => {
  try {
    const data = createPartySchema.parse(req.body);

    const [party] = await db.insert(parties).values({
      name: data.name,
      type: data.type,
      roles: data.roles,
      jurisdiction: data.jurisdiction,
      metadata: data.metadata || {},
    }).returning();

    res.status(201).json(party);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new ValidationError(error.errors.map(e => e.message).join(', ')));
    } else {
      next(error);
    }
  }
});

// Update party
partyRouter.patch('/:id', async (req: AuthRequest, res, next) => {
  try {
    const { id } = req.params;
    const data = updatePartySchema.parse(req.body);

    // Check if party exists
    const existing = await db.query.parties.findFirst({
      where: eq(parties.id, id),
    });

    if (!existing) {
      throw new NotFoundError('Party');
    }

    // Check permission (user can only update their own party unless admin)
    if (req.user?.partyId !== id) {
      // In a real app, check for admin role
      throw new ForbiddenError('Cannot update another party');
    }

    const [updated] = await db.update(parties)
      .set({
        ...(data.name && { name: data.name }),
        ...(data.roles && { roles: data.roles }),
        ...(data.jurisdiction && { jurisdiction: data.jurisdiction }),
        ...(data.metadata && { metadata: data.metadata }),
      })
      .where(eq(parties.id, id))
      .returning();

    res.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new ValidationError(error.errors.map(e => e.message).join(', ')));
    } else {
      next(error);
    }
  }
});

// Update KYC status
partyRouter.post('/:id/kyc', async (req: AuthRequest, res, next) => {
  try {
    const { id } = req.params;
    const data = kycUpdateSchema.parse(req.body);

    // Check if party exists
    const existing = await db.query.parties.findFirst({
      where: eq(parties.id, id),
    });

    if (!existing) {
      throw new NotFoundError('Party');
    }

    // In production, verify the caller has verifier role
    // For now, allow any authenticated user

    const [updated] = await db.update(parties)
      .set({
        kycVerified: data.verified,
        kycExpiryDate: data.expiryDate ? new Date(data.expiryDate) : null,
        verificationLevel: data.verificationLevel || (data.verified ? 'STANDARD' : 'NONE'),
        accreditedInvestor: data.accreditedInvestor ?? existing.accreditedInvestor,
      })
      .where(eq(parties.id, id))
      .returning();

    res.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new ValidationError(error.errors.map(e => e.message).join(', ')));
    } else {
      next(error);
    }
  }
});

// Freeze party
partyRouter.post('/:id/freeze', async (req: AuthRequest, res, next) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const existing = await db.query.parties.findFirst({
      where: eq(parties.id, id),
    });

    if (!existing) {
      throw new NotFoundError('Party');
    }

    const [updated] = await db.update(parties)
      .set({
        isFrozen: true,
        freezeReason: reason || 'Compliance action',
      })
      .where(eq(parties.id, id))
      .returning();

    res.json(updated);
  } catch (error) {
    next(error);
  }
});

// Unfreeze party
partyRouter.post('/:id/unfreeze', async (req: AuthRequest, res, next) => {
  try {
    const { id } = req.params;

    const existing = await db.query.parties.findFirst({
      where: eq(parties.id, id),
    });

    if (!existing) {
      throw new NotFoundError('Party');
    }

    const [updated] = await db.update(parties)
      .set({
        isFrozen: false,
        freezeReason: null,
      })
      .where(eq(parties.id, id))
      .returning();

    res.json(updated);
  } catch (error) {
    next(error);
  }
});

// Add wallet to party
partyRouter.post('/:id/wallets', async (req: AuthRequest, res, next) => {
  try {
    const { id } = req.params;
    const { address, chainId, isPrimary } = req.body;

    if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
      throw new ValidationError('Invalid Ethereum address');
    }

    const existing = await db.query.parties.findFirst({
      where: eq(parties.id, id),
    });

    if (!existing) {
      throw new NotFoundError('Party');
    }

    // If setting as primary, unset other primaries
    if (isPrimary) {
      await db.update(partyWallets)
        .set({ isPrimary: false })
        .where(eq(partyWallets.partyId, id));
    }

    const [wallet] = await db.insert(partyWallets).values({
      partyId: id,
      address: address.toLowerCase(),
      chainId: chainId || 1,
      isPrimary: isPrimary || false,
    }).returning();

    res.status(201).json(wallet);
  } catch (error) {
    next(error);
  }
});
