/**
 * Config Resolver — DB-first, env-fallback, cached.
 *
 * Every code path in apps/api that used to read from process.env for
 * LLM / provider / integration configuration should go through this
 * helper. It reads from the admin-managed `trustai_system_configs`
 * table first, falls back to env vars for backward compatibility, and
 * caches results for 60 seconds to avoid DB roundtrips on hot paths.
 *
 * When an admin edits a config in the /admin/llm-config UI, the cache
 * is automatically invalidated by the `invalidateConfigCache()` helper
 * called from the admin-config route.
 *
 * Encryption: secrets never leak from this layer. The underlying
 * `config-store.ts` in @1person/ai-tenant handles AES-256-GCM
 * encrypt/decrypt — this resolver only sees plaintext at the moment
 * of use (llm call, image gen call, etc) and never logs it.
 */

import { getTenantAI } from './tenant-ai';

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

const TTL_MS = 60 * 1000; // 60s
type CacheEntry<T> = { value: T; expiresAt: number };
const cache = new Map<string, CacheEntry<any>>();

function cacheGet<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

function cacheSet<T>(key: string, value: T): void {
  cache.set(key, { value, expiresAt: Date.now() + TTL_MS });
}

/** Called by admin-config route after every mutation. */
export function invalidateConfigCache(category?: string, key?: string): void {
  if (!category) {
    cache.clear();
    return;
  }
  const prefix = key ? `${category}:${key}` : `${category}:`;
  for (const k of cache.keys()) {
    if (k.startsWith(prefix)) cache.delete(k);
  }
}

// ---------------------------------------------------------------------------
// Provider resolver
// ---------------------------------------------------------------------------

export interface ResolvedProvider {
  key: string;
  apiKey: string | null;
  baseUrl: string;
  models: string[];
  source: 'db' | 'env' | 'missing';
}

/**
 * Resolve a provider's credentials + base URL. Priority:
 *   1. DB config (admin UI)
 *   2. Env var fallback (for dev + migration period)
 */
export async function resolveProvider(providerKey: string): Promise<ResolvedProvider> {
  const cached = cacheGet<ResolvedProvider>(`provider:${providerKey}`);
  if (cached) return cached;

  // Try DB first
  try {
    const ai = getTenantAI();
    const cfg = await ai.config.get('provider', providerKey);
    if (cfg && cfg.enabled) {
      const apiKey = cfg.secrets.apiKey ?? null;
      const baseUrl = (cfg.value.baseUrl as string) ?? providerDefaultBaseUrl(providerKey);
      const models = (cfg.value.models as string[]) ?? [];
      if (apiKey && apiKey.length > 0) {
        const resolved: ResolvedProvider = {
          key: providerKey,
          apiKey,
          baseUrl,
          models,
          source: 'db',
        };
        cacheSet(`provider:${providerKey}`, resolved);
        return resolved;
      }
    }
  } catch (err) {
    // DB unavailable — fall through to env
  }

  // Env fallback
  const envKeyMap: Record<string, string> = {
    openai: 'OPENAI_API_KEY',
    anthropic: 'ANTHROPIC_API_KEY',
    gemini: 'GEMINI_API_KEY',
    ollama: 'OLLAMA_API_KEY', // usually empty
  };
  const envBaseMap: Record<string, string> = {
    openai: 'OPENAI_BASE_URL',
    anthropic: 'ANTHROPIC_BASE_URL',
    gemini: 'GEMINI_BASE_URL',
    ollama: 'OLLAMA_BASE_URL',
  };
  const envApiKey = envKeyMap[providerKey] ? process.env[envKeyMap[providerKey]] : undefined;
  const envBaseUrl = envBaseMap[providerKey] ? process.env[envBaseMap[providerKey]] : undefined;

  const resolved: ResolvedProvider = {
    key: providerKey,
    apiKey: envApiKey ?? null,
    baseUrl: envBaseUrl ?? providerDefaultBaseUrl(providerKey),
    models: [],
    source: envApiKey ? 'env' : 'missing',
  };
  cacheSet(`provider:${providerKey}`, resolved);
  return resolved;
}

