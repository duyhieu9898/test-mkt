'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  DollarSign,
  Eye,
  Loader2,
  MousePointer,
  RefreshCw,
  Settings2,
  TrendingUp,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MetaAdsStatusBadge } from '@/components/campaigns/meta-ads-status-badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { api } from '@/lib/api/client';
import { useAuthStore } from '@/stores/auth-store';

type Campaign = {
  id: string;
  name: string;
  status: string;
  effectiveStatus?: string | null;
  objective: string;
  impressions: number;
  clicks: number;
  reach: number;
  frequency: string | null;
  conversions: number;
  spentAmount: string | null;
  ctr: string | null;
  cpc: string | null;
  cpm: string | null;
  updatedAt: string;
};
type PerformanceDatePreset =
  | 'today'
  | 'yesterday'
  | 'today_and_yesterday'
  | 'last_7d'
  | 'last_30d'
  | 'last_90d'
  | 'last_360d'
  | 'last_720d'
  | 'this_week'
  | 'this_month'
  | 'last_month';
type SyncResult = {
  campaigns: number;
  adSets: number;
  ads: number;
  performanceDatePreset: PerformanceDatePreset;
  performanceStart: string;
  performanceEnd: string;
  syncedAt: string;
};
type Overview = {
  connection: {
    status: 'pending' | 'connected' | 'expired' | 'revoked' | 'error';
    accountId?: string | null;
    accountName?: string | null;
    currency?: string | null;
    timezone?: string | null;
    lastSyncedAt?: string | null;
    lastError?: string | null;
  } | null;
  campaigns: Campaign[];
  developmentFixtures: Campaign[];
  totals: { spend: number; impressions: number; clicks: number; conversions: number; costPerConversion: number | null };
  performanceDatePreset: PerformanceDatePreset;
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
};
type CompanyRecommendation = {
  id: string;
  companyId: string;
  campaignId: string;
  campaignName: string;
  status: 'recommended' | 'saved' | 'rejected' | 'handled_manually';
  priority: string;
  type: string;
  problem: string;
  evidence: Record<string, unknown>[];
  possibleCause?: string | null;
  suggestedAction?: Record<string, unknown> | null;
  createdAt: string;
};
type RecommendationsResponse = {
  items: CompanyRecommendation[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
};

const performanceDatePresets: Array<{ value: PerformanceDatePreset; label: string }> = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'today_and_yesterday', label: 'Today and yesterday' },
  { value: 'last_7d', label: 'Last 7 days' },
  { value: 'last_30d', label: 'Last 30 days' },
  { value: 'last_90d', label: 'Last 90 days' },
  { value: 'last_360d', label: 'Last 360 days' },
  { value: 'last_720d', label: 'Last 720 days' },
  { value: 'this_week', label: 'This week' },
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
];
const performanceDatePresetLabel = (preset: PerformanceDatePreset) =>
  performanceDatePresets.find((item) => item.value === preset)?.label || preset;
const money = (amount: number, currency?: string | null) =>
  new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: currency || 'USD',
    maximumFractionDigits: 2,
  }).format(amount);

