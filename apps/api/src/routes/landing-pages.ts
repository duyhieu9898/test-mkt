/**
 * Landing Pages API Routes
 *
 * Endpoints for AI-generated landing pages:
 * - Generate new pages from prompts
 * - Manage page lifecycle
 * - Capture and track leads
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../lib/db';
import { companies, landingPages, landingPageLeads } from '@1person/core/db';
import { authMiddleware } from '../middleware/auth';
import { HTTPException } from 'hono/http-exception';
import { landingPageService } from '../services/landing-page-service';

const landingPagesRouter = new Hono();

// Apply auth to all routes
landingPagesRouter.use('*', authMiddleware);

// =============================================================================
// SCHEMAS
// =============================================================================

const generatePageSchema = z.object({
  companyId: z.string().uuid(),
  prompt: z.string().min(10).max(2000),
  style: z
    .enum(['minimal', 'modern', 'bold', 'professional', 'playful', 'elegant'])
    .optional(),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  includeFeatures: z.boolean().optional(),
  includePricing: z.boolean().optional(),
  includeTestimonials: z.boolean().optional(),
  includeFAQ: z.boolean().optional(),
});

const updateStatusSchema = z.object({
  status: z.enum(['draft', 'generating', 'ready', 'published', 'archived']),
});

const sectionSchema = z.object({
  id: z.string().optional(),
  type: z.string(),
  content: z.record(z.unknown()),
  order: z.number(),
  isVisible: z.number().optional(),
  backgroundColor: z.string().optional(),
});

const updateSectionsSchema = z.object({
  sections: z.array(sectionSchema),
});

const captureLeadSchema = z.object({
  email: z.string().email(),
  name: z.string().max(255).optional(),
  phone: z.string().max(50).optional(),
  company: z.string().max(255).optional(),
  message: z.string().max(5000).optional(),
  source: z.string().max(100).optional(),
  medium: z.string().max(100).optional(),
  campaign: z.string().max(100).optional(),
});

const updateLeadStatusSchema = z.object({
  status: z.enum(['new', 'contacted', 'qualified', 'converted', 'lost']),
  notes: z.string().max(5000).optional(),
});

// =============================================================================
// HELPERS
// =============================================================================

const checkCompanyOwnership = async (companyId: string, userId: string) => {
  const company = await db.query.companies.findFirst({
    where: and(eq(companies.id, companyId), eq(companies.ownerId, userId)),
  });
  if (!company) {
    throw new HTTPException(404, { message: 'Company not found' });
  }
  return company;
};

const checkPageOwnership = async (pageId: string, userId: string) => {
  const page = await db.query.landingPages.findFirst({
    where: eq(landingPages.id, pageId),
    with: { company: true },
  });

  if (!page) {
    throw new HTTPException(404, { message: 'Landing page not found' });
  }

  if (page.company.ownerId !== userId) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  return page;
};

// =============================================================================
// ROUTES
// =============================================================================

/**
 * GET /landing-pages
 * List all landing pages for a company
 */
landingPagesRouter.get('/', async (c) => {
  const { userId } = c.get('user');
  const companyId = c.req.query('companyId');

  if (!companyId) {
    throw new HTTPException(400, { message: 'companyId is required' });
  }

  await checkCompanyOwnership(companyId, userId);

  const pages = await landingPageService.getPagesByCompany(companyId);

  return c.json({
    success: true,
    data: pages,
    count: pages.length,
  });
});

/**
 * GET /landing-pages/:id
 * Get a specific landing page with all sections and assets
 */
landingPagesRouter.get('/:id', async (c) => {
  const { userId } = c.get('user');
  const pageId = c.req.param('id');

  await checkPageOwnership(pageId, userId);

  const page = await landingPageService.getPage(pageId);

  if (!page) {
    throw new HTTPException(404, { message: 'Landing page not found' });
  }

  return c.json({
    success: true,
    data: page,
  });
});

/**
 * POST /landing-pages/generate
 * Generate a new landing page from a prompt
 */
