'use client';

/**
 * System Progress Bars — compact card showing 4 sub-scores.
 * Standalone widget for the stats area.
 */

import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Megaphone, Search, Cpu, DollarSign } from 'lucide-react';
import type { GrowthScoreData } from '@/lib/api/hooks';

interface Props {
  data: GrowthScoreData | undefined;
  loading?: boolean;
}

const systems = [
  { key: 'marketing' as const, label: 'Marketing Engine', icon: Megaphone, color: 'bg-indigo-500', iconTint: 'text-indigo-600 bg-indigo-50' },
  { key: 'seo' as const, label: 'SEO & Content', icon: Search, color: 'bg-emerald-500', iconTint: 'text-emerald-600 bg-emerald-50' },
  { key: 'automation' as const, label: 'AI Automation', icon: Cpu, color: 'bg-purple-500', iconTint: 'text-purple-600 bg-purple-50' },
  { key: 'revenue' as const, label: 'Revenue Engine', icon: DollarSign, color: 'bg-amber-500', iconTint: 'text-amber-600 bg-amber-50' },
] as const;

export function SystemProgressBars({ data, loading }: Props) {
  if (loading || !data) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="h-24 bg-slate-100 rounded-lg animate-pulse" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-slate-200">
      <CardContent className="p-4">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
          System Progress
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {systems.map(({ key, label, icon: Icon, color, iconTint }) => {
            const score = data.subscores[key].score;
            return (
              <div key={key} className="flex items-center gap-3">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${iconTint}`}>
                  <Icon className="w-3.5 h-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-xs font-medium text-slate-700 truncate">{label}</span>
                    <span className="text-xs font-semibold text-slate-900">{score}%</span>
                  </div>
                  <Progress value={score} className="h-1.5" indicatorClassName={color} />
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
