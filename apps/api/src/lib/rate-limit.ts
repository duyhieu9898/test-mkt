/**
 * Per-tenant rate limiting (P0-D2).
 *
 * Enforces hard limits on LLM calls + campaign generation per tenant
 * to prevent cost runaway from accidental loops, bad prompts, or
 * scripted abuse. Keyed by tenantId (not userId) so sharing a tenant
 * across team members still triggers the shared limit.
 *
 * Storage: in-memory Map with time-window buckets. For production
 * multi-instance deployment this should move to Redis — we already
 * have Redis via docker-compose. But for the PMF phase a single-
 * instance in-memory tracker is sufficient and faster.
 *
 * Limits (post-PMF, tune with real data):
 *   - LLM calls:           per-minute 30, per-hour 500,  per-day 2000
 *   - Campaign generate:   per-hour 10, per-day 50
 *   - Document upload:     per-hour 20, per-day 100
 *
 * Free-tier customers get half the above. Tier is passed in by the
 * caller from their subscription plan.
 */

import { HTTPException } from 'hono/http-exception';

export type RateLimitKind =
  | 'llm_call'
  | 'campaign_generate'
  | 'document_upload';

export type RateLimitTier = 'free' | 'pro' | 'business';

interface Limit {
  perMinute?: number;
  perHour: number;
  perDay: number;
}

const LIMITS: Record<RateLimitKind, Record<RateLimitTier, Limit>> = {
  llm_call: {
    free:     { perMinute: 15, perHour: 250,  perDay: 1000 },
    pro:      { perMinute: 30, perHour: 500,  perDay: 2000 },
    business: { perMinute: 60, perHour: 2000, perDay: 10000 },
  },
  campaign_generate: {
    free:     { perHour: 5,  perDay: 25 },
    pro:      { perHour: 10, perDay: 50 },
    business: { perHour: 30, perDay: 200 },
  },
  document_upload: {
    free:     { perHour: 10, perDay: 50 },
    pro:      { perHour: 20, perDay: 100 },
    business: { perHour: 60, perDay: 500 },
  },
};

interface BucketEntry {
  count: number;
  resetAt: number;
}

// Keyed by `${tenantId}:${kind}:${window}`
const buckets = new Map<string, BucketEntry>();

// Cleanup stale buckets every 5 minutes
let cleanupTimer: NodeJS.Timeout | null = null;
function ensureCleanup() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of buckets.entries()) {
      if (entry.resetAt < now) buckets.delete(key);
    }
  }, 5 * 60 * 1000);
  cleanupTimer.unref?.();
}

function bucketKey(tenantId: string, kind: RateLimitKind, window: 'minute' | 'hour' | 'day'): string {
  return `${tenantId}:${kind}:${window}`;
}

function windowMs(window: 'minute' | 'hour' | 'day'): number {
  switch (window) {
    case 'minute': return 60_000;
    case 'hour':   return 60 * 60_000;
    case 'day':    return 24 * 60 * 60_000;
  }
}

/**
 * Check AND increment the rate limit counters for a tenant action.
 * Throws HTTPException 429 if any window is exceeded.
 *
 * @example
 *   await enforceRateLimit(tenantId, 'llm_call', 'pro');
 */
