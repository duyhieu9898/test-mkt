import { and, eq } from 'drizzle-orm';
import { adCampaigns, adConnections, adSets, ads } from '@1person/core/db';
import { db } from '../lib/db';
import { decryptMaybe } from '../lib/crypto';
import { detectAdsFindings, MIN_IMPRESSIONS_FOR_ANALYSIS, type EvidenceWindow, type MetricSnapshot } from './meta-ads-evidence';
import { fetchMetaAdsPages } from './meta-ads-sync';

type MetaInsight = {
  impressions?: string;
  clicks?: string;
  spend?: string;
  actions?: Array<{ action_type?: string; value?: string }>;
};

export type MetaAnalysisWindows = {
  baseline: EvidenceWindow;
  current: EvidenceWindow;
};

/** Reserved platform IDs used only by the explicit local-development seed. */
export const DEV_DEMO_META_CAMPAIGN_IDS = {
  budgetAndCtr: '1person_dev_demo_budget_ctr',
  ctrOnly: '1person_dev_demo_ctr_only',
  spendOnly: '1person_dev_demo_spend_only',
  stable: '1person_dev_demo_stable',
  ctrNoCreative: '1person_dev_demo_ctr_no_creative',
  insufficient: '1person_dev_demo_insufficient',
} as const;

export function isDevelopmentMetaAdsFixture(platformCampaignId: string | null | undefined) {
  return platformCampaignId != null
    && (Object.values(DEV_DEMO_META_CAMPAIGN_IDS) as string[]).includes(platformCampaignId);
}

type DemoScenario = { baseline: MetricSnapshot; current: MetricSnapshot };
const DEV_DEMO_SCENARIOS: Record<string, DemoScenario> = {
  [DEV_DEMO_META_CAMPAIGN_IDS.budgetAndCtr]: {
    baseline: { spend: 100, impressions: 12_000, clicks: 180, conversions: 12, ctr: 1.5, dailyBudget: 100 },
    current: { spend: 300, impressions: 13_000, clicks: 104, conversions: 7, ctr: 0.8, dailyBudget: 300 },
  },
  [DEV_DEMO_META_CAMPAIGN_IDS.ctrOnly]: {
    baseline: { spend: 150, impressions: 12_000, clicks: 240, conversions: 14, ctr: 2, dailyBudget: 150 },
    current: { spend: 155, impressions: 12_500, clicks: 125, conversions: 11, ctr: 1, dailyBudget: 150 },
  },
  [DEV_DEMO_META_CAMPAIGN_IDS.spendOnly]: {
    baseline: { spend: 100, impressions: 10_000, clicks: 150, conversions: 10, ctr: 1.5, dailyBudget: null },
    current: { spend: 200, impressions: 11_000, clicks: 165, conversions: 11, ctr: 1.5, dailyBudget: null },
  },
  [DEV_DEMO_META_CAMPAIGN_IDS.stable]: {
    baseline: { spend: 150, impressions: 12_000, clicks: 180, conversions: 12, ctr: 1.5, dailyBudget: 150 },
    current: { spend: 152, impressions: 12_100, clicks: 182, conversions: 12, ctr: 1.5, dailyBudget: 150 },
  },
  [DEV_DEMO_META_CAMPAIGN_IDS.ctrNoCreative]: {
    baseline: { spend: 150, impressions: 12_000, clicks: 240, conversions: 14, ctr: 2, dailyBudget: 150 },
    current: { spend: 155, impressions: 12_500, clicks: 125, conversions: 11, ctr: 1, dailyBudget: 150 },
  },
  [DEV_DEMO_META_CAMPAIGN_IDS.insufficient]: {
    baseline: { spend: 10, impressions: 80, clicks: 4, conversions: 0, ctr: 5, dailyBudget: 100 },
    current: { spend: 30, impressions: 90, clicks: 1, conversions: 0, ctr: 1.1, dailyBudget: 300 },
  },
};

function hasSufficientDelivery(snapshot: MetricSnapshot) {
  return snapshot.impressions >= MIN_IMPRESSIONS_FOR_ANALYSIS;
}

