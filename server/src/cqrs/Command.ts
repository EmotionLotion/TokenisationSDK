import { createHash } from 'crypto';
import { getOrgId, getActorId, getActorType, getRequestId, getTenantContext } from '../context/TenantContext.js';
import { logger } from '../middleware/logger.js';

// ============================================================================
// Command Interface and Types
// ============================================================================

/**
 * Base Command interface
 * All commands must have a _type discriminator for routing
 */
export interface Command<TResult = void> {
  readonly _type: string;
}

/**
 * Metadata attached to command execution
 */
export interface CommandMeta {
  /** Idempotency key for exactly-once execution */
  idempotencyKey?: string;
  /** Correlation ID for tracing */
  correlationId?: string;
  /** Actor who initiated the command */
  actorId?: string;
  /** Actor type */
  actorType?: 'user' | 'api_key' | 'system' | 'webhook';
  /** Request ID for tracing */
  requestId?: string;
  /** Organization ID for tenant isolation */
  orgId?: string;
  /** Additional context */
  context?: Record<string, unknown>;
}

/**
 * Command execution result wrapper
 */
export interface CommandResult<T> {
  success: boolean;
  data?: T;
  error?: CommandError;
  meta: {
    commandType: string;
    executionTimeMs: number;
    idempotencyKey?: string;
    correlationId?: string;
    timestamp: Date;
  };
}

/**
 * Command error structure
 */
export interface CommandError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Command handler interface
 */
export interface CommandHandler<TCommand extends Command<TResult>, TResult> {
  handle(command: TCommand, meta: CommandMeta): Promise<TResult>;
}

/**
 * Command middleware for cross-cutting concerns
 */
export interface CommandMiddleware {
  before?(command: Command<unknown>, meta: CommandMeta): Promise<void>;
  after?(command: Command<unknown>, meta: CommandMeta, result: unknown): Promise<void>;
  onError?(command: Command<unknown>, meta: CommandMeta, error: Error): Promise<void>;
}

// ============================================================================
// CommandBus Implementation
// ============================================================================

/**
 * CommandBus - Central router for command execution
 *
 * Features:
 * - Type-safe command routing
 * - Idempotency support
 * - Middleware pipeline
 * - Audit logging
 * - Tenant isolation
 */
export class CommandBus {
  private handlers = new Map<string, CommandHandler<Command<unknown>, unknown>>();
  private middlewares: CommandMiddleware[] = [];
  private idempotencyStore = new Map<string, { result: unknown; timestamp: number }>();
  private readonly idempotencyTtlMs = 24 * 60 * 60 * 1000; // 24 hours

  /**
   * Register a command handler
   */
  register<TCommand extends Command<TResult>, TResult>(
    type: string,
    handler: CommandHandler<TCommand, TResult>
  ): void {
    if (this.handlers.has(type)) {
      throw new Error(`Handler for command type '${type}' is already registered`);
    }
    this.handlers.set(type, handler as CommandHandler<Command<unknown>, unknown>);
    logger.debug(`Registered command handler: ${type}`);
  }

  /**
   * Add middleware to the pipeline
   */
  use(middleware: CommandMiddleware): void {
    this.middlewares.push(middleware);
  }

  /**
   * Execute a command
   */
  async execute<TResult>(
    command: Command<TResult>,
    meta?: CommandMeta
  ): Promise<CommandResult<TResult>> {
    const startTime = Date.now();
    const enrichedMeta = this.enrichMeta(meta);

    try {
      // Check idempotency
      if (enrichedMeta.idempotencyKey) {
        const cached = this.checkIdempotency(enrichedMeta.idempotencyKey);
        if (cached !== undefined) {
          logger.debug(`Idempotency hit for key: ${enrichedMeta.idempotencyKey}`);
          return {
            success: true,
            data: cached as TResult,
            meta: {
              commandType: command._type,
              executionTimeMs: 0,
              idempotencyKey: enrichedMeta.idempotencyKey,
              correlationId: enrichedMeta.correlationId,
              timestamp: new Date(),
            },
          };
        }
      }

      // Get handler
      const handler = this.handlers.get(command._type);
      if (!handler) {
        throw new CommandNotFoundError(command._type);
      }

      // Execute middleware before hooks
      for (const middleware of this.middlewares) {
        if (middleware.before) {
          await middleware.before(command, enrichedMeta);
        }
      }

      // Execute handler
      const result = await handler.handle(command, enrichedMeta) as TResult;

      // Execute middleware after hooks
      for (const middleware of this.middlewares) {
        if (middleware.after) {
          await middleware.after(command, enrichedMeta, result);
        }
      }

      // Store idempotency result
      if (enrichedMeta.idempotencyKey) {
        this.storeIdempotencyResult(enrichedMeta.idempotencyKey, result);
      }

      const executionTimeMs = Date.now() - startTime;

      logger.info(`Command executed: ${command._type}`, {
        metadata: {
          executionTimeMs,
          correlationId: enrichedMeta.correlationId,
          actorId: enrichedMeta.actorId,
        },
      });

      return {
        success: true,
        data: result,
        meta: {
          commandType: command._type,
          executionTimeMs,
          idempotencyKey: enrichedMeta.idempotencyKey,
          correlationId: enrichedMeta.correlationId,
          timestamp: new Date(),
        },
      };
    } catch (error) {
      const executionTimeMs = Date.now() - startTime;

      // Execute middleware error hooks
      for (const middleware of this.middlewares) {
        if (middleware.onError) {
          await middleware.onError(command, enrichedMeta, error as Error);
        }
      }

      logger.error(`Command failed: ${command._type}`, {
        error: error as Error,
        metadata: {
          executionTimeMs,
          correlationId: enrichedMeta.correlationId,
        },
      });

      return {
        success: false,
        error: this.formatError(error as Error),
        meta: {
          commandType: command._type,
          executionTimeMs,
          idempotencyKey: enrichedMeta.idempotencyKey,
          correlationId: enrichedMeta.correlationId,
          timestamp: new Date(),
        },
      };
    }
  }

