// Metrics collection for monitoring worker performance

export interface MetricValue {
  value: number;
  timestamp: number;
  labels?: Record<string, string>;
}

export interface MetricSummary {
  count: number;
  sum: number;
  min: number;
  max: number;
  avg: number;
  p50: number;
  p95: number;
  p99: number;
}

class Counter {
  private value: number = 0;
  private readonly name: string;
  private readonly labels: Record<string, string>;

  constructor(name: string, labels: Record<string, string> = {}) {
    this.name = name;
    this.labels = labels;
  }

  inc(amount: number = 1): void {
    this.value += amount;
  }

  get(): number {
    return this.value;
  }

  reset(): void {
    this.value = 0;
  }

  toJSON(): object {
    return {
      name: this.name,
      type: 'counter',
      value: this.value,
      labels: this.labels,
    };
  }
}

class Gauge {
  private value: number = 0;
  private readonly name: string;
  private readonly labels: Record<string, string>;

  constructor(name: string, labels: Record<string, string> = {}) {
    this.name = name;
    this.labels = labels;
  }

  set(value: number): void {
    this.value = value;
  }

  inc(amount: number = 1): void {
    this.value += amount;
  }

  dec(amount: number = 1): void {
    this.value -= amount;
  }

  get(): number {
    return this.value;
  }

  toJSON(): object {
    return {
      name: this.name,
      type: 'gauge',
      value: this.value,
      labels: this.labels,
    };
  }
}

class Histogram {
  private values: number[] = [];
  private readonly name: string;
  private readonly labels: Record<string, string>;
  private readonly maxValues: number;

  constructor(name: string, labels: Record<string, string> = {}, maxValues: number = 1000) {
    this.name = name;
    this.labels = labels;
    this.maxValues = maxValues;
  }

  observe(value: number): void {
    this.values.push(value);
    // Keep only the last maxValues
    if (this.values.length > this.maxValues) {
      this.values.shift();
    }
  }

  getSummary(): MetricSummary {
    if (this.values.length === 0) {
      return { count: 0, sum: 0, min: 0, max: 0, avg: 0, p50: 0, p95: 0, p99: 0 };
    }

    const sorted = [...this.values].sort((a, b) => a - b);
    const sum = this.values.reduce((a, b) => a + b, 0);

    return {
      count: this.values.length,
      sum,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      avg: sum / this.values.length,
      p50: sorted[Math.floor(sorted.length * 0.5)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)],
    };
  }

  reset(): void {
    this.values = [];
  }

  toJSON(): object {
    return {
      name: this.name,
      type: 'histogram',
      summary: this.getSummary(),
      labels: this.labels,
    };
  }
}

// Metrics registry
class MetricsRegistry {
  private counters: Map<string, Counter> = new Map();
  private gauges: Map<string, Gauge> = new Map();
  private histograms: Map<string, Histogram> = new Map();
  private startTime: number = Date.now();

  counter(name: string, labels: Record<string, string> = {}): Counter {
    const key = this.makeKey(name, labels);
    if (!this.counters.has(key)) {
      this.counters.set(key, new Counter(name, labels));
    }
    return this.counters.get(key)!;
  }

  gauge(name: string, labels: Record<string, string> = {}): Gauge {
    const key = this.makeKey(name, labels);
    if (!this.gauges.has(key)) {
      this.gauges.set(key, new Gauge(name, labels));
    }
    return this.gauges.get(key)!;
  }

  histogram(name: string, labels: Record<string, string> = {}): Histogram {
    const key = this.makeKey(name, labels);
    if (!this.histograms.has(key)) {
      this.histograms.set(key, new Histogram(name, labels));
    }
    return this.histograms.get(key)!;
  }

  private makeKey(name: string, labels: Record<string, string>): string {
    const labelStr = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
    return `${name}{${labelStr}}`;
  }

  getAll(): object {
    return {
      uptime: Date.now() - this.startTime,
      counters: Object.fromEntries(
        Array.from(this.counters.entries()).map(([k, v]) => [k, v.toJSON()])
      ),
      gauges: Object.fromEntries(
        Array.from(this.gauges.entries()).map(([k, v]) => [k, v.toJSON()])
      ),
      histograms: Object.fromEntries(
        Array.from(this.histograms.entries()).map(([k, v]) => [k, v.toJSON()])
      ),
    };
  }

  reset(): void {
    this.counters.forEach((c) => c.reset());
    this.histograms.forEach((h) => h.reset());
    // Gauges are not reset as they represent current state
  }
}

// Global metrics registry
export const metrics = new MetricsRegistry();

// Pre-defined metrics for common use cases
export const workerMetrics = {
  // Task metrics
  tasksReceived: metrics.counter('worker_tasks_received_total'),
  tasksCompleted: metrics.counter('worker_tasks_completed_total'),
  tasksFailed: metrics.counter('worker_tasks_failed_total'),
  taskDuration: metrics.histogram('worker_task_duration_ms'),
  activeJobs: metrics.gauge('worker_active_jobs'),

  // LLM metrics
  llmRequests: metrics.counter('worker_llm_requests_total'),
  llmErrors: metrics.counter('worker_llm_errors_total'),
  llmLatency: metrics.histogram('worker_llm_latency_ms'),
  llmTokensUsed: metrics.counter('worker_llm_tokens_total'),
  llmCost: metrics.counter('worker_llm_cost_cents'),

  // Queue metrics
  queueWaiting: metrics.gauge('worker_queue_waiting'),
  queueActive: metrics.gauge('worker_queue_active'),
  queueCompleted: metrics.gauge('worker_queue_completed'),
  queueFailed: metrics.gauge('worker_queue_failed'),

  // Agent metrics
  agentsActive: metrics.gauge('worker_agents_active'),
  agentCommands: metrics.counter('worker_agent_commands_total'),
};

// Helper function to measure execution time
export async function withMetrics<T>(
  fn: () => Promise<T>,
  histogram: Histogram,
  successCounter: Counter,
  errorCounter: Counter
): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    successCounter.inc();
    histogram.observe(Date.now() - start);
    return result;
  } catch (error) {
    errorCounter.inc();
    histogram.observe(Date.now() - start);
    throw error;
  }
}

// Print metrics periodically
export function startMetricsReporter(intervalMs: number = 60000): NodeJS.Timeout {
  return setInterval(() => {
    const allMetrics = metrics.getAll();
    console.log('[Metrics]', JSON.stringify(allMetrics, null, 2));
  }, intervalMs);
}
