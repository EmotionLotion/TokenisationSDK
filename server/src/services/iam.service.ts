import { db, schema } from '../config/database.js';
import { eq, and, desc, sql } from 'drizzle-orm';
import { randomBytes, createHash, timingSafeEqual } from 'crypto';
import { AppError, NotFoundError, ValidationError, UnauthorizedError } from '../middleware/errorHandler.js';
import * as argon2 from 'argon2';

const { orgs, users, roles, userRoles, apiKeys } = schema;

// ============================================================================
// Organization Service
// ============================================================================

export interface CreateOrgInput {
  name: string;
  slug: string;
  settings?: Record<string, unknown>;
  riskProfile?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface UpdateOrgInput {
  name?: string;
  status?: 'active' | 'suspended' | 'disabled';
  settings?: Record<string, unknown>;
  riskProfile?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export async function createOrg(input: CreateOrgInput) {
  // Check for slug uniqueness
  const existing = await db.query.orgs.findFirst({
    where: eq(orgs.slug, input.slug),
  });

  if (existing) {
    throw new ValidationError(`Organization with slug '${input.slug}' already exists`);
  }

  const [org] = await db.insert(orgs).values({
    name: input.name,
    slug: input.slug,
    settings: input.settings || {},
    riskProfile: input.riskProfile || {},
    metadata: input.metadata || {},
  }).returning();

  // Create default roles for the organization
  await createDefaultRoles(org.id);

  return org;
}

export async function getOrg(id: string) {
  const org = await db.query.orgs.findFirst({
    where: eq(orgs.id, id),
  });

  if (!org) {
    throw new NotFoundError('Organization not found');
  }

  return org;
}

export async function getOrgBySlug(slug: string) {
  const org = await db.query.orgs.findFirst({
    where: eq(orgs.slug, slug),
  });

  if (!org) {
    throw new NotFoundError('Organization not found');
  }

  return org;
}

export async function listOrgs(params: { limit?: number; offset?: number; status?: string } = {}) {
  const { limit = 50, offset = 0, status } = params;

  const conditions = [];
  if (status) {
    conditions.push(eq(orgs.status, status));
  }

  const query = db.select().from(orgs);

  if (conditions.length > 0) {
    query.where(and(...conditions));
  }

  const results = await query
    .orderBy(desc(orgs.createdAt))
    .limit(limit)
    .offset(offset);

  return results;
}

export async function updateOrg(id: string, input: UpdateOrgInput) {
  const existing = await getOrg(id);

  const [updated] = await db.update(orgs)
    .set({
      ...input,
      updatedAt: new Date(),
    })
    .where(eq(orgs.id, id))
    .returning();

  return updated;
}

// ============================================================================
// User Service
// ============================================================================

export interface CreateUserInput {
  orgId: string;
  email: string;
  name?: string;
  password?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateUserInput {
  name?: string;
  status?: 'active' | 'disabled' | 'pending';
  emailVerified?: boolean;
  metadata?: Record<string, unknown>;
}

export async function createUser(input: CreateUserInput) {
  // Verify org exists
  await getOrg(input.orgId);

  // Check for email uniqueness within org
  const existing = await db.query.users.findFirst({
    where: and(eq(users.orgId, input.orgId), eq(users.email, input.email)),
  });

  if (existing) {
    throw new ValidationError(`User with email '${input.email}' already exists in this organization`);
  }

  let passwordHash: string | null = null;
  if (input.password) {
    passwordHash = await argon2.hash(input.password);
  }

  const [user] = await db.insert(users).values({
    orgId: input.orgId,
    email: input.email,
    name: input.name,
    passwordHash,
    metadata: input.metadata || {},
  }).returning();

  return sanitizeUser(user);
}

export async function getUser(id: string, orgId?: string) {
  const conditions = [eq(users.id, id)];
  if (orgId) {
    conditions.push(eq(users.orgId, orgId));
  }

  const user = await db.query.users.findFirst({
    where: and(...conditions),
  });

  if (!user) {
    throw new NotFoundError('User not found');
  }

  return sanitizeUser(user);
}

export async function listUsers(orgId: string, params: { limit?: number; offset?: number; status?: string } = {}) {
  const { limit = 50, offset = 0, status } = params;

  const conditions = [eq(users.orgId, orgId)];
  if (status) {
    conditions.push(eq(users.status, status));
  }

  const results = await db.select()
    .from(users)
    .where(and(...conditions))
    .orderBy(desc(users.createdAt))
    .limit(limit)
    .offset(offset);

  return results.map(sanitizeUser);
}

export async function updateUser(id: string, orgId: string, input: UpdateUserInput) {
  await getUser(id, orgId);

  const [updated] = await db.update(users)
    .set({
      ...input,
      updatedAt: new Date(),
    })
    .where(and(eq(users.id, id), eq(users.orgId, orgId)))
    .returning();

  return sanitizeUser(updated);
}

export async function verifyUserPassword(email: string, password: string, orgId?: string) {
  const conditions = [eq(users.email, email)];
  if (orgId) {
    conditions.push(eq(users.orgId, orgId));
  }

  const user = await db.query.users.findFirst({
    where: and(...conditions),
  });

  if (!user || !user.passwordHash) {
    throw new UnauthorizedError('Invalid credentials');
  }

  const valid = await argon2.verify(user.passwordHash, password);
  if (!valid) {
    throw new UnauthorizedError('Invalid credentials');
  }

  // Update last login
  await db.update(users)
    .set({ lastLoginAt: new Date() })
    .where(eq(users.id, user.id));

  return sanitizeUser(user);
}

function sanitizeUser(user: typeof users.$inferSelect) {
  const { passwordHash, ...rest } = user;
  return rest;
}

// ============================================================================
// Role Service
// ============================================================================

const DEFAULT_ROLES = [
  { name: 'admin', description: 'Full access to all resources', permissions: ['*'], isSystem: true },
  { name: 'compliance_officer', description: 'Manage compliance and KYC', permissions: ['read:*', 'write:compliance', 'write:kyc'], isSystem: true },
  { name: 'ops', description: 'Operational access', permissions: ['read:*', 'write:assets', 'write:tokens'], isSystem: true },
  { name: 'developer', description: 'API access for development', permissions: ['read:*'], isSystem: true },
  { name: 'read_only', description: 'Read-only access', permissions: ['read:*'], isSystem: true },
];

export async function createDefaultRoles(orgId: string) {
  for (const role of DEFAULT_ROLES) {
    await db.insert(roles).values({
      orgId,
      name: role.name,
      description: role.description,
      permissions: role.permissions,
      isSystem: role.isSystem,
    }).onConflictDoNothing();
  }
}

export interface CreateRoleInput {
  orgId: string;
  name: string;
  description?: string;
  permissions: string[];
  metadata?: Record<string, unknown>;
}

export async function createRole(input: CreateRoleInput) {
  // Check for name uniqueness within org
  const existing = await db.query.roles.findFirst({
    where: and(eq(roles.orgId, input.orgId), eq(roles.name, input.name)),
  });

  if (existing) {
    throw new ValidationError(`Role '${input.name}' already exists in this organization`);
  }

  const [role] = await db.insert(roles).values({
    orgId: input.orgId,
    name: input.name,
    description: input.description,
    permissions: input.permissions,
    metadata: input.metadata || {},
  }).returning();

  return role;
}

export async function getRole(id: string, orgId?: string) {
  const conditions = [eq(roles.id, id)];
  if (orgId) {
    conditions.push(eq(roles.orgId, orgId));
  }

  const role = await db.query.roles.findFirst({
    where: and(...conditions),
  });

  if (!role) {
    throw new NotFoundError('Role not found');
  }

  return role;
}

export async function listRoles(orgId: string) {
  return db.select()
    .from(roles)
    .where(eq(roles.orgId, orgId))
    .orderBy(roles.name);
}

export async function assignRoleToUser(userId: string, roleId: string, grantedBy?: string) {
  // Verify user and role exist and belong to same org
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  const role = await db.query.roles.findFirst({ where: eq(roles.id, roleId) });

  if (!user) throw new NotFoundError('User not found');
  if (!role) throw new NotFoundError('Role not found');
  if (user.orgId !== role.orgId) throw new ValidationError('User and role must belong to the same organization');

  await db.insert(userRoles).values({
    userId,
    roleId,
    grantedBy,
  }).onConflictDoNothing();

  return { userId, roleId, grantedAt: new Date() };
}

export async function removeRoleFromUser(userId: string, roleId: string) {
  await db.delete(userRoles)
    .where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, roleId)));

