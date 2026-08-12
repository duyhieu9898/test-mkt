import { renderSkillKnowledgeBundle } from '@1person/core';
import { extractJSON, llmGenerate } from '../lib/llm';
import type { LLMMessage } from '../lib/llm';
import { getActiveBrandIq, renderBrandIqContext } from './brand-iq-extractor';
import type { AdsFinding } from './meta-ads-evidence';

export type MetaAdsBrief = {
  actionType: 'review_budget' | 'review_delivery' | 'creative_test';
  possibleCause: string;
  recommendedAction: string;
  grounding: {
    actionSourceIds: string[];
  };
  creativeTest: { sourceCreativeId: string; type: 'message_variant' | 'format_variant' | 'cta_variant' } | null;
  creativeBrief: {
    angle: string;
    hook: string;
    copyDirection: string;
    visualOrVideoDirection: string;
    cta: string;
  } | null;
};

export type MetaAdsBriefContext = {
  objective: string;
  adSets: Array<{ name: string; dailyBudget: string | null; targeting: unknown; placements: unknown }>;
  creatives: Array<{ id: string; name: string; type: string; headline: string | null; primaryText: string | null; description: string | null; callToAction: string | null }>;
};

const ADS_BRIEF_KNOWLEDGE = renderSkillKnowledgeBundle(
  ['ads', 'product-marketing', 'ad-creative'],
  { maxCharsEach: 1_600 },
);

type MetaAdsBriefPolicy = {
  allowedActionTypes: MetaAdsBrief['actionType'][];
  actionPolicy: string;
};

function buildBriefPolicy(findings: AdsFinding[], campaignContext: MetaAdsBriefContext): MetaAdsBriefPolicy {
  const hasDailyBudgetEvidence = findings.some((finding) => finding.evidence.metric === 'daily_budget');
  const canTestCreative = findings.some((finding) => finding.kind === 'ctr_decline') && campaignContext.creatives.length > 0;
  const allowedActionTypes: MetaAdsBrief['actionType'][] = hasDailyBudgetEvidence
    ? ['review_budget', 'review_delivery']
    : ['review_delivery'];
  if (canTestCreative) allowedActionTypes.push('creative_test');
  return {
    allowedActionTypes,
    actionPolicy: `${hasDailyBudgetEvidence
      ? 'review_budget is allowed because daily_budget evidence is present. It means review the documented budget change only; it never means apply an automatic adjustment.'
      : 'review_budget is not allowed because no daily_budget evidence is present. A spend change is not budget evidence.'} ${canTestCreative
      ? 'creative_test is allowed only as a hypothesis because CTR declined and a synced creative is available.'
      : 'creative_test is not allowed: it requires both CTR-decline evidence and a synced creative.'}`,
  };
}

function renderRecommendedAction(actionType: MetaAdsBrief['actionType']): string {
  switch (actionType) {
    case 'review_budget':
      return 'Review the documented daily-budget change in Meta Ads Manager before making any manual decision.';
    case 'review_delivery':
      return 'Review the campaign delivery context in Meta Ads Manager before making a manual change.';
    case 'creative_test':
      return 'Test one new creative variation in Meta Ads Manager; treat the result as a hypothesis, not a proven cause.';
  }
}

function renderPossibleCause(findings: AdsFinding[]): string {
  return `${findings.map((finding) => finding.fact).join(' ')} This campaign-level evidence cannot isolate audience, delivery, or a specific creative as the cause.`;
}

export type MetaAdsBriefValidationContext = {
  sourceIds: Set<string>;
  campaignContext: MetaAdsBriefContext;
};

function buildKnownSourceIds(args: { findings: AdsFinding[]; brandContext: string; campaignContext: MetaAdsBriefContext }) {
  return [
    ...args.findings.map((finding) => finding.evidence.id),
    ...args.findings.flatMap((finding) => finding.relatedEvidence?.map((evidence) => evidence.id) || []),
    'campaign_context',
    ...args.campaignContext.creatives.map((creative) => `creative:${creative.id}`),
    ...(args.brandContext ? ['brand_iq'] : []),
  ];
}

export function buildMetaAdsBriefValidationContext(args: { findings: AdsFinding[]; brandContext: string; campaignContext: MetaAdsBriefContext }): MetaAdsBriefValidationContext {
  return { sourceIds: new Set(buildKnownSourceIds(args)), campaignContext: args.campaignContext };
}