async function loadBriefContext(companyId: string, campaignId: string, objective: string) {
  const [campaignAdSets, campaignAds] = await Promise.all([
    db.query.adSets.findMany({
      where: and(eq(adSets.companyId, companyId), eq(adSets.campaignId, campaignId)),
      columns: { name: true, targetAudience: true, placements: true, dailyBudget: true },
    }),
    db.query.ads.findMany({
      where: and(eq(ads.companyId, companyId), eq(ads.campaignId, campaignId)),
      columns: { id: true, name: true, type: true, headline: true, primaryText: true, description: true, callToAction: true },
    }),
  ]);
  return {
    objective,
    adSets: campaignAdSets.slice(0, 5).map((adSet) => ({
      name: adSet.name, dailyBudget: adSet.dailyBudget, targeting: adSet.targetAudience, placements: adSet.placements,
    })),
    creatives: campaignAds.slice(0, 10).map((ad) => ({
      id: ad.id, name: ad.name, type: ad.type, headline: ad.headline?.slice(0, 240) || null,
      primaryText: ad.primaryText?.slice(0, 1_000) || null, description: ad.description?.slice(0, 400) || null,
      callToAction: ad.callToAction,
    })),
  };
}

function toNumber(value: string | undefined) {
  return Number(value || 0) || 0;
}

function conversions(actions: MetaInsight['actions']) {
  return (actions || [])
    .filter((action) => ['purchase', 'lead', 'complete_registration', 'offsite_conversion'].includes(action.action_type || ''))
    .reduce((total, action) => total + toNumber(action.value), 0);
}

function snapshot(row: MetaInsight | undefined): MetricSnapshot {
  const impressions = toNumber(row?.impressions);
  const clicks = toNumber(row?.clicks);
  return {
    spend: toNumber(row?.spend),
    impressions,
    clicks,
    conversions: conversions(row?.actions),
    ctr: impressions ? (clicks / impressions) * 100 : 0,
    // Meta Insights returns performance, not historical budget configuration.
    // Do not infer a past budget from spend.
    dailyBudget: null,
  };
}

function insightsPath(platformCampaignId: string, window: EvidenceWindow) {
  const timeRange = encodeURIComponent(JSON.stringify({ since: window.start, until: window.end }));
  return `${platformCampaignId}/insights?time_range=${timeRange}&fields=impressions,clicks,spend,actions&use_unified_attribution_setting=true&limit=1`;
}

export function calculate7dAnalysisWindows(accountTimezone: string = 'UTC'): MetaAnalysisWindows {
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: accountTimezone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const now = new Date();
  
  // Yesterday in account timezone
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const currentEndStr = formatter.format(yesterday);
  
  const currentEnd = new Date(`${currentEndStr}T00:00:00Z`);
  const currentStart = new Date(currentEnd.getTime() - 6 * 24 * 60 * 60 * 1000);
  
  const baselineEnd = new Date(currentStart.getTime() - 1 * 24 * 60 * 60 * 1000);
  const baselineStart = new Date(baselineEnd.getTime() - 6 * 24 * 60 * 60 * 1000);
  
  return {
    current: {
      start: currentStart.toISOString().slice(0, 10),
      end: currentEnd.toISOString().slice(0, 10),
      timezone: accountTimezone,
    },
    baseline: {
      start: baselineStart.toISOString().slice(0, 10),
      end: baselineEnd.toISOString().slice(0, 10),
      timezone: accountTimezone,
    },
  };
}

/**
 * Compares two user-visible Meta Insights windows and persists the factual analysis run.
 */
