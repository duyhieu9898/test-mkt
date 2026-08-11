import { and, eq } from 'drizzle-orm';
import { adCampaigns, adConnections, adSets, ads } from '@1person/core/db';
import { db } from '../lib/db';
import { decryptMaybe } from '../lib/crypto';

const META_API_VERSION = 'v18.0';
const META_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;

type MetaStatus = 'ACTIVE' | 'PAUSED' | 'ARCHIVED' | 'DELETED' | string;
type MetaCampaign = {
  id: string;
  name?: string;
  status?: MetaStatus;
  effective_status?: MetaStatus;
  objective?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  start_time?: string;
  stop_time?: string;
};
type MetaAdSet = {
  id: string;
  name?: string;
  status?: MetaStatus;
  effective_status?: MetaStatus;
  campaign_id?: string;
  daily_budget?: string;
  bid_amount?: string;
  bid_strategy?: string;
  targeting?: Record<string, unknown>;
};
type MetaAd = {
  id: string;
  name?: string;
  status?: MetaStatus;
  effective_status?: MetaStatus;
  campaign_id?: string;
  adset_id?: string;
  creative?: {
    id?: string;
    thumbnail_url?: string;
    object_type?: string;
    object_story_spec?: {
      link_data?: {
        name?: string;
        message?: string;
        description?: string;
        link?: string;
        call_to_action?: { type?: string };
      };
    };
  };
};
type MetaInsight = {
  campaign_id?: string;
  adset_id?: string;
  ad_id?: string;
  impressions?: string;
  clicks?: string;
  reach?: string;
  frequency?: string;
  spend?: string;
  actions?: Array<{ action_type?: string; value?: string }>;
};

type MetaPage<T> = { data?: T[]; paging?: { next?: string } };
export const META_ADS_PERFORMANCE_DATE_PRESETS = [
  'today',
  'yesterday',
  'today_and_yesterday',
  'last_7d',
  'last_30d',
  'last_90d',
  'last_360d',
  'last_720d',
  'this_week',
  'this_month',
  'last_month',
] as const;
export type MetaAdsPerformanceDatePreset = (typeof META_ADS_PERFORMANCE_DATE_PRESETS)[number];

function toNumber(value: string | undefined) {
  return Number(value || 0) || 0;
}
function toDate(value: string | undefined) {
  return value ? new Date(value) : undefined;
}
export function mapMetaAdsStatus(
  status: MetaStatus | undefined
): 'active' | 'paused' | 'pending_review' | 'completed' | 'rejected' | 'archived' | 'draft' {
  if (status === 'ACTIVE') return 'active';
  if (status === 'PAUSED') return 'paused';
  if (status === 'PENDING_REVIEW' || status === 'IN_REVIEW') return 'pending_review';
  if (status === 'COMPLETED') return 'completed';
  if (status === 'REJECTED' || status === 'DISAPPROVED') return 'rejected';
  if (status === 'ARCHIVED' || status === 'DELETED') return 'archived';
  return 'draft';
}
function mapObjective(
  value: string | undefined
): 'awareness' | 'traffic' | 'engagement' | 'leads' | 'app_promotion' | 'sales' | 'conversions' {
  const objective = value?.toLowerCase() || '';
  if (objective.includes('awareness') || objective.includes('brand')) return 'awareness';
  if (objective.includes('engagement')) return 'engagement';
  if (objective.includes('lead')) return 'leads';
  if (objective.includes('app')) return 'app_promotion';
  if (objective.includes('sale')) return 'sales';
  if (objective.includes('conversion')) return 'conversions';
  return 'traffic';
}
function mapAdType(
  objectType: string | undefined
): 'image' | 'video' | 'carousel' | 'collection' | 'stories' | 'text' {
  const type = objectType?.toUpperCase() || '';
  if (type.includes('VIDEO')) return 'video';
  if (type.includes('CAROUSEL')) return 'carousel';
  if (type.includes('COLLECTION')) return 'collection';
  return 'image';
}
function conversionCount(actions: MetaInsight['actions']) {
  return (actions || [])
    .filter((action) =>
      ['purchase', 'lead', 'complete_registration', 'offsite_conversion'].includes(
        action.action_type || ''
      )
    )
    .reduce((total, action) => total + toNumber(action.value), 0);
}

