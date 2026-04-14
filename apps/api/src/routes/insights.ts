/**
 * AI Advisor / Market Intelligence API
 *
 * Aggregates growth brain decisions, campaign performance, and brain
 * learnings into a single insights feed for the user-facing AI Advisor
 * dashboard.
 *
 * Route: /api/v1/insights/:companyId
 */

import { Hono } from 'hono';
import { eq, and, desc, gte, sql } from 'drizzle-orm';
import { db } from '../lib/db';
import {
  companies,
  campaigns,
  banners,
  socialPosts,
  landingPages,
} from '@1person/core/db';
import { authMiddleware } from '../middleware/auth';
import { HTTPException } from 'hono/http-exception';
import { getTenantAI, ensureTenantForCompany } from '../lib/tenant-ai';
import { ensureSufficientCredits, chargeFixedCredits } from '../lib/credits';
import { generateCeoBrief } from '../services/ceo-advisor';

const insightsRouter = new Hono();
insightsRouter.use('*', authMiddleware);

// Shared ownership check — returns { company, tenantId }
async function requireOwnedCompany(companyId: string) {
  const company = await db.query.companies.findFirst({
    where: eq(companies.id, companyId),
    columns: { id: true, name: true, ownerId: true },
  });
  if (!company) throw new HTTPException(404, { message: 'Company not found' });
  const tenantId = await ensureTenantForCompany(company.id, company.name);
  return { company, tenantId };
}

// ─── CEO Advisor endpoints (doc 10 §8) ───────────────────────────────

insightsRouter.get('/:companyId/advisor/latest', async (c) => {
  const companyId = c.req.param('companyId');
  const { tenantId } = await requireOwnedCompany(companyId);
  const brief = await getTenantAI().ceoAdvisor.latest(tenantId);
  return c.json({ brief });
});

insightsRouter.post('/:companyId/advisor/refresh', async (c) => {
  const { userId } = c.get('user');
  const companyId = c.req.param('companyId');
  const { tenantId } = await requireOwnedCompany(companyId);

  await ensureSufficientCredits(companyId, 10);

  const result = await generateCeoBrief({ companyId, tenantId });

  const saved = await getTenantAI().ceoAdvisor.append(
    tenantId,
    {
      headline: result.headline,
      actions: result.actions,
      wins: result.wins,
      alerts: result.alerts,
      sourcesUsed: result.sourcesUsed,
      model: result.model,
      traceId: result.traceId,
    },
    userId ?? 'system',
  );

  await chargeFixedCredits(companyId, 10, {
    featureKey: 'ceo_advisor_brief',
    refKind: 'ceo_brief',
    refId: saved.id,
    actor: userId ?? 'system',
  });

  return c.json({ brief: saved });
});

// ─── GET /insights/:companyId — full advisor snapshot ───────────────

