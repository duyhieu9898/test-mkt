'use client';

/**
 * Positioning Map — 2D scatter showing YOU vs competitors.
 * Axes are AI-picked based on industry. Renders as SVG.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Map, ChevronDown, ChevronUp, Loader2, RefreshCw, Target } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { api } from '@/lib/api/client';
import { cn } from '@/lib/utils';

interface PositioningResponse {
  success: boolean;
  data: {
    xAxis: { label: string; lowLabel: string; highLabel: string };
    yAxis: { label: string; lowLabel: string; highLabel: string };
    points: Array<{
      id: string;
      name: string;
      x: number;
      y: number;
      isYou: boolean;
      note: string;
    }>;
    insight: string;
    recommendation: string;
  };
}

interface Props {
  companyId: string;
}

export function PositioningMap({ companyId }: Props) {
  const token = useAuthStore((s) => s.token);
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);

  const { data, isFetching, refetch } = useQuery({
    queryKey: ['market-positioning', companyId],
    queryFn: () =>
      api.get<PositioningResponse>(`/market/${companyId}/positioning`, { token: token! }),
    enabled: !!token && open,
    staleTime: 10 * 60 * 1000,
  });

  const map = data?.data;

  return (
    <Card className="border-slate-200">
      <CardContent className="p-4">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center justify-between w-full group"
        >
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
              <Map className="w-4 h-4 text-purple-600" />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold text-slate-900">Positioning map</p>
              <p className="text-xs text-slate-500">
                {open && map
                  ? `${map.xAxis.label} × ${map.yAxis.label}`
                  : 'See where you sit vs competitors'}
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
                {isFetching ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
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
            {isFetching && !map && (
              <div className="py-8 text-center text-slate-500 text-sm">
                <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
                Analyzing market position…
              </div>
            )}

            {map && (
              <>
                {/* SVG Scatter Plot */}
                <div className="relative w-full max-w-xl mx-auto">
                  <svg viewBox="0 0 400 400" className="w-full h-auto">
                    {/* Grid */}
                    <line x1="200" y1="20" x2="200" y2="380" stroke="#e2e8f0" strokeDasharray="2 2" />
                    <line x1="20" y1="200" x2="380" y2="200" stroke="#e2e8f0" strokeDasharray="2 2" />

                    {/* Axes */}
                    <line x1="20" y1="380" x2="380" y2="380" stroke="#cbd5e1" />
                    <line x1="20" y1="20" x2="20" y2="380" stroke="#cbd5e1" />

                    {/* Axis labels */}
                    <text x="200" y="398" textAnchor="middle" className="fill-slate-700 text-[11px] font-semibold">
                      {map.xAxis.label}
                    </text>
                    <text x="20" y="394" className="fill-slate-500 text-[9px]">
                      {map.xAxis.lowLabel}
                    </text>
                    <text x="380" y="394" textAnchor="end" className="fill-slate-500 text-[9px]">
                      {map.xAxis.highLabel}
                    </text>
                    <text
                      x="10"
                      y="200"
                      textAnchor="middle"
                      className="fill-slate-700 text-[11px] font-semibold"
                      transform="rotate(-90 10 200)"
                    >
                      {map.yAxis.label}
                    </text>
                    <text x="6" y="380" className="fill-slate-500 text-[9px]">
                      {map.yAxis.lowLabel}
                    </text>
                    <text x="6" y="28" className="fill-slate-500 text-[9px]">
                      {map.yAxis.highLabel}
                    </text>

                    {/* Points */}
                    {map.points.map((p) => {
                      // x: 0-100 → 20-380 (360 range)
                      // y: 0-100 → 380-20 (inverted, 360 range)
                      const cx = 20 + (p.x / 100) * 360;
                      const cy = 380 - (p.y / 100) * 360;
                      const active = hovered === p.id;

                      return (
                        <g
                          key={p.id}
                          onMouseEnter={() => setHovered(p.id)}
                          onMouseLeave={() => setHovered(null)}
                          style={{ cursor: 'pointer' }}
                        >
                          <circle
                            cx={cx}
                            cy={cy}
                            r={p.isYou ? 9 : 6}
                            className={cn(
                              'transition-all',
                              p.isYou
                                ? 'fill-indigo-500 stroke-indigo-700'
                                : 'fill-slate-400 stroke-slate-600',
                              active && (p.isYou ? 'fill-indigo-600' : 'fill-slate-500')
                            )}
                            strokeWidth={p.isYou ? 2 : 1}
                          />
                          <text
                            x={cx}
                            y={cy - (p.isYou ? 14 : 11)}
                            textAnchor="middle"
                            className={cn(
                              'text-[10px] font-medium',
                              p.isYou ? 'fill-indigo-700' : 'fill-slate-700'
                            )}
                          >
                            {p.isYou ? '★ You' : p.name.slice(0, 20)}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                </div>

                {/* Hovered point note */}
                {hovered && (() => {
                  const p = map.points.find((x) => x.id === hovered);
                  return p?.note ? (
                    <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
                      <p className="text-xs font-semibold text-slate-900">{p.name}</p>
                      <p className="text-xs text-slate-600 mt-0.5">{p.note}</p>
                    </div>
                  ) : null;
                })()}

                {/* Insight + recommendation */}
                {map.insight && (
                  <div className="rounded-md bg-indigo-50 border border-indigo-200 p-2.5">
                    <p className="text-[11px] font-semibold text-indigo-700 uppercase tracking-wider mb-1 flex items-center gap-1">
                      <Target className="w-3 h-3" /> Insight
                    </p>
                    <p className="text-xs text-slate-800">{map.insight}</p>
                  </div>
                )}
                {map.recommendation && (
                  <div className="rounded-md bg-emerald-50 border border-emerald-200 p-2.5">
                    <p className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider mb-1">
                      Recommendation
                    </p>
                    <p className="text-xs text-slate-800">{map.recommendation}</p>
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
