/**
 * Revenue Brain — Profit-driven decision engine
 *
 * Thinks in MONEY, not just traffic.
 *
 * Before: "CTR low → optimize"
 * After:  "1000 visitors → 0 leads → losing money → change offer"
 *         "Campaign ROAS = 0.8 → losing money → pause now"
 *         "Page generates 10 leads/day → scale ads immediately"
 *
 * Every decision includes: revenue reasoning + profit impact
 */

import { db } from '../lib/db';
import { eq, desc, and } from 'drizzle-orm';
import { landingPages, campaigns, knowledgeBase, agentMemories, agents } from '@1person/core/db';
import { queueTaskExecution } from '../lib/queue';
import { tasks } from '@1person/core/db';
import { memorySystem } from '../agents';
import { attributionService } from '../services/attribution';

// =============================================
// REVENUE DATA TYPES
// =============================================

export interface PageRevenue {
  pageId: string;
  pageName: string;
  keyword: string;
  status: string;
  visitors: number;
  leads: number;
  conversionRate: number;
  estimatedRevenue: number; // leads × avg deal value
  revenuePerVisitor: number;
  verdict: 'profitable' | 'breakeven' | 'losing' | 'no_data';
}

export interface CampaignRevenue {
  campaignId: string;
  campaignName: string;
  platform: string;
  spend: number;
  clicks: number;
  leads: number;
  cpc: number;
  cpa: number;
  estimatedRevenue: number;
  roas: number;
  verdict: 'scale' | 'optimize' | 'pause' | 'kill' | 'no_data';
}

export interface RevenueSnapshot {
  totalPages: number;
  profitablePages: number;
  losingPages: number;
  totalCampaigns: number;
  totalSpend: number;
  totalRevenue: number;
  profit: number;
  avgROAS: number;
  pages: PageRevenue[];
  campaigns: CampaignRevenue[];
}

export interface RevenueDecision {
  action: string;
  type: string;
  reason: string;
  revenueImpact: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  input: Record<string, unknown>;
}

// =============================================
// REVENUE BRAIN
// =============================================

export class RevenueBrain {
  private avgDealValue = 100; // Default $100 per lead — configurable

  /**
   * Analyze all revenue data and make profit-driven decisions
   */
  async analyze(companyId: string): Promise<{
    snapshot: RevenueSnapshot;
    decisions: RevenueDecision[];
  }> {
    console.log('[RevenueBrain] Analyzing profit...');

    // Collect revenue data
    const snapshot = await this.collectRevenueData(companyId);

    // Make profit-driven decisions
    const decisions: RevenueDecision[] = [];

    // Page-level decisions
    for (const page of snapshot.pages) {
      const pageDecisions = this.analyzePageRevenue(page);
      decisions.push(...pageDecisions);
    }

    // Campaign-level decisions
    for (const campaign of snapshot.campaigns) {
      const campaignDecisions = this.analyzeCampaignRevenue(campaign);
      decisions.push(...campaignDecisions);
    }

    // System-level decisions
    const systemDecisions = this.analyzeSystemRevenue(snapshot);
    decisions.push(...systemDecisions);

    // Deduplicate
    const unique = this.dedup(decisions);

    // Enqueue tasks
    await this.createTasksFromDecisions(companyId, unique);

    // Store in memory
    await this.storeRevenueMemory(companyId, snapshot, unique);

    console.log(`[RevenueBrain] ${unique.length} profit-driven decisions made. Profit: $${snapshot.profit}`);
    return { snapshot, decisions: unique };
  }

  // =============================================
  // DATA COLLECTION
  // =============================================

