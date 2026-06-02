import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq, and, desc, gte, sql } from 'drizzle-orm';
import { db } from '../lib/db';
import { companies, departments, agents, tasks, actionLogs } from '@1person/core/db';
import { authMiddleware } from '../middleware/auth';
import { HTTPException } from 'hono/http-exception';
import { nanoid } from 'nanoid';

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
  if (!settings.wordpress) return company;
  const { appPassword, ...wpSafe } = settings.wordpress as Record<string, any>;
  return {
    ...company,
    settings: {
      ...settings,
      wordpress: { ...wpSafe, connected: !!appPassword },
    },
  };
}

// List companies
companiesRouter.get('/', async (c) => {
  const { userId } = c.get('user');

  const userCompanies = await db.query.companies.findMany({
    where: eq(companies.ownerId, userId),
    orderBy: [desc(companies.createdAt)],
  });

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

  return c.json(company, 201);
});

// Get company
companiesRouter.get('/:id', async (c) => {
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

  return c.json(sanitizeCompany(company));
});

// Update company
companiesRouter.patch('/:id', async (c) => {
  const { userId } = c.get('user');
  const companyId = c.req.param('id');
  const data = await c.req.json();

  // Check ownership
  const existing = await db.query.companies.findFirst({
    where: and(eq(companies.id, companyId), eq(companies.ownerId, userId)),
  });

  if (!existing) {
    throw new HTTPException(404, { message: 'Company not found' });
  }

  const [updated] = await db
    .update(companies)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(companies.id, companyId))
    .returning();

  return c.json(updated);
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
    const dateStr = date.toISOString().split('T')[0];

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
