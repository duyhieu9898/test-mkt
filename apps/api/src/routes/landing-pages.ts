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
import { landingPageDeployments, landingPages, landingPageLeads } from '@1person/core/db';
import { authMiddleware } from '../middleware/auth';
import { HTTPException } from 'hono/http-exception';
import { landingPageService } from '../services/landing-page-service';
import { CMSIntegration } from '../services/cms-integration';
import { decryptMaybe } from '../lib/crypto';
import { landingPagePublisher } from '../services/landing-page-publisher';
import { pageRendererService } from '../services/page-renderer-service';
import { authorizeCompanyAccess, type CompanyPermission } from '../lib/company-access';

const landingPagesRouter = new Hono();

// PUBLIC: approved page by subdomain (no auth, before authMiddleware)
landingPagesRouter.get('/public/by-subdomain/:subdomain', async (c) => {
  const page = await db.query.landingPages.findFirst({
    where: and(eq(landingPages.subdomain, c.req.param('subdomain').toLowerCase()), eq(landingPages.publishApprovalStatus, 'approved')),
    columns: { id: true, name: true, subdomain: true, content: true, seo: true, style: true, primaryColor: true, secondaryColor: true, fontFamily: true },
  });
  return page ? c.json(page) : c.json({ error: 'Page not found' }, 404);
});
// Auth for all routes below
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
  language: z.string().default('en'),
  attachmentText: z.string().max(10000).optional(),
  images: z.array(z.object({
    url: z.string(),
    role: z.enum(['hero', 'feature', 'screenshot', 'logo', 'general']),
    alt: z.string().optional(),
  })).max(10).optional(),
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
  backgroundColor: z.string().nullable().optional(),
  customStyles: z.record(z.string()).nullable().optional(),
});

const updateSectionsSchema = z.object({
  sections: z.array(sectionSchema),
});

