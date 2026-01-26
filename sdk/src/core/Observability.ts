/**
 * Observability Module
 *
 * Provides logging, metrics, and tracing infrastructure for production monitoring.
 * Pluggable design allows integration with any observability stack:
 * - Logging: Winston, Pino, console, cloud logging
 * - Metrics: Prometheus, DataDog, CloudWatch
 * - Tracing: OpenTelemetry, Jaeger, Zipkin
 */

// ============================================================================
// LOG LEVELS
// ============================================================================

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  FATAL = 'fatal',
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  [LogLevel.DEBUG]: 0,
  [LogLevel.INFO]: 1,
  [LogLevel.WARN]: 2,
  [LogLevel.ERROR]: 3,
  [LogLevel.FATAL]: 4,
};

// ============================================================================
// TYPES
// ============================================================================

export interface LogContext {
  /** Correlation ID for request tracing */
  correlationId?: string;
  /** User/actor performing the action */
  actorId?: string;
  /** Asset being operated on */
  assetId?: string;
  /** Operation name */
  operation?: string;
  /** Additional metadata */
  [key: string]: unknown;
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

export interface MetricLabels {
  [key: string]: string;
}

export interface MetricValue {
  name: string;
  value: number;
  labels: MetricLabels;
  timestamp: number;
}

export interface SpanContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
}

export interface Span {
  context: SpanContext;
  name: string;
  startTime: number;
  endTime?: number;
  attributes: Record<string, unknown>;
  events: Array<{ name: string; timestamp: number; attributes?: Record<string, unknown> }>;
  status: 'ok' | 'error' | 'unset';
  end(): void;
  addEvent(name: string, attributes?: Record<string, unknown>): void;
  setStatus(status: 'ok' | 'error', message?: string): void;
  setAttribute(key: string, value: unknown): void;
}

// ============================================================================
// LOGGER INTERFACE
// ============================================================================

export interface ILogger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, error?: Error, context?: LogContext): void;
  fatal(message: string, error?: Error, context?: LogContext): void;
  child(context: LogContext): ILogger;
}

// ============================================================================
// METRICS INTERFACE
// ============================================================================

export interface IMetrics {
  /** Increment a counter */
  increment(name: string, labels?: MetricLabels, value?: number): void;
  /** Record a gauge value */
  gauge(name: string, value: number, labels?: MetricLabels): void;
  /** Record a histogram observation */
  histogram(name: string, value: number, labels?: MetricLabels): void;
  /** Start a timer, returns function to stop and record */
  startTimer(name: string, labels?: MetricLabels): () => number;
}

// ============================================================================
// TRACER INTERFACE
// ============================================================================

export interface ITracer {
  /** Start a new span */
  startSpan(name: string, parentContext?: SpanContext): Span;
  /** Get current active span */
  getActiveSpan(): Span | undefined;
  /** Run function within a span context */
  withSpan<T>(name: string, fn: (span: Span) => T | Promise<T>): Promise<T>;
}

// ============================================================================
// DEFAULT CONSOLE LOGGER
// ============================================================================

export class ConsoleLogger implements ILogger {
  private minLevel: LogLevel;
  private defaultContext: LogContext;

  constructor(options: { level?: LogLevel; context?: LogContext } = {}) {
    this.minLevel = options.level ?? LogLevel.INFO;
    this.defaultContext = options.context ?? {};
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.minLevel];
  }

  private formatEntry(level: LogLevel, message: string, context?: LogContext, error?: Error): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: { ...this.defaultContext, ...context },
      error: error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
      } : undefined,
    };
  }

  private log(entry: LogEntry): void {
    const { timestamp, level, message, context, error } = entry;
    const contextStr = Object.keys(context).length > 0 ? ` ${JSON.stringify(context)}` : '';
    const errorStr = error ? ` | Error: ${error.message}` : '';
    const output = `[${timestamp}] ${level.toUpperCase()}: ${message}${contextStr}${errorStr}`;

    switch (level) {
      case LogLevel.DEBUG:
        console.debug(output);
        break;
      case LogLevel.INFO:
        console.info(output);
        break;
      case LogLevel.WARN:
        console.warn(output);
        break;
      case LogLevel.ERROR:
      case LogLevel.FATAL:
        console.error(output);
        if (error?.stack) console.error(error.stack);
        break;
    }
  }

  debug(message: string, context?: LogContext): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      this.log(this.formatEntry(LogLevel.DEBUG, message, context));
    }
  }

  info(message: string, context?: LogContext): void {
    if (this.shouldLog(LogLevel.INFO)) {
      this.log(this.formatEntry(LogLevel.INFO, message, context));
    }
  }

  warn(message: string, context?: LogContext): void {
    if (this.shouldLog(LogLevel.WARN)) {
      this.log(this.formatEntry(LogLevel.WARN, message, context));
    }
  }

  error(message: string, error?: Error, context?: LogContext): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      this.log(this.formatEntry(LogLevel.ERROR, message, context, error));
    }
  }

  fatal(message: string, error?: Error, context?: LogContext): void {
    if (this.shouldLog(LogLevel.FATAL)) {
      this.log(this.formatEntry(LogLevel.FATAL, message, context, error));
    }
  }

  child(context: LogContext): ILogger {
    return new ConsoleLogger({
      level: this.minLevel,
      context: { ...this.defaultContext, ...context },
    });
  }
}

