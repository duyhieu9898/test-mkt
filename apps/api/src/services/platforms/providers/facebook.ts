/**
 * Facebook Platform Provider
 *
 * Implements social posting (Pages), paid ads (Meta Ads), and OAuth.
 * Also serves as base for Instagram (which uses Facebook Graph API).
 *
 * API: Facebook Graph API v18.0
 * OAuth: https://www.facebook.com/v18.0/dialog/oauth
 * Docs: https://developers.facebook.com/docs/
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

const API_VERSION = 'v18.0';
const BASE_URL = `https://graph.facebook.com/${API_VERSION}`;
const FACEBOOK_PAGE_SCOPES = [
  'pages_manage_posts',
  'pages_read_engagement',
  'pages_show_list',
];
export type FacebookAdAccountAsset = {
  id: string;
  accountId: string;
  name: string;
  currency?: string;
  timezoneName?: string;
  status?: string;
  canRead: boolean;
  canManage: boolean;
};

export async function getFacebookAdAccounts(accessToken: string): Promise<FacebookAdAccountAsset[]> {
  const response = await fetch(
    `${BASE_URL}/me/adaccounts?fields=id,account_id,name,currency,timezone_name,account_status,capabilities&limit=100&access_token=${encodeURIComponent(accessToken)}`,
  );
  if (!response.ok) throw new Error('Unable to load Facebook Ad Accounts');
  const payload = await response.json() as { data?: Array<Record<string, unknown>> };
  return (payload.data ?? []).map((account) => {
    const capabilities = Array.isArray(account.capabilities) ? account.capabilities.map(String) : [];
    return {
      id: String(account.id ?? ''),
      accountId: String(account.account_id ?? account.id ?? '').replace(/^act_/, ''),
      name: String(account.name ?? account.id ?? 'Facebook Ad Account'),
      currency: typeof account.currency === 'string' ? account.currency : undefined,
      timezoneName: typeof account.timezone_name === 'string' ? account.timezone_name : undefined,
      status: account.account_status == null ? undefined : String(account.account_status),
      // `/me/adaccounts` is already scoped to accounts visible to the token.
      // Its `capabilities` field is made of product feature flags, not a user's
      // READ/ANALYZE/MANAGE task, so it must not disable a read-only selection.
      canRead: true,
      canManage: false,
    };
  }).filter((account) => Boolean(account.id));
}

export function getFacebookClientId(): string {
  return process.env.FACEBOOK_APP_ID || process.env.FACEBOOK_CLIENT_ID || '';
}

function getFacebookClientSecret(): string {
  return process.env.FACEBOOK_APP_SECRET || process.env.FACEBOOK_CLIENT_SECRET || '';
}

// ============================================================================
// SHARED HTTP HELPER
// ============================================================================

async function fbRequest<T>(
  endpoint: string,
  accessToken: string,
  method: 'GET' | 'POST' | 'DELETE' = 'GET',
  body?: Record<string, unknown>
): Promise<T> {
  const url = new URL(`${BASE_URL}/${endpoint}`);
  url.searchParams.set('access_token', accessToken);

  const response = await fetch(url.toString(), {
    method,
    headers: method === 'POST' ? { 'Content-Type': 'application/json' } : undefined,
    body: method === 'POST' ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: response.statusText } }));
    throw new Error(`Facebook API error: ${error.error?.message || response.statusText}`);
  }

  return response.json();
}

// ============================================================================
// SOCIAL PROVIDER (Facebook Pages)
// ============================================================================

export class FacebookSocialProvider implements ISocialPlatformProvider {
  readonly platformId = 'facebook';

  async publishPost(connection: PlatformConnection, content: PostContent): Promise<PostResult> {
    const pageId = connection.platformPageId || connection.platformAccountId;
    if (!pageId) return { success: false, error: 'No Facebook Page ID configured' };

    try {
      const message = content.hashtags?.length
        ? `${content.text}\n\n${content.hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ')}`
        : content.text;

      let result: { id: string; post_id?: string };

      if (content.mediaUrls?.length && content.mediaType !== 'video') {
        result = await fbRequest(`${pageId}/photos`, connection.accessToken, 'POST', {
          message,
          url: content.mediaUrls[0],
        });
      } else if (content.linkUrl) {
        result = await fbRequest(`${pageId}/feed`, connection.accessToken, 'POST', {
          message,
          link: content.linkUrl,
        });
      } else {
        result = await fbRequest(`${pageId}/feed`, connection.accessToken, 'POST', { message });
      }

      const postId = result.post_id || result.id;
      return {
        success: true,
        platformPostId: postId,
        platformPostUrl: `https://www.facebook.com/${postId}`,
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Facebook post failed' };
    }
  }

  async schedulePost(connection: PlatformConnection, content: PostContent, scheduledTime: Date): Promise<PostResult> {
    const pageId = connection.platformPageId || connection.platformAccountId;
    if (!pageId) return { success: false, error: 'No Facebook Page ID configured' };

    try {
      const message = content.hashtags?.length
        ? `${content.text}\n\n${content.hashtags.join(' ')}`
        : content.text;

      const endpoint = content.mediaUrls?.length ? `${pageId}/photos` : `${pageId}/feed`;
      const body: Record<string, unknown> = {
        message,
        published: false,
        scheduled_publish_time: Math.floor(scheduledTime.getTime() / 1000),
      };
      if (content.mediaUrls?.length) body.url = content.mediaUrls[0];

      const result = await fbRequest<{ id: string }>(endpoint, connection.accessToken, 'POST', body);
      return { success: true, platformPostId: result.id };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Schedule failed' };
    }
  }

  async getPostEngagement(connection: PlatformConnection, platformPostId: string): Promise<EngagementResult> {
    const data = await fbRequest<any>(
      `${platformPostId}?fields=likes.summary(true),comments.summary(true),shares,insights.metric(post_impressions,post_reach)`,
      connection.accessToken
    );

    let impressions = 0;
    let reach = 0;
    if (data.insights?.data) {
      for (const metric of data.insights.data) {
        if (metric.name === 'post_impressions') impressions = metric.values?.[0]?.value || 0;
        if (metric.name === 'post_reach') reach = metric.values?.[0]?.value || 0;
      }
    }

    return {
      likes: data.likes?.summary?.total_count || 0,
      comments: data.comments?.summary?.total_count || 0,
      shares: data.shares?.count || 0,
      saves: 0,
      clicks: 0,
      impressions,
      reach,
      raw: data,
    };
  }

  async deletePost(connection: PlatformConnection, platformPostId: string) {
    try {
      await fbRequest(platformPostId, connection.accessToken, 'DELETE');
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Delete failed' };
    }
  }

  async validateConnection(connection: PlatformConnection) {
    try {
      await fbRequest<any>('me?fields=id,name', connection.accessToken);
      return { valid: true };
    } catch (err) {
      return { valid: false, error: err instanceof Error ? err.message : 'Invalid token' };
    }
  }
}

// ============================================================================
// AD PROVIDER (Meta Ads)
// ============================================================================

const OBJECTIVE_MAP: Record<string, string> = {
  awareness: 'OUTCOME_AWARENESS',
  traffic: 'OUTCOME_TRAFFIC',
  engagement: 'OUTCOME_ENGAGEMENT',
  leads: 'OUTCOME_LEADS',
  sales: 'OUTCOME_SALES',
  conversions: 'OUTCOME_SALES',
};

export class FacebookAdProvider implements IAdPlatformProvider {
  readonly platformId = 'facebook';

  mapObjective(objective: string): string {
    return OBJECTIVE_MAP[objective.toLowerCase()] || 'OUTCOME_TRAFFIC';
  }

  buildTargeting(audience: TargetAudience): Record<string, unknown> {
    const targeting: Record<string, unknown> = {};
    if (audience.locations?.length) {
      targeting.geo_locations = {
        countries: audience.locations.filter((l) => l.length === 2),
        cities: audience.locations.filter((l) => l.length > 2).map((c) => ({ key: c })),
      };
    }
    if (audience.ageMin) targeting.age_min = audience.ageMin;
    if (audience.ageMax) targeting.age_max = audience.ageMax;
    if (audience.genders?.length) {
      targeting.genders = audience.genders.map((g) => (g === 'male' ? 1 : g === 'female' ? 2 : 0));
    }
    if (audience.interests?.length) {
      targeting.flexible_spec = [{ interests: audience.interests.map((i) => ({ name: i })) }];
    }
    if (audience.languages?.length) {
      targeting.locales = audience.languages;
    }
    return targeting;
  }

  async createCampaign(connection: PlatformConnection, data: CreateCampaignInput): Promise<PlatformCampaignResult> {
    const accountId = connection.platformAccountId;
    const result = await fbRequest<{ id: string }>(
      `act_${accountId}/campaigns`,
      connection.accessToken,
      'POST',
      {
        name: data.name,
        objective: this.mapObjective(data.objective),
        status: 'PAUSED',
        special_ad_categories: [],
        ...(data.dailyBudget && { daily_budget: Math.round(data.dailyBudget * 100) }),
      }
    );
    return { id: result.id, platformCampaignId: result.id, status: 'PAUSED' };
  }

  async updateCampaignStatus(connection: PlatformConnection, platformCampaignId: string, status: 'ACTIVE' | 'PAUSED') {
    await fbRequest(platformCampaignId, connection.accessToken, 'POST', { status });
  }

  async createAdSet(connection: PlatformConnection, data: CreateAdSetInput): Promise<PlatformAdSetResult> {
    const accountId = connection.platformAccountId;
    const targeting = data.targetAudience ? this.buildTargeting(data.targetAudience) : { geo_locations: { countries: ['US'] } };
    const result = await fbRequest<{ id: string }>(
      `act_${accountId}/adsets`,
      connection.accessToken,
      'POST',
      {
        campaign_id: data.platformCampaignId,
        name: data.name,
        daily_budget: Math.round((data.dailyBudget || 10) * 100),
        targeting,
        optimization_goal: 'LINK_CLICKS',
        billing_event: 'IMPRESSIONS',
        status: 'PAUSED',
        ...(data.placements?.length && {
          targeting: { ...targeting, publisher_platforms: data.placements },
        }),
      }
    );
    return { id: result.id, platformAdSetId: result.id };
  }

  async createAd(connection: PlatformConnection, data: CreateAdInput): Promise<PlatformAdResult> {
    const accountId = connection.platformAccountId;

    // First create the creative
    const creative = await fbRequest<{ id: string }>(
      `act_${accountId}/adcreatives`,
      connection.accessToken,
      'POST',
      {
        name: `Creative: ${data.name}`,
        object_story_spec: {
          link_data: {
            message: data.primaryText,
            link: data.destinationUrl,
            name: data.headline,
            description: data.description,
            call_to_action: { type: data.callToAction || 'LEARN_MORE', value: { link: data.destinationUrl } },
            ...(data.imageUrl && { image_url: data.imageUrl }),
          },
        },
      }
    );

    // Then create the ad
    const result = await fbRequest<{ id: string }>(
      `act_${accountId}/ads`,
      connection.accessToken,
      'POST',
      {
        adset_id: data.platformAdSetId,
        name: data.name,
        creative: { creative_id: creative.id },
        status: 'PAUSED',
      }
    );

    return { id: result.id, platformAdId: result.id, platformCreativeId: creative.id };
  }

  async getCampaignInsights(connection: PlatformConnection, platformCampaignId: string): Promise<CampaignInsights> {
    const data = await fbRequest<{ data: any[] }>(
      `${platformCampaignId}/insights?fields=impressions,clicks,spend,reach,actions&date_preset=last_7d`,
      connection.accessToken
    );

    const row = data.data?.[0] || {};
    const impressions = parseInt(row.impressions || '0');
    const clicks = parseInt(row.clicks || '0');
    const spend = parseFloat(row.spend || '0');
    const conversions = (row.actions || [])
      .filter((a: any) => a.action_type === 'offsite_conversion')
      .reduce((sum: number, a: any) => sum + parseInt(a.value || '0'), 0);

    return {
      impressions,
      reach: parseInt(row.reach || '0'),
      clicks,
      conversions,
      spend,
      ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
      cpc: clicks > 0 ? spend / clicks : 0,
      cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
      raw: row,
    };
  }
}

// ============================================================================
// OAUTH PROVIDER
// ============================================================================

export class FacebookOAuthProvider implements IOAuthProvider {
  readonly platformId = 'facebook';

  isConfigured(): boolean {
    return !!(getFacebookClientId() && getFacebookClientSecret());
  }

  getAuthorizationUrl(state: string, redirectUri: string): string {
    const params = new URLSearchParams({
      client_id: getFacebookClientId(),
      redirect_uri: redirectUri,
      state,
      // Legacy Facebook connector: supports both Page publishing and paid-ads
      // mutations. The read-only Ads flow must use its own OAuth route rather
      // than reducing these scopes.
      scope: 'pages_manage_posts,pages_read_engagement,pages_show_list,ads_management,ads_read,business_management,read_insights',
      response_type: 'code',
    });
    return `https://www.facebook.com/${API_VERSION}/dialog/oauth?${params}`;
  }

  getPageAuthorizationUrl(state: string, redirectUri: string): string {
    const params = new URLSearchParams({
      client_id: getFacebookClientId(),
      redirect_uri: redirectUri,
      state,
      scope: FACEBOOK_PAGE_SCOPES.join(','),
      response_type: 'code',
    });
    return `https://www.facebook.com/${API_VERSION}/dialog/oauth?${params}`;
  }

  async exchangeCode(code: string, redirectUri: string): Promise<OAuthTokens> {
    const params = new URLSearchParams({
      client_id: getFacebookClientId(),
      client_secret: getFacebookClientSecret(),
      redirect_uri: redirectUri,
      code,
    });

    const res = await fetch(`${BASE_URL}/oauth/access_token?${params}`);
    if (!res.ok) throw new Error('Facebook token exchange failed');
    const data = await res.json();

    // Exchange for long-lived token
    const longParams = new URLSearchParams({
      grant_type: 'fb_exchange_token',
      client_id: getFacebookClientId(),
      client_secret: getFacebookClientSecret(),
      fb_exchange_token: data.access_token,
    });
    const longRes = await fetch(`${BASE_URL}/oauth/access_token?${longParams}`);
    const longData = longRes.ok ? await longRes.json() : data;

    // Get user's pages
    const pagesRes = await fetch(
      `${BASE_URL}/me/accounts?fields=id,name,picture,access_token,tasks&limit=100&access_token=${longData.access_token}`,
    );
    const pagesData = pagesRes.ok ? await pagesRes.json() : { data: [] };
    const adAccounts = await getFacebookAdAccounts(longData.access_token).catch(() => []);
    const permissionsRes = await fetch(
      `${BASE_URL}/me/permissions?access_token=${longData.access_token}`,
    );
    const permissionsData = permissionsRes.ok ? await permissionsRes.json() : { data: [] };
    const grantedPermissions = (permissionsData.data ?? [])
      .filter((permission: any) => permission.status === 'granted')
      .map((permission: any) => permission.permission);

    return {
      accessToken: longData.access_token,
      expiresIn: longData.expires_in || 5184000,
      tokenType: 'bearer',
      scope: grantedPermissions.join(','),
      extra: {
        pages: pagesData.data || [],
        adAccounts,
        userAccessToken: longData.access_token,
        userId: (await fbRequest<any>('me?fields=id,name', longData.access_token)).id,
      },
    };
  }

  async refreshToken(refreshToken: string): Promise<OAuthTokens> {
    // Facebook uses long-lived tokens that don't have traditional refresh
    // Instead, exchange the current token for a new long-lived one
    const params = new URLSearchParams({
      grant_type: 'fb_exchange_token',
      client_id: getFacebookClientId(),
      client_secret: getFacebookClientSecret(),
      fb_exchange_token: refreshToken,
    });

    const res = await fetch(`${BASE_URL}/oauth/access_token?${params}`);
    if (!res.ok) throw new Error('Facebook token refresh failed');
    const data = await res.json();

    return {
      accessToken: data.access_token,
      expiresIn: data.expires_in || 5184000,
    };
  }
}

// ============================================================================
// CONFIG
// ============================================================================

export const facebookConfig: PlatformConfig = {
  platformId: 'facebook',
  displayName: 'Meta (Facebook Ads & Social)',
  description: 'Connect Meta Ad Account for AI performance analysis & link Facebook Page for publishing.',
  category: 'both',
  apiBaseUrl: BASE_URL,
  apiVersion: API_VERSION,
  oauthConfig: {
    authorizationUrl: `https://www.facebook.com/${API_VERSION}/dialog/oauth`,
    tokenUrl: `${BASE_URL}/oauth/access_token`,
    scopes: ['pages_manage_posts', 'pages_read_engagement', 'pages_show_list', 'ads_management', 'ads_read'],
    clientIdEnvVar: 'FACEBOOK_CLIENT_ID',
    clientSecretEnvVar: 'FACEBOOK_CLIENT_SECRET',
    supportsRefresh: true,
    defaultExpiresInSeconds: 5184000,
  },
  supportedFeatures: ['organic_post', 'paid_ads', 'scheduling', 'carousel', 'video_upload', 'engagement_tracking', 'analytics'],
  limits: { postTextMax: 63206, headlineMax: 40, hashtagMax: 30, mediaMax: 10 },
};
