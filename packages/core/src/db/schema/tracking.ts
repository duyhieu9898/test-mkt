/**
 * Tracking & Analytics Schema
 *
 * Tables for tracking visitor behavior, events, and conversions.
 */

import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  jsonb,
  pgEnum,
  decimal,
  boolean,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { companies } from './companies';
import { campaigns, banners } from './marketing';

// Event type enum
export const trackingEventTypeEnum = pgEnum('tracking_event_type', [
  'page_view',
  'page_exit',
  'click',
  'scroll',
  'form_start',
  'form_submit',
  'form_abandon',
  'button_click',
  'link_click',
  'video_play',
  'video_complete',
  'download',
  'share',
  'signup',
  'login',
  'purchase',
  'custom',
]);

// Conversion type enum
export const conversionTypeEnum = pgEnum('conversion_type', [
  'lead',
  'signup',
  'purchase',
  'download',
  'contact',
  'demo_request',
  'newsletter',
  'custom',
]);

// ============================================
// VISITOR SESSIONS
// ============================================

export const visitorSessions = pgTable(
  'visitor_sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),

    // Visitor identification
    visitorId: varchar('visitor_id', { length: 255 }).notNull(), // Anonymous or known
    sessionId: varchar('session_id', { length: 255 }).notNull(),
    leadId: uuid('lead_id'), // If identified as a lead

    // Device info
    userAgent: text('user_agent'),
    deviceType: varchar('device_type', { length: 50 }), // desktop, mobile, tablet
    browser: varchar('browser', { length: 100 }),
    browserVersion: varchar('browser_version', { length: 50 }),
    os: varchar('os', { length: 100 }),
    osVersion: varchar('os_version', { length: 50 }),
    screenResolution: varchar('screen_resolution', { length: 50 }),

    // Location
    ipAddress: varchar('ip_address', { length: 45 }),
    country: varchar('country', { length: 100 }),
    region: varchar('region', { length: 100 }),
    city: varchar('city', { length: 100 }),

    // Attribution
    utmSource: varchar('utm_source', { length: 255 }),
    utmMedium: varchar('utm_medium', { length: 255 }),
    utmCampaign: varchar('utm_campaign', { length: 255 }),
    utmContent: varchar('utm_content', { length: 255 }),
    utmTerm: varchar('utm_term', { length: 255 }),
    campaignId: uuid('campaign_id').references(() => campaigns.id, { onDelete: 'set null' }),
    creativeId: uuid('creative_id').references(() => banners.id, { onDelete: 'set null' }),
    referrer: text('referrer'),
    referrerDomain: varchar('referrer_domain', { length: 255 }),

    // Session metrics
    landingPage: text('landing_page'),
    exitPage: text('exit_page'),
    pageViews: integer('page_views').default(0),
    eventCount: integer('event_count').default(0),
    duration: integer('duration'), // seconds
    isReturning: boolean('is_returning').default(false),
    isBounce: boolean('is_bounce').default(false),

    // Timestamps
    startedAt: timestamp('started_at').defaultNow().notNull(),
    lastActivityAt: timestamp('last_activity_at').defaultNow(),
    endedAt: timestamp('ended_at'),
  },
  (table) => ({
    companyIdx: index('vs_company_idx').on(table.companyId),
    visitorIdx: index('vs_visitor_idx').on(table.visitorId),
    sessionIdx: index('vs_session_idx').on(table.sessionId),
    startedAtIdx: index('vs_started_at_idx').on(table.startedAt),
  })
);

export type VisitorSession = typeof visitorSessions.$inferSelect;
export type NewVisitorSession = typeof visitorSessions.$inferInsert;

// ============================================
// PAGE VIEWS
// ============================================

