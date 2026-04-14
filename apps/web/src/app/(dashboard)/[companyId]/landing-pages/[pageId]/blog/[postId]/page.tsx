'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Loader2, Save, Globe, EyeOff, Trash2, Upload } from 'lucide-react';
import { api } from '@/lib/api/client';
import { useAuthStore } from '@/stores/auth-store';
import { toast } from 'sonner';
import { BlogEditor } from '@/components/landing-pages/blog-editor';
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8004/api/v1';
interface Post {
  id: string; slug: string; title: string; excerpt: string | null; content: string | null;
  coverImageUrl: string | null; status: string; publishedAt: string | null; updatedAt: string;
  seo: { metaTitle?: string; metaDescription?: string; keywords?: string[] } | null;
}

export default function BlogEditPage() {
  const { companyId, pageId, postId } = useParams() as { companyId: string; pageId: string; postId: string };
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const coverRef = useRef<HTMLInputElement>(null);

  const [post, setPost] = useState<Post | null>(null);
  const [title, setTitle] = useState(''); const [slug, setSlug] = useState('');
  const [excerpt, setExcerpt] = useState(''); const [content, setContent] = useState('');
  const [coverUrl, setCoverUrl] = useState(''); const [metaTitle, setMetaTitle] = useState('');
  const [metaDesc, setMetaDesc] = useState(''); const [keywords, setKeywords] = useState('');
  const [saving, setSaving] = useState(false); const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api.get<{ post: Post }>(`/blog/${pageId}/posts/${postId}`, { token }).then(({ post: p }) => {
      setPost(p); setTitle(p.title); setSlug(p.slug); setExcerpt(p.excerpt || '');
      setContent(p.content || ''); setCoverUrl(p.coverImageUrl || '');
      setMetaTitle(p.seo?.metaTitle || ''); setMetaDesc(p.seo?.metaDescription || '');
      setKeywords((p.seo?.keywords || []).join(', '));
    }).catch((e) => toast.error(e?.message || 'Could not load post'));
  }, [pageId, postId, token]);

  const save = async () => {
    if (!token) return;
    setSaving(true);
    try {
      const seo = {
        metaTitle: metaTitle || undefined, metaDescription: metaDesc || undefined,
        keywords: keywords ? keywords.split(',').map((k) => k.trim()).filter(Boolean) : undefined,
      };
      const r = await api.patch<{ post: Post }>(`/blog/${pageId}/posts/${postId}`,
        { title, slug, excerpt: excerpt || null, content, coverImageUrl: coverUrl || null, seo }, { token });
      setPost(r.post); toast.success('Saved');
    } catch (e: any) { toast.error(e?.message || 'Could not save'); }
    finally { setSaving(false); }
  };

  const togglePublish = async () => {
    if (!token || !post) return;
    const pub = post.status !== 'published';
    setBusy(pub ? 'pub' : 'unpub');
    try {
      await save();
      const r = await api.post<{ post: Post }>(`/blog/${pageId}/posts/${postId}/${pub ? 'publish' : 'unpublish'}`, {}, { token });
      setPost(r.post); toast.success(pub ? 'Published' : 'Unpublished');
    } catch (e: any) { toast.error(e?.message || 'Failed'); }
    finally { setBusy(null); }
  };

  const onDelete = async () => {
    if (!token || !window.confirm('Delete permanently?')) return;
    setBusy('del');
    try { await api.delete(`/blog/${pageId}/posts/${postId}`, { token }); router.push(`/${companyId}/landing-pages/${pageId}/blog`); }
    catch (e: any) { toast.error(e?.message || 'Failed'); setBusy(null); }
  };

  const onCover = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file || !token) return;
    const fd = new FormData(); fd.append('file', file);
    try {
      const r = await fetch(`${API_URL}/assets-library/company/${companyId}/upload`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
      const j = await r.json();
      if (!r.ok || !j?.data?.url) throw new Error(); setCoverUrl(j.data.url); toast.success('Uploaded');
    } catch { toast.error('Upload failed'); }
  };

  if (!post) return <div className="flex items-center justify-center min-h-screen"><Loader2 className="w-6 h-6 animate-spin text-neutral-500" /></div>;

  return (
    <div className="max-w-6xl mx-auto p-6">
      <Link href={`/${companyId}/landing-pages/${pageId}/blog`} className="inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-neutral-200 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to posts
      </Link>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-6">
        <div className="space-y-4">
          <Input className="text-2xl font-bold h-14" placeholder="Post title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <div className="flex items-center gap-2">
            <span className="text-sm text-neutral-500">Slug:</span>
            <Input value={slug} onChange={(e) => setSlug(e.target.value)} className="max-w-md" />
          </div>
          <Textarea placeholder="Short excerpt" value={excerpt} onChange={(e) => setExcerpt(e.target.value)} rows={2} />
          <BlogEditor companyId={companyId} initialContent={post.content || ''} onChange={setContent} />
          <details className="border border-neutral-800 rounded-lg p-4 bg-neutral-950">
            <summary className="cursor-pointer text-sm font-medium text-neutral-300">SEO settings</summary>
            <div className="mt-4 space-y-3">
              <Input placeholder="Meta title" value={metaTitle} onChange={(e) => setMetaTitle(e.target.value)} />
              <Textarea placeholder="Meta description" value={metaDesc} onChange={(e) => setMetaDesc(e.target.value)} rows={2} />
              <Input placeholder="Keywords (comma separated)" value={keywords} onChange={(e) => setKeywords(e.target.value)} />
            </div>
          </details>
        </div>
        <aside className="space-y-4">
          <div className="border border-neutral-800 rounded-lg p-4 bg-neutral-950">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-neutral-400">Status</span>
              <Badge variant={post.status === 'published' ? 'default' : 'secondary'}>{post.status}</Badge>
            </div>
            <p className="text-xs text-neutral-600 mb-4">Saved {new Date(post.updatedAt).toLocaleString()}</p>
            <div className="space-y-2">
              <Button onClick={save} disabled={saving} className="w-full">
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />} Save draft
              </Button>
              <Button onClick={togglePublish} disabled={!!busy} variant={post.status === 'published' ? 'outline' : 'default'} className="w-full">
                {busy === 'pub' || busy === 'unpub' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : post.status === 'published' ? <EyeOff className="w-4 h-4 mr-2" /> : <Globe className="w-4 h-4 mr-2" />}
                {post.status === 'published' ? 'Unpublish' : 'Publish'}
              </Button>
              <Button onClick={onDelete} variant="ghost" disabled={!!busy} className="w-full text-red-400 hover:text-red-300">
                <Trash2 className="w-4 h-4 mr-2" /> Delete
              </Button>
            </div>
          </div>
          <div className="border border-neutral-800 rounded-lg p-4 bg-neutral-950">
            <p className="text-sm font-medium text-neutral-300 mb-2">Cover image</p>
            {coverUrl
              /* eslint-disable-next-line @next/next/no-img-element */
              ? <img src={coverUrl} alt="" className="w-full h-32 object-cover rounded mb-2" />
              : <div className="w-full h-32 rounded bg-neutral-900 flex items-center justify-center mb-2"><span className="text-xs text-neutral-600">No cover</span></div>}
            <Button variant="outline" size="sm" className="w-full" onClick={() => coverRef.current?.click()}>
              <Upload className="w-4 h-4 mr-2" /> {coverUrl ? 'Replace' : 'Upload cover'}
            </Button>
            <input ref={coverRef} type="file" accept="image/*" className="hidden" onChange={onCover} />
          </div>
        </aside>
      </div>
    </div>
  );
}
