/**
 * Ads Engine
 *
 * Handles paid advertising campaigns:
 * - Connect to ad platforms (Facebook, Google)
 * - Create and manage campaigns
 * - Create ad sets and ads
 * - Track performance metrics
 */

import { db } from '../lib/db';
import { eq, and, desc, gte, sql } from 'drizzle-orm';
import {
  adConnections,
  adCampaigns,
  adSets,
  ads,
  adPerformance,
  type AdConnection,
  type AdCampaign,
  type AdSet,
  type Ad,
  type AdPerformance,
} from '@1person/core/db';
import Anthropic from '@anthropic-ai/sdk';
import { platformRegistry } from './platforms';
import type { PlatformConnection } from './platforms';
import { renderSkillKnowledge } from '@1person/core';

// Expert ad-creative playbook injected into creative generation (skill K02).
const ADS_FRAMEWORK = renderSkillKnowledge('ad-creative');

const anthropic = new Anthropic();

/**
 * Ads Engine Class
 */
export class AdsEngine {
  // ============================================
  // AD CONNECTIONS
  // ============================================

  /**
   * Connect an ad platform
   */
  async connectAdPlatform(
    companyId: string,
    platform: string,
    credentials: {
      accessToken: string;
      refreshToken?: string;
      tokenExpiresAt?: Date;
      platformAccountId: string;
      platformAccountName?: string;
      platformBusinessId?: string;
      permissions?: string[];
    }
  ): Promise<string> {
    // Check for existing connection
    const existing = await db.query.adConnections.findFirst({
      where: and(
        eq(adConnections.companyId, companyId),
        eq(adConnections.platform, platform)
      ),
    });

    if (existing) {
      await db
        .update(adConnections)
        .set({
          accessToken: credentials.accessToken,
          refreshToken: credentials.refreshToken,
          tokenExpiresAt: credentials.tokenExpiresAt,
          platformAccountId: credentials.platformAccountId,
          platformAccountName: credentials.platformAccountName,
          platformBusinessId: credentials.platformBusinessId,
          permissions: credentials.permissions || [],
          status: 'connected',
          updatedAt: new Date(),
        })
        .where(eq(adConnections.id, existing.id));

      return existing.id;
    }

    const result = await db
      .insert(adConnections)
      .values({
        companyId,
        platform,
        accessToken: credentials.accessToken,
        refreshToken: credentials.refreshToken,
        tokenExpiresAt: credentials.tokenExpiresAt,
        platformAccountId: credentials.platformAccountId,
        platformAccountName: credentials.platformAccountName,
        platformBusinessId: credentials.platformBusinessId,
        permissions: credentials.permissions || [],
        status: 'connected',
      })
      .returning({ id: adConnections.id });

    const connection = result[0];
    if (!connection) throw new Error('Failed to create ad connection');

    return connection.id;
  }

  /**
   * Get ad connections for a company
   */
  async getConnections(companyId: string): Promise<AdConnection[]> {
    return db.query.adConnections.findMany({
      where: eq(adConnections.companyId, companyId),
      orderBy: desc(adConnections.connectedAt),
    });
  }

  // ============================================
  // CAMPAIGNS
  // ============================================

  /**
   * Create an ad campaign
   */
  async createCampaign(data: {
    companyId: string;
    connectionId: string;
    name: string;
    description?: string;
    platform: string;
    objective: string;
    dailyBudget?: number;
    totalBudget?: number;
    startDate?: Date;
    endDate?: Date;
    targetAudience?: {
      locations?: string[];
      ageMin?: number;
      ageMax?: number;
      genders?: string[];
      interests?: string[];
      behaviors?: string[];
    };
    agentId?: string;
  }): Promise<string> {
    // Get connection
    const connection = await db.query.adConnections.findFirst({
      where: eq(adConnections.id, data.connectionId),
    });

    if (!connection || connection.status !== 'connected') {
      throw new Error('Ad connection not found or not active');
    }

    let platformCampaignId: string | undefined;

    // Create campaign on platform via registry — works for ALL platforms
    if (platformRegistry.hasAdProvider(data.platform)) {
      const provider = platformRegistry.getAdProvider(data.platform);
      const conn: PlatformConnection = {
        id: connection.id,
        companyId: connection.companyId,
        platform: connection.platform,
        status: connection.status,
        accessToken: connection.accessToken,
        platformAccountId: connection.platformAccountId,
        platformBusinessId: connection.platformBusinessId,
      };

      const result = await provider.createCampaign(conn, {
        name: data.name,
        objective: data.objective,
        dailyBudget: data.dailyBudget || 10,
        startDate: data.startDate,
        endDate: data.endDate,
        targetAudience: data.targetAudience,
      });

      platformCampaignId = result.platformCampaignId;
    } else {
      console.log(`[Ads] No ad provider for ${data.platform}, storing locally only`);
    }

    // Create local record
    const result = await db
      .insert(adCampaigns)
      .values({
        companyId: data.companyId,
        connectionId: data.connectionId,
        name: data.name,
        description: data.description,
        platform: data.platform,
        objective: data.objective,
        status: 'draft',
        dailyBudget: data.dailyBudget?.toString(),
        totalBudget: data.totalBudget?.toString(),
        startDate: data.startDate,
        endDate: data.endDate,
        targetAudience: data.targetAudience || {},
        platformCampaignId,
        createdByAgentId: data.agentId,
      })
      .returning({ id: adCampaigns.id });

    const campaign = result[0];
    if (!campaign) throw new Error('Failed to create campaign');

    console.log(`[Ads] Created campaign ${campaign.id} on ${data.platform}`);
    return campaign.id;
  }

