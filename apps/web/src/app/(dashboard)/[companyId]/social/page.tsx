'use client';

import { useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Share2, Plus, Sparkles, Loader2, Trash2, Pencil, Send, Calendar, Facebook, Instagram, Linkedin, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/auth-store';
import { api } from '@/lib/api/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';

type Platform = 'facebook' | 'instagram' | 'linkedin';
interface SocialPost {
  id: string; content: string; platforms: Platform[]; media_urls: string[];
  scheduled_at: string | null; published_at: string | null;
  status: 'draft' | 'scheduled' | 'published' | 'failed'; ai_generated: boolean; created_at: string;
}

const PM: Record<Platform, { icon: typeof Facebook; label: string; color: string; maxLen: number }> = {
  facebook:  { icon: Facebook,  label: 'Facebook',  color: 'bg-blue-100 text-blue-700',  maxLen: 2200 },
  instagram: { icon: Instagram, label: 'Instagram', color: 'bg-pink-100 text-pink-700',  maxLen: 2200 },
  linkedin:  { icon: Linkedin,  label: 'LinkedIn',  color: 'bg-sky-100 text-sky-700',    maxLen: 3000 },
};
const SS: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700', scheduled: 'bg-amber-100 text-amber-700',
  published: 'bg-green-100 text-green-700', failed: 'bg-red-100 text-red-700',
};

function groupByDate(posts: SocialPost[]) {
  const g: Record<string, SocialPost[]> = {};
  for (const p of posts) {
    const d = new Date(p.scheduled_at || p.created_at).toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
    (g[d] ??= []).push(p);
  }
  return g;
}

