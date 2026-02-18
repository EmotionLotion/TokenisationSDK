/**
 * Travel Shield Routes — "TravelShield"
 *
 * CRUD + claim + rebook endpoints for parametric travel insurance.
 */

import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as travelShieldService from '../services/travel-shield.service.js';
import { ValidationError } from '../middleware/errorHandler.js';
import { type ApiKeyRequest } from '../middleware/auth.js';

export const travelShieldRouter = Router();

// ============================================================================
// Validation Schemas
// ============================================================================

const CreatePolicySchema = z.object({
  partyId: z.string().uuid(),
  ticketId: z.string().uuid(),
  flightNumber: z.string().min(2).max(16),
  departureDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  coverage: z.enum(['basic', 'standard', 'premium']),
  premium: z.number().positive(),
});

const TriggerClaimSchema = z.object({
  policyId: z.string().uuid(),
  disruptionType: z.enum(['delay', 'cancellation', 'diversion', 'missed_connection']),
  severity: z.number().min(0).max(10),
});

const AlternativeOptionSchema = z.object({
  flightNumber: z.string(),
  departureTime: z.string(),
  arrivalTime: z.string(),
  price: z.number(),
  airline: z.string(),
  score: z.number(),
  reasoning: z.string(),
});

const ExecuteRebookingSchema = z.object({
  policyId: z.string().uuid(),
  alternatives: z.array(AlternativeOptionSchema),
  selectedOption: AlternativeOptionSchema,
});

// ============================================================================
// Routes
// ============================================================================

/** POST /api/v1/policies — Create a travel insurance policy */
travelShieldRouter.post('/', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) throw new ValidationError('API key required');
    const input = CreatePolicySchema.parse(req.body);
    const policy = await travelShieldService.createPolicy(req.apiKey.orgId, input);
    res.status(201).json({ data: policy });
  } catch (error) { next(error); }
});

/** GET /api/v1/policies — List policies */
travelShieldRouter.get('/', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) throw new ValidationError('API key required');
    const { status, partyId, flightNumber, limit, offset } = req.query;
    const result = await travelShieldService.listPolicies(req.apiKey.orgId, {
      status: status as travelShieldService.PolicyStatus | undefined,
      partyId: partyId as string | undefined,
      flightNumber: flightNumber as string | undefined,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    });
    res.json({ data: result.data, count: result.count });
  } catch (error) { next(error); }
});

/** GET /api/v1/policies/:id — Get a single policy */
travelShieldRouter.get('/:id', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const policy = await travelShieldService.getPolicy(req.params.id);
    if (!policy) { res.status(404).json({ error: 'Policy not found' }); return; }
    res.json({ data: policy });
  } catch (error) { next(error); }
});

/** POST /api/v1/policies/claim — Trigger a claim */
travelShieldRouter.post('/claim', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) throw new ValidationError('API key required');
    const input = TriggerClaimSchema.parse(req.body);
    const policy = await travelShieldService.triggerClaim(req.apiKey.orgId, input);
    res.json({ data: policy });
  } catch (error) { next(error); }
});

/** POST /api/v1/policies/rebook — Execute AI-powered rebooking */
travelShieldRouter.post('/rebook', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) throw new ValidationError('API key required');
    const input = ExecuteRebookingSchema.parse(req.body);
    const policy = await travelShieldService.executeRebooking(req.apiKey.orgId, input);
    res.json({ data: policy });
  } catch (error) { next(error); }
});
