/**
 * Attribution Service — Revenue Attribution Engine
 *
 * Tracks exactly how marketing generates money.
 * Default model: Last Click — attribute conversion to the most recent
 * session with UTM params linked to a campaign.
 */

import { db } from '../lib/db';
import { eq, and, desc, gte, lte, sql } from 'drizzle-orm';
import {
  visitorSessions,
  conversions,
  campaigns,
  banners,
} from '@1person/core/db';

// =============================================
// TYPES
// =============================================

interface AttributeConversionInput {
  sessionId?: string;
  leadId?: string;
  type: string;
  revenue: number;
}

interface AttributionResult {
  campaign_id?: string;
  creative_id?: string;
  channel: string;
  attribution_model: string;
  source?: string;
  medium?: string;
  campaignName?: string;
  utmContent?: string;
}

interface CampaignRevenueResult {
  totalRevenue: number;
  totalCost: number;
  roas: number;
  cpa: number;
  conversions: number;
}

interface ChannelRevenueResult {
  channel: string;
  revenue: number;
  cost: number;
  roas: number;
  conversions: number;
}

// =============================================
// HELPER: Determine channel from UTM source
// =============================================

function resolveChannel(utmSource?: string | null, utmMedium?: string | null, referrerDomain?: string | null): string {
  const src = (utmSource || '').toLowerCase();
  const med = (utmMedium || '').toLowerCase();
  const ref = (referrerDomain || '').toLowerCase();

  if (src.includes('facebook') || src.includes('fb') || src.includes('meta') || ref.includes('facebook')) return 'facebook';
  if (src.includes('google') || ref.includes('google')) {
    if (med === 'cpc' || med === 'paid') return 'google';
    return 'google_organic';
  }
  if (src.includes('tiktok') || ref.includes('tiktok')) return 'tiktok';
  if (src.includes('linkedin') || ref.includes('linkedin')) return 'linkedin';
  if (src.includes('twitter') || src.includes('x.com') || ref.includes('twitter')) return 'twitter';
  if (med === 'email' || src.includes('email')) return 'email';
  if (med === 'organic' || med === 'seo') return 'organic';
  if (src && src !== 'direct') return src; // Use raw source as channel
  if (ref) return 'referral';
  return 'direct';
}

// =============================================
// ATTRIBUTION SERVICE
// =============================================

export class AttributionService {
  /**
   * Attribute a conversion to campaigns/creatives using Last Click model
   * Finds the most recent session with UTM params for this lead/session
   */
  async attributeConversion(
    companyId: string,
    data: AttributeConversionInput
  ): Promise<AttributionResult> {
    let session: any = null;

    // 1. Try to find the session by sessionId
    if (data.sessionId) {
      session = await db.query.visitorSessions.findFirst({
        where: and(
          eq(visitorSessions.companyId, companyId),
          eq(visitorSessions.sessionId, data.sessionId)
        ),
      });
    }

    // 2. If no session found but we have a leadId, find the most recent session for that lead
    if (!session && data.leadId) {
      session = await db.query.visitorSessions.findFirst({
        where: and(
          eq(visitorSessions.companyId, companyId),
          eq(visitorSessions.leadId, data.leadId)
        ),
        orderBy: desc(visitorSessions.startedAt),
      });
    }

    // 3. Resolve channel + campaign linkage
    const channel = resolveChannel(
      session?.utmSource,
      session?.utmMedium,
      session?.referrerDomain
    );

    let campaignId = session?.campaignId || undefined;
    let creativeId = session?.creativeId || undefined;

    // 4. If we have utmCampaign but no campaignId, try to match by campaign name
    if (!campaignId && session?.utmCampaign) {
      const matchedCampaign = await db.query.campaigns.findFirst({
        where: and(
          eq(campaigns.companyId, companyId),
          eq(campaigns.name, session.utmCampaign)
        ),
      });
      if (matchedCampaign) {
        campaignId = matchedCampaign.id;
      }
    }

    // 5. If we have utmContent but no creativeId, try to match by banner name
    if (!creativeId && session?.utmContent) {
      const matchedBanner = await db.query.banners.findFirst({
        where: and(
          eq(banners.companyId, companyId),
          eq(banners.id, session.utmContent)
        ),
      });
      if (matchedBanner) {
        creativeId = matchedBanner.id;
      }
    }

    // 6. Update campaign revenue if attributed
    if (campaignId && data.revenue > 0) {
      await db
        .update(campaigns)
        .set({
          revenue: sql`COALESCE(${campaigns.revenue}, '0')::decimal + ${data.revenue.toString()}`,
        })
        .where(eq(campaigns.id, campaignId));
    }

    return {
      campaign_id: campaignId,
      creative_id: creativeId,
      channel,
      attribution_model: 'last_click',
      source: session?.utmSource || undefined,
      medium: session?.utmMedium || undefined,
      campaignName: session?.utmCampaign || undefined,
      utmContent: session?.utmContent || undefined,
    };
  }

