import { describe, expect, it, vi } from 'vitest';
import { FacebookAdProvider } from './platforms/providers/facebook';
import { adsEngine } from './ads-engine';
import { MetaAdsReadOnlyError } from './meta-ads-errors';

vi.mock('../lib/db', () => ({
  db: {
    query: {
      adCampaigns: {
        findFirst: vi.fn(async () => ({
          id: 'campaign-1',
          companyId: 'company-1',
          platform: 'facebook',
          platformCampaignId: 'meta-123',
          sourceAccountId: '123',
        })),
      },
      adConnections: {
        findFirst: vi.fn(async () => ({
          id: 'connection-1',
          companyId: 'company-1',
          platform: 'facebook',
          platformAccountId: '123',
          accessToken: 'token',
        })),
      },
      adSets: {
        findMany: vi.fn(async () => []),
      },
      ads: {
        findMany: vi.fn(async () => []),
      },
      adCampaignAnalyses: {
        findFirst: vi.fn(async () => null),
      },
    },
  },
}));

describe('Meta Ads V1 Invariants & Security', () => {
  const dummyConnection = {
    id: 'conn-1',
    companyId: 'company-1',
    platform: 'facebook',
    status: 'connected',
    accessToken: 'token',
    platformAccountId: '123',
  };

  it('FacebookAdProvider throws MetaAdsReadOnlyError on campaign creation', async () => {
    const provider = new FacebookAdProvider();
    await expect(
      provider.createCampaign(dummyConnection, {
        name: 'Test',
        objective: 'traffic',
        dailyBudget: 100,
      })
    ).rejects.toThrow(MetaAdsReadOnlyError);
  });

  it('FacebookAdProvider throws MetaAdsReadOnlyError on status update', async () => {
    const provider = new FacebookAdProvider();
    await expect(
      provider.updateCampaignStatus(dummyConnection, '123', 'PAUSED')
    ).rejects.toThrow(MetaAdsReadOnlyError);
  });

  it('FacebookAdProvider throws MetaAdsReadOnlyError on ad set creation', async () => {
    const provider = new FacebookAdProvider();
    await expect(
      provider.createAdSet(dummyConnection, {
        campaignId: 'c1',
        platformCampaignId: '123',
        name: 'Set',
        dailyBudget: 10,
      })
    ).rejects.toThrow(MetaAdsReadOnlyError);
  });

  it('FacebookAdProvider throws MetaAdsReadOnlyError on ad creation', async () => {
    const provider = new FacebookAdProvider();
    await expect(
      provider.createAd(dummyConnection, {
        adSetId: 's1',
        platformAdSetId: 'adset-123',
        name: 'Ad',
        type: 'image',
        headline: 'H',
        primaryText: 'P',
        callToAction: 'LEARN_MORE',
        destinationUrl: 'https://example.com',
      })
    ).rejects.toThrow(MetaAdsReadOnlyError);
  });

  it('AdsEngine.launchCampaign throws MetaAdsReadOnlyError for facebook campaigns', async () => {
    await expect(adsEngine.launchCampaign('campaign-1', 'company-1')).rejects.toThrow(
      MetaAdsReadOnlyError
    );
  });

  it('AdsEngine.pauseCampaign throws MetaAdsReadOnlyError for facebook campaigns', async () => {
    await expect(adsEngine.pauseCampaign('campaign-1', 'company-1')).rejects.toThrow(
      MetaAdsReadOnlyError
    );
  });

  it('analyzeMetaCampaign throws fail-closed error if sourceAccountId does not match active account', async () => {
    const { analyzeMetaCampaign } = await import('./meta-ads-analysis');
    const dummyWindows = {
      baseline: { start: '2026-08-01', end: '2026-08-07', timezone: 'UTC' },
      current: { start: '2026-08-08', end: '2026-08-14', timezone: 'UTC' },
    };

    // Mock DB returns a campaign with sourceAccountId 'account-B', while connection is '123'
    const { db } = await import('../lib/db');
    vi.mocked(db.query.adCampaigns.findFirst).mockResolvedValueOnce({
      id: 'campaign-1',
      companyId: 'company-1',
      connectionId: 'connection-1',
      platform: 'facebook',
      platformCampaignId: '123456789', // non-fixture
      sourceAccountId: 'account-B',
      objective: 'conversions',
    } as any);

    await expect(
      analyzeMetaCampaign('company-1', 'campaign-1', dummyWindows)
    ).rejects.toThrow('Campaign does not belong to the currently selected Meta Ad Account');
  });
});