  private async collectRevenueData(companyId: string): Promise<RevenueSnapshot> {
    // Pages
    const pages = await db.select().from(landingPages)
      .where(eq(landingPages.companyId, companyId));

    const pageRevenues: PageRevenue[] = pages.map((p) => {
      const visitors = p.totalVisitors || 0;
      const leads = p.totalLeads || 0;
      const conversionRate = visitors > 0 ? (leads / visitors) * 100 : 0;
      const estimatedRevenue = leads * this.avgDealValue;
      const revenuePerVisitor = visitors > 0 ? estimatedRevenue / visitors : 0;

      let verdict: PageRevenue['verdict'] = 'no_data';
      if (visitors > 0 && leads > 0) verdict = 'profitable';
      else if (visitors > 50 && leads === 0) verdict = 'losing';
      else if (visitors > 0) verdict = 'breakeven';

      return {
        pageId: p.id,
        pageName: p.name,
        keyword: (p.businessContext as any)?.keyword || '',
        status: p.status,
        visitors, leads, conversionRate: Math.round(conversionRate * 100) / 100,
        estimatedRevenue, revenuePerVisitor: Math.round(revenuePerVisitor * 100) / 100,
        verdict,
      };
    });

    // Campaigns — use REAL attribution data when available
    const campaignList = await db.select().from(campaigns)
      .where(eq(campaigns.companyId, companyId));

    const campaignRevenues: CampaignRevenue[] = [];
    for (const c of campaignList) {
      const metrics = (c.metrics as any) || {};

      // Try to get real revenue data from attribution service
      let realRevenue: { totalRevenue: number; totalCost: number; roas: number; cpa: number; conversions: number } | null = null;
      try {
        realRevenue = await attributionService.getCampaignRevenue(c.id);
      } catch {}

      const hasRealData = realRevenue && (realRevenue.conversions > 0 || realRevenue.totalCost > 0);
      const spend = hasRealData ? realRevenue!.totalCost : (metrics.spend || parseFloat(c.budgetDaily || '0') * 7);
      const clicks = metrics.clicks || 0;
      const leads = hasRealData ? realRevenue!.conversions : (metrics.conversions || 0);
      const cpc = clicks > 0 ? spend / clicks : 0;
      const cpa = hasRealData ? realRevenue!.cpa : (leads > 0 ? spend / leads : 0);
      const estimatedRevenue = hasRealData ? realRevenue!.totalRevenue : (leads * this.avgDealValue);
      const roas = hasRealData ? realRevenue!.roas : (spend > 0 ? estimatedRevenue / spend : 0);

      let verdict: CampaignRevenue['verdict'] = 'no_data';
      if (roas > 2) verdict = 'scale';
      else if (roas >= 1 && roas <= 2) verdict = 'optimize';
      else if (roas > 0 && roas < 1) verdict = 'pause';
      else if (spend > 0 && leads === 0) verdict = 'kill';

      campaignRevenues.push({
        campaignId: c.id, campaignName: c.name, platform: c.platform,
        spend: Math.round(spend * 100) / 100, clicks, leads,
        cpc: Math.round(cpc * 100) / 100, cpa: Math.round(cpa * 100) / 100,
        estimatedRevenue, roas: Math.round(roas * 100) / 100, verdict,
      });
    }

    const totalSpend = campaignRevenues.reduce((s, c) => s + c.spend, 0);
    const totalRevenue = pageRevenues.reduce((s, p) => s + p.estimatedRevenue, 0);

    return {
      totalPages: pages.length,
      profitablePages: pageRevenues.filter((p) => p.verdict === 'profitable').length,
      losingPages: pageRevenues.filter((p) => p.verdict === 'losing').length,
      totalCampaigns: campaignList.length,
      totalSpend: Math.round(totalSpend * 100) / 100,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      profit: Math.round((totalRevenue - totalSpend) * 100) / 100,
      avgROAS: totalSpend > 0 ? Math.round((totalRevenue / totalSpend) * 100) / 100 : 0,
      pages: pageRevenues,
      campaigns: campaignRevenues,
    };
  }

  // =============================================
  // PROFIT-DRIVEN DECISIONS
  // =============================================

