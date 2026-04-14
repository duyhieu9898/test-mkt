/**
 * Admin Config Panel API
 *
 * Manages app-wide configuration: LLM providers, feature→LLM mapping,
 * integrations (Stripe, Google OAuth, Meta Ads, Sentry, Langfuse),
 * image generation providers.
 *
 * All secrets are encrypted at rest. The admin UI receives MASKED
 * secrets (last 4 chars only) — plaintext is never transmitted to the
 * frontend.
 *
 * Route: /api/v1/admin/config/*
 * Auth: admin role required (checked by requireAdmin middleware)
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { HTTPException } from 'hono/http-exception';
import { authMiddleware, getUserCompanies } from '../middleware/auth';
import { getTenantAI } from '../lib/tenant-ai';
import { invalidateConfigCache } from '../lib/config-resolver';
import { resetLLMClients } from '../lib/llm';
import { db } from '../lib/db';
import { users } from '@1person/core/db';
import { eq } from 'drizzle-orm';

const adminConfigRouter = new Hono();
adminConfigRouter.use('*', authMiddleware);

// --- Admin gate ---------------------------------------------------------

async function requireAdmin(c: any, next: any) {
  const { userId } = c.get('user');
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { id: true, role: true },
  });
  if (!user || user.role !== 'admin') {
    throw new HTTPException(403, { message: 'Admin access required' });
  }
  return next();
}

adminConfigRouter.use('*', requireAdmin);

// --- Schemas ------------------------------------------------------------

const upsertSchema = z.object({
  category: z.enum(['provider', 'feature', 'integration', 'image', 'transcription']),
  key: z.string().min(1).max(100),
  label: z.string().max(255).optional(),
  description: z.string().max(2000).nullable().optional(),
  value: z.record(z.unknown()).optional(),
  secrets: z.record(z.string()).optional(),
  enabled: z.boolean().optional(),
});

// --- Read --------------------------------------------------------------

/** GET /admin/config — full config snapshot (grouped by category) */
adminConfigRouter.get('/', async (c) => {
  const ai = getTenantAI();
  const all = await ai.config.listPublic();
  const grouped: Record<string, any[]> = {
    provider: [],
    feature: [],
    integration: [],
    image: [],
    transcription: [],
  };
  for (const row of all) {
    (grouped[row.category] ??= []).push(row);
  }
  return c.json({
    providers: grouped.provider,
    features: grouped.feature,
    integrations: grouped.integration,
    imageProviders: grouped.image,
    transcriptionProviders: grouped.transcription,
  });
});

/** GET /admin/config/:category */
adminConfigRouter.get('/:category', async (c) => {
  const category = c.req.param('category') as any;
  if (!['provider', 'feature', 'integration', 'image', 'transcription'].includes(category)) {
    throw new HTTPException(400, { message: 'Invalid category' });
  }
  const ai = getTenantAI();
  const rows = await ai.config.listPublic(category);
  return c.json({ data: rows });
});

/** GET /admin/config/:category/:key — single config with masked secrets */
adminConfigRouter.get('/:category/:key', async (c) => {
  const category = c.req.param('category') as any;
  const key = c.req.param('key');
  const ai = getTenantAI();
  const row = await ai.config.getPublic(category, key);
  if (!row) {
    throw new HTTPException(404, { message: 'Config not found' });
  }
  return c.json(row);
});

// --- Write --------------------------------------------------------------

/** PUT /admin/config/:category/:key — upsert config */
adminConfigRouter.put(
  '/:category/:key',
  zValidator('json', upsertSchema.partial().omit({ category: true, key: true })),
  async (c) => {
    const { userId } = c.get('user');
    const category = c.req.param('category') as any;
    const key = c.req.param('key');
    const body = c.req.valid('json');
    const ai = getTenantAI();
    await ai.config.upsert(
      {
        category,
        key,
        label: body.label,
        description: body.description,
        value: body.value,
        secrets: body.secrets,
        enabled: body.enabled,
      },
      `admin:${userId}`,
    );
    // Invalidate caches — provider key may have changed, so the LLM
    // client cache must be flushed too.
    invalidateConfigCache(category, key);
    if (category === 'provider') resetLLMClients();

    const updated = await ai.config.getPublic(category, key);
    return c.json(updated);
  },
);

/** DELETE /admin/config/:category/:key */
adminConfigRouter.delete('/:category/:key', async (c) => {
  const { userId } = c.get('user');
  const category = c.req.param('category') as any;
  const key = c.req.param('key');
  const ai = getTenantAI();
  await ai.config.delete(category, key, `admin:${userId}`);
  invalidateConfigCache(category, key);
  if (category === 'provider') resetLLMClients();
  return c.json({ success: true });
});

// --- Connection test ----------------------------------------------------

/** POST /admin/config/:category/:key/test — ping the provider */
adminConfigRouter.post('/:category/:key/test', async (c) => {
  const category = c.req.param('category') as any;
  const key = c.req.param('key');
  const ai = getTenantAI();

  const cfg = await ai.config.get(category, key);
  if (!cfg) throw new HTTPException(404, { message: 'Config not found' });

  try {
    const result = await testConnection(category, key, cfg.value, cfg.secrets);
    await ai.config.updateStatus(category, key, result.ok ? 'connected' : 'error', result.message);
    return c.json({ ok: result.ok, message: result.message, model: result.model });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await ai.config.updateStatus(category, key, 'error', message);
    return c.json({ ok: false, message }, 200);
  }
});

// --- Seed (bootstrap) ---------------------------------------------------