/** Validates the LLM contract, not natural-language wording. */
export function validateMetaAdsBrief(brief: MetaAdsBrief, findings: AdsFinding[], context: MetaAdsBriefValidationContext): string[] {
  const policy = buildBriefPolicy(findings, context.campaignContext);
  const violations: string[] = [];
  if (!policy.allowedActionTypes.includes(brief.actionType)) {
    violations.push(`The action type "${brief.actionType}" is not allowed by the supplied evidence.`);
  }
  if (brief.grounding.actionSourceIds.length === 0 || brief.grounding.actionSourceIds.some((id) => !context.sourceIds.has(id))) {
    violations.push('The recommended action must cite known evidence, Brand IQ, or campaign context source IDs.');
  }
  const evidenceIdsFor = (predicate: (finding: AdsFinding) => boolean) => new Set(
    findings.filter(predicate).flatMap((finding) => [finding.evidence.id, ...(finding.relatedEvidence?.map((evidence) => evidence.id) || [])])
  );
  const hasRelevantEvidence = (ids: Set<string>) => brief.grounding.actionSourceIds.some((id) => ids.has(id));
  if (brief.actionType === 'creative_test' && !hasRelevantEvidence(evidenceIdsFor((finding) => finding.kind === 'ctr_decline'))) {
    violations.push('creative_test must cite CTR-decline evidence.');
  }
  if (brief.actionType === 'review_budget' && !hasRelevantEvidence(evidenceIdsFor((finding) => finding.evidence.metric === 'daily_budget'))) {
    violations.push('review_budget must cite daily-budget evidence.');
  }
  if (brief.actionType === 'review_delivery' && !hasRelevantEvidence(evidenceIdsFor(() => true))) {
    violations.push('review_delivery must cite negative-finding evidence.');
  }
  if (brief.creativeTest && !context.sourceIds.has(`creative:${brief.creativeTest.sourceCreativeId}`)) {
    violations.push('The creative test must reference a synced creative ID.');
  }
  if (brief.actionType === 'creative_test' && !brief.creativeTest) violations.push('creative_test requires a synced creative test.');
  if (brief.actionType !== 'creative_test' && brief.creativeTest) violations.push('Only creative_test may include a creative test.');
  return violations;
}

export class MetaAdsBriefGenerationError extends Error {
  constructor(public readonly violations: string[]) {
    super('Could not generate a policy-compliant recommendation. Try again.');
  }
}

function renderCreativeBrief(test: NonNullable<MetaAdsBrief['creativeTest']>, context: MetaAdsBriefContext): MetaAdsBrief['creativeBrief'] {
  const source = context.creatives.find((creative) => creative.id === test.sourceCreativeId);
  if (!source) return null;
  const message = source.headline || source.primaryText || source.name;
  const cta = source.callToAction || 'Review in Meta Ads Manager';
  if (test.type === 'format_variant') {
    return { angle: `Format variation of ${source.name}`, hook: message, copyDirection: source.primaryText || message, visualOrVideoDirection: `Test an alternate ${source.type} treatment while retaining the synced message.`, cta };
  }
  if (test.type === 'cta_variant') {
    return { angle: `CTA variation of ${source.name}`, hook: message, copyDirection: source.primaryText || message, visualOrVideoDirection: `Keep the synced ${source.type} creative context; test a CTA variation manually.`, cta };
  }
  return { angle: `Message variation of ${source.name}`, hook: `Reframe the current message: ${message}`, copyDirection: source.primaryText || message, visualOrVideoDirection: `Retain the synced ${source.type} format and test one message variation.`, cta };
}

function parseMetaAdsBrief(text: string, campaignContext: MetaAdsBriefContext, findings: AdsFinding[]): MetaAdsBrief | null {
  const result = extractJSON(text) as Partial<MetaAdsBrief> | null;
  if (!result
    || !['review_budget', 'review_delivery', 'creative_test'].includes(result.actionType as string)
    || !result.grounding || !Array.isArray(result.grounding.actionSourceIds)
    || (result.creativeTest !== null && (!result.creativeTest || typeof result.creativeTest.sourceCreativeId !== 'string'
      || !['message_variant', 'format_variant', 'cta_variant'].includes(result.creativeTest.type)))) return null;
  const creativeTest = result.creativeTest as MetaAdsBrief['creativeTest'];
  return {
    actionType: result.actionType as MetaAdsBrief['actionType'],
    possibleCause: renderPossibleCause(findings),
    recommendedAction: renderRecommendedAction(result.actionType as MetaAdsBrief['actionType']),
    grounding: result.grounding as MetaAdsBrief['grounding'],
    creativeTest,
    creativeBrief: creativeTest ? renderCreativeBrief(creativeTest, campaignContext) : null,
  };
}

