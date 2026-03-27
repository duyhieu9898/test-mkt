import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { HTTPException } from 'hono/http-exception';
import { authMiddleware, getUserCompanies } from '../middleware/auth';
import { executionQueue, TASK_PRIORITY } from '../services/execution-queue-service';
import { toolRegistry } from '../services/tool-registry-service';
import { skillRegistry } from '../services/skill-registry-service';

const execution = new Hono();

// Apply auth middleware to all routes
execution.use('*', authMiddleware);

// ============================================
// TOOLS
// ============================================

// Get all available tools
execution.get('/tools', async (c) => {
  const tools = await toolRegistry.getAllTools();
  return c.json({ data: tools });
});

// Get tools by type
execution.get('/tools/type/:type', async (c) => {
  const type = c.req.param('type');
  const tools = await toolRegistry.getToolsByType(type);
  return c.json({ data: tools });
});

// Get tool by slug
execution.get('/tools/:slug', async (c) => {
  const slug = c.req.param('slug');
  const tool = await toolRegistry.getToolBySlug(slug);

  if (!tool) {
    throw new HTTPException(404, { message: 'Tool not found' });
  }

  return c.json({ data: tool });
});

// Get company's configured tools
execution.get('/company/:companyId/tools', async (c) => {
  const companyId = c.req.param('companyId');
  const { userId } = c.get('user');

  // Verify user has access to company
  const userCompanies = await getUserCompanies(userId);
  if (!userCompanies.some((co: { id: string }) => co.id === companyId)) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  const tools = await toolRegistry.getCompanyTools(companyId);
  return c.json({ data: tools });
});

// Configure tool for company
const configureToolSchema = z.object({
  toolId: z.string().uuid(),
  credentials: z.object({
    apiKey: z.string().optional(),
    clientId: z.string().optional(),
    clientSecret: z.string().optional(),
    accessToken: z.string().optional(),
    refreshToken: z.string().optional(),
  }),
  configOverride: z.record(z.unknown()).optional(),
});

execution.post(
  '/company/:companyId/tools/configure',
  zValidator('json', configureToolSchema),
  async (c) => {
    const companyId = c.req.param('companyId');
    const { userId } = c.get('user');
    const body = c.req.valid('json');

    const companies = await getUserCompanies(userId);
    if (!companies.some(co => co.id === companyId)) {
      throw new HTTPException(403, { message: 'Access denied' });
    }

    const id = await toolRegistry.configureToolForCompany(
      companyId,
      body.toolId,
      body.credentials,
      body.configOverride
    );

    return c.json({ success: true, data: { id } });
  }
);

// ============================================
// SKILLS
// ============================================

// Get all available skills
execution.get('/skills', async (c) => {
  const companyId = c.req.query('companyId');
  const skills = await skillRegistry.getAllSkills(companyId);
  return c.json({ data: skills });
});

// Get skills by category
execution.get('/skills/category/:category', async (c) => {
  const category = c.req.param('category');
  const skills = await skillRegistry.getSkillsByCategory(category);
  return c.json({ data: skills });
});

// Get skill by slug
execution.get('/skills/:slug', async (c) => {
  const slug = c.req.param('slug');
  const companyId = c.req.query('companyId');
  const skill = await skillRegistry.getSkillBySlug(slug, companyId);

  if (!skill) {
    throw new HTTPException(404, { message: 'Skill not found' });
  }

  return c.json({ data: skill });
});

// Get skills for an agent
execution.get('/agent/:agentId/skills', async (c) => {
  const agentId = c.req.param('agentId');
  const skills = await skillRegistry.getAgentSkills(agentId);
  return c.json({ data: skills });
});

// Install skill for agent
const installSkillSchema = z.object({
  skillId: z.string().uuid(),
  customConfig: z.record(z.unknown()).optional(),
});

execution.post(
  '/agent/:agentId/skills/install',
  zValidator('json', installSkillSchema),
  async (c) => {
    const agentId = c.req.param('agentId');
    const { userId } = c.get('user');
    const body = c.req.valid('json');

    // TODO: Verify user has access to agent's company
    const companyId = c.req.query('companyId') || '';

    const id = await skillRegistry.installSkillForAgent(
      agentId,
      body.skillId,
      companyId,
      userId,
      body.customConfig
    );

    return c.json({ success: true, data: { id } });
  }
);

