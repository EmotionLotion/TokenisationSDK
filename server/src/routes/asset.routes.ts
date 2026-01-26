import { Router } from 'express';
import { randomUUID } from 'crypto';
import { db, assets, events, tokenBalances, parties } from '../config/database.js';
import { eq, and, sql, ilike } from 'drizzle-orm';
import { type AuthRequest } from '../middleware/auth.js';
import { NotFoundError, ValidationError, ForbiddenError } from '../middleware/errorHandler.js';
import { z } from 'zod';

export const assetRouter = Router();

// Valid lifecycle transitions
const VALID_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['PENDING_VERIFICATION'],
  PENDING_VERIFICATION: ['VERIFIED', 'DRAFT'],
  VERIFIED: ['ACTIVE', 'DRAFT'],
  ACTIVE: ['FROZEN', 'REDEEMED', 'EXPIRED', 'BURNED'],
  FROZEN: ['ACTIVE', 'BURNED'],
  REDEEMED: [],
  EXPIRED: ['BURNED'],
  BURNED: [],
};

// Validation schemas
const createAssetSchema = z.object({
  name: z.string().min(1).max(256),
  description: z.string().optional(),
  rightType: z.enum(['OWNERSHIP', 'ACCESS', 'BEHAVIOR', 'VERIFICATION']),
  jurisdiction: z.object({
    countryCode: z.string().length(2),
    regulatoryFramework: z.string().optional(),
    accreditedOnly: z.boolean().default(false),
    blockedJurisdictions: z.array(z.string()).default([]),
  }),
  validityPeriod: z.object({
    isPerpetual: z.boolean().default(true),
    startTime: z.string().datetime().optional(),
    endTime: z.string().datetime().optional(),
    durationSeconds: z.number().optional(),
  }).optional(),
  transferabilityRules: z.object({
    mode: z.enum(['UNRESTRICTED', 'WHITELIST_ONLY', 'NON_TRANSFERABLE', 'COMPLIANCE_GATED']),
    lockupPeriodSeconds: z.number().default(0),
    requireKyc: z.boolean().default(false),
    maxHolders: z.number().optional(),
    minimumHoldingAmount: z.string().optional(),
  }).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const transitionSchema = z.object({
  toState: z.enum(['DRAFT', 'PENDING_VERIFICATION', 'VERIFIED', 'ACTIVE', 'FROZEN', 'REDEEMED', 'EXPIRED', 'BURNED']),
  reason: z.string().optional(),
});

// List assets
assetRouter.get('/', async (req: AuthRequest, res, next) => {
  try {
    const { page = '1', limit = '20', state, rightType, search, issuerId } = req.query;
    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);

    const conditions = [];

    if (state) {
      conditions.push(eq(assets.state, state as string));
    }

    if (rightType) {
      conditions.push(eq(assets.rightType, rightType as string));
    }

    if (issuerId) {
      conditions.push(eq(assets.issuerId, issuerId as string));
    }

    if (search) {
      conditions.push(ilike(assets.name, `%${search}%`));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [assetList, countResult] = await Promise.all([
      db.select().from(assets)
        .where(whereClause)
        .limit(parseInt(limit as string))
        .offset(offset)
        .orderBy(assets.createdAt),
      db.select({ count: sql<number>`count(*)` }).from(assets).where(whereClause),
    ]);

    res.json({
      assets: assetList,
      total: Number(countResult[0]?.count || 0),
      page: parseInt(page as string),
      limit: parseInt(limit as string),
    });
  } catch (error) {
    next(error);
  }
});

// Get asset by ID
assetRouter.get('/:id', async (req: AuthRequest, res, next) => {
  try {
    const { id } = req.params;

    const asset = await db.query.assets.findFirst({
      where: eq(assets.id, id),
    });

    if (!asset) {
      throw new NotFoundError('Asset');
    }

    // Get token balances
    const balances = await db.select({
      holderId: tokenBalances.holderId,
      balance: tokenBalances.balance,
      holderName: parties.name,
    })
      .from(tokenBalances)
      .leftJoin(parties, eq(tokenBalances.holderId, parties.id))
      .where(eq(tokenBalances.assetId, id));

    // Get issuer info
    let issuer = null;
    if (asset.issuerId) {
      issuer = await db.query.parties.findFirst({
        where: eq(parties.id, asset.issuerId),
      });
    }

    res.json({
      ...asset,
      issuer: issuer ? {
        id: issuer.id,
        name: issuer.name,
        type: issuer.type,
      } : null,
      balances: balances.reduce((acc, b) => ({
        ...acc,
        [b.holderId]: {
          balance: b.balance,
          holderName: b.holderName,
        },
      }), {}),
    });
  } catch (error) {
    next(error);
  }
});

// Create asset
assetRouter.post('/', async (req: AuthRequest, res, next) => {
  try {
    const data = createAssetSchema.parse(req.body);

    // Use the authenticated user's party as issuer (null if not available or dev mode)
    // In dev mode, skip issuer to avoid foreign key issues with non-existent party
    let issuerId: string | null = null;
    if (req.user?.partyId && !req.user.partyId.startsWith('test-')) {
      issuerId = req.user.partyId;
    }

    const assetId = randomUUID();
    const now = new Date().toISOString();

    const [asset] = await db.insert(assets).values({
      id: assetId,
      name: data.name,
      description: data.description,
      rightType: data.rightType,
      state: 'DRAFT',
      issuerId,
      jurisdiction: data.jurisdiction,
      validityPeriod: data.validityPeriod || { isPerpetual: true },
      transferabilityRules: data.transferabilityRules || {
        mode: 'UNRESTRICTED',
        lockupPeriodSeconds: 0,
        requireKyc: false,
      },
      metadata: data.metadata || {},
      createdAt: now,
      updatedAt: now,
    }).returning();

    // Create ASSET_CREATED event
    const eventId = randomUUID();
    await db.insert(events).values({
      id: eventId,
      type: 'ASSET_CREATED',
      assetId: asset.id,
      actorId: req.user?.partyId || 'system',
      payload: {
        name: asset.name,
        rightType: asset.rightType,
        issuerId,
      },
      createdAt: now,
      timestamp: now,
    });

    res.status(201).json(asset);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new ValidationError(error.errors.map(e => e.message).join(', ')));
    } else {
      next(error);
    }
  }
});