  return { success: true };
}

export async function getUserRoles(userId: string) {
  const results = await db.select({
    role: roles,
    grantedAt: userRoles.grantedAt,
  })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(eq(userRoles.userId, userId));

  return results;
}

// ============================================================================
// API Key Service
// ============================================================================

export interface CreateApiKeyInput {
  orgId: string;
  name: string;
  scopes?: string[];
  environment?: 'test' | 'live';
  expiresAt?: Date;
  metadata?: Record<string, unknown>;
}

export interface ApiKeyWithSecret {
  id: string;
  orgId: string;
  name: string;
  key: string; // Full key (only shown once)
  keyPrefix: string;
  scopes: string[];
  environment: string;
  status: string;
  expiresAt: Date | null;
  createdAt: Date | null;
}

export async function createApiKey(input: CreateApiKeyInput): Promise<ApiKeyWithSecret> {
  const environment = input.environment || 'test';
  const prefix = environment === 'live' ? 'sk_live_' : 'sk_test_';

  // Generate a secure random key
  const keyBytes = randomBytes(32);
  const keyBase64 = keyBytes.toString('base64url');
  const fullKey = `${prefix}${keyBase64}`;

  // Hash the key for storage
  const keyHash = await argon2.hash(fullKey);

  const [apiKey] = await db.insert(apiKeys).values({
    orgId: input.orgId,
    name: input.name,
    keyPrefix: prefix,
    keyHash,
    scopes: input.scopes || ['read', 'write'],
    environment,
    expiresAt: input.expiresAt,
    metadata: input.metadata || {},
  }).returning();

  return {
    id: apiKey.id,
    orgId: apiKey.orgId,
    name: apiKey.name,
    key: fullKey, // Only returned on creation
    keyPrefix: apiKey.keyPrefix,
    scopes: apiKey.scopes,
    environment: apiKey.environment,
    status: apiKey.status,
    expiresAt: apiKey.expiresAt,
    createdAt: apiKey.createdAt,
  };
}

