import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { HTTPException } from 'hono/http-exception';
import { authMiddleware, getUserCompanies } from '../middleware/auth';
import { trackingEngine } from '../services/tracking-engine';
import { attributionService } from '../services/attribution';

const trackingRouter = new Hono();

// Simple in-memory rate limiter
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function rateLimit(ip: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (entry.count >= maxRequests) return false;
  entry.count++;
  return true;
}

// Clean up old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of rateLimitMap) {
    if (now > val.resetAt) rateLimitMap.delete(key);
  }
}, 300000);

// Helper to verify company access
async function verifyCompanyAccess(userId: string, companyId: string): Promise<boolean> {
  const userCompanies = await getUserCompanies(userId);
  return userCompanies.some((co: { id: string }) => co.id === companyId);
}

// ============================================
// PUBLIC ENDPOINTS (For tracking pixel/SDK)
// ============================================

// Track session start
const sessionSchema = z.object({
  companyId: z.string().uuid(),
  visitorId: z.string().min(1),
  sessionId: z.string().min(1),
  leadId: z.string().uuid().optional(),
  utm_source: z.string().optional(),
  utm_medium: z.string().optional(),
  utm_campaign: z.string().optional(),
  utm_content: z.string().optional(),
  utm_term: z.string().optional(),
  referrer: z.string().optional(),
  landingPage: z.string().optional(),
});

trackingRouter.post('/public/session', zValidator('json', sessionSchema), async (c) => {
  const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown';
  if (!rateLimit(ip, 100, 60000)) {
    return c.json({ error: 'Too many requests. Please try again later.' }, 429);
  }

  const body = c.req.valid('json');
  const userAgent = c.req.header('user-agent');
  const ipAddress = c.req.header('x-forwarded-for') || c.req.header('x-real-ip');

  const sessionInternalId = await trackingEngine.trackSession({
    companyId: body.companyId,
    visitorId: body.visitorId,
    sessionId: body.sessionId,
    leadId: body.leadId,
    userAgent,
    ipAddress,
    utmSource: body.utm_source,
    utmMedium: body.utm_medium,
    utmCampaign: body.utm_campaign,
    utmContent: body.utm_content,
    utmTerm: body.utm_term,
    referrer: body.referrer,
    landingPage: body.landingPage,
  });

  return c.json({
    success: true,
    data: { sessionInternalId },
  });
});

// Track page view
const pageViewSchema = z.object({
  companyId: z.string().uuid(),
  sessionId: z.string().min(1),
  url: z.string().min(1),
  path: z.string().optional(),
  title: z.string().optional(),
  pageType: z.string().optional(),
  resourceId: z.string().uuid().optional(),
  loadTime: z.number().optional(),
});

trackingRouter.post('/public/pageview', zValidator('json', pageViewSchema), async (c) => {
  const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown';
  if (!rateLimit(ip, 100, 60000)) {
    return c.json({ error: 'Too many requests. Please try again later.' }, 429);
  }

  const body = c.req.valid('json');

  try {
    const pageViewId = await trackingEngine.trackPageView(body);

    return c.json({
      success: true,
      data: { pageViewId },
    });
  } catch (error) {
    // Session might not exist, return gracefully
    return c.json({
      success: false,
      error: 'Could not track this visit. Please try again.',
    });
  }
});

// Track event
const eventSchema = z.object({
  companyId: z.string().uuid(),
  sessionId: z.string().min(1),
  pageViewId: z.string().uuid().optional(),
  eventType: z.enum([
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
  ]),
  eventName: z.string().min(1),
  eventCategory: z.string().optional(),
  eventLabel: z.string().optional(),
  eventValue: z.number().optional(),
  elementId: z.string().optional(),
  elementClass: z.string().optional(),
  elementText: z.string().optional(),
  elementTag: z.string().optional(),
  properties: z.record(z.unknown()).optional(),
});