/** Kept separate so the prompt contract can be tested without an LLM call. */
export function buildMetaAdsBriefPrompt(args: { targetName: string; findings: AdsFinding[]; brandContext: string; campaignContext: MetaAdsBriefContext }) {
  const policy = buildBriefPolicy(args.findings, args.campaignContext);
  const evidence = args.findings.map((finding) => ({
    kind: finding.kind,
    severity: finding.severity,
    fact: finding.fact,
    evidence: {
      metric: finding.evidence.metric,
      baseline: finding.evidence.baseline,
      current: finding.evidence.current,
      delta: finding.evidence.delta,
      percentChange: finding.evidence.percentChange,
      baselineWindow: finding.evidence.baselineWindow,
      currentWindow: finding.evidence.currentWindow,
      source: finding.evidence.source,
      sufficientData: finding.evidence.sufficientData,
    },
    relatedEvidence: finding.relatedEvidence?.map((related) => ({
      metric: related.metric, baseline: related.baseline, current: related.current,
      delta: related.delta, percentChange: related.percentChange,
    })) || [],
  }));
  return `Analyze the following Meta Ads evidence for campaign "${args.targetName}".

${args.brandContext || 'No Brand IQ is available. Keep the recommendation product-neutral.'}

CAMPAIGN AND CURRENT CREATIVE CONTEXT (use this to make a concrete brief, not as performance evidence):
${JSON.stringify(args.campaignContext, null, 2)}

EVIDENCE (facts only; do not invent additional metrics):
${JSON.stringify(evidence, null, 2)}

EVIDENCE-DERIVED ACTION POLICY:
${policy.actionPolicy}

ALLOWED ACTION TYPES: ${JSON.stringify(policy.allowedActionTypes)}
KNOWN GROUNDING SOURCE IDS: ${JSON.stringify([
  ...buildKnownSourceIds(args),
])}

Return valid JSON only using exactly this shape:
{
  "actionType": "review_budget | review_delivery | creative_test",
  "grounding": {
    "actionSourceIds": ["known source IDs supporting the action"]
  },
  "creativeTest": { "sourceCreativeId": "one synced creative ID", "type": "message_variant | format_variant | cta_variant" } | null
}

Rules:
- Never call spend a budget change unless the supplied evidence metric is daily_budget.
- The server renders the possible cause from supplied evidence; do not add a possibleCause field.
- Do not introduce metrics or outcomes absent from evidence (for example bounce rate, revenue, CPA, ROAS, conversion quality, or audience quality).
- Do not invent testimonials, customer proof, success metrics, certifications, offers, discounts, or product claims unless they appear in Brand IQ or the supplied current creative context.
- actionType must be one of ALLOWED ACTION TYPES. The server renders the user-facing action from it; do not add a recommendedAction field. Do not recommend targeting changes unless targeting evidence is supplied.
- You may use current headlines, copy, CTA, format, and Brand IQ to propose a new creative test. Never claim a specific current creative is the cause unless evidence isolates that creative.
- Do not claim that an action was applied, do not predict results, and do not instruct any Meta API mutation.
- If creative is relevant, return creativeTest with one synced creative ID and a test type. Do not return creativeBrief or invent copy; the server renders it from the synced creative. If creative is not relevant, return creativeTest as null.

${ADS_BRIEF_KNOWLEDGE}`;
}

export async function generateMetaAdsBrief(companyId: string, args: { targetName: string; findings: AdsFinding[]; campaignContext: MetaAdsBriefContext }): Promise<MetaAdsBrief | null> {
  if (args.findings.length === 0) return null;
  const brandIq = await getActiveBrandIq(companyId);
  const brandContext = brandIq ? renderBrandIqContext(brandIq) : '';
  const prompt = buildMetaAdsBriefPrompt({
    targetName: args.targetName,
    findings: args.findings,
    brandContext,
    campaignContext: args.campaignContext,
  });
  const validationContext = buildMetaAdsBriefValidationContext({
    findings: args.findings,
    brandContext,
    campaignContext: args.campaignContext,
  });
  const messages: LLMMessage[] = [
    { role: 'system' as const, content: 'You are a cautious Meta Ads analyst. Return valid JSON only.' },
    { role: 'user' as const, content: prompt },
  ];
  let lastViolations = ['The model did not return a response.'];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await llmGenerate(messages, {
      featureKey: 'meta_ads_analysis', maxTokens: 700, json: true,
      traceName: attempt === 0 ? 'meta_ads.analysis' : 'meta_ads.analysis.retry',
    });
    const brief = parseMetaAdsBrief(response.text, args.campaignContext, args.findings);
    const violations = brief ? validateMetaAdsBrief(brief, args.findings, validationContext) : ['The response did not match the required JSON shape.'];
    lastViolations = violations;
    if (brief && violations.length === 0) return brief;
    if (attempt === 0) {
      messages.push({ role: 'assistant', content: response.text });
      messages.push({ role: 'user', content: `Your previous JSON is not safe to use: ${violations.join(' ')} Return a corrected replacement JSON only; preserve the required shape and follow the evidence-derived action policy.` });
    }
  }
  console.warn('[MetaAdsBrief] policy-compliant generation failed', {
    companyId,
    attempts: 2,
    violations: lastViolations,
  });
  throw new MetaAdsBriefGenerationError(lastViolations);
}
