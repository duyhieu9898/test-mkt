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
// AD PLATFORM CONNECTIONS
// ============================================

export const adPlatformEnum = pgEnum('ad_platform', [
  'facebook',
  'instagram',
  'google',
  'linkedin',
  'tiktok',
]);

export const adConnectionStatusEnum = pgEnum('ad_connection_status', [
  'connected',
  'expired',
  'revoked',
  'error',
]);

export const adConnections = pgTable('ad_connections', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),

  platform: adPlatformEnum('platform').notNull(),
  status: adConnectionStatusEnum('status').notNull().default('connected'),

  // OAuth tokens
  accessToken: text('access_token').notNull(),
  refreshToken: text('refresh_token'),
  tokenExpiresAt: timestamp('token_expires_at'),

  // Platform-specific IDs
  platformAccountId: text('platform_account_id'), // Ad Account ID
  platformAccountName: text('platform_account_name'),
  platformBusinessId: text('platform_business_id'), // Business Manager ID

  // Connection metadata
  permissions: jsonb('permissions').$type<string[]>().default([]),
  connectedAt: timestamp('connected_at').notNull().defaultNow(),
  lastUsedAt: timestamp('last_used_at'),
  lastError: text('last_error'),

  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ============================================
// AD CAMPAIGNS
// ============================================

export const adCampaignStatusEnum = pgEnum('ad_campaign_status', [
  'draft',
  'pending_review',
  'active',
  'paused',
  'completed',
  'rejected',
  'archived',
]);

export const adCampaignObjectiveEnum = pgEnum('ad_campaign_objective', [
  'awareness',
  'traffic',
  'engagement',
  'leads',
  'app_promotion',
  'sales',
  'conversions',
]);

