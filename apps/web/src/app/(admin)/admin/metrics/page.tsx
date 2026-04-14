'use client';

/**
 * Founder Metrics Dashboard (P0-D4)
 * --------------------------------
 * Single-pane-of-glass health check for the 1Person platform. Fetches
 * /admin/metrics/overview every 30s. Admin gating happens in the layout.
 */

import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth-store';
import { api } from '@/lib/api/client';
import { Card, CardContent } from '@/components/ui/card';
import {
  Users,
  Building2,
  Rocket,
  Zap,
  AlertTriangle,
  Heart,
  RefreshCw,
} from 'lucide-react';

interface MetricsOverview {
  users: { total: number; new7d: number; new24h: number; activeNow: number };
  companies: { total: number; onboardedFully: number };
  campaigns: {
    total: number;
    generated7d: number;
    launched7d: number;
    failed7d: number;
    live: number;
  };
  llm: { traceCount7d: number; estimatedCostUsd7d: number; avgLatencyMs: number };
  errors: { count24h: number; count7d: number };
  health: { apiUptime: string; postgresUp: boolean; langfuseUp: boolean };
}

type Tone = 'good' | 'warn' | 'bad' | 'neutral';

const toneClasses: Record<Tone, { ring: string; icon: string; bg: string }> = {
  good: { ring: 'border-emerald-200', icon: 'text-emerald-600', bg: 'bg-emerald-50' },
  warn: { ring: 'border-amber-200', icon: 'text-amber-600', bg: 'bg-amber-50' },
  bad: { ring: 'border-red-200', icon: 'text-red-600', bg: 'bg-red-50' },
  neutral: { ring: 'border-gray-200', icon: 'text-gray-600', bg: 'bg-gray-50' },
};

function MetricCard({
  icon: Icon,
  label,
  value,
  trend,
  description,
  tone = 'neutral',
}: {
  icon: any;
  label: string;
  value: string | number;
  trend?: string;
  description?: string;
  tone?: Tone;
}) {
  const t = toneClasses[tone];
  return (
    <Card className={`border ${t.ring}`}>
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          <div className={`p-2.5 rounded-lg ${t.bg}`}>
            <Icon className={`w-5 h-5 ${t.icon}`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-500">{label}</p>
            <div className="flex items-baseline gap-2">
              <p className="text-3xl font-bold text-gray-900 truncate">{value}</p>
              {trend && (
                <span className={`text-xs font-medium ${t.icon}`}>{trend}</span>
              )}
            </div>
            {description && (
              <p className="text-xs text-gray-500 mt-1">{description}</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SkeletonCard() {
  return (
    <Card className="border border-gray-200">
      <CardContent className="p-5">
        <div className="flex items-start gap-4 animate-pulse">
          <div className="w-10 h-10 rounded-lg bg-gray-200" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-24 bg-gray-200 rounded" />
            <div className="h-8 w-20 bg-gray-200 rounded" />
            <div className="h-3 w-32 bg-gray-200 rounded" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function FounderMetricsPage() {
  const token = useAuthStore((s) => s.token);

  const { data, isLoading, dataUpdatedAt, isFetching, refetch } = useQuery<MetricsOverview>({
    queryKey: ['admin', 'metrics', 'overview'],
    queryFn: () =>
      api.get<MetricsOverview>('/admin/metrics/overview', { token: token || undefined }),
    enabled: !!token,
    refetchInterval: 30_000,
  });

  // Tone rules — keep them simple and obvious.
  const errorsTone: Tone =
    (data?.errors.count24h ?? 0) > 20
      ? 'bad'
      : (data?.errors.count24h ?? 0) > 5
        ? 'warn'
        : 'good';

  const costTone: Tone =
    (data?.llm.estimatedCostUsd7d ?? 0) > 50
      ? 'warn'
      : (data?.llm.estimatedCostUsd7d ?? 0) > 200
        ? 'bad'
        : 'good';

  const healthTone: Tone =
    data?.health.postgresUp && data?.health.langfuseUp ? 'good' : 'warn';

  const lastRefreshed = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString()
    : '—';

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Founder Metrics</h1>
          <p className="text-gray-500 mt-1">
            Single-pane health check of the 1Person platform. Auto-refreshes every 30s.
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm text-gray-500">
          <span>Last refreshed: {lastRefreshed}</span>
          <button
            onClick={() => refetch()}
            className="p-2 rounded-lg hover:bg-gray-100 transition"
            title="Refresh now"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <MetricCard
            icon={Users}
            label="Users"
            value={data?.users.total ?? 0}
            trend={`+${data?.users.new7d ?? 0} this week`}
            description={`${data?.users.new24h ?? 0} new in last 24h · ${data?.users.activeNow ?? 0} active now`}
            tone="good"
          />
          <MetricCard
            icon={Building2}
            label="Companies"
            value={data?.companies.total ?? 0}
            description={`${data?.companies.onboardedFully ?? 0} fully onboarded`}
            tone="neutral"
          />
          <MetricCard
            icon={Rocket}
            label="Campaigns"
            value={data?.campaigns.total ?? 0}
            trend={`+${data?.campaigns.generated7d ?? 0} this week`}
            description={`${data?.campaigns.live ?? 0} live · ${data?.campaigns.launched7d ?? 0} launched 7d · ${data?.campaigns.failed7d ?? 0} failed 7d`}
            tone={(data?.campaigns.failed7d ?? 0) > 5 ? 'warn' : 'good'}
          />
          <MetricCard
            icon={Zap}
            label="LLM Cost (7d)"
            value={`$${(data?.llm.estimatedCostUsd7d ?? 0).toFixed(2)}`}
            description={`${data?.llm.traceCount7d ?? 0} traces · avg ${data?.llm.avgLatencyMs ?? 0}ms`}
            tone={costTone}
          />
          <MetricCard
            icon={AlertTriangle}
            label="Errors (24h)"
            value={data?.errors.count24h ?? 0}
            description={`${data?.errors.count7d ?? 0} in last 7d`}
            tone={errorsTone}
          />
          <MetricCard
            icon={Heart}
            label="Platform Health"
            value={data?.health.apiUptime ?? '—'}
            description={`Postgres ${data?.health.postgresUp ? 'up' : 'down'} · Langfuse ${data?.health.langfuseUp ? 'up' : 'down'}`}
            tone={healthTone}
          />
        </div>
      )}
    </div>
  );
}
