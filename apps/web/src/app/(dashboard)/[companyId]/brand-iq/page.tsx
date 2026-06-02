'use client';

/**
 * Brand IQ — Block 2.
 *
 * Empty state: setup wizard (URL + 0-5 writing samples → Generate).
 * Populated state: read-only summary + Edit dialog per facet + a
 * "Regenerate from new inputs" button at the top.
 *
 * Every other agent (blog, banner, chatbot, social, ads, GEO, content
 * grader) automatically reads the active profile through
 * business-context.ts — the founder doesn't have to apply it anywhere.
 */

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Sparkles,
  RefreshCw,
  Loader2,
  Globe,
  Users,
  Palette,
  Pencil,
  Target,
  CheckCircle2,
  Plus,
  Trash2,
} from 'lucide-react';
import {
  useBrandIq,
  useGenerateBrandIq,
  useUpdateBrandIq,
  type BrandIqProfile,
  type BrandIqVoice,
  type AudiencePersona,
  type QuarterlyOkr,
} from '@/lib/api/brand-iq-hooks';

/* ─── Setup Wizard (empty state) ─────────────────────────────────── */

function SetupWizard({
  companyId,
  onDone,
  initialUrl = '',
  initialSamples = [],
  title = 'Set up your Brand IQ',
}: {
  companyId: string;
  onDone: () => void;
  initialUrl?: string;
  initialSamples?: string[];
  title?: string;
}) {
  const [url, setUrl] = useState(initialUrl);
  const [samples, setSamples] = useState<string[]>(initialSamples.length ? initialSamples : ['']);
  const generate = useGenerateBrandIq(companyId);

  const handleSubmit = async () => {
    const cleanSamples = samples.map((s) => s.trim()).filter((s) => s.length >= 50);
    const cleanUrl = url.trim();
    if (!cleanUrl && cleanSamples.length === 0) {
      toast.error('Provide a URL or at least one writing sample (≥ 50 characters).');
      return;
    }
    try {
      await generate.mutateAsync({ url: cleanUrl || undefined, samples: cleanSamples });
      toast.success('Brand IQ generated. Every agent will now use it.');
      onDone();
    } catch (e) {
      toast.error((e as Error).message || 'Generation failed');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
        <p className="text-sm text-muted-foreground">
          Brand IQ is the layer every agent reads before writing anything for you. The more
          accurate this is, the more consistent your blog, ads, banners, chat replies, and
          landing pages become.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>Website URL (optional)</Label>
          <div className="flex items-center gap-2 mt-1">
            <Globe className="w-4 h-4 text-muted-foreground" />
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://your-domain.com"
              type="url"
            />
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            We&apos;ll scrape your home page for tone, colors, fonts, and OG image.
          </p>
        </div>

        <div className="space-y-2">
          <Label>Writing samples (paste 1-5)</Label>
          <p className="text-[11px] text-muted-foreground">
            Best inputs: an "About" page, a past blog post, a customer email reply. Each ≥ 50
            characters.
          </p>
          {samples.map((s, idx) => (
            <div key={idx} className="flex gap-2 items-start">
              <Textarea
                value={s}
                onChange={(e) =>
                  setSamples((arr) => arr.map((v, i) => (i === idx ? e.target.value : v)))
                }
                rows={3}
                placeholder={`Sample ${idx + 1} — paste a paragraph the brand has actually written.`}
              />
              {samples.length > 1 && (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setSamples((arr) => arr.filter((_, i) => i !== idx))}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
          ))}
          {samples.length < 5 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setSamples((arr) => [...arr, ''])}
              className="gap-1"
            >
              <Plus className="w-3 h-3" /> Add sample
            </Button>
          )}
        </div>

        <Button onClick={handleSubmit} disabled={generate.isPending} className="gap-2 w-full">
          {generate.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          Generate Brand IQ
        </Button>
      </CardContent>
    </Card>
  );
}

/* ─── Per-facet display + edit ───────────────────────────────────── */

function ChipList({ items, empty }: { items: string[]; empty?: string }) {
  if (items.length === 0) return <p className="text-xs text-muted-foreground italic">{empty ?? '(none)'}</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((it, i) => (
        <Badge key={`${it}-${i}`} variant="outline" className="text-xs">
          {it}
        </Badge>
      ))}
    </div>
  );
}

