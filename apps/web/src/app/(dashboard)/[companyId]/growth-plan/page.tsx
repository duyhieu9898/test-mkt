'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  Clock3,
  FileText,
  Globe2,
  History,
  Loader2,
  RefreshCw,
  Rocket,
  Search,
  Share2,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { api } from '@/lib/api/client';
import type { MasterPlan, PlanBlock, PlanItem } from '@/lib/ftux/types';
import { useAuthStore } from '@/stores/auth-store';

interface GrowthPlanCompany {
  id: string;
  name: string;
  businessPlan?: {
    growthPlan?: MasterPlan;
    growthPlanVersion?: number;
    growthPlanGeneratedAt?: string;
    growthPlanApprovedAt?: string;
    growthPlanUpdateReasons?: string[];
    growthPlanDraft?: {
      version: number;
      plan: MasterPlan;
      generatedAt: string;
      updateReasons: string[];
    };
  } | null;
}

type GrowthPlanHealthStatus = 'missing' | 'draft' | 'fresh' | 'monitor' | 'update_recommended';

interface GrowthPlanStatusResponse {
  health: {
    status: GrowthPlanHealthStatus;
    version: number;
    baselineAt: string | null;
    ageDays: number | null;
    score: number;
    reasons: string[];
    newSignals: number;
  };
  history: Array<{
    version: number;
    generatedAt?: string;
    approvedAt?: string;
    updateReasons: string[];
  }>;
}

const sections: Array<{
  key: keyof MasterPlan;
  label: string;
  icon: typeof Search;
  iconClass: string;
}> = [
  { key: 'seoGrowthPlan', label: 'SEO Growth', icon: Search, iconClass: 'bg-blue-50 text-blue-700' },
  { key: 'contentPlan', label: 'Content', icon: FileText, iconClass: 'bg-violet-50 text-violet-700' },
  { key: 'socialMediaPlan', label: 'Social Media', icon: Share2, iconClass: 'bg-emerald-50 text-emerald-700' },
];

const CAMPAIGN_FOCUS_MAX_LENGTH = 1200;

type GrowthAction = {
  label: string;
  helper: string;
  href: string;
  icon: typeof Rocket;
  tone: string;
};

type ActionablePlanItem = {
  sectionKey: keyof MasterPlan;
  sectionLabel: string;
  item: PlanItem;
  action: GrowthAction;
};

function priorityWeight(priority: PlanItem['priority']): number {
  if (priority === 'high') return 3;
  if (priority === 'medium') return 2;
  return 1;
}

function buildLaunchHref(companyId: string, item: PlanItem, source: string): string {
  const keyword = item.action
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, CAMPAIGN_FOCUS_MAX_LENGTH);
  const brief = [
    `Growth Plan section: ${source}`,
    `Recommended action: ${item.action}`,
    item.expectedImpact ? `Expected impact: ${item.expectedImpact}` : '',
    item.timeline ? `Suggested timing: ${item.timeline}` : '',
  ].filter(Boolean).join('\n');
  const params = new URLSearchParams({
    source: 'growth-plan',
    keyword,
    brief,
  });
  return `/${companyId}/launch?${params.toString()}`;
}

function buildGrowthAction(
  companyId: string,
  sectionKey: keyof MasterPlan,
  sectionLabel: string,
  item: PlanItem,
): GrowthAction {
  const text = `${item.action} ${item.expectedImpact}`.toLowerCase();

  if (sectionKey === 'seoGrowthPlan') {
    if (/\b(landing|page|website|homepage|home page)\b/i.test(text)) {
      return {
        label: 'Create landing page',
        helper: 'Turn this SEO opportunity into a page visitors can open.',
        href: `/${companyId}/landing-pages?action=generate`,
        icon: Globe2,
        tone: 'border-blue-100 bg-blue-50 text-blue-700 hover:bg-blue-100',
      };
    }
    return {
      label: 'Open SEO tools',
      helper: 'Review keywords and turn the opportunity into SEO content.',
      href: `/${companyId}/seo-engine`,
      icon: Search,
      tone: 'border-blue-100 bg-blue-50 text-blue-700 hover:bg-blue-100',
    };
  }

  if (sectionKey === 'socialMediaPlan') {
    return {
      label: 'Create campaign',
      helper: 'Let AI prepare social drafts, blog support, and banner assets.',
      href: buildLaunchHref(companyId, item, sectionLabel),
      icon: Rocket,
      tone: 'border-emerald-100 bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
    };
  }

  if (/\b(competitor|market|positioning|compare|comparison)\b/i.test(text)) {
    return {
      label: 'Analyze market',
      helper: 'Check competitors before creating the next content move.',
      href: `/${companyId}/market`,
      icon: BarChart3,
      tone: 'border-amber-100 bg-amber-50 text-amber-700 hover:bg-amber-100',
    };
  }

  return {
    label: 'Create content campaign',
    helper: 'Use this idea to generate a blog, social posts, and campaign assets.',
    href: buildLaunchHref(companyId, item, sectionLabel),
    icon: FileText,
    tone: 'border-violet-100 bg-violet-50 text-violet-700 hover:bg-violet-100',
  };
}

