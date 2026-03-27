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
import { campaigns, banners, socialPosts } from '@1person/core/db';
import { llmGenerate, extractJSON } from '../lib/llm';
import { buildBusinessContext } from './business-context';
import { validateBanner } from './creative-quality';

export interface AutonomousOpportunity {
  goal: string;
  audience: string;
  reason: string;
  suggestedBudget?: number;
  channel?: string;
}

export class MarketingAutonomous {
  /**
   * Called by GrowthBrain or Intelligence Engine when opportunity detected.
   * Creates a full campaign with creatives autonomously.
   */
  async createAutonomousCampaign(
    companyId: string,
    opportunity: AutonomousOpportunity
  ): Promise<string> {
    console.log(`[MarketingAutonomous] Creating campaign for: ${opportunity.goal}`);

    // 1. Create campaign in 'planned' state
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

    const campaign = result[0];
    if (!campaign) throw new Error('Failed to create campaign');

    console.log(`[MarketingAutonomous] Campaign ${campaign.id} created in 'planned' state`);

    // 2. Transition to 'generating'
    await db.update(campaigns)
      .set({ status: 'generating', updatedAt: new Date() })
      .where(eq(campaigns.id, campaign.id));

    try {
      // 3. Generate banners
      console.log(`[MarketingAutonomous] Generating banners for campaign ${campaign.id}`);
      await this.generateBanners(companyId, campaign.id);

      // 4. Generate social posts
      console.log(`[MarketingAutonomous] Generating social posts for campaign ${campaign.id}`);
      await this.generatePosts(companyId, campaign.id, opportunity.audience);

      // 5. Transition to 'ready'
      await db.update(campaigns)
        .set({ status: 'ready', updatedAt: new Date() })
        .where(eq(campaigns.id, campaign.id));

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
   * Generate banner creatives for the campaign
   */
  private async generateBanners(companyId: string, campaignId: string): Promise<void> {
    const ctx = await buildBusinessContext(companyId);
    const brandPrimary = ctx.brandColors.primary || '#6366f1';
    const brandSecondary = ctx.brandColors.secondary || '#8b5cf6';

    const { text } = await llmGenerate([{
      role: 'system',
      content: `You are a creative director. Create 3 banner ad concepts. Headlines MAX 8 words, CTA 2-4 words.`,
    }, {
      role: 'user',
      content: `Create 3 banner variants for this business.\n\nBUSINESS:\n${ctx.fullContext.substring(0, 800)}\n\nReturn ONLY JSON:\n{"variants":[{"headline":"Max 8 words","subheadline":"Max 15 words","cta":"2-4 words","angle":"aspiration|pain|benefit"}]}`,
    }], { maxTokens: 1000 });

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
   * Generate social posts for the campaign
   */
  private async generatePosts(companyId: string, campaignId: string, audience: string): Promise<void> {
    const ctx = await buildBusinessContext(companyId);

    const { text } = await llmGenerate([{
      role: 'system',
      content: 'You are a social media manager. Write posts using specific business details.',
    }, {
      role: 'user',
      content: `Generate 3 social posts for this business targeting: ${audience}\n\nBUSINESS:\n${ctx.fullContext.substring(0, 600)}\n\nReturn ONLY JSON array:\n[{"platform":"facebook|linkedin","content":"Post text","hashtags":["#tag"]}]`,
    }], { maxTokens: 1000 });

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
