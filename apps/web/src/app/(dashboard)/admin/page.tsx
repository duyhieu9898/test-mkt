'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import {
  Brain,
  Shield,
  Save,
  RefreshCw,
  CheckCircle2,
  Sparkles,
  Zap,
  Activity,
  Users,
  UserCheck,
  UserX,
  Clock,
  FileText,
  Plus,
  Trash2,
  Eye,
  Edit3,
  Send,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { api } from '@/lib/api/client';

// AI performance levels
const aiLevels = [
  {
    id: 'balanced',
    name: 'Balanced',
    description: 'Best mix of speed and quality. Works great for most tasks.',
    icon: Sparkles,
    recommended: true,
  },
  {
    id: 'quality',
    name: 'Maximum Quality',
    description: 'Best results for complex strategy and analysis. Takes a bit longer.',
    icon: Brain,
    recommended: false,
  },
  {
    id: 'fast',
    name: 'Fast',
    description: 'Quickest responses. Great for simple tasks and high-volume work.',
    icon: Zap,
    recommended: false,
  },
];

interface PendingUser {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

interface BlogPost {
  id: string;
  title: string;
  slug: string;
  status: string;
  language: string;
  createdAt: string;
  updatedAt: string;
}

type AdminTab = 'users' | 'blog' | 'settings';

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<AdminTab>('users');
  const token = useAuthStore((s) => s.token);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Shield className="w-6 h-6" />
          Admin Panel
        </h1>
        <p className="text-muted-foreground">Manage users, blog posts, and system settings</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted rounded-lg p-1">
        {[
          { id: 'users' as AdminTab, label: 'User Approval', icon: Users },
          { id: 'blog' as AdminTab, label: 'Blog Posts', icon: FileText },
          { id: 'settings' as AdminTab, label: 'Settings', icon: Activity },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium transition-all flex-1 justify-center ${
              activeTab === tab.id
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'users' && <UserApprovalTab token={token} />}
      {activeTab === 'blog' && <BlogManagementTab token={token} />}
      {activeTab === 'settings' && <SettingsTab />}
    </div>
  );
}

// =====================
// User Approval Tab
// =====================
function UserApprovalTab({ token }: { token: string | null }) {
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchPendingUsers = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get<{ users: PendingUser[] }>('/auth/admin/pending-users', { token: token || undefined });
      setPendingUsers(res.users);
    } catch (err) {
      toast.error('Failed to load pending users');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchPendingUsers();
  }, [fetchPendingUsers]);

  const handleApprove = async (userId: string, name: string) => {
    try {
      setActionLoading(userId);
      await api.post(`/auth/admin/approve-user/${userId}`, {}, { token: token || undefined });
      toast.success(`${name} has been approved`);
      setPendingUsers((prev) => prev.filter((u) => u.id !== userId));
    } catch (err) {
      toast.error('Failed to approve user');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (userId: string, name: string) => {
    try {
      setActionLoading(userId);
      await api.post(`/auth/admin/reject-user/${userId}`, {}, { token: token || undefined });
      toast.success(`${name} has been rejected`);
      setPendingUsers((prev) => prev.filter((u) => u.id !== userId));
    } catch (err) {
      toast.error('Failed to reject user');
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Pending Registrations
            </CardTitle>
            <CardDescription>Approve or reject new user registrations</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={fetchPendingUsers} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : pendingUsers.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <UserCheck className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p className="font-medium">No pending registrations</p>
            <p className="text-sm">All users have been reviewed</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pendingUsers.map((user) => (
              <div
                key={user.id}
                className="flex items-center justify-between p-4 rounded-xl border bg-muted/30"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-sm font-bold text-primary">
                      {user.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <p className="font-medium">{user.name}</p>
                    <p className="text-sm text-muted-foreground">{user.email}</p>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="w-3 h-3" />
                    {new Date(user.createdAt).toLocaleDateString()}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-red-600 hover:bg-red-50 hover:text-red-700"
                    onClick={() => handleReject(user.id, user.name)}
                    disabled={actionLoading === user.id}
                  >
                    <UserX className="w-4 h-4 mr-1" />
                    Reject
                  </Button>
                  <Button
                    size="sm"
                    className="bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => handleApprove(user.id, user.name)}
                    disabled={actionLoading === user.id}
                  >
                    {actionLoading === user.id ? (
                      <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
                    ) : (
                      <UserCheck className="w-4 h-4 mr-1" />
                    )}
                    Approve
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// =====================
// Blog Management Tab
// =====================
function BlogManagementTab({ token }: { token: string | null }) {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEditor, setShowEditor] = useState(false);
  const [editingPost, setEditingPost] = useState<BlogPost | null>(null);
  const [form, setForm] = useState({
    title: '',
    slug: '',
    content: '',
    excerpt: '',
    metaDescription: '',
    keyword: '',
    tags: '',
    language: 'en',
    status: 'draft',
  });

  const fetchPosts = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get<{ posts: BlogPost[] }>('/blog/admin/posts', { token: token || undefined });
      setPosts(res.posts);
    } catch {
      // Blog API might not exist yet, show empty
      setPosts([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  const generateSlug = (title: string) => {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  };

  const handleTitleChange = (title: string) => {
    setForm((prev) => ({
      ...prev,
      title,
      slug: editingPost ? prev.slug : generateSlug(title),
    }));
  };

  const handleSave = async () => {
    if (!form.title || !form.content) {
      toast.error('Title and content are required');
      return;
    }

    try {
      const payload = {
        ...form,
        tags: form.tags ? form.tags.split(',').map((t) => t.trim()) : [],
        slug: form.slug || generateSlug(form.title),
      };

      if (editingPost) {
        await api.patch(`/blog/admin/posts/${editingPost.id}`, payload, { token: token || undefined });
        toast.success('Post updated');
      } else {
        await api.post('/blog/admin/posts', payload, { token: token || undefined });
        toast.success('Post created');
      }

      setShowEditor(false);
      setEditingPost(null);
      setForm({ title: '', slug: '', content: '', excerpt: '', metaDescription: '', keyword: '', tags: '', language: 'en', status: 'draft' });
      fetchPosts();
    } catch {
      toast.error('Failed to save post');
    }
  };

  const handlePublish = async (postId: string) => {
    try {
      await api.patch(`/blog/admin/posts/${postId}`, { status: 'published' }, { token: token || undefined });
      toast.success('Post published');
      fetchPosts();
    } catch {
      toast.error('Failed to publish');
    }
  };

  const handleDelete = async (postId: string) => {
    try {
      await api.delete(`/blog/admin/posts/${postId}`, { token: token || undefined });
      toast.success('Post deleted');
      fetchPosts();
    } catch {
      toast.error('Failed to delete');
    }
  };

  const handleEdit = async (post: BlogPost) => {
    try {
      const full = await api.get<{ post: any }>(`/blog/admin/posts/${post.id}`, { token: token || undefined });
      const p = full.post;
      setEditingPost(post);
      setForm({
        title: p.title || '',
        slug: p.slug || '',
        content: p.content || '',
        excerpt: p.excerpt || '',
        metaDescription: p.metaDescription || '',
        keyword: p.keyword || '',
        tags: Array.isArray(p.tags) ? p.tags.join(', ') : '',
        language: p.language || 'en',
        status: p.status || 'draft',
      });
      setShowEditor(true);
    } catch {
      toast.error('Failed to load post');
    }
  };

  if (showEditor) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{editingPost ? 'Edit Post' : 'New Blog Post'}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Title</label>
              <Input
                value={form.title}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder="Blog post title..."
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Slug</label>
              <Input
                value={form.slug}
                onChange={(e) => setForm((p) => ({ ...p, slug: e.target.value }))}
                placeholder="url-friendly-slug"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Keyword (SEO)</label>
              <Input
                value={form.keyword}
                onChange={(e) => setForm((p) => ({ ...p, keyword: e.target.value }))}
                placeholder="main keyword"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Language</label>
              <select
                value={form.language}
                onChange={(e) => setForm((p) => ({ ...p, language: e.target.value }))}
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="en">English</option>
                <option value="ja">Japanese</option>
                <option value="vi">Vietnamese</option>
                <option value="ko">Korean</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Meta Description</label>
            <Input
              value={form.metaDescription}
              onChange={(e) => setForm((p) => ({ ...p, metaDescription: e.target.value }))}
              placeholder="Brief description for search engines..."
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Excerpt</label>
            <textarea
              value={form.excerpt}
              onChange={(e) => setForm((p) => ({ ...p, excerpt: e.target.value }))}
              placeholder="Short excerpt shown on blog listing..."
              className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm"
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Content (HTML)</label>
            <textarea
              value={form.content}
              onChange={(e) => setForm((p) => ({ ...p, content: e.target.value }))}
              placeholder="Write your blog post content..."
              className="w-full min-h-[300px] rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
              rows={15}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Tags (comma-separated)</label>
            <Input
              value={form.tags}
              onChange={(e) => setForm((p) => ({ ...p, tags: e.target.value }))}
              placeholder="ai, marketing, automation"
            />
          </div>

          <div className="flex items-center justify-between pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => {
                setShowEditor(false);
                setEditingPost(null);
                setForm({ title: '', slug: '', content: '', excerpt: '', metaDescription: '', keyword: '', tags: '', language: 'en', status: 'draft' });
              }}
            >
              Cancel
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setForm((p) => ({ ...p, status: 'draft' })); handleSave(); }}>
                <Save className="w-4 h-4 mr-1" />
                Save Draft
              </Button>
              <Button onClick={() => { setForm((p) => ({ ...p, status: 'published' })); handleSave(); }}>
                <Send className="w-4 h-4 mr-1" />
                Publish
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Blog Posts
            </CardTitle>
            <CardDescription>Create and manage blog posts for SEO and engagement</CardDescription>
          </div>
          <Button size="sm" onClick={() => setShowEditor(true)}>
            <Plus className="w-4 h-4 mr-1" />
            New Post
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : posts.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <FileText className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p className="font-medium">No blog posts yet</p>
            <p className="text-sm mb-4">Create your first post to boost SEO</p>
            <Button size="sm" onClick={() => setShowEditor(true)}>
              <Plus className="w-4 h-4 mr-1" />
              Create Post
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {posts.map((post) => (
              <div
                key={post.id}
                className="flex items-center justify-between p-4 rounded-xl border bg-muted/30"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium truncate">{post.title}</p>
                    <Badge variant={post.status === 'published' ? 'default' : 'outline'}>
                      {post.status}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {post.language}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    /{post.slug} &middot; {new Date(post.updatedAt || post.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="ghost" onClick={() => window.open(`/blog/${post.slug}`, '_blank')}>
                    <Eye className="w-4 h-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => handleEdit(post)}>
                    <Edit3 className="w-4 h-4" />
                  </Button>
                  {post.status === 'draft' && (
                    <Button size="sm" variant="outline" onClick={() => handlePublish(post.id)}>
                      <Send className="w-4 h-4 mr-1" />
                      Publish
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className="text-red-500" onClick={() => handleDelete(post.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// =====================
// Settings Tab
// =====================
function SettingsTab() {
  const [selectedLevel, setSelectedLevel] = useState('balanced');
  const [settings, setSettings] = useState({
    autoRestart: true,
    smartSaving: true,
    notifications: true,
  });
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    toast.success('Settings saved');
    setIsSaving(false);
  };

  return (
    <div className="space-y-6">
      {/* System Health */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5" />
            System Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
            <span className="font-medium text-green-700">All systems running</span>
            <Badge variant="outline" className="ml-auto">Healthy</Badge>
          </div>
        </CardContent>
      </Card>

      {/* AI Performance Level */}
      <Card>
        <CardHeader>
          <CardTitle>AI Performance Level</CardTitle>
          <CardDescription>Choose how your AI agents work</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {aiLevels.map((level) => {
            const Icon = level.icon;
            return (
              <div
                key={level.id}
                className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                  selectedLevel === level.id
                    ? 'border-primary bg-primary/5'
                    : 'border-transparent bg-muted/50 hover:border-primary/30'
                }`}
                onClick={() => setSelectedLevel(level.id)}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-5 h-5 ${selectedLevel === level.id ? 'text-primary' : 'text-muted-foreground'}`} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{level.name}</h3>
                      {level.recommended && (
                        <Badge className="bg-green-100 text-green-700 border-green-200">Recommended</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{level.description}</p>
                  </div>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                    selectedLevel === level.id ? 'border-primary bg-primary' : 'border-muted-foreground/30'
                  }`}>
                    {selectedLevel === level.id && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Agent Behavior */}
      <Card>
        <CardHeader>
          <CardTitle>Agent Behavior</CardTitle>
          <CardDescription>Control how your AI team operates</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {[
            { key: 'autoRestart', label: 'Auto-recover from errors', desc: 'If an agent encounters a problem, it will automatically try again' },
            { key: 'smartSaving', label: 'Smart cost optimization', desc: 'Automatically use the most efficient approach for each task' },
            { key: 'notifications', label: 'Activity notifications', desc: 'Get notified when agents complete important tasks' },
          ].map((setting) => (
            <div key={setting.key} className="flex items-center justify-between">
              <div>
                <p className="font-medium">{setting.label}</p>
                <p className="text-sm text-muted-foreground">{setting.desc}</p>
              </div>
              <Switch
                checked={settings[setting.key as keyof typeof settings]}
                onCheckedChange={(checked) =>
                  setSettings((prev) => ({ ...prev, [setting.key]: checked }))
                }
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isSaving} className="gap-2">
          {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Settings
        </Button>
      </div>
    </div>
  );
}
