import { SQL, sql, eq, and, or, desc, asc, like, isNull, isNotNull, inArray } from 'drizzle-orm';
import { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import { getOrgId, getTenantContext, TenantContextError } from '../context/TenantContext.js';

// ============================================================================
// BaseRepository - Tenant-aware repository base class
// ============================================================================

/**
 * Options for repository queries
 */
export interface QueryOptions {
  /** Skip tenant filtering (use with caution - requires explicit permission) */
  skipTenantFilter?: boolean;
  /** Include soft-deleted records */
  includeDeleted?: boolean;
  /** Pagination limit */
  limit?: number;
  /** Pagination offset */
  offset?: number;
  /** Order by specification */
  orderBy?: OrderBySpec[];
}

/**
 * Order by specification
 */
export interface OrderBySpec {
  column: string;
  direction: 'asc' | 'desc';
}

/**
 * Pagination result wrapper
 */
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

/**
 * Audit metadata added to all operations
 */
export interface AuditMetadata {
  orgId: string;
  actorId: string;
  actorType: string;
  requestId: string;
  timestamp: Date;
}

/**
 * TenantAwareRepository - Base class for tenant-scoped database operations
 *
 * This class provides:
 * 1. Automatic orgId injection into all queries
 * 2. Tenant isolation enforcement
 * 3. Audit trail support
 * 4. Common query patterns
 *
 * @example
 * ```typescript
 * class AssetRepository extends TenantAwareRepository<typeof assets> {
 *   constructor(db: DbClient) {
 *     super(db, assets, assets.orgId);
 *   }
 *
 *   async findByState(state: string) {
 *     return this.findMany([eq(assets.state, state)]);
 *   }
 * }
 * ```
 */
export abstract class TenantAwareRepository<TTable extends PgTable> {
  constructor(
    protected readonly db: unknown, // DrizzleClient - keep generic for flexibility
    protected readonly table: TTable,
    protected readonly orgIdColumn: PgColumn
  ) {}

  /**
   * Get the current organization ID from tenant context
   * This will NEVER return undefined - it throws if context is missing
   */
  protected getCurrentOrgId(): string {
    return getOrgId();
  }

  /**
   * Build conditions with automatic tenant filter
   *
   * @param conditions - Additional conditions to apply
   * @param options - Query options
   * @returns Combined conditions including tenant filter
   */
  protected withTenantFilter(
    conditions?: SQL[],
    options?: QueryOptions
  ): SQL[] {
    const result: SQL[] = [];

    // Add tenant filter unless explicitly skipped (with validation)
    if (!options?.skipTenantFilter) {
      const orgId = this.getCurrentOrgId();
      result.push(eq(this.orgIdColumn, orgId));
    } else {
      // Validate that skipping tenant filter is intentional
      const ctx = getTenantContext();
      if (ctx && !ctx.hasPermission('tenant:bypass')) {
        throw new TenantContextError(
          'Cannot skip tenant filter without tenant:bypass permission',
          'TENANT_BYPASS_DENIED'
        );
      }
    }

    // Add additional conditions
    if (conditions && conditions.length > 0) {
      result.push(...conditions);
    }

    return result;
  }

  /**
   * Build a WHERE clause from conditions
   */
  protected buildWhere(conditions: SQL[]): SQL | undefined {
    if (conditions.length === 0) return undefined;
    if (conditions.length === 1) return conditions[0];
    return and(...conditions);
  }

  /**
   * Get audit metadata for the current operation
   */
  protected getAuditMetadata(): AuditMetadata {
    const ctx = getTenantContext();
    if (!ctx) {
      throw new TenantContextError(
        'Audit metadata requires tenant context',
        'AUDIT_CONTEXT_REQUIRED'
      );
    }
    return {
      orgId: ctx.orgId,
      actorId: ctx.actorId,
      actorType: ctx.actorType,
      requestId: ctx.requestId,
      timestamp: new Date(),
    };
  }

  /**
   * Validate that a record belongs to the current tenant
   *
   * @param record - Record to validate
   * @param orgIdField - Field name containing the orgId
   * @throws TenantContextError if the record doesn't belong to the current tenant
   */
  protected validateTenantOwnership(
    record: Record<string, unknown>,
    orgIdField: string = 'orgId'
  ): void {
    const currentOrgId = this.getCurrentOrgId();
    const recordOrgId = record[orgIdField];

    if (recordOrgId !== currentOrgId) {
      throw new TenantContextError(
        'Access denied: record does not belong to current tenant',
        'TENANT_ACCESS_DENIED'
      );
    }
  }
}

/**
 * CRUDRepository - Extended base with common CRUD patterns
 *
 * Provides standard create, read, update, delete operations
 * with automatic tenant isolation.
 */
export abstract class CRUDRepository<
  TTable extends PgTable,
  TInsert,
  TSelect,
  TUpdate
> extends TenantAwareRepository<TTable> {
  protected readonly idColumn: PgColumn;
  protected readonly statusColumn?: PgColumn;

  constructor(
    db: unknown,
    table: TTable,
    orgIdColumn: PgColumn,
    idColumn: PgColumn,
    statusColumn?: PgColumn
  ) {
    super(db, table, orgIdColumn);
    this.idColumn = idColumn;
    this.statusColumn = statusColumn;
  }

  /**
   * Prepare insert data with orgId
   */
  protected prepareInsert(data: Omit<TInsert, 'orgId'>): TInsert {
    const orgId = this.getCurrentOrgId();
    return {
      ...data,
      orgId,
    } as TInsert;
  }

  /**
   * Prepare update data with audit trail
   */
  protected prepareUpdate(data: Partial<TUpdate>): Partial<TUpdate> & { updatedAt: Date } {
    return {
      ...data,
      updatedAt: new Date(),
    };
  }

  /**
   * Build pagination metadata
   */
  protected buildPaginationResult<T>(
    data: T[],
    total: number,
    options?: QueryOptions
  ): PaginatedResult<T> {
    const limit = options?.limit || 50;
    const offset = options?.offset || 0;
    return {
      data,
      total,
      limit,
      offset,
      hasMore: offset + data.length < total,
    };
  }
}

// ============================================================================
// SQL Builder Helpers
// ============================================================================

/**
 * SQL condition builders for common patterns
 */
export const SqlBuilder = {
  /**
   * Build equals condition
   */
  equals: <T>(column: PgColumn, value: T): SQL => eq(column, value),

  /**
   * Build in-array condition
   */
  in: <T>(column: PgColumn, values: T[]): SQL => inArray(column, values),

  /**
   * Build like condition (case-sensitive)
   */
  contains: (column: PgColumn, value: string): SQL => like(column, `%${value}%`),

  /**
   * Build starts with condition
   */
  startsWith: (column: PgColumn, value: string): SQL => like(column, `${value}%`),

  /**
   * Build is null condition
   */
  isNull: (column: PgColumn): SQL => isNull(column),

  /**
   * Build is not null condition
   */
  isNotNull: (column: PgColumn): SQL => isNotNull(column),

  /**
   * Combine conditions with AND
   */
  and: (...conditions: SQL[]): SQL | undefined => {
    if (conditions.length === 0) return undefined;
    if (conditions.length === 1) return conditions[0];
    return and(...conditions);
  },

  /**
   * Combine conditions with OR
   */
  or: (...conditions: SQL[]): SQL | undefined => {
    if (conditions.length === 0) return undefined;
    if (conditions.length === 1) return conditions[0];
    return or(...conditions);
  },

  /**
   * Build order by clause
   */
  orderBy: (column: PgColumn, direction: 'asc' | 'desc' = 'desc'): SQL => {
    return direction === 'asc' ? asc(column) : desc(column);
  },
};

// ============================================================================
// Type Utilities
// ============================================================================

/**
 * Make all fields optional except specified required fields
 */
export type PartialExcept<T, K extends keyof T> = Partial<Omit<T, K>> & Pick<T, K>;
