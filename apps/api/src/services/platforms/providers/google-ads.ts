/**
 * Google Ads Platform Provider
 *
 * Ads only — no social posting. Uses Google Ads API.
 *
 * API: https://googleads.googleapis.com/v15/
 * OAuth: Google OAuth 2.0
 * Requires: Developer token + Customer ID
 */

import type {
  PlatformConfig,
  PlatformConnection,
  IAdPlatformProvider,
  IOAuthProvider,
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

const API_BASE = 'https://googleads.googleapis.com/v15';

async function gadsRequest<T>(endpoint: string, connection: PlatformConnection, method = 'GET', body?: unknown): Promise<T> {
  const devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN || '';
  const customerId = connection.platformAccountId?.replace(/-/g, '') || '';

  const res = await fetch(`${API_BASE}/customers/${customerId}/${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${connection.accessToken}`,
      'developer-token': devToken,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Google Ads API error: ${JSON.stringify(err)}`);
  }
  return res.json();
}

const GADS_OBJECTIVE_MAP: Record<string, string> = {
  awareness: 'BRAND_AWARENESS',
  traffic: 'WEBSITE_TRAFFIC',
  engagement: 'PRODUCT_AND_BRAND_CONSIDERATION',
  leads: 'LEAD_GENERATION',
  sales: 'SALES',
  conversions: 'SALES',
};

export class GoogleAdProvider implements IAdPlatformProvider {
  readonly platformId = 'google';

  mapObjective(objective: string): string {
    return GADS_OBJECTIVE_MAP[objective.toLowerCase()] || 'WEBSITE_TRAFFIC';
  }

  buildTargeting(audience: TargetAudience): Record<string, unknown> {
    const targeting: Record<string, unknown> = {};
    if (audience.locations?.length) {
      targeting.geoTargeting = { locations: audience.locations.map((l) => ({ geoTargetConstant: l })) };
    }
    if (audience.ageMin || audience.ageMax) {
      targeting.ageRange = { minAge: audience.ageMin || 18, maxAge: audience.ageMax || 65 };
    }
    if (audience.languages?.length) {
      targeting.languages = audience.languages;
    }
    return targeting;
  }

  async createCampaign(connection: PlatformConnection, data: CreateCampaignInput): Promise<PlatformCampaignResult> {
    const customerId = connection.platformAccountId?.replace(/-/g, '') || '';
    const result = await gadsRequest<any>('campaigns:mutate', connection, 'POST', {
      operations: [{
        create: {
          name: data.name,
          advertisingChannelType: 'SEARCH',
          status: 'PAUSED',
          campaignBudget: `customers/${customerId}/campaignBudgets/-1`,
          startDate: data.startDate ? data.startDate.toISOString().split('T')[0].replace(/-/g, '') : undefined,
        },
      }],
    });
    const resourceName = result.results?.[0]?.resourceName || '';
    const campaignId = resourceName.split('/').pop() || '';
    return { id: campaignId, platformCampaignId: campaignId, status: 'PAUSED' };
  }

  async updateCampaignStatus(connection: PlatformConnection, platformCampaignId: string, status: 'ACTIVE' | 'PAUSED') {
    const customerId = connection.platformAccountId?.replace(/-/g, '') || '';
    await gadsRequest('campaigns:mutate', connection, 'POST', {
      operations: [{
        update: {
          resourceName: `customers/${customerId}/campaigns/${platformCampaignId}`,
          status: status === 'ACTIVE' ? 'ENABLED' : 'PAUSED',
        },
        updateMask: 'status',
      }],
    });
  }

  async createAdSet(connection: PlatformConnection, data: CreateAdSetInput): Promise<PlatformAdSetResult> {
    const customerId = connection.platformAccountId?.replace(/-/g, '') || '';
    const result = await gadsRequest<any>('adGroups:mutate', connection, 'POST', {
      operations: [{
        create: {
          name: data.name,
          campaign: `customers/${customerId}/campaigns/${data.platformCampaignId}`,
          status: 'PAUSED',
          type: 'SEARCH_STANDARD',
          cpcBidMicros: data.bidAmount ? String(Math.round(data.bidAmount * 1000000)) : '1000000',
        },
      }],
    });
    const resourceName = result.results?.[0]?.resourceName || '';
    const adGroupId = resourceName.split('/').pop() || '';
    return { id: adGroupId, platformAdSetId: adGroupId };
  }

  async createAd(connection: PlatformConnection, data: CreateAdInput): Promise<PlatformAdResult> {
    const customerId = connection.platformAccountId?.replace(/-/g, '') || '';
    const result = await gadsRequest<any>('adGroupAds:mutate', connection, 'POST', {
      operations: [{
        create: {
          adGroup: `customers/${customerId}/adGroups/${data.platformAdSetId}`,
          status: 'PAUSED',
          ad: {
            responsiveSearchAd: {
              headlines: [
                { text: data.headline },
                { text: data.description || data.headline },
                { text: data.callToAction },
              ],
              descriptions: [
                { text: data.primaryText.substring(0, 90) },
                { text: data.description?.substring(0, 90) || data.primaryText.substring(0, 90) },
              ],
            },
            finalUrls: [data.destinationUrl],
          },
        },
      }],
    });
    const resourceName = result.results?.[0]?.resourceName || '';
    const adId = resourceName.split('/').pop() || '';
    return { id: adId, platformAdId: adId };
  }

  async getCampaignInsights(connection: PlatformConnection, platformCampaignId: string): Promise<CampaignInsights> {
    try {
      const result = await gadsRequest<any>('googleAds:searchStream', connection, 'POST', {
        query: `SELECT metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.ctr, metrics.average_cpc FROM campaign WHERE campaign.id = ${platformCampaignId} AND segments.date DURING LAST_7_DAYS`,
      });

      const row = result[0]?.results?.[0]?.metrics || {};
      const impressions = parseInt(row.impressions || '0');
      const clicks = parseInt(row.clicks || '0');
      const spend = parseInt(row.costMicros || '0') / 1000000;
      return {
        impressions, reach: impressions, clicks,
        conversions: parseFloat(row.conversions || '0'),
        spend, ctr: parseFloat(row.ctr || '0') * 100,
        cpc: parseInt(row.averageCpc || '0') / 1000000,
        cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
        raw: row,
      };
    } catch {
      return { impressions: 0, reach: 0, clicks: 0, conversions: 0, spend: 0, ctr: 0, cpc: 0, cpm: 0 };
    }
  }
}

export class GoogleAdsOAuthProvider implements IOAuthProvider {
  readonly platformId = 'google';

  isConfigured(): boolean {
    return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_ADS_DEVELOPER_TOKEN);
  }

  getAuthorizationUrl(state: string, redirectUri: string): string {
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID || '',
      redirect_uri: redirectUri,
      state,
      scope: 'https://www.googleapis.com/auth/adwords',
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
    if (!res.ok) throw new Error('Google Ads token exchange failed');
    const data = await res.json();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in || 3600,
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
    if (!res.ok) throw new Error('Google Ads token refresh failed');
    const data = await res.json();
    return { accessToken: data.access_token, expiresIn: data.expires_in };
  }
}

export const googleAdsConfig: PlatformConfig = {
  platformId: 'google',
  displayName: 'Google Ads',
  description: 'Run search, display, and video ad campaigns on Google',
  category: 'ads',
  apiBaseUrl: API_BASE,
  apiVersion: 'v15',
  oauthConfig: {
    authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: ['https://www.googleapis.com/auth/adwords'],
    clientIdEnvVar: 'GOOGLE_CLIENT_ID',
    clientSecretEnvVar: 'GOOGLE_CLIENT_SECRET',
    supportsRefresh: true,
    defaultExpiresInSeconds: 3600,
  },
  supportedFeatures: ['paid_ads', 'analytics'],
};
