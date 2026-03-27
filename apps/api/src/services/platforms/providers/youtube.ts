/**
 * YouTube Platform Provider
 *
 * Social: YouTube Data API v3 (video upload, community posts)
 * No ads provider — YouTube ads are managed via Google Ads.
 *
 * API: https://www.googleapis.com/youtube/v3/
 * OAuth: Google OAuth 2.0 with YouTube scopes
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

const API_BASE = 'https://www.googleapis.com/youtube/v3';

async function ytRequest<T>(endpoint: string, accessToken: string, method = 'GET', body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}/${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`YouTube API error: ${(err as any).error?.message || res.statusText}`);
  }
  return res.json();
}

export class YouTubeSocialProvider implements ISocialPlatformProvider {
  readonly platformId = 'youtube';

  async publishPost(connection: PlatformConnection, content: PostContent): Promise<PostResult> {
    if (!content.mediaUrls?.length || content.mediaType !== 'video') {
      return { success: false, error: 'YouTube requires a video URL for uploads' };
    }

    try {
      // YouTube requires resumable upload — for URL-based videos we use the insert endpoint
      const result = await ytRequest<any>('videos?part=snippet,status', connection.accessToken, 'POST', {
        snippet: {
          title: content.text.substring(0, 100),
          description: content.text,
          tags: content.hashtags || [],
          categoryId: '22', // People & Blogs
        },
        status: {
          privacyStatus: 'public',
          selfDeclaredMadeForKids: false,
        },
      });

      return {
        success: true,
        platformPostId: result.id,
        platformPostUrl: `https://www.youtube.com/watch?v=${result.id}`,
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'YouTube upload failed' };
    }
  }

  async schedulePost(connection: PlatformConnection, content: PostContent, scheduledTime: Date): Promise<PostResult> {
    if (!content.mediaUrls?.length) {
      return { success: false, error: 'YouTube requires video content' };
    }

    try {
      const result = await ytRequest<any>('videos?part=snippet,status', connection.accessToken, 'POST', {
        snippet: {
          title: content.text.substring(0, 100),
          description: content.text,
          tags: content.hashtags || [],
        },
        status: {
          privacyStatus: 'private',
          publishAt: scheduledTime.toISOString(),
        },
      });

      return { success: true, platformPostId: result.id };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'YouTube schedule failed' };
    }
  }

  async getPostEngagement(connection: PlatformConnection, platformPostId: string): Promise<EngagementResult> {
    try {
      const data = await ytRequest<any>(
        `videos?part=statistics&id=${platformPostId}`,
        connection.accessToken
      );
      const stats = data.items?.[0]?.statistics || {};
      return {
        likes: parseInt(stats.likeCount || '0'),
        comments: parseInt(stats.commentCount || '0'),
        shares: 0,
        saves: parseInt(stats.favoriteCount || '0'),
        clicks: 0,
        impressions: parseInt(stats.viewCount || '0'),
        reach: parseInt(stats.viewCount || '0'),
        videoViews: parseInt(stats.viewCount || '0'),
        raw: stats,
      };
    } catch {
      return { likes: 0, comments: 0, shares: 0, saves: 0, clicks: 0, impressions: 0, reach: 0 };
    }
  }

  async deletePost(connection: PlatformConnection, platformPostId: string) {
    try {
      await ytRequest(`videos?id=${platformPostId}`, connection.accessToken, 'DELETE');
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Delete failed' };
    }
  }

  async validateConnection(connection: PlatformConnection) {
    try {
      await ytRequest<any>('channels?part=id&mine=true', connection.accessToken);
      return { valid: true };
    } catch (err) {
      return { valid: false, error: err instanceof Error ? err.message : 'Invalid token' };
    }
  }
}

export class YouTubeOAuthProvider implements IOAuthProvider {
  readonly platformId = 'youtube';

  isConfigured(): boolean {
    return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  }

  getAuthorizationUrl(state: string, redirectUri: string): string {
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID || '',
      redirect_uri: redirectUri,
      state,
      scope: 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/youtube',
      response_type: 'code',
      access_type: 'offline',
      prompt: 'consent',
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }

  async exchangeCode(code: string, redirectUri: string): Promise<OAuthTokens> {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID || '',
        client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    if (!res.ok) throw new Error('YouTube token exchange failed');
    const data = await res.json();

    // Get channel info
    const channelRes = await fetch(`${API_BASE}/channels?part=snippet&mine=true`, {
      headers: { Authorization: `Bearer ${data.access_token}` },
    });
    const channelData = channelRes.ok ? await channelRes.json() : { items: [] };
    const channel = channelData.items?.[0];

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in || 3600,
      extra: {
        channelId: channel?.id,
        channelTitle: channel?.snippet?.title,
      },
    };
  }

  async refreshToken(refreshToken: string): Promise<OAuthTokens> {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID || '',
        client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    if (!res.ok) throw new Error('YouTube token refresh failed');
    const data = await res.json();
    return { accessToken: data.access_token, expiresIn: data.expires_in };
  }
}

export const youtubeConfig: PlatformConfig = {
  platformId: 'youtube',
  displayName: 'YouTube',
  description: 'Upload videos and manage your YouTube channel',
  category: 'social',
  apiBaseUrl: API_BASE,
  apiVersion: 'v3',
  oauthConfig: {
    authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.readonly'],
    clientIdEnvVar: 'GOOGLE_CLIENT_ID',
    clientSecretEnvVar: 'GOOGLE_CLIENT_SECRET',
    supportsRefresh: true,
    defaultExpiresInSeconds: 3600,
  },
  supportedFeatures: ['organic_post', 'video_upload', 'scheduling', 'engagement_tracking', 'analytics'],
  limits: { postTextMax: 5000, hashtagMax: 500 },
};