export const adCampaigns = pgTable('ad_campaigns', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  connectionId: uuid('connection_id')
    .notNull()
    .references(() => adConnections.id, { onDelete: 'cascade' }),

  // Campaign info
  name: text('name').notNull(),
  description: text('description'),
  platform: adPlatformEnum('platform').notNull(),
  objective: adCampaignObjectiveEnum('objective').notNull(),
  status: adCampaignStatusEnum('status').notNull().default('draft'),

  // Budget
  dailyBudget: decimal('daily_budget', { precision: 10, scale: 2 }),
  totalBudget: decimal('total_budget', { precision: 10, scale: 2 }),
  spentAmount: decimal('spent_amount', { precision: 10, scale: 2 }).default('0'),

  // Schedule
  startDate: timestamp('start_date'),
  endDate: timestamp('end_date'),

  // Targeting
  targetAudience: jsonb('target_audience').$type<{
    locations?: string[];
    ageMin?: number;
    ageMax?: number;
    genders?: string[];
    interests?: string[];
    behaviors?: string[];
    customAudiences?: string[];
    excludedAudiences?: string[];
  }>().default({}),

  // Platform IDs
  platformCampaignId: text('platform_campaign_id'), // ID from Facebook/Google

  // Performance metrics (updated periodically)
  impressions: integer('impressions').notNull().default(0),
  clicks: integer('clicks').notNull().default(0),
  conversions: integer('conversions').notNull().default(0),
  reach: integer('reach').notNull().default(0),
  ctr: decimal('ctr', { precision: 5, scale: 2 }), // Click-through rate
  cpc: decimal('cpc', { precision: 10, scale: 2 }), // Cost per click
  cpm: decimal('cpm', { precision: 10, scale: 2 }), // Cost per 1000 impressions
  cpa: decimal('cpa', { precision: 10, scale: 2 }), // Cost per acquisition
  roas: decimal('roas', { precision: 10, scale: 2 }), // Return on ad spend

  // Created by
  createdByAgentId: uuid('created_by_agent_id').references(() => agents.id),

  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ============================================
// AD SETS (Ad Groups)
// ============================================

export const adSetStatusEnum = pgEnum('ad_set_status', [
  'draft',
  'active',
  'paused',
  'completed',
  'archived',
]);

export const adSets = pgTable('ad_sets', {
  id: uuid('id').primaryKey().defaultRandom(),
  campaignId: uuid('campaign_id')
    .notNull()
    .references(() => adCampaigns.id, { onDelete: 'cascade' }),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),

  name: text('name').notNull(),
  status: adSetStatusEnum('status').notNull().default('draft'),

  // Budget (optional - can inherit from campaign)
  dailyBudget: decimal('daily_budget', { precision: 10, scale: 2 }),
  bidAmount: decimal('bid_amount', { precision: 10, scale: 2 }),
  bidStrategy: text('bid_strategy').default('lowest_cost'),

  // Targeting (overrides campaign targeting if set)
  targetAudience: jsonb('target_audience').$type<Record<string, unknown>>(),

  // Placements
  placements: jsonb('placements').$type<string[]>().default([]),
  // e.g., ['facebook_feed', 'instagram_feed', 'instagram_stories']

  // Platform ID
  platformAdSetId: text('platform_ad_set_id'),

  // Metrics
  impressions: integer('impressions').notNull().default(0),
  clicks: integer('clicks').notNull().default(0),
  conversions: integer('conversions').notNull().default(0),
  spentAmount: decimal('spent_amount', { precision: 10, scale: 2 }).default('0'),

  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ============================================
// ADS (Individual Ads/Creatives)
// ============================================

export const adStatusEnum = pgEnum('ad_status', [
  'draft',
  'pending_review',
  'active',
  'paused',
  'rejected',
  'archived',
]);

export const adTypeEnum = pgEnum('ad_type', [
  'image',
  'video',
  'carousel',
  'collection',
  'stories',
  'text',
]);

export const ads = pgTable('ads', {
  id: uuid('id').primaryKey().defaultRandom(),
  adSetId: uuid('ad_set_id')
    .notNull()
    .references(() => adSets.id, { onDelete: 'cascade' }),
  campaignId: uuid('campaign_id')
    .notNull()
    .references(() => adCampaigns.id, { onDelete: 'cascade' }),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),

  name: text('name').notNull(),
  type: adTypeEnum('type').notNull().default('image'),
  status: adStatusEnum('status').notNull().default('draft'),

  // Creative content
  headline: text('headline'),
  primaryText: text('primary_text'), // Main ad copy
  description: text('description'),
  callToAction: text('call_to_action').default('Learn More'),
  destinationUrl: text('destination_url'),

  // Media
  imageUrl: text('image_url'),
  videoUrl: text('video_url'),
  thumbnailUrl: text('thumbnail_url'),
  assetId: uuid('asset_id'), // Link to generated asset

  // Carousel items (if type is carousel)
  carouselItems: jsonb('carousel_items').$type<Array<{
    headline?: string;
    description?: string;
    imageUrl?: string;
    destinationUrl?: string;
  }>>(),

  // Platform ID
  platformAdId: text('platform_ad_id'),
  platformCreativeId: text('platform_creative_id'),

  // Review status
  reviewStatus: text('review_status'), // pending, approved, rejected
  rejectionReason: text('rejection_reason'),

  // Metrics
  impressions: integer('impressions').notNull().default(0),
  clicks: integer('clicks').notNull().default(0),
  conversions: integer('conversions').notNull().default(0),
  spentAmount: decimal('spent_amount', { precision: 10, scale: 2 }).default('0'),
  ctr: decimal('ctr', { precision: 5, scale: 2 }),

  // Created by
  createdByAgentId: uuid('created_by_agent_id').references(() => agents.id),

  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ============================================
// AD PERFORMANCE HISTORY
// ============================================

export const adPerformance = pgTable('ad_performance', {
  id: uuid('id').primaryKey().defaultRandom(),
  adId: uuid('ad_id')
    .notNull()
    .references(() => ads.id, { onDelete: 'cascade' }),
  campaignId: uuid('campaign_id')
    .notNull()
    .references(() => adCampaigns.id, { onDelete: 'cascade' }),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),

  // Time period
  date: timestamp('date').notNull(),
  hour: integer('hour'), // 0-23 for hourly breakdown

  // Metrics
  impressions: integer('impressions').notNull().default(0),
  reach: integer('reach').notNull().default(0),
  clicks: integer('clicks').notNull().default(0),
  conversions: integer('conversions').notNull().default(0),
  spend: decimal('spend', { precision: 10, scale: 2 }).notNull().default('0'),

  // Calculated metrics
  ctr: decimal('ctr', { precision: 5, scale: 4 }),
  cpc: decimal('cpc', { precision: 10, scale: 4 }),
  cpm: decimal('cpm', { precision: 10, scale: 4 }),
  conversionRate: decimal('conversion_rate', { precision: 5, scale: 4 }),

  // Breakdown by demographics (optional)
  ageRange: text('age_range'),
  gender: text('gender'),
  location: text('location'),
  device: text('device'),
  placement: text('placement'),

  // Raw data from platform
  rawMetrics: jsonb('raw_metrics').$type<Record<string, unknown>>(),

  fetchedAt: timestamp('fetched_at').notNull().defaultNow(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Type exports
export type AdConnection = typeof adConnections.$inferSelect;
export type NewAdConnection = typeof adConnections.$inferInsert;
export type AdCampaign = typeof adCampaigns.$inferSelect;
export type NewAdCampaign = typeof adCampaigns.$inferInsert;
export type AdSet = typeof adSets.$inferSelect;
export type NewAdSet = typeof adSets.$inferInsert;
export type Ad = typeof ads.$inferSelect;
export type NewAd = typeof ads.$inferInsert;
export type AdPerformance = typeof adPerformance.$inferSelect;
export type NewAdPerformance = typeof adPerformance.$inferInsert;
