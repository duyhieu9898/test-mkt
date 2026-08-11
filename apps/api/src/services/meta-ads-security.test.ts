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
});
