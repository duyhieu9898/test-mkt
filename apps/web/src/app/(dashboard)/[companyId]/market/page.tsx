'use client';
/**
 * Market & Competitors (doc 10 §5). On-demand scan, 5 credits each.
 */
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { FirstVisitTip } from '@/components/first-visit-tip';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Globe, Plus, RefreshCw, Pencil, Trash2, ExternalLink, Sparkles, Loader2, Wand2, Check, X } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { api } from '@/lib/api/client';
import { friendlyError } from '@/lib/friendly-errors';
import { CompetitorNextMoves } from '@/components/market/competitor-next-moves';
import { SignalActions } from '@/components/market/signal-actions';
import { MarketDigest } from '@/components/market/market-digest';
import { PositioningMap } from '@/components/market/positioning-map';

interface Signal { type: string; text: string; url?: string; date?: string }
interface Competitor {
  id: string; name: string; url: string | null; keywords: string[];
  notes: string | null; lastScanAt: string | null; latestSignals: Signal[];
}
interface FormState { id?: string; name: string; url: string; keywords: string; notes: string }
const EMPTY: FormState = { name: '', url: '', keywords: '', notes: '' };

interface Suggestion { name: string; url: string | null; keywords: string[]; why: string }
interface SuggestResponse {
  success: boolean;
  data: {
    suggestions: Suggestion[];
    basedOn: { companyName: string; industry: string; productCount: number; audienceCount: number; hasBrand: boolean };
    model: string;
  };
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'Never scanned';
  const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
  if (h < 1) return 'Last scanned just now';
  if (h < 24) return `Last scanned ${h}h ago`;
  return `Last scanned ${Math.floor(h / 24)}d ago`;
}

