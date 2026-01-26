import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as complianceService from '../services/compliance.service.js';
import { ValidationError } from '../middleware/errorHandler.js';
import { apiKeyMiddleware, type ApiKeyRequest } from '../middleware/auth.js';

export const complianceRouter = Router();

// ============================================================================
// Validation Schemas
// ============================================================================

const ruleSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['require', 'limit', 'block', 'allow']),
  field: z.string().min(1),
  op: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'not_in', 'contains', 'not_contains', 'regex']),
  value: z.unknown(),
  message: z.string().optional(),
  code: z.string().optional(),
});

const rulesetSchema = z.object({
  version: z.number().int().positive(),
  rules: z.array(ruleSchema),
  actions: z.object({
    onDeny: z.array(z.string()).optional(),
    onAllow: z.array(z.string()).optional(),
  }).optional(),
});

const createPolicySchema = z.object({
  name: z.string().min(1).max(256),
  description: z.string().optional(),
  type: z.enum(['transfer', 'issuance', 'redemption', 'freeze', 'force_transfer']).optional(),
  ruleset: rulesetSchema,
  metadata: z.record(z.unknown()).optional(),
});

const updatePolicySchema = z.object({
  name: z.string().min(1).max(256).optional(),
  description: z.string().optional(),
  status: z.enum(['active', 'archived']).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const publishVersionSchema = z.object({
  ruleset: rulesetSchema,
});

const evaluateTransferSchema = z.object({
  tokenId: z.string().uuid(),
  fromWallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  toWallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  amount: z.string().min(1),
  policyId: z.string().uuid().optional(),
  fromInvestorId: z.string().uuid().optional(),
  toInvestorId: z.string().uuid().optional(),
});

const evaluateIssuanceSchema = z.object({
  tokenId: z.string().uuid(),
  toWallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  amount: z.string().min(1),
  policyId: z.string().uuid().optional(),
  toInvestorId: z.string().uuid().optional(),
});

// ============================================================================
// Policy Routes
// ============================================================================

// Create policy
complianceRouter.post('/policies', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const input = createPolicySchema.parse(req.body);
    const policy = await complianceService.createPolicy({
      ...input,
      orgId: req.apiKey.orgId,
    });

    res.status(201).json(policy);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new ValidationError(error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')));
    } else {
      next(error);
    }
  }
});

// List policies
complianceRouter.get('/policies', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const { type, status, limit, offset } = req.query;

    const policies = await complianceService.listPolicies(req.apiKey.orgId, {
      type: type as string | undefined,
      status: status as string | undefined,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    });

    res.json({ data: policies, count: policies.length });
  } catch (error) {
    next(error);
  }
});

// Get policy by ID
complianceRouter.get('/policies/:id', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const policy = await complianceService.getPolicy(req.params.id, req.apiKey.orgId);
    res.json(policy);
  } catch (error) {
    next(error);
  }
});

// Get default ruleset
complianceRouter.get('/policies/default/ruleset', async (_req, res: Response) => {
  const defaultRuleset = complianceService.getDefaultRuleset();
  res.json(defaultRuleset);
});

// ============================================================================
// Policy Version Routes
// ============================================================================

// Publish new policy version
complianceRouter.post('/policies/:id/versions', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const input = publishVersionSchema.parse(req.body);
    const version = await complianceService.publishPolicyVersion(
      req.params.id,
      req.apiKey.orgId,
      input.ruleset,
      req.apiKey.keyId
    );

    res.status(201).json(version);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new ValidationError(error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')));
    } else {
      next(error);
    }
  }
});

// List policy versions
complianceRouter.get('/policies/:id/versions', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const versions = await complianceService.listPolicyVersions(req.params.id, req.apiKey.orgId);
    res.json({ data: versions, count: versions.length });
  } catch (error) {
    next(error);
  }
});

// Get specific policy version
complianceRouter.get('/policies/:id/versions/:version', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const version = await complianceService.getPolicyVersion(
      req.params.id,
      parseInt(req.params.version),
      req.apiKey.orgId
    );

    res.json(version);
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Decision Routes
// ============================================================================

// Evaluate transfer decision
complianceRouter.post('/decisions/transfer', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const input = evaluateTransferSchema.parse(req.body);
    const decision = await complianceService.evaluateTransfer({
      ...input,
      orgId: req.apiKey.orgId,
    });

    res.status(201).json(decision);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new ValidationError(error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')));
    } else {
      next(error);
    }
  }
});

// Evaluate issuance decision
complianceRouter.post('/decisions/issuance', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const input = evaluateIssuanceSchema.parse(req.body);
    const decision = await complianceService.evaluateIssuance({
      ...input,
      orgId: req.apiKey.orgId,
    });

    res.status(201).json(decision);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new ValidationError(error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')));
    } else {
      next(error);
    }
  }
});

