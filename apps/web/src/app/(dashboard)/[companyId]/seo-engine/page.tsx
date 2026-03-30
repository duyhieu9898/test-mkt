'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Rocket, Loader2, Plus, X, CheckCircle2, Clock, AlertCircle,
  Globe, FileText, PenTool, Share2, Key, ExternalLink, ArrowRight, Info,
  Sparkles, Trash2, RefreshCw, ChevronDown,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api/client';
import { useAuthStore } from '@/stores/auth-store';
import { useQuery, useQueryClient } from '@tanstack/react-query';

// ─── Types ───────────────────────────────────────────────────────

interface BlogTopic {
  id: string;
  title: string;
  keyword: string;
  impact: 'high' | 'medium' | 'low';
  reason: string;
  searchIntent: 'informational' | 'commercial' | 'transactional';
}

interface KeywordOpportunity {
  keyword: string;
  volume: 'high' | 'medium' | 'low';
  difficulty: 'easy' | 'medium' | 'hard';
  intent: string;
}

interface Suggestions {
  needsSetup: boolean;
  blogTopics: BlogTopic[];
  keywordOpportunities: KeywordOpportunity[];
  contentGaps: string[];
  generatedAt?: string;
  error?: string;
}

interface PipelineStep {
  id: string;
  label: string;
  status: 'waiting' | 'running' | 'completed' | 'failed';
  result?: string;
  progress?: { current: number; total: number };
}

interface SEOJob {
  jobId: string;
  status: 'running' | 'completed' | 'failed';
  steps: PipelineStep[];
  overallProgress: number;
  results?: {
    blogPosts: any[];
    landingPages: any[];
    socialPosts: any[];
    keywords: any[];
  };
  error?: string;
}

interface SEOResults {
  blogPosts: any[];
  landingPages: any[];
  socialPosts: any[];
  keywords: any[];
  products: any[];
  lastRunAt: string | null;
  jobId: string | null;
}

interface PlanItem {
  title: string;
  keyword: string;
  searchIntent: string;
  source: 'idea' | 'keyword' | 'gap';
  addedAt: number;
}

// ─── Main Page ───────────────────────────────────────────────────

