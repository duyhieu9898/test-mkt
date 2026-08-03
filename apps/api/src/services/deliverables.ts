import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import {
  deliverables,
  tasks,
  type Deliverable,
  type DeliverableContent,
  type DeliverableEvidence,
  type DeliverableType,
} from '@1person/core/db';
import type { BriefAction } from '@1person/ai-tenant';
import { db } from '../lib/db';
import {
  normalizeContentLanguage,
  resolveCompanyLanguage,
  type ContentLanguage,
} from '../lib/language';

type AdvisorPriority = 'urgent' | 'high' | 'medium' | 'low';

export interface AdvisorDeliverableLink {
  actionIndex: number;
  deliverableId: string;
  taskId: string | null;
  type: DeliverableType;
  status: Deliverable['status'];
}

function priorityOf(action: BriefAction): AdvisorPriority {
  if (action.priority) return action.priority;
  if (action.severity === 'critical') return 'urgent';
  return action.severity ?? 'medium';
}

function taskPriority(priority: AdvisorPriority): 'critical' | 'high' | 'medium' | 'low' {
  return priority === 'urgent' ? 'critical' : priority;
}

function deliverableTypeOf(action: BriefAction): DeliverableType {
  if (action.campaignProposal || action.actionKind === 'campaign') return 'campaign_brief';
  if (action.actionKind === 'market') return 'market_report';
  if (action.actionKind === 'content') return 'content_plan';
  return 'decision_memo';
}

function localizedTypeLabel(type: DeliverableType, language: ContentLanguage): string {
  const labels: Record<ContentLanguage, Record<DeliverableType, string>> = {
    en: {
      decision_memo: 'Decision memo',
      campaign_brief: 'Campaign brief',
      content_plan: 'Content plan',
      market_report: 'Market report',
      executive_report: 'Executive report',
    },
    vi: {
      decision_memo: 'Bản ghi nhớ quyết định',
      campaign_brief: 'Bản tóm tắt chiến dịch',
      content_plan: 'Kế hoạch nội dung',
      market_report: 'Báo cáo thị trường',
      executive_report: 'Báo cáo điều hành',
    },
    ja: {
      decision_memo: '意思決定メモ',
      campaign_brief: 'キャンペーン概要',
      content_plan: 'コンテンツ計画',
      market_report: '市場レポート',
      executive_report: '経営レポート',
    },
  };
  return labels[language][type];
}

function ownerFromAction(action: BriefAction) {
  const responsible = action.responsibleDepartments?.[0];
  const teamTask = action.teamTasks?.[0];
  return {
    agentId: responsible?.ownerAgentId ?? teamTask?.agentId,
    department: responsible?.department ?? teamTask?.department,
  };
}

function contentFromAction(action: BriefAction): DeliverableContent {
  return {
    issue: action.issue || action.title,
    recommendation: action.recommendation || action.why,
    expectedImpact: action.expectedImpact || action.impact,
    evidenceSummary: action.evidenceSummary,
    todayMove: action.todayMove,
    sevenDayMove: action.sevenDayMove,
    campaignProposal: action.campaignProposal as unknown as Record<string, unknown> | undefined,
    strategicGap: action.strategicGap as unknown as Record<string, unknown> | undefined,
    responsibilities: action.responsibleDepartments as unknown as Array<Record<string, unknown>> | undefined,
    teamTasks: action.teamTasks as unknown as Array<Record<string, unknown>> | undefined,
  };
}

/**
 * Converts grounded CEO Advisor actions into persistent reviewable outputs.
 * No additional LLM call is needed: the brief already contains the issue,
 * evidence, recommendation, expected impact, and execution owners.
 */
export async function syncAdvisorDeliverables(args: {
  companyId: string;
  briefId: string;
  actions: BriefAction[];
  actorUserId?: string;
  language?: string;
}): Promise<AdvisorDeliverableLink[]> {
  const language = args.language
    ? normalizeContentLanguage(args.language)
    : await resolveCompanyLanguage(args.companyId);
  const sourceKeys = args.actions.map((_, index) => `ceo_advisor:${args.briefId}:${index}`);

  const existing = sourceKeys.length
    ? await db
        .select()
        .from(deliverables)
        .where(and(
          eq(deliverables.companyId, args.companyId),
          inArray(deliverables.sourceKey, sourceKeys),
        ))
    : [];
  const bySourceKey = new Map(existing.map((item) => [item.sourceKey, item]));

  for (const [actionIndex, action] of args.actions.entries()) {
    const sourceKey = `ceo_advisor:${args.briefId}:${actionIndex}`;
    if (bySourceKey.has(sourceKey)) continue;

    const deliverableId = randomUUID();
    const taskId = randomUUID();
    const type = deliverableTypeOf(action);
    const priority = priorityOf(action);
    const owner = ownerFromAction(action);
    const title = `${localizedTypeLabel(type, language)}: ${action.issue || action.title}`.slice(0, 300);
    const content = contentFromAction(action);
    const evidence = (action.evidence ?? []).map((item): DeliverableEvidence => ({
      id: item.id,
      sourceType: item.sourceType,
      sourceId: item.sourceId,
      label: item.label,
      detail: item.detail,
      link: item.link,
      occurredAt: item.occurredAt,
      score: item.score,
    }));

    try {
      await db.transaction(async (tx) => {
        await tx.insert(tasks).values({
          id: taskId,
          companyId: args.companyId,
          title,
          description: content.recommendation,
          type: 'advisor_work_order',
          assignedAgentId: owner.agentId,
          createdByUserId: args.actorUserId,
          status: 'waiting_approval',
          priority: taskPriority(priority),
          progress: 100,
          input: {
            type: 'ceo_advisor_action',
            data: {
              briefId: args.briefId,
              actionIndex,
              deliverableType: type,
            },
          },
          output: {
            type: 'deliverable',
            data: { deliverableId },
          },
        });

        await tx.insert(deliverables).values({
          id: deliverableId,
          companyId: args.companyId,
          taskId,
          ownerAgentId: owner.agentId,
          createdByUserId: args.actorUserId,
          type,
          status: 'ready_for_review',
          priority,
          title,
          summary: content.recommendation,
          content,
          evidence,
          ownerDepartment: owner.department,
          language,
          sourceType: 'ceo_advisor',
          sourceId: args.briefId,
          sourceActionIndex: actionIndex,
          sourceKey,
          metadata: {
            confidence: action.confidence ?? 'medium',
            actionKind: action.actionKind ?? 'operations',
          },
        });
      });
    } catch (error) {
      // A concurrent Dashboard/Advisor request may materialize the same action.
      // Re-read the unique source instead of creating duplicate work.
      const concurrent = await db.query.deliverables.findFirst({
        where: and(
          eq(deliverables.companyId, args.companyId),
          eq(deliverables.sourceKey, sourceKey),
        ),
      });
      if (!concurrent) throw error;
      bySourceKey.set(sourceKey, concurrent);
      continue;
    }

    const created = await db.query.deliverables.findFirst({
      where: eq(deliverables.id, deliverableId),
    });
    if (created) bySourceKey.set(sourceKey, created);
  }

  return sourceKeys.flatMap((sourceKey, actionIndex) => {
    const item = bySourceKey.get(sourceKey);
    return item
      ? [{
          actionIndex,
          deliverableId: item.id,
          taskId: item.taskId,
          type: item.type,
          status: item.status,
        }]
      : [];
  });
}