function toLocal(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function PlatformPicker({ value, onChange }: { value: Platform[]; onChange: (v: Platform[]) => void }) {
  return (
    <div className="flex gap-2 mt-1">
      {(Object.keys(PM) as Platform[]).map((p) => {
        const m = PM[p]; const on = value.includes(p);
        return (
          <button key={p} type="button"
            onClick={() => onChange(on ? value.filter((x) => x !== p) : [...value, p])}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${on ? m.color + ' border-current' : 'bg-muted text-muted-foreground border-transparent'}`}>
            <m.icon className="w-3.5 h-3.5" /> {m.label}
          </button>
        );
      })}
    </div>
  );
}

export default function SocialPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['social-posts', companyId],
    queryFn: () => api.get<{ posts: SocialPost[] }>(`/social/${companyId}/posts`, { token: token! }),
    enabled: !!token,
  });
  const posts = data?.posts ?? [];

  const [composeOpen, setComposeOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [platforms, setPlatforms] = useState<Platform[]>(['facebook']);
  const [scheduleAt, setScheduleAt] = useState('');
  const [saving, setSaving] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiTopic, setAiTopic] = useState('');
  const [aiPlatforms, setAiPlatforms] = useState<Platform[]>(['facebook']);
  const [drafting, setDrafting] = useState(false);

  const reset = useCallback(() => { setEditId(null); setContent(''); setPlatforms(['facebook']); setScheduleAt(''); }, []);
  const refresh = () => qc.invalidateQueries({ queryKey: ['social-posts', companyId] });
  const maxLen = Math.min(...platforms.map((p) => PM[p]?.maxLen ?? 3000));

  const openEdit = (p: SocialPost) => {
    setEditId(p.id); setContent(p.content); setPlatforms(p.platforms);
    setScheduleAt(toLocal(p.scheduled_at)); setComposeOpen(true);
  };

  const handleSave = async (publishNow = false) => {
    if (!content.trim()) return;
    setSaving(true);
    try {
      if (editId) {
        await api.patch(`/social/${companyId}/posts/${editId}`, { content, platforms, scheduledAt: scheduleAt || null }, { token: token! });
      } else {
        const res = await api.post<{ post: SocialPost }>(`/social/${companyId}/posts`, { content, platforms, mediaUrls: [], scheduledAt: scheduleAt || null }, { token: token! });
        if (publishNow && res.post?.id) {
          const pub = await api.post<{ published?: boolean; results?: Array<{ platform: string; ok: boolean; error?: string }> }>(`/social/${companyId}/posts/${res.post.id}/publish-now`, {}, { token: token! });
          reportPublish(pub);
        } else {
          toast.success(scheduleAt ? 'Post scheduled!' : 'Draft saved!');
        }
      }
      if (editId) toast.success(scheduleAt ? 'Post scheduled!' : 'Saved!');
      reset(); setComposeOpen(false); refresh();
    } catch (e: any) { toast.error(e.message || 'Failed to save'); }
    setSaving(false);
  };

  const handleDelete = async (id: string) => { await api.delete(`/social/${companyId}/posts/${id}`, { token: token! }); toast.success('Deleted'); refresh(); };

  // Surface real per-platform publish outcomes (FB is live; IG/LinkedIn not yet connected).
  type PublishResp = { published?: boolean; results?: Array<{ platform: string; ok: boolean; error?: string }> };
  const reportPublish = (res: PublishResp) => {
    const ok = (res.results ?? []).filter((r) => r.ok).map((r) => r.platform);
    const failed = (res.results ?? []).filter((r) => !r.ok);
    if (ok.length) toast.success(`Published to ${ok.join(', ')}`);
    for (const f of failed) toast.error(`${f.platform}: ${f.error ?? 'not published'}`);
    if (!ok.length && !failed.length) toast.success('Saved');
  };
  const handlePublish = async (id: string) => {
    try {
      const res = await api.post<PublishResp>(`/social/${companyId}/posts/${id}/publish-now`, {}, { token: token! });
      reportPublish(res);
    } catch (e: any) {
      toast.error(e.message || 'Publish failed');
    }
    refresh();
  };

  const handleAiDraft = async () => {
    setDrafting(true);
    try {
      const res = await api.post<{ draft: string }>(`/social/${companyId}/posts/ai-draft`, { topic: aiTopic || undefined, platforms: aiPlatforms }, { token: token! });
      setContent(res.draft); setPlatforms(aiPlatforms); setAiOpen(false); setComposeOpen(true);
      toast.success('AI draft ready -- review and schedule!');
    } catch (e: any) { toast.error(e.message || 'AI draft failed'); }
    setDrafting(false);
  };

  const grouped = groupByDate(posts);
  const canSave = content.trim().length > 0 && platforms.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Share2 className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold">Social Media</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { setAiTopic(''); setAiOpen(true); }}>
            <Sparkles className="w-4 h-4 mr-1" /> AI Draft
          </Button>
          <Button onClick={() => { reset(); setComposeOpen(true); }}>
            <Plus className="w-4 h-4 mr-1" /> New Post
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : posts.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-muted-foreground">
          No posts yet. Click "New Post" or "AI Draft" to get started.
        </CardContent></Card>
      ) : Object.entries(grouped).map(([date, items]) => (
        <div key={date}>
          <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
            <Calendar className="w-4 h-4" /> {date}
          </h3>
          <div className="space-y-3 ml-2 border-l-2 border-muted pl-4">
            {items.map((p) => (
              <Card key={p.id} className="group">
                <CardContent className="py-4 flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0 space-y-2">
                    <p className="text-sm line-clamp-2">{p.content}</p>
                    <div className="flex flex-wrap items-center gap-2">
                      {p.platforms.map((pl) => { const m = PM[pl]; return m ? (
                        <Badge key={pl} variant="secondary" className={m.color + ' text-[10px]'}><m.icon className="w-3 h-3 mr-1" />{m.label}</Badge>
                      ) : null; })}
                      <Badge variant="secondary" className={SS[p.status]}>{p.status}</Badge>
                      {p.scheduled_at && <span className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" /> {new Date(p.scheduled_at).toLocaleString()}</span>}
                      {p.ai_generated && <Badge variant="outline" className="text-[10px]">AI</Badge>}
                    </div>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(p)}><Pencil className="w-4 h-4" /></Button>
                    {(p.status === 'draft' || p.status === 'scheduled') && (
                      <Button size="icon" variant="ghost" onClick={() => handlePublish(p.id)}><Send className="w-4 h-4" /></Button>
                    )}
                    <Button size="icon" variant="ghost" onClick={() => handleDelete(p.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}

      <Dialog open={composeOpen} onOpenChange={(o) => { if (!o) reset(); setComposeOpen(o); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editId ? 'Edit Post' : 'New Post'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Platforms</Label><PlatformPicker value={platforms} onChange={setPlatforms} /></div>
            <div>
              <div className="flex justify-between"><Label>Content</Label>
                <span className={`text-xs ${content.length > maxLen ? 'text-destructive' : 'text-muted-foreground'}`}>{content.length}/{maxLen}</span>
              </div>
              <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={5} placeholder="Write your post..." className="mt-1" />
            </div>
            <div><Label>Schedule</Label><Input type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} className="mt-1" /></div>
          </div>
          <DialogFooter className="gap-2">
            {!editId && <Button variant="outline" onClick={() => handleSave(true)} disabled={saving || !canSave}><Send className="w-4 h-4 mr-1" /> Post Now</Button>}
            <Button onClick={() => handleSave(false)} disabled={saving || !canSave}>
              {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}{scheduleAt ? 'Schedule' : 'Save Draft'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={aiOpen} onOpenChange={setAiOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>AI Draft</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Topic (optional)</Label>
              <Input value={aiTopic} onChange={(e) => setAiTopic(e.target.value)} placeholder="e.g. product launch, promotion..." className="mt-1" />
              <p className="text-xs text-muted-foreground mt-1">Leave blank to use your latest Brain context.</p>
            </div>
            <div><Label>Platforms</Label><PlatformPicker value={aiPlatforms} onChange={setAiPlatforms} /></div>
          </div>
          <DialogFooter>
            <Button onClick={handleAiDraft} disabled={drafting || aiPlatforms.length === 0}>
              {drafting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1" />} Generate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
