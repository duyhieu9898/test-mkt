/**
 * Feedback Loop Cron - Data-driven autonomous optimization
 *
 * Every 30 minutes:
 * 1. Collect performance data (GSC / internal)
 * 2. Feed to Growth Brain
 * 3. Growth Brain creates data-driven tasks
 * 4. Tasks enqueued to BullMQ
 * 5. Workers execute
 * 6. Loop forever
 *
 * Decision rules (NOT time-based):
 * - position > 30 → new content
 * - position 10-30 → optimize
 * - CTR < 1% → fix title/meta
 * - winning keyword → expand
 * - no traffic → generate more
 */

import { db } from '../lib/db';
import { decryptMaybe } from '../lib/crypto';
import { eq, and } from 'drizzle-orm';
import { companies, campaigns } from '@1person/core/db';
import { performanceTracker } from '../services/performance-tracker';
import { syncCampaignFacebookPerformance } from '../services/campaign-performance';
// Growth Brain agent removed as part of IA restructure (doc 10).
// The feedback loop now only runs Marketing Feedback + Revenue Brain.

const FEEDBACK_INTERVAL = 30 * 60 * 1000; // 30 minutes

export class FeedbackCron {
  private running = false;
  private timer: ReturnType<typeof setInterval> | null = null;

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    console.log('[FeedbackCron] Started — data-driven cycle every 30 minutes');

    // Run first cycle after 2 minutes (let system settle)
    setTimeout(async () => {
      await this.runCycle().catch((e) => console.warn('[FeedbackCron] Initial cycle failed:', e));
    }, 2 * 60 * 1000);

