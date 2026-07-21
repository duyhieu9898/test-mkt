/**
 * CEO Advisor - evidence-grounded Chief of Staff brief generator.
 *
 * The context builder owns data collection and source health. This service
 * asks the model to reason over a bounded evidence pack, then validates every
 * citation and navigation target before the brief is persisted.
 */

import { llmGenerate, extractJSON } from '../lib/llm';
import type {
  BriefAction,
  BriefAlert,
  BriefEvidence,
  BriefWin,
  CampaignProposal,
  AdvisorTeamTask,
  AdvisorBriefInput,
} from '@1person/ai-tenant';
import {
  buildAdvisorContext,
  type AdvisorEvidence,
  type AdvisorSourceHealth,
  type AdvisorTeamMember,
} from './advisor-context-builder';
import { chargeFixedCredits, ensureSufficientCredits } from '../lib/credits';
import { ensureTenantForCompany, getTenantAI } from '../lib/tenant-ai';
import {
  buildContentLanguageInstruction,
  normalizeContentLanguage,
  type ContentLanguage,
} from '../lib/language';

export interface GeneratedBrief extends AdvisorBriefInput {
  headline: string;
  actions: BriefAction[];
  wins: BriefWin[];
  alerts: BriefAlert[];
  sourcesUsed: {
    campaignsCount: number;
    blogsCount: number;
    landingPagesCount: number;
    dealsCount: number;
    marketScansCount: number;
    learningsCount: number;
    brainEventsCount: number;
    sourceHealth: AdvisorSourceHealth[];
  };
  model: string;
  traceId: string | null;
}

const VALID_SEVERITY = new Set(['critical', 'high', 'medium', 'low']);
const VALID_CONFIDENCE = new Set(['high', 'medium', 'low']);
const VALID_ACTION_KIND = new Set(['campaign', 'content', 'sales', 'market', 'operations']);

function advisorCopy(language: ContentLanguage, key: 'reviewEvidence' | 'salesFollowUp' | 'trackOutcome' | 'prepareMessage' | 'prepareExecution' | 'ownPlan' | 'supportStep', subject: string): string {
  if (language === 'ja') {
    const copy = {
      reviewEvidence: `根拠を確認し、次の方針を承認する: ${subject}.`,
      salesFollowUp: `この提案を明確な営業フォローに落とし込み、顧客の反応を記録する: ${subject}.`,
      trackOutcome: `基準値を設定し、成果を追跡する: ${subject}.`,
      prepareMessage: `顧客向けメッセージと必要なコンテンツを準備する: ${subject}.`,
      prepareExecution: `配信チャネルとクリエイティブ実行を準備する: ${subject}.`,
      ownPlan: `実行計画を主導し、素材を調整し、進捗を報告する: ${subject}.`,
      supportStep: `次のステップを支援する: ${subject}.`,
    };
    return copy[key];
  }
  const copy = {
    reviewEvidence: `Review the evidence and approve the direction for: ${subject}.`,
    salesFollowUp: `Turn this recommendation into a clear sales follow-up and report customer objections: ${subject}.`,
    trackOutcome: `Set a baseline and track the outcome of: ${subject}.`,
    prepareMessage: `Prepare the customer-facing message and content needed for: ${subject}.`,
    prepareExecution: `Prepare the channel and creative execution for: ${subject}.`,
    ownPlan: `Own the execution plan, coordinate assets, and report progress for: ${subject}.`,
    supportStep: `Support the next step for: ${subject}.`,
  };
  return copy[key];
}

function validLink(link: unknown, companyId: string): string | undefined {
  if (typeof link !== 'string') return undefined;
  const prefixes = [
    `/${companyId}/campaigns`,
    `/${companyId}/landing-pages`,
    `/${companyId}/sales`,
    `/${companyId}/market`,
    `/${companyId}/brain`,
    `/${companyId}/brain-hub`,
    `/${companyId}/blog`,
    `/${companyId}/knowledge`,
    `/${companyId}/seo-engine`,
    `/${companyId}/growth-plan`,
  ];
  return prefixes.some((prefix) => link === prefix || link.startsWith(`${prefix}/`))
    ? link
    : undefined;
}

