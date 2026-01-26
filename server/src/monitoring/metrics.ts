/**
 * Prometheus Metrics for Tokenization Platform
 *
 * Provides observability for API performance, blockchain interactions,
 * and business metrics.
 */

export interface MetricLabels {
  [key: string]: string | number;
}

export interface CounterMetric {
  name: string;
  help: string;
  labelNames: string[];
  values: Map<string, number>;
}

export interface GaugeMetric {
  name: string;
  help: string;
  labelNames: string[];
  values: Map<string, number>;
}

export interface HistogramMetric {
  name: string;
  help: string;
  labelNames: string[];
  buckets: number[];
  values: Map<string, number[]>;
  sums: Map<string, number>;
  counts: Map<string, number>;
}

/**
 * Metrics Registry
 */
class MetricsRegistry {
  private counters: Map<string, CounterMetric> = new Map();
  private gauges: Map<string, GaugeMetric> = new Map();
  private histograms: Map<string, HistogramMetric> = new Map();

  // ==================== COUNTERS ====================

  /**
   * Create a counter metric
   */
  createCounter(name: string, help: string, labelNames: string[] = []): void {
    this.counters.set(name, {
      name,
      help,
      labelNames,
      values: new Map(),
    });
  }

  /**
   * Increment a counter
   */
  incCounter(name: string, labels: MetricLabels = {}, value: number = 1): void {
    const counter = this.counters.get(name);
    if (!counter) return;

    const key = this.labelsToKey(labels);
    const current = counter.values.get(key) || 0;
    counter.values.set(key, current + value);
  }

  // ==================== GAUGES ====================

  /**
   * Create a gauge metric
   */
  createGauge(name: string, help: string, labelNames: string[] = []): void {
    this.gauges.set(name, {
      name,
      help,
      labelNames,
      values: new Map(),
    });
  }

  /**
   * Set a gauge value
   */
  setGauge(name: string, value: number, labels: MetricLabels = {}): void {
    const gauge = this.gauges.get(name);
    if (!gauge) return;

    const key = this.labelsToKey(labels);
    gauge.values.set(key, value);
  }

  /**
   * Increment a gauge
   */
  incGauge(name: string, labels: MetricLabels = {}, value: number = 1): void {
    const gauge = this.gauges.get(name);
    if (!gauge) return;

    const key = this.labelsToKey(labels);
    const current = gauge.values.get(key) || 0;
    gauge.values.set(key, current + value);
  }

  /**
   * Decrement a gauge
   */
  decGauge(name: string, labels: MetricLabels = {}, value: number = 1): void {
    this.incGauge(name, labels, -value);
  }

  // ==================== HISTOGRAMS ====================

  /**
   * Create a histogram metric
   */
  createHistogram(
    name: string,
    help: string,
    labelNames: string[] = [],
    buckets: number[] = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
  ): void {
    this.histograms.set(name, {
      name,
      help,
      labelNames,
      buckets: buckets.sort((a, b) => a - b),
      values: new Map(),
      sums: new Map(),
      counts: new Map(),
    });
  }

  /**
   * Observe a histogram value
   */
  observeHistogram(name: string, value: number, labels: MetricLabels = {}): void {
    const histogram = this.histograms.get(name);
    if (!histogram) return;

    const key = this.labelsToKey(labels);

    // Initialize if needed
    if (!histogram.values.has(key)) {
      histogram.values.set(key, new Array(histogram.buckets.length).fill(0));
      histogram.sums.set(key, 0);
      histogram.counts.set(key, 0);
    }

    // Update buckets
    const bucketValues = histogram.values.get(key)!;
    for (let i = 0; i < histogram.buckets.length; i++) {
      if (value <= histogram.buckets[i]) {
        bucketValues[i]++;
      }
    }

    // Update sum and count
    histogram.sums.set(key, (histogram.sums.get(key) || 0) + value);
    histogram.counts.set(key, (histogram.counts.get(key) || 0) + 1);
  }

  /**
   * Time a function and record to histogram
   */
  async timeHistogram<T>(
    name: string,
    fn: () => Promise<T>,
    labels: MetricLabels = {}
  ): Promise<T> {
    const start = performance.now();
    try {
      return await fn();
    } finally {
      const duration = (performance.now() - start) / 1000; // Convert to seconds
      this.observeHistogram(name, duration, labels);
    }
  }

  // ==================== EXPORT ====================