  private analyzePageRevenue(page: PageRevenue): RevenueDecision[] {
    const decisions: RevenueDecision[] = [];

    // High traffic, zero leads → losing money on content creation
    if (page.visitors > 50 && page.leads === 0) {
      decisions.push({
        action: `Fix "${page.pageName}" — ${page.visitors} visitors but 0 leads`,
        type: 'optimize_conversion',
        reason: `${page.visitors} visitors generating $0 revenue. Estimated loss: content creation cost without return.`,
        revenueImpact: `If 2% convert: +${Math.round(page.visitors * 0.02)} leads = +$${Math.round(page.visitors * 0.02 * this.avgDealValue)}/month`,
        priority: 'critical',
        input: { pageId: page.pageId, action: 'rewrite_cta_and_offer' },
      });
    }

    // Has visitors + low conversion (<1%) → optimize
    if (page.visitors > 20 && page.conversionRate > 0 && page.conversionRate < 1) {
      decisions.push({
        action: `Improve conversion on "${page.pageName}" (${page.conversionRate}% → target 3%)`,
        type: 'optimize_conversion',
        reason: `Currently ${page.conversionRate}% conversion = $${page.estimatedRevenue}. At 3%: $${Math.round(page.visitors * 0.03 * this.avgDealValue)}`,
        revenueImpact: `+$${Math.round(page.visitors * 0.02 * this.avgDealValue)}/month if conversion doubles`,
        priority: 'high',
        input: { pageId: page.pageId, action: 'improve_offer' },
      });
    }

    // Profitable page → SCALE (get more traffic)
    if (page.leads >= 3 && page.revenuePerVisitor > 1) {
      decisions.push({
        action: `Scale traffic to "${page.pageName}" — it's making $${page.revenuePerVisitor}/visitor`,
        type: 'create_campaign',
        reason: `${page.leads} leads × $${this.avgDealValue} = $${page.estimatedRevenue}. Revenue per visitor: $${page.revenuePerVisitor}. Worth scaling.`,
        revenueImpact: `2x traffic → +$${page.estimatedRevenue}/month`,
        priority: 'high',
        input: { pageId: page.pageId, pageName: page.pageName, action: 'scale_traffic' },
      });
    }

    // Not published → can't make money
    if (page.status !== 'published' && page.status !== 'ready') {
      decisions.push({
        action: `Publish "${page.pageName}" — it's not making money sitting in draft`,
        type: 'publish_page',
        reason: `Draft pages generate $0. Publishing enables traffic → leads → revenue.`,
        revenueImpact: `Potential: $${Math.round(50 * 0.02 * this.avgDealValue)}/month (at 50 visitors, 2% conversion)`,
        priority: 'medium',
        input: { pageId: page.pageId },
      });
    }

    return decisions;
  }

  private analyzeCampaignRevenue(campaign: CampaignRevenue): RevenueDecision[] {
    const decisions: RevenueDecision[] = [];

    // ROAS > 3x → SCALE aggressively (very profitable)
    if (campaign.roas > 3) {
      decisions.push({
        action: `Scale "${campaign.campaignName}" — ROAS ${campaign.roas}x (very profitable!)`,
        type: 'scale_campaign',
        reason: `Spending $${campaign.spend}, earning $${campaign.estimatedRevenue}. ROAS: ${campaign.roas}x. Every $1 returns $${campaign.roas}.`,
        revenueImpact: `50% budget increase → +$${Math.round(campaign.estimatedRevenue * 0.5)}/month`,
        priority: 'critical',
        input: { campaignId: campaign.campaignId, action: 'increase_budget_50pct' },
      });
    }

    // ROAS 2-3x → SCALE moderately (profitable)
    if (campaign.roas > 2 && campaign.roas <= 3) {
      decisions.push({
        action: `Grow "${campaign.campaignName}" — ROAS ${campaign.roas}x (profitable)`,
        type: 'scale_campaign',
        reason: `Spending $${campaign.spend}, earning $${campaign.estimatedRevenue}. ROAS: ${campaign.roas}x. Room to grow.`,
        revenueImpact: `25% budget increase → +$${Math.round(campaign.estimatedRevenue * 0.25)}/month`,
        priority: 'high',
        input: { campaignId: campaign.campaignId, action: 'increase_budget_25pct' },
      });
    }

    // ROAS < 1 → LOSING MONEY → pause
    if (campaign.roas > 0 && campaign.roas < 1) {
      decisions.push({
        action: `Pause "${campaign.campaignName}" — ROAS ${campaign.roas}x (LOSING MONEY)`,
        type: 'pause_campaign',
        reason: `Spending $${campaign.spend} but only earning $${campaign.estimatedRevenue}. Losing $${Math.round(campaign.spend - campaign.estimatedRevenue)}.`,
        revenueImpact: `Stop losing $${Math.round(campaign.spend - campaign.estimatedRevenue)}/period`,
        priority: 'critical',
        input: { campaignId: campaign.campaignId, action: 'pause' },
      });
    }

    // Spending but zero leads → KILL
    if (campaign.spend > 0 && campaign.leads === 0 && campaign.clicks > 20) {
      decisions.push({
        action: `Kill "${campaign.campaignName}" — $${campaign.spend} spent, 0 leads`,
        type: 'pause_campaign',
        reason: `${campaign.clicks} clicks but 0 conversions. CPC: $${campaign.cpc}. Money wasted.`,
        revenueImpact: `Save $${campaign.spend}/period`,
        priority: 'critical',
        input: { campaignId: campaign.campaignId, action: 'kill' },
      });
    }

    // CPA too high (>50% of deal value)
    if (campaign.cpa > this.avgDealValue * 0.5 && campaign.leads > 0) {
      decisions.push({
        action: `Optimize "${campaign.campaignName}" — CPA $${campaign.cpa} is too high`,
        type: 'optimize_campaign',
        reason: `CPA $${campaign.cpa} vs deal value $${this.avgDealValue}. Margin too thin at ${Math.round((1 - campaign.cpa / this.avgDealValue) * 100)}%.`,
        revenueImpact: `Reduce CPA by 30% → save $${Math.round(campaign.cpa * 0.3 * campaign.leads)}/period`,
        priority: 'high',
        input: { campaignId: campaign.campaignId, action: 'optimize_targeting' },
      });
    }

    return decisions;
  }

