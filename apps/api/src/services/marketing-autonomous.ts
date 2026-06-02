/**
 * Marketing Autonomous — AI-driven campaign creation
 *
 * Called by GrowthBrain or Intelligence Engine when an opportunity is detected.
 * Creates campaigns end-to-end: plan → generate creatives → ready for launch.
 *
 * Flow:
 * 1. Create campaign in 'planned' state
 * 2. Transition to 'generating' — create banners + posts
 * 3. Transition to 'ready' — waiting for user approval or auto-launch
 */

import { db } from '../lib/db';
import { eq } from 'drizzle-orm';
import { campaigns, banners, socialPosts, companies } from '@1person/core/db';
import { llmGenerate, extractJSON } from '../lib/llm';
import { buildBusinessContext } from './business-context';
import { validateBanner } from './creative-quality';
import { snapshotToPromptBlock } from '@1person/ai-tenant';
import { getTenantAI, ensureTenantForCompany } from '../lib/tenant-ai';

/**
 * Load the Business Brain snapshot (W0.2) for the given company and
 * render it as a prompt-block string. Fails silently — if the Brain
 * is empty, returns an empty string so callers can concat safely.
 */
async function loadBrainPromptBlock(companyId: string): Promise<string> {
  try {
    const company = await db.query.companies.findFirst({
      where: eq(companies.id, companyId),
      columns: { id: true, name: true },
    });
    if (!company) return '';
    const tenantId = await ensureTenantForCompany(company.id, company.name);
    const snapshot = await getTenantAI().brain.getSnapshot(tenantId);
    return snapshotToPromptBlock(snapshot);
  } catch (err) {
    console.warn('[marketingAutonomous] Brain snapshot failed, continuing without:', err);
    return '';
  }
}

export interface AutonomousOpportunity {
  goal: string;
  audience: string;
  reason: string;
  suggestedBudget?: number;
  channel?: string;
}

/**
 * Step event emitted by the campaign generator at each stage. Consumed
 * by the live workflow visualization panel (W1B.4).
 */
export type CampaignStepEvent =
  | { step: string; status: 'started'; at: string }
  | { step: string; status: 'completed'; at: string; durationMs: number; detail?: Record<string, unknown> }
  | { step: string; status: 'failed'; at: string; error: string };

export type OnCampaignStep = (ev: CampaignStepEvent) => void | Promise<void>;

