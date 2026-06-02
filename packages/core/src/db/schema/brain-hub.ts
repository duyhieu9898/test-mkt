/**
 * Brain Hub — source-agnostic ingestion plane (Phase A).
 *
 * Two tables:
 *   - data_sources  every "tap" the company connects (file upload,
 *                   pasted CSV, internal-tap of chatbot/leads, future
 *                   OAuth/polling sources). One row per logical source.
 *   - data_events   the normalized event stream — every datapoint that
 *                   ever flowed into the brain. Auto-embedded for
 *                   semantic search; auto-tagged with topic + sentiment.
 *
 * Design notes:
 *   - Six source types cover everything (manual_upload, bulk_import,
 *     oauth_api, webhook_inbound, internal_tap, polling_feed). Phase A
 *     only ships the first two + internal_tap; the others are reserved
 *     in the enum so Phase C is a config-only addition.
 *   - Embedding lives on data_events directly (separate from
 *     embedding_chunks). It's a different read pattern: chronological
 *     event stream vs. content-chunk RAG.
 *   - topic_tags + sentiment let watchers (Phase B) match without
 *     re-running the LLM.
 */
import {
  pgTable,
  uuid,
  text,
  varchar,
  jsonb,
  timestamp,
  index,
  customType,
} from 'drizzle-orm/pg-core';
import { companies } from './companies';

// Custom pgvector type — same shape as team.ts, kept local so we don't
// reach across schemas for a primitive.
const vector = (name: string, dim = 1536) =>
  customType<{ data: number[]; driverData: string }>({
    dataType() {
      return `vector(${dim})`;
    },
    toDriver(value: number[]): string {
      return `[${value.join(',')}]`;
    },
    fromDriver(value: string): number[] {
      return JSON.parse(value);
    },
  })(name);

/* ─── Sources ──────────────────────────────────────────────────── */

export type BrainSourceType =
  | 'manual_upload'    // user uploads a file (PDF/CSV/TXT/MD)
  | 'bulk_import'      // user pastes text or CSV
  | 'oauth_api'        // OAuth-connected polled API — Phase C
  | 'webhook_inbound'  // external system POSTs to us — Phase C
  | 'internal_tap'     // tap into our own existing data
  | 'polling_feed';    // we poll a feed on schedule — Phase C

export type BrainSourceStatus = 'active' | 'paused' | 'error';

/** Internal-tap subtypes are the ones wired on day 1. */
export type InternalTapSubtype =
  | 'chatbot_message'
  | 'omnichannel_message'
  | 'lead_capture'
  | 'growth_score_delta';

export const dataSources = pgTable(
  'data_sources',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),

    name: varchar('name', { length: 120 }).notNull(),
    type: varchar('type', { length: 32 }).$type<BrainSourceType>().notNull(),
    subtype: varchar('subtype', { length: 64 }), // e.g. 'chatbot_message', 'pdf', 'csv'

    /**
     * Type-specific config — OAuth tokens (encrypted), polling URL,
     * uploaded filename, etc. Always a JSON object so adapters can
     * evolve without migrations.
     */
    config: jsonb('config').$type<Record<string, unknown>>().default({}).notNull(),

    status: varchar('status', { length: 20 }).$type<BrainSourceStatus>().default('active').notNull(),
    lastSyncedAt: timestamp('last_synced_at'),
    lastError: text('last_error'),

    /** Cached count of events ingested via this source. */
    eventCount: jsonb('event_count').$type<{ total: number; last7d: number }>()
      .default({ total: 0, last7d: 0 })
      .notNull(),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    companyIdx: index('data_sources_company_idx').on(t.companyId),
    typeIdx: index('data_sources_type_idx').on(t.companyId, t.type),
    statusIdx: index('data_sources_status_idx').on(t.companyId, t.status),
  }),
);

export type DataSource = typeof dataSources.$inferSelect;
export type NewDataSource = typeof dataSources.$inferInsert;

/* ─── Events ───────────────────────────────────────────────────── */

export type EventType =
  | 'message'        // inbound chatbot/Messenger/email
  | 'lead'           // captured lead
  | 'transaction'    // purchase / signup
  | 'feedback'       // NPS / survey / review
  | 'trend'          // external trend signal
  | 'mention'        // brand mention / citation
  | 'pageview'       // analytics pageview
  | 'commit'         // dev event
  | 'milestone'      // growth-score level, streak, etc.
  | 'document'       // uploaded/imported document chunk
  | 'other';