  // Objective mapping is now handled by each platform provider via provider.mapObjective()

  /**
   * Get campaigns for a company
   */
  async getCampaigns(
    companyId: string,
    options?: {
      status?: string;
      platform?: string;
      limit?: number;
    }
  ): Promise<AdCampaign[]> {
    return db.query.adCampaigns.findMany({
      where: eq(adCampaigns.companyId, companyId),
      orderBy: desc(adCampaigns.createdAt),
      limit: options?.limit || 50,
    });
  }

  /**
   * Launch (activate) a campaign
   */
  async launchCampaign(campaignId: string): Promise<{ success: boolean; error?: string }> {
    const campaign = await db.query.adCampaigns.findFirst({
      where: eq(adCampaigns.id, campaignId),
    });

    if (!campaign) {
      return { success: false, error: 'Campaign not found' };
    }

    if (!campaign.platformCampaignId) {
      return { success: false, error: 'Campaign not synced to platform' };
    }

    const connection = await db.query.adConnections.findFirst({
      where: eq(adConnections.id, campaign.connectionId),
    });

    if (!connection) {
      return { success: false, error: 'Ad connection not found' };
    }

    try {
      if (platformRegistry.hasAdProvider(campaign.platform)) {
        const provider = platformRegistry.getAdProvider(campaign.platform);
        const conn: PlatformConnection = {
          id: connection.id, companyId: connection.companyId,
          platform: connection.platform, status: connection.status,
          accessToken: connection.accessToken,
          platformAccountId: connection.platformAccountId,
        };
        await provider.updateCampaignStatus(conn, campaign.platformCampaignId, 'ACTIVE');
      }

      await db
        .update(adCampaigns)
        .set({
          status: 'active',
          startDate: campaign.startDate || new Date(),
          updatedAt: new Date(),
        })
        .where(eq(adCampaigns.id, campaignId));

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to launch campaign',
      };
    }
  }

  /**
   * Pause a campaign
   */
  async pauseCampaign(campaignId: string): Promise<{ success: boolean; error?: string }> {
    const campaign = await db.query.adCampaigns.findFirst({
      where: eq(adCampaigns.id, campaignId),
    });

    if (!campaign || !campaign.platformCampaignId) {
      return { success: false, error: 'Campaign not found' };
    }

    const connection = await db.query.adConnections.findFirst({
      where: eq(adConnections.id, campaign.connectionId),
    });

    if (!connection) {
      return { success: false, error: 'Connection not found' };
    }

    try {
      if (platformRegistry.hasAdProvider(campaign.platform)) {
        const provider = platformRegistry.getAdProvider(campaign.platform);
        const conn: PlatformConnection = {
          id: connection.id, companyId: connection.companyId,
          platform: connection.platform, status: connection.status,
          accessToken: connection.accessToken,
          platformAccountId: connection.platformAccountId,
        };
        await provider.updateCampaignStatus(conn, campaign.platformCampaignId, 'PAUSED');
      }

      await db
        .update(adCampaigns)
        .set({ status: 'paused', updatedAt: new Date() })
        .where(eq(adCampaigns.id, campaignId));

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to pause campaign',
      };
    }
  }

  // ============================================
  // AD SETS
  // ============================================

  /**
   * Create an ad set
   */
  async createAdSet(data: {
    campaignId: string;
    companyId: string;
    name: string;
    dailyBudget?: number;
    bidAmount?: number;
    targetAudience?: Record<string, unknown>;
    placements?: string[];
  }): Promise<string> {
    const campaign = await db.query.adCampaigns.findFirst({
      where: eq(adCampaigns.id, data.campaignId),
    });

    if (!campaign) throw new Error('Campaign not found');

    let platformAdSetId: string | undefined;

    if (platformRegistry.hasAdProvider(campaign.platform) && campaign.platformCampaignId) {
      const connection = await db.query.adConnections.findFirst({
        where: eq(adConnections.id, campaign.connectionId),
      });

      if (connection) {
        const provider = platformRegistry.getAdProvider(campaign.platform);
        const conn: PlatformConnection = {
          id: connection.id, companyId: connection.companyId,
          platform: connection.platform, status: connection.status,
          accessToken: connection.accessToken,
          platformAccountId: connection.platformAccountId,
        };

        const result = await provider.createAdSet(conn, {
          campaignId: data.campaignId,
          platformCampaignId: campaign.platformCampaignId,
          name: data.name,
          dailyBudget: data.dailyBudget || 10,
          targetAudience: data.targetAudience as any,
          placements: data.placements,
        });

        platformAdSetId = result.platformAdSetId;
      }
    }

    const result = await db
      .insert(adSets)
      .values({
        campaignId: data.campaignId,
        companyId: data.companyId,
        name: data.name,
        status: 'draft',
        dailyBudget: data.dailyBudget?.toString(),
        bidAmount: data.bidAmount?.toString(),
        targetAudience: data.targetAudience,
        placements: data.placements || [],
        platformAdSetId,
      })
      .returning({ id: adSets.id });

    const adSet = result[0];
    if (!adSet) throw new Error('Failed to create ad set');

    return adSet.id;
  }

  // Targeting is now built by each platform provider via provider.buildTargeting()

  // ============================================
  // ADS
  // ============================================

  /**
   * Create an ad
   */
  async createAd(data: {
    adSetId: string;
    campaignId: string;
    companyId: string;
    name: string;
    type?: 'image' | 'video' | 'carousel';
    headline?: string;
    primaryText: string;
    description?: string;
    callToAction?: string;
    destinationUrl: string;
    imageUrl?: string;
    videoUrl?: string;
    agentId?: string;
  }): Promise<string> {
    const result = await db
      .insert(ads)
      .values({
        adSetId: data.adSetId,
        campaignId: data.campaignId,
        companyId: data.companyId,
        name: data.name,
        type: data.type || 'image',
        status: 'draft',
        headline: data.headline,
        primaryText: data.primaryText,
        description: data.description,
        callToAction: data.callToAction || 'Learn More',
        destinationUrl: data.destinationUrl,
        imageUrl: data.imageUrl,
        videoUrl: data.videoUrl,
        createdByAgentId: data.agentId,
      })
      .returning({ id: ads.id });

    const ad = result[0];
    if (!ad) throw new Error('Failed to create ad');

    return ad.id;
  }

  // ============================================
  // PERFORMANCE TRACKING
  // ============================================

  /**
   * Fetch and store campaign performance
   */
  async fetchCampaignPerformance(campaignId: string): Promise<void> {
    const campaign = await db.query.adCampaigns.findFirst({
      where: eq(adCampaigns.id, campaignId),
    });

    if (!campaign || !campaign.platformCampaignId) return;

    const connection = await db.query.adConnections.findFirst({
      where: eq(adConnections.id, campaign.connectionId),
    });

    if (!connection) return;

    if (platformRegistry.hasAdProvider(campaign.platform)) {
      const provider = platformRegistry.getAdProvider(campaign.platform);
      const conn: PlatformConnection = {
        id: connection.id, companyId: connection.companyId,
        platform: connection.platform, status: connection.status,
        accessToken: connection.accessToken,
        platformAccountId: connection.platformAccountId,
      };

      try {
        const insights = await provider.getCampaignInsights(conn, campaign.platformCampaignId);

        if (insights) {
          const { impressions, clicks, spend, reach, conversions } = insights;

          // Update campaign metrics
          await db
            .update(adCampaigns)
            .set({
              impressions,
              clicks,
              reach,
              conversions: conversions || 0,
              spentAmount: spend.toString(),
              ctr: impressions > 0 ? ((clicks / impressions) * 100).toFixed(2) : '0',
              cpc: clicks > 0 ? (spend / clicks).toFixed(2) : '0',
              cpm: impressions > 0 ? ((spend / impressions) * 1000).toFixed(2) : '0',
              updatedAt: new Date(),
            })
            .where(eq(adCampaigns.id, campaignId));

          // Store performance history per ad
          const campaignAds = await db.query.ads.findMany({
            where: eq(ads.campaignId, campaignId),
          });

          for (const ad of campaignAds) {
            await db.insert(adPerformance).values({
              adId: ad.id,
              campaignId: campaignId,
              companyId: campaign.companyId,
              date: new Date(),
              impressions: Math.floor(impressions / Math.max(campaignAds.length, 1)),
              reach: Math.floor(reach / Math.max(campaignAds.length, 1)),
              clicks: Math.floor(clicks / Math.max(campaignAds.length, 1)),
              conversions: Math.floor(conversions / Math.max(campaignAds.length, 1)),
              spend: (spend / Math.max(campaignAds.length, 1)).toFixed(2),
            });
          }
        }
      } catch (error) {
        console.error(`[Ads] Failed to fetch performance for campaign ${campaignId}:`, error);
      }
    }
  }

  /**
   * Get metrics summary for a company
   */
  async getMetricsSummary(companyId: string): Promise<{
    totalCampaigns: number;
    activeCampaigns: number;
    totalSpend: number;
    totalImpressions: number;
    totalClicks: number;
    totalConversions: number;
    avgCtr: number;
    avgCpc: number;
  }> {
    const campaigns = await db.query.adCampaigns.findMany({
      where: eq(adCampaigns.companyId, companyId),
    });

    const activeCampaigns = campaigns.filter((c) => c.status === 'active').length;
    const totalSpend = campaigns.reduce((sum, c) => sum + parseFloat(c.spentAmount || '0'), 0);
    const totalImpressions = campaigns.reduce((sum, c) => sum + (c.impressions || 0), 0);
    const totalClicks = campaigns.reduce((sum, c) => sum + (c.clicks || 0), 0);
    const totalConversions = campaigns.reduce((sum, c) => sum + (c.conversions || 0), 0);

    return {
      totalCampaigns: campaigns.length,
      activeCampaigns,
      totalSpend,
      totalImpressions,
      totalClicks,
      totalConversions,
      avgCtr: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
      avgCpc: totalClicks > 0 ? totalSpend / totalClicks : 0,
    };
  }

  // ============================================
  // AI CONTENT GENERATION
  // ============================================

  /**
   * Generate ad creative content
   */
  async generateAdCreative(options: {
    companyId: string;
    platform: 'facebook' | 'instagram' | 'google' | 'linkedin';
    objective: string;
    productName: string;
    productDescription: string;
    targetAudience: string;
    tone?: 'professional' | 'casual' | 'urgent' | 'inspirational';
  }): Promise<{
    headlines: string[];
    primaryTexts: string[];
    descriptions: string[];
    callToActions: string[];
  }> {
    const platformGuides: Record<string, string> = {
      facebook: 'Facebook: 125 char headlines, engaging primary text, clear CTA',
      instagram: 'Instagram: Visual-first, engaging caption style',
      google: 'Google Ads: 30 char headlines, 90 char descriptions, keyword-focused',
      linkedin: 'LinkedIn: Professional tone, B2B focused',
    };

    const prompt = `Generate ad creative variations for ${options.platform}.

Product: ${options.productName}
Description: ${options.productDescription}
Target Audience: ${options.targetAudience}
Objective: ${options.objective}
Tone: ${options.tone || 'professional'}

Platform Guidelines: ${platformGuides[options.platform]}

Generate 3 variations of:
1. Headlines (attention-grabbing, benefit-focused)
2. Primary text (compelling body copy)
3. Descriptions (supporting info)
4. Call-to-action suggestions

Return JSON:
{
  "headlines": ["headline1", "headline2", "headline3"],
  "primaryTexts": ["text1", "text2", "text3"],
  "descriptions": ["desc1", "desc2", "desc3"],
  "callToActions": ["CTA1", "CTA2", "CTA3"]
}

Return ONLY valid JSON.`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      system: ADS_FRAMEWORK || undefined,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0];
    if (!content || content.type !== 'text') {
      throw new Error('Failed to generate ad creative');
    }

    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Invalid response format');
    }

    return JSON.parse(jsonMatch[0]);
  }
}

export const adsEngine = new AdsEngine();
