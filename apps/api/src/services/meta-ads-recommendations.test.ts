import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const returning = vi.fn();
  const where = vi.fn(() => ({ returning }));
  const set = vi.fn(() => ({ where }));
  const update = vi.fn(() => ({ set }));
  const findFirst = vi.fn();
  const campaignFindFirst = vi.fn();
  return { returning, where, set, update, findFirst, campaignFindFirst };
});

vi.mock('../lib/db', () => ({
  db: {
    update: mocks.update,
    query: {
      adRecommendations: { findFirst: mocks.findFirst },
      adCampaigns: { findFirst: mocks.campaignFindFirst },
    },
  },
}));

import { setMetaAdsRecommendationStatus } from './meta-ads-recommendations';

describe('setMetaAdsRecommendationStatus', () => {
  beforeEach(() => vi.clearAllMocks());

  it('persists a permitted human disposition when campaign belongs to selected account', async () => {
    mocks.findFirst.mockResolvedValue({ id: 'recommendation-1', companyId: 'company-1', campaignId: 'campaign-1' });
    mocks.campaignFindFirst.mockResolvedValue({ id: 'campaign-1', companyId: 'company-1', sourceAccountId: '123' });
    mocks.returning.mockResolvedValue([{ id: 'recommendation-1', companyId: 'company-1', status: 'saved' }]);
    await expect(setMetaAdsRecommendationStatus('company-1', 'recommendation-1', 'saved', '123')).resolves.toMatchObject({ status: 'saved' });
    expect(mocks.set).toHaveBeenCalledWith(expect.objectContaining({ status: 'saved', updatedAt: expect.any(Date) }));
    expect(mocks.where).toHaveBeenCalledTimes(1);
  });

  it('does not report a recommendation from another company as updated', async () => {
    mocks.findFirst.mockResolvedValue(null);
    await expect(setMetaAdsRecommendationStatus('company-1', 'recommendation-from-company-2', 'rejected', '123'))
      .rejects.toThrow('Recommendation not found');
  });

  it('rejects PATCH when recommendation campaign belongs to a different account', async () => {
    // Recommendation exists in the company, but its campaign belongs to account 'account-A'
    mocks.findFirst.mockResolvedValue({ id: 'rec-A', companyId: 'company-1', campaignId: 'campaign-A' });
    mocks.campaignFindFirst.mockResolvedValue({ id: 'campaign-A', companyId: 'company-1', sourceAccountId: 'account-A' });

    // User has switched to account-B and tries to PATCH rec-A
    await expect(setMetaAdsRecommendationStatus('company-1', 'rec-A', 'saved', 'account-B'))
      .rejects.toThrow('Recommendation not found');

    // Verify update was never called
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('rejects PATCH when recommendation campaign has NULL sourceAccountId', async () => {
    mocks.findFirst.mockResolvedValue({ id: 'rec-legacy', companyId: 'company-1', campaignId: 'campaign-legacy' });
    mocks.campaignFindFirst.mockResolvedValue({ id: 'campaign-legacy', companyId: 'company-1', sourceAccountId: null });

    await expect(setMetaAdsRecommendationStatus('company-1', 'rec-legacy', 'saved', '123'))
      .rejects.toThrow('Recommendation not found');

    expect(mocks.update).not.toHaveBeenCalled();
  });
});
