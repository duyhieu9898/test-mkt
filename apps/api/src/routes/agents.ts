import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq, and, desc, or } from 'drizzle-orm';
import { db } from '../lib/db';
import { companies, agents, departments, messages, tasks } from '@1person/core/db';
import { authMiddleware } from '../middleware/auth';
import { HTTPException } from 'hono/http-exception';
import { queueAgentCommand, queueTaskExecution, getJobStatus } from '../lib/queue';

const agentsRouter = new Hono();

// Apply auth to all routes
agentsRouter.use('*', authMiddleware);

// Schemas
const createAgentSchema = z.object({
  name: z.string().min(2).max(100),
  role: z.enum([
    'ceo',
    'marketing_manager',
    'sales_manager',
    'content_creator',
    'ads_specialist',
    'analyst',
    'support',
    'developer',
    'custom',
  ]),
  title: z.string().optional(),
  description: z.string().optional(),
  departmentId: z.string().uuid().optional(),
  supervisorId: z.string().uuid().optional(),
  capabilities: z.array(z.object({
    name: z.string(),
    level: z.enum(['basic', 'intermediate', 'advanced']),
    description: z.string(),
  })).optional(),
  tools: z.array(z.string()).optional(),
  kpiTargets: z.array(z.object({
    name: z.string(),
    target: z.number(),
    unit: z.string(),
    weight: z.number(),
  })).optional(),
  budgetLimit: z.number().optional(),
});

// Helper to check company ownership
const checkCompanyOwnership = async (companyId: string, userId: string) => {
  const company = await db.query.companies.findFirst({
    where: and(eq(companies.id, companyId), eq(companies.ownerId, userId)),
  });
  if (!company) {
    throw new HTTPException(404, { message: 'Company not found' });
  }
  return company;
};

// List agents for company
agentsRouter.get('/', async (c) => {
  const { userId } = c.get('user');
  const companyId = c.req.query('companyId');

  if (!companyId) {
    throw new HTTPException(400, { message: 'companyId is required' });
  }

  await checkCompanyOwnership(companyId, userId);

  const companyAgents = await db.query.agents.findMany({
    where: eq(agents.companyId, companyId),
    orderBy: [desc(agents.createdAt)],
    with: {
      department: true,
      supervisor: true,
    },
  });

  return c.json({ data: companyAgents });
});

// Create agent
agentsRouter.post('/', zValidator('json', createAgentSchema.extend({ companyId: z.string().uuid() })), async (c) => {
  const { userId } = c.get('user');
  const data = c.req.valid('json');

  await checkCompanyOwnership(data.companyId, userId);

  // Determine level based on role
  let level = 2; // Worker by default
  if (data.role === 'ceo') level = 0;
  else if (data.role.includes('manager')) level = 1;

  // Generate default system prompt based on role
  const rolePrompts: Record<string, string> = {
    ceo: `You are the CEO of an AI-powered company. Your responsibilities include:
- Strategic planning and goal setting
- Budget allocation across departments
- Supervising department managers
- Making high-level decisions
Always prioritize company growth while maintaining profitability.`,
    marketing_manager: `You are the Marketing Manager. Your responsibilities include:
- Developing marketing strategies
- Managing marketing budget
- Coordinating with content and ads teams
- Tracking marketing KPIs (CAC, ROAS, conversion rates)
Focus on customer acquisition and brand awareness.`,
    content_creator: `You are a Content Creator. Your responsibilities include:
- Creating blog posts and articles
- Writing social media content
- Developing marketing copy
- Creating visual content descriptions
Focus on engaging, high-converting content.`,
    ads_specialist: `You are an Ads Specialist. Your responsibilities include:
- Creating and managing ad campaigns
- Optimizing ad performance
- A/B testing ad creatives
- Monitoring ROAS and CTR
Focus on maximizing return on ad spend.`,
  };

  const [agent] = await db
    .insert(agents)
    .values({
      companyId: data.companyId,
      name: data.name,
      role: data.role,
      title: data.title || data.name,
      description: data.description,
      departmentId: data.departmentId,
      supervisorId: data.supervisorId,
      level,
      capabilities: data.capabilities || [],
      tools: data.tools || [],
      kpiTargets: data.kpiTargets || [],
      budgetLimit: data.budgetLimit?.toString(),
      systemPrompt: rolePrompts[data.role] || `You are a ${data.role} agent.`,
      color: getAgentColor(data.role),
    })
    .returning();

  return c.json(agent, 201);
});

// Get agent
agentsRouter.get('/:id', async (c) => {
  const { userId } = c.get('user');
  const agentId = c.req.param('id');

  const agent = await db.query.agents.findFirst({
    where: eq(agents.id, agentId),
    with: {
      company: true,
      department: true,
      supervisor: true,
      subordinates: true,
    },
  });

  if (!agent) {
    throw new HTTPException(404, { message: 'Agent not found' });
  }

  // Check ownership
  if (agent.company.ownerId !== userId) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  return c.json(agent);
});

// Update agent
agentsRouter.patch('/:id', async (c) => {
  const { userId } = c.get('user');
  const agentId = c.req.param('id');
  const data = await c.req.json();

  const agent = await db.query.agents.findFirst({
    where: eq(agents.id, agentId),
    with: { company: true },
  });

  if (!agent || agent.company.ownerId !== userId) {
    throw new HTTPException(404, { message: 'Agent not found' });
  }

  const [updated] = await db
    .update(agents)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(agents.id, agentId))
    .returning();

  return c.json(updated);
});

