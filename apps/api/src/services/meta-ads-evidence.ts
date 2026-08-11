export type MetaMetricName = 'spend' | 'impressions' | 'clicks' | 'ctr' | 'conversions';

export type MetricSnapshot = {
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  /** Percentage, for example 1.25 means 1.25%. */
  ctr: number;
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
  kind: 'spend_increase' | 'budget_increase' | 'ctr_decline';
  severity: 'high' | 'medium';
  evidence: AdsEvidence;
  /** Supporting facts caused by the same event; not a separate alert. */
  relatedEvidence?: AdsEvidence[];
  /** A deterministic fact. Any causal explanation belongs to the AI layer. */
  fact: string;
};

export const MIN_IMPRESSIONS_FOR_ANALYSIS = 1_000;

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
export function detectAdsFindings(input: FindingInput): AdsFinding[] {
  const findings: AdsFinding[] = [];
  const spend = metricEvidence(input, 'spend', input.baseline.spend, input.current.spend, 'Spend');
  // Without enough delivery, percentage movements are too volatile for an AI
  // recommendation. The UI presents this as INSUFFICIENT_DATA instead.
  if (!spend.sufficientData) return findings;
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
    findings.push({
      kind: 'spend_increase', severity: spend.percentChange >= 100 ? 'high' : 'medium', evidence: spend,
      fact: `Spend increased by ${spend.percentChange.toFixed(1)}% between the selected windows.`,
    });
  }

  const ctr = metricEvidence(input, 'ctr', input.baseline.ctr, input.current.ctr, 'CTR');
  if (ctr.percentChange !== null && ctr.percentChange <= -30 && ctr.sufficientData) {
    findings.push({
      kind: 'ctr_decline',
      severity: ctr.percentChange <= -50 ? 'high' : 'medium',
      evidence: ctr,
      fact: `CTR decreased by ${Math.abs(ctr.percentChange).toFixed(1)}% between the selected windows.`,
    });
  }
  return findings;
}