function toBriefEvidence(evidence: AdvisorEvidence): BriefEvidence {
  return {
    id: evidence.id,
    sourceType: evidence.sourceType,
    sourceId: evidence.sourceId,
    label: evidence.label,
    detail: evidence.detail,
    link: evidence.link,
    occurredAt: evidence.occurredAt,
    score: evidence.score,
  };
}

function sanitizeProposal(value: unknown): CampaignProposal | undefined {
  const proposal = value as Record<string, unknown> | null;
  if (!proposal) return undefined;
  const goal = String(proposal.goal ?? '').trim().slice(0, 200);
  const audience = String(proposal.audience ?? '').trim().slice(0, 250);
  if (!goal || !audience) return undefined;
  return {
    goal,
    audience,
    offer: proposal.offer ? String(proposal.offer).slice(0, 250) : undefined,
    publicTopic: proposal.publicTopic ? String(proposal.publicTopic).slice(0, 250) : undefined,
    contentAngle: proposal.contentAngle ? String(proposal.contentAngle).slice(0, 500) : undefined,
    channels: Array.isArray(proposal.channels)
      ? proposal.channels.map(String).map((item) => item.slice(0, 50)).slice(0, 5)
      : [],
    assets: Array.isArray(proposal.assets)
      ? proposal.assets.map(String).map((item) => item.slice(0, 50)).slice(0, 5)
      : [],
    expectedOutcome: proposal.expectedOutcome
      ? String(proposal.expectedOutcome).slice(0, 250)
      : undefined,
  } as CampaignProposal;
}

function sanitizeTeamTasks(value: unknown, team: AdvisorTeamMember[]): AdvisorTeamTask[] {
  if (!Array.isArray(value) || team.length === 0) return [];
  const teamById = new Map(team.map((member) => [member.id, member]));
  const seen = new Set<string>();
  return value
    .map((raw): AdvisorTeamTask | null => {
      const record = raw && typeof raw === 'object' ? raw as Record<string, unknown> : null;
      const member = record ? teamById.get(String(record.agentId ?? '')) : undefined;
      const task = String(record?.task ?? '').trim().slice(0, 300);
      if (!member || !task || seen.has(member.id)) return null;
      seen.add(member.id);
      return {
        agentId: member.id,
        agentName: member.name,
        role: member.role,
        title: member.title,
        department: member.department,
        task,
        expectedOutcome: record?.expectedOutcome
          ? String(record.expectedOutcome).trim().slice(0, 220)
          : undefined,
      };
    })
    .filter((task): task is AdvisorTeamTask => task !== null)
    .slice(0, 4);
}

const ACTION_ROLE_PRIORITY: Record<NonNullable<BriefAction['actionKind']>, string[]> = {
  campaign: ['marketing_manager', 'content_creator', 'ads_specialist', 'analyst', 'ceo'],
  content: ['content_creator', 'marketing_manager', 'analyst', 'ceo'],
  sales: ['sales_manager', 'marketing_manager', 'ceo', 'analyst'],
  market: ['analyst', 'marketing_manager', 'ceo', 'sales_manager'],
  operations: ['ceo', 'analyst', 'marketing_manager', 'sales_manager'],
};

function fallbackTaskCopy(action: BriefAction, member: AdvisorTeamMember, language: ContentLanguage = 'en'): string {
  const subject = action.title.replace(/[.!?]+$/, '');
  if (member.role === 'ceo') return advisorCopy(language, 'reviewEvidence', subject);
  if (member.role === 'sales_manager') return advisorCopy(language, 'salesFollowUp', subject);
  if (member.role === 'analyst') return advisorCopy(language, 'trackOutcome', subject);
  if (member.role === 'content_creator') return advisorCopy(language, 'prepareMessage', subject);
  if (member.role === 'ads_specialist') return advisorCopy(language, 'prepareExecution', subject);
  if (member.role === 'marketing_manager') return advisorCopy(language, 'ownPlan', subject);
  return advisorCopy(language, 'supportStep', subject);
}

