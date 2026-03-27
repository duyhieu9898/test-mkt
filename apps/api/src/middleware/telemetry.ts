import { MiddlewareHandler } from 'hono';
import { getTracer, requestCounter, requestDuration, errorCounter } from '../lib/telemetry';

const tracer = getTracer('hono-http');

export const telemetryMiddleware: MiddlewareHandler = async (c, next) => {
  const startTime = performance.now();
  const method = c.req.method;
  const path = c.req.path;
  const route = c.req.routePath || path;

  // Start span
  const span = tracer.startSpan(`HTTP ${method} ${route}`, {
    attributes: {
      'http.method': method,
      'http.url': c.req.url,
      'http.route': route,
      'http.host': c.req.header('host') || '',
      'http.user_agent': c.req.header('user-agent') || '',
    },
  });

  try {
    await next();

    const status = c.res.status;
    const duration = (performance.now() - startTime) / 1000; // Convert to seconds

    // Record request metrics
    const labels = {
      method,
      route,
      status_code: String(status),
    };

    requestCounter.add(1, labels);
    requestDuration.record(duration, labels);

    // Update span
    span.setAttributes({
      'http.status_code': status,
      'http.response_content_length': c.res.headers.get('content-length') || '0',
    });

    span.setStatus({ code: status < 400 ? 0 : 1 });
  } catch (error) {
    const duration = (performance.now() - startTime) / 1000;

    // Record error
    errorCounter.add(1, {
      source: 'http',
      error_type: error instanceof Error ? error.name : 'Unknown',
    });

    requestCounter.add(1, {
      method,
      route,
      status_code: '500',
    });

    requestDuration.record(duration, {
      method,
      route,
      status_code: '500',
    });

    // Update span with error
    span.setStatus({
      code: 1,
      message: error instanceof Error ? error.message : 'Unknown error',
    });

    if (error instanceof Error) {
      span.recordException(error);
    }

    throw error;
  } finally {
    span.end();
  }
};
