/**
 * Proof of Funds Routes — "VaultProof"
 *
 * CRUD + attest + verify endpoints for privacy-preserving proof of funds.
 */

import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as proofOfFundsService from '../services/proof-of-funds.service.js';
import { ValidationError } from '../middleware/errorHandler.js';
import { type ApiKeyRequest } from '../middleware/auth.js';

export const proofOfFundsRouter = Router();

// ============================================================================
// Validation Schemas
// ============================================================================

const InitiateProofSchema = z.object({
  partyId: z.string().uuid(),
  threshold: z.number().positive(),
  currency: z.string().min(1).max(10).default('USD'),
  provider: z.enum(['bank_api', 'exchange_api', 'custodian_api', 'defi_protocol']),
});

const SubmitAttestationSchema = z.object({
  proofId: z.string().uuid(),
  attestation: z.object({
    provider: z.string(),
    sessionId: z.string(),
    commitment: z.string(),
    proofType: z.string(),
    publicInputs: z.array(z.string()),
    timestamp: z.string(),
  }),
  zkProof: z.string().min(1),
});

// ============================================================================
// Routes
// ============================================================================

/** POST /api/v1/proofs — Initiate a proof of funds request */
proofOfFundsRouter.post('/', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) throw new ValidationError('API key required');
    const input = InitiateProofSchema.parse(req.body);
    const proof = await proofOfFundsService.initiateProof(req.apiKey.orgId, input);
    res.status(201).json({ data: proof });
  } catch (error) { next(error); }
});

/** GET /api/v1/proofs — List proofs */
proofOfFundsRouter.get('/', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) throw new ValidationError('API key required');
    const { status, partyId, limit, offset } = req.query;
    const result = await proofOfFundsService.listProofs(req.apiKey.orgId, {
      status: status as proofOfFundsService.ProofStatus | undefined,
      partyId: partyId as string | undefined,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    });
    res.json({ data: result.data, count: result.count });
  } catch (error) { next(error); }
});

/** GET /api/v1/proofs/:id — Get a single proof */
proofOfFundsRouter.get('/:id', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const proof = await proofOfFundsService.getProof(req.params.id);
    if (!proof) { res.status(404).json({ error: 'Proof not found' }); return; }
    res.json({ data: proof });
  } catch (error) { next(error); }
});

/** POST /api/v1/proofs/attest — Submit DECO attestation + ZK proof */
proofOfFundsRouter.post('/attest', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) throw new ValidationError('API key required');
    const input = SubmitAttestationSchema.parse(req.body);
    const proof = await proofOfFundsService.submitAttestation(req.apiKey.orgId, input);
    res.json({ data: proof });
  } catch (error) { next(error); }
});

/** POST /api/v1/proofs/:id/verify — Verify ZK proof and upgrade verification level */
proofOfFundsRouter.post('/:id/verify', async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) throw new ValidationError('API key required');
    const result = await proofOfFundsService.verifyProof(req.apiKey.orgId, req.params.id);
    res.json({ data: result });
  } catch (error) { next(error); }
});
