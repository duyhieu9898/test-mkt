'use client';

/**
 * CEO Dashboard — "What should I do today?"
 *
 * Growth Score widget + Daily Missions + System Progress + Quick Stats.
 * Gamified but professional — CEO-worthy motivation engine.
 */

import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Megaphone,
  Briefcase,
  Target,
  CalendarClock,
  Coins,
  Lightbulb,
  Trophy,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { api } from '@/lib/api/client';
import { cn } from '@/lib/utils';
import {
  useGrowthScore,
  useDailyMissions,
  useStreak,
  useCompleteMission,
  useSkipMission,
} from '@/lib/api/hooks';
import { usePreferredAppLanguage } from '@/lib/use-preferred-app-language';
import { GrowthScoreWidget } from '@/components/dashboard/growth-score-widget';
import { TodaysFocus } from '@/components/dashboard/todays-focus';
import { SystemProgressBars } from '@/components/dashboard/system-progress-bars';
import { MilestoneToast } from '@/components/dashboard/milestone-toast';
import { AchievementsPanel } from '@/components/dashboard/achievements-panel';
import { AiTeamOverview } from '@/components/dashboard/ai-team-overview';
import { GettingStartedHub } from '@/components/dashboard/getting-started-hub';

// === Types (kept for backward compat with advisor brief query) ===

interface BriefWin { what: string; detail?: string; }
interface AdvisorBrief {
  id: string;
  generatedAt: string;
  headline: string | null;
  actions: Array<{ title: string; why: string; impact?: string; link?: string; severity?: string }>;
  wins: BriefWin[];
}
interface Campaign { id: string }
interface Deal { id: string }
interface Competitor { id: string }
interface Meeting { id: string; title?: string; createdAt?: string; meetingDate?: string }

function relativeDate(iso?: string): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86_400_000);
  if (d < 1) return 'today';
  if (d === 1) return 'yesterday';
  if (d < 7) return `${d}d ago`;
  return `${Math.floor(d / 7)}w ago`;
}

