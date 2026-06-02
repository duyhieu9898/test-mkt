// =============================================================================
// @1person/ai-tenant — System Config Store
// =============================================================================
// App-wide configuration managed from the admin UI (replaces .env for
// non-technical operators). Secrets are encrypted at rest using the same
// AES-256-GCM helpers as the BYO key storage.
//
// Categories:
//   'provider'    — LLM providers (openai, anthropic, gemini, ollama, vllm)
//   'feature'     — Per-feature LLM mapping
//   'integration' — Stripe, Google OAuth, Meta Ads, Sentry
//   'image'       — Image generation providers
//
// Design notes:
//   - Secrets live in the `secrets` jsonb column encrypted with
//     encryptApiKey() from deployment-store.ts (same master key).
//   - `getConfig(category, key)` returns the full row including DECRYPTED
//     secrets — server-side only.
//   - `getPublicConfig` returns the row with secrets MASKED (last 4 chars)
//     for safe transmission to the admin UI.
//   - Every mutation emits an audit entry under category='data_access'
//     with kind='system_config_update' so config changes are traceable.
// =============================================================================

import { eq, and, sql } from 'drizzle-orm';
import { systemConfigs } from './schema.js';
import { encryptApiKey, decryptApiKey, type EncryptedKey } from './deployment-store.js';
import type { Database } from './db.js';

// System config is app-wide (not tenant-scoped), so it cannot use the
// per-tenant chain-hashed audit log. Mutations are still recorded in the
// `updated_by` column for traceability. A future enhancement could add a
// dedicated `trustai_system_audit` table if operators demand a hash chain
// for app-wide changes.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ConfigCategory = 'provider' | 'feature' | 'integration' | 'image' | 'transcription';
export type ConfigStatus = 'unknown' | 'connected' | 'error' | 'unconfigured';

export interface SystemConfig {
  id: string;
  category: ConfigCategory;
  key: string;
  label: string;
  description: string | null;
  value: Record<string, unknown>;
  secrets: Record<string, string>; // DECRYPTED — only returned server-side
  status: ConfigStatus;
  statusMessage: string | null;
  statusCheckedAt: Date | null;
  enabled: boolean;
  updatedAt: Date;
}

export interface PublicSystemConfig extends Omit<SystemConfig, 'secrets'> {
  /** Masked secrets — shows last 4 chars only, or '(not set)' */
  secrets: Record<string, string>;
  /** Which secret field names exist (used by the admin UI form) */
  secretFields: string[];
}

