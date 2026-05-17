/**
 * Tracking & Analytics Engine
 *
 * Comprehensive visitor tracking and analytics:
 * - Session management
 * - Page view tracking
 * - Event tracking
 * - Conversion tracking
 * - Attribution analysis
 * - Real-time and aggregated analytics
 */

import { db } from '../lib/db';
import { eq, and, desc, sql, gte, lte, count } from 'drizzle-orm';
import {
  visitorSessions,
  pageViews,
  trackingEvents,
  conversions,
  dailyMetrics,
  landingPages,
  type VisitorSession,
  type PageView,
  type TrackingEvent,
  type Conversion,
} from '@1person/core/db';
// import * as UAParser from 'ua-parser-js';
import { UAParser } from 'ua-parser-js';

// Session timeout in minutes
const SESSION_TIMEOUT = 30;

interface TrackSessionInput {
  companyId: string;
  visitorId: string;
  sessionId: string;
  leadId?: string;
  userAgent?: string;
  ipAddress?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  referrer?: string;
  landingPage?: string;
}

interface TrackPageViewInput {
  companyId: string;
  sessionId: string;
  url: string;
  path?: string;
  title?: string;
  pageType?: string;
  resourceId?: string;
  loadTime?: number;
}

interface TrackEventInput {
  companyId: string;
  sessionId: string;
  pageViewId?: string;
  eventType:
    | 'page_view'
    | 'page_exit'
    | 'click'
    | 'scroll'
    | 'form_start'
    | 'form_submit'
    | 'form_abandon'
    | 'button_click'
    | 'link_click'
    | 'video_play'
    | 'video_complete'
    | 'download'
    | 'share'
    | 'signup'
    | 'login'
    | 'purchase'
    | 'custom';
  eventName: string;
  eventCategory?: string;
  eventLabel?: string;
  eventValue?: number;
  elementId?: string;
  elementClass?: string;
  elementText?: string;
  elementTag?: string;
  properties?: Record<string, unknown>;
}

interface TrackConversionInput {
  companyId: string;
  sessionId?: string;
  leadId?: string;
  type:
    | 'lead'
    | 'signup'
    | 'purchase'
    | 'download'
    | 'contact'
    | 'demo_request'
    | 'newsletter'
    | 'custom';
  name?: string;
  value?: number;
  currency?: string;
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
  term?: string;
  landingPage?: string;
  referrer?: string;
  properties?: Record<string, unknown>;
}

/**
 * Tracking Engine Class
 */
export class TrackingEngine {
  // ============================================
  // SESSION TRACKING
  // ============================================

  /**
   * Start or continue a session
   */
  async trackSession(input: TrackSessionInput): Promise<string> {
    // Parse user agent
    const parser = new UAParser(input.userAgent || '');
    const result = parser.getResult();

    // Check for existing active session
    const existingSession = await db.query.visitorSessions.findFirst({
      where: and(
        eq(visitorSessions.companyId, input.companyId),
        eq(visitorSessions.sessionId, input.sessionId)
      ),
    });

    if (existingSession) {
      // Update last activity
      await db
        .update(visitorSessions)
        .set({
          lastActivityAt: new Date(),
        })
        .where(eq(visitorSessions.id, existingSession.id));

      return existingSession.id;
    }

    // Check if returning visitor
    const previousSession = await db.query.visitorSessions.findFirst({
      where: and(
        eq(visitorSessions.companyId, input.companyId),
        eq(visitorSessions.visitorId, input.visitorId)
      ),
      orderBy: desc(visitorSessions.startedAt),
    });

    // Extract referrer domain
    let referrerDomain: string | undefined;
    if (input.referrer) {
      try {
        referrerDomain = new URL(input.referrer).hostname;
      } catch {
        referrerDomain = undefined;
      }
    }

    // Create new session
    const [session] = await db
      .insert(visitorSessions)
      .values({
        companyId: input.companyId,
        visitorId: input.visitorId,
        sessionId: input.sessionId,
        leadId: input.leadId,
        userAgent: input.userAgent,
        deviceType: result.device.type || 'desktop',
        browser: result.browser.name,
        browserVersion: result.browser.version,
        os: result.os.name,
        osVersion: result.os.version,
        ipAddress: input.ipAddress,
        utmSource: input.utmSource,
        utmMedium: input.utmMedium,
        utmCampaign: input.utmCampaign,
        utmContent: input.utmContent,
        utmTerm: input.utmTerm,
        referrer: input.referrer,
        referrerDomain,
        landingPage: input.landingPage,
        isReturning: !!previousSession,
        pageViews: 0,
        eventCount: 0,
      })
      .returning();

    if (!session) {
      throw new Error('Failed to create session');
    }

    console.log(`[Tracking] Created session ${session.id} for visitor ${input.visitorId}`);

    return session.id;
  }

