import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { HTTPException } from 'hono/http-exception';
import { authMiddleware, getUserCompanies } from '../middleware/auth';
import { marketingDistributionWorkflow } from '../services/workflows/marketing-distribution-workflow';

const workflows = new Hono();

// Apply auth middleware
workflows.use('*', authMiddleware);

// Helper to verify company access
async function verifyCompanyAccess(userId: string, companyId: string): Promise<boolean> {
  const userCompanies = await getUserCompanies(userId);
  return userCompanies.some((co: { id: string }) => co.id === companyId);
}

// ============================================
// MARKETING DISTRIBUTION WORKFLOW
// ============================================

const executeMarketingWorkflowSchema = z.object({
  topic: z.string().min(1),
  platform: z.enum(['facebook', 'instagram', 'twitter', 'linkedin']),
  contentType: z.enum(['educational', 'promotional', 'engagement', 'announcement']).default('engagement'),
  targetAudience: z.string().optional(),
  scheduledTime: z.string().optional().transform((s) => (s ? new Date(s) : undefined)),
  generateImage: z.boolean().default(false),
  campaignName: z.string().optional(),
  agentId: z.string().uuid().optional(),
});

/**
 * Execute the marketing distribution workflow
 * Generates content and publishes/schedules to social media
 */
workflows.post(
  '/company/:companyId/marketing/distribute',
  zValidator('json', executeMarketingWorkflowSchema),
  async (c) => {
    const companyId = c.req.param('companyId');
    const { userId } = c.get('user');
    const body = c.req.valid('json');

    if (!(await verifyCompanyAccess(userId, companyId))) {
      throw new HTTPException(403, { message: 'Access denied' });
    }

    // Use provided agentId or default to a system agent ID
    const agentId = body.agentId || 'system-marketing-agent';

    const result = await marketingDistributionWorkflow.execute({
      companyId,
      agentId,
      topic: body.topic,
      platform: body.platform,
      contentType: body.contentType,
      targetAudience: body.targetAudience,
      scheduledTime: body.scheduledTime,
      generateImage: body.generateImage,
      campaignName: body.campaignName,
    });

    if (!result.success) {
      throw new HTTPException(400, { message: result.error || 'Workflow failed' });
    }

    return c.json({
      success: true,
      data: {
        postId: result.postId,
        content: result.content,
        status: result.status,
        platformPostId: result.platformPostId,
        platformPostUrl: result.platformPostUrl,
      },
      message:
        result.status === 'published'
          ? 'Content published successfully!'
          : `Content scheduled for ${body.scheduledTime}`,
    });
  }
);

// Create content calendar
const createCalendarSchema = z.object({
  platform: z.enum(['facebook', 'instagram', 'twitter', 'linkedin']),
  postsPerWeek: z.number().min(1).max(14).default(3),
  topics: z.array(z.string()).min(1).max(30),
  startDate: z.string().optional().transform((s) => (s ? new Date(s) : undefined)),
  campaignName: z.string().optional(),
  agentId: z.string().uuid().optional(),
});

workflows.post(
  '/company/:companyId/marketing/calendar',
  zValidator('json', createCalendarSchema),
  async (c) => {
    const companyId = c.req.param('companyId');
    const { userId } = c.get('user');
    const body = c.req.valid('json');

    if (!(await verifyCompanyAccess(userId, companyId))) {
      throw new HTTPException(403, { message: 'Access denied' });
    }

    const agentId = body.agentId || 'system-marketing-agent';

    const result = await marketingDistributionWorkflow.createContentCalendar(
      companyId,
      agentId,
      {
        platform: body.platform,
        postsPerWeek: body.postsPerWeek,
        topics: body.topics,
        startDate: body.startDate,
        campaignName: body.campaignName,
      }
    );

    return c.json({
      success: result.success,
      data: {
        scheduledPosts: result.scheduledPosts,
        totalScheduled: result.scheduledPosts.length,
      },
      errors: result.errors.length > 0 ? result.errors : undefined,
      message: `Created content calendar with ${result.scheduledPosts.length} posts`,
    });
  }
);

// Analyze and optimize
workflows.get('/company/:companyId/marketing/analyze', async (c) => {
  const companyId = c.req.param('companyId');
  const { userId } = c.get('user');
  const days = parseInt(c.req.query('days') || '7');

  if (!(await verifyCompanyAccess(userId, companyId))) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  const analysis = await marketingDistributionWorkflow.analyzeAndOptimize(companyId, days);

  return c.json({
    success: true,
    data: analysis,
  });
});

export default workflows;
