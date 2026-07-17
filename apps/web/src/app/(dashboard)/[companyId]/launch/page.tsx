'use client';

/**
 * Campaign Launcher — Block 8.
 *
 * Wizard at the top (keyword + targets) -> kick off a launch. Below:
 * live progress for the latest launch + a collapsible history.
 *
 * The launcher is the single "one-click" surface for the founder: pick
 * a keyword, choose outputs, get a blog draft + images +
 * social drafts + GEO seed in one go.
 */

import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Rocket,
  Loader2,
  CheckCircle2,
  Circle,
  AlertTriangle,
  XCircle,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Sparkles,
  FileEdit,
  Lightbulb,
  RefreshCw,
  Target,
  ImagePlus,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import {
  useLaunches,
  useLaunch,
  useLaunchSuggestions,
  useStartLaunch,
  type LaunchSuggestion,
  type LaunchStep,
  type LaunchStepStatus,
  type CampaignLaunch,
} from '@/lib/api/launches-hooks';
import { useBrandIq } from '@/lib/api/brand-iq-hooks';
import { api } from '@/lib/api/client';
import { useAuthStore } from '@/stores/auth-store';
import { ImglyBannerEditor } from '@/components/marketing/imgly-banner-editor';
import {
  DriveSourcePicker,
  driveSourceRequestBody,
  type DriveSourceSelection,
} from '@/components/marketing/drive-source-picker';

const CAMPAIGN_FOCUS_MAX_LENGTH = 1200;

const STATUS_ICON: Record<LaunchStepStatus, { icon: typeof CheckCircle2; color: string }> = {
  pending: { icon: Circle, color: 'text-slate-300' },
  running: { icon: Loader2, color: 'text-blue-500 animate-spin' },
  done: { icon: CheckCircle2, color: 'text-emerald-600' },
  skipped: { icon: AlertTriangle, color: 'text-amber-500' },
  error: { icon: XCircle, color: 'text-rose-600' },
};

function isLaunchActive(launch?: CampaignLaunch | null) {
  return launch?.status === 'queued' || launch?.status === 'running';
}