export default function MarketPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [scanningId, setScanningId] = useState<string | null>(null);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [suggestContext, setSuggestContext] = useState<SuggestResponse['data']['basedOn'] | null>(null);
  const [addingIdx, setAddingIdx] = useState<number | null>(null);
  const [dismissedIdx, setDismissedIdx] = useState<Set<number>>(new Set());
  const key = ['market-competitors', companyId];

  const { data, isLoading } = useQuery({
    queryKey: key,
    queryFn: () => api.get<{ data: Competitor[] }>(`/market/${companyId}/competitors`, { token: token! }),
    enabled: !!token,
  });
  const competitors = data?.data ?? [];

  const openNew = () => { setForm(EMPTY); setDialogOpen(true); };
  const openEdit = (c: Competitor) => {
    setForm({ id: c.id, name: c.name, url: c.url ?? '', keywords: c.keywords.join(', '), notes: c.notes ?? '' });
    setDialogOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body = {
        name: form.name.trim(),
        url: form.url.trim() || null,
        keywords: form.keywords.split(',').map((s) => s.trim()).filter(Boolean),
        notes: form.notes.trim() || null,
      };
      return form.id
        ? api.patch(`/market/${companyId}/competitors/${form.id}`, body, { token: token! })
        : api.post(`/market/${companyId}/competitors`, body, { token: token! });
    },
    onSuccess: () => {
      toast.success(form.id ? 'Competitor updated' : 'Competitor added');
      setDialogOpen(false);
      qc.invalidateQueries({ queryKey: key });
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  const suggestMutation = useMutation({
    mutationFn: () =>
      api.post<SuggestResponse>(`/market/${companyId}/competitors/suggest`, {}, { token: token! }),
    onSuccess: (res) => {
      setSuggestions(res.data.suggestions);
      setSuggestContext(res.data.basedOn);
      setDismissedIdx(new Set());
      if (res.data.suggestions.length === 0) {
        toast.info('No new suggestions — you may already track the main competitors.');
      }
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  const openSuggest = () => {
    setSuggestOpen(true);
    if (!suggestions) suggestMutation.mutate();
  };

  const addOne = async (idx: number, s: Suggestion) => {
    setAddingIdx(idx);
    try {
      await api.post(
        `/market/${companyId}/competitors`,
        { name: s.name, url: s.url, keywords: s.keywords, notes: s.why || null },
        { token: token! }
      );
      toast.success(`Added ${s.name}`);
      setDismissedIdx((prev) => new Set(prev).add(idx));
      qc.invalidateQueries({ queryKey: key });
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setAddingIdx(null);
    }
  };

  const addAll = async () => {
    if (!suggestions) return;
    const remaining = suggestions
      .map((s, i) => ({ s, i }))
      .filter(({ i }) => !dismissedIdx.has(i));
    if (remaining.length === 0) return;
    try {
      await api.post(
        `/market/${companyId}/competitors/bulk`,
        {
          competitors: remaining.map(({ s }) => ({
            name: s.name,
            url: s.url,
            keywords: s.keywords,
            notes: s.why || null,
          })),
        },
        { token: token! }
      );
      toast.success(`Added ${remaining.length} competitors`);
      qc.invalidateQueries({ queryKey: key });
      setSuggestOpen(false);
      setSuggestions(null);
    } catch (e) {
      toast.error(friendlyError(e));
    }
  };

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/market/${companyId}/competitors/${id}`, { token: token! }),
    onSuccess: () => { toast.success('Competitor removed'); qc.invalidateQueries({ queryKey: key }); },
    onError: (e) => toast.error(friendlyError(e)),
  });

  const scan = async (c: Competitor) => {
    setScanningId(c.id);
    try {
      await api.post(`/market/${companyId}/competitors/${c.id}/scan`, {}, { token: token! });
      toast.success(`Scanned ${c.name}`);
      qc.invalidateQueries({ queryKey: key });
    } catch (e: any) {
      const msg = e?.message ?? '';
      if (msg.includes('credits'))
        toast.error(msg, { action: { label: 'Top up', onClick: () => (window.location.href = '/settings/credits') } });
      else toast.error(friendlyError(e));
    } finally { setScanningId(null); }
  };

  const [scanAllRunning, setScanAllRunning] = useState(false);
  const scanAll = async () => {
    const cost = competitors.length * 5;
    if (!confirm(`Scan all ${competitors.length} competitors? This will cost ${cost} credits.`)) return;
    setScanAllRunning(true);
    let ok = 0;
    let failed = 0;
    for (const c of competitors) {
      try {
        await api.post(`/market/${companyId}/competitors/${c.id}/scan`, {}, { token: token! });
        ok++;
      } catch (e: any) {
        failed++;
        if (e?.message?.includes('credits')) {
          toast.error('You do not have enough credits for this action. Please contact support to add more credits.');
          break;
        }
      }
    }
    setScanAllRunning(false);
    qc.invalidateQueries({ queryKey: key });
    qc.invalidateQueries({ queryKey: ['market-digest', companyId] });
    qc.invalidateQueries({ queryKey: ['market-positioning', companyId] });
    if (ok > 0) toast.success(`Scanned ${ok} competitor${ok === 1 ? '' : 's'}${failed ? `, ${failed} failed` : ''}`);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <FirstVisitTip
        tipKey="market"
        title="Track competitors without hiring an analyst"
        body="Add a competitor URL + a few keywords, click Scan now, and the AI reads their website and news mentions. 5 credits per scan."
      />
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Globe className="w-6 h-6 text-indigo-500" /> Market & Competitors
          </h1>
          <p className="text-sm text-slate-600 mt-1 max-w-2xl">
            Track competitors and run on-demand scans. Each scan pulls their site + news
            and extracts concrete signals. 5 credits per scan.
          </p>
        </div>
        {competitors.length > 0 && (
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <Button
              onClick={scanAll}
              variant="outline"
              disabled={scanAllRunning}
              className="gap-1.5"
              title={`Scan all ${competitors.length} competitors (${competitors.length * 5} credits)`}
            >
              {scanAllRunning ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              Scan all
              <span className="text-[10px] opacity-70">{competitors.length * 5}cr</span>
            </Button>
            <Button onClick={openSuggest} variant="outline" className="gap-1.5">
              <Wand2 className="w-4 h-4 text-indigo-500" /> Suggested competitors
            </Button>
            <Button onClick={openNew} className="gap-1.5">
              <Plus className="w-4 h-4" /> Add competitor
            </Button>
          </div>
        )}
      </div>

      {competitors.length > 0 && (
        <div className="space-y-3">
          <MarketDigest companyId={companyId} />
          <PositioningMap companyId={companyId} />
        </div>
      )}

      {isLoading ? (
        <div className="py-12 text-center text-slate-500 text-sm">
          <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Loading…
        </div>
      ) : competitors.length === 0 ? (
        <Card className="border-dashed border-2 border-slate-200">
          <CardContent className="py-12 text-center">
            <Globe className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <div className="font-semibold text-slate-900">Add your first competitor</div>
            <p className="text-sm text-slate-600 mt-1 max-w-sm mx-auto">
              We'll scan their website and news mentions on demand — no API keys needed.
            </p>
            <div className="flex items-center justify-center gap-2 mt-4">
              <Button onClick={openSuggest} variant="outline" className="gap-1.5">
                <Wand2 className="w-4 h-4 text-indigo-500" /> Suggested competitors
              </Button>
              <Button onClick={openNew} className="gap-1.5">
                <Plus className="w-4 h-4" /> Add competitor
              </Button>
            </div>
            <p className="text-xs text-slate-400 mt-3">
              AI suggestions use the business context you entered during onboarding.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {competitors.map((c) => (
            <Card key={c.id} className="border-slate-200">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="font-semibold text-slate-900">{c.name}</div>
                      {c.url && (
                        <a href={c.url} target="_blank" rel="noreferrer" className="text-xs text-indigo-600 hover:underline inline-flex items-center gap-0.5">
                          {c.url.replace(/^https?:\/\//, '').slice(0, 40)}<ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {c.keywords.map((k) => <Badge key={k} variant="secondary" className="text-xs">{k}</Badge>)}
                    </div>
                    <div className="text-xs text-slate-500 mt-1.5">{timeAgo(c.lastScanAt)}</div>
                  </div>
                  <div className="flex gap-1.5">
                    <Button size="sm" onClick={() => scan(c)} disabled={scanningId === c.id} className="gap-1.5">
                      {scanningId === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                      Scan now<span className="text-[10px] opacity-70"> 5 credits</span>
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => openEdit(c)}><Pencil className="w-3.5 h-3.5" /></Button>
                    <Button size="sm" variant="outline" onClick={() => { if (confirm(`Delete ${c.name}?`)) deleteMutation.mutate(c.id); }}>
                      <Trash2 className="w-3.5 h-3.5 text-red-500" />
                    </Button>
                  </div>
                </div>
                {c.latestSignals.length > 0 && (
                  <div className="border-t border-slate-100 pt-3 space-y-1.5">
                    <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                      <Sparkles className="w-3 h-3" /> Latest signals
                    </div>
                    {c.latestSignals.slice(0, 3).map((s, i) => (
                      <div key={i} className="text-sm text-slate-700 flex items-start gap-2">
                        <Badge variant="outline" className="text-[10px] shrink-0 mt-0.5">{s.type}</Badge>
                        <span className="flex-1">
                          {s.text}
                          {s.url && (
                            <a href={s.url} target="_blank" rel="noreferrer" className="ml-1 text-indigo-600 hover:underline inline-flex">
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </span>
                        <SignalActions
                          companyId={companyId}
                          signalType={s.type}
                          signalText={s.text}
                          competitorName={c.name}
                        />
                      </div>
                    ))}
                  </div>
                )}

                <CompetitorNextMoves
                  companyId={companyId}
                  competitorId={c.id}
                  competitorName={c.name}
                  hasSignals={c.latestSignals.length > 0}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Suggested competitors dialog */}
      <Dialog open={suggestOpen} onOpenChange={setSuggestOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wand2 className="w-5 h-5 text-indigo-500" /> Suggested competitors
            </DialogTitle>
            {suggestContext && (
              <p className="text-xs text-slate-500 mt-1">
                Based on your {suggestContext.industry || 'business'} profile
                {suggestContext.productCount > 0 ? `, ${suggestContext.productCount} products` : ''}
                {suggestContext.audienceCount > 0 ? `, ${suggestContext.audienceCount} audiences` : ''}
                {suggestContext.hasBrand ? ', brand memory' : ''}.
              </p>
            )}
          </DialogHeader>

          {suggestMutation.isPending ? (
            <div className="py-10 text-center">
              <Loader2 className="w-6 h-6 animate-spin mx-auto text-indigo-500" />
              <p className="text-sm text-slate-600 mt-3">
                AI is reading your business memory and identifying competitors…
              </p>
            </div>
          ) : suggestions && suggestions.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm text-slate-600">
                No new suggestions right now. You may already be tracking the main
                competitors in your space.
              </p>
              <Button variant="outline" onClick={() => suggestMutation.mutate()} className="mt-4 gap-1.5">
                <RefreshCw className="w-3.5 h-3.5" /> Try again
              </Button>
            </div>
          ) : suggestions ? (
            <div className="space-y-2">
              {suggestions.map((s, i) => {
                const dismissed = dismissedIdx.has(i);
                if (dismissed) return null;
                return (
                  <div
                    key={`${s.name}-${i}`}
                    className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 bg-white hover:border-indigo-200 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-semibold text-slate-900">{s.name}</h4>
                        {s.url && (
                          <a
                            href={s.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-indigo-600 hover:underline inline-flex items-center gap-0.5"
                          >
                            {s.url.replace(/^https?:\/\//, '').slice(0, 40)}
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                      {s.why && (
                        <p className="text-xs text-slate-600 mt-1">{s.why}</p>
                      )}
                      <div className="flex flex-wrap gap-1 mt-2">
                        {s.keywords.map((k) => (
                          <Badge key={k} variant="secondary" className="text-[10px]">
                            {k}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0 text-slate-400 hover:text-slate-600"
                        onClick={() => setDismissedIdx((prev) => new Set(prev).add(i))}
                        title="Dismiss"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        className="h-8 gap-1 bg-indigo-600 hover:bg-indigo-700"
                        onClick={() => addOne(i, s)}
                        disabled={addingIdx === i}
                      >
                        {addingIdx === i ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Check className="w-3.5 h-3.5" />
                        )}
                        Add
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => suggestMutation.mutate()}
              disabled={suggestMutation.isPending}
              className="gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Regenerate
            </Button>
            {suggestions && suggestions.filter((_, i) => !dismissedIdx.has(i)).length > 0 && (
              <Button onClick={addAll} className="gap-1.5 bg-indigo-600 hover:bg-indigo-700">
                <Check className="w-4 h-4" /> Add all remaining
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{form.id ? 'Edit competitor' : 'Add competitor'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Acme Inc" />
            </div>
            <div>
              <Label>Website URL</Label>
              <Input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://acme.com" />
            </div>
            <div>
              <Label>Keywords (comma-separated, up to 3 used)</Label>
              <Input value={form.keywords} onChange={(e) => setForm({ ...form, keywords: e.target.value })} placeholder="pricing, launch, funding" />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={!form.name.trim() || saveMutation.isPending}>
              {saveMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1" />}Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
