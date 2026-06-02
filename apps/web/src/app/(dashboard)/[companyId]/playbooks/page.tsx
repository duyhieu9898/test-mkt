'use client';

/**
 * Marketing Playbooks Studio (P6) — invoke any of the 41 expert marketing
 * playbooks (adapted from the marketingskills library, MIT). Each run applies
 * the senior-practitioner framework to YOUR Brand IQ + business context and
 * returns a ready-to-use deliverable.
 */
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Sparkles, Loader2, Wand2, Copy, Check, BookOpen } from 'lucide-react';
import {
  useSkillCatalog,
  useRunSkill,
  type SkillCatalogEntry,
  type RunSkillResult,
} from '@/lib/api/marketing-skills-hooks';

function skillLabel(name: string): string {
  const special: Record<string, string> = {
    'ai-seo': 'AI SEO (GEO)',
    cro: 'CRO',
    aso: 'ASO',
    sms: 'SMS',
    revops: 'RevOps',
    'ab-testing': 'A/B Testing',
  };
  return special[name] ?? name.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

export default function PlaybooksPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const { data: catalog, isLoading } = useSkillCatalog();
  const run = useRunSkill(companyId);

  const [active, setActive] = useState<SkillCatalogEntry | null>(null);
  const [request, setRequest] = useState('');
  const [result, setResult] = useState<RunSkillResult | null>(null);
  const [copied, setCopied] = useState(false);

  const open = (skill: SkillCatalogEntry) => {
    setActive(skill);
    setRequest('');
    setResult(null);
  };

  const doRun = async () => {
    if (!active || request.trim().length < 3) return;
    try {
      const res = await run.mutateAsync({ skill: active.name, request: request.trim() });
      setResult(res);
    } catch (e) {
      toast.error((e as Error).message || 'Run failed');
    }
  };

  const copyOut = () => {
    if (!result) return;
    navigator.clipboard.writeText(result.output);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const total = catalog?.reduce((n, g) => n + g.items.length, 0) ?? 0;

  return (
    <div className="space-y-6 max-w-5xl mx-auto p-1">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BookOpen className="w-6 h-6 text-primary" /> Marketing Playbooks
        </h1>
        <p className="text-muted-foreground text-sm">
          {total > 0 ? `${total} ` : ''}expert marketing playbooks you can run on demand. Pick one,
          describe what you need, and get a deliverable written with a senior practitioner&apos;s
          framework — automatically grounded in your Brand IQ voice + audience.
        </p>
      </div>

      {isLoading && (
        <div className="py-16 text-center text-sm text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" /> Loading playbooks…
        </div>
      )}

      {catalog?.map((group) => (
        <div key={group.category} className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            {group.category} <span className="text-muted-foreground/60">({group.items.length})</span>
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {group.items.map((s) => (
              <button
                key={s.name}
                onClick={() => open(s)}
                className="text-left border rounded-lg p-3 hover:shadow-sm hover:border-primary/40 transition-all bg-card"
              >
                <div className="flex items-center gap-2 mb-1">
                  <Sparkles className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span className="font-medium text-sm">{skillLabel(s.name)}</span>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-3">{s.summary}</p>
              </button>
            ))}
          </div>
        </div>
      ))}

      <Dialog open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wand2 className="w-4 h-4 text-primary" /> {active ? skillLabel(active.name) : ''}
            </DialogTitle>
            <DialogDescription>{active?.summary}</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Textarea
              value={request}
              onChange={(e) => setRequest(e.target.value)}
              placeholder={'Describe what you need. e.g. "Write a 5-email welcome sequence for new trial users" or "Audit my pricing page for conversion".'}
              rows={3}
            />
            <Button onClick={doRun} disabled={run.isPending || request.trim().length < 3} className="gap-1">
              {run.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
              Run playbook
            </Button>

            {result && (
              <div className="border rounded-lg">
                <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/40">
                  <span className="text-xs font-medium flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-primary" /> {result.skillLabel} output
                  </span>
                  <Button size="sm" variant="ghost" onClick={copyOut} className="gap-1 h-7">
                    {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                </div>
                <div className="p-3 max-h-[50vh] overflow-y-auto">
                  <pre className="whitespace-pre-wrap text-xs leading-relaxed font-sans">{result.output}</pre>
                </div>
              </div>
            )}

            {!result && (
              <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Badge variant="outline" className="text-[10px]">Brand IQ aware</Badge>
                Output uses your saved voice, audience, and positioning automatically.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
