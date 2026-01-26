/**
 * Hook System
 *
 * Provides pre/post hooks for all SDK operations, allowing developers
 * to inject custom logic at any point in the asset lifecycle.
 */

// ============================================================================
// HOOK TYPES
// ============================================================================

/**
 * Hook priority levels
 */
export enum HookPriority {
  HIGHEST = 0,
  HIGH = 25,
  NORMAL = 50,
  LOW = 75,
  LOWEST = 100,
}

/**
 * Hook execution timing
 */
export type HookTiming = 'before' | 'after';

/**
 * Hook event types
 */
export type HookEvent =
  // Asset lifecycle
  | 'asset:create'
  | 'asset:update'
  | 'asset:delete'
  | 'asset:transition'
  // Token operations
  | 'token:mint'
  | 'token:transfer'
  | 'token:burn'
  | 'token:freeze'
  | 'token:unfreeze'
  // Party operations
  | 'party:create'
  | 'party:update'
  | 'party:kyc'
  | 'party:freeze'
  // Cash flow operations
  | 'cashflow:distribute'
  | 'cashflow:claim'
  // Governance operations
  | 'governance:propose'
  | 'governance:vote'
  | 'governance:execute'
  // Escrow operations
  | 'escrow:create'
  | 'escrow:release'
  | 'escrow:refund'
  // Generic
  | 'custom'
  | '*'; // Wildcard for all events

/**
 * Hook context containing all relevant data
 */
export interface HookContext<T = unknown> {
  /** Event type */
  event: HookEvent;

  /** Timing (before or after) */
  timing: HookTiming;

  /** Data associated with the event */
  data: T;

  /** Actor performing the operation */
  actorId?: string;

  /** Timestamp */
  timestamp: string;

  /** Additional metadata */
  metadata?: Record<string, unknown>;

  /** Result from the operation (only available in 'after' hooks) */
  result?: unknown;

  /** Error if operation failed (only available in 'after' hooks) */
  error?: Error;

  /** Flag to skip subsequent hooks */
  skipRemaining?: boolean;

  /** Flag to abort the operation (only in 'before' hooks) */
  abort?: boolean;

  /** Reason for abortion */
  abortReason?: string;
}

/**
 * Hook handler function
 */
export type HookHandler<T = unknown> = (context: HookContext<T>) => Promise<void> | void;

/**
 * Hook registration
 */
export interface HookRegistration {
  /** Unique ID for this hook */
  id: string;

  /** Event to hook into */
  event: HookEvent;

  /** Timing (before or after) */
  timing: HookTiming;

  /** Handler function */
  handler: HookHandler;

  /** Priority (lower = earlier) */
  priority: HookPriority;

  /** Optional description */
  description?: string;

  /** Whether the hook is enabled */
  enabled: boolean;
}

// ============================================================================
// HOOK MANAGER
// ============================================================================

/**
 * Manages hooks for the SDK
 */
export class HookManager {
  private static instance: HookManager;
  private hooks: Map<string, HookRegistration> = new Map();
  private hooksByEvent: Map<string, Set<string>> = new Map();
  private enabled: boolean = true;

  private constructor() {}

  static getInstance(): HookManager {
    if (!HookManager.instance) {
      HookManager.instance = new HookManager();
    }
    return HookManager.instance;
  }

