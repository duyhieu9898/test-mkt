'use client';

/**
 * Today's Focus — daily missions card with streak indicator.
 * Replaces the bare CEO Advisor brief on the dashboard.
 */

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ArrowRight,
  Check,
  X,
  Flame,
  Rocket,
  Cpu,
  FileText,
  DollarSign,
  Settings,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { MissionsData, StreakData, MissionItem } from '@/lib/api/hooks';
import { cn } from '@/lib/utils';

interface Props {
  missions: MissionsData | undefined;
  streak: StreakData | undefined;
  loading?: boolean;
  onComplete: (missionId: string) => void;
  onSkip: (missionId: string) => void;
  companyId: string;
}

const categoryConfig: Record<string, { icon: typeof Rocket; tint: string; label: string }> = {
  growth: { icon: Rocket, tint: 'text-indigo-600 bg-indigo-50', label: 'Growth' },
  automation: { icon: Cpu, tint: 'text-purple-600 bg-purple-50', label: 'Automation' },
  content: { icon: FileText, tint: 'text-emerald-600 bg-emerald-50', label: 'Content' },
  revenue: { icon: DollarSign, tint: 'text-amber-600 bg-amber-50', label: 'Revenue' },
  optimization: { icon: Settings, tint: 'text-slate-600 bg-slate-100', label: 'Optimize' },
};

function MissionCard({
  mission,
  onComplete,
  onSkip,
  companyId,
}: {
  mission: MissionItem;
  onComplete: (id: string) => void;
  onSkip: (id: string) => void;
  companyId: string;
}) {
  const router = useRouter();
  const config = categoryConfig[mission.category] ?? categoryConfig.growth;
  const Icon = config.icon;
  const done = mission.status === 'completed';
  const skipped = mission.status === 'skipped';

  return (
    <div
      className={cn(
        'flex items-start gap-3 p-3 rounded-lg border transition-colors',
        done
          ? 'bg-emerald-50/50 border-emerald-200'
          : skipped
          ? 'bg-slate-50 border-slate-200 opacity-60'
          : 'bg-white border-slate-200 hover:border-indigo-200'
      )}
    >
      {/* Checkbox area */}
      <button
        className={cn(
          'w-5 h-5 rounded border flex-shrink-0 mt-0.5 flex items-center justify-center transition-colors',
          done
            ? 'bg-emerald-500 border-emerald-500 text-white'
            : 'border-slate-300 hover:border-indigo-400'
        )}
        onClick={() => !done && !skipped && onComplete(mission.id)}
        disabled={done || skipped}
      >
        {done && <Check className="w-3 h-3" />}
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <Badge className={cn('text-[10px] px-1.5 py-0 gap-1 border-0', config.tint)}>
            <Icon className="w-2.5 h-2.5" />
            {config.label}
          </Badge>
        </div>
        <h4 className={cn('text-sm font-medium text-slate-900', done && 'line-through text-slate-500')}>
          {mission.title}
        </h4>
        <p className="text-xs text-slate-500 mt-0.5">{mission.why}</p>
        {mission.impact && (
          <p className="text-[11px] text-emerald-600 mt-0.5 font-medium">{mission.impact}</p>
        )}
      </div>

      <div className="flex items-center gap-1 flex-shrink-0">
        {!done && !skipped && (
          <>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 text-slate-400 hover:text-slate-600"
              onClick={() => onSkip(mission.id)}
              title="Skip"
            >
              <X className="w-3 h-3" />
            </Button>
            <Button
              size="sm"
              className="h-7 gap-1 text-xs bg-indigo-600 hover:bg-indigo-700"
              onClick={() => {
                const link = mission.link.startsWith('/')
                  ? mission.link
                  : `/${companyId}${mission.link}`;
                router.push(link);
              }}
            >
              Go <ArrowRight className="w-3 h-3" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

export function TodaysFocus({ missions, streak, loading, onComplete, onSkip, companyId }: Props) {
  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="h-48 bg-slate-100 rounded-lg animate-pulse" />
        </CardContent>
      </Card>
    );
  }

  const missionList = missions?.missions ?? [];
  const completed = missions?.completedCount ?? 0;
  const total = missions?.totalCount ?? 0;
  const streakDays = streak?.currentStreak ?? 0;

  return (
    <Card className="border-indigo-200 bg-gradient-to-br from-indigo-50/50 via-white to-white">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wider">
              Today's Focus
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              {completed} of {total} completed
            </p>
          </div>
          {streakDays > 0 && (
            <Badge className="gap-1 bg-orange-50 text-orange-600 border-orange-200 border">
              <Flame className="w-3 h-3" />
              {streakDays}-day streak
            </Badge>
          )}
        </div>

        <div className="space-y-2">
          {missionList.map((mission) => (
            <MissionCard
              key={mission.id}
              mission={mission}
              onComplete={onComplete}
              onSkip={onSkip}
              companyId={companyId}
            />
          ))}
          {missionList.length === 0 && (
            <p className="text-sm text-slate-500 text-center py-8">
              No missions yet. Refresh your AI advisor to get personalized tasks.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