  /**
   * End a session
   */
  async endSession(sessionInternalId: string): Promise<void> {
    const session = await db.query.visitorSessions.findFirst({
      where: eq(visitorSessions.id, sessionInternalId),
    });

    if (!session) return;

    // Calculate duration
    const duration = session.startedAt
      ? Math.floor((Date.now() - new Date(session.startedAt).getTime()) / 1000)
      : 0;

    // Get last page view for exit page
    const lastPageView = await db.query.pageViews.findFirst({
      where: eq(pageViews.sessionId, sessionInternalId),
      orderBy: desc(pageViews.viewedAt),
    });

    // Determine if bounce
    const isBounce = (session.pageViews || 0) <= 1;

    await db
      .update(visitorSessions)
      .set({
        endedAt: new Date(),
        duration,
        exitPage: lastPageView?.url,
        isBounce,
      })
      .where(eq(visitorSessions.id, sessionInternalId));

    console.log(`[Tracking] Ended session ${sessionInternalId}, duration: ${duration}s`);
  }

  // ============================================
  // PAGE VIEW TRACKING
  // ============================================

  /**
   * Track a page view
   */
  async trackPageView(input: TrackPageViewInput): Promise<string> {
    // Get internal session ID
    const session = await db.query.visitorSessions.findFirst({
      where: and(
        eq(visitorSessions.companyId, input.companyId),
        eq(visitorSessions.sessionId, input.sessionId)
      ),
    });

    if (!session) {
      throw new Error('Session not found');
    }

    // Parse path from URL if not provided
    let path = input.path;
    if (!path && input.url) {
      try {
        path = new URL(input.url).pathname;
      } catch {
        path = input.url;
      }
    }

    // Create page view
    const [pageView] = await db
      .insert(pageViews)
      .values({
        companyId: input.companyId,
        sessionId: session.id,
        url: input.url,
        path,
        title: input.title,
        pageType: input.pageType,
        resourceId: input.resourceId,
        loadTime: input.loadTime,
      })
      .returning();

    if (!pageView) {
      throw new Error('Failed to create page view');
    }

    // Update session page view count
    await db
      .update(visitorSessions)
      .set({
        pageViews: sql`${visitorSessions.pageViews} + 1`,
        lastActivityAt: new Date(),
      })
      .where(eq(visitorSessions.id, session.id));

    // Update landing page stats if this is a landing page
    if (input.pageType === 'landing_page' && input.resourceId) {
      await db
        .update(landingPages)
        .set({
          pageViews: sql`${landingPages.pageViews} + 1`,
        })
        .where(eq(landingPages.id, input.resourceId));
    }

    console.log(`[Tracking] Tracked page view: ${path}`);

    return pageView.id;
  }

  /**
   * Update page view with exit data
   */
  async updatePageView(
    pageViewId: string,
    data: {
      timeOnPage?: number;
      scrollDepth?: number;
      interactions?: number;
    }
  ): Promise<void> {
    await db
      .update(pageViews)
      .set({
        exitedAt: new Date(),
        timeOnPage: data.timeOnPage,
        scrollDepth: data.scrollDepth,
        interactions: data.interactions,
      })
      .where(eq(pageViews.id, pageViewId));
  }

  // ============================================
  // EVENT TRACKING
  // ============================================

