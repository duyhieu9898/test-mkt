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
  agents,
  departments,
} from '@1person/core/db';
import { authMiddleware } from '../middleware/auth';
import { HTTPException } from 'hono/http-exception';
import { getTenantAI, ensureTenantForCompany } from '../lib/tenant-ai';
import {
  generateAndSaveCeoBrief,
  assignAdvisorTeamTasks,
  mergeCampaignReviewActions,
} from '../services/ceo-advisor';
import { authorizeCompanyAccess } from '../lib/company-access';

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
  if (!brief) return c.json({ brief: null });

  const [recentCampaigns, teamRows] = await Promise.all([
    db.select()
      .from(campaigns)
      .where(eq(campaigns.companyId, companyId))
      .orderBy(desc(campaigns.createdAt))
      .limit(10),
    db.select({
      id: agents.id,
      name: agents.name,
      role: agents.role,
      title: agents.title,
      department: departments.name,
      capabilities: agents.capabilities,
    })
      .from(agents)
      .leftJoin(departments, eq(agents.departmentId, departments.id))
      .where(eq(agents.companyId, companyId)),
  ]);
  const campaignFacts = recentCampaigns.map((campaign) => {
    const targeting = (campaign.targeting ?? {}) as Record<string, unknown>;
    const source = targeting.source;
    const sourceRecord = source && typeof source === 'object'
      ? source as Record<string, unknown>
      : null;
    return {
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      aiMode: campaign.aiMode,
      sourceType: typeof sourceRecord?.type === 'string'
        ? sourceRecord.type
        : typeof source === 'string'
          ? source
          : null,
      blogPostId: typeof targeting.blogPostId === 'string' ? targeting.blogPostId : null,
      createdAt: campaign.createdAt.toISOString(),
    };
  });

  return c.json({
    brief: {
      ...brief,
      actions: assignAdvisorTeamTasks(
        mergeCampaignReviewActions({
          actions: brief.actions,
          campaigns: campaignFacts,
          companyId,
        }),
        teamRows.map((member) => ({
          id: member.id,
          name: member.name,
          role: member.role,
          title: member.title ?? undefined,
          department: member.department ?? undefined,
          capabilities: (member.capabilities ?? []).map((capability) => capability.name),
        })),
      ),
    },
  });
});

insightsRouter.post('/:companyId/advisor/refresh', async (c) => {
  const { userId } = c.get('user');
  const companyId = c.req.param('companyId');
  const body = await c.req.json().catch(() => ({})) as { language?: string };
  try {
    await authorizeCompanyAccess(userId, companyId, 'ceo_advisor.refresh');
    const { company } = await requireOwnedCompany(companyId);
    const saved = await generateAndSaveCeoBrief({
      companyId,
      companyName: company.name,
      actor: userId ?? 'system',
      language: body.language,
    });

    return c.json({ brief: saved });
  } catch (err) {
    if (err instanceof HTTPException) throw err;
    console.error('[insights.advisor.refresh] failed:', {
      companyId,
      userId: userId ?? 'system',
      error: err,
    });
    throw err;
  }
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
