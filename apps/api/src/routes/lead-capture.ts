import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { HTTPException } from 'hono/http-exception';
import { authMiddleware, getUserCompanies } from '../middleware/auth';
import { leadCaptureEngine, type LeadSource } from '../services/lead-capture-engine';

const leadCaptureRouter = new Hono();

// Helper to verify company access
async function verifyCompanyAccess(userId: string, companyId: string): Promise<boolean> {
  const userCompanies = await getUserCompanies(userId);
  return userCompanies.some((co: { id: string }) => co.id === companyId);
}

// ============================================
// PUBLIC ENDPOINTS (No Auth Required)
// ============================================

// Capture lead from landing page (public)
const captureFromPageSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
  phone: z.string().optional(),
  message: z.string().optional(),
  utm_source: z.string().optional(),
  utm_medium: z.string().optional(),
  utm_campaign: z.string().optional(),
  referrer: z.string().optional(),
});

leadCaptureRouter.post(
  '/public/page/:pageId/company/:companyId/capture',
  zValidator('json', captureFromPageSchema),
  async (c) => {
    const pageId = c.req.param('pageId');
    const companyId = c.req.param('companyId');
    const body = c.req.valid('json');
    const ipAddress = c.req.header('x-forwarded-for') || c.req.header('x-real-ip');

    const result = await leadCaptureEngine.captureFromLandingPage({
      pageId,
      companyId,
      email: body.email,
      name: body.name,
      phone: body.phone,
      message: body.message,
      utmSource: body.utm_source,
      utmMedium: body.utm_medium,
      utmCampaign: body.utm_campaign,
      referrer: body.referrer,
      ipAddress,
    });

    return c.json({
      success: true,
      data: {
        leadId: result.outreachLeadId,
        score: result.score,
      },
      message: 'Lead captured successfully',
    });
  }
);

