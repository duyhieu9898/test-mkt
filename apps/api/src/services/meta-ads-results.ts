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

export type MetaAdSetMeasurementInput = {
  optimizationGoal?: string | null;
  promotedObject?: Record<string, unknown> | null;
  billingEvent?: string | null;
  destinationType?: string | null;
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

function promotedEvent(promotedObject: Record<string, unknown> | null | undefined) {
  const value = promotedObject?.custom_event_type;
  return typeof value === 'string' ? value.toUpperCase() : undefined;
}

/** The only place Meta objective, optimization, and event semantics become a V1 result type. */
export function derivePrimaryResultType(input: { campaignObjective: string | null | undefined } & MetaAdSetMeasurementInput): Pick<MetaMeasurementContext, 'resultType' | 'isSupported' | 'reason'> {
  const normalizedObjective = input.campaignObjective?.toLowerCase() || '';
  const optimizationGoal = input.optimizationGoal?.toUpperCase();
  if (normalizedObjective === 'leads' && (optimizationGoal === 'LEAD_GENERATION' || optimizationGoal === 'QUALITY_LEAD')) return { resultType: 'lead', isSupported: true };
  if (normalizedObjective === 'traffic' && optimizationGoal === 'LINK_CLICKS') return { resultType: 'link_click', isSupported: true };
  if (normalizedObjective === 'traffic' && optimizationGoal === 'LANDING_PAGE_VIEWS') return { resultType: 'unknown', isSupported: false, reason: 'Landing-page-view optimization is not a supported V1 action result.' };
  if (normalizedObjective === 'conversions' && optimizationGoal === 'COMPLETE_REGISTRATION') return { resultType: 'registration', isSupported: true };
  if (normalizedObjective === 'sales' && optimizationGoal === 'PURCHASE') return { resultType: 'purchase', isSupported: true };
  if (normalizedObjective === 'sales' && (optimizationGoal === 'OFFSITE_CONVERSIONS' || optimizationGoal === 'VALUE')) {
    if (promotedEvent(input.promotedObject) === 'PURCHASE') return { resultType: 'purchase', isSupported: true };
    return { resultType: 'unknown', isSupported: false, reason: 'Conversion/value optimization requires an unambiguous PURCHASE promoted-object event.' };
  }
  return { resultType: 'unknown', isSupported: false, reason: optimizationGoal ? 'Objective and optimization goal do not identify one supported result.' : 'No optimization goal is available for this live campaign.' };
}

/** Objective is necessary but a live KPI is supported only when its ad-set
 * optimization context agrees. This deliberately fails closed. */
export function createMetaMeasurementContext(args: { campaignObjective: string | null | undefined; optimizationGoals?: readonly string[] | null; fixtureResultType?: PrimaryResultType } & MetaAdSetMeasurementInput): MetaMeasurementContext {
  const goals = normalizedGoals(args.optimizationGoals || (args.optimizationGoal ? [args.optimizationGoal] : []));
  if (args.fixtureResultType && args.fixtureResultType !== 'unknown') {
    return { campaignObjective: args.campaignObjective || null, optimizationGoals: goals, resultType: args.fixtureResultType, isSupported: true };
  }
  const result = derivePrimaryResultType({ ...args, optimizationGoal: args.optimizationGoal || goals[0] });
  return { campaignObjective: args.campaignObjective || null, optimizationGoals: goals, ...result };
}

export function createCampaignMeasurementContext(args: { campaignObjective: string | null | undefined; adSets: readonly MetaAdSetMeasurementInput[]; fixtureResultType?: PrimaryResultType }): MetaMeasurementContext {
  if (args.fixtureResultType) return createMetaMeasurementContext({ campaignObjective: args.campaignObjective, fixtureResultType: args.fixtureResultType });
  const contexts = args.adSets.map((adSet) => createMetaMeasurementContext({ campaignObjective: args.campaignObjective, ...adSet }));
  if (contexts.length === 0) return createMetaMeasurementContext({ campaignObjective: args.campaignObjective });
  if (contexts.some((context) => !context.isSupported) || new Set(contexts.map((context) => context.resultType)).size !== 1) {
    return { campaignObjective: args.campaignObjective || null, optimizationGoals: normalizedGoals(args.adSets.map((adSet) => adSet.optimizationGoal || '').filter(Boolean)), resultType: 'unknown', isSupported: false, reason: 'Ad-set optimization contexts are unsupported or ambiguous for one campaign result.' };
  }
  return contexts[0]!;
}

export function isMeasurementRelevantAdSet(status: string | null | undefined) {
  return status?.toLowerCase() !== 'archived';
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
