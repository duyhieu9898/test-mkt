'use client';

/**
 * Sales — deal pipeline + AI Deal Assistant.
 * See docs/architecture/10-venture-ceo-ia.md §6 (Đợt 3).
 */

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { FirstVisitTip } from '@/components/first-visit-tip';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Briefcase, Sparkles, Plus, Loader2, Copy, Check, MessageSquareQuote, ArrowRight, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/auth-store';
import { api } from '@/lib/api/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { friendlyError } from '@/lib/friendly-errors';

type Stage = 'discovery' | 'qualified' | 'proposal' | 'negotiation' | 'closed_won' | 'closed_lost';

interface Deal {
  id: string; title: string; contactName: string | null; contactEmail: string | null;
  company: string | null; value: string | null; currency: string; stage: Stage;
  notes: string | null; nextAction: string | null; nextActionDueAt: string | null;
}
interface DealEvent { id: string; type: string; payload: Record<string, any>; createdAt: string }
interface Suggestion {
  nextAction: string; reasoning: string;
  likelyObjection?: string | null; objectionResponse?: string | null;
  emailDraft: { subject: string; body: string }; confidence: number;
}

const STAGES: { key: Stage; label: string }[] = [
  { key: 'discovery', label: 'Discovery' }, { key: 'qualified', label: 'Qualified' },
  { key: 'proposal', label: 'Proposal' }, { key: 'negotiation', label: 'Negotiation' },
  { key: 'closed_won', label: 'Won' }, { key: 'closed_lost', label: 'Lost' },
];

