'use client';

/**
 * Campaign detail — live progress panel (W1B.4) + review screen (W1B.2).
 *
 * While status is `generating`, the WorkflowProgressPanel shows each
 * step in real time via SSE. Once status hits `ready`, the page
 * renders the generated banners + social posts for review.
 */

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertCircle,
  ArrowLeft,
  BarChart3,
  Brain,
  CheckCircle2,
  Clapperboard,
  ExternalLink,
  Eye,
  FileEdit,
  HelpCircle,
  Image as ImageIcon,
  ListChecks,
  Loader2,
  MessageSquare,
  MousePointerClick,
  Palette,
  Plus,
  RefreshCw,
  Rocket,
  Send,
  Target,
  Trash2,
  TrendingUp,
  UploadCloud,
  Users,
  Wand2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/auth-store';
import { api } from '@/lib/api/client';
import { useCompany } from '@/lib/api/hooks';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { friendlyError } from '@/lib/friendly-errors';
import { campaignDisplayTitle } from '@/lib/campaign-title';
import { cn } from '@/lib/utils';
import { WorkflowProgressPanel } from '@/components/workflow-progress-panel';
import { PostPreview, type PostPlatform } from '@/components/social-post-preview';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';

const ImglyBannerEditor = dynamic(
  () => import('@/components/marketing/imgly-banner-editor')
    .then((module) => module.ImglyBannerEditor),
  { ssr: false },
);

interface CampaignLaunchSummary {
  launchedAt: string;
  results?: {
    blog?: {
      status: string;
      blogPostId?: string;
      title?: string;
      message?: string;
    };
    banners?: {
      status: string;
      requested?: number;
      activated?: number;
    };
    socialPosts?: {
      status: string;
      requested?: number;
      scheduled?: number;
      published?: number;
      failed?: number;
    };
    externalPublishing?: {
      status: string;
      message?: string;
    };
  };
}

type CampaignPlanAssetType = 'blog' | 'banner' | 'social_post' | 'landing_page';

interface CampaignPlanAsset {
  type: CampaignPlanAssetType;
  label: string;
  role: string;
  successSignal?: string;
}

interface CampaignPlan {
  objective: string;
  audience: string;
  customerProblem?: string;
  coreMessage: string;
  offer?: string;
  channels?: string[];
  successMetrics?: string[];
  assets?: CampaignPlanAsset[];
  launchChecklist?: string[];
  generatedAt?: string;
}

interface CreditResponse {
  balance: { totalAvailable: number };
  costs?: {
    campaignVideo?: number;
    supportMessage?: string;
  };
}

interface CampaignLearningSummary {
  status?: string;
  updatedAt?: string;
  observations?: string[];
  nextActions?: string[];
}

interface Campaign {
  id: string;
  name: string;
  goal: string;
  platform: string;
  status: string;
  createdAt: string;
  launchError?: string | null;
  targeting?: {
    audience?: string;
    blogPostId?: string;
    campaignPlan?: CampaignPlan;
    learningSummary?: CampaignLearningSummary;
    launchSummary?: CampaignLaunchSummary;
    source?: {
      requestedGoal?: unknown;
    };
    [key: string]: unknown;
  } | null;
}

interface Banner {
  id: string;
  name: string;
  size: string;
  status: string;
  imageUrl?: string | null;
  copy?: { headline?: string; subheadline?: string; cta?: string; brandColor?: string; reasoning?: string } | null;
  design?: {
    backgroundValue?: string;
    backgroundType?: string;
    backgroundImageProvider?: string;
    backgroundOnly?: boolean;
    visualDirection?: string;
    imglyArchiveUrl?: string;
    imglyScene?: string;
    imglySceneImageUrl?: string;
    colorTheme?: any;
    brandKit?: {
      source?: string;
      companyName?: string;
      logoUrl?: string | null;
      imageMood?: string;
    } | null;
    brandFit?: {
      source?: string;
      logoAvailable?: boolean;
      logoApplied?: boolean;
      colorsApplied?: boolean;
      voiceApplied?: boolean;
      imageMoodApplied?: boolean;
    } | null;
  } | null;
  strategyTag?: string | null;
}

interface VideoProject {
  id: string;
  title: string;
  format: '15s' | '30s' | '60s';
  aspectRatio: '9:16' | '16:9' | '1:1';
  status: 'script' | 'scenes' | 'rendering' | 'ready' | 'failed';
  outputUrl?: string | null;
  thumbnailUrl?: string | null;
  script?: {
    hook?: string;
    body?: string[];
    cta?: string;
    voiceoverText?: string;
    error?: string;
    overlay?: {
      headline?: string;
      subheadline?: string;
      cta?: string;
    };
    brandKit?: {
      companyName?: string;
      logoUrl?: string | null;
      colors?: {
        primary?: string;
        secondary?: string;
        text?: string;
        ctaBg?: string;
        ctaText?: string;
      };
    };
    imglyScene?: string;
    imglySceneVideoUrl?: string;
  } | null;
  scenes?: unknown[] | null;
  createdAt: string;
  updatedAt?: string;
}

const VIDEO_GENERATION_PHASES = [
  {
    progress: 8,
    label: 'Planning your video',
    hint: 'Reading the campaign goal, audience, brand, and generated assets.',
  },
  {
    progress: 24,
    label: 'Writing the creative brief',
    hint: 'Turning the campaign idea into a video prompt for the AI renderer.',
  },
  {
    progress: 42,
    label: 'Starting AI rendering',
    hint: 'Sending the video job to Bedrock. This can take a little while.',
  },
  {
    progress: 62,
    label: 'Rendering video frames',
    hint: 'The AI is creating the visual story. This is usually the longest step.',
  },
  {
    progress: 82,
    label: 'Saving the video',
    hint: 'Storing the generated MP4 and preparing it for preview.',
  },
  {
    progress: 94,
    label: 'Finalizing preview',
    hint: 'Refreshing the campaign with the new video.',
  },
] as const;

function videoGenerationPhase(progress: number) {
  return [...VIDEO_GENERATION_PHASES]
    .reverse()
    .find((phase) => progress >= phase.progress) ?? VIDEO_GENERATION_PHASES[0];
}

interface SocialPost {
  id: string;
  platform: string;
  content: string;
  hashtags?: string[] | null;
  mediaUrls?: string[] | null;
  status: string;
  publishedAt?: string | null;
  metrics?: {
    facebook?: {
      externalId?: string;
      externalUrl?: string;
      error?: string;
      publishedAt?: string;
      failedAt?: string;
      latest?: {
        impressions: number;
        reach: number;
        reactions: number;
        comments: number;
        shares: number;
      };
    };
  } | null;
}

interface CampaignPerformance {
  status: 'not_connected' | 'awaiting_publish' | 'collecting' | 'ready';
  source: 'facebook_organic';
  lastSyncedAt?: string | null;
  goal: string;
  totals: {
    impressions: number;
    reach: number;
    clicks: number;
    clicksMeasured: boolean;
    engagements: number;
    reactions: number;
    comments: number;
    shares: number;
    engagementRate: number;
    sessions: number;
    conversions: number;
    revenue: number;
    spend: number;
    roas: number | null;
  };
  facebook: {
    connected: boolean;
    publishedPosts: number;
    measuredPosts: number;
    posts: Array<{
      id: string;
      content: string;
      status: string;
      publishedAt?: string;
      externalUrl?: string;
      syncError?: string;
      metrics?: {
        impressions: number;
        reach: number;
        clicks: number;
        clicksMeasured: boolean;
        reactions: number;
        comments: number;
        shares: number;
        engagements: number;
        engagementRate: number;
        fetchedAt: string;
      } | null;
    }>;
  };
  recommendation: {
    tone: 'neutral' | 'positive' | 'attention';
    title: string;
    message: string;
  };
}

interface CampaignPerformanceResponse {
  data: CampaignPerformance;
}

interface ApplySocialMediaResponse {
  updated: number;
  posts: Array<{
    id: string;
    platform: string;
    mediaUrls?: string[] | null;
  }>;
}

interface DeleteBannerResponse {
  deleted: boolean;
  bannerId: string;
  posts: Array<{
    id: string;
    mediaUrls?: string[] | null;
  }>;
}

interface UpdateSocialPostResponse extends SocialPost {}

interface CustomBannerResponse {
  banner: Banner;
}

function requiresFacebookReconnect(error: unknown): boolean {
  const codedError = error as { code?: string; message?: string } | null;
  if (codedError?.code === 'FACEBOOK_RECONNECT_REQUIRED') return true;
  const message = codedError?.message ?? '';
  return /reconnect facebook|not a page managed by this token|access token.*expired/i.test(message);
}

type SocialImagePlatform = 'facebook' | 'instagram' | 'linkedin';

const SOCIAL_IMAGE_PRESETS: Record<SocialImagePlatform, {
  label: string;
  size: string;
  shapeClassName: string;
}> = {
  facebook: {
    label: 'Facebook',
    size: '1200x628',
    shapeClassName: 'aspect-[1200/628]',
  },
  instagram: {
    label: 'Instagram',
    size: '1080x1080',
    shapeClassName: 'aspect-square',
  },
  linkedin: {
    label: 'LinkedIn',
    size: '1200x628',
    shapeClassName: 'aspect-[1200/628]',
  },
};

function normalizeSocialImagePlatform(value: string): SocialImagePlatform | null {
  const platform = value.toLowerCase();
  if (platform === 'facebook' || platform === 'fb') return 'facebook';
  if (platform === 'instagram' || platform === 'ig') return 'instagram';
  if (platform === 'linkedin' || platform === 'li') return 'linkedin';
  return null;
}

function formatPublishedAt(value?: string | null): string {
  if (!value) return 'Published';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Published';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function facebookPostUrl(post: SocialPost): string | null {
  const facebook = post.metrics?.facebook;
  if (facebook?.externalUrl) return facebook.externalUrl;
  return facebook?.externalId
    ? `https://www.facebook.com/${facebook.externalId}`
    : null;
}

function isPublishedFacebookPost(post: SocialPost): boolean {
  const platform = post.platform.toLowerCase();
  return isPublishedPost(post) && (platform === 'facebook' || platform === 'fb');
}

function isPublishedPost(post: SocialPost): boolean {
  return post.status === 'published';
}

function apiAssetBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8004/api/v1').replace(/\/api\/v1\/?$/, '');
}

function apiBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8004/api/v1').replace(/\/+$/, '');
}

function campaignAssetProxySrc(url: string): string {
  return `${apiBaseUrl()}/asset-proxy?url=${encodeURIComponent(url)}`;
}

function isRemoteCampaignAssetUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname.endsWith('.amazonaws.com')
      || parsed.hostname.endsWith('.cloudfront.net')
      || /\/[^/]+\/(?:assets|images|campaigns)\//.test(parsed.pathname);
  } catch {
    return false;
  }
}

function campaignImageSrc(url?: string | null): string {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) {
    return isRemoteCampaignAssetUrl(url)
      ? campaignAssetProxySrc(url)
      : url;
  }
  if (url.startsWith('/images/') || url.startsWith('/uploads/')) {
    return `${apiAssetBaseUrl()}${url}`;
  }
  return url;
}

interface BlogPost {
  id: string;
  title: string;
  excerpt?: string | null;
  metaDescription?: string | null;
  keyword?: string | null;
  wordCount?: number | null;
  status?: string | null;
  createdAt: string;
}

interface LaunchSummary {
  id: string;
  keyword: string;
  blogPostId: string | null;
  heroImageUrl: string | null;
  createdAt: string;
}

interface DetailResponse {
  campaign: Campaign;
  banners: Banner[];
  socialPosts: SocialPost[];
  videos?: VideoProject[];
  blogPost?: BlogPost | null;
  launch?: LaunchSummary | null;
}

interface OmnichannelConnectionsResponse {
  data: Array<{
    channel: string;
    status: string;
    config?: {
      pageId?: string;
      pageName?: string;
      hasAccessToken?: boolean;
    };
  }>;
}

interface DistributionConnectionsResponse {
  data: Array<{
    platform: string;
    status: string;
    platformPageId?: string | null;
    platformAccountName?: string | null;
  }>;
}

const statusVariant: Record<string, string> = {
  planned: 'bg-slate-100 text-slate-700',
  generating: 'bg-indigo-100 text-indigo-700',
  ready: 'bg-green-100 text-green-700',
  launching: 'bg-amber-100 text-amber-700',
  live: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-red-100 text-red-700',
};

