import { and, desc, eq, inArray } from 'drizzle-orm';
import { adCampaigns, adRecommendations, type AdRecommendationStatus } from '@1person/core/db';
import { db } from '../lib/db';
import type { analyzeMetaCampaign } from './meta-ads-analysis';
import type { MetaAdsBrief } from './meta-ads-brief';

type MetaCampaignAnalysis = Awaited<ReturnType<typeof analyzeMetaCampaign>>;

export class MetaAdsRecommendationNotFoundError extends Error {
  constructor() { super('Recommendation not found'); }
}

/** Persist only facts returned by the server-side analysis and its bounded brief. */
export async function createMetaAdsRecommendation(args: {
  companyId: string;
  campaignId: string;
  analysis: MetaCampaignAnalysis;
  brief: MetaAdsBrief;
}) {
  const primaryFinding = args.analysis.findings[0];
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

export async function setMetaAdsRecommendationStatus(companyId: string, recommendationId: string, status: AdRecommendationStatus) {
  const [recommendation] = await db.update(adRecommendations)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(adRecommendations.id, recommendationId), eq(adRecommendations.companyId, companyId)))
    .returning();
  if (!recommendation) throw new MetaAdsRecommendationNotFoundError();
  return recommendation;
}

