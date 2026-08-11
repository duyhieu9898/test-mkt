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
  it('FacebookAdProvider throws MetaAdsReadOnlyError on campaign creation', async () => {
    const provider = new FacebookAdProvider();
    await expect(
      provider.createCampaign('token', '123', {
        name: 'Test',
        objective: 'traffic',
        status: 'active',
      })
    ).rejects.toThrow(MetaAdsReadOnlyError);
  });

  it('FacebookAdProvider throws MetaAdsReadOnlyError on status update', async () => {
    const provider = new FacebookAdProvider();
    await expect(
      provider.updateCampaignStatus('token', '123', 'PAUSED')
    ).rejects.toThrow(MetaAdsReadOnlyError);
  });

  it('FacebookAdProvider throws MetaAdsReadOnlyError on ad set creation', async () => {
    const provider = new FacebookAdProvider();
    await expect(
      provider.createAdSet('token', '123', {
        campaignId: 'c1',
        name: 'Set',
        dailyBudget: 10,
        status: 'active',
      })
    ).rejects.toThrow(MetaAdsReadOnlyError);
  });

  it('FacebookAdProvider throws MetaAdsReadOnlyError on ad creation', async () => {
    const provider = new FacebookAdProvider();
    await expect(
      provider.createAd('token', '123', {
        adSetId: 's1',
        name: 'Ad',
        creative: { headline: 'H', primaryText: 'P', destinationUrl: 'https://example.com' },
        status: 'active',
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