function VoiceCard({ profile, companyId }: { profile: BrandIqProfile; companyId: string }) {
  const [editing, setEditing] = useState(false);
  const update = useUpdateBrandIq(companyId);
  const [draft, setDraft] = useState<BrandIqVoice>(profile.voice);

  const save = async () => {
    try {
      await update.mutateAsync({ voice: draft });
      toast.success('Voice updated');
      setEditing(false);
    } catch (e) {
      toast.error((e as Error).message || 'Update failed');
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" /> Voice
        </CardTitle>
        <Button size="sm" variant="ghost" onClick={() => setEditing(true)} className="gap-1">
          <Pencil className="w-3 h-3" /> Edit
        </Button>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div>
          <div className="text-xs text-muted-foreground mb-1">Adjectives</div>
          <ChipList items={profile.voice.adjectives} />
        </div>
        <div>
          <div className="text-xs text-muted-foreground mb-1">Description</div>
          <p className="text-sm">{profile.voice.description}</p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div>
            <div className="text-muted-foreground">First person</div>
            <div className="font-medium capitalize">{profile.voice.firstPerson.replace('_', ' ')}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Sentences</div>
            <div className="font-medium capitalize">{profile.voice.sentenceLength}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Emoji</div>
            <div className="font-medium capitalize">{profile.voice.emojiUsage}</div>
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground mb-1">Signature phrases</div>
          <ChipList items={profile.voice.signaturePhrases} empty="(none yet — add ones the brand actually says)" />
        </div>
        <div>
          <div className="text-xs text-muted-foreground mb-1">Phrases to avoid</div>
          <ChipList items={profile.voice.avoidPhrases} />
        </div>
      </CardContent>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Edit Voice</DialogTitle>
            <DialogDescription>Changes apply to every agent immediately.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Adjectives (comma-separated)</Label>
              <Input
                value={draft.adjectives.join(', ')}
                onChange={(e) => setDraft((d) => ({ ...d, adjectives: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) }))}
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={draft.description}
                onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                rows={3}
              />
            </div>
            <div>
              <Label>Signature phrases (one per line)</Label>
              <Textarea
                value={draft.signaturePhrases.join('\n')}
                onChange={(e) => setDraft((d) => ({ ...d, signaturePhrases: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) }))}
                rows={3}
              />
            </div>
            <div>
              <Label>Phrases to avoid (one per line)</Label>
              <Textarea
                value={draft.avoidPhrases.join('\n')}
                onChange={(e) => setDraft((d) => ({ ...d, avoidPhrases: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) }))}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDraft(profile.voice); setEditing(false); }}>Cancel</Button>
            <Button onClick={save} disabled={update.isPending}>
              {update.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function PersonasCard({ profile }: { profile: BrandIqProfile }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" /> Audience personas ({profile.audiencePersonas.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {profile.audiencePersonas.length === 0 && (
          <p className="text-sm text-muted-foreground italic">No personas yet. Regenerate with samples to derive some.</p>
        )}
        {profile.audiencePersonas.map((p) => (
          <div key={p.id} className="border rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm">{p.name}</span>
              <Badge variant="secondary" className="text-[10px]">{p.role}</Badge>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
              <div>
                <div className="text-muted-foreground mb-1">Pain points</div>
                <ul className="space-y-0.5 list-disc list-inside">
                  {p.painPoints.map((pp, i) => <li key={i}>{pp}</li>)}
                </ul>
              </div>
              <div>
                <div className="text-muted-foreground mb-1">Goals</div>
                <ul className="space-y-0.5 list-disc list-inside">
                  {p.goals.map((g, i) => <li key={i}>{g}</li>)}
                </ul>
              </div>
              <div>
                <div className="text-muted-foreground mb-1">Channels</div>
                <ChipList items={p.channels} />
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function StyleCard({ profile }: { profile: BrandIqProfile }) {
  const s = profile.styleGuide;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Pencil className="w-4 h-4 text-primary" /> Style guide
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
        {[
          { label: 'Headlines', items: s.headlineRules },
          { label: 'Body', items: s.bodyRules },
          { label: 'CTAs', items: s.ctaRules },
          { label: 'Formatting', items: s.formattingPreferences },
        ].map((g) => (
          <div key={g.label}>
            <div className="text-muted-foreground mb-1">{g.label}</div>
            <ul className="space-y-0.5 list-disc list-inside">
              {g.items.map((it, i) => <li key={i}>{it}</li>)}
            </ul>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function VisualCard({ profile }: { profile: BrandIqProfile }) {
  const v = profile.visualIdentity;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Palette className="w-4 h-4 text-primary" /> Visual identity
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="text-xs text-muted-foreground">Palette</div>
          {[v.primaryColor, v.secondaryColor, ...v.accentColors].map((c, i) => (
            <div key={`${c}-${i}`} className="flex items-center gap-1.5">
              <div className="w-6 h-6 rounded border" style={{ background: c }} />
              <code className="text-[11px] font-mono">{c}</code>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <div className="text-muted-foreground">Headline font</div>
            <div className="font-medium">{v.fontHeadline ?? '(not detected)'}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Body font</div>
            <div className="font-medium">{v.fontBody ?? '(not detected)'}</div>
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Image mood</div>
          <div className="text-sm">{v.imageMood}</div>
        </div>
        {v.logoUrl && (
          <div>
            <div className="text-xs text-muted-foreground mb-1">Logo (auto-detected)</div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={v.logoUrl} alt="logo" className="max-h-12" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function OkrsCard({ profile, companyId }: { profile: BrandIqProfile; companyId: string }) {
  const update = useUpdateBrandIq(companyId);
  const [draft, setDraft] = useState<QuarterlyOkr[]>(profile.okrs);
  const [editing, setEditing] = useState(false);

  const save = async () => {
    try {
      await update.mutateAsync({ okrs: draft });
      toast.success('OKRs updated');
      setEditing(false);
    } catch (e) {
      toast.error((e as Error).message || 'Failed to save OKRs');
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <Target className="w-4 h-4 text-primary" /> Quarterly OKRs ({profile.okrs.length})
        </CardTitle>
        <Button size="sm" variant="ghost" onClick={() => { setDraft(profile.okrs); setEditing(true); }} className="gap-1">
          <Pencil className="w-3 h-3" /> Edit
        </Button>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {profile.okrs.length === 0 && (
          <p className="text-muted-foreground italic text-xs">
            No OKRs set. Adding them lets agents prioritise outputs that move your top goals.
          </p>
        )}
        {profile.okrs.map((o) => (
          <div key={o.id} className="border rounded-lg p-3">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-[10px]">{o.quarter}</Badge>
              <span className="font-medium">{o.objective}</span>
            </div>
            <ul className="mt-1 text-xs list-disc list-inside text-muted-foreground">
              {o.keyResults.map((kr, i) => <li key={i}>{kr}</li>)}
            </ul>
          </div>
        ))}
      </CardContent>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Quarterly OKRs</DialogTitle>
            <DialogDescription>Each agent uses these to prioritise their work.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {draft.map((o, idx) => (
              <div key={o.id} className="border rounded-lg p-3 space-y-2">
                <div className="grid grid-cols-3 gap-2">
                  <Input
                    value={o.quarter}
                    onChange={(e) => setDraft((arr) => arr.map((v, i) => (i === idx ? { ...v, quarter: e.target.value } : v)))}
                    placeholder="2026-Q2"
                    className="font-mono"
                  />
                  <Input
                    value={o.objective}
                    onChange={(e) => setDraft((arr) => arr.map((v, i) => (i === idx ? { ...v, objective: e.target.value } : v)))}
                    placeholder="Reach $10k MRR"
                    className="col-span-2"
                  />
                </div>
                <Textarea
                  value={o.keyResults.join('\n')}
                  onChange={(e) =>
                    setDraft((arr) =>
                      arr.map((v, i) => (i === idx ? { ...v, keyResults: e.target.value.split('\n').filter((x) => x.trim()) } : v)),
                    )
                  }
                  placeholder="Key result 1 per line"
                  rows={3}
                />
                <Button size="sm" variant="ghost" onClick={() => setDraft((arr) => arr.filter((_, i) => i !== idx))} className="gap-1">
                  <Trash2 className="w-3 h-3" /> Remove
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setDraft((arr) => [...arr, { id: `okr-${Date.now()}`, objective: '', keyResults: [], quarter: '2026-Q2' }])
              }
              className="gap-1"
            >
              <Plus className="w-3 h-3" /> Add OKR
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
            <Button onClick={save} disabled={update.isPending}>
              {update.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function PositioningCard({ profile }: { profile: BrandIqProfile }) {
  const j = profile.jtbdForces;
  const cl = profile.customerLanguage;
  const hasJtbd = !!j && (j.push.length || j.pull.length || j.habit.length || j.anxiety.length);
  const hasCl = !!cl && (cl.problemPhrases.length || cl.solutionPhrases.length || cl.wordsToUse.length);
  const hasAnti = profile.antiPersonas.length > 0;
  const hasObj = profile.objections.length > 0;

  if (!hasJtbd && !hasCl && !hasAnti && !hasObj) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="w-4 h-4 text-primary" /> Positioning &amp; messaging
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground italic text-xs">
            Not extracted yet. Regenerate with a richer source (an About page + a sales/FAQ doc) to
            capture why customers switch, their verbatim language, who is not a fit, and objections.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Target className="w-4 h-4 text-primary" /> Positioning &amp; messaging
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Every agent reads this — why customers switch, their words, who is not a fit, and how to
          handle objections.
        </p>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {hasJtbd && j && (
          <div>
            <div className="text-xs font-semibold text-muted-foreground mb-1.5">Why customers switch (JTBD forces)</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {[
                { label: 'Push (away from old)', items: j.push },
                { label: 'Pull (toward us)', items: j.pull },
                { label: 'Habit (inertia)', items: j.habit },
                { label: 'Anxiety (switching fear)', items: j.anxiety },
              ]
                .filter((b) => b.items.length > 0)
                .map((b) => (
                  <div key={b.label} className="border rounded-lg p-2.5">
                    <div className="text-[11px] font-medium text-primary mb-1">{b.label}</div>
                    <ul className="text-xs list-disc list-inside text-muted-foreground space-y-0.5">
                      {b.items.map((it, i) => <li key={i}>{it}</li>)}
                    </ul>
                  </div>
                ))}
            </div>
          </div>
        )}

        {hasCl && cl && (
          <div className="space-y-2">
            <div className="text-xs font-semibold text-muted-foreground">Customer language (mirrored verbatim)</div>
            {cl.problemPhrases.length > 0 && (
              <div><span className="text-xs text-muted-foreground">Problem (their words): </span><ChipList items={cl.problemPhrases} /></div>
            )}
            {cl.solutionPhrases.length > 0 && (
              <div><span className="text-xs text-muted-foreground">Outcome (their words): </span><ChipList items={cl.solutionPhrases} /></div>
            )}
            {cl.wordsToUse.length > 0 && (
              <div><span className="text-xs text-muted-foreground">Words to use: </span><ChipList items={cl.wordsToUse} /></div>
            )}
            {cl.wordsToAvoid.length > 0 && (
              <div><span className="text-xs text-muted-foreground">Words to avoid: </span><ChipList items={cl.wordsToAvoid} /></div>
            )}
            {cl.glossary.length > 0 && (
              <ul className="text-xs text-muted-foreground list-disc list-inside">
                {cl.glossary.map((g, i) => <li key={i}><strong>{g.term}</strong>: {g.definition}</li>)}
              </ul>
            )}
          </div>
        )}

        {hasAnti && (
          <div>
            <div className="text-xs font-semibold text-muted-foreground mb-1.5">Not a fit (won&apos;t be targeted)</div>
            <ul className="text-xs space-y-1">
              {profile.antiPersonas.map((a, i) => (
                <li key={i} className="border rounded-lg p-2"><strong>{a.name}</strong> — <span className="text-muted-foreground">{a.whyNotFit}</span></li>
              ))}
            </ul>
          </div>
        )}

        {hasObj && (
          <div>
            <div className="text-xs font-semibold text-muted-foreground mb-1.5">Objections → response</div>
            <ul className="text-xs space-y-1">
              {profile.objections.map((o, i) => (
                <li key={i} className="border rounded-lg p-2">
                  <div className="font-medium">“{o.objection}”</div>
                  <div className="text-muted-foreground mt-0.5">→ {o.response}</div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ─── Page entry ─────────────────────────────────────────────────── */

export default function BrandIqPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const { data: profile, isLoading } = useBrandIq(companyId);
  const [regenerating, setRegenerating] = useState(false);

  if (isLoading) {
    return (
      <div className="py-20 text-center text-sm text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-3" /> Loading Brand IQ…
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto p-1">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-primary" /> Brand IQ
        </h1>
        <p className="text-muted-foreground text-sm">
          One source of truth for voice, audience, positioning, style, visual identity, and OKRs.
          Now captures why customers switch (JTBD), their verbatim language, who is not a fit, and
          objection handling — every agent reads this before writing anything for you.
        </p>
      </div>

      {!profile && !regenerating && <SetupWizard companyId={companyId} onDone={() => {}} />}

      {regenerating && profile && (
        <SetupWizard
          companyId={companyId}
          onDone={() => setRegenerating(false)}
          initialUrl={profile.sourceUrl ?? ''}
          initialSamples={profile.sourceSamples}
          title="Regenerate Brand IQ"
        />
      )}

      {profile && !regenerating && (
        <>
          <Card className="border-emerald-200 bg-emerald-50/40">
            <CardContent className="p-4 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span className="font-medium">Active — version {profile.version}</span>
                <span className="text-muted-foreground">
                  · {profile.generatedBy === 'manual' ? 'manually edited' : 'AI-generated'}
                  · last updated {new Date(profile.updatedAt).toLocaleDateString()}
                </span>
              </div>
              <Button variant="outline" size="sm" onClick={() => setRegenerating(true)} className="gap-1">
                <RefreshCw className="w-3 h-3" /> Regenerate from new inputs
              </Button>
            </CardContent>
          </Card>

          {profile.tagline && (
            <Card>
              <CardContent className="p-5">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Tagline</div>
                <div className="text-xl font-semibold mt-1">{profile.tagline}</div>
              </CardContent>
            </Card>
          )}

          <VoiceCard profile={profile} companyId={companyId} />
          <PersonasCard profile={profile} />
          <PositioningCard profile={profile} />
          <StyleCard profile={profile} />
          <VisualCard profile={profile} />
          <OkrsCard profile={profile} companyId={companyId} />
        </>
      )}
    </div>
  );
}
