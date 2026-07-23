// =============================================================================
// @1person/ai-tenant — Drizzle ORM Schema
// =============================================================================
// All tables are prefixed with 'trustai_' to avoid conflicts with the main
// platform AND to pre-align with the future @trustai/core externalized product
// (see docs/architecture/06-transparent-data-system.md §5).
// This module owns its own tables — independent from @1person/core.
// =============================================================================

import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  jsonb,
  index,
  uniqueIndex,
  boolean,
  real,
} from 'drizzle-orm/pg-core';

// ---------------------------------------------------------------------------
// Tenants — maps to companies in the main platform, but fully independent
// ---------------------------------------------------------------------------
export const tenants = pgTable('trustai_tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  externalId: varchar('external_id', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  settings: jsonb('settings').default({}).notNull(),
  status: varchar('status', { length: 20 }).default('active').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Agents — per-tenant AI agent configurations
// ---------------------------------------------------------------------------
export const tenantAgents = pgTable(
  'trustai_agents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .references(() => tenants.id, { onDelete: 'cascade' })
      .notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    systemPrompt: text('system_prompt').notNull(),
    tone: varchar('tone', { length: 20 }).default('professional').notNull(),
    temperature: real('temperature').default(0.7).notNull(),
    maxContextChunks: integer('max_context_chunks').default(5).notNull(),
    tools: jsonb('tools').default([]).notNull(),
    isDefault: boolean('is_default').default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    tenantIdx: index('trustai_agents_tenant_idx').on(table.tenantId),
  }),
);

// ---------------------------------------------------------------------------
// Documents — files uploaded by tenants for RAG
// ---------------------------------------------------------------------------
export const tenantDocuments = pgTable(
  'trustai_documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .references(() => tenants.id, { onDelete: 'cascade' })
      .notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    mimeType: varchar('mime_type', { length: 100 }).notNull(),
    fileSize: integer('file_size'),
    fileHash: varchar('file_hash', { length: 64 }).notNull(),
    filePath: text('file_path'),
    chunkCount: integer('chunk_count').default(0).notNull(),
    status: varchar('status', { length: 20 }).default('uploading').notNull(),
    metadata: jsonb('metadata').default({}).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    tenantIdx: index('trustai_docs_tenant_idx').on(table.tenantId),
  }),
);

// ---------------------------------------------------------------------------
// Document Chunks — with embeddings for vector search
// ---------------------------------------------------------------------------
// NOTE: The embedding column uses jsonb since pgvector extension handling
// varies across environments. W1A.1 in the implementation plan will migrate
// this to the native pgvector type for optimal similarity search performance.
export const documentChunks = pgTable(
  'trustai_document_chunks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .references(() => tenants.id, { onDelete: 'cascade' })
      .notNull(),
    documentId: uuid('document_id')
      .references(() => tenantDocuments.id, { onDelete: 'cascade' })
      .notNull(),
    content: text('content').notNull(),
    chunkIndex: integer('chunk_index').notNull(),
    tokenCount: integer('token_count'),
    embedding: jsonb('embedding'),
    metadata: jsonb('metadata').default({}).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    tenantIdx: index('trustai_chunks_tenant_idx').on(table.tenantId),
    docIdx: index('trustai_chunks_doc_idx').on(table.documentId),
  }),
);

// ---------------------------------------------------------------------------
// Audit Log — APPEND-ONLY, chain-hashed for tamper detection
// ---------------------------------------------------------------------------
// No updatedAt column — audit entries are IMMUTABLE.
// No delete operations should ever be performed on this table.
export const auditLog = pgTable(
  'trustai_audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .references(() => tenants.id)
      .notNull(),
    action: varchar('action', { length: 50 }).notNull(),
    actor: varchar('actor', { length: 255 }).notNull(),
    details: jsonb('details').default({}).notNull(),
    dataHash: varchar('data_hash', { length: 64 }),
    previousEntryHash: varchar('previous_entry_hash', { length: 64 }),
    timestamp: timestamp('timestamp').defaultNow().notNull(),
  },
  (table) => ({
    tenantIdx: index('trustai_audit_tenant_idx').on(table.tenantId),
    actionIdx: index('trustai_audit_action_idx').on(table.action),
    timestampIdx: index('trustai_audit_timestamp_idx').on(table.timestamp),
  }),
);

