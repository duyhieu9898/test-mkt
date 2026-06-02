/**
 * Growth Score Service — CEO Motivation Engine
 *
 * Computes 4 sub-scores (0–100) from existing data:
 *   Marketing, SEO, Automation, Revenue
 * Overall Growth Score = weighted average.
 *
 * All scores are computed on-the-fly — no extra tables needed.
 */

import { db } from '../lib/db';
import { eq, and, count, sql, gte, desc, inArray } from 'drizzle-orm';
import {
  campaigns,
  landingPages,
  agents,
  tasks,
  leads,
  knowledgeBase,
  companyState,
  companyStateHistory,
} from '@1person/core/db';

// === Types ===

export type ScoreTrend = 'up' | 'down' | 'stable';

export interface SubScore {
  score: number; // 0–100
  breakdown: Record<string, number>;
  trend: ScoreTrend;
}

export interface GrowthScoreResult {
  overall: number;
  subscores: {
    marketing: SubScore;
    seo: SubScore;
    automation: SubScore;
    revenue: SubScore;
  };
  previousOverall: number | null;
  level: number; // 1–4 derived from overall
  computedAt: string;
}

// === Helpers ===

function clamp(val: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, Math.round(val)));
}

function getLevel(score: number): number {
  if (score >= 80) return 4;
  if (score >= 60) return 3;
  if (score >= 30) return 2;
  return 1;
}

// === Sub-score computations ===

async function computeMarketingScore(companyId: string): Promise<SubScore> {
  // Count active campaigns
  const [campaignResult] = await db
    .select({ total: count() })
    .from(campaigns)
    .where(
      and(
        eq(campaigns.companyId, companyId),
        inArray(campaigns.status, ['active', 'live', 'optimizing'])
      )
    );
  const activeCampaigns = campaignResult?.total ?? 0;

  // Count total campaigns
  const [totalCampaignResult] = await db
    .select({ total: count() })
    .from(campaigns)
    .where(eq(campaigns.companyId, companyId));
  const totalCampaigns = totalCampaignResult?.total ?? 0;

  // Count published landing pages
  const [lpResult] = await db
    .select({ total: count() })
    .from(landingPages)
    .where(and(eq(landingPages.companyId, companyId), eq(landingPages.status, 'published')));
  const publishedPages = lpResult?.total ?? 0;

  // Score breakdown
  const hasCampaigns = Math.min(activeCampaigns * 15, 30); // up to 30pts for active campaigns
  const campaignDiversity = Math.min(totalCampaigns * 5, 25); // up to 25pts for total campaigns
  const landingPageCoverage = Math.min(publishedPages * 10, 25); // up to 25pts for landing pages
  const systemSetup = totalCampaigns > 0 ? 20 : 0; // 20pts for having campaigns at all

  const score = clamp(hasCampaigns + campaignDiversity + landingPageCoverage + systemSetup);

  return {
    score,
    breakdown: {
      activeCampaigns: hasCampaigns,
      campaignDiversity,
      landingPages: landingPageCoverage,
      systemSetup,
    },
    trend: 'stable', // will be computed from history below
  };
}

async function computeSEOScore(companyId: string): Promise<SubScore> {
  // Published landing pages
  const [publishedResult] = await db
    .select({ total: count() })
    .from(landingPages)
    .where(and(eq(landingPages.companyId, companyId), eq(landingPages.status, 'published')));
  const publishedPages = publishedResult?.total ?? 0;

  // Total landing pages (draft + published)
  const [totalPagesResult] = await db
    .select({ total: count() })
    .from(landingPages)
    .where(eq(landingPages.companyId, companyId));
  const totalPages = totalPagesResult?.total ?? 0;

  // Knowledge base entries (content depth)
  const [kbResult] = await db
    .select({ total: count() })
    .from(knowledgeBase)
    .where(eq(knowledgeBase.companyId, companyId));
  const kbEntries = kbResult?.total ?? 0;

  const pagesLive = Math.min(publishedPages * 8, 25);
  const contentDepth = Math.min(kbEntries * 2, 25);
  const contentVelocity = Math.min(totalPages * 5, 25);
  const foundation = kbEntries > 0 && totalPages > 0 ? 25 : kbEntries > 0 || totalPages > 0 ? 12 : 0;

  const score = clamp(pagesLive + contentDepth + contentVelocity + foundation);

  return {
    score,
    breakdown: {
      pagesLive,
      contentDepth,
      contentVelocity,
      foundation,
    },
    trend: 'stable',
  };
}

async function computeAutomationScore(companyId: string): Promise<SubScore> {
  // Active agents
  const [activeResult] = await db
    .select({ total: count() })
    .from(agents)
    .where(
      and(
        eq(agents.companyId, companyId),
        inArray(agents.status, ['active', 'ready', 'running', 'idle'])
      )
    );
  const activeAgents = activeResult?.total ?? 0;

  // Task stats
  const [completedResult] = await db
    .select({ total: count() })
    .from(tasks)
    .where(and(eq(tasks.companyId, companyId), eq(tasks.status, 'completed')));
  const completedTasks = completedResult?.total ?? 0;

  const [failedResult] = await db
    .select({ total: count() })
    .from(tasks)
    .where(and(eq(tasks.companyId, companyId), eq(tasks.status, 'failed')));
  const failedTasks = failedResult?.total ?? 0;

  const totalTasks = completedTasks + failedTasks;
  const successRate = totalTasks > 0 ? completedTasks / totalTasks : 0;

  const agentCoverage = Math.min(activeAgents * 10, 30); // up to 30pts
  const taskSuccess = clamp(successRate * 30); // up to 30pts
  const taskVolume = Math.min(completedTasks * 0.5, 20); // up to 20pts
  const systemActive = activeAgents > 0 ? 20 : 0; // 20pts for having agents

  const score = clamp(agentCoverage + taskSuccess + taskVolume + systemActive);

  return {
    score,
    breakdown: {
      agentCoverage,
      taskSuccess,
      taskVolume,
      systemActive,
    },
    trend: 'stable',
  };
}

