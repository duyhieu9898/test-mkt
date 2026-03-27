/**
 * Audit Log API Routes
 *
 * Endpoints for viewing audit and action logs.
 */

import { Hono } from 'hono';
import { eq, and, desc, gte, lte, inArray, sql, like, or } from 'drizzle-orm';
import { db } from '../lib/db';
import { auditLogs, actionLogs, companies, agents } from '@1person/core/db';
import { authMiddleware } from '../middleware/auth';
import { HTTPException } from 'hono/http-exception';

const auditRouter = new Hono();

// Apply auth to all routes
auditRouter.use('*', authMiddleware);

// ==================== HELPER ====================

async function verifyCompanyAccess(userId: string, companyId: string) {
  const company = await db.query.companies.findFirst({
    where: and(eq(companies.id, companyId), eq(companies.ownerId, userId)),
  });

  if (!company) {
    throw new HTTPException(404, { message: 'Company not found' });
  }

  return company;
}

// ==================== AUDIT LOGS (User Actions) ====================

// Get audit logs
auditRouter.get('/company/:companyId/audit', async (c) => {
  const { userId } = c.get('user');
  const { companyId } = c.req.param();
  const actorType = c.req.query('actorType');
  const action = c.req.query('action');
  const resourceType = c.req.query('resourceType');
  const startDate = c.req.query('startDate');
  const endDate = c.req.query('endDate');
  const search = c.req.query('search');
  const limit = parseInt(c.req.query('limit') || '50');
  const offset = parseInt(c.req.query('offset') || '0');

  await verifyCompanyAccess(userId, companyId);

  const conditions = [eq(auditLogs.companyId, companyId)];

  if (actorType) {
    conditions.push(eq(auditLogs.actorType, actorType));
  }

  if (action) {
    conditions.push(eq(auditLogs.action, action));
  }

  if (resourceType) {
    conditions.push(eq(auditLogs.resourceType, resourceType));
  }

  if (startDate) {
    conditions.push(gte(auditLogs.createdAt, new Date(startDate)));
  }

  if (endDate) {
    conditions.push(lte(auditLogs.createdAt, new Date(endDate)));
  }

  if (search) {
    conditions.push(
      or(
        like(auditLogs.action, `%${search}%`),
        like(auditLogs.description || '', `%${search}%`),
        like(auditLogs.actorName || '', `%${search}%`)
      ) || sql`1=1`
    );
  }

  const logs = await db.query.auditLogs.findMany({
    where: and(...conditions),
    orderBy: [desc(auditLogs.createdAt)],
    limit,
    offset,
  });

  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(auditLogs)
    .where(and(...conditions));

  return c.json({
    data: logs,
    total: Number(countResult.count),
    limit,
    offset,
  });
});

// Get audit log stats
auditRouter.get('/company/:companyId/audit/stats', async (c) => {
  const { userId } = c.get('user');
  const { companyId } = c.req.param();

  await verifyCompanyAccess(userId, companyId);

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const logs = await db.query.auditLogs.findMany({
    where: and(eq(auditLogs.companyId, companyId), gte(auditLogs.createdAt, sevenDaysAgo)),
  });

  // Group by action
  const byAction: Record<string, number> = {};
  const byActorType: Record<string, number> = {};
  const byResourceType: Record<string, number> = {};
  const byDay: Record<string, number> = {};

  for (const log of logs) {
    byAction[log.action] = (byAction[log.action] || 0) + 1;
    byActorType[log.actorType] = (byActorType[log.actorType] || 0) + 1;
    byResourceType[log.resourceType] = (byResourceType[log.resourceType] || 0) + 1;

    const day = new Date(log.createdAt).toISOString().split('T')[0];
    byDay[day] = (byDay[day] || 0) + 1;
  }

  return c.json({
    data: {
      total: logs.length,
      byAction: Object.entries(byAction)
        .map(([action, count]) => ({ action, count }))
        .sort((a, b) => b.count - a.count),
      byActorType: Object.entries(byActorType)
        .map(([type, count]) => ({ type, count }))
        .sort((a, b) => b.count - a.count),
      byResourceType: Object.entries(byResourceType)
        .map(([type, count]) => ({ type, count }))
        .sort((a, b) => b.count - a.count),
      byDay: Object.entries(byDay)
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    },
  });
});

