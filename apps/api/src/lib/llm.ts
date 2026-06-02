/**
 * LLM Router — Central AI client
 *
 * Config source (in priority order):
 *   1. Admin config screen (/admin/llm-config) — DB-backed
 *   2. .env (legacy fallback while migrating)
 *
 * All callers SHOULD pass a `featureKey` so the admin UI can map
 * each feature (campaign_banner_copy, social_post, brain_autoextract,
 * etc.) to a specific provider + model + quality tier + credit cost.
 *
 * See apps/api/src/lib/config-resolver.ts for how feature + provider
 * resolution works, and docs/architecture/09-pricing-credits.md for
 * the pricing/credit model this enables.
 */

import { resolveFeature, resolveProvider, type QualityTier } from './config-resolver';

export interface LLMMessage {
  role: 'user' | 'system' | 'assistant';
  content: string;
}

export interface LLMResponse {
  text: string;
  model: string;
  provider: string;
  /** Langfuse trace id, set when observability is active (W0.3 / ADR-01) */
  traceId?: string;
  /** Deep-link URL to open this trace in the Langfuse inspector */
  traceUrl?: string;
  /** Credit cost for this call, resolved from the feature's config. */
  creditCost?: number;
  /** Which tier was actually used (fast / balanced / premium). */
  tierUsed?: QualityTier;
  /** Whether config came from DB or env fallback. */
  configSource?: 'db' | 'env' | 'default';
}

// Lazy-initialized clients, keyed by (provider, apiKey). We cache per
// key so that if an admin rotates a key via the config screen the new
// key is picked up automatically on the next call (cache is keyed by
// apiKey so a new key = new client).
const _clientCache = new Map<string, any>();

async function getOpenAIClient(apiKey: string, baseUrl: string) {
  const cacheKey = `openai:${apiKey}:${baseUrl}`;
  let client = _clientCache.get(cacheKey);
  if (!client) {
    const OpenAI = (await import('openai')).default;
    client = new OpenAI({ apiKey, baseURL: baseUrl });
    _clientCache.set(cacheKey, client);
  }
  return client;
}

async function getAnthropicClient(apiKey: string, baseUrl?: string) {
  const cacheKey = `anthropic:${apiKey}:${baseUrl ?? ''}`;
  let client = _clientCache.get(cacheKey);
  if (!client) {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    client = new Anthropic({
      apiKey,
      ...(baseUrl ? { baseURL: baseUrl } : {}),
    });
    _clientCache.set(cacheKey, client);
  }
  return client;
}

/** Drop all cached LLM clients — call after config edits that change keys. */
export function resetLLMClients(): void {
  _clientCache.clear();
}

export interface LLMGenerateOptions {
  /** Legacy: override max tokens. Use `featureKey` to derive from config. */
  maxTokens?: number;
  /** Force JSON response format (OpenAI only). */
  json?: boolean;
  /** Langfuse trace name. */
  traceName?: string;
  /** Langfuse metadata. */
  metadata?: Record<string, unknown>;
  /**
   * Feature key (e.g. 'campaign_banner_copy'). The admin config UI
   * maps each feature to a provider + model + tier + credit cost.
   * Strongly recommended — omitting falls back to env defaults.
   */
  featureKey?: string;
  /**
   * User-selected quality tier. Lets users trade cost vs quality:
   *   'fast'     — cheap model, fewer credits
   *   'balanced' — default
   *   'premium'  — best model, more credits
   */
  tier?: QualityTier;
  /** Force a specific provider override (skips feature mapping). */
  forceProvider?: string;
  /** Force a specific model override. */
  forceModel?: string;
}

/**
 * Generate text — provider-agnostic, admin-config-driven.
 *
 * Resolution order for the provider+model:
 *   1. forceProvider + forceModel (explicit caller override)
 *   2. featureKey + tier → admin config DB
 *   3. env vars (LLM_PROVIDER / LLM_MODEL) as last resort
 *
 * Every call is wrapped in a Langfuse trace so the "Why this output?"
 * button in the UI can deep-link to the full prompt + tokens + timing.
 */
