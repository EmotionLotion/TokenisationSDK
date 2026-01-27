import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ContextRequest } from '../middleware/context.js';
import { ValidationError, NotFoundError } from '../middleware/errorHandler.js';
import { getOrgId, getActorId, getActorType, getRequestId } from '../context/TenantContext.js';

// ============================================================================
// Transition Routes - State transition history with full audit trail
// ============================================================================

export const transitionRouter = Router();

// ============================================================================
// Schemas
// ============================================================================

const ListTransitionsQuerySchema = z.object({
  assetId: z.string().uuid().optional(),
  tokenId: z.string().uuid().optional(),
  subjectType: z.enum(['asset', 'token', 'investor', 'transfer']).optional(),
  subjectId: z.string().uuid().optional(),
  previousState: z.string().optional(),
  newState: z.string().optional(),
  triggeredById: z.string().optional(),
  triggeredByType: z.enum(['user', 'api_key', 'system', 'webhook']).optional(),
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const GetTransitionSchema = z.object({
  transitionId: z.string().uuid(),
});

const GetTransitionsByApproverSchema = z.object({
  assetId: z.string().uuid(),
  state: z.string(),
});

// ============================================================================
// Types
// ============================================================================

interface StateTransitionResponse {
  id: string;
  orgId: string;
  subjectType: 'asset' | 'token' | 'investor' | 'transfer';
  subjectId: string;
  assetId?: string;
  tokenId?: string;
  previousState: string;
  newState: string;
  version: number;
  previousTransitionId?: string;
  triggeredBy: {
    id: string;
    type: string;
    name?: string;
    ip?: string;
  };
  justification: {
    reason: string;
    explanation?: string;
  };
  compliance?: {
    decisionReceiptId?: string;
    result?: string;
  };
  hashChain: {
    transitionHash: string;
    previousTransitionHash?: string;
  };
  context: {
    requestId?: string;
    traceId?: string;
  };
  executedAt: string;
  createdAt: string;
}

interface ListTransitionsResponse {
  transitions: StateTransitionResponse[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

interface TransitionHistoryResponse {
  assetId: string;
  currentState: string;
  totalTransitions: number;
  transitions: StateTransitionResponse[];
  approvers: ApproverInfo[];
}

interface ApproverInfo {
  state: string;
  approvedBy: string;
  approvedByType: string;
  approvedByName?: string;
  approvedAt: string;
  reason: string;
}

// ============================================================================
// Routes
// ============================================================================

/**
 * @openapi
 * /api/v1/transitions:
 *   get:
 *     summary: List state transitions
 *     tags: [Transitions]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - name: assetId
 *         in: query
 *         schema:
 *           type: string
 *           format: uuid
 *       - name: tokenId
 *         in: query
 *         schema:
 *           type: string
 *           format: uuid
 *       - name: subjectType
 *         in: query
 *         schema:
 *           type: string
 *           enum: [asset, token, investor, transfer]
 *       - name: triggeredById
 *         in: query
 *         schema:
 *           type: string
 *       - name: limit
 *         in: query
 *         schema:
 *           type: integer
 *           default: 50
 *       - name: offset
 *         in: query
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: List of transitions
 */
transitionRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId();
    const parsed = ListTransitionsQuerySchema.safeParse(req.query);

    if (!parsed.success) {
      throw new ValidationError(`Invalid query parameters: ${parsed.error.message}`);
    }

    const { limit, offset, ...filters } = parsed.data;

    // In production, this would query the stateTransitions table
    // with the provided filters and pagination

    const response: ListTransitionsResponse = {
      transitions: [],
      total: 0,
      limit,
      offset,
      hasMore: false,
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /api/v1/transitions/{transitionId}:
 *   get:
 *     summary: Get a specific transition
 *     tags: [Transitions]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - name: transitionId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Transition details
 *       404:
 *         description: Transition not found
 */
transitionRouter.get('/:transitionId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId();
    const parsed = GetTransitionSchema.safeParse(req.params);

    if (!parsed.success) {
      throw new ValidationError(`Invalid transition ID: ${parsed.error.message}`);
    }

    const { transitionId } = parsed.data;

    // In production, this would query the stateTransitions table
    // by ID and orgId

    throw new NotFoundError('Transition');
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /api/v1/transitions/asset/{assetId}:
 *   get:
 *     summary: Get full transition history for an asset
 *     tags: [Transitions]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - name: assetId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Asset transition history
 */
transitionRouter.get('/asset/:assetId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId();
    const assetId = req.params.assetId;

    if (!assetId) {
      throw new ValidationError('Asset ID is required');
    }

    // In production, this would:
    // 1. Query all transitions for the asset
    // 2. Build the full history chain
    // 3. Extract approver information

    const response: TransitionHistoryResponse = {
      assetId,
      currentState: 'DRAFT', // Would be fetched from asset
      totalTransitions: 0,
      transitions: [],
      approvers: [],
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /api/v1/transitions/asset/{assetId}/who-approved/{state}:
 *   get:
 *     summary: Find who approved a specific state for an asset
 *     tags: [Transitions]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - name: assetId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - name: state
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Approver information
 */
transitionRouter.get(
  '/asset/:assetId/who-approved/:state',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = getOrgId();
      const parsed = GetTransitionsByApproverSchema.safeParse(req.params);

      if (!parsed.success) {
        throw new ValidationError(`Invalid parameters: ${parsed.error.message}`);
      }

      const { assetId, state } = parsed.data;

      // In production, this would query stateTransitions where:
      // - assetId matches
      // - newState matches the requested state
      // - Return the actor who triggered the transition

      // Return empty response if not found
      res.json({
        assetId,
        state,
        approver: null,
        message: `No approver found for state '${state}' on asset '${assetId}'`,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @openapi
 * /api/v1/transitions/verify-chain/{assetId}:
 *   get:
 *     summary: Verify the hash chain integrity for an asset's transitions
 *     tags: [Transitions]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - name: assetId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Chain verification result
 */
transitionRouter.get(
  '/verify-chain/:assetId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = getOrgId();
      const assetId = req.params.assetId;

      if (!assetId) {
        throw new ValidationError('Asset ID is required');
      }

      // In production, this would:
      // 1. Fetch all transitions for the asset ordered by version
      // 2. Verify each transition's hash matches computed hash
      // 3. Verify previousTransitionHash chain links correctly
      // 4. Return verification result

      res.json({
        assetId,
        verified: true,
        totalTransitions: 0,
        chainIntact: true,
        verifiedAt: new Date().toISOString(),
        details: {
          message: 'No transitions to verify',
        },
      });
    } catch (error) {
      next(error);
    }
  }
);
