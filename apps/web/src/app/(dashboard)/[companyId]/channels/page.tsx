'use client';

/**
 * Block 6 / Đợt 6 — Omnichannel Connect page (FB Messenger MVP).
 *
 * Lists per-company connected platforms, walks the founder through pasting
 * page credentials, and shows the webhook URL to register in Meta's
 * developer console. Other channels are reserved but disabled pending
 * API approval.
 */
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  Loader2, Copy, Check, Link2, Unplug, Clock, MessageCircle, ShieldAlert,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  useChannelConnections, useConnectFbMessenger, useDisconnectChannel,
  useToggleAiAutoReply, type OmniChannel,
} from '@/lib/api/channels-hooks';

const SUPPORTED: Array<{
  id: OmniChannel; name: string; icon: string; comingSoon?: boolean; note?: string;
}> = [
  { id: 'fb_messenger', name: 'Facebook Messenger', icon: 'M' },
  { id: 'zalo', name: 'Zalo OA', icon: 'Z', comingSoon: true, note: 'Pending API approval' },
  { id: 'whatsapp', name: 'WhatsApp Business', icon: 'W', comingSoon: true, note: 'Pending API approval' },
  { id: 'instagram', name: 'Instagram DM', icon: 'I', comingSoon: true, note: 'Pending API approval' },
];

const WEBHOOK_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8004/api/v1').replace('/api/v1', '');

