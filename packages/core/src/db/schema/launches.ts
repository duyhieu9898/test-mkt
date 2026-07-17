/**
 * Block 8 — Campaign Launcher.
 *
 * One row per "launch": founder picks a keyword, the orchestrator runs
 * blog generation → image variations → optional WordPress publish →
 * optional social drafts. We persist a structured `steps` array so the
 * web page can render the progress in real time and so we can re-run
 * individual steps later if one fails.
 */
import {
  pgTable,
  uuid,
  varchar,
  text,
  jsonb,
  timestamp,
  index,
  boolean,
  integer,
} from 'drizzle-orm/pg-core';
import { companies } from './companies';

export type LaunchStepStatus = 'pending' | 'running' | 'done' | 'skipped' | 'error';

export interface LaunchStep {
  /** Stable key: "blog" | "images" | "wordpress" | "social_fb" | "social_li" | "geo_seed" | "social_post". */
  key: string;
  /** Human label shown in the UI. */
  label: string;
  status: LaunchStepStatus;
  startedAt?: string;
  finishedAt?: string;
  message?: string;
  /** Step-specific result payload (blogPostId, image URLs, WP post URL...). */
  result?: Record<string, unknown>;
  error?: string;
}

export type LaunchOverallStatus = 'queued' | 'running' | 'completed' | 'partial' | 'failed';

export const campaignLaunches = pgTable(
  'campaign_launches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),

    keyword: text('keyword').notNull(),
    brief: text('brief'),
    /** Channels the founder asked to publish to — drives which steps run. */
    targets: jsonb('targets').$type<{
      wordpress: boolean;
      facebook: boolean;
      linkedin: boolean;
      instagram: boolean;
      imageMode?: 'ai' | 'uploaded';
      uploadedAssetIds?: string[];
    }>().notNull(),

    status: varchar('status', { length: 20 }).$type<LaunchOverallStatus>().default('queued').notNull(),
    steps: jsonb('steps').$type<LaunchStep[]>().default([]).notNull(),

    /** Who triggered this launch — manual one-click vs the daily autopilot. */
    source: varchar('source', { length: 16 }).$type<'manual' | 'autopilot'>().default('manual').notNull(),

    /** Convenience pointers — the actual data lives on related tables. */
    blogPostId: uuid('blog_post_id'),
    heroImageUrl: text('hero_image_url'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    companyIdx: index('campaign_launches_company_idx').on(t.companyId),
    statusIdx: index('campaign_launches_status_idx').on(t.companyId, t.status),
  }),
);

export type CampaignLaunch = typeof campaignLaunches.$inferSelect;
export type NewCampaignLaunch = typeof campaignLaunches.$inferInsert;

/* ─── Content Autopilot (P8) ─────────────────────────────────────── */
/**
 * One row per company. When `enabled`, a scheduler generates `postsPerDay`
 * blog posts (via the Campaign Launcher) on a daily cadence, drawing keywords
 * from `keywordQueue` and rotating used ones into `usedKeywords`.
 * Default mode publishes WordPress DRAFTS — the founder approves in WP
 * (human-in-the-loop). Only enabled companies are ever touched by the scheduler.
 */
export interface AutopilotTargets {
  wordpress: boolean;
  facebook: boolean;
  linkedin: boolean;
  instagram: boolean;
}

export const contentAutopilot = pgTable(
  'content_autopilot',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }).unique(),

    enabled: boolean('enabled').default(false).notNull(),
    postsPerDay: integer('posts_per_day').default(1).notNull(),
    targets: jsonb('targets').$type<AutopilotTargets>().default({ wordpress: true, facebook: false, linkedin: false, instagram: false }).notNull(),
    /** 'draft' = WP draft for approval (default, human-in-the-loop). 'autopublish' reserved for later. */
    mode: varchar('mode', { length: 16 }).$type<'draft' | 'autopublish'>().default('draft').notNull(),

    /** Queue of topics/keywords still to write, and the ones already used. */
    keywordQueue: jsonb('keyword_queue').$type<string[]>().default([]).notNull(),
    usedKeywords: jsonb('used_keywords').$type<string[]>().default([]).notNull(),

    lastRunAt: timestamp('last_run_at'),
    nextRunAt: timestamp('next_run_at'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    companyIdx: index('content_autopilot_company_idx').on(t.companyId),
    dueIdx: index('content_autopilot_due_idx').on(t.enabled, t.nextRunAt),
  }),
);

export type ContentAutopilot = typeof contentAutopilot.$inferSelect;
export type NewContentAutopilot = typeof contentAutopilot.$inferInsert;