  /**
   * Track an event
   */
  async trackEvent(input: TrackEventInput): Promise<string> {
    // Get internal session ID
    const session = await db.query.visitorSessions.findFirst({
      where: and(
        eq(visitorSessions.companyId, input.companyId),
        eq(visitorSessions.sessionId, input.sessionId)
      ),
    });

    if (!session) {
      throw new Error('Session not found');
    }

    // Create event
    const [event] = await db
      .insert(trackingEvents)
      .values({
        companyId: input.companyId,
        sessionId: session.id,
        pageViewId: input.pageViewId,
        eventType: input.eventType,
        eventName: input.eventName,
        eventCategory: input.eventCategory,
        eventLabel: input.eventLabel,
        eventValue: input.eventValue?.toString(),
        elementId: input.elementId,
        elementClass: input.elementClass,
        elementText: input.elementText,
        elementTag: input.elementTag,
        properties: input.properties,
      })
      .returning();

    if (!event) {
      throw new Error('Failed to create event');
    }

    // Update session event count
    await db
      .update(visitorSessions)
      .set({
        eventCount: sql`${visitorSessions.eventCount} + 1`,
        lastActivityAt: new Date(),
      })
      .where(eq(visitorSessions.id, session.id));

    console.log(`[Tracking] Tracked event: ${input.eventType}/${input.eventName}`);

    return event.id;
  }

  // ============================================
  // CONVERSION TRACKING
  // ============================================

  /**
   * Track a conversion
   */
  async trackConversion(input: TrackConversionInput): Promise<string> {
    let sessionInternalId: string | undefined;

    // Get internal session ID if provided
    if (input.sessionId) {
      const session = await db.query.visitorSessions.findFirst({
        where: and(
          eq(visitorSessions.companyId, input.companyId),
          eq(visitorSessions.sessionId, input.sessionId)
        ),
      });
      sessionInternalId = session?.id;
    }

    // Create conversion
    const [conversion] = await db
      .insert(conversions)
      .values({
        companyId: input.companyId,
        sessionId: sessionInternalId,
        leadId: input.leadId,
        type: input.type,
        name: input.name,
        value: input.value?.toString(),
        currency: input.currency || 'USD',
        source: input.source,
        medium: input.medium,
        campaign: input.campaign,
        content: input.content,
        term: input.term,
        landingPage: input.landingPage,
        referrer: input.referrer,
        properties: input.properties,
      })
      .returning();

    if (!conversion) {
      throw new Error('Failed to create conversion');
    }

    console.log(`[Tracking] Tracked conversion: ${input.type} (${input.value || 0})`);

    return conversion.id;
  }

  // ============================================
  // ANALYTICS
  // ============================================

  /**
   * Get real-time stats
   */
  async getRealTimeStats(companyId: string): Promise<{
    activeVisitors: number;
    pageViewsLast30Min: number;
    topPages: Array<{ path: string; views: number }>;
    topSources: Array<{ source: string; count: number }>;
  }> {
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);

    // Active visitors (sessions with activity in last 30 minutes)
    const activeSessions = await db.query.visitorSessions.findMany({
      where: and(
        eq(visitorSessions.companyId, companyId),
        gte(visitorSessions.lastActivityAt, thirtyMinAgo)
      ),
    });

    // Page views in last 30 minutes
    const recentPageViews = await db.query.pageViews.findMany({
      where: and(eq(pageViews.companyId, companyId), gte(pageViews.viewedAt, thirtyMinAgo)),
    });

    // Aggregate top pages
    const pageCounts: Map<string, number> = new Map();
    for (const pv of recentPageViews) {
      const path = pv.path || pv.url;
      pageCounts.set(path, (pageCounts.get(path) || 0) + 1);
    }

