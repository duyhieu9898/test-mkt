/**
 * Marketing Autonomous — AI-driven campaign creation
 *
 * Called by GrowthBrain or Intelligence Engine when an opportunity is detected.
 * Creates campaigns end-to-end: plan → generate creatives → ready for launch.
 *
 * Flow:
 * 1. Create campaign in 'planned' state
 * 2. Transition to 'generating' — create blog + banners + posts
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
import {
  CAMPAIGN_BANNER_PALETTE,
  renderContextualCampaignBanner,
} from './campaign-banner-creative';
import {
  applyBrandKitToBannerTheme,
  brandCreativeKitSnapshot,
  buildBrandCreativeKit,
  buildBrandFitSummary,
  renderBrandCreativeKitPrompt,
} from './brand-creative-kit';
import { createCampaignBlog } from './campaign-blog';
import { buildCampaignName } from './campaign-name';

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
  offer?: string;
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
        name: buildCampaignName(opportunity.goal),
        goal: goalType,
        platform,
        budgetDaily: opportunity.suggestedBudget?.toString() || '10',
        targeting: {
          audience: opportunity.audience,
          source: {
            type: 'ai_autonomous',
            requestedGoal: opportunity.goal,
            reasoning: opportunity.reason,
          },
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
      const businessContext = await runStep('build_business_context', async () => {
        return buildBusinessContext(companyId);
      });

      // 4. Generate and attach the supporting blog draft.
      await runStep('generate_blog_post', () =>
        createCampaignBlog({
          companyId,
          campaignId: campaign.id,
          goal: opportunity.goal,
          audience: opportunity.audience,
          sourceContext: [
            businessContext.fullContext,
            `CAMPAIGN GOAL: ${opportunity.goal}`,
            `TARGET AUDIENCE: ${opportunity.audience}`,
            `WHY THIS CAMPAIGN EXISTS NOW: ${opportunity.reason}`,
            opportunity.channel ? `CHANNEL: ${opportunity.channel}` : '',
          ].filter(Boolean).join('\n').slice(0, 6000),
        }),
      );

      // 5. Generate banners
      await runStep('generate_banners', () =>
        this.generateBanners(companyId, campaign.id, opportunity),
      );

      // 6. Generate social posts
      await runStep('generate_social_posts', () =>
        this.generatePosts(companyId, campaign.id, opportunity.audience),
      );

      // 7. Transition to 'ready'
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
  private async generateBanners(
    companyId: string,
    campaignId: string,
    opportunity: AutonomousOpportunity,
  ): Promise<void> {
    const [ctx, brainBlock, brandKit] = await Promise.all([
      buildBusinessContext(companyId),
      loadBrainPromptBlock(companyId),
      buildBrandCreativeKit(companyId),
    ]);
    const brandPrimary = brandKit.colors.primary || ctx.brandColors.primary || '#6366f1';
    const brainSection = brainBlock ? `\n\n${brainBlock}\n` : '';
    const brandCreativePrompt = renderBrandCreativeKitPrompt(brandKit);

    const { text } = await llmGenerate([{
      role: 'system',
      content: `You are a creative director. Create 3 banner ad concepts. Headlines MAX 8 words, CTA 2-4 words. Follow the brand voice strictly — tone, preferred words, and avoided words are non-negotiable.`,
    }, {
      role: 'user',
      content: `Create exactly 3 banner variants for this campaign.${brainSection}

${brandCreativePrompt}

CAMPAIGN GOAL: ${opportunity.goal}
TARGET AUDIENCE: ${opportunity.audience}
WHY THIS CAMPAIGN EXISTS NOW: ${opportunity.reason}
${opportunity.offer ? `OFFER OR PRODUCT: ${opportunity.offer}` : ''}
CHANNEL: ${opportunity.channel ?? 'manual'}

BUSINESS CONTEXT:
${ctx.fullContext.substring(0, 2400)}

Each visualDirection must describe a concrete, text-free photographic scene that directly represents the campaign goal, audience, offer, product, place, or activity and matches the Brand Creative Kit visual mood. Make all 3 scenes meaningfully different while still feeling like one brand campaign. Never default to generic office, abstract technology, or unrelated lifestyle imagery.

Return ONLY JSON:
{"variants":[{"headline":"Max 8 words","subheadline":"Max 15 words","cta":"2-4 words","angle":"aspiration|pain|benefit","visualDirection":"Concrete scene, subject, setting, mood and composition with no text"}]}`,
    }], {
      featureKey: 'campaign_banner_copy',
      tier: 'balanced',
      traceName: 'marketingAutonomous.generateBanners',
      metadata: { companyId, campaignId },
    });

    const parsed = extractJSON(text) || {};
    const generatedVariants = Array.isArray(parsed.variants) ? parsed.variants.slice(0, 3) : [];
    const fallbackVariants = [
      {
        headline: opportunity.goal,
        subheadline: `Created for ${opportunity.audience}`,
        cta: 'Learn More',
        angle: 'benefit',
        visualDirection: `A concrete commercial scene showing ${opportunity.audience} experiencing the main benefit of ${opportunity.goal}`,
      },
      {
        headline: `A Better Way Forward`,
        subheadline: opportunity.reason,
        cta: 'Explore Now',
        angle: 'aspiration',
        visualDirection: `An aspirational real-world scene that visualizes the desired outcome of ${opportunity.goal} for ${opportunity.audience}`,
      },
      {
        headline: `Make It Happen`,
        subheadline: `Built around what matters to ${opportunity.audience}`,
        cta: 'Get Started',
        angle: 'pain',
        visualDirection: `An authentic problem-to-solution scene relevant to ${opportunity.audience}, focused on the need behind ${opportunity.goal}`,
      },
    ];
    const variants = Array.from({ length: 3 }, (_, index) => ({
      ...fallbackVariants[index]!,
      ...(generatedVariants[index] ?? {}),
    }));

    const createdBanners: Array<typeof banners.$inferSelect> = [];
    for (const [index, variant] of variants.entries()) {
      const angle = variant.angle || 'benefit';
      const theme = applyBrandKitToBannerTheme(
        CAMPAIGN_BANNER_PALETTE[index % CAMPAIGN_BANNER_PALETTE.length]!,
        brandKit,
        index,
      );
      const headline = (variant.headline || '').split(' ').slice(0, 8).join(' ');
      const subheadline = (variant.subheadline || '').split(' ').slice(0, 15).join(' ');
      const cta = (variant.cta || 'Get Started').split(' ').slice(0, 4).join(' ');
      const visualDirection = String(variant.visualDirection || '').slice(0, 400);

      try {
        const [created] = await db.insert(banners).values({
          companyId,
          campaignId,
          name: headline,
          size: '1200x628',
          status: 'draft',
          concept: 'AI autonomous campaign',
          angle,
          copy: { headline, subheadline, cta, brandColor: brandPrimary } as any,
          design: {
            layout: theme.layout,
            backgroundType: 'gradient',
            backgroundValue: theme.backgroundValue,
            colorTheme: theme.colors,
            brandKit: brandCreativeKitSnapshot(brandKit),
            brandFit: buildBrandFitSummary(brandKit, false),
            typography: { headlineSize: 'lg', headlineWeight: 800, alignment: 'center' },
            overlayOpacity: 0.6,
            visualDirection,
          } as any,
          strategyTag: angle === 'pain' ? 'urgency' : 'value',
        }).returning();
        if (created) createdBanners.push(created);
      } catch {
        // Fallback without new columns
        const [created] = await db.insert(banners).values({
          companyId,
          campaignId,
          name: headline,
          size: '1200x628',
          status: 'draft',
          copy: { headline, subheadline, cta, brandColor: brandPrimary } as any,
          strategyTag: angle === 'pain' ? 'urgency' : 'value',
        }).returning();
        if (created) createdBanners.push(created);
      }
    }

    const campaignContext = [
      ctx.fullContext,
      `CAMPAIGN GOAL: ${opportunity.goal}`,
      `TARGET AUDIENCE: ${opportunity.audience}`,
      `WHY THIS CAMPAIGN EXISTS NOW: ${opportunity.reason}`,
      opportunity.offer ? `OFFER OR PRODUCT: ${opportunity.offer}` : '',
      opportunity.channel ? `CHANNEL: ${opportunity.channel}` : '',
    ].filter(Boolean).join('\n');

    for (const [index, banner] of createdBanners.entries()) {
      const copy = (banner.copy ?? {}) as {
        headline?: string;
        subheadline?: string;
        cta?: string;
      };
      const design = (banner.design ?? {}) as Record<string, any>;
      try {
        const creative = await renderContextualCampaignBanner({
          companyId,
          bannerId: banner.id,
          size: banner.size,
          goal: opportunity.goal,
          audience: opportunity.audience,
          reason: opportunity.reason,
          offer: opportunity.offer,
          businessContext: campaignContext,
          angle: banner.angle ?? banner.strategyTag ?? undefined,
          visualDirection: design.visualDirection,
          headline: copy.headline || banner.name,
          subheadline: copy.subheadline,
          cta: copy.cta || 'Get Started',
          variantIndex: index,
          brandKit,
        });

        await db.update(banners)
          .set({
            imageUrl: creative.rendered.imageUrl,
            design: {
              ...design,
              layout: creative.theme.layout,
              backgroundType: creative.backgroundImageUrl ? 'image' : 'gradient',
              backgroundValue: creative.backgroundImageUrl ?? creative.theme.backgroundValue,
              backgroundPrompt: creative.backgroundPrompt,
              backgroundImageProvider: creative.backgroundImageProvider,
              backgroundImageModel: creative.backgroundImageModel,
              backgroundQuality: creative.backgroundQuality,
              backgroundGenerationAttempts: creative.generationAttempts,
              colorTheme: creative.theme.colors,
              brandKit: brandCreativeKitSnapshot(brandKit),
              brandFit: buildBrandFitSummary(brandKit, Boolean(creative.rendered.brandLogoApplied)),
              imglyScene: creative.rendered.imglyScene,
              renderedImageUrl: creative.rendered.imageUrl,
              renderProvider: creative.rendered.renderer,
              renderedAt: new Date().toISOString(),
            } as any,
            updatedAt: new Date(),
          })
          .where(eq(banners.id, banner.id));
      } catch (error) {
        console.warn('[MarketingAutonomous] banner render failed:', (error as Error).message);
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
        mediaUrls: [],
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