  /**
   * Export metrics in Prometheus format
   */
  toPrometheusFormat(): string {
    const lines: string[] = [];

    // Export counters
    for (const [, counter] of this.counters) {
      lines.push(`# HELP ${counter.name} ${counter.help}`);
      lines.push(`# TYPE ${counter.name} counter`);

      for (const [key, value] of counter.values) {
        const labelStr = key ? `{${key}}` : '';
        lines.push(`${counter.name}${labelStr} ${value}`);
      }
    }

    // Export gauges
    for (const [, gauge] of this.gauges) {
      lines.push(`# HELP ${gauge.name} ${gauge.help}`);
      lines.push(`# TYPE ${gauge.name} gauge`);

      for (const [key, value] of gauge.values) {
        const labelStr = key ? `{${key}}` : '';
        lines.push(`${gauge.name}${labelStr} ${value}`);
      }
    }

    // Export histograms
    for (const [, histogram] of this.histograms) {
      lines.push(`# HELP ${histogram.name} ${histogram.help}`);
      lines.push(`# TYPE ${histogram.name} histogram`);

      for (const [key, bucketValues] of histogram.values) {
        const labelPrefix = key ? `${key},` : '';

        // Export buckets
        for (let i = 0; i < histogram.buckets.length; i++) {
          const bucketLabel = `${labelPrefix}le="${histogram.buckets[i]}"`;
          lines.push(`${histogram.name}_bucket{${bucketLabel}} ${bucketValues[i]}`);
        }
        lines.push(`${histogram.name}_bucket{${labelPrefix}le="+Inf"} ${histogram.counts.get(key) || 0}`);

        // Export sum and count
        const labelStr = key ? `{${key}}` : '';
        lines.push(`${histogram.name}_sum${labelStr} ${histogram.sums.get(key) || 0}`);
        lines.push(`${histogram.name}_count${labelStr} ${histogram.counts.get(key) || 0}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Convert labels to string key
   */
  private labelsToKey(labels: MetricLabels): string {
    const entries = Object.entries(labels).sort(([a], [b]) => a.localeCompare(b));
    return entries.map(([k, v]) => `${k}="${v}"`).join(',');
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    for (const counter of this.counters.values()) {
      counter.values.clear();
    }
    for (const gauge of this.gauges.values()) {
      gauge.values.clear();
    }
    for (const histogram of this.histograms.values()) {
      histogram.values.clear();
      histogram.sums.clear();
      histogram.counts.clear();
    }
  }
}

// Create and configure default metrics
export const metrics = new MetricsRegistry();

// ==================== API METRICS ====================

metrics.createCounter('http_requests_total', 'Total HTTP requests', ['method', 'path', 'status']);
metrics.createHistogram('http_request_duration_seconds', 'HTTP request duration', ['method', 'path']);
metrics.createGauge('http_requests_in_flight', 'Current in-flight requests');

// ==================== BLOCKCHAIN METRICS ====================

metrics.createCounter('blockchain_transactions_total', 'Total blockchain transactions', ['chain', 'type', 'status']);
metrics.createHistogram('blockchain_transaction_duration_seconds', 'Blockchain transaction duration', ['chain', 'type']);
metrics.createGauge('blockchain_gas_price_gwei', 'Current gas price in gwei', ['chain']);
metrics.createCounter('blockchain_rpc_errors_total', 'Total RPC errors', ['chain', 'error_type']);

// ==================== TOKEN METRICS ====================

metrics.createCounter('tokens_minted_total', 'Total tokens minted', ['token', 'chain']);
metrics.createCounter('tokens_burned_total', 'Total tokens burned', ['token', 'chain']);
metrics.createCounter('tokens_transferred_total', 'Total token transfers', ['token', 'chain']);
metrics.createGauge('token_total_supply', 'Current token total supply', ['token', 'chain']);
metrics.createGauge('token_holder_count', 'Number of token holders', ['token', 'chain']);

// ==================== KYC METRICS ====================

metrics.createCounter('kyc_verifications_total', 'Total KYC verifications', ['provider', 'level', 'status']);
metrics.createHistogram('kyc_verification_duration_seconds', 'KYC verification duration', ['provider', 'level']);
metrics.createGauge('kyc_pending_count', 'Current pending KYC verifications');

// ==================== ORACLE METRICS ====================

metrics.createCounter('oracle_requests_total', 'Total oracle requests', ['type', 'status']);
metrics.createHistogram('oracle_request_duration_seconds', 'Oracle request duration', ['type']);
metrics.createGauge('oracle_price', 'Current oracle price', ['pair']);
metrics.createGauge('oracle_last_update_timestamp', 'Last oracle update timestamp', ['pair']);

// ==================== DIVIDEND METRICS ====================

metrics.createCounter('dividends_declared_total', 'Total dividends declared', ['token']);
metrics.createCounter('dividends_claimed_total', 'Total dividend claims', ['token']);
metrics.createGauge('dividends_pending_amount', 'Pending dividend amount', ['token', 'currency']);

// ==================== COMPLIANCE METRICS ====================

metrics.createCounter('compliance_checks_total', 'Total compliance checks', ['type', 'result']);
metrics.createCounter('sanctions_screenings_total', 'Total sanctions screenings', ['result']);
metrics.createGauge('blacklisted_addresses_count', 'Number of blacklisted addresses');

// ==================== HELPER FUNCTIONS ====================

/**
 * Record HTTP request metrics
 */
export function recordHttpRequest(
  method: string,
  path: string,
  status: number,
  durationSeconds: number
): void {
  metrics.incCounter('http_requests_total', { method, path, status });
  metrics.observeHistogram('http_request_duration_seconds', durationSeconds, { method, path });
}

/**
 * Record blockchain transaction
 */
export function recordBlockchainTx(
  chain: string,
  type: string,
  status: 'success' | 'failed',
  durationSeconds?: number
): void {
  metrics.incCounter('blockchain_transactions_total', { chain, type, status });
  if (durationSeconds !== undefined) {
    metrics.observeHistogram('blockchain_transaction_duration_seconds', durationSeconds, { chain, type });
  }
}

/**
 * Record KYC verification
 */
export function recordKycVerification(
  provider: string,
  level: string,
  status: string,
  durationSeconds?: number
): void {
  metrics.incCounter('kyc_verifications_total', { provider, level, status });
  if (durationSeconds !== undefined) {
    metrics.observeHistogram('kyc_verification_duration_seconds', durationSeconds, { provider, level });
  }
}

export default metrics;
