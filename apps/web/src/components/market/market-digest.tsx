'use client';

/**
 * Market Digest — weekly (or custom-window) rollup of competitor activity.
 * Collapsible section at the top of the market page.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Newspaper,
  ChevronDown,
  ChevronUp,
  Loader2,
  ArrowRight,
  RefreshCw,
  TrendingUp,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { api } from '@/lib/api/client';
import { cn } from '@/lib/utils';

interface DigestResponse {
  success: boolean;
  data: {
    windowDays: number;
    totalSignals: number;
    headline: string;
    summary: string;
    topThemes: string[];
    threeActions: Array<{ title: string; why: string; link?: string }>;
    byCompetitor: Array<{
      competitorId: string;
      competitorName: string;
      signalCount: number;
      topSignals: Array<{ type: string; text: string }>;
    }>;
  };
}

interface Props {
  companyId: string;
}

export function MarketDigest({ companyId }: Props) {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const { data, isFetching, refetch } = useQuery({
    queryKey: ['market-digest', companyId],
    queryFn: () =>
      api.get<DigestResponse>(`/market/${companyId}/digest?days=7`, { token: token! }),
    enabled: !!token && open,
    staleTime: 10 * 60 * 1000,
  });

  const digest = data?.data;

  return (
    <Card className="border-indigo-200 bg-gradient-to-br from-indigo-50/40 via-white to-white">
      <CardContent className="p-4">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center justify-between w-full group"
        >
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
              <Newspaper className="w-4 h-4 text-indigo-600" />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold text-slate-900">Weekly market digest</p>
              <p className="text-xs text-slate-500">
                {open && digest
                  ? `${digest.totalSignals} signal${digest.totalSignals === 1 ? '' : 's'} in the last ${digest.windowDays} days`
                  : 'AI-synthesized rollup of competitor activity'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {open && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 gap-1"
                onClick={(e) => {
                  e.stopPropagation();
                  refetch();
                }}
                disabled={isFetching}
              >
                {isFetching ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <RefreshCw className="w-3 h-3" />
                )}
              </Button>
            )}
            {open ? (
              <ChevronUp className="w-4 h-4 text-slate-400 group-hover:text-slate-600" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-400 group-hover:text-slate-600" />
            )}
          </div>
        </button>

        {open && (
          <div className="mt-4 space-y-3">
            {isFetching && !digest && (
              <div className="py-8 text-center text-slate-500 text-sm">
                <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
                Synthesizing market intelligence…
              </div>
            )}

            {digest && (
              <>
                {digest.headline && (
                  <p className="text-base font-semibold text-slate-900">{digest.headline}</p>
                )}
                {digest.summary && <p className="text-sm text-slate-700">{digest.summary}</p>}

                {digest.topThemes.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {digest.topThemes.map((t, i) => (
                      <Badge key={i} variant="secondary" className="text-xs gap-1">
                        <TrendingUp className="w-2.5 h-2.5" />
                        {t}
                      </Badge>
                    ))}
                  </div>
                )}

                {digest.threeActions.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                      Do this week
                    </p>
                    {digest.threeActions.map((a, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-2 p-2.5 rounded-md border border-slate-200 bg-white"
                      >
                        <Badge className="bg-indigo-500 text-white text-[10px] h-5 w-5 p-0 justify-center rounded-full flex-shrink-0">
                          {i + 1}
                        </Badge>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-900">{a.title}</p>
                          <p className="text-xs text-slate-600 mt-0.5">{a.why}</p>
                        </div>
                        {a.link && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs gap-1"
                            onClick={() => router.push(a.link!)}
                          >
                            Go <ArrowRight className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {digest.byCompetitor.length > 0 && (
                  <div>
                    <button
                      className="text-xs text-indigo-600 hover:underline font-medium flex items-center gap-1"
                      onClick={() => setExpanded((v) => !v)}
                    >
                      {expanded ? 'Hide' : 'Show'} per-competitor breakdown
                      {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>
                    {expanded && (
                      <div className="mt-2 space-y-2">
                        {digest.byCompetitor.map((c) => (
                          <div key={c.competitorId} className="rounded-md border border-slate-200 p-2">
                            <p className="text-xs font-semibold text-slate-900">
                              {c.competitorName}{' '}
                              <span className="text-slate-400 font-normal">
                                ({c.signalCount} signal{c.signalCount === 1 ? '' : 's'})
                              </span>
                            </p>
                            <ul className="mt-1 space-y-0.5">
                              {c.topSignals.slice(0, 3).map((s, i) => (
                                <li key={i} className="text-xs text-slate-600 flex gap-1.5">
                                  <Badge variant="outline" className="text-[10px] h-4 px-1">
                                    {s.type}
                                  </Badge>
                                  <span className="flex-1">{s.text}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