// ---------------------------------------------------------------------------
// Business Brain — structured, editable memory (W0.2)
// ---------------------------------------------------------------------------
// Four structured knowledge stores that power every generation run.
// Unlike unstructured vector memory, these are the "things a user can edit
// in the UI": brand voice, personas, products, campaign learnings.
// See docs/architecture/06-transparent-data-system.md §6a.
// ---------------------------------------------------------------------------

export const brainBrandVoice = pgTable(
  'trustai_brain_brand_voice',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .references(() => tenants.id, { onDelete: 'cascade' })
      .notNull(),
    // Single row per tenant per version — latest version is authoritative
    version: integer('version').default(1).notNull(),
    tone: varchar('tone', { length: 50 }).default('professional').notNull(),
    description: text('description'),
    wordsToUse: jsonb('words_to_use').$type<string[]>().default([]).notNull(),
    wordsToAvoid: jsonb('words_to_avoid').$type<string[]>().default([]).notNull(),
    examples: jsonb('examples').$type<string[]>().default([]).notNull(),
    updatedBy: varchar('updated_by', { length: 255 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    tenantIdx: index('trustai_brain_voice_tenant_idx').on(table.tenantId),
  }),
);

export const brainPersonas = pgTable(
  'trustai_brain_personas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .references(() => tenants.id, { onDelete: 'cascade' })
      .notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    attributes: jsonb('attributes').$type<{
      demographics?: string;
      painPoints?: string[];
      goals?: string[];
      channels?: string[];
    }>().default({}).notNull(),
    version: integer('version').default(1).notNull(),
    isPrimary: boolean('is_primary').default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    tenantIdx: index('trustai_brain_personas_tenant_idx').on(table.tenantId),
  }),
);

export const brainProducts = pgTable(
  'trustai_brain_products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .references(() => tenants.id, { onDelete: 'cascade' })
      .notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    price: varchar('price', { length: 64 }),
    attributes: jsonb('attributes').$type<{
      category?: string;
      features?: string[];
      benefits?: string[];
      targetPersonaIds?: string[];
    }>().default({}).notNull(),
    version: integer('version').default(1).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    tenantIdx: index('trustai_brain_products_tenant_idx').on(table.tenantId),
  }),
);

// ---------------------------------------------------------------------------
// Brain — Market Position (doc 10 §4)
// ---------------------------------------------------------------------------
// One row per tenant (latest version is authoritative). Stores the SWOT,
// differentiation, and positioning statement. Auto-populated by Market
// scan runs; manually editable by the CEO.
export const brainMarketPosition = pgTable(
  'trustai_brain_market_position',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .references(() => tenants.id, { onDelete: 'cascade' })
      .notNull(),
    version: integer('version').default(1).notNull(),
    swot: jsonb('swot').$type<{
      strengths?: string[];
      weaknesses?: string[];
      opportunities?: string[];
      threats?: string[];
    }>().default({}).notNull(),
    differentiation: text('differentiation'),
    positioningStatement: text('positioning_statement'),
    targetMarket: text('target_market'),
    updatedBy: varchar('updated_by', { length: 255 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    tenantIdx: index('trustai_brain_market_pos_tenant_idx').on(table.tenantId),
  }),
);

