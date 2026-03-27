/**
 * Landing Pages Database Schema
 *
 * Tables for AI-generated landing pages:
 * - landing_pages: Main page data
 * - landing_page_sections: Page sections (hero, features, etc.)
 * - landing_page_assets: Images, banners
 * - landing_page_versions: A/B testing versions
 * - landing_page_leads: Captured leads
 * - landing_page_analytics: Page metrics
 */

import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  jsonb,
  integer,
  decimal,
  pgEnum,
  index,
  boolean,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { companies } from './companies';

// =============================================================================
// ENUMS
// =============================================================================

export const landingPageStatusEnum = pgEnum('landing_page_status', [
  'draft',
  'generating',
  'ready',
  'published',
  'archived',
]);

export const landingPageStyleEnum = pgEnum('landing_page_style', [
  'minimal',
  'modern',
  'bold',
  'professional',
  'playful',
  'elegant',
]);

export const sectionTypeEnum = pgEnum('section_type', [
  'hero',
  'problem',
  'solution',
  'features',
  'pricing',
  'testimonials',
  'faq',
  'cta',
  'footer',
  'custom',
]);

export const assetTypeEnum = pgEnum('asset_type', [
  'hero_image',
  'feature_icon',
  'banner',
  'logo',
  'background',
  'social_preview',
  'favicon',
  // Generic asset types for generated assets
  'image',
  'video',
  'audio',
  'document',
]);

export const leadStatusEnum = pgEnum('lead_status', [
  'new',
  'contacted',
  'qualified',
  'converted',
  'lost',
]);

// =============================================================================
// TYPES
// =============================================================================

export interface PageContent {
  headline: string;
  subheadline: string;
  ctaText: string;
  ctaUrl?: string;
}

export interface HeroSection {
  headline: string;
  subheadline: string;
  ctaText: string;
  ctaSecondaryText?: string;
  backgroundImage?: string;
  alignment: 'left' | 'center' | 'right';
}

export interface FeatureItem {
  title: string;
  description: string;
  icon?: string;
  image?: string;
}

export interface PricingTier {
  name: string;
  price: number;
  period: 'month' | 'year' | 'one-time';
  description: string;
  features: string[];
  ctaText: string;
  highlighted?: boolean;
}

export interface Testimonial {
  name: string;
  role: string;
  company?: string;
  quote: string;
  avatar?: string;
  rating?: number;
}

export interface FAQItem {
  question: string;
  answer: string;
}

export interface SEOData {
  title: string;
  description: string;
  keywords: string[];
  ogImage?: string;
  canonical?: string;
}

export interface AnalyticsConfig {
  googleAnalyticsId?: string;
  facebookPixelId?: string;
  posthogKey?: string;
  customScripts?: string[];
}

// =============================================================================
// LANDING PAGES TABLE
// =============================================================================

export const landingPages = pgTable(
  'landing_pages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .references(() => companies.id, { onDelete: 'cascade' })
      .notNull(),

    // Basic info
    name: varchar('name', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 100 }).notNull(),
    description: text('description'),

    // Generation prompt
    originalPrompt: text('original_prompt'),

    // Business context (extracted from prompt)
    businessContext: jsonb('business_context').$type<{
      businessName: string;
      industry: string;
      targetAudience: string;
      valueProposition: string;
      competitors?: string[];
      tone?: string;
    }>(),

    // Design
    style: landingPageStyleEnum('style').default('modern'),
    primaryColor: varchar('primary_color', { length: 7 }).default('#3b82f6'),
    secondaryColor: varchar('secondary_color', { length: 7 }),
    fontFamily: varchar('font_family', { length: 100 }).default('Inter'),

    // Content
    content: jsonb('content').$type<PageContent>(),
    seo: jsonb('seo').$type<SEOData>(),

    // Deployment
    status: landingPageStatusEnum('status').default('draft'),
    publishedUrl: varchar('published_url', { length: 500 }),
    customDomain: varchar('custom_domain', { length: 255 }),
    deploymentProvider: varchar('deployment_provider', { length: 50 }), // vercel, netlify, etc.
    deploymentId: varchar('deployment_id', { length: 100 }),

    // Analytics
    analyticsConfig: jsonb('analytics_config').$type<AnalyticsConfig>(),

    // A/B Testing
    isVariant: integer('is_variant').default(0),
    parentPageId: uuid('parent_page_id'),
    variantName: varchar('variant_name', { length: 100 }),
    trafficAllocation: integer('traffic_allocation').default(100), // percentage

    // Metrics (denormalized for quick access)
    totalVisitors: integer('total_visitors').default(0),
    totalLeads: integer('total_leads').default(0),
    conversionRate: decimal('conversion_rate', { precision: 5, scale: 2 }).default('0'),

    // Timestamps
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    publishedAt: timestamp('published_at'),
    archivedAt: timestamp('archived_at'),
  },
  (table) => ({
    companyIdx: index('landing_pages_company_idx').on(table.companyId),
    statusIdx: index('landing_pages_status_idx').on(table.status),
    slugIdx: index('landing_pages_slug_idx').on(table.slug),
    publishedUrlIdx: index('landing_pages_url_idx').on(table.publishedUrl),
  })
);

