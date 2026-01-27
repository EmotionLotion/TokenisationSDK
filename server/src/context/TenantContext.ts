import { AsyncLocalStorage } from 'async_hooks';

// ============================================================================
// TenantContext - Enterprise-grade multi-tenant isolation
// ============================================================================

/**
 * Actor types for audit and access control
 */
export type ActorType = 'user' | 'api_key' | 'system' | 'webhook';

/**
 * Parameters for creating a TenantContext
 */
export interface TenantContextParams {
  orgId: string;
  actorId: string;
  actorType: ActorType;
  requestId: string;
  permissions?: string[];
  metadata?: Record<string, unknown>;
}

/**
 * TenantContext - Immutable context for multi-tenant operations
 *
 * This class ensures:
 * 1. orgId is ALWAYS present and validated (never undefined)
 * 2. All operations are scoped to the correct tenant
 * 3. Actor information is tracked for audit trails
 * 4. Context propagates through async operations via AsyncLocalStorage
 */
export class TenantContext {
  /**
   * Organization ID - REQUIRED, never undefined
   */
  public readonly orgId: string;

  /**
   * Actor identifier (user ID, API key ID, or 'system')
   */
  public readonly actorId: string;

  /**
   * Type of actor making the request
   */
  public readonly actorType: ActorType;

  /**
   * Unique request identifier for tracing
   */
  public readonly requestId: string;

  /**
   * Permissions granted to this actor
   */
  public readonly permissions: ReadonlyArray<string>;

  /**
   * Additional metadata for the context
   */
  public readonly metadata: Readonly<Record<string, unknown>>;

  /**
   * Timestamp when this context was created
   */
  public readonly createdAt: number;

  private constructor(params: TenantContextParams) {
    // Validate orgId is present and non-empty
    if (!params.orgId || typeof params.orgId !== 'string' || params.orgId.trim() === '') {
      throw new TenantContextError(
        'TenantContext requires a valid orgId',
        'TENANT_ORG_ID_REQUIRED'
      );
    }

    // Validate actorId
    if (!params.actorId || typeof params.actorId !== 'string') {
      throw new TenantContextError(
        'TenantContext requires a valid actorId',
        'TENANT_ACTOR_ID_REQUIRED'
      );
    }

    // Validate requestId
    if (!params.requestId || typeof params.requestId !== 'string') {
      throw new TenantContextError(
        'TenantContext requires a valid requestId',
        'TENANT_REQUEST_ID_REQUIRED'
      );
    }

    this.orgId = params.orgId;
    this.actorId = params.actorId;
    this.actorType = params.actorType;
    this.requestId = params.requestId;
    this.permissions = Object.freeze([...(params.permissions || [])]);
    this.metadata = Object.freeze({ ...(params.metadata || {}) });
    this.createdAt = Date.now();
  }

  /**
   * Create a new TenantContext with validation
   */
  static create(params: TenantContextParams): TenantContext {
    return new TenantContext(params);
  }

  /**
   * Create a system context for background operations
   *
   * @param orgId - The organization ID to operate within
   * @param operationId - Unique identifier for the operation
   * @param permissions - Optional permissions for the system context
   */
  static system(
    orgId: string,
    operationId: string,
    permissions: string[] = ['*']
  ): TenantContext {
    return new TenantContext({
      orgId,
      actorId: 'system',
      actorType: 'system',
      requestId: operationId,
      permissions,
      metadata: { isSystemContext: true },
    });
  }

  /**
   * Create a webhook context for webhook handlers
   */
  static webhook(
    orgId: string,
    webhookId: string,
    requestId: string
  ): TenantContext {
    return new TenantContext({
      orgId,
      actorId: webhookId,
      actorType: 'webhook',
      requestId,
      permissions: ['webhook:execute'],
      metadata: { isWebhookContext: true },
    });
  }

  /**
   * Check if the actor has a specific permission
   */
  hasPermission(permission: string): boolean {
    if (this.permissions.includes('*')) return true;
    return this.permissions.includes(permission);
  }

  /**
   * Check if the actor has all specified permissions
   */
  hasAllPermissions(permissions: string[]): boolean {
    return permissions.every(p => this.hasPermission(p));
  }

  /**
   * Check if the actor has any of the specified permissions
   */
  hasAnyPermission(permissions: string[]): boolean {
    return permissions.some(p => this.hasPermission(p));
  }

  /**
   * Create a new context with additional metadata
   */
  withMetadata(metadata: Record<string, unknown>): TenantContext {
    return new TenantContext({
      orgId: this.orgId,
      actorId: this.actorId,
      actorType: this.actorType,
      requestId: this.requestId,
      permissions: [...this.permissions],
      metadata: { ...this.metadata, ...metadata },
    });
  }

  /**
   * Convert to a plain object for serialization
   */
  toJSON(): TenantContextParams & { createdAt: number } {
    return {
      orgId: this.orgId,
      actorId: this.actorId,
      actorType: this.actorType,
      requestId: this.requestId,
      permissions: [...this.permissions],
      metadata: { ...this.metadata },
      createdAt: this.createdAt,
    };
  }