async function computeRevenueScore(companyId: string): Promise<SubScore> {
  // Leads
  const [leadResult] = await db
    .select({ total: count() })
    .from(leads)
    .where(eq(leads.companyId, companyId));
  const totalLeads = leadResult?.total ?? 0;

  // Qualified leads
  const [qualifiedResult] = await db
    .select({ total: count() })
    .from(leads)
    .where(
      and(
        eq(leads.companyId, companyId),
        inArray(leads.status, ['qualified', 'meeting_scheduled', 'proposal_sent', 'won'])
      )
    );
  const qualifiedLeads = qualifiedResult?.total ?? 0;

  // Landing pages with leads (conversion proxy)
  const [lpWithLeadsResult] = await db
    .select({ total: count() })
    .from(landingPages)
    .where(
      and(
        eq(landingPages.companyId, companyId),
        eq(landingPages.status, 'published'),
        sql`COALESCE(${landingPages.totalLeads}, 0) > 0`
      )
    );
  const pagesWithLeads = lpWithLeadsResult?.total ?? 0;

  const leadVolume = Math.min(totalLeads * 3, 30); // up to 30pts
  const leadQuality = Math.min(qualifiedLeads * 5, 25); // up to 25pts
  const conversionActive = Math.min(pagesWithLeads * 10, 25); // up to 25pts
  const pipeline = totalLeads > 0 ? 20 : 0; // 20pts for having any leads

  const score = clamp(leadVolume + leadQuality + conversionActive + pipeline);

  return {
    score,
    breakdown: {
      leadVolume,
      leadQuality,
      conversionActive,
      pipeline,
    },
    trend: 'stable',
  };
}

// === Trend computation ===

async function computeTrends(
  companyId: string,
  currentScores: { marketing: number; seo: number; automation: number; revenue: number }
): Promise<{ marketing: ScoreTrend; seo: ScoreTrend; automation: ScoreTrend; revenue: ScoreTrend; previousOverall: number | null }> {
  // Get last daily snapshot from company_state_history
  const history = await db
    .select()
    .from(companyStateHistory)
    .where(
      and(
        eq(companyStateHistory.companyId, companyId),
        eq(companyStateHistory.snapshotType, 'daily')
      )
    )
    .orderBy(desc(companyStateHistory.snapshotAt))
    .limit(1);

  if (history.length === 0) {
    return {
      marketing: 'stable',
      seo: 'stable',
      automation: 'stable',
      revenue: 'stable',
      previousOverall: null,
    };
  }

  const prev = history[0]!.metrics;
  if (!prev) {
    return {
      marketing: 'stable',
      seo: 'stable',
      automation: 'stable',
      revenue: 'stable',
      previousOverall: null,
    };
  }

  const previousOverall = prev.healthScore ?? null;

  // Without per-subscore history, we derive trend from current score vs overall average.
  // Scores significantly above the company's overall health are trending "up" relative
  // to the system; scores below are "down". This gives meaningful relative signals.
  const currentOverall = (currentScores.marketing + currentScores.seo + currentScores.automation + currentScores.revenue) / 4;
  const baseline = previousOverall ?? currentOverall;
  const threshold = 5;

  function trendFromBaseline(current: number): ScoreTrend {
    if (current > baseline + threshold) return 'up';
    if (current < baseline - threshold) return 'down';
    return 'stable';
  }

  return {
    marketing: trendFromBaseline(currentScores.marketing),
    seo: trendFromBaseline(currentScores.seo),
    automation: trendFromBaseline(currentScores.automation),
    revenue: trendFromBaseline(currentScores.revenue),
    previousOverall,
  };
}

// === Main export ===

export async function computeGrowthScore(companyId: string): Promise<GrowthScoreResult> {
  const [marketing, seo, automation, revenue] = await Promise.all([
    computeMarketingScore(companyId),
    computeSEOScore(companyId),
    computeAutomationScore(companyId),
    computeRevenueScore(companyId),
  ]);

  const trends = await computeTrends(companyId, {
    marketing: marketing.score,
    seo: seo.score,
    automation: automation.score,
    revenue: revenue.score,
  });

  marketing.trend = trends.marketing;
  seo.trend = trends.seo;
  automation.trend = trends.automation;
  revenue.trend = trends.revenue;

  const overall = clamp(
    Math.round(
      marketing.score * 0.25 +
      seo.score * 0.25 +
      automation.score * 0.25 +
      revenue.score * 0.25
    )
  );

  return {
    overall,
    subscores: { marketing, seo, automation, revenue },
    previousOverall: trends.previousOverall,
    level: getLevel(overall),
    computedAt: new Date().toISOString(),
  };
}
