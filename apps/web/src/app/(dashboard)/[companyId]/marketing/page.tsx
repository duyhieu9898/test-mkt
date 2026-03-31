'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Megaphone, Image, Share2, Sparkles, Loader2, Plus, Play, Pause,
  CheckCircle2, Eye, DollarSign, TrendingUp, Globe, Mail, Search, Target,
  ArrowRight, Zap, RefreshCw, ChevronDown, ChevronUp, Video, Film, Edit3,
  Brain, ToggleLeft, ToggleRight, AlertTriangle, Rocket,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api/client';
import { useAuthStore } from '@/stores/auth-store';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCompany, useLandingPages } from '@/lib/api/hooks';
import { BannerCard } from '@/components/marketing/banner-card';

export default function MarketingPage() {
  const params = useParams();
  const companyId = params.companyId as string;
  const token = useAuthStore((state) => state.token);
  const qc = useQueryClient();

  const [createDialog, setCreateDialog] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isAutoGenerating, setIsAutoGenerating] = useState(false);
  const [creatingStep, setCreatingStep] = useState(0);
  const [expandedCampaign, setExpandedCampaign] = useState<string | null>(null);
  const [sizeFilter, setSizeFilter] = useState<string>('all');
  // Asset picker for banner images
  const [imagePickerOpen, setImagePickerOpen] = useState(false);
  const [imagePickerCallback, setImagePickerCallback] = useState<((url: string) => void) | null>(null);
  const [imagePickerUrl, setImagePickerUrl] = useState('');
  const [imagePickerTab, setImagePickerTab] = useState<'url' | 'library' | 'stock'>('library');
  const [stockQuery, setStockQuery] = useState('');
  const [stockResults, setStockResults] = useState<any[]>([]);
  const [libraryAssets, setLibraryAssets] = useState<any[]>([]);
  const [isSearchingStock, setIsSearchingStock] = useState(false);
  const [campaignForm, setCampaignForm] = useState({
    goal: 'leads', audience: '', product: '', budgetDaily: '10', platform: 'meta', language: 'en',
  });

  const { data: company } = useCompany(companyId);
  const { data: pages } = useLandingPages(companyId);

  // Campaigns with their creatives
  const { data: campaignsData } = useQuery({
    queryKey: ['campaigns', companyId],
    queryFn: () => api.get<{ data: any[] }>(`/marketing/company/${companyId}/campaigns`, { token: token! }),
    enabled: !!token,
  });

  const { data: bannersData } = useQuery({
    queryKey: ['banners', companyId],
    queryFn: () => api.get<{ data: any[] }>(`/marketing/company/${companyId}/banners`, { token: token! }),
    enabled: !!token,
  });

  const { data: postsData } = useQuery({
    queryKey: ['posts', companyId],
    queryFn: () => api.get<{ data: any[] }>(`/marketing/company/${companyId}/posts`, { token: token! }),
    enabled: !!token,
  });

  const { data: videosData } = useQuery({
    queryKey: ['videos', companyId],
    queryFn: () => api.get<{ data: any[] }>(`/marketing/company/${companyId}/videos`, { token: token! }),
    enabled: !!token,
  });

  const { data: connectionStatuses } = useQuery({
    queryKey: ['platform-connections', companyId],
    queryFn: () => api.get<{ connections: Record<string, { connected: boolean }> }>('/integrations/all-status', { token: token! }),
    enabled: !!token,
  });

  const { data: aiSuggestionsData, isLoading: isLoadingSuggestions } = useQuery({
    queryKey: ['ai-suggestions', companyId],
    queryFn: () => api.get<{ data: any[] }>(`/marketing/company/${companyId}/campaigns/ai-suggestions`, { token: token! }),
    enabled: !!token,
    staleTime: 5 * 60 * 1000, // cache for 5 minutes
  });

  const allCampaigns = campaignsData?.data || [];
  const allBanners = bannersData?.data || [];
  const allPosts = postsData?.data || [];
  const allVideos = videosData?.data || [];
  const aiSuggestions = aiSuggestionsData?.data || [];

  const [runningAiSuggestion, setRunningAiSuggestion] = useState<number | null>(null);

  const [isCreatingVideo, setIsCreatingVideo] = useState(false);
  const [videoFormat, setVideoFormat] = useState<'15s' | '30s' | '60s'>('30s');
  const [editingVideoId, setEditingVideoId] = useState<string | null>(null);

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['campaigns'] });
    qc.invalidateQueries({ queryKey: ['banners'] });
    qc.invalidateQueries({ queryKey: ['posts'] });
    qc.invalidateQueries({ queryKey: ['videos'] });
  };

  // Get banners/posts for a specific campaign
  const getCampaignBanners = (campaignId: string) => allBanners.filter((b: any) => b.campaignId === campaignId);
  const getCampaignPosts = (campaignId: string) => allPosts.filter((p: any) => p.campaignId === campaignId);

  // === AUTO-GENERATE from system intelligence ===
  const handleAutoGenerate = async () => {
    if (!token || isAutoGenerating) return;
    setIsAutoGenerating(true);
    try {
      const res = await api.post<{ campaigns: any[]; count: number }>(
        `/marketing/company/${companyId}/auto-campaigns`, {}, { token }
      );
      if (res.count > 0) {
        toast.success(`AI created ${res.count} campaigns from your content strategy!`);
        invalidateAll();
      } else {
        toast.info('No campaigns generated — add landing pages or knowledge first');
      }
    } catch { toast.error('Failed to auto-generate'); }
    finally { setIsAutoGenerating(false); }
  };

  // === CREATE CAMPAIGN (full wizard) ===
  const handleCreateCampaign = async () => {
    if (!token || !campaignForm.audience.trim()) return;
    setIsCreating(true);

    try {
      // Step 1: Understanding business
      setCreatingStep(1);
      const name = `${campaignForm.goal === 'leads' ? 'Lead Gen' : campaignForm.goal === 'traffic' ? 'Traffic' : 'Promo'}: ${campaignForm.product || campaignForm.audience}`;

      const campaign = await api.post<any>(`/marketing/company/${companyId}/campaigns`, {
        name,
        goal: campaignForm.goal,
        platform: campaignForm.platform,
        budgetDaily: campaignForm.budgetDaily,
        targeting: { audience: campaignForm.audience },
        landingPageUrl: (pages || [])[0]?.slug ? `/${(pages || [])[0]?.slug}` : undefined,
      }, { token });

      // Step 2: Creating marketing angles
      setCreatingStep(2);
      await api.post(`/marketing/company/${companyId}/banners/generate`, {
        campaignId: campaign.id,
        size: '1200x628',
        variants: 3,
        language: campaignForm.language,
      }, { token });

      // Step 3: Generating social posts
      setCreatingStep(3);
      await api.post(`/marketing/company/${companyId}/posts/generate`, {
        campaignId: campaign.id,
        platforms: ['facebook', 'instagram', 'linkedin'],
        variants: 2,
        language: campaignForm.language,
      }, { token });

      toast.success('Campaign created with banners and posts!');
      setCreateDialog(false);
      setCampaignForm({ goal: 'leads', audience: '', product: '', budgetDaily: '10', platform: 'meta', language: 'en' });
      setExpandedCampaign(campaign.id);
      invalidateAll();
    } catch (err) {
      toast.error('Failed to create campaign');
    } finally {
      setIsCreating(false);
      setCreatingStep(0);
    }
  };

  const handleLaunch = async (id: string) => {
    if (!token) return;
    try {
      await api.post(`/marketing/company/${companyId}/campaigns/${id}/launch`, {}, { token });
      toast.success('Campaign launched!');
      invalidateAll();
    } catch {
      toast.error('Cannot launch — approve at least 1 banner first');
    }
  };

  const handlePause = async (id: string) => {
    if (!token) return;
    await api.post(`/marketing/company/${companyId}/campaigns/${id}/pause`, {}, { token });
    toast.success('Paused');
    invalidateAll();
  };

  const handleApproveBanner = async (id: string) => {
    if (!token) return;
    await api.post(`/marketing/company/${companyId}/banners/${id}/approve`, {}, { token });
    toast.success('Banner approved for campaign');
    invalidateAll();
  };

  const handlePublishPost = async (id: string) => {
    if (!token) return;
    try {
      const res = await api.post<any>(`/marketing/company/${companyId}/posts/${id}/publish`, {}, { token });
      if (res.published) {
        toast.success(res.message || 'Published!');
        if (res.platformPostUrl) {
          toast.info(`View: ${res.platformPostUrl}`, { duration: 5000 });
        }
      } else {
        toast.error(res.error || 'Could not publish');
      }
    } catch (err: any) {
      toast.error(err.message || 'Publishing failed. Check if the platform is connected in Settings.');
    }
    invalidateAll();
  };

  const handleAddImageToPost = (postId: string) => {
    setImagePickerCallback(() => (imageUrl: string) => {
      updatePostImage(postId, imageUrl);
    });
    setImagePickerUrl('');
    setImagePickerTab('library');
    setStockResults([]);
    if (token) {
      api.get<{ data: any[] }>(`/assets-library/company/${companyId}?type=image`, { token })
        .then((res) => setLibraryAssets(res.data || []))
        .catch(() => setLibraryAssets([]));
    }
    setImagePickerOpen(true);
  };

  const updatePostImage = async (postId: string, imageUrl: string) => {
    if (!token) return;
    try {
      await api.patch(`/marketing/company/${companyId}/posts/${postId}`, {
        mediaUrls: [imageUrl],
      }, { token });
      toast.success('Image added');
      invalidateAll();
    } catch {
      toast.error('Could not add image');
    }
  };

  const handleExportSizes = async (bannerId: string) => {
    if (!token) return;
    try {
      toast.info('Creating ad sizes for all platforms...');
      const res = await api.post<{ exported: number }>(`/marketing/company/${companyId}/banners/${bannerId}/export-sizes`, {}, { token: token! });
      toast.success(`Done! ${res.exported} new banner sizes created`);
      invalidateAll();
    } catch {
      toast.error('Could not export banner sizes');
    }
  };

  const handleCreateVideo = async () => {
    if (!token || isCreatingVideo) return;
    setIsCreatingVideo(true);
    try {
      await api.post(`/marketing/company/${companyId}/videos/generate`, {
        format: videoFormat,
        aspectRatio: '9:16',
      }, { token });
      toast.success('Video script and scenes created!');
      qc.invalidateQueries({ queryKey: ['videos'] });
    } catch {
      toast.error('Failed to create video');
    } finally {
      setIsCreatingVideo(false);
    }
  };

  const handleRunAiSuggestion = async (suggestion: any, index: number) => {
    if (!token || runningAiSuggestion !== null) return;
    setRunningAiSuggestion(index);
    try {
      await api.post(`/marketing/company/${companyId}/campaigns/ai-suggestions/run`, {
        goal: suggestion.goal || suggestion.name,
        audience: suggestion.audience,
        reason: suggestion.reason,
        suggestedBudget: suggestion.suggestedBudget || 10,
        channel: suggestion.channel,
      }, { token });
      toast.success('AI campaign created! Check your campaigns list.');
      invalidateAll();
      qc.invalidateQueries({ queryKey: ['ai-suggestions'] });
    } catch {
      toast.error('Could not create campaign from this suggestion');
    } finally {
      setRunningAiSuggestion(null);
    }
  };

  const handleToggleAiMode = async (campaignId: string, currentMode: boolean) => {
    if (!token) return;
    try {
      await api.post(`/marketing/company/${companyId}/campaigns/${campaignId}/ai-mode`, {
        enabled: !currentMode,
      }, { token });
      toast.success(!currentMode ? 'AI optimization enabled' : 'Switched to manual control');
      invalidateAll();
    } catch {
      toast.error('Could not toggle AI mode');
    }
  };

  const handleUpdateVideo = async (id: string, updates: any) => {
    if (!token) return;
    try {
      await api.patch(`/marketing/company/${companyId}/videos/${id}`, updates, { token });
      toast.success('Video updated');
      qc.invalidateQueries({ queryKey: ['videos'] });
      setEditingVideoId(null);
    } catch {
      toast.error('Could not update video');
    }
  };

  // Size filter categories
  const sizeCategories: Record<string, string[]> = {
    all: [],
    Facebook: ['1200x628'],
    Instagram: ['1080x1080'],
    Stories: ['1080x1920'],
    YouTube: ['1920x1080'],
    Display: ['300x250'],
  };

  const filterBannersBySize = (bannerList: any[]) => {
    if (sizeFilter === 'all') return bannerList;
    const sizes = sizeCategories[sizeFilter] || [];
    return bannerList.filter((b: any) => sizes.includes(b.size));
  };

  const statusColors: Record<string, string> = {
    planned: 'bg-gray-100 text-gray-700',
    generating: 'bg-blue-100 text-blue-700',
    ready: 'bg-emerald-100 text-emerald-700',
    launching: 'bg-yellow-100 text-yellow-700',
    live: 'bg-green-100 text-green-700',
    optimizing: 'bg-purple-100 text-purple-700',
    draft: 'bg-gray-100 text-gray-700',
    active: 'bg-green-100 text-green-700',
    paused: 'bg-amber-100 text-amber-700',
    completed: 'bg-blue-100 text-blue-700',
    failed: 'bg-red-100 text-red-700',
  };

  const statusLabels: Record<string, string> = {
    planned: 'Planned',
    generating: 'Creating...',
    ready: 'Ready to Launch',
    launching: 'Launching...',
    live: 'Live',
    optimizing: 'Optimizing',
    draft: 'Draft',
    active: 'Active',
    paused: 'Paused',
    completed: 'Completed',
    failed: 'Failed',
  };

  const goalLabels: Record<string, string> = {
    leads: 'Get Leads', traffic: 'Drive Traffic', conversions: 'Sales',
    awareness: 'Brand Awareness', sales: 'Promote Product',
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Marketing</h1>
          <p className="text-muted-foreground">Get customers for your pages</p>
        </div>
        <Button className="gap-2" onClick={() => setCreateDialog(true)}>
          <Plus className="w-4 h-4" /> New Campaign
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        <Card><CardContent className="pt-4 pb-4 flex items-center gap-3">
          <div className="p-2 bg-blue-50 rounded-lg"><Megaphone className="w-4 h-4 text-blue-600" /></div>
          <div><p className="text-xl font-bold">{allCampaigns.length}</p><p className="text-xs text-muted-foreground">Campaigns</p></div>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-4 flex items-center gap-3">
          <div className="p-2 bg-purple-50 rounded-lg"><Image className="w-4 h-4 text-purple-600" /></div>
          <div><p className="text-xl font-bold">{allBanners.length}</p><p className="text-xs text-muted-foreground">Banners</p></div>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-4 flex items-center gap-3">
          <div className="p-2 bg-green-50 rounded-lg"><Share2 className="w-4 h-4 text-green-600" /></div>
          <div><p className="text-xl font-bold">{allPosts.length}</p><p className="text-xs text-muted-foreground">Posts</p></div>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-4 flex items-center gap-3">
          <div className="p-2 bg-amber-50 rounded-lg"><TrendingUp className="w-4 h-4 text-amber-600" /></div>
          <div><p className="text-xl font-bold">{allCampaigns.filter((c: any) => ['active', 'live', 'optimizing'].includes(c.status)).length}</p><p className="text-xs text-muted-foreground">Live</p></div>
        </CardContent></Card>
      </div>

      {/* AI Suggestions */}
      {aiSuggestions.length > 0 && (
        <Card className="border-purple-200 bg-purple-50/50">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 mb-3">
              <Brain className="w-4 h-4 text-purple-600" />
              <p className="font-semibold text-sm">AI found {aiSuggestions.length} opportunities</p>
            </div>
            <div className="space-y-2">
              {aiSuggestions.map((s: any, i: number) => (
                <div key={i} className="flex items-start gap-3 p-2.5 bg-white rounded-lg border">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{s.name || s.goal}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{s.reason}</p>
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                      {s.audience && <span>For: {s.audience}</span>}
                      {s.channel && <span>via {s.channel}</span>}
                      {s.suggestedBudget && <span>${s.suggestedBudget}/day</span>}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    className="gap-1 shrink-0 bg-purple-600 hover:bg-purple-700"
                    disabled={runningAiSuggestion !== null}
                    onClick={() => handleRunAiSuggestion(s, i)}
                  >
                    {runningAiSuggestion === i ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Rocket className="w-3 h-3" />
                    )}
                    {runningAiSuggestion === i ? 'Creating...' : 'Run Campaign'}
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Campaign List */}
      {allCampaigns.length === 0 ? (
        <PromotablePages
          pages={pages || []}
          companyName={company?.name || 'Your business'}
          onPromotePage={(pageName) => {
            setCampaignForm({ ...campaignForm, product: pageName, audience: '' });
            setCreateDialog(true);
          }}
          onAutoGenerate={handleAutoGenerate}
          isAutoGenerating={isAutoGenerating}
        />
      ) : (
        <div className="space-y-4">
          {allCampaigns.map((campaign: any) => {
            const isExpanded = expandedCampaign === campaign.id;
            const banners = getCampaignBanners(campaign.id);
            const posts = getCampaignPosts(campaign.id);

            return (
              <Card key={campaign.id} className="overflow-hidden">
                {/* Campaign Header */}
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={`p-2.5 rounded-lg shrink-0 ${
                      campaign.status === 'active' ? 'bg-green-50' : 'bg-muted'
                    }`}>
                      <Megaphone className={`w-5 h-5 ${
                        campaign.status === 'active' ? 'text-green-600' : 'text-muted-foreground'
                      }`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-semibold truncate">{campaign.name}</p>
                        <Badge className={`text-[10px] ${statusColors[campaign.status] || statusColors.draft}`}>
                          {(campaign.status === 'generating' || campaign.status === 'launching') && (
                            <Loader2 className="w-2.5 h-2.5 mr-1 animate-spin inline" />
                          )}
                          {campaign.status === 'live' && (
                            <span className="w-1.5 h-1.5 bg-green-500 rounded-full mr-1 inline-block animate-pulse" />
                          )}
                          {statusLabels[campaign.status] || campaign.status}
                        </Badge>
                        {campaign.aiMode && (
                          <Badge className="text-[10px] bg-purple-100 text-purple-700">AI</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1"><Target className="w-3 h-3" /> {goalLabels[campaign.goal] || campaign.goal}</span>
                        <span className="flex items-center gap-1"><Globe className="w-3 h-3" /> {campaign.platform}</span>
                        {campaign.budgetDaily && <span className="flex items-center gap-1"><DollarSign className="w-3 h-3" /> ${campaign.budgetDaily}/day</span>}
                        <span className="flex items-center gap-1"><Image className="w-3 h-3" /> {banners.length} banners</span>
                        <span className="flex items-center gap-1"><Share2 className="w-3 h-3" /> {posts.length} posts</span>
                      </div>
                      {/* Visible flow — shows WHERE this campaign came from in user language */}
                      {((campaign.targeting as any)?.source || campaign.landingPageUrl) && (
                        <div className="mt-2 p-2.5 bg-muted/50 rounded-lg text-xs space-y-1">
                          <p className="font-medium text-foreground mb-1">This campaign promotes:</p>
                          {(campaign.targeting as any)?.source?.reference && (
                            <p className="flex items-center gap-1.5">
                              <span className="text-base">📄</span>
                              <span>Page: <strong>{(campaign.targeting as any).source.reference}</strong></span>
                            </p>
                          )}
                          {(campaign.targeting as any)?.contentCluster && (
                            <p className="flex items-center gap-1.5">
                              <span className="text-base">🔍</span>
                              <span>Topic: <strong>{(campaign.targeting as any).contentCluster}</strong></span>
                            </p>
                          )}
                          {(campaign.targeting as any)?.audience && (
                            <p className="flex items-center gap-1.5">
                              <span className="text-base">👥</span>
                              <span>For: <strong>{(campaign.targeting as any).audience}</strong></span>
                            </p>
                          )}
                          {(campaign.targeting as any)?.source?.reasoning && (
                            <p className="text-muted-foreground italic mt-1">
                              💡 {(campaign.targeting as any).source.reasoning}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {(campaign.status === 'draft' || campaign.status === 'ready') && (
                        <Button size="sm" className="gap-1 bg-green-600 hover:bg-green-700" onClick={() => handleLaunch(campaign.id)}>
                          <Play className="w-3 h-3" /> Launch
                        </Button>
                      )}
                      {(campaign.status === 'active' || campaign.status === 'live' || campaign.status === 'optimizing') && (
                        <Button size="sm" variant="outline" className="gap-1" onClick={() => handlePause(campaign.id)}>
                          <Pause className="w-3 h-3" /> Pause
                        </Button>
                      )}
                      {campaign.status === 'paused' && (
                        <Button size="sm" className="gap-1" onClick={() => handleLaunch(campaign.id)}>
                          <Play className="w-3 h-3" /> Resume
                        </Button>
                      )}
                      {(campaign.status === 'live' || campaign.status === 'optimizing') && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="gap-1 text-xs"
                          onClick={() => handleToggleAiMode(campaign.id, campaign.aiMode)}
                          title={campaign.aiMode ? 'AI is auto-optimizing. Click for manual control.' : 'Manual mode. Click to let AI optimize.'}
                        >
                          {campaign.aiMode ? (
                            <ToggleRight className="w-4 h-4 text-purple-600" />
                          ) : (
                            <ToggleLeft className="w-4 h-4 text-muted-foreground" />
                          )}
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => setExpandedCampaign(isExpanded ? null : campaign.id)}>
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>
                </CardContent>

                {/* Expanded: Campaign Creatives */}
                {isExpanded && (
                  <div className="border-t bg-muted/20 p-4 space-y-4">
                    {/* Status-specific info */}
                    {campaign.status === 'generating' && (
                      <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg text-sm">
                        <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                        <div>
                          <p className="font-medium text-blue-900">AI is creating your campaign</p>
                          <p className="text-blue-700 text-xs">Generating banners and social posts...</p>
                        </div>
                      </div>
                    )}
                    {campaign.status === 'launching' && (
                      <div className="flex items-center gap-3 p-3 bg-yellow-50 rounded-lg text-sm">
                        <Loader2 className="w-4 h-4 animate-spin text-yellow-600" />
                        <div>
                          <p className="font-medium text-yellow-900">Publishing to platforms</p>
                          <p className="text-yellow-700 text-xs">Connecting to {campaign.platform} and uploading creatives...</p>
                        </div>
                      </div>
                    )}
                    {campaign.status === 'failed' && campaign.launchError && (
                      <div className="flex items-center gap-3 p-3 bg-red-50 rounded-lg text-sm">
                        <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                        <div>
                          <p className="font-medium text-red-900">Launch failed</p>
                          <p className="text-red-700 text-xs">{campaign.launchError}</p>
                        </div>
                      </div>
                    )}
                    {/* Live metrics */}
                    {(campaign.status === 'live' || campaign.status === 'optimizing' || campaign.status === 'active') && campaign.metrics && (
                      <div className="grid grid-cols-4 gap-2">
                        {[
                          { label: 'Impressions', value: (campaign.metrics as any)?.impressions?.toLocaleString() || '0', icon: Eye },
                          { label: 'Clicks', value: (campaign.metrics as any)?.clicks?.toLocaleString() || '0', icon: TrendingUp },
                          { label: 'CTR', value: `${((campaign.metrics as any)?.ctr || 0).toFixed(2)}%`, icon: Target },
                          { label: 'Spend', value: `$${((campaign.metrics as any)?.spend || 0).toFixed(2)}`, icon: DollarSign },
                        ].map((m) => (
                          <div key={m.label} className="flex items-center gap-2 p-2 bg-white rounded-lg border text-xs">
                            <m.icon className="w-3.5 h-3.5 text-muted-foreground" />
                            <div>
                              <p className="font-semibold">{m.value}</p>
                              <p className="text-muted-foreground text-[10px]">{m.label}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {/* AI Decisions log */}
                    {campaign.aiDecisions && (campaign.aiDecisions as any[]).length > 0 && (
                      <div className="p-2.5 bg-purple-50/50 rounded-lg">
                        <p className="text-xs font-medium text-purple-800 mb-1.5 flex items-center gap-1">
                          <Brain className="w-3 h-3" /> AI Insights ({(campaign.aiDecisions as any[]).length})
                        </p>
                        <div className="space-y-1">
                          {(campaign.aiDecisions as any[]).slice(-3).map((d: any, i: number) => (
                            <p key={i} className="text-[11px] text-purple-700">
                              {d.applied ? '> ' : '? '}{d.reason}
                            </p>
                          ))}
                        </div>
                      </div>
                    )}
                    {/* Banners */}
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-medium text-sm flex items-center gap-1"><Image className="w-3.5 h-3.5" /> Banners ({banners.length})</h4>
                      </div>
                      {/* Size filter tabs */}
                      {banners.length > 0 && (
                        <div className="flex gap-1 mb-3 flex-wrap">
                          {Object.keys(sizeCategories).map((cat) => (
                            <Button
                              key={cat}
                              size="sm"
                              variant={sizeFilter === cat ? 'default' : 'outline'}
                              className="h-6 text-[10px] px-2.5"
                              onClick={() => setSizeFilter(cat)}
                            >
                              {cat === 'all' ? 'All' : cat}
                            </Button>
                          ))}
                        </div>
                      )}
                      {banners.length > 0 ? (
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                          {filterBannersBySize(banners).map((b: any) => (
                            <BannerCard
                              key={b.id}
                              banner={b}
                              onApprove={handleApproveBanner}
                              onExportSizes={handleExportSizes}
                              onUpdateBanner={async (id, updates) => {
                                try {
                                  await api.patch(`/marketing/company/${companyId}/banners/${id}`, updates, { token: token! });
                                  qc.invalidateQueries({ queryKey: ['marketing'] });
                                  toast.success('Banner updated');
                                } catch { toast.error('Could not update banner'); }
                              }}
                              onGenerateBackground={async (id) => {
                                try {
                                  toast.info('Generating background image...');
                                  await api.post(`/marketing/company/${companyId}/banners/${id}/generate-background`, {}, { token: token! });
                                  qc.invalidateQueries({ queryKey: ['marketing'] });
                                  toast.success('Background generated!');
                                } catch { toast.error('Could not generate background'); }
                              }}
                              onPickImage={(bannerId, callback) => {
                                setImagePickerCallback(() => callback);
                                setImagePickerUrl('');
                                setImagePickerTab('library');
                                setStockResults([]);
                                // Load library assets
                                if (token) {
                                  api.get<{ data: any[] }>(`/assets-library/company/${companyId}?type=image`, { token })
                                    .then((res) => setLibraryAssets(res.data || []))
                                    .catch(() => setLibraryAssets([]));
                                }
                                setImagePickerOpen(true);
                              }}
                            />
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">No banners generated yet</p>
                      )}
                    </div>

                    {/* Social Posts */}
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-medium text-sm flex items-center gap-1"><Share2 className="w-3.5 h-3.5" /> Social Posts ({posts.length})</h4>
                      </div>
                      {posts.length > 0 ? (
                        <div className="space-y-2">
                          {posts.map((p: any) => (
                            <Card key={p.id}>
                              <CardContent className="p-3">
                                <div className="flex items-start gap-3">
                                  <Badge variant="outline" className="text-[10px] capitalize shrink-0 mt-0.5">{p.platform}</Badge>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm line-clamp-2">{p.content}</p>
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0">
                                    <Badge className={`text-[9px] ${p.status === 'published' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{p.status}</Badge>
                                    {p.status === 'draft' && (
                                      <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1" onClick={() => handlePublishPost(p.id)}>
                                        <Globe className="w-2.5 h-2.5" /> Publish
                                      </Button>
                                    )}
                                  </div>
                                </div>
                                {/* Image attachment */}
                                <div className="mt-2 pl-[72px]">
                                  {p.mediaUrls?.length > 0 ? (
                                    <div className="flex gap-1">
                                      {(p.mediaUrls as string[]).map((url: string, idx: number) => (
                                        <img key={idx} src={url} className="w-16 h-16 rounded object-cover" alt="" />
                                      ))}
                                      <button
                                        className="w-16 h-16 rounded border-2 border-dashed flex items-center justify-center text-muted-foreground hover:border-primary/30"
                                        onClick={() => handleAddImageToPost(p.id)}
                                      >
                                        <Plus className="w-4 h-4" />
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary"
                                      onClick={() => handleAddImageToPost(p.id)}
                                    >
                                      <Image className="w-3.5 h-3.5" /> Add image from library
                                    </button>
                                  )}
                                </div>
                                {/* Hashtags */}
                                {p.hashtags?.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-1.5 pl-[72px]">
                                    {(p.hashtags as string[]).slice(0, 5).map((h: string, idx: number) => (
                                      <span key={idx} className="text-xs text-primary">#{h.replace(/^#/, '')}</span>
                                    ))}
                                  </div>
                                )}
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">No posts generated yet</p>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* ============================================================ */}
      {/* VIDEOS SECTION */}
      {/* ============================================================ */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Film className="w-5 h-5 text-purple-600" /> Videos
          </h2>
          <div className="flex items-center gap-2">
            <Select value={videoFormat} onValueChange={(v: any) => setVideoFormat(v)}>
              <SelectTrigger className="w-[80px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="15s">15s</SelectItem>
                <SelectItem value="30s">30s</SelectItem>
                <SelectItem value="60s">60s</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" className="gap-1.5" onClick={handleCreateVideo} disabled={isCreatingVideo}>
              {isCreatingVideo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Video className="w-3.5 h-3.5" />}
              {isCreatingVideo ? 'Creating...' : 'Create Video'}
            </Button>
          </div>
        </div>

        {allVideos.length > 0 ? (
          <div className="space-y-3">
            {allVideos.map((video: any) => {
              const script = video.script as any;
              const scenes = (video.scenes as any[]) || [];
              const isEditing = editingVideoId === video.id;

              const statusLabel: Record<string, string> = {
                script: 'Script ready',
                scenes: 'Scenes ready',
                rendering: 'Rendering...',
                ready: 'Video ready',
                failed: 'Failed',
              };
              const statusColor: Record<string, string> = {
                script: 'bg-blue-100 text-blue-700',
                scenes: 'bg-amber-100 text-amber-700',
                rendering: 'bg-purple-100 text-purple-700',
                ready: 'bg-green-100 text-green-700',
                failed: 'bg-red-100 text-red-700',
              };

              return (
                <Card key={video.id}>
                  <CardContent className="p-4 space-y-3">
                    {/* Header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Film className="w-4 h-4 text-purple-500" />
                        <p className="font-semibold text-sm">{video.title}</p>
                        <Badge className={`text-[10px] ${statusColor[video.status] || 'bg-gray-100 text-gray-600'}`}>
                          {statusLabel[video.status] || video.status}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">{video.format}</Badge>
                        <Badge variant="outline" className="text-[10px]">{video.aspectRatio}</Badge>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs gap-1"
                        onClick={() => setEditingVideoId(isEditing ? null : video.id)}
                      >
                        <Edit3 className="w-3 h-3" /> {isEditing ? 'Close' : 'Edit'}
                      </Button>
                    </div>

                    {/* Script preview */}
                    {script && (
                      <div className="text-xs space-y-1 bg-muted/30 rounded-lg p-3">
                        <p><span className="font-medium text-foreground">Hook:</span> <span className="text-muted-foreground">{script.hook}</span></p>
                        {script.body?.map((line: string, i: number) => (
                          <p key={i}><span className="font-medium text-foreground">Point {i + 1}:</span> <span className="text-muted-foreground">{line}</span></p>
                        ))}
                        <p><span className="font-medium text-foreground">CTA:</span> <span className="text-muted-foreground">{script.cta}</span></p>
                      </div>
                    )}

                    {/* Scene strip — horizontal colored cards */}
                    {scenes.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-2">Storyboard ({scenes.length} scenes)</p>
                        <div className="flex gap-2 overflow-x-auto pb-1">
                          {scenes.map((scene: any, i: number) => (
                            <div
                              key={i}
                              className="shrink-0 rounded-lg p-2.5 text-white text-[10px] flex flex-col justify-between"
                              style={{
                                backgroundColor: scene.backgroundColor || '#1e293b',
                                width: Math.max(80, scene.duration * 20),
                                minHeight: 70,
                              }}
                            >
                              <p className="font-medium line-clamp-2 leading-tight">{scene.text}</p>
                              <div className="flex items-center justify-between mt-1 opacity-70">
                                <span>{scene.duration}s</span>
                                <span>{scene.animation}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Edit mode */}
                    {isEditing && script && (
                      <VideoEditor
                        video={video}
                        onSave={(updates) => handleUpdateVideo(video.id, updates)}
                        onCancel={() => setEditingVideoId(null)}
                      />
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card className="p-8 text-center">
            <Film className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" />
            <h3 className="font-semibold mb-1">No videos yet</h3>
            <p className="text-sm text-muted-foreground mb-3">
              Create short video ads for social media. AI writes the script and builds the storyboard.
            </p>
          </Card>
        )}
      </div>

      {/* Create Campaign Dialog — Multi-step wizard */}
      <Dialog open={createDialog} onOpenChange={(open) => { if (!isCreating) setCreateDialog(open); }}>
        <DialogContent className="sm:max-w-[500px]">
          {isCreating ? (
            /* Creating state — show progress */
            <div className="py-8 text-center">
              <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto mb-4" />
              <h3 className="font-semibold text-lg mb-2">AI is creating your campaign...</h3>
              <div className="space-y-2 max-w-xs mx-auto">
                {[
                  { step: 1, label: 'Understanding your business' },
                  { step: 2, label: 'Creating marketing angles & banners' },
                  { step: 3, label: 'Writing social posts' },
                ].map((s) => (
                  <div key={s.step} className={`flex items-center gap-2 text-sm ${
                    creatingStep >= s.step ? 'text-foreground' : 'text-muted-foreground'
                  }`}>
                    {creatingStep > s.step ? (
                      <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                    ) : creatingStep === s.step ? (
                      <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />
                    ) : (
                      <div className="w-4 h-4 rounded-full border-2 border-muted-foreground/30 shrink-0" />
                    )}
                    {s.label}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* Form */
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-primary" /> Create Campaign
                </DialogTitle>
                <DialogDescription>
                  AI will generate banners, ad copy, and social posts automatically
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-3">
                <div>
                  <Label>What's the goal?</Label>
                  <Select value={campaignForm.goal} onValueChange={(v) => setCampaignForm({ ...campaignForm, goal: v })}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="leads">Get Leads</SelectItem>
                      <SelectItem value="traffic">Drive Traffic</SelectItem>
                      <SelectItem value="sales">Promote Product / Sales</SelectItem>
                      <SelectItem value="awareness">Brand Awareness</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Who is this for?</Label>
                  <Input
                    value={campaignForm.audience}
                    onChange={(e) => setCampaignForm({ ...campaignForm, audience: e.target.value })}
                    placeholder="e.g. Small business owners looking for IT solutions"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>What are you promoting? (optional)</Label>
                  <Input
                    value={campaignForm.product}
                    onChange={(e) => setCampaignForm({ ...campaignForm, product: e.target.value })}
                    placeholder="e.g. Our new consulting service package"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Language</Label>
                  <Select value={campaignForm.language} onValueChange={(v) => setCampaignForm({ ...campaignForm, language: v })}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="vi">Tiếng Việt</SelectItem>
                      <SelectItem value="zh">中文</SelectItem>
                      <SelectItem value="ja">日本語</SelectItem>
                      <SelectItem value="ko">한국어</SelectItem>
                      <SelectItem value="th">ภาษาไทย</SelectItem>
                      <SelectItem value="fr">Français</SelectItem>
                      <SelectItem value="es">Español</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Platform</Label>
                    <Select value={campaignForm.platform} onValueChange={(v) => setCampaignForm({ ...campaignForm, platform: v })}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="meta">
                          Facebook & Instagram{connectionStatuses?.connections?.facebook?.connected ? '' : ' (not connected)'}
                        </SelectItem>
                        <SelectItem value="google">
                          Google Ads{connectionStatuses?.connections?.google?.connected ? '' : ' (not connected)'}
                        </SelectItem>
                        <SelectItem value="linkedin">
                          LinkedIn{connectionStatuses?.connections?.linkedin?.connected ? '' : ' (not connected)'}
                        </SelectItem>
                        <SelectItem value="manual">Manual / Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Daily Budget ($)</Label>
                    <Input type="number" value={campaignForm.budgetDaily}
                      onChange={(e) => setCampaignForm({ ...campaignForm, budgetDaily: e.target.value })}
                      className="mt-1" min="1" />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateDialog(false)}>Cancel</Button>
                <Button onClick={handleCreateCampaign} disabled={!campaignForm.audience.trim()} className="gap-2">
                  <Sparkles className="w-4 h-4" /> Create Campaign
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ========== IMAGE PICKER DIALOG ========== */}
      <Dialog open={imagePickerOpen} onOpenChange={setImagePickerOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Choose Background Image</DialogTitle>
            <DialogDescription>Pick from your library, search stock photos, or paste a URL</DialogDescription>
          </DialogHeader>

          {/* Tabs */}
          <div className="flex gap-1 border-b pb-2">
            {(['library', 'stock', 'url'] as const).map((tab) => (
              <Button
                key={tab}
                size="sm"
                variant={imagePickerTab === tab ? 'default' : 'ghost'}
                className="text-xs"
                onClick={() => setImagePickerTab(tab)}
              >
                {tab === 'library' ? 'My Library' : tab === 'stock' ? 'Stock Photos' : 'Paste URL'}
              </Button>
            ))}
          </div>

          {/* Library tab */}
          {imagePickerTab === 'library' && (
            <div className="space-y-3">
              {libraryAssets.length > 0 ? (
                <div className="grid grid-cols-3 gap-2 max-h-[300px] overflow-y-auto">
                  {libraryAssets.map((asset: any) => (
                    <div
                      key={asset.id}
                      className="aspect-video bg-muted rounded-lg overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary transition-all"
                      onClick={() => {
                        imagePickerCallback?.(asset.url);
                        setImagePickerOpen(false);
                      }}
                    >
                      <img src={asset.url} alt={asset.name} className="w-full h-full object-cover" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Image className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No images in your library yet</p>
                  <p className="text-xs mt-1">Upload images in the Asset Library, or try Stock Photos</p>
                </div>
              )}
            </div>
          )}

          {/* Stock tab */}
          {imagePickerTab === 'stock' && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <Input
                  value={stockQuery}
                  onChange={(e) => setStockQuery(e.target.value)}
                  placeholder="Search free stock photos..."
                  className="text-sm"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && stockQuery.trim() && token) {
                      setIsSearchingStock(true);
                      api.post<{ results: any[] }>(`/assets-library/company/${companyId}/search-stock`, { query: stockQuery }, { token })
                        .then((res) => setStockResults(res.results || []))
                        .catch(() => toast.error('Search not available'))
                        .finally(() => setIsSearchingStock(false));
                    }
                  }}
                />
                <Button size="sm" disabled={isSearchingStock || !stockQuery.trim()} onClick={() => {
                  if (!token || !stockQuery.trim()) return;
                  setIsSearchingStock(true);
                  api.post<{ results: any[] }>(`/assets-library/company/${companyId}/search-stock`, { query: stockQuery }, { token })
                    .then((res) => setStockResults(res.results || []))
                    .catch(() => toast.error('Search not available'))
                    .finally(() => setIsSearchingStock(false));
                }}>
                  {isSearchingStock ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                </Button>
              </div>
              {stockResults.length > 0 ? (
                <div className="grid grid-cols-3 gap-2 max-h-[300px] overflow-y-auto">
                  {stockResults.map((photo: any) => (
                    <div
                      key={photo.id}
                      className="aspect-video bg-muted rounded-lg overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary transition-all"
                      onClick={() => {
                        const imageUrl = photo.urls?.regular || photo.urls?.small || photo.url;
                        imagePickerCallback?.(imageUrl);
                        setImagePickerOpen(false);
                      }}
                    >
                      <img src={photo.urls?.small || photo.url} alt={photo.alt_description || ''} className="w-full h-full object-cover" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Search className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Search for free stock photos</p>
                  <p className="text-xs mt-1">Powered by Unsplash</p>
                </div>
              )}
            </div>
          )}

          {/* URL tab */}
          {imagePickerTab === 'url' && (
            <div className="space-y-3">
              <Input
                value={imagePickerUrl}
                onChange={(e) => setImagePickerUrl(e.target.value)}
                placeholder="https://example.com/image.jpg"
                className="text-sm"
              />
              {imagePickerUrl && (
                <div className="aspect-video bg-muted rounded-lg overflow-hidden max-w-[200px]">
                  <img src={imagePickerUrl} alt="Preview" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                </div>
              )}
              <Button
                className="w-full"
                disabled={!imagePickerUrl.trim()}
                onClick={() => {
                  imagePickerCallback?.(imagePickerUrl.trim());
                  setImagePickerOpen(false);
                }}
              >
                Use This Image
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================
// PROMOTABLE PAGES — Natural trigger, not random button
// Shows pages that can benefit from promotion
// ============================================================

function PromotablePages({
  pages,
  companyName,
  onPromotePage,
  onAutoGenerate,
  isAutoGenerating,
}: {
  pages: any[];
  companyName: string;
  onPromotePage: (pageName: string) => void;
  onAutoGenerate: () => void;
  isAutoGenerating: boolean;
}) {
  const promotablePages = pages.filter((p: any) =>
    p.status === 'published' || p.status === 'ready' || p.status === 'draft'
  ).slice(0, 5);

  if (promotablePages.length > 0) {
    return (
      <div className="space-y-4">
        {/* Natural trigger — pages that need traffic */}
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="pt-5 pb-5">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-primary/10 rounded-lg shrink-0">
                <Megaphone className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold mb-1">Get customers for your pages</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  You have {promotablePages.length} page{promotablePages.length > 1 ? 's' : ''} ready.
                  AI can create campaigns to bring visitors.
                </p>
                <Button className="gap-2" onClick={onAutoGenerate} disabled={isAutoGenerating}>
                  {isAutoGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                  {isAutoGenerating ? 'Creating campaigns...' : 'Promote all pages'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Individual page promotion cards */}
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">Or promote a specific page:</p>
          {promotablePages.map((page: any) => {
            const ctx = page.businessContext as any;
            return (
              <Card key={page.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="p-3 flex items-center gap-3">
                  <div className={`w-2 h-full rounded-full shrink-0 self-stretch ${
                    page.status === 'published' ? 'bg-green-500' : 'bg-amber-500'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{page.name}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {ctx?.keyword && <span>🔍 {ctx.keyword}</span>}
                      <Badge variant={page.status === 'published' ? 'success' : 'secondary'} className="text-[9px]">{page.status}</Badge>
                    </div>
                  </div>
                  <Button size="sm" variant="outline" className="gap-1 shrink-0" onClick={() => onPromotePage(page.name)}>
                    <ArrowRight className="w-3 h-3" /> Get traffic
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    );
  }

  // No pages at all
  return (
    <Card className="p-12 text-center">
      <Megaphone className="w-12 h-12 text-muted-foreground/20 mx-auto mb-4" />
      <h3 className="text-lg font-semibold mb-2">Create pages first</h3>
      <p className="text-muted-foreground max-w-md mx-auto mb-4">
        Marketing campaigns promote your landing pages.
        Create pages in "My Pages" first, then come back to get traffic.
      </p>
      <p className="text-xs text-muted-foreground">
        Go to <strong>My Pages</strong> in the menu → Create a landing page → Come back here to promote it
      </p>
    </Card>
  );
}

// ============================================================
// VIDEO EDITOR — Edit script + scenes inline
// ============================================================

function VideoEditor({
  video,
  onSave,
  onCancel,
}: {
  video: any;
  onSave: (updates: any) => void;
  onCancel: () => void;
}) {
  const script = video.script as any;
  const [editHook, setEditHook] = useState(script?.hook || '');
  const [editBody, setEditBody] = useState<string[]>(script?.body || []);
  const [editCta, setEditCta] = useState(script?.cta || '');

  const handleSave = () => {
    onSave({
      script: {
        hook: editHook,
        body: editBody,
        cta: editCta,
        voiceoverText: script?.voiceoverText,
      },
    });
  };

  return (
    <div className="border rounded-lg p-3 space-y-3 bg-background">
      <p className="text-xs font-medium text-muted-foreground">Edit Script</p>
      <div className="space-y-2">
        <div>
          <Label className="text-xs">Hook (first 3 seconds)</Label>
          <Input
            value={editHook}
            onChange={(e) => setEditHook(e.target.value)}
            className="mt-1 text-xs h-8"
            placeholder="Opening line..."
          />
        </div>
        {editBody.map((line, i) => (
          <div key={i}>
            <Label className="text-xs">Point {i + 1}</Label>
            <Input
              value={line}
              onChange={(e) => {
                const updated = [...editBody];
                updated[i] = e.target.value;
                setEditBody(updated);
              }}
              className="mt-1 text-xs h-8"
            />
          </div>
        ))}
        <div>
          <Label className="text-xs">CTA (last 3 seconds)</Label>
          <Input
            value={editCta}
            onChange={(e) => setEditCta(e.target.value)}
            className="mt-1 text-xs h-8"
            placeholder="Call to action..."
          />
        </div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" className="gap-1 text-xs h-7" onClick={handleSave}>
          <CheckCircle2 className="w-3 h-3" /> Save Changes
        </Button>
        <Button size="sm" variant="ghost" className="text-xs h-7" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