    const topPages = Array.from(pageCounts.entries())
      .map(([path, views]) => ({ path, views }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 5);

    // Aggregate top sources
    const sourceCounts: Map<string, number> = new Map();
    for (const session of activeSessions) {
      const source = session.utmSource || session.referrerDomain || 'direct';
      sourceCounts.set(source, (sourceCounts.get(source) || 0) + 1);
    }

    const topSources = Array.from(sourceCounts.entries())
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      activeVisitors: activeSessions.length,
      pageViewsLast30Min: recentPageViews.length,
      topPages,
      topSources,
    };
  }

  /**
   * Get analytics summary
   */
  async getAnalyticsSummary(
    companyId: string,
    options?: {
      startDate?: Date;
      endDate?: Date;
    }
  ): Promise<{
    totalSessions: number;
    uniqueVisitors: number;
    totalPageViews: number;
    avgSessionDuration: number;
    bounceRate: number;
    totalConversions: number;
    conversionRate: number;
    totalConversionValue: number;
    topSources: Array<{ source: string; sessions: number; conversionRate: number }>;
    topPages: Array<{ path: string; views: number; avgTimeOnPage: number }>;
    deviceBreakdown: Record<string, number>;
  }> {
    const startDate = options?.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = options?.endDate || new Date();

    // Get sessions in range
    const sessions = await db.query.visitorSessions.findMany({
      where: and(
        eq(visitorSessions.companyId, companyId),
        gte(visitorSessions.startedAt, startDate),
        lte(visitorSessions.startedAt, endDate)
      ),
    });

    // Get page views in range
    const allPageViews = await db.query.pageViews.findMany({
      where: and(
        eq(pageViews.companyId, companyId),
        gte(pageViews.viewedAt, startDate),
        lte(pageViews.viewedAt, endDate)
      ),
    });

    // Get conversions in range
    const allConversions = await db.query.conversions.findMany({
      where: and(
        eq(conversions.companyId, companyId),
        gte(conversions.convertedAt, startDate),
        lte(conversions.convertedAt, endDate)
      ),
    });

    // Calculate metrics
    const totalSessions = sessions.length;
    const uniqueVisitors = new Set(sessions.map((s) => s.visitorId)).size;
    const totalPageViews = allPageViews.length;

    // Average session duration
    const sessionsWithDuration = sessions.filter((s) => s.duration && s.duration > 0);
    const avgSessionDuration =
      sessionsWithDuration.length > 0
        ? sessionsWithDuration.reduce((sum, s) => sum + (s.duration || 0), 0) /
          sessionsWithDuration.length
        : 0;

    // Bounce rate
    const bounces = sessions.filter((s) => s.isBounce).length;
    const bounceRate = totalSessions > 0 ? (bounces / totalSessions) * 100 : 0;

    // Conversions
    const totalConversions = allConversions.length;
    const conversionRate = totalSessions > 0 ? (totalConversions / totalSessions) * 100 : 0;
    const totalConversionValue = allConversions.reduce(
      (sum, c) => sum + parseFloat(c.value || '0'),
      0
    );

    // Top sources
    const sourceStats: Map<string, { sessions: number; conversions: number }> = new Map();
    for (const session of sessions) {
      const source = session.utmSource || session.referrerDomain || 'direct';
      const stats = sourceStats.get(source) || { sessions: 0, conversions: 0 };
      stats.sessions++;
      sourceStats.set(source, stats);
    }
    for (const conv of allConversions) {
      const source = conv.source || 'direct';
      const stats = sourceStats.get(source);
      if (stats) {
        stats.conversions++;
      }
    }

    const topSources = Array.from(sourceStats.entries())
      .map(([source, stats]) => ({
        source,
        sessions: stats.sessions,
        conversionRate: stats.sessions > 0 ? (stats.conversions / stats.sessions) * 100 : 0,
      }))
      .sort((a, b) => b.sessions - a.sessions)
      .slice(0, 10);

    // Top pages
    const pageStats: Map<string, { views: number; totalTime: number; withTime: number }> =
      new Map();
    for (const pv of allPageViews) {
      const path = pv.path || pv.url;
      const stats = pageStats.get(path) || { views: 0, totalTime: 0, withTime: 0 };
      stats.views++;
      if (pv.timeOnPage) {
        stats.totalTime += pv.timeOnPage;
        stats.withTime++;
      }
      pageStats.set(path, stats);
    }

    const topPages = Array.from(pageStats.entries())
      .map(([path, stats]) => ({
        path,
        views: stats.views,
        avgTimeOnPage: stats.withTime > 0 ? stats.totalTime / stats.withTime : 0,
      }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 10);

    // Device breakdown
    const deviceBreakdown: Record<string, number> = {};
    for (const session of sessions) {
      const device = session.deviceType || 'unknown';
      deviceBreakdown[device] = (deviceBreakdown[device] || 0) + 1;
    }

    return {
      totalSessions,
      uniqueVisitors,
      totalPageViews,
      avgSessionDuration,
      bounceRate,
      totalConversions,
      conversionRate,
      totalConversionValue,
      topSources,
      topPages,
      deviceBreakdown,
    };
  }

  /**
   * Get attribution report
   */
  async getAttributionReport(
    companyId: string,
    options?: {
      startDate?: Date;
      endDate?: Date;
    }
  ): Promise<{
    bySource: Array<{
      source: string;
      sessions: number;
      conversions: number;
      value: number;
      conversionRate: number;
    }>;
    byCampaign: Array<{
      campaign: string;
      sessions: number;
      conversions: number;
      value: number;
      roi: number;
    }>;
    byMedium: Array<{
      medium: string;
      sessions: number;
      conversions: number;
      value: number;
    }>;
  }> {
    const startDate = options?.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = options?.endDate || new Date();

    // Get sessions and conversions
    const sessions = await db.query.visitorSessions.findMany({
      where: and(
        eq(visitorSessions.companyId, companyId),
        gte(visitorSessions.startedAt, startDate),
        lte(visitorSessions.startedAt, endDate)
      ),
    });

    const allConversions = await db.query.conversions.findMany({
      where: and(
        eq(conversions.companyId, companyId),
        gte(conversions.convertedAt, startDate),
        lte(conversions.convertedAt, endDate)
      ),
    });

    // Aggregate by source
    const sourceData: Map<string, { sessions: number; conversions: number; value: number }> =
      new Map();
    for (const session of sessions) {
      const source = session.utmSource || session.referrerDomain || 'direct';
      const data = sourceData.get(source) || { sessions: 0, conversions: 0, value: 0 };
      data.sessions++;
      sourceData.set(source, data);
    }
    for (const conv of allConversions) {
      const source = conv.source || 'direct';
      const data = sourceData.get(source) || { sessions: 0, conversions: 0, value: 0 };
      data.conversions++;
      data.value += parseFloat(conv.value || '0');
      sourceData.set(source, data);
    }

    const bySource = Array.from(sourceData.entries())
      .map(([source, data]) => ({
        source,
        ...data,
        conversionRate: data.sessions > 0 ? (data.conversions / data.sessions) * 100 : 0,
      }))
      .sort((a, b) => b.conversions - a.conversions);

    // Aggregate by campaign
    const campaignData: Map<string, { sessions: number; conversions: number; value: number }> =
      new Map();
    for (const session of sessions) {
      if (session.utmCampaign) {
        const data = campaignData.get(session.utmCampaign) || {
          sessions: 0,
          conversions: 0,
          value: 0,
        };
        data.sessions++;
        campaignData.set(session.utmCampaign, data);
      }
    }
    for (const conv of allConversions) {
      if (conv.campaign) {
        const data = campaignData.get(conv.campaign) || { sessions: 0, conversions: 0, value: 0 };
        data.conversions++;
        data.value += parseFloat(conv.value || '0');
        campaignData.set(conv.campaign, data);
      }
    }

    const byCampaign = Array.from(campaignData.entries())
      .map(([campaign, data]) => ({
        campaign,
        ...data,
        roi: 0, // Would need ad spend data to calculate
      }))
      .sort((a, b) => b.conversions - a.conversions);

    // Aggregate by medium
    const mediumData: Map<string, { sessions: number; conversions: number; value: number }> =
      new Map();
    for (const session of sessions) {
      const medium = session.utmMedium || 'none';
      const data = mediumData.get(medium) || { sessions: 0, conversions: 0, value: 0 };
      data.sessions++;
      mediumData.set(medium, data);
    }
    for (const conv of allConversions) {
      const medium = conv.medium || 'none';
      const data = mediumData.get(medium) || { sessions: 0, conversions: 0, value: 0 };
      data.conversions++;
      data.value += parseFloat(conv.value || '0');
      mediumData.set(medium, data);
    }

    const byMedium = Array.from(mediumData.entries())
      .map(([medium, data]) => ({
        medium,
        ...data,
      }))
      .sort((a, b) => b.sessions - a.sessions);

    return {
      bySource,
      byCampaign,
      byMedium,
    };
  }

  // ============================================
  // AGGREGATION (for daily metrics)
  // ============================================

  /**
   * Aggregate daily metrics
   */
  async aggregateDailyMetrics(companyId: string, date: Date): Promise<void> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    // Get all sessions for the day
    const daySessions = await db.query.visitorSessions.findMany({
      where: and(
        eq(visitorSessions.companyId, companyId),
        gte(visitorSessions.startedAt, startOfDay),
        lte(visitorSessions.startedAt, endOfDay)
      ),
    });

    // Get page views for the day
    const dayPageViews = await db.query.pageViews.findMany({
      where: and(
        eq(pageViews.companyId, companyId),
        gte(pageViews.viewedAt, startOfDay),
        lte(pageViews.viewedAt, endOfDay)
      ),
    });

    // Get events for the day
    const dayEvents = await db.query.trackingEvents.findMany({
      where: and(
        eq(trackingEvents.companyId, companyId),
        gte(trackingEvents.occurredAt, startOfDay),
        lte(trackingEvents.occurredAt, endOfDay)
      ),
    });

    // Get conversions for the day
    const dayConversions = await db.query.conversions.findMany({
      where: and(
        eq(conversions.companyId, companyId),
        gte(conversions.convertedAt, startOfDay),
        lte(conversions.convertedAt, endOfDay)
      ),
    });

    // Calculate metrics
    const sessions = daySessions.length;
    const uniqueVisitors = new Set(daySessions.map((s) => s.visitorId)).size;
    const pageViewsCount = dayPageViews.length;

    const sessionsWithDuration = daySessions.filter((s) => s.duration && s.duration > 0);
    const avgSessionDuration =
      sessionsWithDuration.length > 0
        ? Math.round(
            sessionsWithDuration.reduce((sum, s) => sum + (s.duration || 0), 0) /
              sessionsWithDuration.length
          )
        : 0;

    const bounces = daySessions.filter((s) => s.isBounce).length;
    const bounceRate = sessions > 0 ? (bounces / sessions) * 100 : 0;

    const avgPagesPerSession = sessions > 0 ? pageViewsCount / sessions : 0;

    const pvsWithScroll = dayPageViews.filter((pv) => pv.scrollDepth && pv.scrollDepth > 0);
    const avgScrollDepth =
      pvsWithScroll.length > 0
        ? pvsWithScroll.reduce((sum, pv) => sum + (pv.scrollDepth || 0), 0) / pvsWithScroll.length
        : 0;

    const totalConversions = dayConversions.length;
    const conversionRate = sessions > 0 ? (totalConversions / sessions) * 100 : 0;
    const conversionValue = dayConversions.reduce((sum, c) => sum + parseFloat(c.value || '0'), 0);

    // Top sources
    const sourceCounts: Map<string, number> = new Map();
    for (const session of daySessions) {
      const source = session.utmSource || session.referrerDomain || 'direct';
      sourceCounts.set(source, (sourceCounts.get(source) || 0) + 1);
    }
    const topSources = Array.from(sourceCounts.entries())
      .map(([source, sessionCount]) => ({ source, sessions: sessionCount }))
      .sort((a, b) => b.sessions - a.sessions)
      .slice(0, 5);

    // Top pages
    const pageCounts: Map<string, number> = new Map();
    for (const pv of dayPageViews) {
      const path = pv.path || pv.url;
      pageCounts.set(path, (pageCounts.get(path) || 0) + 1);
    }
    const topPages = Array.from(pageCounts.entries())
      .map(([path, views]) => ({ path, views }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 5);

    // Upsert daily metrics
    const existing = await db.query.dailyMetrics.findFirst({
      where: and(eq(dailyMetrics.companyId, companyId), eq(dailyMetrics.date, startOfDay)),
    });

    if (existing) {
      await db
        .update(dailyMetrics)
        .set({
          sessions,
          uniqueVisitors,
          pageViews: pageViewsCount,
          avgSessionDuration,
          bounceRate: bounceRate.toFixed(2),
          totalEvents: dayEvents.length,
          avgPagesPerSession: avgPagesPerSession.toFixed(2),
          avgScrollDepth: avgScrollDepth.toFixed(2),
          totalConversions,
          conversionRate: conversionRate.toFixed(2),
          conversionValue: conversionValue.toFixed(2),
          topSources,
          topPages,
          updatedAt: new Date(),
        })
        .where(eq(dailyMetrics.id, existing.id));
    } else {
      await db.insert(dailyMetrics).values({
        companyId,
        date: startOfDay,
        sessions,
        uniqueVisitors,
        pageViews: pageViewsCount,
        avgSessionDuration,
        bounceRate: bounceRate.toFixed(2),
        totalEvents: dayEvents.length,
        avgPagesPerSession: avgPagesPerSession.toFixed(2),
        avgScrollDepth: avgScrollDepth.toFixed(2),
        totalConversions,
        conversionRate: conversionRate.toFixed(2),
        conversionValue: conversionValue.toFixed(2),
        topSources,
        topPages,
      });
    }

    console.log(`[Tracking] Aggregated daily metrics for ${startOfDay.toDateString()}`);
  }
}

export const trackingEngine = new TrackingEngine();