landingPagesRouter.post(
  '/generate',
  zValidator('json', generatePageSchema),
  async (c) => {
    const { userId } = c.get('user');
    const data = c.req.valid('json');

    await checkCompanyOwnership(data.companyId, userId);

    console.log(`[API] Generating landing page for company ${data.companyId}`);
    console.log(`[API] Prompt: ${data.prompt.substring(0, 100)}...`);

    try {
      const page = await landingPageService.generateFromPrompt(data);

      return c.json({
        success: true,
        data: page,
        message: 'Landing page generated successfully',
      });
    } catch (error) {
      console.error('[API] Landing page generation failed:', error);
      throw new HTTPException(500, {
        message:
          error instanceof Error
            ? error.message
            : 'Failed to generate landing page',
      });
    }
  }
);

/**
 * PATCH /landing-pages/:id/status
 * Update the status of a landing page
 */
landingPagesRouter.patch(
  '/:id/status',
  zValidator('json', updateStatusSchema),
  async (c) => {
    const { userId } = c.get('user');
    const pageId = c.req.param('id');
    const { status } = c.req.valid('json');

    await checkPageOwnership(pageId, userId);

    const updated = await landingPageService.updateStatus(pageId, status);

    return c.json({
      success: true,
      data: updated,
      message: `Page status updated to ${status}`,
    });
  }
);

/**
 * PUT /landing-pages/:id/sections
 * Update all sections for a landing page
 */
landingPagesRouter.put(
  '/:id/sections',
  zValidator('json', updateSectionsSchema),
  async (c) => {
    const { userId } = c.get('user');
    const pageId = c.req.param('id');
    const { sections } = c.req.valid('json');

    await checkPageOwnership(pageId, userId);

    const updated = await landingPageService.updateSections(pageId, sections);

    return c.json({
      success: true,
      data: updated,
      message: 'Sections updated successfully',
    });
  }
);

/**
 * DELETE /landing-pages/:id
 * Delete a landing page
 */
landingPagesRouter.delete('/:id', async (c) => {
  const { userId } = c.get('user');
  const pageId = c.req.param('id');

  await checkPageOwnership(pageId, userId);

  await landingPageService.deletePage(pageId);

  return c.json({
    success: true,
    message: 'Landing page deleted successfully',
  });
});

// =============================================================================
// LEAD ROUTES
// =============================================================================

/**
 * GET /landing-pages/:id/leads
 * Get all leads for a landing page
 */
landingPagesRouter.get('/:id/leads', async (c) => {
  const { userId } = c.get('user');
  const pageId = c.req.param('id');

  const page = await checkPageOwnership(pageId, userId);

  const leads = await landingPageService.getLeads(pageId);

  return c.json({
    success: true,
    data: leads,
    count: leads.length,
  });
});

/**
 * POST /landing-pages/:id/leads
 * Capture a new lead (public endpoint - no auth required for lead capture)
 * Note: This endpoint should be exposed publicly for lead forms
 */
landingPagesRouter.post(
  '/:id/leads',
  zValidator('json', captureLeadSchema),
  async (c) => {
    const pageId = c.req.param('id');
    const data = c.req.valid('json');

    // Get page to verify it exists and get companyId
    const page = await db.query.landingPages.findFirst({
      where: eq(landingPages.id, pageId),
    });

    if (!page) {
      throw new HTTPException(404, { message: 'Landing page not found' });
    }

    if (page.status !== 'published') {
      throw new HTTPException(400, {
        message: 'Cannot capture leads for unpublished pages',
      });
    }

    const lead = await landingPageService.captureLead({
      pageId,
      companyId: page.companyId,
      ...data,
    });

    if (!lead) {
      throw new HTTPException(500, { message: 'Failed to capture lead' });
    }

    return c.json({
      success: true,
      data: { id: lead.id },
      message: 'Thank you for your interest!',
    });
  }
);

/**
 * PATCH /landing-pages/:pageId/leads/:leadId/status
 * Update lead status
 */
