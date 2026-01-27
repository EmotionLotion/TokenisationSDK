import { getTenantContext } from '../context/TenantContext.js';
import { logger } from '../middleware/logger.js';

// ============================================================================
// Query Interface and Types
// ============================================================================

/**
 * Base Query interface
 * All queries must have a _type discriminator for routing
 */
export interface Query<TResult> {
  readonly _type: string;
}

/**
 * Query execution options
 */
export interface QueryOptions {
  /** Enable caching */
  cache?: CacheOptions;
  /** Correlation ID for tracing */
  correlationId?: string;
  /** Organization ID override */
  orgId?: string;
  /** Skip tenant filter (requires permission) */
  skipTenantFilter?: boolean;
}

/**
 * Cache configuration options
 */
export interface CacheOptions {
  /** Cache TTL in seconds */
  ttlSeconds: number;
  /** Cache key prefix */
  keyPrefix?: string;
  /** Cache tags for invalidation */
  tags?: string[];
  /** Force refresh (bypass cache) */
  forceRefresh?: boolean;
}

/**
 * Query execution result wrapper
 */
export interface QueryResult<T> {
  success: boolean;
  data?: T;
  error?: QueryError;
  meta: {
    queryType: string;
    executionTimeMs: number;
    cached: boolean;
    cacheKey?: string;
    correlationId?: string;
    timestamp: Date;
  };
}

/**
 * Query error structure
 */
export interface QueryError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Query handler interface
 */
export interface QueryHandler<TQuery extends Query<TResult>, TResult> {
  handle(query: TQuery, options: QueryOptions): Promise<TResult>;
}

/**
 * Query middleware for cross-cutting concerns
 */
export interface QueryMiddleware {
  before?(query: Query<unknown>, options: QueryOptions): Promise<void>;
  after?(query: Query<unknown>, options: QueryOptions, result: unknown): Promise<void>;
  onError?(query: Query<unknown>, options: QueryOptions, error: Error): Promise<void>;
}

// ============================================================================
// QueryBus Implementation
// ============================================================================

/**
 * QueryBus - Central router for query execution
 *
 * Features:
 * - Type-safe query routing
 * - In-memory caching with TTL
 * - Middleware pipeline
 * - Tenant isolation
 * - Performance metrics
 */
export class QueryBus {
  private handlers = new Map<string, QueryHandler<Query<unknown>, unknown>>();
  private middlewares: QueryMiddleware[] = [];
  private cache = new Map<string, CacheEntry>();
  private readonly defaultCacheTtlSeconds = 60;

  /**
   * Register a query handler
   */
  register<TQuery extends Query<TResult>, TResult>(
    type: string,
    handler: QueryHandler<TQuery, TResult>
  ): void {
    if (this.handlers.has(type)) {
      throw new Error(`Handler for query type '${type}' is already registered`);
    }
    this.handlers.set(type, handler as QueryHandler<Query<unknown>, unknown>);
    logger.debug(`Registered query handler: ${type}`);
  }

  /**
   * Add middleware to the pipeline
   */
  use(middleware: QueryMiddleware): void {
    this.middlewares.push(middleware);
  }

