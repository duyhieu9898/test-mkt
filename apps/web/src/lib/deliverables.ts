import type { AppLanguage } from '@/lib/app-language';

export type DeliverableType =
  | 'decision_memo'
  | 'campaign_brief'
  | 'content_plan'
  | 'market_report'
  | 'executive_report';

export type DeliverableStatus =
  | 'suggested'
  | 'generating'
  | 'ready_for_review'
  | 'approved'
  | 'published'
  | 'archived'
  | 'failed';

export interface Deliverable {
  id: string;
  companyId: string;
  taskId: string | null;
  ownerAgentId: string | null;
  type: DeliverableType;
  status: DeliverableStatus;
  priority: 'urgent' | 'high' | 'medium' | 'low';
  title: string;
  summary: string | null;
  content: {
    issue: string;
    recommendation: string;
    expectedImpact?: string;
    evidenceSummary?: string;
    todayMove?: string;
    sevenDayMove?: string;
    campaignProposal?: Record<string, unknown>;
    strategicGap?: Record<string, unknown>;
    responsibilities?: Array<Record<string, unknown>>;
    teamTasks?: Array<Record<string, unknown>>;
  };
  evidence: Array<{
    id: string;
    sourceType: string;
    sourceId?: string;
    label: string;
    detail: string;
    link?: string;
    occurredAt?: string;
    score?: number;
  }>;
  ownerDepartment: string | null;
  language: string;
  sourceType: string;
  sourceId: string;
  sourceActionIndex: number | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

const typeLabels: Record<AppLanguage, Record<DeliverableType, string>> = {
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

export function deliverableTypeLabel(type: DeliverableType, language: AppLanguage) {
  return typeLabels[language][type] ?? type.replaceAll('_', ' ');
}
