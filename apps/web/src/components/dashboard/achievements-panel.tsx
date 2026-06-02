'use client';

/**
 * Achievements Panel — professional business achievement tracker.
 * Shows unlocked + locked achievements in a clean grid.
 * No DB needed — computed from existing data client-side.
 */

import { Card, CardContent } from '@/components/ui/card';
import {
  Trophy,
  TrendingUp,
  Flame,
  Rocket,
  Target,
  Zap,
  BookOpen,
  Users,
  Globe,
  Check,
  Lock,
  Megaphone,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { GrowthScoreData, StreakData } from '@/lib/api/hooks';

interface AchievementDef {
  id: string;
  title: string;
  description: string;
  icon: typeof Trophy;
  category: 'growth' | 'consistency' | 'automation' | 'revenue';
  check: (ctx: AchievementCtx) => boolean;
}

interface AchievementCtx {
  growthScore: GrowthScoreData | undefined;
  streak: StreakData | undefined;
  campaignsCount: number;
  competitorsCount: number;
  dealsCount: number;
}

const ACHIEVEMENTS: AchievementDef[] = [
  // Growth
  { id: 'score_10', title: 'First Steps', description: 'Growth Score reaches 10', icon: TrendingUp, category: 'growth', check: (c) => (c.growthScore?.overall ?? 0) >= 10 },
  { id: 'score_30', title: 'Foundation Set', description: 'Growth Score reaches 30 (Level 2)', icon: TrendingUp, category: 'growth', check: (c) => (c.growthScore?.overall ?? 0) >= 30 },
  { id: 'score_60', title: 'Growth Engine', description: 'Growth Score reaches 60 (Level 3)', icon: Rocket, category: 'growth', check: (c) => (c.growthScore?.overall ?? 0) >= 60 },
  { id: 'score_80', title: 'Optimization Master', description: 'Growth Score reaches 80 (Level 4)', icon: Trophy, category: 'growth', check: (c) => (c.growthScore?.overall ?? 0) >= 80 },

  // Consistency
  { id: 'streak_1', title: 'Day One', description: 'Complete your first daily mission', icon: Zap, category: 'consistency', check: (c) => (c.streak?.totalMissionsCompleted ?? 0) >= 1 },
  { id: 'streak_3d', title: '3-Day Focus', description: 'Maintain a 3-day streak', icon: Flame, category: 'consistency', check: (c) => (c.streak?.longestStreak ?? 0) >= 3 },
  { id: 'streak_7d', title: 'Weekly Warrior', description: 'Maintain a 7-day streak', icon: Flame, category: 'consistency', check: (c) => (c.streak?.longestStreak ?? 0) >= 7 },
  { id: 'missions_25', title: 'Mission Veteran', description: 'Complete 25 total missions', icon: Target, category: 'consistency', check: (c) => (c.streak?.totalMissionsCompleted ?? 0) >= 25 },

  // Automation
  { id: 'auto_30', title: 'AI Apprentice', description: 'Automation Score reaches 30', icon: Users, category: 'automation', check: (c) => (c.growthScore?.subscores.automation.score ?? 0) >= 30 },
  { id: 'auto_60', title: 'AI Commander', description: 'Automation Score reaches 60', icon: Users, category: 'automation', check: (c) => (c.growthScore?.subscores.automation.score ?? 0) >= 60 },

  // Revenue
  { id: 'first_campaign', title: 'Market Entry', description: 'Create your first campaign', icon: Megaphone, category: 'revenue', check: (c) => c.campaignsCount >= 1 },
  { id: 'first_competitor', title: 'Know Thy Enemy', description: 'Track your first competitor', icon: Globe, category: 'revenue', check: (c) => c.competitorsCount >= 1 },
];

const categoryLabels: Record<string, { label: string; color: string }> = {
  growth: { label: 'Growth', color: 'text-emerald-600' },
  consistency: { label: 'Consistency', color: 'text-orange-600' },
  automation: { label: 'Automation', color: 'text-purple-600' },
  revenue: { label: 'Revenue', color: 'text-amber-600' },
};

interface Props {
  growthScore: GrowthScoreData | undefined;
  streak: StreakData | undefined;
  campaignsCount: number;
  competitorsCount: number;
  dealsCount: number;
}

export function AchievementsPanel({ growthScore, streak, campaignsCount, competitorsCount, dealsCount }: Props) {
  const ctx: AchievementCtx = { growthScore, streak, campaignsCount, competitorsCount, dealsCount };

  const unlocked = ACHIEVEMENTS.filter((a) => a.check(ctx));
  const locked = ACHIEVEMENTS.filter((a) => !a.check(ctx));

  return (
    <Card className="border-slate-200">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Achievements
            </p>
            <p className="text-xs text-slate-400 mt-0.5">
              {unlocked.length} of {ACHIEVEMENTS.length} unlocked
            </p>
          </div>
          <div className="flex items-center gap-1 text-sm font-semibold text-amber-600">
            <Trophy className="w-4 h-4" />
            {unlocked.length}
          </div>
        </div>

        {/* Unlocked */}
        {unlocked.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
            {unlocked.map((a) => {
              const cat = categoryLabels[a.category];
              return (
                <div
                  key={a.id}
                  className="flex flex-col items-center p-3 rounded-lg border border-slate-200 bg-white text-center"
                >
                  <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center mb-1.5">
                    <a.icon className="w-4 h-4 text-emerald-600" />
                  </div>
                  <p className="text-xs font-semibold text-slate-900 leading-tight">{a.title}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">{a.description}</p>
                  <span className={cn('text-[9px] font-medium mt-1', cat?.color)}>{cat?.label}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Locked */}
        {locked.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {locked.map((a) => (
              <div
                key={a.id}
                className="flex flex-col items-center p-3 rounded-lg border border-dashed border-slate-200 bg-slate-50/50 text-center opacity-50"
              >
                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center mb-1.5">
                  <Lock className="w-3.5 h-3.5 text-slate-400" />
                </div>
                <p className="text-xs font-medium text-slate-500 leading-tight">{a.title}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">{a.description}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
