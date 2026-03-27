/**
 * Agent Communication API Routes
 *
 * Endpoints for viewing agent communications, threads, and collaborations.
 */

import { Hono } from 'hono';
import { eq, and, desc, gte, lte, or, sql, inArray } from 'drizzle-orm';
import { db } from '../lib/db';
import {
  agentMessages,
  collaborationSessions,
  agentRelationships,
  companies,
  agents,
} from '@1person/core/db';
import { authMiddleware } from '../middleware/auth';
import { HTTPException } from 'hono/http-exception';

const communicationsRouter = new Hono();

// Apply auth to all routes
communicationsRouter.use('*', authMiddleware);

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

// ==================== MESSAGES ====================

// Get all messages
communicationsRouter.get('/company/:companyId/messages', async (c) => {
  const { userId } = c.get('user');
  const { companyId } = c.req.param();
  const agentId = c.req.query('agentId');
  const messageType = c.req.query('messageType');
  const priority = c.req.query('priority');
  const threadId = c.req.query('threadId');
  const status = c.req.query('status');
  const limit = parseInt(c.req.query('limit') || '50');
  const offset = parseInt(c.req.query('offset') || '0');

  await verifyCompanyAccess(userId, companyId);

  const conditions = [eq(agentMessages.companyId, companyId)];

  if (agentId) {
    conditions.push(
      or(
        eq(agentMessages.senderAgentId, agentId),
        eq(agentMessages.receiverAgentId, agentId)
      ) || sql`1=1`
    );
  }

  if (messageType) {
    conditions.push(eq(agentMessages.messageType, messageType as typeof agentMessages.$inferSelect['messageType']));
  }

  if (priority) {
    conditions.push(eq(agentMessages.priority, priority as typeof agentMessages.$inferSelect['priority']));
  }

  if (threadId) {
    conditions.push(eq(agentMessages.threadId, threadId));
  }

  if (status) {
    conditions.push(eq(agentMessages.status, status));
  }

  const messages = await db.query.agentMessages.findMany({
    where: and(...conditions),
    orderBy: [desc(agentMessages.createdAt)],
    limit,
    offset,
    with: {
      sender: true,
      receiver: true,
    },
  });

  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(agentMessages)
    .where(and(...conditions));

  return c.json({
    data: messages,
    total: Number(countResult.count),
    limit,
    offset,
  });
});

// Get messages timeline (grouped by time)
communicationsRouter.get('/company/:companyId/timeline', async (c) => {
  const { userId } = c.get('user');
  const { companyId } = c.req.param();
  const days = parseInt(c.req.query('days') || '7');

  await verifyCompanyAccess(userId, companyId);

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const messages = await db.query.agentMessages.findMany({
    where: and(
      eq(agentMessages.companyId, companyId),
      gte(agentMessages.createdAt, startDate)
    ),
    orderBy: [desc(agentMessages.createdAt)],
    with: {
      sender: true,
      receiver: true,
    },
  });

  // Group by date
  const timeline: Record<string, typeof messages> = {};
  for (const msg of messages) {
    const date = new Date(msg.createdAt).toISOString().split('T')[0];
    if (!timeline[date]) {
      timeline[date] = [];
    }
    timeline[date].push(msg);
  }

  return c.json({
    data: {
      timeline: Object.entries(timeline).map(([date, msgs]) => ({
        date,
        messages: msgs,
        count: msgs.length,
      })),
      totalMessages: messages.length,
    },
  });
});

// Get single message thread
communicationsRouter.get('/thread/:threadId', async (c) => {
  const { userId } = c.get('user');
  const { threadId } = c.req.param();

  const messages = await db.query.agentMessages.findMany({
    where: eq(agentMessages.threadId, threadId),
    orderBy: [agentMessages.createdAt],
    with: {
      sender: true,
      receiver: true,
    },
  });

  if (messages.length === 0) {
    throw new HTTPException(404, { message: 'Thread not found' });
  }

  await verifyCompanyAccess(userId, messages[0].companyId);

  return c.json({ data: messages });
});

