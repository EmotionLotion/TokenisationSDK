import { Request, Response, NextFunction } from 'express';
import type { RequestWithContext } from './apiGateway.js';

// ============================================================================
// Types & Interfaces
// ============================================================================

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  requestId?: string;
  orgId?: string;
  userId?: string;
  method?: string;
  path?: string;
  statusCode?: number;
  duration?: number;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  metadata?: Record<string, unknown>;
}

export interface LoggerConfig {
  level: LogLevel;
  format: 'json' | 'pretty';
  includeStack: boolean;
  redactPaths: string[];
}

// ============================================================================
// Log Level Priorities
// ============================================================================

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// ============================================================================
// Default Configuration
// ============================================================================

const defaultConfig: LoggerConfig = {
  level: (process.env.LOG_LEVEL as LogLevel) || 'info',
  format: process.env.NODE_ENV === 'production' ? 'json' : 'pretty',
  includeStack: process.env.NODE_ENV !== 'production',
  redactPaths: ['password', 'passwordHash', 'secret', 'apiKey', 'token', 'authorization'],
};

let currentConfig: LoggerConfig = { ...defaultConfig };

// ============================================================================
// Configuration
// ============================================================================

/**
 * Updates the logger configuration.
 */
export function configureLogger(config: Partial<LoggerConfig>): void {
  currentConfig = { ...currentConfig, ...config };
}

/**
 * Gets the current logger configuration.
 */
export function getLoggerConfig(): LoggerConfig {
  return { ...currentConfig };
}

// ============================================================================
// Redaction
// ============================================================================

/**
 * Redacts sensitive fields from an object.
 */
function redactSensitiveFields(obj: unknown, paths: string[]): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => redactSensitiveFields(item, paths));
  }

  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const lowerKey = key.toLowerCase();
      if (paths.some(path => lowerKey.includes(path.toLowerCase()))) {
        result[key] = '[REDACTED]';
      } else if (typeof value === 'object') {
        result[key] = redactSensitiveFields(value, paths);
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  return obj;
}

// ============================================================================
// Formatters
// ============================================================================

/**
 * Formats a log entry as JSON.
 */
function formatJson(entry: LogEntry): string {
  return JSON.stringify(entry);
}

/**
 * Formats a log entry for pretty printing.
 */
function formatPretty(entry: LogEntry): string {
  const colors = {
    debug: '\x1b[36m', // Cyan
    info: '\x1b[32m',  // Green
    warn: '\x1b[33m',  // Yellow
    error: '\x1b[31m', // Red
    reset: '\x1b[0m',
  };

  const levelColor = colors[entry.level];
  const timestamp = entry.timestamp.substring(11, 23); // HH:MM:SS.mmm

  let output = `${colors.reset}[${timestamp}] ${levelColor}${entry.level.toUpperCase().padEnd(5)}${colors.reset}`;

  if (entry.requestId) {
    output += ` [${entry.requestId.substring(0, 8)}]`;
  }

  output += ` ${entry.message}`;

  if (entry.method && entry.path) {
    output += ` ${entry.method} ${entry.path}`;
  }

  if (entry.statusCode) {
    const statusColor = entry.statusCode >= 400 ? colors.error : colors.info;
    output += ` ${statusColor}${entry.statusCode}${colors.reset}`;
  }

  if (entry.duration !== undefined) {
    output += ` ${entry.duration}ms`;
  }

  if (entry.error) {
    output += `\n  Error: ${entry.error.message}`;
    if (entry.error.stack && currentConfig.includeStack) {
      output += `\n${entry.error.stack}`;
    }
  }

  if (entry.metadata && Object.keys(entry.metadata).length > 0) {
    const redacted = redactSensitiveFields(entry.metadata, currentConfig.redactPaths);
    output += `\n  ${JSON.stringify(redacted)}`;
  }

  return output;
}

/**
 * Formats a log entry based on current configuration.
 */
function formatEntry(entry: LogEntry): string {
  const redactedEntry = {
    ...entry,
    metadata: entry.metadata
      ? redactSensitiveFields(entry.metadata, currentConfig.redactPaths) as Record<string, unknown>
      : undefined,
  };

  return currentConfig.format === 'json'
    ? formatJson(redactedEntry)
    : formatPretty(redactedEntry);
}

// ============================================================================
// Core Logger
// ============================================================================

/**
 * Logs a message at the specified level.
 */
function log(
  level: LogLevel,
  message: string,
  context?: {
    requestId?: string;
    orgId?: string;
    userId?: string;
    error?: Error;
    metadata?: Record<string, unknown>;
  }
): void {
  // Check log level
  if (LOG_LEVELS[level] < LOG_LEVELS[currentConfig.level]) {
    return;
  }

  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    requestId: context?.requestId,
    orgId: context?.orgId,
    userId: context?.userId,
    metadata: context?.metadata,
  };

  if (context?.error) {
    entry.error = {
      name: context.error.name,
      message: context.error.message,
      stack: currentConfig.includeStack ? context.error.stack : undefined,
    };
  }

  const output = formatEntry(entry);

  switch (level) {
    case 'debug':
    case 'info':
      console.log(output);
      break;
    case 'warn':
      console.warn(output);
      break;
    case 'error':
      console.error(output);
      break;
  }
}