// ============================================================================
// DEFAULT METRICS (IN-MEMORY)
// ============================================================================

export class InMemoryMetrics implements IMetrics {
  private counters: Map<string, number> = new Map();
  private gauges: Map<string, number> = new Map();
  private histograms: Map<string, number[]> = new Map();

  private makeKey(name: string, labels?: MetricLabels): string {
    if (!labels || Object.keys(labels).length === 0) return name;
    const labelStr = Object.entries(labels).sort().map(([k, v]) => `${k}="${v}"`).join(',');
    return `${name}{${labelStr}}`;
  }

  increment(name: string, labels?: MetricLabels, value = 1): void {
    const key = this.makeKey(name, labels);
    this.counters.set(key, (this.counters.get(key) ?? 0) + value);
  }

  gauge(name: string, value: number, labels?: MetricLabels): void {
    const key = this.makeKey(name, labels);
    this.gauges.set(key, value);
  }

  histogram(name: string, value: number, labels?: MetricLabels): void {
    const key = this.makeKey(name, labels);
    const values = this.histograms.get(key) ?? [];
    values.push(value);
    this.histograms.set(key, values);
  }

  startTimer(name: string, labels?: MetricLabels): () => number {
    const start = performance.now();
    return () => {
      const duration = performance.now() - start;
      this.histogram(name, duration, labels);
      return duration;
    };
  }

  // For testing/debugging
  getCounter(name: string, labels?: MetricLabels): number {
    return this.counters.get(this.makeKey(name, labels)) ?? 0;
  }

  getGauge(name: string, labels?: MetricLabels): number | undefined {
    return this.gauges.get(this.makeKey(name, labels));
  }

  getHistogram(name: string, labels?: MetricLabels): number[] {
    return this.histograms.get(this.makeKey(name, labels)) ?? [];
  }

  /** Export all metrics in Prometheus format */
  toPrometheusFormat(): string {
    const lines: string[] = [];

    for (const [key, value] of this.counters) {
      lines.push(`# TYPE ${key.split('{')[0]} counter`);
      lines.push(`${key} ${value}`);
    }

    for (const [key, value] of this.gauges) {
      lines.push(`# TYPE ${key.split('{')[0]} gauge`);
      lines.push(`${key} ${value}`);
    }

    for (const [key, values] of this.histograms) {
      const name = key.split('{')[0];
      lines.push(`# TYPE ${name} histogram`);
      const sum = values.reduce((a, b) => a + b, 0);
      const count = values.length;
      lines.push(`${key.replace('}', ',le="+Inf"}')} ${count}`);
      lines.push(`${name}_sum${key.includes('{') ? key.slice(key.indexOf('{')) : ''} ${sum}`);
      lines.push(`${name}_count${key.includes('{') ? key.slice(key.indexOf('{')) : ''} ${count}`);
    }

    return lines.join('\n');
  }

  reset(): void {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
  }
}

// ============================================================================
// DEFAULT TRACER (SIMPLE)
// ============================================================================

function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

class SimpleSpan implements Span {
  context: SpanContext;
  name: string;
  startTime: number;
  endTime?: number;
  attributes: Record<string, unknown> = {};
  events: Array<{ name: string; timestamp: number; attributes?: Record<string, unknown> }> = [];
  status: 'ok' | 'error' | 'unset' = 'unset';
  private statusMessage?: string;

  constructor(name: string, parentContext?: SpanContext) {
    this.name = name;
    this.startTime = performance.now();
    this.context = {
      traceId: parentContext?.traceId ?? generateId(),
      spanId: generateId(),
      parentSpanId: parentContext?.spanId,
    };
  }

  end(): void {
    this.endTime = performance.now();
  }

  addEvent(name: string, attributes?: Record<string, unknown>): void {
    this.events.push({ name, timestamp: performance.now(), attributes });
  }

  setStatus(status: 'ok' | 'error', message?: string): void {
    this.status = status;
    this.statusMessage = message;
  }

  setAttribute(key: string, value: unknown): void {
    this.attributes[key] = value;
  }

  getDuration(): number | undefined {
    if (this.endTime === undefined) return undefined;
    return this.endTime - this.startTime;
  }
}

export class SimpleTracer implements ITracer {
  private activeSpan?: Span;
  private spans: SimpleSpan[] = [];

