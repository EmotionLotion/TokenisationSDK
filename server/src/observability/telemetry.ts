/**
 * OpenTelemetry Instrumentation
 *
 * Provides distributed tracing, metrics, and logging for the tokenization platform.
 * This module should be imported FIRST before any other imports in index.ts.
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
// Note: semantic-conventions removed - using NodeSDK's serviceName property instead
import { diag, DiagConsoleLogger, DiagLogLevel, trace, context, SpanStatusCode } from '@opentelemetry/api';
import type { Span, SpanOptions, Context } from '@opentelemetry/api';

// ============================================================================
// Configuration
// ============================================================================

const OTEL_ENABLED = process.env.OTEL_ENABLED === 'true';
const OTEL_EXPORTER_OTLP_ENDPOINT = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318';
const SERVICE_NAME = process.env.OTEL_SERVICE_NAME || 'tokenisation-api';
const SERVICE_VERSION = process.env.npm_package_version || '1.0.0';
const ENVIRONMENT = process.env.NODE_ENV || 'development';

// Enable diagnostic logging in development
if (process.env.OTEL_DEBUG === 'true') {
  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);
}

// ============================================================================
// SDK Initialization
// ============================================================================

let sdk: NodeSDK | null = null;

/**
 * Initialize OpenTelemetry SDK
 * Should be called before any other code runs
 */
export function initTelemetry(): void {
  if (!OTEL_ENABLED) {
    console.log('[Telemetry] OpenTelemetry disabled (set OTEL_ENABLED=true to enable)');
    return;
  }

  console.log(`[Telemetry] Initializing OpenTelemetry...`);
  console.log(`[Telemetry] Exporting to: ${OTEL_EXPORTER_OTLP_ENDPOINT}`);

  const traceExporter = new OTLPTraceExporter({
    url: `${OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces`,
  });

  const metricExporter = new OTLPMetricExporter({
    url: `${OTEL_EXPORTER_OTLP_ENDPOINT}/v1/metrics`,
  });

  sdk = new NodeSDK({
    serviceName: SERVICE_NAME,
    traceExporter,
    metricReader: new PeriodicExportingMetricReader({
      exporter: metricExporter,
      exportIntervalMillis: 60000, // Export metrics every minute
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        // Disable fs instrumentation (too noisy)
        '@opentelemetry/instrumentation-fs': { enabled: false },
        // Configure HTTP instrumentation
        '@opentelemetry/instrumentation-http': {
          enabled: true,
        },
        // Configure Express instrumentation
        '@opentelemetry/instrumentation-express': {
          enabled: true,
        },
        // Configure pg instrumentation for database
        '@opentelemetry/instrumentation-pg': {
          enabled: true,
        },
      }),
    ],
  });

  sdk.start();
  console.log('[Telemetry] OpenTelemetry SDK started');

  // Graceful shutdown
  process.on('SIGTERM', () => {
    sdk?.shutdown()
      .then(() => console.log('[Telemetry] SDK shut down successfully'))
      .catch((error: unknown) => console.error('[Telemetry] Error shutting down SDK:', error));
  });
}

/**
 * Shutdown OpenTelemetry SDK
 */
export async function shutdownTelemetry(): Promise<void> {
  if (sdk) {
    await sdk.shutdown();
    console.log('[Telemetry] SDK shut down');
  }
}

// ============================================================================
// Tracing Utilities
// ============================================================================

const tracer = trace.getTracer(SERVICE_NAME, SERVICE_VERSION);

/**
 * Create a new span for tracing an operation
 */
export function createSpan(
  name: string,
  options?: SpanOptions,
  parentContext?: Context
): Span {
  const ctx = parentContext || context.active();
  return tracer.startSpan(name, options, ctx);
}

/**
 * Wrap an async function with tracing
 */
export async function withSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T>,
  options?: SpanOptions
): Promise<T> {
  const span = createSpan(name, options);

  try {
    const result = await context.with(trace.setSpan(context.active(), span), () => fn(span));
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error instanceof Error ? error.message : 'Unknown error',
    });
    span.recordException(error as Error);
    throw error;
  } finally {
    span.end();
  }
}

/**
 * Wrap a sync function with tracing
 */
export function withSpanSync<T>(
  name: string,
  fn: (span: Span) => T,
  options?: SpanOptions
): T {
  const span = createSpan(name, options);

  try {
    const result = fn(span);
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error instanceof Error ? error.message : 'Unknown error',
    });
    span.recordException(error as Error);
    throw error;
  } finally {
    span.end();
  }
}

/**
 * Get the current active span
 */
export function getCurrentSpan(): Span | undefined {
  return trace.getActiveSpan();
}

/**
 * Add attributes to the current span
 */
export function addSpanAttributes(attributes: Record<string, string | number | boolean>): void {
  const span = getCurrentSpan();
  if (span) {
    span.setAttributes(attributes);
  }
}