const DEFAULT_PLAN_ASSETS: CampaignPlanAsset[] = [
  {
    type: 'blog',
    label: 'Blog article',
    role: 'Educate customers, answer objections, and create a reviewable long-form asset.',
    successSignal: 'Blog draft is reviewed or published.',
  },
  {
    type: 'banner',
    label: 'Banner set',
    role: 'Create visual hooks that can be reused as campaign backgrounds and social images.',
    successSignal: 'At least one banner is selected and activated.',
  },
  {
    type: 'social_post',
    label: 'Social posts',
    role: 'Turn the campaign idea into platform-ready messages for the selected audience.',
    successSignal: 'Posts are published or queued for the chosen channels.',
  },
  {
    type: 'landing_page',
    label: 'Landing page',
    role: 'Optional conversion destination when this campaign needs a focused page.',
    successSignal: 'A landing page is created when the offer needs a dedicated destination.',
  },
];

function displayText(value: unknown, fallback: string): string {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || fallback;
}

function platformLabel(platform: string): string {
  const normalized = platform.toLowerCase();
  if (normalized === 'fb' || normalized === 'facebook') return 'Facebook';
  if (normalized === 'ig' || normalized === 'instagram') return 'Instagram';
  if (normalized === 'li' || normalized === 'linkedin') return 'LinkedIn';
  if (normalized === 'meta') return 'Facebook / Instagram';
  return platform;
}

