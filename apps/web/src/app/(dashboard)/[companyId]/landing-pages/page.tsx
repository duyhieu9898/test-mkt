'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
// router used for navigation
import Link from 'next/link';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageGeneratorWizard, type PageConfig } from '@/components/landing-pages/page-generator-wizard';
import {
  Globe,
  Plus,
  CalendarDays,
  FileText,
  Megaphone,
  Search,
  ExternalLink,
  Eye,
  Trash2,
  MoreHorizontal,
  Loader2,
  Sparkles,
  Users,
  TrendingUp,
  Clock,
  CheckCircle2,
  Archive,
  Copy,
  Settings,
  BarChart3,
  Image,
  Share2,
  XCircle,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api/client';
import { useAuthStore } from '@/stores/auth-store';
import {
  useLandingPages,
  useGenerateLandingPage,
  useUpdateLandingPageStatus,
  useDeleteLandingPage,
  type LandingPage,
} from '@/lib/api/hooks';

const statusConfig: Record<
  string,
  { label: string; color: string; icon: React.ReactNode }
> = {
  draft: {
    label: 'Draft',
    color: 'bg-gray-100 text-gray-600 border-gray-200',
    icon: <Clock className="w-3 h-3" />,
  },
  generating: {
    label: 'Generating',
    color: 'bg-blue-50 text-blue-600 border-blue-200',
    icon: <Loader2 className="w-3 h-3 animate-spin" />,
  },
  ready: {
    label: 'Ready',
    color: 'bg-amber-50 text-amber-700 border-amber-200',
    icon: <CheckCircle2 className="w-3 h-3" />,
  },
  published: {
    label: 'Published',
    color: 'bg-green-50 text-green-700 border-green-200',
    icon: <Globe className="w-3 h-3" />,
  },
  archived: {
    label: 'Archived',
    color: 'bg-gray-100 text-gray-500 border-gray-200',
    icon: <Archive className="w-3 h-3" />,
  },
};

const styleOptions = [
  { value: 'modern', label: 'Modern', description: 'Clean, contemporary design' },
  { value: 'minimal', label: 'Minimal', description: 'Simple and focused' },
  { value: 'bold', label: 'Bold', description: 'High contrast and impactful' },
  { value: 'professional', label: 'Professional', description: 'Corporate and trustworthy' },
  { value: 'playful', label: 'Playful', description: 'Fun and energetic' },
  { value: 'elegant', label: 'Elegant', description: 'Sophisticated and refined' },
];

export default function LandingPagesPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const companyId = params.companyId as string;

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [generatingPageId, setGeneratingPageId] = useState<string | null>(null);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [publishPageId, setPublishPageId] = useState<string | null>(null);
  const [publishTarget, setPublishTarget] = useState<'builtin' | 'wordpress' | 'aws'>('builtin');
  const [publishWpPath, setPublishWpPath] = useState('');
  const [publishWpStatus, setPublishWpStatus] = useState<'draft' | 'publish'>('publish');
  const [isPublishing, setIsPublishing] = useState(false);
  const [awsBucket, setAwsBucket] = useState('');
  const [awsRegion, setAwsRegion] = useState('ap-southeast-1');
  const [awsAccessKey, setAwsAccessKey] = useState('');
  const [awsSecretKey, setAwsSecretKey] = useState('');
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();

  // Auto-open dialog if action=generate query param is present
  useEffect(() => {
    if (searchParams.get('action') === 'generate') {
      setIsCreateDialogOpen(true);
      // Clean up the URL
      router.replace(`/${companyId}/landing-pages`);
    }
  }, [searchParams, companyId, router]);
  // Old state removed — wizard handles everything

  const { data: pages, isLoading } = useLandingPages(companyId);
  const generatePage = useGenerateLandingPage();
  const updateStatus = useUpdateLandingPageStatus();
  const deletePage = useDeleteLandingPage();

  const filteredPages = (pages || []).filter((page) => {
    const matchesSearch =
      page.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      page.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || page.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // handleGeneratePage is now handled by PageGeneratorWizard

  const handleGenerateContent = async (pageId: string, types: string[]) => {
    setGeneratingPageId(pageId);
    toast.info('Generating content from your page...');
    try {
      await api.post(
        `/landing-pages/company/${companyId}/pages/${pageId}/generate-content`,
        { types },
        { token: token! }
      );
      toast.success('Content generated! Check Content Hub and Marketing for your new content.');
      queryClient.invalidateQueries({ queryKey: ['seo-results', companyId] });
      queryClient.invalidateQueries({ queryKey: ['landingPages', companyId] });
    } catch {
      toast.error('Could not generate content. Please try again.');
    } finally {
      setGeneratingPageId(null);
    }
  };

  const handlePublishClick = (pageId: string) => {
    setPublishPageId(pageId);
    setPublishDialogOpen(true);
  };

  const handlePublish = async () => {
    if (!token || !publishPageId) return;
    setIsPublishing(true);
    try {
      const body: any = { target: publishTarget };

      if (publishTarget === 'wordpress') {
        body.wordpress = {
          parentPath: publishWpPath || undefined,
          pageStatus: publishWpStatus,
        };
      } else if (publishTarget === 'aws') {
        if (!awsBucket || !awsAccessKey || !awsSecretKey) {
          toast.error('Please fill in all AWS fields');
          setIsPublishing(false);
          return;
        }
        body.aws = {
          bucket: awsBucket,
          region: awsRegion,
          accessKeyId: awsAccessKey,
          secretAccessKey: awsSecretKey,
        };
      }

      const res = await api.post<{ success: boolean; publishedUrl: string; message: string }>(
        `/landing-pages/${publishPageId}/publish`, body, { token }
      );

      if (res.success) {
        toast.success(res.message);
        setPublishDialogOpen(false);
        queryClient.invalidateQueries({ queryKey: ['landingPages', companyId] });
      } else {
        toast.error('Publishing failed');
      }
    } catch (err: any) {
      toast.error(err.message || 'Could not publish page');
    } finally {
      setIsPublishing(false);
    }
  };

  const handleUnpublish = async (pageId: string) => {
    if (!token) return;
    try {
      await api.post(`/landing-pages/${pageId}/unpublish`, {}, { token });
      toast.success('Page unpublished');
      queryClient.invalidateQueries({ queryKey: ['landingPages', companyId] });
    } catch {
      toast.error('Could not unpublish');
    }
  };

  const handleArchive = async (pageId: string) => {
    try {
      await updateStatus.mutateAsync({ pageId, status: 'archived' });
      toast.success('Landing page archived');
    } catch (error) {
      toast.error('Failed to archive page');
    }
  };

  const handleDelete = async (pageId: string) => {
    if (confirm('Are you sure you want to delete this landing page?')) {
      try {
        await deletePage.mutateAsync(pageId);
        toast.success('Landing page deleted');
      } catch (error) {
        toast.error('Failed to delete page');
      }
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  // Stats
  const stats = {
    total: pages?.length || 0,
    published: pages?.filter((p) => p.status === 'published').length || 0,
    totalVisitors: pages?.reduce((acc, p) => acc + p.totalVisitors, 0) || 0,
    totalLeads: pages?.reduce((acc, p) => acc + p.totalLeads, 0) || 0,
  };

  // Content calendar from tasks
  const contentCalendar = (pages || []).map((p) => {
    const ctx = p.businessContext as any;
    return {
      id: p.id,
      title: p.name,
      keyword: ctx?.keyword || '',
      status: p.status,
      type: ctx?.pageType || 'page',
      createdAt: p.createdAt,
    };
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Pages</h1>
          <p className="text-gray-500 mt-1">
            Landing pages, content, and publishing
          </p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Sparkles className="w-4 h-4" />
              Generate Page
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" />
                Create Landing Page
              </DialogTitle>
              <DialogDescription>
                Design your page step by step — AI generates the content
              </DialogDescription>
            </DialogHeader>
            <PageGeneratorWizard
              companyName={undefined}
              companyIndustry={undefined}
              isGenerating={generatePage.isPending}
              onCancel={() => setIsCreateDialogOpen(false)}
              onGenerate={async (config: PageConfig) => {
                const prompt = `${config.productDescription}. Target: ${config.targetAudience}. Value: ${config.valueProposition}`;
                toast.loading('Generating landing page...', { id: 'generate' });
                try {
                  const result = await generatePage.mutateAsync({
                    companyId,
                    prompt,
                    style: config.visualStyle as any,
                    primaryColor: config.primaryColor,
                    includeFeatures: config.sections.includes('features'),
                    includePricing: config.sections.includes('pricing'),
                    includeTestimonials: config.sections.includes('testimonials'),
                    includeFAQ: config.sections.includes('faq'),
                    language: config.language,
                    attachmentText: config.attachmentText,
                    images: config.images,
                  });
                  toast.success(`Page "${result.data.name}" created!`, { id: 'generate' });
                  setIsCreateDialogOpen(false);
                } catch (error) {
                  toast.error('Failed to generate page', { id: 'generate' });
                }
              }}
            />
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Pages</p>
                <p className="text-2xl font-bold text-foreground">{stats.total}</p>
              </div>
              <div className="p-3 bg-blue-50 rounded-lg">
                <Globe className="w-5 h-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Published</p>
                <p className="text-2xl font-bold text-foreground">{stats.published}</p>
              </div>
              <div className="p-3 bg-green-50 rounded-lg">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Visitors</p>
                <p className="text-2xl font-bold text-foreground">
                  {stats.totalVisitors.toLocaleString()}
                </p>
              </div>
              <div className="p-3 bg-purple-50 rounded-lg">
                <Users className="w-5 h-5 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Leads</p>
                <p className="text-2xl font-bold text-foreground">
                  {stats.totalLeads.toLocaleString()}
                </p>
              </div>
              <div className="p-3 bg-amber-50 rounded-lg">
                <TrendingUp className="w-5 h-5 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs: Pages + Content Calendar */}
      <Tabs defaultValue="pages">
        <TabsList>
          <TabsTrigger value="pages" className="gap-1">
            <FileText className="w-3.5 h-3.5" />
            Pages
          </TabsTrigger>
          <TabsTrigger value="calendar" className="gap-1">
            <CalendarDays className="w-3.5 h-3.5" />
            Content Calendar
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pages" className="space-y-6 mt-4">
      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search pages..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="ready">Ready</SelectItem>
            <SelectItem value="published">Published</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Pages Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      ) : filteredPages.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Globe className="w-12 h-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">No landing pages yet</h3>
            <p className="text-muted-foreground text-center max-w-md mb-4">
              Generate your first AI-powered landing page to start capturing leads
            </p>
            <Button onClick={() => setIsCreateDialogOpen(true)} className="gap-2">
              <Sparkles className="w-4 h-4" />
              Generate Your First Page
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence mode="popLayout">
            {filteredPages.map((page) => (
              <motion.div
                key={page.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
              >
                <Card
                  className="overflow-hidden hover:shadow-md transition-shadow group cursor-pointer"
                  onClick={() => router.push(`/${companyId}/landing-pages/${page.id}`)}
                >
                  {/* Preview Area */}
                  <div
                    className="h-36 relative overflow-hidden"
                    style={!(page.content as any)?.heroImage ? {
                      background: `linear-gradient(135deg, ${page.primaryColor}15, ${page.primaryColor}30)`,
                    } : undefined}
                  >
                    {(page.content as any)?.heroImage ? (
                      <img src={(page.content as any).heroImage} className="w-full h-36 object-cover" alt={page.name} />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div
                          className="w-20 h-20 rounded-full opacity-20"
                          style={{ backgroundColor: page.primaryColor }}
                        />
                      </div>
                    )}
                    <div className="absolute bottom-3 left-3">
                      <Badge
                        variant="outline"
                        className={`${statusConfig[page.status]?.color || statusConfig.draft.color} gap-1`}
                      >
                        {statusConfig[page.status]?.icon || statusConfig.draft.icon}
                        {statusConfig[page.status]?.label || page.status}
                      </Badge>
                    </div>
                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="secondary"
                            size="icon"
                            className="h-8 w-8"
                          >
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={(e) => { e.stopPropagation(); router.push(`/${companyId}/landing-pages/${page.id}`); }}
                          >
                            <Eye className="w-4 h-4 mr-2" />
                            Preview
                          </DropdownMenuItem>
                          {page.status === 'ready' && (
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handlePublishClick(page.id); }}>
                              <Globe className="w-4 h-4 mr-2" />
                              Publish
                            </DropdownMenuItem>
                          )}
                          {page.status === 'published' && (
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleUnpublish(page.id); }}>
                              <XCircle className="w-4 h-4 mr-2" />
                              Unpublish
                            </DropdownMenuItem>
                          )}
                          {page.publishedUrl && (
                            <DropdownMenuItem onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(page.publishedUrl || '');
                              toast.success('URL copied!');
                            }}>
                              <Copy className="w-4 h-4 mr-2" />
                              Copy URL
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/${companyId}/landing-pages/${page.id}/edit`);
                          }}>
                            <Settings className="w-4 h-4 mr-2" />
                            Edit Page
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/${companyId}/analytics`);
                          }}>
                            <BarChart3 className="w-4 h-4 mr-2" />
                            View Analytics
                          </DropdownMenuItem>
                          {page.status === 'draft' && (
                            <DropdownMenuItem onClick={(e) => {
                              e.stopPropagation();
                              router.push(`/${companyId}/marketing`);
                            }}>
                              <Megaphone className="w-4 h-4 mr-2" />
                              Create Campaign
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          {page.status !== 'archived' && (
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleArchive(page.id); }}>
                              <Archive className="w-4 h-4 mr-2" />
                              Archive
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            className="text-red-600"
                            onClick={(e) => { e.stopPropagation(); handleDelete(page.id); }}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                  <CardContent className="p-4">
                    <h3 className="font-semibold text-foreground truncate">{page.name}</h3>
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                      {page.description || page.businessContext?.valueProposition || 'No description'}
                    </p>
                    <div className="flex items-center justify-between mt-4 pt-3 border-t">
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          {page.totalVisitors}
                        </span>
                        <span className="flex items-center gap-1">
                          <TrendingUp className="w-3 h-3" />
                          {page.totalLeads}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(page.createdAt)}
                      </span>
                    </div>
                    {page.status === 'published' && page.publishedUrl && (
                      <div className="mt-2 px-2 py-1.5 bg-green-50 rounded-md flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <CheckCircle2 className="w-3 h-3 text-green-600 shrink-0" />
                        <a
                          href={page.publishedUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-green-700 hover:underline truncate flex-1"
                        >
                          {page.publishedUrl}
                        </a>
                        <ExternalLink className="w-3 h-3 text-green-600 shrink-0" />
                      </div>
                    )}
                    {page.status === 'published' && (
                      <div className="flex items-center gap-2 mt-2" onClick={(e) => e.stopPropagation()}>
                        <Button size="sm" variant="outline" className="text-xs gap-1" onClick={() => handleUnpublish(page.id)}>
                          <XCircle className="w-3 h-3" /> Unpublish
                        </Button>
                      </div>
                    )}
                    {page.status === 'published' && (
                      <div className="flex gap-1.5 mt-2 pt-2 border-t flex-wrap" onClick={(e) => e.stopPropagation()}>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs gap-1"
                          disabled={generatingPageId === page.id}
                          onClick={() => handleGenerateContent(page.id, ['blog'])}
                        >
                          <FileText className="w-3 h-3" /> Blog Posts
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs gap-1"
                          disabled={generatingPageId === page.id}
                          onClick={() => handleGenerateContent(page.id, ['banner'])}
                        >
                          <Image className="w-3 h-3" /> Banners
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs gap-1"
                          disabled={generatingPageId === page.id}
                          onClick={() => handleGenerateContent(page.id, ['social'])}
                        >
                          <Share2 className="w-3 h-3" /> Social
                        </Button>
                        <Button
                          size="sm"
                          className="text-xs gap-1 bg-primary"
                          disabled={generatingPageId === page.id}
                          onClick={() => handleGenerateContent(page.id, ['blog', 'banner', 'social'])}
                        >
                          {generatingPageId === page.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Sparkles className="w-3 h-3" />
                          )}
                          Generate All
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
        </TabsContent>

        {/* Content Calendar Tab */}
        <TabsContent value="calendar" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <div className="p-4 border-b">
                <h3 className="font-semibold">Content Calendar</h3>
                <p className="text-sm text-muted-foreground">Your content pipeline — what's been created and what's planned</p>
              </div>
              {contentCalendar.length > 0 ? (
                <div className="divide-y">
                  {contentCalendar.map((item) => (
                    <div key={item.id} className="flex items-center gap-4 p-4 hover:bg-muted/50">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${
                        item.status === 'published' ? 'bg-green-500' :
                        item.status === 'ready' ? 'bg-blue-500' :
                        item.status === 'draft' ? 'bg-amber-500' :
                        'bg-gray-300'
                      }`} />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{item.title}</p>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                          {item.keyword && <span>Keyword: {item.keyword}</span>}
                          <span className="capitalize">{item.type}</span>
                        </div>
                      </div>
                      <Badge variant={
                        item.status === 'published' ? 'success' :
                        item.status === 'ready' ? 'outline' :
                        'secondary'
                      } className="capitalize shrink-0 text-xs">
                        {item.status}
                      </Badge>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {new Date(item.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-12 text-center">
                  <CalendarDays className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                  <h3 className="font-semibold mb-1">No content planned yet</h3>
                  <p className="text-sm text-muted-foreground">Generate pages and content will appear here</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Publish Dialog */}
      <Dialog open={publishDialogOpen} onOpenChange={setPublishDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Publish Landing Page</DialogTitle>
            <DialogDescription>Choose where to publish your page</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3">
            <div className="space-y-2">
              {/* Built-in */}
              <div
                className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${publishTarget === 'builtin' ? 'border-primary bg-primary/5' : 'border-muted hover:border-primary/30'}`}
                onClick={() => setPublishTarget('builtin')}
              >
                <div className="flex items-center gap-2">
                  <div className={`w-4 h-4 rounded-full border-2 ${publishTarget === 'builtin' ? 'border-primary bg-primary' : 'border-muted-foreground/30'}`} />
                  <div>
                    <p className="font-medium text-sm">Built-in Hosting</p>
                    <p className="text-xs text-muted-foreground">Instant — hosted by 1Person</p>
                  </div>
                </div>
              </div>

              {/* WordPress */}
              <div
                className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${publishTarget === 'wordpress' ? 'border-primary bg-primary/5' : 'border-muted hover:border-primary/30'}`}
                onClick={() => setPublishTarget('wordpress')}
              >
                <div className="flex items-center gap-2">
                  <div className={`w-4 h-4 rounded-full border-2 ${publishTarget === 'wordpress' ? 'border-primary bg-primary' : 'border-muted-foreground/30'}`} />
                  <div>
                    <p className="font-medium text-sm">WordPress</p>
                    <p className="text-xs text-muted-foreground">Publish as a page on your WordPress site</p>
                  </div>
                </div>
                {publishTarget === 'wordpress' && (
                  <div className="mt-3 pl-6 space-y-2">
                    <div>
                      <Label className="text-xs">Parent page path (optional)</Label>
                      <Input
                        value={publishWpPath}
                        onChange={(e) => setPublishWpPath(e.target.value)}
                        placeholder="/en/products-land"
                        className="text-xs h-8 mt-1"
                      />
                      <p className="text-[10px] text-muted-foreground mt-0.5">Leave empty to publish at root level</p>
                    </div>
                    <div>
                      <Label className="text-xs">Status</Label>
                      <Select value={publishWpStatus} onValueChange={(v) => setPublishWpStatus(v as any)}>
                        <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="publish">Publish immediately</SelectItem>
                          <SelectItem value="draft">Save as draft</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </div>

              {/* AWS S3 */}
              <div
                className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${publishTarget === 'aws' ? 'border-primary bg-primary/5' : 'border-muted hover:border-primary/30'}`}
                onClick={() => setPublishTarget('aws')}
              >
                <div className="flex items-center gap-2">
                  <div className={`w-4 h-4 rounded-full border-2 ${publishTarget === 'aws' ? 'border-primary bg-primary' : 'border-muted-foreground/30'}`} />
                  <div>
                    <p className="font-medium text-sm">AWS S3</p>
                    <p className="text-xs text-muted-foreground">Host as static page on Amazon S3</p>
                  </div>
                </div>
                {publishTarget === 'aws' && (
                  <div className="mt-3 pl-6 space-y-2">
                    <Input value={awsBucket} onChange={(e) => setAwsBucket(e.target.value)} placeholder="Bucket name" className="text-xs h-8" />
                    <Input value={awsRegion} onChange={(e) => setAwsRegion(e.target.value)} placeholder="Region (e.g., ap-southeast-1)" className="text-xs h-8" />
                    <Input value={awsAccessKey} onChange={(e) => setAwsAccessKey(e.target.value)} placeholder="Access Key ID" className="text-xs h-8" />
                    <Input value={awsSecretKey} onChange={(e) => setAwsSecretKey(e.target.value)} placeholder="Secret Access Key" type="password" className="text-xs h-8" />
                  </div>
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPublishDialogOpen(false)}>Cancel</Button>
            <Button onClick={handlePublish} disabled={isPublishing} className="gap-2">
              {isPublishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
              {isPublishing ? 'Publishing...' : 'Publish'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
