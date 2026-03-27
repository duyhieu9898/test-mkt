/**
 * Twitter/X Platform Provider
 *
 * Social: Twitter API v2
 * No ad provider (Twitter Ads API requires enterprise access)
 *
 * API: https://api.twitter.com/2/
 * OAuth 2.0 with PKCE
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

const API_BASE = 'https://api.twitter.com/2';

async function twRequest<T>(endpoint: string, accessToken: string, method = 'GET', body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}/${endpoint}`, {
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
    throw new Error(`Twitter API error: ${JSON.stringify(err)}`);
  }
  return method === 'DELETE' ? ({ data: { deleted: true } } as T) : res.json();
}

export class TwitterSocialProvider implements ISocialPlatformProvider {
  readonly platformId = 'twitter';

  async publishPost(connection: PlatformConnection, content: PostContent): Promise<PostResult> {
    try {
      let text = content.text;
      if (content.hashtags?.length) {
        const hashtagStr = content.hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ');
        // Respect 280 char limit
        if (text.length + hashtagStr.length + 2 <= 280) {
          text = `${text}\n\n${hashtagStr}`;
        }
      }

      const tweetBody: Record<string, unknown> = { text: text.substring(0, 280) };

      // Add link as quote if provided
      if (content.linkUrl && !text.includes(content.linkUrl)) {
        tweetBody.text = `${(tweetBody.text as string).substring(0, 250)} ${content.linkUrl}`;
      }

      const result = await twRequest<{ data: { id: string } }>('tweets', connection.accessToken, 'POST', tweetBody);
      const tweetId = result.data.id;

      return {
        success: true,
        platformPostId: tweetId,
        platformPostUrl: `https://twitter.com/i/status/${tweetId}`,
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Twitter post failed' };
    }
  }

  async schedulePost(_connection: PlatformConnection, _content: PostContent, _scheduledTime: Date): Promise<PostResult> {
    // Twitter API v2 doesn't support native scheduling — handled by distribution scheduler
    return { success: true, platformPostId: `scheduled_${Date.now()}` };
  }

  async getPostEngagement(connection: PlatformConnection, platformPostId: string): Promise<EngagementResult> {
    try {
      const data = await twRequest<any>(
        `tweets/${platformPostId}?tweet.fields=public_metrics`,
        connection.accessToken
      );
      const metrics = data.data?.public_metrics || {};
      return {
        likes: metrics.like_count || 0,
        comments: metrics.reply_count || 0,
        shares: metrics.retweet_count || 0,
        saves: metrics.bookmark_count || 0,
        clicks: 0,
        impressions: metrics.impression_count || 0,
        reach: metrics.impression_count || 0,
        raw: metrics,
      };
    } catch {
      return { likes: 0, comments: 0, shares: 0, saves: 0, clicks: 0, impressions: 0, reach: 0 };
    }
  }

  async deletePost(connection: PlatformConnection, platformPostId: string) {
    try {
      await twRequest(`tweets/${platformPostId}`, connection.accessToken, 'DELETE');
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Delete failed' };
    }
  }

  async validateConnection(connection: PlatformConnection) {
    try {
      await twRequest<any>('users/me', connection.accessToken);
      return { valid: true };
    } catch (err) {
      return { valid: false, error: err instanceof Error ? err.message : 'Invalid token' };
    }
  }
}

export class TwitterOAuthProvider implements IOAuthProvider {
  readonly platformId = 'twitter';

  isConfigured(): boolean {
    return !!(process.env.TWITTER_CLIENT_ID && process.env.TWITTER_CLIENT_SECRET);
  }

  getAuthorizationUrl(state: string, redirectUri: string): string {
    // Twitter uses OAuth 2.0 with PKCE
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: process.env.TWITTER_CLIENT_ID || '',
      redirect_uri: redirectUri,
      scope: 'tweet.read tweet.write users.read offline.access',
      state,
      code_challenge: state, // simplified — in production use proper PKCE
      code_challenge_method: 'plain',
    });
    return `https://twitter.com/i/oauth2/authorize?${params}`;
  }

  async exchangeCode(code: string, redirectUri: string): Promise<OAuthTokens> {
    const credentials = Buffer.from(
      `${process.env.TWITTER_CLIENT_ID}:${process.env.TWITTER_CLIENT_SECRET}`
    ).toString('base64');

    const res = await fetch('https://api.twitter.com/2/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${credentials}`,
      },
      body: new URLSearchParams({
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        code_verifier: code, // simplified PKCE
      }),
    });
    if (!res.ok) throw new Error('Twitter token exchange failed');
    const data = await res.json();

    // Get user info
    const userRes = await fetch(`${API_BASE}/users/me`, {
      headers: { Authorization: `Bearer ${data.access_token}` },
    });
    const userData = userRes.ok ? await userRes.json() : { data: {} };

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in || 7200,
      extra: { userId: userData.data?.id, username: userData.data?.username },
    };
  }

  async refreshToken(refreshToken: string): Promise<OAuthTokens> {
    const credentials = Buffer.from(
      `${process.env.TWITTER_CLIENT_ID}:${process.env.TWITTER_CLIENT_SECRET}`
    ).toString('base64');

    const res = await fetch('https://api.twitter.com/2/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${credentials}`,
      },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    if (!res.ok) throw new Error('Twitter token refresh failed');
    const data = await res.json();
    return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresIn: data.expires_in };
  }
}

export const twitterConfig: PlatformConfig = {
  platformId: 'twitter',
  displayName: 'Twitter / X',
  description: 'Post tweets and engage with your audience on X',
  category: 'social',
  apiBaseUrl: API_BASE,
  apiVersion: 'v2',
  oauthConfig: {
    authorizationUrl: 'https://twitter.com/i/oauth2/authorize',
    tokenUrl: 'https://api.twitter.com/2/oauth2/token',
    scopes: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'],
    clientIdEnvVar: 'TWITTER_CLIENT_ID',
    clientSecretEnvVar: 'TWITTER_CLIENT_SECRET',
    supportsRefresh: true,
    defaultExpiresInSeconds: 7200,
    usesPKCE: true,
  },
  supportedFeatures: ['organic_post', 'engagement_tracking'],
  limits: { postTextMax: 280, hashtagMax: 10 },
};
