'use client';

/**
 * Campaigns list — the "one button to generate" entry point (W1B.2).
 *
 * This is the home of the 1-click campaign flow. User fills in goal +
 * audience, clicks Generate, and is redirected to the detail page
 * which shows the live workflow panel.
 */

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Sparkles, Rocket, Loader2, Plus, Zap, Star, Gem, Brain, Users, Package, CheckCircle2, ArrowRight, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/auth-store';
import { api } from '@/lib/api/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { friendlyError } from '@/lib/friendly-errors';
import { GuidedTour } from '@/components/guided-tour';
import { OutOfCreditsModal } from '@/components/out-of-credits-modal';
import { cn } from '@/lib/utils';
import { campaignDisplayTitle } from '@/lib/campaign-title';
import { usePreferredAppLanguage } from '@/lib/use-preferred-app-language';
import {
  DriveSourcePicker,
  driveSourceRequestBody,
  type DriveSourceSelection,
} from '@/components/marketing/drive-source-picker';

type Tier = 'fast' | 'balanced' | 'premium';

const TIERS: { key: Tier; icon: typeof Zap; label: string; cost: number; desc: string }[] = [
  { key: 'fast', icon: Zap, label: 'Fast', cost: 5, desc: 'Quick draft' },
  { key: 'balanced', icon: Star, label: 'Balanced', cost: 5, desc: 'Recommended' },
  { key: 'premium', icon: Gem, label: 'Premium', cost: 5, desc: 'Best quality' },
];

interface CreditResponse {
  balance: { totalAvailable: number };
  costs?: {
    campaignGenerate?: Partial<Record<Tier, number>>;
    supportMessage?: string;
  };
}

interface CampaignRow {
  id: string;
  name: string;
  goal: string;
  platform: string;
  status: string;
  createdAt: string;
  targeting?: {
    source?: {
      requestedGoal?: unknown;
    };
  } | null;
}

const statusVariant: Record<string, string> = {
  planned: 'bg-slate-100 text-slate-700',
  generating: 'bg-indigo-100 text-indigo-700 animate-pulse',
  ready: 'bg-green-100 text-green-700',
  launching: 'bg-amber-100 text-amber-700',
  live: 'bg-emerald-100 text-emerald-700',
  optimizing: 'bg-blue-100 text-blue-700',
  failed: 'bg-red-100 text-red-700',
  completed: 'bg-slate-100 text-slate-600',
};