// ---------------------------------------------------------------------------
// Brain — Sales Playbook (doc 10 §4)
// ---------------------------------------------------------------------------
// One row per tenant. Drives the AI Deal Assistant's next-action + email
// drafting. CEO edits this directly; the Assistant never overwrites it.
export const brainSalesPlaybook = pgTable(
  'trustai_brain_sales_playbook',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .references(() => tenants.id, { onDelete: 'cascade' })
      .notNull(),
    version: integer('version').default(1).notNull(),
    idealCustomerProfile: text('ideal_customer_profile'),
    qualificationRules: jsonb('qualification_rules').$type<string[]>().default([]).notNull(),
    stages: jsonb('stages').$type<Array<{
      name: string;
      description?: string;
      exitCriteria?: string;
    }>>().default([]).notNull(),
    objections: jsonb('objections').$type<Array<{
      objection: string;
      response: string;
    }>>().default([]).notNull(),
    closingLines: jsonb('closing_lines').$type<string[]>().default([]).notNull(),
    emailTemplates: jsonb('email_templates').$type<Array<{
      name: string;
      stage?: string;
      body: string;
    }>>().default([]).notNull(),
    updatedBy: varchar('updated_by', { length: 255 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    tenantIdx: index('trustai_brain_sales_pb_tenant_idx').on(table.tenantId),
  }),
);

// ---------------------------------------------------------------------------
// Brain — Marketing Strategy (doc 10 §4)
// ---------------------------------------------------------------------------
// One row per tenant. Drives the Campaigns generator — which channels,
// which themes, which voice per channel. Includes offline channels so
// the CEO can track real-world marketing in one place.
export const brainMarketingStrategy = pgTable(
  'trustai_brain_marketing_strategy',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .references(() => tenants.id, { onDelete: 'cascade' })
      .notNull(),
    version: integer('version').default(1).notNull(),
    channels: jsonb('channels').$type<Array<{
      name: string;
      kind: 'online' | 'offline';
      enabled: boolean;
      budgetShare?: number;
      voiceOverride?: string;
      notes?: string;
    }>>().default([]).notNull(),
    monthlyBudget: varchar('monthly_budget', { length: 64 }),
    themes: jsonb('themes').$type<Array<{
      title: string;
      description?: string;
      quarter?: string;
    }>>().default([]).notNull(),
    funnelStages: jsonb('funnel_stages').$type<string[]>().default([]).notNull(),
    kpis: jsonb('kpis').$type<Array<{
      name: string;
      target?: string;
    }>>().default([]).notNull(),
    updatedBy: varchar('updated_by', { length: 255 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    tenantIdx: index('trustai_brain_mkt_strat_tenant_idx').on(table.tenantId),
  }),
);

export const brainCampaignLearnings = pgTable(
  'trustai_brain_campaign_learnings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .references(() => tenants.id, { onDelete: 'cascade' })
      .notNull(),
    // External campaign id (from core.campaigns table, not FK since core may
    // be separate). Kept as plain uuid for traceability only.
    campaignId: uuid('campaign_id'),
    lesson: text('lesson').notNull(),
    category: varchar('category', { length: 50 }), // win, fail, insight
    metricSnapshot: jsonb('metric_snapshot').default({}).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    tenantIdx: index('trustai_brain_learnings_tenant_idx').on(table.tenantId),
  }),
);

// ---------------------------------------------------------------------------
// Market & Competitors (doc 10 §5)
// ---------------------------------------------------------------------------

export const marketCompetitors = pgTable(
  'trustai_market_competitors',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .references(() => tenants.id, { onDelete: 'cascade' })
      .notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    url: varchar('url', { length: 1024 }),
    keywords: jsonb('keywords').$type<string[]>().default([]).notNull(),
    notes: text('notes'),
    lastScanAt: timestamp('last_scan_at'),
    latestSignals: jsonb('latest_signals').$type<Array<{
      type: string;
      text: string;
      url?: string;
      date?: string;
    }>>().default([]).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    tenantIdx: index('trustai_market_comp_tenant_idx').on(table.tenantId),
  }),
);

