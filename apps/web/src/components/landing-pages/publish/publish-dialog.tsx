'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Globe,
  Loader2,
  CheckCircle2,
  ExternalLink,
  Copy,
  AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { useAuthStore } from '@/stores/auth-store';

interface PublishDialogProps {
  pageId: string;
  pageName: string;
  pageSlug: string;
  currentUrl?: string;
  onPublished?: (url: string) => void;
  children?: React.ReactNode;
}

type Provider = 'vercel' | 'cloudflare' | 'custom';

export function PublishDialog({
  pageId,
  pageName,
  pageSlug,
  currentUrl,
  onPublished,
  children,
}: PublishDialogProps) {
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState<Provider>('custom');
  const [subdomain, setSubdomain] = useState(pageSlug);
  const [customDomain, setCustomDomain] = useState('');
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();

  const deployMutation = useMutation({
    mutationFn: async () => {
      return api.post<{ success: boolean; data: { url: string; deploymentId: string } }>(
        `/deployments/${pageId}/deploy`,
        {
          provider,
          subdomain,
          customDomain: customDomain || undefined,
        },
        { token: token! }
      );
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['landingPage', pageId] });
      queryClient.invalidateQueries({ queryKey: ['landingPages'] });
      toast.success('Page published successfully!');
      if (onPublished && result.data.url) {
        onPublished(result.data.url);
      }
      setOpen(false);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to publish page');
    },
  });

  const handlePublish = () => {
    deployMutation.mutate();
  };

  const handleCopyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    toast.success('URL copied to clipboard');
  };

  const previewUrl = provider === 'vercel'
    ? `https://${subdomain}.vercel.app`
    : provider === 'cloudflare'
    ? `https://${subdomain}.pages.dev`
    : `https://${subdomain}.pages.1person.ai`;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children || (
          <Button>
            <Globe className="w-4 h-4 mr-2" />
            Publish
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Publish Landing Page</DialogTitle>
          <DialogDescription>
            Deploy "{pageName}" to make it publicly accessible.
          </DialogDescription>
        </DialogHeader>

        {currentUrl ? (
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-3 p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              <div className="flex-1">
                <p className="font-medium text-sm">Published</p>
                <p className="text-xs text-muted-foreground">Your page is live</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Live URL</Label>
              <div className="flex gap-2">
                <Input value={currentUrl} readOnly className="font-mono text-sm" />
                <Button variant="outline" size="icon" onClick={() => handleCopyUrl(currentUrl)}>
                  <Copy className="w-4 h-4" />
                </Button>
                <Button variant="outline" size="icon" asChild>
                  <a href={currentUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </Button>
              </div>
            </div>
            <Button
              onClick={handlePublish}
              className="w-full"
              disabled={deployMutation.isPending}
            >
              {deployMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Republishing...
                </>
              ) : (
                <>
                  <Globe className="w-4 h-4 mr-2" />
                  Republish Changes
                </>
              )}
            </Button>
          </div>
        ) : (
          <div className="space-y-6 py-4">
            {/* Provider Selection */}
            <div className="space-y-3">
              <Label>Hosting Provider</Label>
              <RadioGroup
                value={provider}
                onValueChange={(v) => setProvider(v as Provider)}
                className="grid grid-cols-3 gap-2"
              >
                <label
                  className={`flex flex-col items-center justify-center p-4 rounded-lg border cursor-pointer transition-colors ${provider === 'custom' ? 'border-primary bg-primary/5' : 'hover:bg-accent'}`}
                >
                  <RadioGroupItem value="custom" className="sr-only" />
                  <Globe className="w-6 h-6 mb-2" />
                  <span className="text-xs font-medium">1Person Pages</span>
                </label>
                <label
                  className={`flex flex-col items-center justify-center p-4 rounded-lg border cursor-pointer transition-colors ${provider === 'vercel' ? 'border-primary bg-primary/5' : 'hover:bg-accent'}`}
                >
                  <RadioGroupItem value="vercel" className="sr-only" />
                  <svg className="w-6 h-6 mb-2" viewBox="0 0 76 65" fill="currentColor">
                    <path d="M37.5274 0L75.0548 65H0L37.5274 0Z" />
                  </svg>
                  <span className="text-xs font-medium">Vercel</span>
                </label>
                <label
                  className={`flex flex-col items-center justify-center p-4 rounded-lg border cursor-pointer transition-colors ${provider === 'cloudflare' ? 'border-primary bg-primary/5' : 'hover:bg-accent'}`}
                >
                  <RadioGroupItem value="cloudflare" className="sr-only" />
                  <svg className="w-6 h-6 mb-2" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M16.5088 16.8447c.1475-.5068.0908-.9707-.1553-1.2773-.2246-.2851-.589-.4415-1.0234-.4415H6.6593c-.0752 0-.1074-.0713-.0966-.1235.0117-.0523.0586-.0948.1172-.1027l8.6484-.0235c.5342-.0146 1.1133-.4073 1.3593-.9 1.2792-2.5648-.4248-6.0347-3.7324-6.0347-.1865 0-.372.0079-.5556.0235L12.3 7.968c-.0147-.0527-.0733-.0737-.1172-.0391-.0439.0347-.0586.1036-.0332.1563l.5645 1.1953c.0234.0527.0205.1055-.0117.1465-.0312.041-.0742.0645-.1211.0645H9.1036c-.073 0-.123-.0528-.1015-.1084.6563-1.7051 2.3789-2.9121 4.3828-2.9121 2.1387 0 3.9375 1.4355 4.4648 3.3926.3545-.209.7608-.3281 1.1876-.3281 1.3613 0 2.4648 1.1035 2.4648 2.4648 0 .4824-.1377.9316-.3779 1.3125-.0381.0527-.0234.123.0323.1641.0557.041.1357.0391.1885-.0039.3398-.2793.5537-.6855.5537-1.1426 0-.8203-.6563-1.4883-1.4765-1.4883-.1631 0-.3203.0264-.4668.0762-.2793-2.3828-2.3262-4.2422-4.8281-4.2422-2.1973 0-4.0605 1.4473-4.6758 3.4375h-.0244c-1.3594 0-2.4707 1.0928-2.4707 2.4473 0 1.3564 1.1113 2.4512 2.4707 2.4512h8.7266c.2559 0 .498-.1787.5566-.4122.0586-.2334-.0225-.4668-.207-.5967-.0957-.0684-.123-.1992-.0615-.3047.0615-.1055.1904-.1582.3047-.1211z" />
                  </svg>
                  <span className="text-xs font-medium">Cloudflare</span>
                </label>
              </RadioGroup>
            </div>

            {/* Subdomain */}
            <div className="space-y-2">
              <Label htmlFor="subdomain">Subdomain</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="subdomain"
                  value={subdomain}
                  onChange={(e) => setSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  placeholder="my-landing-page"
                  className="font-mono"
                />
                <span className="text-sm text-muted-foreground whitespace-nowrap">
                  {provider === 'vercel' ? '.vercel.app' : provider === 'cloudflare' ? '.pages.dev' : '.pages.1person.ai'}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Your page will be available at: {previewUrl}
              </p>
            </div>

            {/* Custom Domain (optional) */}
            <div className="space-y-2">
              <Label htmlFor="customDomain">Custom Domain (Optional)</Label>
              <Input
                id="customDomain"
                value={customDomain}
                onChange={(e) => setCustomDomain(e.target.value)}
                placeholder="landing.yourcompany.com"
              />
              <p className="text-xs text-muted-foreground">
                Configure DNS after publishing to use your own domain.
              </p>
            </div>

            {/* Warning for external providers */}
            {provider !== 'custom' && (
              <div className="flex items-start gap-3 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                <AlertCircle className="w-4 h-4 text-yellow-500 mt-0.5" />
                <p className="text-xs text-muted-foreground">
                  Deploying to {provider === 'vercel' ? 'Vercel' : 'Cloudflare'} requires API integration.
                  Contact support to enable this feature.
                </p>
              </div>
            )}
          </div>
        )}

        {!currentUrl && (
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handlePublish}
              disabled={deployMutation.isPending || !subdomain}
            >
              {deployMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Publishing...
                </>
              ) : (
                <>
                  <Globe className="w-4 h-4 mr-2" />
                  Publish
                </>
              )}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