    // Then run periodically
    this.timer = setInterval(async () => {
      await this.runCycle().catch((e) => console.warn('[FeedbackCron] Cycle failed:', e));
    }, FEEDBACK_INTERVAL);
  }

  stop(): void {
    this.running = false;
    if (this.timer) clearInterval(this.timer);
  }

  /**
   * Marketing Feedback Loop — analyze live campaigns and auto-optimize.
   * Also polls external ad platforms (Meta Insights, GSC) and writes
   * fresh metrics into campaigns.metrics before evaluating rules (P0-B6).
   */
  private async runMarketingFeedback(companyId: string): Promise<void> {
    // Find all 'live' campaigns
    const liveCampaigns = await db.query.campaigns.findMany({
      where: and(eq(campaigns.companyId, companyId), eq(campaigns.status, 'live')),
    });

    // P0-B6 — refresh metrics from ad platforms before running the rules.
    // Non-fatal: if Meta API fails, we just use whatever was in campaigns.metrics.
    if (liveCampaigns.length > 0) {
      try {
        await this.refreshPlatformMetrics(liveCampaigns);
      } catch (err) {
        console.warn(`[FeedbackCron] Platform metrics refresh failed for ${companyId}:`, err);
      }
      for (const campaign of liveCampaigns) {
        try {
          const performance = await syncCampaignFacebookPerformance(companyId, campaign.id);
          if (performance?.facebook.publishedPosts) {
            (campaign as any).metrics = {
              ...((campaign as any).metrics ?? {}),
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
            };
          }
        } catch (err) {
          console.warn(`[FeedbackCron] Facebook post metrics refresh failed for ${campaign.id}:`, err);
        }
      }
    }

    if (liveCampaigns.length === 0) return;

    const { adsEngine } = await import('../services/ads-engine');

    for (const campaign of liveCampaigns) {
      try {
        const metrics = campaign.metrics as any;
        if (!metrics) continue;

        const ctr = metrics.ctr || 0;
        const spend = metrics.spend || 0;
        const conversions = metrics.conversions || 0;
        const impressions = metrics.impressions || 0;
        const cpa = conversions > 0 ? spend / conversions : Infinity;
        const roas = spend > 0 && (campaign as any).revenue ? parseFloat((campaign as any).revenue) / spend : 0;

        const aiDecisions = ((campaign.aiDecisions as any[]) || []).slice();
        let statusUpdate: string | null = null;

        // Rule: CTR below 1% with enough impressions — flag weak creative
        if (metrics.clicksMeasured !== false && ctr < 1 && impressions > 500) {
          aiDecisions.push({
            type: 'weak_creative',
            reason: `CTR is ${ctr.toFixed(2)}% (below 1%) with ${impressions} impressions — creatives may need refresh`,
            action: 'Flagged for creative refresh',
            timestamp: new Date().toISOString(),
            applied: false,
          });
        }

        // Rule: CPA above daily budget — suggest pause
        const dailyBudget = campaign.budgetDaily ? parseFloat(campaign.budgetDaily) : 10;
        if (cpa > dailyBudget * 3 && conversions > 0) {
          aiDecisions.push({
            type: 'high_cpa',
            reason: `CPA is $${cpa.toFixed(2)} (${Math.round(cpa / dailyBudget)}x daily budget) — consider pausing or adjusting targeting`,
            action: 'Suggested pause due to high CPA',
            timestamp: new Date().toISOString(),
            applied: false,
          });
        }

        // Rule: ROAS above 3x — suggest scaling budget
        if (roas > 3) {
          aiDecisions.push({
            type: 'scale_budget',
            reason: `ROAS is ${roas.toFixed(1)}x — strong performance, consider increasing budget`,
            action: 'Suggested budget increase',
            timestamp: new Date().toISOString(),
            applied: false,
          });
        }

        // Auto-transition: running > 7 days with good ROAS → 'optimizing'
        const startDate = campaign.startDate ? new Date(campaign.startDate) : null;
        const daysSinceLaunch = startDate ? (Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24) : 0;

        if (daysSinceLaunch > 7 && roas > 1.5) {
          statusUpdate = 'optimizing';
          aiDecisions.push({
            type: 'auto_optimize',
            reason: `Running ${Math.round(daysSinceLaunch)} days with ROAS ${roas.toFixed(1)}x — entering optimization phase`,
            action: 'Transitioned to optimization mode',
            timestamp: new Date().toISOString(),
            applied: true,
          });
        }

        // Update campaign with decisions and possible status change
        const updateData: Record<string, any> = {
          aiDecisions: aiDecisions as any,
          updatedAt: new Date(),
        };
        if (statusUpdate) {
          updateData.status = statusUpdate;
        }

        await db.update(campaigns)
          .set(updateData)
          .where(eq(campaigns.id, campaign.id));

        if (aiDecisions.length > ((campaign.aiDecisions as any[]) || []).length) {
          const newCount = aiDecisions.length - ((campaign.aiDecisions as any[]) || []).length;
          console.log(`[FeedbackCron] Campaign "${campaign.name}": ${newCount} new AI decisions`);
        }

        // P0-B7 — Feed learnings back to Business Brain so future campaigns
        // can draw on what worked / what failed. Each "interesting" outcome
        // becomes a structured Brain learning entry.
        try {
          await this.appendBrainLearnings(campaign, {
            ctr,
            spend,
            conversions,
            impressions,
            cpa,
            roas,
            clicksMeasured: metrics.clicksMeasured !== false,
            engagementRate: Number(metrics.engagementRate ?? 0),
          });
        } catch (err) {
          console.warn(`[FeedbackCron] Brain learning append failed for campaign ${campaign.id}:`, err);
        }
      } catch (err) {
        console.warn(`[FeedbackCron] Marketing feedback failed for campaign ${campaign.id}:`, err);
      }
    }
  }

  /**
   * P0-B6 — Pull fresh metrics from ad platforms and write to
   * campaigns.metrics. Currently implements Meta Marketing API insights
   * for campaigns with a `platformCampaignId`. Skips campaigns that
   * haven't been published to a real platform yet (stub launches).
   *
   * Only runs once per hour per campaign to avoid hammering Meta's
   * rate limits.
   */
  private async refreshPlatformMetrics(liveCampaigns: any[]): Promise<void> {
    const now = Date.now();
    const STALE_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour

    for (const campaign of liveCampaigns) {
      try {
        const platformCampaignId = (campaign as any).platformCampaignId;
        if (!platformCampaignId) continue; // stub-launched, nothing to poll

        const lastRefreshed = (campaign.metrics as any)?.lastRefreshedAt;
        if (lastRefreshed && now - new Date(lastRefreshed).getTime() < STALE_THRESHOLD_MS) {
          continue; // fresh enough
        }

        if (campaign.platform === 'meta' || campaign.platform === 'facebook') {
          const insights = await this.fetchMetaInsights(campaign.companyId, platformCampaignId);
          if (insights) {
            await db.update(campaigns)
              .set({
                metrics: { ...insights, lastRefreshedAt: new Date().toISOString() } as any,
                updatedAt: new Date(),
              })
              .where(eq(campaigns.id, campaign.id));
            // Mutate the in-memory campaign so the downstream rules see
            // fresh data on this same cycle
            (campaign as any).metrics = { ...insights, lastRefreshedAt: new Date().toISOString() };
          }
        }
        // TODO: GSC + Google Ads + TikTok refresh — wire when those
        // platforms are live. The same pattern applies.
      } catch (err) {
        console.warn(`[FeedbackCron] Refresh metrics failed for campaign ${campaign.id}:`, err);
      }
    }
  }

  /**
   * Fetch a single Meta campaign's insights via the Graph API.
   * Returns null on any error (network, auth, rate limit) — the
   * caller treats null as "keep existing metrics".
   */
  private async fetchMetaInsights(companyId: string, platformCampaignId: string): Promise<{
    impressions: number;
    clicks: number;
    ctr: number;
    spend: number;
    conversions: number;
    reach: number;
  } | null> {
    try {
      // Load the Meta connection for this company — reuses the existing
      // ad_connections store.
      const { adConnections } = await import('@1person/core/db');
      const conn = await db.query.adConnections.findFirst({
        where: and(
          eq(adConnections.companyId, companyId),
          eq(adConnections.platform, 'facebook' as any),
        ),
      });
      if (!conn || !(conn as any).accessToken) return null;

      const accessToken = decryptMaybe((conn as any).accessToken as string);
      const graphVersion = 'v21.0';
      const fields = 'impressions,clicks,ctr,spend,reach,actions';
      const url = `https://graph.facebook.com/${graphVersion}/${platformCampaignId}/insights?fields=${fields}&date_preset=last_7d&access_token=${encodeURIComponent(accessToken)}`;

      const res = await fetch(url, { method: 'GET' });
      if (!res.ok) return null;
      const data = (await res.json()) as { data?: Array<Record<string, unknown>> };
      const row = data.data?.[0];
      if (!row) return null;

      const impressions = Number(row.impressions ?? 0);
      const clicks = Number(row.clicks ?? 0);
      const ctr = Number(row.ctr ?? 0);
      const spend = Number(row.spend ?? 0);
      const reach = Number(row.reach ?? 0);
      const actions = (row.actions as Array<{ action_type: string; value: string }>) ?? [];
      const conversions = actions
        .filter((a) => ['purchase', 'lead', 'complete_registration'].includes(a.action_type))
        .reduce((sum, a) => sum + Number(a.value ?? 0), 0);

      return { impressions, clicks, ctr, spend, conversions, reach };
    } catch (err) {
      console.warn('[FeedbackCron] Meta insights fetch failed:', err);
      return null;
    }
  }

  /**
   * P0-B7 — Convert campaign performance metrics into structured Brain
   * learning entries. Only appends meaningful signals (wins, losses,
   * insights), not every heartbeat. Keeps the Brain learning store
   * high-signal instead of noisy.
   */
  private async appendBrainLearnings(
    campaign: any,
    metrics: {
      ctr: number;
      spend: number;
      conversions: number;
      impressions: number;
      cpa: number;
      roas: number;
      clicksMeasured: boolean;
      engagementRate: number;
    },
  ): Promise<void> {
    // Avoid double-counting: only append if we haven't already created a
    // learning for this campaign's current state. Use a tag in the
    // campaign.aiDecisions to track what's been learned.
    const decisions = (campaign.aiDecisions as any[]) || [];
    const alreadyLearnedTypes = new Set(
      decisions.filter((d) => d.type?.startsWith('brain_learning:')).map((d) => d.type),
    );

    const learnings: Array<{ type: string; category: 'win' | 'fail' | 'insight'; lesson: string }> = [];

    // Strong win: ROAS > 3x with meaningful spend
    if (metrics.roas > 3 && metrics.spend > 10 && !alreadyLearnedTypes.has('brain_learning:strong_roas')) {
      learnings.push({
        type: 'brain_learning:strong_roas',
        category: 'win',
        lesson: `Campaign "${campaign.name}" hit ${metrics.roas.toFixed(1)}x ROAS with $${metrics.spend.toFixed(0)} spend on ${campaign.platform}. Goal: ${campaign.goal}. ${metrics.conversions} conversions. KEEP: the angle, audience targeting, and creative direction used here.`,
      });
    }

    // Strong win: CTR > 3%
    if (
      metrics.clicksMeasured
      && metrics.ctr > 3
      && metrics.impressions > 1000
      && !alreadyLearnedTypes.has('brain_learning:strong_ctr')
    ) {
      learnings.push({
        type: 'brain_learning:strong_ctr',
        category: 'win',
        lesson: `Campaign "${campaign.name}" had CTR ${metrics.ctr.toFixed(2)}% on ${metrics.impressions} impressions — creative copy and hook resonated strongly. Platform: ${campaign.platform}.`,
      });
    }

    // Failure: very low CTR with enough sample
    if (
      metrics.clicksMeasured
      && metrics.ctr < 0.5
      && metrics.impressions > 1000
      && !alreadyLearnedTypes.has('brain_learning:low_ctr')
    ) {
      learnings.push({
        type: 'brain_learning:low_ctr',
        category: 'fail',
        lesson: `Campaign "${campaign.name}" CTR was only ${metrics.ctr.toFixed(2)}% on ${metrics.impressions} impressions — creative or audience mismatch. AVOID: repeating the same hook/angle without testing. Goal was: ${campaign.goal}.`,
      });
    }

    if (
      !metrics.clicksMeasured
      && metrics.engagementRate >= 3
      && metrics.impressions > 500
      && !alreadyLearnedTypes.has('brain_learning:strong_organic_engagement')
    ) {
      learnings.push({
        type: 'brain_learning:strong_organic_engagement',
        category: 'win',
        lesson: `Campaign "${campaign.name}" reached a ${metrics.engagementRate.toFixed(2)}% organic engagement rate on Facebook with ${metrics.impressions} impressions. KEEP: the customer-facing hook and creative direction used by its strongest post.`,
      });
    }

    // Failure: high CPA
    if (metrics.cpa > 100 && metrics.conversions > 0 && !alreadyLearnedTypes.has('brain_learning:high_cpa')) {
      learnings.push({
        type: 'brain_learning:high_cpa',
        category: 'fail',
        lesson: `Campaign "${campaign.name}" had CPA of $${metrics.cpa.toFixed(0)} on ${campaign.platform} — too expensive for the value delivered. Consider: different audience or cheaper channel for this goal (${campaign.goal}).`,
      });
    }

    // Insight: meaningful conversion at lower spend — efficient
    if (metrics.conversions >= 5 && metrics.spend < 50 && !alreadyLearnedTypes.has('brain_learning:efficient')) {
      learnings.push({
        type: 'brain_learning:efficient',
        category: 'insight',
        lesson: `Campaign "${campaign.name}" delivered ${metrics.conversions} conversions for only $${metrics.spend.toFixed(0)} — very efficient. Pattern worth replicating for budget-conscious campaigns targeting similar audience.`,
      });
    }

    if (learnings.length === 0) return;

    // Fetch tenantId via the existing singleton helper (non-fatal on failure)
    try {
      const { getTenantAI, ensureTenantForCompany } = await import('../lib/tenant-ai');
      const company = await db.query.companies.findFirst({
        where: eq(companies.id, campaign.companyId),
        columns: { id: true, name: true },
      });
      if (!company) return;
      const tenantId = await ensureTenantForCompany(company.id, company.name);
      const ai = getTenantAI();

      for (const learning of learnings) {
        await ai.brain.appendLearning(
          tenantId,
          {
            campaignId: campaign.id,
            lesson: learning.lesson,
            category: learning.category,
            metricSnapshot: metrics as any,
          },
          'system:feedback-cron',
        );
      }

      // Mark on the campaign so we don't re-append the same learning next cycle
      const newDecisions = [
        ...decisions,
        ...learnings.map((l) => ({
          type: l.type,
          reason: 'Appended to Business Brain learnings',
          action: `brain_learning:${l.category}`,
          timestamp: new Date().toISOString(),
          applied: true,
        })),
      ];
      await db.update(campaigns)
        .set({ aiDecisions: newDecisions as any, updatedAt: new Date() })
        .where(eq(campaigns.id, campaign.id));

      console.log(`[FeedbackCron] Brain: appended ${learnings.length} learnings from campaign "${campaign.name}"`);
    } catch (err) {
      console.warn('[FeedbackCron] Brain append failed:', err);
    }
  }

  private async runCycle(): Promise<void> {
    console.log('[FeedbackCron] Running optimization cycle...');

    const activeCompanies = await db.query.companies.findMany({
      where: eq(companies.status, 'active'),
    });

    for (const company of activeCompanies) {
      try {
        // 1. Collect performance data
        const performance = await performanceTracker.collectPerformance(company.id);

        if (performance.pages.length === 0) continue;

        // 2. Marketing Feedback Loop — optimize live campaigns
        try {
          await this.runMarketingFeedback(company.id);
        } catch (err) {
          console.warn(`[FeedbackCron] Marketing feedback failed for ${company.name}:`, err);
        }

        // 3. Feed to Revenue Brain — profit-driven decisions (uses REAL attribution data)
        try {
          const { revenueBrain } = await import('../intelligence/revenue-brain');
          const { snapshot, decisions: revenueDecisions } = await revenueBrain.analyze(company.id);

          if (revenueDecisions.length > 0) {
            console.log(`[FeedbackCron] ${company.name}: ${revenueDecisions.length} revenue decisions (profit: $${snapshot.profit}, ROAS: ${snapshot.avgROAS}x)`);
            revenueDecisions.filter((d) => d.priority === 'critical').forEach((d) =>
              console.log(`  [Revenue] ${d.action} → ${d.revenueImpact}`)
            );
          }

          // 4. Get real channel attribution data for logging
          try {
            const { attributionService } = await import('../services/attribution');
            const channelData = await attributionService.getRevenueByChannel(company.id);
            if (channelData.length > 0) {
              const bestChannel = channelData[0];
              console.log(`[FeedbackCron] ${company.name}: Best channel = ${bestChannel.channel} (ROAS ${bestChannel.roas}x, ${bestChannel.conversions} conversions)`);
            }
          } catch {}
        } catch (err) {
          console.warn(`[FeedbackCron] Revenue Brain failed for ${company.name}:`, err);
        }
      } catch (err) {
        console.warn(`[FeedbackCron] Failed for ${company.name}:`, err);
      }
    }
  }
}

export const feedbackCron = new FeedbackCron();
