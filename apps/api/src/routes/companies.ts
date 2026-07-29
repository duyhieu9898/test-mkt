import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq, and, desc, gte, sql, inArray } from 'drizzle-orm';
import { db } from '../lib/db';
import {
  companies,
  companyMembers,
  departments,
  agents,
  tasks,
  actionLogs,
  brandIdentities,
  type BusinessPlan,
} from '@1person/core/db';
import { authMiddleware } from '../middleware/auth';
import { HTTPException } from 'hono/http-exception';
import { nanoid } from 'nanoid';
import { ensureTenantForCompany, getTenantAI } from '../lib/tenant-ai';
import { buildAdvisorContext } from '../services/advisor-context-builder';
import { generateAndSaveCeoBrief } from '../services/ceo-advisor';
import {
  approveGrowthPlanVersion,
  createGrowthPlanVersion,
} from '../services/growth-plan-intelligence';
import { websiteAnalyzerService } from '../services/website-analyzer';
import { authorizeCompanyAccess } from '../lib/company-access';

const companiesRouter = new Hono();

// Apply auth to all routes
companiesRouter.use('*', authMiddleware);

// Schemas
const createCompanySchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().optional(),
  industry: z.string().optional(),
  businessType: z.string().optional(),
  initialBudget: z.number().optional(),
});

const generatePlanSchema = z.object({
  prompt: z.string().min(10),
  targetMarket: z.string().optional(),
  budget: z.number().optional(),
  timeline: z.string().optional(),
});

/**
 * Strip secrets from a company's `settings` before sending to the client.
 * The WordPress Application Password (encrypted at rest) must never leave the
 * server; expose only a boolean "connected" + the site URL.
 */
function sanitizeCompany<T extends { settings?: unknown }>(company: T): T {
  const settings = (company.settings || {}) as Record<string, any>;
  const nextSettings = { ...settings };
  if (settings.wordpress) {
    const { appPassword, ...wpSafe } = settings.wordpress as Record<string, any>;
    nextSettings.wordpress = { ...wpSafe, connected: !!appPassword };
  }
  if (settings.publishing?.customApi?.authHeaderValue) {
    nextSettings.publishing = {
      ...settings.publishing,
      customApi: {
        ...settings.publishing.customApi,
        authHeaderValue: undefined,
        hasAuthHeaderValue: true,
      },
    };
  }
  if (settings.publishing?.github?.token) {
    nextSettings.publishing = {
      ...nextSettings.publishing,
      github: {
        ...settings.publishing.github,
        token: undefined,
        hasToken: true,
      },
    };
  }
  return {
    ...company,
    settings: nextSettings,
  };
}

function isPlainSettingsRecord(value: unknown): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function mergeSettingsPatch(existing: unknown, patch: unknown): unknown {
  if (!isPlainSettingsRecord(patch)) return patch;

  const merged: Record<string, any> = isPlainSettingsRecord(existing) ? { ...existing } : {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (isPlainSettingsRecord(value) && isPlainSettingsRecord(merged[key])) {
      merged[key] = mergeSettingsPatch(merged[key], value);
    } else {
      merged[key] = value;
    }
  }
  return merged;
}

// List companies
companiesRouter.get('/', async (c) => {
  const { userId } = c.get('user');

  const ownedCompanies = await db.query.companies.findMany({
    where: eq(companies.ownerId, userId),
    orderBy: [desc(companies.createdAt)],
  });

  const memberships = await db.query.companyMembers.findMany({
    where: and(eq(companyMembers.userId, userId), eq(companyMembers.status, 'active')),
    columns: { companyId: true },
  });
  const memberCompanyIds = memberships
    .map((membership) => membership.companyId)
    .filter((companyId) => !ownedCompanies.some((company) => company.id === companyId));

  const memberCompanies = memberCompanyIds.length
    ? await db.query.companies.findMany({
      where: inArray(companies.id, memberCompanyIds),
      orderBy: [desc(companies.createdAt)],
    })
    : [];
  const userCompanies = [...ownedCompanies, ...memberCompanies]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return c.json({ data: userCompanies.map(sanitizeCompany) });
});