function buildActionableItems(companyId: string, growthPlan: MasterPlan): ActionablePlanItem[] {
  return sections.flatMap((section) =>
    growthPlan[section.key].items.map((item) => ({
      sectionKey: section.key,
      sectionLabel: section.label,
      item,
      action: buildGrowthAction(companyId, section.key, section.label, item),
    })),
  );
}

function pickNextBestMove(items: ActionablePlanItem[]): ActionablePlanItem | null {
  return [...items].sort((left, right) => {
    const priorityDiff = priorityWeight(right.item.priority) - priorityWeight(left.item.priority);
    if (priorityDiff !== 0) return priorityDiff;
    const sectionRank: Record<keyof MasterPlan, number> = {
      seoGrowthPlan: 3,
      contentPlan: 2,
      socialMediaPlan: 1,
    };
    return sectionRank[right.sectionKey] - sectionRank[left.sectionKey];
  })[0] ?? null;
}

function NextBestMoveCard({ move }: { move: ActionablePlanItem }) {
  const Icon = move.action.icon;
  return (
    <Card className="bg-gradient-to-br from-violet-50 to-white">
      <CardContent className="p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-700">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">
                Your next best move
              </p>
              <h2 className="mt-1 font-semibold text-slate-900">{move.item.action}</h2>
              <p className="mt-1 text-sm text-slate-600">{move.item.expectedImpact}</p>
              <p className="mt-2 text-xs text-slate-500">
                From {move.sectionLabel} plan - {move.item.timeline}
              </p>
            </div>
          </div>
          <Button asChild className="shrink-0 gap-2 bg-violet-600 hover:bg-violet-700">
            <Link href={move.action.href}>
              <Icon className="h-4 w-4" />
              {move.action.label}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function PlanSection({ label, plan, icon: Icon, iconClass, companyId, sectionKey }: {
  label: string;
  plan: PlanBlock;
  icon: typeof Search;
  iconClass: string;
  companyId: string;
  sectionKey: keyof MasterPlan;
}) {
  return (
    <Card className="h-full">
      <CardContent className="p-5">
        <div className="flex items-start gap-3">
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center ${iconClass}`}>
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground">{label}</p>
            <h2 className="mt-0.5 font-semibold text-slate-900">{plan.title}</h2>
            <p className="mt-1 text-sm text-slate-500">{plan.description}</p>
          </div>
        </div>

        <div className="mt-5 space-y-4">
          {plan.items.map((item, index) => (
            <div key={`${item.action}-${index}`} className="border-t pt-3 first:border-t-0 first:pt-0">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium leading-5 text-slate-800">{item.action}</p>
                <Badge variant="outline" className="shrink-0 text-[10px]">
                  {item.priority}
                </Badge>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                <span>{item.timeline}</span>
                <span>{item.expectedImpact}</span>
              </div>
              {(() => {
                const action = buildGrowthAction(companyId, sectionKey, label, item);
                const ActionIcon = action.icon;
                return (
                  <div className="mt-3 rounded-lg bg-slate-50 p-3">
                    <p className="text-xs font-medium text-slate-700">AI recommends</p>
                    <p className="mt-0.5 text-xs text-slate-500">{action.helper}</p>
                    <Button
                      asChild
                      size="sm"
                      variant="outline"
                      className={`mt-3 h-8 gap-1.5 ${action.tone}`}
                    >
                      <Link href={action.href}>
                        <ActionIcon className="h-3.5 w-3.5" />
                        {action.label}
                      </Link>
                    </Button>
                  </div>
                );
              })()}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default function GrowthPlanPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const companyQuery = useQuery({
    queryKey: ['company-growth-plan', companyId],
    queryFn: () => api.get<GrowthPlanCompany>(`/companies/${companyId}`, { token: token! }),
    enabled: Boolean(token && companyId),
  });
  const statusQuery = useQuery({
    queryKey: ['company-growth-plan-status', companyId],
    queryFn: () => api.get<GrowthPlanStatusResponse>(
      `/companies/${companyId}/growth-plan/status`,
      { token: token! },
    ),
    enabled: Boolean(token && companyId),
  });
  const refreshMutation = useMutation({
    mutationFn: () => api.post(
      `/companies/${companyId}/growth-plan/refresh`,
      {},
      { token: token! },
    ),
    onSuccess: async () => {
      setUpdateDialogOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['company-growth-plan', companyId] }),
        queryClient.invalidateQueries({ queryKey: ['company-growth-plan-status', companyId] }),
      ]);
      toast.success('Updated Growth Plan draft is ready to review.');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not update the Growth Plan.');
    },
  });
  const approveMutation = useMutation({
    mutationFn: () => api.post<{ advisorSynced: boolean }>(
      `/companies/${companyId}/growth-plan/approve`,
      {},
      { token: token! },
    ),
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['company-growth-plan', companyId] }),
        queryClient.invalidateQueries({ queryKey: ['company-growth-plan-status', companyId] }),
        queryClient.invalidateQueries({ queryKey: ['ceo-advisor', 'latest', companyId] }),
      ]);
      toast.success(
        result.advisorSynced
          ? 'Growth Plan approved and CEO Advisor updated.'
          : 'Growth Plan approved. CEO Advisor can be refreshed later.',
      );
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not approve the Growth Plan.');
    },
  });

  if (companyQuery.isLoading || statusQuery.isLoading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-violet-600" />
      </div>
    );
  }

  const company = companyQuery.data;
  const health = statusQuery.data?.health;
  const history = statusQuery.data?.history ?? [];
  const isDraft = health?.status === 'draft';
  const needsUpdate = health?.status === 'update_recommended';
  const isMonitoring = health?.status === 'monitor';
  const growthPlan = isDraft
    ? company?.businessPlan?.growthPlanDraft?.plan ?? company?.businessPlan?.growthPlan
    : company?.businessPlan?.growthPlan;
  const actionableItems = growthPlan ? buildActionableItems(companyId, growthPlan) : [];
  const nextBestMove = pickNextBestMove(actionableItems);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Growth Plan</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            The executive summary shared by your Brand IQ, CEO Advisor, and execution tools.
          </p>
        </div>
        {company?.businessPlan?.growthPlanApprovedAt && !isDraft && (
          <Badge className="w-fit gap-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Approved plan - Version {company.businessPlan.growthPlanVersion ?? 1}
          </Badge>
        )}
        {isDraft && health && (
          <Badge className="w-fit gap-1 bg-violet-50 text-violet-700 hover:bg-violet-50">
            <Clock3 className="h-3.5 w-3.5" />
            Draft version {health.version}
          </Badge>
        )}
      </div>

      {!growthPlan ? (
        <Card className="border-dashed">
          <CardContent className="p-10 text-center">
            <Sparkles className="mx-auto h-9 w-9 text-violet-400" />
            <h2 className="mt-3 font-semibold text-slate-900">No Growth Plan is available yet</h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
              Complete company setup so AI can build a grounded plan from your business information.
            </p>
            <Button asChild className="mt-5">
              <Link href="/welcome">Complete setup</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {health && (
            <Card className={
              needsUpdate
                ? 'border-amber-200 bg-amber-50/60'
                : isDraft
                  ? 'border-violet-200 bg-violet-50/50'
                  : 'border-slate-200 bg-slate-50/60'
            }>
              <CardContent className="p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                      needsUpdate
                        ? 'bg-amber-100 text-amber-700'
                        : isDraft
                          ? 'bg-violet-100 text-violet-700'
                          : 'bg-white text-slate-600'
                    }`}>
                      {needsUpdate
                        ? <AlertTriangle className="h-4 w-4" />
                        : isDraft
                          ? <Sparkles className="h-4 w-4" />
                          : <CheckCircle2 className="h-4 w-4" />}
                    </div>
                    <div>
                      <h2 className="font-semibold text-slate-900">
                        {needsUpdate
                          ? 'Your strategy may need an update'
                          : isDraft
                            ? `Version ${health.version} is ready for review`
                            : isMonitoring
                              ? 'New signals are being monitored'
                              : 'Your Growth Plan is up to date'}
                      </h2>
                      <p className="mt-1 text-sm text-slate-600">
                        {isDraft
                          ? 'Review the SEO, Content, and Social priorities below before making this version official.'
                          : needsUpdate
                            ? `${health.newSignals || health.reasons.length} new signal${(health.newSignals || health.reasons.length) === 1 ? '' : 's'} found. Review the details before creating a new draft.`
                            : 'AI compares this plan with newer company, market, campaign, and Brain Hub evidence.'}
                      </p>
                      {(isMonitoring || isDraft) && !needsUpdate && (
                        <ul className="mt-3 space-y-1.5">
                          {health.reasons.slice(0, 3).map((reason) => (
                            <li key={reason} className="flex gap-2 text-sm text-slate-700">
                              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-slate-400" />
                              <span>{reason}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
                    {isDraft ? (
                      <>
                        <Button
                          variant="outline"
                          className="gap-2 bg-white"
                          disabled={refreshMutation.isPending || approveMutation.isPending}
                          onClick={() => refreshMutation.mutate()}
                        >
                          {refreshMutation.isPending
                            ? <Loader2 className="h-4 w-4 animate-spin" />
                            : <RefreshCw className="h-4 w-4" />}
                          Regenerate draft
                        </Button>
                        <Button
                          className="gap-2 bg-violet-600 hover:bg-violet-700"
                          disabled={refreshMutation.isPending || approveMutation.isPending}
                          onClick={() => approveMutation.mutate()}
                        >
                          {approveMutation.isPending
                            ? <Loader2 className="h-4 w-4 animate-spin" />
                            : <CheckCircle2 className="h-4 w-4" />}
                          Approve version {health.version}
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant={needsUpdate ? 'default' : 'outline'}
                        className={needsUpdate
                          ? 'gap-2 bg-violet-600 hover:bg-violet-700'
                          : 'gap-2 bg-white'}
                        disabled={refreshMutation.isPending}
                        onClick={() => {
                          if (needsUpdate) {
                            setUpdateDialogOpen(true);
                            return;
                          }
                          refreshMutation.mutate();
                        }}
                      >
                        {refreshMutation.isPending
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : <RefreshCw className="h-4 w-4" />}
                        {needsUpdate ? 'Create updated draft' : 'Update with latest data'}
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <Dialog open={updateDialogOpen} onOpenChange={setUpdateDialogOpen}>
            <DialogContent className="max-h-[82vh] max-w-2xl overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                  Create an updated Growth Plan draft?
                </DialogTitle>
                <DialogDescription>
                  AI found newer business or market signals. Review what changed, then create a draft if these signals should update your strategy.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3">
                <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                  This will not replace your current approved plan yet. It creates a draft for you to review first.
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-slate-900">Why AI recommends an update</p>
                  <ul className="space-y-2">
                    {(health?.reasons ?? []).map((reason, index) => (
                      <li key={`${reason}-${index}`} className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
                        {reason}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <DialogFooter className="gap-2">
                <Button
                  variant="outline"
                  onClick={() => setUpdateDialogOpen(false)}
                  disabled={refreshMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  className="gap-2 bg-violet-600 hover:bg-violet-700"
                  disabled={refreshMutation.isPending}
                  onClick={() => refreshMutation.mutate()}
                >
                  {refreshMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  Create updated draft
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {nextBestMove && <NextBestMoveCard move={nextBestMove} />}

          <div className="grid gap-4 lg:grid-cols-3">
            {sections.map(({ key, ...section }) => (
              <PlanSection
                key={key}
                {...section}
                sectionKey={key}
                companyId={companyId}
                plan={growthPlan[key]}
              />
            ))}
          </div>

          <div className="flex justify-end">
            <Button asChild variant="outline" className="gap-2">
              <Link href={`/${companyId}/insights`}>
                Open detailed CEO advice
                <Sparkles className="h-4 w-4" />
              </Link>
            </Button>
          </div>

          {history.length > 0 && (
            <details className="group rounded-lg bg-slate-50">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
                <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <History className="h-4 w-4" />
                  Previous versions ({history.length})
                </span>
                <ChevronDown className="h-4 w-4 text-slate-400 transition-transform group-open:rotate-180" />
              </summary>
              <div className="border-t border-slate-200 px-4 py-2">
                {history.map((entry) => (
                  <div
                    key={`${entry.version}-${entry.approvedAt}`}
                    className="flex flex-col gap-1 border-b border-slate-200 py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-800">Version {entry.version}</p>
                      {entry.updateReasons[0] && (
                        <p className="mt-0.5 text-xs text-slate-500">{entry.updateReasons[0]}</p>
                      )}
                    </div>
                    <p className="text-xs text-slate-500">
                      {entry.approvedAt
                        ? `Approved ${new Date(entry.approvedAt).toLocaleDateString()}`
                        : 'Not approved'}
                    </p>
                  </div>
                ))}
              </div>
            </details>
          )}
        </>
      )}
    </div>
  );
}