// ============================================
// TASKS
// ============================================

// Create execution task
const createTaskSchema = z.object({
  companyId: z.string().uuid(),
  agentId: z.string().uuid().optional(),
  agentType: z.enum(['ceo', 'marketing', 'sales', 'support', 'content', 'landing_page', 'custom']),
  skillSlug: z.string(),
  taskType: z.string(),
  payload: z.record(z.unknown()),
  priority: z.number().min(1).max(10).optional(),
  parentTaskId: z.string().uuid().optional(),
});

execution.post('/tasks', zValidator('json', createTaskSchema), async (c) => {
  const { userId } = c.get('user');
  const body = c.req.valid('json');

  // Verify user has access to company
  const userCompanies = await getUserCompanies(userId);
  if (!userCompanies.some((co: { id: string }) => co.id === body.companyId)) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  // Verify skill exists
  const skill = await skillRegistry.getSkillBySlug(body.skillSlug, body.companyId);
  if (!skill) {
    throw new HTTPException(404, { message: 'Skill not found' });
  }

  const taskId = await executionQueue.createTask({
    ...body,
    priority: body.priority || TASK_PRIORITY.NORMAL,
  });

  return c.json({
    success: true,
    data: { taskId },
    message: 'Task created and queued',
  }, 201);
});

// Get task by ID
execution.get('/tasks/:taskId', async (c) => {
  const taskId = c.req.param('taskId');
  const task = await executionQueue.getTask(taskId);

  if (!task) {
    throw new HTTPException(404, { message: 'Task not found' });
  }

  return c.json({ data: task });
});

// Get tasks for company
execution.get('/company/:companyId/tasks', async (c) => {
  const companyId = c.req.param('companyId');
  const { userId } = c.get('user');

  const userCompanies = await getUserCompanies(userId);
  if (!userCompanies.some((co: { id: string }) => co.id === companyId)) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  const status = c.req.query('status');
  const agentType = c.req.query('agentType');
  const limit = parseInt(c.req.query('limit') || '50');
  const offset = parseInt(c.req.query('offset') || '0');

  const tasks = await executionQueue.getCompanyTasks(companyId, {
    status,
    agentType,
    limit,
    offset,
  });

  return c.json({ data: tasks });
});

// Cancel task
execution.post('/tasks/:taskId/cancel', async (c) => {
  const taskId = c.req.param('taskId');
  const success = await executionQueue.cancelTask(taskId);

  if (!success) {
    throw new HTTPException(400, { message: 'Cannot cancel task' });
  }

  return c.json({ success: true, message: 'Task cancelled' });
});

// Retry failed task
execution.post('/tasks/:taskId/retry', async (c) => {
  const taskId = c.req.param('taskId');
  const success = await executionQueue.retryTask(taskId);

  if (!success) {
    throw new HTTPException(400, { message: 'Cannot retry task' });
  }

  return c.json({ success: true, message: 'Task queued for retry' });
});

// ============================================
// QUEUE MANAGEMENT
// ============================================

// Get queue statistics
execution.get('/queues/stats', async (c) => {
  const stats = await executionQueue.getQueueStats();
  return c.json({ data: stats });
});

// Pause queue (admin only)
execution.post('/queues/:queueName/pause', async (c) => {
  const queueName = c.req.param('queueName');
  await executionQueue.pauseQueue(queueName);
  return c.json({ success: true, message: `Queue ${queueName} paused` });
});

// Resume queue (admin only)
execution.post('/queues/:queueName/resume', async (c) => {
  const queueName = c.req.param('queueName');
  await executionQueue.resumeQueue(queueName);
  return c.json({ success: true, message: `Queue ${queueName} resumed` });
});

// ============================================
// SEEDING
// ============================================

// Seed built-in tools and skills
execution.post('/seed', async (c) => {
  await toolRegistry.seedBuiltInTools();
  await skillRegistry.seedBuiltInSkills();

  return c.json({
    success: true,
    message: 'Built-in tools and skills seeded',
  });
});

export default execution;
