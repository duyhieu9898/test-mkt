'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  Check, ChevronRight, Clock, Facebook, Link2, Loader2, MessageCircle,
  Send, ShieldCheck, Unplug,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  useChannelConnections,
  useDisconnectChannel,
  useSelectFacebookPage,
  useStartFacebookOAuth,
  useToggleAiAutoReply,
  type FacebookPageOption,
  type OmniChannel,
} from '@/lib/api/channels-hooks';

const SUPPORTED: Array<{
  id: OmniChannel;
  name: string;
  icon: string;
  comingSoon?: boolean;
  note?: string;
}> = [
  { id: 'fb_messenger', name: 'Facebook Page', icon: 'F' },
  { id: 'zalo', name: 'Zalo OA', icon: 'Z', comingSoon: true, note: 'Pending API approval' },
  { id: 'whatsapp', name: 'WhatsApp Business', icon: 'W', comingSoon: true, note: 'Pending API approval' },
  { id: 'instagram', name: 'Instagram', icon: 'I', comingSoon: true, note: 'Pending API approval' },
];

type ConnectStep = 'intro' | 'authorizing' | 'select';

export default function ChannelsPage() {
  const { companyId } = useParams() as { companyId: string };
  const { data: connections = [], isLoading } = useChannelConnections(companyId);
  const startFacebookOAuth = useStartFacebookOAuth(companyId);
  const selectFacebookPage = useSelectFacebookPage(companyId);
  const disconnect = useDisconnectChannel(companyId);
  const toggleAi = useToggleAiAutoReply(companyId);

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<ConnectStep>('intro');
  const [pages, setPages] = useState<FacebookPageOption[]>([]);
  const [session, setSession] = useState('');
  const [selectedPageId, setSelectedPageId] = useState('');
  const popupRef = useRef<Window | null>(null);

  const resetDialog = () => {
    setStep('intro');
    setPages([]);
    setSession('');
    setSelectedPageId('');
    popupRef.current = null;
  };

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (popupRef.current && event.source !== popupRef.current) return;
      if (event.data?.type === 'facebook_pages_ready') {
        const availablePages = Array.isArray(event.data.pages)
          ? event.data.pages as FacebookPageOption[]
          : [];
        setPages(availablePages);
        setSession(String(event.data.session || ''));
        setSelectedPageId(availablePages.find((page) => page.canPublish)?.id || '');
        setStep('select');
        popupRef.current = null;
      }
      if (event.data?.type === 'facebook_oauth_error') {
        toast.error(event.data.error || 'Facebook connection failed.');
        setStep('intro');
        popupRef.current = null;
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const beginFacebookOAuth = async () => {
    try {
      const { url } = await startFacebookOAuth.mutateAsync();
      const popup = window.open(url, 'facebook_page_oauth', 'width=640,height=760');
      if (!popup) {
        toast.error('Allow popups in your browser, then try again.');
        return;
      }
      popupRef.current = popup;
      setStep('authorizing');
      const closedTimer = window.setInterval(() => {
        if (popup.closed) {
          window.clearInterval(closedTimer);
          window.setTimeout(() => {
            if (popupRef.current === popup) {
              popupRef.current = null;
              setStep('intro');
            }
          }, 500);
        }
      }, 500);
      window.setTimeout(() => window.clearInterval(closedTimer), 120_000);
    } catch (error) {
      toast.error((error as Error).message || 'Facebook is not available right now.');
    }
  };

  const connectSelectedPage = async () => {
    if (!selectedPageId || !session) return;
    try {
      const connection = await selectFacebookPage.mutateAsync({
        pageId: selectedPageId,
        session,
      });
      toast.success(`${connection.config.pageName || 'Facebook Page'} connected.`);
      setOpen(false);
      resetDialog();
    } catch (error) {
      toast.error((error as Error).message || 'Could not connect this Facebook Page.');
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-1">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <MessageCircle className="h-6 w-6 text-primary" /> Channels
        </h1>
        <p className="text-sm text-muted-foreground">
          Connect the accounts where 1Person can publish your approved campaign content.
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Available channels</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {SUPPORTED.map((platform) => {
            const live = connections.filter(
              (connection) => connection.channel === platform.id && connection.status === 'active',
            );
            return (
              <div key={platform.id} className="flex items-center justify-between rounded-lg border p-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 font-bold">
                    {platform.icon}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{platform.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {platform.comingSoon
                        ? platform.note
                        : live.length
                          ? 'Ready to publish campaign posts'
                          : 'Publish approved campaign posts'}
                    </p>
                  </div>
                </div>
                {platform.id === 'fb_messenger' ? (
                  <Button size="sm" className="gap-1" onClick={() => setOpen(true)}>
                    <Link2 className="h-3.5 w-3.5" />
                    {live.length ? 'Change Page' : 'Connect'}
                  </Button>
                ) : (
                  <Badge variant="secondary">Coming soon</Badge>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Connected accounts</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
          {!isLoading && connections.length === 0 && (
            <p className="text-sm text-muted-foreground">No accounts connected yet.</p>
          )}
          {connections.map((connection) => {
            const messagingEnabled = Boolean(connection.config.messagingEnabled);
            return (
              <div key={connection.id} className="space-y-3 rounded-lg border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white">
                      <Facebook className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        {connection.config.pageName || connection.config.pageId || 'Facebook Page'}
                      </p>
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        Connected {new Date(connection.connectedAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Badge className="bg-emerald-600">Connected</Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-red-500"
                      title="Disconnect Facebook Page"
                      onClick={async () => {
                        if (!confirm('Disconnect this Facebook Page? Publishing from 1Person will stop.')) return;
                        try {
                          await disconnect.mutateAsync(connection.id);
                          toast.success('Facebook Page disconnected.');
                        } catch {
                          toast.error('Failed to disconnect.');
                        }
                      }}
                    >
                      <Unplug className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 border-t pt-3 text-xs">
                  <span className="inline-flex items-center gap-1 text-emerald-700">
                    <Check className="h-3.5 w-3.5" /> Campaign publishing enabled
                  </span>
                  <span className="text-muted-foreground">
                    Messenger inbox {messagingEnabled ? 'enabled' : 'not enabled'}
                  </span>
                </div>

                {messagingEnabled && (
                  <div className="flex items-center justify-between border-t pt-3 text-xs">
                    <span>AI replies to Messenger conversations</span>
                    <Switch
                      checked={connection.aiAutoReply}
                      onCheckedChange={async (enabled) => {
                        try {
                          await toggleAi.mutateAsync({ id: connection.id, enabled });
                        } catch {
                          toast.error('Failed to update auto-reply.');
                        }
                      }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) resetDialog();
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Connect a Facebook Page</DialogTitle>
            <DialogDescription>
              Sign in with an account that can manage the Page. 1Person will only access Pages you approve.
            </DialogDescription>
          </DialogHeader>

          {step === 'intro' && (
            <div className="space-y-4 py-2">
              <div className="flex gap-3 rounded-lg border bg-muted/30 p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white">
                  <Facebook className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Continue with Facebook</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Facebook will ask which Pages 1Person may publish to. Your Facebook password is never shared with us.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2 text-xs text-muted-foreground">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                You must have permission to create content on the Page.
              </div>
            </div>
          )}

          {step === 'authorizing' && (
            <div className="flex min-h-40 flex-col items-center justify-center gap-3 text-center">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
              <div>
                <p className="text-sm font-medium">Waiting for Facebook</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Complete the sign-in in the popup window.
                </p>
              </div>
            </div>
          )}

          {step === 'select' && (
            <div className="space-y-3 py-1">
              <p className="text-sm font-medium">Choose where campaigns should be published</p>
              <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                {pages.map((page) => {
                  const selected = page.id === selectedPageId;
                  return (
                    <button
                      key={page.id}
                      type="button"
                      disabled={!page.canPublish}
                      onClick={() => setSelectedPageId(page.id)}
                      className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                        selected ? 'border-primary bg-primary/5' : 'hover:bg-muted/40'
                      } disabled:cursor-not-allowed disabled:opacity-50`}
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600 font-semibold text-white">
                        {page.name.slice(0, 1).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{page.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {page.canPublish ? 'Ready to publish' : 'You need content permission for this Page'}
                        </p>
                      </div>
                      {selected && <Check className="h-5 w-5 text-primary" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            {step === 'intro' && (
              <Button
                onClick={beginFacebookOAuth}
                disabled={startFacebookOAuth.isPending}
                className="gap-2 bg-blue-600 hover:bg-blue-700"
              >
                {startFacebookOAuth.isPending
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Facebook className="h-4 w-4" />}
                Continue with Facebook
              </Button>
            )}
            {step === 'authorizing' && (
              <Button variant="outline" onClick={() => setStep('intro')}>
                Try again
              </Button>
            )}
            {step === 'select' && (
              <Button
                onClick={connectSelectedPage}
                disabled={!selectedPageId || selectFacebookPage.isPending}
                className="gap-1"
              >
                {selectFacebookPage.isPending
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Send className="h-4 w-4" />}
                Connect Page <ChevronRight className="h-4 w-4" />
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