const saveEditorSchema = updateSectionsSchema.extend({
  pageSettings: z.object({
    primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
    secondaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable().optional(),
  }),
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

const checkCompanyAccess = async (
  companyId: string,
  userId: string,
  permission: CompanyPermission = 'company.view',
) => {
  const access = await authorizeCompanyAccess(userId, companyId, permission);
  return access.company;
};

const checkPageAccess = async (
  pageId: string,
  userId: string,
  permission: CompanyPermission = 'company.view',
) => {
  const page = await db.query.landingPages.findFirst({
    where: eq(landingPages.id, pageId),
    with: { company: true },
  });

  if (!page) {
    throw new HTTPException(404, { message: 'Landing page not found' });
  }

  await authorizeCompanyAccess(userId, page.companyId, permission);

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

  await checkCompanyAccess(companyId, userId);

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

  const ownedPage = await checkPageAccess(pageId, userId);

  const page = await landingPageService.getPage(pageId);

  if (!page) {
    throw new HTTPException(404, { message: 'Landing page not found' });
  }

  let wordpressReviewUrl: string | null = null;
  if (page.deploymentProvider === 'wordpress' && page.deploymentId) {
    const deployment = await db.query.landingPageDeployments.findFirst({
      where: eq(landingPageDeployments.id, page.deploymentId),
    });
    const wordpressPageId = Number(deployment?.externalDeploymentId);
    const siteUrl = ((ownedPage.company.settings || {}) as Record<string, any>).wordpress?.siteUrl;
    if (siteUrl && Number.isFinite(wordpressPageId)) {
      wordpressReviewUrl = `${String(siteUrl).replace(/\/+$/, '')}/wp-admin/post.php?post=${wordpressPageId}&action=edit`;
    }
  }

  return c.json({
    success: true,
    data: { ...page, wordpressReviewUrl },
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

    await checkCompanyAccess(data.companyId, userId, 'landing_page.create');
    await authorizeCompanyAccess(userId, data.companyId, 'credits.spend');

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
        message: 'Something went wrong while generating the landing page. Please try again.',
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

    await checkPageAccess(pageId, userId, 'landing_page.edit');

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

    await checkPageAccess(pageId, userId, 'landing_page.edit');

    const updated = await landingPageService.updateSections(pageId, sections);

    return c.json({
      success: true,
      data: updated,
      message: 'Sections updated successfully',
    });
  }
);

/**
 * PUT /landing-pages/:id/editor
 * Save section content and page-level appearance from the visual editor.
 */
landingPagesRouter.put(
  '/:id/editor',
  zValidator('json', saveEditorSchema),
  async (c) => {
    const { userId } = c.get('user');
    const pageId = c.req.param('id');
    const { sections, pageSettings } = c.req.valid('json');

    await checkPageAccess(pageId, userId, 'landing_page.edit');
    const updated = await landingPageService.updateSections(pageId, sections, pageSettings);

    return c.json({
      success: true,
      data: updated,
      message: 'Page changes saved successfully',
    });
  },
);

/**
 * DELETE /landing-pages/:id
 * Delete a landing page
 */
landingPagesRouter.delete('/:id', async (c) => {
  const { userId } = c.get('user');
  const pageId = c.req.param('id');

  await checkPageAccess(pageId, userId, 'landing_page.edit');

  await landingPageService.deletePage(pageId);

  return c.json({
    success: true,
    message: 'Landing page deleted successfully',
  });
});

// =============================================================================
// DOCUMENT EXTRACTION
// =============================================================================

/**
 * POST /landing-pages/company/:companyId/extract-document
 * Upload a file (PDF, text, markdown) and extract its text content
 * for use as additional context when generating a landing page.
 */
landingPagesRouter.post('/company/:companyId/extract-document', async (c) => {
  const { userId } = c.get('user');
  const companyId = c.req.param('companyId');

  await checkCompanyAccess(companyId, userId, 'landing_page.create');

  const formData = await c.req.formData();
  const file = formData.get('file') as File;

  if (!file) {
    return c.json({ success: false, error: 'No file provided' }, 400);
  }

  const maxSize = 10 * 1024 * 1024; // 10 MB
  if (file.size > maxSize) {
    return c.json({ success: false, error: 'File too large. Maximum size is 10 MB.' }, 400);
  }

  const allowedTypes = [
    'application/pdf',
    'text/plain',
    'text/markdown',
    'text/csv',
    'text/html',
  ];

  if (!allowedTypes.includes(file.type) && !file.type.startsWith('text/')) {
    return c.json({
      success: false,
      error: 'Unsupported file type. Please upload a PDF or text file.',
    }, 400);
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const { extractTextFromFile } = await import('../services/pdf-extractor');
    const text = await extractTextFromFile(buffer, file.type);

    return c.json({
      success: true,
      data: {
        text,
        fileName: file.name,
        charCount: text.length,
      },
    });
  } catch (error) {
    console.error('[API] Document extraction failed:', error);
    return c.json({
      success: false,
      error: 'Could not extract text from the uploaded file. Please try a different format.',
    }, 500);
  }
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

  const page = await checkPageAccess(pageId, userId);

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

    await checkPageAccess(pageId, userId, 'landing_page.edit');

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

  const page = await checkPageAccess(pageId, userId);

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
  const { userId } = c.get('user');
  const pageId = c.req.param('pageId');

  const page = await db.query.landingPages.findFirst({
    where: eq(landingPages.id, pageId),
  });

  if (!page) {
    throw new HTTPException(404, { message: 'Page not found' });
  }

  await authorizeCompanyAccess(userId, page.companyId, 'landing_page.edit');
  await authorizeCompanyAccess(userId, page.companyId, 'credits.spend');

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

    const sectionOrder = [
      'hero',
      'features',
      'problem',
      'solution',
      'testimonials',
      'faq',
      'cta',
    ] as const;
    type GeneratedSectionType = (typeof sectionOrder)[number];
    let sections: Array<{ type: GeneratedSectionType; content: any }> = [];

    if (parsed) {
      // Dynamic section ordering based on what AI returned
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
      const section = sections[i];
      if (!section) continue;
      await db.insert(landingPageSections).values({
        pageId,
        type: section.type,
        content: section.content as any,
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

// =============================================================================
// CONTENT CASCADE — Generate content from a landing page
// =============================================================================

const generateContentSchema = z.object({
  types: z.array(z.enum(['blog', 'banner', 'social', 'video'])).min(1),
  language: z.string().optional(),
});

landingPagesRouter.post(
  '/company/:companyId/pages/:pageId/generate-content',
  zValidator('json', generateContentSchema),
  async (c) => {
    const { userId } = c.get('user');
    const companyId = c.req.param('companyId');
    const pageId = c.req.param('pageId');
    const { types, language } = c.req.valid('json');

    await checkCompanyAccess(companyId, userId, 'landing_page.edit');
    await authorizeCompanyAccess(userId, companyId, 'credits.spend');

    // 1. Load the landing page + its sections
    const page = await db.query.landingPages.findFirst({
      where: and(eq(landingPages.id, pageId), eq(landingPages.companyId, companyId)),
    });

    if (!page) {
      throw new HTTPException(404, { message: 'Landing page not found' });
    }

    const { landingPageSections } = await import('@1person/core/db');
    const sections = await db.select().from(landingPageSections)
      .where(eq(landingPageSections.pageId, pageId));

    // 2. Build context from page content
    const pageContent = sections.map(s => `${s.type}: ${JSON.stringify(s.content)}`).join('\n');
    const { buildBusinessContext } = await import('../services/business-context');
    const ctx = await buildBusinessContext(companyId);

    // 3. For each requested type, generate content
    const results: any = { blog: [], banner: [], social: [], video: [] };

    if (types.includes('blog')) {
      try {
        const { BlogGenerator } = await import('../services/blog-generator');
        const { blogPosts: blogPostsTable } = await import('@1person/core/db');
        const generator = new BlogGenerator();

        // Generate 2 blog posts with different search intents
        for (const intent of ['informational', 'commercial'] as const) {
          try {
            const post = await generator.generateBlogPost(companyId, {
              keyword: page.name || '',
              searchIntent: intent,
              language: language || 'en',
              relatedProducts: [page.name || ''],
              targetWordCount: 1500,
            });

            const [saved] = await db.insert(blogPostsTable).values({
              companyId,
              title: post.title,
              slug: post.slug,
              metaDescription: post.metaDescription,
              content: post.content,
              excerpt: post.excerpt,
              keyword: page.name || '',
              searchIntent: intent,
              tags: post.tags as any,
              faq: post.faq as any,
              schemaMarkup: post.schemaMarkup as any,
              wordCount: post.wordCount,
              language: language || 'en',
              status: 'draft',
            }).returning();

            results.blog.push(saved);
          } catch (blogErr) {
            console.error(`[Landing Pages] Blog generation failed for intent ${intent}:`, blogErr);
          }
        }
      } catch (err) {
        console.error('[Landing Pages] Blog module import failed:', err);
      }
    }

    if (types.includes('banner')) {
      try {
        const { llmGenerate, extractJSON } = await import('../lib/llm');
        const { banners: bannersTable } = await import('@1person/core/db');

        const { text } = await llmGenerate([
          {
            role: 'system',
            content: `You are a marketing banner copywriter. Generate banner copy variations for a product page.
Respond ONLY with a JSON array. No markdown.`,
          },
          {
            role: 'user',
            content: `Create 3 banner copy variations for this product:

Page: ${page.name}
Description: ${page.description || 'N/A'}
Business: ${ctx.companyName} (${ctx.industry})
Page content summary: ${pageContent.substring(0, 800)}

Return JSON array:
[
  {
    "headline": "Short catchy headline",
    "subheadline": "Supporting text",
    "ctaText": "Button text",
    "style": "modern"
  }
]`,
          },
        ], { maxTokens: 1000 });

        const bannerData = extractJSON(text);
        const bannerItems = Array.isArray(bannerData) ? bannerData : [];

        for (const item of bannerItems.slice(0, 3)) {
          try {
            const [saved] = await db.insert(bannersTable).values({
              companyId,
              name: `${page.name} Banner`,
              size: '1200x628',
              status: 'draft' as any,
              copy: {
                headline: item.headline || page.name || '',
                subheadline: item.subheadline || '',
                cta: item.ctaText || 'Learn More',
              },
            }).returning();
            if (saved) results.banner.push(saved);
          } catch (bannerErr) {
            console.error('[Landing Pages] Banner insert failed:', bannerErr);
          }
        }
      } catch (err) {
        console.error('[Landing Pages] Banner generation failed:', err);
      }
    }

    if (types.includes('social')) {
      try {
        const { llmGenerate, extractJSON } = await import('../lib/llm');
        const { socialPosts: socialPostsTable } = await import('@1person/core/db');

        const { text } = await llmGenerate([
          {
            role: 'system',
            content: `You are a social media marketing expert. Generate social post copy for multiple platforms.
Respond ONLY with a JSON array. No markdown.`,
          },
          {
            role: 'user',
            content: `Create 3 social media posts promoting this product page:

Page: ${page.name}
Description: ${page.description || 'N/A'}
Business: ${ctx.companyName} (${ctx.industry})

Return JSON array:
[
  {
    "platform": "twitter" | "linkedin" | "instagram",
    "content": "Post text with hashtags",
    "tone": "professional" | "casual" | "exciting"
  }
]

One post per platform: Twitter, LinkedIn, Instagram.`,
          },
        ], { maxTokens: 1000 });

        const postData = extractJSON(text);
        const postItems = Array.isArray(postData) ? postData : [];

        for (const item of postItems.slice(0, 3)) {
          try {
            const [saved] = await db.insert(socialPostsTable).values({
              companyId,
              platform: item.platform || 'twitter',
              content: item.content || '',
              status: 'draft' as any,
            }).returning();
            results.social.push(saved);
          } catch (socialErr) {
            console.error('[Landing Pages] Social post insert failed:', socialErr);
          }
        }
      } catch (err) {
        console.error('[Landing Pages] Social generation failed:', err);
      }
    }

    if (types.includes('video')) {
      try {
        const { llmGenerate, extractJSON } = await import('../lib/llm');

        const { text } = await llmGenerate([
          {
            role: 'system',
            content: `You are a video marketing strategist. Generate a video script outline.
Respond ONLY with a JSON object. No markdown.`,
          },
          {
            role: 'user',
            content: `Create a short promotional video script for this product:

Page: ${page.name}
Description: ${page.description || 'N/A'}
Business: ${ctx.companyName} (${ctx.industry})
Page content: ${pageContent.substring(0, 600)}

Return JSON:
{
  "title": "Video title",
  "duration": "30s" | "60s",
  "scenes": [
    { "scene": 1, "description": "Visual description", "narration": "Voiceover text", "duration": "5s" }
  ],
  "callToAction": "Final CTA text"
}`,
          },
        ], { maxTokens: 1000 });

        const videoScript = extractJSON(text);
        if (videoScript) {
          results.video.push({ type: 'script', ...videoScript });
        }
      } catch (err) {
        console.error('[Landing Pages] Video script generation failed:', err);
      }
    }

    const totalGenerated =
      results.blog.length + results.banner.length +
      results.social.length + results.video.length;

    return c.json({
      success: true,
      results,
      message: `${totalGenerated} content piece(s) generated from your page`,
    });
  }
);

// =============================================================================
// PUBLISH / UNPUBLISH
// =============================================================================

landingPagesRouter.get('/:id/publish-options', async (c) => {
  const { userId } = c.get('user');
  const page = await checkPageAccess(c.req.param('id'), userId);
  const settings = (page.company.settings || {}) as Record<string, any>;
  const wp = settings.wordpress;

  if (!wp?.siteUrl || !wp?.username || !wp?.appPassword) {
    return c.json({
      hosted: {
        baseDomain: process.env.LANDING_PAGE_PUBLIC_BASE_DOMAIN || null,
        baseUrl: process.env.LANDING_PAGE_PUBLIC_BASE_URL || null,
        urlMode: process.env.LANDING_PAGE_PUBLIC_URL_MODE || (process.env.LANDING_PAGE_PUBLIC_BASE_URL ? 'path' : 'subdomain'),
      },
      wordpress: { connected: false, pages: [], templates: [], menus: [] },
    });
  }

  const cms = new CMSIntegration();
  const password = decryptMaybe(wp.appPassword);
  const [pages, templates, menus] = await Promise.all([
    cms.getPages(wp.siteUrl, wp.username, password).catch(() => []),
    cms.getPageTemplates(wp.siteUrl, wp.username, password).catch(() => []),
    cms.getMenus(wp.siteUrl, wp.username, password).catch(() => []),
  ]);
  const deployment = page.deploymentProvider === 'wordpress' && page.deploymentId
    ? await db.query.landingPageDeployments.findFirst({
      where: eq(landingPageDeployments.id, page.deploymentId),
    })
    : null;
  const currentWordPressPage = deployment?.externalDeploymentId
    ? pages.find((item) => item.id === Number(deployment.externalDeploymentId))
    : undefined;

  return c.json({
    hosted: {
      baseDomain: process.env.LANDING_PAGE_PUBLIC_BASE_DOMAIN || null,
      baseUrl: process.env.LANDING_PAGE_PUBLIC_BASE_URL || null,
      urlMode: process.env.LANDING_PAGE_PUBLIC_URL_MODE || (process.env.LANDING_PAGE_PUBLIC_BASE_URL ? 'path' : 'subdomain'),
    },
    wordpress: {
      connected: true,
      siteUrl: wp.siteUrl,
      pages,
      templates,
      menus,
      current: currentWordPressPage
        ? {
          pageId: currentWordPressPage.id,
          parentPageId: currentWordPressPage.parent || null,
          template: currentWordPressPage.template || null,
        }
        : null,
    },
  });
});

landingPagesRouter.get('/:id/publish-history', async (c) => {
  const { userId } = c.get('user');
  const page = await checkPageAccess(c.req.param('id'), userId);
  const deployments = await db.query.landingPageDeployments.findMany({
    where: eq(landingPageDeployments.pageId, page.id),
    orderBy: [desc(landingPageDeployments.createdAt)],
    with: { version: true },
  });

  const history = deployments.map((deployment) => {
    let publicationStatus: 'draft' | 'publish' = 'publish';
    if (deployment.buildLogs) {
      try {
        const metadata = JSON.parse(deployment.buildLogs) as { publicationStatus?: string };
        if (metadata.publicationStatus === 'draft') publicationStatus = 'draft';
      } catch {
        // Older deployment records did not store user-facing metadata.
      }
    }

    const target = deployment.externalProjectId === 'wordpress'
      ? 'wordpress'
      : deployment.provider === 'cloudflare'
        ? 'hosted'
        : deployment.provider;
    const isCurrent = deployment.id === page.deploymentId;

    return {
      id: deployment.id,
      target,
      publicationStatus,
      status: deployment.status,
      isCurrent,
      versionId: deployment.versionId,
      version: deployment.version?.version || null,
      url: isCurrent ? deployment.url : null,
      createdAt: deployment.deployedAt || deployment.createdAt,
      errorMessage: deployment.errorMessage,
    };
  });

  return c.json({ history });
});

landingPagesRouter.get('/:id/publish-history/:versionId/preview', async (c) => {
  const { userId } = c.get('user');
  const pageId = c.req.param('id');
  await checkPageAccess(pageId, userId);

  try {
    const rendered = await pageRendererService.renderVersionToHtml(
      pageId,
      c.req.param('versionId'),
    );
    return c.json({ html: rendered.html });
  } catch (error) {
    return c.json({
      error: {
        message: error instanceof Error ? error.message : 'Could not preview this version.',
      },
    }, 404);
  }
});

/**
 * Publish through one user-facing destination. Provider-specific credentials
 * and deployment details remain behind LandingPagePublisher.
 */
landingPagesRouter.post('/:id/publish', zValidator('json', z.object({
  target: z.enum(['hosted', 'wordpress']),
  subdomain: z.string().min(3).max(60).optional(),
  wordpress: z.object({
    status: z.enum(['draft', 'publish']).default('draft'),
    parentPageId: z.number().int().positive().optional(),
    template: z.string().max(200).optional(),
    menuId: z.number().int().positive().optional(),
  }).optional(),
})), async (c) => {
  const pageId = c.req.param('id');
  const body = c.req.valid('json');
  const { userId } = c.get('user');
  await checkPageAccess(
    pageId,
    userId,
    body.target === 'hosted' || body.wordpress?.status === 'publish'
      ? 'landing_page.publish_direct'
      : 'landing_page.publish_request',
  );

  try {
    const result = await landingPagePublisher.publish({
      pageId,
      userId,
      ...body,
    });
    return c.json({
      success: true,
      publishedUrl: result.url,
      ...result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Publishing failed. Please try again.';
    console.error('[LandingPages] Publishing failed:', err);
    return c.json({ success: false, error: { message } }, 400);
  }
});

/**
 * POST /landing-pages/:id/unpublish
 * Take down a published landing page from its current target
 */
landingPagesRouter.post('/:id/unpublish', async (c) => {
  const pageId = c.req.param('id');
  const { userId } = c.get('user');
  await checkPageAccess(pageId, userId, 'landing_page.publish_direct');

  try {
    await landingPagePublisher.unpublish(pageId);
    return c.json({ success: true, message: 'Page unpublished' });
  } catch (err) {
    return c.json({
      success: false,
      error: {
        message: err instanceof Error ? err.message : 'Could not unpublish. Please try again.',
      },
    }, 500);
  }
});

// SUBDOMAIN PUBLISH APPROVAL (doc 10 §L3 — Đợt 5)
const submitPublishSchema = z.object({
  subdomain: z.string().min(3).max(60).regex(/^[a-z0-9-]+$/, 'lowercase, digits, dash'),
  seo: z.object({ metaTitle: z.string().min(1).max(200), metaDescription: z.string().min(1).max(500), metaKeywords: z.array(z.string()).optional() }),
});

landingPagesRouter.post('/:companyId/:pageId/submit-publish', zValidator('json', submitPublishSchema), async (c) => {
  const { userId } = c.get('user') as { userId: string };
  const { companyId, pageId } = c.req.param() as { companyId: string; pageId: string };
  const body = c.req.valid('json');
  const sub = body.subdomain.toLowerCase();
  await checkCompanyAccess(companyId, userId, 'landing_page.publish_request');
  const page = await db.query.landingPages.findFirst({ where: and(eq(landingPages.id, pageId), eq(landingPages.companyId, companyId)) });
  if (!page) throw new HTTPException(404, { message: 'Page not found' });
  const taken = await db.query.landingPages.findFirst({ where: eq(landingPages.subdomain, sub), columns: { id: true } });
  if (taken && taken.id !== pageId) return c.json({ error: `Subdomain "${sub}" is already taken` }, 409);
  const mergedSeo = { ...(page.seo || {}), title: body.seo.metaTitle, description: body.seo.metaDescription, keywords: body.seo.metaKeywords || [] };
  const [updated] = await db.update(landingPages).set({
    subdomain: sub, seo: mergedSeo as any, publishApprovalStatus: 'pending_approval',
    publishSubmittedAt: new Date(), publishRejectReason: null, updatedAt: new Date(),
  }).where(eq(landingPages.id, pageId)).returning();
  return c.json({ success: true, page: updated });
});

export { landingPagesRouter };
