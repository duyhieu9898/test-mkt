'use client';

/**
 * Admin — Publish Queue (doc 10 §L3, Đợt 5)
 * Lists landing pages awaiting review. Admin can preview, approve, reject.
 */

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { CheckCircle2, Clock, ExternalLink, Loader2, Inbox, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api/client';
import { useAuthStore } from '@/stores/auth-store';
import { useQuery, useQueryClient } from '@tanstack/react-query';

interface QueueItem {
  id: string; name: string; subdomain: string | null;
  seo: { title?: string; description?: string } | null;
  primaryColor: string; publishSubmittedAt: string;
  companyId: string; companyName: string | null;
}

function timeAgo(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
}

export default function PublishQueuePage() {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<{ items: QueueItem[]; count: number }>({
    queryKey: ['admin-publish-queue'],
    queryFn: () => api.get('/admin/publish/queue', { token: token! }),
    enabled: !!token,
    refetchInterval: 20_000,
  });

  const [busy, setBusy] = useState<string | null>(null);
  const [rejectFor, setRejectFor] = useState<QueueItem | null>(null);
  const [reason, setReason] = useState('');
  const items = data?.items || [];
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin-publish-queue'] });

  const approve = async (item: QueueItem) => {
    if (!token) return;
    setBusy(item.id);
    try {
      await api.post(`/admin/publish/queue/${item.id}/approve`, {}, { token });
      toast.success(`${item.name} is now live at /pages/${item.subdomain}`);
      refresh();
    } catch (e: any) { toast.error(e.message || 'Approve failed'); }
    finally { setBusy(null); }
  };

  const submitReject = async () => {
    if (!token || !rejectFor) return;
    if (!reason.trim()) return toast.error('Reason required');
    setBusy(rejectFor.id);
    try {
      await api.post(`/admin/publish/queue/${rejectFor.id}/reject`, { reason: reason.trim() }, { token });
      toast.success('Page rejected. The owner will see your feedback.');
      setRejectFor(null); setReason(''); refresh();
    } catch (e: any) { toast.error(e.message || 'Reject failed'); }
    finally { setBusy(null); }
  };

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          Publish Queue
          <Badge className="bg-amber-100 text-amber-700 border-amber-200">{items.length}</Badge>
        </h1>
        <p className="text-sm text-gray-500 mt-1">Landing pages waiting for admin review.</p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading queue…
        </div>
      ) : items.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-gray-400">
          <Inbox className="w-10 h-10 mx-auto mb-3 text-gray-300" />
          <p className="font-medium">No pages waiting for review</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <Card key={item.id}><CardContent className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold truncate">{item.name}</h3>
                    <Badge variant="outline" className="text-xs">{item.companyName || 'Unknown'}</Badge>
                    <span className="text-xs text-gray-400 flex items-center gap-1"><Clock className="w-3 h-3" />{timeAgo(item.publishSubmittedAt)}</span>
                  </div>
                  <p className="text-xs text-gray-500 mb-2">URL: <code className="px-1 py-0.5 bg-gray-100 rounded">/pages/{item.subdomain}</code></p>
                  {item.seo?.title && <p className="text-sm font-medium text-gray-700 truncate">{item.seo.title}</p>}
                  {item.seo?.description && <p className="text-xs text-gray-500 line-clamp-2">{item.seo.description}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button asChild variant="outline" size="sm">
                    <a href={`/pages/${item.subdomain}`} target="_blank" rel="noreferrer" className="gap-1"><ExternalLink className="w-3.5 h-3.5" />Preview</a>
                  </Button>
                  <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 gap-1" disabled={busy === item.id} onClick={() => approve(item)}>
                    {busy === item.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}Approve
                  </Button>
                  <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50 gap-1" disabled={busy === item.id} onClick={() => { setRejectFor(item); setReason(''); }}>
                    <XCircle className="w-3.5 h-3.5" />Reject
                  </Button>
                </div>
              </div>
            </CardContent></Card>
          ))}
        </div>
      )}

      <Dialog open={!!rejectFor} onOpenChange={(o) => !o && setRejectFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject "{rejectFor?.name}"</DialogTitle>
            <DialogDescription>Explain why this page cannot be published. The owner will see your reason.</DialogDescription>
          </DialogHeader>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Missing privacy policy, broken CTA…" rows={4} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectFor(null)}>Cancel</Button>
            <Button className="bg-red-600 hover:bg-red-700" disabled={!reason.trim() || busy === rejectFor?.id} onClick={submitReject}>
              {busy === rejectFor?.id ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}Reject page
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
