import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { db } from '../lib/db';
import { companies } from '@1person/core/db';
import { authMiddleware } from '../middleware/auth';
import { HTTPException } from 'hono/http-exception';
import { playbookService } from '../services/playbook-service';

const playbooksRouter = new Hono();

// Apply auth to all routes
playbooksRouter.use('*', authMiddleware);

// Schemas
const startPlaybookSchema = z.object({
  playbookId: z.string().uuid(),
});

const generateTasksSchema = z.object({
  stage: z.enum(['idea', 'mvp', 'launch', 'growth', 'optimize']).optional(),
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

// List all playbooks
playbooksRouter.get('/', async (c) => {
  const allPlaybooks = await playbookService.getAllPlaybooks();
  return c.json({ data: allPlaybooks });
});

// Get playbook by ID
playbooksRouter.get('/:id', async (c) => {
  const playbookId = c.req.param('id');

  const playbook = await playbookService.getPlaybook(playbookId);

  if (!playbook) {
    throw new HTTPException(404, { message: 'Playbook not found' });
  }

  return c.json(playbook);
});

// Get company playbook progress
playbooksRouter.get('/company/:companyId', async (c) => {
  const { userId } = c.get('user');
  const companyId = c.req.param('companyId');

  await checkCompanyOwnership(companyId, userId);

  const progress = await playbookService.getProgress(companyId);

  if (!progress) {
    return c.json({ data: null, message: 'No playbook started for this company' });
  }

  return c.json({ data: progress });
});

// Start playbook for company
playbooksRouter.post(
  '/company/:companyId/start',
  zValidator('json', startPlaybookSchema),
  async (c) => {
    const { userId } = c.get('user');
    const companyId = c.req.param('companyId');
    const { playbookId } = c.req.valid('json');

    await checkCompanyOwnership(companyId, userId);

    const progress = await playbookService.startPlaybook(companyId, playbookId);

    return c.json({
      success: true,
      data: progress,
    });
  }
);

// Advance to next stage
playbooksRouter.post('/company/:companyId/advance', async (c) => {
  const { userId } = c.get('user');
  const companyId = c.req.param('companyId');

  await checkCompanyOwnership(companyId, userId);

  const result = await playbookService.advanceToNextStage(companyId);

  return c.json({
    success: true,
    data: result,
  });
});

// Generate tasks for current/specified stage
playbooksRouter.post(
  '/company/:companyId/tasks',
  zValidator('json', generateTasksSchema),
  async (c) => {
    const { userId } = c.get('user');
    const companyId = c.req.param('companyId');
    const { stage } = c.req.valid('json');

    await checkCompanyOwnership(companyId, userId);

    const tasks = await playbookService.generateStageTasks(companyId, stage);

    return c.json({
      success: true,
      data: tasks,
      count: tasks.length,
    });
  }
);

// Check stage completion
playbooksRouter.get('/company/:companyId/completion', async (c) => {
  const { userId } = c.get('user');
  const companyId = c.req.param('companyId');

  await checkCompanyOwnership(companyId, userId);

  const completion = await playbookService.checkStageCompletion(companyId);

  return c.json({ data: completion });
});

// Mark milestone as achieved
playbooksRouter.post('/company/:companyId/milestone/:milestoneId', async (c) => {
  const { userId } = c.get('user');
  const companyId = c.req.param('companyId');
  const milestoneId = c.req.param('milestoneId');

  await checkCompanyOwnership(companyId, userId);

  await playbookService.achieveMilestone(companyId, milestoneId);

  return c.json({
    success: true,
    message: `Milestone ${milestoneId} achieved`,
  });
});

export default playbooksRouter;
