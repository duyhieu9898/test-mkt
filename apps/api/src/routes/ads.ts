import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { HTTPException } from 'hono/http-exception';
import { authMiddleware, getUserCompanies } from '../middleware/auth';
import { adsEngine } from '../services/ads-engine';

const adsRouter = new Hono();

// Apply auth middleware
adsRouter.use('*', authMiddleware);

// Helper to verify company access
async function verifyCompanyAccess(userId: string, companyId: string): Promise<boolean> {
  const userCompanies = await getUserCompanies(userId);
  return userCompanies.some((co: { id: string }) => co.id === companyId);
}

// ============================================
// AD CONNECTIONS
// ============================================

// Connect an ad platform
const connectPlatformSchema = z.object({
  platform: z.enum(['facebook', 'instagram', 'google', 'linkedin', 'tiktok']),
  accessToken: z.string().min(1),
  refreshToken: z.string().optional(),
  tokenExpiresAt: z.string().optional().transform((s) => (s ? new Date(s) : undefined)),
  platformAccountId: z.string().min(1),
  platformAccountName: z.string().optional(),
  platformBusinessId: z.string().optional(),
  permissions: z.array(z.string()).optional(),
});

adsRouter.post(
  '/company/:companyId/connections',
  zValidator('json', connectPlatformSchema),
  async (c) => {
    const companyId = c.req.param('companyId');
    const { userId } = c.get('user');
    const body = c.req.valid('json');

    if (!(await verifyCompanyAccess(userId, companyId))) {
      throw new HTTPException(403, { message: 'Access denied' });
    }

    const connectionId = await adsEngine.connectAdPlatform(companyId, body.platform, {
      accessToken: body.accessToken,
      refreshToken: body.refreshToken,
      tokenExpiresAt: body.tokenExpiresAt,
      platformAccountId: body.platformAccountId,
      platformAccountName: body.platformAccountName,
      platformBusinessId: body.platformBusinessId,
      permissions: body.permissions,
    });

    return c.json({
      success: true,
      data: { connectionId },
      message: `${body.platform} ad account connected`,
    });
  }
);

// Get connections
adsRouter.get('/company/:companyId/connections', async (c) => {
  const companyId = c.req.param('companyId');
  const { userId } = c.get('user');

  if (!(await verifyCompanyAccess(userId, companyId))) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  const connections = await adsEngine.getConnections(companyId);

  return c.json({ data: connections });
});

// ============================================
// CAMPAIGNS
// ============================================

// Create campaign
const createCampaignSchema = z.object({
  connectionId: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().optional(),
  platform: z.enum(['facebook', 'instagram', 'google', 'linkedin', 'tiktok']),
  objective: z.enum([
    'awareness',
    'traffic',
    'engagement',
    'leads',
    'app_promotion',
    'sales',
    'conversions',
  ]),
  dailyBudget: z.number().positive().optional(),
  totalBudget: z.number().positive().optional(),
  startDate: z.string().optional().transform((s) => (s ? new Date(s) : undefined)),
  endDate: z.string().optional().transform((s) => (s ? new Date(s) : undefined)),
  targetAudience: z
    .object({
      locations: z.array(z.string()).optional(),
      ageMin: z.number().min(13).max(65).optional(),
      ageMax: z.number().min(13).max(65).optional(),
      genders: z.array(z.string()).optional(),
      interests: z.array(z.string()).optional(),
      behaviors: z.array(z.string()).optional(),
    })
    .optional(),
  agentId: z.string().uuid().optional(),
});

adsRouter.post(
  '/company/:companyId/campaigns',
  zValidator('json', createCampaignSchema),
  async (c) => {
    const companyId = c.req.param('companyId');
    const { userId } = c.get('user');
    const body = c.req.valid('json');

    if (!(await verifyCompanyAccess(userId, companyId))) {
      throw new HTTPException(403, { message: 'Access denied' });
    }

    const campaignId = await adsEngine.createCampaign({
      companyId,
      ...body,
    });

    return c.json({
      success: true,
      data: { campaignId },
      message: 'Campaign created',
    });
  }
);

// Get campaigns
adsRouter.get('/company/:companyId/campaigns', async (c) => {
  const companyId = c.req.param('companyId');
  const { userId } = c.get('user');
  const status = c.req.query('status');
  const platform = c.req.query('platform');
  const limit = parseInt(c.req.query('limit') || '50');

  if (!(await verifyCompanyAccess(userId, companyId))) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  const campaigns = await adsEngine.getCampaigns(companyId, {
    status,
    platform,
    limit,
  });

  return c.json({ data: campaigns });
});

