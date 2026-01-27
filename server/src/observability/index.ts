/**
 * Observability Module
 *
 * Exports telemetry utilities for distributed tracing, metrics, and logging.
 */

export {
  // Initialization
  initTelemetry,
  shutdownTelemetry,

  // Span utilities
  createSpan,
  withSpan,
  withSpanSync,
  getCurrentSpan,
  addSpanAttributes,
  addSpanEvent,
  recordSpanError,

  // Domain-specific tracing
  traceDbOperation,
  traceChainOperation,
  traceExternalCall,
  traceComplianceCheck,
  traceTransfer,

  // Express middleware
  telemetryMiddleware,

  // Metrics
  incrementRequestCount,
  incrementErrorCount,
  incrementTransferCount,
  incrementComplianceCheckCount,
  recordDbOperationDuration,

  // Re-exports from OpenTelemetry
  trace,
  context,
  SpanStatusCode,
} from './telemetry.js';

export type { Span } from './telemetry.js';
