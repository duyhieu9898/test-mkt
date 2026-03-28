'use client';

import { useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api/client';
import { useAuthStore } from '@/stores/auth-store';
import { useQuery, useQueryClient } from '@tanstack/react-query';

// ─── Types ───────────────────────────────────────────────────────

interface Product {
  name: string;
  description: string;
  url?: string;
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

export default function SEOEnginePage() {
  const params = useParams();
  const companyId = params.companyId as string;
  const token = useAuthStore((state) => state.token);
  const qc = useQueryClient();

  // Active job tracking
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  // Input state
  const [inputTab, setInputTab] = useState<'website' | 'products'>('website');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [products, setProducts] = useState<Product[]>([{ name: '', description: '' }]);
  const [language, setLanguage] = useState('en');
  const [isStarting, setIsStarting] = useState(false);

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

  // ─── Fetch existing results ──────────────────────────────────

  const { data: results } = useQuery<SEOResults>({
    queryKey: ['seo-results', companyId],
    queryFn: () => api.get(`/seo-engine/company/${companyId}/results`, { token: token! }),
    enabled: !!token && !activeJobId,
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
  }

  if (jobStatus?.status === 'failed' && activeJobId) {
    setActiveJobId(null);
    toast.error('SEO Engine encountered an issue. Please try again.');
  }

  // ─── WordPress status ────────────────────────────────────────

  const { data: wpStatus } = useQuery<{ connected: boolean; siteUrl?: string }>({
    queryKey: ['wp-status', companyId],
    queryFn: () => api.post(`/seo-engine/company/${companyId}/wordpress/test`, {}, { token: token! }),
    enabled: !!token && !activeJobId,
  });

  // ─── Handlers ────────────────────────────────────────────────

  const handleStart = async () => {
    if (inputTab === 'website' && !websiteUrl) {
      toast.error('Please enter your website URL');
      return;
    }
    if (inputTab === 'products') {
      const validProducts = products.filter(p => p.name && p.description);
      if (validProducts.length === 0) {
        toast.error('Please add at least one product with a name and description');
        return;
      }
    }

    setIsStarting(true);
    try {
      const body: any = { language };
      if (inputTab === 'website') {
        body.websiteUrl = websiteUrl;
      } else {
        body.products = products.filter(p => p.name && p.description);
      }

      const res = await api.post<{ jobId: string }>(`/seo-engine/company/${companyId}/start`, body, { token: token! });
      setActiveJobId(res.jobId);
      toast.success('SEO Engine started! Building your content system...');
    } catch (err: any) {
      toast.error(err.message || 'Could not start the SEO Engine');
    } finally {
      setIsStarting(false);
    }
  };

  const addProduct = () => {
    setProducts([...products, { name: '', description: '' }]);
  };

  const removeProduct = (index: number) => {
    setProducts(products.filter((_, i) => i !== index));
  };

  const updateProduct = (index: number, field: keyof Product, value: string) => {
    const updated = [...products];
    updated[index] = { ...updated[index], [field]: value };
    setProducts(updated);
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
    } catch (err: any) {
      toast.error(err.message || 'Could not connect to WordPress');
    } finally {
      setWpConnecting(false);
    }
  };

  const handleWpTest = async () => {
    setWpTesting(true);
    try {
      const res = await api.post<{ connected: boolean; error?: string }>(`/seo-engine/company/${companyId}/wordpress/test`, {}, { token: token! });
      if (res.connected) {
        toast.success('WordPress connection is working!');
      } else {
        toast.error(res.error || 'Connection failed');
      }
    } catch (err: any) {
      toast.error('Could not test connection');
    } finally {
      setWpTesting(false);
    }
  };

  const togglePost = (postId: string) => {
    const next = new Set(selectedPosts);
    if (next.has(postId)) {
      next.delete(postId);
    } else {
      next.add(postId);
    }
    setSelectedPosts(next);
  };

  const toggleAllPosts = (posts: any[]) => {
    if (selectedPosts.size === posts.length) {
      setSelectedPosts(new Set());
    } else {
      setSelectedPosts(new Set(posts.map(p => p.id)));
    }
  };

  const handlePublish = async () => {
    if (selectedPosts.size === 0) {
      toast.error('Select at least one blog post to publish');
      return;
    }

    setIsPublishing(true);
    try {
      const res = await api.post<{ message: string; results: any[] }>(`/seo-engine/company/${companyId}/publish-blogs`, {
        blogPostIds: Array.from(selectedPosts),
        status: publishStatus,
      }, { token: token! });

      toast.success(res.message);
      setSelectedPosts(new Set());
    } catch (err: any) {
      toast.error(err.message || 'Could not publish to WordPress');
    } finally {
      setIsPublishing(false);
    }
  };

  // ─── Determine which phase to show ────────────────────────────

  const hasActiveJob = !!activeJobId && jobStatus;
  const hasResults = results && (results.blogPosts.length > 0 || results.landingPages.length > 0);

  // ─── Render ──────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Search className="w-6 h-6 text-primary" />
          SEO Engine
        </h1>
        <p className="text-muted-foreground mt-1">
          Generate a complete SEO content system with one click
        </p>
      </div>

      {/* Phase 2: Progress */}
      {hasActiveJob && jobStatus && (
        <ProgressPhase job={jobStatus} />
      )}

      {/* Phase 3: Results */}
      {!hasActiveJob && hasResults && (
        <ResultsPhase
          results={results!}
          wpStatus={wpStatus}
          selectedPosts={selectedPosts}
          publishStatus={publishStatus}
          isPublishing={isPublishing}
          onTogglePost={togglePost}
          onToggleAll={toggleAllPosts}
          onPublishStatusChange={setPublishStatus}
          onPublish={handlePublish}
          onWpConnect={() => setWpDialogOpen(true)}
          onWpTest={handleWpTest}
          wpTesting={wpTesting}
          onStartNew={() => {
            setActiveJobId(null);
            // Show input phase by clearing results temporarily
            qc.setQueryData(['seo-results', companyId], null);
          }}
        />
      )}

      {/* Phase 1: Input (shown when no active job and no results, or when "Start New" is clicked) */}
      {!hasActiveJob && !hasResults && (
        <InputPhase
          inputTab={inputTab}
          setInputTab={setInputTab}
          websiteUrl={websiteUrl}
          setWebsiteUrl={setWebsiteUrl}
          products={products}
          language={language}
          setLanguage={setLanguage}
          isStarting={isStarting}
          onStart={handleStart}
          onAddProduct={addProduct}
          onRemoveProduct={removeProduct}
          onUpdateProduct={updateProduct}
        />
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
// Phase 1: Input
// ═══════════════════════════════════════════════════════════════════

function InputPhase({
  inputTab, setInputTab, websiteUrl, setWebsiteUrl,
  products, language, setLanguage, isStarting,
  onStart, onAddProduct, onRemoveProduct, onUpdateProduct,
}: {
  inputTab: 'website' | 'products';
  setInputTab: (tab: 'website' | 'products') => void;
  websiteUrl: string;
  setWebsiteUrl: (url: string) => void;
  products: Product[];
  language: string;
  setLanguage: (lang: string) => void;
  isStarting: boolean;
  onStart: () => void;
  onAddProduct: () => void;
  onRemoveProduct: (index: number) => void;
  onUpdateProduct: (index: number, field: keyof Product, value: string) => void;
}) {
  return (
    <Card>
      <CardContent className="p-6 space-y-6">
        <div>
          <h2 className="text-lg font-semibold">How do you want to start?</h2>
          <p className="text-sm text-muted-foreground mt-1">
            We will analyze your business and create keyword strategies, blog posts, landing pages, and social content.
          </p>
        </div>

        <Tabs value={inputTab} onValueChange={(v) => setInputTab(v as any)}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="website" className="flex items-center gap-2">
              <Globe className="w-4 h-4" />
              Website URL
            </TabsTrigger>
            <TabsTrigger value="products" className="flex items-center gap-2">
              <PenTool className="w-4 h-4" />
              Product List
            </TabsTrigger>
          </TabsList>

          <TabsContent value="website" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Your website URL</Label>
              <Input
                placeholder="https://your-website.com"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                type="url"
              />
              <p className="text-xs text-muted-foreground">
                We will scan your website to understand your business, products, and target audience.
              </p>
            </div>
          </TabsContent>

          <TabsContent value="products" className="space-y-4 mt-4">
            <div className="space-y-3">
              {products.map((product, index) => (
                <div key={index} className="flex gap-3 items-start">
                  <div className="flex-1 space-y-2">
                    <Input
                      placeholder="Product name"
                      value={product.name}
                      onChange={(e) => onUpdateProduct(index, 'name', e.target.value)}
                    />
                    <Input
                      placeholder="Brief description"
                      value={product.description}
                      onChange={(e) => onUpdateProduct(index, 'description', e.target.value)}
                    />
                  </div>
                  {products.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="mt-1 shrink-0"
                      onClick={() => onRemoveProduct(index)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={onAddProduct}>
              <Plus className="w-4 h-4 mr-2" />
              Add Product
            </Button>
          </TabsContent>
        </Tabs>

        {/* Language selector */}
        <div className="space-y-2">
          <Label>Content Language</Label>
          <Select value={language} onValueChange={setLanguage}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="en">English</SelectItem>
              <SelectItem value="vi">Vietnamese</SelectItem>
              <SelectItem value="es">Spanish</SelectItem>
              <SelectItem value="fr">French</SelectItem>
              <SelectItem value="de">German</SelectItem>
              <SelectItem value="ja">Japanese</SelectItem>
              <SelectItem value="ko">Korean</SelectItem>
              <SelectItem value="zh">Chinese</SelectItem>
              <SelectItem value="th">Thai</SelectItem>
              <SelectItem value="pt">Portuguese</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Start button */}
        <Button
          size="lg"
          className="w-full text-base"
          onClick={onStart}
          disabled={isStarting}
        >
          {isStarting ? (
            <>
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              Starting...
            </>
          ) : (
            <>
              <Rocket className="w-5 h-5 mr-2" />
              Start SEO Engine
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Phase 2: Progress
// ═══════════════════════════════════════════════════════════════════

function ProgressPhase({ job }: { job: SEOJob }) {
  return (
    <Card>
      <CardContent className="p-6 space-y-6">
        <div>
          <h2 className="text-lg font-semibold">Building your SEO content system...</h2>
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
// Phase 3: Results
// ═══════════════════════════════════════════════════════════════════

function ResultsPhase({
  results, wpStatus, selectedPosts, publishStatus, isPublishing,
  onTogglePost, onToggleAll, onPublishStatusChange, onPublish,
  onWpConnect, onWpTest, wpTesting, onStartNew,
}: {
  results: SEOResults;
  wpStatus: { connected: boolean; siteUrl?: string } | undefined;
  selectedPosts: Set<string>;
  publishStatus: 'draft' | 'publish';
  isPublishing: boolean;
  onTogglePost: (id: string) => void;
  onToggleAll: (posts: any[]) => void;
  onPublishStatusChange: (status: 'draft' | 'publish') => void;
  onPublish: () => void;
  onWpConnect: () => void;
  onWpTest: () => void;
  wpTesting: boolean;
  onStartNew: () => void;
}) {
  const blogPosts = results.blogPosts || [];
  const landingPages = results.landingPages || [];
  const socialPosts = results.socialPosts || [];
  const keywords = results.keywords || [];

  return (
    <div className="space-y-6">
      {/* Success header */}
      <Card className="border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/20">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-8 h-8 text-green-500" />
              <div>
                <h2 className="text-lg font-semibold">SEO Content System Ready!</h2>
                <p className="text-sm text-muted-foreground">
                  Your content has been generated and is ready to use
                </p>
              </div>
            </div>
            <Button variant="outline" onClick={onStartNew}>
              <Rocket className="w-4 h-4 mr-2" />
              Run Again
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Stats overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={<FileText className="w-5 h-5 text-blue-500" />}
          label="Landing Pages"
          value={landingPages.length}
        />
        <StatCard
          icon={<PenTool className="w-5 h-5 text-purple-500" />}
          label="Blog Posts"
          value={blogPosts.length}
        />
        <StatCard
          icon={<Share2 className="w-5 h-5 text-pink-500" />}
          label="Social Posts"
          value={socialPosts.length}
        />
        <StatCard
          icon={<Key className="w-5 h-5 text-amber-500" />}
          label="Keywords"
          value={keywords.length}
        />
      </div>

      {/* Blog Posts List */}
      {blogPosts.length > 0 && (
        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold flex items-center gap-2">
                <PenTool className="w-4 h-4" />
                Blog Posts
              </h3>
              {blogPosts.length > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onToggleAll(blogPosts)}
                >
                  {selectedPosts.size === blogPosts.length ? 'Deselect All' : 'Select All'}
                </Button>
              )}
            </div>

            <div className="space-y-3">
              {blogPosts.map((post: any) => (
                <div
                  key={post.id}
                  className="flex items-start gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                >
                  <Checkbox
                    checked={selectedPosts.has(post.id)}
                    onCheckedChange={() => onTogglePost(post.id)}
                    className="mt-1"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{post.title}</p>
                    <div className="flex items-center gap-3 mt-1">
                      {post.keyword && (
                        <Badge variant="secondary" className="text-xs">
                          {post.keyword}
                        </Badge>
                      )}
                      {post.wordCount && (
                        <span className="text-xs text-muted-foreground">
                          {post.wordCount.toLocaleString()} words
                        </span>
                      )}
                      <Badge variant="outline" className="text-xs">
                        Ready
                      </Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* WordPress Integration */}
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
                <Button variant="ghost" size="sm" onClick={onWpTest} disabled={wpTesting}>
                  {wpTesting ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Test'}
                </Button>
              </div>

              {blogPosts.length > 0 && (
                <div className="flex items-center gap-3">
                  <Select value={publishStatus} onValueChange={(v) => onPublishStatusChange(v as any)}>
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">As Draft</SelectItem>
                      <SelectItem value="publish">Publish Now</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    onClick={onPublish}
                    disabled={selectedPosts.size === 0 || isPublishing}
                  >
                    {isPublishing ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Publishing...
                      </>
                    ) : (
                      <>
                        <ArrowRight className="w-4 h-4 mr-2" />
                        Push {selectedPosts.size > 0 ? `${selectedPosts.size} Post${selectedPosts.size > 1 ? 's' : ''}` : 'Selected'} to WordPress
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
              <Button variant="outline" onClick={onWpConnect}>
                <Globe className="w-4 h-4 mr-2" />
                Connect WordPress
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Landing Pages */}
      {landingPages.length > 0 && (
        <Card>
          <CardContent className="p-6 space-y-4">
            <h3 className="font-semibold flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Landing Pages
            </h3>
            <div className="space-y-2">
              {landingPages.map((page: any) => (
                <div key={page.id} className="flex items-center justify-between p-3 rounded-lg border">
                  <div>
                    <p className="font-medium text-sm">{page.title}</p>
                    {page.keyword && (
                      <Badge variant="secondary" className="text-xs mt-1">{page.keyword}</Badge>
                    )}
                  </div>
                  {page.url && (
                    <Button variant="ghost" size="sm" asChild>
                      <a href={page.url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        {icon}
        <div>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
