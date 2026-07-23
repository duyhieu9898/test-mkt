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
  AdvisorStrategicGap,
  AdvisorResponsibleDepartment,
  AdvisorTeamTask,
  AdvisorBriefInput,
  AdvisorWeeklyAction,
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
  weeklyActions: AdvisorWeeklyAction[];
  wins: BriefWin[];
  alerts: BriefAlert[];
  sourcesUsed: {
    campaignsCount: number;
    blogsCount: number;
    landingPagesCount: number;
    knowledgeCount: number;
    dealsCount: number;
    marketScansCount: number;
    learningsCount: number;
    brainEventsCount: number;
    videosCount: number;
    sourceHealth: AdvisorSourceHealth[];
  };
  model: string;
  traceId: string | null;
}

const VALID_SEVERITY = new Set(['critical', 'high', 'medium', 'low']);
const VALID_PRIORITY = new Set(['urgent', 'high', 'medium', 'low']);
const VALID_CONFIDENCE = new Set(['high', 'medium', 'low']);
const VALID_ACTION_KIND = new Set(['campaign', 'content', 'sales', 'market', 'operations']);
const VALID_GAP_TYPE = new Set(['market_gap', 'content_gap', 'creative_gap', 'channel_gap', 'conversion_gap', 'knowledge_gap']);
const VALID_SUGGESTED_ASSET = new Set(['blog', 'landing_page', 'social_posts', 'banner_images', 'video', 'market_scan', 'sales_enablement']);
const VALID_WEEKLY_DAY = new Set([1, 2, 3, 4, 5, 6, 7]);

type AdvisorPriority = NonNullable<BriefAction['priority']>;
type AdvisorSuggestedAsset = NonNullable<AdvisorStrategicGap['suggestedAssets']>[number];
type AdvisorContextSnapshot = Awaited<ReturnType<typeof buildAdvisorContext>>;

interface AdvisorStrategicGapInput {
  id: string;
  type: NonNullable<AdvisorStrategicGap['type']>;
  issue: string;
  evidenceIds: string[];
  priority: AdvisorPriority;
  recommendation: string;
  expectedImpact: string;
  marketSignal?: string;
  internalMissingPiece?: string;
  suggestedAssets: AdvisorSuggestedAsset[];
  supportingKnowledge: string[];
}

interface AdvisorTodayMarketPulse {
  evidenceId: string;
  competitorName: string;
  threatLevel: string;
  category: string;
  signal: string;
  affectedProducts: string[];
  affectedAudiences: string[];
  counterMove?: string;
  completedAt?: string;
}

const PRIORITY_TO_SEVERITY: Record<AdvisorPriority, NonNullable<BriefAction['severity']>> = {
  urgent: 'critical',
  high: 'high',
  medium: 'medium',
  low: 'low',
};

function priorityFromSeverity(severity: unknown): AdvisorPriority {
  if (severity === 'critical') return 'urgent';
  if (severity === 'high') return 'high';
  if (severity === 'low') return 'low';
  return 'medium';
}

function normalizePriority(priority: unknown, fallbackSeverity?: unknown): AdvisorPriority {
  const value = typeof priority === 'string' ? priority.toLowerCase().trim() : '';
  if (VALID_PRIORITY.has(value)) return value as AdvisorPriority;
  return priorityFromSeverity(fallbackSeverity);
}

