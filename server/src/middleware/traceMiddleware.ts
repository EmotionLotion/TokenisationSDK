import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { logger } from './logger.js';

// ============================================================================
// Trace Middleware - OpenTelemetry-compatible request tracing
// ============================================================================

/**
 * Trace context extracted from request or generated
 */
export interface TraceContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  sampled: boolean;
}

/**
 * Extended request with trace context
 */
export interface TracedRequest extends Request {
  traceContext?: TraceContext;
}

/**
 * Generate a random hex string of given length
 */
function generateHexId(length: number): string {
  return crypto.randomBytes(length / 2).toString('hex');
}

/**
 * Generate a W3C Trace Context compliant trace ID (32 hex chars)
 */
function generateTraceId(): string {
  return generateHexId(32);
}

/**
 * Generate a W3C Trace Context compliant span ID (16 hex chars)
 */
function generateSpanId(): string {
  return generateHexId(16);
}

/**
 * Parse W3C traceparent header
 * Format: {version}-{trace-id}-{parent-id}-{trace-flags}
 * Example: 00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01
 */
function parseTraceparent(header: string): TraceContext | null {
  const parts = header.split('-');
  if (parts.length !== 4) return null;

  const [version, traceId, parentSpanId, flags] = parts;

  // Validate format
  if (version !== '00') return null; // Only version 00 supported
  if (traceId.length !== 32) return null;
  if (parentSpanId.length !== 16) return null;
  if (flags.length !== 2) return null;

  // Check for all-zeros (invalid)
  if (traceId === '0'.repeat(32)) return null;
  if (parentSpanId === '0'.repeat(16)) return null;

  const sampled = (parseInt(flags, 16) & 0x01) === 1;

  return {
    traceId,
    spanId: generateSpanId(), // Generate new span for this request
    parentSpanId,
    sampled,
  };
}

/**
 * Parse tracestate header (for additional vendor context)
 */
function parseTracestate(header: string): Record<string, string> {
  const state: Record<string, string> = {};

  if (!header) return state;

  const pairs = header.split(',');
  for (const pair of pairs) {
    const [key, value] = pair.trim().split('=');
    if (key && value) {
      state[key] = value;
    }
  }

  return state;
}

/**
 * Format traceparent header for response
 */
function formatTraceparent(ctx: TraceContext): string {
  const flags = ctx.sampled ? '01' : '00';
  return `00-${ctx.traceId}-${ctx.spanId}-${flags}`;
}

/**
 * Trace middleware that propagates or generates trace context
 *
 * Supports:
 * - W3C Trace Context (traceparent, tracestate)
 * - X-Trace-ID header (custom)
 * - X-Request-ID header (fallback)
 *
 * Sets response headers:
 * - X-Trace-ID: Full trace ID
 * - X-Span-ID: Current span ID
 * - traceparent: W3C format
 */
export function traceMiddleware(
  req: TracedRequest,
  res: Response,
  next: NextFunction
): void {
  const startTime = Date.now();
  let traceContext: TraceContext;

  // Try to extract trace context from incoming headers

  // 1. Check W3C traceparent header
  const traceparent = req.headers['traceparent'] as string | undefined;
  if (traceparent) {
    const parsed = parseTraceparent(traceparent);
    if (parsed) {
      traceContext = parsed;
    } else {
      // Invalid traceparent, generate new context
      traceContext = {
        traceId: generateTraceId(),
        spanId: generateSpanId(),
        sampled: true,
      };
    }
  }
  // 2. Check X-Trace-ID header (custom propagation)
  else if (req.headers['x-trace-id']) {
    const xTraceId = req.headers['x-trace-id'] as string;
    traceContext = {
      traceId: xTraceId.length === 32 ? xTraceId : generateTraceId(),
      spanId: generateSpanId(),
      sampled: true,
    };
  }
  // 3. Generate new trace context
  else {
    traceContext = {
      traceId: generateTraceId(),
      spanId: generateSpanId(),
      sampled: true,
    };
  }

  // Attach to request
  req.traceContext = traceContext;

  // Set response headers
  res.setHeader('X-Trace-ID', traceContext.traceId);
  res.setHeader('X-Span-ID', traceContext.spanId);
  res.setHeader('traceparent', formatTraceparent(traceContext));

  // Parse and propagate tracestate
  const tracestate = req.headers['tracestate'] as string | undefined;
  if (tracestate) {
    res.setHeader('tracestate', tracestate);
  }

  // Log request start
  logger.debug(`Request started`, {
    metadata: {
      traceId: traceContext.traceId,
      spanId: traceContext.spanId,
      method: req.method,
      path: req.path,
    },
  });

  // Track response
  res.on('finish', () => {
    const durationMs = Date.now() - startTime;

    logger.info(`Request completed`, {
      metadata: {
        traceId: traceContext.traceId,
        spanId: traceContext.spanId,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs,
      },
    });
  });

  next();
}

