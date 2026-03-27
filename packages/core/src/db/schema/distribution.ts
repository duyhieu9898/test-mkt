import {
  pgTable,
  uuid,
  text,
  timestamp,
  pgEnum,
  jsonb,
  boolean,
  integer,
  decimal,
} from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { agents } from './agents';

// ============================================
// SOCIAL PLATFORM CONNECTIONS
// ============================================

export const socialPlatformEnum = pgEnum('social_platform', [
  'facebook',
  'instagram',
  'twitter',
  'linkedin',
  'tiktok',
  'youtube',
]);

export const connectionStatusEnum = pgEnum('connection_status', [
  'connected',
  'expired',
  'revoked',
  'error',
]);

// Store OAuth connections to social platforms
export const socialConnections = pgTable('social_connections', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),

  platform: socialPlatformEnum('platform').notNull(),
  status: connectionStatusEnum('status').notNull().default('connected'),

  // OAuth tokens (encrypted in production)
  accessToken: text('access_token').notNull(),
  refreshToken: text('refresh_token'),
  tokenExpiresAt: timestamp('token_expires_at'),

  // Platform-specific IDs
  platformUserId: text('platform_user_id'),
  platformPageId: text('platform_page_id'), // For Facebook Pages
  platformAccountName: text('platform_account_name'),

  // Permissions granted
  permissions: jsonb('permissions').$type<string[]>().default([]),

  // Connection metadata
  connectedAt: timestamp('connected_at').notNull().defaultNow(),
  lastUsedAt: timestamp('last_used_at'),
  lastError: text('last_error'),

  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ============================================
// SCHEDULED POSTS
// ============================================

export const postStatusEnum = pgEnum('post_status', [
  'draft',
  'scheduled',
  'publishing',
  'published',
  'failed',
  'cancelled',
]);

export const scheduledPosts = pgTable('scheduled_posts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),

  // Which connection to use
  connectionId: uuid('connection_id')
    .notNull()
    .references(() => socialConnections.id, { onDelete: 'cascade' }),

  // Which agent created this
  createdByAgentId: uuid('created_by_agent_id').references(() => agents.id),

  // Post content
  platform: socialPlatformEnum('platform').notNull(),
  contentText: text('content_text').notNull(),
  hashtags: jsonb('hashtags').$type<string[]>().default([]),

  // Media attachments
  mediaAssetIds: jsonb('media_asset_ids').$type<string[]>().default([]),
  mediaUrls: jsonb('media_urls').$type<string[]>().default([]),

  // Scheduling
  scheduledFor: timestamp('scheduled_for').notNull(),
  publishedAt: timestamp('published_at'),
  status: postStatusEnum('status').notNull().default('scheduled'),

  // Platform response
  platformPostId: text('platform_post_id'), // ID returned by platform after posting
  platformPostUrl: text('platform_post_url'),

  // Error handling
  retryCount: integer('retry_count').notNull().default(0),
  lastError: text('last_error'),

  // Campaign tracking
  campaignId: uuid('campaign_id'),
  campaignName: text('campaign_name'),

  // Metadata
  metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),

  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ============================================
// POST ENGAGEMENTS (Metrics from platforms)
// ============================================

export const postEngagements = pgTable('post_engagements', {
  id: uuid('id').primaryKey().defaultRandom(),
  postId: uuid('post_id')
    .notNull()
    .references(() => scheduledPosts.id, { onDelete: 'cascade' }),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),

  // Engagement metrics
  likes: integer('likes').notNull().default(0),
  comments: integer('comments').notNull().default(0),
  shares: integer('shares').notNull().default(0),
  saves: integer('saves').notNull().default(0),
  clicks: integer('clicks').notNull().default(0),
  impressions: integer('impressions').notNull().default(0),
  reach: integer('reach').notNull().default(0),

  // Video metrics (if applicable)
  videoViews: integer('video_views').default(0),
  videoWatchTime: integer('video_watch_time').default(0), // seconds

  // Engagement rate calculated
  engagementRate: decimal('engagement_rate', { precision: 5, scale: 2 }),

  // When metrics were fetched
  fetchedAt: timestamp('fetched_at').notNull().defaultNow(),

  // Raw response from platform
  rawMetrics: jsonb('raw_metrics').$type<Record<string, unknown>>().default({}),

  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// ============================================
// MARKETING CAMPAIGNS
// ============================================

export const campaignStatusEnum = pgEnum('campaign_status', [
  'draft',
  'active',
  'paused',
  'completed',
  'cancelled',
]);

export const campaignTypeEnum = pgEnum('campaign_type', [
  'social_organic',
  'social_paid',
  'email',
  'content',
  'ads',
]);

export const marketingCampaigns = pgTable('marketing_campaigns', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),

  name: text('name').notNull(),
  description: text('description'),
  type: campaignTypeEnum('type').notNull(),
  status: campaignStatusEnum('campaign_status').notNull().default('draft'),

  // Campaign settings
  targetAudience: text('target_audience'),
  goals: jsonb('goals').$type<string[]>().default([]),
  platforms: jsonb('platforms').$type<string[]>().default([]),

  // Budget (for paid campaigns)
  budget: decimal('budget', { precision: 10, scale: 2 }),
  spentAmount: decimal('spent_amount', { precision: 10, scale: 2 }).default('0'),

  // Schedule
  startDate: timestamp('start_date'),
  endDate: timestamp('end_date'),

  // Performance summary (updated periodically)
  totalPosts: integer('total_posts').notNull().default(0),
  totalImpressions: integer('total_impressions').notNull().default(0),
  totalEngagements: integer('total_engagements').notNull().default(0),
  totalClicks: integer('total_clicks').notNull().default(0),
  totalLeads: integer('total_leads').notNull().default(0),

  // Created by
  createdByAgentId: uuid('created_by_agent_id').references(() => agents.id),

  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Type exports
export type SocialConnection = typeof socialConnections.$inferSelect;
export type NewSocialConnection = typeof socialConnections.$inferInsert;
export type ScheduledPost = typeof scheduledPosts.$inferSelect;
export type NewScheduledPost = typeof scheduledPosts.$inferInsert;
export type PostEngagement = typeof postEngagements.$inferSelect;
export type NewPostEngagement = typeof postEngagements.$inferInsert;
export type MarketingCampaign = typeof marketingCampaigns.$inferSelect;
export type NewMarketingCampaign = typeof marketingCampaigns.$inferInsert;