// =============================================================================
// LANDING PAGE SECTIONS TABLE
// =============================================================================

export const landingPageSections = pgTable(
  'landing_page_sections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    pageId: uuid('page_id')
      .references(() => landingPages.id, { onDelete: 'cascade' })
      .notNull(),

    // Section info
    type: sectionTypeEnum('type').notNull(),
    name: varchar('name', { length: 100 }),
    order: integer('order').notNull().default(0),
    isVisible: integer('is_visible').default(1),

    // Content (varies by section type)
    content: jsonb('content').$type<
      | HeroSection
      | { features: FeatureItem[] }
      | { tiers: PricingTier[] }
      | { testimonials: Testimonial[] }
      | { faqs: FAQItem[] }
      | { title: string; description: string; ctaText: string }
      | Record<string, unknown>
    >(),

    // Styling overrides
    backgroundColor: varchar('background_color', { length: 7 }),
    customStyles: jsonb('custom_styles').$type<Record<string, string>>(),

    // Timestamps
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    pageIdx: index('sections_page_idx').on(table.pageId),
    orderIdx: index('sections_order_idx').on(table.pageId, table.order),
  })
);

// =============================================================================
// LANDING PAGE ASSETS TABLE
// =============================================================================

export const landingPageAssets = pgTable(
  'landing_page_assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    pageId: uuid('page_id')
      .references(() => landingPages.id, { onDelete: 'cascade' })
      .notNull(),
    sectionId: uuid('section_id').references(() => landingPageSections.id, {
      onDelete: 'set null',
    }),

    // Asset info
    type: assetTypeEnum('type').notNull(),
    name: varchar('name', { length: 255 }).notNull(),

    // Storage
    url: varchar('url', { length: 1000 }).notNull(),
    storageProvider: varchar('storage_provider', { length: 50 }), // s3, cloudflare, etc.
    storageKey: varchar('storage_key', { length: 500 }),

    // Metadata
    mimeType: varchar('mime_type', { length: 100 }),
    fileSize: integer('file_size'), // bytes
    width: integer('width'),
    height: integer('height'),
    altText: varchar('alt_text', { length: 255 }),

    // Generation info
    generationPrompt: text('generation_prompt'),
    generationModel: varchar('generation_model', { length: 100 }),
    isAiGenerated: integer('is_ai_generated').default(0),

    // Timestamps
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    pageIdx: index('assets_page_idx').on(table.pageId),
    typeIdx: index('assets_type_idx').on(table.type),
  })
);

// =============================================================================
// LANDING PAGE LEADS TABLE
// =============================================================================

