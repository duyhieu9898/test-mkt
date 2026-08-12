import { describe, expect, it } from 'vitest';
import {
  buildMetaAdsBriefPrompt,
  buildMetaAdsBriefValidationContext,
  validateMetaAdsBrief,
} from './meta-ads-brief';
import type { MetaAdsBrief, MetaAdsBriefContext } from './meta-ads-brief';
import type { AdsFinding } from './meta-ads-evidence';

const finding: AdsFinding = {
  kind: 'cost_per_result_increase', severity: 'high', fact: 'Cost per lead increased by 200.0% between the selected windows.',
  evidence: {
    id: 'evidence-1', target: 'campaign', targetId: 'campaign-1', metric: 'cost_per_result', baseline: 10, current: 30,
    delta: 200, percentChange: 200, baselineWindow: { start: '2026-06-01', end: '2026-06-07', timezone: 'Asia/Ho_Chi_Minh' },
    currentWindow: { start: '2026-07-06', end: '2026-07-12', timezone: 'Asia/Ho_Chi_Minh' }, source: 'meta_insights', sufficientData: true, label: 'Spend',
  },
};

const ctrDeclineFinding: AdsFinding = {
  ...finding,
  kind: 'ctr_decline',
  fact: 'CTR decreased by 50.0% between the selected windows.',
  evidence: { ...finding.evidence, id: 'ctr-evidence-1', metric: 'ctr', baseline: 2, current: 1, delta: -1, percentChange: -50, label: 'CTR' },
};

const campaignContext: MetaAdsBriefContext = {
  objective: 'traffic', adSets: [],
  creatives: [{ id: 'creative-1', name: 'Creative A', type: 'image', headline: 'Speak English today', primaryText: 'Try a lesson.', description: null, callToAction: 'Learn More' }],
};

function brief(overrides: Partial<MetaAdsBrief> = {}): MetaAdsBrief {
  return {
    actionType: 'review_delivery',
    possibleCause: 'Spend changed, but campaign-level evidence cannot isolate the cause.',
    recommendedAction: 'Review delivery context before testing a new creative.',
    grounding: { actionSourceIds: ['evidence-1', 'campaign_context'] },
    creativeTest: null,
    creativeBrief: null,
    ...overrides,
  };
}

describe('Meta Ads brief contract', () => {
  it('exposes evidence-derived action types and known grounding IDs in the prompt', () => {
    const prompt = buildMetaAdsBriefPrompt({ targetName: 'Summer campaign', findings: [finding], brandContext: 'VOICE: concise.', campaignContext });
    expect(prompt).toContain('ALLOWED ACTION TYPES: ["review_delivery"]');
    expect(prompt).toContain('evidence-1');
    expect(prompt).toContain('creative:creative-1');
    expect(prompt).toContain('actionType');
    expect(prompt).toContain('grounding');
  });

  it('rejects review_budget when the evidence only shows spend', () => {
    const context = buildMetaAdsBriefValidationContext({ findings: [finding], brandContext: '', campaignContext });
    expect(validateMetaAdsBrief(brief({ actionType: 'review_budget' }), [finding], context))
      .toContain('The action type "review_budget" is not allowed by the supplied evidence.');
  });

  it('accepts a creative test only when CTR declined and a creative is synced', () => {
    const context = buildMetaAdsBriefValidationContext({ findings: [ctrDeclineFinding], brandContext: '', campaignContext });
    const candidate = brief({
      actionType: 'creative_test',
      creativeTest: { sourceCreativeId: 'creative-1', type: 'message_variant' },
      creativeBrief: { angle: 'Playful learning', hook: 'Make English fun', copyDirection: 'Use the current lesson message.', visualOrVideoDirection: 'A child using a lesson on a phone.', cta: 'Learn More' },
      grounding: { actionSourceIds: ['ctr-evidence-1'] },
    });
    expect(validateMetaAdsBrief(candidate, [ctrDeclineFinding], context)).toEqual([]);
  });

  it('rejects a creative test based only on increased spend or without a synced creative', () => {
    const spendContext = buildMetaAdsBriefValidationContext({ findings: [finding], brandContext: '', campaignContext });
    expect(validateMetaAdsBrief(brief({
      actionType: 'creative_test',
      creativeTest: { sourceCreativeId: 'creative-1', type: 'message_variant' },
    }), [finding], spendContext)).toContain('The action type "creative_test" is not allowed by the supplied evidence.');

    const noCreativeContext = buildMetaAdsBriefValidationContext({
      findings: [ctrDeclineFinding], brandContext: '', campaignContext: { ...campaignContext, creatives: [] },
    });
    expect(validateMetaAdsBrief(brief({ actionType: 'creative_test' }), [ctrDeclineFinding], noCreativeContext))
      .toContain('The action type "creative_test" is not allowed by the supplied evidence.');
  });

  it('rejects invented grounding IDs rather than trying to police wording', () => {
    const context = buildMetaAdsBriefValidationContext({ findings: [finding], brandContext: '', campaignContext });
    expect(validateMetaAdsBrief(brief({
      grounding: { actionSourceIds: ['unknown'] },
    }), [finding], context)).toEqual(expect.arrayContaining([
      'The recommended action must cite known evidence, Brand IQ, or campaign context source IDs.',
    ]));
  });

  it('requires action-relevant finding evidence rather than campaign context alone', () => {
    const context = buildMetaAdsBriefValidationContext({ findings: [ctrDeclineFinding], brandContext: '', campaignContext });
    expect(validateMetaAdsBrief(brief({
      actionType: 'creative_test',
      creativeTest: { sourceCreativeId: 'creative-1', type: 'message_variant' },
      grounding: { actionSourceIds: ['campaign_context'] },
    }), [ctrDeclineFinding], context)).toContain('creative_test must cite CTR-decline evidence.');
    expect(validateMetaAdsBrief(brief({ grounding: { actionSourceIds: ['campaign_context'] } }), [finding], context))
      .toContain('review_delivery must cite negative-finding evidence.');
  });

  it('accepts related evidence as known context but not as primary action permission', () => {
    const withRelated = { ...ctrDeclineFinding, relatedEvidence: [{ ...finding.evidence, id: 'related-ctr-evidence' }] };
    const context = buildMetaAdsBriefValidationContext({ findings: [withRelated], brandContext: '', campaignContext });
    expect(validateMetaAdsBrief(brief({
      actionType: 'creative_test', creativeTest: { sourceCreativeId: 'creative-1', type: 'message_variant' },
      grounding: { actionSourceIds: ['related-ctr-evidence'] },
    }), [withRelated], context)).toContain('creative_test must cite CTR-decline evidence.');
  });
});
