import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq, and, desc, or, inArray } from 'drizzle-orm';
import { db } from '../lib/db';
import { companies, agents, tasks } from '@1person/core/db';
import { authMiddleware } from '../middleware/auth';
import { HTTPException } from 'hono/http-exception';
import { queueTaskExecution } from '../lib/queue';

const tasksRouter = new Hono();

// Apply auth to all routes
tasksRouter.use('*', authMiddleware);

// Schemas
const createTaskSchema = z.object({
  companyId: z.string().uuid(),
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  type: z.string().default('general'),
  assignedAgentId: z.string().uuid().optional(),
  priority: z.enum(['critical', 'high', 'medium', 'low']).default('medium'),
  deadline: z.string().datetime().optional(),
  input: z.any().optional(),
});

const updateTaskSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  status: z.enum(['pending', 'scheduled', 'in_progress', 'waiting', 'completed', 'failed', 'cancelled']).optional(),
  priority: z.enum(['critical', 'high', 'medium', 'low']).optional(),
  assignedAgentId: z.string().uuid().optional(),
  deadline: z.string().datetime().optional(),
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

// List tasks for company
tasksRouter.get('/', async (c) => {
  const { userId } = c.get('user');
  const companyId = c.req.query('companyId');
  const status = c.req.query('status');
  const priority = c.req.query('priority');
  const agentId = c.req.query('agentId');
  const limit = parseInt(c.req.query('limit') || '50');
  const offset = parseInt(c.req.query('offset') || '0');

  if (!companyId) {
    throw new HTTPException(400, { message: 'companyId is required' });
  }

  await checkCompanyOwnership(companyId, userId);

  // Build query conditions
  const conditions = [eq(tasks.companyId, companyId)];

  if (status) {
    const statuses = status.split(',') as Array<'pending' | 'scheduled' | 'in_progress' | 'waiting' | 'completed' | 'failed' | 'cancelled'>;
    conditions.push(inArray(tasks.status, statuses));
  }

  if (priority) {
    const priorities = priority.split(',') as Array<'critical' | 'high' | 'medium' | 'low'>;
    conditions.push(inArray(tasks.priority, priorities));
  }

  if (agentId) {
    conditions.push(eq(tasks.assignedAgentId, agentId));
  }

  const companyTasks = await db.query.tasks.findMany({
    where: and(...conditions),
    orderBy: [desc(tasks.createdAt)],
    limit,
    offset,
    with: {
      assignedAgent: true,
    },
  });

  // Get counts by status
  const allTasks = await db.query.tasks.findMany({
    where: eq(tasks.companyId, companyId),
  });

  const counts = {
    total: allTasks.length,
    pending: allTasks.filter((t) => t.status === 'pending').length,
    in_progress: allTasks.filter((t) => t.status === 'in_progress').length,
    completed: allTasks.filter((t) => t.status === 'completed').length,
    failed: allTasks.filter((t) => t.status === 'failed').length,
  };

  return c.json({
    data: companyTasks,
    counts,
    hasMore: companyTasks.length === limit,
  });
});

// Create task
tasksRouter.post('/', zValidator('json', createTaskSchema), async (c) => {
  const { userId } = c.get('user');
  const data = c.req.valid('json');

  await checkCompanyOwnership(data.companyId, userId);

  // Verify agent if specified
  if (data.assignedAgentId) {
    const agent = await db.query.agents.findFirst({
      where: and(
        eq(agents.id, data.assignedAgentId),
        eq(agents.companyId, data.companyId)
      ),
    });
    if (!agent) {
      throw new HTTPException(400, { message: 'Invalid agent' });
    }
  }

  const [task] = await db
    .insert(tasks)
    .values({
      companyId: data.companyId,
      title: data.title,
      description: data.description,
      type: data.type,
      assignedAgentId: data.assignedAgentId,
      priority: data.priority,
      deadline: data.deadline ? new Date(data.deadline) : undefined,
      input: data.input,
      status: 'pending',
    })
    .returning();

  // If agent is assigned, queue for execution
  if (data.assignedAgentId) {
    await queueTaskExecution({
      taskId: task.id,
      agentId: data.assignedAgentId,
      companyId: data.companyId,
      taskType: data.type,
      title: data.title,
      description: data.description || '',
      input: data.input,
      priority: data.priority,
    });
  }

  return c.json(task, 201);
});

