'use client';

/**
 * Content Autopilot (P8) — set a keyword queue + cadence and the platform will
 * generate 1-2 SEO/GEO blog posts a day, publish them as WordPress drafts for
 * your approval, and seed GEO tracking. Built for non-tech founders: configure
 * once, review drafts in WordPress.
 */
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Rocket, Loader2, Play, CheckCircle2, Clock, AlertCircle, Sparkles, FileText,
} from 'lucide-react';
import {
  useAutopilot, useUpdateAutopilot, useRunAutopilotNow, type AutopilotTargets,
} from '@/lib/api/autopilot-hooks';

const PLATFORMS: { key: keyof AutopilotTargets; label: string }[] = [
  { key: 'wordpress', label: 'WordPress (blog draft)' },
  { key: 'linkedin', label: 'LinkedIn (draft)' },
  { key: 'facebook', label: 'Facebook (draft)' },
];

export default function AutopilotPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const { data, isLoading } = useAutopilot(companyId);
  const update = useUpdateAutopilot(companyId);
  const runNow = useRunAutopilotNow(companyId);

  const cfg = data?.config;
  const [postsPerDay, setPostsPerDay] = useState(1);
  const [targets, setTargets] = useState<AutopilotTargets>({ wordpress: true, facebook: false, linkedin: false, instagram: false });
  const [keywordsText, setKeywordsText] = useState('');

  useEffect(() => {
    if (cfg) {
      setPostsPerDay(cfg.postsPerDay);
      setTargets(cfg.targets);
      setKeywordsText(cfg.keywordQueue.join('\n'));
    }
  }, [cfg]);

  const parsedKeywords = keywordsText.split('\n').map((k) => k.trim()).filter(Boolean);

  const saveConfig = async (extra?: { enabled?: boolean }) => {
    try {
      await update.mutateAsync({
        postsPerDay,
        targets,
        keywordQueue: parsedKeywords,
        ...extra,
      });
      toast.success(extra?.enabled === true ? 'Autopilot turned on' : extra?.enabled === false ? 'Autopilot paused' : 'Saved');
    } catch (e) {
      toast.error((e as Error).message || 'Save failed');
    }
  };

  const toggleEnabled = async (on: boolean) => {
    if (on && parsedKeywords.length === 0) {
      toast.error('Add at least one topic before turning autopilot on.');
      return;
    }
    await saveConfig({ enabled: on });
  };

  const doRunNow = async () => {
    try {
      const r = await runNow.mutateAsync();
      toast.success(`Generating "${r.data.keyword}" — check History + WordPress in ~60s`);
    } catch (e) {
      toast.error((e as Error).message || 'Could not run');
    }
  };

  const statusIcon = (s: string) =>
    s === 'completed' ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
    : s === 'failed' ? <AlertCircle className="w-3.5 h-3.5 text-red-600" />
    : <Clock className="w-3.5 h-3.5 text-amber-600" />;

  if (isLoading) {
    return <div className="py-20 text-center text-sm text-muted-foreground"><Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" /> Loading autopilot…</div>;
  }

  const enabled = cfg?.enabled ?? false;

  return (
    <div className="space-y-6 max-w-3xl mx-auto p-1">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Rocket className="w-6 h-6 text-primary" /> Content Autopilot
        </h1>
        <p className="text-muted-foreground text-sm">
          Add your topics once and let the platform write 1-2 SEO + GEO blog posts a day in your
          Brand IQ voice, publish them as <strong>WordPress drafts</strong> for your review, and track
          them in AI search. You stay in control — nothing goes public until you approve in WordPress.
        </p>
      </div>

      {/* On/off + status */}
      <Card className={enabled ? 'border-emerald-300 bg-emerald-50/40' : ''}>
        <CardContent className="p-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Switch checked={enabled} onCheckedChange={toggleEnabled} disabled={update.isPending} />
            <div>
              <div className="font-medium text-sm">{enabled ? 'Autopilot is ON' : 'Autopilot is off'}</div>
              <div className="text-xs text-muted-foreground">
                {enabled
                  ? `Writing ${cfg?.postsPerDay}/day · ${cfg?.keywordQueue.length ?? 0} topics queued${cfg?.nextRunAt ? ` · next ~${new Date(cfg.nextRunAt).toLocaleString()}` : ''}`
                  : 'Turn on to start the daily schedule.'}
              </div>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={doRunNow} disabled={runNow.isPending} className="gap-1">
            {runNow.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} Run one now
          </Button>
        </CardContent>
      </Card>

      {/* Config */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Sparkles className="w-4 h-4 text-primary" /> Setup</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-sm">Posts per day</Label>
            <div className="flex gap-2 mt-1">
              {[1, 2].map((n) => (
                <Button key={n} size="sm" variant={postsPerDay === n ? 'default' : 'outline'} onClick={() => setPostsPerDay(n)}>
                  {n} / day
                </Button>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-sm">Publish to</Label>
            <div className="flex flex-col gap-2 mt-1">
              {PLATFORMS.map((p) => (
                <label key={p.key} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={targets[p.key]}
                    onCheckedChange={(v) => setTargets((t) => ({ ...t, [p.key]: !!v }))}
                  />
                  {p.label}
                </label>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              WordPress posts are created as <strong>drafts</strong>. Connect your site in{' '}
              <Link href={`/${companyId}/seo-engine`} className="text-primary underline">SEO Engine → WordPress</Link>.
            </p>
          </div>

          <div>
            <Label className="text-sm">Topics / keywords queue (one per line)</Label>
            <Textarea
              value={keywordsText}
              onChange={(e) => setKeywordsText(e.target.value)}
              rows={6}
              placeholder={'enterprise blockchain development services\nsmart contract audit checklist\nweb3 wallet integration guide'}
              className="mt-1 font-mono text-xs"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              {parsedKeywords.length} topic{parsedKeywords.length === 1 ? '' : 's'} queued. The autopilot writes one per run and rotates through the list.
            </p>
          </div>

          <Button onClick={() => saveConfig()} disabled={update.isPending} className="gap-1">
            {update.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Save setup
          </Button>
        </CardContent>
      </Card>

      {/* History */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><FileText className="w-4 h-4 text-primary" /> Recent posts</CardTitle></CardHeader>
        <CardContent>
          {!data?.history.length ? (
            <p className="text-sm text-muted-foreground italic">No autopilot posts yet. Hit <strong>Run one now</strong> to test, or turn autopilot on.</p>
          ) : (
            <ul className="space-y-2">
              {data.history.map((h) => (
                <li key={h.id} className="flex items-center justify-between gap-3 border rounded-lg p-2.5">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{h.keyword}</div>
                    <div className="text-[11px] text-muted-foreground">{new Date(h.createdAt).toLocaleString()}</div>
                  </div>
                  <Badge variant="outline" className="gap-1 capitalize shrink-0">{statusIcon(h.status)} {h.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
