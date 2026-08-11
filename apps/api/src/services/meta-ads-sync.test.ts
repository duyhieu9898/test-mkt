import { afterEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => {
  const campaigns: Array<Record<string, unknown>> = [];
  const adSets: Array<Record<string, unknown>> = [];
  const ads: Array<Record<string, unknown>> = [];
  const connection = {
    id: 'connection-1', companyId: 'company-1', platform: 'facebook', status: 'connected',
    accessToken: 'token', platformAccountId: '123',
  };
  const tables = {
    adConnections: { id: 'connection.id', companyId: 'connection.companyId', platform: 'connection.platform', status: 'connection.status' },
    adCampaigns: { id: 'campaign.id', companyId: 'campaign.companyId', connectionId: 'campaign.connectionId', updatedAt: 'campaign.updatedAt' },
    adSets: { id: 'adset.id', companyId: 'adset.companyId', campaignId: 'adset.campaignId', updatedAt: 'adset.updatedAt' },
    ads: { id: 'ad.id', companyId: 'ad.companyId', campaignId: 'ad.campaignId', updatedAt: 'ad.updatedAt' },
  };
  let nextId = 1;
  const storeFor = (table: unknown) => table === tables.adCampaigns ? campaigns : table === tables.adSets ? adSets : ads;
  const db = {
    query: {
      adConnections: { findFirst: vi.fn(async () => connection) },
      adCampaigns: { findMany: vi.fn(async () => campaigns) },
      adSets: { findMany: vi.fn(async () => adSets) },
      ads: { findMany: vi.fn(async () => ads) },
    },
    insert: vi.fn((table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        // Drizzle executes the insert at `.values()` even when the caller does
        // not request `returning()` (the Ads branch has that exact shape).
        const row = { ...values, id: `local-${nextId++}` };
        storeFor(table).push(row);
        return { returning: async () => [{ id: row.id }] };
      },
    })),
    update: vi.fn(() => ({ set: () => ({ where: async () => undefined }) })),
  };
  return { campaigns, adSets, ads, db, tables, reset: () => { campaigns.length = 0; adSets.length = 0; ads.length = 0; nextId = 1; } };
});

vi.mock('../lib/db', () => ({ db: fixtures.db }));
vi.mock('../lib/crypto', () => ({ decryptMaybe: (value: string) => value }));
vi.mock('@1person/core/db', () => fixtures.tables);
vi.mock('drizzle-orm', () => ({ and: () => undefined, eq: () => undefined }));

import { mapMetaAdsStatus, syncMetaAds } from './meta-ads-sync';

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
}

describe('syncMetaAds', () => {
  afterEach(() => {
    fixtures.reset();
    vi.unstubAllGlobals();
  });

  it('imports a hierarchy fixture once and updates it on the second sync', async () => {
    vi.stubGlobal('fetch', vi.fn((input: string) => {
      if (input.includes('/campaigns?')) return jsonResponse({ data: [{ id: 'meta-campaign-1', name: 'Fixture campaign', status: 'ACTIVE', objective: 'OUTCOME_LEADS' }] });
      if (input.includes('/adsets?')) return jsonResponse({ data: [{ id: 'meta-adset-1', campaign_id: 'meta-campaign-1', name: 'Fixture ad set', status: 'ACTIVE' }] });
      if (input.includes('/ads?')) return jsonResponse({ data: [{ id: 'meta-ad-1', campaign_id: 'meta-campaign-1', adset_id: 'meta-adset-1', name: 'Fixture ad', status: 'ACTIVE', creative: { id: 'creative-1' } }] });
      if (input.includes('level=campaign')) return jsonResponse({ data: [{ campaign_id: 'meta-campaign-1', impressions: '100', clicks: '10', reach: '80', spend: '25.50', actions: [] }] });
      if (input.includes('level=adset')) return jsonResponse({ data: [{ adset_id: 'meta-adset-1', impressions: '100', clicks: '10', reach: '80', frequency: '1.25', spend: '25.50', actions: [] }] });
      if (input.includes('level=ad')) return jsonResponse({ data: [{ ad_id: 'meta-ad-1', impressions: '100', clicks: '10', reach: '80', spend: '25.50', actions: [] }] });
      throw new Error(`Unexpected Meta request: ${input}`);
    }));

    await syncMetaAds('company-1');
    await syncMetaAds('company-1');

    expect(fixtures.campaigns).toHaveLength(1);
    expect(fixtures.adSets).toHaveLength(1);
    expect(fixtures.ads).toHaveLength(1);
    expect(fixtures.campaigns[0]).toMatchObject({ platformCampaignId: 'meta-campaign-1', impressions: 100, clicks: 10 });
    expect(fixtures.adSets[0]).toMatchObject({ impressions: 100, reach: 80, frequency: '1.25' });
    expect(fixtures.ads[0]).toMatchObject({ platformAdId: 'meta-ad-1', platformCreativeId: 'creative-1' });
  });

  it('preserves review, rejected, and completed Meta statuses for the UI', () => {
    expect(mapMetaAdsStatus('PENDING_REVIEW')).toBe('pending_review');
    expect(mapMetaAdsStatus('REJECTED')).toBe('rejected');
    expect(mapMetaAdsStatus('COMPLETED')).toBe('completed');
  });
});
