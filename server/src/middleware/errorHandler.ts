import { Request, Response, NextFunction } from 'express';
import { logger } from '../middleware/logger.js';
import { TracedRequest, getTraceId, getSpanId } from './traceMiddleware.js';
import { TenantContextError, PermissionDeniedError } from '../context/TenantContext.js';

// ============================================================================
// Error Types
// ============================================================================

export interface ApiError extends Error {
  statusCode?: number;
  code?: string;
  /** Receipt ID for compliance errors */
  receiptId?: string;
  /** Partner-facing explanation */
  partnerExplanation?: PartnerExplanation;
}

/**
 * Partner-facing error explanation
 */
export interface PartnerExplanation {
  summary: string;
  suggestedActions?: SuggestedAction[];
  links?: Record<string, string>;
}

/**
 * Suggested action for error resolution
 */
export interface SuggestedAction {
  action: string;
  endpoint?: string;
  description: string;
}

/**
 * Error response format
 */
export interface ErrorResponse {
  error: {
    message: string;
    code: string;
    traceId?: string;
    spanId?: string;
    receiptId?: string;
    explanation?: PartnerExplanation;
    details?: Record<string, unknown>;
    stack?: string;
  };
}

// ============================================================================
// Error Handler
// ============================================================================

export function errorHandler(
  err: ApiError,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const tracedReq = req as TracedRequest;
  const traceId = getTraceId(tracedReq) || (req.headers['x-request-id'] as string);
  const spanId = getSpanId(tracedReq);

  // Log with trace context
  logger.error('Request error', {
    error: err,
    metadata: {
      traceId,
      spanId,
      method: req.method,
      path: req.path,
      code: err.code,
      statusCode: err.statusCode,
    },
  });

  // Determine status code
  let statusCode = err.statusCode || 500;
  let code = err.code || 'INTERNAL_ERROR';
  let message = err.message || 'Internal Server Error';

  // Handle specific error types
  if (err instanceof TenantContextError) {
    statusCode = 403;
    code = err.code;
  } else if (err instanceof PermissionDeniedError) {
    statusCode = 403;
    code = err.code;
  }

  // Build error response
  const errorResponse: ErrorResponse = {
    error: {
      message,
      code,
      traceId,
      spanId,
    },
  };

  // Add receipt ID for compliance errors
  if (err.receiptId) {
    errorResponse.error.receiptId = err.receiptId;
  }

  // Add partner explanation if available
  if (err.partnerExplanation) {
    errorResponse.error.explanation = err.partnerExplanation;
  }

  // Add stack trace in development
  if (process.env.NODE_ENV === 'development') {
    errorResponse.error.stack = err.stack;
  }

  // Set trace headers on response
  if (traceId) {
    res.setHeader('X-Trace-ID', traceId);
  }
  if (spanId) {
    res.setHeader('X-Span-ID', spanId);
  }

  res.status(statusCode).json(errorResponse);
}

export class AppError extends Error implements ApiError {
  statusCode: number;
  code: string;

  constructor(message: string, statusCode: number = 500, code: string = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class ValidationError extends AppError {
  constructor(message: string = 'Validation failed') {
    super(message, 400, 'VALIDATION_ERROR');
  }
}

export class ConflictError extends AppError {
  constructor(message: string = 'Resource already exists') {
    super(message, 409, 'CONFLICT');
  }
}

/**
 * Compliance denied error with partner explanation
 */
export class ComplianceDeniedError extends AppError {
  public readonly receiptId?: string;
  public readonly partnerExplanation: PartnerExplanation;

  constructor(
    message: string,
    explanation: PartnerExplanation,
    receiptId?: string
  ) {
    super(message, 403, 'COMPLIANCE_DENIED');
    this.receiptId = receiptId;
    this.partnerExplanation = explanation;
  }
}

/**
 * Rate limit exceeded error
 */
export class RateLimitError extends AppError {
  public readonly retryAfter: number;

  constructor(message: string = 'Rate limit exceeded', retryAfterSeconds: number = 60) {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
    this.retryAfter = retryAfterSeconds;
  }
}

/**
 * Idempotency conflict error
 */
export class IdempotencyConflictError extends AppError {
  public readonly idempotencyKey: string;

  constructor(idempotencyKey: string) {
    super(
      `Request with idempotency key '${idempotencyKey}' is already in progress`,
      409,
      'IDEMPOTENCY_CONFLICT'
    );
    this.idempotencyKey = idempotencyKey;
  }
}

/**
 * Service unavailable error
 */
export class ServiceUnavailableError extends AppError {
  constructor(message: string = 'Service temporarily unavailable') {
    super(message, 503, 'SERVICE_UNAVAILABLE');
  }
}