landingPagesRouter.patch(
  '/:pageId/leads/:leadId/status',
  zValidator('json', updateLeadStatusSchema),
  async (c) => {
    const { userId } = c.get('user');
    const pageId = c.req.param('pageId');
    const leadId = c.req.param('leadId');
    const { status, notes } = c.req.valid('json');

    await checkPageOwnership(pageId, userId);

    const [updated] = await db
      .update(landingPageLeads)
      .set({
        status,
        notes: notes || undefined,
        updatedAt: new Date(),
        ...(status === 'contacted' ? { contactedAt: new Date() } : {}),
        ...(status === 'converted' ? { convertedAt: new Date() } : {}),
      })
      .where(and(eq(landingPageLeads.id, leadId), eq(landingPageLeads.pageId, pageId)))
      .returning();

    if (!updated) {
      throw new HTTPException(404, { message: 'Lead not found' });
    }

    return c.json({
      success: true,
      data: updated,
    });
  }
);

// =============================================================================
// ANALYTICS ROUTES (placeholder for future implementation)
// =============================================================================

/**
 * GET /landing-pages/:id/analytics
 * Get analytics for a landing page
 */
landingPagesRouter.get('/:id/analytics', async (c) => {
  const { userId } = c.get('user');
  const pageId = c.req.param('id');

  const page = await checkPageOwnership(pageId, userId);

  // Return basic metrics for now
  return c.json({
    success: true,
    data: {
      pageId,
      totalVisitors: page.totalVisitors || 0,
      totalLeads: page.totalLeads || 0,
      conversionRate: page.conversionRate || '0.00',
      // TODO: Add detailed analytics from landingPageAnalytics table
    },
  });
});

// =============================================================================
// GENERATE CONTENT FOR A SPECIFIC PAGE
// =============================================================================