// Get communication stats
communicationsRouter.get('/company/:companyId/stats', async (c) => {
  const { userId } = c.get('user');
  const { companyId } = c.req.param();

  await verifyCompanyAccess(userId, companyId);

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const messages = await db.query.agentMessages.findMany({
    where: and(
      eq(agentMessages.companyId, companyId),
      gte(agentMessages.createdAt, sevenDaysAgo)
    ),
  });

  const companyAgents = await db.query.agents.findMany({
    where: eq(agents.companyId, companyId),
  });

  const agentMap = new Map(companyAgents.map((a) => [a.id, a]));

  // Aggregate
  const byType: Record<string, number> = {};
  const byPriority: Record<string, number> = {};
  const byAgent: Record<string, { sent: number; received: number; name: string }> = {};
  const byDay: Record<string, number> = {};
  let pendingResponses = 0;

  for (const msg of messages) {
    // By type
    byType[msg.messageType] = (byType[msg.messageType] || 0) + 1;

    // By priority
    byPriority[msg.priority] = (byPriority[msg.priority] || 0) + 1;

    // By agent
    if (msg.senderAgentId) {
      if (!byAgent[msg.senderAgentId]) {
        byAgent[msg.senderAgentId] = {
          sent: 0,
          received: 0,
          name: agentMap.get(msg.senderAgentId)?.name || 'Unknown',
        };
      }
      byAgent[msg.senderAgentId].sent++;
    }

    if (msg.receiverAgentId) {
      if (!byAgent[msg.receiverAgentId]) {
        byAgent[msg.receiverAgentId] = {
          sent: 0,
          received: 0,
          name: agentMap.get(msg.receiverAgentId)?.name || 'Unknown',
        };
      }
      byAgent[msg.receiverAgentId].received++;
    }

    // By day
    const day = new Date(msg.createdAt).toISOString().split('T')[0];
    byDay[day] = (byDay[day] || 0) + 1;

    // Pending responses
    if (msg.requiresResponse === 1 && msg.status !== 'responded') {
      pendingResponses++;
    }
  }

  // Get active threads
  const activeThreads = new Set(messages.filter((m) => m.threadId).map((m) => m.threadId));

  return c.json({
    data: {
      total: messages.length,
      pendingResponses,
      activeThreads: activeThreads.size,
      byType: Object.entries(byType)
        .map(([type, count]) => ({ type, count }))
        .sort((a, b) => b.count - a.count),
      byPriority: Object.entries(byPriority)
        .map(([priority, count]) => ({ priority, count }))
        .sort((a, b) => b.count - a.count),
      byAgent: Object.entries(byAgent)
        .map(([agentId, data]) => ({ agentId, ...data }))
        .sort((a, b) => (b.sent + b.received) - (a.sent + a.received)),
      byDay: Object.entries(byDay)
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    },
  });
});

// ==================== COLLABORATION SESSIONS ====================

// Get all collaboration sessions
communicationsRouter.get('/company/:companyId/collaborations', async (c) => {
  const { userId } = c.get('user');
  const { companyId } = c.req.param();
  const status = c.req.query('status');

  await verifyCompanyAccess(userId, companyId);

  const conditions = [eq(collaborationSessions.companyId, companyId)];

  if (status) {
    conditions.push(eq(collaborationSessions.status, status));
  }

  const sessions = await db.query.collaborationSessions.findMany({
    where: and(...conditions),
    orderBy: [desc(collaborationSessions.startedAt)],
    with: {
      initiator: true,
    },
  });

  // Enrich with participant names
  const companyAgents = await db.query.agents.findMany({
    where: eq(agents.companyId, companyId),
  });
  const agentMap = new Map(companyAgents.map((a) => [a.id, a]));

  const enrichedSessions = sessions.map((session) => ({
    ...session,
    participants: (session.participantAgentIds || []).map((id) => ({
      id,
      name: agentMap.get(id)?.name || 'Unknown',
      role: agentMap.get(id)?.role,
      color: agentMap.get(id)?.color,
    })),
  }));

  return c.json({ data: enrichedSessions });
});

