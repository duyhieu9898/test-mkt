/**
 * Marketing Execution Schema
 *
 * Campaigns → Banners → Social Posts
 * Each has proper state machine: draft → active → paused → completed
 */

import {
  pgTable, uuid, varchar, text, timestamp, integer, jsonb, pgEnum, index, decimal, boolean,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { companies } from './companies';

// === ENUMS ===

export const mktCampaignStatusEnum = pgEnum('campaign_status', [
  'planned', 'generating', 'ready', 'launching', 'live', 'optimizing',
  'draft', 'active', 'paused', 'completed', 'failed',
]);

export const mktCampaignGoalEnum = pgEnum('campaign_goal', [
  'traffic', 'leads', 'conversions', 'awareness', 'sales',
]);

export const mktPlatformEnum = pgEnum('campaign_platform', [
  'google', 'meta', 'linkedin', 'manual',
]);

export const bannerStatusEnum = pgEnum('banner_status', [
  'generating', 'draft', 'approved', 'rejected', 'active', 'archived',
]);

export const socialPostStatusEnum = pgEnum('social_post_status', [
  'generating', 'draft', 'scheduled', 'published', 'failed',
]);

// === CAMPAIGNS ===

export const campaigns = pgTable(
  'campaigns',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    goal: mktCampaignGoalEnum('goal').default('traffic').notNull(),
    platform: mktPlatformEnum('platform').default('manual').notNull(),
    status: mktCampaignStatusEnum('status').default('draft').notNull(),
    budgetDaily: decimal('budget_daily', { precision: 10, scale: 2 }),
    currency: varchar('currency', { length: 3 }).default('USD'),
    targeting: jsonb('targeting').$type<{
      geo?: string[];
      ageRange?: string;
      interests?: string[];
      keywords?: string[];
      blogPostId?: string;
      launchSummary?: {
        launchedAt: string;
        options?: {
          bannerIds?: string[];
          activateBanners?: boolean;
          scheduleSocialPosts?: boolean;
        };
        results?: {
          blog?: {
            status: string;
            blogPostId?: string;
            title?: string;
            message?: string;
          };
          banners?: {
            status: string;
            requested?: number;
            activated?: number;
          };
          socialPosts?: {
            status: string;
            requested?: number;
            scheduled?: number;
          };
          externalPublishing?: {
            status: string;
            message?: string;
          };
        };
      };
    }>(),
    landingPageUrl: text('landing_page_url'),
    revenue: decimal('revenue', { precision: 10, scale: 2 }).default('0'),
    cost: decimal('cost', { precision: 10, scale: 2 }).default('0'),
    metrics: jsonb('metrics').$type<{
      impressions?: number;
      clicks?: number;
      ctr?: number;
      spend?: number;
      conversions?: number;
    }>().default({}),
    startDate: timestamp('start_date'),
    endDate: timestamp('end_date'),
    launchError: text('launch_error'),
    aiMode: boolean('ai_mode').default(false).notNull(),
    aiDecisions: jsonb('ai_decisions').$type<Array<{
      type: string;
      reason: string;
      action: string;
      timestamp: string;
      applied: boolean;
    }>>().default([]),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    companyIdx: index('campaigns_company_idx').on(table.companyId),
    statusIdx: index('campaigns_status_idx').on(table.status),
  })
);

// === BANNERS ===

export const banners = pgTable(
  'banners',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }).notNull(),
    campaignId: uuid('campaign_id').references(() => campaigns.id, { onDelete: 'set null' }),
    name: varchar('name', { length: 255 }).notNull(),
    size: varchar('size', { length: 20 }).notNull(), // e.g. "1200x628"
    status: bannerStatusEnum('status').default('draft').notNull(),
    // Rich creative data — banner = JSON, rendered by frontend
    copy: jsonb('copy').$type<{
      headline: string;
      subheadline?: string;
      cta: string;
      reasoning?: string;
      brandColor?: string;
    }>(),
    // Creative concept
    concept: varchar('concept', { length: 255 }),
    angle: varchar('angle', { length: 50 }), // aspiration, pain, social-proof, urgency, benefit
    // Visual design (JSON-driven, NOT static image)
    design: jsonb('design').$type<{
      layout: 'left-text' | 'center' | 'split' | 'bold-cta' | 'testimonial';
      backgroundType: 'gradient' | 'image' | 'solid';
      backgroundValue: string; // gradient CSS, image URL, or hex color
      backgroundPrompt?: string; // AI prompt used to generate background (for regeneration)
      colorTheme: {
        primary: string;
        secondary: string;
        text: string;
        ctaBg: string;
        ctaText: string;
      };
      typography: {
        headlineSize: 'sm' | 'md' | 'lg' | 'xl';
        headlineWeight: number;
        alignment: 'left' | 'center' | 'right';
      };
      overlayOpacity?: number; // 0-1 for image backgrounds
    }>(),
    imageUrl: text('image_url'), // optional AI-generated background
    strategyTag: varchar('strategy_tag', { length: 50 }),
    metrics: jsonb('metrics').$type<{
      impressions?: number;
      clicks?: number;
      ctr?: number;
    }>().default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    companyIdx: index('banners_company_idx').on(table.companyId),
    campaignIdx: index('banners_campaign_idx').on(table.campaignId),
  })
);

// === SOCIAL POSTS ===

