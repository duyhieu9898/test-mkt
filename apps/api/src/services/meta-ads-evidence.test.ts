import { describe, expect, it } from 'vitest';
import { detectAdsFindings } from './meta-ads-evidence';

const baselineWindow = { start: '2026-06-01', end: '2026-06-07', timezone: 'Asia/Ho_Chi_Minh' };
const currentWindow = { start: '2026-07-06', end: '2026-07-12', timezone: 'Asia/Ho_Chi_Minh' };

describe('detectAdsFindings', () => {
  it('turns a $100 to $300 budget change into inspectable evidence', () => {
    const findings = detectAdsFindings({
      target: 'campaign', targetId: 'campaign-1', baselineWindow, currentWindow,
      baseline: { spend: 100, impressions: 1000, clicks: 20, conversions: 1, ctr: 2, dailyBudget: 100 },
      current: { spend: 300, impressions: 1200, clicks: 18, conversions: 1, ctr: 1.5, dailyBudget: 300 },
    });
    const budget = findings.find((finding) => finding.kind === 'budget_increase');
    expect(budget?.evidence).toMatchObject({ baseline: 100, current: 300, delta: 200, percentChange: 200, sufficientData: true });
    expect(budget?.fact).toContain('200.0%');
    expect(budget?.relatedEvidence?.[0]).toMatchObject({ metric: 'spend', baseline: 100, current: 300 });
    expect(findings.some((finding) => finding.kind === 'spend_increase')).toBe(false);
  });

  it('does not claim a budget change when only spend is available', () => {
    const findings = detectAdsFindings({
      target: 'campaign', targetId: 'campaign-1', baselineWindow, currentWindow,
      baseline: { spend: 100, impressions: 1000, clicks: 20, conversions: 1, ctr: 2 },
      current: { spend: 300, impressions: 1200, clicks: 18, conversions: 1, ctr: 1.5 },
    });
    expect(findings.some((finding) => finding.kind === 'budget_increase')).toBe(false);
    expect(findings.some((finding) => finding.kind === 'spend_increase')).toBe(true);
  });

  it('returns no recommendation finding when delivery is insufficient', () => {
    const findings = detectAdsFindings({
      target: 'campaign', targetId: 'campaign-1', baselineWindow, currentWindow,
      baseline: { spend: 10, impressions: 80, clicks: 4, conversions: 0, ctr: 5, dailyBudget: 100 },
      current: { spend: 30, impressions: 90, clicks: 1, conversions: 0, ctr: 1.1, dailyBudget: 300 },
    });
    expect(findings).toEqual([]);
  });

  it('returns no finding when delivery is sufficient but no threshold is crossed', () => {
    const findings = detectAdsFindings({
      target: 'campaign', targetId: 'campaign-1', baselineWindow, currentWindow,
      baseline: { spend: 150, impressions: 12_000, clicks: 180, conversions: 12, ctr: 1.5, dailyBudget: 150 },
      current: { spend: 152, impressions: 12_100, clicks: 182, conversions: 12, ctr: 1.5, dailyBudget: 150 },
    });
    expect(findings).toEqual([]);
  });
});