function providerDefaultBaseUrl(key: string): string {
  switch (key) {
    case 'openai': return 'https://api.openai.com/v1';
    case 'anthropic': return 'https://api.anthropic.com';
    case 'gemini': return 'https://generativelanguage.googleapis.com/v1beta';
    case 'ollama': return 'http://localhost:11434/v1';
    default: return '';
  }
}

// ---------------------------------------------------------------------------
// Feature → Model resolver (with quality tiers)
// ---------------------------------------------------------------------------

export type QualityTier = 'fast' | 'balanced' | 'premium';

export interface ResolvedFeature {
  featureKey: string;
  tier: QualityTier;
  provider: string;
  model: string;
  fallbackProvider?: string;
  fallbackModel?: string;
  temperature: number;
  maxTokens: number;
  creditCost: number;
  source: 'db' | 'default';
}

/**
 * Resolve which provider+model to use for a given feature + quality
 * tier. The admin UI sets these per feature; tiers let users pick
 * "fast" (cheap/small model) vs "premium" (best model).
 *
 * If the DB has tier definitions, use them. Otherwise fall back to
 * the legacy flat provider/model/temperature/maxTokens fields or
 * hardcoded defaults.
 */
export async function resolveFeature(
  featureKey: string,
  tier: QualityTier = 'balanced',
): Promise<ResolvedFeature> {
  const cacheKey = `feature:${featureKey}:${tier}`;
  const cached = cacheGet<ResolvedFeature>(cacheKey);
  if (cached) return cached;

  try {
    const ai = getTenantAI();
    const cfg = await ai.config.get('feature', featureKey);
    if (cfg && cfg.enabled) {
      const v = cfg.value as Record<string, any>;
      // New-style: `tiers` array with { name, provider, model, creditCost }
      const tiers = v.tiers as Array<any> | undefined;
      if (Array.isArray(tiers) && tiers.length > 0) {
        const match =
          tiers.find((t) => t.name === tier) ??
          tiers.find((t) => t.name === 'balanced') ??
          tiers[0];
        if (match) {
          const resolved: ResolvedFeature = {
            featureKey,
            tier: match.name as QualityTier,
            provider: match.provider,
            model: match.model,
            fallbackProvider: match.fallbackProvider,
            fallbackModel: match.fallbackModel,
            temperature: Number(v.temperature ?? match.temperature ?? 0.7),
            maxTokens: Number(v.maxTokens ?? match.maxTokens ?? 2048),
            creditCost: Number(match.creditCost ?? 1),
            source: 'db',
          };
          cacheSet(cacheKey, resolved);
          return resolved;
        }
      }
      // Legacy: flat provider/model/temp/tokens
      if (v.provider && v.model) {
        const resolved: ResolvedFeature = {
          featureKey,
          tier: 'balanced',
          provider: v.provider,
          model: v.model,
          fallbackProvider: v.fallbackProvider,
          fallbackModel: v.fallbackModel,
          temperature: Number(v.temperature ?? 0.7),
          maxTokens: Number(v.maxTokens ?? 2048),
          creditCost: Number(v.creditCost ?? 1),
          source: 'db',
        };
        cacheSet(cacheKey, resolved);
        return resolved;
      }
    }
  } catch (err) {
    // DB unavailable — fall through to defaults
  }

  // Hardcoded defaults
  const defaults: Record<string, ResolvedFeature> = {
    campaign_banner_copy: {
      featureKey,
      tier: 'balanced',
      provider: 'openai',
      model: 'gpt-4o-mini',
      temperature: 0.8,
      maxTokens: 1000,
      creditCost: 3,
      source: 'default',
    },
    campaign_social_post: {
      featureKey,
      tier: 'balanced',
      provider: 'openai',
      model: 'gpt-4o-mini',
      temperature: 0.75,
      maxTokens: 1000,
      creditCost: 2,
      source: 'default',
    },
    brain_autoextract: {
      featureKey,
      tier: 'balanced',
      provider: 'openai',
      model: 'gpt-4o-mini',
      temperature: 0.3,
      maxTokens: 2048,
      creditCost: 2,
      source: 'default',
    },
    seo_content: {
      featureKey,
      tier: 'balanced',
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
      temperature: 0.7,
      maxTokens: 4096,
      creditCost: 6,
      source: 'default',
    },
    chatbot: {
      featureKey,
      tier: 'balanced',
      provider: 'openai',
      model: 'gpt-4o-mini',
      temperature: 0.5,
      maxTokens: 1500,
      creditCost: 1,
      source: 'default',
    },
    geo_run: {
      featureKey,
      tier: 'balanced',
      provider: 'openai',
      model: 'gpt-4o-mini',
      temperature: 0.5,
      maxTokens: 800,
      creditCost: 4,
      source: 'default',
    },
    brand_iq_extract: {
      featureKey,
      tier: 'premium',
      provider: 'openai',
      model: 'gpt-4o',
      temperature: 0.4,
      maxTokens: 2500,
      creditCost: 10,
      source: 'default',
    },
    employee_chat: {
      featureKey,
      tier: 'balanced',
      provider: 'openai',
      model: 'gpt-4o-mini',
      temperature: 0.6,
      maxTokens: 1200,
      creditCost: 2,
      source: 'default',
    },
  };
  const fallback = defaults[featureKey] ?? {
    featureKey,
    tier,
    provider: process.env.LLM_PROVIDER ?? 'openai',
    model: process.env.LLM_MODEL ?? 'gpt-4o-mini',
    temperature: 0.7,
    maxTokens: 2048,
    creditCost: 1,
    source: 'default' as const,
  };
  cacheSet(cacheKey, fallback);
  return fallback;
}