export default function ChannelsPage() {
  const { companyId } = useParams() as { companyId: string };
  const { data: connections = [], isLoading } = useChannelConnections(companyId);
  const connectFb = useConnectFbMessenger(companyId);
  const disconnect = useDisconnectChannel(companyId);
  const toggleAi = useToggleAiAutoReply(companyId);

  const [open, setOpen] = useState(false);
  const [pageId, setPageId] = useState('');
  const [pageName, setPageName] = useState('');
  const [pageAccessToken, setPageAccessToken] = useState('');
  const [appId, setAppId] = useState('');
  const [verifyToken, setVerifyToken] = useState(
    () => 'vt_' + Math.random().toString(36).slice(2, 12),
  );
  const [copied, setCopied] = useState(false);

  const webhookUrl = `${WEBHOOK_BASE}/webhooks/omnichannel/messenger`;

  const resetForm = () => {
    setPageId(''); setPageName(''); setPageAccessToken(''); setAppId('');
    setVerifyToken('vt_' + Math.random().toString(36).slice(2, 12));
  };

  const submit = async () => {
    if (!pageId.trim() || !pageAccessToken.trim() || !appId.trim() || verifyToken.length < 8) {
      toast.error('Fill all required fields (verify token must be ≥ 8 chars).');
      return;
    }
    try {
      await connectFb.mutateAsync({
        pageId: pageId.trim(),
        pageName: pageName.trim() || undefined,
        pageAccessToken: pageAccessToken.trim(),
        appId: appId.trim(),
        verifyToken: verifyToken.trim(),
        aiAutoReply: false,
      });
      toast.success('Facebook Page connected. Add the webhook URL in Meta console next.');
      setOpen(false);
      resetForm();
    } catch (e) {
      toast.error((e as Error).message || 'Failed to connect');
    }
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto p-1">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <MessageCircle className="w-6 h-6 text-primary" /> Channels
        </h1>
        <p className="text-muted-foreground text-sm">
          Connect external chat platforms. Inbound messages land in your unified inbox; auto-reply is opt-in per channel.
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Available channels</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {SUPPORTED.map((p) => {
            const live = connections.filter((c) => c.channel === p.id && c.status === 'active');
            return (
              <div key={p.id} className="flex items-center justify-between border rounded-lg p-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center font-bold">
                    {p.icon}
                  </div>
                  <div>
                    <p className="font-medium text-sm">{p.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.comingSoon ? p.note : `${live.length} active connection${live.length === 1 ? '' : 's'}`}
                    </p>
                  </div>
                </div>
                {p.id === 'fb_messenger' ? (
                  <Button size="sm" className="gap-1" onClick={() => setOpen(true)}>
                    <Link2 className="w-3 h-3" /> Connect
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
          {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!isLoading && connections.length === 0 && (
            <p className="text-sm text-muted-foreground">No channels connected yet.</p>
          )}
          {connections.map((c) => (
            <div key={c.id} className="border rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">
                    {c.config.pageName || c.config.pageId || c.channel}
                    <Badge variant="outline" className="ml-2">{c.channel}</Badge>
                  </p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="w-3 h-3" /> connected {new Date(c.connectedAt).toLocaleDateString()}
                    {c.lastMessageAt && <> · last msg {new Date(c.lastMessageAt).toLocaleString()}</>}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={c.status === 'active' ? 'default' : 'secondary'}>{c.status}</Badge>
                  <Button
                    variant="ghost" size="sm" className="text-red-500"
                    onClick={async () => {
                      if (!confirm('Disconnect this channel? Inbound messages will stop.')) return;
                      try { await disconnect.mutateAsync(c.id); toast.success('Disconnected'); }
                      catch { toast.error('Failed to disconnect'); }
                    }}
                  >
                    <Unplug className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={c.aiAutoReply}
                    onCheckedChange={async (enabled) => {
                      try { await toggleAi.mutateAsync({ id: c.id, enabled }); }
                      catch { toast.error('Failed to update auto-reply'); }
                    }}
                  />
                  <span>AI auto-reply {c.aiAutoReply ? 'on' : 'off'}</span>
                </div>
                <span className="text-muted-foreground">
                  Verify token: <code className="font-mono">{c.config.verifyTokenPreview || '—'}</code>
                </span>
              </div>
              {!c.aiAutoReply && (
                <p className="text-xs text-amber-600 flex items-start gap-1">
                  <ShieldAlert className="w-3 h-3 mt-0.5 shrink-0" />
                  Manual mode — inbound messages wait for you in Inbox · Messages.
                </p>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Connect Facebook Messenger</DialogTitle>
            <DialogDescription>
              Create a Meta app, get a Page access token, then paste the values here.
              Add the webhook URL and verify token below in Meta&nbsp;developer&nbsp;console&nbsp;→ Messenger&nbsp;→ Webhooks.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="rounded-lg border bg-muted/40 p-3 space-y-1 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Webhook URL</span>
                <Button
                  variant="ghost" size="sm" className="h-6 gap-1 text-xs"
                  onClick={() => {
                    navigator.clipboard.writeText(webhookUrl);
                    setCopied(true); toast.success('Copied');
                    setTimeout(() => setCopied(false), 1500);
                  }}
                >
                  {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                </Button>
              </div>
              <code className="block font-mono break-all">{webhookUrl}</code>
              <p className="text-muted-foreground pt-1">Subscribe to <code>messages</code>, <code>messaging_postbacks</code>.</p>
            </div>

            <div>
              <Label>Page ID *</Label>
              <Input value={pageId} onChange={(e) => setPageId(e.target.value)} placeholder="1234567890" className="mt-1" />
            </div>
            <div>
              <Label>Page Name (optional)</Label>
              <Input value={pageName} onChange={(e) => setPageName(e.target.value)} placeholder="My Brand" className="mt-1" />
            </div>
            <div>
              <Label>App ID *</Label>
              <Input value={appId} onChange={(e) => setAppId(e.target.value)} placeholder="From Meta App Dashboard" className="mt-1" />
            </div>
            <div>
              <Label>Page Access Token *</Label>
              <Input
                type="password" value={pageAccessToken}
                onChange={(e) => setPageAccessToken(e.target.value)}
                placeholder="EAAB…" className="mt-1 font-mono"
              />
              <p className="text-[11px] text-muted-foreground mt-1">Stored encrypted at rest (AES-256-GCM).</p>
            </div>
            <div>
              <Label>Verify Token (you choose) *</Label>
              <Input value={verifyToken} onChange={(e) => setVerifyToken(e.target.value)} className="mt-1 font-mono" />
              <p className="text-[11px] text-muted-foreground mt-1">
                Paste this same value into Meta&apos;s webhook setup so the handshake succeeds.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={connectFb.isPending} className="gap-1">
              {connectFb.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Connect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