function accountDate(timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function shiftDate(value: string, days: number) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function performanceTimeRange(preset: MetaAdsPerformanceDatePreset, timezone: string) {
  const today = accountDate(timezone);
  const rangeForDays = (days: number) => ({
    since: shiftDate(today, 1 - days),
    until: today,
    days,
  });
  let range: { since: string; until: string; days: number };
  if (preset === 'today') range = { since: today, until: today, days: 1 };
  else if (preset === 'yesterday') {
    const yesterday = shiftDate(today, -1);
    range = { since: yesterday, until: yesterday, days: 1 };
  } else if (preset === 'today_and_yesterday')
    range = { since: shiftDate(today, -1), until: today, days: 2 };
  else if (preset === 'last_7d') range = rangeForDays(7);
  else if (preset === 'last_30d') range = rangeForDays(30);
  else if (preset === 'last_90d') range = rangeForDays(90);
  else if (preset === 'last_360d') range = rangeForDays(360);
  else if (preset === 'last_720d') range = rangeForDays(720);
  else if (preset === 'this_week') {
    const offset = (new Date(`${today}T00:00:00.000Z`).getUTCDay() + 6) % 7;
    range = { since: shiftDate(today, -offset), until: today, days: offset + 1 };
  } else if (preset === 'this_month') {
    const since = `${today.slice(0, 8)}01`;
    range = {
      since,
      until: today,
      days:
        Math.round(
          (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${since}T00:00:00Z`)) / 86_400_000
        ) + 1,
    };
  } else {
    const firstOfThisMonth = `${today.slice(0, 8)}01`;
    const until = shiftDate(firstOfThisMonth, -1);
    const since = `${until.slice(0, 8)}01`;
    range = { since, until, days: Number(until.slice(8)) };
  }
  return {
    ...range,
    encoded: encodeURIComponent(JSON.stringify({ since: range.since, until: range.until })),
  };
}

/** Shared read-only Graph pagination helper for sync and on-demand analysis. */
export async function fetchMetaAdsPages<T>(path: string, accessToken: string): Promise<T[]> {
  const rows: T[] = [];
  let url: string | undefined =
    `${META_BASE_URL}/${path}${path.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(accessToken)}`;
  for (let pageNumber = 0; url && pageNumber < 100; pageNumber += 1) {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'graph.facebook.com')
      throw new Error('Meta Ads pagination returned an invalid URL');
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      throw new Error(body?.error?.message || 'Meta Ads sync request failed');
    }
    const page = (await response.json()) as MetaPage<T>;
    rows.push(...(page.data || []));
    url = page.paging?.next;
  }
  if (url) throw new Error('Meta Ads pagination exceeded 100 pages');
  return rows;
}

export type MetaAdsSyncResult = {
  campaigns: number;
  adSets: number;
  ads: number;
  performanceDatePreset: MetaAdsPerformanceDatePreset;
  performanceStart: string;
  performanceEnd: string;
  syncedAt: string;
};

/**
 * Import Meta Ads hierarchy and 30-day aggregate insights. This operation is
 * deliberately read-only: it never calls Meta mutation endpoints.
 */
export async function syncMetaAds(
  companyId: string,
  performanceDatePreset: MetaAdsPerformanceDatePreset = 'last_30d'
): Promise<MetaAdsSyncResult> {
  const connection = await db.query.adConnections.findFirst({
    where: and(
      eq(adConnections.companyId, companyId),
      eq(adConnections.platform, 'facebook'),
      eq(adConnections.status, 'connected')
    ),
  });
  if (!connection?.platformAccountId) throw new Error('Choose a Meta Ad Account before syncing');

  const accountId = connection.platformAccountId.replace(/^act_/, '');
  const token = decryptMaybe(connection.accessToken);
  const timeRange = performanceTimeRange(
    performanceDatePreset,
    connection.platformAccountTimezone || 'UTC'
  );
  try {
    const [remoteCampaigns, remoteAdSets, remoteAds, campaignInsights, adSetInsights, adInsights] =
      await Promise.all([
        fetchMetaAdsPages<MetaCampaign>(
          `act_${accountId}/campaigns?fields=id,name,status,effective_status,objective,daily_budget,lifetime_budget,start_time,stop_time&limit=100`,
          token
        ),
        fetchMetaAdsPages<MetaAdSet>(
          `act_${accountId}/adsets?fields=id,name,status,effective_status,campaign_id,daily_budget,bid_amount,bid_strategy,targeting&limit=250`,
          token
        ),
        fetchMetaAdsPages<MetaAd>(
          `act_${accountId}/ads?fields=id,name,status,effective_status,campaign_id,adset_id,creative{id,thumbnail_url,object_type,object_story_spec}&limit=250`,
          token
        ),
        fetchMetaAdsPages<MetaInsight>(
          `act_${accountId}/insights?level=campaign&time_range=${timeRange.encoded}&use_unified_attribution_setting=true&fields=campaign_id,impressions,clicks,reach,frequency,spend,actions&limit=250`,
          token
        ),
        fetchMetaAdsPages<MetaInsight>(
          `act_${accountId}/insights?level=adset&time_range=${timeRange.encoded}&use_unified_attribution_setting=true&fields=adset_id,impressions,clicks,reach,frequency,spend,actions&limit=250`,
          token
        ),
        fetchMetaAdsPages<MetaInsight>(
          `act_${accountId}/insights?level=ad&time_range=${timeRange.encoded}&use_unified_attribution_setting=true&fields=ad_id,impressions,clicks,reach,frequency,spend,actions&limit=250`,
          token
        ),
      ]);

    const campaignInsightsById = new Map(
      campaignInsights.filter((row) => row.campaign_id).map((row) => [row.campaign_id!, row])
    );
    const adSetInsightsById = new Map(
      adSetInsights.filter((row) => row.adset_id).map((row) => [row.adset_id!, row])
    );
    const adInsightsById = new Map(
      adInsights.filter((row) => row.ad_id).map((row) => [row.ad_id!, row])
    );
    const existingCampaigns = await db.query.adCampaigns.findMany({
      where: and(eq(adCampaigns.companyId, companyId), eq(adCampaigns.connectionId, connection.id)),
    });
    const campaignsByPlatformId = new Map(
      existingCampaigns
        .filter((row) => row.platformCampaignId)
        .map((row) => [row.platformCampaignId!, row])
    );
    const localCampaignIdByPlatformId = new Map<string, string>();

    for (const remote of remoteCampaigns) {
      const insight = campaignInsightsById.get(remote.id);
      const impressions = Math.round(toNumber(insight?.impressions));
      const clicks = Math.round(toNumber(insight?.clicks));
      const spend = toNumber(insight?.spend);
      const values = {
        name: remote.name || remote.id,
        platform: 'facebook' as const,
        objective: mapObjective(remote.objective),
        status: mapMetaAdsStatus(remote.status),
        effectiveStatus: remote.effective_status || remote.status || null,
        dailyBudget: remote.daily_budget ? (toNumber(remote.daily_budget) / 100).toFixed(2) : null,
        totalBudget: remote.lifetime_budget
          ? (toNumber(remote.lifetime_budget) / 100).toFixed(2)
          : null,
        startDate: toDate(remote.start_time),
        endDate: toDate(remote.stop_time),
        impressions,
        clicks,
        reach: Math.round(toNumber(insight?.reach)),
        conversions: Math.round(conversionCount(insight?.actions)),
        spentAmount: spend.toFixed(2),
        ctr: impressions ? ((clicks / impressions) * 100).toFixed(2) : '0',
        cpc: clicks ? (spend / clicks).toFixed(2) : '0',
        cpm: impressions ? ((spend / impressions) * 1000).toFixed(2) : '0',
        frequency: toNumber(insight?.frequency).toFixed(2),
        updatedAt: new Date(),
      };
      const existing = campaignsByPlatformId.get(remote.id);
      if (existing) {
        await db.update(adCampaigns).set(values).where(eq(adCampaigns.id, existing.id));
        localCampaignIdByPlatformId.set(remote.id, existing.id);
      } else {
        const [created] = await db
          .insert(adCampaigns)
          .values({
            ...values,
            companyId,
            connectionId: connection.id,
            platformCampaignId: remote.id,
          })
          .returning({ id: adCampaigns.id });
        if (created) localCampaignIdByPlatformId.set(remote.id, created.id);
      }
    }

    const existingAdSets = await db.query.adSets.findMany({
      where: eq(adSets.companyId, companyId),
    });
    const adSetsByPlatformId = new Map(
      existingAdSets.filter((row) => row.platformAdSetId).map((row) => [row.platformAdSetId!, row])
    );
    const localAdSetIdByPlatformId = new Map<string, string>();
    for (const remote of remoteAdSets) {
      const campaignId = remote.campaign_id
        ? localCampaignIdByPlatformId.get(remote.campaign_id)
        : undefined;
      if (!campaignId) continue;
      const insight = adSetInsightsById.get(remote.id);
      const impressions = Math.round(toNumber(insight?.impressions));
      const clicks = Math.round(toNumber(insight?.clicks));
      const spend = toNumber(insight?.spend);
      const values = {
        campaignId,
        companyId,
        name: remote.name || remote.id,
        status: mapMetaAdsStatus(remote.status),
        effectiveStatus: remote.effective_status || remote.status || null,
        dailyBudget: remote.daily_budget ? (toNumber(remote.daily_budget) / 100).toFixed(2) : null,
        bidAmount: remote.bid_amount ? (toNumber(remote.bid_amount) / 100).toFixed(2) : null,
        bidStrategy: remote.bid_strategy || 'lowest_cost',
        targetAudience: remote.targeting || null,
        impressions,
        clicks,
        reach: Math.round(toNumber(insight?.reach)),
        conversions: Math.round(conversionCount(insight?.actions)),
        spentAmount: spend.toFixed(2),
        ctr: impressions ? ((clicks / impressions) * 100).toFixed(2) : '0',
        cpc: clicks ? (spend / clicks).toFixed(2) : '0',
        cpm: impressions ? ((spend / impressions) * 1000).toFixed(2) : '0',
        frequency: toNumber(insight?.frequency).toFixed(2),
        updatedAt: new Date(),
      };
      const existing = adSetsByPlatformId.get(remote.id);
      if (existing) {
        await db.update(adSets).set(values).where(eq(adSets.id, existing.id));
        localAdSetIdByPlatformId.set(remote.id, existing.id);
      } else {
        const [created] = await db
          .insert(adSets)
          .values({ ...values, platformAdSetId: remote.id })
          .returning({ id: adSets.id });
        if (created) localAdSetIdByPlatformId.set(remote.id, created.id);
      }
    }

    const existingAds = await db.query.ads.findMany({ where: eq(ads.companyId, companyId) });
    const adsByPlatformId = new Map(
      existingAds.filter((row) => row.platformAdId).map((row) => [row.platformAdId!, row])
    );
    for (const remote of remoteAds) {
      const campaignId = remote.campaign_id
        ? localCampaignIdByPlatformId.get(remote.campaign_id)
        : undefined;
      const adSetId = remote.adset_id ? localAdSetIdByPlatformId.get(remote.adset_id) : undefined;
      if (!campaignId || !adSetId) continue;
      const insight = adInsightsById.get(remote.id);
      const impressions = Math.round(toNumber(insight?.impressions));
      const clicks = Math.round(toNumber(insight?.clicks));
      const creative = remote.creative;
      const linkData = creative?.object_story_spec?.link_data;
      const values = {
        adSetId,
        campaignId,
        companyId,
        name: remote.name || remote.id,
        type: mapAdType(creative?.object_type),
        status: mapMetaAdsStatus(remote.status),
        effectiveStatus: remote.effective_status || remote.status || null,
        headline: linkData?.name || null,
        primaryText: linkData?.message || null,
        description: linkData?.description || null,
        callToAction: linkData?.call_to_action?.type || 'Learn More',
        destinationUrl: linkData?.link || null,
        thumbnailUrl: creative?.thumbnail_url || null,
        platformCreativeId: creative?.id || null,
        impressions,
        clicks,
        reach: Math.round(toNumber(insight?.reach)),
        conversions: Math.round(conversionCount(insight?.actions)),
        spentAmount: toNumber(insight?.spend).toFixed(2),
        ctr: impressions ? ((clicks / impressions) * 100).toFixed(2) : '0',
        cpc: clicks ? (toNumber(insight?.spend) / clicks).toFixed(2) : '0',
        cpm: impressions ? ((toNumber(insight?.spend) / impressions) * 1000).toFixed(2) : '0',
        frequency: toNumber(insight?.frequency).toFixed(2),
        updatedAt: new Date(),
      };
      const existing = adsByPlatformId.get(remote.id);
      if (existing) await db.update(ads).set(values).where(eq(ads.id, existing.id));
      else await db.insert(ads).values({ ...values, platformAdId: remote.id });
    }

    const campaignPlatformIds = new Set(remoteCampaigns.map((row) => row.id));
    const adSetPlatformIds = new Set(remoteAdSets.map((row) => row.id));
    const adPlatformIds = new Set(remoteAds.map((row) => row.id));
    await Promise.all([
      ...existingCampaigns
        .filter((row) => row.platformCampaignId && !campaignPlatformIds.has(row.platformCampaignId))
        .map((row) =>
          db
            .update(adCampaigns)
            .set({ status: 'archived', updatedAt: new Date() })
            .where(eq(adCampaigns.id, row.id))
        ),
      ...existingAdSets
        .filter((row) => row.platformAdSetId && !adSetPlatformIds.has(row.platformAdSetId))
        .map((row) =>
          db
            .update(adSets)
            .set({ status: 'archived', updatedAt: new Date() })
            .where(eq(adSets.id, row.id))
        ),
      ...existingAds
        .filter((row) => row.platformAdId && !adPlatformIds.has(row.platformAdId))
        .map((row) =>
          db
            .update(ads)
            .set({ status: 'archived', updatedAt: new Date() })
            .where(eq(ads.id, row.id))
        ),
    ]);

    await db
      .update(adConnections)
      .set({
        lastUsedAt: new Date(),
        lastError: null,
        metaAdsPerformanceWindowDays: timeRange.days,
        metaAdsPerformanceDatePreset: performanceDatePreset,
        updatedAt: new Date(),
      })
      .where(eq(adConnections.id, connection.id));
    return {
      campaigns: remoteCampaigns.length,
      adSets: remoteAdSets.length,
      ads: remoteAds.length,
      performanceDatePreset,
      performanceStart: timeRange.since,
      performanceEnd: timeRange.until,
      syncedAt: new Date().toISOString(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : 'Meta Ads sync failed';
    try {
      await db
        .update(adConnections)
        .set({ lastError: message, updatedAt: new Date() })
        .where(eq(adConnections.id, connection.id));
    } catch (persistenceError) {
      console.warn('[MetaAdsSync] Could not record sync failure', persistenceError);
    }
    throw error;
  }
}