/**
 * Guarantees every recommendation has owners from the company's actual AI
 * org chart. LLM assignments are preferred; deterministic matching keeps
 * system-created and legacy actions useful too.
 */
export function assignAdvisorTeamTasks(
  actions: BriefAction[],
  team: AdvisorTeamMember[],
  language: ContentLanguage = 'en',
): BriefAction[] {
  if (team.length === 0) return actions;
  return actions.map((action) => {
    const sanitized = sanitizeTeamTasks(action.teamTasks, team);
    if (sanitized.length > 0) return { ...action, teamTasks: sanitized };

    const priorities = ACTION_ROLE_PRIORITY[action.actionKind ?? 'operations'];
    const members = [...team]
      .sort((left, right) => {
        const leftRank = priorities.indexOf(left.role);
        const rightRank = priorities.indexOf(right.role);
        return (leftRank < 0 ? 99 : leftRank) - (rightRank < 0 ? 99 : rightRank);
      })
      .filter((member) => priorities.includes(member.role))
      .slice(0, action.actionKind === 'operations' ? 2 : 3);
    const owners = members.length > 0 ? members : team.slice(0, 1);
    return {
      ...action,
      teamTasks: owners.map((member) => ({
        agentId: member.id,
        agentName: member.name,
        role: member.role,
        title: member.title,
        department: member.department,
        task: fallbackTaskCopy(action, member, language),
        expectedOutcome: action.impact,
      })),
    };
  });
}

function actionPriority(action: BriefAction): number {
  const severity = { critical: 4, high: 3, medium: 2, low: 1 }[action.severity ?? 'medium'];
  const confidence = { high: 3, medium: 2, low: 1 }[action.confidence ?? 'medium'];
  const evidenceStrength = Math.min(3, action.evidence?.length ?? 0);
  const readiness = action.actionKind === 'campaign' && action.campaignProposal ? 1 : 0;
  return severity * 4 + confidence * 2 + evidenceStrength + readiness;
}

function buildGrowthPlanReviewAction(args: {
  companyId: string;
  health: Awaited<ReturnType<typeof buildAdvisorContext>>['growthPlanHealth'];
  evidenceById: Map<string, AdvisorEvidence>;
  language?: ContentLanguage;
}): BriefAction | null {
  if (args.health.status !== 'update_recommended') return null;
  const driftEvidence = args.evidenceById.get('business:growth-plan:drift');
  const language = args.language ?? 'en';

  return {
    title: language === 'ja'
      ? `Growth Plan v${args.health.version + 1}を見直す`
      : `Review Growth Plan v${args.health.version + 1}`,
    why: args.health.reasons.join(' ').slice(0, 500),
    impact: language === 'ja'
      ? '今後のキャンペーンとCEO提案を最新の事業データに合わせます。'
      : 'Keeps future campaigns and CEO recommendations aligned with the latest business evidence.',
    link: `/${args.companyId}/growth-plan`,
    severity: 'high',
    confidence: 'high',
    actionKind: 'operations',
    evidence: driftEvidence ? [toBriefEvidence(driftEvidence)] : [],
  };
}