export const marketScans = pgTable(
  'trustai_market_scans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .references(() => tenants.id, { onDelete: 'cascade' })
      .notNull(),
    competitorId: uuid('competitor_id').references(() => marketCompetitors.id, {
      onDelete: 'cascade',
    }),
    status: varchar('status', { length: 20 }).default('running').notNull(),
    startedAt: timestamp('started_at').defaultNow().notNull(),
    completedAt: timestamp('completed_at'),
    sources: jsonb('sources').$type<Array<{
      kind: string;
      url: string;
      fetchedAt: string;
    }>>().default([]).notNull(),
    signals: jsonb('signals').$type<Array<{
      type: string;
      text: string;
      url?: string;
      date?: string;
    }>>().default([]).notNull(),
    aiSummary: text('ai_summary'),
    recommendedAction: text('recommended_action'),
    errorMessage: text('error_message'),
  },
  (table) => ({
    tenantIdx: index('trustai_market_scans_tenant_idx').on(table.tenantId),
    competitorIdx: index('trustai_market_scans_comp_idx').on(table.competitorId),
  }),
);

// ---------------------------------------------------------------------------
// Sales — Deals + Deal Events (doc 10 §6)
// ---------------------------------------------------------------------------

export const deals = pgTable(
  'trustai_deals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .references(() => tenants.id, { onDelete: 'cascade' })
      .notNull(),
    leadId: uuid('lead_id'), // optional FK to core.leads, kept loose
    title: varchar('title', { length: 255 }).notNull(),
    contactName: varchar('contact_name', { length: 255 }),
    contactEmail: varchar('contact_email', { length: 255 }),
    company: varchar('company', { length: 255 }),
    value: varchar('value', { length: 64 }),
    currency: varchar('currency', { length: 10 }).default('USD').notNull(),
    stage: varchar('stage', { length: 30 }).default('discovery').notNull(),
    closeDate: timestamp('close_date'),
    notes: text('notes'),
    nextAction: text('next_action'),
    nextActionDueAt: timestamp('next_action_due_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    tenantIdx: index('trustai_deals_tenant_idx').on(table.tenantId),
    stageIdx: index('trustai_deals_stage_idx').on(table.stage),
  }),
);

export const dealEvents = pgTable(
  'trustai_deal_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    dealId: uuid('deal_id')
      .references(() => deals.id, { onDelete: 'cascade' })
      .notNull(),
    type: varchar('type', { length: 50 }).notNull(),
    payload: jsonb('payload').default({}).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    dealIdx: index('trustai_deal_events_deal_idx').on(table.dealId),
  }),
);

// ---------------------------------------------------------------------------
// CEO Advisor briefs (doc 10 §8)
// ---------------------------------------------------------------------------

export const ceoAdvisorBriefs = pgTable(
  'trustai_ceo_advisor_briefs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .references(() => tenants.id, { onDelete: 'cascade' })
      .notNull(),
    generatedAt: timestamp('generated_at').defaultNow().notNull(),
    headline: text('headline'),
    actions: jsonb('actions').$type<Array<{
      title: string;
      why: string;
      impact?: string;
      link?: string;
      severity?: 'critical' | 'high' | 'medium' | 'low';
    }>>().default([]).notNull(),
    wins: jsonb('wins').$type<Array<{ what: string; detail?: string }>>().default([]).notNull(),
    alerts: jsonb('alerts').$type<Array<{ what: string; detail?: string; link?: string }>>()
      .default([])
      .notNull(),
    sourcesUsed: jsonb('sources_used').default({}).notNull(),
    model: varchar('model', { length: 100 }),
    traceId: varchar('trace_id', { length: 100 }),
  },
  (table) => ({
    tenantIdx: index('trustai_ceo_brief_tenant_idx').on(table.tenantId),
  }),
);