  /**
   * Execute a query
   */
  async execute<TResult>(
    query: Query<TResult>,
    options?: QueryOptions
  ): Promise<QueryResult<TResult>> {
    const startTime = Date.now();
    const enrichedOptions = this.enrichOptions(options);
    const cacheKey = options?.cache
      ? this.generateCacheKey(query, enrichedOptions)
      : undefined;

    try {
      // Check cache
      if (cacheKey && !options?.cache?.forceRefresh) {
        const cached = this.getFromCache(cacheKey);
        if (cached !== undefined) {
          logger.debug(`Cache hit for query: ${query._type}`, {
            metadata: { cacheKey },
          });
          return {
            success: true,
            data: cached as TResult,
            meta: {
              queryType: query._type,
              executionTimeMs: 0,
              cached: true,
              cacheKey,
              correlationId: enrichedOptions.correlationId,
              timestamp: new Date(),
            },
          };
        }
      }

      // Get handler
      const handler = this.handlers.get(query._type);
      if (!handler) {
        throw new QueryNotFoundError(query._type);
      }

      // Execute middleware before hooks
      for (const middleware of this.middlewares) {
        if (middleware.before) {
          await middleware.before(query, enrichedOptions);
        }
      }

      // Execute handler
      const result = await handler.handle(query, enrichedOptions) as TResult;

      // Execute middleware after hooks
      for (const middleware of this.middlewares) {
        if (middleware.after) {
          await middleware.after(query, enrichedOptions, result);
        }
      }

      // Store in cache
      if (cacheKey && options?.cache?.ttlSeconds) {
        this.setInCache(cacheKey, result, options.cache);
      }

      const executionTimeMs = Date.now() - startTime;

      logger.debug(`Query executed: ${query._type}`, {
        metadata: {
          executionTimeMs,
          correlationId: enrichedOptions.correlationId,
        },
      });

      return {
        success: true,
        data: result,
        meta: {
          queryType: query._type,
          executionTimeMs,
          cached: false,
          cacheKey,
          correlationId: enrichedOptions.correlationId,
          timestamp: new Date(),
        },
      };
    } catch (error) {
      const executionTimeMs = Date.now() - startTime;

      // Execute middleware error hooks
      for (const middleware of this.middlewares) {
        if (middleware.onError) {
          await middleware.onError(query, enrichedOptions, error as Error);
        }
      }

      logger.error(`Query failed: ${query._type}`, {
        error: error as Error,
        metadata: {
          executionTimeMs,
          correlationId: enrichedOptions.correlationId,
        },
      });

      return {
        success: false,
        error: this.formatError(error as Error),
        meta: {
          queryType: query._type,
          executionTimeMs,
          cached: false,
          correlationId: enrichedOptions.correlationId,
          timestamp: new Date(),
        },
      };
    }
  }

  /**
   * Execute a query, throwing on failure
   */
  async executeOrThrow<TResult>(
    query: Query<TResult>,
    options?: QueryOptions
  ): Promise<TResult> {
    const result = await this.execute(query, options);

    if (!result.success) {
      const error = new QueryExecutionError(
        result.error?.message || 'Query execution failed',
        result.error?.code || 'QUERY_FAILED',
        result.error?.details
      );
      throw error;
    }

    return result.data as TResult;
  }

  /**
   * Invalidate cache entries by tag
   */
  invalidateByTag(tag: string): number {
    let invalidated = 0;
    const keysToDelete: string[] = [];

    this.cache.forEach((entry, key) => {
      if (entry.tags?.includes(tag)) {
        keysToDelete.push(key);
        invalidated++;
      }
    });

    keysToDelete.forEach(key => this.cache.delete(key));
    logger.debug(`Cache invalidated by tag: ${tag}`, {
      metadata: { invalidatedCount: invalidated },
    });

    return invalidated;
  }

  /**
   * Invalidate cache entries by key prefix
   */
  invalidateByPrefix(prefix: string): number {
    let invalidated = 0;
    const keysToDelete: string[] = [];

    this.cache.forEach((_, key) => {
      if (key.startsWith(prefix)) {
        keysToDelete.push(key);
        invalidated++;
      }
    });

    keysToDelete.forEach(key => this.cache.delete(key));
    logger.debug(`Cache invalidated by prefix: ${prefix}`, {
      metadata: { invalidatedCount: invalidated },
    });

    return invalidated;
  }

  /**
   * Clear entire cache
   */
  clearCache(): void {
    const size = this.cache.size;
    this.cache.clear();
    logger.info(`Cache cleared`, { metadata: { entriesCleared: size } });
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): CacheStats {
    let validEntries = 0;
    let expiredEntries = 0;
    const now = Date.now();

    this.cache.forEach(entry => {
      if (entry.expiresAt > now) {
        validEntries++;
      } else {
        expiredEntries++;
      }
    });

    return {
      totalEntries: this.cache.size,
      validEntries,
      expiredEntries,
    };
  }