  /**
   * Get revenue metrics for a specific campaign
   */
  async getCampaignRevenue(campaignId: string): Promise<CampaignRevenueResult> {
    const campaignConversions = await db.query.conversions.findMany({
      where: eq(conversions.campaignId, campaignId),
    });

    const campaign = await db.query.campaigns.findFirst({
      where: eq(campaigns.id, campaignId),
    });

    const totalRevenue = campaignConversions.reduce(
      (sum, c) => sum + parseFloat(c.revenue || c.value || '0'),
      0
    );

    const metrics = (campaign?.metrics as any) || {};
    const totalCost = parseFloat(campaign?.cost || '0') || metrics.spend || 0;
    const convCount = campaignConversions.length;
    const roas = totalCost > 0 ? totalRevenue / totalCost : 0;
    const cpa = convCount > 0 ? totalCost / convCount : 0;

    return {
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalCost: Math.round(totalCost * 100) / 100,
      roas: Math.round(roas * 100) / 100,
      cpa: Math.round(cpa * 100) / 100,
      conversions: convCount,
    };
  }

  /**
   * Get revenue aggregated by channel
   */
  async getRevenueByChannel(
    companyId: string,
    dateRange?: { from: Date; to: Date }
  ): Promise<ChannelRevenueResult[]> {
    const conditions: any[] = [eq(conversions.companyId, companyId)];
    if (dateRange?.from) conditions.push(gte(conversions.convertedAt, dateRange.from));
    if (dateRange?.to) conditions.push(lte(conversions.convertedAt, dateRange.to));

    const allConversions = await db.query.conversions.findMany({
      where: and(...conditions),
    });

    // Group by channel
    const channelMap = new Map<string, { revenue: number; cost: number; conversions: number }>();

    for (const conv of allConversions) {
      const channel = conv.channel || resolveChannel(conv.source, conv.medium, null);
      const existing = channelMap.get(channel) || { revenue: 0, cost: 0, conversions: 0 };
      existing.revenue += parseFloat(conv.revenue || conv.value || '0');
      existing.cost += parseFloat(conv.cost || '0');
      existing.conversions += 1;
      channelMap.set(channel, existing);
    }

    return Array.from(channelMap.entries())
      .map(([channel, data]) => ({
        channel,
        revenue: Math.round(data.revenue * 100) / 100,
        cost: Math.round(data.cost * 100) / 100,
        roas: data.cost > 0 ? Math.round((data.revenue / data.cost) * 100) / 100 : 0,
        conversions: data.conversions,
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }

  /**
   * Get full revenue attribution report for the dashboard
   */
  async getRevenueAttribution(
    companyId: string,
    dateRange?: { from: Date; to: Date }
  ): Promise<{
    summary: {
      totalRevenue: number;
      totalSpend: number;
      overallROAS: number;
      averageCPA: number;
      totalConversions: number;
    };
    byCampaign: Array<{
      campaignId: string;
      name: string;
      platform: string;
      spend: number;
      revenue: number;
      roas: number;
      conversions: number;
      cpa: number;
    }>;
    byChannel: ChannelRevenueResult[];
    topCreatives: Array<{
      creativeId: string;
      headline: string;
      conversions: number;
      revenue: number;
      ctr: number;
    }>;
  }> {
    // Get all campaigns for this company
    const allCampaigns = await db.select().from(campaigns)
      .where(eq(campaigns.companyId, companyId));

    // Get all conversions in date range
    const convConditions: any[] = [eq(conversions.companyId, companyId)];
    if (dateRange?.from) convConditions.push(gte(conversions.convertedAt, dateRange.from));
    if (dateRange?.to) convConditions.push(lte(conversions.convertedAt, dateRange.to));

    const allConversions = await db.query.conversions.findMany({
      where: and(...convConditions),
    });

    // Aggregate campaign data
    const campaignConvMap = new Map<string, { revenue: number; cost: number; conversions: number }>();
    for (const conv of allConversions) {
      if (conv.campaignId) {
        const existing = campaignConvMap.get(conv.campaignId) || { revenue: 0, cost: 0, conversions: 0 };
        existing.revenue += parseFloat(conv.revenue || conv.value || '0');
        existing.cost += parseFloat(conv.cost || '0');
        existing.conversions += 1;
        campaignConvMap.set(conv.campaignId, existing);
      }
    }

    const byCampaign = allCampaigns.map((c) => {
      const convData = campaignConvMap.get(c.id) || { revenue: 0, cost: 0, conversions: 0 };
      const metrics = (c.metrics as any) || {};
      const spend = parseFloat(c.cost || '0') || metrics.spend || 0;
      const revenue = convData.revenue || parseFloat(c.revenue || '0');
      const convCount = convData.conversions || metrics.conversions || 0;

      return {
        campaignId: c.id,
        name: c.name,
        platform: c.platform,
        spend: Math.round(spend * 100) / 100,
        revenue: Math.round(revenue * 100) / 100,
        roas: spend > 0 ? Math.round((revenue / spend) * 100) / 100 : 0,
        conversions: convCount,
        cpa: convCount > 0 ? Math.round((spend / convCount) * 100) / 100 : 0,
      };
    }).filter((c) => c.spend > 0 || c.revenue > 0 || c.conversions > 0)
      .sort((a, b) => b.revenue - a.revenue);

    // Channel breakdown
    const byChannel = await this.getRevenueByChannel(companyId, dateRange);

    // Top creatives
    const creativeConvMap = new Map<string, { revenue: number; conversions: number }>();
    for (const conv of allConversions) {
      if (conv.creativeId) {
        const existing = creativeConvMap.get(conv.creativeId) || { revenue: 0, conversions: 0 };
        existing.revenue += parseFloat(conv.revenue || conv.value || '0');
        existing.conversions += 1;
        creativeConvMap.set(conv.creativeId, existing);
      }
    }

    const creativeIds = Array.from(creativeConvMap.keys());
    const allBanners = creativeIds.length > 0
      ? await db.select().from(banners).where(eq(banners.companyId, companyId))
      : [];

    const topCreatives = creativeIds
      .map((id) => {
        const data = creativeConvMap.get(id)!;
        const banner = allBanners.find((b) => b.id === id);
        const copy = banner?.copy as any;
        const metrics = banner?.metrics as any;
        return {
          creativeId: id,
          headline: copy?.headline || banner?.name || 'Unknown',
          conversions: data.conversions,
          revenue: Math.round(data.revenue * 100) / 100,
          ctr: metrics?.ctr || 0,
        };
      })
      .sort((a, b) => b.conversions - a.conversions)
      .slice(0, 10);

    // Summary
    const totalRevenue = allConversions.reduce(
      (sum, c) => sum + parseFloat(c.revenue || c.value || '0'),
      0
    );
    const totalSpend = allCampaigns.reduce((sum, c) => {
      const metrics = (c.metrics as any) || {};
      return sum + (parseFloat(c.cost || '0') || metrics.spend || 0);
    }, 0);
    const totalConversions = allConversions.length;
    const overallROAS = totalSpend > 0 ? totalRevenue / totalSpend : 0;
    const averageCPA = totalConversions > 0 ? totalSpend / totalConversions : 0;

    return {
      summary: {
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        totalSpend: Math.round(totalSpend * 100) / 100,
        overallROAS: Math.round(overallROAS * 100) / 100,
        averageCPA: Math.round(averageCPA * 100) / 100,
        totalConversions,
      },
      byCampaign,
      byChannel,
      topCreatives,
    };
  }
}

export const attributionService = new AttributionService();
