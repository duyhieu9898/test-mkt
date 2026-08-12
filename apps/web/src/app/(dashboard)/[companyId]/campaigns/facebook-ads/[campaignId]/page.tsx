'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  BarChart2,
  DollarSign,
  ExternalLink,
  Eye,
  Image as ImageIcon,
  Loader2,
  MousePointer,
  Percent,
  Repeat,
  Sparkles,
  TrendingUp,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MetaAdsStatusBadge } from '@/components/campaigns/meta-ads-status-badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '@/lib/api/client';
import { useAuthStore } from '@/stores/auth-store';

type Ad = {
  id: string;
  adSetId: string;
  name: string;
  status: string;
  effectiveStatus?: string | null;
  type: string;
  headline: string | null;
  primaryText: string | null;
  description: string | null;
  destinationUrl: string | null;
  thumbnailUrl: string | null;
  impressions: number;
  clicks: number;
  reach: number;
  frequency: string | null;
  conversions: number;
  spentAmount: string | null;
  ctr: string | null;
  cpc: string | null;
  cpm: string | null;
};
type AdSet = {
  id: string;
  name: string;
  status: string;
  effectiveStatus?: string | null;
  dailyBudget: string | null;
  impressions: number;
  clicks: number;
  reach: number;
  frequency: string | null;
  conversions: number;
  spentAmount: string | null;
  ctr: string | null;
  cpc: string | null;
  cpm: string | null;
};
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
};
type Detail = {
  campaign: Campaign;
  adSets: AdSet[];
  ads: Ad[];
  currency: string;
  hierarchyLastSyncedAt: string | null;
  isDevelopmentFixture: boolean;
  latestAnalysis?: {
    analysisId: string;
    status: string;
    findings: Finding[];
    baselineSnapshot: Record<string, unknown>;
    currentSnapshot: Record<string, unknown>;
    analyzedAt: string;
    latestRecommendation?: {
      id: string;
      status: 'recommended' | 'saved' | 'rejected' | 'handled_manually';
      possibleCause?: string;
      suggestedAction?: Brief;
      createdAt?: string;
    } | null;
  } | null;
};
type Finding = {
  kind: string;
  severity: string;
  fact: string;
  evidence: {
    id: string;
    metric: string;
    baseline: number;
    current: number;
    percentChange: number | null;
    source: 'meta_insights' | 'development_fixture';
    baselineWindow: { start: string; end: string; timezone: string };
    currentWindow: { start: string; end: string; timezone: string };
    sufficientData: boolean;
  };
  relatedEvidence?: Array<{
    metric: string;
    baseline: number;
    current: number;
    percentChange: number | null;
  }>;
};
type Brief = {
  possibleCause: string;
  recommendedAction: string;
  creativeBrief: {
    angle: string;
    hook: string;
    copyDirection: string;
    visualOrVideoDirection: string;
    cta: string;
  } | null;
};
type Recommendation = {
  id: string;
  status: 'recommended' | 'saved' | 'rejected' | 'handled_manually';
  problem?: string;
  priority?: string;
  createdAt?: string;
};
type Analysis = {
  analysisId?: string;
  findings: Finding[];
  isDevelopmentFixture?: boolean;
  isInsufficientData?: boolean;
  brief?: Brief | null;
  recommendation?: Recommendation | null;
};

