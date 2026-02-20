import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as iamService from '../services/iam.service.js';
import { ValidationError } from '../middleware/errorHandler.js';
import { authMiddleware, apiKeyMiddleware, type AuthRequest, type ApiKeyRequest } from '../middleware/auth.js';
import { requireScope } from '../middleware/scopeGuard.js';

export const iamRouter = Router();

// ============================================================================
// Validation Schemas
// ============================================================================

const createOrgSchema = z.object({
  name: z.string().min(1).max(256),
  slug: z.string().min(1).max(64).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
  settings: z.record(z.unknown()).optional(),
  riskProfile: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const updateOrgSchema = z.object({
  name: z.string().min(1).max(256).optional(),
  status: z.enum(['active', 'suspended', 'disabled']).optional(),
  settings: z.record(z.unknown()).optional(),
  riskProfile: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(256).optional(),
  password: z.string().min(8).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const updateUserSchema = z.object({
  name: z.string().min(1).max(256).optional(),
  status: z.enum(['active', 'disabled', 'pending']).optional(),
  emailVerified: z.boolean().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const createRoleSchema = z.object({
  name: z.string().min(1).max(64),
  description: z.string().optional(),
  permissions: z.array(z.string()),
  metadata: z.record(z.unknown()).optional(),
});

const assignRoleSchema = z.object({
  roleId: z.string().uuid(),
});

const createApiKeySchema = z.object({
  name: z.string().min(1).max(256),
  scopes: z.array(z.string()).optional(),
  environment: z.enum(['test', 'live']).optional(),
  expiresAt: z.string().datetime().optional(),
  metadata: z.record(z.unknown()).optional(),
});

// ============================================================================
// Organization Routes
// ============================================================================

// Create organization (admin only)
iamRouter.post('/orgs', apiKeyMiddleware, requireScope('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = createOrgSchema.parse(req.body);
    const org = await iamService.createOrg(input);
    res.status(201).json(org);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new ValidationError(error.errors.map(e => e.message).join(', ')));
    } else {
      next(error);
    }
  }
});

// List organizations (admin only)
iamRouter.get('/orgs', apiKeyMiddleware, requireScope('read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { limit, offset, status } = req.query;
    const orgs = await iamService.listOrgs({
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
      status: status as string | undefined,
    });
    res.json({ data: orgs, count: orgs.length });
  } catch (error) {
    next(error);
  }
});

// Get organization by ID
iamRouter.get('/orgs/:id', apiKeyMiddleware, requireScope('read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const org = await iamService.getOrg(req.params.id);
    res.json(org);
  } catch (error) {
    next(error);
  }
});

// Update organization
iamRouter.patch('/orgs/:id', apiKeyMiddleware, requireScope('write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = updateOrgSchema.parse(req.body);
    const org = await iamService.updateOrg(req.params.id, input);
    res.json(org);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new ValidationError(error.errors.map(e => e.message).join(', ')));
    } else {
      next(error);
    }
  }
});

// ============================================================================
// User Routes (scoped to org from API key or auth context)
// ============================================================================

// Create user in org
iamRouter.post('/orgs/:orgId/users', apiKeyMiddleware, requireScope('write'), async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const orgId = req.params.orgId;

    // Verify API key belongs to this org
    if (req.apiKey && req.apiKey.orgId !== orgId) {
      throw new ValidationError('API key does not belong to this organization');
    }

    const input = createUserSchema.parse(req.body);
    const user = await iamService.createUser({ ...input, orgId });
    res.status(201).json(user);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new ValidationError(error.errors.map(e => e.message).join(', ')));
    } else {
      next(error);
    }
  }
});

// List users in org
iamRouter.get('/orgs/:orgId/users', apiKeyMiddleware, requireScope('read'), async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const orgId = req.params.orgId;

    if (req.apiKey && req.apiKey.orgId !== orgId) {
      throw new ValidationError('API key does not belong to this organization');
    }

    const { limit, offset, status } = req.query;
    const users = await iamService.listUsers(orgId, {
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
      status: status as string | undefined,
    });
    res.json({ data: users, count: users.length });
  } catch (error) {
    next(error);
  }
});

// Get user by ID
iamRouter.get('/orgs/:orgId/users/:userId', apiKeyMiddleware, requireScope('read'), async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const { orgId, userId } = req.params;

    if (req.apiKey && req.apiKey.orgId !== orgId) {
      throw new ValidationError('API key does not belong to this organization');
    }

    const user = await iamService.getUser(userId, orgId);
    res.json(user);
  } catch (error) {
    next(error);
  }
});

// Update user
iamRouter.patch('/orgs/:orgId/users/:userId', apiKeyMiddleware, requireScope('write'), async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const { orgId, userId } = req.params;

    if (req.apiKey && req.apiKey.orgId !== orgId) {
      throw new ValidationError('API key does not belong to this organization');
    }

    const input = updateUserSchema.parse(req.body);
    const user = await iamService.updateUser(userId, orgId, input);
    res.json(user);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new ValidationError(error.errors.map(e => e.message).join(', ')));
    } else {
      next(error);
    }
  }
});

// ============================================================================
// Role Routes
// ============================================================================

