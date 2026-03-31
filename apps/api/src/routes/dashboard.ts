/**
 * Dashboard API Routes
 *
 * Provides unified dashboard data for the AI Growth Engine Control Center.
 * Aggregates data from all layers of the workflow.
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { HTTPException } from 'hono/http-exception';
import { authMiddleware, getUserCompanies } from '../middleware/auth';
import { dashboardService } from '../services/dashboard-service';

const dashboardRouter = new Hono();

// Apply auth middleware
dashboardRouter.use('*', authMiddleware);

// Helper to verify company access
async function verifyCompanyAccess(userId: string, companyId: string): Promise<boolean> {
  const userCompanies = await getUserCompanies(userId);
  return userCompanies.some((co: { id: string }) => co.id === companyId);
}

// ============================================
// DASHBOARD OVERVIEW
// ============================================

/**
 * Get full dashboard overview
 * This is the main endpoint for the dashboard UI
 */
dashboardRouter.get('/company/:companyId/overview', async (c) => {
  const companyId = c.req.param('companyId');
  const { userId } = c.get('user');

  if (!(await verifyCompanyAccess(userId, companyId))) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  const overview = await dashboardService.getDashboardOverview(companyId);

  return c.json({
    success: true,
    data: overview,
  });
});

// ============================================
// PIPELINE STATUS
// ============================================

/**
 * Get pipeline status only (lightweight)
 */
dashboardRouter.get('/company/:companyId/pipeline', async (c) => {
  const companyId = c.req.param('companyId');
  const { userId } = c.get('user');

  if (!(await verifyCompanyAccess(userId, companyId))) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  const overview = await dashboardService.getDashboardOverview(companyId);

  return c.json({
    success: true,
    data: overview.pipeline,
  });
});

// ============================================
// AGENT STATUS
// ============================================

/**
 * Get agent statuses only
 */
dashboardRouter.get('/company/:companyId/agents-status', async (c) => {
  const companyId = c.req.param('companyId');
  const { userId } = c.get('user');

  if (!(await verifyCompanyAccess(userId, companyId))) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  const overview = await dashboardService.getDashboardOverview(companyId);

  return c.json({
    success: true,
    data: overview.agents,
  });
});

// ============================================
// ACTIVITY LOG
// ============================================

/**
 * Get activity log
 */
dashboardRouter.get('/company/:companyId/activity', async (c) => {
  const companyId = c.req.param('companyId');
  const { userId } = c.get('user');
  const limit = parseInt(c.req.query('limit') || '20');

  if (!(await verifyCompanyAccess(userId, companyId))) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  const logs = dashboardService.getActivityLogs(companyId, limit);

  return c.json({
    success: true,
    data: logs,
  });
});

/**
 * Add activity log entry (internal use)
 */
const logActivitySchema = z.object({
  type: z.enum(['deploy', 'optimize', 'rank_change', 'generate', 'intel', 'agent', 'error']),
  level: z.enum(['info', 'success', 'warning', 'error']),
  message: z.string(),
  metadata: z.record(z.unknown()).optional(),
});

dashboardRouter.post(
  '/company/:companyId/activity',
  zValidator('json', logActivitySchema),
  async (c) => {
    const companyId = c.req.param('companyId');
    const { userId } = c.get('user');
    const body = c.req.valid('json');

    if (!(await verifyCompanyAccess(userId, companyId))) {
      throw new HTTPException(403, { message: 'Access denied' });
    }

    dashboardService.logActivity(companyId, body);

    return c.json({
      success: true,
      message: 'Activity logged',
    });
  }
);

// ============================================
// INTELLIGENCE DATA
// ============================================

/**
 * Get intelligence layer data
 */
dashboardRouter.get('/company/:companyId/intelligence', async (c) => {
  const companyId = c.req.param('companyId');
  const { userId } = c.get('user');

  if (!(await verifyCompanyAccess(userId, companyId))) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  const intelligence = await dashboardService.getIntelligenceData(companyId);

  return c.json({
    success: true,
    data: intelligence,
  });
});

// ============================================
// CONTENT PIPELINE
// ============================================

/**
 * Get content pipeline status
 */
dashboardRouter.get('/company/:companyId/content-pipeline', async (c) => {
  const companyId = c.req.param('companyId');
  const { userId } = c.get('user');

  if (!(await verifyCompanyAccess(userId, companyId))) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  const overview = await dashboardService.getDashboardOverview(companyId);

  return c.json({
    success: true,
    data: overview.contentPipeline,
  });
});

// ============================================
// QUICK STATS
// ============================================

/**
 * Get quick stats only (very lightweight)
 */
dashboardRouter.get('/company/:companyId/quick-stats', async (c) => {
  const companyId = c.req.param('companyId');
  const { userId } = c.get('user');

  if (!(await verifyCompanyAccess(userId, companyId))) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  const overview = await dashboardService.getDashboardOverview(companyId);

  return c.json({
    success: true,
    data: overview.quickStats,
  });
});