export default function CampaignsPage() {
  const params = useParams();
  const router = useRouter();
  const companyId = params.companyId as string;
  const token = useAuthStore((s) => s.token);
  const [language] = usePreferredAppLanguage('en');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [goal, setGoal] = useState('');
  const [audience, setAudience] = useState('');
  const [tier, setTier] = useState<Tier>('balanced');
  const [sourceSelection, setSourceSelection] = useState<DriveSourceSelection>({});
  const [submitting, setSubmitting] = useState(false);
  const [oocOpen, setOocOpen] = useState(false);
  const [oocReq, setOocReq] = useState<number | undefined>();
  const [oocAvail, setOocAvail] = useState<number | undefined>();
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['campaigns', companyId],
    queryFn: () =>
      api.get<{ data: CampaignRow[] }>(`/campaigns/${companyId}`, { token: token! }),
    enabled: !!token,
    refetchInterval: 5000,
  });

  const campaignList = data?.data ?? [];

  const { data: creditsData } = useQuery({
    queryKey: ['credits', companyId],
    queryFn: () => api.get<CreditResponse>(`/credits/${companyId}`, { token: token! }),
    enabled: !!token && !!companyId,
    staleTime: 30_000,
  });

  const selectedCreditCost =
    creditsData?.costs?.campaignGenerate?.[tier]
      ?? TIERS.find((item) => item.key === tier)?.cost
      ?? 5;
  const availableCredits = creditsData?.balance.totalAvailable;
  const hasEnoughCredits =
    typeof availableCredits !== 'number' || availableCredits >= selectedCreditCost;

  const onGenerate = async () => {
    if (!token) return;
    if (goal.trim().length < 3 || audience.trim().length < 3) {
      toast.error('Please describe your goal and who it is for.');
      return;
    }
    if (!hasEnoughCredits) {
      setOocReq(selectedCreditCost);
      setOocAvail(availableCredits);
      setDialogOpen(false);
      setOocOpen(true);
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post<{ campaignId: string; estimatedCost: number; tier: Tier }>(
        `/campaigns/${companyId}/generate`,
        {
          goal: goal.trim(),
          audience: audience.trim(),
          language,
          tier,
          ...driveSourceRequestBody(sourceSelection),
        },
        { token },
      );
      setDialogOpen(false);
      setGoal('');
      setAudience('');
      setSourceSelection({});
      queryClient.invalidateQueries({ queryKey: ['credits', companyId] });
      toast.success(
        `AI is building your campaign · estimated ${res.estimatedCost} credits`,
      );
      router.push(`/${companyId}/campaigns/${res.campaignId}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      const isCredits = /credit/i.test(msg) || /402/.test(msg);
      if (isCredits) {
        const m = msg.match(/need\s+(\d+)\s+credits?\s+but\s+only\s+have\s+(\d+)/i);
        if (m) {
          setOocReq(Number(m[1]));
          setOocAvail(Number(m[2]));
        } else {
          setOocReq(undefined);
          setOocAvail(undefined);
        }
        setDialogOpen(false);
        setOocOpen(true);
      } else {
        toast.error(friendlyError(err, "We couldn't start your campaign. Please try again."));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Rocket className="w-6 h-6 text-indigo-500" /> Campaigns
          </h1>
          <p className="text-sm text-slate-600 mt-1 max-w-2xl">
            Tell the AI your goal and audience — it will build a full campaign
            with banners and social posts. You watch every step happen in
            real time, then review and launch.
          </p>
        </div>
        <Button
          onClick={() => setDialogOpen(true)}
          data-tour="generate-campaign"
          className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2 w-full sm:w-auto"
        >
          <Sparkles className="w-4 h-4" /> Generate Campaign
        </Button>
      </div>

      {/* Business Brain readiness — the unified flow preview.
          Tells the user what the AI knows about their business before
          they click Generate. If Brain is empty, offers a 1-click
          auto-extract from the crawled context. */}
      <BrainReadinessBanner companyId={companyId} token={token} />

      <div className="grid gap-3">
        {isLoading ? (
          <div className="space-y-3">
            <div className="h-20 bg-slate-100 rounded-lg animate-pulse" />
            <div className="h-20 bg-slate-100 rounded-lg animate-pulse" />
            <div className="h-20 bg-slate-100 rounded-lg animate-pulse" />
          </div>
        ) : isError && !data ? (
          <Card className="border-red-200 bg-red-50/60">
            <CardContent className="p-6 flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
                <div>
                  <div className="font-semibold text-slate-900">Campaigns could not be loaded</div>
                  <p className="text-sm text-slate-600 mt-0.5">
                    {friendlyError(error, 'Please check your connection and try again.')}
                  </p>
                </div>
              </div>
              <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
                {isFetching && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Try again
              </Button>
            </CardContent>
          </Card>
        ) : campaignList.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <div className="w-16 h-16 rounded-full bg-indigo-50 flex items-center justify-center mx-auto mb-4">
                <Rocket className="w-8 h-8 text-indigo-500" />
              </div>
              <h3 className="font-semibold text-slate-900 mb-1">No campaigns yet</h3>
              <p className="text-sm text-slate-600 mb-4 max-w-xs mx-auto">
                AI will build your first campaign from your brand. Banners, social posts, ads — all in one click.
              </p>
              <Button
                onClick={() => setDialogOpen(true)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2"
              >
                <Sparkles className="w-4 h-4" /> Create your first campaign
              </Button>
            </CardContent>
          </Card>
        ) : (
          campaignList.map((c) => {
            const title = campaignDisplayTitle(c);
            return (
              <Card
                key={c.id}
                className="cursor-pointer hover:border-indigo-300 transition-colors"
                onClick={() => router.push(`/${companyId}/campaigns/${c.id}`)}
              >
              <CardContent className="p-4 flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <h3 className="min-w-0 flex-1 break-words font-semibold leading-snug text-slate-900" title={title}>
                      {title}
                    </h3>
                    <Badge className={`mt-0.5 shrink-0 ${statusVariant[c.status] || 'bg-slate-100 text-slate-600'}`}>
                      {c.status}
                    </Badge>
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    Goal: {c.goal} · Platform: {c.platform} ·{' '}
                    {new Date(c.createdAt).toLocaleString()}
                  </div>
                </div>
              </CardContent>
              </Card>
            );
          })
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-500" /> Generate a Campaign
            </DialogTitle>
            <DialogDescription>
              Tell the AI what you want. It will use your brand, products,
              and audience info to build everything automatically.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="goal" className="mb-1.5 block">
                What's the goal?
              </Label>
              <Input
                id="goal"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="e.g. Drive traffic to our new product launch"
              />
            </div>
            <div>
              <Label htmlFor="audience" className="mb-1.5 block">
                Who is it for?
              </Label>
              <Textarea
                id="audience"
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                placeholder="e.g. Small business owners in Southeast Asia who sell on Shopify"
                rows={3}
              />
            </div>

            <DriveSourcePicker
              companyId={companyId}
              token={token}
              value={sourceSelection}
              onChange={setSourceSelection}
              description="Add campaign notes, product docs, offers, or positioning files so the AI can match your intent more closely."
            />

            <div>
              <Label className="mb-1.5 block">How fancy?</Label>
              <div className="grid grid-cols-3 gap-2">
                {TIERS.map((t) => {
                  const Icon = t.icon;
                  const active = tier === t.key;
                  return (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => setTier(t.key)}
                      className={cn(
                        'rounded-lg border-2 p-3 text-left transition-all',
                        active
                          ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200'
                          : 'border-slate-200 hover:border-slate-300',
                      )}
                    >
                      <div className="flex items-center gap-1.5">
                        <Icon
                          className={cn(
                            'w-4 h-4',
                            active ? 'text-indigo-600' : 'text-slate-500',
                          )}
                        />
                        <span className="text-sm font-semibold text-slate-900">
                          {t.label}
                        </span>
                        {active && <span className="text-indigo-600 text-xs ml-auto">✓</span>}
                      </div>
                      <div className="text-xs text-slate-600 mt-1">
                        ~{creditsData?.costs?.campaignGenerate?.[t.key] ?? t.cost} credits
                      </div>
                      <div className="text-[11px] text-slate-500">{t.desc}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={onGenerate}
              disabled={submitting || !hasEnoughCredits}
              title={!hasEnoughCredits ? 'Not enough credits. Contact support to add more.' : undefined}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" /> Starting…
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" /> Generate · {selectedCreditCost} credits
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <OutOfCreditsModal
        open={oocOpen}
        onClose={() => setOocOpen(false)}
        required={oocReq}
        available={oocAvail}
      />

      <GuidedTour />
    </div>
  );
}

// ============================================================
// BRAIN READINESS BANNER
// Shows the user what the AI already knows about their business
// and offers a 1-click re-crawl if the Brain is empty.
// ============================================================

interface BrainSnapshot {
  brandVoice: { tone: string; description: string } | null;
  primaryPersona: { name: string; description?: string | null } | null;
  personas: Array<{ id: string; name: string; isPrimary: boolean }>;
  products: Array<{ id: string; name: string }>;
}

function BrainReadinessBanner({
  companyId,
  token,
}: {
  companyId: string;
  token: string | null;
}) {
  const qc = useQueryClient();
  const [extracting, setExtracting] = useState(false);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery<BrainSnapshot>({
    queryKey: ['brain-snapshot', companyId],
    queryFn: () => api.get<BrainSnapshot>(`/brain/${companyId}`, { token: token! }),
    enabled: !!token,
  });

  if (!token) return null;

  if (isLoading) {
    return (
      <div className="h-20 bg-slate-100 rounded-lg animate-pulse" />
    );
  }

  if (isError || !data) {
    return (
      <Card className="border-red-200 bg-red-50/60">
        <CardContent className="p-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
            <div>
              <div className="font-semibold text-slate-900">AI readiness could not be checked</div>
              <p className="text-xs text-slate-600 mt-0.5">
                {friendlyError(error, 'Your campaigns are still available. Try checking again.')}
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            {isFetching && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  const hasVoice = !!data.brandVoice;
  const hasPersona = !!data.primaryPersona || data.personas.length > 0;
  const hasProducts = data.products.length > 0;
  const isReady = hasVoice && (hasPersona || hasProducts);

  const onAutoExtract = async () => {
    if (!token) return;
    setExtracting(true);
    try {
      const res = await api.post<{
        brandVoice: boolean;
        personas: number;
        products: number;
      }>(`/brain/${companyId}/autoextract`, {}, { token });
      if (res.brandVoice) {
        toast.success(
          `Brain ready — ${res.personas} persona, ${res.products} products extracted`,
        );
        qc.invalidateQueries({ queryKey: ['brain-snapshot', companyId] });
      } else {
        toast.error(
          "Couldn't extract from your site yet. Open the Brain tab and fill it in manually.",
        );
      }
    } catch (err) {
      toast.error(
        friendlyError(err, 'We could not scan your site. Please try again or edit the Brain manually.'),
      );
    } finally {
      setExtracting(false);
    }
  };

  if (!isReady) {
    return (
      <Card className="border-amber-200 bg-amber-50/60">
        <CardContent className="p-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
              <Brain className="w-5 h-5 text-amber-700" />
            </div>
            <div>
              <div className="font-semibold text-slate-900">
                Teach your AI about your business first
              </div>
              <p className="text-xs text-slate-600 mt-0.5 max-w-lg">
                Your Business Brain is empty. The AI will use this to write your
                banners, posts, and ads. You can auto-extract it from your
                website in one click, or edit it manually.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm" className="h-9">
              <Link href={`/${companyId}/brain`}>
                <Brain className="w-4 h-4 mr-1.5" /> Edit manually
              </Link>
            </Button>
            <Button
              size="sm"
              onClick={onAutoExtract}
              disabled={extracting}
              className="h-9 bg-amber-600 hover:bg-amber-700 text-white"
            >
              {extracting ? (
                <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
              ) : (
                <Sparkles className="w-4 h-4 mr-1.5" />
              )}
              {extracting ? 'Scanning…' : 'Auto-extract from site'}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-indigo-200 bg-indigo-50/40">
      <CardContent className="p-4 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
            <Brain className="w-5 h-5 text-indigo-600" />
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-slate-900 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-green-600" /> Your AI is
              ready
            </div>
            <div className="text-xs text-slate-600 mt-0.5 flex flex-wrap gap-x-3 gap-y-1">
              {data.brandVoice && (
                <span className="inline-flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-indigo-500" />
                  Voice: <strong>{data.brandVoice.tone}</strong>
                </span>
              )}
              {data.primaryPersona && (
                <span className="inline-flex items-center gap-1">
                  <Users className="w-3 h-3 text-indigo-500" />
                  Persona:{' '}
                  <strong className="truncate max-w-[200px]">
                    {data.primaryPersona.name}
                  </strong>
                </span>
              )}
              {data.products.length > 0 && (
                <span className="inline-flex items-center gap-1">
                  <Package className="w-3 h-3 text-indigo-500" />
                  <strong>{data.products.length}</strong>{' '}
                  {data.products.length === 1 ? 'product' : 'products'}
                </span>
              )}
            </div>
          </div>
        </div>
        <Button asChild variant="ghost" size="sm" className="h-9 text-indigo-600">
          <Link href={`/${companyId}/brain`}>
            Edit Brain <ArrowRight className="w-3.5 h-3.5 ml-1" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
