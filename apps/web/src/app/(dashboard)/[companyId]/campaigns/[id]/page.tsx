'use client';

/**
 * Campaign detail — live progress panel (W1B.4) + review screen (W1B.2).
 *
 * While status is `generating`, the WorkflowProgressPanel shows each
 * step in real time via SSE. Once status hits `ready`, the page
 * renders the generated banners + social posts for review.
 */

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Loader2, Rocket, Image as ImageIcon, MessageSquare, CheckCircle2, HelpCircle, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/auth-store';
import { api } from '@/lib/api/client';
import { useQuery } from '@tanstack/react-query';
import { friendlyError } from '@/lib/friendly-errors';
import { WorkflowProgressPanel } from '@/components/workflow-progress-panel';
import { PostPreview, type PostPlatform } from '@/components/social-post-preview';

interface Campaign {
  id: string;
  name: string;
  goal: string;
  platform: string;
  status: string;
  createdAt: string;
  launchError?: string | null;
  targeting?: any;
}

interface Banner {
  id: string;
  name: string;
  size: string;
  status: string;
  copy?: { headline?: string; subheadline?: string; cta?: string; brandColor?: string } | null;
  design?: { backgroundValue?: string; colorTheme?: any } | null;
  strategyTag?: string | null;
}

interface SocialPost {
  id: string;
  platform: string;
  content: string;
  hashtags?: string[] | null;
  status: string;
}

interface DetailResponse {
  campaign: Campaign;
  banners: Banner[];
  socialPosts: SocialPost[];
}

const statusVariant: Record<string, string> = {
  planned: 'bg-slate-100 text-slate-700',
  generating: 'bg-indigo-100 text-indigo-700',
  ready: 'bg-green-100 text-green-700',
  launching: 'bg-amber-100 text-amber-700',
  live: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-red-100 text-red-700',
};