export default function DashboardPage() {
  const params = useParams();
  const router = useRouter();
  const companyId = params.companyId as string;
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);

  const auth = { token: token! };
  const enabled = !!token;

  // === Gamification hooks ===
  const growthScoreQ = useGrowthScore(companyId);
  const missionsQ = useDailyMissions(companyId);
  const streakQ = useStreak(companyId);
  const completeMutation = useCompleteMission(companyId);
  const skipMutation = useSkipMission(companyId);
  const [language] = usePreferredAppLanguage('en');

  // === Existing data hooks ===
  const briefQ = useQuery({
    queryKey: ['ceo-advisor', 'latest', companyId],
    queryFn: () => api.get<{ brief: AdvisorBrief | null }>(`/insights/${companyId}/advisor/latest`, auth),
    enabled,
  });
  const campaignsQ = useQuery({
    queryKey: ['campaigns', companyId],
    queryFn: () => api.get<{ data: Campaign[] }>(`/campaigns/${companyId}`, auth),
    enabled,
  });
  const dealsQ = useQuery({
    queryKey: ['sales', 'deals', companyId],
    queryFn: () => api.get<{ data: Deal[] }>(`/sales/${companyId}/deals`, auth),
    enabled,
  });
  const competitorsQ = useQuery({
    queryKey: ['market', 'competitors', companyId],
    queryFn: () => api.get<{ data: Competitor[] }>(`/market/${companyId}/competitors`, auth),
    enabled,
  });
  const meetingsQ = useQuery({
    queryKey: ['meetings', companyId],
    queryFn: () => api.get<{ data: Meeting[] }>(`/meetings/company/${companyId}`, auth),
    enabled,
  });

  const firstWin = briefQ.data?.brief?.wins?.[0];
  const campaignsCount = campaignsQ.data?.data?.length ?? 0;
  const dealsCount = dealsQ.data?.data?.length ?? 0;
  const competitorsCount = competitorsQ.data?.data?.length ?? 0;
  const meetings = meetingsQ.data?.data ?? [];
  const lastMeeting = meetings[0];
  const lastMeetingLabel = relativeDate(lastMeeting?.meetingDate ?? lastMeeting?.createdAt);

  const firstName = user?.name?.split(' ')[0] ?? 'there';
  const isJapanese = language === 'ja';
  const isVietnamese = language === 'vi';
  const localizedLastMeetingLabel = isJapanese
    ? (lastMeetingLabel === 'today' ? '今日' : lastMeetingLabel === 'yesterday' ? '昨日' : lastMeetingLabel)
    : isVietnamese
      ? (lastMeetingLabel === 'today' ? 'hôm nay' : lastMeetingLabel === 'yesterday' ? 'hôm qua' : lastMeetingLabel)
    : lastMeetingLabel;

  const stats = [
    { icon: Megaphone, label: isVietnamese ? 'Campaigns' : isJapanese ? 'キャンペーン' : 'Campaigns', value: campaignsCount, link: `/${companyId}/campaigns`, tint: 'text-orange-600 bg-orange-50' },
    { icon: Briefcase, label: isVietnamese ? 'Deals' : isJapanese ? '商談' : 'Deals', value: dealsCount, link: `/${companyId}/sales`, tint: 'text-emerald-600 bg-emerald-50' },
    { icon: Target, label: isVietnamese ? 'Đối thủ' : isJapanese ? '競合' : 'Competitors', value: competitorsCount, link: `/${companyId}/market`, tint: 'text-rose-600 bg-rose-50' },
    { icon: CalendarClock, label: isVietnamese ? 'Cuộc họp gần nhất' : isJapanese ? '最新ミーティング' : 'Last meeting', value: localizedLastMeetingLabel, link: `/${companyId}/meetings`, tint: 'text-indigo-600 bg-indigo-50' },
  ];

  const gamificationLoading = growthScoreQ.isLoading || missionsQ.isLoading;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          {isVietnamese ? `Xin chào ${firstName}` : isJapanese ? `${firstName}さん、こんにちは` : `Hello ${firstName}`}
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          {isVietnamese
            ? 'Đây là những việc AI nghĩ bạn nên tập trung hôm nay.'
            : isJapanese
            ? '今日、AIが優先すべきだと考えていることです。'
            : "Here's what your AI thinks you should focus on today."}
        </p>
      </div>

      <GettingStartedHub
        companyId={companyId}
        advisorReady={Boolean(briefQ.data?.brief)}
        advisorRecommendation={briefQ.data?.brief?.actions?.[0]}
        competitorCount={competitorsCount}
        externalStatusLoading={briefQ.isLoading || competitorsQ.isLoading}
        externalStatusError={briefQ.isError || competitorsQ.isError}
      />

      {/* Growth Score + Today's Focus */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1">
          <GrowthScoreWidget
            data={growthScoreQ.data}
            loading={growthScoreQ.isLoading}
          />
        </div>
        <div className="lg:col-span-2">
          <TodaysFocus
            missions={missionsQ.data}
            streak={streakQ.data}
            loading={missionsQ.isLoading}
            onComplete={(id) => completeMutation.mutate(id)}
            onSkip={(id) => skipMutation.mutate(id)}
            companyId={companyId}
          />
        </div>
      </div>

      <AiTeamOverview companyId={companyId} />

      {/* System Progress Bars */}
      <SystemProgressBars data={growthScoreQ.data} loading={growthScoreQ.isLoading} />

      {/* Achievements */}
      <AchievementsPanel
        growthScore={growthScoreQ.data}
        streak={streakQ.data}
        campaignsCount={campaignsCount}
        competitorsCount={competitorsCount}
        dealsCount={dealsCount}
      />

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <Card
              key={s.label}
              className="cursor-pointer hover:border-indigo-200 hover:shadow-sm transition-all"
              onClick={() => router.push(s.link)}
            >
              <CardContent className="p-4">
                <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center mb-2', s.tint)}>
                  <Icon className="w-4 h-4" />
                </div>
                <p className="text-2xl font-bold text-slate-900 leading-tight truncate">{s.value}</p>
                <div className="flex items-center justify-between mt-1">
                  <p className="text-xs text-slate-500">{s.label}</p>
                  <span className="text-xs text-indigo-600 flex items-center gap-0.5">
                    {isVietnamese ? 'Xem' : isJapanese ? '表示' : 'View'} <ArrowRight className="w-3 h-3" />
                  </span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Recent Win */}
      {firstWin && (
        <Card className="border-emerald-200 bg-emerald-50/60">
          <CardContent className="p-4 flex items-start gap-3">
            <Trophy className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wider flex items-center gap-1">
                <Lightbulb className="w-3 h-3" /> AI tip — recent win
              </p>
              <p className="text-sm text-slate-800 mt-1 font-medium">{firstWin.what}</p>
              {firstWin.detail && <p className="text-xs text-slate-600 mt-0.5">{firstWin.detail}</p>}
            </div>
          </CardContent>
        </Card>
      )}

      {/* CTA when no missions yet */}
      {!gamificationLoading && (!missionsQ.data || missionsQ.data.missions.length === 0) && (
        <Button
          className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white w-full sm:w-auto"
          onClick={() => router.push(`/${companyId}/insights`)}
        >
          <Sparkles className="w-4 h-4" />
          {isVietnamese ? 'Nhờ AI tư vấn riêng' : isJapanese ? 'AIに個別アドバイスを依頼' : 'Ask AI for personalized advice'}
          <Badge className="ml-1 bg-indigo-500 text-white gap-1 hover:bg-indigo-500">
            <Coins className="w-3 h-3" /> 10
          </Badge>
        </Button>
      )}

      {/* Milestone notifications */}
      <MilestoneToast
        growthScore={growthScoreQ.data}
        streak={streakQ.data}
        missions={missionsQ.data}
        campaignsCount={campaignsCount}
      />
    </div>
  );
}