// ============================================================================
// Logger API
// ============================================================================

export const logger = {
  debug: (message: string, context?: Parameters<typeof log>[2]) =>
    log('debug', message, context),

  info: (message: string, context?: Parameters<typeof log>[2]) =>
    log('info', message, context),

  warn: (message: string, context?: Parameters<typeof log>[2]) =>
    log('warn', message, context),

  error: (message: string, context?: Parameters<typeof log>[2]) =>
    log('error', message, context),
};

// ============================================================================
// Request Logger Middleware
// ============================================================================

/**
 * Logs incoming requests and outgoing responses.
 */
export function requestLogger(options: {
  logBody?: boolean;
  skipPaths?: string[];
} = {}) {
  const { logBody = false, skipPaths = ['/health', '/metrics'] } = options;

  return (req: RequestWithContext, res: Response, next: NextFunction): void => {
    // Skip certain paths
    if (skipPaths.some(path => req.path.startsWith(path))) {
      return next();
    }

    const startTime = req.startTime || Date.now();

    // Log request
    const requestMetadata: Record<string, unknown> = {
      userAgent: req.headers['user-agent'],
      ip: req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress,
    };

    if (logBody && req.body && Object.keys(req.body).length > 0) {
      requestMetadata.body = req.body;
    }

    logger.info('Incoming request', {
      requestId: req.requestId,
      metadata: {
        ...requestMetadata,
        method: req.method,
        path: req.path,
        query: Object.keys(req.query).length > 0 ? req.query : undefined,
      },
    });

    // Capture response
    const originalEnd = res.end;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    res.end = function (this: Response, chunk?: any, encoding?: any, cb?: any) {
      const duration = Date.now() - startTime;

      const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        level: res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
        message: 'Request completed',
        requestId: req.requestId,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration,
      };

      const output = formatEntry(entry);
      if (res.statusCode >= 500) {
        console.error(output);
      } else if (res.statusCode >= 400) {
        console.warn(output);
      } else {
        console.log(output);
      }

      return originalEnd.call(this, chunk, encoding, cb);
    } as typeof res.end;

    next();
  };
}

// ============================================================================
// Error Logger Middleware
// ============================================================================

/**
 * Logs errors that occur during request processing.
 */
export function errorLogger(
  err: Error,
  req: RequestWithContext,
  _res: Response,
  next: NextFunction
): void {
  logger.error('Request error', {
    requestId: req.requestId,
    error: err,
    metadata: {
      method: req.method,
      path: req.path,
    },
  });

  next(err);
}

// ============================================================================
// Request Context Logger
// ============================================================================

/**
 * Creates a logger bound to a specific request context.
 */
export function createRequestLogger(req: RequestWithContext) {
  const context = {
    requestId: req.requestId,
    orgId: (req as any).apiKey?.orgId,
    userId: (req as any).user?.partyId,
  };

  return {
    debug: (message: string, metadata?: Record<string, unknown>) =>
      logger.debug(message, { ...context, metadata }),

    info: (message: string, metadata?: Record<string, unknown>) =>
      logger.info(message, { ...context, metadata }),

    warn: (message: string, metadata?: Record<string, unknown>) =>
      logger.warn(message, { ...context, metadata }),

    error: (message: string, error?: Error, metadata?: Record<string, unknown>) =>
      logger.error(message, { ...context, error, metadata }),
  };
}

// ============================================================================
// Child Logger Factory
// ============================================================================

/**
 * Creates a child logger with additional default context.
 */
export function createChildLogger(defaultContext: {
  service?: string;
  component?: string;
  metadata?: Record<string, unknown>;
}) {
  return {
    debug: (message: string, context?: Parameters<typeof log>[2]) =>
      log('debug', message, {
        ...context,
        metadata: { ...defaultContext.metadata, service: defaultContext.service, component: defaultContext.component, ...context?.metadata },
      }),

    info: (message: string, context?: Parameters<typeof log>[2]) =>
      log('info', message, {
        ...context,
        metadata: { ...defaultContext.metadata, service: defaultContext.service, component: defaultContext.component, ...context?.metadata },
      }),

    warn: (message: string, context?: Parameters<typeof log>[2]) =>
      log('warn', message, {
        ...context,
        metadata: { ...defaultContext.metadata, service: defaultContext.service, component: defaultContext.component, ...context?.metadata },
      }),

    error: (message: string, context?: Parameters<typeof log>[2]) =>
      log('error', message, {
        ...context,
        metadata: { ...defaultContext.metadata, service: defaultContext.service, component: defaultContext.component, ...context?.metadata },
      }),
  };
}