// ---------------------------------------------------------------------------
// Deployment Modes — per-tenant cloud / private / on-premise routing (P0-A1)
// ---------------------------------------------------------------------------
// One row per tenant. Drives how apps/api resolves the LLM provider for a
// given company: shared cloud default, bring-your-own keys (private), or
// operator-supplied vLLM endpoint (on_premise). See
// docs/architecture/08-post-managed-agents-pmf-plan.md P0-A1.
export const deploymentModes = pgTable(
  'trustai_deployment_modes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .references(() => tenants.id, { onDelete: 'cascade' })
      .notNull(),
    // 'cloud' | 'private' | 'on_premise'
    mode: varchar('mode', { length: 20 }).notNull(),
    vllmUrl: text('vllm_url'),
    vllmModel: varchar('vllm_model', { length: 255 }),
    // Reserved for future per-mode options (byo api keys, regions, etc).
    config: jsonb('config').default({}).notNull(),
    updatedBy: varchar('updated_by', { length: 255 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    tenantIdx: uniqueIndex('trustai_deployment_modes_tenant_idx').on(table.tenantId),
  }),
);

// ---------------------------------------------------------------------------
// System Configs — app-wide configuration managed from the admin UI
// ---------------------------------------------------------------------------
// Replaces .env for everything that a non-technical operator should be
// able to change without shelling into the server: LLM provider keys,
// per-feature LLM assignment, image generation, Stripe, Google OAuth,
// Meta Ads credentials, etc.
//
// Layout:
//   category = 'provider'    — LLM providers (openai, anthropic, gemini, ollama, vllm)
//   category = 'feature'     — Per-feature LLM mapping (campaign_banner_copy, social_post, etc)
//   category = 'integration' — Stripe, Google OAuth, Meta Ads, Sentry
//   category = 'image'       — Image generation providers (gemini-imagen, dalle, banana)
//
// Secrets (API keys, webhook secrets) are encrypted at rest with AES-256-GCM
// using the same master key as the BYO key storage (TRUSTAI_KEY_ENCRYPTION_KEY).
// The `value` jsonb holds non-secret fields; `secrets` jsonb holds EncryptedKey
// blobs keyed by field name. Frontend never receives plaintext secrets.
//
// See docs/architecture/08-post-managed-agents-pmf-plan.md (Phase 4 admin config)
export const systemConfigs = pgTable(
  'trustai_system_configs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    category: varchar('category', { length: 30 }).notNull(),
    key: varchar('key', { length: 100 }).notNull(),
    label: varchar('label', { length: 255 }),
    description: text('description'),
    // Non-sensitive fields (models, URLs, temperature, booleans, etc.)
    value: jsonb('value').default({}).notNull(),
    // Encrypted secret fields — each value is an EncryptedKey { iv, ct, tag, kdf, v }
    secrets: jsonb('secrets').default({}).notNull(),
    // Status tracked by the last successful connection test.
    // 'unknown' | 'connected' | 'error' | 'unconfigured'
    status: varchar('status', { length: 20 }).default('unknown').notNull(),
    statusMessage: text('status_message'),
    statusCheckedAt: timestamp('status_checked_at'),
    enabled: boolean('enabled').default(true).notNull(),
    updatedBy: varchar('updated_by', { length: 255 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    uniq: uniqueIndex('trustai_system_configs_cat_key_idx').on(table.category, table.key),
    categoryIdx: index('trustai_system_configs_category_idx').on(table.category),
  }),
);

