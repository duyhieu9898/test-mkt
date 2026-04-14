'use client';

/**
 * Milestone Toast — professional notification when business thresholds are crossed.
 * No confetti, no badges — clean "achievement unlocked" notice.
 * Dismissed milestones stored in localStorage.
 */

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Trophy, TrendingUp, Flame, Rocket, Target, Zap } from 'lucide-react';
import type { GrowthScoreData, StreakData, MissionsData } from '@/lib/api/hooks';

// === Milestone definitions ===

interface MilestoneDef {
  id: string;
  title: string;
  description: string;
  icon: typeof Trophy;
  color: string;
  check: (ctx: MilestoneContext) => boolean;
}

interface MilestoneContext {
  growthScore: GrowthScoreData | undefined;
  streak: StreakData | undefined;
  missions: MissionsData | undefined;
  campaignsCount: number;
  landingPagesPublished: number;
}

const MILESTONES: MilestoneDef[] = [
  {
    id: 'first_mission',
    title: 'First Mission Complete',
    description: 'You completed your first daily mission. Keep building momentum.',
    icon: Zap,
    color: 'border-indigo-300 bg-indigo-50',
    check: (ctx) => (ctx.streak?.totalMissionsCompleted ?? 0) >= 1,
  },
  {
    id: 'streak_3',
    title: '3-Day Streak',
    description: 'Three days of consistent action. Your AI system is learning from you.',
    icon: Flame,
    color: 'border-orange-300 bg-orange-50',
    check: (ctx) => (ctx.streak?.currentStreak ?? 0) >= 3,
  },
  {
    id: 'streak_7',
    title: 'Week-Long Streak',
    description: 'A full week of daily engagement. Your growth engine is warming up.',
    icon: Flame,
    color: 'border-orange-300 bg-orange-50',
    check: (ctx) => (ctx.streak?.currentStreak ?? 0) >= 7,
  },
  {
    id: 'score_25',
    title: 'Growth Score 25+',
    description: 'Your business system is taking shape. Foundation is set.',
    icon: TrendingUp,
    color: 'border-emerald-300 bg-emerald-50',
    check: (ctx) => (ctx.growthScore?.overall ?? 0) >= 25,
  },
  {
    id: 'score_50',
    title: 'Growth Score 50+',
    description: 'Halfway to a fully optimized growth machine. Strong progress.',
    icon: TrendingUp,
    color: 'border-emerald-300 bg-emerald-50',
    check: (ctx) => (ctx.growthScore?.overall ?? 0) >= 50,
  },
  {
    id: 'score_75',
    title: 'Growth Score 75+',
    description: 'Your AI-powered business system is operating at high capacity.',
    icon: Trophy,
    color: 'border-amber-300 bg-amber-50',
    check: (ctx) => (ctx.growthScore?.overall ?? 0) >= 75,
  },
  {
    id: 'level_2',
    title: 'Level 2 Unlocked — Growth',
    description: 'New features available: Campaigns, Market Intelligence, Brain.',
    icon: Rocket,
    color: 'border-purple-300 bg-purple-50',
    check: (ctx) => (ctx.growthScore?.level ?? 1) >= 2,
  },
  {
    id: 'level_3',
    title: 'Level 3 Unlocked — Scale',
    description: 'Advanced features available: Sales Pipeline, Social Media.',
    icon: Rocket,
    color: 'border-purple-300 bg-purple-50',
    check: (ctx) => (ctx.growthScore?.level ?? 1) >= 3,
  },
  {
    id: 'level_4',
    title: 'Level 4 Unlocked — Optimize',
    description: 'Full system access. Your growth machine is complete.',
    icon: Trophy,
    color: 'border-amber-300 bg-amber-50',
    check: (ctx) => (ctx.growthScore?.level ?? 1) >= 4,
  },
  {
    id: 'first_campaign',
    title: 'First Campaign Created',
    description: 'Your first marketing campaign is live. AI is driving traffic.',
    icon: Target,
    color: 'border-indigo-300 bg-indigo-50',
    check: (ctx) => ctx.campaignsCount >= 1,
  },
  {
    id: 'missions_10',
    title: '10 Missions Completed',
    description: 'Consistent execution. Your business is building real momentum.',
    icon: Zap,
    color: 'border-indigo-300 bg-indigo-50',
    check: (ctx) => (ctx.streak?.totalMissionsCompleted ?? 0) >= 10,
  },
];

const STORAGE_KEY = 'ceo_milestones_dismissed';

function getDismissed(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function dismissMilestone(id: string) {
  const dismissed = getDismissed();
  dismissed.add(id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(dismissed)));
}

// === Component ===

interface Props {
  growthScore: GrowthScoreData | undefined;
  streak: StreakData | undefined;
  missions: MissionsData | undefined;
  campaignsCount: number;
  landingPagesPublished?: number;
}

export function MilestoneToast({
  growthScore,
  streak,
  missions,
  campaignsCount,
  landingPagesPublished = 0,
}: Props) {
  const [visible, setVisible] = useState<MilestoneDef | null>(null);

  useEffect(() => {
    // Don't show milestones until data is loaded
    if (!growthScore && !streak) return;

    const ctx: MilestoneContext = {
      growthScore,
      streak,
      missions,
      campaignsCount,
      landingPagesPublished,
    };

    const dismissed = getDismissed();

    // Find the first un-dismissed milestone that passes its check
    const triggered = MILESTONES.find(
      (m) => !dismissed.has(m.id) && m.check(ctx)
    );

    if (triggered && triggered.id !== visible?.id) {
      setVisible(triggered);
    }
  }, [growthScore, streak, missions, campaignsCount, landingPagesPublished, visible?.id]);

  const handleDismiss = () => {
    if (visible) {
      dismissMilestone(visible.id);
      setVisible(null);
    }
  };

  // Auto-dismiss after 8 seconds
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(handleDismiss, 8000);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible?.id]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 20, x: 20 }}
          animate={{ opacity: 1, y: 0, x: 0 }}
          exit={{ opacity: 0, y: 10, x: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="fixed bottom-6 right-6 z-50 max-w-sm"
        >
          <div className={`rounded-xl border shadow-lg p-4 ${visible.color}`}>
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-white/80 flex items-center justify-center flex-shrink-0">
                <visible.icon className="w-5 h-5 text-slate-700" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-0.5">
                  Milestone reached
                </p>
                <h4 className="text-sm font-semibold text-slate-900">{visible.title}</h4>
                <p className="text-xs text-slate-600 mt-0.5">{visible.description}</p>
              </div>
              <button
                onClick={handleDismiss}
                className="p-1 rounded-md hover:bg-white/50 transition-colors flex-shrink-0"
              >
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
