'use client';

import { useState, useCallback } from 'react';
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
  Search, Rocket, Loader2, Plus, X, CheckCircle2, Clock, AlertCircle,
  Globe, FileText, PenTool, Share2, Key, ExternalLink, ArrowRight, Info,
  Sparkles, BarChart3, Trash2, Eye, Zap, RefreshCw, ChevronDown,
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

// ─── Main Page ───────────────────────────────────────────────────

export default function ContentHubPage() {
  const params = useParams();
  const companyId = params.companyId as string;
  const token = useAuthStore((state) => state.token);
  const qc = useQueryClient();
  const router = useRouter();

  // Active job tracking
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  // Suggestion selection
  const [selectedTopics, setSelectedTopics] = useState<Set<string>>(new Set());
  const [isGenerating, setIsGenerating] = useState(false);

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

  // Keyword generation
  const [isGeneratingKeyword, setIsGeneratingKeyword] = useState<string | null>(null);

  // WordPress categories
  const [wpCategories, setWpCategories] = useState<Array<{ id: number; name: string }>>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('');

  // Generation results panel
  const [generationResult, setGenerationResult] = useState<{
    blogs: number;
    landingPages: number;
    banners: number;
    socialPosts: number;
  } | null>(null);

  // Blog expand/preview
  const [expandedBlog, setExpandedBlog] = useState<string | null>(null);
  const [blogContent, setBlogContent] = useState<Record<string, string>>({});

  // Generating progress
  const [generatingTopicCount, setGeneratingTopicCount] = useState(0);

  // Pipeline state
  const [isStartingPipeline, setIsStartingPipeline] = useState(false);

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
  if (wpCategoriesData?.categories && wpCategories.length === 0 && wpCategoriesData.categories.length > 0) {
    setWpCategories(wpCategoriesData.categories);
  }

  // ─── Derived data ───────────────────────────────────────────

  const blogPosts = results?.blogPosts || [];
  const landingPages = results?.landingPages || [];
  const bannerCount = bannersData?.count || bannersData?.data?.length || 0;
  const socialCount = socialData?.count || socialData?.data?.length || 0;
  const keywordCount = suggestions?.keywordOpportunities?.length || results?.keywords?.length || 0;

  // ─── Handlers ────────────────────────────────────────────────

  const toggleTopic = (id: string) => {
    const next = new Set(selectedTopics);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedTopics(next);
  };

  const handleGenerateSelected = async () => {
    if (selectedTopics.size === 0) {
      toast.error('Select at least one topic to generate');
      return;
    }

    const topics = (suggestions?.blogTopics || []).filter(t => selectedTopics.has(t.id));
    await generateFromTopics(topics);
  };

  const handleGenerateAll = async () => {
    const topics = suggestions?.blogTopics || [];
    if (topics.length === 0) return;
    await generateFromTopics(topics);
  };

  const generateFromTopics = async (topics: BlogTopic[]) => {
    setIsGenerating(true);
    setGeneratingTopicCount(topics.length);
    try {
      const res = await api.post<any>(
        `/seo-engine/company/${companyId}/generate-from-suggestion`,
        {
          suggestions: topics.map(t => ({
            title: t.title,
            keyword: t.keyword,
            searchIntent: t.searchIntent,
          })),
          language: 'en',
        },
        { token: token! }
      );
      setGenerationResult(res.counts);
      setTimeout(() => setGenerationResult(null), 30000);
      toast.success(res.message || `Created ${res.counts?.blogs || 0} blog posts, ${res.counts?.landingPages || 0} pages, ${res.counts?.banners || 0} banners, ${res.counts?.socialPosts || 0} social posts`);
      setSelectedTopics(new Set());
      qc.invalidateQueries({ queryKey: ['seo-results'] });
      qc.invalidateQueries({ queryKey: ['seo-blogs'] });
      qc.invalidateQueries({ queryKey: ['banners'] });
      qc.invalidateQueries({ queryKey: ['campaigns'] });
      qc.invalidateQueries({ queryKey: ['landing-pages'] });
    } catch (err: any) {
      toast.error(err.message || 'Could not generate blog posts');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleStartPipeline = async () => {
    setIsStartingPipeline(true);
    try {
      const res = await api.post<{ jobId: string }>(
        `/seo-engine/company/${companyId}/start`,
        { language: 'en' },
        { token: token! }
      );
      setActiveJobId(res.jobId);
      toast.success('Content pipeline started! Building your content system...');
    } catch (err: any) {
      toast.error(err.message || 'Could not start the content pipeline');
    } finally {
      setIsStartingPipeline(false);
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

      // Load categories after successful connect
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

  const handleGenerateFromKeyword = async (kw: any, type: 'blog' | 'all') => {
    if (!token) return;
    setIsGeneratingKeyword(kw.keyword);
    try {
      const res = await api.post<any>(`/seo-engine/company/${companyId}/generate-from-suggestion`, {
        keywords: [{ keyword: kw.keyword, volume: kw.volume, competition: kw.competition || kw.difficulty }],
      }, { token });
      toast.success(res.message || `Content created for "${kw.keyword}"`);
      qc.invalidateQueries({ queryKey: ['seo-results'] });
      qc.invalidateQueries({ queryKey: ['seo-blogs'] });
      qc.invalidateQueries({ queryKey: ['banners'] });
      qc.invalidateQueries({ queryKey: ['landing-pages'] });
    } catch {
      toast.error('Could not generate content');
    } finally {
      setIsGeneratingKeyword(null);
    }
  };

  const handleGenerateFromGap = async (gap: string) => {
    if (!token) return;
    try {
      toast.info(`Creating content for: "${gap.substring(0, 50)}..."`);
      const res = await api.post<any>(`/seo-engine/company/${companyId}/generate-from-suggestion`, {
        keywords: [{ keyword: gap, volume: 'medium', competition: 'medium' }],
      }, { token });
      toast.success(res.message || 'Content created!');
      qc.invalidateQueries({ queryKey: ['seo-results'] });
      qc.invalidateQueries({ queryKey: ['seo-blogs'] });
    } catch {
      toast.error('Could not create content');
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
          selectedTopics={selectedTopics}
          isGenerating={isGenerating}
          companyId={companyId}
          isGeneratingKeyword={isGeneratingKeyword}
          onToggleTopic={toggleTopic}
          onGenerateSelected={handleGenerateSelected}
          onGenerateAll={handleGenerateAll}
          onGenerateFromKeyword={handleGenerateFromKeyword}
          onGenerateFromGap={handleGenerateFromGap}
        />
      )}

      {/* Generation Results Panel */}
      {generationResult && (
        <Card className="border-green-200 bg-green-50/50">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-semibold text-green-900 flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5" /> Content Generated Successfully
                </p>
                <div className="mt-2 space-y-1 text-sm text-green-800">
                  {generationResult.blogs > 0 && (
                    <p className="flex items-center gap-2">
                      <FileText className="w-3.5 h-3.5" /> {generationResult.blogs} Blog Posts
                      <button className="text-xs text-green-600 hover:underline" onClick={() => document.getElementById('blog-section')?.scrollIntoView({ behavior: 'smooth' })}>View below ↓</button>
                    </p>
                  )}
                  {generationResult.landingPages > 0 && (
                    <p className="flex items-center gap-2">
                      <Globe className="w-3.5 h-3.5" /> {generationResult.landingPages} Landing Pages
                      <Link href={`/${companyId}/landing-pages`} className="text-xs text-green-600 hover:underline">Go to Pages →</Link>
                    </p>
                  )}
                  {generationResult.banners > 0 && (
                    <p className="flex items-center gap-2">
                      <PenTool className="w-3.5 h-3.5" /> {generationResult.banners} Banners
                      <Link href={`/${companyId}/marketing`} className="text-xs text-green-600 hover:underline">Go to Marketing →</Link>
                    </p>
                  )}
                  {generationResult.socialPosts > 0 && (
                    <p className="flex items-center gap-2">
                      <Share2 className="w-3.5 h-3.5" /> {generationResult.socialPosts} Social Posts
                      <Link href={`/${companyId}/marketing`} className="text-xs text-green-600 hover:underline">Go to Marketing →</Link>
                    </p>
                  )}
                </div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setGenerationResult(null)}>
                <X className="w-4 h-4" />
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
                      <p className="font-medium text-sm truncate">{post.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {post.keyword && <Badge variant="outline" className="text-[10px]">{post.keyword}</Badge>}
                        <span className="text-[10px] text-muted-foreground">{post.word_count || post.wordCount} words</span>
                        <Badge className={`text-[10px] ${post.status === 'draft' ? 'bg-gray-100 text-gray-600' : 'bg-green-100 text-green-700'}`}>{post.status}</Badge>
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

      {/* Section E: Quick Actions */}
      {!hasActiveJob && (
        <Card>
          <CardContent className="p-6 space-y-4">
            <h3 className="font-semibold flex items-center gap-2">
              <Zap className="w-4 h-4" />
              Quick Actions
            </h3>
            <div className="flex flex-wrap gap-3">
              <Button
                variant="outline"
                className="gap-2"
                disabled={isGenerating || !suggestions?.blogTopics?.length}
                onClick={handleGenerateAll}
              >
                <Plus className="w-4 h-4" />
                New Blog Post from AI
                {isGenerating && <Loader2 className="w-4 h-4 animate-spin" />}
              </Button>

              <Button variant="outline" className="gap-2" asChild>
                <Link href={`/${companyId}/landing-pages?action=generate`}>
                  <FileText className="w-4 h-4" />
                  Create Product Page
                </Link>
              </Button>

              <Button
                className="gap-2"
                disabled={isStartingPipeline}
                onClick={handleStartPipeline}
              >
                {isStartingPipeline ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Starting...
                  </>
                ) : (
                  <>
                    <Rocket className="w-4 h-4" />
                    Run Full Content Pipeline
                  </>
                )}
              </Button>
            </div>
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
  selectedTopics,
  isGenerating,
  companyId,
  isGeneratingKeyword,
  onToggleTopic,
  onGenerateSelected,
  onGenerateAll,
  onGenerateFromKeyword,
  onGenerateFromGap,
}: {
  suggestions: Suggestions | undefined;
  isLoading: boolean;
  selectedTopics: Set<string>;
  isGenerating: boolean;
  companyId: string;
  isGeneratingKeyword: string | null;
  onToggleTopic: (id: string) => void;
  onGenerateSelected: () => void;
  onGenerateAll: () => void;
  onGenerateFromKeyword: (kw: any, type: 'blog' | 'all') => void;
  onGenerateFromGap: (gap: string) => void;
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

  const impactColor: Record<string, string> = {
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
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onGenerateSelected}
                  disabled={selectedTopics.size === 0 || isGenerating}
                >
                  {isGenerating ? (
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  ) : null}
                  Generate Selected ({selectedTopics.size})
                </Button>
                <Button
                  size="sm"
                  onClick={onGenerateAll}
                  disabled={isGenerating}
                >
                  {isGenerating ? (
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4 mr-1" />
                  )}
                  Generate All
                </Button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {blogTopics.map((topic) => (
                <div
                  key={topic.id}
                  className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedTopics.has(topic.id) ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                  }`}
                  onClick={() => onToggleTopic(topic.id)}
                >
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={selectedTopics.has(topic.id)}
                      onCheckedChange={() => onToggleTopic(topic.id)}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm leading-tight">{topic.title}</p>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <Badge variant="secondary" className="text-xs">
                          {topic.keyword}
                        </Badge>
                        <Badge variant="outline" className={`text-xs ${impactColor[topic.impact] || ''}`}>
                          {topic.impact} impact
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1.5 line-clamp-1">
                        {topic.reason}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Keyword Opportunities & Content Gaps (side by side on desktop) */}
      {(keywords.length > 0 || gaps.length > 0) && (
        <div className="grid gap-4 md:grid-cols-2">
          {keywords.length > 0 && (
            <Card>
              <CardContent className="p-6 space-y-3">
                <h3 className="font-semibold flex items-center gap-2 text-sm">
                  <Key className="w-4 h-4 text-amber-500" />
                  Keyword Opportunities
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-muted-foreground border-b">
                        <th className="pb-2 font-medium">Keyword</th>
                        <th className="pb-2 font-medium">Volume</th>
                        <th className="pb-2 font-medium">Difficulty</th>
                        <th className="text-right text-xs font-medium text-muted-foreground p-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {keywords.map((kw, i) => (
                        <tr key={i}>
                          <td className="py-2 font-medium">{kw.keyword}</td>
                          <td className="py-2">
                            <Badge variant="outline" className="text-xs capitalize">{kw.volume}</Badge>
                          </td>
                          <td className="py-2">
                            <Badge
                              variant="outline"
                              className={`text-xs capitalize ${
                                kw.difficulty === 'easy' ? 'text-green-700 border-green-300' :
                                kw.difficulty === 'hard' ? 'text-red-700 border-red-300' :
                                'text-amber-700 border-amber-300'
                              }`}
                            >
                              {kw.difficulty}
                            </Badge>
                          </td>
                          <td className="p-2 text-right">
                            <div className="flex gap-1 justify-end">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 text-[10px] px-2"
                                disabled={isGeneratingKeyword === kw.keyword}
                                onClick={() => onGenerateFromKeyword(kw, 'blog')}
                              >
                                {isGeneratingKeyword === kw.keyword ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />}
                                Blog
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 text-[10px] px-2"
                                disabled={isGeneratingKeyword === kw.keyword}
                                onClick={() => onGenerateFromKeyword(kw, 'all')}
                              >
                                {isGeneratingKeyword === kw.keyword ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                                All
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {gaps.length > 0 && (
            <Card>
              <CardContent className="p-6 space-y-3">
                <h3 className="font-semibold flex items-center gap-2 text-sm">
                  <AlertCircle className="w-4 h-4 text-blue-500" />
                  Content Gaps
                </h3>
                <div className="space-y-0">
                  {gaps.map((gap, i) => (
                    <div key={i} className="flex items-center justify-between py-1.5 border-b last:border-0">
                      <p className="text-sm text-muted-foreground flex-1">{gap}</p>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 text-[10px] px-2 shrink-0 ml-2 gap-1"
                        onClick={() => onGenerateFromGap(gap)}
                      >
                        <Sparkles className="w-3 h-3" /> Create
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
