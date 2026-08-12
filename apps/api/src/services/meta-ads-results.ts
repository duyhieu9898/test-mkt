export type MetaAction = { action_type?: string; value?: string };

export type PrimaryResultType = 'lead' | 'purchase' | 'registration' | 'link_click' | 'unknown';
export type PrimaryResult = {
  type: PrimaryResultType;
  count: number | null;
  /** The one Meta representation selected by documented precedence. */
  sourceActionTypes: string[];
  isSupported: boolean;
};

export type MetaMeasurementContext = {
  campaignObjective: string | null;
  optimizationGoals: string[];
  resultType: PrimaryResultType;
  isSupported: boolean;
  reason?: string;
};

// Meta can report one event through several equivalent action names. They are
// alternatives, never additive sources. First match wins, deterministically.
export const ACTION_PRECEDENCE: Record<Exclude<PrimaryResultType, 'unknown'>, readonly string[]> = {
  lead: ['lead', 'onsite_conversion.lead_grouped', 'offsite_conversion.lead', 'offsite_conversion.fb_pixel_lead'],
  purchase: ['purchase', 'offsite_conversion.fb_pixel_purchase', 'offsite_conversion.purchase', 'omni_purchase'],
  registration: ['complete_registration', 'offsite_conversion.fb_pixel_complete_registration', 'offsite_conversion.complete_registration'],
  link_click: ['link_click'],
};

function normalizedGoals(goals: readonly string[] | null | undefined) {
  return [...new Set((goals || []).filter(Boolean).map((goal) => goal.toUpperCase()))];
}

function supportedType(objective: string | null | undefined, goals: string[]): PrimaryResultType {
  const normalizedObjective = objective?.toLowerCase() || '';
  const compatible = (needle: string) => goals.some((goal) => goal.includes(needle));
  if (normalizedObjective === 'leads' && compatible('LEAD')) return 'lead';
  if (normalizedObjective === 'sales' && compatible('PURCHASE')) return 'purchase';
  if (normalizedObjective === 'traffic' && compatible('LINK_CLICK')) return 'link_click';
  if (normalizedObjective === 'conversions' && compatible('COMPLETE_REGISTRATION')) return 'registration';
  return 'unknown';
}

/** Objective is necessary but a live KPI is supported only when its ad-set
 * optimization context agrees. This deliberately fails closed. */
export function createMetaMeasurementContext(args: { campaignObjective: string | null | undefined; optimizationGoals?: readonly string[] | null; fixtureResultType?: PrimaryResultType }): MetaMeasurementContext {
  const goals = normalizedGoals(args.optimizationGoals);
  if (args.fixtureResultType && args.fixtureResultType !== 'unknown') {
    return { campaignObjective: args.campaignObjective || null, optimizationGoals: goals, resultType: args.fixtureResultType, isSupported: true };
  }
  const resultType = supportedType(args.campaignObjective, goals);
  return resultType === 'unknown'
    ? { campaignObjective: args.campaignObjective || null, optimizationGoals: goals, resultType, isSupported: false, reason: goals.length ? 'Objective and optimization goal do not identify one supported result.' : 'No optimization goal is available for this live campaign.' }
    : { campaignObjective: args.campaignObjective || null, optimizationGoals: goals, resultType, isSupported: true };
}

export function createCampaignMeasurementContext(args: { campaignObjective: string | null | undefined; adSetOptimizationGoals: readonly (readonly string[] | null | undefined)[]; fixtureResultType?: PrimaryResultType }): MetaMeasurementContext {
  if (args.fixtureResultType) return createMetaMeasurementContext({ campaignObjective: args.campaignObjective, fixtureResultType: args.fixtureResultType });
  const contexts = args.adSetOptimizationGoals.map((goals) => createMetaMeasurementContext({ campaignObjective: args.campaignObjective, optimizationGoals: goals }));
  if (contexts.length === 0) return createMetaMeasurementContext({ campaignObjective: args.campaignObjective });
  if (contexts.some((context) => !context.isSupported) || new Set(contexts.map((context) => context.resultType)).size !== 1) {
    return { campaignObjective: args.campaignObjective || null, optimizationGoals: normalizedGoals(args.adSetOptimizationGoals.flatMap((goals) => goals || [])), resultType: 'unknown', isSupported: false, reason: 'Ad-set optimization goals are unsupported or ambiguous for one campaign result.' };
  }
  return contexts[0]!;
}

function actionCount(action: MetaAction) {
  const value = Number(action.value || 0);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

export function selectPreferredAction(actions: MetaAction[], type: Exclude<PrimaryResultType, 'unknown'>) {
  for (const actionType of ACTION_PRECEDENCE[type]) {
    const action = actions.find((candidate) => candidate.action_type === actionType);
    if (action) return { count: actionCount(action), selectedActionType: actionType };
  }
  return { count: 0, selectedActionType: undefined };
}

export function extractMetaPrimaryResult(args: { context?: MetaMeasurementContext; objective?: string | null; actions: MetaAction[] | null | undefined; fixtureResultType?: PrimaryResultType }): PrimaryResult {
  const context = args.context || createMetaMeasurementContext({ campaignObjective: args.objective, fixtureResultType: args.fixtureResultType });
  if (!context.isSupported || context.resultType === 'unknown') return { type: 'unknown', count: null, sourceActionTypes: [], isSupported: false };
  const selected = selectPreferredAction(args.actions || [], context.resultType);
  return { type: context.resultType, count: selected.count, sourceActionTypes: selected.selectedActionType ? [selected.selectedActionType] : [], isSupported: true };
}

export function calculateCostPerPrimaryResult(spend: number, resultCount: number | null) {
  if (resultCount == null || resultCount <= 0) return null;
  return spend / resultCount;
}

export function legacyConversionCount(result: PrimaryResult) {
  return result.isSupported && result.type !== 'link_click' ? Math.round(result.count || 0) : 0;
}
