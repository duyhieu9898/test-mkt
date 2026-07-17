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
import { Sparkles, RefreshCw, Loader2, ArrowRight, Trophy, AlertTriangle, Coins, Target, Database, Users, CheckCircle2, ChevronDown } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { api } from '@/lib/api/client';
import { friendlyError } from '@/lib/friendly-errors';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { FirstVisitTip } from '@/components/first-visit-tip';

type Severity = 'critical' | 'high' | 'medium' | 'low';
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
interface BriefAction {
  title: string;
  why: string;
  impact?: string;
  link?: string;
  severity?: Severity;
  confidence?: Confidence;
  evidence?: BriefEvidence[];
  actionKind?: 'campaign' | 'content' | 'sales' | 'market' | 'operations';
  campaignProposal?: CampaignProposal;
  teamTasks?: AdvisorTeamTask[];
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
interface AdvisorBrief {
  id: string;
  generatedAt: string;
  headline: string | null;
  actions: BriefAction[];
  wins: BriefWin[];
  alerts: BriefAlert[];
  sourcesUsed: {
    campaignsCount?: number;
    blogsCount?: number;
    landingPagesCount?: number;
    dealsCount?: number;
    marketScansCount?: number;
    learningsCount?: number;
    brainEventsCount?: number;
    sourceHealth?: SourceHealth[];
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

const severityStyles: Record<Severity, string> = {
  critical: 'bg-red-100 text-red-700 border-red-200',
  high: 'bg-amber-100 text-amber-700 border-amber-200',
  medium: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  low: 'bg-slate-100 text-slate-600 border-slate-200',
};

const confidenceStyles: Record<Confidence, string> = {
  high: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  medium: 'bg-blue-50 text-blue-700 border-blue-200',
  low: 'bg-slate-50 text-slate-600 border-slate-200',
};

interface TeamWorkItem extends AdvisorTeamTask {
  actionIndex: number;
  actionTitle: string;
}

interface TeamWorkGroup {
  agentId: string;
  agentName: string;
  role: string;
  title?: string;
  department: string;
  tasks: TeamWorkItem[];
}

function readableRole(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function departmentName(task: AdvisorTeamTask): string {
  if (task.department?.trim()) return task.department.trim();
  if (task.role === 'ceo') return 'Executive';
  if (task.role === 'sales_manager') return 'Sales';
  if (['analyst'].includes(task.role)) return 'Analytics';
  if (['content_creator'].includes(task.role)) return 'Content';
  return 'Marketing';
}

function buildTeamWorkGroups(actions: BriefAction[]): TeamWorkGroup[] {
  const groups = new Map<string, TeamWorkGroup>();
  actions.forEach((action, actionIndex) => {
    (action.teamTasks ?? []).forEach((task) => {
      const existing = groups.get(task.agentId) ?? {
        agentId: task.agentId,
        agentName: task.agentName,
        role: task.role,
        title: task.title,
        department: departmentName(task),
        tasks: [],
      };
      existing.tasks.push({ ...task, actionIndex, actionTitle: action.title });
      groups.set(task.agentId, existing);
    });
  });
  const roleOrder = ['ceo', 'marketing_manager', 'sales_manager', 'content_creator', 'ads_specialist', 'analyst'];
  return Array.from(groups.values()).sort((left, right) => {
    const leftRank = roleOrder.indexOf(left.role);
    const rightRank = roleOrder.indexOf(right.role);
    return (leftRank < 0 ? 99 : leftRank) - (rightRank < 0 ? 99 : rightRank);
  });
}

export default function CeoAdvisorPage() {
  const params = useParams();
  const router = useRouter();
  const companyId = params.companyId as string;
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  const autoGenerateAttemptedFor = useRef<string | null>(null);
  const [creatingActionIndex, setCreatingActionIndex] = useState<number | null>(null);
  const [collapsedDepartments, setCollapsedDepartments] = useState<Set<string>>(() => new Set());

  const toggleDepartment = (department: string) => {
    setCollapsedDepartments((current) => {
      const next = new Set(current);
      if (next.has(department)) next.delete(department);
      else next.add(department);
      return next;
    });
  };

  const latestQ = useQuery({
    queryKey: ['ceo-advisor', 'latest', companyId],
    queryFn: () => api.get<{ brief: AdvisorBrief | null }>(`/insights/${companyId}/advisor/latest`, { token: token! }),
    enabled: !!token,
  });

  const brief = latestQ.data?.brief ?? null;
  const hasAdvice = Boolean(brief);
  const teamWorkGroups = brief ? buildTeamWorkGroups(brief.actions) : [];
  const teamDepartments = teamWorkGroups.reduce<Array<{
    name: string;
    members: TeamWorkGroup[];
  }>>((groups, member) => {
    const existing = groups.find((group) => group.name === member.department);
    if (existing) existing.members.push(member);
    else groups.push({ name: member.department, members: [member] });
    return groups;
  }, []);

  const refreshM = useMutation({
    mutationFn: () => api.post<{ brief: AdvisorBrief }>(`/insights/${companyId}/advisor/refresh`, {}, { token: token! }),
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
      const evidenceSummary = (action.evidence ?? [])
        .slice(0, 3)
        .map((evidence) => `${evidence.label}: ${evidence.detail}`)
        .join('\n');
      const reason = [
        action.why,
        action.impact ? `Impact: ${action.impact}` : '',
        proposal.expectedOutcome ? `Expected outcome: ${proposal.expectedOutcome}` : '',
        evidenceSummary ? `Evidence:\n${evidenceSummary}` : '',
      ].filter(Boolean).join('\n\n');

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
          tier: 'balanced',
          advisorBriefId: brief?.id,
          advisorActionIndex: index,
          advisorActionTitle: action.title,
          advisorEvidenceIds: (action.evidence ?? []).map((evidence) => evidence.id),
        },
        { token: token! },
      );
    },
    onSuccess: (data) => {
      toast.success('Campaign is being created');
      qc.invalidateQueries({ queryKey: ['ceo-advisor', 'latest', companyId] });
      router.push(`/${companyId}/campaigns/${data.campaignId}`);
    },
    onError: (err) => toast.error(friendlyError(err)),
    onSettled: () => setCreatingActionIndex(null),
  });

