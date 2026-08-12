import { describe, expect, it } from 'vitest';
import { createCampaignMeasurementContext, createMetaMeasurementContext, extractMetaPrimaryResult } from './meta-ads-results';

describe('Meta primary results', () => {
  it('requires compatible objective and optimization context for live Meta', () => {
    const leads = createMetaMeasurementContext({ campaignObjective: 'leads', optimizationGoals: ['LEAD_GENERATION'] });
    expect(extractMetaPrimaryResult({ context: leads, actions: [{ action_type: 'offsite_conversion.fb_pixel_lead', value: '7' }] }))
      .toMatchObject({ type: 'lead', count: 7, isSupported: true });
    expect(createMetaMeasurementContext({ campaignObjective: 'sales', optimizationGoals: ['COMPLETE_REGISTRATION'] }))
      .toMatchObject({ resultType: 'unknown', isSupported: false });
    expect(createMetaMeasurementContext({ campaignObjective: 'sales', optimizationGoals: [] }))
      .toMatchObject({ resultType: 'unknown', isSupported: false });
  });

  it('fails closed for mixed ad-set goals', () => {
    expect(createCampaignMeasurementContext({ campaignObjective: 'sales', adSetOptimizationGoals: [['PURCHASE'], ['COMPLETE_REGISTRATION']] }))
      .toMatchObject({ resultType: 'unknown', isSupported: false });
  });

  it('selects one action alias by documented precedence rather than summing aliases', () => {
    const purchase = createMetaMeasurementContext({ campaignObjective: 'sales', optimizationGoals: ['PURCHASE'] });
    expect(extractMetaPrimaryResult({ context: purchase, actions: [
      { action_type: 'purchase', value: '10' }, { action_type: 'omni_purchase', value: '10' }, { action_type: 'offsite_conversion.fb_pixel_purchase', value: '10' },
    ] })).toMatchObject({ count: 10, sourceActionTypes: ['purchase'] });
    expect(extractMetaPrimaryResult({ context: purchase, actions: [
      { action_type: 'purchase', value: '10' }, { action_type: 'offsite_conversion.fb_pixel_purchase', value: '7' },
    ] })).toMatchObject({ count: 10, sourceActionTypes: ['purchase'] });
  });

  it('allows an explicit development-fixture result without pretending it is live Meta context', () => {
    expect(extractMetaPrimaryResult({ objective: 'leads', fixtureResultType: 'lead', actions: [{ action_type: 'lead', value: '7' }] }))
      .toMatchObject({ type: 'lead', count: 7, isSupported: true });
  });
});
