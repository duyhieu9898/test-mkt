'use client';

/**
 * Campaign Launcher — Block 8.
 *
 * Wizard at the top (keyword + targets) -> kick off a launch. Below:
 * live progress for the latest launch + a collapsible history.
 *
 * The launcher is the single "one-click" surface for the founder: pick
 * a keyword, choose where to publish, get blog + images + WordPress
 * draft + social drafts + GEO seed in one go.
 */

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Rocket,
  Loader2,
  CheckCircle2,
  Circle,
  AlertTriangle,
  XCircle,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Image as ImageIcon,
  Sparkles,
  FileEdit,
} from 'lucide-react';
import {
  useLaunches,
  useLaunch,
  useStartLaunch,
  type LaunchStep,
  type LaunchStepStatus,
  type CampaignLaunch,
} from '@/lib/api/launches-hooks';
import { useBrandIq } from '@/lib/api/brand-iq-hooks';

const STATUS_ICON: Record<LaunchStepStatus, { icon: typeof CheckCircle2; color: string }> = {
  pending: { icon: Circle, color: 'text-slate-300' },
  running: { icon: Loader2, color: 'text-blue-500 animate-spin' },
  done: { icon: CheckCircle2, color: 'text-emerald-600' },
  skipped: { icon: AlertTriangle, color: 'text-amber-500' },
  error: { icon: XCircle, color: 'text-rose-600' },
};

