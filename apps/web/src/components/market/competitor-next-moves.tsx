'use client';

/**
 * Per-competitor "Next moves" panel.
 * Shows 3 quick actions: Brief me / Create comparison page / Save signals to Brain.
 * Also expands a full AI brief inline when user clicks "Brief me".
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Sparkles,
  FileText,
  Brain,
  Loader2,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Target,
  Zap,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { api } from '@/lib/api/client';
import { friendlyError } from '@/lib/friendly-errors';

interface BriefData {
  headline: string;
  summary: string;
  theirStrengths: string[];
  theirWeaknesses: string[];
  yourAdvantage: string;
  threeActions: Array<{ title: string; why: string; link?: string }>;
}

interface Props {
  companyId: string;
  competitorId: string;
  competitorName: string;
  hasSignals: boolean;
}

export function CompetitorNextMoves({ companyId, competitorId, competitorName, hasSignals }: Props) {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const [brief, setBrief] = useState<BriefData | null>(null);
  const [briefOpen, setBriefOpen] = useState(false);
  const [loadingBrief, setLoadingBrief] = useState(false);
  const [loadingComparison, setLoadingComparison] = useState(false);

  const loadBrief = async () => {
    if (brief) {
      setBriefOpen((v) => !v);
      return;
    }
    setLoadingBrief(true);
    try {
      const res = await api.post<{ success: boolean; data: BriefData }>(
        `/market/${companyId}/competitors/${competitorId}/brief`,
        {},
        { token: token! }
      );
      setBrief(res.data);
      setBriefOpen(true);
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setLoadingBrief(false);
    }
  };

  const createComparison = async () => {
    setLoadingComparison(true);
    try {
      const res = await api.post<{ success: boolean; data: { pageId: string; slug: string; name: string } }>(
        `/market/${companyId}/competitors/${competitorId}/comparison-page`,
        {},
        { token: token! }
      );
      toast.success(`Comparison page created: ${res.data.name}`, {
        action: {
          label: 'Open',
          onClick: () => router.push(`/${companyId}/landing-pages/${res.data.pageId}`),
        },
      });
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setLoadingComparison(false);
    }
  };

  return (
    <div className="border-t border-slate-100 pt-3 space-y-3">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
        <Target className="w-3 h-3" /> Next moves
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={loadBrief} disabled={loadingBrief} className="gap-1.5">
          {loadingBrief ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-indigo-500" />}
          Brief me on {competitorName}
          {brief && (briefOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />)}
        </Button>

        <Button size="sm" variant="outline" onClick={createComparison} disabled={loadingComparison} className="gap-1.5">
          {loadingComparison ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5 text-emerald-500" />}
          Create "Us vs {competitorName}" page
        </Button>

        <Button
          size="sm"
          variant="outline"
          onClick={() => router.push(`/${companyId}/brain`)}
          className="gap-1.5"
          title="Signals from scans are auto-saved to your Brain"
        >
          <Brain className="w-3.5 h-3.5 text-purple-500" />
          View in Brain
        </Button>
      </div>

      {!hasSignals && (
        <p className="text-xs text-amber-600 flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" /> Run a scan first so the AI has fresh data to work with.
        </p>
      )}

      {brief && briefOpen && (
        <div className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-3 space-y-3 text-sm">
          <p className="font-semibold text-slate-900">{brief.headline}</p>
          {brief.summary && <p className="text-slate-700">{brief.summary}</p>}

          <div className="grid sm:grid-cols-2 gap-3">
            {brief.theirStrengths.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-slate-500 uppercase mb-1 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" /> Their strengths
                </p>
                <ul className="space-y-0.5">
                  {brief.theirStrengths.map((s, i) => (
                    <li key={i} className="text-xs text-slate-700 flex gap-1">
                      <span className="text-slate-400">•</span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {brief.theirWeaknesses.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-slate-500 uppercase mb-1 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> Their weaknesses
                </p>
                <ul className="space-y-0.5">
                  {brief.theirWeaknesses.map((w, i) => (
                    <li key={i} className="text-xs text-slate-700 flex gap-1">
                      <span className="text-slate-400">•</span>
                      <span>{w}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {brief.yourAdvantage && (
            <div className="rounded-md bg-emerald-50 border border-emerald-200 p-2">
              <p className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider mb-1 flex items-center gap-1">
                <Zap className="w-3 h-3" /> Your advantage
              </p>
              <p className="text-xs text-emerald-900">{brief.yourAdvantage}</p>
            </div>
          )}

          {brief.threeActions.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-slate-500 uppercase mb-1.5">Do this week</p>
              <div className="space-y-1.5">
                {brief.threeActions.map((a, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 p-2 rounded-md border border-slate-200 bg-white"
                  >
                    <Badge className="bg-indigo-500 text-white text-[10px] h-5 w-5 p-0 justify-center rounded-full flex-shrink-0">
                      {i + 1}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-900">{a.title}</p>
                      <p className="text-[11px] text-slate-600 mt-0.5">{a.why}</p>
                    </div>
                    {a.link && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-xs gap-1 flex-shrink-0"
                        onClick={() => router.push(a.link!)}
                      >
                        Go <ArrowRight className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
