import { describe, expect, it } from 'vitest';
import { detectAdsEvidence, detectAdsFindings, type MetricSnapshot } from './meta-ads-evidence';

const baselineWindow = { start: '2026-06-01', end: '2026-06-07', timezone: 'Asia/Ho_Chi_Minh' };
const currentWindow = { start: '2026-07-06', end: '2026-07-12', timezone: 'Asia/Ho_Chi_Minh' };
const primary = (count: number | null, type: 'lead' | 'purchase' | 'unknown' = 'lead', supported = type !== 'unknown') => ({
  type, count, isSupported: supported, sourceActionTypes: supported ? [type] : [],
} as const);
const snapshot = (overrides: Partial<MetricSnapshot> = {}): MetricSnapshot => ({
  spend: 100, impressions: 10_000, clicks: 200, conversions: 10, ctr: 2,
  primaryResult: primary(10), costPerResult: 10, ...overrides,
});
const input = (baseline: MetricSnapshot, current: MetricSnapshot) => ({
  target: 'campaign' as const, targetId: 'campaign-1', baselineWindow, currentWindow, baseline, current,
});

describe('Meta Ads evidence', () => {
  it('keeps an actual budget increase as a finding and groups spend as related evidence', () => {
    const findings = detectAdsFindings(input(
      snapshot({ dailyBudget: 100 }), snapshot({ spend: 300, dailyBudget: 300, primaryResult: primary(10), costPerResult: 30 }),
    ));
    const budget = findings.find((finding) => finding.kind === 'budget_increase');
    expect(budget?.evidence).toMatchObject({ metric: 'daily_budget', baseline: 100, current: 300, percentChange: 200 });
    expect(budget?.relatedEvidence?.[0]).toMatchObject({ metric: 'spend', baseline: 100, current: 300 });
  });

  it('records spend increases as observations, not negative findings, at the 50% boundary', () => {
    const atBoundary = detectAdsEvidence(input(snapshot(), snapshot({ spend: 150, primaryResult: primary(15), costPerResult: 10 })));
    const belowBoundary = detectAdsEvidence(input(snapshot(), snapshot({ spend: 149.9, primaryResult: primary(14.99), costPerResult: 10 })));
    expect(atBoundary.observations).toHaveLength(1);
    expect(atBoundary.findings).toEqual([]);
    expect(belowBoundary.observations).toEqual([]);
  });

  it('does not claim a budget change when only spend is available', () => {
    const evidence = detectAdsEvidence(input(snapshot(), snapshot({ spend: 300, primaryResult: primary(30), costPerResult: 10 })));
    expect(evidence.findings.some((finding) => finding.kind === 'budget_increase')).toBe(false);
    expect(evidence.observations).toHaveLength(1);
  });

  it('uses CTR boundaries and requires meaningful baseline click volume', () => {
    const medium = detectAdsFindings(input(snapshot({ ctr: 2, clicks: 30 }), snapshot({ ctr: 1.4, clicks: 30 })));
    const high = detectAdsFindings(input(snapshot({ ctr: 2, clicks: 30 }), snapshot({ ctr: 1, clicks: 30 })));
    const below = detectAdsFindings(input(snapshot({ ctr: 2, clicks: 30 }), snapshot({ ctr: 1.402, clicks: 30 })));
    const lowClicks = detectAdsFindings(input(snapshot({ ctr: 0.1, clicks: 10 }), snapshot({ ctr: 0.05, clicks: 5 })));
    expect(medium.find((finding) => finding.kind === 'ctr_decline')?.severity).toBe('medium');
    expect(high.find((finding) => finding.kind === 'ctr_decline')?.severity).toBe('high');
    expect(below.some((finding) => finding.kind === 'ctr_decline')).toBe(false);
    expect(lowClicks.some((finding) => finding.kind === 'ctr_decline')).toBe(false);
  });

  it('detects supported result-efficiency deterioration only with sufficient result volume', () => {
    const medium = detectAdsFindings(input(snapshot(), snapshot({ spend: 130, primaryResult: primary(10), costPerResult: 13 })));
    const high = detectAdsFindings(input(snapshot(), snapshot({ spend: 150, primaryResult: primary(10), costPerResult: 15 })));
    const unsupported = detectAdsFindings(input(snapshot({ primaryResult: primary(null, 'unknown', false), costPerResult: null }), snapshot({ spend: 150, primaryResult: primary(null, 'unknown', false), costPerResult: null })));
    const lowResults = detectAdsFindings(input(snapshot({ primaryResult: primary(1), costPerResult: 100 }), snapshot({ spend: 200, primaryResult: primary(1), costPerResult: 200 })));
    expect(medium.find((finding) => finding.kind === 'cost_per_result_increase')?.severity).toBe('medium');
    expect(high.find((finding) => finding.kind === 'cost_per_result_increase')?.severity).toBe('high');
    expect(unsupported.some((finding) => finding.kind === 'cost_per_result_increase')).toBe(false);
    expect(lowResults.some((finding) => finding.kind === 'cost_per_result_increase')).toBe(false);
  });

  it('returns no evidence when delivery is insufficient', () => {
    const evidence = detectAdsEvidence(input(snapshot({ impressions: 80 }), snapshot({ impressions: 90 })));
    expect(evidence).toEqual({ observations: [], findings: [] });
  });
});