// Update asset
assetRouter.patch('/:id', async (req: AuthRequest, res, next) => {
  try {
    const { id } = req.params;

    const existing = await db.query.assets.findFirst({
      where: eq(assets.id, id),
    });

    if (!existing) {
      throw new NotFoundError('Asset');
    }

    // Can only update assets in DRAFT state
    if (existing.state !== 'DRAFT') {
      throw new ForbiddenError('Can only update assets in DRAFT state');
    }

    // Check permission
    if (existing.issuerId !== req.user?.partyId) {
      throw new ForbiddenError('Cannot update another party\'s asset');
    }

    const { name, description, jurisdiction, validityPeriod, transferabilityRules, metadata } = req.body;

    const [updated] = await db.update(assets)
      .set({
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(jurisdiction && { jurisdiction }),
        ...(validityPeriod && { validityPeriod }),
        ...(transferabilityRules && { transferabilityRules }),
        ...(metadata && { metadata }),
        version: (existing.version || 0) + 1,
      })
      .where(eq(assets.id, id))
      .returning();

    // Create ASSET_UPDATED event
    await db.insert(events).values({
      type: 'ASSET_UPDATED',
      assetId: id,
      actorId: req.user?.partyId || 'system',
      payload: { updatedFields: Object.keys(req.body) },
    });

    res.json(updated);
  } catch (error) {
    next(error);
  }
});

// Transition asset state
assetRouter.post('/:id/transition', async (req: AuthRequest, res, next) => {
  try {
    const { id } = req.params;
    const { toState, reason } = transitionSchema.parse(req.body);

    const existing = await db.query.assets.findFirst({
      where: eq(assets.id, id),
    });

    if (!existing) {
      throw new NotFoundError('Asset');
    }

    // Check if transition is valid
    const validNextStates = VALID_TRANSITIONS[existing.state] || [];
    if (!validNextStates.includes(toState)) {
      throw new ValidationError(`Invalid transition from ${existing.state} to ${toState}. Valid transitions: ${validNextStates.join(', ')}`);
    }

    // Check permission (issuer or system for certain transitions)
    if (existing.issuerId !== req.user?.partyId) {
      // Allow if user has verifier role (for verification transitions)
      // For now, allow any authenticated user
    }

    const previousState = existing.state;

    const [updated] = await db.update(assets)
      .set({
        state: toState,
        version: (existing.version || 0) + 1,
      })
      .where(eq(assets.id, id))
      .returning();

    // Create STATE_CHANGED event
    const [event] = await db.insert(events).values({
      type: 'STATE_CHANGED',
      assetId: id,
      actorId: req.user?.partyId || 'system',
      payload: {
        fromState: previousState,
        toState,
        reason,
      },
    }).returning();

    res.json({
      asset: updated,
      event,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new ValidationError(error.errors.map(e => e.message).join(', ')));
    } else {
      next(error);
    }
  }
});

// Delete asset (only DRAFT)
assetRouter.delete('/:id', async (req: AuthRequest, res, next) => {
  try {
    const { id } = req.params;

    const existing = await db.query.assets.findFirst({
      where: eq(assets.id, id),
    });

    if (!existing) {
      throw new NotFoundError('Asset');
    }

    if (existing.state !== 'DRAFT') {
      throw new ForbiddenError('Can only delete assets in DRAFT state');
    }

    if (existing.issuerId !== req.user?.partyId) {
      throw new ForbiddenError('Cannot delete another party\'s asset');
    }

    await db.delete(assets).where(eq(assets.id, id));

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});