export const socialPosts = pgTable(
  'social_posts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }).notNull(),
    campaignId: uuid('campaign_id').references(() => campaigns.id, { onDelete: 'set null' }),
    platform: varchar('platform', { length: 20 }).notNull(), // facebook, instagram, linkedin
    status: socialPostStatusEnum('status').default('draft').notNull(),
    content: text('content').notNull(),
    hashtags: jsonb('hashtags').$type<string[]>().default([]),
    mediaUrls: jsonb('media_urls').$type<string[]>().default([]),
    scheduledAt: timestamp('scheduled_at'),
    publishedAt: timestamp('published_at'),
    metrics: jsonb('metrics').$type<{
      impressions?: number;
      clicks?: number;
      engagement?: number;
    }>().default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    companyIdx: index('social_posts_company_idx').on(table.companyId),
    campaignIdx: index('social_posts_campaign_idx').on(table.campaignId),
  })
);

// === RELATIONS ===

export const campaignsRelations = relations(campaigns, ({ one, many }) => ({
  company: one(companies, { fields: [campaigns.companyId], references: [companies.id] }),
  banners: many(banners),
  socialPosts: many(socialPosts),
}));

export const bannersRelations = relations(banners, ({ one }) => ({
  company: one(companies, { fields: [banners.companyId], references: [companies.id] }),
  campaign: one(campaigns, { fields: [banners.campaignId], references: [campaigns.id] }),
}));

export const socialPostsRelations = relations(socialPosts, ({ one }) => ({
  company: one(companies, { fields: [socialPosts.companyId], references: [companies.id] }),
  campaign: one(campaigns, { fields: [socialPosts.campaignId], references: [campaigns.id] }),
}));

// === VIDEO PROJECTS ===

export const videoStatusEnum = pgEnum('video_status', [
  'script', 'scenes', 'rendering', 'ready', 'failed',
]);

export const videoFormatEnum = pgEnum('video_format', [
  '15s', '30s', '60s',
]);

export const videoAspectEnum = pgEnum('video_aspect', [
  '9:16', '16:9', '1:1',
]);

export const videoProjects = pgTable(
  'video_projects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }).notNull(),
    campaignId: uuid('campaign_id').references(() => campaigns.id, { onDelete: 'set null' }),
    title: varchar('title', { length: 255 }).notNull(),
    format: videoFormatEnum('format').notNull(),
    aspectRatio: videoAspectEnum('aspect_ratio').notNull(),
    status: videoStatusEnum('status').default('script').notNull(),
    script: jsonb('script').$type<{
      hook: string;
      body: string[];
      cta: string;
      voiceoverText?: string;
    }>(),
    scenes: jsonb('scenes').$type<Array<{
      order: number;
      duration: number;
      text: string;
      imageUrl?: string;
      animation: 'fade' | 'slide-left' | 'zoom' | 'none';
      backgroundColor?: string;
    }>>().default([]),
    outputUrl: text('output_url'),
    thumbnailUrl: text('thumbnail_url'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    companyIdx: index('video_projects_company_idx').on(table.companyId),
    campaignIdx: index('video_projects_campaign_idx').on(table.campaignId),
  })
);

export const videoProjectsRelations = relations(videoProjects, ({ one }) => ({
  company: one(companies, { fields: [videoProjects.companyId], references: [companies.id] }),
  campaign: one(campaigns, { fields: [videoProjects.campaignId], references: [campaigns.id] }),
}));

// === BLOG POSTS ===

export const blogPosts = pgTable(
  'blog_posts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }).notNull(),
    title: varchar('title', { length: 500 }).notNull(),
    slug: varchar('slug', { length: 500 }).notNull(),
    metaDescription: text('meta_description'),
    content: text('content').notNull(),
    excerpt: text('excerpt'),
    keyword: text('keyword'),
    searchIntent: varchar('search_intent', { length: 50 }),
    tags: jsonb('tags').default([]),
    faq: jsonb('faq').default([]),
    schemaMarkup: jsonb('schema_markup'),
    wordCount: integer('word_count'),
    language: varchar('language', { length: 10 }).default('en'),
    status: varchar('status', { length: 20 }).default('draft'), // draft, published, pushed_to_cms
    cmsPostId: integer('cms_post_id'), // WordPress post ID after push
    cmsPostUrl: text('cms_post_url'),
    seoJobId: varchar('seo_job_id', { length: 64 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    companyIdx: index('blog_posts_company_idx').on(table.companyId),
    keywordIdx: index('blog_posts_keyword_idx').on(table.keyword),
    statusIdx: index('blog_posts_status_idx').on(table.status),
  })
);

export const blogPostsRelations = relations(blogPosts, ({ one }) => ({
  company: one(companies, { fields: [blogPosts.companyId], references: [companies.id] }),
}));

// === PRODUCT CATALOG ===

export const productCatalog = pgTable(
  'product_catalog',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    url: text('url'),
    category: varchar('category', { length: 100 }),
    keywords: jsonb('keywords').default([]),
    seoStatus: varchar('seo_status', { length: 20 }).default('pending'), // pending, crawled, planned, generated, published
    generatedPages: jsonb('generated_pages').default([]),
    generatedBlogs: jsonb('generated_blogs').default([]),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    companyIdx: index('product_catalog_company_idx').on(table.companyId),
    seoStatusIdx: index('product_catalog_seo_status_idx').on(table.seoStatus),
  })
);

export const productCatalogRelations = relations(productCatalog, ({ one }) => ({
  company: one(companies, { fields: [productCatalog.companyId], references: [companies.id] }),
}));
