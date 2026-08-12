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
      adCampaigns: {
        findMany: vi.fn(async () => {
          const currentAccountId = connection.platformAccountId.replace(/^act_/, '');
          return campaigns.filter(
            (c) =>
              c.companyId === connection.companyId &&
              c.connectionId === connection.id &&
              (c.sourceAccountId === currentAccountId || c.sourceAccountId == null)
          );
        }),
      },
      adSets: {
        findMany: vi.fn(async (params?: any) => {
          const currentAccountId = connection.platformAccountId.replace(/^act_/, '');
          const candidateCampaignIds =
            params?.where?.args?.find((a: any) => a?.type === 'inArray')?.list || [];
          return adSets.filter(
            (s) =>
              s.companyId === connection.companyId &&
              candidateCampaignIds.includes(s.campaignId) &&
              (s.sourceAccountId === currentAccountId || s.sourceAccountId == null)
          );
        }),
      },
      ads: {
        findMany: vi.fn(async (params?: any) => {
          const currentAccountId = connection.platformAccountId.replace(/^act_/, '');
          const candidateCampaignIds =
            params?.where?.args?.find((a: any) => a?.type === 'inArray')?.list || [];
          return ads.filter(
            (a) =>
              a.companyId === connection.companyId &&
              candidateCampaignIds.includes(a.campaignId) &&
              (a.sourceAccountId === currentAccountId || a.sourceAccountId == null)
          );
        }),
      },
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
        where: async (whereClause: any) => {
          updates.push({ table, values, where: whereClause });
          const store = storeFor(table);
          const targetId = whereClause?.type === 'eq' ? whereClause.right : undefined;
          if (targetId) {
            const targetRow = store.find((r: any) => r.id === targetId);
            if (targetRow) Object.assign(targetRow, values);
          }
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
  and: (...args: unknown[]) => ({ type: 'and', args }),
  eq: (left: unknown, right: unknown) => ({ type: 'eq', left, right }),
  or: (...args: unknown[]) => ({ type: 'or', args }),
  isNull: (field: unknown) => ({ type: 'isNull', field }),
  inArray: (field: unknown, list: unknown[]) => ({ type: 'inArray', field, list }),
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

  // Task 4.1: Account switch A -> B -> A
  it('isolates account data when switching connections A -> B -> A', async () => {
    vi.stubGlobal('fetch', vi.fn((input: string) => {
      if (input.includes('act_accountA/campaigns?')) {
        return jsonResponse({ data: [{ id: 'meta-campaign-A', name: 'Campaign A', status: 'ACTIVE' }] });
      }
      if (input.includes('act_accountB/campaigns?')) {
        return jsonResponse({ data: [{ id: 'meta-campaign-B', name: 'Campaign B', status: 'ACTIVE' }] });
      }
      if (input.includes('/adsets?') || input.includes('/ads?')) return jsonResponse({ data: [] });
      if (input.includes('level=')) return jsonResponse({ data: [] });
      throw new Error(`Unexpected Meta request: ${input}`);
    }));

    // 1. Sync Account A
    fixtures.connection.platformAccountId = 'act_accountA';
    await syncMetaAds('company-1');

    expect(fixtures.campaigns).toHaveLength(1);
    const campAId = fixtures.campaigns[0].id;
    expect(fixtures.campaigns[0]).toMatchObject({
      platformCampaignId: 'meta-campaign-A',
      sourceAccountId: 'accountA',
    });

    // 2. Switch connection to Account B and Sync
    fixtures.connection.platformAccountId = 'act_accountB';
    await syncMetaAds('company-1');

    // Both A and B campaigns exist in DB, but A campaign was untouched
    expect(fixtures.campaigns).toHaveLength(2);
    const campA = fixtures.campaigns.find((c) => c.platformCampaignId === 'meta-campaign-A');
    const campB = fixtures.campaigns.find((c) => c.platformCampaignId === 'meta-campaign-B');
    expect(campA).toMatchObject({ id: campAId, sourceAccountId: 'accountA' });
    expect(campB).toMatchObject({ sourceAccountId: 'accountB' });

    // 3. Switch back to Account A and Sync again
    fixtures.connection.platformAccountId = 'act_accountA';
    await syncMetaAds('company-1');

    // No duplicate inserted, total remains 2, campA local ID stable
    expect(fixtures.campaigns).toHaveLength(2);
    const campAReused = fixtures.campaigns.find((c) => c.platformCampaignId === 'meta-campaign-A');
    expect(campAReused?.id).toBe(campAId);
    expect(campAReused?.sourceAccountId).toBe('accountA');
  });

  // Task 4.2: Multiple NULL legacy campaigns
  it('reconciles multiple NULL legacy campaigns to their respective accounts correctly', async () => {
    fixtures.campaigns.push(
      {
        id: 'legacy-c-A',
        companyId: 'company-1',
        connectionId: 'connection-1',
        platformCampaignId: 'remote-A',
        sourceAccountId: null,
        status: 'active',
      },
      {
        id: 'legacy-c-B',
        companyId: 'company-1',
        connectionId: 'connection-1',
        platformCampaignId: 'remote-B',
        sourceAccountId: null,
        status: 'active',
      }
    );

    vi.stubGlobal('fetch', vi.fn((input: string) => {
      if (input.includes('act_accountB/campaigns?')) {
        return jsonResponse({ data: [{ id: 'remote-B', name: 'Campaign B', status: 'ACTIVE' }] });
      }
      if (input.includes('act_accountA/campaigns?')) {
        return jsonResponse({ data: [{ id: 'remote-A', name: 'Campaign A', status: 'ACTIVE' }] });
      }
      if (input.includes('/adsets?') || input.includes('/ads?')) return jsonResponse({ data: [] });
      if (input.includes('level=')) return jsonResponse({ data: [] });
      throw new Error(`Unexpected Meta request: ${input}`);
    }));

    // Sync B: Graph returns remote-B
    fixtures.connection.platformAccountId = 'act_accountB';
    await syncMetaAds('company-1');

    const legacyB = fixtures.campaigns.find((c) => c.id === 'legacy-c-B');
    const legacyA = fixtures.campaigns.find((c) => c.id === 'legacy-c-A');

    expect(legacyB?.sourceAccountId).toBe('accountB');
    expect(legacyA?.sourceAccountId).toBeNull();

    // Then Sync A: Graph returns remote-A
    fixtures.connection.platformAccountId = 'act_accountA';
    await syncMetaAds('company-1');

    expect(legacyA?.sourceAccountId).toBe('accountA');
  });

  // Task 4.3: Full hierarchy reconciliation
  it('reconciles full hierarchy (Campaign -> AdSet -> Ad) with NULL sourceAccountId without duplicates', async () => {
    fixtures.campaigns.push({
      id: 'legacy-c1',
      companyId: 'company-1',
      connectionId: 'connection-1',
      platformCampaignId: 'remote-c1',
      sourceAccountId: null,
      status: 'active',
    });
    fixtures.adSets.push({
      id: 'legacy-as1',
      companyId: 'company-1',
      campaignId: 'legacy-c1',
      platformAdSetId: 'remote-as1',
      sourceAccountId: null,
      status: 'active',
    });
    fixtures.ads.push({
      id: 'legacy-ad1',
      companyId: 'company-1',
      campaignId: 'legacy-c1',
      adSetId: 'legacy-as1',
      platformAdId: 'remote-ad1',
      sourceAccountId: null,
      status: 'active',
    });

    vi.stubGlobal('fetch', vi.fn((input: string) => {
      if (input.includes('/campaigns?')) return jsonResponse({ data: [{ id: 'remote-c1', name: 'Meta Campaign', status: 'ACTIVE' }] });
      if (input.includes('/adsets?')) return jsonResponse({ data: [{ id: 'remote-as1', campaign_id: 'remote-c1', name: 'Meta AdSet', status: 'ACTIVE' }] });
      if (input.includes('/ads?')) return jsonResponse({ data: [{ id: 'remote-ad1', campaign_id: 'remote-c1', adset_id: 'remote-as1', name: 'Meta Ad', status: 'ACTIVE', creative: { id: 'cr-1' } }] });
      if (input.includes('level=')) return jsonResponse({ data: [] });
      throw new Error(`Unexpected Meta request: ${input}`);
    }));

    await syncMetaAds('company-1');

    expect(fixtures.campaigns).toHaveLength(1);
    expect(fixtures.adSets).toHaveLength(1);
    expect(fixtures.ads).toHaveLength(1);

    expect(fixtures.campaigns[0]).toMatchObject({
      id: 'legacy-c1',
      sourceAccountId: '123',
      origin: 'meta_synced_readonly',
    });
    expect(fixtures.adSets[0]).toMatchObject({
      id: 'legacy-as1',
      sourceAccountId: '123',
    });
    expect(fixtures.ads[0]).toMatchObject({
      id: 'legacy-ad1',
      sourceAccountId: '123',
    });
  });

  // Task 4.4: Mixed-platform protection
  it('protects non-Meta campaigns, ad sets, and ads from sync modifications', async () => {
    fixtures.campaigns.push({
      id: 'meta-c1',
      companyId: 'company-1',
      connectionId: 'connection-1',
      platformCampaignId: 'meta-remote-1',
      sourceAccountId: '123',
      status: 'active',
    });
    fixtures.campaigns.push({
      id: 'google-c1',
      companyId: 'company-1',
      connectionId: 'connection-google',
      platformCampaignId: 'g-camp-1',
      sourceAccountId: null,
      status: 'active',
    });
    fixtures.adSets.push({
      id: 'google-as1',
      companyId: 'company-1',
      campaignId: 'google-c1',
      platformAdSetId: 'g-adset-1',
      sourceAccountId: null,
      status: 'active',
    });
    fixtures.ads.push({
      id: 'google-ad1',
      companyId: 'company-1',
      campaignId: 'google-c1',
      adSetId: 'google-as1',
      platformAdId: 'g-ad-1',
      sourceAccountId: null,
      status: 'active',
    });

    vi.stubGlobal('fetch', vi.fn((input: string) => {
      if (input.includes('/campaigns?')) return jsonResponse({ data: [{ id: 'meta-remote-1', name: 'Updated Meta', status: 'ACTIVE' }] });
      if (input.includes('/adsets?')) return jsonResponse({ data: [] });
      if (input.includes('/ads?')) return jsonResponse({ data: [] });
      if (input.includes('level=')) return jsonResponse({ data: [] });
      throw new Error(`Unexpected Meta request: ${input}`);
    }));

    await syncMetaAds('company-1');

    const googleCamp = fixtures.campaigns.find((c) => c.id === 'google-c1');
    const googleAdSet = fixtures.adSets.find((a) => a.id === 'google-as1');
    const googleAd = fixtures.ads.find((a) => a.id === 'google-ad1');

    expect(googleCamp).toMatchObject({ status: 'active', sourceAccountId: null });
    expect(googleAdSet).toMatchObject({ status: 'active', sourceAccountId: null });
    expect(googleAd).toMatchObject({ status: 'active', sourceAccountId: null });

    const updatedIds = fixtures.updates.map((u) => (u.where as any)?.right);
    expect(updatedIds).not.toContain('google-c1');
    expect(updatedIds).not.toContain('google-as1');
    expect(updatedIds).not.toContain('google-ad1');
  });

  // Task 4.5: Legacy row not present in current account
  it('preserves legacy NULL campaign when not present in current account and reconciles on correct account sync', async () => {
    fixtures.campaigns.push({
      id: 'legacy-c-A',
      companyId: 'company-1',
      connectionId: 'connection-1',
      platformCampaignId: 'campaign-A',
      sourceAccountId: null,
      status: 'active',
    });

    vi.stubGlobal('fetch', vi.fn((input: string) => {
      if (input.includes('act_accountB/campaigns?')) return jsonResponse({ data: [] });
      if (input.includes('act_accountA/campaigns?')) return jsonResponse({ data: [{ id: 'campaign-A', name: 'Campaign A', status: 'ACTIVE' }] });
      if (input.includes('/adsets?') || input.includes('/ads?')) return jsonResponse({ data: [] });
      if (input.includes('level=')) return jsonResponse({ data: [] });
      throw new Error(`Unexpected Meta request: ${input}`);
    }));

    // Account B sync where Graph returns empty
    fixtures.connection.platformAccountId = 'act_accountB';
    await syncMetaAds('company-1');

    const legacyCampB = fixtures.campaigns.find((c) => c.id === 'legacy-c-A');
    expect(legacyCampB?.sourceAccountId).toBeNull();

    // Switch to Account A sync where Graph returns campaign-A
    fixtures.connection.platformAccountId = 'act_accountA';
    await syncMetaAds('company-1');

    const legacyCampA = fixtures.campaigns.find((c) => c.id === 'legacy-c-A');
    expect(legacyCampA?.sourceAccountId).toBe('accountA');
  });
});