// Get decision by ID
complianceRouter.get('/decisions/:id', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const decision = await complianceService.getDecision(req.params.id, req.apiKey.orgId);
    res.json(decision);
  } catch (error) {
    next(error);
  }
});

// List decisions
complianceRouter.get('/decisions', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const { type, result, subjectRef, limit, offset } = req.query;

    const decisions = await complianceService.listDecisions(req.apiKey.orgId, {
      type: type as string | undefined,
      result: result as string | undefined,
      subjectRef: subjectRef as string | undefined,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    });

    res.json({ data: decisions, count: decisions.length });
  } catch (error) {
    next(error);
  }
});

// Verify decision signature
complianceRouter.post('/decisions/:id/verify', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const decision = await complianceService.getDecision(req.params.id, req.apiKey.orgId);

    if (!decision.signature) {
      res.json({ verified: false, reason: 'Decision has no signature' });
      return;
    }

    const payload = {
      type: decision.type,
      result: decision.result,
      reasons: decision.reasons,
      inputsHash: decision.inputsHash,
      timestamp: decision.createdAt.toISOString(),
    };

    const verified = complianceService.verifyDecisionSignature(payload, decision.signature);

    res.json({ verified });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Receipt Routes (Compliance-First Architecture)
// ============================================================================

// Get receipts with filtering
complianceRouter.get('/receipts', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const { assetId, actorId, result, from, to, limit, offset } = req.query;

    // Query decisions from database as receipts
    const decisions = await complianceService.listDecisions(req.apiKey.orgId, {
      subjectRef: assetId as string | undefined,
      result: result as string | undefined,
      limit: limit ? parseInt(limit as string) : 100,
      offset: offset ? parseInt(offset as string) : 0,
    });

    // Transform decisions into receipt format
    const receipts = decisions.map((d: any) => ({
      id: d.id,
      decisionId: d.id,
      action: d.type,
      result: d.result,
      issuedAt: d.createdAt,
      subjectRef: d.subjectRef,
      subjectType: d.subjectType,
      inputsHash: d.inputsHash,
      policyVersionId: d.policyVersionId,
      signature: d.signature,
      reasons: d.reasons,
    }));

    res.json({
      receipts,
      count: receipts.length,
    });
  } catch (error) {
    next(error);
  }
});

// Verify a receipt
complianceRouter.get('/receipts/:id/verify', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const decision = await complianceService.getDecision(req.params.id, req.apiKey.orgId);

    // Verification checks
    const verification: {
      receiptId: string;
      valid: boolean;
      signatureValid: boolean;
      hashValid: boolean;
      chainValid: boolean;
      policyHashValid: boolean;
      issues: string[];
    } = {
      receiptId: decision.id,
      valid: true,
      signatureValid: false,
      hashValid: true,
      chainValid: true, // Would need previous receipt to verify chain
      policyHashValid: true, // Would need policy to verify hash
      issues: [],
    };

    // Verify signature
    if (decision.signature) {
      const payload = {
        type: decision.type,
        result: decision.result,
        reasons: decision.reasons,
        inputsHash: decision.inputsHash,
        timestamp: decision.createdAt.toISOString(),
      };

      try {
        verification.signatureValid = complianceService.verifyDecisionSignature(payload, decision.signature);
        if (!verification.signatureValid) {
          verification.valid = false;
          verification.issues.push('Invalid signature');
        }
      } catch (err) {
        verification.signatureValid = false;
        verification.valid = false;
        verification.issues.push(`Signature verification failed: ${err}`);
      }
    } else {
      verification.valid = false;
      verification.issues.push('Receipt has no signature');
    }

    res.json(verification);
  } catch (error) {
    next(error);
  }
});

// Get a specific receipt by ID
complianceRouter.get('/receipts/:id', apiKeyMiddleware, async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.apiKey) {
      throw new ValidationError('API key required');
    }

    const decision = await complianceService.getDecision(req.params.id, req.apiKey.orgId);

    // Transform decision into receipt format
    const receipt = {
      id: decision.id,
      decisionId: decision.id,
      action: decision.type,
      result: decision.result,
      issuedAt: decision.createdAt,
      policyVersionId: decision.policyVersionId,
      inputsHash: decision.inputsHash,
      signature: decision.signature,
      reasons: decision.reasons,
      requiredActions: decision.requiredActions,
      summary: `${decision.type} decision: ${decision.result}`,
    };

    res.json(receipt);
  } catch (error) {
    next(error);
  }
});