export default function ContentHubPage() {
  const params = useParams();
  const companyId = params.companyId as string;
  const token = useAuthStore((state) => state.token);
  const qc = useQueryClient();
  const router = useRouter();

  // Active job tracking
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  // Content Plan
  const [contentPlan, setContentPlan] = useState<PlanItem[]>([]);
  const [newPostIds, setNewPostIds] = useState<Set<string>>(new Set());

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingTopicCount, setGeneratingTopicCount] = useState(0);

  // WordPress dialog
  const [wpDialogOpen, setWpDialogOpen] = useState(false);
  const [wpSiteUrl, setWpSiteUrl] = useState('');
  const [wpUsername, setWpUsername] = useState('');
  const [wpAppPassword, setWpAppPassword] = useState('');
  const [wpConnecting, setWpConnecting] = useState(false);
  const [wpTesting, setWpTesting] = useState(false);

  // Blog selection for publishing
  const [selectedPosts, setSelectedPosts] = useState<Set<string>>(new Set());
  const [publishStatus, setPublishStatus] = useState<'draft' | 'publish'>('draft');
  const [isPublishing, setIsPublishing] = useState(false);

  // WordPress categories
  const [wpCategories, setWpCategories] = useState<Array<{ id: number; name: string }>>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('');

  // Blog expand/preview
  const [expandedBlog, setExpandedBlog] = useState<string | null>(null);
  const [blogContent, setBlogContent] = useState<Record<string, string>>({});


  // ─── Content Plan helpers ─────────────────────────────────────

  const addToPlan = (item: PlanItem) => {
    if (contentPlan.some(p => p.keyword === item.keyword)) {
      toast.info(`"${item.keyword}" is already in your plan`);
      return;
    }
    setContentPlan(prev => [...prev, item]);
    toast.success('Added to Content Plan');
  };

  const removeFromPlan = (keyword: string) => {
    setContentPlan(prev => prev.filter(p => p.keyword !== keyword));
  };

  const clearPlan = () => setContentPlan([]);

  const isInPlan = (keyword: string) => contentPlan.some(p => p.keyword === keyword);

  // ─── Fetch AI suggestions ────────────────────────────────────

  const { data: suggestions, isLoading: suggestionsLoading } = useQuery<Suggestions>({
    queryKey: ['seo-suggestions', companyId],
    queryFn: () => api.get(`/seo-engine/company/${companyId}/suggestions`, { token: token! }),
    enabled: !!token,
    staleTime: Infinity, // never auto-refresh — only when user clicks Refresh
    gcTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  // ─── Fetch content pipeline stats ─────────────────────────────

  const { data: results } = useQuery<SEOResults>({
    queryKey: ['seo-results', companyId],
    queryFn: () => api.get(`/seo-engine/company/${companyId}/results`, { token: token! }),
    enabled: !!token && !activeJobId,
  });

  const { data: bannersData } = useQuery<{ data: any[]; count: number }>({
    queryKey: ['banners-count', companyId],
    queryFn: () => api.get(`/marketing/company/${companyId}/banners`, { token: token! }),
    enabled: !!token,
  });

  const { data: socialData } = useQuery<{ data: any[]; count: number }>({
    queryKey: ['social-count', companyId],
    queryFn: () => api.get(`/marketing/company/${companyId}/posts`, { token: token! }),
    enabled: !!token,
  });

  // ─── Poll active job ────────────────────────────────────────

  const { data: jobStatus } = useQuery<SEOJob>({
    queryKey: ['seo-job', activeJobId],
    queryFn: () => api.get(`/seo-engine/company/${companyId}/status/${activeJobId}`, { token: token! }),
    enabled: !!token && !!activeJobId,
    refetchInterval: 2000,
  });

  // When job completes, stop polling and refresh results
  if (jobStatus?.status === 'completed' && activeJobId) {
    setActiveJobId(null);
    qc.invalidateQueries({ queryKey: ['seo-results', companyId] });
    qc.invalidateQueries({ queryKey: ['seo-suggestions', companyId] });
  }

  if (jobStatus?.status === 'failed' && activeJobId) {
    setActiveJobId(null);
    toast.error('Content generation encountered an issue. Please try again.');
  }

  // ─── WordPress status ────────────────────────────────────────

  const { data: wpStatus } = useQuery<{ connected: boolean; siteUrl?: string }>({
    queryKey: ['wp-status', companyId],
    queryFn: () => api.post(`/seo-engine/company/${companyId}/wordpress/test`, {}, { token: token! }),
    enabled: !!token && !activeJobId,
  });

  // ─── Load WP categories when connected ─────────────────────
  const { data: wpCategoriesData } = useQuery<{ categories: Array<{ id: number; name: string }> }>({
    queryKey: ['wp-categories', companyId],
    queryFn: () => api.get(`/seo-engine/company/${companyId}/wordpress/categories`, { token: token! }),
    enabled: !!token && !!wpStatus?.connected,
  });

  // Sync fetched categories to state
  useEffect(() => {
    if (wpCategoriesData?.categories?.length && wpCategories.length === 0) {
      setWpCategories(wpCategoriesData.categories);
    }
  }, [wpCategoriesData?.categories]);

  // ─── Derived data ───────────────────────────────────────────

  const blogPosts = results?.blogPosts || [];
  const landingPages = results?.landingPages || [];
  const bannerCount = bannersData?.count || bannersData?.data?.length || 0;
  const socialCount = socialData?.count || socialData?.data?.length || 0;
  const keywordCount = suggestions?.keywordOpportunities?.length || results?.keywords?.length || 0;

  // ─── Handlers ────────────────────────────────────────────────

  const handleGenerateFromPlan = async () => {
    if (!token || contentPlan.length === 0) return;
    setIsGenerating(true);
    setGeneratingTopicCount(contentPlan.length);

    try {
      const planSuggestions = contentPlan.filter(p => p.title).map(p => ({
        title: p.title,
        keyword: p.keyword,
        searchIntent: p.searchIntent,
      }));
      const keywords = contentPlan.filter(p => !p.title).map(p => ({
        keyword: p.keyword,
        volume: 'medium',
        competition: 'medium',
      }));

      const body: any = {};
      if (planSuggestions.length > 0) body.suggestions = planSuggestions;
      if (keywords.length > 0) body.keywords = keywords;

      const res = await api.post<any>(`/seo-engine/company/${companyId}/generate-from-suggestion`, body, { token });

      // Track new post IDs for "New" badge
      if (res.posts?.length) {
        const ids = new Set<string>(res.posts.map((p: any) => p.id));
        setNewPostIds(ids);
        setTimeout(() => setNewPostIds(new Set()), 5 * 60 * 1000);
      }

      toast.success(res.message || `Created content for ${contentPlan.length} topics`);
      clearPlan();

      qc.invalidateQueries({ queryKey: ['seo-results'] });
      qc.invalidateQueries({ queryKey: ['seo-blogs'] });
      qc.invalidateQueries({ queryKey: ['banners'] });
      qc.invalidateQueries({ queryKey: ['campaigns'] });
      qc.invalidateQueries({ queryKey: ['landing-pages'] });
      qc.invalidateQueries({ queryKey: ['banners-count'] });
      qc.invalidateQueries({ queryKey: ['social-count'] });

      setTimeout(() => {
        document.getElementById('blog-section')?.scrollIntoView({ behavior: 'smooth' });
      }, 1000);

    } catch {
      toast.error('Could not generate content. Please try again.');
    } finally {
      setIsGenerating(false);
      setGeneratingTopicCount(0);
    }
  };

  const handleWpConnect = async () => {
    if (!wpSiteUrl || !wpUsername || !wpAppPassword) {
      toast.error('Please fill in all fields');
      return;
    }

    setWpConnecting(true);
    try {
      await api.post(`/seo-engine/company/${companyId}/wordpress/connect`, {
        siteUrl: wpSiteUrl,
        username: wpUsername,
        appPassword: wpAppPassword,
      }, { token: token! });

      toast.success('WordPress connected successfully!');
      setWpDialogOpen(false);
      setWpSiteUrl('');
      setWpUsername('');
      setWpAppPassword('');
      qc.invalidateQueries({ queryKey: ['wp-status', companyId] });

      try {
        const catRes = await api.get<{ categories: any[] }>(`/seo-engine/company/${companyId}/wordpress/categories`, { token: token! });
        setWpCategories(catRes.categories || []);
      } catch {}
    } catch (err: any) {
      toast.error(err.message || 'Could not connect to WordPress');
    } finally {
      setWpConnecting(false);
    }
  };

  const handleWpTest = async () => {
    setWpTesting(true);
    try {
      const res = await api.post<{ connected: boolean; error?: string }>(
        `/seo-engine/company/${companyId}/wordpress/test`, {}, { token: token! }
      );
      if (res.connected) {
        toast.success('WordPress connection is working!');
      } else {
        toast.error(res.error || 'Connection failed');
      }
    } catch {
      toast.error('Could not test connection');
    } finally {
      setWpTesting(false);
    }
  };

  const togglePost = (postId: string) => {
    const next = new Set(selectedPosts);
    if (next.has(postId)) next.delete(postId);
    else next.add(postId);
    setSelectedPosts(next);
  };

  const toggleAllPosts = () => {
    if (selectedPosts.size === blogPosts.length) {
      setSelectedPosts(new Set());
    } else {
      setSelectedPosts(new Set(blogPosts.map((p: any) => p.id)));
    }
  };

  const handlePublish = async () => {
    if (selectedPosts.size === 0) {
      toast.error('Select at least one blog post to publish');
      return;
    }

    setIsPublishing(true);
    try {
      const res = await api.post<{ message: string; results: any[] }>(
        `/seo-engine/company/${companyId}/publish-blogs`,
        {
          blogPostIds: Array.from(selectedPosts),
          status: publishStatus,
          categoryId: selectedCategory ? parseInt(selectedCategory) : undefined,
        },
        { token: token! }
      );
      toast.success(res.message);
      setSelectedPosts(new Set());
    } catch (err: any) {
      toast.error(err.message || 'Could not publish to WordPress');
    } finally {
      setIsPublishing(false);
    }
  };

  const handleDeleteBlog = async (blogId: string) => {
    if (!token || !confirm('Delete this blog post? This cannot be undone.')) return;
    try {
      await api.delete(`/seo-engine/company/${companyId}/blogs/${blogId}`, { token });
      toast.success('Blog post deleted');
      qc.invalidateQueries({ queryKey: ['seo-results'] });
      qc.invalidateQueries({ queryKey: ['seo-blogs'] });
      setExpandedBlog(null);
    } catch {
      toast.error('Could not delete blog post');
    }
  };

  const toggleBlogExpand = async (blogId: string) => {
    if (expandedBlog === blogId) {
      setExpandedBlog(null);
      return;
    }
    setExpandedBlog(blogId);

    if (!blogContent[blogId] && token) {
      try {
        const res = await api.get<any>(`/seo-engine/company/${companyId}/blogs/${blogId}`, { token });
        setBlogContent(prev => ({ ...prev, [blogId]: res.content || '' }));
      } catch {}
    }
  };

  // ─── Pipeline progress (when active) ────────────────────────

  const hasActiveJob = !!activeJobId && jobStatus;

  // ─── Render ──────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-primary" />
            Content Hub
          </h1>
          <p className="text-muted-foreground mt-1">
            Your AI-powered content system — ideas, creation, and publishing in one place
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 shrink-0"
          disabled={suggestionsLoading}
          onClick={() => {
            // Force server to regenerate (bust cache)
            qc.setQueryData(['seo-suggestions', companyId], undefined);
            qc.fetchQuery({
              queryKey: ['seo-suggestions', companyId],
              queryFn: () => api.get(`/seo-engine/company/${companyId}/suggestions?refresh=true`, { token: token! }),
            });
            qc.invalidateQueries({ queryKey: ['seo-results'] });
            qc.invalidateQueries({ queryKey: ['seo-blogs'] });
            toast.success('Refreshing content suggestions...');
          }}
        >
          <RefreshCw className={`w-4 h-4 ${suggestionsLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Last analyzed timestamp */}
      {suggestions?.generatedAt && (
        <p className="text-xs text-muted-foreground -mt-4">
          Last analyzed: {new Date(suggestions.generatedAt).toLocaleDateString()} at {new Date(suggestions.generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>
      )}

      {/* Pipeline Progress (when running) */}
      {hasActiveJob && jobStatus && (
        <ProgressPhase job={jobStatus} />
      )}

      {/* Generating Progress */}
      {isGenerating && (
        <Card className="border-blue-200 bg-blue-50/50">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
              <div>
                <p className="font-medium text-blue-900">Creating content for {generatingTopicCount} topic{generatingTopicCount !== 1 ? 's' : ''}...</p>
                <p className="text-xs text-blue-700 mt-0.5">Generating blog posts, landing pages, banners, and social posts. This may take a minute.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Section A: AI Content Suggestions */}
      {!hasActiveJob && (
        <SuggestionsSection
          suggestions={suggestions}
          isLoading={suggestionsLoading}
          companyId={companyId}
          isInPlan={isInPlan}
          addToPlan={addToPlan}
          removeFromPlan={removeFromPlan}
        />
      )}

      {/* Content Plan */}
      {contentPlan.length > 0 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary" />
                Content Plan ({contentPlan.length} topics)
              </h3>
              <Button size="sm" variant="ghost" className="text-xs text-muted-foreground" onClick={clearPlan}>Clear All</Button>
            </div>

            <div className="space-y-2 mb-4">
              {contentPlan.map((item, i) => (
                <div key={i} className="flex items-center justify-between py-1.5 px-3 bg-background rounded-lg border">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.title || item.keyword}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {item.source === 'idea' ? 'From Content Ideas' : item.source === 'keyword' ? 'From Keywords' : 'From Content Gaps'}
                      {' \u2192 '}Will create: blog post + landing page + banners + social posts
                    </p>
                  </div>
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0 shrink-0" onClick={() => removeFromPlan(item.keyword)}>
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="pt-3 border-t">
              <p className="text-xs text-muted-foreground mb-3">
                Will create: <strong>{contentPlan.length} blog posts</strong>, <strong>{contentPlan.length} landing pages</strong>, <strong>{contentPlan.length * 3} banners</strong>, <strong>{contentPlan.length * 2} social posts</strong>
              </p>
              <Button
                className="w-full gap-2"
                disabled={isGenerating}
                onClick={handleGenerateFromPlan}
              >
                {isGenerating ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Generating {contentPlan.length} topics...</>
                ) : (
                  <><Rocket className="w-4 h-4" /> Generate All Content ({contentPlan.length} topics)</>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Section B: Content Pipeline Status */}
      {!hasActiveJob && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => router.push(`/${companyId}/landing-pages`)}>
            <StatCard
              icon={<FileText className="w-5 h-5 text-blue-500" />}
              label="Landing Pages"
              value={landingPages.length}
              detail={`${landingPages.filter((p: any) => p.status === 'published').length} published`}
            />
          </div>
          <div className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => document.getElementById('blog-section')?.scrollIntoView({ behavior: 'smooth' })}>
            <StatCard
              icon={<PenTool className="w-5 h-5 text-purple-500" />}
              label="Blog Posts"
              value={blogPosts.length}
              detail={`${blogPosts.filter((p: any) => p.status === 'published' || p.status === 'pushed_to_cms').length} published`}
            />
          </div>
          <div className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => router.push(`/${companyId}/marketing`)}>
            <StatCard
              icon={<Share2 className="w-5 h-5 text-pink-500" />}
              label="Social Posts"
              value={socialCount}
              detail="created"
            />
          </div>
          <StatCard
            icon={<Key className="w-5 h-5 text-amber-500" />}
            label="Keywords"
            value={keywordCount}
            detail="tracked"
          />
        </div>
      )}

      {/* Section C: Blog Posts List */}
      {!hasActiveJob && blogPosts.length > 0 && (
        <Card id="blog-section">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold flex items-center gap-2">
                <PenTool className="w-4 h-4" />
                Blog Posts
              </h3>
              {blogPosts.length > 1 && (
                <Button variant="ghost" size="sm" onClick={toggleAllPosts}>
                  {selectedPosts.size === blogPosts.length ? 'Deselect All' : 'Select All'}
                </Button>
              )}
            </div>

            <div className="space-y-3">
              {blogPosts.map((post: any) => (
                <div key={post.id} className="border rounded-lg overflow-hidden">
                  {/* Header -- click to expand */}
                  <div
                    className="p-3 flex items-center gap-3 cursor-pointer hover:bg-muted/30 transition-colors"
                    onClick={() => toggleBlogExpand(post.id)}
                  >
                    <Checkbox checked={selectedPosts.has(post.id)} onClick={(e) => { e.stopPropagation(); togglePost(post.id); }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm truncate">{post.title}</p>
                        {newPostIds.has(post.id) && (
                          <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-[9px] animate-pulse">NEW</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {post.keyword && <Badge variant="outline" className="text-[10px]">{post.keyword}</Badge>}
                        <span className="text-[10px] text-muted-foreground">{post.word_count || post.wordCount} words</span>
                        {post.status === 'pushed_to_cms' || post.cmsPostUrl ? (
                          <div className="flex items-center gap-1">
                            <Badge className="bg-green-100 text-green-700 text-[10px]">On WordPress</Badge>
                            {post.cmsPostUrl && (
                              <a href={post.cmsPostUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-primary hover:underline flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                                <ExternalLink className="w-2.5 h-2.5" /> View
                              </a>
                            )}
                          </div>
                        ) : (
                          <Badge className={`text-[10px] ${post.status === 'draft' ? 'bg-gray-100 text-gray-600' : 'bg-green-100 text-green-700'}`}>{post.status}</Badge>
                        )}
                      </div>
                    </div>
                    <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${expandedBlog === post.id ? 'rotate-180' : ''}`} />
                  </div>

                  {/* Expanded content */}
                  {expandedBlog === post.id && (
                    <div className="border-t">
                      <div className="p-4 max-h-[400px] overflow-y-auto prose prose-sm max-w-none"
                        dangerouslySetInnerHTML={{ __html: blogContent[post.id] || '<p class="text-muted-foreground">Loading preview...</p>' }}
                      />
                      <div className="p-3 bg-muted/20 border-t flex gap-2">
                        <Button size="sm" variant="outline" className="text-xs gap-1" onClick={() => handleDeleteBlog(post.id)}>
                          <Trash2 className="w-3 h-3" /> Delete
                        </Button>
                        <Button size="sm" variant="outline" className="text-xs gap-1" onClick={() => {
                          togglePost(post.id);
                          document.getElementById('wp-publish-section')?.scrollIntoView({ behavior: 'smooth' });
                        }}>
                          <Globe className="w-3 h-3" /> Publish to WordPress
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Section D: WordPress Connection */}
      {!hasActiveJob && (
        <Card>
          <CardContent className="p-6 space-y-4">
            <h3 className="font-semibold flex items-center gap-2">
              <Globe className="w-4 h-4" />
              WordPress
            </h3>

            {wpStatus?.connected ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  <span>Connected to <span className="font-medium">{wpStatus.siteUrl}</span></span>
                  <Button variant="ghost" size="sm" onClick={handleWpTest} disabled={wpTesting}>
                    {wpTesting ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Test'}
                  </Button>
                </div>

                {blogPosts.length > 0 && (
                  <div className="space-y-3">
                    {/* Category selector */}
                    {wpCategories.length > 0 && (
                      <div>
                        <Label className="text-xs">Publish to category</Label>
                        <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                          <SelectTrigger className="h-8 text-xs mt-1">
                            <SelectValue placeholder="Select category..." />
                          </SelectTrigger>
                          <SelectContent>
                            {wpCategories.map(cat => (
                              <SelectItem key={cat.id} value={String(cat.id)}>{cat.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {/* Status selector */}
                    <div>
                      <Label className="text-xs">Publish as</Label>
                      <Select value={publishStatus} onValueChange={(v) => setPublishStatus(v as any)}>
                        <SelectTrigger className="h-8 text-xs mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="draft">Draft (review first)</SelectItem>
                          <SelectItem value="publish">Publish immediately</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Push button */}
                    <Button
                      className="w-full gap-2"
                      onClick={handlePublish}
                      disabled={selectedPosts.size === 0 || isPublishing}
                    >
                      {isPublishing ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Publishing...
                        </>
                      ) : (
                        <>
                          <ArrowRight className="w-4 h-4" />
                          Push {selectedPosts.size} post{selectedPosts.size !== 1 ? 's' : ''} to WordPress
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Connect WordPress to publish blog posts directly to your website
                </p>
                <Button variant="outline" onClick={() => setWpDialogOpen(true)}>
                  <Globe className="w-4 h-4 mr-2" />
                  Connect WordPress
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* WordPress Connect Dialog */}
      <Dialog open={wpDialogOpen} onOpenChange={setWpDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Connect your WordPress site</DialogTitle>
            <DialogDescription>
              Publish blog posts directly to your website
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Site URL</Label>
              <Input
                placeholder="https://yoursite.com"
                value={wpSiteUrl}
                onChange={(e) => setWpSiteUrl(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Username</Label>
              <Input
                placeholder="admin"
                value={wpUsername}
                onChange={(e) => setWpUsername(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Application Password</Label>
              <Input
                type="password"
                placeholder="xxxx xxxx xxxx xxxx"
                value={wpAppPassword}
                onChange={(e) => setWpAppPassword(e.target.value)}
              />
            </div>

            <div className="flex items-start gap-2 p-3 bg-muted rounded-lg text-sm">
              <Info className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
              <p className="text-muted-foreground">
                Create an Application Password in WordPress:{' '}
                <span className="font-medium text-foreground">Users &rarr; Profile &rarr; Application Passwords</span>
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setWpDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleWpConnect} disabled={wpConnecting}>
              {wpConnecting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Connecting...
                </>
              ) : (
                'Save & Connect'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Section A: AI Content Suggestions
// ═══════════════════════════════════════════════════════════════════

function SuggestionsSection({
  suggestions,
  isLoading,
  companyId,
  isInPlan,
  addToPlan,
  removeFromPlan,
}: {
  suggestions: Suggestions | undefined;
  isLoading: boolean;
  companyId: string;
  isInPlan: (keyword: string) => boolean;
  addToPlan: (item: PlanItem) => void;
  removeFromPlan: (keyword: string) => void;
}) {
  // Loading state
  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
            <div>
              <p className="font-medium">Analyzing your business...</p>
              <p className="text-sm text-muted-foreground">AI is preparing content suggestions tailored to your company</p>
            </div>
          </div>
          <div className="space-y-3 mt-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="animate-pulse flex gap-3 p-3 rounded-lg border">
                <div className="w-5 h-5 bg-muted rounded" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-muted rounded w-3/4" />
                  <div className="h-3 bg-muted rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Needs setup — no business context yet
  if (suggestions?.needsSetup) {
    return (
      <Card className="border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20">
        <CardContent className="p-6">
          <div className="flex items-start gap-3">
            <Info className="w-6 h-6 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold">Set up your business first</h3>
              <p className="text-sm text-muted-foreground mt-1">
                To get personalized content suggestions, complete your business profile in the onboarding section.
                This helps the AI understand your products, audience, and goals.
              </p>
              <Button variant="outline" className="mt-3" asChild>
                <Link href={`/${companyId}/settings`}>
                  Go to Settings
                </Link>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const blogTopics = suggestions?.blogTopics || [];
  const keywords = suggestions?.keywordOpportunities || [];
  const gaps = suggestions?.contentGaps || [];

  if (blogTopics.length === 0 && keywords.length === 0 && gaps.length === 0) {
    return null;
  }

  const impactColors: Record<string, string> = {
    high: 'bg-red-100 text-red-700 border-red-200',
    medium: 'bg-amber-100 text-amber-700 border-amber-200',
    low: 'bg-green-100 text-green-700 border-green-200',
  };

  return (
    <div className="space-y-4">
      {/* Blog Topic Suggestions */}
      {blogTopics.length > 0 && (
        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  Content Ideas
                </h3>
                <p className="text-sm text-muted-foreground mt-0.5">
                  AI-recommended topics based on your business
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="text-xs gap-1"
                onClick={() => {
                  blogTopics.forEach(topic => {
                    if (!isInPlan(topic.keyword)) {
                      addToPlan({ title: topic.title, keyword: topic.keyword, searchIntent: topic.searchIntent, source: 'idea', addedAt: Date.now() });
                    }
                  });
                }}
              >
                <Plus className="w-3 h-3" /> Add All to Plan
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {blogTopics.map((topic) => (
                <div
                  key={topic.id}
                  className="p-3 rounded-lg border hover:border-primary/30 transition-all"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{topic.title}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className="text-[10px]">{topic.keyword}</Badge>
                        <Badge className={`text-[10px] ${impactColors[topic.impact]}`}>{topic.impact} impact</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{topic.reason}</p>
                    </div>
                    <Button
                      size="sm"
                      variant={isInPlan(topic.keyword) ? 'default' : 'outline'}
                      className="shrink-0 text-xs h-7 gap-1"
                      onClick={() => isInPlan(topic.keyword)
                        ? removeFromPlan(topic.keyword)
                        : addToPlan({ title: topic.title, keyword: topic.keyword, searchIntent: topic.searchIntent, source: 'idea', addedAt: Date.now() })
                      }
                    >
                      {isInPlan(topic.keyword) ? <><CheckCircle2 className="w-3 h-3" /> In Plan</> : <><Plus className="w-3 h-3" /> Add to Plan</>}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Keyword Ideas & Content Gaps (side by side on desktop) */}
      {(keywords.length > 0 || gaps.length > 0) && (
        <div className="grid gap-4 md:grid-cols-2">
          {keywords.length > 0 && (
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-sm flex items-center gap-2">
                    <Key className="w-4 h-4 text-purple-500" /> Keyword Ideas
                  </h3>
                  <Button size="sm" variant="ghost" className="text-xs" onClick={() => {
                    suggestions?.keywordOpportunities?.forEach((kw: any) => {
                      if (!isInPlan(kw.keyword)) {
                        addToPlan({ title: '', keyword: kw.keyword, searchIntent: kw.intent || 'informational', source: 'keyword', addedAt: Date.now() });
                      }
                    });
                  }}>
                    Add All
                  </Button>
                </div>
                <div className="space-y-1">
                  {keywords.map((kw, i) => (
                    <div key={i} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/30 transition-colors">
                      <span className="text-sm">{kw.keyword}</span>
                      <Button
                        size="sm"
                        variant={isInPlan(kw.keyword) ? 'default' : 'ghost'}
                        className="h-6 text-[10px] px-2"
                        onClick={() => isInPlan(kw.keyword)
                          ? removeFromPlan(kw.keyword)
                          : addToPlan({ title: '', keyword: kw.keyword, searchIntent: kw.intent || 'informational', source: 'keyword', addedAt: Date.now() })
                        }
                      >
                        {isInPlan(kw.keyword) ? '\u2713 Added' : '+ Add'}
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {gaps.length > 0 && (
            <Card>
              <CardContent className="pt-4">
                <h3 className="font-semibold text-sm flex items-center gap-2 mb-3">
                  <AlertCircle className="w-4 h-4 text-amber-500" /> Content Gaps
                </h3>
                <div className="space-y-1">
                  {gaps.map((gap, i) => (
                    <div key={i} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/30 transition-colors">
                      <p className="text-sm text-muted-foreground flex-1 mr-2">{gap}</p>
                      <Button
                        size="sm"
                        variant={isInPlan(gap) ? 'default' : 'ghost'}
                        className="h-6 text-[10px] px-2 shrink-0"
                        onClick={() => isInPlan(gap)
                          ? removeFromPlan(gap)
                          : addToPlan({ title: '', keyword: gap, searchIntent: 'informational', source: 'gap', addedAt: Date.now() })
                        }
                      >
                        {isInPlan(gap) ? '\u2713 Added' : '+ Add'}
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Pipeline Progress
// ═══════════════════════════════════════════════════════════════════

function ProgressPhase({ job }: { job: SEOJob }) {
  return (
    <Card>
      <CardContent className="p-6 space-y-6">
        <div>
          <h2 className="text-lg font-semibold">Building your content system...</h2>
          <p className="text-sm text-muted-foreground mt-1">
            This usually takes a few minutes. You can stay on this page or come back later.
          </p>
        </div>

        {/* Steps */}
        <div className="space-y-4">
          {(job.steps || defaultSteps).map((step) => (
            <StepRow key={step.id} step={step} />
          ))}
        </div>

        {/* Overall progress */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Overall progress</span>
            <span className="font-medium">{Math.round(job.overallProgress || 0)}%</span>
          </div>
          <Progress value={job.overallProgress || 0} className="h-3" />
        </div>
      </CardContent>
    </Card>
  );
}

const defaultSteps: PipelineStep[] = [
  { id: 'scan', label: 'Scanning your website', status: 'running' },
  { id: 'understand', label: 'Understanding your business', status: 'waiting' },
  { id: 'keywords', label: 'Building keyword strategy', status: 'waiting' },
  { id: 'plan', label: 'Planning content', status: 'waiting' },
  { id: 'write', label: 'Writing content', status: 'waiting' },
  { id: 'publish', label: 'Publishing pages', status: 'waiting' },
  { id: 'social', label: 'Creating social posts', status: 'waiting' },
];

function StepRow({ step }: { step: PipelineStep }) {
  const statusIcon = {
    waiting: <Clock className="w-5 h-5 text-muted-foreground" />,
    running: <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />,
    completed: <CheckCircle2 className="w-5 h-5 text-green-500" />,
    failed: <AlertCircle className="w-5 h-5 text-red-500" />,
  };

  return (
    <div className="flex items-center gap-3">
      {statusIcon[step.status]}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${step.status === 'waiting' ? 'text-muted-foreground' : ''}`}>
          {step.label}
        </p>
        {step.result && step.status === 'completed' && (
          <p className="text-xs text-muted-foreground">{step.result}</p>
        )}
        {step.progress && step.status === 'running' && (
          <p className="text-xs text-blue-500">
            {step.progress.current} of {step.progress.total} completed...
          </p>
        )}
        {step.status === 'failed' && (
          <p className="text-xs text-red-500">Failed — will retry automatically</p>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Stat Card
// ═══════════════════════════════════════════════════════════════════

function StatCard({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: number; detail?: string }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        {icon}
        <div>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
          {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
        </div>
      </CardContent>
    </Card>
  );
}