  const refreshing = refreshM.isPending;

  useEffect(() => {
    if (
      !token
      || !companyId
      || !latestQ.isSuccess
      || latestQ.data.brief !== null
      || autoGenerateAttemptedFor.current === companyId
    ) {
      return;
    }

    autoGenerateAttemptedFor.current = companyId;
    refreshM.mutate();
  }, [companyId, latestQ.data?.brief, latestQ.isSuccess, refreshM.mutate, token]);

  const AdviceActionButton = (
    <Button
      onClick={() => refreshM.mutate()}
      disabled={refreshing || !token}
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
        : hasAdvice ? 'Refresh advice' : 'Generate advice'}
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

          <section>
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-500">
                  <Users className="h-4 w-4 text-indigo-600" /> Team action plan
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  See what each department and role should do next, in priority order.
                </p>
              </div>
              <Button type="button" size="sm" variant="outline" className="w-fit" onClick={() => router.push(`/${companyId}/team`)}>
                View AI Team <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            </div>

            {brief.actions.length === 0 ? (
              <Card><CardContent className="p-6 text-center text-sm text-slate-500">No urgent actions right now. Keep shipping.</CardContent></Card>
            ) : teamDepartments.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="p-6 text-center">
                  <p className="text-sm font-medium text-slate-800">Your actions are ready, but no team role is available yet.</p>
                  <p className="mt-1 text-xs text-slate-500">Open Your AI Team to finish assigning responsibilities.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-5">
                {teamDepartments.map((department, departmentIndex) => {
                  const isCollapsed = collapsedDepartments.has(department.name);
                  const sectionId = `advisor-department-${departmentIndex}`;
                  return (
                  <div key={department.name} className="rounded-xl bg-slate-50/80 p-3 sm:p-4">
                    <button
                      type="button"
                      className={cn(
                        'flex w-full items-center justify-between gap-3 rounded-lg px-1 text-left',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2',
                        !isCollapsed && 'mb-4',
                      )}
                      onClick={() => toggleDepartment(department.name)}
                      aria-expanded={!isCollapsed}
                      aria-controls={sectionId}
                    >
                      <h3 className="text-base font-semibold text-slate-900">{department.name}</h3>
                      <span className="flex shrink-0 items-center gap-2">
                        <Badge variant="outline" className="bg-white text-slate-600">
                          {department.members.reduce((count, member) => count + member.tasks.length, 0)} action(s)
                        </Badge>
                        <ChevronDown className={cn('h-4 w-4 text-slate-500 transition-transform', isCollapsed && '-rotate-90')} />
                      </span>
                    </button>

                    {!isCollapsed && <div id={sectionId} className="space-y-5">
                      {department.members.map((member) => (
                        <div key={member.agentId}>
                          <div className="mb-2 flex items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-700">
                              {member.agentName.trim().charAt(0).toUpperCase() || '?'}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-900">{member.agentName}</p>
                              <p className="truncate text-xs text-slate-500">{member.title || readableRole(member.role)}</p>
                            </div>
                          </div>

                          <div className="space-y-3 sm:pl-12">
                            {member.tasks.map((task, taskIndex) => {
                              const action = brief.actions[task.actionIndex];
                              if (!action) return null;
                              const isPrimaryOwner = action.teamTasks?.[0]?.agentId === member.agentId;
                              return (
                                <Card key={`${task.actionIndex}-${taskIndex}`} className="border-0 shadow-sm ring-1 ring-slate-200 transition-shadow hover:shadow-md">
                                  <CardContent className="p-4">
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                      <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <Badge className={cn('border', severityStyles[action.severity ?? 'medium'])}>{action.severity ?? 'medium'}</Badge>
                                          <Badge variant="outline" className={cn('border', confidenceStyles[action.confidence ?? 'medium'])}>
                                            {action.confidence ?? 'medium'} confidence
                                          </Badge>
                                          {action.actionKind === 'campaign' && (
                                            <Badge variant="outline" className="gap-1 border-violet-200 bg-violet-50 text-violet-700">
                                              <Target className="h-3 w-3" /> Campaign idea
                                            </Badge>
                                          )}
                                        </div>

                                        <div className="mt-3 flex items-start gap-2.5 rounded-lg bg-indigo-50 px-3 py-2.5">
                                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" />
                                          <div>
                                            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
                                              Task for {member.title || readableRole(member.role)}
                                            </p>
                                            <p className="mt-0.5 text-sm font-medium leading-relaxed text-indigo-950">{task.task}</p>
                                          </div>
                                        </div>

                                        <h4 className="mt-3 font-semibold text-slate-900">{action.title}</h4>
                                        <p className="mt-1 text-sm leading-relaxed text-slate-600">{action.why}</p>
                                        {(task.expectedOutcome || action.impact) && (
                                          <p className="mt-1 text-xs text-emerald-700">
                                            Expected: {task.expectedOutcome || action.impact}
                                          </p>
                                        )}

                                        {action.campaignProposal && (
                                          <div className="mt-3 border-l-2 border-violet-300 pl-3 text-sm">
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
                                          <details className="mt-3 border-t border-slate-100 pt-3">
                                            <summary className="flex cursor-pointer list-none items-center gap-1 text-xs font-medium text-slate-500 hover:text-indigo-700">
                                              <Database className="h-3 w-3" /> Why AI recommends this
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

                                      {action.campaignProposal && isPrimaryOwner ? (
                                        <Button
                                          size="sm"
                                          className="shrink-0 gap-1.5 bg-indigo-600 hover:bg-indigo-700"
                                          disabled={createCampaignM.isPending || !token}
                                          onClick={() => createCampaignM.mutate({ action, index: task.actionIndex })}
                                        >
                                          {creatingActionIndex === task.actionIndex ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                                          {creatingActionIndex === task.actionIndex ? 'Creating...' : 'Create campaign'}
                                        </Button>
                                      ) : !action.campaignProposal && action.link ? (
                                        <Button size="sm" variant="outline" className="shrink-0 gap-1" onClick={() => router.push(action.link!)}>
                                          Start task <ArrowRight className="h-3 w-3" />
                                        </Button>
                                      ) : null}
                                    </div>
                                  </CardContent>
                                </Card>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>}
                  </div>
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
              Based on {brief.sourcesUsed.campaignsCount ?? 0} campaigns · {brief.sourcesUsed.blogsCount ?? 0} blogs · {brief.sourcesUsed.brainEventsCount ?? 0} Brain Hub signals · {brief.sourcesUsed.dealsCount ?? 0} deals · {brief.sourcesUsed.marketScansCount ?? 0} market scans
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