export async function validateApiKey(key: string): Promise<{ orgId: string; scopes: string[]; keyId: string }> {
  // Extract prefix
  const prefix = key.slice(0, 8); // 'sk_live_' or 'sk_test_'

  if (!prefix.startsWith('sk_')) {
    throw new UnauthorizedError('Invalid API key format');
  }

  // Find potential matching keys by prefix
  const potentialKeys = await db.select()
    .from(apiKeys)
    .where(and(
      eq(apiKeys.keyPrefix, prefix),
      eq(apiKeys.status, 'active')
    ));

  // Verify against each potential key (in practice, you'd use a more efficient approach)
  for (const apiKey of potentialKeys) {
    try {
      const valid = await argon2.verify(apiKey.keyHash, key);
      if (valid) {
        // Check expiration
        if (apiKey.expiresAt && new Date() > apiKey.expiresAt) {
          throw new UnauthorizedError('API key expired');
        }

        // Update last used
        await db.update(apiKeys)
          .set({ lastUsedAt: new Date() })
          .where(eq(apiKeys.id, apiKey.id));

        return {
          orgId: apiKey.orgId,
          scopes: apiKey.scopes,
          keyId: apiKey.id,
        };
      }
    } catch (e) {
      // Continue to next key if verification fails
      if (e instanceof UnauthorizedError) throw e;
    }
  }

  throw new UnauthorizedError('Invalid API key');
}

export async function listApiKeys(orgId: string, params: { limit?: number; offset?: number; status?: string } = {}) {
  const { limit = 50, offset = 0, status } = params;

  const conditions = [eq(apiKeys.orgId, orgId)];
  if (status) {
    conditions.push(eq(apiKeys.status, status));
  }

  const results = await db.select({
    id: apiKeys.id,
    orgId: apiKeys.orgId,
    name: apiKeys.name,
    keyPrefix: apiKeys.keyPrefix,
    scopes: apiKeys.scopes,
    environment: apiKeys.environment,
    status: apiKeys.status,
    lastUsedAt: apiKeys.lastUsedAt,
    expiresAt: apiKeys.expiresAt,
    createdAt: apiKeys.createdAt,
  })
    .from(apiKeys)
    .where(and(...conditions))
    .orderBy(desc(apiKeys.createdAt))
    .limit(limit)
    .offset(offset);

  return results;
}

export async function getApiKey(id: string, orgId: string) {
  const apiKey = await db.query.apiKeys.findFirst({
    where: and(eq(apiKeys.id, id), eq(apiKeys.orgId, orgId)),
  });

  if (!apiKey) {
    throw new NotFoundError('API key not found');
  }

  // Don't return the hash
  const { keyHash, ...rest } = apiKey;
  return rest;
}

export async function revokeApiKey(id: string, orgId: string) {
  const apiKey = await getApiKey(id, orgId);

  await db.update(apiKeys)
    .set({
      status: 'revoked',
      revokedAt: new Date(),
    })
    .where(eq(apiKeys.id, id));

  return { success: true, id };
}

// ============================================================================
// Permission Checking
// ============================================================================

export async function checkPermission(userId: string, requiredPermission: string): Promise<boolean> {
  const userRolesList = await getUserRoles(userId);

  for (const { role } of userRolesList) {
    for (const permission of role.permissions) {
      if (permission === '*' || permission === requiredPermission) {
        return true;
      }

      // Check wildcard permissions like 'read:*'
      if (permission.endsWith(':*')) {
        const prefix = permission.slice(0, -1); // 'read:'
        if (requiredPermission.startsWith(prefix)) {
          return true;
        }
      }
    }
  }

  return false;
}

export async function checkApiKeyScope(scopes: string[], requiredScope: string): Promise<boolean> {
  for (const scope of scopes) {
    if (scope === '*' || scope === 'admin' || scope === requiredScope) {
      return true;
    }

    // Check if the required scope is covered by a broader scope
    // e.g., 'write' covers 'write:assets'
    if (requiredScope.startsWith(`${scope}:`)) {
      return true;
    }
  }

  return false;
}
