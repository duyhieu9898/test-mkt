'use client';

/**
 * Publish Dialog — subdomain + SEO submission for admin review.
 * doc 10 §L3 (Đợt 5). No hosting keys — CEO picks a subdomain, fills SEO,
 * submits for review. Admin approves at /admin/publish-queue.
 */

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertCircle, CheckCircle2, Clock, Globe, Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api/client';
import { useAuthStore } from '@/stores/auth-store';
import { useQuery } from '@tanstack/react-query';
import { BlockListRenderer } from './blocks/block-renderer';

interface PublishDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pageId: string;
  companyId: string;
  onPublished?: (url: string) => void;
}

interface PageData {
  id: string; name: string; subdomain: string | null;
  seo: { title?: string; description?: string; keywords?: string[] } | null;
  primaryColor: string;
  content: { blocks?: any[] } | null;
  publishApprovalStatus: 'draft' | 'pending_approval' | 'approved' | 'rejected';
  publishRejectReason: string | null;
}

const SUB_RE = /^[a-z0-9-]+$/;

export function PublishDialog({ open, onOpenChange, pageId, companyId, onPublished }: PublishDialogProps) {
  const token = useAuthStore((s) => s.token);
  const { data: page, refetch } = useQuery<PageData>({
    queryKey: ['publish-dialog-page', pageId],
    queryFn: () => api.get<PageData>(`/landing-pages/${pageId}`, { token: token! }),
    enabled: !!token && open,
  });

  const [subdomain, setSubdomain] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [keywords, setKeywords] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!page) return;
    setSubdomain(page.subdomain || '');
    setTitle(page.seo?.title || page.name || '');
    setDescription(page.seo?.description || '');
    setKeywords((page.seo?.keywords || []).join(', '));
  }, [page, open]);

  const subError = useMemo(() => {
    if (!subdomain) return 'Required';
    if (subdomain.length < 3 || subdomain.length > 60) return '3 to 60 characters';
    if (!SUB_RE.test(subdomain)) return 'Lowercase letters, digits, and dashes only';
    return null;
  }, [subdomain]);

  const status = page?.publishApprovalStatus || 'draft';
  const isPending = status === 'pending_approval';

  const handleSubmit = async () => {
    if (!token || !page) return;
    if (subError) return toast.error(subError);
    if (!title.trim() || !description.trim()) return toast.error('Meta title and description are required');
    setSubmitting(true);
    try {
      await api.post(
        `/landing-pages/${companyId}/${pageId}/submit-publish`,
        {
          subdomain: subdomain.toLowerCase(),
          seo: {
            metaTitle: title.trim(),
            metaDescription: description.trim(),
            metaKeywords: keywords.split(',').map((s) => s.trim()).filter(Boolean),
          },
        },
        { token },
      );
      toast.success('Submitted for review. An admin will approve shortly.');
      await refetch();
      onPublished?.(`/pages/${subdomain.toLowerCase()}`);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || 'Could not submit page');
    } finally { setSubmitting(false); }
  };

  const badge =
    status === 'pending_approval' ? <Badge className="gap-1 bg-amber-100 text-amber-700 border-amber-200"><Clock className="w-3 h-3" />Pending review</Badge>
    : status === 'approved' ? <Badge className="gap-1 bg-emerald-100 text-emerald-700 border-emerald-200"><CheckCircle2 className="w-3 h-3" />Live</Badge>
    : status === 'rejected' ? <Badge className="gap-1 bg-red-100 text-red-700 border-red-200"><AlertCircle className="w-3 h-3" />Rejected</Badge>
    : <Badge variant="outline">Draft</Badge>;

  const primaryLabel =
    status === 'draft' ? 'Submit for publish approval'
    : status === 'pending_approval' ? 'Waiting for admin review'
    : status === 'approved' ? 'Resubmit changes'
    : 'Submit again';

  const blocks = (page?.content?.blocks as any[]) || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <DialogTitle className="flex items-center gap-2"><Globe className="w-4 h-4" />Publish landing page</DialogTitle>
            {badge}
          </div>
          <DialogDescription>
            Submit for admin review. Once approved it will be live at
            <code className="mx-1 px-1 py-0.5 bg-muted rounded text-xs">/pages/{subdomain || 'your-subdomain'}</code>
          </DialogDescription>
        </DialogHeader>

        {status === 'rejected' && page?.publishRejectReason && (
          <div className="p-3 rounded-md border border-red-200 bg-red-50 text-sm text-red-700">
            <p className="font-semibold flex items-center gap-1 mb-0.5"><AlertCircle className="w-4 h-4" />Rejected by admin</p>
            <p>{page.publishRejectReason}</p>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-6 flex-1 overflow-y-auto">
          <div className="space-y-4">
            <div>
              <Label>Subdomain</Label>
              <Input value={subdomain} onChange={(e) => setSubdomain(e.target.value.toLowerCase())} placeholder="my-product" />
              <p className={`text-xs mt-1 ${subError ? 'text-red-600' : 'text-muted-foreground'}`}>{subError || `Public URL: /pages/${subdomain}`}</p>
            </div>
            <div>
              <Label>Meta title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
              <p className="text-xs text-muted-foreground mt-1">{title.length}/200 — browser tab and search results</p>
            </div>
            <div>
              <Label>Meta description</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={500} />
              <p className="text-xs text-muted-foreground mt-1">{description.length}/500</p>
            </div>
            <div>
              <Label>Keywords</Label>
              <Input value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="ai, marketing, automation" />
              <p className="text-xs text-muted-foreground mt-1">Comma-separated</p>
            </div>
          </div>

          <div className="border rounded-lg overflow-hidden bg-white">
            <div className="px-3 py-2 text-xs border-b bg-gray-50 text-muted-foreground">Preview</div>
            <div className="overflow-y-auto max-h-[55vh] origin-top scale-[0.55]" style={{ width: '181.8%' }}>
              {blocks.length > 0 ? (
                <BlockListRenderer blocks={blocks} primaryColor={page?.primaryColor || '#3b82f6'} />
              ) : (
                <div className="p-12 text-center text-sm text-muted-foreground">No blocks to preview</div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button onClick={handleSubmit} disabled={submitting || isPending || !!subError} className="gap-2">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {primaryLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
