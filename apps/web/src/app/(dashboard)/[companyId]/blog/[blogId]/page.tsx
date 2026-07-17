'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  ArrowLeft, Save, Eye, Globe, Loader2, Image as ImageIcon,
  Bold, Italic, Heading2, Heading3, Link2, List, X, Plus, Trash2,
  AlertTriangle, ExternalLink, Code2, Github,
  Rocket,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api/client';
import { useAuthStore } from '@/stores/auth-store';
import { useQuery, useQueryClient } from '@tanstack/react-query';

// ─── Types ────────────────────────────────────────────────────────

interface BlogPost {
  id: string;
  companyId: string;
  title: string;
  slug: string;
  keyword: string | null;
  searchIntent: string | null;
  metaDescription: string | null;
  content: string;
  excerpt: string | null;
  tags: string[];
  faq: Array<{ question: string; answer: string }>;
  wordCount: number | null;
  status: string;
  cmsPostId: number | null;
  cmsPostUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

type PublishingDestinationType = 'wordpress' | 'custom_api' | 'github';

interface PublishingSettings {
  destinationType?: PublishingDestinationType;
  destinationName?: string;
  customApi?: {
    endpointUrl?: string;
  };
  github?: {
    repository?: string;
    branch?: string;
    contentFolder?: string;
    fileFormat?: 'markdown' | 'mdx';
  };
}

// ─── Page ─────────────────────────────────────────────────────────

export default function BlogEditorPage() {
  const params = useParams();
  const router = useRouter();
  const companyId = params.companyId as string;
  const blogId = params.blogId as string;
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();

  // Editor state
  const [title, setTitle] = useState('');
  const [keyword, setKeyword] = useState('');
  const [metaDescription, setMetaDescription] = useState('');
  const [content, setContent] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [faq, setFaq] = useState<Array<{ question: string; answer: string }>>([]);
  const [newTag, setNewTag] = useState('');

  // UI state
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishConfirmOpen, setPublishConfirmOpen] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [outputTargets, setOutputTargets] = useState({
    website: true,
    linkedin: true,
    facebook: false,
    instagram: false,
  });
  const [wpCategories, setWpCategories] = useState<Array<{ id: number; name: string }>>([]);
  const [wpPages, setWpPages] = useState<Array<{ id: number; title: string; slug: string; link: string; parent: number }>>([]);
  const [publishPlacement, setPublishPlacement] = useState<'post_category' | 'child_page'>('post_category');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedParentPage, setSelectedParentPage] = useState('');
  const [showPreview, setShowPreview] = useState(true);
  const [imagePickerOpen, setImagePickerOpen] = useState(false);
  const [libraryAssets, setLibraryAssets] = useState<any[]>([]);

  const editorRef = useRef<HTMLDivElement>(null);
  const initialLoadDone = useRef(false);

  // ─── Fetch blog post ──────────────────────────────────────────

  const { data: post, isLoading } = useQuery<BlogPost>({
    queryKey: ['blog-post', blogId],
    queryFn: () => api.get(`/seo-engine/company/${companyId}/blogs/${blogId}`, { token: token! }),
    enabled: !!token && !!blogId,
  });

  const {
    data: publishingInfo,
    isLoading: publishingLoading,
    isFetching: publishingFetching,
    refetch: refetchPublishingInfo,
  } = useQuery<{
    data: PublishingSettings;
    wordpress: { siteUrl?: string; username?: string; connected?: boolean } | null;
  }>({
    queryKey: ['publishing-settings', companyId],
    queryFn: () => api.get(`/publishing/${companyId}`, { token: token! }),
    enabled: !!token && !!companyId && publishConfirmOpen,
    staleTime: 0,
  });

  const publishing = publishingInfo?.data;
  const publishingType = publishing?.destinationType || 'wordpress';
  const publishingLabel = publishing?.destinationName?.trim()
    || (publishingType === 'custom_api'
      ? 'Custom API'
      : publishingType === 'github'
        ? 'GitHub Repo'
        : 'WordPress');
  const publishingTarget = publishingType === 'custom_api'
    ? publishing?.customApi?.endpointUrl
    : publishingType === 'github'
      ? [
        publishing?.github?.repository,
        publishing?.github?.branch ? `branch ${publishing.github.branch}` : null,
      ].filter(Boolean).join(' on ')
      : publishingInfo?.wordpress?.siteUrl;
  const PublishingIcon = publishingType === 'custom_api'
    ? Code2
    : publishingType === 'github'
      ? Github
      : Globe;
  const publishingBusy = publishingLoading || publishingFetching;
  const canPublishToDestination = !publishingBusy && !!publishingTarget;

  const {
    data: wpCategoriesData,
    refetch: refetchWpCategories,
  } = useQuery<{ categories: Array<{ id: number; name: string }> }>({
    queryKey: ['wp-categories', companyId],
    queryFn: () => api.get(`/seo-engine/company/${companyId}/wordpress/categories`, { token: token! }),
    enabled: !!token && publishConfirmOpen && outputTargets.website && publishingType === 'wordpress',
    staleTime: 0,
  });

  const {
    data: wpPagesData,
    refetch: refetchWpPages,
  } = useQuery<{ pages: Array<{ id: number; title: string; slug: string; link: string; parent: number }> }>({
    queryKey: ['wp-pages', companyId],
    queryFn: () => api.get(`/seo-engine/company/${companyId}/wordpress/pages`, { token: token! }),
    enabled: !!token && publishConfirmOpen && outputTargets.website && publishingType === 'wordpress',
    staleTime: 0,
  });

  useEffect(() => {
    if (!publishConfirmOpen || !token || !companyId) return;
    void refetchPublishingInfo();
  }, [publishConfirmOpen, token, companyId, refetchPublishingInfo]);

  useEffect(() => {
    if (!publishConfirmOpen || !outputTargets.website || publishingType !== 'wordpress') return;
    void refetchWpCategories();
    void refetchWpPages();
  }, [
    publishConfirmOpen,
    outputTargets.website,
    publishingType,
    refetchWpCategories,
    refetchWpPages,
  ]);

  useEffect(() => {
    setWpCategories(wpCategoriesData?.categories || []);
  }, [wpCategoriesData?.categories]);

  useEffect(() => {
    setWpPages(wpPagesData?.pages || []);
  }, [wpPagesData?.pages]);

  // Populate form when data loads
  useEffect(() => {
    if (post && !initialLoadDone.current) {
      setTitle(post.title || '');
      setKeyword(post.keyword || '');
      setMetaDescription(post.metaDescription || '');
      setContent(post.content || '');
      setExcerpt(post.excerpt || '');
      setTags(Array.isArray(post.tags) ? post.tags : []);
      setFaq(Array.isArray(post.faq) ? post.faq : []);
      initialLoadDone.current = true;
    }
  }, [post]);

  // Set editor HTML when content loads initially
  useEffect(() => {
    if (editorRef.current && post?.content && !editorRef.current.innerHTML.trim()) {
      editorRef.current.innerHTML = post.content;
    }
  }, [post?.content]);

  // ─── Image picker ─────────────────────────────────────────────

  useEffect(() => {
    if (imagePickerOpen && token) {
      api.get<{ data: any[] }>(`/assets-library/company/${companyId}?type=image`, { token })
        .then((res) => setLibraryAssets(res.data || []))
        .catch(() => {});
    }
  }, [imagePickerOpen, token, companyId]);

  // ─── Editor commands ──────────────────────────────────────────

  const execCommand = (command: string, value?: string) => {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
    if (editorRef.current) {
      setContent(editorRef.current.innerHTML);
    }
  };

  // ─── Save handler ─────────────────────────────────────────────

  const handleSave = async () => {
    if (!token) return;
    setIsSaving(true);
    try {
      await api.patch(`/seo-engine/company/${companyId}/blogs/${blogId}`, {
        title,
        keyword,
        metaDescription,
        content,
        excerpt,
        tags,
        faq,
      }, { token });
      toast.success('Blog post saved');
      qc.invalidateQueries({ queryKey: ['seo-results'] });
      qc.invalidateQueries({ queryKey: ['seo-blogs'] });
      qc.invalidateQueries({ queryKey: ['blog-post', blogId] });
    } catch {
      toast.error('Could not save. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const saveCurrentDraft = async () => {
    if (!token) return;
    await api.patch(`/seo-engine/company/${companyId}/blogs/${blogId}`, {
      title,
      keyword,
      metaDescription,
      content,
      excerpt,
      tags,
      faq,
    }, { token });
  };

  const buildSocialDraft = () => {
    const plainText = content
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const teaser = excerpt || metaDescription || plainText.slice(0, 220) || title;
    const hashtag = (keyword || title).replace(/[^a-zA-Z0-9\s]/g, '').trim().replace(/\s+/g, '');
    return `${title}\n\n${teaser}\n\nRead the full article on our website.${hashtag ? `\n\n#${hashtag}` : ''}`;
  };

  const friendlyPublishError = (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error || '');
    const lower = message.toLowerCase();
    if (lower.includes('select at least one output')) return 'Please select at least one output.';
    if (lower.includes('choose the wordpress page')) return 'Please choose the page where this article should appear.';
    if (lower.includes('wordpress') || lower.includes('rest api') || lower.includes('text/html') || lower.includes('<!doctype')) {
      return 'Could not connect to the WordPress publishing API. Please check the Website Publishing connection.';
    }
    if (lower.includes('github')) {
      return 'Could not publish to the GitHub destination. Please check the repository connection in Website Publishing.';
    }
    if (lower.includes('custom api')) {
      return 'Could not publish to the Custom API destination. Please check the endpoint in Website Publishing.';
    }
    return 'Could not create the selected outputs. Please check your publishing settings and try again.';
  };

  const handlePublishApproved = async () => {
    if (!token) return;
    setIsPublishing(true);
    setPublishError(null);
    try {
      const socialPlatforms = ([
        outputTargets.linkedin ? 'linkedin' : null,
        outputTargets.facebook ? 'facebook' : null,
        outputTargets.instagram ? 'instagram' : null,
      ].filter(Boolean)) as Array<'linkedin' | 'facebook' | 'instagram'>;
      if (!outputTargets.website && socialPlatforms.length === 0) {
        throw new Error('Select at least one output.');
      }
      await saveCurrentDraft();

      if (outputTargets.website) {
        const res = await api.post<{ message: string; results: Array<{ success: boolean; url?: string; error?: string }> }>(
          `/seo-engine/company/${companyId}/publish-blogs`,
          {
            blogPostIds: [blogId],
            placement: publishPlacement === 'child_page'
              ? {
                type: 'child_page',
                parentPageId: selectedParentPage ? parseInt(selectedParentPage) : undefined,
              }
              : {
                type: 'post_category',
                categoryId: selectedCategory ? parseInt(selectedCategory) : undefined,
              },
          },
          { token },
        );
        const failed = res.results?.find((result) => !result.success);
        if (failed) {
          throw new Error(failed.error || 'Publishing failed. Check Website Publishing settings.');
        }
      }

      if (socialPlatforms.length > 0) {
        await api.post(`/social/${companyId}/posts`, {
          content: buildSocialDraft(),
          platforms: socialPlatforms,
          mediaUrls: [],
          scheduledAt: null,
        }, { token });
      }

      toast.success(outputTargets.website ? 'Selected outputs created' : 'Social drafts created');
      setPublishConfirmOpen(false);
      qc.invalidateQueries({ queryKey: ['blog-post', blogId] });
      qc.invalidateQueries({ queryKey: ['seo-results'] });
      qc.invalidateQueries({ queryKey: ['seo-blogs'] });
    } catch (err) {
      console.error('[blog] create outputs failed:', err);
      const message = friendlyPublishError(err);
      setPublishError(message);
      toast.error(message);
    } finally {
      setIsPublishing(false);
    }
  };

  // ─── FAQ helpers ──────────────────────────────────────────────

  const addFaqItem = () => {
    setFaq([...faq, { question: '', answer: '' }]);
  };

  const updateFaqItem = (index: number, field: 'question' | 'answer', value: string) => {
    const updated = [...faq];
    updated[index] = { ...updated[index], [field]: value };
    setFaq(updated);
  };

  const removeFaqItem = (index: number) => {
    setFaq(faq.filter((_, i) => i !== index));
  };

  // ─── Loading ──────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!post && !isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <p className="text-muted-foreground">Blog post not found.</p>
        <Button variant="outline" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Go Back
        </Button>
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Back
          </Button>
          <h1 className="text-lg font-semibold truncate max-w-[400px]">{title || 'Untitled Post'}</h1>
          {post?.status && (
            <Badge variant="outline" className="text-xs capitalize">{post.status.replace('_', ' ')}</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {post?.cmsPostUrl && (
            <a href={post.cmsPostUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm" className="gap-1">
                Open destination <ExternalLink className="w-4 h-4" />
              </Button>
            </a>
          )}
          <Button variant="outline" size="sm" onClick={() => setShowPreview(!showPreview)}>
            <Eye className="w-4 h-4 mr-1" /> {showPreview ? 'Hide Preview' : 'Show Preview'}
          </Button>
          <Button
            variant="gradient"
            size="sm"
            className="gap-1"
            onClick={() => {
              setPublishError(null);
              setPublishConfirmOpen(true);
            }}
            disabled={isPublishing || post?.status === 'pushed_to_cms'}
          >
            {isPublishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
            Publish
          </Button>
          <Button size="sm" onClick={handleSave} disabled={isSaving}>
            {isSaving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
            Save
          </Button>
        </div>
      </div>

      {/* Two-panel layout */}
      <div className={`grid gap-4 ${showPreview ? 'grid-cols-5' : 'grid-cols-1'}`}>

        {/* Left panel: Editor */}
        <div className={showPreview ? 'col-span-3' : 'col-span-1'}>
          <div className="space-y-4">

            {/* Title */}
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter blog post title..."
                className="text-base font-medium"
              />
            </div>

            {/* Keyword + Search Intent */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Target Keyword</Label>
                <Input
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder="e.g. best project management tools"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Search Intent</Label>
                <Input
                  value={post?.searchIntent || ''}
                  disabled
                  className="bg-muted"
                />
              </div>
            </div>

            {/* Meta Description */}
            <div className="space-y-1.5">
              <Label>Meta Description</Label>
              <Textarea
                value={metaDescription}
                onChange={(e) => setMetaDescription(e.target.value)}
                placeholder="A short summary for search engines (150-160 characters)..."
                className="h-16 resize-none"
                maxLength={320}
              />
              <p className="text-[11px] text-muted-foreground">{metaDescription.length} / 160 recommended</p>
            </div>

            {/* Excerpt */}
            <div className="space-y-1.5">
              <Label>Excerpt</Label>
              <Textarea
                value={excerpt}
                onChange={(e) => setExcerpt(e.target.value)}
                placeholder="A brief excerpt shown in blog listings..."
                className="h-16 resize-none"
              />
            </div>

            {/* Content Editor */}
            <div className="space-y-1.5">
              <Label>Content</Label>
              <Card>
                <CardContent className="p-3">
                  {/* Toolbar */}
                  <div className="flex gap-1 border-b pb-2 mb-2">
                    <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => execCommand('bold')}>
                      <Bold className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => execCommand('italic')}>
                      <Italic className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => execCommand('formatBlock', 'h2')}>
                      <Heading2 className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => execCommand('formatBlock', 'h3')}>
                      <Heading3 className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => execCommand('insertUnorderedList')}>
                      <List className="w-3.5 h-3.5" />
                    </Button>
                    <div className="border-l mx-1" />
                    <Button size="sm" variant="ghost" className="h-7 px-2 gap-1" onClick={() => setImagePickerOpen(true)}>
                      <ImageIcon className="w-3.5 h-3.5" /> Image
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2 gap-1" onClick={() => {
                      const url = window.prompt('Enter link URL:');
                      if (url) execCommand('createLink', url);
                    }}>
                      <Link2 className="w-3.5 h-3.5" /> Link
                    </Button>
                  </div>

                  {/* Editable area */}
                  <div
                    ref={editorRef}
                    contentEditable
                    suppressContentEditableWarning
                    className="min-h-[400px] p-4 prose prose-sm max-w-none focus:outline-none"
                    onInput={() => {
                      if (editorRef.current) {
                        setContent(editorRef.current.innerHTML);
                      }
                    }}
                  />
                </CardContent>
              </Card>
            </div>

            {/* Tags */}
            <div className="space-y-1.5">
              <Label>Tags</Label>
              <div className="flex flex-wrap gap-1.5 items-center">
                {tags.map((tag, i) => (
                  <Badge key={i} variant="secondary" className="gap-1 pr-1">
                    {tag}
                    <button onClick={() => setTags(tags.filter((_, j) => j !== i))} className="hover:text-destructive">
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </Badge>
                ))}
                <Input
                  className="h-7 w-36 text-xs"
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newTag.trim()) {
                      e.preventDefault();
                      if (!tags.includes(newTag.trim())) {
                        setTags([...tags, newTag.trim()]);
                      }
                      setNewTag('');
                    }
                  }}
                  placeholder="Add tag..."
                />
              </div>
            </div>

            {/* FAQ Section */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>FAQ Section</Label>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={addFaqItem}>
                  <Plus className="w-3 h-3" /> Add Question
                </Button>
              </div>
              {faq.length === 0 && (
                <p className="text-xs text-muted-foreground">No FAQ items yet. Add questions to improve SEO with rich snippets.</p>
              )}
              {faq.map((item, i) => (
                <Card key={i}>
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-start gap-2">
                      <div className="flex-1 space-y-2">
                        <Input
                          value={item.question}
                          onChange={(e) => updateFaqItem(i, 'question', e.target.value)}
                          placeholder="Question..."
                          className="text-sm font-medium"
                        />
                        <Textarea
                          value={item.answer}
                          onChange={(e) => updateFaqItem(i, 'answer', e.target.value)}
                          placeholder="Answer..."
                          className="text-sm h-16 resize-none"
                        />
                      </div>
                      <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive h-7 px-2" onClick={() => removeFaqItem(i)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>

        {/* Right panel: Preview */}
        {showPreview && (
          <div className="col-span-2">
            <Card className="sticky top-4">
              <CardContent className="pt-4">
                <h3 className="text-xs font-medium text-muted-foreground mb-3">Live Preview</h3>
                <div className="prose prose-sm max-w-none max-h-[600px] overflow-y-auto border rounded p-4">
                  <h1 className="text-xl font-bold mb-2">{title || 'Untitled Post'}</h1>
                  {keyword && (
                    <p className="text-xs text-muted-foreground mb-3">Keyword: {keyword}</p>
                  )}
                  {metaDescription && (
                    <p className="text-sm italic text-muted-foreground border-l-2 pl-3 mb-4">{metaDescription}</p>
                  )}
                  <div dangerouslySetInnerHTML={{ __html: content }} />
                  {faq.length > 0 && (
                    <div className="mt-6 border-t pt-4">
                      <h2 className="text-lg font-semibold mb-3">Frequently Asked Questions</h2>
                      {faq.filter(f => f.question.trim()).map((item, i) => (
                        <div key={i} className="mb-3">
                          <h3 className="text-sm font-semibold">{item.question}</h3>
                          <p className="text-sm text-muted-foreground">{item.answer}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  {tags.length > 0 && (
                    <div className="mt-4 pt-3 border-t flex flex-wrap gap-1">
                      {tags.map((tag, i) => (
                        <Badge key={i} variant="outline" className="text-[10px]">{tag}</Badge>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Image Picker Dialog */}
      <Dialog open={imagePickerOpen} onOpenChange={setImagePickerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Insert Image</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-2 max-h-[300px] overflow-y-auto">
            {libraryAssets.map((asset) => (
              <div
                key={asset.id}
                className="aspect-video cursor-pointer hover:ring-2 hover:ring-primary rounded overflow-hidden"
                onClick={() => {
                  document.execCommand('insertImage', false, asset.url);
                  if (editorRef.current) setContent(editorRef.current.innerHTML);
                  setImagePickerOpen(false);
                }}
              >
                <img src={asset.url} alt={asset.name || 'Asset'} className="w-full h-full object-cover" />
              </div>
            ))}
          </div>
          {libraryAssets.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              No images in your library. Upload some in Assets first.
            </p>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={publishConfirmOpen} onOpenChange={setPublishConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create outputs</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              Choose where to publish this reviewed draft. The latest edits will be saved before publishing.
            </p>

            <div>
              <Label className="mb-2 block">Create outputs</Label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { key: 'website' as const, label: 'Website' },
                  { key: 'linkedin' as const, label: 'LinkedIn draft' },
                  { key: 'facebook' as const, label: 'Facebook draft' },
                  { key: 'instagram' as const, label: 'Instagram draft' },
                ].map((target) => (
                  <label
                    key={target.key}
                    className="flex cursor-pointer items-center justify-between rounded-lg border p-2.5 hover:bg-muted/40"
                  >
                    <span className="text-sm">{target.label}</span>
                    <Switch
                      checked={outputTargets[target.key]}
                      onCheckedChange={(checked) => setOutputTargets((current) => ({
                        ...current,
                        [target.key]: checked,
                      }))}
                    />
                  </label>
                ))}
              </div>
            </div>

            {outputTargets.website && (
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 rounded-md border bg-background p-2 text-primary">
                  {publishingBusy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <PublishingIcon className="h-4 w-4" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">Website output</p>
                    {!publishingBusy && (
                      <Badge variant="outline">
                        {publishingType === 'custom_api'
                          ? 'Custom API'
                          : publishingType === 'github'
                            ? 'GitHub Repo'
                            : 'WordPress'}
                      </Badge>
                    )}
                  </div>
                  {publishingBusy ? (
                    <p className="mt-1 text-muted-foreground">Loading destination...</p>
                  ) : publishingTarget ? (
                    <>
                      <p className="mt-1 font-medium">{publishingLabel}</p>
                      <p className="mt-0.5 break-all text-muted-foreground">{publishingTarget}</p>
                      {publishingType === 'wordpress' && (
                        <div className="mt-3 space-y-3">
                          <div>
                            <Label className="text-xs">Where should this appear?</Label>
                            <div className="mt-1 grid gap-2 sm:grid-cols-2">
                              <button
                                type="button"
                                onClick={() => setPublishPlacement('post_category')}
                                className={`rounded-lg border p-3 text-left text-xs transition-colors ${
                                  publishPlacement === 'post_category' ? 'border-primary bg-primary/5' : 'hover:bg-muted/40'
                                }`}
                              >
                                <span className="font-medium">Blog area</span>
                                <span className="mt-1 block text-muted-foreground">Best for articles. Choose a category.</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setPublishPlacement('child_page')}
                                className={`rounded-lg border p-3 text-left text-xs transition-colors ${
                                  publishPlacement === 'child_page' ? 'border-primary bg-primary/5' : 'hover:bg-muted/40'
                                }`}
                              >
                                <span className="font-medium">Under an existing page</span>
                                <span className="mt-1 block text-muted-foreground">Creates a page below Home, Products, Careers...</span>
                              </button>
                            </div>
                          </div>

                          {publishPlacement === 'post_category' && wpCategories.length > 0 && (
                            <div>
                              <Label className="text-xs">Blog category</Label>
                              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                                <SelectTrigger className="h-8 text-xs mt-1">
                                  <SelectValue placeholder="No category selected" />
                                </SelectTrigger>
                                <SelectContent>
                                  {wpCategories.map(cat => (
                                    <SelectItem key={cat.id} value={String(cat.id)}>{cat.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          )}

                          {publishPlacement === 'child_page' && (
                            <div>
                              <Label className="text-xs">Parent page</Label>
                              <Select value={selectedParentPage} onValueChange={setSelectedParentPage}>
                                <SelectTrigger className="h-8 text-xs mt-1">
                                  <SelectValue placeholder="Choose a page..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {wpPages.map(page => (
                                    <SelectItem key={page.id} value={String(page.id)}>
                                      {page.title}{page.slug ? ` /${page.slug}` : ''}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <p className="mt-1 text-[11px] text-muted-foreground">
                                The article becomes a new child page under the page you choose.
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="mt-1 space-y-2">
                      <p className="text-amber-700">
                        No valid destination target is configured yet.
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => router.push(`/${companyId}/settings?tab=publishing`)}
                      >
                        Open Website Publishing
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
            )}

            {publishError && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-800">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div className="space-y-2">
                    <p>{publishError}</p>
                    <Button size="sm" variant="outline" onClick={() => router.push(`/${companyId}/settings?tab=publishing`)}>
                      Check Website Publishing
                    </Button>
                  </div>
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setPublishConfirmOpen(false)} disabled={isPublishing}>
                Cancel
              </Button>
              <Button
                onClick={handlePublishApproved}
                disabled={
                  isPublishing
                  || (outputTargets.website && !canPublishToDestination)
                  || (outputTargets.website && publishingType === 'wordpress' && publishPlacement === 'child_page' && !selectedParentPage)
                }
                className="gap-2"
              >
                {isPublishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
                Publish selected outputs
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
