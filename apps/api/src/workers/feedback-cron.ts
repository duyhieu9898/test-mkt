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
import { eq, and } from 'drizzle-orm';
import { companies, campaigns } from '@1person/core/db';
import { performanceTracker } from '../services/performance-tracker';
import { growthBrain } from '../agents/growth-brain';

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
   * Marketing Feedback Loop — analyze live campaigns and auto-optimize
   */
  private async runMarketingFeedback(companyId: string): Promise<void> {
    // Find all 'live' campaigns
    const liveCampaigns = await db.query.campaigns.findMany({
      where: and(eq(campaigns.companyId, companyId), eq(campaigns.status, 'live')),
    });

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
        if (ctr < 1 && impressions > 500) {
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
      } catch (err) {
        console.warn(`[FeedbackCron] Marketing feedback failed for campaign ${campaign.id}:`, err);
      }
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

        // 2. Feed to Growth Brain — traffic/SEO decisions
        const decisions = await growthBrain.analyze(company.id, performance.pages);

        if (decisions.length > 0) {
          console.log(`[FeedbackCron] ${company.name}: ${decisions.length} growth decisions`);
        }

        // 3. Marketing Feedback Loop — optimize live campaigns
        try {
          await this.runMarketingFeedback(company.id);
        } catch (err) {
          console.warn(`[FeedbackCron] Marketing feedback failed for ${company.name}:`, err);
        }

        // 4. Feed to Revenue Brain ��� profit-driven decisions (uses REAL attribution data)
        try {
          const { revenueBrain } = await import('../intelligence/revenue-brain');
          const { snapshot, decisions: revenueDecisions } = await revenueBrain.analyze(company.id);

          if (revenueDecisions.length > 0) {
            console.log(`[FeedbackCron] ${company.name}: ${revenueDecisions.length} revenue decisions (profit: $${snapshot.profit}, ROAS: ${snapshot.avgROAS}x)`);
            revenueDecisions.filter((d) => d.priority === 'critical').forEach((d) =>
              console.log(`  [Revenue] ${d.action} → ${d.revenueImpact}`)
            );
          }

          // 5. Get real channel attribution data for logging
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
