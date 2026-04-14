'use client';

/**
 * Growth Score Widget — circular score ring + 4 sub-score bars.
 * Professional, data-dense. No flashy animations.
 */

import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { GrowthScoreData, ScoreTrend } from '@/lib/api/hooks';

interface Props {
  data: GrowthScoreData | undefined;
  loading?: boolean;
}

const SUB_SCORES = [
  { key: 'marketing' as const, label: 'Marketing', color: 'bg-indigo-500', text: 'text-indigo-600' },
  { key: 'seo' as const, label: 'SEO', color: 'bg-emerald-500', text: 'text-emerald-600' },
  { key: 'automation' as const, label: 'Automation', color: 'bg-purple-500', text: 'text-purple-600' },
  { key: 'revenue' as const, label: 'Revenue', color: 'bg-amber-500', text: 'text-amber-600' },
] as const;

function TrendIcon({ trend }: { trend: ScoreTrend }) {
  if (trend === 'up') return <TrendingUp className="w-3 h-3 text-emerald-500" />;
  if (trend === 'down') return <TrendingDown className="w-3 h-3 text-red-400" />;
  return <Minus className="w-3 h-3 text-slate-400" />;
}

function ScoreRing({ score, level }: { score: number; level: number }) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  const levelLabel = ['Foundation', 'Growth', 'Scale', 'Optimize'][level - 1] ?? 'Foundation';

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-32 h-32">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
          {/* Background ring */}
          <circle
            cx="60" cy="60" r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth="8"
            className="text-slate-100"
          />
          {/* Score ring */}
          <circle
            cx="60" cy="60" r={radius}
            fill="none"
            strokeWidth="8"
            strokeLinecap="round"
            className="text-indigo-500"
            stroke="currentColor"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 1s ease-out' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold text-slate-900">{score}</span>
          <span className="text-[10px] text-slate-500 uppercase tracking-wider">/ 100</span>
        </div>
      </div>
      <span className="mt-2 text-xs font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
        Level {level} — {levelLabel}
      </span>
    </div>
  );
}

export function GrowthScoreWidget({ data, loading }: Props) {
  if (loading || !data) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="h-48 bg-slate-100 rounded-lg animate-pulse" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-slate-200">
      <CardContent className="p-5">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">
          Growth Score
        </p>
        <ScoreRing score={data.overall} level={data.level} />

        <div className="mt-5 space-y-3">
          {SUB_SCORES.map(({ key, label, color, text }) => {
            const sub = data.subscores[key];
            return (
              <div key={key}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-slate-700">{label}</span>
                  <div className="flex items-center gap-1">
                    <span className={`text-xs font-semibold ${text}`}>{sub.score}</span>
                    <TrendIcon trend={sub.trend} />
                  </div>
                </div>
                <Progress
                  value={sub.score}
                  className="h-1.5"
                  indicatorClassName={color}
                />
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