// Start agent
agentsRouter.post('/:id/start', async (c) => {
  const { userId } = c.get('user');
  const agentId = c.req.param('id');

  const agent = await db.query.agents.findFirst({
    where: eq(agents.id, agentId),
    with: { company: true },
  });

  if (!agent || agent.company.ownerId !== userId) {
    throw new HTTPException(404, { message: 'Agent not found' });
  }

  if (agent.status === 'running') {
    throw new HTTPException(400, { message: 'Agent is already running' });
  }

  await db
    .update(agents)
    .set({
      status: 'running',
      lastActiveAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(agents.id, agentId));

  return c.json({ success: true, status: 'running' });
});

// Pause agent
agentsRouter.post('/:id/pause', async (c) => {
  const { userId } = c.get('user');
  const agentId = c.req.param('id');

  const agent = await db.query.agents.findFirst({
    where: eq(agents.id, agentId),
    with: { company: true },
  });

  if (!agent || agent.company.ownerId !== userId) {
    throw new HTTPException(404, { message: 'Agent not found' });
  }

  await db
    .update(agents)
    .set({
      status: 'paused',
      updatedAt: new Date(),
    })
    .where(eq(agents.id, agentId));

  return c.json({ success: true, status: 'paused' });
});

// Stop agent
agentsRouter.post('/:id/stop', async (c) => {
  const { userId } = c.get('user');
  const agentId = c.req.param('id');

  const agent = await db.query.agents.findFirst({
    where: eq(agents.id, agentId),
    with: { company: true },
  });

  if (!agent || agent.company.ownerId !== userId) {
    throw new HTTPException(404, { message: 'Agent not found' });
  }

  await db
    .update(agents)
    .set({
      status: 'terminated',
      updatedAt: new Date(),
    })
    .where(eq(agents.id, agentId));

  return c.json({ success: true, status: 'terminated' });
});

// Send command to agent (queued processing)
agentsRouter.post('/:id/command', async (c) => {
  const { userId } = c.get('user');
  const agentId = c.req.param('id');
  const { command } = await c.req.json();

  const agent = await db.query.agents.findFirst({
    where: eq(agents.id, agentId),
    with: { company: true },
  });

  if (!agent || agent.company.ownerId !== userId) {
    throw new HTTPException(404, { message: 'Agent not found' });
  }

  // Save user message immediately
  const [userMessage] = await db
    .insert(messages)
    .values({
      companyId: agent.companyId,
      senderUserId: userId,
      receiverAgentId: agentId,
      type: 'chat',
      content: command,
      metadata: { userId },
    })
    .returning();

  // Queue the command for processing
  const job = await queueAgentCommand({
    agentId,
    companyId: agent.companyId,
    command,
    userId,
    messageId: userMessage.id,
  });

  return c.json({
    jobId: job.id,
    messageId: userMessage.id,
    status: 'queued',
    message: 'Processing your request...',
  });
});

// Get job status
agentsRouter.get('/:id/job/:jobId', async (c) => {
  const { userId } = c.get('user');
  const agentId = c.req.param('id');
  const jobId = c.req.param('jobId');

  const agent = await db.query.agents.findFirst({
    where: eq(agents.id, agentId),
    with: { company: true },
  });

  if (!agent || agent.company.ownerId !== userId) {
    throw new HTTPException(404, { message: 'Agent not found' });
  }

  const status = await getJobStatus('agent-command', jobId);

  if (!status) {
    throw new HTTPException(404, { message: 'Job not found' });
  }

  return c.json(status);
});

// Get agent messages (chat history)
agentsRouter.get('/:id/messages', async (c) => {
  const { userId } = c.get('user');
  const agentId = c.req.param('id');
  const limit = parseInt(c.req.query('limit') || '50');
  const offset = parseInt(c.req.query('offset') || '0');

  const agent = await db.query.agents.findFirst({
    where: eq(agents.id, agentId),
    with: { company: true },
  });

  if (!agent || agent.company.ownerId !== userId) {
    throw new HTTPException(404, { message: 'Agent not found' });
  }

  // Get messages where agent is either sender or receiver
  const agentMessages = await db.query.messages.findMany({
    where: and(
      eq(messages.companyId, agent.companyId),
      eq(messages.type, 'chat'),
      or(
        eq(messages.senderAgentId, agentId),
        eq(messages.receiverAgentId, agentId)
      )
    ),
    orderBy: [desc(messages.createdAt)],
    limit,
    offset,
  });

  return c.json({
    data: agentMessages.reverse(),
    hasMore: agentMessages.length === limit,
  });
});

// Get agent tasks
agentsRouter.get('/:id/tasks', async (c) => {
  const { userId } = c.get('user');
  const agentId = c.req.param('id');

  const agent = await db.query.agents.findFirst({
    where: eq(agents.id, agentId),
    with: { company: true },
  });

  if (!agent || agent.company.ownerId !== userId) {
    throw new HTTPException(404, { message: 'Agent not found' });
  }

  const agentTasks = await db.query.tasks.findMany({
    where: eq(tasks.assignedAgentId, agentId),
    orderBy: [desc(tasks.createdAt)],
    limit: 50,
  });

  return c.json({ data: agentTasks });
});

// Helper function
function getAgentColor(role: string): string {
  const colors: Record<string, string> = {
    ceo: '#8b5cf6',
    marketing_manager: '#3b82f6',
    sales_manager: '#10b981',
    content_creator: '#f59e0b',
    ads_specialist: '#ef4444',
    analyst: '#06b6d4',
    support: '#ec4899',
    developer: '#6366f1',
    custom: '#64748b',
  };
  return colors[role] || '#64748b';
}

export default agentsRouter;