trackingRouter.post('/public/event', zValidator('json', eventSchema), async (c) => {
  const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown';
  if (!rateLimit(ip, 100, 60000)) {
    return c.json({ error: 'Too many requests. Please try again later.' }, 429);
  }

  const body = c.req.valid('json');

  try {
    const eventId = await trackingEngine.trackEvent(body);

    return c.json({
      success: true,
      data: { eventId },
    });
  } catch (error) {
    return c.json({
      success: false,
      error: 'Could not track this event. Please try again.',
    });
  }
});

// Batch track events (for batched sending)
const batchEventsSchema = z.object({
  companyId: z.string().uuid(),
  sessionId: z.string().min(1),
  events: z.array(
    z.object({
      pageViewId: z.string().uuid().optional(),
      eventType: z.enum([
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
      ]),
      eventName: z.string().min(1),
      eventCategory: z.string().optional(),
      eventLabel: z.string().optional(),
      eventValue: z.number().optional(),
      properties: z.record(z.unknown()).optional(),
    })
  ),
});

trackingRouter.post('/public/events/batch', zValidator('json', batchEventsSchema), async (c) => {
  const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown';
  if (!rateLimit(ip, 100, 60000)) {
    return c.json({ error: 'Too many requests. Please try again later.' }, 429);
  }

  const body = c.req.valid('json');
  const results: { eventId?: string; error?: string }[] = [];

  for (const event of body.events) {
    try {
      const eventId = await trackingEngine.trackEvent({
        companyId: body.companyId,
        sessionId: body.sessionId,
        ...event,
      });
      results.push({ eventId });
    } catch (error) {
      results.push({ error: 'Could not process this event' });
    }
  }

  return c.json({
    success: true,
    data: { results },
  });
});

// Track conversion (public)
const conversionPublicSchema = z.object({
  companyId: z.string().uuid(),
  sessionId: z.string().optional(),
  leadId: z.string().uuid().optional(),
  type: z.enum([
    'lead',
    'signup',
    'purchase',
    'download',
    'contact',
    'demo_request',
    'newsletter',
    'custom',
  ]),
  name: z.string().optional(),
  value: z.number().optional(),
  currency: z.string().length(3).optional(),
  utm_source: z.string().optional(),
  utm_medium: z.string().optional(),
  utm_campaign: z.string().optional(),
  utm_content: z.string().optional(),
  utm_term: z.string().optional(),
  landingPage: z.string().optional(),
  referrer: z.string().optional(),
  properties: z.record(z.unknown()).optional(),
});

trackingRouter.post('/public/conversion', zValidator('json', conversionPublicSchema), async (c) => {
  const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown';
  if (!rateLimit(ip, 100, 60000)) {
    return c.json({ error: 'Too many requests. Please try again later.' }, 429);
  }

  const body = c.req.valid('json');

  const conversionId = await trackingEngine.trackConversion({
    companyId: body.companyId,
    sessionId: body.sessionId,
    leadId: body.leadId,
    type: body.type,
    name: body.name,
    value: body.value,
    currency: body.currency,
    source: body.utm_source,
    medium: body.utm_medium,
    campaign: body.utm_campaign,
    content: body.utm_content,
    term: body.utm_term,
    landingPage: body.landingPage,
    referrer: body.referrer,
    properties: body.properties,
  });

  return c.json({
    success: true,
    data: { conversionId },
  });
});

// Track conversion with full revenue attribution (public)
const attributedConversionSchema = z.object({
  companyId: z.string().uuid(),
  sessionId: z.string().optional(),
  leadId: z.string().uuid().optional(),
  type: z.enum([
    'lead',
    'signup',
    'purchase',
    'download',
    'contact',
    'demo_request',
    'newsletter',
    'custom',
  ]),
  revenue: z.number().optional(),
  metadata: z.record(z.unknown()).optional(),
});

