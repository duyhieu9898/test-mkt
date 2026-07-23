'use client';

/**
 * Content Editor — Block 4 (Real-time Semantic Grader MVP).
 *
 * Two-column layout: left = paste content + target keyword + Grade button.
 * Right = live score widget, breakdown bars, ranked suggestions. Below the
 * editor: collapsible list of the 5 most recent grades for quick re-review.
 */

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Loader2, Sparkles, FileEdit, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useGradeContent,
  usePastGrades,
  type GradeBreakdown,
  type GradeSuggestion,
  type GradeResult,
} from '@/lib/api/content-editor-hooks';

const BREAKDOWN_LABELS: Record<keyof GradeBreakdown, string> = {
  entity_coverage: 'Entity coverage',
  topic_coverage: 'Topic coverage',
  brand_voice: 'Brand voice',
  ai_citation_likelihood: 'AI citation likelihood',
  readability: 'Readability',
};

const SEVERITY_STYLES: Record<GradeSuggestion['severity'], string> = {
  high: 'bg-red-100 text-red-700 border-red-200',
  medium: 'bg-amber-100 text-amber-700 border-amber-200',
  low: 'bg-emerald-100 text-emerald-700 border-emerald-200',
};

function scoreColor(score: number): string {
  if (score >= 80) return 'text-emerald-600';
  if (score >= 60) return 'text-amber-600';
  return 'text-red-600';
}

function scoreBarColor(score: number): string {
  if (score >= 80) return 'bg-emerald-500';
  if (score >= 60) return 'bg-amber-500';
  return 'bg-red-500';
}

function AnimatedScore({ target }: { target: number }) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    setValue(0);
    const start = performance.now();
    const dur = 800;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      setValue(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);

  const radius = 56;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (value / 100) * circ;

  return (
    <div className="relative w-36 h-36">
      <svg width={144} height={144} className="-rotate-90">
        <circle cx={72} cy={72} r={radius} stroke="#e5e7eb" strokeWidth={10} fill="none" />
        <circle
          cx={72}
          cy={72}
          r={radius}
          stroke="currentColor"
          strokeWidth={10}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          className={cn('transition-[stroke-dashoffset] duration-700', scoreColor(target))}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className={cn('text-4xl font-bold tabular-nums', scoreColor(target))}>{value}</div>
        <div className="text-xs text-muted-foreground">out of 100</div>
      </div>
    </div>
  );
}

function BreakdownBar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-slate-600">{label}</span>
        <span className="font-semibold tabular-nums">{value}</span>
      </div>
      <Progress value={value} indicatorClassName={scoreBarColor(value)} />
    </div>
  );
}

function EmptyState() {
  return (
    <Card className="border-dashed">
      <CardContent className="py-12 text-center space-y-3">
        <div className="mx-auto w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center">
          <Sparkles className="w-6 h-6 text-indigo-600" />
        </div>
        <p className="text-sm font-medium text-slate-700">No grade yet</p>
        <p className="text-xs text-muted-foreground max-w-sm mx-auto">
          Paste your blog post or article on the left and enter a target keyword. Get an instant
          score against relevant public topic sources plus ranked suggestions.
        </p>
      </CardContent>
    </Card>
  );
}