export type EventSentiment = 'positive' | 'negative' | 'neutral' | 'question' | 'objection' | 'praise';

export const dataEvents = pgTable(
  'data_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
    sourceId: uuid('source_id').notNull().references(() => dataSources.id, { onDelete: 'cascade' }),

    type: varchar('type', { length: 40 }).$type<EventType>().notNull(),

    /** One-line gist for human scan — what shows in the stream list. */
    subject: varchar('subject', { length: 255 }).notNull(),
    /** Full body text — what gets embedded. */
    content: text('content').notNull(),
    /** Raw structured payload (original adapter output). */
    payload: jsonb('payload').$type<Record<string, unknown>>().default({}).notNull(),

    /** 1536-d embedding of `content` for semantic search. Nullable while async-tagged. */
    embedding: vector('embedding', 1536),

    /** Auto-extracted topic tags (LLM tagger). 1-3 typical. */
    topicTags: jsonb('topic_tags').$type<string[]>().default([]).notNull(),
    sentiment: varchar('sentiment', { length: 20 }).$type<EventSentiment>(),

    /** When the underlying event actually happened (vs. when we ingested it). */
    occurredAt: timestamp('occurred_at').defaultNow().notNull(),
    ingestedAt: timestamp('ingested_at').defaultNow().notNull(),
  },
  (t) => ({
    companyIdx: index('data_events_company_idx').on(t.companyId),
    sourceIdx: index('data_events_source_idx').on(t.companyId, t.sourceId),
    typeIdx: index('data_events_type_idx').on(t.companyId, t.type),
    occurredIdx: index('data_events_occurred_idx').on(t.companyId, t.occurredAt),
    sentimentIdx: index('data_events_sentiment_idx').on(t.companyId, t.sentiment),
    // ivfflat vector index created in migration SQL (Drizzle DSL can't
    // emit `USING ivfflat` yet — see 0007_brain_hub.sql).
  }),
);

export type DataEvent = typeof dataEvents.$inferSelect;
export type NewDataEvent = typeof dataEvents.$inferInsert;

/* ─── Watchers (Phase B) ───────────────────────────────────────── */

/**
 * A watcher fires when its condition matches recent events. Phase B
 * supports three condition kinds — extending is just a new case in the
 * evaluator + a UI editor for the new params.
 */
export type WatcherConditionKind =
  | 'recurring_topic'   // same topic_tag appears ≥ N times in a window
  | 'event_spike'       // ≥ N events with given filters in a window
  | 'keyword_match';    // content contains specific phrase(s)

export interface RecurringTopicCondition {
  kind: 'recurring_topic';
  minOccurrences: number;     // e.g. 3
  windowHours: number;        // e.g. 168 (7d)
  /** Optional pre-filter — only events with this sentiment count. */
  sentiment?: 'positive' | 'negative' | 'neutral' | 'question' | 'objection' | 'praise';
  /** Optional pre-filter — only these source subtypes. */
  sourceSubtypes?: string[];  // e.g. ['chatbot_message','omnichannel_message']
}

export interface EventSpikeCondition {
  kind: 'event_spike';
  minCount: number;
  windowHours: number;
  /** Optional filters — same shape as recurring_topic. */
  type?: string;              // e.g. 'lead' to spike on lead inflow
  sentiment?: string;
  sourceSubtypes?: string[];
}

export interface KeywordMatchCondition {
  kind: 'keyword_match';
  phrases: string[];          // case-insensitive substring match
  minMatches: number;         // e.g. 1
  windowHours: number;
}

export type WatcherCondition =
  | RecurringTopicCondition
  | EventSpikeCondition
  | KeywordMatchCondition;

/**
 * Action templates a fired watcher composes into a reaction. v1 ships
 * 3; new types are just a new case in the composer + a UI label.
 */
export type ReactionActionType =
  | 'notify'              // just surface in Today's Reactions
  | 'chatbot_faq_draft'   // LLM drafts an answer the founder can paste into chatbot KB
  | 'blog_draft_launcher'; // queue a Campaign Launcher run with topic pre-filled

export interface WatcherActionTemplate {
  type: ReactionActionType;
  /** Free-form params (e.g. tone, channel targets for the launcher). */
  params?: Record<string, unknown>;
}

export type WatcherStatus = 'active' | 'paused' | 'error';