// Create company
companiesRouter.post('/', zValidator('json', createCompanySchema), async (c) => {
  const { userId } = c.get('user');
  const data = c.req.valid('json');

  // Generate slug
  const slug = data.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    + '-' + nanoid(6);

  const [company] = await db
    .insert(companies)
    .values({
      ownerId: userId,
      name: data.name,
      slug,
      description: data.description,
      industry: data.industry,
      businessType: data.businessType,
      totalBudget: data.initialBudget?.toString() || '0',
    })
    .returning();

  if (!company) {
    throw new HTTPException(500, { message: 'Failed to create company' });
  }

  // Create default departments
  const defaultDepts = [
    { name: 'Executive', color: '#8b5cf6', icon: 'crown' },
    { name: 'Marketing', color: '#3b82f6', icon: 'megaphone' },
    { name: 'Sales', color: '#10b981', icon: 'trending-up' },
    { name: 'Operations', color: '#f59e0b', icon: 'settings' },
  ];

  await db.insert(departments).values(
    defaultDepts.map((dept) => ({
      companyId: company.id,
      ...dept,
    }))
  );

  const tenantId = await ensureTenantForCompany(company.id, company.name);
  await getTenantAI().credits.getOrCreateBalance(tenantId);

  return c.json(company, 201);
});

// Get company
companiesRouter.get('/:id', async (c) => {
  const { userId } = c.get('user');
  const companyId = c.req.param('id');
  await authorizeCompanyAccess(userId, companyId, 'company.view');

  const company = await db.query.companies.findFirst({
    where: eq(companies.id, companyId),
    with: {
      departments: true,
    },
  });

  if (!company) {
    throw new HTTPException(404, { message: 'Company not found' });
  }

  const brand = await db.query.brandIdentities.findFirst({
    where: eq(brandIdentities.companyId, companyId),
    columns: { extractedFromUrl: true },
  });
  const settings = (company.settings ?? {}) as Record<string, any>;
  const knownWebsiteUrl = settings.websiteUrl
    || settings.wordpress?.siteUrl
    || brand?.extractedFromUrl
    || null;
  const websiteOption = settings.websiteOption as string | undefined;

  return c.json({
    ...sanitizeCompany(company),
    websiteProfile: {
      url: knownWebsiteUrl,
      onboardingChoice: websiteOption ?? 'unknown',
      startingFresh: !knownWebsiteUrl && websiteOption !== 'has_website',
    },
  });
});

// Update company
companiesRouter.patch('/:id', async (c) => {
  const { userId } = c.get('user');
  const companyId = c.req.param('id');
  const data = await c.req.json();
  await authorizeCompanyAccess(userId, companyId, 'company.edit');

  // Check ownership
  const existing = await db.query.companies.findFirst({
    where: eq(companies.id, companyId),
  });

  if (!existing) {
    throw new HTTPException(404, { message: 'Company not found' });
  }

  const updateData = { ...data };
  if ('settings' in updateData) {
    updateData.settings = mergeSettingsPatch(existing.settings, updateData.settings);
  }

  const [updated] = await db
    .update(companies)
    .set({
      ...updateData,
      updatedAt: new Date(),
    })
    .where(eq(companies.id, companyId))
    .returning();

  if (!updated) {
    throw new HTTPException(404, { message: 'Company not found' });
  }

  return c.json(sanitizeCompany(updated));
});

companiesRouter.get('/:id/growth-plan/status', async (c) => {
  const { userId } = c.get('user');
  const companyId = c.req.param('id');
  const company = await db.query.companies.findFirst({
    where: and(eq(companies.id, companyId), eq(companies.ownerId, userId)),
  });
  if (!company) throw new HTTPException(404, { message: 'Company not found' });

  const tenantId = await ensureTenantForCompany(company.id, company.name);
  const context = await buildAdvisorContext({ companyId, tenantId });
  return c.json({
    health: context.growthPlanHealth,
    history: ((company.businessPlan as BusinessPlan | null)?.growthPlanHistory ?? [])
      .map((entry) => ({
        version: entry.version,
        generatedAt: entry.generatedAt,
        approvedAt: entry.approvedAt,
        updateReasons: entry.updateReasons ?? [],
      }))
      .reverse(),
  });
});