export default function SalesPage() {
  const params = useParams();
  const companyId = params.companyId as string;
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [form, setForm] = useState({ title: '', contactName: '', company: '', value: '', stage: 'discovery' as Stage });
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [copied, setCopied] = useState(false);

  const listQ = useQuery({
    queryKey: ['sales', companyId, 'deals'],
    queryFn: () => api.get<{ data: Deal[] }>(`/sales/${companyId}/deals`, { token: token! }),
    enabled: !!token,
  });
  const detailQ = useQuery({
    queryKey: ['sales', companyId, 'deal', selectedId],
    queryFn: () => api.get<{ deal: Deal; events: DealEvent[] }>(`/sales/${companyId}/deals/${selectedId}`, { token: token! }),
    enabled: !!token && !!selectedId,
  });
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['sales', companyId, 'deals'] });
    if (selectedId) qc.invalidateQueries({ queryKey: ['sales', companyId, 'deal', selectedId] });
  };
  const createM = useMutation({
    mutationFn: (input: Partial<Deal>) => api.post<Deal>(`/sales/${companyId}/deals`, input, { token: token! }),
    onSuccess: (d) => { invalidate(); setSelectedId(d.id); setNewOpen(false); setForm({ title: '', contactName: '', company: '', value: '', stage: 'discovery' }); toast.success('Deal created'); },
    onError: (e) => toast.error(friendlyError(e)),
  });
  const patchM = useMutation({
    mutationFn: (input: Partial<Deal>) => api.patch<Deal>(`/sales/${companyId}/deals/${selectedId}`, input, { token: token! }),
    onSuccess: invalidate,
    onError: (e) => toast.error(friendlyError(e)),
  });
  const deleteM = useMutation({
    mutationFn: () => api.delete(`/sales/${companyId}/deals/${selectedId}`, { token: token! }),
    onSuccess: () => { invalidate(); setSelectedId(null); setSuggestion(null); toast.success('Deal deleted'); },
  });
  const assistM = useMutation({
    mutationFn: () => api.post<Suggestion>(`/sales/${companyId}/deals/${selectedId}/assist`, {}, { token: token! }),
    onSuccess: (s) => { setSuggestion(s); invalidate(); toast.success('Assistant ready'); },
    onError: (e) => toast.error(friendlyError(e)),
  });

  const deals = listQ.data?.data ?? [];
  const detail = detailQ.data;

  async function copyEmail() {
    if (!suggestion) return;
    const text = `Subject: ${suggestion.emailDraft.subject}\n\n${suggestion.emailDraft.body}`;
    // Modern path — works on Chrome / Firefox / Safari 13.1+ with HTTPS/localhost.
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        setCopied(true); setTimeout(() => setCopied(false), 2000);
        toast.success('Email copied');
        return;
      }
    } catch { /* fall through to legacy */ }
    // Legacy fallback for older Safari / iOS / insecure context.
    try {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.focus(); ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      if (!ok) throw new Error('copy command failed');
      setCopied(true); setTimeout(() => setCopied(false), 2000);
      toast.success('Email copied');
    } catch {
      toast.error('Could not copy — please select and copy manually');
    }
  }

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <FirstVisitTip
        tipKey="sales"
        title="Let AI suggest your next move on every deal"
        body="Create a deal, open it, and click Ask AI Assistant — the AI reads your Sales Playbook and drafts the next action + an email you can copy-paste. 3 credits per ask."
      />
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Briefcase className="w-6 h-6 text-indigo-500" /> Sales
          </h1>
          <p className="text-sm text-slate-600 mt-1">Your pipeline + AI Deal Assistant. Move deals through stages, ask the AI for the next move.</p>
        </div>
        <Button onClick={() => setNewOpen(true)} className="gap-1.5"><Plus className="w-4 h-4" /> New deal</Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_420px]">
        <div className="overflow-x-auto -mx-4 px-4 lg:mx-0 lg:px-0">
          <div className="flex gap-3 min-w-max lg:min-w-0 lg:grid lg:grid-cols-6">
            {STAGES.map((s) => {
              const col = deals.filter((d) => d.stage === s.key);
              return (
                <div key={s.key} className="w-56 lg:w-auto shrink-0">
                  <div className="flex items-center justify-between mb-2 px-1">
                    <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">{s.label}</span>
                    <Badge variant="outline" className="text-xs">{col.length}</Badge>
                  </div>
                  <div className="space-y-2">
                    {col.map((d) => (
                      <Card key={d.id}
                        onClick={() => { setSelectedId(d.id); setSuggestion(null); }}
                        className={`cursor-pointer transition-colors hover:border-indigo-300 ${selectedId === d.id ? 'border-indigo-500 ring-1 ring-indigo-200' : ''}`}>
                        <CardContent className="p-3">
                          <div className="font-semibold text-sm text-slate-900 line-clamp-2">{d.title}</div>
                          {(d.contactName || d.company) && (
                            <div className="text-xs text-slate-500 mt-0.5 truncate">{[d.contactName, d.company].filter(Boolean).join(' · ')}</div>
                          )}
                          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                            {d.value && <Badge variant="secondary" className="text-xs">{d.currency} {d.value}</Badge>}
                            {d.nextAction && (
                              <Badge className="text-xs bg-amber-100 text-amber-800 hover:bg-amber-100">
                                <ArrowRight className="w-3 h-3 mr-0.5" />
                                {d.nextAction.length > 24 ? d.nextAction.slice(0, 24) + '…' : d.nextAction}
                              </Badge>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                    {col.length === 0 && <div className="text-xs text-slate-400 text-center py-4 border border-dashed rounded-md">empty</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-3">
          {!detail ? (
            <Card className="border-dashed"><CardContent className="p-6 text-center text-sm text-slate-500">Select a deal to see details and ask the AI Assistant.</CardContent></Card>
          ) : (
            <>
              <Card>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="font-semibold text-slate-900">{detail.deal.title}</h2>
                    <Button size="sm" variant="ghost" onClick={() => deleteM.mutate()} className="text-red-500 hover:text-red-700 h-7 w-7 p-0"><Trash2 className="w-4 h-4" /></Button>
                  </div>
                  <div className="text-xs text-slate-500">{[detail.deal.contactName, detail.deal.company, detail.deal.contactEmail].filter(Boolean).join(' · ') || 'No contact info'}</div>
                  <div>
                    <Label className="text-xs">Stage</Label>
                    <Select value={detail.deal.stage} onValueChange={(v) => patchM.mutate({ stage: v as Stage })}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>{STAGES.map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Value</Label>
                      <Input defaultValue={detail.deal.value ?? ''} placeholder="10000"
                        onBlur={(e) => e.target.value !== (detail.deal.value ?? '') && patchM.mutate({ value: e.target.value || null })}
                        className="h-8 text-sm" />
                    </div>
                    <div>
                      <Label className="text-xs">Currency</Label>
                      <Input defaultValue={detail.deal.currency}
                        onBlur={(e) => e.target.value !== detail.deal.currency && patchM.mutate({ currency: e.target.value })}
                        className="h-8 text-sm" />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Next action</Label>
                    <Input key={detail.deal.nextAction ?? ''} defaultValue={detail.deal.nextAction ?? ''} placeholder="e.g. Send pricing proposal"
                      onBlur={(e) => e.target.value !== (detail.deal.nextAction ?? '') && patchM.mutate({ nextAction: e.target.value || null })}
                      className="h-8 text-sm" />
                  </div>
                  <div>
                    <Label className="text-xs">Notes</Label>
                    <Textarea defaultValue={detail.deal.notes ?? ''}
                      onBlur={(e) => e.target.value !== (detail.deal.notes ?? '') && patchM.mutate({ notes: e.target.value || null })}
                      rows={3} className="text-sm" />
                  </div>
                  <Button onClick={() => assistM.mutate()} disabled={assistM.isPending} className="w-full gap-1.5 bg-indigo-600 hover:bg-indigo-700">
                    {assistM.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    Ask AI Assistant (3 credits)
                  </Button>
                </CardContent>
              </Card>

              {suggestion && (
                <Card className="border-indigo-200 bg-indigo-50/40">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 font-semibold text-sm text-indigo-900"><Sparkles className="w-4 h-4" /> AI Suggestion</div>
                      <Badge variant="outline" className="text-xs">{suggestion.confidence}% confidence</Badge>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-slate-500 uppercase mb-1">Next action</div>
                      <div className="text-sm text-slate-900">{suggestion.nextAction}</div>
                      <Button size="sm" variant="outline" className="mt-1.5 h-7 text-xs" onClick={() => patchM.mutate({ nextAction: suggestion.nextAction })}>Set as next action</Button>
                    </div>
                    <div className="text-xs text-slate-600 leading-relaxed">{suggestion.reasoning}</div>
                    {suggestion.likelyObjection && (
                      <div className="border-t border-indigo-100 pt-2">
                        <div className="text-xs font-semibold text-slate-500 uppercase mb-1 flex items-center gap-1"><MessageSquareQuote className="w-3 h-3" /> Likely objection</div>
                        <div className="text-xs text-slate-800 italic">"{suggestion.likelyObjection}"</div>
                        {suggestion.objectionResponse && <div className="text-xs text-slate-700 mt-1">→ {suggestion.objectionResponse}</div>}
                      </div>
                    )}
                    <div className="border-t border-indigo-100 pt-2">
                      <div className="text-xs font-semibold text-slate-500 uppercase mb-1">Email draft</div>
                      <div className="bg-white border rounded-md p-2 space-y-1">
                        <div className="text-xs font-semibold text-slate-900">Subject: {suggestion.emailDraft.subject}</div>
                        <div className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">{suggestion.emailDraft.body}</div>
                      </div>
                      <Button size="sm" onClick={copyEmail} className="mt-1.5 h-7 text-xs gap-1">
                        {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        {copied ? 'Copied' : 'Copy to clipboard'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardContent className="p-4">
                  <div className="text-xs font-semibold text-slate-500 uppercase mb-2">Timeline</div>
                  <div className="space-y-1.5 max-h-60 overflow-y-auto">
                    {detail.events.length === 0 && <div className="text-xs text-slate-400">No events yet.</div>}
                    {detail.events.map((e) => (
                      <div key={e.id} className="text-xs text-slate-600 flex items-start gap-1.5">
                        <span className="text-slate-400 shrink-0">{new Date(e.createdAt).toLocaleDateString()}</span>
                        <span className="font-medium">{e.type.replace('_', ' ')}</span>
                        <span className="text-slate-500 truncate">
                          {e.type === 'stage_change' ? `→ ${e.payload.to}` : e.type === 'ai_suggestion' ? (e.payload as any).suggestion?.nextAction : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>

      <Dialog open={newOpen} onOpenChange={(o) => !o && setNewOpen(false)}>
        <DialogContent>
          <DialogHeader><DialogTitle>New deal</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Title *</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Acme Corp — annual contract" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">Contact</Label><Input value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} /></div>
              <div><Label className="text-xs">Company</Label><Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">Value (USD)</Label><Input value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} placeholder="10000" /></div>
              <div>
                <Label className="text-xs">Stage</Label>
                <Select value={form.stage} onValueChange={(v) => setForm({ ...form, stage: v as Stage })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{STAGES.map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)}>Cancel</Button>
            <Button disabled={!form.title.trim() || createM.isPending}
              onClick={() => createM.mutate({ title: form.title.trim(), contactName: form.contactName || null, company: form.company || null, value: form.value || null, stage: form.stage })}>
              {createM.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
