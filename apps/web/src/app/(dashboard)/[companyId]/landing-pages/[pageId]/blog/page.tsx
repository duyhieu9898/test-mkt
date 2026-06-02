'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Plus, Loader2, Trash2, FileText } from 'lucide-react';
import { api } from '@/lib/api/client';
import { useAuthStore } from '@/stores/auth-store';
import { toast } from 'sonner';

interface BlogPost {
  id: string; slug: string; title: string; excerpt: string | null;
  coverImageUrl: string | null; status: string; updatedAt: string; publishedAt: string | null;
}

const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 100);

export default function BlogListPage() {
  const { companyId, pageId } = useParams() as { companyId: string; pageId: string };
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const [posts, setPosts] = useState<BlogPost[] | null>(null);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    if (!token) return;
    try {
      const r = await api.get<{ posts: BlogPost[] }>(`/blog/${pageId}/posts`, { token });
      setPosts(r.posts);
    } catch (e: any) { toast.error(e?.message || 'Failed to load posts'); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [pageId, token]);

  const onNew = async () => {
    if (!token) return;
    const title = window.prompt('Title for your new post?');
    if (!title) return;
    setCreating(true);
    try {
      const slug = slugify(title) || `post-${Date.now()}`;
      const r = await api.post<{ post: BlogPost }>(`/blog/${pageId}/posts`, { slug, title, content: '' }, { token });
      router.push(`/${companyId}/landing-pages/${pageId}/blog/${r.post.id}`);
    } catch (e: any) { toast.error(e?.message || 'Could not create post'); setCreating(false); }
  };

  const onDelete = async (id: string) => {
    if (!token || !window.confirm('Delete this post? This cannot be undone.')) return;
    try { await api.delete(`/blog/${pageId}/posts/${id}`, { token }); toast.success('Post deleted'); load(); }
    catch (e: any) { toast.error(e?.message || 'Could not delete'); }
  };

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href={`/${companyId}/landing-pages/${pageId}`} className="inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-neutral-200 mb-2">
            <ArrowLeft className="w-4 h-4" /> Back to landing page
          </Link>
          <h1 className="text-2xl font-bold text-white">Blog</h1>
          <p className="text-sm text-neutral-400">Publish articles to your landing page</p>
        </div>
        <Button onClick={onNew} disabled={creating}>
          {creating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />} New post
        </Button>
      </div>

      {posts === null ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-neutral-500" /></div>
      ) : posts.length === 0 ? (
        <div className="border border-dashed border-neutral-800 rounded-lg p-12 text-center">
          <FileText className="w-12 h-12 mx-auto mb-3 text-neutral-700" />
          <p className="text-neutral-400">No posts yet. Create your first article.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map((p) => (
            <div key={p.id} onClick={() => router.push(`/${companyId}/landing-pages/${pageId}/blog/${p.id}`)}
              className="flex items-start gap-4 p-4 border border-neutral-800 rounded-lg hover:border-neutral-700 cursor-pointer bg-neutral-950">
              {p.coverImageUrl
                /* eslint-disable-next-line @next/next/no-img-element */
                ? <img src={p.coverImageUrl} alt="" className="w-20 h-20 object-cover rounded" />
                : <div className="w-20 h-20 rounded bg-neutral-900 flex items-center justify-center"><FileText className="w-6 h-6 text-neutral-700" /></div>}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-white truncate">{p.title}</h3>
                  <Badge variant={p.status === 'published' ? 'default' : 'secondary'}>{p.status}</Badge>
                </div>
                {p.excerpt && <p className="text-sm text-neutral-400 line-clamp-2">{p.excerpt}</p>}
                <p className="text-xs text-neutral-600 mt-1">Updated {new Date(p.updatedAt).toLocaleDateString()}</p>
              </div>
              <button className="p-2 text-neutral-500 hover:text-red-400" onClick={(e) => { e.stopPropagation(); onDelete(p.id); }}>
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
