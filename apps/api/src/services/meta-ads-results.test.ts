import { describe, expect, it } from 'vitest';
import { createCampaignMeasurementContext, createMetaMeasurementContext, derivePrimaryResultType, extractMetaPrimaryResult, isMeasurementRelevantAdSet } from './meta-ads-results';

describe('Meta primary results', () => {
  it('maps supported objective and optimization contexts conservatively', () => {
    expect(derivePrimaryResultType({ campaignObjective: 'leads', optimizationGoal: 'LEAD_GENERATION' })).toMatchObject({ resultType: 'lead', isSupported: true });
    expect(derivePrimaryResultType({ campaignObjective: 'leads', optimizationGoal: 'QUALITY_LEAD' })).toMatchObject({ resultType: 'lead', isSupported: true });
    expect(derivePrimaryResultType({ campaignObjective: 'traffic', optimizationGoal: 'LINK_CLICKS' })).toMatchObject({ resultType: 'link_click', isSupported: true });
    expect(derivePrimaryResultType({ campaignObjective: 'traffic', optimizationGoal: 'LANDING_PAGE_VIEWS' })).toMatchObject({ resultType: 'unknown', isSupported: false });
  });

  it('uses promoted-object event semantics for conversion/value optimization', () => {
    for (const optimizationGoal of ['OFFSITE_CONVERSIONS', 'VALUE']) {
      expect(derivePrimaryResultType({ campaignObjective: 'sales', optimizationGoal, promotedObject: { custom_event_type: 'PURCHASE' } }))
        .toMatchObject({ resultType: 'purchase', isSupported: true });
    }
    expect(derivePrimaryResultType({ campaignObjective: 'sales', optimizationGoal: 'OFFSITE_CONVERSIONS', promotedObject: { custom_event_type: 'COMPLETE_REGISTRATION' } }))
      .toMatchObject({ resultType: 'unknown', isSupported: false });
    expect(derivePrimaryResultType({ campaignObjective: 'sales', optimizationGoal: 'OFFSITE_CONVERSIONS' }))
      .toMatchObject({ resultType: 'unknown', isSupported: false });
  });

  it('uses current ad sets only and fails closed on their ambiguity or missing context', () => {
    const lead = { optimizationGoal: 'LEAD_GENERATION' };
    const purchase = { optimizationGoal: 'PURCHASE', promotedObject: { custom_event_type: 'PURCHASE' } };
    const currentLeadSets = [
      { status: 'active', ...lead },
      { status: 'archived', optimizationGoal: 'OFFSITE_CONVERSIONS' },
    ].filter((adSet) => isMeasurementRelevantAdSet(adSet.status));
    const pausedLeadSets = [
      { status: 'paused', ...lead },
      { status: 'archived', optimizationGoal: 'OFFSITE_CONVERSIONS' },
    ].filter((adSet) => isMeasurementRelevantAdSet(adSet.status));
    expect(createCampaignMeasurementContext({ campaignObjective: 'leads', adSets: currentLeadSets })).toMatchObject({ resultType: 'lead', isSupported: true });
    expect(createCampaignMeasurementContext({ campaignObjective: 'leads', adSets: pausedLeadSets })).toMatchObject({ resultType: 'lead', isSupported: true });
    expect(createCampaignMeasurementContext({ campaignObjective: 'sales', adSets: [purchase, { optimizationGoal: 'OFFSITE_CONVERSIONS' }] })).toMatchObject({ resultType: 'unknown', isSupported: false });
    expect(createCampaignMeasurementContext({ campaignObjective: 'sales', adSets: [purchase, { optimizationGoal: 'OFFSITE_CONVERSIONS', promotedObject: { custom_event_type: 'COMPLETE_REGISTRATION' } }] })).toMatchObject({ resultType: 'unknown', isSupported: false });
    expect(createCampaignMeasurementContext({ campaignObjective: 'leads', adSets: [] })).toMatchObject({ resultType: 'unknown', isSupported: false });
    expect(isMeasurementRelevantAdSet('active')).toBe(true);
    expect(isMeasurementRelevantAdSet('paused')).toBe(true);
    expect(isMeasurementRelevantAdSet('archived')).toBe(false);
  });

  it('selects one action alias by documented precedence rather than summing aliases', () => {
    const purchase = createMetaMeasurementContext({ campaignObjective: 'sales', optimizationGoal: 'OFFSITE_CONVERSIONS', promotedObject: { custom_event_type: 'PURCHASE' } });
    expect(extractMetaPrimaryResult({ context: purchase, actions: [
      { action_type: 'purchase', value: '10' }, { action_type: 'omni_purchase', value: '10' }, { action_type: 'offsite_conversion.fb_pixel_purchase', value: '10' },
    ] })).toMatchObject({ count: 10, sourceActionTypes: ['purchase'] });
  });

  it('allows an explicit development-fixture result without pretending it is live Meta context', () => {
    expect(extractMetaPrimaryResult({ objective: 'leads', fixtureResultType: 'lead', actions: [{ action_type: 'lead', value: '7' }] }))
      .toMatchObject({ type: 'lead', count: 7, isSupported: true });
  });
});