// ---------------------------------------------------------------------------
// Image provider resolver
// ---------------------------------------------------------------------------

export interface ResolvedImageProvider {
  key: string;
  label: string;
  description: string | null;
  tier: QualityTier;
  creditCost: number;
  enabled: boolean;
  hasCredentials: boolean;
  /** Plaintext apiKey for this image row (or the shared provider row it delegates to). */
  apiKey: string | null;
  value: Record<string, unknown>;
}

/**
 * Resolve a single image provider config. Returns null if the row does
 * not exist at all. DALL-E and Gemini Imagen delegate their API key to
 * the matching LLM provider row (openai / gemini), so a missing image
 * secret is normal for those.
 */
export async function resolveImageProvider(
  key: string,
): Promise<ResolvedImageProvider | null> {
  const cacheKey = `image:${key}`;
  const cached = cacheGet<ResolvedImageProvider>(cacheKey);
  if (cached) return cached;

  try {
    const ai = getTenantAI();
    const cfg = await ai.config.get('image', key);
    if (!cfg) return null;

    const value = (cfg.value as Record<string, unknown>) ?? {};
    const tier = ((value.tier as string) || 'balanced') as QualityTier;
    const creditCost = Number(value.creditCost ?? 10);

    // API key: use this row's secret if set, else delegate to the
    // matching LLM provider row for shared-credential providers.
    let apiKey: string | null = cfg.secrets.apiKey || null;
    if (!apiKey) {
      if (key === 'dalle') {
        const openai = await resolveProvider('openai');
        apiKey = openai.apiKey;
      } else if (key === 'gemini-imagen') {
        const gemini = await resolveProvider('gemini');
        apiKey = gemini.apiKey;
      }
    }

    const needsModelKey = key === 'banana' || key === 'banana-pro';
    const hasCredentials =
      !!apiKey && apiKey.length > 0 && (!needsModelKey || !!value.modelKey);

    const resolved: ResolvedImageProvider = {
      key,
      label: cfg.label,
      description: cfg.description ?? null,
      tier,
      creditCost,
      enabled: !!cfg.enabled,
      hasCredentials,
      apiKey,
      value,
    };
    cacheSet(cacheKey, resolved);
    return resolved;
  } catch {
    return null;
  }
}

/** List all image providers (public shape — no secrets), for end-user tier picker. */
export async function listImageProvidersPublic(): Promise<
  Array<{
    key: string;
    label: string;
    description: string | null;
    tier: QualityTier;
    creditCost: number;
    enabled: boolean;
    ready: boolean;
  }>