/**
 * Get current trace context from request
 */
export function getTraceContext(req: TracedRequest): TraceContext | undefined {
  return req.traceContext;
}

/**
 * Get trace ID from request
 */
export function getTraceId(req: TracedRequest): string | undefined {
  return req.traceContext?.traceId;
}

/**
 * Get span ID from request
 */
export function getSpanId(req: TracedRequest): string | undefined {
  return req.traceContext?.spanId;
}

/**
 * Create a child span context
 */
export function createChildSpan(parentContext: TraceContext): TraceContext {
  return {
    traceId: parentContext.traceId,
    spanId: generateSpanId(),
    parentSpanId: parentContext.spanId,
    sampled: parentContext.sampled,
  };
}

// ============================================================================
// Span Recording (for detailed tracing)
// ============================================================================

/**
 * Span attributes
 */
export interface SpanAttributes {
  [key: string]: string | number | boolean | undefined;
}

/**
 * Span event
 */
export interface SpanEvent {
  name: string;
  timestamp: number;
  attributes?: SpanAttributes;
}

/**
 * Recorded span
 */
export interface RecordedSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  startTime: number;
  endTime?: number;
  durationMs?: number;
  status: 'ok' | 'error';
  attributes: SpanAttributes;
  events: SpanEvent[];
}

/**
 * Simple span recorder (in production, would send to tracing backend)
 */
class SpanRecorder {
  private spans: RecordedSpan[] = [];
  private readonly maxSpans = 1000;

  record(span: RecordedSpan): void {
    this.spans.push(span);

    // Rotate old spans
    if (this.spans.length > this.maxSpans) {
      this.spans = this.spans.slice(-this.maxSpans);
    }

    // Log for debugging
    logger.debug('Span recorded', {
      metadata: {
        traceId: span.traceId,
        spanId: span.spanId,
        name: span.name,
        durationMs: span.durationMs,
        status: span.status,
      },
    });
  }

  getSpans(traceId: string): RecordedSpan[] {
    return this.spans.filter(s => s.traceId === traceId);
  }

  clear(): void {
    this.spans = [];
  }
}

export const spanRecorder = new SpanRecorder();

/**
 * Create and record a span
 */
export async function withSpan<T>(
  name: string,
  context: TraceContext,
  attributes: SpanAttributes,
  fn: () => Promise<T>
): Promise<T> {
  const childContext = createChildSpan(context);
  const startTime = Date.now();
  let status: 'ok' | 'error' = 'ok';
  const events: SpanEvent[] = [];

  try {
    const result = await fn();
    return result;
  } catch (error) {
    status = 'error';
    events.push({
      name: 'exception',
      timestamp: Date.now(),
      attributes: {
        'exception.type': (error as Error).name,
        'exception.message': (error as Error).message,
      },
    });
    throw error;
  } finally {
    const endTime = Date.now();
    spanRecorder.record({
      traceId: childContext.traceId,
      spanId: childContext.spanId,
      parentSpanId: childContext.parentSpanId,
      name,
      startTime,
      endTime,
      durationMs: endTime - startTime,
      status,
      attributes,
      events,
    });
  }
}