function StepRow({ step }: { step: LaunchStep }) {
  const [open, setOpen] = useState(false);
  const meta = STATUS_ICON[step.status];
  const Icon = meta.icon;
  const hasDetail = !!step.result || !!step.error || !!step.message;
  return (
    <div className="border-l-2 pl-3 py-1.5" style={{ borderColor: step.status === 'done' ? '#10b98180' : step.status === 'error' ? '#e11d4880' : '#e2e8f0' }}>
      <button
        className="flex items-start gap-2 text-left w-full"
        onClick={() => hasDetail && setOpen(!open)}
      >
        <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${meta.color}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{step.label}</span>
            <Badge variant="outline" className="text-[10px] capitalize">
              {step.status}
            </Badge>
            {hasDetail && (open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />)}
          </div>
          {step.message && <p className="text-xs text-muted-foreground mt-0.5">{step.message}</p>}
          {step.error && <p className="text-xs text-rose-600 mt-0.5">{step.error}</p>}
        </div>
      </button>
      {open && step.result && (
        <div className="mt-1.5 ml-6 bg-muted/40 rounded p-2 text-xs">
          <pre className="whitespace-pre-wrap break-words">{JSON.stringify(step.result, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}

function LaunchProgress({ launch }: { launch: CampaignLaunch }) {
  const wpStep = launch.steps.find((s) => s.key === 'wordpress');
  const wpUrl = (wpStep?.result?.wpUrl as string | undefined) ?? null;

  const inContentUrls = (launch.steps.find((s) => s.key === 'images')?.result?.inContentUrls as string[] | undefined) ?? [];
  const allImages = [launch.heroImageUrl, ...inContentUrls].filter(Boolean) as string[];

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Rocket className="w-4 h-4 text-primary" /> Launch · {launch.keyword}
          </CardTitle>
          <Badge
            variant="outline"
            className={
              launch.status === 'completed'
                ? 'border-emerald-300 text-emerald-700 bg-emerald-50'
                : launch.status === 'failed'
                  ? 'border-rose-300 text-rose-700 bg-rose-50'
                  : launch.status === 'partial'
                    ? 'border-amber-300 text-amber-700 bg-amber-50'
                    : 'border-blue-300 text-blue-700 bg-blue-50'
            }
          >
            {launch.status}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          Started {new Date(launch.createdAt).toLocaleString()}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1">
          {launch.steps.map((s) => (
            <StepRow key={s.key} step={s} />
          ))}
        </div>

        {allImages.length > 0 && (
          <div>
            <div className="text-xs font-semibold text-muted-foreground mb-1.5">Generated images</div>
            <div className="grid grid-cols-3 gap-2">
              {allImages.map((u) => (
                <a key={u} href={u} target="_blank" rel="noreferrer" className="block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u} alt="" className="w-full h-24 object-cover rounded border" />
                </a>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 flex-wrap pt-2 border-t">
          {launch.blogPostId && (
            <Badge variant="secondary" className="gap-1">
              <FileEdit className="w-3 h-3" /> Blog draft saved
            </Badge>
          )}
          {wpUrl && (
            <a href={wpUrl} target="_blank" rel="noreferrer">
              <Button size="sm" variant="outline" className="gap-1">
                Open on WordPress <ExternalLink className="w-3 h-3" />
              </Button>
            </a>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function LaunchPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const [keyword, setKeyword] = useState('');
  const [brief, setBrief] = useState('');
  const [targets, setTargets] = useState({
    wordpress: true,
    facebook: false,
    linkedin: true,
    instagram: false,
  });
  const [activeLaunchId, setActiveLaunchId] = useState<string | null>(null);

  const start = useStartLaunch(companyId);
  const list = useLaunches(companyId);
  const detail = useLaunch(companyId, activeLaunchId);
  const brandIq = useBrandIq(companyId);

  // When the list refreshes and we have no active launch, auto-pick the latest
  useEffect(() => {
    if (!activeLaunchId && list.data && list.data.length > 0) {
      setActiveLaunchId(list.data[0]!.id);
    }
  }, [activeLaunchId, list.data]);

  const submit = async () => {
    if (keyword.trim().length < 3) {
      toast.error('Keyword needs at least 3 characters');
      return;
    }
    try {
      const res = await start.mutateAsync({ keyword: keyword.trim(), brief: brief.trim() || undefined, targets });
      setActiveLaunchId(res.data.launchId);
      setKeyword('');
      setBrief('');
      toast.success('Launch queued. Watch the progress below.');
    } catch (e) {
      toast.error((e as Error).message || 'Failed to start launch');
    }
  };

  const noBrand = !brandIq.isLoading && !brandIq.data;

  return (
    <div className="space-y-6 max-w-3xl mx-auto p-1">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Rocket className="w-6 h-6 text-primary" /> Campaign Launcher
        </h1>
        <p className="text-muted-foreground text-sm">
          One keyword in, full multi-channel campaign out: blog + images + WordPress draft + social
          drafts + GEO tracking — orchestrated by your AI team.
        </p>
      </div>

      {noBrand && (
        <Card className="border-amber-200 bg-amber-50/40">
          <CardContent className="p-3 flex items-center gap-3 flex-wrap">
            <Sparkles className="w-5 h-5 text-amber-600 shrink-0" />
            <p className="text-sm text-amber-900 flex-1 min-w-[200px]">
              No Brand IQ profile yet — the launch will use generic AI tone. Set up Brand IQ first
              for on-brand output.
            </p>
            <Link href={`/${companyId}/brand-iq`}>
              <Button size="sm" variant="outline" className="gap-1">
                Set up Brand IQ
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Start a launch</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Target keyword</Label>
            <Input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="e.g. blockchain development services for enterprise"
              className="mt-1"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Pick the phrase a real buyer would search. This drives the blog topic + GEO tracking +
              hashtags.
            </p>
          </div>

          <div>
            <Label>Brief (optional)</Label>
            <Textarea
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              rows={3}
              placeholder="Specific angle, products to mention, audience..."
              className="mt-1"
            />
          </div>

          <div>
            <Label className="mb-2 block">Publish to</Label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { key: 'wordpress' as const, label: 'WordPress (draft)' },
                { key: 'linkedin' as const, label: 'LinkedIn (draft)' },
                { key: 'facebook' as const, label: 'Facebook (draft)' },
                { key: 'instagram' as const, label: 'Instagram (draft)' },
              ].map((t) => (
                <label
                  key={t.key}
                  className="flex items-center justify-between border rounded-lg p-2.5 cursor-pointer hover:bg-muted/40"
                >
                  <span className="text-sm">{t.label}</span>
                  <Switch
                    checked={targets[t.key]}
                    onCheckedChange={(v) => setTargets((s) => ({ ...s, [t.key]: v }))}
                  />
                </label>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
              All publishes go out as <em>drafts</em> — you review on each platform before they go
              live. WordPress requires credentials at{' '}
              <Link href={`/${companyId}/seo-engine`} className="text-primary underline">
                SEO Engine → WordPress connect
              </Link>
              .
            </p>
          </div>

          <Button onClick={submit} disabled={start.isPending} className="w-full gap-2">
            {start.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
            Launch campaign
          </Button>
        </CardContent>
      </Card>

      {detail.data && <LaunchProgress launch={detail.data} />}

      {list.data && list.data.length > 1 && (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground mb-2">Past launches</h2>
          <div className="space-y-1">
            {list.data
              .filter((l) => l.id !== activeLaunchId)
              .slice(0, 10)
              .map((l) => (
                <button
                  key={l.id}
                  onClick={() => setActiveLaunchId(l.id)}
                  className="w-full text-left border rounded-lg p-2 text-sm hover:bg-muted/40 flex items-center justify-between gap-2"
                >
                  <span className="truncate">{l.keyword}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className="text-[10px]">
                      {l.status}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(l.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
