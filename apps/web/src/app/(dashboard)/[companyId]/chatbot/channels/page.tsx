'use client';

import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Copy, Check, Link2, Unplug, ArrowLeft, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/auth-store';
import { api } from '@/lib/api/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';

const PLATFORMS = [
  { id: 'widget', name: 'Website Widget', desc: 'Embed on your website', icon: '🌐', always: true },
  { id: 'messenger', name: 'Facebook Messenger', desc: 'Messenger messages', icon: '💬' },
  { id: 'instagram', name: 'Instagram DM', desc: 'Instagram Direct Messages', icon: '📸' },
  { id: 'zalo_oa', name: 'Zalo OA', desc: 'Zalo Official Account', icon: '💙' },
];

export default function ChannelsPage() {
  const { companyId } = useParams() as { companyId: string };
  const searchParams = useSearchParams();
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  const [botId, setBotId] = useState<string | null>(searchParams.get('bot'));
  const [zaloOpen, setZaloOpen] = useState(false);
  const [zaloOaId, setZaloOaId] = useState('');
  const [zaloToken, setZaloToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const { data: botsData } = useQuery({
    queryKey: ['chatbots', companyId],
    queryFn: () => api.get<{ data: any[] }>(`/chatbot/company/${companyId}/chatbots`, { token: token! }),
    enabled: !!token,
  });
  const bots = botsData?.data || [];
  useEffect(() => { if (!botId && bots.length) setBotId(bots[0].id); }, [bots, botId]);

  const { data: chData } = useQuery({
    queryKey: ['channels', companyId, botId],
    queryFn: () => api.get<{ data: any[] }>(`/channels/${companyId}/bot/${botId}`, { token: token! }),
    enabled: !!token && !!botId,
  });
  const channels = chData?.data || [];

  const { data: status } = useQuery({
    queryKey: ['platform-status'],
    queryFn: () => api.get<Record<string, boolean>>('/channels/platforms/status', { token: token! }),
    enabled: !!token,
  });

  // Listen for OAuth popup result
  useEffect(() => {
    const h = (e: MessageEvent) => { if (e.data?.type === 'channel-connected') { toast.success(`${e.data.platform} connected!`); qc.invalidateQueries({ queryKey: ['channels'] }); } };
    window.addEventListener('message', h);
    return () => window.removeEventListener('message', h);
  }, [qc]);

  const apiBase = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8004/api/v1').replace('/api/v1', '');
  const embedCode = `<script src="${apiBase}/widget.js" data-company-id="${companyId}"></script>`;
  const isConnected = (p: string) => channels.some((c: any) => c.platform === p && c.isActive);
  const bot = bots.find((b: any) => b.id === botId);

  const connectFB = () => {
    const fbAppId = process.env.NEXT_PUBLIC_FACEBOOK_APP_ID;
    if (!fbAppId) { toast('Coming soon -- platform approval pending.'); return; }
    const redirect = `${apiBase}/api/v1/channels/oauth/facebook/callback`;
    window.open(`https://www.facebook.com/v21.0/dialog/oauth?client_id=${fbAppId}&redirect_uri=${encodeURIComponent(redirect)}&scope=pages_messaging,pages_manage_metadata,pages_read_engagement&state=botId:${botId}`, 'fb_oauth', 'width=600,height=700');
  };

  const connectZalo = async () => {
    if (!zaloOaId.trim() || !zaloToken.trim()) return;
    setBusy(true);
    try {
      await api.post(`/channels/${companyId}/bot/${botId}/zalo/connect`, { oaId: zaloOaId.trim(), refreshToken: zaloToken.trim() }, { token: token! });
      toast.success('Zalo OA connected!'); setZaloOpen(false); setZaloOaId(''); setZaloToken('');
      qc.invalidateQueries({ queryKey: ['channels'] });
    } catch { toast.error('Could not connect. Check credentials.'); }
    finally { setBusy(false); }
  };

  const disconnect = async (id: string) => {
    if (!confirm('Disconnect this channel?')) return;
    try { await api.delete(`/channels/${companyId}/bot/${botId}/${id}`, { token: token! }); toast.success('Disconnected'); qc.invalidateQueries({ queryKey: ['channels'] }); }
    catch { toast.error('Failed to disconnect.'); }
  };

  const handleConnect = (pid: string) => {
    if (pid === 'messenger' || pid === 'instagram') {
      if (!(status as any)?.[pid]) { toast('Coming soon -- platform approval pending.'); return; }
      connectFB();
    } else if (pid === 'zalo_oa') {
      if (!(status as any)?.zalo_oa) { toast('Coming soon -- platform approval pending.'); return; }
      setZaloOpen(true);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <Link href={`/${companyId}/chatbot`} className="text-sm text-muted-foreground hover:underline flex items-center gap-1 mb-2"><ArrowLeft className="w-3 h-3" /> Back to Chatbot</Link>
        <h1 className="text-2xl font-bold">Channels</h1>
        <p className="text-muted-foreground text-sm">Connect platforms so customers can message {bot?.name || 'your bot'} from anywhere.</p>
      </div>

      {bots.length > 1 && <div className="flex gap-2 flex-wrap">{bots.map((b: any) => (
        <Button key={b.id} variant={botId === b.id ? 'default' : 'outline'} size="sm" onClick={() => setBotId(b.id)}>{b.name}</Button>
      ))}</div>}

      {channels.length > 0 && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Connected</CardTitle></CardHeader>
          <CardContent className="space-y-3">{channels.map((ch: any) => {
            const p = PLATFORMS.find((x) => x.id === ch.platform);
            return (
              <div key={ch.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{p?.icon || '📡'}</span>
                  <div>
                    <p className="font-medium text-sm">{p?.name || ch.platform} {ch.config?.pageName && <span className="text-muted-foreground">({ch.config.pageName})</span>}{ch.config?.oaId && <span className="text-muted-foreground">(OA: {ch.config.oaId})</span>}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" /> {new Date(ch.connectedAt).toLocaleDateString()}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={ch.isActive ? 'default' : 'secondary'}>{ch.isActive ? 'Active' : 'Inactive'}</Badge>
                  <Button variant="ghost" size="sm" className="text-red-500" onClick={() => disconnect(ch.id)}><Unplug className="w-4 h-4" /></Button>
                </div>
              </div>
            );
          })}</CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Connect a Channel</CardTitle></CardHeader>
        <CardContent><div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{PLATFORMS.map((p) => (
          <div key={p.id} className="border rounded-lg p-4 space-y-2">
            <div className="flex items-center gap-2"><span className="text-2xl">{p.icon}</span><div><p className="font-medium text-sm">{p.name}</p><p className="text-xs text-muted-foreground">{p.desc}</p></div></div>
            {p.id === 'widget' ? (
              <div className="relative"><pre className="bg-muted p-2 rounded text-[10px] overflow-x-auto font-mono">{embedCode}</pre>
                <Button variant="outline" size="sm" className="absolute top-1 right-1 h-6 text-[10px] gap-1" onClick={() => { navigator.clipboard.writeText(embedCode); setCopied(true); toast.success('Copied!'); setTimeout(() => setCopied(false), 2000); }}>
                  {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                </Button></div>
            ) : isConnected(p.id) ? <Badge variant="default" className="w-fit">Connected</Badge>
              : !(status as any)?.[p.id] && !p.always ? <p className="text-xs text-amber-600">Coming soon -- platform approval pending</p>
              : <Button size="sm" className="gap-1 w-fit" onClick={() => handleConnect(p.id)}><Link2 className="w-3 h-3" /> Connect</Button>}
          </div>
        ))}</div></CardContent>
      </Card>

      <Dialog open={zaloOpen} onOpenChange={setZaloOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Connect Zalo OA</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">Go to <a href="https://developers.zalo.me" target="_blank" rel="noopener" className="underline">developers.zalo.me</a> &rarr; Your App &rarr; OA Settings &rarr; Copy OA ID and Refresh Token.</p>
            <div><Label>OA ID</Label><Input value={zaloOaId} onChange={(e) => setZaloOaId(e.target.value)} placeholder="e.g. 1234567890" className="mt-1" /></div>
            <div><Label>Refresh Token</Label><Input value={zaloToken} onChange={(e) => setZaloToken(e.target.value)} placeholder="Paste refresh token" className="mt-1" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setZaloOpen(false)}>Cancel</Button>
            <Button onClick={connectZalo} disabled={busy || !zaloOaId.trim() || !zaloToken.trim()} className="gap-1">{busy && <Loader2 className="w-4 h-4 animate-spin" />} Connect</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