export async function llmGenerate(
  messages: LLMMessage[],
  options?: LLMGenerateOptions,
): Promise<LLMResponse> {
  // --- Resolve feature config → provider + model + tier + credit cost ---
  let provider: string;
  let model: string;
  let maxTokens: number;
  let creditCost = 0;
  let tierUsed: QualityTier | undefined;
  let configSource: 'db' | 'env' | 'default' = 'default';

  if (options?.forceProvider && options?.forceModel) {
    provider = options.forceProvider;
    model = options.forceModel;
    maxTokens = options?.maxTokens ?? 2000;
  } else if (options?.featureKey) {
    const feature = await resolveFeature(options.featureKey, options.tier ?? 'balanced');
    provider = feature.provider;
    model = feature.model;
    maxTokens = options?.maxTokens ?? feature.maxTokens;
    creditCost = feature.creditCost;
    tierUsed = feature.tier;
    configSource = feature.source === 'db' ? 'db' : 'default';
  } else {
    // Pure legacy — env-var fallback
    provider = process.env.LLM_PROVIDER || 'openai';
    model = process.env.LLM_MODEL || (provider === 'anthropic' ? 'claude-sonnet-4-20250514' : 'gpt-4o-mini');
    maxTokens = options?.maxTokens ?? 2000;
    configSource = 'env';
  }

  // --- Resolve provider API key from DB (with env fallback) ---
  const resolvedProvider = await resolveProvider(provider);
  if (!resolvedProvider.apiKey) {
    throw new Error(
      `LLM provider "${provider}" is not configured. Add an API key in the admin LLM Config screen.`,
    );
  }

  // Langfuse wrap — optional, non-fatal
  const { getLangfuse, getTraceUrl } = await import('./langfuse');
  const langfuse = getLangfuse();
  const trace = langfuse?.trace({
    name: options?.traceName ?? `llm.${options?.featureKey ?? 'generate'}`,
    metadata: {
      ...options?.metadata,
      featureKey: options?.featureKey,
      tier: tierUsed,
      configSource,
    },
  });
  const generation = trace?.generation({
    name: 'chat-completion',
    model,
    modelParameters: { max_tokens: maxTokens, json: options?.json ?? false } as any,
    input: messages,
  });
  const startedAt = Date.now();

  try {
    if (provider === 'anthropic') {
      const anthropic = await getAnthropicClient(
        resolvedProvider.apiKey,
        resolvedProvider.baseUrl,
      );

      const systemMsg = messages.find((m) => m.role === 'system');
      const userMsgs = messages.filter((m) => m.role !== 'system');

      const response = await anthropic.messages.create({
        model,
        max_tokens: maxTokens,
        ...(systemMsg?.content ? { system: systemMsg.content } : {}),
        messages: userMsgs.map((m: LLMMessage) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
      });

      const text = response.content[0].type === 'text' ? response.content[0].text : '';
      generation?.end({
        output: text,
        usage: {
          promptTokens: (response.usage as any)?.input_tokens,
          completionTokens: (response.usage as any)?.output_tokens,
        } as any,
      });
      return {
        text,
        model,
        provider,
        traceId: trace?.id,
        traceUrl: trace?.id ? getTraceUrl(trace.id) : undefined,
        creditCost,
        tierUsed,
        configSource,
      };
    }

    // OpenAI (default)
    const openai = await getOpenAIClient(
      resolvedProvider.apiKey,
      resolvedProvider.baseUrl,
    );

    const response = await openai.chat.completions.create({
      model,
      max_tokens: maxTokens,
      messages: messages.map((m: LLMMessage) => ({ role: m.role, content: m.content })),
      ...(options?.json ? { response_format: { type: 'json_object' } } : {}),
    });

    const text = response.choices[0]?.message?.content || '';
    generation?.end({
      output: text,
      usage: {
        promptTokens: response.usage?.prompt_tokens,
        completionTokens: response.usage?.completion_tokens,
      } as any,
    });
    return {
      text,
      model,
      provider,
      traceId: trace?.id,
      traceUrl: trace?.id ? getTraceUrl(trace.id) : undefined,
      creditCost,
      tierUsed,
      configSource,
    };
  } catch (err) {
    generation?.end({
      output: null,
      level: 'ERROR',
      statusMessage: err instanceof Error ? err.message : String(err),
    });
    throw err;
  } finally {
    const durationMs = Date.now() - startedAt;
    if (trace) {
      // Attach duration as a tag metadata so the trace inspector shows it
      trace.update({ metadata: { ...(options?.metadata ?? {}), durationMs } });
    }
    // Flush in fire-and-forget — don't block the request
    langfuse?.flushAsync().catch(() => {});
  }
}

/**
 * Extract JSON from LLM response text
 * IMPORTANT: Try object {} FIRST, then array [] — because objects may contain arrays
 */
export function extractJSON(text: string): any | null {
  // Try object first (most common — contains nested arrays)
  const objectMatch = text.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    try { return JSON.parse(objectMatch[0]); } catch {}
  }
  // Then try array (for responses that are purely arrays)
  const arrayMatch = text.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    try { return JSON.parse(arrayMatch[0]); } catch {}
  }
  return null;
}