// Get single collaboration session
communicationsRouter.get('/collaborations/:sessionId', async (c) => {
  const { userId } = c.get('user');
  const { sessionId } = c.req.param();

  const session = await db.query.collaborationSessions.findFirst({
    where: eq(collaborationSessions.id, sessionId),
    with: {
      initiator: true,
    },
  });

  if (!session) {
    throw new HTTPException(404, { message: 'Session not found' });
  }

  await verifyCompanyAccess(userId, session.companyId);

  // Get messages in this session
  let sessionMessages: typeof agentMessages.$inferSelect[] = [];
  if (session.messageIds && session.messageIds.length > 0) {
    sessionMessages = await db.query.agentMessages.findMany({
      where: inArray(agentMessages.id, session.messageIds),
      orderBy: [agentMessages.createdAt],
      with: {
        sender: true,
        receiver: true,
      },
    });
  }

  // Get participants
  const companyAgents = await db.query.agents.findMany({
    where: eq(agents.companyId, session.companyId),
  });
  const agentMap = new Map(companyAgents.map((a) => [a.id, a]));

  return c.json({
    data: {
      ...session,
      participants: (session.participantAgentIds || []).map((id) => ({
        id,
        name: agentMap.get(id)?.name || 'Unknown',
        role: agentMap.get(id)?.role,
        color: agentMap.get(id)?.color,
      })),
      messages: sessionMessages,
    },
  });
});

// ==================== AGENT RELATIONSHIPS ====================

// Get agent relationships
communicationsRouter.get('/company/:companyId/relationships', async (c) => {
  const { userId } = c.get('user');
  const { companyId } = c.req.param();
  const agentId = c.req.query('agentId');

  await verifyCompanyAccess(userId, companyId);

  const conditions = [eq(agentRelationships.companyId, companyId)];

  if (agentId) {
    conditions.push(
      or(
        eq(agentRelationships.agentAId, agentId),
        eq(agentRelationships.agentBId, agentId)
      ) || sql`1=1`
    );
  }

  const relationships = await db.query.agentRelationships.findMany({
    where: and(...conditions),
    with: {
      agentA: true,
      agentB: true,
    },
  });

  return c.json({ data: relationships });
});

// Get communication network (for visualization)
communicationsRouter.get('/company/:companyId/network', async (c) => {
  const { userId } = c.get('user');
  const { companyId } = c.req.param();

  await verifyCompanyAccess(userId, companyId);

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const messages = await db.query.agentMessages.findMany({
    where: and(
      eq(agentMessages.companyId, companyId),
      gte(agentMessages.createdAt, sevenDaysAgo)
    ),
  });

  const companyAgents = await db.query.agents.findMany({
    where: eq(agents.companyId, companyId),
  });

  // Build network data
  const nodes = companyAgents.map((agent) => ({
    id: agent.id,
    name: agent.name,
    role: agent.role,
    color: agent.color,
    department: agent.departmentId,
  }));

  // Count message pairs
  const edgeMap = new Map<string, number>();
  for (const msg of messages) {
    if (msg.senderAgentId && msg.receiverAgentId) {
      const key = [msg.senderAgentId, msg.receiverAgentId].sort().join('-');
      edgeMap.set(key, (edgeMap.get(key) || 0) + 1);
    }
  }

  const edges = Array.from(edgeMap.entries()).map(([key, count]) => {
    const [source, target] = key.split('-');
    return { source, target, weight: count };
  });

  return c.json({
    data: {
      nodes,
      edges,
    },
  });
});

export default communicationsRouter;