/** Facebook Ads remains a panel inside Campaigns, never a standalone route. */
export function FacebookAdsOverview() {
  const params = useParams();
  const companyId = params.companyId as string;
  const token = useAuthStore((state) => state.token);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<SyncResult | null>(null);
  const [page, setPage] = useState(1);
  const loadOverview = useCallback(
    async (requestedPage: number) => {
      if (!token) return;
      setLoading(true);
      setApiError(null);
      try {
        const result = await api.get<{ data: Overview }>(
          `/ads/company/${companyId}/facebook/overview?page=${requestedPage}`,
          { token }
        );
        setOverview(result.data);
      } catch (error) {
        const msg = (error as Error).message || 'Could not load Meta Ads data.';
        setApiError(msg);
        toast.error(msg);
      } finally {
        setLoading(false);
      }
    },
    [companyId, token]
  );
  useEffect(() => {
    void loadOverview(page);
  }, [loadOverview, page]);
  const sync = async (performanceDatePreset: PerformanceDatePreset = 'last_30d') => {
    if (!token) return;
    setSyncing(true);
    try {
      const result = await api.post<{ data: SyncResult }>(
        `/ads/company/${companyId}/facebook/sync`,
        { performanceDatePreset },
        { token }
      );
      setLastSync(result.data);
      if (result.data.campaigns === 0 && result.data.adSets === 0 && result.data.ads === 0) {
        toast.success(
          'Sync completed. Meta returned no API-visible campaigns; Ads Manager drafts are not synced.'
        );
      } else {
        toast.success(
          `Synced hierarchy: ${result.data.campaigns} campaigns, ${result.data.adSets} ad sets, and ${result.data.ads} ads. Performance refreshed for ${performanceDatePresetLabel(result.data.performanceDatePreset)}.`
        );
      }
      setPage(1);
      await loadOverview(1);
    } catch (error) {
      toast.error((error as Error).message || 'Meta Ads sync failed.');
    } finally {
      setSyncing(false);
    }
  };
  const totals = overview?.totals || { spend: 0, impressions: 0, clicks: 0, conversions: 0, costPerConversion: null };
  const ctr = totals.impressions ? (totals.clicks / totals.impressions) * 100 : 0;
  if (loading)
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
      </div>
    );
  const connection = overview?.connection;
  const isReady = connection?.status === 'connected';
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-bold">Facebook Ads performance</h2>
          <p className="text-muted-foreground">
            Read-only performance, evidence, and opportunities.
          </p>
        </div>
        {isReady && (
          <Button onClick={() => void sync()} disabled={syncing} className="gap-2">
            {syncing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Sync now
          </Button>
        )}
      </div>
      {apiError ? (
        <ConnectionState
          title="Could not load Meta Ads data"
          description={apiError}
          action="Retry"
          href="#"
          onClick={() => void loadOverview(page)}
          error
        />
      ) : !connection ? (
        <ConnectionState
          title="Connect Meta Ads to begin"
          description="Connect Facebook, then choose the Meta Ad Account that 1Person may read. No ads will be created or changed."
          action="Connect Meta Ads"
          href={`/${companyId}/settings?tab=integrations`}
        />
      ) : connection.status === 'pending' ? (
        <ConnectionState
          title="Choose a Meta Ad Account"
          description="Facebook is connected, but campaign data remains unavailable until you select an Ad Account with read access."
          action="Select Meta Ad Account"
          href={`/${companyId}/settings?tab=integrations`}
        />
      ) : connection.status !== 'connected' ? (
        <ConnectionState
          title="Meta Ads needs attention"
          description={
            connection.lastError ||
            'Reconnect Facebook and choose the Ad Account again to resume sync.'
          }
          action="Open integrations"
          href={`/${companyId}/settings?tab=integrations`}
          error
        />
      ) : (
        <>
          <Card className="border-blue-200 bg-blue-50/50">
            <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span className="font-medium">{connection.accountName || 'Meta Ad Account'}</span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {connection.accountId
                    ? `ID: ${connection.accountId} • ${connection.currency || 'USD'} • ${connection.timezone || 'UTC'}`
                    : 'Select an account in settings'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {connection.lastSyncedAt && (
                  <span>Last synced: {new Date(connection.lastSyncedAt).toLocaleString()}</span>
                )}
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/${companyId}/settings?tab=integrations`}>
                    Switch account
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">Performance date preset</span>
                <span className="text-muted-foreground">
                  (applies to aggregate metrics on all campaigns)
                </span>
              </div>
              <Select
                value={overview?.performanceDatePreset || 'last_30d'}
                onValueChange={(val) => void sync(val as PerformanceDatePreset)}
                disabled={syncing}
              >
                <SelectTrigger className="w-[190px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {performanceDatePresets.map((preset) => (
                    <SelectItem key={preset.value} value={preset.value}>
                      {preset.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
          {lastSync && (
            <Card className="border-emerald-200 bg-emerald-50/50">
              <CardContent className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium">Last sync result</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {lastSync.campaigns === 0 && lastSync.adSets === 0 && lastSync.ads === 0
                      ? 'Meta returned no API-visible objects. Ads Manager drafts are not synced.'
                      : `Hierarchy: ${lastSync.campaigns} campaigns, ${lastSync.adSets} ad sets, and ${lastSync.ads} ads. Performance: ${performanceDatePresetLabel(lastSync.performanceDatePreset)} (${lastSync.performanceStart}–${lastSync.performanceEnd}).`}
                  </p>
                </div>
                <p className="text-sm text-muted-foreground">
                  {new Date(lastSync.syncedAt).toLocaleString()}
                </p>
              </CardContent>
            </Card>
          )}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Metric
              icon={DollarSign}
              label="Spend"
              value={money(totals.spend, connection.currency)}
            />
            <Metric icon={Eye} label="Impressions" value={totals.impressions.toLocaleString()} />
            <Metric icon={MousePointer} label="Clicks" value={totals.clicks.toLocaleString()} />
            <Metric icon={TrendingUp} label="CTR" value={`${ctr.toFixed(2)}%`} />
            <Metric
              icon={DollarSign}
              label="Cost per tracked conversion"
              value={
                totals.costPerConversion !== null && totals.costPerConversion !== undefined
                  ? money(totals.costPerConversion, connection.currency)
                  : '—'
              }
            />
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Facebook campaigns</CardTitle>
              <CardDescription>
                Current hierarchy returned by Meta. AI recommendations are based on explicit
                evidence.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {overview?.campaigns.length ? (
                <>
                  <CampaignTable
                    campaigns={overview.campaigns}
                    companyId={companyId}
                    currency={connection.currency}
                  />
                  <Pagination pagination={overview.pagination} onChange={setPage} />
                </>
              ) : (
                <div className="rounded-lg border border-dashed p-8 text-center">
                  <p className="font-medium">Sync completed — Meta returned no campaigns</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    The connection and read request completed. Ads Manager drafts are not available
                    through the Meta API; choose another Ad Account only if this is unexpected.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
          {!!overview?.developmentFixtures.length && (
            <Card className="border-amber-200 bg-amber-50/50">
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <CardTitle>Development scenarios</CardTitle>
                    <CardDescription>
                      Local test data only. It is excluded from the connected Ad Account metrics and
                      Meta hierarchy above.
                    </CardDescription>
                  </div>
                  <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">
                    Not Meta data
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <CampaignTable
                  campaigns={overview.developmentFixtures}
                  companyId={companyId}
                  currency={connection.currency}
                />
              </CardContent>
            </Card>
          )}

          <CompanyRecommendationsList companyId={companyId} currency={connection.currency} />
        </>
      )}
    </div>
  );
}

function ConnectionState({
  title,
  description,
  action,
  href,
  onClick,
  error = false,
}: {
  title: string;
  description: string;
  action: string;
  href: string;
  onClick?: () => void;
  error?: boolean;
}) {
  return (
    <Card className={error ? 'border-amber-200' : ''}>
      <CardContent className="flex flex-col items-start gap-4 p-8 sm:flex-row sm:items-center">
        <div
          className={`rounded-full p-3 ${error ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}
        >
          {error ? <AlertCircle className="h-6 w-6" /> : <Settings2 className="h-6 w-6" />}
        </div>
        <div className="flex-1">
          <h2 className="font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        {onClick ? (
          <Button onClick={onClick}>{action}</Button>
        ) : (
          <Button asChild>
            <Link href={href}>{action}</Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function AnalysisBadge({ status }: { status?: string }) {
  if (status === 'needs_review') {
    return (
      <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-900">
        Needs review
      </Badge>
    );
  }
  if (status === 'insufficient_data') {
    return (
      <Badge variant="outline" className="border-amber-100 bg-amber-50/60 text-amber-800">
        Insufficient data
      </Badge>
    );
  }
  if (status === 'no_issues_detected') {
    return (
      <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-800">
        No issues detected
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">
      Not analyzed yet
    </Badge>
  );
}

function CampaignTable({
  campaigns,
  companyId,
  currency,
}: {
  campaigns: (Campaign & { analysisStatus?: string; costPerConversion?: number | null })[];
  companyId: string;
  currency?: string | null;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[980px] text-sm">
        <thead className="border-b text-left text-muted-foreground">
          <tr>
            <th className="pb-3 font-medium">Campaign</th>
            <th className="pb-3 font-medium">Status</th>
            <th className="pb-3 font-medium">AI Analysis</th>
            <th className="pb-3 font-medium">Spend</th>
            <th className="pb-3 font-medium">Cost / Conv.</th>
            <th className="pb-3 font-medium">Impressions</th>
            <th className="pb-3 font-medium">Reach</th>
            <th className="pb-3 font-medium">Frequency</th>
            <th className="pb-3 font-medium">CTR</th>
            <th className="pb-3 font-medium">CPM</th>
          </tr>
        </thead>
        <tbody>
          {campaigns.map((campaign) => {
            const hasDelivery = campaign.impressions > 0 || Number(campaign.spentAmount || 0) > 0;
            return (
              <tr key={campaign.id} className="border-b last:border-0">
                <td className="py-3">
                  <Link
                    href={`/${companyId}/campaigns/facebook-ads/${campaign.id}`}
                    className="font-medium hover:underline"
                  >
                    {campaign.name}
                  </Link>
                  <p className="text-xs capitalize text-muted-foreground">
                    {campaign.objective.replaceAll('_', ' ')}
                  </p>
                  {!hasDelivery && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      No delivery in selected range
                    </p>
                  )}
                </td>
                <td className="py-3">
                  <div className="flex flex-wrap gap-1">
                    <MetaAdsStatusBadge status={campaign.status} />
                    {campaign.effectiveStatus &&
                      campaign.effectiveStatus !== campaign.status.toUpperCase() && (
                        <MetaAdsStatusBadge
                          status={campaign.effectiveStatus.toLowerCase()}
                          label="Delivery"
                        />
                      )}
                  </div>
                </td>
                <td className="py-3">
                  <AnalysisBadge status={campaign.analysisStatus} />
                </td>
                <td className="py-3">{money(Number(campaign.spentAmount || 0), currency)}</td>
                <td className="py-3 font-medium">
                  {campaign.costPerConversion !== null && campaign.costPerConversion !== undefined
                    ? money(campaign.costPerConversion, currency)
                    : '—'}
                </td>
                <td className="py-3">{campaign.impressions.toLocaleString()}</td>
                <td className="py-3">{campaign.reach.toLocaleString()}</td>
                <td className="py-3">{Number(campaign.frequency || 0).toFixed(2)}</td>
                <td className="py-3">{Number(campaign.ctr || 0).toFixed(2)}%</td>
                <td className="py-3">{money(Number(campaign.cpm || 0), currency)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CompanyRecommendationsList({
  companyId,
  currency,
}: {
  companyId: string;
  currency?: string | null;
}) {
  const token = useAuthStore((state) => state.token);
  const [filter, setFilter] = useState<'all' | 'recommended' | 'saved' | 'handled_manually' | 'rejected'>('all');
  const [data, setData] = useState<RecommendationsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);

  const loadRecommendations = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const statusQuery = filter !== 'all' ? `&status=${filter}` : '';
      const result = await api.get<{ success: boolean; data: RecommendationsResponse }>(
        `/ads/company/${companyId}/facebook/recommendations?page=${page}${statusQuery}`,
        { token }
      );
      setData(result.data);
    } catch (err) {
      toast.error((err as Error).message || 'Could not load company recommendations');
    } finally {
      setLoading(false);
    }
  }, [companyId, filter, page, token]);

  useEffect(() => {
    void loadRecommendations();
  }, [loadRecommendations]);

  const updateStatus = async (id: string, status: 'saved' | 'handled_manually' | 'rejected') => {
    if (!token) return;
    try {
      await api.patch(
        `/ads/company/${companyId}/facebook/recommendations/${id}`,
        { status },
        { token }
      );
      toast.success('Recommendation status updated');
      void loadRecommendations();
    } catch (err) {
      toast.error((err as Error).message || 'Could not update recommendation');
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Company AI recommendations</CardTitle>
            <CardDescription>
              All evidence-backed recommendations across your company campaigns.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-1">
            {(['all', 'recommended', 'saved', 'handled_manually', 'rejected'] as const).map((st) => (
              <Button
                key={st}
                size="sm"
                variant={filter === st ? 'default' : 'outline'}
                onClick={() => {
                  setFilter(st);
                  setPage(1);
                }}
                className="capitalize text-xs"
              >
                {st.replaceAll('_', ' ')}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !data?.items.length ? (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            No recommendations found for this filter. Run explicit 7d analysis on your campaigns to generate evidence.
          </div>
        ) : (
          <div className="space-y-4">
            {data.items.map((rec) => (
              <div
                key={rec.id}
                className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="outline"
                      className={
                        rec.priority === 'high'
                          ? 'border-red-200 bg-red-50 text-red-800'
                          : rec.priority === 'medium'
                          ? 'border-amber-200 bg-amber-50 text-amber-800'
                          : 'border-blue-200 bg-blue-50 text-blue-800'
                      }
                    >
                      {rec.priority} priority
                    </Badge>
                    <Badge variant="outline" className="capitalize">
                      {rec.status.replaceAll('_', ' ')}
                    </Badge>
                    <Link
                      href={`/${companyId}/campaigns/facebook-ads/${rec.campaignId}`}
                      className="font-medium text-sm hover:underline text-indigo-600 truncate"
                    >
                      {rec.campaignName}
                    </Link>
                  </div>
                  <p className="font-semibold text-sm">{rec.problem}</p>
                  {rec.possibleCause && (
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">Possible cause:</span> {rec.possibleCause}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {new Date(rec.createdAt).toLocaleString()}
                  </p>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {rec.status !== 'saved' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void updateStatus(rec.id, 'saved')}
                      className="text-xs"
                    >
                      Save
                    </Button>
                  )}
                  {rec.status !== 'handled_manually' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void updateStatus(rec.id, 'handled_manually')}
                      className="text-xs"
                    >
                      Mark Handled
                    </Button>
                  )}
                  {rec.status !== 'rejected' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void updateStatus(rec.id, 'rejected')}
                      className="text-xs text-muted-foreground hover:text-red-600"
                    >
                      Reject
                    </Button>
                  )}
                </div>
              </div>
            ))}

            {data.pagination.totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
                <span>
                  Page {data.pagination.page} of {data.pagination.totalPages} ({data.pagination.total} recommendations)
                </span>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={data.pagination.page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={data.pagination.page >= data.pagination.totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Pagination({
  pagination,
  onChange,
}: {
  pagination: Overview['pagination'];
  onChange: (page: number) => void;
}) {
  const start = (pagination.page - 1) * pagination.pageSize + 1;
  const end = Math.min(pagination.page * pagination.pageSize, pagination.total);
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
      <span>
        Showing {start}–{end} of {pagination.total} campaigns
      </span>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={pagination.page <= 1}
          onClick={() => onChange(pagination.page - 1)}
        >
          Previous
        </Button>
        <span>
          Page {pagination.page} of {pagination.totalPages}
        </span>
        <Button
          size="sm"
          variant="outline"
          disabled={pagination.page >= pagination.totalPages}
          onClick={() => onChange(pagination.page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof DollarSign;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="rounded-lg bg-muted p-2">
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-lg font-semibold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