  /**
   * Register a hook
   */
  register<T = unknown>(
    event: HookEvent,
    timing: HookTiming,
    handler: HookHandler<T>,
    options: {
      id?: string;
      priority?: HookPriority;
      description?: string;
    } = {}
  ): string {
    const id = options.id || `hook_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const registration: HookRegistration = {
      id,
      event,
      timing,
      handler: handler as HookHandler,
      priority: options.priority ?? HookPriority.NORMAL,
      description: options.description,
      enabled: true,
    };

    this.hooks.set(id, registration);

    // Index by event
    const eventKey = `${event}:${timing}`;
    if (!this.hooksByEvent.has(eventKey)) {
      this.hooksByEvent.set(eventKey, new Set());
    }
    this.hooksByEvent.get(eventKey)!.add(id);

    return id;
  }

  /**
   * Register a 'before' hook
   */
  before<T = unknown>(
    event: HookEvent,
    handler: HookHandler<T>,
    options?: { id?: string; priority?: HookPriority; description?: string }
  ): string {
    return this.register(event, 'before', handler, options);
  }

  /**
   * Register an 'after' hook
   */
  after<T = unknown>(
    event: HookEvent,
    handler: HookHandler<T>,
    options?: { id?: string; priority?: HookPriority; description?: string }
  ): string {
    return this.register(event, 'after', handler, options);
  }

  /**
   * Unregister a hook
   */
  unregister(id: string): boolean {
    const registration = this.hooks.get(id);
    if (!registration) return false;

    const eventKey = `${registration.event}:${registration.timing}`;
    this.hooksByEvent.get(eventKey)?.delete(id);
    return this.hooks.delete(id);
  }

  /**
   * Enable a hook
   */
  enable(id: string): boolean {
    const registration = this.hooks.get(id);
    if (registration) {
      registration.enabled = true;
      return true;
    }
    return false;
  }

  /**
   * Disable a hook
   */
  disable(id: string): boolean {
    const registration = this.hooks.get(id);
    if (registration) {
      registration.enabled = false;
      return true;
    }
    return false;
  }

  /**
   * Enable/disable all hooks globally
   */
  setGlobalEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Get hooks for an event
   */
  getHooks(event: HookEvent, timing: HookTiming): HookRegistration[] {
    const eventKey = `${event}:${timing}`;
    const wildcardKey = `*:${timing}`;

    const hookIds = new Set<string>();

    // Add event-specific hooks
    this.hooksByEvent.get(eventKey)?.forEach(id => hookIds.add(id));

    // Add wildcard hooks
    this.hooksByEvent.get(wildcardKey)?.forEach(id => hookIds.add(id));

    // Get registrations and sort by priority
    return Array.from(hookIds)
      .map(id => this.hooks.get(id)!)
      .filter(h => h && h.enabled)
      .sort((a, b) => a.priority - b.priority);
  }

  /**
   * Execute hooks for an event
   */
  async execute<T = unknown>(
    event: HookEvent,
    timing: HookTiming,
    data: T,
    options: {
      actorId?: string;
      metadata?: Record<string, unknown>;
      result?: unknown;
      error?: Error;
    } = {}
  ): Promise<HookContext<T>> {
    const context: HookContext<T> = {
      event,
      timing,
      data,
      actorId: options.actorId,
      timestamp: new Date().toISOString(),
      metadata: options.metadata,
      result: options.result,
      error: options.error,
    };

    if (!this.enabled) {
      return context;
    }

    const hooks = this.getHooks(event, timing);

    for (const hook of hooks) {
      try {
        await hook.handler(context);

        // Check if we should skip remaining hooks
        if (context.skipRemaining) {
          break;
        }

        // Check if operation should be aborted (only in 'before' hooks)
        if (timing === 'before' && context.abort) {
          break;
        }
      } catch (error) {
        // Log error but continue with other hooks
        console.error(`Hook ${hook.id} failed:`, error);

        // Optionally re-throw for critical hooks
        if (hook.priority === HookPriority.HIGHEST) {
          throw error;
        }
      }
    }

    return context;
  }

  /**
   * Execute 'before' hooks and check for abort
   */
  async executeBefore<T = unknown>(
    event: HookEvent,
    data: T,
    options?: { actorId?: string; metadata?: Record<string, unknown> }
  ): Promise<{ proceed: boolean; context: HookContext<T> }> {
    const context = await this.execute(event, 'before', data, options);
    return {
      proceed: !context.abort,
      context,
    };
  }

  /**
   * Execute 'after' hooks
   */
  async executeAfter<T = unknown>(
    event: HookEvent,
    data: T,
    options?: { actorId?: string; metadata?: Record<string, unknown>; result?: unknown; error?: Error }
  ): Promise<HookContext<T>> {
    return this.execute(event, 'after', data, options);
  }

  /**
   * Get all registered hooks
   */
  getAll(): HookRegistration[] {
    return Array.from(this.hooks.values());
  }

  /**
   * Clear all hooks
   */
  clear(): void {
    this.hooks.clear();
    this.hooksByEvent.clear();
  }

  /**
   * Get hook count
   */
  count(): number {
    return this.hooks.size;
  }
}

// ============================================================================
// HOOK DECORATORS (for class-based usage)
// ============================================================================

/**
 * Decorator to register a method as a hook handler
 */
export function Hook(
  event: HookEvent,
  timing: HookTiming,
  options?: { priority?: HookPriority; description?: string }
) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    // Register hook when method is called for the first time
    let registered = false;

    descriptor.value = function (...args: any[]) {
      if (!registered) {
        HookManager.getInstance().register(event, timing, originalMethod.bind(this), {
          id: `${target.constructor.name}.${propertyKey}`,
          ...options,
        });
        registered = true;
      }
      return originalMethod.apply(this, args);
    };

    return descriptor;
  };
}

/**
 * Decorator for 'before' hooks
 */
export function BeforeHook(
  event: HookEvent,
  options?: { priority?: HookPriority; description?: string }
) {
  return Hook(event, 'before', options);
}

/**
 * Decorator for 'after' hooks
 */
export function AfterHook(
  event: HookEvent,
  options?: { priority?: HookPriority; description?: string }
) {
  return Hook(event, 'after', options);
}

// ============================================================================
// COMMON HOOK UTILITIES
// ============================================================================

/**
 * Create a validation hook that aborts on failure
 */
export function createValidationHook<T>(
  validator: (data: T) => boolean | Promise<boolean>,
  errorMessage: string
): HookHandler<T> {
  return async (context) => {
    const isValid = await validator(context.data);
    if (!isValid) {
      context.abort = true;
      context.abortReason = errorMessage;
    }
  };
}

/**
 * Create a logging hook
 */
export function createLoggingHook(
  logger: (message: string, context: HookContext) => void
): HookHandler {
  return (context) => {
    logger(`[${context.timing.toUpperCase()}] ${context.event}`, context);
  };
}

/**
 * Create a notification hook
 */
export function createNotificationHook(
  notifier: (event: HookEvent, data: unknown) => void | Promise<void>
): HookHandler {
  return async (context) => {
    await notifier(context.event, context.data);
  };
}

/**
 * Create a rate limiting hook
 */
export function createRateLimitHook(
  maxRequests: number,
  windowMs: number
): HookHandler {
  const requests: Map<string, number[]> = new Map();

  return (context) => {
    const key = context.actorId || 'anonymous';
    const now = Date.now();
    const windowStart = now - windowMs;

    // Get requests in window
    let actorRequests = requests.get(key) || [];
    actorRequests = actorRequests.filter(t => t > windowStart);

    if (actorRequests.length >= maxRequests) {
      context.abort = true;
      context.abortReason = 'Rate limit exceeded';
      return;
    }

    actorRequests.push(now);
    requests.set(key, actorRequests);
  };
}

// Export singleton accessor
export const hookManager = HookManager.getInstance();
