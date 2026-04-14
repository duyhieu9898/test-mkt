'use client';

/**
 * CEO Advisor — cross-domain "what should I do today?" brief.
 * One LLM call per Refresh click. No cron, no push, no email.
 * See docs/architecture/10-venture-ceo-ia.md §8.
 */

import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sparkles, RefreshCw, Loader2, ArrowRight, Trophy, AlertTriangle, Coins } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { api } from '@/lib/api/client';
import { friendlyError } from '@/lib/friendly-errors';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { FirstVisitTip } from '@/components/first-visit-tip';

type Severity = 'critical' | 'high' | 'medium' | 'low';
interface BriefAction { title: string; why: string; impact?: string; link?: string; severity?: Severity; }
interface BriefWin { what: string; detail?: string; }
interface BriefAlert { what: string; detail?: string; link?: string; }
interface AdvisorBrief {
  id: string;
  generatedAt: string;
  headline: string | null;
  actions: BriefAction[];
  wins: BriefWin[];
  alerts: BriefAlert[];
  sourcesUsed: { campaignsCount?: number; dealsCount?: number; marketScansCount?: number; learningsCount?: number; };
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

export default function CeoAdvisorPage() {
  const params = useParams();
  const router = useRouter();
  const companyId = params.companyId as string;
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();

  const latestQ = useQuery({
    queryKey: ['ceo-advisor', 'latest', companyId],
    queryFn: () => api.get<{ brief: AdvisorBrief | null }>(`/insights/${companyId}/advisor/latest`, { token: token! }),
    enabled: !!token,
  });

  const refreshM = useMutation({
    mutationFn: () => api.post<{ brief: AdvisorBrief }>(`/insights/${companyId}/advisor/refresh`, {}, { token: token! }),
    onSuccess: () => {
      toast.success('New advice ready');
      qc.invalidateQueries({ queryKey: ['ceo-advisor', 'latest', companyId] });
    },
    onError: (err) => toast.error(friendlyError(err)),
  });

  const brief = latestQ.data?.brief ?? null;
  const refreshing = refreshM.isPending;

  const RefreshBtn = (
    <Button
      onClick={() => refreshM.mutate()}
      disabled={refreshing || !token}
      className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white w-full sm:w-auto"
    >
      {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
      {refreshing ? 'Thinking...' : 'Refresh advice'}
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
        body="Click Refresh advice to get 3-5 prioritized actions pulled from your campaigns, deals, market signals, and meetings. 10 credits per refresh."
      />
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-indigo-500" /> CEO Advisor
          </h1>
          <p className="text-sm text-slate-600 mt-1 max-w-2xl">
            What your AI recommends you focus on today — pulled from campaigns, sales, market signals, meetings, and your brain.
          </p>
          {brief && <p className="text-xs text-slate-400 mt-1">Last refreshed {relativeTime(brief.generatedAt)}</p>}
        </div>
        {RefreshBtn}
      </div>

      {!brief && (
        <Card className="border-dashed">
          <CardContent className="p-10 text-center">
            <Sparkles className="w-10 h-10 text-indigo-300 mx-auto mb-3" />
            <h2 className="text-lg font-semibold text-slate-900">Your AI hasn't advised you yet</h2>
            <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
              Click <span className="font-medium">Refresh advice</span> and your Chief of Staff will read your whole company and tell you what to do next.
            </p>
            <div className="mt-5 inline-block">{RefreshBtn}</div>
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
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Top actions</h2>
            {brief.actions.length === 0 ? (
              <Card><CardContent className="p-6 text-sm text-slate-500 text-center">No urgent actions right now. Keep shipping.</CardContent></Card>
            ) : (
              <div className="space-y-3">
                {brief.actions.map((a, i) => (
                  <Card key={i} className="hover:border-indigo-200 transition-colors">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <Badge className={cn('border mb-1', severityStyles[a.severity ?? 'medium'])}>{a.severity ?? 'medium'}</Badge>
                          <h3 className="font-semibold text-slate-900">{a.title}</h3>
                          <p className="text-sm text-slate-600 mt-1">{a.why}</p>
                          {a.impact && <p className="text-xs text-emerald-700 mt-1">Impact: {a.impact}</p>}
                        </div>
                        {a.link && (
                          <Button size="sm" variant="outline" className="gap-1 flex-shrink-0" onClick={() => router.push(a.link!)}>
                            Go <ArrowRight className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
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

          <p className="text-xs text-slate-400 text-center pt-2 border-t">
            Based on {brief.sourcesUsed.campaignsCount ?? 0} campaigns · {brief.sourcesUsed.dealsCount ?? 0} deals · {brief.sourcesUsed.marketScansCount ?? 0} market signals · {brief.sourcesUsed.learningsCount ?? 0} learnings
          </p>
        </>
      )}
    </div>
  );
}
