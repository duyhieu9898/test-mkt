import { calculateCostPerPrimaryResult, type PrimaryResult } from './meta-ads-results';

export type MetaMetricName = 'spend' | 'impressions' | 'clicks' | 'ctr' | 'conversions' | 'cost_per_result' | 'primary_result';

export type MetricSnapshot = {
  spend: number;
  impressions: number;
  clicks: number;
  /** Retained for legacy dashboard metrics; diagnosis uses primaryResult only. */
  conversions?: number;
  /** Percentage, for example 1.25 means 1.25%. */
  ctr: number;
  primaryResult: PrimaryResult;
  costPerResult: number | null;
  dailyBudget?: number | null;
};

export type EvidenceWindow = { start: string; end: string; timezone: string };

export type AdsEvidence = {
  id: string;
  target: 'campaign' | 'ad_set' | 'ad';
  targetId: string;
  metric: MetaMetricName | 'daily_budget';
  baseline: number;
  current: number;
  delta: number;
  percentChange: number | null;
  baselineWindow: EvidenceWindow;
  currentWindow: EvidenceWindow;
  source: 'meta_insights' | 'development_fixture';
  sufficientData: boolean;
  label: string;
};

export type AdsFinding = {
  kind: 'budget_increase' | 'ctr_decline' | 'cost_per_result_increase' | 'primary_result_decline';
  severity: 'high' | 'medium';
  evidence: AdsEvidence;
  /** Supporting facts caused by the same event; not a separate alert. */
  relatedEvidence?: AdsEvidence[];
  /** A deterministic fact. Any causal explanation belongs to the AI layer. */
  fact: string;
};

export type AdsObservation = {
  kind: 'spend_increase';
  evidence: AdsEvidence;
  fact: string;
};

export type AdsEvidenceResult = { observations: AdsObservation[]; findings: AdsFinding[] };

export const MIN_IMPRESSIONS_FOR_ANALYSIS = 1_000;
/** Require a substantial baseline before treating a CTR movement as actionable. */
export const MIN_BASELINE_CLICKS_FOR_CTR = 30;
export const MIN_RESULTS_FOR_EFFICIENCY = 5;
export const MIN_CURRENT_IMPRESSIONS_FOR_RESULT_DECLINE = 1_000;
export const MIN_CURRENT_SPEND_SHARE_FOR_RESULT_DECLINE = 0.5;

type FindingInput = {
  target: AdsEvidence['target'];
  targetId: string;
  baseline: MetricSnapshot;
  current: MetricSnapshot;
  baselineWindow: EvidenceWindow;
  currentWindow: EvidenceWindow;
  source?: AdsEvidence['source'];
};

function comparison(baseline: number, current: number) {
  const delta = current - baseline;
  return { delta, percentChange: baseline > 0 ? (delta / baseline) * 100 : null };
}

function metricEvidence(input: FindingInput, metric: AdsEvidence['metric'], baseline: number, current: number, label: string): AdsEvidence {
  const { delta, percentChange } = comparison(baseline, current);
  return {
    id: `${input.target}:${input.targetId}:${metric}:${input.baselineWindow.start}:${input.currentWindow.end}`,
    target: input.target,
    targetId: input.targetId,
    metric,
    baseline,
    current,
    delta,
    percentChange,
    baselineWindow: input.baselineWindow,
    currentWindow: input.currentWindow,
    source: input.source || 'meta_insights',
    sufficientData: input.baseline.impressions >= MIN_IMPRESSIONS_FOR_ANALYSIS
      && input.current.impressions >= MIN_IMPRESSIONS_FOR_ANALYSIS,
    label,
  };
}

/**
 * Creates only fact-based findings. The thresholds are intentionally
 * conservative: an LLM never invents a trend when the two supplied windows
 * don't support one.
 */