  /**
   * Execute a command, throwing on failure
   */
  async executeOrThrow<TResult>(
    command: Command<TResult>,
    meta?: CommandMeta
  ): Promise<TResult> {
    const result = await this.execute(command, meta);

    if (!result.success) {
      const error = new CommandExecutionError(
        result.error?.message || 'Command execution failed',
        result.error?.code || 'COMMAND_FAILED',
        result.error?.details
      );
      throw error;
    }

    return result.data as TResult;
  }

  /**
   * Check if a handler is registered for a command type
   */
  hasHandler(type: string): boolean {
    return this.handlers.has(type);
  }

  /**
   * Get all registered command types
   */
  getRegisteredTypes(): string[] {
    return Array.from(this.handlers.keys());
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private enrichMeta(meta?: CommandMeta): CommandMeta {
    // Get from tenant context if available
    const tenantCtx = getTenantContext();

    return {
      idempotencyKey: meta?.idempotencyKey,
      correlationId: meta?.correlationId || this.generateCorrelationId(),
      actorId: meta?.actorId || tenantCtx?.actorId || 'unknown',
      actorType: meta?.actorType || tenantCtx?.actorType || 'system',
      requestId: meta?.requestId || tenantCtx?.requestId,
      orgId: meta?.orgId || tenantCtx?.orgId,
      context: meta?.context || {},
    };
  }

  private generateCorrelationId(): string {
    return `cmd_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }

  private checkIdempotency(key: string): unknown | undefined {
    const entry = this.idempotencyStore.get(key);
    if (!entry) return undefined;

    // Check if expired
    if (Date.now() - entry.timestamp > this.idempotencyTtlMs) {
      this.idempotencyStore.delete(key);
      return undefined;
    }

    return entry.result;
  }

  private storeIdempotencyResult(key: string, result: unknown): void {
    this.idempotencyStore.set(key, {
      result,
      timestamp: Date.now(),
    });

    // Cleanup old entries periodically
    if (this.idempotencyStore.size > 10000) {
      this.cleanupIdempotencyStore();
    }
  }

  private cleanupIdempotencyStore(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    this.idempotencyStore.forEach((entry, key) => {
      if (now - entry.timestamp > this.idempotencyTtlMs) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach(key => this.idempotencyStore.delete(key));
  }

  private formatError(error: Error): CommandError {
    if (error instanceof CommandExecutionError) {
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
// Error Classes
// ============================================================================

export class CommandNotFoundError extends Error {
  public readonly code = 'COMMAND_NOT_FOUND';
  public readonly statusCode = 404;

  constructor(type: string) {
    super(`No handler registered for command type: ${type}`);
    this.name = 'CommandNotFoundError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export class CommandExecutionError extends Error {
  public readonly code: string;
  public readonly statusCode = 400;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    code: string = 'COMMAND_EXECUTION_ERROR',
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'CommandExecutionError';
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
export const loggingMiddleware: CommandMiddleware = {
  before: async (command, meta) => {
    logger.debug(`Executing command: ${command._type}`, {
      metadata: {
        correlationId: meta.correlationId,
        actorId: meta.actorId,
      },
    });
  },
  after: async (command, meta, result) => {
    logger.debug(`Command completed: ${command._type}`, {
      metadata: {
        correlationId: meta.correlationId,
        hasResult: result !== undefined,
      },
    });
  },
  onError: async (command, meta, error) => {
    logger.error(`Command error: ${command._type}`, {
      error,
      metadata: {
        correlationId: meta.correlationId,
      },
    });
  },
};

/**
 * Tenant validation middleware
 */
export const tenantValidationMiddleware: CommandMiddleware = {
  before: async (_command, meta) => {
    if (!meta.orgId) {
      throw new CommandExecutionError(
        'Organization context required for command execution',
        'TENANT_CONTEXT_REQUIRED'
      );
    }
  },
};

// ============================================================================
// Singleton Export
// ============================================================================

export const commandBus = new CommandBus();

// Register built-in middleware
commandBus.use(loggingMiddleware);
commandBus.use(tenantValidationMiddleware);