export default function FacebookAdsCampaignDetailPage() {
  const params = useParams();
  const companyId = params.companyId as string;
  const campaignId = params.campaignId as string;
  const token = useAuthStore((state) => state.token);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [updatingDisposition, setUpdatingDisposition] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoadError(null);
    try {
      const [detailResult, recommendationsResult] = await Promise.all([
        api.get<{ data: Detail }>(`/ads/company/${companyId}/facebook/campaigns/${campaignId}`, {
          token,
        }),
        api
          .get<{
            data: Recommendation[];
          }>(`/ads/company/${companyId}/facebook/campaigns/${campaignId}/recommendations`, { token })
          .catch(() => {
            toast.error('Could not load recommendation history.');
            return null;
          }),
      ]);
      setDetail(detailResult.data);
      if (detailResult.data.latestAnalysis) {
        const la = detailResult.data.latestAnalysis;
        const rec = la.latestRecommendation;
        setAnalysis((current) =>
          current
            ? current
            : {
                analysisId: la.analysisId,
                findings: la.findings || [],
                isInsufficientData: la.status === 'insufficient_data',
                isDevelopmentFixture: detailResult.data.isDevelopmentFixture,
                brief: rec?.suggestedAction || null,
                recommendation: rec
                  ? {
                      id: rec.id,
                      status: rec.status,
                      possibleCause: rec.possibleCause,
                      createdAt: rec.createdAt,
                    }
                  : null,
              }
        );
      }
      if (recommendationsResult) setRecommendations(recommendationsResult.data);
    } catch (error) {
      const msg = (error as Error).message || 'Could not load this campaign.';
      setLoadError(msg);
      toast.error(msg);
    }
  }, [campaignId, companyId, token]);
  useEffect(() => {
    void load();
  }, [load]);
  const adsBySet = useMemo(
    () =>
      new Map(
        detail?.adSets.map((set) => [set.id, detail.ads.filter((ad) => ad.adSetId === set.id)]) ||
          []
      ),
    [detail]
  );
  const windows = useMemo(() => comparisonWindows(), []);
  const analyze = async (withBrief = false) => {
    if (!token) return;
    setAnalyzing(true);
    try {
      const endpoint = `/ads/company/${companyId}/facebook/campaigns/${campaignId}/${withBrief ? 'recommendation-brief' : 'analyze'}`;
      const payload = withBrief && analysis?.analysisId
        ? { analysisId: analysis.analysisId }
        : windows;
      const result = await api.post<{ data: Analysis }>(endpoint, payload, { token });
      setAnalysis((current) => (current ? { ...current, ...result.data } : result.data));
      if (result.data.recommendation)
        setRecommendations((current) => [
          result.data.recommendation!,
          ...current.filter((item) => item.id !== result.data.recommendation!.id),
        ]);
    } catch (error) {
      const requestError = error as Error & { status?: number };
      toast.error(
        requestError.status === 422
          ? 'A safe recommendation could not be generated. Try again in a moment.'
          : requestError.message || 'Could not analyze this campaign.'
      );
    } finally {
      setAnalyzing(false);
    }
  };
  const setDisposition = async (status: Recommendation['status']) => {
    if (!token || !analysis?.recommendation || status === 'recommended') return;
    setUpdatingDisposition(true);
    try {
      const result = await api.patch<{ data: Recommendation }>(
        `/ads/company/${companyId}/facebook/recommendations/${analysis.recommendation.id}`,
        { status },
        { token }
      );
      setAnalysis((current) => (current ? { ...current, recommendation: result.data } : current));
      setRecommendations((current) =>
        current.map((item) => (item.id === result.data.id ? { ...item, ...result.data } : item))
      );
      toast.success(
        status === 'handled_manually' ? 'Marked as handled manually.' : `Recommendation ${status}.`
      );
    } catch (error) {
      toast.error((error as Error).message || 'Could not update this recommendation.');
    } finally {
      setUpdatingDisposition(false);
    }
  };
  if (loadError)
    return (
      <div className="mx-auto max-w-5xl space-y-4 py-8 text-center">
        <AlertCircle className="mx-auto h-8 w-8 text-red-500" />
        <h2 className="text-lg font-bold">Could not load campaign</h2>
        <p className="text-sm text-muted-foreground">{loadError}</p>
        <Button onClick={() => void load()}>Try again</Button>
      </div>
    );
  if (!detail)
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
      </div>
    );
  const { campaign } = detail;
  const hierarchyAgeHours = detail.hierarchyLastSyncedAt
    ? (Date.now() - new Date(detail.hierarchyLastSyncedAt).getTime()) / (60 * 60 * 1000)
    : null;
  const hierarchyIsStale = hierarchyAgeHours !== null && hierarchyAgeHours >= 24;
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link
        href={`/${companyId}/campaigns?view=facebook-ads`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Campaigns
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <h1 className="break-words text-2xl font-bold">{campaign.name}</h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <StatusBadges
              status={campaign.status}
              effectiveStatus={campaign.effectiveStatus}
              label="Campaign"
            />
            {detail.isDevelopmentFixture && (
              <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">
                Development fixture
              </Badge>
            )}
            <span>·</span>
            <span className="capitalize">{campaign.objective.replaceAll('_', ' ')} campaign</span>
            <span>·</span>
            <span>Read-only data</span>
          </div>
        </div>

        <div className="shrink-0 pt-0.5">
          <Button
            size="sm"
            disabled={analyzing}
            onClick={() => void analyze()}
            className="gap-2 whitespace-nowrap bg-indigo-600 text-white hover:bg-indigo-700"
          >
            {analyzing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 text-amber-300" />
            )}
            Analyze 7d vs prior 7d
          </Button>
        </div>
      </div>

      {campaign.status === 'paused' && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div>
            <p className="font-semibold">Delivery is currently off</p>
            <p className="mt-0.5 text-xs leading-relaxed text-amber-800/90">
              This campaign is paused in Meta Ads Manager. Ad Sets and Ads below can still display
              their own active configured status.
            </p>
          </div>
        </div>
      )}

      {!detail.isDevelopmentFixture && hierarchyIsStale && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div>
            <p className="font-semibold">Hierarchy context may be out of date</p>
            <p className="mt-0.5 text-xs leading-relaxed text-amber-800/90">
              Ad Sets, Ads, and creative context were last synced {formatSyncAge(hierarchyAgeHours)} ago.
              Analysis still fetches its 7-day performance evidence live from Meta Insights.{' '}
              <Link href={`/${companyId}/campaigns?view=facebook-ads`} className="font-medium underline underline-offset-2">
                Sync from Overview
              </Link>{' '}
              before analyzing to refresh this context.
            </p>
          </div>
        </div>
      )}

      <CampaignTabs
        companyId={companyId}
        campaignId={campaignId}
        detail={detail}
        analysis={analysis}
        analyzing={analyzing}
        updatingDisposition={updatingDisposition}
        recommendations={recommendations}
        adsBySet={adsBySet}
        onAnalyze={analyze}
        onSetDisposition={setDisposition}
      />
    </div>
  );
}