// ---------------------------------------------------------------------------
// Credit Plans — admin-managed subscription tiers (Phase B)
// ---------------------------------------------------------------------------
// Single source of truth for what each plan includes. Pricing page
// reads from this; Stripe price IDs are stored here so admin can swap
// pricing without redeploying. See docs/architecture/09-pricing-and-credits.md.
export const creditPlans = pgTable('trustai_credit_plans', {
  key: varchar('key', { length: 30 }).primaryKey(), // 'free' | 'pro' | 'team' | 'business' | 'enterprise'
  label: varchar('label', { length: 100 }).notNull(),
  description: text('description'),
  monthlyPriceCents: integer('monthly_price_cents').default(0).notNull(),
  yearlyPriceCents: integer('yearly_price_cents').default(0).notNull(),
  monthlyGrant: integer('monthly_grant').default(0).notNull(),
  rolloverMonths: integer('rollover_months').default(1).notNull(),
  seats: integer('seats').default(1).notNull(),
  byoKeyDiscountPct: integer('byo_key_discount_pct').default(0).notNull(),
  features: jsonb('features').$type<string[]>().default([]).notNull(),
  stripePriceIdMonthly: varchar('stripe_price_id_monthly', { length: 100 }),
  stripePriceIdYearly: varchar('stripe_price_id_yearly', { length: 100 }),
  enabled: boolean('enabled').default(true).notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Credit Balances — per-tenant subscription state + balance
// ---------------------------------------------------------------------------
// One row per tenant. monthly_balance is the current period's grant
// (decremented as user spends, refilled by the monthly cron).
// topup_balance is from credit pack purchases (never expires).
// Charges debit monthly_balance first, then topup_balance.
export const creditBalances = pgTable(
  'trustai_credit_balances',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .references(() => tenants.id, { onDelete: 'cascade' })
      .notNull(),
    plan: varchar('plan', { length: 30 }).default('free').notNull(),
    monthlyGrant: integer('monthly_grant').default(1000).notNull(),
    monthlyBalance: integer('monthly_balance').default(1000).notNull(),
    topupBalance: integer('topup_balance').default(0).notNull(),
    rolloverBalance: integer('rollover_balance').default(0).notNull(),
    billingPeriodStart: timestamp('billing_period_start').defaultNow().notNull(),
    billingPeriodEnd: timestamp('billing_period_end').notNull(),
    byoKeyDiscount: boolean('byo_key_discount').default(false).notNull(),
    stripeCustomerId: varchar('stripe_customer_id', { length: 100 }),
    stripeSubscriptionId: varchar('stripe_subscription_id', { length: 100 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    tenantIdx: uniqueIndex('trustai_credit_balances_tenant_idx').on(table.tenantId),
  }),
);

// ---------------------------------------------------------------------------
// Credit Transactions — append-only ledger of every debit/credit
// ---------------------------------------------------------------------------
// Used for: billing audit, "why am I out of credits" analysis, abuse
// detection, monthly invoice generation. Never updated, never deleted.
export const creditTransactions = pgTable(
  'trustai_credit_transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .references(() => tenants.id, { onDelete: 'cascade' })
      .notNull(),
    // 'debit' | 'grant' | 'topup' | 'refund' | 'rollover' | 'expire'
    kind: varchar('kind', { length: 20 }).notNull(),
    // Positive for credit (grant/topup/refund), negative for debit/expire
    amount: integer('amount').notNull(),
    balanceAfter: integer('balance_after').notNull(),
    featureKey: varchar('feature_key', { length: 100 }),
    tier: varchar('tier', { length: 20 }),
    refKind: varchar('ref_kind', { length: 30 }),
    refId: varchar('ref_id', { length: 100 }),
    actor: varchar('actor', { length: 255 }),
    note: text('note'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    tenantIdx: index('trustai_credit_tx_tenant_idx').on(table.tenantId),
    createdIdx: index('trustai_credit_tx_created_idx').on(table.createdAt),
  }),
);

// ---------------------------------------------------------------------------
// Query History — for analytics and billing
// ---------------------------------------------------------------------------
export const queryHistory = pgTable(
  'trustai_query_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .references(() => tenants.id, { onDelete: 'cascade' })
      .notNull(),
    agentId: uuid('agent_id').references(() => tenantAgents.id),
    question: text('question').notNull(),
    answer: text('answer').notNull(),
    retrievedChunkIds: jsonb('retrieved_chunk_ids').default([]).notNull(),
    promptTokens: integer('prompt_tokens'),
    completionTokens: integer('completion_tokens'),
    retrievalTimeMs: integer('retrieval_time_ms'),
    inferenceTimeMs: integer('inference_time_ms'),
    traceId: varchar('trace_id', { length: 64 }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    tenantIdx: index('trustai_queries_tenant_idx').on(table.tenantId),
  }),
);