function truncateAdvisorText(value: unknown, maxLength: number): string {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function buildTodayMarketPulse(context: AdvisorContextSnapshot): AdvisorTodayMarketPulse[] {
  const priorityWeight: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
  return context.marketSignals
    .filter((signal) => signal.evidenceId)
    .sort((left, right) => {
      const byThreat = (priorityWeight[right.threatLevel] ?? 1) - (priorityWeight[left.threatLevel] ?? 1);
      if (byThreat !== 0) return byThreat;
      return new Date(right.completedAt ?? 0).getTime() - new Date(left.completedAt ?? 0).getTime();
    })
    .slice(0, 8)
    .map((signal) => ({
      evidenceId: signal.evidenceId,
      competitorName: signal.competitorName,
      threatLevel: signal.threatLevel,
      category: signal.competitorCategory,
      signal: signal.text,
      affectedProducts: signal.affectedProducts,
      affectedAudiences: signal.affectedAudiences,
      counterMove: signal.counterMove ?? signal.campaignRecommendation?.expectedOutcome,
      completedAt: signal.completedAt,
    }));
}

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
  if (language === 'vi') {
    const copy = {
      reviewEvidence: `Xem lại bằng chứng và duyệt hướng đi cho: ${subject}.`,
      salesFollowUp: `Biến đề xuất này thành bước follow-up sales rõ ràng và ghi nhận phản hồi của khách hàng: ${subject}.`,
      trackOutcome: `Thiết lập baseline và theo dõi kết quả của: ${subject}.`,
      prepareMessage: `Chuẩn bị thông điệp hướng tới khách hàng và nội dung cần thiết cho: ${subject}.`,
      prepareExecution: `Chuẩn bị kênh phân phối và creative execution cho: ${subject}.`,
      ownPlan: `Phụ trách kế hoạch triển khai, điều phối assets và báo cáo tiến độ cho: ${subject}.`,
      supportStep: `Hỗ trợ bước tiếp theo cho: ${subject}.`,
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

function normalizeSuggestedAsset(value: unknown): AdvisorSuggestedAsset | null {
  const normalized = String(value ?? '')
    .toLowerCase()
    .trim()
    .replace(/[-\s]+/g, '_');
  const aliases: Record<string, AdvisorSuggestedAsset> = {
    comparison_landing_page: 'landing_page',
    landing: 'landing_page',
    page: 'landing_page',
    social: 'social_posts',
    social_post: 'social_posts',
    posts: 'social_posts',
    banners: 'banner_images',
    banner: 'banner_images',
    images: 'banner_images',
    image: 'banner_images',
    sales: 'sales_enablement',
    sales_material: 'sales_enablement',
  };
  const candidate = aliases[normalized] ?? normalized;
  return VALID_SUGGESTED_ASSET.has(candidate) ? candidate as AdvisorSuggestedAsset : null;
}

function sanitizeSuggestedAssets(value: unknown): AdvisorSuggestedAsset[] {
  const values = Array.isArray(value) ? value : [];
  return [...new Set(values.map(normalizeSuggestedAsset).filter((item): item is AdvisorSuggestedAsset => Boolean(item)))]
    .slice(0, 8);
}

function sanitizeStrategicGap(value: unknown): AdvisorStrategicGap | undefined {
  const record = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
  if (!record) return undefined;
  const type = String(record.type ?? '').trim();
  if (!VALID_GAP_TYPE.has(type)) return undefined;
  const suggestedAssets = sanitizeSuggestedAssets(record.suggestedAssets);
  const supportingKnowledge = Array.isArray(record.supportingKnowledge)
    ? record.supportingKnowledge
      .map((item) => String(item ?? '').trim())
      .filter(Boolean)
      .slice(0, 4)
    : [];
  return {
    type: type as AdvisorStrategicGap['type'],
    marketSignal: record.marketSignal ? String(record.marketSignal).trim().slice(0, 500) : undefined,
    internalMissingPiece: record.internalMissingPiece
      ? String(record.internalMissingPiece).trim().slice(0, 500)
      : undefined,
    suggestedAssets,
    supportingKnowledge,
  };
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

function departmentFromRole(role?: string): string {
  if (role === 'ceo') return 'Executive';
  if (role === 'sales_manager') return 'Sales';
  if (role === 'analyst') return 'Analytics';
  if (role === 'content_creator') return 'Content';
  if (role === 'ads_specialist') return 'Advertising';
  if (role === 'marketing_manager') return 'Marketing';
  return 'Operations';
}

function sanitizeResponsibleDepartments(
  value: unknown,
  team: AdvisorTeamMember[],
): AdvisorResponsibleDepartment[] {
  if (!Array.isArray(value)) return [];
  const teamById = new Map(team.map((member) => [member.id, member]));
  const seen = new Set<string>();
  return value
    .map((raw): AdvisorResponsibleDepartment | null => {
      const record = raw && typeof raw === 'object' ? raw as Record<string, unknown> : null;
      if (!record) return null;

      const ownerId = String(record.ownerAgentId ?? record.agentId ?? '').trim();
      const owner = ownerId ? teamById.get(ownerId) : undefined;
      const role = typeof record.role === 'string' ? record.role : owner?.role;
      const department = String(record.department ?? owner?.department ?? departmentFromRole(role))
        .trim()
        .slice(0, 80);
      const responsibility = String(record.responsibility ?? record.task ?? '')
        .trim()
        .slice(0, 300);
      if (!department || !responsibility) return null;

      const key = `${department.toLowerCase()}:${responsibility.toLowerCase()}`;
      if (seen.has(key)) return null;
      seen.add(key);

      return {
        department,
        ownerAgentId: owner?.id,
        ownerName: owner?.name,
        role: owner?.role ?? role,
        title: owner?.title ?? (typeof record.title === 'string' ? record.title.slice(0, 120) : undefined),
        responsibility,
        expectedOutcome: record.expectedOutcome
          ? String(record.expectedOutcome).trim().slice(0, 220)
          : undefined,
      };
    })
    .filter((department): department is AdvisorResponsibleDepartment => department !== null)
    .slice(0, 5);
}

function responsibleDepartmentsFromTasks(tasks: AdvisorTeamTask[]): AdvisorResponsibleDepartment[] {
  const seen = new Set<string>();
  return tasks
    .map((task): AdvisorResponsibleDepartment | null => {
      const department = task.department?.trim() || departmentFromRole(task.role);
      const responsibility = task.task.trim();
      if (!department || !responsibility) return null;
      const key = `${department.toLowerCase()}:${responsibility.toLowerCase()}`;
      if (seen.has(key)) return null;
      seen.add(key);
      return {
        department,
        ownerAgentId: task.agentId,
        ownerName: task.agentName,
        role: task.role,
        title: task.title,
        responsibility,
        expectedOutcome: task.expectedOutcome,
      };
    })
    .filter((department): department is AdvisorResponsibleDepartment => department !== null);
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
    const responsibleDepartments = sanitizeResponsibleDepartments(action.responsibleDepartments, team);
    if (sanitized.length > 0) {
      return {
        ...action,
        teamTasks: sanitized,
        responsibleDepartments: responsibleDepartments.length > 0
          ? responsibleDepartments
          : responsibleDepartmentsFromTasks(sanitized),
      };
    }

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
    const teamTasks = owners.map((member) => ({
      agentId: member.id,
      agentName: member.name,
      role: member.role,
      title: member.title,
      department: member.department,
      task: fallbackTaskCopy(action, member, language),
      expectedOutcome: action.expectedImpact ?? action.impact,
    }));
    return {
      ...action,
      teamTasks,
      responsibleDepartments: responsibleDepartments.length > 0
        ? responsibleDepartments
        : responsibleDepartmentsFromTasks(teamTasks),
    };
  });
}

function defaultWeekDayLabel(day: number, language: ContentLanguage): string {
  if (language === 'ja') return `${day}日目`;
  if (language === 'vi') return `Ngày ${day}`;
  return `Day ${day}`;
}

function sanitizeWeeklyActions(args: {
  value: unknown;
  evidenceById: Map<string, AdvisorEvidence>;
  companyId: string;
  language: ContentLanguage;
}): AdvisorWeeklyAction[] {
  const rows = Array.isArray(args.value) ? args.value : [];
  const seenDays = new Set<number>();
  return rows
    .map((raw): AdvisorWeeklyAction | null => {
      const record = raw && typeof raw === 'object' ? raw as Record<string, unknown> : null;
      if (!record) return null;
      const day = Number(record.day);
      if (!VALID_WEEKLY_DAY.has(day) || seenDays.has(day)) return null;
      const title = truncateAdvisorText(record.title, 140);
      const action = truncateAdvisorText(record.action, 360);
      const why = truncateAdvisorText(record.why ?? record.reason, 280);
      if (!title || !action || !why) return null;
      seenDays.add(day);
      const priority = normalizePriority(record.priority);
      const evidenceIds = Array.isArray(record.evidenceIds)
        ? [...new Set<string>(record.evidenceIds.filter((id: unknown): id is string => typeof id === 'string'))]
          .filter((id) => args.evidenceById.has(id))
          .slice(0, 3)
        : [];
      return {
        day,
        dayLabel: truncateAdvisorText(record.dayLabel, 40) || defaultWeekDayLabel(day, args.language),
        title,
        action,
        why,
        ownerDepartment: record.ownerDepartment
          ? truncateAdvisorText(record.ownerDepartment, 80)
          : undefined,
        priority,
        evidenceIds,
        successSignal: record.successSignal
          ? truncateAdvisorText(record.successSignal, 220)
          : undefined,
        link: validLink(record.link, args.companyId),
      };
    })
    .filter((item): item is AdvisorWeeklyAction => item !== null)
    .sort((left, right) => left.day - right.day)
    .slice(0, 7);
}

function buildFallbackWeeklyActions(args: {
  actions: BriefAction[];
  language: ContentLanguage;
}): AdvisorWeeklyAction[] {
  const actionPool = args.actions.length > 0 ? args.actions : [];
  if (actionPool.length === 0) return [];
  return Array.from({ length: 7 }, (_, index) => {
    const action = actionPool[index % actionPool.length]!;
    const owners = action.responsibleDepartments ?? [];
    const priority = normalizePriority(action.priority, action.severity);
    const day = index + 1;
    const isFirstPass = index < actionPool.length;
    return {
      day,
      dayLabel: defaultWeekDayLabel(day, args.language),
      title: isFirstPass
        ? truncateAdvisorText(action.issue ?? action.title, 140)
        : args.language === 'ja'
          ? '進捗確認と次の調整'
          : args.language === 'vi'
            ? 'Kiểm tra tiến độ và điều chỉnh tiếp'
            : 'Review progress and adjust the next move',
      action: isFirstPass
        ? truncateAdvisorText(action.todayMove ?? action.recommendation ?? action.why, 360)
        : truncateAdvisorText(action.sevenDayMove ?? action.expectedImpact ?? action.impact ?? action.why, 360),
      why: truncateAdvisorText(action.marketContext ?? action.evidenceSummary ?? action.why, 280),
      ownerDepartment: owners[0]?.department,
      priority,
      evidenceIds: (action.evidence ?? []).map((evidence) => evidence.id).slice(0, 3),
      successSignal: truncateAdvisorText(action.expectedImpact ?? action.impact ?? '', 220) || undefined,
      link: action.link,
    };
  });
}

function actionPriority(action: BriefAction): number {
  const priority = { urgent: 5, high: 3, medium: 2, low: 1 }[action.priority ?? priorityFromSeverity(action.severity)];
  const severity = { critical: 4, high: 3, medium: 2, low: 1 }[action.severity ?? 'medium'];
  const confidence = { high: 3, medium: 2, low: 1 }[action.confidence ?? 'medium'];
  const evidenceStrength = Math.min(3, action.evidence?.length ?? 0);
  const readiness = action.actionKind === 'campaign' && action.campaignProposal ? 1 : 0;
  return priority * 5 + severity * 2 + confidence * 2 + evidenceStrength + readiness;
}

function normalizeSearchText(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function topicTokens(value: unknown): string[] {
  return normalizeSearchText(value)
    .split(' ')
    .filter((token) => token.length >= 3)
    .slice(0, 40);
}

function recordText(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function overlapScore(left: unknown, right: unknown): number {
  const rightTokens = new Set(topicTokens(right));
  return topicTokens(left).reduce((score, token) => score + (rightTokens.has(token) ? 1 : 0), 0);
}

function collectionHasTopic(
  items: Array<Record<string, unknown>>,
  topic: string,
  minimumScore = 2,
): boolean {
  const normalizedTopic = normalizeSearchText(topic);
  if (!normalizedTopic) return false;
  return items.some((item) => {
    const text = normalizeSearchText(recordText(item));
    if (!text) return false;
    if (normalizedTopic.length >= 12 && text.includes(normalizedTopic.slice(0, 80))) {
      return true;
    }
    return overlapScore(topic, text) >= minimumScore;
  });
}

function knowledgeMatchesForTopic(
  knowledge: Array<Record<string, unknown>>,
  topic: string,
): Array<{ id: string; title: string }> {
  return knowledge
    .map((entry) => {
      const title = String(entry.title ?? '').trim();
      const id = String(entry.id ?? '').trim();
      const score = overlapScore(topic, `${entry.title ?? ''} ${entry.category ?? ''} ${entry.tags ?? ''} ${entry.content ?? ''}`);
      return { id, title, score };
    })
    .filter((entry) => entry.id && entry.title && entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 3)
    .map(({ id, title }) => ({ id, title }));
}

function dedupeEvidenceIds(ids: unknown[], evidenceById: Map<string, AdvisorEvidence>): string[] {
  return [...new Set(ids.map((id) => String(id ?? '').trim()).filter(Boolean))]
    .filter((id) => evidenceById.has(id))
    .slice(0, 4);
}

function pushUniqueAsset(
  assets: AdvisorSuggestedAsset[],
  value: AdvisorSuggestedAsset,
): AdvisorSuggestedAsset[] {
  return assets.includes(value) ? assets : [...assets, value];
}

function strategicGapRecord(args: {
  id: string;
  type: AdvisorStrategicGapInput['type'];
  issue: string;
  priority: AdvisorPriority;
  recommendation: string;
  expectedImpact: string;
  evidenceIds: string[];
  suggestedAssets: AdvisorSuggestedAsset[];
  marketSignal?: string;
  internalMissingPiece?: string;
  supportingKnowledge?: string[];
}): AdvisorStrategicGapInput {
  return {
    id: args.id,
    type: args.type,
    issue: args.issue.slice(0, 300),
    evidenceIds: args.evidenceIds,
    priority: args.priority,
    recommendation: args.recommendation.slice(0, 700),
    expectedImpact: args.expectedImpact.slice(0, 350),
    marketSignal: args.marketSignal?.slice(0, 500),
    internalMissingPiece: args.internalMissingPiece?.slice(0, 500),
    suggestedAssets: [...new Set(args.suggestedAssets)].slice(0, 8),
    supportingKnowledge: [...new Set(args.supportingKnowledge ?? [])].slice(0, 4),
  };
}

/**
 * Turns raw evidence into explicit opportunity gaps before the LLM writes the
 * final brief. This keeps CEO Advisor from producing generic advice when the
 * same data already tells us "the market is doing X, but we have not answered
 * with Y yet".
 */
function buildStrategicGaps(
  context: AdvisorContextSnapshot,
  evidenceById: Map<string, AdvisorEvidence>,
): AdvisorStrategicGapInput[] {
  const gaps: AdvisorStrategicGapInput[] = [];
  const existingContent = [
    ...context.campaigns,
    ...context.blogs,
    ...context.landingPages,
  ];

  for (const signal of context.marketSignals.slice(0, 12)) {
    if (!['critical', 'high', 'medium'].includes(signal.threatLevel)) continue;
    const recommendation = signal.campaignRecommendation;
    const topic = [
      signal.competitorName,
      signal.text,
      signal.affectedProducts.join(' '),
      signal.affectedAudiences.join(' '),
      recommendation?.publicTopic,
      recommendation?.contentAngle,
    ].filter(Boolean).join(' ');
    const knowledgeMatches = knowledgeMatchesForTopic(context.knowledge, topic);
    let suggestedAssets = sanitizeSuggestedAssets([
      ...(recommendation?.assets ?? []),
      'social_posts',
      'banner_images',
    ]);
    if (signal.competitorCategory === 'content_positioning') {
      suggestedAssets = pushUniqueAsset(suggestedAssets, 'blog');
    }
    if (signal.competitorCategory === 'pricing_pressure') {
      suggestedAssets = pushUniqueAsset(suggestedAssets, 'landing_page');
    }
    if (['critical', 'high'].includes(signal.threatLevel)) {
      suggestedAssets = pushUniqueAsset(suggestedAssets, 'video');
    }

    const missingPieces = [
      !collectionHasTopic(context.campaigns, topic)
        ? 'no visible counter-campaign has been created for this competitor signal'
        : '',
      suggestedAssets.includes('blog') && !collectionHasTopic(context.blogs, topic)
        ? 'no supporting blog or comparison article answers this market move'
        : '',
      suggestedAssets.includes('landing_page') && !collectionHasTopic(context.landingPages, topic)
        ? 'no landing page is ready for the affected product or audience'
        : '',
      suggestedAssets.includes('video') && context.counts.videos === 0
        ? 'no short video creative exists to explain the counter-position quickly'
        : '',
    ].filter(Boolean);

    gaps.push(strategicGapRecord({
      id: `market-gap:${signal.evidenceId}`,
      type: 'market_gap',
      issue: `Competitor signal needs a stronger response: ${signal.competitorName} ${signal.competitorCategory.replace(/_/g, ' ')}`,
      priority: normalizePriority(undefined, signal.threatLevel),
      recommendation: signal.counterMove || recommendation?.expectedOutcome || 'Create a focused market response before prospects compare alternatives.',
      expectedImpact: recommendation?.expectedOutcome
        || 'Protect demand by turning competitor movement into a clear customer-facing response.',
      evidenceIds: dedupeEvidenceIds([
        signal.evidenceId,
        ...knowledgeMatches.map((entry) => `knowledge:${entry.id}`),
      ], evidenceById),
      marketSignal: `${signal.competitorName}: ${signal.text}`,
      internalMissingPiece: missingPieces.length > 0
        ? missingPieces.join('; ')
        : 'existing assets do not clearly show a CEO-approved response to this signal',
      suggestedAssets,
      supportingKnowledge: knowledgeMatches.map((entry) => entry.title),
    }));
  }

  for (const entry of context.knowledge.slice(0, 12)) {
    const id = String(entry.id ?? '').trim();
    const title = String(entry.title ?? '').trim();
    if (!id || !title) continue;
    const topic = `${entry.title ?? ''} ${entry.category ?? ''} ${entry.tags ?? ''} ${entry.content ?? ''}`;
    if (collectionHasTopic(existingContent, topic, 3)) continue;
    const categoryText = normalizeSearchText(`${entry.category ?? ''} ${entry.tags ?? ''} ${entry.content ?? ''}`);
    const highIntent = /\b(product|pricing|sales|customer|persona|faq|objection|case|offer|service|course|lead)\b/i
      .test(categoryText);
    const suggestedAssets: AdvisorSuggestedAsset[] = context.counts.videos === 0
      ? ['blog', 'social_posts', 'banner_images', 'video']
      : ['blog', 'social_posts', 'banner_images'];

    gaps.push(strategicGapRecord({
      id: `knowledge-gap:${id}`,
      type: 'content_gap',
      issue: `Knowledge Hub insight is not yet turned into customer-facing marketing: ${title}`,
      priority: highIntent ? 'high' : 'medium',
      recommendation: 'Turn this internal knowledge into a focused campaign angle, then create a blog and social posts that explain it in customer language.',
      expectedImpact: 'Converts business knowledge the user already provided into visible marketing assets without asking them to brief the AI again.',
      evidenceIds: dedupeEvidenceIds([`knowledge:${id}`], evidenceById),
      internalMissingPiece: 'the company has useful Knowledge Hub data, but no matching campaign, blog, or landing page is visible yet',
      suggestedAssets,
      supportingKnowledge: [title],
    }));
  }

  const coverageEvidence = context.evidence.filter((item) => item.sourceType === 'coverage');
  for (const evidence of coverageEvidence) {
    const detail = normalizeSearchText(evidence.detail);
    if (detail.includes('market') || detail.includes('competitor')) {
      gaps.push(strategicGapRecord({
        id: `coverage-gap:${evidence.id}`,
        type: 'market_gap',
        issue: 'CEO does not have fresh competitor evidence for the next strategic decision',
        priority: 'high',
        recommendation: 'Run a focused Market & Competitors scan before deciding the next campaign direction.',
        expectedImpact: 'Improves recommendation quality by grounding the next campaign in what the market is doing now.',
        evidenceIds: dedupeEvidenceIds([evidence.id], evidenceById),
        internalMissingPiece: evidence.detail,
        suggestedAssets: ['market_scan'],
      }));
    }
    if (detail.includes('performance') || detail.includes('measurable')) {
      gaps.push(strategicGapRecord({
        id: `coverage-gap:${evidence.id}`,
        type: 'conversion_gap',
        issue: 'Campaign execution exists, but CEO cannot judge performance yet',
        priority: 'high',
        recommendation: 'Connect or sync campaign performance data before increasing spend or launching follow-up campaigns.',
        expectedImpact: 'Lets the CEO compare which campaign assets are actually driving reach, engagement, leads, and conversion.',
        evidenceIds: dedupeEvidenceIds([evidence.id], evidenceById),
        internalMissingPiece: evidence.detail,
        suggestedAssets: ['sales_enablement'],
      }));
    }
  }

  const seen = new Set<string>();
  return gaps
    .filter((gap) => gap.evidenceIds.length > 0)
    .filter((gap) => {
      const key = `${gap.type}:${normalizeSearchText(gap.issue).slice(0, 100)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) => {
      const priorityWeight = { urgent: 4, high: 3, medium: 2, low: 1 };
      return priorityWeight[right.priority] - priorityWeight[left.priority]
        || right.evidenceIds.length - left.evidenceIds.length;
    })
    .slice(0, 10);
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
  const title = `Review Growth Plan v${args.health.version + 1}`;
  const evidenceSummary = args.health.reasons.join(' ').slice(0, 500);
  const recommendation = 'Create an updated Growth Plan draft using the latest company, market, and campaign evidence.';
  const expectedImpact = 'Keeps future campaigns and CEO recommendations aligned with the latest business evidence.';
  const strategicGap: AdvisorStrategicGap = {
    type: 'knowledge_gap',
    internalMissingPiece: 'The current Growth Plan may not include the latest company, market, campaign, and Brain Hub evidence.',
    suggestedAssets: ['market_scan', 'sales_enablement'],
  };

  return Object.assign({
    title: language === 'ja'
      ? `Growth Plan v${args.health.version + 1}を見直す`
      : language === 'vi'
        ? `Rà soát Growth Plan v${args.health.version + 1}`
        : `Review Growth Plan v${args.health.version + 1}`,
    why: args.health.reasons.join(' ').slice(0, 500),
    impact: language === 'ja'
      ? '今後のキャンペーンとCEO提案を最新の事業データに合わせます。'
      : language === 'vi'
        ? 'Giúp các campaign và đề xuất CEO tiếp theo bám sát dữ liệu kinh doanh mới nhất.'
        : 'Keeps future campaigns and CEO recommendations aligned with the latest business evidence.',
    issue: language === 'ja'
      ? `Growth Plan v${args.health.version + 1}ã‚’è¦‹ç›´ã™`
      : language === 'vi'
        ? `RÃ  soÃ¡t Growth Plan v${args.health.version + 1}`
        : `Review Growth Plan v${args.health.version + 1}`,
    evidenceSummary: args.health.reasons.join(' ').slice(0, 500),
    recommendation: 'Create an updated Growth Plan draft using the latest company, market, and campaign evidence.',
    expectedImpact: language === 'ja'
      ? 'ä»Šå¾Œã®ã‚­ãƒ£ãƒ³ãƒšãƒ¼ãƒ³ã¨CEOææ¡ˆã‚’æœ€æ–°ã®äº‹æ¥­ãƒ‡ãƒ¼ã‚¿ã«åˆã‚ã›ã¾ã™ã€‚'
      : language === 'vi'
        ? 'GiÃºp cÃ¡c campaign vÃ  Ä‘á» xuáº¥t CEO tiáº¿p theo bÃ¡m sÃ¡t dá»¯ liá»‡u kinh doanh má»›i nháº¥t.'
        : 'Keeps future campaigns and CEO recommendations aligned with the latest business evidence.',
    priority: 'high',
    link: `/${args.companyId}/growth-plan`,
    severity: 'high',
    confidence: 'high',
    actionKind: 'operations',
    evidence: driftEvidence ? [toBriefEvidence(driftEvidence)] : [],
    strategicGap,
  }, {
    title,
    why: recommendation,
    impact: expectedImpact,
    issue: title,
    evidenceSummary,
    recommendation,
    expectedImpact,
    marketContext: evidenceSummary,
    todayMove: 'Review the drift evidence and decide whether the Growth Plan should be updated before new execution work starts.',
    sevenDayMove: 'Create and approve the updated Growth Plan draft, then use it as the baseline for the next campaigns and CEO Advisor refresh.',
  }) as BriefAction;
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
      const priority = normalizePriority(undefined, signal.threatLevel);
      const recommendation = truncateAdvisorText(signal.counterMove ?? campaignRecommendation.expectedOutcome ?? '', 700);
      const expectedImpact = campaignRecommendation.expectedOutcome;
      const evidenceSummary = evidence?.detail
        ?? truncateAdvisorText(signal.signalSummary ?? signal.signal ?? category, 1200);
      const issue = `Respond to ${competitorName}'s ${category}`;
      const suggestedAssets = sanitizeSuggestedAssets([
        ...(campaignRecommendation.assets ?? []),
        'social_posts',
        'banner_images',
        ['critical', 'high'].includes(String(signal.threatLevel)) ? 'video' : '',
      ]);

      return Object.assign({
        title: args.language === 'ja'
          ? `${competitorName}の${category}に対応する`
          : args.language === 'vi'
            ? `Ứng phó với ${category} của ${competitorName}`
            : `Respond to ${competitorName}'s ${category}`,
        why: recommendation,
        impact: expectedImpact,
        issue: args.language === 'ja'
          ? `${competitorName}ã®${category}ã«å¯¾å¿œã™ã‚‹`
          : args.language === 'vi'
            ? `á»¨ng phÃ³ vá»›i ${category} cá»§a ${competitorName}`
            : `Respond to ${competitorName}'s ${category}`,
        evidenceSummary,
        recommendation,
        expectedImpact,
        priority,
        link: `/${args.companyId}/campaigns`,
        severity: ['critical', 'high', 'medium', 'low'].includes(String(signal.threatLevel))
          ? signal.threatLevel as BriefAction['severity']
          : 'medium',
        confidence: evidence ? 'high' : 'medium',
        actionKind: 'campaign',
        evidence: evidence ? [toBriefEvidence(evidence)] : [],
        campaignProposal: sanitizeProposal(campaignRecommendation),
        strategicGap: {
          type: 'market_gap',
          marketSignal: evidenceSummary,
          internalMissingPiece: 'No visible counter-campaign has been launched for this competitor signal yet.',
          suggestedAssets,
        } satisfies AdvisorStrategicGap,
      }, {
        issue,
        evidenceSummary,
        recommendation,
        marketContext: evidenceSummary,
        todayMove: args.language === 'vi'
          ? `Hôm nay hãy xác nhận tác động của tín hiệu này với sản phẩm/khách hàng bị ảnh hưởng và duyệt hướng phản hồi cho ${competitorName}.`
          : args.language === 'ja'
            ? `本日、このシグナルが対象商品・顧客に与える影響を確認し、${competitorName}への対応方針を承認してください。`
            : `Today, confirm how this signal affects the impacted product or audience and approve the response direction for ${competitorName}.`,
        sevenDayMove: args.language === 'vi'
          ? 'Trong 7 ngày tới, tạo campaign phản hồi với blog/landing page/social/banner/video phù hợp rồi review trước khi launch.'
          : args.language === 'ja'
            ? '7日以内に、ブログ、ランディングページ、SNS、バナー、動画を含む対応キャンペーンを作成し、公開前に確認してください。'
            : 'Within 7 days, create the response campaign with the right blog, landing page, social, banner, or video assets and review it before launch.',
        expectedImpact,
      }) as BriefAction;
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
      const issue = status === 'generating'
        ? `Campaign is being prepared: ${name}`
        : `Review campaign: ${name}`;
      const recommendation = status === 'generating'
        ? 'Open the campaign to follow generation progress and prepare the CEO review once assets are ready.'
        : 'Review the campaign assets, confirm the message, and decide whether it should launch now.';
      const evidenceSummary = evidence?.detail
        ?? `${status} AI-created campaign in the Campaigns list${assetSummary ? ` with ${assetSummary}` : ''}`;

      return {
        title: issue,
        why: recommendation,
        impact: 'Keeps the recommendation connected to the campaign that was actually created.',
        issue,
        evidenceSummary,
        recommendation,
        expectedImpact: 'Keeps the recommendation connected to the campaign that was actually created.',
        priority: status === 'ready' ? 'high' : 'medium',
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

  return [...newCampaignActions, ...rankedExistingActions]
    .sort((left, right) => actionPriority(right) - actionPriority(left))
    .slice(0, 5);
}

export async function generateCeoBrief(args: {
  companyId: string;
  tenantId: string;
}): Promise<GeneratedBrief> {
  const { companyId, tenantId } = args;
  const context = await buildAdvisorContext({ companyId, tenantId });
  const language = normalizeContentLanguage(context.business.language);
  const evidenceById = new Map(context.evidence.map((item) => [item.id, item]));
  const strategicGaps = buildStrategicGaps(context, evidenceById);
  const unavailableSources = context.sourceHealth
    .filter((source) => source.status === 'unavailable')
    .map((source) => source.source);

  const promptContext = {
    business: context.business,
    growthPlanHealth: context.growthPlanHealth,
    todayMarketPulse: buildTodayMarketPulse(context),
    campaigns: context.campaigns.slice(0, 20),
    blogs: context.blogs.slice(0, 25),
    landingPages: context.landingPages.slice(0, 15),
    knowledge: context.knowledge.slice(0, 12),
    sales: context.sales,
    team: context.team,
    marketSignals: context.marketSignals,
    strategicGaps,
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
  const system = `You are an evidence-grounded CEO Advisor for the company owner.
Your job is to identify CEO-level strategic decisions, not to create a department task board.
Use the supplied company, Brain Hub, campaign, sales, landing page, market, and competitor data.

Rules:
- Return STRICT JSON only. No markdown or prose outside JSON.
- ${buildContentLanguageInstruction(language)}
- Never treat an unavailable source as an empty business result.
- Every action must follow this exact business reasoning order: Issue -> Evidence -> Recommendation -> Expected Impact -> Priority.
- Every action must cite 1-4 IDs from evidenceCatalog in "evidenceIds".
- Do not cite IDs that are not present in evidenceCatalog.
- Prefer specific facts, observed gaps, user-provided Brain Hub data, and measured outcomes.
- Treat strategicGaps as the highest-signal shortlist. Use them before generic advice unless stronger evidence contradicts them.
- Treat todayMarketPulse as the CEO's "what changed in the market today" brief. Use it to decide what the CEO must notice now.
- Compare external market movement with internal missing assets: if a competitor signal exists and the company lacks matching blog, landing page, social, banner, or video assets, make that gap explicit.
- Use Knowledge Hub entries as factual inputs for campaign angles, offers, objections, product proof, FAQs, and customer language.
- If strategicGaps.suggestedAssets includes "video", mention video creative only when it helps explain or differentiate the offer.
- Do not claim a campaign or blog performed well unless metrics or learnings support it.
- Rank actions by expected impact, urgency, evidence strength, strategic fit, and execution readiness.
- Do not invent metrics. If metrics are missing, say the evidence is qualitative and lower the confidence.
- "issue" must describe the detected business problem or strategic opportunity.
- "marketContext" must state the newest market/competitor information the CEO needs to know today. If the action is not market-driven, state the latest internal signal instead.
- "evidenceSummary" must explain the concrete data or observed signal behind the issue.
- "recommendation" must be a CEO-level decision or direction, written as a specific next move.
- "todayMove" must tell the CEO what to do today in response to the market/internal signal.
- "sevenDayMove" must tell the CEO what should be completed in the next 7 days.
- "expectedImpact" must describe the company-level business result expected from the recommendation.
- "priority" must be exactly one of: urgent, high, medium, low.
- Recommend a new campaign only when there is a supported audience, product, content gap, customer signal, market signal, or repeatable prior win.
- When marketSignals include a high/critical product launch, pricing change, or content-positioning move, propose a counter-campaign if it protects an affected product or audience.
- Campaign recommendations must use actionKind "campaign" and include campaignProposal.
- When an action is based on strategicGaps, copy its type, marketSignal, internalMissingPiece, suggestedAssets, and supportingKnowledge into "strategicGap".
- A campaignProposal is a draft for human review, never an instruction to auto-publish.
- For each action, include "responsibleDepartments": the departments or roles that should execute the CEO decision.
- responsibleDepartments.ownerAgentId may be included only when it exactly matches an ID from the supplied team.
- responsibleDepartments are execution owners; they must not become the main recommendation.
- Include "weeklyActions": 5-7 timeline items for what should happen this week after this refresh.
- weeklyActions must use the same evidenceCatalog, todayMarketPulse, strategicGaps, Knowledge Hub, campaigns, and marketSignals already supplied. Do not use a separate source.
- weeklyActions must be ordered by day 1-7. Put urgent/high market responses earlier in the week, validation/measurement later in the week.
- weeklyActions should be practical daily moves, not generic reminders. Each item must cite 1-3 evidenceIds from evidenceCatalog when evidence is available.
- If the user refreshes after new crawl/market scan data, weeklyActions should naturally change based on that new evidence.
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
    "issue": string,
    "marketContext": string,
    "evidenceSummary": string,
    "recommendation": string,
    "todayMove": string,
    "sevenDayMove": string,
    "expectedImpact": string,
    "priority": "urgent"|"high"|"medium"|"low",
    "link": string?,
    "confidence": "high"|"medium"|"low",
    "actionKind": "campaign"|"content"|"sales"|"market"|"operations",
    "evidenceIds": string[],
    "strategicGap": {
      "type": "market_gap"|"content_gap"|"creative_gap"|"channel_gap"|"conversion_gap"|"knowledge_gap",
      "marketSignal": string?,
      "internalMissingPiece": string?,
      "suggestedAssets": ("blog"|"landing_page"|"social_posts"|"banner_images"|"video"|"market_scan"|"sales_enablement")[],
      "supportingKnowledge": string[]
    }?,
    "responsibleDepartments": [{
      "department": string,
      "ownerAgentId": string?,
      "responsibility": string,
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
  "weeklyActions": [{
    "day": 1,
    "dayLabel": "Day 1",
    "title": "short daily action title",
    "action": "specific action to perform on this day",
    "why": "why this is the right move based on evidence",
    "ownerDepartment": "Executive|Marketing|Sales|Content|Analytics|Operations",
    "priority": "urgent|high|medium|low",
    "evidenceIds": ["id-from-evidenceCatalog"],
    "successSignal": "what should be true by the end of the day",
    "link": string?
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
        strategicGapCount: strategicGaps.length,
        unavailableSources,
      },
    },
  );

  const parsed = extractJSON(llm.text) ?? {};
  const generatedActions: BriefAction[] = Array.isArray(parsed.actions)
    ? parsed.actions
      .slice(0, 5)
      .map((raw: any): BriefAction | null => {
        const issue = truncateAdvisorText(raw?.issue ?? raw?.title ?? '', 240);
        const evidenceSummary = truncateAdvisorText(
          raw?.evidenceSummary
            ?? (typeof raw?.evidence === 'string' ? raw.evidence : raw?.why)
            ?? '',
          1200,
        );
        const recommendation = truncateAdvisorText(raw?.recommendation ?? raw?.why ?? '', 900);
        const marketContext = truncateAdvisorText(
          raw?.marketContext
            ?? raw?.todayMarketContext
            ?? raw?.marketSignal
            ?? raw?.strategicGap?.marketSignal
            ?? '',
          900,
        );
        const todayMove = truncateAdvisorText(raw?.todayMove ?? raw?.todayAction ?? '', 700);
        const sevenDayMove = truncateAdvisorText(
          raw?.sevenDayMove
            ?? raw?.nextSevenDaysMove
            ?? raw?.weekMove
            ?? raw?.sevenDayAction
            ?? '',
          800,
        );
        const expectedImpact = truncateAdvisorText(
          String(raw?.expectedImpact ?? raw?.impact ?? '').trim()
            || 'Expected impact needs CEO review because the available evidence does not include enough performance metrics yet.',
          500,
        );
        if (!issue || !evidenceSummary || !recommendation) return null;

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

        const priority = normalizePriority(raw?.priority, raw?.severity);
        const severity = VALID_SEVERITY.has(raw?.severity)
          ? raw.severity as BriefAction['severity']
          : PRIORITY_TO_SEVERITY[priority];
        const evidence = evidenceIds
          .map((id) => evidenceById.get(id))
          .filter((item): item is AdvisorEvidence => Boolean(item))
          .map(toBriefEvidence);
        const strategicGap = sanitizeStrategicGap(raw?.strategicGap);

        return {
          title: issue,
          why: recommendation,
          impact: expectedImpact,
          issue,
          evidenceSummary,
          recommendation,
          marketContext: marketContext || evidenceSummary,
          todayMove: todayMove || recommendation,
          sevenDayMove: sevenDayMove || expectedImpact,
          expectedImpact,
          priority,
          link: validLink(raw?.link, companyId),
          severity,
          confidence: VALID_CONFIDENCE.has(raw?.confidence) ? raw.confidence : 'medium',
          actionKind,
          evidence,
          strategicGap,
          campaignProposal,
          responsibleDepartments: sanitizeResponsibleDepartments(raw?.responsibleDepartments, context.team),
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
      ].sort((left, right) => actionPriority(right) - actionPriority(left)).slice(0, 5)
    : combinedActions.sort((left, right) => actionPriority(right) - actionPriority(left)).slice(0, 5);
  const assignedActions = assignAdvisorTeamTasks(prioritizedActions, context.team, language);
  const generatedWeeklyActions = sanitizeWeeklyActions({
    value: parsed.weeklyActions,
    evidenceById,
    companyId,
    language,
  });
  const weeklyActions = generatedWeeklyActions.length >= 3
    ? generatedWeeklyActions
    : buildFallbackWeeklyActions({
        actions: assignedActions,
        language,
      });

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
        : language === 'vi'
          ? 'Một số dữ liệu công ty chưa đọc được'
          : 'Some company data was unavailable',
      detail: language === 'ja'
        ? `Advisorは次の情報を読み取れませんでした: ${unavailableSources.join(', ')}。提案では、これらの情報源が空であるとは仮定しません。`
        : language === 'vi'
          ? `Advisor chưa đọc được: ${unavailableSources.join(', ')}. Các đề xuất sẽ không tự giả định những nguồn này đang trống.`
          : `Advisor could not read: ${unavailableSources.join(', ')}. Recommendations avoid assuming those sources are empty.`,
      link: `/${companyId}/brain`,
    });
  }

  return {
    headline: typeof parsed.headline === 'string' && parsed.headline.trim()
      ? parsed.headline.trim().slice(0, 300)
      : language === 'ja'
        ? '本日のデータに基づくアドバイスです。'
        : language === 'vi'
          ? 'Đây là bản tư vấn hôm nay dựa trên dữ liệu thực tế.'
          : 'Here is your evidence-based brief for today.',
    actions: assignedActions,
    weeklyActions,
    wins,
    alerts,
    sourcesUsed: {
      campaignsCount: context.counts.campaigns,
      blogsCount: context.counts.blogs,
      landingPagesCount: context.counts.landingPages,
      knowledgeCount: context.knowledge.length,
      dealsCount: context.counts.deals,
      marketScansCount: context.counts.marketScans,
      learningsCount: context.counts.learnings,
      brainEventsCount: context.counts.brainEvents,
      videosCount: context.counts.videos,
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
      weeklyActions: result.weeklyActions,
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