companiesRouter.post('/:id/growth-plan/refresh', async (c) => {
  const { userId } = c.get('user');
  const companyId = c.req.param('id');
  const company = await db.query.companies.findFirst({
    where: and(eq(companies.id, companyId), eq(companies.ownerId, userId)),
  });
  if (!company) throw new HTTPException(404, { message: 'Company not found' });

  const businessPlan = company.businessPlan as BusinessPlan | null;
  if (!businessPlan) {
    throw new HTTPException(400, {
      message: 'Complete company setup before updating the Growth Plan',
    });
  }

  const tenantId = await ensureTenantForCompany(company.id, company.name);
  const context = await buildAdvisorContext({ companyId, tenantId });
  const updateReasons = ['update_recommended', 'monitor'].includes(context.growthPlanHealth.status)
    ? context.growthPlanHealth.reasons
    : ['Refreshed from the latest company, market, campaign, and Brain Hub data.'];
  const decisionContext = JSON.stringify({
    company: context.business,
    currentGrowthPlanHealth: context.growthPlanHealth,
    campaigns: context.campaigns.slice(0, 12),
    blogs: context.blogs.slice(0, 12),
    landingPages: context.landingPages.slice(0, 8),
    sales: context.sales,
    marketSignals: context.marketSignals.slice(0, 8),
    coverageGaps: context.coverageGaps,
  }, null, 2).slice(0, 18_000);
  const generated = await websiteAnalyzerService.generateMasterPlanFromPrompt(
    company.description || company.name,
    {
      market: company.industry,
      model: company.businessType,
    },
    decisionContext,
    typeof context.business.language === 'string' ? context.business.language : undefined,
  );
  if (generated.usedFallback) {
    throw new HTTPException(502, {
      message: 'AI could not create a reliable Growth Plan update. Your current plan was not changed.',
    });
  }
  const nextBusinessPlan = createGrowthPlanVersion({
    businessPlan,
    plan: generated.masterPlan,
    reasons: updateReasons,
  });

  const [updated] = await db
    .update(companies)
    .set({ businessPlan: nextBusinessPlan, updatedAt: new Date() })
    .where(and(eq(companies.id, companyId), eq(companies.ownerId, userId)))
    .returning();
  if (!updated) throw new HTTPException(404, { message: 'Company not found' });

  return c.json({
    growthPlan: nextBusinessPlan.growthPlanDraft?.plan,
    version: nextBusinessPlan.growthPlanDraft?.version,
    generatedAt: nextBusinessPlan.growthPlanDraft?.generatedAt,
    updateReasons: nextBusinessPlan.growthPlanDraft?.updateReasons,
    status: 'draft',
  });
});

companiesRouter.post('/:id/growth-plan/approve', async (c) => {
  const { userId } = c.get('user');
  const companyId = c.req.param('id');
  const company = await db.query.companies.findFirst({
    where: and(eq(companies.id, companyId), eq(companies.ownerId, userId)),
  });
  if (!company) throw new HTTPException(404, { message: 'Company not found' });

  const businessPlan = company.businessPlan as BusinessPlan | null;
  if (!businessPlan?.growthPlan) {
    throw new HTTPException(400, { message: 'Generate the Growth Plan before approving it' });
  }

  if (businessPlan.growthPlanApprovedAt && !businessPlan.growthPlanDraft) {
    return c.json({
      approvedAt: businessPlan.growthPlanApprovedAt,
      version: businessPlan.growthPlanVersion ?? 1,
      advisorSynced: true,
    });
  }

  const nextBusinessPlan = approveGrowthPlanVersion({ businessPlan });
  const approvedAt = nextBusinessPlan.growthPlanApprovedAt!;
  await db
    .update(companies)
    .set({ businessPlan: nextBusinessPlan, updatedAt: new Date() })
    .where(and(eq(companies.id, companyId), eq(companies.ownerId, userId)));

  let advisorSynced = true;
  try {
    await generateAndSaveCeoBrief({
      companyId,
      companyName: company.name,
      actor: userId,
      chargeCredits: false,
    });
  } catch (error) {
    advisorSynced = false;
    console.warn('[growth-plan.approve] CEO Advisor sync failed:', error);
  }

  return c.json({
    approvedAt,
    version: nextBusinessPlan.growthPlanVersion,
    advisorSynced,
  });
});