// Get unique values for filters
auditRouter.get('/company/:companyId/audit/filters', async (c) => {
  const { userId } = c.get('user');
  const { companyId } = c.req.param();

  await verifyCompanyAccess(userId, companyId);

  const [actorTypes, actions, resourceTypes] = await Promise.all([
    db
      .selectDistinct({ value: auditLogs.actorType })
      .from(auditLogs)
      .where(eq(auditLogs.companyId, companyId)),
    db
      .selectDistinct({ value: auditLogs.action })
      .from(auditLogs)
      .where(eq(auditLogs.companyId, companyId)),
    db
      .selectDistinct({ value: auditLogs.resourceType })
      .from(auditLogs)
      .where(eq(auditLogs.companyId, companyId)),
  ]);

  return c.json({
    data: {
      actorTypes: actorTypes.map((a) => a.value),
      actions: actions.map((a) => a.value),
      resourceTypes: resourceTypes.map((r) => r.value),
    },
  });
});

// ==================== ACTION LOGS (Agent Actions) ====================

// Get action logs
auditRouter.get('/company/:companyId/actions', async (c) => {
  const { userId } = c.get('user');
  const { companyId } = c.req.param();
  const agentId = c.req.query('agentId');
  const taskId = c.req.query('taskId');
  const toolName = c.req.query('toolName');
  const action = c.req.query('action');
  const status = c.req.query('status');
  const startDate = c.req.query('startDate');
  const endDate = c.req.query('endDate');
  const limit = parseInt(c.req.query('limit') || '50');
  const offset = parseInt(c.req.query('offset') || '0');

  await verifyCompanyAccess(userId, companyId);

  const conditions = [eq(actionLogs.companyId, companyId)];

  if (agentId) {
    conditions.push(eq(actionLogs.agentId, agentId));
  }

  if (taskId) {
    conditions.push(eq(actionLogs.taskId, taskId));
  }

  if (toolName) {
    conditions.push(eq(actionLogs.toolName, toolName));
  }

  if (action) {
    conditions.push(eq(actionLogs.action, action));
  }

  if (status) {
    conditions.push(eq(actionLogs.status, status));
  }

  if (startDate) {
    conditions.push(gte(actionLogs.createdAt, new Date(startDate)));
  }

  if (endDate) {
    conditions.push(lte(actionLogs.createdAt, new Date(endDate)));
  }

  const logs = await db.query.actionLogs.findMany({
    where: and(...conditions),
    orderBy: [desc(actionLogs.createdAt)],
    limit,
    offset,
    with: {
      agent: true,
      task: true,
    },
  });

  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(actionLogs)
    .where(and(...conditions));

  return c.json({
    data: logs,
    total: Number(countResult.count),
    limit,
    offset,
  });
});

