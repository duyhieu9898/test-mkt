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

import { selectPrimaryFindingForAction, setMetaAdsRecommendationStatus } from './meta-ads-recommendations';
import type { AdsFinding } from './meta-ads-evidence';

const evidence = (id: string, metric: AdsFinding['evidence']['metric']) => ({
  id, target: 'campaign' as const, targetId: 'campaign-1', metric, baseline: 1, current: 2, delta: 1,
  percentChange: 100, baselineWindow: { start: '2026-01-01', end: '2026-01-07', timezone: 'UTC' },
  currentWindow: { start: '2026-01-08', end: '2026-01-14', timezone: 'UTC' }, source: 'meta_insights' as const,
  sufficientData: true, label: metric,
});
const findings: AdsFinding[] = [
  { kind: 'budget_increase', severity: 'high', fact: 'Budget increased.', evidence: evidence('budget', 'daily_budget') },
  { kind: 'ctr_decline', severity: 'medium', fact: 'CTR declined.', evidence: evidence('ctr', 'ctr') },
  { kind: 'cost_per_result_increase', severity: 'high', fact: 'Cost per lead increased.', evidence: evidence('cpr', 'cost_per_result') },
];

describe('selectPrimaryFindingForAction', () => {
  it('binds the recommendation record to the evidence supporting its selected action', () => {
    expect(selectPrimaryFindingForAction(findings, 'review_budget')?.kind).toBe('budget_increase');
    expect(selectPrimaryFindingForAction(findings, 'creative_test')?.kind).toBe('ctr_decline');
    expect(selectPrimaryFindingForAction(findings, 'review_delivery')?.kind).toBe('budget_increase');
  });
});

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