/** POST /admin/config/seed — populate initial rows
 *  Body: { overwriteFeatures?: boolean } — when true, feature rows
 *  are reset to the latest seed (use after tier schema upgrades).
 */
adminConfigRouter.post(
  '/seed',
  zValidator(
    'json',
    z
      .object({
        overwriteFeatures: z.boolean().optional(),
        overwriteImages: z.boolean().optional(),
      })
      .optional(),
  ),
  async (c) => {
    const body = c.req.valid('json' as never) as
      | { overwriteFeatures?: boolean; overwriteImages?: boolean }
      | undefined;
    const ai = getTenantAI();
    const result = await ai.config.seedDefaults(body);
    // Any feature reset invalidates the resolver cache
    invalidateConfigCache();
    resetLLMClients();
    return c.json(result);
  },
);

// ========================================================================
// Provider connection tests
// ========================================================================

async function testConnection(
  category: string,
  key: string,
  value: Record<string, unknown>,
  secrets: Record<string, string>,
): Promise<{ ok: boolean; message: string; model?: string }> {
  if (category === 'provider') {
    const apiKey = secrets.apiKey;
    if (!apiKey || apiKey.length === 0) {
      return { ok: false, message: 'No API key set' };
    }

    if (key === 'openai') {
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (res.ok) {
        const data: any = await res.json();
        return { ok: true, message: `Connected — ${data.data?.length ?? 0} models available` };
      }
      return { ok: false, message: `HTTP ${res.status}` };
    }

    if (key === 'anthropic') {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5',
          max_tokens: 5,
          messages: [{ role: 'user', content: 'hi' }],
        }),
      });
      if (res.ok) return { ok: true, message: 'Connected' };
      const errText = await res.text().catch(() => '');
      return { ok: false, message: `HTTP ${res.status}: ${errText.substring(0, 100)}` };
    }

    if (key === 'gemini') {
      const baseUrl = (value.baseUrl as string) || 'https://generativelanguage.googleapis.com/v1beta';
      const res = await fetch(`${baseUrl}/models?key=${encodeURIComponent(apiKey)}`);
      if (res.ok) {
        const data: any = await res.json();
        return { ok: true, message: `Connected — ${data.models?.length ?? 0} models available` };
      }
      return { ok: false, message: `HTTP ${res.status}` };
    }

    if (key === 'ollama') {
      const baseUrl = (value.baseUrl as string) || 'http://localhost:11434';
      try {
        const res = await fetch(`${baseUrl.replace(/\/v1\/?$/, '')}/api/tags`);
        if (res.ok) {
          const data: any = await res.json();
          return { ok: true, message: `Connected — ${data.models?.length ?? 0} models loaded` };
        }
        return { ok: false, message: `HTTP ${res.status}` };
      } catch (err) {
        return { ok: false, message: err instanceof Error ? err.message : 'Connection refused' };
      }
    }
  }

  if (category === 'image') {
    // DALL-E and Gemini Imagen delegate to the LLM provider rows, so
    // the test just checks that the underlying provider is reachable.
    if (key === 'dalle' || key === 'gemini-imagen') {
      const delegateKey = key === 'dalle' ? 'openai' : 'gemini';
      const ai = getTenantAI();
      const providerCfg = await ai.config.get('provider', delegateKey);
      if (!providerCfg) {
        return { ok: false, message: `Configure the ${delegateKey} provider first` };
      }
      const r = await testConnection('provider', delegateKey, providerCfg.value, providerCfg.secrets);
      return { ok: r.ok, message: r.ok ? `Delegates to ${delegateKey} — ${r.message}` : r.message };
    }
    if (key === 'banana' || key === 'banana-pro') {
      const apiKey = secrets.apiKey;
      const modelKey = value.modelKey as string | undefined;
      if (!apiKey) return { ok: false, message: 'No API key set' };
      if (!modelKey) return { ok: false, message: 'Model key not set' };
      // Banana has no public health endpoint. Do a HEAD on the start
      // endpoint — 4xx means our request shape is invalid but the
      // service is alive, which is good enough for a "reachable" probe.
      try {
        const endpoint = (value.endpoint as string) || 'https://api.banana.dev/start/v4/';
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apiKey, modelKey, modelInputs: { prompt: 'ping', num_inference_steps: 1 } }),
          signal: AbortSignal.timeout(15000),
        });
        if (res.ok) return { ok: true, message: 'Banana endpoint reachable', model: modelKey };
        if (res.status >= 400 && res.status < 500) {
          return {
            ok: false,
            message: `HTTP ${res.status} — check API key / model key`,
          };
        }
        return { ok: false, message: `HTTP ${res.status}` };
      } catch (err) {
        return { ok: false, message: err instanceof Error ? err.message : 'Connection failed' };
      }
    }
  }

  if (category === 'integration') {
    if (key === 'langfuse') {
      const baseUrl = (value.baseUrl as string) || 'http://localhost:5050';
      const res = await fetch(`${baseUrl}/api/public/health`);
      if (res.ok) return { ok: true, message: 'Langfuse healthy' };
      return { ok: false, message: `HTTP ${res.status}` };
    }
    if (key === 'stripe') {
      if (!secrets.stripeSecretKey) {
        return { ok: false, message: 'No Stripe secret key set' };
      }
      const res = await fetch('https://api.stripe.com/v1/customers?limit=1', {
        headers: { Authorization: `Bearer ${secrets.stripeSecretKey}` },
      });
      if (res.ok) return { ok: true, message: 'Stripe connected' };
      return { ok: false, message: `HTTP ${res.status}` };
    }
  }

  return { ok: false, message: 'No connection test available for this config' };
}

export default adminConfigRouter;