// Generate business plan (AI)
companiesRouter.post('/:id/generate-plan', zValidator('json', generatePlanSchema), async (c) => {
  const { userId } = c.get('user');
  const companyId = c.req.param('id');
  const { prompt, targetMarket, budget } = c.req.valid('json');

  // Check ownership
  const company = await db.query.companies.findFirst({
    where: and(eq(companies.id, companyId), eq(companies.ownerId, userId)),
  });

  if (!company) {
    throw new HTTPException(404, { message: 'Company not found' });
  }

  // TODO: Call Claude API to generate business plan
  // For now, return a mock plan
  const businessPlan = {
    vision: `To become the leading ${prompt.split(' ').slice(0, 3).join(' ')} company`,
    mission: 'Deliver exceptional value to our customers through innovation',
    targetAudience: {
      demographics: targetMarket ? [targetMarket] : ['Adults 25-45', 'Tech-savvy professionals'],
      painPoints: ['Time management', 'Quality concerns', 'Price sensitivity'],
    },
    valueProposition: `High-quality solutions for ${prompt}`,
    revenueModel: 'Subscription + Transaction fees',
    competitors: ['Competitor A', 'Competitor B'],
    suggestedAgents: [
      {
        role: 'ceo',
        name: 'CEO Agent',
        responsibilities: ['Strategic planning', 'Budget allocation', 'Team coordination'],
      },
      {
        role: 'marketing_manager',
        name: 'Marketing Manager',
        responsibilities: ['Campaign strategy', 'Brand management', 'Growth initiatives'],
      },
      {
        role: 'content_creator',
        name: 'Content Creator',
        responsibilities: ['Blog posts', 'Social media', 'Marketing copy'],
      },
      {
        role: 'ads_specialist',
        name: 'Ads Specialist',
        responsibilities: ['Ad campaigns', 'Performance optimization', 'A/B testing'],
      },
    ],
  };

  // Update company with plan
  await db
    .update(companies)
    .set({
      businessPlan,
      totalBudget: budget?.toString() || company.totalBudget,
      updatedAt: new Date(),
    })
    .where(eq(companies.id, companyId));

  return c.json({ businessPlan });
});