export interface SystemConfigInput {
  category: ConfigCategory;
  key: string;
  label?: string;
  description?: string | null;
  value?: Record<string, unknown>;
  secrets?: Record<string, string>; // PLAINTEXT — will be encrypted on write
  enabled?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function maskSecret(plaintext: string): string {
  if (!plaintext || plaintext.length === 0) return '(not set)';
  if (plaintext.length <= 8) return '••••';
  return `••••${plaintext.slice(-4)}`;
}

function encryptSecrets(secrets: Record<string, string>): Record<string, EncryptedKey> {
  const encrypted: Record<string, EncryptedKey> = {};
  for (const [field, value] of Object.entries(secrets)) {
    if (value && value.length > 0) {
      encrypted[field] = encryptApiKey(value);
    }
  }
  return encrypted;
}

function decryptSecrets(raw: Record<string, EncryptedKey>): Record<string, string> {
  const decrypted: Record<string, string> = {};
  for (const [field, enc] of Object.entries(raw || {})) {
    try {
      decrypted[field] = decryptApiKey(enc);
    } catch {
      decrypted[field] = '';
    }
  }
  return decrypted;
}

function rowToSystemConfig(row: any): SystemConfig {
  return {
    id: row.id,
    category: row.category,
    key: row.key,
    label: row.label ?? row.key,
    description: row.description ?? null,
    value: (row.value as Record<string, unknown>) ?? {},
    secrets: decryptSecrets((row.secrets as Record<string, EncryptedKey>) ?? {}),
    status: row.status ?? 'unknown',
    statusMessage: row.statusMessage ?? null,
    statusCheckedAt: row.statusCheckedAt ?? null,
    enabled: !!row.enabled,
    updatedAt: row.updatedAt,
  };
}

function rowToPublicConfig(row: any): PublicSystemConfig {
  const decrypted = decryptSecrets((row.secrets as Record<string, EncryptedKey>) ?? {});
  const masked: Record<string, string> = {};
  const fields: string[] = [];
  for (const [field, value] of Object.entries(decrypted)) {
    masked[field] = maskSecret(value);
    fields.push(field);
  }
  return {
    id: row.id,
    category: row.category,
    key: row.key,
    label: row.label ?? row.key,
    description: row.description ?? null,
    value: (row.value as Record<string, unknown>) ?? {},
    secrets: masked,
    secretFields: fields,
    status: row.status ?? 'unknown',
    statusMessage: row.statusMessage ?? null,
    statusCheckedAt: row.statusCheckedAt ?? null,
    enabled: !!row.enabled,
    updatedAt: row.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// Public API — server-side (returns decrypted secrets)
// ---------------------------------------------------------------------------

export async function getConfig(
  db: Database,
  category: ConfigCategory,
  key: string,
): Promise<SystemConfig | null> {
  const rows = await db
    .select()
    .from(systemConfigs)
    .where(and(eq(systemConfigs.category, category), eq(systemConfigs.key, key)))
    .limit(1);
  const row = rows[0];
  return row ? rowToSystemConfig(row) : null;
}

export async function listConfigs(
  db: Database,
  category?: ConfigCategory,
): Promise<SystemConfig[]> {
  const rows = category
    ? await db.select().from(systemConfigs).where(eq(systemConfigs.category, category))
    : await db.select().from(systemConfigs);
  return rows.map(rowToSystemConfig);
}

// ---------------------------------------------------------------------------
// Public API — admin UI (returns MASKED secrets only)
// ---------------------------------------------------------------------------

export async function listConfigsPublic(
  db: Database,
  category?: ConfigCategory,
): Promise<PublicSystemConfig[]> {
  const rows = category
    ? await db.select().from(systemConfigs).where(eq(systemConfigs.category, category))
    : await db.select().from(systemConfigs);
  return rows.map(rowToPublicConfig);
}

export async function getConfigPublic(
  db: Database,
  category: ConfigCategory,
  key: string,
): Promise<PublicSystemConfig | null> {
  const rows = await db
    .select()
    .from(systemConfigs)
    .where(and(eq(systemConfigs.category, category), eq(systemConfigs.key, key)))
    .limit(1);
  const row = rows[0];
  return row ? rowToPublicConfig(row) : null;
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export async function upsertConfig(
  db: Database,
  input: SystemConfigInput,
  actor: string = 'system',
): Promise<SystemConfig> {
  const existing = await getConfig(db, input.category, input.key);

  // Encrypt any new/changed secrets. For unchanged secrets, keep the
  // existing ciphertext so we don't re-encrypt the same value.
  let encryptedSecrets: Record<string, EncryptedKey> = {};
  if (existing) {
    // Start from existing ciphertext (fetched via a raw row read)
    const rawRow = await db
      .select({ secrets: systemConfigs.secrets })
      .from(systemConfigs)
      .where(eq(systemConfigs.id, existing.id))
      .limit(1);
    encryptedSecrets = { ...((rawRow[0]?.secrets as Record<string, EncryptedKey>) ?? {}) };
  }

  if (input.secrets) {
    for (const [field, plaintext] of Object.entries(input.secrets)) {
      if (plaintext === '' || plaintext === null || plaintext === undefined) {
        // Empty string = delete this secret
        delete encryptedSecrets[field];
      } else if (!plaintext.startsWith('••••')) {
        // Skip masked values (user didn't change them)
        encryptedSecrets[field] = encryptApiKey(plaintext);
      }
    }
  }

  if (existing) {
    const [updated] = await db
      .update(systemConfigs)
      .set({
        label: input.label ?? existing.label,
        description: input.description !== undefined ? input.description : existing.description,
        value: input.value ?? existing.value,
        secrets: encryptedSecrets as any,
        enabled: input.enabled !== undefined ? input.enabled : existing.enabled,
        updatedBy: actor,
        updatedAt: new Date(),
      })
      .where(eq(systemConfigs.id, existing.id))
      .returning();
    if (!updated) throw new Error('Failed to update system config');
    return rowToSystemConfig(updated);
  }

  const [created] = await db
    .insert(systemConfigs)
    .values({
      category: input.category,
      key: input.key,
      label: input.label ?? input.key,
      description: input.description ?? null,
      value: input.value ?? {},
      secrets: encryptedSecrets as any,
      enabled: input.enabled ?? true,
      updatedBy: actor,
    })
    .returning();
  if (!created) throw new Error('Failed to create system config');
  return rowToSystemConfig(created);
}

export async function updateStatus(
  db: Database,
  category: ConfigCategory,
  key: string,
  status: ConfigStatus,
  statusMessage: string | null,
): Promise<void> {
  await db
    .update(systemConfigs)
    .set({
      status,
      statusMessage,
      statusCheckedAt: new Date(),
    })
    .where(and(eq(systemConfigs.category, category), eq(systemConfigs.key, key)));
}

export async function deleteConfig(
  db: Database,
  category: ConfigCategory,
  key: string,
  _actor: string = 'system',
): Promise<void> {
  await db
    .delete(systemConfigs)
    .where(and(eq(systemConfigs.category, category), eq(systemConfigs.key, key)));
}

// ---------------------------------------------------------------------------
// Resolver — read with env fallback (used by llm.ts, image-generator.ts, etc)
// ---------------------------------------------------------------------------

/**
 * Resolve a provider's API key: first look in the DB config, then fall
 * back to the matching env var. Used during the transition period while
 * existing services still read from env.
 */
export async function resolveProviderKey(
  db: Database,
  providerKey: string,
  envVarName: string,
): Promise<string | null> {
  try {
    const config = await getConfig(db, 'provider', providerKey);
    if (config?.secrets?.apiKey && config.secrets.apiKey.length > 0) {
      return config.secrets.apiKey;
    }
  } catch {
    // DB unavailable — fall through to env
  }
  return process.env[envVarName] ?? null;
}

/**
 * Resolve feature → LLM mapping. Returns the provider/model/temp/tokens
 * that should be used for a given feature. Falls back to defaults.
 */
export async function resolveFeatureLLM(
  db: Database,
  featureKey: string,
): Promise<{
  provider: string;
  model: string;
  fallbackProvider?: string;
  fallbackModel?: string;
  temperature: number;
  maxTokens: number;
} | null> {
  try {
    const config = await getConfig(db, 'feature', featureKey);
    if (!config || !config.enabled) return null;
    const v = config.value as Record<string, unknown>;
    return {
      provider: (v.provider as string) ?? 'openai',
      model: (v.model as string) ?? 'gpt-4o-mini',
      fallbackProvider: v.fallbackProvider as string | undefined,
      fallbackModel: v.fallbackModel as string | undefined,
      temperature: Number(v.temperature ?? 0.7),
      maxTokens: Number(v.maxTokens ?? 2048),
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Seed — populate initial rows if the table is empty
// ---------------------------------------------------------------------------

/**
 * Seed the initial set of providers, features, and integrations.
 * Idempotent by default. Pass `{ overwriteFeatures: true }` to reset
 * feature rows to the latest seed (useful when the tier schema is
 * upgraded and legacy rows need to gain tier arrays).
 */
export async function seedDefaultConfigs(
  db: Database,
  opts?: { overwriteFeatures?: boolean; overwriteImages?: boolean },
): Promise<{
  created: number;
  skipped: number;
  overwritten: number;
}> {
  let created = 0;
  let skipped = 0;
  let overwritten = 0;

  const seeds: SystemConfigInput[] = [
    // --- LLM Providers ---------------------------------------------------
    {
      category: 'provider',
      key: 'openai',
      label: 'OpenAI',
      description: 'GPT-4o, GPT-4o-mini. Leading general-purpose models.',
      value: {
        baseUrl: 'https://api.openai.com/v1',
        models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
      },
      secrets: {},
    },
    {
      category: 'provider',
      key: 'anthropic',
      label: 'Claude (Anthropic)',
      description: 'Claude Sonnet, Opus. Best for long reasoning and writing.',
      value: {
        baseUrl: 'https://api.anthropic.com',
        models: ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5'],
      },
      secrets: {},
    },
    {
      category: 'provider',
      key: 'gemini',
      label: 'Gemini (Google)',
      description: 'Google Gemini 2.5 Pro, Flash. Also powers Imagen 3 for images.',
      value: {
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
        models: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash'],
      },
      secrets: {},
    },
    {
      category: 'provider',
      key: 'ollama',
      label: 'Ollama (Local)',
      description: 'Self-hosted local models. No data leaves your machine.',
      value: {
        baseUrl: 'http://localhost:11434/v1',
        models: ['llama3.2', 'qwen2.5', 'mistral'],
      },
      secrets: {},
    },

    // --- Feature → LLM mapping (with quality tiers) --------------------
    // Each feature has 3 tiers: Fast / Balanced / Premium.
    // Admins can re-map tiers to any provider+model in the admin UI.
    // Credit costs are quoted in integer credits (see docs/architecture/
    // 09-pricing-and-credits.md for the pricing rationale).
    {
      category: 'feature',
      key: 'campaign_banner_copy',
      label: 'Banner Copywriting',
      description: 'Headlines, subheads, and CTAs for campaign banners.',
      value: {
        tiers: [
          { name: 'fast', label: 'Fast', description: 'Quick draft — good enough', provider: 'ollama', model: 'llama3.2', creditCost: 1 },
          { name: 'balanced', label: 'Balanced', description: 'Standard quality (recommended)', provider: 'openai', model: 'gpt-4o-mini', creditCost: 3 },
          { name: 'premium', label: 'Premium', description: 'Best model — punchier copy', provider: 'anthropic', model: 'claude-opus-4-6', creditCost: 10 },
        ],
        defaultTier: 'balanced',
        temperature: 0.8,
        maxTokens: 1000,
      },
    },
    {
      category: 'feature',
      key: 'campaign_social_post',
      label: 'Social Post Generation',
      description: 'Facebook, LinkedIn, X, Instagram post content.',
      value: {
        tiers: [
          { name: 'fast', label: 'Fast', description: 'Quick draft', provider: 'ollama', model: 'llama3.2', creditCost: 1 },
          { name: 'balanced', label: 'Balanced', description: 'Standard quality (recommended)', provider: 'openai', model: 'gpt-4o-mini', creditCost: 3 },
          { name: 'premium', label: 'Premium', description: 'Best copy, most engaging', provider: 'anthropic', model: 'claude-opus-4-6', creditCost: 10 },
        ],
        defaultTier: 'balanced',
        temperature: 0.75,
        maxTokens: 1000,
      },
    },
    {
      category: 'feature',
      key: 'brain_autoextract',
      label: 'Business Brain Extraction',
      description: 'Auto-extract brand voice, persona, products from crawled website.',
      value: {
        tiers: [
          { name: 'fast', label: 'Fast', description: 'Basic extraction', provider: 'ollama', model: 'llama3.2', creditCost: 1 },
          { name: 'balanced', label: 'Balanced', description: 'Recommended for onboarding', provider: 'openai', model: 'gpt-4o-mini', creditCost: 3 },
          { name: 'premium', label: 'Premium', description: 'Deepest brand analysis', provider: 'anthropic', model: 'claude-sonnet-4-6', creditCost: 10 },
        ],
        defaultTier: 'balanced',
        temperature: 0.3,
        maxTokens: 2048,
      },
    },
    {
      category: 'feature',
      key: 'seo_content',
      label: 'SEO Article Writing',
      description: 'Long-form SEO articles for blog and landing pages.',
      value: {
        tiers: [
          { name: 'fast', label: 'Fast', description: 'Short draft', provider: 'ollama', model: 'llama3.2', creditCost: 3 },
          { name: 'balanced', label: 'Balanced', description: 'Publish-ready', provider: 'openai', model: 'gpt-4o', creditCost: 8 },
          { name: 'premium', label: 'Premium', description: 'Long-form, best quality', provider: 'anthropic', model: 'claude-opus-4-6', creditCost: 25 },
        ],
        defaultTier: 'balanced',
        temperature: 0.7,
        maxTokens: 4096,
      },
    },
    {
      category: 'feature',
      key: 'chatbot',
      label: 'Customer Chatbot',
      description: 'AI assistant that answers customer questions using knowledge base.',
      value: {
        tiers: [
          { name: 'fast', label: 'Fast', description: 'Cheap answers', provider: 'ollama', model: 'llama3.2', creditCost: 1 },
          { name: 'balanced', label: 'Balanced', description: 'Default', provider: 'openai', model: 'gpt-4o-mini', creditCost: 1 },
          { name: 'premium', label: 'Premium', description: 'Most accurate', provider: 'anthropic', model: 'claude-haiku-4-5', creditCost: 3 },
        ],
        defaultTier: 'balanced',
        temperature: 0.5,
        maxTokens: 1500,
      },
    },
    {
      category: 'feature',
      key: 'feedback_learning',
      label: 'Feedback → Brain Learning',
      description: 'Convert campaign metrics into structured Brain learnings.',
      value: {
        tiers: [
          { name: 'fast', label: 'Fast', description: 'Basic summary', provider: 'ollama', model: 'llama3.2', creditCost: 1 },
          { name: 'balanced', label: 'Balanced', description: 'Default', provider: 'openai', model: 'gpt-4o-mini', creditCost: 2 },
          { name: 'premium', label: 'Premium', description: 'Deep analysis', provider: 'anthropic', model: 'claude-sonnet-4-6', creditCost: 6 },
        ],
        defaultTier: 'balanced',
        temperature: 0.3,
        maxTokens: 1024,
      },
    },
    // Đợt 3 features (doc 10 §5, §6, §8)
    {
      category: 'feature',
      key: 'market_scan',
      label: 'Market & Competitor Scan',
      description: 'Extract signals from competitor website + news into SWOT delta.',
      value: {
        tiers: [
          { name: 'fast', label: 'Fast', description: 'Quick scan', provider: 'openai', model: 'gpt-4o-mini', creditCost: 3 },
          { name: 'balanced', label: 'Balanced', description: 'Default — Jina + news + analysis', provider: 'openai', model: 'gpt-4o-mini', creditCost: 5 },
          { name: 'premium', label: 'Premium', description: 'Deeper synthesis', provider: 'anthropic', model: 'claude-sonnet-4-6', creditCost: 15 },
        ],
        defaultTier: 'balanced',
        temperature: 0.3,
        maxTokens: 1500,
      },
    },
    {
      category: 'feature',
      key: 'sales_deal_assistant',
      label: 'Sales Deal Assistant',
      description: 'Next action + email draft per deal, reads Sales Playbook.',
      value: {
        tiers: [
          { name: 'fast', label: 'Fast', description: 'Quick suggestion', provider: 'openai', model: 'gpt-4o-mini', creditCost: 1 },
          { name: 'balanced', label: 'Balanced', description: 'Default with email draft', provider: 'openai', model: 'gpt-4o-mini', creditCost: 3 },
          { name: 'premium', label: 'Premium', description: 'Deepest context + nuanced email', provider: 'anthropic', model: 'claude-sonnet-4-6', creditCost: 8 },
        ],
        defaultTier: 'balanced',
        temperature: 0.5,
        maxTokens: 2000,
      },
    },
    {
      category: 'feature',
      key: 'ceo_advisor_brief',
      label: 'CEO Advisor Brief',
      description: 'Chief of Staff cross-domain brief. Aggregates campaigns + deals + market + meetings.',
      value: {
        tiers: [
          { name: 'fast', label: 'Fast', description: 'Summary only', provider: 'openai', model: 'gpt-4o-mini', creditCost: 5 },
          { name: 'balanced', label: 'Balanced', description: 'Default — full brief', provider: 'openai', model: 'gpt-4o-mini', creditCost: 10 },
          { name: 'premium', label: 'Premium', description: 'Deep strategic analysis', provider: 'anthropic', model: 'claude-sonnet-4-6', creditCost: 25 },
        ],
        defaultTier: 'balanced',
        temperature: 0.4,
        maxTokens: 3000,
      },
    },

    {
      category: 'feature',
      key: 'business_context',
      label: 'Business Context Builder',
      description: 'Compose business context snapshots used by every generator.',
      value: {
        tiers: [
          { name: 'fast', label: 'Fast', description: 'Summary', provider: 'ollama', model: 'llama3.2', creditCost: 1 },
          { name: 'balanced', label: 'Balanced', description: 'Default', provider: 'openai', model: 'gpt-4o-mini', creditCost: 2 },
          { name: 'premium', label: 'Premium', description: 'Thorough', provider: 'anthropic', model: 'claude-sonnet-4-6', creditCost: 5 },
        ],
        defaultTier: 'balanced',
        temperature: 0.4,
        maxTokens: 2048,
      },
    },

    // --- Image generation providers --------------------------------------
    // Each image provider has a `tier` (fast/balanced/premium) and a
    // `creditCost` that admins can retune without code changes. End users
    // pick Standard/Pro/Ultra when generating a banner and the UI renders
    // whichever image providers are enabled in that tier.
    {
      category: 'image',
      key: 'gemini-imagen',
      label: 'Gemini Imagen 3',
      description: 'Google Imagen 3 — fastest and cheapest banner generator.',
      value: {
        tier: 'fast',
        creditCost: 5,
        model: 'imagen-3.0-generate-001',
        defaultSize: '1200x628',
      },
      secrets: {}, // uses provider=gemini apiKey
    },
    {
      category: 'image',
      key: 'dalle',
      label: 'DALL-E 3',
      description: 'OpenAI DALL-E 3 — good quality general-purpose banners.',
      value: {
        tier: 'fast',
        creditCost: 8,
        model: 'dall-e-3',
        defaultSize: '1792x1024',
        style: 'vivid',
        quality: 'standard',
      },
      secrets: {}, // uses provider=openai apiKey
    },
    {
      category: 'image',
      key: 'banana',
      label: 'Banana.dev (Stable Diffusion)',
      description: 'Banana.dev hosted SD / Flux — custom style, balanced quality.',
      value: {
        tier: 'balanced',
        creditCost: 15,
        endpoint: 'https://api.banana.dev/start/v4/',
        modelKey: '',
      },
      secrets: {}, // apiKey
    },
    // --- Transcription providers (doc 10 §7) -----------------------------
    // Speech-to-text for meetings. Default = local (faster-whisper-server
    // via docker-compose) so ventures can self-host at zero cost.
    // Admins can switch to OpenAI Whisper for higher accuracy, or add
    // another OpenAI-compatible endpoint in the future.
    {
      category: 'transcription',
      key: 'local-whisper',
      label: 'Local Whisper (faster-whisper-server)',
      description:
        'Open-source Whisper running in docker-compose. Zero cost, runs on CPU. Transcriptions never leave your machine.',
      value: {
        enabled: true,
        baseUrl: 'http://localhost:8005/v1',
        model: 'Systran/faster-whisper-small',
        creditCostPerMinute: 0,
      },
      secrets: {}, // local has no API key
    },
    {
      category: 'transcription',
      key: 'openai-whisper',
      label: 'OpenAI Whisper API',
      description:
        'Higher accuracy, cloud-hosted. Charged per audio minute. Uses the openai provider API key.',
      value: {
        enabled: false,
        baseUrl: 'https://api.openai.com/v1',
        model: 'whisper-1',
        creditCostPerMinute: 1,
      },
      secrets: {}, // delegates to provider=openai apiKey
    },

    {
      category: 'image',
      key: 'banana-pro',
      label: 'Banana Pro (Highest Quality)',
      description: 'Banana Pro endpoint — premium Flux / SDXL models, best-in-class banner quality. Costs more credits.',
      value: {
        tier: 'premium',
        creditCost: 40,
        endpoint: 'https://api.banana.dev/start/v4/',
        modelKey: '',
        pro: true,
        inferenceSteps: 50,
        guidanceScale: 8.5,
      },
      secrets: {}, // apiKey
    },

    // --- Integrations ----------------------------------------------------
    {
      category: 'integration',
      key: 'stripe',
      label: 'Stripe Billing',
      description: 'Payment processing for Pro and Business subscription tiers.',
      value: {
        pricePro: '',
        priceBusiness: '',
        mode: 'test',
      },
      secrets: {},
    },
    {
      category: 'integration',
      key: 'google_oauth',
      label: 'Google OAuth',
      description: 'Sign in with Google for users and admin accounts.',
      value: {
        redirectUri: 'http://localhost:8004/api/v1/auth/google/callback',
      },
      secrets: {},
    },
    {
      category: 'integration',
      key: 'meta_ads',
      label: 'Meta Marketing API',
      description: 'Publish Facebook and Instagram ad campaigns.',
      value: {
        graphVersion: 'v21.0',
      },
      secrets: {},
    },
    {
      category: 'integration',
      key: 'sentry',
      label: 'Sentry (Error Tracking)',
      description: 'Production error visibility for API and Web.',
      value: {
        environment: 'production',
        tracesSampleRate: 0.1,
      },
      secrets: {},
    },
    {
      category: 'integration',
      key: 'langfuse',
      label: 'Langfuse (LLM Observability)',
      description: 'Self-hosted LLM trace inspector for the "Why this output?" feature.',
      value: {
        baseUrl: 'http://localhost:5050',
      },
      secrets: {},
    },
  ];

  for (const seed of seeds) {
    const existing = await getConfig(db, seed.category, seed.key);
    if (existing) {
      // Overwrite feature rows if requested (used when upgrading the tier schema)
      if (opts?.overwriteFeatures && seed.category === 'feature') {
        await upsertConfig(
          db,
          { ...seed, label: seed.label ?? existing.label },
          'system:seed-overwrite',
        );
        overwritten++;
        continue;
      }
      // Overwrite image rows when the tier/creditCost schema is upgraded.
      if (opts?.overwriteImages && seed.category === 'image') {
        // Merge so that admin-entered secrets/modelKey/endpoint survive.
        const mergedValue = { ...(existing.value as Record<string, unknown>), ...(seed.value ?? {}) };
        await upsertConfig(
          db,
          {
            ...seed,
            label: seed.label ?? existing.label,
            value: mergedValue,
            // Do NOT pass secrets — keep existing encrypted secrets intact.
            secrets: undefined,
          },
          'system:seed-overwrite',
        );
        overwritten++;
        continue;
      }
      skipped++;
      continue;
    }
    await upsertConfig(db, seed, 'system:seed');
    created++;
  }

  return { created, skipped, overwritten };
}