  /**
   * Check if a handler is registered for a query type
   */
  hasHandler(type: string): boolean {
    return this.handlers.has(type);
  }

  /**
   * Get all registered query types
   */
  getRegisteredTypes(): string[] {
    return Array.from(this.handlers.keys());
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private enrichOptions(options?: QueryOptions): QueryOptions {
    const tenantCtx = getTenantContext();

    return {
      cache: options?.cache,
      correlationId:
        options?.correlationId || this.generateCorrelationId(),
      orgId: options?.orgId || tenantCtx?.orgId,
      skipTenantFilter: options?.skipTenantFilter || false,
    };
  }

  private generateCorrelationId(): string {
    return `qry_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }

  private generateCacheKey(
    query: Query<unknown>,
    options: QueryOptions
  ): string {
    const prefix = options.cache?.keyPrefix || query._type;
    const orgId = options.orgId || 'global';
    const queryHash = this.hashObject(query);
    return `${prefix}:${orgId}:${queryHash}`;
  }

  private hashObject(obj: unknown): string {
    const str = JSON.stringify(obj, Object.keys(obj as object).sort());
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  private getFromCache(key: string): unknown | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.value;
  }

  private setInCache(key: string, value: unknown, options: CacheOptions): void {
    const ttlMs = (options.ttlSeconds || this.defaultCacheTtlSeconds) * 1000;

    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
      tags: options.tags,
    });

    // Cleanup old entries periodically
    if (this.cache.size > 10000) {
      this.cleanupCache();
    }
  }

  private cleanupCache(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    this.cache.forEach((entry, key) => {
      if (entry.expiresAt < now) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach(key => this.cache.delete(key));
    logger.debug(`Cache cleanup completed`, {
      metadata: { removed: keysToDelete.length },
    });
  }

  private formatError(error: Error): QueryError {
    if (error instanceof QueryExecutionError) {
      return {
        code: error.code,
        message: error.message,
        details: error.details,
      };
    }

    return {
      code: 'INTERNAL_ERROR',
      message: error.message,
      details: { stack: error.stack },
    };
  }
}

// ============================================================================
// Cache Types
// ============================================================================

interface CacheEntry {
  value: unknown;
  expiresAt: number;
  tags?: string[];
}

interface CacheStats {
  totalEntries: number;
  validEntries: number;
  expiredEntries: number;
}

// ============================================================================
// Error Classes
// ============================================================================

export class QueryNotFoundError extends Error {
  public readonly code = 'QUERY_NOT_FOUND';
  public readonly statusCode = 404;

  constructor(type: string) {
    super(`No handler registered for query type: ${type}`);
    this.name = 'QueryNotFoundError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export class QueryExecutionError extends Error {
  public readonly code: string;
  public readonly statusCode = 400;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    code: string = 'QUERY_EXECUTION_ERROR',
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'QueryExecutionError';
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

// ============================================================================
// Built-in Middleware
// ============================================================================

/**
 * Logging middleware
 */
export const queryLoggingMiddleware: QueryMiddleware = {
  before: async (query, options) => {
    logger.debug(`Executing query: ${query._type}`, {
      metadata: {
        correlationId: options.correlationId,
      },
    });
  },
  after: async (query, options, result) => {
    logger.debug(`Query completed: ${query._type}`, {
      metadata: {
        correlationId: options.correlationId,
        hasResult: result !== undefined,
      },
    });
  },
  onError: async (query, options, error) => {
    logger.error(`Query error: ${query._type}`, {
      error,
      metadata: {
        correlationId: options.correlationId,
      },
    });
  },
};

/**
 * Performance monitoring middleware
 */
export const performanceMiddleware: QueryMiddleware = {
  after: async (query, options, _result) => {
    // Could integrate with metrics system here
    logger.debug(`Query performance tracked: ${query._type}`, {
      metadata: {
        correlationId: options.correlationId,
      },
    });
  },
};

// ============================================================================
// Singleton Export
// ============================================================================

export const queryBus = new QueryBus();

// Register built-in middleware
queryBus.use(queryLoggingMiddleware);
