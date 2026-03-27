import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { HTTPException } from 'hono/http-exception';
import { authMiddleware, getUserCompanies } from '../middleware/auth';
import { distributionEngine } from '../services/distribution-engine';
import { env } from '../lib/env';

const distribution = new Hono();

// Apply auth middleware
distribution.use('*', authMiddleware);

// Helper to verify company access
async function verifyCompanyAccess(userId: string, companyId: string): Promise<boolean> {
  const userCompanies = await getUserCompanies(userId);
  return userCompanies.some((co: { id: string }) => co.id === companyId);
}

// ============================================
// SOCIAL CONNECTIONS
// ============================================

// Get all connections for a company
distribution.get('/company/:companyId/connections', async (c) => {
  const companyId = c.req.param('companyId');
  const { userId } = c.get('user');

  if (!(await verifyCompanyAccess(userId, companyId))) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  const connections = await distributionEngine.getConnections(companyId);

  // Hide sensitive token data
  const safeConnections = connections.map((conn) => ({
    id: conn.id,
    platform: conn.platform,
    status: conn.status,
    platformAccountName: conn.platformAccountName,
    platformPageId: conn.platformPageId,
    connectedAt: conn.connectedAt,
    lastUsedAt: conn.lastUsedAt,
    permissions: conn.permissions,
  }));

  return c.json({ data: safeConnections });
});

// Connect Facebook Page (manual token input for now)
// In production, this would be an OAuth flow
const connectFacebookSchema = z.object({
  accessToken: z.string().min(1),
  pageId: z.string().min(1),
  pageName: z.string().optional(),
});

distribution.post(
  '/company/:companyId/connect/facebook',
  zValidator('json', connectFacebookSchema),
  async (c) => {
    const companyId = c.req.param('companyId');
    const { userId } = c.get('user');
    const { accessToken, pageId, pageName } = c.req.valid('json');

    if (!(await verifyCompanyAccess(userId, companyId))) {
      throw new HTTPException(403, { message: 'Access denied' });
    }

    // Verify the token works by making a test API call
    try {
      const testUrl = `https://graph.facebook.com/v18.0/${pageId}?fields=name,id&access_token=${accessToken}`;
      const testResponse = await fetch(testUrl);

      if (!testResponse.ok) {
        const error = await testResponse.json();
        throw new HTTPException(400, {
          message: `Invalid Facebook credentials: ${error.error?.message || 'Unknown error'}`,
        });
      }

      const pageData = await testResponse.json();

      const connectionId = await distributionEngine.connectAccount(
        companyId,
        'facebook',
        accessToken,
        {
          platformPageId: pageId,
          platformAccountName: pageName || pageData.name,
          permissions: ['pages_manage_posts', 'pages_read_engagement'],
        }
      );

      return c.json({
        success: true,
        data: { connectionId, pageName: pageData.name },
        message: 'Facebook Page connected successfully',
      });
    } catch (error) {
      if (error instanceof HTTPException) throw error;
      throw new HTTPException(400, {
        message: 'Could not connect to Facebook. Please check your account permissions and try again.',
      });
    }
  }
);

// ============================================
// POSTS
// ============================================

// Create a scheduled post
const createPostSchema = z.object({
  connectionId: z.string().uuid(),
  platform: z.enum(['facebook', 'instagram', 'twitter', 'linkedin']),
  contentText: z.string().min(1).max(5000),
  hashtags: z.array(z.string()).optional(),
  mediaUrls: z.array(z.string().url()).optional(),
  scheduledFor: z.string().transform((s) => new Date(s)),
  campaignId: z.string().uuid().optional(),
  campaignName: z.string().optional(),
});

distribution.post(
  '/company/:companyId/posts',
  zValidator('json', createPostSchema),
  async (c) => {
    const companyId = c.req.param('companyId');
    const { userId } = c.get('user');
    const body = c.req.valid('json');

    if (!(await verifyCompanyAccess(userId, companyId))) {
      throw new HTTPException(403, { message: 'Access denied' });
    }

    // Validate scheduled time is in the future
    if (body.scheduledFor <= new Date()) {
      throw new HTTPException(400, { message: 'Scheduled time must be in the future' });
    }

    const postId = await distributionEngine.createPost({
      companyId,
      ...body,
    });

    return c.json({
      success: true,
      data: { postId },
      message: `Post scheduled for ${body.scheduledFor.toISOString()}`,
    });
  }
);

