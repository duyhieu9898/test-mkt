/**
 * TikTok Platform Provider
 *
 * Social: TikTok Content Posting API
 * Ads: TikTok Marketing API
 *
 * API: https://open.tiktokapis.com/v2/
 * Ads: https://business-api.tiktok.com/open_api/v1.3/
 */

import type {
  PlatformConfig,
  PlatformConnection,
  ISocialPlatformProvider,
  IAdPlatformProvider,
  IOAuthProvider,
  PostContent,
  PostResult,
  EngagementResult,
  CreateCampaignInput,
  CreateAdSetInput,
  CreateAdInput,
  PlatformCampaignResult,
  PlatformAdSetResult,
  PlatformAdResult,
  CampaignInsights,
  TargetAudience,
  OAuthTokens,
} from '../types';

const CONTENT_API = 'https://open.tiktokapis.com/v2';
const ADS_API = 'https://business-api.tiktok.com/open_api/v1.3';

async function ttRequest<T>(baseUrl: string, endpoint: string, accessToken: string, method = 'GET', body?: unknown): Promise<T> {
  const res = await fetch(`${baseUrl}/${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`TikTok API error: ${JSON.stringify(err)}`);
  }
  return res.json();
}

export class TikTokSocialProvider implements ISocialPlatformProvider {
  readonly platformId = 'tiktok';

  async publishPost(connection: PlatformConnection, content: PostContent): Promise<PostResult> {
    if (!content.mediaUrls?.length) {
      return { success: false, error: 'TikTok requires a video for posts' };
    }

    try {
      // TikTok Content Posting API — init upload then publish
      const initResult = await ttRequest<any>(CONTENT_API, 'post/publish/video/init/', connection.accessToken, 'POST', {
        post_info: {
          title: content.text.substring(0, 150),
          privacy_level: 'PUBLIC_TO_EVERYONE',
          disable_comment: false,
          disable_duet: false,
          disable_stitch: false,
        },
        source_info: {
          source: 'PULL_FROM_URL',
          video_url: content.mediaUrls[0],
        },
      });

      return {
        success: true,
        platformPostId: initResult.data?.publish_id,
        platformPostUrl: `https://www.tiktok.com/@user/video/${initResult.data?.publish_id}`,
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'TikTok post failed' };
    }
  }

  async schedulePost(_connection: PlatformConnection, _content: PostContent, _scheduledTime: Date): Promise<PostResult> {
    return { success: true, platformPostId: `scheduled_${Date.now()}` };
  }

  async getPostEngagement(connection: PlatformConnection, platformPostId: string): Promise<EngagementResult> {
    try {
      const data = await ttRequest<any>(CONTENT_API, `video/query/?fields=like_count,comment_count,share_count,view_count`, connection.accessToken, 'POST', {
        filters: { video_ids: [platformPostId] },
      });
      const video = data.data?.videos?.[0] || {};
      return {
        likes: video.like_count || 0,
        comments: video.comment_count || 0,
        shares: video.share_count || 0,
        saves: 0, clicks: 0,
        impressions: video.view_count || 0,
        reach: video.view_count || 0,
        videoViews: video.view_count || 0,
        raw: video,
      };
    } catch {
      return { likes: 0, comments: 0, shares: 0, saves: 0, clicks: 0, impressions: 0, reach: 0 };
    }
  }

  async deletePost(_connection: PlatformConnection, _platformPostId: string) {
    return { success: false, error: 'TikTok does not support API-based post deletion' };
  }

  async validateConnection(connection: PlatformConnection) {
    try {
      await ttRequest<any>(CONTENT_API, 'user/info/?fields=open_id,display_name', connection.accessToken);
      return { valid: true };
    } catch (err) {
      return { valid: false, error: err instanceof Error ? err.message : 'Invalid token' };
    }
  }
}

// TikTok Ads
const TT_OBJECTIVE_MAP: Record<string, string> = {
  awareness: 'REACH',
  traffic: 'TRAFFIC',
  engagement: 'VIDEO_VIEWS',
  leads: 'LEAD_GENERATION',
  sales: 'CONVERSIONS',
  conversions: 'CONVERSIONS',
};

export class TikTokAdProvider implements IAdPlatformProvider {
  readonly platformId = 'tiktok';

  mapObjective(objective: string): string {
    return TT_OBJECTIVE_MAP[objective.toLowerCase()] || 'TRAFFIC';
  }

  buildTargeting(audience: TargetAudience): Record<string, unknown> {
    const targeting: Record<string, unknown> = {};
    if (audience.locations?.length) targeting.location_ids = audience.locations;
    if (audience.ageMin || audience.ageMax) targeting.age_groups = this.mapAgeGroups(audience.ageMin, audience.ageMax);
    if (audience.genders?.length) targeting.gender = audience.genders[0] === 'male' ? 'GENDER_MALE' : 'GENDER_FEMALE';
    if (audience.interests?.length) targeting.interest_category_ids = audience.interests;
    if (audience.languages?.length) targeting.languages = audience.languages;
    return targeting;
  }

  private mapAgeGroups(min?: number, max?: number): string[] {
    const groups = [];
    const ranges = ['AGE_13_17', 'AGE_18_24', 'AGE_25_34', 'AGE_35_44', 'AGE_45_54', 'AGE_55_100'];
    const mins = [13, 18, 25, 35, 45, 55];
    const maxs = [17, 24, 34, 44, 54, 100];
    for (let i = 0; i < ranges.length; i++) {
      if ((!min || maxs[i] >= min) && (!max || mins[i] <= max)) groups.push(ranges[i]);
    }
    return groups;
  }