function normalizeHashtagsInput(value: string): string[] {
  const seen = new Set<string>();
  const hashtags: string[] = [];
  value
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((item) => {
      const tag = item.replace(/^#+/, '').trim();
      if (!tag) return;
      const normalized = `#${tag}`;
      const key = normalized.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      hashtags.push(normalized);
    });
  return hashtags.slice(0, 20);
}

// Existing campaigns may not have campaignPlan yet, so the detail page
// derives a stable plan from the generated assets instead of showing gaps.
function buildFallbackCampaignPlan(
  campaign: Campaign,
  banners: Banner[],
  socialPosts: SocialPost[],
  blogPost?: BlogPost | null,
): CampaignPlan {
  const objective = displayText(
    campaign.targeting?.source?.requestedGoal,
    campaignDisplayTitle(campaign).replace(/^AI:\s*/i, ''),
  );
  const audience = displayText(campaign.targeting?.audience, 'your target customers');
  const channels = Array.from(new Set(
    socialPosts.length > 0
      ? socialPosts.map((post) => platformLabel(post.platform))
      : [platformLabel(campaign.platform)],
  ));

  return {
    objective,
    audience,
    coreMessage: objective,
    customerProblem: `Help ${audience} understand why this offer is worth choosing now.`,
    channels,
    successMetrics: [
      `${blogPost ? 1 : 0} blog draft`,
      `${banners.length} banner creative${banners.length === 1 ? '' : 's'}`,
      `${socialPosts.length} social post${socialPosts.length === 1 ? '' : 's'}`,
    ],
    assets: DEFAULT_PLAN_ASSETS,
    launchChecklist: [
      'Review the blog draft for accuracy.',
      'Select the banner images that match the campaign message.',
      'Apply chosen banners to social posts.',
      'Launch selected posts and assets when the content looks ready.',
    ],
  };
}

function assetRole(plan: CampaignPlan, type: CampaignPlanAssetType): string {
  return (plan.assets || DEFAULT_PLAN_ASSETS).find((asset) => asset.type === type)?.role
    || DEFAULT_PLAN_ASSETS.find((asset) => asset.type === type)?.role
    || '';
}

function planAssetStatus(
  type: CampaignPlanAssetType,
  banners: Banner[],
  socialPosts: SocialPost[],
  blogPost?: BlogPost | null,
): { label: string; className: string } {
  if (type === 'blog') {
    return blogPost
      ? { label: 'Ready', className: 'bg-emerald-50 text-emerald-700' }
      : { label: 'Missing', className: 'bg-amber-50 text-amber-700' };
  }
  if (type === 'banner') {
    const readyCount = banners.filter((banner) => Boolean(banner.imageUrl)).length;
    return readyCount > 0
      ? { label: `${readyCount} ready`, className: 'bg-emerald-50 text-emerald-700' }
      : { label: 'Missing', className: 'bg-amber-50 text-amber-700' };
  }
  if (type === 'social_post') {
    return socialPosts.length > 0
      ? { label: `${socialPosts.length} drafted`, className: 'bg-emerald-50 text-emerald-700' }
      : { label: 'Missing', className: 'bg-amber-50 text-amber-700' };
  }
  return { label: 'Optional', className: 'bg-slate-100 text-slate-600' };
}

interface ReadinessItem {
  label: string;
  detail: string;
  state: 'ready' | 'warning' | 'missing';
}

// This powers the non-technical launch checklist. Warnings do not block launch,
// but missing core assets make it clear why a selection may be unavailable.
function buildLaunchReadinessItems(args: {
  campaign: Campaign;
  banners: Banner[];
  socialPosts: SocialPost[];
  blogPost?: BlogPost | null;
  hasFacebookPageConnection: boolean;
}): ReadinessItem[] {
  const readyBanners = args.banners.filter((banner) => Boolean(banner.imageUrl));
  const facebookPosts = args.socialPosts.filter((post) => {
    const platform = post.platform.toLowerCase();
    return platform === 'facebook' || platform === 'fb';
  });

  return [
    {
      label: 'Strategy',
      detail: args.campaign.targeting?.campaignPlan
        ? 'Objective, audience, message, and assets are defined.'
        : 'Campaign plan is inferred from existing assets.',
      state: 'ready',
    },
    {
      label: 'Banners',
      detail: readyBanners.length > 0
        ? `${readyBanners.length} banner image${readyBanners.length === 1 ? '' : 's'} ready.`
        : 'No rendered banner image is ready yet.',
      state: readyBanners.length > 0 ? 'ready' : 'missing',
    },
    {
      label: 'Social posts',
      detail: args.socialPosts.length > 0
        ? `${args.socialPosts.length} post${args.socialPosts.length === 1 ? '' : 's'} ready for review.`
        : 'No social post draft is ready yet.',
      state: args.socialPosts.length > 0 ? 'ready' : 'missing',
    },
    {
      label: 'Blog',
      detail: args.blogPost
        ? 'Blog draft is attached for review.'
        : 'No blog draft is attached. You can still launch other assets.',
      state: args.blogPost ? 'ready' : 'warning',
    },
    ...(facebookPosts.length > 0
      ? [{
        label: 'Facebook Page',
        detail: args.hasFacebookPageConnection
          ? 'Facebook posts can be published directly.'
          : 'Connect a Facebook Page before publishing Facebook posts.',
        state: args.hasFacebookPageConnection ? 'ready' : 'warning',
      } satisfies ReadinessItem]
      : []),
  ];
}

function bannerAspectRatio(size?: string | null) {
  const [rawWidth, rawHeight] = (size || '1200x628').split('x').map(Number);
  const width = Number.isFinite(rawWidth) && rawWidth > 0 ? rawWidth : 1200;
  const height = Number.isFinite(rawHeight) && rawHeight > 0 ? rawHeight : 628;
  return `${width} / ${height}`;
}

function CampaignStrategyCard({
  plan,
  banners,
  socialPosts,
  blogPost,
}: {
  plan: CampaignPlan;
  banners: Banner[];
  socialPosts: SocialPost[];
  blogPost?: BlogPost | null;
}) {
  const assets = plan.assets?.length ? plan.assets : DEFAULT_PLAN_ASSETS;
  const metrics = plan.successMetrics?.length ? plan.successMetrics : [
    'Assets reviewed',
    'Selected posts launched',
    'Performance signals collected',
  ];

  return (
    <Card className="border-indigo-100 bg-indigo-50/40 shadow-sm">
      <CardContent className="p-4 space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-indigo-700">
              <Target className="h-4 w-4" /> Campaign plan
            </div>
            <h2 className="mt-1 text-lg font-semibold text-slate-950">
              {plan.objective}
            </h2>
          </div>
          <Badge className="w-fit bg-white text-indigo-700">
            Plan - Review - Launch - Learn
          </Badge>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-lg bg-white/80 p-3">
            <div className="flex items-center gap-1.5 text-xs font-medium uppercase text-slate-500">
              <Users className="h-3.5 w-3.5" /> Audience
            </div>
            <p className="mt-1 text-sm text-slate-800">{plan.audience}</p>
          </div>
          <div className="rounded-lg bg-white/80 p-3 md:col-span-2">
            <div className="text-xs font-medium uppercase text-slate-500">Core message</div>
            <p className="mt-1 text-sm text-slate-800">{plan.coreMessage}</p>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-lg bg-white/80 p-3">
            <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-900">
              <ListChecks className="h-4 w-4 text-indigo-500" /> Assets in this campaign
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {assets.map((asset) => {
                const status = planAssetStatus(asset.type, banners, socialPosts, blogPost);
                return (
                  <div key={asset.type} className="rounded-md border border-slate-100 bg-white p-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-sm font-medium text-slate-900">{asset.label}</div>
                      <Badge variant="secondary" className={cn('shrink-0 text-[10px]', status.className)}>
                        {status.label}
                      </Badge>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-slate-500">{asset.role}</p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-lg bg-white/80 p-3">
            <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-900">
              <TrendingUp className="h-4 w-4 text-indigo-500" /> Success signals
            </div>
            <div className="space-y-2">
              {metrics.slice(0, 4).map((metric) => (
                <div key={metric} className="flex gap-2 text-sm text-slate-700">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                  <span>{metric}</span>
                </div>
              ))}
            </div>
            {plan.channels?.length ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {plan.channels.map((channel) => (
                  <Badge key={channel} variant="outline" className="bg-white text-xs">
                    {channel}
                  </Badge>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CampaignPerformanceSection({
  campaign,
  companyId,
  performance,
  isRefreshing,
  onRefresh,
  facebookReconnectRequired,
}: {
  campaign: Campaign;
  companyId: string;
  performance?: CampaignPerformance;
  isRefreshing: boolean;
  onRefresh: () => void;
  facebookReconnectRequired: boolean;
}) {
  const launchSummary = campaign.targeting?.launchSummary;
  const totals = performance?.totals;
  const number = (value?: number) => new Intl.NumberFormat().format(value ?? 0);
  const stats = totals ? [
    {
      label: 'People reached',
      value: number(totals.reach),
      detail: `${number(totals.impressions)} total views`,
      icon: Eye,
    },
    {
      label: 'Interactions',
      value: number(totals.engagements),
      detail: `${totals.engagementRate.toFixed(1)}% engagement rate`,
      icon: MessageSquare,
    },
    {
      label: totals.clicksMeasured ? 'Link clicks' : 'Website visits',
      value: number(totals.clicksMeasured ? totals.clicks : totals.sessions),
      detail: totals.clicksMeasured
        ? `${number(totals.sessions)} tracked website visits`
        : 'Measured by 1Person tracking',
      icon: MousePointerClick,
    },
    {
      label: campaign.goal === 'sales' ? 'Sales' : 'Leads and actions',
      value: number(totals.conversions),
      detail: totals.revenue > 0
        ? `${number(totals.revenue)} attributed revenue`
        : 'No attributed value yet',
      icon: Target,
    },
  ] : [];
  const recommendationClass = performance?.recommendation.tone === 'positive'
    ? 'bg-emerald-50 text-emerald-950'
    : performance?.recommendation.tone === 'attention'
      ? 'bg-amber-50 text-amber-950'
      : 'bg-slate-50 text-slate-900';

  return (
    <div>
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <BarChart3 className="h-5 w-5 text-indigo-500" /> Track performance
          </h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Real results from published Facebook posts and tracked website actions.
          </p>
        </div>
        {!facebookReconnectRequired
        && performance?.facebook.connected
        && performance.facebook.publishedPosts > 0 ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-1.5 self-start"
            disabled={isRefreshing}
            onClick={onRefresh}
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isRefreshing && 'animate-spin')} />
            Refresh data
          </Button>
        ) : null}
      </div>

      {facebookReconnectRequired ? (
        <div className="mb-3 flex flex-col gap-3 rounded-lg bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="font-semibold text-amber-950">Reconnect Facebook to keep tracking</div>
            <p className="mt-1 text-sm text-amber-900">
              The saved connection has expired or belongs to another Page. Your published posts are safe, but new performance data cannot be updated.
            </p>
          </div>
          <Link href={`/${companyId}/channels`} className="shrink-0">
            <Button type="button" size="sm">
              Reconnect Facebook
            </Button>
          </Link>
        </div>
      ) : null}

      {!performance ? (
        <div className="h-28 animate-pulse rounded-lg bg-slate-100" />
      ) : performance.status === 'not_connected' ? (
        <div className="rounded-lg bg-amber-50 p-4">
          <div className="font-semibold text-amber-950">Connect Facebook to measure results</div>
          <p className="mt-1 text-sm text-amber-900">
            Once connected, 1Person can collect reach and interactions from your published posts.
          </p>
          <Link href={`/${companyId}/channels`}>
            <Button type="button" size="sm" className="mt-3">Connect Facebook</Button>
          </Link>
        </div>
      ) : !launchSummary || performance.status === 'awaiting_publish' ? (
        <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
          Publish at least one Facebook post from Ready to launch to begin measuring real results.
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <Badge variant="outline" className="bg-white">Facebook organic</Badge>
            <span>{performance.facebook.measuredPosts} post(s) measured</span>
            <span aria-hidden>·</span>
            <span>
              {performance.lastSyncedAt
                ? `Updated ${new Date(performance.lastSyncedAt).toLocaleString()}`
                : 'Waiting for the first sync'}
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {stats.map((stat) => {
              const Icon = stat.icon;
              return (
                <div key={stat.label} className="rounded-lg bg-white p-3 shadow-sm ring-1 ring-slate-200">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                    <Icon className="h-3.5 w-3.5" /> {stat.label}
                  </div>
                  <div className="mt-1 text-xl font-semibold text-slate-950">{stat.value}</div>
                  <div className="mt-1 text-xs text-slate-500">{stat.detail}</div>
                </div>
              );
            })}
          </div>

          <div className={cn('rounded-lg p-3', recommendationClass)}>
            <div className="text-sm font-semibold">{performance.recommendation.title}</div>
            <p className="mt-1 text-sm opacity-80">{performance.recommendation.message}</p>
          </div>

          {performance.facebook.posts.some((post) => post.metrics || post.syncError) ? (
            <div className="divide-y divide-slate-100 rounded-lg bg-white ring-1 ring-slate-200">
              {performance.facebook.posts
                .filter((post) => post.metrics || post.syncError)
                .map((post) => (
                  <div key={post.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-slate-900">{post.content}</div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        {post.syncError
                          ? 'Could not refresh this post'
                          : `${number(post.metrics?.reach)} reached · ${number(post.metrics?.engagements)} interactions`}
                      </div>
                    </div>
                    {post.externalUrl ? (
                      <a href={post.externalUrl} target="_blank" rel="noreferrer">
                        <Button type="button" size="sm" variant="ghost" className="gap-1.5">
                          Open <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                      </a>
                    ) : null}
                  </div>
                ))}
            </div>
          ) : (
            <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
              Facebook has not returned performance data yet. Try Refresh data after the post has been live for a while.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CampaignLearningSection({
  campaign,
  companyId,
}: {
  campaign: Campaign;
  companyId: string;
}) {
  const learning = campaign.targeting?.learningSummary;
  const observations = learning?.observations?.filter(Boolean) || [];
  const nextActions = learning?.nextActions?.filter(Boolean) || [];

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <Brain className="h-5 w-5 text-indigo-500" /> Learn and optimize
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            AI will use launch results and campaign evidence to guide the next recommendation.
          </p>
        </div>
        <Link href={`/${companyId}/insights`}>
          <Button type="button" size="sm" variant="outline" className="gap-1.5">
            Open CEO Advisor <ExternalLink className="h-3.5 w-3.5" />
          </Button>
        </Link>
      </div>

      {observations.length > 0 || nextActions.length > 0 ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-lg bg-slate-50 p-3">
            <div className="text-sm font-semibold text-slate-900">What happened</div>
            <div className="mt-2 space-y-1.5">
              {observations.map((item) => (
                <div key={item} className="flex gap-2 text-sm text-slate-600">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-lg bg-indigo-50 p-3">
            <div className="text-sm font-semibold text-indigo-950">Suggested next step</div>
            <div className="mt-2 space-y-1.5">
              {nextActions.map((item) => (
                <div key={item} className="flex gap-2 text-sm text-indigo-900">
                  <ArrowLeft className="mt-0.5 h-4 w-4 shrink-0 rotate-180" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
          No learning yet. After launch, this section will show what moved forward and what AI should help with next.
        </div>
      )}
    </div>
  );
}

function CampaignDetailSkeleton({
  companyId,
  title,
}: {
  companyId: string;
  title?: string;
}) {
  return (
    <div className="mx-auto max-w-6xl space-y-6" aria-busy="true">
      <div>
        <Link
          href={`/${companyId}/campaigns`}
          className="inline-flex items-center gap-1 text-sm text-slate-500"
        >
          <ArrowLeft className="h-4 w-4" /> Back to campaigns
        </Link>
        <div className="mt-3 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold text-slate-900">
              {title || 'Loading campaign...'}
            </h1>
            <div className="mt-2 flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />
              Loading campaign details
            </div>
          </div>
          <div className="h-9 w-32 animate-pulse rounded-md bg-slate-100" />
        </div>
      </div>

      <div className="grid gap-4 rounded-lg bg-indigo-50/50 p-4 md:grid-cols-2">
        <div className="space-y-3">
          <div className="h-4 w-32 animate-pulse rounded bg-indigo-100" />
          <div className="h-6 w-3/4 animate-pulse rounded bg-white" />
          <div className="h-4 w-full animate-pulse rounded bg-white" />
          <div className="h-4 w-5/6 animate-pulse rounded bg-white" />
        </div>
        <div className="space-y-3">
          <div className="h-4 w-28 animate-pulse rounded bg-indigo-100" />
          <div className="h-12 animate-pulse rounded-md bg-white" />
          <div className="h-12 animate-pulse rounded-md bg-white" />
        </div>
      </div>

      <div>
        <div className="mb-3 h-6 w-28 animate-pulse rounded bg-slate-100" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <div key={item} className="overflow-hidden rounded-lg bg-white ring-1 ring-slate-200">
              <div className="aspect-[1200/628] animate-pulse bg-slate-100" />
              <div className="space-y-2 p-3">
                <div className="h-4 w-2/3 animate-pulse rounded bg-slate-100" />
                <div className="h-8 animate-pulse rounded-md bg-slate-100" />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-3 h-6 w-32 animate-pulse rounded bg-slate-100" />
        <div className="grid gap-4 md:grid-cols-2">
          {[0, 1].map((item) => (
            <div key={item} className="h-44 animate-pulse rounded-lg bg-slate-100" />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function CampaignDetailPage() {
  const params = useParams();
  const companyId = params.companyId as string;
  const campaignId = params.id as string;
  const token = useAuthStore((s) => s.token);
  const queryClient = useQueryClient();
  const { data: company } = useCompany(companyId);
  const [progressDone, setProgressDone] = useState(false);
  const [editingBanner, setEditingBanner] = useState<Banner | null>(null);
  const [loadingBannerId, setLoadingBannerId] = useState<string | null>(null);
  const [customBannerUploading, setCustomBannerUploading] = useState(false);
  const [bannerToDelete, setBannerToDelete] = useState<Banner | null>(null);
  const [deletingBannerId, setDeletingBannerId] = useState<string | null>(null);
  const [selectedBannerIds, setSelectedBannerIds] = useState<string[]>([]);
  const [videoAspectRatio, setVideoAspectRatio] = useState<'9:16' | '16:9'>('9:16');
  const [videoGenerating, setVideoGenerating] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  const [videoRegenerateDialogOpen, setVideoRegenerateDialogOpen] = useState(false);
  const [videoCreativeNotes, setVideoCreativeNotes] = useState('');
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [videoApplyDialogOpen, setVideoApplyDialogOpen] = useState(false);
  const [selectedVideoApplyPlatforms, setSelectedVideoApplyPlatforms] = useState<SocialImagePlatform[]>([]);
  const [savingPostVideo, setSavingPostVideo] = useState(false);
  const [savingPostMedia, setSavingPostMedia] = useState(false);
  const [applyDialogOpen, setApplyDialogOpen] = useState(false);
  const [selectedApplyPlatforms, setSelectedApplyPlatforms] = useState<SocialImagePlatform[]>([]);
  const [launchDialogOpen, setLaunchDialogOpen] = useState(false);
  const [launchPending, setLaunchPending] = useState(false);
  const [performanceSyncing, setPerformanceSyncing] = useState(false);
  const [facebookReconnectRequired, setFacebookReconnectRequired] = useState(false);
  const [launchActivateBanners, setLaunchActivateBanners] = useState(true);
  const [selectedLaunchPostIds, setSelectedLaunchPostIds] = useState<string[]>([]);
  const [editingSocialPost, setEditingSocialPost] = useState<SocialPost | null>(null);
  const [editingPostContent, setEditingPostContent] = useState('');
  const [editingPostHashtags, setEditingPostHashtags] = useState<string[]>([]);
  const [editingHashtagDraft, setEditingHashtagDraft] = useState('');
  const [savingSocialPostEdit, setSavingSocialPostEdit] = useState(false);
  const previousCampaignStatusRef = useRef<string>();
  const customBannerInputRef = useRef<HTMLInputElement>(null);

  const {
    data,
    error: campaignError,
    isError: campaignIsError,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['campaign', companyId, campaignId],
    queryFn: () =>
      api.get<DetailResponse>(`/campaigns/${companyId}/${campaignId}`, { token: token! }),
    enabled: !!token,
    // Keep polling while background generation/launch jobs are moving.
    // Launch can finish before the SSE panel subscribes, so polling is the
    // reliable path that prevents the page from getting stuck on `launching`.
    refetchInterval: (q) => {
      const s = q.state.data?.campaign?.status;
      if (s === 'launching') return 1000;
      if ((q.state.data?.videos ?? []).some((video) => video.status === 'rendering')) return 5000;
      return s === 'generating' || s === 'planned' ? 2000 : false;
    },
    staleTime: 15_000,
    retry: (failureCount, error) => {
      const status = (error as Error & { status?: number }).status;
      if (status && status < 500) return false;
      return failureCount < 1;
    },
  });

  const { data: omnichannelConnections } = useQuery({
    queryKey: ['omnichannel', 'connections', companyId],
    queryFn: () =>
      api.get<OmnichannelConnectionsResponse>(`/omnichannel/company/${companyId}`, { token: token! }),
    enabled: !!token && !!companyId,
  });

  const { data: distributionConnections } = useQuery({
    queryKey: ['distribution', 'connections', companyId],
    queryFn: () =>
      api.get<DistributionConnectionsResponse>(`/distribution/company/${companyId}/connections`, { token: token! }),
    enabled: !!token && !!companyId,
  });

  const {
    data: performanceResponse,
    isFetching: performanceFetching,
  } = useQuery({
    queryKey: ['campaign-performance', companyId, campaignId],
    queryFn: () => api.get<CampaignPerformanceResponse>(
      `/campaigns/${companyId}/${campaignId}/performance`,
      { token: token! },
    ),
    enabled: !!token && !!companyId && !!campaignId,
    staleTime: 60_000,
    refetchInterval: 2 * 60_000,
  });

  const { data: creditsData } = useQuery({
    queryKey: ['credits', companyId],
    queryFn: () => api.get<CreditResponse>(`/credits/${companyId}`, { token: token! }),
    enabled: !!token && !!companyId,
    staleTime: 30_000,
  });

  // When the SSE stream tells us the flow is done, force a refetch
  useEffect(() => {
    if (progressDone) refetch();
  }, [progressDone, refetch]);

  useEffect(() => {
    // Banner selection is a review choice for the current campaign only.
    // Never carry it into another campaign or infer it from attached media.
    setSelectedBannerIds([]);
    setApplyDialogOpen(false);
    setSelectedVideoId(null);
    setVideoApplyDialogOpen(false);
    setVideoRegenerateDialogOpen(false);
    setVideoCreativeNotes('');
  }, [campaignId]);

  useEffect(() => {
    const hasRenderingVideo = (data?.videos ?? []).some((video) => video.status === 'rendering');
    if (!videoGenerating && !hasRenderingVideo) return;

    const timer = window.setInterval(() => {
      setVideoProgress((current) => {
        const next = current < 45 ? current + 4 : current < 75 ? current + 2 : current + 1;
        return Math.min(next, 92);
      });
    }, 1400);

    return () => window.clearInterval(timer);
  }, [data?.videos, videoGenerating]);

  useEffect(() => {
    const currentStatus = data?.campaign.status;
    const previousStatus = previousCampaignStatusRef.current;
    previousCampaignStatusRef.current = currentStatus;
    if (previousStatus !== 'launching' || currentStatus !== 'live' || !token) return;

    let active = true;
    setPerformanceSyncing(true);
    void (async () => {
      // First refresh cached DB data so the newly published post appears
      // immediately, then ask Facebook for its first available metrics.
      await queryClient.invalidateQueries({
        queryKey: ['campaign-performance', companyId, campaignId],
      });
      try {
        const response = await api.post<CampaignPerformanceResponse>(
          `/campaigns/${companyId}/${campaignId}/performance/sync`,
          {},
          { token },
        );
        if (active) {
          setFacebookReconnectRequired(false);
          queryClient.setQueryData(
            ['campaign-performance', companyId, campaignId],
            response,
          );
        }
      } catch (error) {
        if (active && requiresFacebookReconnect(error)) {
          setFacebookReconnectRequired(true);
        }
        // Facebook may need a short time before insights are available. The
        // published state is already visible and the regular refresh can retry.
      } finally {
        if (active) setPerformanceSyncing(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [campaignId, companyId, data?.campaign.status, queryClient, token]);

  if (campaignIsError && !data) {
    return (
      <div className="mx-auto max-w-6xl">
        <Link
          href={`/${companyId}/campaigns`}
          className="inline-flex items-center gap-1 text-sm text-slate-500"
        >
          <ArrowLeft className="h-4 w-4" /> Back to campaigns
        </Link>
        <div className="mt-4 rounded-lg bg-red-50 p-5">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
            <div className="flex-1">
              <h1 className="font-semibold text-red-950">Campaign could not be loaded</h1>
              <p className="mt-1 text-sm text-red-800">
                {friendlyError(campaignError, 'Please check your connection and try again.')}
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-3 bg-white"
                onClick={() => void refetch()}
              >
                Try again
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading || !data) {
    const cachedCampaign = queryClient
      .getQueryData<{ data: Campaign[] }>(['campaigns', companyId])
      ?.data.find((campaign) => campaign.id === campaignId);
    return (
      <CampaignDetailSkeleton
        companyId={companyId}
        title={cachedCampaign ? campaignDisplayTitle(cachedCampaign) : undefined}
      />
    );
  }

  const { campaign, banners, socialPosts, blogPost } = data;
  const videos = data.videos ?? [];
  const hasCampaignVideo = videos.length > 0;
  const hasRenderingVideo = videos.some((video) => video.status === 'rendering');
  const isVideoWorking = videoGenerating || hasRenderingVideo;
  const readyVideos = videos.filter((video) => video.status === 'ready' && Boolean(video.outputUrl));
  const selectedVideo = readyVideos.find((video) => video.id === selectedVideoId) ?? null;
  const currentVideoPhase = videoGenerationPhase(videoProgress);
  const videoCreditCost = creditsData?.costs?.campaignVideo ?? 300;
  const availableCredits = creditsData?.balance.totalAvailable;
  const hasEnoughVideoCredits =
    typeof availableCredits !== 'number' || availableCredits >= videoCreditCost;
  const displayTitle = campaignDisplayTitle(campaign);
  const accountNameForPlatform = (platformValue: string): string => {
    const platform = platformValue.toLowerCase();
    const isFacebook = platform === 'facebook' || platform === 'fb' || platform === 'meta';
    if (isFacebook) {
      const pageName = omnichannelConnections?.data.find(
        (connection) => connection.channel === 'fb_messenger' && connection.status === 'active',
      )?.config?.pageName;
      if (pageName) return pageName;
    }
    const aliases = isFacebook ? ['facebook', 'fb', 'meta'] : [platform];
    return distributionConnections?.data.find(
      (connection) => aliases.includes(connection.platform.toLowerCase())
        && ['active', 'connected'].includes(connection.status),
    )?.platformAccountName || company?.name || 'Your company';
  };
  const previewMetricsForPost = (post: SocialPost) => {
    const performancePost = performanceResponse?.data.facebook.posts.find((item) => item.id === post.id);
    const metrics = performancePost?.metrics || post.metrics?.facebook?.latest;
    if (!metrics) return null;
    return {
      views: metrics.impressions,
      reach: metrics.reach,
      reactions: metrics.reactions,
      comments: metrics.comments,
      shares: metrics.shares,
    };
  };
  const isGenerating = campaign.status === 'generating' || campaign.status === 'planned';
  const isLaunching = campaign.status === 'launching';
  const isLive = campaign.status === 'live';
  const isReady = campaign.status === 'ready';
  const isFailed = campaign.status === 'failed';
  const showLivePanel = isGenerating || isLaunching || isFailed;
  const selectedBannerImages = banners
    .filter((banner) => selectedBannerIds.includes(banner.id) && banner.imageUrl)
    .map((banner) => banner.imageUrl as string);
  const hasSelectableBanners = banners.some((banner) => Boolean(banner.imageUrl));
  const availableApplyPlatforms = Array.from(new Set<SocialImagePlatform>(
    socialPosts
      .filter((post) => !isPublishedPost(post))
      .map((post) => normalizeSocialImagePlatform(post.platform))
      .filter((platform): platform is SocialImagePlatform => Boolean(platform)),
  ));
  const hasEditableSocialPosts = availableApplyPlatforms.length > 0;
  const editableSocialPostCount = socialPosts.filter((post) => !isPublishedPost(post)).length;
  const publishedSocialPostCount = socialPosts.length - editableSocialPostCount;
  const campaignVideoUrls = readyVideos
    .map((video) => video.outputUrl)
    .filter((url): url is string => Boolean(url));
  const campaignVideoIds = readyVideos.map((video) => video.id.toLowerCase());
  const hasAppliedCampaignVideo = socialPosts.some((post) => {
    if (isPublishedPost(post)) return false;
    return (post.mediaUrls ?? []).some((url) => {
      const decodedUrl = (() => {
        try {
          return decodeURIComponent(url).toLowerCase();
        } catch {
          return url.toLowerCase();
        }
      })();
      return campaignVideoUrls.includes(url)
        || campaignVideoIds.some((videoId) => decodedUrl.includes(videoId));
    });
  });
  const launchBannerIds = selectedBannerIds;
  const selectedLaunchBannerCount = launchActivateBanners ? launchBannerIds.length : 0;
  const shouldActivateBanners = launchActivateBanners && launchBannerIds.length > 0;
  const selectedLaunchPosts = socialPosts.filter((post) =>
    selectedLaunchPostIds.includes(post.id),
  );
  const shouldScheduleSocialPosts = selectedLaunchPosts.length > 0;
  const launchSummary = campaign.targeting?.launchSummary;
  const launchSocialFailedCount = launchSummary?.results?.socialPosts?.failed ?? 0;
  const hasFacebookPageConnection = Boolean(
    omnichannelConnections?.data?.some((connection) =>
      connection.channel === 'fb_messenger' &&
      connection.status === 'active' &&
      connection.config?.pageId &&
      connection.config?.hasAccessToken,
    ) ||
    distributionConnections?.data?.some((connection) =>
      connection.platform === 'facebook' &&
      connection.status === 'connected' &&
      connection.platformPageId,
    ),
  );
  const fallbackCampaignPlan = buildFallbackCampaignPlan(campaign, banners, socialPosts, blogPost);
  const storedCampaignPlan = campaign.targeting?.campaignPlan;
  const campaignPlan: CampaignPlan = storedCampaignPlan
    ? {
      ...fallbackCampaignPlan,
      ...storedCampaignPlan,
      objective: displayText(storedCampaignPlan.objective, fallbackCampaignPlan.objective),
      audience: displayText(storedCampaignPlan.audience, fallbackCampaignPlan.audience),
      coreMessage: displayText(storedCampaignPlan.coreMessage, fallbackCampaignPlan.coreMessage),
      assets: storedCampaignPlan.assets?.length ? storedCampaignPlan.assets : fallbackCampaignPlan.assets,
      channels: storedCampaignPlan.channels?.length ? storedCampaignPlan.channels : fallbackCampaignPlan.channels,
      successMetrics: storedCampaignPlan.successMetrics?.length
        ? storedCampaignPlan.successMetrics
        : fallbackCampaignPlan.successMetrics,
      launchChecklist: storedCampaignPlan.launchChecklist?.length
        ? storedCampaignPlan.launchChecklist
        : fallbackCampaignPlan.launchChecklist,
    }
    : fallbackCampaignPlan;
  const readinessItems = buildLaunchReadinessItems({
    campaign,
    banners,
    socialPosts,
    blogPost,
    hasFacebookPageConnection,
  });
  const readinessReadyCount = readinessItems.filter((item) => item.state === 'ready').length;
  const blogRole = assetRole(campaignPlan, 'blog');
  const canSubmitLaunch =
    (isReady || isLive) &&
    !launchPending &&
    (shouldActivateBanners || shouldScheduleSocialPosts);

  const refreshPerformance = async () => {
    if (!token || performanceSyncing) return;
    setPerformanceSyncing(true);
    try {
      const response = await api.post<CampaignPerformanceResponse>(
        `/campaigns/${companyId}/${campaignId}/performance/sync`,
        {},
        { token },
      );
      queryClient.setQueryData(
        ['campaign-performance', companyId, campaignId],
        response,
      );
      setFacebookReconnectRequired(false);
      await queryClient.invalidateQueries({
        queryKey: ['campaign', companyId, campaignId],
      });
      toast.success('Facebook performance updated');
    } catch (error) {
      if (requiresFacebookReconnect(error)) {
        setFacebookReconnectRequired(true);
      }
      toast.error(friendlyError(error, 'Facebook data could not be refreshed. Please try again.'));
    } finally {
      setPerformanceSyncing(false);
    }
  };

  const generateCampaignVideo = async (options?: { forceNew?: boolean; creativeNotes?: string }) => {
    if (!token || isVideoWorking) return;
    if (!hasEnoughVideoCredits) {
      toast.error(
        `This AI video needs ${videoCreditCost} credits, but you only have ${availableCredits ?? 0}. Please contact support to add more credits.`,
      );
      return;
    }
    if (hasCampaignVideo && !options?.forceNew) {
      setVideoRegenerateDialogOpen(true);
      return;
    }
    setVideoGenerating(true);
    setVideoProgress(8);
    setVideoRegenerateDialogOpen(false);
    const toastId = toast.loading('Submitting your AI video job...');
    try {
      const project = await api.post<VideoProject>(
        `/marketing/company/${companyId}/videos/generate`,
        {
          campaignId,
          format: '15s',
          aspectRatio: videoAspectRatio,
          render: true,
          forceNew: Boolean(options?.forceNew),
          creativeNotes: options?.creativeNotes?.trim() || undefined,
        },
        { token },
      );
      queryClient.setQueryData<DetailResponse>(
        ['campaign', companyId, campaignId],
        (current) => current
          ? {
            ...current,
            videos: [
              project,
              ...(current.videos ?? []).filter((item) => item.id !== project.id),
            ],
          }
          : current,
      );
      setVideoProgress(project.status === 'ready' ? 100 : 18);
      if (project.status === 'ready' && project.outputUrl) setSelectedVideoId(project.id);
      setVideoCreativeNotes('');
      toast.success(
        project.status === 'ready'
          ? 'AI video is ready to review.'
          : 'AI video generation started. You can keep working while it renders.',
        { id: toastId },
      );
      queryClient.invalidateQueries({ queryKey: ['credits', companyId] });
      await queryClient.invalidateQueries({ queryKey: ['campaign', companyId, campaignId] });
    } catch (error) {
      setVideoProgress(0);
      toast.error(friendlyError(error, "We couldn't create this video. Please try again."), { id: toastId });
    } finally {
      setVideoGenerating(false);
    }
  };

  const openLaunchDialog = () => {
    setLaunchActivateBanners(!isLive);
    setSelectedLaunchPostIds(
      socialPosts
        .filter((post) => {
          if (post.status === 'published') return false;
          const platform = post.platform.toLowerCase();
          return platform !== 'facebook' && platform !== 'fb'
            ? true
            : hasFacebookPageConnection;
        })
        .map((post) => post.id),
    );
    setLaunchDialogOpen(true);
  };

  const toggleLaunchPost = (postId: string) => {
    setSelectedLaunchPostIds((current) =>
      current.includes(postId)
        ? current.filter((id) => id !== postId)
        : [...current, postId],
    );
  };

  const toggleBannerSelection = (bannerId: string) => {
    setSelectedBannerIds((current) =>
      current.includes(bannerId)
        ? current.filter((id) => id !== bannerId)
        : [...current, bannerId],
    );
  };

  const openSocialPostEditor = (post: SocialPost) => {
    if (isPublishedPost(post)) {
      const url = facebookPostUrl(post);
      if (url) {
        window.open(url, '_blank', 'noopener,noreferrer');
      } else {
        toast.info('This post is already published. Open it on the social platform to make changes.');
      }
      return;
    }
    setEditingSocialPost(post);
    setEditingPostContent(post.content);
    setEditingPostHashtags(normalizeHashtagsInput((post.hashtags ?? []).join(' ')));
    setEditingHashtagDraft('');
  };

  const closeSocialPostEditor = () => {
    if (savingSocialPostEdit) return;
    setEditingSocialPost(null);
    setEditingPostContent('');
    setEditingPostHashtags([]);
    setEditingHashtagDraft('');
  };

  const addEditingHashtags = () => {
    const nextTags = normalizeHashtagsInput(editingHashtagDraft);
    if (nextTags.length === 0) return;
    setEditingPostHashtags((current) =>
      normalizeHashtagsInput([...current, ...nextTags].join(' ')),
    );
    setEditingHashtagDraft('');
  };

  const removeEditingHashtag = (tag: string) => {
    setEditingPostHashtags((current) =>
      current.filter((item) => item.toLowerCase() !== tag.toLowerCase()),
    );
  };

  const saveSocialPostEdit = async () => {
    if (!token || !editingSocialPost || savingSocialPostEdit) return;
    if (isPublishedPost(editingSocialPost)) {
      toast.info('This post is already published. Open it on the social platform to make changes.');
      closeSocialPostEditor();
      return;
    }
    const content = editingPostContent.trim();
    if (!content) {
      toast.error('Post text cannot be empty.');
      return;
    }

    const hashtags = normalizeHashtagsInput(editingPostHashtags.join(' '));
    setSavingSocialPostEdit(true);
    try {
      const updated = await api.patch<UpdateSocialPostResponse>(
        `/marketing/company/${companyId}/posts/${editingSocialPost.id}`,
        { content, hashtags },
        { token },
      );
      queryClient.setQueryData<DetailResponse>(
        ['campaign', companyId, campaignId],
        (current) => current
          ? {
            ...current,
            socialPosts: current.socialPosts.map((post) =>
              post.id === updated.id ? { ...post, ...updated } : post,
            ),
          }
          : current,
      );
      setEditingSocialPost(null);
      setEditingPostContent('');
      setEditingPostHashtags([]);
      setEditingHashtagDraft('');
      toast.success('Social post updated');
    } catch (error) {
      toast.error(friendlyError(error, "We couldn't save this post. Please try again."));
    } finally {
      setSavingSocialPostEdit(false);
    }
  };

  const openBannerEditor = async (banner: Banner) => {
    if (!token || loadingBannerId) return;
    setLoadingBannerId(banner.id);
    try {
      const fullBanner = await api.get<Banner>(
        `/marketing/company/${companyId}/banners/${banner.id}`,
        { token },
      );
      setEditingBanner({ ...banner, ...fullBanner });
    } catch (error) {
      toast.error(friendlyError(error, "We couldn't open this banner for editing."));
    } finally {
      setLoadingBannerId(null);
    }
  };

  const uploadCustomBanner = async (file?: File | null) => {
    if (!file || !token || customBannerUploading) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast.error('Please choose a JPG, PNG, or WebP image.');
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      toast.error('Image is too large. Please use an image under 15MB.');
      return;
    }

    setCustomBannerUploading(true);
    const toastId = toast.loading('Uploading your banner...');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8004/api/v1';
      const response = await fetch(
        `${apiUrl}/marketing/company/${companyId}/campaigns/${campaignId}/banners/custom`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        },
      );
      const result = await response.json().catch(() => null) as CustomBannerResponse | { error?: string } | null;
      if (!response.ok || !result || !('banner' in result)) {
        throw new Error((result as { error?: string } | null)?.error || 'Could not create custom banner.');
      }

      queryClient.setQueryData<DetailResponse>(
        ['campaign', companyId, campaignId],
        (current) => current
          ? {
            ...current,
            banners: [
              result.banner,
              ...current.banners.filter((banner) => banner.id !== result.banner.id),
            ],
          }
          : current,
      );
      setEditingBanner(result.banner);
      toast.success('Custom banner ready to edit.', { id: toastId });
      await queryClient.invalidateQueries({ queryKey: ['campaign', companyId, campaignId] });
    } catch (error) {
      toast.error(friendlyError(error, "We couldn't create a custom banner."), { id: toastId });
    } finally {
      setCustomBannerUploading(false);
      if (customBannerInputRef.current) customBannerInputRef.current.value = '';
    }
  };

  const deleteBanner = async () => {
    if (!token || !bannerToDelete || deletingBannerId) return;
    const bannerId = bannerToDelete.id;
    setDeletingBannerId(bannerId);
    try {
      const response = await api.delete<DeleteBannerResponse>(
        `/marketing/company/${companyId}/campaigns/${campaignId}/banners/${bannerId}`,
        { token },
      );
      const postMediaById = new Map(response.posts.map((post) => [post.id, post.mediaUrls]));
      queryClient.setQueryData<DetailResponse>(
        ['campaign', companyId, campaignId],
        (current) => current
          ? {
            ...current,
            banners: current.banners.filter((banner) => banner.id !== bannerId),
            socialPosts: current.socialPosts.map((post) => postMediaById.has(post.id)
              ? { ...post, mediaUrls: postMediaById.get(post.id) }
              : post),
          }
          : current,
      );
      setSelectedBannerIds((current) => current.filter((id) => id !== bannerId));
      if (editingBanner?.id === bannerId) setEditingBanner(null);
      setBannerToDelete(null);
      toast.success('Banner deleted.');
    } catch (error) {
      toast.error(friendlyError(error, "We couldn't delete this banner. Please try again."));
    } finally {
      setDeletingBannerId(null);
    }
  };

  const openApplyDialog = () => {
    if (selectedBannerIds.length === 0 || !hasEditableSocialPosts) return;
    setSelectedApplyPlatforms(availableApplyPlatforms);
    setApplyDialogOpen(true);
  };

  const toggleApplyPlatform = (platform: SocialImagePlatform) => {
    setSelectedApplyPlatforms((current) =>
      current.includes(platform)
        ? current.filter((item) => item !== platform)
        : [...current, platform],
    );
  };

  const applySelectedBannersToPosts = async () => {
    if (!token || !hasEditableSocialPosts || selectedApplyPlatforms.length === 0) return;

    const platformNames = selectedApplyPlatforms
      .map((platform) => SOCIAL_IMAGE_PRESETS[platform].label)
      .join(', ');
    setSavingPostMedia(true);
    setApplyDialogOpen(false);
    const toastId = toast.loading('Preparing images for your social posts...');
    try {
      const response = await api.patch<ApplySocialMediaResponse>(
        `/marketing/company/${companyId}/campaigns/${campaignId}/social-post-media`,
        {
          bannerIds: selectedBannerIds,
          platforms: selectedApplyPlatforms,
        },
        { token },
      );
      const updatedById = new Map(response.posts.map((post) => [post.id, post]));
      queryClient.setQueryData<DetailResponse>(
        ['campaign', companyId, campaignId],
        (current) => current
          ? {
            ...current,
            socialPosts: current.socialPosts.map((post) => {
              const updated = updatedById.get(post.id);
              return updated ? { ...post, mediaUrls: updated.mediaUrls } : post;
            }),
          }
          : current,
      );
      toast.success(
        selectedBannerImages.length > 0
          ? `Images were resized and applied to ${platformNames}.`
          : `Campaign images were removed from ${platformNames}.`,
        { id: toastId },
      );
    } catch (err) {
      toast.error(
        friendlyError(err, "We couldn't update social post images. Please try again."),
        { id: toastId },
      );
      setApplyDialogOpen(true);
    } finally {
      setSavingPostMedia(false);
    }
  };

  const openVideoApplyDialog = () => {
    if (!selectedVideo || !hasEditableSocialPosts) return;
    setSelectedVideoApplyPlatforms(availableApplyPlatforms);
    setVideoApplyDialogOpen(true);
  };

  const toggleVideoApplyPlatform = (platform: SocialImagePlatform) => {
    setSelectedVideoApplyPlatforms((current) =>
      current.includes(platform)
        ? current.filter((item) => item !== platform)
        : [...current, platform],
    );
  };

  const applySelectedVideoToPosts = async () => {
    if (!token || !selectedVideo || !hasEditableSocialPosts || selectedVideoApplyPlatforms.length === 0) return;

    const platformNames = selectedVideoApplyPlatforms
      .map((platform) => SOCIAL_IMAGE_PRESETS[platform].label)
      .join(', ');
    setSavingPostVideo(true);
    setVideoApplyDialogOpen(false);
    const toastId = toast.loading('Adding video to social posts...');
    try {
      const response = await api.patch<ApplySocialMediaResponse>(
        `/marketing/company/${companyId}/campaigns/${campaignId}/social-post-video`,
        {
          videoId: selectedVideo.id,
          platforms: selectedVideoApplyPlatforms,
        },
        { token },
      );
      const updatedById = new Map(response.posts.map((post) => [post.id, post]));
      queryClient.setQueryData<DetailResponse>(
        ['campaign', companyId, campaignId],
        (current) => current
          ? {
            ...current,
            socialPosts: current.socialPosts.map((post) => {
              const updated = updatedById.get(post.id);
              return updated ? { ...post, mediaUrls: updated.mediaUrls } : post;
            }),
          }
          : current,
      );
      toast.success(`Video was applied to ${platformNames}.`, { id: toastId });
    } catch (err) {
      toast.error(
        friendlyError(err, "We couldn't update social post videos. Please try again."),
        { id: toastId },
      );
      setVideoApplyDialogOpen(true);
    } finally {
      setSavingPostVideo(false);
    }
  };

  const removeCampaignVideoFromPosts = async () => {
    if (!token || !hasEditableSocialPosts || !hasAppliedCampaignVideo) return;

    setSavingPostVideo(true);
    const toastId = toast.loading('Removing video from draft social posts...');
    try {
      const response = await api.patch<ApplySocialMediaResponse>(
        `/marketing/company/${companyId}/campaigns/${campaignId}/social-post-video`,
        {
          remove: true,
          platforms: availableApplyPlatforms,
        },
        { token },
      );
      const updatedById = new Map(response.posts.map((post) => [post.id, post]));
      queryClient.setQueryData<DetailResponse>(
        ['campaign', companyId, campaignId],
        (current) => current
          ? {
            ...current,
            socialPosts: current.socialPosts.map((post) => {
              const updated = updatedById.get(post.id);
              return updated ? { ...post, mediaUrls: updated.mediaUrls } : post;
            }),
          }
          : current,
      );
      toast.success('Video was removed from draft social posts.', { id: toastId });
    } catch (err) {
      toast.error(
        friendlyError(err, "We couldn't remove the video from social posts. Please try again."),
        { id: toastId },
      );
    } finally {
      setSavingPostVideo(false);
    }
  };

  const onLaunch = async () => {
    if (!token) return;
    if (!canSubmitLaunch) {
      toast.error('Select at least one launch action.');
      return;
    }

    const queryKey = ['campaign', companyId, campaignId] as const;
    const previousCampaign = queryClient.getQueryData<DetailResponse>(queryKey);
    const cancelPendingQuery = queryClient.cancelQueries(
      { queryKey },
      { revert: false },
    );
    setLaunchPending(true);
    setProgressDone(false);
    setLaunchDialogOpen(false);
    queryClient.setQueryData<DetailResponse>(queryKey, (current) => current
      ? {
        ...current,
        campaign: {
          ...current.campaign,
          status: 'launching',
          targeting: {
            ...(current.campaign.targeting ?? {}),
            launchSummary: {
              launchedAt: new Date().toISOString(),
              results: {
                banners: {
                  status: shouldActivateBanners ? 'pending' : 'skipped',
                  requested: selectedLaunchBannerCount,
                  activated: 0,
                },
                socialPosts: {
                  status: shouldScheduleSocialPosts ? 'pending' : 'skipped',
                  requested: selectedLaunchPosts.length,
                  scheduled: 0,
                  published: 0,
                  failed: 0,
                },
              },
            },
          },
        },
      }
      : current);
    toast.success('Launch started. You can follow each step below.');
    try {
      await cancelPendingQuery;
      await api.post(
        `/campaigns/${companyId}/${campaignId}/launch`,
        {
          bannerIds: launchActivateBanners ? launchBannerIds : [],
          socialPostIds: selectedLaunchPostIds,
          activateBanners: shouldActivateBanners,
          scheduleSocialPosts: shouldScheduleSocialPosts,
        },
        { token },
      );
      await refetch();
    } catch (err) {
      if (previousCampaign) {
        queryClient.setQueryData(queryKey, previousCampaign);
      }
      await queryClient.invalidateQueries({ queryKey });
      setLaunchDialogOpen(true);
      toast.error(friendlyError(err, "We couldn't launch your campaign. Please try again."));
    } finally {
      setLaunchPending(false);
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
            <h1
              className="text-xl sm:text-2xl font-bold text-slate-900 truncate"
              title={displayTitle}
            >
              {displayTitle}
            </h1>
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
          {(isReady || isLive) && (
            <Button
              onClick={openLaunchDialog}
              className="bg-green-600 hover:bg-green-700 text-white gap-2"
            >
              <Rocket className="w-4 h-4" /> {isLive ? 'Launch items...' : 'Launch...'}
            </Button>
          )}
          {isLive && !launchDialogOpen && (
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

      {launchSummary && !isReady && !isLaunching && (
        <div className={`rounded-xl border p-4 ${
          launchSocialFailedCount > 0
            ? 'border-amber-200 bg-amber-50'
            : 'border-emerald-200 bg-emerald-50'
        }`}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className={`text-sm font-semibold ${
                launchSocialFailedCount > 0 ? 'text-amber-950' : 'text-emerald-900'
              }`}>
                {launchSocialFailedCount > 0 ? 'Some items need attention' : 'Launch summary'}
              </div>
              <p className={`mt-1 text-sm ${
                launchSocialFailedCount > 0 ? 'text-amber-900' : 'text-emerald-800'
              }`}>
                {launchSocialFailedCount > 0
                  ? `${launchSocialFailedCount} social post could not be published. Open Launch items to retry it.`
                  : 'Selected campaign items were processed. Facebook posts publish directly; other social channels remain queued until their publishers are connected.'}
              </p>
            </div>
            <Badge className={`w-fit bg-white ${
              launchSocialFailedCount > 0 ? 'text-amber-800' : 'text-emerald-700'
            }`}>
              {new Date(launchSummary.launchedAt).toLocaleString()}
            </Badge>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-3">
            <div className="rounded-lg bg-white p-3 text-sm">
              <div className="font-medium text-slate-900">Banners</div>
              <div className="mt-1 text-slate-600">
                {launchSummary.results?.banners?.activated ?? 0} activated
              </div>
            </div>
            <div className="rounded-lg bg-white p-3 text-sm">
              <div className="font-medium text-slate-900">Social posts</div>
              <div className="mt-1 text-slate-600">
                {(launchSummary.results?.socialPosts?.published ?? 0) > 0
                  ? `${launchSummary.results?.socialPosts?.published ?? 0} published`
                  : `${launchSummary.results?.socialPosts?.scheduled ?? 0} queued`}
              </div>
            </div>
            <div className="rounded-lg bg-white p-3 text-sm">
              <div className="font-medium text-slate-900">Blog</div>
              <div className="mt-1 text-slate-600">
                {launchSummary.results?.blog?.status === 'review_required'
                  ? 'Ready for review'
                  : 'Not attached'}
              </div>
            </div>
          </div>
        </div>
      )}

      <CampaignStrategyCard
        plan={campaignPlan}
        banners={banners}
        socialPosts={socialPosts}
        blogPost={blogPost}
      />

      {/* Banners */}
      <div>
        <input
          ref={customBannerInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(event) => void uploadCustomBanner(event.target.files?.[0])}
        />
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <ImageIcon className="w-5 h-5 text-indigo-500" /> Banners ({banners.length})
          </h2>
        </div>
        {banners.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
              <div>
                <p className="text-sm font-medium text-slate-900">
                  {isGenerating ? 'AI is designing banners...' : 'No banners yet'}
                </p>
                <p className="mt-1 max-w-md text-sm text-slate-500">
                  Upload your own design or product image, then adjust it in the visual editor.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={customBannerUploading}
                onClick={() => customBannerInputRef.current?.click()}
              >
                {customBannerUploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <UploadCloud className="h-4 w-4" />
                )}
                Use my image
              </Button>
            </CardContent>
          </Card>
        ) : banners.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
              {isGenerating ? 'AI is designing banners…' : 'No banners yet'}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-col gap-3 rounded-lg border border-indigo-100 bg-indigo-50/60 p-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-900">
                  Choose your campaign images
                </div>
                <p className="mt-0.5 text-sm text-slate-600">
                  Select AI banners below, or upload your own image and edit it visually.
                  <span className="ml-1 font-medium text-slate-900">
                    {selectedBannerImages.length} selected
                  </span>
                </p>
                {publishedSocialPostCount > 0 && (
                  <p className="mt-1 text-xs text-slate-500">
                    Published posts are read-only. Images can only be applied to {editableSocialPostCount}{' '}
                    {editableSocialPostCount === 1 ? 'draft post' : 'draft posts'}.
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full gap-1.5 bg-white sm:min-w-[180px]"
                  disabled={customBannerUploading}
                  onClick={() => customBannerInputRef.current?.click()}
                >
                  {customBannerUploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <UploadCloud className="h-4 w-4" />
                  )}
                  Use my image
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="w-full gap-1.5 sm:min-w-[180px]"
                  disabled={
                    !hasSelectableBanners
                    || selectedBannerIds.length === 0
                    || !hasEditableSocialPosts
                    || savingPostMedia
                  }
                  title={!hasEditableSocialPosts
                    ? 'Published posts are read-only. Create a new draft post to apply images.'
                    : undefined}
                  onClick={openApplyDialog}
                >
                  {savingPostMedia ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <MessageSquare className="h-4 w-4" />
                  )}
                  {savingPostMedia ? 'Preparing images...' : 'Apply to social posts'}
                </Button>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {banners.map((b) => {
                const fallbackBackground =
                  b.design?.backgroundValue ||
                  `linear-gradient(135deg, ${b.copy?.brandColor || '#6366f1'}, #8b5cf6)`;
                const isSelected = selectedBannerIds.includes(b.id);
                const compactStrategyTag =
                  b.strategyTag && b.strategyTag.length <= 18 && !/\s{2,}/.test(b.strategyTag)
                    ? b.strategyTag
                    : null;
                const bannerDescription =
                  b.copy?.reasoning
                  || b.design?.visualDirection
                  || (!compactStrategyTag ? b.strategyTag : undefined)
                  || b.name;
                const brandFit = b.design?.brandFit;
                const brandKit = b.design?.brandKit;
                const brandLabel = brandFit?.voiceApplied
                  ? 'Brand IQ'
                  : brandKit
                    ? 'Brand style'
                    : null;
                const brandTitle = brandLabel
                  ? [
                    `${brandLabel} applied`,
                    brandKit?.companyName,
                    brandFit?.logoApplied
                      ? 'Logo included'
                      : brandFit?.logoAvailable
                        ? 'Logo ready for editor'
                        : 'No logo in Brand IQ yet',
                    brandKit?.imageMood ? `Mood: ${brandKit.imageMood}` : '',
                  ].filter(Boolean).join(' · ')
                  : undefined;
                const canDeleteBanner = b.status !== 'active' && b.status !== 'archived';
                return (
                  <Card
                    key={b.id}
                    className={`flex h-full flex-col overflow-hidden border-slate-200 shadow-sm ${isSelected ? 'ring-2 ring-indigo-500 ring-offset-2' : ''}`}
                  >
                    <div className="relative h-56 w-full overflow-hidden bg-[linear-gradient(45deg,#f8fafc_25%,transparent_25%),linear-gradient(-45deg,#f8fafc_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#f8fafc_75%),linear-gradient(-45deg,transparent_75%,#f8fafc_75%)] bg-[length:18px_18px] bg-[position:0_0,0_9px,9px_-9px,-9px_0px]">
                      <Button
                        type="button"
                        variant="secondary"
                        size="icon"
                        className="absolute right-2 top-2 z-10 h-8 w-8 bg-white/95 text-slate-600 shadow-sm hover:bg-red-50 hover:text-red-600"
                        disabled={!canDeleteBanner || deletingBannerId === b.id}
                        title={canDeleteBanner
                          ? 'Delete banner'
                          : 'Active banners are kept for performance history'}
                        onClick={() => setBannerToDelete(b)}
                      >
                        {deletingBannerId === b.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                        <span className="sr-only">Delete banner</span>
                      </Button>
                      {b.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={campaignImageSrc(b.imageUrl)} alt={b.name} className="h-full w-full object-contain" />
                      ) : (
                        <div
                          className="flex h-full w-full flex-col items-center justify-center bg-cover bg-center p-4 text-center text-white"
                          style={{
                            aspectRatio: bannerAspectRatio(b.size),
                            background: fallbackBackground,
                          }}
                        >
                          <>
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
                          </>
                        </div>
                      )}
                    </div>
                    <CardContent className="mt-auto p-3 space-y-3">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs text-slate-500">{b.size}</span>
                          <div className="flex min-w-0 items-center gap-1.5">
                            {brandLabel && (
                              <Badge
                                variant="secondary"
                                className="max-w-[112px] gap-1 truncate bg-emerald-50 text-[10px] text-emerald-700"
                                title={brandTitle}
                              >
                                <Palette className="h-3 w-3 shrink-0" />
                                <span className="truncate">{brandLabel}</span>
                              </Badge>
                            )}
                            {compactStrategyTag && (
                              <Badge variant="secondary" className="max-w-[110px] truncate text-[10px]" title={compactStrategyTag}>
                                {compactStrategyTag}
                              </Badge>
                            )}
                          </div>
                        </div>
                        {bannerDescription && (
                          <p className="truncate text-xs text-slate-500" title={bannerDescription}>
                            {bannerDescription}
                          </p>
                        )}
                      </div>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <Button
                          type="button"
                          variant={isSelected ? 'default' : 'outline'}
                          size="sm"
                          className="h-8 w-full gap-1 text-xs"
                          disabled={!b.imageUrl || savingPostMedia}
                          onClick={() => toggleBannerSelection(b.id)}
                        >
                          {isSelected ? (
                            <CheckCircle2 className="h-4 w-4" />
                          ) : (
                            <ImageIcon className="h-4 w-4" />
                          )}
                          {isSelected ? 'Selected' : 'Select'}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 w-full text-xs"
                          disabled={loadingBannerId === b.id}
                          onClick={() => void openBannerEditor(b)}
                        >
                          {loadingBannerId === b.id ? (
                            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                          ) : null}
                          Edit image
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Videos */}
      <div>
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <Clapperboard className="w-5 h-5 text-indigo-500" /> Videos ({videos.length})
          </h2>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="grid grid-cols-2 rounded-lg border border-slate-200 bg-white p-1 text-xs">
              {([
                { value: '9:16' as const, label: 'Vertical' },
                { value: '16:9' as const, label: 'Wide' },
              ]).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={cn(
                    'rounded-md px-3 py-1.5 font-medium transition',
                    videoAspectRatio === option.value
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-50',
                  )}
                  onClick={() => setVideoAspectRatio(option.value)}
                  disabled={isVideoWorking}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <Button
              type="button"
              size="sm"
              className="gap-2"
              onClick={() => void generateCampaignVideo()}
              disabled={!token || isVideoWorking || isGenerating || isLaunching || !hasEnoughVideoCredits}
              title={!hasEnoughVideoCredits ? 'Not enough credits. Contact support to add more.' : undefined}
            >
              {isVideoWorking ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Wand2 className="h-4 w-4" />
              )}
              {isVideoWorking
                ? `${currentVideoPhase.label} ${Math.round(videoProgress)}%`
                : `${hasCampaignVideo ? 'Create another video' : 'Create AI video'} · ${videoCreditCost} credits`}
            </Button>
          </div>
        </div>
        <Card className="border-indigo-100 bg-indigo-50/35">
          <CardContent className="p-4">
            <div className="mb-4 flex items-start gap-3 rounded-lg bg-white/70 p-3 text-sm text-slate-600">
              <Clapperboard className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500" />
              <p>
                Create AI video options from this campaign, then choose one to add to draft social posts.
                Published posts stay unchanged and must be edited on their social platform.
              </p>
            </div>
            {readyVideos.length > 0 && (
              <div className="mb-4 flex flex-col gap-3 rounded-lg border border-indigo-100 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-900">
                    Choose one campaign video
                  </div>
                  <p className="mt-0.5 text-sm text-slate-600">
                    {selectedVideo
                      ? `"${selectedVideo.title}" is selected for draft social posts.`
                      : 'Select a ready video below before applying it to social posts.'}
                  </p>
                  {publishedSocialPostCount > 0 && (
                    <p className="mt-1 text-xs text-slate-500">
                      Published posts are read-only. Videos can only be applied to {editableSocialPostCount}{' '}
                      {editableSocialPostCount === 1 ? 'draft post' : 'draft posts'}.
                    </p>
                  )}
                </div>
                <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                  <Button
                    type="button"
                    size="sm"
                    className="w-full gap-1.5 sm:min-w-[180px]"
                    disabled={!selectedVideo || !hasEditableSocialPosts || savingPostVideo}
                    title={!hasEditableSocialPosts
                      ? 'Published posts are read-only. Create a new draft post to apply videos.'
                      : undefined}
                    onClick={openVideoApplyDialog}
                  >
                    {savingPostVideo ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <MessageSquare className="h-4 w-4" />
                    )}
                    {savingPostVideo ? 'Updating...' : 'Apply video'}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="w-full gap-1.5 border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-800 sm:min-w-[150px]"
                    disabled={!hasAppliedCampaignVideo || !hasEditableSocialPosts || savingPostVideo}
                    title={!hasAppliedCampaignVideo
                      ? 'No campaign video is applied to draft posts yet.'
                      : undefined}
                    onClick={removeCampaignVideoFromPosts}
                  >
                    {savingPostVideo ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                    Remove video
                  </Button>
                </div>
              </div>
            )}
            {isVideoWorking && (
              <div className="mb-4 rounded-xl border border-indigo-100 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-950">
                        {currentVideoPhase.label}
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        {currentVideoPhase.hint}
                      </p>
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full bg-indigo-50 px-3 py-1 text-sm font-semibold text-indigo-700">
                    {Math.round(videoProgress)}%
                  </span>
                </div>
                <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-indigo-600 transition-all duration-700 ease-out"
                    style={{ width: `${Math.max(6, Math.min(100, videoProgress))}%` }}
                  />
                </div>
                <p className="mt-3 text-xs text-slate-500">
                  You can stay on this page. The video preview will appear automatically when rendering finishes.
                </p>
              </div>
            )}
            {videos.length === 0 ? (
              <div className="rounded-lg border border-dashed border-indigo-200 bg-white py-8 text-center">
                <Clapperboard className="mx-auto h-8 w-8 text-indigo-300" />
                <p className="mt-2 text-sm font-medium text-slate-900">
                  {isVideoWorking ? 'Creating your first campaign video' : 'No campaign video yet'}
                </p>
                <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
                  {isVideoWorking
                    ? 'AI video rendering can take a few minutes. Keep this page open while the preview is prepared.'
                    : 'Start with one short video for Reels, TikTok, Facebook, or LinkedIn. Review the generated video before publishing.'}
                </p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {videos.map((video) => {
                  const isReadyVideo = video.status === 'ready' && Boolean(video.outputUrl);
                  const isRenderingVideo = video.status === 'rendering';
                  const isFailedVideo = video.status === 'failed';
                  const isSelectedVideo = selectedVideoId === video.id;
                  return (
                    <Card
                      key={video.id}
                      className={cn(
                        'overflow-hidden border-slate-200 bg-white shadow-sm',
                        isSelectedVideo ? 'ring-2 ring-indigo-500 ring-offset-2' : '',
                      )}
                    >
                      <div className={cn(
                        'relative bg-slate-950',
                        video.aspectRatio === '16:9' ? 'aspect-video' : video.aspectRatio === '1:1' ? 'aspect-square' : 'aspect-[9/16]',
                      )}>
                        {isReadyVideo ? (
                          <video
                            className="h-full w-full object-contain"
                            src={campaignImageSrc(video.outputUrl)}
                            controls
                            playsInline
                            preload="metadata"
                          />
                        ) : (
                          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-white">
                            {isRenderingVideo ? (
                              <Loader2 className="h-6 w-6 animate-spin text-indigo-200" />
                            ) : (
                              <AlertCircle className="h-6 w-6 text-rose-200" />
                            )}
                            <p className="text-sm font-medium">
                              {isRenderingVideo ? 'AI is rendering this video' : 'Video failed to render'}
                            </p>
                          </div>
                        )}
                      </div>
                      <CardContent className="space-y-3 p-3">
                        <div className="space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-sm font-semibold text-slate-900" title={video.title}>
                              {video.title}
                            </p>
                            <Badge
                              variant="secondary"
                              className={cn('shrink-0 text-[10px]', statusVariant[video.status] || 'bg-slate-100 text-slate-700')}
                            >
                              {video.status}
                            </Badge>
                          </div>
                          <p className="text-xs text-slate-500">
                            {video.aspectRatio} · {video.format}
                          </p>
                          {isFailedVideo && video.script?.error && (
                            <p className="line-clamp-2 text-xs text-rose-600" title={video.script.error}>
                              {video.script.error}
                            </p>
                          )}
                        </div>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <Button
                            type="button"
                            variant={isSelectedVideo ? 'default' : 'outline'}
                            size="sm"
                            className="w-full gap-2"
                            disabled={!isReadyVideo || savingPostVideo}
                            onClick={() => setSelectedVideoId(video.id)}
                          >
                            {isSelectedVideo ? (
                              <CheckCircle2 className="h-4 w-4" />
                            ) : (
                              <Clapperboard className="h-4 w-4" />
                            )}
                            {isSelectedVideo ? 'Selected' : 'Select'}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="w-full gap-2"
                            disabled={!isReadyVideo}
                            onClick={() => {
                              if (video.outputUrl) {
                                window.open(campaignImageSrc(video.outputUrl), '_blank', 'noopener,noreferrer');
                              }
                            }}
                          >
                            <ExternalLink className="h-4 w-4" />
                            Open
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Social posts */}
      <div>
        <h2 className="mb-3 text-lg font-semibold text-slate-900 flex items-center gap-2">
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
            {socialPosts.map((p) => {
              const platform = p.platform.toLowerCase();
              const isFacebook = platform === 'facebook' || platform === 'fb';
              const facebookPublish = p.metrics?.facebook;
              const isPublishedOnFacebook = isPublishedFacebookPost(p);
              const isPublished = isPublishedPost(p);
              const publishedFacebookUrl = facebookPostUrl(p);
              return (
                <div
                  key={p.id}
                  className="w-full max-w-md"
                >
                  {isPublishedOnFacebook && (
                    <div className="mb-2 flex items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100">
                          <CheckCircle2 className="h-4 w-4 text-emerald-700" />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-emerald-950">
                            Published on Facebook
                          </p>
                          <p className="truncate text-xs text-emerald-700">
                            {formatPublishedAt(facebookPublish?.publishedAt || p.publishedAt)}
                          </p>
                        </div>
                      </div>
                      {publishedFacebookUrl && (
                        <Button
                          asChild
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 shrink-0 gap-1.5 border-emerald-200 bg-white px-2.5 text-emerald-900 hover:bg-emerald-100"
                        >
                          <a
                            href={publishedFacebookUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label="Open published post on Facebook"
                          >
                            <span className="hidden sm:inline">Open post</span>
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </Button>
                      )}
                    </div>
                  )}
                  <PostPreview
                    platform={p.platform as PostPlatform}
                    content={p.content}
                    hashtags={p.hashtags}
                    mediaUrls={p.mediaUrls}
                    brandName={accountNameForPlatform(p.platform)}
                    brandAvatarUrl={company?.logo || undefined}
                    timestamp={p.publishedAt || facebookPublish?.publishedAt}
                    isPublished={p.status === 'published'}
                    metrics={previewMetricsForPost(p)}
                    headerAction={isPublished ? (
                      isPublishedOnFacebook && publishedFacebookUrl ? (
                        <Button
                          asChild
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 shrink-0 gap-1.5 rounded-full border-emerald-200 bg-emerald-50 px-2.5 text-xs font-semibold text-emerald-800 shadow-sm hover:bg-emerald-100 hover:text-emerald-900"
                        >
                          <a
                            href={publishedFacebookUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label="Open published post on Facebook"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">Open</span>
                          </a>
                        </Button>
                      ) : (
                        <Badge className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50">
                          Published
                        </Badge>
                      )
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 shrink-0 gap-1.5 rounded-full border-indigo-200 bg-indigo-50 px-2.5 text-xs font-semibold text-indigo-700 shadow-sm hover:bg-indigo-100 hover:text-indigo-800"
                        onClick={() => openSocialPostEditor(p)}
                      >
                        <FileEdit className="h-3.5 w-3.5" />
                        Edit
                      </Button>
                    )}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog
        open={Boolean(editingSocialPost)}
        onOpenChange={(open) => {
          if (!open) closeSocialPostEditor();
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>Edit social post</DialogTitle>
            <DialogDescription>
              Adjust the message and hashtags before launching. Changes are saved to this campaign.
            </DialogDescription>
          </DialogHeader>

          {editingSocialPost && (
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
              <div className="space-y-4">
                <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                  <div className="text-sm font-medium text-slate-900">
                    {platformLabel(editingSocialPost.platform)}
                  </div>
                  <Badge variant="secondary" className="capitalize">
                    {editingSocialPost.status}
                  </Badge>
                </div>

                {editingSocialPost.status === 'published' && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    This updates the saved copy in 1Person. It will not edit the post already published on Facebook.
                  </div>
                )}

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <label htmlFor="social-post-content" className="text-sm font-semibold text-slate-900">
                      Post text
                    </label>
                    <span className="text-xs text-slate-500">{editingPostContent.trim().length} characters</span>
                  </div>
                  <Textarea
                    id="social-post-content"
                    rows={8}
                    value={editingPostContent}
                    onChange={(event) => setEditingPostContent(event.target.value)}
                    placeholder="Write the message people will see..."
                    className="min-h-[180px] resize-y"
                  />
                  <p className="text-xs text-slate-500">
                    Keep the first line clear and customer-focused. The preview updates on the right.
                  </p>
                </div>

                <div className="space-y-2">
                  <label htmlFor="social-post-hashtags" className="text-sm font-semibold text-slate-900">
                    Hashtags
                  </label>
                  <div className="flex gap-2">
                    <Input
                      id="social-post-hashtags"
                      value={editingHashtagDraft}
                      onChange={(event) => setEditingHashtagDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          addEditingHashtags();
                        }
                      }}
                      placeholder="Add a hashtag, e.g. summer"
                      className="h-10"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10 shrink-0 gap-1.5 bg-white"
                      onClick={addEditingHashtags}
                      disabled={!editingHashtagDraft.trim() || editingPostHashtags.length >= 20}
                    >
                      <Plus className="h-4 w-4" />
                      Add
                    </Button>
                  </div>
                  {editingPostHashtags.length > 0 ? (
                    <div className="flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
                      {editingPostHashtags.map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          className="inline-flex h-8 items-center gap-1 rounded-full bg-white px-3 text-sm font-medium text-slate-800 shadow-sm ring-1 ring-slate-200 hover:bg-slate-100"
                          onClick={() => removeEditingHashtag(tag)}
                          aria-label={`Remove ${tag}`}
                        >
                          {tag}
                          <X className="h-3.5 w-3.5 text-slate-500" />
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
                      No hashtags yet. Add only the tags you want to show under the post.
                    </div>
                  )}
                  <p className="text-xs text-slate-500">
                    Press Enter after typing a hashtag. You can add up to 20 hashtags.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-semibold text-slate-900">Preview</div>
                <div className="rounded-xl bg-slate-50 p-2">
                  <PostPreview
                    platform={editingSocialPost.platform as PostPlatform}
                    content={editingPostContent}
                    hashtags={editingPostHashtags}
                    mediaUrls={editingSocialPost.mediaUrls}
                    brandName={accountNameForPlatform(editingSocialPost.platform)}
                    brandAvatarUrl={company?.logo || undefined}
                    timestamp={editingSocialPost.publishedAt || editingSocialPost.metrics?.facebook?.publishedAt}
                    isPublished={editingSocialPost.status === 'published'}
                    metrics={previewMetricsForPost(editingSocialPost)}
                  />
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={closeSocialPostEditor}
              disabled={savingSocialPostEdit}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={saveSocialPostEdit}
              disabled={savingSocialPostEdit || !editingPostContent.trim()}
            >
              {savingSocialPostEdit ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save changes'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Blog */}
      <div>
        <h2 className="text-lg font-semibold text-slate-900 mb-3 flex items-center gap-2">
          <FileEdit className="w-5 h-5 text-indigo-500" /> Blog
        </h2>
        {blogPost ? (
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div className="min-w-0 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    {blogPost.status && (
                      <Badge variant="secondary" className="capitalize">
                        {blogPost.status}
                      </Badge>
                    )}
                    {blogPost.keyword && (
                      <span className="text-xs text-slate-500">Keyword: {blogPost.keyword}</span>
                    )}
                    {blogPost.wordCount ? (
                      <span className="text-xs text-slate-500">{blogPost.wordCount.toLocaleString()} words</span>
                    ) : null}
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-slate-900 line-clamp-2">{blogPost.title}</h3>
                    <p className="text-sm text-slate-600 mt-1 line-clamp-3">
                      {blogPost.excerpt || blogPost.metaDescription || 'Blog draft is ready for review.'}
                    </p>
                    <p className="mt-2 text-xs text-slate-500">
                      <span className="font-semibold text-slate-700">Role:</span> {blogRole}
                    </p>
                  </div>
                </div>
                <Link href={`/${companyId}/blog/${blogPost.id}`}>
                  <Button size="sm" className="gap-1.5">
                    Review <ExternalLink className="w-3 h-3" />
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="py-8 text-center text-sm text-slate-500">
              {isGenerating ? 'AI is writing the blog draft...' : 'No blog attached to this campaign yet'}
            </CardContent>
          </Card>
        )}
      </div>

      <CampaignPerformanceSection
        campaign={campaign}
        companyId={companyId}
        performance={performanceResponse?.data}
        isRefreshing={performanceSyncing || performanceFetching}
        onRefresh={refreshPerformance}
        facebookReconnectRequired={facebookReconnectRequired}
      />

      <CampaignLearningSection campaign={campaign} companyId={companyId} />

      <Dialog
        open={Boolean(bannerToDelete)}
        onOpenChange={(open) => {
          if (!open && !deletingBannerId) setBannerToDelete(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete this banner?</DialogTitle>
            <DialogDescription>
              It will be removed from this campaign and from any draft social posts using it.
              Posts already published will not be changed.
            </DialogDescription>
          </DialogHeader>
          {bannerToDelete && (
            <div className="rounded-md bg-slate-50 px-3 py-2 text-sm font-medium text-slate-900">
              {bannerToDelete.name}
            </div>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={Boolean(deletingBannerId)}
              onClick={() => setBannerToDelete(null)}
            >
              Keep banner
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="gap-2"
              disabled={Boolean(deletingBannerId)}
              onClick={() => void deleteBanner()}
            >
              {deletingBannerId ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Delete banner
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={videoRegenerateDialogOpen} onOpenChange={setVideoRegenerateDialogOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Create another video</DialogTitle>
            <DialogDescription>
              Tell AI what should be different this time. The new video will be added next to the existing videos.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <label htmlFor="video-creative-notes" className="text-sm font-medium text-slate-900">
              What should this version focus on?
            </label>
            <Textarea
              id="video-creative-notes"
              value={videoCreativeNotes}
              onChange={(event) => setVideoCreativeNotes(event.target.value)}
              placeholder="Example: Make it more emotional, show parents watching kids build robots, use a brighter classroom mood..."
              className="min-h-32 resize-y"
              maxLength={1200}
            />
            <p className="text-xs text-slate-500">
              Optional, but a clear note helps AI create a video that feels different from the current one.
            </p>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              disabled={isVideoWorking}
              onClick={() => setVideoRegenerateDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="gap-1.5"
              disabled={isVideoWorking || !hasEnoughVideoCredits}
              title={!hasEnoughVideoCredits ? 'Not enough credits. Contact support to add more.' : undefined}
              onClick={() => void generateCampaignVideo({
                forceNew: true,
                creativeNotes: videoCreativeNotes,
              })}
            >
              {isVideoWorking ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Wand2 className="h-4 w-4" />
              )}
              Create video · {videoCreditCost} credits
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={videoApplyDialogOpen} onOpenChange={setVideoApplyDialogOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Apply video to social posts</DialogTitle>
            <DialogDescription>
              Choose which draft posts should use this video. The video keeps its current size.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg border border-indigo-100 bg-indigo-50/60 p-3">
            <div className="text-sm font-semibold text-slate-950">
              {selectedVideo?.title || 'Selected video'}
            </div>
            <p className="mt-1 text-xs text-slate-600">
              Applying a new campaign video replaces older campaign videos in the selected draft posts.
            </p>
          </div>

          <div className="space-y-2">
            {availableApplyPlatforms.map((platform) => {
              const preset = SOCIAL_IMAGE_PRESETS[platform];
              const postCount = socialPosts.filter(
                (post) => !isPublishedPost(post)
                  && normalizeSocialImagePlatform(post.platform) === platform,
              ).length;
              const checked = selectedVideoApplyPlatforms.includes(platform);
              return (
                <button
                  key={platform}
                  type="button"
                  className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                    checked
                      ? 'border-indigo-300 bg-indigo-50'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                  onClick={() => toggleVideoApplyPlatform(platform)}
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => toggleVideoApplyPlatform(platform)}
                    onClick={(event) => event.stopPropagation()}
                    aria-label={`Apply video to ${preset.label}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-slate-900">{preset.label}</div>
                    <div className="text-sm text-slate-500">
                      {postCount} {postCount === 1 ? 'draft post' : 'draft posts'}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              disabled={savingPostVideo}
              onClick={() => setVideoApplyDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="gap-1.5"
              disabled={
                savingPostVideo
                || !selectedVideo
                || selectedVideoApplyPlatforms.length === 0
              }
              onClick={applySelectedVideoToPosts}
            >
              {savingPostVideo ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Clapperboard className="h-4 w-4" />
              )}
              Apply video
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={applyDialogOpen} onOpenChange={setApplyDialogOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Apply images to social posts</DialogTitle>
            <DialogDescription>
              Choose which draft posts will use these images. Published posts stay unchanged and can only be edited on their social platform.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            {availableApplyPlatforms.map((platform) => {
              const preset = SOCIAL_IMAGE_PRESETS[platform];
              const postCount = socialPosts.filter(
                (post) => !isPublishedPost(post)
                  && normalizeSocialImagePlatform(post.platform) === platform,
              ).length;
              const checked = selectedApplyPlatforms.includes(platform);
              return (
                <button
                  key={platform}
                  type="button"
                  className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                    checked
                      ? 'border-indigo-300 bg-indigo-50'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                  onClick={() => toggleApplyPlatform(platform)}
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => toggleApplyPlatform(platform)}
                    onClick={(event) => event.stopPropagation()}
                    aria-label={`Apply images to ${preset.label}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-slate-900">{preset.label}</div>
                    <div className="text-sm text-slate-500">
                      {postCount} {postCount === 1 ? 'post' : 'posts'} · {preset.size}
                    </div>
                  </div>
                  <div
                    className={`w-14 shrink-0 rounded border border-slate-300 bg-white shadow-sm ${preset.shapeClassName}`}
                    aria-hidden="true"
                  />
                </button>
              );
            })}
          </div>

          <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
            {`${selectedBannerIds.length} selected ${selectedBannerIds.length === 1 ? 'image' : 'images'} will be prepared for each chosen platform.`}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              disabled={savingPostMedia}
              onClick={() => setApplyDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="gap-1.5"
              disabled={
                savingPostMedia
                || selectedBannerIds.length === 0
                || selectedApplyPlatforms.length === 0
              }
              onClick={applySelectedBannersToPosts}
            >
              {savingPostMedia ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ImageIcon className="h-4 w-4" />
              )}
              Resize and apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={launchDialogOpen} onOpenChange={setLaunchDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Ready to launch</DialogTitle>
            <DialogDescription>
              Choose which reviewed campaign items should move forward now. Website and ad platform publishing stay explicit so nothing goes live by surprise.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="rounded-lg border border-indigo-100 bg-indigo-50/60 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-slate-950">Launch readiness</div>
                  <p className="text-xs text-slate-600">
                    A quick check before moving reviewed assets forward.
                  </p>
                </div>
                <Badge className="bg-white text-indigo-700">
                  {readinessReadyCount}/{readinessItems.length} ready
                </Badge>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {readinessItems.map((item) => (
                  <div key={item.label} className="flex gap-2 rounded-md bg-white/85 p-2.5">
                    {item.state === 'ready' ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    ) : (
                      <AlertCircle className={cn(
                        'mt-0.5 h-4 w-4 shrink-0',
                        item.state === 'missing' ? 'text-red-500' : 'text-amber-500',
                      )} />
                    )}
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-900">{item.label}</div>
                      <p className="text-xs text-slate-500">{item.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  {blogPost ? (
                    <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" />
                  ) : (
                    <AlertCircle className="mt-0.5 h-5 w-5 text-amber-600" />
                  )}
                  <div>
                    <div className="text-sm font-semibold text-slate-900">Blog draft</div>
                    <p className="mt-0.5 text-sm text-slate-600">
                      {blogPost
                        ? blogPost.title
                        : 'No blog is attached to this campaign yet.'}
                    </p>
                  </div>
                </div>
                {blogPost && (
                  <Link href={`/${companyId}/blog/${blogPost.id}`}>
                    <Button size="sm" variant="outline" className="gap-1.5">
                      Review <ExternalLink className="h-3 w-3" />
                    </Button>
                  </Link>
                )}
              </div>
            </div>

            <label className={`flex items-start gap-3 rounded-lg border p-3 ${selectedBannerIds.length > 0 ? 'border-slate-200' : 'border-slate-200 bg-slate-50'}`}>
              <Checkbox
                checked={shouldActivateBanners}
                disabled={selectedBannerIds.length === 0}
                onCheckedChange={(checked) => setLaunchActivateBanners(checked === true)}
                className="mt-0.5"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-900">Activate banners</span>
                  <Badge variant="secondary">
                    {selectedLaunchBannerCount} selected
                  </Badge>
                </div>
                <p className="mt-0.5 text-sm text-slate-600">
                  {selectedBannerIds.length > 0
                    ? 'Selected banners will become active campaign assets.'
                    : 'Select a banner above if you want to activate it.'}
                </p>
              </div>
            </label>

            <div className="rounded-lg border border-slate-200">
              <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-3 py-2.5">
                <div>
                  <div className="text-sm font-semibold text-slate-900">Social posts</div>
                  <p className="text-xs text-slate-500">Select only the posts you want to move forward.</p>
                </div>
                <Badge variant="secondary">
                  {selectedLaunchPosts.length} of {socialPosts.length}
                </Badge>
              </div>

              {socialPosts.length === 0 ? (
                <div className="px-3 py-5 text-center text-sm text-slate-500">
                  No social posts are ready.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {socialPosts.map((post) => {
                    const platform = post.platform.toLowerCase();
                    const isFacebook = platform === 'facebook' || platform === 'fb';
                    const isPublished = post.status === 'published';
                    const needsFacebookConnection = isFacebook && !hasFacebookPageConnection;
                    const isDisabled = isPublished || needsFacebookConnection;
                    const platformName = isFacebook
                      ? 'Facebook'
                      : platform === 'instagram' || platform === 'ig'
                        ? 'Instagram'
                        : platform === 'linkedin' || platform === 'li'
                          ? 'LinkedIn'
                          : post.platform;
                    const actionLabel = isPublished
                      ? 'Already published'
                      : needsFacebookConnection
                        ? 'Connect a Facebook Page first'
                        : isFacebook
                          ? 'Publish to Facebook Page'
                          : 'Add to publishing queue';

                    return (
                      <div
                        key={post.id}
                        className={`flex gap-3 px-3 py-3 ${isDisabled ? 'cursor-not-allowed bg-slate-50' : 'cursor-pointer hover:bg-slate-50'}`}
                        onClick={() => {
                          if (!isDisabled) toggleLaunchPost(post.id);
                        }}
                      >
                        <Checkbox
                          checked={selectedLaunchPostIds.includes(post.id)}
                          disabled={isDisabled}
                          onCheckedChange={() => {
                            if (!isDisabled) toggleLaunchPost(post.id);
                          }}
                          onClick={(event) => event.stopPropagation()}
                          className="mt-0.5"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-slate-900">{platformName}</span>
                            <Badge
                              variant="secondary"
                              className={
                                isFacebook
                                  ? 'bg-blue-50 text-blue-700'
                                  : platform === 'instagram' || platform === 'ig'
                                    ? 'bg-pink-50 text-pink-700'
                                    : 'bg-sky-50 text-sky-700'
                              }
                            >
                              {actionLabel}
                            </Badge>
                          </div>
                          <p className="mt-1 line-clamp-2 text-sm text-slate-600">
                            {post.content}
                          </p>
                          {post.mediaUrls?.length ? (
                            <span className="mt-1 block text-xs text-slate-500">
                              {post.mediaUrls.length} attached image{post.mediaUrls.length === 1 ? '' : 's'}
                            </span>
                          ) : null}
                          {isPublished && facebookPostUrl(post) && (
                            <Button asChild type="button" size="sm" variant="outline" className="mt-2 h-8 gap-1.5 bg-white">
                              <a
                                href={facebookPostUrl(post)!}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(event) => event.stopPropagation()}
                              >
                                Open on Facebook <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {!hasFacebookPageConnection && socialPosts.some((post) => {
                const platform = post.platform.toLowerCase();
                return platform === 'facebook' || platform === 'fb';
              }) && (
                <div className="flex items-center justify-between gap-3 border-t border-amber-200 bg-amber-50 px-3 py-2.5">
                  <p className="text-xs text-amber-900">
                    Facebook needs a connected Page before it can publish.
                  </p>
                  <Link href={`/${companyId}/channels`}>
                    <Button type="button" size="sm" variant="outline" className="h-8 bg-white">
                      Connect Page
                    </Button>
                  </Link>
                </div>
              )}
            </div>

            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <div className="font-semibold">Publishing note</div>
              <p className="mt-1">
                Facebook posts publish immediately when a Page is connected. Instagram and LinkedIn posts are prepared in the publishing queue until those channel publishers are connected. WordPress publishing stays in the blog review screen.
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setLaunchDialogOpen(false)}
              disabled={launchPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="gap-2 bg-green-600 hover:bg-green-700"
              onClick={onLaunch}
              disabled={!canSubmitLaunch}
            >
              {launchPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Launch selected items
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ImglyBannerEditor
        open={!!editingBanner}
        companyId={companyId}
        banner={editingBanner}
        token={token}
        onOpenChange={(open) => {
          if (!open) setEditingBanner(null);
        }}
        onSaved={(savedBanner) => {
          queryClient.setQueryData<DetailResponse>(
            ['campaign', companyId, campaignId],
            (current) => {
              if (!current) return current;
              return {
                ...current,
                banners: current.banners.map((banner) =>
                  banner.id === savedBanner.id
                    ? { ...banner, ...savedBanner }
                    : banner,
                ),
              };
            },
          );
          setEditingBanner(null);
          void queryClient.invalidateQueries({
            queryKey: ['campaign', companyId, campaignId],
          });
        }}
      />
    </div>
  );
}