landingPagesRouter.post('/:pageId/generate-content', async (c) => {
  const pageId = c.req.param('pageId');

  const page = await db.query.landingPages.findFirst({
    where: eq(landingPages.id, pageId),
  });

  if (!page) {
    throw new HTTPException(404, { message: 'Page not found' });
  }

  const { landingPageSections } = await import('@1person/core/db');

  // Check if sections already exist
  const existingSections = await db.query.landingPageSections.findMany({
    where: eq(landingPageSections.pageId, pageId),
  });

  if (existingSections.length > 0) {
    return c.json({ success: true, message: 'Content already exists', sectionsCount: existingSections.length });
  }

  // Generate content directly (not via queue — immediate for UX)
  const ctx = page.businessContext as any;
  const keyword = ctx?.keyword || page.name;

  try {
    const { llmGenerate, extractJSON } = await import('../lib/llm');

    // Load FULL business context + marketing frameworks
    const { buildBusinessContext } = await import('../services/business-context');
    const { AIDA_FRAMEWORK } = await import('../services/marketing-frameworks');
    const bizCtx = await buildBusinessContext(page.companyId);
    const knowledgeContext = bizCtx.fullContext;

    // Pick random variation seed for layout diversity
    const variations = ['centered', 'split-screen', 'left-text-right-image', 'full-width-gradient'];
    const heroLayout = variations[Math.floor(Math.random() * variations.length)];
    const featureLayouts = ['grid-cards', 'icon-list', 'alternating-rows'];
    const featureLayout = featureLayouts[Math.floor(Math.random() * featureLayouts.length)];

    const { text } = await llmGenerate([{
      role: 'system',
      content: `You are an expert conversion-focused landing page generator. Follow the AIDA framework strictly.

${AIDA_FRAMEWORK}

Write like a senior copywriter for a Stripe/YC-level startup page. Every section must drive toward the conversion goal. Include MINIMUM 3 CTAs distributed through the page.`,
    }, {
      role: 'user',
      content: `Generate a complete landing page.

PAGE INFO:
- Title: ${page.name}
- Keyword: ${keyword}
- Description: ${page.description || 'N/A'}
- Intent: ${ctx?.searchIntent || 'commercial'}
- Page type: ${ctx?.pageType || 'service_page'}
- Hero layout: ${heroLayout}
- Feature layout: ${featureLayout}

BUSINESS KNOWLEDGE:
${knowledgeContext || 'No specific knowledge available — generate based on the page title and keyword.'}

CONVERSION GOAL: ${ctx?.searchIntent === 'transactional' ? 'Get signups/purchases' : ctx?.searchIntent === 'informational' ? 'Build trust and capture email' : 'Generate leads'}

Return ONLY valid JSON with 5-7 sections:
{
  "hero": {
    "headline": "Benefit-driven headline (include keyword naturally)",
    "subheadline": "Specific outcome statement under 160 chars",
    "ctaText": "Action verb + benefit",
    "layout": "${heroLayout}"
  },
  "features": {
    "title": "Section title",
    "description": "Brief intro",
    "layout": "${featureLayout}",
    "items": [
      {"title": "Feature name", "description": "Value-focused description", "icon": "star"},
      {"title": "Feature 2", "description": "...", "icon": "zap"},
      {"title": "Feature 3", "description": "...", "icon": "shield"}
    ]
  },
  "problem": {
    "title": "The Challenge",
    "description": "Empathize with the pain",
    "painPoints": [
      {"title": "Pain 1", "description": "Specific, relatable detail"},
      {"title": "Pain 2", "description": "..."}
    ]
  },
  "solution": {
    "title": "How We Solve This",
    "description": "Clear value prop",
    "benefits": [
      {"title": "Benefit 1", "description": "Outcome-focused"},
      {"title": "Benefit 2", "description": "..."},
      {"title": "Benefit 3", "description": "..."}
    ]
  },
  "testimonials": {
    "title": "What Our Customers Say",
    "testimonials": [
      {"quote": "Realistic testimonial text", "name": "Full Name", "role": "Title, Company"}
    ]
  },
  "faq": {
    "title": "Frequently Asked Questions",
    "questions": [
      {"question": "Common objection as question?", "answer": "Objection-handling answer"}
    ]
  },
  "cta": {
    "title": "Compelling final CTA headline",
    "description": "Urgency or social proof statement",
    "ctaText": "Strong action CTA"
  }
}

RULES:
- Headlines must be benefit-driven, not feature-listing
- CTAs must use action verbs ("Get", "Start", "Join", "Try")
- Testimonials must sound real and specific
- FAQ must handle real objections (pricing, trust, comparison)
- ALL content must be specific to "${keyword}" — no generic filler
- Write copy that a CEO would approve for their real website`,
    }], { maxTokens: 3000 });

    const parsed = extractJSON(text);

    let sections: Array<{ type: string; content: any }> = [];

    if (parsed) {
      // Dynamic section ordering based on what AI returned
      const sectionOrder = ['hero', 'features', 'problem', 'solution', 'testimonials', 'faq', 'cta'];
      sections = sectionOrder
        .filter((t) => parsed[t])
        .map((t) => ({ type: t, content: parsed[t] }));
    }

    // Fallback if AI failed
    if (sections.length === 0) {
      sections = [
        { type: 'hero', content: { headline: page.name, subheadline: page.description || 'Welcome', ctaText: 'Get Started', alignment: 'center' } },
        { type: 'cta', content: { title: 'Ready?', description: 'Take action now', ctaText: 'Contact Us' } },
      ];
    }

    // Insert sections
    for (let i = 0; i < sections.length; i++) {
      await db.insert(landingPageSections).values({
        pageId,
        type: sections[i].type,
        content: sections[i].content as any,
        order: i,
        isVisible: 1,
      });
    }

    // Update page status
    await db.update(landingPages)
      .set({ status: 'draft', updatedAt: new Date() })
      .where(eq(landingPages.id, pageId));

    return c.json({ success: true, sectionsCount: sections.length });
  } catch (err) {
    console.error('Content generation failed:', err);

    // Fallback sections
    const { landingPageSections: lpSections } = await import('@1person/core/db');
    await db.insert(lpSections).values([
      { pageId, type: 'hero', content: { headline: page.name, subheadline: page.description || '', ctaText: 'Get Started', alignment: 'center' } as any, order: 0, isVisible: 1 },
      { pageId, type: 'cta', content: { title: 'Get Started', description: 'Take the next step', ctaText: 'Contact Us' } as any, order: 1, isVisible: 1 },
    ]);

    await db.update(landingPages)
      .set({ status: 'draft', updatedAt: new Date() })
      .where(eq(landingPages.id, pageId));

    return c.json({ success: true, sectionsCount: 2, fallback: true });
  }
});

export { landingPagesRouter };