export const landingPageLeads = pgTable(
  'landing_page_leads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    pageId: uuid('page_id')
      .references(() => landingPages.id, { onDelete: 'cascade' })
      .notNull(),
    companyId: uuid('company_id')
      .references(() => companies.id, { onDelete: 'cascade' })
      .notNull(),

    // Contact info
    email: varchar('email', { length: 255 }).notNull(),
    name: varchar('name', { length: 255 }),
    phone: varchar('phone', { length: 50 }),
    company: varchar('company', { length: 255 }),

    // Additional data
    message: text('message'),
    customFields: jsonb('custom_fields').$type<Record<string, unknown>>(),

    // Source tracking
    source: varchar('source', { length: 100 }), // utm_source
    medium: varchar('medium', { length: 100 }), // utm_medium
    campaign: varchar('campaign', { length: 100 }), // utm_campaign
    referrer: varchar('referrer', { length: 500 }),

    // Device info
    userAgent: text('user_agent'),
    ipAddress: varchar('ip_address', { length: 45 }),
    country: varchar('country', { length: 2 }),
    city: varchar('city', { length: 100 }),

    // Status
    status: leadStatusEnum('status').default('new'),
    notes: text('notes'),

    // Timestamps
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    contactedAt: timestamp('contacted_at'),
    convertedAt: timestamp('converted_at'),
  },
  (table) => ({
    pageIdx: index('leads_page_idx').on(table.pageId),
    companyIdx: index('leads_company_idx').on(table.companyId),
    emailIdx: index('leads_email_idx').on(table.email),
    statusIdx: index('leads_status_idx').on(table.status),
    createdIdx: index('leads_created_idx').on(table.createdAt),
  })
);

// =============================================================================
// LANDING PAGE ANALYTICS TABLE
// =============================================================================

export const landingPageAnalytics = pgTable(
  'landing_page_analytics',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    pageId: uuid('page_id')
      .references(() => landingPages.id, { onDelete: 'cascade' })
      .notNull(),

    // Time period
    date: timestamp('date').notNull(),
    hour: integer('hour'), // 0-23, null for daily aggregates

    // Traffic metrics
    pageViews: integer('page_views').default(0),
    uniqueVisitors: integer('unique_visitors').default(0),
    bounceRate: decimal('bounce_rate', { precision: 5, scale: 2 }),
    avgTimeOnPage: integer('avg_time_on_page'), // seconds

    // Conversion metrics
    formViews: integer('form_views').default(0),
    formSubmissions: integer('form_submissions').default(0),
    conversionRate: decimal('conversion_rate', { precision: 5, scale: 2 }),

    // Traffic sources
    sourceBreakdown: jsonb('source_breakdown').$type<
      Record<string, { visitors: number; conversions: number }>
    >(),

    // Device breakdown
    deviceBreakdown: jsonb('device_breakdown').$type<{
      desktop: number;
      mobile: number;
      tablet: number;
    }>(),

    // Geographic data
    countryBreakdown: jsonb('country_breakdown').$type<Record<string, number>>(),

    // Timestamps
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    pageIdx: index('analytics_page_idx').on(table.pageId),
    dateIdx: index('analytics_date_idx').on(table.date),
    pageDateIdx: index('analytics_page_date_idx').on(table.pageId, table.date),
  })
);

// =============================================================================
// LANDING PAGE DEPLOYMENTS TABLE
// =============================================================================

export const deploymentStatusEnum = pgEnum('deployment_status', [
  'pending',
  'building',
  'deploying',
  'live',
  'failed',
  'rolled_back',
]);

export const deploymentProviderEnum = pgEnum('deployment_provider', [
  'vercel',
  'cloudflare',
  'netlify',
  'custom',
]);

export const landingPageDeployments = pgTable(
  'landing_page_deployments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    pageId: uuid('page_id')
      .references(() => landingPages.id, { onDelete: 'cascade' })
      .notNull(),
    versionId: uuid('version_id').references(() => landingPageVersions.id, {
      onDelete: 'set null',
    }),

    // Deployment info
    provider: deploymentProviderEnum('provider').notNull(),
    subdomain: varchar('subdomain', { length: 100 }),
    customDomain: varchar('custom_domain', { length: 255 }),
    url: varchar('url', { length: 500 }),

    // Status
    status: deploymentStatusEnum('status').default('pending'),
    buildLogs: text('build_logs'),
    errorMessage: text('error_message'),

    // SSL
    sslStatus: varchar('ssl_status', { length: 50 }), // pending, active, failed
    sslExpiresAt: timestamp('ssl_expires_at'),

    // External IDs
    externalDeploymentId: varchar('external_deployment_id', { length: 100 }),
    externalProjectId: varchar('external_project_id', { length: 100 }),

    // Timestamps
    deployedAt: timestamp('deployed_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    pageIdx: index('deployments_page_idx').on(table.pageId),
    statusIdx: index('deployments_status_idx').on(table.status),
    subdomainIdx: index('deployments_subdomain_idx').on(table.subdomain),
  })
);

