/**
 * Google Search Console Client
 *
 * Fetches REAL performance data: impressions, clicks, CTR, position.
 * Requires: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN
 *
 * When credentials not configured, returns null (caller uses fallback).
 */

export interface GSCPageData {
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface GSCQueryData {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export class GSCClient {
  private clientId: string | undefined;
  private clientSecret: string | undefined;
  private refreshToken: string | undefined;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor() {
    this.clientId = process.env.GOOGLE_CLIENT_ID;
    this.clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    this.refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  }

  isConfigured(): boolean {
    return !!(this.clientId && this.clientSecret && this.refreshToken);
  }

  /**
   * Fetch page-level performance data for a site
   */
  async fetchPagePerformance(siteUrl: string, days = 28): Promise<GSCPageData[] | null> {
    if (!this.isConfigured()) return null;

    const token = await this.getAccessToken();
    if (!token) return null;

    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

    try {
      const response = await fetch(
        `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            startDate: startDate.toISOString().split('T')[0],
            endDate: endDate.toISOString().split('T')[0],
            dimensions: ['page'],
            rowLimit: 100,
          }),
        }
      );

      if (!response.ok) {
        console.warn(`[GSC] API error: ${response.status} ${response.statusText}`);
        return null;
      }

      const data = await response.json();
      return (data.rows || []).map((row: any) => ({
        page: row.keys[0],
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: Math.round(row.ctr * 10000) / 100, // Convert to percentage
        position: Math.round(row.position * 10) / 10,
      }));
    } catch (err) {
      console.warn('[GSC] Fetch failed:', err);
      return null;
    }
  }

  /**
   * Fetch query-level performance data
   */
  async fetchQueryPerformance(siteUrl: string, days = 28): Promise<GSCQueryData[] | null> {
    if (!this.isConfigured()) return null;

    const token = await this.getAccessToken();
    if (!token) return null;

    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

    try {
      const response = await fetch(
        `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            startDate: startDate.toISOString().split('T')[0],
            endDate: endDate.toISOString().split('T')[0],
            dimensions: ['query'],
            rowLimit: 200,
          }),
        }
      );

      if (!response.ok) return null;

      const data = await response.json();
      return (data.rows || []).map((row: any) => ({
        query: row.keys[0],
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: Math.round(row.ctr * 10000) / 100,
        position: Math.round(row.position * 10) / 10,
      }));
    } catch {
      return null;
    }
  }

  /**
   * Fetch performance for a specific page URL
   */
  async fetchPageData(siteUrl: string, pageUrl: string, days = 28): Promise<GSCPageData | null> {
    if (!this.isConfigured()) return null;

    const token = await this.getAccessToken();
    if (!token) return null;

    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

    try {
      const response = await fetch(
        `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            startDate: startDate.toISOString().split('T')[0],
            endDate: endDate.toISOString().split('T')[0],
            dimensions: ['page'],
            dimensionFilterGroups: [{
              filters: [{ dimension: 'page', expression: pageUrl }],
            }],
          }),
        }
      );

      if (!response.ok) return null;

      const data = await response.json();
      const row = data.rows?.[0];
      if (!row) return null;

      return {
        page: row.keys[0],
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: Math.round(row.ctr * 10000) / 100,
        position: Math.round(row.position * 10) / 10,
      };
    } catch {
      return null;
    }
  }

  private async getAccessToken(): Promise<string | null> {
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    try {
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: this.clientId!,
          client_secret: this.clientSecret!,
          refresh_token: this.refreshToken!,
          grant_type: 'refresh_token',
        }),
      });

      if (!response.ok) {
        console.warn('[GSC] Token refresh failed:', response.status);
        return null;
      }

      const data = await response.json();
      this.accessToken = data.access_token;
      this.tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
      return this.accessToken;
    } catch (err) {
      console.warn('[GSC] Token refresh error:', err);
      return null;
    }
  }
}

export const gscClient = new GSCClient();