// Get action log stats
auditRouter.get('/company/:companyId/actions/stats', async (c) => {
  const { userId } = c.get('user');
  const { companyId } = c.req.param();

  await verifyCompanyAccess(userId, companyId);

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const logs = await db.query.actionLogs.findMany({
    where: and(eq(actionLogs.companyId, companyId), gte(actionLogs.createdAt, sevenDaysAgo)),
  });

  const companyAgents = await db.query.agents.findMany({
    where: eq(agents.companyId, companyId),
  });

  const agentMap = new Map(companyAgents.map((a) => [a.id, a]));

  // Aggregations
  const byTool: Record<string, { count: number; cost: number; tokens: number }> = {};
  const byAgent: Record<string, { count: number; cost: number; tokens: number; name: string }> = {};
  const byStatus: Record<string, number> = {};
  const byDay: Record<string, { count: number; cost: number }> = {};

  let totalCost = 0;
  let totalTokens = 0;
  let successCount = 0;
  let errorCount = 0;

  for (const log of logs) {
    const cost = parseFloat(log.cost || '0');
    const tokens = log.tokensUsed || 0;

    // By tool
    if (!byTool[log.toolName]) {
      byTool[log.toolName] = { count: 0, cost: 0, tokens: 0 };
    }
    byTool[log.toolName].count++;
    byTool[log.toolName].cost += cost;
    byTool[log.toolName].tokens += tokens;

    // By agent
    const agent = agentMap.get(log.agentId);
    if (!byAgent[log.agentId]) {
      byAgent[log.agentId] = { count: 0, cost: 0, tokens: 0, name: agent?.name || 'Unknown' };
    }
    byAgent[log.agentId].count++;
    byAgent[log.agentId].cost += cost;
    byAgent[log.agentId].tokens += tokens;

    // By status
    byStatus[log.status] = (byStatus[log.status] || 0) + 1;
    if (log.status === 'success') successCount++;
    else errorCount++;

    // By day
    const day = new Date(log.createdAt).toISOString().split('T')[0];
    if (!byDay[day]) {
      byDay[day] = { count: 0, cost: 0 };
    }
    byDay[day].count++;
    byDay[day].cost += cost;

    totalCost += cost;
    totalTokens += tokens;
  }

  return c.json({
    data: {
      total: logs.length,
      totalCost,
      totalTokens,
      successRate: logs.length > 0 ? (successCount / logs.length) * 100 : 0,
      byTool: Object.entries(byTool)
        .map(([tool, data]) => ({ tool, ...data }))
        .sort((a, b) => b.count - a.count),
      byAgent: Object.entries(byAgent)
        .map(([agentId, data]) => ({ agentId, ...data }))
        .sort((a, b) => b.count - a.count),
      byStatus: Object.entries(byStatus)
        .map(([status, count]) => ({ status, count }))
        .sort((a, b) => b.count - a.count),
      byDay: Object.entries(byDay)
        .map(([date, data]) => ({ date, ...data }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    },
  });
});

// Get unique values for filters
auditRouter.get('/company/:companyId/actions/filters', async (c) => {
  const { userId } = c.get('user');
  const { companyId } = c.req.param();

  await verifyCompanyAccess(userId, companyId);

  const companyAgents = await db.query.agents.findMany({
    where: eq(agents.companyId, companyId),
  });

  const [toolNames, actions, statuses] = await Promise.all([
    db
      .selectDistinct({ value: actionLogs.toolName })
      .from(actionLogs)
      .where(eq(actionLogs.companyId, companyId)),
    db
      .selectDistinct({ value: actionLogs.action })
      .from(actionLogs)
      .where(eq(actionLogs.companyId, companyId)),
    db
      .selectDistinct({ value: actionLogs.status })
      .from(actionLogs)
      .where(eq(actionLogs.companyId, companyId)),
  ]);

  return c.json({
    data: {
      agents: companyAgents.map((a) => ({ id: a.id, name: a.name })),
      toolNames: toolNames.map((t) => t.value),
      actions: actions.map((a) => a.value),
      statuses: statuses.map((s) => s.value),
    },
  });
});

// Get single action log with full details
auditRouter.get('/actions/:actionId', async (c) => {
  const { userId } = c.get('user');
  const { actionId } = c.req.param();

  const log = await db.query.actionLogs.findFirst({
    where: eq(actionLogs.id, actionId),
    with: {
      agent: true,
      task: true,
    },
  });

  if (!log) {
    throw new HTTPException(404, { message: 'Action log not found' });
  }

  await verifyCompanyAccess(userId, log.companyId);

  return c.json({ data: log });
});

export default auditRouter;