function StepRow({ step }: { step: LaunchStep }) {
  const [open, setOpen] = useState(false);
  const meta = STATUS_ICON[step.status];
  const Icon = meta.icon;
  const hasDetail = !!step.result || !!step.error || !!step.message;
  return (
    <div className="border-l-2 pl-3 py-1.5" style={{ borderColor: step.status === 'done' ? '#10b98180' : step.status === 'error' ? '#e11d4880' : '#e2e8f0' }}>
      <button
        className="flex items-start gap-2 text-left w-full"
        onClick={() => hasDetail && setOpen(!open)}
      >
        <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${meta.color}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{step.label}</span>
            <Badge variant="outline" className="text-[10px] capitalize">
              {step.status}
            </Badge>
            {hasDetail && (open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />)}
          </div>
          {step.message && <p className="text-xs text-muted-foreground mt-0.5">{step.message}</p>}
          {step.error && <p className="text-xs text-rose-600 mt-0.5">{step.error}</p>}
        </div>
      </button>
      {open && step.result && (
        <div className="mt-1.5 ml-6 bg-muted/40 rounded p-2 text-xs">
          <pre className="whitespace-pre-wrap break-words">{JSON.stringify(step.result, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}

type BannerRecord = {
  id: string;
  companyId?: string;
  name: string;
  status: string;
  size: string;
  imageUrl?: string | null;
  copy?: {
    headline?: string;
    subheadline?: string;
    cta?: string;
  } | null;
  design?: {
    backgroundValue?: string;
    imglyScene?: string;
    colorTheme?: {
      text?: string;
      ctaBg?: string;
      ctaText?: string;
    };
  } | null;
};

function bannerAspectRatio(size?: string | null) {
  const [rawWidth, rawHeight] = (size || '1200x628').split('x').map(Number);
  const width = Number.isFinite(rawWidth) && rawWidth > 0 ? rawWidth : 1200;
  const height = Number.isFinite(rawHeight) && rawHeight > 0 ? rawHeight : 628;
  return `${width} / ${height}`;
}

type CampaignSocialPost = {
  id: string;
  platform: string;
  content: string;
};

type UploadedCampaignImage = {
  id: string;
  name: string;
  url: string;
  mimeType?: string | null;
};

function BannerLaunchReview({ companyId, campaignId }: { companyId: string; campaignId: string }) {
  const token = useAuthStore((s) => s.token);
  const [banners, setBanners] = useState<BannerRecord[]>([]);
  const [socialPosts, setSocialPosts] = useState<CampaignSocialPost[]>([]);
  const [socialIntro, setSocialIntro] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [editingBanner, setEditingBanner] = useState<BannerRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    if (!token || !companyId || !campaignId) return;
    let cancelled = false;
    setLoading(true);
    api.get<{ banners: BannerRecord[]; socialPosts: CampaignSocialPost[] }>(`/campaigns/${companyId}/${campaignId}`, { token })
      .then((res) => {
        if (cancelled) return;
        const rows = res.banners || [];
        const posts = res.socialPosts || [];
        setBanners(rows);
        setSocialPosts(posts);
        setSocialIntro(posts[0]?.content || '');
        setSelected(rows.map((b) => b.id));
      })
      .catch((e) => toast.error((e as Error).message || 'Failed to load banner drafts'))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [campaignId, companyId, token]);

  const toggle = (id: string) => {
    setSelected((current) => (
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    ));
  };

  const publishSelected = async () => {
    if (!token) return;
    if (selected.length === 0) {
      toast.error('Select at least one banner to publish.');
      return;
    }
    setPublishing(true);
    try {
      if (socialPosts.length > 0) {
        const intro = socialIntro.trim();
        if (!intro) {
          toast.error('Add social post text before publishing.');
          return;
        }
        const selectedImageUrls = banners
          .filter((banner) => selected.includes(banner.id))
          .map((banner) => banner.imageUrl)
          .filter((url): url is string => Boolean(url));
        await Promise.all(socialPosts.map((post) => (
          api.patch(
            `/marketing/company/${companyId}/posts/${post.id}`,
            {
              content: intro,
              ...(selectedImageUrls.length > 0 ? { mediaUrls: selectedImageUrls } : {}),
            },
            { token },
          )
        )));
      }
      await Promise.all(selected.map((id) => (
        api.post(`/marketing/company/${companyId}/banners/${id}/approve`, {}, { token })
      )));
      await api.post(`/marketing/company/${companyId}/campaigns/${campaignId}/launch`, {}, { token });
      toast.success('Selected banners were approved and pushed to social.');
      const refreshed = await api.get<{ banners: BannerRecord[] }>(`/campaigns/${companyId}/${campaignId}`, { token });
      setBanners(refreshed.banners || []);
    } catch (e) {
      toast.error((e as Error).message || 'Failed to publish selected banners');
    } finally {
      setPublishing(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-lg border p-4 text-sm text-muted-foreground flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading banner drafts...
      </div>
    );
  }

  if (banners.length === 0) return null;

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-sm font-semibold">Advertising banner drafts</div>
          <p className="text-xs text-muted-foreground">Select the banners you want to approve and push to the selected social channels.</p>
        </div>
        <Button size="sm" onClick={publishSelected} disabled={publishing} className="gap-2">
          {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
          Approve & Publish
        </Button>
      </div>

      <div className="space-y-1.5">
        <Label>Social post text</Label>
        <Textarea
          value={socialIntro}
          onChange={(event) => setSocialIntro(event.target.value)}
          rows={4}
          maxLength={500}
          placeholder="Write the text that will appear with the selected advertising banner on social posts."
        />
        <p className="text-[11px] text-muted-foreground">
          This text is posted together with the selected advertising banner on the chosen social channels.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {banners.map((banner) => {
          const isSelected = selected.includes(banner.id);
          const bg = banner.design?.backgroundValue || 'linear-gradient(135deg, #0f766e, #f59e0b)';
          const text = banner.design?.colorTheme?.text || '#ffffff';
          const ctaBg = banner.design?.colorTheme?.ctaBg || '#ffffff';
          const ctaText = banner.design?.colorTheme?.ctaText || '#111827';
          return (
            <div
              key={banner.id}
              role="button"
              tabIndex={0}
              onClick={() => toggle(banner.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') toggle(banner.id);
              }}
              className={`rounded-lg border p-2 text-left transition-colors ${
                isSelected ? 'border-primary bg-primary/5' : 'hover:bg-muted/40'
              }`}
            >
              <div className="relative h-44 w-full overflow-hidden rounded-md bg-[linear-gradient(45deg,#f8fafc_25%,transparent_25%),linear-gradient(-45deg,#f8fafc_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#f8fafc_75%),linear-gradient(-45deg,transparent_75%,#f8fafc_75%)] bg-[length:18px_18px] bg-[position:0_0,0_9px,9px_-9px,-9px_0px]">
                {banner.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={banner.imageUrl} alt={banner.name} className="h-full w-full object-contain" />
                ) : (
                  <div
                    className="flex h-full w-full flex-col justify-center gap-2 bg-cover bg-center p-4"
                    style={{
                      aspectRatio: bannerAspectRatio(banner.size),
                      background: bg,
                      color: text,
                    }}
                  >
                    <>
                      <div className="text-base font-bold leading-tight">{banner.copy?.headline || banner.name}</div>
                      {banner.copy?.subheadline && <div className="text-[11px] leading-snug opacity-90">{banner.copy.subheadline}</div>}
                      <span
                        className="mt-1 w-fit rounded px-2 py-1 text-[10px] font-semibold"
                        style={{ backgroundColor: ctaBg, color: ctaText }}
                      >
                        {banner.copy?.cta || 'Learn More'}
                      </span>
                    </>
                  </div>
                )}
                {isSelected && (
                  <div className="absolute right-2 top-2 rounded-full bg-white/90 px-2 py-1 text-[10px] font-medium text-primary shadow-sm">
                    Selected
                  </div>
                )}
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <Badge variant={isSelected ? 'default' : 'outline'} className="flex items-center gap-1 text-[10px] leading-none">
                  {isSelected && <CheckCircle2 className="mb-[1px] h-3 w-3 shrink-0" />}
                  <span>{banner.size}</span>
                </Badge>
                <span className="text-[10px] text-muted-foreground capitalize">{banner.status}</span>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-2 w-full"
                onClick={(event) => {
                  event.stopPropagation();
                  setEditingBanner(banner);
                }}
              >
                Edit image
              </Button>
            </div>
          );
        })}
      </div>

      <ImglyBannerEditor
        open={!!editingBanner}
        companyId={companyId}
        banner={editingBanner}
        token={token}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setEditingBanner(null);
        }}
        onSaved={(updated) => {
          setBanners((current) => current.map((banner) => (
            banner.id === updated.id ? { ...banner, ...updated } : banner
          )));
          setEditingBanner(null);
        }}
      />
    </div>
  );
}

function LaunchProgress({ launch }: { launch: CampaignLaunch }) {
  const imageStep = launch.steps.find((s) => s.key === 'images');
  const inContentUrls = (imageStep?.result?.inContentUrls as string[] | undefined) ?? [];
  const allImages = [launch.heroImageUrl, ...inContentUrls].filter(Boolean) as string[];
  const imageSource = imageStep?.result?.source === 'uploaded_assets' ? 'Campaign images' : 'Generated images';
  const bannerCampaignId = (
    launch.steps.find((s) => s.key === 'banners')?.result?.campaignId
    ?? launch.steps.find((s) => s.key === 'banner_campaign')?.result?.campaignId
  ) as string | undefined;
  const bannerStep = launch.steps.find((s) => s.key === 'banners');
  const bannerCount = (bannerStep?.result?.bannerIds as string[] | undefined)?.length
    ?? (bannerStep?.result?.banners as unknown[] | undefined)?.length
    ?? 0;
  const socialCount = launch.steps.filter((s) => (
    s.key.startsWith('social_') && (s.status === 'done' || s.status === 'skipped')
  )).length;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Rocket className="w-4 h-4 text-primary" /> Launch · {launch.keyword}
          </CardTitle>
          <Badge
            variant="outline"
            className={
              launch.status === 'completed'
                ? 'border-emerald-300 text-emerald-700 bg-emerald-50'
                : launch.status === 'failed'
                  ? 'border-rose-300 text-rose-700 bg-rose-50'
                  : launch.status === 'partial'
                    ? 'border-amber-300 text-amber-700 bg-amber-50'
                    : 'border-blue-300 text-blue-700 bg-blue-50'
            }
          >
            {launch.status}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          Started {new Date(launch.createdAt).toLocaleString()}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1">
          {launch.steps.map((s) => (
            <StepRow key={s.key} step={s} />
          ))}
        </div>

        {allImages.length > 0 && (
          <div>
            <div className="text-xs font-semibold text-muted-foreground mb-1.5">{imageSource}</div>
            <div className="grid grid-cols-3 gap-2">
              {allImages.map((u) => (
                <a key={u} href={u} target="_blank" rel="noreferrer" className="block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u} alt="" className="w-full h-24 object-cover rounded border" />
                </a>
              ))}
            </div>
          </div>
        )}

        {bannerCampaignId && (
          <div className="rounded-lg border bg-muted/20 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <div className="text-sm font-semibold truncate">Launch: {launch.keyword}</div>
                <p className="text-xs text-muted-foreground">
                  {bannerStep?.status === 'done'
                    ? `Created ${bannerCount || 3} editable advertising banners`
                    : 'Campaign draft created'}
                  {launch.blogPostId ? ' + 1 blog draft' : ''}
                  {socialCount ? ` + ${socialCount} social draft${socialCount > 1 ? 's' : ''}` : ''}.
                </p>
              </div>
              <Link href={`/${launch.companyId}/campaigns/${bannerCampaignId}`}>
                <Button size="sm" className="gap-1">
                  Review <ExternalLink className="w-3 h-3" />
                </Button>
              </Link>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 flex-wrap pt-2 border-t">
          {launch.blogPostId && (
            <Badge variant="secondary" className="gap-1">
              <FileEdit className="w-3 h-3" /> Blog draft saved
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function LaunchPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const searchParams = useSearchParams();
  const appliedGrowthPlanPrefill = useRef('');
  const token = useAuthStore((s) => s.token);
  const [keyword, setKeyword] = useState('');
  const [brief, setBrief] = useState('');
  const [selectedSuggestionId, setSelectedSuggestionId] = useState<string | null>(null);
  const [sourceSelection, setSourceSelection] = useState<DriveSourceSelection>({});
  const [imageMode, setImageMode] = useState<'ai' | 'uploaded'>('ai');
  const [campaignImages, setCampaignImages] = useState<UploadedCampaignImage[]>([]);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [targets, setTargets] = useState({
    wordpress: false,
    facebook: false,
    linkedin: true,
    instagram: false,
  });
  const [activeLaunchId, setActiveLaunchId] = useState<string | null>(null);
  const [optimisticRunningLaunchId, setOptimisticRunningLaunchId] = useState<string | null>(null);

  const start = useStartLaunch(companyId);
  const list = useLaunches(companyId);
  const detail = useLaunch(companyId, activeLaunchId);
  const suggestions = useLaunchSuggestions(companyId);
  const brandIq = useBrandIq(companyId);
  const growthPlanPrefillKey = searchParams.toString();

  useEffect(() => {
    if (searchParams.get('source') !== 'growth-plan') return;
    if (appliedGrowthPlanPrefill.current === growthPlanPrefillKey) return;
    appliedGrowthPlanPrefill.current = growthPlanPrefillKey;

    const prefillKeyword = searchParams.get('keyword')?.trim();
    const prefillBrief = searchParams.get('brief')?.trim();
    if (prefillKeyword) setKeyword(prefillKeyword);
    if (prefillBrief) setBrief(prefillBrief.slice(0, 1200));
    setSelectedSuggestionId(null);
    toast.info('Growth Plan idea loaded. Review it, then start the launch.');
  }, [growthPlanPrefillKey, searchParams]);

  // When the list refreshes and we have no active launch, auto-pick the latest
  useEffect(() => {
    if (!activeLaunchId && list.data && list.data.length > 0) {
      const sorted = [...list.data].sort((a, b) => (
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ));
      const runningLaunch = sorted.find(isLaunchActive);
      setActiveLaunchId((runningLaunch ?? sorted[0])!.id);
    }
  }, [activeLaunchId, list.data]);

  useEffect(() => {
    if (!optimisticRunningLaunchId) return;
    if (detail.data?.id !== optimisticRunningLaunchId) return;
    if (isLaunchActive(detail.data)) return;
    setOptimisticRunningLaunchId(null);
  }, [detail.data, optimisticRunningLaunchId]);

  const launchInProgress = start.isPending
    || !!optimisticRunningLaunchId
    || isLaunchActive(detail.data);

  const uploadCampaignImages = async (files: FileList | null) => {
    if (!files?.length || !token) return;
    const remainingSlots = 3 - campaignImages.length;
    if (remainingSlots <= 0) {
      toast.error('You can upload up to 3 campaign images.');
      return;
    }
    const selectedFiles = Array.from(files).slice(0, remainingSlots);
    const validFiles = selectedFiles.filter((file) => {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
        toast.error(`${file.name} must be JPG, PNG, or WebP.`);
        return false;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast.error(`${file.name} is too large. Use an image under 10MB.`);
        return false;
      }
      return true;
    });
    if (validFiles.length === 0) return;

    setUploadingImages(true);
    try {
      const uploaded: UploadedCampaignImage[] = [];
      for (const file of validFiles) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('name', file.name.replace(/\.[^/.]+$/, ''));
        formData.append('tags', JSON.stringify(['campaign-launcher', 'campaign-image']));
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8004/api/v1'}/assets-library/company/${companyId}/upload`,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: formData,
          },
        );
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data?.message || data?.error || `Failed to upload ${file.name}`);
        }
        if (data?.data?.id && data?.data?.url) {
          uploaded.push({
            id: data.data.id,
            name: data.data.name || file.name,
            url: data.data.url,
            mimeType: data.data.mimeType,
          });
        }
      }
      if (uploaded.length > 0) {
        setCampaignImages((current) => [...current, ...uploaded].slice(0, 3));
        setImageMode('uploaded');
        toast.success(uploaded.length === 1 ? 'Image uploaded' : `${uploaded.length} images uploaded`);
      }
    } catch (error) {
      toast.error((error as Error).message || 'Failed to upload campaign images');
    } finally {
      setUploadingImages(false);
    }
  };

  const removeCampaignImage = (assetId: string) => {
    setCampaignImages((current) => current.filter((image) => image.id !== assetId));
  };

  const submit = async () => {
    if (launchInProgress) {
      toast.error('A launch is already running. Please wait for it to finish.');
      return;
    }
    if (keyword.trim().length < 3) {
      toast.error('Keyword needs at least 3 characters');
      return;
    }
    if (keyword.trim().length > CAMPAIGN_FOCUS_MAX_LENGTH) {
      toast.error(`Campaign focus must be ${CAMPAIGN_FOCUS_MAX_LENGTH} characters or less.`);
      return;
    }
    if (imageMode === 'uploaded' && campaignImages.length === 0) {
      toast.error('Upload at least one image or switch back to AI-generated images.');
      return;
    }
    const launchTargets = { ...targets, wordpress: false };
    try {
      const res = await start.mutateAsync({
        keyword: keyword.trim(),
        brief: brief.trim() || undefined,
        ...driveSourceRequestBody(sourceSelection),
        imageMode,
        assetIds: imageMode === 'uploaded' ? campaignImages.map((image) => image.id) : undefined,
        targets: launchTargets,
      });
      setActiveLaunchId(res.data.launchId);
      setOptimisticRunningLaunchId(res.data.launchId);
      setKeyword('');
      setBrief('');
      setSelectedSuggestionId(null);
      setSourceSelection({});
      setImageMode('ai');
      setCampaignImages([]);
      toast.success('Launch queued. Watch the progress below.');
    } catch (e) {
      toast.error((e as Error).message || 'Failed to start launch');
    }
  };

  const noBrand = !brandIq.isLoading && !brandIq.data;
  const outputOptions = [
    { key: 'linkedin' as const, label: 'LinkedIn draft' },
    { key: 'facebook' as const, label: 'Facebook draft' },
    { key: 'instagram' as const, label: 'Instagram draft' },
  ];
  const selectedSocialCount = outputOptions.filter((option) => targets[option.key]).length;

  const applySuggestion = (suggestion: LaunchSuggestion) => {
    setKeyword(suggestion.keyword);
    setBrief(suggestion.brief);
    setSelectedSuggestionId(suggestion.id);
  };

  const refreshSuggestions = async () => {
    await suggestions.refetch();
    setSelectedSuggestionId(null);
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto p-1">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Rocket className="w-6 h-6 text-primary" /> Campaign Launcher
        </h1>
        <p className="text-muted-foreground text-sm">
          One keyword in, full multi-channel campaign out: blog draft + images + social
          drafts + GEO tracking — orchestrated by your AI team.
        </p>
      </div>

      {noBrand && (
        <Card className="border-amber-200 bg-amber-50/40">
          <CardContent className="p-3 flex items-center gap-3 flex-wrap">
            <Sparkles className="w-5 h-5 text-amber-600 shrink-0" />
            <p className="text-sm text-amber-900 flex-1 min-w-[200px]">
              No Brand IQ profile yet. Open Brand IQ once and AI will build it automatically from
              your existing company data.
            </p>
            <Link href={`/${companyId}/brand-iq`}>
              <Button size="sm" variant="outline" className="gap-1">
                Build Brand IQ
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Start a launch</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <Label className="flex items-center gap-1.5">
                  <Lightbulb className="h-4 w-4 text-amber-500" />
                  Suggested for your business
                </Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  Choose an idea and AI will fill in the campaign focus and instructions for you.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 shrink-0 gap-1.5 px-2"
                disabled={suggestions.isFetching}
                onClick={refreshSuggestions}
              >
                {suggestions.isFetching ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                Refresh
              </Button>
            </div>

            {suggestions.isLoading ? (
              <div className="space-y-2" aria-label="Loading campaign suggestions">
                {[0, 1, 2].map((item) => (
                  <div key={item} className="h-20 animate-pulse rounded-lg border bg-muted/30" />
                ))}
              </div>
            ) : suggestions.data?.suggestions.length ? (
              <div className="space-y-2">
                {suggestions.data.suggestions.map((suggestion) => {
                  const selected = selectedSuggestionId === suggestion.id;
                  return (
                    <button
                      key={suggestion.id}
                      type="button"
                      className={`w-full rounded-lg border p-3 text-left transition-colors ${
                        selected
                          ? 'border-indigo-300 bg-indigo-50'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                      }`}
                      onClick={() => applySuggestion(suggestion)}
                    >
                      <div className="flex items-start gap-3">
                        <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                          selected ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {selected ? (
                            <CheckCircle2 className="h-4 w-4" />
                          ) : (
                            <Target className="h-4 w-4" />
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-slate-900">
                            {suggestion.title}
                          </span>
                          <span className="mt-0.5 block text-xs text-slate-600">
                            For {suggestion.audience}
                          </span>
                          <span className="mt-1 block text-xs text-slate-500">
                            {suggestion.reason}
                          </span>
                        </span>
                        <span className="shrink-0 text-xs font-medium text-indigo-600">
                          {selected ? 'Selected' : 'Use idea'}
                        </span>
                      </div>
                    </button>
                  );
                })}
                <p className="px-1 text-[11px] text-muted-foreground">
                  {suggestions.data.contextSummary}
                </p>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed p-3">
                <p className="text-sm text-muted-foreground">
                  Suggestions are temporarily unavailable. You can still enter your own campaign focus.
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={refreshSuggestions}
                >
                  Try again
                </Button>
              </div>
            )}
          </div>

          <div>
            <Label>
              Campaign focus <span className="text-red-500">*</span>
            </Label>
            <Textarea
              value={keyword}
              onChange={(e) => {
                setKeyword(e.target.value);
                setSelectedSuggestionId(null);
              }}
              placeholder="What should customers discover or search for?"
              rows={3}
              className="mt-1 resize-none"
            />
            <div className="mt-1 flex items-center justify-between gap-3 text-[11px]">
              <p className="text-muted-foreground">
                This becomes the main topic for the blog, banners, social posts, and search tracking.
              </p>
              <span className={keyword.length > CAMPAIGN_FOCUS_MAX_LENGTH ? 'text-red-600' : 'text-muted-foreground'}>
                {keyword.length}/{CAMPAIGN_FOCUS_MAX_LENGTH}
              </span>
            </div>
          </div>

          <div>
            <Label>What should the campaign say? (optional)</Label>
            <Textarea
              value={brief}
              onChange={(e) => {
                setBrief(e.target.value);
                setSelectedSuggestionId(null);
              }}
              rows={4}
              placeholder="Who is this for, what value should we highlight, and what should they do next?"
              className="mt-1"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Plain language is enough. AI will turn it into complete campaign content.
            </p>
          </div>

          <DriveSourcePicker
            companyId={companyId}
            token={token}
            value={sourceSelection}
            onChange={setSourceSelection}
          />

          <div className="space-y-3">
            <div>
              <Label className="flex items-center gap-1.5">
                <ImagePlus className="h-4 w-4 text-primary" />
                Campaign images
              </Label>
              <p className="mt-1 text-xs text-muted-foreground">
                Use AI images, or upload up to 3 of your own. Uploaded images become banner backgrounds and blog illustrations.
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setImageMode('ai')}
                className={`rounded-lg border p-3 text-left transition-colors ${
                  imageMode === 'ai'
                    ? 'border-indigo-300 bg-indigo-50'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <span className="flex items-center gap-2 text-sm font-semibold">
                  {imageMode === 'ai' ? <CheckCircle2 className="h-4 w-4 text-indigo-600" /> : <Sparkles className="h-4 w-4 text-slate-500" />}
                  AI creates images
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  Best when you do not have ready campaign photos.
                </span>
              </button>

              <label
                onClick={() => setImageMode('uploaded')}
                className={`cursor-pointer rounded-lg border p-3 transition-colors ${
                  imageMode === 'uploaded'
                    ? 'border-indigo-300 bg-indigo-50'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                } ${campaignImages.length >= 3 || uploadingImages ? 'cursor-not-allowed opacity-70' : ''}`}
              >
                <span className="flex items-center gap-2 text-sm font-semibold">
                  {imageMode === 'uploaded' ? <CheckCircle2 className="h-4 w-4 text-indigo-600" /> : <UploadCloud className="h-4 w-4 text-slate-500" />}
                  Use my images
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  JPG, PNG, or WebP. Max 3 images, 10MB each.
                </span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  multiple
                  className="hidden"
                  disabled={campaignImages.length >= 3 || uploadingImages}
                  onChange={(event) => {
                    void uploadCampaignImages(event.target.files);
                    event.target.value = '';
                  }}
                />
              </label>
            </div>

            {campaignImages.length > 0 && (
              <div className="grid gap-2 sm:grid-cols-3">
                {campaignImages.map((image, index) => (
                  <div key={image.id} className="overflow-hidden rounded-lg border bg-white">
                    <div className="relative aspect-[16/10] bg-slate-100">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={image.url} alt={image.name} className="h-full w-full object-cover" />
                      <Badge className="absolute left-2 top-2 bg-white/90 text-slate-700 hover:bg-white">
                        {index === 0 ? 'Main' : `Image ${index + 1}`}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between gap-2 p-2">
                      <span className="truncate text-xs text-slate-600">{image.name}</span>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 shrink-0 text-slate-500 hover:text-rose-600"
                        onClick={() => removeCampaignImage(image.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {uploadingImages && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Uploading images...
              </div>
            )}
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <Label>Social outputs</Label>
              <span className="text-xs text-muted-foreground">
                {selectedSocialCount === 0
                  ? 'No social drafts selected'
                  : `${selectedSocialCount} selected`}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {outputOptions.map((t) => (
                <label
                  key={t.key}
                  className="flex items-center justify-between rounded-lg border p-2.5 cursor-pointer hover:bg-muted/40"
                >
                  <span className="text-sm">{t.label}</span>
                  <Switch
                    checked={targets[t.key]}
                    onCheckedChange={(v) => setTargets((s) => ({ ...s, [t.key]: v }))}
                  />
                </label>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground mt-2 hidden">
              All publishes go out as <em>drafts</em> — you review on each platform before they go
              live. Website publishing happens from the blog review page.
            </p>
          </div>

          <p className="text-[11px] text-muted-foreground">
            Each launch creates a blog draft and 3 editable advertising banners. Only selected social outputs are saved as campaign drafts.
          </p>

          <Button onClick={submit} disabled={launchInProgress || uploadingImages} className="w-full gap-2">
            {launchInProgress ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
            {uploadingImages ? 'Uploading images' : launchInProgress ? 'Launch in progress' : 'Launch campaign'}
          </Button>
        </CardContent>
      </Card>

      {detail.data && <LaunchProgress launch={detail.data} />}

      {list.data && list.data.length > 1 && (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground mb-2">Past launches</h2>
          <div className="space-y-1">
            {list.data
              .filter((l) => l.id !== activeLaunchId)
              .slice(0, 10)
              .map((l) => (
                <button
                  key={l.id}
                  onClick={() => setActiveLaunchId(l.id)}
                  className="w-full text-left border rounded-lg p-2 text-sm hover:bg-muted/40 flex items-center justify-between gap-2"
                >
                  <span className="truncate">{l.keyword}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className="text-[10px]">
                      {l.status}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(l.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
