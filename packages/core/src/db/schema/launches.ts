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

    keyword: varchar('keyword', { length: 255 }).notNull(),
    brief: text('brief'),
    /** Channels the founder asked to publish to — drives which steps run. */
    targets: jsonb('targets').$type<{
      wordpress: boolean;
      facebook: boolean;
      linkedin: boolean;
      instagram: boolean;
    }>().notNull(),

    status: varchar('status', { length: 20 }).$type<LaunchOverallStatus>().default('queued').notNull(),
    steps: jsonb('steps').$type<LaunchStep[]>().default([]).notNull(),

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