// Generic lead capture (public)
const captureLeadPublicSchema = z.object({
  companyId: z.string().uuid(),
  email: z.string().email(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  phone: z.string().optional(),
  company: z.string().optional(),
  jobTitle: z.string().optional(),
  source: z.string().optional(),
  sourceId: z.string().optional(),
  utm_source: z.string().optional(),
  utm_medium: z.string().optional(),
  utm_campaign: z.string().optional(),
  utm_content: z.string().optional(),
  utm_term: z.string().optional(),
  message: z.string().optional(),
  tags: z.array(z.string()).optional(),
  customFields: z.record(z.string()).optional(),
});

leadCaptureRouter.post('/public/capture', zValidator('json', captureLeadPublicSchema), async (c) => {
  const body = c.req.valid('json');
  const ipAddress = c.req.header('x-forwarded-for') || c.req.header('x-real-ip');
  const userAgent = c.req.header('user-agent');

  const result = await leadCaptureEngine.captureLead({
    companyId: body.companyId,
    email: body.email,
    firstName: body.firstName,
    lastName: body.lastName,
    phone: body.phone,
    company: body.company,
    jobTitle: body.jobTitle,
    source: (body.source || 'api') as LeadSource,
    sourceId: body.sourceId,
    utmSource: body.utm_source,
    utmMedium: body.utm_medium,
    utmCampaign: body.utm_campaign,
    utmContent: body.utm_content,
    utmTerm: body.utm_term,
    message: body.message,
    tags: body.tags,
    customFields: body.customFields,
    ipAddress,
    userAgent,
  });

  return c.json({
    success: true,
    data: {
      leadId: result.leadId,
      isNew: result.isNew,
      score: result.score,
    },
    message: result.isNew ? 'Lead captured successfully' : 'Lead updated',
  });
});

// ============================================
// AUTHENTICATED ENDPOINTS
// ============================================

leadCaptureRouter.use('/company/*', authMiddleware);

// Capture lead (authenticated)
const captureLeadSchema = z.object({
  email: z.string().email(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  phone: z.string().optional(),
  company: z.string().optional(),
  jobTitle: z.string().optional(),
  source: z
    .enum([
      'landing_page',
      'embedded_form',
      'api',
      'import',
      'linkedin',
      'referral',
      'cold_outreach',
      'ad_campaign',
      'organic',
    ])
    .optional(),
  sourceId: z.string().optional(),
  utmSource: z.string().optional(),
  utmMedium: z.string().optional(),
  utmCampaign: z.string().optional(),
  tags: z.array(z.string()).optional(),
  customFields: z.record(z.string()).optional(),
  message: z.string().optional(),
});

leadCaptureRouter.post(
  '/company/:companyId/capture',
  zValidator('json', captureLeadSchema),
  async (c) => {
    const companyId = c.req.param('companyId');
    const { userId } = c.get('user');
    const body = c.req.valid('json');

    if (!(await verifyCompanyAccess(userId, companyId))) {
      throw new HTTPException(403, { message: 'Access denied' });
    }

    const result = await leadCaptureEngine.captureLead({
      companyId,
      ...body,
      source: body.source || 'api',
    });

    return c.json({
      success: true,
      data: {
        leadId: result.leadId,
        isNew: result.isNew,
        score: result.score,
      },
      message: result.isNew ? 'Lead captured' : 'Lead updated',
    });
  }
);

// Enrich a lead
leadCaptureRouter.post('/leads/:leadId/enrich', authMiddleware, async (c) => {
  const leadId = c.req.param('leadId');

  const result = await leadCaptureEngine.enrichLead(leadId);

  if (!result.success) {
    throw new HTTPException(400, { message: result.error || 'Enrichment failed' });
  }

  return c.json({
    success: true,
    data: result.enrichedData,
    message: 'Lead enriched',
  });
});

// Score a lead
leadCaptureRouter.post('/leads/:leadId/score', authMiddleware, async (c) => {
  const leadId = c.req.param('leadId');

  const score = await leadCaptureEngine.scoreLead(leadId);

  return c.json({
    success: true,
    data: { leadId, score },
    message: 'Lead scored',
  });
});

// Qualify a lead
const qualifyLeadSchema = z.object({
  status: z.enum([
    'unqualified',
    'marketing_qualified',
    'sales_qualified',
    'opportunity',
    'customer',
    'disqualified',
  ]),
});

leadCaptureRouter.post(
  '/leads/:leadId/qualify',
  authMiddleware,
  zValidator('json', qualifyLeadSchema),
  async (c) => {
    const leadId = c.req.param('leadId');
    const { status } = c.req.valid('json');

    await leadCaptureEngine.qualifyLead(leadId, status);

    return c.json({
      success: true,
      message: `Lead qualified as ${status}`,
    });
  }
);

// Get lead capture stats
leadCaptureRouter.get('/company/:companyId/stats', async (c) => {
  const companyId = c.req.param('companyId');
  const { userId } = c.get('user');
  const startDate = c.req.query('startDate');
  const endDate = c.req.query('endDate');

  if (!(await verifyCompanyAccess(userId, companyId))) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  const stats = await leadCaptureEngine.getStats(companyId, {
    startDate: startDate ? new Date(startDate) : undefined,
    endDate: endDate ? new Date(endDate) : undefined,
  });

  return c.json({ data: stats });
});

// Get top lead sources
leadCaptureRouter.get('/company/:companyId/top-sources', async (c) => {
  const companyId = c.req.param('companyId');
  const { userId } = c.get('user');
  const limit = parseInt(c.req.query('limit') || '5');

  if (!(await verifyCompanyAccess(userId, companyId))) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  const sources = await leadCaptureEngine.getTopSources(companyId, limit);

  return c.json({ data: sources });
});

// ============================================
// WEBHOOKS
// ============================================

const registerWebhookSchema = z.object({
  url: z.string().url(),
  events: z.array(
    z.enum(['lead.created', 'lead.updated', 'lead.qualified', 'lead.converted', 'form.submitted'])
  ),
  secret: z.string().optional(),
});

leadCaptureRouter.post(
  '/company/:companyId/webhooks',
  zValidator('json', registerWebhookSchema),
  async (c) => {
    const companyId = c.req.param('companyId');
    const { userId } = c.get('user');
    const body = c.req.valid('json');

    if (!(await verifyCompanyAccess(userId, companyId))) {
      throw new HTTPException(403, { message: 'Access denied' });
    }

    const webhookId = await leadCaptureEngine.registerWebhook(
      companyId,
      body.url,
      body.events,
      body.secret
    );

    return c.json({
      success: true,
      data: { webhookId },
      message: 'Webhook registered',
    });
  }
);

export default leadCaptureRouter;