export async function analyzeMetaCampaign(companyId: string, campaignId: string, windows: MetaAnalysisWindows) {
  const campaign = await db.query.adCampaigns.findFirst({
    where: and(eq(adCampaigns.id, campaignId), eq(adCampaigns.companyId, companyId)),
  });
  if (!campaign?.platformCampaignId) throw new Error('This campaign has not been synced from Meta');
  const briefContext = await loadBriefContext(companyId, campaign.id, campaign.objective);

  const demoScenario = process.env.NODE_ENV !== 'production' && isDevelopmentMetaAdsFixture(campaign.platformCampaignId)
    ? DEV_DEMO_SCENARIOS[campaign.platformCampaignId]
    : undefined;

  let baseline: MetricSnapshot;
  let current: MetricSnapshot;
  let isDevelopmentFixture = false;
  let sourceAccountId = campaign.sourceAccountId || 'dev_fixture';

  if (demoScenario) {
    baseline = demoScenario.baseline;
    current = demoScenario.current;
    isDevelopmentFixture = true;
  } else {
    const connection = await db.query.adConnections.findFirst({
      where: and(
        eq(adConnections.id, campaign.connectionId),
        eq(adConnections.companyId, companyId),
        eq(adConnections.platform, 'facebook'),
        eq(adConnections.status, 'connected'),
      ),
    });
    if (!connection) throw new Error('Meta Ad Account is not connected');

    sourceAccountId = connection.platformAccountId || campaign.sourceAccountId || 'unknown';
    const token = decryptMaybe(connection.accessToken);
    const [baselineRows, currentRows] = await Promise.all([
      fetchMetaAdsPages<MetaInsight>(insightsPath(campaign.platformCampaignId, windows.baseline), token),
      fetchMetaAdsPages<MetaInsight>(insightsPath(campaign.platformCampaignId, windows.current), token),
    ]);
    baseline = snapshot(baselineRows[0]);
    current = snapshot(currentRows[0]);
  }

  const isInsufficientData = !hasSufficientDelivery(baseline) || !hasSufficientDelivery(current);
  const findings = detectAdsFindings({
    target: 'campaign',
    targetId: campaign.id,
    baseline,
    current,
    baselineWindow: windows.baseline,
    currentWindow: windows.current,
    ...(isDevelopmentFixture ? { source: 'development_fixture' } : {}),
  });

  const status: AdAnalysisStatus = isInsufficientData
    ? 'insufficient_data'
    : findings.length > 0
    ? 'needs_review'
    : 'no_issues_detected';

  const { adCampaignAnalyses } = await import('@1person/core/db');
  const [analysisRecord] = await db.insert(adCampaignAnalyses).values({
    companyId,
    campaignId: campaign.id,
    connectionId: campaign.connectionId,
    sourceAccountId,
    status,
    baselineWindow: windows.baseline as Record<string, unknown>,
    currentWindow: windows.current as Record<string, unknown>,
    baselineSnapshot: baseline as Record<string, unknown>,
    currentSnapshot: current as Record<string, unknown>,
    findings: findings as Record<string, unknown>[],
    analysisVersion: 'meta-ads-v1',
    analyzedAt: new Date(),
  }).returning({ id: adCampaignAnalyses.id });

  return {
    analysisId: analysisRecord.id,
    target: { id: campaign.id, name: campaign.name, objective: campaign.objective, briefContext },
    baseline,
    current,
    status,
    isDevelopmentFixture,
    isInsufficientData,
    findings,
  };
}

export type AnalysisStatus =
  | 'not_analyzed'
  | 'insufficient_data'
  | 'needs_review'
  | 'no_issues_detected';

export function calculateCostPerConversion(spend: number | string | null | undefined, conversions: number | null | undefined): number | null {
  const numSpend = Number(spend || 0);
  const numConversions = Number(conversions || 0);
  if (numConversions <= 0) return null;
  return Number((numSpend / numConversions).toFixed(2));
}

export function calculateAggregateCpa(totalSpend: number, totalConversions: number): number | null {
  if (totalConversions <= 0) return null;
  return Number((totalSpend / totalConversions).toFixed(2));
}

export function deriveAnalysisStatus(args: {
  hasAnalysis: boolean;
  windowImpressions: number | null | undefined;
  hasNegativeFindings: boolean;
}): AnalysisStatus {
  if (!args.hasAnalysis) return 'not_analyzed';
  if ((args.windowImpressions ?? 0) < 1_000) return 'insufficient_data';
  if (args.hasNegativeFindings) return 'needs_review';
  return 'no_issues_detected';
}