export const pageViews = pgTable(
  'page_views',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => visitorSessions.id, { onDelete: 'cascade' }),

    // Page info
    url: text('url').notNull(),
    path: varchar('path', { length: 500 }),
    title: varchar('title', { length: 500 }),
    pageType: varchar('page_type', { length: 100 }), // landing_page, blog, product, etc.
    resourceId: uuid('resource_id'), // Landing page ID, product ID, etc.

    // Timing
    loadTime: integer('load_time'), // milliseconds
    timeOnPage: integer('time_on_page'), // seconds
    scrollDepth: integer('scroll_depth'), // percentage

    // Engagement
    interactions: integer('interactions').default(0),

    // Timestamps
    viewedAt: timestamp('viewed_at').defaultNow().notNull(),
    exitedAt: timestamp('exited_at'),
  },
  (table) => ({
    companyIdx: index('pv_company_idx').on(table.companyId),
    sessionIdx: index('pv_session_idx').on(table.sessionId),
    pathIdx: index('pv_path_idx').on(table.path),
    viewedAtIdx: index('pv_viewed_at_idx').on(table.viewedAt),
  })
);

export type PageView = typeof pageViews.$inferSelect;
export type NewPageView = typeof pageViews.$inferInsert;

// ============================================
// TRACKING EVENTS
// ============================================

export const trackingEvents = pgTable(
  'tracking_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => visitorSessions.id, { onDelete: 'cascade' }),
    pageViewId: uuid('page_view_id').references(() => pageViews.id, { onDelete: 'set null' }),

    // Event info
    eventType: trackingEventTypeEnum('event_type').notNull(),
    eventName: varchar('event_name', { length: 255 }).notNull(),
    eventCategory: varchar('event_category', { length: 100 }),
    eventLabel: varchar('event_label', { length: 255 }),
    eventValue: decimal('event_value', { precision: 12, scale: 2 }),

    // Target element
    elementId: varchar('element_id', { length: 255 }),
    elementClass: varchar('element_class', { length: 500 }),
    elementText: varchar('element_text', { length: 500 }),
    elementTag: varchar('element_tag', { length: 50 }),

    // Additional data
    properties: jsonb('properties'), // Custom event properties

    // Timestamps
    occurredAt: timestamp('occurred_at').defaultNow().notNull(),
  },
  (table) => ({
    companyIdx: index('te_company_idx').on(table.companyId),
    sessionIdx: index('te_session_idx').on(table.sessionId),
    eventTypeIdx: index('te_event_type_idx').on(table.eventType),
    eventNameIdx: index('te_event_name_idx').on(table.eventName),
    occurredAtIdx: index('te_occurred_at_idx').on(table.occurredAt),
  })
);

export type TrackingEvent = typeof trackingEvents.$inferSelect;
export type NewTrackingEvent = typeof trackingEvents.$inferInsert;

// ============================================
// CONVERSIONS
// ============================================

export const conversions = pgTable(
  'conversions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    sessionId: uuid('session_id').references(() => visitorSessions.id, { onDelete: 'set null' }),
    leadId: uuid('lead_id'),

    // Conversion info
    type: conversionTypeEnum('type').notNull(),
    name: varchar('name', { length: 255 }),
    value: decimal('value', { precision: 12, scale: 2 }),
    currency: varchar('currency', { length: 3 }).default('USD'),

    // Revenue attribution
    campaignId: uuid('campaign_id').references(() => campaigns.id, { onDelete: 'set null' }),
    creativeId: uuid('creative_id').references(() => banners.id, { onDelete: 'set null' }),
    channel: varchar('channel', { length: 50 }), // facebook, google, tiktok, organic, direct
    revenue: decimal('revenue', { precision: 10, scale: 2 }).default('0'),
    cost: decimal('cost', { precision: 10, scale: 2 }).default('0'),

    // Attribution
    source: varchar('source', { length: 255 }),
    medium: varchar('medium', { length: 255 }),
    campaign: varchar('campaign', { length: 255 }),
    content: varchar('content', { length: 255 }),
    term: varchar('term', { length: 255 }),
    landingPage: text('landing_page'),
    referrer: text('referrer'),

    // Attribution model
    attributionModel: varchar('attribution_model', { length: 50 }).default('last_click'), // first_click, last_click, linear, etc.
    touchpoints: jsonb('touchpoints'), // Array of touchpoints for multi-touch attribution

    // Additional data
    properties: jsonb('properties'),

    // Timestamps
    convertedAt: timestamp('converted_at').defaultNow().notNull(),
  },
  (table) => ({
    companyIdx: index('conv_company_idx').on(table.companyId),
    typeIdx: index('conv_type_idx').on(table.type),
    convertedAtIdx: index('conv_converted_at_idx').on(table.convertedAt),
    campaignIdx: index('conv_campaign_idx').on(table.campaign),
  })
);