> {
  try {
    const ai = getTenantAI();
    const all = await ai.config.list('image');
    const rows = await Promise.all(
      all.map(async (row) => {
        const r = await resolveImageProvider(row.key);
        if (!r) return null;
        return {
          key: r.key,
          label: r.label,
          description: r.description,
          tier: r.tier,
          creditCost: r.creditCost,
          enabled: r.enabled,
          ready: r.hasCredentials,
        };
      }),
    );
    return rows.filter((r): r is NonNullable<typeof r> => r !== null);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Transcription provider resolver (doc 10 §7)
// ---------------------------------------------------------------------------

export interface ResolvedTranscription {
  key: string;
  label: string;
  baseUrl: string;
  model: string;
  apiKey: string | null;
  creditCostPerMinute: number;
  enabled: boolean;
  source: 'db' | 'env-fallback' | 'missing';
}

/**
 * Pick an enabled transcription provider, preferring local (free) if
 * the operator has it running. Falls back to OpenAI Whisper if only the
 * cloud option is enabled. Returns null if no provider is configured —
 * callers should fail gracefully in that case.
 */
export async function resolveTranscriptionProvider(): Promise<ResolvedTranscription | null> {
  const cached = cacheGet<ResolvedTranscription>('transcription:active');
  if (cached) return cached;

  try {
    const ai = getTenantAI();
    const all = await ai.config.list('transcription');
    // Prefer enabled local first, then enabled cloud, else first enabled.
    const enabled = all.filter((r) => (r.value as any).enabled !== false);
    const pick =
      enabled.find((r) => r.key === 'local-whisper') ??
      enabled.find((r) => r.key === 'openai-whisper') ??
      enabled[0];

    if (pick) {
      const value = pick.value as Record<string, unknown>;
      // Credentials — OpenAI delegates to the openai provider card; local needs none.
      let apiKey: string | null = pick.secrets.apiKey || null;
      if (!apiKey && pick.key === 'openai-whisper') {
        const openai = await resolveProvider('openai');
        apiKey = openai.apiKey;
      }
      const resolved: ResolvedTranscription = {
        key: pick.key,
        label: pick.label,
        baseUrl: (value.baseUrl as string) ?? '',
        model: (value.model as string) ?? 'whisper-1',
        apiKey,
        creditCostPerMinute: Number(value.creditCostPerMinute ?? 0),
        enabled: (value as any).enabled !== false,
        source: 'db',
      };
      cacheSet('transcription:active', resolved);
      return resolved;
    }
  } catch {
    // fall through to env fallback
  }

  // Env fallback — backwards compat with existing meetings route
  if (process.env.OPENAI_API_KEY) {
    const resolved: ResolvedTranscription = {
      key: 'openai-whisper',
      label: 'OpenAI Whisper API (env)',
      baseUrl: 'https://api.openai.com/v1',
      model: 'whisper-1',
      apiKey: process.env.OPENAI_API_KEY,
      creditCostPerMinute: 1,
      enabled: true,
      source: 'env-fallback',
    };
    cacheSet('transcription:active', resolved);
    return resolved;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Integration resolver (Stripe, Sentry, Langfuse, Google OAuth, Meta)
// ---------------------------------------------------------------------------

export async function resolveIntegration(key: string): Promise<{
  value: Record<string, unknown>;
  secrets: Record<string, string>;
  enabled: boolean;
  source: 'db' | 'env-fallback';
} | null> {
  const cacheKey = `integration:${key}`;
  const cached = cacheGet<any>(cacheKey);
  if (cached) return cached;

  try {
    const ai = getTenantAI();
    const cfg = await ai.config.get('integration', key);
    if (cfg) {
      const resolved = {
        value: cfg.value,
        secrets: cfg.secrets,
        enabled: cfg.enabled,
        source: 'db' as const,
      };
      cacheSet(cacheKey, resolved);
      return resolved;
    }
  } catch {
    // fall through
  }

  return null;
}
