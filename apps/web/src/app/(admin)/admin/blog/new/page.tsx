'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { ArrowLeft, Save, Send } from 'lucide-react';
import Link from 'next/link';
import { useAdminCreateBlogPost } from '@/lib/api/admin-hooks';

export default function AdminBlogNewPage() {
  const router = useRouter();
  const createMutation = useAdminCreateBlogPost();
  const [form, setForm] = useState({
    title: '', slug: '', content: '', excerpt: '', metaDescription: '', keyword: '', tags: '', language: 'en',
  });

  const generateSlug = (title: string) =>
    title.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').trim();

  const handleSave = async (status: string) => {
    if (!form.title || !form.content) { toast.error('Title and content required'); return; }
    try {
      await createMutation.mutateAsync({
        ...form,
        status,
        slug: form.slug || generateSlug(form.title),
        tags: form.tags ? form.tags.split(',').map((t) => t.trim()) : [],
      });
      toast.success(status === 'published' ? 'Post published' : 'Draft saved');
      router.push('/admin/blog');
    } catch { toast.error('Failed to save'); }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/admin/blog">
            <Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4" /></Button>
          </Link>
          <h1 className="text-2xl font-bold">New Blog Post</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => handleSave('draft')}>
            <Save className="w-4 h-4 mr-1" /> Save Draft
          </Button>
          <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => handleSave('published')}>
            <Send className="w-4 h-4 mr-1" /> Publish
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>Post Details</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">Title</label>
              <Input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value, slug: generateSlug(e.target.value) }))} placeholder="Blog post title..." />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Slug</label>
              <Input value={form.slug} onChange={(e) => setForm((p) => ({ ...p, slug: e.target.value }))} placeholder="url-slug" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">Keyword (SEO)</label>
              <Input value={form.keyword} onChange={(e) => setForm((p) => ({ ...p, keyword: e.target.value }))} placeholder="main keyword" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Language</label>
              <select value={form.language} onChange={(e) => setForm((p) => ({ ...p, language: e.target.value }))} className="w-full h-10 rounded-md border px-3 text-sm">
                <option value="en">English</option>
                <option value="ja">Japanese</option>
                <option value="vi">Vietnamese</option>
                <option value="ko">Korean</option>
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Meta Description</label>
            <Input value={form.metaDescription} onChange={(e) => setForm((p) => ({ ...p, metaDescription: e.target.value }))} placeholder="SEO description..." />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Excerpt</label>
            <textarea value={form.excerpt} onChange={(e) => setForm((p) => ({ ...p, excerpt: e.target.value }))} placeholder="Short excerpt..." className="w-full min-h-[80px] rounded-md border px-3 py-2 text-sm" rows={3} />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Content</label>
            <textarea value={form.content} onChange={(e) => setForm((p) => ({ ...p, content: e.target.value }))} placeholder="Write your content (HTML supported)..." className="w-full min-h-[300px] rounded-md border px-3 py-2 text-sm font-mono" rows={15} />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Tags (comma-separated)</label>
            <Input value={form.tags} onChange={(e) => setForm((p) => ({ ...p, tags: e.target.value }))} placeholder="ai, marketing, automation" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
