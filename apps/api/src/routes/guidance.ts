import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { db } from '../lib/db';
import { companies } from '@1person/core/db';
import { authMiddleware } from '../middleware/auth';
import { HTTPException } from 'hono/http-exception';
import { guidanceService } from '../services/guidance-service';

const guidanceRouter = new Hono();

// Apply auth to all routes
guidanceRouter.use('*', authMiddleware);

// Schemas
const addGuidanceSchema = z.object({
  type: z.enum(['setup_task', 'milestone', 'recommendation', 'tutorial', 'insight']),
  title: z.string().min(3).max(255),
  description: z.string().max(1000),
  actionUrl: z.string().url().optional(),
  actionLabel: z.string().max(100).optional(),
  actionType: z.enum(['link', 'modal', 'task', 'external']).optional(),
  icon: z.string().max(50).optional(),
  color: z.string().max(7).optional(),
  priority: z.enum(['critical', 'high', 'medium', 'low']),
  stageId: z.string().max(50).optional(),
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

// Get active guidance for company
guidanceRouter.get('/company/:companyId', async (c) => {
  const { userId } = c.get('user');
  const companyId = c.req.param('companyId');

  await checkCompanyOwnership(companyId, userId);

  const guidance = await guidanceService.getActiveGuidance(companyId);

  return c.json({ data: guidance });
});

// Get all guidance (including completed) for company
guidanceRouter.get('/company/:companyId/all', async (c) => {
  const { userId } = c.get('user');
  const companyId = c.req.param('companyId');

  await checkCompanyOwnership(companyId, userId);

  const guidance = await guidanceService.getAllGuidance(companyId);

  return c.json({ data: guidance });
});

// Get onboarding progress for company
guidanceRouter.get('/company/:companyId/progress', async (c) => {
  const { userId } = c.get('user');
  const companyId = c.req.param('companyId');

  await checkCompanyOwnership(companyId, userId);

  const progress = await guidanceService.getOnboardingProgress(companyId);

  return c.json({ data: progress });
});

// Mark guidance as shown
guidanceRouter.post('/:id/shown', async (c) => {
  const { userId } = c.get('user');
  const guidanceId = c.req.param('id');

  // Note: In a full implementation, we'd verify company ownership
  // through the guidance record's companyId

  await guidanceService.markAsShown(guidanceId);

  return c.json({
    success: true,
    message: 'Guidance marked as shown',
  });
});

// Complete a guidance item
guidanceRouter.post('/:id/complete', async (c) => {
  const guidanceId = c.req.param('id');

  try {
    await guidanceService.completeGuidance(guidanceId);

    return c.json({
      success: true,
      message: 'Guidance completed',
    });
  } catch (error) {
    throw new HTTPException(404, {
      message: 'Guidance not found',
    });
  }
});

// Dismiss a guidance item
guidanceRouter.post('/:id/dismiss', async (c) => {
  const guidanceId = c.req.param('id');

  try {
    await guidanceService.dismissGuidance(guidanceId);

    return c.json({
      success: true,
      message: 'Guidance dismissed',
    });
  } catch (error) {
    throw new HTTPException(404, {
      message: 'Guidance not found',
    });
  }
});

// Refresh guidance for company (generates new items if needed)
guidanceRouter.post('/company/:companyId/refresh', async (c) => {
  const { userId } = c.get('user');
  const companyId = c.req.param('companyId');

  await checkCompanyOwnership(companyId, userId);

  const guidance = await guidanceService.refreshGuidance(companyId);

  return c.json({
    success: true,
    data: guidance,
  });
});

// Add custom guidance item
guidanceRouter.post(
  '/company/:companyId',
  zValidator('json', addGuidanceSchema),
  async (c) => {
    const { userId } = c.get('user');
    const companyId = c.req.param('companyId');
    const data = c.req.valid('json');

    await checkCompanyOwnership(companyId, userId);

    const guidance = await guidanceService.addCustomGuidance(companyId, data);

    return c.json({
      success: true,
      data: guidance,
    });
  }
);

export default guidanceRouter;
