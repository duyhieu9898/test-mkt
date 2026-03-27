/**
 * LinkedIn Platform Provider
 *
 * Social posting via LinkedIn Marketing API.
 * Ads via LinkedIn Campaign Manager API.
 *
 * API: https://api.linkedin.com/v2/
 * OAuth: https://www.linkedin.com/oauth/v2/
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

const API_BASE = 'https://api.linkedin.com/v2';

async function liRequest<T>(endpoint: string, accessToken: string, method = 'GET', body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}/${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`LinkedIn API error: ${(err as any).message || res.statusText}`);
  }
  return method === 'DELETE' ? (undefined as T) : res.json();
}

export class LinkedInSocialProvider implements ISocialPlatformProvider {
  readonly platformId = 'linkedin';

  async publishPost(connection: PlatformConnection, content: PostContent): Promise<PostResult> {
    const authorId = connection.platformAccountId;
    if (!authorId) return { success: false, error: 'No LinkedIn author ID' };

    try {
      const text = content.hashtags?.length
        ? `${content.text}\n\n${content.hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ')}`
        : content.text;

      const postBody: Record<string, unknown> = {
        author: `urn:li:person:${authorId}`,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: { text },
            shareMediaCategory: content.mediaUrls?.length ? 'IMAGE' : 'NONE',
            ...(content.mediaUrls?.length && {
              media: content.mediaUrls.map((url) => ({
                status: 'READY',
                originalUrl: url,
                media: url,
              })),
            }),
          },
        },
        visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
      };

      const result = await liRequest<{ id: string }>('ugcPosts', connection.accessToken, 'POST', postBody);
      return {
        success: true,
        platformPostId: result.id,
        platformPostUrl: `https://www.linkedin.com/feed/update/${result.id}/`,
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'LinkedIn post failed' };
    }
  }

  async schedulePost(_connection: PlatformConnection, _content: PostContent, _scheduledTime: Date): Promise<PostResult> {
    // LinkedIn API doesn't support native scheduling — handled by distribution scheduler
    return { success: true, platformPostId: `scheduled_${Date.now()}` };
  }

  async getPostEngagement(connection: PlatformConnection, platformPostId: string): Promise<EngagementResult> {
    try {
      const data = await liRequest<any>(
        `socialActions/${encodeURIComponent(platformPostId)}?fields=likes,comments`,
        connection.accessToken
      );
      return {
        likes: data.likes?.length || 0,
        comments: data.comments?.length || 0,
        shares: 0, saves: 0, clicks: 0, impressions: 0, reach: 0,
        raw: data,
      };
    } catch {
      return { likes: 0, comments: 0, shares: 0, saves: 0, clicks: 0, impressions: 0, reach: 0 };
    }
  }

  async deletePost(connection: PlatformConnection, platformPostId: string) {
    try {
      await liRequest(`ugcPosts/${encodeURIComponent(platformPostId)}`, connection.accessToken, 'DELETE');
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Delete failed' };
    }
  }

  async validateConnection(connection: PlatformConnection) {
    try {
      await liRequest<any>('me', connection.accessToken);
      return { valid: true };
    } catch (err) {
      return { valid: false, error: err instanceof Error ? err.message : 'Invalid token' };
    }
  }
}

// LinkedIn Ad Provider
const LI_OBJECTIVE_MAP: Record<string, string> = {
  awareness: 'BRAND_AWARENESS',
  traffic: 'WEBSITE_VISITS',
  engagement: 'ENGAGEMENT',
  leads: 'LEAD_GENERATION',
  sales: 'WEBSITE_CONVERSIONS',
  conversions: 'WEBSITE_CONVERSIONS',
};

export class LinkedInAdProvider implements IAdPlatformProvider {
  readonly platformId = 'linkedin';

  mapObjective(objective: string): string {
    return LI_OBJECTIVE_MAP[objective.toLowerCase()] || 'WEBSITE_VISITS';
  }

  buildTargeting(audience: TargetAudience): Record<string, unknown> {
    const criteria: Record<string, unknown> = {};
    if (audience.locations?.length) criteria.locations = audience.locations;
    if (audience.interests?.length) criteria.interests = audience.interests;
    if (audience.languages?.length) criteria.interfaceLocales = audience.languages;
    return { include: { and: [criteria] } };
  }

  async createCampaign(connection: PlatformConnection, data: CreateCampaignInput): Promise<PlatformCampaignResult> {
    const accountId = connection.platformAccountId;
    const result = await liRequest<{ id: string }>('adCampaignsV2', connection.accessToken, 'POST', {
      account: `urn:li:sponsoredAccount:${accountId}`,
      name: data.name,
      objectiveType: this.mapObjective(data.objective),
      status: 'PAUSED',
      type: 'SPONSORED_UPDATES',
      dailyBudget: { amount: String(Math.round(data.dailyBudget * 100)), currencyCode: data.currency || 'USD' },
    });
    return { id: result.id, platformCampaignId: result.id, status: 'PAUSED' };
  }

  async updateCampaignStatus(connection: PlatformConnection, platformCampaignId: string, status: 'ACTIVE' | 'PAUSED') {
    await liRequest(`adCampaignsV2/${platformCampaignId}`, connection.accessToken, 'POST', {
      status: status === 'ACTIVE' ? 'ACTIVE' : 'PAUSED',
      patch: { $set: { status: status === 'ACTIVE' ? 'ACTIVE' : 'PAUSED' } },
    });
  }

  async createAdSet(_connection: PlatformConnection, data: CreateAdSetInput): Promise<PlatformAdSetResult> {
    // LinkedIn doesn't have ad sets — campaigns serve this purpose
    return { id: data.campaignId, platformAdSetId: data.platformCampaignId };
  }

  async createAd(connection: PlatformConnection, data: CreateAdInput): Promise<PlatformAdResult> {
    const result = await liRequest<{ id: string }>('adCreativesV2', connection.accessToken, 'POST', {
      campaign: `urn:li:sponsoredCampaign:${data.platformAdSetId}`,
      type: 'SPONSORED_STATUS_UPDATE',
      reference: data.destinationUrl,
    });
    return { id: result.id, platformAdId: result.id };
  }

  async getCampaignInsights(connection: PlatformConnection, platformCampaignId: string): Promise<CampaignInsights> {
    try {
      const data = await liRequest<any>(
        `adAnalyticsV2?q=analytics&campaigns[0]=urn:li:sponsoredCampaign:${platformCampaignId}&dateRange.start.year=2024&dateRange.start.month=1&dateRange.start.day=1&timeGranularity=ALL`,
        connection.accessToken
      );
      const row = data.elements?.[0] || {};
      const impressions = row.impressions || 0;
      const clicks = row.clicks || 0;
      const spend = row.costInLocalCurrency || 0;
      return {
        impressions, reach: impressions, clicks, conversions: row.externalWebsiteConversions || 0,
        spend, ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
        cpc: clicks > 0 ? spend / clicks : 0, cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
        raw: row,
      };
    } catch {
      return { impressions: 0, reach: 0, clicks: 0, conversions: 0, spend: 0, ctr: 0, cpc: 0, cpm: 0 };
    }
  }
}

export class LinkedInOAuthProvider implements IOAuthProvider {
  readonly platformId = 'linkedin';

  isConfigured(): boolean {
    return !!(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET);
  }

  getAuthorizationUrl(state: string, redirectUri: string): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: process.env.LINKEDIN_CLIENT_ID || '',
      redirect_uri: redirectUri,
      state,
      scope: 'r_liteprofile w_member_social rw_ads r_ads_reporting r_organization_social w_organization_social',
    });
    return `https://www.linkedin.com/oauth/v2/authorization?${params}`;
  }

  async exchangeCode(code: string, redirectUri: string): Promise<OAuthTokens> {
    const res = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: process.env.LINKEDIN_CLIENT_ID || '',
        client_secret: process.env.LINKEDIN_CLIENT_SECRET || '',
      }),
    });
    if (!res.ok) throw new Error('LinkedIn token exchange failed');
    const data = await res.json();

    const profile = await liRequest<any>('me', data.access_token);

    return {
      accessToken: data.access_token,
      expiresIn: data.expires_in || 5184000,
      extra: { userId: profile.id, firstName: profile.localizedFirstName, lastName: profile.localizedLastName },
    };
  }

  async refreshToken(refreshToken: string): Promise<OAuthTokens> {
    const res = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: process.env.LINKEDIN_CLIENT_ID || '',
        client_secret: process.env.LINKEDIN_CLIENT_SECRET || '',
      }),
    });
    if (!res.ok) throw new Error('LinkedIn token refresh failed');
    const data = await res.json();
    return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresIn: data.expires_in };
  }
}

export const linkedinConfig: PlatformConfig = {
  platformId: 'linkedin',
  displayName: 'LinkedIn',
  description: 'Share professional updates and run B2B advertising campaigns',
  category: 'both',
  apiBaseUrl: API_BASE,
  oauthConfig: {
    authorizationUrl: 'https://www.linkedin.com/oauth/v2/authorization',
    tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
    scopes: ['r_liteprofile', 'w_member_social', 'rw_ads'],
    clientIdEnvVar: 'LINKEDIN_CLIENT_ID',
    clientSecretEnvVar: 'LINKEDIN_CLIENT_SECRET',
    supportsRefresh: true,
    defaultExpiresInSeconds: 5184000,
  },
  supportedFeatures: ['organic_post', 'paid_ads', 'engagement_tracking', 'analytics'],
  limits: { postTextMax: 3000, hashtagMax: 5 },
};
