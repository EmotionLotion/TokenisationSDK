/**
 * Loyalty Routes (T9c)
 *
 * HTTP surface for the loyalty reference module. Mutations (issue/redeem/consume/revoke)
 * flow through the loyalty service which records audited, idempotent RightActions
 * (T9b) over the existing loyalty ledger. RBAC via resource-level requireScope(action,'loyalty');
 * org-scoped via tenantContextMiddleware at mount; Idempotency-Key required on spend ops.
 */
import { Router, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import * as loyaltyService from '../services/loyalty.service.js';
import { type ApiKeyRequest } from '../middleware/auth.js';
import { requireScope } from '../middleware/scopeGuard.js';
import { ValidationError } from '../middleware/errorHandler.js';

export const loyaltyRouter = Router();

const earnRuleSchema = z.object({ action: z.string().min(1), points: z.number().int().positive(), multiplier: z.number().positive().optional() });
const createProgramSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  currency: z.string().optional(),
  earnRules: z.array(earnRuleSchema).optional(),
});
const createAccountSchema = z.object({ programId: z.string().min(1), investorId: z.string().min(1) });
const earnSchema = z.object({ action: z.string().min(1), referenceId: z.string().optional(), description: z.string().optional() });
const spendSchema = z.object({
  amount: z.number().int().positive(),
  action: z.string().min(1),
  reason: z.string().max(1024).optional(),
  redemptionRate: z.number().positive().optional(),
  minRedemptionAmount: z.number().int().positive().optional(),
});
const revokeSchema = z.object({ reason: z.string().min(1).max(2048) });

function org(req: ApiKeyRequest): string {
  if (!req.apiKey) throw new ValidationError('API key required');
  return req.apiKey.orgId;
}
function idemKey(req: ApiKeyRequest): string | undefined {
  return req.headers['idempotency-key'] as string | undefined;
}
function zodNext(next: NextFunction, e: unknown): void {
  if (e instanceof z.ZodError) next(new ValidationError(e.errors.map((x) => `${x.path.join('.')}: ${x.message}`).join(', ')));
  else next(e as Error);
}

/**
 * @openapi
 * /api/v1/loyalty/programs:
 *   post: { summary: Create a loyalty program, tags: [Loyalty], responses: { '201': { description: created } } }
 */
loyaltyRouter.post('/programs', requireScope('write', 'loyalty'), async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const body = createProgramSchema.parse(req.body);
    const program = await loyaltyService.createProgram(org(req), body);
    res.status(201).json({ program });
  } catch (e) { zodNext(next, e); }
});

/**
 * @openapi
 * /api/v1/loyalty/accounts:
 *   post: { summary: Open (or get) a loyalty account, tags: [Loyalty], responses: { '201': { description: created } } }
 */
loyaltyRouter.post('/accounts', requireScope('write', 'loyalty'), async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const body = createAccountSchema.parse(req.body);
    const account = await loyaltyService.getOrCreateAccount(org(req), body.programId, body.investorId);
    res.status(201).json({ account });
  } catch (e) { zodNext(next, e); }
});

/** Earn points (per program earn rule). */
loyaltyRouter.post('/accounts/:accountId/earn', requireScope('write', 'loyalty'), async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const body = earnSchema.parse(req.body);
    const txn = await loyaltyService.earnPoints(org(req), { accountId: req.params.accountId, ...body });
    res.status(201).json({ transaction: txn });
  } catch (e) { zodNext(next, e); }
});

/**
 * @openapi
 * /api/v1/loyalty/accounts/{accountId}/balance:
 *   get: { summary: Get account balance + tier, tags: [Loyalty], responses: { '200': { description: ok } } }
 */
loyaltyRouter.get('/accounts/:accountId/balance', requireScope('read', 'loyalty'), async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const balance = await loyaltyService.getBalance(org(req), req.params.accountId);
    res.json({ balance });
  } catch (e) { next(e as Error); }
});

/** Transaction history. */
loyaltyRouter.get('/accounts/:accountId/transactions', requireScope('read', 'loyalty'), async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
    const offset = req.query.offset ? parseInt(req.query.offset as string) : undefined;
    const history = await loyaltyService.getTransactionHistory(org(req), req.params.accountId, limit, offset);
    res.json(history);
  } catch (e) { next(e as Error); }
});

/**
 * @openapi
 * /api/v1/loyalty/accounts/{accountId}/redeem:
 *   post: { summary: Redeem points for value (RightAction REDEEM; requires Idempotency-Key), tags: [Loyalty], responses: { '200': { description: ok } } }
 */
loyaltyRouter.post('/accounts/:accountId/redeem', requireScope('write', 'loyalty'), async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const body = spendSchema.parse(req.body);
    const result = await loyaltyService.redeemPoints(org(req), { accountId: req.params.accountId, ...body }, { idempotencyKey: idemKey(req), actorId: req.apiKey?.keyId });
    res.json(result);
  } catch (e) { zodNext(next, e); }
});

/** Consume points (RightAction CONSUME; requires Idempotency-Key). */
loyaltyRouter.post('/accounts/:accountId/consume', requireScope('write', 'loyalty'), async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const body = spendSchema.parse(req.body);
    const result = await loyaltyService.consumePoints(org(req), { accountId: req.params.accountId, ...body }, { idempotencyKey: idemKey(req), actorId: req.apiKey?.keyId });
    res.json(result);
  } catch (e) { zodNext(next, e); }
});

/**
 * Admin clawback (RightAction REVOKE; requires Idempotency-Key).
 * NOTE: guarded by write:loyalty today; should tighten to write:loyalty:revoke once API keys
 * carry role permissions (fix_queue T2a / T2-FOLLOWUP-1).
 */
loyaltyRouter.post('/accounts/:accountId/revoke', requireScope('write', 'loyalty'), async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const body = revokeSchema.parse(req.body);
    const result = await loyaltyService.revokePoints(org(req), { accountId: req.params.accountId, reason: body.reason }, { idempotencyKey: idemKey(req), actorId: req.apiKey?.keyId });
    res.json(result);
  } catch (e) { zodNext(next, e); }
});