// Launch company (activate agents)
companiesRouter.post('/:id/launch', async (c) => {
  const { userId } = c.get('user');
  const companyId = c.req.param('id');

  const company = await db.query.companies.findFirst({
    where: and(eq(companies.id, companyId), eq(companies.ownerId, userId)),
  });

  if (!company) {
    throw new HTTPException(404, { message: 'Company not found' });
  }

  if (!company.businessPlan) {
    throw new HTTPException(400, { message: 'Please generate a business plan first' });
  }

  // Update status
  await db
    .update(companies)
    .set({
      status: 'active',
      launchedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(companies.id, companyId));

  // Activate all agents
  await db
    .update(agents)
    .set({ status: 'ready' })
    .where(eq(agents.companyId, companyId));

  return c.json({ success: true, message: 'Company launched successfully' });
});

// Get company stats for analytics
companiesRouter.get('/:id/stats', async (c) => {
  const { userId } = c.get('user');
  const companyId = c.req.param('id');

  const company = await db.query.companies.findFirst({
    where: and(eq(companies.id, companyId), eq(companies.ownerId, userId)),
  });

  if (!company) {
    throw new HTTPException(404, { message: 'Company not found' });
  }

  // Get agents
  const companyAgents = await db.query.agents.findMany({
    where: eq(agents.companyId, companyId),
  });

  // Get tasks
  const companyTasks = await db.query.tasks.findMany({
    where: eq(tasks.companyId, companyId),
  });

  // Get action logs for cost calculation (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const logs = await db.query.actionLogs.findMany({
    where: and(
      eq(actionLogs.companyId, companyId),
      gte(actionLogs.createdAt, thirtyDaysAgo)
    ),
    orderBy: [desc(actionLogs.createdAt)],
  });

  // Calculate metrics
  const activeAgents = companyAgents.filter((a) => a.status === 'running').length;
  const tasksCompleted = companyTasks.filter((t) => t.status === 'completed').length;
  const tasksPending = companyTasks.filter((t) => t.status === 'pending').length;
  const tasksInProgress = companyTasks.filter((t) => t.status === 'in_progress').length;
  const tasksFailed = companyTasks.filter((t) => t.status === 'failed').length;

  // Cost calculations
  const totalCost = logs.reduce((sum, log) => sum + parseFloat(log.cost || '0'), 0);
  const totalTokens = logs.reduce((sum, log) => sum + (log.tokensUsed || 0), 0);
  const promptTokens = logs.reduce((sum, log) => sum + (log.promptTokens || 0), 0);
  const completionTokens = logs.reduce((sum, log) => sum + (log.completionTokens || 0), 0);

  // Daily costs for chart (last 7 days)
  const dailyCosts: { date: string; cost: number; tokens: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0] ?? '';

    const dayLogs = logs.filter((log) => {
      const logDate = new Date(log.createdAt).toISOString().split('T')[0];
      return logDate === dateStr;
    });

    dailyCosts.push({
      date: dateStr,
      cost: dayLogs.reduce((sum, log) => sum + parseFloat(log.cost || '0'), 0),
      tokens: dayLogs.reduce((sum, log) => sum + (log.tokensUsed || 0), 0),
    });
  }

  // Cost by agent
  const costByAgent = companyAgents.map((agent) => {
    const agentLogs = logs.filter((log) => log.agentId === agent.id);
    return {
      agentId: agent.id,
      agentName: agent.name,
      role: agent.role,
      color: agent.color,
      totalCost: agentLogs.reduce((sum, log) => sum + parseFloat(log.cost || '0'), 0),
      totalTokens: agentLogs.reduce((sum, log) => sum + (log.tokensUsed || 0), 0),
      taskCount: agentLogs.filter((log) => log.action === 'execute_task').length,
      budgetLimit: parseFloat(agent.budgetLimit || '0'),
      budgetSpent: parseFloat(agent.budgetSpent || '0'),
    };
  });

  // Budget info
  const budgetUsed = parseFloat(company.budgetSpent || '0') + totalCost;
  const budgetLimit = parseFloat(company.totalBudget || '0');

  return c.json({
    activeAgents,
    totalAgents: companyAgents.length,
    tasksCompleted,
    tasksPending,
    tasksInProgress,
    tasksFailed,
    budgetUsed,
    budgetLimit,
    costs: {
      total: totalCost,
      totalTokens,
      promptTokens,
      completionTokens,
      daily: dailyCosts,
      byAgent: costByAgent,
    },
  });
});

// Get dashboard data
companiesRouter.get('/:id/dashboard', async (c) => {
  const { userId } = c.get('user');
  const companyId = c.req.param('id');

  const company = await db.query.companies.findFirst({
    where: and(eq(companies.id, companyId), eq(companies.ownerId, userId)),
    with: {
      departments: true,
    },
  });

  if (!company) {
    throw new HTTPException(404, { message: 'Company not found' });
  }

  // Get agents
  const companyAgents = await db.query.agents.findMany({
    where: eq(agents.companyId, companyId),
  });

  // Calculate metrics
  const activeAgents = companyAgents.filter((a) => a.status === 'running').length;
  const totalTasks = companyAgents.reduce((sum, a) => sum + (a.tasksCompleted || 0), 0);
  const budgetUsed = parseFloat(company.budgetSpent || '0');
  const budgetTotal = parseFloat(company.totalBudget || '0');

  return c.json({
    company,
    metrics: {
      activeAgents,
      totalAgents: companyAgents.length,
      tasksCompleted: totalTasks,
      budgetUsed,
      budgetTotal,
      budgetUtilization: budgetTotal > 0 ? (budgetUsed / budgetTotal) * 100 : 0,
    },
    agents: companyAgents,
  });
});

export default companiesRouter;
