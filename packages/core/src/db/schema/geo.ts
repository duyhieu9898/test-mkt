/**
 * GEO (Generative Engine Optimization) Schema — Block 1
 *
 * Tracks how the brand is mentioned in answers from generative AI engines
 * (ChatGPT, Claude, Perplexity, etc.) Founder defines prompts to monitor;
 * we replay them across providers and parse out brand + competitor mentions.
 *
 * See docs/strategy/build-now-plan.md §"BLOCK 1 — GEO Layer MVP".
 */

import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  jsonb,
  integer,
  boolean,
  real,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { companies } from './companies';

export type GeoSentiment = 'positive' | 'neutral' | 'negative' | 'unknown';

// === Prompts tracked by founder ===

export const geoPrompts = pgTable(
  'geo_prompts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .references(() => companies.id, { onDelete: 'cascade' })
      .notNull(),
    promptText: text('prompt_text').notNull(),
    active: boolean('active').default(true).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    companyIdx: index('geo_prompts_company_idx').on(table.companyId),
  })
);

// === Individual provider runs ===

export const geoMentions = pgTable(
  'geo_mentions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .references(() => companies.id, { onDelete: 'cascade' })
      .notNull(),
    promptId: uuid('prompt_id')
      .references(() => geoPrompts.id, { onDelete: 'cascade' })
      .notNull(),
    provider: varchar('provider', { length: 32 }).notNull(),
    runAt: timestamp('run_at').defaultNow().notNull(),
    responseText: text('response_text').notNull(),
    brandMentioned: boolean('brand_mentioned').default(false).notNull(),
    /** 1-based index where brand first appears among entities; null if absent. */
    mentionPosition: integer('mention_position'),
    competitorsMentioned: jsonb('competitors_mentioned').$type<string[]>().default([]),
    sentiment: varchar('sentiment', { length: 16 }).$type<GeoSentiment>().default('unknown').notNull(),
  },
  (table) => ({
    companyIdx: index('geo_mentions_company_idx').on(table.companyId),
    promptIdx: index('geo_mentions_prompt_idx').on(table.promptId),
    runAtIdx: index('geo_mentions_run_at_idx').on(table.runAt),
  })
);

// === Rolling aggregate per period ===

export const geoShareOfVoice = pgTable(
  'geo_share_of_voice',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .references(() => companies.id, { onDelete: 'cascade' })
      .notNull(),
    computedAt: timestamp('computed_at').defaultNow().notNull(),
    periodDays: integer('period_days').default(7).notNull(),
    sovPercent: real('sov_percent').default(0).notNull(),
    brandMentionsCount: integer('brand_mentions_count').default(0).notNull(),
    totalMentionsCount: integer('total_mentions_count').default(0).notNull(),
  },
  (table) => ({
    companyIdx: index('geo_sov_company_idx').on(table.companyId),
    computedAtIdx: index('geo_sov_computed_at_idx').on(table.computedAt),
  })
);

// === Relations ===

export const geoPromptsRelations = relations(geoPrompts, ({ one, many }) => ({
  company: one(companies, { fields: [geoPrompts.companyId], references: [companies.id] }),
  mentions: many(geoMentions),
}));

export const geoMentionsRelations = relations(geoMentions, ({ one }) => ({
  company: one(companies, { fields: [geoMentions.companyId], references: [companies.id] }),
  prompt: one(geoPrompts, { fields: [geoMentions.promptId], references: [geoPrompts.id] }),
}));

export const geoShareOfVoiceRelations = relations(geoShareOfVoice, ({ one }) => ({
  company: one(companies, { fields: [geoShareOfVoice.companyId], references: [companies.id] }),
}));
