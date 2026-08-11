import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const returning = vi.fn();
  const where = vi.fn(() => ({ returning }));
  const set = vi.fn(() => ({ where }));
  const update = vi.fn(() => ({ set }));
  return { returning, where, set, update };
});

vi.mock('../lib/db', () => ({ db: { update: mocks.update } }));

import { setMetaAdsRecommendationStatus } from './meta-ads-recommendations';

describe('setMetaAdsRecommendationStatus', () => {
  beforeEach(() => vi.clearAllMocks());

  it('persists a permitted human disposition', async () => {
    mocks.returning.mockResolvedValue([{ id: 'recommendation-1', companyId: 'company-1', status: 'saved' }]);
    await expect(setMetaAdsRecommendationStatus('company-1', 'recommendation-1', 'saved')).resolves.toMatchObject({ status: 'saved' });
    expect(mocks.set).toHaveBeenCalledWith(expect.objectContaining({ status: 'saved', updatedAt: expect.any(Date) }));
    expect(mocks.where).toHaveBeenCalledTimes(1);
  });

  it('does not report a recommendation from another company as updated', async () => {
    mocks.returning.mockResolvedValue([]);
    await expect(setMetaAdsRecommendationStatus('company-1', 'recommendation-from-company-2', 'rejected'))
      .rejects.toThrow('Recommendation not found');
  });
});