// Create role in org
iamRouter.post('/orgs/:orgId/roles', apiKeyMiddleware, requireScope('write'), async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const orgId = req.params.orgId;

    if (req.apiKey && req.apiKey.orgId !== orgId) {
      throw new ValidationError('API key does not belong to this organization');
    }

    const input = createRoleSchema.parse(req.body);
    const role = await iamService.createRole({ ...input, orgId });
    res.status(201).json(role);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new ValidationError(error.errors.map(e => e.message).join(', ')));
    } else {
      next(error);
    }
  }
});

// List roles in org
iamRouter.get('/orgs/:orgId/roles', apiKeyMiddleware, requireScope('read'), async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const orgId = req.params.orgId;

    if (req.apiKey && req.apiKey.orgId !== orgId) {
      throw new ValidationError('API key does not belong to this organization');
    }

    const roles = await iamService.listRoles(orgId);
    res.json({ data: roles, count: roles.length });
  } catch (error) {
    next(error);
  }
});

// Get role by ID
iamRouter.get('/orgs/:orgId/roles/:roleId', apiKeyMiddleware, requireScope('read'), async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const { orgId, roleId } = req.params;

    if (req.apiKey && req.apiKey.orgId !== orgId) {
      throw new ValidationError('API key does not belong to this organization');
    }

    const role = await iamService.getRole(roleId, orgId);
    res.json(role);
  } catch (error) {
    next(error);
  }
});

// Assign role to user
iamRouter.post('/orgs/:orgId/users/:userId/roles', apiKeyMiddleware, requireScope('write'), async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const { orgId, userId } = req.params;

    if (req.apiKey && req.apiKey.orgId !== orgId) {
      throw new ValidationError('API key does not belong to this organization');
    }

    const { roleId } = assignRoleSchema.parse(req.body);
    const result = await iamService.assignRoleToUser(userId, roleId);
    res.status(201).json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new ValidationError(error.errors.map(e => e.message).join(', ')));
    } else {
      next(error);
    }
  }
});

// Remove role from user
iamRouter.delete('/orgs/:orgId/users/:userId/roles/:roleId', apiKeyMiddleware, requireScope('admin'), async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const { orgId, userId, roleId } = req.params;

    if (req.apiKey && req.apiKey.orgId !== orgId) {
      throw new ValidationError('API key does not belong to this organization');
    }

    const result = await iamService.removeRoleFromUser(userId, roleId);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Get user roles
iamRouter.get('/orgs/:orgId/users/:userId/roles', apiKeyMiddleware, requireScope('read'), async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const { orgId, userId } = req.params;

    if (req.apiKey && req.apiKey.orgId !== orgId) {
      throw new ValidationError('API key does not belong to this organization');
    }

    // Verify user belongs to org
    await iamService.getUser(userId, orgId);

    const roles = await iamService.getUserRoles(userId);
    res.json({ data: roles, count: roles.length });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// API Key Routes
// ============================================================================

// Create API key
iamRouter.post('/orgs/:orgId/api-keys', apiKeyMiddleware, requireScope('admin'), async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const orgId = req.params.orgId;

    if (req.apiKey && req.apiKey.orgId !== orgId) {
      throw new ValidationError('API key does not belong to this organization');
    }

    // Check if caller has admin scope
    if (req.apiKey && !await iamService.checkApiKeyScope(req.apiKey.scopes, 'admin')) {
      throw new ValidationError('API key does not have admin scope required to create API keys');
    }

    const input = createApiKeySchema.parse(req.body);
    const apiKey = await iamService.createApiKey({
      ...input,
      orgId,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
    });

    // Return the key (only shown once!)
    res.status(201).json({
      ...apiKey,
      warning: 'Save this API key securely. It will not be shown again.',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new ValidationError(error.errors.map(e => e.message).join(', ')));
    } else {
      next(error);
    }
  }
});

// List API keys
iamRouter.get('/orgs/:orgId/api-keys', apiKeyMiddleware, requireScope('read'), async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const orgId = req.params.orgId;

    if (req.apiKey && req.apiKey.orgId !== orgId) {
      throw new ValidationError('API key does not belong to this organization');
    }

    const { limit, offset, status } = req.query;
    const keys = await iamService.listApiKeys(orgId, {
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
      status: status as string | undefined,
    });
    res.json({ data: keys, count: keys.length });
  } catch (error) {
    next(error);
  }
});

// Get API key by ID
iamRouter.get('/orgs/:orgId/api-keys/:keyId', apiKeyMiddleware, requireScope('read'), async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const { orgId, keyId } = req.params;

    if (req.apiKey && req.apiKey.orgId !== orgId) {
      throw new ValidationError('API key does not belong to this organization');
    }

    const key = await iamService.getApiKey(keyId, orgId);
    res.json(key);
  } catch (error) {
    next(error);
  }
});

// Revoke API key
iamRouter.delete('/orgs/:orgId/api-keys/:keyId', apiKeyMiddleware, requireScope('admin'), async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const { orgId, keyId } = req.params;

    if (req.apiKey && req.apiKey.orgId !== orgId) {
      throw new ValidationError('API key does not belong to this organization');
    }

    // Check if caller has admin scope
    if (req.apiKey && !await iamService.checkApiKeyScope(req.apiKey.scopes, 'admin')) {
      throw new ValidationError('API key does not have admin scope required to revoke API keys');
    }

    const result = await iamService.revokeApiKey(keyId, orgId);
    res.json(result);
  } catch (error) {
    next(error);
  }
});