function CampaignTabs({
  companyId,
  campaignId,
  detail,
  analysis,
  analyzing,
  updatingDisposition,
  recommendations,
  adsBySet,
  onAnalyze,
  onSetDisposition,
}: {
  companyId: string;
  campaignId: string;
  detail: Detail;
  analysis: Analysis | null;
  analyzing: boolean;
  updatingDisposition: boolean;
  recommendations: Recommendation[];
  adsBySet: Map<string, Ad[]>;
  onAnalyze: (withBrief?: boolean) => void;
  onSetDisposition: (status: Recommendation['status']) => void;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get('tab') || '';
  const activeTab = ['overview', 'ad-sets', 'ads'].includes(requestedTab) ? requestedTab : 'overview';

  const handleTabChange = (tab: string) => {
    const newParams = new URLSearchParams(searchParams.toString());
    newParams.set('tab', tab);
    router.replace(`/${companyId}/campaigns/facebook-ads/${campaignId}?${newParams.toString()}`);
  };

  const { campaign } = detail;

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
      <TabsList className="grid w-full grid-cols-3 max-w-md">
        <TabsTrigger value="overview">Overview & AI</TabsTrigger>
        <TabsTrigger value="ad-sets">Ad Sets ({detail.adSets.length})</TabsTrigger>
        <TabsTrigger value="ads">Ads ({detail.ads.length})</TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="space-y-6">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
          <Metric
            icon={DollarSign}
            label="Spend"
            value={formatMoney(campaign.spentAmount, detail.currency)}
          />
          <Metric icon={Eye} label="Impressions" value={campaign.impressions.toLocaleString()} />
          <Metric icon={Users} label="Reach" value={campaign.reach.toLocaleString()} />
          <Metric icon={Repeat} label="Frequency" value={Number(campaign.frequency || 0).toFixed(2)} />
          <Metric icon={TrendingUp} label="Conversions" value={campaign.conversions.toLocaleString()} />
          <Metric
            icon={DollarSign}
            label="Cost per tracked conversion"
            value={formatMoney(
              campaign.conversions ? (Number(campaign.spentAmount || 0) / campaign.conversions).toString() : null,
              detail.currency
            )}
          />
          <Metric icon={MousePointer} label="Clicks" value={campaign.clicks.toLocaleString()} />
          <Metric icon={Percent} label="CTR" value={`${Number(campaign.ctr || 0).toFixed(2)}%`} />
          <Metric icon={BarChart2} label="CPC" value={formatMoney(campaign.cpc, detail.currency)} />
          <Metric icon={TrendingUp} label="CPM" value={formatMoney(campaign.cpm, detail.currency)} />
        </div>

        {analysis ? (
          <AnalysisCard
            analysis={analysis}
            currency={detail.currency}
            analyzing={analyzing}
            updatingDisposition={updatingDisposition}
            onGenerateBrief={() => onAnalyze(true)}
            onSetDisposition={onSetDisposition}
          />
        ) : (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center p-8 text-center">
              <Sparkles className="h-8 w-8 text-indigo-500 mb-2" />
              <p className="font-semibold text-base">Explicit 7d AI Performance Analysis</p>
              <p className="text-sm text-muted-foreground max-w-md mt-1">
                Click the "Analyze 7d vs prior 7d" button at the top to generate evidence-backed findings and recommendations.
              </p>
            </CardContent>
          </Card>
        )}

        {recommendations.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Recommendation history</CardTitle>
              <CardDescription>
                {detail.isDevelopmentFixture
                  ? 'Local test recommendations only; they are not Meta data or outcomes.'
                  : 'These record your decision only; they never prove a Meta change or outcome.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {recommendations.map((recommendation) => (
                <div
                  key={recommendation.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"
                >
                  <div>
                    <p className="font-medium">
                      {recommendation.problem || 'Evidence-backed recommendation'}
                    </p>
                    {recommendation.createdAt && (
                      <p className="text-xs text-muted-foreground">
                        {new Date(recommendation.createdAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                  <MetaAdsStatusBadge status={recommendation.status} />
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </TabsContent>

      <TabsContent value="ad-sets" className="space-y-4">
        {detail.adSets.length ? (
          detail.adSets.map((adSet) => {
            const adSetCostPerConv = adSet.conversions > 0 ? Number(adSet.spentAmount || 0) / adSet.conversions : null;
            return (
              <Card key={adSet.id}>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-base">{adSet.name}</CardTitle>
                      <CardDescription>
                        {adSet.dailyBudget
                          ? `${formatMoney(adSet.dailyBudget, detail.currency)} daily budget`
                          : 'Campaign budget'}{' '}
                        · {adSet.impressions.toLocaleString()} impressions ·{' '}
                        {formatMoney(adSet.spentAmount, detail.currency)} spent ·{' '}
                        Cost per tracked conversion: {adSetCostPerConv !== null ? formatMoney(adSetCostPerConv.toString(), detail.currency) : '—'}
                      </CardDescription>
                    </div>
                    <StatusBadges
                      status={adSet.status}
                      effectiveStatus={adSet.effectiveStatus}
                      label="Ad set"
                    />
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {(adsBySet.get(adSet.id) || []).length ? (
                    (adsBySet.get(adSet.id) || []).map((ad) => (
                      <AdCard
                        key={ad.id}
                        ad={ad}
                        currency={detail.currency}
                        companyId={companyId}
                        campaignId={campaignId}
                      />
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {detail.isDevelopmentFixture
                        ? 'This local scenario intentionally has no synced creative.'
                        : 'No ads found in this Ad Set.'}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })
        ) : (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              No Ad Sets were synced for this campaign.
            </CardContent>
          </Card>
        )}
      </TabsContent>

      <TabsContent value="ads" className="space-y-4">
        {detail.ads.length ? (
          <div className="grid grid-cols-1 gap-4">
            {detail.ads.map((ad) => (
              <AdCard
                key={ad.id}
                ad={ad}
                currency={detail.currency}
                companyId={companyId}
                campaignId={campaignId}
              />
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              No Ads were synced for this campaign.
            </CardContent>
          </Card>
        )}
      </TabsContent>
    </Tabs>
  );
}

function AnalysisCard({
  analysis,
  currency,
  analyzing,
  updatingDisposition,
  onGenerateBrief,
  onSetDisposition,
}: {
  analysis: Analysis;
  currency: string;
  analyzing: boolean;
  updatingDisposition: boolean;
  onGenerateBrief: () => void;
  onSetDisposition: (status: Recommendation['status']) => void;
}) {
  const status = analysis.recommendation?.status;
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Evidence-based analysis</CardTitle>
            <CardDescription>
              Comparison for the latest 7 days versus the preceding 7 days. Possible causes are
              hypotheses, not facts.
            </CardDescription>
          </div>
          {analysis.findings.length > 0 && !analysis.brief && (
            <Button size="sm" variant="outline" disabled={analyzing} onClick={onGenerateBrief}>
              {analyzing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              Generate recommendation brief
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {analysis.isDevelopmentFixture && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <span className="font-medium">Development fixture — not Meta data.</span> The numbers
            below are local test data; no Meta Graph request was made.
          </div>
        )}
        {!analysis.isDevelopmentFixture && (
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
            Budget-change evidence is not available for live Meta analyses yet. Meta Insights reports
            performance for each window, but not the historical budget configuration needed to verify a
            budget change.
          </div>
        )}
        {analysis.isInsufficientData ? (
          <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-950">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-amber-900">
                Insufficient data for an AI recommendation
              </p>
              <p className="mt-1 text-xs leading-relaxed text-amber-800/90">
                Both comparison windows (latest 7 days vs prior 7 days) require at least{' '}
                <strong>1,000 impressions</strong> before AI can accurately diagnose performance
                trends.
              </p>
              <div className="mt-2.5 inline-flex items-center gap-2 rounded bg-amber-100/80 px-2.5 py-1 text-xs font-medium text-amber-900">
                <BarChart2 className="h-3.5 w-3.5 text-amber-700" />
                <span>Requirement: 1,000+ impressions per 7-day window</span>
              </div>
            </div>
          </div>
        ) : analysis.findings.length ? (
          analysis.findings.map((finding) => (
            <div key={finding.evidence.id} className="rounded-md border p-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium">{finding.fact}</p>
                <Badge
                  variant="outline"
                  className={
                    finding.severity === 'high' ? 'border-amber-300 bg-amber-50 text-amber-800' : ''
                  }
                >
                  {finding.severity}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {finding.evidence.metric.replaceAll('_', ' ')}:{' '}
                {formatEvidenceNumber(finding.evidence.metric, finding.evidence.baseline, currency)}{' '}
                →{' '}
                {formatEvidenceNumber(finding.evidence.metric, finding.evidence.current, currency)}{' '}
                ({formatDelta(finding.evidence.percentChange)}) ·{' '}
                {finding.evidence.baselineWindow.start}–{finding.evidence.baselineWindow.end} vs{' '}
                {finding.evidence.currentWindow.start}–{finding.evidence.currentWindow.end} ·{' '}
                {finding.evidence.source === 'development_fixture'
                  ? 'Development fixture — not Meta data'
                  : 'Meta Insights'}{' '}
                · {finding.evidence.sufficientData ? 'sufficient data' : 'limited data'}
              </p>
              {finding.relatedEvidence?.map((related) => (
                <p key={related.metric} className="mt-1 text-xs text-muted-foreground">
                  Related impact · {related.metric.replaceAll('_', ' ')}:{' '}
                  {formatEvidenceNumber(related.metric, related.baseline, currency)} →{' '}
                  {formatEvidenceNumber(related.metric, related.current, currency)} (
                  {formatDelta(related.percentChange)})
                </p>
              ))}
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">
            No supported negative trend was detected in these windows. This is not a guarantee that
            performance is healthy.
          </p>
        )}

        {analysis.brief && (
          <div className="rounded-md border border-primary/20 bg-primary/5 p-4 text-sm">
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium">Recommendation brief</p>
              {status && <MetaAdsStatusBadge status={status} />}
            </div>
            <p className="mt-2">
              <span className="font-medium">Possible cause (hypothesis): </span>
              {analysis.brief.possibleCause}
            </p>
            <p className="mt-1">
              <span className="font-medium">Suggested next step: </span>
              {analysis.brief.recommendedAction}
            </p>
            {analysis.brief.creativeBrief && (
              <div className="mt-3 space-y-1 text-muted-foreground">
                <p>
                  <span className="font-medium text-foreground">Angle: </span>
                  {analysis.brief.creativeBrief.angle}
                </p>
                <p>
                  <span className="font-medium text-foreground">Hook: </span>
                  {analysis.brief.creativeBrief.hook}
                </p>
                <p>
                  <span className="font-medium text-foreground">Copy direction: </span>
                  {analysis.brief.creativeBrief.copyDirection}
                </p>
                <p>
                  <span className="font-medium text-foreground">Visual/video direction: </span>
                  {analysis.brief.creativeBrief.visualOrVideoDirection}
                </p>
                <p>
                  <span className="font-medium text-foreground">CTA: </span>
                  {analysis.brief.creativeBrief.cta}
                </p>
              </div>
            )}
            {status === 'recommended' && (
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={updatingDisposition}
                  onClick={() => onSetDisposition('saved')}
                >
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={updatingDisposition}
                  onClick={() => onSetDisposition('handled_manually')}
                >
                  Mark handled manually
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={updatingDisposition}
                  onClick={() => onSetDisposition('rejected')}
                >
                  Reject
                </Button>
              </div>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              This is a brief only. It does not edit, upload, or apply any Meta asset.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AdCard({
  ad,
  currency,
  companyId,
  campaignId,
}: {
  ad: Ad;
  currency: string;
  companyId: string;
  campaignId: string;
}) {
  return (
    <div className="flex gap-3 rounded-lg border p-3">
      <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded bg-muted">
        {ad.thumbnailUrl ? (
          <img src={ad.thumbnailUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <ImageIcon className="h-5 w-5 text-muted-foreground" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <Link
            href={`/${companyId}/campaigns/facebook-ads/${campaignId}/ads/${ad.id}`}
            className="font-medium hover:underline"
          >
            {ad.name}
          </Link>
          <StatusBadges status={ad.status} effectiveStatus={ad.effectiveStatus} label="Ad" />
        </div>
        {ad.headline && <p className="mt-1 text-sm">{ad.headline}</p>}
        {ad.primaryText && (
          <p className="line-clamp-2 text-xs text-muted-foreground">{ad.primaryText}</p>
        )}
        <div className="mt-2 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
          <span>{formatMoney(ad.spentAmount, currency)} spent</span>
          <span>
            Cost per tracked conversion:{' '}
            {ad.conversions > 0
              ? formatMoney((Number(ad.spentAmount || 0) / ad.conversions).toString(), currency)
              : '—'}
          </span>
          <span>{ad.impressions.toLocaleString()} impressions</span>
          <span>{ad.reach.toLocaleString()} reach</span>
          <span>{Number(ad.frequency || 0).toFixed(2)} frequency</span>
          <span>{Number(ad.ctr || 0).toFixed(2)}% CTR</span>
          {ad.destinationUrl && (
            <a
              href={ad.destinationUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 hover:text-foreground"
            >
              Landing page <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBadges({
  status,
  effectiveStatus,
  label,
}: {
  status: string;
  effectiveStatus?: string | null;
  label: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <MetaAdsStatusBadge status={status} label={label} />
      {effectiveStatus && effectiveStatus !== status.toUpperCase() && (
        <MetaAdsStatusBadge status={effectiveStatus.toLowerCase()} label="Delivery" />
      )}
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="shrink-0 rounded-lg bg-muted/80 p-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="truncate text-base font-semibold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function formatMoney(value: string | null, currency: string) {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(Number(value));
}
function formatEvidenceNumber(metric: string, value: number, currency: string) {
  return metric === 'spend' || metric === 'daily_budget'
    ? new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency,
        maximumFractionDigits: 2,
      }).format(value)
    : metric === 'ctr'
      ? `${value.toFixed(2)}%`
      : value.toLocaleString();
}
function formatDelta(value: number | null) {
  return value === null ? 'new / no baseline' : `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
}
function formatSyncAge(hours: number) {
  if (hours < 48) return 'about 1 day';
  return `${Math.floor(hours / 24)} days`;
}
function comparisonWindows() {
  const format = (date: Date) => date.toISOString().slice(0, 10);
  const today = new Date();
  const currentEnd = new Date(today);
  currentEnd.setUTCDate(today.getUTCDate() - 1);
  const currentStart = new Date(currentEnd);
  currentStart.setUTCDate(currentEnd.getUTCDate() - 6);
  const baselineEnd = new Date(currentStart);
  baselineEnd.setUTCDate(currentStart.getUTCDate() - 1);
  const baselineStart = new Date(baselineEnd);
  baselineStart.setUTCDate(baselineEnd.getUTCDate() - 6);
  return {
    baseline: { start: format(baselineStart), end: format(baselineEnd) },
    current: { start: format(currentStart), end: format(currentEnd) },
  };
}
