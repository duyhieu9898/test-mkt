'use client';
/**
 * Brain Hub — Phase A dashboard.
 *
 * Three tabs:
 *   - Sources    every tap that's flowing in (internal + manual)
 *   - Stream     recent events, filterable + semantic search
 *   - Analytics  top topics this week, sentiment + source breakdown
 *
 * Phase B (watchers + reactions) and Phase C (OAuth + polling) layer on
 * top — the Hub URL stays /[companyId]/brain-hub.
 */
import { useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import {
  Brain,
  Upload,
  Clipboard,
  Loader2,
  Search,
  Trash2,
  FileText,
  MessageSquare,
  Users,
  Inbox,
  Sparkles,
  TrendingUp,
  Bell,
  Zap,
  CheckCircle2,
  XCircle,
  PlayCircle,
  ChevronDown,
  ChevronUp,
  Info,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  useBrainAdapters,
  useBrainSources,
  useBrainEvents,
  useBrainSummary,
  useBrainTopTopics,
  useSemanticSearch,
  useBulkImport,
  useUploadFile,
  useDeleteSource,
  useBrainWatchers,
  usePatchWatcher,
  useRunAllWatchers,
  useBrainReactions,
  useReactionEvents,
  useApproveReaction,
  useDismissReaction,
  type BrainSource,
  type BrainEvent,
  type BrainSearchHit,
  type BrainWatcher,
  type BrainReaction,
} from '@/lib/api/brain-hub-hooks';

const SOURCE_TYPE_ICONS: Record<BrainSource['type'], typeof FileText> = {
  manual_upload: Upload,
  bulk_import: Clipboard,
  internal_tap: Inbox,
  oauth_api: Sparkles,
  webhook_inbound: Sparkles,
  polling_feed: TrendingUp,
};

const SUBTYPE_LABELS: Record<string, string> = {
  chatbot_message: 'Chatbot',
  omnichannel_message: 'FB Messenger',
  lead_capture: 'Leads',
  growth_score_delta: 'Growth Score',
  pdf: 'PDF',
  csv: 'CSV',
  markdown: 'Markdown',
  text: 'Text',
  single: 'Single block',
  lines: 'One-per-line',
  'double-newline': 'Paragraphs',
};

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return 'never';
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function sentimentColor(s: string | null | undefined): string {
  switch (s) {
    case 'positive':
    case 'praise':
      return 'bg-emerald-100 text-emerald-700';
    case 'negative':
    case 'objection':
      return 'bg-rose-100 text-rose-700';
    case 'question':
      return 'bg-amber-100 text-amber-700';
    case 'neutral':
      return 'bg-slate-100 text-slate-600';
    default:
      return 'bg-slate-100 text-slate-500';
  }
}

export default function BrainHubPage() {
  const params = useParams();
  const companyId = params.companyId as string;

  const { data: adapters } = useBrainAdapters();
  const { data: sources, isLoading: sourcesLoading } = useBrainSources(companyId);
  const { data: summary } = useBrainSummary(companyId);

  const [tab, setTab] = useState<'reactions' | 'watchers' | 'sources' | 'stream' | 'analytics'>('reactions');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);

  // Pending reactions count drives the badge on the Reactions tab
  const { data: pendingReactions } = useBrainReactions(companyId, 'suggested');
  const pendingCount = pendingReactions?.length ?? 0;

  const hasInternalTaps = !!sources?.some((s) => s.type === 'internal_tap');
  const userSources = sources?.filter((s) => s.type !== 'internal_tap') ?? [];
  const internalSources = sources?.filter((s) => s.type === 'internal_tap') ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Brain className="w-7 h-7 text-purple-600" />
            Brain Hub
          </h1>
          <p className="text-muted-foreground mt-1">
            One place where every customer message, lead, upload, and (soon) external trend flows in. Your AI
            employees use it to draft smarter content.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setBulkOpen(true)}>
            <Clipboard className="w-4 h-4 mr-2" />
            Paste bulk
          </Button>
          <Button onClick={() => setUploadOpen(true)}>
            <Upload className="w-4 h-4 mr-2" />
            Upload file
          </Button>
        </div>
      </div>

      {/* Headline counters */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <SummaryCard label="Total events" value={summary?.totalEvents ?? 0} />
        <SummaryCard label="This week" value={summary?.eventsLast7d ?? 0} />
        <SummaryCard label="Active sources" value={sources?.filter((s) => s.status === 'active').length ?? 0} />
      </div>

      {/* Walkthrough strip — short, never goes away */}
      <Card className="border-purple-200 bg-purple-50/40">
        <CardContent className="p-4 flex items-start gap-3">
          <Info className="w-5 h-5 text-purple-600 mt-0.5 shrink-0" />
          <div className="text-sm">
            <p className="font-medium text-purple-900">How the Brain Hub works</p>
            <p className="text-purple-800/80 mt-1">
              <span className="font-semibold">Sources</span> feed events in (your chatbot, FB inbox, leads,
              and any file you upload).{' '}
              <span className="font-semibold">Watchers</span> scan those events for patterns (recurring
              questions, objection clusters, churn-risk language).{' '}
              <span className="font-semibold">Reactions</span> are the drafts the Brain proposes when a
              watcher fires — review, approve, or dismiss with one click.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="reactions">
            <Bell className="w-3.5 h-3.5 mr-1.5" />
            Reactions
            {pendingCount > 0 && (
              <span className="ml-2 text-[10px] bg-rose-500 text-white rounded-full px-1.5 py-0.5">
                {pendingCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="watchers">
            <Zap className="w-3.5 h-3.5 mr-1.5" />
            Watchers
          </TabsTrigger>
          <TabsTrigger value="sources">Sources</TabsTrigger>
          <TabsTrigger value="stream">Event stream</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        {/* ── REACTIONS (default) ── */}
        <TabsContent value="reactions">
          <ReactionsTab companyId={companyId} />
        </TabsContent>

        {/* ── WATCHERS ── */}
        <TabsContent value="watchers">
          <WatchersTab companyId={companyId} />
        </TabsContent>

        {/* ── SOURCES ── */}
        <TabsContent value="sources" className="space-y-6">
          <section>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Internal taps (always on)
            </h2>
            {!hasInternalTaps && (
              <Card className="border-dashed">
                <CardContent className="p-5 text-sm text-muted-foreground">
                  Internal taps appear automatically the first time data flows in — start a chatbot
                  conversation, receive a Facebook message, or capture a lead, and the source shows up here.
                </CardContent>
              </Card>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {internalSources.map((s) => (
                <SourceCard key={s.id} companyId={companyId} source={s} canDelete={false} />
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Your sources
            </h2>
            {sourcesLoading && (
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading…
              </div>
            )}
            {!sourcesLoading && userSources.length === 0 && (
              <Card className="border-dashed">
                <CardContent className="p-5 text-sm text-muted-foreground">
                  No uploads or imports yet. Try uploading a sales deck (PDF) or pasting a list of customer
                  questions.
                </CardContent>
              </Card>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {userSources.map((s) => (
                <SourceCard key={s.id} companyId={companyId} source={s} canDelete={true} />
              ))}
            </div>
          </section>

          {/* Coming-soon adapter teaser */}
          <section>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Coming soon (Phase C)
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {adapters
                ?.filter((a) => a.phase === 'C')
                .map((a) => (
                  <Card key={a.type} className="opacity-70">
                    <CardContent className="p-4">
                      <div className="font-medium text-sm">{a.label}</div>
                      <div className="text-xs text-muted-foreground mt-1">{a.description}</div>
                    </CardContent>
                  </Card>
                ))}
            </div>
          </section>
        </TabsContent>

        {/* ── STREAM ── */}
        <TabsContent value="stream">
          <StreamTab companyId={companyId} sources={sources ?? []} />
        </TabsContent>

        {/* ── ANALYTICS ── */}
        <TabsContent value="analytics">
          <AnalyticsTab companyId={companyId} />
        </TabsContent>
      </Tabs>

      <UploadDialog companyId={companyId} open={uploadOpen} onClose={() => setUploadOpen(false)} />
      <BulkImportDialog companyId={companyId} open={bulkOpen} onClose={() => setBulkOpen(false)} />
    </div>
  );
}

/* ─── Pieces ─────────────────────────────────────────────────── */

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="text-2xl font-bold mt-1">{value.toLocaleString()}</div>
      </CardContent>
    </Card>
  );
}

function SourceCard({
  companyId,
  source,
  canDelete,
}: {
  companyId: string;
  source: BrainSource;
  canDelete: boolean;
}) {
  const Icon = SOURCE_TYPE_ICONS[source.type] ?? FileText;
  const del = useDeleteSource(companyId);
  const subtypeLabel = source.subtype ? SUBTYPE_LABELS[source.subtype] ?? source.subtype : null;

  return (
    <Card>
      <CardContent className="p-4 space-y-2">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-purple-50 flex items-center justify-center shrink-0">
            <Icon className="w-4 h-4 text-purple-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium truncate">{source.name}</div>
            <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
              {subtypeLabel && <span>{subtypeLabel}</span>}
              {subtypeLabel && <span>·</span>}
              <span>{source.eventCount?.total ?? 0} events</span>
              <span>·</span>
              <span>last {timeAgo(source.lastSyncedAt)}</span>
            </div>
          </div>
          {canDelete && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (!confirm(`Delete "${source.name}" and all its events?`)) return;
                del.mutate(source.id, {
                  onSuccess: () => toast.success('Source deleted'),
                  onError: (e) => toast.error((e as Error).message),
                });
              }}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>
        {source.status !== 'active' && (
          <Badge variant="outline" className="text-xs">
            {source.status}
          </Badge>
        )}
        {source.lastError && (
          <div className="text-xs text-rose-600 truncate" title={source.lastError}>
            {source.lastError}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StreamTab({ companyId, sources }: { companyId: string; sources: BrainSource[] }) {
  const [searchQ, setSearchQ] = useState('');
  const [sourceFilter, setSourceFilter] = useState<string>('');
  const [sentimentFilter, setSentimentFilter] = useState<string>('');
  const search = useSemanticSearch(companyId);
  const [searchResults, setSearchResults] = useState<BrainSearchHit[] | null>(null);

  const { data: events, isLoading } = useBrainEvents(companyId, {
    sourceId: sourceFilter || undefined,
    sentiment: sentimentFilter || undefined,
    limit: 100,
  });

  const runSearch = () => {
    if (searchQ.trim().length < 2) return;
    search.mutate(searchQ, {
      onSuccess: (r) => setSearchResults(r.data),
      onError: (e) => toast.error((e as Error).message),
    });
  };

  const display = searchResults ?? events ?? [];

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && runSearch()}
                placeholder="Semantic search — try &quot;customers asking about pricing&quot; or &quot;competitor mentions&quot;"
                className="pl-9"
              />
            </div>
            <Button onClick={runSearch} disabled={search.isPending || searchQ.trim().length < 2}>
              {search.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Search'}
            </Button>
            {searchResults && (
              <Button
                variant="ghost"
                onClick={() => {
                  setSearchResults(null);
                  setSearchQ('');
                }}
              >
                Clear
              </Button>
            )}
          </div>
          {/* Filters — disabled while showing search results */}
          {!searchResults && (
            <div className="flex flex-wrap gap-2 text-xs">
              <select
                className="border rounded px-2 py-1 bg-white"
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
              >
                <option value="">All sources</option>
                {sources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <select
                className="border rounded px-2 py-1 bg-white"
                value={sentimentFilter}
                onChange={(e) => setSentimentFilter(e.target.value)}
              >
                <option value="">All sentiments</option>
                <option value="question">Question</option>
                <option value="objection">Objection</option>
                <option value="praise">Praise</option>
                <option value="positive">Positive</option>
                <option value="negative">Negative</option>
                <option value="neutral">Neutral</option>
              </select>
            </div>
          )}
        </CardContent>
      </Card>

      {isLoading && (
        <div className="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading events…
        </div>
      )}

      {!isLoading && display.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="p-6 text-sm text-muted-foreground text-center">
            No events yet. Start a chatbot conversation, capture a lead, or upload a file — events will appear
            here.
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {display.map((e) => (
          <EventRow key={e.id} ev={e} sources={sources} score={(e as BrainSearchHit).score} />
        ))}
      </div>
    </div>
  );
}

function EventRow({
  ev,
  sources,
  score,
}: {
  ev: BrainEvent;
  sources: BrainSource[];
  score?: number;
}) {
  const src = sources.find((s) => s.id === ev.sourceId);
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm">{ev.subject}</div>
            <div className="text-sm text-muted-foreground mt-1 line-clamp-3">{ev.content}</div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {src && (
                <Badge variant="outline" className="text-[10px]">
                  {src.name}
                </Badge>
              )}
              {ev.sentiment && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${sentimentColor(ev.sentiment)}`}>
                  {ev.sentiment}
                </span>
              )}
              {ev.topicTags?.map((t) => (
                <Badge key={t} variant="secondary" className="text-[10px]">
                  #{t}
                </Badge>
              ))}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-xs text-muted-foreground">{timeAgo(ev.occurredAt)}</div>
            {score !== undefined && (
              <div className="text-[10px] text-purple-600 mt-1">
                match {(score * 100).toFixed(0)}%
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function AnalyticsTab({ companyId }: { companyId: string }) {
  const { data: summary } = useBrainSummary(companyId);
  const { data: topics } = useBrainTopTopics(companyId, 7);

  const totalSentiment = useMemo(() => {
    if (!summary?.sentimentBreakdown7d) return 0;
    return Object.values(summary.sentimentBreakdown7d).reduce((a, b) => a + b, 0);
  }, [summary]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top topics */}
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 text-purple-600" />
              <h3 className="font-semibold">Top topics this week</h3>
            </div>
            {(!topics || topics.length === 0) && (
              <p className="text-sm text-muted-foreground">No topics tagged yet.</p>
            )}
            <div className="space-y-2">
              {topics?.slice(0, 12).map((t) => (
                <div key={t.tag} className="flex items-center justify-between">
                  <span className="text-sm font-medium">#{t.tag}</span>
                  <Badge variant="secondary">{t.count}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Sentiment */}
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <MessageSquare className="w-4 h-4 text-purple-600" />
              <h3 className="font-semibold">Sentiment (last 7d)</h3>
            </div>
            {totalSentiment === 0 && <p className="text-sm text-muted-foreground">No tagged events yet.</p>}
            <div className="space-y-2">
              {summary &&
                Object.entries(summary.sentimentBreakdown7d).map(([s, n]) => (
                  <div key={s} className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded ${sentimentColor(s)}`}>{s}</span>
                    <div className="flex-1 h-2 bg-slate-100 rounded overflow-hidden">
                      <div
                        className="h-2 bg-purple-400"
                        style={{ width: totalSentiment ? `${(n / totalSentiment) * 100}%` : '0%' }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground w-8 text-right">{n}</span>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* By source */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-4 h-4 text-purple-600" />
            <h3 className="font-semibold">Events by source type (last 7d)</h3>
          </div>
          {(!summary || Object.keys(summary.eventsBySourceType7d).length === 0) && (
            <p className="text-sm text-muted-foreground">No activity this week yet.</p>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {summary &&
              Object.entries(summary.eventsBySourceType7d).map(([t, n]) => (
                <div key={t} className="border rounded-lg p-3">
                  <div className="text-xs text-muted-foreground capitalize">{t.replace('_', ' ')}</div>
                  <div className="text-xl font-bold mt-1">{n}</div>
                </div>
              ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ─── Dialogs ────────────────────────────────────────────────── */

function UploadDialog({
  companyId,
  open,
  onClose,
}: {
  companyId: string;
  open: boolean;
  onClose: () => void;
}) {
  const upload = useUploadFile(companyId);
  const [file, setFile] = useState<File | null>(null);
  const [sourceName, setSourceName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = () => {
    if (!file) return;
    upload.mutate(
      { file, sourceName: sourceName || undefined },
      {
        onSuccess: () => {
          toast.success(`Uploaded: ${file.name}`);
          setFile(null);
          setSourceName('');
          onClose();
        },
        onError: (e) => toast.error((e as Error).message),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload a file to Brain Hub</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            PDF, text, markdown, or CSV. Up to 10 MB. The file gets extracted, embedded, and tagged so your
            employees can pull it into any draft.
          </p>
          <Input
            ref={inputRef}
            type="file"
            accept=".pdf,.txt,.md,.csv,text/*,application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <Input
            value={sourceName}
            onChange={(e) => setSourceName(e.target.value)}
            placeholder="Source name (optional — defaults to filename)"
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!file || upload.isPending}>
            {upload.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Upload
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Phase B tabs ───────────────────────────────────────────── */

function WatchersTab({ companyId }: { companyId: string }) {
  const { data: watchers, isLoading } = useBrainWatchers(companyId);
  const patch = usePatchWatcher(companyId);
  const runAll = useRunAllWatchers(companyId);
  const [expanded, setExpanded] = useState<string | null>(null);

  const active = watchers?.filter((w) => w.status === 'active') ?? [];
  const paused = watchers?.filter((w) => w.status === 'paused') ?? [];

  return (
    <div className="space-y-4">
      {/* Header strip + Run all */}
      <Card>
        <CardContent className="p-4 flex items-center justify-between">
          <div>
            <h3 className="font-semibold">Watchers</h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              {active.length} active · {paused.length} paused. Watchers run automatically when new events
              arrive. Use the button to scan all historic events now.
            </p>
          </div>
          <Button
            onClick={() =>
              runAll.mutate(undefined, {
                onSuccess: (r: any) =>
                  toast.success(`Checked ${r?.data?.checked ?? 0} watchers — ${r?.data?.fired ?? 0} fired`),
                onError: (e) => toast.error((e as Error).message),
              })
            }
            disabled={runAll.isPending}
          >
            {runAll.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <PlayCircle className="w-4 h-4 mr-2" />
            )}
            Run all now
          </Button>
        </CardContent>
      </Card>

      {isLoading && (
        <div className="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading watchers…
        </div>
      )}

      <div className="space-y-2">
        {watchers?.map((w) => (
          <WatcherRow
            key={w.id}
            companyId={companyId}
            watcher={w}
            expanded={expanded === w.id}
            onToggle={() => setExpanded(expanded === w.id ? null : w.id)}
            onPatch={(patchBody) =>
              patch.mutate({ id: w.id, ...patchBody }, {
                onSuccess: () => toast.success('Watcher updated'),
                onError: (e) => toast.error((e as Error).message),
              })
            }
          />
        ))}
      </div>
    </div>
  );
}

function WatcherRow({
  companyId: _companyId,
  watcher,
  expanded,
  onToggle,
  onPatch,
}: {
  companyId: string;
  watcher: BrainWatcher;
  expanded: boolean;
  onToggle: () => void;
  onPatch: (body: { status?: 'active' | 'paused'; autoMode?: 'review' | 'auto_high_conf'; cooldownHours?: number }) => void;
}) {
  const isPhaseC = watcher.slug.includes('trend') || watcher.slug.includes('competitor_announce') || watcher.slug.includes('geo_citation');
  const conditionDesc = describeCondition(watcher.condition);
  const actionsDesc = watcher.actions.map((a) => actionLabel(a.type)).join(' + ');

  return (
    <Card className={watcher.status === 'paused' ? 'opacity-70' : ''}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium">{watcher.name}</span>
              {watcher.status === 'paused' && (
                <Badge variant="outline" className="text-[10px]">
                  paused
                </Badge>
              )}
              {isPhaseC && (
                <Badge variant="outline" className="text-[10px] text-amber-700 border-amber-300">
                  Needs Phase C source
                </Badge>
              )}
              <span className="text-[10px] text-muted-foreground">
                fired {watcher.fireCount} × · last {timeAgo(watcher.lastFiredAt)}
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">{watcher.description}</p>
            <div className="text-xs text-muted-foreground mt-1.5">
              <span className="font-semibold">When:</span> {conditionDesc} <span className="mx-1">·</span>
              <span className="font-semibold">Then:</span> {actionsDesc}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onPatch({ status: watcher.status === 'active' ? 'paused' : 'active' })}
            >
              {watcher.status === 'active' ? 'Pause' : 'Enable'}
            </Button>
            <Button variant="ghost" size="sm" onClick={onToggle}>
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        {expanded && (
          <div className="mt-4 pt-3 border-t space-y-3 text-sm">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Cooldown (hours)</label>
                <Input
                  type="number"
                  min={0}
                  max={720}
                  defaultValue={watcher.cooldownHours}
                  onBlur={(e) => {
                    const n = Number(e.target.value);
                    if (n !== watcher.cooldownHours && !Number.isNaN(n)) onPatch({ cooldownHours: n });
                  }}
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  After firing on a topic, the watcher waits this long before re-firing on the same topic.
                </p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Auto-publish mode</label>
                <select
                  className="w-full border rounded px-2 py-2 text-sm bg-white mt-0.5"
                  value={watcher.autoMode}
                  onChange={(e) => onPatch({ autoMode: e.target.value as 'review' | 'auto_high_conf' })}
                >
                  <option value="review">Always require review (safest)</option>
                  <option value="auto_high_conf">Auto-publish high-confidence FAQs</option>
                </select>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Only chatbot FAQ drafts ever auto-publish — blog launches always need approval.
                </p>
              </div>
            </div>
            {watcher.condition.kind === 'keyword_match' && watcher.condition.phrases && (
              <div>
                <label className="text-xs text-muted-foreground">Watch phrases</label>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {watcher.condition.phrases.map((p) => (
                    <Badge key={p} variant="secondary" className="text-[10px]">
                      "{p}"
                    </Badge>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Editing phrases is on the roadmap — for now, contact support to customize.
                </p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function describeCondition(c: BrainWatcher['condition']): string {
  if (c.kind === 'recurring_topic') {
    const sent = c.sentiment ? ` (${c.sentiment})` : '';
    return `same topic${sent} appears ≥${c.minOccurrences ?? 3} times in ${formatWindow(c.windowHours)}`;
  }
  if (c.kind === 'event_spike') {
    const t = c.type ? ` of type "${c.type}"` : '';
    return `≥${c.minCount ?? 5} events${t} in ${formatWindow(c.windowHours)}`;
  }
  if (c.kind === 'keyword_match') {
    return `any of ${c.phrases?.length ?? 0} phrases matches in ${formatWindow(c.windowHours)}`;
  }
  return 'custom condition';
}

function formatWindow(hours: number): string {
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  return days === 1 ? '1 day' : `${days} days`;
}

function actionLabel(t: string): string {
  if (t === 'notify') return 'Notify only';
  if (t === 'chatbot_faq_draft') return 'Draft chatbot FAQ';
  if (t === 'blog_draft_launcher') return 'Prep Campaign Launcher';
  return t;
}

function ReactionsTab({ companyId }: { companyId: string }) {
  const [statusFilter, setStatusFilter] = useState<BrainReaction['status'] | 'all'>('suggested');
  const { data: reactions, isLoading } = useBrainReactions(
    companyId,
    statusFilter === 'all' ? undefined : statusFilter,
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 flex items-center gap-3 flex-wrap">
          <span className="text-sm font-semibold">Show:</span>
          {(['suggested', 'approved', 'published', 'dismissed', 'all'] as const).map((s) => (
            <Button
              key={s}
              size="sm"
              variant={statusFilter === s ? 'default' : 'outline'}
              onClick={() => setStatusFilter(s)}
            >
              {s}
            </Button>
          ))}
        </CardContent>
      </Card>

      {isLoading && (
        <div className="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading reactions…
        </div>
      )}

      {!isLoading && (!reactions || reactions.length === 0) && (
        <Card className="border-dashed">
          <CardContent className="p-6 text-sm text-muted-foreground text-center">
            No reactions yet. As your chatbot conversations and leads come in, watchers will detect patterns
            and surface drafts here. You can also press <strong>Run all now</strong> in the Watchers tab to
            scan existing events.
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {reactions?.map((r) => (
          <ReactionRow key={r.id} companyId={companyId} reaction={r} />
        ))}
      </div>
    </div>
  );
}

function ReactionRow({ companyId, reaction }: { companyId: string; reaction: BrainReaction }) {
  const [expanded, setExpanded] = useState(false);
  const approve = useApproveReaction(companyId);
  const dismiss = useDismissReaction(companyId);
  const { data: triggerEvents } = useReactionEvents(companyId, expanded ? reaction.id : null);

  const isPending = reaction.status === 'suggested';

  return (
    <Card className={isPending ? 'border-purple-300' : ''}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold">{reaction.headline}</span>
              <Badge variant={isPending ? 'default' : 'outline'} className="text-[10px]">
                {reaction.status}
              </Badge>
              <span className="text-[10px] text-muted-foreground">{timeAgo(reaction.firedAt)}</span>
            </div>
            {reaction.summary && (
              <pre className="text-xs text-muted-foreground mt-2 whitespace-pre-wrap font-sans">
                {reaction.summary}
              </pre>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {isPending && (
              <>
                <Button
                  size="sm"
                  onClick={() =>
                    approve.mutate(reaction.id, {
                      onSuccess: (res: any) =>
                        toast.success(`Approved — ${res?.data?.followUps?.length ?? 0} actions ran`),
                      onError: (e) => toast.error((e as Error).message),
                    })
                  }
                  disabled={approve.isPending}
                >
                  {approve.isPending ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                  )}
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    dismiss.mutate(reaction.id, {
                      onSuccess: () => toast.success('Dismissed'),
                      onError: (e) => toast.error((e as Error).message),
                    })
                  }
                >
                  <XCircle className="w-3 h-3 mr-1" />
                  Dismiss
                </Button>
              </>
            )}
            <Button variant="ghost" size="sm" onClick={() => setExpanded(!expanded)}>
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        {/* Drafts */}
        <div className="space-y-2">
          {reaction.drafts.map((d, i) => (
            <div key={i} className="border rounded p-3 bg-slate-50">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold">{d.title}</span>
                <span className="text-[10px] text-muted-foreground">
                  {actionLabel(d.actionType)} · conf {(d.confidence * 100).toFixed(0)}%
                </span>
              </div>
              <pre className="text-xs whitespace-pre-wrap font-sans text-slate-700">{d.body}</pre>
              {d.followUp && (
                <div className="mt-2">
                  {d.followUp.href ? (
                    <a
                      href={d.followUp.href}
                      className="text-xs text-purple-600 underline"
                    >
                      → {d.followUp.label}
                    </a>
                  ) : (
                    <span className="text-xs text-muted-foreground">→ {d.followUp.label}</span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Trigger events drawer */}
        {expanded && (
          <div className="pt-2 border-t">
            <p className="text-xs font-semibold text-muted-foreground mb-2">
              Trigger events ({reaction.triggerEventIds.length})
            </p>
            <div className="space-y-1.5">
              {triggerEvents?.map((e) => (
                <div key={e.id} className="text-xs bg-white border rounded p-2">
                  <div className="font-medium">{e.subject}</div>
                  <div className="text-muted-foreground line-clamp-2 mt-0.5">{e.content}</div>
                </div>
              ))}
              {(!triggerEvents || triggerEvents.length === 0) && (
                <p className="text-xs text-muted-foreground">Loading events…</p>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BulkImportDialog({
  companyId,
  open,
  onClose,
}: {
  companyId: string;
  open: boolean;
  onClose: () => void;
}) {
  const bulk = useBulkImport(companyId);
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [mode, setMode] = useState<'single' | 'lines' | 'csv' | 'double-newline'>('lines');

  const submit = () => {
    if (!name.trim() || !text.trim()) return;
    bulk.mutate(
      { name, text, mode },
      {
        onSuccess: (r: any) => {
          toast.success(`Imported ${r?.data?.eventCount ?? 0} events`);
          setName('');
          setText('');
          onClose();
        },
        onError: (e) => toast.error((e as Error).message),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Paste a bulk import</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Paste a list of customer quotes, an FAQ export, an NPS comment dump, or a CSV. Each row becomes
            one searchable event.
          </p>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Source name (e.g. &quot;Q3 customer interview quotes&quot;)"
          />
          <div>
            <label className="text-xs text-muted-foreground">Split mode</label>
            <select
              className="w-full border rounded px-2 py-2 text-sm bg-white mt-1"
              value={mode}
              onChange={(e) => setMode(e.target.value as typeof mode)}
            >
              <option value="lines">One per line</option>
              <option value="double-newline">Split on blank lines (paragraphs)</option>
              <option value="csv">CSV (first row = headers)</option>
              <option value="single">Single event (whole block)</option>
            </select>
          </div>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={10}
            placeholder="Paste here…"
            className="font-mono text-xs"
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!name.trim() || !text.trim() || bulk.isPending}>
            {bulk.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
