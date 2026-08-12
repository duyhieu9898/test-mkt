import { describe, expect, it } from 'vitest';
import { detectAdsEvidence, detectAdsFindings, type MetricSnapshot } from './meta-ads-evidence';

const baselineWindow = { start: '2026-06-01', end: '2026-06-07', timezone: 'Asia/Ho_Chi_Minh' };
const currentWindow = { start: '2026-07-06', end: '2026-07-12', timezone: 'Asia/Ho_Chi_Minh' };
const primary = (count: number | null, type: 'lead' | 'purchase' | 'unknown' = 'lead', supported = type !== 'unknown') => ({ type, count, isSupported: supported, sourceActionTypes: supported ? [type] : [] } as const);
/** Mirrors production math: fixtures never hand-write an inconsistent CTR/CPR. */
const snapshotFrom = ({ impressions = 10_000, clicks = 200, spend = 100, primaryResult = primary(10), dailyBudget }: Partial<Pick<MetricSnapshot, 'impressions' | 'clicks' | 'spend' | 'primaryResult' | 'dailyBudget'>> = {}): MetricSnapshot => ({
  impressions, clicks, spend, dailyBudget, conversions: primaryResult.isSupported && primaryResult.type !== 'unknown' ? primaryResult.count || 0 : 0,
  ctr: impressions ? (clicks / impressions) * 100 : 0, primaryResult,
  costPerResult: primaryResult.count && primaryResult.count > 0 ? spend / primaryResult.count : null,
});
const input = (baseline: MetricSnapshot, current: MetricSnapshot) => ({ target: 'campaign' as const, targetId: 'campaign-1', baselineWindow, currentWindow, baseline, current });

describe('Meta Ads evidence', () => {
  it('keeps spend scaling as an observation, including proportional result growth', () => {
    const evidence = detectAdsEvidence(input(snapshotFrom(), snapshotFrom({ spend: 200, primaryResult: primary(20) })));
    expect(evidence.observations).toHaveLength(1);
    expect(evidence.findings).toEqual([]);
  });

  it('detects 20 → 0 and 20 → 2 result collapses but not low-volume or delivery-collapse cases', () => {
    const collapse = detectAdsFindings(input(snapshotFrom({ primaryResult: primary(20) }), snapshotFrom({ primaryResult: primary(0) })));
    const nearZero = detectAdsFindings(input(snapshotFrom({ primaryResult: primary(20) }), snapshotFrom({ primaryResult: primary(2) })));
    const medium = detectAdsFindings(input(snapshotFrom({ primaryResult: primary(20) }), snapshotFrom({ primaryResult: primary(10) })));
    const lowVolume = detectAdsFindings(input(snapshotFrom({ primaryResult: primary(1) }), snapshotFrom({ primaryResult: primary(0) })));
    const deliveryCollapsed = detectAdsFindings(input(snapshotFrom({ primaryResult: primary(20) }), snapshotFrom({ spend: 4, primaryResult: primary(0) })));
    expect(collapse.find((f) => f.kind === 'primary_result_decline')?.severity).toBe('high');
    expect(nearZero.find((f) => f.kind === 'primary_result_decline')?.severity).toBe('high');
    expect(medium.find((f) => f.kind === 'primary_result_decline')?.severity).toBe('medium');
    expect(lowVolume.some((f) => f.kind === 'primary_result_decline')).toBe(false);
    expect(deliveryCollapsed.some((f) => f.kind === 'primary_result_decline')).toBe(false);
  });

  it('retains CPR boundaries and suppresses its duplicate when result decline is primary', () => {
    const at30 = detectAdsFindings(input(snapshotFrom(), snapshotFrom({ spend: 130 })));
    const at50 = detectAdsFindings(input(snapshotFrom(), snapshotFrom({ spend: 150 })));
    const below = detectAdsFindings(input(snapshotFrom(), snapshotFrom({ spend: 129.9 })));
    const collapse = detectAdsFindings(input(snapshotFrom({ primaryResult: primary(20) }), snapshotFrom({ spend: 100, primaryResult: primary(5) })));
    expect(at30.find((f) => f.kind === 'cost_per_result_increase')?.severity).toBe('medium');
    expect(at50.find((f) => f.kind === 'cost_per_result_increase')?.severity).toBe('high');
    expect(below.some((f) => f.kind === 'cost_per_result_increase')).toBe(false);
    expect(collapse.map((f) => f.kind)).toEqual(['primary_result_decline']);
  });

  it('uses realistic CTR gates and boundaries', () => {
    const medium = detectAdsFindings(input(snapshotFrom({ clicks: 100 }), snapshotFrom({ clicks: 70 })));
    const high = detectAdsFindings(input(snapshotFrom({ clicks: 100 }), snapshotFrom({ clicks: 50 })));
    const below = detectAdsFindings(input(snapshotFrom({ clicks: 100 }), snapshotFrom({ clicks: 71 })));
    const lowClicks = detectAdsFindings(input(snapshotFrom({ clicks: 29 }), snapshotFrom({ clicks: 14 })));
    expect(medium.find((f) => f.kind === 'ctr_decline')?.severity).toBe('medium');
    expect(high.find((f) => f.kind === 'ctr_decline')?.severity).toBe('high');
    expect(below.some((f) => f.kind === 'ctr_decline')).toBe(false);
    expect(lowClicks.some((f) => f.kind === 'ctr_decline')).toBe(false);
  });
});
