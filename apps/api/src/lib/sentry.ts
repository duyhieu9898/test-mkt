import * as Sentry from '@sentry/node';
import { env } from './env';

let initialized = false;

export function initSentry() {
  if (initialized) return;
  if (!env.SENTRY_DSN) {
    console.log('[sentry] DSN not set, error tracking disabled');
    return;
  }
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.SENTRY_ENVIRONMENT,
    tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE,
    release: process.env.GIT_SHA || 'dev',
  });
  initialized = true;
  console.log('[sentry] initialized for', env.SENTRY_ENVIRONMENT);
}

export function captureError(err: unknown, context?: Record<string, unknown>) {
  if (!initialized) return;
  Sentry.captureException(err, { extra: context });
}

export { Sentry };