  private analyzeSystemRevenue(snapshot: RevenueSnapshot): RevenueDecision[] {
    const decisions: RevenueDecision[] = [];

    // Overall unprofitable
    if (snapshot.profit < 0 && snapshot.totalSpend > 0) {
      decisions.push({
        action: `System is LOSING money: -$${Math.abs(snapshot.profit)}`,
        type: 'system_alert',
        reason: `Total spend: $${snapshot.totalSpend}, Total revenue: $${snapshot.totalRevenue}. Net loss: $${Math.abs(snapshot.profit)}.`,
        revenueImpact: 'Reduce spend on losing campaigns and focus on profitable pages',
        priority: 'critical',
        input: { action: 'review_all_campaigns' },
      });
    }

    // No published pages → no revenue possible
    if (snapshot.profitablePages === 0 && snapshot.totalPages > 0) {
      decisions.push({
        action: `No pages are generating revenue — ${snapshot.totalPages} pages exist but 0 profitable`,
        type: 'optimize_conversion',
        reason: `${snapshot.losingPages} pages are getting traffic but not converting. Fix CTAs and offers.`,
        revenueImpact: `Even 1% conversion across all pages could generate $${Math.round(snapshot.pages.reduce((s, p) => s + p.visitors, 0) * 0.01 * this.avgDealValue)}`,
        priority: 'critical',
        input: { action: 'audit_all_pages' },
      });
    }

    return decisions;
  }

  // =============================================
  // TASK CREATION + MEMORY
  // =============================================

  private async createTasksFromDecisions(companyId: string, decisions: RevenueDecision[]): Promise<void> {
    const ceo = await db.query.agents.findFirst({ where: eq(agents.companyId, companyId) });

    for (const d of decisions.slice(0, 8)) {
      const existing = await db.query.tasks.findFirst({
        where: and(eq(tasks.companyId, companyId), eq(tasks.type, d.type), eq(tasks.status, 'pending')),
      });
      if (existing) continue;

      try {
        const [task] = await db.insert(tasks).values({
          companyId, title: d.action,
          description: `💰 Revenue reasoning: ${d.reason}\n📈 Expected impact: ${d.revenueImpact}\n\n[Revenue Brain — profit-driven]`,
          type: d.type, priority: d.priority, status: 'pending',
          assignedAgentId: ceo?.id, input: d.input as any,
        }).returning();

        try {
          await queueTaskExecution({
            taskId: task.id, agentId: ceo?.id || '', companyId,
            taskType: d.type, title: d.action, description: d.reason,
            input: d.input, priority: d.priority,
          });
        } catch {}
      } catch {}
    }
  }

  private async storeRevenueMemory(companyId: string, snapshot: RevenueSnapshot, decisions: RevenueDecision[]): Promise<void> {
    try {
      const ceo = await db.query.agents.findFirst({ where: eq(agents.companyId, companyId) });
      if (!ceo) return;

      await memorySystem.store({
        companyId, agentId: ceo.id, type: 'strategy',
        title: `Revenue: profit=$${snapshot.profit}, ROAS=${snapshot.avgROAS}x`,
        content: JSON.stringify({
          profit: snapshot.profit, totalSpend: snapshot.totalSpend, totalRevenue: snapshot.totalRevenue,
          profitablePages: snapshot.profitablePages, losingPages: snapshot.losingPages,
          decisionsCount: decisions.length,
          topDecision: decisions[0]?.action,
        }),
        metadata: { tags: ['revenue', 'profit'] },
      });
    } catch {}
  }

  private dedup(decisions: RevenueDecision[]): RevenueDecision[] {
    const seen = new Set<string>();
    return decisions.filter((d) => {
      const key = `${d.type}:${(d.input as any)?.pageId || (d.input as any)?.campaignId || d.action.substring(0, 30)}`;
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });
  }
}

export const revenueBrain = new RevenueBrain();
