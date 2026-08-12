export type MetaAction = { action_type?: string; value?: string };

export type PrimaryResult = {
  type: 'lead' | 'purchase' | 'registration' | 'link_click' | 'unknown';
  count: number | null;
  sourceActionTypes: string[];
  isSupported: boolean;
};

type SupportedObjective = 'leads' | 'sales' | 'conversions' | 'traffic';

const ACTION_TYPES: Record<Exclude<PrimaryResult['type'], 'unknown'>, readonly string[]> = {
  lead: ['lead', 'onsite_conversion.lead_grouped', 'offsite_conversion.lead', 'offsite_conversion.fb_pixel_lead'],
  purchase: ['purchase', 'omni_purchase', 'offsite_conversion.purchase', 'offsite_conversion.fb_pixel_purchase'],
  registration: ['complete_registration', 'offsite_conversion.complete_registration', 'offsite_conversion.fb_pixel_complete_registration'],
  link_click: ['link_click'],
};

function actionCount(action: MetaAction) {
  const value = Number(action.value || 0);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function matchedActions(actions: MetaAction[], type: Exclude<PrimaryResult['type'], 'unknown'>) {
  const allowed = ACTION_TYPES[type];
  return actions.filter((action) => action.action_type != null && allowed.includes(action.action_type));
}

/**
 * Maps one explicitly-supported Meta action family to the campaign objective.
 * It intentionally fails closed when a conversions campaign reports multiple
 * supported result families, because V1 has no reliable KPI selection rule.
 */
export function extractMetaPrimaryResult(args: { objective: string | null | undefined; actions: MetaAction[] | null | undefined }): PrimaryResult {
  const objective = args.objective as SupportedObjective | undefined;
  const actions = args.actions || [];
  const candidateTypes: Exclude<PrimaryResult['type'], 'unknown'>[] = objective === 'leads'
    ? ['lead']
    : objective === 'sales'
      ? ['purchase']
      : objective === 'traffic'
        ? ['link_click']
        : objective === 'conversions'
          ? ['lead', 'purchase', 'registration']
          : [];

  if (candidateTypes.length === 0) {
    return { type: 'unknown', count: null, sourceActionTypes: [], isSupported: false };
  }

  // These objectives declare one V1-supported result family even when Meta
  // reports no actions in a window. A zero result is still distinct from an
  // unknown result, while cost-per-result safely remains null.
  if (candidateTypes.length === 1) {
    const type = candidateTypes[0]!;
    const matched = matchedActions(actions, type);
    return {
      type,
      count: matched.reduce((total, action) => total + actionCount(action), 0),
      sourceActionTypes: matched.map((action) => action.action_type!),
      isSupported: true,
    };
  }

  const matches = candidateTypes
    .map((type) => ({ type, actions: matchedActions(actions, type) }))
    .filter((candidate) => candidate.actions.length > 0);

  if (matches.length !== 1) {
    return { type: 'unknown', count: null, sourceActionTypes: [], isSupported: false };
  }

  const match = matches[0];
  if (!match) return { type: 'unknown', count: null, sourceActionTypes: [], isSupported: false };
  return {
    type: match.type,
    count: match.actions.reduce((total, action) => total + actionCount(action), 0),
    sourceActionTypes: match.actions.map((action) => action.action_type!),
    isSupported: true,
  };
}

export function calculateCostPerPrimaryResult(spend: number, resultCount: number | null) {
  if (resultCount == null || resultCount <= 0) return null;
  return spend / resultCount;
}