export type Conversion = typeof conversions.$inferSelect;
export type NewConversion = typeof conversions.$inferInsert;

// ============================================
// DAILY METRICS (Pre-aggregated)
// ============================================

export const dailyMetrics = pgTable(
  'daily_tracking_metrics',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    date: timestamp('date').notNull(),

    // Traffic
    sessions: integer('sessions').default(0),
    uniqueVisitors: integer('unique_visitors').default(0),
    pageViews: integer('page_views').default(0),
    avgSessionDuration: integer('avg_session_duration').default(0), // seconds
    bounceRate: decimal('bounce_rate', { precision: 5, scale: 2 }),

    // Engagement
    totalEvents: integer('total_events').default(0),
    avgPagesPerSession: decimal('avg_pages_per_session', { precision: 5, scale: 2 }),
    avgScrollDepth: decimal('avg_scroll_depth', { precision: 5, scale: 2 }),

    // Conversions
    totalConversions: integer('total_conversions').default(0),
    conversionRate: decimal('conversion_rate', { precision: 5, scale: 2 }),
    conversionValue: decimal('conversion_value', { precision: 12, scale: 2 }).default('0'),

    // Top sources
    topSources: jsonb('top_sources'), // { source: string, sessions: number }[]
    topPages: jsonb('top_pages'), // { path: string, views: number }[]

    // Timestamps
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    companyDateIdx: index('dm_company_date_idx').on(table.companyId, table.date),
  })
);

export type DailyMetric = typeof dailyMetrics.$inferSelect;
export type NewDailyMetric = typeof dailyMetrics.$inferInsert;

// ============================================
// RELATIONS
// ============================================

export const visitorSessionsRelations = relations(visitorSessions, ({ one, many }) => ({
  company: one(companies, {
    fields: [visitorSessions.companyId],
    references: [companies.id],
  }),
  pageViews: many(pageViews),
  events: many(trackingEvents),
}));

export const pageViewsRelations = relations(pageViews, ({ one, many }) => ({
  company: one(companies, {
    fields: [pageViews.companyId],
    references: [companies.id],
  }),
  session: one(visitorSessions, {
    fields: [pageViews.sessionId],
    references: [visitorSessions.id],
  }),
  events: many(trackingEvents),
}));

export const trackingEventsRelations = relations(trackingEvents, ({ one }) => ({
  company: one(companies, {
    fields: [trackingEvents.companyId],
    references: [companies.id],
  }),
  session: one(visitorSessions, {
    fields: [trackingEvents.sessionId],
    references: [visitorSessions.id],
  }),
  pageView: one(pageViews, {
    fields: [trackingEvents.pageViewId],
    references: [pageViews.id],
  }),
}));

export const conversionsRelations = relations(conversions, ({ one }) => ({
  company: one(companies, {
    fields: [conversions.companyId],
    references: [companies.id],
  }),
  session: one(visitorSessions, {
    fields: [conversions.sessionId],
    references: [visitorSessions.id],
  }),
}));

export const dailyMetricsRelations = relations(dailyMetrics, ({ one }) => ({
  company: one(companies, {
    fields: [dailyMetrics.companyId],
    references: [companies.id],
  }),
}));
