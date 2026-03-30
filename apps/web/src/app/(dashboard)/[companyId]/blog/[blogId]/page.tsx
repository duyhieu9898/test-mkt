'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  ArrowLeft, Save, Eye, Globe, Loader2, Image as ImageIcon,
  Bold, Italic, Heading2, Heading3, Link2, List, X, Plus, Trash2,
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
          <Button variant="ghost" size="sm" onClick={() => router.push(`/${companyId}/seo-engine`)}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Back
          </Button>
          <h1 className="text-lg font-semibold truncate max-w-[400px]">{title || 'Untitled Post'}</h1>
          {post?.status && (
            <Badge variant="outline" className="text-xs capitalize">{post.status.replace('_', ' ')}</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowPreview(!showPreview)}>
            <Eye className="w-4 h-4 mr-1" /> {showPreview ? 'Hide Preview' : 'Show Preview'}
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
    </div>
  );
}
