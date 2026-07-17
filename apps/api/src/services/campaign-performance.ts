import { and, eq, or, sql } from 'drizzle-orm';
import {
  campaigns,
  conversions,
  socialPosts,
  visitorSessions,
} from '@1person/core/db';
import { db } from '../lib/db';
import {
  findActiveFbConnection,
  resolveActiveFacebookAccess,
} from './channels/fb-messenger';
import {
  fetchFacebookPostInsights,
  type FacebookPostInsights,
} from './facebook-post-insights';

const MAX_FACEBOOK_SNAPSHOTS = 60;

interface StoredFacebookMetrics {
  externalId?: string;
  externalUrl?: string;
  publishedAt?: string;
  latest?: FacebookPostInsights;
  history?: FacebookPostInsights[];
  syncError?: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function numberValue(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function campaignSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

function updateSnapshotHistory(
  existing: FacebookPostInsights[],
  snapshot: FacebookPostInsights,
): FacebookPostInsights[] {
  const history = existing.filter((item) => item?.fetchedAt);
  const last = history.at(-1);
  if (!last) return [snapshot];

  const metricChanged = [
    'impressions',
    'reach',
    'clicks',
    'reactions',
    'comments',
    'shares',
  ].some((key) => numberValue(last[key as keyof FacebookPostInsights])
    !== numberValue(snapshot[key as keyof FacebookPostInsights]));
  const lastAgeMs = Date.now() - new Date(last.fetchedAt).getTime();

  // Manual refreshes close together replace the last point unless performance
  // changed. This keeps the JSON history useful without allowing it to grow.
  const next = !metricChanged && lastAgeMs < 30 * 60 * 1000
    ? [...history.slice(0, -1), snapshot]
    : [...history, snapshot];
  return next.slice(-MAX_FACEBOOK_SNAPSHOTS);
}

function buildRecommendation(input: {
  connected: boolean;
  publishedPosts: number;
  impressions: number;
  reach: number;
  engagements: number;
  engagementRate: number;
  sessions: number;
  conversions: number;
}): { tone: 'neutral' | 'positive' | 'attention'; title: string; message: string } {
  if (!input.connected) {
    return {
      tone: 'attention',
      title: 'Connect Facebook to measure results',
      message: 'Connect a Facebook Page in Channels, then publish a post from this campaign.',
    };
  }
  if (input.publishedPosts === 0) {
    return {
      tone: 'neutral',
      title: 'Publish a Facebook post first',
      message: 'Performance starts collecting after at least one campaign post is live.',
    };
  }
  if (input.impressions < 200 && input.reach < 200) {
    return {
      tone: 'neutral',
      title: 'Facebook is still collecting data',
      message: 'There is not enough audience data for a reliable recommendation yet.',
    };
  }
  if (input.conversions > 0) {
    return {
      tone: 'positive',
      title: 'This campaign is creating measurable actions',
      message: `${input.conversions} conversion${input.conversions === 1 ? '' : 's'} can be attributed to this campaign. Keep using the strongest post message.`,
    };
  }
  if (input.engagementRate >= 3) {
    return {
      tone: 'positive',
      title: 'People are responding to this campaign',
      message: `Engagement rate is ${input.engagementRate.toFixed(1)}%. Add a clear tracked destination to turn attention into visits and leads.`,
    };
  }
  if (input.sessions > 0) {
    return {
      tone: 'neutral',
      title: 'The campaign is bringing visitors',
      message: `${input.sessions} tracked session${input.sessions === 1 ? '' : 's'} arrived, but no conversion is recorded yet. Review the landing page offer and CTA.`,
    };
  }
  return {
    tone: 'attention',
    title: 'Try a clearer message or visual',
    message: 'The post has enough exposure but limited response. Test one stronger customer benefit before changing the whole campaign.',
  };
}

export async function getCampaignPerformance(companyId: string, campaignId: string) {
  const campaign = await db.query.campaigns.findFirst({
    where: and(eq(campaigns.id, campaignId), eq(campaigns.companyId, companyId)),
  });
  if (!campaign) return null;

  const [postRows, sessionRows, conversionRows, connection] = await Promise.all([
    db.select().from(socialPosts).where(and(
      eq(socialPosts.companyId, companyId),
      eq(socialPosts.campaignId, campaignId),
    )),
    db.select({ id: visitorSessions.id }).from(visitorSessions).where(and(
      eq(visitorSessions.companyId, companyId),
      or(
        eq(visitorSessions.campaignId, campaignId),
        eq(visitorSessions.utmCampaign, campaignId),
        eq(visitorSessions.utmCampaign, campaign.name),
        eq(visitorSessions.utmCampaign, campaignSlug(campaign.name)),
      ),
    )),
    db.select().from(conversions).where(and(
      eq(conversions.companyId, companyId),
      or(
        eq(conversions.campaignId, campaignId),
        eq(conversions.campaign, campaignId),
        eq(conversions.campaign, campaign.name),
        eq(conversions.campaign, campaignSlug(campaign.name)),
        sql`${conversions.properties}->>'campaignId' = ${campaignId}`,
      ),
    )),
    findActiveFbConnection(companyId),
  ]);

  const facebookPosts = postRows
    .filter((post) => ['facebook', 'fb'].includes(post.platform.toLowerCase()))
    .map((post) => {
      const metrics = asRecord(post.metrics);
      const facebook = asRecord(metrics.facebook) as StoredFacebookMetrics;
      const latest = facebook.latest;
      return {
        id: post.id,
        content: post.content,
        status: post.status,
        publishedAt: post.publishedAt?.toISOString() ?? facebook.publishedAt,
        externalUrl: facebook.externalUrl,
        externalId: facebook.externalId,
        syncError: facebook.syncError,
        metrics: latest ?? null,
      };
    });
  const measuredPosts = facebookPosts.filter((post) => post.metrics);
  const totals = measuredPosts.reduce((result, post) => {
    const metrics = post.metrics!;
    result.impressions += metrics.impressions;
    result.reach += metrics.reach;
    result.clicks += metrics.clicks;
    result.engagements += metrics.engagements;
    result.reactions += metrics.reactions;
    result.comments += metrics.comments;
    result.shares += metrics.shares;
    result.clicksMeasured = result.clicksMeasured || metrics.clicksMeasured;
    return result;
  }, {
    impressions: 0,
    reach: 0,
    clicks: 0,
    engagements: 0,
    reactions: 0,
    comments: 0,
    shares: 0,
    clicksMeasured: false,
  });
  const engagementRate = totals.reach > 0
    ? Number(((totals.engagements / totals.reach) * 100).toFixed(2))
    : 0;
  const revenue = conversionRows.reduce(
    (sum, conversion) => sum + numberValue(conversion.revenue || conversion.value),
    0,
  );
  const spend = numberValue(campaign.cost)
    || numberValue((campaign.metrics as Record<string, unknown> | null)?.spend);
  const publishedPosts = facebookPosts.filter((post) => post.externalId).length;
  const lastSyncedAt = measuredPosts
    .map((post) => post.metrics?.fetchedAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null;
  const recommendation = buildRecommendation({
    connected: Boolean(connection),
    publishedPosts,
    impressions: totals.impressions,
    reach: totals.reach,
    engagements: totals.engagements,
    engagementRate,
    sessions: sessionRows.length,
    conversions: conversionRows.length,
  });

  return {
    status: measuredPosts.length > 0
      ? 'ready'
      : !connection
        ? 'not_connected'
        : publishedPosts === 0
        ? 'awaiting_publish'
          : 'collecting',
    source: 'facebook_organic',
    lastSyncedAt,
    goal: campaign.goal,
    totals: {
      ...totals,
      engagementRate,
      sessions: sessionRows.length,
      conversions: conversionRows.length,
      revenue: Number(revenue.toFixed(2)),
      spend,
      roas: spend > 0 ? Number((revenue / spend).toFixed(2)) : null,
    },
    facebook: {
      connected: Boolean(connection),
      publishedPosts,
      measuredPosts: measuredPosts.length,
      posts: facebookPosts,
    },
    recommendation,
  };
}

export async function syncCampaignFacebookPerformance(
  companyId: string,
  campaignId: string,
) {
  const campaign = await db.query.campaigns.findFirst({
    where: and(eq(campaigns.id, campaignId), eq(campaigns.companyId, companyId)),
  });
  if (!campaign) return null;

  const connection = await findActiveFbConnection(companyId);
  if (!connection) {
    return getCampaignPerformance(companyId, campaignId);
  }
  const { accessToken } = await resolveActiveFacebookAccess(companyId, {
    requirePublishing: false,
  });
  const posts = await db.select().from(socialPosts).where(and(
    eq(socialPosts.companyId, companyId),
    eq(socialPosts.campaignId, campaignId),
  ));

  for (const post of posts) {
    if (!['facebook', 'fb'].includes(post.platform.toLowerCase())) continue;
    const metrics = asRecord(post.metrics);
    const facebook = asRecord(metrics.facebook) as StoredFacebookMetrics;
    if (!facebook.externalId) continue;

    try {
      const snapshot = await fetchFacebookPostInsights(accessToken, facebook.externalId);
      const history = updateSnapshotHistory(facebook.history ?? [], snapshot);
      await db.update(socialPosts).set({
        metrics: {
          ...metrics,
          impressions: snapshot.impressions,
          clicks: snapshot.clicks,
          engagement: snapshot.engagements,
          facebook: {
            ...facebook,
            latest: snapshot,
            history,
            syncError: undefined,
          },
        } as any,
      }).where(eq(socialPosts.id, post.id));
    } catch (error) {
      await db.update(socialPosts).set({
        metrics: {
          ...metrics,
          facebook: {
            ...facebook,
            syncError: error instanceof Error ? error.message : 'Facebook metrics sync failed',
          },
        } as any,
      }).where(eq(socialPosts.id, post.id));
    }
  }

  const performance = await getCampaignPerformance(companyId, campaignId);
  if (performance) {
    await db.update(campaigns).set({
      metrics: {
        ...asRecord(campaign.metrics),
        impressions: performance.totals.impressions,
        reach: performance.totals.reach,
        clicks: performance.totals.clicks,
        clicksMeasured: performance.totals.clicksMeasured,
        engagements: performance.totals.engagements,
        engagementRate: performance.totals.engagementRate,
        conversions: performance.totals.conversions,
        revenue: performance.totals.revenue,
        lastRefreshedAt: performance.lastSyncedAt,
        source: 'facebook_organic',
      } as any,
      updatedAt: new Date(),
    }).where(eq(campaigns.id, campaignId));
  }
  return performance;
}
