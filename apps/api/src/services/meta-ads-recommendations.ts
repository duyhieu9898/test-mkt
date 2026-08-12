import { and, desc, eq, inArray } from 'drizzle-orm';
import { adCampaigns, adRecommendations, type AdRecommendationStatus } from '@1person/core/db';
import { db } from '../lib/db';
import type { analyzeMetaCampaign } from './meta-ads-analysis';
import type { MetaAdsBrief } from './meta-ads-brief';
import type { AdsFinding } from './meta-ads-evidence';

type MetaCampaignAnalysis = Awaited<ReturnType<typeof analyzeMetaCampaign>>;

export class MetaAdsRecommendationNotFoundError extends Error {
  constructor() { super('Recommendation not found'); }
}

/** Selects the evidence that actually permits the selected bounded action. */
export function selectPrimaryFindingForAction(findings: AdsFinding[], actionType: MetaAdsBrief['actionType']): AdsFinding | undefined {
  if (actionType === 'review_budget') return findings.find((finding) => finding.kind === 'budget_increase');
  if (actionType === 'creative_test') return findings.find((finding) => finding.kind === 'ctr_decline');
  const priority: Record<AdsFinding['kind'], number> = {
    primary_result_decline: 4,
    cost_per_result_increase: 3,
    ctr_decline: 2,
    budget_increase: 1,
  };
  return [...findings].sort((a, b) => {
    const severity = { high: 2, medium: 1 };
    return severity[b.severity] - severity[a.severity] || priority[b.kind] - priority[a.kind];
  })[0];
}

/** Persist only facts returned by the server-side analysis and its bounded brief. */
export async function createMetaAdsRecommendation(args: {
  companyId: string;
  campaignId: string;
  analysis: MetaCampaignAnalysis;
  brief: MetaAdsBrief;
}) {
  const primaryFinding = selectPrimaryFindingForAction(args.analysis.findings, args.brief.actionType);
  if (!primaryFinding) throw new Error('A recommendation requires at least one evidence-backed finding');
  const existing = await db.query.adRecommendations.findFirst({
    where: and(eq(adRecommendations.companyId, args.companyId), eq(adRecommendations.campaignId, args.campaignId), eq(adRecommendations.status, 'recommended')),
    orderBy: desc(adRecommendations.createdAt),
  });
  if (existing && JSON.stringify(existing.analysisInput?.baseline) === JSON.stringify(args.analysis.baseline)
    && JSON.stringify(existing.analysisInput?.current) === JSON.stringify(args.analysis.current)) return existing;
  const [recommendation] = await db.insert(adRecommendations).values({
    companyId: args.companyId,
    campaignId: args.campaignId,
    analysisId: args.analysis.analysisId || null,
    type: primaryFinding.kind,
    priority: primaryFinding.severity,
    problem: primaryFinding.fact,
    evidence: args.analysis.findings as unknown as Record<string, unknown>[],
    possibleCause: args.brief.possibleCause,
    suggestedAction: args.brief as unknown as Record<string, unknown>,
    analysisInput: {
      baseline: args.analysis.baseline,
      current: args.analysis.current,
      target: args.analysis.target,
    },
    analysisVersion: 'meta-ads-v1',
  }).returning();
  if (!recommendation) throw new Error('Could not save Meta Ads recommendation');
  return recommendation;
}

export async function listMetaAdsRecommendations(companyId: string, campaignId: string) {
  return db.query.adRecommendations.findMany({
    where: and(eq(adRecommendations.companyId, companyId), eq(adRecommendations.campaignId, campaignId)),
    orderBy: desc(adRecommendations.createdAt),
  });
}

export async function listCompanyMetaAdsRecommendations(args: {
  companyId: string;
  sourceAccountId?: string;
  status?: AdRecommendationStatus;
  page?: number;
  limit?: number;
}) {
  const page = Math.max(1, args.page || 1);
  const limit = Math.min(100, Math.max(1, args.limit || 25));
  const offset = (page - 1) * limit;

  const conditions = [eq(adRecommendations.companyId, args.companyId)];
  if (args.status) {
    conditions.push(eq(adRecommendations.status, args.status));
  }

  if (args.sourceAccountId) {
    const matchingCampaigns = await db.query.adCampaigns.findMany({
      where: and(eq(adCampaigns.companyId, args.companyId), eq(adCampaigns.sourceAccountId, args.sourceAccountId)),
      columns: { id: true },
    });
    const accountCampaignIds = matchingCampaigns.map((c) => c.id);
    if (accountCampaignIds.length === 0) {
      return {
        items: [],
        pagination: { page, limit, total: 0, totalPages: 0 },
      };
    }
    conditions.push(inArray(adRecommendations.campaignId, accountCampaignIds));
  }

  const whereClause = and(...conditions);

  const [items, allMatching] = await Promise.all([
    db.query.adRecommendations.findMany({
      where: whereClause,
      orderBy: [desc(adRecommendations.createdAt), desc(adRecommendations.id)],
      limit,
      offset,
    }),
    db.query.adRecommendations.findMany({
      where: whereClause,
      columns: { id: true },
    }),
  ]);

  const campaignIds = Array.from(new Set(items.map((item) => item.campaignId)));
  const campaignsMap = new Map<string, string>();
  if (campaignIds.length > 0) {
    const campaignsList = await db.query.adCampaigns.findMany({
      where: and(eq(adCampaigns.companyId, args.companyId), inArray(adCampaigns.id, campaignIds)),
      columns: { id: true, name: true },
    });
    for (const c of campaignsList) {
      campaignsMap.set(c.id, c.name);
    }
  }

  const formattedItems = items.map((rec) => ({
    ...rec,
    campaignName: campaignsMap.get(rec.campaignId) || 'Campaign',
  }));

  const total = allMatching.length;
  const totalPages = Math.ceil(total / limit);

  return {
    items: formattedItems,
    pagination: {
      page,
      limit,
      total,
      totalPages,
    },
  };
}

export async function setMetaAdsRecommendationStatus(companyId: string, recommendationId: string, status: AdRecommendationStatus, sourceAccountId: string) {
  // Verify recommendation belongs to the selected account via campaign ownership
  const existing = await db.query.adRecommendations.findFirst({
    where: and(eq(adRecommendations.id, recommendationId), eq(adRecommendations.companyId, companyId)),
  });
  if (!existing) throw new MetaAdsRecommendationNotFoundError();

  const campaign = await db.query.adCampaigns.findFirst({
    where: and(eq(adCampaigns.id, existing.campaignId), eq(adCampaigns.companyId, companyId)),
  });
  if (!campaign || campaign.sourceAccountId !== sourceAccountId) {
    throw new MetaAdsRecommendationNotFoundError();
  }

  const [recommendation] = await db.update(adRecommendations)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(adRecommendations.id, recommendationId), eq(adRecommendations.companyId, companyId)))
    .returning();
  if (!recommendation) throw new MetaAdsRecommendationNotFoundError();
  return recommendation;
}
