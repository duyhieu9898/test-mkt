/**
 * AI Engines API Routes
 *
 * Exposes the marketing AI engines via REST API:
 * - Market Intelligence
 * - Content Research
 * - Content Planning
 * - Optimization
 * - Agent Execution
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { HTTPException } from 'hono/http-exception';
import { authMiddleware, getUserCompanies } from '../middleware/auth';
import {
  marketIntelligenceEngine,
  contentResearchEngine,
  contentPlanningEngine,
  optimizationEngine,
  agentExecutionLoop,
  seoContentFactory,
  landingPageSEOEngine,
  landingPageDeploymentEngine,
  seoRankingFeedbackEngine,
} from '../services/engines';

const enginesRouter = new Hono();

// Apply auth middleware
enginesRouter.use('*', authMiddleware);

// Helper to verify company access
async function verifyCompanyAccess(userId: string, companyId: string): Promise<boolean> {
  const userCompanies = await getUserCompanies(userId);
  return userCompanies.some((co: { id: string }) => co.id === companyId);
}

// ============================================
// MARKET INTELLIGENCE
// ============================================

// Full market analysis
enginesRouter.get('/company/:companyId/market-intelligence', async (c) => {
  const companyId = c.req.param('companyId');
  const { userId } = c.get('user');

  if (!(await verifyCompanyAccess(userId, companyId))) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  const report = await marketIntelligenceEngine.analyzeMarket(companyId);

  return c.json({
    success: true,
    data: report,
  });
});

// Competitor analysis
enginesRouter.get('/company/:companyId/competitors', async (c) => {
  const companyId = c.req.param('companyId');
  const { userId } = c.get('user');

  if (!(await verifyCompanyAccess(userId, companyId))) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  const competitors = await marketIntelligenceEngine.analyzeCompetitors(companyId);

  return c.json({
    success: true,
    data: competitors,
  });
});

// Trends discovery
enginesRouter.get('/company/:companyId/trends', async (c) => {
  const companyId = c.req.param('companyId');
  const { userId } = c.get('user');

  if (!(await verifyCompanyAccess(userId, companyId))) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  const trends = await marketIntelligenceEngine.discoverTrends(companyId);

  return c.json({
    success: true,
    data: trends,
  });
});

// Pain points
enginesRouter.get('/company/:companyId/pain-points', async (c) => {
  const companyId = c.req.param('companyId');
  const { userId } = c.get('user');

  if (!(await verifyCompanyAccess(userId, companyId))) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  const painPoints = await marketIntelligenceEngine.identifyPainPoints(companyId);

  return c.json({
    success: true,
    data: painPoints,
  });
});

// Keywords
enginesRouter.get('/company/:companyId/keywords', async (c) => {
  const companyId = c.req.param('companyId');
  const { userId } = c.get('user');

  if (!(await verifyCompanyAccess(userId, companyId))) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  const keywords = await marketIntelligenceEngine.discoverKeywords(companyId);

  return c.json({
    success: true,
    data: keywords,
  });
});

// ============================================
// CONTENT RESEARCH
// ============================================

// Full content research
enginesRouter.get('/company/:companyId/content-research', async (c) => {
  const companyId = c.req.param('companyId');
  const { userId } = c.get('user');

  if (!(await verifyCompanyAccess(userId, companyId))) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  const research = await contentResearchEngine.research(companyId);

  return c.json({
    success: true,
    data: research,
  });
});

// Quick research for a topic
const quickResearchSchema = z.object({
  topic: z.string().min(1),
});

enginesRouter.post(
  '/company/:companyId/quick-research',
  zValidator('json', quickResearchSchema),
  async (c) => {
    const companyId = c.req.param('companyId');
    const { userId } = c.get('user');
    const { topic } = c.req.valid('json');

    if (!(await verifyCompanyAccess(userId, companyId))) {
      throw new HTTPException(403, { message: 'Access denied' });
    }

    const topics = await contentResearchEngine.quickResearch(companyId, topic);

    return c.json({
      success: true,
      data: topics,
    });
  }
);

// Generate content brief
const briefSchema = z.object({
  topic: z.object({
    id: z.string(),
    title: z.string(),
    description: z.string(),
    audience: z.string(),
    contentType: z.string(),
    channel: z.string(),
    priorityScore: z.number(),
    estimatedImpact: z.string(),
    suggestedFormat: z.string(),
    hooks: z.array(z.string()),
    callToAction: z.string(),
  }),
});

enginesRouter.post(
  '/company/:companyId/content-brief',
  zValidator('json', briefSchema),
  async (c) => {
    const companyId = c.req.param('companyId');
    const { userId } = c.get('user');
    const { topic } = c.req.valid('json');

    if (!(await verifyCompanyAccess(userId, companyId))) {
      throw new HTTPException(403, { message: 'Access denied' });
    }

    const brief = await contentResearchEngine.generateContentBrief(companyId, topic as any);

    return c.json({
      success: true,
      data: brief,
    });
  }
);

// ============================================
// CONTENT PLANNING
// ============================================

// Generate weekly calendar
const calendarSchema = z.object({
  weekStart: z.string().optional(),
  postsPerDay: z.number().min(1).max(5).optional(),
  channels: z.array(z.string()).optional(),
  focusTopics: z.array(z.string()).optional(),
});

enginesRouter.post(
  '/company/:companyId/content-calendar',
  zValidator('json', calendarSchema),
  async (c) => {
    const companyId = c.req.param('companyId');
    const { userId } = c.get('user');
    const body = c.req.valid('json');

    if (!(await verifyCompanyAccess(userId, companyId))) {
      throw new HTTPException(403, { message: 'Access denied' });
    }

    const calendar = await contentPlanningEngine.generateWeeklyCalendar(companyId, {
      weekStart: body.weekStart ? new Date(body.weekStart) : undefined,
      postsPerDay: body.postsPerDay,
      channels: body.channels,
      focusTopics: body.focusTopics,
    });

    return c.json({
      success: true,
      data: calendar,
    });
  }
);

// Create campaign plan
const campaignSchema = z.object({
  name: z.string().min(1),
  objective: z.string().min(1),
  durationDays: z.number().min(1).max(90),
  channels: z.array(z.string()),
  targetAudience: z.string(),
  budget: z.number().optional(),
});

enginesRouter.post(
  '/company/:companyId/campaign-plan',
  zValidator('json', campaignSchema),
  async (c) => {
    const companyId = c.req.param('companyId');
    const { userId } = c.get('user');
    const body = c.req.valid('json');

    if (!(await verifyCompanyAccess(userId, companyId))) {
      throw new HTTPException(403, { message: 'Access denied' });
    }

    const plan = await contentPlanningEngine.createCampaignPlan(companyId, {
      name: body.name,
      objective: body.objective,
      durationDays: body.durationDays,
      channels: body.channels,
      targetAudience: body.targetAudience,
      budget: body.budget,
    });

    return c.json({
      success: true,
      data: plan,
    });
  }
);

// ============================================
// OPTIMIZATION
// ============================================

// Get optimization report
enginesRouter.get('/company/:companyId/optimization', async (c) => {
  const companyId = c.req.param('companyId');
  const { userId } = c.get('user');
  const periodDays = parseInt(c.req.query('periodDays') || '7');

  if (!(await verifyCompanyAccess(userId, companyId))) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  const report = await optimizationEngine.analyze(companyId, { periodDays });

  return c.json({
    success: true,
    data: report,
  });
});

// Run auto-optimization
enginesRouter.post('/company/:companyId/auto-optimize', async (c) => {
  const companyId = c.req.param('companyId');
  const { userId } = c.get('user');

  if (!(await verifyCompanyAccess(userId, companyId))) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  const result = await optimizationEngine.autoOptimize(companyId);

  return c.json({
    success: true,
    data: result,
  });
});

// Get best posting times
enginesRouter.get('/company/:companyId/best-posting-times', async (c) => {
  const companyId = c.req.param('companyId');
  const { userId } = c.get('user');

  if (!(await verifyCompanyAccess(userId, companyId))) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  const times = await optimizationEngine.getBestPostingTimes(companyId);

  return c.json({
    success: true,
    data: times,
  });
});

// ============================================
// AGENT EXECUTION
// ============================================

// Trigger full marketing workflow
const workflowSchema = z.object({
  agentId: z.string().uuid().optional(),
  campaignName: z.string().optional(),
  topicFocus: z.string().optional(),
});

enginesRouter.post(
  '/company/:companyId/run-workflow',
  zValidator('json', workflowSchema),
  async (c) => {
    const companyId = c.req.param('companyId');
    const { userId } = c.get('user');
    const body = c.req.valid('json');

    if (!(await verifyCompanyAccess(userId, companyId))) {
      throw new HTTPException(403, { message: 'Access denied' });
    }

    const result = await agentExecutionLoop.triggerWorkflow(companyId, body);

    return c.json({
      success: result.success,
      data: {
        executionId: result.executionId,
        steps: result.steps,
        outputs: result.outputs,
        duration: result.totalDuration,
      },
      error: result.error,
    });
  }
);

// Run optimization cycle
enginesRouter.post('/company/:companyId/run-optimization-cycle', async (c) => {
  const companyId = c.req.param('companyId');
  const { userId } = c.get('user');

  if (!(await verifyCompanyAccess(userId, companyId))) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  await agentExecutionLoop.runOptimizationCycle(companyId);

  return c.json({
    success: true,
    message: 'Optimization cycle completed',
  });
});

// Process due posts (for manual trigger)
enginesRouter.post('/process-due-posts', async (c) => {
  const published = await agentExecutionLoop.processDuePosts();

  return c.json({
    success: true,
    data: { published },
  });
});

// ============================================
// SEO CONTENT FACTORY
// ============================================

// Generate SEO content for a keyword
const seoContentSchema = z.object({
  keyword: z.string().min(1),
  intent: z.enum(['informational', 'commercial', 'transactional', 'navigational']).optional(),
  audience: z.string().optional(),
  competitors: z.array(z.string()).optional(),
});

enginesRouter.post(
  '/company/:companyId/seo-content/generate',
  zValidator('json', seoContentSchema),
  async (c) => {
    const companyId = c.req.param('companyId');
    const { userId } = c.get('user');
    const body = c.req.valid('json');

    if (!(await verifyCompanyAccess(userId, companyId))) {
      throw new HTTPException(403, { message: 'Access denied' });
    }

    const intent = body.intent || seoContentFactory.detectIntent(body.keyword);

    const content = await seoContentFactory.generateSEOContent(companyId, {
      keyword: body.keyword,
      intent,
      audience: body.audience || 'Business professionals',
      competitors: body.competitors,
    });

    return c.json({
      success: true,
      data: content,
    });
  }
);

// Run SEO factory for multiple keywords
const seoFactorySchema = z.object({
  keywords: z.array(z.object({
    keyword: z.string(),
    intent: z.enum(['informational', 'commercial', 'transactional', 'navigational']).optional(),
  })).optional(),
  maxKeywords: z.number().min(1).max(50).optional(),
  contentTypes: z.array(z.enum(['landing_page', 'blog_post', 'comparison', 'listicle'])).optional(),
});

enginesRouter.post(
  '/company/:companyId/seo-factory/run',
  zValidator('json', seoFactorySchema),
  async (c) => {
    const companyId = c.req.param('companyId');
    const { userId } = c.get('user');
    const body = c.req.valid('json');

    if (!(await verifyCompanyAccess(userId, companyId))) {
      throw new HTTPException(403, { message: 'Access denied' });
    }

    const result = await seoContentFactory.runFactory(companyId, {
      keywords: body.keywords?.map(k => ({
        keyword: k.keyword,
        intent: k.intent || seoContentFactory.detectIntent(k.keyword),
      })),
      maxKeywords: body.maxKeywords,
      contentTypes: body.contentTypes,
    });

    return c.json({
      success: true,
      data: result,
    });
  }
);

// Get content cluster suggestions
enginesRouter.get('/company/:companyId/seo-content/cluster/:pillarKeyword', async (c) => {
  const companyId = c.req.param('companyId');
  const pillarKeyword = c.req.param('pillarKeyword');
  const { userId } = c.get('user');

  if (!(await verifyCompanyAccess(userId, companyId))) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  const cluster = await seoContentFactory.suggestContentCluster(companyId, pillarKeyword);

  return c.json({
    success: true,
    data: cluster,
  });
});

// Build internal links
enginesRouter.post('/company/:companyId/seo-content/build-links', async (c) => {
  const companyId = c.req.param('companyId');
  const { userId } = c.get('user');

  if (!(await verifyCompanyAccess(userId, companyId))) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  const links = await seoContentFactory.buildInternalLinks(companyId);

  return c.json({
    success: true,
    data: { links },
  });
});

// ============================================
// LANDING PAGE SEO ENGINE
// ============================================

// Check SEO health of content
const seoHealthSchema = z.object({
  content: z.object({
    id: z.string(),
    keyword: z.string(),
    intent: z.enum(['informational', 'commercial', 'transactional', 'navigational']),
    contentType: z.enum(['landing_page', 'blog_post', 'comparison', 'listicle']),
    title: z.string(),
    metaDescription: z.string(),
    slug: z.string(),
    headings: z.array(z.string()),
    content: z.string(),
    wordCount: z.number(),
    faq: z.array(z.object({
      question: z.string(),
      answer: z.string(),
    })),
    internalLinks: z.array(z.string()),
    suggestedLinks: z.array(z.object({
      text: z.string(),
      targetKeyword: z.string(),
    })),
    schemaMarkup: z.record(z.unknown()),
    generatedAt: z.string(),
    status: z.enum(['draft', 'ready', 'published']),
  }),
});

enginesRouter.post(
  '/company/:companyId/seo/health-check',
  zValidator('json', seoHealthSchema),
  async (c) => {
    const companyId = c.req.param('companyId');
    const { userId } = c.get('user');
    const { content } = c.req.valid('json');

    if (!(await verifyCompanyAccess(userId, companyId))) {
      throw new HTTPException(403, { message: 'Access denied' });
    }

    const health = await landingPageSEOEngine.checkSEOHealth({
      ...content,
      generatedAt: new Date(content.generatedAt),
    });

    return c.json({
      success: true,
      data: health,
    });
  }
);

// Generate sitemap
enginesRouter.get('/company/:companyId/seo/sitemap', async (c) => {
  const companyId = c.req.param('companyId');
  const { userId } = c.get('user');

  if (!(await verifyCompanyAccess(userId, companyId))) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  const baseUrl = `https://${companyId}.1person.ai`;
  const sitemap = await landingPageSEOEngine.generateSitemap(companyId, baseUrl);

  c.header('Content-Type', 'application/xml');
  return c.body(sitemap);
});

// Generate robots.txt
enginesRouter.get('/company/:companyId/seo/robots.txt', async (c) => {
  const companyId = c.req.param('companyId');
  const { userId } = c.get('user');

  if (!(await verifyCompanyAccess(userId, companyId))) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  const baseUrl = `https://${companyId}.1person.ai`;
  const robotsTxt = landingPageSEOEngine.generateRobotsTxt(baseUrl);

  c.header('Content-Type', 'text/plain');
  return c.body(robotsTxt);
});

// ============================================
// LANDING PAGE DEPLOYMENT
// ============================================

// Deploy SEO content as landing page
const deploySchema = z.object({
  keyword: z.string().min(1),
  intent: z.enum(['informational', 'commercial', 'transactional', 'navigational']).optional(),
  audience: z.string().optional(),
  customDomain: z.string().optional(),
  publishImmediately: z.boolean().optional(),
});

enginesRouter.post(
  '/company/:companyId/seo/deploy',
  zValidator('json', deploySchema),
  async (c) => {
    const companyId = c.req.param('companyId');
    const { userId } = c.get('user');
    const body = c.req.valid('json');

    if (!(await verifyCompanyAccess(userId, companyId))) {
      throw new HTTPException(403, { message: 'Access denied' });
    }

    // Generate SEO content
    const intent = body.intent || seoContentFactory.detectIntent(body.keyword);
    const content = await seoContentFactory.generateSEOContent(companyId, {
      keyword: body.keyword,
      intent,
      audience: body.audience || 'Business professionals',
    });

    // Deploy
    const result = await landingPageDeploymentEngine.fullDeploymentPipeline(
      companyId,
      content,
      {
        customDomain: body.customDomain,
        publishImmediately: body.publishImmediately ?? true,
      }
    );

    return c.json({
      success: result.success,
      data: result,
    });
  }
);

// Batch deploy multiple keywords
const batchDeploySchema = z.object({
  keywords: z.array(z.string()).min(1).max(20),
  customDomain: z.string().optional(),
  concurrency: z.number().min(1).max(5).optional(),
});

enginesRouter.post(
  '/company/:companyId/seo/deploy-batch',
  zValidator('json', batchDeploySchema),
  async (c) => {
    const companyId = c.req.param('companyId');
    const { userId } = c.get('user');
    const body = c.req.valid('json');

    if (!(await verifyCompanyAccess(userId, companyId))) {
      throw new HTTPException(403, { message: 'Access denied' });
    }

    // Generate content for all keywords
    const contents = [];
    for (const keyword of body.keywords) {
      const intent = seoContentFactory.detectIntent(keyword);
      const content = await seoContentFactory.generateSEOContent(companyId, {
        keyword,
        intent,
        audience: 'Business professionals',
      });
      contents.push(content);
    }

    // Batch deploy
    const result = await landingPageDeploymentEngine.batchDeploy(
      companyId,
      contents,
      {
        customDomain: body.customDomain,
        concurrency: body.concurrency,
      }
    );

    return c.json({
      success: true,
      data: result,
    });
  }
);

// Get deployment status
enginesRouter.get('/company/:companyId/seo/deployment/:pageId', async (c) => {
  const companyId = c.req.param('companyId');
  const pageId = c.req.param('pageId');
  const { userId } = c.get('user');

  if (!(await verifyCompanyAccess(userId, companyId))) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  const status = await landingPageDeploymentEngine.getDeploymentStatus(pageId);

  return c.json({
    success: true,
    data: status,
  });
});

// Configure custom domain
const domainSchema = z.object({
  domain: z.string().min(1),
});

enginesRouter.post(
  '/company/:companyId/seo/domain/configure',
  zValidator('json', domainSchema),
  async (c) => {
    const companyId = c.req.param('companyId');
    const { userId } = c.get('user');
    const { domain } = c.req.valid('json');

    if (!(await verifyCompanyAccess(userId, companyId))) {
      throw new HTTPException(403, { message: 'Access denied' });
    }

    const config = await landingPageDeploymentEngine.configureCustomDomain(companyId, domain);

    return c.json({
      success: true,
      data: config,
    });
  }
);

// Unpublish page
enginesRouter.post('/company/:companyId/seo/unpublish/:pageId', async (c) => {
  const companyId = c.req.param('companyId');
  const pageId = c.req.param('pageId');
  const { userId } = c.get('user');

  if (!(await verifyCompanyAccess(userId, companyId))) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  await landingPageDeploymentEngine.unpublishPage(pageId);

  return c.json({
    success: true,
    message: 'Page unpublished',
  });
});

// ============================================
// SEO RANKING FEEDBACK ENGINE
// ============================================

// Get ranking report
enginesRouter.get('/company/:companyId/seo/ranking-report', async (c) => {
  const companyId = c.req.param('companyId');
  const { userId } = c.get('user');

  if (!(await verifyCompanyAccess(userId, companyId))) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  const report = await seoRankingFeedbackEngine.getRankingReport(companyId);

  return c.json({
    success: true,
    data: report,
  });
});

// Run feedback loop manually
enginesRouter.post('/company/:companyId/seo/feedback-loop/run', async (c) => {
  const companyId = c.req.param('companyId');
  const { userId } = c.get('user');

  if (!(await verifyCompanyAccess(userId, companyId))) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  const result = await seoRankingFeedbackEngine.runCompanyFeedbackLoop(companyId);

  return c.json({
    success: true,
    data: result,
  });
});

// Optimize specific page
enginesRouter.post('/company/:companyId/seo/optimize-page/:pageId', async (c) => {
  const companyId = c.req.param('companyId');
  const pageId = c.req.param('pageId');
  const { userId } = c.get('user');

  if (!(await verifyCompanyAccess(userId, companyId))) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  const action = await seoRankingFeedbackEngine.optimizePage(companyId, pageId);

  return c.json({
    success: true,
    data: {
      optimized: action !== null,
      action,
    },
  });
});

export default enginesRouter;