trackingRouter.post(
  '/public/conversion/attributed',
  zValidator('json', attributedConversionSchema),
  async (c) => {
    const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown';
    if (!rateLimit(ip, 100, 60000)) {
      return c.json({ error: 'Too many requests. Please try again later.' }, 429);
    }

    const body = c.req.valid('json');

    try {
      // 1. Attribute to campaign/creative via last-click model
      const attribution = await attributionService.attributeConversion(body.companyId, {
        sessionId: body.sessionId,
        leadId: body.leadId,
        type: body.type,
        revenue: body.revenue || 0,
      });

      // 2. Create conversion with full attribution chain
      const conversionId = await trackingEngine.trackConversion({
        companyId: body.companyId,
        sessionId: body.sessionId,
        leadId: body.leadId,
        type: body.type,
        value: body.revenue,
        revenue: body.revenue,
        campaignId: attribution.campaign_id,
        creativeId: attribution.creative_id,
        channel: attribution.channel,
        attributionModel: attribution.attribution_model,
        source: attribution.source,
        medium: attribution.medium,
        campaign: attribution.campaignName,
        content: attribution.utmContent,
        properties: {
          ...body.metadata,
          campaignId: attribution.campaign_id,
          creativeId: attribution.creative_id,
          channel: attribution.channel,
          attributionModel: attribution.attribution_model,
        },
      });

      return c.json({
        success: true,
        data: {
          conversionId,
          attribution: {
            campaignId: attribution.campaign_id,
            creativeId: attribution.creative_id,
            channel: attribution.channel,
            model: attribution.attribution_model,
          },
        },
      });
    } catch (error) {
      return c.json({
        success: false,
        error: 'Could not track conversion. Please try again.',
      });
    }
  }
);

// Authenticated conversion tracking with attribution
trackingRouter.post(
  '/company/:companyId/conversions/attributed',
  authMiddleware,
  zValidator('json', z.object({
    sessionId: z.string().optional(),
    leadId: z.string().uuid().optional(),
    type: z.enum([
      'lead', 'signup', 'purchase', 'download', 'contact', 'demo_request', 'newsletter', 'custom',
    ]),
    revenue: z.number().optional(),
    metadata: z.record(z.unknown()).optional(),
  })),
  async (c) => {
    const companyId = c.req.param('companyId');
    const { userId } = c.get('user');
    const body = c.req.valid('json');

    if (!(await verifyCompanyAccess(userId, companyId))) {
      throw new HTTPException(403, { message: 'Access denied' });
    }

    const attribution = await attributionService.attributeConversion(companyId, {
      sessionId: body.sessionId,
      leadId: body.leadId,
      type: body.type,
      revenue: body.revenue || 0,
    });

    const conversionId = await trackingEngine.trackConversion({
      companyId,
      sessionId: body.sessionId,
      leadId: body.leadId,
      type: body.type,
      value: body.revenue,
      revenue: body.revenue,
      campaignId: attribution.campaign_id,
      creativeId: attribution.creative_id,
      channel: attribution.channel,
      attributionModel: attribution.attribution_model,
      source: attribution.source,
      medium: attribution.medium,
      campaign: attribution.campaignName,
      content: attribution.utmContent,
      properties: {
        ...body.metadata,
        campaignId: attribution.campaign_id,
        creativeId: attribution.creative_id,
        channel: attribution.channel,
        attributionModel: attribution.attribution_model,
      },
    });

    return c.json({
      success: true,
      data: {
        conversionId,
        attribution: {
          campaignId: attribution.campaign_id,
          creativeId: attribution.creative_id,
          channel: attribution.channel,
          model: attribution.attribution_model,
        },
      },
    });
  }
);

// End session (for page unload)
const endSessionSchema = z.object({
  companyId: z.string().uuid(),
  sessionInternalId: z.string().uuid(),
});

trackingRouter.post('/public/session/end', zValidator('json', endSessionSchema), async (c) => {
  const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown';
  if (!rateLimit(ip, 100, 60000)) {
    return c.json({ error: 'Too many requests. Please try again later.' }, 429);
  }

  const body = c.req.valid('json');

  await trackingEngine.endSession(body.sessionInternalId);

  return c.json({ success: true });
});