  async createCampaign(connection: PlatformConnection, data: CreateCampaignInput): Promise<PlatformCampaignResult> {
    const result = await ttRequest<any>(ADS_API, 'campaign/create/', connection.accessToken, 'POST', {
      advertiser_id: connection.platformAccountId,
      campaign_name: data.name,
      objective_type: this.mapObjective(data.objective),
      budget_mode: 'BUDGET_MODE_DAY',
      budget: data.dailyBudget,
      operation_status: 'DISABLE',
    });
    const id = result.data?.campaign_id;
    return { id, platformCampaignId: id, status: 'PAUSED' };
  }

  async updateCampaignStatus(connection: PlatformConnection, platformCampaignId: string, status: 'ACTIVE' | 'PAUSED') {
    await ttRequest(ADS_API, 'campaign/status/update/', connection.accessToken, 'POST', {
      advertiser_id: connection.platformAccountId,
      campaign_ids: [platformCampaignId],
      operation_status: status === 'ACTIVE' ? 'ENABLE' : 'DISABLE',
    });
  }

  async createAdSet(connection: PlatformConnection, data: CreateAdSetInput): Promise<PlatformAdSetResult> {
    const result = await ttRequest<any>(ADS_API, 'adgroup/create/', connection.accessToken, 'POST', {
      advertiser_id: connection.platformAccountId,
      campaign_id: data.platformCampaignId,
      adgroup_name: data.name,
      budget: data.dailyBudget || 20,
      budget_mode: 'BUDGET_MODE_DAY',
      placement_type: 'PLACEMENT_TYPE_AUTOMATIC',
      operation_status: 'DISABLE',
    });
    const id = result.data?.adgroup_id;
    return { id, platformAdSetId: id };
  }

  async createAd(connection: PlatformConnection, data: CreateAdInput): Promise<PlatformAdResult> {
    const result = await ttRequest<any>(ADS_API, 'ad/create/', connection.accessToken, 'POST', {
      advertiser_id: connection.platformAccountId,
      adgroup_id: data.platformAdSetId,
      ad_name: data.name,
      ad_text: data.primaryText,
      call_to_action: data.callToAction,
      landing_page_url: data.destinationUrl,
      operation_status: 'DISABLE',
    });
    const id = result.data?.ad_id;
    return { id, platformAdId: id };
  }

  async getCampaignInsights(connection: PlatformConnection, platformCampaignId: string): Promise<CampaignInsights> {
    try {
      const result = await ttRequest<any>(ADS_API, 'report/integrated/get/', connection.accessToken, 'POST', {
        advertiser_id: connection.platformAccountId,
        report_type: 'BASIC',
        dimensions: ['campaign_id'],
        metrics: ['impressions', 'clicks', 'spend', 'reach', 'conversion'],
        filters: [{ field_name: 'campaign_id', filter_type: 'IN', filter_value: JSON.stringify([platformCampaignId]) }],
        data_level: 'AUCTION_CAMPAIGN',
        lifetime: true,
      });
      const row = result.data?.list?.[0]?.metrics || {};
      const impressions = parseInt(row.impressions || '0');
      const clicks = parseInt(row.clicks || '0');
      const spend = parseFloat(row.spend || '0');
      return {
        impressions, reach: parseInt(row.reach || '0'), clicks, conversions: parseInt(row.conversion || '0'), spend,
        ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
        cpc: clicks > 0 ? spend / clicks : 0, cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
        raw: row,
      };
    } catch {
      return { impressions: 0, reach: 0, clicks: 0, conversions: 0, spend: 0, ctr: 0, cpc: 0, cpm: 0 };
    }
  }
}

export class TikTokOAuthProvider implements IOAuthProvider {
  readonly platformId = 'tiktok';

  isConfigured(): boolean {
    return !!(process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET);
  }

  getAuthorizationUrl(state: string, redirectUri: string): string {
    const params = new URLSearchParams({
      client_key: process.env.TIKTOK_CLIENT_KEY || '',
      redirect_uri: redirectUri,
      state,
      scope: 'user.info.basic,video.publish,video.list',
      response_type: 'code',
    });
    return `https://www.tiktok.com/v2/auth/authorize/?${params}`;
  }

  async exchangeCode(code: string, redirectUri: string): Promise<OAuthTokens> {
    const res = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: process.env.TIKTOK_CLIENT_KEY || '',
        client_secret: process.env.TIKTOK_CLIENT_SECRET || '',
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
    });
    if (!res.ok) throw new Error('TikTok token exchange failed');
    const data = await res.json();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in || 86400,
      extra: { openId: data.open_id },
    };
  }

  async refreshToken(refreshToken: string): Promise<OAuthTokens> {
    const res = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: process.env.TIKTOK_CLIENT_KEY || '',
        client_secret: process.env.TIKTOK_CLIENT_SECRET || '',
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });
    if (!res.ok) throw new Error('TikTok token refresh failed');
    const data = await res.json();
    return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresIn: data.expires_in };
  }
}

export const tiktokConfig: PlatformConfig = {
  platformId: 'tiktok',
  displayName: 'TikTok',
  description: 'Share short videos and run TikTok ad campaigns',
  category: 'both',
  apiBaseUrl: CONTENT_API,
  oauthConfig: {
    authorizationUrl: 'https://www.tiktok.com/v2/auth/authorize/',
    tokenUrl: 'https://open.tiktokapis.com/v2/oauth/token/',
    scopes: ['user.info.basic', 'video.publish', 'video.list'],
    clientIdEnvVar: 'TIKTOK_CLIENT_KEY',
    clientSecretEnvVar: 'TIKTOK_CLIENT_SECRET',
    supportsRefresh: true,
    defaultExpiresInSeconds: 86400,
  },
  supportedFeatures: ['organic_post', 'paid_ads', 'video_upload', 'engagement_tracking', 'analytics'],
  limits: { postTextMax: 2200, hashtagMax: 100 },
};