// ============================================
// OPTIMIZATION LOOP
// ============================================

/**
 * Get optimization loop status
 */
dashboardRouter.get('/company/:companyId/optimization-loop', async (c) => {
  const companyId = c.req.param('companyId');
  const { userId } = c.get('user');

  if (!(await verifyCompanyAccess(userId, companyId))) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  const overview = await dashboardService.getDashboardOverview(companyId);

  return c.json({
    success: true,
    data: overview.optimizationLoop,
  });
});

// ============================================
// GROWTH BRAIN — Show AI decisions + trigger analysis
// ============================================

dashboardRouter.get('/company/:companyId/growth-brain', async (c) => {
  const companyId = c.req.param('companyId');

  // Load recent Growth Brain decisions from memory
  const { db } = await import('../lib/db');
  const { knowledgeBase, agentMemories, tasks, landingPages } = await import('@1person/core/db');
  const { eq, desc, and } = await import('drizzle-orm');

  // Recent decisions (from feedback evaluations)
  const decisions = await db.select()
    .from(agentMemories)
    .where(and(eq(agentMemories.companyId, companyId), eq(agentMemories.type, 'feedback')))
    .orderBy(desc(agentMemories.createdAt))
    .limit(10);

  // Performance data
  const perfData = await db.select()
    .from(knowledgeBase)
    .where(and(eq(knowledgeBase.companyId, companyId), eq(knowledgeBase.category, 'performance_data')))
    .orderBy(desc(knowledgeBase.updatedAt))
    .limit(5);

  // Winning patterns
  const winners = await db.select()
    .from(knowledgeBase)
    .where(and(eq(knowledgeBase.companyId, companyId), eq(knowledgeBase.category, 'winning_patterns')))
    .orderBy(desc(knowledgeBase.updatedAt))
    .limit(3);

  // Failed strategies
  const failures = await db.select()
    .from(knowledgeBase)
    .where(and(eq(knowledgeBase.companyId, companyId), eq(knowledgeBase.category, 'failed_strategies')))
    .orderBy(desc(knowledgeBase.updatedAt))
    .limit(3);

  // Pending optimization tasks (created by Growth Brain)
  const pendingTasks = await db.select()
    .from(tasks)
    .where(and(eq(tasks.companyId, companyId), eq(tasks.status, 'pending')))
    .orderBy(desc(tasks.createdAt))
    .limit(10);

  // Page stats
  const pages = await db.select()
    .from(landingPages)
    .where(eq(landingPages.companyId, companyId));

  return c.json({
    decisions: decisions.map((d) => ({
      id: d.id,
      title: d.title,
      content: d.content,
      createdAt: d.createdAt,
    })),
    performance: perfData.map((p) => ({
      title: p.title,
      content: p.content,
      date: p.updatedAt,
    })),
    winningPatterns: winners.map((w) => ({ title: w.title, content: w.content })),
    failedStrategies: failures.map((f) => ({ title: f.title, content: f.content })),
    pendingTasks: pendingTasks.map((t) => ({ id: t.id, title: t.title, type: t.type, priority: t.priority })),
    pageStats: {
      total: pages.length,
      published: pages.filter((p) => p.status === 'published').length,
      draft: pages.filter((p) => p.status === 'draft').length,
      ready: pages.filter((p) => p.status === 'ready').length,
    },
  });
});

// Trigger Growth Brain analysis manually
dashboardRouter.post('/company/:companyId/growth-brain/run', async (c) => {
  const companyId = c.req.param('companyId');

  try {
    const { performanceTracker } = await import('../services/performance-tracker');
    const { growthBrain } = await import('../agents/growth-brain');

    const performance = await performanceTracker.collectPerformance(companyId);
    const decisions = await growthBrain.analyze(companyId, performance.pages);

    return c.json({
      decisionsCreated: decisions.length,
      decisions: decisions.map((d) => ({ action: d.action, priority: d.priority, reason: d.reason })),
    });
  } catch (err) {
    return c.json({ decisionsCreated: 0, error: 'Analysis failed' });
  }
});

// Trigger Intelligence Engine for deep strategic thinking
dashboardRouter.post('/company/:companyId/growth-brain/think', async (c) => {
  const companyId = c.req.param('companyId');
  const body = await c.req.json().catch(() => ({}));
  const goal = (body as any).goal || 'Analyze performance and create comprehensive growth strategy';

  try {
    const { intelligenceEngine } = await import('../intelligence/engine');
    const plan = await intelligenceEngine.think(companyId, goal);

    return c.json({
      success: true,
      tasksCreated: plan.tasks.length,
      reasoning: plan.reasoning.substring(0, 500),
      research: plan.research,
      strategy: plan.strategy,
      reflection: plan.reflection,
      tasks: plan.tasks.map((t) => ({ title: t.title, type: t.type, priority: t.priority, reason: t.reason })),
      toolCalls: plan.toolCalls.map((t) => ({ tool: t.tool, dataSource: t.dataSource, timestamp: t.timestamp })),
    });
  } catch (err) {
    return c.json({ success: false, error: 'Intelligence Engine failed' });
  }
});

