import { NodeSDK } from '@opentelemetry/sdk-node';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { BatchSpanProcessor, ConsoleSpanExporter } from '@opentelemetry/sdk-trace-node';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { trace, metrics, SpanStatusCode, context, propagation } from '@opentelemetry/api';
import type { Span, Tracer, Counter, Histogram } from '@opentelemetry/api';

// Configuration
const config = {
  serviceName: process.env.OTEL_SERVICE_NAME || '1person-api',
  serviceVersion: process.env.OTEL_SERVICE_VERSION || '1.0.0',
  environment: process.env.NODE_ENV || 'development',
  otlpEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318',
  enabled: process.env.OTEL_ENABLED !== 'false',
};

let sdk: NodeSDK | null = null;

// Initialize OpenTelemetry
export function initTelemetry(): void {
  if (!config.enabled) {
    console.log('OpenTelemetry disabled');
    return;
  }

  try {
    const resource = new Resource({
      [ATTR_SERVICE_NAME]: config.serviceName,
      [ATTR_SERVICE_VERSION]: config.serviceVersion,
      'deployment.environment': config.environment,
    });

    // Use console exporter in development, OTLP in production
    const traceExporter = config.environment === 'production'
      ? new OTLPTraceExporter({ url: `${config.otlpEndpoint}/v1/traces` })
      : new ConsoleSpanExporter();

    const metricExporter = new OTLPMetricExporter({
      url: `${config.otlpEndpoint}/v1/metrics`,
    });

    sdk = new NodeSDK({
      resource,
      spanProcessor: new BatchSpanProcessor(traceExporter),
      metricReader: new PeriodicExportingMetricReader({
        exporter: metricExporter,
        exportIntervalMillis: 60000, // Export metrics every minute
      }),
      instrumentations: [
        new HttpInstrumentation(),
        getNodeAutoInstrumentations({
          '@opentelemetry/instrumentation-fs': { enabled: false },
        }),
      ],
    });

    sdk.start();
    console.log('OpenTelemetry initialized');

    // Graceful shutdown
    process.on('SIGTERM', () => {
      sdk?.shutdown()
        .then(() => console.log('Telemetry shut down'))
        .catch((error) => console.error('Telemetry shutdown error', error));
    });
  } catch (error) {
    console.error('Failed to initialize OpenTelemetry:', error);
  }
}

// Get tracer for a component
export function getTracer(name: string): Tracer {
  return trace.getTracer(name, config.serviceVersion);
}

// Custom metrics
const meter = metrics.getMeter(config.serviceName, config.serviceVersion);

// Request metrics
export const requestCounter = meter.createCounter('http_requests_total', {
  description: 'Total number of HTTP requests',
});

export const requestDuration = meter.createHistogram('http_request_duration_seconds', {
  description: 'HTTP request duration in seconds',
});

// Agent metrics
export const agentTaskCounter = meter.createCounter('agent_tasks_total', {
  description: 'Total number of agent tasks',
});

export const agentActionDuration = meter.createHistogram('agent_action_duration_seconds', {
  description: 'Agent action execution duration',
});

export const agentTokenUsage = meter.createCounter('agent_tokens_total', {
  description: 'Total tokens used by agents',
});

export const agentCostCounter = meter.createCounter('agent_cost_usd_total', {
  description: 'Total cost in USD by agents',
});

// LLM metrics
export const llmRequestCounter = meter.createCounter('llm_requests_total', {
  description: 'Total number of LLM API requests',
});

export const llmRequestDuration = meter.createHistogram('llm_request_duration_seconds', {
  description: 'LLM API request duration',
});

export const llmTokensUsed = meter.createCounter('llm_tokens_used_total', {
  description: 'Total LLM tokens used',
});

// Error metrics
export const errorCounter = meter.createCounter('errors_total', {
  description: 'Total number of errors',
});

// Business metrics
export const decisionCounter = meter.createCounter('decisions_total', {
  description: 'Total number of decisions made',
});

export const conflictCounter = meter.createCounter('conflicts_total', {
  description: 'Total number of conflicts detected',
});

// Span helpers
export function startSpan(tracer: Tracer, name: string, attributes?: Record<string, string | number | boolean>): Span {
  return tracer.startSpan(name, { attributes });
}

export function endSpan(span: Span, status: 'ok' | 'error' = 'ok', errorMessage?: string): void {
  if (status === 'error') {
    span.setStatus({ code: SpanStatusCode.ERROR, message: errorMessage });
  } else {
    span.setStatus({ code: SpanStatusCode.OK });
  }
  span.end();
}

// Async span wrapper
export async function withSpan<T>(
  tracer: Tracer,
  name: string,
  fn: (span: Span) => Promise<T>,
  attributes?: Record<string, string | number | boolean>
): Promise<T> {
  const span = startSpan(tracer, name, attributes);

  try {
    const result = await fn(span);
    endSpan(span, 'ok');
    return result;
  } catch (error) {
    endSpan(span, 'error', error instanceof Error ? error.message : 'Unknown error');
    throw error;
  }
}

// Record agent action
export function recordAgentAction(
  agentId: string,
  agentRole: string,
  action: string,
  duration: number,
  success: boolean,
  tokens?: number,
  cost?: number
): void {
  const labels = { agent_id: agentId, agent_role: agentRole, action, success: String(success) };

  agentTaskCounter.add(1, labels);
  agentActionDuration.record(duration, labels);

  if (tokens) {
    agentTokenUsage.add(tokens, labels);
  }

  if (cost) {
    agentCostCounter.add(cost, labels);
  }
}

// Record LLM request
export function recordLLMRequest(
  model: string,
  duration: number,
  inputTokens: number,
  outputTokens: number,
  success: boolean
): void {
  const labels = { model, success: String(success) };

  llmRequestCounter.add(1, labels);
  llmRequestDuration.record(duration, labels);
  llmTokensUsed.add(inputTokens, { ...labels, type: 'input' });
  llmTokensUsed.add(outputTokens, { ...labels, type: 'output' });
}

// Record error
export function recordError(
  source: string,
  errorType: string,
  errorMessage: string
): void {
  errorCounter.add(1, { source, error_type: errorType });
}

// Export shutdown function
export function shutdownTelemetry(): Promise<void> {
  return sdk?.shutdown() || Promise.resolve();
}
