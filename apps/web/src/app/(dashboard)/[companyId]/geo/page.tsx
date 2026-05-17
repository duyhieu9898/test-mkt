'use client';
/**
 * AI Search Visibility (GEO) — Block 1 MVP
 *
 * Founder tracks prompts they care about; we replay them across ChatGPT /
 * Claude and report whether the brand was mentioned + which competitors
 * stole the slot. Manual trigger only for MVP.
 */
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import {
  Search,
  Plus,
  Loader2,
  RefreshCw,
  Trash2,
  TrendingUp,
  TrendingDown,
  Minus,
  Sparkles,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { friendlyError } from '@/lib/friendly-errors';
import {
  useGeoPrompts,
  useShareOfVoice,
  useGeoMentions,
  useCreateGeoPrompt,
  useDeleteGeoPrompt,
  useRunGeoPrompt,
  type GeoMention,
} from '@/lib/api/geo-hooks';

function timeAgo(iso: string | null): string {
  if (!iso) return 'Never';
  const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
  if (h < 1) return 'just now';
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function providerLabel(p: string): string {
  if (p === 'openai') return 'ChatGPT';
  if (p === 'anthropic') return 'Claude';
  return p;
}

/** Highlight every case-insensitive occurrence of `brand` inside `text`. */
function highlight(text: string, brand: string) {
  if (!brand) return text;
  const parts = text.split(new RegExp(`(${brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
  return parts.map((part, i) =>
    part.toLowerCase() === brand.toLowerCase() ? (
      <mark key={i} className="bg-yellow-200 px-0.5 rounded">
        {part}
      </mark>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

function MentionCard({ m, brand }: { m: GeoMention; brand: string }) {
  const snippet = m.responseText.length > 320 ? m.responseText.slice(0, 320) + '…' : m.responseText;
  return (
    <Card className="border-slate-200">
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="secondary" className="text-[10px] uppercase">
            {providerLabel(m.provider)}
          </Badge>
          {m.brandMentioned ? (
            <Badge className="bg-emerald-100 text-emerald-700 text-[10px]">
              Brand mentioned{m.mentionPosition ? ` · #${m.mentionPosition}` : ''}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px] text-slate-500">
              Brand not mentioned
            </Badge>
          )}
          {m.sentiment !== 'unknown' && (
            <Badge variant="outline" className="text-[10px] capitalize">
              {m.sentiment}
            </Badge>
          )}
          <span className="text-[11px] text-slate-400 ml-auto">{timeAgo(m.runAt)}</span>
        </div>

        <p className="text-sm text-slate-700 leading-relaxed">{highlight(snippet, brand)}</p>

        {m.competitorsMentioned.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            <span className="text-[10px] text-slate-500 mr-1">Competitors:</span>
            {m.competitorsMentioned.map((c) => (
              <Badge key={c} variant="outline" className="text-[10px] text-rose-600 border-rose-200">
                {c}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function GeoPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [promptText, setPromptText] = useState('');
  const [runningId, setRunningId] = useState<string | null>(null);

  const promptsQuery = useGeoPrompts(companyId);
  const sovQuery = useShareOfVoice(companyId, 7);
  const mentionsQuery = useGeoMentions(companyId, undefined, 20);

  const createPrompt = useCreateGeoPrompt(companyId);
  const deletePrompt = useDeleteGeoPrompt(companyId);
  const runPrompt = useRunGeoPrompt(companyId);

  const prompts = promptsQuery.data ?? [];
  const sov = sovQuery.data;
  const mentions = mentionsQuery.data ?? [];

  // Derive a brand string for highlighting — we don't have it on the SoV
  // payload, so reach into the latest mention's first brand-matched text.
  // (Server-side parser already used the canonical company name.)
  const brandGuess = mentions.find((m) => m.brandMentioned)?.responseText.match(/[A-Z][A-Za-z0-9.&-]{2,}/)?.[0] ?? '';

  const handleCreate = async () => {
    const text = promptText.trim();
    if (text.length < 3) return;
    try {
      await createPrompt.mutateAsync(text);
      toast.success('Prompt added');
      setPromptText('');
      setDialogOpen(false);
    } catch (e) {
      toast.error(friendlyError(e));
    }
  };

  const handleRun = async (id: string) => {
    setRunningId(id);
    try {
      const res = await runPrompt.mutateAsync(id);
      const hit = res.data.mentions.filter((m) => m.brandMentioned).length;
      const usedNames = res.data.providersUsed.map(providerLabel).join(', ');
      if (res.data.mentions.length === 0) {
        toast.error('No providers responded. Add an OpenAI or Anthropic key in admin.');
      } else {
        toast.success(
          `Ran on ${usedNames}. Brand mentioned in ${hit}/${res.data.mentions.length}.`,
        );
      }
    } catch (e: any) {
      const msg = e?.message ?? '';
      if (msg.includes('credits')) {
        toast.error(msg, {
          action: { label: 'Top up', onClick: () => (window.location.href = '/settings/credits') },
        });
      } else {
        toast.error(friendlyError(e));
      }
    } finally {
      setRunningId(null);
    }
  };

  const handleDelete = async (id: string, label: string) => {
    if (!confirm(`Delete prompt "${label.slice(0, 60)}"?`)) return;
    try {
      await deletePrompt.mutateAsync(id);
      toast.success('Prompt deleted');
    } catch (e) {
      toast.error(friendlyError(e));
    }
  };

  const sovPercent = sov?.current.sovPercent ?? 0;
  const delta = sov?.deltaPercent ?? 0;
  const trendIcon =
    delta > 0.5 ? (
      <TrendingUp className="w-4 h-4 text-emerald-600" />
    ) : delta < -0.5 ? (
      <TrendingDown className="w-4 h-4 text-rose-600" />
    ) : (
      <Minus className="w-4 h-4 text-slate-400" />
    );

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Search className="w-6 h-6 text-indigo-500" /> AI Search Visibility
          </h1>
          <p className="text-sm text-slate-600 mt-1 max-w-2xl">
            Track how ChatGPT and Claude answer questions about your space. Add the prompts
            customers actually ask — we replay them and report when your brand is named.
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="gap-1.5">
          <Plus className="w-4 h-4" /> Add prompt
        </Button>
      </div>

      {/* AI Share of Voice widget */}
      <Card>
        <CardContent className="p-5 flex items-center gap-6 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold">
              AI Share of Voice · last {sov?.periodDays ?? 7}d
            </div>
            <div className="flex items-baseline gap-3 mt-1">
              <div className="text-4xl font-bold text-slate-900">
                {sovPercent.toFixed(1)}
                <span className="text-2xl text-slate-400">%</span>
              </div>
              <div className="flex items-center gap-1 text-sm font-medium">
                {trendIcon}
                <span
                  className={
                    delta > 0.5
                      ? 'text-emerald-600'
                      : delta < -0.5
                        ? 'text-rose-600'
                        : 'text-slate-500'
                  }
                >
                  {delta > 0 ? '+' : ''}
                  {delta.toFixed(1)}pp
                </span>
                <span className="text-slate-400 text-xs">vs prior {sov?.periodDays ?? 7}d</span>
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              {sov?.current.brand ?? 0} brand mentions · {sov?.current.total ?? 0} total entity
              mentions in tracked prompts.
            </p>
          </div>
          <div className="text-xs text-slate-500 flex items-center gap-1.5 bg-slate-50 px-3 py-2 rounded-lg">
            <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
            Run prompts to update this score.
          </div>
        </CardContent>
      </Card>

      {/* Prompts list */}
      <div>
        <h2 className="text-sm font-semibold text-slate-700 mb-2">Tracked prompts</h2>
        {promptsQuery.isLoading ? (
          <div className="py-8 text-center text-slate-500 text-sm">
            <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Loading…
          </div>
        ) : prompts.length === 0 ? (
          <Card className="border-dashed border-2 border-slate-200">
            <CardContent className="py-10 text-center">
              <Search className="w-9 h-9 text-slate-300 mx-auto mb-3" />
              <div className="font-semibold text-slate-900">Add your first prompt</div>
              <p className="text-sm text-slate-600 mt-1 max-w-sm mx-auto">
                e.g. "What are the best CRM tools for solo founders?" — we'll check whether your
                brand is named in the answer.
              </p>
              <Button onClick={() => setDialogOpen(true)} className="gap-1.5 mt-4">
                <Plus className="w-4 h-4" /> Add prompt
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {prompts.map((p) => (
              <Card key={p.id} className="border-slate-200">
                <CardContent className="p-4 flex items-center gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-slate-900 font-medium break-words">
                      {p.promptText}
                    </div>
                    <div className="text-xs text-slate-500 mt-1 flex gap-3 flex-wrap">
                      <span>Last run: {timeAgo(p.lastRunAt)}</span>
                      <span>{p.runCount} run(s)</span>
                      <span>{p.brandHits} brand hit(s)</span>
                    </div>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <Button
                      size="sm"
                      onClick={() => handleRun(p.id)}
                      disabled={runningId === p.id}
                      className="gap-1.5"
                    >
                      {runningId === p.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3.5 h-3.5" />
                      )}
                      Run now
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDelete(p.id, p.promptText)}
                    >
                      <Trash2 className="w-3.5 h-3.5 text-red-500" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Recent mentions */}
      <div>
        <h2 className="text-sm font-semibold text-slate-700 mb-2">Recent mentions</h2>
        {mentionsQuery.isLoading ? (
          <div className="py-6 text-center text-slate-500 text-sm">
            <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Loading…
          </div>
        ) : mentions.length === 0 ? (
          <Card className="border-dashed border-2 border-slate-200">
            <CardContent className="py-8 text-center text-sm text-slate-500">
              No runs yet. Add a prompt above and click "Run now".
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {mentions.map((m) => (
              <MentionCard key={m.id} m={m} brand={brandGuess} />
            ))}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add tracked prompt</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Label htmlFor="geo-prompt-text" className="text-sm">
              Prompt customers might ask an AI assistant
            </Label>
            <Textarea
              id="geo-prompt-text"
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              rows={3}
              placeholder="What are the best email-marketing tools for solo founders?"
            />
            <p className="text-[11px] text-slate-500">
              Tip: be specific. Generic prompts return generic answers.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={promptText.trim().length < 3 || createPrompt.isPending}
            >
              {createPrompt.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
