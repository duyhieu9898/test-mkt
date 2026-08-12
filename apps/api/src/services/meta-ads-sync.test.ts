import { afterEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => {
  const campaigns: Array<Record<string, unknown>> = [];
  const adSets: Array<Record<string, unknown>> = [];
  const ads: Array<Record<string, unknown>> = [];
  const connection = {
    id: 'connection-1', companyId: 'company-1', platform: 'facebook', status: 'connected',
    accessToken: 'token', platformAccountId: 'act_123',
  };
  const tables = {
    adConnections: { id: 'connection.id', companyId: 'connection.companyId', platform: 'connection.platform', status: 'connection.status' },
    adCampaigns: { id: 'campaign.id', companyId: 'campaign.companyId', connectionId: 'campaign.connectionId', updatedAt: 'campaign.updatedAt' },
    adSets: { id: 'adset.id', companyId: 'adset.companyId', campaignId: 'adset.campaignId', updatedAt: 'adset.updatedAt' },
    ads: { id: 'ad.id', companyId: 'ad.companyId', campaignId: 'ad.campaignId', updatedAt: 'ad.updatedAt' },
  };
  let nextId = 1;
  const storeFor = (table: unknown) => table === tables.adCampaigns ? campaigns : table === tables.adSets ? adSets : ads;

  const updates: Array<{ table: unknown; values: Record<string, unknown>; where: unknown }> = [];

  const db = {
    query: {
      adConnections: { findFirst: vi.fn(async () => connection) },
      adCampaigns: { findMany: vi.fn(async () => campaigns) },
      adSets: { findMany: vi.fn(async () => adSets) },
      ads: { findMany: vi.fn(async () => ads) },
    },
    insert: vi.fn((table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        const row = { ...values, id: `local-${nextId++}` };
        storeFor(table).push(row);
        return { returning: async () => [{ id: row.id }] };
      },
    })),
    update: vi.fn((table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: async (where: unknown) => {
          updates.push({ table, values, where });
          // If updating a row in store by id, apply updates
          return undefined;
        },
      }),
    })),
    transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(db)),
  };
  return {
    campaigns, adSets, ads, updates, db, tables, connection,
    reset: () => {
      campaigns.length = 0; adSets.length = 0; ads.length = 0; updates.length = 0; nextId = 1;
      connection.platformAccountId = 'act_123';
      vi.clearAllMocks();
    },
  };
});

vi.mock('../lib/db', () => ({ db: fixtures.db }));
vi.mock('../lib/crypto', () => ({ decryptMaybe: (value: string) => value }));
vi.mock('@1person/core/db', () => fixtures.tables);
vi.mock('drizzle-orm', () => ({
  and: () => undefined, eq: () => undefined, or: () => undefined, isNull: () => undefined, inArray: () => undefined,
}));

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
    expect(fixtures.campaigns[0]).toMatchObject({ platformCampaignId: 'meta-campaign-1', impressions: 100, clicks: 10, sourceAccountId: '123' });
    expect(fixtures.adSets[0]).toMatchObject({ impressions: 100, reach: 80, frequency: '1.25', sourceAccountId: '123' });
    expect(fixtures.ads[0]).toMatchObject({ platformAdId: 'meta-ad-1', platformCreativeId: 'creative-1', sourceAccountId: '123' });
  });

  it('reconciles legacy NULL-provenance campaign when Graph API returns matching ID', async () => {
    // Pre-populate DB with legacy row having sourceAccountId: null
    fixtures.campaigns.push({
      id: 'legacy-campaign-1',
      companyId: 'company-1',
      connectionId: 'connection-1',
      platformCampaignId: 'meta-legacy-100',
      sourceAccountId: null,
      status: 'active',
    });

    vi.stubGlobal('fetch', vi.fn((input: string) => {
      if (input.includes('/campaigns?')) return jsonResponse({ data: [{ id: 'meta-legacy-100', name: 'Reconciled campaign', status: 'ACTIVE', objective: 'OUTCOME_LEADS' }] });
      if (input.includes('/adsets?')) return jsonResponse({ data: [] });
      if (input.includes('/ads?')) return jsonResponse({ data: [] });
      if (input.includes('level=campaign')) return jsonResponse({ data: [{ campaign_id: 'meta-legacy-100', impressions: '500', clicks: '20', spend: '50.00', actions: [] }] });
      if (input.includes('level=adset')) return jsonResponse({ data: [] });
      if (input.includes('level=ad')) return jsonResponse({ data: [] });
      throw new Error(`Unexpected Meta request: ${input}`);
    }));

    await syncMetaAds('company-1');

    // No new campaign inserted, existing legacy campaign updated with sourceAccountId = '123'
    expect(fixtures.campaigns).toHaveLength(1);
    expect(fixtures.campaigns[0].id).toBe('legacy-campaign-1');
    const updateCall = fixtures.updates.find((u) => u.table === fixtures.tables.adCampaigns);
    expect(updateCall?.values).toMatchObject({
      sourceAccountId: '123',
      name: 'Reconciled campaign',
      impressions: 500,
    });
  });

  it('does NOT fetch or archive non-Meta/non-candidate AdSets or Ads (P0.2 protection)', async () => {
    // If no candidate Meta campaigns exist, db.query.adSets.findMany and ads.findMany are NOT queried with empty inArray
    vi.stubGlobal('fetch', vi.fn((input: string) => {
      if (input.includes('/campaigns?')) return jsonResponse({ data: [] });
      if (input.includes('/adsets?')) return jsonResponse({ data: [] });
      if (input.includes('/ads?')) return jsonResponse({ data: [] });
      if (input.includes('level=campaign')) return jsonResponse({ data: [] });
      if (input.includes('level=adset')) return jsonResponse({ data: [] });
      if (input.includes('level=ad')) return jsonResponse({ data: [] });
      throw new Error(`Unexpected Meta request: ${input}`);
    }));

    await syncMetaAds('company-1');

    // adSets and ads findMany mock should not be called for adSets or ads since candidateCampaignIds is empty
    expect(fixtures.db.query.adSets.findMany).not.toHaveBeenCalled();
    expect(fixtures.db.query.ads.findMany).not.toHaveBeenCalled();
    const hierarchyUpdates = fixtures.updates.filter((u) => u.table !== fixtures.tables.adConnections);
    expect(hierarchyUpdates).toHaveLength(0);
  });

  it('preserves review, rejected, and completed Meta statuses for the UI', () => {
    expect(mapMetaAdsStatus('PENDING_REVIEW')).toBe('pending_review');
    expect(mapMetaAdsStatus('REJECTED')).toBe('rejected');
    expect(mapMetaAdsStatus('COMPLETED')).toBe('completed');
  });
});