// Get task
tasksRouter.get('/:id', async (c) => {
  const { userId } = c.get('user');
  const taskId = c.req.param('id');

  const task = await db.query.tasks.findFirst({
    where: eq(tasks.id, taskId),
    with: {
      assignedAgent: true,
      company: true,
    },
  });

  if (!task) {
    throw new HTTPException(404, { message: 'Task not found' });
  }

  if (task.company.ownerId !== userId) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  return c.json(task);
});

// Update task
tasksRouter.patch('/:id', zValidator('json', updateTaskSchema), async (c) => {
  const { userId } = c.get('user');
  const taskId = c.req.param('id');
  const data = c.req.valid('json');

  const task = await db.query.tasks.findFirst({
    where: eq(tasks.id, taskId),
    with: { company: true },
  });

  if (!task || task.company.ownerId !== userId) {
    throw new HTTPException(404, { message: 'Task not found' });
  }

  const updateData: Record<string, unknown> = {
    ...data,
    updatedAt: new Date(),
  };

  if (data.deadline) {
    updateData.deadline = new Date(data.deadline);
  }

  if (data.status === 'completed' && task.status !== 'completed') {
    updateData.completedAt = new Date();
    updateData.progress = 100;
  }

  const [updated] = await db
    .update(tasks)
    .set(updateData)
    .where(eq(tasks.id, taskId))
    .returning();

  return c.json(updated);
});

// Delete task
tasksRouter.delete('/:id', async (c) => {
  const { userId } = c.get('user');
  const taskId = c.req.param('id');

  const task = await db.query.tasks.findFirst({
    where: eq(tasks.id, taskId),
    with: { company: true },
  });

  if (!task || task.company.ownerId !== userId) {
    throw new HTTPException(404, { message: 'Task not found' });
  }

  await db.delete(tasks).where(eq(tasks.id, taskId));

  return c.json({ success: true });
});

// Assign task to agent
tasksRouter.post('/:id/assign', async (c) => {
  const { userId } = c.get('user');
  const taskId = c.req.param('id');
  const { agentId } = await c.req.json();

  const task = await db.query.tasks.findFirst({
    where: eq(tasks.id, taskId),
    with: { company: true },
  });

  if (!task || task.company.ownerId !== userId) {
    throw new HTTPException(404, { message: 'Task not found' });
  }

  // Verify agent
  const agent = await db.query.agents.findFirst({
    where: and(
      eq(agents.id, agentId),
      eq(agents.companyId, task.companyId)
    ),
  });

  if (!agent) {
    throw new HTTPException(400, { message: 'Invalid agent' });
  }

  // Update task
  const [updated] = await db
    .update(tasks)
    .set({
      assignedAgentId: agentId,
      status: 'pending',
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, taskId))
    .returning();

  // Queue for execution
  await queueTaskExecution({
    taskId: task.id,
    agentId,
    companyId: task.companyId,
    taskType: task.type,
    title: task.title,
    description: task.description || '',
    input: task.input,
    priority: task.priority,
  });

  return c.json(updated);
});

// Retry failed task
tasksRouter.post('/:id/retry', async (c) => {
  const { userId } = c.get('user');
  const taskId = c.req.param('id');

  const task = await db.query.tasks.findFirst({
    where: eq(tasks.id, taskId),
    with: { company: true },
  });

  if (!task || task.company.ownerId !== userId) {
    throw new HTTPException(404, { message: 'Task not found' });
  }

  if (task.status !== 'failed') {
    throw new HTTPException(400, { message: 'Only failed tasks can be retried' });
  }

  if (!task.assignedAgentId) {
    throw new HTTPException(400, { message: 'Task has no assigned agent' });
  }

  // Reset task
  await db
    .update(tasks)
    .set({
      status: 'pending',
      errorMessage: null,
      errorDetails: null,
      retryCount: (task.retryCount || 0) + 1,
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, taskId));

  // Queue for execution
  await queueTaskExecution({
    taskId: task.id,
    agentId: task.assignedAgentId,
    companyId: task.companyId,
    taskType: task.type,
    title: task.title,
    description: task.description || '',
    input: task.input,
    priority: task.priority,
  });

  return c.json({ success: true, status: 'queued' });
});

export default tasksRouter;