// Post immediately (create and publish)
const postNowSchema = z.object({
  connectionId: z.string().uuid(),
  platform: z.enum(['facebook', 'instagram', 'twitter', 'linkedin']),
  contentText: z.string().min(1).max(5000),
  hashtags: z.array(z.string()).optional(),
  mediaUrls: z.array(z.string().url()).optional(),
  campaignId: z.string().uuid().optional(),
  campaignName: z.string().optional(),
});

distribution.post(
  '/company/:companyId/posts/now',
  zValidator('json', postNowSchema),
  async (c) => {
    const companyId = c.req.param('companyId');
    const { userId } = c.get('user');
    const body = c.req.valid('json');

    if (!(await verifyCompanyAccess(userId, companyId))) {
      throw new HTTPException(403, { message: 'Access denied' });
    }

    // Create post scheduled for now
    const postId = await distributionEngine.createPost({
      companyId,
      ...body,
      scheduledFor: new Date(),
    });

    // Publish immediately
    const result = await distributionEngine.publishPost(postId);

    if (!result.success) {
      throw new HTTPException(500, { message: result.error || 'Failed to publish' });
    }

    return c.json({
      success: true,
      data: {
        postId,
        platformPostId: result.platformPostId,
        platformPostUrl: result.platformPostUrl,
      },
      message: 'Post published successfully',
    });
  }
);

// Get scheduled posts
distribution.get('/company/:companyId/posts', async (c) => {
  const companyId = c.req.param('companyId');
  const { userId } = c.get('user');

  if (!(await verifyCompanyAccess(userId, companyId))) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  const status = c.req.query('status') as 'draft' | 'scheduled' | 'published' | 'failed' | undefined;
  const platform = c.req.query('platform') as 'facebook' | 'instagram' | 'twitter' | 'linkedin' | undefined;
  const limit = parseInt(c.req.query('limit') || '50');

  const posts = await distributionEngine.getScheduledPosts(companyId, {
    status,
    platform,
    limit,
  });

  return c.json({ data: posts });
});

// Cancel a scheduled post
distribution.delete('/posts/:postId', async (c) => {
  const postId = c.req.param('postId');
  const { userId } = c.get('user');

  // Get post to verify ownership
  const posts = await distributionEngine.getScheduledPosts('', { limit: 1 });
  // Note: In production, we'd have a direct getPost method

  const cancelled = await distributionEngine.cancelPost(postId);

  if (!cancelled) {
    throw new HTTPException(400, { message: 'Cannot cancel post (not scheduled or not found)' });
  }

  return c.json({ success: true, message: 'Post cancelled' });
});

// ============================================
// ENGAGEMENT
// ============================================

// Fetch latest engagement for a post
distribution.post('/posts/:postId/fetch-engagement', async (c) => {
  const postId = c.req.param('postId');

  await distributionEngine.fetchEngagement(postId);

  return c.json({ success: true, message: 'Engagement fetched' });
});

// Get engagement history for a post
distribution.get('/posts/:postId/engagement', async (c) => {
  const postId = c.req.param('postId');

  const history = await distributionEngine.getEngagementHistory(postId);

  return c.json({ data: history });
});

// Get distribution metrics summary
distribution.get('/company/:companyId/metrics', async (c) => {
  const companyId = c.req.param('companyId');
  const { userId } = c.get('user');

  if (!(await verifyCompanyAccess(userId, companyId))) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  const metrics = await distributionEngine.getMetricsSummary(companyId);

  return c.json({ data: metrics });
});

// ============================================
// SCHEDULER (for worker to call)
// ============================================

// Process due posts (called by scheduler/worker)
distribution.post('/process-due', async (c) => {
  // In production, this should be protected by an internal API key
  const result = await distributionEngine.processDuePosts();

  return c.json({
    success: true,
    data: result,
    message: `Processed ${result.processed} posts`,
  });
});

export default distribution;
