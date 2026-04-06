'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Plus, Edit3, Trash2, Eye, Send, RefreshCw, BookOpen } from 'lucide-react';
import { useAdminBlogPosts, useAdminDeleteBlogPost, useAdminUpdateBlogPost } from '@/lib/api/admin-hooks';
import { type Locale, localeFlags } from '@/lib/i18n';

export default function AdminBlogPage() {
  const { data, isLoading, refetch } = useAdminBlogPosts();
  const deleteMutation = useAdminDeleteBlogPost();
  const updateMutation = useAdminUpdateBlogPost();

  const posts = data?.posts || [];

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this post?')) return;
    try {
      await deleteMutation.mutateAsync(id);
      toast.success('Post deleted');
    } catch { toast.error('Failed'); }
  };

  const handlePublish = async (id: string) => {
    try {
      await updateMutation.mutateAsync({ id, status: 'published' });
      toast.success('Post published');
    } catch { toast.error('Failed'); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Blog Posts</h1>
          <p className="text-gray-500">Create and manage blog articles for SEO</p>
        </div>
        <Link href="/admin/blog/new">
          <Button className="bg-emerald-600 hover:bg-emerald-700">
            <Plus className="w-4 h-4 mr-1" /> New Post
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <BookOpen className="w-5 h-5" />
              All Posts ({posts.length})
            </CardTitle>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="w-4 h-4 mr-1" /> Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : posts.length === 0 ? (
            <div className="text-center py-12">
              <BookOpen className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p className="text-gray-400 font-medium">No blog posts yet</p>
              <Link href="/admin/blog/new">
                <Button size="sm" className="mt-3 bg-emerald-600 hover:bg-emerald-700">
                  <Plus className="w-4 h-4 mr-1" /> Create First Post
                </Button>
              </Link>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-3 font-medium">Title</th>
                  <th className="pb-3 font-medium">Status</th>
                  <th className="pb-3 font-medium">Language</th>
                  <th className="pb-3 font-medium">Updated</th>
                  <th className="pb-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {posts.map((p: any) => (
                  <tr key={p.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="py-3">
                      <p className="font-medium">{p.title}</p>
                      <p className="text-xs text-gray-400">/{p.slug}</p>
                    </td>
                    <td className="py-3">
                      <Badge
                        variant="outline"
                        className={`text-xs ${p.status === 'published' ? 'border-green-200 text-green-700 bg-green-50' : 'border-gray-200 text-gray-600'}`}
                      >
                        {p.status}
                      </Badge>
                    </td>
                    <td className="py-3">
                      <span className="text-sm">{localeFlags[p.language as Locale] || p.language}</span>
                    </td>
                    <td className="py-3 text-gray-500">
                      {new Date(p.updatedAt || p.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {p.status === 'published' && (
                          <Button size="sm" variant="ghost" className="h-7" onClick={() => window.open(`/blog/${p.slug}`, '_blank')}>
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        <Link href={`/admin/blog/${p.id}`}>
                          <Button size="sm" variant="ghost" className="h-7">
                            <Edit3 className="w-3.5 h-3.5" />
                          </Button>
                        </Link>
                        {p.status === 'draft' && (
                          <Button size="sm" variant="ghost" className="h-7 text-green-600" onClick={() => handlePublish(p.id)}>
                            <Send className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="h-7 text-red-500" onClick={() => handleDelete(p.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
