/**
 * GA4 client — real Google Analytics 4 Data API reads.
 *
 * Reuses the SAME Google OAuth refresh token the founder already granted for
 * Search Console (stored in knowledge_base, category `integration_google`).
 * The only extra input is the GA4 **property ID** (numeric), stored per-company
 * in knowledge_base category `integration_ga4`.
 *
 * Logic adapted from coreyhaines31/marketingskills `tools/clis/ga4.js` (MIT):
 * https://analyticsdata.googleapis.com/v1beta runReport. Env-var auth in the
 * original is replaced by our per-company OAuth token (admin-config principle).
 */

const DATA_API = 'https://analyticsdata.googleapis.com/v1beta';

export interface Ga4Summary {
  sessions: number;
  totalUsers: number;
  newUsers: number;
  screenPageViews: number;
  conversions: number;
  topPages: { path: string; views: number }[];
  topSources: { source: string; sessions: number }[];
  rangeDays: number;
}

export class Ga4Client {
  private clientId = process.env.GOOGLE_CLIENT_ID;
  private clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  private refreshToken: string | undefined;
  private accessToken: string | null = null;
  private tokenExpiry = 0;

  constructor(refreshToken?: string) {
    this.refreshToken = refreshToken || process.env.GOOGLE_REFRESH_TOKEN;
  }

  isConfigured(): boolean {
    return !!(this.clientId && this.clientSecret && this.refreshToken);
  }

  /** Pull a compact analytics summary for the last `days` days. */
  async fetchSummary(propertyId: string, days = 28): Promise<Ga4Summary | null> {
    if (!this.isConfigured() || !propertyId) return null;
    const token = await this.getAccessToken();
    if (!token) return null;

    const property = propertyId.startsWith('properties/') ? propertyId : `properties/${propertyId}`;
    const dateRanges = [{ startDate: `${days}daysAgo`, endDate: 'today' }];

    try {
      // 1. Headline totals
      const totalsResp = await this.runReport(token, property, {
        dateRanges,
        metrics: [
          { name: 'sessions' },
          { name: 'totalUsers' },
          { name: 'newUsers' },
          { name: 'screenPageViews' },
          { name: 'conversions' },
        ],
      });
      const row = totalsResp?.rows?.[0]?.metricValues ?? [];
      const num = (i: number) => Math.round(Number(row[i]?.value ?? 0));

      // 2. Top pages
      const pagesResp = await this.runReport(token, property, {
        dateRanges,
        dimensions: [{ name: 'pagePath' }],
        metrics: [{ name: 'screenPageViews' }],
        orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
        limit: 10,
      });
      const topPages = (pagesResp?.rows ?? []).map((r: any) => ({
        path: r.dimensionValues?.[0]?.value ?? '(unknown)',
        views: Math.round(Number(r.metricValues?.[0]?.value ?? 0)),
      }));

      // 3. Top sources
      const sourcesResp = await this.runReport(token, property, {
        dateRanges,
        dimensions: [{ name: 'sessionDefaultChannelGroup' }],
        metrics: [{ name: 'sessions' }],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        limit: 8,
      });
      const topSources = (sourcesResp?.rows ?? []).map((r: any) => ({
        source: r.dimensionValues?.[0]?.value ?? '(unknown)',
        sessions: Math.round(Number(r.metricValues?.[0]?.value ?? 0)),
      }));

      return {
        sessions: num(0),
        totalUsers: num(1),
        newUsers: num(2),
        screenPageViews: num(3),
        conversions: num(4),
        topPages,
        topSources,
        rangeDays: days,
      };
    } catch (err) {
      console.warn('[GA4] fetchSummary failed:', (err as Error).message);
      return null;
    }
  }

  private async runReport(token: string, property: string, body: Record<string, unknown>): Promise<any> {
    const res = await fetch(`${DATA_API}/${property}:runReport`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`GA4 ${res.status}: ${text.slice(0, 200)}`);
    }
    return res.json();
  }

  private async getAccessToken(): Promise<string | null> {
    if (this.accessToken && Date.now() < this.tokenExpiry) return this.accessToken;
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
        console.warn('[GA4] Token refresh failed:', response.status);
        return null;
      }
      const data = await response.json();
      this.accessToken = data.access_token;
      this.tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
      return this.accessToken;
    } catch (err) {
      console.warn('[GA4] Token refresh error:', err);
      return null;
    }
  }
}