function buildMarketResponseActions(args: {
  companyId: string;
  marketSignals: unknown[];
  evidenceById: Map<string, AdvisorEvidence>;
  language?: ContentLanguage;
}): BriefAction[] {
  const seen = new Set<string>();
  return args.marketSignals
    .map((signal) => signal as Record<string, unknown>)
    .filter((signal) => {
      const threat = String(signal.threatLevel ?? '');
      return ['critical', 'high', 'medium'].includes(threat) && Boolean(signal.campaignRecommendation);
    })
    .sort((left, right) => {
      const weight = { critical: 4, high: 3, medium: 2, low: 1 } as Record<string, number>;
      return (weight[String(right.threatLevel ?? 'medium')] ?? 2)
        - (weight[String(left.threatLevel ?? 'medium')] ?? 2);
    })
    .map((signal): BriefAction | null => {
      const campaignRecommendation = signal.campaignRecommendation as CampaignProposal | undefined;
      if (!campaignRecommendation) return null;
      const evidenceId = typeof signal.evidenceId === 'string' ? signal.evidenceId : '';
      const evidence = evidenceId ? args.evidenceById.get(evidenceId) : undefined;
      const competitorName = String(signal.competitorName ?? 'a competitor');
      const category = String(signal.competitorCategory ?? 'market signal').replace(/_/g, ' ');
      const key = `${competitorName}:${category}:${campaignRecommendation.goal}`;
      if (seen.has(key)) return null;
      seen.add(key);

      return {
        title: args.language === 'ja'
          ? `${competitorName}の${category}に対応する`
          : `Respond to ${competitorName}'s ${category}`,
        why: String(signal.counterMove ?? campaignRecommendation.expectedOutcome ?? '').slice(0, 500),
        impact: campaignRecommendation.expectedOutcome,
        link: `/${args.companyId}/campaigns`,
        severity: ['critical', 'high', 'medium', 'low'].includes(String(signal.threatLevel))
          ? signal.threatLevel as BriefAction['severity']
          : 'medium',
        confidence: evidence ? 'high' : 'medium',
        actionKind: 'campaign',
        evidence: evidence ? [toBriefEvidence(evidence)] : [],
        campaignProposal: sanitizeProposal(campaignRecommendation),
      };
    })
    .filter((action): action is BriefAction => Boolean(action?.campaignProposal))
    .slice(0, 2);
}

export function buildCampaignReviewActions(args: {
  campaigns: Array<Record<string, unknown>>;
  evidenceById: Map<string, AdvisorEvidence>;
  companyId: string;
}): BriefAction[] {
  const reviewableStatuses = new Set(['planned', 'generating', 'ready']);
  const now = Date.now();
  const maxAgeMs = 30 * 86_400_000;

  return args.campaigns
    .filter((campaign) =>
      campaign.aiMode === true
      || ['ai_autonomous', 'ai_user_requested', 'ceo_advisor'].includes(
        String(campaign.sourceType ?? ''),
      ))
    .filter((campaign) => reviewableStatuses.has(String(campaign.status ?? '')))
    .filter((campaign) => {
      const createdAt = new Date(String(campaign.createdAt ?? '')).getTime();
      return Number.isFinite(createdAt) && now - createdAt <= maxAgeMs;
    })
    .slice(0, 3)
    .map((campaign): BriefAction | null => {
      const id = String(campaign.id ?? '');
      const name = String(campaign.name ?? 'AI campaign').replace(/^AI:\s*/i, '');
      if (!id) return null;
      const evidence = args.evidenceById.get(`campaign:${id}`);
      const status = String(campaign.status ?? 'ready');
      const assetSummary = [
        Number(campaign.bannerCount ?? 0) > 0
          ? `${campaign.bannerCount} banners`
          : null,
        Array.isArray(campaign.socialPlatforms) && campaign.socialPlatforms.length > 0
          ? `${campaign.socialPlatforms.length} social channels`
          : null,
        campaign.blogPostId ? 'a blog draft' : null,
      ].filter(Boolean).join(', ');

      return {
        title: status === 'generating'
          ? `Campaign is being prepared: ${name}`
          : `Review campaign: ${name}`,
        why: status === 'generating'
          ? 'AI has created this campaign and is still preparing its content. Open it to follow progress and review each asset as it becomes ready.'
          : `This AI-created campaign is ready in your Campaigns list${assetSummary ? ` with ${assetSummary}` : ''}. Review the assets before launching.`,
        impact: 'Keeps the recommendation connected to the campaign that was actually created.',
        link: `/${args.companyId}/campaigns/${id}`,
        severity: status === 'ready' ? 'high' : 'medium',
        confidence: 'high',
        actionKind: 'campaign',
        evidence: evidence
          ? [toBriefEvidence(evidence)]
          : [{
            id: `campaign:${id}`,
            sourceType: 'campaign',
            sourceId: id,
            label: name,
            detail: `${status} AI-created campaign in the Campaigns list`,
            link: `/${args.companyId}/campaigns/${id}`,
            occurredAt: typeof campaign.createdAt === 'string'
              ? campaign.createdAt
              : undefined,
          }],
      };
    })
    .filter((action): action is BriefAction => action !== null);
}