insightsRouter.get('/:companyId', async (c) => {
  const { userId } = c.get('user');
  const companyId = c.req.param('companyId');

  const company = await db.query.companies.findFirst({
    where: eq(companies.id, companyId),
    columns: { id: true, name: true, ownerId: true },
  });
  if (!company) throw new HTTPException(404, { message: 'Company not found' });

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // 1. AI Recommendations — from campaigns.aiDecisions (most recent, most impactful)
  const recentCampaigns = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.companyId, companyId)))
    .orderBy(desc(campaigns.updatedAt))
    .limit(20);

  const recommendations: Array<{
    id: string;
    type: string;
    reason: string;
    action: string;
    source: string;
    timestamp: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    applied: boolean;
  }> = [];

  for (const campaign of recentCampaigns) {
    const decisions = (campaign.aiDecisions as any[]) || [];
    for (const decision of decisions) {
      if (decision.type?.startsWith('brain_learning:')) continue; // shown in learnings section
      recommendations.push({
        id: `${campaign.id}-${decision.type}`,
        type: decision.type || 'suggestion',
        reason: decision.reason || '',
        action: decision.action || '',
        source: `Campaign: ${campaign.name}`,
        timestamp: decision.timestamp || campaign.updatedAt?.toISOString?.() || '',
        severity: decision.type?.includes('critical') ? 'critical' :
                  decision.type?.includes('scale') ? 'high' :
                  decision.type?.includes('weak') ? 'medium' : 'low',
        applied: !!decision.applied,
      });
    }
  }

  // Sort by timestamp descending, limit 20
  recommendations.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  const topRecommendations = recommendations.slice(0, 20);

  // 2. Brain Learnings — what AI has learned from past campaigns
  let learnings: Array<{
    id: string;
    lesson: string;
    category: string;
    campaignId: string | null;
    metricSnapshot: Record<string, unknown>;
    createdAt: string;
  }> = [];

  try {
    const tenantId = await ensureTenantForCompany(company.id, company.name);
    const ai = getTenantAI();
    const brainLearnings = await ai.brain.listLearnings(tenantId, 20);
    learnings = brainLearnings.map((l) => ({
      id: l.id,
      lesson: l.lesson,
      category: l.category ?? 'insight',
      campaignId: l.campaignId ?? null,
      metricSnapshot: (l.metricSnapshot as Record<string, unknown>) ?? {},
      createdAt: l.createdAt?.toISOString?.() ?? '',
    }));
  } catch {
    // Brain not initialized yet — no learnings
  }

  // 3. Performance overview — campaign stats
  const activeCampaigns = recentCampaigns.filter(
    (c) => ['live', 'optimizing', 'ready'].includes(c.status),
  );

  const stats = {
    totalCampaigns: recentCampaigns.length,
    liveCampaigns: recentCampaigns.filter((c) => c.status === 'live').length,
    readyCampaigns: recentCampaigns.filter((c) => c.status === 'ready').length,
    failedCampaigns: recentCampaigns.filter((c) => c.status === 'failed').length,
    completedCampaigns: recentCampaigns.filter((c) => c.status === 'completed').length,
  };

  // Campaign performance metrics (from campaigns.metrics jsonb)
  const performanceTrends: Array<{
    campaignId: string;
    campaignName: string;
    platform: string;
    status: string;
    metrics: {
      impressions?: number;
      clicks?: number;
      ctr?: number;
      spend?: number;
      conversions?: number;
    };
  }> = recentCampaigns
    .filter((c) => c.metrics && Object.keys(c.metrics as any).length > 0)
    .map((c) => {
      const m = c.metrics as any;
      return {
        campaignId: c.id,
        campaignName: c.name,
        platform: c.platform,
        status: c.status,
        metrics: {
          impressions: Number(m.impressions ?? 0),
          clicks: Number(m.clicks ?? 0),
          ctr: Number(m.ctr ?? 0),
          spend: Number(m.spend ?? 0),
          conversions: Number(m.conversions ?? 0),
        },
      };
    });

  // 4. Quick actions — what the user should do next
  const quickActions: Array<{
    action: string;
    description: string;
    priority: 'high' | 'medium' | 'low';
    link: string;
  }> = [];

  if (stats.readyCampaigns > 0) {
    quickActions.push({
      action: 'Launch ready campaigns',
      description: `${stats.readyCampaigns} campaign(s) are generated and waiting for your approval to go live.`,
      priority: 'high',
      link: `/${companyId}/campaigns`,
    });
  }

  const criticalRecs = topRecommendations.filter((r) => r.severity === 'critical' && !r.applied);
  if (criticalRecs.length > 0) {
    quickActions.push({
      action: 'Review critical AI recommendations',
      description: `AI flagged ${criticalRecs.length} critical issue(s) that need your attention.`,
      priority: 'high',
      link: `/${companyId}/insights`,
    });
  }

  // Check if Brain is empty
  try {
    const tenantId = await ensureTenantForCompany(company.id, company.name);
    const ai = getTenantAI();
    const snapshot = await ai.brain.getSnapshot(tenantId);
    if (!snapshot.brandVoice) {
      quickActions.push({
        action: 'Set up your Brand Voice',
        description: 'Tell the AI how your brand speaks — this shapes every campaign it creates.',
        priority: 'medium',
        link: `/${companyId}/brain`,
      });
    }
    if (snapshot.products.length === 0) {
      quickActions.push({
        action: 'Add your products',
        description: 'The AI creates better ads when it knows what you sell.',
        priority: 'medium',
        link: `/${companyId}/brain`,
      });
    }
  } catch {}

  if (stats.totalCampaigns === 0) {
    quickActions.push({
      action: 'Create your first campaign',
      description: 'Let AI build banners, social posts, and ad copy from your brand — in one click.',
      priority: 'medium',
      link: `/${companyId}/campaigns`,
    });
  }

  return c.json({
    recommendations: topRecommendations,
    learnings,
    stats,
    performanceTrends,
    quickActions,
    lastUpdated: now.toISOString(),
  });
});

export default insightsRouter;