  startSpan(name: string, parentContext?: SpanContext): Span {
    const span = new SimpleSpan(name, parentContext ?? this.activeSpan?.context);
    this.spans.push(span);
    this.activeSpan = span;
    return span;
  }

  getActiveSpan(): Span | undefined {
    return this.activeSpan;
  }

  async withSpan<T>(name: string, fn: (span: Span) => T | Promise<T>): Promise<T> {
    const span = this.startSpan(name);
    try {
      const result = await fn(span);
      span.setStatus('ok');
      return result;
    } catch (error) {
      span.setStatus('error', error instanceof Error ? error.message : 'Unknown error');
      throw error;
    } finally {
      span.end();
    }
  }

  getSpans(): SimpleSpan[] {
    return [...this.spans];
  }

  clear(): void {
    this.spans = [];
    this.activeSpan = undefined;
  }
}

// ============================================================================
// OBSERVABILITY MANAGER
// ============================================================================

export interface ObservabilityConfig {
  logger?: ILogger;
  metrics?: IMetrics;
  tracer?: ITracer;
  /** Default log level */
  logLevel?: LogLevel;
  /** Service name for labeling */
  serviceName?: string;
}

/**
 * Central observability manager
 *
 * Provides unified access to logging, metrics, and tracing.
 * Can be configured with custom implementations or uses defaults.
 */
export class ObservabilityManager {
  readonly logger: ILogger;
  readonly metrics: IMetrics;
  readonly tracer: ITracer;
  readonly serviceName: string;

  constructor(config: ObservabilityConfig = {}) {
    this.serviceName = config.serviceName ?? 'tokenisation-sdk';
    this.logger = config.logger ?? new ConsoleLogger({
      level: config.logLevel ?? LogLevel.INFO,
      context: { service: this.serviceName },
    });
    this.metrics = config.metrics ?? new InMemoryMetrics();
    this.tracer = config.tracer ?? new SimpleTracer();
  }

  /**
   * Create a child logger with additional context
   */
  childLogger(context: LogContext): ILogger {
    return this.logger.child(context);
  }

  /**
   * Wrap an async operation with logging, metrics, and tracing
   */
  async instrument<T>(
    operation: string,
    fn: () => T | Promise<T>,
    context?: LogContext
  ): Promise<T> {
    const opLogger = this.logger.child({ operation, ...context });
    const stopTimer = this.metrics.startTimer('operation_duration_ms', { operation });

    opLogger.debug(`Starting ${operation}`);
    this.metrics.increment('operation_started_total', { operation });

    try {
      const result = await this.tracer.withSpan(operation, async (span) => {
        if (context) {
          Object.entries(context).forEach(([k, v]) => {
            span.setAttribute(k, v);
          });
        }
        return fn();
      });

      const duration = stopTimer();
      this.metrics.increment('operation_success_total', { operation });
      opLogger.info(`Completed ${operation}`, { durationMs: duration });

      return result;
    } catch (error) {
      stopTimer();
      this.metrics.increment('operation_error_total', { operation });
      opLogger.error(`Failed ${operation}`, error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let defaultObservability: ObservabilityManager | undefined;

export function getObservability(): ObservabilityManager {
  if (!defaultObservability) {
    defaultObservability = new ObservabilityManager();
  }
  return defaultObservability;
}

export function configureObservability(config: ObservabilityConfig): ObservabilityManager {
  defaultObservability = new ObservabilityManager(config);
  return defaultObservability;
}

// ============================================================================
// SDK METRICS DEFINITIONS
// ============================================================================

/** Standard metrics for SDK operations */
export const SDK_METRICS = {
  // Asset operations
  ASSET_CREATED: 'sdk_asset_created_total',
  ASSET_STATE_TRANSITION: 'sdk_asset_state_transition_total',

  // Token operations
  TOKEN_MINTED: 'sdk_token_minted_total',
  TOKEN_TRANSFERRED: 'sdk_token_transferred_total',
  TOKEN_BURNED: 'sdk_token_burned_total',

  // Compliance
  COMPLIANCE_CHECK: 'sdk_compliance_check_total',
  COMPLIANCE_VIOLATION: 'sdk_compliance_violation_total',

  // Custody
  CUSTODY_RECOVERY_INITIATED: 'sdk_custody_recovery_initiated_total',
  CUSTODY_OVERRIDE_REQUESTED: 'sdk_custody_override_requested_total',

  // API
  API_REQUEST: 'sdk_api_request_total',
  API_REQUEST_DURATION: 'sdk_api_request_duration_ms',
  API_ERROR: 'sdk_api_error_total',

  // Chain interactions
  CHAIN_TX_SENT: 'sdk_chain_tx_sent_total',
  CHAIN_TX_CONFIRMED: 'sdk_chain_tx_confirmed_total',
  CHAIN_TX_FAILED: 'sdk_chain_tx_failed_total',
  CHAIN_TX_DURATION: 'sdk_chain_tx_duration_ms',
} as const;

export default ObservabilityManager;