export async function enforceRateLimit(
  tenantId: string,
  kind: RateLimitKind,
  tier: RateLimitTier = 'free',
): Promise<void> {
  ensureCleanup();

  const limits = LIMITS[kind][tier];
  const now = Date.now();
  const windows: Array<'minute' | 'hour' | 'day'> = [];
  if (limits.perMinute !== undefined) windows.push('minute');
  windows.push('hour', 'day');

  // Pre-check: if any window is already over limit, reject before incrementing any.
  for (const window of windows) {
    const key = bucketKey(tenantId, kind, window);
    const entry = buckets.get(key);
    if (!entry) continue;
    if (entry.resetAt < now) {
      buckets.delete(key);
      continue;
    }
    const limit =
      window === 'minute' ? limits.perMinute! :
      window === 'hour'   ? limits.perHour :
                            limits.perDay;
    if (entry.count >= limit) {
      const secondsLeft = Math.ceil((entry.resetAt - now) / 1000);
      throw new HTTPException(429, {
        message: `You've hit your ${window}ly limit for this action. Try again in ${humanizeSeconds(secondsLeft)}.`,
      });
    }
  }

  // Increment all windows (atomic-ish — Map ops are single-threaded in Node)
  for (const window of windows) {
    const key = bucketKey(tenantId, kind, window);
    const existing = buckets.get(key);
    if (!existing || existing.resetAt < now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs(window) });
    } else {
      existing.count += 1;
    }
  }
}

/**
 * Read-only snapshot of a tenant's current rate-limit status — used
 * by the /metrics admin page and the "remaining quota" chip in the UI.
 */
export function getRateLimitStatus(
  tenantId: string,
  kind: RateLimitKind,
  tier: RateLimitTier = 'free',
): {
  kind: RateLimitKind;
  tier: RateLimitTier;
  usage: Record<string, { used: number; limit: number; resetAt: number | null }>;
} {
  const limits = LIMITS[kind][tier];
  const now = Date.now();
  const windows: Array<'minute' | 'hour' | 'day'> = [];
  if (limits.perMinute !== undefined) windows.push('minute');
  windows.push('hour', 'day');

  const usage: Record<string, { used: number; limit: number; resetAt: number | null }> = {};
  for (const window of windows) {
    const key = bucketKey(tenantId, kind, window);
    const entry = buckets.get(key);
    const fresh = entry && entry.resetAt >= now;
    const limit =
      window === 'minute' ? limits.perMinute! :
      window === 'hour'   ? limits.perHour :
                            limits.perDay;
    usage[window] = {
      used: fresh ? entry!.count : 0,
      limit,
      resetAt: fresh ? entry!.resetAt : null,
    };
  }
  return { kind, tier, usage };
}

function humanizeSeconds(s: number): string {
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.ceil(s / 60)}m`;
  if (s < 86400) return `${Math.ceil(s / 3600)}h`;
  return `${Math.ceil(s / 86400)}d`;
}

/**
 * Middleware helper for Hono routes. Usage:
 *
 *   campaignsRouter.post('/:companyId/generate',
 *     rateLimitMiddleware('campaign_generate', 'pro'),
 *     async (c) => { ... }
 *   );
 *
 * The middleware derives the tenantId from the companyId route param
 * via ensureTenantForCompany. If no companyId is in params, it
 * falls back to the authenticated userId.
 */
export function rateLimitMiddleware(kind: RateLimitKind, defaultTier: RateLimitTier = 'free') {
  return async (c: any, next: any) => {
    try {
      const companyId = c.req.param('companyId');
      let tenantKey: string;
      if (companyId) {
        // Reuse the company's id as the rate-limit key — avoids a DB roundtrip
        // for every request. The real tenantId and the companyId are 1:1 via
        // ensureTenantForCompany anyway.
        tenantKey = companyId;
      } else {
        const user = c.get('user');
        tenantKey = user?.userId ?? 'anonymous';
      }
      await enforceRateLimit(tenantKey, kind, defaultTier);
      return next();
    } catch (err) {
      if (err instanceof HTTPException) throw err;
      // Non-HTTP errors from rate limit: don't block the request
      console.warn('[rate-limit] unexpected error, allowing request:', err);
      return next();
    }
  };
}

/** Reset counters for a tenant (admin/testing use). */
export function resetRateLimits(tenantId: string, kind?: RateLimitKind): void {
  for (const key of buckets.keys()) {
    if (!key.startsWith(`${tenantId}:`)) continue;
    if (kind && !key.includes(`:${kind}:`)) continue;
    buckets.delete(key);
  }
}
