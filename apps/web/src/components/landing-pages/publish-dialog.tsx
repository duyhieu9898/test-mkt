'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Globe, Loader2, AlertCircle, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api/client';
import { useAuthStore } from '@/stores/auth-store';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';

interface PublishDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pageId: string;
  companyId: string;
  onPublished?: (url: string) => void;
}

export function PublishDialog({ open, onOpenChange, pageId, companyId, onPublished }: PublishDialogProps) {
  const token = useAuthStore((state) => state.token);
  const router = useRouter();

  const [target, setTarget] = useState<'builtin' | 'wordpress' | 'aws'>('builtin');
  const [wpPath, setWpPath] = useState('');
  const [wpStatus, setWpStatus] = useState<'draft' | 'publish'>('publish');
  const [awsBucket, setAwsBucket] = useState('');
  const [awsRegion, setAwsRegion] = useState('ap-southeast-1');
  const [awsAccessKey, setAwsAccessKey] = useState('');
  const [awsSecretKey, setAwsSecretKey] = useState('');
  const [isPublishing, setIsPublishing] = useState(false);

  // Check WordPress connection
  const { data: wpConnection } = useQuery<{ connected: boolean; siteUrl?: string }>({
    queryKey: ['wp-status-publish', companyId],
    queryFn: () => api.post(`/seo-engine/company/${companyId}/wordpress/test`, {}, { token: token! }),
    enabled: !!token && open,
  });

  const wpConnected = wpConnection?.connected === true;

  const handlePublish = async () => {
    if (!token) return;
    setIsPublishing(true);

    try {
      const body: any = { target };

      if (target === 'wordpress') {
        if (!wpConnected) {
          toast.error('Please connect WordPress first in Settings');
          setIsPublishing(false);
          return;
        }
        body.wordpress = {
          parentPath: wpPath || undefined,
          pageStatus: wpStatus,
        };
      } else if (target === 'aws') {
        if (!awsBucket || !awsAccessKey || !awsSecretKey) {
          toast.error('Please fill in all AWS fields');
          setIsPublishing(false);
          return;
        }
        body.aws = {
          bucket: awsBucket,
          region: awsRegion,
          accessKeyId: awsAccessKey,
          secretAccessKey: awsSecretKey,
        };
      }

      const res = await api.post<{ success: boolean; publishedUrl: string; message: string }>(
        `/landing-pages/${pageId}/publish`, body, { token }
      );

      if (res.success) {
        toast.success(res.message || 'Page published!');
        onOpenChange(false);
        onPublished?.(res.publishedUrl);
      } else {
        toast.error('Publishing failed');
      }
    } catch (err: any) {
      toast.error(err.message || 'Could not publish page');
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Publish Landing Page</DialogTitle>
          <DialogDescription>Choose where to publish your page</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-3">
          {/* Built-in */}
          <div
            className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${target === 'builtin' ? 'border-primary bg-primary/5' : 'border-muted hover:border-primary/30'}`}
            onClick={() => setTarget('builtin')}
          >
            <div className="flex items-center gap-2">
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${target === 'builtin' ? 'border-primary bg-primary' : 'border-muted-foreground/30'}`}>
                {target === 'builtin' && <div className="w-2 h-2 rounded-full bg-white" />}
              </div>
              <div>
                <p className="font-medium text-sm">Built-in Hosting</p>
                <p className="text-xs text-muted-foreground">Instant — hosted by 1Person</p>
              </div>
            </div>
          </div>

          {/* WordPress */}
          <div
            className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${target === 'wordpress' ? 'border-primary bg-primary/5' : 'border-muted hover:border-primary/30'}`}
            onClick={() => setTarget('wordpress')}
          >
            <div className="flex items-center gap-2">
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${target === 'wordpress' ? 'border-primary bg-primary' : 'border-muted-foreground/30'}`}>
                {target === 'wordpress' && <div className="w-2 h-2 rounded-full bg-white" />}
              </div>
              <div>
                <p className="font-medium text-sm">WordPress</p>
                <p className="text-xs text-muted-foreground">Publish as a page on your WordPress site</p>
              </div>
            </div>
            {target === 'wordpress' && (
              <div className="mt-3 pl-6 space-y-2">
                {wpConnected ? (
                  <>
                    <p className="text-xs text-green-600 flex items-center gap-1">Connected to {wpConnection?.siteUrl}</p>
                    <div>
                      <Label className="text-xs">Parent page path (optional)</Label>
                      <Input value={wpPath} onChange={(e) => setWpPath(e.target.value)} placeholder="/en/products-land" className="text-xs h-8 mt-1" />
                      <p className="text-[10px] text-muted-foreground mt-0.5">Leave empty to publish at root level</p>
                    </div>
                    <div>
                      <Label className="text-xs">Status</Label>
                      <Select value={wpStatus} onValueChange={(v) => setWpStatus(v as any)}>
                        <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="publish">Publish immediately</SelectItem>
                          <SelectItem value="draft">Save as draft</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center gap-2 text-amber-600 text-xs">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>WordPress not connected</span>
                    <Link href={`/${companyId}/seo-engine`} className="text-primary hover:underline flex items-center gap-0.5 ml-1">
                      Connect in SEO Engine <ArrowRight className="w-3 h-3" />
                    </Link>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* AWS */}
          <div
            className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${target === 'aws' ? 'border-primary bg-primary/5' : 'border-muted hover:border-primary/30'}`}
            onClick={() => setTarget('aws')}
          >
            <div className="flex items-center gap-2">
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${target === 'aws' ? 'border-primary bg-primary' : 'border-muted-foreground/30'}`}>
                {target === 'aws' && <div className="w-2 h-2 rounded-full bg-white" />}
              </div>
              <div>
                <p className="font-medium text-sm">AWS S3</p>
                <p className="text-xs text-muted-foreground">Host as static page on Amazon S3</p>
              </div>
            </div>
            {target === 'aws' && (
              <div className="mt-3 pl-6 space-y-2">
                <Input value={awsBucket} onChange={(e) => setAwsBucket(e.target.value)} placeholder="Bucket name" className="text-xs h-8" />
                <Input value={awsRegion} onChange={(e) => setAwsRegion(e.target.value)} placeholder="Region" className="text-xs h-8" />
                <Input value={awsAccessKey} onChange={(e) => setAwsAccessKey(e.target.value)} placeholder="Access Key ID" className="text-xs h-8" />
                <Input value={awsSecretKey} onChange={(e) => setAwsSecretKey(e.target.value)} placeholder="Secret Access Key" type="password" className="text-xs h-8" />
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handlePublish} disabled={isPublishing} className="gap-2">
            {isPublishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
            {isPublishing ? 'Publishing...' : 'Publish'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
