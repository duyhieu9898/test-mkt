import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { HTTPException } from 'hono/http-exception';
import { authMiddleware, getUserCompanies } from '../middleware/auth';
import { adsEngine } from '../services/ads-engine';
import { db } from '../lib/db';
import { adCampaigns, adConnections, adSets, ads, adRecommendations, adCampaignAnalyses, type AdRecommendationStatus } from '@1person/core/db';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { decryptMaybe } from '../lib/crypto';
import { getFacebookAdAccounts } from '../services/platforms/providers/facebook';
import { META_ADS_PERFORMANCE_DATE_PRESETS, syncMetaAds } from '../services/meta-ads-sync';
import { analyzeMetaCampaign, isDevelopmentMetaAdsFixture, calculateCostPerConversion, calculateAggregateCpa, calculate7dAnalysisWindows, loadBriefContext } from '../services/meta-ads-analysis';
import { generateMetaAdsBrief, MetaAdsBriefGenerationError } from '../services/meta-ads-brief';
import { createMetaAdsRecommendation, listMetaAdsRecommendations, listCompanyMetaAdsRecommendations, MetaAdsRecommendationNotFoundError, setMetaAdsRecommendationStatus } from '../services/meta-ads-recommendations';
import { MetaAdsReadOnlyError, toMetaAdsUserError } from '../services/meta-ads-errors';

const adsRouter = new Hono();

// Apply auth middleware
adsRouter.use('*', authMiddleware);

// Helper to verify company access
async function verifyCompanyAccess(userId: string, companyId: string): Promise<boolean> {
  const userCompanies = await getUserCompanies(userId);
  return userCompanies.some((co: { id: string }) => co.id === companyId);
}

const selectFacebookAccountSchema = z.object({ accountId: z.string().min(1) });
const analyzeCampaignSchema = z.object({
  baseline: z.object({ start: z.string().date(), end: z.string().date() }).optional(),
  current: z.object({ start: z.string().date(), end: z.string().date() }).optional(),
});
const recommendationBriefSchema = z.object({
  analysisId: z.string().uuid().optional(),
  baseline: z.object({ start: z.string().date(), end: z.string().date() }).optional(),
  current: z.object({ start: z.string().date(), end: z.string().date() }).optional(),
});
const recommendationStatusSchema = z.object({ status: z.enum(['saved', 'rejected', 'handled_manually']) });
const metaAdsSyncSchema = z.object({ performanceDatePreset: z.enum(META_ADS_PERFORMANCE_DATE_PRESETS).optional() });
const FACEBOOK_CAMPAIGNS_PAGE_SIZE = 25;