// Revenue Attribution — real campaign/channel revenue data
dashboardRouter.get('/company/:companyId/revenue-attribution', async (c) => {
  const companyId = c.req.param('companyId');
  const { userId } = c.get('user');
  const startDate = c.req.query('startDate');
  const endDate = c.req.query('endDate');

  if (!(await verifyCompanyAccess(userId, companyId))) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  try {
    const { attributionService } = await import('../services/attribution');
    const dateRange = (startDate || endDate)
      ? {
          from: startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          to: endDate ? new Date(endDate) : new Date(),
        }
      : undefined;

    const report = await attributionService.getRevenueAttribution(companyId, dateRange);
    return c.json({ success: true, data: report });
  } catch (err) {
    return c.json({ success: false, data: null, error: 'Revenue attribution failed' });
  }
});

// ============================================
// SETUP STATUS — onboarding progress tracker
// ============================================

dashboardRouter.get('/company/:companyId/setup-status', async (c) => {
  const companyId = c.req.param('companyId');
  const { userId } = c.get('user');

  if (!(await verifyCompanyAccess(userId, companyId))) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  const { db } = await import('../lib/db');
  const { companies } = await import('@1person/core/db');
  const { eq, sql } = await import('drizzle-orm');

  // Check each setup step dynamically
  const steps = [];

  // 1. Business analyzed — has knowledge_base entries
  const kbCount = await db.execute(sql`SELECT COUNT(*)::int as count FROM knowledge_base WHERE company_id = ${companyId}`);
  const hasKnowledge = ((kbCount as any)[0]?.count || 0) > 0;
  steps.push({ id: 'business', label: 'Business analyzed', completed: hasKnowledge, action: `/${companyId}/knowledge` });

  // 2. Landing pages created
  const pageCount = await db.execute(sql`SELECT COUNT(*)::int as count FROM landing_pages WHERE company_id = ${companyId}`);
  const hasPages = ((pageCount as any)[0]?.count || 0) > 0;
  steps.push({ id: 'pages', label: 'Landing pages created', completed: hasPages, action: `/${companyId}/landing-pages` });

  // 3. WordPress connected
  const company = await db.query.companies.findFirst({ where: eq(companies.id, companyId) });
  const wpConnected = !!(company?.settings as any)?.wordpress?.siteUrl;
  steps.push({ id: 'wordpress', label: 'WordPress connected', completed: wpConnected, action: `/${companyId}/seo-engine` });

  // 4. Google Search Console
  const gscEntry = await db.execute(sql`SELECT COUNT(*)::int as count FROM knowledge_base WHERE company_id = ${companyId} AND category = 'integration_google'`);
  const hasGSC = ((gscEntry as any)[0]?.count || 0) > 0;
  steps.push({ id: 'gsc', label: 'Google Search Console connected', completed: hasGSC, action: `/${companyId}/settings` });

  // 5. Assets uploaded
  let hasAssets = false;
  try {
    const assetCount = await db.execute(sql`SELECT COUNT(*)::int as count FROM asset_library WHERE company_id = ${companyId}`);
    hasAssets = ((assetCount as any)[0]?.count || 0) > 0;
  } catch {} // table might not exist
  steps.push({ id: 'assets', label: 'Brand assets uploaded', completed: hasAssets, action: `/${companyId}/assets` });

  // 6. First blog published
  let hasBlog = false;
  try {
    const blogCount = await db.execute(sql`SELECT COUNT(*)::int as count FROM blog_posts WHERE company_id = ${companyId} AND (status = 'pushed_to_cms' OR cms_post_url IS NOT NULL)`);
    hasBlog = ((blogCount as any)[0]?.count || 0) > 0;
  } catch {} // table might not exist
  steps.push({ id: 'blog', label: 'First blog published', completed: hasBlog, action: `/${companyId}/seo-engine` });

  const completedCount = steps.filter(s => s.completed).length;
  const nextStep = steps.find(s => !s.completed);

  return c.json({
    steps,
    completedCount,
    totalCount: steps.length,
    percentage: Math.round((completedCount / steps.length) * 100),
    nextStep: nextStep || null,
    allComplete: completedCount === steps.length,
  });
});

// Revenue Brain — profit-driven analysis
dashboardRouter.get('/company/:companyId/revenue', async (c) => {
  const companyId = c.req.param('companyId');
  try {
    const { revenueBrain } = await import('../intelligence/revenue-brain');
    const { snapshot, decisions } = await revenueBrain.analyze(companyId);
    return c.json({ snapshot, decisions });
  } catch (err) {
    return c.json({ snapshot: null, decisions: [], error: 'Revenue analysis failed' });
  }
});

export default dashboardRouter;
