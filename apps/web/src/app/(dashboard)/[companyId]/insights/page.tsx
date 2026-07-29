'use client';

/**
 * CEO Advisor — cross-domain "what should I do today?" brief.
 * The first brief is prepared during onboarding; later refreshes use one LLM call.
 * See docs/architecture/10-venture-ceo-ia.md §8.
 */

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sparkles, RefreshCw, Loader2, ArrowRight, Trophy, AlertTriangle, Coins, Target, Database, Users, CalendarDays } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { api } from '@/lib/api/client';
import { friendlyError } from '@/lib/friendly-errors';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { FirstVisitTip } from '@/components/first-visit-tip';
import { OutOfCreditsModal } from '@/components/out-of-credits-modal';
import { usePreferredAppLanguage } from '@/lib/use-preferred-app-language';
import { useMyCompanyAccess } from '@/lib/api/company-access-hooks';
import { hasCompanyPermission } from '@/lib/company-access';

type Severity = 'critical' | 'high' | 'medium' | 'low';
type Priority = 'urgent' | 'high' | 'medium' | 'low';
type Confidence = 'high' | 'medium' | 'low';
interface BriefEvidence {
  id: string;
  sourceType: string;
  label: string;
  detail: string;
  link?: string;
}
interface CampaignProposal {
  goal: string;
  audience: string;
  offer?: string;
  publicTopic?: string;
  contentAngle?: string;
  channels: string[];
  assets: string[];
  expectedOutcome?: string;
}
interface StrategicGap {
  type: 'market_gap' | 'content_gap' | 'creative_gap' | 'channel_gap' | 'conversion_gap' | 'knowledge_gap';
  marketSignal?: string;
  internalMissingPiece?: string;
  suggestedAssets?: Array<'blog' | 'landing_page' | 'social_posts' | 'banner_images' | 'video' | 'market_scan' | 'sales_enablement'>;
  supportingKnowledge?: string[];
}
interface BriefAction {
  title: string;
  why: string;
  impact?: string;
  link?: string;
  severity?: Severity;
  priority?: Priority;
  confidence?: Confidence;
  issue?: string;
  evidenceSummary?: string;
  recommendation?: string;
  expectedImpact?: string;
  marketContext?: string;
  todayMove?: string;
  sevenDayMove?: string;
  strategicGap?: StrategicGap;
  evidence?: BriefEvidence[];
  actionKind?: 'campaign' | 'content' | 'sales' | 'market' | 'operations';
  campaignProposal?: CampaignProposal;
  responsibleDepartments?: AdvisorResponsibleDepartment[];
  teamTasks?: AdvisorTeamTask[];
}
interface AdvisorResponsibleDepartment {
  department: string;
  ownerAgentId?: string;
  ownerName?: string;
  role?: string;
  title?: string;
  responsibility: string;
  expectedOutcome?: string;
}
interface AdvisorTeamTask {
  agentId: string;
  agentName: string;
  role: string;
  title?: string;
  department?: string;
  task: string;
  expectedOutcome?: string;
}
interface BriefWin { what: string; detail?: string; }
interface BriefAlert { what: string; detail?: string; link?: string; }
interface SourceHealth { source: string; status: 'ok' | 'empty' | 'unavailable'; count: number; message?: string; }
interface AdvisorWeeklyAction {
  day: number;
  dayLabel: string;
  title: string;
  action: string;
  why: string;
  ownerDepartment?: string;
  priority?: Priority;
  evidenceIds?: string[];
  successSignal?: string;
  link?: string;
}
interface AdvisorBrief {
  id: string;
  generatedAt: string;
  headline: string | null;
  actions: BriefAction[];
  weeklyActions?: AdvisorWeeklyAction[];
  wins: BriefWin[];
  alerts: BriefAlert[];
  sourcesUsed: {
    campaignsCount?: number;
    blogsCount?: number;
    landingPagesCount?: number;
    knowledgeCount?: number;
    dealsCount?: number;
    marketScansCount?: number;
    learningsCount?: number;
    brainEventsCount?: number;
    videosCount?: number;
    sourceHealth?: SourceHealth[];
  };
}
interface CreditResponse {
  balance: { totalAvailable: number };
  costs?: {
    campaignGenerate?: Partial<Record<'fast' | 'balanced' | 'premium', number>>;
    advisorCampaignBridge?: number;
    supportMessage?: string;
  };
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const priorityStyles: Record<Priority, string> = {
  urgent: 'bg-red-100 text-red-700 border-red-200',
  high: 'bg-amber-100 text-amber-700 border-amber-200',
  medium: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  low: 'bg-slate-100 text-slate-600 border-slate-200',
};

const confidenceStyles: Record<Confidence, string> = {
  high: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  medium: 'bg-blue-50 text-blue-700 border-blue-200',
  low: 'bg-slate-50 text-slate-600 border-slate-200',
};

function readableRole(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function departmentFromTask(task: AdvisorTeamTask): string {
  if (task.department?.trim()) return task.department.trim();
  if (task.role === 'ceo') return 'Executive';
  if (task.role === 'sales_manager') return 'Sales';
  if (['analyst'].includes(task.role)) return 'Analytics';
  if (['content_creator'].includes(task.role)) return 'Content';
  return 'Marketing';
}

function priorityFromAction(action: BriefAction): Priority {
  if (action.priority) return action.priority;
  if (action.severity === 'critical') return 'urgent';
  if (action.severity === 'high') return 'high';
  if (action.severity === 'low') return 'low';
  return 'medium';
}

const priorityRank: Record<Priority, number> = {
  urgent: 4,
  high: 3,
  medium: 2,
  low: 1,
};

function actionSortScore(action: BriefAction): number {
  const priority = priorityRank[priorityFromAction(action)];
  const confidence = { high: 3, medium: 2, low: 1 }[action.confidence ?? 'medium'];
  const evidence = Math.min(3, action.evidence?.length ?? 0);
  const campaignReady = action.campaignProposal ? 1 : 0;
  return priority * 10 + confidence * 2 + evidence + campaignReady;
}

function assetLabel(value: string): string {
  const labels: Record<string, string> = {
    blog: 'Blog',
    landing_page: 'Landing page',
    social_posts: 'Social posts',
    banner_images: 'Banners',
    video: 'Video',
    market_scan: 'Market scan',
    sales_enablement: 'Sales support',
  };
  return labels[value] ?? value.replaceAll('_', ' ');
}

function responsibleDepartments(action: BriefAction): AdvisorResponsibleDepartment[] {
  if (action.responsibleDepartments?.length) return action.responsibleDepartments;
  return (action.teamTasks ?? []).map((task) => ({
    department: departmentFromTask(task),
    ownerAgentId: task.agentId,
    ownerName: task.agentName,
    role: task.role,
    title: task.title,
    responsibility: task.task,
    expectedOutcome: task.expectedOutcome,
  }));
}

function actionIssue(action: BriefAction): string {
  return action.issue || action.title;
}

function actionEvidenceSummary(action: BriefAction): string {
  return action.evidenceSummary
    || action.evidence?.map((evidence) => `${evidence.label}: ${evidence.detail}`).join(' ')
    || action.why;
}

function actionRecommendation(action: BriefAction): string {
  return action.recommendation || action.why;
}

function actionExpectedImpact(action: BriefAction): string | undefined {
  return action.expectedImpact || action.impact;
}

function actionMarketContext(action: BriefAction): string | undefined {
  return action.marketContext || action.strategicGap?.marketSignal;
}

function actionTodayMove(action: BriefAction): string {
  return action.todayMove || actionRecommendation(action);
}

function actionSevenDayMove(action: BriefAction): string {
  return action.sevenDayMove || actionExpectedImpact(action) || 'Review progress within 7 days and refresh CEO Advisor with the latest evidence.';
}

export default function CeoAdvisorPage() {
  const params = useParams();
  const router = useRouter();
  const companyId = params.companyId as string;
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  const autoGenerateAttemptedFor = useRef<string | null>(null);
  const [creatingActionIndex, setCreatingActionIndex] = useState<number | null>(null);
  const [outOfCreditsOpen, setOutOfCreditsOpen] = useState(false);
  const [outOfCreditsRequired, setOutOfCreditsRequired] = useState<number | undefined>();
  const [outOfCreditsAvailable, setOutOfCreditsAvailable] = useState<number | undefined>();
  const [language] = usePreferredAppLanguage('en');
  const accessQ = useMyCompanyAccess(companyId);
  const canRefreshAdvice = hasCompanyPermission(accessQ.data, 'ceo_advisor.refresh');
  const refreshPermissionMessage =
    'Only the company Owner or Admin can generate or refresh CEO advice.';

  const latestQ = useQuery({
    queryKey: ['ceo-advisor', 'latest', companyId],
    queryFn: () => api.get<{ brief: AdvisorBrief | null }>(`/insights/${companyId}/advisor/latest`, { token: token! }),
    enabled: !!token,
  });

  const brief = latestQ.data?.brief ?? null;
  const hasAdvice = Boolean(brief);

  const creditsQ = useQuery({
    queryKey: ['credits', companyId],
    queryFn: () => api.get<CreditResponse>(`/credits/${companyId}`, { token: token! }),
    enabled: !!token && !!companyId,
    staleTime: 30_000,
  });
  const advisorCampaignCreditCost =
    (creditsQ.data?.costs?.campaignGenerate?.balanced ?? 5)
    + (creditsQ.data?.costs?.advisorCampaignBridge ?? 0);
  const availableCredits = creditsQ.data?.balance.totalAvailable;
  const hasEnoughAdvisorCampaignCredits =
    typeof availableCredits !== 'number' || availableCredits >= advisorCampaignCreditCost;

  const refreshM = useMutation({
    mutationFn: () => {
      if (!canRefreshAdvice) throw new Error(refreshPermissionMessage);
      return api.post<{ brief: AdvisorBrief }>(
        `/insights/${companyId}/advisor/refresh`,
        { language },
        { token: token! },
      );
    },
    onSuccess: (data) => {
      toast.success(hasAdvice ? 'Advice refreshed' : 'Your first advice is ready');
      qc.setQueryData(['ceo-advisor', 'latest', companyId], data);
      qc.invalidateQueries({ queryKey: ['ceo-advisor', 'latest', companyId] });
    },
    onError: (err) => toast.error(friendlyError(err)),
  });

  const createCampaignM = useMutation({
    mutationFn: async ({ action, index }: { action: BriefAction; index: number }) => {
      if (!action.campaignProposal) throw new Error('No campaign recommendation found.');
      const proposal = action.campaignProposal;
      const reason = actionIssue(action);

      setCreatingActionIndex(index);
      return api.post<{
        campaignId: string;
        streamUrl: string;
        estimatedCost: number;
        tier: string;
      }>(
        `/campaigns/${companyId}/generate`,
        {
          goal: proposal.goal,
          audience: proposal.audience,
          reason,
          channel: proposal.channels[0],
          offer: proposal.offer,
          contentTopic: proposal.publicTopic,
          contentAngle: proposal.contentAngle,
          expectedOutcome: proposal.expectedOutcome,
          language,
          tier: 'balanced',
          advisorBriefId: brief?.id,
          advisorActionIndex: index,
          advisorActionTitle: actionIssue(action),
          advisorEvidenceIds: (action.evidence ?? []).map((evidence) => evidence.id),
        },
        { token: token! },
      );
    },
    onSuccess: (data) => {
      toast.success('Campaign is being created');
      qc.invalidateQueries({ queryKey: ['credits', companyId] });
      qc.invalidateQueries({ queryKey: ['ceo-advisor', 'latest', companyId] });
      router.push(`/${companyId}/campaigns/${data.campaignId}`);
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : '';
      const match = message.match(/need\s+(\d+)\s+credits?\s+but\s+only\s+have\s+(\d+)/i);
      if (/credit|402/i.test(message)) {
        setOutOfCreditsRequired(match ? Number(match[1]) : advisorCampaignCreditCost);
        setOutOfCreditsAvailable(match ? Number(match[2]) : availableCredits);
        setOutOfCreditsOpen(true);
        return;
      }
      toast.error(friendlyError(err));
    },
    onSettled: () => setCreatingActionIndex(null),
  });

  const refreshing = refreshM.isPending;
  const sortedActions = brief
    ? brief.actions
      .map((action, originalIndex) => ({ action, originalIndex }))
      .sort((left, right) => actionSortScore(right.action) - actionSortScore(left.action))
    : [];
  const marketPulse = sortedActions
    .map(({ action, originalIndex }) => ({
      originalIndex,
      priority: priorityFromAction(action),
      context: actionMarketContext(action),
      issue: actionIssue(action),
    }))
    .filter((item) => Boolean(item.context))
    .slice(0, 3);
  const weeklyActions = [...(brief?.weeklyActions ?? [])]
    .sort((left, right) => left.day - right.day)
    .slice(0, 7);

  useEffect(() => {
    if (
      !token
      || !companyId
      || !latestQ.isSuccess
      || !accessQ.isSuccess
      || !canRefreshAdvice
      || latestQ.data.brief !== null
      || autoGenerateAttemptedFor.current === companyId
    ) {
      return;
    }

    autoGenerateAttemptedFor.current = companyId;
    refreshM.mutate();
  }, [accessQ.isSuccess, canRefreshAdvice, companyId, latestQ.data?.brief, latestQ.isSuccess, refreshM.mutate, token]);

  const AdviceActionButton = (
    <Button
      onClick={() => {
        if (!canRefreshAdvice) {
          toast.error(refreshPermissionMessage);
          return;
        }
        refreshM.mutate();
      }}
      disabled={refreshing || !token || accessQ.isLoading || !canRefreshAdvice}
      title={!canRefreshAdvice ? refreshPermissionMessage : undefined}
      className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white w-full sm:w-auto"
    >
      {refreshing ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : hasAdvice ? (
        <RefreshCw className="w-4 h-4" />
      ) : (
        <Sparkles className="w-4 h-4" />
      )}
      {refreshing
        ? hasAdvice ? 'Refreshing...' : 'Creating advice...'
        : !canRefreshAdvice ? 'Owner/Admin only' : hasAdvice ? 'Refresh advice' : 'Generate advice'}
      <Badge className="ml-1 bg-indigo-500 text-white gap-1 hover:bg-indigo-500">
        <Coins className="w-3 h-3" /> 10
      </Badge>
    </Button>
  );

  if (latestQ.isLoading) {
    return (
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="h-10 w-64 bg-slate-100 rounded-lg animate-pulse" />
        <div className="h-32 bg-slate-100 rounded-lg animate-pulse" />
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-24 bg-slate-100 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <FirstVisitTip
        tipKey="insights"
        title="Your AI Chief of Staff"
        body={
          hasAdvice
            ? 'Refresh advice whenever you want a new set of prioritized actions based on the latest company data. Each refresh uses 10 credits.'
            : refreshing
              ? 'Your Chief of Staff is reading your company data and preparing your first prioritized actions.'
              : 'Your first advice is generated automatically from your Brain Hub, campaigns, blogs, customers, and performance data.'
        }
      />
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-indigo-500" /> CEO Advisor
          </h1>
          <p className="text-sm text-slate-600 mt-1 max-w-2xl">
            Prioritized actions grounded in your Brain Hub, campaigns, blogs, customers, and performance data.
          </p>
          {brief && <p className="text-xs text-slate-400 mt-1">Last refreshed {relativeTime(brief.generatedAt)}</p>}
        </div>
        {brief && AdviceActionButton}
      </div>

      {!brief && (
        <Card className="border-dashed">
          <CardContent className="p-10 text-center">
            {refreshing ? (
              <>
                <Loader2 className="w-10 h-10 text-indigo-500 mx-auto mb-3 animate-spin" />
                <h2 className="text-lg font-semibold text-slate-900">Creating your first advice</h2>
                <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
                  Your Chief of Staff is reviewing your company context and deciding what deserves attention first.
                </p>
              </>
            ) : refreshM.isError ? (
              <>
                <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto mb-3" />
                <h2 className="text-lg font-semibold text-slate-900">Advice could not be created</h2>
                <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
                  Your company data is safe. Try again when you are ready.
                </p>
                <div className="mt-5 inline-block">{AdviceActionButton}</div>
              </>
            ) : (
              <>
                <Loader2 className="w-10 h-10 text-indigo-500 mx-auto mb-3 animate-spin" />
                <h2 className="text-lg font-semibold text-slate-900">Preparing CEO Advisor</h2>
                <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
                  Checking whether your company already has advice.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {brief && (
        <>
          {brief.headline && (
            <Card className="bg-gradient-to-br from-indigo-50 to-white border-indigo-200">
              <CardContent className="p-6">
                <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wider mb-2">Today's brief</p>
                <p className="text-lg sm:text-xl font-semibold text-slate-900 leading-snug">{brief.headline}</p>
              </CardContent>
            </Card>
          )}

          {marketPulse.length > 0 && (
            <section>
              <div className="mb-3">
                <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-500">
                  <Target className="h-4 w-4 text-indigo-600" /> Today's market pulse
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  The newest market or competitor signals the CEO should understand before choosing today’s work.
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                {marketPulse.map((item) => (
                  <Card key={`${item.originalIndex}-${item.issue}`} className="border-indigo-100 bg-indigo-50/40">
                    <CardContent className="p-4">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <Badge className={cn('border capitalize', priorityStyles[item.priority])}>
                          {item.priority}
                        </Badge>
                        <span className="text-[11px] font-medium text-slate-500">Today</span>
                      </div>
                      <p className="break-words text-sm font-semibold leading-snug text-slate-950">{item.issue}</p>
                      <p className="mt-2 break-words text-sm leading-relaxed text-slate-700">{item.context}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          )}

          {weeklyActions.length > 0 && (
            <section>
              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-500">
                    <CalendarDays className="h-4 w-4 text-indigo-600" /> Weekly actions
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    A practical timeline for this week. Refresh after new crawl or market scan data to update the plan.
                  </p>
                </div>
                <Badge variant="outline" className="w-fit border-indigo-200 bg-indigo-50 text-indigo-700">
                  {weeklyActions.length} days planned
                </Badge>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {weeklyActions.map((item) => {
                  const priority = item.priority ?? 'medium';
                  return (
                    <Card key={`${item.day}-${item.title}`} className="border-0 shadow-sm ring-1 ring-slate-200">
                      <CardContent className="flex h-full flex-col p-4">
                        <div className="flex items-center justify-between gap-2">
                          <span className="rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white">
                            {item.dayLabel || `Day ${item.day}`}
                          </span>
                          <Badge className={cn('border text-[11px] capitalize', priorityStyles[priority])}>
                            {priority}
                          </Badge>
                        </div>
                        <h3 className="mt-3 break-words text-sm font-semibold leading-snug text-slate-950">{item.title}</h3>
                        <p className="mt-2 break-words text-sm leading-relaxed text-slate-700">{item.action}</p>
                        <div className="mt-3 rounded-lg bg-slate-50 p-2.5">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Why</p>
                          <p className="mt-1 break-words text-xs leading-relaxed text-slate-600">{item.why}</p>
                        </div>
                        <div className="mt-auto pt-3">
                          {item.ownerDepartment && (
                            <p className="text-xs text-slate-500">
                              Owner: <span className="font-medium text-slate-700">{item.ownerDepartment}</span>
                            </p>
                          )}
                          {item.successSignal && (
                            <p className="mt-1 text-xs leading-relaxed text-emerald-700">{item.successSignal}</p>
                          )}
                          {item.link && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="mt-3 w-full gap-1"
                              onClick={() => router.push(item.link!)}
                            >
                              Review <ArrowRight className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </section>
          )}

          <section>
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-500">
                  <Sparkles className="h-4 w-4 text-indigo-600" /> CEO strategic priorities
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Each recommendation explains the issue, evidence, CEO decision, expected impact, and execution owners.
                </p>
              </div>
              <Button type="button" size="sm" variant="outline" className="w-fit" onClick={() => router.push(`/${companyId}/team`)}>
                View AI Team <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            </div>

            {sortedActions.length === 0 ? (
              <Card><CardContent className="p-6 text-center text-sm text-slate-500">No urgent CEO decisions right now. Keep tracking the business.</CardContent></Card>
            ) : (
              <div className="space-y-4">
                {sortedActions.map(({ action, originalIndex }, index) => {
                  const priority = priorityFromAction(action);
                  const owners = responsibleDepartments(action);
                  const expectedImpact = actionExpectedImpact(action);
                  return (
                    <Card key={`${action.title}-${index}`} className="border-0 shadow-sm ring-1 ring-slate-200 transition-shadow hover:shadow-md">
                      <CardContent className="p-5">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge className={cn('border capitalize', priorityStyles[priority])}>
                                {priority} priority
                              </Badge>
                              <Badge variant="outline" className={cn('border', confidenceStyles[action.confidence ?? 'medium'])}>
                                {action.confidence ?? 'medium'} confidence
                              </Badge>
                              {action.actionKind === 'campaign' && (
                                <Badge variant="outline" className="gap-1 border-violet-200 bg-violet-50 text-violet-700">
                                  <Target className="h-3 w-3" /> Campaign opportunity
                                </Badge>
                              )}
                            </div>

                            <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
                              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Issue detected</p>
                              <h3 className="mt-1 break-words text-base font-semibold leading-snug text-slate-950">{actionIssue(action)}</h3>
                            </div>

                            <div className="mt-3 grid gap-3 lg:grid-cols-3">
                              <div className="rounded-lg bg-slate-50 p-3">
                                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                  <Database className="h-3.5 w-3.5" /> Evidence
                                </p>
                                <p className="mt-1.5 break-words text-sm leading-relaxed text-slate-700">{actionEvidenceSummary(action)}</p>
                              </div>
                              <div className="rounded-lg bg-indigo-50 p-3">
                                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-indigo-700">
                                  <Sparkles className="h-3.5 w-3.5" /> Recommendation
                                </p>
                                <p className="mt-1.5 break-words text-sm font-medium leading-relaxed text-indigo-950">{actionRecommendation(action)}</p>
                              </div>
                              <div className="rounded-lg bg-emerald-50 p-3">
                                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Expected impact</p>
                                <p className="mt-1.5 text-sm leading-relaxed text-emerald-900">
                                  {expectedImpact || 'AI did not estimate a measurable company impact yet.'}
                                </p>
                              </div>
                            </div>

                            <div className="mt-3 grid gap-3 md:grid-cols-2">
                              <div className="rounded-lg border border-amber-100 bg-amber-50 p-3">
                                <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">What to do today</p>
                                <p className="mt-1.5 break-words text-sm leading-relaxed text-amber-950">{actionTodayMove(action)}</p>
                              </div>
                              <div className="rounded-lg border border-blue-100 bg-blue-50 p-3">
                                <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Next 7 days</p>
                                <p className="mt-1.5 break-words text-sm leading-relaxed text-blue-950">{actionSevenDayMove(action)}</p>
                              </div>
                            </div>

                            {action.strategicGap && (
                              <div className="mt-4 rounded-lg border border-violet-100 bg-violet-50/70 p-3">
                                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-violet-700">
                                  <Target className="h-3.5 w-3.5" /> Strategic gap
                                </p>
                                <div className="mt-2 grid gap-2 text-sm text-slate-700 md:grid-cols-2">
                                  {action.strategicGap.marketSignal && (
                                    <div>
                                      <p className="text-xs font-medium text-slate-500">Market signal</p>
                                      <p className="mt-0.5 leading-relaxed">{action.strategicGap.marketSignal}</p>
                                    </div>
                                  )}
                                  {action.strategicGap.internalMissingPiece && (
                                    <div>
                                      <p className="text-xs font-medium text-slate-500">What is missing</p>
                                      <p className="mt-0.5 leading-relaxed">{action.strategicGap.internalMissingPiece}</p>
                                    </div>
                                  )}
                                </div>
                                {((action.strategicGap.suggestedAssets?.length ?? 0) > 0 || (action.strategicGap.supportingKnowledge?.length ?? 0) > 0) && (
                                  <div className="mt-3 flex flex-wrap items-center gap-2">
                                    {action.strategicGap.suggestedAssets?.map((asset) => (
                                      <Badge key={asset} variant="outline" className="border-violet-200 bg-white text-violet-700">
                                        {assetLabel(asset)}
                                      </Badge>
                                    ))}
                                    {action.strategicGap.supportingKnowledge?.map((item) => (
                                      <Badge key={item} variant="outline" className="max-w-full truncate border-slate-200 bg-white text-slate-600">
                                        Knowledge: {item}
                                      </Badge>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}

                            {owners.length > 0 && (
                              <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3">
                                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                  <Users className="h-3.5 w-3.5" /> Responsible departments
                                </p>
                                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                                  {owners.map((owner, ownerIndex) => (
                                    <div key={`${owner.department}-${ownerIndex}`} className="rounded-md bg-slate-50 px-3 py-2">
                                      <div className="flex flex-wrap items-center gap-1.5">
                                        <span className="text-sm font-semibold text-slate-900">{owner.department}</span>
                                        {(owner.title || owner.role) && (
                                          <span className="text-xs text-slate-500">
                                            {owner.title || readableRole(owner.role || '')}
                                          </span>
                                        )}
                                      </div>
                                      <p className="mt-1 text-xs leading-relaxed text-slate-600">{owner.responsibility}</p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {action.campaignProposal && (
                              <div className="mt-4 border-l-2 border-violet-300 pl-3 text-sm">
                                <p className="font-medium text-slate-800">{action.campaignProposal.goal}</p>
                                <p className="mt-0.5 text-slate-600">Audience: {action.campaignProposal.audience}</p>
                                {action.campaignProposal.offer && <p className="text-slate-600">Offer: {action.campaignProposal.offer}</p>}
                                {(action.campaignProposal.channels.length > 0 || action.campaignProposal.assets.length > 0) && (
                                  <p className="mt-1 text-xs text-slate-500">
                                    {[...action.campaignProposal.channels, ...action.campaignProposal.assets].join(' / ')}
                                  </p>
                                )}
                              </div>
                            )}

                            {(action.evidence?.length ?? 0) > 0 && (
                              <details className="mt-4 border-t border-slate-100 pt-3">
                                <summary className="flex cursor-pointer list-none items-center gap-1 text-xs font-medium text-slate-500 hover:text-indigo-700">
                                  <Database className="h-3 w-3" /> View source evidence
                                </summary>
                                <div className="mt-2 space-y-1.5">
                                  {action.evidence!.map((evidence) => (
                                    <button
                                      key={evidence.id}
                                      type="button"
                                      disabled={!evidence.link}
                                      onClick={() => evidence.link && router.push(evidence.link)}
                                      className={cn('block w-full text-left text-xs text-slate-600', evidence.link && 'hover:text-indigo-700')}
                                    >
                                      <span className="font-medium text-slate-700">{evidence.label}:</span>{' '}{evidence.detail}
                                    </button>
                                  ))}
                                </div>
                              </details>
                            )}
                          </div>

                          {action.campaignProposal ? (
                            <Button
                              size="sm"
                              className="shrink-0 gap-1.5 bg-indigo-600 hover:bg-indigo-700"
                              disabled={createCampaignM.isPending || !token || !hasEnoughAdvisorCampaignCredits}
                              title={!hasEnoughAdvisorCampaignCredits ? 'Not enough credits. Contact support to add more.' : undefined}
                              onClick={() => {
                                if (!hasEnoughAdvisorCampaignCredits) {
                                  setOutOfCreditsRequired(advisorCampaignCreditCost);
                                  setOutOfCreditsAvailable(availableCredits);
                                  setOutOfCreditsOpen(true);
                                  return;
                                }
                                createCampaignM.mutate({ action, index: originalIndex });
                              }}
                            >
                              {creatingActionIndex === originalIndex ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                              {creatingActionIndex === originalIndex ? 'Creating...' : `Create campaign · ${advisorCampaignCreditCost} credits`}
                            </Button>
                          ) : action.link ? (
                            <Button size="sm" variant="outline" className="shrink-0 gap-1" onClick={() => router.push(action.link!)}>
                              Review <ArrowRight className="h-3 w-3" />
                            </Button>
                          ) : null}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </section>

          {brief.wins.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                <Trophy className="w-4 h-4 text-green-600" /> Wins worth celebrating
              </h2>
              <div className="grid sm:grid-cols-2 gap-3">
                {brief.wins.map((w, i) => (
                  <Card key={i} className="border-green-200 bg-green-50/50">
                    <CardContent className="p-4">
                      <p className="font-medium text-slate-900 text-sm">{w.what}</p>
                      {w.detail && <p className="text-xs text-slate-600 mt-1">{w.detail}</p>}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          )}

          <OutOfCreditsModal
            open={outOfCreditsOpen}
            onClose={() => setOutOfCreditsOpen(false)}
            required={outOfCreditsRequired}
            available={outOfCreditsAvailable}
          />

          {brief.alerts.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600" /> Alerts
              </h2>
              <div className="grid sm:grid-cols-2 gap-3">
                {brief.alerts.map((al, i) => (
                  <Card key={i} className="border-amber-200 bg-amber-50/40">
                    <CardContent className="p-4">
                      <p className="font-medium text-slate-900 text-sm">{al.what}</p>
                      {al.detail && <p className="text-xs text-slate-600 mt-1">{al.detail}</p>}
                      {al.link && (
                        <button onClick={() => router.push(al.link!)} className="text-xs text-indigo-600 hover:underline mt-2 inline-flex items-center gap-1">
                          Open <ArrowRight className="w-3 h-3" />
                        </button>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          )}

          <div className="text-xs text-slate-400 text-center pt-3 border-t space-y-1">
            <p>
              Based on {brief.sourcesUsed.campaignsCount ?? 0} campaigns · {brief.sourcesUsed.blogsCount ?? 0} blogs · {brief.sourcesUsed.knowledgeCount ?? 0} Knowledge items · {brief.sourcesUsed.brainEventsCount ?? 0} Brain Hub signals · {brief.sourcesUsed.dealsCount ?? 0} deals · {brief.sourcesUsed.marketScansCount ?? 0} market scans · {brief.sourcesUsed.videosCount ?? 0} videos
            </p>
            {(brief.sourcesUsed.sourceHealth ?? []).some((source) => source.status === 'unavailable') && (
              <p className="text-amber-600">
                Some sources were unavailable during this refresh. The brief did not treat them as empty.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