export function detectAdsEvidence(input: FindingInput): AdsEvidenceResult {
  const findings: AdsFinding[] = [];
  const observations: AdsObservation[] = [];
  const spend = metricEvidence(input, 'spend', input.baseline.spend, input.current.spend, 'Spend');
  // Without enough delivery, percentage movements are too volatile for an AI
  // recommendation. The UI presents this as INSUFFICIENT_DATA instead.
  if (!spend.sufficientData) return { observations, findings };
  let budgetFindingCreated = false;
  if (input.baseline.dailyBudget != null && input.current.dailyBudget != null) {
    const budget = metricEvidence(input, 'daily_budget', input.baseline.dailyBudget, input.current.dailyBudget, 'Daily budget');
    if (budget.percentChange !== null && budget.percentChange >= 50) {
      findings.push({
        kind: 'budget_increase',
        severity: budget.percentChange >= 100 ? 'high' : 'medium',
        evidence: budget,
        relatedEvidence: spend.percentChange !== null && spend.percentChange >= 50 ? [spend] : undefined,
        fact: `Daily budget increased by ${budget.percentChange.toFixed(1)}% between the selected windows.${spend.percentChange !== null && spend.percentChange >= 50 ? ` Spend also increased by ${spend.percentChange.toFixed(1)}% in the same period.` : ''}`,
      });
      budgetFindingCreated = true;
    }
  }

  if (!budgetFindingCreated && spend.percentChange !== null && spend.percentChange >= 50) {
    observations.push({
      kind: 'spend_increase', evidence: spend,
      fact: `Spend increased by ${spend.percentChange.toFixed(1)}% between the selected windows.`,
    });
  }

  const ctr = metricEvidence(input, 'ctr', input.baseline.ctr, input.current.ctr, 'CTR');
  if (ctr.percentChange !== null && ctr.percentChange <= -29.999999 && ctr.sufficientData
    && input.baseline.clicks >= MIN_BASELINE_CLICKS_FOR_CTR) {
    findings.push({
      kind: 'ctr_decline',
      severity: ctr.percentChange <= -50 ? 'high' : 'medium',
      evidence: ctr,
      fact: `CTR decreased by ${Math.abs(ctr.percentChange).toFixed(1)}% between the selected windows.`,
    });
  }

  const baselineResult = input.baseline.primaryResult;
  const currentResult = input.current.primaryResult;
  const sameSupportedResult = baselineResult.isSupported && currentResult.isSupported
    && baselineResult.type === currentResult.type;
  const baselineCost = calculateCostPerPrimaryResult(input.baseline.spend, baselineResult.count);
  const currentCost = calculateCostPerPrimaryResult(input.current.spend, currentResult.count);
  const resultDecline = sameSupportedResult
    && (baselineResult.count || 0) >= MIN_RESULTS_FOR_EFFICIENCY
    && input.current.impressions >= MIN_CURRENT_IMPRESSIONS_FOR_RESULT_DECLINE
    && input.baseline.spend > 0
    && input.current.spend >= input.baseline.spend * MIN_CURRENT_SPEND_SHARE_FOR_RESULT_DECLINE
    ? metricEvidence(input, 'primary_result', baselineResult.count || 0, currentResult.count || 0, `Results: ${baselineResult.type.replaceAll('_', ' ')}`)
    : undefined;
  const severeResultDecline = resultDecline?.percentChange != null && resultDecline.percentChange <= -50;
  if (severeResultDecline && resultDecline) {
    findings.push({
      kind: 'primary_result_decline',
      severity: resultDecline.percentChange! <= -80 ? 'high' : 'medium',
      evidence: resultDecline,
      fact: `Tracked ${baselineResult.type.replaceAll('_', ' ')}s decreased from ${baselineResult.count} to ${currentResult.count} while meaningful delivery continued.`,
    });
  }
  if (sameSupportedResult
    && (baselineResult.count || 0) >= MIN_RESULTS_FOR_EFFICIENCY
    && (currentResult.count || 0) >= MIN_RESULTS_FOR_EFFICIENCY
    && baselineCost !== null
    && currentCost !== null) {
    const costPerResult = metricEvidence(input, 'cost_per_result', baselineCost, currentCost, `Cost per ${baselineResult.type.replaceAll('_', ' ')}`);
    if (!severeResultDecline && costPerResult.percentChange !== null && costPerResult.percentChange >= 30) {
      findings.push({
        kind: 'cost_per_result_increase',
        severity: costPerResult.percentChange >= 50 ? 'high' : 'medium',
        evidence: costPerResult,
        fact: `Cost per ${baselineResult.type.replaceAll('_', ' ')} increased by ${costPerResult.percentChange.toFixed(1)}% between the selected windows.`,
      });
    }
  }
  return { observations, findings };
}

/** Compatibility entry point for callers that need only negative findings. */
export function detectAdsFindings(input: FindingInput): AdsFinding[] {
  return detectAdsEvidence(input).findings;
}