  /**
   * Get correlation IDs for logging
   */
  getCorrelationIds(): {
    requestId: string;
    orgId: string;
    actorId: string;
    actorType: ActorType;
  } {
    return {
      requestId: this.requestId,
      orgId: this.orgId,
      actorId: this.actorId,
      actorType: this.actorType,
    };
  }
}

// ============================================================================
// AsyncLocalStorage for Context Propagation
// ============================================================================

const tenantStorage = new AsyncLocalStorage<TenantContext>();

/**
 * Run a function within a tenant context
 *
 * @example
 * ```typescript
 * const ctx = TenantContext.create({ orgId: 'org_123', ... });
 * const result = await runWithTenant(ctx, async () => {
 *   // getOrgId() will return 'org_123' here
 *   return await someAsyncOperation();
 * });
 * ```
 */
export function runWithTenant<T>(ctx: TenantContext, fn: () => T): T {
  return tenantStorage.run(ctx, fn);
}

/**
 * Get the current TenantContext, or undefined if not in a tenant context
 */
export function getTenantContext(): TenantContext | undefined {
  return tenantStorage.getStore();
}

/**
 * Get the current TenantContext, throwing if not available
 *
 * @throws TenantContextError if no tenant context is available
 */
export function requireTenantContext(): TenantContext {
  const ctx = tenantStorage.getStore();
  if (!ctx) {
    throw new TenantContextError(
      'No tenant context available. This operation requires a tenant context.',
      'TENANT_CONTEXT_REQUIRED'
    );
  }
  return ctx;
}

/**
 * Get the current organization ID from the tenant context
 *
 * This is the primary way to get the orgId for tenant-scoped operations.
 * It will NEVER return undefined - it throws if no context is available.
 *
 * @throws TenantContextError if no tenant context is available
 */
export function getOrgId(): string {
  return requireTenantContext().orgId;
}

/**
 * Get the current actor ID from the tenant context
 *
 * @throws TenantContextError if no tenant context is available
 */
export function getActorId(): string {
  return requireTenantContext().actorId;
}

/**
 * Get the current actor type from the tenant context
 *
 * @throws TenantContextError if no tenant context is available
 */
export function getActorType(): ActorType {
  return requireTenantContext().actorType;
}

/**
 * Get the current request ID from the tenant context
 *
 * @throws TenantContextError if no tenant context is available
 */
export function getRequestId(): string {
  return requireTenantContext().requestId;
}

/**
 * Check if the current actor has a permission
 *
 * @throws TenantContextError if no tenant context is available
 */
export function hasPermission(permission: string): boolean {
  return requireTenantContext().hasPermission(permission);
}

/**
 * Require a permission, throwing if not available
 *
 * @throws TenantContextError if no tenant context is available
 * @throws PermissionDeniedError if the permission is not granted
 */
export function requirePermission(permission: string): void {
  const ctx = requireTenantContext();
  if (!ctx.hasPermission(permission)) {
    throw new PermissionDeniedError(
      `Permission '${permission}' is required for this operation`,
      permission
    );
  }
}

// ============================================================================
// Error Classes
// ============================================================================

/**
 * Error thrown when tenant context is invalid or missing
 */
export class TenantContextError extends Error {
  public readonly code: string;
  public readonly statusCode: number = 403;

  constructor(message: string, code: string = 'TENANT_CONTEXT_ERROR') {
    super(message);
    this.name = 'TenantContextError';
    this.code = code;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Error thrown when a required permission is missing
 */
export class PermissionDeniedError extends Error {
  public readonly code: string = 'PERMISSION_DENIED';
  public readonly statusCode: number = 403;
  public readonly requiredPermission: string;

  constructor(message: string, requiredPermission: string) {
    super(message);
    this.name = 'PermissionDeniedError';
    this.requiredPermission = requiredPermission;
    Error.captureStackTrace(this, this.constructor);
  }
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Type guard to check if a value is a valid TenantContext
 */
export function isTenantContext(value: unknown): value is TenantContext {
  return value instanceof TenantContext;
}

/**
 * Extract orgId from various sources, with TenantContext as the primary source
 */
export function extractOrgId(
  sources: {
    context?: TenantContext;
    request?: { orgId?: string };
    params?: { orgId?: string };
  }
): string {
  // Priority: TenantContext > request > params
  if (sources.context) {
    return sources.context.orgId;
  }

  // Try to get from AsyncLocalStorage
  const ctx = getTenantContext();
  if (ctx) {
    return ctx.orgId;
  }

  // Fallback to request or params
  const orgId = sources.request?.orgId || sources.params?.orgId;
  if (!orgId) {
    throw new TenantContextError(
      'Organization ID could not be determined from any source',
      'ORG_ID_NOT_FOUND'
    );
  }

  return orgId;
}
