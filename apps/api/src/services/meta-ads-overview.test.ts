import { describe, expect, it } from 'vitest';
import { countCampaignsNeedingReview, latestAnalysisStatusByCampaignId } from './meta-ads-overview';

describe('Meta Ads overview totals', () => {
  it('counts latest review statuses across all eligible pages, not the hydrated page', () => {
    const live = Array.from({ length: 50 }, (_, index) => `live-${index + 1}`);
    const statuses = latestAnalysisStatusByCampaignId([
      { campaignId: 'live-1', status: 'no_issues_detected' }, // newest result wins
      ...live.slice(0, 3).map((campaignId) => ({ campaignId, status: 'needs_review' })),
      ...live.slice(25, 33).map((campaignId) => ({ campaignId, status: 'needs_review' })),
      { campaignId: 'archived', status: 'needs_review' },
      { campaignId: 'other-account', status: 'needs_review' },
      { campaignId: 'fixture', status: 'needs_review' },
    ]);
    expect(countCampaignsNeedingReview(live, statuses)).toBe(10);
    expect(countCampaignsNeedingReview(live.slice(0, 25), statuses)).toBe(2);
    expect(countCampaignsNeedingReview(live, statuses)).toBe(10);
  });
});