// =============================================================================
// LANDING PAGE VERSIONS TABLE
// =============================================================================

export const landingPageVersions = pgTable(
  'landing_page_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    pageId: uuid('page_id')
      .references(() => landingPages.id, { onDelete: 'cascade' })
      .notNull(),

    // Version info
    version: integer('version').notNull(),
    name: varchar('name', { length: 100 }),
    description: text('description'),

    // Snapshot of all content at this version
    sectionsSnapshot: jsonb('sections_snapshot').$type<
      Array<{
        type: string;
        order: number;
        content: Record<string, unknown>;
        backgroundColor?: string;
      }>
    >(),
    pageSettingsSnapshot: jsonb('page_settings_snapshot').$type<{
      primaryColor?: string;
      secondaryColor?: string;
      fontFamily?: string;
      style?: string;
      seo?: Record<string, unknown>;
    }>(),

    // Publishing info
    publishedAt: timestamp('published_at'),
    publishedBy: uuid('published_by'),

    // Timestamps
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    pageIdx: index('versions_page_idx').on(table.pageId),
    versionIdx: index('versions_version_idx').on(table.pageId, table.version),
  })
);

// =============================================================================
// RELATIONS
// =============================================================================

export const landingPagesRelations = relations(landingPages, ({ one, many }) => ({
  company: one(companies, {
    fields: [landingPages.companyId],
    references: [companies.id],
  }),
  parentPage: one(landingPages, {
    fields: [landingPages.parentPageId],
    references: [landingPages.id],
  }),
  sections: many(landingPageSections),
  assets: many(landingPageAssets),
  leads: many(landingPageLeads),
  analytics: many(landingPageAnalytics),
  deployments: many(landingPageDeployments),
  versions: many(landingPageVersions),
}));

export const landingPageSectionsRelations = relations(
  landingPageSections,
  ({ one, many }) => ({
    page: one(landingPages, {
      fields: [landingPageSections.pageId],
      references: [landingPages.id],
    }),
    assets: many(landingPageAssets),
  })
);

export const landingPageAssetsRelations = relations(landingPageAssets, ({ one }) => ({
  page: one(landingPages, {
    fields: [landingPageAssets.pageId],
    references: [landingPages.id],
  }),
  section: one(landingPageSections, {
    fields: [landingPageAssets.sectionId],
    references: [landingPageSections.id],
  }),
}));

export const landingPageLeadsRelations = relations(landingPageLeads, ({ one }) => ({
  page: one(landingPages, {
    fields: [landingPageLeads.pageId],
    references: [landingPages.id],
  }),
  company: one(companies, {
    fields: [landingPageLeads.companyId],
    references: [companies.id],
  }),
}));

export const landingPageAnalyticsRelations = relations(
  landingPageAnalytics,
  ({ one }) => ({
    page: one(landingPages, {
      fields: [landingPageAnalytics.pageId],
      references: [landingPages.id],
    }),
  })
);

export const landingPageDeploymentsRelations = relations(
  landingPageDeployments,
  ({ one }) => ({
    page: one(landingPages, {
      fields: [landingPageDeployments.pageId],
      references: [landingPages.id],
    }),
    version: one(landingPageVersions, {
      fields: [landingPageDeployments.versionId],
      references: [landingPageVersions.id],
    }),
  })
);

export const landingPageVersionsRelations = relations(
  landingPageVersions,
  ({ one, many }) => ({
    page: one(landingPages, {
      fields: [landingPageVersions.pageId],
      references: [landingPages.id],
    }),
    deployments: many(landingPageDeployments),
  })
);