/**
 * Add an event to the current span
 */
export function addSpanEvent(name: string, attributes?: Record<string, string | number | boolean>): void {
  const span = getCurrentSpan();
  if (span) {
    span.addEvent(name, attributes);
  }
}

/**
 * Record an error on the current span
 */
export function recordSpanError(error: Error): void {
  const span = getCurrentSpan();
  if (span) {
    span.recordException(error);
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error.message,
    });
  }
}

// ============================================================================
// Domain-Specific Tracing Helpers
// ============================================================================

/**
 * Trace a database operation
 */
export async function traceDbOperation<T>(
  operation: string,
  table: string,
  fn: () => Promise<T>
): Promise<T> {
  return withSpan(`db.${operation}`, async (span) => {
    span.setAttributes({
      'db.operation': operation,
      'db.table': table,
      'db.system': 'postgresql',
    });
    return fn();
  });
}

/**
 * Trace a blockchain operation
 */
export async function traceChainOperation<T>(
  operation: string,
  chainId: number,
  fn: () => Promise<T>
): Promise<T> {
  return withSpan(`chain.${operation}`, async (span) => {
    span.setAttributes({
      'chain.operation': operation,
      'chain.id': chainId,
    });
    return fn();
  });
}

/**
 * Trace an external API call
 */
export async function traceExternalCall<T>(
  service: string,
  operation: string,
  fn: () => Promise<T>
): Promise<T> {
  return withSpan(`external.${service}.${operation}`, async (span) => {
    span.setAttributes({
      'external.service': service,
      'external.operation': operation,
    });
    return fn();
  });
}

/**
 * Trace a compliance check
 */
export async function traceComplianceCheck<T>(
  checkType: string,
  subjectRef: string,
  fn: () => Promise<T>
): Promise<T> {
  return withSpan(`compliance.${checkType}`, async (span) => {
    span.setAttributes({
      'compliance.check_type': checkType,
      'compliance.subject_ref': subjectRef,
    });
    return fn();
  });
}

/**
 * Trace a transfer operation
 */
export async function traceTransfer<T>(
  transferId: string,
  stage: string,
  fn: () => Promise<T>
): Promise<T> {
  return withSpan(`transfer.${stage}`, async (span) => {
    span.setAttributes({
      'transfer.id': transferId,
      'transfer.stage': stage,
    });
    return fn();
  });
}

// ============================================================================
// Express Middleware
// ============================================================================

import type { Request, Response, NextFunction } from 'express';

/**
 * Express middleware to add custom attributes to spans
 */
export function telemetryMiddleware(req: Request, res: Response, next: NextFunction): void {
  const span = getCurrentSpan();

  if (span) {
    // Add custom attributes
    span.setAttributes({
      'http.request_id': req.headers['x-request-id'] as string || '',
      'http.idempotency_key': req.headers['idempotency-key'] as string || '',
      'user.org_id': (req as any).apiKey?.orgId || '',
      'user.party_id': (req as any).user?.partyId || '',
    });
  }

  next();
}

// ============================================================================
// Metrics Helpers
// ============================================================================

import { metrics, Counter, Histogram } from '@opentelemetry/api';

const meter = metrics.getMeter(SERVICE_NAME, SERVICE_VERSION);

// Pre-defined metrics
const requestCounter = meter.createCounter('http_requests_total', {
  description: 'Total number of HTTP requests',
});

const errorCounter = meter.createCounter('errors_total', {
  description: 'Total number of errors',
});

const transferCounter = meter.createCounter('transfers_total', {
  description: 'Total number of transfers',
});

const complianceCheckCounter = meter.createCounter('compliance_checks_total', {
  description: 'Total number of compliance checks',
});

const dbOperationHistogram = meter.createHistogram('db_operation_duration_ms', {
  description: 'Duration of database operations in milliseconds',
});

/**
 * Increment request counter
 */
export function incrementRequestCount(method: string, path: string, status: number): void {
  requestCounter.add(1, { method, path, status: status.toString() });
}

/**
 * Increment error counter
 */
export function incrementErrorCount(type: string, code?: string): void {
  errorCounter.add(1, { type, code: code || 'unknown' });
}

/**
 * Increment transfer counter
 */
export function incrementTransferCount(status: string, tokenId?: string): void {
  transferCounter.add(1, { status, token_id: tokenId || '' });
}

/**
 * Increment compliance check counter
 */
export function incrementComplianceCheckCount(type: string, result: string): void {
  complianceCheckCounter.add(1, { type, result });
}

/**
 * Record database operation duration
 */
export function recordDbOperationDuration(operation: string, table: string, durationMs: number): void {
  dbOperationHistogram.record(durationMs, { operation, table });
}

export { trace, context, SpanStatusCode };
export type { Span };