// Launch campaign
adsRouter.post('/campaigns/:campaignId/launch', async (c) => {
  const campaignId = c.req.param('campaignId');

  const result = await adsEngine.launchCampaign(campaignId);

  if (!result.success) {
    throw new HTTPException(400, { message: result.error || 'Failed to launch campaign' });
  }

  return c.json({
    success: true,
    message: 'Campaign launched',
  });
});

// Pause campaign
adsRouter.post('/campaigns/:campaignId/pause', async (c) => {
  const campaignId = c.req.param('campaignId');

  const result = await adsEngine.pauseCampaign(campaignId);

  if (!result.success) {
    throw new HTTPException(400, { message: result.error || 'Failed to pause campaign' });
  }

  return c.json({
    success: true,
    message: 'Campaign paused',
  });
});

// ============================================
// AD SETS
// ============================================

// Create ad set
const createAdSetSchema = z.object({
  campaignId: z.string().uuid(),
  name: z.string().min(1),
  dailyBudget: z.number().positive().optional(),
  bidAmount: z.number().positive().optional(),
  targetAudience: z.record(z.unknown()).optional(),
  placements: z.array(z.string()).optional(),
});

adsRouter.post(
  '/company/:companyId/ad-sets',
  zValidator('json', createAdSetSchema),
  async (c) => {
    const companyId = c.req.param('companyId');
    const { userId } = c.get('user');
    const body = c.req.valid('json');

    if (!(await verifyCompanyAccess(userId, companyId))) {
      throw new HTTPException(403, { message: 'Access denied' });
    }

    const adSetId = await adsEngine.createAdSet({
      companyId,
      ...body,
    });

    return c.json({
      success: true,
      data: { adSetId },
      message: 'Ad set created',
    });
  }
);

// ============================================
// ADS
// ============================================

// Create ad
const createAdSchema = z.object({
  adSetId: z.string().uuid(),
  campaignId: z.string().uuid(),
  name: z.string().min(1),
  type: z.enum(['image', 'video', 'carousel']).optional(),
  headline: z.string().optional(),
  primaryText: z.string().min(1),
  description: z.string().optional(),
  callToAction: z.string().optional(),
  destinationUrl: z.string().url(),
  imageUrl: z.string().url().optional(),
  videoUrl: z.string().url().optional(),
  agentId: z.string().uuid().optional(),
});

adsRouter.post('/company/:companyId/ads', zValidator('json', createAdSchema), async (c) => {
  const companyId = c.req.param('companyId');
  const { userId } = c.get('user');
  const body = c.req.valid('json');

  if (!(await verifyCompanyAccess(userId, companyId))) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  const adId = await adsEngine.createAd({
    companyId,
    ...body,
  });

  return c.json({
    success: true,
    data: { adId },
    message: 'Ad created',
  });
});

// ============================================
// PERFORMANCE & METRICS
// ============================================

// Fetch campaign performance
adsRouter.post('/campaigns/:campaignId/fetch-performance', async (c) => {
  const campaignId = c.req.param('campaignId');

  await adsEngine.fetchCampaignPerformance(campaignId);

  return c.json({
    success: true,
    message: 'Performance data fetched',
  });
});

// Get metrics summary
adsRouter.get('/company/:companyId/metrics', async (c) => {
  const companyId = c.req.param('companyId');
  const { userId } = c.get('user');

  if (!(await verifyCompanyAccess(userId, companyId))) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  const metrics = await adsEngine.getMetricsSummary(companyId);

  return c.json({ data: metrics });
});

// ============================================
// AI CONTENT GENERATION
// ============================================

// Generate ad creative
const generateCreativeSchema = z.object({
  platform: z.enum(['facebook', 'instagram', 'google', 'linkedin']),
  objective: z.string().min(1),
  productName: z.string().min(1),
  productDescription: z.string().min(1),
  targetAudience: z.string().min(1),
  tone: z.enum(['professional', 'casual', 'urgent', 'inspirational']).optional(),
});

adsRouter.post(
  '/company/:companyId/generate-creative',
  zValidator('json', generateCreativeSchema),
  async (c) => {
    const companyId = c.req.param('companyId');
    const { userId } = c.get('user');
    const body = c.req.valid('json');

    if (!(await verifyCompanyAccess(userId, companyId))) {
      throw new HTTPException(403, { message: 'Access denied' });
    }

    const creative = await adsEngine.generateAdCreative({
      companyId,
      ...body,
    });

    return c.json({
      success: true,
      data: creative,
    });
  }
);

export default adsRouter;