export class MarketingAutonomous {
  /**
   * Called by GrowthBrain, Intelligence Engine, or the public
   * `/campaigns/generate` endpoint (W1B.1). Creates a full campaign
   * with creatives autonomously.
   *
   * Pass `onStep` to receive live progress events (used by the SSE
   * workflow visualization in W1B.4). Safe to omit for the existing
   * autonomous callers.
   */
  async createAutonomousCampaign(
    companyId: string,
    opportunity: AutonomousOpportunity,
    onStep?: OnCampaignStep,
  ): Promise<string> {
    console.log(`[MarketingAutonomous] Creating campaign for: ${opportunity.goal}`);

    const emit = async (ev: CampaignStepEvent) => {
      if (!onStep) return;
      try { await onStep(ev); } catch (err) {
        console.error('[MarketingAutonomous] onStep callback failed:', err);
      }
    };

    const runStep = async <T>(step: string, fn: () => Promise<T>): Promise<T> => {
      const startedAt = Date.now();
      await emit({ step, status: 'started', at: new Date(startedAt).toISOString() });
      try {
        const result = await fn();
        await emit({
          step,
          status: 'completed',
          at: new Date().toISOString(),
          durationMs: Date.now() - startedAt,
        });
        return result;
      } catch (err) {
        await emit({
          step,
          status: 'failed',
          at: new Date().toISOString(),
          error: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }
    };

    // 1. Create campaign in 'planned' state
    const campaign = await runStep('create_campaign', async () => {
      const platform = this.mapChannelToPlatform(opportunity.channel);
      const goalType = this.mapGoalType(opportunity.goal);

      const result = await db.insert(campaigns).values({
        companyId,
        name: `AI: ${opportunity.goal.substring(0, 80)}`,
        goal: goalType,
        platform,
        budgetDaily: opportunity.suggestedBudget?.toString() || '10',
        targeting: {
          audience: opportunity.audience,
          source: { type: 'ai_autonomous', reasoning: opportunity.reason },
        } as any,
        status: 'planned',
        aiMode: true,
        aiDecisions: [{
          type: 'create_campaign',
          reason: opportunity.reason,
          action: `Auto-created campaign targeting: ${opportunity.audience}`,
          timestamp: new Date().toISOString(),
          applied: true,
        }],
      }).returning();

      const row = result[0];
      if (!row) throw new Error('Failed to create campaign');
      return row;
    });

    // 2. Transition to 'generating'
    await db.update(campaigns)
      .set({ status: 'generating', updatedAt: new Date() })
      .where(eq(campaigns.id, campaign.id));

    try {
      // 3. Build business context (brain snapshot)
      await runStep('build_business_context', async () => {
        await buildBusinessContext(companyId);
      });

      // 4. Generate banners
      await runStep('generate_banners', () => this.generateBanners(companyId, campaign.id));

      // 5. Generate social posts
      await runStep('generate_social_posts', () =>
        this.generatePosts(companyId, campaign.id, opportunity.audience),
      );

      // 6. Transition to 'ready'
      await runStep('finalize_ready', async () => {
        await db.update(campaigns)
          .set({ status: 'ready', updatedAt: new Date() })
          .where(eq(campaigns.id, campaign.id));
      });

      console.log(`[MarketingAutonomous] Campaign ${campaign.id} is 'ready' for launch`);
    } catch (err) {
      console.error(`[MarketingAutonomous] Failed generating creatives for ${campaign.id}:`, err);
      await db.update(campaigns)
        .set({
          status: 'failed',
          launchError: err instanceof Error ? err.message : 'Failed to generate campaign creatives',
          updatedAt: new Date(),
        })
        .where(eq(campaigns.id, campaign.id));
    }

    return campaign.id;
  }

  /**
   * Generate banner creatives for the campaign. Reads the Business
   * Brain snapshot (W0.2/P0-B3) and injects it into the prompt so
   * banners follow brand voice, persona pain points, and product context.
   */
  private async generateBanners(companyId: string, campaignId: string): Promise<void> {
    const [ctx, brainBlock] = await Promise.all([
      buildBusinessContext(companyId),
      loadBrainPromptBlock(companyId),
    ]);
    const brandPrimary = ctx.brandColors.primary || '#6366f1';
    const brandSecondary = ctx.brandColors.secondary || '#8b5cf6';
    const brainSection = brainBlock ? `\n\n${brainBlock}\n` : '';

    const { text } = await llmGenerate([{
      role: 'system',
      content: `You are a creative director. Create 3 banner ad concepts. Headlines MAX 8 words, CTA 2-4 words. Follow the brand voice strictly — tone, preferred words, and avoided words are non-negotiable.`,
    }, {
      role: 'user',
      content: `Create 3 banner variants for this business.${brainSection}\n\nBUSINESS CONTEXT:\n${ctx.fullContext.substring(0, 800)}\n\nReturn ONLY JSON:\n{"variants":[{"headline":"Max 8 words","subheadline":"Max 15 words","cta":"2-4 words","angle":"aspiration|pain|benefit"}]}`,
    }], {
      featureKey: 'campaign_banner_copy',
      tier: 'balanced',
      traceName: 'marketingAutonomous.generateBanners',
      metadata: { companyId, campaignId },
    });

    const parsed = extractJSON(text) || {};
    const variants = (parsed.variants || []).slice(0, 3);

    const angleThemes: Record<string, any> = {
      aspiration: { primary: brandPrimary, secondary: '#10b981', text: '#ffffff', ctaBg: '#ffffff', ctaText: brandPrimary },
      pain: { primary: '#dc2626', secondary: '#f97316', text: '#ffffff', ctaBg: '#fbbf24', ctaText: '#1e293b' },
      benefit: { primary: brandPrimary, secondary: brandSecondary, text: '#ffffff', ctaBg: '#ffffff', ctaText: brandPrimary },
    };

    for (const variant of variants) {
      const angle = variant.angle || 'benefit';
      const theme = angleThemes[angle] || angleThemes.benefit;
      const headline = (variant.headline || '').split(' ').slice(0, 8).join(' ');
      const subheadline = (variant.subheadline || '').split(' ').slice(0, 15).join(' ');
      const cta = (variant.cta || 'Get Started').split(' ').slice(0, 4).join(' ');

      try {
        await db.insert(banners).values({
          companyId,
          campaignId,
          name: headline,
          size: '1200x628',
          status: 'draft',
          concept: 'AI autonomous campaign',
          angle,
          copy: { headline, subheadline, cta, brandColor: brandPrimary } as any,
          design: {
            layout: 'center',
            backgroundType: 'gradient',
            backgroundValue: `linear-gradient(135deg, ${theme.primary}, ${theme.secondary})`,
            colorTheme: theme,
            typography: { headlineSize: 'lg', headlineWeight: 800, alignment: 'center' },
            overlayOpacity: 0.6,
          } as any,
          strategyTag: angle === 'pain' ? 'urgency' : 'value',
        });
      } catch {
        // Fallback without new columns
        await db.insert(banners).values({
          companyId,
          campaignId,
          name: headline,
          size: '1200x628',
          status: 'draft',
          copy: { headline, subheadline, cta, brandColor: brandPrimary } as any,
          strategyTag: angle === 'pain' ? 'urgency' : 'value',
        });
      }
    }
  }

  /**
   * Generate social posts for the campaign. Reads the Business Brain
   * snapshot (W0.2/P0-B3) so posts use brand voice and persona language
   * consistent with every other generation path.
   */
  private async generatePosts(companyId: string, campaignId: string, audience: string): Promise<void> {
    const [ctx, brainBlock] = await Promise.all([
      buildBusinessContext(companyId),
      loadBrainPromptBlock(companyId),
    ]);
    const brainSection = brainBlock ? `\n\n${brainBlock}\n` : '';

    const { text } = await llmGenerate([{
      role: 'system',
      content: 'You are a social media manager. Write posts using specific business details. Follow the brand voice strictly — tone, preferred words, and avoided words are non-negotiable.',
    }, {
      role: 'user',
      content: `Generate 3 social posts for this business targeting: ${audience}${brainSection}\n\nBUSINESS CONTEXT:\n${ctx.fullContext.substring(0, 600)}\n\nReturn ONLY JSON array:\n[{"platform":"facebook|linkedin","content":"Post text","hashtags":["#tag"]}]`,
    }], {
      featureKey: 'campaign_social_post',
      tier: 'balanced',
      traceName: 'marketingAutonomous.generatePosts',
      metadata: { companyId, campaignId },
    });

    const parsed = extractJSON(text) || [];
    for (const post of (Array.isArray(parsed) ? parsed : []).slice(0, 3)) {
      await db.insert(socialPosts).values({
        companyId,
        campaignId,
        platform: post.platform || 'facebook',
        content: post.content || '',
        hashtags: (post.hashtags || []) as any,
        status: 'draft',
      });
    }
  }

  private mapChannelToPlatform(channel?: string): 'google' | 'meta' | 'linkedin' | 'manual' {
    if (!channel) return 'meta';
    const lower = channel.toLowerCase();
    if (lower.includes('google')) return 'google';
    if (lower.includes('linkedin')) return 'linkedin';
    if (lower.includes('facebook') || lower.includes('meta') || lower.includes('instagram')) return 'meta';
    return 'manual';
  }

  private mapGoalType(goal: string): 'traffic' | 'leads' | 'conversions' | 'awareness' | 'sales' {
    const lower = goal.toLowerCase();
    if (lower.includes('lead')) return 'leads';
    if (lower.includes('sale') || lower.includes('convert') || lower.includes('revenue')) return 'conversions';
    if (lower.includes('aware') || lower.includes('brand')) return 'awareness';
    if (lower.includes('traffic') || lower.includes('visit')) return 'traffic';
    return 'traffic';
  }
}

export const marketingAutonomous = new MarketingAutonomous();
