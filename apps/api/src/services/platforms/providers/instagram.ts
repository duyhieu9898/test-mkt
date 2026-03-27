/**
 * Instagram Platform Provider
 *
 * Uses Facebook Graph API (Instagram Graph API) for posting.
 * Ads go through Meta Ads (same as Facebook ad provider).
 *
 * API: Instagram Graph API via Facebook Graph API v18.0
 * Requires: Facebook Page connected to Instagram Business Account
 */

import type {
  PlatformConfig,
  PlatformConnection,
  ISocialPlatformProvider,
  IOAuthProvider,
  PostContent,
  PostResult,
  EngagementResult,
  OAuthTokens,
} from '../types';

const API_VERSION = 'v18.0';
const BASE_URL = `https://graph.facebook.com/${API_VERSION}`;

async function igRequest<T>(endpoint: string, accessToken: string, method = 'GET', body?: Record<string, unknown>): Promise<T> {
  const url = new URL(`${BASE_URL}/${endpoint}`);
  url.searchParams.set('access_token', accessToken);
  const res = await fetch(url.toString(), {
    method,
    headers: method === 'POST' ? { 'Content-Type': 'application/json' } : undefined,
    body: method === 'POST' ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Instagram API error: ${(err as any).error?.message || res.statusText}`);
  }
  return res.json();
}

export class InstagramSocialProvider implements ISocialPlatformProvider {
  readonly platformId = 'instagram';

  async publishPost(connection: PlatformConnection, content: PostContent): Promise<PostResult> {
    const igUserId = connection.platformAccountId;
    if (!igUserId) return { success: false, error: 'No Instagram Business Account ID' };

    try {
      const caption = content.hashtags?.length
        ? `${content.text}\n\n${content.hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ')}`
        : content.text;

      let containerId: string;

      if (content.mediaUrls?.length && content.mediaType === 'video') {
        // Video (Reels)
        const container = await igRequest<{ id: string }>(`${igUserId}/media`, connection.accessToken, 'POST', {
          media_type: 'REELS',
          video_url: content.mediaUrls[0],
          caption,
        });
        containerId = container.id;
      } else if (content.mediaUrls?.length && content.mediaUrls.length > 1) {
        // Carousel
        const children = [];
        for (const url of content.mediaUrls.slice(0, 10)) {
          const child = await igRequest<{ id: string }>(`${igUserId}/media`, connection.accessToken, 'POST', {
            image_url: url,
            is_carousel_item: true,
          });
          children.push(child.id);
        }
        const container = await igRequest<{ id: string }>(`${igUserId}/media`, connection.accessToken, 'POST', {
          media_type: 'CAROUSEL',
          children: children.join(','),
          caption,
        });
        containerId = container.id;
      } else if (content.mediaUrls?.length) {
        // Single image
        const container = await igRequest<{ id: string }>(`${igUserId}/media`, connection.accessToken, 'POST', {
          image_url: content.mediaUrls[0],
          caption,
        });
        containerId = container.id;
      } else {
        return { success: false, error: 'Instagram requires media (image or video) for posts' };
      }

      // Publish the container
      const result = await igRequest<{ id: string }>(`${igUserId}/media_publish`, connection.accessToken, 'POST', {
        creation_id: containerId,
      });

      return {
        success: true,
        platformPostId: result.id,
        platformPostUrl: `https://www.instagram.com/p/${result.id}/`,
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Instagram post failed' };
    }
  }

  async schedulePost(connection: PlatformConnection, content: PostContent, scheduledTime: Date): Promise<PostResult> {
    // Instagram Content Publishing API doesn't support native scheduling
    // Return the content info so the distribution scheduler can handle it
    return { success: true, platformPostId: `scheduled_${Date.now()}` };
  }

  async getPostEngagement(connection: PlatformConnection, platformPostId: string): Promise<EngagementResult> {
    const data = await igRequest<any>(
      `${platformPostId}?fields=like_count,comments_count,impressions,reach,saved,shares`,
      connection.accessToken
    );

    return {
      likes: data.like_count || 0,
      comments: data.comments_count || 0,
      shares: data.shares?.count || 0,
      saves: data.saved || 0,
      clicks: 0,
      impressions: data.impressions || 0,
      reach: data.reach || 0,
      raw: data,
    };
  }

  async deletePost(connection: PlatformConnection, platformPostId: string) {
    try {
      await igRequest(platformPostId, connection.accessToken, 'DELETE');
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Delete failed' };
    }
  }

  async validateConnection(connection: PlatformConnection) {
    try {
      await igRequest<any>(`${connection.platformAccountId}?fields=id,username`, connection.accessToken);
      return { valid: true };
    } catch (err) {
      return { valid: false, error: err instanceof Error ? err.message : 'Invalid token' };
    }
  }
}

// Instagram OAuth shares with Facebook (same app, different scopes)
export class InstagramOAuthProvider implements IOAuthProvider {
  readonly platformId = 'instagram';

  isConfigured(): boolean {
    return !!(process.env.FACEBOOK_CLIENT_ID && process.env.FACEBOOK_CLIENT_SECRET);
  }

  getAuthorizationUrl(state: string, redirectUri: string): string {
    const params = new URLSearchParams({
      client_id: process.env.FACEBOOK_CLIENT_ID || '',
      redirect_uri: redirectUri,
      state,
      scope: 'instagram_basic,instagram_content_publish,instagram_manage_insights,pages_show_list,pages_read_engagement',
      response_type: 'code',
    });
    return `https://www.facebook.com/${API_VERSION}/dialog/oauth?${params}`;
  }

  async exchangeCode(code: string, redirectUri: string): Promise<OAuthTokens> {
    const params = new URLSearchParams({
      client_id: process.env.FACEBOOK_CLIENT_ID || '',
      client_secret: process.env.FACEBOOK_CLIENT_SECRET || '',
      redirect_uri: redirectUri,
      code,
    });
    const res = await fetch(`${BASE_URL}/oauth/access_token?${params}`);
    if (!res.ok) throw new Error('Instagram token exchange failed');
    const data = await res.json();

    // Get Instagram Business Account ID via connected Facebook Pages
    const pagesRes = await fetch(`${BASE_URL}/me/accounts?fields=instagram_business_account,name&access_token=${data.access_token}`);
    const pagesData = pagesRes.ok ? await pagesRes.json() : { data: [] };
    const igAccount = pagesData.data?.find((p: any) => p.instagram_business_account)?.instagram_business_account;

    return {
      accessToken: data.access_token,
      expiresIn: data.expires_in || 5184000,
      extra: {
        instagramAccountId: igAccount?.id,
        pages: pagesData.data || [],
      },
    };
  }

  async refreshToken(refreshToken: string): Promise<OAuthTokens> {
    const params = new URLSearchParams({
      grant_type: 'fb_exchange_token',
      client_id: process.env.FACEBOOK_CLIENT_ID || '',
      client_secret: process.env.FACEBOOK_CLIENT_SECRET || '',
      fb_exchange_token: refreshToken,
    });
    const res = await fetch(`${BASE_URL}/oauth/access_token?${params}`);
    if (!res.ok) throw new Error('Instagram token refresh failed');
    const data = await res.json();
    return { accessToken: data.access_token, expiresIn: data.expires_in };
  }
}

export const instagramConfig: PlatformConfig = {
  platformId: 'instagram',
  displayName: 'Instagram',
  description: 'Share photos, reels, and stories. Run ads via Meta Ads Manager.',
  category: 'both',
  apiBaseUrl: BASE_URL,
  apiVersion: API_VERSION,
  oauthConfig: {
    authorizationUrl: `https://www.facebook.com/${API_VERSION}/dialog/oauth`,
    tokenUrl: `${BASE_URL}/oauth/access_token`,
    scopes: ['instagram_basic', 'instagram_content_publish', 'instagram_manage_insights'],
    clientIdEnvVar: 'FACEBOOK_CLIENT_ID',
    clientSecretEnvVar: 'FACEBOOK_CLIENT_SECRET',
    supportsRefresh: true,
    defaultExpiresInSeconds: 5184000,
  },
  supportedFeatures: ['organic_post', 'paid_ads', 'reels', 'carousel', 'stories', 'engagement_tracking'],
  limits: { postTextMax: 2200, hashtagMax: 30, mediaMax: 10 },
};