function overviewPage(value: string | undefined) {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

async function campaignTimezone(companyId: string, campaignId: string) {
  const campaign = await db.query.adCampaigns.findFirst({ where: and(eq(adCampaigns.id, campaignId), eq(adCampaigns.companyId, companyId)) });
  if (!campaign) throw new HTTPException(404, { message: 'Campaign not found' });
  const connection = await db.query.adConnections.findFirst({ where: and(eq(adConnections.id, campaign.connectionId), eq(adConnections.companyId, companyId), eq(adConnections.platform, 'facebook')) });
  return connection?.platformAccountTimezone || 'UTC';
}

adsRouter.get('/company/:companyId/facebook/assets', async (c) => {
  const companyId = c.req.param('companyId');
  const { userId } = c.get('user');
  if (!(await verifyCompanyAccess(userId, companyId))) throw new HTTPException(403, { message: 'Access denied' });
  const connection = await db.query.adConnections.findFirst({
    where: and(eq(adConnections.companyId, companyId), eq(adConnections.platform, 'facebook')),
  });
  if (!connection) throw new HTTPException(404, { message: 'Connect Facebook before choosing an Ad Account' });
  const adAccounts = await getFacebookAdAccounts(decryptMaybe(connection.accessToken));
  return c.json({ data: { adAccounts } });
});

adsRouter.post('/company/:companyId/facebook/select-account', zValidator('json', selectFacebookAccountSchema), async (c) => {
  const companyId = c.req.param('companyId');
  const { userId } = c.get('user');
  if (!(await verifyCompanyAccess(userId, companyId))) throw new HTTPException(403, { message: 'Access denied' });
  const connection = await db.query.adConnections.findFirst({
    where: and(eq(adConnections.companyId, companyId), eq(adConnections.platform, 'facebook')),
  });
  if (!connection) throw new HTTPException(404, { message: 'Connect Facebook before choosing an Ad Account' });
  const assets = await getFacebookAdAccounts(decryptMaybe(connection.accessToken));
  const selected = assets.find((asset) => asset.id === c.req.valid('json').accountId);
  if (!selected || !selected.canRead) throw new HTTPException(400, { message: 'Selected Ad Account is not accessible' });
  await db.update(adConnections).set({
    platformAccountId: selected.accountId,
    platformAccountName: selected.name,
    platformAccountCurrency: selected.currency,
    platformAccountTimezone: selected.timezoneName,
    status: 'connected',
    lastError: null,
    updatedAt: new Date(),
  }).where(eq(adConnections.id, connection.id));
  return c.json({ success: true, data: { account: selected } });
});

adsRouter.post('/company/:companyId/facebook/sync', zValidator('json', metaAdsSyncSchema), async (c) => {
  const companyId = c.req.param('companyId');
  const { userId } = c.get('user');
  if (!(await verifyCompanyAccess(userId, companyId))) throw new HTTPException(403, { message: 'Access denied' });
  try {
    const result = await syncMetaAds(companyId, c.req.valid('json').performanceDatePreset || 'last_30d');
    return c.json({ success: true, data: result });
  } catch (error) {
    throw new HTTPException(400, { message: toMetaAdsUserError(error) });
  }
});

adsRouter.get('/company/:companyId/facebook/overview', async (c) => {
  const companyId = c.req.param('companyId');
  const page = overviewPage(c.req.query('page'));
  const { userId } = c.get('user');
  if (!(await verifyCompanyAccess(userId, companyId))) throw new HTTPException(403, { message: 'Access denied' });
  const connection = await db.query.adConnections.findFirst({
    where: and(eq(adConnections.companyId, companyId), eq(adConnections.platform, 'facebook')),
  });
  if (!connection || !connection.platformAccountId) return c.json({ data: { connection: connection ? {
    status: connection.status,
    accountId: connection.platformAccountId,
    accountName: connection.platformAccountName,
    currency: connection.platformAccountCurrency,
    timezone: connection.platformAccountTimezone,
    lastSyncedAt: connection.lastUsedAt,
    lastError: connection.lastError,
  } : null, campaigns: [], developmentFixtures: [], totals: { spend: 0, impressions: 0, clicks: 0, conversions: 0, costPerConversion: null }, performanceDatePreset: connection?.metaAdsPerformanceDatePreset || 'last_30d', pagination: { page, pageSize: FACEBOOK_CAMPAIGNS_PAGE_SIZE, total: 0, totalPages: 0 } } });
  
  const accountId = connection.platformAccountId.replace(/^act_/, '');
  const importedCampaigns = await db.query.adCampaigns.findMany({
    where: and(
      eq(adCampaigns.companyId, companyId),
      eq(adCampaigns.connectionId, connection.id)
    ),
    orderBy: desc(adCampaigns.updatedAt),
  });
  const liveCampaigns = importedCampaigns.filter(
    (campaign) =>
      campaign.status !== 'archived' &&
      !isDevelopmentMetaAdsFixture(campaign.platformCampaignId) &&
      campaign.sourceAccountId === accountId
  );
  const developmentFixtures = importedCampaigns.filter((campaign) =>
    isDevelopmentMetaAdsFixture(campaign.platformCampaignId)
  );
  const total = liveCampaigns.length;
  const totalPages = Math.ceil(total / FACEBOOK_CAMPAIGNS_PAGE_SIZE);
  const rawCampaigns = liveCampaigns.slice((page - 1) * FACEBOOK_CAMPAIGNS_PAGE_SIZE, page * FACEBOOK_CAMPAIGNS_PAGE_SIZE);

  const campaignIds = rawCampaigns.map((c) => c.id);
  const analysisMap = new Map<string, string>();
  if (campaignIds.length > 0) {
    const latestAnalyses = await db.query.adCampaignAnalyses.findMany({
      where: and(eq(adCampaignAnalyses.companyId, companyId), inArray(adCampaignAnalyses.campaignId, campaignIds)),
      orderBy: desc(adCampaignAnalyses.analyzedAt),
    });
    for (const record of latestAnalyses) {
      if (!analysisMap.has(record.campaignId)) {
        analysisMap.set(record.campaignId, record.status);
      }
    }
  }

  const campaigns = rawCampaigns.map((campaign) => {
    const analysisStatus = analysisMap.get(campaign.id) || 'not_analyzed';
    const costPerConversion = calculateCostPerConversion(campaign.spentAmount, campaign.conversions);
    return {
      ...campaign,
      analysisStatus,
      costPerConversion,
    };
  });

  const totalsRaw = liveCampaigns.reduce((result, campaign) => ({
    spend: result.spend + Number(campaign.spentAmount || 0),
    impressions: result.impressions + campaign.impressions,
    clicks: result.clicks + campaign.clicks,
    conversions: result.conversions + campaign.conversions,
  }), { spend: 0, impressions: 0, clicks: 0, conversions: 0 });

  const totals = {
    ...totalsRaw,
    costPerConversion: calculateAggregateCpa(totalsRaw.spend, totalsRaw.conversions),
  };

  return c.json({
    data: {
      connection: {
        status: connection.status,
        accountId: connection.platformAccountId,
        accountName: connection.platformAccountName,
        currency: connection.platformAccountCurrency,
        timezone: connection.platformAccountTimezone,
        lastSyncedAt: connection.lastUsedAt,
        lastError: connection.lastError,
      },
      campaigns,
      developmentFixtures,
      totals,
      performanceDatePreset: connection.metaAdsPerformanceDatePreset,
      pagination: { page, pageSize: FACEBOOK_CAMPAIGNS_PAGE_SIZE, total, totalPages },
    },
  });
});

adsRouter.get('/company/:companyId/facebook/recommendations', async (c) => {
  const companyId = c.req.param('companyId');
  const { userId } = c.get('user');
  if (!(await verifyCompanyAccess(userId, companyId))) throw new HTTPException(403, { message: 'Access denied' });

  const statusParam = c.req.query('status');
  if (statusParam && !['recommended', 'saved', 'rejected', 'handled_manually'].includes(statusParam)) {
    throw new HTTPException(400, { message: 'Invalid status parameter' });
  }

  const connection = await db.query.adConnections.findFirst({
    where: and(eq(adConnections.companyId, companyId), eq(adConnections.platform, 'facebook')),
  });
  if (!connection?.platformAccountId) {
    throw new HTTPException(409, { message: 'Select a Meta Ad Account first' });
  }
  const sourceAccountId = connection.platformAccountId.replace(/^act_/, '');

  const page = overviewPage(c.req.query('page'));
  const limitStr = c.req.query('limit');
  const limit = limitStr && !isNaN(Number(limitStr)) ? Number(limitStr) : 25;

  const result = await listCompanyMetaAdsRecommendations({
    companyId,
    sourceAccountId,
    status: statusParam as AdRecommendationStatus | undefined,
    page,
    limit,
  });

  return c.json({ success: true, data: result });
});

async function requireCurrentMetaCampaign(companyId: string, campaignId: string) {
  const connection = await db.query.adConnections.findFirst({
    where: and(
      eq(adConnections.companyId, companyId),
      eq(adConnections.platform, 'facebook'),
      eq(adConnections.status, 'connected'),
    ),
  });
  if (!connection) throw new HTTPException(404, { message: 'Meta Ad Account is not connected' });

  const campaign = await db.query.adCampaigns.findFirst({
    where: and(
      eq(adCampaigns.id, campaignId),
      eq(adCampaigns.companyId, companyId),
      eq(adCampaigns.connectionId, connection.id),
    ),
  });
  if (!campaign) throw new HTTPException(404, { message: 'Campaign not found for current selected ad account' });

  const isFixture = isDevelopmentMetaAdsFixture(campaign.platformCampaignId);
  const activeAccountId = connection.platformAccountId ? connection.platformAccountId.replace(/^act_/, '') : undefined;

  if (!isFixture) {
    if (!activeAccountId) {
      throw new HTTPException(409, { message: 'Select a Meta Ad Account first' });
    }
    if (campaign.sourceAccountId !== activeAccountId) {
      throw new HTTPException(404, { message: 'Campaign does not belong to the currently selected Meta Ad Account' });
    }
  }

  return { campaign, connection, activeAccountId };
}

adsRouter.get('/company/:companyId/facebook/campaigns/:campaignId', async (c) => {
  const companyId = c.req.param('companyId');
  const campaignId = c.req.param('campaignId');
  const { userId } = c.get('user');
  if (!(await verifyCompanyAccess(userId, companyId))) throw new HTTPException(403, { message: 'Access denied' });

  const { campaign, connection } = await requireCurrentMetaCampaign(companyId, campaignId);
  const [campaignAdSets, campaignAds, latestAnalysis] = await Promise.all([
    db.query.adSets.findMany({ where: and(eq(adSets.campaignId, campaign.id), eq(adSets.companyId, companyId)), orderBy: desc(adSets.updatedAt) }),
    db.query.ads.findMany({ where: and(eq(ads.campaignId, campaign.id), eq(ads.companyId, companyId)), orderBy: desc(ads.updatedAt) }),
    db.query.adCampaignAnalyses.findFirst({
      where: and(eq(adCampaignAnalyses.companyId, companyId), eq(adCampaignAnalyses.campaignId, campaign.id)),
      orderBy: desc(adCampaignAnalyses.analyzedAt),
    }),
  ]);
  const latestRecommendation = latestAnalysis
    ? await db.query.adRecommendations.findFirst({
        where: and(
          eq(adRecommendations.companyId, companyId),
          eq(adRecommendations.campaignId, campaign.id),
          eq(adRecommendations.analysisId, latestAnalysis.id)
        ),
        orderBy: desc(adRecommendations.createdAt),
      })
    : null;
  return c.json({
    data: {
      campaign,
      adSets: campaignAdSets,
      ads: campaignAds,
      currency: connection.platformAccountCurrency || 'USD',
      // Analysis fetches the two performance windows live from Meta Insights,
      // while the hierarchy/creative context comes from the last manual sync.
      hierarchyLastSyncedAt: connection.lastUsedAt?.toISOString() || null,
      isDevelopmentFixture: isDevelopmentMetaAdsFixture(campaign.platformCampaignId),
      latestAnalysis: latestAnalysis ? {
        analysisId: latestAnalysis.id,
        status: latestAnalysis.status,
        findings: latestAnalysis.findings,
        baselineSnapshot: latestAnalysis.baselineSnapshot,
        currentSnapshot: latestAnalysis.currentSnapshot,
        analyzedAt: latestAnalysis.analyzedAt.toISOString(),
        latestRecommendation: latestRecommendation ? {
          id: latestRecommendation.id,
          status: latestRecommendation.status,
          possibleCause: latestRecommendation.possibleCause,
          suggestedAction: latestRecommendation.suggestedAction,
          createdAt: latestRecommendation.createdAt.toISOString(),
        } : null,
      } : null,
    },
  });
});

adsRouter.get('/company/:companyId/facebook/campaigns/:campaignId/ads/:adId', async (c) => {
  const companyId = c.req.param('companyId');
  const campaignId = c.req.param('campaignId');
  const adId = c.req.param('adId');
  const { userId } = c.get('user');
  if (!(await verifyCompanyAccess(userId, companyId))) throw new HTTPException(403, { message: 'Access denied' });

  const { campaign, connection } = await requireCurrentMetaCampaign(companyId, campaignId);
  const ad = await db.query.ads.findFirst({ where: and(eq(ads.id, adId), eq(ads.companyId, companyId), eq(ads.campaignId, campaign.id)) });
  if (!ad) throw new HTTPException(404, { message: 'Ad not found' });
  const adSet = await db.query.adSets.findFirst({ where: and(eq(adSets.id, ad.adSetId), eq(adSets.companyId, companyId)) });
  if (!adSet) throw new HTTPException(404, { message: 'Ad hierarchy not found' });
  return c.json({ data: { campaign, adSet, ad, currency: connection.platformAccountCurrency || 'USD' } });
});

adsRouter.post('/company/:companyId/facebook/campaigns/:campaignId/analyze', zValidator('json', analyzeCampaignSchema), async (c) => {
  const companyId = c.req.param('companyId');
  const campaignId = c.req.param('campaignId');
  const { userId } = c.get('user');
  if (!(await verifyCompanyAccess(userId, companyId))) throw new HTTPException(403, { message: 'Access denied' });

  const { connection } = await requireCurrentMetaCampaign(companyId, campaignId);
  const timezone = connection.platformAccountTimezone || 'UTC';
  const windows = calculate7dAnalysisWindows(timezone);
  try {
    const data = await analyzeMetaCampaign(companyId, campaignId, windows);
    return c.json({ success: true, data });
  } catch (error) {
    throw new HTTPException(400, { message: toMetaAdsUserError(error) });
  }
});

adsRouter.post('/company/:companyId/facebook/campaigns/:campaignId/recommendation-brief', zValidator('json', recommendationBriefSchema), async (c) => {
  const companyId = c.req.param('companyId');
  const campaignId = c.req.param('campaignId');
  const { userId } = c.get('user');
  if (!(await verifyCompanyAccess(userId, companyId))) throw new HTTPException(403, { message: 'Access denied' });

  const { campaign, connection } = await requireCurrentMetaCampaign(companyId, campaignId);
  const body = c.req.valid('json');
  const timezone = connection.platformAccountTimezone || 'UTC';

  try {
    let analysisRecord: any = null;

    if (body.analysisId) {
      analysisRecord = await db.query.adCampaignAnalyses.findFirst({
        where: and(
          eq(adCampaignAnalyses.id, body.analysisId),
          eq(adCampaignAnalyses.companyId, companyId),
          eq(adCampaignAnalyses.campaignId, campaign.id)
        ),
      });
      if (!analysisRecord) throw new HTTPException(404, { message: 'Analysis run not found for this campaign' });
    } else {
      const windows = calculate7dAnalysisWindows(timezone);
      const data = await analyzeMetaCampaign(companyId, campaign.id, windows);
      analysisRecord = {
        id: data.analysisId,
        companyId,
        campaignId: campaign.id,
        status: data.status,
        baselineSnapshot: data.baseline,
        currentSnapshot: data.current,
        findings: data.findings,
        targetName: data.target.name,
        briefContext: data.target.briefContext,
      };
    }

    if (analysisRecord.status === 'insufficient_data' || !Array.isArray(analysisRecord.findings) || analysisRecord.findings.length === 0) {
      return c.json({ success: true, data: { analysisId: analysisRecord.id, status: analysisRecord.status, brief: null, recommendation: null } });
    }

    const targetName = campaign.name || analysisRecord.targetName || 'Campaign';
    const briefContext = analysisRecord.briefContext && Object.keys(analysisRecord.briefContext).length > 0
      ? analysisRecord.briefContext
      : await loadBriefContext(companyId, campaign.id, campaign.objective);

    const brief = await generateMetaAdsBrief(companyId, {
      targetName,
      findings: analysisRecord.findings,
      campaignContext: briefContext,
    });

    const analysisForRec = {
      analysisId: analysisRecord.id,
      target: { id: campaign.id, name: targetName, objective: campaign.objective || 'traffic' },
      baseline: analysisRecord.baselineSnapshot,
      current: analysisRecord.currentSnapshot,
      findings: analysisRecord.findings,
    } as any;

    const recommendation = brief
      ? await createMetaAdsRecommendation({ companyId, campaignId: campaign.id, analysis: analysisForRec, brief })
      : null;

    return c.json({ success: true, data: { analysisId: analysisRecord.id, brief, recommendation } });
  } catch (error) {
    if (error instanceof MetaAdsBriefGenerationError) {
      throw new HTTPException(422, { message: error.message });
    }
    throw error;
  }
});

adsRouter.get('/company/:companyId/facebook/campaigns/:campaignId/recommendations', async (c) => {
  const companyId = c.req.param('companyId');
  const campaignId = c.req.param('campaignId');
  const { userId } = c.get('user');
  if (!(await verifyCompanyAccess(userId, companyId))) throw new HTTPException(403, { message: 'Access denied' });

  const { campaign } = await requireCurrentMetaCampaign(companyId, campaignId);
  return c.json({ data: await listMetaAdsRecommendations(companyId, campaign.id) });
});

adsRouter.patch('/company/:companyId/facebook/recommendations/:recommendationId', zValidator('json', recommendationStatusSchema), async (c) => {
  const companyId = c.req.param('companyId');
  const recommendationId = c.req.param('recommendationId');
  const { userId } = c.get('user');
  if (!(await verifyCompanyAccess(userId, companyId))) throw new HTTPException(403, { message: 'Access denied' });

  const connection = await db.query.adConnections.findFirst({
    where: and(eq(adConnections.companyId, companyId), eq(adConnections.platform, 'facebook')),
  });
  if (!connection?.platformAccountId) {
    throw new HTTPException(409, { message: 'Select a Meta Ad Account first' });
  }
  const sourceAccountId = connection.platformAccountId.replace(/^act_/, '');

  try {
    const recommendation = await setMetaAdsRecommendationStatus(companyId, recommendationId, c.req.valid('json').status as AdRecommendationStatus, sourceAccountId);
    return c.json({ success: true, data: recommendation });
  } catch (error) {
    if (error instanceof MetaAdsRecommendationNotFoundError) throw new HTTPException(404, { message: error.message });
    throw error;
  }
});

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

  // Connection records contain encrypted credentials for server-side provider
  // calls. They must never be included in a browser response.
  const safeConnections = connections.map(({ accessToken, refreshToken, ...connection }) => connection);
  return c.json({ data: safeConnections });
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
adsRouter.post('/company/:companyId/campaigns/:campaignId/launch', async (c) => {
  const companyId = c.req.param('companyId');
  const campaignId = c.req.param('campaignId');
  const { userId } = c.get('user');
  if (!(await verifyCompanyAccess(userId, companyId))) throw new HTTPException(403, { message: 'Access denied' });

  try {
    const result = await adsEngine.launchCampaign(campaignId, companyId);
    if (!result.success) {
      throw new HTTPException(400, { message: result.error || 'Failed to launch campaign' });
    }
    return c.json({ success: true, message: 'Campaign launched' });
  } catch (error) {
    if (error instanceof MetaAdsReadOnlyError) throw new HTTPException(403, { message: error.message });
    throw error;
  }
});

// Pause campaign
adsRouter.post('/company/:companyId/campaigns/:campaignId/pause', async (c) => {
  const companyId = c.req.param('companyId');
  const campaignId = c.req.param('campaignId');
  const { userId } = c.get('user');
  if (!(await verifyCompanyAccess(userId, companyId))) throw new HTTPException(403, { message: 'Access denied' });

  try {
    const result = await adsEngine.pauseCampaign(campaignId, companyId);
    if (!result.success) {
      throw new HTTPException(400, { message: result.error || 'Failed to pause campaign' });
    }
    return c.json({ success: true, message: 'Campaign paused' });
  } catch (error) {
    if (error instanceof MetaAdsReadOnlyError) throw new HTTPException(403, { message: error.message });
    throw error;
  }
});

// Fetch campaign performance
adsRouter.post('/company/:companyId/campaigns/:campaignId/fetch-performance', async (c) => {
  const companyId = c.req.param('companyId');
  const campaignId = c.req.param('campaignId');
  const { userId } = c.get('user');
  if (!(await verifyCompanyAccess(userId, companyId))) throw new HTTPException(403, { message: 'Access denied' });

  const campaign = await db.query.adCampaigns.findFirst({
    where: and(eq(adCampaigns.id, campaignId), eq(adCampaigns.companyId, companyId)),
  });
  if (!campaign) throw new HTTPException(404, { message: 'Campaign not found' });
  if (campaign.platform === 'facebook') throw new HTTPException(403, { message: 'Synced Meta campaigns are read-only' });

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
