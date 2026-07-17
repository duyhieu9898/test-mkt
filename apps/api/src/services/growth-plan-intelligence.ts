import type { BusinessPlan, GrowthMasterPlan } from '@1person/core/db';

const DAY = 86_400_000;
const MONITOR_AFTER_DAYS = 45;
const REVIEW_AFTER_DAYS = 90;

export type GrowthPlanHealthStatus =
  | 'missing'
  | 'draft'
  | 'fresh'
  | 'monitor'
  | 'update_recommended';

export interface GrowthPlanSignal {
  id: string;
  sourceType: string;
  label: string;
  detail: string;
  occurredAt?: string;
  link?: string;
}

export interface GrowthPlanHealth {
  status: GrowthPlanHealthStatus;
  version: number;
  baselineAt: string | null;
  ageDays: number | null;
  score: number;
  reasons: string[];
  signalIds: string[];
  newSignals: number;
}

function timestamp(value?: string): number | null {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function signalWeight(sourceType: string): number {
  switch (sourceType) {
    case 'market':
      return 3;
    case 'learning':
      return 2;
    case 'brain':
    case 'business':
      return 2;
    case 'campaign':
    case 'blog':
    case 'landing_page':
    case 'sales':
      return 1;
    default:
      return 0;
  }
}

function signalReason(signal: GrowthPlanSignal): string {
  switch (signal.sourceType) {
    case 'market':
      return `New market insight: ${signal.detail}`;
    case 'learning':
      return `New campaign learning: ${signal.detail}`;
    case 'brain':
      return `Business knowledge changed: ${signal.label}`;
    case 'business':
      return `Business strategy input changed: ${signal.label}`;
    case 'campaign':
      return `Campaign activity changed since this plan was approved: ${signal.label}`;
    case 'blog':
      return `Content activity changed since this plan was approved: ${signal.label}`;
    case 'landing_page':
      return `Landing-page activity changed since this plan was approved: ${signal.label}`;
    case 'sales':
      return `A sales signal may affect current priorities: ${signal.label}`;
    default:
      return signal.detail;
  }
}

export function assessGrowthPlanHealth(args: {
  businessPlan: BusinessPlan | null | undefined;
  signals?: GrowthPlanSignal[];
  now?: Date;
}): GrowthPlanHealth {
  const { businessPlan, signals = [], now = new Date() } = args;
  const plan = businessPlan?.growthPlan;
  const currentVersion = businessPlan?.growthPlanVersion ?? (plan ? 1 : 0);
  const draft = businessPlan?.growthPlanDraft;
  const version = draft?.version ?? currentVersion;

  if (draft) {
    return {
      status: 'draft',
      version,
      baselineAt: draft.generatedAt,
      ageDays: Math.max(
        0,
        Math.floor((now.getTime() - new Date(draft.generatedAt).getTime()) / DAY),
      ),
      score: 0,
      reasons: draft.updateReasons.length > 0
        ? draft.updateReasons
        : ['This Growth Plan version is waiting for your review and approval.'],
      signalIds: [],
      newSignals: 0,
    };
  }

  if (!plan) {
    return {
      status: 'missing',
      version,
      baselineAt: null,
      ageDays: null,
      score: 0,
      reasons: ['No Growth Plan has been created yet.'],
      signalIds: [],
      newSignals: 0,
    };
  }

  const approvedAt = timestamp(businessPlan?.growthPlanApprovedAt);
  const generatedAt = timestamp(businessPlan?.growthPlanGeneratedAt);
  const baseline = approvedAt ?? generatedAt;
  const baselineAt = baseline ? new Date(baseline).toISOString() : null;
  const ageDays = baseline
    ? Math.max(0, Math.floor((now.getTime() - baseline) / DAY))
    : null;

  if (!approvedAt) {
    return {
      status: 'draft',
      version,
      baselineAt,
      ageDays,
      score: 0,
      reasons: ['This Growth Plan version is waiting for your review and approval.'],
      signalIds: [],
      newSignals: 0,
    };
  }

  const newerSignals = signals
    .map((signal) => ({ signal, occurredAt: timestamp(signal.occurredAt) }))
    .filter((entry) => entry.occurredAt !== null && entry.occurredAt > approvedAt)
    .filter((entry) => signalWeight(entry.signal.sourceType) > 0)
    .sort((left, right) => {
      const weightDifference = signalWeight(right.signal.sourceType)
        - signalWeight(left.signal.sourceType);
      return weightDifference || (right.occurredAt! - left.occurredAt!);
    });

  const score = newerSignals.reduce(
    (total, entry) => total + signalWeight(entry.signal.sourceType),
    0,
  );
  const reasons: string[] = [];

  if (ageDays !== null && ageDays >= REVIEW_AFTER_DAYS) {
    reasons.push(`The current plan was approved ${ageDays} days ago.`);
  }
  for (const entry of newerSignals) {
    const reason = signalReason(entry.signal);
    if (!reasons.includes(reason)) reasons.push(reason);
    if (reasons.length >= 3) break;
  }

  const updateRecommended = score >= 3
    || (ageDays !== null && ageDays >= REVIEW_AFTER_DAYS);
  const shouldMonitor = score > 0
    || (ageDays !== null && ageDays >= MONITOR_AFTER_DAYS);

  return {
    status: updateRecommended ? 'update_recommended' : shouldMonitor ? 'monitor' : 'fresh',
    version,
    baselineAt,
    ageDays,
    score,
    reasons: reasons.length > 0
      ? reasons
      : ['The current strategy still matches the latest available company data.'],
    signalIds: newerSignals.slice(0, 6).map((entry) => entry.signal.id),
    newSignals: newerSignals.length,
  };
}

export function createGrowthPlanVersion(args: {
  businessPlan: BusinessPlan;
  plan: GrowthMasterPlan;
  reasons: string[];
  generatedAt?: Date;
}): BusinessPlan {
  const generatedAt = (args.generatedAt ?? new Date()).toISOString();
  const currentPlan = args.businessPlan.growthPlan;
  const currentVersion = args.businessPlan.growthPlanVersion ?? (currentPlan ? 1 : 0);
  const nextVersion = args.businessPlan.growthPlanDraft?.version
    ?? (currentPlan && args.businessPlan.growthPlanApprovedAt
      ? currentVersion + 1
      : Math.max(1, currentVersion));

  return {
    ...args.businessPlan,
    growthPlanDraft: {
      version: nextVersion,
      plan: args.plan,
      generatedAt,
      updateReasons: args.reasons.slice(0, 5),
    },
  };
}

export function approveGrowthPlanVersion(args: {
  businessPlan: BusinessPlan;
  approvedAt?: Date;
}): BusinessPlan {
  const approvedAt = (args.approvedAt ?? new Date()).toISOString();
  const draft = args.businessPlan.growthPlanDraft;
  if (!draft) {
    return {
      ...args.businessPlan,
      growthPlanVersion: args.businessPlan.growthPlanVersion ?? 1,
      growthPlanGeneratedAt: args.businessPlan.growthPlanGeneratedAt ?? approvedAt,
      growthPlanApprovedAt: approvedAt,
    };
  }

  const history = [...(args.businessPlan.growthPlanHistory ?? [])];
  if (args.businessPlan.growthPlan && args.businessPlan.growthPlanApprovedAt) {
    history.push({
      version: args.businessPlan.growthPlanVersion ?? 1,
      plan: args.businessPlan.growthPlan,
      generatedAt: args.businessPlan.growthPlanGeneratedAt,
      approvedAt: args.businessPlan.growthPlanApprovedAt,
      updateReasons: args.businessPlan.growthPlanUpdateReasons,
    });
  }

  return {
    ...args.businessPlan,
    growthPlan: draft.plan,
    growthPlanVersion: draft.version,
    growthPlanGeneratedAt: draft.generatedAt,
    growthPlanApprovedAt: approvedAt,
    growthPlanUpdateReasons: draft.updateReasons,
    growthPlanHistory: history.slice(-10),
    growthPlanDraft: undefined,
  };
}