export const brainWatchers = pgTable(
  'brain_watchers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),

    /** Stable slug, lets us recognize pre-seeded defaults across re-seeds. */
    slug: varchar('slug', { length: 80 }).notNull(),
    name: varchar('name', { length: 160 }).notNull(),
    description: text('description').notNull(),

    condition: jsonb('condition').$type<WatcherCondition>().notNull(),
    actions: jsonb('actions').$type<WatcherActionTemplate[]>().default([]).notNull(),

    /**
     * Cooldown — once fired, this watcher won't re-fire on the same
     * `groupKey` (topic / phrase / etc.) for at least this many hours.
     * Stops the user from getting 30 duplicate reactions.
     */
    cooldownHours: jsonb('cooldown_hours').$type<number>().default(72).notNull(),

    /**
     * Auto-publish gate. Default 'review' = always create a reaction
     * with status='suggested'. 'auto_high_conf' = auto-promote when
     * the composer reports confidence ≥ 0.85 (chatbot_faq_draft only).
     */
    autoMode: varchar('auto_mode', { length: 24 })
      .$type<'review' | 'auto_high_conf'>()
      .default('review')
      .notNull(),

    status: varchar('status', { length: 20 }).$type<WatcherStatus>().default('active').notNull(),
    lastFiredAt: timestamp('last_fired_at'),
    fireCount: jsonb('fire_count').$type<number>().default(0).notNull(),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    companyIdx: index('brain_watchers_company_idx').on(t.companyId),
    slugIdx: index('brain_watchers_slug_idx').on(t.companyId, t.slug),
    statusIdx: index('brain_watchers_status_idx').on(t.companyId, t.status),
  }),
);

export type BrainWatcher = typeof brainWatchers.$inferSelect;
export type NewBrainWatcher = typeof brainWatchers.$inferInsert;

/* ─── Reactions (Phase B) ──────────────────────────────────────── */

export type ReactionStatus = 'suggested' | 'approved' | 'published' | 'dismissed' | 'expired';

/**
 * A single artifact a reaction proposed (one draft per action). Stored
 * inline in jsonb so we don't need a third table for v1.
 */
export interface ReactionDraft {
  actionType: ReactionActionType;
  /** Display heading shown in the Reactions UI. */
  title: string;
  /** The actual generated body — markdown / plain text / JSON for launcher params. */
  body: string;
  /** 0-1 confidence from the composer. */
  confidence: number;
  /** Where the draft can be opened/used after approval. */
  followUp?: {
    label: string;     // e.g. "Open in Campaign Launcher"
    href?: string;     // app-relative path
    launchId?: string; // set when blog_draft_launcher kicked a launch
  };
}

export const brainReactions = pgTable(
  'brain_reactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
    watcherId: uuid('watcher_id').notNull().references(() => brainWatchers.id, { onDelete: 'cascade' }),

    /**
     * Group key for cooldown — e.g. the topic tag or matched phrase
     * that caused this fire. Same group within cooldown window is
     * suppressed.
     */
    groupKey: varchar('group_key', { length: 200 }).notNull(),

    /** Human one-liner shown in the dashboard. */
    headline: varchar('headline', { length: 255 }).notNull(),
    /** Optional longer summary of WHY it fired. */
    summary: text('summary'),

    /** IDs of the events that caused the fire (capped to 20). */
    triggerEventIds: jsonb('trigger_event_ids').$type<string[]>().default([]).notNull(),
    /** Per-action drafts. */
    drafts: jsonb('drafts').$type<ReactionDraft[]>().default([]).notNull(),

    status: varchar('status', { length: 20 }).$type<ReactionStatus>().default('suggested').notNull(),

    firedAt: timestamp('fired_at').defaultNow().notNull(),
    reviewedAt: timestamp('reviewed_at'),
    /**
     * Trend-style reactions go stale fast — chatbot-question reactions
     * keep forever (null). Set to a date for time-sensitive ones.
     */
    expiresAt: timestamp('expires_at'),
  },
  (t) => ({
    companyIdx: index('brain_reactions_company_idx').on(t.companyId),
    watcherIdx: index('brain_reactions_watcher_idx').on(t.companyId, t.watcherId),
    statusIdx: index('brain_reactions_status_idx').on(t.companyId, t.status),
    firedIdx: index('brain_reactions_fired_idx').on(t.companyId, t.firedAt),
    groupKeyIdx: index('brain_reactions_groupkey_idx').on(t.companyId, t.watcherId, t.groupKey),
  }),
);

export type BrainReaction = typeof brainReactions.$inferSelect;
export type NewBrainReaction = typeof brainReactions.$inferInsert;