export default function ContentEditorPage() {
  const params = useParams();
  const companyId = params.companyId as string;

  const [content, setContent] = useState('');
  const [keyword, setKeyword] = useState('');
  const [result, setResult] = useState<GradeResult | null>(null);
  const [pastOpen, setPastOpen] = useState(false);

  const gradeMut = useGradeContent(companyId);
  const pastQ = usePastGrades(companyId, 5);

  const wordCount = useMemo(() => content.trim().split(/\s+/).filter(Boolean).length, [content]);

  async function onGrade() {
    if (content.trim().length < 50) {
      toast.error('Paste at least 50 characters of content.');
      return;
    }
    if (!keyword.trim()) {
      toast.error('Enter a target keyword.');
      return;
    }
    try {
      const data = await gradeMut.mutateAsync({ content, targetKeyword: keyword.trim() });
      setResult(data);
      toast.success(`Scored ${data.score}/100`);
    } catch (err: any) {
      toast.error(err?.message || 'Could not grade content. Try again.');
    }
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center shrink-0">
          <FileEdit className="w-5 h-5 text-indigo-600" />
        </div>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Content Editor</h1>
          <p className="text-sm text-slate-600 mt-1 max-w-2xl">
            Real-time semantic grader. Paste any draft, pick a target keyword, and get a 0-100
            score against relevant public topic sources with concrete fixes.
          </p>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* LEFT — composer */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your draft</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-700">Target keyword</label>
              <Input
                placeholder="e.g. ai marketing automation"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                disabled={gradeMut.isPending}
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-xs font-medium text-slate-700">Content</label>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {wordCount} words
                </span>
              </div>
              <Textarea
                placeholder="Paste your blog post or article here..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="min-h-[420px] font-mono text-sm"
                disabled={gradeMut.isPending}
              />
            </div>
            <Button
              onClick={onGrade}
              disabled={gradeMut.isPending}
              className="w-full gap-2 bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {gradeMut.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Grading...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" /> Grade content
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* RIGHT — score + breakdown + suggestions */}
        <div className="space-y-4">
          {result ? (
            <>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex flex-col sm:flex-row items-center gap-6">
                    <AnimatedScore target={result.score} />
                    <div className="flex-1 space-y-3 w-full">
                      {(Object.keys(BREAKDOWN_LABELS) as (keyof GradeBreakdown)[]).map((k) => (
                        <BreakdownBar
                          key={k}
                          label={BREAKDOWN_LABELS[k]}
                          value={result.breakdown[k]}
                        />
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Suggestions ({result.suggestions.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {result.suggestions.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Looking solid. No high-priority fixes detected.
                    </p>
                  ) : (
                    result.suggestions.map((s, i) => (
                      <div
                        key={i}
                        className={cn(
                          'border rounded-lg p-3 flex items-start gap-3',
                          SEVERITY_STYLES[s.severity],
                        )}
                      >
                        <Badge
                          variant="outline"
                          className="uppercase text-[10px] tracking-wide shrink-0 bg-white/60"
                        >
                          {s.category}
                        </Badge>
                        <p className="text-sm leading-snug">{s.text}</p>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              {result.serpEntities.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Public topic entities</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-1.5">
                      {result.serpEntities.map((e) => {
                        const missing = result.missingEntities.includes(e);
                        return (
                          <Badge
                            key={e}
                            variant="outline"
                            className={cn(
                              'text-xs',
                              missing
                                ? 'border-red-200 text-red-700 bg-red-50'
                                : 'border-emerald-200 text-emerald-700 bg-emerald-50',
                            )}
                          >
                            {e}
                          </Badge>
                        );
                      })}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-2">
                      Red = missing from your draft. Green = already covered.
                    </p>
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <EmptyState />
          )}
        </div>
      </div>

      {/* Past grades — collapsible quick re-review */}
      <Card>
        <button
          type="button"
          onClick={() => setPastOpen((v) => !v)}
          className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/50 transition-colors rounded-xl"
        >
          <div className="flex items-center gap-2">
            {pastOpen ? (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            )}
            <span className="font-medium text-sm">Past grades</span>
            <Badge variant="outline" className="text-xs">
              {pastQ.data?.length ?? 0}
            </Badge>
          </div>
          <span className="text-xs text-muted-foreground">
            5 most recent
          </span>
        </button>
        {pastOpen && (
          <CardContent className="pt-0 space-y-2">
            {pastQ.isLoading ? (
              <p className="text-sm text-muted-foreground py-4">Loading...</p>
            ) : !pastQ.data || pastQ.data.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">
                No past grades. Score something to start tracking.
              </p>
            ) : (
              pastQ.data.map((g) => (
                <div
                  key={g.id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-card"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{g.targetKeyword}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {new Date(g.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <div className={cn('text-xl font-bold tabular-nums', scoreColor(g.score))}>
                    {g.score}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
}