export function mergeCampaignReviewActions(args: {
  actions: BriefAction[];
  campaigns: Array<Record<string, unknown>>;
  companyId: string;
  evidence?: AdvisorEvidence[];
}): BriefAction[] {
  const evidenceById = new Map((args.evidence ?? []).map((item) => [item.id, item]));
  const campaignReviewActions = buildCampaignReviewActions({
    campaigns: args.campaigns,
    evidenceById,
    companyId: args.companyId,
  });
  const existingLinks = new Set(
    args.actions
      .map((action) => action.link)
      .filter((link): link is string => Boolean(link)),
  );

  const newCampaignActions = campaignReviewActions
    .filter((action) => !action.link || !existingLinks.has(action.link));
  const rankedExistingActions = [...args.actions]
    .sort((left, right) => actionPriority(right) - actionPriority(left));

  return [...newCampaignActions, ...rankedExistingActions].slice(0, 5);
}

export async function generateCeoBrief(args: {
  companyId: string;
  tenantId: string;
}): Promise<GeneratedBrief> {
  const { companyId, tenantId } = args;
  const context = await buildAdvisorContext({ companyId, tenantId });
  const language = normalizeContentLanguage(context.business.language);
  const evidenceById = new Map(context.evidence.map((item) => [item.id, item]));
  const unavailableSources = context.sourceHealth
    .filter((source) => source.status === 'unavailable')
    .map((source) => source.source);

  const promptContext = {
    business: context.business,
    growthPlanHealth: context.growthPlanHealth,
    campaigns: context.campaigns.slice(0, 20),
    blogs: context.blogs.slice(0, 25),
    landingPages: context.landingPages.slice(0, 15),
    sales: context.sales,
    team: context.team,
    marketSignals: context.marketSignals,
    coverageGaps: context.coverageGaps,
    sourceHealth: context.sourceHealth,
    evidenceCatalog: context.evidence.slice(0, 80).map((item) => ({
      id: item.id,
      sourceType: item.sourceType,
      label: item.label,
      detail: item.detail,
      occurredAt: item.occurredAt,
      score: item.score,
    })),
  };

  const linkPrefix = `/${companyId}`;
  const system = `You are an evidence-grounded Chief of Staff for a solo founder.
Prioritize what the CEO should do next using only the supplied company data.

Rules:
- Return STRICT JSON only. No markdown or prose outside JSON.
- ${buildContentLanguageInstruction(language)}
- Never treat an unavailable source as an empty business result.
- Every action must cite 1-4 IDs from evidenceCatalog in "evidenceIds".
- Do not cite IDs that are not present in evidenceCatalog.
- Prefer specific facts, observed gaps, user-provided Brain Hub data, and measured outcomes.
- Do not claim a campaign or blog performed well unless metrics or learnings support it.
- Rank actions by expected impact, urgency, evidence strength, strategic fit, and execution readiness.
- Recommend a new campaign only when there is a supported audience, product, content gap, customer signal, market signal, or repeatable prior win.
- When marketSignals include a high/critical product launch, pricing change, or content-positioning move, propose a counter-campaign if it protects an affected product or audience.
- Campaign recommendations must use actionKind "campaign" and include campaignProposal.
- A campaignProposal is a draft for human review, never an instruction to auto-publish.
- Assign each action to 1-4 suitable members from the supplied team using "teamTasks".
- teamTasks.agentId must exactly match an ID from the supplied team. Never invent a person or role.
- Give each assigned member a concrete, role-specific task; do not repeat the same generic task for everyone.
- Keep 3-5 actions, 0-3 wins, and 0-3 alerts.
- Allowed links begin with:
  ${linkPrefix}/campaigns, ${linkPrefix}/landing-pages, ${linkPrefix}/sales,
  ${linkPrefix}/market, ${linkPrefix}/brain, ${linkPrefix}/brain-hub,
  ${linkPrefix}/blog, ${linkPrefix}/knowledge, ${linkPrefix}/seo-engine,
  ${linkPrefix}/growth-plan
- confidence is high only for direct, recent evidence; medium for multiple indirect signals; low for sparse data.
- Empty arrays are valid. Do not invent missing facts.`;

  const user = `Company decision context:
${JSON.stringify(promptContext, null, 2)}

Return:
{
  "headline": string,
  "actions": [{
    "title": string,
    "why": string,
    "impact": string?,
    "link": string?,
    "severity": "critical"|"high"|"medium"|"low",
    "confidence": "high"|"medium"|"low",
    "actionKind": "campaign"|"content"|"sales"|"market"|"operations",
    "evidenceIds": string[],
    "teamTasks": [{
      "agentId": string,
      "task": string,
      "expectedOutcome": string?
    }],
    "campaignProposal": {
      "goal": string,
      "audience": string,
      "offer": string?,
      "publicTopic": string?,
      "contentAngle": string?,
      "channels": string[],
      "assets": string[],
      "expectedOutcome": string?
    }?
  }],
  "wins": [{"what": string, "detail": string?}],
  "alerts": [{"what": string, "detail": string?, "link": string?}]
}`;

  const llm = await llmGenerate(
    [{ role: 'system', content: system }, { role: 'user', content: user }],
    {
      featureKey: 'ceo_advisor_brief',
      json: true,
      traceName: 'ceo_advisor.brief',
      metadata: {
        companyId,
        tenantId,
        evidenceCount: context.evidence.length,
        unavailableSources,
      },
    },
  );

  const parsed = extractJSON(llm.text) ?? {};
  const generatedActions: BriefAction[] = Array.isArray(parsed.actions)
    ? parsed.actions
      .slice(0, 5)
      .map((raw: any): BriefAction | null => {
        const title = String(raw?.title ?? '').trim().slice(0, 200);
        const why = String(raw?.why ?? '').trim().slice(0, 500);
        if (!title || !why) return null;

        const evidenceIds: string[] = Array.isArray(raw?.evidenceIds)
          ? [...new Set<string>(raw.evidenceIds.filter((id: unknown): id is string => typeof id === 'string'))]
            .filter((id) => evidenceById.has(id))
            .slice(0, 4)
          : [];
        if (context.evidence.length > 0 && evidenceIds.length === 0) return null;

        const actionKind = VALID_ACTION_KIND.has(raw?.actionKind)
          ? raw.actionKind as BriefAction['actionKind']
          : 'operations';
        const campaignProposal = actionKind === 'campaign'
          ? sanitizeProposal(raw?.campaignProposal)
          : undefined;
        if (actionKind === 'campaign' && !campaignProposal) return null;

        return {
          title,
          why,
          impact: raw?.impact ? String(raw.impact).slice(0, 200) : undefined,
          link: validLink(raw?.link, companyId),
          severity: VALID_SEVERITY.has(raw?.severity) ? raw.severity : 'medium',
          confidence: VALID_CONFIDENCE.has(raw?.confidence) ? raw.confidence : 'medium',
          actionKind,
          evidence: evidenceIds
            .map((id) => evidenceById.get(id))
            .filter((item): item is AdvisorEvidence => Boolean(item))
            .map(toBriefEvidence),
          campaignProposal,
          teamTasks: sanitizeTeamTasks(raw?.teamTasks, context.team),
        };
      })
      .filter((action: BriefAction | null): action is BriefAction => action !== null)
      .sort((left: BriefAction, right: BriefAction) => actionPriority(right) - actionPriority(left))
    : [];
  const actions = mergeCampaignReviewActions({
    actions: generatedActions,
    campaigns: context.campaigns,
    companyId,
    evidence: context.evidence,
  });
  const marketResponseActions = buildMarketResponseActions({
    companyId,
    marketSignals: context.marketSignals,
    evidenceById,
    language,
  });
  const growthPlanAction = buildGrowthPlanReviewAction({
    companyId,
    health: context.growthPlanHealth,
    evidenceById,
    language,
  });
  const marketActionTitles = new Set(marketResponseActions.map((item) => item.title));
  const combinedActions = [
    ...marketResponseActions,
    ...actions.filter((action) => !marketActionTitles.has(action.title)),
  ];
  const prioritizedActions = growthPlanAction
    ? [
        growthPlanAction,
        ...combinedActions.filter((action) => action.link !== growthPlanAction.link),
      ].slice(0, 5)
    : combinedActions.slice(0, 5);
  const assignedActions = assignAdvisorTeamTasks(prioritizedActions, context.team, language);

  const wins: BriefWin[] = Array.isArray(parsed.wins)
    ? parsed.wins.slice(0, 3).map((win: any) => ({
      what: String(win?.what ?? '').slice(0, 200),
      detail: win?.detail ? String(win.detail).slice(0, 300) : undefined,
    })).filter((win: BriefWin) => win.what)
    : [];

  const alerts: BriefAlert[] = Array.isArray(parsed.alerts)
    ? parsed.alerts.slice(0, 3).map((alert: any) => ({
      what: String(alert?.what ?? '').slice(0, 200),
      detail: alert?.detail ? String(alert.detail).slice(0, 300) : undefined,
      link: validLink(alert?.link, companyId),
    })).filter((alert: BriefAlert) => alert.what)
    : [];

  if (unavailableSources.length > 0 && alerts.length < 3) {
    alerts.push({
      what: language === 'ja'
        ? '一部の会社データを読み取れませんでした'
        : 'Some company data was unavailable',
      detail: language === 'ja'
        ? `Advisorは次の情報を読み取れませんでした: ${unavailableSources.join(', ')}。提案では、これらの情報源が空であるとは仮定しません。`
        : `Advisor could not read: ${unavailableSources.join(', ')}. Recommendations avoid assuming those sources are empty.`,
      link: `/${companyId}/brain`,
    });
  }

  return {
    headline: typeof parsed.headline === 'string' && parsed.headline.trim()
      ? parsed.headline.trim().slice(0, 300)
      : language === 'ja'
        ? '本日のデータに基づくアドバイスです。'
        : 'Here is your evidence-based brief for today.',
    actions: assignedActions,
    wins,
    alerts,
    sourcesUsed: {
      campaignsCount: context.counts.campaigns,
      blogsCount: context.counts.blogs,
      landingPagesCount: context.counts.landingPages,
      dealsCount: context.counts.deals,
      marketScansCount: context.counts.marketScans,
      learningsCount: context.counts.learnings,
      brainEventsCount: context.counts.brainEvents,
      sourceHealth: context.sourceHealth,
    },
    model: llm.model,
    traceId: llm.traceId ?? null,
  };
}

export async function generateAndSaveCeoBrief(args: {
  companyId: string;
  companyName: string;
  actor: string;
  chargeCredits?: boolean;
}) {
  const {
    companyId,
    companyName,
    actor,
    chargeCredits = true,
  } = args;
  const tenantId = await ensureTenantForCompany(companyId, companyName);

  if (chargeCredits) {
    await ensureSufficientCredits(companyId, 10);
  }

  const result = await generateCeoBrief({ companyId, tenantId });
  const saved = await getTenantAI().ceoAdvisor.append(
    tenantId,
    {
      headline: result.headline,
      actions: result.actions,
      wins: result.wins,
      alerts: result.alerts,
      sourcesUsed: result.sourcesUsed,
      model: result.model,
      traceId: result.traceId,
    },
    actor,
  );

  if (chargeCredits) {
    await chargeFixedCredits(companyId, 10, {
      featureKey: 'ceo_advisor_brief',
      refKind: 'ceo_brief',
      refId: saved.id,
      actor,
    });
  }

  return saved;
}