// Update page view (for exit tracking)
const updatePageViewSchema = z.object({
  pageViewId: z.string().uuid(),
  timeOnPage: z.number().optional(),
  scrollDepth: z.number().min(0).max(100).optional(),
  interactions: z.number().optional(),
});

trackingRouter.post('/public/pageview/update', zValidator('json', updatePageViewSchema), async (c) => {
  const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown';
  if (!rateLimit(ip, 100, 60000)) {
    return c.json({ error: 'Too many requests. Please try again later.' }, 429);
  }

  const body = c.req.valid('json');

  await trackingEngine.updatePageView(body.pageViewId, {
    timeOnPage: body.timeOnPage,
    scrollDepth: body.scrollDepth,
    interactions: body.interactions,
  });

  return c.json({ success: true });
});

// ============================================
// AUTHENTICATED ENDPOINTS (Analytics)
// ============================================

trackingRouter.use('/company/*', authMiddleware);

// Get real-time stats
trackingRouter.get('/company/:companyId/realtime', async (c) => {
  const companyId = c.req.param('companyId');
  const { userId } = c.get('user');

  if (!(await verifyCompanyAccess(userId, companyId))) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  const stats = await trackingEngine.getRealTimeStats(companyId);

  return c.json({ data: stats });
});

// Get analytics summary
trackingRouter.get('/company/:companyId/summary', async (c) => {
  const companyId = c.req.param('companyId');
  const { userId } = c.get('user');
  const startDate = c.req.query('startDate');
  const endDate = c.req.query('endDate');

  if (!(await verifyCompanyAccess(userId, companyId))) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  const summary = await trackingEngine.getAnalyticsSummary(companyId, {
    startDate: startDate ? new Date(startDate) : undefined,
    endDate: endDate ? new Date(endDate) : undefined,
  });

  return c.json({ data: summary });
});

// Get attribution report
trackingRouter.get('/company/:companyId/attribution', async (c) => {
  const companyId = c.req.param('companyId');
  const { userId } = c.get('user');
  const startDate = c.req.query('startDate');
  const endDate = c.req.query('endDate');

  if (!(await verifyCompanyAccess(userId, companyId))) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  const report = await trackingEngine.getAttributionReport(companyId, {
    startDate: startDate ? new Date(startDate) : undefined,
    endDate: endDate ? new Date(endDate) : undefined,
  });

  return c.json({ data: report });
});

// Track conversion (authenticated)
const conversionAuthSchema = z.object({
  sessionId: z.string().optional(),
  leadId: z.string().uuid().optional(),
  type: z.enum([
    'lead',
    'signup',
    'purchase',
    'download',
    'contact',
    'demo_request',
    'newsletter',
    'custom',
  ]),
  name: z.string().optional(),
  value: z.number().optional(),
  currency: z.string().length(3).optional(),
  source: z.string().optional(),
  medium: z.string().optional(),
  campaign: z.string().optional(),
  landingPage: z.string().optional(),
  properties: z.record(z.unknown()).optional(),
});

trackingRouter.post(
  '/company/:companyId/conversions',
  zValidator('json', conversionAuthSchema),
  async (c) => {
    const companyId = c.req.param('companyId');
    const { userId } = c.get('user');
    const body = c.req.valid('json');

    if (!(await verifyCompanyAccess(userId, companyId))) {
      throw new HTTPException(403, { message: 'Access denied' });
    }

    const conversionId = await trackingEngine.trackConversion({
      companyId,
      ...body,
    });

    return c.json({
      success: true,
      data: { conversionId },
      message: 'Conversion tracked',
    });
  }
);

// Aggregate daily metrics (for worker/cron)
trackingRouter.post('/aggregate-daily', authMiddleware, async (c) => {
  const { companyId, date } = await c.req.json<{ companyId: string; date?: string }>();

  await trackingEngine.aggregateDailyMetrics(
    companyId,
    date ? new Date(date) : new Date()
  );

  return c.json({
    success: true,
    message: 'Daily metrics aggregated',
  });
});

export default trackingRouter;
