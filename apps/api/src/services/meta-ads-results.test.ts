import { describe, expect, it } from 'vitest';
import { extractMetaPrimaryResult } from './meta-ads-results';

describe('extractMetaPrimaryResult', () => {
  it('maps objective-aware supported and qualified Meta action types', () => {
    expect(extractMetaPrimaryResult({ objective: 'leads', actions: [{ action_type: 'offsite_conversion.fb_pixel_lead', value: '7' }] }))
      .toMatchObject({ type: 'lead', count: 7, isSupported: true });
    expect(extractMetaPrimaryResult({ objective: 'sales', actions: [{ action_type: 'offsite_conversion.purchase', value: '4' }] }))
      .toMatchObject({ type: 'purchase', count: 4, isSupported: true });
    expect(extractMetaPrimaryResult({ objective: 'traffic', actions: [{ action_type: 'link_click', value: '12' }] }))
      .toMatchObject({ type: 'link_click', count: 12, isSupported: true });
  });

  it('fails closed for unsupported objectives and ambiguous conversions results', () => {
    expect(extractMetaPrimaryResult({ objective: 'awareness', actions: [{ action_type: 'lead', value: '5' }] }))
      .toMatchObject({ type: 'unknown', count: null, isSupported: false });
    expect(extractMetaPrimaryResult({ objective: 'conversions', actions: [
      { action_type: 'lead', value: '5' }, { action_type: 'purchase', value: '2' },
    ] })).toMatchObject({ type: 'unknown', count: null, isSupported: false });
  });
});
