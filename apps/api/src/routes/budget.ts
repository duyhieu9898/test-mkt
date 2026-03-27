/**
 * Budget API Routes
 *
 * Endpoints for managing company budget hierarchy and analytics.
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq, and, desc, gte, sql, lte } from 'drizzle-orm';
import { db } from '../lib/db';
import { companies, departments, agents, actionLogs } from '@1person/core/db';
import { authMiddleware } from '../middleware/auth';
import { HTTPException } from 'hono/http-exception';

const budgetRouter = new Hono();

// Apply auth to all routes
budgetRouter.use('*', authMiddleware);

// ==================== HELPER ====================

async function verifyCompanyAccess(userId: string, companyId: string) {
  const company = await db.query.companies.findFirst({
    where: and(
      eq(companies.id, companyId),
      eq(companies.ownerId, userId)
    ),
  });

  if (!company) {
    throw new HTTPException(404, { message: 'Company not found' });
  }

  return company;
}

// ==================== ROUTES ====================

// Get budget hierarchy (Company → Department → Agent)
budgetRouter.get('/company/:companyId/hierarchy', async (c) => {
  const { userId } = c.get('user');
  const { companyId } = c.req.param();

  const company = await verifyCompanyAccess(userId, companyId);

  // Get departments with agents
  const depts = await db.query.departments.findMany({
    where: eq(departments.companyId, companyId),
  });

  const companyAgents = await db.query.agents.findMany({
    where: eq(agents.companyId, companyId),
  });

  // Build hierarchy
  const departmentData = depts.map((dept) => {
    const deptAgents = companyAgents.filter((a) => a.departmentId === dept.id);
    const agentSpent = deptAgents.reduce(
      (sum, a) => sum + parseFloat(a.budgetSpent || '0'),
      0
    );
    const agentLimit = deptAgents.reduce(
      (sum, a) => sum + parseFloat(a.budgetLimit || '0'),
      0
    );

    return {
      id: dept.id,
      name: dept.name,
      color: dept.color,
      icon: dept.icon,
      budgetAllocated: parseFloat(dept.budgetAllocated || '0'),
      budgetSpent: parseFloat(dept.budgetSpent || '0') + agentSpent,
      utilizationPercent:
        parseFloat(dept.budgetAllocated || '0') > 0
          ? ((parseFloat(dept.budgetSpent || '0') + agentSpent) /
              parseFloat(dept.budgetAllocated || '0')) *
            100
          : 0,
      agents: deptAgents.map((a) => ({
        id: a.id,
        name: a.name,
        role: a.role,
        color: a.color,
        budgetLimit: parseFloat(a.budgetLimit || '0'),
        budgetSpent: parseFloat(a.budgetSpent || '0'),
        utilizationPercent:
          parseFloat(a.budgetLimit || '0') > 0
            ? (parseFloat(a.budgetSpent || '0') /
                parseFloat(a.budgetLimit || '0')) *
              100
            : 0,
      })),
    };
  });

  // Agents without department
  const unassignedAgents = companyAgents
    .filter((a) => !a.departmentId)
    .map((a) => ({
      id: a.id,
      name: a.name,
      role: a.role,
      color: a.color,
      budgetLimit: parseFloat(a.budgetLimit || '0'),
      budgetSpent: parseFloat(a.budgetSpent || '0'),
      utilizationPercent:
        parseFloat(a.budgetLimit || '0') > 0
          ? (parseFloat(a.budgetSpent || '0') /
              parseFloat(a.budgetLimit || '0')) *
            100
          : 0,
    }));

  const totalBudget = parseFloat(company.totalBudget || '0');
  const totalSpent = parseFloat(company.budgetSpent || '0');
  const monthlyBudget = parseFloat(company.monthlyBudget || '0');

  return c.json({
    data: {
      company: {
        id: company.id,
        name: company.name,
        totalBudget,
        monthlyBudget,
        totalSpent,
        utilizationPercent: totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0,
      },
      departments: departmentData,
      unassignedAgents,
    },
  });
});

// Get spending trends
budgetRouter.get('/company/:companyId/trends', async (c) => {
  const { userId } = c.get('user');
  const { companyId } = c.req.param();
  const period = c.req.query('period') || '30d';

  await verifyCompanyAccess(userId, companyId);

  // Calculate date range
  let days = 30;
  if (period === '7d') days = 7;
  else if (period === '90d') days = 90;
  else if (period === '1y') days = 365;

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  // Get action logs with costs
  const logs = await db.query.actionLogs.findMany({
    where: and(
      eq(actionLogs.companyId, companyId),
      gte(actionLogs.createdAt, startDate)
    ),
    orderBy: [desc(actionLogs.createdAt)],
  });

  // Group by date
  const dailySpending: Map<string, { cost: number; tokens: number; tasks: number }> =
    new Map();

  for (const log of logs) {
    const date = new Date(log.createdAt).toISOString().split('T')[0];
    const existing = dailySpending.get(date) || { cost: 0, tokens: 0, tasks: 0 };
    existing.cost += parseFloat(log.cost || '0');
    existing.tokens += log.tokensUsed || 0;
    if (log.action === 'execute_task') existing.tasks++;
    dailySpending.set(date, existing);
  }

  // Fill missing dates
  const trends: Array<{ date: string; cost: number; tokens: number; tasks: number }> =
    [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    const data = dailySpending.get(dateStr) || { cost: 0, tokens: 0, tasks: 0 };
    trends.push({ date: dateStr, ...data });
  }

  // Calculate summary
  const totalCost = logs.reduce((sum, log) => sum + parseFloat(log.cost || '0'), 0);
  const totalTokens = logs.reduce((sum, log) => sum + (log.tokensUsed || 0), 0);
  const avgDailyCost = totalCost / days;

  // Trend calculation (comparing first half to second half)
  const midpoint = Math.floor(trends.length / 2);
  const firstHalf = trends.slice(0, midpoint);
  const secondHalf = trends.slice(midpoint);
  const firstHalfAvg =
    firstHalf.reduce((sum, d) => sum + d.cost, 0) / firstHalf.length || 0;
  const secondHalfAvg =
    secondHalf.reduce((sum, d) => sum + d.cost, 0) / secondHalf.length || 0;
  const trendPercent =
    firstHalfAvg > 0 ? ((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100 : 0;

  return c.json({
    data: {
      period,
      trends,
      summary: {
        totalCost,
        totalTokens,
        avgDailyCost,
        trendPercent,
        trendDirection: trendPercent > 5 ? 'up' : trendPercent < -5 ? 'down' : 'stable',
      },
    },
  });
});

// Get spending by category (model, agent, department)
budgetRouter.get('/company/:companyId/breakdown', async (c) => {
  const { userId } = c.get('user');
  const { companyId } = c.req.param();
  const groupBy = c.req.query('groupBy') || 'agent';

  await verifyCompanyAccess(userId, companyId);

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const logs = await db.query.actionLogs.findMany({
    where: and(
      eq(actionLogs.companyId, companyId),
      gte(actionLogs.createdAt, thirtyDaysAgo)
    ),
  });

  const companyAgents = await db.query.agents.findMany({
    where: eq(agents.companyId, companyId),
  });

  const depts = await db.query.departments.findMany({
    where: eq(departments.companyId, companyId),
  });

  const agentMap = new Map(companyAgents.map((a) => [a.id, a]));
  const deptMap = new Map(depts.map((d) => [d.id, d]));

  if (groupBy === 'model') {
    const byModel: Map<string, { cost: number; tokens: number; count: number }> =
      new Map();
    for (const log of logs) {
      const input = log.input as { model?: string } | null;
      const model = input?.model || 'unknown';
      const existing = byModel.get(model) || { cost: 0, tokens: 0, count: 0 };
      existing.cost += parseFloat(log.cost || '0');
      existing.tokens += log.tokensUsed || 0;
      existing.count++;
      byModel.set(model, existing);
    }

    return c.json({
      data: {
        groupBy: 'model',
        breakdown: Array.from(byModel.entries())
          .map(([model, data]) => ({
            id: model,
            name: model,
            ...data,
          }))
          .sort((a, b) => b.cost - a.cost),
      },
    });
  }

  if (groupBy === 'department') {
    const byDept: Map<
      string,
      { cost: number; tokens: number; count: number; name: string; color: string }
    > = new Map();

    for (const log of logs) {
      const agent = log.agentId ? agentMap.get(log.agentId) : null;
      const dept = agent?.departmentId ? deptMap.get(agent.departmentId) : null;
      const deptId = dept?.id || 'unassigned';
      const existing = byDept.get(deptId) || {
        cost: 0,
        tokens: 0,
        count: 0,
        name: dept?.name || 'Unassigned',
        color: dept?.color || '#6b7280',
      };
      existing.cost += parseFloat(log.cost || '0');
      existing.tokens += log.tokensUsed || 0;
      existing.count++;
      byDept.set(deptId, existing);
    }

    return c.json({
      data: {
        groupBy: 'department',
        breakdown: Array.from(byDept.entries())
          .map(([id, data]) => ({ id, ...data }))
          .sort((a, b) => b.cost - a.cost),
      },
    });
  }

  // Default: by agent
  const byAgent: Map<
    string,
    { cost: number; tokens: number; count: number; name: string; role: string; color: string }
  > = new Map();

  for (const log of logs) {
    if (!log.agentId) continue;
    const agent = agentMap.get(log.agentId);
    if (!agent) continue;

    const existing = byAgent.get(log.agentId) || {
      cost: 0,
      tokens: 0,
      count: 0,
      name: agent.name,
      role: agent.role,
      color: agent.color || '#6366f1',
    };
    existing.cost += parseFloat(log.cost || '0');
    existing.tokens += log.tokensUsed || 0;
    existing.count++;
    byAgent.set(log.agentId, existing);
  }

  return c.json({
    data: {
      groupBy: 'agent',
      breakdown: Array.from(byAgent.entries())
        .map(([id, data]) => ({ id, ...data }))
        .sort((a, b) => b.cost - a.cost),
    },
  });
});

// Get budget forecast
budgetRouter.get('/company/:companyId/forecast', async (c) => {
  const { userId } = c.get('user');
  const { companyId } = c.req.param();

  const company = await verifyCompanyAccess(userId, companyId);

  // Get last 30 days of spending
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const logs = await db.query.actionLogs.findMany({
    where: and(
      eq(actionLogs.companyId, companyId),
      gte(actionLogs.createdAt, thirtyDaysAgo)
    ),
  });

  const totalCost = logs.reduce((sum, log) => sum + parseFloat(log.cost || '0'), 0);
  const avgDailyCost = totalCost / 30;

  // Calculate remaining days in month
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dayOfMonth = now.getDate();
  const remainingDays = daysInMonth - dayOfMonth;

  const monthlyBudget = parseFloat(company.monthlyBudget || '0');
  const currentMonthSpent = parseFloat(company.budgetSpent || '0');

  // Forecast
  const projectedMonthEnd = currentMonthSpent + avgDailyCost * remainingDays;
  const budgetStatus =
    projectedMonthEnd > monthlyBudget * 1.1
      ? 'over_budget'
      : projectedMonthEnd > monthlyBudget * 0.9
        ? 'at_risk'
        : 'on_track';

  // Daily forecast for remaining month
  const dailyForecast: Array<{ date: string; projected: number; cumulative: number }> =
    [];
  let cumulative = currentMonthSpent;

  for (let i = 1; i <= remainingDays; i++) {
    const date = new Date();
    date.setDate(date.getDate() + i);
    cumulative += avgDailyCost;
    dailyForecast.push({
      date: date.toISOString().split('T')[0],
      projected: avgDailyCost,
      cumulative,
    });
  }

  // Recommended actions based on forecast
  const recommendations: string[] = [];
  if (budgetStatus === 'over_budget') {
    recommendations.push('Consider reducing agent activity');
    recommendations.push('Review high-cost agents for optimization');
    recommendations.push('Switch to more cost-effective models');
  } else if (budgetStatus === 'at_risk') {
    recommendations.push('Monitor spending closely');
    recommendations.push('Prioritize essential tasks');
  }

  return c.json({
    data: {
      currentSpent: currentMonthSpent,
      monthlyBudget,
      avgDailyCost,
      remainingDays,
      projectedMonthEnd,
      budgetStatus,
      utilizationPercent:
        monthlyBudget > 0 ? (projectedMonthEnd / monthlyBudget) * 100 : 0,
      dailyForecast,
      recommendations,
    },
  });
});

// Update department budget allocation
const updateDeptBudgetSchema = z.object({
  budgetAllocated: z.number().min(0),
});

budgetRouter.patch(
  '/department/:departmentId/budget',
  zValidator('json', updateDeptBudgetSchema),
  async (c) => {
    const { userId } = c.get('user');
    const { departmentId } = c.req.param();
    const { budgetAllocated } = c.req.valid('json');

    // Get department and verify access
    const dept = await db.query.departments.findFirst({
      where: eq(departments.id, departmentId),
    });

    if (!dept) {
      throw new HTTPException(404, { message: 'Department not found' });
    }

    await verifyCompanyAccess(userId, dept.companyId);

    await db
      .update(departments)
      .set({
        budgetAllocated: budgetAllocated.toString(),
        updatedAt: new Date(),
      })
      .where(eq(departments.id, departmentId));

    return c.json({ message: 'Budget updated' });
  }
);

// Update agent budget limit
const updateAgentBudgetSchema = z.object({
  budgetLimit: z.number().min(0),
});

budgetRouter.patch(
  '/agent/:agentId/budget',
  zValidator('json', updateAgentBudgetSchema),
  async (c) => {
    const { userId } = c.get('user');
    const { agentId } = c.req.param();
    const { budgetLimit } = c.req.valid('json');

    // Get agent and verify access
    const agent = await db.query.agents.findFirst({
      where: eq(agents.id, agentId),
    });

    if (!agent) {
      throw new HTTPException(404, { message: 'Agent not found' });
    }

    await verifyCompanyAccess(userId, agent.companyId);

    await db
      .update(agents)
      .set({
        budgetLimit: budgetLimit.toString(),
        updatedAt: new Date(),
      })
      .where(eq(agents.id, agentId));

    return c.json({ message: 'Budget updated' });
  }
);

// Update company budget settings
const updateCompanyBudgetSchema = z.object({
  totalBudget: z.number().min(0).optional(),
  monthlyBudget: z.number().min(0).optional(),
});

budgetRouter.patch(
  '/company/:companyId',
  zValidator('json', updateCompanyBudgetSchema),
  async (c) => {
    const { userId } = c.get('user');
    const { companyId } = c.req.param();
    const data = c.req.valid('json');

    await verifyCompanyAccess(userId, companyId);

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (data.totalBudget !== undefined) updates.totalBudget = data.totalBudget.toString();
    if (data.monthlyBudget !== undefined)
      updates.monthlyBudget = data.monthlyBudget.toString();

    await db.update(companies).set(updates).where(eq(companies.id, companyId));

    return c.json({ message: 'Budget updated' });
  }
);

// Reset agent budgets (typically called monthly)
budgetRouter.post('/company/:companyId/reset', async (c) => {
  const { userId } = c.get('user');
  const { companyId } = c.req.param();

  await verifyCompanyAccess(userId, companyId);

  // Reset all agent budgets
  await db
    .update(agents)
    .set({ budgetSpent: '0' })
    .where(eq(agents.companyId, companyId));

  // Reset department budgets
  await db
    .update(departments)
    .set({ budgetSpent: '0' })
    .where(eq(departments.companyId, companyId));

  // Reset company budget spent
  await db
    .update(companies)
    .set({ budgetSpent: '0', updatedAt: new Date() })
    .where(eq(companies.id, companyId));

  return c.json({ message: 'Budgets reset successfully' });
});

export default budgetRouter;