export default function CampaignDetailPage() {
  const params = useParams();
  const router = useRouter();
  const companyId = params.companyId as string;
  const campaignId = params.id as string;
  const token = useAuthStore((s) => s.token);
  const [progressDone, setProgressDone] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['campaign', companyId, campaignId],
    queryFn: () =>
      api.get<DetailResponse>(`/campaigns/${companyId}/${campaignId}`, { token: token! }),
    enabled: !!token,
    // While generating, refetch aggressively so new banners/posts appear
    refetchInterval: (q) => {
      const s = q.state.data?.campaign?.status;
      return s === 'generating' || s === 'planned' ? 2000 : false;
    },
  });

  // When the SSE stream tells us the flow is done, force a refetch
  useEffect(() => {
    if (progressDone) refetch();
  }, [progressDone, refetch]);

  if (isLoading || !data) {
    return (
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="h-8 w-48 bg-slate-100 rounded-lg animate-pulse" />
        <div className="h-24 bg-slate-100 rounded-lg animate-pulse" />
        <div className="h-40 bg-slate-100 rounded-lg animate-pulse" />
      </div>
    );
  }

  const { campaign, banners, socialPosts } = data;
  const isGenerating = campaign.status === 'generating' || campaign.status === 'planned';
  const isLaunching = campaign.status === 'launching';
  const isLive = campaign.status === 'live';
  const isReady = campaign.status === 'ready';
  const isFailed = campaign.status === 'failed';
  const showLivePanel = isGenerating || isLaunching || isFailed;

  const onLaunch = async () => {
    if (!token) return;
    try {
      await api.post(`/campaigns/${companyId}/${campaignId}/launch`, {}, { token });
      toast.success('Launching campaign…');
      refetch();
    } catch (err) {
      toast.error(friendlyError(err, "We couldn't launch your campaign. Please try again."));
    }
  };

  const onWhy = async () => {
    if (!token) return;
    try {
      const res = await api.get<{ url: string }>(
        `/campaigns/${companyId}/${campaignId}/explain`,
        { token },
      );
      window.open(res.url, '_blank', 'noopener');
    } catch (err) {
      toast.error(friendlyError(err, "We couldn't open the reasoning trace."));
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <Link
          href={`/${companyId}/campaigns`}
          className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900 mb-2"
        >
          <ArrowLeft className="w-4 h-4" /> Back to campaigns
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4 flex-wrap">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 truncate">{campaign.name}</h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <Badge className={statusVariant[campaign.status] || 'bg-slate-100'}>
                {campaign.status}
              </Badge>
              <span className="text-xs text-slate-500">
                Goal: {campaign.goal} · Platform: {campaign.platform}
              </span>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onWhy}
            className="gap-1.5"
            title="Open the AI reasoning trace in Langfuse"
          >
            <HelpCircle className="w-4 h-4" /> Why this output?
            <ExternalLink className="w-3 h-3" />
          </Button>
          {isReady && (
            <Button
              onClick={onLaunch}
              className="bg-green-600 hover:bg-green-700 text-white gap-2"
            >
              <Rocket className="w-4 h-4" /> Launch campaign
            </Button>
          )}
          {isLive && (
            <Badge className="bg-emerald-100 text-emerald-700 gap-1 px-3 py-1.5 text-sm">
              <CheckCircle2 className="w-4 h-4" /> Live
            </Badge>
          )}
        </div>
      </div>

      {showLivePanel && token && (
        <WorkflowProgressPanel
          companyId={companyId}
          campaignId={campaignId}
          token={token}
          flow={isLaunching ? 'launch' : 'generate'}
          onTerminal={(outcome) => {
            setProgressDone(true);
            if (outcome === 'ready') refetch();
          }}
        />
      )}

      {isFailed && campaign.launchError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <div className="font-medium mb-1">Generation failed</div>
          <div className="text-red-700">{campaign.launchError}</div>
        </div>
      )}

      {/* Banners */}
      <div>
        <h2 className="text-lg font-semibold text-slate-900 mb-3 flex items-center gap-2">
          <ImageIcon className="w-5 h-5 text-indigo-500" /> Banners ({banners.length})
        </h2>
        {banners.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-slate-500">
              {isGenerating ? 'AI is designing banners…' : 'No banners yet'}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {banners.map((b) => (
              <Card key={b.id} className="overflow-hidden">
                <div
                  className="h-40 flex flex-col items-center justify-center text-white p-4 text-center"
                  style={{
                    background:
                      b.design?.backgroundValue ||
                      `linear-gradient(135deg, ${b.copy?.brandColor || '#6366f1'}, #8b5cf6)`,
                  }}
                >
                  <div className="text-lg font-bold leading-tight drop-shadow">
                    {b.copy?.headline || b.name}
                  </div>
                  {b.copy?.subheadline && (
                    <div className="text-xs mt-1 opacity-90">{b.copy.subheadline}</div>
                  )}
                  {b.copy?.cta && (
                    <div className="mt-2 px-3 py-1 rounded-full bg-white/90 text-xs font-medium text-slate-900">
                      {b.copy.cta}
                    </div>
                  )}
                </div>
                <CardContent className="p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">{b.size}</span>
                    {b.strategyTag && (
                      <Badge variant="secondary" className="text-[10px]">
                        {b.strategyTag}
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Social posts */}
      <div>
        <h2 className="text-lg font-semibold text-slate-900 mb-3 flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-indigo-500" /> Social posts ({socialPosts.length})
        </h2>
        {socialPosts.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-slate-500">
              {isGenerating ? 'AI is writing posts…' : 'No posts yet'}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 justify-items-center md:justify-items-start">
            {socialPosts.map((p) => (
              <PostPreview
                key={p.id}
                platform={p.platform as PostPlatform}
                content={p.content}
                hashtags={p.hashtags}
                brandName={campaign.name.replace(/^AI:\s*/, '').substring(0, 30)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
